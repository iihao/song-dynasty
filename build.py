#!/usr/bin/env python3
"""构建可公网部署的静态站点（dist/）。

    python3 build.py                                  # 本地预览
    python3 build.py --base-url https://song.example.com

思路：数据库只在构建期存在。seed.json / wiki_cache.json 是唯一内容源，
构建时生成 SQLite（临时文件）→ 导出 JSON 与预渲染 HTML → dist/ 纯静态，
直接交给 CDN / 对象存储 / nginx，公网不需要运行 Python，也没有可被穿越的
文件服务。

产物：
    dist/index.html                 单页应用（资产版本自动指纹化）
    dist/css/style.css  dist/js/app.js
    dist/api/bootstrap.json         首屏全量数据
    dist/api/items/<id>.json        单条详情（含维基富化）
    dist/item/<id>.html             每条一页，可被搜索引擎收录
    dist/sitemap.xml  dist/robots.txt  dist/404.html  dist/_headers
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile
from html import escape
from urllib.parse import quote

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "server"))
sys.path.insert(0, os.path.join(ROOT, "db"))

import app as api        # noqa: E402  server/app.py：动态服务的同一套 JSON 组装逻辑
import init_db           # noqa: E402  db/init_db.py：seed.json → SQLite

ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


# ---------------------------------------------------------------- 工具
def read(path):
    with open(path, "rb") as f:
        return f.read()


def write_text(path, text):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def write_json(path, obj):
    write_text(path, json.dumps(obj, ensure_ascii=False, separators=(",", ":")))


def asset_hash(*paths):
    h = hashlib.sha1()
    for p in paths:
        h.update(read(p))
    return h.hexdigest()[:8]


def rel_name(item_id):
    return quote(item_id, safe="")


# ---------------------------------------------------------------- 数据
def build_db(tmpdir, seed_path):
    if not os.path.exists(seed_path):
        sys.exit(f"种子文件不存在：{seed_path}")
    conn = sqlite3.connect(os.path.join(tmpdir, "song.db"))
    conn.row_factory = sqlite3.Row
    init_db.build(conn, init_db.load_seed(seed_path))
    return conn


def check_integrity(conn):
    """构建期做一次数据体检：脏数据不应该被发布出去。"""
    problems = []
    ids = {r[0] for r in conn.execute("SELECT id FROM items")}
    for item_id, related in conn.execute("SELECT item_id, related_id FROM item_relations"):
        if related not in ids:
            problems.append(f"关联悬空：{item_id} → {related}")
    for item_id in ids:
        if not ID_RE.match(item_id):
            problems.append(f"id 含不安全字符（无法做文件名/URL）：{item_id!r}")
    bad_cat = conn.execute(
        "SELECT id FROM items WHERE category_id NOT IN (SELECT id FROM categories)").fetchall()
    for r in bad_cat:
        problems.append(f"分类不存在：{r[0]}")
    for r in conn.execute("SELECT id, year FROM items WHERE category_id='timeline' AND year IS NULL"):
        problems.append(f"年表条目缺 year：{r[0]}")
    return problems


# ---------------------------------------------------------------- 页面
WIKI_HEADING = re.compile(r"^=+.*=+$")


def paragraphs(text):
    out = []
    for line in (text or "").split("\n"):
        line = line.strip()
        if line and not WIKI_HEADING.match(line):
            out.append("<p>%s</p>" % escape(line))
    return "".join(out)


def safe_url(url):
    url = (url or "").strip()
    return url if re.match(r"^https?://", url, re.I) else ""


def year_label(it):
    y, e = it.get("year"), it.get("endYear")
    if y is None:
        return ""
    return f"{y}–{e}" if e and e != y else str(y)


def item_page(it, cat_name, base_url):
    fid = rel_name(it["id"])
    canonical = f"{base_url}/item/{fid}.html" if base_url else f"../item/{fid}.html"
    name = escape(it["name"])
    desc = escape((it.get("summary") or "").replace("\n", " ").strip())
    cat = escape(cat_name)
    typ = escape(it.get("type") or "")

    sub = " · ".join(x for x in [
        escape(it.get("era") or ""), typ,
        (year_label(it) + " 年") if it.get("year") is not None else "",
        (f"生卒 {it['birth'] or '?'}—{it['death'] or '?'}"
         if it.get("birth") is not None or it.get("death") is not None else ""),
    ] if x)

    tags = ""
    if it.get("era"):
        tags += '<span class="tag era">%s</span>' % escape(it["era"])
    tags += "".join('<span class="tag grp">%s</span>' % escape(g) for g in it.get("groups") or [])
    tags += "".join('<span class="tag">%s</span>' % escape(t) for t in it.get("tags") or [])

    wiki = ""
    sources = it.get("sources") or []
    src = sources[0] if sources else None
    if src and src.get("extract"):
        url = safe_url(src.get("url"))
        badge = "维基百科" if src.get("source") == "wikipedia" else escape(src.get("source") or "")
        credit = "《%s》" % escape(src.get("title") or "")
        if url:
            credit = '<a href="%s" rel="nofollow noopener">%s</a>' % (escape(url), credit)
        extra = escape(src.get("license") or "CC BY-SA 4.0")
        if src.get("revision_id"):
            extra += " · 修订 " + escape(str(src["revision_id"]))
        if src.get("fetched_at"):
            extra += " · 抓取于 " + escape(src["fetched_at"][:10])
        wiki = ('<div class="m-wiki"><h3>百科条目 <span class="src-badge">%s</span></h3>%s'
                '<div class="m-license">来源：%s · %s</div></div>'
                % (badge, paragraphs(src["extract"]), credit, extra))

    related = "".join(
        '<a class="chip" href="%s.html">%s</a>' % (rel_name(r["id"]), escape(r["name"]))
        for r in (it.get("related") or []) if isinstance(r, dict)
    )

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{name} · {cat} · 大宋全局志</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{escape(canonical)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="大宋全局志">
<meta property="og:title" content="{name}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{escape(canonical)}">
<link rel="stylesheet" href="../css/style.css">
</head>
<body>
<header class="topbar">
  <a class="brand" href="../index.html"><span class="seal">宋</span>
    <span class="brand-text"><strong>大宋全局志</strong>
    <small>SONG DYNASTY ATLAS · 960—1279</small></span></a>
  <nav class="mainnav"><a href="../index.html#browse">典藏</a>
    <a href="../index.html#timeline">年表</a>
    <a href="../index.html#people">人物</a>
    <a href="../index.html#data">数据</a></nav>
</header>
<main>
<section class="view active">
  <div class="wrap narrow">
    <div class="page-head compact">
      <p class="eyebrow">{cat}{(" · " + typ) if typ else ""}</p>
      <h1>{name}</h1>
      <p class="m-sub">{sub}</p>
    </div>
    <div class="modal-body">
      <div class="m-tags">{tags}</div>
      <div class="m-detail">{escape(it.get("detail") or it.get("summary") or "")}</div>
      {wiki}
      <div class="m-links"><span>外部链接</span>
        <a href="https://zh.wikipedia.org/wiki/Special:Search?search={quote(it["name"])}"
           rel="nofollow noopener">维基百科</a>
        <a href="https://baike.baidu.com/search/word?word={quote(it["name"])}"
           rel="nofollow noopener">百度百科</a></div>
      {('<div class="m-rel">%s</div>' % related) if related else ""}
      {('<div class="m-refs"><b>参考</b><br>%s</div>' % escape(it["refs"])) if it.get("refs") else ""}
      <p style="margin-top:30px"><a href="../index.html#item/{fid}">在主站中打开 →</a></p>
    </div>
  </div>
</section>
</main>
</body>
</html>
"""


NOT_FOUND = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>页面不存在 · 大宋全局志</title>
<link rel="stylesheet" href="%(css)s"></head>
<body><main><section class="view active"><div class="wrap narrow">
<div class="page-head"><p class="eyebrow">404</p><h1>此页不在志中</h1>
<p>要查的条目可能已经改名或被移除。</p></div>
<p><a class="btn primary" href="%(root)s">回到总览</a></p>
</div></section></main></body></html>
"""


def not_found(base_url):
    # 子路径部署（如 GitHub Pages 的 /song-dynasty/）下，绝对路径 / 会跑到域名根目录
    root = (base_url + "/") if base_url else "/"
    css = (base_url + "/css/style.css") if base_url else "/css/style.css"
    return NOT_FOUND % {"css": escape(css), "root": escape(root)}

HEADERS = """/css/*
  Cache-Control: public, max-age=31536000, immutable
/js/*
  Cache-Control: public, max-age=31536000, immutable

/api/*
  Cache-Control: public, max-age=300
  Vary: Accept-Encoding
/item/*
  Cache-Control: public, max-age=600

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: SAMEORIGIN
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'
"""


# ---------------------------------------------------------------- 主流程
def main():
    ap = argparse.ArgumentParser(description="构建静态站点到 dist/")
    ap.add_argument("--seed", default=os.path.join(ROOT, "db", "seed.json"))
    ap.add_argument("--out", default=os.path.join(ROOT, "dist"))
    ap.add_argument("--base-url", default="",
                    help="站点根地址，用于 canonical / sitemap，如 https://song.example.com")
    ap.add_argument("--strict", action="store_true",
                    help="数据体检发现问题时以非零状态退出（CI 用）")
    ap.add_argument("--no-clean", dest="clean", action="store_false",
                    help="保留输出目录中已存在的旧文件（默认先清空）")
    args = ap.parse_args()

    base_url = args.base_url.rstrip("/")
    out = os.path.abspath(args.out)

    with tempfile.TemporaryDirectory() as tmp:
        conn = build_db(tmp, args.seed)
        try:
            problems = check_integrity(conn)
            boot = api.bootstrap(conn)
            cat_names = {c["id"]: c["name"] for c in boot["categories"]}
            details = {it["id"]: api.item_detail(conn, it["id"]) for it in boot["items"]}
        finally:
            conn.close()

    if args.clean and os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out, exist_ok=True)

    # 静态资源
    shutil.copytree(os.path.join(ROOT, "css"), os.path.join(out, "css"))
    shutil.copytree(os.path.join(ROOT, "js"), os.path.join(out, "js"))

    # 资产指纹：把 index.html 里手写的 ?v=N 换成内容哈希
    v_css = asset_hash(os.path.join(ROOT, "css", "style.css"))
    v_js = asset_hash(os.path.join(ROOT, "js", "app.js"))
    html = read(os.path.join(ROOT, "index.html")).decode("utf-8")
    html = re.sub(r"css/style\.css(\?v=[^\"]*)?", f"css/style.css?v={v_css}", html)
    html = re.sub(r"js/app\.js(\?v=[^\"]*)?", f"js/app.js?v={v_js}", html)
    write_text(os.path.join(out, "index.html"), html)

    # 数据
    write_json(os.path.join(out, "api", "bootstrap.json"), boot)
    for item_id, detail in details.items():
        write_json(os.path.join(out, "api", "items", rel_name(item_id) + ".json"), detail)

    # 预渲染条目页（hash 路由无法被搜索引擎单独收录，这里给每条一个真实 URL）
    for it in boot["items"]:
        page = item_page(details[it["id"]], cat_names.get(it["cat"], it["cat"]), base_url)
        write_text(os.path.join(out, "item", rel_name(it["id"]) + ".html"), page)

    # 站点附属文件
    # .nojekyll：GitHub Pages 不要走 Jekyll（否则 _headers 之类的文件会被吞）
    write_text(os.path.join(out, ".nojekyll"), "")
    write_text(os.path.join(out, "404.html"), not_found(base_url))
    write_text(os.path.join(out, "_headers"), HEADERS)
    write_text(os.path.join(out, "robots.txt"),
               "User-agent: *\nAllow: /\nDisallow: /api/\n"
               + (f"Sitemap: {base_url}/sitemap.xml\n" if base_url else ""))

    if base_url:
        urls = [f"{base_url}/"] + [
            f"{base_url}/item/{rel_name(it['id'])}.html" for it in boot["items"]]
        write_text(os.path.join(out, "sitemap.xml"),
                   '<?xml version="1.0" encoding="UTF-8"?>\n'
                   '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                   + "".join(f"  <url><loc>{escape(u)}</loc></url>\n" for u in urls)
                   + "</urlset>\n")
    else:
        print("⚠ 未指定 --base-url：跳过 sitemap.xml，canonical 使用相对地址")

    # 报告
    print(f"✓ 静态站点已生成：{out}")
    print(f"  条目 {len(boot['items'])} · 分类 {len(boot['categories'])} · 详情 {len(details)}"
          f" · 预渲染页 {len(boot['items'])}")
    print(f"  首屏数据 {len(read(os.path.join(out, 'api', 'bootstrap.json'))) / 1024:.0f} KB"
          f" · 资产指纹 css={v_css} js={v_js}")
    if problems:
        print(f"\n⚠ 数据体检发现 {len(problems)} 个问题：")
        for p in problems[:20]:
            print("  - " + p)
        if len(problems) > 20:
            print(f"  … 另有 {len(problems) - 20} 条")
        if args.strict:
            sys.exit("数据体检未通过（--strict）")
    print("\n公网部署：把 dist/ 整个目录上传到 CDN / 对象存储 / nginx 即可；"
          "不要把 server/app.py 暴露到公网。")


if __name__ == "__main__":
    main()

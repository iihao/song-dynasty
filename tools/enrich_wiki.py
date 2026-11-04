#!/usr/bin/env python3
"""用中文维基百科 / 维基数据富化条目。

策略：
  1. 由条目名生成候选标题（去书名号、去「宋太祖 赵匡胤」式前缀、去括号）
  2. 先批量精确查询候选标题；匹配不足再走搜索
  3. 只保存导言（exintro），截断到 3000 字，保留标题、URL、修订号、QID、许可
  4. 写入 db/wiki_cache.json 与 item_sources 表；不修改原创 summary/detail

用法：
  python3 tools/enrich_wiki.py --limit 20          # 试跑
  python3 tools/enrich_wiki.py                     # 全量（已缓存的跳过）
  python3 tools/enrich_wiki.py --refresh           # 重新抓取
  python3 tools/enrich_wiki.py --cat people        # 只做人物
  python3 tools/enrich_wiki.py --dry-run           # 只报告，不写库
"""
import argparse
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "db", "song.db")
CACHE = os.path.join(ROOT, "db", "wiki_cache.json")
REPORT = os.path.join(ROOT, "db", "wiki_report.json")
API = "https://zh.wikipedia.org/w/api.php"
UA = "SongAtlas/1.0 (local history research; https://localhost) python-urllib"
LICENSE = "CC BY-SA 4.0"
MAX_CHARS = 4000
SLEEP = 0.6
MIN_EXTRACT = 20

# 维基标题与本库名称不一致时的显式映射（可继续补充）
OVERRIDES = {
    "ppl-liue": "章献明肃皇后",
    "ppl-boyan": "伯颜 (八邻部)",
    "ppl-gaotaotao": "宣仁皇后",
    "ppl-xiaochuo": "萧绰",
    "lit-chibi-fu": "前赤壁赋",
    "tho-lixue": "宋明理学",
    "geo-ezhou": "鄂州 (古代)",
    "geo-guangzhou": "广州 (古代)",
    "geo-yangzhou": "扬州 (古代)",
    "geo-linan": "临安府 (浙江)",
    "geo-jiankang": "建康府",
    "geo-tanzhou": "潭州 (隋朝)",
    "cul-wanyue": "婉约派",
    "cul-haofang": "豪放派",
    "eco-chama": "茶马互市",
    "eco-buyijianbing": "土地兼并",
    "eco-caoshi": "草市",
    "eco-huizi": "会子",
    "cul-liao-wenzi": "契丹大字",
    "geo-kaifeng": "开封府",
    "cus-chuxi": "除夕",
    "cus-hunsu": "婚礼",
    "cus-jiaju": "家具",
    "cus-jiaozi": "轿",
    "cus-xiaochi": "小吃",
    "cus-jiu": "酒文化",
    "cus-jiaqi": "休假",
    "cus-yuanlin": "中国园林",
    "eco-yeshi": "夜市",
    "eco-caoyun": "漕运",
    "cus-washe": "瓦肆",
    "cus-qingming": "清明節",
    "cul-huaben": "话本",
    "cul-jianyao": "建窑",
    "cul-jingdezhen": "景德镇陶瓷",
    "tl-963": "荆南",
    "tl-liao-1122": "北辽",
    "tl-liao-916": "耶律阿保机",
    "tl-liao-926": "渤海国",
    "tl-liao-936": "燕云十六州",
    "tl-965": "宋灭后蜀之战",
    "tl-1012": "占城稻",
    "tl-1038": "西夏",
    "tl-1048": "李元昊",
    "tl-liao-1077": "耶律濬",
    "tl-1084": "资治通鉴",
    "tl-liao-1120": "上京临潢府",
    "tl-liao-1124": "耶律大石",
    "tl-1138": "临安府 (浙江)",
    "tl-liao-1218": "西辽",
    "tl-1227": "西夏",
    "tl-1234": "蔡州之战",
    "tl-1253": "蒙古灭大理之战",
    "mil-han": "韩世忠",
    "mil-diqing": "昆仑关",
    "tl-wd-907": "后梁",
    "tl-wd-954": "高平之战",
    "tl-wd-959": "柴荣",
    "tl-983": "太平御览",
    "tl-1023": "交子",
    "tl-1041b": "毕昇",
    "tl-1060": "新唐书",
    "tl-1079": "乌台诗案",
    "tl-1103": "营造法式",
    "tl-1147": "东京梦华录",
    "tl-1153": "金中都",
    "tl-1215": "金中都",
    "tl-1224": "霅川之变",
    "tl-1232": "三峰山之战",
    "tl-1247": "洗冤集录",
    "tl-1275": "丁家洲之战",
    "ppl-litang": "李唐 (宋朝)",
    "ppl-zhangyan": "張炎 (宋朝)",
    "ppl-wangweiyi": "王惟一 (医学家)",
    "ppl-hongzhizhengjue": "宏智正覺",
    "ppl-licheng": "李成 (五代)",
    "ppl-hangonglian": "韓公廉",
    "ppl-yangwujiu": "扬无咎",
    "ppl-yangshi": "楊時 (宋朝)",
    "soc-chanzu": "缠足",
    "tec-huoyao": "火药",
    "tec-diaoban": "雕版印刷",
    "soc-huozang": "火葬",
    "pol-liao-wolusuo": "斡耳朵",
    "ppl-zhaofujin": "茂德帝姬",
    "ppl-zhaomingcheng": "赵明诚",
    "geo-mingzhou": "宁波市",
    "geo-luoyang": "洛阳市",
    "pol-lu": "路 (行政区划)",
    "tho-zhedong": "浙东学派",
    "mil-chechuan": "外轮船",
}

# 这些条目与维基条目只是“大类相同”，宁可留空也不误导
SKIP_IDS = {
    "cul-liao-fojiao", "cul-liao-sancai", "cul-liao-ci",
    "eco-liao-nongye", "eco-liao-xumu", "eco-liao-yantie", "eco-liao-huobi",
    "cul-zaju", "soc-mengxue",
}


def clean_name(name):
    s = name.strip()
    s = re.sub(r"[《》〈〉]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s


def candidates(name):
    """生成候选维基标题，按可信度排序。"""
    raw = clean_name(name)
    out = []

    def add(x):
        x = re.sub(r"\s+", " ", str(x)).strip(" ·，,。；;：:（）()")
        if x and x not in out:
            out.append(x)

    add(raw)

    # 组合名拆分为单个概念：「点茶与斗茶」「太学与三舍法」「两餐到三餐」
    parts = [p for p in re.split(r"[，、；：·]|与|及|和|到", raw) if p.strip()]
    if len(parts) > 1:
        for p in parts:
            add(p)

    # 去朝代前缀：「宋代山水画」→ 山水画
    stripped = re.sub(r"^(北宋|南宋|两宋|宋代|辽代|金代|西夏|元代|唐代|五代)", "", raw)
    if stripped and stripped != raw:
        add(stripped)
        for p in re.split(r"[，、；：·]|与|及|和|到", stripped):
            add(p)

    # 去通用后缀：「书院教育」→ 书院；「印刷业」→ 印刷
    for suf in ("教育", "制度", "文化", "经济", "军事", "习俗", "风俗",
                "运动", "政策", "业", "制", "法", "派"):
        if raw.endswith(suf) and len(raw) > len(suf) + 1:
            add(raw[: -len(suf)])
        if stripped.endswith(suf) and len(stripped) > len(suf) + 1:
            add(stripped[: -len(suf)])

    # 书名号/事件后缀
    add(raw.strip("《》"))
    for suf in ("开始", "爆发", "建立", "之死", "被杀", "即位", "去世"):
        if raw.endswith(suf) and len(raw) > len(suf) + 1:
            add(raw[: -len(suf)])

    # 括号内别名
    m = re.match(r"^(.+?)[（(](.+?)[）)]$", raw)
    if m:
        add(m.group(1))
        add(m.group(2))

    return out


def norm(title):
    t = title.replace("_", " ").strip()
    t = re.sub(r"\s*[（(][^）)]*[）)]\s*$", "", t)
    return t


def cand_rank(title, cands):
    t = norm(title)
    for i, c in enumerate(cands):
        if t == norm(c):
            return i
    return 999


def score_title(title, cands):
    t = norm(title)
    best = 0.0
    for c in cands:
        c = norm(c)
        if not c:
            continue
        if t == c:
            return 1.0
        if title.startswith(c + " (") or title.startswith(c + "（"):
            best = max(best, 0.9)
        elif c in t and len(t) - len(c) <= 6:
            best = max(best, 0.82)
        elif t in c and len(c) - len(t) <= 6:
            best = max(best, 0.75)
        elif c in t:
            best = max(best, 0.62)
    if "消歧义" in title or "可以指" in title:
        best -= 0.5
    return max(0.0, best)


def extract_score(page, cands):
    """标题可能被转换为繁体，改用导言开头做简体匹配（只认开头，避免误配）。"""
    ex = (page.get("extract") or "").strip()
    head = re.sub(r"^[《〈（(【\[]+", "", ex)
    for c in cands:
        c = norm(c)
        if c and head.startswith(c):
            return 0.92
    return 0.0


def api(params):
    params = dict(params)
    params.setdefault("format", "json")
    params.setdefault("formatversion", "2")
    params.setdefault("redirects", "1")
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "application/json",
        "Accept-Encoding": "identity",
    })
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                wait = 15 * (attempt + 1)
                print(f"    429 限流，等待 {wait}s …")
                time.sleep(wait)
                continue
            if attempt == 4:
                raise
            time.sleep(2 * (attempt + 1))
        except Exception:  # noqa: BLE001
            if attempt == 4:
                raise
            time.sleep(2 * (attempt + 1))
    return {}


def page_props(full=False):
    props = {
        "action": "query",
        "prop": "extracts|pageprops|info",
        "explaintext": "1",
        "exchars": str(MAX_CHARS),
        "exlimit": "max",
        "inprop": "url",
        "redirects": "1",
        "variant": "zh-cn",
    }
    if not full:
        props["exintro"] = "1"
    return props


def get_by_titles(titles, full=False):
    if not titles:
        return []
    data = api(dict(page_props(full), titles="|".join(titles[:15])))
    pages = data.get("query", {}).get("pages", []) or []
    reds = data.get("query", {}).get("redirects", []) or []
    rmap = {r.get("to"): r.get("from") for r in reds}
    for p in pages:
        p["_redirect_from"] = rmap.get(p.get("title"))
    return pages


def search_pages(q, full=False):
    params = dict(page_props(full))
    params.update({"generator": "search", "gsrsearch": q, "gsrlimit": "5"})
    data = api(params)
    pages = data.get("query", {}).get("pages", []) or []
    order = {p.get("index", 99): p for p in pages}
    return [order[k] for k in sorted(order)]


def usable(page, cands, item):
    ex = (page.get("extract") or "").strip()
    if len(ex) < MIN_EXTRACT:
        return False, "extract too short"
    if "消歧义" in page.get("title", "") or "可以指" in ex[:120]:
        return False, "disambiguation"
    # 年代粗校验：人物生卒、事件年份都不在导言里，降权而非直接拒绝
    years = []
    if item.get("birth"):
        years.append(str(item["birth"]))
    if item.get("death"):
        years.append(str(item["death"]))
    if item.get("year"):
        years.append(str(item["year"]))
    if years and not any(y in ex[:600] for y in years):
        return True, "year-mismatch"
    return True, "ok"


def pick(pages, cands, item):
    best = None
    for p in pages:
        s = max(score_title(p.get("title", ""), cands), extract_score(p, cands))
        if score_title(p.get("title", ""), cands) >= 0.99:
            s += 0.04
        rf = norm(p.get("_redirect_from") or "")
        if rf and rf in [norm(c) for c in cands]:
            s = max(s, 0.95)
        ok, reason = usable(p, cands, item)
        if not ok:
            continue
        if s < 0.6:
            continue
        ex = (p.get("extract") or "").strip()
        if len(ex) < MIN_EXTRACT:
            continue
        s -= 0.08 if reason == "year-mismatch" else 0
        if item["category_id"] == "people" and any(
                k in p.get("title", "") for k in ("之战", "事件", "起义", "变法", "之乱", "之死", "案", "党", "军", "部")):
            s -= 0.25
        # 短条目不再额外扣分：精确标题优先于长度
        rank = cand_rank(p.get("title", ""), cands)
        if best is None or s > best[0] + 1e-6:
            best = (s, p, reason, rank)
        elif abs(s - best[0]) < 1e-6 and rank < best[3]:
            best = (s, p, reason, rank)
        elif abs(s - best[0]) < 1e-6 and rank == best[3] and len(ex) > len(best[1].get("extract") or ""):
            best = (s, p, reason, rank)
    return best


def record(item, page, conf, method, reason):
    ex = (page.get("extract") or "").strip()
    # 截断到自然段边界
    if len(ex) > MAX_CHARS:
        cut = ex[:MAX_CHARS]
        pos = max(cut.rfind("\n"), cut.rfind("。"))
        ex = (cut[: pos + 1] if pos > MAX_CHARS * 0.6 else cut).strip()
    qid = (page.get("pageprops") or {}).get("wikibase_item")
    return {
        "item_id": item["id"],
        "source": "wikipedia",
        "lang": "zh",
        "title": page.get("title"),
        "url": page.get("fullurl") or ("https://zh.wikipedia.org/wiki/" + urllib.parse.quote(page.get("title", ""))),
        "license": LICENSE,
        "revision_id": page.get("lastrevid"),
        "qid": qid,
        "confidence": round(min(conf, 1.0), 3),
        "match": method,
        "note": reason,
        "extract": ex,
        "fetched_at": datetime.now().isoformat(timespec="seconds"),
    }


def load_cache():
    if os.path.exists(CACHE):
        with open(CACHE, encoding="utf-8") as f:
            data = json.load(f)
        items = data.get("items", data if isinstance(data, list) else [])
        return {x["item_id"]: x for x in items if x.get("item_id")}
    return {}


def save_cache(cache):
    payload = {
        "version": 1,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "license": "维基百科内容遵循 CC BY-SA 4.0，使用时请保留署名与链接",
        "items": [cache[k] for k in sorted(cache)],
    }
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
        f.write("\n")


def ensure_table(conn):
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS item_sources (
      id INTEGER PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE ON UPDATE CASCADE,
      source TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'zh',
      title TEXT, url TEXT, license TEXT, revision_id INTEGER, qid TEXT,
      confidence REAL, extract TEXT, fetched_at TEXT,
      UNIQUE(item_id, source, lang)
    );
    CREATE INDEX IF NOT EXISTS idx_item_sources_item ON item_sources(item_id);
    """)


def apply_one(conn, rec):
    conn.execute(
        """INSERT OR REPLACE INTO item_sources
           (item_id,source,lang,title,url,license,revision_id,qid,confidence,extract,fetched_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
        (rec["item_id"], rec["source"], rec["lang"], rec["title"], rec["url"],
         rec["license"], rec["revision_id"], rec["qid"], rec["confidence"],
         rec["extract"], rec["fetched_at"]))


def main():
    ap = argparse.ArgumentParser(description="维基百科富化")
    ap.add_argument("--db", default=DB)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--cat", default="")
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--min-confidence", type=float, default=0.78)
    ap.add_argument("--sleep", type=float, default=SLEEP)
    ap.add_argument("--full", action="store_true", help="抓正文前 4000 字，而非仅导言")
    ap.add_argument("--upgrade-short", type=int, default=0,
                    help="只升级缓存中正文短于该字数的条目，例如 --upgrade-short 600")
    ap.add_argument("--missing-only", action="store_true",
                    help="只处理尚无外部来源的条目")
    args = ap.parse_args()

    if not os.path.exists(args.db):
        sys.exit(f"数据库不存在：{args.db}")

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    ensure_table(conn)

    where = ["1=1"]
    params = []
    if args.cat:
        where.append("category_id=?")
        params.append(args.cat)
    items = [dict(r) for r in conn.execute(
        f"SELECT * FROM items WHERE {' AND '.join(where)} ORDER BY category_id,year IS NULL,year,name",
        params)]
    if args.limit:
        items = items[: args.limit]

    cache = load_cache()
    report = {"ok": [], "unmatched": [], "skipped": 0, "failed": []}
    todo = []
    for it in items:
        if it["id"] in SKIP_IDS:
            report["skipped"] += 1
            continue
        if args.missing_only:
            if conn.execute("SELECT 1 FROM item_sources WHERE item_id=?", (it["id"],)).fetchone():
                report["skipped"] += 1
                continue
            todo.append(it)
            continue
        if args.upgrade_short:
            rec = cache.get(it["id"])
            if not rec or len(rec.get("extract") or "") >= args.upgrade_short:
                report["skipped"] += 1
                continue
            todo.append(it)
            continue
        if not args.refresh and it["id"] in cache:
            report["skipped"] += 1
            continue
        todo.append(it)

    print(f"待抓取 {len(todo)} / 共 {len(items)}（缓存 {len(cache)}）")
    for idx, it in enumerate(todo, 1):
        cands = candidates(it["name"])
        if it["id"] in OVERRIDES:
            cands = [OVERRIDES[it["id"]]] + cands
        best = None
        used = []
        try:
            pages = get_by_titles(cands, full=args.full)
            used = [p.get("title") for p in pages]
            best = pick(pages, cands, it)
            if not best or best[0] < 0.85:
                # 搜索兜底
                if it["category_id"] == "people":
                    q = cands[0] if cands else it["name"]
                    if it.get("era"):
                        q = f'{q} {it["era"]}'
                else:
                    # 非人物：优先用拆分后的短概念检索
                    short = [c for c in cands[1:] if 2 <= len(c) <= 8]
                    q = (short[0] if short else cands[0]) if cands else it["name"]
                extra = search_pages(q, full=args.full)
                for p in extra:
                    if p.get("title") in used:
                        continue
                    s = max(score_title(p.get("title", ""), cands), extract_score(p, cands))
                    if score_title(p.get("title", ""), cands) >= 0.99:
                        s += 0.04
                    ok, reason = usable(p, cands, it)
                    if not ok or s < 0.6:
                        continue
                    ex = (p.get("extract") or "").strip()
                    if len(ex) < MIN_EXTRACT:
                        continue
                    s -= 0.08 if reason == "year-mismatch" else 0
                    rank = cand_rank(p.get("title", ""), cands)
                    if best is None or s > best[0] + 1e-6 or (
                            abs(s - best[0]) < 1e-6 and rank < best[3]):
                        best = (s, p, reason, rank)
            time.sleep(args.sleep)
        except Exception as exc:  # noqa: BLE001
            report["failed"].append({"id": it["id"], "name": it["name"], "error": str(exc)})
            print(f"[{idx}/{len(todo)}] ! {it['name']}  {exc}")
            continue

        if not best or best[0] < args.min_confidence:
            info = {
                "id": it["id"], "name": it["name"], "cat": it["category_id"],
                "candidates": cands, "best": (best[1].get("title") if best else None),
                "score": round(best[0], 3) if best else 0,
            }
            report["unmatched"].append(info)
            print(f"[{idx}/{len(todo)}] - {it['name']} → {info['best']} ({info['score']})")
            continue

        conf, page, reason = best[0], best[1], best[2]
        rec = record(it, page, conf, "exact" if conf >= 0.95 else "search", reason)
        cache[it["id"]] = rec
        if not args.dry_run:
            apply_one(conn, rec)
            if idx % 20 == 0:
                conn.commit()
                save_cache(cache)
        report["ok"].append({"id": it["id"], "name": it["name"], "title": rec["title"],
                             "score": conf, "chars": len(rec["extract"]), "qid": rec["qid"]})
        print(f"[{idx}/{len(todo)}] ✓ {it['name']} → {rec['title']} ({conf:.2f}, {len(rec['extract'])}字)")

    if not args.dry_run:
        conn.commit()
        save_cache(cache)
        # 若缓存里有、库里没有的，也补进去
        for rec in cache.values():
            apply_one(conn, rec)
        conn.commit()

    report["summary"] = {
        "total": len(items), "matched": len(report["ok"]),
        "unmatched": len(report["unmatched"]), "skipped": report["skipped"],
        "failed": len(report["failed"]),
    }
    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    conn.close()
    s = report["summary"]
    print(f"\n完成：命中 {s['matched']} · 未命中 {s['unmatched']} · 跳过 {s['skipped']} · 失败 {s['failed']}")
    print(f"缓存 → {CACHE}\n报告 → {REPORT}")


if __name__ == "__main__":
    main()
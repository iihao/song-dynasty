#!/usr/bin/env python3
"""大宋全局志 · API 服务器（仅标准库）

本进程面向本地开发与内网使用。公网部署请用静态构建：
    python3 build.py --base-url https://your.domain
然后把 dist/ 整个目录交给 CDN / 对象存储 / nginx；不要把本进程直接暴露到公网。
若确需动态服务，请置于 nginx/Caddy 之后，并用 --host 127.0.0.1 只监听回环。

启动:
    python3 server/app.py            # http://127.0.0.1:8000
    python3 server/app.py --port 9000

API（.json 后缀可选，静态构建产物用 .json）:
    GET /api/bootstrap          全量数据（分类/政权/面板/来源/条目）
    GET /api/meta               元数据
    GET /api/items?cat=&era=&type=&q=&sort=year&limit=50&offset=0
    GET /api/items/<id>         条目详情（含关联、外部来源）
    GET /api/search?q=&limit=40
    GET /api/timeline?era=
    GET /api/people?ptype=
    GET /api/stats
    GET /api/health
"""
import argparse
import gzip
import hashlib
import json
import os
import posixpath
import re
import signal
import sqlite3
import sys
import threading
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, unquote, urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB = os.path.join(ROOT, "db", "song.db")
DB_PATH = DEFAULT_DB

# 静态资源白名单：只允许明确存在的文件类型，其余一律 404。
# 之前的做法是“拒绝 /db/ /server/ 前缀”，但前缀判断发生在路径归一化之前，
# /css/../db/song.db 与 /%64b/seed.json 都能绕过，等于把整个库与源码公开。
STATIC_RE = re.compile(
    r"^/(?:(?:[A-Za-z0-9][A-Za-z0-9._-]*\.html)|favicon\.ico|robots\.txt|sitemap\.xml|"
    r"(?:css|js|assets)/[A-Za-z0-9][A-Za-z0-9._-]*"
    r"\.(?:css|js|mjs|png|jpe?g|svg|webp|gif|ico|woff2?))$"
)
STATIC_CACHE = re.compile(r"^/(?:css|js|assets)/")

CSP = (
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
    "script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; "
    "frame-ancestors 'self'"
)


def json_bytes(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def split_tags(s):
    return [t for t in (s or "").split("|") if t]


def resolve_static(raw_path):
    """把请求路径归一化后与白名单比对，返回可服务的文件路径或 None。"""
    p = unquote(raw_path)
    if not p.startswith("/") or "\x00" in p or "\\" in p:
        return None
    p = posixpath.normpath(p)
    if p == "/":
        p = "/index.html"
    if p == "/.." or p.startswith("/../"):
        return None
    return p if STATIC_RE.match(p) else None


def connect(db_path):
    """只读连接：不会因为误写而污染数据，也避免和 CLI 写入抢锁。"""
    uri = "file:%s?mode=ro" % quote(os.path.abspath(db_path))
    conn = sqlite3.connect(uri, uri=True, timeout=5.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def row_to_item(row, full=False):
    d = {
        "id": row["id"],
        "cat": row["category_id"],
        "type": row["type"],
        "name": row["name"],
        "era": row["era"],
        "year": row["year"],
        "endYear": row["end_year"],
        "ptype": row["ptype"],
        "birth": row["birth"],
        "death": row["death"],
        "summary": row["summary"],
        "tags": split_tags(row["tags"]),
        "groups": split_tags(row["groups"]),
        "minor": bool(row["minor"]),
    }
    if full:
        d["detail"] = row["detail"]
        d["body"] = row["body"] if "body" in row.keys() else None
        d["refs"] = row["refs"]
        d["categoryName"] = row["category_name"]
        d["createdAt"] = row["created_at"]
        d["updatedAt"] = row["updated_at"]
    return d


# ---------------------------------------------------------------- 数据组装
# 这些函数同时被 HTTP handler 与 build.py 使用，保证动态/静态两条路径的
# JSON 契约完全一致。

def meta(conn):
    cats = [dict(r) for r in conn.execute(
        "SELECT id,name,icon,description AS desc FROM categories ORDER BY sort")]
    dyn = [dict(r) for r in conn.execute(
        "SELECT name,start_year AS start,end_year AS end,color FROM dynasties ORDER BY sort")]
    sources = [r[0] for r in conn.execute("SELECT text FROM sources ORDER BY sort")]
    groups = [r[0] for r in conn.execute("SELECT name FROM groups ORDER BY sort")]
    eras = []
    row = conn.execute("SELECT value FROM meta WHERE key='eras'").fetchone()
    if row:
        eras = json.loads(row[0])
    counts = {r[0]: r[1] for r in conn.execute(
        "SELECT category_id,count(*) FROM items GROUP BY category_id")}
    counts["all"] = conn.execute("SELECT count(*) FROM items").fetchone()[0]
    return {"categories": cats, "dynasties": dyn, "sources": sources,
            "eras": eras, "groups": groups, "counts": counts}


def panels(conn):
    out = []
    for r in conn.execute("SELECT title,description AS desc,kind,payload FROM data_panels ORDER BY sort"):
        p = dict(r)
        payload = json.loads(p.pop("payload") or "{}")
        p.update(payload)
        out.append(p)
    return out


def bootstrap(conn):
    tags = {}
    for r in conn.execute("SELECT item_id, name FROM item_tags JOIN tags ON tags.id=item_tags.tag_id"):
        tags.setdefault(r[0], []).append(r[1])
    rels = {}
    for r in conn.execute("SELECT item_id, related_id FROM item_relations"):
        rels.setdefault(r[0], []).append(r[1])
    items = []
    for r in conn.execute("SELECT * FROM v_items ORDER BY year IS NULL, year, name"):
        d = {
            "id": r["id"], "cat": r["category_id"], "type": r["type"],
            "name": r["name"], "era": r["era"], "year": r["year"],
            "endYear": r["end_year"], "ptype": r["ptype"],
            "birth": r["birth"], "death": r["death"],
            "summary": r["summary"], "detail": r["detail"],
            "refs": r["refs"], "minor": bool(r["minor"]),
            "tags": tags.get(r["id"], []),
            "groups": split_tags(r["groups"]),
            "related": rels.get(r["id"], []),
        }
        if "body" in r.keys() and r["body"]:
            d["body"] = r["body"]
        items.append(d)
    base = meta(conn)
    base.update({"version": 1, "items": items, "dataPanels": panels(conn)})
    return base


def item_detail(conn, item_id):
    row = conn.execute("SELECT * FROM v_items WHERE id=?", (item_id,)).fetchone()
    if not row:
        return None
    item = row_to_item(row, full=True)
    item["related"] = [
        {"id": r[0], "name": r[1], "cat": r[2]}
        for r in conn.execute(
            """SELECT i.id,i.name,i.category_id FROM item_relations r
               JOIN items i ON i.id=r.related_id WHERE r.item_id=?""", (item_id,))
    ]
    item["sources"] = [dict(r) for r in conn.execute(
        """SELECT source,lang,title,url,license,revision_id,qid,
                  confidence,extract,fetched_at
           FROM item_sources WHERE item_id=? ORDER BY source""", (item_id,))]
    return item


def stats(conn):
    cats = [dict(r) for r in conn.execute(
        """SELECT c.id,c.name,count(i.id) AS count
           FROM categories c LEFT JOIN items i ON i.category_id=c.id
           GROUP BY c.id ORDER BY c.sort""")]
    return {
        "total": conn.execute("SELECT count(*) FROM items").fetchone()[0],
        "categories": cats,
        "tags": conn.execute("SELECT count(*) FROM tags").fetchone()[0],
        "people": conn.execute("SELECT count(*) FROM items WHERE category_id='people'").fetchone()[0],
        "timeline": conn.execute("SELECT count(*) FROM items WHERE category_id='timeline'").fetchone()[0],
        "updatedAt": conn.execute("SELECT max(updated_at) FROM items").fetchone()[0],
    }


def list_items(conn, q, search_mode=False):
    where, args = [], []
    if q.get("cat"):
        where.append("category_id=?")
        args.append(q["cat"])
    if q.get("era"):
        where.append("era=?")
        args.append(q["era"])
    if q.get("type"):
        where.append("type=?")
        args.append(q["type"])
    if q.get("ptype"):
        where.append("ptype=?")
        args.append(q["ptype"])
    if q.get("group"):
        where.append(
            "EXISTS(SELECT 1 FROM item_groups ig JOIN groups g ON g.id=ig.group_id "
            "WHERE ig.item_id=v_items.id AND g.name=?)")
        args.append(q["group"])
    if q.get("minor") in ("0", "1"):
        where.append("minor=?")
        args.append(int(q["minor"]))

    kw = (q.get("q") or "").strip()
    if kw:
        like = f"%{kw}%"
        where.append(
            "(name LIKE ? OR summary LIKE ? OR detail LIKE ? OR body LIKE ? OR EXISTS("
            "SELECT 1 FROM item_tags it JOIN tags t ON t.id=it.tag_id "
            "WHERE it.item_id=v_items.id AND t.name LIKE ?))")
        args += [like, like, like, like, like]

    sort = q.get("sort", "year")
    order = {
        "year": "year IS NULL, year ASC, name ASC",
        "name": "name ASC",
        "cat": "category_id ASC, year IS NULL, year ASC",
        "birth": "birth IS NULL, birth ASC",
        "recent": "updated_at DESC",
    }.get(sort, "year IS NULL, year ASC, name ASC")

    try:
        limit = max(1, min(int(q.get("limit", 200)), 2000))
    except ValueError:
        limit = 200
    try:
        offset = max(0, int(q.get("offset", 0)))
    except ValueError:
        offset = 0

    clause = (" WHERE " + " AND ".join(where)) if where else ""
    sql = f"SELECT * FROM v_items{clause} ORDER BY {order} LIMIT ? OFFSET ?"
    rows = conn.execute(sql, args + [limit, offset]).fetchall()
    total = conn.execute(f"SELECT count(*) FROM v_items{clause}", args).fetchone()[0]
    items = [row_to_item(r, full=False) for r in rows]
    if search_mode and kw:
        items.sort(key=lambda x: (kw not in x["name"], x["year"] is None, x["year"] or 9999))
    return {"total": total, "count": len(items), "limit": limit,
            "offset": offset, "items": items}


# ---------------------------------------------------------------- HTTP
class Handler(SimpleHTTPRequestHandler):
    server_version = "SongAtlas/1.0"
    # HTTP/1.1 + keep-alive：静态资源一次连接复用，减少公网 RTT
    protocol_version = "HTTP/1.1"
    # 请求读取超时：没有这个，慢连接可以无限占用线程（slowloris）
    timeout = 20

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # ---------- 基础设施 ----------
    def version_string(self):
        # 不暴露 Python 版本
        return self.server_version

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Content-Security-Policy", CSP)
        if not getattr(self, "_is_api", False):
            path = urlsplit(self.path).path
            if STATIC_CACHE.match(path):
                self.send_header("Cache-Control", "public, max-age=600")
            else:
                self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_payload(self, obj, status=200):
        body = json_bytes(obj)
        etag = 'W/"%s"' % hashlib.sha1(body).hexdigest()[:32]
        inm = self.headers.get("If-None-Match", "")
        if status == 200 and etag in inm:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Vary", "Accept-Encoding")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            return
        gz = len(body) > 1024 and "gzip" in self.headers.get("Accept-Encoding", "")
        if gz:
            body = gzip.compress(body, 6)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("ETag", etag)
        # 必须声明 Vary，否则缓存层可能把 gzip 响应发给不支持的客户端
        self.send_header("Vary", "Accept-Encoding")
        if gz:
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_error_json(self, status, message):
        self.send_payload({"error": message, "status": status}, status)

    # ---------- 路由 ----------
    def do_GET(self):
        self._dispatch()

    def do_HEAD(self):
        self._dispatch()

    def _dispatch(self):
        self._is_api = False
        parsed = urlsplit(self.path)
        path = parsed.path

        if path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return

        if path.startswith("/api/"):
            self._is_api = True
            if path.endswith(".json"):
                path = path[:-5]
            query = {k: v[-1] for k, v in parse_qs(parsed.query).items()}
            try:
                self.handle_api(path, query)
            except BrokenPipeError:
                pass
            except Exception as exc:  # noqa: BLE001
                self.log_message("API 错误: %s", exc)
                self.send_error_json(500, "服务器内部错误")
            return

        target = resolve_static(path)
        if target is None:
            self.send_error(404, "Not Found")
            return
        # 归一化后再交给 SimpleHTTPRequestHandler，它不会再走到 web root 之外
        self.path = target + (("?" + parsed.query) if parsed.query else "")
        super().do_GET()

    def handle_api(self, path, q):
        if path == "/api/health":
            return self.health()
        if path == "/api/meta":
            return self.with_db(lambda c: meta(c))
        if path == "/api/bootstrap":
            return self.with_db(bootstrap)
        if path == "/api/stats":
            return self.with_db(stats)
        if path == "/api/items":
            return self.with_db(lambda c: list_items(c, q))
        if path.startswith("/api/items/"):
            return self.one_item(unquote(path[len("/api/items/"):]))
        if path == "/api/search":
            q2 = dict(q)
            q2["limit"] = q.get("limit", "40")
            return self.with_db(lambda c: list_items(c, q2, search_mode=True))
        if path == "/api/timeline":
            q2 = dict(q)
            q2["cat"] = "timeline"
            q2["sort"] = q.get("sort", "year")
            q2["limit"] = q.get("limit", "1000")
            return self.with_db(lambda c: list_items(c, q2))
        if path == "/api/people":
            q2 = dict(q)
            q2["cat"] = "people"
            q2["limit"] = q.get("limit", "1000")
            return self.with_db(lambda c: list_items(c, q2))
        return self.send_error_json(404, "未知接口")

    # ---------- 连接与响应 ----------
    def with_db(self, fn):
        conn = connect(DB_PATH)
        try:
            self.send_payload(fn(conn))
        finally:
            conn.close()

    def one_item(self, item_id):
        conn = connect(DB_PATH)
        try:
            item = item_detail(conn, item_id)
        finally:
            conn.close()
        if item is None:
            return self.send_error_json(404, "条目不存在")
        self.send_payload(item)

    def health(self):
        try:
            conn = connect(DB_PATH)
            try:
                conn.execute("SELECT 1 FROM items LIMIT 1").fetchone()
            finally:
                conn.close()
        except Exception as exc:  # noqa: BLE001
            return self.send_payload(
                {"ok": False, "error": str(exc), "time": datetime.now().isoformat()}, 503)
        return self.send_payload({"ok": True, "time": datetime.now().isoformat()})


def main():
    global DB_PATH
    ap = argparse.ArgumentParser(description="大宋全局志 API 服务器（开发/内网）")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--db", default=DEFAULT_DB)
    args = ap.parse_args()

    DB_PATH = os.path.abspath(args.db)
    if not os.path.exists(DB_PATH):
        sys.exit(f"数据库不存在：{DB_PATH}\n请先运行：python3 db/init_db.py")

    try:
        _conn = connect(DB_PATH)
        _cols = {r[1] for r in _conn.execute("PRAGMA table_info(items)")}
        _conn.close()
        if "body" not in _cols:
            print("⚠ 数据库缺少 items.body 列；名篇正文将不可用。"
                  "请运行：python3 db/init_db.py --upgrade")
    except Exception as exc:  # noqa: BLE001
        print(f"⚠ 数据库结构检查失败：{exc}")

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    httpd.daemon_threads = True

    def _stop(signum, frame):  # noqa: ARG001
        # serve_forever 跑在主线程，shutdown 必须从别的线程调用
        threading.Thread(target=httpd.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    print(f"大宋全局志 → http://{args.host}:{args.port}")
    print(f"数据库：{DB_PATH}")
    if args.host not in ("127.0.0.1", "localhost"):
        print("⚠ 正在监听非回环地址：请确认前方有 nginx/Caddy 提供 TLS 与限流，"
              "否则建议改用静态构建 python3 build.py。")
    try:
        httpd.serve_forever()
    finally:
        httpd.server_close()
        print("\n已停止")


if __name__ == "__main__":
    main()

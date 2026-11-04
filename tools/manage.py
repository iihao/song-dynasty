#!/usr/bin/env python3
"""大宋全局志 · 数据库维护 CLI

示例:
    python3 tools/manage.py stats
    python3 tools/manage.py list --cat military
    python3 tools/manage.py search 岳飞
    python3 tools/manage.py show ppl-yuefei
    python3 tools/manage.py add new_item.json
    python3 tools/manage.py update ppl-yuefei patch.json
    python3 tools/manage.py rm ppl-yuefei --yes
    python3 tools/manage.py export --out db/seed.json
    python3 tools/manage.py import db/seed.json

条目 JSON 字段（除 id/cat/name 外均可选）:
    id, cat, type, name, era, year, endYear, ptype, birth, death,
    summary, detail, body, refs, minor, tags[], related[]
"""
import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "db", "song.db")

ITEM_FIELDS = {
    "category_id": "cat", "type": "type", "name": "name", "era": "era",
    "year": "year", "end_year": "endYear", "ptype": "ptype",
    "birth": "birth", "death": "death", "summary": "summary",
    "detail": "detail", "body": "body", "refs": "refs", "minor": "minor",
}


def connect(path):
    if not os.path.exists(path):
        sys.exit(f"数据库不存在：{path}\n请先运行 python3 db/init_db.py")
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    try:
        conn.execute("PRAGMA journal_mode = WAL")
    except sqlite3.OperationalError:
        pass  # 别的进程正在写（如 enrich_wiki.py），沿用现有模式即可
    return conn


def tags_of(conn, item_id):
    return [r[0] for r in conn.execute(
        "SELECT t.name FROM item_tags it JOIN tags t ON t.id=it.tag_id "
        "WHERE it.item_id=? ORDER BY t.name", (item_id,))]


def groups_of(conn, item_id):
    return [r[0] for r in conn.execute(
        "SELECT g.name FROM item_groups ig JOIN groups g ON g.id=ig.group_id "
        "WHERE ig.item_id=? ORDER BY g.sort, g.name", (item_id,))]


def set_groups(conn, item_id, groups):
    conn.execute("DELETE FROM item_groups WHERE item_id=?", (item_id,))
    for name in groups or []:
        name = str(name).strip()
        if not name:
            continue
        conn.execute("INSERT OR IGNORE INTO groups(name,sort) VALUES(?,?)",
                     (name, conn.execute("SELECT count(*) FROM groups").fetchone()[0]))
        gid = conn.execute("SELECT id FROM groups WHERE name=?", (name,)).fetchone()[0]
        conn.execute("INSERT OR IGNORE INTO item_groups(item_id,group_id) VALUES(?,?)",
                     (item_id, gid))


def related_of(conn, item_id):
    return [r[0] for r in conn.execute(
        "SELECT related_id FROM item_relations WHERE item_id=? ORDER BY related_id",
        (item_id,))]


def set_tags(conn, item_id, tags):
    conn.execute("DELETE FROM item_tags WHERE item_id=?", (item_id,))
    for name in tags or []:
        name = str(name).strip()
        if not name:
            continue
        conn.execute("INSERT OR IGNORE INTO tags(name) VALUES(?)", (name,))
        tid = conn.execute("SELECT id FROM tags WHERE name=?", (name,)).fetchone()[0]
        conn.execute("INSERT OR IGNORE INTO item_tags(item_id,tag_id) VALUES(?,?)",
                     (item_id, tid))


def set_related(conn, item_id, related):
    conn.execute("DELETE FROM item_relations WHERE item_id=?", (item_id,))
    for rid in related or []:
        if conn.execute("SELECT 1 FROM items WHERE id=?", (rid,)).fetchone():
            conn.execute(
                "INSERT OR IGNORE INTO item_relations(item_id,related_id) VALUES(?,?)",
                (item_id, rid))


def upsert(conn, it, replace=False):
    if not it.get("id") or not it.get("cat") or not it.get("name"):
        sys.exit("条目缺少必填字段：id / cat / name")
    if not conn.execute("SELECT 1 FROM categories WHERE id=?", (it["cat"],)).fetchone():
        sys.exit(f"未知分类：{it['cat']}")
    exists = conn.execute("SELECT 1 FROM items WHERE id=?", (it["id"],)).fetchone()
    vals = [
        it.get("type"), it["name"], it.get("era"), it.get("year"),
        it.get("endYear"), it.get("ptype"), it.get("birth"), it.get("death"),
        it.get("summary"), it.get("detail"), it.get("body"), it.get("refs"),
        1 if it.get("minor") else 0, it["cat"], it["id"],
    ]
    if exists:
        if not replace:
            sys.exit(f"条目已存在：{it['id']}（如为导入请用 import，或 update）")
        conn.execute(
            """UPDATE items SET type=?,name=?,era=?,year=?,end_year=?,ptype=?,
               birth=?,death=?,summary=?,detail=?,body=?,refs=?,minor=?,category_id=?
               WHERE id=?""", vals)
    else:
        conn.execute(
            """INSERT INTO items
               (type,name,era,year,end_year,ptype,birth,death,summary,detail,
                body,refs,minor,category_id,id)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", vals)
    set_tags(conn, it["id"], it.get("tags"))
    if "groups" in it:
        set_groups(conn, it["id"], it.get("groups"))
    elif not exists:
        set_groups(conn, it["id"], [it["ptype"]] if it.get("ptype") else [])
    if "related" in it:
        set_related(conn, it["id"], it.get("related"))
    return "更新" if exists else "新增"


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def cmd_stats(conn, args):
    total = conn.execute("SELECT count(*) FROM items").fetchone()[0]
    print(f"条目总数：{total}")
    for r in conn.execute(
            """SELECT c.name,count(i.id) FROM categories c
               LEFT JOIN items i ON i.category_id=c.id
               GROUP BY c.id ORDER BY c.sort"""):
        print(f"  {r[0]:<8}{r[1]:>5}")
    print(f"标签：{conn.execute('SELECT count(*) FROM tags').fetchone()[0]}")
    print(f"分组：{conn.execute('SELECT count(*) FROM groups').fetchone()[0]}")
    print(f"关联：{conn.execute('SELECT count(*) FROM item_relations').fetchone()[0]}")


def cmd_list(conn, args):
    where, params = [], []
    if args.cat:
        where.append("category_id=?")
        params.append(args.cat)
    if args.q:
        where.append("(name LIKE ? OR summary LIKE ?)")
        params += [f"%{args.q}%", f"%{args.q}%"]
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    rows = conn.execute(
        f"SELECT id,name,category_id,year,era FROM items{clause} "
        f"ORDER BY year IS NULL,year,name LIMIT ?", params + [args.limit])
    for r in rows:
        print(f"{r['id']:<26} {r['year'] or '':<6} {r['era'] or '':<4} {r['name']}")


def cmd_search(conn, args):
    like = f"%{args.q}%"
    rows = conn.execute(
        """SELECT id,name,category_id,year FROM items
           WHERE name LIKE ? OR summary LIKE ? OR detail LIKE ?
              OR EXISTS(SELECT 1 FROM item_tags it JOIN tags t ON t.id=it.tag_id
                        WHERE it.item_id=items.id AND t.name LIKE ?)
           ORDER BY (name LIKE ?) DESC, year IS NULL, year LIMIT ?""",
        (like, like, like, like, like, args.limit))
    for r in rows:
        print(f"{r['id']:<26} {r['year'] or '':<6} {r['category_id']:<10} {r['name']}")


def cmd_show(conn, args):
    r = conn.execute("SELECT * FROM items WHERE id=?", (args.id,)).fetchone()
    if not r:
        sys.exit(f"未找到：{args.id}")
    d = dict(r)
    d["tags"] = tags_of(conn, args.id)
    d["groups"] = groups_of(conn, args.id)
    d["related"] = related_of(conn, args.id)
    d["sources"] = [dict(r) for r in conn.execute(
        """SELECT source,title,url,license,revision_id,qid,confidence,
                  length(extract) AS chars,fetched_at
           FROM item_sources WHERE item_id=? ORDER BY source""", (args.id,))]
    print(json.dumps(d, ensure_ascii=False, indent=2))


def cmd_add(conn, args):
    data = load_json(args.file)
    items = data if isinstance(data, list) else [data]
    for it in items:
        print(upsert(conn, it, replace=args.upsert))
    conn.commit()


def cmd_update(conn, args):
    if not conn.execute("SELECT 1 FROM items WHERE id=?", (args.id,)).fetchone():
        sys.exit(f"未找到：{args.id}")
    patch = load_json(args.file)
    patch["id"] = args.id
    row = conn.execute("SELECT * FROM items WHERE id=?", (args.id,)).fetchone()
    merged = {v: row[k] for k, v in ITEM_FIELDS.items()}
    merged["cat"] = row["category_id"]
    merged["minor"] = bool(row["minor"])
    merged["tags"] = tags_of(conn, args.id)
    merged["groups"] = groups_of(conn, args.id)
    merged.update(patch)
    print(upsert(conn, merged, replace=True))
    conn.commit()


def cmd_rm(conn, args):
    if not args.yes:
        sys.exit("删除操作不可逆，请加 --yes 确认")
    cur = conn.execute("DELETE FROM items WHERE id=?", (args.id,))
    conn.commit()
    print("已删除" if cur.rowcount else "未找到")


def build_export(conn):
    payload = {
        "version": 1,
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "categories": [
            {"id": r["id"], "name": r["name"], "icon": r["icon"],
             "desc": r["description"]}
            for r in conn.execute("SELECT * FROM categories ORDER BY sort")],
        "dynasties": [
            {"name": r["name"], "start": r["start_year"], "end": r["end_year"],
             "color": r["color"]}
            for r in conn.execute("SELECT * FROM dynasties ORDER BY sort")],
        "sources": [r[0] for r in conn.execute("SELECT text FROM sources ORDER BY sort")],
        "groups": [r[0] for r in conn.execute("SELECT name FROM groups ORDER BY sort")],
        "dataPanels": [],
        "items": [],
    }
    for r in conn.execute("SELECT * FROM data_panels ORDER BY sort"):
        p = {"title": r["title"], "desc": r["description"], "kind": r["kind"]}
        p.update(json.loads(r["payload"] or "{}"))
        payload["dataPanels"].append(p)
    row = conn.execute("SELECT value FROM meta WHERE key='eras'").fetchone()
    payload["eras"] = json.loads(row[0]) if row else []

    for r in conn.execute("SELECT * FROM v_items ORDER BY year IS NULL,year,name"):
        it = {
            "id": r["id"], "cat": r["category_id"], "type": r["type"],
            "name": r["name"], "era": r["era"], "year": r["year"],
            "endYear": r["end_year"], "ptype": r["ptype"],
            "birth": r["birth"], "death": r["death"],
            "summary": r["summary"], "detail": r["detail"], "body": r["body"],
            "refs": r["refs"], "tags": [t for t in (r["tags"] or "").split("|") if t],
        }
        grp = groups_of(conn, r["id"])
        if grp:
            it["groups"] = grp
        if r["minor"]:
            it["minor"] = True
        rel = related_of(conn, r["id"])
        if rel:
            it["related"] = rel
        payload["items"].append(it)
    return payload


def cmd_export(conn, args):
    payload = build_export(conn)
    out = args.out
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"已导出 {len(payload['items'])} 条 → {out}")


def cmd_import(conn, args):
    data = load_json(args.file)
    items = data.get("items", data) if isinstance(data, dict) else data
    n = 0
    for it in items:
        upsert(conn, it, replace=True)
        n += 1
    conn.commit()
    print(f"已导入/更新 {n} 条")


def main():
    ap = argparse.ArgumentParser(description="大宋全局志数据库维护工具")
    ap.add_argument("--db", default=DB)
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("stats").set_defaults(func=cmd_stats)

    p = sub.add_parser("list")
    p.add_argument("--cat")
    p.add_argument("--q")
    p.add_argument("--limit", type=int, default=50)
    p.set_defaults(func=cmd_list)

    p = sub.add_parser("search")
    p.add_argument("q")
    p.add_argument("--limit", type=int, default=30)
    p.set_defaults(func=cmd_search)

    p = sub.add_parser("show")
    p.add_argument("id")
    p.set_defaults(func=cmd_show)

    p = sub.add_parser("add")
    p.add_argument("file")
    p.add_argument("--upsert", action="store_true")
    p.set_defaults(func=cmd_add)

    p = sub.add_parser("update")
    p.add_argument("id")
    p.add_argument("file")
    p.set_defaults(func=cmd_update)

    p = sub.add_parser("rm")
    p.add_argument("id")
    p.add_argument("--yes", action="store_true")
    p.set_defaults(func=cmd_rm)

    p = sub.add_parser("export")
    p.add_argument("--out", default=os.path.join(ROOT, "db", "seed.json"))
    p.set_defaults(func=cmd_export)

    p = sub.add_parser("import")
    p.add_argument("file")
    p.set_defaults(func=cmd_import)

    args = ap.parse_args()
    conn = connect(args.db)
    try:
        args.func(conn, args)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
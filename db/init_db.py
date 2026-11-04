#!/usr/bin/env python3
"""由 db/seed.json 初始化 SQLite 数据库。

用法:
    python3 db/init_db.py              # 首次创建，已存在则拒绝
    python3 db/init_db.py --force      # 删除重建（会丢失数据库内的手工修改）
    python3 db/init_db.py --db data/song.db --seed db/seed.json
"""
import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMA = os.path.join(ROOT, "db", "schema.sql")
SEED = os.path.join(ROOT, "db", "seed.json")
DB = os.path.join(ROOT, "db", "song.db")

GROUP_ORDER = ["帝王", "名臣", "名将", "文豪", "思想家", "科学家",
               "艺术家", "女性", "僧道", "起义", "外族", "人物"]


def load_seed(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build(conn, seed):
    with open(SCHEMA, encoding="utf-8") as f:
        conn.executescript(f.read())
    # WAL：读写不互斥（tools/manage.py 写入时，dev server 仍可读）
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")

    conn.executemany(
        "INSERT INTO categories(id,name,icon,description,sort) VALUES(?,?,?,?,?)",
        [(c["id"], c["name"], c.get("icon"), c.get("desc"), i)
         for i, c in enumerate(seed["categories"])],
    )

    conn.executemany(
        "INSERT INTO dynasties(name,start_year,end_year,color,sort) VALUES(?,?,?,?,?)",
        [(d["name"], d["start"], d["end"], d.get("color"), i)
         for i, d in enumerate(seed.get("dynasties", []))],
    )

    conn.executemany(
        "INSERT INTO sources(text,sort) VALUES(?,?)",
        [(s, i) for i, s in enumerate(seed.get("sources", []))],
    )

    for i, p in enumerate(seed.get("dataPanels", [])):
        # 除展示字段外的键全部进 payload（rows/cols/points/items/source/unit…），
        # 这样新增的图表形态不必改表结构
        payload = {k: v for k, v in p.items() if k not in ("title", "desc", "kind")}
        conn.execute(
            "INSERT INTO data_panels(title,description,kind,payload,sort) VALUES(?,?,?,?,?)",
            (p["title"], p.get("desc"), p["kind"],
             json.dumps(payload, ensure_ascii=False), i),
        )

    group_cache = {}
    for i, name in enumerate(seed.get("groups") or GROUP_ORDER):
        conn.execute("INSERT OR IGNORE INTO groups(name,sort) VALUES(?,?)", (name, i))
        group_cache[name] = conn.execute(
            "SELECT id FROM groups WHERE name=?", (name,)).fetchone()[0]

    def group_id(name):
        if name in group_cache:
            return group_cache[name]
        conn.execute("INSERT OR IGNORE INTO groups(name,sort) VALUES(?,?)",
                     (name, len(group_cache) + 100))
        row = conn.execute("SELECT id FROM groups WHERE name=?", (name,)).fetchone()
        group_cache[name] = row[0]
        return row[0]

    tag_cache = {}

    def tag_id(name):
        if name in tag_cache:
            return tag_cache[name]
        cur = conn.execute("INSERT OR IGNORE INTO tags(name) VALUES(?)", (name,))
        row = conn.execute("SELECT id FROM tags WHERE name=?", (name,)).fetchone()
        tag_cache[name] = row[0]
        return row[0]

    for it in seed["items"]:
        conn.execute(
            """INSERT INTO items
               (id,category_id,type,name,era,year,end_year,ptype,birth,death,
                summary,detail,body,refs,minor)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                it["id"], it["cat"], it.get("type"), it["name"], it.get("era"),
                it.get("year"), it.get("endYear"), it.get("ptype"),
                it.get("birth"), it.get("death"),
                it.get("summary"), it.get("detail"), it.get("body"), it.get("refs"),
                1 if it.get("minor") else 0,
            ),
        )
        for t in it.get("tags", []) or []:
            t = str(t).strip()
            if t:
                conn.execute(
                    "INSERT OR IGNORE INTO item_tags(item_id,tag_id) VALUES(?,?)",
                    (it["id"], tag_id(t)),
                )
        gs = it.get("groups")
        if gs is None:
            gs = [it["ptype"]] if it.get("ptype") else []
        for g in gs:
            g = str(g).strip()
            if g:
                conn.execute(
                    "INSERT OR IGNORE INTO item_groups(item_id,group_id) VALUES(?,?)",
                    (it["id"], group_id(g)),
                )

    # 关联需等全部条目入库后再写，避免前向引用被跳过
    for it in seed["items"]:
        for rid in it.get("related", []) or []:
            if conn.execute("SELECT 1 FROM items WHERE id=?", (rid,)).fetchone():
                conn.execute(
                    "INSERT OR IGNORE INTO item_relations(item_id,related_id) VALUES(?,?)",
                    (it["id"], rid),
                )

    # 若存在维基富化缓存，则一并导入（缓存由 tools/enrich_wiki.py 生成）
    cache_path = os.path.join(ROOT, "db", "wiki_cache.json")
    if os.path.exists(cache_path):
        try:
            with open(cache_path, encoding="utf-8") as f:
                cache = json.load(f)
            for rec in cache.get("items", cache if isinstance(cache, list) else []):
                if not conn.execute("SELECT 1 FROM items WHERE id=?", (rec.get("item_id"),)).fetchone():
                    continue
                conn.execute(
                    """INSERT OR REPLACE INTO item_sources
                       (item_id,source,lang,title,url,license,revision_id,qid,
                        confidence,extract,fetched_at)
                       VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                    (rec.get("item_id"), rec.get("source", "wikipedia"),
                     rec.get("lang", "zh"), rec.get("title"), rec.get("url"),
                     rec.get("license"), rec.get("revision_id"), rec.get("qid"),
                     rec.get("confidence"), rec.get("extract"), rec.get("fetched_at")))
            print(f"  已导入维基富化 {len(cache.get('items', []))} 条")
        except Exception as exc:  # noqa: BLE001
            print(f"  维基缓存导入失败（可忽略）：{exc}")

    meta = {
        "schema_version": "1",
        "seed_generated_at": seed.get("generatedAt", ""),
        "built_at": datetime.now().isoformat(timespec="seconds"),
        "title": "大宋全局志",
        "eras": json.dumps(seed.get("eras", []), ensure_ascii=False),
    }
    conn.executemany("INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)", meta.items())
    conn.commit()


def main():
    ap = argparse.ArgumentParser(description="初始化大宋全局志数据库")
    ap.add_argument("--db", default=DB)
    ap.add_argument("--seed", default=SEED)
    ap.add_argument("--force", action="store_true", help="删除已有数据库后重建")
    args = ap.parse_args()

    if not os.path.exists(args.seed):
        sys.exit(f"种子文件不存在：{args.seed}\n请先运行 node tools/export_seed.js")
    if os.path.exists(args.db):
        if not args.force:
            sys.exit(f"数据库已存在：{args.db}\n如需重建请加 --force")
        os.remove(args.db)

    seed = load_seed(args.seed)
    conn = sqlite3.connect(args.db)
    try:
        build(conn, seed)
        total = conn.execute("SELECT count(*) FROM items").fetchone()[0]
        cats = conn.execute("SELECT count(*) FROM categories").fetchone()[0]
        tags = conn.execute("SELECT count(*) FROM tags").fetchone()[0]
        print(f"✓ 数据库已创建：{args.db}")
        print(f"  条目 {total} · 分类 {cats} · 标签 {tags}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""为完全孤立的条目补 1–3 条基于标签/门类/政权的关联。

这是“兜底关联”，不是人工考订：优先共享具体标签，其次同门类同政权。
默认在默认数据库上运行后自动导出 db/seed.json。
"""
import argparse
import json
import os
import sqlite3
import subprocess
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "db", "song.db")
ERA_TAGS = {"五代", "北宋", "南宋", "两宋", "辽", "西夏", "金", "元", "大理"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DB)
    ap.add_argument("--limit", type=int, default=3, help="每个孤立条目最多补几条")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-export", action="store_true")
    args = ap.parse_args()

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    items = {r["id"]: dict(r) for r in conn.execute(
        "SELECT id,name,category_id,type,era FROM items")}
    tags = defaultdict(set)
    for r in conn.execute("SELECT item_id,name FROM item_tags JOIN tags ON tags.id=item_tags.tag_id"):
        tags[r["item_id"]].add(r["name"])
    related = defaultdict(set)
    for r in conn.execute("SELECT item_id,related_id FROM item_relations"):
        related[r["item_id"]].add(r["related_id"])
        related[r["related_id"]].add(r["item_id"])

    orphans = [iid for iid in items if not related[iid]]
    added = []
    for iid in orphans:
        a = items[iid]
        scored = []
        for jid, b in items.items():
            if jid == iid:
                continue
            shared = (tags[iid] & tags[jid]) - ERA_TAGS
            same_cat = a["category_id"] == b["category_id"]
            same_type = a["type"] and a["type"] == b["type"]
            same_era = a["era"] and a["era"] == b["era"]
            if not shared and not same_cat and not same_era:
                continue
            score = (len(shared) * 5 + (2 if same_cat else 0) +
                     (1 if same_type else 0) + (1 if same_era else 0))
            scored.append((score, jid, same_cat, same_type, same_era))
        scored.sort(key=lambda x: (-x[0], x[1]))
        picked = [jid for score, jid, *_ in scored if score >= 5][:args.limit]
        if not picked:
            picked = [jid for _, jid, sc, st, se in scored if sc and se][:args.limit]
        if not picked:
            picked = [jid for _, jid, sc, st, se in scored if sc and st][:args.limit]
        if not picked:
            picked = [jid for _, jid, sc, st, se in scored if sc][:args.limit]
        for jid in picked:
            added.append((iid, jid))

    if not args.dry_run:
        conn.executemany(
            "INSERT OR IGNORE INTO item_relations(item_id,related_id) VALUES(?,?)",
            added)
        conn.executemany(
            "INSERT OR IGNORE INTO item_relations(item_id,related_id) VALUES(?,?)",
            [(b, a) for a, b in added])
        conn.commit()
    print(("[dry-run] " if args.dry_run else "") +
          f"孤立条目 {len(orphans)} 条，补关联 {len(added)} 条")
    for a, b in added[:20]:
        print(f"  {items[a]['name']} ↔ {items[b]['name']}")
    conn.close()

    if not args.dry_run and not args.no_export and os.path.abspath(args.db) == os.path.abspath(DB):
        subprocess.run([sys.executable, os.path.join(ROOT, "tools", "manage.py"), "export"],
                       check=True)


if __name__ == "__main__":
    main()

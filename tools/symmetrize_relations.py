#!/usr/bin/env python3
"""把单向关联补成双向，减少详情页“相关”只显示一半的问题。

默认在默认数据库上运行后自动导出 db/seed.json；--no-export 可跳过。
幂等：已存在的反向关联不会重复插入。
"""
import argparse
import os
import sqlite3
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "db", "song.db")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DB)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-export", action="store_true")
    args = ap.parse_args()

    conn = sqlite3.connect(args.db)
    rows = list(conn.execute("SELECT item_id, related_id FROM item_relations"))
    missing = []
    for a, b in rows:
        if not conn.execute(
                "SELECT 1 FROM item_relations WHERE item_id=? AND related_id=?", (b, a)
        ).fetchone():
            missing.append((b, a))
    if not args.dry_run:
        conn.executemany(
            "INSERT OR IGNORE INTO item_relations(item_id, related_id) VALUES(?,?)",
            missing)
        conn.commit()
    print(("[dry-run] " if args.dry_run else "") + f"补反向关联 {len(missing)} 条")
    conn.close()

    if not args.dry_run and not args.no_export and os.path.abspath(args.db) == os.path.abspath(DB):
        subprocess.run([sys.executable, os.path.join(ROOT, "tools", "manage.py"), "export"],
                       check=True)


if __name__ == "__main__":
    main()

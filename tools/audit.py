#!/usr/bin/env python3
"""大宋全局志 · 知识库体检

用法:
    python3 tools/audit.py              # 门类×政权覆盖 + 质量缺口
    python3 tools/audit.py --json       # 供 CI 使用
    python3 tools/audit.py --orphans    # 只列出完全孤立的条目

只读打开数据库（mode=ro），可以边跑 enrich_wiki.py / 开发服务器边执行。

检查项：
  coverage  门类 × 政权 矩阵，标出 0 格；门类内政权缺失
  refs      缺参考出处的条目
  depth     summary / detail 过短的条目
  links     完全孤立（无入向也无出向关联）的条目
  dup       跨门类重名（同一事物被录入两次）
  data      年表缺年份、人物缺生卒、id 不合规
"""
import argparse
import json
import os
import re
import sqlite3
import sys
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "db", "song.db")
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
MIN_SUMMARY = 12
MIN_DETAIL = 20
# 这些门类允许“两宋”这种跨政权归属；用于判断某个政权是否整栏空缺
SOVEREIGNS = ["五代", "北宋", "南宋", "辽", "西夏", "金"]


def connect(path):
    uri = "file:%s?mode=ro" % os.path.abspath(path)
    conn = sqlite3.connect(uri, uri=True, timeout=5.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def collect(conn):
    cats = [dict(r) for r in conn.execute("SELECT id,name FROM categories ORDER BY sort")]
    items = [dict(r) for r in conn.execute(
        """SELECT id,category_id,name,era,year,birth,death,summary,detail,refs,minor
           FROM items""")]
    related = {r[0] for r in conn.execute(
        "SELECT item_id FROM item_relations UNION SELECT related_id FROM item_relations")}
    return cats, items, related


def report(conn):
    cats, items, related = collect(conn)
    cat_names = {c["id"]: c["name"] for c in cats}
    out = {"total": len(items), "sections": []}

    # ---- 覆盖矩阵 ----
    matrix = defaultdict(Counter)
    for it in items:
        matrix[it["category_id"]][it["era"] or "(空)"] += 1
    eras = [e for e in SOVEREIGNS if any(e in m for m in matrix.values())]
    eras += sorted({e for m in matrix.values() for e in m} - set(eras))
    rows = []
    for c in cats:
        m = matrix.get(c["id"], Counter())
        rows.append({"cat": c["name"], "counts": {e: m.get(e, 0) for e in eras},
                     "total": sum(m.values())})
    empty = [(cat_names[c["id"]], e) for c in cats for e in SOVEREIGNS
             if e in eras and not matrix.get(c["id"], Counter()).get(e)]
    out["sections"].append({"name": "coverage", "eras": eras, "rows": rows,
                            "empty_cells": empty})

    # ---- 质量 ----
    no_refs = [it for it in items if not (it["refs"] or "").strip()]
    short = [it for it in items
             if len((it["summary"] or "").strip()) < MIN_SUMMARY
             or len((it["detail"] or "").strip()) < MIN_DETAIL]
    orphans = [it for it in items if it["id"] not in related]
    out["sections"].append({
        "name": "quality",
        "no_refs": {"total": len(no_refs),
                    "by_cat": dict(Counter(cat_names[i["category_id"]] for i in no_refs))},
        "short": {"total": len(short), "items": [i["id"] for i in short][:20]},
        "orphans": {"total": len(orphans),
                    "by_cat": dict(Counter(cat_names[i["category_id"]] for i in orphans)),
                    "items": [i["id"] for i in orphans]},
    })

    # ---- 重名 / 字段缺失 ----
    by_name = defaultdict(list)
    for it in items:
        by_name[it["name"].strip()].append(it["id"])
    pair_set = {(a, b) for a, b in conn.execute("SELECT item_id, related_id FROM item_relations")}
    dups = {}
    for n, ids in by_name.items():
        if len(ids) < 2:
            continue
        # 年表事件与军事/思想专题同名是设计如此；已互相挂上关联的就不算问题
        if all((a, b) in pair_set or (b, a) in pair_set
               for i, a in enumerate(ids) for b in ids[i + 1:]):
            continue
        dups[n] = ids
    bad = []
    for it in items:
        if not ID_RE.match(it["id"]):
            bad.append((it["id"], "id 含不安全字符"))
        if it["category_id"] == "timeline" and it["year"] is None:
            bad.append((it["id"], "年表缺 year"))
        if it["category_id"] == "people" and it["birth"] is None and it["death"] is None:
            bad.append((it["id"], "人物缺生卒"))
    asym = [(a, b) for a, b in pair_set if (b, a) not in pair_set]
    out["sections"].append({"name": "integrity", "dups": dups, "bad": bad,
                            "asymmetric": len(asym)})
    return out


def print_human(r):
    print(f"条目 {r['total']}\n")
    cov = next(s for s in r["sections"] if s["name"] == "coverage")
    eras = cov["eras"]
    width = max(len(row["cat"]) for row in cov["rows"]) + 2
    print("门类 × 政权")
    print(" " * width + "".join(f"{e:>6}" for e in eras) + "   合计")
    for row in cov["rows"]:
        cells = "".join(f"{row['counts'][e]:>6}" if row["counts"][e] else "     ·" for e in eras)
        print(f"{row['cat']:<{width}}{cells}{row['total']:>7}")
    if cov["empty_cells"]:
        print("\n整栏空缺：" + "、".join(f"{c}×{e}" for c, e in cov["empty_cells"]))

    q = next(s for s in r["sections"] if s["name"] == "quality")
    print(f"\n缺参考出处 {q['no_refs']['total']} 条 · "
          f"完全孤立 {q['orphans']['total']} 条 · "
          f"正文过短 {q['short']['total']} 条")
    print("孤立条目按门类：" + "，".join(
        f"{k} {v}" for k, v in sorted(q["orphans"]["by_cat"].items(), key=lambda x: -x[1])))
    if q["short"]["items"]:
        print("过短示例：" + "、".join(q["short"]["items"][:8]))

    it = next(s for s in r["sections"] if s["name"] == "integrity")
    if it["dups"]:
        print("\n重名（可能是同一事物被录两次）：")
        for n, ids in it["dups"].items():
            print(f"  {n}: {' / '.join(ids)}")
    if it.get("asymmetric"):
        print(f"\n单向关联 {it['asymmetric']} 条（详情页“相关”只显示出向，建议补全反向）")
    if it["bad"]:
        print("\n字段问题：")
        for iid, why in it["bad"][:15]:
            print(f"  {iid}: {why}")
    print()


def main():
    ap = argparse.ArgumentParser(description="知识库体检")
    ap.add_argument("--db", default=DB)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--orphans", action="store_true", help="只输出完全孤立的 id")
    ap.add_argument("--strict", action="store_true", help="有严重问题时以非零退出（CI 用）")
    args = ap.parse_args()

    if not os.path.exists(args.db):
        sys.exit(f"数据库不存在：{args.db}\n请先运行 python3 db/init_db.py")
    conn = connect(args.db)
    try:
        r = report(conn)
    finally:
        conn.close()

    if args.orphans:
        q = next(s for s in r["sections"] if s["name"] == "quality")
        print("\n".join(q["orphans"]["items"]))
        return
    if args.json:
        print(json.dumps(r, ensure_ascii=False, indent=2))
    else:
        print_human(r)

    if args.strict:
        it = next(s for s in r["sections"] if s["name"] == "integrity")
        if it["dups"] or it["bad"]:
            sys.exit("体检未通过（--strict）")


if __name__ == "__main__":
    main()

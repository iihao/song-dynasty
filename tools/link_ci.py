#!/usr/bin/env python3
"""补齐词学关联：词人 ↔ 词集 ↔ 词作 ↔ 词牌。

幂等：已存在的关联不会重复插入；--dry-run 只报告不写库。
默认在默认数据库上运行后会执行 manage.py export，避免 seed 与库脱节；
--no-export 可跳过。
"""
import argparse
import os
import re
import sqlite3
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "db", "song.db")

# 词集 → 作者
COLLECTIONS = {
    "lit-ji-yuezhang": "ppl-liuyong",
    "lit-ji-dongpo": "ppl-sushi",
    "lit-ji-jiaxuan": "ppl-xinqiji",
    "lit-ji-shuyu": "ppl-liqingzhao",
    "lit-ji-baishi": "ppl-jiangkuai",
    "lit-ji-mengchuang": "ppl-wuwenying",
    "lit-ji-zhushan": "ppl-jiangjie",
    "lit-ji-shanzhong": "ppl-zhangyan",
    "lit-ji-huaihai": "ppl-qinguan",
    "lit-ji-pianyu": "ppl-zhoubangyan",
    "lit-ji-zhuyu": "ppl-yanshu",
    "lit-ji-xiaoshan": "ppl-yanjidao",
    "lit-ji-liuyi": "ppl-ouyangxiu",
    "lit-ji-zhangziye": "ppl-zhangxian",
    "lit-ji-dongshan": "ppl-hezhu",
    "lit-ji-shangu": "ppl-huangtingjian",
    "lit-ji-fangweng": "ppl-luyou",
    "lit-ji-meixi": "ppl-shidazu",
    "lit-ji-bishan": "ppl-wangyisun",
    "lit-ji-caochuang": "ppl-zhoumi",
    "lit-ji-xuxi": "ppl-liuchenweng",
    "lit-ji-longzhou": "ppl-liuguo",
    "lit-ji-longchuan": "ppl-chenliang",
    "lit-ji-houcun": "ppl-liukezhuang",
    "lit-ji-duanchang": "ppl-zhushuzhen",
    "lit-ji-wenshan": "ppl-wentianxiang",
    "lit-ji-yuhu": "ppl-zhangxiaoxiang",
    "lit-ji-dongze": "ppl-zhangji",
    "lit-ji-fanwenzheng": "ppl-fanzhongyan",
}

# 词牌名 → 词牌条目
TUNES = {
    "如梦令": "lit-pai-rumengling",
    "声声慢": "lit-pai-shengshengman",
    "扬州慢": "lit-pai-yangzhouman",
    "暗香": "lit-pai-anxiang",
    "疏影": "lit-pai-shuying",
    "卜算子": "lit-pai-busuanzi",
    "踏莎行": "lit-pai-tasuoxing",
    "满庭芳": "lit-pai-mantingfang",
    "贺新郎": "lit-pai-hexinglang",
    "兰陵王": "lit-pai-lanlingwang",
    "六州歌头": "lit-pai-liuzhou",
    "雨霖铃": "lit-pai-yulinling",
    "水调歌头": "lit-pai-shuidiao",
    "念奴娇": "lit-pai-niannujiao",
    "浣溪沙": "lit-pai-huanxisha",
    "蝶恋花": "lit-pai-dielianhua",
    "满江红": "lit-pai-manjianghong",
    "青玉案": "lit-pai-qingyuan",
    "临江仙": "lit-pai-linjiangxian",
    "水龙吟": "lit-pai-shuilongyin",
    "鹧鸪天": "lit-pai-zhegutian",
    "望海潮": "lit-pai-wanghaichao",
    "八声甘州": "lit-pai-basheng",
    "江城子": "lit-pai-jiangchengzi",
    "定风波": "lit-pai-dingfengbo",
    "渔家傲": "lit-pai-yujiaao",
    "苏幕遮": "lit-pai-sumuzhe",
    "鹊桥仙": "lit-pai-queqiaoxian",
    "一剪梅": "lit-pai-yijianmei",
    "虞美人": "lit-pai-yumeiren",
    "清平乐": "lit-pai-qingpingyue",
    "菩萨蛮": "lit-pai-pusaman",
    "西江月": "lit-pai-xijiangyue",
    "生查子": "lit-pai-shengchazi",
    "天仙子": "lit-pai-tianxianzi",
    "浪淘沙": "lit-pai-langtaosha",
    "少年游": "lit-pai-shaonianyou",
    "点绛唇": "lit-pai-dianjiangchun",
    "六丑": "lit-pai-liuchou",
    "醉花阴": "lit-pai-zuihuayin",
    "武陵春": "lit-pai-wulingchun",
    "小重山": "lit-pai-xiaochongshan",
    "钗头凤": "lit-pai-chaitoufeng",
    "摸鱼儿": "lit-pai-moyuer",
    "破阵子": "lit-pai-pozhenzi",
    "丑奴儿": "lit-pai-chounuer",
    "诉衷情": "lit-pai-suzhongqing",
    "齐天乐": "lit-pai-qitianle",
    "双双燕": "lit-pai-shuangshuangyan",
    "唐多令": "lit-pai-tangduoling",
    "永遇乐": "lit-pai-yongyule",
    "疏帘淡月": "lit-pai-shulian",
    "风入松": "lit-pai-fengrusong",
    "眉妩": "lit-pai-meiwu",
    "一萼红": "lit-pai-yiehong",
    "酹江月": "lit-pai-jiangyue",
    "解连环": "lit-pai-jielianhuan",
    "鹤冲天": "lit-pai-hetianchong",
}

# 这些不是词牌，不能因为标题里带“词”就找词牌。
NON_TUNE_WORKS = {"回心院词"}

# 原标题里没有作者关联的，显式补齐
AUTHOR_FALLBACK = {
    "lit-yulinling": "ppl-liuyong",
    "lit-queqiaoxian": "ppl-qinguan",
    "lit-manjianghong": "ppl-yuefei",
    "lit-chaitoufeng": "ppl-luyou",
    "lit-yangzhouman": "ppl-jiangkuai",
    "lit-shuangshuangyan": "ppl-shidazu",
    "lit-shulian": "ppl-zhangji",
    "lit-yongyule-liuchenweng": "ppl-liuchenweng",
}


def tune_of(name):
    s = re.sub(r"^[《〈]", "", name)
    s = re.sub(r"[》〉].*$", "", s)
    if "·" in s:
        s = s.split("·", 1)[0]
    return s.strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DB)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-export", action="store_true",
                    help="不要自动运行 manage.py export（仅默认库会自动导出）")
    args = ap.parse_args()
    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row

    items = {r["id"]: dict(r) for r in conn.execute(
        "select id,name,type,category_id from items")}
    person_by_name = {}
    for r in items.values():
        if r["category_id"] == "people":
            person_by_name.setdefault(r["name"], r["id"])

    def rels(item_id):
        return {r[0] for r in conn.execute(
            "select related_id from item_relations where item_id=?", (item_id,))}

    def add(a, b):
        if not a or not b or a == b or a not in items or b not in items:
            return 0
        cur = conn.execute(
            "insert or ignore into item_relations(item_id,related_id) values(?,?)", (a, b))
        return 1 if cur.rowcount else 0

    edges = 0
    report = []

    # 词集 → 作者
    for coll, author in COLLECTIONS.items():
        if coll not in items or author not in items:
            continue
        n = add(coll, author) + add(author, coll)
        if n:
            edges += n
            report.append(("词集↔词人", items[coll]["name"], items[author]["name"], n))

    # 词作 → 作者 / 词集 / 词牌
    works = [i for i in items.values() if i["type"] == "词"]
    for w in works:
        wid = w["id"]
        before = edges
        r = rels(wid)

        author = None
        for rid in r:
            if rid in items and items[rid]["category_id"] == "people":
                author = rid
                break
        if not author:
            author = AUTHOR_FALLBACK.get(wid)
        if not author:
            # 从标题/标签里找作者名
            tags = [x[0] for x in conn.execute(
                "select t.name from item_tags it join tags t on t.id=it.tag_id where it.item_id=?",
                (wid,))]
            for name, pid in person_by_name.items():
                short = name.split(" ")[-1]
                if name in tags or short in tags:
                    author = pid
                    break
        if author:
            edges += add(wid, author) + add(author, wid)

        tune = tune_of(w["name"])
        if tune in NON_TUNE_WORKS:
            tune = ""
        pai = TUNES.get(tune)
        if pai and pai in items:
            edges += add(wid, pai) + add(pai, wid)

        coll = next((c for c, a in COLLECTIONS.items() if a == author), None)
        if coll:
            edges += add(wid, coll) + add(coll, wid)

        if edges > before:
            report.append(("词作", w["name"], items.get(author, {}).get("name", "—"),
                           tune, coll or "—"))

    # 词牌 → 宋词总条 / 词论
    for tune, pid in TUNES.items():
        if pid in items:
            edges += add(pid, "cul-ci") + add("cul-ci", pid)

    if not args.dry_run:
        conn.commit()

    # 统计
    def count(sql):
        return conn.execute(sql).fetchone()[0]

    print(f"{'[dry-run] ' if args.dry_run else ''}新增关联 {edges} 条")
    print("词作总数:", len(works))
    print("词作有词人:", count("""select count(*) from items i where i.type='词'
        and exists(select 1 from item_relations r join items p on p.id=r.related_id
                   where r.item_id=i.id and p.category_id='people')"""))
    print("词作有词集:", count("""select count(*) from items i where i.type='词'
        and exists(select 1 from item_relations r join items p on p.id=r.related_id
                   where r.item_id=i.id and p.type='词集')"""))
    print("词作有词牌:", count("""select count(*) from items i where i.type='词'
        and exists(select 1 from item_relations r join items p on p.id=r.related_id
                   where r.item_id=i.id and p.type='词牌')"""))
    print("总关联:", count("select count(*) from item_relations"))
    missing_tunes = sorted({
        tune_of(w["name"]) for w in works
        if tune_of(w["name"]) not in TUNES and tune_of(w["name"]) not in NON_TUNE_WORKS
    })
    if missing_tunes:
        print("未映射词牌（可补 TUNES 或新增词牌条目）:", "、".join(missing_tunes))
    conn.close()

    # 直接写库后同步种子，避免 build.py 读到的还是旧关联。
    if not args.dry_run and not args.no_export and os.path.abspath(args.db) == os.path.abspath(DB):
        subprocess.run([sys.executable, os.path.join(ROOT, "tools", "manage.py"), "export"],
                       check=True)


if __name__ == "__main__":
    main()

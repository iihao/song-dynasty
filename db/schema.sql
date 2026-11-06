-- 大宋全局志 · SQLite schema
-- 设计原则：条目表统一承载十二门类，人物/帝王用 ptype、birth、death 扩展；
--          标签、关联、数据面板独立成表，便于长期维护与二次开发。

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  icon        TEXT,
  description TEXT,
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dynasties (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  start_year INTEGER NOT NULL,
  end_year   INTEGER NOT NULL,
  color      TEXT,
  sort       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sources (
  id   INTEGER PRIMARY KEY,
  text TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

-- 数据面板：payload 存 JSON（bars 的 rows 或 table 的 cols/rows）
CREATE TABLE IF NOT EXISTS data_panels (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  kind        TEXT NOT NULL CHECK (kind IN ('bars', 'table', 'line', 'kpi')),
  payload     TEXT NOT NULL,
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items (
  id          TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON UPDATE CASCADE,
  type        TEXT,
  name        TEXT NOT NULL,
  era         TEXT,
  year        INTEGER,
  end_year    INTEGER,
  ptype       TEXT,              -- 人物子类型：帝王/名臣/名将/文豪…
  birth       INTEGER,
  death       INTEGER,
  summary     TEXT,
  detail      TEXT,
  body        TEXT,              -- 名篇正文/全文（诗词文赋等）
  refs        TEXT,
  minor       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_cat  ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_items_year ON items(year);
CREATE INDEX IF NOT EXISTS idx_items_era  ON items(era);
CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
CREATE INDEX IF NOT EXISTS idx_items_ptype ON items(ptype);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);

CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS item_tags (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE ON UPDATE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON item_tags(tag_id);

CREATE TABLE IF NOT EXISTS groups (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS item_groups (
  item_id  TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE ON UPDATE CASCADE,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_item_groups_group ON item_groups(group_id);

-- 外部富化来源（维基百科等），与原创内容分离，保留许可与修订信息
CREATE TABLE IF NOT EXISTS item_sources (
  id          INTEGER PRIMARY KEY,
  item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE ON UPDATE CASCADE,
  source      TEXT NOT NULL,
  lang        TEXT NOT NULL DEFAULT 'zh',
  title       TEXT,
  url         TEXT,
  license     TEXT,
  revision_id INTEGER,
  qid         TEXT,
  confidence  REAL,
  extract     TEXT,
  fetched_at  TEXT,
  UNIQUE(item_id, source, lang)
);
CREATE INDEX IF NOT EXISTS idx_item_sources_item ON item_sources(item_id);

CREATE TABLE IF NOT EXISTS item_relations (
  item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE ON UPDATE CASCADE,
  related_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (item_id, related_id)
);

-- 触发：条目更新时间自动维护
-- 原实现靠 recursive_triggers 默认关闭才不自递归；这里用 WHEN 守卫，
-- 即使有人打开 recursive_triggers 也不会无限递归。
DROP TRIGGER IF EXISTS trg_items_updated;
CREATE TRIGGER trg_items_updated
AFTER UPDATE ON items
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE items SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- 视图：条目 + 分类名 + 标签串
CREATE VIEW IF NOT EXISTS v_items AS
SELECT
  i.*,
  c.name AS category_name,
  (SELECT group_concat(t.name, '|')
     FROM item_tags it JOIN tags t ON t.id = it.tag_id
    WHERE it.item_id = i.id) AS tags,
  (SELECT group_concat(g.name, '|')
     FROM item_groups ig JOIN groups g ON g.id = ig.group_id
    WHERE ig.item_id = i.id) AS groups
FROM items i
JOIN categories c ON c.id = i.category_id;
-- 帝系：各国皇室谱系（宋/辽/金/西夏/大理）
CREATE TABLE IF NOT EXISTS lineages (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  full_name TEXT,
  color TEXT,
  note  TEXT,
  sort  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lineage_nodes (
  lineage_id TEXT NOT NULL REFERENCES lineages(id) ON DELETE CASCADE,
  node_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  temple     TEXT,             -- 庙号：太祖 / 太宗 / 世宗…
  rk         TEXT,             -- 排行：嫡长子 / 第三子 / 侄…
  born       TEXT,             -- 嫡 / 庶
  house      TEXT,             -- 支系：太祖系 / 东丹系 / 濮王系…
  reign      TEXT,             -- 在位年
  gen        INTEGER NOT NULL, -- 世代
  parent     TEXT,             -- 父节点 node_id
  spouse_of  TEXT,             -- 若为后妃：所系帝王 node_id
  adoptive_parent TEXT,        -- 过继/养父 node_id
  role       TEXT,             -- 后妃身份：皇后 / 太后 / 妃
  inher      INTEGER NOT NULL DEFAULT 0,
  note       TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (lineage_id, node_id)
);
CREATE INDEX IF NOT EXISTS idx_lineage_nodes ON lineage_nodes(lineage_id, gen, sort);

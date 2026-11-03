# 大宋全局志 · Song Dynasty Atlas

两宋（960—1279）及辽（916—1125，含西辽）、西夏、金的结构化资料库：**SQLite 数据库 + 标准库 API + 零依赖前端**。
覆盖政治制度、军事、经济、文化、思想学术、科技、社会民生、风俗生活、地理邦交、人物、名篇、大事年表十二门类。

## 数据规模

| 门类 | 条目 |
|---|---:|
| 人物（含 54 位帝王，含五代） | 289 |
| 大事年表（含五代、辽、西辽） | 127 |
| 文化 | 46 |
| 军事 | 45 |
| 政治制度 | 42 |
| 风俗生活 | 41 |
| 地理邦交 | 31 |
| 经济 | 30 |
| 社会民生 | 26 |
| 名篇 | 24 |
| 科技 | 23 |
| 思想学术 | 20 |
| **合计** | **744** |

另有 1,443 个标签、748 条条目关联、12 个身份分组、5 组统计面板。

已富化维基百科条目 **595 条 / 744 条（80.0%）**，其中 429 条正文超过 600 字；保留修订号、Wikidata QID 与 CC BY-SA 4.0 署名。

人物支持**多身份分组**：如李清照同时属于「女性」「文豪」，梁红玉同时属于「女性」「名将」。

> 这是**资料型通览库，不是学术定本**。人口、财政等数字各家估算差异大，页面内已标注口径；争议问题（如《满江红》作者、缠足起源）在详述中注明“一说”。正式引用请回原始史料。

## 快速开始

```bash
cd song-dynasty

# 1) 初始化数据库（只需一次）
python3 db/init_db.py

# 2) 启动（自动建库 + 起服务）
./start.sh
# 或指定端口
./start.sh --port 9000

# 3) 打开
open http://127.0.0.1:8000
```

**不要直接双击 `index.html`**：浏览器在 `file://` 下禁止读取 API，页面会提示启动命令。

环境要求：Python 3.8+（仅标准库）、SQLite 3.35+。无需 npm、无需联网。

## 部署（公网）

**公网不要运行 `server/app.py`。** 这是一个只读数据集，正确的部署形态是构建成静态站点：

```bash
python3 build.py --base-url https://你的域名
# 产物全部在 dist/，上传到 CDN / 对象存储 / nginx 即可
```

```
dist/
├── index.html            单页应用（CSS/JS 引用自动加内容哈希）
├── api/bootstrap.json    首屏数据
├── api/items/<id>.json   条目详情（含维基富化）
├── item/<id>.html        每条一页，可被搜索引擎收录、可分享预览
├── sitemap.xml         需要 --base-url 才会生成
├── robots.txt  404.html  .nojekyll
├── _headers          ← 仅供 Cloudflare Pages / Netlify（GitHub Pages 会忽略）
```

构建期会做一次数据体检（悬空关联、非法 id、年表缺年份等），有问题直接打印出来。

### GitHub Pages

仓库带了发布脚本（单提交强制推送 `gh-pages`，不会膨胀历史）：

```bash
./deploy.sh            # 自动推导 https://<owner>.github.io/<repo>
BASE_URL=https://你的域名 ./deploy.sh
```

首次使用需在 Settings → Pages 把 Source 设为 `gh-pages` 分支（或执行脚本末尾打印的 `gh api` 命令）。构建会自动生成 `.nojekyll`，避免 Jekyll 处理 `_headers` 等文件。

如果你偏好 GitHub Actions 发布，可加一个 workflow 调 `actions/deploy-pages`；注意推送 workflow 文件需要 token 具备 `workflow` scope（`gh auth refresh -s workflow`）。

nginx 最小配置：

```nginx
server {
  listen 443 ssl http2;
  root /var/www/song-dynasty/dist;
  location / { try_files $uri $uri/ =404; }
  location /api/ { add_header Cache-Control "public, max-age=300"; }
  location ~* ^/(css|js)/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
  gzip on; gzip_types application/json text/css application/javascript;
}
```

如果你确实需要动态服务（比如接写接口），**必须**放在 nginx/Caddy 之后，用 `--host 127.0.0.1` 只监听回环。服务端已改为静态白名单 + 路径归一化（早期版本可以用 `curl --path-as-is '/css/../db/song.db'` 直接下载整个数据库，已修复），并按只读方式打开 SQLite。

> 旧库需要升到 WAL 时，跑一次 `python3 tools/manage.py --db db/song.db stats` 即可；`db/*.db*` 已在 `.gitignore` 中。

## 目录结构

```
song-dynasty/
├── index.html              前端单页
├── css/style.css           宋韵视觉（宣纸 / 朱砂 / 青绿）
├── js/app.js               渲染与交互（零依赖）
├── build.py                静态站点构建 → dist/（公网部署用这个）
├── deploy.sh               构建并发布到 GitHub Pages
├── server/app.py           HTTP + JSON API（开发/内网，仅标准库）
├── db/
│   ├── schema.sql          表结构、索引、触发器、视图
│   ├── init_db.py          由 seed.json 建库
│   ├── seed.json           可提交的种子快照（原创内容）
│   ├── wiki_cache.json     维基富化缓存（CC BY-SA 4.0）
│   └── song.db             运行时数据库（已 gitignore）
├── tools/manage.py         增删改查 / 导入导出 CLI
├── tools/audit.py          覆盖与质量体检（门类×政权、孤立条目、重名、缺字段）
├── tools/enrich_wiki.py    维基百科 / 维基数据富化
└── start.sh                本地一键启动
```

数据流是单向的：`seed.json` + `wiki_cache.json` →（`init_db.py`）`song.db` →（`build.py`）`dist/`。数据库是构建产物，不是线上状态；内容改动请走 `manage.py export` 刷新 `seed.json`。

## 数据模型

```
categories 1─n items n─n tags
                  └─n item_relations (自关联)
dynasties / sources / data_panels / meta   辅助展示
```

`items` 一张表承载十二门类；人物与帝王通过 `ptype / birth / death` 扩展，避免为每类建表导致维护碎片化。
`v_items` 视图把分类名与标签串拼好，API 直接读取。

关键字段：

| 字段 | 说明 |
|---|---|
| `id` | 稳定主键，如 `ppl-yuefei`、`tl-1140`、`mil-yancheng` |
| `category_id` | 十二门类之一 |
| `type` / `ptype` | 条目类型 / 人物子类型 |
| `era` | 北宋、南宋、辽、西夏、金、大理、元… |
| `year` / `end_year` | 公元纪年（跨年事件取起始年） |
| `summary` / `detail` | 一句话提要 / 完整叙述 |
| `minor` | 年表中的次要事件标记 |

## API

同一套接口既可跑动态服务（`server/app.py`），也对应静态构建产物，`.json` 后缀可省略：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/bootstrap` | 全量数据，前端一次加载（gzip 后约 96 KB） |
| GET | `/api/meta` | 分类、政权、来源、计数 |
| GET | `/api/items?cat=&era=&type=&q=&sort=&limit=&offset=` | 列表 / 筛选 / 搜索 |
| GET | `/api/items/<id>` | 详情，含标签与关联 |
| GET | `/api/search?q=&limit=` | 快速检索 |
| GET | `/api/timeline?era=` | 年表 |
| GET | `/api/people?ptype=` | 人物 |
| GET | `/api/stats` | 分类计数 |
| GET | `/api/health` | 健康检查 |

示例：

```bash
curl 'http://127.0.0.1:8000/api/items?cat=military&era=南宋&limit=5'
curl 'http://127.0.0.1:8000/api/search?q=岳飞'
curl 'http://127.0.0.1:8000/api/items/ppl-yuefei'
```

## 外部富化：维基百科 / 维基数据

原创的 `summary` / `detail` 保留不变；详情页的「百科条目」来自中文维基百科正文，单独存放在 `item_sources` 表，并保留：

- 条目标题、URL、修订号（`revision_id`）
- 许可（CC BY-SA 4.0）与抓取时间
- 维基数据 QID，可跳转 Wikidata
- 匹配置信度，低于阈值的条目不写入

```bash
# 小批量试跑
python3 tools/enrich_wiki.py --limit 20

# 全量（已缓存的跳过；可反复运行）
python3 tools/enrich_wiki.py

# 抓正文前 4000 字（默认只抓导言）
python3 tools/enrich_wiki.py --full

# 只把偏短的条目升级为正文
python3 tools/enrich_wiki.py --full --upgrade-short 600

# 只做人物 / 强制刷新 / 只报告不写库
python3 tools/enrich_wiki.py --cat people
python3 tools/enrich_wiki.py --refresh
python3 tools/enrich_wiki.py --dry-run
```

抓取结果同时写入 `db/wiki_cache.json`，重建数据库时会自动导入，因此离线也能保留富化内容；报告见 `db/wiki_report.json`（含未命中与低置信度候选）。

**许可与来源**：维基百科正文遵循 CC BY-SA 4.0，详情页已保留署名、链接、修订号与许可说明；二次分发时请同样保留。维基数据以 CC0 提供。

**关于百度百科**：详情页提供「百度百科」外链，但不抓取、不复制正文。原因是没有类似 CC 的开放许可，且站点有反爬限制；直接批量搬运会有版权与合规风险。

## 长期维护

用 CLI 维护，避免手改二进制。日常流程是：`manage.py` 改库 → `manage.py export` 刷新 `db/seed.json` 快照 → `python3 build.py` 出静态站。`seed.json` + `wiki_cache.json` 是随仓库分发的可复现内容源，`song.db` 可随时删掉重建：

```bash
# 查看
python3 tools/manage.py stats
python3 tools/manage.py list --cat customs
python3 tools/manage.py search 缠足
python3 tools/manage.py show cus-yuanxiao

# 体检：门类×政权 覆盖矩阵、完全孤立条目、重名、缺字段
python3 tools/audit.py
python3 tools/audit.py --orphans      # 只列出无任何关联的 id
python3 tools/audit.py --strict       # 重名或字段异常时非零退出（可接 CI）

# 新增（准备 item.json）
python3 tools/manage.py add item.json
python3 tools/manage.py add batch.json --upsert

# 修改（只需写要改的字段，tags 会整体替换）
python3 tools/manage.py update ppl-yuefei patch.json

# 删除
python3 tools/manage.py rm ppl-yuefei --yes

# 备份 / 迁移
python3 tools/manage.py export --out db/seed.json
python3 tools/manage.py import db/seed.json
```

新增条目最小 JSON：

```json
{
  "id": "cus-example",
  "cat": "customs",
  "type": "节令",
  "name": "示例节",
  "era": "南宋",
  "year": 1200,
  "tags": ["节令", "临安"],
  "summary": "一句话提要。",
  "detail": "完整叙述。",
  "refs": "《梦粱录》"
}
```

修改后刷新浏览器即可；API 不缓存。若改了 `schema.sql`，需自行写迁移或 `python3 db/init_db.py --force` 重建（会丢失库内手工修改，先 `export`）。

## 前端功能

- 全局检索（`⌘K` / `Ctrl+K` / `/`），支持 `#分类`、`@人物` 语法
- 十二门类浏览 + 政权 / 类型 / 年代筛选
- 年表：年代轴（按政权着色、点击定位）+ 十年分段 + 按政权筛选计数 + 「仅看大事」；条目卡片直出相关人物/条目
- 人物志按身份分组、按生年排序
- 条目详情弹窗，关联条目可跳转，键盘 ← → 翻页
- 数据面板（人口、财政、军备、科举、城市）
- 响应式 + 打印样式

## 后续可扩展

1. **全文检索**：现在前端是内存子串匹配，数据量到万级再考虑。注意 SQLite FTS5 的 `trigram` 分词器**最短 3 字**，`岳飞`/`苏轼` 这类两字查询会返回空；中文要么用 jieba 预分词影子列，要么用 bigram。
2. **写接口 / 管理后台**：`server/app.py` 目前只读；可加本地 token 保护的 POST/PUT/DELETE。
3. **地图**：接入 Leaflet/MapLibre + 历史政区 GeoJSON（需另找数据源）。
4. **谱系图**：人物关系已入 `item_relations`，可做力导向图。
5. **版本化**：`items` 增加 revisions 表，保留编辑历史。
6. **多语言**：条目增加 `lang` 维度。

## 许可与免责

内容为公开史料与常见研究综述的整理，供学习、检索与二次开发使用。
历史数据与叙述难免疏漏，欢迎按上表结构补充、校正。
# 推广手册 · 大宋全局志

目标人群：宋史爱好者、历史科普读者、地图/可视化爱好者、数字人文研究者。

## 一、已就绪的转化要素

- [x] README 首屏：五朝帝系族谱截图 + 在线体验按钮 + 一句话定位
- [x] 在线 Demo：https://iihao.github.io/song-dynasty/（含手机端）
- [x] 数据可复现（`python3 db/init_db.py --force && python3 build.py`）
- [ ] Settings → Social preview 上传 `docs/screenshot-lineage.png`

## 二、首发文案

### 小红书 / 微博（配帝系截图 + 人物图谱截图）

**标题**：把宋辽金西夏的皇帝做成了一张族谱图

**正文**：
看宋史最绕的是什么？北宋南宋一堆「宗」，辽金西夏又各有一套，谁是谁的儿子、谁过继给谁、谁袭了爵，看书根本记不住。

我做了个网页，把五朝帝系画成族谱：
👑 宋、辽、金、西夏、大理，五朝一屏切换
👑 每个皇帝标庙号、在位年、排行、嫡庶、支系
👑 金色「帝」角标＝即位之君，虚线小框是后妃
👑 过继关系单独用青绿点线标出来（比如赵昚是高宗的养子）
👑 点皇帝直接看词条

还有 1049 条结构化资料：年表、舆图、人物关系图、宋词、制度、经济数据。

在线打开就能用，不用注册：
https://iihao.github.io/song-dynasty/

开源地址（搜「大宋全局志」）：https://github.com/iihao/song-dynasty
觉得有意思点个 star ⭐

#宋史 #历史 #数据可视化 #宋朝 #族谱 #知识图谱

### 知乎（回答「有哪些做得好的宋朝历史资料站/可视化？」）

推荐一个自己做的：**大宋全局志**
https://iihao.github.io/song-dynasty/

- **1049 条结构化条目**：人物 317、名篇 204、年表 135，另有军事、经济、制度、科技、风俗等门类
- **五朝帝系族谱**：宋、辽、金、西夏、大理，标出庙号、在位年、排行、嫡庶、支系；过继（英宗—仁宗、孝宗—高宗、理宗—宁宗、度宗—理宗）单独画线
- **人物关系图谱**：按身份分岛（帝王/名臣/名将/文豪…），连线分君臣/同朝/同袍/文友，点线能看到两人对照
- **势力舆图**：11 个关键年份、26 座城市的政权势力范围
- **宋词语料**：83 首词作、58 个词牌、29 部词集

技术上：SQLite + Python 标准库 + 原生 JS，零 npm 依赖，一条命令构建纯静态站点。
源码（MIT）：https://github.com/iihao/song-dynasty

### V2EX（分享创造）

**标题**：做了个宋朝历史的可视化资料库，1049 条数据 + 五朝帝系族谱

**正文**：
业余在读宋史，受不了「人物太多、年表太散」，就把两宋辽金西夏整理成了一个站。

- 帝系：宋/辽/金/西夏/大理五朝族谱，含后妃、帝姬公主、过继关系
- 人物：317 人，按身份分簇的关系图谱，可搜索定位
- 舆图：11 个年份的势力范围
- 数据：SQLite 存储，Python 标准库出 JSON，前端零依赖
- 部署：`build.py` 生成纯静态，扔 GitHub Pages

在线：https://iihao.github.io/song-dynasty/
源码：https://github.com/iihao/song-dynasty

数据考据欢迎挑错，尤其是辽金西夏的世系。

### X / HN（英文）

**Show HN: A structured atlas of Song-dynasty China (1049 entries, zero deps)**

I built a static atlas of the Song period (960–1279) and its neighbours (Liao, Jin, Western Xia, Dali): 1049 structured entries, an imperial genealogy for five houses (with empresses, princesses and adoption lines), a character relationship graph, a territory map across 11 years, and a 宋词 corpus.

SQLite + Python stdlib + vanilla JS. No npm. MIT.

https://iihao.github.io/song-dynasty/

## 三、渠道与节奏

| 优先级 | 渠道 | 说明 |
|---|---|---|
| P0 | 小红书 | 首图放帝系截图，「皇帝家谱」是最直观的钩子 |
| P0 | 知乎 | 搜「宋朝 资料」「宋史 可视化」类问题作答 |
| P1 | V2EX 分享创造 | 技术人群转化最高 |
| P1 | 豆瓣「宋史」小组 | 精准但挑剔，强调欢迎考据 |
| P2 | X / HN | 英文，配 GIF |
| P2 | 历史类公众号投稿 | 「历史研习社」「国家人文历史」类 |

首发后 48 小时回复所有评论；一次只发一个渠道，根据反馈改文案。

## 四、长期曝光

1. awesome 列表：awesome-history、awesome-dataviz、awesome-digital-humanities、awesome-chinese
2. 周刊：HelloGitHub、GitHubDaily、阮一峰周刊
3. Release：`v1.0.0` 打 tag，Release 页会被搜索引擎收录
4. Discussions / Issue 模板：收集考据纠错，活跃度影响推荐权重

## 五、待办素材

- [ ] 帝系交互 GIF（切换五朝 + 点开孝宗看养父连线）
- [ ] 「数据来源与口径」独立页面（宋史读者最在意可信度）
- [ ] 英文 README

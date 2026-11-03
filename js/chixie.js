/* 《持械入宋》人物·年份图谱 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  var FACTION = {
    team:     { label: '主角团',   color: '#a8352a' },
    song:     { label: '北宋军民', color: '#2f6457' },
    court:    { label: '宋室',     color: '#9a6a35' },
    literary: { label: '文坛',     color: '#6b5b8c' },
    enemy:    { label: '敌对势力', color: '#4a5a72' }
  };

  var NODES = [
    {
      id: 'linzhao', name: '林昭', sub: '队长 · 京片子', faction: 'team',
      x: 550, y: 330, r: 42, years: [1122, 1123, 1124, 1125, 1126, 1127],
      tags: ['原创', '核心'],
      first: '第1章',
      desc: '现代特战小队队长，冷静果决，负责统筹全局。穿越后以清河村为起点，练兵、筑寨、抗西夏，逐步嵌入北宋西军体系，第三卷知秦州，第四卷直面靖康之变。',
      rel: '小队核心；与秦红缨有婚约线；受种师中赏识；招揽岳飞。'
    },
    {
      id: 'xiechangfeng', name: '谢长风', sub: '狙击手', faction: 'team',
      x: 370, y: 230, r: 30, years: [1122, 1123, 1124, 1125, 1126, 1127],
      tags: ['原创', '武力'],
      first: '第1章',
      desc: '小队狙击手，负责远程火力与武力保障。弹药有限，是全书“现代武器降维”的主要执行者之一。',
      rel: '林昭的战友；小队远程支点。'
    },
    {
      id: 'mazhenbang', name: '马振邦', sub: '军械师 · 东北口音', faction: 'team',
      x: 735, y: 225, r: 30, years: [1122, 1123, 1124, 1125, 1126, 1127],
      tags: ['原创', '技术'],
      first: '第1章',
      desc: '军械师，一口东北大碴子。负责改良弓弩、制造炸弹与各类器械，是团队“搞钱”和武器升级的关键。',
      rel: '林昭的战友；清河弩、守城器械的主要设计者。'
    },
    {
      id: 'wanghaochuan', name: '王浩川', sub: '通信兵 · 科举入仕', faction: 'team',
      x: 765, y: 420, r: 30, years: [1122, 1123, 1124, 1125, 1126, 1127],
      tags: ['原创', '朝堂'],
      first: '第1章',
      desc: '通信兵，广东仔，负责情报组网。后参加科举并中进士，成为小队在北宋朝堂的核心支撑。',
      rel: '林昭的战友；与赵福金（剧中赵宜宁）有 CP 线。'
    },
    {
      id: 'chensu', name: '陈素', sub: '医官 · 湘妹子', faction: 'team',
      x: 365, y: 435, r: 30, years: [1122, 1123, 1124, 1125, 1126, 1127],
      tags: ['原创', '医疗'],
      first: '第1章',
      desc: '小队医官，湘妹子，负责战地医疗与公共卫生。第四卷在秦州设医馆，是团队扎根地方的重要一环。',
      rel: '林昭的战友；第四卷“陈娘子初临秦州府”的主角之一。'
    },
    {
      id: 'qinhongying', name: '秦红缨', sub: '秦家女 · 婚约', faction: 'song',
      x: 550, y: 492, r: 30, years: [1122, 1123, 1124, 1125, 1126, 1127],
      tags: ['原创', '情感线'],
      first: '第31章',
      desc: '秦家女子，性格泼辣果决，与林昭定下婚约，是全书最重要的感情线之一。第三卷“血染缨红”后命运牵动主角团。',
      rel: '林昭的未婚妻/红颜；秦家与清河村的地方纽带。'
    },
    {
      id: 'dishen', name: '狄申', sub: '狄青后人', faction: 'song',
      x: 245, y: 335, r: 30, years: [1122, 1123, 1124, 1125, 1126, 1127],
      tags: ['原创', '地方武力'],
      first: '第16章',
      desc: '自称狄青后人，清河村一带的地方武力首领。最早与主角团接触的地方豪杰之一，后成为林昭在西北的重要盟友。',
      rel: '林昭的盟友；连接清河村、秦州地方势力。'
    },
    {
      id: 'zhongshizhong', name: '种师中', sub: '北宋大将 · 小种', faction: 'song',
      x: 300, y: 150, r: 30, years: [1122, 1123, 1124, 1125, 1126],
      tags: ['历史人物', '西军'],
      first: '第56章',
      desc: '北宋西军名将，种师道之弟，人称“小种”。在书中较早赏识主角团，是林昭进入北宋军制体系的引路人之一。',
      rel: '种师道之弟；林昭的上级/赏识者；岳飞旧部体系的相关人物。'
    },
    {
      id: 'zhongshidao', name: '种师道', sub: '老种 · 种师中兄', faction: 'song',
      x: 130, y: 215, r: 28, years: [1123, 1124, 1125, 1126],
      tags: ['历史人物', '西军'],
      first: '第145章',
      desc: '北宋名将，种师中之兄，人称“老种”。靖康年间率西军勤王，是北宋末最重要的军事支柱之一。',
      rel: '种师中之兄；靖康勤王的关键人物。'
    },
    {
      id: 'yuefei', name: '岳飞', sub: '字鹏举 · 剧中 岳武', faction: 'song',
      x: 590, y: 112, r: 30, years: [1124, 1125, 1126, 1127],
      tags: ['历史人物', '短剧改编名'],
      first: '第193章',
      desc: '历史名将岳飞。书中第三卷以“岳鹏举”登场，随后“岳飞来投”，成为主角团麾下的年轻将领。短剧改编名“岳武”。',
      rel: '林昭招揽的将领；与种师中同属北宋西军脉络。'
    },
    {
      id: 'wenzhijie', name: '温知节', sub: '地方官员', faction: 'song',
      x: 445, y: 76, r: 24, years: [1123, 1124, 1125, 1126],
      tags: ['原创', '官场'],
      first: '第113章',
      desc: '北宋地方官员，第二卷“温知节警醒”登场。代表主角团必须应对的官僚体系与地方治理逻辑。',
      rel: '林昭的官场对手/合作者。'
    },
    {
      id: 'zhaofujin', name: '赵福金', sub: '茂德帝姬 · 剧中 赵宜宁', faction: 'court',
      x: 895, y: 230, r: 34, years: [1123, 1124, 1125, 1126, 1127],
      tags: ['历史人物', '短剧改编名', '宋室'],
      first: '第173章',
      desc: '宋徽宗之女茂德帝姬，历史原名赵福金。书中第二卷“二见帝姬”登场，第四卷有“赵福金，见我”“霸道总裁赵福金”等章节。短剧改编名“赵宜宁”。',
      rel: '宋徽宗之女；赵九（原型赵构）的姐姐；与王浩川有剧中 CP 线；靖康之难中被掳。'
    },
    {
      id: 'zhaojiu', name: '赵九', sub: '剧中角色 · 原型赵构', faction: 'court',
      x: 968, y: 345, r: 27, years: [1126, 1127],
      tags: ['短剧原创', '宋室'],
      first: '短剧设定',
      desc: '短剧中的宋室王爷，原型为康王赵构（后来的宋高宗）。剧中以“霸总王爷”形象出现，是宋室线的重要角色。',
      rel: '赵福金（赵宜宁）之弟；靖康之后南宋建立的关键人物。'
    },
    {
      id: 'liqingzhao', name: '李清照', sub: '易安居士 · 剧中 李清棠', faction: 'literary',
      x: 835, y: 545, r: 30, years: [1126, 1127],
      tags: ['历史人物', '短剧改编名', '文坛'],
      first: '第327章',
      desc: '宋代女词人李清照。第四卷以“一曲震易安”“李清照来访”登场，短剧改编名“李清棠”。她的出现把主角团与北宋文坛、士大夫世界连接起来。',
      rel: '林昭的来访者/知交；与赵明诚的史实婚姻不在本图展开。'
    },
    {
      id: 'xixia', name: '西夏', sub: '党项政权', faction: 'enemy',
      x: 100, y: 480, r: 34, years: [1122, 1123, 1124, 1125],
      tags: ['势力', '敌对'],
      first: '第124章',
      desc: '西北党项政权。第二卷“西夏动了”，第三卷主角团“杀进西夏去”，小说以架空方式提前终结西夏威胁。',
      rel: '林昭/狄申的边患对手；小说第三卷的主要战争对象。'
    },
    {
      id: 'jin', name: '金', sub: '女真政权', faction: 'enemy',
      x: 985, y: 480, r: 34, years: [1125, 1126, 1127],
      tags: ['势力', '敌对'],
      first: '第四卷',
      desc: '女真金国。真实历史中灭辽后南下，制造靖康之变；小说第四卷“靖康无耻”的核心对手。',
      rel: '北宋/宋室的终极对手；靖康之变的发动者。'
    }
  ];

  var EDGES = [
    ['linzhao', 'xiechangfeng', '战友'],
    ['linzhao', 'mazhenbang', '战友'],
    ['linzhao', 'wanghaochuan', '战友'],
    ['linzhao', 'chensu', '战友 / 剧中CP'],
    ['linzhao', 'qinhongying', '婚约 / 红颜'],
    ['linzhao', 'dishen', '盟友'],
    ['linzhao', 'zhongshizhong', '赏识 / 上下级'],
    ['linzhao', 'yuefei', '招揽'],
    ['linzhao', 'wenzhijie', '官场'],
    ['linzhao', 'liqingzhao', '来访 / 知交'],
    ['zhongshizhong', 'zhongshidao', '兄弟'],
    ['wanghaochuan', 'zhaofujin', '剧中CP'],
    ['zhaofujin', 'zhaojiu', '姐弟'],
    ['xixia', 'linzhao', '交战', true],
    ['xixia', 'dishen', '边患', true],
    ['jin', 'zhaofujin', '靖康被掳', true],
    ['jin', 'zhaojiu', '宋金对峙', true]
  ];

  var YEARS = [
    {
      year: 1122, era: '宣和四年', title: '穿越 · 清河村',
      events: [
        '五人小队携械坠入大宋，落点西北边陲清河村（第1章）',
        '狄申入村，主角团取得地方武力信任（第16—18章）',
        '秦红缨登场，婚约线展开（第31、50—51章）',
        '种师中登场；清河村大战与巷战（第56—70章）'
      ],
      real: '史实：宋联金攻辽，童贯攻燕京失败；金取燕京。'
    },
    {
      year: 1123, era: '宣和五年', title: '陇城 · 东京',
      events: [
        '北上陇城，卷入西夏游骑与边军（第89—136章）',
        '东京初秋、廷争；赵福金/帝姬线（第107、173—177章）',
        '王浩川科举中进士，进入朝堂（第181章）',
        '温知节、种师道相继登场（第113、145章）'
      ],
      real: '史实：宋以岁币换燕京空城；张觉事件；金责宋纳叛。'
    },
    {
      year: 1124, era: '宣和六年', title: '秦州 · 岳飞来投',
      events: [
        '第三卷开局，再次北上（第189—192章）',
        '岳飞以“岳鹏举”登场，随后“岳飞来投”（第193、221章）',
        '岳家庄线；主角团在秦州站稳（第201章起）',
        '知秦州，秦州成为第四卷的政治基地'
      ],
      real: '史实：金灭辽后整军；宋内部党争；西北局势紧张。'
    },
    {
      year: 1125, era: '宣和七年', title: '草原 · 灭西夏（架空）',
      events: [
        '主角团深入草原，夺取牛羊战马，缓解前线危机',
        '架空主线：发兵西夏，“给我杀进西夏去”（第229章起）',
        '西夏威胁被提前终结，西北战局改写',
        '金灭辽，宋金战争一触即发'
      ],
      real: '史实：金灭辽；分道攻宋；徽宗禅位钦宗。小说让主角团提前灭夏，属架空。'
    },
    {
      year: 1126, era: '靖康元年', title: '汴京 · 李清照',
      events: [
        '李清照/易安线：“一曲震易安”“李清照来访”（第327、349章）',
        '奉调回京，林昭入境，汴京围城（第350—360章）',
        '赵福金、赵九与宋室线展开',
        '种师道勤王，西军与金军正面碰撞'
      ],
      real: '史实：金军围汴京，李纲守城，种师道勤王；割地议和。'
    },
    {
      year: 1127, era: '靖康二年', title: '汴梁 · 靖康之变',
      events: [
        '“一入汴梁深似海”（第496章），主角团进入北宋权力核心',
        '靖康之变，北宋灭亡，主角团面临“救宋”终局',
        '赵福金/赵宜宁、赵九等宋室人物命运转折',
        '全书在“知心大姐姐”（第502章）收束'
      ],
      real: '史实：汴京陷落，徽钦二帝北掳，北宋亡；赵构后来建立南宋。'
    }
  ];

  var byId = {};
  NODES.forEach(function (n) { byId[n.id] = n; });

  var state = { year: 'all', selected: null, hover: null };

  var svg = document.getElementById('graph');
  var detail = document.getElementById('detail');
  var yearBtns = document.getElementById('yearBtns');
  var timelineEl = document.getElementById('timeline');

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function edgeEndpoints(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len;
    return {
      x1: a.x + ux * (a.r + 6), y1: a.y + uy * (a.r + 6),
      x2: b.x - ux * (b.r + 6), y2: b.y - uy * (b.r + 6),
      mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2
    };
  }

  function renderGraph() {
    svg.innerHTML = '';
    var gEdges = el('g', { class: 'cx-edges' }, svg);
    var gNodes = el('g', { class: 'cx-nodes' }, svg);

    EDGES.forEach(function (e) {
      var a = byId[e[0]], b = byId[e[1]];
      if (!a || !b) return;
      var p = edgeEndpoints(a, b);
      var g = el('g', {
        class: 'cx-edge' + (e[3] ? ' conflict' : ''),
        'data-a': a.id, 'data-b': b.id
      }, gEdges);
      el('line', { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2 }, g);
      var t = el('text', { x: p.mx, y: p.my - 4, 'text-anchor': 'middle' }, g);
      t.textContent = e[2];
    });

    NODES.forEach(function (n) {
      var f = FACTION[n.faction] || FACTION.song;
      var g = el('g', {
        class: 'cx-node',
        'data-id': n.id,
        transform: 'translate(' + n.x + ',' + n.y + ')',
        tabindex: '0',
        role: 'button',
        'aria-label': n.name
      }, gNodes);
      el('circle', { r: n.r, stroke: f.color }, g);
      if (n.tags.indexOf('短剧改编名') >= 0 || n.tags.indexOf('短剧原创') >= 0) {
        el('circle', { r: n.r + 4, class: 'drama-ring' }, g);
      }
      var name = el('text', { class: 'n-name', y: -3 }, g);
      name.textContent = n.name;
      var sub = el('text', { class: 'n-sub', y: n.r + 15 }, g);
      sub.textContent = n.sub;
      var yr = el('text', { class: 'n-years', y: n.r + 26 }, g);
      yr.textContent = n.years[0] + '—' + n.years[n.years.length - 1];
      g.addEventListener('click', function () { selectNode(n.id); });
      g.addEventListener('mouseenter', function () { hoverNode(n.id); });
      g.addEventListener('mouseleave', function () { hoverNode(null); });
      g.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectNode(n.id); }
      });
    });
    applyFilters();
  }

  function applyFilters() {
    var y = state.year;
    document.querySelectorAll('.cx-node').forEach(function (g) {
      var n = byId[g.getAttribute('data-id')];
      var active = y === 'all' || n.years.indexOf(y) >= 0;
      g.classList.toggle('dim', !active);
    });
    document.querySelectorAll('.cx-edge').forEach(function (g) {
      var a = byId[g.getAttribute('data-a')], b = byId[g.getAttribute('data-b')];
      var active = y === 'all' || (a.years.indexOf(y) >= 0 && b.years.indexOf(y) >= 0);
      g.classList.toggle('dim', !active);
    });
    document.querySelectorAll('.cx-year-card').forEach(function (c) {
      c.classList.toggle('on', String(y) === c.getAttribute('data-year'));
    });
    document.querySelectorAll('.cx-years button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-year') === String(y));
    });
  }

  function hoverNode(id) {
    state.hover = id;
    document.querySelectorAll('.cx-node').forEach(function (g) {
      var nid = g.getAttribute('data-id');
      var related = id && (nid === id || EDGES.some(function (e) {
        return (e[0] === id && e[1] === nid) || (e[1] === id && e[0] === nid);
      }));
      g.classList.toggle('hl', !!related);
    });
    document.querySelectorAll('.cx-edge').forEach(function (g) {
      var on = id && (g.getAttribute('data-a') === id || g.getAttribute('data-b') === id);
      g.classList.toggle('hl', !!on);
      g.style.opacity = id ? (on ? 1 : .18) : '';
    });
  }

  function selectNode(id) {
    state.selected = id;
    document.querySelectorAll('.cx-node').forEach(function (g) {
      g.classList.toggle('sel', g.getAttribute('data-id') === id);
    });
    var n = byId[id];
    if (!n) return;
    var f = FACTION[n.faction] || FACTION.song;
    var rels = EDGES.filter(function (e) { return e[0] === id || e[1] === id; })
      .map(function (e) {
        var other = byId[e[0] === id ? e[1] : e[0]];
        return { id: other.id, name: other.name, label: e[2] };
      });
    detail.innerHTML =
      '<h3>' + esc(n.name) + '<small>' + esc(n.sub) + '</small></h3>' +
      '<div class="d-tags">' +
        '<span class="f">' + esc(f.label) + '</span>' +
        n.tags.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') +
      '</div>' +
      '<p>' + esc(n.desc) + '</p>' +
      '<div class="d-meta">' +
        '<span><b>登场</b> ' + esc(n.first) + '</span>' +
        '<span><b>活跃年份</b> ' + n.years.join(' / ') + '</span>' +
        '<span><b>关系</b> ' + esc(n.rel) + '</span>' +
      '</div>' +
      '<div class="d-rel">' + rels.map(function (r) {
        return '<button data-goto="' + r.id + '">' + esc(r.name) + ' · ' + esc(r.label) + '</button>';
      }).join('') + '</div>';
    detail.querySelectorAll('[data-goto]').forEach(function (b) {
      b.addEventListener('click', function () { selectNode(b.getAttribute('data-goto')); });
    });
  }

  function selectYear(y) {
    state.year = y;
    applyFilters();
    var data = YEARS.filter(function (d) { return String(d.year) === String(y); })[0];
    if (data) {
      detail.innerHTML =
        '<h3>' + data.year + ' 年<small>' + esc(data.era) + ' · ' + esc(data.title) + '</small></h3>' +
        '<p>' + data.events.map(function (e) { return '· ' + esc(e); }).join('<br>') + '</p>' +
        '<div class="d-meta"><span><b>史实背景</b> ' + esc(data.real) + '</span></div>';
    } else {
      detail.innerHTML = '<div class="cx-detail-empty">已显示全部年份。点击图中人物查看说明。</div>';
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function buildControls() {
    var opts = [{ v: 'all', t: '全部' }].concat(YEARS.map(function (y) {
      return { v: y.year, t: String(y.year) };
    }));
    yearBtns.innerHTML = opts.map(function (o) {
      return '<button data-year="' + o.v + '">' + o.t + '</button>';
    }).join('');
    yearBtns.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () { selectYear(b.getAttribute('data-year')); });
    });
    document.getElementById('resetBtn').addEventListener('click', function () {
      state.selected = null;
      selectYear('all');
      document.querySelectorAll('.cx-node').forEach(function (g) { g.classList.remove('sel'); });
    });

    timelineEl.innerHTML = YEARS.map(function (y) {
      return '<article class="cx-year-card" data-year="' + y.year + '">' +
        '<div class="yc-year">' + y.year + '</div>' +
        '<div class="yc-era">' + esc(y.era) + '</div>' +
        '<div class="yc-title">' + esc(y.title) + '</div>' +
        '<ul>' + y.events.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' +
        '<div class="yc-real">' + esc(y.real) + '</div>' +
        '</article>';
    }).join('');
    timelineEl.querySelectorAll('.cx-year-card').forEach(function (c) {
      c.addEventListener('click', function () { selectYear(c.getAttribute('data-year')); });
    });
  }

  buildControls();
  renderGraph();
  selectYear('all');
  selectNode('linzhao');
})();
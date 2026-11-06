/* 大宋全局志 — 前端逻辑（零依赖，数据来自 SQLite API） */
(function () {
  'use strict';

  function boot(D) {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var byId = {};
  D.items.forEach(function (it) { byId[it.id] = it; });

  var state = {
    view: 'overview',
    cat: 'all',
    q: '',
    era: '',
    type: '',
    sort: 'year',
    list: [],
    modalIndex: -1,
    modalSeq: 0
  };

  var catMap = {};
  D.categories.forEach(function (c) { catMap[c.id] = c; });
  function catName(id) { return (catMap[id] || {}).name || id; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function hl(text, q) {
    text = esc(text);
    if (!q) return text;
    var terms = q.split(/\s+/).filter(Boolean).map(function (t) {
      return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    if (!terms.length) return text;
    return text.replace(new RegExp('(' + terms.join('|') + ')', 'gi'), '<mark class="hl">$1</mark>');
  }
  function eraClass(era) {
    return era || '';
  }
  function debounce(fn, ms) {
    var t;
    return function () {
      var self = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }
  // 外部链接只允许 http(s)，避免数据里混进 javascript: 之类的 scheme
  function safeUrl(u) {
    var s = String(u == null ? '' : u).trim();
    return /^https?:\/\//i.test(s) ? s : '';
  }
  function yearLabel(it) {
    if (it.year == null) return '';
    if (it.endYear && it.endYear !== it.year) return it.year + '–' + it.endYear;
    return String(it.year);
  }
  function itemSub(it) {
    var bits = [];
    if (it.era) bits.push(it.era);
    if (it.type) bits.push(it.type);
    if (it.year != null) bits.push(yearLabel(it) + '年');
    return bits.join(' · ');
  }

  /* ---------------- 路由 ---------------- */
  function parseHash() {
    var h = (location.hash || '#overview').replace(/^#/, '');
    var parts = h.split('/');
    return { view: parts[0] || 'overview', arg: parts[1] || '' };
  }
  function go(view, arg) {
    location.hash = '#' + view + (arg ? '/' + arg : '');
  }
  function applyRoute() {
    var r = parseHash();
    if (r.view === 'item') {
      $$('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-overview'); });
      var iid = decodeURIComponent(r.arg || '');
      if (iid) openItem(iid);
      return;
    }
    if (r.view === 'browse') state.cat = r.arg || 'all';
    if (r.view === 'people' && r.arg) peopleType = decodeURIComponent(r.arg);
    if (['overview', 'timeline', 'map', 'lineage', 'browse', 'people', 'data', 'about'].indexOf(r.view) < 0) r.view = 'overview';
    state.view = r.view;
    $$('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + r.view); });
    $$('[data-nav]').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === r.view);
    });
    $('#mainnav').classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    if (r.view === 'browse') renderBrowse();
    if (r.view === 'timeline') renderTimeline();
    if (r.view === 'map') renderMap(r.arg);
    if (r.view === 'lineage') renderLineage(r.arg);
    if (r.view === 'people') renderPeople();
    if (r.view === 'data') renderData();
  }

  /* ---------------- 帝系（各国皇室族谱） ---------------- */
  var lgState = { fam: '', zoom: 1, manual: false };

  function lineageNodeSVG(n, x, y, w, h, color) {
    var born = n.born === '庶' ? ' shu' : (n.born === '嫡' ? ' di' : '');
    var cls = 'lg-node' + born + (n.inher ? ' inher' : '') + (n.temple ? '' : ' minor');
    var aria = [n.temple, n.name, n.reign, n.rk, n.house, n.note].filter(Boolean).join(' · ');
    var parts = ['<g class="' + cls + '" data-id="' + esc(n.id) + '" tabindex="0" role="button" aria-label="' + esc(aria) + '">',
      '<title>' + esc(aria) + '</title>',
      '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3" stroke="' + color + '"/>'];
    if (born) {
      parts.push('<rect class="lg-born' + born + '" x="' + (x + 1) + '" y="' + (y + 1) +
        '" width="3" height="' + (h - 2) + '" rx="1.5"/>');
    }
    // 三行：庙号 / 姓名 / 在位年·支系
    if (n.temple) {
      parts.push('<text class="lg-temple" x="' + (x + w / 2) + '" y="' + (y + 15) + '">' + esc(n.temple) + '</text>');
    }
    var nameY = n.temple ? y + 32 : y + 24;
    parts.push('<text class="lg-name" x="' + (x + w / 2) + '" y="' + nameY + '">' + esc(n.name) + '</text>');
    var sub = [n.reign, n.house].filter(Boolean).join(' · ');
    if (sub) {
      parts.push('<text class="lg-sub" x="' + (x + w / 2) + '" y="' + (y + h - 9) + '">' +
        esc(sub.length > 18 ? sub.slice(0, 17) + '…' : sub) + '</text>');
    }
    if (n.inher) {
      parts.push('<rect class="lg-inher-badge" x="' + (x + w - 19) + '" y="' + (y + 4) + '" width="15" height="15" rx="2"/>' +
        '<text class="lg-inher-t" x="' + (x + w - 11.5) + '" y="' + (y + 15) + '">帝</text>');
    }
    if (n.rk && n.rk !== '始祖') {
      parts.push('<text class="lg-rk" x="' + (x + 3) + '" y="' + (y - 4) + '">' + esc(n.rk) + '</text>');
    }
    parts.push('</g>');
    return parts.join('');
  }

  function renderLineage(fam) {
    var list = D.lineages || [];
    if (!list.length) return;
    if (fam && list.some(function (l) { return l.id === fam; })) lgState.fam = fam;
    if (!lgState.fam) lgState.fam = list[0].id;
    var lg = list.filter(function (l) { return l.id === lgState.fam; })[0] || list[0];

    $('#lineageTabs').innerHTML = list.map(function (l) {
      return '<button class="chip' + (l.id === lg.id ? ' on' : '') + '" data-fam="' + l.id + '">' +
        '<i class="dot" style="display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;background:' +
        esc(l.color || '#8a8073') + '"></i>' + esc(l.name) + '</button>';
    }).join('');
    $$('#lineageTabs .chip').forEach(function (b) {
      b.addEventListener('click', function () { go('lineage', b.getAttribute('data-fam')); });
    });

    var nodes = (lg.nodes || []).slice();
    var NW = 132, NH = 60, ROW = 118, L = 56, T = 58, GAP = 18;
    var byId2 = {}, children = {};
    nodes.forEach(function (n) { byId2[n.id] = n; });
    nodes.forEach(function (n) {
      if (n.parent && byId2[n.parent]) (children[n.parent] = children[n.parent] || []).push(n.id);
    });
    var roots = nodes.filter(function (n) { return !n.parent || !byId2[n.parent]; }).map(function (n) { return n.id; });

    var cursor = L, pos = {};
    function walk(id) {
      var kids = children[id] || [];
      if (!kids.length) {
        var left = cursor;
        cursor += NW + GAP;
        pos[id] = left + NW / 2;
        return pos[id];
      }
      var blockLeft = cursor;
      var xs = kids.map(walk);
      var c = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2;
      c = Math.max(c, blockLeft + NW / 2);
      pos[id] = c;
      cursor = Math.max(cursor, c + NW / 2 + GAP);
      return c;
    }
    roots.forEach(walk);

    var maxGen = Math.max.apply(null, nodes.map(function (n) { return n.gen; }));
    var W = Math.max(cursor + 36, 360);
    var H = T + (maxGen - 1) * ROW + NH + 46;
    var svg = $('#lgSvg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('height', 'auto');

    var parts = [];
    for (var gi = 1; gi <= maxGen; gi++) {
      var bandY = T + (gi - 1) * ROW - NH / 2 - 8;
      parts.push('<rect class="lg-band" x="0" y="' + bandY + '" width="' + W + '" height="' + ROW + '"/>');
      parts.push('<text class="lg-gen-label" x="18" y="' + (bandY + ROW / 2 + 4) + '">' +
        (['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八'][gi - 1] || gi) + '世</text>');
    }

    function rowTop(gen) { return T + (gen - 1) * ROW; }
    nodes.forEach(function (n) {
      if (!n.parent || !byId2[n.parent]) return;
      var p = byId2[n.parent];
      var px = pos[p.id], cx = pos[n.id];
      var py = rowTop(p.gen) + NH + 2, cy = rowTop(n.gen) - 2;
      var midY = (py + cy) / 2;
      var skip = n.gen - p.gen > 1;
      parts.push('<path class="lg-link' + (skip ? ' skip' : '') + '" d="M' + px + ',' + py +
        ' L' + px + ',' + midY + ' L' + cx + ',' + midY + ' L' + cx + ',' + cy + '"/>');
    });

    nodes.forEach(function (n) {
      var x = pos[n.id] - NW / 2, y = rowTop(n.gen);
      parts.push(lineageNodeSVG(n, x, y, NW, NH, lg.color || '#8a8073'));
    });

    svg.innerHTML = parts.join('');
    $$('.lg-node[data-id]', svg).forEach(function (el) {
      var id = el.getAttribute('data-id');
      if (!byId[id]) { el.classList.add('nolink'); el.removeAttribute('tabindex'); return; }
      el.addEventListener('click', function () { openItem(id); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openItem(id); }
      });
    });
    $('#lgNote').textContent = lg.note || '';

    if (!lgState.manual) {
      var box = $('#lgScroll');
      var avail = box ? box.clientWidth : 0;
      lgState.zoom = (avail && W > avail) ? Math.max(0.45, Math.min(1, avail / W)) : 1;
    }
    syncLgZoom();

    var sc = $('#lgScroll');
    if (sc) sc.scrollLeft = 0;
  }

  function syncLgZoom() {
    var svg = $('#lgSvg');
    if (!svg) return;
    var vb = (svg.getAttribute('viewBox') || '0 0 1000 500').split(/\s+/);
    var vw = parseFloat(vb[2]) || 1000;
    svg.style.width = Math.max(320, Math.round(vw * lgState.zoom)) + 'px';
    svg.style.margin = '0 auto';
    svg.style.minWidth = '0';
    var lbl = $('#lgZoomLabel');
    if (lbl) lbl.textContent = Math.round(lgState.zoom * 100) + '%';
  }

  /* ---------------- 总览 ---------------- */
  function renderOverview() {
    var counts = { all: D.items.length };
    D.items.forEach(function (i) { counts[i.cat] = (counts[i.cat] || 0) + 1; });
    var people = D.items.filter(function (i) { return i.cat === 'people'; }).length;
    var tl = D.items.filter(function (i) { return i.cat === 'timeline'; });
    var tlYears = tl.map(function (i) { return i.year; }).filter(function (y) { return y != null; });
    var minYear = tlYears.length ? Math.min.apply(null, tlYears) : 960;
    var maxYear = tlYears.length ? Math.max.apply(null, tlYears) : 1279;
    var span = maxYear - minYear;

    $('#heroStats').innerHTML = [
      [D.items.length, '条目', '收录总量'],
      [people, '人物', '两宋及并立政权'],
      [tl.length, '年表', '关键历史节点'],
      [span, '年跨度', minYear + ' — ' + maxYear]
    ].map(function (s) {
      return '<div class="s"><b>' + s[0] + '<em>' + s[1] + '</em></b><span>' + s[2] + '</span></div>';
    }).join('');

    // 政权带
    var minY = 900, maxY = 1280;
    $('#dynastyBand').innerHTML = D.dynasties.map(function (d) {
      var left = (Math.max(d.start, minY) - minY) / (maxY - minY) * 100;
      var width = (Math.min(d.end, maxY) - Math.max(d.start, minY)) / (maxY - minY) * 100;
      return '<div class="drow"><div class="dname">' + esc(d.name) + '</div>' +
        '<div class="dtrack"><div class="dbar" style="left:' + left + '%;width:' + width + '%;background:' + d.color + '">' +
        d.start + '–' + d.end + '</div></div></div>';
    }).join('') +
      '<div class="axis"><div></div><div class="ticks">' + [900, 960, 1020, 1080, 1140, 1200, 1280].map(function (y) { return '<span>' + y + '</span>'; }).join('') + '</div></div>';

    // 分类
    $('#catGrid').innerHTML = D.categories.map(function (c) {
      return '<div class="cat-card" data-cat="' + c.id + '">' +
        '<span class="cicon">' + c.icon + '</span>' +
        '<h3>' + esc(c.name) + '</h3><p>' + esc(c.desc) + '</p>' +
        '<div class="ccount">' + (counts[c.id] || 0) + ' 条 →</div></div>';
    }).join('');
    $$('#catGrid .cat-card').forEach(function (el) {
      el.addEventListener('click', function () { go('browse', el.getAttribute('data-cat')); });
    });

    // 年表节选（每 30 年取最近一条）
    var picks = [], last = -999;
    tl.slice().sort(function (a, b) { return a.year - b.year; }).forEach(function (it) {
      if (it.year - last >= 26) { picks.push(it); last = it.year; }
    });
    $('#miniTimeline').innerHTML = picks.slice(0, 8).map(function (it) {
      return '<li data-id="' + it.id + '"><div class="mt-year">' + it.year + '</div>' +
        '<div><div class="mt-title">' + esc(it.name) + '</div><div class="mt-sub">' + esc(it.summary) + '</div></div></li>';
    }).join('');
    bindOpen('#miniTimeline [data-id]');

    // 随机
    var pool = D.items.filter(function (i) { return i.cat !== 'timeline' && i.cat !== 'people'; });
    var rand = [];
    while (rand.length < 3 && pool.length) {
      rand.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    $('#randomCards').innerHTML = rand.map(cardHTML).join('');
    bindOpen('#randomCards .card');

    $('#footerCount').textContent = '当前收录 ' + D.items.length + ' 条 · ' + D.categories.length + ' 门类';
  }

  /* ---------------- 卡片 ---------------- */
  function cardHTML(it) {
    var tags = (it.tags || []).slice(0, 4).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
    return '<article class="card" data-id="' + it.id + '">' +
      '<div class="meta">' + (it.year != null ? '<span class="yr">' + yearLabel(it) + '</span>' : '') +
      '<span class="tp">' + esc(it.type || catName(it.cat)) + '</span>' +
      (it.era ? '<span>' + esc(it.era) + '</span>' : '') + '</div>' +
      '<h3>' + hl(it.name, state.q) + '</h3>' +
      '<p>' + hl(it.summary || '', state.q) + '</p>' +
      '<div class="tags">' + (it.era ? '<span class="tag era">' + esc(it.era) + '</span>' : '') + tags + '</div>' +
      '</article>';
  }
  function bindOpen(sel) {
    $$(sel).forEach(function (el) {
      el.addEventListener('click', function () { openItem(el.getAttribute('data-id')); });
    });
  }

  /* ---------------- 典藏 ---------------- */
  function filterItems() {
    var q = state.q.trim();
    var catFilter = null, personFilter = null;
    var m = q.match(/#(\S+)/); if (m) { catFilter = m[1]; q = q.replace(m[0], '').trim(); }
    m = q.match(/@(\S+)/); if (m) { personFilter = m[1]; q = q.replace(m[0], '').trim(); }
    var low = q.toLowerCase();

    return D.items.filter(function (it) {
      if (state.cat !== 'all' && it.cat !== state.cat) return false;
      if (catFilter && catName(it.cat) !== catFilter && it.cat !== catFilter) return false;
      if (state.era && it.era !== state.era) return false;
      if (state.type && it.type !== state.type) return false;
      if (personFilter && (it.name + ' ' + (it.tags || []).join(' ') + ' ' + (it.summary || '')).indexOf(personFilter) < 0) return false;
      if (low) {
        var hay = (it.name + ' ' + (it.summary || '') + ' ' + (it.detail || '') + ' ' +
          (it.body || '') + ' ' + (it.tags || []).join(' ') + ' ' + (it.era || '') +
          ' ' + (it.type || '')).toLowerCase();
        if (hay.indexOf(low) < 0) return false;
      }
      return true;
    });
  }
  function sortItems(list) {
    var s = state.sort;
    return list.slice().sort(function (a, b) {
      if (s === 'name') return a.name.localeCompare(b.name, 'zh-Hans-CN');
      if (s === 'cat') return (a.cat + String(a.year || 0)).localeCompare(b.cat + String(b.year || 0));
      var ya = a.year == null ? 9999 : a.year, yb = b.year == null ? 9999 : b.year;
      return ya - yb || a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
  }
  function renderSidebar() {
    var counts = { all: D.items.length };
    D.items.forEach(function (i) { counts[i.cat] = (counts[i.cat] || 0) + 1; });
    var html = '<li class="' + (state.cat === 'all' ? 'on' : '') + '" data-cat="all">全部<span>' + counts.all + '</span></li>';
    html += D.categories.map(function (c) {
      return '<li class="' + (state.cat === c.id ? 'on' : '') + '" data-cat="' + c.id + '">' +
        esc(c.name) + '<span>' + (counts[c.id] || 0) + '</span></li>';
    }).join('');
    $('#catList').innerHTML = html;
    $$('#catList li').forEach(function (el) {
      el.addEventListener('click', function () { go('browse', el.getAttribute('data-cat')); });
    });
  }
  function fillSelect(sel, values, current, placeholder) {
    sel.innerHTML = '<option value="">' + placeholder + '</option>' +
      values.map(function (v) { return '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
  }
  function renderBrowse() {
    renderSidebar();
    var c = catMap[state.cat];
    $('#browseEyebrow').textContent = c ? 'COLLECTION · ' + state.cat.toUpperCase() : 'COLLECTION';
    $('#browseTitle').textContent = c ? c.name : '全部典藏';
    $('#browseDesc').textContent = c ? c.desc : '全部条目，按分类与年代编排。';

    var pool = D.items.filter(function (it) { return state.cat === 'all' || it.cat === state.cat; });
    var eras = Array.from(new Set(pool.map(function (i) { return i.era; }).filter(Boolean))).sort();
    var types = Array.from(new Set(pool.map(function (i) { return i.type; }).filter(Boolean))).sort();
    if (state.era && eras.indexOf(state.era) < 0) state.era = '';
    if (state.type && types.indexOf(state.type) < 0) state.type = '';
    fillSelect($('#filterEra'), eras, state.era, '全部政权');
    fillSelect($('#filterType'), types, state.type, '全部类型');

    var list = sortItems(filterItems());
    state.list = list;
    $('#resultCount').textContent = list.length + ' / ' + D.items.length + ' 条';
    $('#browseGrid').innerHTML = list.map(cardHTML).join('');
    $('#browseEmpty').hidden = list.length > 0;
    bindOpen('#browseGrid .card');
  }

  /* ---------------- 舆图 ---------------- */
  function renderMap(year) {
    window.__songItems = byId;
    if (window.renderSongMap) {
      window.renderSongMap({ openItem: openItem, year: year ? parseInt(year, 10) : null });
    }
  }

  /* ---------------- 年表 · 图谱 ---------------- */
  var TL_ERA_FALLBACK = { '五代': '#8a6a55', '大理': '#7a7f5a', '元': '#4a4a52', '两宋': '#7a7a7a' };
  var tlEra = 'all';
  var tlMajor = false;
  var tlView = 'graph';
  var tlZoom = 1;
  var TG = {
    rowH: 30, subRows: 3, lanePad: 12, gutter: 96,
    basePPY: 6, minPPY: 2.5, maxPPY: 26,
    top: 34, axisH: 30, nodeR: 5.2
  };
  var tgState = { selected: null, hovered: null, nodes: [], edges: [], ppy: TG.basePPY, minY: 900, maxY: 1290 };

  function eraColor(era) {
    var hit = (D.dynasties || []).filter(function (d) { return d.name === era; })[0];
    return (hit && hit.color) || TL_ERA_FALLBACK[era] || '#6b6458';
  }
  function decadeOf(y) { return Math.floor(y / 10) * 10; }

  function textWidth(str, size) {
    var w = 0;
    for (var i = 0; i < str.length; i++) {
      w += str.charCodeAt(i) > 255 ? size : size * 0.55;
    }
    return w;
  }

  /* 泳道顺序：按政权先后，稳定的哈希色 */
  function laneOrder(items) {
    var counts = {};
    items.forEach(function (it) { counts[it.era] = (counts[it.era] || 0) + 1; });
    var order = (D.dynasties || []).map(function (d) { return d.name; });
    var extras = Object.keys(counts).filter(function (n) { return order.indexOf(n) < 0; })
      .sort(function (a, b) { return counts[b] - counts[a]; });
    return order.concat(extras).filter(function (n) { return counts[n]; })
      .map(function (n) { return { era: n, count: counts[n], color: eraColor(n) }; });
  }

  function buildGraphModel(items, visibleIds) {
    var lanes = laneOrder(items);
    var years = items.map(function (it) { return it.year; }).filter(function (y) { return y != null; });
    var minY = decadeOf(Math.min.apply(null, years)) - 20;
    var maxY = Math.ceil((Math.max.apply(null, years) + 1) / 10) * 10 + 10;
    var px = function (year) { return (year - minY) * tgState.ppy; };

    var nodes = [], nodeMap = {}, laneMeta = [], top = 0;

    lanes.forEach(function (lane) {
      var laneItems = items.filter(function (it) { return it.era === lane.era; })
        .sort(function (a, b) {
          return a.year - b.year || (a.minor ? 1 : -1) || a.name.localeCompare(b.name, 'zh-Hans-CN');
        });
      var rowsEnd = [];
      var local = [];
      laneItems.forEach(function (it) {
        var x = px(it.year);
        // 低缩放时次要事件只留圆点，避免泳道被标签撑高
        var compact = tgState.ppy < 4.6;
        var label = (it.minor && compact) ? '' : (it.minor ? String(it.year) : it.year + ' ' + it.name);
        var w = label ? textWidth(label, it.minor ? 9.5 : 10.5) + 16 : 0;
        var row = -1;
        // 优先放在已有行里第一个不重叠的位置
        for (var k = 0; k < rowsEnd.length; k++) {
          if (x > rowsEnd[k] + 10) { row = k; break; }
        }
        if (row < 0) { row = rowsEnd.length; rowsEnd.push(-1e9); }
        rowsEnd[row] = x + w;

        var fitVisible = visibleIds && visibleIds.indexOf(it.id) >= 0;
        local.push({
          id: it.id, item: it, x: x, row: row, label: label,
          r: it.minor ? TG.nodeR - 1.8 : TG.nodeR,
          color: eraColor(it.era), on: !!fitVisible
        });
      });

      var rows = Math.max(1, rowsEnd.length);
      var h = rows * TG.rowH;
      local.forEach(function (n) {
        n.laneTop = top;
        n.y = top + n.row * TG.rowH + TG.rowH / 2 + 2;
        nodes.push(n);
        nodeMap[n.id] = n;
      });
      laneMeta.push({ era: lane.era, color: lane.color, count: lane.count, top: top, h: h, rows: rows });
      top += h + TG.lanePad;
    });

    var edges = [];
    items.forEach(function (it) {
      var a = nodeMap[it.id];
      if (!a) return;
      (it.related || []).forEach(function (rid) {
        var id = typeof rid === 'string' ? rid : rid && rid.id;
        var b = nodeMap[id];
        if (!b || b === a) return;
        if (edges.some(function (e) {
          return (e.a === a.id && e.b === b.id) || (e.a === b.id && e.b === a.id);
        })) return;
        edges.push({ a: a.id, b: b.id });
      });
    });

    return { lanes: lanes, laneMeta: laneMeta, nodes: nodes, nodeMap: nodeMap,
      edges: edges, minY: minY, maxY: maxY, lanesH: top };
  }

  function tgWidth() { return (tgState.maxY - tgState.minY) * tgState.ppy + 180; }

  function renderGraph(items, visibleIds) {
    var m = buildGraphModel(items, visibleIds);
    tgState.nodes = m.nodes;
    tgState.edges = m.edges;
    tgState.nodeMap = m.nodeMap;
    tgState.minY = m.minY;
    tgState.maxY = m.maxY;

    var maxLabel = 0;
    m.nodes.forEach(function (n) { maxLabel = Math.max(maxLabel, textWidth(n.label, 10.5) + 24); });
    var W = (m.maxY - m.minY) * tgState.ppy + Math.max(160, maxLabel);
    var H = m.lanesH + TG.top + TG.axisH;
    var svg = $('#tgSvg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);

    var px = function (year) { return (year - m.minY) * tgState.ppy; };
    var parts = [];

    // 泳道底色 + 政权存续区间
    m.laneMeta.forEach(function (lane, li) {
      var y0 = TG.top + lane.top;
      parts.push('<rect class="tg-lane-bg' + (li % 2 ? ' alt' : '') + '" x="0" y="' + y0 +
        '" width="' + W + '" height="' + lane.h + '"/>');
      var dy = (D.dynasties || []).filter(function (d) { return d.name === lane.era; })[0];
      if (dy) {
        var x1 = Math.max(0, px(dy.start)), x2 = Math.min(W, px(dy.end));
        if (x2 > x1) {
          parts.push('<rect class="tg-lane-span" x="' + x1 + '" y="' + (y0 + lane.h - 4) +
            '" width="' + (x2 - x1) + '" height="3" rx="1.5" fill="' + lane.color + '" opacity=".3"/>');
        }
      }
    });

    // 十年网格 + 世纪刻度
    for (var y = m.minY; y <= m.maxY; y += 10) {
      var x = px(y);
      var major = y % 50 === 0;
      parts.push('<line class="tg-grid' + (major ? ' major' : '') + '" x1="' + x + '" y1="' + TG.top +
        '" x2="' + x + '" y2="' + (TG.top + m.lanesH) + '"/>');
      if (major) {
        parts.push('<text class="tg-year" x="' + x + '" y="' + (TG.top + m.lanesH + 18) + '">' + y + '</text>');
      }
    }

    // 关联线（先画，压在节点下）
    m.edges.forEach(function (e) {
      var a = m.nodeMap[e.a], b = m.nodeMap[e.b];
      if (!a || !b) return;
      var mx = (a.x + b.x) / 2;
      var lift = Math.min(70, Math.abs(b.x - a.x) * 0.08) + 12;
      var my = Math.min(a.y, b.y) - lift;
      parts.push('<path class="tg-edge" data-a="' + a.id + '" data-b="' + b.id + '" d="M' + a.x + ',' + a.y +
        ' Q' + mx + ',' + my + ' ' + b.x + ',' + b.y + '"/>');
    });

    // 节点
    m.nodes.forEach(function (n) {
      var cls = 'tg-node' + (n.item.minor ? ' minor' : '') + (n.on ? '' : ' dim');
      parts.push('<g class="' + cls + '" data-id="' + esc(n.id) + '" tabindex="0" role="button"' +
        ' aria-label="' + esc(n.item.year + ' ' + n.item.name) + '">');
      parts.push('<circle class="tg-hit" cx="' + n.x + '" cy="' + n.y + '" r="10"/>');
      parts.push('<circle class="tg-dot" cx="' + n.x + '" cy="' + n.y + '" r="' + n.r +
        '" fill="' + n.color + '"/>');
      if (n.label) {
        parts.push('<text class="tg-label" x="' + (n.x + n.r + 5) + '" y="' + (n.y + 3.4) + '">' +
          esc(n.label) + '</text>');
      }
      parts.push('<title>' + esc(n.item.year + ' · ' + n.item.name) + '</title>');
      parts.push('</g>');
    });

    svg.innerHTML = parts.join('');

    // 左侧固定泳道表头（与 svg 行高一致）
    $('#tgLanes').innerHTML = m.laneMeta.map(function (l) {
      return '<div class="tg-lane" style="height:' + (l.h + TG.lanePad) + 'px">' +
        '<i style="background:' + l.color + '"></i>' +
        '<span>' + esc(l.era) + '</span><em>' + l.count + '</em></div>';
    }).join('');
    $('#tgLanes').style.paddingTop = TG.top + 'px';

    bindGraphEvents();
    $('#tgZoomLabel').textContent = Math.round(tgState.ppy / TG.basePPY * 100) + '%';
  }

  /* 只在悬停时淡出无关节点；选中只做标记，避免关闭弹窗后整图仍是灰的 */
  function tgHighlight(id) {
    var svg = $('#tgSvg');
    var on = !!id;
    var near = {};
    if (id) {
      near[id] = true;
      tgState.edges.forEach(function (e) {
        if (e.a === id) near[e.b] = true;
        if (e.b === id) near[e.a] = true;
      });
    }
    $$('.tg-node', svg).forEach(function (g) {
      var nid = g.getAttribute('data-id');
      var hit = !on || near[nid];
      g.classList.toggle('faded', on && !hit);
      g.classList.toggle('near', on && hit && nid !== id);
      g.classList.toggle('sel', nid === tgState.selected);
    });
    $$('.tg-edge', svg).forEach(function (p) {
      var related = on && (p.getAttribute('data-a') === id || p.getAttribute('data-b') === id);
      p.classList.toggle('hl', !!related);
      p.classList.toggle('faded', on && !related);
    });
    var tip = $('#tgTip');
    if (id && tgState.nodeMap && tgState.nodeMap[id]) {
      var it = tgState.nodeMap[id].item;
      tip.innerHTML = '<b>' + it.year + '</b> · ' + esc(it.era || '') + ' · ' + esc(it.name);
      tip.hidden = false;
    } else {
      tip.hidden = true;
    }
  }

  function bindGraphEvents() {
    var svg = $('#tgSvg');
    $$('.tg-node', svg).forEach(function (g) {
      var id = g.getAttribute('data-id');
      g.addEventListener('click', function (e) {
        e.stopPropagation();
        tgState.selected = id;
        tgHighlight(null);   // 清掉悬停淡出，只留 sel 标记
        openItem(id);
      });
      g.addEventListener('mouseenter', function () { tgState.hovered = id; tgHighlight(id); });
      g.addEventListener('mouseleave', function () {
        tgState.hovered = null;
        tgHighlight(null);
      });
      g.addEventListener('focus', function () { tgHighlight(id); });
      g.addEventListener('blur', function () { tgHighlight(null); });
      g.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openItem(id); }
      });
    });
    svg.addEventListener('mouseleave', function () { tgHighlight(null); });
  }

  function renderTimelineList(items) {
    var lastDec = null;
    $('#timelineList').innerHTML = items.map(function (it) {
      var dec = decadeOf(it.year);
      var head = dec !== lastDec ? '<div class="tl-decade">' + dec + '年代</div>' : '';
      lastDec = dec;
      var rel = (it.related || []).map(function (r) {
        var obj = (typeof r === 'string') ? byId[r] : r;
        return obj ? '<button data-rel="' + esc(obj.id) + '">' + esc(obj.name) + '</button>' : '';
      }).join('');
      return head +
        '<div class="tl-item ' + (it.minor ? 'minor' : 'major') + '" data-tl-id="' + esc(it.id) + '"' +
        ' style="--era:' + eraColor(it.era) + '">' +
        '<div class="tl-year">' + it.year + '<small>' + esc(it.era + ' · ' + (it.minor ? '次要' : '大事')) + '</small></div>' +
        '<div class="tl-card" data-id="' + esc(it.id) + '">' +
        '<h3>' + esc(it.name) + '</h3><p>' + esc(it.summary) + '</p>' +
        '<div class="tags">' + (it.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>' +
        (rel ? '<div class="tl-rel"><span style="font-size:10px;letter-spacing:.16em;color:var(--ink-3);align-self:center">相关</span>' + rel + '</div>' : '') +
        '</div></div>';
    }).join('');

    $$('#timelineList .tl-card').forEach(function (el) {
      el.addEventListener('click', function (e) {
        var rel = e.target.closest ? e.target.closest('[data-rel]') : null;
        if (rel) { e.stopPropagation(); openItem(rel.getAttribute('data-rel')); return; }
        openItem(el.getAttribute('data-id'));
      });
    });
  }

  function jumpToTimeline(id) {
    if (tlView === 'graph') {
      var n = tgState.nodeMap && tgState.nodeMap[id];
      if (!n) { openItem(id); return; }
      tgState.selected = id;
      tgHighlight(id);
      var sc = $('#tgScroll');
      sc.scrollTo({ left: Math.max(0, n.x - sc.clientWidth / 2), behavior: 'smooth' });
      return;
    }
    var el = document.querySelector('#timelineList [data-tl-id="' + id + '"]');
    if (!el) { openItem(id); return; }
    el.scrollIntoView({ block: 'center' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    setTimeout(function () { el.classList.remove('flash'); }, 1500);
  }

  function renderTimeline() {
    var all = D.items.filter(function (it) { return it.cat === 'timeline'; })
      .sort(function (a, b) { return a.year - b.year; });

    var counts = {};
    all.forEach(function (it) { counts[it.era] = (counts[it.era] || 0) + 1; });
    var lanes = laneOrder(all);

    var list = all.filter(function (it) {
      if (tlEra !== 'all' && it.era !== tlEra) return false;
      return !(tlMajor && it.minor);
    });
    state.list = list;
    var visibleIds = list.map(function (it) { return it.id; });

    var chips = '<button class="chip ' + (tlEra === 'all' ? 'on' : '') + '" data-era="all">全部<em>' + all.length + '</em></button>';
    chips += lanes.map(function (l) {
      return '<button class="chip ' + (tlEra === l.era ? 'on' : '') + '" data-era="' + esc(l.era) + '"' +
        ' style="--era:' + l.color + '"><i class="dot"></i>' + esc(l.era) +
        '<em>' + l.count + '</em></button>';
    }).join('');
    chips += '<button class="chip toggle ' + (tlMajor ? 'on' : '') + '" data-major="1">仅看大事</button>';
    $('#timelineFilters').innerHTML = chips;

    $$('#timelineFilters .chip').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.hasAttribute('data-major')) tlMajor = !tlMajor;
        else tlEra = b.getAttribute('data-era');
        renderTimeline();
      });
    });

    $('#tgLegend').innerHTML = lanes.map(function (l) {
      return '<span><i style="background:' + l.color + '"></i>' + esc(l.era) + '</span>';
    }).join('') + '<span class="tg-count">' + list.length + ' / ' + all.length + ' 条</span>';

    // 视图切换
    $$('[data-tlview]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-tlview') === tlView);
      b.onclick = function () {
        tlView = b.getAttribute('data-tlview');
        renderTimeline();
      };
    });
    var graphOn = tlView === 'graph';
    $('#tgCard').hidden = !graphOn;
    $('#tlListWrap').hidden = graphOn;
    $('#tgZoom').hidden = !graphOn;

    if (graphOn) {
      if (!tgState.fitted) {
        var avail = $('#tgScroll').clientWidth - 16;
        if (avail > 240) {
          var span0 = (tgState.maxY || 1100) - (tgState.minY || 900);
          tgState.ppy = Math.max(TG.minPPY, Math.min(TG.maxPPY, avail / (span0 || 380)));
          tgState.fitted = true;
        }
      }
      renderGraph(all, visibleIds);
      tgHighlight(null);
    } else {
      renderTimelineList(list);
      $('#tgTip').hidden = true;
    }

    // 缩放
    $$('#tgZoom [data-zoom]').forEach(function (b) {
      b.onclick = function () {
        var mode = b.getAttribute('data-zoom');
        if (mode === 'in') tgState.ppy = Math.min(TG.maxPPY, tgState.ppy * 1.45);
        else if (mode === 'out') tgState.ppy = Math.max(TG.minPPY, tgState.ppy / 1.45);
        else {
          var avail = $('#tgScroll').clientWidth - 24;
          tgState.ppy = Math.max(TG.minPPY, Math.min(TG.maxPPY, avail / (tgState.maxY - tgState.minY)));
        }
        renderTimeline();
      };
    });
  }

  /* ---------------- 人物 ---------------- */  /* ---------------- 人物 ---------------- */
  var peopleType = 'all';
  var peopleQ = '';
  function renderPeople() {
    var pool = D.items.filter(function (i) { return i.cat === 'people'; });
    var fallback = Array.from(new Set(pool.map(function (i) { return i.ptype || '其他'; })));
    var types = ['all'].concat(D.groups && D.groups.length ? D.groups : fallback);
    var q = peopleQ.trim().toLowerCase();
    var list = pool.filter(function (i) {
      if (peopleType !== 'all') {
        var gs = (i.groups && i.groups.length) ? i.groups : [i.ptype || '其他'];
        if (gs.indexOf(peopleType) < 0) return false;
      }
      if (!q) return true;
      var hay = (i.name + ' ' + (i.ptype || '') + ' ' + (i.era || '') + ' ' +
        (i.summary || '') + ' ' + (i.tags || []).join(' ')).toLowerCase();
      return hay.indexOf(q) >= 0;
    }).sort(function (a, b) {
      var ya = a.birth == null ? 9999 : a.birth, yb = b.birth == null ? 9999 : b.birth;
      return ya - yb;
    });
    $('#peopleFilters').innerHTML = types.map(function (t) {
      return '<button class="chip ' + (peopleType === t ? 'on' : '') + '" data-pt="' + esc(t) + '">' +
        (t === 'all' ? '全部' : t) + '</button>';
    }).join('') + '<span class="result-count">' + list.length + ' / ' + pool.length + ' 人</span>';
    $$('#peopleFilters .chip').forEach(function (b) {
      b.addEventListener('click', function () { peopleType = b.getAttribute('data-pt'); renderPeople(); });
    });
    state.list = list;
    $('#peopleGrid').innerHTML = list.map(function (p) {
      var life = (p.birth != null ? p.birth : '?') + '—' + (p.death != null ? p.death : '?');
      var roles = (p.groups && p.groups.length) ? p.groups.join(' · ') : (p.ptype || '');
      return '<div class="person" data-id="' + p.id + '">' +
        '<div class="avatar">' + esc(p.name.slice(0, 1)) + '</div>' +
        '<div><div class="pname">' + esc(p.name) + '</div>' +
        '<div class="pmeta">' + life + ' · ' + esc(p.era || '') + (roles ? ' · ' + esc(roles) : '') + '</div>' +
        '<div class="pdesc">' + esc(p.summary || '') + '</div></div></div>';
    }).join('');
    bindOpen('#peopleGrid .person');
    setPeopleView(pgState.view);
  }


  /* ---------------- 人物关系图谱 ---------------- */
  var PG = { W: 1400, H: 900, pad: 46 };
  var pgState = { view: 'list', selected: null, hovered: null, zoom: 1, tx: 0, ty: 0, nodes: [], edges: [], nodeMap: {} };
  var pgGroupColor = {
    '帝王': '#a8352a', '名臣': '#2f6457', '名将': '#8a3b30', '文豪': '#6b5b8c',
    '思想家': '#3f6b8a', '科学家': '#2f7a6b', '艺术家': '#9a5f2f', '女性': '#a8486a',
    '僧道': '#6b6b52', '起义': '#8a5a2f', '外族': '#4a5a72', '宋室': '#9a6a35'
  };

  function pgColor(n) {
    var gs = n.item.groups && n.item.groups.length ? n.item.groups : [n.item.ptype || '其他'];
    for (var i = 0; i < gs.length; i++) {
      if (gs[i] !== '人物' && pgGroupColor[gs[i]]) return pgGroupColor[gs[i]];
    }
    return '#6b6458';
  }

  function pgBuild() {
    var people = D.items.filter(function (i) { return i.cat === 'people'; });
    var ids = {};
    people.forEach(function (p) { ids[p.id] = p; });

    var edges = [], seen = {};
    people.forEach(function (p) {
      (p.related || []).forEach(function (r) {
        var rid = typeof r === 'string' ? r : (r && r.id);
        if (!rid || !ids[rid] || rid === p.id) return;
        var key = p.id < rid ? p.id + '|' + rid : rid + '|' + p.id;
        if (seen[key]) return;
        seen[key] = 1;
        edges.push({ a: p.id, b: rid });
      });
    });

    var degree = {};
    edges.forEach(function (e) { degree[e.a] = (degree[e.a] || 0) + 1; degree[e.b] = (degree[e.b] || 0) + 1; });

    var nodes = Object.keys(degree).map(function (id, i) {
      return { id: id, item: ids[id], deg: degree[id], x: 0, y: 0, vx: 0, vy: 0, i: i };
    });
    return { nodes: nodes, edges: edges, degree: degree, total: people.length };
  }

  /* 力导向：分簇（身份锚点）+ 斥力 + 弹簧，确定性初始化，跑固定轮数 */
  function pgGroupKey(n) {
    var gs = (n.item.groups && n.item.groups.length) ? n.item.groups : [n.item.ptype || '其他'];
    for (var i = 0; i < gs.length; i++) {
      if (gs[i] !== '人物' && pgGroupColor[gs[i]]) return gs[i];
    }
    return gs[0] || '其他';
  }

  function pgLayout(model) {
    var nodes = model.nodes, edges = model.edges;
    var n = nodes.length;
    if (!n) return;
    var cx = PG.W / 2, cy = PG.H / 2;

    // 身份锚点：围绕中心排一圈，让同类聚在一处
    var keys = [];
    nodes.forEach(function (nd) {
      var k = pgGroupKey(nd);
      if (keys.indexOf(k) < 0) keys.push(k);
    });
    var anchors = {};
    var AR = Math.min(PG.W, PG.H) * 0.34;
    keys.forEach(function (k, i) {
      var a = (i / keys.length) * Math.PI * 2 - Math.PI / 2;
      anchors[k] = { x: cx + Math.cos(a) * AR, y: cy + Math.sin(a) * AR };
    });

    nodes.forEach(function (node, i) {
      var k = pgGroupKey(node);
      var an = anchors[k];
      var a = i * 2.399963229728653;
      var rr = 46 + (i % 11) * 5;
      node.x = an.x + Math.cos(a) * rr;
      node.y = an.y + Math.sin(a) * rr;
      node.vx = node.vy = 0;
      node.ax = an.x; node.ay = an.y;
    });

    var byId = {};
    nodes.forEach(function (nd) { byId[nd.id] = nd; });
    var links = edges.map(function (e) { return { s: byId[e.a], t: byId[e.b] }; });

    var alpha = 1, decay = 0.972, iters = 520;
    var repulse = 3000, springK = 0.06, springLen = 58;
    var anchorK = 0.09, centerK = 0.010;

    for (var it = 0; it < iters; it++) {
      alpha *= decay;
      for (var i = 0; i < n; i++) {
        var a = nodes[i];
        for (var j = i + 1; j < n; j++) {
          var b = nodes[j];
          var dx = b.x - a.x, dy = b.y - a.y;
          var d2 = dx * dx + dy * dy;
          if (d2 < 4) { d2 = 4; dx = (i % 9 - 4) * 0.4; dy = (j % 9 - 4) * 0.4; }
          if (d2 > 200000) continue;
          var f = repulse * alpha / d2;
          var d = Math.sqrt(d2);
          var fx = dx / d * f, fy = dy / d * f;
          a.vx -= fx; a.vy -= fy;
          b.vx += fx; b.vy += fy;
        }
      }
      links.forEach(function (l) {
        var dx = l.t.x - l.s.x, dy = l.t.y - l.s.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        var f = (d - springLen) * springK * alpha;
        var fx = dx / d * f, fy = dy / d * f;
        l.s.vx += fx; l.s.vy += fy;
        l.t.vx -= fx; l.t.vy -= fy;
      });
      nodes.forEach(function (node) {
        node.vx += (node.ax - node.x) * anchorK * alpha;
        node.vy += (node.ay - node.y) * anchorK * alpha;
        node.vx += (cx - node.x) * centerK * alpha;
        node.vy += (cy - node.y) * centerK * alpha;
        node.vx *= 0.80; node.vy *= 0.80;
        node.x += node.vx; node.y += node.vy;
        node.x = Math.max(PG.pad, Math.min(PG.W - PG.pad, node.x));
        node.y = Math.max(PG.pad, Math.min(PG.H - PG.pad, node.y));
      });
    }

    // 归一化：把整簇缩放到画布中央，避免偏在一角
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(function (nd) {
      minX = Math.min(minX, nd.x); maxX = Math.max(maxX, nd.x);
      minY = Math.min(minY, nd.y); maxY = Math.max(maxY, nd.y);
    });
    var w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
    var k = Math.min((PG.W - PG.pad * 2) / w, (PG.H - PG.pad * 2) / h, 1.25);
    var ox = (PG.W - w * k) / 2 - minX * k;
    var oy = (PG.H - h * k) / 2 - minY * k;
    nodes.forEach(function (nd) {
      nd.x = nd.x * k + ox;
      nd.y = nd.y * k + oy;
      nd.k = k;
    });
  }

  function pgVisibleIds() {
    var q = ($('#peopleSearch') && $('#peopleSearch').value || '').trim().toLowerCase();
    var out = {};
    D.items.filter(function (i) { return i.cat === 'people'; }).forEach(function (i) {
      if (peopleType !== 'all') {
        var gs = (i.groups && i.groups.length) ? i.groups : [i.ptype || '其他'];
        if (gs.indexOf(peopleType) < 0) return;
      }
      if (q) {
        var hay = (i.name + ' ' + (i.ptype || '') + ' ' + (i.era || '') + ' ' +
          (i.summary || '') + ' ' + (i.tags || []).join(' ')).toLowerCase();
        if (hay.indexOf(q) < 0) return;
      }
      out[i.id] = 1;
    });
    return out;
  }

  function renderPeopleGraph() {
    var svg = $('#pgSvg');
    if (!svg) return;
    var model = pgBuild();
    pgState.nodes = model.nodes;
    pgState.edges = model.edges;
    var byId = {};
    model.nodes.forEach(function (n) { byId[n.id] = n; });
    pgState.nodeMap = byId;

    if (!model.nodes.length) {
      svg.innerHTML = '';
      $('#pgDetail').innerHTML = '<div class="pg-detail-empty">还没有人物关联数据。</div>';
      return;
    }

    // 复用上一次的坐标：每次重渲染都会新建节点对象，若不回填会全部落到 (0,0)
    var prev = pgState.pos || {};
    var needLayout = !pgState.laid;
    model.nodes.forEach(function (n) {
      var p = prev[n.id];
      if (p) { n.x = p[0]; n.y = p[1]; } else { needLayout = true; }
    });
    if (needLayout) pgLayout(model);
    pgState.laid = true;
    pgState.pos = {};
    model.nodes.forEach(function (n) { pgState.pos[n.id] = [n.x, n.y]; });

    var vis = pgVisibleIds();
    var shown = 0;
    var rOf = function (n) { return Math.min(9, 3.4 + Math.sqrt(n.deg) * 1.9); };

    var parts = [];
    parts.push('<g id="pgViewport">');
    // 边
    model.edges.forEach(function (e) {
      var a = byId[e.a], b = byId[e.b];
      if (!a || !b) return;
      var on = vis[e.a] && vis[e.b];
      if (on) shown++;
      parts.push('<line class="pg-edge' + (on ? '' : ' dim') + '" data-a="' + e.a + '" data-b="' + e.b +
        '" x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) +
        '" y2="' + b.y.toFixed(1) + '"/>');
    });
    // 节点
    model.nodes.forEach(function (n) {
      var on = !!vis[n.id];
      var g = '<g class="pg-node' + (on ? '' : ' dim') + (n.deg < 4 ? ' minor' : '') +
        '" data-id="' + n.id + '" tabindex="0" role="button"' +
        ' aria-label="' + esc(n.item.name) + '">';
      g += '<circle class="pg-halo" cx="' + n.x.toFixed(1) + '" cy="' + n.y.toFixed(1) + '" r="' + (rOf(n) + 4).toFixed(1) + '"/>';
      g += '<circle class="pg-dot" cx="' + n.x.toFixed(1) + '" cy="' + n.y.toFixed(1) + '" r="' + rOf(n).toFixed(1) +
        '" fill="' + pgColor(n) + '"/>';
      g += '<text class="pg-label" x="' + (n.x + rOf(n) + 3).toFixed(1) + '" y="' + (n.y + 3.2).toFixed(1) + '">' +
        esc(n.item.name) + '</text>';
      g += '<title>' + esc(n.item.name + ' · ' + (n.item.era || '') + ' · ' + n.deg + ' 条关联') + '</title>';
      g += '</g>';
      parts.push(g);
    });
    parts.push('</g>');
    svg.innerHTML = parts.join('');
    svg.setAttribute('viewBox', '0 0 ' + PG.W + ' ' + PG.H);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', 'auto');
    applyPgTransform();
    bindPeopleGraph();
    $('#pgCount').textContent = model.nodes.length + ' 位有互相关联 · ' + model.edges.length + ' 条关系 · 人物库共 ' + model.total + ' 位';
    var usedKeys = [];
    model.nodes.forEach(function (nd) {
      var k = pgGroupKey(nd);
      if (usedKeys.indexOf(k) < 0) usedKeys.push(k);
    });
    $('#pgLegend').innerHTML = usedKeys.map(function (k) {
      return '<span><i style="background:' + (pgGroupColor[k] || '#6b6458') + '"></i>' + esc(k) + '</span>';
    }).join('');
    $('#pgZoomLabel').textContent = Math.round(pgState.zoom * 100) + '%';
    pgHighlight(pgState.hovered);
  }

  function clampPan(v) {
    var lim = PG.W * 0.5;
    return Math.max(-lim, Math.min(lim, v));
  }

  function pgResetView() {
    pgState.zoom = 1;
    pgState.tx = 0;
    pgState.ty = 0;
    applyPgTransform();
    var lbl = document.getElementById('pgZoomLabel');
    if (lbl) lbl.textContent = '100%';
  }

  function applyPgTransform() {
    var vp = document.getElementById('pgViewport');
    if (vp) vp.setAttribute('transform',
      'translate(' + pgState.tx + ',' + pgState.ty + ') scale(' + pgState.zoom + ')');
  }

  function pgHighlight(id) {
    var svg = $('#pgSvg');
    if (!svg) return;
    var near = {};
    if (id) {
      near[id] = 1;
      pgState.edges.forEach(function (e) {
        if (e.a === id) near[e.b] = 1;
        if (e.b === id) near[e.a] = 1;
      });
    }
    $$('.pg-node', svg).forEach(function (g) {
      var nid = g.getAttribute('data-id');
      g.classList.toggle('faded', !!id && !near[nid]);
      g.classList.toggle('near', !!id && !!near[nid] && nid !== id);
      g.classList.toggle('sel', nid === pgState.selected);
    });
    $$('.pg-edge', svg).forEach(function (l) {
      var on = !!id && (l.getAttribute('data-a') === id || l.getAttribute('data-b') === id);
      l.classList.toggle('hl', on);
      l.classList.toggle('faded', !!id && !on);
    });
    var tip = $('#pgTip');
    if (id && pgState.nodeMap[id]) {
      var it = pgState.nodeMap[id].item;
      tip.innerHTML = '<b>' + esc(it.name) + '</b> ' + esc((it.groups || []).slice(0, 2).join(' / '));
      tip.hidden = false;
    } else {
      tip.hidden = true;
    }
  }

  function pgSelect(id) {
    pgState.selected = id;
    pgHighlight(id);
    var n = pgState.nodeMap[id];
    if (!n) return;
    var it = n.item;
    var rels = [];
    pgState.edges.forEach(function (e) {
      if (e.a === id && pgState.nodeMap[e.b]) rels.push([pgState.nodeMap[e.b].item, '']);
      else if (e.b === id && pgState.nodeMap[e.a]) rels.push([pgState.nodeMap[e.a].item, '']);
    });
    var life = (it.birth != null ? it.birth : '?') + '—' + (it.death != null ? it.death : '?');
    $('#pgDetail').innerHTML =
      '<div class="pgd-head"><i style="background:' + pgColor(n) + '"></i>' +
        '<h3>' + esc(it.name) + '</h3>' +
        '<span>' + esc(it.era || '') + ' · ' + life + '</span></div>' +
      '<div class="pgd-tags">' + (it.groups || []).map(function (g) {
        return '<span>' + esc(g) + '</span>';
      }).join('') + '</div>' +
      '<p class="pgd-summary">' + esc(it.summary || '') + '</p>' +
      '<div class="pgd-rel"><b>关联 ' + rels.length + ' 人</b>' +
        rels.map(function (r) {
          return '<button data-goto="' + r[0].id + '">' + esc(r[0].name) + '</button>';
        }).join('') + '</div>' +
      '<button class="pgd-open" data-open="' + it.id + '">打开词条 ↗</button>';
    $$('#pgDetail [data-goto]').forEach(function (b) {
      b.addEventListener('click', function () { pgSelect(b.getAttribute('data-goto')); });
    });
    var openBtn = $('#pgDetail [data-open]');
    if (openBtn) openBtn.addEventListener('click', function () { openItem(it.id); });
  }

  function bindPeopleGraph() {
    var svg = $('#pgSvg');
    $$('.pg-node', svg).forEach(function (g) {
      var id = g.getAttribute('data-id');
      g.addEventListener('mouseenter', function () { pgState.hovered = id; pgHighlight(id); });
      g.addEventListener('mouseleave', function () { pgState.hovered = null; pgHighlight(null); });
      g.addEventListener('click', function (e) { e.stopPropagation(); pgSelect(id); });
      g.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pgSelect(id); }
      });
    });

    $$('[data-pgzoom]').forEach(function (b) {
      if (b.dataset.bound) return;
      b.dataset.bound = '1';
      b.addEventListener('click', function () {
        var mode = b.getAttribute('data-pgzoom');
        if (mode === 'in') pgState.zoom = Math.min(3, pgState.zoom * 1.2);
        else if (mode === 'out') pgState.zoom = Math.max(0.5, pgState.zoom / 1.2);
        else { pgResetView(); return; }
        $('#pgZoomLabel').textContent = Math.round(pgState.zoom * 100) + '%';
        applyPgTransform();
      });
    });

    var stage = $('#pgStage');
    if (stage.dataset.bound) return;
    stage.dataset.bound = '1';
    var drag = null;
    svg.addEventListener('mousedown', function (e) {
      // 点在人物节点上不启动拖动，否则点选会把画布一点点推走
      if (e.target.closest && e.target.closest('.pg-node')) return;
      drag = { x: e.clientX, y: e.clientY, tx: pgState.tx, ty: pgState.ty, moved: false };
    });
    window.addEventListener('mousemove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;  // 阈值：轻微抖动不算拖拽
      drag.moved = true;
      stage.classList.add('dragging');
      var k = PG.W / (svg.getBoundingClientRect().width || PG.W);
      pgState.tx = clampPan(drag.tx + dx * k);
      pgState.ty = clampPan(drag.ty + dy * k);
      applyPgTransform();
    });
    window.addEventListener('mouseup', function () {
      drag = null;
      stage.classList.remove('dragging');
    });
    svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      var dir = e.deltaY > 0 ? -1 : 1;
      pgState.zoom = Math.max(0.5, Math.min(3, pgState.zoom * (dir > 0 ? 1.12 : 0.89)));
      pgState.tx = clampPan(pgState.tx);
      pgState.ty = clampPan(pgState.ty);
      $('#pgZoomLabel').textContent = Math.round(pgState.zoom * 100) + '%';
      applyPgTransform();
    }, { passive: false });
  }

  function setPeopleView(v) {
    pgState.view = v;
    $$('[data-pview]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-pview') === v);
      b.onclick = function () { setPeopleView(b.getAttribute('data-pview')); };
    });
    var graphOn = v === 'graph';
    $('#peopleGrid').hidden = graphOn;
    $('#pgWrap').hidden = !graphOn;
    if (graphOn) { pgResetView(); renderPeopleGraph(); }
  }

  /* ---------------- 数据 ---------------- */
  /* 折线：时间序列（铸钱量等），点值直接标在图上 */
  function lineHTML(p) {
    var pts = p.points || [];
    if (!pts.length) return '';
    var W = 640, H = 220, padL = 14, padR = 14, padT = 34, padB = 46;
    var max = Math.max.apply(null, pts.map(function (d) { return d.value; })) * 1.2 || 1;
    var step = pts.length > 1 ? (W - padL - padR) / (pts.length - 1) : 0;
    var xy = pts.map(function (d, i) {
      return { x: padL + step * i, y: padT + (H - padT - padB) * (1 - d.value / max), d: d };
    });
    var grid = [0, 0.5, 1].map(function (f) {
      var y = padT + (H - padT - padB) * f;
      return '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" class="lg-grid"/>';
    }).join('');
    var base = (H - padB);
    var area = 'M' + xy[0].x + ',' + base + ' ' + xy.map(function (q) {
      return 'L' + q.x + ',' + q.y;
    }).join(' ') + ' L' + xy[xy.length - 1].x + ',' + base + ' Z';
    var line = xy.map(function (q) { return q.x.toFixed(1) + ',' + q.y.toFixed(1); }).join(' ');
    var dots = xy.map(function (q) {
      return '<circle cx="' + q.x + '" cy="' + q.y + '" r="4" class="lg-dot"/>' +
        '<text x="' + q.x + '" y="' + (q.y - 12) + '" text-anchor="middle" class="lg-val">' + esc(q.d.display) + '</text>';
    }).join('');
    var xlab = xy.map(function (q) {
      return '<text x="' + q.x + '" y="' + (H - 22) + '" text-anchor="middle" class="lg-x">' + esc(q.d.label) + '</text>' +
        (q.d.sub ? '<text x="' + q.x + '" y="' + (H - 8) + '" text-anchor="middle" class="lg-sub">' + esc(q.d.sub) + '</text>' : '');
    }).join('');
    return '<svg class="linechart" viewBox="0 0 ' + W + ' ' + H + '" role="img">' + grid +
      '<path d="' + area + '" class="lg-area"/><polyline points="' + line + '" class="lg-line"/>' +
      dots + xlab + '</svg>';
  }

  /* 关键数字：把一组量级摆在一起，比单看强弱直观 */
  function kpiHTML(p) {
    return '<div class="kpis">' + (p.items || []).map(function (k) {
      return '<div class="kpi"><b>' + esc(k.value) + (k.unit ? '<i>' + esc(k.unit) + '</i>' : '') + '</b>' +
        '<span>' + esc(k.label) + '</span>' +
        (k.note ? '<small>' + esc(k.note) + '</small>' : '') + '</div>';
    }).join('') + '</div>';
  }

  function renderData() {
    if (!$('#dataPanels').dataset.done) {
      var html = '';
      (D.dataPanels || []).forEach(function (p) {
        html += '<section class="panel"><h2>' + esc(p.title) + '</h2><p class="pdesc">' + esc(p.desc) + '</p>';
        if (p.kind === 'bars') {
          var max = Math.max.apply(null, p.rows.map(function (r) { return r.value; }));
          html += '<div class="bars">' + p.rows.map(function (r, i) {
            var w = Math.max(6, r.value / max * 100);
            var cls = ['', 'red', 'gold'][i % 3];
            return '<div class="bar-row"><div class="bar-label">' + esc(r.label) + (r.sub ? '<small>' + esc(r.sub) + '</small>' : '') + '</div>' +
              '<div class="bar-track"><div class="bar-fill ' + cls + '" style="width:' + w + '%"></div></div>' +
              '<div class="bar-val">' + esc(r.display) + '</div></div>';
          }).join('') + '</div>';
        } else if (p.kind === 'line') {
          html += lineHTML(p);
        } else if (p.kind === 'kpi') {
          html += kpiHTML(p);
        } else if (p.kind === 'table') {
          html += '<table class="data"><thead><tr>' + p.cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
            p.rows.map(function (r) {
              return '<tr>' + r.map(function (cell, i) {
                return '<td class="' + (i > 0 && /^[\d.,]+/.test(cell) ? 'num' : '') + '">' + esc(cell) + '</td>';
              }).join('') + '</tr>';
            }).join('') + '</tbody></table>';
        }
        if (p.source) html += '<p class="pcite">' + esc(p.source) + '</p>';
        html += '</section>';
      });
      $('#dataPanels').innerHTML = html;
      $('#dataPanels').dataset.done = '1';
    }
  }

  /* ---------------- 详情 ---------------- */
  function loadFull(id) {
    var it = byId[id];
    if (!it || it.sources) return;
    var seq = ++state.modalSeq;
    // 静态构建与动态服务共用同一个 URL（build.py 生成 api/items/<id>.json）
    fetch('api/items/' + encodeURIComponent(id) + '.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (full) {
        if (!full || seq !== state.modalSeq) return;
        Object.assign(byId[id], full);
        if (!$('#modal').hidden && state.list[state.modalIndex] &&
            state.list[state.modalIndex].id === id) {
          renderModal(byId[id]);
        }
      })
      .catch(function () { /* 离线时保留本地内容 */ });
  }
  function openItem(id) {
    var it = byId[id];
    if (!it) return;
    var idx = state.list.findIndex(function (x) { return x.id === id; });
    if (idx < 0) { state.list = [it]; idx = 0; }
    state.modalIndex = idx;
    renderModal(it);
    $('#modal').hidden = false;
    document.body.style.overflow = 'hidden';
    loadFull(id);
  }
  function relatedHTML(related) {
    return (related || []).map(function (r) {
      // bootstrap 里是 id 字符串，/api/items/<id> 里是对象，两种都要能渲染
      var item = (typeof r === 'string') ? byId[r] : (r && r.id ? (byId[r.id] || r) : null);
      if (!item || !item.id) return '';
      return '<button class="chip" data-rel="' + esc(item.id) + '">' + esc(item.name) + '</button>';
    }).join('');
  }
  function renderModal(it) {
    var rel = relatedHTML(it.related);
    var tags = (it.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
    var groups = (it.groups || []).map(function (t) { return '<span class="tag grp">' + esc(t) + '</span>'; }).join('');

    var src = (it.sources || [])[0];
    if (src) src = Object.assign({}, src, { url: safeUrl(src.url) });
    var wikiHtml = '';
    if (src && src.extract) {
      var paras = src.extract.split(/\n+/).map(function (x) { return x.trim(); })
        .filter(Boolean)
        .map(function (x) {
          var m = x.match(/^=+\s*(.+?)\s*=+$/);
          if (m) return '<h4>' + esc(m[1]) + '</h4>';
          return '<p>' + esc(x) + '</p>';
        }).join('');
      wikiHtml = '<div class="m-wiki"><h3>百科条目 <span class="src-badge">' +
        esc(src.source === 'wikipedia' ? '维基百科' : src.source) + '</span></h3>' + paras +
        '<div class="m-license">来源：<a href="' + esc(src.url) + '" target="_blank" rel="noopener noreferrer">' +
        esc(src.lang === 'zh' ? '中文维基百科' : src.source) + '《' + esc(src.title) + '》</a>' +
        ' · ' + esc(src.license || 'CC BY-SA 4.0') +
        (src.revision_id ? ' · 修订 ' + esc(src.revision_id) : '') +
        ' · 抓取于 ' + esc((src.fetched_at || '').slice(0, 10)) + '</div></div>';
    } else if (!it.sources) {
      wikiHtml = '<div class="m-wiki"><h3>百科条目</h3><div class="m-wiki-loading">正在载入百科条目…</div></div>';
    }

    var wikiHref = (src && src.url) ||
      'https://zh.wikipedia.org/wiki/Special:Search?search=' + encodeURIComponent(it.name);
    var links = '<div class="m-links"><span>外部链接</span>' +
      '<a href="' + esc(wikiHref) + '" target="_blank" rel="noopener noreferrer">维基百科</a>' +
      '<a href="https://baike.baidu.com/search/word?word=' + encodeURIComponent(it.name) +
      '" target="_blank" rel="noopener noreferrer">百度百科</a>' +
      (src && src.qid ? '<a href="https://www.wikidata.org/wiki/' + esc(src.qid) +
        '" target="_blank" rel="noopener noreferrer">Wikidata ' + esc(src.qid) + '</a>' : '') +
      '</div>';
    $('#modalBody').innerHTML =
      '<div class="m-eyebrow">' + esc(catName(it.cat)) + (it.type ? ' · ' + esc(it.type) : '') + '</div>' +
      '<h2>' + esc(it.name) + '</h2>' +
      '<div class="m-sub">' + esc(itemSub(it)) + '</div>' +
      '<div class="m-tags">' + (it.era ? '<span class="tag era">' + esc(it.era) + '</span>' : '') + groups + tags + '</div>' +
      (it.body ? '<div class="m-text"><h3>正文</h3><div class="m-text-body">' + esc(it.body) + '</div></div>' : '') +
      '<div class="m-detail">' + esc(it.detail || it.summary || '') + '</div>' +
      wikiHtml + links +
      (rel ? '<div class="m-rel">' + rel + '</div>' : '') +
      (it.refs ? '<div class="m-refs"><b>参考</b><br>' + esc(it.refs) + '</div>' : '');
    $('#modalPrev').disabled = state.modalIndex <= 0;
    $('#modalNext').disabled = state.modalIndex >= state.list.length - 1;
    $('#modalPrev').style.opacity = state.modalIndex <= 0 ? .35 : 1;
    $('#modalNext').style.opacity = state.modalIndex >= state.list.length - 1 ? .35 : 1;
    $$('#modalBody [data-rel]').forEach(function (b) {
      b.addEventListener('click', function () { openItem(b.getAttribute('data-rel')); });
    });
  }
  function closeModal() {
    $('#modal').hidden = true;
    document.body.style.overflow = '';
    // 图谱页：关闭弹窗后复原所有节点，避免整页仍是灰的
    if (typeof tgState !== 'undefined' && tgState && tgState.nodes && tgState.nodes.length) {
      tgState.selected = null;
      tgState.hovered = null;
      tgHighlight(null);
    }
  }
  function stepModal(d) {
    var ni = state.modalIndex + d;
    if (ni < 0 || ni >= state.list.length) return;
    state.modalIndex = ni;
    var it = state.list[ni];
    if (!byId[it.id]) byId[it.id] = it;
    renderModal(byId[it.id]);
    // 翻页也要按需拉取，否则用 ← → 浏览时永远看不到百科段落
    loadFull(it.id);
  }

  /* ---------------- 检索面板 ---------------- */
  var paletteItems = [], paletteIndex = 0;
  function openPalette() {
    $('#palette').hidden = false;
    document.body.style.overflow = 'hidden';
    var inp = $('#paletteInput');
    inp.value = '';
    inp.focus();
    paletteSearch('');
  }
  function closePalette() {
    $('#palette').hidden = true;
    document.body.style.overflow = '';
  }
  function paletteSearch(q) {
    q = q.trim().toLowerCase();
    var pool = D.items.filter(function (it) { return it.cat !== 'timeline' || true; });
    var list = q ? pool.filter(function (it) {
      var hay = (it.name + ' ' + (it.summary || '') + ' ' + (it.tags || []).join(' ') + ' ' + (it.era || '')).toLowerCase();
      return hay.indexOf(q) >= 0;
    }) : D.items.filter(function (i) { return i.cat === 'timeline'; }).slice(0, 12);
    paletteItems = list.slice(0, 40);
    paletteIndex = 0;
    if (!paletteItems.length) {
      $('#paletteResults').innerHTML = '<div class="palette-empty">未找到「' + esc(q) + '」</div>';
      return;
    }
    $('#paletteResults').innerHTML = paletteItems.map(function (it, i) {
      return '<div class="palette-item ' + (i === 0 ? 'on' : '') + '" data-id="' + it.id + '">' +
        '<span class="pi-cat">' + esc(catName(it.cat)) + '</span>' +
        '<span class="pi-name">' + esc(it.name) + '</span>' +
        '<span class="pi-sub">' + esc(itemSub(it)) + '</span></div>';
    }).join('');
    $$('#paletteResults .palette-item').forEach(function (el) {
      el.addEventListener('click', function () { closePalette(); openItem(el.getAttribute('data-id')); });
    });
  }
  function movePalette(d) {
    if (!paletteItems.length) return;
    paletteIndex = Math.max(0, Math.min(paletteItems.length - 1, paletteIndex + d));
    $$('#paletteResults .palette-item').forEach(function (el, i) { el.classList.toggle('on', i === paletteIndex); });
    var cur = $$('#paletteResults .palette-item')[paletteIndex];
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  /* ---------------- 事件 ---------------- */
  function bind() {
    $$('[data-nav]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        go(a.getAttribute('data-nav'));
      });
    });
    $('.menu-toggle').addEventListener('click', function () { $('#mainnav').classList.toggle('open'); });

    // 每次按键都重排整页 DOM 在条目变多后会明显卡顿，做 120ms 防抖
    $('#browseSearch').addEventListener('input', debounce(function (e) {
      state.q = e.target.value; renderBrowse();
    }, 120));
    $('#filterEra').addEventListener('change', function (e) { state.era = e.target.value; renderBrowse(); });
    $('#filterType').addEventListener('change', function (e) { state.type = e.target.value; renderBrowse(); });
    $('#filterSort').addEventListener('change', function (e) { state.sort = e.target.value; renderBrowse(); });
    $('#peopleSearch').addEventListener('input', debounce(function (e) {
      peopleQ = e.target.value; renderPeople();
    }, 120));

    // 帝系缩放
    $$('#lgZoom [data-lgzoom]').forEach(function (b) {
      b.addEventListener('click', function () {
        var m = b.getAttribute('data-lgzoom');
        if (m === 'in') { lgState.zoom = Math.min(2.6, lgState.zoom * 1.2); lgState.manual = true; }
        else if (m === 'out') { lgState.zoom = Math.max(0.3, lgState.zoom / 1.2); lgState.manual = true; }
        else { lgState.manual = false; renderLineage(lgState.fam); return; }
        syncLgZoom();
      });
    });
    window.addEventListener('resize', function () {
      if (state.view === 'lineage' && !lgState.manual) renderLineage(lgState.fam);
    });

    $('#searchBtn').addEventListener('click', openPalette);
    $('#paletteInput').addEventListener('input', function (e) { paletteSearch(e.target.value); });
    $('#palette').addEventListener('click', function (e) { if (e.target.id === 'palette') closePalette(); });

    $('#modalClose').addEventListener('click', closeModal);
    $('#modalPrev').addEventListener('click', function () { stepModal(-1); });
    $('#modalNext').addEventListener('click', function () { stepModal(1); });
    $('#modal').addEventListener('click', function (e) { if (e.target.id === 'modal') closeModal(); });

    document.addEventListener('keydown', function (e) {
      var meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        $('#palette').hidden ? openPalette() : closePalette();
        return;
      }
      if (e.key === 'Escape') {
        if (!$('#modal').hidden) closeModal();
        if (!$('#palette').hidden) closePalette();
        return;
      }
      if (!$('#palette').hidden) {
        if (e.key === 'ArrowDown') { e.preventDefault(); movePalette(1); }
        if (e.key === 'ArrowUp') { e.preventDefault(); movePalette(-1); }
        if (e.key === 'Enter' && paletteItems[paletteIndex]) {
          var id = paletteItems[paletteIndex].id;
          closePalette(); openItem(id);
        }
        return;
      }
      if (!$('#modal').hidden) {
        if (e.key === 'ArrowLeft') stepModal(-1);
        if (e.key === 'ArrowRight') stepModal(1);
      }
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault(); openPalette();
      }
    });

    window.addEventListener('hashchange', applyRoute);
  }

  function init() {
    bind();
    renderOverview();
    applyRoute();
  }

  init();
  }

  function fail(message) {
    var box = document.createElement('div');
    box.className = 'boot-error';
    box.innerHTML = '<h2>数据加载失败</h2><p>' + message + '</p>' +
      '<pre>./start.sh            # 本地开发\npython3 build.py      # 生成静态站点</pre>' +
      '<p class="muted">本地请访问 http://127.0.0.1:8000 ，不要直接双击 index.html。</p>';
    document.body.appendChild(box);
  }

  if (location.protocol === 'file:') {
    fail('当前是 file:// 打开，浏览器禁止读取本地 API。请用本地服务器启动。');
    return;
  }

  fetch('api/bootstrap.json', { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      if (!data || !data.items) throw new Error('返回数据格式不正确');
      boot(data);
    })
    .catch(function (err) {
      console.error(err);
      fail('无法请求 <code>api/bootstrap</code>：' + (err && err.message ? err.message : err));
    });
})();
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
    if (['overview', 'timeline', 'browse', 'people', 'data', 'about'].indexOf(r.view) < 0) r.view = 'overview';
    state.view = r.view;
    $$('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + r.view); });
    $$('[data-nav]').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === r.view);
    });
    $('#mainnav').classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    if (r.view === 'browse') renderBrowse();
    if (r.view === 'timeline') renderTimeline();
    if (r.view === 'people') renderPeople();
    if (r.view === 'data') renderData();
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
          (it.tags || []).join(' ') + ' ' + (it.era || '') + ' ' + (it.type || '')).toLowerCase();
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

  /* ---------------- 年表 ---------------- */
  var TL_ERA_FALLBACK = { '五代': '#8a6a55', '大理': '#7a7f5a', '元': '#4a4a52', '两宋': '#7a7a7a' };
  var tlEra = 'all';
  var tlMajor = false;

  function eraColor(era) {
    var hit = (D.dynasties || []).filter(function (d) { return d.name === era; })[0];
    return (hit && hit.color) || TL_ERA_FALLBACK[era] || '#6b6458';
  }
  function decadeOf(y) { return Math.floor(y / 10) * 10; }

  /* 年代轴：所有节点按年份定位，颜色=政权，线高=重要性；切换筛选时未命中者变淡 */
  function tlAxisHTML(all, visible) {
    var years = all.map(function (it) { return it.year; }).filter(function (y) { return y != null; });
    if (!years.length) return { ticks: '', labels: '' };
    var min = decadeOf(Math.min.apply(null, years));
    var max = Math.ceil((Math.max.apply(null, years) + 1) / 10) * 10;
    var span = max - min || 1;
    var ticks = all.map(function (it) {
      var pos = ((it.year - min) / span * 100).toFixed(3);
      var h = it.minor ? 12 : 26;
      var dim = visible.indexOf(it.id) < 0 ? ' dim' : '';
      return '<i class="tl-tick' + (it.minor ? ' minor' : '') + dim + '"' +
        ' data-tl="' + esc(it.id) + '" title="' + esc(it.year + ' · ' + it.name) + '"' +
        ' style="left:' + pos + '%;height:' + h + 'px;background:' + eraColor(it.era) + '"></i>';
    }).join('');
    var labels = '';
    for (var y = min; y <= max; y += 50) {
      labels += '<span style="left:' + ((y - min) / span * 100).toFixed(3) + '%">' + y + '</span>';
    }
    return { ticks: ticks, labels: labels };
  }

  function jumpToTimeline(id) {
    var el = document.querySelector('#timelineList [data-tl-id="' + id + '"]');
    if (!el) { openItem(id); return; }  // 被当前筛选隐藏时，直接开详情
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
    var eraOrder = (D.dynasties || []).map(function (d) { return d.name; })
      .filter(function (n) { return counts[n]; });
    Object.keys(counts).forEach(function (n) {
      if (eraOrder.indexOf(n) < 0) eraOrder.push(n);
    });

    var list = all.filter(function (it) {
      if (tlEra !== 'all' && it.era !== tlEra) return false;
      return !(tlMajor && it.minor);
    });
    state.list = list;

    var chips = '<button class="chip ' + (tlEra === 'all' ? 'on' : '') + '" data-era="all">全部<em>' + all.length + '</em></button>';
    chips += eraOrder.map(function (n) {
      return '<button class="chip ' + (tlEra === n ? 'on' : '') + '" data-era="' + esc(n) + '"' +
        ' style="--era:' + eraColor(n) + '"><i class="dot"></i>' + esc(n) +
        '<em>' + counts[n] + '</em></button>';
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

    var axis = tlAxisHTML(all, list.map(function (it) { return it.id; }));
    $('#tlAxis').innerHTML = axis.ticks;
    $('#tlAxisLabels').innerHTML = axis.labels;
    $('#tlLegend').innerHTML = eraOrder.map(function (n) {
      return '<span><i style="background:' + eraColor(n) + '"></i><b>' + esc(n) + '</b></span>';
    }).join('') + '<span style="margin-left:auto;opacity:.85">共 ' + list.length + ' 条 · 长线为大事，细线为次要事件 · 点击定位</span>';
    $$('#tlAxis .tl-tick').forEach(function (t) {
      t.addEventListener('click', function () { jumpToTimeline(t.getAttribute('data-tl')); });
    });

    if (!list.length) {
      $('#timelineList').innerHTML = '<div class="empty">没有符合条件的条目。</div>';
      return;
    }

    var lastDec = null;
    $('#timelineList').innerHTML = list.map(function (it) {
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

  /* ---------------- 人物 ---------------- */
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
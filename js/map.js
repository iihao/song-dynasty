/* 宋代舆图渲染：等距圆柱投影 + 势力多边形 + 城市 + 年份滑杆 */
(function () {
  'use strict';

  var DATA = window.SONG_MAP_DATA;
  if (!DATA) return;

  var LON0 = 72, LON1 = 135, LAT0 = 18, LAT1 = 55;
  var K = 14.8;                 // 每经度像素
  var LAT_K = 1.12;             // 纬度拉伸，避免横向过扁
  var state = { year: 1127, selected: null, playing: false, timer: null, ctx: null };

  function px(lon) { return (lon - LON0) * K; }
  function py(lat) { return (LAT1 - lat) * K * LAT_K; }
  function W() { return (LON1 - LON0) * K; }
  function H() { return (LAT1 - LAT0) * K * LAT_K; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function activePoly(region, year) {
    var hit = null;
    (region.periods || []).forEach(function (p) {
      if (year >= p.from && year <= p.to) {
        if (!hit || p.from > hit.from) hit = p;
      }
    });
    return hit;
  }

  function polyPath(points) {
    return points.map(function (pt, i) {
      return (i ? 'L' : 'M') + px(pt[0]).toFixed(1) + ',' + py(pt[1]).toFixed(1);
    }).join(' ') + ' Z';
  }

  function polyArea(points) {
    var a = 0;
    for (var i = 0; i < points.length; i++) {
      var p1 = points[i], p2 = points[(i + 1) % points.length];
      a += px(p1[0]) * py(p2[1]) - px(p2[0]) * py(p1[1]);
    }
    return Math.abs(a / 2);
  }

  function activeRegions(year) {
    return DATA.regions.filter(function (r) { return !!activePoly(r, year); });
  }

  function renderMap(year) {
    state.year = year;
    var svg = document.getElementById('mapSvg');
    if (!svg) return;
    svg.setAttribute('viewBox', '0 0 ' + W() + ' ' + H());
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', 'auto');

    var regions = activeRegions(year);
    var parts = [];

    // 底图：经纬网格
    parts.push('<rect class="mp-sea" x="0" y="0" width="' + W() + '" height="' + H() + '"/>');
    for (var lon = 75; lon <= 135; lon += 5) {
      parts.push('<line class="mp-grat' + (lon % 15 === 0 ? ' major' : '') + '" x1="' + px(lon) +
        '" y1="0" x2="' + px(lon) + '" y2="' + H() + '"/>');
    }
    for (var lat = 20; lat <= 55; lat += 5) {
      parts.push('<line class="mp-grat' + (lat % 15 === 0 ? ' major' : '') + '" x1="0" y1="' + py(lat) +
        '" x2="' + W() + '" y2="' + py(lat) + '"/>');
    }

    // 河流
    DATA.rivers.forEach(function (r) {
      var d = r.pts.map(function (pt, i) {
        return (i ? 'L' : 'M') + px(pt[0]).toFixed(1) + ',' + py(pt[1]).toFixed(1);
      }).join(' ');
      parts.push('<path class="mp-river" d="' + d + '"/>');
      var mid = r.pts[Math.floor(r.pts.length / 2)];
      parts.push('<text class="mp-river-label" x="' + px(mid[0]) + '" y="' + (py(mid[1]) - 5) + '">' +
        esc(r.name) + '</text>');
    });

    // 势力面
    regions.forEach(function (r) {
      var poly = activePoly(r, year).poly;
      var on = !state.selected || state.selected === r.id;
      parts.push('<path class="mp-region' + (on ? '' : ' faded') + '" data-region="' + r.id + '"' +
        ' d="' + polyPath(poly) + '" fill="' + r.color + '" stroke="' + r.color + '"/>');
    });

    // 势力名
    regions.forEach(function (r) {
      var a = centroid(activePoly(r, year).poly);
      var on = !state.selected || state.selected === r.id;
      parts.push('<text class="mp-region-label' + (on ? '' : ' faded') + '" x="' + a[0] + '" y="' + a[1] +
        '" fill="' + r.color + '">' + esc(r.name) + '</text>');
    });

    // 城市
    DATA.cities.forEach(function (c) {
      var x = px(c.lon), y = py(c.lat);
      var kind = c.kind === 'capital' ? 'capital' : (c.kind === 'battle' ? 'battle' : 'city');
      parts.push('<g class="mp-city ' + kind + '" data-city="' + esc(c.name) + '"' +
        (c.item ? ' data-item="' + esc(c.item) + '"' : '') + ' tabindex="0" role="button">');
      if (kind === 'capital') {
        parts.push('<circle class="mp-city-halo" cx="' + x + '" cy="' + y + '" r="7"/>');
        parts.push('<circle class="mp-city-dot" cx="' + x + '" cy="' + y + '" r="3.6"/>');
        parts.push('<circle class="mp-city-ring" cx="' + x + '" cy="' + y + '" r="8"/>');
      } else if (kind === 'battle') {
        parts.push('<path class="mp-city-cross" d="M' + (x - 3.2) + ',' + (y - 3.2) + 'L' + (x + 3.2) + ',' + (y + 3.2) +
          'M' + (x + 3.2) + ',' + (y - 3.2) + 'L' + (x - 3.2) + ',' + (y + 3.2) + '"/>');
      } else {
        parts.push('<circle class="mp-city-dot" cx="' + x + '" cy="' + y + '" r="2.6"/>');
      }
      var lx = x + (c.dx != null ? c.dx : 7);
      var ly = y + (c.dy != null ? c.dy : 3.4);
      parts.push('<text class="mp-city-label" x="' + lx + '" y="' + ly + '"' +
        (c.anchor ? ' text-anchor="' + c.anchor + '"' : '') + '>' + esc(c.name) + '</text>');
      parts.push('<title>' + esc(c.name + ' · ' + c.note) + '</title>');
      parts.push('</g>');
    });

    svg.innerHTML = parts.join('');

    bindMapEvents();
    renderLegend(regions);
    renderSidePanel(regions);
    renderYearScale();
    var era = DATA.eras[year] || {};
    document.getElementById('mapEraLabel').textContent = '公元 ' + year + ' 年';
    document.getElementById('mapEraNote').textContent =
      (era.label ? era.label + ' · ' : '') + (era.note || '');
  }

  function centroid(points) {
    var x = 0, y = 0;
    points.forEach(function (p) { x += px(p[0]); y += py(p[1]); });
    return [x / points.length, y / points.length];
  }

  function renderLegend(regions) {
    var el = document.getElementById('mapLegend');
    el.innerHTML = regions.map(function (r) {
      return '<button class="mp-lg' + (state.selected === r.id ? ' on' : '') + '" data-region="' + r.id + '">' +
        '<i style="background:' + r.color + '"></i>' + esc(r.name) + '</button>';
    }).join('');
    el.querySelectorAll('.mp-lg').forEach(function (b) {
      b.addEventListener('click', function () {
        state.selected = state.selected === b.getAttribute('data-region') ? null : b.getAttribute('data-region');
        renderMap(state.year);
      });
    });
  }

  function renderSidePanel(regions) {
    var el = document.getElementById('mapPanel');
    var total = 0;
    var areas = regions.map(function (r) {
      var a = polyArea(activePoly(r, state.year).poly);
      total += a;
      return { r: r, a: a };
    });
    areas.sort(function (x, y) { return y.a - x.a; });

    var sel = state.selected ? regions.filter(function (r) { return r.id === state.selected; })[0] : null;
    var html = '';

    if (sel) {
      var poly = activePoly(sel, state.year);
      var share = total ? (polyArea(poly.poly) / total * 100) : 0;
      html += '<div class="mp-sel-head"><i style="background:' + sel.color + '"></i>' +
        '<h3>' + esc(sel.name) + '</h3></div>' +
        '<div class="mp-sel-meta">存续 ' + poly.from + '—' + poly.to + ' 年' +
        (sel.capital ? ' · 都城 ' + esc(cityName(sel.capital)) : '') +
        ' · 约占图内 ' + share.toFixed(1) + '%</div>' +
        '<p class="mp-sel-note">' + esc(regionNote(sel)) + '</p>' +
        '<div class="mp-sel-links">' + (sel.items || []).map(function (id) {
          return '<button data-item="' + esc(id) + '">' + esc(itemName(id)) + '<i>↗</i></button>';
        }).join('') + '</div>' +
        '<button class="mp-back" id="mpBack">← 返回势力列表</button>';
    } else {
      html += '<div class="mp-list-head">势力分布 <span>（面积占比，示意）</span></div>';
      html += areas.map(function (x) {
        var pct = total ? x.a / total * 100 : 0;
        return '<button class="mp-row" data-region="' + x.r.id + '">' +
          '<span class="mp-row-top"><i style="background:' + x.r.color + '"></i>' +
          '<b>' + esc(x.r.name) + '</b><em>' + pct.toFixed(1) + '%</em></span>' +
          '<span class="mp-bar"><i style="width:' + pct.toFixed(1) + '%;background:' + x.r.color + '"></i></span>' +
          '</button>';
      }).join('');
    }
    el.innerHTML = html;

    el.querySelectorAll('[data-region]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.selected = b.getAttribute('data-region');
        renderMap(state.year);
      });
    });
    el.querySelectorAll('[data-item]').forEach(function (b) {
      b.addEventListener('click', function () { open(b.getAttribute('data-item')); });
    });
    var back = document.getElementById('mpBack');
    if (back) back.addEventListener('click', function () { state.selected = null; renderMap(state.year); });
  }

  function cityName(lonlat) {
    var hit = DATA.cities.filter(function (c) {
      return Math.abs(c.lon - lonlat[0]) < 0.6 && Math.abs(c.lat - lonlat[1]) < 0.6;
    })[0];
    return hit ? hit.name : '';
  }

  function regionNote(r) {
    var notes = {
      dangxiang: '党项李氏据夏州、灵州，先附宋后自立，1038 年李元昊称帝建西夏。',
      song: '北宋承五代而立，定都开封，凭汴河漕运供养京师与禁军，与辽、西夏长期并立。',
      liao: '契丹据燕云与草原，南北面官分治，五京并立，是北宋北方最强大的对手。',
      xixia: '党项据河西与宁夏，兼农牧之利，以铁鹞子重骑兵闻名，与宋、辽、金周旋近两百年。',
      jin: '女真起于按出虎水，十年灭辽、两年灭北宋，据淮河以北，与南宋长期对峙。',
      'southern-song': '宋室南渡，定行在临安，以长江、淮河为防线，海外贸易与市镇经济空前繁荣。',
      dali: '白族政权，崇佛，据云南，与宋保持朝贡与贸易，1253 年为蒙古所灭。',
      tufan: '吐蕃诸部散处青藏高原，无统一政权，与宋以茶马贸易相连。',
      xiliao: '耶律大石西迁所建，都虎思斡耳朵，一度称霸中亚，1218 年为蒙古所灭。',
      yuan: '蒙古崛起于漠北，1206 年建国，1271 年改国号大元，1279 年灭南宋。'
    };
    return notes[r.id] || '';
  }

  function itemName(id) {
    var it = window.__songItems && window.__songItems[id];
    return it ? it.name : id;
  }

  function open(id) {
    if (state.ctx && state.ctx.openItem) state.ctx.openItem(id);
  }

  function renderYearScale() {
    var el = document.getElementById('mapYears');
    el.innerHTML = DATA.years.map(function (y) {
      return '<button class="mp-year' + (y === state.year ? ' on' : '') + '" data-year="' + y + '">' + y + '</button>';
    }).join('');
    el.querySelectorAll('.mp-year').forEach(function (b) {
      b.addEventListener('click', function () {
        stop();
        var y = parseInt(b.getAttribute('data-year'), 10);
        state.selected = null;
        renderMap(y);
      });
    });
    var slider = document.getElementById('mapSlider');
    if (slider) {
      slider.value = String(DATA.years.indexOf(state.year) < 0 ? 0 : DATA.years.indexOf(state.year));
      slider.max = String(DATA.years.length - 1);
    }
  }

  function bindMapEvents() {
    var svg = document.getElementById('mapSvg');
    svg.querySelectorAll('.mp-region').forEach(function (p) {
      p.addEventListener('click', function () {
        state.selected = p.getAttribute('data-region');
        renderMap(state.year);
      });
      p.addEventListener('mouseenter', function () { p.classList.add('hover'); });
      p.addEventListener('mouseleave', function () { p.classList.remove('hover'); });
    });
    svg.querySelectorAll('.mp-city').forEach(function (g) {
      g.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = g.getAttribute('data-item');
        if (id) open(id);
      });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          var id = g.getAttribute('data-item');
          if (id) open(id);
        }
      });
    });
  }

  function stop() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    state.playing = false;
    var b = document.getElementById('mapPlay');
    if (b) { b.textContent = '播放'; b.classList.remove('on'); }
  }

  function play() {
    if (state.playing) { stop(); return; }
    state.playing = true;
    var b = document.getElementById('mapPlay');
    if (b) { b.textContent = '暂停'; b.classList.add('on'); }
    state.timer = setInterval(function () {
      var i = DATA.years.indexOf(state.year);
      var next = DATA.years[(i + 1) % DATA.years.length];
      state.selected = null;
      renderMap(next);
    }, 1600);
  }

  window.renderSongMap = function (ctx) {
    state.ctx = ctx || {};
    if (ctx && ctx.year && DATA.years.indexOf(ctx.year) >= 0) {
      state.year = ctx.year;
      state.selected = null;
      stop();
    }
    var playBtn = document.getElementById('mapPlay');
    if (playBtn) playBtn.onclick = play;
    var slider = document.getElementById('mapSlider');
    if (slider) {
      slider.addEventListener('input', function () {
        stop();
        var y = DATA.years[parseInt(slider.value, 10)] || DATA.years[0];
        state.selected = null;
        renderMap(y);
      });
    }
    renderMap(state.year);
  };
})();
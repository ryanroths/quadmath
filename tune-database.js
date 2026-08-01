/* QuadMath tune database — single source of truth for the tune cards.
 *
 * Every card on tune-database.html is rendered from TUNES below. Do not
 * hand-write card markup in the HTML: add a row here instead.
 *
 * Combos with no published numbers go in PENDING, not TUNES. They render as
 * one collapsed line at the bottom of the page rather than an empty card, so
 * the grid never shows a tune that does not exist.
 *
 * pids/rates are [roll, pitch, yaw] rows of three columns:
 *   pids  -> [P, I, D]
 *   rates -> [RC rate, Super rate, Expo]
 * Values are stored exactly as they appear in the pilot's Betaflight diff, so
 * the CLI export can emit them verbatim without unit conversion.
 */
(function () {
  'use strict';

  var TUNES = [
    {
      id: '65-betafpv-ryfly-1219s',
      frame: 65,
      brand: 'BetaFPV',
      source: 'RyFly',
      fc: 'BetaFPV G473 (BEFH)',
      combo: 'VCI Spark 0702 29K KV · Gemfan 1219S',
      rateType: 'BETAFLIGHT',
      pids:  { roll: [54, 77, 38], pitch: [62, 89, 52], yaw: [54, 77, 0] },
      rates: { roll: [4, 74, 56],  pitch: [4, 74, 56],  yaw: [4, 70, 56] },
      notes: [
        'D-min R36/P49',
        'TPA 60',
        'Crash recovery ON',
        'FF off',
        'Gyro LPF1 off',
        'Dyn notch 1×Q500 120–500hz',
        'RPM filter ON, bidir DSHOT300',
        'Board: AIR65 RYFLY',
      ],
    },
    {
      id: '65-betafpv-ryfly-hq31',
      frame: 65,
      brand: 'BetaFPV',
      source: 'RyFly',
      fc: 'BetaFPV G473 (BEFH)',
      combo: 'VCI Spark 0702 29K KV · HQ 31mm',
      rateType: 'BETAFLIGHT',
      pids:  { roll: [61, 110, 41], pitch: [67, 121, 51], yaw: [61, 110, 0] },
      rates: { roll: [4, 74, 56],   pitch: [4, 74, 56],   yaw: [4, 70, 56] },
      notes: [
        'D-min R41/P51',
        'TPA 60',
        'FF off',
        'Same filter config as the 1219S tune',
        'Board: AIR65 RYFLY',
      ],
    },
    {
      id: '65-happymodel-stock',
      frame: 65,
      brand: 'Happymodel',
      source: 'Stock',
      fc: 'Happymodel CrazyBee F4 SX',
      combo: '0702 28K KV',
      rateType: 'BETAFLIGHT',
      pids:  { roll: [41, 70, 37], pitch: [41, 70, 37], yaw: [41, 70, 0] },
      rates: { roll: [4, 74, 56],  pitch: [4, 74, 56],  yaw: [4, 70, 56] },
      notes: [
        'Simplified PID mode, master ×155',
        'FF R111/P110/Y111',
      ],
    },
    {
      id: '65-happymodel-ryfly',
      frame: 65,
      brand: 'Happymodel',
      source: 'RyFly',
      fc: 'Happymodel CrazyBee F4 SX',
      combo: '0702 28K KV',
      rateType: 'BETAFLIGHT',
      pids:  { roll: [42, 83, 31], pitch: [44, 87, 38], yaw: [41, 70, 0] },
      rates: { roll: [4, 74, 56],  pitch: [4, 74, 56],  yaw: [4, 70, 56] },
      notes: [
        'FF R138/P143',
        'D-min R23/P28',
        'Thrust linear 20',
        'RPM filter ON (bidir dshot, 1H, 100/20/100)',
        'Gyro LPF1 off',
        'Dyn notch off',
        'D-term dyn 67–135hz',
        'Aggressive — for clean bidir builds',
      ],
    },
    {
      id: '65-newbeedrone-stock',
      frame: 65,
      brand: 'NewBeeDrone',
      source: 'Stock',
      fc: 'NewBeeDrone Hummingbird RaceSpec V2',
      combo: 'Stock BF 4.5.1 defaults',
      rateType: 'BETAFLIGHT',
      pids:  { roll: [45, 80, 40], pitch: [47, 84, 46], yaw: [45, 80, 0] },
      rates: { roll: [4, 74, 56],  pitch: [4, 74, 56],  yaw: [4, 70, 56] },
      notes: [
        'Stock BF 4.5.1 defaults',
        'motor_kv 1960 — verify against your actual motor KV',
      ],
    },
    {
      id: '75-betafpv-stock',
      frame: 75,
      brand: 'BetaFPV',
      source: 'Stock',
      fc: 'BetaFPV G473_V2',
      combo: 'Air75 II Champion, stock motor/prop',
      rateType: 'BETAFLIGHT',
      pids:  { roll: [33, 60, 25], pitch: [35, 63, 28], yaw: [33, 60, 0] },
      // Rates not yet pulled from a stock diff — the card says so and the CLI
      // button stays hidden rather than exporting a half tune.
      rates: null,
      notes: [
        'Rates N/A — not yet pulled, will follow with the stock diff',
        'BF 4.5.3',
        'Optimized for stock motor/prop per BetaFPV spec',
      ],
    },
    {
      id: '75-betafpv-ryfly-gf40',
      frame: 75,
      brand: 'BetaFPV',
      source: 'RyFly',
      fc: 'BetaFPV G473 (BETAFPVG473, board RY75)',
      combo: 'Gemfan 40mm',
      rateType: 'BETAFLIGHT',
      pids:  { roll: [61, 110, 0], pitch: [64, 115, 0], yaw: [61, 110, 0] },
      rates: { roll: [4, 74, 56],  pitch: [4, 74, 56],  yaw: [4, 70, 56] },
      notes: [
        'FF R79/P82',
        'D-min R37/P43',
        'TPA 75/1250',
        'Dyn notch 1×Q350 150–350hz',
        'DSHOT300',
        'No stock tune published for this board — custom build',
      ],
    },
    {
      id: '85-happymodel-ryfly',
      frame: 85,
      brand: 'Happymodel',
      source: 'RyFly',
      fc: 'Happymodel CrazyBee F4 DX (HAMO)',
      combo: 'Custom 85mm build',
      rateType: 'BETAFLIGHT',
      pids:  { roll: [67, 120, 40], pitch: [70, 126, 45], yaw: [67, 120, 0] },
      rates: { roll: [5, 74, 56],   pitch: [5, 74, 56],   yaw: [5, 70, 56] },
      notes: [
        'FF R180/P187',
        'D-min R40/P45',
        'Dyn notch 125–850hz',
        'Crash recovery ON',
        'thrust_linear 20',
        'dyn_idle_min_rpm 35',
        'Higher RC rate than the other builds',
        'No stock tune published — custom build',
      ],
    },
  ];

  // Combos with nothing published yet. Rendered as one collapsed line, never
  // as a card.
  var PENDING = [
    { frame: 65, brand: 'BetaFPV',     source: 'Stock', reason: 'N/A — custom build (BetaFPV G473 BEFH · VCI Spark 0702 29K KV · board AIR65 RYFLY)' },
    { frame: 65, brand: 'NewBeeDrone', source: 'RyFly', reason: 'running stock, no custom profile yet' },
    { frame: 75, brand: 'Happymodel',  source: 'Stock', reason: 'tune in testing' },
    { frame: 75, brand: 'Happymodel',  source: 'RyFly', reason: 'tune in testing' },
    { frame: 75, brand: 'NewBeeDrone', source: 'Stock', reason: 'tune in testing' },
    { frame: 75, brand: 'NewBeeDrone', source: 'RyFly', reason: 'tune in testing' },
    { frame: 85, brand: 'BetaFPV',     source: 'Stock', reason: 'tune in testing' },
    { frame: 85, brand: 'BetaFPV',     source: 'RyFly', reason: 'tune in testing' },
    { frame: 85, brand: 'Happymodel',  source: 'Stock', reason: 'N/A — no stock tune published for the CrazyBee F4 DX (HAMO)' },
    { frame: 85, brand: 'NewBeeDrone', source: 'Stock', reason: 'tune in testing' },
    { frame: 85, brand: 'NewBeeDrone', source: 'RyFly', reason: 'tune in testing' },
  ];

  var FILTERS = [
    { key: 'frame',  label: 'Frame',  values: [65, 75, 85] },
    { key: 'brand',  label: 'Brand',  values: ['BetaFPV', 'Happymodel', 'NewBeeDrone'] },
    { key: 'source', label: 'Source', values: ['Stock', 'RyFly'] },
  ];

  var AXES = [
    { key: 'roll',  label: 'R' },
    { key: 'pitch', label: 'P' },
    { key: 'yaw',   label: 'Y' },
  ];

  // Selected chips per group. Empty set = no constraint on that group.
  var active = { frame: new Set(), brand: new Set(), source: new Set() };

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Betaflight CLI export. Parameter names are BF 4.x; values are emitted
  // exactly as stored, so this round-trips whatever the pilot's diff said.
  function cliFor(tune) {
    var lines = [
      '# QuadMath — ' + tune.frame + 'mm ' + tune.brand + ' ' + tune.source,
      '# ' + tune.fc + (tune.combo ? ' · ' + tune.combo : ''),
    ];
    AXES.forEach(function (axis) {
      var pid = tune.pids[axis.key];
      lines.push('set p_' + axis.key + ' = ' + pid[0]);
      lines.push('set i_' + axis.key + ' = ' + pid[1]);
      lines.push('set d_' + axis.key + ' = ' + pid[2]);
    });
    lines.push('set rates_type = ' + tune.rateType);
    AXES.forEach(function (axis) {
      var rate = tune.rates[axis.key];
      lines.push('set ' + axis.key + '_rc_rate = ' + rate[0]);
      lines.push('set ' + axis.key + '_srate = ' + rate[1]);
      lines.push('set ' + axis.key + '_expo = ' + rate[2]);
    });
    lines.push('save');
    return lines.join('\n');
  }

  function hasFullData(tune) {
    return !!(tune.pids && tune.rates);
  }

  function gridBlock(title, headings, rows) {
    var html = '<div class="tune-sh">' + esc(title) + '</div>';
    html += '<div class="tune-matrix">';
    html += '<span class="tm-corner"></span>';
    headings.forEach(function (heading) {
      html += '<span class="tm-col">' + esc(heading) + '</span>';
    });
    rows.forEach(function (row) {
      html += '<span class="tm-axis">' + esc(row.label) + '</span>';
      row.values.forEach(function (value) {
        html += '<span class="tm-cell">' + esc(value) + '</span>';
      });
    });
    return html + '</div>';
  }

  function cardHtml(tune) {
    var badgeClass = tune.source === 'RyFly' ? 'tune-badge ryfly' : 'tune-badge';
    var html = '<article class="tune-card" data-frame="' + tune.frame +
               '" data-brand="' + esc(tune.brand) + '" data-source="' + esc(tune.source) + '">';

    html += '<header class="tune-card-head">';
    html += '<div class="tune-card-top">';
    html += '<span class="tune-frame">' + tune.frame + 'mm</span>';
    html += '<span class="' + badgeClass + '">' + esc(tune.source) + '</span>';
    html += '</div>';
    html += '<h3 class="tune-card-fc">' + esc(tune.fc) + '</h3>';
    if (tune.combo) html += '<p class="tune-card-combo">' + esc(tune.combo) + '</p>';
    html += '</header>';

    html += gridBlock('PIDs', ['P', 'I', 'D'], AXES.map(function (axis) {
      return { label: axis.label, values: tune.pids[axis.key] };
    }));

    if (tune.rates) {
      html += gridBlock('Rates · ' + tune.rateType, ['RC Rate', 'Super', 'Expo'], AXES.map(function (axis) {
        return { label: axis.label, values: tune.rates[axis.key] };
      }));
    } else {
      html += '<div class="tune-sh">Rates</div>';
      html += '<p class="tune-rates-missing">Not published yet — PIDs only.</p>';
    }

    if (tune.notes && tune.notes.length) {
      html += '<details class="tune-notes"><summary>Notes · FF, D-min, TPA, filters</summary><ul>';
      tune.notes.forEach(function (note) {
        html += '<li>' + esc(note) + '</li>';
      });
      html += '</ul></details>';
    }

    if (hasFullData(tune)) {
      html += '<button type="button" class="tune-copy" data-id="' + esc(tune.id) + '">Copy CLI diff</button>';
    }

    return html + '</article>';
  }

  function matches(tune) {
    return FILTERS.every(function (group) {
      var picked = active[group.key];
      return picked.size === 0 || picked.has(String(tune[group.key]));
    });
  }

  var grid, countEl, pendingList;

  function render() {
    var shown = TUNES.filter(matches);
    grid.innerHTML = shown.length
      ? shown.map(cardHtml).join('')
      : '<p class="tune-empty">No tunes match those filters. Clear a chip to widen the search.</p>';
    countEl.textContent = shown.length === TUNES.length
      ? TUNES.length + ' tunes'
      : shown.length + ' of ' + TUNES.length + ' tunes';
  }

  function buildFilters(bar) {
    FILTERS.forEach(function (group) {
      var wrap = document.createElement('div');
      wrap.className = 'tune-filter-group';
      wrap.innerHTML = '<span class="tune-filter-label">' + esc(group.label) + '</span>';
      group.values.forEach(function (value) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'tune-chip';
        chip.setAttribute('aria-pressed', 'false');
        chip.dataset.group = group.key;
        chip.dataset.value = String(value);
        chip.textContent = group.key === 'frame' ? value + 'mm' : value;
        chip.addEventListener('click', function () {
          var picked = active[group.key];
          var key = String(value);
          if (picked.has(key)) picked.delete(key); else picked.add(key);
          chip.setAttribute('aria-pressed', picked.has(key) ? 'true' : 'false');
          chip.classList.toggle('on', picked.has(key));
          render();
        });
        wrap.appendChild(chip);
      });
      bar.appendChild(wrap);
    });
  }

  function renderPending() {
    if (!PENDING.length) return;
    pendingList.innerHTML = PENDING.map(function (entry) {
      return '<li><span class="tune-pending-combo">' + entry.frame + 'mm · ' +
             esc(entry.brand) + ' · ' + esc(entry.source) + '</span> — ' +
             esc(entry.reason) + '</li>';
    }).join('');
    document.getElementById('tunePendingCount').textContent = PENDING.length;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      // The API rejects on an unfocused document and under some permission
      // policies, so a rejection falls through to the textarea path rather
      // than surfacing as a failure the user cannot act on.
      return navigator.clipboard.writeText(text).catch(function () {
        return legacyCopy(text);
      });
    }
    // http:// or older browsers — clipboard API is unavailable there.
    return legacyCopy(text);
  }

  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      document.body.removeChild(area);
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  function wireCopy() {
    grid.addEventListener('click', function (event) {
      var button = event.target.closest('.tune-copy');
      if (!button) return;
      var tune = TUNES.filter(function (item) { return item.id === button.dataset.id; })[0];
      if (!tune) return;
      copyText(cliFor(tune)).then(function () {
        button.textContent = 'Copied ✓';
        button.classList.add('copied');
      }).catch(function () {
        button.textContent = 'Copy failed — select manually';
        button.classList.add('failed');
      }).then(function () {
        setTimeout(function () {
          button.textContent = 'Copy CLI diff';
          button.classList.remove('copied', 'failed');
        }, 1600);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    grid = document.getElementById('tuneGrid');
    countEl = document.getElementById('tuneCount');
    pendingList = document.getElementById('tunePendingList');
    if (!grid) return;
    buildFilters(document.getElementById('tuneFilters'));
    renderPending();
    wireCopy();
    render();
  });

  // Exposed for verification and for any future page that wants the same data.
  window.QuadMathTunes = { tunes: TUNES, pending: PENDING, cliFor: cliFor };
})();

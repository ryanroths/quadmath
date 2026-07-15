  // ===== Frame size presets (typical defaults) =====
  const framePresets = {
    65: { kv: 19000, cells: 1, capacity: 300, pitch: 0.7, weight: 28  },
    75: { kv: 22000, cells: 1, capacity: 450, pitch: 1.1, weight: 38  },
    85: { kv: 11000, cells: 2, capacity: 450, pitch: 0.9, weight: 65  },
    3:  { kv: 7000,  cells: 4, capacity: 850, pitch: 2.5, weight: 120 },
    5:  { kv: 1900,  cells: 6, capacity: 1300, pitch: 5.1, weight: 280 },
    7:  { kv: 1300,  cells: 6, capacity: 1800, pitch: 6.0, weight: 420 },
  };

  // Real motor database by frame size — brand, stator, KV
  const motorDB = {
    65: [
      { name: 'BetaFPV 0702 II',             kv: 23000, propPitch: 0.7, weightPerMotor: 1.50 },
      { name: 'Happymodel SE0702',            kv: 23000, propPitch: 0.7, weightPerMotor: 1.46 },
      { name: 'VCI Spark 0702',              kv: 25000, propPitch: 0.7, weightPerMotor: 1.52 },
      { name: 'Happymodel SE0702',            kv: 26000, propPitch: 0.7, weightPerMotor: 1.46 },
      { name: 'BetaFPV 0702 II',             kv: 27000, propPitch: 0.7, weightPerMotor: 1.50 },
      { name: 'VCI Spark 0702',              kv: 27000, propPitch: 0.7, weightPerMotor: 1.52 },
      { name: 'Happymodel SE0702',            kv: 28000, propPitch: 0.7, weightPerMotor: 1.46 },
      { name: 'NewBeeDrone Flow 0702',        kv: 29000, propPitch: 0.7, weightPerMotor: 1.58 },
      { name: 'VCI Spark 0702',              kv: 29000, propPitch: 0.7, weightPerMotor: 1.52 },
      { name: 'BetaFPV 0702 II',             kv: 30000, propPitch: 0.7, weightPerMotor: 1.50 },
      { name: 'weBLEEDfpv SKRRRT 0702',      kv: 40000, propPitch: 0.7, weightPerMotor: 1.60 },
    ],
    75: [
      { name: 'Happymodel RS0802',            kv: 19000, propPitch: 1.1, weightPerMotor: 1.80 },
      { name: 'Happymodel EX0802',            kv: 19000, propPitch: 1.1, weightPerMotor: 1.80 },
      { name: 'NewBeeDrone Flow 0802',        kv: 19000, propPitch: 1.1, weightPerMotor: 1.90 },
      { name: 'RCinPower GTS V3 0802',       kv: 22000, propPitch: 1.1, weightPerMotor: 1.90 },
      { name: 'iFlight XING NANO X0802',     kv: 22000, propPitch: 1.1, weightPerMotor: 2.00 },
      { name: 'BetaFPV 0802SE',              kv: 23000, propPitch: 1.1, weightPerMotor: 1.90 },
      { name: 'NewBeeDrone Flow 0802',        kv: 25000, propPitch: 1.1, weightPerMotor: 1.90 },
      { name: 'Happymodel RS0802',            kv: 25000, propPitch: 1.1, weightPerMotor: 1.80 },
      { name: 'weBLEEDfpv Skyscrapers 0802', kv: 25000, propPitch: 1.1, weightPerMotor: 2.00 },
      { name: 'NewBeeDrone Flow 0802',        kv: 27000, propPitch: 1.1, weightPerMotor: 1.90 },
      { name: 'NewBeeDrone Flow 0802',        kv: 30000, propPitch: 1.1, weightPerMotor: 1.90 },
      { name: 'weBLEEDfpv Treetoppers 0802', kv: 32500, propPitch: 1.1, weightPerMotor: 2.10 },
    ],
    85: [
      { name: 'BetaFPV 1103',               kv:  8000, propPitch: 0.9, weightPerMotor: 3.20 },
      { name: 'BetaFPV 1103',               kv: 11000, propPitch: 0.9, weightPerMotor: 3.20 },
      { name: 'Happymodel EX1103',           kv: 11000, propPitch: 0.9, weightPerMotor: 3.20 },
      { name: 'Flywoo ROBO 1002',            kv: 23500, propPitch: 0.9, weightPerMotor: 2.50 },
    ],
    3: [
      { name: 'T-Motor Velox V1404',   kv: 4600, propPitch: 2.5, weightPerMotor: 12 },
      { name: 'BetaFPV 1404',         kv: 4500, propPitch: 2.5, weightPerMotor: 12 },
      { name: 'Emax RS1408',          kv: 4100, propPitch: 2.5, weightPerMotor: 13 },
      { name: 'T-Motor Velox V1506',   kv: 3800, propPitch: 2.5, weightPerMotor: 14 },
      { name: 'BrotherHobby T1404',   kv: 4600, propPitch: 2.5, weightPerMotor: 12 },
      { name: 'Xing 1404',            kv: 3500, propPitch: 2.5, weightPerMotor: 12 },
    ],
    5: [
      { name: 'T-Motor Velox V2207',   kv: 1950, propPitch: 5.1, weightPerMotor: 32 },
      { name: 'T-Motor F40 PRO IV',    kv: 2400, propPitch: 5.1, weightPerMotor: 30 },
      { name: 'Emax ECO II 2207',      kv: 2400, propPitch: 5.1, weightPerMotor: 28 },
      { name: 'Iflight XING 2208',     kv: 1800, propPitch: 5.1, weightPerMotor: 34 },
      { name: 'BrotherHobby 2207',    kv: 1700, propPitch: 5.1, weightPerMotor: 30 },
      { name: 'T-Motor Pacer 2306',    kv: 2150, propPitch: 5.1, weightPerMotor: 28 },
      { name: 'SucceX-E 2207',         kv: 2450, propPitch: 5.1, weightPerMotor: 30 },
    ],
    7: [
      { name: 'Emax ECO II 2807',        kv: 1300, propPitch: 6.0, weightPerMotor: 52 },
      { name: 'Iflight XING 2806',       kv: 1300, propPitch: 6.0, weightPerMotor: 50 },
      { name: 'T-Motor Navigator 2808',  kv:  900, propPitch: 6.0, weightPerMotor: 58 },
      { name: 'BrotherHobby 2807',      kv: 1300, propPitch: 6.0, weightPerMotor: 52 },
      { name: 'Sunnysky X2806',          kv: 1250, propPitch: 6.0, weightPerMotor: 50 },
      { name: 'T-Motor Velox V2207',     kv: 1750, propPitch: 6.0, weightPerMotor: 32 },
    ],
  };

  // Approx static thrust benchmark (grams of thrust per watt) by frame size — rough community averages
  const thrustPerWatt = {
    65: 3.5,
    75: 3.8,
    85: 4.0,
    3:  4.2,
    5:  4.5,
    7:  4.8,
  };

  // Frontal drag coefficient × area (m²) per frame — drives aerodynamic speed limit.
  const frameCdA = {
    65: 0.0020,
    75: 0.0030,
    85: 0.0035,
    3:  0.0075,
    5:  0.0140,
    7:  0.0200,
  };

  // Fraction of no-load RPM actually achieved under combined aero + electrical load.
  // Small high-KV motors sag dramatically due to winding resistance at high current.
  const motorLoadFraction = {
    65: 0.52,
    75: 0.48,
    85: 0.55,
    3:  0.65,
    5:  0.74,
    7:  0.78,
  };

  // Calibrated static thrust per motor (g) at each frame's preset KV/cell combo.
  // Tuned against community-reported top speeds; separate from the OSD thrust display.
  const speedThrustPerMotor = {
    65: 25,
    75: 60,
    85: 85,
    3:  180,
    5:  800,
    7:  900,
  };

  // Approx average current draw as a fraction of theoretical max, tuned per frame size (aggressive flying)
  const avgCurrentFraction = {
    65: 0.55,
    75: 0.55,
    85: 0.50,
    3:  0.45,
    5:  0.40,
    7:  0.35,
  };

  // Rough max current draw estimate (A) per motor at given KV/cell combo — simplified model
  function estMaxCurrentPerMotor(kv, cells, frame) {
    const voltage = cells * 3.7;
    // crude scaling: bigger frame = bigger motor = more current capacity
    const frameCurrentBase = { 65: 4, 75: 6, 85: 8, 3: 12, 5: 25, 7: 30 };
    const base = frameCurrentBase[frame];
    // scale slightly with KV/voltage relationship vs a reference
    return base * (voltage / (cells === 1 ? 4.2 : voltage)) * (kv / framePresets[frame].kv);
  }

  let currentFrame = '65';

  const els = {
    motorKV: document.getElementById('motorKV'),
    cells: document.getElementById('cells'),
    capacity: document.getElementById('capacity'),
    propPitch: document.getElementById('propPitch'),
    weight: document.getElementById('weight'),
    flightTime: document.getElementById('flightTime'),
    thrustWeight: document.getElementById('thrustWeight'),
    twRating: document.getElementById('twRating'),
    totalThrust: document.getElementById('totalThrust'),
  };

  const motorSelect = document.getElementById('motorSelect');

  function populateMotorSelect(frame) {
    motorSelect.innerHTML = '<option value="">— Select a motor or enter KV below —</option>';
    (motorDB[frame] || []).forEach((m, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.setAttribute('data-kv', m.kv);
      opt.setAttribute('data-pitch', m.propPitch);
      opt.setAttribute('data-weight', m.weightPerMotor);
      opt.textContent = `${m.name}  —  ${m.kv.toLocaleString()} KV`;
      motorSelect.appendChild(opt);
    });
    motorSelect.value = '';
  }

  const propDB = {
    65: [
      { name: 'Gemfan 1207 3-blade',              pitch: 0.7, weight: 0.15, shaft: '1.0mm' },
      { name: 'Gemfan 1208 3-blade',              pitch: 0.8, weight: 0.21, shaft: '1.5mm' },
      { name: 'Gemfan 1219S 3-blade',             pitch: 1.9, weight: 0.18, shaft: '1.0mm' },
      { name: 'HQ Ultralight 1.2x0.9x3',         pitch: 0.9, weight: 0.18, shaft: '1.0mm' },
      { name: 'HQ Ultralight 31mm 3-blade High',  pitch: 1.0, weight: 0.16, shaft: '1.0mm' },
      { name: 'HQ Ultralight 1.2x1.2 2-blade',   pitch: 1.2, weight: 0.14, shaft: '1.0mm' },
      { name: 'Gemfan 1210-2 2-blade',           pitch: 1.0, weight: 0.19, shaft: '1.0mm' },
    ],
    75: [
      { name: 'Gemfan 1611 3-blade',                    pitch: 1.1, weight: 0.085, shaft: '1.5mm' },
      { name: 'Gemfan 1610 2-blade',                    pitch: 1.0, weight: 0.18,  shaft: '1.0mm' },
      { name: 'Gemfan 1635 3-blade',                    pitch: 3.5, weight: 0.54,  shaft: '1.0mm' },
      { name: 'HQ Ultralight 40mm 1.6x1.1x3',          pitch: 1.1, weight: 0.28,  shaft: '1.0/1.5mm' },
      { name: 'HQ Ultralight 40mm 1.6x1x3',            pitch: 1.0, weight: 0.25,  shaft: '1.0/1.5mm' },
      { name: 'HQ Ultralight 40mm 2-blade 1.6x1.2',    pitch: 1.2, weight: 0.20,  shaft: '1.0/1.5mm' },
    ],
    85: [
      { name: 'Gemfan 2" T-mount 3-blade',        pitch: 0.9, weight: 0.4,  shaft: 'T-mount 1.5mm' },
      { name: 'Gemfan 2020 T-mount 3-blade',      pitch: 1.9, weight: 0.4,  shaft: 'T-mount 1.5mm' },
      { name: 'Gemfan Hurricane 2015 2-blade',    pitch: 1.5, weight: 0.5,  shaft: '1.5mm' },
      { name: 'HQ T2x2x3 T-mount 3-blade',        pitch: 2.0, weight: 0.35, shaft: 'T-mount' },
    ],
  };

  const propSelect = document.getElementById('propSelect');

  function populatePropSelect(frame) {
    propSelect.innerHTML = '<option value="">— Select a prop or enter pitch below —</option>';
    (propDB[frame] || []).forEach((p, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.setAttribute('data-pitch', p.pitch);
      opt.setAttribute('data-weight', p.weight);
      opt.setAttribute('data-shaft', p.shaft);
      opt.textContent = `${p.name}  (${p.pitch}" pitch)`;
      propSelect.appendChild(opt);
    });
    propSelect.value = '';
    document.getElementById('propShaftWarn').style.display = 'none';
  }

  propSelect.addEventListener('change', () => {
    const opt = propSelect.options[propSelect.selectedIndex];
    const pitch = opt.getAttribute('data-pitch');
    const shaft = opt.getAttribute('data-shaft') || '';
    if (pitch) els.propPitch.value = pitch;
    const motorOpt = motorSelect.options[motorSelect.selectedIndex];
    const motorWeight = motorOpt ? parseFloat(motorOpt.getAttribute('data-weight')) : NaN;
    const shaftWarn = shaft.includes('1.5mm') && !isNaN(motorWeight) && motorWeight < 1.6;
    document.getElementById('propShaftWarn').style.display = shaftWarn ? 'block' : 'none';
    calculate();
  });

  function populateCompareSelects(frame) {
    ['cmpSelectA', 'cmpSelectB'].forEach(id => {
      const sel = document.getElementById(id);
      sel.innerHTML = '<option value="">— Pick a motor —</option>';
      (motorDB[frame] || []).forEach((m, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `${m.name}  —  ${m.kv.toLocaleString()} KV`;
        sel.appendChild(opt);
      });
      sel.value = '';
    });
    document.getElementById('cmpKvA').value = '';
    document.getElementById('cmpKvB').value = '';
  }

  function applyPreset(frame) {
    const p = framePresets[frame];
    els.motorKV.value = p.kv;
    els.cells.value = p.cells;
    els.capacity.value = p.capacity;
    els.propPitch.value = p.pitch;
    els.weight.value = p.weight;
  }

  document.querySelectorAll('.frame-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.frame-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFrame = btn.dataset.frame;
      populateMotorSelect(currentFrame);
      populatePropSelect(currentFrame);
      populateCompareSelects(currentFrame);
      applyPreset(currentFrame);
      calculate();
    });
  });

  function currentFrameBaseWeight() {
    const baseWeights = { 65: 15, 75: 20, 85: 35, 3: 80, 5: 180, 7: 280 };
    return baseWeights[currentFrame] || 20;
  }

  motorSelect.addEventListener('change', () => {
    const opt = motorSelect.options[motorSelect.selectedIndex];
    const kv = opt.getAttribute('data-kv');
    const pitch = opt.getAttribute('data-pitch');
    const weight = opt.getAttribute('data-weight');
    if (kv) els.motorKV.value = kv;
    if (pitch) els.propPitch.value = pitch;
    if (weight) els.weight.value = parseFloat(weight) * 4 + currentFrameBaseWeight();
    calculate();
  });

  els.motorKV.addEventListener('input', () => { motorSelect.value = ''; });

  function computeStats(kv, cells, capacity, pitch, weight) {
    const voltage = cells * 3.7;
    const rpm_eff    = kv * voltage * motorLoadFraction[currentFrame];
    const pitch_m    = pitch * 0.0254;
    const v_pitch_ms = (pitch_m * rpm_eff) / 60;
    const kvRef      = framePresets[currentFrame].kv;
    const T_total_N  = (speedThrustPerMotor[currentFrame] * 4 * (kv / kvRef) / 1000) * 9.81;
    const rho = 1.225, CdA = frameCdA[currentFrame];
    const a_c = 0.5 * rho * CdA, b_c = T_total_N / v_pitch_ms;
    const disc = b_c * b_c + 4 * a_c * T_total_N;
    const v_ms    = disc >= 0 ? (-b_c + Math.sqrt(disc)) / (2 * a_c) : 0;
    const speedMph = Math.min(v_ms * 2.23694, v_pitch_ms * 2.23694 * 0.92);
    const maxCurrentPerMotor = estMaxCurrentPerMotor(kv, cells, currentFrame);
    const totalThrust  = maxCurrentPerMotor * voltage * thrustPerWatt[currentFrame] * 4;
    const tw           = totalThrust / weight;
    const avgCurrent   = maxCurrentPerMotor * 4 * avgCurrentFraction[currentFrame];
    const flightTimeMin = ((capacity / 1000) * 0.8 / avgCurrent) * 60;
    return { speedMph, totalThrust, tw, flightTimeMin };
  }

  function calculate() {
    const kv       = parseFloat(els.motorKV.value)   || 0;
    const cells    = parseFloat(els.cells.value)     || 1;
    const capacity = parseFloat(els.capacity.value)  || 0;
    const pitch    = parseFloat(els.propPitch.value) || 0;
    const weight   = parseFloat(els.weight.value)    || 1;
    const s = computeStats(kv, cells, capacity, pitch, weight);

    els.totalThrust.innerHTML = s.totalThrust.toFixed(0) + '<span class="unit">g</span>';

    const tw = s.tw;
    els.thrustWeight.innerHTML = tw.toFixed(1) + '<span class="unit">:1</span>';
    let rating = 'Mild / long-range tuned', warn = false;
    if      (tw >= 2 && tw < 4) { rating = 'Punchy'; }
    else if (tw >= 4 && tw < 6) { rating = 'Aggressive freestyle'; }
    else if (tw >= 6)           { rating = 'Extreme — wheelie warning'; warn = true; }
    els.twRating.textContent = rating;
    els.thrustWeight.classList.toggle('warn', warn);

    els.flightTime.innerHTML = s.flightTimeMin.toFixed(1) + '<span class="unit">min</span>';

    const frameMaxes = {
      65: { tw: 6.0,  ft: 3.5,  spd: 35  },
      75: { tw: 5.5,  ft: 4.0,  spd: 45  },
      85: { tw: 5.0,  ft: 5.0,  spd: 55  },
      3:  { tw: 8.0,  ft: 4.0,  spd: 70  },
      5:  { tw: 10.0, ft: 5.0,  spd: 100 },
      7:  { tw: 4.0,  ft: 20.0, spd: 80  },
    };
    const maxes    = frameMaxes[currentFrame];
    const twScore  = Math.min(tw / maxes.tw * 100, 100) * 0.50;
    const ftScore  = Math.min(s.flightTimeMin / maxes.ft * 100, 100) * 0.30;
    const spdScore = Math.min(s.speedMph / maxes.spd * 100, 100) * 0.20;
    const buildScore = Math.round(twScore + ftScore + spdScore);
    let kvBonus = 0;
    if (['65','75','85'].includes(String(currentFrame))) {
      const kvRef = { '65': 23000, '75': 19000, '85': 8000 };
      const kvMax = { '65': 40000, '75': 32500, '85': 11000 };
      const ref = kvRef[String(currentFrame)];
      const max = kvMax[String(currentFrame)];
      kvBonus = Math.round(Math.min((kv - ref) / (max - ref), 1) * 15);
      if (kvBonus < 0) kvBonus = 0;
    }
    const finalScore = Math.min(buildScore + kvBonus, 100);
    let personality;
    if      (finalScore >= 90) personality = 'WHEELIE WARNING ⚡';
    else if (finalScore >= 75) personality = 'COMPETITION READY';
    else if (finalScore >= 60) personality = 'AGGRESSIVE FREESTYLE';
    else if (finalScore >= 45) personality = 'LOCKED IN FREESTYLE';
    else if (finalScore >= 25) personality = 'RELAXED CRUISER';
    else                       personality = 'FLOATY — NEEDS MORE PUNCH';
    document.getElementById('buildScoreNum').textContent    = finalScore;
    document.getElementById('buildPersonality').textContent  = personality;
    document.getElementById('buildScoreClass').textContent   = 'scored within ' + currentFrame + 'mm class';
    document.getElementById('buildScoreBar').style.width     = finalScore + '%';
    compareCalculate();
  }

  function compareCalculate() {
    const kvA      = parseFloat(document.getElementById('cmpKvA').value);
    const kvB      = parseFloat(document.getElementById('cmpKvB').value);
    const cells    = parseFloat(els.cells.value)     || 1;
    const capacity = parseFloat(els.capacity.value)  || 0;
    const pitch    = parseFloat(els.propPitch.value) || 0;
    const weight   = parseFloat(els.weight.value)    || 1;
    const sA = (!isNaN(kvA) && kvA > 0) ? computeStats(kvA, cells, capacity, pitch, weight) : null;
    const sB = (!isNaN(kvB) && kvB > 0) ? computeStats(kvB, cells, capacity, pitch, weight) : null;

    function setPair(idA, idB, vA, vB, fmt) {
      const eA = document.getElementById(idA), eB = document.getElementById(idB);
      if (vA !== null) { eA.innerHTML = fmt(vA); eA.classList.add('filled'); }
      else             { eA.innerHTML = '—';     eA.classList.remove('filled'); }
      if (vB !== null) { eB.innerHTML = fmt(vB); eB.classList.add('filled'); }
      else             { eB.innerHTML = '—';     eB.classList.remove('filled'); }
      eA.classList.remove('winner'); eB.classList.remove('winner');
      if (vA !== null && vB !== null && vA !== vB)
        (vA > vB ? eA : eB).classList.add('winner');
    }

    setPair('cmpSpeedA',  'cmpSpeedB',  sA ? sA.speedMph      : null, sB ? sB.speedMph      : null, v => `${v.toFixed(0)}<span class="cmp-unit">mph</span>`);
    setPair('cmpTwA',     'cmpTwB',     sA ? sA.tw            : null, sB ? sB.tw            : null, v => `${v.toFixed(1)}<span class="cmp-unit">:1</span>`);
    setPair('cmpThrustA', 'cmpThrustB', sA ? sA.totalThrust   : null, sB ? sB.totalThrust   : null, v => `${v.toFixed(0)}<span class="cmp-unit">g</span>`);
    setPair('cmpTimeA',   'cmpTimeB',   sA ? sA.flightTimeMin : null, sB ? sB.flightTimeMin : null, v => `${v.toFixed(1)}<span class="cmp-unit">min</span>`);
  }

  function wireCompareInput(selectId, kvId) {
    const sel  = document.getElementById(selectId);
    const kvEl = document.getElementById(kvId);
    sel.addEventListener('change', () => {
      const idx = parseInt(sel.value);
      if (!isNaN(idx) && motorDB[currentFrame]?.[idx]) kvEl.value = motorDB[currentFrame][idx].kv;
      compareCalculate();
    });
    kvEl.addEventListener('input', () => { sel.value = ''; compareCalculate(); });
  }

  wireCompareInput('cmpSelectA', 'cmpKvA');
  wireCompareInput('cmpSelectB', 'cmpKvB');

  // ===== Battery C-Rating & Voltage Sag =====
  function calcBattery() {
    const cells   = parseInt(document.getElementById('battCells').value)   || 1;
    const mah     = parseFloat(document.getElementById('battMah').value)   || 0;
    const cRating = parseFloat(document.getElementById('battC').value)     || 1;
    const peakA   = parseFloat(document.getElementById('battPeakA').value) || 0;

    const maxRatedA  = cRating * (mah / 1000);
    const headroom   = ((maxRatedA - peakA) / maxRatedA) * 100;
    const esrOhms    = (cells * (1000 / cRating)) / 1000; // rough ESR model
    const sag        = peakA * esrOhms;
    const effV       = Math.max(0, cells * 4.2 - sag);

    document.getElementById('battMaxA').innerHTML    = maxRatedA.toFixed(0) + '<span class="tunit">A</span>';
    document.getElementById('battSag').innerHTML     = sag.toFixed(2)       + '<span class="tunit">V</span>';
    document.getElementById('battEffV').innerHTML    = effV.toFixed(2)       + '<span class="tunit">V</span>';

    const hEl = document.getElementById('battHeadroom');
    hEl.innerHTML = headroom.toFixed(0) + '<span class="tunit">%</span>';
    hEl.classList.toggle('warn', headroom < 10);

    const sEl = document.getElementById('battStatus');
    if (headroom >= 25) {
      sEl.textContent = 'Good — battery is well within its rated draw for this build.';
      sEl.className = 'batt-status';
    } else if (headroom >= 0) {
      sEl.textContent = 'Marginal — within spec but little headroom. Consider a higher C-rating or lower peak current.';
      sEl.className = 'batt-status warn';
    } else {
      sEl.textContent = `Overdrawing by ${Math.abs(headroom).toFixed(0)}% — battery not rated for this current. Expect heat, sag, and reduced cell life.`;
      sEl.className = 'batt-status warn';
    }
  }

  // ===== Prop Pitch Speed Reference Table =====
  const PITCH_LIST = [0.8, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.1, 5.5, 6.0];

  function buildPitchTable() {
    const kv           = parseFloat(document.getElementById('pitchKV').value)    || 0;
    const cells        = parseInt(document.getElementById('pitchCells').value)   || 1;
    const frame        = document.getElementById('pitchFrame').value;
    const currentPitch = parseFloat(els.propPitch.value) || 0;
    const rpm_eff      = kv * (cells * 3.7) * (motorLoadFraction[frame] || 0.75);
    const tbody        = document.getElementById('pitchTableBody');
    tbody.innerHTML    = '';

    PITCH_LIST.forEach(p => {
      const speedMph  = (p * rpm_eff * 60) / 63360;
      const isCurrent = Math.abs(p - currentPitch) < 0.05;
      const tr        = document.createElement('tr');
      if (isCurrent) tr.className = 'current-pitch';
      tr.innerHTML = `<td>${p.toFixed(1)}"</td><td class="pitch-speed">${speedMph.toFixed(0)} mph</td>`;
      tbody.appendChild(tr);
    });
  }

  // initial calc — sync inputs to active frame button before first render
  populateMotorSelect(currentFrame);
  populatePropSelect(currentFrame);
  populateCompareSelects(currentFrame);
  applyPreset(currentFrame);
  calculate();

  // recalc on any input change
  Object.values(els).forEach(el => {
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT') {
      el.addEventListener('input', calculate);
    }
  });

  // Battery calculator listeners
  ['battCells', 'battMah', 'battC', 'battPeakA'].forEach(id =>
    document.getElementById(id).addEventListener('input', calcBattery)
  );

  // Pitch table listeners — also rebuild when main prop pitch changes
  ['pitchKV', 'pitchCells', 'pitchFrame'].forEach(id =>
    document.getElementById(id).addEventListener('input', buildPitchTable)
  );
  els.propPitch.addEventListener('input', buildPitchTable);

  calcBattery();
  buildPitchTable();

  // ---- CONTACT FORM ----
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    document.getElementById('contactEmail').addEventListener('input', function() {
      document.getElementById('replyToField').value = this.value;
    });
    contactForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const btn = document.getElementById('contactSubmit');
      const errEl = document.getElementById('contactError');
      btn.disabled = true;
      btn.textContent = 'Sending...';
      errEl.style.display = 'none';
      try {
        const res = await fetch(contactForm.action, {
          method: 'POST',
          body: new FormData(contactForm),
          headers: { 'Accept': 'application/json' }
        });
        if (res.ok) {
          contactForm.style.display = 'none';
          document.getElementById('contactSuccess').style.display = 'block';
        } else {
          throw new Error('non-ok');
        }
      } catch (_) {
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Send Inquiry';
      }
    });
  }

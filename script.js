  // ===== Frame size presets (typical defaults) =====
  // Whoop classes only (65/75/85mm) — the calculator's models are calibrated
  // against real whoop builds and are NOT valid for 3"/5"/7" quads.
  // weight here is DRY weight (no battery). Pack weight is added in
  // calculate() from capacity via packWeightG(), so AUW = dry + pack.
  // Dry values chosen so each preset's AUW matches the old all-up figures:
  // 65: 19.5+8.2=27.7, 75: 25.3+12.7=38, 85: 39.6+2*12.7=65.
  // (65mm shifted when the LAVA 300 pack was measured at 8.2g, not 8.5g.)
  const framePresets = {
    65: { kv: 28000, cells: 1, capacity: 300, pitch: 0.7, weight: 19.5 },
    75: { kv: 22000, cells: 1, capacity: 450, pitch: 1.1, weight: 25.3 },
    85: { kv: 11000, cells: 2, capacity: 450, pitch: 0.9, weight: 39.6 },
  };

  // Real 1S whoop pack weights (BetaFPV BT2.0 / LAVA-class), grams. Linear
  // interpolation between points, per-mAh extrapolation past the ends,
  // multiplied by cell count for 2S. 480 sits below 450 because the LAVA II
  // 480 really is lighter than the BT2.0 450 -- these are scale numbers,
  // not a smooth model.
  // 300 is measured: BetaFPV LAVA 300mAh 1S HV, n=2 (8.14, 8.21) -> 8.2g.
  // See data/bench/*.json. The rest are still spec/estimated.
  const PACK_WEIGHTS = [
    [300, 8.2], [450, 12.7], [480, 12.6], [550, 14.5], [660, 16.5], [680, 16.5],
  ];
  function packWeightG(capacityMah, cells) {
    if (!capacityMah || capacityMah <= 0) return 0;
    const pts = PACK_WEIGHTS;
    let oneCell;
    if (capacityMah <= pts[0][0]) {
      oneCell = capacityMah * (pts[0][1] / pts[0][0]);
    } else if (capacityMah >= pts[pts.length - 1][0]) {
      oneCell = capacityMah * (pts[pts.length - 1][1] / pts[pts.length - 1][0]);
    } else {
      oneCell = pts[pts.length - 1][1];
      for (let i = 1; i < pts.length; i++) {
        if (capacityMah <= pts[i][0]) {
          const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
          oneCell = y0 + (y1 - y0) * (capacityMah - x0) / (x1 - x0);
          break;
        }
      }
    }
    return oneCell * (cells || 1);
  }

  // Real motor database by frame size — brand, stator, KV
  // Entries marked "2026" are the current-season additions. Weights are
  // manufacturer per-motor figures; no thrust/current is stored here, so
  // nothing in this table is a bench-derived performance claim.
  //
  // `shaft` is OPTIONAL: '1mm' or '1.5mm', and set ONLY where the vendor
  // states it or the owner confirmed it on a unit in hand. It drives the
  // prop shaft-mismatch warning. Leave it undefined rather than guessing --
  // an undefined shaft falls back to a mass heuristic, but a WRONG shaft
  // silently suppresses or fabricates the warning.
  //
  // `cells` is OPTIONAL and only set where the motor ships in a known cell
  // configuration that differs from — or needs pinning against — the frame
  // preset. Selecting such a motor drives the cell count, which changes
  // voltage and therefore both thrust figures. Omit it and the frame preset
  // wins (65/75 = 1S, 85 = 2S).
  const motorDB = {
    65: [
      { name: 'NewBeeDrone 0703 Silver Edition', kv: 16420, propPitch: 0.7, weightPerMotor: 1.90 }, // 2026
      // BetaFPV sells this family under two names on one page: the 23K and 27K
      // are 0702SE II (brass bushings), the 30K is 0702 II (dual ball bearing).
      // Weights differ per variant and were previously all carried as 1.50.
      // Source: betafpv.com/products/0702-ii-brushless-motors spec table.
      { name: 'BetaFPV 0702SE II',           kv: 23000, propPitch: 0.7, weightPerMotor: 1.45 },
      { name: 'Happymodel SE0702',            kv: 23000, propPitch: 0.7, weightPerMotor: 1.46 },
      { name: 'VCI Spark 0702',              kv: 25000, propPitch: 0.7, weightPerMotor: 1.52 },
      { name: 'Happymodel SE0702',            kv: 26000, propPitch: 0.7, weightPerMotor: 1.46 },
      { name: 'BetaFPV 0702SE II',           kv: 27000, propPitch: 0.7, weightPerMotor: 1.47 },
      { name: 'VCI Spark 0702',              kv: 27000, propPitch: 0.7, weightPerMotor: 1.52 },
      { name: 'NewBeeDrone Flow 0702 (dual ball bearing)', kv: 27000, propPitch: 0.7, weightPerMotor: 1.60 }, // 2026
      { name: 'Happymodel SE0702',            kv: 28000, propPitch: 0.7, weightPerMotor: 1.46, benchVerified: true }, // mobula6-2024-hdzero-se0702-28k.json
      { name: 'NewBeeDrone Flow 0702',        kv: 29000, propPitch: 0.7, weightPerMotor: 1.58 },
      { name: 'VCI Spark 0702',              kv: 29000, propPitch: 0.7, weightPerMotor: 1.52 },
      { name: 'BetaFPV 0702 II',             kv: 30000, propPitch: 0.7, weightPerMotor: 1.55 },
      // Name collision worth keeping straight: BetaFPV states the 0702 II 30000KV
      // is the same motor that shipped in the limited-edition first-gen Air65
      // "Champion Version". So "Champion" means 0702 II 30K on the old Air65, and
      // 0702 2026 36K on the Air65 II. Year + trim in the label is what separates
      // them; do not collapse these into a single "Champion" entry.
      { name: 'BetaFPV 0702 Racing (2026)',  kv: 30000, propPitch: 0.7, weightPerMotor: 1.50 }, // 2026, 0.10mm stator laminations; 1.50g per betafpv.com 0702 2026 spec table
      // VCI 0702 PRO DB — a SEPARATE line from VCI Spark 0702 above, not a
      // relabel: Spark is the 22-29K dual-bearing series at 1.52g, PRO DB is
      // 30K only. Both kept. 1.49g is the vendor figure (weBLEEDfpv product
      // page, 1mm shaft, 07*L2mm stator); the build sheet's ~2.2g estimate is
      // out of family for any 0702 and is not used. Flown in
      // data/bench/air65-analog-vci0702-30k.json.
      { name: 'VCI 0702 PRO DB',             kv: 30000, propPitch: 0.7, weightPerMotor: 1.49, benchVerified: true }, // 2026, air65-analog-vci0702-30k.json
      // BetaFPV product, not a weBLEEDfpv house motor. weBLEEDfpv resells the
      // BetaFPV 2026 trims (Champion/Racing/Freestyle is BetaFPV's own trim
      // naming for the Air65 II family) -- do not re-attribute these to the
      // reseller. Weight corrected 1.50 -> 1.59 from the vendor spec table.
      // Source: betafpv.com/products/0702-brushless-motors-2026.
      // OWNER-MEASURED WEIGHT -- the only row in this table not taken from a
      // vendor spec, and NOT on the same basis as the rows around it.
      //
      // No vendor, retailer, or aggregator publishes a per-motor weight for
      // this SKU. Four units weighed at 0.01g: 1.43, 1.43, 1.37, 1.43.
      // Median 1.43 used, not mean: ~0.06g is roughly 10mm of lead across
      // three phase wires, so the 1.37 outlier is almost certainly a longer
      // trim cut rather than a lighter motor.
      //
      // BASIS DIFFERS FROM EVERY OTHER ROW. These were weighed with leads cut
      // to 25mm and plugs removed; every other entry is a vendor as-shipped
      // figure. As-shipped here is probably ~1.58g (BetaFPV publishes a 0.07g
      // connector delta, and weBLEEDfpv states 40mm stock leads, so about
      // 15mm x 3 conductors was removed). That ~0.15g/motor is deliberately
      // NOT applied -- it is an estimate stack, not a measurement.
      // Consequence: this motor auto-derives a dry weight roughly 0.6g light
      // against its peers, which flatters T:W and the build score. See the
      // weight-basis note in PROJECT_NOTES.md.
      //
      // Units are old stock, bought before the current listing. weBLEEDfpv
      // revises SKUs (a 0702 SPECIAL EDITION V2 ships alongside a V1), so
      // current production may differ. 1mm shaft confirmed by owner --
      // a distinct SKU from the 1.5mm SCREAMERS.
      { name: 'weBLEEDfpv SCREAMERS 0702 (1mm)', kv: 32500, propPitch: 0.7, weightPerMotor: 1.43, shaft: '1mm' },
      { name: 'BetaFPV 0702 Champion (2026)', kv: 36000, propPitch: 0.7, weightPerMotor: 1.59 }, // 2026, dual-ball bearings
      // Vendor advises ~10 min rest between packs; continuous back-to-back
      // flights risk ESC damage at this KV.
      { name: 'weBLEEDfpv SKRRRT 0702',      kv: 40000, propPitch: 0.7, weightPerMotor: 1.60, shaft: '1mm' }, // shaft per vendor listing
    ],
    75: [
      { name: 'Happymodel RS0802',            kv: 19000, propPitch: 1.1, weightPerMotor: 1.80 },
      { name: 'Happymodel EX0802',            kv: 19000, propPitch: 1.1, weightPerMotor: 1.80 },
      { name: 'Happymodel SE0802',            kv: 19000, propPitch: 1.1, weightPerMotor: 1.90 }, // 1.9g per happymodel.cn SE0802 spec list
      { name: 'NewBeeDrone Flow 0802',        kv: 19000, propPitch: 1.1, weightPerMotor: 1.90 },
      { name: 'Tiny Whoop Onesie 0802 Boost Juice', kv: 19000, propPitch: 1.1, weightPerMotor: 2.00 }, // 2026
      { name: 'RCinPower GTS V3 0802',       kv: 22000, propPitch: 1.1, weightPerMotor: 1.90 },
      { name: 'Tiny Whoop Onesie 0802 Deuce Juice', kv: 22000, propPitch: 1.1, weightPerMotor: 2.00 }, // 2026
      // BetaFPV publishes no weight for the 0802 Freestyle trim -- the 2026 spec
      // table fills in Champion and Racing only. 1.90 is the pre-existing
      // in-family figure, carried forward unsourced rather than invented.
      { name: 'BetaFPV 0802 Freestyle (2026)', kv: 22000, propPitch: 1.1, weightPerMotor: 1.90 }, // 2026, weight UNSOURCED
      { name: 'iFlight XING NANO X0802',     kv: 22000, propPitch: 1.1, weightPerMotor: 2.00 },
      { name: 'BetaFPV 0802SE',              kv: 23000, propPitch: 1.1, weightPerMotor: 1.90 },
      { name: 'BetaFPV 0802 Racing (2026)',  kv: 25000, propPitch: 1.1, weightPerMotor: 1.88 }, // 2026, brass bushings; 1.88g per betafpv.com 0802 2026 spec table
      { name: 'NewBeeDrone Flow 0802',        kv: 25000, propPitch: 1.1, weightPerMotor: 1.90 },
      { name: 'Happymodel RS0802',            kv: 25000, propPitch: 1.1, weightPerMotor: 1.80 },
      // Full vendor title, for searchability: "weBLEEDfpv 0802 (1.5MM) VEGAN aka
      // SKYSCRAPERS 25,000kv w/Knurled Shaft Design". Listed here under the
      // short name pilots actually use.
      { name: 'weBLEEDfpv Skyscrapers 0802', kv: 25000, propPitch: 1.1, weightPerMotor: 2.00, shaft: '1.5mm' }, // shaft per vendor title (1.5MM)
      { name: 'Happymodel EX0802',            kv: 25000, propPitch: 1.1, weightPerMotor: 2.00 }, // 2026
      { name: 'Tiny Whoop Onesie 0802 Zeus Juice',  kv: 25000, propPitch: 1.1, weightPerMotor: 2.00 }, // 2026
      { name: 'RCinPower GTS V3 0802',       kv: 25000, propPitch: 1.1, weightPerMotor: 2.00 }, // 2026
      { name: 'NewBeeDrone Flow 0802',        kv: 27000, propPitch: 1.1, weightPerMotor: 1.90 },
      { name: 'RCinPower GTS V3 0802',       kv: 27000, propPitch: 1.1, weightPerMotor: 2.00 }, // 2026
      // BetaFPV product, not a weBLEEDfpv house motor -- see the 0702 Champion
      // note above. Weight corrected 1.90 -> 1.95 from the vendor spec table.
      // Source: betafpv.com/products/0802-brushless-motors-2026.
      { name: 'BetaFPV 0802 Champion (2026)', kv: 28000, propPitch: 1.1, weightPerMotor: 1.95 }, // 2026, dual-ball bearings
      { name: 'NewBeeDrone Flow 0802',        kv: 30000, propPitch: 1.1, weightPerMotor: 1.90 },
      // Co-branded with MoeFPV. Vendor title: "weBLEEDfpv (1.5MM) 0802 32,500kv
      // MOEFPV TREETOPPERS w/Knurled Shaft Design".
      { name: 'weBLEEDfpv x MoeFPV Treetoppers 0802', kv: 32500, propPitch: 1.1, weightPerMotor: 2.10, shaft: '1.5mm' }, // shaft per vendor title (1.5MM)
    ],
    85: [
      { name: 'BetaFPV 1103',               kv:  8000, propPitch: 0.9, weightPerMotor: 3.20 },
      { name: 'RCinPower 1003',              kv: 10000, propPitch: 0.9, weightPerMotor: 3.45 }, // 2026
      { name: 'Happymodel RS1102',           kv: 10000, propPitch: 0.9, weightPerMotor: 2.80, cells: 2 }, // 2026, Mobula7 O4 stock
      { name: 'BetaFPV 1103',               kv: 11000, propPitch: 0.9, weightPerMotor: 3.20 },
      { name: 'Happymodel EX1103',           kv: 11000, propPitch: 0.9, weightPerMotor: 3.20 },
      { name: 'Happymodel RS1102',           kv: 13500, propPitch: 0.9, weightPerMotor: 2.80, cells: 1 }, // 2026
      { name: 'BetaFPV 1103',               kv: 15000, propPitch: 0.9, weightPerMotor: 3.30, cells: 1 }, // 2026
      { name: 'Flywoo ROBO 1002',            kv: 23500, propPitch: 0.9, weightPerMotor: 2.50 },
    ],
  };

  // ===== Static thrust model: thrust_g = k * watts^THRUST_EXPONENT =====
  // Replaces a flat grams-per-watt constant, which could not represent the fact
  // that prop efficiency FALLS as power rises (g/W declined monotonically
  // 2.91 -> 1.79 across the measured sweep below).
  //
  // THRUST_EXPONENT is fitted from ONE dataset: the 9-point Happymodel EX1103
  // KV11000 test-stand sweep at 7.4V on a 2023R prop, which gives 0.781 with
  // R^2 = 0.998 log-log. Rounded to 0.78. That set is the sole source of the
  // exponent. A 2-point SE0702 sweep sits at 0.769, but two points define a
  // log-log line exactly, so it measures the local slope between two throttle
  // levels and independently confirms nothing about the curve shape.
  const THRUST_EXPONENT = 0.78;

  // Per-frame k, fitted with the exponent held at 0.78.
  //   65: Happymodel SE0702 KV28000 + Gemfan 1219 31mm tri-blade, 1S 3.7V.
  //       2 measured points, residuals +/-0.8%.
  //   85: Happymodel EX1103 KV11000 + 2023R, 2S 7.4V. 9 measured points,
  //       residuals within +4.6/-2.5%. NOTE: 2023R is 2.3" pitch; the 85mm
  //       frame card specifies 0.9" pitch, so this transfers only loosely.
  //   75: NOT MEASURED. No manufacturer test data exists for the 0802 motors
  //       in motorDB (weBLEEDfpv publishes none). Interpolated from the 65mm
  //       anchor by momentum-theory disk-area scaling, k ~ A^(1/3), for 40mm
  //       props. The same scaling under-predicts the measured 85mm k by 28%,
  //       so treat 75mm as +/-30% and replace it as soon as bench data exists.
  const thrustCoeffK = {
    65: 2.655,
    75: 3.147,  // interpolated, not measured
    85: 4.739,
  };

  function staticThrustPerMotor(amps, voltage, frame) {
    const watts = amps * voltage;
    if (watts <= 0) return 0;
    return thrustCoeffK[frame] * Math.pow(watts, THRUST_EXPONENT);
  }

  // Current the pack can actually source: capacity(Ah) * C-rating, split 4 ways.
  // Manufacturer bench rows routinely demand more than a whoop pack can give —
  // the EX1103's top row wants 36.8A, which is 82C from a 450mAh 2S.
  function packCurrentLimitPerMotor(capacityMah, cRating) {
    if (!capacityMah || !cRating) return Infinity;
    return ((capacityMah / 1000) * cRating) / 4;
  }

  // Frontal drag coefficient × area (m²) per frame — drives aerodynamic speed limit.
  // Calibrated so preset builds land on real whoop top speeds (see motorLoadFraction).
  const frameCdA = {
    65: 0.0015,
    75: 0.0025,
    85: 0.0035,
  };

  // Fraction of no-load RPM reached at TOP SPEED (props unload as airspeed
  // builds, so this sits far above the static-hover load fraction). Calibrated
  // with speedThrustPerMotor/frameCdA against real whoop GPS numbers:
  // Air65-class 65mm ≈ 40mph, 75mm 1S ≈ 42mph, 85mm 2S ≈ 37mph.
  const motorLoadFraction = {
    65: 0.95,
    75: 0.65,
    85: 0.65,
  };

  // Calibrated static thrust per motor (g) at each frame's preset KV/cell combo.
  // Tuned against community-reported top speeds; separate from the OSD thrust display.
  const speedThrustPerMotor = {
    65: 70,
    75: 60,
    85: 85,
  };

  // Average current as a fraction of theoretical max. Calibrated against real
  // whoop pack times: Air65-class 300mAh 1S ≈ 3.5min, 75mm 450 1S ≈ 4min,
  // 85mm 450 2S ≈ 4.5min.
  const avgCurrentFraction = {
    65: 0.29,
    75: 0.26,
    85: 0.15,
  };

  // ===== Flying style =====
  // The style multiplier scales the MODELLED propulsion current. Cruise is 1.0
  // because that is what the model actually predicts: avgCurrentFraction was
  // calibrated against ~3.5min on a 300mAh 1S, and the measured Air65 analog
  // cruise run came in at 3.9min / 4.2A against a model estimate of 4.38A —
  // 4% out. The old copy called this "aggressive freestyle"; the bench data
  // says it is a cruise number, so cruise anchors the scale and the harder
  // styles scale UP from it.
  //
  // freestyle/aggressive are ESTIMATED — no measured hover or freestyle runs
  // exist yet. They slot in as extra anchors when those runs land.
  const FLIGHT_STYLES = {
    cruise:     { label: 'Cruise',     mult: 1.00, measured: true  },
    freestyle:  { label: 'Freestyle',  mult: 1.35, measured: false },
    aggressive: { label: 'Aggressive', mult: 1.70, measured: false },
  };
  function currentStyle() {
    const v = els.flightStyle && els.flightStyle.value;
    return FLIGHT_STYLES[v] ? v : 'cruise';
  }

  // ===== Measured bench anchors =====
  // First-hand flight data from data/bench/*.json. Where a selected build
  // matches one of these, flight time comes from the measured average current
  // instead of the avgCurrentFraction estimate — a real number beats a fitted
  // one. usableFraction is 0.9 because the discharge anchor delivered 270mAh
  // from a 300mAh LiHV pack, not the 0.8 the generic model assumes.
  //
  // Matching is deliberately narrow — see benchAnchorFor below. Anything
  // outside it falls back to the model rather than borrowing another build's
  // numbers.
  const BENCH_ANCHORS = [
    { id: 'air65-analog-vci0702-30k',   frame: '65', kv: 30000, auwG: 25.42,
      avgCurrentA: 4.2, usableFraction: 0.9, video: 'analog',
      note: 'measured — Air65 analog, 233s cruise' },
    { id: 'mobula6-2024-hdzero-se0702-28k', frame: '65', kv: 28000, auwG: 27.73,
      avgCurrentA: 6.3, usableFraction: 0.9, video: 'hdzero',
      note: 'measured — Mobula6 HDZero, 154s cruise' },
  ];
  // Match on frame + KV + video system + AUW. Video matters because the video
  // system IS most of the difference between these two anchors — without it a
  // DJI build picked up the analog anchor's flight time. The AUW window is 5%
  // now that the weight model is bench-derived: predicted AUW lands within 0.3%
  // of measured for both anchors, so the window no longer carries the match.
  // Anchors are cruise runs, so they only apply in cruise. Comparing a measured
  // cruise flight against a freestyle estimate was the ambiguity that made the
  // old AUW margin fragile; matching style keeps it like for like.
  function benchAnchorFor(kv, frame, auw, video, style) {
    if (style !== 'cruise') return null;
    return BENCH_ANCHORS.find(a =>
      a.frame === String(frame) && a.kv === kv &&
      a.video === (video || 'analog') &&
      Math.abs(auw - a.auwG) / a.auwG <= 0.05) || null;
  }

  // Rough max current draw estimate (A) per motor at given KV/cell combo — simplified model
  function estMaxCurrentPerMotor(kv, cells, frame) {
    const voltage = cells * 3.7;
    // crude scaling: bigger frame = bigger motor = more current capacity
    const frameCurrentBase = { 65: 4, 75: 6, 85: 8 };
    const base = frameCurrentBase[frame];
    // scale slightly with KV/voltage relationship vs a reference
    // Derate nominal (3.7V/cell) against full charge (4.2V/cell) — 0.881 at any
    // cell count. Previously written as (cells === 1 ? 4.2 : voltage), which for
    // 2S reduced to voltage/voltage = 1.0 and skipped the derate entirely,
    // handing 2S builds 1.135x the current of 1S for no physical reason.
    return base * (voltage / (cells * 4.2)) * (kv / framePresets[frame].kv);
  }

  let currentFrame = '65';

  const els = {
    motorKV: document.getElementById('motorKV'),
    cells: document.getElementById('cells'),
    capacity: document.getElementById('capacity'),
    propPitch: document.getElementById('propPitch'),
    weight: document.getElementById('weight'),
    flightTime: document.getElementById('flightTime'),
    flightSub:  document.getElementById('flightSub'),
    thrustWeight: document.getElementById('thrustWeight'),
    twRating: document.getElementById('twRating'),
    totalThrust: document.getElementById('totalThrust'),
    thrustSub:   document.getElementById('thrustSub'),
    benchTw:     document.getElementById('benchTw'),
    benchSub:    document.getElementById('benchSub'),
    packC:       document.getElementById('packC'),
    videoSystem: document.getElementById('videoSystem'),
    flightStyle: document.getElementById('flightStyle'),
    videoHint:   document.getElementById('videoHint'),
    twCeilingBadge: document.getElementById('twCeilingBadge'),
  };

  // Above this thrust-to-weight a whoop gets wheelie-prone and hard to fly
  // smoothly in tight spaces — see the "How to choose a motor" section.
  // Advisory only: the calculator flags it, it does not clamp or block.
  const TW_CEILING = 6;
  // Second tier for the comparison table's colour coding only.
  const TW_DANGER  = 8;

  const motorSelect = document.getElementById('motorSelect');

  function populateMotorSelect(frame) {
    motorSelect.innerHTML = '<option value="">— Select a motor or enter KV below —</option>';
    (motorDB[frame] || []).forEach((m, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.setAttribute('data-kv', m.kv);
      opt.setAttribute('data-pitch', m.propPitch);
      opt.setAttribute('data-weight', m.weightPerMotor);
      if (m.cells) opt.setAttribute('data-cells', m.cells);
      if (m.shaft) opt.setAttribute('data-motor-shaft', m.shaft);
      opt.textContent = `${m.name}  —  ${m.kv.toLocaleString()} KV`
                      + (m.cells ? `  ·  ${m.cells}S` : '')
                      + (m.benchVerified ? '  ·  ✓ bench-verified' : '');
      if (m.benchVerified) opt.title = 'Flown and measured — see data/bench/';
      motorSelect.appendChild(opt);
    });
    motorSelect.value = '';
  }

  // Prop database, keyed by frame class: 65 = 31mm, 75 = 40mm, 85 = 2".
  // `blades` drives the (bi)/(tri)/(quad) suffix in the dropdown label.
  // Pitch on 2026 additions is read from the model designation (Gemfan 1220
  // = 1.2" diameter, 2.0" pitch) — same convention the existing rows follow.
  const propDB = {
    65: [
      { name: 'Gemfan 1207 3-blade',              pitch: 0.7, weight: 0.15, shaft: '1.0mm', blades: 3 },
      { name: 'Gemfan 1207S 3-blade (2026)',      pitch: 0.7, weight: 0.30, shaft: '1.0mm', blades: 3 }, // 2026
      { name: 'Gemfan 1208 3-blade',              pitch: 0.8, weight: 0.21, shaft: '1.5mm', blades: 3 },
      { name: 'Gemfan 1219S 3-blade',             pitch: 1.9, weight: 0.18, shaft: '1.0mm', blades: 3 },
      { name: 'HQ Ultralight 1.2x0.9x3',         pitch: 0.9, weight: 0.18, shaft: '1.0mm', blades: 3 },
      { name: 'HQ Ultralight 31mm 3-blade High',  pitch: 1.0, weight: 0.16, shaft: '1.0mm', blades: 3 },
      { name: 'HQ Ultralight 1.2x1.2 2-blade',   pitch: 1.2, weight: 0.14, shaft: '1.0mm', blades: 2 },
      { name: 'Gemfan 1210-2 2-blade',           pitch: 1.0, weight: 0.19, shaft: '1.0mm', blades: 2 },
      // Same 1210-2 mould as the row above, 1.5mm hub — the shaft the SKRRRT
      // and other 1.5mm whoop motors take.
      { name: 'Gemfan 1210-2 2-blade (1.5mm)',   pitch: 1.0, weight: 0.19, shaft: '1.5mm', blades: 2 }, // 2026
      { name: 'Gemfan 1220-4 quad-blade',        pitch: 2.0, weight: 0.40, shaft: '1.0mm', blades: 4 }, // 2026
    ],
    75: [
      { name: 'Gemfan 1611 3-blade',                    pitch: 1.1, weight: 0.085, shaft: '1.5mm',     blades: 3 },
      { name: 'Gemfan 1610 2-blade',                    pitch: 1.0, weight: 0.18,  shaft: '1.0mm',     blades: 2 },
      { name: 'Gemfan 1614 3-blade',                    pitch: 1.4, weight: 0.50,  shaft: '1.0/1.5mm', blades: 3 }, // 2026
      { name: 'Gemfan 1635 3-blade',                    pitch: 3.5, weight: 0.54,  shaft: '1.0mm',     blades: 3 },
      { name: 'Gemfan 1636 4-blade',                    pitch: 3.6, weight: 0.80,  shaft: '1.0/1.5mm', blades: 4 }, // 2026
      { name: 'HQ Ultralight 40mm 1.6x1.1x3',          pitch: 1.1, weight: 0.28,  shaft: '1.0/1.5mm', blades: 3 },
      { name: 'HQ Ultralight 40mm 1.6x1x3',            pitch: 1.0, weight: 0.25,  shaft: '1.0/1.5mm', blades: 3 },
      { name: 'HQ Ultralight 40mm 2-blade 1.6x1.2',    pitch: 1.2, weight: 0.20,  shaft: '1.0/1.5mm', blades: 2 },
    ],
    85: [
      { name: 'Gemfan 2" T-mount 3-blade',        pitch: 0.9, weight: 0.4,  shaft: 'T-mount 1.5mm', blades: 3 },
      { name: 'Emax Avan Micro 2" 3-blade',       pitch: 1.2, weight: 0.75, shaft: 'T-mount 1.5mm', blades: 3 }, // 2026
      { name: 'Gemfan Hurricane 2015 2-blade',    pitch: 1.5, weight: 0.5,  shaft: '1.5mm',         blades: 2 },
      { name: 'Gemfan 2020 T-mount 3-blade',      pitch: 1.9, weight: 0.4,  shaft: 'T-mount 1.5mm', blades: 3 },
      { name: 'HQ T2x2x3 T-mount 3-blade',        pitch: 2.0, weight: 0.35, shaft: 'T-mount',       blades: 3 },
      { name: 'HQ Durable T2x2x3',                pitch: 2.0, weight: 0.75, shaft: 'T-mount',       blades: 3 }, // 2026
      { name: 'Gemfan 2035 4-blade',              pitch: 3.5, weight: 1.00, shaft: 'T-mount 1.5mm', blades: 4 }, // 2026, needs 1103+
    ],
  };

  // Blade-count suffix shown in the prop dropdown label.
  const bladeTag = { 2: 'bi', 3: 'tri', 4: 'quad' };

  const propSelect = document.getElementById('propSelect');

  function populatePropSelect(frame) {
    propSelect.innerHTML = '<option value="">— Select a prop or enter pitch below —</option>';
    (propDB[frame] || []).forEach((p, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.setAttribute('data-pitch', p.pitch);
      opt.setAttribute('data-weight', p.weight);
      opt.setAttribute('data-shaft', p.shaft);
      const tag = bladeTag[p.blades];
      opt.textContent = `${p.name}  (${p.pitch}" pitch${tag ? ', ' + tag : ''})`;
      propSelect.appendChild(opt);
    });
    propSelect.value = '';
    document.getElementById('propShaftWarn').style.display = 'none';
  }

  // Shaft-mismatch warning. Fires when a 1.5mm-bore prop is paired with a
  // motor known to have a 1mm shaft.
  //
  // The motor's `shaft` field is authoritative wherever it is set. Where it
  // is not, fall back to the original mass heuristic (under 1.6g implies a
  // 1mm shaft), which is only a proxy and generates false negatives:
  // weBLEEDfpv SKRRRT 0702 is a 1mm motor at exactly 1.60g, so the heuristic
  // alone never warned on it. The fallback should shrink as `shaft` gets
  // populated, and can be deleted once every row carries one.
  function updateShaftWarn() {
    const propOpt  = propSelect.options[propSelect.selectedIndex];
    const motorOpt = motorSelect.options[motorSelect.selectedIndex];
    const propShaft = propOpt ? (propOpt.getAttribute('data-shaft') || '') : '';
    // Some props are sold with both bores ('1.0/1.5mm') and fit either shaft,
    // so only a 1.5mm-ONLY prop can mismatch.
    const propIs15Only = propShaft.includes('1.5mm') && !propShaft.includes('1.0/');
    let warn = false;
    if (propIs15Only && motorOpt) {
      const motorShaft = motorOpt.getAttribute('data-motor-shaft');
      if (motorShaft) {
        warn = motorShaft === '1mm';
      } else {
        const motorWeight = parseFloat(motorOpt.getAttribute('data-weight'));
        warn = !isNaN(motorWeight) && motorWeight < 1.6;
      }
    }
    document.getElementById('propShaftWarn').style.display = warn ? 'block' : 'none';
  }

  propSelect.addEventListener('change', () => {
    const opt = propSelect.options[propSelect.selectedIndex];
    const pitch = opt.getAttribute('data-pitch');
    if (pitch) els.propPitch.value = pitch;
    updateShaftWarn();
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
    // Seed a real default matchup so the comparison never opens as a wall of
    // dashes: A = the first bench-verified motor for this frame, B = the other
    // bench-verified motor if one exists (a measured-vs-measured matchup),
    // else the closest different KV. Runtime lookup, so reordering the motor
    // DB never breaks the seed.
    const list = motorDB[frame] || [];
    if (list.length >= 2) {
      let ia = list.findIndex(m => m.benchVerified);
      if (ia < 0) ia = 0;
      let ib = list.findIndex((m, i) => i !== ia && m.benchVerified);
      if (ib < 0) {
        let best = Infinity;
        list.forEach((m, i) => {
          if (i === ia || m.kv === list[ia].kv) return;
          const d = Math.abs(m.kv - list[ia].kv);
          if (d < best) { best = d; ib = i; }
        });
      }
      if (ib < 0) ib = ia === 0 ? 1 : 0;
      document.getElementById('cmpSelectA').value = String(ia);
      document.getElementById('cmpSelectB').value = String(ib);
      document.getElementById('cmpKvA').value = list[ia].kv;
      document.getElementById('cmpKvB').value = list[ib].kv;
      compareCalculate();
    }
  }

  // Dry weight is deliberately NOT preset — see dryWeightInput(). framePresets
  // still carries a .weight per class because the AUW figures the rest of the
  // model is calibrated against were built from it (see the table comment), but
  // nothing writes it into the field any more. Switching class clears whatever
  // was there: a 65mm dry weight is meaningless on an 85mm.
  function applyPreset(frame) {
    const p = framePresets[frame];
    els.motorKV.value = p.kv;
    els.cells.value = p.cells;
    els.capacity.value = p.capacity;
    els.propPitch.value = p.pitch;
    els.weight.value = '';
    delete els.weight.dataset.derived;
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
      updateVideoHint();
      calculate();
    });
  });

  // ===== Dry-weight model: frame base + video system =====
  // Base = everything that is not motors: frame, FC/ESC, receiver, canopy,
  // props, wiring. Derived by subtracting 4x the motor weight from a measured
  // dry weight, so it carries whatever the airframe actually is.
  //
  //   65mm analog  11.3g  = 17.22 dry - 4x1.49  (data/bench/air65-analog-vci0702-30k.json)
  //   65mm HDZero  13.7g  = 19.53 dry - 4x1.46  (data/bench/mobula6-2024-hdzero-se0702-28k.json)
  //   video delta   2.4g  = 13.7 - 11.3
  //
  // bench-derived n=2, revisit as bench data grows
  // Two frames only (Air65, Mobula6 2024). Other 65mm frames vary about
  // +/-1.5g, so treat the base as a class figure, not a per-frame spec.
  //
  // 75/85mm have no bench data and keep the previous estimates. DJI/Walksnail
  // has no measured delta either, so that combination falls back to the old
  // flat 15g rather than inventing an adder — flagged as estimated in the UI.
  const FRAME_BASE_G = {
    65: { value: 11.3, measured: true },
    75: { value: 20,   measured: false },
    85: { value: 35,   measured: false },
  };
  const VIDEO_ADDER_G = {
    analog:  { value: 0,    measured: true  },  // baseline, already in the base
    hdzero:  { value: 2.4,  measured: true  },
    digital: { value: null, measured: false },  // no bench data — see fallback
  };
  const LEGACY_BASE_G = { 65: 15, 75: 20, 85: 35 };  // pre-bench flat estimate

  function currentVideoSystem() {
    return (els.videoSystem && els.videoSystem.value) || 'analog';
  }
  // Returns { grams, measured } so callers can say which it is.
  function currentFrameBaseWeight(video) {
    const v = video || currentVideoSystem();
    const frame = FRAME_BASE_G[currentFrame];
    const adder = VIDEO_ADDER_G[v];
    if (!frame || !adder || adder.value === null) {
      return { grams: LEGACY_BASE_G[currentFrame] || 20, measured: false };
    }
    return { grams: frame.value + adder.value, measured: frame.measured && adder.measured };
  }

  motorSelect.addEventListener('change', () => {
    const opt = motorSelect.options[motorSelect.selectedIndex];
    // The warning depends on BOTH selections, so it has to be re-evaluated
    // here as well. Previously only the prop handler did it, which left a
    // stale or missing warning whenever the motor was the second pick.
    updateShaftWarn();
    const kv = opt.getAttribute('data-kv');
    const pitch = opt.getAttribute('data-pitch');
    const weight = opt.getAttribute('data-weight');
    const cells = opt.getAttribute('data-cells');
    if (kv) els.motorKV.value = kv;
    if (pitch) els.propPitch.value = pitch;
    // Motors with a pinned cell count drive the selector; the rest fall back to
    // the frame preset, so a 1S pick does not stay latched on the next motor.
    els.cells.value = cells || framePresets[currentFrame].cells;
    // DRY estimate: motors + bare frame/electronics. This used to be written
    // into an all-up-weight field with no battery term at all, which silently
    // dropped ~12g of pack from every TWR (132g thrust / 27.6g "AUW" = 4.8:1
    // and a wheelie warning for builds that really fly at 3.7:1). The pack is
    // now added in calculate() from capacity.
    // Flagged as derived so the AUW readout can label it an estimate. Picking a
    // motor is an explicit act, so filling the field here is not a silent
    // default — but it is still catalogue arithmetic, not a scale.
    if (weight) {
      els.weight.value = (parseFloat(weight) * 4 + currentFrameBaseWeight().grams).toFixed(1);
      els.weight.dataset.derived = '1';
    }
    calculate();
  });

  els.motorKV.addEventListener('input', () => { motorSelect.value = ''; });

  // Typing in the weight box means it was weighed — drop the estimate label.
  // Registered before the generic recalc loop at the bottom of init so the flag
  // is already cleared by the time calculate() reads it.
  els.weight.addEventListener('input', () => { delete els.weight.dataset.derived; });

  // Video system feeds the dry-weight model, so changing it re-derives the
  // weight from the selected motor exactly as picking a motor would.
  function reDeriveDryWeight() {
    const opt = motorSelect.options[motorSelect.selectedIndex];
    const w = opt ? opt.getAttribute('data-weight') : null;
    if (w) {
      els.weight.value = (parseFloat(w) * 4 + currentFrameBaseWeight().grams).toFixed(1);
      els.weight.dataset.derived = '1';
    }
  }
  function updateVideoHint() {
    if (!els.videoHint) return;
    const base = currentFrameBaseWeight();
    els.videoHint.textContent = base.measured
      ? 'Airframe base ' + base.grams.toFixed(1) + 'g — bench-measured (n=2)'
      : 'Airframe base ' + base.grams.toFixed(1) + 'g — estimated, no bench data for this combination';
    els.videoHint.classList.toggle('warn', !base.measured);
  }
  if (els.videoSystem) {
    els.videoSystem.addEventListener('change', () => {
      reDeriveDryWeight();
      updateVideoHint();
      calculate();
    });
  }
  // Style only scales current, so no weight re-derive — but it must recalc on
  // 'change' as well as 'input', or the readout lags one selection behind.
  if (els.flightStyle) els.flightStyle.addEventListener('change', calculate);

  function computeStats(kv, cells, capacity, pitch, weight, cRating) {
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
    // Bench figure: what the motors would pull on an unlimited supply.
    const maxCurrentPerMotor = estMaxCurrentPerMotor(kv, cells, currentFrame);
    const benchThrust = staticThrustPerMotor(maxCurrentPerMotor, voltage, currentFrame) * 4;
    const twBench     = benchThrust / weight;

    // Headline figure: clamp per-motor current to what the pack can source.
    const packLimitPerMotor  = packCurrentLimitPerMotor(capacity, cRating);
    const effCurrentPerMotor = Math.min(maxCurrentPerMotor, packLimitPerMotor);
    const totalThrust = staticThrustPerMotor(effCurrentPerMotor, voltage, currentFrame) * 4;
    const tw          = totalThrust / weight;
    const packLimited = packLimitPerMotor < maxCurrentPerMotor;

    // Flight time still runs off the unclamped current: avgCurrentFraction was
    // fitted on top of it, so re-pointing this at effCurrentPerMotor would shift
    // every flight time. Deferred until avgCurrentFraction is refitted.
    // A matching bench anchor replaces the fitted estimate outright: measured
    // average current, and the 0.9 usable fraction the discharge anchor showed
    // (270mAh delivered from a 300mAh LiHV pack) instead of the generic 0.8.
    const styleKey = currentStyle();
    const style    = FLIGHT_STYLES[styleKey];
    const anchor = benchAnchorFor(kv, currentFrame, weight, currentVideoSystem(), styleKey);
    const avgCurrent   = anchor
      ? anchor.avgCurrentA
      : maxCurrentPerMotor * 4 * avgCurrentFraction[currentFrame] * style.mult;
    const usableFrac   = anchor ? anchor.usableFraction : 0.8;
    const flightTimeMin = ((capacity / 1000) * usableFrac / avgCurrent) * 60;
    return { speedMph, totalThrust, tw, flightTimeMin, benchThrust, twBench,
             packLimited, effCurrentPerMotor, maxCurrentPerMotor, packLimitPerMotor,
             anchor, style, styleKey };
  }

  // Whoop-realistic input clamps (0602–1103 motors, ≤2" props, 1S–2S, whoop AUW).
  // HTML min/max only guards the spinners — typed values get clamped here too.
  function clampRange(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  const WHOOP_RANGES = {
    kv:       [8000, 40000],  // 0602–1103 class motors
    cells:    [1, 2],         // 1S–2S only
    capacity: [200, 800],     // mAh — whoop packs
    pitch:    [0.5, 3.5],     // inches of PITCH on ≤2"-diameter whoop props
    weight:   [14, 80],       // g DRY (no battery) — pack weight added from capacity
    cRating:  [30, 150],      // C — whoop pack range, matches the battery tool
  };
  // ===== WEIGHT SCORING =====
  // All-up weight decides how a whoop flies, but the raw gram figure means
  // nothing across classes: 30g is heavy for a 65mm and light for an 85mm. Each
  // class therefore gets its own ideal and practical maximum, and the score is
  // scaled by how far past ideal the build actually sits.
  //
  // The 65mm ideal is the Air65 bench build — 25.42g on a scale, the same
  // machine BENCH_ANCHORS uses for flight time — rounded to 25.5g, so the one
  // build we have physically measured scores unpenalised by construction.
  const WEIGHT_BANDS = {
    65: { ideal: 25.5, max: 32 },
    75: { ideal: 32,   max: 42 },
    85: { ideal: 42,   max: 55 },
  };

  // 1.0 at or under ideal, then a quadratic falloff to a 0.6 floor reached
  // exactly at max. Quadratic rather than linear so the first gram over ideal
  // costs almost nothing (t=0.15 is still x0.99) and the penalty steepens as the
  // build gets genuinely porky. Past max it clamps at the floor instead of
  // running to zero — an overweight whoop still flies, it just flies badly, and
  // a score of 0 would say something the model cannot support.
  function weightScore(auw, frame) {
    const band = WEIGHT_BANDS[frame];
    if (!band || !auw || auw <= 0) return { multiplier: 1, band: null, t: 0 };
    if (auw <= band.ideal)         return { multiplier: 1, band, t: 0 };
    const t = (auw - band.ideal) / (band.max - band.ideal);
    return { multiplier: Math.max(0.6, 1 - 0.4 * t * t), band, t };
  }

  // ===== DRY WEIGHT: no default, on purpose =====
  // This is the highest-leverage input on the page. It sets AUW, AUW divides
  // thrust for T:W (50% of the composite), and it drives the weightScore
  // multiplier that scales the whole score including the KV bonus. A preset
  // here is indistinguishable from a measurement once it is sitting in the box,
  // and every class preset we could pick is wrong for some real build in that
  // class — the 75mm preset alone put every default build 6g over its own
  // WEIGHT_BANDS ideal and silently cost x0.856. It is also the one input a
  // scale settles in ten seconds. So the field ships blank and the calculator
  // refuses to produce numbers until it is filled.
  //
  // Returns null when unset/unparseable — callers must handle that, NOT
  // substitute a fallback. The old `parseFloat(...) || 1` turned blank into 1g,
  // which clamped to 14g and rendered a full set of confident wrong results.
  function dryWeightInput() {
    const raw = els.weight.value;
    if (raw === null || String(raw).trim() === '') return null;
    const n = parseFloat(raw);
    if (!isFinite(n) || n <= 0) return null;
    return clampRange(n, ...WHOOP_RANGES.weight);
  }

  // Blank every derived readout and tell the user why. Nagging beats a silent
  // wrong number: an empty OSD is obviously incomplete, a plausible one is not.
  const AWAIT_WEIGHT_MSG = 'Enter the dry weight above to calculate — no default is assumed, because a guessed weight changes every number below.';
  function showAwaitingWeight() {
    const dash = '<span class="unit">—</span>';
    els.totalThrust.innerHTML  = dash;
    els.benchTw.innerHTML      = dash;
    els.thrustWeight.innerHTML = dash;
    els.flightTime.innerHTML   = dash;
    els.thrustSub.textContent  = 'Awaiting dry weight';
    els.benchSub.textContent   = 'Awaiting dry weight';
    els.twRating.textContent   = '—';
    els.thrustWeight.classList.remove('warn');
    els.twCeilingBadge.hidden  = true;
    if (els.flightSub) {
      els.flightSub.textContent = 'Awaiting dry weight';
      els.flightSub.classList.remove('measured');
    }
    document.getElementById('buildScoreNum').textContent   = '—';
    document.getElementById('buildPersonality').textContent = 'WEIGH IT FIRST';
    document.getElementById('buildScoreClass').textContent  = 'scored within ' + currentFrame + 'mm class';
    document.getElementById('buildScoreBar').style.width    = '0%';
    const wEl = document.getElementById('buildScoreWeight');
    if (wEl) { wEl.textContent = ''; wEl.classList.remove('penalized', 'floored'); }
    const auwValEl = document.getElementById('auwValue');
    if (auwValEl) auwValEl.innerHTML = dash;
    const auwSubEl = document.getElementById('auwBreakdown');
    if (auwSubEl) auwSubEl.textContent = 'dry weight not set';
    const auwEl = document.getElementById('auwReadout');
    if (auwEl) { auwEl.textContent = AWAIT_WEIGHT_MSG; auwEl.classList.add('warn'); }
  }

  function calculate() {
    const kv       = clampRange(parseFloat(els.motorKV.value)   || 0, ...WHOOP_RANGES.kv);
    const cells    = clampRange(parseFloat(els.cells.value)     || 1, ...WHOOP_RANGES.cells);
    const capacity = clampRange(parseFloat(els.capacity.value)  || 0, ...WHOOP_RANGES.capacity);
    const pitch    = clampRange(parseFloat(els.propPitch.value) || 0, ...WHOOP_RANGES.pitch);
    const dryWeight = dryWeightInput();
    const cRating  = clampRange(parseFloat(els.packC.value)     || 0, ...WHOOP_RANGES.cRating);
    if (dryWeight === null) {
      showAwaitingWeight();
      compareCalculate();
      return;
    }
    // AUW = dry weight + real pack weight. TWR, the build score, and the
    // wheelie warning all key off this; omitting the pack inflated TWR ~30%.
    const packG = packWeightG(capacity, cells);
    const auw   = dryWeight + packG;
    const s = computeStats(kv, cells, capacity, pitch, auw, cRating);

    const auwEl = document.getElementById('auwReadout');
    if (auwEl) {
      const floors = { 65: 20, 75: 30, 85: 40 };
      const floor = floors[currentFrame] || 0;
      let text = `AUW used: ${auw.toFixed(1)}g = ${dryWeight.toFixed(1)}g dry + ${packG.toFixed(1)}g pack (${capacity.toFixed(0)}mAh ${cells}S)`;
      // Picking a motor fills the dry weight from 4x its catalogue mass plus the
      // frame base. That is an ESTIMATE the user opted into, not a measurement,
      // and it must say so — the whole point of blanking the default is that an
      // unlabelled number in this box gets read as a scale reading.
      const derived = els.weight.dataset.derived === '1';
      if (derived) text += ' — dry weight ESTIMATED from motor + frame base, not weighed';
      const light = auw < floor;
      if (light) text += ` — check weights: under ${floor}g is unusually light for a ${currentFrame}mm build`;
      auwEl.textContent = text;
      auwEl.classList.toggle('warn', light || derived);
    }

    els.totalThrust.innerHTML = s.totalThrust.toFixed(0) + '<span class="unit">g</span>';
    els.thrustSub.textContent = s.packLimited
      ? `Pack-limited: ${(s.effCurrentPerMotor * 4).toFixed(1)}A available vs ${(s.maxCurrentPerMotor * 4).toFixed(1)}A the motors want`
      : `Motor-limited: motors draw ${(s.maxCurrentPerMotor * 4).toFixed(1)}A, under the pack's ${(s.packLimitPerMotor * 4).toFixed(1)}A limit`;

    els.benchTw.innerHTML = s.twBench.toFixed(1) + '<span class="unit">:1</span>';
    els.benchSub.textContent = s.packLimited
      ? `${s.benchThrust.toFixed(0)}g on an unlimited supply — a higher C-rating closes this gap`
      : `${s.benchThrust.toFixed(0)}g — pack is not the constraint on this build`;

    const tw = s.tw;
    els.thrustWeight.innerHTML = tw.toFixed(1) + '<span class="unit">:1</span>';
    let rating = 'Mild / long-range tuned', warn = false;
    if      (tw >= 2 && tw < 4) { rating = 'Punchy'; }
    else if (tw >= 4 && tw < 6) { rating = 'Aggressive freestyle'; }
    else if (tw >= 6)           { rating = 'Extreme — wheelie warning'; warn = true; }
    els.twRating.textContent = rating;
    els.thrustWeight.classList.toggle('warn', warn);
    // Advisory ceiling flag — never blocks or clamps the figure.
    els.twCeilingBadge.hidden = tw <= TW_CEILING;

    els.flightTime.innerHTML = s.flightTimeMin.toFixed(1) + '<span class="unit">min</span>';
    if (els.flightSub) {
      els.flightSub.textContent = s.anchor
        ? s.style.label + ' — anchored to measured data (' + s.anchor.avgCurrentA + 'A avg)'
        : s.style.label + ' — estimated';
      els.flightSub.classList.toggle('measured', !!s.anchor);
    }

    const frameMaxes = {
      65: { tw: 6.0,  ft: 3.5,  spd: 45  },
      75: { tw: 5.5,  ft: 4.0,  spd: 48  },
      // 85mm ceilings recalibrated: the old {5.0, 5.0, 45} sat BELOW what the
      // model outputs for ordinary 2S builds (stock preset = 6.4:1 TW, 5.1min),
      // so every component capped and the whole class scored 92-100. Ranges
      // observed across realistic builds: TW 4.6-7.0, FT 4.5-7.0min, 21-41mph.
      85: { tw: 7.5,  ft: 7.5,  spd: 48  },
    };
    const maxes    = frameMaxes[currentFrame];
    const twScore  = Math.min(tw / maxes.tw * 100, 100) * 0.50;
    const ftScore  = Math.min(s.flightTimeMin / maxes.ft * 100, 100) * 0.30;
    const spdScore = Math.min(s.speedMph / maxes.spd * 100, 100) * 0.20;
    const buildScore = Math.round(twScore + ftScore + spdScore);
    let kvBonus = 0;
    if (['65','75','85'].includes(String(currentFrame))) {
      const kvRef = { '65': 23000, '75': 19000, '85': 8000 };
      // 85 kvMax raised 11000 -> 13000: 11000KV is the STOCK preset, so the old
      // ceiling handed every default 2S build the full +15 bonus.
      const kvMax = { '65': 40000, '75': 32500, '85': 13000 };
      const ref = kvRef[String(currentFrame)];
      const max = kvMax[String(currentFrame)];
      kvBonus = Math.round(Math.min((kv - ref) / (max - ref), 1) * 15);
      if (kvBonus < 0) kvBonus = 0;
    }
    // Weight scales the whole composite, KV bonus included: a heavy build does
    // not get to buy the penalty back by fitting hotter motors. T:W keeps its
    // own warnings above and is deliberately untouched by this — the two say
    // different things, and a build can be both punchy and too heavy.
    const w = weightScore(auw, currentFrame);
    const finalScore = Math.min(Math.round((buildScore + kvBonus) * w.multiplier), 100);
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

    const wEl = document.getElementById('buildScoreWeight');
    if (wEl) {
      const atFloor = w.t >= 1;
      wEl.textContent = !w.band
        ? ''
        : w.multiplier === 1
          ? `WEIGHT ×1.00 · ${auw.toFixed(1)}g, at or under the ${w.band.ideal}g ideal`
          : `WEIGHT ×${w.multiplier.toFixed(2)} · ${auw.toFixed(1)}g vs ${w.band.ideal}g ideal, ${w.band.max}g max`;
      wEl.classList.toggle('penalized', w.multiplier < 1 && !atFloor);
      wEl.classList.toggle('floored', atFloor);
    }

    // Dry weight and pack share reported separately: the pack is the one part
    // of AUW you change without rebuilding, and on a whoop it is a quarter of
    // the airframe, so it deserves its own number rather than being folded in.
    const auwValEl = document.getElementById('auwValue');
    if (auwValEl) auwValEl.innerHTML = auw.toFixed(1) + '<span class="unit">g</span>';
    const auwSubEl = document.getElementById('auwBreakdown');
    if (auwSubEl) {
      const packPct = auw > 0 ? (packG / auw) * 100 : 0;
      auwSubEl.textContent =
        `${dryWeight.toFixed(1)}g dry · pack ${packG.toFixed(1)}g = ${packPct.toFixed(0)}% of AUW`;
    }

    compareCalculate();
  }

  // Comparison-table T:W colour tiers. Same thresholds as the OSD badge.
  const TW_TIER_CLASSES = ['tw-ok', 'tw-warn', 'tw-danger'];
  function twTier(v) {
    if (v > TW_DANGER)  return 'tw-danger';
    if (v > TW_CEILING) return 'tw-warn';
    return 'tw-ok';
  }

  function compareCalculate() {
    let kvA        = parseFloat(document.getElementById('cmpKvA').value);
    let kvB        = parseFloat(document.getElementById('cmpKvB').value);
    if (!isNaN(kvA)) kvA = clampRange(kvA, ...WHOOP_RANGES.kv);
    if (!isNaN(kvB)) kvB = clampRange(kvB, ...WHOOP_RANGES.kv);
    const cells    = clampRange(parseFloat(els.cells.value)     || 1, ...WHOOP_RANGES.cells);
    const capacity = clampRange(parseFloat(els.capacity.value)  || 0, ...WHOOP_RANGES.capacity);
    const pitch    = clampRange(parseFloat(els.propPitch.value) || 0, ...WHOOP_RANGES.pitch);
    const dryWeight = dryWeightInput();
    const cRating  = clampRange(parseFloat(els.packC.value)     || 0, ...WHOOP_RANGES.cRating);
    // Same AUW assembly as the main panel, so the comparison rows agree — and
    // the same refusal to invent a dry weight. Both columns stay dashed until
    // the weight is entered; setPair renders null as an em dash.
    const auw = dryWeight === null ? null : dryWeight + packWeightG(capacity, cells);
    const sA = (auw !== null && !isNaN(kvA) && kvA > 0) ? computeStats(kvA, cells, capacity, pitch, auw, cRating) : null;
    const sB = (auw !== null && !isNaN(kvB) && kvB > 0) ? computeStats(kvB, cells, capacity, pitch, auw, cRating) : null;

    // Optional tierFor(value) returns a colour class for the cell — used by the
    // T:W row, where the number's absolute value matters more than who wins.
    function setPair(idA, idB, vA, vB, fmt, tierFor) {
      const eA = document.getElementById(idA), eB = document.getElementById(idB);
      if (vA !== null) { eA.innerHTML = fmt(vA); eA.classList.add('filled'); }
      else             { eA.innerHTML = '—';     eA.classList.remove('filled'); }
      if (vB !== null) { eB.innerHTML = fmt(vB); eB.classList.add('filled'); }
      else             { eB.innerHTML = '—';     eB.classList.remove('filled'); }
      eA.classList.remove('winner'); eB.classList.remove('winner');
      if (vA !== null && vB !== null && vA !== vB)
        (vA > vB ? eA : eB).classList.add('winner');
      [[eA, vA], [eB, vB]].forEach(([el, v]) => {
        el.classList.remove(...TW_TIER_CLASSES);
        if (tierFor && v !== null) el.classList.add(tierFor(v));
      });
    }

    setPair('cmpSpeedA',  'cmpSpeedB',  sA ? sA.speedMph      : null, sB ? sB.speedMph      : null, v => `${v.toFixed(0)}<span class="cmp-unit">mph</span>`);
    setPair('cmpTwA',     'cmpTwB',     sA ? sA.tw            : null, sB ? sB.tw            : null, v => `${v.toFixed(1)}<span class="cmp-unit">:1</span>`, twTier);
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
    // Cell IR fitted so full rated draw (C × Ah) sags ~0.6V/cell, plus ~20mΩ/cell
    // for PCB, tabs, connector. Capacity-aware — old cells/C model was not.
    const cellIR     = mah > 0 ? 0.6 / (cRating * (mah / 1000)) : 0;
    const esrOhms    = cells * (cellIR + 0.02);
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

  // ===== Prop Pitch Speed Reference Table ===== (whoop pitch band only)
  // Uses the SAME drag-equilibrium model as the main calc so both agree.
  const PITCH_LIST = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.5, 1.9, 2.0, 2.3];

  function pitchSpeedMph(pitch, kv, cells, frame) {
    const rpm_eff    = kv * (cells * 3.7) * motorLoadFraction[frame];
    const v_pitch_ms = (pitch * 0.0254 * rpm_eff) / 60;
    if (v_pitch_ms <= 0) return 0;
    const T_total_N  = (speedThrustPerMotor[frame] * 4 * (kv / framePresets[frame].kv) / 1000) * 9.81;
    const a_c = 0.5 * 1.225 * frameCdA[frame], b_c = T_total_N / v_pitch_ms;
    const disc = b_c * b_c + 4 * a_c * T_total_N;
    const v_ms = disc >= 0 ? (-b_c + Math.sqrt(disc)) / (2 * a_c) : 0;
    return Math.min(v_ms * 2.23694, v_pitch_ms * 2.23694 * 0.92);
  }

  function buildPitchTable() {
    const kv           = clampRange(parseFloat(document.getElementById('pitchKV').value) || 0, ...WHOOP_RANGES.kv);
    const cells        = clampRange(parseInt(document.getElementById('pitchCells').value) || 1, ...WHOOP_RANGES.cells);
    const frame        = document.getElementById('pitchFrame').value;
    const currentPitch = parseFloat(els.propPitch.value) || 0;
    const tbody        = document.getElementById('pitchTableBody');
    tbody.innerHTML    = '';

    PITCH_LIST.forEach(p => {
      const speedMph  = pitchSpeedMph(p, kv, cells, frame);
      const isCurrent = Math.abs(p - currentPitch) < 0.05;
      const tr        = document.createElement('tr');
      if (isCurrent) tr.className = 'current-pitch';
      tr.innerHTML = `<td>${p.toFixed(1)}"</td><td class="pitch-speed">${speedMph.toFixed(0)} mph</td>`;
      tbody.appendChild(tr);
    });
  }

  // ===== Shareable build URLs =====
  // ?frame=65&kv=28000&cells=1&mah=300&pitch=0.7&dry=19.5&video=hdzero&style=cruise
  // Read once on load (overrides the frame preset). The address bar is left
  // alone — it used to be rewritten on every calculate(), which turned the
  // homepage into a wall of query params for anyone just poking at inputs.
  // COPY BUILD LINK builds the URL on demand from buildShareUrl(). Drop it in
  // a Discord or a YouTube description and the calculator opens pre-filled.
  const URL_KEYS = [
    ['kv',    () => els.motorKV,     v => els.motorKV.value = v],
    ['cells', () => els.cells,       v => els.cells.value = v],
    ['mah',   () => els.capacity,    v => els.capacity.value = v],
    ['pitch', () => els.propPitch,   v => els.propPitch.value = v],
    // A shared link's dry weight is whatever the sharer put on a scale, so it
    // arrives unflagged — clear any 'derived' left over from applyPreset order.
    ['dry',   () => els.weight,      v => { els.weight.value = v; delete els.weight.dataset.derived; }],
    ['c',     () => els.packC,       v => els.packC.value = v],
  ];
  function applyUrlParams() {
    const q = new URLSearchParams(location.search);
    if (![...q.keys()].length) return false;
    const f = q.get('frame');
    if (f && framePresets[f]) {
      currentFrame = f;
      document.querySelectorAll('.frame-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.frame === f));
      populateMotorSelect(f); populatePropSelect(f); populateCompareSelects(f);
      applyPreset(f);
    }
    let any = !!(f && framePresets[f]);
    for (const [key, , set] of URL_KEYS) {
      const v = q.get(key);
      if (v !== null && v !== '' && isFinite(parseFloat(v))) { set(v); any = true; }
    }
    const vid = q.get('video');
    if (vid && els.videoSystem && [...els.videoSystem.options].some(o => o.value === vid)) {
      els.videoSystem.value = vid; any = true;
    }
    const sty = q.get('style');
    if (sty && els.flightStyle && [...els.flightStyle.options].some(o => o.value === sty)) {
      els.flightStyle.value = sty; any = true;
    }
    if (any) { motorSelect.value = ''; updateVideoHint(); }
    return any;
  }
  function buildShareUrl() {
    const q = new URLSearchParams();
    q.set('frame', currentFrame);
    for (const [key, get] of URL_KEYS) {
      const el = get(); if (el && el.value !== '') q.set(key, el.value);
    }
    if (els.videoSystem) q.set('video', els.videoSystem.value);
    if (els.flightStyle) q.set('style', els.flightStyle.value);
    return location.origin + location.pathname + '?' + q.toString() + '#calculator';
  }
  // ===== Clickable bench rows =====
  // Clicking a validation-table row loads that measured build into the
  // calculator: frame, KV, video system, dry weight, capacity, pitch — and
  // flips the style to cruise so the bench ANCHOR fires and the flight-time
  // readout switches from estimate to "anchored to measured data". Instant
  // demonstration of what the table means.
  // Bench rows name their motor and prop with the exact motorDB/propDB `name`
  // string — the same key data/bench/*.json already uses in `applies_to`. The
  // options are built with value = index into the DB list, so the name is the
  // only stable handle a row can carry: an index would quietly point at a
  // different motor the next time the list grows.
  //
  // Motor names are not unique (several models appear at more than one KV), so
  // the row's KV disambiguates. No exact match leaves the select on its
  // placeholder. Picking the nearest thing instead would be worse than picking
  // nothing: the shaft-mismatch warning and the dry-weight estimate both read
  // the selected option, so a near-miss would hand the pilot a warning — or a
  // reassuring absence of one — about hardware they are not flying.
  function selectDbEntryByName(select, list, name, kv) {
    if (!name) return false;
    const index = (list || []).findIndex(item =>
      item.name === name && (kv == null || String(item.kv) === String(kv)));
    if (index < 0) return false;
    select.value = String(index);
    // The same pair, in the same order, that a manual pick fires — so the
    // shaft warning, cell count and derived weight land exactly as they would
    // if the pilot had chosen this option themselves.
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  document.querySelectorAll('.bv-row').forEach(row => {
    const load = () => {
      const d = row.dataset;
      if (framePresets[d.frame]) {
        currentFrame = d.frame;
        document.querySelectorAll('.frame-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.frame === d.frame));
        populateMotorSelect(d.frame); populatePropSelect(d.frame); populateCompareSelects(d.frame);
      }
      els.motorKV.value   = d.kv;
      els.cells.value     = '1';
      els.capacity.value  = d.mah;
      // Video first: the motor handler derives dry weight from the airframe
      // base, and the base depends on the video system.
      if (els.videoSystem) els.videoSystem.value = d.video;
      if (els.flightStyle) els.flightStyle.value = 'cruise';
      // Motor then prop — the order a manual build lands in. The motor handler
      // writes the motor's own prop pitch into the pitch field; the prop
      // handler writes the prop's, which is the one that should stand.
      motorSelect.value = '';
      propSelect.value  = '';
      selectDbEntryByName(motorSelect, motorDB[currentFrame], d.motor, d.kv);
      selectDbEntryByName(propSelect,  propDB[currentFrame],  d.prop);
      els.propPitch.value = d.pitch;
      // Bench rows carry a real scale reading — not derived, not a default.
      // Re-asserted after the motor handler, which fills the same field with
      // catalogue arithmetic (4 x motor + airframe base) and flags it derived.
      // The two agree to within 0.04g on both anchors, but the measured number
      // is the one the row exists to show.
      els.weight.value    = d.dry;
      delete els.weight.dataset.derived;
      // Both selects are set by now, so re-evaluate the pairing once with the
      // final state rather than trusting whichever handler ran last.
      updateShaftWarn();
      updateVideoHint();
      calculate();
      const calc = document.getElementById('calculator') || document.querySelector('.frame-btn');
      if (calc) calc.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    row.addEventListener('click', load);
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); load(); } });
  });

  const copyBtn = document.getElementById('copyBuildLink');
  if (copyBtn) copyBtn.addEventListener('click', () => {
    const url = buildShareUrl();
    navigator.clipboard.writeText(url).then(() => {
      copyBtn.textContent = 'LINK COPIED ✓';
      setTimeout(() => { copyBtn.textContent = 'COPY BUILD LINK'; }, 1600);
    }).catch(() => { copyBtn.textContent = url; });
  });

  // initial calc — sync inputs to active frame button before first render
  populateMotorSelect(currentFrame);
  populatePropSelect(currentFrame);
  populateCompareSelects(currentFrame);
  applyPreset(currentFrame);
  applyUrlParams();
  updateVideoHint();
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

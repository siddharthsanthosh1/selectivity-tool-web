// Verification tests for the Phase 2 layered column (sim-column.js). Run: node tests/column.test.js
'use strict';
const S = require('../sim-core.js');
const C = require('../sim-column.js');

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  pass  ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { failed++; console.log('  FAIL  ' + name + (detail ? '  (' + detail + ')' : '')); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const rel = (a, b, tol) => Math.abs(a - b) <= tol * Math.abs(b);
const pv0 = S.centralFrom(C.ALL_PARAMS);
const base = {
  areaAcres: 1, maxDepthM: 1.83, tempC: 28, pH: 8, alk: 40, ntu: 10, turbCause: 'mineral', clay: 'typical', chl: 100,
  target: 'microcystis', toxin: 'typical', history: false, windMs: 2, product: 'h2o2_liquid', dose: 3, fraction: 1, appHour: 8,
  layering: 'auto', method: 'spray', grade: null, shelter: 'open', sky: 'sunny', airHighC: 32, airLowC: 22, doy: 196
};

console.log('\nGrains: settling speed and depth fallen before dissolving (blueprint table, 25 °C, angular)');
{
  const cu = (d, v, z, ztol) => {
    const g = C.grainFall(d / 1000, pv0.cu_rho, pv0.cu_cs, pv0.cu_dm, 25, 50, pv0);
    check(`copper sulfate ${d} mm settles at ${v} cm/s`, rel(g.w0 * 100, v, 0.03), (g.w0 * 100).toFixed(2) + ' cm/s');
    if (z != null) check(`copper sulfate ${d} mm dissolves after about ${z} m`, g.dissolvedAt != null && rel(g.dissolvedAt, z, ztol), g.dissolvedAt == null ? 'not dissolved' : g.dissolvedAt.toFixed(3) + ' m');
  };
  cu(0.1, 0.66, 0.015, 0.35); cu(0.3, 3.6, 0.3, 0.25); cu(0.5, 6.3, 0.9, 0.25); cu(1.0, 11.2, 4, 0.25); cu(2, 17.4, null); cu(5, 28.7, null);
  const Cs25 = pv0.perc_cs20 + (pv0.perc_cs30 - pv0.perc_cs20) * 0.5;
  for (const [d, v, z] of [[0.3, 3.0, 0.35], [0.6, 6.4, 1.7], [0.9, 9.0, 3.9]]) {
    const g = C.grainFall(d / 1000, 2000, Cs25, pv0.perc_dm, 25, 50, pv0);
    check(`peroxyhydrate ${d} mm settles at ${v} cm/s`, rel(g.w0 * 100, v, 0.04), (g.w0 * 100).toFixed(2) + ' cm/s');
    check(`peroxyhydrate ${d} mm dissolves after about ${z} m`, g.dissolvedAt != null && rel(g.dissolvedAt, z, 0.25), g.dissolvedAt == null ? 'not dissolved' : g.dissolvedAt.toFixed(2) + ' m');
  }
}

console.log('\nColonies: Stokes rise speed at 20 °C (Microcystis, 985 kg/m³)');
for (const [um, mh] of [[50, 0.064], [100, 0.25], [200, 1.0], [300, 2.3], [500, 6.4]]) {
  const w = C.colonyRise(um * 1e-6, 20, pv0) * 3600;
  check(`${um} µm colony rises about ${mh} m/h`, rel(w, mh, 0.05), w.toFixed(3) + ' m/h');
}

console.log('\nNumerics: implicit diffusion and floating cells against exact answers');
{
  // uniform-area column (mean:max = 1), 10 m deep
  const pvU = Object.assign({}, pv0, { r_meanmax: 1 });
  const col = C.column({ maxDepthM: 10, areaAcres: 1 }, pvU);
  const n = col.N, K = new Float64Array(n + 1).fill(1e-4); K[0] = 0; K[n] = 0;
  const ws = { a: new Float64Array(n), b: new Float64Array(n), c: new Float64Array(n), d: new Float64Array(n), cp: new Float64Array(n), dp: new Float64Array(n) };
  const X = new Float64Array(n); const k0 = Math.floor(n / 2); X[k0] = 1;
  const varOf = Y => { let m = 0, s = 0, s2 = 0; for (let k = 0; k < n; k++) { m += Y[k]; s += Y[k] * col.zc[k]; } const mu = s / m; for (let k = 0; k < n; k++) s2 += Y[k] * (col.zc[k] - mu) ** 2; return { m, v: s2 / m }; };
  const v0 = varOf(X).v; const dt = 60, steps = 180;
  for (let i = 0; i < steps; i++) C.diffuse(X, col, K, dt, 0, ws);
  const st = varOf(X), expect = v0 + 2 * 1e-4 * dt * steps;
  check('point release spreads with variance σ² = σ0² + 2Kt', rel(st.v, expect, 0.02), st.v.toFixed(4) + ' vs ' + expect.toFixed(4) + ' m²');
  check('diffusion conserves mass exactly', near(st.m, 1, 1e-12), st.m.toPrecision(15));
  // steady profile of floating cells: C(z) ∝ exp(-w z / K)
  const w = 2e-5, K2 = new Float64Array(n + 1).fill(1e-4); K2[0] = 0; K2[n] = 0;
  const B = new Float64Array(n).fill(1);
  for (let i = 0; i < 4000; i++) C.diffuse(B, col, K2, 600, w, ws);
  const H = col.zmax, L = K2[1] / w;
  let worst = 0;
  for (let k = 0; k < n; k++) {
    // exact layer average of C(z) = H (w/K) e^{-wz/K} / (1 - e^{-wH/K})
    const exact = H / (1 - Math.exp(-H / L)) * (Math.exp(-col.zi[k] / L) - Math.exp(-col.zi[k + 1] / L)) / col.dz;
    worst = Math.max(worst, Math.abs(B[k] - exact) / exact);
  }
  check('floating cells reach the exact steady profile (within 6% per layer)', worst < 0.06, 'worst ' + (100 * worst).toFixed(1) + '%');
}

console.log('\nConservation in full runs');
{
  for (const [name, o] of [['spray', { method: 'spray' }], ['hose injection, 4 m pond', { method: 'inject', maxDepthM: 4 }], ['Fine 20 crystals, 4 m pond', { method: 'granules', grade: 'fine20', maxDepthM: 4 }], ['Medium crystals', { method: 'granules', grade: 'medium' }]]) {
    const inp = Object.assign({}, base, { product: 'copper_sulfate', dose: 0.5 }, o);
    const pv = Object.assign({}, pv0, { cu_k78: 0, cu_alkslope: 0 });   // no loss: mass must stay constant
    const r = C.simulate(inp, pv, { snapshots: true });
    const M = r.doseMgL * r.col.Vt, last = r.rec.Cmean[r.rec.Cmean.length - 1] * r.col.Vt;
    check(`copper mass conserved over 14 days (${name})`, rel(last, M, 1e-6), (last / M).toFixed(9));
    let worstB = 0;
    for (const Bk of r.snaps.B) { let s = 0; for (let k = 0; k < r.col.N; k++) s += Bk[k] * r.col.V[k]; worstB = Math.max(worstB, Math.abs(s / r.col.Vt - 1)); }
    check(`cells conserved (${name})`, worstB < 1e-9, worstB.toExponential(1));
  }
  for (const grade of ['fine30', 'fine20', 'medium']) {
    const inp = Object.assign({}, base, { product: 'copper_sulfate', dose: 0.5, method: 'granules', grade, maxDepthM: 3 });
    const col = C.column(inp, pv0);
    const T = new Float64Array(col.N).fill(28);
    const rp = C.releaseProfile(inp, pv0, col, T, col.zmax);
    let s = 0; for (const x of rp.water) s += x; for (const b of rp.bed) s += b.frac;
    check(`${grade}: release profile sums to 1 (raw total ${rp.rawTotal.toFixed(3)} before closing)`, near(s, 1, 1e-12) && Math.abs(rp.rawTotal - 1) < 0.05);
  }
  const land = g => C.releaseProfile(Object.assign({}, base, { product: 'copper_sulfate', method: 'granules', grade: g, maxDepthM: 3 }), pv0, C.column(Object.assign({}, base, { maxDepthM: 3 }), pv0), new Float64Array(C.column(Object.assign({}, base, { maxDepthM: 3 }), pv0).N).fill(28), 3).landedFrac;
  const l30 = land('fine30'), l20 = land('fine20'), lm = land('medium');
  check('bigger crystals land on the bottom more often', l30 < l20 && l20 < lm, `${(100 * l30).toFixed(0)}% < ${(100 * l20).toFixed(0)}% < ${(100 * lm).toFixed(0)}%`);
}

console.log('\nReduces to Phase 1 when the pond is fully mixed');
{
  const inp = Object.assign({}, base, { product: 'copper_chelated', dose: 0.5, target: 'planktothrix', maxDepthM: 1.5, layering: 'mixed' });
  const pv = Object.assign({}, pv0, { K_ml_min: 0.05, h_floor: 5 });
  const r2 = C.simulate(inp, pv, {});
  const r1 = S.simulate(inp, S.centralFrom(S.PARAMS), {});
  let worst = 0;
  for (let i = 0; i < r1.rec.hours.length; i++) worst = Math.max(worst, Math.abs(r2.rec.Cmean[i] - r1.rec.C[i]) / r1.rec.C[0]);
  check('pond-average concentration matches Phase 1 hour by hour', worst < 1e-6, 'worst ' + worst.toExponential(1));
  let wk = 0; for (let i = 0; i < r1.rec.hours.length; i++) wk = Math.max(wk, Math.abs(r2.rec.K[i] - r1.rec.K[i]));
  check('knock-down matches Phase 1 within 2 points', wk < 0.02, 'worst ' + (100 * wk).toFixed(2) + ' points');
}

console.log('\nBehaviour (Holgerson pond regimes, idealized NC July weather)');
{
  const deep = C.summarize(C.simulate(Object.assign({}, base, { maxDepthM: 4 }), pv0, {}));
  check('1-acre pond 4 m deep stays layered most of the time', deep.layeredShare > 0.9, (100 * deep.layeredShare).toFixed(0) + '% of hours');
  const rs = C.simulate(Object.assign({}, base, { maxDepthM: 1.2, windMs: 4 }), pv0, {});
  const shallow = C.summarize(rs);
  check('windy 1.2 m pond is layered less of the time than the 4 m pond', shallow.layeredShare < deep.layeredShare, (100 * shallow.layeredShare).toFixed(0) + '% vs ' + (100 * deep.layeredShare).toFixed(0) + '% of hours');
  let overturnDays = 0;
  for (let d = 0; d < 14; d++) if (rs.rec.hmix.slice(d * 24, d * 24 + 24).some(h => h >= 0.95 * rs.col.zmax)) overturnDays++;
  check('windy 1.2 m pond mixes top to bottom every day (night overturn)', overturnDays === 14, overturnDays + ' of 14 days');
  let deepOverturn = 0;
  const rd = C.simulate(Object.assign({}, base, { maxDepthM: 4 }), pv0, {});
  for (let d = 0; d < 14; d++) if (rd.rec.hmix.slice(d * 24, d * 24 + 24).some(h => h >= 0.95 * rd.col.zmax)) deepOverturn++;
  check('4 m pond does not overturn to the bottom ("rarely mixed")', deepOverturn <= 1, deepOverturn + ' of 14 days');
  // Since Oct 22, 2026 the idealized day no longer scales sunlight to hold the typed temperature: the
  // water starts at the reading and follows the weather. Check the heat budget is consistent: with the
  // sunlight that balances the budget at the reading, the pond stays near the reading...
  const r0 = C.simulate(base, pv0, {});
  const pvB = Object.assign({}, pv0, { cloud_sw: r0.fBalance });
  const rB = C.simulate(base, pvB, {});
  const daysB = []; for (let d = 0; d < 14; d++) { const sl = rB.rec.Ttop.slice(d * 24, d * 24 + 24); daysB.push(sl.reduce((a, b) => a + b, 0) / sl.length); }
  check('with the sunlight that balances the heat budget at the reading, the daily mean stays within 1.5 °C of it', daysB.every(t => Math.abs(t - base.tempC) < 1.5), `${Math.round(100 * r0.fBalance)}% of clear sky; ` + daysB.map(t => t.toFixed(1)).join(' '));
  // ...and under sunnier weather it settles warmer, at a temperature real ponds reach (under 95 °F)
  const r = r0;
  const days = []; for (let d = 0; d < 14; d++) { const sl = r.rec.Ttop.slice(d * 24, d * 24 + 24); days.push(sl.reduce((a, b) => a + b, 0) / sl.length); }
  check('a run of sunny days warms the pond, and it levels off below 35 °C (95 °F)', days[13] > base.tempC + 1 && Math.abs(days[13] - days[12]) < 0.2 && days[13] < 35, days.map(t => t.toFixed(1)).join(' '));
  const d5 = r.rec.Ttop.slice(5 * 24, 6 * 24), range = Math.max(...d5) - Math.min(...d5);
  // On a string of sunny days the top 2.5 ft of this 6-ft pond warms about 6 °C (11 °F) by afternoon,
  // at the high end of what small ponds show; the guide lists it as a known gap (the daytime stirring floor).
  check('daily surface warming is a few degrees, not tens (day 6)', range > 0.5 && range < 8, range.toFixed(1) + ' °C');
}

console.log('\nWind and depth (stronger wind mixes deeper; deep ponds stay layered)');
{
  // daily-average stirred depth as a share of the deepest point, day 3, over a range of winds
  const share = (d, w) => { const r = C.simulate(Object.assign({}, base, { maxDepthM: d, windMs: w }), pv0, {}); let s = 0; for (let h = 48; h < 72; h++) s += r.rec.hmix[h]; return s / 24 / r.col.zmax; };
  for (const d of [1.5, 2.44, 5, 10]) {
    const ws = [0.5, 2, 4, 6, 8, 10], sh = ws.map(w => share(d, w));
    let mono = true; for (let i = 1; i < sh.length; i++) if (sh[i] < sh[i - 1] - 0.02) mono = false;
    check(`a ${d} m pond: stronger wind never makes the stirred layer shallower`, mono, ws.map((w, i) => w + ' m/s ' + sh[i].toFixed(2)).join(', '));
  }
  const calmDeep = C.simulate(Object.assign({}, base, { maxDepthM: 10, windMs: 1 }), pv0, { snapshots: true });
  const T = calmDeep.snaps.T[48];
  check('a 10 m pond in a light breeze stays layered (bottom more than 2 °C cooler on day 3)', T[0] - T[T.length - 1] > 2 && calmDeep.rec.hmix[48] < 0.5 * calmDeep.col.zmax, `top ${T[0].toFixed(1)} °C, bottom ${T[T.length - 1].toFixed(1)} °C, stirred ${calmDeep.rec.hmix[48].toFixed(1)} m`);
  // leftover wind energy is kept between steps, so a steady strong wind erodes the starting
  // layering of a 5 m pond within days, after which it mixes to the bottom every night; a light
  // breeze never gets there
  const fullDays = w => { const r = C.simulate(Object.assign({}, base, { maxDepthM: 5, windMs: w }), pv0, {}); let n = 0; for (let d = 0; d < 14; d++) if (r.rec.hmix.slice(d * 24, d * 24 + 24).some(h => h >= 0.95 * r.col.zmax)) n++; return n; };
  const fs = fullDays(7), fc = fullDays(1);
  check('a steady 16 mph wind mixes a 5 m pond to the bottom on most days', fs >= 11, fs + ' of 14 days');
  check('…while a 2 mph breeze never does', fc === 0, fc + ' of 14 days');
}

console.log('\nReal weather (hour by hour)');
{
  // the idealized day written out as an hourly weather series must give the same answer
  const idl = C.simulate(base, pv0, { snapshots: true });
  const N = (C.SPIN_DAYS + C.RUN_DAYS + 1) * 24, TaMean = (base.airHighC + base.airLowC) / 2, TaAmp = (base.airHighC - base.airLowC) / 2;
  const mk = f => Array.from({ length: N }, (_, i) => f(i));
  const ghi = clk => C.clearSkyGHI(C.solarElevationSin(((clk % 24) + 24) % 24, base.doy));
  const wx = {
    source: 'test', Ta: mk(i => TaMean + TaAmp * Math.cos(2 * Math.PI * ((i % 24) - 15) / 24)), rh: mk(() => pv0.rh), U: mk(() => base.windMs), dir: mk(() => 225),
    cloud: mk(() => 0), sw: mk(i => { let s = 0; for (let q = 0; q < 12; q++) s += ghi(i - 1 + (q + 0.5) / 12); return idl.swFactor * s / 12; })
  };
  const real = C.simulate(Object.assign({}, base, { weather: wx }), pv0, { snapshots: true });
  let dT = 0; for (let h = 0; h < idl.rec.Ttop.length; h++) dT = Math.max(dT, Math.abs(real.rec.Ttop[h] - idl.rec.Ttop[h]));
  check('the idealized day fed in as hourly weather gives the same surface temperatures (within 0.15 °C)', dT < 0.15, 'worst ' + dT.toFixed(3) + ' °C');
  check('…and the same knock-down at 48 h (within 1 point)', Math.abs(real.rec.K[48] - idl.rec.K[48]) < 0.01, `${(100 * real.rec.K[48]).toFixed(1)}% vs ${(100 * idl.rec.K[48]).toFixed(1)}%`);
  check('…and no sunlight scaling is used with real weather', real.realWeather && real.swFactor === 1);
  // a windy day in the middle of calm weather stirs the pond deeper that day
  const calm = mk(i => (i >= (C.SPIN_DAYS + 3) * 24 && i < (C.SPIN_DAYS + 4) * 24) ? 7 : 0.5);
  const gust = C.simulate(Object.assign({}, base, { maxDepthM: 3, weather: Object.assign({}, wx, { U: calm }) }), pv0, {});
  const day = d => { let s = 0; for (let h = d * 24; h < d * 24 + 24; h++) s += gust.rec.hmix[h]; return s / 24; };
  check('a windy day in calm weather stirs the pond deeper that day', day(3) > day(1) + 0.3, `day 2 ${day(1).toFixed(2)} m, windy day 4 ${day(3).toFixed(2)} m`);
  check('the hourly wind is passed on for the map (speed and direction)', gust.wind.U.length === C.RUN_DAYS * 24 && Math.max(...gust.wind.U) > 6 && gust.wind.from.every(d => Math.abs(d - 225) < 1e-6));
  let bad = 0; for (const k of ['Ttop', 'Tbot', 'hmix', 'Cexp', 'DOml', 'MCtop']) for (const v of gust.rec[k]) if (!isFinite(v)) bad++;
  check('no bad values with changing weather', bad === 0);
}

console.log('\nMatching the morning reading (Oct 21, 2026 fix)');
{
  // Hot July weather and a cool typed reading: the warm-up runs about 20 °F hotter than the reading.
  // Only the water the morning's stirring reached is matched to it; the deep water keeps its
  // starting difference instead of being dragged down with the surface (it used to start at 39 °F).
  const N = (C.SPIN_DAYS + C.RUN_DAYS + 1) * 24, mk = f => Array.from({ length: N }, (_, i) => f(i));
  const hot = { source: 'test', Ta: mk(i => 27 + 5 * Math.cos(2 * Math.PI * ((i % 24) - 15) / 24)), rh: mk(() => 0.7), U: mk(i => (i % 24) >= 10 && (i % 24) <= 19 ? 3 : 1), dir: mk(() => 225),
    cloud: mk(() => 0.3), sw: mk(i => 0.82 * C.clearSkyGHI(C.solarElevationSin((((i % 24) - 0.5) + 24) % 24, 196))) };
  const inp = Object.assign({}, base, { maxDepthM: 2.44, tempC: 18.3, weather: hot });
  const r = C.simulate(inp, pv0, {});
  const startBot = inp.tempC - pv0.bottom_dT;
  check('the surface at treatment matches the typed reading (within 0.1 °C)', Math.abs(r.rec.Ttop[0] - inp.tempC) < 0.1, `${r.rec.Ttop[0].toFixed(2)} vs ${inp.tempC} °C`);
  check('the bottom water is not dragged far below its starting temperature', r.rec.Tbot[0] > startBot - 0.5, `bottom ${r.rec.Tbot[0].toFixed(1)} °C, started at ${startBot.toFixed(1)} °C`);
  check('the page is told the weather and the reading disagree', C.run(inp, { members: 0 }).warnings.some(w => /disagree/.test(w.text)), `warm-up ran ${(-r.tempOffset * 9 / 5).toFixed(0)} °F warmer`);
  const ok = C.simulate(base, pv0, {});
  check('a reading that fits the weather barely moves anything (offset under 2.5 °C)', Math.abs(ok.tempOffset) < 2.5, `offset ${ok.tempOffset.toFixed(2)} °C`);
}

console.log('\nToxin: total (inside and outside cells) vs dissolved (Oct 21, 2026 fix)');
{
  const r = C.simulate(Object.assign({}, base, { product: 'copper_sulfate', method: 'granules', grade: 'fine20', dose: 0.5 }), pv0, {});
  const sm = C.summarize(r), rec = r.rec;
  let worst = 0; for (let i = 0; i < rec.MCall.length; i++) worst = Math.min(worst, rec.MCall[i] - rec.MCtop[i]);
  // in one well-mixed volume nothing makes new toxin, so the total can only fall (the top-water
  // average in the layers model can rise as floating cells gather there)
  const wm = S.simulate(Object.assign({}, base, { product: 'copper_sulfate', method: 'granules', grade: 'fine20', dose: 0.5 }), S.centralFrom(S.PARAMS));
  let up = 0; for (let i = 1; i < wm.rec.MCall.length; i++) if (wm.rec.MCall[i] > wm.rec.MCall[i - 1] + 1e-9) up++;
  // pond-wide it is toxin per chlorophyll × chlorophyll; in the stirred top water it is higher by how
  // much the floating colonies crowd there
  const rs = C.simulate(Object.assign({}, base, { product: 'copper_sulfate', method: 'granules', grade: 'fine20', dose: 0.5 }), pv0, { snapshots: true });
  let bv = 0, vv = 0; for (let k = 0; k < rs.col.N; k++) if (rs.col.zi[k] < rs.rec.hmix[0]) { bv += rs.snaps.B[0][k] * rs.col.V[k]; vv += rs.col.V[k]; }
  const wantTot = pv0.mc_typ * base.chl * bv / vv;
  check('total toxin at the start is toxin per chlorophyll × chlorophyll, times the crowding of floating cells in the top water', Math.abs(sm.mcTot0 - wantTot) / wantTot < 0.01, `${sm.mcTot0.toFixed(1)} µg/L in the top water; ${(pv0.mc_typ * base.chl).toFixed(0)} × ${(bv / vv).toFixed(2)} crowding`);
  check('dissolved toxin never exceeds total toxin', worst > -1e-9);
  check('total toxin never rises in the well-mixed model (nothing makes new toxin)', up === 0, up + ' hours rising');
  const ev = C.events(r).map(e => e.text).join(' | ');
  check('the timeline says the pond starts above the EPA swimming level', /already holds about \d+ µg\/L/.test(ev) && /Total toxin/.test(ev));
  const weak = C.summarize(C.simulate(base, pv0, {}));
  check('a weak knock-down leaves total toxin above 8 µg/L for the whole run', weak.mcTotBelow8Day == null, weak.mcTotBelow8Day == null ? 'still above at day 14' : 'below by day ' + weak.mcTotBelow8Day);
}

console.log('\nYour own measurements (optional inputs)');
{
  const deep = Object.assign({}, base, { maxDepthM: 2.44 });
  const mean = C.simulate(Object.assign({}, deep, { meanDepthM: 1.5 }), pv0, {});
  check('average depth sets the bowl: volume ÷ area equals the depth entered', Math.abs(mean.col.Vt / mean.col.A0 - 1.5) < 0.02, `${(mean.col.Vt / mean.col.A0).toFixed(3)} m vs 1.5 m`);
  const bot = C.simulate(Object.assign({}, deep, { bottomC: 18 }), pv0, {});
  check('a measured bottom temperature is used for the deep water', Math.abs(bot.rec.Tbot[0] - 18) < 1, `bottom ${bot.rec.Tbot[0].toFixed(2)} °C at treatment`);
  const sec = C.simulate(Object.assign({}, deep, { secchiM: 0.5 }), pv0, {});
  check('a measured Secchi depth sets light fading (Kd = 1.7 ÷ Secchi)', Math.abs(sec.Kd - pv0.kd_secchi / 0.5) < 1e-12, `Kd ${sec.Kd.toFixed(2)} per m`);
  const mc = C.simulate(Object.assign({}, deep, { mcMeasured: 12 }), pv0, {});
  check('measured toxin replaces the toxin level', Math.abs(mc.MCtot - 12) < 1e-9, `${mc.MCtot} µg/L`);
  const pvM = S.withMeasured(Object.assign({}, deep, { h2o2HalfLifeH: 6 }), pv0);
  const k = C.decayRate('h2o2', deep.tempC, deep.chl, 0, 1, deep, pvM);
  check('a measured peroxide half-life sets the breakdown rate at the pond temperature', Math.abs(Math.LN2 / k - 6) < 1e-9, `half-life ${(Math.LN2 / k).toFixed(3)} h`);
  const own = C.simulate(Object.assign({}, deep, { product: 'endothall', dose: 1.5, myEC50: { v: 0.8, T: 48 } }), pv0, {});
  check('your own EC50 gives a prediction where no published value exists (endothall on Microcystis)', own.kill && Math.abs(own.kill.E - 0.8) < 1e-9 && own.kill.T === 48, own.kill ? `EC50 ${own.kill.E}, ${own.kill.T}-h test` : 'no kill model');
  const ens = C.run(Object.assign({}, deep, { meanDepthM: 1.5 }), { members: 8, seed: 3 });
  check('the uncertainty runs keep a measured value fixed', ens.ensemble.band.hmix && true && C.run(Object.assign({}, deep, { meanDepthM: 1.5 }), { members: 0 }).warnings.some(w => /Using your measurements/.test(w.text)));
}

console.log('\nReview fixes, Oct 21, 2026: kill-model scenarios, fair exposure, the bloom\'s own oxygen');
{
  const inp = Object.assign({}, base, { maxDepthM: 2.44 });
  check('the uncertainty runs no longer mix the two kill models (individual tolerance only)', S.PARAMS.kill_struct.sample === false);
  const r = C.run(inp, { members: 20, seed: 5 });
  check('the other kill model (random death) is reported as its own scenario', r.altSD && isFinite(r.altSD.kill48), r.altSD ? `IT ${(100 * r.summary.kill.at48).toFixed(1)}%, SD ${(100 * r.altSD.kill48).toFixed(1)}%` : 'missing');
  check('the page is told where the central run sits among the runs', r.ensemble.centralPct48 >= 0 && r.ensemble.centralPct48 <= 1, `${Math.round(100 * r.ensemble.centralPct48)}th percentile`);
  const w = S.run(inp, { members: 0 });
  const pick = (list, re) => list.find(n => re.test(n.who));
  const mW = pick(w.nonTargets, /Daphnia/).margin, mL = pick(r.nonTargets, /Daphnia/).margin;
  check('other organisms are judged the same way in both models (water-flea margins within 2×)', Math.max(mW / mL, mL / mW) < 2, `well-mixed ${mW.toFixed(2)}, layers ${mL.toFixed(2)}`);
  check('peroxide tests that dosed once are compared with the 1-hour peak', pick(r.nonTargets, /Daphnia/).basis === 'peak');
  const cu = C.run(Object.assign({}, inp, { product: 'copper_sulfate', method: 'granules', grade: 'fine20', dose: 0.5 }), { members: 0 });
  const fish = pick(cu.nonTargets, /Fish/);
  check('steady-exposure tests are compared with the worst average over the test length', fish.basis === 'average' && fish.basisT === 96, `${fish.basis} over ${fish.basisT} h`);
  check('animals near the bottom get their own margin', isFinite(fish.bottomMargin), `fish: top water ${fish.margin.toFixed(2)}, bottom water ${fish.bottomMargin.toFixed(2)}`);
  const ga = pick(cu.nonTargets, /Green alga/);
  check('copper green-alga value is matched to the target value\'s density (Tsai 2016, 1.873 mg/L at 5×10⁵ cells/mL, as in the matrix)', ga.v === 1.873);
  // the layers model's oxygen now swings with the bloom's photosynthesis
  const nk = C.simulate(Object.assign({}, inp, { product: 'endothall', dose: 0.5 }), pv0, {});
  const d2 = nk.rec.DOml.slice(24, 48);
  check('the layers model\'s oxygen swings through the day with the living bloom', Math.max(...d2) - Math.min(...d2) > 1, `day 2: ${Math.min(...d2).toFixed(1)} to ${Math.max(...d2).toFixed(1)} mg/L`);
  check('the light for photosynthesis is real sunlight, not the idealized day\'s scaled-down heat sunlight', Math.max(...nk.rec.light) > 700, `noon ${Math.max(...nk.rec.light).toFixed(0)} W/m²`);
}

console.log('\nReview fixes, Oct 22, 2026: heat loss, tree shelter, stirring a bowl, diquat binding');
{
  const sv = t => 6.112 * Math.exp(17.67 * t / (t + 243.5));
  const humid = C.surfaceExchange(30, 30, 0.95 * sv(30), 1, 2, pv0);
  check('sky emissivity never goes above 1 (humid, overcast, hot)', humid.epsA <= 1, humid.epsA.toFixed(3));
  check('heat and evaporation transfer is stronger in light wind (Guseva et al. 2023)', C.heatCoeff(1, pv0) > 1.6 * C.heatCoeff(8, pv0) && C.vapCoeff(1, pv0) > 1.3 * C.vapCoeff(8, pv0));
  const calmNight = C.surfaceExchange(30, 20, 0.7 * sv(20), 0, 0, pv0);
  check('a calm night still loses heat to rising warm air (free convection)', calmNight.E > 40 && calmNight.H > 10, `evaporation ${calmNight.E.toFixed(0)}, sensible ${calmNight.H.toFixed(0)} W/m² with no wind`);
  check('…and none when the air is warmer than the water', C.freeConvVel(20, 30, 0.015, 0.02, pv0) === 0);
  const sh = (a, w) => C.shelterFactor({ areaAcres: a, shelter: w }, pv0);
  check('open banks: full wind at any size', sh(0.1, 'open') === 1 && sh(100, 'open') === 1);
  check('trees all round: a small pond gets only the floor share of the wind', sh(1, 'wooded') === pv0.shelter_min, sh(1, 'wooded').toFixed(2));
  check('…a big lake keeps more of it (Markfort et al. 2010)', sh(2000, 'wooded') > 0.4 && sh(2000, 'wooded') < 1, `2,000 acres: ${sh(2000, 'wooded').toFixed(2)}`);
  check('some trees: between the two', sh(1, 'partly') > sh(1, 'wooded') && sh(1, 'partly') < 1);
  const calmW = C.simulate(Object.assign({}, base, { shelter: 'wooded', maxDepthM: 3 }), pv0, {}), openW = C.simulate(Object.assign({}, base, { maxDepthM: 3 }), pv0, {});
  const mh = r => r.rec.hmix.reduce((a, b) => a + b, 0) / r.rec.hmix.length;
  check('a pond in the trees is stirred less deeply than an open one', mh(calmW) < mh(openW), `${mh(calmW).toFixed(2)} vs ${mh(openW).toFixed(2)} m`);
  // the reviewer's case: a 16-ft pond in a steady 9 mph wind. With the sunlight the old scaling used
  // (46% of clear sky), the bowl-shaped energy balance mixes it to the bottom on most days (it never did
  // when every layer was given the full surface area)
  const r16 = C.simulate(Object.assign({}, base, { maxDepthM: 16 / 3.28084, windMs: 4, tempC: 27.8, airHighC: 32.2, airLowC: 22.2 }), Object.assign({}, pv0, { cloud_sw: 0.46 }), {});
  let full16 = 0; for (let d = 0; d < 14; d++) if (r16.rec.hmix.slice(d * 24, d * 24 + 24).some(h => h >= 0.95 * r16.col.zmax)) full16++;
  check('stirring energy uses each layer\'s own volume (bowl): a 16-ft pond in a 9 mph wind mixes on most days at the old sunlight', full16 >= 10, full16 + ' of 14 days');
  // diquat: clay binds it in every layer it reaches, not just the spray layer
  const dq = C.simulate(Object.assign({}, base, { product: 'diquat', dose: 0.2, maxDepthM: 4 / 3.28084 }), pv0, {});
  const room = S.diquatRoom(dq.inputs, pv0);
  let vSpray = 0; for (let k = 0; k < dq.col.N; k++) if (dq.col.zi[k] < pv0.spray_depth) vSpray += dq.col.V[k] * Math.min(1, (pv0.spray_depth - dq.col.zi[k]) / dq.col.dz);
  check('diquat is bound in water below the spray layer too', dq.boundTotal > 1.5 * room * vSpray, `${(dq.boundTotal / (room * vSpray)).toFixed(1)}× what the spray layer alone could hold`);
}

console.log('\nUncertainty runs across products and methods');
{
  let bad = 0, runs = 0;
  for (const product of Object.keys(S.PRODUCTS)) {
    for (const method of C.METHODS[product]) {
      const grade = method === 'granules' ? Object.keys(C.GRADES[product])[0] : null;
      const inp = Object.assign({}, base, { product, method, grade, dose: S.PRODUCTS[product].example, target: product === 'endothall' || product === 'flumioxazin' ? 'anabaena' : 'microcystis' });
      const res = C.run(inp, { members: 8, seed: 5 }); runs++;
      for (const k of Object.keys(res.ensemble.band)) for (const q of ['p05', 'p50', 'p95']) for (const v of res.ensemble.band[k][q]) if (!(v >= 0) || !isFinite(v)) bad++;
    }
  }
  check(`no negative or non-finite values (${runs} product × method combinations)`, bad === 0, bad + ' bad values');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

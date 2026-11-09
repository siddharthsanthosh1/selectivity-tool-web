// Tests for the 2-D views (sim-2d.js): geometry, flow, conservation, particles, kill, robustness.
// Run: node tests/map.test.js
'use strict';
const S = require('../sim-core.js');
const CC = require('../sim-column.js');
const M = require('../sim-2d.js');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  pass  ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  (' + detail + ')' : '')); }
}
const base = {
  areaAcres: 1, maxDepthM: 8 / 3.28084, tempC: 27.8, pH: 8, alk: 40, ntu: 10, turbCause: 'mineral', clay: 'typical',
  windMs: 2, shelter: 'open', sky: 'sunny', airHighC: 32.2, airLowC: 22.2, doy: 196, chl: 100, target: 'microcystis',
  toxin: 'typical', history: false, product: 'h2o2_liquid', method: 'spray', grade: null, dose: 3, fraction: 1,
  appHour: 8, layering: 'auto', shape: 'round', windFrom: 270, where: 'whole'
};
const I = o => Object.assign({}, base, o || {});
function setup(inp) {
  const pv = M.centralParams(inp);
  const c1 = CC.simulate(inp, pv, { snapshots: true });
  const g = M.buildGrid(inp, pv);
  return { pv, c1, g };
}
const closure = B => (B.inWater + B.decayed + B.boundTotal + B.demandTotal + B.bedLeft + B.dropped) / B.released;

console.log('Geometry');
{
  const inp = I(), { pv, c1, g } = setup(inp);
  let worst = 0;
  for (const z of [0.25, 0.5, 1, 1.5, 2]) {
    let a = 0; for (let k = 0; k < g.nw; k++) if (g.h[k] > z) a++;
    const want = Math.pow(1 - z / g.zmax, g.p);
    worst = Math.max(worst, Math.abs(a / g.nw - want));
  }
  check('area-depth curve matches the column bowl', worst < 0.02, 'worst share gap ' + worst.toFixed(4));
  const relV = g.V / (c1.col.Vt * g.area / c1.col.A0);
  check('map volume matches the column volume', Math.abs(relV - 1) < 0.03, 'ratio ' + relV.toFixed(4));
  check('map area within 3% of the pond area', Math.abs(g.area / c1.col.A0 - 1) < 0.03, (g.area / c1.col.A0).toFixed(4));
  for (const sh of ['oval', 'long', 'cove']) {
    const gg = M.buildGrid(I({ shape: sh }), pv);
    check('shape ' + sh + ' builds a usable grid', gg.nw > 300 && gg.nw < 600, gg.nw + ' wet cells');
  }
  const gc = M.buildGrid(I({ shape: 'custom', outline: [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]] }), pv);
  check('a drawn L-shaped outline builds a grid', gc.nw > 300 && gc.shape === 'custom', gc.nw + ' cells');
  const gbad = M.buildGrid(I({ shape: 'custom', outline: [[0, 0], [1, 0], [0.5, 0]] }), pv);
  check('a degenerate drawn outline falls back to round', gbad.shape === 'round' && gbad.nw > 300);
  const mw = M.treatMask(g, 'upwind_half', 270), ms = M.treatMask(g, 'middle', 270);
  let nh = 0, nm = 0, xs = 0; for (let k = 0; k < g.nw; k++) { nh += mw[k]; nm += ms[k]; if (mw[k]) xs += M.cellCenter(g, k)[0] - g.cx; }
  check('upwind half covers half the pond, on the upwind (west) side', Math.abs(nh / g.nw - 0.5) < 0.01 && xs < 0, (nh / g.nw).toFixed(3));
  check('middle spot covers a tenth', Math.abs(nm / g.nw - 0.1) < 0.01, (nm / g.nw).toFixed(3));
}

console.log('Flow');
{
  const S2 = M.sublayerShares();
  const sg = Array.from(S2.gf).reduce((a, b) => a + b, 0), ss = Array.from(S2.sf).reduce((a, b) => a + b, 0);
  check('swirl shares add to 1, counterflow shares add to 0', Math.abs(sg - 1) < 1e-12 && Math.abs(ss) < 1e-12);
  const prof = z => 3 * z * z - 2 * z;
  check('counterflow is zero two-thirds of the way up and equals the surface speed at the top', Math.abs(prof(2 / 3)) < 1e-12 && Math.abs(prof(1) - 1) < 1e-12);

  const inp = I({ windFrom: 270 }), { pv, c1, g } = setup(inp);   // wind from the west, blowing east
  const wv = M.windVec(270);
  check('wind from the west blows toward +x', Math.abs(wv[0] - 1) < 1e-12 && Math.abs(wv[1]) < 1e-12);
  const us = pv.us_coef * c1.ustar, Kh = pv.kh_scale * Math.sqrt(g.A0);
  for (const hm of [g.zmax, 1.2]) {
    const cfg = M.flowConfig(g, hm, c1.ustar * c1.ustar, wv, us, Kh, pv.gyre_r);
    // total divergence of the summed sublayer fluxes per cell
    const div = new Float64Array(g.nw); let scale = 0;
    for (let m = 0; m < M.NA; m++) for (let f = 0; f < cfg.nf; f++) { const q = cfg.F[m * cfg.nf + f]; div[cfg.fc1[f]] += q; div[cfg.fc2[f]] -= q; scale = Math.max(scale, Math.abs(q)); }
    let worst = 0; for (let k = 0; k < g.nw; k++) worst = Math.max(worst, Math.abs(div[k]));
    check(`flow is divergence-free (stirred depth ${hm.toFixed(2)} m)`, worst < 1e-10 * scale, 'worst/scale ' + (worst / scale).toExponential(1));
    // swirl direction: shallow north/south edges downwind (+x), deep middle upwind (-x)
    let edge = 0, ne = 0, mid = 0, nm = 0;
    const R = Math.sqrt(g.A0 / Math.PI);
    for (let k = 0; k < g.nw; k++) {
      const c = M.cellCenter(g, k), dx = c[0] - g.cx, dy = c[1] - g.cy;
      if (Math.abs(dy) > 0.6 * R && Math.abs(dx) < 0.3 * R) { edge += cfg.UgX[k]; ne++; }
      if (Math.hypot(dx, dy) < 0.3 * R) { mid += cfg.UgX[k]; nm++; }
    }
    check(`swirl runs downwind along the shallow edges and back upwind over the deep middle (stirred ${hm.toFixed(2)} m)`, edge / ne > 0 && mid / nm < 0, `edges ${(100 * edge / ne).toFixed(2)} cm/s, middle ${(100 * mid / nm).toFixed(2)} cm/s`);
    let sp = 0; for (let k = 0; k < g.nw; k++) sp = Math.max(sp, Math.hypot(cfg.UgX[k], cfg.UgY[k]));
    check('swirl speeds are a few cm/s at most (4.5 mph wind)', sp < 0.04 && sp > 0.001, 'max ' + (100 * sp).toFixed(2) + ' cm/s');
    let surfUp = 0; for (let k = 0; k < g.nw; k++) if (cfg.vtx[k] < 0) surfUp++;
    // With the swirl's full push (1.5x the wind stress, corrected Oct 21, 2026), the top layer over the
    // deepest middle can creep upwind; most of the pond's top water still moves downwind.
    check('the top layer moves downwind over at least 90% of the pond (surface drift mostly beats the swirl)', surfUp <= 0.1 * g.nw, `${surfUp} of ${g.nw} squares flowing upwind`);
  }
  const calm = M.flowConfig(g, g.zmax, 0, wv, 0, Kh, pv.gyre_r);
  let any = 0; for (let i = 0; i < calm.F.length; i++) any = Math.max(any, Math.abs(calm.F[i]));
  check('no wind, no current', any === 0);

  // slice: divergence-free and upwelling at the upwind end
  const sl = M.buildSlice(g, wv), N = c1.col.N, dz = c1.col.dz;
  sl.nlev = new Int32Array(sl.nxs); for (let i = 0; i < sl.nxs; i++) sl.nlev[i] = Math.max(1, Math.min(N, Math.round(sl.hcol[i] / dz)));
  const sc = M.sliceConfig(sl, g.zmax, us, dz, N, Kh), NC = N + 1;
  let worst = 0, scale = 0;
  for (let i = 0; i < sl.nxs; i++) for (let k = 0; k < sl.nlev[i]; k++) {
    const fw = sc.Fx[i * N + k], fe = sc.Fx[(i + 1) * N + k], wt = k > 0 ? sc.Wt[i * NC + k] : 0, wb = k + 1 < sl.nlev[i] ? sc.Wt[i * NC + k + 1] : 0;
    worst = Math.max(worst, Math.abs(fe - fw + wt - wb)); scale = Math.max(scale, Math.abs(fw), Math.abs(wt));
  }
  check('slice flow is divergence-free', worst < 1e-12 * Math.max(scale, 1e-12) + 1e-18, 'worst ' + worst.toExponential(1));
  let wUp = 0, wDn = 0;
  for (let i = 0; i < sl.nxs; i++) if (sl.nlev[i] > 1) { if (i < sl.nxs / 2) wUp += sc.Wt[i * NC + 1]; else wDn += sc.Wt[i * NC + 1]; }
  check('water rises on the upwind side and sinks on the downwind side', wUp > 0 && wDn < 0, `upwind half ${wUp.toExponential(1)}, downwind half ${wDn.toExponential(1)} m²/s`);
  check('surface water in the slice moves downwind, deeper water returns', sc.uc[Math.floor(sl.nxs / 2) * N] > 0 && sc.uc[Math.floor(sl.nxs / 2) * N + Math.floor(sl.nlev[Math.floor(sl.nxs / 2)] * 0.5)] < 0);
}

console.log('Conservation and transport');
{
  const cases = [
    ['h2o2_liquid', 'spray', 3, 'whole'], ['h2o2_granular', 'granules', 3, 'upwind_strip'], ['copper_sulfate', 'granules', 1, 'middle'],
    ['diquat', 'inject', 0.37, 'downwind_half'], ['copper_chelated', 'spray', 1, 'upwind_half']
  ];
  for (const [product, method, dose, where] of cases) {
    const r = M.run2d(I({ product, method, dose, where, grade: method === 'granules' ? Object.keys(CC.GRADES[product])[0] : null }), { hours: 48 });
    check(`mass balance closes: ${product}, ${method}, ${where} (map)`, Math.abs(closure(r.map.budget) - 1) < 1e-9, closure(r.map.budget).toFixed(12));
    check(`mass balance closes: ${product}, ${method}, ${where} (slice)`, Math.abs(closure(r.slice.budget) - 1) < 1e-9, closure(r.slice.budget).toFixed(12));
  }
  // no decay, fully mixed windy shallow pond: product spreads evenly and the mass stays put
  const inp = I({ product: 'copper_chelated', dose: 1, maxDepthM: 1.2, windMs: 6, where: 'upwind_strip' });
  const r = M.run2d(inp, { hours: 72, only: 'map', pv: { cuchel_k: 0 } });
  const m = r.map;
  check('no decay: total mass constant to rounding', Math.abs(m.massW[72] / m.massW[0] - 1) < 1e-9, (m.massW[72] / m.massW[0]).toFixed(12));
  // top layer evenness at 72 h (quantized, so compare in log steps: 1 step = 0.016 decades)
  let qmin = 255, qmax = 0; for (let k = 0; k < r.grid.nw; k++) { const q = m.topQ[72 * r.grid.nw + k]; qmin = Math.min(qmin, q); qmax = Math.max(qmax, q); }
  check('a strip treatment spreads across the whole pond within 3 days (no decay)', qmin > 0 && (qmax - qmin) <= 12, `top-layer spread ${(qmax - qmin) * 4 / 254} decades`);
  // a spot spreads out, and a strip along the upwind shore reaches the downwind half
  const r2 = M.run2d(I({ product: 'copper_chelated', dose: 1, where: 'middle', windFrom: 270 }), { hours: 12, only: 'map', pv: { cuchel_k: 0 } });
  const lit = (r, h) => { let n = 0; for (let k = 0; k < r.grid.nw; k++) if (r.map.topQ[h * r.grid.nw + k] > 64) n++; return n; };
  check('a middle spot spreads out sideways', lit(r2, 12) > 2 * lit(r2, 0), `${lit(r2, 0)} cells above 0.03× the effect level at the start, ${lit(r2, 12)} after 12 h`);
  const r3 = M.run2d(I({ product: 'copper_chelated', dose: 1, where: 'upwind_strip', windFrom: 270 }), { hours: 24, only: 'map', pv: { cuchel_k: 0 } });
  const downHalf = (r, h) => { let n = 0, t = 0; for (let k = 0; k < r.grid.nw; k++) { if (M.cellCenter(r.grid, k)[0] > r.grid.cx) { t++; if (r.map.topQ[h * r.grid.nw + k] > 0) n++; } } return n / t; };
  check('product from an upwind strip reaches the downwind half within a day', downHalf(r3, 0) === 0 && downHalf(r3, 24) > 0.9, `${(100 * downHalf(r3, 24)).toFixed(0)}% of downwind cells`);
}

console.log('Deepest water toward a dam');
{
  for (const [side, v] of [['N', [0, 1]], ['E', [1, 0]]]) {
    const inp = I({ deepSpot: side, shape: 'oval' }), g = M.buildGrid(inp, M.centralParams(inp));
    const c = [g.x0 + (g.ci[g.deepest] + 0.5) * g.dx - g.cx, g.y0 + (g.cj[g.deepest] + 0.5) * g.dx - g.cy];
    let rmax = 0; for (let k = 0; k < g.nw; k++) rmax = Math.max(rmax, (g.x0 + (g.ci[k] + 0.5) * g.dx - g.cx) * v[0] + (g.y0 + (g.cj[k] + 0.5) * g.dx - g.cy) * v[1]);
    const along = (c[0] * v[0] + c[1] * v[1]) / rmax;
    let vol = 0; for (let k = 0; k < g.nw; k++) vol += g.h[k] * g.dx * g.dx;
    const plain = M.buildGrid(I({ shape: 'oval' }), M.centralParams(I({ shape: 'oval' })));
    check(`dam to the ${side}: the deepest square sits well toward that shore, with the same water volume`, along > 0.4 && along < 0.95 && Math.abs(vol / plain.V - 1) < 0.01, `${Math.round(100 * along)}% of the way from the middle to the shore; volume ${(vol / plain.V).toFixed(3)}× the middle-deep pond`);
  }
}

console.log('Particles and kill');
{
  // well-mixed condition: neutral colonies stay evenly spread with depth (Visser 1997 random walk)
  const inp = I({ target: 'planktothrix', product: 'endothall', dose: 0.5, windMs: 3, maxDepthM: 2 });
  const r = M.run2d(inp, { hours: 24, only: 'slice' });
  const s = r.slice, n = s.show, h = 24;
  const bins = new Float64Array(4), vol = new Float64Array(4);
  for (let i = 0; i < s.nxs; i++) { const hh = s.nlev[i] * s.dz; for (let b = 0; b < 4; b++) { const za = b * hh / 4, zb = (b + 1) * hh / 4; vol[b] += (zb - za); } }
  for (let p = 0; p < n; p++) {
    const x = s.qx[h * n + p], z = s.qz[h * n + p];
    const i = Math.min(s.nxs - 1, Math.floor(x / s.dxs)), hh = s.nlev[i] * s.dz;
    bins[Math.min(3, Math.floor(4 * z / hh))]++;
  }
  let worst = 0; for (let b = 0; b < 4; b++) worst = Math.max(worst, Math.abs(bins[b] / n - 0.25));
  check('neutral colonies stay evenly spread top to bottom after a day', worst < 0.06, 'worst quarter off by ' + (100 * worst).toFixed(1) + ' points');
  // ... and on the map they spread by water, not by area: the shallow third of the squares holds
  // about 10% of the water, so it should hold about 10% of the colonies, not a third of them.
  // (Until Oct 21, 2026 a step over shallower water lifted the colony onto the bed instead of
  // being refused, and the shallow third ended up with about 33%.)
  const shares = (wind) => {
    const rr = M.run2d(I({ target: 'planktothrix', dose: 0, windMs: wind }), { hours: 48, only: 'map' }), g = rr.grid, m = rr.map, nn = m.show;
    const order = Array.from(g.h.keys()).sort((a, b) => g.h[a] - g.h[b]), third = new Int8Array(g.nw);
    order.forEach((k, i) => { third[k] = Math.min(2, Math.floor(3 * i / g.nw)); });
    const lut = new Int32Array(g.nx * g.ny).fill(-1); for (let k = 0; k < g.nw; k++) lut[g.cj[k] * g.nx + g.ci[k]] = k;
    const vol = [0, 0, 0], cnt = [0, 0, 0]; let V = 0, N = 0;
    for (let k = 0; k < g.nw; k++) { vol[third[k]] += g.h[k]; V += g.h[k]; }
    for (let hr = 6; hr <= 48; hr += 6) for (let p = 0; p < nn; p++) {
      const i = Math.floor((m.sx[hr * nn + p] - g.x0) / g.dx), j = Math.floor((m.sy[hr * nn + p] - g.y0) / g.dx);
      const k = i >= 0 && j >= 0 && i < g.nx && j < g.ny ? lut[j * g.nx + i] : -1; if (k >= 0) { cnt[third[k]]++; N++; }
    }
    return { col: cnt.map(c => c / N), vol: vol.map(v => v / V) };
  };
  const still = shares(0), windy = shares(1);
  check('map: neutral colonies spread by water, not by area (no wind)', still.col.every((c, i) => Math.abs(c - still.vol[i]) < 0.04),
    `shallow/middle/deep thirds hold ${still.col.map(c => (100 * c).toFixed(1)).join('/')}% of colonies vs ${still.vol.map(v => (100 * v).toFixed(1)).join('/')}% of the water`);
  check('map: colonies don\'t pile into shallow water in a breeze', windy.col[0] < 1.3 * windy.vol[0],
    `shallow third holds ${(100 * windy.col[0]).toFixed(1)}% of colonies vs ${(100 * windy.vol[0]).toFixed(1)}% of the water (deep third ${(100 * windy.col[2]).toFixed(1)}% vs ${(100 * windy.vol[2]).toFixed(1)}%)`);

  // kill thresholds reproduce the population curve
  const kill = { structure: 'IT', mw: 2, beta: 3, kD: 0.5, E: 2, z: 0, bw: 0 };
  const rng = M.rngPair(12345), st = M.makeKillState(20000, kill, rng);
  let worstK = 0;
  for (const D of [0.5, 1, 2, 4]) {
    let d = 0; for (let p = 0; p < 20000; p++) if (st.thr[p] <= D) d++;
    worstK = Math.max(worstK, Math.abs(d / 20000 - S.itFraction(D, 2, 3)));
  }
  check('each colony\'s own threshold reproduces the tolerance curve', worstK < 0.012, 'worst gap ' + worstK.toFixed(4));
  const ksd = { structure: 'SD', kD: 1, bw: 0.1, z: 1, E: 2 }, stS = M.makeKillState(20000, ksd, M.rngPair(7));
  for (let p = 0; p < 20000; p++) for (let t = 0; t < 240; t++) M.killStep(stS, p, 3, 0.1, ksd, t * 0.1);
  let dS = 0; for (let p = 0; p < 20000; p++) dS += stS.dead[p];
  // exact: D(t) = 3(1 - e^{-t}); hazard = 0.1 ∫ max(0, D - 1) dt over 24 h
  let H = 0; for (let t = 0; t < 24; t += 0.001) H += 0.1 * Math.max(0, 3 * (1 - Math.exp(-t)) - 1) * 0.001;
  check('sudden-death colonies die at the exact hazard rate', Math.abs(dS / 20000 - (1 - Math.exp(-H))) < 0.015, `${(dS / 20000).toFixed(3)} vs ${(1 - Math.exp(-H)).toFixed(3)}`);

  // the per-colony kill agrees with the column model for a whole-pond treatment
  const rr = M.run2d(I(), { hours: 48 });
  check('whole-pond peroxide: map and column knock-down agree within 5 points at 48 h', Math.abs(rr.map.K[48] - rr.column.K[48]) < 0.05, `map ${(100 * rr.map.K[48]).toFixed(1)}%, column ${(100 * rr.column.K[48]).toFixed(1)}%`);
  // the slice is a channel of even width through the deepest point, so it weights deep water more
  // than the bowl does; it is a sanity check, not a match
  check('whole-pond peroxide: slice and column agree within 10 points at 48 h', Math.abs(rr.slice.K[48] - rr.column.K[48]) < 0.10, `slice ${(100 * rr.slice.K[48]).toFixed(1)}%, column ${(100 * rr.column.K[48]).toFixed(1)}%`);
  const rs = M.run2d(I({ where: 'upwind_strip' }), { hours: 48, only: 'map' });
  check('treating a third of the pond knocks down less than treating it all', rs.map.K[48] < rr.map.K[48], `${(100 * rs.map.K[48]).toFixed(1)}% vs ${(100 * rr.map.K[48]).toFixed(1)}%`);

  // buoyant colonies drift downwind with the wind, not without it
  const along = (r, h) => { const m = r.map, n = m.show; let s = 0, c = 0; for (let p = 0; p < n; p++) if (m.sz[h * n + p] < 0.3) { s += m.sx[h * n + p] - r.grid.cx; c++; } return c ? s / c : 0; };
  const rw = M.run2d(I({ product: 'endothall', dose: 0.5, windMs: 4 }), { hours: 24, only: 'map' });
  const rc = M.run2d(I({ product: 'endothall', dose: 0.5, windMs: 0 }), { hours: 24, only: 'map' });
  // Share of the colonies in the top 15 cm that sit on the downwind (east) half after a day, averaged over
  // three seeds, with and without wind. (Until Nov 8, 2026 this was one seed's mean drift > 1 m; with the
  // corrected up-and-down step fewer colonies sit in the fast top centimetre, and one seed's drift ranges
  // from -0.9 to +5 m, with -0.8 to +2 m in calm water, so the old check was mostly noise.)
  const eastShare = U => { let s = 0; for (const seed of [1, 2, 3]) { const r = M.run2d(I({ product: 'endothall', dose: 0.5, windMs: U }), { hours: 24, only: 'map', seed }), m = r.map, n = m.show; let d = 0, c = 0; for (let p = 0; p < n; p++) if (m.sz[24 * n + p] < 0.15) { c++; if (m.sx[24 * n + p] > r.grid.cx) d++; } s += (c ? d / c : 0.5) / 3; } return s; };
  const eW = eastShare(4), eC = eastShare(0);
  check('floating colonies near the surface drift downwind (east) in wind', eW > eC + 0.03, `downwind half holds ${(100 * eW).toFixed(1)}% of them in a 9 mph wind, ${(100 * eC).toFixed(1)}% in calm water`);
  check('and stay put without wind', Math.abs(along(rc, 24) - along(rc, 0)) < 3, `${(along(rc, 24) - along(rc, 0)).toFixed(1)} m`);
}

console.log('Robustness');
{
  const r1 = M.run2d(I({ where: 'middle' }), { hours: 12 }), r2 = M.run2d(I({ where: 'middle' }), { hours: 12 });
  let same = true; for (let h = 0; h <= 12; h++) if (r1.map.K[h] !== r2.map.K[h] || r1.slice.Cexp[h] !== r2.slice.Cexp[h]) same = false;
  check('same inputs, same answer (fixed seed)', same);
  let bad = 0, combos = 0;
  for (const [product, methods] of Object.entries(CC.METHODS)) for (const method of methods) {
    combos++;
    const grade = method === 'granules' ? Object.keys(CC.GRADES[product])[0] : null;
    const r = M.run2d(I({ product, method, grade, dose: S.PRODUCTS[product].example, where: 'downwind_strip', shape: 'cove' }), { hours: 24 });
    for (const arr of [r.map.K, r.map.Cexp, r.map.Cmax, r.slice.K, r.slice.Cexp]) for (let h = 0; h <= 24; h++) if (!isFinite(arr[h]) || arr[h] < 0) bad++;
    for (const arr of [r.map.sx, r.map.sy, r.map.sz, r.slice.qx, r.slice.qz]) for (let i = 0; i < 25 * 10; i++) if (!isFinite(arr[i])) bad++;
  }
  check(`no negative or non-finite values (${combos} product × method combinations)`, bad === 0, bad + ' bad values');
  const big = M.run2d(I({ areaAcres: 50, maxDepthM: 5, windMs: 6, shape: 'long', windFrom: 0 }), { hours: 6 });
  check('a 50-acre long pond in a 13 mph wind runs cleanly', Math.abs(closure(big.map.budget) - 1) < 1e-9 && big.grid.nw > 300);
  const tiny = M.run2d(I({ areaAcres: 0.1, maxDepthM: 1, windMs: 0 }), { hours: 6 });
  check('a 0.1-acre calm pond runs cleanly', Math.abs(closure(tiny.map.budget) - 1) < 1e-9);
}

console.log('Toxin and oxygen on the map');
{
  const tox = T => (T.start + T.released - T.degraded) / T.inWater;
  const rr = M.run2d(I(), { hours: 72 });
  check('toxin balance closes: start + leaked − broken down = in the water (map)', Math.abs(tox(rr.map.toxin) - 1) < 1e-9, tox(rr.map.toxin).toFixed(12));
  check('toxin balance closes (slice)', Math.abs(tox(rr.slice.toxin) - 1) < 1e-9, tox(rr.slice.toxin).toFixed(12));
  // every knocked-down colony hands over exactly its own toxin: leaked + still inside = share killed × toxin in cells
  let Vg = 0; for (let k = 0; k < rr.grid.nw; k++) Vg += rr.grid.h[k] * rr.grid.dx * rr.grid.dx;
  const pv0 = M.centralParams(I()), inCells = (1 - pv0.mc_fext) * pv0.mc_typ * base.chl * Vg;
  const handed = (rr.map.toxin.released + rr.map.toxin.stillInside) / (rr.map.K[72] * inCells);
  check('knocked-down colonies release exactly their own toxin (map)', Math.abs(handed - 1) < 1e-9, handed.toFixed(12));
  check('map toxin in the stirred layer tracks the layers model within 25% at 48 h', Math.abs(rr.map.MCml[48] / rr.column.MCtop[48] - 1) < 0.25, `map ${rr.map.MCml[48].toFixed(2)}, layers ${rr.column.MCtop[48].toFixed(2)} µg/L`);
  const nb = M.run2d(I(), { hours: 48, pv: { mc_kbio: 0, mc_lag: 0, mc_photo: Infinity } });   // bacteria and sunlight both off
  check('no breakdown: nothing is counted as broken down', nb.map.toxin.degraded === 0 && nb.slice.toxin.degraded === 0);
  check('peroxide breaking down adds oxygen in the first hour', rr.map.DOml[1] > rr.map.DOml[0] && rr.slice.DOml[1] > rr.slice.DOml[0], `map ${rr.map.DOml[0].toFixed(2)} → ${rr.map.DOml[1].toFixed(2)} mg/L`);

  // no kill, no peroxide, fully mixed shallow pond: oxygen is the bed-vs-reaeration balance, as in the layers model
  const nk = M.run2d(I({ product: 'endothall', dose: 0.5, maxDepthM: 1, windMs: 4 }), { hours: 48 });
  check('no knock-down: no toxin leaks', nk.map.toxin.released === 0 && nk.map.K[48] === 0);
  check('no knock-down, fully mixed: map oxygen starts at the layers model\'s balance', Math.abs(nk.map.DOml[0] - nk.column.DOml[0]) < 0.02, `map ${nk.map.DOml[0].toFixed(3)}, layers ${nk.column.DOml[0].toFixed(3)} mg/L`);
  // the layers model uses the instant bed-vs-reaeration balance; the map carries the deficit, so it lags
  // a few tenths of a mg/L behind as the water warms and cools (this 3-ft pond swings about 8 °C a day)
  check('…and stays within 0.25 mg/L of it as the water warms and cools (the map lags by hours)', Math.abs(nk.map.DOml[48] - nk.column.DOml[48]) < 0.25, `map ${nk.map.DOml[48].toFixed(3)}, layers ${nk.column.DOml[48].toFixed(3)} mg/L at 48 h`);
  let lo = Infinity, hi = 0; for (let k = 0; k < nk.grid.nw; k++) { const d = nk.map.doQ[48 * nk.grid.nw + k] / 20; lo = Math.min(lo, d); hi = Math.max(hi, d); }
  // since the living bloom makes oxygen (Oct 21, 2026), shallow squares, whose water is all in bright light,
  // make a little more per litre than deep ones
  check('…and oxygen is within 1 mg/L across the map at dawn', hi - lo <= 1.0 + 1e-9, `${lo.toFixed(2)}-${hi.toFixed(2)} mg/L`);
  // a big knock-down: the dead bloom uses oxygen
  const kd = M.run2d(I({ product: 'copper_chelated', dose: 1, maxDepthM: 1.5, windMs: 1 }), { hours: 96, only: 'map' });
  const kn = M.run2d(I({ product: 'copper_chelated', dose: 0.001, maxDepthM: 1.5, windMs: 1 }), { hours: 96, only: 'map' });
  const dMap = kn.map.DOml[72] - kd.map.DOml[72], dCol = kn.column.DOml[72] - kd.column.DOml[72];
  check('a big copper knock-down lowers oxygen (dead bloom decaying)', dMap > 0.5, `${dMap.toFixed(2)} mg/L lower at 72 h; K ${(100 * kd.map.K[72]).toFixed(0)}%`);
  // within 0.5 mg/L: the map spreads the bloom's own oxygen over its 4 sublayers and shallow squares, the layers
  // model over 6-inch layers of one bowl
  check('…by about the same amount as in the layers model (within 0.5 mg/L)', Math.abs(dMap - dCol) < 0.5, `map ${dMap.toFixed(2)}, layers ${dCol.toFixed(2)} mg/L`);
  let bad = 0; for (const a of [kd.map.MCml, kd.map.MCtopMax, kd.map.DOml, kd.map.DOmin]) for (let h = 0; h <= 96; h++) if (!isFinite(a[h]) || a[h] < 0) bad++;
  check('toxin and oxygen records are finite and not negative', bad === 0);
}

console.log('Thermocline tilt');
{
  const inp = I({ areaAcres: 20, maxDepthM: 3, windMs: 3, shape: 'long', windFrom: 270, product: 'endothall', dose: 0.5 }), { pv, c1, g } = setup(inp);
  let h = 0; while (h < 24 && !(M.layering(c1, h, 1).slope > 0)) h++;
  const L = M.layering(c1, h, 1);
  check('a 20-acre, 3 m pond in a 7 mph wind is layered and tilts', L.slope > 0, `hour ${h}: Δρ ${L.drho.toFixed(3)} kg/m³, slope ${(1000 * L.slope).toFixed(2)} mm per m`);
  const exp = c1.ustar * c1.ustar / (9.81 * L.drho / 1000 * L.hm);
  check('tilt equals u*²/(g′h)', Math.abs(L.slope / exp - 1) < 1e-12);
  const wv = M.windVec(270), s = new Float64Array(g.nw);
  for (let k = 0; k < g.nw; k++) { const c = M.cellCenter(g, k); s[k] = (c[0] - g.cx) * wv[0] + (c[1] - g.cy) * wv[1]; }
  const us = pv.us_coef * c1.ustar, Kh = pv.kh_scale * Math.sqrt(g.A0);
  const cf = M.flowConfig(g, L.hm, c1.ustar * c1.ustar, wv, us, Kh, pv.gyre_r, { slope: L.slope, s });
  let worst = 0, up = 0, nu = 0, dn = 0, nd = 0;
  for (let k = 0; k < g.nw; k++) {
    if (!cf.layered[k] || cf.outcrop[k]) continue;
    worst = Math.max(worst, Math.abs(cf.Dc[k] - (L.hm + L.slope * s[k])));
    if (s[k] < -0.3 * g.zmax / L.slope || s[k] < -50) { up += cf.Dc[k]; nu++; } if (s[k] > 50) { dn += cf.Dc[k]; nd++; }
  }
  check('stirred depth follows the tilted line in every layered cell', worst < 1e-12);
  check('the warm layer is thicker downwind than upwind', nd > 0 && nu > 0 && dn / nd > up / nu, `upwind ${(up / nu).toFixed(2)} m, downwind ${(dn / nd).toFixed(2)} m`);
  let dmax = 0; for (let m = 0; m < M.NA; m++) for (let f = 0; f < cf.nf; f++) dmax = Math.max(dmax, Math.abs(cf.F[m * cf.nf + f]));
  const div = new Float64Array(g.nw); for (let m = 0; m < M.NA; m++) for (let f = 0; f < cf.nf; f++) { const q = cf.F[m * cf.nf + f]; div[cf.fc1[f]] += q; div[cf.fc2[f]] -= q; }
  let wd = 0; for (let k = 0; k < g.nw; k++) wd = Math.max(wd, Math.abs(div[k]));
  check('tilted flow stays divergence-free', wd < 1e-10 * dmax, (wd / dmax).toExponential(1));
  const rw = M.run2d(I({ areaAcres: 20, maxDepthM: 3, windMs: 5, shape: 'long', windFrom: 270, product: 'endothall', dose: 0.5 }), { hours: 36, only: 'map' });
  const r0 = M.run2d(I({ areaAcres: 20, maxDepthM: 3, windMs: 5, shape: 'long', windFrom: 270, product: 'endothall', dose: 0.5 }), { hours: 36, only: 'map', pv: { tilt: 0 } });
  let wmin = Infinity; for (let hh = 0; hh <= 36; hh++) if (rw.map.Wed[hh] > 0) wmin = Math.min(wmin, rw.map.Wed[hh]);
  check('in an 11 mph wind (Wedderburn number under 1) the thermocline reaches the surface upwind', wmin < 1 && rw.map.tilt.upwellH !== null, `lowest W ${wmin.toFixed(2)}, first at hour ${rw.map.tilt.upwellH}`);
  let upCells = 0, upUp = 0; const fh = rw.map.tilt.upwellH, cfo = rw.map.configs[rw.map.cfgOfHour[fh]];
  for (let k = 0; k < rw.grid.nw; k++) if (cfo.outcrop[k]) { upCells++; if (M.cellCenter(rw.grid, k)[0] < rw.grid.cx) upUp++; }
  check('…and only on the upwind (west) side', upCells > 0 && upUp === upCells, `${upUp} of ${upCells} cells`);
  check('with the tilt switched off there is no upwelling', r0.map.tilt.upwellH === null);
  // the tilt moves toward the steady value over about a quarter of the sloshing period: every hour it
  // lands between where it was and the steady value (never past it)
  const ts = M.tiltSeries(c1, pv, 300);
  let over = 0, nOn = 0;
  for (let hh = 1; hh < ts.length; hh++) {
    const a = ts[hh], b = ts[hh - 1]; if (!(a.slopeSS > 0)) continue; nOn++;
    const lo = Math.min(b.slope, a.slopeSS), hi = Math.max(b.slope, a.slopeSS);
    if (a.slope < lo * (1 - 1e-9) - 1e-15 || a.slope > hi * (1 + 1e-9) + 1e-15) over++;
  }
  check('each hour the tilt moves toward the steady value without passing it', nOn > 24 && over === 0, `${nOn} layered hours, ${over} overshoots`);
  // a strongly layered 10 m, 1-acre pond: short sloshing period, so the tilt settles within the hour
  const dp = I({ maxDepthM: 10, windMs: 2, product: 'endothall', dose: 0.5 }), sd = setup(dp), td = M.tiltSeries(sd.c1, sd.pv, 72);
  let nSet = 0, settled = 0;
  for (let hh = 2; hh < td.length; hh++) { const a = td[hh], b = td[hh - 1]; if (a.slopeSS > 0 && b.slopeSS > 0 && a.tQuarter < 1200 && Math.abs(b.slopeSS / a.slopeSS - 1) < 0.05) { nSet++; if (Math.abs(a.slope / a.slopeSS - 1) < 0.1) settled++; } }
  check('…and reaches it within the hour when the sloshing period is short (10 m pond)', nSet > 24 && settled === nSet, `${settled} of ${nSet} steady hours within 10%`);
}

console.log('Surface skin');
{
  const inp = I({ windMs: 4 }), { pv, c1, g } = setup(inp);
  const us = pv.us_coef * c1.ustar, sk = M.skinSetup(c1, pv, us);
  check('surface drift is 0.53 × the air-side friction velocity (about 2% of the wind)', Math.abs(sk.surface - 0.53 * sk.ua) < 1e-12 && sk.surface / c1.U > 0.015 && sk.surface / c1.U < 0.03, `${(100 * sk.surface).toFixed(1)} cm/s in a ${c1.U} m/s wind (${(100 * sk.surface / c1.U).toFixed(1)}%)`);
  let tot = 0; for (const D of [0.1, 0.5, 2]) tot = Math.max(tot, Math.abs(M.skinT(D, D, sk)));
  check('the skin adds no net transport over the stirred layer', tot < 1e-15);
  const wv = M.windVec(270), Kh = pv.kh_scale * Math.sqrt(g.A0);
  const a = M.flowConfig(g, g.zmax, c1.ustar * c1.ustar, wv, us, Kh, pv.gyre_r), b = M.flowConfig(g, g.zmax, c1.ustar * c1.ustar, wv, us, Kh, pv.gyre_r, { skin: sk });
  const div = new Float64Array(g.nw); let sc = 0;
  for (let m = 0; m < M.NA; m++) for (let f = 0; f < b.nf; f++) { const q = b.F[m * b.nf + f]; div[b.fc1[f]] += q; div[b.fc2[f]] -= q; sc = Math.max(sc, Math.abs(q)); }
  let wd = 0; for (let k = 0; k < g.nw; k++) wd = Math.max(wd, Math.abs(div[k]));
  check('map flow with the skin stays divergence-free', wd < 1e-10 * sc, (wd / sc).toExponential(1));
  let faster = 0; for (let k = 0; k < g.nw; k++) if (b.vtx[k] > a.vtx[k]) faster++;
  check('the top layer moves faster downwind with the skin', faster === g.nw, `${faster} of ${g.nw} cells`);
  const sl = M.buildSlice(g, wv), N = c1.col.N, dz = c1.col.dz;
  sl.nlev = new Int32Array(sl.nxs); for (let i = 0; i < sl.nxs; i++) sl.nlev[i] = Math.max(1, Math.min(N, Math.round(sl.hcol[i] / dz)));
  const scf = M.sliceConfig(sl, g.zmax, us, dz, N, Kh, { skin: sk }), NC = N + 1;
  let worst = 0, scale = 0;
  for (let i = 0; i < sl.nxs; i++) for (let k = 0; k < sl.nlev[i]; k++) {
    const fw = scf.Fx[i * N + k], fe = scf.Fx[(i + 1) * N + k], wt = k > 0 ? scf.Wt[i * NC + k] : 0, wb = k + 1 < sl.nlev[i] ? scf.Wt[i * NC + k + 1] : 0;
    worst = Math.max(worst, Math.abs(fe - fw + wt - wb)); scale = Math.max(scale, Math.abs(fw), Math.abs(wt));
  }
  check('slice flow with the skin stays divergence-free', worst < 1e-12 * scale + 1e-18);
  // the same colonies, starting in the top 30 cm, drift further downwind with the skin
  const drift = (r, h) => { const m = r.map, n = m.show; let s = 0, c = 0; for (let p = 0; p < n; p++) if (m.sz[p] < 0.3) { s += m.sx[h * n + p] - m.sx[p]; c++; } return s / c; };
  const calmish = I({ product: 'endothall', dose: 0.5, windMs: 1.5, maxDepthM: 1.5 });
  const ws = M.run2d(calmish, { hours: 2, only: 'map' }), wo = M.run2d(calmish, { hours: 2, only: 'map', pv: { skin_coef: 0 } });
  check('floating colonies drift further downwind with the skin', drift(ws, 2) > drift(wo, 2) + 1, `${drift(ws, 2).toFixed(1)} m vs ${drift(wo, 2).toFixed(1)} m without, over 2 h`);
}

console.log('Dense injected film');
{
  const inj = { product: 'copper_chelated', method: 'inject', dose: 1, maxDepthM: 1.5, where: 'upwind_strip' };
  const pv = M.centralParams(I(inj));
  const ip = M.injectProps('copper_chelated', pv);
  check('film density excess: 10 mg/L Cu as Cutrine-Plus ≈ 0.020 kg/m³', Math.abs(M.filmDrho(10, ip) - 10 / 0.09 / 1000 * (1 - 1000 / 1225)) < 1e-15 && Math.abs(M.filmDrho(10, ip) - 0.0204) < 0.0005, M.filmDrho(10, ip).toFixed(4) + ' kg/m³');
  const calm = M.run2d(I(Object.assign({ windMs: 0.5 }, inj)), { hours: 24 });
  const stir = M.run2d(I(Object.assign({ windMs: 0.5 }, inj)), { hours: 24, pv: { film_Ri: 1e12 } });
  check('mass balance closes with a dense film (map and slice)', Math.abs(closure(calm.map.budget) - 1) < 1e-9 && Math.abs(closure(calm.slice.budget) - 1) < 1e-9, closure(calm.map.budget).toFixed(12));
  check('in calm water the injection forms a film that lasts hours', calm.map.film.used && !calm.map.film.stirredAtOnce && (calm.map.film.endH == null || calm.map.film.endH > 2), calm.map.film.endH == null ? 'film still there at the end of the 24-h run' : `film gone after ${calm.map.film.endH} h`);
  check('with strong stirring assumed, the film mixes in at once', stir.map.film.stirredAtOnce && stir.map.film.endH === 1);
  // where the product ends up in the bottom water: deepest fifth of the map
  const deepShare = r => { const g = r.grid, idx = Array.from({ length: g.nw }, (_, k) => k).sort((a, b) => g.h[b] - g.h[a]).slice(0, Math.round(g.nw / 5)); let s = 0, t = 0; const h = 3; for (let k = 0; k < g.nw; k++) { const c = M.unquant(r.map.botQ[h * g.nw + k], r.map.ref) * g.h[k]; t += c; } for (const k of idx) s += M.unquant(r.map.botQ[h * g.nw + k], r.map.ref) * g.h[k]; return s / t; };
  check('the film carries product downhill toward the deepest water', deepShare(calm) > deepShare(stir) + 0.05, `deepest fifth holds ${(100 * deepShare(calm)).toFixed(0)}% vs ${(100 * deepShare(stir)).toFixed(0)}% if mixed in at once (3 h)`);
  const windy = M.run2d(I(Object.assign({ windMs: 4 }, inj)), { hours: 6, only: 'map' });
  check('in a 9 mph wind the film is stirred into the bottom water at once', windy.map.film.stirredAtOnce);
  const sprayed = M.run2d(I({ product: 'copper_chelated', method: 'spray', dose: 1 }), { hours: 2, only: 'map' });
  check('no film for sprayed product', !sprayed.map.film.used);
}

console.log('Real weather (changing wind)');
{
  // synthetic hourly weather: daily air and sun cycle, afternoon breeze, wind turning round on day 3
  function makeWx(o) {
    o = Object.assign({ days: 17, doy: 196, uDay: 4, uNight: 1, dir1: 225, dir2: 45, switchDay: 5, cloud: 0.3 }, o || {});
    const wx = { source: 'test weather', Ta: [], rh: [], U: [], dir: [], cloud: [], sw: [] };
    for (let i = 0; i < o.days * 24; i++) {
      const clk = i % 24, d = Math.floor(i / 24), day = clk >= 10 && clk <= 19;
      wx.Ta.push(26 + 5 * Math.cos(2 * Math.PI * (clk - 15) / 24)); wx.rh.push(0.75 - 0.2 * Math.cos(2 * Math.PI * (clk - 15) / 24));
      wx.U.push(o.const != null ? o.const : day ? o.uDay * (0.8 + 0.4 * Math.sin(i * 0.7) ** 2) : o.uNight);
      wx.dir.push(o.constDir != null ? o.constDir : (d < o.switchDay ? o.dir1 : o.dir2) + 15 * Math.sin(i * 0.31));
      wx.cloud.push(o.cloud); wx.sw.push((1 - 0.6 * o.cloud) * CC.clearSkyGHI(CC.solarElevationSin(((clk - 0.5) + 24) % 24, o.doy)));
    }
    return wx;
  }
  const tox = T => (T.start + T.released - T.degraded) / T.inWater;
  const rw = M.run2d(I({ weather: makeWx(), windFrom: 225 }), {});
  check('changing wind: product balance closes (map and slice)', Math.abs(closure(rw.map.budget) - 1) < 1e-9 && Math.abs(closure(rw.slice.budget) - 1) < 1e-9);
  check('changing wind: toxin balance closes (map and slice)', Math.abs(tox(rw.map.toxin) - 1) < 1e-9 && Math.abs(tox(rw.slice.toxin) - 1) < 1e-9);
  const m = rw.map, n = m.show;
  const meanXY = h => { let x = 0, y = 0, c = 0; for (let p = 0; p < n; p++) if (m.sz[h * n + p] < 0.5) { x += m.sx[h * n + p] - rw.grid.cx; y += m.sy[h * n + p] - rw.grid.cy; c++; } return [x / c, y / c]; };
  // positions averaged over several hours, day and night (one snapshot can fall in a calm night hour)
  const avgXY = hs => { const v = hs.map(meanXY); return [v.reduce((s, q) => s + q[0], 0) / v.length, v.reduce((s, q) => s + q[1], 0) / v.length]; };
  const a = meanXY(0), b = avgXY([24, 30, 36, 42, 48, 54, 60]), c = avgXY([130, 136, 142, 148, 154, 160]);
  check('floating colonies ride northeast under a southwest wind…', b[0] - a[0] > 3 && b[1] - a[1] > 3, `moved ${(b[0] - a[0]).toFixed(1)} m east, ${(b[1] - a[1]).toFixed(1)} m north (average of hours 24-60)`);
  check('…and back southwest after the wind turns', c[0] - b[0] < -3 && c[1] - b[1] < -3, `moved ${(c[0] - b[0]).toFixed(1)} m east, ${(c[1] - b[1]).toFixed(1)} m north (to the average of hours 130-160)`);
  let arrows = 0; for (const cf of m.configs) { let sx = 0, sy = 0; for (let k = 0; k < rw.grid.nw; k++) { sx += cf.vtx[k]; sy += cf.vty[k]; } const w = M.windVec(cf.windFrom); if (sx * w[0] + sy * w[1] > 0) arrows++; }
  check('the top-water current follows each hour\'s wind', arrows === m.configs.length, `${arrows} of ${m.configs.length} flow states`);
  // steady weather equal to the idealized day's wind gives about the same knock-down
  const steadyWx = makeWx({ const: 2, constDir: 225, cloud: 0 });
  const st = M.run2d(I({ weather: steadyWx, windFrom: 225 }), { hours: 48, only: 'map' }), id = M.run2d(I({ windFrom: 225 }), { hours: 48, only: 'map' });
  // 10 points: since the Oct 21, 2026 peroxide recalibration the knock-down sits on the steep middle of
  // its curve, where the map's coarser top sublayer (see the review) moves it more
  check('steady real wind behaves like the same idealized wind (map knock-down within 10 points of the layers model)', Math.abs(st.map.K[48] - st.column.K[48]) < 0.10, `map ${(100 * st.map.K[48]).toFixed(1)}%, layers ${(100 * st.column.K[48]).toFixed(1)}% (idealized map ${(100 * id.map.K[48]).toFixed(1)}%)`);
  // a crosswind drives no loop in the slice (it is cut along the treatment-time wind)
  const cross = M.run2d(I({ weather: makeWx({ dir1: 225, dir2: 315, switchDay: 2 }), windFrom: 225 }), { hours: 6, only: 'slice' });
  const last = cross.slice.configs[cross.slice.cfgOfHour[6]];
  check('a crosswind drives no loop along the side slice', Math.abs(last.share) <= 0.15, `along-slice share ${last.share}`);
  // calm hours and a wind that dies completely
  const calm = M.run2d(I({ weather: makeWx({ const: 0 }) }), { hours: 24 });
  let bad = 0; for (const arr of [calm.map.K, calm.map.Cexp, calm.map.DOml, calm.slice.K, calm.slice.Cexp]) for (let h = 0; h <= 24; h++) if (!isFinite(arr[h]) || arr[h] < 0) bad++;
  check('dead calm weather runs cleanly', bad === 0 && Math.abs(closure(calm.map.budget) - 1) < 1e-9);
}

console.log('Review fixes, Oct 22, 2026');
{
  // non-floating colonies stay spread by water in a 7 mph wind (the deepest third used to hold 73%)
  const thirds = wind => {
    const rr = M.run2d(I({ target: 'planktothrix', dose: 0, windMs: wind, windFrom: 270 }), { hours: 48, only: 'map' }), g = rr.grid, m = rr.map, nn = m.show;
    const order = Array.from(g.h.keys()).sort((a, b) => g.h[a] - g.h[b]), third = new Int8Array(g.nw);
    order.forEach((k, i) => { third[k] = Math.min(2, Math.floor(3 * i / g.nw)); });
    const lut = new Int32Array(g.nx * g.ny).fill(-1); for (let k = 0; k < g.nw; k++) lut[g.cj[k] * g.nx + g.ci[k]] = k;
    const vol = [0, 0, 0], cnt = [0, 0, 0]; let V = 0, N = 0;
    for (let k = 0; k < g.nw; k++) { vol[third[k]] += g.h[k]; V += g.h[k]; }
    for (let hr = 6; hr <= 48; hr += 6) for (let p = 0; p < nn; p++) {
      const i = Math.floor((m.sx[hr * nn + p] - g.x0) / g.dx), j = Math.floor((m.sy[hr * nn + p] - g.y0) / g.dx);
      const k = i >= 0 && j >= 0 && i < g.nx && j < g.ny ? lut[j * g.nx + i] : -1; if (k >= 0) { cnt[third[k]]++; N++; }
    }
    return { col: cnt.map(c => c / N), vol: vol.map(v => v / V) };
  };
  const t7 = thirds(3.13);
  check('map: non-floating colonies stay spread by water in a 7 mph wind (each third within 4 points)', t7.col.every((c, i) => Math.abs(c - t7.vol[i]) < 0.04),
    `shallow/middle/deep thirds hold ${t7.col.map(c => (100 * c).toFixed(1)).join('/')}% of colonies vs ${t7.vol.map(v => (100 * v).toFixed(1)).join('/')}% of the water`);
  // a spray starts in the top few inches on the map too, as in the layers model
  const sp = M.run2d(I(), { hours: 1, only: 'map' });
  const top0 = sp.map.CtopMean[0];                 // mean over squares (equal areas) of the top sublayer
  const pv = M.centralParams(I()), c1 = CC.simulate(I(), pv, {});
  check('map: a spray starts in the top few inches (average top water within 10% of the layers model\'s spray layer; it was 2.4-5x lower)', Math.abs(top0 / c1.rec.Cmax[0] - 1) < 0.10, `map ${top0.toFixed(1)}, layers ${c1.rec.Cmax[0].toFixed(1)} mg/L at the start`);
  // outlines that cross themselves
  const bow = M.buildGrid(I({ shape: 'custom', outline: [[0, 0], [2, 1], [2, 0], [0, 1]] }), pv);
  check('a bow-tie outline is flagged and still gets the right area (within 5%)', bow.crossing && Math.abs(bow.area / bow.A0 - 1) <= 0.05, `${(bow.area / bow.A0).toFixed(3)}× the typed area`);
  check('preset shapes and an L shape don\'t count as crossing', ['round', 'oval', 'long', 'cove'].every(sh => !M.selfCrossing(M.shapeOutline(sh))) && !M.selfCrossing([[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]]));
  // shallow ponds hold the column's water exactly
  const vr = ft => { const inp = I({ maxDepthM: ft / 3.28084 }), p2 = M.centralParams(inp), g = M.buildGrid(inp, p2), col = CC.column(inp, p2); return g.V / (col.Vt * g.area / col.A0); };
  const v1 = vr(1), v2 = vr(2), v8 = vr(8);
  check('map water volume matches the layers model in 1, 2 and 8 ft ponds (within 0.5%)', [v1, v2, v8].every(v => Math.abs(v - 1) < 0.005), [v1, v2, v8].map(v => v.toFixed(4)).join(' / '));
  // wind direction kept to the degree
  const wd = M.run2d(I({ windFrom: 225 }), { hours: 2, only: 'map' });
  check('a southwest (225°) wind runs at 225°, not 230°', wd.map.configs.every(c => c.windFrom === 225 || c.windFrom === 0), wd.map.configs.map(c => c.windFrom).join(','));
  // diquat: the three views, now with one binding rule (they used to give 0%, 14% and 33%)
  const dqIn = I({ product: 'diquat', dose: 0.2, maxDepthM: 4 / 3.28084, target: 'microcystis' });
  const dqW = S.simulate(dqIn, S.central()), dqL = CC.simulate(dqIn, pv, {}), dqM = M.run2d(dqIn, { hours: 72, only: 'map' });
  check('diquat in clay water: map and layers model within 10 points at 48 h', Math.abs(dqM.map.K[48] - dqL.rec.K[48]) < 0.10, `well-mixed ${(100 * dqW.rec.K[48]).toFixed(0)}%, layers ${(100 * dqL.rec.K[48]).toFixed(0)}%, map ${(100 * dqM.map.K[48]).toFixed(0)}%`);
  check('…and the map\'s product balance still closes with binding', Math.abs(closure(dqM.map.budget) - 1) < 1e-9 && dqM.map.budget.boundTotal > 0);
}

console.log('\nColonies that should follow the water stay evenly spread (bugs H1 and H2, fixed Nov 8, 2026)');
{
  // the up-and-down step on its own: 20,000 colonies spread evenly stay even, in 20 depth bins,
  // at the usual step (0.15 × D/(2κu*)) and at 5× it; the old walk left the top and bottom bins 20-33% too full
  let worst = 0, cases = 0;
  for (const [D, ust] of [[0.3, 0.006], [1, 0.006], [2, 0.006], [0.15, 0.015]]) for (const c of [0.15, 0.75]) {
    const r = M.rngPair(11 + cases++), np = 20000, a = 0.41 * ust, dt = c * D / (2 * a), z = new Float64Array(np), cnt = new Float64Array(20);
    for (let p = 0; p < np; p++) z[p] = r.u() * D;
    let ns = 0;
    for (let s = 0; s < 40; s++) { for (let p = 0; p < np; p++) z[p] = M.vertMove(z[p], D, D, 0, 0, a, 1e-5, 0, dt, r); if (s >= 20) { ns++; for (let p = 0; p < np; p++) cnt[Math.min(19, Math.floor(z[p] / D * 20))]++; } }
    for (const x of cnt) worst = Math.max(worst, Math.abs(x / (np * ns / 20) - 1));
  }
  check('the colonies\' up-and-down step keeps an even spread even (every depth bin within 4%, 8 cases)', worst < 0.04, `worst bin off by ${(100 * worst).toFixed(1)}%`);
  // map and side slice: Planktothrix (neither floats nor sinks), no kill, 1 acre round, 3.3 ft, 18 mph,
  // three seeds, hours 12-48. Density ÷ water in fifths from upwind to downwind should be 1.
  // Before the fix: map 0.96-1.32, slice 0.15-3.40. Left over: up to about 10% at the shores in strong
  // wind (disclosed on the page), so the bound is 15%.
  const nIn = I({ product: 'diquat', dose: 0.2, target: 'planktothrix', maxDepthM: 1, windMs: 8, windFrom: 270 });
  const fifthsMap = [0, 0, 0, 0, 0], fifthsSl = [0, 0, 0, 0, 0];
  let top7 = 0, nTop = 0;
  for (const seed of [1, 2, 3]) {
    const r = M.run2d(nIn, { hours: 48, seed }), m = r.map, g = r.grid, sl = r.slice;
    let imin = 1e9, imax = -1e9; for (let k = 0; k < g.nw; k++) { imin = Math.min(imin, g.ci[k]); imax = Math.max(imax, g.ci[k]); }
    const bin = i => Math.min(4, Math.floor((i - imin) / (imax - imin + 1) * 5)), idx = new Map(), vol = [0, 0, 0, 0, 0], cnt = [0, 0, 0, 0, 0];
    let V = 0, n = 0;
    for (let k = 0; k < g.nw; k++) { idx.set(g.ci[k] + ',' + g.cj[k], k); vol[bin(g.ci[k])] += g.h[k]; V += g.h[k]; }
    for (let hr = 12; hr <= 48; hr++) for (let p = 0; p < m.show; p++) {
      const i = Math.floor((m.sx[hr * m.show + p] - g.x0) / g.dx), j = Math.floor((m.sy[hr * m.show + p] - g.y0) / g.dx), k = idx.get(i + ',' + j);
      if (k === undefined) continue; cnt[bin(i)]++; n++;
      nTop++; if (m.sz[hr * m.show + p] < 0.07 * g.h[k]) top7++;
    }
    for (let j = 0; j < 5; j++) fifthsMap[j] += (cnt[j] / n) / (vol[j] / V) / 3;
    const cs = [0, 0, 0, 0, 0], ar = [0, 0, 0, 0, 0]; let ns = 0, A = 0;
    for (let i = 0; i < sl.nxs; i++) { ar[Math.floor(i * 5 / sl.nxs)] += sl.nlev[i]; A += sl.nlev[i]; }
    for (let hr = 12; hr <= 48; hr++) for (let p = 0; p < sl.show; p++) { const i = Math.min(sl.nxs - 1, Math.floor(sl.qx[hr * sl.show + p] / sl.dxs)); cs[Math.floor(i * 5 / sl.nxs)]++; ns++; }
    for (let j = 0; j < 5; j++) fifthsSl[j] += (cs[j] / ns) / (ar[j] / A) / 3;
  }
  check('map: colonies that follow the water stay spread by water volume, upwind to downwind (each fifth within 15%)', fifthsMap.every(v => Math.abs(v - 1) < 0.15), fifthsMap.map(v => v.toFixed(2)).join(' '));
  check('map: …and the top 7% of the water (where spray lands) holds 7% of them (within 10%)', Math.abs(top7 / nTop / 0.07 - 1) < 0.10, `${(top7 / nTop / 0.07).toFixed(2)}× its share`);
  check('side slice: the same colonies stay spread along the slice (each fifth within 15%)', fifthsSl.every(v => Math.abs(v - 1) < 0.15), fifthsSl.map(v => v.toFixed(2)).join(' '));
}

console.log('\nOne rule for toxin broken down by sunlight in all three models (added to the layers model and map Nov 8, 2026)');
{
  // a 3.3 ft pond in a strong wind (never layered), no treatment, so for the first two days (before the
  // bacteria start) only sunlight removes dissolved toxin: half-life mc_photo days per metre of mean depth
  const tIn = I({ product: 'h2o2_liquid', dose: 0, target: 'microcystis', maxDepthM: 1, windMs: 8, history: false });
  const pv = M.centralParams(tIn), c1 = CC.simulate(tIn, pv, {}), col = CC.column(tIn, pv), zm = col.Vt / col.A0;
  const expect = 1 - Math.exp(-Math.LN2 / (pv.mc_photo * zm) * 2);
  const g1 = S.geometry(tIn, S.central());
  const wExp = 1 - Math.exp(-Math.LN2 / (S.central().mc_photo * g1.zLayer) * 2);
  const lost = 1 - c1.rec.MCmean[48] / c1.rec.MCmean[0];
  check('layers model: 2-day sunlight loss matches the well-mixed rule (within 3%)', Math.abs(lost / expect - 1) < 0.03, `layers ${(100 * lost).toFixed(2)}%, rule ${(100 * expect).toFixed(2)}%, well-mixed rule ${(100 * wExp).toFixed(2)}%`);
  const mp = M.run2d(tIn, { hours: 48, only: 'map' }).map, sl = M.run2d(tIn, { hours: 48, only: 'slice' }).slice;
  const lm = mp.toxin.degraded / mp.toxin.start, ls = sl.toxin.degraded / sl.toxin.start;
  // the slice is a cut through the deepest point, so its own mean depth is greater than the pond's
  let As = 0; for (let i = 0; i < sl.nxs; i++) As += sl.nlev[i] * sl.dz * sl.dxs;
  const expectS = 1 - Math.exp(-Math.LN2 / (pv.mc_photo * As / sl.L) * 2);
  check('map: the same 2-day loss (within 5%)', Math.abs(lm / expect - 1) < 0.05, `map ${(100 * lm).toFixed(2)}%`);
  check('side slice: the same rule for its own mean depth (within 5%)', Math.abs(ls / expectS - 1) < 0.05, `slice ${(100 * ls).toFixed(2)}%, rule at the slice's mean depth ${(As / sl.L).toFixed(2)} m: ${(100 * expectS).toFixed(2)}%`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Verification tests for sim-core.js. Run: node tests/verify.test.js
// "Verification" = the code solves its own equations and reproduces the blueprint's worked numbers.
// It does NOT show the model matches real ponds (that is corroboration, a later phase).
'use strict';
const S = require('../sim-core.js');

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  pass  ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { failed++; console.log('  FAIL  ' + name + (detail ? '  (' + detail + ')' : '')); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const pv = S.central();

const base = {
  areaAcres: 1, maxDepthM: 1.83, tempC: 28, pH: 8, alk: 40, ntu: 10, turbCause: 'mineral', clay: 'typical',
  chl: 100, target: 'microcystis', toxin: 'typical', history: false, windMs: 2, product: 'h2o2_liquid',
  dose: 3, fraction: 1, appHour: 8, layering: 'auto'
};

console.log('\nChemistry rate laws');
{
  const hl = pH => Math.LN2 / S.flumRate(pH, pv);
  check('flumioxazin half-life pH 7 ≈ 23.8 h', near(hl(7), 23.8, 0.1), hl(7).toFixed(2) + ' h');
  check('flumioxazin half-life pH 8.5 ≈ 58 min', near(hl(8.5) * 60, 58, 1.5), (hl(8.5) * 60).toFixed(1) + ' min');
  check('flumioxazin half-life pH 9.5 ≈ 5.9 min', near(hl(9.5) * 60, 5.9, 0.2), (hl(9.5) * 60).toFixed(2) + ' min');
  const h = (chl, T) => Math.LN2 / S.h2o2Rate(T, chl, pv);
  check('peroxide half-life Chl 50, 20 °C ≈ 6.3 h', near(h(50, 20), 6.3, 0.05), h(50, 20).toFixed(2));
  check('peroxide half-life Chl 50, 28 °C ≈ 3.5 h', near(h(50, 28), 3.5, 0.06), h(50, 28).toFixed(2));
  check('peroxide half-life Chl 200, 20 °C ≈ 1.7 h', near(h(200, 20), 1.7, 0.03), h(200, 20).toFixed(2));
  check('peroxide half-life Chl 200, 28 °C ≈ 0.9 h', near(h(200, 28), 0.9, 0.05), h(200, 28).toFixed(2));
  const g20 = S.pHAfterGranules(7.5, 20, 5, pv), g100 = S.pHAfterGranules(7.5, 100, 5, pv);
  check('granules 5 mg/L, alkalinity 20: pH 7.5 → 9.34', near(g20, 9.34, 0.02), g20.toFixed(3));
  check('granules 5 mg/L, alkalinity 100: pH 7.5 → 7.98', near(g100, 7.98, 0.02), g100.toFixed(3));
  const kcu = S.copperRate(26.8, 78, Object.assign({}, pv, { cu_u: 0.5 }));
  check('copper loss at 26.8 °C, alkalinity 78 = 0.761 /day', near(kcu, 0.761, 1e-9), kcu.toFixed(4));
  const c1 = S.diquatCapacity(15, 'mineral', 'swelling', Object.assign({}, pv, { dq_tss: 1 }));
  const c2 = S.diquatCapacity(15, 'mineral', 'swelling', Object.assign({}, pv, { dq_tss: 2 }));
  check('diquat binding, bentonite 15 NTU ≈ 1.4-2.8 mg/L', near(c1, 1.4, 0.05) && near(c2, 2.8, 0.05), c1.toFixed(2) + '-' + c2.toFixed(2));
  check('no clay binding for algal turbidity', S.diquatCapacity(30, 'algae', 'swelling', pv) === 0);
  check('free copper ceiling 0.028 at pH 7, 100× lower at pH 8', near(S.freeCuCeiling(7, pv), 0.028, 1e-12) && near(S.freeCuCeiling(8, pv), 0.00028, 1e-12));
}

console.log('\nWater properties');
{
  check('water density 4 °C ≈ 999.97 kg/m³', near(S.waterDensity(4), 999.97, 0.01), S.waterDensity(4).toFixed(3));
  check('water density 25 °C ≈ 997.05 kg/m³', near(S.waterDensity(25), 997.05, 0.02), S.waterDensity(25).toFixed(3));
  check('O2 saturation 28 °C ≈ 7.8 mg/L', near(S.doSat(28), 7.81, 0.05), S.doSat(28).toFixed(2));
  check('O2 saturation 20 °C ≈ 9.09 mg/L', near(S.doSat(20), 9.09, 0.05), S.doSat(20).toFixed(2));
  check('O2 Schmidt number 20 °C ≈ 510 (ν/D cross-check)', near(S.scO2(20), 510, 15), S.scO2(20).toFixed(1));
  check('Cole & Caraco k600 at 2 m/s = 2.77 cm/h', near(S.k600(2, pv), 2.77, 0.01), S.k600(2, pv).toFixed(3));
}

console.log('\nExact 0-D decay (numerics)');
{
  const inp = Object.assign({}, base, { product: 'copper_sulfate', dose: 0.5, layering: 'mixed' });
  const r = S.simulate(inp, pv, {});
  const k = S.copperRate(28, 40, pv) / 24;
  let maxErr = 0;
  r.rec.hours.forEach((t, i) => { const ex = r.C0 * Math.exp(-k * t); maxErr = Math.max(maxErr, Math.abs(r.rec.C[i] - ex) / ex); });
  check('copper concentration equals C0·e^(−kt) every hour', maxErr < 1e-9, 'max relative error ' + maxErr.toExponential(1));
}

console.log('\nKill-model calibration');
{
  const E = 2.62, T = 24;
  for (const kD of [0.1, 0.45, 2]) {
    for (const zf of [0, 0.25, 0.5]) {
      const cal = S.calibrateSD(E, T, kD, zf * E);
      const dt = 0.001; let D = 0, H = 0;
      for (let t = 0; t < T; t += dt) { const Dn = E + (D - E) * Math.exp(-kD * dt); H += cal.bw * Math.max(0, 0.5 * (D + Dn) - cal.z) * dt; D = Dn; }
      const eff = 1 - Math.exp(-H);
      check(`SD: constant EC50 gives 50% at ${T} h (kD ${kD}, z ${zf}·EC50)`, near(eff, 0.5, 0.002), (100 * eff).toFixed(2) + '%');
    }
    const mw = S.calibrateIT(E, T, kD);
    const Dmax = E * (1 - Math.exp(-kD * T));
    check(`IT: constant EC50 gives 50% at ${T} h (kD ${kD})`, near(S.itFraction(Dmax, mw, 2), 0.5, 1e-9));
  }
}

console.log('\nWorked kill example (5 mg/L peroxide, half-life 5 h, EC50 2.62 mg/L at 24 h)');
{
  const E = 2.62, T = 24, k = Math.LN2 / 5, C0 = 5;
  const twa = C0 * (1 - Math.exp(-k * T)) / (k * T);
  const pct = x => Math.round(100 * x);
  check('time-weighted average = 1.45 mg/L', near(twa, 1.45, 0.005), twa.toFixed(3));
  check('TWA model 36 / 23 / 9 % (slope 1/2/4)', [1, 2, 4].map(b => pct(S.hill(twa, E, b))).join() === '36,23,9', [1, 2, 4].map(b => pct(S.hill(twa, E, b))).join('/'));
  // The blueprint prints 79% for slope 2; the exact value is 78.5%, so allow one point of rounding.
  const pk = [1, 2, 4].map(b => 100 * S.hill(C0, E, b));
  check('peak model 66 / 79 / 93 % (±1 point rounding)', near(pk[0], 66, 1) && near(pk[1], 79, 1) && near(pk[2], 93, 1), pk.map(x => x.toFixed(1)).join('/'));
  const ct = 1 - Math.pow(0.5, (C0 / k) / (E * T));
  check('concentration × time model 33 %', pct(ct) === 33, pct(ct) + '%');
  const guts = (kD, struct, beta, zf) => {
    const dt = 0.01; let D = 0, Dm = 0, H = 0; const cal = S.calibrateSD(E, T, kD, zf * E), mw = S.calibrateIT(E, T, kD);
    for (let t = 0; t < 48; t += dt) { const c = C0 * Math.exp(-k * (t + dt / 2)); const Dn = c + (D - c) * Math.exp(-kD * dt); H += cal.bw * Math.max(0, 0.5 * (D + Dn) - cal.z) * dt; D = Dn; if (D > Dm) Dm = D; }
    return struct === 'SD' ? 1 - Math.exp(-H) : S.itFraction(Dm, mw, beta);
  };
  const sd = [guts(0.1, 'SD', 2, 0), guts(2, 'SD', 2, 0), guts(0.1, 'SD', 2, 2 / E), guts(2, 'SD', 2, 2 / E)];
  const it = [guts(0.1, 'IT', 2), guts(0.1, 'IT', 4), guts(2, 'IT', 2), guts(2, 'IT', 4)];
  check('GUTS-SD spans 0-47 %', pct(Math.min(...sd)) === 0 && pct(Math.max(...sd)) >= 45 && pct(Math.max(...sd)) <= 48, sd.map(pct).join('/'));
  check('GUTS-IT spans 15-86 %', pct(Math.min(...it)) === 15 && pct(Math.max(...it)) === 86, it.map(pct).join('/'));
}

console.log('\nMicrocystin worked example (1 acre, 1.5 m, Chl 100, 80% lysed, ratio 0.4, 10% dissolved)');
{
  const pvm = Object.assign({}, pv, { r_meanmax: 0.4, mc_fext: 0.1, mc_krel: 1.0, mc_lag: 3, mc_kbio: 0.46 });
  const inp = Object.assign({}, base, { maxDepthM: 1.5 / 0.4, layering: 'mixed', product: 'h2o2_liquid' });
  const r = S.simulate(inp, pvm, { forceKill: 0.8 });
  const sm = S.summarize(r, inp);
  check('dissolved MC peaks at 31-33 µg/L', sm.mcPeak >= 31 && sm.mcPeak <= 33.5, sm.mcPeak.toFixed(1) + ' µg/L on day ' + sm.mcPeakDay.toFixed(1));
  check('falls below EPA 8 µg/L around day 6', sm.mcBelow8Day >= 5.5 && sm.mcBelow8Day <= 6.5, 'day ' + sm.mcBelow8Day.toFixed(2));
  // mass balance with no breakdown
  const pvb = Object.assign({}, pvm, { mc_kbio: 0, mc_photo: 1e12 });
  const rb = S.simulate(inp, pvb, { forceKill: 0.8 });
  const expected = rb.MC0 + 0.8 * rb.MCint0;
  const got = rb.rec.MC[rb.rec.MC.length - 1];
  check('toxin mass balance: released = 80% of the cell pool', near(got, expected, 1e-6 * expected), got.toFixed(4) + ' vs ' + expected.toFixed(4));
}

console.log('\nOxygen worked example (instant kill 80% of Chl 100, 1.5 m, 28 °C)');
{
  // near-instant transfer to dead biomass; the living bloom's own oxygen is switched off here so the
  // decay math can be checked against its exact answer (it is tested on its own below)
  const pvo = Object.assign({}, pv, { r_meanmax: 0.4, mc_krel: 400, pmax_chl: 0 });
  for (const [u, expect, tol] of [[2, 4.6, 0.15], [0.5, 3.8, 0.2]]) {
    const inp = Object.assign({}, base, { maxDepthM: 1.5 / 0.4, layering: 'mixed', windMs: u, product: 'copper_sulfate', dose: 0 });
    const r = S.simulate(inp, pvo, { forceKill: 0.8 });
    const numMin = Math.min(...r.rec.DOt);
    // analytic: DO_eq - a/(K - kd) (e^-kd t - e^-K t) at t*
    const K = r.Krea, kd = pv.kd20 * Math.pow(pv.kd_theta, 8), a = pv.rOC * kd * (0.8 * 100 * pv.thetaC / 1000);
    const ts = Math.log(K / kd) / (K - kd);
    const an = r.DOeq - a / (K - kd) * (Math.exp(-kd * ts) - Math.exp(-K * ts));
    check(`numeric DO minimum matches analytic solution (wind ${u} m/s)`, near(numMin, an, 0.05), numMin.toFixed(3) + ' vs ' + an.toFixed(3));
    check(`DO minimum ≈ ${expect} mg/L as in the blueprint (wind ${u} m/s)`, near(numMin, expect, tol), numMin.toFixed(2));
  }
}

console.log('\nThe living bloom\'s own oxygen (added Oct 21, 2026)');
{
  const inp = Object.assign({}, base, { maxDepthM: 1.5 / 0.4, layering: 'mixed', product: 'copper_sulfate', dose: 0 });
  const r = S.simulate(inp, pv), d = r.rec.DOt;
  const day = d.slice(24, 48), lo = Math.min(...day), hi = Math.max(...day), iLo = day.indexOf(lo);
  const clockLo = (inp.appHour + 24 + iLo) % 24;
  check('an untreated bloom makes oxygen swing through the day', hi - lo > 1, `day 2: ${lo.toFixed(1)} to ${hi.toFixed(1)} mg/L`);
  check('the lowest hour comes around dawn', clockLo >= 3 && clockLo <= 9, `lowest at ${clockLo}:00`);
  const killed = S.simulate(inp, pv, { forceKill: 0.95 }), kd3 = killed.rec.DOt.slice(48, 72);
  check('a big knock-down drops the lowest oxygen below the untreated pond\'s pre-dawn low', Math.min(...killed.rec.DOt) < lo - 1, `${Math.min(...killed.rec.DOt).toFixed(2)} vs ${lo.toFixed(2)} mg/L untreated`);
  check('…and the daily swing mostly stops once the bloom stops making oxygen', Math.max(...kd3) - Math.min(...kd3) < 0.3 * (hi - lo), `day 3 swing ${(Math.max(...kd3) - Math.min(...kd3)).toFixed(2)} vs ${(hi - lo).toFixed(2)} mg/L untreated`);
  const s2 = S.bloomO2(100, 0, 1, 0, 1, 25, pv);
  check('no photosynthesis in the dark, breathing goes on', s2.P === 0 && s2.R > 0, `breathing ${s2.R.toFixed(3)} mg/L per hour at 100 µg/L chlorophyll`);
}

console.log('\nPeroxide EC50s calibrated on the lab test that made them (one dose left to fade)');
{
  // simulate the lab test: C = E·exp(-k·t), damage dD/dt = kD (C - D); the calibrated rule must give 50% at T
  const ec = S.TARGET_EC50.h2o2.microcystis, E = ec.v, T = ec.T, kD = pv.kd, k = pv.lab_k;
  for (const structure of ['IT', 'SD']) {
    const kill = S.killFor(ec, Object.assign({}, pv, { kill_struct: structure === 'IT' ? 0.75 : 0.25, ec50_z: 0 }));
    let D = 0, Dmax = 0, H = 0; const dt = 0.001;
    for (let t = 0; t < T; t += dt) { const C = E * Math.exp(-k * (t + dt / 2)); const Dn = C + (D - C) * Math.exp(-kD * dt); if (structure === 'SD') H += kill.bw * Math.max(0, 0.5 * (D + Dn) - kill.z) * dt; D = Dn; Dmax = Math.max(Dmax, D); }
    const K = structure === 'SD' ? 1 - Math.exp(-H) : S.itFraction(Dmax, kill.mw, kill.beta);
    check(`${structure}: the lab pulse at the EC50 knocks down 50% at ${T} h`, near(K, 0.5, 0.005), (100 * K).toFixed(2) + '%');
  }
  const steady = S.calibrateIT(E, T, kD), pulse = S.calibrateITpulse(E, T, kD, k);
  check('a fading lab dose means cells are less tough than a steady-dose reading implies', pulse < 0.6 * steady, `tolerance ${pulse.toFixed(2)} vs ${steady.toFixed(2)} mg/L`);
  // your own peroxide test: a single fading dose, at the half-life you measured; a copper test is steady
  const own = S.ecFor('h2o2', Object.assign({}, base, { myEC50: { v: 1.8, T: 24 }, h2o2HalfLifeH: 3 }));
  const ownKill = S.killFor(own, Object.assign({}, pv, { ec50_z: 0 }));
  check('your own peroxide test is calibrated as a fading dose at your measured half-life', own.pulse === true && near(ownKill.kLab, Math.LN2 / 3, 1e-12), `fade ${ownKill.kLab.toFixed(3)}/h`);
  const ownCu = S.ecFor('cu_sulfate', Object.assign({}, base, { myEC50: { v: 0.12, T: 72 }, h2o2HalfLifeH: 3 }));
  check('your own copper test is calibrated as a steady dose', !ownCu.pulse && S.killFor(ownCu, pv).kLab === undefined);
}

console.log('\nGeometry and layering');
{
  const g = S.geometry(Object.assign({}, base, { maxDepthM: 4, layering: 'auto' }), pv);
  check('1 acre = 4046.856 m²', near(g.A, 4046.856, 1e-6));
  check('4 m deep, 1 acre pond is treated as layered (Holgerson rule)', g.layered === true);
  // the treated layer is the top of the layers model's bowl, A(z) = A0 (1 - z/zmax)^p, not a straight-sided
  // slab (until Nov 8, 2026 this test asserted CF = mean depth ÷ layer depth = 1.6). Volumes by brute-force sum.
  const bowlVol = (zmax, h) => { const p = 1 / pv.r_meanmax - 1, n = 200000; let v = 0; for (let i = 0; i < n; i++) v += Math.pow(1 - (i + 0.5) * (h / n) / zmax, p) * (h / n); return v; };
  check('concentration factor = whole bowl volume ÷ volume of the warm top 1 m (bowl, not slab)', near(g.CF, bowlVol(4, 4) / bowlVol(4, 1), 1e-6), `${g.CF.toFixed(4)} vs ${(bowlVol(4, 4) / bowlVol(4, 1)).toFixed(4)}; the slab gave 1.60`);
  const g3 = S.geometry(Object.assign({}, base, { maxDepthM: 8 / 3.28084, layering: 'auto' }), pv);
  check('a 1 m warm layer deeper than the mean depth is still a layer in an 8 ft bowl', g3.layered === true && near(g3.CF, bowlVol(g3.zmax, g3.zmax) / bowlVol(g3.zmax, 1), 1e-6) && g3.CF > 1.3, `CF ${g3.CF.toFixed(3)}; the slab rule called it fully mixed`);
  const g2 = S.geometry(Object.assign({}, base, { maxDepthM: 1.5, appHour: 8, layering: 'auto' }), pv);
  check('shallow pond in the morning is mixed', g2.layered === false && g2.CF === 1);
  // the layered top water still sits on the bowl's sloping bed: same oxygen balance as the layers model
  const CC = require('../sim-column.js');
  const lay = Object.assign({}, base, { maxDepthM: 3 }), r3 = S.simulate(lay, pv), pv2 = S.centralFrom(CC.ALL_PARAMS);
  const colEq = CC.doEquilibrium(lay.tempC, r3.g.hLayer, CC.column(lay, pv2), lay.windMs, pv2);
  check('layered pond: sediment oxygen demand of the bed the warm layer touches is counted, as in the layers model', r3.g.layered && near(r3.DOeq, colEq, 1e-9) && r3.DOeq < r3.DOsat - 0.3, `${r3.DOeq.toFixed(3)} vs layers model ${colEq.toFixed(3)} mg/L; was ${r3.DOsat.toFixed(2)} (none)`);
}

console.log('\nDiquat binding never overshoots');
{
  const rng = S.mulberry32(99); let worst = 0;
  for (let i = 0; i < 200000; i++) {
    const C = Math.pow(10, -6 + 6 * rng()), b = Math.pow(10, -6 + 6 * rng()), cap = b + Math.pow(10, -6 + 6 * rng()), k = Math.pow(10, -1 + 3 * rng()), dt = Math.pow(10, -3 + 3 * rng());
    worst = Math.min(worst, C - S.diquatSorb(C, b, cap, k, dt));
  }
  check('dissolved diquat never goes below zero after a binding step (200,000 random cases)', worst >= 0, `lowest ${worst}`);
  // the case found on Nov 8, 2026 in the layers model (diquat injected, uncertainty run): C was left at -5.8e-20
  const CC = require('../sim-column.js');
  const colBase = Object.assign({}, base, { product: 'diquat', method: 'inject', grade: null, dose: 0.2, shelter: 'open', sky: 'sunny', airHighC: 32, airLowC: 22, doy: 196 });
  const r = CC.run(colBase, { members: 8, seed: 5 });
  check('…including the layers-model injection run that left −5.8e-20 mg/L', r.ensemble.band.Ctop.p05.every(v => v >= 0), `lowest ${Math.min(...r.ensemble.band.Ctop.p05)}`);
}

console.log('\nUncertainty runs');
{
  const a = S.run(base, { members: 60, seed: 7 }), b = S.run(base, { members: 60, seed: 7 });
  check('same seed gives identical bands', JSON.stringify(a.ensemble.band.K.p50) === JSON.stringify(b.ensemble.band.K.p50));
  let neg = 0;
  for (const prod of Object.keys(S.PRODUCTS)) {
    for (const tg of Object.keys(S.TARGETS)) {
      const inp = Object.assign({}, base, { product: prod, target: tg, dose: S.PRODUCTS[prod].example });
      const r = S.run(inp, { members: 30, seed: 3 });
      for (const k of ['C', 'K', 'MC', 'DOt', 'DOp']) for (const q of ['p05', 'p50', 'p95']) for (const v of r.ensemble.band[k][q]) if (!(v >= 0) || !isFinite(v)) neg++;
    }
  }
  check('no negative or non-finite values in any product × target ensemble', neg === 0, neg + ' bad values');
  const s = S.lhsSamples(200, 11).map(p => p.kd);
  check('Latin-hypercube kD stays inside 0.1-2 /h', Math.min(...s) >= 0.1 && Math.max(...s) <= 2);
}

console.log('\nReview fixes, Oct 22, 2026: copper and water hardness, diquat binding at a rate');
{
  // copper effect levels for animals scale with hardness by the EPA slope; algae don't
  const at = H => S.ntList('cu_sulfate', Object.assign({}, base, { hardness: H }));
  const lab = S.ntList('cu_sulfate', Object.assign({}, base, { hardness: 100 }));
  const soft = at(25), hard = at(250);
  check('fish and water-flea copper levels scale as (hardness ÷ 100)^0.9422; the green alga\'s does not',
    near(soft[1].v / lab[1].v, Math.pow(0.25, 0.9422), 1e-12) && near(hard[2].v / lab[2].v, Math.pow(2.5, 0.9422), 1e-12) && soft[0].v === lab[0].v,
    `water flea ${soft[1].v.toFixed(3)} / ${lab[1].v.toFixed(3)} / ${hard[1].v.toFixed(3)} mg/L at hardness 25 / 100 / 250`);
  check('…at 100 mg/L (the assumed lab water) the lab value is unchanged', near(lab[1].v, 0.216, 1e-12) && near(lab[2].v, 0.317, 1e-12));
  const est = S.ntList('cu_sulfate', Object.assign({}, base, { alk: 40 }))[1];
  check('without a hardness reading, hardness is taken as the alkalinity', est.hardnessEstimated && near(est.hardness, 40, 1e-12));
  check('the rule is held at 400 mg/L, as the EPA regulation does', near(at(1000)[1].v, at(400)[1].v, 1e-12));
  const softRun = S.run(Object.assign({}, base, { product: 'copper_sulfate', dose: 0.5, alk: 20 }), { members: 0 });
  check('soft water gets a warning for copper', softRun.warnings.some(w => w.id === 'cu-soft'));
  // diquat binding: the exact step does not depend on the step length and ends at the smaller of dose and room
  let C = 1, b = 0; for (let i = 0; i < 100; i++) { const d = S.diquatSorb(C, b, 2, 6, 0.01); C -= d; b += d; }
  check('diquat binding: 100 short steps give the same as one long one', near(b, S.diquatSorb(1, 0, 2, 6, 1), 1e-12), b.toFixed(9));
  check('…and it binds all of it when there is room, or fills the room when there isn\'t', near(S.diquatSorb(1, 0, 2, 6, 100), 1, 1e-9) && near(S.diquatSorb(3, 0, 2, 6, 100), 2, 1e-9));
  const dq = S.simulate(Object.assign({}, base, { product: 'diquat', dose: 0.2, ntu: 5 }), pv);
  check('well-mixed diquat is bound over minutes to hours, not all at once', dq.rec.C[0] === dq.Cmix && dq.rec.C[1] < 0.6 * dq.Cmix && dq.rec.C[1] > dq.rec.C[3], `${dq.rec.C[0].toFixed(3)} → ${dq.rec.C[1].toFixed(3)} → ${dq.rec.C[3].toFixed(3)} mg/L over 3 h`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

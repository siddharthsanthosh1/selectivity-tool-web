// Runs a fixed set of scenarios through sim-core.js (central settings, no uncertainty)
// and saves every 6th hourly value, so the Python reference can be compared against it.
// Regenerate after changing the model or params: node tests/make-port-fixture.js
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('../sim-core.js');

const base = {
  areaAcres: 1, maxDepthM: 1.83, tempC: 28, pH: 8, alk: 40, ntu: 10, turbCause: 'mineral', clay: 'typical',
  chl: 100, target: 'microcystis', toxin: 'typical', history: false, windMs: 2, product: 'h2o2_liquid',
  dose: 3, fraction: 1, appHour: 8, layering: 'auto'
};
const scenarios = [];
for (const product of Object.keys(S.PRODUCTS)) {
  for (const target of Object.keys(S.TARGETS)) {
    scenarios.push({ name: `${product} × ${target}`, inp: Object.assign({}, base, { product, target, dose: S.PRODUCTS[product].example }) });
  }
}
const v = (name, o, opts) => scenarios.push({ name, inp: Object.assign({}, base, o), opts: opts || {} });
v('layered 4 m pond, afternoon, peroxide', { maxDepthM: 4, appHour: 15, windMs: 1 });
v('third of the pond, copper', { product: 'copper_sulfate', dose: 0.5, fraction: 1 / 3 });
v('granules in soft water', { product: 'h2o2_granular', alk: 15, chl: 300 });
v('copper in hard water, cool', { product: 'copper_chelated', dose: 1, alk: 120, tempC: 18, target: 'planktothrix' });
v('diquat in bentonite water', { product: 'diquat', dose: 0.3, ntu: 25, clay: 'swelling' });
v('diquat with algal turbidity', { product: 'diquat', dose: 0.3, ntu: 25, turbCause: 'algae' });
v('endothall, cool water', { product: 'endothall', dose: 2, tempC: 16, target: 'anabaena' });
v('flumioxazin, afternoon, dense soft bloom', { product: 'flumioxazin', dose: 300, appHour: 14, chl: 400, alk: 25, target: 'anabaena' });
v('worst-case toxin, bloom history', { toxin: 'worst', history: true, chl: 1000 });
v('instant 80% kill (oxygen and toxin check)', { maxDepthM: 3.75, layering: 'mixed' }, { forceKill: 0.8 });
v('overcast, measured Secchi, May', { sky: 'overcast', secchiM: 0.4, doy: 140, product: 'copper_sulfate', dose: 0.5 });
v('your measurements: depth, peroxide half-life, own EC50, toxin', { meanDepthM: 1.2, h2o2HalfLifeH: 5, myEC50: { v: 1.8, T: 24 }, mcMeasured: 30 });
v('own copper EC50 (steady test), partly cloudy', { product: 'copper_sulfate', dose: 0.5, myEC50: { v: 0.12, T: 72 }, sky: 'partly' });
// hourly sunlight as if downloaded: a clear day, then cloudier days (deterministic)
const sw = []; for (let h = 0; h < 24 * 18; h++) { const c = h % 24, e = c > 6.5 && c < 19.5 ? Math.sin(Math.PI * (c - 6.5) / 13) : 0; sw.push(Math.round(820 * e * (h < 72 ? 1 : 0.55 + 0.3 * Math.sin(h * 0.37) ** 2))); }
v('hourly sunlight from weather, quarter of the pond', { weather: { sw }, fraction: 0.25, dose: 3 });

const out = scenarios.map(sc => {
  const r = S.simulate(sc.inp, S.central(), sc.opts || {});
  const pick = a => a.filter((_, i) => i % 6 === 0);
  return { name: sc.name, inp: sc.inp, forceKill: (sc.opts || {}).forceKill == null ? null : sc.opts.forceKill,
    rec: { hours: pick(r.rec.hours), C: pick(r.rec.C), pH: pick(r.rec.pH), K: pick(r.rec.K), MC: pick(r.rec.MC), MCall: pick(r.rec.MCall), DOt: pick(r.rec.DOt), DOp: pick(r.rec.DOp) } };
});
const file = path.join(__dirname, 'port-fixture.json');
fs.writeFileSync(file, JSON.stringify({ version: S.VERSION, paramsVersion: S.PARAMS_VERSION, scenarios: out }));
console.log(`wrote ${out.length} scenarios to ${file}`);

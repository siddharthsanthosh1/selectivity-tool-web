"""Port-equivalence test: the Python reference must reproduce sim-core.js.
Run from the simulator folder:  python3 tests/test_reference.py
(Regenerate the fixture first if you changed the model: node tests/make-port-fixture.js)
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'reference'))
import sim  # noqa: E402

with open(os.path.join(HERE, 'port-fixture.json')) as fh:
    fixture = json.load(fh)

REL, ABS = 1e-8, 1e-10
worst = 0.0
failures = 0
for sc in fixture['scenarios']:
    r = sim.simulate(sc['inp'], force_kill=sc['forceKill'])
    rec = {k: [v for i, v in enumerate(r['rec'][k]) if i % 6 == 0] for k in sc['rec']}
    bad = []
    for key, js_vals in sc['rec'].items():
        py_vals = rec[key]
        if len(py_vals) != len(js_vals):
            bad.append(f'{key}: length {len(py_vals)} vs {len(js_vals)}')
            continue
        for a, b in zip(py_vals, js_vals):
            err = abs(a - b)
            scale = max(abs(a), abs(b))
            rel = err / scale if scale > 0 else 0.0
            if scale > ABS:                      # values smaller than ABS are rounding noise
                worst = max(worst, rel)
            if err > ABS and rel > REL:
                bad.append(f'{key}: python {a} vs js {b}')
                break
    status = 'pass' if not bad else 'FAIL'
    if bad:
        failures += 1
    print(f'  {status}  {sc["name"]}' + ('' if not bad else '  -> ' + '; '.join(bad)))

# Independent re-checks of blueprint numbers in Python
pv = sim.central()
checks = [
    ('flumioxazin half-life pH 7 ≈ 23.8 h', abs(math.log(2) / sim.flum_rate(7, pv) - 23.8) < 0.1),
    ('granules: alkalinity 20, pH 7.5 → 9.34', abs(sim.ph_after_granules(7.5, 20, 5, pv) - 9.34) < 0.02),
    ('peroxide half-life Chl 200, 20 °C ≈ 1.7 h', abs(math.log(2) / sim.h2o2_rate(20, 200, pv) - 1.7) < 0.03),
]
for name, ok in checks:
    print(f'  {"pass" if ok else "FAIL"}  {name}')
    failures += 0 if ok else 1

print(f'\n{len(fixture["scenarios"])} scenarios compared; worst relative difference {worst:.1e}; {failures} failure(s)')
sys.exit(1 if failures else 0)

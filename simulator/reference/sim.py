"""
CyanoSelect pond-treatment simulator, Phase 1 -- Python reference implementation.

Same equations as sim-core.js, written independently, reading every number from
../params.json (exported from sim-core.js). It runs the central (no-uncertainty)
case only and exists to cross-check the browser code: tests/test_reference.py
compares the two hour by hour.

Outputs are MODEL PREDICTIONS, not measurements and not treatment recommendations.
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, '..', 'params.json')) as fh:
    DATA = json.load(fh)

PARAMS = DATA['params']
PRODUCTS = DATA['products']
TARGET_EC50 = DATA['targetEC50']
DT_H = DATA['dtHours']
RUN_DAYS = DATA['runDays']
REC_EVERY = DATA['recEvery']
ACRE_M2 = 4046.856
LN2 = math.log(2)


def central():
    return {k: p['v'] for k, p in PARAMS.items()}


# ---------------------------------------------------------------- helpers
def do_sat(t):
    tk = (t + 273.15) / 100
    c = -173.4292 + 249.6339 * (100 / (t + 273.15)) + 143.3483 * math.log(tk) - 21.8492 * tk
    return 1.42763 * math.exp(c)


def sc_o2(t):
    return 1745.1 - 124.34 * t + 4.8055 * t ** 2 - 0.10115 * t ** 3 + 0.00086842 * t ** 4


def reaeration(u10, t, z, pv):
    n = 2 / 3 if u10 < 3.7 else 0.5
    k600 = pv['k600_a'] + pv['k600_b'] * max(0.0, u10) ** pv['k600_c']
    ko2 = k600 * (sc_o2(t) / 600) ** (-n)
    return ko2 * 0.24 / z


def _alpha(ph, pv):
    h = 10 ** (-ph)
    k1 = 10 ** (-pv['pK1'])
    k2 = 10 ** (-pv['pK2'])
    den = h * h + k1 * h + k1 * k2
    return h, k1 * h / den, k1 * k2 / den


def carb_alk(ph, dic, pv):
    h, a1, a2 = _alpha(ph, pv)
    return dic * (a1 + 2 * a2) + 1e-14 / h - h


def dic_from_alk_ph(alk_eq, ph, pv):
    h, a1, a2 = _alpha(ph, pv)
    return (alk_eq - 1e-14 / h + h) / (a1 + 2 * a2)


def ph_from_alk_dic(alk_eq, dic, pv):
    lo, hi = 3.0, 13.0
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if carb_alk(mid, dic, pv) > alk_eq:
            hi = mid
        else:
            lo = mid
    return 0.5 * (lo + hi)


def ph_after_granules(ph0, alk_mgl, c, pv):
    alk0 = alk_mgl / 50000
    dic0 = dic_from_alk_ph(alk0, ph0, pv)
    alk1 = alk0 + pv['perc_alk'] * c / 50000
    dic1 = dic0 + pv['perc_dic'] * c / 1000
    return ph_from_alk_dic(alk1, dic1, pv)


def ph_amplitude(chl, alk, pv):
    if chl < 10:
        return pv['ph_amp_low']
    if chl < 100:
        return pv['ph_amp_mod']
    return pv['ph_amp_soft'] if alk < 50 else pv['ph_amp_hard']


def swing(hour, pv):
    x = (hour - pv['sunrise']) / pv['daylength']
    if x <= 0 or x >= 1:
        return 0.0
    return math.sqrt(math.sin(math.pi * x))


def h2o2_rate(t, chl, pv):
    return pv['h2o2_theta'] ** (t - 20) * (pv['h2o2_kab'] + pv['h2o2_b'] * chl)


def flum_rate(ph, pv):
    return pv['fl_k0'] + pv['fl_koh'] * 10 ** (ph - 14)


def copper_rate(t, alk, pv):
    in_range = 78 <= alk <= 132
    a = min(132, max(78, alk))
    mult = 0.85 + 0.3 * pv['cu_u'] if in_range else 0.5 + 1.0 * pv['cu_u']
    return (pv['cu_k78'] + pv['cu_alkslope'] * (a - 78)) * pv['cu_theta'] ** (t - 26.8) * mult


def diquat_capacity(ntu, cause, clay, pv):
    if cause != 'mineral':
        return 0.0
    tss = pv['dq_tss'] * ntu
    cec = pv['dq_cec_typ'] if clay == 'typical' else pv['dq_cec_swell'] if clay == 'swelling' else pv['dq_cec_unk']
    return tss / 1000 * cec * pv['dq_mgmeq']


def diquat_sorb(c, b, cap, k, dt_h):
    # clay taking up diquat: db/dt = k c (1 - b/cap) with c + b fixed over the step, solved exactly
    if not c > 0 or not cap > b or not k > 0 or not dt_h > 0:
        return 0.0
    t = c + b
    if not t - b > 0:
        return 0.0
    a = k / cap
    d = cap - t
    if abs(d) < 1e-9 * cap:
        y0 = t - b
        bn = t - y0 / (1 + a * y0 * dt_h)
    else:
        r = (cap - b) / (t - b) * math.exp(a * d * dt_h)
        bn = (r * t - cap) / (r - 1)
    if not math.isfinite(bn):
        bn = min(t, cap)
    bn = min(max(bn, b), min(t, cap))
    return min(bn - b, c)   # t - b can exceed c by one rounding step; never bind more than is dissolved


def calibrate_sd(e, t_test, kd, z):
    if z >= e:
        z = 0.5 * e
    t0 = -math.log(1 - z / e) / kd
    if t0 >= 0.9 * t_test:
        z, t0 = 0.0, 0.0
    integral = (e - z) * (t_test - t0) - (e / kd) * (math.exp(-kd * t0) - math.exp(-kd * t_test))
    return LN2 / integral, z


def calibrate_it(e, t_test, kd):
    return e * (1 - math.exp(-kd * t_test))


def it_fraction(dmax, mw, beta):
    return 0.0 if dmax <= 0 else 1 / (1 + (mw / dmax) ** beta)


def pulse_damage(e, kd, k, t):
    # damage under a lab dose that starts at e and fades as e*exp(-k t)
    if abs(kd - k) < 1e-9 * max(kd, k):
        return e * kd * t * math.exp(-kd * t)
    return e * kd / (kd - k) * (math.exp(-k * t) - math.exp(-kd * t))


def calibrate_it_pulse(e, t_test, kd, k):
    if not k > 0:
        return calibrate_it(e, t_test, kd)
    tp = 1 / kd if abs(kd - k) < 1e-9 * max(kd, k) else math.log(kd / k) / (kd - k)
    if not tp > 0 or tp > t_test:
        tp = t_test
    return pulse_damage(e, kd, k, tp)


def calibrate_sd_pulse(e, t_test, kd, k, z_frac):
    if not k > 0:
        return calibrate_sd(e, t_test, kd, z_frac * e)
    dpk = calibrate_it_pulse(e, t_test, kd, k)
    n = 2000
    h = t_test / n

    def area(z):
        tot = 0.0
        for i in range(n + 1):
            w = 0.5 if i in (0, n) else 1.0
            tot += w * max(0.0, pulse_damage(e, kd, k, i * h) - z)
        return tot * h
    z = z_frac * dpk
    a = area(z)
    if not a > 0:
        z = 0.0
        a = area(0.0)
    return LN2 / a, z


def kill_rule(ec, pv):
    e = ec['v'] * 10 ** (pv['ec50_sd'] * pv['ec50_z'])
    structure = 'SD' if pv['kill_struct'] < 0.5 else 'IT'
    if ec.get('pulse'):
        k_lab = ec['labK'] if ec.get('labK') else pv['lab_k']
        bw, z = calibrate_sd_pulse(e, ec['T'], pv['kd'], k_lab, pv['z_frac'])
        mw = calibrate_it_pulse(e, ec['T'], pv['kd'], k_lab)
    else:
        bw, z = calibrate_sd(e, ec['T'], pv['kd'], pv['z_frac'] * e)
        mw = calibrate_it(e, ec['T'], pv['kd'])
    return {'E': e, 'T': ec['T'], 'kD': pv['kd'], 'z': z, 'bw': bw, 'structure': structure,
            'beta': pv['it_beta'], 'mw': mw}


# ---------------------------------------------------------------- light and the bloom's oxygen
LAT_DEG = 35.73


def sun_sin(clock_h, doy):
    decl = math.radians(23.44) * math.sin(2 * math.pi * (284 + doy) / 365)
    hour_angle = math.radians((clock_h - 1.33 - 12) * 15)
    phi = math.radians(LAT_DEG)
    return math.sin(phi) * math.sin(decl) + math.cos(phi) * math.cos(decl) * math.cos(hour_angle)


def clear_sky(sin_el):
    return 1098 * sin_el * math.exp(-0.057 / sin_el) if sin_el > 0.01 else 0.0


def secchi_carlson(chl):
    return math.exp((60 - (9.81 * math.log(max(chl, 0.5)) + 30.6)) / 14.41)


def light_frac(i0, kd, z1, z2, ik):
    if not i0 > 0:
        return 0.0
    if not kd * (z2 - z1) > 1e-6:
        i = i0 * math.exp(-kd * z1)
        return i / (i + ik)
    return math.log((i0 * math.exp(-kd * z1) + ik) / (i0 * math.exp(-kd * z2) + ik)) / (kd * (z2 - z1))


def bloom_o2(chl_live, i0, kd, z1, z2, tc, pv):
    # gross photosynthesis and breathing of the living bloom, mg O2/L/h
    if not chl_live > 0:
        return 0.0, 0.0
    pm = pv['pmax_chl'] * pv['met_theta'] ** (tc - 25) * chl_live / 1000
    return pm * light_frac(i0, kd, z1, z2, pv['ik_sw']) * pv['pq'] * 32 / 12, pv['resp_frac'] * pm * 32 / 12


# ---------------------------------------------------------------- the user's own measurements
def with_measured(inp, pv):
    q = dict(pv)
    if (inp.get('meanDepthM') or 0) > 0 and inp['maxDepthM'] > 0:
        q['r_meanmax'] = min(0.85, max(0.2, inp['meanDepthM'] / inp['maxDepthM']))
    if (inp.get('h2o2HalfLifeH') or 0) > 0:
        q['h2o2_b'] = 0.0
        q['h2o2_kab'] = (LN2 / inp['h2o2HalfLifeH']) / q['h2o2_theta'] ** (inp['tempC'] - 20)
    own = inp.get('myEC50')
    if own and own.get('v', 0) > 0:
        q['ec50_sd'] = min(q['ec50_sd'], 0.1)
    return q


def ec_for(chem, inp):
    own = inp.get('myEC50')
    if own and own.get('v', 0) > 0:
        half = inp.get('h2o2HalfLifeH') or 0
        return {'v': own['v'], 'T': own['T'] if own.get('T', 0) > 0 else 24, 'pulse': chem == 'h2o2',
                'labK': LN2 / half if chem == 'h2o2' and half > 0 else None}
    return TARGET_EC50[chem][inp['target']]


def toxin_ratio(inp, pv):
    if (inp.get('mcMeasured') or 0) > 0 and inp['chl'] > 0:
        return inp['mcMeasured'] / inp['chl']
    return pv['mc_low'] if inp['toxin'] == 'low' else pv['mc_worst'] if inp['toxin'] == 'worst' else pv['mc_typ']


def hill(c, e, b):
    return 0.0 if c <= 0 else 1 / (1 + (e / c) ** b)


def geometry(inp, pv):
    area = inp['areaAcres'] * ACRE_M2
    zmax = inp['maxDepthM']
    zmean = pv['r_meanmax'] * zmax
    area_ha = area / 1e4
    if inp['layering'] == 'mixed':
        layered = False
    elif inp['layering'] == 'layered':
        layered = True
    elif zmax > pv['strat_depth'] and area_ha < pv['strat_area']:
        layered = True
    elif zmax <= pv['strat_depth'] and inp['appHour'] >= 12 and inp['windMs'] < 3:
        layered = True
    else:
        layered = False
    # bowl, as in the layers model (fixed Nov 8, 2026; it was a straight-sided slab)
    p = 1 / pv['r_meanmax'] - 1
    h_layer = min(pv['h_mix'], zmax) if layered else zmax
    if h_layer >= zmax:
        layered, h_layer = False, zmax
    share = 1 - (1 - h_layer / zmax) ** (p + 1) if layered else 1.0
    f_sed = 1 - (1 - h_layer / zmax) ** p if layered else 1.0
    return {'A': area, 'zmean': zmean, 'zLayer': zmean * share, 'hLayer': h_layer, 'fSed': f_sed,
            'layered': layered, 'CF': 1 / share}


# ---------------------------------------------------------------- model
def simulate(inp, pv=None, force_kill=None):
    pv = with_measured(inp, pv or central())
    prod = PRODUCTS[inp['product']]
    chem = prod['chem']
    g = geometry(inp, pv)
    temp, chl, frac = inp['tempC'], inp['chl'], inp['fraction']
    cmix = inp['dose'] * prod['toMgL'] * g['CF']

    amp = ph_amplitude(chl, inp['alk'], pv)
    ph_base = ph_after_granules(inp['pH'], inp['alk'], cmix, pv) if prod.get('granular') else inp['pH']

    c, kconst, dinst, bound = cmix, 0.0, 0.0, 0.0
    if chem == 'h2o2':
        dinst = min(cmix, pv['h2o2_dinst'])
        c = cmix - dinst
        kconst = h2o2_rate(temp, chl, pv)
    elif chem == 'cu_sulfate':
        kconst = copper_rate(temp, inp['alk'], pv) / 24
    elif chem == 'cu_chelated':
        kconst = pv['cuchel_k'] / 24
    elif chem == 'diquat':
        kconst = pv['dq_kwc'] / 24
    dq_room = diquat_capacity(inp['ntu'], inp['turbCause'], inp['clay'], pv) * pv['dq_access'] if chem == 'diquat' else 0.0

    ec = ec_for(chem, inp)
    kill = None
    if not ec.get('none') and force_kill is None:
        kill = kill_rule(ec, pv)

    ratio = toxin_ratio(inp, pv)
    mc_tot = ratio * chl
    mc0 = pv['mc_fext'] * mc_tot
    mc_int0 = mc_tot - mc0
    lag_h = 0 if inp['history'] else pv['mc_lag'] * 24
    k_photo_h = LN2 / (pv['mc_photo'] * g['zLayer']) / 24

    sat = do_sat(temp)
    sod_v = g['fSed'] * pv['sod20'] * pv['sod_theta'] ** (temp - 20) / g['zLayer']
    krea = reaeration(inp['windMs'], temp, g['zLayer'], pv)
    do_eq = max(0.0, sat - sod_v / krea)
    kd_dead = pv['kd20'] * pv['kd_theta'] ** (temp - 20)
    carbon_per_kill = pv['thetaC'] * chl / 1000

    # sunlight reaching the bloom: hourly weather if given, else clear sky times the sky choice
    sky = {'overcast': 0.35, 'partly': 0.7}.get(inp.get('sky'), 1.0)
    if (inp.get('secchiM') or 0) > 0:
        kd_light = 1.7 / inp['secchiM']
    else:
        kd_light = 1.7 / secchi_carlson(chl) + (0.1 * inp['ntu'] if inp['turbCause'] == 'mineral' else 0.0)
    wx = inp.get('weather')
    sw = wx['sw'] if wx and wx.get('sw') and len(wx['sw']) > 24 else None

    def sun(t):
        if sw:
            x = 48 + inp['appHour'] + t + 0.5
            i = max(0, min(len(sw) - 2, math.floor(x)))
            return max(0.0, sw[i] + (sw[i + 1] - sw[i]) * max(0.0, min(1.0, x - i)))
        return sky * clear_sky(sun_sin((inp['appHour'] + t) % 24, inp.get('doy') or 196))

    # other breathing in the pond balances what the untreated bloom makes over a day
    made = sum(bloom_o2(chl, sun(q * 0.25), kd_light, 0, g['zLayer'], temp, pv)[0] * 0.25 for q in range(96))
    r_other = max(0.0, made / 24 - bloom_o2(chl, 0, kd_light, 0, g['zLayer'], temp, pv)[1])

    d = dmax = h_haz = k_frac = y = cdead = 0.0
    mc = mc0
    deficit = -pv['h2o2_o2'] * dinst if chem == 'h2o2' else 0.0
    deficit_u = 0.0
    int_c = 0.0
    c_peak = c
    krel_h = pv['mc_krel'] / 24

    rec = {k: [] for k in ('hours', 'C', 'pH', 'K', 'MC', 'MCall', 'DOt', 'DOp')}

    def ph_at(t):
        return min(pv['ph_cap'], ph_base + amp * swing((inp['appHour'] + t) % 24, pv))

    def record(t):
        rec['hours'].append(t)
        rec['C'].append(c)
        rec['pH'].append(ph_at(t))
        rec['K'].append(k_frac)
        rec['MC'].append(mc)
        rec['MCall'].append(mc + mc_int0 * max(0.0, 1 - (k_frac - y)))
        rec['DOt'].append(max(0.0, do_eq - deficit))
        rec['DOp'].append(max(0.0, do_eq - (frac * deficit + (1 - frac) * deficit_u)))

    record(0.0)
    n_steps = round(RUN_DAYS * 24 / DT_H)
    for i in range(n_steps):
        t = i * DT_H
        tm = t + 0.5 * DT_H
        k = kconst
        if chem == 'flumioxazin':
            k = flum_rate(ph_at(tm), pv)
        elif chem == 'endothall':
            k = (pv['en_kslow'] if tm < pv['en_lag'] * 24 else pv['en_kbio'] * pv['en_theta'] ** (temp - 20)) / 24
        if dq_room > 0:
            db = diquat_sorb(c, bound, dq_room, pv['dq_ksorb'], DT_H)
            c -= db
            bound += db
        c_prev = c
        c = c_prev * math.exp(-k * DT_H)
        decayed = c_prev - c
        c_avg = 0.5 * (c_prev + c)
        int_c += c_avg * DT_H

        dk = 0.0
        if force_kill is not None:
            if i == 0:
                dk = force_kill
                k_frac = force_kill
        elif kill:
            dn = c_avg + (d - c_avg) * math.exp(-kill['kD'] * DT_H)
            if kill['structure'] == 'SD':
                h_haz += kill['bw'] * max(0.0, 0.5 * (d + dn) - kill['z']) * DT_H
                kn = 1 - math.exp(-h_haz)
            else:
                if dn > dmax:
                    dmax = dn
                kn = it_fraction(dmax, kill['mw'], kill['beta'])
            d = dn
            dk = max(0.0, kn - k_frac)
            k_frac = max(k_frac, kn)

        rel = krel_h * y * DT_H
        y += dk - rel
        cu_factor = pv['mc_cu_slow'] if chem in ('cu_sulfate', 'cu_chelated') and c > 1 else 1.0
        kbio_h = pv['mc_kbio'] / 24 * cu_factor if t >= lag_h else 0.0
        mc += rel * mc_int0 - (kbio_h + k_photo_h) * mc * DT_H
        cdead += rel * carbon_per_kill - kd_dead / 24 * cdead * DT_H
        light = sun(tm)
        p_t, r_t = bloom_o2(chl * max(0.0, 1 - k_frac), light, kd_light, 0, g['zLayer'], temp, pv)
        p_u, r_u = bloom_o2(chl, light, kd_light, 0, g['zLayer'], temp, pv)
        deficit += (pv['rOC'] * kd_dead / 24 * cdead + r_t + r_other * (1 - pv['ro_live'] * k_frac) - p_t
                    - krea / 24 * deficit) * DT_H
        deficit_u += (r_u + r_other - p_u - krea / 24 * deficit_u) * DT_H
        if chem == 'h2o2':
            deficit -= pv['h2o2_o2'] * decayed
        c_peak = max(c_peak, c)
        if (i + 1) % REC_EVERY == 0:
            record(t + DT_H)

    return {'rec': rec, 'g': g, 'Cpeak': c_peak, 'intC': int_c, 'kill': kill, 'ec': ec,
            'MC0': mc0, 'MCint0': mc_int0, 'DOeq': do_eq, 'Krea': krea, 'pHbase': ph_base}


def summarize(run):
    r = run['rec']
    i_pk = max(range(len(r['MC'])), key=lambda i: r['MC'][i])
    out = {'Cpeak': run['Cpeak'], 'mcPeak': r['MC'][i_pk], 'mcPeakDay': r['hours'][i_pk] / 24,
           'doMin': min(r['DOt']), 'doMinPond': min(r['DOp'])}
    if r['MC'][i_pk] < 8:
        out['mcBelow8Day'] = 0.0
    else:
        idx = next((i for i in range(i_pk, len(r['MC'])) if r['MC'][i] < 8), None)
        out['mcBelow8Day'] = None if idx is None else r['hours'][idx] / 24
    if run['kill']:
        at = lambda h: r['K'][min(len(r['K']) - 1, int(round(h)))]
        out['kill'] = {'atTest': at(run['kill']['T']), 'at48': at(48), 'at7d': at(168), 'end': r['K'][-1]}
    return out


if __name__ == '__main__':
    example = {'areaAcres': 1, 'maxDepthM': 1.83, 'tempC': 28, 'pH': 8, 'alk': 40, 'ntu': 10,
               'turbCause': 'mineral', 'clay': 'typical', 'chl': 100, 'target': 'microcystis',
               'toxin': 'typical', 'history': False, 'windMs': 2, 'product': 'h2o2_liquid',
               'dose': 3, 'fraction': 1, 'appHour': 8, 'layering': 'auto'}
    s = summarize(simulate(example))
    print('Example (model prediction, central settings):')
    for k, v in s.items():
        print(f'  {k}: {v}')

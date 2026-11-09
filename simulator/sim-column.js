/*
 * CyanoSelect pond-treatment simulator, Phase 2 (layered pond column)
 * --------------------------------------------------------------------------
 * A 1-D vertical model of the treated part of the pond, following the blueprint:
 *   - water temperature from a surface heat budget (sun, air, wind, evaporation, longwave)
 *     with convective overturning at night and wind mixing in the warm top layer; the stirred
 *     depth is what the wind-energy balance and convection actually mix (changed Oct 20, 2026 from
 *     a density-gradient cutoff, which stirred away the layering of deep ponds even in calm air)
 *   - a bowl-shaped pond (area shrinks with depth), consistent with Phase 1's mean:max depth
 *   - where the product starts: spray in the top few cm, a dense hose injection that pools
 *     deep or at the thermocline, or crystals/granules that dissolve while sinking and on the bed
 *   - floating Microcystis colonies (Stokes rise speed vs mixing), mixed Planktothrix
 *   - per-layer chemistry (same loss laws as Phase 1, with local temperature, pH and chlorophyll)
 *   - kill driven by the concentration the cells actually sit in (contact-weighted exposure)
 *   - toxin and oxygen-deficit per layer, mixed vertically
 *
 * Depends on sim-core.js (window.CyanoSim or require). Outputs are MODEL PREDICTIONS.
 * Sideways spreading is in sim-2d.js (map and side slice). Not modeled yet: bottom-water oxygen, ballast-driven daily
 * colony migration, inflows.
 */
(function (root) {
  'use strict';
  const S = (typeof module !== 'undefined' && module.exports) ? require('./sim-core.js') : root.CyanoSim;

  const VERSION = '0.2.0-phase2';
  const DT = 300;              // s (5 minutes; 10 minutes until Nov 8, 2026, which moved the example's central knock-down by 2.7 points)
  const SPIN_DAYS = 2;         // spin-up before the treatment day
  const RUN_DAYS = 14;
  const G = 9.81, RHO0 = 1000, CP = 4186, SIGMA = 5.67e-8, KAPPA = 0.41;
  const ACRE_M2 = 4046.856;

  const SRC2 = {
    guseva2023: { label: 'Guseva et al. 2023, JGR Atmospheres (lake drag and heat transfer coefficients)', url: 'https://kluedo.ub.rptu.de/files/8828/1010292022JD037219.pdf' },
    hipsey2019: { label: 'Hipsey et al. 2019, GLM 3.0 (surface heat budget pieces)', url: 'https://gmd.copernicus.org/articles/12/473/2019/gmd-12-473-2019.pdf' },
    holgerson2022: S.SRC.holgerson2022,
    markfort2010: { label: 'Markfort, Porté-Agel & Stefan 2010, Water Resources Research 46, W03530 (shoreline trees cut the wind stress for about 50 canopy heights downwind)', url: 'https://infoscience.epfl.ch/record/146727' },
    hondzo1992: { label: 'Hondzo & Stefan 1992 (vertical mixing regression)', url: 'https://conservancy.umn.edu/bitstream/handle/11299/108660/pr329.pdf?sequence=1' },
    langscavia1986: { label: 'Lang & Scavia 1987 (molecular heat diffusivity floor)', url: 'https://repository.library.noaa.gov/view/noaa/11223/noaa_11223_DS1.pdf' },
    lorke2005: { label: 'Lorke & Wüest 2005 (wind-mixed layer)', url: 'https://www.literature.wolkersdorfer.info/literature/Turbulence%20and%20mixing%20regimes%20specific%20to%20lakes.pdf' },
    haurwitz: { label: 'Haurwitz 1945 clear-sky solar model (standard formula, not re-read in this build)', url: 'https://doi.org/10.1175/1520-0469(1945)002%3C0154:IOTAS%3E2.0.CO;2' },
    brutsaert: { label: 'Brutsaert 1975 clear-sky longwave emissivity (standard formula, not re-read in this build)', url: 'https://doi.org/10.1029/WR011i005p00742' },
    carlson1977: { label: 'Carlson 1977 trophic state index (Secchi from chlorophyll; standard formula, not re-read)', url: 'https://doi.org/10.4319/lo.1977.22.2.0361' },
    ferguson2004: { label: 'Ferguson & Church 2004 settling law (via implementation notebook)', url: 'https://nbviewer.jupyter.org/github/zsylvester/notebooks/blob/master/grain_settling.ipynb' },
    ranzmarshall: { label: 'Ranz & Marshall 1952 falling-sphere mass transfer (standard correlation, not re-checked)', url: '' },
    copperSulfate: { label: 'Copper sulfate pentahydrate: density 2.286 g/cm³; solubility (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Copper(II)_sulfate' },
    usdaPerc: { label: 'USDA 2014 Technical Report, sodium carbonate peroxyhydrate', url: 'https://www.ams.usda.gov/sites/default/files/media/Sodium%20Carbonate%20Peroxyhydrate%20TR%202014.pdf' },
    chemone: { label: 'Chem One copper sulfate grade sheets (Fine 30, Fine 20, Medium)', url: 'https://www.chemone.com/wp-content/uploads/2018/03/cs30aa50l40.pdf' },
    zhao2017: { label: 'Zhao et al. 2017, J. Limnology (Microcystis colony density)', url: 'https://jlimnol.it/jlimnol/article/download/jlimnol.2016.1501/1234/9905' },
    huisman2004: { label: 'Huisman et al. 2004, Ecology (mixing vs flotation)', url: 'https://sitesreservoirproject.riptideweb.com/references/REF23/Volume%201/Ch06_Surface_H2O_Qual/Huisman_etal_2004_ChangesTurbulentMixingCompetition.pdf' },
    matthijs2012: { label: 'Matthijs et al. 2012, Water Research (Planktothrix spread through the column)', url: 'https://dare.uva.nl/id/e1f3427b-3a96-49cb-8442-52968ac7d94a' },
    wu1975: { label: 'Wu 1975 (surface drift)', url: 'https://data-ww3.ifremer.fr/BIB/Wu_JFM1975.pdf' },
    blueprint: S.SRC.blueprint
  };

  // Phase 2 parameters (same format as sim-core PARAMS)
  const PARAMS2 = {
    albedo:      { v: 0.07, units: '', status: 'ESTIMATE', src: 'hipsey2019', note: 'Typical open-water shortwave albedo.' },
    eps_w:       { v: 0.985, units: '', status: 'SOURCED', src: 'hipsey2019', note: 'Water longwave emissivity used by GLM.' },
    C_H:         { v: 1.3e-3, units: '', status: 'SOURCED', src: 'guseva2023', note: 'Heat transfer coefficient in strong wind. It rises in light wind as 1.3e-3 × (1 + 1.5·e^(−0.8U)), the lake fit in Guseva et al. 2023 (Table 1). Until Oct 22, 2026 the strong-wind value was used at every wind speed, which made a calm pond lose heat too slowly.' },
    C_E:         { v: 1.1e-3, units: '', status: 'SOURCED', src: 'guseva2023', note: 'Evaporation transfer coefficient in strong wind; rises in light wind as 1.1e-3 × (1 + e^(−U)) (Guseva et al. 2023, Table 1).' },
    f_free:      { v: 1.0, lo: 0.5, hi: 2.0, dist: 'log', sample: true, units: '', status: 'ESTIMATE', src: 'hipsey2019', note: 'Roughness factor f0 in the calm-air (free convection) heat and evaporation formula GLM uses (from TVA 1972). GLM leaves it to the user; 1 is the smooth-surface value. Matters on calm nights, when warm water heats the air above it and it rises.' },
    rh:          { v: 0.70, lo: 0.55, hi: 0.85, dist: 'uniform', sample: true, units: 'fraction', status: 'ESTIMATE', src: 'blueprint', note: 'Relative humidity (NC summer).' },
    cloud_sw:    { v: 0.75, lo: 0.6, hi: 0.9, dist: 'uniform', sample: true, units: 'share of clear-sky sunlight on a sunny day', status: 'ESTIMATE', src: 'blueprint', note: 'Idealized day only: a sunny summer day in the humid Southeast still has haze and passing clouds. Partly cloudy is 0.7 × this and overcast 0.35 ×. Real weather uses the sunlight the weather service reports instead. (Until Oct 22, 2026 sunlight was instead scaled to hold the pond at the typed temperature.)' },
    kd_secchi:   { v: 1.7, units: 'Kd × Secchi depth', status: 'ESTIMATE', src: 'carlson1977', note: 'Light attenuation Kd ≈ 1.7 / Secchi depth. Standard value, citation pending: the 1.7 factor is the Poole & Atkins (1929) one, which could not be opened, and it is not confirmed in Carlson 1977. (Labelled SOURCED until Nov 8, 2026.)' },
    kd_ntu:      { v: 0.1, lo: 0.05, hi: 0.2, dist: 'uniform', sample: true, units: '1/m per NTU of mud', status: 'ESTIMATE', src: 'blueprint', note: 'Extra light loss from muddy water. No pond calibration found.' },
    K_ml_min:    { v: 1e-5, lo: 3e-6, hi: 1e-4, dist: 'log', sample: true, units: 'm²/s', status: 'ESTIMATE', src: 'lorke2005', note: 'Background mixing inside the warm top layer when the wind is calm.' },
    K_floor:     { v: 1.4e-7, lo: 1e-7, hi: 1e-5, dist: 'log', sample: true, units: 'm²/s', status: 'SOURCED floor, ESTIMATE range', src: 'langscavia1986', note: 'Mixing across the thermocline: molecular heat diffusivity, with a range up to 1e-5.' },
    ck:          { v: 0.23, lo: 0.15, hi: 0.35, dist: 'uniform', sample: true, units: '', status: 'ESTIMATE', src: 'hipsey2019', note: 'Wind-stirring efficiency for deepening the mixed layer (GLM-style energy balance); value not re-checked against the GLM paper.' },
    h_floor:     { v: 0.75, lo: 0.5, hi: 1.0, dist: 'uniform', sample: true, units: 'm', status: 'ESTIMATE', src: 'holgerson2022', note: 'Smallest daytime warm-layer depth used for temperature. The 1-D heat budget alone heats a thin top layer far more than the 1-4 °C afternoon layering reported for ponds, so heat is kept mixed at least this deep. Product, toxin and colonies still mix by the wind-driven diffusivity. Still needed after the Oct 22, 2026 heat-loss fixes: without it the top 6 inches of a bloom pond reach about 100 °F on a sunny afternoon.' },
    shelter_x:   { v: 50, units: 'tree heights', status: 'SOURCED', src: 'markfort2010', note: 'Shoreline trees cut the wind stress on the water for about 50 tree heights downwind. Only the part of the pond farther out than that gets the full wind (for a round pond, the overlap of the pond with itself shifted by that distance, as in GLM\'s Markfort option).' },
    canopy_h:    { v: 15, lo: 8, hi: 25, dist: 'uniform', sample: true, units: 'm', status: 'ESTIMATE', src: 'markfort2010', note: 'Height of the trees around a wooded pond.' },
    shelter_min: { v: 0.2, lo: 0.1, hi: 0.4, dist: 'uniform', sample: true, units: '× wind', status: 'ESTIMATE', src: 'blueprint', note: 'Wind a pond still gets when it is all in the trees\' shelter (gusts and eddies still reach it). With 15 m trees, that is every wooded pond under about 100 acres.' },
    bottom_dT:   { v: 4, lo: 2, hi: 6, dist: 'uniform', sample: true, units: '°C cooler at the bottom (ponds deeper than 2 m)', status: 'ESTIMATE', src: 'blueprint', note: 'Starting temperature difference; the heat budget takes over from there.' },
    spray_depth: { v: 0.15, lo: 0.05, hi: 0.3, dist: 'uniform', sample: true, units: 'm', status: 'ESTIMATE', src: 'blueprint', note: 'Spray mixes into the top few centimetres at once.' },
    inject_frac: { v: 0.15, lo: 0.1, hi: 0.2, dist: 'uniform', sample: true, units: 'share of pond volume', status: 'ESTIMATE', src: 'blueprint', note: 'A dense hose release sinks and pools in the deepest part of the pond.' },
    cu_rho:      { v: 2286, units: 'kg/m³', status: 'SOURCED', src: 'copperSulfate' },
    cu_cs:       { v: 314, units: 'kg/m³', status: 'DERIVED', src: 'copperSulfate', note: 'Saturation as pentahydrate, from 201 g/L anhydrous.' },
    cu_dm:       { v: 0.7e-9, lo: 0.5e-9, hi: 0.85e-9, dist: 'uniform', sample: true, units: 'm²/s at 25 °C', status: 'ESTIMATE', src: 'blueprint' },
    perc_rho:    { v: 2000, lo: 1600, hi: 2000, dist: 'uniform', sample: true, units: 'kg/m³', status: 'ESTIMATE', src: 'usdaPerc', note: 'Crystal density 2.01 g/cm³; real granules may be lighter.' },
    perc_cs20:   { v: 150, units: 'kg/m³ at 20 °C', status: 'SOURCED', src: 'usdaPerc' },
    perc_cs30:   { v: 175, units: 'kg/m³ at 30 °C', status: 'SOURCED', src: 'usdaPerc' },
    perc_dm:     { v: 1.0e-9, lo: 0.8e-9, hi: 1.5e-9, dist: 'uniform', sample: true, units: 'm²/s at 25 °C', status: 'ESTIMATE', src: 'blueprint' },
    fc_c1:       { v: 18, units: '', status: 'SOURCED', src: 'ferguson2004' },
    fc_c2:       { v: 1.0, units: 'natural sand grains', status: 'SOURCED', src: 'ferguson2004' },
    mc_rho:      { v: 985, units: 'kg/m³', status: 'SOURCED', src: 'zhao2017', note: 'Buoyant Microcystis colony density.' },
    colony_um:   { v: 200, lo: 100, hi: 400, dist: 'log', sample: true, units: 'µm', status: 'ESTIMATE', src: 'zhao2017', note: 'Typical colony diameter; rise speed grows with its square.' },
    ana_rise:    { v: 0.2, lo: 0, hi: 0.5, dist: 'uniform', sample: true, units: 'm/h', status: 'ESTIMATE', src: 'blueprint', note: 'Anabaena/Dolichospermum float weakly; no measured value found.' },
    dinst_cap:   { v: 1.2, units: 'mg/L', status: 'SOURCED', src: 'weenink2015', note: 'Upper end of instant peroxide demand (scums): "typically 0.1 up to 1.2 mg/L instantaneously". (Source corrected from the blueprint on Nov 8, 2026.)' }
  };

  const GRADES = {
    copper_sulfate: {
      fine30: { name: 'Fine 30 (0.25-0.85 mm)', d_mm: [0.25, 0.55, 0.85] },
      fine20: { name: 'Fine 20 (about 1-2.4 mm)', d_mm: [1.0, 1.7, 2.4] },
      medium: { name: 'Medium (3-7 mm)', d_mm: [3, 5, 7] }
    },
    h2o2_granular: {
      standard: { name: 'Granules (0.3-0.9 mm)', d_mm: [0.3, 0.6, 0.9] }
    }
  };

  // Which application methods each product allows
  const METHODS = {
    h2o2_liquid: ['spray', 'inject'],
    h2o2_granular: ['granules', 'spray'],
    copper_sulfate: ['granules', 'spray'],
    copper_chelated: ['spray', 'inject'],
    diquat: ['spray', 'inject'],
    endothall: ['spray', 'inject'],
    flumioxazin: ['spray']
  };
  const METHOD_NAMES = {
    spray: 'Sprayed on the surface (or dissolved first, then sprayed)',
    inject: 'Injected below the surface with a weighted hose',
    granules: 'Crystals or granules broadcast dry'
  };

  const ALL_PARAMS = Object.assign({}, S.PARAMS, PARAMS2);

  // ---------------------------------------------------------------- physics helpers
  function satVap(tC) { return 6.112 * Math.exp(17.67 * tC / (tC + 243.5)); }           // hPa (Bolton 1980)
  function specHum(e) { return 0.622 * e / (1013.25 - 0.378 * e); }                       // kg/kg
  function dragCoeff(u) { return 1.7e-3 * (1 + Math.exp(-1.1 * u)); }                     // Guseva et al. 2023 fit
  // heat and evaporation transfer coefficients, higher in light wind (Guseva et al. 2023, Table 1)
  function heatCoeff(u, pv) { return pv.C_H * (1 + 1.5 * Math.exp(-0.8 * Math.max(0, u))); }
  function vapCoeff(u, pv) { return pv.C_E * (1 + Math.exp(-Math.max(0, u))); }
  // Calm-air (free convection) transfer velocity, m/s, for heat and water vapour: warm, moist air over
  // the water is lighter than the air above it and rises (GLM eq. 28-29, from TVA 1972). Zero when the
  // air over the water is the heavier one. The heat and vapour fluxes use whichever is larger, this or
  // the wind-driven one, as GLM does.
  function freeConvVel(Ts, Ta, qs, qa, pv) {
    const TvS = (Ts + 273.15) * (1 + 0.61 * qs), TvA = (Ta + 273.15) * (1 + 0.61 * qa), d = TvS - TvA;
    if (!(d > 0)) return 0;
    const Kair = 0.026, nuA = 1.6e-5, Da = 2.2e-5;                 // air: conductivity, viscosity, heat diffusivity
    return 0.137 * pv.f_free * Kair * Math.cbrt(G * d / TvA / (nuA * Da)) / (1.2 * 1005);
  }
  // Air-water heat exchange other than sunlight (W/m², positive = into the water): longwave in and out,
  // sensible heat and evaporation. Sky emissivity is Brutsaert's clear sky with the TVA cloud factor
  // (1 + 0.22·cc²: an ESTIMATE, citation pending; it is in none of the cited sources, and GLM pairs
  // Brutsaert with 1 + 0.275·cc),
  // capped at 1 (until Oct 22, 2026 it could reach 1.13 in humid, cloudy weather, adding heat that
  // doesn't exist).
  function surfaceExchange(Ts, Ta, ea, cc, U, pv) {
    const TaK = Ta + 273.15, TsK = Ts + 273.15;
    const epsA = Math.min(1, 1.24 * Math.pow(ea / TaK, 1 / 7) * (1 + 0.22 * cc * cc));
    const lwIn = epsA * SIGMA * Math.pow(TaK, 4), lwOut = pv.eps_w * SIGMA * Math.pow(TsK, 4);
    const qs = specHum(satVap(Ts)), qa = specHum(ea), vF = freeConvVel(Ts, Ta, qs, qa, pv);
    const H = 1.2 * 1005 * Math.max(heatCoeff(U, pv) * U, vF) * (Ts - Ta);
    const E = 1.2 * 2.45e6 * Math.max(vapCoeff(U, pv) * U, vF) * (qs - qa);
    return { q: lwIn - lwOut - H - E, lwIn, lwOut, H, E, epsA };
  }
  // Share of the wind a pond gets with trees around it (Markfort et al. 2010): the wind stress is cut
  // for about 50 tree heights downwind of the shore, and only the rest of the pond gets the full wind.
  // For a round pond of diameter D that is the overlap of the pond with itself shifted by x = 50·h.
  // GLM scales the wind by this effective share of the area. 'partly' = trees along part of the shore.
  function shelterFactor(inp, pv) {
    if (inp.shelter !== 'wooded' && inp.shelter !== 'partly') return 1;
    const D = 2 * Math.sqrt(inp.areaAcres * ACRE_M2 / Math.PI), x = Math.min(1, pv.shelter_x * pv.canopy_h / D);
    const lens = (2 / Math.PI) * (Math.acos(x) - x * Math.sqrt(1 - x * x));
    const wood = Math.max(pv.shelter_min, lens);
    return inp.shelter === 'wooded' ? wood : 0.5 * (1 + wood);
  }

  // sunlight and water clarity live in sim-core so both models share them
  const solarElevationSin = S.solarElevationSin, clearSkyGHI = S.clearSkyGHI, secchiFromChl = S.secchiFromChl;

  // Ferguson & Church settling velocity (m/s)
  function settling(D, rhoP, tC, pv) {
    const rw = S.waterDensity(tC), nu = S.viscosity(tC) / rw, R = (rhoP - rw) / rw;
    if (R <= 0) return 0;
    return R * G * D * D / (pv.fc_c1 * nu + Math.sqrt(0.75 * pv.fc_c2 * R * G * D * D * D));
  }
  // Stokes rise speed of a buoyant colony (m/s, positive = up)
  function colonyRise(D, tC, pv) {
    return G * D * D * (S.waterDensity(tC) - pv.mc_rho) / (18 * S.viscosity(tC));
  }
  function dmAt(dm25, tC) { return dm25 * ((tC + 273.15) / 298.15) * (S.viscosity(25) / S.viscosity(tC)); }

  // One grain falling and dissolving. Returns cumulative dissolved fraction at 1-cm depth bins, the
  // depth where it fully dissolved (or null), and the diameter left if it reached maxDepth.
  function grainFall(D0, rhoP, Cs, dm25, tC, maxDepth, pv) {
    const rw = S.waterDensity(tC), nu = S.viscosity(tC) / rw, Dm = dmAt(dm25, tC), Sc = nu / Dm;
    const nb = Math.ceil(maxDepth / 0.01) + 1;
    const cum = new Float64Array(nb);
    let D = D0, z = 0, t = 0, fall = 0;
    let bin = 0;
    while (D > 1e-7 && z < maxDepth) {
      const w = settling(D, rhoP, tC, pv);
      const Re = w * D / nu;
      const Sh = 2 + 0.6 * Math.sqrt(Re) * Math.cbrt(Sc);
      const km = Sh * Dm / D;
      const dDdt = -2 * km * Cs / rhoP;
      const dt = Math.min(0.02, 0.005 * D / Math.abs(dDdt), w > 0 ? 0.002 / w : 0.02);
      D = Math.max(0, D + dDdt * dt);
      z += w * dt; t += dt;
      const frac = 1 - Math.pow(D / D0, 3);
      const nbin = Math.min(nb - 1, Math.floor(z / 0.01));
      for (let b = bin + 1; b <= nbin; b++) cum[b] = frac;
      bin = Math.max(bin, nbin);
      cum[bin] = frac;
      if (D <= 1e-7) { fall = z; break; }
    }
    for (let b = bin + 1; b < nb; b++) cum[b] = cum[bin];
    return { cum, dissolvedAt: D <= 1e-7 ? z : null, Dland: D > 1e-7 ? D : 0, timeS: t, w0: settling(D0, rhoP, tC, pv) };
  }

  // Product loss rate (1/h) in water at temperature Tk, with local chlorophyll chlB (µg/L), pH, and
  // hours since treatment tH. Shared by the layered column and the 2-D map/slice models.
  function decayRate(chem, Tk, chlB, pH, tH, inp, pv) {
    if (chem === 'h2o2') return Math.pow(pv.h2o2_theta, Tk - 20) * (pv.h2o2_kab + pv.h2o2_b * chlB);
    if (chem === 'cu_sulfate') return S.copperRate(Tk, inp.alk, pv) / 24;
    if (chem === 'cu_chelated') return pv.cuchel_k / 24;
    if (chem === 'diquat') return pv.dq_kwc / 24;
    if (chem === 'endothall') return (tH < pv.en_lag * 24 ? pv.en_kslow : pv.en_kbio * Math.pow(pv.en_theta, Tk - 20)) / 24;
    if (chem === 'flumioxazin') return S.flumRate(pH, pv);
    return 0;
  }

  // Surface oxygen transfer velocity (m/s) for wind U (m/s) at surface temperature T0
  function reaerationVel(U, T0, pv) {
    return S.k600(U, pv) * Math.pow(S.scO2(T0) / 600, U < 3.7 ? -2 / 3 : -0.5) / 100 / 3600;
  }
  // Oxygen the top layer would settle at without the dead bloom: saturation minus the sediment
  // demand of the bottom it touches (1 - A(hmix)/A0 of the bottom, in a bowl).
  function doEquilibrium(T0, hmix, col, U, pv) {
    const sat = S.doSat(T0);
    const fSed = 1 - Math.pow(Math.max(0, 1 - Math.min(hmix, col.zmax) / col.zmax), col.p);
    const kO2 = reaerationVel(U, T0, pv) * 86400;                      // m/day
    return Math.max(0, sat - fSed * pv.sod20 * Math.pow(pv.sod_theta, T0 - 20) / kO2);
  }

  // ---------------------------------------------------------------- geometry
  // Bowl: area deeper than z is A0*(1 - z/zmax)^p, with p = 1/r - 1 so mean depth = r*zmax
  function column(inp, pv) {
    const zmax = inp.maxDepthM, r = pv.r_meanmax, p = 1 / r - 1;
    const A0 = inp.areaAcres * ACRE_M2;
    const N = Math.max(12, Math.min(40, Math.ceil(zmax / 0.15)));
    const dz = zmax / N;
    const zi = new Float64Array(N + 1), Ai = new Float64Array(N + 1), V = new Float64Array(N), zc = new Float64Array(N);
    for (let k = 0; k <= N; k++) { zi[k] = k * dz; Ai[k] = A0 * Math.pow(Math.max(0, 1 - zi[k] / zmax), p); }
    const prim = z => -A0 * zmax / (p + 1) * Math.pow(Math.max(0, 1 - z / zmax), p + 1);
    for (let k = 0; k < N; k++) { V[k] = prim(zi[k + 1]) - prim(zi[k]); zc[k] = 0.5 * (zi[k] + zi[k + 1]); }
    let Vt = 0; for (let k = 0; k < N; k++) Vt += V[k];
    return { N, dz, zi, Ai, V, zc, A0, zmax, p, Vt, zmean: Vt / A0 };
  }

  // Tridiagonal solve (Thomas). a = lower, b = diag, c = upper, d = rhs; result written into x.
  function thomas(a, b, c, d, x, n, cp, dp) {
    cp[0] = c[0] / b[0]; dp[0] = d[0] / b[0];
    for (let i = 1; i < n; i++) {
      const m = b[i] - a[i] * cp[i - 1];
      cp[i] = c[i] / m; dp[i] = (d[i] - a[i] * dp[i - 1]) / m;
    }
    x[n - 1] = dp[n - 1];
    for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
  }

  // Implicit vertical diffusion (+ optional upward advection w, m/s) for one scalar
  function diffuse(X, col, K, dt, w, ws) {
    const n = col.N, a = ws.a, b = ws.b, c = ws.c, d = ws.d;
    for (let k = 0; k < n; k++) {
      const up = k > 0 ? dt * col.Ai[k] * K[k] / col.dz : 0;               // interface k (top of layer k)
      const dn = k < n - 1 ? dt * col.Ai[k + 1] * K[k + 1] / col.dz : 0;   // interface k+1
      a[k] = -up; c[k] = -dn; b[k] = col.V[k] + up + dn; d[k] = col.V[k] * X[k];
      if (w) {
        if (k > 0) b[k] += dt * w * col.Ai[k];          // leaves upward through the top of layer k
        if (k < n - 1) c[k] -= dt * w * col.Ai[k + 1];  // arrives from the layer below
      }
    }
    thomas(a, b, c, d, X, n, ws.cp, ws.dp);
  }

  // ---------------------------------------------------------------- release profiles
  function releaseProfile(inp, pv, col, T, hmix) {
    const n = col.N, water = new Float64Array(n), bed = [];   // bed: [{k, frac, tBedS}]
    const method = inp.method;
    if (method === 'spray') {
      const dlt = Math.min(pv.spray_depth, col.zmax);
      let vol = 0; const share = new Float64Array(n);
      for (let k = 0; k < n; k++) {
        const top = col.zi[k], bot = Math.min(col.zi[k + 1], dlt);
        if (bot > top) { share[k] = col.V[k] * (bot - top) / col.dz; vol += share[k]; }
      }
      for (let k = 0; k < n; k++) water[k] = share[k] / vol;
      return { water, bed, landedFrac: 0, note: `Starts in the top ${Math.max(1, Math.round(dlt * 39.3701))} inches.` };
    }
    if (method === 'inject') {
      const layered = hmix < 0.95 * col.zmax;
      if (layered) {
        // spreads sideways at the thermocline (density step larger than the diluted plume's)
        let k0 = Math.min(n - 1, Math.floor(hmix / col.dz)), k1 = Math.min(n - 1, Math.floor((hmix + 0.3) / col.dz));
        let vol = 0; for (let k = k0; k <= k1; k++) vol += col.V[k];
        for (let k = k0; k <= k1; k++) water[k] = col.V[k] / vol;
        return { water, bed, landedFrac: 0, note: 'Sinks and spreads sideways at the thermocline.' };
      }
      let vol = 0, k = n - 1;
      while (k > 0 && vol < pv.inject_frac * col.Vt) { vol += col.V[k]; k--; }
      for (let j = k + 1; j < n; j++) water[j] = col.V[j] / vol;
      return { water, bed, landedFrac: 0, note: `Sinks and pools in the deepest ${Math.round(pv.inject_frac * 100)}% of the water.` };
    }
    // granules / crystals
    const grade = (GRADES[inp.product] || {})[inp.grade] || Object.values(GRADES[inp.product])[0];
    const isCu = inp.product === 'copper_sulfate';
    const rhoP = isCu ? pv.cu_rho : pv.perc_rho;
    const tTop = T[0];
    const Cs = isCu ? pv.cu_cs : pv.perc_cs20 + (pv.perc_cs30 - pv.perc_cs20) * (tTop - 20) / 10;
    const dm = isCu ? pv.cu_dm : pv.perc_dm;
    let landed = 0;
    const per = 1 / grade.d_mm.length;
    for (const dmm of grade.d_mm) {
      const g = grainFall(dmm / 1000, rhoP, Cs, dm, tTop, col.zmax, pv);
      // grains land uniformly over the surface; local depth h has P(h > z) = A(z)/A0
      for (let k = 0; k < n; k++) {
        // dissolved in layer k by grains passing through it
        const b0 = Math.round(col.zi[k] / 0.01), b1 = Math.round(col.zi[k + 1] / 0.01);
        let m = 0;
        for (let b = b0; b < b1 && b + 1 < g.cum.length; b++) {
          const zmid = (b + 0.5) * 0.01;
          const pDeeper = Math.pow(Math.max(0, 1 - zmid / col.zmax), col.p);
          m += (g.cum[b + 1] - g.cum[b]) * pDeeper;
        }
        water[k] += per * m;
        // grains whose local bottom lies in layer k land with what is left at that depth
        const fracArea = (col.Ai[k] - col.Ai[k + 1]) / col.A0;
        if (fracArea > 0) {
          const bm = Math.min(g.cum.length - 1, Math.round(col.zc[k] / 0.01));
          const left = 1 - g.cum[bm];
          if (left > 1e-6) {
            const Dleft = (dmm / 1000) * Math.cbrt(left);
            const tBed = rhoP * Dleft * Dleft / (8 * dmAt(dm, T[k]) * Cs);   // stagnant dissolution, Sh = 2
            bed.push({ k, frac: per * fracArea * left, tBedS: tBed });
            landed += per * fracArea * left;
          }
        }
      }
    }
    // close the mass balance exactly (bins and layer midpoints leave a small discretization gap)
    let tot = 0; for (let k = 0; k < n; k++) tot += water[k]; for (const b of bed) tot += b.frac;
    for (let k = 0; k < n; k++) water[k] /= tot; for (const b of bed) b.frac /= tot; landed /= tot;
    return { water, bed, landedFrac: landed, grade: grade.name, rawTotal: tot,
      note: `${Math.round(landed * 100)}% of the ${isCu ? 'crystals' : 'granules'} land on the bottom before dissolving.` };
  }

  // ---------------------------------------------------------------- the model
  function simulate(inp, pv, opts) {
    opts = opts || {};
    pv = S.withMeasured(inp, pv);                       // the user's own measurements, if any
    const prod = S.PRODUCTS[inp.product], chem = prod.chem;
    const col = column(inp, pv);
    const n = col.N;
    const shelter = shelterFactor(inp, pv);
    // Real weather (optional): hourly series starting at local midnight SPIN_DAYS before the treatment
    // day: air temperature Ta (°C), relative humidity rh (0-1), wind U (m/s at 10 m, open ground) and
    // the direction it comes from (°), cloud cover (0-1) and sunlight sw (W/m², mean of the hour
    // before each time stamp). Without it, one idealized day repeats.
    const WX = inp.weather && inp.weather.U && inp.weather.U.length > 24 ? inp.weather : null;
    const wxN = WX ? WX.U.length : 0;
    const wxAt = (arr, tH) => {
      if (!(tH > 0)) return arr[0];
      const i = Math.floor(tH); if (i >= wxN - 1) return arr[wxN - 1];
      return arr[i] + (arr[i + 1] - arr[i]) * (tH - i);
    };
    const wxDir = tH => {                               // wind direction, interpolated as a vector
      const i = Math.max(0, Math.min(wxN - 1, Math.floor(tH))), j = Math.min(wxN - 1, i + 1), f = Math.max(0, Math.min(1, tH - i));
      const a = WX.dir[i] * Math.PI / 180, b = WX.dir[j] * Math.PI / 180;
      const x = (1 - f) * Math.sin(a) + f * Math.sin(b), y = (1 - f) * Math.cos(a) + f * Math.cos(b);
      return ((Math.atan2(x, y) * 180 / Math.PI) + 360) % 360;
    };
    const windAt = tH => Math.max(0, (WX ? wxAt(WX.U, tH) : inp.windMs) * shelter);
    const ustarOf = u => Math.sqrt(1.2 * dragCoeff(u) * u * u / RHO0);
    let U = windAt(0);
    const cloudSW = pv.cloud_sw * (inp.sky === 'overcast' ? 0.35 : inp.sky === 'partly' ? 0.7 : 1);
    const cloudC = inp.sky === 'overcast' ? 0.9 : inp.sky === 'partly' ? 0.5 : 0;
    const doy = inp.doy || 196;
    const TaMean = (inp.airHighC + inp.airLowC) / 2, TaAmp = (inp.airHighC - inp.airLowC) / 2;
    // a measured Secchi depth covers everything that dims the water (bloom and mud alike)
    const Kd = inp.secchiM > 0 ? pv.kd_secchi / inp.secchiM : pv.kd_secchi / secchiFromChl(inp.chl) + (inp.turbCause === 'mineral' ? pv.kd_ntu * inp.ntu : 0);
    // for the bloom's photosynthesis, the part of the light loss that comes from the cells follows the
    // cells: where colonies crowd near the surface they shade the water below (self-shading)
    const KdMin = inp.secchiM > 0 ? 0 : (inp.turbCause === 'mineral' ? pv.kd_ntu * inp.ntu : 0), KdChl = Kd - KdMin;
    let ustar = ustarOf(U);
    const setWind = tH => { if (!WX) return; U = windAt(tH); ustar = ustarOf(U); };
    const Akm2 = col.A0 / 1e6;

    // Idealized day: clear-sky sunlight × the sky choice, and the water temperature floats with the
    // weather from the user's reading. (Until Oct 22, 2026 the sunlight was scaled so the heat budget
    // balanced at the typed temperature. The heat losses were too weak, so that threw away about two
    // thirds of a sunny day, and it tied the sunshine to the wind and humidity.) fBalance is kept for
    // the report: the share of clear sky that would hold the pond at the reading.
    let swSum = 0, restSum = 0;
    for (let hh = 0; hh < 24; hh += 0.25) {
      const Ta = TaMean + TaAmp * Math.cos(2 * Math.PI * (hh - 15) / 24);
      swSum += clearSkyGHI(solarElevationSin(hh, doy)) * (1 - pv.albedo);
      restSum += surfaceExchange(inp.tempC, Ta, pv.rh * satVap(Ta), cloudC, windAt(0), pv).q;
    }
    const fBalance = WX ? null : swSum > 0 ? -restSum / swSum : 0;
    const swFactor = WX ? 1 : cloudSW;                  // real weather: its own sunlight

    // initial temperature profile
    const T = new Float64Array(n);
    const Tbot = inp.bottomC != null && isFinite(inp.bottomC) ? inp.bottomC : col.zmax > 2 ? inp.tempC - pv.bottom_dT : inp.tempC - 1;
    for (let k = 0; k < n; k++) {
      const z = col.zc[k];
      T[k] = z < 1 ? inp.tempC : inp.tempC + (Tbot - inp.tempC) * (z - 1) / Math.max(0.01, col.zmax - 1);
    }
    // tracers
    const C = new Float64Array(n), B = new Float64Array(n).fill(1), MC = new Float64Array(n), Def = new Float64Array(n), Cd = new Float64Array(n);
    const Kz = new Float64Array(n + 1);
    const ws = { a: new Float64Array(n), b: new Float64Array(n), c: new Float64Array(n), d: new Float64Array(n), cp: new Float64Array(n), dp: new Float64Array(n) };
    const rho = new Float64Array(n);

    // colony rise speed (m/s)
    let wCells = 0;
    if (inp.target === 'microcystis') wCells = Math.max(0, colonyRise(pv.colony_um * 1e-6, inp.tempC, pv));
    else if (inp.target === 'anabaena') wCells = pv.ana_rise / 3600;

    let hmix = col.zmax;
    // Wind stirring deepens the warm top layer when it has the energy to lift the denser water below
    // (Kraus-Turner / GLM-style bulk energy balance). Only heat is homogenized here; tracers and
    // colonies are mixed by the turbulent diffusivity below, so scums can still form.
    // The stirred depth (hmix) is what this balance, the h_floor stirring and night-time convection
    // actually mix. Wind energy left over when the next layer down needs more than one step's worth
    // is kept for the following steps (the discrete form of steady Kraus-Turner deepening, so the
    // answer does not depend on the 10-minute step). It is dropped if a shallower layer forms first.
    let eStore = 0, eTarget = -1, mixIdx = n - 1;
    function entrain() {
      for (let k = 0; k < n; k++) rho[k] = S.waterDensity(T[k]);
      let m = 0;
      // keep heat mixed at least h_floor deep (see PARAMS2.h_floor)
      let mf = 0; while (mf + 1 < n && col.zc[mf + 1] < pv.h_floor) mf++;
      if (mf > 0) {
        let vt = 0, ht = 0; for (let k = 0; k <= mf; k++) { vt += col.V[k]; ht += T[k] * col.V[k]; }
        const tm = ht / vt, rm = S.waterDensity(tm);
        for (let k = 0; k <= mf; k++) { T[k] = tm; rho[k] = rm; }
        m = mf;
      }
      while (m + 1 < n && Math.abs(rho[m + 1] - rho[0]) < 1e-4) m++;
      // Energy is worked out for the whole pond (J): the wind's stirring over the surface area, and the
      // work to lift the next layer's own volume up to the stirred layer's centre of mass, as GLM does.
      // (Until Oct 22, 2026 every layer was given the full surface area, as if the pond had straight
      // walls; in a bowl the deeper layers are smaller and easier to stir in.)
      let E = pv.ck * RHO0 * ustar * ustar * ustar * DT * col.A0;
      let Vm = 0, VZ = 0; for (let k = 0; k <= m; k++) { Vm += col.V[k]; VZ += col.V[k] * col.zc[k]; }
      while (m + 1 < n) {
        if (eStore > 0 && m + 1 >= eTarget) { E += eStore; eStore = 0; }
        const Vk = col.V[m + 1];
        const need = G * Math.max(0, rho[m + 1] - rho[0]) * Vk * Vm / (Vm + Vk) * (col.zc[m + 1] - VZ / Vm);
        if (need > E) { eStore = E; eTarget = m + 1; break; }
        E -= need; m++; Vm += Vk; VZ += Vk * col.zc[m];
        let vt = 0, ht = 0; for (let k = 0; k <= m; k++) { vt += col.V[k]; ht += T[k] * col.V[k]; }
        const tm = ht / vt, rm = S.waterDensity(tm);
        for (let k = 0; k <= m; k++) { T[k] = tm; rho[k] = rm; }
      }
      if (m + 1 >= n) { eStore = 0; eTarget = -1; }
      mixIdx = m;
    }
    function updateMixing() {
      for (let k = 0; k < n; k++) rho[k] = S.waterDensity(T[k]);
      // stirred depth: the top layers the energy balance and convection have mixed (see entrain)
      let m = mixIdx; while (m + 1 < n && Math.abs(rho[m + 1] - rho[0]) < 1e-4) m++;
      hmix = m + 1 < n ? col.zi[m + 1] : col.zmax;
      Kz[0] = 0; Kz[n] = 0;
      for (let k = 1; k < n; k++) {
        const z = col.zi[k];
        if (z < hmix) Kz[k] = Math.max(pv.K_ml_min, KAPPA * ustar * z * (1 - z / hmix));
        else {
          const N2 = G / RHO0 * Math.max(0, (rho[k] - rho[k - 1]) / col.dz);
          const hs = N2 > 0 ? 8.17e-4 * Math.pow(Akm2, 0.56) * Math.pow(N2, -0.43) * 1e-4 : pv.K_ml_min;
          Kz[k] = Math.max(pv.K_floor, Math.min(hs, pv.K_ml_min));
        }
      }
    }
    // convective adjustment: mix any layer that is denser than the one below it (all tracers)
    const arrays = [T, C, B, MC, Def, Cd];
    function convect() {
      for (let k = 0; k < n; k++) rho[k] = S.waterDensity(T[k]);
      let changed = true, guard = 0;
      while (changed && guard++ < 4 * n) {
        changed = false;
        for (let k = 0; k < n - 1; k++) {
          if (rho[k] > rho[k + 1] + 1e-9) {
            const v1 = col.V[k], v2 = col.V[k + 1], vt = v1 + v2;
            for (const X of arrays) { const m = (X[k] * v1 + X[k + 1] * v2) / vt; X[k] = m; X[k + 1] = m; }
            rho[k] = rho[k + 1] = S.waterDensity(T[k]);
            changed = true;
          }
        }
      }
    }
    function heatStep(tClock, tH) {
      let Ta, ea, cc = cloudC, swNow;
      if (WX) {
        Ta = wxAt(WX.Ta, tH); ea = Math.max(0.01, Math.min(1, wxAt(WX.rh, tH))) * satVap(Ta);
        cc = Math.max(0, Math.min(1, wxAt(WX.cloud, tH)));
        swNow = Math.max(0, wxAt(WX.sw, tH + 0.5)) * (1 - pv.albedo);   // hourly means sit mid-hour
      } else {
        Ta = TaMean + TaAmp * Math.cos(2 * Math.PI * (tClock - 15) / 24);
        ea = pv.rh * satVap(Ta);
        swNow = swFactor * clearSkyGHI(solarElevationSin(tClock, doy)) * (1 - pv.albedo);
      }
      const sw = swNow;
      const qSurf = surfaceExchange(T[0], Ta, ea, cc, U, pv).q;
      for (let k = 0; k < n; k++) {
        const eIn = sw * (col.Ai[k] * Math.exp(-Kd * col.zi[k]) - col.Ai[k + 1] * Math.exp(-Kd * col.zi[k + 1]));
        const src = eIn + (k === 0 ? qSurf * col.A0 : 0);
        T[k] += DT * src / (RHO0 * CP * col.V[k]);
      }
      return { sw, qSurf };
    }

    // ---------------- spin-up (no product), then the treatment
    const spinSteps = Math.round((SPIN_DAYS * 24 + inp.appHour) * 3600 / DT);
    let offset = null, shiftH = 0;
    for (let i = 0; i < spinSteps; i++) {
      const tClock = (i * DT / 3600) % 24;
      setWind(i * DT / 3600);
      heatStep(tClock, i * DT / 3600); convect(); entrain(); updateMixing();
      diffuse(T, col, Kz, DT, 0, ws);
      diffuse(B, col, Kz, DT, wCells, ws);
      // remember the surface temperature at 7 AM on the treatment day, to match the user's reading
      // (and how deep the night's stirring reached then: the water that reading speaks for)
      if (offset === null && i * DT >= (SPIN_DAYS * 24 + Math.min(7, inp.appHour)) * 3600) { offset = inp.tempC - T[0]; shiftH = hmix; }
    }
    // Match the user's morning reading in the water the morning's stirring reached (the stirred
    // depth at 7 AM). The water below that keeps its starting difference from the reading. (Until Oct 21, 2026 the whole
    // column was shifted, so a warm-up that ran 10-20 °F off the reading, as real weather can,
    // dragged the bottom water with it: a July pond could start with 39 °F bottom water.)
    // Shifting cooler water on top can make it sink and mix, so repeat until the top matches.
    if (offset !== null && opts.matchTemp !== false) {
      const target = T[0] + offset;
      for (let it = 0; it < 8 && Math.abs(target - T[0]) > 0.005; it++) {
        const d = target - T[0];
        for (let k = 0; k < n && (k === 0 || col.zi[k] < Math.max(shiftH, hmix)); k++) T[k] += d;
        convect(); updateMixing();
      }
    }
    // A measured bottom temperature is a reading on the treatment day, like the surface one: after
    // the warm-up, bend the water below the morning's stirred depth so the deepest layer matches it.
    if (inp.bottomC != null && isFinite(inp.bottomC) && opts.matchTemp !== false) {
      const z0 = shiftH > 0 && shiftH < col.zmax ? shiftH : Math.min(1, col.zmax / 2), zb = col.zc[n - 1];
      const d = inp.bottomC - T[n - 1];
      if (zb > z0) for (let k = 0; k < n; k++) if (col.zc[k] > z0) T[k] += d * (col.zc[k] - z0) / (zb - z0);
      convect(); updateMixing();
    }
    convect(); updateMixing();
    // normalize cells so the volume average is 1
    let bsum = 0; for (let k = 0; k < n; k++) bsum += B[k] * col.V[k];
    for (let k = 0; k < n; k++) B[k] *= col.Vt / bsum;

    // ---------------- product release
    const rel = releaseProfile(inp, pv, col, T, hmix);
    const doseMgL = inp.dose * prod.toMgL;            // label dose over the full depth of the treated area
    const mass = doseMgL * col.Vt;                     // g (mg/L × m³)
    const capDiquat = chem === 'diquat' ? S.diquatCapacity(inp.ntu, inp.turbCause, inp.clay, pv) : 0;
    const dqRoom = chem === 'diquat' ? S.diquatRoom(inp, pv) : 0;   // binding room per litre, in every layer
    const boundUsed = new Float64Array(n), demandUsed = new Float64Array(n);
    let o2credit = new Float64Array(n);
    let boundTotal = 0, demandTotal = 0;
    function addMass(k, g) {             // add g grams of active ingredient to layer k
      let add = g / col.V[k];            // mg/L
      if (chem === 'h2o2') {
        const want = Math.min(pv.dinst_cap, pv.h2o2_dinst * Math.max(0.05, B[k]));
        const room = Math.max(0, want - demandUsed[k]);
        const dmd = Math.min(add, room); demandUsed[k] += dmd; add -= dmd; demandTotal += dmd * col.V[k];
        o2credit[k] += pv.h2o2_o2 * dmd;
      }
      C[k] += add;
    }
    for (let k = 0; k < n; k++) if (rel.water[k] > 0) addMass(k, mass * rel.water[k]);
    const bedPools = rel.bed.map(b => ({ k: b.k, total: mass * b.frac, released: 0, tBed: b.tBedS }));

    // granule pH jump (pond-average delivered dose), then the daily swing in the mixed layer
    const amp = S.pHAmplitude(inp.chl, inp.alk, pv);
    const pHbase = prod.granular ? S.pHAfterGranules(inp.pH, inp.alk, doseMgL, pv) : inp.pH;
    const pHat = (tClock, inMixed) => inMixed ? Math.min(pv.ph_cap, pHbase + amp.A * S.swing(tClock, pv)) : pHbase;

    // kill model on contact-weighted exposure
    const ec = S.ecFor(chem, inp);
    let kill = null;
    if (ec && !ec.none) kill = S.killFor(ec, pv);     // calibrated the way its lab test was run

    // toxin and oxygen set-up
    const ratio = S.toxinRatio(inp, pv);
    const MCtot = ratio * inp.chl;
    for (let k = 0; k < n; k++) MC[k] = pv.mc_fext * MCtot;
    const MCintPerB = (1 - pv.mc_fext) * MCtot;         // µg/L at relative cell density 1
    const lagH = inp.history ? 0 : pv.mc_lag * 24;
    const kdDead = pv.kd20 * Math.pow(pv.kd_theta, inp.tempC - 20);
    const carbonPerB = pv.thetaC * inp.chl / 1000;      // mg C/L at relative density 1, if all killed
    for (let k = 0; k < n; k++) Def[k] = -o2credit[k];

    // state for kill
    let D = 0, Dmax = 0, H = 0, Kf = 0, Y = 0;
    const tempKey = chem;
    // MCtop/MCmean = dissolved microcystin; MCall = total in the stirred top water, dissolved plus
    // what is still inside cells (live, or knocked down but not yet leaked). EPA and WHO levels are for total.
    const rec = { hours: [], light: [], Cexp: [], Ctop: [], Cbot: [], Cmax: [], Cmean: [], K: [], MCtop: [], MCmean: [], MCall: [], DOml: [], hmix: [], Ttop: [], Tbot: [], pH: [], bedLeft: [], clock: [], Uopen: [], windFrom: [], Tair: [] };
    const snaps = opts.snapshots ? { T: [], C: [], B: [], MC: [], K: [] } : null;
    let CexpPeak = 0, CmaxPeak = 0, CbotPeak = 0, intCexp = 0;

    const kBot = (() => { let vol = 0, k = n - 1; while (k > 0 && vol < 0.1 * col.Vt) { vol += col.V[k]; k--; } return k + 1; })();
    function layerStats() {
      let cb = 0, ce = 0, vb = 0, cm = 0, cmax = 0, ctop = 0, vtop = 0, mct = 0, mcm = 0, deft = 0, mcall = 0;
      const inCells = MCintPerB * Math.max(0, 1 - (Kf - Y));   // toxin still inside cells, per unit cell density
      for (let k = 0; k < n; k++) {
        const v = col.V[k];
        cb += C[k] * B[k] * v; vb += B[k] * v; cm += C[k] * v; if (C[k] > cmax) cmax = C[k];
        mcm += MC[k] * v;
        if (col.zi[k] < hmix) { ctop += C[k] * v; vtop += v; mct += MC[k] * v; deft += Def[k] * v; mcall += (MC[k] + inCells * B[k]) * v; }
      }
      let cbot = 0, vbt = 0; for (let k = kBot; k < n; k++) { cbot += C[k] * col.V[k]; vbt += col.V[k]; }
      return { Cexp: cb / vb, Cmean: cm / col.Vt, Cmax: cmax, Ctop: ctop / vtop, Cbot: cbot / vbt, MCtop: mct / vtop, MCmean: mcm / col.Vt, MCall: mcall / vtop, Defml: deft / vtop };
    }
    // Oxygen the top layer would settle at without the dead bloom: saturation minus the sediment
    // demand of the bottom it touches. In a bowl the top layer touches the sloping sides, so the
    // share of bottom in contact is 1 - A(hmix)/A0. Fully mixed gives the Phase 1 value; this
    // avoids a jump when a layered pond turns over.
    function DOeqNow() { return doEquilibrium(T[0], hmix, col, U, pv); }
    // sunlight for the bloom's photosynthesis: real weather, or clear sky × the sky choice. Not the
    // scaled sunlight the idealized day uses to balance its heat budget (that would starve the bloom).
    const bioLight = (tw, tClock) => WX ? Math.max(0, wxAt(WX.sw, tw + 0.5)) : cloudSW * clearSkyGHI(solarElevationSin(tClock, doy));
    const record = (tH, tClock) => {
      const st = layerStats();
      rec.light.push(bioLight(spinSteps * DT / 3600 + tH, tClock));
      rec.hours.push(tH); rec.Cexp.push(st.Cexp); rec.Ctop.push(st.Ctop); rec.Cbot.push(st.Cbot); rec.Cmax.push(st.Cmax); rec.Cmean.push(st.Cmean);
      rec.K.push(Kf); rec.MCtop.push(st.MCtop); rec.MCmean.push(st.MCmean); rec.MCall.push(st.MCall);
      rec.DOml.push(Math.max(0, DOeqNow() - st.Defml)); rec.hmix.push(hmix); rec.Ttop.push(T[0]); rec.Tbot.push(T[n - 1]); rec.pH.push(pHat(tClock, true));
      let bl = 0; for (const bp of bedPools) bl += bp.total - bp.released; rec.bedLeft.push(mass > 0 ? bl / mass : 0); rec.clock.push(tClock);
      const tw = spinSteps * DT / 3600 + tH;          // hours since the weather series starts
      rec.Uopen.push(WX ? wxAt(WX.U, tw) : inp.windMs); rec.windFrom.push(WX ? wxDir(tw) : (inp.windFrom || 0));
      rec.Tair.push(WX ? wxAt(WX.Ta, tw) : TaMean + TaAmp * Math.cos(2 * Math.PI * (tClock - 15) / 24));
      if (snaps) { snaps.T.push(Array.from(T)); snaps.C.push(Array.from(C)); snaps.B.push(Array.from(B)); snaps.MC.push(Array.from(MC)); snaps.K.push(Array.from(Kz)); }
    };

    const t0 = spinSteps * DT;
    // The untreated pond is taken to be in day-to-day oxygen balance: everything else that breathes
    // (bacteria, animals) uses whatever the bloom's photosynthesis makes beyond its own breathing over
    // the first day. That other breathing (per unit of bloom, live or not) goes on after a treatment.
    let rOther = 0;
    {
      let pDay = 0, rB = 0, w = 0;
      for (let h = 0; h < 24; h += 0.25) {
        let Iz = bioLight(t0 / 3600 + h, (inp.appHour + h) % 24);
        for (let k = 0; k < n; k++) {
          const Kk = KdMin + KdChl * B[k], dzk = col.zi[k + 1] - col.zi[k];
          pDay += S.bloomO2(inp.chl * B[k], Iz, Kk, 0, dzk, T[k], pv).P * col.V[k] * 0.25; Iz *= Math.exp(-Kk * dzk);
        }
      }
      for (let k = 0; k < n; k++) { rB += S.bloomO2(inp.chl * B[k], 0, 1, 0, 1, T[k], pv).R * col.V[k] * 24; w += inp.chl * B[k] * col.V[k] * 24; }
      rOther = w > 0 ? Math.max(0, pDay - rB) / w : 0;            // mg O2/L per hour per µg/L of bloom
    }
    record(0, inp.appHour % 24);
    { const st0 = layerStats(); CexpPeak = st0.Cexp; CmaxPeak = st0.Cmax; CbotPeak = st0.Cbot; }
    const steps = Math.round(RUN_DAYS * 86400 / DT);
    const dtH = DT / 3600;
    for (let i = 0; i < steps; i++) {
      const tAbs = t0 + i * DT, tH = i * dtH, tClock = (tAbs / 3600) % 24, tMidClock = ((tAbs + DT / 2) / 3600) % 24;
      setWind(tAbs / 3600);
      heatStep(tClock, tAbs / 3600); convect(); entrain(); updateMixing();
      // bed release (stagnant dissolution of landed grains)
      for (const bp of bedPools) {
        const tt = (tH + dtH) * 3600;
        const doneFrac = tt >= bp.tBed ? 1 : 1 - Math.pow(1 - tt / bp.tBed, 1.5);
        const target = bp.total * doneFrac;
        if (target > bp.released) { addMass(bp.k, target - bp.released); bp.released = target; }
      }
      // chemistry per layer (exact exponential over the step); clay binds diquat in every layer it
      // reaches, at a rate (until Oct 22, 2026 only in the layer the spray landed in, all at once)
      const before = Cexposure();
      for (let k = 0; k < n; k++) {
        if (dqRoom > 0 && C[k] > 0) { const db = S.diquatSorb(C[k], boundUsed[k], dqRoom, pv.dq_ksorb, dtH); C[k] -= db; boundUsed[k] += db; boundTotal += db * col.V[k]; }
        const inMixed = col.zi[k] < hmix;
        const kr = decayRate(chem, T[k], inp.chl * B[k], chem === 'flumioxazin' ? pHat(tMidClock, inMixed) : 0, tH, inp, pv);   // 1/h
        const c0 = C[k];
        C[k] = c0 * Math.exp(-kr * dtH);
        if (chem === 'h2o2') Def[k] -= pv.h2o2_o2 * (c0 - C[k]);
      }
      // vertical mixing of everything; cells also rise
      diffuse(T, col, Kz, DT, 0, ws);
      diffuse(C, col, Kz, DT, 0, ws);
      diffuse(B, col, Kz, DT, wCells, ws);
      const after = Cexposure();
      const Cavg = 0.5 * (before + after);
      intCexp += Cavg * dtH;
      // kill (population-level, driven by what the cells experience)
      let dK = 0;
      if (kill) {
        const Dn = Cavg + (D - Cavg) * Math.exp(-kill.kD * dtH);
        let Kn;
        if (kill.structure === 'SD') { H += kill.bw * Math.max(0, 0.5 * (D + Dn) - kill.z) * dtH; Kn = 1 - Math.exp(-H); }
        else { if (Dn > Dmax) Dmax = Dn; Kn = S.itFraction(Dmax, kill.mw, kill.beta); }
        D = Dn; dK = Math.max(0, Kn - Kf); Kf = Math.max(Kf, Kn);
      }
      // damaged cells leak toxin and become dead biomass where they are
      const relFrac = (pv.mc_krel / 24) * Y * dtH;
      Y += dK - relFrac;
      const cuNow = chem === 'cu_sulfate' || chem === 'cu_chelated';
      // the living bloom makes oxygen by day and uses it day and night, where its cells are
      const Ib = bioLight(tAbs / 3600 + dtH / 2, tMidClock), live = inp.chl * Math.max(0, 1 - Kf);
      let Iz = Ib;                                     // light at the top of each layer, going down
      // sunlight breaks down dissolved toxin in the stirred top water: the well-mixed model's rule
      // (half-life mc_photo days per metre of depth, Welker & Steinberg 2000) is a removal speed of
      // ln 2 / mc_photo metres per day through the surface, shared over the stirred layer's volume;
      // none under the thermocline. Added Nov 8, 2026 so all three models use one rule (it was in the
      // well-mixed model only).
      let vMix = 0; for (let k = 0; k < n; k++) if (col.zi[k] < hmix - 1e-9) vMix += col.V[k];
      const kPh = Math.LN2 * col.A0 / (pv.mc_photo * Math.max(1e-9, vMix)) / 24;   // per hour
      for (let k = 0; k < n; k++) {
        const kb = tH >= lagH ? (pv.mc_kbio / 24) * (cuNow && C[k] > 1 ? pv.mc_cu_slow : 1) : 0;
        MC[k] += relFrac * MCintPerB * B[k] - (kb + (col.zi[k] < hmix - 1e-9 ? kPh : 0)) * MC[k] * dtH;
        Cd[k] += relFrac * carbonPerB * B[k] - (kdDead / 24) * Cd[k] * dtH;
        const Kk = KdMin + KdChl * B[k], dzk = col.zi[k + 1] - col.zi[k];
        const met = S.bloomO2(live * B[k], Iz, Kk, 0, dzk, T[k], pv);
        Iz *= Math.exp(-Kk * dzk);
        Def[k] += (pv.rOC * (kdDead / 24) * Cd[k] + met.R + rOther * (1 - pv.ro_live * Kf) * inp.chl * B[k] - met.P) * dtH;
      }
      diffuse(MC, col, Kz, DT, 0, ws);
      diffuse(Def, col, Kz, DT, 0, ws);
      // reaeration at the surface layer
      const kO2 = reaerationVel(U, T[0], pv);  // m/s
      Def[0] *= Math.exp(-kO2 * col.A0 * DT / col.V[0]);
      const st = layerStats();
      if (st.Cexp > CexpPeak) CexpPeak = st.Cexp;
      if (st.Cmax > CmaxPeak) CmaxPeak = st.Cmax;
      if (st.Cbot > CbotPeak) CbotPeak = st.Cbot;
      if ((i + 1) % Math.round(3600 / DT) === 0) record(tH + dtH, (tClock + dtH) % 24);
    }

    // the wind each hour of the run (middle of the hour), for the map and side slice
    const wind = { U: [], ustar: [], from: [] };
    for (let hr = 0; hr < RUN_DAYS * 24; hr++) {
      const tw = t0 / 3600 + hr + 0.5, u = windAt(tw);
      wind.U.push(u); wind.ustar.push(ustarOf(u)); wind.from.push(WX ? wxDir(tw) : (inp.windFrom || 0));
    }
    const U0 = windAt(t0 / 3600), ustar0 = ustarOf(U0);

    function Cexposure() {
      let cb = 0, vb = 0;
      for (let k = 0; k < n; k++) { cb += C[k] * B[k] * col.V[k]; vb += B[k] * col.V[k]; }
      return cb / vb;
    }

    return {
      version: VERSION, inputs: inp, rec, snaps, col, chem, prod, kill, ec, release: rel, hmix0: rec.hmix[0],
      CexpPeak, CmaxPeak, CbotPeak, intCexp, doseMgL, pHbase, amp, wCells, boundTotal, demandTotal, MCtot, Kd, U: U0, ustar: ustar0, wind, realWeather: !!WX,
      capDiquat, swFactor, swClear: cloudSW, fBalance, shelter, tempOffset: offset, KdMin, KdChl, rOther
    };
  }

  // ---------------------------------------------------------------- summaries, events
  function firstIdx(arr, pred, from) { for (let i = from || 0; i < arr.length; i++) if (pred(arr[i], i)) return i; return -1; }

  function summarize(r) {
    const rec = r.rec, out = {};
    out.CexpPeak = r.CexpPeak; out.CmaxPeak = r.CmaxPeak; out.CbotPeak = r.CbotPeak;
    const at = h => rec.K[Math.min(rec.K.length - 1, Math.round(h))];
    out.kill = r.kill ? { atTest: at(r.kill.T), at24: at(24), at48: at(48), at7d: at(168), end: rec.K[rec.K.length - 1] } : null;
    let ip = 0; for (let i = 1; i < rec.MCtop.length; i++) if (rec.MCtop[i] > rec.MCtop[ip]) ip = i;
    out.mcPeak = rec.MCtop[ip]; out.mcPeakDay = rec.hours[ip] / 24;
    const i8 = rec.MCtop[ip] < 8 ? 0 : firstIdx(rec.MCtop, v => v < 8, ip);
    out.mcBelow8Day = i8 < 0 ? null : rec.hours[i8] / 24;
    // total toxin (inside and outside cells): what the EPA and WHO levels are written for
    out.mcTot0 = rec.MCall[0];
    const it8 = firstIdx(rec.MCall, v => v < 8, 0);
    out.mcTotBelow8Day = it8 < 0 ? null : rec.hours[it8] / 24;   // 0 = under 8 from the start; null = still above at day 14
    let io = 0; for (let i = 1; i < rec.DOml.length; i++) if (rec.DOml[i] < rec.DOml[io]) io = i;
    out.doMin = rec.DOml[io]; out.doMinDay = rec.hours[io] / 24;
    out.layeredShare = rec.hmix.filter(h => h < 0.95 * r.col.zmax).length / rec.hmix.length;
    out.ntExpo = S.ntList(r.chem, r.inputs).map(o => o.none ? null : S.ntExposure(rec.Ctop, o).v);
    out.ntExpoBot = S.ntList(r.chem, r.inputs).map(o => o.none ? null : S.ntExposure(rec.Cbot, o).v);
    return out;
  }

  function fmtWhen(h) {
    if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
    if (h < 48) return `${h < 10 ? h.toFixed(1).replace(/\.0$/, '') : Math.round(h)} h`;
    return `day ${(h / 24).toFixed(1).replace(/\.0$/, '')}`;
  }

  // Predicted timeline from one run (usually the central one)
  function events(r) {
    const rec = r.rec, ev = [], ft = 3.28084, inp = r.inputs;
    const unitMul = r.prod.inputUnit === 'µg/L' ? 1000 : 1, unit = r.prod.inputUnit === 'µg/L' ? 'µg/L' : r.prod.unit;
    const f = v => (v * unitMul >= 10 ? (v * unitMul).toFixed(1) : (v * unitMul).toPrecision(2));
    ev.push({ h: 0, kind: 'treat', text: `Treatment: ${r.prod.name}, ${METHOD_NAMES[inp.method].toLowerCase()}. ${r.release.note}` });
    if (r.boundTotal > 0.005 * r.doseMgL * r.col.Vt) ev.push({ h: 0, kind: 'warn', text: `Clay in the water binds ${Math.round(100 * r.boundTotal / (r.doseMgL * r.col.Vt))}% of the diquat, most of it in the first hour or two, as the diquat mixes down and meets it.` });
    if (r.demandTotal > 0) ev.push({ h: 0, kind: 'info', text: `The bloom and other particles use up ${Math.round(100 * r.demandTotal / (r.doseMgL * r.col.Vt))}% of the peroxide on contact.` });
    if (r.hmix0 < 0.95 * r.col.zmax) ev.push({ h: 0, kind: 'info', text: `The pond is layered: a warm top layer about ${(r.hmix0 * ft).toFixed(1)} ft thick sits on cooler water.` });
    // product half gone where the bloom is
    const pk = Math.max(...rec.Cexp), ipk = rec.Cexp.indexOf(pk);
    if (pk > 0) {
      ev.push({ h: rec.hours[ipk], kind: 'chem', text: `Highest exposure where the bloom sits: ${f(pk)} ${unit}.` });
      const ih = firstIdx(rec.Cexp, v => v < 0.5 * pk, ipk);
      if (ih > 0) ev.push({ h: rec.hours[ih], kind: 'chem', text: `Half of that exposure is gone.` });
      const i1 = firstIdx(rec.Cexp, v => v < 0.01 * pk, ipk);
      if (i1 > 0) ev.push({ h: rec.hours[i1], kind: 'chem', text: `Product where the bloom sits is down to 1% of its peak.` });
    }
    const bp = Math.max(...rec.Cbot), ib = rec.Cbot.indexOf(bp);
    if (bp > 2 * pk && bp > 0) ev.push({ h: rec.hours[ib], kind: 'warn', text: `Near the bottom the product peaks at ${f(bp)} ${unit}, ${(bp / Math.max(pk, 1e-12)).toFixed(0)}× what the bloom gets. Bottom-dwelling animals take the biggest dose.` });
    // turnover events
    for (let i = 1; i < rec.hmix.length; i++) {
      if (rec.hmix[i - 1] < 0.95 * r.col.zmax && rec.hmix[i] >= 0.95 * r.col.zmax) { ev.push({ h: rec.hours[i], kind: 'mix', text: 'Night cooling mixes the pond top to bottom.' }); break; }
    }
    if (r.kill) {
      for (const [h, label] of [[24, '1 day'], [48, '2 days']]) {
        const v = rec.K[Math.min(rec.K.length - 1, h)];
        ev.push({ h, kind: 'bloom', text: `${Math.round(v * 100)}% of the bloom knocked down after ${label}.` });
      }
      let im = 0; for (let i = 1; i < rec.MCtop.length; i++) if (rec.MCtop[i] > rec.MCtop[im]) im = i;
      if (rec.MCtop[im] > rec.MCtop[0] * 1.05) ev.push({ h: rec.hours[im], kind: 'toxin', text: `Dissolved toxin near the surface peaks at ${rec.MCtop[im].toFixed(1)} µg/L. Dissolved toxin is the part a water plant's filters don't remove.` });
      // the EPA and WHO levels are for total toxin, inside cells and out
      if (rec.MCall[0] >= 8) {
        ev.push({ h: 0, kind: 'warn', text: `Before treatment the top water already holds about ${rec.MCall[0].toFixed(0)} µg/L of toxin, counting what is inside the cells: above the EPA swimming level (8 µg/L).` });
        const i8 = firstIdx(rec.MCall, v => v < 8, 0);
        ev.push(i8 > 0 ? { h: rec.hours[i8], kind: 'toxin', text: 'Total toxin (inside and outside cells) drops below the EPA swimming level (8 µg/L).' } : { h: rec.hours[rec.hours.length - 1], kind: 'warn', text: 'Total toxin (inside and outside cells) is still above the EPA swimming level (8 µg/L) at day 14.' });
      }
      let io = 0; for (let i = 1; i < rec.DOml.length; i++) if (rec.DOml[i] < rec.DOml[io]) io = i;
      const dmin = rec.DOml[io];
      ev.push({ h: rec.hours[io], kind: dmin < 4 ? 'warn' : 'oxygen', text: `Lowest oxygen in the top layer: ${dmin.toFixed(1)} mg/L (the lowest hour, usually just before dawn)${dmin < 2 ? ', low enough to kill fish' : dmin < 4 ? ', enough to stress fish' : ''}.` });
      const Kend = rec.K[rec.K.length - 1];
      if (Kend > 0.2) ev.push({ h: rec.hours[rec.hours.length - 1], kind: 'rebound', text: `Watch for regrowth: survivors and the nutrients released by dead cells can rebuild a bloom. Field records range from about 1 week (copper bench tests) to 7 weeks (a whole-lake peroxide treatment).` });
    }
    return ev.sort((a, b) => a.h - b.h);
  }

  // Other organisms live in the stirred top water, so they are judged on its average, the same way
  // the lab test was run (see S.ntExposure). Until Oct 21, 2026 the layers model used the highest
  // concentration in any single layer (the 6-inch spray skin), 8× harsher than the well-mixed model.
  function nonTargets(r) {
    const inp = r.inputs;
    return S.ntList(r.chem, inp).map(o => {
      if (o.none) return { who: o.who, none: true, reason: o.reason };
      const ex = S.ntExposure(r.rec.Ctop, o), exB = S.ntExposure(r.rec.Cbot, o);   // and for animals living near the bottom
      return { who: o.who, v: o.v, vLab: o.vLab, hardness: o.hardness, hardnessUsed: o.hardnessUsed, hardnessEstimated: o.hardnessEstimated, hardFactor: o.hardFactor, T: o.T, endpoint: o.endpoint, src: o.src, censored: !!o.censored, pulse: !!o.pulse, expo: ex.v, basis: ex.basis, basisT: ex.T, assumedT: ex.assumedT,
        margin: ex.v > 0 ? o.v / ex.v : Infinity, hoursAbove: r.rec.Ctop.filter(c => c > o.v).length,
        bottomMargin: exB.v > 0 ? o.v / exB.v : Infinity };
    });
  }

  function warnings(r) {
    const w = [], inp = r.inputs;
    if (r.hmix0 < 0.95 * r.col.zmax) w.push({ level: 'mid', text: 'The model thinks the pond is layered at treatment time. A surface treatment mostly stays in the warm top layer, and anything below the thermocline gets little.' });
    if (inp.method === 'granules' && r.release.landedFrac > 0.2) w.push({ level: 'high', text: `About ${Math.round(r.release.landedFrac * 100)}% of the solid lands on the bottom before dissolving. Bottom water gets a concentrated dose while the floating bloom gets less.` });
    if (inp.method === 'inject') w.push({ level: 'mid', text: 'Dense liquids released below the surface sink. The model pools them in the deepest water; a moving boat spreads them more than this.' });
    if (inp.target === 'microcystis') w.push({ level: 'low', text: `Microcystis colonies are treated as staying buoyant (rise speed about ${(r.wCells * 3600).toFixed(2)} m/h). Real colonies sink a little by day and rise at night; that cycle isn't modeled yet.` });
    if (inp.target === 'anabaena') w.push({ level: 'low', text: 'No measured float speed was found for Anabaena/Dolichospermum; the model uses a slow rise as an estimate.' });
    w.push({ level: 'low', text: 'Oxygen is shown for the top layer only. Bottom water in a layered pond can be much lower and is not modeled yet.' });
    if (r.realWeather) {
      const W = inp.weather;
      w.push({ level: 'low', text: `Weather is hour by hour from ${W.source || 'a weather service'}${W.place ? ' for ' + W.place : ''}: wind, air temperature, humidity, clouds and sunlight. The wind is for open ground 10 m (33 ft) up, averaged over a few miles, then reduced for the trees around the pond as you chose; the pond itself can be calmer or gustier.${W.forecast ? ' Forecasts lose skill after about a week, so treat days 8-14 as rough.' : ''}${W.filledFrom != null ? ` The weather service covered only part of the 14 days, so the last ${Math.round((W.U.length - W.filledFrom) / 24)} day(s) repeat its final day.` : ''}` });
    } else {
      w.push({ level: 'low', text: `Weather is an idealized repeat of one day, with ${Math.round(r.swFactor * 100)}% of clear-sky sunlight for your sky choice. The water starts at your reading and then follows that weather, so over two weeks it can drift ${r.fBalance != null && r.fBalance < r.swFactor - 0.1 ? 'warmer' : r.fBalance != null && r.fBalance > r.swFactor + 0.1 ? 'cooler' : 'a little'}; the temperature chart shows it.` });
    }
    const used = [];
    if (inp.meanDepthM > 0) used.push(`average depth ${(inp.meanDepthM * 3.28084).toFixed(1)} ft`);
    if (inp.bottomC != null && isFinite(inp.bottomC)) used.push(`bottom water ${Math.round(inp.bottomC * 9 / 5 + 32)} °F`);
    if (inp.secchiM > 0) used.push(`Secchi depth ${(inp.secchiM * 3.28084).toFixed(1)} ft`);
    if (inp.mcMeasured > 0) used.push(`total toxin ${inp.mcMeasured} µg/L`);
    if (inp.hardness > 0) used.push(`hardness ${inp.hardness} mg/L`);
    if (inp.h2o2HalfLifeH > 0) used.push(`peroxide half-life ${inp.h2o2HalfLifeH} h`);
    if (inp.myEC50 && inp.myEC50.v > 0) used.push(`your own EC50 (${inp.myEC50.T > 0 ? inp.myEC50.T : 24}-hour test)`);
    if (used.length) w.push({ level: 'low', text: `Using your measurements in place of the model's estimates: ${used.join(', ')}. The uncertainty runs no longer vary these.` });
    if (r.tempOffset != null && Math.abs(r.tempOffset) > 2.2) {
      w.push({ level: 'mid', text: `Your water temperature and the ${r.realWeather ? 'weather' : 'air and sky you entered'} disagree: over the two warm-up days the model pond's surface ran about ${Math.round(Math.abs(r.tempOffset) * 9 / 5)} °F ${r.tempOffset < 0 ? 'warmer' : 'cooler'} than your reading. The model kept your reading for the stirred top water and left the deeper water alone. Check the reading${r.realWeather ? ' and the date' : ''}.` });
    }
    return w;
  }

  // ---------------------------------------------------------------- runner with uncertainty
  function run(inp, opts) {
    opts = opts || {};
    const pv0 = S.centralFrom(ALL_PARAMS);
    const c = simulate(inp, pv0, { snapshots: true });
    const sm = summarize(c);
    const res = { version: VERSION, inputs: inp, central: c, summary: sm, events: events(c), nonTargets: nonTargets(c), warnings: warnings(c) };
    // The two kill models are shown as two scenarios, not mixed in one band: the runs use individual
    // tolerance (closer to the one field check); here is the central run if cells instead die at random.
    if (c.kill) { const alt = summarize(simulate(inp, Object.assign({}, pv0, { kill_struct: 0.25 }), {})); res.altSD = { kill48: alt.kill.at48, kill7d: alt.kill.at7d }; }
    const N = opts.members == null ? 200 : opts.members;
    if (N > 0) {
      const seed = opts.seed == null ? 20261019 : opts.seed;
      const members = S.lhsSamplesFrom(ALL_PARAMS, N, seed).map(pv => simulate(inp, pv, {}));
      const keys = ['Cexp', 'Ctop', 'Cbot', 'Cmax', 'K', 'MCtop', 'MCall', 'DOml', 'pH', 'hmix'];
      const band = {}, nT = c.rec.hours.length, col = new Array(N);
      for (const k of keys) {
        band[k] = { p05: new Array(nT), p50: new Array(nT), p95: new Array(nT) };
        for (let i = 0; i < nT; i++) {
          for (let m = 0; m < N; m++) col[m] = members[m].rec[k][i];
          col.sort((a, b) => a - b);
          band[k].p05[i] = S.percentile(col, 0.05); band[k].p50[i] = S.percentile(col, 0.5); band[k].p95[i] = S.percentile(col, 0.95);
        }
      }
      const sums = members.map(summarize);
      const pick = fn => {
        const v = sums.map(fn).filter(x => x != null && isFinite(x)).sort((a, b) => a - b);
        return v.length ? { p05: S.percentile(v, 0.05), p50: S.percentile(v, 0.5), p95: S.percentile(v, 0.95) } : null;
      };
      res.ensemble = {
        n: N, seed, band,
        CexpPeak: pick(s => s.CexpPeak), CmaxPeak: pick(s => s.CmaxPeak), CbotPeak: pick(s => s.CbotPeak),
        kill48: c.kill ? pick(s => s.kill ? s.kill.at48 : null) : null,
        mcPeak: pick(s => s.mcPeak), mcBelow8Day: pick(s => s.mcBelow8Day == null ? RUN_DAYS + 1 : s.mcBelow8Day),
        mcTot0: pick(s => s.mcTot0), mcTotBelow8Day: pick(s => s.mcTotBelow8Day == null ? RUN_DAYS + 1 : s.mcTotBelow8Day),
        ntExpo: (sums[0].ntExpo || []).map((_, j) => pick(s => s.ntExpo[j])),
        ntExpoBot: (sums[0].ntExpoBot || []).map((_, j) => pick(s => s.ntExpoBot[j])),
        centralPct48: c.kill ? sums.filter(s => s.kill && s.kill.at48 < sm.kill.at48).length / sums.length : null,
        doMin: pick(s => s.doMin)
      };
    }
    return res;
  }

  const api = {
    shelterFactor, surfaceExchange, freeConvVel, heatCoeff, vapCoeff,
    VERSION, DT, SPIN_DAYS, RUN_DAYS, PARAMS2, SRC2, GRADES, METHODS, METHOD_NAMES, ALL_PARAMS,
    simulate, run, summarize, events, column, releaseProfile, grainFall, settling, colonyRise, diffuse, thomas,
    secchiFromChl, clearSkyGHI, solarElevationSin, dragCoeff, decayRate, dmAt, KAPPA, reaerationVel, doEquilibrium
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CyanoColumn = api;
})(typeof window !== 'undefined' ? window : globalThis);

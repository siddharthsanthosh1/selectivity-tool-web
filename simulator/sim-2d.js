/*
 * CyanoSelect pond-treatment simulator: the 2-D views (map from above, side slice)
 * --------------------------------------------------------------------------
 * Both views run on top of the layered column model (sim-column.js). The column supplies, hour by
 * hour, how deep the wind-stirred top layer is, how strongly each depth mixes, and the water
 * temperature and bloom profile with depth. The 2-D models add sideways movement:
 *
 * MAP (from above)
 *   - the pond outline (preset shape or drawn) on a grid of about 450 square cells, with depths
 *     arranged so the area-depth curve matches the column's bowl exactly
 *   - wind-driven currents in two parts:
 *       (1) a swirl (topographic gyre): with a rigid lid and linear bottom friction, the
 *           depth-averaged flow solves one elliptic equation for a streamfunction. It runs
 *           downwind over shallow edges and back upwind over the deep middle.
 *       (2) a counterflow: the top of the stirred layer slides downwind and the water under it
 *           returns, with the textbook parabolic profile (eddy viscosity κu*H/6).
 *   - the stirred layer is split into 4 sublayers, plus the cool bottom layer when the pond is
 *     layered; product moves by these currents, sideways mixing and vertical mixing, and decays
 *     with the same loss laws as the column
 *   - colonies are 1,000 tracked particles. Each one drifts with the current, mixes up and down
 *     (random walk with the column's mixing profile), floats up at its rise speed, and carries
 *     its own damage and its own toughness, so the kill is worked out colony by colony.
 *
 * SIDE SLICE
 *   - a vertical cut through the deepest point along the wind, treated as a channel of uniform
 *     width (like laterally averaged reservoir models); the same counterflow, now with the
 *     upwelling at the upwind shore and sinking at the downwind shore that it implies
 *
 * ADDED IN 0.4 (both views)
 *   - toxin and oxygen: dissolved toxin, the oxygen deficit and dead bloom carbon are carried per
 *     cell and layer. Knocked-down colonies leak toxin and become dead biomass where they are, at the
 *     column's rates; toxin breaks down after the column's lag; dead biomass uses oxygen; the bed
 *     uses oxygen where the stirred water touches it; the surface takes oxygen back in.
 *   - thermocline tilt: the steady two-layer balance tilts the boundary by u*²/(g′h), deeper
 *     downwind, reached over about a quarter of the internal seiche period; the upwind edge can
 *     reach the surface (upwelling).
 *   - the fast surface skin: about 0.53 × the air-side friction velocity at the surface (Wu 1975),
 *     fading over about a centimetre.
 *   - dense injected liquids: an injection into water that is not layered forms a film on the bed
 *     that slides toward deeper water as a gravity current and mixes into the water above.
 *
 * Every output is a MODEL PREDICTION.
 * Not modeled: inflows, waves (and their Stokes drift), the sloshing (internal seiche) after the
 * wind changes, oxygen in the cool bottom layer, Earth's rotation (negligible at pond scale).
 */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const S = isNode ? require('./sim-core.js') : root.CyanoSim;
  const CC = isNode ? require('./sim-column.js') : root.CyanoColumn;

  const VERSION = '0.4.0-2d';
  const KAPPA = 0.41;
  const GYRE_PUSH = 1.5;         // depth-averaged swirl push ÷ wind stress (wind + bed drag of the counterflow)
  const NA = 4;                 // sublayers in the wind-stirred top layer
  // Their boundaries, as shares of the stirred depth from the top down. The top one is thin (7%) so a
  // spray stays in the top few inches as in the layers model and the slice. (Until Oct 22, 2026 the
  // four were equal, so a spray went into a quarter of the stirred depth, a foot or more: early
  // exposure on the map was 2.4-5x lower than in the other views right when scums form.)
  const BF = [0, 0.07, 0.2, 0.45, 1];
  function subOf(sig) { let m = 0; while (m < NA - 1 && sig >= BF[m + 1]) m++; return m; }
  const NW_TARGET = 450;        // wet map cells
  const NX_SLICE = 60;          // columns in the side slice
  const NP_MAP = 1000, NP_SLICE = 600;
  const NSHOW_MAP = 500, NSHOW_SLICE = 400;
  const DTP_STEPS = [30, 36, 40, 45, 48, 50, 60, 72, 75, 80, 90, 100, 120, 144, 150, 180];   // particle steps that divide an hour, s
  const H_MIN = 0.1;            // shallowest water depth used, m (the rank-matched shore cells can be thinner)
  const RUN_H = CC.RUN_DAYS * 24;

  const SRC3 = {
    peeters2015: { label: 'Peeters & Hofmann 2015, Limnology & Oceanography (sideways mixing measured with drifters, Lake Constance)', url: 'https://kops.uni-konstanz.de/entities/publication/d0369695-dc41-46c4-afe7-96fd24d49257/full' },
    visser1997: { label: 'Visser 1997, Marine Ecology Progress Series 158 (random-walk particles with depth-varying mixing; standard method, not re-read in this build)', url: 'https://doi.org/10.3354/meps158275' },
    wu1975: { label: 'Wu 1975, Journal of Fluid Mechanics 68 (wind-induced surface drift ≈ 0.53 × wind friction velocity, 0.4-0.7; wind-wave tank)', url: CC.SRC2.wu1975.url },
    hogg2001: { label: 'Hogg & Woods 2001, Journal of Fluid Mechanics 449 (front condition u = Fr·√(g′h), Fr = 1.19 measured by Huppert & Simpson 1980)', url: 'https://people.maths.bris.ac.uk/~maajh/PDFPapers/JFMDrag.pdf' },
    wiki_h2o2: { label: 'Wikipedia, Hydrogen peroxide (density of water solutions at 20 °C)', url: 'https://en.wikipedia.org/wiki/Hydrogen_peroxide' },
    cutrine_sds: { label: 'Cutrine-Plus safety data sheet (specific gravity 1.220-1.230; 9% copper)', url: 'https://www.domyown.com/msds/CutrinePlus_MSDS.pdf' },
    reward_label: { label: 'Reward herbicide label, EPA Reg. No. 100-1091 (37.3% diquat dibromide; 2 lb cation and 3.73 lb salt per gallon)', url: 'https://www3.epa.gov/pesticides/chem_search/ppls/000100-01091-20250929.pdf' },
    aquathol_label: { label: 'Aquathol K label (40.3% dipotassium endothall, 28.6% acid equivalent, 4.23 lb salt per gallon)', url: 'https://www.solitudelakemanagement.com/wp-content/uploads/2021/03/Aquathol_K-1.pdf' },
    blueprint: S.SRC.blueprint
  };

  const PARAMS3 = {
    kh_scale:  { v: 2e-4, lo: 1e-4, hi: 3e-4, units: 'm²/s per m of pond size', status: 'ESTIMATE', src: 'peeters2015', note: 'Sideways mixing grows with scale: about 0.01-0.03 m²/s at 100 m in Lake Constance. Extrapolated down to pond size (square root of the area).' },
    us_coef:   { v: 1.5 / KAPPA, units: '× water friction velocity', status: 'DERIVED', src: 'blueprint', note: 'Surface speed of the wind-driven counterflow from the parabolic profile with eddy viscosity κu*H/6: about 0.5% of the wind speed. The faster top-centimetre skin is added on top (skin_coef).' },
    gyre_r:    { v: 0.5 * KAPPA, units: '× water friction velocity (m/s)', status: 'DERIVED centre, ESTIMATE range', src: 'blueprint', note: 'Range 0.07-0.2 × u*: a quadratic bed drag (drag coefficient about 0.0025) gives about 0.07; the swirl scales with 1 ÷ this. Friction on the depth-averaged swirl, r = 3·Av/D = κu*/2, from the same eddy viscosity and no-slip bottom as the counterflow profile. No pond current measurements were found to check it.' },
    skin_coef: { v: 0.53, lo: 0.4, hi: 0.7, units: '× air-side friction velocity', status: 'SOURCED', src: 'wu1975', note: 'Wind-driven drift at the very surface, measured in a wind-wave tank: 0.53 (0.4-0.7) × the air-side friction velocity, roughly 2% of the wind speed. Wave (Stokes) drift would add more; it is not included.' },
    skin_d:    { v: 0.01, lo: 0.003, hi: 0.03, units: 'm', status: 'ESTIMATE', src: 'wu1975', note: 'Depth over which the fast surface drift fades, taken as exponential. Wu (1975) describes a viscous and buffer layer millimetres thick under the surface; the shape and this depth are estimates.' },
    tilt:      { v: 1, units: '× steady tilt u*²/(g′h)', status: 'DERIVED', src: 'blueprint', note: 'Thermocline tilt from the steady two-layer balance (the one behind the Wedderburn number). Reached within about a quarter of the internal seiche period, minutes to a couple of hours in ponds; the sloshing after the wind changes is not modeled. Set to 0 to switch the tilt off.' },
    film_h:    { v: 0.2, lo: 0.1, hi: 0.3, units: 'm', status: 'ESTIMATE', src: 'blueprint', note: 'Thickness of the dense layer an injected liquid forms on the bed. The product is spread over each treated cell in this layer at once; the plume right at the hose is not modeled.' },
    front_Fr:  { v: 1.19, units: '', status: 'SOURCED', src: 'hogg2001', note: 'Front speed of a dense current, u = Fr·√(g′h). Lab value on a flat bed (Huppert & Simpson 1980, as quoted by Hogg & Woods 2001); a sloping bed speeds a current up.' },
    film_E:    { v: 0.005, lo: 0.001, hi: 0.02, units: '× film speed', status: 'ESTIMATE', src: 'blueprint', note: 'How fast the film mixes into the water above as it moves (entrainment rate E·u/h).' },
    film_Ri:   { v: 1, lo: 0.25, hi: 4, units: '', status: 'ESTIMATE', src: 'blueprint', note: 'Wind stirring mixes the film into the bottom water at once when g′h/u*² falls below this (a bulk Richardson number).' },
    ai_h2o2:   { v: 0.35, lo: 0.27, hi: 0.5, units: 'share of product', status: 'ESTIMATE', src: 'wiki_h2o2', note: 'Liquid peroxide products are sold at about 27-50%; 35% assumed.' },
    rho_h2o2:  { v: 1130, units: 'kg/m³', status: 'SOURCED', src: 'wiki_h2o2', note: '35% hydrogen peroxide solution at 20 °C.' },
    ai_cuchel: { v: 0.09, units: 'share of product (as Cu)', status: 'SOURCED', src: 'cutrine_sds', note: 'Copper ethanolamine complex product (Cutrine-Plus).' },
    rho_cuchel:{ v: 1225, units: 'kg/m³', status: 'SOURCED', src: 'cutrine_sds', note: 'Specific gravity 1.220-1.230.' },
    ai_diquat: { v: 0.20, units: 'share of product (as cation)', status: 'DERIVED', src: 'reward_label', note: '2 lb cation in 10.0 lb of product per gallon. If the dose entered is diquat dibromide rather than cation, use 0.373 (the open cation-or-salt question).' },
    rho_diquat:{ v: 1198, units: 'kg/m³', status: 'DERIVED', src: 'reward_label', note: '3.73 lb diquat dibromide per gallon at 37.3% = 10.0 lb per gallon.' },
    ai_endothall: { v: 0.286, units: 'share of product (acid equivalent)', status: 'SOURCED', src: 'aquathol_label', note: 'Aquathol K.' },
    rho_endothall:{ v: 1258, units: 'kg/m³', status: 'DERIVED', src: 'aquathol_label', note: '4.23 lb dipotassium endothall per gallon at 40.3% = 10.5 lb per gallon.' }
  };

  const SHAPES = {
    round: 'Round',
    oval: 'Oval (2 : 1)',
    long: 'Long and narrow (3.5 : 1)',
    cove: 'Irregular, with lobes',
    custom: 'Drawn by you'
  };
  const WHERE = {
    whole: 'Whole pond',
    upwind_half: 'Upwind half',
    downwind_half: 'Downwind half',
    upwind_strip: 'Strip along the upwind shore (a third)',
    downwind_strip: 'Strip along the downwind shore (a third)',
    middle: 'A spot in the middle (a tenth)',
    custom: 'Painted on the map'
  };

  // ---------------------------------------------------------------- random numbers
  function rngPair(seed) {
    const u = S.mulberry32(seed);
    let spare = null;
    return {
      u,
      // zero-mean, unit-variance step for the random walks. Visser (1997) allows any such process;
      // a uniform one is much cheaper than a Gaussian and gives the same spreading over many steps.
      g() { return (2 * u() - 1) * 1.7320508075688772; },
      normal() {                              // true standard normal (Box-Muller), when needed
        if (spare !== null) { const s = spare; spare = null; return s; }
        let a = u(); if (a < 1e-12) a = 1e-12;
        const r = Math.sqrt(-2 * Math.log(a)), t = 2 * Math.PI * u();
        spare = r * Math.sin(t); return r * Math.cos(t);
      }
    };
  }

  // ---------------------------------------------------------------- geometry
  function shapeOutline(shape, custom) {
    if (shape === 'custom' && custom && custom.length >= 3) return custom.map(p => [+p[0], +p[1]]);
    const n = 96, pts = [];
    for (let i = 0; i < n; i++) {
      const t = 2 * Math.PI * i / n;
      let x, y;
      if (shape === 'oval') { x = 2 * Math.cos(t); y = Math.sin(t); }
      else if (shape === 'long') { x = 3.5 * Math.cos(t); y = Math.sin(t); }
      else if (shape === 'cove') {
        const r = 1 + 0.22 * Math.sin(2 * t + 0.6) + 0.12 * Math.cos(3 * t) - 0.1 * Math.sin(t);
        x = 1.25 * r * Math.cos(t); y = r * Math.sin(t);
      } else { x = Math.cos(t); y = Math.sin(t); }
      pts.push([x, y]);
    }
    return pts;
  }
  function polyArea(P) {
    let a = 0;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) a += P[j][0] * P[i][1] - P[i][0] * P[j][1];
    return a / 2;
  }
  // Does the outline cross itself (a bow tie or a loop)? Proper crossings of non-neighbouring edges.
  function selfCrossing(P) {
    const n = P.length;
    if (n < 4) return false;
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;           // neighbours through the closing edge
        const c = P[j], d = P[(j + 1) % n];
        if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) return true;
      }
    }
    return false;
  }
  function inPoly(x, y, P) {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const xi = P[i][0], yi = P[i][1], xj = P[j][0], yj = P[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
    }
    return c;
  }
  function distToPoly(x, y, P) {
    let d2 = Infinity;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const ax = P[j][0], ay = P[j][1], bx = P[i][0], by = P[i][1];
      const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
      let t = L2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const dx = x - (ax + t * vx), dy = y - (ay + t * vy), q = dx * dx + dy * dy;
      if (q < d2) d2 = q;
    }
    return Math.sqrt(d2);
  }

  // Map grid. Depths are assigned by distance from shore, then rank-matched so the share of area
  // deeper than z is (1 - z/zmax)^p, exactly the column model's bowl.
  function buildGrid(inp, pv) {
    const col = CC.column(inp, pv);
    let P = shapeOutline(inp.shape, inp.outline), usedShape = inp.shape === 'custom' && inp.outline && inp.outline.length >= 3 ? 'custom' : (SHAPES[inp.shape] ? inp.shape : 'round');
    const crossing = usedShape === 'custom' && selfCrossing(P);
    let a = Math.abs(polyArea(P));
    if (!(a > 1e-9) || P.length < 3) { P = shapeOutline('round'); a = Math.abs(polyArea(P)); usedShape = 'round'; }
    let cx0 = 0, cy0 = 0; for (const p of P) { cx0 += p[0]; cy0 += p[1]; } cx0 /= P.length; cy0 /= P.length;
    let sc = Math.sqrt(col.A0 / a);
    const dx = Math.sqrt(col.A0 / NW_TARGET);
    // Size the outline so the squares inside it cover the pond's area (within 5%). For an outline that
    // doesn't cross itself the formula area already does; for one that does (a bow tie), the formula
    // area is too small and the squares are counted instead. (Until Oct 22, 2026 a bow-tie outline
    // made a map 2.6x the area typed.) The page refuses outlines that cross themselves.
    let Ps, nx, ny, x0, y0, cellOf, ci, cj, nw = 0, areaFix = 1;
    for (let it = 0; it < 6; it++) {
      Ps = P.map(p => [(p[0] - cx0) * sc, (p[1] - cy0) * sc]);
      let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
      for (const p of Ps) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); }
      x0 = minx - dx; y0 = miny - dx;
      nx = Math.ceil((maxx - minx) / dx) + 2; ny = Math.ceil((maxy - miny) / dx) + 2;
      cellOf = new Int32Array(nx * ny).fill(-1); ci = []; cj = [];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const x = x0 + (i + 0.5) * dx, y = y0 + (j + 0.5) * dx;
        if (inPoly(x, y, Ps)) { cellOf[j * nx + i] = ci.length; ci.push(i); cj.push(j); }
      }
      nw = ci.length;
      const ratio = nw * dx * dx / col.A0;
      if (nw < 20 || Math.abs(ratio - 1) <= 0.05) break;
      sc /= Math.sqrt(ratio); areaFix /= Math.sqrt(ratio);
    }
    P = Ps;
    if (nw < 20) {                      // a degenerate drawn outline: fall back to round
      return buildGrid(Object.assign({}, inp, { shape: 'round', outline: null }), pv);
    }
    const dist = new Float64Array(nw);
    for (let k = 0; k < nw; k++) dist[k] = distToPoly(x0 + (ci[k] + 0.5) * dx, y0 + (cj[k] + 0.5) * dx, P);
    // Which squares are deepest. A natural pond: those farthest from shore. A dammed pond
    // (inp.deepSpot 'N', 'E', 'S' or 'W'): deepest toward that shore (about 70% of the way there),
    // shallow at the far inflow end, and still shallow along every shore.
    let score = dist;
    const dsv = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] }[inp.deepSpot];
    if (dsv) {
      const proj = new Float64Array(nw); let pmin = Infinity, pmax = -Infinity, dmax = 0;
      for (let k = 0; k < nw; k++) { proj[k] = (x0 + (ci[k] + 0.5) * dx) * dsv[0] + (y0 + (cj[k] + 0.5) * dx) * dsv[1]; pmin = Math.min(pmin, proj[k]); pmax = Math.max(pmax, proj[k]); dmax = Math.max(dmax, dist[k]); }
      score = new Float64Array(nw);
      for (let k = 0; k < nw; k++) score[k] = Math.sqrt(dist[k] / Math.max(1e-9, dmax)) * Math.pow((proj[k] - pmin) / Math.max(1e-9, pmax - pmin), 3);
    }
    const order = Array.from({ length: nw }, (_, k) => k).sort((p, q) => score[q] - score[p]);
    // Depths rank-matched to the bowl, with a floor for the shore squares. The floor is 0.1 m, or a
    // sixth of the deepest point in a very shallow pond, and the squares above the floor are then
    // shallowed a little so the map holds exactly the column's water. (Until Oct 22, 2026 the 0.1 m
    // floor alone added water: 18.5% too much in a 1-ft pond, 4.4% at 2 ft.)
    const hmin = Math.min(H_MIN, col.zmax / 6);
    const h = new Float64Array(nw);
    let sumH = 0, sumAbove = 0, nAbove = 0;
    for (let r = 0; r < nw; r++) {
      const f = (r + 0.5) / nw;                                  // share of area deeper than this cell
      h[order[r]] = Math.max(hmin, col.zmax * (1 - Math.pow(f, 1 / col.p)));
      sumH += h[order[r]]; if (h[order[r]] > hmin) { sumAbove += h[order[r]] - hmin; nAbove++; }
    }
    const want = col.zmean * nw;                                  // the column's mean depth over every square
    if (sumH > want && sumAbove > 0) {
      const sh = Math.max(0, (want - nw * hmin) / sumAbove);
      for (let k = 0; k < nw; k++) if (h[k] > hmin) h[k] = hmin + (h[k] - hmin) * sh;
    }
    let V = 0; for (let k = 0; k < nw; k++) V += h[k] * dx * dx;
    let cxw = 0, cyw = 0; for (let k = 0; k < nw; k++) { cxw += x0 + (ci[k] + 0.5) * dx; cyw += y0 + (cj[k] + 0.5) * dx; }
    return {
      nx, ny, dx, x0, y0, cellOf, ci: Int32Array.from(ci), cj: Int32Array.from(cj), nw, h, dist, P,
      zmax: col.zmax, p: col.p, A0: col.A0, area: nw * dx * dx, V, deepest: order[0], hmin,
      cx: cxw / nw, cy: cyw / nw, shape: usedShape, crossing, areaFix
    };
  }
  function cellCenter(g, k) { return [g.x0 + (g.ci[k] + 0.5) * g.dx, g.y0 + (g.cj[k] + 0.5) * g.dx]; }
  function cellAt(g, x, y) {
    const i = Math.floor((x - g.x0) / g.dx), j = Math.floor((y - g.y0) / g.dx);
    if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) return -1;
    return g.cellOf[j * g.nx + i];
  }

  // Wind blowing FROM windFrom degrees (0 = north, 90 = east): unit vector it blows TOWARD (x east, y north)
  function windVec(windFrom) { const t = ((windFrom || 0) + 180) * Math.PI / 180; return [Math.sin(t), Math.cos(t)]; }

  function treatMask(g, where, windFrom, custom) {
    const nw = g.nw, m = new Uint8Array(nw);
    if (where === 'custom' && custom && custom.length) {
      let any = false; for (const k of custom) if (k >= 0 && k < nw) { m[k] = 1; any = true; }
      if (any) return m;
    }
    if (!where || where === 'whole' || !WHERE[where]) { m.fill(1); return m; }
    const w = windVec(windFrom);
    const s = new Float64Array(nw), d = new Float64Array(nw);
    for (let k = 0; k < nw; k++) {
      const c = cellCenter(g, k);
      s[k] = (c[0] - g.cx) * w[0] + (c[1] - g.cy) * w[1];
      d[k] = Math.hypot(c[0] - g.cx, c[1] - g.cy);
    }
    const idx = Array.from({ length: nw }, (_, k) => k);
    let pick;
    if (where === 'middle') { idx.sort((p, q) => d[p] - d[q]); pick = idx.slice(0, Math.max(1, Math.round(nw * 0.1))); }
    else {
      idx.sort((p, q) => s[p] - s[q]);
      const half = Math.round(nw / 2), third = Math.round(nw / 3);
      if (where === 'upwind_half') pick = idx.slice(0, half);
      else if (where === 'downwind_half') pick = idx.slice(nw - half);
      else if (where === 'upwind_strip') pick = idx.slice(0, third);
      else pick = idx.slice(nw - third);
    }
    for (const k of pick) m[k] = 1;
    return m;
  }

  // ---------------------------------------------------------------- the wind-driven swirl (gyre)
  // Steady, rigid lid, linear friction r: r U/D² - τ/(ρD) = -g∇η has no circulation, and ∇·U = 0
  // gives U from a streamfunction ψ. Discretely: ψ on cell corners, transports through faces are ψ
  // differences (so the flow is divergence-free to rounding), and the zero-circulation condition
  // around each interior corner gives a symmetric positive-definite system, solved by conjugate
  // gradients. Corners touching land have ψ = 0, so nothing flows through the shore.
  function solveGyre(g, Dc, tx, ty, r, rFace) {
    const nx = g.nx, ny = g.ny, dx = g.dx, cellOf = g.cellOf;
    const DxF = new Float64Array((nx + 1) * ny), DyF = new Float64Array(nx * (ny + 1));
    for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) {
      const c1 = cellOf[j * nx + i - 1], c2 = cellOf[j * nx + i];
      if (c1 >= 0 && c2 >= 0) DxF[j * (nx + 1) + i] = Math.min(Dc[c1], Dc[c2]);
    }
    for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c1 = cellOf[(j - 1) * nx + i], c2 = cellOf[j * nx + i];
      if (c1 >= 0 && c2 >= 0) DyF[j * nx + i] = Math.min(Dc[c1], Dc[c2]);
    }
    const NN = (nx + 1) * (ny + 1), nodeId = new Int32Array(NN).fill(-1), nodes = [];
    const wetAt = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && cellOf[j * nx + i] >= 0;
    for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++)
      if (wetAt(i - 1, j - 1) && wetAt(i, j - 1) && wetAt(i - 1, j) && wetAt(i, j)) { nodeId[j * (nx + 1) + i] = nodes.length; nodes.push(j * (nx + 1) + i); }
    const nn = nodes.length;
    const diag = new Float64Array(nn), rhs = new Float64Array(nn);
    const nbr = new Int32Array(nn * 4).fill(-1), cof = new Float64Array(nn * 4);
    for (let q = 0; q < nn; q++) {
      const id = nodes[q], i = id % (nx + 1), j = (id - i) / (nx + 1);
      const Da = DxF[(j - 1) * (nx + 1) + i], Db = DyF[j * nx + i], Dc_ = DxF[j * (nx + 1) + i], Dd = DyF[j * nx + i - 1];
      const ra = rFace ? rFace.x[(j - 1) * (nx + 1) + i] : r, rb = rFace ? rFace.y[j * nx + i] : r, rc = rFace ? rFace.x[j * (nx + 1) + i] : r, rd = rFace ? rFace.y[j * nx + i - 1] : r;
      const Ra = ra / (Da * Da), Rb = rb / (Db * Db), Rc = rc / (Dc_ * Dc_), Rd = rd / (Dd * Dd);
      diag[q] = Ra + Rb + Rc + Rd;
      rhs[q] = dx * (tx / Da + ty / Db - tx / Dc_ - ty / Dd);
      const nb = [nodeId[(j - 1) * (nx + 1) + i], nodeId[j * (nx + 1) + i + 1], nodeId[(j + 1) * (nx + 1) + i], nodeId[j * (nx + 1) + i - 1]];
      const cf = [Ra, Rb, Rc, Rd];
      for (let s = 0; s < 4; s++) { nbr[q * 4 + s] = nb[s]; cof[q * 4 + s] = cf[s]; }
    }
    // preconditioned conjugate gradients (Jacobi), started from the last solution on this grid (the
    // flow states of one run differ only a little). The flow is divergence-free whatever the
    // tolerance, because transports are differences of ψ; the tolerance only sets the swirl's accuracy.
    const psi = new Float64Array(nn), res = Float64Array.from(rhs), z = new Float64Array(nn), pdir = new Float64Array(nn), Ap = new Float64Array(nn);
    let bnorm = 0; for (let q = 0; q < nn; q++) bnorm += rhs[q] * rhs[q]; bnorm = Math.sqrt(bnorm);
    if (bnorm > 0 && g._psiWarm && g._psiWarm.length === nn) {
      psi.set(g._psiWarm);
      for (let q = 0; q < nn; q++) {
        let v = diag[q] * psi[q];
        for (let s = 0; s < 4; s++) { const b = nbr[q * 4 + s]; if (b >= 0) v -= cof[q * 4 + s] * psi[b]; }
        res[q] = rhs[q] - v;
      }
    }
    if (bnorm > 0) {
      for (let q = 0; q < nn; q++) { z[q] = res[q] / diag[q]; pdir[q] = z[q]; }
      let rz = 0; for (let q = 0; q < nn; q++) rz += res[q] * z[q];
      for (let it = 0; it < 4000; it++) {
        for (let q = 0; q < nn; q++) {
          let v = diag[q] * pdir[q];
          for (let s = 0; s < 4; s++) { const b = nbr[q * 4 + s]; if (b >= 0) v -= cof[q * 4 + s] * pdir[b]; }
          Ap[q] = v;
        }
        let pAp = 0; for (let q = 0; q < nn; q++) pAp += pdir[q] * Ap[q];
        const alpha = rz / pAp;
        let rn = 0;
        for (let q = 0; q < nn; q++) { psi[q] += alpha * pdir[q]; res[q] -= alpha * Ap[q]; rn += res[q] * res[q]; }
        if (Math.sqrt(rn) < 1e-9 * bnorm) break;
        let rz2 = 0; for (let q = 0; q < nn; q++) { z[q] = res[q] / diag[q]; rz2 += res[q] * z[q]; }
        const beta = rz2 / rz; rz = rz2;
        for (let q = 0; q < nn; q++) pdir[q] = z[q] + beta * pdir[q];
      }
    }
    if (bnorm > 0) g._psiWarm = psi;
    const psiAt = (i, j) => { const q = nodeId[j * (nx + 1) + i]; return q >= 0 ? psi[q] : 0; };
    const Tx = new Float64Array((nx + 1) * ny), Ty = new Float64Array(nx * (ny + 1));
    for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) if (DxF[j * (nx + 1) + i] > 0) Tx[j * (nx + 1) + i] = psiAt(i, j + 1) - psiAt(i, j);
    for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) if (DyF[j * nx + i] > 0) Ty[j * nx + i] = psiAt(i, j) - psiAt(i + 1, j);
    return { Tx, Ty, DxF, DyF, psiAt, nodes: nn };
  }

  // Sublayer shares of the two vertical shapes (ζ measured up from the bottom of the stirred layer):
  //   swirl part (no-slip bottom, no stress at top): 3(ζ - ζ²/2), integrates to 1
  //   counterflow part: 3ζ² - 2ζ, integrates to 0 (as much flows back as forward)
  function sublayerShares() {
    const G = z => 3 * (z * z / 2 - z * z * z / 6), Si = z => z * z * z - z * z;
    const gf = new Float64Array(NA), sf = new Float64Array(NA);
    for (let m = 0; m < NA; m++) {                  // m = 0 is the top sublayer
      const zb = 1 - BF[m], za = 1 - BF[m + 1];
      gf[m] = G(zb) - G(za); sf[m] = Si(zb) - Si(za);
    }
    return { gf, sf };
  }
  const SHARES = sublayerShares();
  // each sublayer's mean of the swirl's and the counterflow's depth profiles (share of flux ÷ share of depth)
  const GMEAN = Float64Array.from(SHARES.gf, (v, m) => v / (BF[m + 1] - BF[m])), SMEAN = Float64Array.from(SHARES.sf, (v, m) => v / (BF[m + 1] - BF[m]));

  // One flow state of the map for a given stirred-layer depth (the column's mixed-layer depth).
  // Face depth is the shallower of the two cells (as in z-level ocean models), so nothing pours
  // out of a thin shore cell faster than it can hold.
  // ext (optional): { slope: thermocline tilt (m per m downwind), s: each cell's downwind distance
  // from the centroid, skin: the surface-skin set-up }
  //   or { tilt: [tx, ty] (tilt vector, m per m, pointing downwind), basis: Map, dcKey } — with a
  //   basis cache, the swirl is solved once per stirred-depth pattern for a unit push east and a unit
  //   push north, and any wind is a combination of the two (the equation is linear in the push and
  //   scales with 1/friction)
  function flowConfig(g, hmix, kin, wv, us, Kh, cfgGyreR, ext) {
    const nw = g.nw, nx = g.nx, ny = g.ny, dx = g.dx, A = dx * dx, NL = NA + 1;
    const slope = ext && ext.slope || 0, sArr = ext && ext.s, sk = ext && ext.skin, skOn = !!(sk && sk.extra > 0);
    const tv = ext && ext.tilt;
    const Dc = new Float64Array(nw), layered = new Uint8Array(nw), outcrop = new Uint8Array(nw);
    for (let k = 0; k < nw; k++) {
      const hk = g.h[k];
      let Dk = hmix;
      if (tv) Dk += tv[0] * (g.x0 + (g.ci[k] + 0.5) * dx - g.cx) + tv[1] * (g.y0 + (g.cj[k] + 0.5) * dx - g.cy);
      else if (slope && sArr) Dk += slope * sArr[k];
      const hm_ = Math.min(H_MIN, g.hmin);
      if (hk - Dk > 0.01) { Dc[k] = Math.max(hm_, Dk); layered[k] = 1; if (Dk < hm_) outcrop[k] = 1; } else Dc[k] = hk;
    }
    const tx = kin * wv[0], ty = kin * wv[1];
    // The swirl is pushed by the wind AND by the bed: with a no-slip bed, the counterflow drags the
    // bed downwind with half the wind stress, so the depth-averaged push is 1.5x the wind stress
    // (Csanady's classic set-up result). Until Oct 21, 2026 the 0.5 was left out.
    const px_ = GYRE_PUSH * tx, py_ = GYRE_PUSH * ty;
    let gy = null, r = 1e-4, urms = 0;
    const UgX = new Float64Array(nw), UgY = new Float64Array(nw);
    const centerVel = sol => {
      let s2 = 0;
      for (let k = 0; k < nw; k++) {
        const i = g.ci[k], j = g.cj[k];
        const qx = 0.5 * (sol.Tx[j * (nx + 1) + i] + sol.Tx[j * (nx + 1) + i + 1]) / dx;
        const qy = 0.5 * (sol.Ty[j * nx + i] + sol.Ty[(j + 1) * nx + i]) / dx;
        UgX[k] = qx / Dc[k]; UgY[k] = qy / Dc[k];
        s2 += UgX[k] * UgX[k] + UgY[k] * UgY[k];
      }
      return Math.sqrt(s2 / nw);
    };
    if (kin > 0) {
      // Friction consistent with the vertical structure used everywhere else: with eddy viscosity
      // Av = κu*D/6 and a no-slip bottom, a depth-averaged flow U feels bottom drag 3·Av·U/D², so the
      // linear friction coefficient is r = 3Av/D = κu*/2 (the same at every depth).
      r = (cfgGyreR || 0.5 * KAPPA) * Math.sqrt(kin);
      if (ext && ext.basis && ext.dcKey != null) {
        let b = ext.basis.get(ext.dcKey);
        if (!b) { b = [solveGyre(g, Dc, 1, 0, 1), solveGyre(g, Dc, 0, 1, 1)]; ext.basis.set(ext.dcKey, b); }
        const Tx = new Float64Array(b[0].Tx.length), Ty = new Float64Array(b[0].Ty.length);
        for (let i = 0; i < Tx.length; i++) Tx[i] = (px_ * b[0].Tx[i] + py_ * b[1].Tx[i]) / r;
        for (let i = 0; i < Ty.length; i++) Ty[i] = (px_ * b[0].Ty[i] + py_ * b[1].Ty[i]) / r;
        gy = { Tx, Ty, DxF: b[0].DxF, DyF: b[0].DyF, nodes: b[0].nodes };
      } else gy = solveGyre(g, Dc, px_, py_, r);
      urms = centerVel(gy);
    } else {
      gy = solveGyre(g, Dc, 0, 0, r);
    }
    // face list between wet cells
    const fc1 = [], fc2 = [], fT = [], fD = [], fn = [];
    for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) {
      const c1 = g.cellOf[j * nx + i - 1], c2 = g.cellOf[j * nx + i];
      if (c1 >= 0 && c2 >= 0) { fc1.push(c1); fc2.push(c2); fT.push(gy.Tx[j * (nx + 1) + i]); fD.push(gy.DxF[j * (nx + 1) + i]); fn.push(wv[0]); }
    }
    for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c1 = g.cellOf[(j - 1) * nx + i], c2 = g.cellOf[j * nx + i];
      if (c1 >= 0 && c2 >= 0) { fc1.push(c1); fc2.push(c2); fT.push(gy.Ty[j * nx + i]); fD.push(gy.DyF[j * nx + i]); fn.push(wv[1]); }
    }
    const nf = fc1.length;
    const F = new Float64Array(NA * nf);               // sublayer volume flux, m³/s, + means c1 → c2
    const div = new Float64Array(NA * nw);
    for (let f = 0; f < nf; f++) for (let m = 0; m < NA; m++) {
      let q = SHARES.gf[m] * fT[f] + us * SHARES.sf[m] * fD[f] * dx * fn[f];
      if (skOn) { const D = fD[f]; q += (skinT(BF[m + 1] * D, D, sk) - skinT(BF[m] * D, D, sk)) * dx * fn[f]; }
      F[m * nf + f] = q; div[m * nw + fc1[f]] += q; div[m * nw + fc2[f]] -= q;
    }
    // upward volume flux through the bottom of sublayer m (closes each sublayer's volume)
    const Wup = new Float64Array(NA * nw);
    for (let k = 0; k < nw; k++) {
      let w = 0;
      for (let m = 0; m < NA; m++) { w = div[m * nw + k] + w; Wup[m * nw + k] = w; }
      Wup[(NA - 1) * nw + k] = 0;                      // zero to rounding; pin it
    }
    // layer volumes and their inverses
    const V = new Float64Array(NL * nw), invV = new Float64Array(NL * nw);
    for (let k = 0; k < nw; k++) {
      for (let m = 0; m < NA; m++) { V[m * nw + k] = (BF[m + 1] - BF[m]) * Dc[k] * A; }
      V[NA * nw + k] = layered[k] ? (g.h[k] - Dc[k]) * A : 0;
      for (let L = 0; L < NL; L++) invV[L * nw + k] = V[L * nw + k] > 0 ? 1 / V[L * nw + k] : 0;
    }
    // upwind coefficients (1/s): mass flux = coef × mass in the upwind cell
    const upw = new Int32Array(NA * nf), dwn = new Int32Array(NA * nf), coefA = new Float64Array(NA * nf);
    const out = new Float64Array(NA * nw);
    for (let m = 0; m < NA; m++) for (let f = 0; f < nf; f++) {
      const q = F[m * nf + f], ix = m * nf + f;
      const u = q >= 0 ? fc1[f] : fc2[f], d = q >= 0 ? fc2[f] : fc1[f];
      upw[ix] = m * nw + u; dwn[ix] = m * nw + d;
      coefA[ix] = Math.abs(q) * invV[m * nw + u];
      out[m * nw + u] += coefA[ix];
    }
    // sideways mixing conductances (m³/s) per layer and face: Kh × shared thickness
    const cond = new Float64Array(NL * nf);
    for (let L = 0; L < NL; L++) for (let f = 0; f < nf; f++) {
      const ta = V[L * nw + fc1[f]] / A, tb = V[L * nw + fc2[f]] / A, tf = Math.min(ta, tb);
      cond[L * nf + f] = tf > 0 ? Kh * tf : 0;
    }
    // explicit stability: total outflow rate per cell-layer, advection plus mixing
    const dOut = new Float64Array(NL * nw);
    for (let L = 0; L < NL; L++) for (let f = 0; f < nf; f++) {
      const cnd = cond[L * nf + f]; if (!cnd) continue;
      dOut[L * nw + fc1[f]] += cnd * invV[L * nw + fc1[f]]; dOut[L * nw + fc2[f]] += cnd * invV[L * nw + fc2[f]];
    }
    let rateMax = 1e-9;
    for (let L = 0; L < NL; L++) for (let k = 0; k < nw; k++) {
      const rr = (L < NA ? out[L * nw + k] : 0) + dOut[L * nw + k];
      if (rr > rateMax) rateMax = rr;
    }
    const dtMax = Math.min(600, 0.9 / rateMax);
    // top-sublayer velocity, for the arrows
    const vtx = new Float32Array(nw), vty = new Float32Array(nw);
    const g0 = SHARES.gf[0] / BF[1], s0 = SHARES.sf[0] / BF[1];
    const skinC_ = new Float64Array(nw), skinM = new Float64Array(NA * nw);   // skinM: the skin's mean speed in each sublayer
    for (let k = 0; k < nw; k++) {
      if (skOn) for (let m = 0; m < NA; m++) skinM[m * nw + k] = (skinT(BF[m + 1] * Dc[k], Dc[k], sk) - skinT(BF[m] * Dc[k], Dc[k], sk)) / ((BF[m + 1] - BF[m]) * Dc[k]);
      const sTop = skOn ? skinT(BF[1] * Dc[k], Dc[k], sk) / (BF[1] * Dc[k]) : 0;   // skin's share of the top sublayer's speed
      if (skOn) skinC_[k] = skinC(Dc[k], sk);
      vtx[k] = g0 * UgX[k] + (s0 * us + sTop) * wv[0]; vty[k] = g0 * UgY[k] + (s0 * us + sTop) * wv[1];
    }
    let anyLayered = 0; for (let k = 0; k < nw; k++) anyLayered |= layered[k];
    return { hmix, slope, Dc, layered, outcrop, skinC: skinC_, skinM, anyLayered, nf, fc1: Int32Array.from(fc1), fc2: Int32Array.from(fc2), F, Wup, V, invV, upw, dwn, coefA, cond, UgX, UgY, r, urms, dtMax, vtx, vty, gyreNodes: gy.nodes || 0 };
  }

  // ---------------------------------------------------------------- shared helpers
  function quant(C, ref) {                          // 0 = none; 1..255 spans 0.001× to 10× ref (log)
    if (!(C > 0)) return 0;
    const l = Math.log10(C / ref);
    if (l < -3) return 0;
    return Math.max(1, Math.min(255, Math.round(1 + 254 * (l + 3) / 4)));
  }
  function unquant(q, ref) { return q === 0 ? 0 : ref * Math.pow(10, (q - 1) / 254 * 4 - 3); }

  function layerOfDepth(col, z) { return Math.max(0, Math.min(col.N - 1, Math.floor(z / col.dz))); }

  // Mixing profile felt by a particle: wind-stirred layer κu*z(1 - z/D) (floored), smoothly joined
  // over 5 cm to the weak mixing below the thermocline.
  function kProfile(z, D, h, ust, Kmin, Kbelow, layered) {
    if (z < 0) z = 0; if (z > h) z = h;
    let ka = KAPPA * ust * z * (1 - z / D);
    if (!(ka > Kmin)) ka = Kmin;
    if (z >= D) ka = Kmin;
    if (!layered) return ka;
    const s = 0.5 * (1 - Math.tanh((z - D) / 0.05));
    return Kbelow + (ka - Kbelow) * s;
  }
  // the same profile's slope dK/dz, worked out exactly (used for the random walk's drift term)
  function kSlope(z, D, h, ust, Kmin, Kbelow, layered) {
    if (z <= 0 || z >= h) return 0;
    let ka = KAPPA * ust * z * (1 - z / D), dka = KAPPA * ust * (1 - 2 * z / D);
    if (!(ka > Kmin) || z >= D) { ka = Kmin; dka = 0; }
    if (!layered) return dka;
    const th = Math.tanh((z - D) / 0.05), s = 0.5 * (1 - th), ds = -0.5 * (1 - th * th) / 0.05;
    return dka * s + (ka - Kbelow) * ds;
  }

  // Kill bookkeeping for one colony: damage D follows exposure; it dies when its own threshold is passed
  // Fold a position back into [lo, hi] (reflecting walls), however far a step overshoots.
  function fold(z, lo, hi) {
    const L = hi - lo; if (!(L > 0)) return lo;
    let r = (z - lo) % (2 * L); if (r < 0) r += 2 * L;
    return lo + (r > L ? 2 * L - r : r);
  }
  // One colony's up-and-down move over dt: first carried by wUp (the flow's upward speed plus its own
  // floating speed, m/s, + is up), then mixed within the water it is then in.
  //  * In the wind-stirred layer the mixing K = a·z(D − z)/D (a = κu*) is exactly Brownian motion on a
  //    sphere, with z = D(1 − cos θ)/2 (Archimedes: even in depth ⇔ even over the sphere). The step is
  //    a turn of the sphere by a random angle in a random direction, so colonies spread evenly stay
  //    exactly even at any step length. The mean and spread of each step match the Visser (1997) walk
  //    used until Nov 8, 2026, which with these 30-180 s steps left the top and bottom 5% of the layer
  //    20-33% too full of colonies that should simply follow the water (bug H2 in the Nov 8, 2026 code review).
  //    The calm-water floor Kmin is added as an even walk on top (within 1e-5 m²/s of the
  //    max(Kmin, profile) the concentrations use).
  //  * Under the thermocline the weak mixing is even (Kbelow), and the thermocline is a wall for the
  //    mixing (see moveParticles); only the flow and floating or sinking carry colonies across it.
  function vertMove(z, D, h, lay, wUp, a, Kmin, Kbelow, dt, rng) {
    z -= wUp * dt;                                    // z is depth: up is negative
    z = fold(z, 0, h);
    if (lay && z >= D) return fold(z + rng.g() * Math.sqrt(2 * Kbelow * dt), D, h);
    const top = lay ? D : h;
    if (a > 0 && top > 0) {
      let Z = 1 - 2 * z / top; if (Z > 1) Z = 1; else if (Z < -1) Z = -1;
      const rho = Math.sqrt(-4 * a * dt / top * Math.log(1 - rng.u())), c = Math.cos(2 * Math.PI * rng.u());
      Z = Z * Math.cos(rho) + Math.sqrt(1 - Z * Z) * Math.sin(rho) * c;
      z = top * (1 - Z) / 2;
    }
    if (Kmin > 0) z = fold(z + rng.g() * Math.sqrt(2 * Kmin * dt), 0, top);
    if (lay && z >= D) z = D - 1e-9;
    return z;
  }
  function makeKillState(n, kill, rng) {
    const st = { D: new Float64Array(n), Dm: new Float64Array(n), H: new Float64Array(n), thr: new Float64Array(n), dead: new Uint8Array(n), deadAt: new Float32Array(n).fill(-1) };
    if (!kill) return st;
    for (let p = 0; p < n; p++) {
      let u = rng.u(); u = Math.min(1 - 1e-9, Math.max(1e-9, u));
      st.thr[p] = kill.structure === 'SD' ? -Math.log(u) : kill.mw * Math.pow(u / (1 - u), 1 / kill.beta);
    }
    return st;
  }
  function killStep(st, p, C, dtH, kill, tH) {
    if (st.dead[p]) return;
    const D0 = st.D[p], Dn = C + (D0 - C) * Math.exp(-kill.kD * dtH);
    st.D[p] = Dn;
    if (kill.structure === 'SD') {
      st.H[p] += kill.bw * Math.max(0, 0.5 * (D0 + Dn) - kill.z) * dtH;
      if (st.H[p] > st.thr[p]) { st.dead[p] = 1; st.deadAt[p] = tH; }
    } else {
      if (Dn > st.Dm[p]) st.Dm[p] = Dn;
      if (st.Dm[p] >= st.thr[p]) { st.dead[p] = 1; st.deadAt[p] = tH; }
    }
  }

  // No colony can still be knocked down once the highest concentration anywhere, and every survivor's
  // damage, sit below what it takes: below every survivor's own threshold (IT) or below the damage
  // threshold z (SD). With no new product arriving, the highest concentration cannot rise again
  // (mixing, flow and decay never create a new maximum), so the kill is final from here on.
  function killCanStop(ks, np, kill, cmax, bedPending) {
    if (bedPending) return false;
    let maxD = 0, minThr = Infinity, alive = 0;
    for (let p = 0; p < np; p++) if (!ks.dead[p]) { alive++; if (ks.D[p] > maxD) maxD = ks.D[p]; if (ks.thr[p] < minThr) minThr = ks.thr[p]; }
    if (!alive) return true;
    if (cmax < 1e-3 * kill.E && maxD < 1e-3 * kill.E) return true;
    const lim = kill.structure === 'SD' ? kill.z : minThr;
    return lim > 0 && cmax < lim && maxD < lim;
  }

  function pHAt(c1, pv, tClock, inMixed) {
    return inMixed ? Math.min(pv.ph_cap, c1.pHbase + c1.amp.A * S.swing(tClock, pv)) : c1.pHbase;
  }

  // Grain tables for broadcast crystals/granules (same physics as the column's release profile)
  function grainTables(inp, pv, c1) {
    const grade = (CC.GRADES[inp.product] || {})[inp.grade] || Object.values(CC.GRADES[inp.product])[0];
    const isCu = inp.product === 'copper_sulfate';
    const rhoP = isCu ? pv.cu_rho : pv.perc_rho;
    const tTop = c1.snaps.T[0][0];
    const Cs = isCu ? pv.cu_cs : pv.perc_cs20 + (pv.perc_cs30 - pv.perc_cs20) * (tTop - 20) / 10;
    const dm = isCu ? pv.cu_dm : pv.perc_dm;
    const tabs = grade.d_mm.map(dmm => ({ d: dmm / 1000, g: CC.grainFall(dmm / 1000, rhoP, Cs, dm, tTop, c1.col.zmax, pv) }));
    const Tbot = c1.snaps.T[0][c1.col.N - 1];
    return {
      // dissolved share between depths za and zb, and what lands on a bottom at depth h
      dissolved(za, zb) {
        let m = 0;
        for (const t of tabs) {
          const c = t.g.cum, n = c.length - 1;
          const ia = Math.min(n, Math.round(za / 0.01)), ib = Math.min(n, Math.round(zb / 0.01));
          m += (c[ib] - c[ia]) / tabs.length;
        }
        return m;
      },
      landed(h) {
        const out = [];
        for (const t of tabs) {
          const c = t.g.cum, ib = Math.min(c.length - 1, Math.round(h / 0.01)), left = 1 - c[ib];
          if (left > 1e-6) {
            const Dl = t.d * Math.cbrt(left);
            out.push({ frac: left / tabs.length, tBed: rhoP * Dl * Dl / (8 * CC.dmAt(dm, Tbot) * Cs) });
          }
        }
        return out;
      }
    };
  }

  // Particle time step for this hour. The random walk needs a step well below D/(2κu*), the time
  // over which the mixing profile's curvature matters (Visser 1997).
  function particleStep(hmix, ust) {
    const lim = ust > 0 ? 0.15 * Math.max(0.3, hmix) / (2 * KAPPA * ust) : 180;
    let best = DTP_STEPS[0];
    for (const d of DTP_STEPS) if (d <= lim) best = d;
    return best;
  }

  // Tridiagonal elimination prepared once per hour per cell, then reused every substep
  function prepTri(n, a, b, c, off, cpA, dnA) {
    let den = b[0]; dnA[off] = 1 / den; cpA[off] = c[0] / den;
    for (let i = 1; i < n; i++) { den = b[i] - a[i] * cpA[off + i - 1]; dnA[off + i] = 1 / den; cpA[off + i] = c[i] / den; }
  }
  // ---------------------------------------------------------------- added in 0.4: tilt, skin, dense film, toxin and oxygen
  const RHO0 = 1000, RHO_AIR = 1.2, GRAV = 9.81;

  // The warm top layer and the cool water under it, hour by hour, from the column. With wind stress
  // u*² on a warm layer of depth h over water Δρ denser, the steady balance g′·dh/dx = u*²/h tilts
  // the boundary by u*²/(g′h) (the balance behind the Wedderburn number W = g′h²/(u*²L)). The warm
  // layer thickens downwind and thins upwind; when W < 1 the boundary reaches the surface at the
  // upwind shore (upwelling). Reached within about a quarter of the internal seiche period, which is
  // minutes to a couple of hours in ponds; the sloshing after the wind changes is not modeled.
  function layering(c1, hr, tiltMult, ustH) {
    const col = c1.col, h = Math.min(hr, c1.snaps.T.length - 1), T = c1.snaps.T[h], hm = c1.rec.hmix[Math.min(hr, c1.rec.hmix.length - 1)];
    let ve = 0, te = 0, vh = 0, th = 0;
    for (let k = 0; k < col.N; k++) { const zc = (k + 0.5) * col.dz, v = col.V[k]; if (zc < hm) { ve += v; te += T[k] * v; } else { vh += v; th += T[k] * v; } }
    if (!(vh > 0) || !(ve > 0) || hm >= 0.99 * col.zmax) return { hm, drho: 0, gp: 0, slope: 0, dT: 0 };
    const drho = S.waterDensity(th / vh) - S.waterDensity(te / ve), dT = te / ve - th / vh;
    if (!(drho > 1e-4)) return { hm, drho: Math.max(0, drho), gp: 0, slope: 0, dT };
    const gp = GRAV * drho / RHO0;
    const u = ustH == null ? c1.ustar : ustH;
    return { hm, drho, gp, dT, slope: (tiltMult == null ? 1 : tiltMult) * u * u / (gp * Math.max(H_MIN, hm)) };
  }
  // The wind each hour of the run (from the layers model; constant for the idealized day)
  function windOf(c1, hr) {
    const w = c1.wind, i = Math.max(0, Math.min((w && w.U.length || 1) - 1, hr));
    return w ? { U: w.U[i], ust: w.ustar[i], from: w.from[i], wv: windVec(w.from[i]) } : { U: c1.U, ust: c1.ustar, from: (c1.inputs && c1.inputs.windFrom) || 0, wv: windVec((c1.inputs && c1.inputs.windFrom) || 0) };
  }
  // Hour-by-hour tilt actually used, as a vector pointing downwind. The boundary takes about a
  // quarter of its sloshing (internal seiche) period to reach the steady tilt: T/4 = L / (2c), with
  // the two-layer wave speed c = √(g′ h1 h2 / (h1 + h2)) (h2 taken at the deepest point). So a warm
  // layer that has just formed, with little density difference, tilts slowly; when the wind turns,
  // the tilt swings round over the same time. The steady tilt is capped where the edge would move by
  // the full depth. L(dir) is the pond's length along the wind.
  function tiltSeries(c1, pv, L) {
    const zmax = c1.col.zmax, out = [], Lof = typeof L === 'function' ? L : () => L;
    let px = 0, py = 0;
    for (let hr = 0; hr <= RUN_H; hr++) {
      const w = windOf(c1, hr), ly = layering(c1, hr, pv.tilt, w.ust), Lh = Lof(w.from);
      if (!(ly.gp > 0) || !(ly.slope > 0)) { px = 0; py = 0; out.push(Object.assign(ly, { slopeSS: 0, slope: 0, tx: 0, ty: 0, tQuarter: null, L: Lh })); continue; }
      const ss = Math.min(ly.slope, 2 * zmax / Lh);
      const h1 = Math.max(H_MIN, ly.hm), h2 = Math.max(H_MIN, zmax - ly.hm);
      const c = Math.sqrt(ly.gp * h1 * h2 / (h1 + h2)), tq = Lh / (2 * c), a = 1 - Math.exp(-3600 / tq);
      px += (ss * w.wv[0] - px) * a; py += (ss * w.wv[1] - py) * a;
      out.push(Object.assign(ly, { slopeSS: ss, slope: Math.hypot(px, py), tx: px, ty: py, tQuarter: tq, L: Lh }));
    }
    return out;
  }

  // The fast surface skin (Wu 1975): wind-driven drift at the very surface is about 0.53 × the
  // air-side friction velocity. The counterflow profile already moves the surface at us, so the skin
  // adds extra·e^(−z/δ), with a uniform return over the stirred layer so its total transport is zero.
  function skinSetup(c1, pv, us) {
    const ust = typeof c1 === 'number' ? c1 : c1.ustar;
    const ua = ust * Math.sqrt(RHO0 / RHO_AIR);                // same stress, felt on the air side
    return { extra: Math.max(0, pv.skin_coef * ua - us), delta: pv.skin_d, ua, surface: Math.max(us, pv.skin_coef * ua) };
  }
  function skinC(D, sk) { const d = sk.delta; return d / D * (1 - Math.exp(-D / d)); }
  // downwind transport per unit width between the surface and depth z (m²/s)
  function skinT(z, D, sk) {
    if (!(sk && sk.extra) || !(D > 0)) return 0;
    const d = sk.delta;
    return sk.extra * (d * (1 - Math.exp(-z / d)) - skinC(D, sk) * z);
  }

  // Injected liquids: the share of active ingredient in the product as sold, and the product's density.
  function injectProps(product, pv) {
    const t = {
      h2o2_liquid: ['ai_h2o2', 'rho_h2o2'], copper_chelated: ['ai_cuchel', 'rho_cuchel'],
      diquat: ['ai_diquat', 'rho_diquat'], endothall: ['ai_endothall', 'rho_endothall']
    }[product];
    return t ? { f: pv[t[0]], rho: pv[t[1]] } : null;
  }
  // Density excess (kg/m³) of water holding Cf mg/L of active ingredient from that product
  function filmDrho(Cf, inj) { return Cf / inj.f / 1000 * (1 - RHO0 / inj.rho); }

  function sodRate(pv, T) { return pv.sod20 * Math.pow(pv.sod_theta, T - 20); }      // g O2 per m² per day

  // Toxin and dead-bloom bookkeeping shared by the map and the slice (same numbers as the column)
  function bioSetup(inp, pv, c1, Vtot, np) {
    const MCtot = c1.MCtot;
    return {
      MC0: pv.mc_fext * MCtot,                                   // dissolved at the start, µg/L
      mcPer: (1 - pv.mc_fext) * MCtot * Vtot / np,                // toxin inside one tracked colony (µg/L × m³)
      carbPer: pv.thetaC * inp.chl / 1000 * Vtot / np,            // carbon in one tracked colony (mg/L × m³)
      lagH: inp.history ? 0 : pv.mc_lag * 24,
      kdDead: pv.kd20 * Math.pow(pv.kd_theta, inp.tempC - 20) / 86400,
      krel: pv.mc_krel / 86400, kbio: pv.mc_kbio / 86400,
      vph: Math.LN2 / (pv.mc_photo * 86400),                     // sunlight: removal speed through the surface, m/s (as in the other models)
      cu: c1.chem === 'cu_sulfate' || c1.chem === 'cu_chelated'
    };
  }
  // toxin on a log scale for the display: 0 = under 0.01 µg/L; 1..255 spans 0.01 to 100 µg/L
  function quantMC(C) { if (!(C >= 0.01)) return 0; return Math.max(1, Math.min(255, Math.round(1 + 254 * (Math.log10(C) + 2) / 4))); }
  function unquantMC(q) { return q === 0 ? 0 : Math.pow(10, (q - 1) / 254 * 4 - 2); }
  // oxygen for the display: 0.05 mg/L steps up to 12.7 mg/L; 255 = not modeled there
  function quantDO(d) { return Math.min(254, Math.max(0, Math.round(d * 20))); }


  // the pond's length along a wind direction (5° bins), for the tilt and the Wedderburn number
  function lengthAlongFn(g) {
    const cache = new Map();
    return from => {
      const b = ((Math.round(from / 5) % 72) + 72) % 72;
      let v = cache.get(b);
      if (v == null) {
        const w = windVec(b * 5); let lo = Infinity, hi = -Infinity;
        for (let k = 0; k < g.nw; k++) { const c = cellCenter(g, k), q = (c[0] - g.cx) * w[0] + (c[1] - g.cy) * w[1]; if (q < lo) lo = q; if (q > hi) hi = q; }
        v = hi - lo + g.dx; cache.set(b, v);
      }
      return v;
    };
  }

  // ---------------------------------------------------------------- the map model
  function runMap(inp, pv, c1, g, mask, opts) {
    // light at the top of each of the layers model's layers, the cells shading the water below them
    const lightProfile = (I0, Bz) => {
      const cl = c1.col, Ia = new Float64Array(cl.N), Ka = new Float64Array(cl.N); let I = I0;
      for (let l = 0; l < cl.N; l++) { Ia[l] = I; Ka[l] = c1.KdMin + c1.KdChl * Bz[l]; I *= Math.exp(-Ka[l] * (cl.zi[l + 1] - cl.zi[l])); }
      return { I: Ia, K: Ka };
    };
    opts = opts || {};
    const nw = g.nw, A = g.dx * g.dx, col = c1.col, chem = c1.chem;
    const NL = NA + 1, HYP = NA, NT = NL * nw;           // layer index NA = cool bottom layer
    const Kh = pv.kh_scale * Math.sqrt(g.A0);
    const kill = c1.kill;
    const ref = c1.ec && !c1.ec.none ? c1.ec.v : c1.doseMgL;
    const rngP = rngPair((opts.seed || 20261019) ^ 0x5bd1e995);
    const np = NP_MAP;
    const sk0 = skinSetup(c1.ustar, pv, pv.us_coef * c1.ustar);   // at treatment time, for the report
    const bio = bioSetup(inp, pv, c1, g.V, np);
    const injF = inp.method === 'inject' ? injectProps(inp.product, pv) : null;

    const lengthAlong = lengthAlongFn(g);
    const lay = tiltSeries(c1, pv, lengthAlong);
    let Rref = g.dx; for (let k = 0; k < nw; k++) { const c = cellCenter(g, k); Rref = Math.max(Rref, Math.hypot(c[0] - g.cx, c[1] - g.cy)); }

    // Flow states, cached by stirred-layer depth, tilt (4 cm steps at the far edge), wind direction
    // (1° steps) and wind strength (5% steps). Only the most recent are kept in full; the page gets
    // a light copy of each (depths, layering, top-water arrows).
    const basis = new Map(), cfgCache = new Map(), cfgList = [], CACHE_MAX = 32;
    const getCfg = hr => {
      const hm = c1.rec.hmix[hr], ly = lay[hr], w = windOf(c1, hr);
      const qx = Math.max(-2000, Math.min(2000, Math.round(ly.tx * Rref / 0.04))), qy = Math.max(-2000, Math.min(2000, Math.round(ly.ty * Rref / 0.04)));
      const calm = !(w.ust > 1e-5);
      // wind direction to the nearest degree (until Oct 22, 2026 to 10°, so a southwest wind ran at 230°)
      const db = calm ? 0 : ((Math.round(w.from) % 360) + 360) % 360, ub = calm ? -9999 : Math.round(Math.log(w.ust) / Math.log(1.05));
      const dcKey = hm.toFixed(3) + '|' + qx + '|' + qy, key = dcKey + '|' + db + '|' + ub;
      let c = cfgCache.get(key);
      if (c) { cfgCache.delete(key); cfgCache.set(key, c); return c; }
      const ust = calm ? 0 : Math.exp(ub * Math.log(1.05)), wv = windVec(db), us = pv.us_coef * ust, kin = ust * ust;
      const sk = skinSetup(ust, pv, us);
      c = flowConfig(g, hm, kin, wv, us, Kh, pv.gyre_r, { tilt: [qx * 0.04 / Rref, qy * 0.04 / Rref], skin: sk, basis, dcKey });
      Object.assign(c, { ust, wv, us, kin, sk, windFrom: db, id: cfgList.length });
      cfgList.push({ hmix: c.hmix, slope: Math.hypot(qx, qy) * 0.04 / Rref, Dc: Float32Array.from(c.Dc), layered: c.layered, outcrop: c.outcrop, vtx: c.vtx, vty: c.vty, r: c.r, urms: c.urms, dtMax: c.dtMax, windFrom: c.windFrom });
      cfgCache.set(key, c);
      if (cfgCache.size > CACHE_MAX) cfgCache.delete(cfgCache.keys().next().value);
      return c;
    };

    // Each square's four faces in the flow's face list (same order as flowConfig builds it), -1 = shore
    const faceW = new Int32Array(nw).fill(-1), faceE = new Int32Array(nw).fill(-1), faceS = new Int32Array(nw).fill(-1), faceN = new Int32Array(nw).fill(-1);
    {
      let f = 0;
      for (let j = 0; j < g.ny; j++) for (let i = 1; i < g.nx; i++) {
        const a = g.cellOf[j * g.nx + i - 1], b = g.cellOf[j * g.nx + i];
        if (a >= 0 && b >= 0) { faceE[a] = f; faceW[b] = f; f++; }
      }
      for (let j = 1; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
        const a = g.cellOf[(j - 1) * g.nx + i], b = g.cellOf[j * g.nx + i];
        if (a >= 0 && b >= 0) { faceN[a] = f; faceS[b] = f; f++; }
      }
    }

    // steepest deeper neighbour of each cell, for the dense film
    const down = new Int32Array(nw).fill(-1);
    for (let k = 0; k < nw; k++) {
      const i = g.ci[k], j = g.cj[k]; let best = -1, bh = g.h[k] + 1e-9;
      for (const [ii, jj] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
        if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) continue;
        const q = g.cellOf[jj * g.nx + ii];
        if (q >= 0 && g.h[q] > bh) { bh = g.h[q]; best = q; }
      }
      down[k] = best;
    }
    const hfA = new Float64Array(nw); for (let k = 0; k < nw; k++) hfA[k] = Math.min(pv.film_h, g.h[k]) * A;   // film volume, m³

    // state per layer per cell: product (g), dissolved toxin (µg/L × m³), oxygen deficit and dead
    // bloom carbon (mg/L × m³); the dense film on the bed (g)
    const M = new Float64Array(NT), Q = new Float64Array(NT), X = new Float64Array(NT), Cd = new Float64Array(NT), dT = new Float64Array(NT);
    const YQ = new Float64Array(NT), YC = new Float64Array(NT);    // toxin and carbon still inside knocked-down colonies
    const F = new Float64Array(nw), dF = new Float64Array(nw);
    const bound = new Float64Array(NT), demand = new Float64Array(NT);   // bound: diquat held by clay, g
    let boundTotal = 0, demandTotal = 0, decayed = 0, dropped = 0, mcReleased = 0, mcBio = 0;
    const dqRoom = chem === 'diquat' ? S.diquatRoom(inp, pv) : 0;            // clay's binding room, mg/L of water

    let cfg = getCfg(0);
    const B0 = c1.snaps.B[0];
    // Toxin starts dissolved at the column's level. Oxygen starts where the bed's demand and the
    // surface's reaeration balance in each cell whose stirred water touches the bed (deficit = SOD/k);
    // where the cool layer covers the bed, its demand stays out of the stirred water, as in the column.
    {
      const T0 = c1.snaps.T[0][0], eq = sodRate(pv, T0) / (CC.reaerationVel(c1.U, T0, pv) * 86400);
      for (let i = 0; i < NT; i++) Q[i] = bio.MC0 * cfg.V[i];
      for (let k = 0; k < nw; k++) if (!cfg.layered[k]) for (let L = 0; L < NA; L++) X[L * nw + k] = eq * cfg.V[L * nw + k];
    }
    let Q0 = 0; for (let i = 0; i < NT; i++) Q0 += Q[i];

    function addMass(L, k, grams, toFilm) {
      if (!(cfg.V[L * nw + k] > 0)) L = NA - 1;
      const ix = L * nw + k, V = cfg.V[ix];
      let add = grams / V;
      if (chem === 'h2o2') {
        const zc = L < NA ? 0.5 * (BF[L] + BF[L + 1]) * cfg.Dc[k] : cfg.Dc[k] + 0.5 * (g.h[k] - cfg.Dc[k]);
        const Bl = B0[layerOfDepth(col, zc)];
        const want = Math.min(pv.dinst_cap, pv.h2o2_dinst * Math.max(0.05, Bl));
        const room = Math.max(0, want - demand[ix]), d = Math.min(add, room);
        demand[ix] += d; add -= d; demandTotal += d * V;
        X[ix] -= pv.h2o2_o2 * d * V;                    // peroxide used up at once releases oxygen
      }
      if (toFilm) F[k] += add * V; else M[ix] += add * V;
    }

    // release over the treated cells: the label dose over each cell's full depth
    const dose = c1.doseMgL;
    let released = 0;
    const bed = [];                                   // {k, total, done, tBed}
    const grains = inp.method === 'granules' ? grainTables(inp, pv, c1) : null;
    for (let k = 0; k < nw; k++) {
      if (!mask[k]) continue;
      const mass = dose * g.h[k] * A; released += mass;
      if (inp.method === 'spray') {
        // into the top spray_depth of water, shared by thickness, as in the layers model and the slice
        const D = cfg.Dc[k], hk = g.h[k], ds = Math.min(pv.spray_depth, hk);
        const share = new Float64Array(NL); let tot = 0;
        for (let L = 0; L < NL; L++) {
          const za = L < NA ? BF[L] * D : D, zb = L < NA ? BF[L + 1] * D : (cfg.layered[k] ? hk : D);
          const ov = Math.min(zb, ds) - za; if (ov > 0 && cfg.V[L * nw + k] > 0) { share[L] = ov; tot += ov; }
        }
        if (tot > 0) { for (let L = 0; L < NL; L++) if (share[L] > 0) addMass(L, k, mass * share[L] / tot); }
        else addMass(0, k, mass);
      }
      else if (inp.method === 'inject') {
        // a layered cell: the plume stops and spreads at the thermocline (as in the column model);
        // otherwise it reaches the bed and forms a dense film there
        if (cfg.layered[k]) addMass(HYP, k, mass); else addMass(NA - 1, k, mass, !!injF);
      } else {
        const hk = g.h[k], D = cfg.Dc[k];
        let used = 0;
        for (let L = 0; L < NL; L++) {
          const za = L < NA ? BF[L] * D : D, zb = L < NA ? BF[L + 1] * D : hk;
          if (!(zb > za)) continue;
          const f = grains.dissolved(za, Math.min(zb, hk));
          if (f > 0) { addMass(L, k, mass * f); used += f; }
        }
        for (const ld of grains.landed(hk)) { bed.push({ k, total: mass * ld.frac, done: 0, tBed: ld.tBed }); used += ld.frac; }
        if (Math.abs(1 - used) > 1e-9) addMass(0, k, mass * (1 - used));
      }
    }
    let filmIn = 0; for (let k = 0; k < nw; k++) filmIn += F[k];
    let filmLive = filmIn > 0, filmEndH = filmLive ? null : 0;

    // particles (colonies): placed in proportion to volume × the column's bloom profile at treatment time
    const px = new Float64Array(np), py = new Float64Array(np), pz = new Float64Array(np), pk = new Int32Array(np);
    {
      let Bmax = 0; for (let k = 0; k < col.N; k++) Bmax = Math.max(Bmax, B0[k]);
      let hmaxw = 0; for (let k = 0; k < nw; k++) hmaxw = Math.max(hmaxw, g.h[k]);
      let p = 0, guard = 0;
      while (p < np && guard++ < np * 5000) {
        const k = Math.min(nw - 1, Math.floor(rngP.u() * nw));
        const z = rngP.u() * g.h[k];
        if (rngP.u() > (g.h[k] / hmaxw) * (B0[layerOfDepth(col, z)] / Bmax)) continue;
        const c = cellCenter(g, k);
        px[p] = c[0] + (rngP.u() - 0.5) * g.dx * 0.999; py[p] = c[1] + (rngP.u() - 0.5) * g.dx * 0.999; pz[p] = z; pk[p] = k; p++;
      }
    }
    const ks = makeKillState(np, kill, rngP);
    const gone = new Uint8Array(np);                  // knocked down and handed to the leaking pool

    // records
    const NH = RUN_H + 1;
    const topQ = new Uint8Array(NH * nw), botQ = new Uint8Array(NH * nw), mcTopQ = new Uint8Array(NH * nw), mcBotQ = new Uint8Array(NH * nw), doQ = new Uint8Array(NH * nw);
    const cfgOfHour = new Uint16Array(NH);
    const show = Math.min(NSHOW_MAP, np);
    const sx = new Float32Array(NH * show), sy = new Float32Array(NH * show), sz = new Float32Array(NH * show), sdead = new Uint8Array(NH * show);
    const K = new Float64Array(NH), Cexp = new Float64Array(NH), CtopMean = new Float64Array(NH), CbotMean = new Float64Array(NH), Cmax = new Float64Array(NH), massW = new Float64Array(NH);
    const MCml = new Float64Array(NH), MCtopMax = new Float64Array(NH), DOml = new Float64Array(NH), DOmin = new Float64Array(NH), filmMass = new Float64Array(NH), upwell = new Float64Array(NH), Wed = new Float64Array(NH);
    let killActive = !!kill, killEndH = kill ? null : 0, transportOn = true, transportEndH = null;

    const concAt = (L, k) => M[L * nw + k] * cfg.invV[L * nw + k];
    function layerAtDepth(k, z) {
      const D = cfg.Dc[k];
      if (z < D || !cfg.layered[k]) return subOf(z / D);
      return HYP;
    }
    // what a colony at depth z in cell k is exposed to (the film adds to the water near the bed)
    function expo(k, z) {
      let c = concAt(layerAtDepth(k, z), k);
      if (F[k] > 0 && z > g.h[k] - hfA[k] / A) c += F[k] / hfA[k];
      return c;
    }
    function record(hr) {
      cfgOfHour[hr] = cfg.id;
      const sat = S.doSat(c1.snaps.T[hr][0]);
      let ct = 0, cb = 0, cm = 0, mw = 0, qs = 0, vs = 0, xs = 0, qmax = 0, dmin = Infinity, fm = 0, out = 0;
      for (let k = 0; k < nw; k++) {
        const botL = cfg.layered[k] ? HYP : NA - 1, fc = F[k] > 0 ? F[k] / hfA[k] : 0;
        const top = concAt(0, k), bot = concAt(botL, k) + fc;
        topQ[hr * nw + k] = quant(top, ref); botQ[hr * nw + k] = quant(bot, ref);
        ct += top; cb += bot;
        if (bot > cm) cm = bot;
        for (let L = 0; L < NL; L++) { const c = concAt(L, k); if (c > cm) cm = c; mw += M[L * nw + k]; }
        mw += F[k]; fm += F[k];
        let xk = 0, vk = 0;
        for (let L = 0; L < NA; L++) { const ix = L * nw + k; xk += X[ix]; vk += cfg.V[ix]; qs += Q[ix]; }
        xs += xk; vs += vk;
        const q0 = Q[k] * cfg.invV[k]; if (q0 > qmax) qmax = q0;
        mcTopQ[hr * nw + k] = quantMC(q0); mcBotQ[hr * nw + k] = quantMC(Q[botL * nw + k] * cfg.invV[botL * nw + k]);
        const dk = Math.max(0, sat - xk / vk); if (dk < dmin) dmin = dk;
        doQ[hr * nw + k] = quantDO(dk);
        if (cfg.outcrop[k]) out++;
      }
      CtopMean[hr] = ct / nw; CbotMean[hr] = cb / nw; Cmax[hr] = cm; massW[hr] = mw;
      MCml[hr] = qs / vs; MCtopMax[hr] = qmax; DOml[hr] = Math.max(0, sat - xs / vs); DOmin[hr] = dmin;
      filmMass[hr] = fm; upwell[hr] = out / nw;
      const Ly = lay[hr], uh = windOf(c1, hr).ust; Wed[hr] = Ly.gp > 0 && uh > 0 ? Ly.gp * Ly.hm * Ly.hm / (uh * uh * Ly.L) : -1;
      let ce = 0, nd = 0;
      for (let p = 0; p < np; p++) { const k = pk[p]; ce += expo(k, Math.min(pz[p], g.h[k])); if (ks.dead[p]) nd++; }
      Cexp[hr] = ce / np; K[hr] = nd / np;
      for (let p = 0; p < show; p++) { sx[hr * show + p] = px[p]; sy[hr * show + p] = py[p]; sz[hr * show + p] = pz[p]; sdead[hr * show + p] = ks.dead[p]; }
    }

    // remap layers when the stirred-layer depth changes (conservative, for every tracer)
    const TR = [M, Q, X, Cd, YQ, YC, bound];
    const bo = new Float64Array(NL + 1), bn = new Float64Array(NL + 1), mo = new Float64Array(NL);
    function remap(oldCfg, newCfg) {
      for (let k = 0; k < nw; k++) {
        const Do = oldCfg.Dc[k], Dn = newCfg.Dc[k];
        if (Do === Dn && oldCfg.layered[k] === newCfg.layered[k]) continue;
        const hk = g.h[k];
        for (let L = 0; L <= NA; L++) { bo[L] = BF[L] * Do; bn[L] = BF[L] * Dn; }
        bo[NL] = oldCfg.layered[k] ? hk : Do; bn[NL] = newCfg.layered[k] ? hk : Dn;
        for (const T of TR) {
          for (let L = 0; L < NL; L++) { mo[L] = T[L * nw + k]; T[L * nw + k] = 0; }
          for (let L = 0; L < NL; L++) {
            const to = bo[L + 1] - bo[L];
            if (!(to > 0)) { if (mo[L] !== 0) T[(NA - 1) * nw + k] += mo[L]; continue; }
            for (let Ln = 0; Ln < NL; Ln++) {
              const ov = Math.min(bo[L + 1], bn[Ln + 1]) - Math.max(bo[L], bn[Ln]);
              if (ov > 0) T[Ln * nw + k] += mo[L] * ov / to;
            }
          }
          if (!(bn[NL] - bn[NA] > 0) && T[HYP * nw + k] !== 0) { T[(NA - 1) * nw + k] += T[HYP * nw + k]; T[HYP * nw + k] = 0; }
        }
      }
    }

    // Per-hour set-up. Everything moves (sideways, then up/down) on the same step dte, because the
    // up/down flow is what closes each sublayer's volume; only the slow chemistry of toxin and oxygen
    // (breakdown, dead-bloom decay, the bed's demand, reaeration) is applied on a longer step dtV of
    // at most 10 minutes.
    const fac = new Float64Array(NT);
    const triN = new Uint8Array(nw);
    const triA = new Float64Array(NT), triCP = new Float64Array(NT), triDN = new Float64Array(NT);
    const ta = new Float64Array(NL), tb = new Float64Array(NL), tc = new Float64Array(NL);
    const rQ = new Float64Array(NT), rRea = new Float64Array(nw), sodA = new Float64Array(nw);   // rates for the slow chemistry, per second
    const met = new Float64Array(NT);    // the living bloom's oxygen use minus production, g/s per layer per square
    let Kthermo = pv.K_floor;
    // implicit vertical operator in mass form, (V + exchanges) C = old mass, eliminated once
    function buildTri(k, dt, aA, cpA, dnA) {
      const D = cfg.Dc[k], n = triN[k];
      for (let L = 0; L < n; L++) { ta[L] = 0; tc[L] = 0; tb[L] = cfg.V[L * nw + k]; }
      for (let i = 1; i < n; i++) {                     // interface between layer i-1 (above) and i
        const zi = BF[Math.min(i, NA)] * D;
        const Kv = i < NA ? Math.max(pv.K_ml_min, KAPPA * cfg.ust * zi * (1 - zi / D)) : Kthermo;
        const dist = i < NA ? 0.5 * (BF[i + 1] - BF[i - 1]) * D : 0.5 * (BF[NA] - BF[NA - 1]) * D + 0.5 * (g.h[k] - D);
        const e = Kv * A / dist * dt;
        tb[i - 1] += e; tb[i] += e; tc[i - 1] -= e; ta[i] -= e;
        if (i < NA) {
          const W = cfg.Wup[(i - 1) * nw + k] * dt;      // up through the bottom of layer i-1
          if (W > 0) { tc[i - 1] -= W; tb[i] += W; } else if (W < 0) { tb[i - 1] -= W; ta[i] += W; }
        }
      }
      for (let L = 0; L < n; L++) aA[L * nw + k] = ta[L];
      let den = tb[0]; dnA[k] = 1 / den; cpA[k] = tc[0] / den;
      for (let L = 1; L < n; L++) { den = tb[L] - ta[L] * cpA[(L - 1) * nw + k]; dnA[L * nw + k] = 1 / den; cpA[L * nw + k] = tc[L] / den; }
    }
    function hourSetup(hr, dte, withM) {
      const Tz = c1.snaps.T[hr], Bz = c1.snaps.B[hr], Kz = c1.snaps.K[hr];
      const tClock = (inp.appHour + hr + 0.5) % 24;
      const ki = Math.max(1, Math.min(col.N - 1, Math.round(cfg.hmix / col.dz)));
      Kthermo = Math.max(pv.K_floor, Kz[ki] || pv.K_floor);
      const kO2 = CC.reaerationVel(windOf(c1, hr).U, Tz[0], pv), sod = sodRate(pv, Tz[0]) / 86400;
      const kb = hr + 0.5 >= bio.lagH ? bio.kbio : 0;
      // the living bloom's own oxygen, at the layers model's cell profile and light; knocked-down share
      // from the layers model inside the treated area, none outside it
      const lt = c1.rec.light, Ib = 0.5 * (lt[Math.min(lt.length - 1, hr)] + lt[Math.min(lt.length - 1, hr + 1)]), Kc = c1.rec.K[Math.min(c1.rec.K.length - 1, hr)];
      const LP = lightProfile(Ib, Bz);
      for (let k = 0; k < nw; k++) {
        const D = cfg.Dc[k], lay_ = cfg.layered[k];
        for (let L = 0; L < NL; L++) {
          const ix = L * nw + k, iv = cfg.invV[ix];
          if (!(iv > 0)) { met[ix] = 0; continue; }
          const z1 = L < NA ? BF[L] * D : D, z2 = L < NA ? BF[L + 1] * D : g.h[k], li = layerOfDepth(col, 0.5 * (z1 + z2)), l1 = layerOfDepth(col, z1);
          const I1 = LP.I[l1] * Math.exp(-LP.K[l1] * Math.max(0, z1 - col.zi[l1]));
          const mo = S.bloomO2(inp.chl * Bz[li] * (mask[k] ? Math.max(0, 1 - Kc) : 1), I1, LP.K[li], 0, z2 - z1, Tz[li], pv);
          met[ix] = (mo.R + c1.rOther * (1 - pv.ro_live * (mask[k] ? Kc : 0)) * inp.chl * Bz[li] - mo.P) / 3600 / iv;
        }
        triN[k] = lay_ ? NL : NA;
        rRea[k] = kO2 / D;                              // through the surface, shared over the stirred layer (see slowStep)
        sodA[k] = lay_ ? 0 : sod * A;
        for (let L = 0; L < NL; L++) {
          const ix = L * nw + k;
          if (withM) {
            const zc = L < NA ? 0.5 * (BF[L] + BF[L + 1]) * D : D + 0.5 * (g.h[k] - D);
            const li = layerOfDepth(col, zc);
            const r = CC.decayRate(chem, Tz[li], inp.chl * Bz[li], chem === 'flumioxazin' ? pHAt(c1, pv, tClock, L < NA) : 0, hr + 0.5, inp, pv);
            fac[ix] = Math.exp(-r * dte / 3600);
          }
          rQ[ix] = (kb > 0 ? kb * (bio.cu && M[ix] * cfg.invV[ix] > 1 ? pv.mc_cu_slow : 1) : 0) + (L < NA ? bio.vph / D : 0);   // + sunlight in the stirred layer
        }
        buildTri(k, dte, triA, triCP, triDN);
      }
    }

    const dp = new Float64Array(NL), dT2 = new Float64Array(NT);
    let horizOn = true;
    // Is everything already evenly spread sideways? Then sideways transport changes nothing visible and
    // is skipped until differences reappear (for example when the stirred layer deepens). "Even" means
    // a spread under 1% for the product, 2% for toxin and 0.05 mg/L for oxygen (the display steps are
    // about 4% and 0.05 mg/L; readouts show 0.1 mg/L); the result is scaled so 1 = at that limit.
    function spreadCheck(withM) {
      let worst = 0;
      for (let L = 0; L < NA; L++) {
        let vs = 0, ms = 0, qs = 0, xs = 0;
        for (let k = 0; k < nw; k++) { const ix = L * nw + k, V = cfg.V[ix]; if (V > 0) { vs += V; ms += M[ix]; qs += Q[ix]; xs += X[ix]; } }
        if (!(vs > 0)) continue;
        const mM = ms / vs, mQ = qs / vs, mX = xs / vs;
        let sM = 0, sQ = 0, sX = 0;
        for (let k = 0; k < nw; k++) {
          const ix = L * nw + k, V = cfg.V[ix]; if (!(V > 0)) continue;
          const a = M[ix] / V - mM, b = Q[ix] / V - mQ, c = X[ix] / V - mX;
          sM += V * a * a; sQ += V * b * b; sX += V * c * c;
        }
        if (withM && mM > 1e-6 * ref) worst = Math.max(worst, Math.sqrt(sM / vs) / mM / 0.01);
        if (mQ > 1e-6) worst = Math.max(worst, Math.sqrt(sQ / vs) / mQ / 0.02);
        worst = Math.max(worst, Math.sqrt(sX / vs) / 0.05);
      }
      return worst;
    }
    // sideways transport (upwind) and mixing of up to three tracers in one pass over the faces
    const dT3 = new Float64Array(NT);
    function horizApply(T1, T2, T3, dt) {
      dT.fill(0); dT2.fill(0); if (T3) dT3.fill(0);
      const nf = cfg.nf, coefA = cfg.coefA, upw = cfg.upw, cond = cfg.cond, invV = cfg.invV, f1 = cfg.fc1, f2 = cfg.fc2;
      for (let m = 0; m < NA; m++) {
        const off = m * nw, fo = m * nf;
        for (let f = 0; f < nf; f++) {
          const ix = fo + f, a = off + f1[f], b = off + f2[f], u = upw[ix];
          const ca = coefA[ix] * dt * (u === a ? 1 : -1), cd = cond[ix] * dt, ia = invV[a] * cd, ib = invV[b] * cd;
          const fl = ca * T1[u] + T1[a] * ia - T1[b] * ib; dT[a] -= fl; dT[b] += fl;
          const fl2 = ca * T2[u] + T2[a] * ia - T2[b] * ib; dT2[a] -= fl2; dT2[b] += fl2;
          if (T3) { const fl3 = ca * T3[u] + T3[a] * ia - T3[b] * ib; dT3[a] -= fl3; dT3[b] += fl3; }
        }
      }
      // sideways mixing of the cool bottom layer, where it exists
      if (cfg.anyLayered) {
        const off = NA * nw, fo = NA * nf;
        for (let f = 0; f < nf; f++) {
          const cd = cond[fo + f]; if (cd === 0) continue;
          const a = off + f1[f], b = off + f2[f], ia = invV[a] * cd * dt, ib = invV[b] * cd * dt;
          const fl = T1[a] * ia - T1[b] * ib; dT[a] -= fl; dT[b] += fl;
          const fl2 = T2[a] * ia - T2[b] * ib; dT2[a] -= fl2; dT2[b] += fl2;
          if (T3) { const fl3 = T3[a] * ia - T3[b] * ib; dT3[a] -= fl3; dT3[b] += fl3; }
        }
      }
      for (let i = 0; i < NT; i++) { T1[i] += dT[i]; T2[i] += dT2[i]; }
      if (T3) for (let i = 0; i < NT; i++) T3[i] += dT3[i];
    }
    // up/down mixing and the closing vertical flow (implicit) for up to three tracers
    const dp2 = new Float64Array(NL), dp3 = new Float64Array(NL);
    function vertSolve(T1, T2, T3) {
      const V = cfg.V;
      for (let k = 0; k < nw; k++) {
        const n = triN[k];
        let dn = triDN[k];
        dp[0] = T1[k] * dn; dp2[0] = T2[k] * dn; if (T3) dp3[0] = T3[k] * dn;
        for (let L = 1; L < n; L++) {
          const ix = L * nw + k, a = triA[ix]; dn = triDN[ix];
          dp[L] = (T1[ix] - a * dp[L - 1]) * dn; dp2[L] = (T2[ix] - a * dp2[L - 1]) * dn;
          if (T3) dp3[L] = (T3[ix] - a * dp3[L - 1]) * dn;
        }
        let ix = (n - 1) * nw + k, c1_ = dp[n - 1], c2_ = dp2[n - 1], c3_ = T3 ? dp3[n - 1] : 0;
        T1[ix] = c1_ * V[ix]; T2[ix] = c2_ * V[ix]; if (T3) T3[ix] = c3_ * V[ix];
        for (let L = n - 2; L >= 0; L--) {
          ix = L * nw + k; const cp = triCP[ix];
          c1_ = dp[L] - cp * c1_; c2_ = dp2[L] - cp * c2_;
          T1[ix] = c1_ * V[ix]; T2[ix] = c2_ * V[ix];
          if (T3) { c3_ = dp3[L] - cp * c3_; T3[ix] = c3_ * V[ix]; }
        }
      }
    }
    // product losses over one product step (exact exponentials)
    let chemDtH = 0;
    function chemM() {
      const h2 = chem === 'h2o2';
      if (dqRoom > 0) for (let i = 0; i < NT; i++) {           // clay binds diquat wherever they meet
        const V = cfg.V[i]; if (!(M[i] > 0) || !(V > 0)) continue;
        const db = S.diquatSorb(M[i] / V, bound[i] / V, dqRoom, pv.dq_ksorb, chemDtH) * V;
        M[i] -= db; bound[i] += db; boundTotal += db;
      }
      for (let i = 0; i < NT; i++) {
        const m0 = M[i]; if (m0 === 0) continue;
        const m1 = m0 * fac[i]; M[i] = m1; decayed += m0 - m1;
        if (h2) X[i] -= pv.h2o2_o2 * (m0 - m1);         // breaking-down peroxide adds oxygen
      }
      if (filmLive) for (let k = 0; k < nw; k++) {
        if (!(F[k] > 0)) continue;
        const ix = (cfg.layered[k] ? HYP : NA - 1) * nw + k, f0 = F[k], f1 = f0 * fac[ix];
        F[k] = f1; decayed += f0 - f1; if (h2) X[ix] -= pv.h2o2_o2 * (f0 - f1);
      }
    }
    // toxin and oxygen: losses and sources over the time since the last call (exact exponentials).
    // Knocked-down colonies leak their toxin and carbon where they were knocked down, at the
    // column's rate (mc_krel), as in the layers model ("where they are").
    let slowDue = 0;
    function slowStep() {
      const dt = slowDue; slowDue = 0; if (!(dt > 0)) return;
      const eKd = Math.exp(-bio.kdDead * dt), lk = 1 - Math.exp(-bio.krel * dt);
      for (let i = 0; i < NT; i++) {
        if (YQ[i] > 0) { const a = YQ[i] * lk, b = YC[i] * lk; YQ[i] -= a; YC[i] -= b; Q[i] += a; Cd[i] += b; mcReleased += a; }
        const r = rQ[i];
        if (r > 0) { const q0 = Q[i], q1 = q0 * Math.exp(-r * dt); Q[i] = q1; mcBio += q0 - q1; }
        const c0 = Cd[i];
        if (c0 > 0) { const cn = c0 * eKd; Cd[i] = cn; X[i] += pv.rOC * (c0 - cn); }   // dead bloom decays and uses oxygen
        X[i] += met[i] * dt;                                                             // the living bloom
      }
      for (let k = 0; k < nw; k++) {
        if (sodA[k] > 0) X[(NA - 1) * nw + k] += sodA[k] * dt;  // the bed's demand, where the stirred water touches it
        // reaeration through the surface. Applied to the whole stirred layer, which mixes far faster than
        // the 10-minute step: put on the thin top sublayer alone, the step would starve it (it under-
        // aerated the map by up to half a mg/L once the top sublayer was made thin, Oct 22, 2026)
        const fR = Math.exp(-rRea[k] * dt); for (let L = 0; L < NA; L++) X[L * nw + k] *= fR;
      }
    }
    function tickSlow(dt) { slowDue += dt; if (slowDue >= 600 - 1e-9) slowStep(); }
    // The dense film from an injection: front speed u = Fr·√(g′h), moving toward the steepest deeper
    // neighbour and mixing into the water above at E·u/h. Wind stirring breaks it up at once when
    // g′h/u*² falls below film_Ri. Arriving over a layered cell from shallower water, it spreads along
    // the thermocline if it is lighter than the cool water, and keeps going under it if denser.
    let hrNow = 0;
    function filmStep(dt) {
      dF.fill(0);
      const drTh = lay[hrNow].drho;
      for (let k = 0; k < nw; k++) {
        const m = F[k]; if (!(m > 0)) continue;
        const hf = hfA[k] / A, drho = filmDrho(m / hfA[k], injF), gp = GRAV * drho / RHO0;
        const ixb = (cfg.layered[k] ? HYP : NA - 1) * nw + k;
        if (!cfg.layered[k] && gp * hf < pv.film_Ri * cfg.kin) { M[ixb] += m; dF[k] -= m; continue; }
        const u = pv.front_Fr * Math.sqrt(Math.max(0, gp * hf));
        const det = m * (1 - Math.exp(-pv.film_E * u * dt / hf));
        M[ixb] += det; dF[k] -= det;
        const q = down[k], rest = m - det;
        if (q >= 0 && rest > 0) {
          const mv = rest * Math.min(1, u * dt / g.dx);
          dF[k] -= mv;
          if (cfg.layered[q] && !cfg.layered[k] && drho < drTh) M[(NA - 1) * nw + q] += mv;
          else dF[q] += mv;
        }
      }
      for (let k = 0; k < nw; k++) { const v = F[k] + dF[k]; F[k] = v > 0 ? v : 0; }
    }
    function productStep(dt) {
      chemDtH = dt / 3600;
      if (horizOn) horizApply(Q, X, M, dt);
      vertSolve(Q, X, M);
      chemM();
      if (filmLive) filmStep(dt);
    }

    function bedRelease(tS) {
      for (const b of bed) {
        if (b.done >= b.total) continue;
        const fr = tS >= b.tBed ? 1 : 1 - Math.pow(1 - tS / b.tBed, 1.5);
        const target = b.total * fr;
        if (target > b.done) { addMass(cfg.layered[b.k] ? HYP : NA - 1, b.k, target - b.done); b.done = target; }
      }
    }
    let bedPending = bed.length > 0;

    // Colonies move in each square's own layer coordinates: a colony a third of the way down the
    // stirred layer stays a third of the way down when it crosses into a shallower or deeper square
    // (the same coordinates the product, toxin and oxygen use), and the cool layer under a layered
    // square is its own space. Sideways mixing is a random step accepted with probability
    // min(1, new layer thickness ÷ old), which spreads colonies evenly by water volume whatever their
    // depth (Metropolis rule). (Until Oct 22, 2026 colonies kept their depth and a step over water
    // shallower than the colony was refused. With 48-80 s steps the up-and-down random walk was not
    // quite even, and refusing by depth turned that small error into a pile-up in deep water in wind:
    // the deepest third of a 1-acre pond held 73% of non-floating colonies against 59% of the water.)
    function moveParticles(dt, count, tH, doKill) {
      const dtH = dt / 3600, rise = c1.wCells, ust = cfg.ust, Kmin = pv.K_ml_min;
      const Dc = cfg.Dc, lay_ = cfg.layered, UgX = cfg.UgX, UgY = cfg.UgY, Wup = cfg.Wup, skC = cfg.skinC;
      const us = cfg.us, wv = cfg.wv, sk = cfg.sk, skOn = sk.extra > 0;
      const Fm = cfg.F, nf = cfg.nf, skM = cfg.skinM, dxg = g.dx, skE = sk.extra, skD = sk.delta, kv = 0.15 / (2 * KAPPA * Math.max(1e-12, ust));
      for (let p = 0; p < count; p++) {
        // Sub-steps where one step would be too long for this square: the current must not carry a
        // colony more than half a square per step, and the up-and-down random walk needs steps
        // short compared with D/(2κu*) for the square's own stirred depth D (shallow squares need
        // shorter steps than the pond-wide one). Up to 24 sub-steps.
        let left = dt, guard = 0;
        while (left > 1e-9 && guard++ < 24) {
        let k = pk[p], x = px[p], y = py[p];
        const D = Dc[k], hk = g.h[k], lay = lay_[k];
        let z = pz[p];
        let ux = 0, uy = 0, wa = 0;
        if (z < D) {
          // Sideways speed from the flow's own face fluxes for this sublayer, interpolated across the
          // square (as in Pollock's particle tracking), so colonies go where the water goes and pile up
          // nowhere. On top of that, the shape of the current within the sublayer (the fast surface skin,
          // the counterflow's shear), which averages to zero over the sublayer.
          const sg = z / D, m = subOf(sg), sh = BF[m + 1] - BF[m], tk = sh * D, fr = (sg - BF[m]) / sh;
          const xi = (x - g.x0) / dxg - g.ci[k], yi = (y - g.y0) / dxg - g.cj[k], off = m * nf, kf = 1 / (dxg * tk);
          const iw = faceW[k], ie = faceE[k], is = faceS[k], in_ = faceN[k];
          ux = ((1 - xi) * (iw >= 0 ? Fm[off + iw] : 0) + xi * (ie >= 0 ? Fm[off + ie] : 0)) * kf;
          uy = ((1 - yi) * (is >= 0 ? Fm[off + is] : 0) + yi * (in_ >= 0 ? Fm[off + in_] : 0)) * kf;
          const ze = (D - z) / D, gd = 3 * (ze - 0.5 * ze * ze) - GMEAN[m];
          let ss = us * (3 * ze * ze - 2 * ze - SMEAN[m]);
          if (skOn) ss += skE * ((z < 25 * skD ? Math.exp(-z / skD) : 0) - skC[k]) - skM[m * nw + k];
          // The within-sublayer part goes to zero at a land edge, across the shore square, the way the
          // face fluxes do; the small up-and-down flow that this squeezing implies (zero at the
          // sublayer's top and bottom, because the part averages to zero over the sublayer) is added
          // to the vertical speed, so the colonies' flow keeps the water's volume. Until Nov 8, 2026
          // it was added in full right up to the shore and a step onto land was refused, so colonies
          // that should follow the water collected on the downwind shore (bug H1 in the Nov 8, 2026 code review).
          const oW = iw >= 0 ? 1 : 0, oE = ie >= 0 ? 1 : 0, oS = is >= 0 ? 1 : 0, oN = in_ >= 0 ? 1 : 0;
          const fX = (1 - xi) * oW + xi * oE, fY = (1 - yi) * oS + yi * oN;
          ux += (UgX[k] * gd + ss * wv[0]) * fX; uy += (UgY[k] * gd + ss * wv[1]) * fY;
          const Wt = m > 0 ? Wup[(m - 1) * nw + k] : 0, Wb = Wup[m * nw + k];
          wa = (Wt * (1 - fr) + Wb * fr) / A;           // upward, m/s
          const dfX = (oE - oW) / dxg, dfY = (oN - oS) / dxg;
          if (dfX !== 0 || dfY !== 0) {
            // depth integrals of the two shapes from the sublayer's top down to the colony
            const zt = BF[m] * D, et = 1 - BF[m];
            const Gf = e => 3 * (e * e / 2 - e * e * e / 6), Sf = e => e * e * e - e * e;
            const IG = D * (Gf(et) - Gf(ze) - GMEAN[m] * (et - ze));
            let IS = us * D * (Sf(et) - Sf(ze) - SMEAN[m] * (et - ze));
            if (skOn) IS += skE * (skD * (Math.exp(-zt / skD) - Math.exp(-z / skD)) - skC[k] * (z - zt)) - skM[m * nw + k] * (z - zt);
            wa += dfX * (UgX[k] * IG + IS * wv[0]) + dfY * (UgY[k] * IG + IS * wv[1]);   // up = − (down speed)
          }
        }
        const sp = Math.sqrt(ux * ux + uy * uy), dtA = sp > 0 ? 0.5 * dxg / sp : Infinity;
        const dtV = ust > 0 ? kv * Math.max(0.05, lay && z >= D ? hk - D : D) : Infinity;
        const dts = left <= Math.min(dtA, dtV) * 1.0001 || guard === 24 ? left : Math.min(left, Math.max(dt / 24, Math.min(dtA, dtV)));
        left -= dts;
        // vertical random walk (Visser 1997): drift dK/dz, then a step with K at the shifted depth.
        // In a layered square the thermocline is a wall for the random part of the step: mixing across it
        // is about a hundred times weaker than in the stirred water, and with these step lengths a
        // colony near the bottom of the stirred layer would otherwise be thrown into the still cool water
        // and stuck there (it piled colonies into deep squares in wind). Floating, sinking and the
        // up-and-down flow still carry colonies across it, and a stirred layer that deepens takes in
        // the colonies below it.
        z = vertMove(z, D, hk, lay, wa + rise, KAPPA * ust, Kmin, Kthermo, dts, rngP);
        // where it sits: in the stirred layer (share of D) or in the cool layer under it
        const inB = lay && z >= D, sig = inB ? (z - D) / Math.max(1e-9, hk - D) : z / D;
        // carried by the current (the cool layer doesn't move sideways); a step onto land is refused
        if (!inB && (ux !== 0 || uy !== 0)) {
          const xa = x + ux * dts, ya = y + uy * dts, ka = cellAt(g, xa, ya);
          if (ka >= 0) { x = xa; y = ya; k = ka; }
        }
        // sideways mixing, accepted by the ratio of layer thickness (Metropolis)
        const sKh = Math.sqrt(2 * Kh * dts), xd = x + rngP.g() * sKh, yd = y + rngP.g() * sKh, kd = cellAt(g, xd, yd);
        if (kd >= 0 && kd !== k) {
          const t0 = inB ? hk - D : Dc[k], t1 = inB ? (lay_[kd] ? g.h[kd] - Dc[kd] : 0) : Dc[kd];
          if (t1 > 0 && (t1 >= t0 || rngP.u() * t0 < t1)) { x = xd; y = yd; k = kd; }
        } else if (kd === k) { x = xd; y = yd; }
        z = inB ? Dc[k] + sig * (g.h[k] - Dc[k]) : sig * Dc[k];
        px[p] = x; py[p] = y; pk[p] = k; pz[p] = z;
        }
        const k = pk[p], z = pz[p];
        if (doKill) {
          killStep(ks, p, expo(k, z), dtH, kill, tH);
          if (ks.dead[p] && !gone[p]) { gone[p] = 1; const ix = layerAtDepth(k, z) * nw + k; YQ[ix] += bio.mcPer; YC[ix] += bio.carbPer; }
        }
      }
    }

    let tS = 0, horizHours = 0, upwellH = null;
    hourSetup(0, 60, true);
    record(0);
    const HOURS = Math.min(RUN_H, opts.hours || RUN_H);
    for (let hr = 0; hr < HOURS; hr++) {
      hrNow = hr;
      const nc = getCfg(hr);
      if (nc !== cfg) { const old = cfg; cfg = nc; remap(old, cfg); }
      const dtp = particleStep(cfg.hmix, cfg.ust);
      if (!bedPending) { const cv = spreadCheck(transportOn); if (horizOn && cv < 1) horizOn = false; else if (!horizOn && cv > 2.5) horizOn = true; }
      else horizOn = true;
      const nps = Math.round(3600 / dtp);
      const pcount = () => killActive ? np : show;
      if (transportOn) {
        const nsub = horizOn ? Math.max(1, Math.ceil(dtp / cfg.dtMax)) : 1, dte = dtp / nsub;
        hourSetup(hr, dte, true);
        for (let s = 0; s < nps; s++) {
          for (let q = 0; q < nsub; q++) {
            productStep(dte); tickSlow(dte);
            tS += dte; if (bedPending) bedRelease(tS);
          }
          moveParticles(dtp, pcount(), tS / 3600, killActive);
        }
      } else {
        // product spent: only toxin and oxygen move, with longer steps
        const nE = Math.max(1, Math.ceil(3600 / Math.min(600, horizOn ? cfg.dtMax : 600))), dtE = 3600 / nE;
        hourSetup(hr, dtE, false);
        let s = 0;
        for (let e = 0; e < nE; e++) {
          if (horizOn) horizApply(Q, X, null, dtE);
          vertSolve(Q, X, null);
          tickSlow(dtE);
          for (const sEnd = Math.round((e + 1) * nps / nE); s < sEnd; s++) { tS += dtp; moveParticles(dtp, pcount(), tS / 3600, killActive); }
        }
      }
      slowStep();                                       // finish the hour's slow chemistry
      if (horizOn) horizHours++;
      record(hr + 1);
      if (upwellH === null && upwell[hr + 1] > 0) upwellH = hr + 1;
      if (opts.onProgress && (hr + 1) % 12 === 0) opts.onProgress('map', (hr + 1) / HOURS);
      if (bedPending) { bedPending = false; for (const b of bed) if (b.done < b.total) { bedPending = true; break; } }
      // the film is spent (under 0.1% of what went in): what is left joins the water above it
      if (filmLive && filmMass[hr + 1] < 1e-3 * filmIn) {
        for (let k = 0; k < nw; k++) if (F[k] > 0) { M[(cfg.layered[k] ? HYP : NA - 1) * nw + k] += F[k]; F[k] = 0; }
        filmLive = false; filmEndH = hr + 1;
      }
      // the product is spent: stop its transport (below 0.01% of the effect level) and the per-colony kill
      if (transportOn && !bedPending && !filmLive && Cmax[hr + 1] < 1e-3 * ref) {
        transportOn = false; transportEndH = hr + 1;
        for (let i = 0; i < NT; i++) { dropped += M[i]; M[i] = 0; }
      }
      if (killActive && killCanStop(ks, np, kill, transportOn ? Cmax[hr + 1] : 0, bedPending || filmLive)) { killActive = false; killEndH = hr + 1; }
    }

    let bedLeft = 0; for (const b of bed) bedLeft += b.total - b.done;
    let inWater = 0; for (let i = 0; i < NT; i++) inWater += M[i]; for (let k = 0; k < nw; k++) inWater += F[k];
    let Qnow = 0, inside = 0; for (let i = 0; i < NT; i++) { Qnow += Q[i]; inside += YQ[i]; }
    let filmStir = filmIn > 0 && filmMass[1] < 0.05 * filmIn;
    return {
      nw, show, np, topQ, botQ, mcTopQ, mcBotQ, doQ, cfgOfHour, sx, sy, sz, sdead, K, Cexp, CtopMean, CbotMean, Cmax, massW,
      MCml, MCtopMax, DOml, DOmin, filmMass, upwell, Wed,
      configs: cfgList,
      budget: { released, boundTotal, demandTotal, decayed, dropped, bedLeft, inWater },
      toxin: { start: Q0, released: mcReleased, degraded: mcBio, inWater: Qnow, stillInside: inside },
      film: { used: filmIn > 0, filmIn, endH: filmEndH, stirredAtOnce: filmStir },
      skin: { surface: sk0.surface, extra: sk0.extra, delta: sk0.delta },
      tilt: { upwellH, upwellDT: upwellH !== null ? lay[upwellH].dT : null, fetch: lengthAlong(inp.windFrom || 0), slope0: lay[0].slope, drho0: lay[0].drho },
      Kh, us: pv.us_coef * c1.ustar, killEndH, transportEndH, horizHours, ref
    };
  }

  // ---------------------------------------------------------------- the side slice
  function buildSlice(g, wv) {
    const c0 = cellCenter(g, g.deepest), step = g.dx / 4;
    let sD = 0, sU = 0;
    while (cellAt(g, c0[0] + (sD + step) * wv[0], c0[1] + (sD + step) * wv[1]) >= 0 && sD < 1e5) sD += step;
    while (cellAt(g, c0[0] + (sU - step) * wv[0], c0[1] + (sU - step) * wv[1]) >= 0 && sU > -1e5) sU -= step;
    sD += step / 2; sU -= step / 2;
    const L = sD - sU, nxs = NX_SLICE, dxs = L / nxs;
    const hcol = new Float64Array(nxs), mapCell = new Int32Array(nxs);
    for (let i = 0; i < nxs; i++) {
      const s = sU + (i + 0.5) * dxs, x = c0[0] + s * wv[0], y = c0[1] + s * wv[1];
      let k = cellAt(g, x, y);
      if (k < 0) {                                    // just outside a cell edge: nearest wet cell
        let best = -1, bd = Infinity;
        for (let q = 0; q < g.nw; q++) { const c = cellCenter(g, q), d = Math.hypot(c[0] - x, c[1] - y); if (d < bd) { bd = d; best = q; } }
        k = best;
      }
      mapCell[i] = k; hcol[i] = g.h[k];
    }
    return { L, nxs, dxs, hcol, mapCell, start: [c0[0] + sU * wv[0], c0[1] + sU * wv[1]], end: [c0[0] + sD * wv[0], c0[1] + sD * wv[1]] };
  }

  // ext: { slope (tilt of the thermocline, m per m downwind), s0 (downwind distance of the slice's
  // upwind end from the pond's centroid), skin }
  function sliceConfig(sl, hmix, us, dz, N, Kh, ext) {
    const nxs = sl.nxs, dxs = sl.dxs;
    const nlev = sl.nlev;
    const hs = i => nlev[i] * dz;
    const NC = N + 1;
    const slope = ext && ext.slope || 0, s0 = ext && ext.s0 || 0, sk = ext && ext.skin;
    const Dt = x => slope ? hmix + slope * (s0 + x) : hmix;     // tilted stirred depth at distance x along the slice
    const psi = new Float64Array((nxs + 1) * NC);
    const Dcorner = new Float64Array(nxs + 1);
    for (let i = 0; i <= nxs; i++) {
      const hc = (i === 0 || i === nxs) ? 0 : Math.min(hs(i - 1), hs(i));
      const D = Math.min(hc, Math.max(H_MIN, Dt(i * dxs))); Dcorner[i] = D;
      if (!(D > 0)) continue;
      for (let k = 0; k <= N; k++) {
        const z = k * dz; if (z >= D) break;
        const ze = (D - z) / D;
        psi[i * NC + k] = us * D * ze * ze * (ze - 1) - skinT(z, D, sk);   // per unit width, m²/s
      }
    }
    const Fx = new Float64Array((nxs + 1) * N);              // through the face at x-corner i, level k (+ downwind)
    const Wt = new Float64Array(nxs * NC);                   // up through the top of cell (i, k)
    for (let i = 1; i < nxs; i++) {
      const n = Math.min(nlev[i - 1], nlev[i]);
      for (let k = 0; k < n; k++) Fx[i * N + k] = psi[i * NC + k] - psi[i * NC + k + 1];
    }
    for (let i = 0; i < nxs; i++) for (let k = 1; k < nlev[i]; k++) Wt[i * NC + k] = psi[i * NC + k] - psi[(i + 1) * NC + k];
    const Dcol = new Float64Array(nxs), layered = new Uint8Array(nxs), outcrop = new Uint8Array(nxs);
    for (let i = 0; i < nxs; i++) {
      const h = hs(i), Di = Dt((i + 0.5) * dxs);
      if (h - Di > 0.01) { Dcol[i] = Math.max(H_MIN, Di); layered[i] = 1; if (Di < H_MIN) outcrop[i] = 1; } else Dcol[i] = h;
    }
    // explicit stability for the sideways part (advection + mixing); vertical is implicit
    const V = dxs * dz, dcond = Kh * dz / dxs;
    let rateMax = 1e-9;
    for (let i = 0; i < nxs; i++) for (let k = 0; k < nlev[i]; k++) {
      let o = 0;
      const fw = Fx[i * N + k], fe = Fx[(i + 1) * N + k];
      if (fw < 0) o -= fw; if (fe > 0) o += fe;
      if (i > 0 && k < nlev[i - 1]) o += dcond; if (i < nxs - 1 && k < nlev[i + 1]) o += dcond;
      if (o / V > rateMax) rateMax = o / V;
    }
    const dtMax = Math.min(600, 0.9 / rateMax);
    // cell-centre velocities for arrows (m/s)
    const uc = new Float32Array(nxs * N), wc = new Float32Array(nxs * N);
    for (let i = 0; i < nxs; i++) for (let k = 0; k < nlev[i]; k++) {
      uc[i * N + k] = 0.5 * (Fx[i * N + k] + Fx[(i + 1) * N + k]) / dz;
      const wt = k > 0 ? Wt[i * NC + k] : 0, wb = k + 1 < nlev[i] ? Wt[i * NC + k + 1] : 0;
      wc[i * N + k] = 0.5 * (wt + wb) / dxs;
    }
    return { hmix, slope, Fx, Wt, Dcol, layered, outcrop, dtMax, uc, wc, psi, Dcorner };
  }

  function runSlice(inp, pv, c1, g, mask, opts) {
    // light at the top of each of the layers model's layers, the cells shading the water below them
    const lightProfile = (I0, Bz) => {
      const cl = c1.col, Ia = new Float64Array(cl.N), Ka = new Float64Array(cl.N); let I = I0;
      for (let l = 0; l < cl.N; l++) { Ia[l] = I; Ka[l] = c1.KdMin + c1.KdChl * Bz[l]; I *= Math.exp(-Ka[l] * (cl.zi[l + 1] - cl.zi[l])); }
      return { I: Ia, K: Ka };
    };
    opts = opts || {};
    const col = c1.col, N = col.N, dz = col.dz, NC = N + 1, chem = c1.chem;
    // The slice is cut along the wind at treatment time and stays put. When the wind turns, only its
    // share along the slice drives the slice's loop (a crosswind drives none of it); the mixing still
    // follows the full wind.
    const wv = windVec(inp.windFrom), Kh = pv.kh_scale * Math.sqrt(g.A0);
    const kill = c1.kill, ref = c1.ec && !c1.ec.none ? c1.ec.v : c1.doseMgL;
    const rngP = rngPair((opts.seed || 20261019) ^ 0x27d4eb2f);
    const sl = buildSlice(g, wv), nxs = sl.nxs, dxs = sl.dxs, V = dxs * dz;
    sl.nlev = new Int32Array(nxs);
    for (let i = 0; i < nxs; i++) sl.nlev[i] = Math.max(1, Math.min(N, Math.round(sl.hcol[i] / dz)));
    const nlev = sl.nlev;
    const treated = new Uint8Array(nxs); for (let i = 0; i < nxs; i++) treated[i] = mask[sl.mapCell[i]] ? 1 : 0;
    const np = NP_SLICE;
    let As = 0; for (let i = 0; i < nxs; i++) As += nlev[i] * dz * dxs;     // cross-section, m² (per metre of width)
    const bio = bioSetup(inp, pv, c1, As, np);
    const injF = inp.method === 'inject' ? injectProps(inp.product, pv) : null;
    const hfs = new Float64Array(nxs); for (let i = 0; i < nxs; i++) hfs[i] = Math.min(pv.film_h, nlev[i] * dz);

    const s0 = (sl.start[0] - g.cx) * wv[0] + (sl.start[1] - g.cy) * wv[1];
    const sRef = Math.max(dxs, Math.abs(s0), Math.abs(s0 + sl.L));
    const lay = tiltSeries(c1, pv, lengthAlongFn(g));
    const cache = new Map(), list = [], CACHE_MAX = 32;
    const getCfg = hr => {
      const hm = c1.rec.hmix[hr], ly = lay[hr], w = windOf(c1, hr);
      const along = ly.tx * wv[0] + ly.ty * wv[1];                       // tilt along the slice
      const dq = Math.max(-2000, Math.min(2000, Math.round(along * sRef / 0.04)));
      const calm = !(w.ust > 1e-5), cs = w.wv[0] * wv[0] + w.wv[1] * wv[1];   // share of the wind along the slice
      const ub = calm ? -9999 : Math.round(Math.log(w.ust) / Math.log(1.05)), cb = calm ? 0 : Math.round(cs * 20);
      const key = hm.toFixed(3) + '|' + dq + '|' + ub + '|' + cb;
      let c = cache.get(key);
      if (c) { cache.delete(key); cache.set(key, c); return c; }
      const ust = calm ? 0 : Math.exp(ub * Math.log(1.05)), share = cb / 20, us = pv.us_coef * ust * share;
      const skF = skinSetup(ust, pv, pv.us_coef * ust), sk = { extra: skF.extra * share, delta: skF.delta };
      c = sliceConfig(sl, hm, us, dz, N, Kh, { slope: dq * 0.04 / sRef, s0, skin: sk });
      Object.assign(c, { us, sk, kin: ust * ust, share, id: list.length });
      list.push({ hmix: c.hmix, slope: c.slope, Dcol: Float32Array.from(c.Dcol), layered: c.layered, outcrop: c.outcrop, uc: c.uc, wc: c.wc, dtMax: c.dtMax, share });
      cache.set(key, c);
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
      return c;
    };
    let cfg = getCfg(0);

    const cellCount = nxs * N;
    // concentrations per cell: product (mg/L), toxin (µg/L), oxygen deficit and dead carbon (mg/L);
    // the dense film per column (g per metre of width)
    const C = new Float64Array(cellCount), Q = new Float64Array(cellCount), X = new Float64Array(cellCount), Cd = new Float64Array(cellCount), dT = new Float64Array(cellCount);
    const YQ = new Float64Array(cellCount), YC = new Float64Array(cellCount);   // still inside knocked-down colonies
    const Fs = new Float64Array(nxs), dF = new Float64Array(nxs);
    const bound = new Float64Array(cellCount), demand = new Float64Array(cellCount);   // bound: diquat held by clay, mg/L
    let boundTotal = 0, demandTotal = 0, decayed = 0, released = 0, dropped = 0, mcReleased = 0, mcBio = 0;
    const dqRoom = chem === 'diquat' ? S.diquatRoom(inp, pv) : 0;
    const B0 = c1.snaps.B[0];
    {
      const T0 = c1.snaps.T[0][0], eq = sodRate(pv, T0) / (CC.reaerationVel(c1.U, T0, pv) * 86400);
      for (let i = 0; i < nxs; i++) for (let k = 0; k < nlev[i]; k++) { Q[i * N + k] = bio.MC0; if (!cfg.layered[i]) X[i * N + k] = eq; }
    }
    let Q0 = 0; for (let q = 0; q < cellCount; q++) Q0 += Q[q] * V;

    function addConc(i, k, add, toFilm) {              // mg/L into cell (i,k)
      const ix = i * N + k;
      if (chem === 'h2o2') { const want = Math.min(pv.dinst_cap, pv.h2o2_dinst * Math.max(0.05, B0[k])); const room = Math.max(0, want - demand[ix]), d = Math.min(add, room); demand[ix] += d; add -= d; demandTotal += d * V; X[ix] -= pv.h2o2_o2 * d; }
      if (toFilm) Fs[i] += add * V; else C[ix] += add;
    }
    const dose = c1.doseMgL, bed = [];
    const grains = inp.method === 'granules' ? grainTables(inp, pv, c1) : null;
    for (let i = 0; i < nxs; i++) {
      if (!treated[i]) continue;
      const n = nlev[i], h = n * dz, massPerW = dose * h * dxs;   // g per m of width
      released += massPerW;
      if (inp.method === 'spray') {
        const dl = Math.min(pv.spray_depth, h); let tot = 0;
        for (let k = 0; k < n; k++) tot += Math.max(0, Math.min((k + 1) * dz, dl) - k * dz);
        for (let k = 0; k < n; k++) { const sh = Math.max(0, Math.min((k + 1) * dz, dl) - k * dz) / tot; if (sh > 0) addConc(i, k, massPerW * sh / V); }
      } else if (inp.method === 'inject') {
        if (cfg.layered[i]) {
          const k0 = Math.min(n - 1, Math.floor(cfg.Dcol[i] / dz)), k1 = Math.min(n - 1, Math.floor((cfg.Dcol[i] + 0.3) / dz));
          for (let k = k0; k <= k1; k++) addConc(i, k, massPerW / (k1 - k0 + 1) / V);
        } else addConc(i, n - 1, massPerW / V, !!injF);
      } else {
        let used = 0;
        for (let k = 0; k < n; k++) { const f = grains.dissolved(k * dz, (k + 1) * dz); if (f > 0) { addConc(i, k, massPerW * f / V); used += f; } }
        for (const ld of grains.landed(h)) { bed.push({ i, k: n - 1, total: massPerW * ld.frac, done: 0, tBed: ld.tBed }); used += ld.frac; }
        if (Math.abs(1 - used) > 1e-9) addConc(i, 0, massPerW * (1 - used) / V);
      }
    }
    let filmIn = 0; for (let i = 0; i < nxs; i++) filmIn += Fs[i];
    let filmLive = filmIn > 0, filmEndH = filmLive ? null : 0;

    // particles: placed in proportion to the column's bloom profile (unit width, so uniform along x)
    const ppx = new Float64Array(np), ppz = new Float64Array(np);
    {
      let Bmax = 0; for (let k = 0; k < N; k++) Bmax = Math.max(Bmax, B0[k]);
      let p = 0, guard = 0;
      while (p < np && guard++ < np * 5000) {
        const x = rngP.u() * sl.L, i = Math.min(nxs - 1, Math.floor(x / dxs)), h = nlev[i] * dz;
        const z = rngP.u() * col.zmax;
        if (z > h) continue;
        if (rngP.u() > B0[layerOfDepth(col, z)] / Bmax) continue;
        ppx[p] = x; ppz[p] = z; p++;
      }
    }
    const ks = makeKillState(np, kill, rngP);
    const gone = new Uint8Array(np);

    const NH = RUN_H + 1, show = Math.min(NSHOW_SLICE, np);
    const cQ = new Uint8Array(NH * cellCount), mcQ = new Uint8Array(NH * cellCount), doQ = new Uint8Array(NH * cellCount), cfgOfHour = new Uint16Array(NH);
    const qx = new Float32Array(NH * show), qz = new Float32Array(NH * show), qdead = new Uint8Array(NH * show);
    const K = new Float64Array(NH), Cexp = new Float64Array(NH), massW = new Float64Array(NH), CbotMax = new Float64Array(NH), CmaxA = new Float64Array(NH);
    const MCml = new Float64Array(NH), MCtopMax = new Float64Array(NH), DOml = new Float64Array(NH), DOmin = new Float64Array(NH), filmMass = new Float64Array(NH), upwell = new Float64Array(NH);
    let killActive = !!kill, killEndH = kill ? null : 0, transportOn = true, transportEndH = null;

    // per-hour set-up: loss factors, the vertical implicit operator, reaeration and the bed's demand
    const fac = new Float64Array(cellCount), rQ = new Float64Array(cellCount);
    const triA = new Float64Array(cellCount), triCP = new Float64Array(cellCount), triDN = new Float64Array(cellCount);
    const ta = new Float64Array(N), tb = new Float64Array(N), tc = new Float64Array(N);
    const sodR = new Float64Array(nxs), metS = new Float64Array(nxs * N);   // metS: living bloom, mg/L per second
    let Kthermo = pv.K_floor, rRea = 0, ustH = c1.ustar;
    function hourSetup(hr, dte, withM) {
      const Tz = c1.snaps.T[hr], Bz = c1.snaps.B[hr], Kz = c1.snaps.K[hr];
      const ki = Math.max(1, Math.min(N - 1, Math.round(cfg.hmix / dz)));
      Kthermo = Math.max(pv.K_floor, Kz[ki] || pv.K_floor);
      const tClock = (inp.appHour + hr + 0.5) % 24;
      const wh = windOf(c1, hr); ustH = wh.ust;
      const kO2 = CC.reaerationVel(wh.U, Tz[0], pv), sod = sodRate(pv, Tz[0]) / 86400;
      const kb = hr + 0.5 >= bio.lagH ? bio.kbio : 0;
      rRea = kO2 / dz;
      const rMix = new Float64Array(N), rDeep = new Float64Array(N);
      if (withM) for (let k = 0; k < N; k++) {
        rDeep[k] = CC.decayRate(chem, Tz[k], inp.chl * Bz[k], chem === 'flumioxazin' ? pHAt(c1, pv, tClock, false) : 0, hr + 0.5, inp, pv);
        rMix[k] = chem === 'flumioxazin' ? CC.decayRate(chem, Tz[k], inp.chl * Bz[k], pHAt(c1, pv, tClock, true), hr + 0.5, inp, pv) : rDeep[k];
      }
      const lt = c1.rec.light, Ib = 0.5 * (lt[Math.min(lt.length - 1, hr)] + lt[Math.min(lt.length - 1, hr + 1)]), Kc = c1.rec.K[Math.min(c1.rec.K.length - 1, hr)];
      const LP = lightProfile(Ib, Bz);
      for (let i = 0; i < nxs; i++) {
        const n = nlev[i], D = cfg.Dcol[i], lay = cfg.layered[i];
        sodR[i] = lay ? 0 : sod / dz;                   // mg/L per second into the bottom cell
        for (let k = 0; k < n; k++) { const mo = S.bloomO2(inp.chl * Bz[k] * (treated[i] ? Math.max(0, 1 - Kc) : 1), LP.I[k], LP.K[k], 0, dz, Tz[k], pv); metS[i * N + k] = (mo.R + c1.rOther * (1 - pv.ro_live * (treated[i] ? Kc : 0)) * inp.chl * Bz[k] - mo.P) / 3600; }
        for (let k = 0; k < n; k++) {
          const ix = i * N + k;
          if (withM) fac[ix] = Math.exp(-((k + 0.5) * dz < D ? rMix[k] : rDeep[k]) * dte / 3600);
          rQ[ix] = (kb > 0 ? kb * (bio.cu && C[ix] > 1 ? pv.mc_cu_slow : 1) : 0) + ((k + 0.5) * dz < D ? bio.vph / D : 0);   // + sunlight in the stirred layer
          ta[k] = 0; tc[k] = 0; tb[k] = V;
        }
        for (let k = 1; k < n; k++) {
          const zi = k * dz;
          const Kv = zi < D ? Math.max(pv.K_ml_min, KAPPA * ustH * zi * (1 - zi / D)) : (lay ? Math.max(pv.K_floor, Kz[k]) : pv.K_ml_min);
          const e = Kv * dxs / dz * dte;
          tb[k - 1] += e; tb[k] += e; tc[k - 1] -= e; ta[k] -= e;
          const W = cfg.Wt[i * NC + k] * dte;           // up through the top of cell k
          if (W > 0) { tc[k - 1] -= W; tb[k] += W; } else if (W < 0) { tb[k - 1] -= W; ta[k] += W; }
        }
        const o = i * N;
        triA[o] = 0; let den = tb[0]; triDN[o] = 1 / den; triCP[o] = tc[0] / den;
        for (let k = 1; k < n; k++) { triA[o + k] = ta[k]; den = tb[k] - ta[k] * triCP[o + k - 1]; triDN[o + k] = 1 / den; triCP[o + k] = tc[k] / den; }
      }
    }
    const filmC = i => Fs[i] > 0 ? Fs[i] / (hfs[i] * dxs) : 0;
    function expo(i, z) {
      const kk = Math.min(nlev[i] - 1, Math.floor(z / dz));
      let c = C[i * N + kk];
      if (Fs[i] > 0 && z > nlev[i] * dz - hfs[i]) c += filmC(i);
      return c;
    }
    function record(hr) {
      cfgOfHour[hr] = cfg.id;
      const sat = S.doSat(c1.snaps.T[hr][0]);
      let mw = 0, cbm = 0, cm = 0, qs = 0, nsC = 0, xs = 0, qmax = 0, dmin = Infinity, fm = 0, out = 0;
      for (let i = 0; i < nxs; i++) {
        const n = nlev[i], h = n * dz, fc = filmC(i), D = cfg.Dcol[i], lay = cfg.layered[i];
        let xc = 0, nc = 0;
        for (let k = 0; k < n; k++) {
          const ix = i * N + k, zc = (k + 0.5) * dz;
          let c = C[ix]; if (fc > 0 && zc > h - hfs[i]) c += fc;
          cQ[hr * cellCount + ix] = quant(c, ref); mw += C[ix] * V;
          if (c > cm) cm = c;
          if (k === n - 1 && c > cbm) cbm = c;
          mcQ[hr * cellCount + ix] = quantMC(Q[ix]);
          if (!lay || zc < D) { qs += Q[ix]; xs += X[ix]; nsC++; xc += X[ix]; nc++; doQ[hr * cellCount + ix] = quantDO(Math.max(0, sat - X[ix])); }
          else doQ[hr * cellCount + ix] = 255;            // oxygen below the thermocline is not modeled
          if (k === 0 && Q[ix] > qmax) qmax = Q[ix];
        }
        mw += Fs[i]; fm += Fs[i];
        if (nc) { const d = Math.max(0, sat - xc / nc); if (d < dmin) dmin = d; }
        if (cfg.outcrop[i]) out++;
      }
      massW[hr] = mw; CbotMax[hr] = cbm; CmaxA[hr] = cm;
      MCml[hr] = qs / nsC; MCtopMax[hr] = qmax; DOml[hr] = Math.max(0, sat - xs / nsC); DOmin[hr] = dmin;
      filmMass[hr] = fm; upwell[hr] = out / nxs;
      let ce = 0, nd = 0;
      for (let p = 0; p < np; p++) {
        const i = Math.min(nxs - 1, Math.max(0, Math.floor(ppx[p] / dxs)));
        ce += expo(i, ppz[p]); if (ks.dead[p]) nd++;
      }
      Cexp[hr] = ce / np; K[hr] = nd / np;
      for (let p = 0; p < show; p++) { qx[hr * show + p] = ppx[p]; qz[hr * show + p] = ppz[p]; qdead[hr * show + p] = ks.dead[p]; }
    }
    const dpv = new Float64Array(N);
    let horizOn = true;
    // sideways: advection (upwind) + mixing, as mass per unit width, for up to three tracers
    const dT2 = new Float64Array(cellCount), dT3 = new Float64Array(cellCount);
    function horizApply(T1, T2, T3, dt) {
      dT.fill(0); dT2.fill(0); if (T3) dT3.fill(0);
      const Fx = cfg.Fx, dc = Kh * dz / dxs * dt;
      for (let i = 1; i < nxs; i++) {
        const n = Math.min(nlev[i - 1], nlev[i]);
        for (let k = 0; k < n; k++) {
          const q = Fx[i * N + k] * dt, w = (i - 1) * N + k, e = i * N + k, u = q > 0 ? w : e;
          const f1 = q * T1[u] + dc * (T1[w] - T1[e]); dT[w] -= f1; dT[e] += f1;
          const f2 = q * T2[u] + dc * (T2[w] - T2[e]); dT2[w] -= f2; dT2[e] += f2;
          if (T3) { const f3 = q * T3[u] + dc * (T3[w] - T3[e]); dT3[w] -= f3; dT3[e] += f3; }
        }
      }
      const iV = 1 / V;
      for (let q = 0; q < cellCount; q++) { T1[q] += dT[q] * iV; T2[q] += dT2[q] * iV; }
      if (T3) for (let q = 0; q < cellCount; q++) T3[q] += dT3[q] * iV;
    }
    const dpv2 = new Float64Array(N), dpv3 = new Float64Array(N);
    function vertSolve(T1, T2, T3) {
      for (let i = 0; i < nxs; i++) {
        const n = nlev[i], o = i * N;
        let dn = triDN[o];
        dpv[0] = T1[o] * V * dn; dpv2[0] = T2[o] * V * dn; if (T3) dpv3[0] = T3[o] * V * dn;
        for (let k = 1; k < n; k++) {
          const a = triA[o + k]; dn = triDN[o + k];
          dpv[k] = (T1[o + k] * V - a * dpv[k - 1]) * dn; dpv2[k] = (T2[o + k] * V - a * dpv2[k - 1]) * dn;
          if (T3) dpv3[k] = (T3[o + k] * V - a * dpv3[k - 1]) * dn;
        }
        let x1 = dpv[n - 1], x2 = dpv2[n - 1], x3 = T3 ? dpv3[n - 1] : 0;
        T1[o + n - 1] = x1; T2[o + n - 1] = x2; if (T3) T3[o + n - 1] = x3;
        for (let k = n - 2; k >= 0; k--) {
          const cp = triCP[o + k];
          x1 = dpv[k] - cp * x1; x2 = dpv2[k] - cp * x2; T1[o + k] = x1; T2[o + k] = x2;
          if (T3) { x3 = dpv3[k] - cp * x3; T3[o + k] = x3; }
        }
      }
    }
    // product losses over one step (exact exponentials); breaking-down peroxide adds oxygen; clay binds diquat
    let chemDtH = 0;
    function chemM() {
      const h2 = chem === 'h2o2';
      if (dqRoom > 0) for (let q = 0; q < cellCount; q++) {
        if (!(C[q] > 0)) continue;
        const db = S.diquatSorb(C[q], bound[q], dqRoom, pv.dq_ksorb, chemDtH);
        C[q] -= db; bound[q] += db; boundTotal += db * V;
      }
      for (let q = 0; q < cellCount; q++) {
        const c0 = C[q]; if (c0 === 0) continue;
        const cn = c0 * fac[q]; C[q] = cn; decayed += (c0 - cn) * V;
        if (h2) X[q] -= pv.h2o2_o2 * (c0 - cn);
      }
      if (filmLive) for (let i = 0; i < nxs; i++) {
        if (!(Fs[i] > 0)) continue;
        const ix = i * N + nlev[i] - 1, f0 = Fs[i], f1 = f0 * fac[ix];
        Fs[i] = f1; decayed += f0 - f1; if (h2) X[ix] -= pv.h2o2_o2 * (f0 - f1) / V;
      }
    }
    // toxin and oxygen: losses and sources over the time since the last call (exact exponentials)
    let slowDue = 0;
    function slowStep() {
      const dt = slowDue; slowDue = 0; if (!(dt > 0)) return;
      const eKd = Math.exp(-bio.kdDead * dt), lk = 1 - Math.exp(-bio.krel * dt);
      for (let q = 0; q < cellCount; q++) {
        if (YQ[q] > 0) { const a = YQ[q] * lk, b = YC[q] * lk; YQ[q] -= a; YC[q] -= b; Q[q] += a; Cd[q] += b; mcReleased += a * V; }
        const r = rQ[q];
        if (r > 0) { const q0 = Q[q], q1 = q0 * Math.exp(-r * dt); Q[q] = q1; mcBio += (q0 - q1) * V; }
        const c0 = Cd[q];
        if (c0 > 0) { const cn = c0 * eKd; Cd[q] = cn; X[q] += pv.rOC * (c0 - cn); }
        X[q] += metS[q] * dt;                           // the living bloom
      }
      const eR = Math.exp(-rRea * dt);
      for (let i = 0; i < nxs; i++) {
        if (sodR[i] > 0) X[i * N + nlev[i] - 1] += sodR[i] * dt;
        X[i * N] *= eR;
      }
    }
    function tickSlow(dt) { slowDue += dt; if (slowDue >= 600 - 1e-9) slowStep(); }
    // dense film, as on the map, moving to whichever neighbouring column is deeper
    let hrNow = 0;
    function filmStep(dt) {
      dF.fill(0);
      const drTh = lay[hrNow].drho;
      for (let i = 0; i < nxs; i++) {
        const m = Fs[i]; if (!(m > 0)) continue;
        const hf = hfs[i], drho = filmDrho(m / (hf * dxs), injF), gp = GRAV * drho / RHO0;
        const bot = i * N + nlev[i] - 1;
        if (!cfg.layered[i] && gp * hf < pv.film_Ri * ustH * ustH) { C[bot] += m / V; dF[i] -= m; continue; }
        const u = pv.front_Fr * Math.sqrt(Math.max(0, gp * hf));
        const det = m * (1 - Math.exp(-pv.film_E * u * dt / hf));
        C[bot] += det / V; dF[i] -= det;
        let q = -1, hb = sl.hcol[i] + 1e-9;
        if (i > 0 && sl.hcol[i - 1] > hb) { q = i - 1; hb = sl.hcol[i - 1]; }
        if (i < nxs - 1 && sl.hcol[i + 1] > hb) { q = i + 1; hb = sl.hcol[i + 1]; }
        const rest = m - det;
        if (q >= 0 && rest > 0) {
          const mv = rest * Math.min(1, u * dt / dxs);
          dF[i] -= mv;
          if (cfg.layered[q] && !cfg.layered[i] && drho < drTh) { const kk = Math.min(nlev[q] - 1, Math.floor(cfg.Dcol[q] / dz)); C[q * N + kk] += mv / V; }
          else dF[q] += mv;
        }
      }
      for (let i = 0; i < nxs; i++) { const v = Fs[i] + dF[i]; Fs[i] = v > 0 ? v : 0; }
    }
    function step(dt) {
      chemDtH = dt / 3600;
      if (horizOn) horizApply(Q, X, C, dt);
      vertSolve(Q, X, C);
      chemM();
      if (filmLive) filmStep(dt);
    }
    function bedRelease(tS) {
      for (const bb of bed) {
        if (bb.done >= bb.total) continue;
        const fr = tS >= bb.tBed ? 1 : 1 - Math.pow(1 - tS / bb.tBed, 1.5), target = bb.total * fr;
        if (target > bb.done) { addConc(bb.i, bb.k, (target - bb.done) / V); bb.done = target; }
      }
    }
    let bedPending = bed.length > 0;
    function moveParticles(dt, count, tH, doKill) {
      const dtH = dt / 3600, rise = c1.wCells, ust = ustH, Kmin = pv.K_ml_min;
      const Fx = cfg.Fx, kv = 0.15 / (2 * KAPPA * Math.max(1e-12, ust));
      for (let p = 0; p < count; p++) {
        // Sideways speed from the slice's own face fluxes for the colony's level, interpolated across
        // the column (Pollock), with the up-and-down speed from the same streamfunction, so colonies go
        // where the water goes. The level's flux includes the surface skin, so a colony at the very
        // top moves at the top level's mean speed, not the faster speed of the top centimetre (the map
        // keeps that detail; in the slice it would need steps of a couple of seconds). Until Nov 8,
        // 2026 the sideways speed came from each column's own stirred depth while the up-and-down
        // speed came from the corner streamfunction; the two did not keep the water's volume, and
        // colonies that should follow the water piled up 3-4 times too dense at the downwind end (bug
        // H1 in the Nov 8, 2026 code review).
        let i = Math.min(nxs - 1, Math.max(0, Math.floor(ppx[p] / dxs)));
        let x = ppx[p], z = ppz[p], left = dt, guard = 0;
        while (left > 1e-9 && guard++ < 48) {
          const h = nlev[i] * dz, D = cfg.Dcol[i], lay = cfg.layered[i];
          const k = Math.min(nlev[i] - 1, Math.floor(z / dz)), fr = (z - k * dz) / dz, fx = Math.min(1, Math.max(0, x / dxs - i));
          const u = ((1 - fx) * Fx[i * N + k] + fx * Fx[(i + 1) * N + k]) / dz;
          const wt = k > 0 ? cfg.Wt[i * NC + k] : 0, wb = k + 1 < nlev[i] ? cfg.Wt[i * NC + k + 1] : 0;
          const w = (wt * (1 - fr) + wb * fr) / dxs;
          // and short compared with the column's own up-and-down mixing time D/(2κu*), as on the map:
          // in a shallow shore column a longer step re-mixes the colony's depth within one step, so it
          // feels the current at a random level each step and drifts to where that random push is
          // weakest (the closed shore end), instead of following the water
          const dtA = u !== 0 ? 0.5 * dxs / Math.abs(u) : Infinity, dtV = ust > 0 ? kv * Math.max(0.05, lay && z >= D ? h - D : D) : Infinity;
          const dtL = Math.min(dtA, dtV), dts = left <= dtL * 1.0001 || guard === 48 ? left : Math.max(dt / 48, dtL);
          left -= dts;
          // the thermocline is a wall for mixing, as on the map (see there)
          z = vertMove(z, D, h, lay, w + rise, KAPPA * ust, Kmin, Kthermo, dts, rngP);
          let xn = x + u * dts + rngP.g() * Math.sqrt(2 * Kh * dts);
          if (xn < 0) xn = -xn; if (xn > sl.L) xn = 2 * sl.L - xn; if (xn < 0) xn = 0; else if (xn > sl.L - 1e-6) xn = sl.L - 1e-6;
          const i2 = Math.min(nxs - 1, Math.floor(xn / dxs));
          if (z <= nlev[i2] * dz) { x = xn; i = i2; }
        }
        ppx[p] = x;
        ppz[p] = z;
        if (doKill) {
          killStep(ks, p, expo(i, z), dtH, kill, tH);
          if (ks.dead[p] && !gone[p]) { gone[p] = 1; const ix = i * N + Math.min(nlev[i] - 1, Math.floor(z / dz)); YQ[ix] += bio.mcPer / V; YC[ix] += bio.carbPer / V; }
        }
      }
    }
    let tS = 0, upwellH = null;
    hourSetup(0, 60, true); record(0);
    const HOURS = Math.min(RUN_H, opts.hours || RUN_H);
    for (let hr = 0; hr < HOURS; hr++) {
      hrNow = hr;
      cfg = getCfg(hr);
      ustH = windOf(c1, hr).ust;
      const dtp = particleStep(cfg.hmix, ustH);
      const nps = Math.round(3600 / dtp);
      const pcount = () => killActive ? np : show;
      if (transportOn) {
        const nsub = Math.max(1, Math.ceil(dtp / cfg.dtMax)), dte = dtp / nsub;
        hourSetup(hr, dte, true);
        for (let s = 0; s < nps; s++) {
          for (let q = 0; q < nsub; q++) { step(dte); tickSlow(dte); tS += dte; if (bedPending) bedRelease(tS); }
          moveParticles(dtp, pcount(), tS / 3600, killActive);
        }
      } else {
        const nE = Math.max(1, Math.ceil(3600 / Math.min(600, cfg.dtMax))), dtE = 3600 / nE;
        hourSetup(hr, dtE, false);
        let s = 0;
        for (let e = 0; e < nE; e++) {
          horizApply(Q, X, null, dtE); vertSolve(Q, X, null); tickSlow(dtE);
          for (const sEnd = Math.round((e + 1) * nps / nE); s < sEnd; s++) { tS += dtp; moveParticles(dtp, pcount(), tS / 3600, killActive); }
        }
      }
      slowStep();
      record(hr + 1);
      if (upwellH === null && upwell[hr + 1] > 0) upwellH = hr + 1;
      if (opts.onProgress && (hr + 1) % 12 === 0) opts.onProgress('slice', (hr + 1) / HOURS);
      if (bedPending) { bedPending = false; for (const bb of bed) if (bb.done < bb.total) { bedPending = true; break; } }
      if (filmLive && filmMass[hr + 1] < 1e-3 * filmIn) {
        for (let i = 0; i < nxs; i++) if (Fs[i] > 0) { C[i * N + nlev[i] - 1] += Fs[i] / V; Fs[i] = 0; }
        filmLive = false; filmEndH = hr + 1;
      }
      if (transportOn && !bedPending && !filmLive && CmaxA[hr + 1] < 1e-3 * ref) {
        transportOn = false; transportEndH = hr + 1;
        for (let q = 0; q < cellCount; q++) { dropped += C[q] * V; C[q] = 0; }
      }
      if (killActive && killCanStop(ks, np, kill, transportOn ? CmaxA[hr + 1] : 0, bedPending || filmLive)) { killActive = false; killEndH = hr + 1; }
    }
    let bedLeft = 0; for (const bb of bed) bedLeft += bb.total - bb.done;
    let inWater = 0; for (let q = 0; q < cellCount; q++) inWater += C[q] * V; for (let i = 0; i < nxs; i++) inWater += Fs[i];
    let Qnow = 0, inside = 0; for (let q = 0; q < cellCount; q++) { Qnow += Q[q] * V; inside += YQ[q] * V; }
    return {
      L: sl.L, nxs, dxs, N, dz, nlev, hcol: Float32Array.from(sl.hcol), treated, start: sl.start, end: sl.end,
      show, np, cQ, mcQ, doQ, cfgOfHour, qx, qz, qdead, K, Cexp, massW, CbotMax, Cmax: CmaxA,
      MCml, MCtopMax, DOml, DOmin, filmMass, upwell,
      configs: list,
      budget: { released, boundTotal, demandTotal, decayed, dropped, bedLeft, inWater },
      toxin: { start: Q0, released: mcReleased, degraded: mcBio, inWater: Qnow, stillInside: inside },
      film: { used: filmIn > 0, filmIn, endH: filmEndH, stirredAtOnce: filmIn > 0 && filmMass[1] < 0.05 * filmIn },
      tilt: { upwellH, upwellDT: upwellH !== null ? lay[upwellH].dT : null, slope0: lay[0].slope },
      killEndH, transportEndH, ref
    };
  }

  // ---------------------------------------------------------------- one call for the page
  function centralParams(inp) {
    const pv = Object.assign(S.centralFrom(CC.ALL_PARAMS), S.centralFrom(PARAMS3));
    return S.withMeasured(inp, pv);
  }
  function run2d(inp, opts) {
    opts = opts || {};
    const t0 = Date.now();
    const pv = centralParams(inp);
    if (opts.pv) Object.assign(pv, opts.pv);
    const c1 = CC.simulate(inp, pv, { snapshots: true });
    const g = buildGrid(inp, pv);
    const mask = treatMask(g, inp.where, inp.windFrom, inp.mask);
    let nTreated = 0; for (let k = 0; k < g.nw; k++) nTreated += mask[k];
    const want = opts.only || 'both';
    const map = want === 'slice' ? null : runMap(inp, pv, c1, g, mask, opts);
    const slice = want === 'map' ? null : runSlice(inp, pv, c1, g, mask, opts);
    return {
      version: VERSION, inputs: inp, ms: Date.now() - t0,
      grid: { nx: g.nx, ny: g.ny, dx: g.dx, x0: g.x0, y0: g.y0, nw: g.nw, ci: g.ci, cj: g.cj, h: Float32Array.from(g.h), P: g.P, zmax: g.zmax, area: g.area, deepest: g.deepest, cx: g.cx, cy: g.cy, shape: g.shape, crossing: g.crossing, areaFix: g.areaFix },
      mask, treatedShare: nTreated / g.nw, wind: windVec(inp.windFrom), windFrom: inp.windFrom || 0,
      column: { K: Float64Array.from(c1.rec.K), Cexp: Float64Array.from(c1.rec.Cexp), hmix: Float64Array.from(c1.rec.hmix), clock: Float64Array.from(c1.rec.clock), Ttop: Float64Array.from(c1.rec.Ttop), Tbot: Float64Array.from(c1.rec.Tbot), MCtop: Float64Array.from(c1.rec.MCtop), DOml: Float64Array.from(c1.rec.DOml), Uopen: Float64Array.from(c1.rec.Uopen), windFrom: Float64Array.from(c1.rec.windFrom), Tair: Float64Array.from(c1.rec.Tair), realWeather: !!c1.realWeather, U: c1.U, ustar: c1.ustar, kill: !!c1.kill, ecV: c1.ec && !c1.ec.none ? c1.ec.v : null, doseMgL: c1.doseMgL, wCells: c1.wCells },
      map, slice
    };
  }

  const api = {
    VERSION, PARAMS3, SRC3, SHAPES, WHERE, NA,
    run2d, runMap, runSlice, buildGrid, treatMask, windVec, flowConfig, solveGyre, sliceConfig, buildSlice,
    shapeOutline, polyArea, inPoly, selfCrossing, cellAt, cellCenter, quant, unquant, quantMC, unquantMC, quantDO, kProfile, kSlope, centralParams, sublayerShares,
    makeKillState, killStep, killCanStop, rngPair, particleStep, vertMove, fold, layering, tiltSeries, windOf, lengthAlongFn, skinSetup, skinT, skinC, injectProps, filmDrho, sodRate
  };
  if (isNode) module.exports = api;
  else root.CyanoMap = api;
})(typeof self !== 'undefined' ? self : this);

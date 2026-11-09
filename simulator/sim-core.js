/*
 * CyanoSelect pond-treatment simulator, Phase 1 (well-mixed treated layer)
 * --------------------------------------------------------------------------
 * One dependency-free file that runs in the browser (window.CyanoSim) and in
 * Node (require('./sim-core.js')). The Python reference in reference/sim.py
 * implements the same equations from params.json, which is exported from the
 * PARAMS table below, so there is one source of truth for every number.
 *
 * Every parameter carries a status:
 *   SOURCED  - value read in the cited source
 *   DERIVED  - computed from sourced numbers with standard physics/arithmetic
 *   ESTIMATE - physically based placeholder with a range; shown to users as an assumption
 *
 * Everything this file outputs is a MODEL PREDICTION, not a measurement and
 * not a treatment recommendation. The product label always governs use.
 *
 * Phase 1 scope (see the blueprint): the treated part of the pond is one
 * well-mixed layer. No horizontal spreading, no sinking granules, no vertical
 * column model yet (Phases 2-3).
 */
(function (root) {
  'use strict';

  const VERSION = '0.1.0-phase1';
  const PARAMS_VERSION = '2026-10-19';
  const DT_H = 0.05;            // time step, hours (3 minutes)
  const RUN_DAYS = 14;          // simulated period
  const REC_EVERY = 20;         // record every 20 steps = hourly
  const LN2 = Math.log(2);

  // ---------------------------------------------------------------- sources
  const SRC = {
    weenink2022: { label: 'Weenink et al. 2022, Water Research', url: 'https://doi.org/10.1016/j.watres.2022.119169' },
    behrenfeld1997: { label: 'Behrenfeld & Falkowski 1997, Limnology and Oceanography 42 (light-saturated photosynthesis per unit chlorophyll; median 4.5 mg C per mg chlorophyll per hour)', url: 'https://frouingroup.ucsd.edu/Most_recent_figs/Refs/Beherenfeld-LO-1997a.pdf' },
    eppley1972: { label: 'Eppley 1972, Fishery Bulletin 70 (phytoplankton rates rise about 1.07× per °C)', url: '' },
    weenink2015: { label: 'Weenink et al. 2015, Frontiers in Microbiology', url: 'https://doi.org/10.3389/fmicb.2015.00714' },
    marsico2015: { label: 'Marsico et al. 2015, Aquatic Sciences', url: 'https://doi.org/10.1007/s00027-015-0399-2' },
    pedersen2019: { label: 'Pedersen et al. 2019 (H2O2 decomposition, aquaculture water)', url: 'http://hdl.handle.net/11250/2629609' },
    drabkova2007: { label: 'Drábková et al. 2007, Photosynthetica', url: 'https://ps.ueb.cas.cz/pdfs/phs/2007/03/07.pdf' },
    piel2020: { label: 'Piel et al. 2020, Toxins', url: 'https://www.mdpi.com/2072-6651/12/1/18' },
    solvay: { label: 'Solvay sodium percarbonate data sheet (stoichiometry DERIVED)', url: 'https://www.solvay.com/sites/g/files/srpend221/files/tridion/documents/PDS-Oxyper_SCM_201301.pdf' },
    marple2001: { label: 'Marple et al. 2001, SEAFWA proceedings (copper in ponds)', url: 'https://seafwa.org/sites/default/files/journal-articles/Marple-235-242.pdf' },
    boyd2005: { label: 'Boyd 2005, Global Seafood Alliance (copper treatments)', url: 'https://www.globalseafood.org/advocate/copper-treatments-control-phytoplankton/' },
    calomeni2017: { label: 'Calomeni et al. 2017, Water Air Soil Pollution', url: 'https://doi.org/10.1007/s11270-017-3634-8' },
    calomeni2014: { label: 'Calomeni et al. 2014, Water Air Soil Pollution', url: 'https://doi.org/10.1007/s11270-014-2231-3' },
    tsai2016: { label: 'Tsai 2016, Water Air Soil Pollution', url: 'https://doi.org/10.1007/s11270-016-2926-8' },
    kinley2017: { label: 'Kinley et al. 2017, Ecotoxicology and Environmental Safety 145:591-596', url: 'https://doi.org/10.1016/j.ecoenv.2017.08.010' },
    ecotox: { label: 'US EPA ECOTOX Knowledgebase (accessed 2026-06-11)', url: 'https://cfpub.epa.gov/ecotox/' },
    poovey2002: { label: 'Poovey & Getsinger 2002, J. Aquatic Plant Management', url: 'https://apms.org/wp-content/uploads/japm-40-01-006.pdf' },
    wilsonwu2012: { label: 'Wilson & Wu 2012, UF/IFAS EDIS (diquat)', url: 'https://journals.flvc.org/edis/article/download/120226/118459/178736' },
    peterson1997: { label: 'Peterson et al. 1997, Aquatic Toxicology', url: 'https://doi.org/10.1016/S0166-445X(97)00022-2' },
    islam2018: { label: 'Islam et al. 2018, IJERPH (endothall)', url: 'https://doi.org/10.3390/ijerph15102255' },
    epa2015endothall: { label: 'US EPA 2015, Endothall Problem Formulation (EPA-HQ-OPP-2015-0591-0011)', url: 'https://www.regulations.gov/document/EPA-HQ-OPP-2015-0591-0011' },
    jmpr2015: { label: 'FAO/WHO JMPR 2015, Flumioxazin evaluation', url: 'https://fao.org/fileadmin/templates/agphome/documents/Pests_Pesticides/JMPR/Evaluation2015/FLUMIOXAZIN__284_.pdf' },
    epa2003flum: { label: 'US EPA EFED 2003, Flumioxazin risk assessment (PC 129034)', url: 'https://www.epa.gov/pesticides' },
    barrick2026: { label: 'Barrick et al. 2026, Environ. Toxicol. Chem. 45(6):1681 (abstract)', url: 'https://doi.org/10.1093/etojnl/vgag090' },
    marpleph: { label: 'Marple et al. 2001 (daily pH swing in ponds)', url: 'https://seafwa.org/sites/default/files/journal-articles/Marple-235-242.pdf' },
    sandrini2016: { label: 'Sandrini et al. 2016, Frontiers in Microbiology', url: 'https://doi.org/10.3389/fmicb.2016.00551' },
    holgerson2022: { label: 'Holgerson et al. 2022 (34-pond mixing study)', url: 'https://par.nsf.gov/servlets/purl/10389640' },
    seekell2021: { label: 'Seekell et al. 2021, GRL (mean:max depth)', url: 'https://nora.nerc.ac.uk/id/eprint/532159/' },
    who2020: { label: 'WHO 2020, Microcystins background document', url: 'https://cdn.who.int/media/docs/default-source/wash-documents/wash-chemicals/microcystins-background-201223.pdf' },
    epa2019rec: { label: 'US EPA 2019 recreational criteria fact sheet', url: 'https://19january2021snapshot.epa.gov/sites/static/files/2019-05/documents/hh-rec-criteria-habs-factsheet-2019.pdf' },
    farrer2015: { label: 'Farrer et al. 2015, Toxins (Oregon dog values)', url: 'https://www.mdpi.com/2072-6651/7/2/457/html' },
    christoffersen2002: { label: 'Christoffersen et al. 2002, Aquatic Microbial Ecology', url: 'https://int-res.com/abstracts/ame/v27/n2/p125-136' },
    greenstein2020: { label: 'Greenstein et al. 2020, Toxins', url: 'https://www.mdpi.com/2072-6651/12/5/335' },
    kinley2018: { label: 'Kinley et al. 2018, Water Air Soil Pollution', url: 'https://agris.fao.org/search/en/records/65e012867c7033e84bf0102e' },
    iwinski2017: { label: 'Iwinski et al. 2017 (copper and MC biodegradation)', url: 'https://agris.fao.org/search/en/records/65e002ca4c5aef494fe78e93' },
    welker2000: { label: 'Welker & Steinberg 2000 (MC photolysis)', url: 'https://hero.epa.gov/hero/index.cfm/reference/details/reference_id/7441480' },
    welgamage2012: { label: 'Welgamage Don 2012 thesis (lag phase review)', url: 'https://rgu-repository.worktribe.com/OutputFile/295544' },
    spoof2020: { label: 'Spoof et al. 2020, Toxins', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7048868' },
    geider1987: { label: 'Geider 1987, New Phytologist (carbon:chlorophyll)', url: 'https://2021-phyto-phys.readthedocs.io/en/latest/_static/geider1987.pdf' },
    redfield: { label: 'Redfield stoichiometry (SOEST OCN623 handout)', url: 'https://www.soest.hawaii.edu/oceanography/courses/OCN623/Spring2017/09_AerobicProdConsumpt2017_Handout.pdf' },
    colecaraco1998: { label: 'Cole & Caraco 1998, as implemented in LakeMetabolizer k.cole', url: 'https://rdrr.io/cran/LakeMetabolizer/man/k.read.base.html' },
    hammermeister1982: { label: 'Hammermeister 1982 (sediment oxygen demand)', url: 'https://minds.wisc.edu/items/707e9b09-c796-4190-802f-5e8ebc2493a4' },
    perner2025: { label: 'Perner et al. 2025, USGS (sediment oxygen demand)', url: 'https://pubs.usgs.gov/publication/70273247' },
    weiss1970: { label: 'Weiss 1970 O2 solubility, as written in the TUFLOW FV WQ manual (Eq. D.5)', url: 'https://docs.tuflow.com/fv/wqm/manual/2025.2/AtmosphericAeration-3.html' },
    wanninkhof2014: { label: 'Wanninkhof 2014, L&O Methods, freshwater O2 Schmidt number fit (coefficients not re-checked against the paper in this build)', url: 'https://doi.org/10.4319/lom.2014.12.351' },
    cfr131_38: { label: '40 CFR 131.38(b)(2), Table 1: freshwater copper criterion rises with hardness as exp(0.9422 ln(hardness) - 1.700)', url: 'https://www.customsmobile.com/regulations/title40_chapterI-i26_part131_subpartD_section131.38' },
    francisfloyd: { label: 'Francis-Floyd, Dissolved oxygen for fish production (FA27)', url: 'https://fisheries.tamu.edu/files/2013/09/Dissolved-Oxygen-for-Fish-Production1.pdf' },
    blueprint: { label: 'CyanoSelect simulator blueprint (Oct 2026), derived from the sources it cites', url: '' }
  };

  // ------------------------------------------------------------- parameters
  // v = central value; lo/hi = range sampled in the uncertainty runs (if sample = true)
  // dist: 'uniform' | 'log' (log-uniform) | 'normal' (v = mean, sd in lo field is not used; see ec50)
  const PARAMS = {
    // geometry and mixing
    r_meanmax:   { v: 0.40, lo: 0.30, hi: 0.50, dist: 'uniform', sample: true, units: 'mean depth ÷ max depth', status: 'ESTIMATE', src: 'seekell2021', note: 'Measured lake ratios average about 0.41 across the whole Seekell et al. 2021 dataset; dug ponds run steeper. (Until Nov 8, 2026 this note also gave 0.34 "global", which is not in that paper.)' },
    h_mix:       { v: 1.0, lo: 0.5, hi: 1.5, dist: 'uniform', sample: true, units: 'm', status: 'ESTIMATE', src: 'holgerson2022', note: 'Depth of the warm top layer on a calm warm afternoon or in a summer-layered pond. No NC measurements found.' },
    strat_depth: { v: 2.0, units: 'm', status: 'SOURCED', src: 'holgerson2022', note: 'Ponds under 4.17 ha and deeper than 2 m were "rarely mixed" in summer.' },
    strat_area:  { v: 4.17, units: 'ha', status: 'SOURCED', src: 'holgerson2022' },

    // hydrogen peroxide
    h2o2_dinst:  { v: 0.4, lo: 0.1, hi: 1.2, dist: 'uniform', sample: true, units: 'mg/L', status: 'SOURCED range, ESTIMATE centre', src: 'weenink2015', note: 'Instant demand "typically 0.1 up to 1.2 mg/L"; the upper end fits scums.' },
    h2o2_kab:    { v: 0.01, lo: 0.002, hi: 0.04, dist: 'log', sample: true, units: '1/h', status: 'SOURCED range', src: 'marsico2015', note: 'Background loss with little biomass.' },
    h2o2_b:      { v: 0.002, lo: 0.001, hi: 0.004, dist: 'uniform', sample: true, units: 'L/(µg chlorophyll·h)', status: 'ESTIMATE', src: 'blueprint', note: 'No published slope of decay rate against chlorophyll was found. First number to measure.' },
    h2o2_theta:  { v: 1.078, units: 'per °C', status: 'SOURCED', src: 'pedersen2019', note: 'Measured in aquaculture water.' },
    h2o2_o2:     { v: 0.47, units: 'g O2 per g H2O2', status: 'DERIVED', src: 'blueprint', note: '2 H2O2 → 2 H2O + O2.' },
    perc_alk:    { v: 1.96, units: 'mg/L CaCO3 per mg/L H2O2', status: 'DERIVED', src: 'solvay', note: 'Na2CO3·1.5H2O2 stoichiometry.' },
    perc_dic:    { v: 0.0196, units: 'mmol/L DIC per mg/L H2O2', status: 'DERIVED', src: 'solvay' },

    // carbonate chemistry and the daily pH swing
    pK1:         { v: 6.35, units: '', status: 'ESTIMATE', src: 'blueprint', note: '25 °C. Standard value, citation pending. (Labelled SOURCED until Nov 8, 2026, but cited only to the project notes.)' },
    pK2:         { v: 10.33, units: '', status: 'ESTIMATE', src: 'blueprint', note: '25 °C. Standard value, citation pending. (Labelled SOURCED until Nov 8, 2026, but cited only to the project notes.)' },
    ph_amp_low:  { v: 0.3, lo: 0.2, hi: 0.4, dist: 'uniform', sample: true, units: 'pH units', status: 'ESTIMATE', src: 'blueprint', note: 'Afternoon rise above morning pH with little bloom (under 10 µg/L chlorophyll).' },
    ph_amp_mod:  { v: 0.75, lo: 0.5, hi: 1.0, dist: 'uniform', sample: true, units: 'pH units', status: 'ESTIMATE', src: 'marpleph', note: 'Ponds averaged 0.5-0.9 units higher in the afternoon.' },
    ph_amp_soft: { v: 2.0, lo: 1.5, hi: 2.5, dist: 'uniform', sample: true, units: 'pH units', status: 'ESTIMATE', src: 'sandrini2016', note: 'Dense bloom in soft water (alkalinity under 50).' },
    ph_amp_hard: { v: 1.1, lo: 0.75, hi: 1.5, dist: 'uniform', sample: true, units: 'pH units', status: 'ESTIMATE', src: 'blueprint', note: 'Dense bloom, alkalinity 50 or more (buffered).' },
    ph_cap:      { v: 10.4, units: 'pH', status: 'ESTIMATE', src: 'sandrini2016', note: 'A bloom lake reached 10.3.' },
    sunrise:     { v: 6.5, units: 'hour', status: 'ESTIMATE', src: 'blueprint', note: 'NC summer.' },
    daylength:   { v: 13.5, units: 'h', status: 'ESTIMATE', src: 'blueprint' },

    // copper
    cu_k78:      { v: 0.761, units: '1/day at 26.8 °C, alkalinity 78', status: 'DERIVED', src: 'marple2001', note: 'Free copper fell 53-58% per day at 26.8 °C. The paper prints mg/L; values must be µg/L.' },
    cu_alkslope: { v: 0.0018, units: '1/day per mg/L alkalinity', status: 'DERIVED', src: 'marple2001', note: 'Valid for alkalinity 78-132 mg/L only.' },
    cu_theta:    { v: 1.09, units: 'per °C', status: 'DERIVED', src: 'marple2001' },
    cu_u:        { v: 0.5, lo: 0, hi: 1, dist: 'uniform', sample: true, units: '', status: 'ESTIMATE', src: 'blueprint', note: 'Uncertainty multiplier: 0.85-1.15 inside Marple\'s alkalinity range, 0.5-1.5 outside it.' },
    cu_free7:    { v: 0.028, units: 'mg/L at pH 7', status: 'SOURCED', src: 'boyd2005', note: 'Ceiling on the free copper ion only; falls 100-fold per pH unit.' },
    // copper harm to animals depends on water hardness (added Oct 22, 2026; until then the fish and water-flea
    // values were the same in soft and hard water, though copper is about tenfold more toxic in very soft water)
    cu_hard_slope:{ v: 0.9422, units: 'exponent on hardness', status: 'SOURCED', src: 'cfr131_38', note: 'US EPA hardness slope for acute copper toxicity to freshwater animals. Effect levels for fish and water fleas are scaled by (pond hardness ÷ test hardness) to this power.' },
    cu_test_hard:{ v: 100, units: 'mg/L as CaCO₃', status: 'ESTIMATE', src: 'ecotox', note: 'Hardness of the lab water behind the fish and water-flea copper values. They are geometric means of ECOTOX tests whose hardness the CyanoSelect matrix does not record. If the tests averaged 50 or 250 instead, every copper margin for animals shifts by about 0.5× or 2.4×.' },
    hard_per_alk:{ v: 1.0, units: 'hardness ÷ alkalinity', status: 'ESTIMATE', src: 'blueprint', note: 'Used only when no hardness is entered. Many ponds have hardness close to alkalinity, but not all; a hardness test kit settles it.' },
    cuchel_k:    { v: 0.23, lo: 0.1, hi: 0.7, dist: 'log', sample: true, units: '1/day', status: 'ESTIMATE', src: 'calomeni2017', note: 'Lab sediment binding half-life about 3 days. Field loss was faster, mostly from dilution.' },

    // diquat
    dq_tss:      { v: 1.5, lo: 1.0, hi: 2.0, dist: 'uniform', sample: true, units: 'mg/L solids per NTU', status: 'ESTIMATE', src: 'blueprint', note: 'No standard conversion exists; mineral turbidity under 40 NTU only.' },
    dq_cec_typ:  { v: 0.35, units: 'meq/g', status: 'SOURCED', src: 'poovey2002', note: 'Field sediment, CEC 35 meq/100 g.' },
    dq_cec_swell:{ v: 1.0, units: 'meq/g', status: 'SOURCED', src: 'poovey2002', note: 'Bentonite, CEC 100 meq/100 g.' },
    dq_cec_unk:  { v: 0.5, lo: 0.2, hi: 1.0, dist: 'uniform', sample: true, units: 'meq/g', status: 'ESTIMATE', src: 'poovey2002' },
    dq_mgmeq:    { v: 92.1, units: 'mg diquat per meq', status: 'DERIVED', src: 'blueprint', note: 'Cation weight 184.2 ÷ charge 2.' },
    // clay binding as a rate, wherever the diquat and the clay meet (added Oct 22, 2026; until then
    // the well-mixed model bound up to the full capacity at once, the layers model only in the spray
    // layer and the map per spray cell, so one treatment gave 0%, 14% and 33% knock-down)
    dq_ksorb:    { v: 6, lo: 1, hi: 30, dist: 'log', sample: true, units: '1/h (per unit of free binding room)', status: 'ESTIMATE', src: 'poovey2002', note: 'How fast suspended clay takes up diquat. Poovey & Getsinger 2002 cite a calcium bentonite binding to capacity within about 10 minutes (Faust & Zarins 1969); in their own bentonite tanks diquat was already near its 3-hour level at the first sample, 6 minutes in.' },
    dq_access:   { v: 0.6, lo: 0.3, hi: 1.0, dist: 'uniform', sample: true, units: 'share of the clay\'s exchange capacity', status: 'ESTIMATE', src: 'poovey2002', note: 'Poovey & Getsinger 2002 still measured about 0.35-0.45 mg/L diquat in the water after 3 hours at 15-50 NTU of bentonite, where the full exchange capacity would have bound it all. Their clear-water control tanks lost diquat too, so the data can\'t pin this down closely.' },
    dq_kwc:      { v: 0.5, lo: 0.35, hi: 0.7, dist: 'uniform', sample: true, units: '1/day', status: 'SOURCED range', src: 'wilsonwu2012', note: 'Pond water-column half-lives of 1-2 days.' },

    // endothall
    en_lag:      { v: 7, lo: 5, hi: 11, dist: 'uniform', sample: true, units: 'days', status: 'SOURCED', src: 'islam2018', note: 'Breakdown starts after a 5-11 day lag, and only with sediment microbes.' },
    en_kslow:    { v: 0.015, lo: 0, hi: 0.03, dist: 'uniform', sample: true, units: '1/day', status: 'ESTIMATE', src: 'blueprint' },
    en_kbio:     { v: 0.45, lo: 0.3, hi: 0.6, dist: 'uniform', sample: true, units: '1/day at 20 °C', status: 'DERIVED', src: 'islam2018' },
    en_theta:    { v: 1.07, units: 'per °C', status: 'ESTIMATE', src: 'blueprint', note: 'No measured temperature effect found.' },

    // flumioxazin (25 °C fit to JMPR hydrolysis half-lives)
    fl_k0:       { v: 0.0067, units: '1/h', status: 'DERIVED', src: 'jmpr2015' },
    fl_koh:      { v: 2.24e5, units: '1/h per mol/L OH-', status: 'DERIVED', src: 'jmpr2015', note: 'Reproduces half-lives of about 24 h at pH 7 and 6 min at pH 9.5.' },

    // kill model (GUTS reduced, stochastic death)
    kd:          { v: 0.45, lo: 0.1, hi: 2.0, dist: 'log', sample: true, units: '1/h', status: 'ESTIMATE', src: 'piel2020', note: 'Damage rate. Set from the hours-scale collapse in peroxide studies; no fitted value exists for any pair.' },
    z_frac:      { v: 0.25, lo: 0, hi: 0.5, dist: 'uniform', sample: true, units: '× EC50', status: 'ESTIMATE', src: 'blueprint', note: 'Damage threshold below which nothing happens.' },
    ec50_sd:     { v: 0.3, units: 'log10 units', status: 'ESTIMATE', src: 'blueprint', note: 'Spread between strains and species (0.2-0.4 suggested). Sampled as a log-normal multiplier.' },
    ec50_z:      { v: 0, lo: 0, hi: 1, dist: 'normal01', sample: true, units: 'standard normal draw', status: 'ESTIMATE', src: 'blueprint' },
    hill_b:      { v: 2, units: '', status: 'ESTIMATE', src: 'blueprint', note: 'Used only by the comparison models (no slope was found for any pair).' },
    kill_struct: { v: 0.75, lo: 0, hi: 1, dist: 'uniform', sample: false, units: 'below 0.5 = stochastic death (SD), else individual tolerance (IT)', status: 'ESTIMATE', src: 'weenink2022', note: 'The central run uses IT because it comes closer to the one field check than SD: for the Oosterduinse Meer peroxide treatment, where Microcystis biovolume fell 35.9%, central IT predicts about 15% and SD about 2%. Both likely underpredict short pulses. Every uncertainty run uses IT; SD is shown as its own scenario (until Oct 21, 2026 half the runs used SD).' },
    lab_k:       { v: 0.46, lo: 0.1, hi: 2.0, dist: 'log', sample: true, units: '1/h', status: 'ESTIMATE', src: 'weenink2015', note: 'How fast peroxide faded in the lab tests behind the peroxide EC50s (Weenink 2022 dosed once and measured only at the start). Centre: the apparent rate Weenink 2015 saw for 2.5 mg/L in diluted lake water (down to 0.4 mg/L in 4 h). Dense cultures could be faster.' },
    it_beta:     { v: 2, lo: 1, hi: 4, dist: 'uniform', sample: true, units: '', status: 'ESTIMATE', src: 'blueprint', note: 'Spread of tolerance between cells (IT model).' },

    // microcystin
    mc_low:      { v: 0.05, units: 'µg MC per µg chlorophyll', status: 'ESTIMATE', src: 'blueprint' },
    mc_typ:      { v: 0.4, units: 'µg MC per µg chlorophyll', status: 'ESTIMATE', src: 'blueprint', note: '20 µg/L toxin ÷ 50 µg/L chlorophyll, the pairing in the WHO (2003) recreational guidance categories. Standard value, citation pending: WHO 2003 could not be opened to check it, and WHO 2020 (cited until Nov 8, 2026) is not where the pairing comes from.' },
    mc_worst:    { v: 1.0, units: 'µg MC per µg chlorophyll', status: 'SOURCED', src: 'who2020', note: 'WHO worst-case conversion.' },
    mc_fext:     { v: 0.05, lo: 0.01, hi: 0.10, dist: 'uniform', sample: true, units: 'fraction', status: 'SOURCED range', src: 'who2020', note: 'Dissolved MC is "typically" under 10% of the total.' },
    mc_krel:     { v: 1.0, lo: 0.5, hi: 1.5, dist: 'uniform', sample: true, units: '1/day', status: 'ESTIMATE', src: 'greenstein2020', note: 'Rate damaged cells leak toxin and become dead biomass.' },
    mc_lag:      { v: 3, lo: 0, hi: 7, dist: 'uniform', sample: true, units: 'days', status: 'SOURCED range', src: 'welgamage2012', note: 'Bacteria need about 3 days to start; no lag in ponds with a bloom history.' },
    mc_kbio:     { v: 0.46, lo: 0.155, hi: 1.0, dist: 'log', sample: true, units: '1/day', status: 'SOURCED upper end, ESTIMATE rest', src: 'christoffersen2002', note: 'Christoffersen et al. 2002 measured 0.485-1.057 per day (half-lives around 1 day), with no lag. The slower end used here (0.155 per day, a 4.5-day half-life) and the centre are not from that paper. (Relabelled from SOURCED range on Nov 8, 2026.)' },
    mc_cu_slow:  { v: 0.1, units: 'multiplier when dissolved Cu > 1 mg/L', status: 'SOURCED', src: 'iwinski2017', note: '5 mg Cu/L cut biodegradation about tenfold; 1 mg/L or less had no significant effect. The study tested 1 and 5 mg/L only, so switching at 1 mg/L is an extrapolation.' },
    mc_photo:    { v: 105, lo: 90, hi: 120, dist: 'uniform', sample: true, units: 'days of half-life per metre depth', status: 'SOURCED', src: 'welker2000' },

    // dissolved oxygen
    thetaC:      { v: 30, lo: 20, hi: 60, dist: 'uniform', sample: true, units: 'g C per g chlorophyll', status: 'ESTIMATE', src: 'geider1987' },
    kd20:        { v: 0.2, lo: 0.1, hi: 0.5, dist: 'log', sample: true, units: '1/day at 20 °C', status: 'ESTIMATE', src: 'blueprint', note: 'Decay of dead bloom biomass; not verified for cyanobacteria.' },
    kd_theta:    { v: 1.047, units: 'per °C', status: 'ESTIMATE', src: 'blueprint', note: 'Conventional BOD value, not verified.' },
    rOC:         { v: 2.67, lo: 2.67, hi: 3.47, dist: 'uniform', sample: true, units: 'g O2 per g C', status: 'SOURCED', src: 'redfield', note: '2.67 for carbon only, 3.47 with full nitrification.' },
    sod20:       { v: 1.0, lo: 0.5, hi: 1.8, dist: 'uniform', sample: true, units: 'g O2/m²/day at 20 °C', status: 'SOURCED centre, ESTIMATE range', src: 'hammermeister1982', note: 'Summer means corrected to 20 °C were 1.01 and 1.11. The 1.8 upper end is the highest single reading at the water\'s own temperature, and 0.5 is not from the paper. (Relabelled from SOURCED range on Nov 8, 2026.)' },
    sod_theta:   { v: 1.065, units: 'per °C', status: 'ESTIMATE', src: 'blueprint' },
    k600_a:      { v: 2.07, units: 'cm/h', status: 'SOURCED', src: 'colecaraco1998' },
    k600_b:      { v: 0.215, units: 'cm/h', status: 'SOURCED', src: 'colecaraco1998' },
    k600_c:      { v: 1.7, units: 'exponent on wind (m/s)', status: 'SOURCED', src: 'colecaraco1998' },
    // the living bloom's own oxygen: photosynthesis by day, breathing day and night (added Oct 21, 2026;
    // before, oxygen had no daily cycle and the page added a flat '1-2 mg/L lower before dawn')
    pmax_chl:    { v: 4.5, lo: 2, hi: 9, dist: 'log', sample: true, units: 'mg C per mg chlorophyll per hour at 25 °C, in bright light', status: 'ESTIMATE', src: 'behrenfeld1997', note: 'Median of a large ocean dataset; not measured for pond cyanobacteria.' },
    met_theta:   { v: 1.066, units: 'per °C', status: 'SOURCED', src: 'eppley1972', note: 'Photosynthesis and breathing scaled from 25 °C.' },
    ik_sw:       { v: 75, lo: 35, hi: 150, dist: 'log', sample: true, units: 'W/m² of sunlight', status: 'ESTIMATE', src: 'blueprint', note: 'Light at which photosynthesis is half its maximum (about 150 µmol photons/m²/s of PAR).' },
    resp_frac:   { v: 0.1, lo: 0.05, hi: 0.2, dist: 'uniform', sample: true, units: '× the maximum photosynthesis rate', status: 'ESTIMATE', src: 'blueprint', note: 'Breathing of the living bloom, day and night.' },
    ro_live:     { v: 0.5, lo: 0, hi: 1, dist: 'uniform', sample: true, units: 'share', status: 'ESTIMATE', src: 'blueprint', note: 'How much of the pond\'s other breathing (bacteria, animals) falls when the bloom is knocked down: 0 = keeps going as before, 1 = falls with the live bloom. Its food is partly the bloom\'s daily output, partly older organic matter.' },
    pq:          { v: 1.2, lo: 1.0, hi: 1.4, dist: 'uniform', sample: true, units: 'mol O₂ per mol C fixed', status: 'ESTIMATE', src: 'blueprint', note: 'Photosynthetic quotient; breathing uses 1.' }
  };

  const THRESHOLDS = {
    mc: [
      { v: 0.2, label: 'Dog caution (Oregon)', src: 'farrer2015' },
      { v: 1, label: 'WHO lifetime drinking water', src: 'who2020' },
      { v: 8, label: 'EPA swimming advisory', src: 'epa2019rec' },
      { v: 24, label: 'WHO recreational', src: 'who2020' }
    ],
    dO: [
      { v: 2, label: 'Fish deaths likely below', src: 'francisfloyd' },
      { v: 4, label: 'Fish stress below', src: 'francisfloyd' }
    ]
  };

  // ------------------------------------------------------------- products
  const PRODUCTS = {
    h2o2_liquid:   { name: 'Hydrogen peroxide (liquid)', chem: 'h2o2', unit: 'mg/L H₂O₂', inputUnit: 'mg/L', toMgL: 1, example: 3, granular: false },
    h2o2_granular: { name: 'Hydrogen peroxide granules (sodium carbonate peroxyhydrate)', chem: 'h2o2', unit: 'mg/L H₂O₂', inputUnit: 'mg/L as H₂O₂', toMgL: 1, example: 3, granular: true },
    copper_sulfate:{ name: 'Copper sulfate', chem: 'cu_sulfate', unit: 'mg/L Cu', inputUnit: 'mg/L as Cu', toMgL: 1, example: 0.5 },
    copper_chelated:{ name: 'Chelated copper (copper ethanolamine)', chem: 'cu_chelated', unit: 'mg/L Cu', inputUnit: 'mg/L as Cu', toMgL: 1, example: 0.5 },
    diquat:        { name: 'Diquat', chem: 'diquat', unit: 'mg/L', inputUnit: 'mg/L', toMgL: 1, example: 0.2 },
    endothall:     { name: 'Endothall (dipotassium salt)', chem: 'endothall', unit: 'mg ae/L', inputUnit: 'mg/L acid equivalent', toMgL: 1, example: 1.5 },
    flumioxazin:   { name: 'Flumioxazin', chem: 'flumioxazin', unit: 'mg/L', inputUnit: 'µg/L', toMgL: 0.001, example: 200 }
  };

  const TARGETS = {
    microcystis: { name: 'Microcystis' },
    planktothrix: { name: 'Planktothrix' },
    anabaena: { name: 'Anabaena / Dolichospermum' }
  };

  // Target EC50s from the verified CyanoSelect matrix. T = test length (h).
  // kind 'stress' = photosynthesis or growth shut down, not confirmed death.
  const TARGET_EC50 = {
    h2o2: {
      microcystis: { v: 2.62, T: 24, pulse: true, endpoint: 'photosynthetic yield (Fv/Fm), one dose left to fade', src: 'weenink2022' },
      planktothrix: { v: 1.39, T: 24, pulse: true, endpoint: 'photosynthetic yield (Fv/Fm), one dose left to fade', src: 'weenink2022' },
      anabaena: { v: 3.49, T: 24, pulse: true, endpoint: 'photosynthetic yield (Fv/Fm), one dose left to fade', src: 'weenink2022' }
    },
    cu_sulfate: {
      microcystis: { v: 0.063, T: 96, endpoint: 'growth inhibition, 5×10⁵ cells/mL', src: 'tsai2016' },
      planktothrix: { v: 0.18, T: 96, endpoint: 'growth inhibition', src: 'calomeni2014' },
      anabaena: { none: true, reason: 'Copper inhibits Dolichospermum (Barrick et al. 2026 abstract), but the number is behind a paywall.' }
    },
    cu_chelated: {
      microcystis: { v: 0.101, T: 96, endpoint: 'growth inhibition', src: 'tsai2016' },
      planktothrix: { v: 0.10, T: 96, endpoint: 'growth inhibition', src: 'calomeni2014' },
      anabaena: { none: true, reason: 'No published Anabaena/Dolichospermum value found for chelated copper.' }
    },
    diquat: {
      microcystis: { v: 0.101, T: 22, endpoint: 'carbon-14 uptake (photosynthesis)', src: 'peterson1997' },
      planktothrix: { none: true, reason: 'No published Planktothrix value found for diquat.' },
      anabaena: { v: 0.005, T: 22, endpoint: 'carbon-14 uptake (photosynthesis); Anabaena inaequalis, a different species in the genus', src: 'peterson1997' }
    },
    endothall: {
      microcystis: { none: true, reason: 'Endothall was not among the effective Microcystis inhibitors in Barrick et al. 2026 (abstract).' },
      planktothrix: { none: true, reason: 'No published Planktothrix value found for endothall.' },
      anabaena: { v: 1.56, T: 120, endpoint: 'growth rate, Anabaena flos-aquae, dipotassium salt (mg ae/L)', src: 'epa2015endothall' }
    },
    flumioxazin: {
      microcystis: { none: true, reason: 'Flumioxazin was not among the effective Microcystis inhibitors in Barrick et al. 2026 (abstract).' },
      planktothrix: { none: true, reason: 'No published Planktothrix value found for flumioxazin.' },
      anabaena: { v: 0.00083, T: 96, Tassumed: true, endpoint: 'growth; species label and test length not yet verified (96 h assumed)', src: 'epa2003flum' }
    }
  };

  // Non-target effect levels (mg/L in the product's unit). T = test length (h); null = not stated.
  const NONTARGET = {
    h2o2: [
      { who: 'Green alga (Kirchneriella contorta)', v: 27.7, T: 24, pulse: true, endpoint: 'photosynthetic yield, one dose left to fade', src: 'weenink2022' },
      { who: 'Green alga (Raphidocelis subcapitata)', v: 6.22, T: 3, endpoint: 'photosynthetic yield, 3-h test', src: 'drabkova2007' },
      { who: 'Water flea (Daphnia magna)', v: 6.51, T: 24, pulse: true, endpoint: 'death (LC50), one dose left to fade', src: 'weenink2022' },
      { who: 'Water flea (Ceriodaphnia dubia)', v: 2.20, T: 24, pulse: true, endpoint: 'death (LC50), one dose left to fade', src: 'weenink2022' },
      { who: 'Fish', none: true, reason: 'No fish value in the CyanoSelect matrix yet.' }
    ],
    cu_sulfate: [
      // Tsai 2016 tested three densities: 0.192, 1.873 and 4.619 mg/L at 5×10⁴, 5×10⁵ and 5×10⁶ cells/mL. The copper
      // target value (0.063, Microcystis) is the 5×10⁵ one, so the green alga is taken at the same density (1.873), as in
      // the CyanoSelect matrix of record (Nov 1, 2026). Copper's density effect comes from cells binding copper in the
      // test water, and in a bloom pond that binding is done by all the cells, mostly the cyanobacteria. (Oct 21 to
      // Nov 8, 2026 the sparse 0.192 was used, a mismatched pairing like the one corrected for diquat on Sept 24.)
      { who: 'Green alga (Raphidocelis subcapitata)', v: 1.873, T: 96, endpoint: 'growth, at 5×10⁵ cells/mL, the same density as the copper target value', src: 'tsai2016', byTarget: { planktothrix: { v: 3.0, src: 'calomeni2014' } } },
      { who: 'Water flea (Daphnia magna)', v: 0.216, T: 48, hard: true, endpoint: 'immobilization', src: 'ecotox' },
      { who: 'Fish', v: 0.317, T: 96, hard: true, endpoint: 'death (LC50)', src: 'ecotox' }
    ],
    cu_chelated: [
      { who: 'Green alga (Raphidocelis subcapitata)', v: 2.579, T: 96, endpoint: 'growth, tested only at a dense 10⁶ cells/mL; sparse green algae are likely far more sensitive (about 10× for copper sulfate)', src: 'tsai2016', byTarget: { planktothrix: { v: 1.18, src: 'calomeni2014' } } },
      { who: 'Water flea (Daphnia magna)', none: true, reason: 'No value in the CyanoSelect matrix yet.' },
      { who: 'Fish', none: true, reason: 'No value in the CyanoSelect matrix yet.' }
    ],
    diquat: [
      { who: 'Green alga (Raphidocelis subcapitata)', v: 0.492, T: 22, endpoint: 'carbon-14 uptake', src: 'peterson1997' },
      { who: 'Water flea (Daphnia magna)', v: 1.86, T: 48, endpoint: 'immobilization', src: 'ecotox' },
      { who: 'Fish', v: 50.2, T: 96, endpoint: 'death (LC50)', src: 'ecotox' }
    ],
    endothall: [
      { who: 'Green alga (Raphidocelis subcapitata)', v: 7.0, censored: true, T: 120, endpoint: 'growth; true value is above 7.0', src: 'epa2015endothall' },
      { who: 'Water flea (Daphnia magna)', v: 70.7, T: null, endpoint: 'test length not stated', src: 'epa2015endothall' },
      { who: 'Fish (rainbow trout)', v: 9.152, T: null, endpoint: 'test length not stated', src: 'epa2015endothall' }
    ],
    flumioxazin: [
      { who: 'Green alga', v: 0.00102, T: null, endpoint: 'species and test length to verify', src: 'epa2003flum' },
      { who: 'Water flea (Daphnia magna)', none: true, reason: 'No value in the CyanoSelect matrix yet.' },
      { who: 'Fish', none: true, reason: 'No value in the CyanoSelect matrix yet.' }
    ]
  };

  // ------------------------------------------------------------- utilities
  function central() {
    const pv = {};
    for (const k in PARAMS) pv[k] = PARAMS[k].v;
    return pv;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Acklam's rational approximation of the inverse standard normal CDF
  function probit(p) {
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pl = 0.02425;
    if (p <= 0) return -8; if (p >= 1) return 8;
    let q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  // Latin-hypercube samples of every sampled parameter in a table. Member 0 is NOT the centre.
  function lhsSamples(n, seed) { return lhsSamplesFrom(PARAMS, n, seed); }
  function centralFrom(table) { const pv = {}; for (const k in table) pv[k] = table[k].v; return pv; }
  function lhsSamplesFrom(table, n, seed) {
    const rng = mulberry32(seed);
    const keys = Object.keys(table).filter(k => table[k].sample);
    const members = [];
    for (let i = 0; i < n; i++) members.push(centralFrom(table));
    for (const k of keys) {
      const perm = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
      const p = table[k];
      for (let i = 0; i < n; i++) {
        const u = (perm[i] + rng()) / n;
        let val;
        if (p.dist === 'log') val = Math.exp(Math.log(p.lo) + u * (Math.log(p.hi) - Math.log(p.lo)));
        else if (p.dist === 'normal01') val = probit(u);
        else val = p.lo + u * (p.hi - p.lo);
        members[i][k] = val;
      }
    }
    return members;
  }

  // ------------------------------------------------------------- physics and chemistry helpers
  const ACRE_M2 = 4046.856;

  // Water density (Tanaka et al. 2001), kg/m3; used for display and tests
  // ---- sunlight (shared by both models). Latitude and clock offset are for Apex, NC.
  const LAT = 35.73;
  function solarElevationSin(tHoursClock, doy) {
    const decl = 23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + doy) / 365);
    const solarTime = tHoursClock - 1.33;                // EDT clock to solar time near Apex, NC (ESTIMATE)
    const H = (solarTime - 12) * 15 * Math.PI / 180;
    const phi = LAT * Math.PI / 180;
    return Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
  }
  function clearSkyGHI(sinElev) { return sinElev > 0.01 ? 1098 * sinElev * Math.exp(-0.057 / sinElev) : 0; }  // Haurwitz
  function secchiFromChl(chl) { return Math.exp((60 - (9.81 * Math.log(Math.max(chl, 0.5)) + 30.6)) / 14.41); }  // Carlson TSI
  // depth-average of I/(I + Ik) between z1 and z2 for light I0·exp(-Kd·z)
  function lightFrac(I0, Kd, z1, z2, Ik) {
    if (!(I0 > 0)) return 0;
    if (!(Kd * (z2 - z1) > 1e-6)) { const I = I0 * Math.exp(-Kd * z1); return I / (I + Ik); }
    return Math.log((I0 * Math.exp(-Kd * z1) + Ik) / (I0 * Math.exp(-Kd * z2) + Ik)) / (Kd * (z2 - z1));
  }
  // the living bloom's oxygen in mg O2/L per hour: gross photosynthesis P and breathing R
  function bloomO2(chlLiveUgL, I0, Kd, z1, z2, Tc, pv) {
    if (!(chlLiveUgL > 0)) return { P: 0, R: 0 };
    const pm = pv.pmax_chl * Math.pow(pv.met_theta, Tc - 25) * chlLiveUgL / 1000;   // mg C/L/h in bright light
    return { P: pm * lightFrac(I0, Kd, z1, z2, pv.ik_sw) * pv.pq * 32 / 12, R: pv.resp_frac * pm * 32 / 12 };
  }

  function waterDensity(t) {
    return 999.974950 * (1 - ((t - 3.983035) ** 2 * (t + 301.797)) / (522528.9 * (t + 69.34881)));
  }

  // Dynamic viscosity of water (Vogel form), Pa*s; valid 10-100 C within +/-0.8%
  function viscosity(t) { return 2.414e-5 * Math.pow(10, 247.8 / (t + 133.15)); }

  // O2 saturation, mg/L, freshwater (Weiss 1970 form as written in the TUFLOW FV WQ manual, S = 0)
  function doSat(tC) {
    const TK = (tC + 273.15) / 100;
    const C = -173.4292 + 249.6339 * (100 / (tC + 273.15)) + 143.3483 * Math.log(TK) - 21.8492 * TK;
    return 1.42763 * Math.exp(C);
  }

  // Freshwater O2 Schmidt number (Wanninkhof 2014 fit). Physical cross-check: nu/D ~ 510 at 20 C.
  function scO2(tC) {
    return 1745.1 - 124.34 * tC + 4.8055 * tC ** 2 - 0.10115 * tC ** 3 + 0.00086842 * tC ** 4;
  }

  function k600(u10, pv) {           // cm/h
    return pv.k600_a + pv.k600_b * Math.pow(Math.max(0, u10), pv.k600_c);
  }

  // Reaeration rate for a layer of depth z (1/day)
  function reaeration(u10, tC, z, pv) {
    const n = u10 < 3.7 ? 2 / 3 : 0.5;
    const kO2 = k600(u10, pv) * Math.pow(scO2(tC) / 600, -n);   // cm/h
    return (kO2 * 0.24) / z;                                     // m/day ÷ m
  }

  // Carbonate system (25 C constants). Alk in eq/L, DIC in mol/L.
  function carbAlk(pH, dic, pv) {
    const H = Math.pow(10, -pH), K1 = Math.pow(10, -pv.pK1), K2 = Math.pow(10, -pv.pK2), Kw = 1e-14;
    const den = H * H + K1 * H + K1 * K2;
    const a1 = K1 * H / den, a2 = K1 * K2 / den;
    return dic * (a1 + 2 * a2) + Kw / H - H;
  }
  function dicFromAlkPH(alkEq, pH, pv) {
    const H = Math.pow(10, -pH), K1 = Math.pow(10, -pv.pK1), K2 = Math.pow(10, -pv.pK2), Kw = 1e-14;
    const den = H * H + K1 * H + K1 * K2;
    const a1 = K1 * H / den, a2 = K1 * K2 / den;
    return (alkEq - Kw / H + H) / (a1 + 2 * a2);
  }
  function pHFromAlkDic(alkEq, dic, pv) {
    let lo = 3, hi = 13;
    for (let i = 0; i < 80; i++) {
      const mid = 0.5 * (lo + hi);
      if (carbAlk(mid, dic, pv) > alkEq) hi = mid; else lo = mid;
    }
    return 0.5 * (lo + hi);
  }
  // pH after a granular peroxyhydrate dose (C = mg/L H2O2 delivered)
  function pHAfterGranules(pH0, alkMgL, C, pv) {
    const alk0 = alkMgL / 50000;                 // mg/L CaCO3 -> eq/L
    const dic0 = dicFromAlkPH(alk0, pH0, pv);
    const alk1 = alk0 + (pv.perc_alk * C) / 50000;
    const dic1 = dic0 + pv.perc_dic * C / 1000;
    return pHFromAlkDic(alk1, dic1, pv);
  }

  function pHAmplitude(chl, alk, pv) {
    if (chl < 10) return { A: pv.ph_amp_low, cls: 'little bloom' };
    if (chl < 100) return { A: pv.ph_amp_mod, cls: 'moderate bloom' };
    if (alk < 50) return { A: pv.ph_amp_soft, cls: 'dense bloom, soft water' };
    return { A: pv.ph_amp_hard, cls: 'dense bloom, buffered water' };
  }
  function swing(hourOfDay, pv) {
    const x = (hourOfDay - pv.sunrise) / pv.daylength;
    if (x <= 0 || x >= 1) return 0;
    return Math.sqrt(Math.sin(Math.PI * x));
  }

  function h2o2Rate(tC, chl, pv) {   // 1/h
    return Math.pow(pv.h2o2_theta, tC - 20) * (pv.h2o2_kab + pv.h2o2_b * chl);
  }
  function flumRate(pH, pv) {        // 1/h at 25 C
    return pv.fl_k0 + pv.fl_koh * Math.pow(10, pH - 14);
  }
  function copperRate(tC, alk, pv) { // 1/day
    const inRange = alk >= 78 && alk <= 132;
    const a = Math.min(132, Math.max(78, alk));
    const mult = inRange ? 0.85 + 0.3 * pv.cu_u : 0.5 + 1.0 * pv.cu_u;
    return (pv.cu_k78 + pv.cu_alkslope * (a - 78)) * Math.pow(pv.cu_theta, tC - 26.8) * mult;
  }
  function freeCuCeiling(pH, pv) {   // mg/L
    return pv.cu_free7 * Math.pow(10, -2 * (pH - 7));
  }
  function diquatCapacity(ntu, cause, clay, pv) { // mg/L diquat that suspended clay can bind
    if (cause !== 'mineral') return 0;
    const tss = pv.dq_tss * ntu;                 // mg/L
    const cec = clay === 'typical' ? pv.dq_cec_typ : clay === 'swelling' ? pv.dq_cec_swell : pv.dq_cec_unk;
    return (tss / 1000) * cec * pv.dq_mgmeq;
  }

  // Clay taking up diquat over dtH hours in one parcel of water: dissolved C and bound b (mg/L) with
  // binding room cap (mg/L of water). db/dt = k·C·(1 − b/cap), with C + b fixed over the step, solved
  // exactly. Returns the mg/L newly bound. Shared by all three models.
  function diquatSorb(C, b, cap, k, dtH) {
    if (!(C > 0) || !(cap > b) || !(k > 0) || !(dtH > 0)) return 0;
    const T = C + b, a = k / cap, d = cap - T;
    if (!(T - b > 0)) return 0;                     // dissolved amount lost in rounding
    let bn;
    if (Math.abs(d) < 1e-9 * cap) { const y0 = T - b; bn = T - y0 / (1 + a * y0 * dtH); }
    else { const Rr = (cap - b) / (T - b) * Math.exp(a * d * dtH); bn = (Rr * T - cap) / (Rr - 1); }
    if (!isFinite(bn)) bn = Math.min(T, cap);
    bn = Math.min(Math.max(bn, b), Math.min(T, cap));
    // T − b can come out one rounding step above C, which left C at about −1e-20 (fixed Nov 8, 2026)
    return Math.min(bn - b, C);
  }
  // binding room per litre of water (mg/L): the clay's exchange capacity times the share diquat reaches
  function diquatRoom(inp, pv) { return diquatCapacity(inp.ntu, inp.turbCause, inp.clay, pv) * pv.dq_access; }

  // GUTS-RED-SD calibration: killing rate bw so a constant C = E gives 50% at T hours
  function calibrateSD(E, T, kD, z) {
    if (z >= E) z = 0.5 * E;
    let t0 = -Math.log(1 - z / E) / kD;
    if (t0 >= 0.9 * T) { z = 0; t0 = 0; }
    const I = (E - z) * (T - t0) - (E / kD) * (Math.exp(-kD * t0) - Math.exp(-kD * T));
    return { bw: LN2 / I, z: z };
  }

  // GUTS-RED-IT calibration: median tolerance mw so a constant C = E gives 50% at T hours
  function calibrateIT(E, T, kD) { return E * (1 - Math.exp(-kD * T)); }

  // The same two calibrations for a lab test that dosed once and let the product fade at rate k
  // (1/h): C = E·exp(-k·t). Damage then follows D(t) = E·kD/(kD-k)·(exp(-k·t) - exp(-kD·t)).
  // (Until Oct 21, 2026 the peroxide EC50s were calibrated as if held steady for 24 h, which set the
  // cells' toughness about 2.7× too high and under-predicted the one field check by more than half.)
  function pulseDamage(E, kD, k, t) {
    if (Math.abs(kD - k) < 1e-9 * Math.max(kD, k)) return E * kD * t * Math.exp(-kD * t);
    return E * kD / (kD - k) * (Math.exp(-k * t) - Math.exp(-kD * t));
  }
  function calibrateITpulse(E, T, kD, k) {
    if (!(k > 0)) return calibrateIT(E, T, kD);
    let t = Math.abs(kD - k) < 1e-9 * Math.max(kD, k) ? 1 / kD : Math.log(kD / k) / (kD - k);
    if (!(t > 0) || t > T) t = T;
    return pulseDamage(E, kD, k, t);
  }
  function calibrateSDpulse(E, T, kD, k, zFrac) {
    if (!(k > 0)) return calibrateSD(E, T, kD, zFrac * E);
    const Dmax = calibrateITpulse(E, T, kD, k), n = 2000, h = T / n;
    const integ = z => { let s = 0; for (let i = 0; i <= n; i++) { const v = Math.max(0, pulseDamage(E, kD, k, i * h) - z); s += (i === 0 || i === n ? 0.5 : 1) * v; } return s * h; };
    let z = zFrac * Dmax, I = integ(z);
    if (!(I > 0)) { z = 0; I = integ(0); }
    return { bw: LN2 / I, z };
  }
  // the kill rule for one EC50, calibrated the way its lab test was run
  function killFor(ec, pv) {
    const E = ec.v * Math.pow(10, pv.ec50_sd * pv.ec50_z);
    const structure = pv.kill_struct < 0.5 ? 'SD' : 'IT';
    if (ec.pulse) {
      const kLab = ec.labK > 0 ? ec.labK : pv.lab_k;
      const cal = calibrateSDpulse(E, ec.T, pv.kd, kLab, pv.z_frac);
      return { E, T: ec.T, kD: pv.kd, z: cal.z, bw: cal.bw, structure, beta: pv.it_beta, mw: calibrateITpulse(E, ec.T, pv.kd, kLab), pulse: true, kLab };
    }
    const cal = calibrateSD(E, ec.T, pv.kd, pv.z_frac * E);
    return { E, T: ec.T, kD: pv.kd, z: cal.z, bw: cal.bw, structure, beta: pv.it_beta, mw: calibrateIT(E, ec.T, pv.kd) };
  }

  // Exposure an organism gets, judged the way its lab test was run. Series = hourly concentration
  // where it lives (the stirred top water). A test that dosed once and let it fade is compared with
  // the field's 1-hour peak; a steady test with the worst average over the test's length.
  function ntExposure(series, nt) {
    const n = series.length;
    if (nt.pulse || (nt.T && nt.T <= 3)) { let m = 0; for (let i = 0; i + 1 < n; i++) m = Math.max(m, 0.5 * (series[i] + series[i + 1])); return { v: m, basis: 'peak' }; }
    const T = Math.max(1, Math.min(n - 1, Math.round(nt.T || 48)));
    const cum = new Float64Array(n); for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + 0.5 * (series[i - 1] + series[i]);
    let m = 0; for (let i = 0; i + T < n; i++) m = Math.max(m, (cum[i + T] - cum[i]) / T);
    return { v: m, basis: 'average', T, assumedT: !nt.T };
  }
  // Water hardness (mg/L as CaCO3): measured, or estimated from alkalinity
  function hardnessOf(inp) {
    if (inp.hardness > 0) return { H: inp.hardness, estimated: false };
    return { H: Math.max(1, inp.alk * PARAMS.hard_per_alk.v), estimated: true };
  }
  // Copper's effect level for an animal at the pond's hardness. The EPA hardness rule is applied over
  // 10-400 mg/L (above 400 the regulation itself caps it; below 10 is extrapolation too far to trust).
  function copperHardFactor(inp) {
    const h = hardnessOf(inp), Hc = Math.max(10, Math.min(400, h.H));
    return { f: Math.pow(Hc / PARAMS.cu_test_hard.v, PARAMS.cu_hard_slope.v), H: h.H, Hused: Hc, estimated: h.estimated };
  }
  function ntList(chem, inp) {
    return (NONTARGET[chem] || []).map(nt => {
      if (nt.none) return nt;
      let o = nt.byTarget && nt.byTarget[inp.target] ? Object.assign({}, nt, nt.byTarget[inp.target]) : nt;
      if (o.hard) {
        const hf = copperHardFactor(inp);
        o = Object.assign({}, o, { v: o.v * hf.f, vLab: o.v, hardness: hf.H, hardnessUsed: hf.Hused, hardnessEstimated: hf.estimated, hardFactor: hf.f });
      }
      return o;
    });
  }
  function itFraction(Dmax, mw, beta) { return Dmax <= 0 ? 0 : 1 / (1 + Math.pow(mw / Dmax, beta)); }

  function hill(C, E, b) { return C <= 0 ? 0 : 1 / (1 + Math.pow(E / C, b)); }

  // ------------------------------------------------------------- the model
  function geometry(inp, pv) {
    const A = inp.areaAcres * ACRE_M2;
    const zmax = inp.maxDepthM;
    const zmean = pv.r_meanmax * zmax;
    const areaHa = A / 1e4;
    let layered, reason;
    if (inp.layering === 'mixed') { layered = false; reason = 'set by user'; }
    else if (inp.layering === 'layered') { layered = true; reason = 'set by user'; }
    else if (zmax > pv.strat_depth && areaHa < pv.strat_area) { layered = true; reason = 'deeper than 2 m and smaller than 4.17 ha'; }
    else if (zmax <= pv.strat_depth && inp.appHour >= 12 && inp.windMs < 3) { layered = true; reason = 'shallow pond, calm afternoon'; }
    else { layered = false; reason = inp.appHour < 12 ? 'morning, shallow or large pond' : 'windy or large pond'; }
    // The pond is the layers model's bowl: area deeper than z is A·(1 − z/zmax)^p, p = 1/r − 1. A warm
    // top layer hLayer deep holds the share 1 − (1 − hLayer/zmax)^(p+1) of the water, so its average
    // thickness over the surface is zmean × that share, and it touches the share 1 − (1 − hLayer/zmax)^p
    // of the bed. (Until Nov 8, 2026 the layer was a straight-sided slab hLayer deep: in a 3 m bowl a 1 m
    // layer got 1.2 m of water per m² instead of 0.76 m, so the treated-layer concentration was 24% low,
    // a layer as deep as the mean depth counted as the whole pond, and a layered pond had no bed under it.)
    const p = 1 / pv.r_meanmax - 1;
    let hLayer = layered ? Math.min(pv.h_mix, zmax) : zmax;
    if (hLayer >= zmax) { layered = false; hLayer = zmax; }
    const share = layered ? 1 - Math.pow(1 - hLayer / zmax, p + 1) : 1;
    const fSed = layered ? 1 - Math.pow(1 - hLayer / zmax, p) : 1;
    const zLayer = zmean * share;
    return { A, zmax, zmean, zLayer, hLayer, fSed, layered, reason, CF: 1 / share, V: A * zmean };
  }

  // Measurements the user can enter (all optional). Each replaces an estimate in every run, the
  // uncertainty runs included, so the band stops varying what was measured.
  //   meanDepthM     average depth                          -> the bowl shape (r_meanmax)
  //   h2o2HalfLifeH  peroxide half-life in the pond's water -> peroxide breakdown rate
  //   myEC50 {v, T}  the user's own test on their bloom     -> EC50 (mg/L, test hours); strain spread narrowed
  //   mcMeasured     measured total microcystin, µg/L       -> toxin per chlorophyll
  // (bottomC and secchiM are used by the layers model; deepSpot by the map.)
  function withMeasured(inp, pv) {
    const q = Object.assign({}, pv);
    if (inp.meanDepthM > 0 && inp.maxDepthM > 0) q.r_meanmax = Math.min(0.85, Math.max(0.2, inp.meanDepthM / inp.maxDepthM));
    if (inp.h2o2HalfLifeH > 0) { q.h2o2_b = 0; q.h2o2_kab = (Math.LN2 / inp.h2o2HalfLifeH) / Math.pow(q.h2o2_theta, inp.tempC - 20); }
    if (inp.myEC50 && inp.myEC50.v > 0) q.ec50_sd = Math.min(q.ec50_sd, 0.1);   // test-to-test scatter only
    return q;
  }
  function ecFor(chem, inp) {
    // a peroxide test is taken to have dosed once and let it fade, at the half-life the user measured if any
    if (inp.myEC50 && inp.myEC50.v > 0) return { v: inp.myEC50.v, T: inp.myEC50.T > 0 ? inp.myEC50.T : 24, endpoint: 'your own test', src: null, own: true,
      pulse: chem === 'h2o2', labK: chem === 'h2o2' && inp.h2o2HalfLifeH > 0 ? LN2 / inp.h2o2HalfLifeH : undefined };
    return TARGET_EC50[chem][inp.target];
  }
  function toxinRatio(inp, pv) {
    if (inp.mcMeasured > 0 && inp.chl > 0) return inp.mcMeasured / inp.chl;
    return inp.toxin === 'low' ? pv.mc_low : inp.toxin === 'worst' ? pv.mc_worst : pv.mc_typ;
  }

  function simulate(inp, pv, opts) {
    opts = opts || {};
    pv = withMeasured(inp, pv);
    const prod = PRODUCTS[inp.product];
    const chem = prod.chem;
    const g = geometry(inp, pv);
    const T = inp.tempC, chl = inp.chl, f = inp.fraction;
    const doseMgL = inp.dose * prod.toMgL;
    const Cmix = doseMgL * g.CF;                     // concentration in the treated layer at t = 0

    // pH baseline (granules raise it) and daily swing
    const amp = pHAmplitude(chl, inp.alk, pv);
    const pHbase = prod.granular ? pHAfterGranules(inp.pH, inp.alk, Cmix, pv) : inp.pH;

    // chemistry set-up
    let C = Cmix, kconst = 0, dinst = 0, bound = 0;
    if (chem === 'h2o2') { dinst = Math.min(Cmix, pv.h2o2_dinst); C = Cmix - dinst; kconst = h2o2Rate(T, chl, pv); }
    else if (chem === 'cu_sulfate') kconst = copperRate(T, inp.alk, pv) / 24;
    else if (chem === 'cu_chelated') kconst = pv.cuchel_k / 24;
    else if (chem === 'diquat') kconst = pv.dq_kwc / 24;
    else if (chem === 'endothall') kconst = 0;
    else if (chem === 'flumioxazin') kconst = 0;
    const dqRoom = chem === 'diquat' ? diquatRoom(inp, pv) : 0;
    const C0 = C;

    // kill model
    const ec = ecFor(chem, inp);
    let kill = null;
    if (ec && !ec.none && opts.forceKill == null) kill = killFor(ec, pv);

    // toxin pool
    const ratio = toxinRatio(inp, pv);
    const MCtot = ratio * chl;
    const MC0 = pv.mc_fext * MCtot;
    const MCint0 = MCtot - MC0;
    const lagH = inp.history ? 0 : pv.mc_lag * 24;
    const kPhotoH = LN2 / (pv.mc_photo * g.zLayer) / 24;

    // oxygen
    const DOsat = doSat(T);
    const sodV = g.fSed * pv.sod20 * Math.pow(pv.sod_theta, T - 20) / g.zLayer;  // mg/L/day, from the bed the layer touches (was 0 when layered until Nov 8, 2026)
    const Krea = reaeration(inp.windMs, T, g.zLayer, pv);                               // 1/day
    const DOeq = Math.max(0, DOsat - sodV / Krea);
    const kdDead = pv.kd20 * Math.pow(pv.kd_theta, T - 20);                             // 1/day
    const carbonPerKill = pv.thetaC * chl / 1000;                                       // mg C/L if 100% killed

    // light for the bloom's photosynthesis (real sunlight, not scaled): real weather, or clear sky × the sky choice
    const skyF = inp.sky === 'overcast' ? 0.35 : inp.sky === 'partly' ? 0.7 : 1.0;
    const KdL = inp.secchiM > 0 ? 1.7 / inp.secchiM : 1.7 / secchiFromChl(chl) + (inp.turbCause === 'mineral' ? 0.1 * inp.ntu : 0);
    const W = inp.weather && inp.weather.sw && inp.weather.sw.length > 24 ? inp.weather : null;
    const lightAt = t => {
      if (W) { const x = 48 + inp.appHour + t + 0.5, i = Math.max(0, Math.min(W.sw.length - 2, Math.floor(x))); return Math.max(0, W.sw[i] + (W.sw[i + 1] - W.sw[i]) * Math.max(0, Math.min(1, x - i))); }
      return skyF * clearSkyGHI(solarElevationSin(((inp.appHour + t) % 24 + 24) % 24, inp.doy || 196));
    };

    // state
    let D = 0, Dmax = 0, H = 0, K = 0, Y = 0, MC = MC0, Cdead = 0;
    let Def = chem === 'h2o2' ? -pv.h2o2_o2 * dinst : 0;   // oxygen deficit; negative = H2O2 adds O2
    let DefU = 0;                                           // the untreated water (whole bloom alive)
    // The untreated pond is taken to be in day-to-day oxygen balance: everything else that breathes
    // (bacteria, animals) uses whatever the bloom's photosynthesis makes beyond its own breathing.
    // That other breathing goes on after a treatment; the bloom's photosynthesis doesn't.
    let pDay = 0; for (let h = 0; h < 24; h += 0.25) pDay += bloomO2(chl, lightAt(h), KdL, 0, g.zLayer, T, pv).P * 0.25;
    const rOther = Math.max(0, pDay / 24 - bloomO2(chl, 0, KdL, 0, g.zLayer, T, pv).R);   // mg O2/L/h
    let intC = 0, Cpeak = C0, tAbove = null;

    const nSteps = Math.round(RUN_DAYS * 24 / DT_H);
    // MC = dissolved microcystin; MCall = total, dissolved plus what is still inside cells (live,
    // or knocked down but not yet leaked). Guideline values (EPA 8, WHO 24 µg/L) are for total.
    const rec = { hours: [], C: [], pH: [], K: [], MC: [], MCall: [], DOt: [], DOp: [] };
    const krelH = pv.mc_krel / 24;

    const record = (t, pH) => {
      rec.hours.push(t); rec.C.push(C); rec.pH.push(pH); rec.K.push(K); rec.MC.push(MC);
      rec.MCall.push(MC + MCint0 * Math.max(0, 1 - (K - Y)));
      rec.DOt.push(Math.max(0, DOeq - Def)); rec.DOp.push(Math.max(0, DOeq - (f * Def + (1 - f) * DefU)));
    };

    const pHat = t => Math.min(pv.ph_cap, pHbase + amp.A * swing(((inp.appHour + t) % 24 + 24) % 24, pv));

    record(0, pHat(0));
    for (let i = 0; i < nSteps; i++) {
      const t = i * DT_H, tm = t + 0.5 * DT_H;
      // --- chemistry: exact exponential over the step with the rate at the step midpoint
      let k = kconst;
      if (chem === 'flumioxazin') k = flumRate(pHat(tm), pv);
      else if (chem === 'endothall') {
        const tLag = pv.en_lag * 24;
        k = (tm < tLag ? pv.en_kslow : pv.en_kbio * Math.pow(pv.en_theta, T - 20)) / 24;
      }
      if (dqRoom > 0) { const db = diquatSorb(C, bound, dqRoom, pv.dq_ksorb, DT_H); C -= db; bound += db; }   // clay binds diquat
      const Cprev = C;
      C = Cprev * Math.exp(-k * DT_H);
      const decayed = Cprev - C;
      const Cavg = 0.5 * (Cprev + C);
      intC += Cavg * DT_H;
      // --- kill (GUTS-RED-SD)
      let dK = 0;
      if (opts.forceKill != null) {          // test hook: instant kill of a set fraction at t = 0
        if (i === 0) { dK = opts.forceKill; K = opts.forceKill; }
      } else if (kill) {
        const Dn = Cavg + (D - Cavg) * Math.exp(-kill.kD * DT_H);
        let Kn;
        if (kill.structure === 'SD') {
          H += kill.bw * Math.max(0, 0.5 * (D + Dn) - kill.z) * DT_H;
          Kn = 1 - Math.exp(-H);
        } else {
          if (Dn > Dmax) Dmax = Dn;
          Kn = itFraction(Dmax, kill.mw, kill.beta);
        }
        D = Dn;
        dK = Math.max(0, Kn - K); K = Math.max(K, Kn);
      }
      // --- damaged cells leak toxin and become dead biomass
      const rel = krelH * Y * DT_H;
      Y += dK - rel;
      const cuFactor = (chem === 'cu_sulfate' || chem === 'cu_chelated') && C > 1 ? pv.mc_cu_slow : 1;
      const kbioH = t >= lagH ? (pv.mc_kbio / 24) * cuFactor : 0;
      MC += rel * MCint0 - (kbioH + kPhotoH) * MC * DT_H;
      Cdead += rel * carbonPerKill - (kdDead / 24) * Cdead * DT_H;
      // --- oxygen deficit: dead bloom decaying, the living bloom's photosynthesis and breathing, reaeration
      const Ib = lightAt(tm);
      const mt = bloomO2(chl * Math.max(0, 1 - K), Ib, KdL, 0, g.zLayer, T, pv), mu = bloomO2(chl, Ib, KdL, 0, g.zLayer, T, pv);
      Def += (pv.rOC * (kdDead / 24) * Cdead + mt.R + rOther * (1 - pv.ro_live * K) - mt.P - (Krea / 24) * Def) * DT_H;
      DefU += (mu.R + rOther - mu.P - (Krea / 24) * DefU) * DT_H;
      if (chem === 'h2o2') Def -= pv.h2o2_o2 * decayed;
      if (C > Cpeak) Cpeak = C;
      if ((i + 1) % REC_EVERY === 0) record(t + DT_H, pHat(t + DT_H));
    }

    return {
      inputs: inp, rec, g, chem, prod, doseMgL, Cmix, C0, Cpeak, dinst, bound, intC, kill, ec, pHbase, amp,
      MCtot, MC0, MCint0, DOsat, DOeq, Krea, sodV, lagH, f
    };
  }

  // ------------------------------------------------------------- summaries
  function firstIndex(arr, pred, start) {
    for (let i = start || 0; i < arr.length; i++) if (pred(arr[i], i)) return i;
    return -1;
  }

  function summarize(run, inp) {
    const r = run.rec, out = {};
    out.Cpeak = run.Cpeak;
    const at = h => r.K[Math.min(r.K.length - 1, Math.round(h))];
    out.kill = run.kill ? { atTest: at(run.kill.T), at48: at(48), at7d: at(168), end: r.K[r.K.length - 1] } : null;
    let iPk = 0; for (let i = 1; i < r.MC.length; i++) if (r.MC[i] > r.MC[iPk]) iPk = i;
    out.mcPeak = r.MC[iPk]; out.mcPeakDay = r.hours[iPk] / 24;
    const i8 = r.MC[iPk] < 8 ? 0 : firstIndex(r.MC, v => v < 8, iPk);
    out.mcBelow8Day = i8 < 0 ? null : r.hours[i8] / 24;   // null = still above 8 at day 14
    // total toxin (inside and outside cells): what the EPA and WHO levels are written for
    out.mcTot0 = r.MCall[0];
    const it8 = firstIndex(r.MCall, v => v < 8, 0);
    out.mcTotBelow8Day = it8 < 0 ? null : r.hours[it8] / 24;   // 0 = under 8 from the start; null = still above at day 14
    let iDo = 0; for (let i = 1; i < r.DOt.length; i++) if (r.DOt[i] < r.DOt[iDo]) iDo = i;
    out.doMin = r.DOt[iDo]; out.doMinDay = r.hours[iDo] / 24;
    out.doMinPond = Math.min.apply(null, r.DOp);
    out.hoursBelow4 = r.DOt.filter(v => v < 4).length;
    out.hoursBelow2 = r.DOt.filter(v => v < 2).length;
    const first48 = r.pH.slice(0, 49);
    out.pHmin = Math.min.apply(null, first48); out.pHmax = Math.max.apply(null, first48);
    out.ntExpo = ntList(run.chem, inp).map(o => o.none ? null : ntExposure(r.C, o).v);
    return out;
  }

  // Same exposure, different model structures (central EC50)
  function compareModels(run, pv) {
    if (!run.kill) return null;
    const ec = run.ec, E = ec.v, T = ec.T, r = run.rec;
    const n = Math.min(r.C.length - 1, Math.round(T));
    let s = 0; for (let i = 0; i < n; i++) s += 0.5 * (r.C[i] + r.C[i + 1]);   // hourly trapezoid
    const twa = s / n;
    const peak = run.Cpeak;
    const ct = 1 - Math.pow(0.5, run.intC / (E * T));
    const b = [1, 2, 4];
    const iT = Math.min(r.K.length - 1, Math.round(T));
    const sd = simulate(run.inputs, Object.assign({}, pv, { kill_struct: 0.25 }));
    const it = simulate(run.inputs, Object.assign({}, pv, { kill_struct: 0.75 }));
    return {
      T, twa, peak,
      twaKill: b.map(x => hill(twa, E, x)),
      peakKill: b.map(x => hill(peak, E, x)),
      ctKill: ct,
      sdKill: sd.rec.K[iT],
      itKill: it.rec.K[iT]
    };
  }

  function nonTargets(run, inp) {
    return ntList(run.chem, inp).map(o => {
      if (o.none) return { who: o.who, none: true, reason: o.reason };
      const ex = ntExposure(run.rec.C, o);
      return { who: o.who, v: o.v, vLab: o.vLab, hardness: o.hardness, hardnessUsed: o.hardnessUsed, hardnessEstimated: o.hardnessEstimated, hardFactor: o.hardFactor, T: o.T, endpoint: o.endpoint, src: o.src, censored: !!o.censored, pulse: !!o.pulse, expo: ex.v, basis: ex.basis, basisT: ex.T, assumedT: ex.assumedT,
        margin: ex.v > 0 ? o.v / ex.v : Infinity, hoursAbove: run.rec.C.filter(c => c > o.v).length };
    });
  }

  function warnings(run, inp) {
    const w = [], g = run.g, chem = run.chem;
    if (g.layered && g.CF > 1.01) w.push({ id: 'layer', level: 'high', text: `The pond is probably layered (${g.reason}). A surface treatment stays in the warm top ${(g.hLayer * 3.28084).toFixed(1)} ft, so the concentration there is about ${g.CF.toFixed(1)}× the label dose for the whole depth.` });
    if (run.prod.granular) w.push({ id: 'granules-sink', level: 'mid', text: 'Granules often sink and finish dissolving near the bottom. Phase 1 assumes they dissolve in the treated layer, so the surface dose may be overstated. Phase 2 will model sinking.' });
    if (run.prod.granular) w.push({ id: 'granule-ph', level: 'mid', text: `The granules add alkalinity and raise pH from ${inp.pH.toFixed(1)} to about ${run.pHbase.toFixed(1)} at dawn.` });
    if (chem === 'h2o2') w.push({ id: 'h2o2-endpoint', level: 'mid', text: 'Peroxide EC50s measure photosynthesis shutting down, not death. "Knocked down" can recover; a cell-death EC50 for Microcystis was about 50× higher.' });
    if ((chem === 'cu_sulfate' || chem === 'cu_chelated') && inp.target === 'microcystis' && inp.chl >= 50) w.push({ id: 'cu-density', level: 'high', text: 'Copper works less well in dense blooms: a Microcystis copper EC50 rose about 10× from 10⁶ to 10⁷ cells/mL (Kinley et al. 2017). This run uses a low-density EC50, so knock-down is likely overstated.' });
    if (chem === 'cu_sulfate' || chem === 'cu_chelated') {
      const h = hardnessOf(inp);
      if (h.H < 50) w.push({ id: 'cu-soft', level: 'high', text: `Soft water (hardness about ${Math.round(h.H)} mg/L${h.estimated ? ', estimated from alkalinity' : ''}): copper is much more toxic to fish and water fleas in soft water. Their effect levels here are scaled down for hardness with the US EPA rule${h.H < 10 ? ', and below 10 mg/L the rule is held at 10, so the real margin may be thinner still' : ''}.` });
      else if (h.estimated) w.push({ id: 'cu-hard-est', level: 'low', text: `Copper effect levels for fish and water fleas are scaled for water hardness, estimated here from alkalinity (${Math.round(h.H)} mg/L). A hardness test kit reading would replace the estimate.` });
    }
    if (chem === 'cu_sulfate' && (inp.alk < 78 || inp.alk > 132)) w.push({ id: 'cu-alk', level: 'mid', text: 'Copper loss rates were measured at alkalinity 78-132 mg/L. Your pond is outside that range, so the rate is extrapolated with a wider band.' });
    if (chem === 'diquat' && inp.turbCause !== 'mineral' && inp.ntu > 5) w.push({ id: 'dq-algae', level: 'mid', text: 'Turbidity from algae does not bind diquat the way clay does, so no clay binding was applied. Organic particles can still bind some diquat.' });
    if (chem === 'diquat' && inp.turbCause === 'mineral' && inp.ntu > 40) w.push({ id: 'dq-ntu', level: 'mid', text: 'Above about 40 NTU the turbidity-to-solids conversion is unreliable.' });
    if (chem === 'diquat' && run.bound > 0.005 * run.Cmix) w.push({ id: 'dq-bound', level: run.bound >= 0.9 * run.Cmix ? 'high' : 'mid', text: `Suspended clay is predicted to bind ${(100 * run.bound / run.Cmix).toFixed(0)}% of the diquat, most of it within the first hour. This estimate rests on two tank studies, and the solids-per-NTU and clay numbers behind it are assumptions, so treat it as a warning sign rather than a firm number.` });
    if (chem === 'endothall' && inp.tempC < 18) w.push({ id: 'endothall-temp', level: 'mid', text: 'Endothall labels advise treating at 18 °C (65 °F) or warmer.' });
    if (chem === 'flumioxazin') w.push({ id: 'flum', level: 'mid', text: 'Flumioxazin breaks down within minutes at high pH. Its rate here is the 25 °C value; the daily pH swing is an estimate.' });
    if (inp.target === 'planktothrix' && g.layered) w.push({ id: 'plankto-layer', level: 'mid', text: 'Planktothrix often sits below the warm top layer, so it may get much less of a surface treatment than shown.' });
    if (run.kill && ['diquat', 'endothall', 'flumioxazin'].includes(chem)) w.push({ id: 'release-borrowed', level: 'mid', text: 'No toxin-release data exist for this product. The toxin curve borrows the copper and peroxide release rates.' });
    if (run.kill && run.ec.Tassumed) w.push({ id: 't-assumed', level: 'mid', text: 'The test length behind this EC50 has not been verified (96 h assumed).' });
    if (run.f < 1) w.push({ id: 'partial', level: 'low', text: 'With part of the pond treated, "treated zone" assumes no mixing with the rest (worst case inside the zone) and "whole pond" assumes complete mixing. Reality is in between.' });
    w.push({ id: 'predawn', level: 'low', text: 'Oxygen is hour by hour, with the living bloom making oxygen by day and using it day and night. Its photosynthesis rate and light needs are estimates, so the size of the daily swing is rough. With the idealized day every day has the same weather and the untreated pond is balanced to it, so an overcast run can show more oxygen than a sunny one. The real crash risk is a cloudy spell after sunny weather; only real weather input can show that.' });
    w.push({ id: 'no-se', level: 'low', text: 'No southeastern US pond time series has been used to check these predictions yet.' });
    return w;
  }

  // ------------------------------------------------------------- public runner
  function percentile(sorted, p) {
    if (!sorted.length) return NaN;
    const x = (sorted.length - 1) * p, lo = Math.floor(x), hi = Math.ceil(x);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo);
  }

  function run(inp, opts) {
    opts = opts || {};
    const pv0 = central();
    const c = simulate(inp, pv0);
    const result = {
      version: VERSION, paramsVersion: PARAMS_VERSION, inputs: inp,
      central: c, summary: summarize(c, inp), models: compareModels(c, pv0),
      nonTargets: nonTargets(c, inp), warnings: warnings(c, inp)
    };
    const N = opts.members == null ? 100 : opts.members;
    if (N > 0) {
      const seed = opts.seed == null ? 20261019 : opts.seed;
      const members = lhsSamples(N, seed).map(pv => simulate(inp, pv));
      const keys = ['C', 'K', 'MC', 'MCall', 'DOt', 'DOp', 'pH'];
      const band = {};
      const nT = c.rec.hours.length;
      for (const k of keys) {
        band[k] = { p05: new Array(nT), p50: new Array(nT), p95: new Array(nT) };
        const col = new Array(N);
        for (let i = 0; i < nT; i++) {
          for (let m = 0; m < N; m++) col[m] = members[m].rec[k][i];
          col.sort((a, b) => a - b);
          band[k].p05[i] = percentile(col, 0.05); band[k].p50[i] = percentile(col, 0.5); band[k].p95[i] = percentile(col, 0.95);
        }
      }
      const sums = members.map(m => summarize(m, inp));
      const pick = (fn) => {
        const vals = sums.map(fn).filter(v => v != null && isFinite(v)).sort((a, b) => a - b);
        return vals.length ? { p05: percentile(vals, 0.05), p50: percentile(vals, 0.5), p95: percentile(vals, 0.95), n: vals.length } : null;
      };
      result.ensemble = {
        n: N, seed, band,
        Cpeak: pick(s => s.Cpeak),
        kill48: c.kill ? pick(s => s.kill ? s.kill.at48 : null) : null,
        kill7d: c.kill ? pick(s => s.kill ? s.kill.at7d : null) : null,
        mcPeak: pick(s => s.mcPeak),
        mcBelow8Day: pick(s => s.mcBelow8Day == null ? RUN_DAYS + 1 : s.mcBelow8Day),
        mcTot0: pick(s => s.mcTot0),
        mcTotBelow8Day: pick(s => s.mcTotBelow8Day == null ? RUN_DAYS + 1 : s.mcTotBelow8Day),
        doMin: pick(s => s.doMin),
        doMinPond: pick(s => s.doMinPond),
        ntExpo: (sums[0].ntExpo || []).map((_, j) => pick(s => s.ntExpo[j])),
        centralPct48: c.kill ? sums.filter(s => s.kill && s.kill.at48 < result.summary.kill.at48).length / sums.length : null
      };
    }
    return result;
  }

  function exportParams() {
    return { version: VERSION, paramsVersion: PARAMS_VERSION, dtHours: DT_H, runDays: RUN_DAYS, recEvery: REC_EVERY,
      params: PARAMS, sources: SRC, products: PRODUCTS, targets: TARGETS, targetEC50: TARGET_EC50, nonTarget: NONTARGET, thresholds: THRESHOLDS };
  }

  const api = {
    VERSION, PARAMS_VERSION, DT_H, RUN_DAYS, PARAMS, SRC, PRODUCTS, TARGETS, TARGET_EC50, NONTARGET, THRESHOLDS,
    central, centralFrom, simulate, run, summarize, compareModels, nonTargets, warnings, exportParams, lhsSamples, lhsSamplesFrom, percentile, viscosity,
    // helpers exposed for tests
    waterDensity, doSat, scO2, k600, reaeration, pHAfterGranules, pHFromAlkDic, dicFromAlkPH,
    hardnessOf, copperHardFactor, diquatSorb, diquatRoom, LAT, solarElevationSin, clearSkyGHI, secchiFromChl, lightFrac, bloomO2, withMeasured, ecFor, toxinRatio, killFor, pulseDamage, calibrateITpulse, calibrateSDpulse, ntExposure, ntList, h2o2Rate, flumRate, copperRate, freeCuCeiling, diquatCapacity, calibrateSD, calibrateIT, itFraction, hill, geometry, swing, pHAmplitude, probit, mulberry32
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CyanoSim = api;
})(typeof window !== 'undefined' ? window : globalThis);

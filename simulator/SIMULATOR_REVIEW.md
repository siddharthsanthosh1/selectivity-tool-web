# CyanoSelect pond simulator: independent correctness review

Review date: Nov 8, 2026. Code reviewed: the Oct 22, 2026 build (`cyanoselect-simulator-2d.zip`, the only copy found; unzipped unchanged into `simulator/`). Dataset of record: `FINAL1selectivity_matrix_updated.xlsx`, Nov 1 version (`~/Downloads`).

**This is an AI-assisted code review, not peer review and not field validation.** It was carried out by an AI coding assistant (Claude), with two further AI reviewers working separately.

How it was checked:
- **My own pass.** I read the model code line by line and re-derived each equation.
- **Reviewer A (AI).** A separate AI reviewer derived all 18 pieces from physics before opening any project file, then compared its derivations with the code. It did not read the guide or the tests.
- **Reviewer B (AI).** A second AI reviewer opened the cited papers it could reach to check every value labelled SOURCED.
- **Numerical and browser checks.** I ran convergence, mass-balance, limiting-case and browser checks with my own scripts, not the project's tests.

**Second pass, same day (Nov 8, 2026, evening):** you decided the open items (§5), and I made every fix you approved. This file now records both passes. Nothing is committed.

## 1. Verdict

**After the fixes (Nov 8, 2026): fit to publish as a clearly labelled planning and teaching model, "model predictions, not a treatment recommendation". Not a validated prediction tool: nothing has been compared with a measured pond, and this review was AI-assisted, not peer review.**

Before the fixes the verdict was "not yet": two high-severity map problems (H1, H2) were open, the well-mixed model mishandled layered ponds (M1, M2), 40 runs were too few for the ranges quoted (M3), and the layers model's 10-minute step cost 2.7 points of knock-down (M4). All six are now fixed. H1, H2, M1 and M2 have regression tests; M3 and M4 are settings (200 runs, a 300 s step), checked by convergence runs.

What changed since the first pass:
- **The two high-severity problems (H1, H2) are fixed**, each with regression tests:
  - colonies that should follow the water no longer pile up near the surface or bed;
  - they no longer collect on the downwind shore of the map or the side slice.
- **What's left is small, and disclosed on the page:**
  - on the map, in strong wind, the shore fifths can be up to about 10% too full (it was 28–32%);
  - in the side slice, colonies at the very top move at the top level's average speed.
- **All your other decisions are in:**
  - copper green alga 1.873 mg/L;
  - 200 runs, labelled as the 5th–95th percentile;
  - 5-minute layers-model steps;
  - one sunlight-breakdown rule for toxin in all models;
  - citation labels fixed;
  - the overcast note.
- **Tests:** 284 of 284 JavaScript tests, 35 of 35 Python cross-checks, 23 of 23 browser checks.
- **Speed:** the example pond runs in 7 seconds on this laptop (Apple M4 Pro, headless Chromium), well under your 15-second line. The map takes 2.3 s, the slice 5.1 s and the 200 runs 7.2 s; before the changes, 1.0, 3.3–3.7 and 0.9 s.

The core science checks out:
- all 18 pieces of math are right (§2);
- every budget closes to 10⁻¹⁰;
- the limiting cases behave;
- every target EC50 matches the Nov 1 matrix.

**Headline numbers moved a little:** knock-down median 64% → 67% on the page, mainly from the shorter layers-model step. Use the §4 table for the slides and paper, including its note on how much the median moves with the random seed.

## 2. Every check

Status: PASS, FAIL (bug), FIXED (bug found and fixed here), DECIDE (needs your decision), CNV (could not verify).

### Section 2: existing tests (as delivered)
| Check | Status | Note |
|---|---|---|
| verify.test.js | PASS | 70/70 |
| column.test.js | FIXED | **95/96 as delivered.** "No negative values" failed: diquat injection left −5.8×10⁻²⁰ mg/L (bug L1). It passed on Oct 22 because a different Node build rounds the last bit differently; this machine has Node 20.19.2. |
| map.test.js | PASS | 107/107 |
| make-port-fixture + test_reference.py | PASS | 35 scenarios, worst JS–Python difference 1.2e-10, same as Oct 22. The regenerated fixture differs from the zipped one in 17 of 16,787 numbers, by at most 1.2e-16 (last-bit rounding). |
| build-single + page_weather_test.py | PASS | 23/23. Both rebuilt pages are byte-identical to the zipped ones. The build needs the `marked` package; without it the guide tab silently becomes an "install marked" placeholder. |

### Section 3: math audit
| # | Piece | Status | Note |
|---|---|---|---|
| 1 | Pond bowl A(z) = A₀(1 − z/zmax)^p | FIXED | Correct in the layers model and the map, whose volumes agree within 0.5–1.1%. **The well-mixed model treated a layered pond's warm top as a straight-sided slab** (bug M1). |
| 2 | Light, Kd ≈ 1.7/Secchi, Carlson Secchi | PASS | Formula and layer-averaged light limit exact. The 1.7 is cited to Carlson 1977, but it is the Poole & Atkins factor (label item). |
| 3 | K(z) = κu*z(1 − z/D) | PASS | κ = 0.41, D = stirred depth, floor K_ml_min, Hondzo–Stefan below (cm²/s → m²/s conversion correct). |
| 4 | Counterflow u = u_s(3ζ² − 2ζ), u_s = 1.5u*/κ | PASS | ζ is measured from the bed. Surface flow is downwind, and the depth integral is exactly 0. |
| 5 | Tilt u*²/(g′h), Wedderburn g′h²/(u*²L), upwelling, set-up time | PASS | Upwelling is on the upwind side. Set-up time is a quarter seiche period, L/(2√(g′h₁h₂/(h₁+h₂))). |
| 6 | Stokes rise g(ρw − ρc)d²/(18μ) | PASS | Uses diameter. Viscosity depends on temperature (Vogel). Positive means up. 200 µm at 28 °C gives 1.05 m/h with Reynolds number 0.07, so Stokes holds. Colony density is fixed at 985 kg/m³ (no day–night buoyancy cycle; the page already warns about this). |
| 7 | Visser random walk | **FIXED** | The formula was right, but with 30–180 s steps and reflecting boundaries it failed the well-mixed test (bug H2). It has been replaced by an exact step for this mixing profile; see H2. |
| 8 | Peroxide dC/dt = −kC, k = θ^(T−20)(k₀ + b·Chl) | PASS | Exact exponential each step; half-life tests reproduce. θ = 1.078 (Pedersen 2019); b is labelled ESTIMATE, honestly. |
| 9 | Diquat binding db/dt = kC(1 − b/bmax) | FIXED | The exact solution over a step is correct and matches a Runge–Kutta check. The same function is used in all three models. The bound share is capped at dq_access (60%). A rounding overshoot made C slightly negative (bug L1). |
| 10 | GUTS damage and IT/SD kill rules | PASS | Constant and single-dose lab calibrations both give exactly 50% effect at EC50 and test length, for both rules. |
| 11 | Share knocked down 1/(1 + (m/Dmax)^β) | PASS | Gives 0 at Dmax = 0, 0.5 at Dmax = m, and approaches 1 for Dmax ≫ m. The map's per-colony toughness draws are log-logistic with the same median and shape. |
| 12 | Copper hardness (H/100)^0.9422 | PASS | EPA acute slope (40 CFR 131.38). Hardness is clamped to 10–400 mg/L. Hlab = 100 is honestly labelled ESTIMATE. |
| 13 | Heat budget | PASS | Haurwitz 1098·sinh·e^(−0.057/sinh). Brutsaert 1.24(e/T)^(1/7) with a cloud factor, capped at 1. Guseva bulk coefficients. The free-convection velocity has correct units. Markfort shelter is the overlap of two shifted circles. Minor: incoming longwave is not reduced for the water's ~3% reflectance, so about +11 W/m² of extra heat. |
| 14 | Mixed-layer energy and carry-over | PASS | The energy to mix the next layer in, gΔρ·V₁V₂/(V₁+V₂)·Δz, is exact. Wind energy ck·ρ·u*³·Δt·A₀. Unused energy carries over and is dropped when a shallower layer forms. Minor: stored energy never decays, so about 11 cloudy, light-wind days can add up to one extra layer of deepening. There is no separate convective-energy term (night cooling mixes only by convective adjustment). |
| 15 | Swirl streamfunction, Pollock face fluxes, sideways mixing | **FIXED** | The streamfunction and face-flux interpolation are right; positions advance by forward Euler, up to half a square per step. Neutral colonies piled up downwind (bug H1); now fixed, see H1. |
| 16 | Toxin: total vs dissolved, EPA 8, WHO 1 and 24 µg/L | PASS / FIXED | Toxin budgets close exactly. Threshold values are right and are compared with total toxin. Sunlight breakdown of dissolved toxin is now one rule in all three models and the Python reference (L2). |
| 17 | Oxygen | FIXED | Light-limited, self-shaded photosynthesis, respiration, reaeration (Cole & Caraco 1998 with the Schmidt-number exponent switching at 3.7 m/s) and decay of dead bloom all check. **The well-mixed model dropped sediment oxygen demand when layered** (bug M2). |
| 18 | Latin hypercube, 40 runs (now 200) | PASS | One draw per stratum for every parameter, log space for rates, fixed seed reproduces, largest rank correlation between parameters 0.50. The `kill_struct` note wrongly said half the runs use SD (bug L3). |
| — | SOURCED values against their papers | PASS / FIXED / CNV | 45 SOURCED entries checked. Most verified. Fixed: 2 ranges relabelled, 2 citations fixed (dinst_cap, Kinley DOI), 4 values relabelled ESTIMATE "citation pending", 4 note errors corrected. 9 could not be opened. Details in §5. |

### Section 4: numerical checks (example pond)
| Check | Status | Note |
|---|---|---|
| Time step halved and quartered | FIXED | Median knock-down 64.2 → 64.0 → 63.9%. Lowest oxygen 3.64 → 3.65 → 3.66 (median), 4.15 → 4.13 → 4.15 (layers). The layers model's central run moved 64.1 → 66.8 → 66.7%: the 10-minute step cost about 2.7 points. **The step is now 5 minutes (converged).** Lowest total toxin 17.3 → 16.1 µg/L. |
| 12 / 17 (default) / 20 / 40 layers | PASS / note | Median knock-down 63.1–64.2%. Layers-model oxygen 4.15–4.38 mg/L; map oxygen 4.44–4.77. "Highest concentration in any one layer" depends on layer thickness by definition (14.6 at 12 layers, 19.7–20.0 otherwise). |
| Map colony count and seeds | PASS | Map knock-down SD across seeds is 0.8 points at 1,000 colonies and 0.7 at 2,000. Ten seeds give 62.4–66.0% (the page's seed gives 62.4). |
| **Ensemble size** | **FIXED (200 runs)** | With 40 runs the median knock-down depended on the seed: 49.6–66.1% for seeds 1–5. Now 200 runs. After all fixes, 200 runs give 61.2–67.0% across seeds 1–5 and the page's seed; 1,000 runs give 60.7% (5th–95th percentile 5.3–98.9). The lowest-oxygen median is stable at 3.5–3.7. **Its 5th percentile is still seed-sensitive: 0.64–1.57 mg/L, and 1.19 at 1,000 runs.** The band is labelled "5th–95th percentile of 200 runs". |
| Stability limits enforced | PASS / FAIL | Vertical transport in the layers model and the map is implicit, so it is stable without a step limit. Map sideways transport is explicit and its limit is enforced by sub-stepping (step ≤ 0.9 ÷ total outflow rate). Map colonies are limited to half a square per step. The colony up-and-down step is now exact at any length (H2). The side slice now sub-steps per column: half a column, and under its own mixing time (H1). |
| Mass balance, all 13 product × method combinations, all 3 models | PASS | With breakdown switched off, layers-model product closes within 2×10⁻¹³ and cells within 5×10⁻¹³. Map and slice product within 9×10⁻¹² and toxin within 1×10⁻¹⁰. Layers-model toxin stays within its exact bounds. There is no explicit oxygen budget output, so oxygen was checked term by term, not by a closure sum (CNV for a closure number). |
| Zero dose → no kill, no toxin release | PASS | All 7 products, all 3 models: zero knock-down, zero release. Treated and untreated oxygen identical. |
| Fully mixed → layers model ≈ well-mixed | PASS | 1 m pond, 15 mph wind, Planktothrix: 24-hour exposure 0.235 vs 0.237 mg/L; knock-down 84% vs 81%; oxygen 6.0 vs 5.8; starting toxin equal. |
| No wind → layering on sunny days | PASS | Layers every afternoon, up to 10.8 °C top-to-bottom. The afternoon layer sits at the 0.72 m floor (`h_floor`, an ESTIMATE), so in calm weather that assumed value sets the layer thickness. |

### Section 6: dataset
| Check | Status | Note |
|---|---|---|
| Target EC50s, all 6 products × 3 genera | PASS | Every value matches the Nov 1 matrix. |
| Diquat corrected values | PASS | 0.101 target (√(0.098 × 0.105), Peterson 1997 Table 5) and 0.492 green alga. The old 0.074 and 0.032 appear nowhere in the simulator. |
| Copper green alga | FIXED | Now 1.873, as in the matrix (your decision 1). |

### Section 7: the web page
| Check | Status | Note |
|---|---|---|
| Console errors | PASS | None, online or offline. Offline, the only message is the blocked Google Fonts request; the page falls back to system fonts. |
| Workers on the deployed path | PASS | `index.html` served over HTTP loads `sim-worker.js` from the same origin and finishes all three runs. |
| Every input reaches the model, with the right units | PASS | 30/30 inputs, including °F→°C, ft→m, mph→m/s and µg/L→mg/L for flumioxazin. |
| Inputs move outputs the expected way | PASS / note | 13 of 14 directions as expected. Overcast instead of sunny *raises* the lowest oxygen (4.2 → 5.2), because the untreated pond is balanced to the same repeated cloudy day. That is a stated assumption, not a code error. The sentence is now on the page (oxygen note) and in the guide. |
| Units on screen | FIXED | mg/L, µg/L, °F, ft and acres throughout. One metric leak: "Starts in the top 15 cm" (bug L4). |
| Weather fallback offline | PASS | The browser test covers a weather-service error and an out-of-range date; fully offline the idealized day runs. |
| "Every number in the model" list matches the code | PASS | Built from the code tables at load time: 124 of 125 parameters, all status labels identical. `ec50_z`, the random draw, is left out on purpose. |
| Solar clock | note | Clock-to-solar-time shift is fixed at 1.33 h (daylight time). With real weather outside daylight-saving time the sun runs about an hour off. |

## 3. Bugs, most severe first

### High (fixed in the second pass, with your go-ahead)

How both were measured: a 1-acre round pond, neutral *Planktothrix* (no float, no sink, no kill), wind from the west, hours 12–48. The number is the colony density ÷ water volume in fifths from upwind to downwind, averaged over 6 seeds. It should be 1.00.

| Case | Map before | Map after | Side slice before | Side slice after |
|---|---|---|---|---|
| 3.3 ft deep, 18 mph | 0.96–**1.32** | 0.97–1.08 | **0.15–3.40** | 0.91–1.05 |
| 5 ft, 11 mph | 0.97–**1.28** | 0.98–1.11 | **0.51–1.88** | 0.93–1.06 |
| 8 ft, 4.5 mph | **0.89–1.16** | 0.96–1.07 | **0.73–1.27** | 0.97–1.02 |
| 3.3 ft, near calm (0.7 mph) | — | 0.98–1.01 | — | — |

**H2. Map and side slice: the colony random walk's step was too long. FIXED.**
- **The problem.** Started evenly, colonies ended up 20–33% over-represented in the top and bottom 5% of the stirred layer: 1.08–1.27× in the top 7%, where spray lands.
- **Why shortening the step wasn't enough.** It converges very slowly. Ten times shorter steps still left 4–8% too many colonies at the boundaries, and boundary-adaptive steps did no better (scratch tests `h2/coef.js`, `h2/adapt.js`).
- **The fix** (`sim-2d.js`, new `vertMove`, used by both the map and the slice):
  - The mixing profile K = κu*·z(D − z)/D is exactly a random walk over a sphere, with z = D(1 − cos θ)/2.
  - Each step turns the sphere by a random angle (Rayleigh-distributed, variance 4κu*Δt/D) in a random direction.
  - Turning a sphere keeps an even spread exactly even at any step length, and the mean and spread of each step match Visser's.
  - The calm-water floor K_ml_min is added as a separate even walk. That differs from the max(K_ml_min, profile) the concentrations use by at most 10⁻⁵ m²/s, under 1% of mid-layer mixing.
- **Checks:**
  - every depth band is within ±2% (noise level) at up to 30× the old step;
  - mixing speed matches a fine-step reference (a surface release reaches mean depth 0.33D vs 0.31D after one mixing time);
  - top 7% of the map: 0.99× its share (was 1.08–1.10).
- **Run time:** no shorter steps were needed, so H2 cost nothing.

**H1. Map and side slice: colonies that should follow the water piled up on the downwind shore. FIXED.**
- **Map** (`moveParticles`):
  - The within-sublayer part of the current (surface skin, counterflow shear, swirl shape) now fades to zero across a shore square toward each land face, the way the face fluxes do.
  - It brings its own small up-and-down flow, worked out from the same profiles, so the colonies' flow keeps the water's volume. That flow is zero at each sublayer's top and bottom, because the part averages to zero over the sublayer.
  - Before, it was added in full right up to the land, and a step onto land was refused.
- **Side slice** (`runSlice` `moveParticles`):
  - Colonies now move with the slice's own face flows (Pollock interpolation), with the up-and-down speed from the same streamfunction. Before, the sideways speed came from each column's own stirred depth and did not keep the water's volume.
  - Sub-steps keep each step under half a column and under the column's own mixing time. That second limit matters: in shallow end columns a longer step re-mixes the colony's depth within one step, it feels the current at a random level each time, and drifts to the closed end. One standalone test put 226 of 400 colonies in one column.
- **A simplification, disclosed on the page.** In the slice, the 1 cm surface skin's within-level shape was dropped. The skin's transport is still in the top level's flux, so colonies at the very top move at the level's average speed: about 1 cm/s instead of 8 cm/s at 18 mph. Following the skin itself needs about 2-second steps (29 s for the slice alone).
- **Left over:** in strong wind, the map's upwind and downwind fifths are up to about 10% too full (1.08–1.11 at 11–18 mph), and the slice's up to about 9%. In near-calm water both are even. This is disclosed in the page footer.
- **Regression tests** (`map.test.js`, new section):
  - the up-and-down step on its own: 8 cases, every depth band within 4%;
  - map and slice, three seeds: each fifth within 15% (before: up to 32% and 240%);
  - the map's top 7% holds its share within 10%.
- **A test I changed.** "Floating colonies drift downwind (east)" was one seed's mean drift > 1 m. That measure swings from −0.9 to +5 m between seeds, and −0.8 to +2 m in calm water, so it was mostly noise. The new code failed it on the page seed. It is now the share of top-15 cm colonies on the downwind half, three seeds, wind vs calm: 55.3% vs 48.7% (original code 57.6% vs 49.0%). Some of the smaller drift is real: the old step held about 20% too many colonies in the fast top centimetre.
- **Run time** (headless Chromium on this Mac, an Apple M4 Pro, from page load): map 1.0 → 2.3 s, slice 3.3–3.7 → 5.1 s. In Node, map plus slice 5.3 → 7.0 s.

### Medium

**M1. Well-mixed model: a layered pond's warm top was a straight-sided slab, not the top of the bowl. FIXED.**
- Before: concentration factor = mean depth ÷ layer depth. In a 3 m pond with a 1 m warm layer that gives 1.2; the bowl the other two models use gives 1.57, so the concentration was 24% low.
- A warm layer deeper than the mean depth counted as the whole pond. The example's 1 m layer in an 8 ft pond was called fully mixed; its bowl factor is 1.37.
- Fix (`sim-core.js` `geometry`, mirrored in `reference/sim.py`): the warm layer holds the share 1 − (1 − h/zmax)^(p+1) of the water; concentration factor = 1/share; average thickness = mean depth × share.
- The old test asserting the slab rule (`verify.test.js`, "concentration factor = mean depth ÷ mixed layer") encoded the bug and was replaced.
- Regression tests: concentration factor equals the bowl volume ratio found by a 200,000-step numerical sum; a 1 m layer in an 8 ft bowl stays layered with factor > 1.3.
- Numbers changed: only the well-mixed column of the page's three-model table. Example knock-down 58.9% → 68.6%; lowest oxygen 4.00 → 4.03 mg/L.

**M2. Well-mixed model: no sediment oxygen demand when layered. FIXED.**
- The warm layer of a bowl touches part of the bed: 1 − (1 − h/zmax)^p, 46% for a 1 m layer in a 3 m pond. The layers model counts it; the well-mixed model used 0.
- Oxygen equilibrium was 7.80 mg/L against 7.02 in the layers model.
- Fix: the same bed share. Regression test: the well-mixed oxygen equilibrium equals the layers model's `doEquilibrium` to 10⁻⁹ in a layered 3 m pond.

**M3. Ensemble too small for the stated ranges. FIXED (your decision 3).**
- 200 runs, and the page labels every band "5th–95th percentile of 200 runs".
- The runs selector offers 40, 100 or 200; the default is 200.
- 200 runs take 7.2 s in the browser on this laptop (0.9 s for 40). The map shows first, and the tiles fade until the runs arrive.

**M4. Layers model: the 10-minute step cost 2.7 points of knock-down in the central run. FIXED (your decision 4).** `DT` is now 300 s. Halving it again changes the central run by 0.1 point.

### Low

**L1. Diquat binding could leave a tiny negative concentration. FIXED.**
- `diquatSorb` capped the bound amount at T − b, which in floating point can exceed C by one rounding step. The result was −5.8×10⁻²⁰ mg/L, and the column test failed.
- Fix: the step never binds more than C (JS and Python).
- Regression tests: 200,000 random cases never go negative; the exact failing ensemble run is rechecked.

**L2. Sunlight breakdown of dissolved toxin was in only two of the four codes. FIXED (your decision 5).**
- **One rule everywhere.** The well-mixed rule (half-life `mc_photo` = 105 days per metre of stirred depth) is the same as a removal speed of ln 2 / `mc_photo` metres per day acting through the surface. That speed is now applied to the dissolved toxin in the stirred top water of the layers model, each map square and each slice column, and nowhere under the thermocline. In an unlayered pond it gives exactly the well-mixed rule. The Python reference already had it.
- **Tests:**
  - 2-day loss in a windy 3.3 ft pond: layers 3.25%, rule 3.25%;
  - map 3.25%;
  - slice within 5% of the rule at its own mean depth (the slice runs through the deepest point);
  - the "no breakdown" test now switches off sunlight as well as bacteria.
- **Effect on the example:** lowest total toxin over 14 days 17.3 → 16.0 µg/L; still above 8 µg/L throughout.

**L3. Stale note: "Half the uncertainty runs use SD."** Every run has used IT since Oct 21. FIXED (note text only). The page's source list shows this note.

**L4. "Starts in the top 15 cm" on the timeline. FIXED:** now in inches.

**L5. Labels and citations. FIXED where possible (your decision 6).** See §5.

**L6. Solar clock fixed at daylight time** (about 1 h off outside daylight-saving time with real weather). Not changed.

**L7. Small physics omissions** (longwave reflectance, stored wind energy never decaying). Not changed; worth a line in the limitations.

## 4. Headline numbers, before and after

Inputs, read from the page itself: 1 acre, 8 ft deep, round, deepest in the middle, 82 °F water, pH 8, alkalinity 40, 10 NTU mineral (typical clay), 4.5 mph wind from the southwest (225°), open banks, sunny, air 90/72 °F, mid-July (day 196), 100 µg/L chlorophyll (heavy *Microcystis* bloom), typical toxin, no bloom history, liquid hydrogen peroxide sprayed on the whole pond at 3 mg/L at 8 AM, layering automatic, seed 20261019 (the page's default).

**Old** = the published Oct 22 build (40 runs). **New** = after every fix in this review, with the page's defaults: 200 runs, the page's seed, 5-minute layers steps. Use the **New** column for the slides and paper.

| Headline | Old | New | How firm the new number is |
|---|---|---|---|
| Top-water peak right after spraying | 26.2 mg/L | **26.2 mg/L** | The map's highest top-water square in the first frame, as stored for display (steps of about 3.7%). The layers model's top layer peaks at 19.7 mg/L both times. |
| Knock-down at 48 h, median of runs | 64.2% | **67.0%** | Moves with the random seed: 61.2–67.0% for seeds 1–5 and the page seed at 200 runs; 60.7% at 1,000 runs. Safest wording: "about 61–67%". The 2.7-point rise is mostly the shorter layers-model step (M4); the rest is the seed. |
| Knock-down 5th–95th percentile | 7.6–98.1% (40 runs) | **4.3–98.3% (200 runs)** | Seeds give 3.6–5.7 to 97.8–99.1; 1,000 runs give 5.3–98.9. "About 5% to 98%." |
| Map's knock-down at 48 h (one central run) | 62.4% | **63.5%** | Up 1.1 points from the H1/H2 fixes, which spread the floating colonies more realistically. Earlier map seed SD about 0.8 points. |
| Total toxin vs EPA swimming level (8 µg/L) | Above 8 all 14 days (lowest 17.3 µg/L); starts 53.7 | **Above 8 all 14 days (lowest 16.0 µg/L); starts 53.7** | Robust: the median run is above 8 at day 14 for every seed. Lowest down 1.3 µg/L from sunlight breakdown now in the layers model (L2). |
| Lowest-hour oxygen, median of runs | 3.64 mg/L | **3.67 mg/L** | Stable: 3.53–3.75 across seeds; 3.57 at 1,000 runs. |
| Lowest-hour oxygen 5th–95th percentile | 1.62–4.97 (40 runs) | **1.57–5.17 (200 runs)** | **The low end is seed-sensitive:** 0.64–1.57 across seeds, 1.19 at 1,000 runs. Safest wording: "as low as about 1 mg/L in the worst 5% of runs", low enough to kill fish. The 95th percentile is 5.1–5.5. |
| Lowest oxygen, map (central run) | 4.52 | **4.53** | |
| Lowest oxygen, layers model (central run) | 4.15 | **4.13** | |
| (page table) well-mixed knock-down | 58.9% (40 runs) | **70.8%** (200 runs) | Changed by fix M1 (68.6% at 40 runs) and the ensemble size. |
| (page table) well-mixed lowest oxygen | 4.00 | **3.76** | Fix M1 (4.03 at 40 runs) and the ensemble size. |

Suggested slide wording: "In the example pond, a 3 mg/L peroxide spray knocks down a median of about 61–67% of the bloom by day 2 (5th–95th percentile about 5–98% across 200 model runs). Total toxin stays above the EPA swimming level (8 µg/L) for all 14 days. The lowest-oxygen hour has a median of 3.7 mg/L but falls to about 1 mg/L in the worst 5% of runs."

## 5. Decisions (made Nov 8, 2026) and what was done

1. **Copper green-alga value: 1.873 mg/L.** Done in `sim-core.js`: note and endpoint text updated; source Tsai 2016, verified by Reviewer B. The column test now checks 1.873. `README.md` and the guide say why it changed back.
2. **Map bugs H1 and H2: fixed**, with regression tests on the map and in the side slice, and run time measured (§3). The leftover is disclosed in the page footer, with the slice's skin simplification also in the slice caption.
3. **Ensemble: 200 runs**, band labelled "5th–95th percentile of 200 runs" on every tile, and "5th–95th percentile of runs" in chart legends. The defaults in `sim-column.js` and on the page are 200.
4. **Layers-model step: 300 s.**
5. **Toxin sunlight breakdown: one rule in all three models and the Python reference** (L2).
6. **Citations.** No citation was added that I had not opened.
   - **Kinley et al. 2017:** link changed to 10.1016/j.ecoenv.2017.08.010, the DOI you gave. Crossref confirms Kinley, Iwinski, Hendrikse, Geer & Rodgers, "Cell density dependence of *Microcystis aeruginosa* responses to copper algaecide concentrations…", *Ecotoxicology and Environmental Safety* 145:591–596. The label now carries the volume and pages.
   - **`pK1` / `pK2`:** relabelled ESTIMATE, "Standard value, citation pending."
   - **`kd_secchi` (1.7):** I tried to open Poole & Atkins 1929 and couldn't. It isn't in the Marine Biological Association's open archive, and the 1929 volume is past what Cambridge Core's issue list returns. So the citation stays on Carlson 1977, with ESTIMATE and "Standard value, citation pending" in the note.
   - **`mc_typ` (0.4 µg toxin per µg chlorophyll):** I tried to open WHO 2003, but WHO's repository refused (HTTP 403) for both the record and the PDF. So it was not moved to WHO 2003. It's relabelled ESTIMATE, source set to the project notes, with "Standard value, citation pending" and an explanation in the note.
   - **`dinst_cap`:** kept on Weenink 2015. Reviewer B opened it and quoted "typically 0.1 up to 1.2 mg/L instantaneously".
   - **Sky-emissivity cloud factor (1 + 0.22·cc²):** not a table parameter. Its code comment now says ESTIMATE, citation pending.
   - **Note corrections from Reviewer B's reading:**
     - `r_meanmax`: 0.41 is the whole Seekell dataset, and there is no "0.34 global";
     - `fc_c2`: natural sand grains, not angular;
     - Lang & Scavia: 1987;
     - `mc_cu_slow`: the 1 mg/L switch is an extrapolation.
   - **Still SOURCED but could not be opened** (paywalled or blocked; listed below for you): Guseva 2023 Table 1, Marsico 2015, Welgamage 2012, Lang & Scavia 1987, Carlson 1977, Calomeni 2014, Francis-Floyd, Islam's endothall rate.
7. **Guseva et al. 2023: values left as they are, marked "could not verify Table 1".** Please check these three against Table 1:

   | Code value | What it is | Abstract's high-wind value |
   |---|---|---|
   | 1.7×10⁻³ | drag coefficient | 1.6×10⁻³ |
   | 1.3×10⁻³ | heat (sensible) transfer coefficient | 1.4×10⁻³ |
   | 1.1×10⁻³ | evaporation (latent) transfer coefficient | 1.0×10⁻³ |

   They are used in the layers model's heat budget (`sim-column.js`).
8. **Overcast-day oxygen sentence: added.** It's in the page's oxygen note (from `sim-core.js` warnings) and in the guide, under "Overcast idealized days".

### SOURCED values against the cited sources (Reviewer B)

All 45 SOURCED entries were looked up, and every DERIVED calculation was redone.

**Fixed here (labels and citations only; no value changed):**
- `mc_kbio` (toxin breakdown by bacteria, 0.155–1.0 per day): was "SOURCED range". Christoffersen et al. 2002 measured 0.485–1.057 per day with no lag. The slow end and the centre are not from that paper. **Now "SOURCED upper end, ESTIMATE rest".**
- `sod20` (sediment oxygen demand, 0.5–1.8 g/m²/day): was "SOURCED range". Hammermeister 1982 supports the centre (summer means at 20 °C were 1.01 and 1.11). 1.8 is the highest single reading at ambient temperature, and 0.5 is not in the paper. **Now "SOURCED centre, ESTIMATE range".**
- `dinst_cap` (1.2 mg/L instant peroxide demand): SOURCED but cited to the blueprint. Weenink 2015 says "typically 0.1 up to 1.2 mg/L instantaneously". **Citation changed to Weenink 2015.**

**Status of the remaining items (see decision 6 above):**
- `pK1` / `pK2`: correct values, blueprint citation. Now ESTIMATE, citation pending.
- `kd_secchi`: the 1.7 factor is Poole & Atkins, not Carlson. Poole & Atkins could not be opened, so it is now ESTIMATE, citation pending.
- `mc_typ`: the pairing is from WHO 2003, not WHO 2020. WHO 2003 could not be opened, so it is now ESTIMATE, citation pending.
- Kinley et al. 2017: the DOI 10.1016/j.ecoenv.2017.09.061 was a mercury paper (Tran et al.). Now 10.1016/j.ecoenv.2017.08.010, confirmed through Crossref.

**Smaller text errors in notes (all corrected Nov 8):**
- `r_meanmax`: Seekell 2021 has no "0.34 (global)", and its 0.41 is for the whole dataset, not Sweden alone.
- `fc_c2`: the source says "natural sand grains", not "angular".
- Lang & Scavia is dated 1987, not 1986.
- `mc_cu_slow`: the switch at 1 mg/L copper is an extrapolation; the study tested 1 and 5 mg/L only.

**Possible mismatch, could not verify: Guseva et al. 2023 transfer coefficients.**
- Table 1 couldn't be opened; every copy was blocked.
- The abstract's high-wind values are 1.6×10⁻³ for drag, 1.4×10⁻³ for heat and 1.0×10⁻³ for evaporation. The code uses 1.7×10⁻³, 1.3×10⁻³ and 1.1×10⁻³.
- Please check Table 1 by hand before the paper.

**Cloud factor not in the cited sources.** The sky-emissivity cloud factor (1 + 0.22·cc²), described as the "TVA" factor, appears in none of the cited sources. GLM pairs Brutsaert with (1 + 0.275·C). Now marked ESTIMATE, citation pending, in the code comment.

**Verified:**
- **Holgerson 2022:** < 4.17 ha and > 2 m "rarely mixed", on maximum depth, as the code uses it.
- **Haurwitz:** 1098 and 0.057 (via Reno et al. 2012).
- **Brutsaert:** 1.24 and 1/7 (via GLM).
- **Markfort 2010:** about 50 canopy heights.
- **Wu 1975:** 0.53 (via Wu's later paper; the original and its 0.4–0.7 range were not seen).
- **Visser 1997.**
- **Poovey & Getsinger 2002:** 35 and 100 meq/100 g.
- **Pedersen 2019:** θ = 1.078, recomputed from its two rates (aquaculture water).
- **Tsai 2016:** green alga 0.192 / 1.873 / 4.619 mg/L at 5×10⁴ / 5×10⁵ / 5×10⁶ cells/mL; *M. aeruginosa* 0.009 / 0.063 / 0.112; chelated copper 0.101 and 2.579 at 10⁶.
- **Weenink 2022, Table 1:** all six values and the 35.9% field drop.
- **Peterson 1997, Table 5:** 0.098 and 0.105 (geometric mean 0.1014), green alga 0.492, *Anabaena* 0.005, 6 h + 16 h test.
- **Regulatory values:** EPA hardness slope 0.9422 (acute), EPA 8 µg/L, WHO 1 and 24 µg/L, dog value 0.2 µg/L.
- **Formulas:** Carlson TSI constants; Cole & Caraco 2.07 + 0.215·U^1.7; Eppley 1.066 (a growth-rate envelope, here applied to photosynthesis and breathing).
- **Other values:** Welker 90–120 days per metre, Islam 5–11-day lag, Wilson & Wu 1–2-day half-lives, Boyd 0.028 mg/L, Zhao 985 kg/m³, USDA 150/175 g/L, product label strengths and densities.
- **DERIVED arithmetic:** every calculation reproduces.
- `ck` = 0.23 (labelled ESTIMATE, "not re-checked") matches GLM's value and could be upgraded to SOURCED.

**Could not verify (paywalled or blocked):**
- Guseva 2023 Table 1
- Marsico 2015 (`h2o2_kab`)
- Welgamage 2012 (`mc_lag`)
- Lang & Scavia (`K_floor` 1.4×10⁻⁷, the textbook molecular value)
- Carlson 1977's 1.7
- Calomeni 2014 (0.18, 0.10, 3.0, 1.18 mg/L)
- the Francis-Floyd oxygen thresholds (dead link)
- Islam's endothall rate (reported as times to 25/50/75% loss at about 18 °C, so it can't be re-derived exactly)

## 6. Final test counts

| Suite | As delivered | After first pass | After second pass (final) |
|---|---|---|---|
| verify.test.js | 70/70 | 74/74 | **74/74** |
| column.test.js | 95/96 | 96/96 | **96/96** (copper check now 1.873) |
| map.test.js | 107/107 | 107/107 | **114/114** (7 added for H1, H2 and the sunlight rule; the floating-drift and no-breakdown checks rewritten as described in §3) |
| JS total | 272/273 | 277/277 | **284/284** |
| Python cross-check | 35 scenarios, 1.2e-10 | same | **35 scenarios, worst 1.2e-10** |
| Browser test (page_weather_test.py) | 23/23 | 23/23 | **23/23**. Its "ready" check now also waits for the uncertainty runs, which finish after the map with 200 runs; without that it read the previous run's notes. |

Files changed (all uncommitted, all under `simulator/`):
- **Model code:** `sim-core.js`, `sim-column.js`, `sim-2d.js`, `reference/sim.py`.
- **Tests:** `tests/verify.test.js`, `tests/column.test.js`, `tests/map.test.js`, `tests/page_weather_test.py`, `tests/port-fixture.json` (regenerated).
- **Page:** `tools/page.src.html`.
- **Generated:** `params.json`, `index.html`, `CyanoSelect-Pond-Simulator.html` (all regenerated or rebuilt).
- **Docs:** `HOW-IT-WORKS.md`, `README.md`, and this file.

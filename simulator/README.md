# CyanoSelect pond treatment simulator: well-mixed, layers and map

New here? Read [HOW-IT-WORKS.md](HOW-IT-WORKS.md) first: every piece in plain English, with the example pond's numbers.

The simulator predicts what one algaecide treatment does in a pond:
- how much product stays in the water over time, and where (top, bottom, where the bloom is)
- how much of the bloom gets knocked down
- how much microcystin is released and how fast it breaks down
- what happens to dissolved oxygen
- how close the green alga, water fleas and fish come to their lab effect levels

The page has a playable **pond view** with three tabs: a **map from above** (currents, product spreading, colonies drifting), a **side slice** along the wind, and the **layers** cross-section. A **predicted timeline** lists what happens when. Every chart carries an uncertainty band from 20–100 runs.

**Weather:** real hour-by-hour weather for the pond's place and treatment date (Open-Meteo), or one idealized day you enter. Finding the place also lets you look up the pond's mapped outline and area (USGS National Hydrography Dataset, US only).

**Optional measurements:** average depth, where the deepest water is, bottom water temperature, Secchi depth, hardness, measured total microcystin, peroxide half-life in your pond water, and your own EC50. Each replaces one of the model's estimates (see "Your own measurements" in HOW-IT-WORKS.md).

**Everything it shows is a model prediction.** It is not a measurement and not a treatment recommendation. Follow the product label and state rules. No lab or field testing by the CyanoSelect team is behind these predictions yet.

## The two models

The page has a switch between them. Both run on every input change.

**Layered pond (Phase 2, default)** splits the pond into 12–40 horizontal layers and works out:
- water temperature from an hourly heat budget (sun, sky, air, humidity, wind, shelter), driven by real weather or a repeated idealized day
- when the pond layers and when it turns over. The stirred depth is what the wind's energy and night-time cooling actually mix; wind energy that can't mix the next layer down in one step carries over to the next. (Until Oct 20, 2026 it came from a density-gradient cutoff, which wrongly mixed deep ponds even in calm air and made stronger wind layer a 5 m pond.)
- where the product starts: sprayed on top, sunk to the bottom (dense liquids), or as crystals/granules that sink while they dissolve and finish on the bottom
- how cells and product mix between layers, with buoyant colonies rising
- kill driven by what the cells actually get, weighted by where the cells are

**Well-mixed (Phase 1)** treats the treated water as one well-mixed layer.

**Map and side slice (2-D)** run on top of the layered model, which supplies the stirred-layer depth, mixing profile, temperature and bloom profile hour by hour. They add:
- your pond's shape (preset, drawn, or the USGS mapped outline), with depths matched to the same bowl
- with real weather, wind speed and direction that change every hour; the currents, surface skin and tilt follow them
- wind-driven currents: a counterflow (top water downwind, return flow underneath) plus the topographic swirl (shallow edges downwind, deep middle upwind), from a streamfunction solve
- sideways mixing, and 4 stirred sublayers plus the cool bottom layer per map cell
- where you treat: presets relative to the wind, or painted on the map
- about 1,000 tracked colonies that drift, float, mix and carry their own damage and toughness
- dissolved toxin, the oxygen shortfall and dead bloom per square and layer: knocked-down colonies leak toxin and carbon where they were knocked down, at the layers model's rates; the bed uses oxygen where the stirred water touches it; a switch shows product, toxin or oxygen
- the thermocline tilting in wind (steady balance u\*²/(g′h), the one behind the Wedderburn number), with upwelling at the upwind shore when it reaches the surface
- the fast surface skin: drift of 0.53 × the air-side friction velocity at the surface (Wu 1975), fading over about 1 cm
- a dense layer from an injection into water that isn't layered: it slides toward deeper water as a gravity current, mixes into the water above, and is stirred in at once when wind beats its density

Fixed Oct 21, 2026 (from a hostile review of the whole model):
- the morning water-temperature match now shifts only the water the morning's stirring reached, not the whole column (with real weather the old way could put 39 °F water at the bottom of a July pond); a mismatch over about 4 °F is reported
- map colonies that don't float no longer pile into shallow water (a step over shallower water is now refused, as in the side slice)
- toxin: the page tracks all toxin, inside cells and out, and compares that with the EPA and WHO levels; dissolved toxin is shown separately
- other organisms are judged the way their lab test was run, in the stirred top water: a dosed-once test against the highest 1-hour average, a steady test against the worst average over the test's length; animals near the bottom get their own margin (the layers model used to use the peak of a 6-inch spray layer)
- the runs use one kill rule (tolerance); the other is shown as a scenario instead of being mixed into the band, and the caption gives the central run's percentile
- copper green-alga value: the sparse-density one (0.192 mg/L, Tsai et al. 2016); changed back on Nov 8, 2026 to 1.873 mg/L, the same test density as the copper target value, as in the dataset of record
- the map's swirl is pushed with 1.5 × the wind stress (bed drag), not 1 ×
- peroxide EC50s are calibrated on the lab's own test (one dose left to fade, at an estimated 0.46 per hour), not as if held steady; the example's median knock-down went from 4% to about 45%
- oxygen is hour by hour: the living bloom photosynthesizes (light-limited, self-shaded) and breathes, the rest of the pond's breathing balances the untreated pond, and a knock-down cuts the bloom's oxygen; the page reports the lowest hour instead of adding a flat pre-dawn drop

Fixed Nov 8, 2026 (AI-assisted code review, SIMULATOR_REVIEW.md; not peer review):
- map and side slice: colonies that should follow the water no longer pile up in the top and bottom few percent of the stirred layer (new up-and-down step, exact for the mixing profile) or on the downwind shore (within-layer current fades to zero at land; the slice moves colonies with its own face flows, in short enough steps)
- well-mixed model: a layered pond's warm top is the top of the bowl, with its share of the bed's oxygen demand
- layers model: 5-minute steps (was 10); 200 uncertainty runs (was 40), shown as the 5th-95th percentile
- toxin broken down by sunlight in all three models with one rule (it was in the well-mixed model only)
- copper green-alga value matched to the target value's test density (1.873 mg/L)
- labels: pK1/pK2, Kd×Secchi and toxin per chlorophyll relabelled ESTIMATE (citation pending); Kinley et al. 2017 link fixed

Fixed Oct 22, 2026 (the rest of the review's code fixes):
- copper effect levels for fish and water fleas follow water hardness by the EPA slope (0.9422); hardness is a new optional input, otherwise taken as the alkalinity; lab-water hardness behind the ECOTOX values assumed 100 mg/L (ESTIMATE); soft-water warning
- heat loss: Guseva et al. 2023 light-wind transfer coefficients, a calm-air (free convection) term as in GLM, sky emissivity capped at 1; real-weather July runs about 6 °F cooler
- idealized day: sunlight is 75% of clear sky when sunny (ESTIMATE, 60-90% across runs), no longer scaled to hold the typed temperature, so the water starts at the reading and follows the weather
- stirring energy uses each layer's own volume and the stirred layer's centre of mass (bowl, as in GLM)
- tree shelter by Markfort et al. 2010 (about 50 tree heights) for the pond's size, with a 20% floor for fully sheltered ponds (ESTIMATE)
- diquat: clay binds it at a rate wherever the two meet, up to 60% of the clay's capacity (both ESTIMATE, from Poovey & Getsinger 2002), the same rule in all three models
- map: the top sublayer is 7% of the stirred depth and a spray goes into the top 6 inches; reaeration is spread over each square's stirred layer
- map: an outline that crosses itself is refused on the page and sized by counting cells in the model; shallow ponds' map volume matches the layers model exactly
- map colonies: currents from the flow's own face fluxes (Pollock), sideways mixing by layer thickness (Metropolis), the thermocline a wall for random steps, and shorter steps in thin or fast water; non-floating colonies stay spread by water (was 73% vs 59% in the deepest third at 7 mph)
- map wind direction kept to the degree (was rounded to 10°, so southwest ran at 230°)

What the models do not do yet:
- inflows, waves (and their Stokes drift), the sloshing after the wind changes (internal seiches), the plume right at an injection hose
- oxygen in the cool bottom water of a layered pond (only the stirred water is shown)
- colonies sinking a little by day and rising at night
- weather measured at the pond itself: real weather comes from a weather model for the area, and forecasts past about a week are rough
- copper's dependence on dissolved organic carbon and pH (only hardness is used); pond size changing the wind of an open pond

The pond views show a single run with the central settings. The tiles and charts show the median and spread of all runs, so the two can differ.

See the simulator blueprint (`claude/pond-treatment-simulator-blueprint.md` in the project) for the full plan.

## Files

| File | What it is |
|---|---|
| `CyanoSelect-Pond-Simulator.html` | Everything in one file: the page, the "How it works" guide and all the model code. Open it straight from disk (double-click); it builds its background workers from the code inside it. Rebuild with `node tools/build-single.js`. |
| `index.html` | The web page. Serve it from the site at `/simulator/`. It runs the model in a background worker, which does not work when the file is opened straight from disk (`file://`); it then falls back to running on the page, which is slower. |
| `sim-core.js` | Phase 1 model plus the chemistry, kill, toxin and oxygen pieces both models share. Every number lives here with its units, status and source. |
| `sim-column.js` | Phase 2 layered model. Its extra numbers (heat, mixing, grain sizes, colony rise) live in `PARAMS2`, with sources in `SRC2`. |
| `sim-2d.js` | Map and side slice. Its numbers are in `PARAMS3`, with sources in `SRC3`. |
| `sim-worker.js` | Runs the models off the main page so typing stays smooth (one worker for the layers/well-mixed runs, one for the map, one for the side slice). |
| `HOW-IT-WORKS.md` | Plain-English guide to every piece, with a 60-second summary and likely questions. |
| `params.json` | The Phase 1 numbers exported for Python. Regenerate it with `node tools/export-params.js`. |
| `reference/sim.py` | An independent Python version of the Phase 1 equations. It is used only to cross-check the JavaScript. There is no Python version of Phase 2 yet. |
| `tests/verify.test.js` | 70 Phase 1 tests: the blueprint's worked numbers, exact decay, kill-model calibration at the EC50, mass balance, no negative values. |
| `tests/column.test.js` | 96 Phase 2 tests: grain settling table, colony rise speeds, diffusion against the exact answer, mass and cell conservation, release adds up to the dose, grain landing order, reduces to Phase 1 when fully mixed, layering behavior for deep and windy ponds, stronger wind never mixing shallower (1.5 to 10 m deep), deep ponds staying layered in light wind, daily temperature, real hourly weather (the idealized day fed in hour by hour matches the idealized run; windier days stir deeper; real sunlight unscaled), matching the morning reading without dragging the bottom water, total vs dissolved toxin, the optional measurements landing where they should, and no bad values across 13 product × method combinations. |
| `tests/map.test.js` | 107 map and slice tests: a deepest spot toward a dam; neutral colonies spread by water, not by area, on the map; depths match the bowl, flow is divergence-free (map and slice, with tilt and skin), the swirl runs the right way, mass balance closes for every product and treatment pattern (including a dense film), a strip spreads across the pond, neutral colonies stay evenly mixed (random-walk check), per-colony toughness reproduces the kill curve, sudden-death colonies die at the exact rate, floating colonies drift downwind only in wind, toxin balance closes exactly, oxygen matches the layers model where it should, the tilt formula, its build-up time and upwelling side, the skin speed, the film's lifetime and downhill transport, and no bad values for any product, method or shape. |
| `tests/page_weather_test.py` | 23 browser checks of the page's place search, weather download and outline lookup, with those services replaced by fake answers (needs Python Playwright with Chromium). |
| `tests/test_reference.py` | Port check. It runs 35 scenarios in Python and compares them with the JavaScript results, hour by hour. |
| `tests/make-port-fixture.js` | Regenerates the port-check fixture after a model change. |
| `tools/page.src.html` | Page source without the `<html>` wrapper. `node tools/build-page.js` turns it into `index.html`, with HOW-IT-WORKS.md rendered into the "How it works" tab (needs the `marked` package: `npm install marked`). |
| `tools/build-single.js` | Builds `CyanoSelect-Pond-Simulator.html` from the same source. |

## Run the tests

```
node tests/verify.test.js
node tests/column.test.js
node tests/map.test.js
node tests/make-port-fixture.js
python3 tests/test_reference.py
node tools/build-single.js && python3 tests/page_weather_test.py
```

All tests should pass. The worst JavaScript-vs-Python difference was about 1×10⁻¹⁰ when this was built (in diquat concentrations near zero after binding; values below 1×10⁻¹⁰ mg/L are not compared).

## Number labels

- **SOURCED**: read in the cited source.
- **DERIVED**: computed from sourced numbers.
- **ESTIMATE**: a physically based placeholder with a range. The page lists all of them under "Every number in the model, with its source".

The kill model has no published parameters for any cyanobacterium–algaecide pair. Its central settings and ranges are estimates, and the well-mixed view shows how much the answer changes between model structures.

Phase 2 estimates worth knowing about:
- **`h_floor`** (0.5–1.0 m): the depth the sun's heat is always stirred through by small waves and convection. Without it the top 15 cm overheats in calm weather.
- **Sunlight scaling:** the model scales sunlight so the pond's daily heat budget balances at the water temperature you enter. The page says how much scaling was used.
- **Colony size** and the **Anabaena rise speed** are estimates; no measured float speed was found for Anabaena/Dolichospermum.

Map and slice estimates:
- **Sideways mixing** is extrapolated from Lake Constance drifter measurements made at larger scales.
- **Current speeds** come from the textbook constant-eddy-viscosity profile (about 0.5% of wind speed at the surface) and friction consistent with it. No measured currents in small ponds were found to check them.
- The map and slice run once with central settings; they are not part of the uncertainty runs.
- **Surface-skin depth** (`skin_d`, 3-30 mm) and the **dense layer** numbers (`film_h`, `film_E`, `film_Ri`) are estimates. The front speed (`front_Fr` = 1.19) is a lab value on a flat bed.
- **Injected product strengths and densities** come from labels and safety sheets (Cutrine-Plus, Reward, Aquathol K). Liquid peroxide strength (35%) is a placeholder.
- Toxin and oxygen keep moving for all 14 days, and the thinner daytime stirred layer needs shorter colony steps, so the map takes about 9 s in the example pond (about 14 s in a 13 mph wind) in Node, up from about 6 s before the Oct 22 colony fix. The page runs the map and the slice side by side.

Known items to verify before relying on them:
- **Flumioxazin:** the *Anabaena* EC50 species label and test length.
- **Diquat:** whether the EC50s are on a cation or salt basis (the injected-film density assumes cation).
- **Oxygen Schmidt-number coefficients:** cross-checked physically, but not re-read in Wanninkhof (2014).
- **Marple et al. (2001) copper units:** the paper prints mg/L, but the values must be µg/L.

## Changing a number

1. Edit it in `PARAMS` (or the EC50 tables) in `sim-core.js`, in `PARAMS2` in `sim-column.js`, or in `PARAMS3` in `sim-2d.js`, with its source.
2. Run `node tools/export-params.js`, then `node tests/make-port-fixture.js`.
3. Run all the test files.
4. Note the change in the site's Corrections line if it changes results.

## Outside services the page uses

Only when someone uses the place search. The idealized day sends nothing.

| Service | What for | Terms |
|---|---|---|
| [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) (OpenStreetMap) | Address or town → latitude and longitude | At most 1 request a second across all users, results cached, no search-as-you-type, credit shown. The page sends one request per click, waits at least 1.1 s between requests and keeps answers for the visit. Typed coordinates skip it. |
| [Open-Meteo](https://open-meteo.com/en/terms) | Hourly weather (forecast API for about 3 months back to 2 weeks ahead; archive API for older dates) | Free for non-commercial use, under 10,000 calls a day; credit "Weather data by Open-Meteo.com" (CC BY 4.0). |
| [USGS NHD](https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/12) | Mapped pond outlines and areas (layer 12, large scale) | Public domain. NHD is no longer updated (retired Oct 2023). |

The page itself could not reach any of these from the build machine, so it was tested against fake answers shaped like each service's documented reply. (One NHD point query was run live during research, through a separate tool.) The first real use should be checked by hand.

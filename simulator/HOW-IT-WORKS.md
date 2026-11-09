# How the CyanoSelect pond simulator works

A plain-English walkthrough of every piece, in the order the computer runs them, with the numbers from the example pond so you can see what each step does. Read it top to bottom once. After that, the 60-second version and the question list at the end are what you need for talks and interviews.

The example pond used throughout: 1 acre, 8 ft at the deepest point, 82 °F water, open to a 4.5 mph wind from the southwest, a heavy *Microcystis* bloom (100 µg/L chlorophyll), hydrogen peroxide sprayed on the whole pond at 3 mg/L at 8 AM.

Everything the simulator shows is a **prediction**. It has not been checked against a real pond.

---

## The 60-second version

> "Our dataset tells you how strongly each algaecide affects the bloom and other organisms in a lab. But a pond isn't a lab beaker: product sprayed on top can stay in a warm top layer, crystals can sink and dissolve on the bottom, and wind pushes water and floating colonies toward one shore. So we built a simulator that takes a pond, the weather and one treatment, and predicts the next 14 days hour by hour: where the product goes, how much of the bloom gets knocked down, how much toxin is released, what happens to oxygen, and how close other organisms get to their lab effect levels. It works in three views: a well-mixed version, a version that splits the pond into layers, and a map version that adds sideways currents, tracks a thousand colonies one by one and shows where toxin and low oxygen turn up. All the physics comes from published equations and measurements, every estimate is labeled, and it runs 200 versions with different assumptions to show how uncertain the answer is. It hasn't been tested against a real pond yet. That's the next step."

---

## The big picture: three models of the same pond

| View | What it treats the pond as | What it can answer | What it can't |
|---|---|---|---|
| **Well-mixed** (Phase 1) | One stirred tub (or just the warm top layer, if the pond is layered) | Quick estimate for an evenly treated, mixed pond | Anything about depth or position |
| **Layers** (Phase 2) | A stack of 12 to 40 thin horizontal slices | Does the product stay with the bloom or end up on the bottom? When does the pond mix at night? | Anything sideways: spot treatments, drift toward one shore |
| **Map and side slice** (2-D) | A grid of about 450 squares seen from above, each with 5 layers; plus a vertical cut along the wind | Where a spot or strip treatment spreads, where colonies pile up, how the wind loop moves water, where toxin and low oxygen show up, how the thermocline tilts | Oxygen in the cool bottom water; the sloshing after the wind changes |

The map is built **on top of** the layers model. The layers model works out the temperature, how deep the stirred top layer is, and how strongly each depth mixes. The map borrows those, hour by hour, and adds sideways movement.

---

## Step 1: the shape of the pond

**Layers model.** Most ponds are bowl-shaped: the area of water deeper than a given depth shrinks as you go down. The model uses one formula for that:

> area deeper than z = surface area × (1 − z ÷ max depth)^p

The exponent p sets how steep the bowl is. It comes from the ratio of average depth to maximum depth, which is 0.40 by default (lakes in the Seekell et al. 2021 dataset average about 0.41; dug ponds run steeper). That gives p = 1.5. The pond is then cut into thin slices about 15 cm (6 in) thick.

**Map.** You pick a shape (round, oval, long, irregular), draw your own outline, or look up the real outline (see below). The outline is scaled to your acreage and covered with about 450 square cells. Each cell gets a depth from how far it is from the shore: farthest from shore means deepest. The depths are then adjusted so the area-deeper-than-z curve matches the layers model. So the map and the layers model describe the same bowl, just laid out differently. In the example, each map cell is about 10 ft (3 m) on a side.

**Fixed Oct 22, 2026:**
- Shore cells get a minimum depth so the map's numbers stay steady. That minimum used to add water: 18.5% too much in a 1-ft pond, 4.4% at 2 ft. Now the minimum is smaller in very shallow ponds, and the deeper cells are made a little shallower to match. The map holds exactly the layers model's water at every depth tested.
- An outline that crosses itself, like a bow tie, used to make a map 2.6 times the acreage you typed, with no warning. Now the page refuses a drawn or looked-up outline that crosses itself. If one gets through anyway, the map is sized by counting its cells, so its area stays within 5% of what you typed.

**Looking up a real outline (US only).** After you find the pond's place (Step 2), the page can ask the USGS National Hydrography Dataset (NHD) for mapped lakes, ponds and reservoirs within about 1,300 ft. It lists them nearest first, with their mapped area, and you pick yours. The outline and area are filled in; the depth is not, because the maps don't have it. Swamps and marshes are left out. Anything over 100 acres is listed but can't be picked, because the simulator is built for ponds. Be aware of three things:

- NHD stopped being updated in October 2023, so ponds dug since then, and some very small ones, may be missing.
- The mapped area is a snapshot. Check it against what you know about the pond.
- Islands are ignored: the outline is the outer shore only.

OpenStreetMap was looked at too. NHD was chosen because it has an area field and tested well on small ponds around Apex, and because the public OpenStreetMap shape service (Overpass) asks apps like this not to use it. How complete OpenStreetMap is for small US ponds has not been checked.

---

## Step 2: weather, water temperature and layering

This is what decides whether the pond is **layered**: warm, light water floating on cooler, heavier water, with a sharp boundary called the **thermocline**. Water barely crosses a thermocline, so a sprayed product mostly stays above it.

Every 5 minutes (10 minutes until Nov 8, 2026; the shorter step moved the example's central knock-down from 64% to 67%, and halving it again changes nothing) the layers model adds up the heat flowing in and out of the top of the pond:

- **Sunlight in.** A standard clear-sky formula from the sun's angle (Haurwitz), times a cloud factor. Sunlight is absorbed with depth, faster in green or muddy water.
- **Heat radiation.** In from the sky (Brutsaert's formula), out from the water surface.
- **Evaporation and contact with the air.** Standard "bulk" formulas. They grow with wind speed and with the temperature and humidity difference between water and air. The transfer coefficients come from measurements over 31 lakes and reservoirs (Guseva et al. 2023), and they rise in light wind.
- **Calm air.** On a still night, warm moist air over the water rises on its own and carries heat and water vapour away (free convection). The model uses the formula GLM uses, and takes whichever is larger, this or the wind's.

**Fixed Oct 22, 2026.** The heat losses were too weak:
- the strong-wind transfer coefficients were used even in light wind, though Guseva et al. measured them up to 2–3 times higher there;
- there was no calm-air loss at all;
- the sky's heat radiation could come out above its physical maximum (1.13 times a perfect radiator in hot, humid, cloudy weather).

With real weather, a July pond used to run at about 94 °F by the third morning. It now runs at about 88 °F.

**Real weather or an idealized day.** You choose.

- **Real weather.** Type the pond's address or town (or its latitude and longitude, or use your location) and the treatment date. The page fetches hour-by-hour weather from Open-Meteo for that spot: air temperature, humidity, wind speed and direction, cloud cover and sunlight. It covers 17 days: two days of warm-up before the treatment, the treatment day, and 14 days after.
  - Dates from about 3 months ago to 2 weeks ahead use Open-Meteo's recent-and-forecast service. Older dates use its archive (the ERA5 reanalysis, which goes back decades). Dates more than about 2 weeks ahead can't be forecast, so the page refuses them.
  - When the forecast runs out before the 14 days are up, the last forecast day is repeated, and the page says so.
  - Between hours, values are blended in a straight line. Wind direction is blended as an arrow, so a wind swinging from northwest to northeast passes through north, not south.
  - The wind is for open ground 33 ft up, averaged over a few miles. Your choice of trees around the pond still cuts it.
  - In the map and slice, the wind's speed and direction change every hour. The swirl, the surface skin and the tilt follow it, so colonies can drift one way and then back. The side slice stays cut along the wind at treatment time; when the wind turns, only the part blowing along the slice drives its loop.
- **Idealized day.** You enter one day's wind, sky and air temperatures, and that day repeats for 14 days.

**The idealized day's sunlight.** A sunny idealized day gets 75% of the clear-sky formula's sunlight, for haze and passing clouds. That share is an estimate, and the runs vary it from 60% to 90%. Partly cloudy gets 0.7 times that and overcast 0.35 times. The water starts at your reading and then follows the weather, as it does with real weather.

**Overcast idealized days.** The idealized day repeats the same weather every day, and the rest of the pond's breathing is balanced to that weather. So an overcast run can show *more* oxygen than a sunny one: the bloom makes less oxygen, but everything else is balanced to use less. The real crash risk is a cloudy spell after sunny weather, when the pond's breathing is still sized for sunny days. Only real weather input can show that.

**Changed Oct 22, 2026.** Until then the model scaled the sunlight down until the heat budget balanced at the temperature you typed. With heat losses that were too weak, that threw away about two-thirds of a sunny day. It also tied the sunshine to the wind and humidity: more wind gave more sun. Afternoon layering came out about a third as strong as it should be.

In the example, the water is 82 °F at treatment. The weather you entered is sunnier and warmer than what holds a pond at 82 °F: holding it there would take 34% of clear sky. So the water warms to about 87 °F by the morning of day 8 and stays there, with afternoons up to about 97 °F. The temperature chart shows it. If your reading and the weather you enter really don't fit, use real weather instead.

**Layering and mixing.** After the heat step:

1. If heavier water ever sits on top of lighter water (at night, when the surface cools), the two mix. That is how ponds turn over at night.
2. The wind puts stirring energy into the top layer each step. If there is enough energy to lift the denser water just below, the stirred layer deepens. This is the same energy-balance idea used by GLM, a widely used lake model. As in GLM, the energy needed uses each layer's own volume and the stirred layer's real centre of mass. **Fixed Oct 22, 2026:** every layer used to be given the full surface area, as if the pond had straight walls. In a bowl the deeper layers are smaller and easier to stir in. In the reviewer's test, a 16-ft pond in a steady 9 mph wind went from never mixing to the bottom to mixing on 13 of 14 days. (That was with the old sunlight; under the new, sunnier idealized day it stays layered, because more sun means stronger layering.)
3. **Trees cut the wind.** Trees on the shore calm the water for about 50 tree heights downwind (Markfort et al. 2010). Only the part of the pond farther out than that gets the full wind. The model uses Markfort's rule, as GLM does, with 15-m (50-ft) trees, an estimate. With trees all around, any pond under about 100 acres is entirely in their shelter, and it gets an estimated 20% of the open-ground wind (gusts and eddies still reach it). With some trees, it gets an average of open and wooded. With open banks, it gets the full wind at any size. **Fixed Oct 22, 2026:** before, the tree choice cut the wind by a fixed 30% or 60% whatever the pond's size. Pond size still doesn't change mixing in an open pond.
4. The stirred layer is whatever this energy balance, a minimum stirring depth of about 2.5 ft and night-time cooling actually mix. The minimum is an estimate. It is still needed after the Oct 22 heat-loss fixes: without it, the top 6 inches of a bloom pond reach about 100 °F on a sunny afternoon. Wind energy that falls short of mixing the next layer down in one 5-minute step is saved for the following steps, so a steady wind slowly wears a thermocline down. (Without saving it, a steady wind could never erode a thermocline, and the answer would depend on the step length.)

**A fix made on Oct 20, 2026.** Earlier, the stirred layer was set by a density-gradient cutoff measured in real ponds (Holgerson et al. 2022): any water with a gentler gradient than that counted as stirred. In a deep pond, the starting layering is spread over many metres, so its gradient fell under the cutoff. The model then stirred it away within hours, even in calm air. The result was backwards: a 10 m pond came out fully mixed at every wind speed, and a stronger wind made a 5 m pond layer. Now stronger wind always mixes deeper, at every depth tested from 1.5 to 10 m, and deep ponds stay layered in light wind.

In the example pond at treatment time, the stirred top layer is about 3.3 ft thick, with cooler water below it. It thins to about 2.4 ft in the afternoon sun and deepens again at night. It doesn't mix all the way to the bottom in the 14 days.

**Matching your reading.** After a two-day warm-up, the model compares its 7 AM surface temperature with the one you entered. It then shifts the water that the morning's stirring reached to match your reading. The deeper water keeps its starting difference from your reading. If the two differ by more than about 4 °F, the page says so, because your reading and the weather (or the air and sky you entered) don't fit together.

**A fix made on Oct 21, 2026.** Until then the whole column was shifted, bottom included. With real weather the warm-up can run 10–20 °F off your reading, so a July pond with a 65 °F reading started with 39 °F water at the bottom. Now that bottom starts at about 59 °F.

---

## Step 3: how water mixes up and down

Inside the stirred top layer, turbulence spreads things up and down. The model uses the textbook "eddy diffusivity" profile for a wind-stirred layer:

> mixing strength at depth z = κ × u* × z × (1 − z ÷ D)

- κ = 0.41 is von Kármán's constant.
- u\* is the water's "friction velocity", which comes from the wind stress. It is about 0.3 cm/s in the example.
- D is the depth of the stirred layer.

Mixing is weak at the surface and at the bottom of the layer and strongest in the middle. Below the thermocline, mixing drops to near the molecular level, using a regression measured in small lakes (Hondzo & Stefan 1992).

This is where the **Navier–Stokes** connection lives. The full equations describe every swirl. "Eddy diffusivity" is the standard way to average out turbulence you can't track: it replaces all the little swirls with one number per depth for how strongly they spread things around.

---

## Step 4: how wind moves water sideways (map and slice only)

The wind does two things to a pond, and the map adds them together.

**1. The counterflow.** The wind drags the top water downwind. The pond has nowhere for that water to go, so it piles up a tiny bit (less than 1 mm) at the downwind shore and flows back underneath. Using the same eddy viscosity as Step 3 and a bottom the water sticks to, the textbook answer is:

> speed at height ζ (0 = bottom of the stirred layer, 1 = surface) = u_s × (3ζ² − 2ζ)

- Surface speed u_s = 1.5 u\* ÷ κ ≈ 3.7 u\*, about 0.5% of the wind speed. In the example that is 1.1 cm/s, about 2 ft per minute.
- The flow is zero two-thirds of the way up the layer.
- Below that, water flows back at up to one-third of the surface speed.
- As much water flows back as forward.

**2. The swirl (topographic gyre).** Shallow water is easier for the wind to push than deep water, because the wind's push is spread over less water. With a no-slip bed, the counterflow also drags the bed downwind with half the wind's stress, so the swirl is pushed with 1.5 times the wind stress (fixed Oct 21, 2026; it used to get 1 times). Over the deepest middle, the top water can now creep upwind in light wind (17 of 448 squares in one test case); everywhere else it still moves downwind. So the shallow edges move downwind and the deep middle flows back upwind, forming two slow loops. The model works this out by assuming the surface stays flat (a "rigid lid", fine because the pile-up is under a millimetre) and that friction slows the flow. That leaves a single equation for a "streamfunction", solved over the whole map at once. A streamfunction guarantees exactly as much water leaves each square as enters it; the tests check that to about one part in 10¹⁵. The friction comes from the same eddy viscosity, which makes it κu\*/2. In the example, the swirl reaches about 1 cm/s along the edges.

In the top water, the counterflow is stronger than the swirl, so surface water moves downwind everywhere. Deeper down, the swirl and the return flow take over. That is why a spot of product in the deep middle can drift slightly **upwind** once it mixes down, while floating colonies at the surface drift **downwind**.

**3. The fast surface skin.** The very top centimetre of water moves faster than the counterflow formula says, because it is dragged directly by the wind. Lab measurements in a wind-wave tank put the surface drift at 0.53 times the air's friction velocity (0.4 to 0.7 across runs; Wu 1975), which comes to about 2% of the wind speed. The model adds that extra speed in a thin layer that fades over about 1 cm (the depth is an estimate), with a matching slow return just below so no water piles up. In the example the very surface moves at about 4.6 cm/s, four times the 1.1 cm/s of the counterflow. It mostly matters for colonies floating right at the surface, which is where scums form. Waves add their own drift on top (Stokes drift), and that is not included.

**4. The thermocline tilts.** In a layered pond, the wind piles warm top water against the downwind shore. The warm layer gets thicker downwind and thinner upwind until the slope of the boundary balances the wind's push. The steady answer is:

> tilt = u\*² ÷ (g′ × h)

- g′ is gravity scaled down by how much denser the cool water is (the density step across the thermocline)
- h is the thickness of the warm layer

This is the same balance behind the **Wedderburn number**, W = g′h² ÷ (u\*² × length of the pond along the wind). When W drops below 1, the boundary reaches the surface at the upwind shore and cooler water from below comes up there (**upwelling**). The page flags it on the map and in the timeline.

The boundary doesn't tilt instantly. It takes about a quarter of its sloshing period (the internal seiche) to get there, so the model eases into the steady tilt over that time. For a strongly layered pond that is a few minutes; for a thin, freshly warmed layer it can be an hour or more. The sloshing back and forth after the wind changes is not modeled.

In the example at treatment time, the tilt is about 3 mm per metre, so the warm layer is about 3 inches thicker on the downwind side. In the example the layering is now strong enough that the boundary never reaches the surface. (Before the Oct 22 heat changes, it did for about 25 hours.) A 20-acre pond in an 11 mph wind upwells much more strongly in the tests.

**5. Sideways mixing.** Eddies also spread things sideways. The strength comes from drifter measurements in Lake Constance, scaled down to pond size: 0.013 m²/s in the example. It is labeled an estimate because the measurements were made at larger scales.

**The side slice** is a vertical cut along the wind through the deepest point. It uses the same counterflow and is treated as a channel of even width, like the reservoir model CE-QUAL-W2. Because the stirred layer is thin at the shallow ends, the slice also shows water **rising at the upwind shore** and **sinking at the downwind shore**.

---

## Step 5: where the product starts

- **Sprayed on the surface:** starts in the top 15 cm (6 in), in all three views. **Fixed Oct 22, 2026:** the map split the stirred layer into four equal parts and put a spray in the top one, which was 1 ft or more thick. The map's early exposure came out 2.4 to 5 times lower than in the other views, just when scums form. Now the map's top part is 7% of the stirred layer, and a spray goes into the top 6 inches. At the start the map's average top water is within 5% of the layers model's.
- **Injected with a weighted hose:** the solution is denser than water, so it sinks. In a layered pond it spreads out just under the thermocline. In a mixed pond the layers model pools it in the deepest 15% of the water. The map and slice go further (see the dense layer below).
- **Crystals or granules broadcast dry:** each grain size is followed as it falls, using a settling-speed law for real (not perfectly round) grains (Ferguson & Church 2004). It shrinks as it dissolves, at a rate from a standard falling-sphere formula (Ranz & Marshall). Some grains dissolve on the way down. The rest land on the bottom and finish dissolving there, more slowly.
  - In the example pond, about 29% of Fine 30 copper sulfate crystals reach the bottom before dissolving.
  - In the map, shallow cells near shore get more crystals landing, because the water is shallower.

The **label dose** (for example 3 mg/L) is for the full depth of the treated area. A spray puts all of that dose into the top layer. That is why a sprayed layered pond can see more than the label number up top (about 20 mg/L in the top 6 inches right after spraying in the example, falling to about 2.4 mg/L within the hour as it mixes down and breaks down).

**The dense layer from an injection (map and slice).** Where the water isn't layered, the injected product forms a layer about 8 inches (20 cm) thick on the bed (the thickness is an estimate). Liquid products are denser than water: Cutrine-Plus has a specific gravity of about 1.22, for example. The model works out how much denser the bed water is from how much product it holds, using each product's strength and density from its label or safety sheet. Then the layer slides toward deeper water like any dense current, at a speed from the standard front condition, speed = 1.19 × √(g′ × thickness) (lab measurements by Huppert & Simpson 1980). As it moves, it mixes into the water above it. If it reaches water that is layered and it is lighter than the cool water there, it spreads along the thermocline instead of going under it.

The density difference is small. A 1 mg/L copper dose over 2 m of water puts about 10 mg/L of copper into the 20 cm layer, which makes it only 0.02 kg/m³ denser. That is about the same as water 0.07 °C cooler. So it slides only in calm water, at under 1 cm/s (about 1.5 ft per minute). Any real wind stirs it straight into the bottom water. The model checks this every step: when the layer's density pull is weaker than the wind stirring (a Richardson number under 1, an estimate), the layer mixes in at once. In the tests, a copper injection in a 1 mph breeze keeps its dense layer for about 17 hours and carries the product toward the deepest water. At 9 mph it mixes in immediately.

Two things happen the moment the product goes in:

- **Peroxide:** part of it is used up instantly by the bloom and other particles. That instant demand is typically 0.1 to 1.2 mg/L (Weenink et al.). It is 5% of the dose in the example.
- **Diquat:** if the cloudiness is mostly clay, the clay takes up diquat, and most of it within the first hour. The model treats it as a rate:
    - It happens in every layer and square the diquat reaches, so diquat that mixes down meets more clay.
    - It slows as the clay fills, up to a share of the clay's charge capacity.
    - The speed (half done in about 10 minutes at first) and the share (60%) are estimates. They are based on Poovey & Getsinger 2002 and the bentonite studies they cite. In Poovey's tanks, diquat was near its 3-hour level by the first sample, 6 minutes in. Some stayed in the water where the full capacity would have bound it all.
    - **Fixed Oct 22, 2026:** before, binding was all-or-nothing and placed differently in each view. The well-mixed model bound the whole dose at once; the layers model bound only in the spray layer; the map bound only where the spray landed. A 0.2 mg/L treatment of a 4-ft pond gave 0%, 14% and 33% knock-down. Now it gives 2%, 5% and 2%, with 99% of the diquat bound.

---

## Step 6: how the product disappears

Each chemical has its own loss law, from published pond and lake data:

| Product | What removes it | How the model does it |
|---|---|---|
| Hydrogen peroxide | Bacteria and algae break it down | Rate rises with chlorophyll and temperature. Example: half gone in about 1¼ hours in the top layer, where the floating bloom is thickest |
| Copper sulfate | Settles out and sticks to particles | Measured loss rate in warm fish ponds (Marple et al. 2001), adjusted for temperature and alkalinity |
| Chelated copper | Same, slower | About 0.23 per day |
| Diquat | Sticks to clay and sediment | Clay binding at a rate (Step 5), then 0.35 to 0.7 per day |
| Endothall | Bacteria, after they ramp up | Slow for 5 to 11 days, then 0.3 to 0.6 per day |
| Flumioxazin | Breaks down in water, much faster at high pH | Rate depends on pH, which swings every afternoon as the bloom photosynthesizes |

In the layers and map models, each layer has its own temperature, pH and bloom density, so the same product can last longer in the cold, bloom-free bottom water than at the top.

---

## Step 7: the colonies

**Floating speed.** *Microcystis* colonies have gas pockets and float. A sphere's rise speed comes from Stokes' law (an exact solution of the Navier–Stokes equations for small, slow particles):

> rise speed = g × (water density − colony density) × diameter² ÷ (18 × viscosity)

With a measured colony density (985 kg/m³) and a 200-micron colony, that is about 1 m (3.5 ft) per hour. Planktothrix is treated as neutral (it doesn't float or sink). Anabaena gets a slow estimated rise because no measured value was found.

**Layers model:** the bloom is a concentration in each layer, mixed by Step 3 and lifted by the rise speed.

**Map and slice:** the bloom is about 1,000 individual tracked "colonies". Every minute or two, each one:

1. moves with the current (Step 4),
2. floats up at its rise speed,
3. takes a random step up or down sized by the mixing strength at its depth,
4. takes a random step sideways sized by the sideways mixing.

The up-down random step uses an exact property of the mixing profile: mixing that is strongest mid-layer and fades to nothing at the surface and the bottom works like a dot wandering over a ball, with depth read off its height. Turning the ball by a random amount keeps colonies that were evenly spread exactly even, whatever the step length. Each step has the same average size and spread as Visser's (1997) method.

- **Fixed Nov 8, 2026.** Until then the step used Visser's method directly. With steps of 30–180 seconds it left the top and bottom few percent of the stirred water 20–33% too full of colonies that should simply follow the water, including the top inches where a spray lands. Now every depth band is within about 2% (a test checks 8 cases).
- **Also fixed Nov 8.** Near a shore, the part of the current that changes within a layer (the fast surface skin, the counterflow) was added in full right up to the land, and a step onto land was refused, so drifting colonies collected on the downwind shore: 28–32% too dense in the downwind fifth of a 1-acre pond in a 9–18 mph wind. That part now fades to zero across the shore square, with the small up-and-down flow that keeps the water's volume. The downwind fifth is now within about 10% (a test allows 15%).
- **Side slice, fixed Nov 8.** The slice took its sideways current from each column's own depth but its up-and-down current from the corners, which did not keep the water's volume. Drifting colonies ended up 3 to 4 times too dense at the downwind end. The slice now moves colonies with its own face flows, in short enough steps, and every fifth is within about 10%. One simplification: in the slice, colonies at the very top move at the top level's average speed. The map still follows the faster top centimetre, which in the slice would need steps of a couple of seconds.

On the map, colonies move in each square's own layer coordinates. A colony a third of the way down the stirred layer stays a third of the way down when it crosses into a shallower or deeper square. Product, toxin and oxygen use the same coordinates.
- **Current.** It is taken from the map's own water flows through each square's sides, blended across the square (Pollock's particle-tracking method). So colonies go exactly where the water goes.
- **Sideways mixing.** A random step into a square with a thinner layer is accepted with the ratio of the thicknesses (the Metropolis rule). That spreads colonies by the amount of water, not by area.
- **The thermocline.** It acts as a wall for random steps. Floating, sinking and the up-and-down flow still carry colonies across it.
- **Short steps where needed.** Steps are cut where one would be too long: in shallow squares, and where the current is fast.

**Fixed Oct 22, 2026:** a non-floating colony used to keep its depth when it moved sideways, and a step over shallower water was refused. With the step lengths used, the up-and-down walk threw colonies into the still water under the thermocline, and the depth rule then trapped them in deep squares. In a 7 mph wind, the deepest third of the example pond held 73% of the colonies that don't float, against 59% of the water. Now each third is within about 2 points of its share of the water, in calm air up to 29 mph winds. The map takes about 50% longer to run as a result.

Because floating colonies spend most of their time near the surface, where the water moves downwind, they **drift toward the downwind shore**. In the example, colonies near the surface drift about 45 ft downwind on average in the first day (the page's timeline gives the number for your pond). This is how real scums form along one shore.

---

## Step 8: how colonies get knocked down

**What the lab tells us.** The CyanoSelect dataset gives an **EC50**: the concentration that knocks out half the cells in a lab test of a set length. For peroxide on *Microcystis*, it is 2.62 mg/L over 24 hours, measured as photosynthesis shutting down (Weenink et al. 2022). In that test the peroxide was added once and left to fade, and 2.62 mg/L is the starting amount.

**The problem.** In a pond, the concentration isn't steady. It spikes and then fades over hours. So the model needs a way to turn a changing exposure into damage. It uses **GUTS**, the standard framework in ecotoxicology:

- **Damage** inside the cells builds up toward the outside concentration and fades when it drops. The speed is set by a "damage rate" (0.45 per hour, an estimate).
- Then one of two rules decides who gets knocked down:
  - **Tolerance (IT):** every cell has its own toughness. It is knocked down once its damage passes that toughness.
  - **Sudden death (SD):** once damage passes a threshold, cells are knocked down at random, at a rate that grows with damage.
- Both rules are calibrated to reproduce the lab test: 50% knocked down at the end of it. For most products the lab held the concentration steady. For peroxide it dosed once and let it fade, so the model replays that fading dose (fading at 0.46 per hour, an estimate, since the lab only measured it at the start).

**A fix made on Oct 21, 2026.** Until then the peroxide EC50 was treated as if held steady for 24 hours. That made the cells look about 2.7 times tougher than the lab test shows. The example knocked down about 17% (median of runs 4%). After that fix the median was about 45%. After the Oct 22 heat fixes it was about 64% (40 runs). With the Nov 8 fixes and 200 runs the page shows 67%. That number moves between about 61% and 67% with the random seed, and 1,000 runs give 61%, so "about 61–67%" is the honest figure. The sunnier, more strongly layered top water keeps the spray with the floating colonies longer. The one field check is a Dutch lake treated with peroxide, where 35.9% of the bloom was knocked down. That lake's treatment and conditions differ from the example pond's, so the two numbers aren't directly comparable.

Nobody has published the time-course data needed to know which rule fits these chemicals. The runs all use the tolerance rule, because it comes closer to the field check. The other rule is shown as its own scenario on the knock-down tile (62% in the example), not mixed into the band. Until Oct 21 half the runs used each rule, which made the band a blend of two different models.

**Layers model:** damage is driven by the concentration the bloom actually sits in, weighted by where the cells are.

**Map and slice:** every tracked colony gets **its own toughness**, drawn so that the whole set matches the tolerance curve. Each colony carries its own damage as it drifts. It turns gray the moment its damage passes its toughness. A colony that stays in a strong patch dies; one that drifts out early may survive. In a whole-pond treatment, the map and the layers model agree within a few points (63% on the map vs 67% in the layers model in the example). For a spot or strip treatment, they can differ a lot, and the map is the one to trust for that question.

"Knocked down" means photosynthesis or growth stopped, which is what the lab EC50s measured. It is not the same as dead. Cells can recover, and the page says so.

---

## Step 9: toxin and oxygen

**All three models:**

- **Toxin (microcystin):** cells hold most of their toxin inside. Damaged cells leak it into the water. Bacteria break dissolved toxin down, but only after a lag of about 3 days (shorter if the pond has had blooms before). Sunlight breaks it down slowly from the start: a half-life of about 105 days per metre of stirred water (Welker & Steinberg 2000), and none under the thermocline. **Added Nov 8, 2026** to the layers model and the map; until then only the well-mixed model had it. Treatment doesn't make new toxin; it mostly moves it out of the cells. The page shows two numbers:
    - **All toxin, inside cells and out.** The EPA swimming level (8 µg/L) and the WHO levels are written for this, so this is what the page compares with them.
    - **Dissolved toxin.** This is the part a water plant's filters don't remove, so it matters for drinking-water intakes.
    - **Fixed Oct 21, 2026:** until then the page compared dissolved toxin with the EPA level. A heavy bloom already far over it before treatment could show as "under".
- **Oxygen, hour by hour:**
    - The living bloom makes oxygen by day, as fast as the light at its depth allows, and breathes day and night. Cells crowded near the surface shade the water below them.
    - Everything else in the pond that breathes (bacteria, animals) is sized so the untreated pond is in day-to-day balance: over a day, it uses what the bloom makes beyond its own breathing.
    - After a treatment, the knocked-down cells stop making oxygen. Half of that other breathing keeps going (the share is an estimate, 0 to 1 across runs), and the dead bloom decays and uses more.
    - The wind puts oxygen back through the surface; the pond bottom uses some; breaking-down peroxide adds a little.
    - The page reports the lowest hour, usually just before dawn, against fish stress (4 mg/L) and fish-kill (2 mg/L) levels.
    - **Added Oct 21, 2026.** Before, oxygen had no daily cycle and the page added a flat "1–2 mg/L lower before dawn". That missed the main cause of real fish kills after a treatment: the bloom stops making oxygen while the pond keeps breathing. The photosynthesis rate (4.5 mg carbon per mg chlorophyll per hour, a median from ocean data), the light it needs and the breathing are estimates, so the size of the daily swing is rough.
- **Other organisms (green algae, water fleas, fish)** are judged the way their own lab test was run, in the stirred top water where they live. A test that dosed once and let the product fade is compared with the pond's highest 1-hour average. A steady test is compared with the worst average over the test's length (48 hours if the length isn't stated). Animals near the bottom get their own margin when it is much tighter. The copper green-alga value is the one Tsai et al. measured at the same cell density as the copper target value (1.873 mg/L at 5×10⁵ cells/mL), as in the CyanoSelect dataset (Nov 1, 2026). From Oct 21 to Nov 8, 2026 the sparse-density 0.192 was used. That pairing was mismatched: copper's density effect comes from cells binding copper in the test water, and in a bloom pond nearly all those cells are the bloom's.
    - **Copper and water hardness (added Oct 22, 2026).** Copper is far more toxic to fish and water fleas in soft water. Their copper effect levels are now scaled to your water's hardness with the US EPA rule: effect level × (your hardness ÷ lab hardness)^0.9422.
        - The lab hardness is an estimate, 100 mg/L. The fish and water-flea values are averages of many ECOTOX tests whose water the dataset doesn't record. If those tests averaged 50 or 250 mg/L instead, every copper margin for animals moves by about 0.5× or 2.4×.
        - Hardness is a new optional field. Left blank, it is taken to equal the alkalinity.
        - Soft water (under 50 mg/L) gets a warning.
        - In the example's water (alkalinity 40, so hardness taken as 40), the water flea's copper level drops from 0.216 to 0.091 mg/L. A 0.5 mg/L copper sulfate spray then has a margin of 0.33 for water fleas and 0.90 for fish.
        - Green algae and the target bloom aren't adjusted: the EPA rule is for animals. **Fixed Oct 21, 2026:** the layers model used to compare with the single highest moment in a 6-inch spray layer, which gave margins 8× tighter than the well-mixed model for the same treatment.
- Oxygen is shown for the wind-stirred water only. Bottom water in a layered pond can go much lower, and that isn't modeled yet. In the side slice that water is drawn grey.

**What the map adds.** Every square and layer carries its own dissolved toxin, oxygen shortfall and dead bloom, and the currents and mixing move the toxin and oxygen around just like the product. The rates are the same numbers the layers model uses.

- When a tracked colony is knocked down, its share of the bloom's toxin and carbon goes into a "leaking" pool at the spot where it was knocked down. It leaks out at the layers model's rate (about 1 per day).
- The bed uses oxygen only where the wind-stirred water touches it: everywhere in a mixed pond, and only in the shallower edges when the pond is layered. That is the same rule the layers model uses, applied square by square.
- The switch above the map picks what the colour shows: **Product**, **Toxin** or **Oxygen**.

In the example, the top water holds about 54 µg/L of toxin before treatment, counting what is inside the cells: nearly 7 times the EPA level. Floating cells crowd into the warm top water. It swings between about 53 and 67 µg/L in the first two days. Even with about two-thirds of the bloom knocked down, it stays above 8 µg/L for all 14 days: the cells still alive hold their toxin, and released toxin breaks down slowly. Dissolved toxin peaks near day 3, at 27 µg/L on the map and 33 µg/L in the layers model. The worst spot on the map is 29 µg/L, so a whole-pond treatment leaves it fairly even.

Oxygen starts at 7.3 mg/L on the map and rises to 8.2 mg/L in the first hour as the peroxide breaks down. With the bloom's photosynthesis cut, the lowest hour comes at 7 AM: 4.5 mg/L on the map (day 4), 4.1 mg/L in the layers model (day 3). Across the 200 runs the lowest hour's median is 3.7 mg/L and its 5th–95th percentile is 1.6 to 5.2 mg/L. The low end moves between about 0.6 and 1.6 mg/L with the random seed (1.2 with 1,000 runs), so fish stress is a real possibility and a fish kill can't be ruled out.

Two checks keep this honest. First, the toxin adds up exactly: what was dissolved at the start, plus what leaked out, minus what bacteria broke down, equals what is in the water. Second, in a fully mixed pond with no knock-down, the map starts at the same oxygen as the layers model. It can then lag behind by up to a few tenths of a mg/L as the water warms and cools, because the map carries the oxygen shortfall from hour to hour, while the layers model uses the balance at each moment. The surface takes oxygen back in over the whole stirred layer of each square. (When the map's top layer was made thin on Oct 22, putting it all into that thin top layer starved it of oxygen. The map then ran up to half a mg/L low until this was changed.)

---

## Step 10: uncertainty

Many numbers are uncertain: the damage rate, the colony size, the humidity, the idealized day's sunshine, how fast and how much clay binds diquat, the bloom's photosynthesis rate, and so on. So the layers and well-mixed models run **200 times** (40 until Nov 8, 2026: with 40, the median knock-down moved by about ±6 points with the random seed; with 200 it moves by about ±3). Each run draws every uncertain number from its range, using a method (Latin hypercube) that makes sure each range is covered evenly. The charts show the median line and a band from the 5th to the 95th percentile of the runs.

The map and slice run **once**, with the central value of every number, because they take a few seconds each. That's why the map's knock-down can differ from the tile above it. The tile is the median of 200 runs, and the main run isn't the median; the caption under the pond view says where it sits. In the example, the main run knocks down about 67%, the median of the 200 runs is also about 67% (5th–95th percentile 4 to 98%), and the main run sits at about the 49th percentile. (Before the Oct 21 fixes, 17% against a 4% median, at the 77th percentile.)

The band covers uncertain numbers only. It doesn't cover the model's own structure: the other kill rule (shown separately), the three models' different simplifications, or the guesses the review lists. Read it as the smallest the real uncertainty could be.

---

## Your own measurements (optional)

Several of the model's biggest guesses can be replaced with a reading from your own pond or lab. Every field is optional: leave it blank and the model uses its estimate. A value you enter is used in every run, so the uncertainty band stops varying it, and the notes list what was used.

| Field | Where it is | What it replaces | How to get it |
| --- | --- | --- | --- |
| Average depth | Your pond | The bowl shape (average ÷ deepest, guessed at 0.4) | Depth soundings at about 20 spots |
| Deepest water | Your pond (map only) | Deepest water always in the middle | Dammed ponds: pick the dam's side |
| Bottom water temp | Water | The bottom starting 7 °F cooler than the top, the guess that most decides whether the pond is layered | A thermometer or logger at the deepest spot on the treatment day |
| Secchi depth | Water | How fast sunlight fades, worked out from chlorophyll and turbidity | A Secchi disk |
| Hardness | Water | Hardness taken as equal to the alkalinity, for copper's harm to fish and water fleas | A hardness test kit |
| Measured total microcystin | Bloom | The toxin level setting (toxin per unit chlorophyll) | A lab or test-kit result for whole water |
| Peroxide half-life | Your own test results | The peroxide breakdown rate (the chlorophyll slope is a guess) | Peroxide in a bottle of bloom water, test strips over a few hours |
| Your own EC50 and test length | Your own test results | The published EC50 and its strain spread; also works where no published value exists | A lab test on your own bloom (photosynthesis or growth cut in half). A peroxide test is taken to have dosed once and let it fade, at your measured half-life if you entered one; other products' tests are taken as held steady |

The surface and bottom readings are matched on the treatment day: the warm-up runs two days, then the stirred top water is set to your surface reading and the deeper water is bent to your bottom reading.

## What's measured and what's estimated

Every number in the model is listed on the page under "Every number in the model, with its source", labeled:

- **SOURCED:** read in the cited paper or dataset.
- **DERIVED:** worked out from sourced numbers or standard physics, like the counterflow speed.
- **ESTIMATE:** a physically reasonable value with a range, where no measurement was found.

The estimates that matter most:

| Estimate | Why it matters |
|---|---|
| Damage rate and which kill rule fits | Biggest single effect on "knocked down" |
| Idealized day's sunshine (75% of clear sky when sunny) | How warm the pond gets and how strongly it layers |
| Warm-layer stirring floor (0.5–1 m) | Keeps the surface from overheating in calm weather |
| Sideways mixing strength | How fast a spot spreads |
| Colony size | How fast colonies float and pile up downwind |
| Surface-skin depth (about 1 cm) | How fast scums at the very surface drift |
| Dense layer: thickness, mixing rate, when wind breaks it up | Whether an injection slides to the deep end or mixes in at once |
| Liquid peroxide strength (35% assumed) | How dense an injected peroxide layer is |
| How fast peroxide faded in the lab test (0.46 per hour) | How tough the peroxide EC50 makes the cells look |
| Bloom photosynthesis rate and the light it needs | Size of the daily oxygen swing |
| Other breathing balancing the untreated pond, and how much keeps going after a treatment | How deep the oxygen low gets after a big knock-down |
| Tree height (15 m) and the wind a fully sheltered pond still gets (20%) | How much a wooded pond is stirred |
| Calm-air heat loss factor | How fast a pond cools on still nights |
| Lab-water hardness behind the copper values for animals (100 mg/L) | Every copper margin for fish and water fleas, 0.5-2.4× |
| Hardness when you don't enter it (taken as the alkalinity) | Copper margins for animals |
| How fast and how much clay binds diquat | Diquat knock-down in muddy water |

<mark>Still to verify in the data: the flumioxazin <i>Anabaena</i> species and test length, and whether the diquat values are for the diquat cation or the salt. (The cation-or-salt answer also changes the injected diquat's density: the model assumes cation, 20% of the product.) Also confirm which liquid peroxide strength to assume; 35% is a placeholder, and pond products are sold at about 27 to 50%.</mark>

---

## How it was checked

There are 284 automated tests of the models, a browser test of the page, and a Python cross-check:

- **Well-mixed model (74 tests).** A layered pond's warm top is the top of the same bowl as the layers model, with its share of the bed (fixed Nov 8, 2026; it used to be a straight-sided slab with no bed under it). Copper effect levels for animals follow the EPA hardness rule and are unchanged at the assumed lab hardness. Diquat binding gives the same answer in one long step or a hundred short ones, and fills the room or binds everything as it should. The peroxide calibration replays the lab's fading dose and gives exactly 50% at the EC50 for both kill rules, and your own peroxide test is treated the same way. An untreated bloom makes oxygen swing through the day with its low around dawn, and a big knock-down drops the low far below the untreated pond's. It reproduces the worked numbers in the blueprint. Decay matches the exact formula. No product appears or disappears. A separate Python version of the same equations agrees to about 1 part in 10¹⁰ across 35 scenarios, including the bloom's oxygen under clear, cloudy and downloaded sunlight, your own measurements and diquat binding. (The largest gaps are in diquat concentrations close to zero after binding.)
- **Layers model (96 tests):**
  - grain settling speeds against a published table
  - mixing against the exact answer for spreading
  - no product or cells appearing or disappearing
  - a fully mixed pond giving the same answer as the well-mixed model
  - a deep pond staying layered and a shallow windy pond turning over every night
  - with the sunlight that balances the heat budget at your reading, the water stays within 1.5 °C of it; under a run of sunny days it warms and levels off below 95 °F
  - the sky's heat radiation never exceeding its physical maximum; light-wind and calm-air heat loss; trees cutting the wind more for small ponds than for big lakes; the bowl-shaped stirring energy mixing a 16-ft pond in a 9 mph wind on most days at the old sunlight; diquat bound below the spray layer too
  - stronger wind never making the stirred layer shallower, for ponds 1.5 to 10 m deep
  - a 10 m pond staying layered in a light breeze; a strong wind mixing a 5 m pond to the bottom on most days, and a light breeze never doing so
  - real weather: the idealized day fed in as hourly weather gives the same answer as the idealized day (within 0.03 °C); a windy day stirs deeper than a calm one; real sunlight is not scaled; no impossible values
  - matching your reading: the surface matches it, the bottom water isn't dragged along when hot weather and a cool reading disagree, and the page is told about the mismatch
  - review fixes: the runs use one kill rule and report the other as a scenario; other organisms are judged the same way in both models; dosed-once tests are compared with the 1-hour peak and steady tests with the worst test-length average; animals near the bottom get their own margin; the copper green-alga value was the sparse-density one (back to the matched 1.873 on Nov 8); oxygen swings with the bloom under real, unscaled sunlight
  - your own measurements: average depth, bottom temperature, Secchi depth, measured toxin, peroxide half-life and your own EC50 each land where they should, and stay fixed in the uncertainty runs
  - toxin: all toxin starts at toxin per chlorophyll × chlorophyll (times how much floating cells crowd the top water), dissolved toxin never exceeds it, it never rises in the well-mixed model, and a weak knock-down leaves it above 8 µg/L
- **Map and slice (114 tests):**
  - added Nov 8, 2026: the up-and-down step keeps an even spread exactly even (8 cases, every depth band within 4%); colonies that follow the water stay spread by water volume from upwind to downwind on the map and in the side slice (each fifth within 15%, three seeds; it was up to 32% on the map and 240% in the slice) and fill the top 7% of the water by its share; sunlight breaks down dissolved toxin by the same rule in all three models; floating colonies gather on the downwind half in wind (three seeds, against calm water)
  - the map's depths match the bowl, and its water matches the layers model's in 1-, 2- and 8-ft ponds; a bow-tie outline is caught and still sized right; a southwest wind runs at 225°
  - non-floating colonies stay spread by water in a 7 mph wind (each third within 4 points); a spray starts in the top few inches, as in the layers model; diquat knock-down on the map and in the layers model within 10 points
  - water is conserved in every square to about one part in 10¹⁵
  - the swirl runs downwind along the edges and upwind in the middle, as the theory says
  - product is conserved to better than one part in a billion for every product and treatment pattern
  - with a dam to the north or east, the deepest square sits about 75% of the way toward that shore, with the same water volume
  - neutral colonies stay evenly spread top to bottom, and on the map they spread by water, not by area (within 4 points of each third's share of the water with no wind; no pile-up in shallow water in a breeze)
  - each colony's own toughness reproduces the population kill curve
  - floating colonies drift downwind in wind and stay put without it
  - no impossible values for any product, method or pond shape
  - toxin adds up exactly, and each knocked-down colony releases exactly its own toxin
  - peroxide breaking down raises oxygen; a big copper knock-down lowers it by about the same amount as in the layers model (within 0.5 mg/L, as the two spread the bloom's own oxygen differently); with no knock-down, oxygen at dawn is within 1 mg/L across the map (shallow water, all of it in bright light, makes a little more)
  - the tilt equals u\*²/(g′h), eases toward that value without passing it, the warm layer is thicker downwind, and upwelling happens only upwind and only when the tilt is switched on
  - the surface skin moves at 0.53 × the air's friction velocity, adds no net water flow, and makes floating colonies drift further
  - the dense layer conserves product, lasts hours in calm water, carries product to the deepest water, and mixes in at once in wind
  - changing wind: product and toxin still add up exactly; floating colonies ride northeast under a southwest wind and come back when it turns; the top-water current follows each hour's wind; a steady real wind gives about the same knock-down as the layers model; a crosswind drives no loop in the slice; dead calm runs cleanly
- **The page (in a real browser).** The weather, place-search and map services are replaced with fake answers, so this checks the page's handling, not the services. It checks finding a place, loading and labeling a forecast, the archive for old dates, refusing dates past the forecast, filling a short forecast, falling back to the idealized day when a service fails, listing and picking a mapped pond, and no sideways scrolling on a phone.

What the tests **can't** show is that the predictions match a real pond. They show the math does what it says. Matching a real pond needs real pond data.

---

## What it does not do yet

- Real weather comes from a weather model for the area, not from a station at the pond. Forecasts lose skill after about a week, and a sheltered pond can be calmer than the area's wind.
- No inflows or outflows.
- No waves, and so no wave (Stokes) drift on top of the surface skin.
- No sloshing of the thermocline after the wind changes (internal seiches). The tilt is the steady one.
- No plume right at the injection hose: the dense layer starts already spread over each treated square.
- No colonies sinking a little by day and rising at night.
- Copper's harm to animals follows hardness only, not the dissolved organic carbon or pH that also matter (the EPA's biotic ligand model).
- The idealized day's sunshine is an estimate, and the stirred layer has a 2.5-ft minimum by day. On a run of sunny days the top 2.5 ft of a 6-ft pond warms about 6 °C (11 °F) by afternoon, at the high end of what small ponds show.
- Pond size changes the wind only through tree shelter; an open pond mixes the same at any size.
- No oxygen in the cool bottom water of a layered pond.
- No check against a real pond.

---

## Words to use and avoid

| Say | Don't say |
|---|---|
| "predicts", "model prediction" | "shows what will happen", "proves" |
| "built on simplified fluid physics (turbulent mixing, buoyancy, Stokes settling, wind-driven circulation)" | "solves the Navier–Stokes equations" |
| "not yet tested against a real pond" | anything implying lab or field testing was done |
| "knocked down (photosynthesis or growth stopped)" | "killed" (the lab tests didn't measure death) |
| "the product's predicted exposure is above the lab effect level for water fleas" | "this product is unsafe" (registered products follow their labels) |

---

## Questions you might get

**Why not solve the full Navier–Stokes equations?**
In a small pond the vertical matters most (does the product stay with the bloom?), and 3-D flow would need a detailed depth map and wind data nobody has for a typical farm pond. It would also take hours to run and couldn't be checked anyway. So we use the averaged, simplified forms that standard lake models use (GLM is one-dimensional), and add sideways currents with a textbook wind-circulation method.

**How do you know it's right?**
We know the math does what the published equations say, because 284 tests check it. We don't yet know how well it matches a real pond. That needs before-and-after measurements in a treated pond, ideally with a dye or product sample at a few spots and depths.

**Where do the numbers come from?**
Every number is listed on the page with its source and a label (SOURCED, DERIVED or ESTIMATE). The effect levels come from the CyanoSelect dataset of published lab tests.

**Why can the map's knock-down differ from the tile's?**
The tile is the median of 200 runs with different assumptions. The map is one run with the central assumptions, which can land above or below the median (the caption says where; in the example it is about the 49th percentile, so they nearly match: 63% on the map, 67% on the tile). The spread is the honest answer: knock-down is the most uncertain prediction, because no one has measured how fast these chemicals damage cells over time.

**Why do colonies pile up on one shore?**
*Microcystis* floats. The top water moves downwind at about half a percent of the wind speed and returns underneath. Floating colonies stay in the top water, so they ride downwind and collect against the shore, the way real scums form.

**Why does the middle of the pond flow upwind?**
The wind pushes shallow water more easily than deep water, so the edges race downwind and the water returns through the deep middle. This "topographic gyre" is classic lake physics.

**Does a thermocline really tilt in a pond?**
Yes. It is the same physics as in big lakes, just smaller. The wind pushes warm water to the downwind end and the boundary slopes. In small ponds the tilt is usually gentle, a couple of inches across the pond, unless the pond is long and the wind is strong. The Wedderburn number on the page tells you which case you are in.

**Why does an injected product only slide downhill when the wind is calm?**
Diluted into the bottom water, the product only makes the water a few hundredths of a kg/m³ denser, about the same as being 0.1 °C cooler. Wind stirring easily beats that. In calm water nothing breaks it up, so the dense layer creeps toward the deepest spot.

**Isn't 1,000 colonies too few?**
Each tracked colony stands for a share of the bloom. With 1,000, the sampling noise in the knock-down percentage is about 1.5 points at most, much smaller than the uncertainty in the biology.

**Is the address I type sent anywhere?**
Only if you use the place search. The text goes to OpenStreetMap's place search (Nominatim) to find the spot. The spot's latitude and longitude then go to Open-Meteo for the weather and, if you ask for the outline, to the USGS map service. The page saves nothing after you close it. Typing a latitude and longitude skips the place search. The idealized day sends nothing at all.

**What would make it better?**
Real pond data, mainly: product concentrations at a few spots and depths after a treatment, plus before-and-after bloom counts and oxygen readings. Next would be colonies sinking by day and bottom-water oxygen.

---

## Where each piece lives in the code

| File | What's in it |
|---|---|
| `sim-core.js` | Well-mixed model, chemical loss laws, kill rules, toxin, oxygen, the parameter table |
| `sim-column.js` | Layers model: bowl, heat budget, layering, mixing, release, colonies |
| `sim-2d.js` | Map and side slice: grid, depths, wind circulation, surface skin, thermocline tilt, dense injected layer, transport, toxin and oxygen, tracked colonies |
| `sim-worker.js` | Runs the models in the background so the page stays smooth |
| `tools/page.src.html` | The page, including the place search, the weather download and the outline lookup |
| `tests/` | The test files |

# Selectivity Tool Website

Interactive website for the **Selectivity Tool**, a free, open-source framework that
compares harmful algal bloom (HAB) treatments by their predicted risk to non-target
organisms, using published toxicity data.

**Live site:** https://cyanoselect.org/

Treatments are usually compared on how well they control the bloom. This tool adds
a comparison of predicted risk to green algae, zooplankton, and fish, to help
identify the lowest-risk option.

## What's here

A static site with no backend. It runs entirely in the browser and deploys to **Netlify** from the `main` branch, root folder. Reorganized again in November 2026 into two products, each with its own sub-nav (see `DESIGN_NOTES.md`).

| Page | URL | What's on it |
|---|---|---|
| Home | `/` | Hero, one tile per product, outreach tile, facts strip |
| Selectivity Tool | `/selectivity/` | The interactive ranking (`assets/rank.js`) |
| How it works | `/selectivity/how-it-works/` (+ `why/`, `math/`, `limits/`) | Score, separate, combine; worked example; data gap; the math; limitations and next steps |
| Pond Simulator | `/simulator/` | The simulator, inside the site's header, sub-nav and footer |
| How it works | `/simulator/how-it-works/` (+ `water/`, `currents/`, `treatment/`, `bloom/`, `checks/`) | Why we built it, worked example, then every equation by chapter (KaTeX 0.16.11 from jsDelivr, pinned with integrity hashes) |
| Outreach | `/outreach/` | One page with a sticky section bar: timeline, plant visit (photo grid and lightbox), conference talk (carousel and organization strip), expert review, what we learned, talks and articles. Its scripts are in `assets/outreach.js` |
| Data | `/data/` | Dataset download (`data/cyanoselect-dataset-2026-11-01.xlsx`), the data gap, findings, sources, corrections, labels |
| About | `/about/` | Team, why we started, timeline, talks, thanks, contact |

**Editing pages.** Every page except the simulator is built from a fragment in `tools/pages/`. The header, product sub-navs, chapter links and footer live once, in `tools/chrome.js`. After editing either, run:

```
node tools/build-site.js
```

Styles: `assets/chrome.css` (header, sub-nav, footer; also used by the simulator), `assets/site.css` (page styles). Scripts: `assets/site.js` (menu, accordions, reveal, section bar), `assets/outreach.js` (Outreach lightbox and carousel). `_redirects` sends every old URL (`/about.html`, `/rank/`, `/how-it-works/` …) to its new page and keeps `tools/`, the simulator's tests and notes, and internal notes off the public site. Old in-page anchors (`/#try`, `/how-it-works/#m-heat` …) are forwarded by a small script on the page they land on.

**Rebuilding the simulator page** after changing anything in `simulator/` or `tools/chrome.js`:

```
cd simulator && node tools/build-page.js && cd .. && node tools/wrap-simulator.js
```

`build-page.js` needs the `marked` package for the built-in guide. `wrap-simulator.js` adds the site header, the Pond Simulator sub-nav and the footer; it refuses to run twice on the same build. The simulator's own tests, review and README are in `simulator/`.

## The interactive tool

The Selectivity Tool page (`/selectivity/`) runs the ranking model live in the browser:

- Switch between **worst-axis (min-SI)** and **geometric mean** scoring, and watch
  the ranking reorder
- Toggle which non-target axes to include (green alga, *Daphnia*, fish)
- Toggle which treatments to include; combinations regenerate automatically

Switching the metric is the most informative interaction. Copper rises to the top
under the geometric mean, because its very high green-alga score masks a much
weaker *Daphnia* score. The worst-axis ranking exposes that; the average hides it.

The browser version uses the same math as the archived Python implementation. The
diquat values were corrected in September 2026 (see Corrections below), so they
differ from the archived release.

## Related repositories

- **Tool and data:** https://github.com/arjunpendharkar/selectivity-tool
- **This website (source):** https://github.com/siddharthsanthosh1/selectivity-tool-web
- **Archived release (DOI):** https://doi.org/10.5281/zenodo.22135606

## Important note

The rankings shown are **predictions generated from published literature data, not
laboratory measurements**. Laboratory validation is planned. See the
Limitations section on the site for the full list of caveats.

This tool is for education and research. It is not a treatment recommendation.
Registered products have undergone EPA risk assessment, and the product label
governs how they may be used. Consult a licensed aquatic applicator or your state
agency before treating any water body.

## Corrections

September 2026: diquat values corrected after expert review. An earlier version
paired mismatched studies and ranked diquat last.

October 2026: Data-gap count updated from 13 to 15 of 52 after published
Anabaena values for endothall and diquat were added. Thiazole amide (compound 10)
vs. Microcystis corrected from 0.08 to 1.51 mg/L; the earlier value belonged to a
different organism in the same study table.

## Deploying

Netlify, from the `main` branch, root folder. No build step on Netlify: commit the built pages.

## Authors

Built by **Arjun Pendharkar** and **Siddharth Santhosh**, Green Level High School,
under the supervision of **Dr. Bharathi Pandi**.

## License

MIT

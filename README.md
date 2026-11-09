# Selectivity Tool Website

Interactive website for the **Selectivity Tool**, a free, open-source framework that
compares harmful algal bloom (HAB) treatments by their predicted risk to non-target
organisms, using published toxicity data.

**Live site:** https://cyanoselect.org/

Treatments are usually compared on how well they control the bloom. This tool adds
a comparison of predicted risk to green algae, zooplankton, and fish, to help
identify the lowest-risk option.

## What's here

A static site with no backend. It runs entirely in the browser and deploys to **Netlify** from the `main` branch, root folder. Reorganized in November 2026 (see `SITE_AUDIT.md`).

| Page | File | What's on it |
|---|---|---|
| Home | `index.html` | What CyanoSelect is, three steps, credibility strip |
| Rank treatments | `rank/index.html` | The interactive ranking (`assets/rank.js`), the results table, limitations |
| Simulate your pond | `simulator/index.html` | The pond simulator in the site's header and footer |
| How it works | `how-it-works/index.html` | The story, the ranking math and every simulator equation (KaTeX 0.16.11 from jsDelivr, pinned with integrity hashes) |
| Data | `data/index.html` | Dataset download (`data/cyanoselect-dataset-2026-11-01.xlsx`), the data gap, sources, labels, corrections |
| About | `about/index.html` | Team, timeline, talks and articles, outreach, thanks, what's next, contact |

Shared files: `assets/chrome.css` (header and footer, also used by the simulator), `assets/site.css` (page styles), `assets/site.js` (menu, accordions, carousels). The header and footer are repeated in each page's HTML, so change them everywhere at once. `_redirects` sends `/about.html` to `/about/` and keeps the simulator's tests, tools and notes off the public site; `about.html` is a small redirect page for hosts without `_redirects`. Links to the old single-page anchors (`/#try`, `/#sources` …) are forwarded by a script on the home page.

**Rebuilding the simulator page** after changing anything in `simulator/`:

```
cd simulator && node tools/build-page.js && cd .. && node tools/wrap-simulator.js
```

`build-page.js` needs the `marked` package for the built-in guide. `wrap-simulator.js` adds the site header, intro and footer; it refuses to run twice on the same build. The simulator's own tests, review and README are in `simulator/`.

## The interactive tool

The "Try it yourself" section runs the ranking model live in the browser:

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

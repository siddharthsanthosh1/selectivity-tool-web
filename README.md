# Selectivity Tool Website

Interactive website for the **Selectivity Tool**, a free, open-source framework that
compares harmful algal bloom (HAB) treatments by their predicted risk to non-target
organisms, using published toxicity data.

**Live site:** https://siddharthsanthosh1.github.io/selectivity-tool-web/

Treatments are usually compared on how well they control the bloom. This tool adds
a comparison of predicted risk to green algae, zooplankton, and fish, to help
identify the lowest-risk option.

## What's here

A single static `index.html`. No build step, no dependencies, no backend. It runs
entirely in the browser and deploys to GitHub Pages as-is.

The page covers:
- The problem, using the June 2022 Jordan Lake incident as a case
- How the Selectivity Index works (SI = non-target EC50 divided by target EC50)
- Why three non-target axes are tracked separately rather than averaged
- Bliss independence for predicting treatment combinations
- A ranked results table for *Microcystis aeruginosa*
- Where the numbers come from: the published EC50 values behind each score
- **An interactive version of the ranking model** (see below)
- An honest list of limitations

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

## Deploying

GitHub Pages, from the `main` branch, root folder. No build step required.

## Authors

Built by **Arjun Pendharkar** and **Siddharth Santhosh**, Green Level High School,
under the supervision of **Dr. Bharati Pandi**.

## License

MIT

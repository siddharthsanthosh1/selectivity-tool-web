# Selectivity Tool Website

Interactive website for the **Selectivity Tool**, a framework for ranking harmful
algal bloom (HAB) treatments by how selectively they kill target cyanobacteria
while sparing non-target organisms.

**Live site:** https://siddharthsanthosh1.github.io/selectivity-tool-web/

Most evaluations of bloom-control treatments ask "what kills the bloom?" This tool
asks "what kills the bloom while sparing everything else?"

## What's here

A single static `index.html`. No build step, no dependencies, no backend. It runs
entirely in the browser and deploys to GitHub Pages as-is.

The page covers:
- The problem, using the June 2022 Jordan Lake incident as a case
- How the Selectivity Index works (SI = non-target EC50 divided by target EC50)
- Why three non-target axes are tracked separately rather than averaged
- Bliss independence for predicting treatment combinations
- A ranked results table for *Microcystis aeruginosa*
- **An interactive version of the ranking model** (see below)
- An honest list of limitations

## The interactive tool

The "Try it yourself" section runs the ranking model live in the browser:

- Switch between **worst-axis (min-SI)** and **geometric mean** scoring, and watch
  the ranking reorder
- Toggle which non-target axes to include (green alga, *Daphnia*, fish)
- Toggle which treatments to include; combinations regenerate automatically

Switching the metric is the most informative interaction. Diquat moves from last
place to mid-table, showing how averaging the axes can flatter a treatment that
fails badly on one of them.

The browser version reproduces the archived Python implementation exactly. The
Python code and the DOI below are the citable reference; this is an interactive
demonstration of it.

## Related repositories

- **Tool and data:** https://github.com/arjunpendharkar/selectivity-tool
- **This website (source):** https://github.com/siddharthsanthosh1/selectivity-tool-web
- **Archived release (DOI):** https://doi.org/10.5281/zenodo.22135606

## Important note

The rankings shown are **predictions generated from published literature data, not
laboratory measurements**. Laboratory validation is in progress. See the
Limitations section on the site for the full list of caveats.

## Deploying

GitHub Pages, from the `main` branch, root folder. No build step required.

## Authors

Built by **Arjun Pendharkar** and **Siddharth Santhosh**, Green Level High School,
under the supervision of **Dr. Bharati Pandi**.

## License

MIT

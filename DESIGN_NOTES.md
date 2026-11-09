# Design notes: cyanoselect.org layout (Nov 2026)

Internal notes, not part of the site (`_redirects` returns 404 for this file).

## What we borrowed from apple.com (layout patterns only)

Studied: the homepage, `/macbook-air/`, `/airpods-pro/`. We copy **structure only**. No Apple fonts (SF Pro is licensed), images, icons or wording.

| Pattern | What Apple does | What CyanoSelect does |
|---|---|---|
| Global nav | One slim bar: logo, then a short list of products, then utilities. | One slim (48 px), sticky teal bar: drop logo · Selectivity Tool · Pond Simulator · Outreach · Data · About. Hamburger under 820 px. |
| Product sub-nav | Under the global nav: product name on the left, that product's pages on the right (Overview, Tech Specs, Compare), with Buy as a button. It sticks. | A light sticky bar under the global nav: "Selectivity Tool" or "Pond Simulator" on the left, its pages on the right (Tool / Simulator, How it works). The page you are on is underlined in mint. On phones it scrolls sideways instead of wrapping. |
| Homepage tiles | Stacked full-width tiles, one per product, each with a big headline, a one-line tagline and a link pair ("Learn more", "Buy"). | Stacked tiles: hero, Selectivity Tool, Pond Simulator, Outreach, then a small facts strip. Each has a headline, a one-line subhead, two chevron links ("Open the tool >", "How it works >") and a screenshot. |
| Short sections | One idea per section, a short tagline above a short paragraph, lots of space. Long topics get their own pages (Tech Specs, Compare). | Every page is about 3–4 laptop screens or less. Long topics are split into chapter pages with previous/next links. The equation pages fold each symbol table into a "What the symbols mean" toggle. |
| "Keep exploring" | Cards near the end of a product page pointing to related pages. | Chapter lists and previous/next cards at the end of each How it works page. |
| Footer | Sitemap columns with bold headings, then a small-print row. | Sitemap columns (Selectivity Tool, Pond Simulator, Project, Open source, Contact), then the disclaimer, then the colophon. |

## What we kept from the old site (the last version before Nov 8, 2026)

- **Colours:** deep teal `#0A4F54`, teal `#0F6E74`, sea `#00A896`, mint `#02C39A`, panel `#EEF4F4`, amber `#C8772B` for warnings.
- **Fonts:** Fraunces for headings, Inter for text (Google Fonts, both open licence).
- **Hero:** the teal gradient with the three-wave bottom edge, white Fraunces headline, mint primary button, ghost secondary button, DOI badge and status dot.
- **Cards:** white, 14 px radius, 1 px `#D6E3E3` border, soft teal shadow. Bands alternate white, panel (`#EEF4F4`) and deep teal.
- **Components moved over unchanged:** the three steps (Score, Separate, Combine) with their diagrams, the incident card, findings, source cards, limitations list, tour photo grid, the conference carousel with lightbox, team cards, thanks grid, milestones.

## How the pages are built

- `tools/chrome.js` holds the global nav, both sub-navs, the chapter strip and the footer. It is the single copy.
- `tools/build-site.js` wraps each fragment in `tools/pages/` with that chrome and writes `<route>/index.html`. Run `node tools/build-site.js` after any edit.
- `tools/wrap-simulator.js` uses the same chrome for `/simulator/`.

# cyanoselect.org: site audit (Nov 8, 2026)

Done before any site edits. The repo had your Nov 1 edits to `index.html` and `about.html` uncommitted. You confirmed they are yours and intended, so the reorganization builds on top of them.

## What's there now

- **Two pages, both static, no build step:**
  - `index.html` (125 KB): one long scroll with 11 sections. Hero → The problem → How it works (Score, Separate, Combine) → Who it is for → Results (static table) → Three findings → Where the numbers come from (accordion; your Nov 1 "Added October 2026" cards are here) → Limitations (accordion) → Try it yourself (the interactive ranking) → Outreach (plant tour photos, NCLMS talk carousel, "Professional review" logo strip, what we learned, team) → Contact (What's next, Reach out, email, Use it / check it) → footer.
  - `about.html` (33 KB): team, why we did it, supervision and thanks, timeline, "Everything is public", footer.
- **Navigation:** 7 items (About, Overview, Results, Try it, Outreach, Contact, GitHub), mostly links to anchors on the home page. There is a hamburger menu on small screens.
- **Styles:**
  - About 700 lines of CSS, copied inline into both pages (the README asks you to keep the copies in sync by hand).
  - Brand colours: deep teal `#0A4F54` (`--deep`), teal `#0F6E74`, mint **`#02C39A`** (`--mint`).
  - **The mint in your brief (`#34D9AE`) is not the site's mint (`#02C39A`).** I kept the existing `#02C39A`; see "Decisions".
  - Fonts: Fraunces (headings) and Inter (text), from Google Fonts.
- **Scripts (all inline):** nav toggle, accordions, photo carousels, lightbox, and the ranking tool.
  - The ranking tool is a port of `selectivity_ranking.py`: Bliss independence, Hill slope 1, equipotent-on-target mixing, bisection for the 50%-effect dose.
  - Its SI table for *Microcystis*: copper 29.73 / 3.43 / 5.03, peroxide 10.57 / 2.48, diquat 4.87 / 18.42 / 497.03 (green alga / *Daphnia* / fish). These match the Nov 1 matrix.
- **Analytics:** GoatCounter (`cyanoselect.goatcounter.com`) on both pages.
- **Hosting:**
  - **Netlify** (the live site answers `server: Netlify`), but the repo has no `netlify.toml` or `_redirects`.
  - The README still says GitHub Pages.
  - `/about` and `/about.html` both work today (Netlify's pretty URLs).

## Cluttered or repeated

- **One page does everything:** method, results, sources, limitations, the tool, outreach, team, contact and plans. The tool, which most visitors come for, is section 9 of 11.
- **Repeated blocks:**
  - The "Use it, check it, or argue with it" box and the "Source and citation / License / Status / Contact" grid appear twice on each page (contact section and footer).
  - The disclaimer appears three times on the home page.
  - The team appears on both pages.
- **The static Results table repeats the interactive tool's default output.** Same six rows. Removed (your decision, Nov 8).
- **`about.html` carries a full second copy of the CSS.**

## Out of date

- **Data-gap count:** "13 of 52" no longer appears; every mention says 15 of 52. Nothing to fix.
- **Missing from the site:**
  - the simulator;
  - the LakeLine article (accepted);
  - Dr. Rob Richardson by name (the About page says "An NC State extension specialist").
- **README:** says the site deploys to GitHub Pages and has "two static pages".
- **The public dataset is old.** The data link (GitHub, `arjunpendharkar/selectivity-tool`) serves `FINAL1selectivity_matrix_updated.xlsx` last committed **Aug 28, 2026**, before the September diquat correction. It is not the Nov 1 dataset of record (36.8 KB vs 45.4 KB).

## Broken or dead links

- **None.** Every internal link, anchor and image resolves. Every external link returns 200: ABC11, GitHub ×4, DOI, GoatCounter, Google Fonts.

## Mobile

- No page-wide sideways scrolling at 390, 768 or 1440 px. The partner-logo strip overflows inside its own track, as intended.
- About 9 tap targets on the home page are under 24 px, mostly the carousel dots.
- Long tables scroll inside their cards, with a "scroll sideways" hint.

## Conflicts with the honesty rules

- **"Presented to and endorsed by leaders in water resource management … these professionals endorsed the approach"**, above a strip of company logos (Duke Energy, SePRO, Kasco, Dragonfly Pond Works, Cygnet Enterprises, Spirogyra, Foster Lake).
  - It can read as those organizations endorsing CyanoSelect.
  - The logo strip's own caption says only that they were represented at the presentation.
  - **Resolved (your decision, Nov 8):** the logos and the heading are gone. About now has one line: "Presented at the North Carolina Lake Management Society Fall Workshop, Oct 15, 2026, to lake managers from Duke Energy and Charlotte-Mecklenburg County, among others."
- **Unexplained acronyms on public pages:**
  - NCLMS, NC DEQ, NC State, EPA, ECOTOX, OECD;
  - SI (defined once, then used everywhere);
  - DOI and MIT, where they appear without context.
- **The ranking's limitations are good.** But nothing on the site yet says the simulator is a model prediction, because the simulator isn't on the site yet.

## Proposed new structure

| Page | URL | What's on it | Where its content comes from |
|---|---|---|---|
| Home | `/` | Hero ("Treat the bloom. Spare the lake."), two buttons, three steps, credibility strip, one-line disclaimer | New, short |
| Rank treatments | `/rank/` | "How to read this" (3 lines), the interactive ranking, the static results table, "Simulate this treatment" links | Old Results + Try it |
| Simulate your pond | `/simulator/` | Short intro and disclaimer, then the reviewed simulator inside the site's header and footer | `simulator/` (reviewed build) |
| How it works | `/how-it-works/` | Why we built this, ranking math, simulator math (one card per piece, KaTeX), worked example, what it doesn't do yet, how we checked it | Old The problem + How it works; the simulator's HOW-IT-WORKS.md; SIMULATOR_REVIEW.md |
| Data | `/data/` | Download, the data gap (15 of 52), the three findings, where the numbers come from (incl. your Nov 1 cards), labels (SOURCED, DERIVED, ESTIMATE), corrections | Old Findings + Sources + Corrections |
| About | `/about/` | Team, why we started, who it's for, timeline, talks and articles, outreach photos, thanks, what's next, contact | Old about.html + Outreach + Contact |

- **Navigation:** 5 items (Rank, Simulator, How it works, Data, About), with a hamburger menu under 768 px.
- **Footer on every page:** disclaimer, MIT license, DOI, GitHub, contact.
- **Old URLs keep working:**
  - `/about.html` redirects to `/about/`.
  - Old home-page anchors (`/#try`, `/#sources`, `/#visit` …) are forwarded to their new pages by a small script.

**Nothing is deleted.** Every section moves to a new page; the table below says where.

| Old section | New home |
|---|---|
| Hero, credibility | Home |
| The problem, How it works (Score/Separate/Combine) | How it works, Part 1 |
| Who it is for | About |
| Results table, Try it yourself | Rank |
| Three findings, Where the numbers come from, Corrections | Data |
| Limitations | How it works, "What it doesn't do yet" (linked from Rank) |
| Outreach (tour, NCLMS, logos, what we learned), What's next, Contact | About |

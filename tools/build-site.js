#!/usr/bin/env node
// Builds every content page of cyanoselect.org from the fragments in tools/pages/, wrapping each in
// the shared header, product sub-nav, chapter links and footer from tools/chrome.js.
//
//   node tools/build-site.js
//
// The simulator page (/simulator/) is built separately:
//   cd simulator && node tools/build-page.js && cd .. && node tools/wrap-simulator.js
//
// In a fragment, <!--CHAPTERS--> and <!--PAGER--> are replaced by the chapter list and the
// previous/next links. Output files are committed; Netlify serves them as they are (no build step).
'use strict';
const fs = require('fs'), path = require('path');
const C = require('./chrome');
const ROOT = path.join(__dirname, '..');
const SITE = 'https://cyanoselect.org';
const OG_IMAGE = SITE + '/images/og-preview.png';

const KATEX_CSS = '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" integrity="sha384-nB0miv6/jRmo5UMMR1wu3Gz6NLsoTkbqJghGIsx//Rlm+ZU03BU6SQNC66uf4l5+" crossorigin="anonymous">';
const KATEX_JS = `<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js" integrity="sha384-7zkQWkzuo3B5mTepMUcHkMB5jZaolc2xDwL6VFqjFALcbeS9Ggm/Yr2r3Dy4lfFg" crossorigin="anonymous"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js" integrity="sha384-43gviWU0YVjaDtb/GhzOouOXtZMP/7XUzwPTstBeZFe/+rCMvRwr4yROQP43s0Xk" crossorigin="anonymous"
  onload="renderMathInElement(document.getElementById('main'),{delimiters:[{left:'\\\\[',right:'\\\\]',display:true},{left:'\\\\(',right:'\\\\)',display:false}],throwOnError:false})"></script>`;

const S = '/selectivity/how-it-works/', M = '/simulator/how-it-works/';

// Old anchors (from the single-page site before Nov 2026, and from the Nov 8 layout) that now live on
// another page. A page only forwards hashes it doesn't have itself.
const FWD_HOME = {
  overview: S + 'why/', problem: S + 'why/#problem', how: S, who: S + 'why/#who',
  results: '/selectivity/', try: '/selectivity/', sources: '/data/sources/', limits: S + 'limits/',
  visit: '/outreach/#plant', nclms: '/outreach/#conference', contact: '/about/contact/', next: S + 'limits/#next',
  reach: '/about/contact/', cite: '/about/contact/#cite',
};
const FWD_ABOUT = {
  who: S + 'why/#who', 'who-sec': S + 'why/#who', visit: '/outreach/#plant', nclms: '/outreach/#conference', next: S + 'limits/#next',
  contact: '/about/contact/', reach: '/about/contact/', links: '/about/contact/#links', cite: '/about/contact/#cite',
};
const FWD_SELECTIVITY = { limits: S + 'limits/', 'limits-sec': S + 'limits/', results: '/selectivity/' };
const FWD_SEL_HIW = { worked: S + 'example/', example: S + 'example/', 'r-example': S + 'example/#r-example' };
// Earlier names for the plant-visit and conference sections.
const FWD_OUTREACH = { visit: '#plant', nclms: '#conference' };
const FWD_DATA = { sources: '/data/sources/', 'sources-sec': '/data/sources/' };
// Old /how-it-works/ (Nov 8 layout) is redirected here by _redirects; its anchors go to the chapters.
const FWD_SIM_HIW = {
  problem: S + 'why/#problem', ranking: S, how: S, 'r-si': S + 'math/#r-si', 'r-min': S + 'math/#r-min',
  'r-bliss': S + 'math/#r-bliss', 'r-example': S + 'example/#r-example', example: M + 'example/',
  'm-bowl': M + 'water/#m-bowl', 'm-light': M + 'water/#m-light', 'm-heat': M + 'water/#m-heat',
  'm-mixed': M + 'water/#m-mixed', 'm-k': M + 'water/#m-k',
  'm-counter': M + 'currents/#m-counter', 'm-tilt': M + 'currents/#m-tilt', 'm-swirl': M + 'currents/#m-swirl',
  'm-h2o2': M + 'treatment/#m-h2o2', 'm-flum': M + 'treatment/#m-flum', 'm-diquat': M + 'treatment/#m-diquat', 'm-copper': M + 'treatment/#m-copper',
  'm-rise': M + 'bloom/#m-rise', 'm-walk': M + 'bloom/#m-walk', 'm-guts': M + 'bloom/#m-guts', 'm-toxin': M + 'bloom/#m-toxin', 'm-oxygen': M + 'bloom/#m-oxygen',
  'm-runs': M + 'checks/#m-runs', limits: M + 'checks/#limits', checked: M + 'checks/#checked',
};

const PAGES = [
  { src: 'home.html', path: '/', section: 'home', fullTitle: 'CyanoSelect | Treat the bloom. Spare the lake.',
    desc: 'A free, open-source tool for pond and lake managers: rank algae bloom treatments by their predicted risk to green algae, water fleas and fish, and simulate a treatment in your own pond.', fwd: FWD_HOME },

  { src: 'selectivity.html', path: '/selectivity/', section: 'selectivity', sub: 'tool', title: 'Selectivity Tool',
    desc: 'Rank algae bloom treatments against Microcystis by their weakest predicted margin for green algae, water fleas and fish, from published lab data. Runs in your browser.',
    scripts: ['/assets/rank.js'], fwd: FWD_SELECTIVITY },
  { src: 'selectivity-hiw.html', path: S, section: 'selectivity', sub: 'hiw', chapter: true, title: 'How the Selectivity Tool works',
    desc: 'The selectivity index, why treatments are ranked by their weakest margin, how pairs are predicted with Bliss independence, and the data gap.', fwd: FWD_SEL_HIW },
  { src: 'selectivity-example.html', path: S + 'example/', section: 'selectivity', sub: 'hiw', chapter: true, katex: true, title: 'Worked example | Selectivity Tool',
    desc: 'Diquat against Microcystis, start to finish: the published EC50s, the three selectivity indices (4.9, 18.4 and 497) and where diquat ranks.' },
  { src: 'selectivity-why.html', path: S + 'why/', section: 'selectivity', sub: 'hiw', chapter: true, title: 'Why these three organisms | Selectivity Tool',
    desc: 'Why CyanoSelect scores every bloom treatment against a green alga, a water flea and a fish, and who the ranking is for.' },
  { src: 'selectivity-math.html', path: S + 'math/', section: 'selectivity', sub: 'hiw', chapter: true, katex: true, title: 'The ranking math | Selectivity Tool',
    desc: 'The selectivity index, the weakest-margin rule, Hill curves, Bliss independence and equipotent mixing, as used by the CyanoSelect ranking.' },
  { src: 'selectivity-limits.html', path: S + 'limits/', section: 'selectivity', sub: 'hiw', chapter: true, title: 'Limits and next steps | Selectivity Tool',
    desc: 'What the CyanoSelect ranking does not tell you, and the laboratory validation planned to test it.' },

  { src: 'simulator-hiw.html', path: M, section: 'simulator', sub: 'hiw', chapter: true, title: 'How the Pond Simulator works',
    desc: 'Why we built the pond simulator, what it predicts, what you need, its three views of a pond and a worked example.', fwd: FWD_SIM_HIW },
  { src: 'simulator-example.html', path: M + 'example/', section: 'simulator', sub: 'hiw', chapter: true, title: 'Worked example | Pond Simulator',
    desc: 'The simulator\u2019s example pond: 1 acre, a heavy Microcystis bloom and hydrogen peroxide at 3 mg/L, with the predicted knock-down, toxin and oxygen.' },
  { src: 'simulator-water.html', path: M + 'water/', section: 'simulator', sub: 'hiw', chapter: true, katex: true, title: 'The water | Pond Simulator',
    desc: 'Pond shape, light with depth, the heat budget, the mixed layer and eddy diffusivity in the CyanoSelect pond simulator.' },
  { src: 'simulator-currents.html', path: M + 'currents/', section: 'simulator', sub: 'hiw', chapter: true, katex: true, title: 'Currents | Pond Simulator',
    desc: 'The wind counterflow, the tilted thermocline and the topographic swirl in the CyanoSelect pond simulator.' },
  { src: 'simulator-treatment.html', path: M + 'treatment/', section: 'simulator', sub: 'hiw', chapter: true, katex: true, title: 'Treatment | Pond Simulator',
    desc: 'How hydrogen peroxide, flumioxazin, diquat and copper spread and break down in the CyanoSelect pond simulator.' },
  { src: 'simulator-bloom.html', path: M + 'bloom/', section: 'simulator', sub: 'hiw', chapter: true, katex: true, title: 'The bloom | Pond Simulator',
    desc: 'Colony rise and random walk, the damage model and knock-down, toxin and oxygen in the CyanoSelect pond simulator.' },
  { src: 'simulator-checks.html', path: M + 'checks/', section: 'simulator', sub: 'hiw', chapter: true, katex: true, title: 'Checks | Pond Simulator',
    desc: 'The 200 uncertainty runs, how the CyanoSelect pond simulator was checked, and what it doesn’t do yet.' },

  // Outreach is one long page on purpose (the 3–4 screen limit does not apply); its section bar links to anchors.
  { src: 'outreach.html', path: '/outreach/', section: 'outreach', sub: 'overview', title: 'Outreach',
    desc: 'Where CyanoSelect has been: the Cary/Apex Water Treatment Facility, the North Carolina Lake Management Society Fall Workshop, expert review, and the LakeLine article.',
    scripts: ['/assets/outreach.js'], fwd: FWD_OUTREACH },
  { src: 'data.html', path: '/data/', section: 'data', sub: 'dataset', title: 'Data',
    desc: 'Download the CyanoSelect dataset of published lab tests behind every ranking and simulator effect level, with its data gap, findings, labels and corrections.', fwd: FWD_DATA },
  { src: 'data-sources.html', path: '/data/sources/', section: 'data', sub: 'sources', title: 'Sources | Data',
    desc: 'The published EC50 values behind each CyanoSelect score, with their studies, test lengths and the values added in October 2026.' },
  { src: 'about.html', path: '/about/', section: 'about', sub: 'about', title: 'About',
    desc: 'CyanoSelect was built by Arjun Pendharkar and Siddharth Santhosh, seniors at Green Level High School in Cary, North Carolina: the team, the story and the timeline.', fwd: FWD_ABOUT },
  { src: 'about-contact.html', path: '/about/contact/', section: 'about', sub: 'contact', title: 'Contact and citing | About',
    desc: 'Tell us where CyanoSelect is wrong, email the authors, find the code and data, and cite the archived release.' },

  { src: '404.html', out: '404.html', path: '/404.html', section: '', title: 'Page not found', noindex: true,
    desc: 'That page is not on cyanoselect.org.' },
];

function forwarder(map) {
  if (!map) return '';
  return `<script>
/* Old links to sections that moved to another page go there. */
(function(){
  var map = ${JSON.stringify(map)};
  var h = location.hash.slice(1);
  if (h && map[h]) location.replace(map[h]);
})();
</script>
`;
}

function head(p) {
  const title = p.fullTitle || `${p.title} | CyanoSelect`;
  const url = SITE + p.path;
  const d = C.esc(p.desc), t = C.esc(title);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
<meta name="description" content="${d}">
${p.noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`}
<meta property="og:type" content="website">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
${p.noindex ? '' : `<meta property="og:url" content="${url}">\n`}<meta property="og:site_name" content="CyanoSelect">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="CyanoSelect: rank algae bloom treatments by their predicted risk to non-target organisms.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${OG_IMAGE}">
<meta name="theme-color" content="#0A4F54">
<link rel="icon" href="${C.FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/chrome.css">
<link rel="stylesheet" href="/assets/site.css">
${p.katex ? KATEX_CSS + '\n' : ''}${forwarder(p.fwd)}</head>`;
}

function build(p) {
  let body = fs.readFileSync(path.join(__dirname, 'pages', p.src), 'utf8').trim();
  const product = C.PRODUCTS[p.section] ? p.section : null;
  if (p.chapter) {
    body = body.replace('<!--CHAPTERS-->', C.chapterStrip(product, p.path)).replace('<!--PAGER-->', C.chapterPager(product, p.path));
  }
  if (/<!--(CHAPTERS|PAGER)-->/.test(body)) throw new Error(p.src + ': unreplaced placeholder');
  const scripts = ['/assets/site.js', ...(p.scripts || [])].map(s => `<script src="${s}"></script>`).join('\n');
  const html = `${head(p)}
<body${p.section ? ` class="pg-${p.section}"` : ''}>

${C.globalNav(p.section)}
${product ? C.subNav(product, p.sub, p.path) + '\n' : ''}
<main id="main">
${body}
</main>

${C.footer()}

${scripts}
${p.katex ? KATEX_JS + '\n' : ''}${C.GOATCOUNTER}
</body>
</html>
`;
  const out = path.join(ROOT, p.out || path.join(p.path, 'index.html'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return path.relative(ROOT, out);
}

if (require.main === module) {
  for (const p of PAGES) console.log('wrote', build(p));
}
module.exports = { PAGES };

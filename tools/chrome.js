// The one copy of the cyanoselect.org header, product sub-navs, chapter links and footer.
// Used by tools/build-site.js (every content page) and tools/wrap-simulator.js (/simulator/).
// Styles are in assets/chrome.css (all prefixed cs-, so they also work inside the simulator page).
'use strict';

const BRAND_SVG = '<svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#02C39A" opacity=".16"/><path d="M6 21c3-6 5-9 10-9s7 3 10 9" stroke="#02C39A" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="16" cy="10" r="2.6" fill="#00A896"/></svg>';

const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230A4F54'/%3E%3Cpath d='M6 21c3-6 5-9 10-9s7 3 10 9' stroke='%2302C39A' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3Ccircle cx='16' cy='10' r='2.6' fill='%2300A896'/%3E%3C/svg%3E";

// Global nav: [url, label, section]
const NAV = [
  ['/selectivity/', 'Selectivity Tool', 'selectivity'],
  ['/simulator/', 'Pond Simulator', 'simulator'],
  ['/outreach/', 'Outreach', 'outreach'],
  ['/data/', 'Data', 'data'],
  ['/about/', 'About', 'about'],
];

// Product sub-navs: name on the left, the product's pages on the right.
const PRODUCTS = {
  selectivity: {
    name: 'Selectivity Tool', home: '/selectivity/',
    links: [['/selectivity/', 'Tool', 'tool'], ['/selectivity/how-it-works/', 'How it works', 'hiw']],
  },
  simulator: {
    name: 'Pond Simulator', home: '/simulator/',
    links: [['/simulator/', 'Simulator', 'tool'], ['/simulator/how-it-works/', 'How it works', 'hiw']],
  },
  // Section bars for the other multi-page sections (same look as the product sub-navs).
  outreach: {
    name: 'Outreach', home: '/outreach/',
    links: [['/outreach/', 'Overview', 'overview'], ['/outreach/plant-visit/', 'Plant visit', 'plant'], ['/outreach/conference/', 'Conference talk', 'conference']],
  },
  data: {
    name: 'Data', home: '/data/',
    links: [['/data/', 'Dataset', 'dataset'], ['/data/sources/', 'Sources', 'sources']],
  },
  about: {
    name: 'About', home: '/about/',
    links: [['/about/', 'Team and story', 'about'], ['/about/contact/', 'Contact and citing', 'contact']],
  },
};

// "How it works" chapters for each product, in reading order: [url, short label, title]
const CHAPTERS = {
  selectivity: [
    ['/selectivity/how-it-works/', 'Overview', 'How the ranking works'],
    ['/selectivity/how-it-works/example/', 'Worked example', 'Worked example: diquat against Microcystis'],
    ['/selectivity/how-it-works/why/', 'Why these three', 'Why we score these three organisms'],
    ['/selectivity/how-it-works/math/', 'The math', 'The ranking math'],
    ['/selectivity/how-it-works/limits/', 'Limits and next steps', 'What it doesn’t tell you, and what’s next'],
  ],
  simulator: [
    ['/simulator/how-it-works/', 'Overview', 'How the simulator works'],
    ['/simulator/how-it-works/example/', 'Worked example', 'Worked example: one acre, one spray of peroxide'],
    ['/simulator/how-it-works/water/', 'Water', 'The water: shape, light, heat and mixing'],
    ['/simulator/how-it-works/currents/', 'Currents', 'Currents and the tilted thermocline'],
    ['/simulator/how-it-works/treatment/', 'Treatment', 'How each product spreads and breaks down'],
    ['/simulator/how-it-works/bloom/', 'Bloom', 'The bloom: colonies, damage, toxin and oxygen'],
    ['/simulator/how-it-works/checks/', 'Checks', 'Uncertainty, how we checked it, and what it doesn’t do yet'],
  ],
  outreach: [
    ['/outreach/', 'Overview', 'Outreach overview'],
    ['/outreach/plant-visit/', 'Plant visit', 'Inside the Cary/Apex Water Treatment Facility'],
    ['/outreach/conference/', 'Conference talk', 'Our talk at the North Carolina Lake Management Society'],
  ],
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function globalNav(section, skipTarget = '#main', skipLabel = 'Skip to content') {
  const links = NAV.map(([u, t, s]) =>
    `      <a href="${u}"${s === section ? ' aria-current="true"' : ''}>${t}</a>`).join('\n');
  return `<a class="cs-skip" href="${skipTarget}">${skipLabel}</a>
<nav class="cs-nav" aria-label="Main">
  <div class="cs-wrap cs-nav-in">
    <a class="cs-brand" href="/">${BRAND_SVG}CyanoSelect</a>
    <div class="cs-links" id="csMenu">
${links}
    </div>
    <button type="button" class="cs-toggle" id="csToggle" aria-expanded="false" aria-controls="csMenu" aria-label="Open menu"><span class="bars" aria-hidden="true"><i></i><i></i><i></i></span></button>
  </div>
</nav>`;
}

// active: 'tool' or 'hiw'; path: this page's URL (to mark the exact page)
function subNav(product, active, path) {
  const p = PRODUCTS[product];
  if (!p) return '';
  const links = p.links.map(([u, t, k]) => {
    const cur = u === path ? ' aria-current="page"' : (k === active ? ' aria-current="true"' : '');
    return `<a href="${u}"${cur}>${t}</a>`;
  }).join('');
  return `<nav class="cs-sub" aria-label="${p.name}">
  <div class="cs-wrap cs-sub-in">
    <a class="cs-sub-name" href="${p.home}">${p.name}</a>
    <div class="cs-sub-links">${links}</div>
  </div>
</nav>`;
}

// The chapter list under a How it works hero.
function chapterStrip(product, path) {
  const ch = CHAPTERS[product];
  const i = ch.findIndex(c => c[0] === path);
  return `<nav class="chapters" aria-label="How it works chapters">
  <div class="wrap">
    <ol class="chapters-list">
${ch.map(([u, t], k) => `      <li><a href="${u}"${k === i ? ' aria-current="page"' : ''}><span class="ch-n">${k === 0 ? '•' : k}</span>${t}</a></li>`).join('\n')}
    </ol>
  </div>
</nav>`;
}

// Previous / next cards at the end of a chapter.
function chapterPager(product, path) {
  const ch = CHAPTERS[product];
  const i = ch.findIndex(c => c[0] === path);
  const prev = ch[i - 1], next = ch[i + 1];
  const card = (c, dir) => c ? `<a class="pager-${dir}" href="${c[0]}"><span class="pager-k">${dir === 'prev' ? '‹ Previous' : 'Next ›'}</span><span class="pager-t">${c[2]}</span></a>` : '<span></span>';
  const tool = { selectivity: ['/selectivity/', 'Open the tool'], simulator: ['/simulator/', 'Open the simulator'] }[product];
  return `<nav class="pager" aria-label="${product === 'outreach' ? 'Outreach pages' : 'Chapter navigation'}">
  <div class="wrap">
    <div class="pager-row">${card(prev, 'prev')}${card(next, 'next')}</div>
${tool ? `    <p class="pager-tool"><a class="chev" href="${tool[0]}">${tool[1]}</a></p>\n` : ''}  </div>
</nav>`;
}

const DISCLAIMER = '<strong>Model predictions, not a treatment recommendation.</strong> CyanoSelect ranks treatments from published lab data and simulates ponds; none of its predictions has been tested in a real pond yet. Registered products have undergone risk assessment by the U.S. Environmental Protection Agency, and the product label governs how they may be used. Follow the label and your state’s rules, and consult a licensed aquatic applicator or your state agency before treating any water body.';

function footer() {
  const col = (h, items) => `      <div>
        <h2>${h}</h2>
${items.map(x => '        ' + x).join('\n')}
      </div>`;
  const a = (u, t) => `<a href="${u}">${t}</a>`;
  return `<footer class="cs-footer">
  <div class="cs-wrap">
    <div class="cs-foot-grid">
${col('Selectivity Tool', [a('/selectivity/', 'Open the tool'), ...CHAPTERS.selectivity.map(([u, t]) => a(u, t === 'Overview' ? 'How it works' : t))])}
${col('Pond Simulator', [a('/simulator/', 'Open the simulator'), ...CHAPTERS.simulator.map(([u, t]) => a(u, t === 'Overview' ? 'How it works' : t))])}
${col('Project', [a('/outreach/', 'Outreach'), a('/outreach/plant-visit/', 'Plant visit'), a('/outreach/conference/', 'Conference talk'), a('/data/', 'Data'), a('/data/sources/', 'Sources'), a('/about/', 'About'), a('/about/contact/', 'Contact'), a('/about/contact/#cite', 'How to cite')])}
${col('Open source', ['<p>MIT license: free to use, modify and share, with attribution.</p>', a('https://doi.org/10.5281/zenodo.22135606', 'Archived release (DOI):<br>doi.org/10.5281/zenodo.22135606'), a('https://github.com/arjunpendharkar/selectivity-tool', 'Tool and data on GitHub'), a('https://github.com/siddharthsanthosh1/selectivity-tool-web', 'Website source on GitHub')])}
${col('Contact', [a('mailto:siddharthsann@gmail.com', 'siddharthsann@gmail.com'), a('mailto:apandaharkar@gmail.com', 'apandaharkar@gmail.com'), '<p>Or open an issue on either GitHub repository.</p>', '<p class="cs-status"><span class="cs-dot"></span>Framework complete. Laboratory validation planned.</p>'])}
    </div>
    <p class="cs-disclaimer">${DISCLAIMER}</p>
    <p class="cs-colophon">Built by Arjun Pendharkar and Siddharth Santhosh, Green Level High School, under the supervision of Dr. Bharathi Pandi. This site describes research tools whose predictions have not yet been validated in a laboratory or a real pond, and it is not guidance for treating a waterbody.</p>
  </div>
</footer>`;
}

const GOATCOUNTER = `<script data-goatcounter="https://cyanoselect.goatcounter.com/count"
        async src="//gc.zgo.at/count.js"></script>`;

module.exports = { BRAND_SVG, FAVICON, NAV, PRODUCTS, CHAPTERS, DISCLAIMER, GOATCOUNTER, esc, globalNav, subNav, chapterStrip, chapterPager, footer };

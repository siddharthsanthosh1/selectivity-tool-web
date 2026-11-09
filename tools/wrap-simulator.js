#!/usr/bin/env node
// Wraps the simulator page (simulator/index.html, built by simulator/tools/build-page.js) in the
// cyanoselect.org header, intro and footer, so /simulator/ looks like part of the site. It adds the
// site's chrome.css, a short intro, the footer, GoatCounter and a ?product= pre-fill for links from
// the ranking page. It doesn't touch the model code or the page's own styles and scripts.
//
//   cd simulator && node tools/build-page.js && cd .. && node tools/wrap-simulator.js
//
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'simulator', 'index.html');
let html = fs.readFileSync(file, 'utf8');
const MARK = '<!-- cyanoselect site wrapper -->';
if (html.includes(MARK)) { console.error('simulator/index.html is already wrapped. Rebuild it first: cd simulator && node tools/build-page.js'); process.exit(1); }
const once = (s, a, b) => { const i = s.indexOf(a); if (i < 0 || s.indexOf(a, i + 1) >= 0) throw new Error('expected exactly one ' + a); return s.slice(0, i) + b + s.slice(i + a.length); };

const head = `${MARK}
<link rel="canonical" href="https://cyanoselect.org/simulator/">
<meta property="og:type" content="website">
<meta property="og:title" content="Simulate your pond | CyanoSelect">
<meta property="og:description" content="Predicts what one algaecide treatment does in your pond over 14 days: where the product goes, how much bloom is knocked down, toxin and oxygen. Model predictions, not a treatment recommendation.">
<meta property="og:url" content="https://cyanoselect.org/simulator/">
<meta property="og:site_name" content="CyanoSelect">
<meta property="og:image" content="https://cyanoselect.org/images/og-preview.png">
<meta name="theme-color" content="#0A4F54">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230A4F54'/%3E%3Cpath d='M6 21c3-6 5-9 10-9s7 3 10 9' stroke='%2302C39A' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E">
<link rel="stylesheet" href="/assets/chrome.css">
`;
const NAV = [['/rank/', 'Rank'], ['/simulator/', 'Simulator'], ['/how-it-works/', 'How it works'], ['/data/', 'Data'], ['/about/', 'About']];
const top = `<a class="cs-skip" href="#sim-form">Skip to the simulator</a>
<nav class="cs-nav" aria-label="Main">
  <div class="cs-wrap cs-nav-in">
    <a class="cs-brand" href="/"><svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#02C39A" opacity=".16"/><path d="M6 21c3-6 5-9 10-9s7 3 10 9" stroke="#02C39A" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="16" cy="10" r="2.6" fill="#00A896"/></svg>CyanoSelect</a>
    <div class="cs-links" id="csMenu">
${NAV.map(([u, t]) => `      <a href="${u}"${u === '/simulator/' ? ' aria-current="page"' : ''}>${t}</a>`).join('\n')}
    </div>
    <button type="button" class="cs-toggle" id="csToggle" aria-expanded="false" aria-controls="csMenu" aria-label="Open menu"><span class="bars" aria-hidden="true"><i></i><i></i><i></i></span></button>
  </div>
</nav>
<section class="cs-intro" aria-labelledby="cs-intro-h">
  <div class="cs-wrap">
    <h2 id="cs-intro-h">Simulate your pond</h2>
    <p>Enter your pond, the weather and one treatment. The simulator predicts the next 14 days, hour by hour.</p>
    <div class="cs-intro-grid">
      <div><h3>What it predicts</h3><p>Where the product goes, how much of the bloom is knocked down, toxin released into the water, oxygen through day and night, and how close green algae, water fleas and fish come to their lab effect levels.</p></div>
      <div><h3>What you need</h3><p>Your pond's area and deepest point, water temperature, pH, alkalinity and cloudiness, the bloom's chlorophyll, and the product, dose, method and time. For weather, give a place and date, or describe one typical day. Every other field is optional.</p></div>
    </div>
    <p class="cs-warn"><strong>Model predictions, not a treatment recommendation.</strong> Nothing here has been tested in a real pond yet. Follow the product label and your state's rules. <a href="/how-it-works/#simulator">How it works</a></p>
  </div>
</section>
`;
const bottom = `<footer class="cs-footer">
  <div class="cs-wrap">
    <p class="cs-disclaimer"><strong>Model predictions, not a treatment recommendation.</strong> CyanoSelect ranks treatments from published lab data and simulates ponds; none of its predictions has been tested in a real pond yet. Registered products have undergone risk assessment by the U.S. Environmental Protection Agency, and the product label governs how they may be used. Follow the label and your state's rules, and consult a licensed aquatic applicator or your state agency before treating any water body.</p>
    <div class="cs-foot-grid">
      <div><h2>CyanoSelect</h2><a href="/rank/">Rank treatments</a><a href="/simulator/">Simulate your pond</a><a href="/how-it-works/">How it works</a><a href="/data/">Data</a><a href="/about/">About</a></div>
      <div><h2>Open source</h2><p>MIT license: free to use, modify and share, with attribution.</p><a href="https://doi.org/10.5281/zenodo.22135606">Archived release: doi.org/10.5281/zenodo.22135606</a><a href="https://github.com/arjunpendharkar/selectivity-tool">Tool and data on GitHub</a><a href="https://github.com/siddharthsanthosh1/selectivity-tool-web">Website source on GitHub</a></div>
      <div><h2>Contact</h2><a href="mailto:siddharthsann@gmail.com">siddharthsann@gmail.com</a><a href="mailto:apandaharkar@gmail.com">apandaharkar@gmail.com</a><p>Or open an issue on either GitHub repository.</p></div>
    </div>
    <p class="cs-colophon">Built by Arjun Pendharkar and Siddharth Santhosh, Green Level High School, under the supervision of Dr. Bharathi Pandi. This site describes research tools whose predictions have not yet been validated in a laboratory or a real pond, and it is not guidance for treating a waterbody.</p>
  </div>
</footer>
<script>
/* site header: hamburger menu below 820 px */
(function(){
  var nav = document.querySelector(".cs-nav"), toggle = document.getElementById("csToggle"), menu = document.getElementById("csMenu");
  if (!nav || !toggle || !menu) return;
  function setOpen(o){ nav.classList.toggle("is-open", o); toggle.setAttribute("aria-expanded", o ? "true" : "false"); toggle.setAttribute("aria-label", o ? "Close menu" : "Open menu"); }
  toggle.addEventListener("click", function(e){ e.stopPropagation(); setOpen(!nav.classList.contains("is-open")); });
  document.addEventListener("click", function(e){ if (nav.classList.contains("is-open") && !nav.contains(e.target)) setOpen(false); });
  document.addEventListener("keydown", function(e){ if (e.key === "Escape" && nav.classList.contains("is-open")){ setOpen(false); toggle.focus(); } });
})();
/* /simulator/?product=diquat (links from the ranking page): pick that product, then the page runs as usual */
(function(){
  var m = /[?&]product=([a-z0-9_]+)/.exec(location.search), sel = document.getElementById("product");
  if (!m || !sel) return;
  for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === m[1]) {
    sel.value = m[1]; sel.dispatchEvent(new Event("change", { bubbles: true })); break;
  }
})();
</script>
<script data-goatcounter="https://cyanoselect.goatcounter.com/count"
        async src="//gc.zgo.at/count.js"></script>
`;
html = once(html, '<title>CyanoSelect Pond Simulator</title>', '<title>Simulate your pond | CyanoSelect</title>');
html = once(html, '</head>', head + '</head>');
html = html.replace(/<body([^>]*)>/, m => m + '\n' + top);
const i = html.lastIndexOf('</body>');
html = html.slice(0, i) + bottom + html.slice(i);
fs.writeFileSync(file, html);
console.log('wrapped', path.relative(process.cwd(), file));

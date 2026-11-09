#!/usr/bin/env node
// Wraps the simulator page (simulator/index.html, built by simulator/tools/build-page.js) in the
// cyanoselect.org header, the Pond Simulator sub-nav and the footer (all from tools/chrome.js), so
// /simulator/ looks like part of the site. It adds the site's chrome.css, the footer, GoatCounter and a ?product= pre-fill for links from
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
<meta property="og:title" content="Pond Simulator | CyanoSelect">
<meta property="og:description" content="Predicts what one algaecide treatment does in your pond over 14 days: where the product goes, how much bloom is knocked down, toxin and oxygen. Model predictions, not a treatment recommendation.">
<meta property="og:url" content="https://cyanoselect.org/simulator/">
<meta property="og:site_name" content="CyanoSelect">
<meta property="og:image" content="https://cyanoselect.org/images/og-preview.png">
<meta name="theme-color" content="#0A4F54">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230A4F54'/%3E%3Cpath d='M6 21c3-6 5-9 10-9s7 3 10 9' stroke='%2302C39A' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E">
<link rel="stylesheet" href="/assets/chrome.css">
`;
const C = require('./chrome');
// The page's own header (title, a short intro and the "Model prediction" stamp) is the intro; the
// longer "What it predicts / What you need" text is on /simulator/how-it-works/.
const top = `${C.globalNav('simulator', '#sim-form', 'Skip to the simulator')}
${C.subNav('simulator', 'tool', '/simulator/')}
`;
const bottom = `${C.footer()}
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
html = once(html, '<title>CyanoSelect Pond Simulator</title>', '<title>Pond Simulator | CyanoSelect</title>');
html = once(html, '</head>', head + '</head>');
html = once(html, '<button type="button" id="tab-guide" aria-pressed="false">How it works</button>', '<button type="button" id="tab-guide" aria-pressed="false">Full guide</button>');
html = html.replace(/<body([^>]*)>/, m => m + '\n' + top);
const i = html.lastIndexOf('</body>');
html = html.slice(0, i) + bottom + html.slice(i);
fs.writeFileSync(file, html);
console.log('wrapped', path.relative(process.cwd(), file));

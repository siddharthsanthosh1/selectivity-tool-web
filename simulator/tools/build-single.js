// Builds one self-contained HTML file: the page, the guide, and every model file inline, with the
// background workers made from the code already on the page (so it opens straight from disk).
// Run: node tools/build-single.js   → CyanoSelect-Pond-Simulator.html in the simulator folder
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const { buildPage } = require('./build-page.js');
let html = buildPage();
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const inline = (id, code, type) => `<script id="${id}"${type ? ` type="${type}"` : ''}>\n${code}\n</script>`;
for (const [file, id] of [['sim-core.js', 'src-core'], ['sim-column.js', 'src-column'], ['sim-2d.js', 'src-2d']]) {
  const tag = `<script src="${file}"></script>`;
  if (!html.includes(tag)) throw new Error('missing ' + tag);
  html = html.replace(tag, () => inline(id, read(file)));
}
// the worker's message handler without its importScripts line (the model code is prepended)
const workerBody = read('sim-worker.js').replace(/^\s*importScripts\([^)]*\);\s*$/m, '');
const boot = `${inline('src-worker', workerBody, 'text/plain')}
<script>
(function () {
  try {
    var code = ['src-core', 'src-column', 'src-2d', 'src-worker'].map(function (id) { return document.getElementById(id).textContent; }).join('\\n;\\n');
    window.__SIM_WORKER_URL = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  } catch (e) { /* no workers: the page runs the models itself */ }
})();
</script>`;
html = html.replace(inline('src-2d', read('sim-2d.js')), m => m + '\n' + boot);
if (!html.includes('__SIM_WORKER_URL = URL')) throw new Error('worker boot not inserted');
const out = path.join(root, 'CyanoSelect-Pond-Simulator.html');
fs.writeFileSync(out, html);
console.log('wrote ' + out + ' (' + Math.round(html.length / 1024) + ' KB)');

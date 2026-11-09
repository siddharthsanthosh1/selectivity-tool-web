// Builds the stand-alone index.html (full HTML document for the website) from page.src.html, with
// the plain-English guide (HOW-IT-WORKS.md) rendered into the "How it works" tab.
// page.src.html is the same page without the <html>/<head>/<body> wrapper.
// Run: node tools/build-page.js   (needs the `marked` package for the guide: npm install marked)
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(__dirname, 'page.src.html'), 'utf8');

function guideHTML() {
  const md = fs.readFileSync(path.join(root, 'HOW-IT-WORKS.md'), 'utf8');
  let marked;
  try { marked = require('marked'); } catch (e) { return '<p>Install the <code>marked</code> package and rebuild to include the guide here. It is also in HOW-IT-WORKS.md.</p>'; }
  const html = (marked.parse || marked.marked.parse)(md);
  return html.replace(/<table>/g, '<div class="tablewrap"><table>').replace(/<\/table>/g, '</table></div>');
}

function buildPage() {
  const cut = src.indexOf('</style>') + '</style>'.length;
  const head = src.slice(0, cut), body = src.slice(cut).replace('<!--GUIDE-->', guideHTML());
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
</head>
<body>
${body.trim()}
</body>
</html>
`;
}
module.exports = { buildPage };
if (require.main === module) {
  fs.writeFileSync(path.join(root, 'index.html'), buildPage());
  console.log('wrote index.html');
}

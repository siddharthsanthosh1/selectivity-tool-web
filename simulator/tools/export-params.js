// Writes params.json from sim-core.js so the Python reference uses the same numbers.
// Run after any parameter change: node tools/export-params.js
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('../sim-core.js');
const out = path.join(__dirname, '..', 'params.json');
fs.writeFileSync(out, JSON.stringify(S.exportParams(), null, 2) + '\n');
console.log('wrote ' + out);

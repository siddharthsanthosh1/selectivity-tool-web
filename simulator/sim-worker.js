// Background worker: runs the models off the page so typing stays smooth.
//   { id, kind: '1d', inp, members, seed } -> { id, kind: '1d', p1, p2 }   (well-mixed + layered, with uncertainty runs)
//   { id, kind: '2d', inp, seed, only }    -> progress messages, then { id, kind: '2d', r }   (map and/or side slice, central run;
//                                             only = 'map' or 'slice' lets the page run the two in parallel)
importScripts('sim-core.js', 'sim-column.js', 'sim-2d.js');
self.onmessage = function (e) {
  const { id, kind, inp, members, seed, only } = e.data;
  try {
    if (kind === '2d') {
      const r = CyanoMap.run2d(inp, { seed, only, onProgress: (stage, frac) => self.postMessage({ id, kind: 'progress', stage, frac }) });
      self.postMessage({ id, kind: '2d', r });
    } else {
      const p1 = CyanoSim.run(inp, { members, seed });
      const p2 = CyanoColumn.run(inp, { members, seed });
      self.postMessage({ id, kind: '1d', p1, p2 });
    }
  } catch (err) {
    self.postMessage({ id, kind: kind || '1d', error: String(err && err.message || err) });
  }
};

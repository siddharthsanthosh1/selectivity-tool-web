/* The interactive selectivity ranking, moved unchanged from index.html (Nov 2026). */
/* ============================================================
   Interactive selectivity ranking. Port of selectivity_ranking.py
   (Bliss independence, Hill slope 1, equipotent-on-target mixing).
   Runs entirely in the browser, no dependencies.
   ============================================================ */
(function(){
  "use strict";

  /* Selectivity Index values, target organism Microcystis aeruginosa,
     derived from published EC50 values (see "Where the numbers come from").
     Diquat was corrected in September 2026 to matched values from
     Peterson et al. 1997, so it differs from the DOI release. Hydrogen
     peroxide has no fish value; that gap is real and is handled by the
     fairness tiers. */
  const TREATMENTS = {
    "Copper sulfate":    { alga: 29.73, Daphnia: 3.43,  fish: 5.03 },
    "Hydrogen peroxide": { alga: 10.57, Daphnia: 2.48 },
    "Diquat dibromide":  { alga: 4.87,  Daphnia: 18.42, fish: 497.03 }
  };

  var CAVEATS = {
    "Copper sulfate":   "Effective dose rises with bloom cell density",
    "Diquat dibromide": "Ranking depends on which published values are paired"
  };

  /* Order used to name pairs, matching the Python implementation
     (e.g. "Hydrogen peroxide + Copper sulfate"). */
  var PAIR_ORDER = ["Hydrogen peroxide","Copper sulfate","Diquat dibromide"];

  var AXES = ["alga","Daphnia","fish"];
  var AXIS_LABEL = { alga:"Green alga", Daphnia:"Daphnia", fish:"Fish" };
  var AXIS_SHORT = { alga:"alga", Daphnia:"Daph", fish:"fish" };
  var HILL = 1.0;

  /* ---------- math ---------- */
  function eff(s, R){
    if (s <= 0) return 0;
    var x = Math.pow(s / R, HILL);
    return x / (x + 1);
  }
  function comboEff(s, Ra, Rb){
    var fa = eff(s, Ra), fb = eff(s, Rb);
    return fa + fb - fa * fb;
  }
  function s50(fn, target){
    target = target || 0.5;
    var lo = 1e-9, hi = 1e9, mid;
    for (var i = 0; i < 200; i++){
      mid = Math.sqrt(lo * hi);
      if (fn(mid) < target) lo = mid; else hi = mid;
    }
    return Math.sqrt(lo * hi);
  }
  function geomean(vals){
    var p = 1;
    for (var i = 0; i < vals.length; i++) p *= vals[i];
    return Math.pow(p, 1 / vals.length);
  }
  function scorePair(a, b, axes){
    var shared = axes.filter(function(ax){
      return a.SI[ax] != null && b.SI[ax] != null;
    });
    if (shared.length === 0) return null;
    var sT = s50(function(s){ return comboEff(s, 1.0, 1.0); });
    var comboSI = {};
    shared.forEach(function(ax){
      comboSI[ax] = s50(function(s){ return comboEff(s, a.SI[ax], b.SI[ax]); }) / sT;
    });
    return comboSI;
  }

  /* ---------- state ---------- */
  var state = {
    metric: "min",
    axes: ["alga","Daphnia"],
    tx: Object.keys(TREATMENTS),
    diquatAlga: TREATMENTS["Diquat dibromide"].alga
  };

  /* SI lookup. The diquat green-alga value comes from the data-choice
     control, so the same target EC50 can be paired with each published
     alga EC50 (0.492, 0.13, or 0.032 mg/L). */
  function siOf(name, ax){
    if (name === "Diquat dibromide" && ax === "alga") return state.diquatAlga;
    return TREATMENTS[name][ax];
  }

  var body     = document.getElementById("toolBody");
  var tierNote = document.getElementById("tierNote");
  var emptyMsg = document.getElementById("emptyMsg");
  var metricNote = document.getElementById("metricNote");
  var scrollHint = document.querySelector(".tool .scroll-hint");
  if (!body) return;

  var NOTE = {
    min: "Ranked by the weakest non-target axis. A treatment is only as selective as its worst link.",
    geo: "Ranked by the geometric mean of all axes. Notice copper rise to the top: its very high green-alga score masks a much weaker Daphnia score. The worst-axis ranking exposes that; the average hides it."
  };
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- build entries ---------- */
  function entries(){
    var axes = AXES.filter(function(ax){ return state.axes.indexOf(ax) > -1; });
    var pool = state.tx.map(function(name){
      var si = {};
      axes.forEach(function(ax){
        if (TREATMENTS[name][ax] != null) si[ax] = siOf(name, ax);
      });
      return { name: name, SI: si };
    }).filter(function(d){ return Object.keys(d.SI).length > 0; })
      .sort(function(a, b){ return PAIR_ORDER.indexOf(a.name) - PAIR_ORDER.indexOf(b.name); });

    var out = [];

    pool.forEach(function(d){
      var vals = Object.keys(d.SI).map(function(k){ return d.SI[k]; });
      out.push({
        key: d.name, label: d.name, combo: false, SI: d.SI, n: vals.length,
        min: Math.min.apply(null, vals), geo: geomean(vals),
        caveats: CAVEATS[d.name] ? [CAVEATS[d.name]] : []
      });
    });

    for (var i = 0; i < pool.length; i++){
      for (var j = i + 1; j < pool.length; j++){
        var cSI = scorePair(pool[i], pool[j], axes);
        if (!cSI) continue;
        var keys = Object.keys(cSI);
        var vals2 = keys.map(function(k){ return cSI[k]; });
        var cav = [];
        [pool[i].name, pool[j].name].forEach(function(n){ if (CAVEATS[n]) cav.push(CAVEATS[n]); });
        out.push({
          key: pool[i].name + " + " + pool[j].name,
          label: pool[i].name + " + " + pool[j].name,
          combo: true, SI: cSI, n: keys.length,
          min: Math.min.apply(null, vals2), geo: geomean(vals2),
          caveats: cav
        });
      }
    }
    return out;
  }

  /* ---------- render ---------- */
  function esc(t){ return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function axStr(SI){
    return AXES.filter(function(ax){ return SI[ax] != null; }).map(function(ax){
      return AXIS_SHORT[ax] + " " + SI[ax].toFixed(1);
    }).join(", ");
  }

  function rowHTML(e, rank){
    var fails = e.min < 1;
    var cls = fails ? ' class="fail"' : "";
    var tags = "";
    if (e.combo) tags += ' <span class="tag tag-combo">predicted</span>';
    if (fails)   tags += ' <span class="tag tag-fail">fails</span>';
    var cav = e.caveats.map(function(c){ return '<span class="caveat">' + esc(c) + "</span>"; }).join("");
    var minCls = state.metric === "min" ? "metric" : "metric off";
    var geoCls = state.metric === "geo" ? "metric" : "metric off";
    return '<tr data-key="' + esc(e.key) + '"' + cls + ">" +
      '<td class="rank">' + rank + "</td>" +
      '<td class="name">' + esc(e.label) + tags + cav +
        '<span class="ax-inline">' + esc(axStr(e.SI)) + "</span></td>" +
      '<td class="num ' + minCls + '" data-label="min-SI">' + e.min.toFixed(2) + "</td>" +
      '<td class="num ' + geoCls + '" data-label="geo mean">' + e.geo.toFixed(1) + "</td>" +
      '<td class="axcell">' + esc(axStr(e.SI)) + "</td>" +
    "</tr>";
  }

  function render(){
    var list = entries();
    var prev = {};
    Array.prototype.forEach.call(body.querySelectorAll("tr[data-key]"), function(tr){
      prev[tr.getAttribute("data-key")] = tr.getBoundingClientRect().top;
    });

    var tiers = [3,2,1].map(function(n){
      return {
        n: n,
        rows: list.filter(function(e){ return e.n === n; }).sort(function(a,b){
          return b[state.metric] - a[state.metric];
        })
      };
    }).filter(function(t){ return t.rows.length > 0; });

    var html = "";
    tiers.forEach(function(t){
      if (tiers.length > 1){
        html += '<tr class="grp"><td colspan="5">Scored on ' + t.n +
                (t.n === 1 ? " axis" : " axes") + "</td></tr>";
      }
      t.rows.forEach(function(e, i){ html += rowHTML(e, i + 1); });
    });

    body.innerHTML = html;
    var any = list.length > 0;
    emptyMsg.hidden = any;
    tierNote.hidden = tiers.length < 2;
    if (scrollHint) scrollHint.style.display = any ? "" : "none";

    if (reduced) return;

    /* FLIP: rows slide from their old position to the new one. */
    var moved = [];
    Array.prototype.forEach.call(body.querySelectorAll("tr[data-key]"), function(tr){
      var key = tr.getAttribute("data-key");
      if (!(key in prev)){ tr.classList.add("row-in"); return; }
      var delta = prev[key] - tr.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) return;
      tr.style.transition = "none";
      tr.style.transform = "translateY(" + delta + "px)";
      moved.push(tr);
    });
    if (!moved.length) return;
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        moved.forEach(function(tr){
          tr.style.transition = "transform .5s cubic-bezier(.22,.7,.3,1)";
          tr.style.transform = "";
        });
      });
    });
  }

  /* ---------- controls ---------- */
  Array.prototype.forEach.call(document.querySelectorAll(".seg-btn"), function(btn){
    btn.addEventListener("click", function(){
      if (btn.classList.contains("is-on")) return;
      Array.prototype.forEach.call(document.querySelectorAll(".seg-btn"), function(b){
        var on = b === btn;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-checked", on ? "true" : "false");
      });
      state.metric = btn.getAttribute("data-metric");
      metricNote.textContent = NOTE[state.metric];
      render();
    });
  });

  function readBoxes(id){
    return Array.prototype.filter.call(
      document.querySelectorAll("#" + id + " input"), function(i){ return i.checked; }
    ).map(function(i){ return i.value; });
  }
  ["axisPills","txPills"].forEach(function(id){
    document.getElementById(id).addEventListener("change", function(){
      state.axes = readBoxes("axisPills");
      state.tx   = readBoxes("txPills");
      render();
    });
  });

  document.getElementById("dataPills").addEventListener("change", function(e){
    state.diquatAlga = parseFloat(e.target.value);
    render();
  });

  render();
})();

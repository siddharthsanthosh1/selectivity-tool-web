/* CyanoSelect site scripts, shared by every content page. The accordion and reveal parts were moved
   unchanged from index.html (Nov 2026); each does nothing on a page without its elements. The
   Outreach lightbox and carousel are in outreach.js. */
/* Site header: hamburger menu below 820 px. */
(function(){
  var nav = document.querySelector(".cs-nav"), toggle = document.getElementById("csToggle"), menu = document.getElementById("csMenu");
  if (!nav || !toggle || !menu) return;
  function setOpen(open){
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }
  function isOpen(){ return nav.classList.contains("is-open"); }
  toggle.addEventListener("click", function(e){ e.stopPropagation(); setOpen(!isOpen()); });
  menu.addEventListener("click", function(e){ if (e.target.tagName === "A") setOpen(false); });
  document.addEventListener("click", function(e){ if (isOpen() && !nav.contains(e.target)) setOpen(false); });
  document.addEventListener("keydown", function(e){ if (e.key === "Escape" && isOpen()){ setOpen(false); toggle.focus(); } });
  window.addEventListener("resize", function(){ if (isOpen() && window.innerWidth > 820) setOpen(false); });
})();

/* Accordions: a link to #sources or #limits opens that section. */
(function(){
  function openFromHash(){
    var id = location.hash.slice(1);
    var el = id && document.getElementById(id);
    if (el && el.tagName === "DETAILS"){
      el.open = true;
      el.scrollIntoView();
    }
  }
  window.addEventListener("hashchange", openFromHash);
  openFromHash();
})();

(function(){
  var els = document.querySelectorAll('.reveal');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) {
    for (var i=0;i<els.length;i++) els[i].classList.add('in');
    return;
  }
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, {rootMargin: '0px 0px -8% 0px', threshold: 0.08});
  els.forEach(function(el){ io.observe(el); });
})();

/* Section bar on a one-page section (Outreach): mark the link for the section in view, and keep it
   visible when the bar scrolls sideways on phones. */
(function(){
  var links = Array.prototype.slice.call(document.querySelectorAll('.cs-sub-links a[href^="#"]'));
  if (!links.length) return;
  var bar = document.querySelector(".cs-sub-in");
  var items = links.map(function(a){ return { a: a, el: document.getElementById(a.getAttribute("href").slice(1)) }; })
    .filter(function(x){ return x.el; });
  var last = null, queued = false;
  function update(){
    queued = false;
    var line = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cs-head")) || 92) + 40;
    var cur = items[0];
    var atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    if (atEnd) cur = items[items.length - 1];
    else items.forEach(function(x){ if (x.el.getBoundingClientRect().top <= line) cur = x; });
    if (cur === last) return;
    last = cur;
    items.forEach(function(x){
      if (x === cur) x.a.setAttribute("aria-current", "true"); else x.a.removeAttribute("aria-current");
    });
    if (bar && bar.scrollWidth > bar.clientWidth) {
      var r = cur.a.getBoundingClientRect(), b = bar.getBoundingClientRect();
      if (r.left < b.left || r.right > b.right) bar.scrollLeft += r.left - b.left - (b.width - r.width) / 2;
    }
  }
  window.addEventListener("scroll", function(){ if (!queued){ queued = true; requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener("resize", update);
  update();
})();

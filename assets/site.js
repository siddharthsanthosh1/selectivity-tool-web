/* CyanoSelect site scripts, shared by every content page. The accordion, reveal, lightbox and
   carousel parts were moved unchanged from index.html (Nov 2026); each does nothing on a page
   without its elements. */
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

/* Field visit: open a photo full size. Without <dialog> support the link opens the image. */
(function(){
  var box = document.getElementById("lightbox");
  if (!box || typeof box.showModal !== "function") return;
  var img = box.querySelector("img");
  var cap = box.querySelector("p");

  Array.prototype.forEach.call(document.querySelectorAll(".shot a, .slide a"), function(a){
    a.addEventListener("click", function(e){
      e.preventDefault();
      var thumb = a.querySelector("img");
      img.src = a.getAttribute("href");
      img.alt = thumb.alt;
      var fc = a.parentNode.querySelector("figcaption");
      cap.textContent = fc ? fc.textContent : thumb.alt;
      box.showModal();
    });
  });
  box.querySelector(".lb-close").addEventListener("click", function(){ box.close(); });
  box.addEventListener("click", function(e){
    if (e.target === box) box.close();
  });
  box.addEventListener("close", function(){ img.removeAttribute("src"); });
})();

/* Photo carousels: swipe or scroll natively; buttons, dots and arrow keys jump between photos. */
Array.prototype.forEach.call(document.querySelectorAll(".carousel"), function(root){
  var track = root.querySelector(".car-track");
  var slides = root.querySelectorAll(".slide");
  var prev = root.querySelector('[data-dir="-1"]');
  var next = root.querySelector('[data-dir="1"]');
  var count = root.querySelector(".car-count");
  var dotsWrap = root.querySelector(".car-dots");
  var dots = [];
  var current = 0;

  Array.prototype.forEach.call(slides, function(s, i){
    var d = document.createElement("button");
    d.type = "button";
    d.className = "car-dot";
    d.setAttribute("aria-label", "Photo " + (i + 1));
    d.addEventListener("click", function(){ go(i); });
    dotsWrap.appendChild(d);
    dots.push(d);
  });

  function go(i){
    i = Math.max(0, Math.min(slides.length - 1, i));
    track.scrollTo({ left: slides[i].offsetLeft, behavior: getComputedStyle(track).scrollBehavior === "auto" ? "auto" : "smooth" });
  }

  function update(){
    var x = track.scrollLeft;
    var maxX = track.scrollWidth - track.clientWidth;
    var idx = 0, best = Infinity;
    if (x >= maxX - 2) idx = slides.length - 1;
    else {
      for (var i = 0; i < slides.length; i++) {
        var dist = Math.abs(slides[i].offsetLeft - x);
        if (dist < best) { best = dist; idx = i; }
      }
    }
    current = idx;
    count.textContent = (idx + 1) + " / " + slides.length;
    prev.disabled = x <= 2;
    next.disabled = x >= maxX - 2;
    dots.forEach(function(d, i){ d.setAttribute("aria-current", i === idx ? "true" : "false"); });
  }

  var queued = false;
  track.addEventListener("scroll", function(){
    if (queued) return;
    queued = true;
    requestAnimationFrame(function(){ queued = false; update(); });
  }, { passive: true });
  window.addEventListener("resize", update);

  prev.addEventListener("click", function(){ go(current - 1); });
  next.addEventListener("click", function(){ go(current + 1); });
  track.addEventListener("keydown", function(e){
    if (e.key === "ArrowLeft") { e.preventDefault(); go(current - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(current + 1); }
  });

  update();
});

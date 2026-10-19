/* Impact Grid — premium layer (homepage). Pure enhancement: if this file fails
   to load, the page works exactly as before. */
(function () {
  'use strict';
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 1. Start the hero viewfinder sequence once the page has painted */
  function go() { requestAnimationFrame(function () { root.classList.add('pg-go'); }); }
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go);

  /* 2. Gentle hero parallax (desktop only, skipped for reduced motion) */
  var img = document.getElementById('hHeroImg');
  var desktop = window.matchMedia && window.matchMedia('(min-width: 769px)');
  if (img && !reduce) {
    var ticking = false;
    function update() {
      ticking = false;
      if (!desktop.matches) { img.style.removeProperty('--pg-py'); return; }
      var y = Math.min(window.scrollY, 900);
      img.style.setProperty('--pg-py', (y * 0.06).toFixed(1) + 'px');
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
  }

  /* 3. "How it works" — lines draw and numbers fill when scrolled into view */
  var steps = document.querySelector('.h-steps');
  if (steps) {
    if (reduce || !('IntersectionObserver' in window)) {
      steps.classList.add('pg-in');
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { steps.classList.add('pg-in'); io.disconnect(); }
        });
      }, { threshold: 0.35 });
      io.observe(steps);
    }
  }
})();

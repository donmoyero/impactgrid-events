/* Impact Grid — premium layer for the public pages. Pure enhancement: if this
   file fails to load, the page works exactly as before (dividers stay visible,
   because the collapsed state only exists once the pg-js flag is set). */
(function () {
  'use strict';
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function reveal(el) { el.classList.add('pg-in'); }

  function watch() {
    var dividers = document.querySelectorAll('.divider:not(.pg-in)');
    if (!dividers.length) return;
    if (reduce || !('IntersectionObserver' in window)) {
      dividers.forEach(reveal);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); }
      });
    }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });
    dividers.forEach(function (d) { io.observe(d); });
  }

  function start() {
    root.classList.add('pg-js');
    watch();
    // Safety net: if the observer never fires, any divider already on screen
    // (or above it) is shown after 2.5s. Below-the-fold ones still reveal on scroll.
    setTimeout(function () {
      document.querySelectorAll('.divider:not(.pg-in)').forEach(function (d) {
        if (d.getBoundingClientRect().top < window.innerHeight) reveal(d);
      });
    }, 2500);
    // Dividers added later by page scripts (e.g. after services load)
    if ('MutationObserver' in window) {
      var mo = new MutationObserver(function () { watch(); });
      mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { mo.disconnect(); }, 15000);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

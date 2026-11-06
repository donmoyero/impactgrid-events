/* theme-init.js — runs in <head>, before the page paints, so there is no light→dark flash.
   Dark mode is used when:
     • the visitor has picked a theme with the site's toggle (saved as ig_theme), or
     • they haven't picked one and their device/browser is set to dark.
   If they never touch the toggle, the site simply follows the device — including live changes
   (e.g. phone switches to dark at sunset). */
(function () {
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function saved() {
    try { var s = localStorage.getItem('ig_theme'); return (s === 'dark' || s === 'light') ? s : null; }
    catch (e) { return null; }
  }
  function set(dark) {
    if (dark) root.setAttribute('data-theme', 'dark');
    else if (root.getAttribute('data-theme') === 'dark') root.removeAttribute('data-theme');
  }
  var s = saved();
  set(s ? s === 'dark' : !!(mq && mq.matches));

  /* follow the device live, but only while the visitor hasn't chosen manually */
  if (mq) {
    var onChange = function (e) { if (!saved()) set(e.matches); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
})();

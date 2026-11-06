/* theme-init.js — runs in <head>, before the page paints, so there is no light→dark flash.
   The site always follows the device/browser light/dark setting, including live changes
   (e.g. a phone switching to dark at sunset). There is no manual toggle. */
(function () {
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  /* forget any choice saved by the old Dark/Light toggle so it can't override the device */
  try { localStorage.removeItem('ig_theme'); } catch (e) {}
  function set(dark) {
    if (dark) root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
  }
  set(!!(mq && mq.matches));
  if (mq) {
    var onChange = function (e) { set(e.matches); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
})();

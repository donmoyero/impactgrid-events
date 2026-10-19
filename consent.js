/* ═══════════════════════════════════════════════════════
   ImpactGrid — Cookie consent (UK GDPR / PECR)
   - Nothing non-essential loads until the visitor accepts.
   - Accept all / Reject non-essential have equal prominence.
   - Choice is remembered for 12 months, then asked again.
   - Footer "Cookie settings" link (data-cookie-settings) reopens it.

   Categories
     essential  : always on (theme, login, this choice) — no consent needed
     analytics  : Google Analytics (G-KVJC5DE2WT)
     marketing  : Meta Pixel (1067608669288934) + Google AdSense

   Load this file in <head> on every page, in place of the old
   Meta Pixel / Google Analytics / AdSense snippets.
═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var KEY = 'ig_cookie_consent';
  var VERSION = 1;                       // bump to re-ask everyone
  var MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

  var GA_ID = 'G-KVJC5DE2WT';
  var FB_ID = '1067608669288934';
  var ADS_CLIENT = 'ca-pub-4028190825342082';

  /* ── storage (never throws) ── */
  function read() {
    try {
      var r = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!r || r.v !== VERSION || !r.ts || Date.now() - r.ts > MAX_AGE_MS) return null;
      return r;
    } catch (e) { return null; }
  }
  function write(analytics, marketing) {
    var r = { v: VERSION, analytics: !!analytics, marketing: !!marketing, ts: Date.now() };
    try { localStorage.setItem(KEY, JSON.stringify(r)); } catch (e) {}
    return r;
  }

  /* ── loaders (each runs at most once per page) ── */
  var loaded = { analytics: false, marketing: false };

  function addScript(src, attrs) {
    var s = document.createElement('script');
    s.async = true; s.src = src;
    if (attrs) for (var k in attrs) s.setAttribute(k, attrs[k]);
    document.head.appendChild(s);
  }

  function loadAnalytics() {
    if (loaded.analytics) return; loaded.analytics = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
    addScript('https://www.googletagmanager.com/gtag/js?id=' + GA_ID);
  }

  function loadMarketing() {
    if (loaded.marketing) return; loaded.marketing = true;
    /* Meta Pixel (standard snippet) */
    (function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = true; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', FB_ID);
    window.fbq('track', 'PageView');
    /* Google AdSense */
    addScript('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + ADS_CLIENT,
      { crossorigin: 'anonymous' });
  }

  function apply(r) {
    if (r && r.analytics) loadAnalytics();
    if (r && r.marketing) loadMarketing();
  }

  /* ── when consent is withdrawn: remove cookies we know about ── */
  function clearTrackingCookies() {
    var names = document.cookie.split(';').map(function (c) { return c.split('=')[0].trim(); });
    var host = location.hostname.split('.');
    var domains = ['', location.hostname];
    if (host.length > 1) domains.push('.' + host.slice(-2).join('.'));
    names.forEach(function (n) {
      if (/^(_ga|_gid|_gat|_fbp|_fbc|__gads|__gpi|_gcl_)/.test(n)) {
        domains.forEach(function (d) {
          document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : '');
        });
      }
    });
  }

  /* ── banner UI ── */
  var CSS = '' +
    '#ig-cc{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;display:flex;justify-content:center;padding:16px;pointer-events:none;font-family:var(--fb,"DM Sans",system-ui,sans-serif)}' +
    '#ig-cc *{box-sizing:border-box}' +
    '#ig-cc .ig-cc-box{pointer-events:auto;width:100%;max-width:640px;background:var(--card,#fff);color:var(--text,#0d0d0d);border:1px solid var(--border2,rgba(0,0,0,.13));border-radius:var(--r2,20px);box-shadow:0 12px 48px rgba(0,0,0,.22);padding:22px clamp(18px,4vw,28px);max-height:calc(100vh - 32px);overflow:auto}' +
    '#ig-cc h2{font-size:17px;font-weight:800;letter-spacing:-.01em;margin:0 0 8px}' +
    '#ig-cc p{font-size:13.5px;line-height:1.6;color:var(--text2,#2b2b2b);margin:0 0 14px}' +
    '#ig-cc a{color:var(--text,#0d0d0d);text-decoration:underline}' +
    '#ig-cc .ig-cc-row{display:flex;flex-wrap:wrap;gap:10px}' +
    '#ig-cc button{font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;border-radius:100px;padding:11px 20px;border:1px solid var(--text,#0d0d0d);flex:1 1 140px;min-height:44px}' +
    '#ig-cc .ig-cc-fill{background:var(--text,#0d0d0d);color:var(--bg,#faf7f2)}' +
    '#ig-cc .ig-cc-line{background:transparent;color:var(--text,#0d0d0d)}' +
    '#ig-cc button:focus-visible,#ig-cc input:focus-visible{outline:3px solid #2563eb;outline-offset:2px}' +
    '#ig-cc .ig-cc-opt{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;padding:12px 0;border-top:1px solid var(--border,rgba(0,0,0,.07))}' +
    '#ig-cc .ig-cc-opt strong{display:block;font-size:14px;margin-bottom:2px}' +
    '#ig-cc .ig-cc-opt span{font-size:12.5px;line-height:1.5;color:var(--text2,#2b2b2b)}' +
    '#ig-cc .ig-cc-opt input{width:22px;height:22px;margin-top:2px;flex:none;accent-color:var(--text,#0d0d0d)}' +
    '#ig-cc .ig-cc-prefs{margin-bottom:14px}';

  var root = null;

  function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstChild; }

  function close() { if (root) { root.remove(); root = null; } }

  function decide(analytics, marketing, hadConsentBefore) {
    var before = read();
    var withdrew = before && ((before.analytics && !analytics) || (before.marketing && !marketing));
    var r = write(analytics, marketing);
    close();
    if (withdrew) { clearTrackingCookies(); location.reload(); return; }  /* stops already-loaded scripts */
    apply(r);
  }

  function open(showPrefs) {
    if (!document.body) { document.addEventListener('DOMContentLoaded', function () { open(showPrefs); }); return; }
    close();
    if (!document.getElementById('ig-cc-style')) {
      var st = document.createElement('style'); st.id = 'ig-cc-style'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    var cur = read() || { analytics: false, marketing: false };

    var main =
      '<div id="ig-cc-main"' + (showPrefs ? ' hidden' : '') + '>' +
        '<h2 id="ig-cc-t">Cookies on Impact Grid</h2>' +
        '<p>We use essential cookies to make the site work. With your permission we also use analytics cookies (Google Analytics) to see how the site is used, and marketing cookies (Meta Pixel and Google AdSense) to measure and show relevant ads. ' +
        'You can change your mind at any time using “Cookie settings” in the footer. See our <a href="privacy.html#cookies">Cookies &amp; Tracking</a> policy.</p>' +
        '<div class="ig-cc-row">' +
          '<button type="button" class="ig-cc-fill" data-a="all">Accept all</button>' +
          '<button type="button" class="ig-cc-fill" data-a="none">Reject non-essential</button>' +
          '<button type="button" class="ig-cc-line" data-a="manage">Manage choices</button>' +
        '</div>' +
      '</div>';

    var prefs =
      '<div id="ig-cc-prefs"' + (showPrefs ? '' : ' hidden') + '>' +
        '<h2>Cookie settings</h2>' +
        '<div class="ig-cc-prefs">' +
          '<label class="ig-cc-opt"><div><strong>Essential</strong><span>Keeps you logged in, remembers light/dark mode and stores this choice. Always on.</span></div><input type="checkbox" checked disabled aria-label="Essential cookies, always on"></label>' +
          '<label class="ig-cc-opt"><div><strong>Analytics</strong><span>Google Analytics — anonymous-style stats on pages visited, so we can improve the site.</span></div><input type="checkbox" id="ig-cc-an"' + (cur.analytics ? ' checked' : '') + '></label>' +
          '<label class="ig-cc-opt"><div><strong>Marketing</strong><span>Meta Pixel and Google AdSense — measure ad performance and show relevant ads.</span></div><input type="checkbox" id="ig-cc-mk"' + (cur.marketing ? ' checked' : '') + '></label>' +
        '</div>' +
        '<div class="ig-cc-row">' +
          '<button type="button" class="ig-cc-fill" data-a="save">Save my choices</button>' +
          '<button type="button" class="ig-cc-line" data-a="all">Accept all</button>' +
          '<button type="button" class="ig-cc-line" data-a="none">Reject non-essential</button>' +
        '</div>' +
      '</div>';

    root = el('<div id="ig-cc" role="dialog" aria-modal="false" aria-labelledby="ig-cc-t"><div class="ig-cc-box">' + main + prefs + '</div></div>');
    document.body.appendChild(root);

    root.addEventListener('click', function (e) {
      var a = e.target && e.target.getAttribute && e.target.getAttribute('data-a');
      if (!a) return;
      if (a === 'all') decide(true, true);
      else if (a === 'none') decide(false, false);
      else if (a === 'save') decide(document.getElementById('ig-cc-an').checked, document.getElementById('ig-cc-mk').checked);
      else if (a === 'manage') {
        document.getElementById('ig-cc-main').hidden = true;
        document.getElementById('ig-cc-prefs').hidden = false;
        var f = root.querySelector('#ig-cc-prefs button'); if (f) f.focus();
      }
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && read()) close();
    });
    var first = root.querySelector('button'); if (first && showPrefs) first.focus();
  }

  /* ── public API + footer link ── */
  window.igOpenCookieSettings = function () { open(true); };
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-cookie-settings]') : null;
    if (t) { e.preventDefault(); open(true); }
  });

  /* ── start ── */
  var saved = read();
  if (saved) apply(saved);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { open(false); });
  else open(false);
})();

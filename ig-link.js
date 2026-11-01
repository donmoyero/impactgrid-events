/*
  ig-link.js
  Shared helpers for the "view on Instagram" button on portfolio photos/videos.
  Uses the same official Instagram icon already used in the site nav.
  Exposes: igSafeUrl(url), igBadge(url, label), igPlayBadge
*/
(function () {
  var n = 0;
  var ICON = '<svg width="20" height="20" viewBox="0 0 448 448" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="igGrad__ID__" cx="30%" cy="107%" r="150%"><stop offset="0%" stop-color="#fdf497"/><stop offset="5%" stop-color="#fdf497"/><stop offset="45%" stop-color="#fd5949"/><stop offset="60%" stop-color="#d6249f"/><stop offset="90%" stop-color="#285AEB"/></radialGradient></defs><path fill="url(#igGrad__ID__)" d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"/></svg>';

  window.igSafeUrl = function (u) {
    u = String(u || '').trim();
    return /^https:\/\/(www\.)?(instagram\.com|instagr\.am)\/\S+$/i.test(u) ? u : '';
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.igBadge = function (url, label) {
    var safe = window.igSafeUrl(url);
    if (!safe) return '';
    n++;
    return '<a class="ig-badge" href="' + esc(safe) + '" target="_blank" rel="noopener noreferrer" ' +
      'aria-label="' + esc(label || 'View on Instagram') + '" title="View on Instagram">' +
      ICON.replace(/__ID__/g, String(n)) + '</a>';
  };

  /* Tile for items that are only an Instagram link (no uploaded photo) */
  window.igPlaceholder = function (url, label, isVideo) {
    var safe = window.igSafeUrl(url);
    if (!safe) return '';
    n++;
    return '<a class="ig-ph" href="' + esc(safe) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(label || 'View on Instagram') + '">' +
      '<span class="ig-ph-ico">' + ICON.replace(/__ID__/g, String(n)) + '</span>' +
      '<span class="ig-ph-txt">' + (isVideo ? 'Watch on Instagram' : 'View on Instagram') + '</span></a>';
  };


  /* Small "Instagram" button (icon + word) for card action rows */
  window.igButton = function (url, label) {
    var safe = window.igSafeUrl(url);
    if (!safe) return '';
    n++;
    return '<a class="ig-btn" href="' + esc(safe) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(label || 'View on Instagram') + '">' +
      ICON.replace(/__ID__/g, String(n)) + '<span>Instagram</span></a>';
  };

  /* The actual Instagram post/reel, shown on the page with Instagram's official embed.
     Instagram's embed sets Meta cookies, so it only loads automatically when the visitor
     has allowed Marketing cookies; otherwise they see a tile and one click loads it. */
  function cleanPermalink(u) {
    try { var x = new URL(u); return x.origin + x.pathname.replace(/\/?$/, '/'); } catch (e) { return u; }
  }
  window.igEmbed = function (url, label, isVideo) {
    var safe = window.igSafeUrl(url);
    if (!safe) return '';
    n++;
    return '<div class="ig-embed" data-ig-url="' + esc(cleanPermalink(safe)) + '">' +
      '<button type="button" class="ig-ph" data-ig-load aria-label="' + esc(label || 'Show Instagram post') + '">' +
        '<span class="ig-ph-ico">' + ICON.replace(/__ID__/g, String(n)) + '</span>' +
        '<span class="ig-ph-txt">' + (isVideo ? 'Show Instagram reel' : 'Show Instagram post') + '</span>' +
        '<span class="ig-ph-sub">Loads from Instagram</span>' +
      '</button></div>';
  };

  var scriptState = 0;   // 0 none, 1 loading, 2 ready
  function processEmbeds() { try { window.instgrm && window.instgrm.Embeds.process(); } catch (e) {} }
  function loadEmbedScript() {
    if (window.instgrm && window.instgrm.Embeds) { processEmbeds(); return; }
    if (scriptState) return;
    scriptState = 1;
    var sc = document.createElement('script');
    sc.async = true; sc.src = 'https://www.instagram.com/embed.js';
    sc.onload = function () { scriptState = 2; processEmbeds(); };
    sc.onerror = function () { scriptState = 0; };
    document.body.appendChild(sc);
  }
  function mount(box) {
    if (box.classList.contains('is-live')) return;
    var url = box.getAttribute('data-ig-url');
    box.classList.add('is-live');
    box.innerHTML = '<blockquote class="instagram-media" data-instgrm-captioned data-instgrm-permalink="' + esc(url) + '" data-instgrm-version="14">' +
      '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">View this post on Instagram</a></blockquote>';
    loadEmbedScript();
  }
  window.igHydrate = function (root) {
    var ok = window.igConsent && window.igConsent.marketing && window.igConsent.marketing();
    if (!ok) return;
    (root || document).querySelectorAll('.ig-embed:not(.is-live)').forEach(mount);
  };
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-ig-load]') : null;
    if (!b) return;
    var box = b.closest('.ig-embed');
    if (box) mount(box);
  });
  document.addEventListener('ig-consent', function (e) {
    if (e.detail && e.detail.marketing) window.igHydrate(document);
  });

  window.igPlayBadge = '<span class="ig-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path fill="#fff" d="M8 5v14l11-7z"/></svg></span>';

  var css = '.ig-wrap{position:relative}' +
    '.ig-badge{position:absolute;top:10px;right:10px;z-index:3;width:38px;height:38px;border-radius:50%;' +
    'background:rgba(255,255,255,.95);display:grid;place-items:center;box-shadow:0 2px 8px rgba(0,0,0,.35);' +
    'transition:transform .2s ease}' +
    '.ig-badge:hover{transform:scale(1.1)}' +
    '.ig-badge:focus-visible{outline:2px solid #fff;outline-offset:2px}' +
    '.ig-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2;width:54px;height:54px;' +
    'border-radius:50%;background:rgba(0,0,0,.55);border:2px solid #fff;display:grid;place-items:center;pointer-events:none}' +
    '.ig-play svg{margin-left:3px}' +
    '.ig-ph{display:grid;place-items:center;align-content:center;gap:12px;width:100%;aspect-ratio:4/3;box-sizing:border-box;' +
    'background:linear-gradient(135deg,#141414,#2a2a2a);color:#fff;text-decoration:none;text-align:center}' +
    '.ig-ph-ico{width:64px;height:64px;border-radius:50%;background:#fff;display:grid;place-items:center;transition:transform .2s ease}' +
    '.ig-ph-ico svg{width:36px;height:36px}' +
    '.ig-ph:hover .ig-ph-ico{transform:scale(1.08)}' +
    '.ig-ph-sub{font:400 11px/1 system-ui,-apple-system,Segoe UI,sans-serif;opacity:.65}' +
    'button.ig-ph{border:0;cursor:pointer;font:inherit}' +
    '.ig-embed{width:100%}' +
    '.ig-embed.is-live .instagram-media{min-width:0!important;max-width:100%!important;width:100%!important;margin:0!important}' +
    '.ig-btn{display:inline-flex;align-items:center;gap:6px;padding:5px 11px 5px 7px;border:1px solid rgba(128,128,128,.45);border-radius:999px;' +
    'color:inherit;text-decoration:none;font:500 13px/1 system-ui,-apple-system,Segoe UI,sans-serif;background:rgba(255,255,255,.92);color:#111}' +
    '.ig-btn svg{width:18px;height:18px}.ig-btn:hover{opacity:.8}' +
    '.ig-ph-txt{font:500 14px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.02em}';
  var st = document.createElement('style');
  st.textContent = css.replace(/%/g, '%');
  document.head.appendChild(st);
})();

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


  /* ── TikTok + Pinterest (same round badge style as Instagram) ── */
  var TT_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#000" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>';
  var PIN_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#E60023" d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z"/></svg>';

  window.ttSafeUrl = function (u) {
    u = String(u || '').trim();
    return /^https:\/\/([a-z0-9-]+\.)?tiktok\.com\/\S+$/i.test(u) ? u : '';
  };
  window.pinSafeUrl = function (u) {
    u = String(u || '').trim();
    return (/^https:\/\/([a-z0-9-]+\.)?pinterest\.[a-z.]+\/\S+$/i.test(u) || /^https:\/\/pin\.it\/\S+$/i.test(u)) ? u : '';
  };

  function plainBadge(url, icon, label) {
    return '<a class="ig-badge" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" ' +
      'aria-label="' + esc(label) + '" title="' + esc(label) + '">' + icon + '</a>';
  }

  /* Stack of round badges (Instagram, TikTok, Pinterest) in the top-right corner.
     Only the ones that have a valid link are shown. Usage: igSocials(igUrl, ttUrl, pinUrl, 'Title') */
  window.igSocials = function (ig, tt, pin, title) {
    var t = title ? (' — ' + title) : '';
    var out = '';
    var i = window.igSafeUrl(ig), k = window.ttSafeUrl(tt), p = window.pinSafeUrl(pin);
    if (i) { n++; out += '<a class="ig-badge" href="' + esc(i) + '" target="_blank" rel="noopener noreferrer" aria-label="View on Instagram' + esc(t) + '" title="View on Instagram">' + ICON.replace(/__ID__/g, String(n)) + '</a>'; }
    if (k) out += plainBadge(k, TT_ICON, 'View on TikTok' + t);
    if (p) out += plainBadge(p, PIN_ICON, 'View on Pinterest' + t);
    return out ? '<div class="ig-badges">' + out + '</div>' : '';
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
    '.ig-badges{position:absolute;top:10px;right:10px;z-index:3;display:flex;flex-direction:column;gap:8px}' +
    '.ig-badges .ig-badge{position:static}' +
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

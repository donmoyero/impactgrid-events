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

  window.igPlayBadge = '<span class="ig-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path fill="#fff" d="M8 5v14l11-7z"/></svg></span>';

  var css = '.ig-wrap{position:relative}' +
    '.ig-badge{position:absolute;top:10px;right:10px;z-index:3;width:38px;height:38px;border-radius:50%;' +
    'background:rgba(255,255,255,.95);display:grid;place-items:center;box-shadow:0 2px 8px rgba(0,0,0,.35);' +
    'transition:transform .2s ease}' +
    '.ig-badge:hover{transform:scale(1.1)}' +
    '.ig-badge:focus-visible{outline:2px solid #fff;outline-offset:2px}' +
    '.ig-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2;width:54px;height:54px;' +
    'border-radius:50%;background:rgba(0,0,0,.55);border:2px solid #fff;display:grid;place-items:center;pointer-events:none}' +
    '.ig-play svg{margin-left:3px}';
  var st = document.createElement('style');
  st.textContent = css.replace(/%/g, '%');
  document.head.appendChild(st);
})();

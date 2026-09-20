/* ════════════════════════════════════════════════════════════════
   gallery-looks.js — named "Looks" for client galleries (Phase 4c)

   Loaded by BOTH event.html (renders a look) and admin.html (draws the
   look cards in the template editor), so a look is defined exactly once.

   A Look bundles: palette · typography · spacing/shape.
   A template stores only  look_id  (e.g. 'classic').  '' / missing =
   "Original" → the existing per-event-type skin (tpl-wedding, tpl-gala…)
   is left completely untouched, so nothing changes for old templates.

   How a look is applied (event.html → applyGalleryLook):
     · sets   <body data-look="classic">
     · injects one <style id="ig-look-css"> with rules scoped to
       body[data-look="classic"] — that selector is more specific than the
       .tpl-* skin rules, so it wins without touching them.
     · the page BACKGROUND still comes from the template's
       background_type / background_value (picking a look in the admin
       fills those in with the look's own background, and you can still
       change them afterwards).

   All font families used here are already loaded by event.html's
   Google Fonts link: Cormorant Garamond, DM Sans, DM Mono, Italiana,
   Syne, Nunito, Bebas Neue.

   TO ADD / TWEAK A LOOK: edit the GALLERY_LOOKS array below. Nothing
   else needs to change — the admin cards and the gallery both read it.
════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var F_SERIF = "'Cormorant Garamond',serif";
  var F_SANS  = "'DM Sans',sans-serif";
  var F_MONO  = "'DM Mono',monospace";

  /* c  = palette  (bg is the suggested page background)
     f  = fonts    (head = titles/logo/gate title, body, label)
     s  = shape    (gap = px between photos, radius = px on photos,
                    wrap = max content width in px)                   */
  var GALLERY_LOOKS = [
    {
      id:'classic', label:'Classic', tagline:'Warm ivory · serif', mode:'light',
      c:{ bg:'#fbf7ef', bg2:'#f2eadb', card:'#ffffff', border:'#e7dcc6', border2:'#cfc09f',
          text:'#2b2218', text2:'#6a5a44', text3:'#a3927a', accent:'#a88a3d', accent2:'#bfa055', onAccent:'#ffffff' },
      f:{ head:F_SERIF, headWeight:500, headStyle:'normal', headCase:'none', headTrack:'.01em', body:F_SANS, label:F_MONO },
      s:{ gap:8, radius:4, wrap:1300 }
    },
    {
      id:'airy', label:'Airy', tagline:'Light · lots of space', mode:'light',
      c:{ bg:'#fdfdfb', bg2:'#f3f3ef', card:'#ffffff', border:'#ecece6', border2:'#d9d9d0',
          text:'#22232a', text2:'#6a6c78', text3:'#a3a5b0', accent:'#5f8171', accent2:'#6f9382', onAccent:'#ffffff' },
      f:{ head:F_SERIF, headWeight:300, headStyle:'normal', headCase:'none', headTrack:'.02em', body:F_SANS, label:F_MONO },
      s:{ gap:16, radius:2, wrap:1200 }
    },
    {
      id:'editorial', label:'Editorial', tagline:'Paper · fashion-mag caps', mode:'light',
      c:{ bg:'#f3f0ea', bg2:'#e9e5dc', card:'#fffefb', border:'#d9d4c8', border2:'#b9b3a4',
          text:'#111111', text2:'#55524a', text3:'#8f8b80', accent:'#111111', accent2:'#333333', onAccent:'#ffffff' },
      f:{ head:"'Italiana',serif", headWeight:400, headStyle:'normal', headCase:'uppercase', headTrack:'.08em', body:F_SANS, label:F_MONO },
      s:{ gap:2, radius:0, wrap:1400 }
    },
    {
      id:'cinematic', label:'Cinematic', tagline:'Black · gold · poster caps', mode:'dark',
      c:{ bg:'#0a0a0a', bg2:'#141414', card:'#181818', border:'#262626', border2:'#3a3a3a',
          text:'#f2efe8', text2:'#a8a49a', text3:'#6f6b62', accent:'#c8b304', accent2:'#dcc915', onAccent:'#0a0a0a' },
      f:{ head:"'Bebas Neue',sans-serif", headWeight:400, headStyle:'normal', headCase:'uppercase', headTrack:'.05em', body:F_SANS, label:F_MONO, heroSize:'clamp(38px,6vw,76px)' },
      s:{ gap:3, radius:2, wrap:1400 }
    },
    {
      id:'midnight', label:'Midnight', tagline:'Deep navy · bold sans', mode:'dark',
      c:{ bg:'#0d1020', bg2:'#151934', card:'#1a1f3d', border:'#262c52', border2:'#39407a',
          text:'#eef0ff', text2:'#a4abd6', text3:'#6d75a8', accent:'#5a68ff', accent2:'#7480ff', onAccent:'#ffffff' },
      f:{ head:"'Syne',sans-serif", headWeight:800, headStyle:'normal', headCase:'none', headTrack:'-.01em', body:F_SANS, label:F_MONO },
      s:{ gap:4, radius:8, wrap:1300 }
    },
    {
      id:'vibrant', label:'Vibrant', tagline:'Warm · rounded · playful', mode:'light',
      c:{ bg:'#fff7f1', bg2:'#ffe9d9', card:'#ffffff', border:'#f6d9c4', border2:'#eab99a',
          text:'#2a1408', text2:'#8a4a24', text3:'#b98a6a', accent:'#e8552d', accent2:'#f0703f', onAccent:'#ffffff' },
      f:{ head:"'Nunito',sans-serif", headWeight:900, headStyle:'normal', headCase:'none', headTrack:'0', body:"'Nunito',sans-serif", label:F_MONO },
      s:{ gap:8, radius:14, wrap:1300 }
    }
  ];

  var BY_ID = {};
  GALLERY_LOOKS.forEach(function(l){ BY_ID[l.id] = l; });

  function galleryLookById(id){ return id ? (BY_ID[id] || null) : null; }

  function rgba(hex, a){
    var h = String(hex).replace('#','');
    if(h.length === 3) h = h.replace(/(.)/g,'$1$1');
    var n = parseInt(h, 16);
    return 'rgba(' + ((n>>16)&255) + ',' + ((n>>8)&255) + ',' + (n&255) + ',' + a + ')';
  }

  /* Builds the scoped CSS for one look. Every rule starts with
     body[data-look="id"] so it can never leak onto other pages / skins. */
  function galleryLookCSS(look){
    if(!look) return '';
    var c = look.c, f = look.f, s = look.s;
    var S = 'body[data-look="' + look.id + '"]';
    var navBg = rgba(c.bg, .92);
    var R  = s.radius;
    var r2 = Math.max(R, Math.round(R * 1.6));
    var r3 = Math.max(R, Math.round(R * 2.4));
    var out = [];

    /* palette + shape tokens (the .tpl-* skins read these same variables) */
    out.push(S + '{'
      + '--bg:' + c.bg + ';--bg2:' + c.bg2 + ';--card:' + c.card + ';'
      + '--border:' + c.border + ';--border2:' + c.border2 + ';'
      + '--text:' + c.text + ';--text2:' + c.text2 + ';--text3:' + c.text3 + ';'
      + '--accent:' + c.accent + ';--accent2:' + c.accent2 + ';'
      + '--accent-dim:' + rgba(c.accent, .12) + ';--accent-glo:' + rgba(c.accent, .3) + ';'
      + '--r:' + R + 'px;--r2:' + r2 + 'px;--r3:' + r3 + 'px;'
      + 'color:' + c.text + ';font-family:' + f.body + ';}');

    /* typography */
    out.push(S + ' .nav-logo,' + S + ' .gallery-title,' + S + ' .gate-title,' + S + ' .hero-title{'
      + 'font-family:' + f.head + ';font-weight:' + f.headWeight + ';font-style:' + f.headStyle + ';'
      + 'text-transform:' + f.headCase + ';letter-spacing:' + f.headTrack + ';}');
    out.push(S + ' .hero-title em,' + S + ' .gate-title em{font-style:' + f.headStyle + ';}');
    if(f.heroSize) out.push(S + ' .hero-title{font-size:' + f.heroSize + ';}');
    out.push(S + ' .nav-event-name,' + S + ' .gate-sub{font-family:' + f.body + ';font-style:normal;color:' + c.text2 + ';}');
    out.push(S + ' .hero-label,' + S + ' .nav-code-badge,' + S + ' .gate-input{font-family:' + f.label + ';}');

    /* chrome: nav, download bar, toast, badges, gate */
    out.push(S + ' .ev-nav,' + S + ' .dl-bar{background:' + navBg + ';border-color:' + c.border + ';}');
    out.push(S + ' .nav-event-name{color:' + c.text2 + ';}');
    out.push(S + ' .dl-bar-count{color:' + c.text + ';}' + S + ' .dl-bar-sub{color:' + c.text2 + ';}');
    out.push(S + ' .toast{background:' + c.card + ';border:1px solid ' + c.border + ';color:' + c.text + ';}');
    out.push(S + ' .photo-count-badge{background:' + c.bg2 + ';border:1px solid ' + c.border2 + ';color:' + c.text3 + ';}');
    out.push(S + ' .nav-code-badge,' + S + ' .share-btn{color:' + c.accent + ';background:' + rgba(c.accent, .12) + ';border:1px solid ' + rgba(c.accent, .3) + ';}');
    out.push(S + ' .share-btn:hover{background:' + c.accent + ';color:' + c.onAccent + ';}');
    out.push(S + ' .hero-ornament{color:' + c.accent + ';}' + S + ' .hero-divider{background:' + c.accent + ';}');
    /* gate is transparent so the template background (body) shows through */
    out.push(S + ' .gate{background:transparent;}');
    out.push(S + ' .gate-box{background:' + c.card + ';border:1px solid ' + c.border + ';border-radius:' + r3 + 'px;}');
    out.push(S + ' .gate-input{background:' + c.bg2 + ';border-color:' + c.border2 + ';color:' + c.text + ';border-radius:' + R + 'px;}');
    out.push(S + ' .gate-input:focus{border-color:' + c.accent + ';box-shadow:0 0 0 3px ' + rgba(c.accent, .12) + ';}');
    out.push(S + ' .gallery-header{border-bottom-color:' + c.border + ';}');

    /* buttons */
    out.push(S + ' .btn-primary{background:' + c.accent + ';color:' + c.onAccent + ';border-radius:' + R + 'px;}');
    out.push(S + ' .btn-primary:hover{background:' + c.accent2 + ';box-shadow:0 4px 16px ' + rgba(c.accent, .3) + ';}');
    out.push(S + ' .btn-outline{background:' + c.card + ';border:1px solid ' + c.border2 + ';color:' + c.text2 + ';border-radius:' + R + 'px;}');
    out.push(S + ' .btn-outline:hover{border-color:' + c.accent + ';color:' + c.accent + ';}');

    /* spacing / shape of the photo area. gap works for grid, flex (justified,
       filmstrip), collage and — as column-gap — masonry; masonry's stacked
       cards also need an explicit bottom margin. */
    out.push(S + ' .gallery-wrap{max-width:' + s.wrap + 'px;}');
    out.push(S + ' .photo-grid{gap:' + s.gap + 'px;background:none;border-radius:0;}');
    out.push(S + ' .photo-grid.layout-masonry{column-gap:' + s.gap + 'px;}');
    out.push(S + ' .photo-grid.layout-masonry .photo-card{margin-bottom:' + s.gap + 'px;}');
    out.push(S + ' .photo-grid .photo-card{border-radius:' + R + 'px;background:' + c.bg2 + ';}');

    return out.join('\n');
  }

  /* Applies (or clears) a look on the current page. Safe to call repeatedly. */
  function applyGalleryLook(id){
    var look = galleryLookById(id);
    var tag  = document.getElementById('ig-look-css');
    if(!look){
      if(tag) tag.parentNode.removeChild(tag);
      document.body.removeAttribute('data-look');
      return null;
    }
    if(!tag){
      tag = document.createElement('style');
      tag.id = 'ig-look-css';
      document.head.appendChild(tag);
    }
    tag.textContent = galleryLookCSS(look);
    document.body.setAttribute('data-look', look.id);
    return look;
  }

  window.GALLERY_LOOKS     = GALLERY_LOOKS;
  window.galleryLookById   = galleryLookById;
  window.galleryLookCSS    = galleryLookCSS;
  window.applyGalleryLook  = applyGalleryLook;
})();

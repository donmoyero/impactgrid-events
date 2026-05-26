/* ═══════════════════════════════════════════════════════
   ImpactGrid Group — nav.js
   Version: 5.2  (audit fix: removed hardcoded credentials,
                  removed getContentClient() auth fallback)

   NAV:  Home | About | Consulting | Contact | Pricing
   Mobile sidebar mirrors same links.

   REQUIRED LOAD ORDER on every page:
     1. supabase.min.js  (CDN)
     2. plan-config.js
     3. supabase-config.js  ← auth + content clients (getSupabase / getAuthClient / getContentClient)
     4. auth.js
     5. nav.js           ← this file
     6. [page-specific JS]

   NOTE: ig-supabase.js is now a no-op shim — supabase-config.js owns all clients.
         Remove ig-supabase.js script tags from pages as you update them.

   HOW TO USE:
     1. <div id="ig-nav"></div>    — top of <body>
     2. <div id="ig-footer"></div> — bottom of <body>
     3. Call: renderNav('yourpage.html'); renderFooter();
═══════════════════════════════════════════════════════ */

(function() {

  /* ── Facebook Pixel ── */
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
  (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '1186489290177846');
  fbq('track', 'PageView');

  /* ── Favicon (uses logo.png — single source of truth) ── */
  (function() {
    if (!document.querySelector("link[rel='icon']")) {
      var link = document.createElement('link');
      link.rel  = 'icon';
      link.type = 'image/png';
      link.href = 'logo.png';
      document.head.appendChild(link);
    }
  })();

  /* ── Top-level nav links ── */
  var NAV_LINKS = [
    { href: 'index.html',            label: 'Home' },
    { href: 'portfolio-studio.html', label: 'Website' },
    { href: 'pricing.html',          label: 'Pricing' },
    { href: 'dashboard.html',        label: 'Dashboard', authOnly: true, id: 'navDashLink' },
  ];

  /* ─────────────────────────────────────────
     RENDER NAV
  ───────────────────────────────────────── */
  function renderNav(activePage) {

    var desktopLinks = NAV_LINKS.map(function(l) {
      var cls = l.href === activePage ? ' class="active"' : '';
      var id  = l.id ? ' id="' + l.id + '"' : '';
      return '<li><a href="' + l.href + '"' + cls + id + '>' + l.label + '</a></li>';
    }).join('');

    var mobileLinks = [
      { href:'index.html',            label:'Home' },
      { href:'portfolio-studio.html', label:'Website' },
      { href:'pricing.html',          label:'Pricing' },
      { href:'dashboard.html',        label:'Dashboard', id:'mobDashLink' },
    ].map(function(l) {
      var cls = l.href === activePage ? ' class="active"' : '';
      var id  = l.id ? ' id="' + l.id + '"' : '';
      return '<a href="' + l.href + '"' + cls + id + ' onclick="closeSidebar()">' + l.label + '</a>';
    }).join('');

    var html =
      /* ── Mega dropdown CSS (injected once) ── */
      '<style>' +
      '.nav-dd-wrap{position:relative;}' +
      '.nav-dd-btn{display:flex;align-items:center;gap:4px;padding:6px 9px;border-radius:8px;font-size:12.5px;font-weight:500;color:var(--text2);cursor:pointer;transition:all .2s;background:none;border:none;font-family:var(--fb);white-space:nowrap;}' +
      '.nav-dd-btn:hover,.nav-dd-btn.active{color:var(--text);background:rgba(0,0,0,.05);}' +
      '[data-theme="dark"] .nav-dd-btn:hover,[data-theme="dark"] .nav-dd-btn.active{background:rgba(255,255,255,.06);}' +
      '.nav-dd-chev{font-size:8px;color:var(--text3);transition:transform .2s;}' +
      '.nav-dd-wrap:hover .nav-dd-chev{transform:rotate(180deg);}' +
      '.nav-mega{position:absolute;top:calc(100% + 10px);left:50%;transform:translateX(-50%);background:var(--card);border:1px solid var(--border2);border-radius:var(--r2);padding:8px;min-width:240px;box-shadow:0 16px 48px rgba(0,0,0,.12);z-index:1200;display:none;flex-direction:column;gap:2px;animation:fadeUp .15s ease;}' +
      '[data-theme="dark"] .nav-mega{box-shadow:0 16px 48px rgba(0,0,0,.5);}' +
      '.nav-mega.open{display:flex;}' +
      '.nav-mega-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--r);transition:all .2s;color:var(--text2);}' +
      '.nav-mega-item:hover,.nav-mega-item-active{background:var(--bg2);color:var(--text);}' +
      '.nav-mega-icon{width:30px;height:30px;border-radius:8px;background:var(--bg2);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;}' +
      '.nav-mega-item:hover .nav-mega-icon,.nav-mega-item-active .nav-mega-icon{background:var(--gold-dim);}' +
      '.nav-mega-text{display:flex;flex-direction:column;}' +
      '.nav-mega-label{font-size:13px;font-weight:600;color:var(--text);}' +
      '.nav-mega-desc{font-size:11px;color:var(--text3);margin-top:1px;}' +
      '.logo{cursor:pointer;}' +
      /* ── RIGHT-SIDE VERTICAL NAV OVERRIDES ── */
      '.nav{position:fixed;top:0;right:0;left:auto;bottom:0;width:220px;height:100vh;flex-direction:column;align-items:stretch;padding:28px 16px;border-left:1px solid var(--border2);border-bottom:none;z-index:1100;overflow-y:auto;}' +
      '.nav-in{display:none;}' +
      '.nav .logo{display:flex;align-items:center;gap:8px;padding:0 8px;margin-bottom:32px;text-decoration:none;}' +
      '.nav .nav-links{display:flex;flex-direction:column;gap:2px;list-style:none;flex:1;}' +
      '.nav .nav-links li{width:100%;}' +
      '.nav .nav-links a{display:block;padding:10px 12px;border-radius:8px;font-size:13.5px;width:100%;}' +
      '.nav-bottom{display:flex;flex-direction:column;gap:10px;padding-top:16px;border-top:1px solid var(--border2);margin-top:auto;}' +
      '.nav-guest{flex-direction:column!important;gap:7px!important;}' +
      '.nav-guest .btn-ghost-sm,.nav-guest .btn-gold-sm{width:100%;text-align:center;}' +
      '.nav .theme-btn{width:100%;text-align:left;padding:8px 12px;border-radius:8px;}' +
      '.nav .hamburger{display:none!important;}' +
      '.nav .u-drop{left:0;right:auto;top:auto;bottom:calc(100% + 6px);}' +
      'body{padding-right:220px!important;padding-top:0!important;}' +
      '@media(max-width:900px){' +
        '.nav{width:64px;padding:20px 8px;}' +
        '.nav .logo-text,.nav .nav-links a span,.nav-bottom .btn-ghost-sm span,.nav-bottom .btn-gold-sm span{display:none;}' +
        '.nav .nav-links a{padding:10px;text-align:center;font-size:18px;}' +
        'body{padding-right:64px!important;}' +
      '}' +
      '@media(max-width:600px){' +
        '.nav{width:100%;height:auto;flex-direction:row;position:fixed;top:auto;bottom:0;left:0;right:0;border-left:none;border-top:1px solid var(--border2);padding:8px 16px;}' +
        '.nav .logo{display:none;}' +
        '.nav .nav-links{flex-direction:row;gap:0;justify-content:space-around;}' +
        '.nav-bottom{display:none;}' +
        '.nav .hamburger{display:flex!important;}' +
        'body{padding-right:0!important;padding-bottom:60px!important;}' +
      '}' +
      '</style>' +

      /* ── Right-side vertical nav ── */
      '<nav class="nav" id="mainNav" aria-label="Main navigation">' +
        '<button class="nav-toggle" id="navToggle" onclick="toggleNavCollapse()" aria-label="Toggle sidebar">' +
          '<span class="nav-toggle-icon">◀</span>' +
          '<span class="nav-toggle-label">Collapse</span>' +
        '</button>' +
        '<a href="index.html" class="logo" id="navLogo">' +
          '<img src="logo.png" class="logo-img" alt="ImpactGrid" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'"/>' +
          '<div class="logo-mark" style="display:none;">IG</div>' +
          '<span class="logo-text">ImpactGrid</span>' +
        '</a>' +

        '<ul class="nav-links">' +
          desktopLinks +
        '</ul>' +

        '<div class="nav-bottom">' +
          '<button class="theme-btn" id="themeBtn" onclick="toggleTheme()" aria-label="Toggle theme">🌙</button>' +

          /* ── GUEST: shown when logged out ── */
          '<div id="navGuest" class="nav-guest" style="display:flex;flex-direction:column;gap:7px;">' +
            '<a href="login.html" class="btn-ghost-sm">Login</a>' +
            '<a href="join.html" class="btn-gold-sm">Join Free</a>' +
          '</div>' +

          /* ── USER: shown when logged in ── */
          '<div id="navUser" style="display:none;position:relative;">' +
            '<button class="user-btn" onclick="toggleDD()" aria-label="Account menu">' +
              '<div class="u-av" id="userAv">?</div>' +
              '<span class="u-name" id="userName">Account</span>' +
              '<span class="u-chev">▾</span>' +
            '</button>' +
            '<div class="u-drop" id="uDrop">' +
              '<div class="dd-email" id="userEmail"></div>' +
              '<div class="dd-div"></div>' +
              '<a href="dashboard.html" id="ddDashLink">My Dashboard</a>' +
              '<a href="settings.html">Account Settings</a>' +
              '<div class="dd-div"></div>' +
              '<button onclick="igSignOut()">Sign out</button>' +
            '</div>' +
          '</div>' +

          '<button class="hamburger" id="hamburger" aria-label="Open navigation menu" aria-expanded="false" aria-controls="mobSidebar" onclick="openSidebar()">' +
            '<span></span><span></span><span></span>' +
          '</button>' +
        '</div>' +
      '</nav>' +

      /* ── Mobile sidebar overlay ── */
      '<div class="mob-overlay" id="mobOverlay" onclick="closeSidebar()"></div>' +
      '<div class="mob-sidebar" id="mobSidebar" role="dialog" aria-modal="true" aria-label="Mobile navigation">' +
        '<div class="mob-head">' +
          '<div class="mob-logo">' +
            '<img src="logo.png" style="width:26px;height:26px;object-fit:contain;border-radius:5px;" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'"/>' +
            '<div style="display:none;width:26px;height:26px;border-radius:6px;background:linear-gradient(135deg,var(--gold),var(--gold2));align-items:center;justify-content:center;font-size:11px;font-weight:900;color:#fff;">IG</div>' +
            'ImpactGrid' +
          '</div>' +
          '<button class="mob-close" onclick="closeSidebar()" aria-label="Close navigation menu">✕</button>' +
        '</div>' +
        /* ── Mobile user info card (shown when logged in) ── */
        '<div class="mob-user" id="mobUserCard">' +
          '<div class="u-av" id="mobUserAv">?</div>' +
          '<div class="mob-u-info">' +
            '<div class="mob-u-name" id="mobUserName">Account</div>' +
            '<div class="mob-u-email" id="mobUserEmail"></div>' +
          '</div>' +
        '</div>' +
        '<div class="mob-nav">' + mobileLinks + '</div>' +
        '<div class="mob-auth">' +
          /* Guest state */
          '<div class="mob-out" id="mobOut">' +
            '<a href="login.html" class="mob-alink" onclick="closeSidebar()">Login</a>' +
            '<a href="join.html" class="mob-acta" onclick="closeSidebar()">Join Free →</a>' +
          '</div>' +
          /* Logged-in state */
          '<div class="mob-in" id="mobIn">' +
            '<a href="dashboard.html" id="mobDashCta" class="mob-adash" onclick="closeSidebar()">My Dashboard →</a>' +
            '<button class="mob-asignout" onclick="igSignOut()">Sign out</button>' +
          '</div>' +
        '</div>' +
        '<div class="mob-theme-row">' +
          '<span>Theme</span>' +
          '<button class="mob-tbtn" id="mobTBtn" onclick="toggleTheme()">🌙 Dark</button>' +
        '</div>' +
      '</div>';

    var container = document.getElementById('ig-nav');
    if (container) container.innerHTML = html;

    _initNavInteractions();

    /* Signal that nav HTML is in the DOM — auth modules listen for this */
    document.dispatchEvent(new CustomEvent('ig-nav-ready'));

    /* ── Flush any auth event that arrived before nav was rendered ── */
    if (_bufferedAuthState) {
      var buf = _bufferedAuthState;
      _bufferedAuthState = null;
      _handleAuthEvent(buf.event, buf.session);
    }

    var logo = document.getElementById('navLogo');
    if (logo) {
      logo.addEventListener('click', function(e) {
        if (window.innerWidth <= 768) {
          e.preventDefault();
          openSidebar();
        }
      });
    }
  }

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.nav-dd-wrap')) {
      document.querySelectorAll('.nav-mega').forEach(function(m) { m.classList.remove('open'); });
    }
  });

  /* ─────────────────────────────────────────
     ESCAPE KEY
  ───────────────────────────────────────── */
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      window.closeSidebar();
    }
  });

  /* ─────────────────────────────────────────
     RENDER FOOTER
  ───────────────────────────────────────── */
  function renderFooter() {
    var html =
      '<footer class="footer">' +
        '<div class="footer-in">' +
          '<div class="footer-grid">' +
            '<div class="f-brand">' +
              '<div style="display:flex;align-items:center;gap:8px;font-family:var(--fd);font-weight:900;font-size:15px;letter-spacing:-.03em;">' +
                '<img src="logo.png" style="width:28px;height:28px;object-fit:contain;border-radius:5px;" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'"/>' +
                '<div style="display:none;width:28px;height:28px;border-radius:7px;background:linear-gradient(135deg,var(--gold),var(--gold2));align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#fff;">IG</div>' +
                'ImpactGrid' +
              '</div>' +
              '<p>Creator intelligence for content that actually performs.</p>' +
            '</div>' +
            '<div class="fc"><h4>Product</h4><a href="creator-studio.html">Creator Studio</a><a href="carousel-studio.html">Carousel Studio</a><a href="portfolio-studio.html">Portfolio Studio</a><a href="consulting.html">Consulting</a><a href="pricing.html">Pricing</a></div>' +
            '<div class="fc"><h4>Company</h4><a href="about.html">About</a><a href="consulting.html">Consulting</a><a href="contact.html">Contact Us</a></div>' +
            '<div class="fc"><h4>Legal</h4><a href="privacy.html">Privacy Policy</a><a href="terms.html">Terms of Service</a></div>' +
          '</div>' +
          '<div class="footer-bot">' +
            '<span>© 2026 ImpactGrid Group Ltd. All rights reserved.</span>' +
            '<div class="footer-legal"><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a></div>' +
            '<button class="footer-tbtn" onclick="toggleTheme()" id="footerTBtn" aria-label="Toggle dark/light mode">🌙 Dark Mode</button>' +
          '</div>' +
        '</div>' +
      '</footer>';

    var container = document.getElementById('ig-footer');
    if (container) container.innerHTML = html;
  }

  /* ─────────────────────────────────────────
     THEME
  ───────────────────────────────────────── */
  var _isDark = false;
  function _applyTheme(dark) {
    _isDark = dark;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var ico = dark ? '☀️' : '🌙';
    var tb = document.getElementById('themeBtn');   if(tb) tb.textContent = ico;
    var fb = document.getElementById('footerTBtn'); if(fb) fb.textContent = dark ? '☀️ Light Mode' : '🌙 Dark Mode';
    var mb = document.getElementById('mobTBtn');    if(mb) mb.textContent = dark ? '☀️ Light' : '🌙 Dark';
    try { localStorage.setItem('ig_theme', dark ? 'dark' : 'light'); } catch(e) {}
  }
  window.toggleTheme = function() { _applyTheme(!_isDark); };
  (function() {
    try { if (localStorage.getItem('ig_theme') === 'dark') _applyTheme(true); } catch(e) {}
  })();

  /* ─────────────────────────────────────────
     SIDEBAR
  ───────────────────────────────────────── */
  /* ── Page-aware sidebar: studio pages use #sidebar, all others use #mobSidebar ── */
  function _isStudioPage() {
    return !!document.getElementById('sidebar');
  }
  window.openSidebar = function() {
    if (_isStudioPage()) {
      var sb = document.getElementById('sidebar');
      var ov = document.getElementById('studioOverlay');
      if (sb) sb.classList.add('open');
      if (ov) ov.classList.add('open');
      document.body.style.overflow = 'hidden';
      if (sb) { var f = sb.querySelector('button,a,[tabindex]'); if (f) f.focus(); }
    } else {
      var s = document.getElementById('mobSidebar');
      var o = document.getElementById('mobOverlay');
      var h = document.getElementById('hamburger');
      if (s) { s.classList.add('open'); }
      if (o) o.classList.add('open');
      if (h) h.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      if (s) { var first = s.querySelector('button,a,[tabindex]'); if (first) first.focus(); }
    }
  };
  window.closeSidebar = function() {
    if (_isStudioPage()) {
      var sb = document.getElementById('sidebar');
      var ov = document.getElementById('studioOverlay');
      if (sb) sb.classList.remove('open');
      if (ov) ov.classList.remove('open');
      document.body.style.overflow = '';
    } else {
      var s = document.getElementById('mobSidebar');
      var o = document.getElementById('mobOverlay');
      var h = document.getElementById('hamburger');
      if (s) s.classList.remove('open');
      if (o) o.classList.remove('open');
      if (h) { h.setAttribute('aria-expanded', 'false'); h.focus(); }
      document.body.style.overflow = '';
    }
  };

  /* ─────────────────────────────────────────
     PROFILE DROPDOWN
  ───────────────────────────────────────── */
  window.toggleDD = function() {
    var d = document.getElementById('uDrop');
    if (d) d.classList.toggle('open');
  };

  /* ─────────────────────────────────────────
     INIT
  ───────────────────────────────────────── */
  function _initNavInteractions() {
    try { if (localStorage.getItem('ig_theme') === 'dark') _applyTheme(true); } catch(e) {}
  }

  /* ─────────────────────────────────────────
     SCROLL ANIMATIONS
  ───────────────────────────────────────── */
  function _initScrollAnimations() {
    var io = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.07 });
    document.querySelectorAll('.anim').forEach(function(el) { io.observe(el); });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initScrollAnimations);
  } else {
    _initScrollAnimations();
  }

  /* ─────────────────────────────────────────
     AUTH-AWARE NAV
     Reads the Supabase session and switches the nav between
     guest state (Login | Join Free) and user state (avatar + dropdown).

     Called automatically on DOMContentLoaded, and also exposed as
     window.checkAuth() so individual pages can call it if needed.
  ───────────────────────────────────────── */

  /* ── Self-contained Supabase client — nav.js owns auth, no external dependency ── */
  var _navClient = null;
  function _getClient() {
    if (_navClient) return _navClient;
    // Prefer the dedicated auth client from ig-supabase.js / auth.js
    if (typeof getSupabase === 'function')    return (_navClient = getSupabase());
    if (typeof getAuthClient === 'function')  return (_navClient = getAuthClient());
    // NEVER fall back to getContentClient() — that is the content project,
    // not the auth project. Using it for auth causes 403s on the profiles table.
    // Create our own auth client using credentials set by ig-supabase.js
    var sb = window.supabase;
    if (sb && sb.createClient) {
      var _url = window.SUPABASE_URL;
      var _key = window.SUPABASE_ANON_KEY;
      if (!_url || !_key) {
        console.warn('[Nav] SUPABASE_URL / SUPABASE_ANON_KEY not set — is ig-supabase.js loaded before nav.js?');
        return null;
      }
      _navClient = sb.createClient(_url, _key, {
        auth: {
          persistSession    : true,
          autoRefreshToken  : true,
          detectSessionInUrl: true,
          storageKey        : 'ig-auth-token'
        }
      });
    }
    return _navClient;
  }

  /* ── Helper: render avatar into an element (image, animal emoji, or initial fallback) ── */
  function _setAv(el, initial) {
    if (!el) return;
    var avatar = ''; var animal = '';
    try { avatar = localStorage.getItem('ig_avatar') || ''; } catch(e) {}
    try { animal = localStorage.getItem('ig_animal') || ''; } catch(e) {}
    if (avatar) {
      el.innerHTML = '<img src="' + avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" />';
    } else if (animal) {
      /* Animal emoji avatar */
      el.style.fontSize  = '18px';
      el.style.background = 'linear-gradient(135deg,#f0f4ff,#e8f0fe)';
      el.innerHTML = animal;
    } else {
      el.textContent = initial;
    }
  }

  window.setNavUser = function(userObjOrName, email) {
    /* Accept either a full Supabase user object OR legacy (name, email) strings */
    var name, resolvedEmail, avatarUrl;
    if (userObjOrName && typeof userObjOrName === 'object') {
      var u = userObjOrName;
      resolvedEmail = u.email || '';
      name = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name))
             || resolvedEmail.split('@')[0]
             || 'Creator';
      avatarUrl = (u.user_metadata && u.user_metadata.avatar_url) || '';
    } else {
      name          = userObjOrName || '';
      resolvedEmail = email || '';
      name          = name || resolvedEmail.split('@')[0] || 'Creator';
      avatarUrl     = '';
    }

    var initial = name.charAt(0).toUpperCase();

    /* ── Desktop ── */
    var guest = document.getElementById('navGuest');
    var user  = document.getElementById('navUser');
    if (guest) guest.style.display = 'none';
    if (user)  user.style.display  = 'flex';

    /* Avatar — real photo takes priority over initial */
    var avEl = document.getElementById('userAv');
    if (avEl) {
      if (avatarUrl) {
        avEl.innerHTML = '<img src="' + avatarUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" alt="' + name + '"/>';
      } else {
        _setAv(avEl, initial);
      }
    }

    var uName = document.getElementById('userName');
    if (uName) uName.textContent = name.split(' ')[0];

    var uEmail = document.getElementById('userEmail');
    if (uEmail) uEmail.textContent = resolvedEmail;

    /* ── Mobile sidebar ── */
    var mobOut  = document.getElementById('mobOut');
    var mobIn   = document.getElementById('mobIn');
    var mobCard = document.getElementById('mobUserCard');
    if (mobOut)  mobOut.classList.add('hide');
    if (mobIn)   mobIn.classList.add('show');
    if (mobCard) mobCard.classList.add('show');

    var mobAvEl = document.getElementById('mobUserAv');
    if (mobAvEl) {
      if (avatarUrl) {
        mobAvEl.innerHTML = '<img src="' + avatarUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" alt="' + name + '"/>';
      } else {
        _setAv(mobAvEl, initial);
      }
    }

    var mobUName  = document.getElementById('mobUserName');
    var mobUEmail = document.getElementById('mobUserEmail');
    if (mobUName)  mobUName.textContent  = name;
    if (mobUEmail) mobUEmail.textContent = resolvedEmail;
  };

  window.setNavGuest = function() {
    var guest = document.getElementById('navGuest');
    var user  = document.getElementById('navUser');
    if (guest) guest.style.display = 'flex';
    if (user)  user.style.display  = 'none';

    var mobOut  = document.getElementById('mobOut');
    var mobIn   = document.getElementById('mobIn');
    var mobCard = document.getElementById('mobUserCard');
    if (mobOut)  mobOut.classList.remove('hide');
    if (mobIn)   mobIn.classList.remove('show');
    if (mobCard) mobCard.classList.remove('show');
  };

  /* ── Wait for nav HTML to exist before running auth ── */
  function _whenNavReady(fn) {
    if (document.getElementById('navGuest')) {
      fn(); /* nav already rendered (e.g. page called renderNav synchronously) */
    } else {
      document.addEventListener('ig-nav-ready', fn, { once: true });
    }
  }

  /* ─────────────────────────────────────────
     SET DASHBOARD LINKS BY ROLE
     Called after profile loads — updates all Dashboard hrefs
     so admins go to admin.html, everyone else to dashboard.html
  ───────────────────────────────────────── */
  function _setDashboardLinks(role) {
    var isAdmin = (role === 'admin');
    var href    = isAdmin ? 'admin.html' : 'dashboard.html';
    var label   = isAdmin ? 'Admin Panel' : 'My Dashboard';

    // Desktop nav link
    var navLink = document.getElementById('navDashLink');
    if (navLink) { navLink.href = href; }

    // Desktop dropdown link
    var ddLink = document.getElementById('ddDashLink');
    if (ddLink) { ddLink.href = href; ddLink.textContent = label; }

    // Mobile nav link
    var mobLink = document.getElementById('mobDashLink');
    if (mobLink) { mobLink.href = href; }

    // Mobile CTA button
    var mobCta = document.getElementById('mobDashCta');
    if (mobCta) { mobCta.href = href; mobCta.textContent = label + ' →'; }
  }

  /* ─────────────────────────────────────────
     PROFILE LOADER
     After session is confirmed, fetches full_name + avatar_url
     from the 'profiles' table (auth project) so nav AND any page
     can display the real name without each page managing auth.
  ───────────────────────────────────────── */
  async function _loadProfile(authClient, userId, fallbackName, fallbackEmail, googleMeta) {
    var name      = fallbackName;
    var avatarUrl = '';
    var role      = 'creator';
    googleMeta = googleMeta || {};

    // Try to fetch richer profile from DB — profiles table uses user_id not id
    try {
      var res = await authClient.from('profiles')
        .select('full_name, avatar_url, animal_avatar, plan, ai_uses_month, ai_uses_reset, role')
        .eq('user_id', userId)
        .single();

      if (res.data) {
        if (res.data.full_name)  name      = res.data.full_name;
        if (res.data.avatar_url) avatarUrl = res.data.avatar_url;
        if (res.data.role)       role      = res.data.role;
        if (!res.data.avatar_url && res.data.animal_avatar) {
          try { localStorage.setItem('ig_animal', res.data.animal_avatar); } catch(e) {}
        }

        // ── Plan ──
        var plan = res.data.plan || 'free';
        try { localStorage.setItem('ig_plan', plan); } catch(e) {}
        try { localStorage.setItem('ig_user_id', userId); } catch(e) {} // needed by portfolio-studio savePortfolioToDB

        // ── Shared AI usage counter — reset monthly ──
        var now        = new Date();
        var resetDate  = res.data.ai_uses_reset ? new Date(res.data.ai_uses_reset) : null;
        var aiUses     = res.data.ai_uses_month || 0;
        var needsReset = !resetDate
                         || resetDate.getFullYear() !== now.getFullYear()
                         || resetDate.getMonth()    !== now.getMonth();
        if (needsReset) {
          try {
            await authClient.from('profiles').update({
              ai_uses_month: 0,
              ai_uses_reset: now.toISOString()
            }).eq('user_id', userId);
          } catch(e) {}
          aiUses = 0;
        }
        try { localStorage.setItem('ig_ai_uses', String(aiUses)); } catch(e) {}
      } else {
        /* No profile row yet — auto-create from Google/OAuth metadata */
        var googleName   = googleMeta.full_name || googleMeta.name || fallbackName;
        var googleAvatar = googleMeta.avatar_url || googleMeta.picture || '';
        try {
          await authClient.from('profiles').upsert({
            user_id:    userId,
            email:      fallbackEmail,
            full_name:  googleName,
            avatar_url: googleAvatar,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
          name      = googleName;
          avatarUrl = googleAvatar;
        } catch(e) {}
      }
    } catch(e) { /* profiles table unavailable — use fallback name */ }

    // Cache avatar for _setAv() fallback
    try { if (avatarUrl) localStorage.setItem('ig_avatar', avatarUrl); } catch(e) {}

    // ── Expose globally so ANY page can use it without touching auth ──
    var _cachedPlan   = 'free';
    var _cachedAiUses = 0;
    try { _cachedPlan   = localStorage.getItem('ig_plan')    || 'free'; } catch(e) {}
    try { _cachedAiUses = parseInt(localStorage.getItem('ig_ai_uses') || '0'); } catch(e) {}
    window.igUser = {
      id:        userId,
      name:      name,
      email:     fallbackEmail,
      avatarUrl: avatarUrl,
      firstName: name.split(' ')[0],
      plan:      _cachedPlan,
      aiUses:    _cachedAiUses,
      role:      role
    };

    // Dispatch plan-ready event so tools can react immediately
    document.dispatchEvent(new CustomEvent('ig-plan-ready', { detail: { plan: _cachedPlan, aiUses: _cachedAiUses } }));

    // ── Update nav display ──
    var effectiveRole = (role === 'admin' || fallbackEmail === 'admin@impactgridgroup.com') ? 'admin' : role;
    var displayName = effectiveRole === 'admin' ? 'Admin' : name;
    window.setNavUser({ email: fallbackEmail, user_metadata: { full_name: displayName, avatar_url: avatarUrl } });

    // ── Update dashboard links based on role (admin email also gets admin panel) ──
    _setDashboardLinks(effectiveRole);

    // ── Update any element with data-ig-name (greeting, welcome text etc.) ──
    document.querySelectorAll('[data-ig-name]').forEach(function(el) {
      el.textContent = name.split(' ')[0];
    });

    // ── Update any element with data-ig-greeting ──
    var hour = new Date().getHours();
    var greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    document.querySelectorAll('[data-ig-greeting]').forEach(function(el) {
      el.textContent = greeting + ', ' + name.split(' ')[0];
    });

    // ── Update any element with data-ig-avatar (img or initial fallback) ──
    document.querySelectorAll('[data-ig-avatar]').forEach(function(el) {
      if (avatarUrl) {
        el.innerHTML = '<img src="' + avatarUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" alt="' + name + '"/>';
      } else {
        el.textContent = name.charAt(0).toUpperCase();
      }
    });

    // Dispatch event so pages can react if needed
    document.dispatchEvent(new CustomEvent('ig-user-ready', { detail: window.igUser }));
  }

  /* ─────────────────────────────────────────
     CHECK AUTH
     ✅ FIX v5.1: Added retry loop so we wait for the Supabase
     client to be fully initialised (and session token loaded
     from localStorage) before querying the profiles table.
     Previously, checkAuth fired immediately on DOMContentLoaded
     while ig-supabase.js / auth.js were still setting up the
     client — meaning profiles queries fired with no auth token
     → RLS saw auth.uid() = null → 403 Forbidden.
  ───────────────────────────────────────── */
  window.checkAuth = async function() {
    _whenNavReady(async function() {
      try {
        // ✅ Retry getting client — auth.js IIFE may not have run yet
        var client = null;
        var attempts = 0;
        while (!client && attempts < 20) {
          client = _getClient();
          if (!client) {
            await new Promise(function(r) { setTimeout(r, 100); });
          }
          attempts++;
        }
        if (!client) {
          window.setNavGuest();
          return;
        }

        // ✅ getSession() is synchronous from localStorage — fast and reliable.
        //    getUser() makes a network round-trip; we only need that for server-
        //    side validation which is handled by RLS. For nav display, session is enough.
        var res = await client.auth.getSession();
        if (res.data && res.data.session) {
          var u            = res.data.session.user;
          var fallbackName = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name))
                            || (u.email && u.email.split('@')[0])
                            || 'Creator';

          // Show nav immediately — don't wait for DB
          window.setNavUser(u);

          // Then enrich with profiles table (name + avatar) asynchronously
          _loadProfile(client, u.id, fallbackName, u.email || '', u.user_metadata || {});
        } else {
          window.setNavGuest();
        }
      } catch(e) {
        window.setNavGuest();
      }
    });
  };

  window.igSignOut = async function() {
    try {
      var client = _getClient();
      if (client) await client.auth.signOut();
    } catch(e) {}
    window.location.href = 'index.html';
  };

  /* Close user dropdown when clicking outside */
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#navUser')) {
      var d = document.getElementById('uDrop');
      if (d) d.classList.remove('open');
    }
  });

  /* Auto-run after DOM ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.checkAuth);
  } else {
    window.checkAuth();
  }

  /* ── CRITICAL AUTH STATE SUBSCRIPTION ──────────────────────────────
     Strategy:
     1. Subscribe to onAuthStateChange IMMEDIATELY (don't wait for nav)
     2. Buffer the result if nav isn't rendered yet
     3. Apply buffered result the moment nav renders
     4. Auto-create profiles row for brand-new Google/OAuth users
  ─────────────────────────────────────────────────────────────────── */

  var _bufferedAuthState = null; /* { event, session } — held if nav not ready yet */

  function _handleAuthEvent(event, session) {
    if (event === 'SIGNED_IN' && session) {
      var u            = session.user;
      var meta         = u.user_metadata || {};
      var fallbackName = meta.full_name || meta.name
                        || (u.email && u.email.split('@')[0])
                        || 'Creator';
      var client = _getClient();
      if (!client) return;

      /* Show nav immediately — don't wait for DB */
      window.setNavUser(u);

      /* Load/create profile row */
      _loadProfile(client, u.id, fallbackName, u.email || '', meta);

    } else if (event === 'SIGNED_OUT') {
      window.setNavGuest();
      /* Clear cached identity */
      try { localStorage.removeItem('ig_avatar');   } catch(e) {}
      try { localStorage.removeItem('ig_animal');   } catch(e) {}
      try { localStorage.removeItem('ig_plan');     } catch(e) {}
      try { localStorage.removeItem('ig_ai_uses');  } catch(e) {}
    }
  }

  (function _subscribeAuthState() {
    function _doSubscribe() {
      var client = _getClient();
      if (!client) {
        /* SDK not ready yet — retry in 100ms (max 20 attempts = 2s) */
        var attempts = 0;
        var t = setInterval(function() {
          attempts++;
          var c = _getClient();
          if (c) { clearInterval(t); _attachListener(c); }
          else if (attempts >= 20) clearInterval(t);
        }, 100);
        return;
      }
      _attachListener(client);
    }

    function _attachListener(client) {
      client.auth.onAuthStateChange(function(event, session) {
        /* If nav is already rendered, handle immediately */
        if (document.getElementById('navGuest')) {
          _handleAuthEvent(event, session);
        } else {
          /* Buffer it — nav will pick it up when it renders */
          _bufferedAuthState = { event: event, session: session };
        }
      });
    }

    _doSubscribe();
  })();

  /* ─────────────────────────────────────────
     COLLAPSIBLE SIDEBAR
  ───────────────────────────────────────── */
  window.toggleNavCollapse = function() {
    var nav  = document.getElementById('mainNav');
    var body = document.body;
    var wrap = document.querySelector('.page-wrap');
    if (!nav) return;
    var collapsed = nav.classList.toggle('collapsed');
    body.classList.toggle('nav-collapsed', collapsed);
    if (wrap) wrap.classList.toggle('nav-collapsed', collapsed);
    try { localStorage.setItem('ig_nav_collapsed', collapsed ? '1' : '0'); } catch(e) {}
  };

  /* Restore collapse state on load */
  (function() {
    function _restoreNav() {
      try {
        if (localStorage.getItem('ig_nav_collapsed') === '1') {
          var nav  = document.getElementById('mainNav');
          var body = document.body;
          var wrap = document.querySelector('.page-wrap');
          if (nav)  nav.classList.add('collapsed');
          body.classList.add('nav-collapsed');
          if (wrap) wrap.classList.add('nav-collapsed');
        }
      } catch(e) {}
    }
    /* Wait for nav to be rendered */
    document.addEventListener('ig-nav-ready', _restoreNav);
  })();

  /* ─────────────────────────────────────────
     PUBLIC API
  ───────────────────────────────────────── */
  window.renderNav    = renderNav;
  window.renderFooter = renderFooter;

})();

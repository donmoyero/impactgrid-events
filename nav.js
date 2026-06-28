/* ═══════════════════════════════════════════════════════
   ImpactGrid Group — nav.js
   Version: 5.2  (audit fix: removed hardcoded credentials,
                  removed getContentClient() auth fallback)

   NAV:  Home | Services | Portfolio | About | Book Us
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
    { href: 'index.html',       label: 'Home' },
    { href: 'services.html',    label: 'Services' },
    { href: 'portfolio.html',   label: 'Portfolio' },

    { href: 'about.html',       label: 'About' },
    { href: 'book-us.html',     label: 'Book Us' },
  ];

  /* ─────────────────────────────────────────
     RENDER NAV
  ───────────────────────────────────────── */
  /* Icon map for nav links — inline SVG, no emoji */
  var NAV_ICONS = {
    'index.html':     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>',
    'services.html':  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/><path d="M2 20h20"/></svg>',
    'portfolio.html': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
    'blog.html':      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4.5C2 3.67 2.67 3 3.5 3H9a3 3 0 0 1 3 3 3 3 0 0 1 3-3h5.5c.83 0 1.5.67 1.5 1.5v14c0 .83-.67 1.5-1.5 1.5H15a3 3 0 0 0-3 3 3 3 0 0 0-3-3H3.5c-.83 0-1.5-.67-1.5-1.5z"/><path d="M12 6v15"/></svg>',
    'about.html':     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    'book-us.html':   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  };

  /* Social links — shown at the bottom of the nav-links list (desktop)
     and as an icon row in the mobile sidebar.
     ⚠ Replace these placeholder URLs with your real profile links. */
  var SOCIAL_LINKS = [
    {
      href : 'https://www.instagram.com/impactgridevents',
      label: 'Instagram',
      icon : '<svg width="16" height="16" viewBox="0 0 448 448" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="igGrad" cx="30%" cy="107%" r="150%"><stop offset="0%" stop-color="#fdf497"/><stop offset="5%" stop-color="#fdf497"/><stop offset="45%" stop-color="#fd5949"/><stop offset="60%" stop-color="#d6249f"/><stop offset="90%" stop-color="#285AEB"/></radialGradient></defs><path fill="url(#igGrad)" d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"/></svg>'
    },
    {
      href : 'https://www.tiktok.com/@impactgridevents',
      label: 'TikTok',
      icon : '<svg width="16" height="16" viewBox="0 0 448 512" xmlns="http://www.w3.org/2000/svg"><path fill="#ee1d52" d="M448 209.9a210.1 210.1 0 0 1-122.8-39.3V349.4A162.6 162.6 0 1 1 185 188.3V278a74.6 74.6 0 1 0 52.2 71.2V0l4 0z" transform="translate(-6,-4)"/><path fill="#69c9d0" d="M448 209.9a210.1 210.1 0 0 1-122.8-39.3V349.4A162.6 162.6 0 1 1 185 188.3V278a74.6 74.6 0 1 0 52.2 71.2V0l4 0z" transform="translate(6,4)"/><path fill="#010101" d="M448 209.9a210.1 210.1 0 0 1-122.8-39.3V349.4A162.6 162.6 0 1 1 185 188.3V278a74.6 74.6 0 1 0 52.2 71.2V0l88 0a121.2 121.2 0 0 0 1.9 22.2 122.2 122.2 0 0 0 53.9 80.2 121.4 121.4 0 0 0 67 20.1z"/></svg>'
    },
  ];

  function renderNav(activePage) {

    var desktopLinks = NAV_LINKS.map(function(l) {
      var cls  = l.href === activePage ? ' class="active"' : '';
      var id   = l.id ? ' id="' + l.id + '"' : '';
      var icon = NAV_ICONS[l.href] || '•';
      return '<li><a href="' + l.href + '"' + cls + id + '>' +
               '<span class="nav-icon" aria-hidden="true">' + icon + '</span>' +
               '<span class="nav-label">' + l.label + '</span>' +
             '</a></li>';
    }).join('');

    var mobileLinks = [
      { href:'index.html',       label:'Home' },
      { href:'services.html',    label:'Services' },
      { href:'portfolio.html',   label:'Portfolio' },

      { href:'about.html',       label:'About' },
      { href:'book-us.html',     label:'Book Us' },
    ].map(function(l) {
      var cls = l.href === activePage ? ' class="active"' : '';
      var id  = l.id ? ' id="' + l.id + '"' : '';
      return '<a href="' + l.href + '"' + cls + id + ' onclick="closeSidebar()">' + l.label + '</a>';
    }).join('');

    /* ── Social links: same icon+label markup as the main nav items,
       so they inherit the exact same desktop styling/expand behaviour.
       Mobile gets its own small icon row instead. ── */
    var socialDesktopLinks = SOCIAL_LINKS.map(function(s) {
      return '<li><a href="' + s.href + '" target="_blank" rel="noopener noreferrer" aria-label="' + s.label + '">' +
               '<span class="nav-icon" aria-hidden="true">' + s.icon + '</span>' +
               '<span class="nav-label">' + s.label + '</span>' +
             '</a></li>';
    }).join('');

    var socialMobileLinks = SOCIAL_LINKS.map(function(s) {
      return '<a href="' + s.href + '" target="_blank" rel="noopener noreferrer" aria-label="' + s.label + '" class="mob-social-link">' +
               s.icon +
             '</a>';
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
      /* ── LEFT-SIDE VERTICAL NAV OVERRIDES ── */
      '.nav{position:fixed;top:0;left:0;right:auto;bottom:0;width:var(--nav-w-collapsed);height:100vh;flex-direction:column;align-items:stretch;padding:20px 0 24px;border-right:1px solid var(--border2);border-bottom:none;z-index:1100;overflow:hidden;transition:width 0.3s cubic-bezier(0.4,0,0.2,1);}' +
      '.nav.expanded{width:var(--nav-w);box-shadow:4px 0 32px rgba(0,0,0,0.14);}' +
      '[data-theme="dark"] .nav.expanded{box-shadow:4px 0 48px rgba(0,0,0,0.55);}' +
      '.nav-backdrop{display:none;position:fixed;inset:0;z-index:1099;background:rgba(0,0,0,0.35);backdrop-filter:blur(1px);-webkit-backdrop-filter:blur(1px);}' +
      '.nav-backdrop.open{display:block;}' +
      '.nav-handle{display:none!important;}' +
      '.nav-in{display:none;}' +
      '.nav .logo{display:flex;align-items:center;gap:9px;padding:0 11px;margin-bottom:32px;cursor:pointer;white-space:nowrap;}' +
      '.nav .logo .logo-text{opacity:0;transition:opacity 0.15s ease;pointer-events:none;}' +
      '.nav.expanded .logo .logo-text{opacity:1;pointer-events:auto;}' +
      '.nav .nav-links{display:flex;flex-direction:column;gap:2px;list-style:none;flex:1;padding:0 8px;}' +
      '.nav .nav-links li{width:100%;}' +
      '.nav .nav-links a{display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:8px;font-size:13.5px;overflow:hidden;white-space:nowrap;}' +
      '.nav .nav-links a .nav-label{opacity:0;transition:opacity 0.15s ease;pointer-events:none;}' +
      '.nav.expanded .nav-links a .nav-label{opacity:1;pointer-events:auto;}' +
      '.nav .nav-icon{font-size:17px;flex-shrink:0;width:22px;text-align:center;}' +
      '.nav .nav-divider{height:1px;background:var(--border);margin:8px 11px 6px;list-style:none;padding:0;flex-shrink:0;}' +
      '.mob-social{display:flex;gap:10px;padding:14px 20px 6px;}' +
      '.mob-social-link{display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:10px;background:var(--bg2);color:var(--text2);transition:all .2s;flex-shrink:0;}' +
      '.mob-social-link:hover{background:var(--gold-dim);color:var(--gold);}' +
      '.f-social{display:flex;gap:8px;margin-top:14px;}' +
      '.f-social-link{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;background:var(--bg2);color:var(--text2);transition:all .2s;flex-shrink:0;}' +
      '.f-social-link:hover{background:var(--gold-dim);color:var(--gold);}' +
      '.nav-bottom{display:flex;flex-direction:column;gap:8px;padding:16px 8px 0;margin-top:auto;border-top:1px solid var(--border);overflow:hidden;}' +
      '.nav-bottom>*{opacity:0;pointer-events:none;transition:opacity 0.15s ease;}' +
      '.nav.expanded .nav-bottom>*{opacity:1;pointer-events:auto;}' +
      '.nav-guest{flex-direction:column!important;gap:7px!important;}' +
      '.nav-guest .btn-ghost-sm,.nav-guest .btn-gold-sm{width:100%;text-align:center;}' +
      '.nav .theme-btn{width:100%;text-align:left;padding:8px 12px;border-radius:8px;}' +
      '.nav .hamburger{display:none!important;}' +
      '.nav .u-drop{left:calc(100% + 6px);right:auto;top:0;bottom:auto;}' +
      'body{padding-left:var(--nav-w-collapsed)!important;padding-right:0!important;padding-top:0!important;}' +
      '.page-wrap{padding-left:var(--nav-w-collapsed)!important;padding-right:0!important;}' +
      '@media(max-width:768px){' +
        '.nav{width:0!important;padding:0!important;border-right:none!important;box-shadow:none!important;}' +
        '.nav *{opacity:0!important;pointer-events:none!important;}' +
        'body{padding-left:0!important;}' +
        '.page-wrap{padding-left:0!important;}' +
      '}' +
      '</style>' +

      /* ── Left-side vertical nav ── */
      /* Backdrop — sits between nav and page when expanded, click to collapse */
      /* ── Mobile top bar (hidden on desktop via CSS) ── */
      '<div id="ig-mob-topbar" style="display:none;">' +
        '<a href="index.html" class="mob-topbar-logo">' +
          '<img src="logo.png" alt="ImpactGrid" onerror="this.style.display=\'none\'" />' +
          'ImpactGrid' +
        '</a>' +
        '<button class="mob-topbar-ham" onclick="openSidebar()" aria-label="Open menu">' +
          '<span></span><span></span><span></span>' +
        '</button>' +
      '</div>' +

      '<div class="nav-backdrop" id="navBackdrop" onclick="toggleNavExpand()"></div>' +
      '<nav class="nav" id="mainNav" aria-label="Main navigation">' +
        '<button class="logo" id="navLogo" onclick="toggleNavExpand()" aria-label="Toggle navigation" aria-expanded="false" aria-controls="mainNav">' +
          '<img src="logo.png" class="logo-img" alt="ImpactGrid" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'"/>' +
          '<div class="logo-mark" style="display:none;">IG</div>' +
          '<span class="logo-text">ImpactGrid</span>' +
        '</button>' +

        '<ul class="nav-links">' +
          desktopLinks +
        '</ul>' +



        '<div class="nav-bottom">' +
          '<button class="theme-btn" id="themeBtn" onclick="toggleTheme()" aria-label="Toggle theme">Dark mode</button>' +

          /* ── GUEST: hidden from public — admin accesses login via footer link ── */
          '<div id="navGuest" class="nav-guest" style="display:none;flex-direction:column;gap:7px;">' +
            '<a href="login.html" class="btn-ghost-sm">Admin Login</a>' +
          '</div>' +

          /* ── USER: shown when logged in (admin only) ── */
          '<div id="navUser" style="display:none;position:relative;">' +
            '<button class="user-btn" onclick="toggleDD()" aria-label="Account menu">' +
              '<div class="u-av" id="userAv">?</div>' +
              '<span class="u-name" id="userName">Admin</span>' +
              '<span class="u-chev">▾</span>' +
            '</button>' +
            '<div class="u-drop" id="uDrop">' +
              '<div class="dd-email" id="userEmail"></div>' +
              '<div class="dd-div"></div>' +
              '<a href="admin.html" id="ddDashLink">Admin Panel</a>' +
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
        '<div class="mob-social">' + socialMobileLinks + '</div>' +
        '<div class="mob-auth">' +
          /* Guest state — hidden from public */
          '<div class="mob-out" id="mobOut" style="display:none;">' +
            '<a href="login.html" class="mob-alink" onclick="closeSidebar()">Admin Login</a>' +
          '</div>' +
          /* Logged-in state — admin only */
          '<div class="mob-in" id="mobIn">' +
            '<a href="admin.html" id="mobDashCta" class="mob-adash" onclick="closeSidebar()">Admin Panel →</a>' +
            '<button class="mob-asignout" onclick="igSignOut()">Sign out</button>' +
          '</div>' +
        '</div>' +
        '<div class="mob-theme-row">' +
          '<span>Theme</span>' +
          '<button class="mob-tbtn" id="mobTBtn" onclick="toggleTheme()">Dark</button>' +
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

    /* Logo click on mobile opens the mobile sidebar instead */
    var logo = document.getElementById('navLogo');
    if (logo) {
      logo.addEventListener('click', function(e) {
        if (window.innerWidth <= 768) {
          e.preventDefault();
          e.stopPropagation();
          openSidebar();
        }
        /* Desktop: onclick="toggleNavExpand()" in HTML handles it */
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
      /* Close mobile sidebar */
      window.closeSidebar();
      /* Collapse expanded desktop nav */
      var nav = document.getElementById('mainNav');
      if (nav && nav.classList.contains('expanded')) {
        window.toggleNavExpand();
      }
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
              '<p>Capturing moments &amp; delivering experiences. Manchester, UK.</p>' +
              '<div class="f-social">' +
                SOCIAL_LINKS.map(function(s) {
                  return '<a href="' + s.href + '" target="_blank" rel="noopener noreferrer" aria-label="' + s.label + '" class="f-social-link">' +
                           s.icon +
                         '</a>';
                }).join('') +
              '</div>' +
            '</div>' +
            '<div class="fc"><h4>Navigate</h4><a href="index.html">Home</a><a href="services.html">Services</a><a href="portfolio.html">Portfolio</a><a href="about.html">About</a><a href="book-us.html">Book Us</a></div>' +
            '<div class="fc"><h4>Contact</h4><a href="mailto:events@impactgridgroup.com">events@impactgridgroup.com</a><a href="tel:07469016509">07469 016509</a></div>' +
            '<div class="fc"><h4>Legal</h4><a href="privacy.html">Privacy Policy</a><a href="terms.html">Terms of Service</a></div>' +
          '</div>' +
          '<div class="footer-bot">' +
            '<span>© 2026 ImpactGrid Group Ltd. All rights reserved.</span>' +
            '<div class="footer-legal"><a href="login.html" style="opacity:0.35;font-size:11px;" id="footerAdminLink">Admin</a></div>' +
            '<button class="footer-tbtn" onclick="toggleTheme()" id="footerTBtn" aria-label="Toggle dark/light mode">Dark mode</button>' +
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
    if (dark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    var tb = document.getElementById('themeBtn');   if(tb) tb.textContent = dark ? 'Light mode' : 'Dark mode';
    var fb = document.getElementById('footerTBtn'); if(fb) fb.textContent = dark ? 'Light mode' : 'Dark mode';
    var mb = document.getElementById('mobTBtn');    if(mb) mb.textContent = dark ? 'Light' : 'Dark';
    try { localStorage.setItem('ig_theme', dark ? 'dark' : 'light'); } catch(e) {}
  }
  window.toggleTheme = function() { _applyTheme(!_isDark); };
  /* Only activate dark if the user has previously chosen it — light is the default */
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
    /* Theme already restored at IIFE boot — nothing else needed here */
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

    /* Hide footer admin link — they're already in */
    var footerAdmin = document.getElementById('footerAdminLink');
    if (footerAdmin) footerAdmin.style.display = 'none';

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
    if (guest) guest.style.display = 'none'; /* keep hidden — admin uses footer link */
    if (user)  user.style.display  = 'none';

    var mobOut  = document.getElementById('mobOut');
    var mobIn   = document.getElementById('mobIn');
    var mobCard = document.getElementById('mobUserCard');
    if (mobOut)  mobOut.style.display = 'none'; /* hidden from public */
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
    /* Only admin can log in — always link to admin.html */
    var href  = 'admin.html';
    var label = 'Admin Panel';

    var ddLink = document.getElementById('ddDashLink');
    if (ddLink) { ddLink.href = href; ddLink.textContent = label; }

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

    // ── Update nav display — only admin can log in ──
    var effectiveRole = 'admin';
    var displayName   = 'Admin';
    window.setNavUser({ email: fallbackEmail, user_metadata: { full_name: displayName, avatar_url: avatarUrl } });

    // ── Update dashboard links ──
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
     NAV EXPAND / COLLAPSE
     Logo click → expands nav as overlay + shows backdrop.
     Backdrop click or Escape → collapses back to logo strip.
  ───────────────────────────────────────── */
  window.toggleNavExpand = function() {
    var nav      = document.getElementById('mainNav');
    var backdrop = document.getElementById('navBackdrop');
    var logo     = document.getElementById('navLogo');
    if (!nav) return;
    var expanded = nav.classList.toggle('expanded');
    if (backdrop) backdrop.classList.toggle('open', expanded);
    if (logo)     logo.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    try { localStorage.setItem('ig_nav_expanded', expanded ? '1' : '0'); } catch(e) {}
  };

  /* Keep old name as alias so any page calling toggleNavCollapse() still works */
  window.toggleNavCollapse = window.toggleNavExpand;

  /* Restore expanded state on load */
  (function() {
    function _restoreNav() {
      try {
        if (localStorage.getItem('ig_nav_expanded') === '1') {
          var nav      = document.getElementById('mainNav');
          var backdrop = document.getElementById('navBackdrop');
          var logo     = document.getElementById('navLogo');
          if (!nav) return;
          nav.classList.add('expanded');
          if (backdrop) backdrop.classList.add('open');
          if (logo)     logo.setAttribute('aria-expanded', 'true');
        }
      } catch(e) {}
    }
    document.addEventListener('ig-nav-ready', _restoreNav);
  })();

  /* ─────────────────────────────────────────
     PUBLIC API
  ───────────────────────────────────────── */
  window.renderNav    = renderNav;
  window.renderFooter = renderFooter;

  /* ── Auto-load AI chat bubble on every page ── */
  (function() {
    if (document.getElementById('ig-chat-wrap')) return; // already loaded
    var s = document.createElement('script');
    s.src = 'ig-chat.js';
    s.defer = true;
    document.body.appendChild(s);
  })();

})();

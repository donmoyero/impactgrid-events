/* ═══════════════════════════════════════════════════════════
   IMPACTGRID — plan-gate.js
   Shared plan-limit UI: upgrade modal + smart upgrade bar.
   Load after plan-config.js and before studio JS files.

   Exposes:
     window.showPlanGate(opts)   — full-screen upgrade modal
     window.showUpgradeBar(msg, isLoggedIn, opts) — pill bar
     window.hidePlanGate()
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Helpers ──────────────────────────────────────────── */
  var _ADMIN_EMAIL = 'admin@impactgridgroup.com';
  function getPlan() {
    // Admin email is always ground truth — bypasses all plan limits
    var email = (window.igUser && window.igUser.email) || '';
    if (email === _ADMIN_EMAIL) return 'admin';
    // igUser.plan set by auth.js after login
    if (window.igUser && window.igUser.plan) {
      var p = window.igUser.plan;
      // Validate against known plans in config — reject unknown values
      if (window.IG_PLAN_CONFIG && window.IG_PLAN_CONFIG[p]) return p;
      return p; // still return it even if config not loaded yet
    }
    try { return localStorage.getItem('ig_plan') || 'free'; } catch(e) { return 'free'; }
  }

  function getAIUses() {
    if (window.igUser && typeof window.igUser.aiUses === 'number') return window.igUser.aiUses;
    try { return parseInt(localStorage.getItem('ig_ai_uses') || '0'); } catch(e) { return 0; }
  }

  function planCfg(plan) {
    // Always read from plan-config.js (single source of truth).
    // Fallback values only used if plan-config.js hasn't loaded yet — should never happen in prod.
    if (window.IG_PLAN_CONFIG && window.IG_PLAN_CONFIG[plan]) return window.IG_PLAN_CONFIG[plan];
    // Hard fallbacks mirror plan-config.js exactly
    var _fallbacks = {
      free:         { label: 'Free',         ai_uses: 3,        carousels: 3,        portfolios: 3,        adviser: 0,   evaluator: 3,  content_plan: 3,  support: 'None',            stripe_link: null },
      professional: { label: 'Professional', ai_uses: 100,      carousels: 10,       portfolios: 3,        adviser: 10,  evaluator: 10, content_plan: 99, support: 'Email',           stripe_link: 'https://buy.stripe.com/cNiaEQgYEgpO0Akgik8N206' },
      enterprise:   { label: 'Enterprise',   ai_uses: Infinity, carousels: Infinity, portfolios: Infinity, adviser: Infinity, evaluator: Infinity, content_plan: Infinity, support: 'Priority (24hr)', stripe_link: 'https://buy.stripe.com/28E28k4bS8Xmera2ru8N207' },
      admin:        { label: 'Admin',        ai_uses: Infinity, carousels: Infinity, portfolios: Infinity, adviser: Infinity, evaluator: Infinity, content_plan: Infinity, support: 'Internal',        stripe_link: null }
    };
    return _fallbacks[plan] || _fallbacks.free;
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Plan upgrade path ────────────────────────────────── */
  function nextPlan(current) {
    if (current === 'admin') return null; // admin is never prompted to upgrade
    if (current === 'free')         return 'professional';
    if (current === 'professional') return 'enterprise';
    return null; // enterprise / admin — already at top
  }

  /* ── UPGRADE MODAL ────────────────────────────────────── */
  var _modalInjected = false;

  function injectModal() {
    if (_modalInjected || document.getElementById('igPlanGate')) return;
    _modalInjected = true;

    /* Styles */
    var style = document.createElement('style');
    style.id  = '_planGateStyles';
    style.textContent = `
      #igPlanGate {
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(0,0,0,.72);
        backdrop-filter: blur(8px);
        display: none;
        align-items: center;
        justify-content: center;
        padding: 20px;
        font-family: 'DM Sans', 'Syne', sans-serif;
      }
      #igPlanGate.open { display: flex; }

      .pg-card {
        background: var(--card, #1c1814);
        border: 1px solid var(--border, rgba(255,255,255,.1));
        border-radius: 20px;
        width: 100%;
        max-width: 480px;
        box-shadow: 0 32px 80px rgba(0,0,0,.6);
        overflow: hidden;
        animation: pgSlideUp .28s cubic-bezier(.22,1,.36,1);
      }
      @keyframes pgSlideUp {
        from { opacity:0; transform:translateY(24px) scale(.97); }
        to   { opacity:1; transform:translateY(0) scale(1); }
      }

      .pg-header {
        padding: 28px 28px 20px;
        border-bottom: 1px solid var(--border, rgba(255,255,255,.08));
        position: relative;
      }
      .pg-close {
        position: absolute; top: 16px; right: 16px;
        width: 28px; height: 28px;
        border-radius: 50%;
        border: 1px solid var(--border, rgba(255,255,255,.12));
        background: transparent;
        color: var(--text3, rgba(255,255,255,.4));
        font-size: 13px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background .15s, color .15s;
      }
      .pg-close:hover { background: var(--bg2,rgba(255,255,255,.06)); color: var(--text,#f0ede8); }

      .pg-icon { font-size: 28px; margin-bottom: 10px; }
      .pg-title {
        font-family: 'Syne', sans-serif;
        font-size: 20px; font-weight: 800;
        color: var(--text, #f0ede8);
        margin-bottom: 6px; line-height: 1.2;
      }
      .pg-subtitle {
        font-size: 13px;
        color: var(--text2, rgba(240,237,232,.65));
        line-height: 1.5;
      }

      .pg-usage {
        padding: 16px 28px;
        border-bottom: 1px solid var(--border, rgba(255,255,255,.08));
        display: flex; gap: 16px;
      }
      .pg-usage-item {
        flex: 1;
        background: var(--bg2, rgba(255,255,255,.04));
        border: 1px solid var(--border, rgba(255,255,255,.08));
        border-radius: 10px;
        padding: 12px;
        text-align: center;
      }
      .pg-usage-num {
        font-family: 'DM Mono', monospace;
        font-size: 22px; font-weight: 700;
        color: var(--gold, #c97e08);
        line-height: 1;
      }
      .pg-usage-label {
        font-size: 10px; font-weight: 700;
        color: var(--text3, rgba(240,237,232,.4));
        text-transform: uppercase; letter-spacing: .06em;
        margin-top: 4px;
        font-family: 'DM Mono', monospace;
      }

      .pg-plans {
        padding: 16px 28px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        border-bottom: 1px solid var(--border, rgba(255,255,255,.08));
      }
      .pg-plan-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        border-radius: 12px;
        border: 1px solid var(--border, rgba(255,255,255,.08));
        background: var(--bg2, rgba(255,255,255,.03));
        cursor: default;
        transition: border-color .15s;
      }
      .pg-plan-row.recommended {
        border-color: var(--gold, #c97e08);
        background: rgba(201,126,8,.06);
      }
      .pg-plan-row.current {
        opacity: .55;
      }
      .pg-plan-icon {
        font-size: 20px; flex-shrink: 0;
      }
      .pg-plan-info { flex: 1; }
      .pg-plan-name {
        font-family: 'Syne', sans-serif;
        font-size: 14px; font-weight: 800;
        color: var(--text, #f0ede8);
        display: flex; align-items: center; gap: 6px;
      }
      .pg-plan-badge {
        font-size: 9px; font-weight: 700;
        font-family: 'DM Mono', monospace;
        padding: 2px 7px; border-radius: 99px;
        background: var(--gold, #c97e08);
        color: #fff; text-transform: uppercase; letter-spacing: .06em;
      }
      .pg-plan-badge.current-badge {
        background: var(--text3, rgba(240,237,232,.25));
        color: var(--text2, rgba(240,237,232,.65));
      }
      .pg-plan-features {
        font-size: 11px;
        color: var(--text3, rgba(240,237,232,.5));
        margin-top: 3px; line-height: 1.5;
        font-family: 'DM Mono', monospace;
      }
      .pg-plan-cta {
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 12px; font-weight: 700;
        font-family: 'Syne', sans-serif;
        border: none; cursor: pointer;
        white-space: nowrap;
        text-decoration: none;
        display: inline-flex; align-items: center;
        transition: opacity .15s, transform .1s;
        background: linear-gradient(135deg, var(--gold,#c97e08), #e07b08);
        color: #fff;
      }
      .pg-plan-cta:hover { opacity: .9; transform: translateY(-1px); }
      .pg-plan-cta.ghost {
        background: transparent;
        border: 1px solid var(--border, rgba(255,255,255,.15));
        color: var(--text2, rgba(240,237,232,.65));
        cursor: default;
        pointer-events: none;
      }

      .pg-footer {
        padding: 14px 28px;
        display: flex;
        justify-content: center;
      }
      .pg-dismiss {
        font-size: 12px;
        color: var(--text3, rgba(240,237,232,.4));
        background: none; border: none; cursor: pointer;
        font-family: inherit;
        transition: color .15s;
      }
      .pg-dismiss:hover { color: var(--text2, rgba(240,237,232,.65)); }

      /* ── Smart Upgrade Bar ── */
      #igUpgradeBar {
        position: fixed;
        top: 72px; left: 50%;
        transform: translateX(-50%) translateY(-16px);
        background: var(--card, #1c1814);
        border: 1px solid var(--border, rgba(255,255,255,.1));
        border-radius: 999px;
        padding: 10px 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,.4);
        opacity: 0;
        transition: all .3s ease;
        z-index: 9998;
        pointer-events: none;
        max-width: calc(100vw - 40px);
      }
      #igUpgradeBar.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
        pointer-events: auto;
      }
      .igub-inner {
        display: flex; gap: 10px; align-items: center;
        font-size: 12px; white-space: nowrap;
        flex-wrap: wrap;
      }
      .igub-msg {
        color: var(--text2, rgba(240,237,232,.75));
        flex: 1; min-width: 0;
        overflow: hidden; text-overflow: ellipsis;
      }
      .igub-btn {
        padding: 6px 14px;
        border-radius: 8px;
        font-size: 11px; font-weight: 700;
        font-family: 'Syne', sans-serif;
        border: none; cursor: pointer;
        text-decoration: none;
        display: inline-flex; align-items: center;
        white-space: nowrap;
        transition: opacity .15s;
      }
      .igub-btn.primary {
        background: linear-gradient(135deg, var(--gold,#c97e08), #e07b08);
        color: #fff;
      }
      .igub-btn.secondary {
        background: var(--bg2, rgba(255,255,255,.08));
        color: var(--text2, rgba(240,237,232,.75));
        border: 1px solid var(--border, rgba(255,255,255,.12));
      }
      .igub-btn:hover { opacity: .85; }
      .igub-expand {
        background: none; border: none;
        color: var(--gold, #c97e08);
        font-size: 11px; font-weight: 700;
        font-family: 'DM Mono', monospace;
        cursor: pointer; padding: 0;
        white-space: nowrap;
      }
      .igub-expand:hover { text-decoration: underline; }
    `;
    document.head.appendChild(style);

    /* Modal DOM */
    var modal = document.createElement('div');
    modal.id = 'igPlanGate';
    modal.innerHTML = `
      <div class="pg-card">
        <div class="pg-header">
          <button class="pg-close" onclick="window.hidePlanGate()">✕</button>
          <div class="pg-icon" id="pgIcon">🚀</div>
          <div class="pg-title" id="pgTitle">You've reached your plan limit</div>
          <div class="pg-subtitle" id="pgSubtitle">Upgrade to keep creating.</div>
        </div>
        <div class="pg-usage" id="pgUsage"></div>
        <div class="pg-plans" id="pgPlans"></div>
        <div class="pg-footer">
          <button class="pg-dismiss" onclick="window.hidePlanGate()">Continue on free plan</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    /* Close on backdrop click */
    modal.addEventListener('click', function (e) {
      if (e.target === modal) window.hidePlanGate();
    });

    /* Upgrade bar DOM */
    var bar = document.createElement('div');
    bar.id = 'igUpgradeBar';
    document.body.appendChild(bar);
  }

  /* ── BUILD MODAL CONTENT ──────────────────────────────── */
  function buildModalContent(opts) {
    opts = opts || {};
    var plan     = getPlan();
    var aiUses   = getAIUses();
    var cfg      = planCfg(plan);
    var aiLimit  = cfg.ai_uses;
    var next     = nextPlan(plan);
    var nextCfg  = next ? planCfg(next) : null;

    /* Icon + title */
    var iconEl    = document.getElementById('pgIcon');
    var titleEl   = document.getElementById('pgTitle');
    var subtitleEl= document.getElementById('pgSubtitle');

    if (iconEl)     iconEl.textContent    = opts.icon || '🚀';
    if (titleEl)    titleEl.textContent   = opts.title || 'You\u2019ve reached your plan limit';
    if (subtitleEl) subtitleEl.textContent= opts.subtitle || 'Upgrade to keep creating without limits.';

    /* Usage stats */
    var usageEl = document.getElementById('pgUsage');
    if (usageEl) {
      var aiRemain  = isFinite(aiLimit) ? Math.max(0, aiLimit - aiUses) : '∞';

      // Use actual used counts from psState/localStorage so we show REMAINING, not total limit.
      // psState is defined in portfolio-studio.js and is always in scope on the studio page.
      var pfUsed  = (window.psState && Array.isArray(window.psState.portfolios))
        ? window.psState.portfolios.length
        : (parseInt(localStorage.getItem('ig_portfolio_count') || '0') || 0);
      var carUsed = parseInt(localStorage.getItem('ig_carousel_count') || '0') || 0;

      var carRemain = cfg.carousels !== undefined
        ? (isFinite(cfg.carousels) ? Math.max(0, cfg.carousels - carUsed) : '∞')
        : '∞';
      var pfRemain  = cfg.portfolios !== undefined
        ? (isFinite(cfg.portfolios) ? Math.max(0, cfg.portfolios - pfUsed) : '∞')
        : '∞';

      usageEl.innerHTML = `
        <div class="pg-usage-item">
          <div class="pg-usage-num">${esc(String(aiRemain))}</div>
          <div class="pg-usage-label">AI uses left</div>
        </div>
        <div class="pg-usage-item">
          <div class="pg-usage-num">${esc(String(carRemain))}</div>
          <div class="pg-usage-label">Carousel slots left</div>
        </div>
        <div class="pg-usage-item">
          <div class="pg-usage-num">${esc(String(pfRemain))}</div>
          <div class="pg-usage-label">Portfolio slots left</div>
        </div>`;
    }

    /* Plan rows */
    var plansEl = document.getElementById('pgPlans');
    if (plansEl) {
      plansEl.innerHTML = '';

      var plansToShow = [plan];
      if (next) plansToShow.push(next);
      if (next && next !== 'enterprise') plansToShow.push('enterprise');
      /* Deduplicate */
      plansToShow = plansToShow.filter(function (p, i, a) { return a.indexOf(p) === i; });

      plansToShow.forEach(function (p) {
        var c        = planCfg(p);
        var isCurrent = p === plan;
        var isRec     = p === next;
        var icons     = { free: '🌱', professional: '⚡', enterprise: '✦', admin: '👑' };
        var aiStr     = isFinite(c.ai_uses) ? c.ai_uses + '/mo AI uses' : 'Unlimited AI uses';
        var carStr    = isFinite(c.carousels) ? c.carousels + ' carousels' : 'Unlimited carousels';
        var pfStr     = isFinite(c.portfolios) ? c.portfolios + ' portfolio' + (c.portfolios !== 1 ? 's' : '') : 'Unlimited portfolios';
        var features  = aiStr + ' · ' + carStr + ' · ' + pfStr;
        if (c.support && c.support !== 'None') features += ' · ' + c.support + ' support';

        var ctaHtml = '';
        if (isCurrent) {
          ctaHtml = '<span class="pg-plan-cta ghost">Current plan</span>';
        } else if (c.stripe_link) {
          ctaHtml = '<a href="' + esc(c.stripe_link) + '" target="_blank" class="pg-plan-cta">Upgrade →</a>';
        } else {
          ctaHtml = '<a href="pricing.html" class="pg-plan-cta">See all plans →</a>';
        }

        var row = document.createElement('div');
        row.className = 'pg-plan-row' + (isCurrent ? ' current' : '') + (isRec ? ' recommended' : '');
        row.innerHTML = `
          <div class="pg-plan-icon">${icons[p] || '⭐'}</div>
          <div class="pg-plan-info">
            <div class="pg-plan-name">
              ${esc(c.label)}
              ${isRec ? '<span class="pg-plan-badge">Recommended</span>' : ''}
              ${isCurrent ? '<span class="pg-plan-badge current-badge">Your plan</span>' : ''}
            </div>
            <div class="pg-plan-features">${esc(features)}</div>
          </div>
          ${ctaHtml}`;
        plansEl.appendChild(row);
      });
    }
  }

  /* ── PUBLIC: SHOW MODAL ───────────────────────────────── */
  window.showPlanGate = function (opts) {
    if (getPlan() === 'admin') return; // admin sees no gates
    injectModal();
    buildModalContent(opts || {});
    var modal = document.getElementById('igPlanGate');
    if (modal) modal.classList.add('open');
  };

  /* ── PUBLIC: HIDE MODAL ───────────────────────────────── */
  window.hidePlanGate = function () {
    var modal = document.getElementById('igPlanGate');
    if (modal) modal.classList.remove('open');
  };

  /* ── PUBLIC: SMART UPGRADE BAR ────────────────────────── */
  /*
   * showUpgradeBar_gate(message, isLoggedIn, opts)
   * Studio files call this via their own showUpgradeBar() shim.
   *   isLoggedIn === true  → logged in + plan limit → "Upgrade" + "See details"
   *   isLoggedIn === false → not logged in          → "Sign in" + "Create account"
   *   opts.persistent      → don't auto-hide
   *   opts.duration        → ms before auto-hide (default 6000)
   */
  var _barTimer = null;

  window.showUpgradeBar_gate = function (message, isLoggedIn, opts) {
    if (getPlan() === 'admin') return; // admin never sees upgrade prompts
    injectModal();
    opts = opts || {};

    var bar = document.getElementById('igUpgradeBar');
    if (!bar) return;

    var buttons = '';
    if (isLoggedIn === true) {
      /* Hit plan limit — logged in */
      var plan = getPlan();
      var next = nextPlan(plan);
      var cfg  = next ? planCfg(next) : null;
      var href = (cfg && cfg.stripe_link) ? cfg.stripe_link : 'pricing.html';
      buttons  = '<a href="' + esc(href) + '" target="_blank" class="igub-btn primary">Upgrade plan →</a>'
               + '<button class="igub-expand" onclick="window.showPlanGate({title:\'Upgrade your plan\',subtitle:\'' + esc(message) + '\'})">See details</button>';
    } else if (isLoggedIn === false) {
      /* Not logged in */
      buttons = '<a href="login.html" class="igub-btn secondary">Sign in</a>'
              + '<a href="join.html" class="igub-btn primary">Create account — it\'s free</a>';
    } else {
      /* Legacy call without isLoggedIn flag — default to the logged-in limit path
         so we never show a hostile "Sign in + Upgrade" wall to existing users */
      var plan2 = getPlan();
      var next2 = nextPlan(plan2);
      var cfg2  = next2 ? planCfg(next2) : null;
      var href2 = (cfg2 && cfg2.stripe_link) ? cfg2.stripe_link : 'pricing.html';
      buttons   = '<a href="' + esc(href2) + '" target="_blank" class="igub-btn primary">Upgrade plan →</a>'
                + '<button class="igub-expand" onclick="window.showPlanGate({title:\'Upgrade your plan\'})">See details</button>';
    }

    bar.innerHTML = `
      <div class="igub-inner">
        <span class="igub-msg">${esc(message)}</span>
        ${buttons}
      </div>`;

    if (_barTimer) { clearTimeout(_barTimer); _barTimer = null; }
    bar.classList.add('show');

    if (!opts.persistent) {
      _barTimer = setTimeout(function () {
        bar.classList.remove('show');
        _barTimer = null;
      }, opts.duration || 6000);
    }
  };

  /* ── ESC key closes modal ─────────────────────────────── */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') window.hidePlanGate();
  });

  console.log('[PlanGate] Loaded — upgrade modal + smart bar ready');
  // Flush any calls queued by studio shims before plan-gate.js loaded
  document.dispatchEvent(new Event('plan-gate-ready'));
  var _q = window._pgQueue || [];
  _q.forEach(function (args) { window.showUpgradeBar_gate.apply(null, args); });
  window._pgQueue = [];

})();

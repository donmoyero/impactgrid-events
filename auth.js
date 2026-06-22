// ═══════════════════════════════════════════════════════════
//  ImpactGrid — auth.js  (single source of truth for auth)
//
//  Plan source of truth: profiles.plan (login Supabase DB)
//  AI use counter:       profiles.ai_uses_month (reset monthly)
//  Both are fetched by nav.js → _loadProfile() and written to:
//    window.igUser.plan, window.igUser.aiUses
//    localStorage: ig_plan, ig_ai_uses
//
//  auth.js reads those — it does NOT maintain its own counters.
//  canUse() and isAdmin() delegate to the shared system.
//
//  Free plan limits (authoritative):
//    portfolio: 3 (deleted from DB after 7 days — enforced server-side)
//    carousel:  3  |  ai_uses: 3  |  evaluator: 3  |  content_plan: 3
// ═══════════════════════════════════════════════════════════

// ── Supabase client init ─────────────────────────────────────────────────
// Client is created by supabase-config.js (which must load before auth.js).
// auth.js never creates its own client — it calls getSupabase() instead.
// Deferred init: retries until the SDK is ready (handles slow CDN loads).
(function () {
  function tryInit() {
    if (typeof supabase !== 'undefined' && typeof supabase.createClient === 'function') {
      if (typeof getSupabase === 'function') getSupabase();
    } else {
      setTimeout(tryInit, 50);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();

// ── State ────────────────────────────────────────────────────────────────
var IG_USER     = null;
var IG_IS_ADMIN = false;

// Plan limits — single definition used by canUse()
// Plans: 'free' | 'professional' | 'enterprise'
var IG_PLAN_LIMITS = {
  ai_uses:     { free: 3, professional: 100, enterprise: Infinity },
  portfolio:   { free: 3, professional: 3,   enterprise: 3        },
  carousel:    { free: 3, professional: 10,  enterprise: Infinity },
  generator:   { free: 3, professional: 100, enterprise: Infinity },
  evaluator:   { free: 3, professional: 10,  enterprise: Infinity },
  content_plan:{ free: 3, professional: 99,  enterprise: Infinity }
};

// ── Public accessors ─────────────────────────────────────────────────────
// getSupabase() is defined in ig-supabase.js — do not redefine here.
function getUser()      { return IG_USER; }
function setUser(user)  { IG_USER = user || null; }

/**
 * getPlan() — reads from most authoritative source:
 * 1. window.igUser.plan  (nav.js → profiles DB)
 * 2. localStorage ig_plan (cached by nav.js)
 * 3. Fallback 'free'
 */
function getPlan() {
  if (window.igUser && window.igUser.plan) return window.igUser.plan;
  try { return localStorage.getItem('ig_plan') || 'free'; } catch(e) { return 'free'; }
}

/**
 * getAIUses() — reads shared monthly counter:
 * 1. window.igUser.aiUses (nav.js → profiles DB)
 * 2. localStorage ig_ai_uses
 * 3. Fallback 0
 */
function getAIUses() {
  if (window.igUser && typeof window.igUser.aiUses === 'number') return window.igUser.aiUses;
  try { return parseInt(localStorage.getItem('ig_ai_uses') || '0'); } catch(e) { return 0; }
}
function getUses() { return getAIUses(); } // legacy alias

/**
 * incrementUses() — increments the shared monthly AI counter
 * in localStorage, window.igUser, AND Supabase profiles.
 * One call covers all tools — never double-count.
 */
async function incrementUses() {
  var next = getAIUses() + 1;
  try { localStorage.setItem('ig_ai_uses', String(next)); } catch(e) {}
  if (window.igUser) window.igUser.aiUses = next;
  try {
    var client = getSupabase();
    if (client && window.igUser && window.igUser.id) {
      await client.from('profiles')
        .update({ ai_uses_month: next })
        .eq('user_id', window.igUser.id);
    }
  } catch(e) {}
}
// Alias so carousel-studio.js and portfolio-studio.js can call it too
window.incrementAIUse = incrementUses;

/**
 * isAdmin() — enterprise plan OR admin email → full bypass
 */
function isAdmin() {
  if (IG_IS_ADMIN) return true;
  if (getPlan() === 'enterprise') return true;
  var user = window.igUser || IG_USER;
  if (user && user.email === 'admin@impactgridgroup.com') return true;
  return false;
}

/**
 * canUse(feature, currentCount?)
 *
 * AI-generating features (carousel, generator, evaluator, content_plan):
 *   checks shared ai_uses counter vs plan limit.
 *
 * Slot-based features (portfolio):
 *   pass existing portfolio count as second arg.
 *   canUse('portfolio', psState.portfolios.length)
 */
function canUse(feature, currentCount) {
  if (isAdmin()) return true;

  var plan   = getPlan();
  var limits = IG_PLAN_LIMITS[feature];
  if (!limits) return true;

  var limit = (limits[plan] !== undefined) ? limits[plan] : limits.free;
  if (limit === Infinity) return true;

  if (feature === 'portfolio') {
    var count = (typeof currentCount === 'number') ? currentCount : 0;
    return count < limit;
  }

  return getAIUses() < limit;
}

// ── initAuth ─────────────────────────────────────────────────────────────
async function initAuth() {
  const sb = window.supabaseClient;
  if (!sb) {
    console.warn("[Auth] supabaseClient not ready — skipping initAuth");
    return;
  }

  let data;
  try {
    ({ data } = await sb.auth.getUser());
  } catch(e) {
    console.warn("[Auth] getUser failed:", e.message);
    return;
  }

  setUser(data?.user || null);
  if (!getUser()) return;

  _applyAdminFlag(getUser());

  console.log("[Auth] Ready:", {
    email: getUser()?.email,
    plan:  getPlan(),
    admin: isAdmin()
  });

  if (typeof loadUser === 'function') loadUser();

  sb.auth.onAuthStateChange(function(event, session) {
    var u = session ? session.user : null;
    setUser(u);
    if (u) {
      _applyAdminFlag(u);
      if (typeof window.setNavUser  === 'function') window.setNavUser(u);
      if (typeof loadUser           === 'function') loadUser();
    } else {
      IG_IS_ADMIN = false;
      try { localStorage.removeItem('ig_plan');    } catch(e) {}
      try { localStorage.removeItem('ig_ai_uses'); } catch(e) {}
      if (typeof window.setNavGuest === 'function') window.setNavGuest();
    }
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────
function _applyAdminFlag(user) {
  if (!user) return;
  if (
    user.email === 'admin@impactgridgroup.com' ||
    user.user_metadata?.role === 'admin' ||
    getPlan() === 'enterprise'
  ) {
    IG_IS_ADMIN = true;
  }
}

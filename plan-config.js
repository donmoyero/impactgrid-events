// ═══════════════════════════════════════════════════════════
//  ImpactGrid — plan-config.js
//  SINGLE SOURCE OF TRUTH for all plan limits and labels.
//
//  Load order: must come AFTER ig-supabase.js, BEFORE auth.js
//  and any studio JS that reads plan limits.
//
//  Usage anywhere:
//    var cfg = window.IG_PLAN_CONFIG[getPlan()];
//    cfg.portfolios      → 3 (free) / 3 (professional) / 3 (enterprise)
//    cfg.ai_uses         → 3 / 100 / Infinity
//    cfg.label           → 'Free' / 'Professional' / 'Enterprise'
//
//  auth.js, portfolio-studio.js, carousel-studio.js, settings.html
//  should all read from here instead of defining their own copies.
// ═══════════════════════════════════════════════════════════

window.IG_PLAN_CONFIG = {

  free: {
    label:               'Free',
    ai_uses:             3,
    portfolios:          3,       // up to 3 — deleted from DB after 7 days
    carousels:           3,
    adviser:             0,
    evaluator:           3,
    content_plan:        3,
    data_retention_days: 7,       // authoritative — 30 days is wrong everywhere
    support:             'None',
    stripe_link:         null
  },

  professional: {
    label:               'Professional',
    ai_uses:             100,
    portfolios:          3,       // up to 3 live portfolios, saved permanently
    carousels:           10,
    adviser:             10,
    evaluator:           10,
    content_plan:        99,
    data_retention_days: null,    // kept while subscription is active
    support:             'Email',
    stripe_link:         'https://buy.stripe.com/cNiaEQgYEgpO0Akgik8N206'
  },

  enterprise: {
    label:               'Enterprise',
    ai_uses:             Infinity,
    portfolios:          Infinity, // unlimited live portfolios
    carousels:           Infinity,
    adviser:             Infinity,
    evaluator:           Infinity,
    content_plan:        Infinity,
    data_retention_days: null,    // forever
    support:             'Priority (24hr)',
    stripe_link:         'https://buy.stripe.com/28E28k4bS8Xmera2ru8N207'
  },

  admin: {
    label:               'Admin',
    ai_uses:             Infinity,
    portfolios:          Infinity,
    carousels:           Infinity,
    adviser:             Infinity,
    evaluator:           Infinity,
    content_plan:        Infinity,
    data_retention_days: null,
    support:             'Internal',
    stripe_link:         null
  }

};

// ── Convenience helpers ───────────────────────────────────────────────────

/**
 * igPlanLabel(plan)
 * Returns the display label for a plan key.
 * Replaces the manual capitalisation pattern used in 3+ files:
 *   plan.charAt(0).toUpperCase() + plan.slice(1)
 *
 * Usage: igPlanLabel('professional') → 'Professional'
 */
window.igPlanLabel = function(plan) {
  var cfg = window.IG_PLAN_CONFIG[plan];
  return cfg ? cfg.label : (plan || 'Free');
};

/**
 * igPlanLimit(plan, feature)
 * Returns the numeric limit for a feature on a given plan.
 * Usage: igPlanLimit('free', 'portfolios') → 3
 */
window.igPlanLimit = function(plan, feature) {
  var cfg = window.IG_PLAN_CONFIG[plan] || window.IG_PLAN_CONFIG.free;
  return (cfg[feature] !== undefined) ? cfg[feature] : 0;
};

console.log('[PlanConfig] Loaded — single source of truth for plan limits');

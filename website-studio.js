/* ═══════════════════════════════════════════════════════════
   IMPACTGRID CREATOR STUDIO — website-studio.js  v2.1

   Architecture matches carousel-studio.js exactly:
   ┌─────────────────────────────────────────────────────┐
   │  Browser (this file)                                │
   │    → POST /website/generate  (Render server)      │
   │    → POST /website/regen     (Render server)      │
   │    → Supabase REST API (direct, anon key only)      │
   │                                                     │
   │  Render server (portfolio-engine.js)                │
   │    → Groq llama-3.3-70b  (copy + legal)             │
   │    → Groq Llama Vision   (image scoring)            │
   │    → Supabase service key (trends)                  │
   └─────────────────────────────────────────────────────┘

   NO AI keys in this file. NO direct Anthropic/Groq calls.
   ═══════════════════════════════════════════════════════════ */

/* ── CONFIG ─────────────────────────────────────────────── */
const DIJO_SERVER           = "https://impactgrid-dijo.onrender.com";
const CLOUDINARY_CLOUD_NAME   = "dcw30ifa7";
const CLOUDINARY_UPLOAD_PRESET = "impactgrid_portfolio";
// ✅ FIX: portfolios table lives on the CONTENT project (exeiojgldxqaakkybdij),
//         NOT the auth project (wedjsnizcvtgptobwugc).
//         Using IG_CONTENT_URL / IG_CONTENT_ANON set by supabase-config.js.
const SUPABASE_URL = window.IG_CONTENT_URL  || "https://exeiojgldxqaakkybdij.supabase.co";
const SUPABASE_KEY = window.IG_CONTENT_ANON || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4ZWlvamdsZHhxYWFra3liZGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNDc4NTcsImV4cCI6MjA4ODkyMzg1N30.aRXgeHqaOxkidwpWVGEOKBQAeo9_C5Fk3Gu5ZlbmxTQ";

/* ── SESSION ID ─────────────────────────────────────────── */
let SESSION_ID = localStorage.getItem("ig_session");
if (!SESSION_ID) {
  SESSION_ID = "sess_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  localStorage.setItem("ig_session", SESSION_ID);
}

/* ── STATE ──────────────────────────────────────────────── */
let psState = {
  currentStep:      1,
  selectedTheme:    null,
  portfolios:       [],
  activePortfolio:  null,
  generating:       false,
  portfoliosLoaded: false,  // true once the first loadPortfolios() call resolves
};

// Holds the in-flight loadPortfolios() promise so checkPortfolioAccess()
// can await it instead of reading psState.portfolios while it's still empty.
let _portfoliosLoadPromise = null;

/* ── MONETISATION ─────────────────────────────────────────────────────
   All plan limits come from plan-config.js (window.IG_PLAN_CONFIG).
   Do NOT define limits here — edit plan-config.js only.

   Portfolio limits (current) — sourced from plan-config.js:
     free         → 3 portfolios (deleted from DB after 7 days per data_retention_days)
     professional → 3 portfolios (permanent while subscription active)
     enterprise   → unlimited    (permanent)
     admin        → unlimited    (internal)

   Generation costs 1 shared AI use (ig_ai_uses, reset monthly).
   AI limits: free=3/mo, professional=100/mo, enterprise=unlimited, admin=unlimited.
   Both sourced from window.igUser (set by nav.js from profiles DB).
─────────────────────────────────────────────────────────────────────── */
const PS_ADMIN_EMAIL = "admin@impactgridgroup.com";

/* Read limits from plan-config.js — fall back to safe defaults if not loaded yet.
   Fallbacks mirror plan-config.js exactly so limits never silently drift.
   portfolios:0 was wrong — free plan is 3, and blocking at 0 gates everyone if config is slow. */
function _getPlanCfg(plan) {
  if (plan === 'admin') return { portfolios: Infinity, ai_uses: Infinity };
  if (window.IG_PLAN_CONFIG && window.IG_PLAN_CONFIG[plan]) return window.IG_PLAN_CONFIG[plan];
  // Hard fallbacks — only used if plan-config.js hasn't loaded yet (should never happen in prod)
  if (plan === 'enterprise')   return { portfolios: Infinity, ai_uses: Infinity };
  if (plan === 'professional') return { portfolios: 3,        ai_uses: 100 };
  return                              { portfolios: 3,        ai_uses: 3   }; // free
}

function _getPlan() {
  // If the logged-in user is the admin email, always return 'admin'
  // regardless of what is stored in the DB or localStorage
  var email = (window.igUser && window.igUser.email) || '';
  if (email === PS_ADMIN_EMAIL) return 'admin';
  if (window.igUser && window.igUser.plan) return window.igUser.plan;
  try { return localStorage.getItem('ig_plan') || 'free'; } catch(e) { return 'free'; }
}
function _getAIUses() {
  if (_isAdmin()) return 0; // admin: unlimited, usage is irrelevant
  if (window.igUser && typeof window.igUser.aiUses === 'number') return window.igUser.aiUses;
  try { return parseInt(localStorage.getItem('ig_ai_uses') || '0'); } catch(e) { return 0; }
}
function _isAdmin() {
  // Check email first — email is the ground truth, plan field in DB may be wrong
  var email = (window.igUser && window.igUser.email) || '';
  if (email === PS_ADMIN_EMAIL) return true;
  // Only the 'admin' plan bypasses limits — enterprise is a paid plan with its own limits
  try {
    var plan = (window.igUser && window.igUser.plan) || localStorage.getItem('ig_plan') || '';
    if (plan === 'admin') return true;
  } catch(e) {}
  return false;
}

/* Admin never counts AI uses — skip increment */
async function incrementAIUse() {
  if (_isAdmin()) return; // admin: unlimited, don't track
  var next = _getAIUses() + 1;
  try { localStorage.setItem('ig_ai_uses', String(next)); } catch(e) {}
  if (window.igUser) window.igUser.aiUses = next;
  try {
    var client = (typeof getSupabase === 'function') ? getSupabase() : null;
    if (client && window.igUser && window.igUser.id) {
      await client.from('profiles')
        .update({ ai_uses_month: next })
        .eq('user_id', window.igUser.id);
    }
  } catch(e) {}
}

/* Safe shims in case auth.js defines these differently */
if (typeof isAdmin === 'undefined')  { window.isAdmin  = _isAdmin; }
if (typeof canUse  === 'undefined')  { window.canUse   = function() { return true; }; }

/* ── THEMES — used ONLY for the published portfolio mini-site (buildPortfolioHTML).
   The app UI theme is controlled entirely by shared.css + nav.js toggleTheme().
   Do NOT use these values to style anything inside website-studio.html. ── */
const THEMES = {
  dark:     { bg:"#1a1814", accent:"#c97e08", text:"#f0ede8", sub:"rgba(240,237,232,0.55)", surface:"#23201a", border:"rgba(255,255,255,0.07)", gradient:"linear-gradient(160deg,#1a1814 0%,#2a2318 100%)" },
  navy:     { bg:"#0f172a", accent:"#4f8ef7", text:"#f0ede8", sub:"rgba(240,237,232,0.55)", surface:"#162035", border:"rgba(255,255,255,0.07)", gradient:"linear-gradient(160deg,#0f172a 0%,#1e3a5f 100%)" },
  clean:    { bg:"#f8fafc", accent:"#2d6edb", text:"#0d1017", sub:"#4a5068",                surface:"#ffffff", border:"rgba(0,0,0,0.07)",         gradient:"linear-gradient(160deg,#f8fafc 0%,#e2e8f0 100%)" },
  midnight: { bg:"#080810", accent:"#818cf8", text:"#e2e8f0", sub:"rgba(226,232,240,0.5)",  surface:"#10101e", border:"rgba(255,255,255,0.06)",    gradient:"linear-gradient(160deg,#080810 0%,#0d0d22 100%)" },
  rose:     { bg:"#1a0d12", accent:"#f43f80", text:"#fce7ef", sub:"rgba(252,231,239,0.55)", surface:"#260d16", border:"rgba(255,255,255,0.07)",    gradient:"linear-gradient(160deg,#1a0d12 0%,#2d0f1e 100%)" },
  forest:   { bg:"#14532d", accent:"#4ade80", text:"#f0fdf4", sub:"rgba(240,253,244,0.6)",  surface:"#1a6635", border:"rgba(255,255,255,0.08)",    gradient:"linear-gradient(160deg,#14532d 0%,#166534 100%)" },
};

/* ══════════════════════════════════════════════════════════
   AUTH + ACCESS CONTROL
   nav.js owns auth — this file reads window.igUser only.
   No direct supabase.auth calls here.
══════════════════════════════════════════════════════════ */
function getCurrentUser() {
  return window.igUser || null;
}

/* ══════════════════════════════════════════════════════════
   DASHBOARD BANNER
   Reads window.igUser populated by nav.js from ig-supabase.
   No extra Supabase call — all data already loaded by nav.js.
══════════════════════════════════════════════════════════ */
function psBannerInit() {
  var banner    = document.getElementById('psUserBanner');
  var welcome   = document.getElementById('psWelcome');
  var badge     = document.getElementById('psPlanBadge');
  var trialInfo = document.getElementById('psTrialInfo');
  var upLink    = document.getElementById('psUpgradeLink');

  if (!banner) return;

  var plan    = _getPlan();           // 'free' | 'professional' | 'enterprise'
  var aiUses  = _getAIUses();         // number used this month
  var aiLimit = _getPlanCfg(plan).ai_uses;
  var user    = window.igUser || {};
  var name    = user.firstName || (user.name ? user.name.split(' ')[0] : '') || '';

  // Welcome greeting
  if (welcome) {
    welcome.textContent = name
      ? 'Welcome back, ' + name + ' \u{1F44B}'
      : 'Welcome back \u{1F44B}';
  }

  // Plan badge
  if (badge) {
    badge.textContent = (typeof igPlanLabel === 'function') ? igPlanLabel(plan) : plan.charAt(0).toUpperCase() + plan.slice(1);
    badge.className   = 'ps-plan-badge plan-' + plan;
  }

  // Trial / usage counter
  if (trialInfo) {
    if (plan === 'free') {
      var remaining = Math.max(0, aiLimit - aiUses);
      if (remaining === 0) {
        trialInfo.textContent = 'No AI uses left this month';
        trialInfo.className   = 'ps-trial-info warn';
      } else {
        trialInfo.textContent = remaining + ' of ' + aiLimit + ' free uses remaining this month';
        trialInfo.className   = 'ps-trial-info ' + (remaining <= 1 ? 'warn' : 'ok');
      }
    } else if (plan === 'professional') {
      var proRemaining = Math.max(0, aiLimit - aiUses);
      trialInfo.textContent = proRemaining + ' of ' + aiLimit + ' AI uses left this month';
      trialInfo.className   = 'ps-trial-info ' + (proRemaining < 10 ? 'warn' : 'ok');
    } else {
      // enterprise — unlimited
      trialInfo.textContent = 'Unlimited AI uses';
      trialInfo.className   = 'ps-trial-info ok';
    }
  }

  // Upgrade link — hide for enterprise
  if (upLink) {
    if (plan === 'enterprise' || plan === 'admin') {
      upLink.style.display = 'none';
    } else {
      var nextPKey  = plan === 'free' ? 'professional' : 'enterprise';
      var nextLabel = (typeof igPlanLabel === 'function') ? igPlanLabel(nextPKey) : (plan === 'free' ? 'Professional' : 'Enterprise');
      upLink.style.display = 'inline-flex';
      upLink.textContent   = 'Upgrade to ' + nextLabel + ' \u2192';
    }
  }

  banner.style.display = 'flex';
}

/* Delete free-user portfolios older than 7 days from DB, then re-render */
async function psMarkExpiredPortfolios() {
  var plan = _getPlan();
  if (plan !== 'free') return; // only free users have 7-day limit

  var SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  var now = Date.now();

  // Find expired portfolios in local state
  var expired = (psState.portfolios || []).filter(function(pf) {
    if (!pf.created_at) return false;
    return (now - new Date(pf.created_at).getTime()) > SEVEN_DAYS;
  });

  if (!expired.length) return;

  // Delete each through Render server (uses service role key — bypasses RLS)
  var userId = (window.igUser && window.igUser.id) || localStorage.getItem('ig_user_id');
  for (var i = 0; i < expired.length; i++) {
    var pf = expired[i];
    try {
      var r = await fetch('https://impactgrid-dijo.onrender.com/portfolio/delete', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: pf.id, session: userId })
      });
      var d = await r.json();
      if (d.success) {
        console.log('[Portfolio] Deleted expired portfolio:', pf.id);
      } else {
        console.warn('[Portfolio] Expired delete failed:', pf.id, d.error);
      }
    } catch(e) {
      console.warn('[Portfolio] Could not delete expired portfolio:', pf.id, e.message);
    }
  }

  // Reload dashboard to reflect deletions
  await loadPortfolios();
}

/* Gated create button — runs plan/auth check before opening onboard screen */
async function psHandleCreate() {
  var allowed = await checkPortfolioAccess();
  if (allowed) showScreen('screenOnboard');
}

/* ── checkPortfolioAccess ──────────────────────────────────
   Fixed: waits for BOTH ig-user-ready AND ig-plan-ready events
   (whichever fires first), extended timeout to 5s, and falls
   back to a direct getSession() check so a logged-in user is
   never incorrectly treated as a guest even on slow connections.
   showUpgradeBar now receives isLoggedIn flag so the Login
   button is hidden when the user is already authenticated.
─────────────────────────────────────────────────────────── */
async function checkPortfolioAccess() {
  // Wait up to 5s for nav.js to resolve igUser + plan from ig-supabase
  if (!window.igUser) {
    await new Promise(function(resolve) {
      var done = false;
      function finish() { if (!done) { done = true; resolve(); } }
      document.addEventListener('ig-user-ready', finish, { once: true });
      document.addEventListener('ig-plan-ready', finish, { once: true }); // fires earlier
      setTimeout(finish, 5000); // extended from 2s → 5s for slow connections
    });
  }

  // Determine login state — prefer igUser, fall back to direct session check
  var loggedIn = !!window.igUser;
  var plan     = _getPlan(); // reads igUser.plan first, then localStorage

  if (!loggedIn) {
    // Last resort: ask the auth Supabase client directly
    var client = (typeof getSupabase === 'function') ? getSupabase() : null;
    if (client) {
      try {
        var sess = await client.auth.getSession();
        loggedIn = !!(sess.data && sess.data.session);
        // plan was written to localStorage by nav.js already — _getPlan() picks it up
      } catch(e) {}
    }
  }

  // Not logged in at all
  if (!loggedIn) {
    showUpgradeBar('Sign in to create your website', false);
    return false;
  }

  // Admin / enterprise always allowed
  if (_isAdmin()) return true;

  // Issue #13 — Race condition fix: ensure psState.portfolios reflects the real
  // DB count before checking the slot limit. If loadPortfolios() hasn't resolved
  // yet (user tapped Create before the initial fetch finished), await it now.
  // This is a no-op on normal page loads where the fetch completes first.
  if (!psState.portfoliosLoaded && _portfoliosLoadPromise) {
    await _portfoliosLoadPromise;
  }

  // Check portfolio slot limit for this plan (reads from plan-config.js)
  var portfolioLimit = _getPlanCfg(plan).portfolios || 0;
  var existing       = (psState.portfolios || []).length;
  if (existing >= portfolioLimit) {
    var planLabel = (typeof igPlanLabel === 'function') ? igPlanLabel(plan) : plan;
    var nextPKey  = plan === 'free' ? 'professional' : 'enterprise';
    var nextLabel = (typeof igPlanLabel === 'function') ? igPlanLabel(nextPKey) : (plan === 'free' ? 'Professional' : 'Enterprise');
    var nextLimit = _getPlanCfg(nextPKey).portfolios;
    var msg = planLabel + ' plan includes up to ' + portfolioLimit + ' website' + (portfolioLimit !== 1 ? 's' : '')
            + ' — upgrade to ' + nextLabel + ' for ' + nextLimit;

    // Show full upgrade modal for hard blocks
    if (typeof window.showPlanGate === 'function') {
      window.showPlanGate({
        icon:     '📁',
        title:    'Website limit reached',
        subtitle: msg
      });
    } else {
      showUpgradeBar(msg, true);
    }
    return false;
  }

  // Check shared AI use limit
  var aiLimit = _getPlanCfg(plan).ai_uses;
  var aiUses  = _getAIUses();
  if (isFinite(aiLimit) && aiUses >= aiLimit) {
    var aiMsg = 'Monthly AI limit reached (' + aiLimit + ' uses) — upgrade for more';
    // Show full upgrade modal for hard blocks
    if (typeof window.showPlanGate === 'function') {
      window.showPlanGate({
        icon:     '⚡',
        title:    'Monthly AI limit reached',
        subtitle: aiMsg
      });
    } else {
      showUpgradeBar(aiMsg, true);
    }
    return false;
  }

  return true;
}

/* ══════════════════════════════════════════════════════════
   SCREEN NAVIGATION
══════════════════════════════════════════════════════════ */
function showScreen(id) {
  document.querySelectorAll(".ps-screen").forEach(s => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");

  // Scroll to top on mobile so user starts at the top of the new screen
  if (window.innerWidth <= 900) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Always clear the generation overlay when switching screens.
  // If we're NOT going to screenBuilder (or going to builder for edit, not generate),
  // the overlay must be hidden so it doesn't block the builder UI.
  if (id !== 'screenBuilder' || !psState.generating) {
    const overlay = document.getElementById('genOverlay');
    if (overlay) overlay.classList.add('hidden');
  }
}

/* ── Mobile builder panel ─────────────────────────────────────
   New layout: preview always visible (top 45%), editor is a
   bottom sheet. Expand button slides it up to 88% to give more
   editing room. No more toggling away the preview entirely.
───────────────────────────────────────────────────────────── */
function mobilePanelShow(panel) {
  // Legacy calls — now a no-op since both panels are always visible.
  // Keep the function to avoid JS errors from any remaining calls.
  if (panel === 'preview') updatePreviewLive();
}

var _mobExpanded = false;
function mobToggleExpand() {
  _mobExpanded = !_mobExpanded;
  const left = document.querySelector('.builder-left');
  const btn  = document.getElementById('mobExpandBtn');
  if (!left) return;
  left.classList.toggle('mob-expanded', _mobExpanded);
  if (btn) btn.textContent = _mobExpanded ? '⬇ Collapse' : '⬆ Expand';
  if (!_mobExpanded) updatePreviewLive();
}

function confirmBackToDash() {
  if (confirm("Go back? Unsaved changes will be lost.")) showScreen("screenDash");
}

/* ══════════════════════════════════════════════════════════
   SUPABASE HELPERS
══════════════════════════════════════════════════════════ */
async function sbFetch(path, method = "GET", body = null) {
  // The portfolios table is on the CONTENT project (exeiojgldxqaakkybdij).
  // That project has no auth users, so sending a JWT from the auth project
  // causes 401 "No suitable key" errors. We use the anon key only.
  // Row ownership is scoped by user_id or session_id in the query itself.
  const opts = {
    method,
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPABASE_KEY,          // content project anon key
      "Authorization": "Bearer " + SUPABASE_KEY, // anon — no JWT cross-project
      "x-session-id":  SESSION_ID,
      "Prefer":        method === "POST" ? "return=representation" : "",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(SUPABASE_URL + "/rest/v1" + path, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  return text ? JSON.parse(text) : null;
}

async function loadPortfolios() {
  // ── Show cached portfolios immediately (avoids empty-state flash on mobile) ──
  try {
    const cached = localStorage.getItem('ig_portfolios_cache');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length) {
        psState.portfolios = parsed;
        renderDashGrid();
      }
    }
  } catch (_) {}

  // Capture this call as the in-flight promise so checkPortfolioAccess()
  // can await it if it fires before the fetch resolves (race condition fix).
  _portfoliosLoadPromise = (async function() {
    try {
      const userId = window.igUser && window.igUser.id;
      const filter = userId
        ? `user_id=eq.${userId}`
        : `user_session=eq.${SESSION_ID}`;
      const data = await sbFetch(
        `/portfolios?${filter}&order=created_at.desc&select=*`
      );
      psState.portfolios = data || [];
      // Cache to localStorage for instant load next visit
      try { localStorage.setItem('ig_portfolios_cache', JSON.stringify(psState.portfolios)); } catch (_) {}
    } catch (e) {
      console.warn("[Portfolio] Could not load from Supabase:", e.message);
      // Keep cached data if live fetch fails (offline / server cold-start)
      if (!psState.portfolios.length) psState.portfolios = [];
    }
    psState.portfoliosLoaded = true;
    renderDashGrid();
  })();
  return _portfoliosLoadPromise;
}

/* ══════════════════════════════════════════════════════════
   CLOUDINARY IMAGE PIPELINE  v2 — Sequential Queue
   ─────────────────────────────────────────────────────────
   ROOT CAUSE OF CRASHES (fixed here):
     The old code used forEach+async and Promise.all which fired
     every image simultaneously. 5 photos = 5 canvas operations
     + 5 network requests at once → browser main-thread freeze,
     Render rate-limit errors, state corruption.

   New architecture:
     • ONE upload at a time (sequential, not parallel)
     • Canvas compression yielded via setTimeout(0) so the UI
       never freezes between frames
     • Upload queue: new files slot into the queue; each waits
       for the previous to complete before starting
     • Progress toast: "Uploading 2 of 5…" so user knows status
     • Safe fallback: if Cloudinary fails, base64 is kept in
       state — uploadPortfolioAssets retries on Save
     • uploadPortfolioAssets (called on Save) also processes
       sequentially with a 300ms gap between requests to avoid
       hitting Render's rate limit on cold-start servers

   URL transform strategy (Cloudinary CDN — no extra cost):
     thumb    → w_400,h_300,c_fill,g_auto,q_auto,f_auto
     preview  → w_1200,c_limit,q_auto:good,f_auto
     original → raw stored file (4K / full resolution)
══════════════════════════════════════════════════════════ */

/* ── Upload queue state ─────────────────────────────────── */
const _uploadQueue = [];        // { file, tempItem, resolve }
let   _uploadActive = false;    // true while a single upload is in progress
let   _uploadTotal  = 0;        // total queued in the current batch
let   _uploadDone   = 0;        // completed in the current batch

/* ── Yield to the browser between heavy operations ──────── */
function _yield() {
  return new Promise(r => setTimeout(r, 0));
}

/* ── Step 1: Client-side compression ───────────────────────
   Yields between decode and encode so the UI stays responsive.
   Lower default maxDim (2400px) — still excellent quality but
   ~40% faster canvas operation than 3840px on large photos.
   Logos keep 800px cap passed explicitly from the logo handlers.
──────────────────────────────────────────────────────────── */
async function compressImageLocally(dataUrl, maxDim = 2400, quality = 0.88) {
  const isImage = dataUrl.startsWith('data:image');
  const roughKB = Math.round((dataUrl.length * 0.75) / 1024);
  // Skip tiny files or non-images
  if (!isImage || roughKB < 200) return dataUrl;

  await _yield(); // let the browser breathe before heavy canvas work

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      await _yield(); // yield again after decode

      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Preserve PNG only when transparency is actually used
      const hasPng = dataUrl.startsWith('data:image/png');
      let outputType = 'image/jpeg';
      if (hasPng) {
        const d = ctx.getImageData(0, 0, Math.min(width, 100), Math.min(height, 100)).data;
        const hasAlpha = Array.from({ length: d.length / 4 }, (_, i) => d[i * 4 + 3]).some(a => a < 255);
        if (hasAlpha) outputType = 'image/png';
      }

      await _yield(); // yield before toDataURL (can be slow on large canvases)
      const compressed = canvas.toDataURL(outputType, outputType === 'image/jpeg' ? quality : undefined);
      const newKB = Math.round((compressed.length * 0.75) / 1024);
      console.log(`[Cloudinary] Compressed ${roughKB}KB → ${newKB}KB (${Math.round((1 - newKB / roughKB) * 100)}% saved)`);
      resolve(compressed);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/* ── Step 2: Single upload direct to Cloudinary (unsigned preset) ──
   Mirrors events-script.js — no Render server involved.
   Returns { original, thumb, preview } or null on failure.
──────────────────────────────────────────────────────────── */
async function uploadToCloudinary(dataUrl, folder = 'portfolio', tag = 'asset') {
  try {
    const userId     = (window.igUser && window.igUser.id) || localStorage.getItem('ig_user_id') || 'anon';
    const compressed = await compressImageLocally(dataUrl);

    // Convert base64 data URL → Blob for FormData
    const res0     = await fetch(compressed);
    const blob     = await res0.blob();

    const fd = new FormData();
    fd.append('file',          blob);
    fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    fd.append('folder',        `impactgrid/${folder}/${userId}`);
    fd.append('tags',          ['impactgrid', tag, userId].join(','));

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: 'POST', body: fd }
    );

    if (!res.ok) {
      console.warn('[Cloudinary] Upload failed:', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    if (data.error) { console.warn('[Cloudinary] Error:', data.error.message); return null; }

    const base = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload`;
    const pid  = data.public_id;

    console.log(`[Cloudinary] ✓ ${pid}`);
    return {
      original: data.secure_url,
      preview:  `${base}/w_1200,c_limit,q_auto:good,f_auto/${pid}`,
      thumb:    `${base}/w_400,h_300,c_fill,g_auto,q_auto,f_auto/${pid}`,
    };
  } catch (e) {
    console.warn('[Cloudinary] Exception:', e.message);
    return null;
  }
}

/* ── Step 3: Queue processor ────────────────────────────────
   Drains _uploadQueue one item at a time.
   Each item is { tempItem, folder, tag, onDone(urls) }.
   Shows "Uploading X of Y…" progress toast on every step.
──────────────────────────────────────────────────────────── */
async function _drainUploadQueue() {
  if (_uploadActive) return;           // already running
  if (!_uploadQueue.length) return;    // nothing to do

  _uploadActive = true;

  while (_uploadQueue.length) {
    const job = _uploadQueue.shift();
    _uploadDone++;

    const total = _uploadTotal;
    const done  = _uploadDone;
    showToast(`Uploading ${done} of ${total} image${total > 1 ? 's' : ''}…`);

    try {
      const urls = await uploadToCloudinary(job.dataUrl, job.folder, job.tag);
      job.onDone(urls);
    } catch (err) {
      console.warn('[Queue] Upload error:', err);
      job.onDone(null);
    }

    // Small gap between requests — prevents hammering Render on cold-start
    if (_uploadQueue.length) await new Promise(r => setTimeout(r, 300));
  }

  _uploadActive = false;
  _uploadTotal  = 0;
  _uploadDone   = 0;
}

/* ── Enqueue a single upload job ────────────────────────────
   Returns a Promise that resolves with { urls } when done.
──────────────────────────────────────────────────────────── */
function _enqueueUpload(dataUrl, folder, tag) {
  return new Promise(resolve => {
    _uploadTotal++;
    _uploadQueue.push({ dataUrl, folder, tag, onDone: resolve });
    _drainUploadQueue(); // kick the queue (no-op if already running)
  });
}

/* ── Step 4: Upload all base64 assets in a portfolio ────────
   Called by savePortfolioToDB when the user taps Save.
   Processes sequentially with 300ms gaps — never parallel.
   Any image that failed live upload (still base64) is caught here.
──────────────────────────────────────────────────────────── */
async function uploadPortfolioAssets(pf) {
  const isDataUrl = s => typeof s === 'string' && s.startsWith('data:');

  // Collect all items that still need uploading
  const jobs = [];

  if (Array.isArray(pf.hero_media)) {
    pf.hero_media.forEach((m, i) => {
      if (isDataUrl(m.url)) jobs.push({ type: 'hero_media', index: i });
    });
  }
  if (isDataUrl(pf.logo_url))  jobs.push({ type: 'logo' });
  if (isDataUrl(pf.profile_photo_url)) jobs.push({ type: 'profile_photo' });
  if (Array.isArray(pf.gallery_media)) {
    pf.gallery_media.forEach((m, i) => {
      if (isDataUrl(m.url)) jobs.push({ type: 'gallery_media', index: i });
    });
  }
  if (Array.isArray(pf.catalogue)) {
    pf.catalogue.forEach((c, i) => {
      if (isDataUrl(c.image)) jobs.push({ type: 'catalogue', index: i });
    });
  }
  if (Array.isArray(pf.services)) {
    pf.services.forEach((s, i) => {
      if (isDataUrl(s.image)) jobs.push({ type: 'service', index: i });
    });
  }

  if (!jobs.length) return pf;

  console.log(`[Cloudinary] Saving ${jobs.length} asset(s) sequentially…`);

  // Process ONE at a time
  for (let j = 0; j < jobs.length; j++) {
    const job = jobs[j];

    if (job.type === 'hero_media') {
      const urls = await uploadToCloudinary(pf.hero_media[job.index].url, 'hero', 'hero');
      if (urls) {
        pf.hero_media[job.index].url      = urls.preview;
        pf.hero_media[job.index].thumb    = urls.thumb;
        pf.hero_media[job.index].original = urls.original;
      }
    } else if (job.type === 'logo') {
      const urls = await uploadToCloudinary(pf.logo_url, 'logos', 'logo');
      if (urls) {
        pf.logo_url = urls.preview;
        if (window._obLogoDataUrl) window._obLogoDataUrl = urls.preview;
        if (window._beLogoDataUrl) window._beLogoDataUrl = urls.preview;
      }
    } else if (job.type === 'profile_photo') {
      const urls = await uploadToCloudinary(pf.profile_photo_url, 'profile', 'profile');
      if (urls) {
        pf.profile_photo_url = urls.preview;
        window._profilePhotoDataUrl = urls.preview;
      }
    } else if (job.type === 'gallery_media') {
      const urls = await uploadToCloudinary(pf.gallery_media[job.index].url, 'gallery', 'gallery');
      if (urls) {
        pf.gallery_media[job.index].url      = urls.preview;
        pf.gallery_media[job.index].thumb    = urls.thumb;
        pf.gallery_media[job.index].original = urls.original;
      }
    } else if (job.type === 'catalogue') {
      const urls = await uploadToCloudinary(pf.catalogue[job.index].image, 'catalogue', 'catalogue');
      if (urls) {
        pf.catalogue[job.index].image    = urls.preview;
        pf.catalogue[job.index].thumb    = urls.thumb;
        pf.catalogue[job.index].original = urls.original;
      }
    } else if (job.type === 'service') {
      const urls = await uploadToCloudinary(pf.services[job.index].image, 'services', 'service');
      if (urls) {
        pf.services[job.index].image    = urls.preview;
        pf.services[job.index].thumb    = urls.thumb;
        pf.services[job.index].original = urls.original;
      }
    }

    // 300ms gap between each upload — prevents rate-limit on Render free tier
    if (j < jobs.length - 1) await new Promise(r => setTimeout(r, 300));
  }

  console.log(`[Cloudinary] ${jobs.length} asset(s) saved`);
  return pf;
}

async function savePortfolioToDB(pf){

  // Wait up to 5s for nav.js to resolve igUser on slow mobile connections.
  // Without this, saving immediately after page-load shows "Sign in to save"
  // even for logged-in users because igUser hasn't been populated yet.
  if (!window.igUser) {
    await new Promise(function(resolve) {
      var done = false;
      function finish() { if (!done) { done = true; resolve(); } }
      document.addEventListener('ig-user-ready', finish, { once: true });
      document.addEventListener('ig-plan-ready', finish, { once: true });
      setTimeout(finish, 5000);
    });
  }

  // Require authenticated user — no anonymous saving
  const userId = (window.igUser && window.igUser.id)
    || localStorage.getItem('ig_user_id');

  if (!userId) {
    showUpgradeBar('Sign in to save your website', false);
    return false;
  }

  // ── Show loading state on Save button ──
  const saveBtn = document.querySelector('.bl-save-btn');
  const origLabel = saveBtn ? saveBtn.innerHTML : null;
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  try {
    // ── 1. Upload any base64 images to Supabase Storage first ──
    // This mutates `pf` in-place so URLs become real https:// links before saving
    const isDataUrl = s => typeof s === 'string' && s.startsWith('data:');
    const hasBase64 = (
      (Array.isArray(pf.hero_media) && pf.hero_media.some(m => isDataUrl(m.url))) ||
      isDataUrl(pf.logo_url) ||
      isDataUrl(pf.profile_photo_url) ||
      (Array.isArray(pf.gallery_media) && pf.gallery_media.some(m => isDataUrl(m.url))) ||
      (Array.isArray(pf.catalogue) && pf.catalogue.some(c => isDataUrl(c.image))) ||
      (Array.isArray(pf.services)  && pf.services.some(s => isDataUrl(s.image)))
    );
    if (hasBase64) {
      if (saveBtn) saveBtn.textContent = 'Uploading to Cloudinary…';
      await uploadPortfolioAssets(pf); // compress + upload to Cloudinary, replaces data: URLs
    }

    // ── 2. Deep clone and strip any remaining base64 (fallback safety) ──
    const pfClean = JSON.parse(JSON.stringify(pf));

    if (Array.isArray(pfClean.hero_media)) {
      pfClean.hero_media = pfClean.hero_media
        .map(m => ({ ...m, url: isDataUrl(m.url) ? '' : (m.url || '') }))
        .filter(m => m.url);
    }
    if (isDataUrl(pfClean.logo_url)) pfClean.logo_url = '';
    if (isDataUrl(pfClean.profile_photo_url)) pfClean.profile_photo_url = '';
    if (Array.isArray(pfClean.gallery_media)) {
      pfClean.gallery_media = pfClean.gallery_media
        .map(m => ({ ...m, url: isDataUrl(m.url) ? '' : (m.url || '') }))
        .filter(m => m.url);
    }
    if (Array.isArray(pfClean.catalogue)) {
      pfClean.catalogue = pfClean.catalogue.map(c => ({ ...c, image: isDataUrl(c.image) ? '' : (c.image || '') }));
    }
    if (Array.isArray(pfClean.services)) {
      pfClean.services = pfClean.services.map(s => ({ ...s, image: isDataUrl(s.image) ? '' : (s.image || '') }));
    }

    // ── 3. Send to Render server (with retry on cold-start 503/502) ──
    if (saveBtn) saveBtn.textContent = 'Saving…';
    let res, text, data;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        res  = await fetch("https://impactgrid-dijo.onrender.com/portfolio/save", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ session: userId, portfolio: pfClean })
        });
        text = await res.text();
        break; // success — exit retry loop
      } catch (fetchErr) {
        if (attempt === 2) throw fetchErr;
        if (saveBtn) saveBtn.textContent = 'Retrying…';
        await sleep(3000);
      }
    }

    // Guard against non-JSON responses (e.g. 413 HTML error page)
    try { data = JSON.parse(text); }
    catch(_) {
      console.error('[Save] Non-JSON response:', res.status, text.slice(0, 200));
      if (res.status === 413) {
        showToast('Website too large to save — remove local image uploads and try again');
      } else if (res.status === 502 || res.status === 503) {
        showToast('Server is waking up — please try saving again in 30 seconds');
      } else {
        showToast('Save failed (' + res.status + ')');
      }
      return false;
    }

    if (data.success) {
      // ── Patch logo_url + profile_photo_url directly to Supabase ──
      // The Render server may not write these columns; patch them directly
      // from the client so they always land on the live site.
      try {
        const imgPatch = {};
        if (pfClean.logo_url         && !pfClean.logo_url.startsWith('data:'))         imgPatch.logo_url         = pfClean.logo_url;
        if (pfClean.profile_photo_url && !pfClean.profile_photo_url.startsWith('data:')) imgPatch.profile_photo_url = pfClean.profile_photo_url;
        if (Object.keys(imgPatch).length && pfClean.slug) {
          const patchRes = await fetch(
            SUPABASE_URL + '/rest/v1/portfolios?slug=eq.' + encodeURIComponent(pfClean.slug),
            {
              method: 'PATCH',
              headers: {
                'Content-Type':  'application/json',
                'apikey':        SUPABASE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_KEY,
                'Prefer':        'return=minimal',
                'x-session-id':  SESSION_ID,
                'x-user-id':     userId,
              },
              body: JSON.stringify(imgPatch),
            }
          );
          if (patchRes.ok) {
            console.log('[Save] ✓ Image URLs patched to Supabase:', imgPatch);
          } else {
            const patchErr = await patchRes.text();
            console.warn('[Save] Image patch HTTP', patchRes.status, patchErr);
          }
        }
      } catch (patchErr) {
        console.warn('[Save] Image patch failed (non-critical):', patchErr.message);
      }
      showToast("Website saved ✓");
      // Refresh the preview pill URL in case slug changed
      const pill = document.getElementById("previewUrlPill");
      if (pill && pf.slug) pill.textContent = `impactgridgroup.com/p.html?slug=${pf.slug}`;
      // Bust the portfolio cache so the next loadPortfolios() fetches fresh data
      try { localStorage.removeItem('ig_portfolios_cache'); } catch (_) {}
      return true;
    } else {
      showToast("Save failed: " + (data.error || 'unknown error'));
      return false;
    }

  } catch(err) {
    console.error('[Save] Error:', err);
    showToast("Could not reach server — check your connection and try again");
    return false;
  } finally {
    // Always restore the save button
    if (saveBtn) {
      saveBtn.disabled = false;
      if (origLabel) saveBtn.innerHTML = origLabel;
      else saveBtn.textContent = 'Save';
    }
  }
}

/* Delete a portfolio — routes through Render server so service role
   key bypasses RLS. Scoped to the current user/session. */
async function deletePortfolio(id) {
  const pf = psState.portfolios.find(p => p.id === id);
  if (!pf) return;

  const label = pf.name ? `"${pf.name}"` : 'this website';
  const plan  = _getPlan();
  const isFreeUser = (plan === 'free') && !_isAdmin();

  const warningMsg = isFreeUser
    ? `Delete ${label}?\n\n⚠ Free plan warning: this action cannot be undone. Creating a new website uses AI credits — if you've used yours up, you won't be able to rebuild this website without upgrading.\n\nAre you sure you want to permanently delete it?`
    : `Delete ${label}? This can't be undone.`;

  if (!confirm(warningMsg)) return;

  const userId = (window.igUser && window.igUser.id)
    || localStorage.getItem('ig_user_id');

  try {
    const res  = await fetch('https://impactgrid-dijo.onrender.com/portfolio/delete', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, session: userId })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Website deleted');
      // Remove from local state immediately — no need to re-fetch
      psState.portfolios = psState.portfolios.filter(p => p.id !== id);
      // Bust the portfolio cache
      try { localStorage.removeItem('ig_portfolios_cache'); } catch (_) {}
      renderDashGrid();
    } else {
      showToast('Delete failed — please try again');
      console.error('[Portfolio] Delete failed:', data.error);
    }
  } catch (err) {
    showToast('Delete failed — server error');
    console.error('[Portfolio] Delete exception:', err.message);
  }
}

/* ══════════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════════ */
function renderDashGrid() {
  const grid  = document.getElementById("dashGrid");
  const empty = document.getElementById("dashEmpty");
  const count = document.getElementById("dashCount");
  if (!grid) return;

  count.textContent = psState.portfolios.length + " website" + (psState.portfolios.length !== 1 ? "s" : "");
  // Keep localStorage in sync so settings.html usage bar reads the real count without a DB call
  try { localStorage.setItem('ig_portfolio_count', String(psState.portfolios.length)); } catch(e) {}
  grid.querySelectorAll(".pf-card").forEach(c => c.remove());

  if (!psState.portfolios.length) {
    if (empty) empty.style.display = "";
    return;
  }
  if (empty) empty.style.display = "none";

  const plan = _getPlan();
  // Admin is never treated as free — check email and plan both
  const isFree = (plan === 'free') && !_isAdmin();

  psState.portfolios.forEach(pf => {
    const card  = document.createElement("div");
    card.className = "pf-card";
    // data-created used by psMarkExpiredPortfolios() to detect and delete rows older than 7 days for free users
    if (pf.created_at) card.setAttribute("data-created", pf.created_at);
    const thumb = pf.hero_media && pf.hero_media[0] ? pf.hero_media[0].url : "";

    // For free users, Edit and Preview show upgrade wall instead of opening
    const editAction    = isFree ? `showFreeEditWall()` : `openPortfolio('${pf.id}','edit')`;
    const previewAction = isFree ? `showFreePreviewWall()` : `openPortfolio('${pf.id}','preview')`;
    // Free users CAN publish (3 slots, deleted after 7 days) — no lock on Publish
    const publishBtn    = pf.published
      ? `<button class="pf-card-action primary" onclick="copyLink('${pf.slug}')">Copy Link</button>`
      : `<button class="pf-card-action primary" onclick="openPortfolio('${pf.id}','publish')">Publish</button>`;

    card.innerHTML = `
      <div class="pf-card-thumb">
        ${thumb ? `<img src="${thumb}" alt="${esc(pf.name)}"/>` : `<div class="pf-card-thumb-placeholder">✦</div>`}
        <div class="pf-card-pub-badge ${pf.published ? "live" : "draft"}">${pf.published ? "● LIVE" : "DRAFT"}</div>
        ${isFree ? '<div class="pf-card-free-ribbon">✦ Free — edit locked</div>' : ''}
      </div>
      <div class="pf-card-body">
        <div class="pf-card-name">${esc(pf.name)}</div>
        <div class="pf-card-niche">${esc(pf.niche)}</div>
        ${isFree ? '<div class="pf-card-free-note">Free plan · editing requires upgrade</div>' : ''}
      </div>
      <div class="pf-card-foot">
        <button class="pf-card-action${isFree ? ' locked' : ''}" onclick="${editAction}" ${isFree ? 'title="Upgrade to edit this portfolio"' : ''}>Edit</button>
        <button class="pf-card-action${isFree ? ' locked' : ''}" onclick="${previewAction}" ${isFree ? 'title="Upgrade to preview this portfolio"' : ''}>Preview</button>
        ${publishBtn}
        <button class="pf-card-action danger" onclick="deletePortfolio('${pf.id}')">Delete</button>
      </div>`;
    grid.appendChild(card);
  });

  // Mark expired portfolios for free-plan users (7-day limit)
  psMarkExpiredPortfolios();
}


/* ══════════════════════════════════════════════════════════
   CATALOGUE — Stripe Payment Links
   Creators add bookable items with prices.
   Each item gets a real Stripe Payment Link generated
   via the Render server. ImpactGrid takes 5% per booking.
══════════════════════════════════════════════════════════ */

/* Render one editable catalogue item row — with image upload */
function addCatalogueItem(item) {
  const list = document.getElementById("catItemsList");
  if (!list) return;

  const uid  = "cimg_" + Math.random().toString(36).slice(2);
  const imgSrc = item?.image || "";

  const row = document.createElement("div");
  row.className = "cat-item-row";
  row.innerHTML = `
    <div class="cat-item-img-wrap" onclick="document.getElementById('${uid}').click()" title="Upload image">
      ${imgSrc
        ? `<img src="${imgSrc}" class="cat-item-img" alt=""/>`
        : `<div class="cat-item-img-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>Image</span></div>`
      }
      <input type="file" id="${uid}" accept="image/*" style="display:none" onchange="catItemImageUpload(this)"/>
    </div>
    <div class="cat-item-fields">
      <input class="ob-input cat-input" placeholder="Service name (e.g. Sponsored Post)" value="${esc(item?.title || '')}" data-field="title"/>
      <input class="ob-input cat-input" placeholder="Short description" value="${esc(item?.description || '')}" data-field="description"/>
      <div class="cat-price-row">
        <span class="cat-currency">£</span>
        <input class="ob-input cat-input cat-price" placeholder="Price" type="number" min="1" value="${item?.price || ''}" data-field="price"/>
      </div>
      ${item?.payment_link
        ? `<div class="cat-link-generated">
             <div class="cat-link-status done">✓ Payment link ready</div>
             <a href="${item.payment_link}" target="_blank" class="cat-link-preview">View link →</a>
           </div>`
        : `<button class="cat-gen-btn" onclick="generatePaymentLink(this)">⚡ Generate Payment Link</button>`
      }
    </div>
    <button class="ob-row-del cat-del-btn" onclick="this.closest('.cat-item-row').remove();updatePreviewLive()">✕</button>
  `;
  list.appendChild(row);
}

/* Handle image upload for catalogue item */
function catItemImageUpload(input) {
  const row = input.closest(".cat-item-row");
  if (!row || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    const wrap = row.querySelector(".cat-item-img-wrap");
    if (!wrap) return;
    // Replace placeholder with image (preview only — base64 won't be saved)
    wrap.querySelector(".cat-item-img-placeholder")?.remove();
    let img = wrap.querySelector(".cat-item-img");
    if (!img) { img = document.createElement("img"); img.className = "cat-item-img"; wrap.insertBefore(img, wrap.querySelector("input")); }
    img.src = e.target.result;
    // Store on row for local preview — stripped before server save to avoid 413
    row.dataset.image = e.target.result;
    // Show a note that image is local-only until an image URL is used
    let note = row.querySelector('.cat-img-note');
    if (!note) {
      note = document.createElement('div');
      note.className = 'cat-img-note';
      note.style.cssText = 'font-size:10px;color:rgba(255,180,0,.8);margin-top:4px;font-family:monospace';
      note.textContent = '⚠ Preview only — paste an image URL to save permanently';
      row.querySelector('.cat-item-fields')?.prepend(note);
    }
    updatePreviewLive();
  };
  reader.readAsDataURL(input.files[0]);
}

/* Collect all catalogue items from the UI */
function collectCatalogueItems() {
  const items = [];
  document.querySelectorAll(".cat-item-row").forEach(row => {
    const title       = row.querySelector('[data-field="title"]')?.value?.trim() || "";
    const description = row.querySelector('[data-field="description"]')?.value?.trim() || "";
    const price       = row.querySelector('[data-field="price"]')?.value?.trim() || "";
    const linkEl      = row.querySelector(".cat-link-preview");
    const payment_link = linkEl ? linkEl.href : (row.dataset.paymentLink || "");
    const image       = row.dataset.image || row.querySelector(".cat-item-img")?.src || "";
    if (title) items.push({ title, description, price, payment_link, image });
  });
  return items;
}

/* Generate a Stripe Payment Link for one catalogue item */
async function generatePaymentLink(btn) {
  const row         = btn.closest(".cat-item-row");
  const title       = row.querySelector('[data-field="title"]')?.value?.trim();
  const description = row.querySelector('[data-field="description"]')?.value?.trim();
  const priceInput  = row.querySelector('[data-field="price"]')?.value?.trim();

  if (!title)       { showToast("Add a service name first"); return; }
  if (!priceInput)  { showToast("Add a price first"); return; }

  const priceInPence = Math.round(parseFloat(priceInput) * 100);
  if (isNaN(priceInPence) || priceInPence < 100) {
    showToast("Price must be at least £1.00");
    return;
  }

  btn.disabled    = true;
  btn.textContent = "Generating…";

  try {
    const pf = psState.activePortfolio || {};
    const connected_account_id = pf.stripe_account_id || null;

    const res  = await fetch(DIJO_SERVER + "/stripe/create-payment-link", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        price:    priceInPence,
        currency: "gbp",
        creator_name: pf.name || "",
        connected_account_id,
      })
    });

    const data = await res.json();

    if (!data.success) throw new Error(data.error || "Unknown error");

    // Update the row UI
    btn.replaceWith(Object.assign(document.createElement("div"), {
      className: "cat-link-generated",
      innerHTML: `<div class="cat-link-status done">✓ Payment link ready</div>
                  <a href="${data.payment_link}" target="_blank" class="cat-link-preview">View link →</a>
                  <div class="cat-link-breakdown">You get: £${((priceInPence - data.fee)/100).toFixed(2)} · ImpactGrid: £${(data.fee/100).toFixed(2)}</div>`
    }));

    // Store link on row for collection
    row.dataset.paymentLink = data.payment_link;

    showToast("✓ Payment link created!");

    // Auto-save the catalogue to the portfolio
    if (psState.activePortfolio) {
      psState.activePortfolio.catalogue = collectCatalogueItems();
    }

  } catch (err) {
    btn.disabled    = false;
    btn.textContent = "⚡ Generate Payment Link";
    showToast("Could not create link — check server");
    console.error("[Catalogue] Payment link error:", err.message);
  }
}

/* Rebuild catalogue rows from saved portfolio data */
function rebuildCatalogueRows(items) {
  const list = document.getElementById("catItemsList");
  if (!list) return;
  list.innerHTML = "";
  (items || []).forEach(item => addCatalogueItem(item));
}

/* Stripe Connect — send creator to onboarding */
var _stripeOnboardInFlight = false;
async function stripeOnboard() {
  // Prevent multiple simultaneous calls (causes the 500 spam in console)
  if (_stripeOnboardInFlight) return;

  const pf    = psState.activePortfolio;
  const email = (window.igUser && window.igUser.email) || "";

  if (!email) { showToast("Sign in first to connect your bank"); return; }

  const btn = document.getElementById("catConnectBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Opening Stripe…"; }

  _stripeOnboardInFlight = true;

  try {
    const res  = await fetch(DIJO_SERVER + "/stripe/onboard", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        return_url:  window.location.href.split("?")[0] + "?stripe_connected=1",
        refresh_url: window.location.href.split("?")[0],
      })
    });

    // Handle non-JSON / 500 responses gracefully
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch(_) {
      throw new Error("Server error (" + res.status + ") — Stripe connect is being set up, try again shortly");
    }

    if (!data.success) throw new Error(data.error || "Stripe returned an error");

    // Store account ID so payment links use destination charges
    if (pf) pf.stripe_account_id = data.account_id;

    // Redirect to Stripe's hosted onboarding page
    window.location.href = data.onboard_url;

  } catch (err) {
    _stripeOnboardInFlight = false;
    if (btn) { btn.disabled = false; btn.textContent = "Connect Bank Account →"; }
    showToast(err.message || "Could not open Stripe — try again later");
    console.error("[Stripe Onboard] Error:", err.message);
  }
}

/* Check URL param on return from Stripe onboarding */
function checkStripeReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("stripe_connected") === "1") {
    const badge = document.getElementById("catConnectBadge");
    const btn   = document.getElementById("catConnectBtn");
    if (badge) { badge.textContent = "✓ Bank connected"; badge.className = "cat-connect-badge connected"; }
    if (btn)   { btn.textContent = "✓ Connected — change account"; }
    showToast("✓ Bank account connected! Payment links will pay you directly.");
    // Clean URL
    window.history.replaceState({}, "", window.location.pathname);
  }
}

/* ── Free-plan upgrade walls for Edit / Preview ───────────────────────── */
/* Note: Free users CAN publish (3 slots, deleted after 7 days).           */
/* Only editing and previewing the builder UI requires a paid plan.        */
function showFreeEditWall() {
  if (typeof window.showUpgradeBar_gate === 'function') {
    window.showUpgradeBar_gate('Editing websites requires a paid plan — upgrade to unlock the builder.', true, { persistent: false });
  }
}

function showFreePreviewWall() {
  if (typeof window.showUpgradeBar_gate === 'function') {
    window.showUpgradeBar_gate('Live preview requires a paid plan — upgrade to see your website in action.', true, { persistent: false });
  }
}


function openPortfolio(id, action) {
  const pf = psState.portfolios.find(p => p.id === id);
  if (!pf) return;

  // Issue #6 — Published portfolios are locked from editing.
  // A published portfolio is live and public; silent edits would change
  // the live page without the user re-publishing. Force them to unpublish first.
  // Admin is exempt — they can always edit regardless of publish state.
  if (action === 'edit' && pf.published && !_isAdmin()) {
    showToast('This website is live — unpublish it first to make changes.');
    // Still show the builder in read-only preview so they can see it,
    // but disable the Save/Publish buttons.
    psState.activePortfolio = JSON.parse(JSON.stringify(pf));
    psState.generating = false;
    const _ovR = document.getElementById('genOverlay');
    if (_ovR) _ovR.classList.add('hidden');
    ['gs1','gs2','gs3','gs4','gs5'].forEach(function(id) {
      var s = document.getElementById(id);
      if (s) { s.classList.remove('active','done'); }
    });
    populateBuilder(pf);
    showScreen('screenBuilder');
    // Disable save/publish controls
    var saveBtn    = document.querySelector('.bl-save-btn');
    var publishBtn = document.getElementById('blPublishBtn');
    if (saveBtn)    { saveBtn.disabled = true;    saveBtn.title    = 'Unpublish to edit'; }
    if (publishBtn) { publishBtn.disabled = true; publishBtn.title = 'Already published'; }
    // Show a persistent banner in the builder
    var footer = document.querySelector('.bl-footer');
    if (footer && !document.getElementById('blLockedNotice')) {
      var notice = document.createElement('div');
      notice.id = 'blLockedNotice';
      notice.style.cssText = 'width:100%;text-align:center;font-size:11px;color:var(--gold);font-family:var(--fm);padding:6px 0 0;letter-spacing:.3px;';
      notice.textContent = '✦ Website is live — unpublish to edit';
      footer.appendChild(notice);
    }
    mobilePanelShow('preview');
    return;
  }

  // Re-enable controls if they were previously locked (user navigated back from a published portfolio)
  var saveBtn    = document.querySelector('.bl-save-btn');
  var publishBtn = document.getElementById('blPublishBtn');
  if (saveBtn)    { saveBtn.disabled = false;    saveBtn.title    = ''; }
  if (publishBtn) { publishBtn.disabled = false; publishBtn.title = ''; }
  var notice = document.getElementById('blLockedNotice');
  if (notice) notice.remove();

  psState.activePortfolio = JSON.parse(JSON.stringify(pf));
  // Always clear any leftover generation overlay when opening an existing portfolio
  psState.generating = false;
  const _ov = document.getElementById('genOverlay');
  if (_ov) _ov.classList.add('hidden');
  // Reset generation step indicators so they don't show stale state
  ['gs1','gs2','gs3','gs4','gs5'].forEach(function(id) {
    var s = document.getElementById(id);
    if (s) { s.classList.remove('active','done'); }
  });
  populateBuilder(pf);
  showScreen('screenBuilder');

  // On mobile: 'preview' action shows the preview panel; 'edit' shows the editor
  if (action === 'preview') {
    mobilePanelShow('preview');
  } else {
    mobilePanelShow('edit');
  }

  if (action === 'publish') publishPortfolio();
}

function copyLink(slug) {
  navigator.clipboard.writeText(`https://impactgridgroup.com/p.html?slug=${slug}`).catch(() => {});
  showToast("✓ Link copied!");
}

/* Copy the URL shown in the builder preview pill */
function copyPreviewUrl() {
  const pill = document.getElementById("previewUrlPill");
  if (!pill) return;
  const text = pill.textContent.trim();
  if (!text || text.includes("—")) { showToast("No URL yet — save your website first"); return; }
  const url = text.startsWith("http") ? text : "https://" + text;
  navigator.clipboard.writeText(url).then(() => {
    showToast("✓ Link copied!");
    pill.classList.add("copied");
    setTimeout(() => pill.classList.remove("copied"), 1200);
  }).catch(() => {
    // Fallback for browsers that block clipboard without gesture
    const ta = document.createElement("textarea");
    ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast("✓ Link copied!");
  });
}

/* ══════════════════════════════════════════════════════════
   ONBOARDING STEPS
══════════════════════════════════════════════════════════ */
function obValidate() {
  const name  = (document.getElementById("obName")  || {}).value || "";
  const niche = (document.getElementById("obNiche") || {}).value || "";
  const email = (document.getElementById("obEmail") || {}).value || "";
  const btn   = document.getElementById("obNextBtn");
  const emailErr = document.getElementById("obEmailError");

  // Basic email format check
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  // Show/hide inline error — only show after they've typed something
  if (emailErr) {
    emailErr.style.display = (email.trim().length > 0 && !emailOk) ? "" : "none";
  }

  if (btn && psState.currentStep === 1) {
    btn.disabled = !(name.trim() && niche.trim() && emailOk);
  }
}

function obNext() {
  if (psState.currentStep >= 4) { startGeneration(); return; }
  goToStep(psState.currentStep + 1);
}

function obBack() {
  if (psState.currentStep <= 1) return;
  goToStep(psState.currentStep - 1);
}

function goToStep(n) {
  psState.currentStep = n;
  document.querySelectorAll(".ob-step-content").forEach((el, i) => el.classList.toggle("active", i + 1 === n));
  document.querySelectorAll(".ob-step").forEach((el, i) => {
    el.classList.remove("active", "done");
    if (i + 1 < n)  el.classList.add("done");
    if (i + 1 === n) el.classList.add("active");
  });
  document.querySelectorAll(".ob-step-line").forEach((el, i) => el.classList.toggle("done", i + 1 < n));
  const back = document.getElementById("obBackBtn");
  if (back) back.style.display = n > 1 ? "" : "none";
  const next = document.getElementById("obNextBtn");
  if (next) { next.textContent = n === 4 ? "✦ Build My Website" : "Continue →"; next.disabled = false; }
  const titles = ["Tell Dijo about yourself","Connect your platforms","Add your services & work","Choose your style"];
  const subs   = ["The more detail you give, the better Dijo builds.","Connect the platforms you're active on.","What do you offer? Add at least one service.","Pick a visual style and let Dijo do the rest."];
  const te = document.getElementById("obTitle"); if (te) te.textContent = titles[n-1] || "";
  const se = document.getElementById("obSub");   if (se) se.textContent = subs[n-1]   || "";
  if (n === 1) obValidate();
}

/* ── Row builders ── */
function addServiceRow(container) {
  const list = document.getElementById(container || "obServicesList");
  if (!list) return;
  const idx = list.children.length;
  const row = document.createElement("div");
  row.className = "ob-service-row";
  row.innerHTML = `
    <div class="ob-row-header">
      <span class="ob-row-title">Service ${idx + 1}</span>
      <button class="ob-row-del" onclick="this.closest('.ob-service-row').remove()">✕</button>
    </div>
    <input class="ob-input sm" placeholder="Service title (e.g. Sponsored YouTube Video)"/>
    <input class="ob-input sm" placeholder="Brief description" style="margin-top:6px"/>
    <div class="ob-two-inline" style="margin-top:6px">
      <input class="ob-input sm" placeholder="Price (e.g. £800)"/>
      <input class="ob-input sm" placeholder="Icon emoji (e.g. 🎬)"/>
    </div>`;
  list.appendChild(row);
}

function addProjectRow() {
  const list = document.getElementById("obProjectsList");
  if (!list) return;
  const idx = list.children.length;
  const row = document.createElement("div");
  row.className = "ob-project-row";
  row.innerHTML = `
    <div class="ob-row-header">
      <span class="ob-row-title">Project / Collab ${idx + 1}</span>
      <button class="ob-row-del" onclick="this.closest('.ob-project-row').remove()">✕</button>
    </div>
    <input class="ob-input sm" placeholder="Brand / project name"/>
    <input class="ob-input sm" placeholder="What you did" style="margin-top:6px"/>
    <input class="ob-input sm" placeholder="Project URL (optional)" style="margin-top:6px"/>`;
  list.appendChild(row);
}

function addTestimonialRow() {
  const list = document.getElementById("obTestimonialsList");
  if (!list) return;
  const row = document.createElement("div");
  row.className = "ob-testimonial-row";
  row.innerHTML = `
    <div class="ob-row-header">
      <span class="ob-row-title">Testimonial ${list.children.length + 1}</span>
      <button class="ob-row-del" onclick="this.closest('.ob-testimonial-row').remove()">✕</button>
    </div>
    <input class="ob-input sm" placeholder="Name & role (e.g. Jane Smith, Marketing Director at Gymshark)"/>
    <textarea class="ob-input sm" placeholder="What they said…" style="margin-top:6px;min-height:64px;resize:vertical"></textarea>`;
  list.appendChild(row);
}

/* ── Theme selection ── */
function selectTheme(el, themeId) {
  document.querySelectorAll("#obContent4 .ob-theme-opt").forEach(o => o.classList.remove("active"));
  el.classList.add("active");
  psState.selectedTheme = themeId;
}

function selectEditTheme(el, themeId) {
  document.querySelectorAll("#tabDesign .ob-theme-opt").forEach(o => o.classList.remove("active"));
  el.classList.add("active");
  if (psState.activePortfolio) psState.activePortfolio.theme = themeId;
  updatePreviewLive();
}

/* ══════════════════════════════════════════════════════════
   COLLECT ONBOARDING DATA
══════════════════════════════════════════════════════════ */
function collectOnboardData() {
  const g = id => (document.getElementById(id) || {}).value || "";

  const services = [];
  document.querySelectorAll(".ob-service-row").forEach(row => {
    const inputs = row.querySelectorAll("input");
    if (inputs[0]?.value?.trim()) {
      services.push({ title: inputs[0].value, description: inputs[1]?.value || "", price: inputs[2]?.value || "", icon: inputs[3]?.value || "✦" });
    }
  });

  const projects = [];
  document.querySelectorAll(".ob-project-row").forEach(row => {
    const inputs = row.querySelectorAll("input");
    if (inputs[0]?.value?.trim()) {
      projects.push({ title: inputs[0].value, description: inputs[1]?.value || "", url: inputs[2]?.value || "" });
    }
  });

  const testimonials = [];
  document.querySelectorAll(".ob-testimonial-row").forEach(row => {
    const inp = row.querySelector("input");
    const ta  = row.querySelector("textarea");
    if (inp?.value?.trim()) testimonials.push({ author: inp.value, quote: ta?.value || "" });
  });

  return {
    user_session:    SESSION_ID,
    name:            g("obName"),
    niche:           g("obNiche"),
    bio:             g("obAbout"),
    location:        g("obLocation"),
    email:           g("obEmail"),
    youtube_url:     g("obYTUrl"),
    tiktok_url:      g("obTTUrl"),
    instagram_url:   g("obIGUrl"),
    linkedin_url:    g("obLIUrl"),
    twitter_url:     g("obTWUrl"),
    total_followers: g("obTotalFollowers"),
    engagement_rate: g("obEngagement"),
    monthly_views:   g("obMonthlyViews"),
    theme:           psState.selectedTheme,
    accent_color:    g("obAccentColor") || "#c97e08",
    services,
    projects,
    testimonials,
    hero_media:      [],
    gallery_media:   (psState.activePortfolio && psState.activePortfolio.gallery_media) || [],
    published:       false,
    profile_photo_url: (window._profilePhotoDataUrl || (psState.activePortfolio && psState.activePortfolio.profile_photo_url) || ''),
    logo_url:        (window._beLogoDataUrl || window._obLogoDataUrl || (psState.activePortfolio && psState.activePortfolio.logo_url) || ''),
    // Reuse existing slug if portfolio already exists — never regenerate
    // a new random slug or the upsert will create a duplicate row instead
    // of updating the existing one.
    slug:            (psState.activePortfolio && psState.activePortfolio.slug)
                       || generateSlug(g("obName")),
  };
}

function generateSlug(name) {
  return (name || "creator").toLowerCase().replace(/[^a-z0-9]/g, "") + Math.floor(Math.random() * 900 + 100);
}

/* ══════════════════════════════════════════════════════════
   AI GENERATION — via Render server
   Matches carousel-studio.js callAI pattern exactly
══════════════════════════════════════════════════════════ */
async function startGeneration() {
  if (!(await checkPortfolioAccess())) return;
  const pf = collectOnboardData();
  psState.activePortfolio = pf;
  psState.generating = true;

  showScreen("screenBuilder");
  const overlay = document.getElementById("genOverlay");
  if (overlay) overlay.classList.remove("hidden");

  /* ── Generation step indicators ── */
  const steps   = ["gs1","gs2","gs3","gs4","gs5"];
  let stepIdx   = 0;
  function advanceStep() {
    if (stepIdx > 0) {
      const prev = document.getElementById(steps[stepIdx - 1]);
      if (prev) { prev.classList.remove("active"); prev.classList.add("done"); }
    }
    const cur = document.getElementById(steps[stepIdx]);
    if (cur) cur.classList.add("active");
    stepIdx++;
  }

  advanceStep(); // Step 1: Analysing niche

  // Show wake-up message if Render free tier is cold-starting (takes up to 60s)
  const wakeTimer = setTimeout(() => {
    const sub = document.getElementById('genSubtext');
    if (sub) sub.textContent = 'Server is waking up — this can take up to 60 seconds on first load…';
  }, 10000);

  try {
    /* ── Single server call — Render handles all AI ── */
    const result = await callDijoServer("/portfolio/generate", pf);
    clearTimeout(wakeTimer);

    advanceStep(); // Step 2: copy done
    advanceStep(); // Step 3: visuals done

    /* Merge AI results into portfolio object */
    pf.ai_headline    = result.ai_headline    || pf.name;
    pf.ai_tagline     = result.ai_tagline     || pf.niche;
    pf.ai_bio         = result.ai_bio         || pf.bio;
    pf.ai_meta        = result.ai_meta        || "";
    pf.ai_cta         = result.ai_cta         || "Work With Me";
    pf.ai_terms       = result.ai_terms       || "";
    pf.ai_privacy     = result.ai_privacy     || "";
    pf.hero_media     = result.hero_media     || [];
    pf.section_assets = result.section_assets || {};
    pf.seo            = result.seo            || null;
    pf.trending_tags  = result.trending_tags  || [];
    pf.services       = result.services       || pf.services; // enhanced by AI

    advanceStep(); // Step 4: legal done

    /* Save to Supabase */
    await savePortfolioToDB(pf);
    if (!_isAdmin()) {
      await incrementAIUse();
    }
    psState.portfolios.unshift(pf);

    advanceStep(); // Step 5: building preview

    /* Populate builder + render preview */
    populateBuilder(pf);
    renderPreview(pf);

    await sleep(600);
    if (overlay) overlay.classList.add("hidden");
    psState.generating = false;
    showToast("✦ Website built by Dijo!");

  } catch (err) {
    clearTimeout(wakeTimer);
    console.error("[Portfolio] Generation error:", err.message);

    /* Server warm-up fallback — same pattern as carousel-studio.js */
    showToast("⚡ Generated offline — server warming up");
    if (overlay) overlay.classList.add("hidden");
    psState.generating = false;
    populateBuilder(pf);
    renderPreview(pf);
  }
}

/* ── Core server caller — mirrors carousel-studio.js callAI ── */
async function callDijoServer(endpoint, body) {
  // Strip base64 data URLs and heavy fields before sending to avoid 413
  let payload = body;
  if (endpoint === "/portfolio/generate" && body) {
    const isDataUrl = s => typeof s === "string" && s.startsWith("data:");
    payload = JSON.parse(JSON.stringify(body)); // deep clone
    // Strip base64 hero_media
    if (Array.isArray(payload.hero_media)) {
      payload.hero_media = payload.hero_media
        .map(m => ({ ...m, url: isDataUrl(m.url) ? "" : (m.url || "") }))
        .filter(m => m.url);
    }
    // Strip base64 logo
    if (isDataUrl(payload.logo_url)) payload.logo_url = "";
    // Strip base64 service/catalogue images
    if (Array.isArray(payload.services)) {
      payload.services = payload.services.map(s => ({ ...s, image: isDataUrl(s.image) ? "" : (s.image || "") }));
    }


    delete payload.seo;
    delete payload.trending_tags;
  }
  const res = await fetch(DIJO_SERVER + endpoint, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Server responded " + res.status);
  return await res.json();
}

/* ── Regenerate a single section ── */
async function regenSection(section) {
  const pf = psState.activePortfolio;
  if (!pf) return;

  // Map front-end section names to server section names
  const serverSection = (section === 'terms' || section === 'privacy') ? 'legal' : section;
  const btnMap = { terms: 'eLegalTerms', privacy: 'eLegalPrivacy', headline: 'ePortHeadline', tagline: 'ePortTagline', bio: 'ePortBio' };

  // Show loading state on the relevant button
  const btnEl = document.querySelector(`[onclick="regenSection('${section}')"]`);
  const origText = btnEl ? btnEl.textContent : '';
  if (btnEl) { btnEl.textContent = '✦ Generating…'; btnEl.disabled = true; }

  showToast("✦ Dijo is rewriting…");
  try {
    const result = await callDijoServer("/portfolio/regen", { section: serverSection, portfolio: pf });

    if (section === "headline") {
      pf.ai_headline = result.ai_headline; setValue("ePortHeadline", result.ai_headline);
    }
    if (section === "tagline") {
      pf.ai_tagline = result.ai_tagline; setValue("ePortTagline", result.ai_tagline);
    }
    if (section === "bio") {
      pf.ai_bio = result.ai_bio; setValue("ePortBio", result.ai_bio);
    }
    if (serverSection === "copy") {
      pf.ai_headline = result.ai_headline; setValue("ePortHeadline", result.ai_headline);
      pf.ai_tagline  = result.ai_tagline;  setValue("ePortTagline",  result.ai_tagline);
      pf.ai_bio      = result.ai_bio;      setValue("ePortBio",      result.ai_bio);
    }
    if (section === "media") {
      pf.hero_media = result.hero_media;
      renderHeroMediaStrip(result.hero_media);
    }
    if (section === "terms" || serverSection === "legal") {
      if (result.ai_terms) {
        pf.ai_terms = result.ai_terms;
        setValue("eLegalTerms", result.ai_terms);
      }
      if (section !== "terms" || result.ai_privacy) {
        pf.ai_privacy = result.ai_privacy;
        setValue("eLegalPrivacy", result.ai_privacy);
      }
    }
    if (section === "privacy") {
      if (result.ai_privacy) {
        pf.ai_privacy = result.ai_privacy;
        setValue("eLegalPrivacy", result.ai_privacy);
      } else if (result.ai_terms) {
        // Server returns both under legal — take the privacy part
        pf.ai_privacy = result.ai_terms;
        setValue("eLegalPrivacy", result.ai_terms);
      }
    }
    if (section === "services") {
      pf.services = result.services;
      rebuildServiceRows(result.services);
    }

    updatePreviewLive();
    showToast("✦ Done!");
  } catch (e) {
    showToast("Could not reach Dijo server");
    console.error("[Portfolio] Regen error:", e.message);
  } finally {
    if (btnEl) { btnEl.textContent = origText; btnEl.disabled = false; }
  }
}

/* ══════════════════════════════════════════════════════════
   BUILDER — POPULATE & LIVE EDIT
══════════════════════════════════════════════════════════ */
function populateBuilder(pf) {
  setValue("ePortHeadline", pf.ai_headline || pf.name);
  setValue("ePortTagline",  pf.ai_tagline  || pf.niche);
  setValue("ePortBio",      pf.ai_bio      || pf.bio);
  setValue("eSocYT",        pf.youtube_url     || "");
  setValue("eSocTT",        pf.tiktok_url      || "");
  setValue("eSocIG",        pf.instagram_url   || "");
  setValue("eSocLI",        pf.linkedin_url    || "");
  setValue("eSocTW",        pf.twitter_url     || "");
  setValue("eSocFollowers", pf.total_followers || "");
  setValue("eSocEngagement",pf.engagement_rate || "");
  setValue("eSocViews",     pf.monthly_views   || "");
  setValue("eLegalTerms",   pf.ai_terms    || "");
  setValue("eLegalPrivacy", pf.ai_privacy  || "");
  if (pf.accent_color) {
    setValue("eAccentColor", pf.accent_color);
    const cv = document.getElementById("eColorVal");
    if (cv) cv.textContent = pf.accent_color;
  }
  const pill = document.getElementById("previewUrlPill");
  if (pill) pill.textContent = `impactgridgroup.com/p.html?slug=${pf.slug}`;
  renderHeroMediaStrip(pf.hero_media || []);
  renderGalleryMediaStrip(pf.gallery_media || []);
  // Show profile photo preview
  if (pf.profile_photo_url) {
    window._profilePhotoDataUrl = pf.profile_photo_url;
    const ppPrev = document.getElementById('profilePhotoPrev');
    if (ppPrev) { ppPrev.src = pf.profile_photo_url; ppPrev.style.display = 'block'; }
    const ppPlaceholder = document.getElementById('profilePhotoPlaceholder');
    if (ppPlaceholder) ppPlaceholder.style.display = 'none';
  }
  // Restore logo preview + global so save/collectOnboardData picks it up
  if (pf.logo_url) {
    window._beLogoDataUrl = pf.logo_url;
    const bePrev = document.getElementById('beLogoPreview');
    if (bePrev) { bePrev.src = pf.logo_url; bePrev.style.display = 'block'; bePrev.style.opacity = '1'; }
    const bePlaceholder = document.getElementById('beLogoPlaceholder');
    if (bePlaceholder) bePlaceholder.style.display = 'none';
  }
  rebuildServiceRows(pf.services || []);
  rebuildCatalogueRows(pf.catalogue || []);
  checkStripeReturn();
  // Set active theme button
  document.querySelectorAll("#tabDesign .ob-theme-opt").forEach(o => {
    o.classList.toggle("active", o.dataset.theme === (pf.theme || "dark"));
  });
  updatePreviewLive();
}

function updatePreviewLive() {
  if (!psState.activePortfolio) return;
  const pf = psState.activePortfolio;
  pf.ai_headline   = val("ePortHeadline") || pf.ai_headline;
  pf.ai_tagline    = val("ePortTagline")  || pf.ai_tagline;
  pf.ai_bio        = val("ePortBio")      || pf.ai_bio;
  pf.accent_color  = val("eAccentColor")  || pf.accent_color;
  pf.youtube_url   = val("eSocYT")        || pf.youtube_url;
  pf.tiktok_url    = val("eSocTT")        || pf.tiktok_url;
  pf.instagram_url = val("eSocIG")        || pf.instagram_url;
  pf.linkedin_url  = val("eSocLI")        || pf.linkedin_url;
  pf.twitter_url   = val("eSocTW")        || pf.twitter_url;
  pf.total_followers = val("eSocFollowers")  || pf.total_followers;
  pf.engagement_rate = val("eSocEngagement") || pf.engagement_rate;
  pf.monthly_views   = val("eSocViews")      || pf.monthly_views;
  const cv = document.getElementById("eColorVal");
  if (cv) cv.textContent = pf.accent_color || "#c97e08";
  // Collect services from live rows
  const services = [];
  document.querySelectorAll("#eServicesEdit .ob-service-row").forEach(row => {
    const inputs = row.querySelectorAll("input[type=text],input:not([type])");
    const allInputs = row.querySelectorAll(".svc-row-fields input, input.ob-input.sm");
    const fields = Array.from(allInputs).filter(i => i.type !== "file");
    if (fields[0]?.value?.trim()) {
      services.push({
        title:       fields[0].value,
        description: fields[1]?.value || "",
        price:       fields[2]?.value || "",
        icon:        fields[3]?.value || "✦",
        image:       row.dataset.image || row.querySelector(".svc-row-img-el")?.src || ""
      });
    }
  });
  if (services.length) pf.services = services;
  const catalogue = collectCatalogueItems();
  if (catalogue.length) pf.catalogue = catalogue;

  // ── Strip base64 data URLs before rendering the preview iframe.
  // Large base64 strings embedded in the generated HTML cause
  // "RangeError: Invalid string length" in buildPortfolioHTML.
  // The hero strip UI already shows the uploaded image; the preview
  // just needs a blank placeholder so the layout stays intact.
  const pfPreview = JSON.parse(JSON.stringify(pf));
  const _isData = s => typeof s === 'string' && s.startsWith('data:');
  if (Array.isArray(pfPreview.hero_media)) {
    pfPreview.hero_media = pfPreview.hero_media.map(m =>
      _isData(m.url) ? { ...m, url: '' } : m
    ).filter(m => m.url); // hide blank slots from slideshow
  }
  if (_isData(pfPreview.logo_url))          pfPreview.logo_url = '';
  if (_isData(pfPreview.profile_photo_url)) pfPreview.profile_photo_url = '';
  if (Array.isArray(pfPreview.gallery_media)) {
    pfPreview.gallery_media = pfPreview.gallery_media
      .map(m => _isData(m.url) ? { ...m, url: '' } : m)
      .filter(m => m.url);
  }
  if (Array.isArray(pfPreview.catalogue)) {
    pfPreview.catalogue = pfPreview.catalogue.map(c =>
      _isData(c.image) ? { ...c, image: '' } : c
    );
  }
  if (Array.isArray(pfPreview.services)) {
    pfPreview.services = pfPreview.services.map(s =>
      _isData(s.image) ? { ...s, image: '' } : s
    );
  }
  renderPreview(pfPreview);
}

/* ── Hero media strip ── */
function renderHeroMediaStrip(media) {
  const strip = document.getElementById("heroMediaStrip");
  if (!strip) return;
  strip.innerHTML = "";
  (media || []).forEach((m, i) => {
    const thumb = document.createElement("div");
    thumb.className = "hm-thumb";
    thumb.innerHTML = `
      <img src="${m.url}" alt="Hero ${i+1}" loading="lazy"/>
      <div class="hm-del" onclick="removeHeroMedia(${i})">✕</div>`;
    strip.appendChild(thumb);
  });
}

function removeHeroMedia(idx) {
  if (!psState.activePortfolio) return;
  psState.activePortfolio.hero_media.splice(idx, 1);
  renderHeroMediaStrip(psState.activePortfolio.hero_media);
  updatePreviewLive();
}

/* ── Service rows in builder ── */
function rebuildServiceRows(services) {
  const container = document.getElementById("eServicesEdit");
  if (!container) return;
  container.innerHTML = "";
  services.forEach(s => {
    const uid = "simg_" + Math.random().toString(36).slice(2);
    const row = document.createElement("div");
    row.className = "ob-service-row svc-row-img";
    row.innerHTML = `
      <div class="svc-img-wrap" onclick="document.getElementById('${uid}').click()" title="Upload image">
        ${s.image
          ? `<img src="${s.image}" class="svc-row-img-el" alt=""/>`
          : `<div class="svc-img-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`
        }
        <input type="file" id="${uid}" accept="image/*" style="display:none" onchange="svcImageUpload(this)"/>
      </div>
      <div class="svc-row-fields">
        <div class="ob-row-header">
          <span class="ob-row-title">${esc(s.title)}</span>
          <button class="ob-row-del" onclick="this.closest('.ob-service-row').remove();updatePreviewLive()">✕</button>
        </div>
        <input class="ob-input sm" value="${esc(s.title)}"       placeholder="Title"       oninput="updatePreviewLive()"/>
        <input class="ob-input sm" value="${esc(s.description)}" placeholder="Description" style="margin-top:6px" oninput="updatePreviewLive()"/>
        <div class="ob-two-inline" style="margin-top:6px">
          <input class="ob-input sm" value="${esc(s.price)}" placeholder="Price" oninput="updatePreviewLive()"/>
          <input class="ob-input sm" value="${esc(s.icon||'✦')}" placeholder="Icon"  oninput="updatePreviewLive()"/>
        </div>
      </div>`;
    if (s.image) row.dataset.image = s.image;
    container.appendChild(row);
  });
}

/* Handle image upload for a service row */
function svcImageUpload(input) {
  const row = input.closest(".ob-service-row");
  if (!row || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    const wrap = row.querySelector(".svc-img-wrap");
    if (!wrap) return;
    wrap.querySelector(".svc-img-placeholder")?.remove();
    let img = wrap.querySelector(".svc-row-img-el");
    if (!img) { img = document.createElement("img"); img.className = "svc-row-img-el"; wrap.insertBefore(img, wrap.querySelector("input")); }
    img.src = e.target.result;
    row.dataset.image = e.target.result;
    updatePreviewLive();
  };
  reader.readAsDataURL(input.files[0]);
}

function addEditServiceRow() {
  const container = document.getElementById("eServicesEdit");
  if (!container) return;
  const uid = "simg_" + Math.random().toString(36).slice(2);
  const row = document.createElement("div");
  row.className = "ob-service-row svc-row-img";
  row.innerHTML = `
    <div class="svc-img-wrap" onclick="document.getElementById('${uid}').click()" title="Upload image">
      <div class="svc-img-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>
      <input type="file" id="${uid}" accept="image/*" style="display:none" onchange="svcImageUpload(this)"/>
    </div>
    <div class="svc-row-fields">
      <div class="ob-row-header">
        <span class="ob-row-title">New Service</span>
        <button class="ob-row-del" onclick="this.closest('.ob-service-row').remove();updatePreviewLive()">✕</button>
      </div>
      <input class="ob-input sm" placeholder="Title"       oninput="updatePreviewLive()"/>
      <input class="ob-input sm" placeholder="Description" style="margin-top:6px" oninput="updatePreviewLive()"/>
      <div class="ob-two-inline" style="margin-top:6px">
        <input class="ob-input sm" placeholder="Price" oninput="updatePreviewLive()"/>
        <input class="ob-input sm" placeholder="Icon"  oninput="updatePreviewLive()"/>
      </div>
    </div>`;
  container.appendChild(row);
}

/* ── Builder tabs ── */
function setEditTab(btn, tabId) {
  // Sync both rail tabs and mobile tabs
  document.querySelectorAll(".bl-rail-tab, .bl-mob-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".bl-tab-content").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");
  // Also sync the counterpart tab in the other nav
  const label = btn.querySelector("span")?.textContent || "";
  document.querySelectorAll(".bl-rail-tab, .bl-mob-tab").forEach(t => {
    if ((t.querySelector("span")?.textContent || t.getAttribute("title") || "") === label && t !== btn) {
      t.classList.add("active");
    }
  });
  const tab = document.getElementById(tabId);
  if (tab) tab.classList.add("active");
  // Update panel title
  const titleEl = document.getElementById("blPanelTitle");
  if (titleEl) {
    const previewBtn = titleEl.querySelector(".bl-mob-preview-btn");
    titleEl.childNodes.forEach(n => { if (n.nodeType === 3) n.textContent = label + " "; });
    if (!titleEl.childNodes[0] || titleEl.childNodes[0].nodeType !== 3) {
      titleEl.insertBefore(document.createTextNode(label + " "), titleEl.firstChild);
    } else {
      titleEl.childNodes[0].textContent = label + " ";
    }
    if (previewBtn) titleEl.appendChild(previewBtn);
  }
}

/* ══════════════════════════════════════════════════════════
   PREVIEW RENDERER — builds the actual mini-site HTML
══════════════════════════════════════════════════════════ */
function renderPreview(pf) {
  const iframe = document.getElementById("previewIframe");
  if (!iframe) return;
  const html = buildPortfolioHTML(pf);
  const blob = new Blob([html], { type:"text/html" });
  iframe.src = URL.createObjectURL(blob);
}

function buildPortfolioHTML(pf) {
  const t       = THEMES[pf.theme || 'dark'];
  const accent  = pf.accent_color || t.accent;
  const heroImgs = (pf.hero_media || []).map(m => m.preview || m.url).filter(Boolean).slice(0, 4); // max 4 in slideshow
  const profilePhotoUrl = pf.profile_photo_url || '';

  /* Gallery uses dedicated gallery_media first, then falls back to all hero_media */
  const galleryRawImgs = (pf.gallery_media && pf.gallery_media.length)
    ? pf.gallery_media.map(m => m.preview || m.url).filter(Boolean)
    : (pf.hero_media || []).map(m => m.preview || m.url).filter(Boolean);
  const galleryThumbImgs = (pf.gallery_media && pf.gallery_media.length)
    ? pf.gallery_media.map(m => m.thumb || m.preview || m.url).filter(Boolean)
    : (pf.hero_media || []).map(m => m.thumb || m.preview || m.url).filter(Boolean);

  const heroImg0 = heroImgs[0] || '';
  const logoUrl  = pf.logo_url || '';
  const initials = (pf.name || 'CR').split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0,2);

  /* ── Section assets from dijo-assets (AI-picked per section) ── */
  const sa = pf.section_assets || {};
  const aboutBg    = sa.about?.url    || '';
  const servicesBg = sa.services?.url || '';
  const contactBg  = sa.contact?.url  || '';
  const galleryBg  = sa.gallery?.url  || '';

  /* ── Social links ── */
  const socialLinks = [
    pf.youtube_url   ? { icon:'▶', label:'YouTube',   url:pf.youtube_url,   color:'#ff0000', subs: pf.youtube_subs } : null,
    pf.tiktok_url    ? { icon:'♪', label:'TikTok',    url:pf.tiktok_url,    color:'#69c9d0', subs: pf.tiktok_followers } : null,
    pf.instagram_url ? { icon:'◉', label:'Instagram', url:pf.instagram_url, color:'#e1306c' } : null,
    pf.linkedin_url  ? { icon:'in',label:'LinkedIn',  url:pf.linkedin_url,  color:'#0077b5' } : null,
    pf.twitter_url   ? { icon:'𝕏', label:'Twitter/X', url:pf.twitter_url,   color:'#1d9bf0' } : null,
  ].filter(Boolean);

  /* ── HTML sections ── */
  const catalogueHTML = (pf.catalogue || []).filter(c => c.title && c.payment_link).map(c => `
    <div class="cat-card">
      ${c.image ? `<div class="cat-card-img" style="background-image:url(${esc(c.image)})"></div>` : ''}
      <div class="cat-card-body">
        <div class="cat-card-info">
          <div class="cat-card-title">${esc(c.title)}</div>
          ${c.description ? `<div class="cat-card-desc">${esc(c.description)}</div>` : ''}
        </div>
        <div class="cat-card-foot">
          ${c.price ? `<div class="cat-card-price">£${esc(String(c.price))}</div>` : ''}
          <a href="${esc(c.payment_link)}" target="_blank" class="cat-book-btn">Book &amp; Pay →</a>
        </div>
      </div>
    </div>`).join('');

  const servicesHTML = (pf.services || []).map(s => `
    <div class="card service-card">
      ${s.image ? `<div class="service-img" style="background-image:url(${esc(s.image)})"></div>` : `<div class="service-icon">${esc(s.icon || '✦')}</div>`}
      <div class="service-title">${esc(s.title)}</div>
      <div class="service-desc">${esc(s.description)}</div>
      ${s.price ? `<div class="service-price">${esc(s.price)}</div>` : ''}
    </div>`).join('');

  const projectsHTML = (pf.projects || []).map(p => `
    <div class="card">
      <div class="project-title">${esc(p.title)}</div>
      <div class="project-desc">${esc(p.description)}</div>
      ${p.url ? `<a href="${esc(p.url)}" target="_blank" class="project-link">View project →</a>` : ''}
    </div>`).join('');

  const testimonialsHTML = (pf.testimonials || []).map(t2 => `
    <div class="card">
      <div class="testimonial-quote">"${esc(t2.quote)}"</div>
      <div class="testimonial-author">— ${esc(t2.author)}</div>
    </div>`).join('');

  const socialHTML = socialLinks.map(s => `
    <a href="${esc(s.url)}" target="_blank" class="social-link" style="--lc:${s.color}">
      <span class="si">${s.icon}</span>
      <div class="sl-info">
        <span class="sl-label">${esc(s.label)}</span>
        ${s.subs ? `<span class="sl-sub">${esc(s.subs)} followers</span>` : ''}
      </div>
      <span class="sa">→</span>
    </a>`).join('');

  const statsHTML = (pf.total_followers || pf.engagement_rate || pf.monthly_views) ? `
    <div class="stats-row">
      ${pf.total_followers ? `<div class="stat"><div class="sv">${esc(pf.total_followers)}</div><div class="sl2">FOLLOWERS</div></div>` : ''}
      ${pf.engagement_rate ? `<div class="stat"><div class="sv">${esc(pf.engagement_rate)}</div><div class="sl2">ENGAGEMENT</div></div>` : ''}
      ${pf.monthly_views   ? `<div class="stat"><div class="sv">${esc(pf.monthly_views)}</div><div class="sl2">MONTHLY VIEWS</div></div>` : ''}
    </div>` : '';

  /* ── Gallery flip pages — use gallery_media first, then hero_media, then dijo section assets ── */
  const _dijoGalleryUrl = sa.gallery?.url || sa.hero?.url || '';
  const galleryImgs = galleryThumbImgs.length > 0 ? galleryThumbImgs
    : _dijoGalleryUrl ? [_dijoGalleryUrl,
        sa.about?.url, sa.services?.url, sa.contact?.url
      ].filter(Boolean)
    : [
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80',
        'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&q=80',
        'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=800&q=80',
        'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800&q=80',
        'https://images.unsplash.com/photo-1518173946687-a4c8892bbd9f?w=800&q=80',
        'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80'
      ];
  const totalFlipPages = galleryImgs.length;

  const flipPagesHTML = galleryImgs.map((url, i) => `
    <div class="fp-page" id="fpPage${i}" style="z-index:${totalFlipPages - i}">
      <div class="fp-front">
        <img src="${esc(url)}" alt="Gallery image ${i+1}" ${i===0?'fetchpriority="high"':'loading="lazy"'}/>
        <div class="fp-page-num">${i+1} / ${totalFlipPages}</div>
        <div class="fp-crease"></div>
      </div>
      <div class="fp-back">
        ${i+1 < galleryImgs.length
          ? `<img src="${esc(galleryImgs[i+1])}" alt="Gallery image ${i+2}" loading="lazy"/>
             <div class="fp-page-num">${i+2} / ${totalFlipPages}</div>
             <div class="fp-crease back-crease"></div>`
          : `<div class="fp-back-blank"><div class="fp-back-icon">✦</div><div class="fp-back-text">End of Gallery</div></div>`}
      </div>
    </div>`).join('');

  const flipThumbsHTML = galleryImgs.map((_, i) =>
    `<button class="fp-dot${i===0?' active':''}" onclick="fpGoto(${i})" aria-label="Page ${i+1}"></button>`
  ).join('');

  /* ── Hero slideshow script ── */
  const slideshowScript = heroImgs.length > 1 ? `
    var _slides=document.querySelectorAll('.hero-slide');
    var _hdots=document.querySelectorAll('.hero-dot');
    var _si=0,_stimer=null;
    function slideTo(n){
      if(_slides[_si])_slides[_si].classList.remove('active');
      if(_hdots[_si])_hdots[_si].classList.remove('active');
      _si=n;
      if(_slides[_si])_slides[_si].classList.add('active');
      if(_hdots[_si])_hdots[_si].classList.add('active');
    }
    function _slideNext(){slideTo((_si+1)%${heroImgs.length});}
    _stimer=setInterval(_slideNext,4500);
    var _heroEl=document.getElementById('hero-home');
    if(_heroEl){
      _heroEl.addEventListener('mouseenter',function(){clearInterval(_stimer);});
      _heroEl.addEventListener('mouseleave',function(){_stimer=setInterval(_slideNext,4500);});
    }` : '';

  /* ── Slideshow HTML ── falls back to dijo hero if no hero_media */
  const dijoHeroUrl = sa.hero?.url || '';
  const slideshowHTML = heroImgs.length > 1
    ? heroImgs.map((url, idx) => `<div class="hero-slide${idx===0?' active':''}" style="background-image:url(${esc(url)})"></div>`).join('')
    : heroImgs.length === 1
      ? `<div class="hero-slide active" style="background-image:url(${esc(heroImgs[0])})"></div>`
      : dijoHeroUrl
        ? `<div class="hero-slide active" style="background-image:url(${esc(dijoHeroUrl)})"></div>`
        : '';

  /* ── Nav ── */
  const hasServices = !!(pf.services && pf.services.length) || !!catalogueHTML;
  const navLinks = `
    <span class="nav-link active" onclick="showPage('page-home')">Home</span>
    <span class="nav-link" onclick="showPage('page-gallery')">Gallery</span>
    ${hasServices ? `<span class="nav-link" onclick="showPage('page-services')">Services</span>` : ''}`;

  const mobileNavLinks = `
    <div class="mnav-lk active" onclick="showPage('page-home');closeMnav()">Home</div>
    <div class="mnav-lk" onclick="showPage('page-gallery');closeMnav()">Gallery</div>
    ${hasServices ? `<div class="mnav-lk" onclick="showPage('page-services');closeMnav()">Services</div>` : ''}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(pf.seo?.title || `${pf.name} — ${pf.niche} | ImpactGrid`)}</title>
<meta name="description" content="${esc(pf.seo?.description || pf.ai_meta || pf.niche + ' creator portfolio')}"/>
${(() => { const kw = Array.isArray(pf.seo?.keywords) ? pf.seo.keywords : (typeof pf.seo?.keywords === 'string' ? pf.seo.keywords.split(',').map(k=>k.trim()).filter(Boolean) : []); return kw.length ? `<meta name="keywords" content="${esc(kw.join(', '))}"/>` : ''; })()}
<meta name="robots" content="index,follow"/>
<meta name="author" content="${esc(pf.name)}"/>
<meta property="og:type" content="profile"/>
<meta property="og:site_name" content="ImpactGrid"/>
<meta property="og:title" content="${esc(pf.seo?.og_title || `${pf.name} — ${pf.niche}`)}"/>
<meta property="og:description" content="${esc(pf.seo?.og_description || pf.ai_bio || pf.bio || '')}"/>
<meta property="og:url" content="https://impactgrid.app/p/${esc(pf.slug || '')}"/>
${heroImg0 ? `<meta property="og:image" content="${esc(heroImg0)}"/>` : ''}
<meta name="twitter:card" content="${esc(pf.seo?.twitter_card || 'summary_large_image')}"/>
<meta name="twitter:title" content="${esc(pf.seo?.og_title || `${pf.name} — ${pf.niche}`)}"/>
<meta name="twitter:description" content="${esc(pf.seo?.og_description || pf.ai_bio || '')}"/>
${heroImg0 ? `<meta name="twitter:image" content="${esc(heroImg0)}"/>` : ''}
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": pf.seo?.schema_type || "Person",
  "name": pf.name,
  "description": pf.ai_bio || pf.bio || "",
  "url": `https://impactgrid.app/p/${pf.slug || ""}`,
  "image": heroImg0 || "",
  "jobTitle": pf.niche,
  "worksFor": { "@type": "Organization", "name": "ImpactGrid" },
  ...(pf.location ? { "address": { "@type": "PostalAddress", "addressLocality": pf.location } } : {}),
  ...(pf.email ? { "email": pf.email } : {}),
  ...((() => { const kw = Array.isArray(pf.seo?.keywords) ? pf.seo.keywords : (typeof pf.seo?.keywords === 'string' ? pf.seo.keywords.split(',').map(k=>k.trim()).filter(Boolean) : []); return kw.length ? { "knowsAbout": kw } : {}; })()),
})}</script>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,400&display=swap" rel="stylesheet"/>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:${t.bg};--sf:${t.surface};--tx:${t.text};--sub:${t.sub};--bd:${t.border};--ac:${accent};--fh:'Syne',sans-serif;--nav-h:60px}
html,body{height:100%}
html{scroll-behavior:smooth}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--tx);line-height:1.6;overflow-x:hidden}
a{color:inherit;text-decoration:none}
/* NAV */
.nav{position:fixed;top:0;left:0;right:0;height:var(--nav-h);z-index:100;padding:0 32px;display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,.45);backdrop-filter:blur(18px);border-bottom:1px solid var(--bd)}
.nav-brand{font-family:var(--fh);font-size:15px;font-weight:800;flex-shrink:0;cursor:pointer}
.nav-logo{height:32px;width:auto;object-fit:contain;display:block}
.nav-links{display:flex;gap:6px;align-items:center}
.nav-link{padding:7px 14px;font-size:13px;color:var(--sub);border-radius:8px;transition:.15s;border:1px solid transparent;cursor:pointer}
.nav-link:hover{color:var(--tx);background:rgba(255,255,255,.06)}
.nav-link.active{color:var(--ac);border-color:rgba(255,255,255,.1);background:rgba(255,255,255,.06)}
.nav-cta{padding:8px 18px;background:var(--ac);color:#fff;border-radius:8px;font-size:12px;font-weight:700;font-family:var(--fh);transition:.15s;flex-shrink:0;cursor:pointer}
.nav-cta:hover{opacity:.85}
.nav-hamburger{display:none;flex-direction:column;gap:4px;width:22px;cursor:pointer;padding:4px;flex-shrink:0}
.nav-hamburger span{display:block;height:2px;background:var(--tx);border-radius:2px;transition:.25s}
/* MOBILE NAV DRAWER */
.mnav{position:fixed;inset:0;z-index:200;pointer-events:none}
.mnav-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.6);opacity:0;transition:.25s;backdrop-filter:blur(4px)}
.mnav-drawer{position:absolute;top:0;right:0;bottom:0;width:260px;background:var(--sf);border-left:1px solid var(--bd);padding:24px 20px;display:flex;flex-direction:column;gap:4px;transform:translateX(100%);transition:.25s cubic-bezier(.4,0,.2,1)}
.mnav-close{align-self:flex-end;font-size:20px;color:var(--sub);cursor:pointer;margin-bottom:12px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:8px;border:1px solid var(--bd)}
.mnav-lk{padding:13px 16px;font-size:15px;font-weight:600;font-family:var(--fh);color:var(--sub);border-radius:10px;border:1px solid transparent;transition:.15s;cursor:pointer}
.mnav-lk:hover{color:var(--tx);background:rgba(255,255,255,.05)}
.mnav-lk.active{color:var(--ac);background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.1)}
.mnav-cta{margin-top:12px;padding:13px;background:var(--ac);color:#fff;border-radius:10px;font-family:var(--fh);font-weight:700;text-align:center;font-size:14px;cursor:pointer}
.mnav.open .mnav-backdrop{opacity:1;pointer-events:all}
.mnav.open .mnav-drawer{transform:translateX(0);pointer-events:all}
/* PAGES */
.page{display:none;min-height:calc(100vh - var(--nav-h));padding-top:var(--nav-h)}
.page.active{display:block}
.pg-header{padding:48px 60px 0;max-width:1100px;margin:0 auto}
/* HERO SLIDESHOW */
.hero{min-height:90vh;position:relative;display:flex;align-items:center;overflow:hidden}
#heroBg{position:absolute;inset:0;background-color:var(--sf)}
.hero-slide{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;transition:opacity 1.2s ease}
.hero-slide.active{opacity:1}
.hero-dots{position:absolute;bottom:28px;left:50%;transform:translateX(-50%);z-index:3;display:flex;gap:8px;align-items:center}
.hero-dot{width:7px;height:7px;border-radius:50%;border:none;background:rgba(255,255,255,.35);cursor:pointer;transition:.2s;padding:0}
.hero-dot.active{background:#fff;transform:scale(1.35)}
.hero-ov{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.45) 0%,rgba(0,0,0,.6) 55%,var(--bg) 100%);z-index:1}
.hero-c{position:relative;z-index:2;padding:80px 60px 60px;max-width:800px}
.eyebrow{font-size:11px;font-family:monospace;letter-spacing:3px;color:var(--ac);text-transform:uppercase;margin-bottom:14px}
.tagline{font-size:13px;color:var(--sub);margin-bottom:6px;font-family:monospace;letter-spacing:1px}
.headline{font-family:var(--fh);font-size:clamp(36px,5.5vw,72px);font-weight:800;line-height:1.05;letter-spacing:-2px;margin-bottom:24px}
.hero-btns{display:flex;gap:12px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:8px;padding:13px 26px;border-radius:10px;font-family:var(--fh);font-size:13px;font-weight:700;transition:.2s;cursor:pointer;border:none}
.btn-p{background:var(--ac);color:#fff;box-shadow:0 4px 20px rgba(0,0,0,.3)}
.btn-p:hover{opacity:.85;transform:translateY(-1px)}
.btn-s{border:1.5px solid rgba(255,255,255,.2)!important;color:var(--tx);background:transparent}
.btn-s:hover{border-color:var(--ac)!important;color:var(--ac)}
/* ABOUT BODY */
.about-body{max-width:1100px;margin:0 auto;padding:48px 60px 56px}
.about-bio-wrap{margin-top:48px}
.about-two-col{display:grid;grid-template-columns:1fr auto;gap:48px;align-items:start}
.about-bio-col{min-width:0}
.about-bio-text{font-size:16px;color:var(--sub);max-width:660px;line-height:1.85;margin-top:16px}
.about-photo-col{flex-shrink:0}
.about-photo-frame{width:220px;height:270px;border-radius:16px;overflow:hidden;border:2px solid var(--bd);box-shadow:0 12px 40px rgba(0,0,0,.35)}
.about-photo{width:100%;height:100%;object-fit:cover;object-position:top center;display:block}
/* STATS */
.stats-row{display:flex;gap:2px;flex-wrap:wrap}
.stat{flex:1;min-width:110px;padding:18px 22px;background:var(--sf);border:1px solid var(--bd);text-align:center}
.stat:first-child{border-radius:10px 0 0 10px}.stat:last-child{border-radius:0 10px 10px 0}
.sv{font-family:var(--fh);font-size:30px;font-weight:800;color:var(--ac);line-height:1}
.sl2{font-size:9px;letter-spacing:2px;color:var(--sub);margin-top:5px;font-family:monospace}
/* SECTIONS */
.sec-lbl{font-size:10px;font-weight:700;font-family:monospace;letter-spacing:3px;color:var(--ac);text-transform:uppercase;margin-bottom:10px}
.sec-ttl{font-family:var(--fh);font-size:clamp(26px,3.5vw,44px);font-weight:800;letter-spacing:-1px;margin-bottom:36px;line-height:1.1}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
.card{background:var(--sf);border:1.5px solid var(--bd);border-radius:14px;padding:22px;transition:.2s}
.card:hover{border-color:var(--ac);transform:translateY(-2px)}
.service-icon{font-size:26px;margin-bottom:10px}
.service-img{height:150px;border-radius:10px;background-size:cover;background-position:center;margin-bottom:16px}
.service-title{font-family:var(--fh);font-size:15px;font-weight:700;margin-bottom:6px}
.service-desc{font-size:13px;color:var(--sub);line-height:1.6;margin-bottom:10px}
.service-price{font-family:monospace;font-size:17px;font-weight:700;color:var(--ac)}
.project-title{font-family:var(--fh);font-size:14px;font-weight:700;margin-bottom:6px}
.project-desc{font-size:13px;color:var(--sub);line-height:1.6;margin-bottom:10px}
.project-link{font-size:12px;font-weight:700;color:var(--ac);font-family:monospace}
.testimonial-quote{font-size:14px;line-height:1.75;color:var(--tx);margin-bottom:14px;font-style:italic}
.testimonial-author{font-size:11px;color:var(--ac);font-family:monospace;font-weight:700;letter-spacing:.5px}
/* CATALOGUE */
.catalogue-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px}
.cat-card{background:var(--sf);border:1.5px solid var(--bd);border-radius:16px;overflow:hidden;transition:.2s}
.cat-card:hover{border-color:var(--ac);transform:translateY(-3px);box-shadow:0 12px 40px rgba(0,0,0,.3)}
.cat-card-img{height:180px;background-size:cover;background-position:center}
.cat-card-body{padding:20px}
.cat-card-info{margin-bottom:16px}
.cat-card-title{font-family:var(--fh);font-size:16px;font-weight:700;margin-bottom:6px}
.cat-card-desc{font-size:13px;color:var(--sub);line-height:1.6}
.cat-card-foot{display:flex;align-items:center;justify-content:space-between;gap:12px}
.cat-card-price{font-family:monospace;font-size:22px;font-weight:800;color:var(--ac)}
.cat-book-btn{display:inline-flex;align-items:center;gap:6px;background:var(--ac);color:#fff;font-size:13px;font-weight:700;padding:10px 18px;border-radius:8px;text-decoration:none;transition:.2s;white-space:nowrap}
.cat-book-btn:hover{opacity:.85;transform:translateY(-1px)}
/* FLIP PAGE GALLERY */
.fp-stage{display:flex;flex-direction:column;align-items:center;padding:32px 20px 64px;gap:28px;width:100%;box-sizing:border-box}
.fp-book-wrap{position:relative;width:100%;max-width:960px;perspective:2000px;-webkit-perspective:2000px}
.fp-book-wrap::before{content:"";display:block;padding-top:66.66%}
.fp-book{position:absolute;top:0;left:0;right:0;bottom:0;cursor:pointer}
.fp-page{position:absolute;top:0;left:0;width:100%;height:100%;transform-origin:left center;transform-style:preserve-3d;-webkit-transform-style:preserve-3d;transition:transform .8s cubic-bezier(.645,.045,.355,1);border-radius:4px 16px 16px 4px;box-shadow:8px 0 48px rgba(0,0,0,.55),-2px 0 10px rgba(0,0,0,.3),inset -3px 0 8px rgba(0,0,0,.15)}
.fp-page.flipped{transform:rotateY(-180deg)}
.fp-front,.fp-back{position:absolute;top:0;left:0;width:100%;height:100%;backface-visibility:hidden;-webkit-backface-visibility:hidden;overflow:hidden;border-radius:4px 16px 16px 4px}
.fp-back{transform:rotateY(180deg);-webkit-transform:rotateY(180deg);border-radius:16px 4px 4px 14px}
.fp-front img,.fp-back img{width:100%;height:100%;object-fit:contain;object-position:center;display:block;background:var(--bg)}
.fp-crease{position:absolute;left:0;top:0;bottom:0;width:40px;background:linear-gradient(to right,rgba(0,0,0,.5),rgba(0,0,0,.08) 70%,transparent);pointer-events:none;z-index:2}
.fp-crease.back-crease{left:auto;right:0;background:linear-gradient(to left,rgba(0,0,0,.5),rgba(0,0,0,.08) 70%,transparent)}
.fp-page-num{position:absolute;bottom:14px;right:18px;font-size:11px;font-family:monospace;color:rgba(255,255,255,.9);background:rgba(0,0,0,.55);padding:4px 10px;border-radius:20px;backdrop-filter:blur(4px);letter-spacing:.5px}
.fp-back .fp-page-num{right:auto;left:18px}
.fp-back-blank{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:var(--sf)}
.fp-back-icon{font-size:36px;color:var(--ac);opacity:.6}
.fp-back-text{font-family:var(--fh);font-size:14px;color:var(--sub);letter-spacing:1px}
.fp-controls{display:flex;align-items:center;gap:20px;margin-top:4px}
.fp-btn{display:flex;align-items:center;gap:6px;padding:10px 20px;border-radius:10px;border:1.5px solid var(--bd);background:var(--sf);color:var(--tx);font-family:var(--fh);font-size:13px;font-weight:700;cursor:pointer;transition:.2s}
.fp-btn:hover{border-color:var(--ac);color:var(--ac);transform:scale(1.04)}
.fp-btn:disabled{opacity:.3;pointer-events:none}
.fp-dots{display:flex;gap:7px;align-items:center}
.fp-dot{width:8px;height:8px;border-radius:50%;border:none;background:var(--bd);cursor:pointer;transition:.2s;padding:0}
.fp-dot.active{background:var(--ac);transform:scale(1.35)}
.fp-dot:hover{background:var(--ac);opacity:.7}
/* GALLERY PHOTO CARDS — scattered pile style */
.gallery-grid-wrap{max-width:1100px;margin:0 auto;padding:0 60px 80px}
.gallery-pile-row{display:flex;flex-wrap:wrap;gap:56px 64px;justify-content:center;padding:16px 0 32px}
.gallery-pile{position:relative;width:220px;height:165px;cursor:pointer;flex-shrink:0}
.gp-card{position:absolute;top:0;left:0;width:200px;height:150px;border-radius:6px;overflow:hidden;background:var(--sf);border:4px solid #fff;box-shadow:0 4px 18px rgba(0,0,0,.45);transition:transform .35s cubic-bezier(.34,1.56,.64,1),box-shadow .35s}
.gp-card img{width:100%;height:100%;object-fit:cover;object-position:center;display:block}
.gp-back{transform:rotate(6deg) translate(14px,-4px);z-index:1;filter:brightness(.75)}
.gp-mid{transform:rotate(-3.5deg) translate(5px,5px);z-index:2;filter:brightness(.88)}
.gp-front{transform:rotate(0deg);z-index:3}
.gallery-pile:hover .gp-back{transform:rotate(14deg) translate(28px,-10px)}
.gallery-pile:hover .gp-mid{transform:rotate(-9deg) translate(-8px,6px)}
.gallery-pile:hover .gp-front{transform:rotate(0deg) translateY(-6px)}
.gallery-pile:hover .gp-card{box-shadow:0 16px 48px rgba(0,0,0,.55)}
.gp-label{position:absolute;bottom:-26px;left:0;right:0;text-align:center;font-size:11px;font-family:monospace;color:var(--sub);letter-spacing:.5px}
.gallery-card-solo{position:relative;width:200px;height:150px;border-radius:6px;overflow:hidden;border:4px solid #fff;box-shadow:0 6px 24px rgba(0,0,0,.45);cursor:pointer;transition:.3s;flex-shrink:0}
.gallery-card-solo:hover{transform:translateY(-5px) rotate(-1deg);box-shadow:0 16px 40px rgba(0,0,0,.55)}
.gallery-card-solo img{width:100%;height:100%;object-fit:cover;object-position:center;display:block}
.gallery-card-solo-ov{position:absolute;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;opacity:0;transition:.2s}
.gallery-card-solo:hover .gallery-card-solo-ov{opacity:1}
.gallery-card-solo-ov span{color:#fff;font-family:var(--fh);font-size:12px;font-weight:700;letter-spacing:.5px}
/* HOME SOCIAL LINKS */
.home-socials-wrap{max-width:1100px;margin:0 auto;padding:0 60px 48px}
.social-links{display:flex;flex-direction:column;gap:9px;max-width:560px}
.social-link{display:flex;align-items:center;gap:14px;padding:16px 20px;background:var(--sf);border:1.5px solid var(--bd);border-radius:14px;transition:.2s}
.social-link:hover{border-color:var(--lc,var(--ac));transform:translateX(4px)}
.si{width:36px;height:36px;border-radius:9px;background:var(--bd);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
.sl-info{display:flex;flex-direction:column;gap:2px;flex:1}
.sl-label{font-size:14px;font-weight:600;font-family:var(--fh)}
.sl-sub{font-size:11px;color:var(--sub);font-family:monospace}
.sa{color:var(--sub);transition:.2s;font-size:18px}
.social-link:hover .sa{color:var(--lc,var(--ac));transform:translateX(3px)}
/* CONTACT SECTION (on homepage) */
.contact-wrap{background:linear-gradient(135deg,rgba(255,255,255,.025),transparent);border:1.5px solid var(--bd);border-radius:20px;padding:56px;text-align:center;margin:0 auto 72px;max-width:1100px;margin-left:auto;margin-right:auto}
.contact-ttl{font-family:var(--fh);font-size:clamp(26px,4vw,46px);font-weight:800;letter-spacing:-1px;margin-bottom:10px}
.contact-sub{font-size:14px;color:var(--sub);margin-bottom:28px;max-width:460px;margin-left:auto;margin-right:auto}
.cf-form{display:flex;flex-direction:column;gap:14px;max-width:480px;margin:0 auto;text-align:left}
.cf-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.cf-form input,.cf-form textarea{width:100%;padding:13px 16px;background:rgba(255,255,255,.06);border:1.5px solid var(--bd);border-radius:10px;color:var(--txt);font-size:14px;font-family:inherit;outline:none;transition:border .2s;box-sizing:border-box}
.cf-form input:focus,.cf-form textarea:focus{border-color:var(--ac)}
.cf-form textarea{resize:vertical;min-height:110px}
.cf-btn{background:var(--ac);color:#fff;border:none;border-radius:10px;padding:14px 28px;font-size:14px;font-weight:700;cursor:pointer;transition:opacity .2s;width:100%}
.cf-btn:hover{opacity:.85}
.cf-btn:disabled{opacity:.5;cursor:not-allowed}
.cf-msg{font-size:13px;text-align:center;margin-top:4px;min-height:18px}
/* SERVICES PAGE */
.page-inner{max-width:1100px;margin:0 auto;padding:32px 60px 80px}
/* FOOTER */
footer{border-top:1px solid var(--bd);padding:28px 60px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px}
.fl{display:flex;gap:18px;font-size:12px;color:var(--sub)}
.fl a{cursor:pointer}.fl a:hover{color:var(--ac)}
/* MODALS */
.mo{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(6px);z-index:200;display:none;align-items:center;justify-content:center;padding:20px}
.mo.show{display:flex}
.mb{background:var(--sf);border:1px solid var(--bd);border-radius:16px;max-width:660px;width:100%;max-height:80vh;overflow-y:auto;padding:32px}
.mb h2{font-family:var(--fh);font-size:20px;font-weight:800;margin-bottom:16px}
.mb p{font-size:13px;color:var(--sub);line-height:1.8;white-space:pre-line}
.mc{float:right;width:26px;height:26px;border-radius:7px;background:var(--sf);border:1px solid var(--bd);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;color:var(--sub)}
/* ANIMATIONS */
@keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
.fu{animation:fadeUp .55s ease both}
.d1{animation-delay:.08s}.d2{animation-delay:.16s}.d3{animation-delay:.24s}
@keyframes pageIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.page.active{animation:pageIn .3s ease both}
/* RESPONSIVE */
@media(max-width:900px){
  .nav-links{display:none}
  .nav-hamburger{display:flex}
  .hero-c{padding:60px 20px 40px}
  .about-body{padding:32px 20px 40px}
  .about-two-col{grid-template-columns:1fr;gap:28px}
  .about-photo-frame{width:100%;height:220px}
  .home-socials-wrap{padding:0 20px 36px}
  .contact-wrap{margin:0 20px 56px;padding:36px 24px}
  .cf-row{grid-template-columns:1fr}
  .pg-header{padding:32px 20px 0}
  .page-inner{padding:24px 20px 60px}
  footer{padding:20px}
  .fp-book-wrap{width:calc(100vw - 24px);max-width:calc(100vw - 24px)}
  .fp-stage{padding:16px 12px 48px}
  .fp-btn{padding:8px 14px;font-size:12px}
  .gallery-grid-wrap{padding:0 16px 48px}
  .gallery-pile-row{gap:40px 36px}
  .grid{grid-template-columns:1fr}
}
@media(max-width:480px){
  .headline{font-size:32px;letter-spacing:-1px}
  .hero-btns{flex-direction:column;gap:8px}
  .btn{justify-content:center}
}
</style>
</head>
<body>

<!-- NAV -->
<nav class="nav">
  <div class="nav-brand" onclick="showPage('page-home')">
    ${logoUrl ? `<img src="${esc(logoUrl)}" alt="${esc(pf.name)}" class="nav-logo"/>` : esc(pf.name)}
  </div>
  <div class="nav-links">${navLinks}</div>
  ${pf.email ? `<a class="nav-cta" href="mailto:${esc(pf.email)}">${cleanCta(pf.ai_cta || 'Work With Me')}</a>` : ''}
  <div class="nav-hamburger" onclick="openMnav()" aria-label="Menu">
    <span></span><span></span><span></span>
  </div>
</nav>

<!-- MOBILE NAV -->
<div class="mnav" id="mnavOverlay">
  <div class="mnav-backdrop" onclick="closeMnav()"></div>
  <div class="mnav-drawer">
    <div class="mnav-close" onclick="closeMnav()">✕</div>
    ${mobileNavLinks}
    ${pf.email ? `<div class="mnav-cta" onclick="closeMnav();document.getElementById('home-contact').scrollIntoView({behavior:'smooth'})">${cleanCta(pf.ai_cta || 'Work With Me')}</div>` : ''}
  </div>
</div>

<!-- PAGE: HOME -->
<section class="page active" id="page-home">

  <!-- HERO SLIDESHOW -->
  <div class="hero" id="hero-home">
    <div id="heroBg">${slideshowHTML}</div>
    <div class="hero-ov"></div>
    ${heroImgs.length > 1 ? `
    <div class="hero-dots">
      ${heroImgs.map((_,i) => `<button class="hero-dot${i===0?' active':''}" onclick="slideTo(${i})" aria-label="Slide ${i+1}"></button>`).join('')}
    </div>` : ''}
    <div class="hero-c">
      <div class="eyebrow fu">${esc(pf.niche)}</div>
      <div class="tagline fu d1">${esc(pf.ai_tagline || '')}</div>
      <h1 class="headline fu d2">${esc(pf.ai_headline || pf.name)}</h1>
      <div class="hero-btns fu d3">
        <a class="btn btn-p" href="#home-contact" onclick="document.getElementById('home-contact').scrollIntoView({behavior:'smooth'});return false;">${cleanCta(pf.ai_cta || 'Work With Me')} →</a>
        ${hasServices ? `<a class="btn btn-s" href="#" onclick="showPage('page-services');return false;">See My Services</a>` : ''}
      </div>
    </div>
  </div>

  <!-- ABOUT -->
  <div class="about-body" ${aboutBg ? `style="position:relative;overflow:hidden"` : ''}>
    ${aboutBg ? `<div style="position:absolute;inset:0;background-image:url(${esc(aboutBg)});background-size:cover;background-position:center;opacity:0.07;z-index:0;pointer-events:none"></div>` : ''}
    <div style="position:relative;z-index:1">
    ${statsHTML}
    <div class="about-bio-wrap">
      <div class="about-two-col">
        <div class="about-bio-col">
          <div class="sec-lbl">About</div>
          <div class="sec-ttl">${esc(pf.name)}</div>
          <p class="about-bio-text">${esc(pf.ai_bio || pf.bio || '')}</p>
        </div>
        ${profilePhotoUrl ? `
        <div class="about-photo-col">
          <div class="about-photo-frame">
            <img src="${esc(profilePhotoUrl)}" alt="${esc(pf.name)}" class="about-photo"/>
          </div>
        </div>` : ''}
      </div>
    </div>
    </div>
  </div>

  <!-- SOCIAL LINKS -->
  ${socialLinks.length ? `
  <div class="home-socials-wrap">
    <div class="sec-lbl" style="margin-bottom:14px">Find Me</div>
    <div class="social-links">${socialHTML}</div>
  </div>` : ''}

  <!-- CONTACT CTA -->
  <div class="contact-wrap" id="home-contact">
    <div class="sec-lbl">Let's Collaborate</div>
    <div class="contact-ttl">Ready to work together?</div>
    <p class="contact-sub">I partner with brands that align with my audience's values. Let's create something remarkable.</p>
    ${pf.email ? `
    <div class="cf-form">
      <div class="cf-row">
        <input id="cf-name" type="text" placeholder="Your name" />
        <input id="cf-email" type="email" placeholder="Your email" />
      </div>
      <textarea id="cf-msg" placeholder="Tell me about your project…"></textarea>
      <button class="cf-btn" id="cf-btn" onclick="(async function(){
        var btn=document.getElementById('cf-btn');
        var status=document.getElementById('cf-status');
        var name=document.getElementById('cf-name').value.trim();
        var email=document.getElementById('cf-email').value.trim();
        var message=document.getElementById('cf-msg').value.trim();
        if(!name||!email||!message){status.style.color='#f87171';status.textContent='Please fill in all fields.';return;}
        btn.disabled=true;btn.textContent='Sending…';
        try{
          var r=await fetch('https://impactgrid-dijo.onrender.com/contact/send',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({name:name,email:email,message:message,creatorEmail:'${esc(pf.email)}'})
          });
          var d=await r.json();
          if(d.success){
            status.style.color='#4ade80';
            status.textContent='Message sent! ✓';
            document.getElementById('cf-name').value='';
            document.getElementById('cf-email').value='';
            document.getElementById('cf-msg').value='';
            btn.textContent='Send Message';
            btn.disabled=false;
          }else{
            status.style.color='#f87171';
            status.textContent='Something went wrong. Try again.';
            btn.textContent='Send Message';
            btn.disabled=false;
          }
        }catch(e){
          status.style.color='#f87171';
          status.textContent='Server error. Please try again.';
          btn.textContent='Send Message';
          btn.disabled=false;
        }
      })()">Send Message</button>
      <div class="cf-msg" id="cf-status"></div>
    </div>` : ''}
  </div>

  <!-- FOOTER -->
  <footer>
    <div style="font-family:var(--fh);font-size:14px;font-weight:700">
      ${logoUrl ? `<img src="${esc(logoUrl)}" alt="${esc(pf.name)}" style="height:28px;object-fit:contain"/>` : esc(pf.name)}
    </div>
    <div class="fl">
      ${pf.ai_terms   ? `<a onclick="document.getElementById('tm').classList.add('show')">Terms &amp; Conditions</a>` : ''}
      ${pf.ai_privacy ? `<a onclick="document.getElementById('pm').classList.add('show')">Privacy Policy</a>` : ''}
      ${pf.email      ? `<a href="mailto:${esc(pf.email)}">Contact</a>` : ''}
    </div>
    <div style="font-size:11px;color:var(--sub)">Made with <a href="https://impactgridgroup.com" target="_blank" style="color:var(--ac)">ImpactGrid ✦</a></div>
  </footer>

</section>

<!-- PAGE: GALLERY -->
<section class="page" id="page-gallery" ${galleryBg ? `style="background-image:url(${esc(galleryBg)});background-size:cover;background-position:center;"` : ""}>
  <div class="pg-header">
    <div class="sec-lbl">Gallery</div>
    <div class="sec-ttl">My Work</div>
  </div>
  <div class="fp-stage">
    <div class="fp-book-wrap">
    <div class="fp-book" id="fpBook">${flipPagesHTML}</div>
    </div>
    <div class="fp-controls">
      <button class="fp-btn fp-btn-prev" onclick="fpStep(-1)" aria-label="Previous page">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>Prev
      </button>
      <div class="fp-dots" id="fpDots">${flipThumbsHTML}</div>
      <button class="fp-btn fp-btn-next" onclick="fpStep(1)" aria-label="Next page">
        Next<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
  </div>
  ${galleryImgs.length > 0 ? (() => {
    // Group images into piles of 3 (each pile = stacked photo cards)
    const piles = [];
    for (let i = 0; i < galleryImgs.length; i += 3) {
      piles.push(galleryImgs.slice(i, i + 3));
    }
    const pilesHTML = piles.map((pile, pi) => {
      const startIdx = pi * 3;
      if (pile.length >= 3) {
        // Full pile — 3 stacked cards, click opens flipbook at first photo of pile
        return `
        <div class="gallery-pile" onclick="document.getElementById('fpBook').closest('.fp-stage').scrollIntoView({behavior:'smooth'});fpGoto(${startIdx})" title="View photo ${startIdx+1}">
          <div class="gp-card gp-back"><img src="${esc(pile[2])}" alt="Photo ${startIdx+3}" loading="lazy"/></div>
          <div class="gp-card gp-mid"><img src="${esc(pile[1])}" alt="Photo ${startIdx+2}" loading="lazy"/></div>
          <div class="gp-card gp-front"><img src="${esc(pile[0])}" alt="Photo ${startIdx+1}" loading="lazy"/></div>
          <div class="gp-label">${startIdx+1}–${startIdx+pile.length} of ${galleryImgs.length}</div>
        </div>`;
      } else if (pile.length === 2) {
        return `
        <div class="gallery-pile" onclick="document.getElementById('fpBook').closest('.fp-stage').scrollIntoView({behavior:'smooth'});fpGoto(${startIdx})" title="View photo ${startIdx+1}">
          <div class="gp-card gp-mid" style="transform:rotate(-3.5deg) translate(5px,5px)"><img src="${esc(pile[1])}" alt="Photo ${startIdx+2}" loading="lazy"/></div>
          <div class="gp-card gp-front"><img src="${esc(pile[0])}" alt="Photo ${startIdx+1}" loading="lazy"/></div>
          <div class="gp-label">${startIdx+1}–${startIdx+pile.length} of ${galleryImgs.length}</div>
        </div>`;
      } else {
        return `
        <div class="gallery-card-solo" onclick="document.getElementById('fpBook').closest('.fp-stage').scrollIntoView({behavior:'smooth'});fpGoto(${startIdx})" title="View photo ${startIdx+1}">
          <img src="${esc(pile[0])}" alt="Photo ${startIdx+1}" loading="lazy"/>
          <div class="gallery-card-solo-ov"><span>View ↗</span></div>
        </div>`;
      }
    }).join('');
    return `
  <div class="gallery-grid-wrap">
    <div class="sec-lbl" style="margin-bottom:24px">All Photos</div>
    <div class="gallery-pile-row">${pilesHTML}</div>
  </div>`;
  })() : ''}
</section>

<!-- PAGE: SERVICES -->
${hasServices ? `
<section class="page" id="page-services" ${servicesBg ? `style="background-image:url(${esc(servicesBg)});background-size:cover;background-position:center;"` : ""}>
  <div class="pg-header">
    ${(pf.services && pf.services.length) ? `<div class="sec-lbl">What I Offer</div><div class="sec-ttl">Services &amp; Rates</div>` : ''}
  </div>
  <div class="page-inner">
    ${(pf.services && pf.services.length) ? `<div class="grid">${servicesHTML}</div>` : ''}
    ${catalogueHTML ? `
    <div class="sec-lbl" style="margin-top:${(pf.services && pf.services.length) ? '56px' : '0'}">Ready to Book</div>
    <div class="sec-ttl">Book &amp; Pay</div>
    <p style="opacity:.7;font-size:14px;margin-bottom:24px">Select a package below and pay securely via Stripe.</p>
    <div class="catalogue-grid">${catalogueHTML}</div>` : ''}
    ${(pf.projects && pf.projects.length) ? `
    <div class="sec-lbl" style="margin-top:56px">Portfolio</div>
    <div class="sec-ttl">Selected Work</div>
    <div class="grid">${projectsHTML}</div>` : ''}
    ${(pf.testimonials && pf.testimonials.length) ? `
    <div class="sec-lbl" style="margin-top:56px">Social Proof</div>
    <div class="sec-ttl">What Brands Say</div>
    <div class="grid">${testimonialsHTML}</div>` : ''}
  </div>
</section>` : ''}

<!-- LEGAL MODALS -->
<div class="mo" id="tm" onclick="if(event.target===this)this.classList.remove('show')">
  <div class="mb"><button class="mc" onclick="document.getElementById('tm').classList.remove('show')">✕</button><h2>Terms &amp; Conditions</h2><p>${esc(pf.ai_terms || 'No terms have been set.')}</p></div>
</div>
<div class="mo" id="pm" onclick="if(event.target===this)this.classList.remove('show')">
  <div class="mb"><button class="mc" onclick="document.getElementById('pm').classList.remove('show')">✕</button><h2>Privacy Policy</h2><p>${esc(pf.ai_privacy || 'No privacy policy has been set.')}</p></div>
</div>

<script>
// Hero slideshow
${slideshowScript}

// Page routing
var _activePage = 'page-home';
function showPage(id) {
  var old  = document.getElementById(_activePage);
  var next = document.getElementById(id);
  if (!next) return;
  if (old) old.classList.remove('active');
  next.classList.add('active');
  _activePage = id;
  document.querySelectorAll('.nav-link,.mnav-lk').forEach(function(el) {
    var fn = el.getAttribute('onclick') || '';
    el.classList.toggle('active', fn.indexOf(id) > -1);
  });
  window.scrollTo(0, 0);
}

// Mobile nav
function openMnav()  { document.getElementById('mnavOverlay').classList.add('open'); }
function closeMnav() { document.getElementById('mnavOverlay').classList.remove('open'); }

// Gallery flip-page
var _fpIdx = 0, _fpTotal = ${totalFlipPages}, _fpFlipping = false;
function fpGoto(i) {
  if (_fpFlipping || i === _fpIdx) return;
  _fpFlipping = true;
  var dir = i > _fpIdx ? 1 : -1;
  var steps = Math.abs(i - _fpIdx);
  function flipOne() {
    if (steps-- <= 0) { _fpFlipping = false; return; }
    var cur = _fpIdx;
    var pg  = document.getElementById('fpPage' + cur);
    if (dir > 0) {
      if (pg) { pg.classList.add('flipped'); pg.style.zIndex = (_fpTotal - cur); }
      _fpIdx++;
    } else {
      _fpIdx--;
      var pg2 = document.getElementById('fpPage' + _fpIdx);
      if (pg2) { pg2.classList.remove('flipped'); pg2.style.zIndex = (_fpTotal - _fpIdx); }
    }
    document.querySelectorAll('.fp-dot').forEach(function(d, j) { d.classList.toggle('active', j === _fpIdx); });
    var pb = document.getElementById('fpBtnPrev'), nb = document.getElementById('fpBtnNext');
    if (pb) pb.disabled = _fpIdx === 0;
    if (nb) nb.disabled = _fpIdx >= _fpTotal - 1;
    if (steps > 0) setTimeout(flipOne, 120); else setTimeout(function() { _fpFlipping = false; }, 700);
  }
  flipOne();
}
function fpStep(d) { fpGoto(Math.max(0, Math.min(_fpIdx + d, _fpTotal - 1))); }
document.addEventListener('keydown', function(e) {
  if (_activePage === 'page-gallery') {
    if (e.key === 'ArrowLeft')  fpStep(-1);
    if (e.key === 'ArrowRight') fpStep(1);
  }
});
document.querySelectorAll('.fp-btn-prev').forEach(function(b) { b.id = 'fpBtnPrev'; b.disabled = true; });
document.querySelectorAll('.fp-btn-next').forEach(function(b) { b.id = 'fpBtnNext'; });
var _fpTx = 0, fpBook = document.getElementById('fpBook');
var fpWrap = fpBook ? fpBook.parentElement : null;
if (fpWrap) {
  fpWrap.addEventListener('touchstart', function(e) { _fpTx = e.touches[0].clientX; }, { passive: true });
  fpWrap.addEventListener('touchend',   function(e) { var dx = e.changedTouches[0].clientX - _fpTx; if (Math.abs(dx) > 50) fpStep(dx < 0 ? 1 : -1); });
  fpWrap.addEventListener('click',      function(e) { var r = fpWrap.getBoundingClientRect(); if (e.clientX - r.left > r.width / 2) fpStep(1); else fpStep(-1); });
}

// Intersection observer for animations
var _obs = new IntersectionObserver(function(e) {
  e.forEach(function(x) { if (x.isIntersecting) x.target.classList.add('fu'); });
}, { threshold: 0.1 });
document.querySelectorAll('.card,.social-link,.stat').forEach(function(el) { _obs.observe(el); });
<\/script>
</body>
</html>`;
}


/* ══════════════════════════════════════════════════════════
   SAVE & PUBLISH
══════════════════════════════════════════════════════════ */
async function savePortfolio() {
  if (!psState.activePortfolio) return;
  updatePreviewLive();
  const pf = psState.activePortfolio;
  pf.ai_terms   = val("eLegalTerms")   || pf.ai_terms;
  pf.ai_privacy = val("eLegalPrivacy") || pf.ai_privacy;
  await savePortfolioToDB(pf);
  loadPortfolios();
}

async function publishPortfolio() {
  const pf = psState.activePortfolio;
  if (!pf) return;
  updatePreviewLive();
  pf.published    = true;
  pf.published_at = new Date().toISOString();
  const ok = await savePortfolioToDB(pf);
  if (!ok) return;

  const linkEl = document.getElementById("pubLinkText");
  if (linkEl) linkEl.textContent = `impactgridgroup.com/p.html?slug=${pf.slug}`;

  // These are <div> elements — use textContent not setValue
  const vcEl = document.getElementById("pubViewCount");
  const ecEl = document.getElementById("pubEnqCount");
  const dlEl = document.getElementById("pubDaysLive");
  if (vcEl) vcEl.textContent = "0";
  if (ecEl) ecEl.textContent = "0";
  if (dlEl) dlEl.textContent = "0";

  showScreen("screenPublished");
  spawnConfetti();
  navigator.clipboard.writeText(`https://impactgridgroup.com/p.html?slug=${pf.slug}`).catch(() => {});
  showToast("🚀 Published! Link copied.");
  loadPortfolios();
}

/* ══════════════════════════════════════════════════════════
   SHARE HANDLERS
══════════════════════════════════════════════════════════ */
function copyPublishedLink() {
  const el  = document.getElementById("pubLinkText");
  const url = el ? "https://" + el.textContent : "";
  navigator.clipboard.writeText(url).catch(() => {});
  showToast("✓ Link copied!");
}

function shareToYouTube()  { showToast("📋 Paste your link in your YouTube description!"); }
function shareToTikTok()   { showToast("📋 Paste your link in your TikTok bio!"); }
function shareToLinkedIn() {
  const el  = document.getElementById("pubLinkText");
  const url = el ? "https://" + el.textContent : "";
  window.open("https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(url), "_blank", "width=600,height=500");
}
function shareToInstagram() {
  const el = document.getElementById("pubLinkText");
  navigator.clipboard.writeText(el ? "https://" + el.textContent : "").catch(() => {});
  showToast("📸 Link copied — paste it in your Instagram bio!");
}

/* ══════════════════════════════════════════════════════════
   DEVICE PREVIEW
══════════════════════════════════════════════════════════ */
function setPreviewDevice(device) {
  const frame = document.getElementById("previewFrame");
  const dBtn  = document.getElementById("pdbDesktop");
  const mBtn  = document.getElementById("pdbMobile");
  if (!frame) return;
  frame.classList.toggle("mobile",  device === "mobile");
  frame.classList.toggle("desktop", device !== "mobile");
  dBtn?.classList.toggle("active", device !== "mobile");
  mBtn?.classList.toggle("active", device === "mobile");
}

function openPreviewTab() {
  const pf = psState.activePortfolio;
  if (!pf) return;
  const blob = new Blob([buildPortfolioHTML(pf)], { type:"text/html" });
  window.open(URL.createObjectURL(blob), "_blank");
}

/* ══════════════════════════════════════════════════════════
   UPLOAD
══════════════════════════════════════════════════════════ */
async function handleHeroUpload(event) {
  // Capture files synchronously BEFORE any await — on mobile the browser
  // garbage-collects event.target almost immediately after the event fires,
  // so forEach+async drops the file reference before FileReader can read it.
  const files = Array.from(event.target.files || []);
  if (!files.length || !psState.activePortfolio) return;
  psState.activePortfolio.hero_media = psState.activePortfolio.hero_media || [];

  for (const file of files) {
    // 1. Show a raw preview immediately (feels instant to the user)
    const rawDataUrl = await new Promise(resolve => {
      const r = new FileReader();
      r.onload = e => resolve(e.target.result);
      r.readAsDataURL(file);
    });

    const tempItem = { type: file.type.startsWith('video') ? 'video' : 'image', url: rawDataUrl, credit: 'Uploaded', _uploading: true };
    psState.activePortfolio.hero_media.unshift(tempItem);
    renderHeroMediaStrip(psState.activePortfolio.hero_media);
    updatePreviewLive();
    showToast('Uploading image…');

    // 2. Compress locally then upload to Cloudinary
    try {
      const compressed = await compressImageLocally(rawDataUrl);
      const urls = await uploadToCloudinary(compressed, 'hero', 'hero');

      if (urls) {
        // Replace temp base64 with real Cloudinary URLs
        tempItem.url      = urls.preview;
        tempItem.thumb    = urls.thumb;
        tempItem.original = urls.original;
        delete tempItem._uploading;
        renderHeroMediaStrip(psState.activePortfolio.hero_media);
        updatePreviewLive();
        showToast('✓ Image uploaded');
      } else {
        showToast('Upload failed — image kept as preview only');
      }
    } catch (err) {
      console.warn('[handleHeroUpload] Upload error:', err);
      showToast('Upload failed — image kept as preview only');
    }
  }
}

function dzOver(e, el)   { e.preventDefault(); el.classList.add("over"); }
function dzLeave(el)     { el.classList.remove("over"); }
function dzDrop(e, type) {
  e.preventDefault();
  e.currentTarget.classList.remove("over");
  if (e.dataTransfer.files.length && type === "hero")
    handleHeroUpload({ target: { files: e.dataTransfer.files } });
  if (e.dataTransfer.files.length && type === "gallery")
    handleGalleryUpload({ target: { files: e.dataTransfer.files } });
}

/* ── Gallery media strip ── */
function renderGalleryMediaStrip(media) {
  const strip = document.getElementById("galleryMediaStrip");
  if (!strip) return;
  strip.innerHTML = "";
  (media || []).forEach((m, i) => {
    const thumb = document.createElement("div");
    thumb.className = "hm-thumb";
    thumb.innerHTML = `
      <img src="${m.url}" alt="Gallery ${i+1}" loading="lazy"/>
      <div class="hm-del" onclick="removeGalleryMedia(${i})">✕</div>`;
    strip.appendChild(thumb);
  });
}

function removeGalleryMedia(idx) {
  if (!psState.activePortfolio) return;
  psState.activePortfolio.gallery_media = psState.activePortfolio.gallery_media || [];
  psState.activePortfolio.gallery_media.splice(idx, 1);
  renderGalleryMediaStrip(psState.activePortfolio.gallery_media);
  updatePreviewLive();
}

/* ── Gallery upload handler ── */
async function handleGalleryUpload(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length || !psState.activePortfolio) return;
  psState.activePortfolio.gallery_media = psState.activePortfolio.gallery_media || [];

  for (const file of files) {
    const rawDataUrl = await new Promise(resolve => {
      const r = new FileReader();
      r.onload = e => resolve(e.target.result);
      r.readAsDataURL(file);
    });

    const tempItem = { type: 'image', url: rawDataUrl, _uploading: true };
    psState.activePortfolio.gallery_media.push(tempItem);
    renderGalleryMediaStrip(psState.activePortfolio.gallery_media);
    updatePreviewLive();
    showToast('Uploading gallery image…');

    try {
      const compressed = await compressImageLocally(rawDataUrl);
      const urls = await uploadToCloudinary(compressed, 'gallery', 'gallery');
      if (urls) {
        tempItem.url      = urls.preview;
        tempItem.thumb    = urls.thumb;
        tempItem.original = urls.original;
        delete tempItem._uploading;
        renderGalleryMediaStrip(psState.activePortfolio.gallery_media);
        updatePreviewLive();
        showToast('✓ Gallery image uploaded');
      } else {
        showToast('Upload failed — image kept as preview only');
      }
    } catch (err) {
      console.warn('[handleGalleryUpload] Upload error:', err);
      showToast('Upload failed — image kept as preview only');
    }
  }
}

/* ── Profile photo upload handler ── */
async function handleProfilePhotoUpload(event) {
  const file = (event.target.files || [])[0];
  if (!file || !psState.activePortfolio) return;

  const rawDataUrl = await new Promise(resolve => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.readAsDataURL(file);
  });

  // Show preview immediately
  window._profilePhotoDataUrl = rawDataUrl;
  psState.activePortfolio.profile_photo_url = rawDataUrl;
  const ppPrev = document.getElementById('profilePhotoPrev');
  if (ppPrev) { ppPrev.src = rawDataUrl; ppPrev.style.display = 'block'; }
  const ppPlaceholder = document.getElementById('profilePhotoPlaceholder');
  if (ppPlaceholder) ppPlaceholder.style.display = 'none';
  updatePreviewLive();
  showToast('Uploading profile photo…');

  try {
    const compressed = await compressImageLocally(rawDataUrl, 800);
    const urls = await uploadToCloudinary(compressed, 'profile', 'profile');
    if (urls) {
      window._profilePhotoDataUrl           = urls.preview;
      psState.activePortfolio.profile_photo_url = urls.preview;
      if (ppPrev) ppPrev.src = urls.preview;
      updatePreviewLive();
      showToast('✓ Profile photo uploaded');
    }
  } catch (err) {
    console.warn('[handleProfilePhotoUpload] Upload error:', err);
    showToast('Profile photo kept as local preview only');
  }
}

/* ══════════════════════════════════════════════════════════
   CONFETTI
══════════════════════════════════════════════════════════ */
function spawnConfetti() {
  const container = document.getElementById("pubConfetti");
  if (!container) return;
  container.innerHTML = "";
  const colors = ["#c97e08","#e8a020","#f0ede8","#22c55e","#2563eb","#e91e8c"];
  for (let i = 0; i < 80; i++) {
    const p    = document.createElement("div");
    const size = Math.random() * 10 + 4;
    p.style.cssText = `position:absolute;width:${size}px;height:${size}px;background:${colors[Math.floor(Math.random()*colors.length)]};border-radius:${Math.random()>.5?"50%":"2px"};left:${Math.random()*100}%;top:-20px;animation:cFall ${Math.random()*2+1.5}s linear ${Math.random()*.5}s forwards;opacity:${Math.random()*.7+.3}`;
    container.appendChild(p);
  }
  if (!document.getElementById("cKF")) {
    const s = document.createElement("style");
    s.id = "cKF";
    s.textContent = `@keyframes cFall{to{transform:translateY(500px) rotate(720deg);opacity:0}}`;
    document.head.appendChild(s);
  }
}

/* ══════════════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════════════ */
function esc(s)        { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
function cleanCta(s)   { return esc(String(s||'').replace(/\s*\(mailto:[^)]*\)/gi,'').replace(/\s*\[([^\]]*)]\([^)]*\)/g,'$1').trim()); }
function val(id)       { const el = document.getElementById(id); return el ? el.value : ""; }
function setValue(id,v){ const el = document.getElementById(id); if (el) el.value = v || ""; }
function sleep(ms)     { return new Promise(r => setTimeout(r, ms)); }
function showToast(msg){ const s = document.getElementById("psToastShelf"); if(!s) return; const t=document.createElement("div"); t.className="ps-toast"; t.textContent=msg; s.appendChild(t); setTimeout(()=>t.remove(),3000); }
// toggleTheme() is defined in nav.js — do not redefine here

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  addServiceRow("obServicesList");
  loadPortfolios();
  psBannerInit(); // populate plan banner from window.igUser (may be null at this point — refreshed on ig-user-ready)

  // Onboard colour picker sync
  const cp = document.getElementById("obAccentColor");
  if (cp) cp.addEventListener("input", e => {
    const cv = document.getElementById("obColorVal");
    if (cv) cv.textContent = e.target.value;
  });

  // Builder colour picker sync
  const ecp = document.getElementById("eAccentColor");
  if (ecp) ecp.addEventListener("input", e => {
    const ecv = document.getElementById("eColorVal");
    if (ecv) ecv.textContent = e.target.value;
    if (psState.activePortfolio) psState.activePortfolio.accent_color = e.target.value;
    updatePreviewLive();
  });

  // Keep Render server warm (same as carousel-studio.js)
  setInterval(() => { fetch(DIJO_SERVER + "/ping").catch(() => {}); }, 600000);

  obValidate();
});

/* ── Nav sync: once igUser is resolved, reload portfolios with real user_id ── */
document.addEventListener('ig-user-ready', function(e) {
  // Clear the session-scoped cache so we re-fetch with the real user_id
  try { localStorage.removeItem('ig_portfolios_cache'); } catch (_) {}
  // Re-load portfolios now that we have a real user_id to filter by
  loadPortfolios();
  // Refresh the plan banner with the now-populated igUser data
  psBannerInit();
  // After portfolios reload, mark expired cards for free users
  // Small delay so renderDashGrid() has finished inserting the cards
  setTimeout(psMarkExpiredPortfolios, 300);
});

/* ── Contact Form ── */
function openContactForm(){
  document.getElementById("contactModal").style.display = "flex";
}

function closeContactForm(){
  document.getElementById("contactModal").style.display = "none";
}

async function sendInquiry(){
  const nameEl    = document.getElementById("cName");
  const emailEl   = document.getElementById("cEmail");
  const msgEl     = document.getElementById("cMsg");
  const sendBtn   = document.querySelector("#contactModal button");
  const statusEl  = document.getElementById("cStatus");

  const name    = (nameEl  && nameEl.value.trim())  || "";
  const email   = (emailEl && emailEl.value.trim())  || "";
  const message = (msgEl   && msgEl.value.trim())    || "";

  // Clear previous status
  if (statusEl) { statusEl.textContent = ""; statusEl.style.color = ""; }

  // Validate all fields
  if (!name || !email || !message) {
    if (statusEl) { statusEl.textContent = "Please fill in all fields."; statusEl.style.color = "#f87171"; }
    return;
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (statusEl) { statusEl.textContent = "Please enter a valid email address."; statusEl.style.color = "#f87171"; }
    return;
  }

  const creatorEmail = psState.activePortfolio && psState.activePortfolio.email;
  if (!creatorEmail) {
    if (statusEl) { statusEl.textContent = "Creator email not set — cannot send."; statusEl.style.color = "#f87171"; }
    return;
  }

  // Disable button while sending
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "Sending…"; }

  try {
    const res = await fetch("https://impactgrid-dijo.onrender.com/contact/send", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, message, creatorEmail })
    });

    const data = await res.json();

    if (data.success) {
      showToast("Inquiry sent 🚀");
      // Clear the form
      if (nameEl)  nameEl.value  = "";
      if (emailEl) emailEl.value = "";
      if (msgEl)   msgEl.value   = "";
      closeContactForm();
    } else {
      if (statusEl) { statusEl.textContent = "Failed to send — please try again."; statusEl.style.color = "#f87171"; }
    }

  } catch(err) {
    console.error("[sendInquiry]", err);
    if (statusEl) { statusEl.textContent = "Server error — please try again."; statusEl.style.color = "#f87171"; }
  } finally {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Send"; }
  }
}

/* ══════════════════════════════════════════════════════════
   UPGRADE BAR — delegates to plan-gate.js
   showUpgradeBar(message, isLoggedIn)
   isLoggedIn true  → plan limit hit → "Upgrade plan" + "See details"
   isLoggedIn false → not authenticated → "Sign in"
   plan-gate.js must be loaded before this file.
══════════════════════════════════════════════════════════ */
function showUpgradeBar(message, isLoggedIn) {
  if (typeof window.showUpgradeBar_gate === 'function') {
    window.showUpgradeBar_gate(message, isLoggedIn);
  } else {
    // Fallback if plan-gate.js isn't loaded yet
    var q = window._pgQueue = window._pgQueue || [];
    q.push([message, isLoggedIn, {}]);
  }
}

// Upgrade bar styles are handled by plan-gate.js (#igUpgradeBar)

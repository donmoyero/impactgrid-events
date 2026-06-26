// ═══════════════════════════════════════════════════════
//  clients-auth.js
//  Add this route file to impactgrid-dijo backend.
//
//  Mount it in your main server file (wherever you do
//  app.use('/api/...', ...)) like:
//
//    const clientsAuthRoutes = require('./routes/clients-auth');
//    app.use('/api/clients', clientsAuthRoutes);
//
//  REQUIRED ENV VAR (set this in Render → Environment):
//    SUPABASE_SERVICE_ROLE_KEY  — from Supabase dashboard →
//    Settings → API → service_role key (the SECRET one, not anon).
//    NEVER put this key in any frontend file.
//
//  Also requires (you likely already have these):
//    SUPABASE_URL
//    ADMIN_EMAIL  (defaults to admin@impactgridgroup.com if unset)
// ═══════════════════════════════════════════════════════

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL   = process.env.ADMIN_EMAIL || 'admin@impactgridgroup.com';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.warn('[clients-auth] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — this route will fail.');
}

// Service-role client — full power, server-side only, never exposed to browser.
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ── Generates a short, readable code (avoids confusing chars like 0/O/1/I) ──
function generateLoginCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── Middleware: only YOU (the admin) can call these routes ──────────────
// Verifies the caller's Supabase access token and checks their email.
async function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Missing auth token' });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid session' });

    if (data.user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    next();
  } catch (e) {
    res.status(500).json({ error: 'Auth check failed: ' + e.message });
  }
}

// ── POST /api/clients/create-login ───────────────────────────────────────
// body: { email, label }
// Creates the client's Supabase account if it doesn't exist (or resets
// their code if it does), returns the plain-text code to show the admin.
router.post('/create-login', requireAdmin, async (req, res) => {
  try {
    const { email, label } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    const code = generateLoginCode();

    // Check if a user with this email already exists.
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) return res.status(500).json({ error: listErr.message });

    const existing = list.users.find(u => u.email === email);

    if (existing) {
      // Reset their password to the new code.
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        password: code,
        user_metadata: { ...existing.user_metadata, role: 'client', label: label || existing.user_metadata?.label }
      });
      if (updErr) return res.status(500).json({ error: updErr.message });
      return res.json({ code, email, created: false, userId: existing.id });
    }

    // Create a new client account, pre-confirmed (no email verification step needed).
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: code,
      email_confirm: true,
      user_metadata: { role: 'client', label: label || null }
    });
    if (createErr) return res.status(500).json({ error: createErr.message });

    res.json({ code, email, created: true, userId: created.user.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/clients/regenerate-code ────────────────────────────────────
// body: { email }
// Use this if a client loses their code — issues a fresh one.
router.post('/regenerate-code', requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) return res.status(500).json({ error: listErr.message });

    const existing = list.users.find(u => u.email === email);
    if (!existing) return res.status(404).json({ error: 'No account found for that email' });

    const code = generateLoginCode();
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, { password: code });
    if (updErr) return res.status(500).json({ error: updErr.message });

    res.json({ code, email });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

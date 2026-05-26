/* ═══════════════════════════════════════════════════════
   ImpactGrid — Supabase Client

   ALL calls → exeiojgldxqaakkybdij (new project, unrestricted)

   getSupabase()      – main client (auth + data)
   getAuthClient()    – alias of getSupabase()
   getContentClient() – alias of getSupabase()

   Load order: Supabase SDK <script> must come before this file.
═══════════════════════════════════════════════════════ */

var _SUPABASE_URL  = 'https://exeiojgldxqaakkybdij.supabase.co';
var _SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4ZWlvamdsZHhxYWFra3liZGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNDc4NTcsImV4cCI6MjA4ODkyMzg1N30.aRXgeHqaOxkidwpWVGEOKBQAeo9_C5Fk3Gu5ZlbmxTQ';

var _client = null;

function getSupabase() {
  if (window.supabaseClient) return window.supabaseClient;
  if (_client) return _client;

  if (typeof supabase === 'undefined' || typeof supabase.createClient !== 'function') {
    console.error('[supabase-config] Supabase SDK not loaded — place SDK <script> before supabase-config.js');
    return null;
  }

  try {
    _client = supabase.createClient(_SUPABASE_URL, _SUPABASE_KEY, {
      auth: {
        persistSession    : true,
        autoRefreshToken  : true,
        detectSessionInUrl: true,
        storageKey        : 'ig-auth-token'
      }
    });
    window.supabaseClient = _client;
  } catch (e) {
    console.error('[supabase-config] Failed to create client:', e.message);
    return null;
  }

  return _client;
}

/* Aliases — all three names hit the same client */
function getAuthClient()    { return getSupabase(); }
function getContentClient() { return getSupabase(); }

window.getSupabase      = getSupabase;
window.getAuthClient    = getAuthClient;
window.getContentClient = getContentClient;

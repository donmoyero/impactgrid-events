/* ═══════════════════════════════════════════════════════════
   ImpactGrid — review-emails-script.js
   Admin panel: history of all review-request emails sent
   (auto, manual, cron), click into one to view/edit/resend,
   plus a form to send one to any email address on demand
   (event picked from a dropdown — no URL pasting required).

   Reads from Supabase `review_email_log` directly.
   Sending/resending goes through the backend (routes/api.js)
   since that's where Resend + Groq credentials live, and is
   guarded there by a real Supabase admin-session check.
   Exposes: loadReviewEmailLog()
═══════════════════════════════════════════════════════════ */

(function () {

  var _log      = [];
  var _events    = [];
  var _loading   = false;

  /* ── Auth header helper — every send/resend call must prove
     it's really the logged-in admin, not just localStorage. ── */
  async function _authHeader() {
    var c = getSupabase();
    var { data } = await c.auth.getSession();
    var token = data && data.session ? data.session.access_token : null;
    return token ? { 'Authorization': 'Bearer ' + token } : {};
  }

  window.loadReviewEmailLog = async function () {
    if (_loading) return;
    _loading = true;
    _renderSkeleton();
    _loadEventOptions();

    try {
      var c = getSupabase();
      var { data, error } = await c
        .from('review_email_log')
        .select('id, guest_email, event_name, ai_message, review_url, source, status, error, sent_at, resent_at, resend_count')
        .order('sent_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      _log = data || [];
      _renderTable();
    } catch (e) {
      _renderError(e.message);
    } finally {
      _loading = false;
    }
  };

  /* ── Populate the event picker for the adhoc-send form ──── */
  async function _loadEventOptions() {
    var sel = document.getElementById('adhoc-event-select');
    if (!sel) return;
    try {
      var c = getSupabase();
      var { data, error } = await c
        .from('events')
        .select('id, name, event_slug, event_code')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      _events = data || [];
      sel.innerHTML = '<option value="">Select an event…</option>' +
        _events.map(function (ev) {
          return '<option value="' + ev.id + '">' + _esc(ev.name) + '</option>';
        }).join('');
    } catch (e) {
      sel.innerHTML = '<option value="">Couldn\'t load events</option>';
    }
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _sourceLabel(s) {
    return {
      auto        : '⏱ Auto (after event ready)',
      manual      : '👤 Manual (per request)',
      manual_adhoc: '✍️ Manual (any email)',
      cron        : '🔁 Cron safety-net'
    }[s] || s || '—';
  }

  function _renderSkeleton() {
    var el = document.getElementById('review-emails-table-wrap');
    if (!el) return;
    el.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:10px;">' +
        [1,2,3].map(function(){
          return '<div style="height:60px;border-radius:var(--r);background:var(--bg2);animation:pulse 1.4s ease infinite;"></div>';
        }).join('') +
      '</div>';
  }

  function _renderError(msg) {
    var el = document.getElementById('review-emails-table-wrap');
    if (!el) return;
    el.innerHTML = '<div class="empty"><div class="empty-ico">⚠️</div><div class="empty-txt">' + _esc(msg) + '</div></div>';
  }

  function _renderTable() {
    var el = document.getElementById('review-emails-table-wrap');
    if (!el) return;

    if (!_log.length) {
      el.innerHTML = '<div class="empty"><div class="empty-ico">📧</div><div class="empty-txt">No review request emails sent yet.</div></div>';
      return;
    }

    el.innerHTML = '<table><thead><tr><th>Guest Email</th><th>Event</th><th>AI Message Preview</th><th>Source</th><th>Status</th><th>Sent</th><th>Actions</th></tr></thead><tbody>'
      + _log.map(function (r) {
          var sentDate = r.sent_at ? new Date(r.sent_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—';
          var statusPill = r.status === 'failed'
            ? '<span class="pill pill-rejected">Failed</span>'
            : '<span class="pill pill-active">Sent' + (r.resend_count ? ' ×' + (r.resend_count + 1) : '') + '</span>';
          var preview = (r.ai_message || '').slice(0, 60);
          if ((r.ai_message || '').length > 60) preview += '…';
          return '<tr>'
            + '<td style="font-weight:600;">' + _esc(r.guest_email) + '</td>'
            + '<td>' + _esc(r.event_name || '—') + '</td>'
            + '<td style="font-size:11px;color:var(--text3);max-width:220px;">' + _esc(preview) + '</td>'
            + '<td style="font-size:11px;color:var(--text3);">' + _sourceLabel(r.source) + '</td>'
            + '<td>' + statusPill + '</td>'
            + '<td style="color:var(--text3);font-size:12px;">' + sentDate + (r.resent_at ? '<br><span style="font-size:10px;">resent ' + new Date(r.resent_at).toLocaleDateString('en-GB') + '</span>' : '') + '</td>'
            + '<td><button class="btn btn-ghost btn-sm" onclick="viewReviewEmail(\'' + r.id + '\')">👁 Preview / Resend</button></td>'
            + '</tr>';
        }).join('')
      + '</tbody></table>';
  }

  /* ── View / edit / resend modal ─────────────────────────── */
  window.viewReviewEmail = function (id) {
    var r = _log.find(function (x) { return x.id === id; });
    if (!r) return;

    document.getElementById('remail-id').value       = r.id;
    document.getElementById('remail-to').textContent  = r.guest_email;
    document.getElementById('remail-event').textContent = r.event_name || '—';
    document.getElementById('remail-message').value   = r.ai_message || '';
    document.getElementById('remail-status').textContent =
      r.status === 'failed' ? ('Failed to send — ' + (r.error || 'unknown error')) : 'Sent successfully';

    var modal = document.getElementById('reviewEmailModal');
    if (modal) modal.style.display = 'flex';
  };

  window.closeReviewEmailModal = function () {
    var modal = document.getElementById('reviewEmailModal');
    if (modal) modal.style.display = 'none';
  };

  window.resendReviewEmailFromModal = async function () {
    var id      = document.getElementById('remail-id').value;
    var message = document.getElementById('remail-message').value.trim();
    var btn     = document.getElementById('remail-resendBtn');

    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      var authHdr = await _authHeader();
      var res  = await fetch(EVENTS_API + '/api/resend-review-email', {
        method : 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHdr),
        body   : JSON.stringify({ logId: id, customMessage: message })
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server error');

      toast('✅', 'Review request resent!', '');
      closeReviewEmailModal();
      loadReviewEmailLog();
    } catch (e) {
      toast('❌', 'Failed to resend', e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📤 Resend'; }
    }
  };

  /* ── Manual ad-hoc send (any email, not tied to a request) ──
     Admin just picks the event from a dropdown and types the
     guest's email — the gallery link is built automatically. ── */
  window.sendAdhocReviewRequest = async function () {
    var email  = document.getElementById('adhoc-email').value.trim();
    var evId   = document.getElementById('adhoc-event-select').value;
    var btn    = document.getElementById('adhoc-sendBtn');

    if (!email || !evId) {
      toast('⚠️', 'Missing info', 'Guest email and event are required');
      return;
    }

    var ev = _events.find(function (e) { return String(e.id) === String(evId); });
    if (!ev) { toast('⚠️', 'Event not found', 'Try reloading the page'); return; }

    var eventUrl = location.origin + '/event.html?event=' + ev.event_slug + '&code=' + ev.event_code;

    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      var authHdr = await _authHeader();
      var res  = await fetch(EVENTS_API + '/api/send-review-request-adhoc', {
        method : 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHdr),
        body   : JSON.stringify({ guestEmail: email, eventName: ev.name, eventUrl: eventUrl })
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server error');

      toast('✅', 'Review request sent!', email + ' will get an email asking for a review');
      document.getElementById('adhoc-email').value = '';
      document.getElementById('adhoc-event-select').value = '';
      loadReviewEmailLog();
    } catch (e) {
      toast('❌', 'Failed to send', e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '⭐ Send Review Request'; }
    }
  };

})();

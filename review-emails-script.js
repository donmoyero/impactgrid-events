/* ═══════════════════════════════════════════════════════════
   ImpactGrid — review-emails-script.js
   Admin panel: history of all review-request emails sent
   (auto, manual, cron), click into one to view/edit/resend,
   plus a manual "send to any email" form.

   Reads from Supabase `review_email_log` directly.
   Sending/resending goes through the backend (routes/api.js)
   since that's where Resend + Groq credentials live.
   Exposes: loadReviewEmailLog()
═══════════════════════════════════════════════════════════ */

(function () {

  var _log     = [];
  var _loading = false;

  window.loadReviewEmailLog = async function () {
    if (_loading) return;
    _loading = true;
    _renderSkeleton();

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

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _sourceLabel(s) {
    return {
      auto        : '⏱ Auto (after approval)',
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

    el.innerHTML = '<table><thead><tr><th>Guest Email</th><th>Event</th><th>Source</th><th>Status</th><th>Sent</th><th>Actions</th></tr></thead><tbody>'
      + _log.map(function (r) {
          var sentDate = r.sent_at ? new Date(r.sent_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—';
          var statusPill = r.status === 'failed'
            ? '<span class="pill pill-rejected">Failed</span>'
            : '<span class="pill pill-active">Sent' + (r.resend_count ? ' ×' + (r.resend_count + 1) : '') + '</span>';
          return '<tr>'
            + '<td style="font-weight:600;">' + _esc(r.guest_email) + '</td>'
            + '<td>' + _esc(r.event_name || '—') + '</td>'
            + '<td style="font-size:11px;color:var(--text3);">' + _sourceLabel(r.source) + '</td>'
            + '<td>' + statusPill + '</td>'
            + '<td style="color:var(--text3);font-size:12px;">' + sentDate + (r.resent_at ? '<br><span style="font-size:10px;">resent ' + new Date(r.resent_at).toLocaleDateString('en-GB') + '</span>' : '') + '</td>'
            + '<td><button class="btn btn-ghost btn-sm" onclick="viewReviewEmail(\'' + r.id + '\')">👁 View / Resend</button></td>'
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
      var res  = await fetch(EVENTS_API + '/api/resend-review-email', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  /* ── Manual ad-hoc send (any email, not tied to a request) ── */
  window.sendAdhocReviewRequest = async function () {
    var email    = document.getElementById('adhoc-email').value.trim();
    var evName   = document.getElementById('adhoc-event-name').value.trim();
    var evUrl    = document.getElementById('adhoc-event-url').value.trim();
    var btn      = document.getElementById('adhoc-sendBtn');

    if (!email || !evUrl) {
      toast('⚠️', 'Missing info', 'Guest email and event gallery link are required');
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      var res  = await fetch(EVENTS_API + '/api/send-review-request-adhoc', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ guestEmail: email, eventName: evName, eventUrl: evUrl })
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server error');

      toast('✅', 'Review request sent!', email + ' will get an email asking for a review');
      document.getElementById('adhoc-email').value = '';
      document.getElementById('adhoc-event-name').value = '';
      document.getElementById('adhoc-event-url').value = '';
      loadReviewEmailLog();
    } catch (e) {
      toast('❌', 'Failed to send', e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '⭐ Send Review Request'; }
    }
  };

})();

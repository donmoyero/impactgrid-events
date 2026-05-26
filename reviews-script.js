/* ═══════════════════════════════════════════════════════════
   ImpactGrid — reviews-script.js
   Admin panel: view, approve, and delete event reviews.
   Reads from / writes to the `event_reviews` Supabase table.
   Exposes: loadEventReviews()
═══════════════════════════════════════════════════════════ */

(function () {

  var _reviews     = [];
  var _filter      = 'pending'; // 'pending' | 'approved' | 'all'
  var _loading     = false;

  /* ── Load & render ──────────────────────────────────────── */
  window.loadEventReviews = async function () {
    if (_loading) return;
    _loading = true;
    _renderSkeleton();

    try {
      var c = getSupabase();
      var q = c.from('event_reviews')
        .select('id, reviewer_name, event_name, rating, message, approved, created_at')
        .order('created_at', { ascending: false });

      var { data, error } = await q;
      if (error) throw error;

      _reviews = data || [];
      _updateBadge(_reviews.filter(function(r){ return !r.approved; }).length);
      _renderTable();
    } catch (e) {
      _renderError(e.message);
    } finally {
      _loading = false;
    }
  };

  /* ── Approve ────────────────────────────────────────────── */
  window.approveReview = async function (id) {
    var btn = document.getElementById('rev-approve-' + id);
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      var { error } = await getSupabase()
        .from('event_reviews')
        .update({ approved: true, approved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      var r = _reviews.find(function(x){ return x.id === id; });
      if (r) r.approved = true;
      _updateBadge(_reviews.filter(function(r){ return !r.approved; }).length);
      _renderTable();
      toast('✅', 'Review approved', 'Now visible on the homepage');
    } catch (e) {
      toast('❌', 'Failed to approve', e.message);
      if (btn) { btn.disabled = false; btn.textContent = '✓ Approve'; }
    }
  };

  /* ── Delete ─────────────────────────────────────────────── */
  window.deleteReview = async function (id) {
    if (!confirm('Delete this review permanently?')) return;
    try {
      var { error } = await getSupabase()
        .from('event_reviews')
        .delete()
        .eq('id', id);
      if (error) throw error;
      _reviews = _reviews.filter(function(r){ return r.id !== id; });
      _updateBadge(_reviews.filter(function(r){ return !r.approved; }).length);
      _renderTable();
      toast('🗑️', 'Review deleted', '');
    } catch (e) {
      toast('❌', 'Failed to delete', e.message);
    }
  };

  /* ── Filter tabs ────────────────────────────────────────── */
  window.setReviewFilter = function (f) {
    _filter = f;
    ['pending','approved','all'].forEach(function(tab) {
      var btn = document.getElementById('rev-tab-' + tab);
      if (!btn) return;
      btn.style.background = (tab === f) ? 'var(--card)' : 'transparent';
      btn.style.color      = (tab === f) ? 'var(--text)'  : 'var(--text2)';
      btn.style.boxShadow  = (tab === f) ? 'var(--sh)'    : 'none';
    });
    _renderTable();
  };

  /* ── Internal helpers ───────────────────────────────────── */
  function _filtered() {
    if (_filter === 'pending')  return _reviews.filter(function(r){ return !r.approved; });
    if (_filter === 'approved') return _reviews.filter(function(r){ return  r.approved; });
    return _reviews;
  }

  function _updateBadge(n) {
    var el = document.getElementById('reviewsBadge');
    if (!el) return;
    el.textContent = n;
    el.style.display = n > 0 ? 'inline-flex' : 'none';
  }

  function _stars(n) {
    var s = '';
    for (var i = 1; i <= 5; i++) s += (i <= n ? '★' : '☆');
    return s;
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _renderSkeleton() {
    var el = document.getElementById('reviews-table-wrap');
    if (!el) return;
    el.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:10px;">' +
        [1,2,3].map(function(){
          return '<div style="height:72px;border-radius:var(--r);background:var(--bg2);animation:pulse 1.4s ease infinite;"></div>';
        }).join('') +
      '</div>';
  }

  function _renderError(msg) {
    var el = document.getElementById('reviews-table-wrap');
    if (!el) return;
    el.innerHTML = '<div class="empty"><div class="empty-ico">⚠️</div><div class="empty-txt">' + _esc(msg) + '</div></div>';
  }

  function _renderTable() {
    var el = document.getElementById('reviews-table-wrap');
    if (!el) return;

    var rows = _filtered();

    /* Update filter counts */
    var pending  = _reviews.filter(function(r){ return !r.approved; }).length;
    var approved = _reviews.filter(function(r){ return  r.approved; }).length;
    var countEl;
    countEl = document.getElementById('rev-count-pending');  if (countEl) countEl.textContent = pending;
    countEl = document.getElementById('rev-count-approved'); if (countEl) countEl.textContent = approved;
    countEl = document.getElementById('rev-count-all');      if (countEl) countEl.textContent = _reviews.length;

    if (!rows.length) {
      el.innerHTML = '<div class="empty"><div class="empty-ico">⭐</div><div class="empty-txt">' +
        (_filter === 'pending' ? 'No pending reviews — all caught up!' :
         _filter === 'approved' ? 'No approved reviews yet.' : 'No reviews yet.') +
        '</div></div>';
      return;
    }

    el.innerHTML = rows.map(function(r) {
      var date = r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—';
      var isPending = !r.approved;
      return '<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:16px 18px;margin-bottom:10px;">' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">' +
          '<div style="min-width:0;">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">' +
              '<span style="font-size:14px;font-weight:700;">' + _esc(r.reviewer_name || 'Anonymous') + '</span>' +
              (r.event_name ? '<span style="font-size:11px;color:var(--text3);font-family:var(--fm);">📸 ' + _esc(r.event_name) + '</span>' : '') +
              '<span style="font-size:11px;color:var(--text3);font-family:var(--fm);">' + date + '</span>' +
              (isPending
                ? '<span style="font-size:10px;background:var(--gold-dim);color:var(--gold);border:1px solid var(--gold-glo);padding:2px 7px;border-radius:5px;font-family:var(--fm);letter-spacing:.04em;">PENDING</span>'
                : '<span style="font-size:10px;background:var(--green-dim);color:var(--green);border:1px solid rgba(15,168,118,.2);padding:2px 7px;border-radius:5px;font-family:var(--fm);letter-spacing:.04em;">APPROVED</span>') +
            '</div>' +
            '<div style="color:var(--gold);font-size:14px;margin-bottom:6px;">' + _stars(r.rating) + '</div>' +
            (r.message ? '<div style="font-size:13px;color:var(--text2);line-height:1.6;">' + _esc(r.message) + '</div>' : '') +
          '</div>' +
          '<div style="display:flex;gap:6px;flex-shrink:0;">' +
            (isPending
              ? '<button id="rev-approve-' + r.id + '" class="btn btn-green btn-sm" onclick="approveReview(\'' + r.id + '\')">✓ Approve</button>'
              : '') +
            '<button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="deleteReview(\'' + r.id + '\')">🗑 Delete</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

})();

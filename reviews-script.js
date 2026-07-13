/* ═══════════════════════════════════════════════════════════
   ImpactGrid — reviews-script.js
   Admin panel: view, edit, reorder, and delete every review.
   No approval gate — every submitted review is live on the
   homepage immediately; admin can only edit, reorder, delete.
   Reads from / writes to the `event_reviews` Supabase table.
   Exposes: loadEventReviews()
═══════════════════════════════════════════════════════════ */

(function () {

  var _reviews = [];
  var _loading = false;

  /* ── Load & render ──────────────────────────────────────── */
  window.loadEventReviews = async function () {
    if (_loading) return;
    _loading = true;
    _renderSkeleton();

    try {
      var c = getSupabase();
      var q = c.from('event_reviews')
        .select('id, reviewer_name, event_name, rating, message, position, created_at')
        .order('position', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

      var { data, error } = await q;
      if (error) throw error;

      _reviews = data || [];
      _renderTable();
    } catch (e) {
      _renderError(e.message);
    } finally {
      _loading = false;
    }
  };

  /* ── Delete ─────────────────────────────────────────────── */
  window.deleteReview = async function (id) {
    if (!confirm('Delete this review permanently? This also removes it from the homepage.')) return;
    try {
      var { error } = await getSupabase()
        .from('event_reviews')
        .delete()
        .eq('id', id);
      if (error) throw error;
      _reviews = _reviews.filter(function(r){ return r.id !== id; });
      _renderTable();
      toast('🗑️', 'Review deleted', '');
    } catch (e) {
      toast('❌', 'Failed to delete', e.message);
    }
  };

  /* ── Reorder (move up / down on the homepage) ───────────── */
  window.moveReview = async function (id, dir) {
    var idx = _reviews.findIndex(function (r) { return r.id === id; });
    if (idx === -1) return;
    var swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= _reviews.length) return;

    var a = _reviews[idx], b = _reviews[swapIdx];

    /* Assign clean sequential positions to the whole list on first
       reorder, in case some rows still have a null position. */
    _reviews.forEach(function (r, i) { r.position = i; });
    var tmp = _reviews[idx].position;
    _reviews[idx].position = _reviews[swapIdx].position;
    _reviews[swapIdx].position = tmp;

    _reviews.sort(function (x, y) { return x.position - y.position; });
    _renderTable();

    try {
      var c = getSupabase();
      await Promise.all(_reviews.map(function (r) {
        return c.from('event_reviews').update({ position: r.position }).eq('id', r.id);
      }));
    } catch (e) {
      toast('❌', 'Failed to save order', e.message);
      loadEventReviews();
    }
  };

  /* ── Internal helpers ───────────────────────────────────── */
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

    var countEl = document.getElementById('rev-count-all');
    if (countEl) countEl.textContent = _reviews.length;

    if (!_reviews.length) {
      el.innerHTML = '<div class="empty"><div class="empty-ico">⭐</div><div class="empty-txt">No reviews yet.</div></div>';
      return;
    }

    el.innerHTML = _reviews.map(function (r, i) {
      var date = r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—';
      return '<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:16px 18px;margin-bottom:10px;">' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">' +
          '<div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0;">' +
            '<button class="btn btn-ghost btn-sm" style="padding:2px 8px;" ' + (i === 0 ? 'disabled' : '') + ' onclick="moveReview(\'' + r.id + '\',\'up\')">▲</button>' +
            '<button class="btn btn-ghost btn-sm" style="padding:2px 8px;" ' + (i === _reviews.length - 1 ? 'disabled' : '') + ' onclick="moveReview(\'' + r.id + '\',\'down\')">▼</button>' +
          '</div>' +
          '<div style="min-width:0;flex:1;">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">' +
              '<span style="font-size:14px;font-weight:700;">' + _esc(r.reviewer_name || 'Anonymous') + '</span>' +
              (r.event_name ? '<span style="font-size:11px;color:var(--text3);font-family:var(--fm);">📸 ' + _esc(r.event_name) + '</span>' : '') +
              '<span style="font-size:11px;color:var(--text3);font-family:var(--fm);">' + date + '</span>' +
            '</div>' +
            '<div style="color:var(--gold);font-size:14px;margin-bottom:6px;">' + _stars(r.rating) + '</div>' +
            (r.message ? '<div style="font-size:13px;color:var(--text2);line-height:1.6;">' + _esc(r.message) + '</div>' : '') +
          '</div>' +
          '<div style="display:flex;gap:6px;flex-shrink:0;">' +
            '<button class="btn btn-ghost btn-sm" onclick="editReview(\'' + r.id + '\')">✏ Edit</button>' +
            '<button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="deleteReview(\'' + r.id + '\')">🗑 Delete</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ── Edit ───────────────────────────────────────────────── */
  window.editReview = function (id) {
    var r = _reviews.find(function (x) { return x.id === id; });
    if (!r) return;

    document.getElementById('revEdit-id').value          = r.id;
    document.getElementById('revEdit-reviewer').value     = r.reviewer_name || '';
    document.getElementById('revEdit-event').value        = r.event_name || '';
    document.getElementById('revEdit-message').value      = r.message || '';
    _setEditStars(r.rating || 5);

    var modal = document.getElementById('reviewEditModal');
    if (modal) modal.style.display = 'flex';
  };

  window.closeReviewEditModal = function () {
    var modal = document.getElementById('reviewEditModal');
    if (modal) modal.style.display = 'none';
  };

  var _editRating = 5;
  window._setEditStars = _setEditStars;
  function _setEditStars(n) {
    _editRating = n;
    document.getElementById('revEdit-rating').value = n;
    var stars = document.querySelectorAll('#revEdit-starPicker .star-pick');
    stars.forEach(function (s) {
      var v = parseInt(s.getAttribute('data-v'), 10);
      s.textContent = v <= n ? '★' : '☆';
    });
  }

  window.saveReviewEdit = async function () {
    var id       = document.getElementById('revEdit-id').value;
    var btn      = document.getElementById('revEdit-saveBtn');
    var reviewer = document.getElementById('revEdit-reviewer').value.trim();
    var eventNm  = document.getElementById('revEdit-event').value.trim();
    var message  = document.getElementById('revEdit-message').value.trim();
    var rating   = parseInt(document.getElementById('revEdit-rating').value, 10) || 5;

    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      var { error } = await getSupabase()
        .from('event_reviews')
        .update({
          reviewer_name: reviewer || null,
          event_name   : eventNm || null,
          message      : message || null,
          rating       : rating
        })
        .eq('id', id);
      if (error) throw error;

      var r = _reviews.find(function (x) { return x.id === id; });
      if (r) { r.reviewer_name = reviewer; r.event_name = eventNm; r.message = message; r.rating = rating; }
      _renderTable();
      closeReviewEditModal();
      toast('✅', 'Review updated', '');
    } catch (e) {
      toast('❌', 'Failed to save', e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
    }
  };

})();

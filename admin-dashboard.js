/* Impact Grid — Admin Overview dashboard.
   Fills the .pa-* panels on the Overview page. Read-only: it only reads data the
   admin already loads (events + visits from Firestore, bookings + receptionist
   from the API) and never writes. Each panel loads on its own, so one slow or
   failing source never blanks the others.

   Uses globals defined by admin.html / events-script.js:
   db, EVENTS_API, _adminAuthHeader(), nav(). */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function setText(id, v) { var el = $(id); if (el) el.textContent = v; }
  function html(id, h) { var el = $(id); if (el) el.innerHTML = h; }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* Firestore Timestamp | ISO string | Date | 'YYYY-MM-DD' → Date (or null) */
  function toDate(v) {
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate();
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function dateBadge(d) {
    if (!d) return '<div class="pa-date"><b>—</b><span>TBC</span></div>';
    return '<div class="pa-date"><b>' + d.getDate() + '</b><span>' + MONTHS[d.getMonth()] + '</span></div>';
  }
  function rowList(rows) { return '<ul class="pa-list">' + rows.join('') + '</ul>'; }
  function empty(msg) { return '<div class="pa-empty">' + esc(msg) + '</div>'; }
  function skeleton() { return '<div class="pa-skel"><i></i><i></i><i></i></div>'; }

  /* ── Header ── */
  function paintHeader() {
    var now = new Date(), h = now.getHours();
    var hello = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    setText('paGreet', hello + '.');
    setText('paDate', now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }));
  }

  /* ── Events (Firestore) ── */
  async function loadEventsPanel() {
    try {
      var snap = await db.collection('events').where('is_active', '==', true).get();
      setText('stat-events', snap.size);
      var evs = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      evs.sort(function (a, b) {
        var da = toDate(a.created_at), dbb = toDate(b.created_at);
        return (dbb ? dbb.getTime() : 0) - (da ? da.getTime() : 0);
      });
      var today = startOfDay(new Date()).getTime();
      var expiring = evs.filter(function (e) {
        var x = toDate(e.expiry_date); if (!x) return false;
        var days = Math.ceil((x.getTime() - today) / 86400000);
        return days >= 0 && days <= 7;
      }).length;
      setText('pa-k-events-sub', expiring ? expiring + ' expiring within 7 days' : 'Galleries live now');
      var kEv = $('pa-k-events'); if (kEv) kEv.classList.toggle('is-alert', false);

      if (!evs.length) { html('pa-events', empty('No active events yet. Create your first one.')); return; }
      html('pa-events', rowList(evs.slice(0, 5).map(function (e) {
        var ed = toDate(e.event_date), x = toDate(e.expiry_date), chip = '';
        if (x) {
          var days = Math.ceil((x.getTime() - today) / 86400000);
          chip = days < 0 ? '<span class="pa-chip is-warn">Expired</span>'
               : days <= 7 ? '<span class="pa-chip is-warn">' + days + 'd left</span>'
               : '<span class="pa-chip">' + days + 'd left</span>';
        }
        var url = 'event.html?event=' + encodeURIComponent(e.event_slug || '') + '&code=' + encodeURIComponent(e.event_code || '');
        return '<li class="pa-row">' + dateBadge(ed) +
          '<div class="pa-row-main"><div class="pa-row-title">' + esc(e.name || 'Untitled event') + '</div>' +
          '<div class="pa-row-sub">' + esc(e.event_slug || '') + '</div></div>' + chip +
          '<a class="btn btn-ghost btn-sm" href="' + esc(url) + '" target="_blank" rel="noopener">View</a></li>';
      })));
    } catch (e) {
      setText('stat-events', '—');
      html('pa-events', empty('Could not load events.'));
      console.warn('[dashboard] events', e && e.message);
    }
  }

  /* ── Bookings (API) ── */
  async function loadBookingsPanel() {
    try {
      var res = await fetch(EVENTS_API + '/api/bookings', { headers: await _adminAuthHeader() });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      var all = data.bookings || [];
      var pending = all.filter(function (b) { return b.status === 'pending'; });
      var confirmed = all.filter(function (b) { return b.status === 'confirmed'; });
      var today = startOfDay(new Date()).getTime();
      var upcoming = confirmed.filter(function (b) { var d = toDate(b.event_date); return d && d.getTime() >= today; })
        .sort(function (a, b) { return toDate(a.event_date) - toDate(b.event_date); });

      setText('pa-k-pending', pending.length);
      setText('pa-k-pending-sub', pending.length ? 'Waiting for your reply' : 'All caught up');
      var kp = $('pa-k-pending-card'); if (kp) kp.classList.toggle('is-alert', pending.length > 0);
      setText('pa-k-upcoming', upcoming.length);
      setText('pa-k-upcoming-sub', upcoming.length ? 'Next: ' + (toDate(upcoming[0].event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })) : 'Nothing scheduled');

      html('pa-pending', pending.length ? rowList(pending.slice(0, 5).map(function (b) {
        return '<li class="pa-row">' + dateBadge(toDate(b.event_date)) +
          '<div class="pa-row-main"><div class="pa-row-title">' + esc(b.name) + '</div>' +
          '<div class="pa-row-sub">' + esc(b.event_type || 'Event') + (b.location ? ' · ' + esc(b.location) : '') + '</div></div>' +
          '<button class="btn btn-gold btn-sm" onclick="nav(\'bookings\',null)">Review</button></li>';
      })) : empty('No bookings are waiting on you.'));

      html('pa-upcoming', upcoming.length ? rowList(upcoming.slice(0, 5).map(function (b) {
        return '<li class="pa-row">' + dateBadge(toDate(b.event_date)) +
          '<div class="pa-row-main"><div class="pa-row-title">' + esc(b.name) + '</div>' +
          '<div class="pa-row-sub">' + esc(b.event_type || 'Event') + (b.location ? ' · ' + esc(b.location) : '') + '</div></div>' +
          '<span class="pa-chip">Confirmed</span></li>';
      })) : empty('No confirmed bookings coming up.'));
    } catch (e) {
      setText('pa-k-pending', '—'); setText('pa-k-upcoming', '—');
      html('pa-pending', empty('Could not load bookings.'));
      html('pa-upcoming', empty('Could not load bookings.'));
      console.warn('[dashboard] bookings', e && e.message);
    }
  }

  /* ── Receptionist follow-ups (API) ── */
  async function loadFollowups() {
    try {
      var res = await fetch(EVENTS_API + '/api/receptionist-handover', { headers: await _adminAuthHeader() });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      var n = data.total_needing_followup || 0;
      setText('pa-k-follow', n);
      setText('pa-k-follow-sub', n ? 'Conversations waiting' : 'Nobody waiting');
      var k = $('pa-k-follow-card'); if (k) k.classList.toggle('is-alert', n > 0);
    } catch (e) {
      setText('pa-k-follow', '—');
      console.warn('[dashboard] followups', e && e.message);
    }
  }

  /* ── Gallery visits (Firestore) → 14-day chart ── */
  async function loadVisits() {
    try {
      var snap;
      try { snap = await db.collection('event_page_visits').orderBy('visited_at', 'desc').limit(500).get(); }
      catch (idx) { snap = await db.collection('event_page_visits').limit(500).get(); }
      var visits = snap.docs.map(function (d) { return d.data(); });
      var DAYS = 14, today = startOfDay(new Date()), counts = [], labels = [];
      for (var i = DAYS - 1; i >= 0; i--) {
        var d = new Date(today); d.setDate(d.getDate() - i);
        counts.push({ t: d.getTime(), n: 0, label: d.getDate() + ' ' + MONTHS[d.getMonth()] });
      }
      var week = 0, weekStart = today.getTime() - 6 * 86400000, uniq = {};
      visits.forEach(function (v) {
        var d = toDate(v.visited_at); if (!d) return;
        var t = startOfDay(d).getTime();
        for (var j = 0; j < counts.length; j++) if (counts[j].t === t) { counts[j].n++; break; }
        if (t >= weekStart) { week++; uniq[v.ip || v.id || Math.random()] = 1; }
      });
      setText('pa-k-visits', week);
      setText('pa-k-visits-sub', Object.keys(uniq).length + ' unique visitors · 7 days');

      var max = Math.max.apply(null, counts.map(function (c) { return c.n; }).concat([1]));
      var W = 700, H = 150, bw = W / DAYS, bars = counts.map(function (c, k) {
        var h = Math.max(c.n ? 4 : 1.5, (c.n / max) * (H - 18));
        return '<rect class="pa-bar' + (k === counts.length - 1 ? ' is-today' : '') + '" x="' + (k * bw + 6).toFixed(1) + '" y="' + (H - h).toFixed(1) +
          '" width="' + (bw - 12).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="4"><title>' + esc(c.label) + ': ' + c.n + ' visit' + (c.n === 1 ? '' : 's') + '</title></rect>';
      }).join('');
      html('pa-chart', '<div class="pa-chart"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Gallery visits, last 14 days">' +
        '<line class="pa-axis" x1="0" y1="' + H + '" x2="' + W + '" y2="' + H + '"/>' + bars + '</svg>' +
        '<div class="pa-chart-foot"><span>' + esc(counts[0].label) + '</span><span>Last ' + DAYS + ' days · most recent 500 visits</span><span>Today</span></div></div>');
    } catch (e) {
      setText('pa-k-visits', '—');
      html('pa-chart', empty('Could not load visits.'));
      console.warn('[dashboard] visits', e && e.message);
    }
  }

  /* Public entry — called on boot and every time the Overview tab is opened */
  var running = false;
  window.loadDashboard = function () {
    if (running || !$('page-overview')) return;
    running = true;
    paintHeader();
    ['pa-events', 'pa-pending', 'pa-upcoming', 'pa-chart'].forEach(function (id) { if (!$(id) || !$(id).children.length) html(id, skeleton()); });
    Promise.allSettled([loadEventsPanel(), loadBookingsPanel(), loadFollowups(), loadVisits()])
      .then(function () { running = false; }, function () { running = false; });
  };
})();

/* Impact Grid — Accounts "year at a glance" panel.
   Draws a hero (net profit, income, expenses, est. tax, margin), a 12-month
   income-vs-expenses chart and a top-expense-categories list, above the existing
   stat cards. Read-only: it only reads the arrays accounts.html already loads
   (_invoices, _income, _expenses) and uses the SAME income / expense / tax
   rules as renderStats(), so the numbers always agree with the cards below.
   It re-draws whenever renderStats() runs (after every add / edit / delete). */
(function () {
  'use strict';

  var MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function gbp(n) {
    var neg = n < 0, a = Math.abs(n);
    return (neg ? '-' : '') + '£' + a.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function gbpShort(n) {
    var a = Math.abs(n);
    if (a >= 1000) return '£' + (a / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return '£' + Math.round(a);
  }
  /* same UK Corporation Tax estimate as accounts.html renderStats() */
  function corpTax(profit) {
    if (profit <= 0) return 0;
    if (profit <= 50000) return profit * 0.19;
    if (profit <= 250000) return profit * 0.25 - (250000 - profit) * (3 / 200);
    return profit * 0.25;
  }

  function mount() {
    var el = document.getElementById('paInsights');
    if (el) return el;
    var anchor = document.getElementById('statsGrid');
    if (!anchor || !anchor.parentNode) return null;
    el = document.createElement('div');
    el.id = 'paInsights';
    anchor.parentNode.insertBefore(el, anchor);
    return el;
  }

  function draw() {
    var host = mount();
    if (!host) return;
    var inv = (typeof _invoices !== 'undefined' && _invoices) || [];
    var inc = (typeof _income !== 'undefined' && _income) || [];
    var exp = (typeof _expenses !== 'undefined' && _expenses) || [];

    var now = new Date();
    var taxStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    var yearStart = new Date(taxStart, 3, 6);                 // 6 April, as renderStats()
    var curIdx = (now.getMonth() + 9) % 12;                    // Apr = 0 … Mar = 11

    /* month buckets for the tax year (Apr → Mar, by calendar month) */
    var inM = [], outM = [], i;
    for (i = 0; i < 12; i++) { inM.push(0); outM.push(0); }
    function bucket(dateStr, amount, arr) {
      var d = new Date(dateStr);
      if (isNaN(d.getTime()) || d < yearStart) return;
      var idx = (d.getMonth() + 9) % 12;
      var yr = idx <= 8 ? taxStart : taxStart + 1;             // Apr–Dec = start year, Jan–Mar = next
      if (d.getFullYear() !== yr) return;
      arr[idx] += amount;
    }
    var income = 0, expenses = 0, cats = {};
    inv.forEach(function (r) { var a = num(r.total); if (new Date(r.invoice_date) >= yearStart) income += a; bucket(r.invoice_date, a, inM); });
    inc.forEach(function (r) { var a = num(r.amount); if (new Date(r.date) >= yearStart) income += a; bucket(r.date, a, inM); });
    exp.forEach(function (r) {
      var a = num(r.amount);
      if (new Date(r.date) >= yearStart) { expenses += a; var c = r.category || 'Other'; cats[c] = (cats[c] || 0) + a; }
      bucket(r.date, a, outM);
    });
    var profit = income - expenses, tax = corpTax(profit);
    var margin = income > 0 ? Math.max(0, Math.min(100, (profit / income) * 100)) : 0;

    /* ── hero ── */
    var hero =
      '<div class="pa-hero">' +
        '<div><div class="pa-eyebrow">Tax year ' + taxStart + '–' + (taxStart + 1) + ' · year to date</div>' +
        '<div class="pa-big' + (profit < 0 ? ' is-neg' : '') + '">' + gbp(profit) + '</div>' +
        '<div class="pa-big-sub">Net profit before tax' + (tax > 0 ? ' · est. Corporation Tax ' + gbp(tax) : '') + '</div></div>' +
        '<div class="pa-mini">' +
          '<div><span>Income</span><b>' + gbp(income) + '</b></div>' +
          '<div><span>Expenses</span><b>' + gbp(expenses) + '</b></div>' +
          '<div><span>Est. tax</span><b>' + gbp(tax) + '</b></div>' +
        '</div>' +
        '<div class="pa-margin"><div class="pa-margin-top"><span>Profit margin</span><span>' + margin.toFixed(0) + '%</span></div>' +
        '<div class="pa-track"><div class="pa-fill" data-w="' + margin.toFixed(1) + '"></div></div></div>' +
      '</div>';

    /* ── chart ── */
    var hasData = income > 0 || expenses > 0;
    var chart;
    if (!hasData) {
      chart = '<div class="pa-empty">Add income or expenses to see your tax year take shape.</div>';
    } else {
      var W = 700, H = 230, padL = 42, padB = 26, padT = 12, plotW = W - padL - 6, plotH = H - padB - padT;
      var max = Math.max.apply(null, inM.concat(outM).concat([1]));
      var step = Math.pow(10, Math.floor(Math.log10(max))); var top = Math.ceil(max / step) * step;
      if (top / step < 2) top = 2 * step;
      var slot = plotW / 12, bw = Math.min(16, slot / 2 - 3), svg = '', t;
      for (t = 0; t <= 4; t++) {
        var gy = padT + plotH - (t / 4) * plotH;
        svg += '<line class="pa-gl" x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + W + '" y2="' + gy.toFixed(1) + '"/>' +
               '<text class="pa-ax" x="' + (padL - 8) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end">' + gbpShort(top * t / 4) + '</text>';
      }
      var pts = [];
      for (i = 0; i < 12; i++) {
        var cx = padL + slot * i + slot / 2, fut = i > curIdx ? ' pa-future' : '';
        var hi = (inM[i] / top) * plotH, ho = (outM[i] / top) * plotH;
        svg += '<rect class="pa-in' + fut + '" x="' + (cx - bw - 1).toFixed(1) + '" y="' + (padT + plotH - hi).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(hi, inM[i] ? 2 : 0).toFixed(1) + '" rx="3"><title>' + MONTHS[i] + ' income: ' + gbp(inM[i]) + '</title></rect>';
        svg += '<rect class="pa-out' + fut + '" x="' + (cx + 1).toFixed(1) + '" y="' + (padT + plotH - ho).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(ho, outM[i] ? 2 : 0).toFixed(1) + '" rx="3"><title>' + MONTHS[i] + ' expenses: ' + gbp(outM[i]) + '</title></rect>';
        svg += '<text class="pa-ax" x="' + cx.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + MONTHS[i] + '</text>';
        if (i <= curIdx) {
          var net = Math.max(0, inM[i] - outM[i]);
          pts.push([cx, padT + plotH - (net / top) * plotH, inM[i] - outM[i], i]);
        }
      }
      if (pts.length > 1) svg += '<polyline class="pa-net" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
      pts.forEach(function (p) { svg += '<circle class="pa-dot" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.5"><title>' + MONTHS[p[3]] + ' net: ' + gbp(p[2]) + '</title></circle>'; });
      chart = '<div class="pa-chart"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Income and expenses by month">' + svg + '</svg></div>';
    }

    /* ── categories ── */
    var catRows = Object.keys(cats).map(function (k) { return [k, cats[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 6);
    var catHtml = catRows.length
      ? '<div class="pa-cats">' + catRows.map(function (c) {
          var pct = expenses > 0 ? (c[1] / expenses) * 100 : 0;
          return '<div class="pa-cat"><div class="pa-cat-top">' + esc(c[0]) + '<span>' + gbp(c[1]) + ' · ' + pct.toFixed(0) + '%</span></div><div class="pa-cat-bar"><i style="width:' + pct.toFixed(1) + '%"></i></div></div>';
        }).join('') + '</div>'
      : '<div class="pa-empty">No expenses logged this tax year yet.</div>';

    host.innerHTML = hero +
      '<div class="pa-grid">' +
        '<div class="card"><div class="card-head"><h2>Income vs expenses</h2><div class="pa-legend"><span><i style="background:var(--green)"></i>Income</span><span><i style="background:var(--red)"></i>Expenses</span><span><i style="background:var(--pg-gold-ink)"></i>Net</span></div></div>' + chart + '</div>' +
        '<div class="card"><div class="card-head"><h2>Where the money goes</h2></div>' + catHtml + '</div>' +
      '</div>';

    /* animate the margin bar in */
    requestAnimationFrame(function () {
      var f = host.querySelector('.pa-fill');
      if (f) f.style.width = f.getAttribute('data-w') + '%';
    });
  }

  /* Re-draw every time the page recalculates its stat cards */
  function hook() {
    if (typeof window.renderStats !== 'function' || window.renderStats.__pa) { return; }
    var original = window.renderStats;
    var wrapped = function () { original.apply(this, arguments); try { draw(); } catch (e) { console.warn('[accounts-dashboard]', e && e.message); } };
    wrapped.__pa = true;
    window.renderStats = wrapped;
  }
  hook();
})();

/* ═══════════════════════════════════════════════════════
   ImpactGrid — client-dashboard.js
   Read-only view for clients: see only their own campaigns
   and registrations (enforced by Supabase RLS, not by this
   code — this file never filters by owner_id itself).
═══════════════════════════════════════════════════════ */

var CD = (function () {

  var _campaigns  = [];
  var _activeRegs = [];
  var _activeName = '';

  function _client() { return getSupabase(); }

  function _esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function init() {
    var client = _client();
    if (!client) return;

    // Wait briefly for auth.js's initAuth() to resolve the session.
    var { data } = await client.auth.getUser();
    if (!data || !data.user) {
      location.href = 'login.html?redirect=client-dashboard.html';
      return;
    }

    await loadCampaigns();
  }

  async function loadCampaigns() {
    var listEl = document.getElementById('cdCampaignList');
    var client = _client();

    // No owner_id filter here on purpose — RLS policy "client view own
    // campaigns" already restricts this to rows where owner_id = auth.uid().
    var { data, error } = await client
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      listEl.innerHTML = '<div class="cd-empty">Could not load campaigns: ' + _esc(error.message) + '</div>';
      return;
    }

    _campaigns = data || [];

    if (!_campaigns.length) {
      listEl.innerHTML = '<div class="cd-empty">No campaigns have been assigned to your account yet.</div>';
      return;
    }

    listEl.innerHTML = _campaigns.map(function (c) {
      return '<div class="cd-campaign" onclick="CD.viewRegistrations(\'' + c.id + '\', \'' + _esc(c.name).replace(/'/g, "\\'") + '\')">' +
        '<div>' +
          '<div class="cd-name">' + _esc(c.name) +
            ' <span class="cd-badge ' + (c.active ? 'active' : 'paused') + '">' + (c.active ? 'Active' : 'Paused') + '</span></div>' +
          '<div class="cd-meta">Voucher prefix: ' + _esc(c.prefix) + ' · Issued so far: ' + (c.next_seq - 1) + '</div>' +
        '</div>' +
        '<div class="cd-btn">View registrations →</div>' +
      '</div>';
    }).join('');
  }

  async function viewRegistrations(campaignId, campaignName) {
    _activeName = campaignName;
    document.getElementById('cdCampaignsCard').style.display = 'none';
    document.getElementById('cdRegCard').style.display = 'block';
    document.getElementById('cdRegTitle').textContent = campaignName + ' — Registrations';

    var client = _client();

    // Again, no campaign_id filter beyond the .eq below is needed for
    // security — RLS already scopes voucher_registrations to campaigns
    // this client owns. The .eq just picks which one to display.
    var { data, error } = await client
      .from('voucher_registrations')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });

    var body  = document.getElementById('cdRegBody');
    var empty = document.getElementById('cdRegEmpty');

    if (error) {
      body.innerHTML = '';
      empty.style.display = 'block';
      empty.textContent = 'Could not load registrations: ' + error.message;
      return;
    }

    _activeRegs = data || [];

    if (!_activeRegs.length) {
      body.innerHTML = '';
      empty.style.display = 'block';
      empty.textContent = 'No registrations yet.';
      return;
    }

    empty.style.display = 'none';
    body.innerHTML = _activeRegs.map(function (r) {
      return '<tr>' +
        '<td>' + _esc(r.voucher_code) + '</td>' +
        '<td>' + _esc(r.full_name) + '</td>' +
        '<td>' + _esc(r.phone) + '</td>' +
        '<td>' + _esc(r.email) + '</td>' +
        '<td>' + (r.household_size ?? '') + '</td>' +
        '<td>' + _esc(r.products_interested || '') + '</td>' +
        '<td>' + _esc(r.expected_spend || '') + '</td>' +
        '<td>' + _esc(r.attend_frequency || '') + '</td>' +
        '<td>' + _esc(r.heard_about || '') + '</td>' +
        '<td>' + (r.consent ? 'Yes' : 'No') + '</td>' +
        '<td>' + (r.redeemed ? 'Yes' : 'No') + '</td>' +
        '<td>' + new Date(r.created_at).toLocaleDateString() + '</td>' +
      '</tr>';
    }).join('');
  }

  function backToList() {
    document.getElementById('cdRegCard').style.display = 'none';
    document.getElementById('cdCampaignsCard').style.display = 'block';
  }

  function exportCSV() {
    if (!_activeRegs.length) return alert('No registrations to export.');

    var headers = ['Voucher Code','Full Name','Phone','Email','Household Size',
      'Products Interested','Expected Spend','Attend Frequency','Heard About',
      'Consent','Redeemed','Date'];

    var rows = _activeRegs.map(function (r) {
      return [r.voucher_code, r.full_name, r.phone, r.email, r.household_size || '',
        r.products_interested || '', r.expected_spend || '', r.attend_frequency || '',
        r.heard_about || '', r.consent ? 'Yes' : 'No', r.redeemed ? 'Yes' : 'No',
        new Date(r.created_at).toISOString()]
        .map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; })
        .join(',');
    });

    var csv = headers.join(',') + '\n' + rows.join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (_activeName || 'registrations').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv';
    a.click();
  }

  return {
    init: init,
    viewRegistrations: viewRegistrations,
    backToList: backToList,
    exportCSV: exportCSV
  };
})();

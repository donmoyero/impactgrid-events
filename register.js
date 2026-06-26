/* ═══════════════════════════════════════════════════════
   ImpactGrid — register.js
   Public-facing voucher registration form.
   No auth required. Reads campaign via ?c=slug.
═══════════════════════════════════════════════════════ */

var REG = (function () {

  var _campaign = null;
  var _design   = {};

  function _client() { return getSupabase(); }
  function _slug()   { return new URLSearchParams(location.search).get('c'); }

  function _esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _applyPageDesign() {
    if (_design.background_image) {
      document.body.style.backgroundImage    = 'url("' + _design.background_image + '")';
      document.body.style.backgroundSize      = 'cover';
      document.body.style.backgroundPosition  = 'center';
      document.body.style.backgroundAttachment = 'fixed';
    }
    if (_design.accent_color) {
      document.documentElement.style.setProperty('--gold', _design.accent_color);
    }
  }

  async function init() {
    var card = document.getElementById('rgCard');
    var slug = _slug();

    if (!slug) {
      card.innerHTML = '<div class="rg-closed">No campaign specified. Check the link you were given.</div>';
      return;
    }

    var client = _client();
    if (!client) {
      card.innerHTML = '<div class="rg-closed">Could not connect — please try again shortly.</div>';
      return;
    }

    var { data, error } = await client
      .from('campaigns')
      .select('id, slug, name, active, page_design')
      .eq('slug', slug)
      .single();

    if (error || !data || !data.active) {
      card.innerHTML = '<div class="rg-closed">This registration is closed or no longer available.</div>';
      return;
    }

    _campaign = data;
    _design   = data.page_design || {};
    _applyPageDesign();
    _renderForm();
  }

  function _renderForm() {
    var card = document.getElementById('rgCard');

    var headerImg = _design.header_image
      ? '<img src="' + _esc(_design.header_image) + '" style="max-width:100%;max-height:90px;display:block;margin:0 auto 18px;">'
      : '';
    var headline    = _design.headline    || _campaign.name;
    var subheadline = _design.subheadline || 'Fill in your details below to register and get your voucher code.';
    var buttonText  = _design.button_text || 'Get My Voucher Code';
    var footerImg   = _design.footer_image
      ? '<img src="' + _esc(_design.footer_image) + '" style="max-width:100%;max-height:60px;display:block;margin:18px auto 0;">'
      : '';

    card.innerHTML =
      headerImg +
      '<h1 class="rg-title">' + _esc(headline) + '</h1>' +
      '<p class="rg-sub">' + _esc(subheadline) + '</p>' +
      '<div id="rgErrorBox"></div>' +
      '<div class="rg-field"><label>Full Name *</label><input id="rgName" required></div>' +
      '<div class="rg-field"><label>Phone Number *</label><input id="rgPhone" type="tel" required></div>' +
      '<div class="rg-field"><label>Email Address *</label><input id="rgEmail" type="email" required></div>' +
      '<div class="rg-field"><label>Household Size</label><input id="rgHousehold" type="number" min="1"></div>' +
      '<div class="rg-field"><label>Products You\'re Interested In</label><input id="rgProducts" placeholder="e.g. Rice, Garri, Palm Oil"></div>' +
      '<div class="rg-field"><label>Expected Spend</label><input id="rgSpend" placeholder="e.g. £30-£50"></div>' +
      '<div class="rg-field"><label>How Often Would You Attend?</label>' +
        '<select id="rgFreq"><option value="">Select…</option>' +
        '<option>One-off visit</option><option>Weekly</option><option>Monthly</option><option>Occasionally</option></select></div>' +
      '<div class="rg-field"><label>How Did You Hear About This?</label>' +
        '<select id="rgHeard"><option value="">Select…</option>' +
        '<option>Instagram</option><option>TikTok</option><option>Facebook</option>' +
        '<option>Friend/Family</option><option>Word of mouth</option><option>Other</option></select></div>' +
      '<label class="rg-check"><input type="checkbox" id="rgConsent">' +
        '<span>I consent to receive future promotions and updates about this and similar events.</span></label>' +
      '<button class="rg-submit" id="rgSubmitBtn" onclick="REG.submit()">' + _esc(buttonText) + '</button>' +
      footerImg;
  }

  async function submit() {
    var errBox = document.getElementById('rgErrorBox');
    errBox.innerHTML = '';

    var name  = document.getElementById('rgName').value.trim();
    var phone = document.getElementById('rgPhone').value.trim();
    var email = document.getElementById('rgEmail').value.trim();

    if (!name || !phone || !email) {
      errBox.innerHTML = '<div class="rg-error">Please fill in your name, phone, and email.</div>';
      return;
    }

    var btn = document.getElementById('rgSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    var client = _client();
    var household = document.getElementById('rgHousehold').value;

    var { data, error } = await client.rpc('register_for_campaign', {
      p_slug: _campaign.slug,
      p_full_name: name,
      p_phone: phone,
      p_email: email,
      p_household_size: household ? parseInt(household, 10) : null,
      p_products_interested: document.getElementById('rgProducts').value.trim(),
      p_expected_spend: document.getElementById('rgSpend').value.trim(),
      p_attend_frequency: document.getElementById('rgFreq').value,
      p_heard_about: document.getElementById('rgHeard').value,
      p_consent: document.getElementById('rgConsent').checked
    });

    if (error) {
      btn.disabled = false;
      btn.textContent = _design.button_text || 'Get My Voucher Code';
      errBox.innerHTML = '<div class="rg-error">Could not register: ' + _esc(error.message) + '</div>';
      return;
    }

    _showSuccess(data);
  }

  function _showSuccess(code) {
    var card = document.getElementById('rgCard');
    var thankYou = _design.thank_you_message || 'Show this code on arrival to redeem your voucher.';
    card.innerHTML =
      '<div class="rg-success">' +
        '<h1 class="rg-title">You\'re registered! 🎉</h1>' +
        '<p class="rg-sub">' + _esc(thankYou) + '</p>' +
        '<div class="rg-code">' + _esc(code) + '</div>' +
        '<p class="rg-sub">Keep this code safe, you won\'t be able to retrieve it again from this page.</p>' +
      '</div>';
  }

  return { init: init, submit: submit };
})();

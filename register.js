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

  /* Build a single field's HTML from a field definition */
  function _fieldHtml(f) {
    var id      = 'rg_' + f.key;
    var label   = _esc(f.label) + (f.required ? ' <span style="color:var(--gold)">*</span>' : '');
    var inner   = '';

    if (f._isSection) {
      /* Section divider */
      return '<div style="margin:24px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--border2);">'
           + '<span style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);">'
           + _esc(f.label) + '</span></div>';
    }

    switch (f.type) {
      case 'textarea':
        inner = '<textarea id="' + id + '" rows="3" style="width:100%;padding:11px 13px;border-radius:9px;border:1px solid var(--border2);background:var(--bg2);color:var(--text);font-size:14px;resize:vertical;"' + (f.required ? ' required' : '') + '></textarea>';
        break;
      case 'select':
        var opts = (f.options || []).filter(function(o){ return o && o.trim(); });
        inner = '<select id="' + id + '" style="width:100%;padding:11px 13px;border-radius:9px;border:1px solid var(--border2);background:var(--bg2);color:var(--text);font-size:14px;"' + (f.required ? ' required' : '') + '>'
              + '<option value="">Select…</option>'
              + opts.map(function(o){ return '<option value="' + _esc(o) + '">' + _esc(o) + '</option>'; }).join('')
              + '</select>';
        break;
      case 'checkbox':
        return '<label class="rg-check" style="margin:12px 0;">'
             + '<input type="checkbox" id="' + id + '"' + (f.required ? ' required' : '') + '>'
             + '<span>' + _esc(f.label) + (f.required ? ' <span style="color:var(--gold)">*</span>' : '') + '</span>'
             + '</label>';
      default:
        /* text, email, tel, number */
        inner = '<input id="' + id + '" type="' + _esc(f.type || 'text') + '"'
              + (f.required ? ' required' : '')
              + ' style="width:100%;padding:11px 13px;border-radius:9px;border:1px solid var(--border2);background:var(--bg2);color:var(--text);font-size:14px;">';
        break;
    }

    return '<div class="rg-field"><label>' + label + '</label>' + inner + '</div>';
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

    /* Use page_design.fields if they exist, otherwise fall back to the three core fields */
    var fields = (_design.fields && _design.fields.length)
      ? _design.fields
      : [
          { key:'full_name', label:'Full Name',     type:'text',  required:true },
          { key:'phone',     label:'Phone Number',  type:'tel',   required:true },
          { key:'email',     label:'Email Address', type:'email', required:true }
        ];

    var fieldsHtml = fields.map(_fieldHtml).join('');

    card.innerHTML =
      headerImg +
      '<h1 class="rg-title">' + _esc(headline) + '</h1>' +
      '<p class="rg-sub">' + _esc(subheadline) + '</p>' +
      '<div id="rgErrorBox"></div>' +
      fieldsHtml +
      '<button class="rg-submit" id="rgSubmitBtn" onclick="REG.submit()">' + _esc(buttonText) + '</button>' +
      footerImg;
  }

  async function submit() {
    var errBox = document.getElementById('rgErrorBox');
    errBox.innerHTML = '';

    /* Collect every field's value by key */
    var fields = (_design.fields && _design.fields.length)
      ? _design.fields
      : [
          { key:'full_name', label:'Full Name',     type:'text',  required:true },
          { key:'phone',     label:'Phone Number',  type:'tel',   required:true },
          { key:'email',     label:'Email Address', type:'email', required:true }
        ];

    var values   = {};
    var missing  = [];

    fields.forEach(function(f) {
      if (f._isSection) return; // skip section dividers
      var el = document.getElementById('rg_' + f.key);
      if (!el) return;
      var val = f.type === 'checkbox' ? el.checked : el.value.trim();
      values[f.key] = val;
      if (f.required && (val === '' || val === false)) missing.push(f.label);
    });

    if (missing.length) {
      errBox.innerHTML = '<div class="rg-error">Please fill in: ' + missing.map(_esc).join(', ') + '</div>';
      return;
    }

    var btn = document.getElementById('rgSubmitBtn');
    btn.disabled    = true;
    btn.textContent = 'Submitting…';

    /* Pass the core named params the RPC expects, plus everything else as extra_fields JSON */
    var coreKeys = ['full_name','phone','email','household_size','products_interested','expected_spend','attend_frequency','heard_about','consent'];
    var extra    = {};
    Object.keys(values).forEach(function(k) {
      if (coreKeys.indexOf(k) === -1) extra[k] = values[k];
    });

    var { data, error } = await _client().rpc('register_for_campaign', {
      p_slug:                 _campaign.slug,
      p_full_name:            values['full_name']           || '',
      p_phone:                values['phone']               || '',
      p_email:                values['email']               || '',
      p_household_size:       values['household_size']      ? parseInt(values['household_size'], 10) : null,
      p_products_interested:  values['products_interested'] || '',
      p_expected_spend:       values['expected_spend']      || '',
      p_attend_frequency:     values['attend_frequency']    || '',
      p_heard_about:          values['heard_about']         || '',
      p_consent:              values['consent']             || false,
      p_extra_fields:         Object.keys(extra).length ? JSON.stringify(extra) : null
    });

    if (error) {
      /* If the RPC doesn't accept p_extra_fields yet, retry without it */
      if (error.message && error.message.indexOf('p_extra_fields') !== -1) {
        var retry = await _client().rpc('register_for_campaign', {
          p_slug:                _campaign.slug,
          p_full_name:           values['full_name']           || '',
          p_phone:               values['phone']               || '',
          p_email:               values['email']               || '',
          p_household_size:      values['household_size']      ? parseInt(values['household_size'], 10) : null,
          p_products_interested: values['products_interested'] || '',
          p_expected_spend:      values['expected_spend']      || '',
          p_attend_frequency:    values['attend_frequency']    || '',
          p_heard_about:         values['heard_about']         || '',
          p_consent:             values['consent']             || false
        });
        if (!retry.error) { _showSuccess(retry.data); return; }
        error = retry.error;
      }
      btn.disabled    = false;
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

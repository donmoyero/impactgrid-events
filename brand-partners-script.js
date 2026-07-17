/* ═══════════════════════════════════════════════════════════
   ImpactGrid — brand-partners-script.js
   Admin panel: upload, reorder, and delete logos of brands
   that work with ImpactGrid Events. Shown on the homepage
   under the trust badges — logos only, no heading.

   Storage: Supabase Storage bucket 'site-media', folder
   'brand-logos/'. Data: Supabase table `brand_partners`.
   Exposes: loadBrandPartnersAdmin()
═══════════════════════════════════════════════════════════ */

(function () {

  var _partners = [];
  var _loading  = false;

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _setProgress(p) {
    var bar = document.getElementById('brandUploadBar');
    if (bar) bar.style.width = p + '%';
  }

  /* ── Upload ─────────────────────────────────────────────── */
  window.handleBrandLogoFile = function (e) {
    var f = e.target.files && e.target.files[0];
    if (f) uploadBrandLogo(f);
    e.target.value = '';
  };

  window.uploadBrandLogo = async function (file) {
    var allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type)) { toast('⚠️', 'Unsupported type', 'Use PNG, JPG, WebP or SVG'); return; }
    if (file.size > 5 * 1024 * 1024) { toast('⚠️', 'File too large', 'Max 5MB'); return; }

    var ext = file.name.split('.').pop();
    var fname = 'brand-logos/' + Date.now() + '-' + Math.random().toString(36).substring(2, 8) + '.' + ext;

    var progEl = document.getElementById('brandUploadProg');
    if (progEl) progEl.style.display = 'block';
    var nameEl = document.getElementById('brandUploadName');
    if (nameEl) nameEl.textContent = file.name;
    _setProgress(0);

    try {
      var c = getSupabase();
      var { error: upErr } = await c.storage.from(BUCKET).upload(fname, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      _setProgress(60);

      var { data: urlData } = c.storage.from(BUCKET).getPublicUrl(fname);

      var maxPos = _partners.length ? Math.max.apply(null, _partners.map(function (p) { return p.position || 0; })) : 0;
      var { error: insErr } = await c.from('brand_partners').insert({
        name       : file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
        logo_url   : urlData.publicUrl,
        storage_path: fname,
        position   : maxPos + 1
      });
      if (insErr) throw insErr;

      _setProgress(100);
      if (progEl) setTimeout(function () { progEl.style.display = 'none'; }, 400);
      toast('✅', 'Logo uploaded!', '');
      loadBrandPartnersAdmin();
    } catch (e) {
      if (progEl) progEl.style.display = 'none';
      toast('❌', 'Upload failed', e.message);
    }
  };

  /* ── Load & render ──────────────────────────────────────── */
  window.loadBrandPartnersAdmin = async function () {
    if (_loading) return;
    _loading = true;
    var el = document.getElementById('brandPartnersList');
    if (el) el.innerHTML = '<div class="empty"><div class="empty-ico"></div><div class="empty-txt">Loading…</div></div>';

    try {
      var c = getSupabase();
      var { data, error } = await c
        .from('brand_partners')
        .select('id, name, logo_url, storage_path, position, logo_width, logo_height')
        .order('position', { ascending: true, nullsFirst: false });
      if (error) throw error;
      _partners = data || [];
      _render();
    } catch (e) {
      if (el) el.innerHTML = '<div class="empty"><div class="empty-ico">⚠️</div><div class="empty-txt">' + _esc(e.message) + '</div></div>';
    } finally {
      _loading = false;
    }
  };

  function _render() {
    var el = document.getElementById('brandPartnersList');
    if (!el) return;

    if (!_partners.length) {
      el.innerHTML = '<div class="empty"><div class="empty-ico">🏷️</div><div class="empty-txt">No brand logos yet. Upload one above.</div></div>';
      return;
    }

    el.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px;">' + _partners.map(function (p, i) {
      var w = p.logo_width  || '';
      var h = p.logo_height || '';
      return '<div style="display:flex;align-items:center;gap:14px;background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:10px 14px;flex-wrap:wrap;">' +
        '<div style="width:64px;height:44px;display:flex;align-items:center;justify-content:center;background:var(--bg2);border-radius:8px;flex-shrink:0;">' +
          '<img src="' + _esc(p.logo_url) + '" alt="" style="max-width:56px;max-height:36px;object-fit:contain;"/>' +
        '</div>' +
        '<div style="flex:1;font-size:13px;font-weight:600;min-width:120px;">' + _esc(p.name || 'Untitled') + '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text3);">' +
          '<label style="display:flex;align-items:center;gap:4px;">W <input type="number" min="1" placeholder="140" value="' + w + '" id="bp-w-' + p.id + '" style="width:60px;padding:4px 6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;"/></label>' +
          '<label style="display:flex;align-items:center;gap:4px;">H <input type="number" min="1" placeholder="42" value="' + h + '" id="bp-h-' + p.id + '" style="width:60px;padding:4px 6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;"/></label>' +
          '<span style="opacity:.7;">px</span>' +
        '</div>' +
        '<button class="btn btn-ghost btn-sm" onclick="saveBrandPartnerSize(\'' + p.id + '\')">💾 Save Size</button>' +
        '<div style="display:flex;flex-direction:column;gap:2px;">' +
          '<button class="btn btn-ghost btn-sm" style="padding:2px 8px;" ' + (i === 0 ? 'disabled' : '') + ' onclick="moveBrandPartner(\'' + p.id + '\',\'up\')">▲</button>' +
          '<button class="btn btn-ghost btn-sm" style="padding:2px 8px;" ' + (i === _partners.length - 1 ? 'disabled' : '') + ' onclick="moveBrandPartner(\'' + p.id + '\',\'down\')">▼</button>' +
        '</div>' +
        '<button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="deleteBrandPartner(\'' + p.id + '\',\'' + _esc(p.storage_path || '') + '\')">🗑 Delete</button>' +
      '</div>';
    }).join('') + '</div>';
  }

  /* ── Resize (custom width/height in px) ────────────────── */
  window.saveBrandPartnerSize = async function (id) {
    var wEl = document.getElementById('bp-w-' + id);
    var hEl = document.getElementById('bp-h-' + id);
    var w = wEl && wEl.value ? parseInt(wEl.value, 10) : null;
    var h = hEl && hEl.value ? parseInt(hEl.value, 10) : null;
    if ((wEl && wEl.value && (!w || w <= 0)) || (hEl && hEl.value && (!h || h <= 0))) {
      toast('⚠️', 'Invalid size', 'Width and height must be positive numbers');
      return;
    }
    try {
      var c = getSupabase();
      var { error } = await c.from('brand_partners').update({ logo_width: w, logo_height: h }).eq('id', id);
      if (error) throw error;
      var p = _partners.find(function (p) { return p.id === id; });
      if (p) { p.logo_width = w; p.logo_height = h; }
      toast('✅', 'Size saved', w || h ? (w || 'auto') + ' × ' + (h || 'auto') + 'px' : 'Reset to default size');
    } catch (e) {
      toast('❌', 'Failed to save size', e.message);
    }
  }

  /* ── Reorder ────────────────────────────────────────────── */
  window.moveBrandPartner = async function (id, dir) {
    var idx = _partners.findIndex(function (p) { return p.id === id; });
    if (idx === -1) return;
    var swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= _partners.length) return;

    _partners.forEach(function (p, i) { p.position = i; });
    var tmp = _partners[idx].position;
    _partners[idx].position = _partners[swapIdx].position;
    _partners[swapIdx].position = tmp;
    _partners.sort(function (a, b) { return a.position - b.position; });
    _render();

    try {
      var c = getSupabase();
      await Promise.all(_partners.map(function (p) {
        return c.from('brand_partners').update({ position: p.position }).eq('id', p.id);
      }));
    } catch (e) {
      toast('❌', 'Failed to save order', e.message);
      loadBrandPartnersAdmin();
    }
  };

  /* ── Delete ─────────────────────────────────────────────── */
  window.deleteBrandPartner = async function (id, path) {
    if (!confirm('Delete this brand logo?')) return;
    try {
      var c = getSupabase();
      if (path) { try { await c.storage.from(BUCKET).remove([path]); } catch (e) {} }
      var { error } = await c.from('brand_partners').delete().eq('id', id);
      if (error) throw error;
      _partners = _partners.filter(function (p) { return p.id !== id; });
      _render();
      toast('🗑️', 'Logo deleted', '');
    } catch (e) {
      toast('❌', 'Failed to delete', e.message);
    }
  };

})();

/* ════════════════════════════════════════════════════
   RAW PROOFING — admin page (separate from normal events)
   RAWs are never uploaded. Select a RAW+JPG folder: the RAWs are
   ignored, JPEGs go to Cloudinary, each proof remembers its RAW name.
════════════════════════════════════════════════════ */
var IG_RAW_EXTS = ['arw','cr2','cr3','nef','nrw','dng','raf','orf','rw2','pef','srw','x3f','3fr','iiq','erf','mrw','raw'];
var IG_JPEG_EXTS = ['jpg','jpeg'];
var rpCur = null; /* {id, slug, code, name} of the gallery being edited */
var rpSel = {}, rpSelMode = false, rpPhotosCache = [], rpOpenTok = 0; /* photo multi-select state + guard against stale loads */

/* Wipes everything gallery-specific from the editor so nothing from the previous gallery can show through. */
function rpReset(){
  rpEnsureFields();
  rpSel = {}; rpSelMode = false; rpPhotosCache = []; window._rpSub = null; window._rpNames = []; window._rpG = null;
  ['rpPhotos','rpPhotoBar','rpProgress','rpStats','rpPhotoCount'].forEach(function(id){ var e = document.getElementById(id); if(e) e.innerHTML = ''; });
  var s = document.getElementById('rpSelection'); if(s) s.innerHTML = 'No picks submitted yet.';
  var l = document.getElementById('rpLinkBox'); if(l) l.value = '';
}

function igSplitName(n){ var i = n.lastIndexOf('.'); return { base:(i>0?n.slice(0,i):n).toLowerCase(), ext:(i>0?n.slice(i+1):'').toLowerCase() }; }

/* Pairs RAWs with JPEGs by filename. Only JPEGs are ever uploaded. */
function igPlanProofingUpload(fileList){
  var raws = {}, jpegs = {}, ignored = 0;
  Array.prototype.slice.call(fileList).forEach(function(f){
    var p = igSplitName(f.name);
    if(IG_RAW_EXTS.indexOf(p.ext) > -1) raws[p.base] = f;
    else if(IG_JPEG_EXTS.indexOf(p.ext) > -1) jpegs[p.base] = f;
    else ignored++;
  });
  var rk = Object.keys(raws), jk = Object.keys(jpegs), rawByFile = new Map(), paired = 0, orphanRaw = [], jpegOnly = [];
  rk.forEach(function(k){ if(jpegs[k]){ rawByFile.set(jpegs[k], raws[k].name); paired++; } else orphanRaw.push(raws[k].name); });
  jk.forEach(function(k){ if(!raws[k]) jpegOnly.push(jpegs[k].name); });
  return { files: jk.map(function(k){ return jpegs[k]; }), rawByFile: rawByFile, rawCount: rk.length, jpegCount: jk.length,
           pairedCount: paired, orphanRaw: orphanRaw, jpegOnly: jpegOnly, ignored: ignored };
}

/* Bakes a faint diagonal watermark into each proof BEFORE upload, so the clean image never leaves the browser. */
function rpWatermark(blob){
  return new Promise(function(resolve, reject){
    var img = new Image(), url = URL.createObjectURL(blob);
    img.onload = function(){
      var c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      var x = c.getContext('2d'); x.drawImage(img, 0, 0); URL.revokeObjectURL(url);
      var fs = Math.max(18, Math.round(Math.min(c.width, c.height) / 14)), diag = Math.hypot(c.width, c.height), step = fs * 4.2, row = 0;
      x.globalAlpha = 0.16; x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = Math.max(1, fs / 18);
      x.font = '700 ' + fs + 'px system-ui,Arial,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.translate(c.width / 2, c.height / 2); x.rotate(-Math.PI / 6);
      for(var yy = -diag / 2; yy < diag / 2; yy += step, row++)
        for(var xx = -diag / 2 + (row % 2 ? fs * 5.5 : 0); xx < diag / 2; xx += fs * 11){ x.strokeText('IMPACTGRID', xx, yy); x.fillText('IMPACTGRID', xx, yy); }
      c.toBlob(function(b){ b ? resolve(b) : reject(new Error('watermark failed')); }, 'image/jpeg', 0.88);
    };
    img.onerror = function(){ reject(new Error('could not read image')); };
    img.src = url;
  });
}
/* Extra editor fields (injected so admin.html needs no change) */
function rpEnsureFields(){
  if(document.getElementById('rpWelcome')) return;
  var host = document.getElementById('rpLimit').parentNode, d = document.createElement('div');
  d.innerHTML = '<input id="rpWelcome" maxlength="200" placeholder="Welcome line, e.g. Hi Sarah, pick your favourites" style="width:100%;margin-top:8px">'
    + '<div style="margin-top:8px;font-size:13px;display:flex;gap:14px;flex-wrap:wrap;align-items:center;">'
    + '<label>Pick-by date <input id="rpPickBy" type="date"></label>'
    + '<label><input id="rpLockSub" type="checkbox"> Lock picks once the client submits</label>'
    + '<label>Order <select id="rpSort"><option value="name">By filename</option><option value="time">By capture time</option></select></label></div>'
    + '<input id="rpClientEmail" type="email" placeholder="Client email (to send the link)" style="width:100%;margin-top:8px">'
    + '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><button class="btn btn-ghost btn-sm" onclick="rpSend()">Email link to client</button><span id="rpStats" style="font-size:12px;color:var(--text3)"></span></div>'
    + '<div id="rpPhotoBar" style="margin:10px 0 6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--text3)"></div>'
    + '<div id="rpPhotos" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:6px;"></div>';
  host.parentNode.insertBefore(d, host.nextSibling);
}

async function rpApi(path, opts){
  var c = getSupabase(), sd = await c.auth.getSession();
  var token = sd && sd.data && sd.data.session ? sd.data.session.access_token : null;
  opts = opts || {};
  var r = await fetch(EVENTS_API + '/api/proofing/' + path, {
    method: opts.body ? 'POST' : 'GET',
    headers: Object.assign({ 'Content-Type':'application/json' }, token ? { Authorization:'Bearer ' + token } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined });
  var d = await r.json().catch(function(){ return {}; });
  if(!r.ok) throw new Error(d.error || ('Server error ' + r.status));
  return d;
}
function rpLink(g){ return location.origin + '/proof.html?g=' + g.slug + '&code=' + g.code; }

/* ── List ── */
async function loadRawProofing(){
  rpOpenTok++; rpShow('list');
  var el = document.getElementById('rpList'); el.innerHTML = 'Loading…';
  try{
    var d = await rpApi('admin/list');
    if(!d.galleries.length){ el.innerHTML = '<div class="empty"><div class="empty-txt">No RAW galleries yet — click “+ New RAW Gallery”.</div></div>'; return; }
    el.innerHTML = d.galleries.map(function(g){
      return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;">'
        + '<div><b>' + esc(g.name) + '</b><div style="font-size:12px;color:var(--text3);">' + esc(g.client_name || '') + ' · ' + g.photo_count + ' photos · limit ' + (g.selection_limit || 'none')
        + (g.picked ? ' · <span style="color:var(--green);">' + g.picked + ' picked ✓</span>' : '') + '</div></div>'
        + '<div style="display:flex;gap:6px;"><button class="btn btn-ghost btn-sm" onclick="rpOpen(\'' + g.id + '\')">Open</button>'
        + '<button class="btn btn-ghost btn-sm" onclick="rpCopy(\'' + rpLink(g) + '\')">Copy RAW link</button></div></div>';
    }).join('');
  }catch(e){ el.textContent = 'Could not load: ' + e.message; }
}
function rpShow(v){ document.getElementById('rpListView').style.display = v==='list' ? 'block':'none'; document.getElementById('rpEditorView').style.display = v==='edit' ? 'block':'none'; }
function rpCopy(t){ navigator.clipboard.writeText(t).then(function(){ toast('', 'Copied', ''); }, function(){ prompt('Copy:', t); }); }

/* ── Editor ── */
function rpNew(){
  rpCur = null; rpOpenTok++;
  rpReset();
  ['rpName','rpClient','rpLimit','rpWelcome','rpPickBy','rpClientEmail'].forEach(function(id){ document.getElementById(id).value = ''; });
  document.getElementById('rpLockSub').checked = false; document.getElementById('rpSort').value = 'name';
  document.getElementById('rpTitle').textContent = 'New RAW Gallery';
  document.getElementById('rpAfterSave').style.display = 'none';
  rpShow('edit');
}
async function rpSave(){
  var name = document.getElementById('rpName').value.trim();
  if(!name){ toast('', 'Name required', ''); return; }
  try{
    var d = await rpApi('admin/save', { body:{ id: rpCur && rpCur.id, name:name, clientName:document.getElementById('rpClient').value, limit:document.getElementById('rpLimit').value,
      welcome:document.getElementById('rpWelcome').value, pickBy:document.getElementById('rpPickBy').value, lockOnSubmit:document.getElementById('rpLockSub').checked,
      clientEmail:document.getElementById('rpClientEmail').value, sortBy:document.getElementById('rpSort').value } });
    toast('', 'Saved', ''); rpOpen(d.id);
  }catch(e){ toast('', 'Save failed', e.message); }
}
async function rpOpen(id, keepProgress){
  var tok = ++rpOpenTok, switching = !rpCur || rpCur.id !== id;
  if(switching){ rpCur = null; rpReset(); document.getElementById('rpAfterSave').style.display = 'none'; }
  rpShow('edit');
  try{
    var d = await rpApi('admin/gallery/' + id), g = d.gallery;
    if(tok !== rpOpenTok) return; /* user moved on to another gallery while this was loading */
    rpCur = { id:g.id, slug:g.slug, code:g.code, name:g.name };
    document.getElementById('rpTitle').textContent = g.name;
    document.getElementById('rpName').value = g.name; document.getElementById('rpClient').value = g.client_name || '';
    document.getElementById('rpLimit').value = g.selection_limit || '';
    rpEnsureFields(); document.getElementById('rpWelcome').value = g.welcome || ''; document.getElementById('rpPickBy').value = g.pick_by || ''; document.getElementById('rpLockSub').checked = !!g.lock_on_submit; document.getElementById('rpClientEmail').value = g.client_email || ''; document.getElementById('rpSort').value = g.sort_by === 'time' ? 'time' : 'name';
    document.getElementById('rpAfterSave').style.display = 'block';
    document.getElementById('rpLinkBox').value = rpLink(g);
    document.getElementById('rpPhotoCount').textContent = d.photo_count + ' proofs uploaded'; rpRenderTools(d);
    if(!keepProgress && !switching) document.getElementById('rpProgress').innerHTML = '';
    window._rpG = g; rpRenderSelection(d.submission);
  }catch(e){ toast('', 'Could not open', e.message); }
}
function rpRenderSelection(sub){
  var el = document.getElementById('rpSelection');
  if(!sub){ el.innerHTML = 'No picks submitted yet.'; return; }
  var names = sub.items.map(function(i){ return i.raw_filename || i.file_name || i.photo_id; });
  window._rpNames = names; window._rpSub = sub;
  el.innerHTML = '<div><b>' + esc(sub.client_name || 'Client') + '</b> ' + esc(sub.client_email || '') + ' — <b>' + sub.count + '</b> picked (v' + sub.revision + ', ' + new Date(sub.submitted_at).toLocaleString() + ')</div>'
    + (sub.note ? '<div style="margin:6px 0;">Note: ' + esc(sub.note) + '</div>' : '')
    + '<div style="margin:8px 0;display:flex;gap:6px;flex-wrap:wrap;"><button class="btn btn-ghost btn-sm" onclick="rpCopy(window._rpNames.join(\'\\n\'))">Copy RAW filenames</button>'
    + '<button class="btn btn-ghost btn-sm" onclick="rpCopy(window._rpNames.map(function(n){return n.replace(/\\.[^.]+$/,\'\');}).join(\', \'))">Copy for Lightroom (no extension)</button>'
    + '<button class="btn btn-ghost btn-sm" onclick="rpDownloadTxt()">Download .txt</button></div>'
    + (sub.extras ? '<div style="margin:6px 0;color:var(--accent);"><b>' + sub.extras + ' paid extra' + (sub.extras > 1 ? 's' : '') + ' = £' + sub.extra_total + '</b> ' + rpInvoiceUi() + '</div>' : '')
    + '<div style="font-size:12px;line-height:1.7;margin:6px 0;">' + sub.items.map(function(i){ return esc(i.raw_filename || i.file_name || '') + (i.paid_extra ? ' <b style="color:var(--accent)">[extra]</b>' : '') + (i.kind === 'maybe' ? ' <i>[if possible]</i>' : '') + (i.comment ? ' — “' + esc(i.comment) + '”' : ''); }).join('<br>') + '</div>'
    + '<textarea readonly style="width:100%;height:150px;font-family:monospace;font-size:12px;">' + esc(names.join('\n')) + '</textarea>';
}
function rpDownloadTxt(){ var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([window._rpNames.join('\n')], {type:'text/plain'})); a.download = 'selected-raws.txt'; a.click(); }
async function rpDelete(){
  if(!rpCur || !confirm('Delete "' + rpCur.name + '" and all its previews? Client picks are removed too. This cannot be undone.')) return;
  try{ var d = await rpApi('admin/delete', { body:{ id: rpCur.id } });
    toast('', 'Gallery deleted', d.cloudinaryOk ? '' : 'Some Cloudinary files may remain — Cloudinary Cleanup will catch them');
    loadRawProofing();
  }catch(e){ toast('', 'Delete failed', e.message); }
}

/* ── Invoice for paid extras (same PDF + email + `invoices` table flow as event bookings) ── */
function rpInvoiceUi(){
  var sub = window._rpSub, g = window._rpG || {}, n = (sub.extras || 0) - (g.invoiced_extras || 0);
  if(n > 0) return '<button class="btn btn-ghost btn-sm" onclick="rpInvoice()">' + (g.invoiced_extras ? 'Invoice ' + n + ' new extra' + (n > 1 ? 's' : '') : 'Create & send invoice') + '</button>';
  return '<span style="color:var(--green);">✓ Invoiced' + (g.last_invoice_number ? ' (' + esc(g.last_invoice_number) + ')' : '') + '</span>'
    + (n < 0 ? ' <span style="color:var(--red);">— client now has fewer extras than invoiced</span>' : '');
}
async function rpInvoice(){
  var sub = window._rpSub, g = window._rpG || {};
  if(!sub || !rpCur) return;
  var n = (sub.extras || 0) - (g.invoiced_extras || 0);
  if(n <= 0){ toast('', 'Nothing new to invoice', ''); return; }
  var rate = sub.extras ? sub.extra_total / sub.extras : 1, total = n * rate;
  var to = prompt('Send invoice for ' + n + ' extra' + (n > 1 ? 's' : '') + ' (£' + total.toFixed(2) + ') to:', sub.client_email || '');
  if(!to) return; to = to.trim();
  if(!/^\S+@\S+\.\S+$/.test(to)){ toast('', 'Enter a valid email', ''); return; }
  try{
    var API = window.EVENTS_API || 'https://impactgrid-events-api.onrender.com', sb = getSupabase();
    var biz = (typeof _bizSettings !== 'undefined' && _bizSettings) ? _bizSettings : {}, ls = function(k){ return localStorage.getItem(k) || ''; };
    var num = parseInt(ls('ig_last_inv_num') || '2', 10), invNo = '';
    for(var k = 0; k < 50; k++){
      num++; invNo = 'INV-' + String(num).padStart(6, '0');
      var ex = await sb.from('invoices').select('invoice_number').eq('invoice_number', invNo).limit(1);
      if(!(ex.data && ex.data.length)) break;
    }
    var fmt = function(d){ return d.toISOString().split('T')[0]; }, due = new Date(); due.setDate(due.getDate() + 7);
    var lines = [{ description:'Extra edited photos — ' + (rpCur.name || 'RAW gallery') + ' (' + n + ' × £' + rate.toFixed(2) + ')', qty:n, rate:rate, amount:total }];
    var bank = { name: biz.account_name || ls('ig_biz_account_name'), no: biz.account_number || ls('ig_biz_account_number'), sort: biz.sort_code || ls('ig_biz_sort_code') };
    var invoice = { invoice_number:invNo, invoice_date:fmt(new Date()), due_date:fmt(due), client_name:sub.client_name || 'Client',
      line_items:lines, discount:0, subtotal:total, total:total, balance_due:total, notes:'Thanks for your business.',
      payment_info:[bank.name, bank.no ? 'Account Number: ' + bank.no : '', bank.sort ? 'Sort Code: ' + bank.sort : ''].filter(Boolean).join(' | ') };
    var bizName = biz.biz_name || ls('ig_biz_name') || 'Impact Grid Events';
    var r = await fetch(API + '/api/send-invoice', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({
      to:to, subject:'Your Invoice ' + invNo + ' — ' + bizName,
      message:'Dear ' + (sub.client_name || 'Client') + ',\n\nThank you for choosing extra edited photos. Please find your invoice attached for £' + total.toFixed(2) + '.\n\nKind regards,\n' + bizName,
      invoiceHtml:generateInvoiceHtml(invoice, to), invoiceNumber:invNo, bizName:bizName }) });
    if(!r.ok) throw new Error('Invoice email failed (' + r.status + ')');
    localStorage.setItem('ig_last_inv_num', String(num));
    var up = await sb.from('invoices').upsert({ invoice_number:invNo, invoice_date:invoice.invoice_date, due_date:invoice.due_date, client_name:invoice.client_name, client_email:to,
      lines:lines, discount:0, subtotal:total, total:total, notes:invoice.notes, sent:true, bank_name:bank.name, bank_account:bank.no, bank_sort:bank.sort,
      biz_name:bizName, biz_location:biz.biz_address || ls('ig_biz_address') }, { onConflict:'invoice_number' });
    if(up && up.error) toast('', 'Invoice sent, but not saved to your invoice list', up.error.message);
    await rpApi('admin/invoiced', { body:{ id:rpCur.id, number:invNo, extras:sub.extras } });
    toast('', 'Invoice ' + invNo + ' sent', to); rpOpen(rpCur.id, true);
  }catch(e){ toast('', 'Invoice failed', e.message); }
}

/* ── Progress, hide/unhide, email link ── */
function rpRenderTools(d){
  var g = d.gallery;
  var opened = g.open_count ? 'Opened ' + g.open_count + '×, last ' + new Date(g.last_opened_at).toLocaleString() : 'Not opened yet';
  var prog = d.submission ? 'Submitted ' + d.submission.count + ' picks' : (g.draft_count ? g.draft_count + ' picked so far (not submitted)' : 'No picks yet');
  document.getElementById('rpStats').innerHTML = '<b>Progress:</b> ' + opened + ' · ' + prog;
  rpPhotosCache = d.photos || []; rpPruneSel(); rpRenderPhotos();
}
function rpPruneSel(){ var ok = {}; rpPhotosCache.forEach(function(p){ ok[p.id] = 1; }); Object.keys(rpSel).forEach(function(k){ if(!ok[k]) delete rpSel[k]; }); }
function rpSelCount(){ return Object.keys(rpSel).length; }

/* Photo grid. Normal mode: tap = hide/unhide. Select mode: tap = tick for deleting. */
function rpRenderPhotos(){
  var bar = document.getElementById('rpPhotoBar'), grid = document.getElementById('rpPhotos'), n = rpSelCount();
  if(!bar || !grid) return;
  if(!rpPhotosCache.length){ bar.innerHTML = 'No proofs uploaded yet.'; grid.innerHTML = ''; return; }
  bar.innerHTML = rpSelMode
    ? '<b style="color:var(--text)">' + n + ' of ' + rpPhotosCache.length + ' selected</b>'
      + '<button class="btn btn-ghost btn-sm" onclick="rpSelAll()">Select all</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="rpSelNone()">Clear</button>'
      + '<button class="btn btn-ghost btn-sm" style="color:var(--red);" ' + (n ? '' : 'disabled ') + 'onclick="rpDeleteSelected()">Delete selected' + (n ? ' (' + n + ')' : '') + '</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="rpSelToggleMode()">Done</button>'
    : '<span>Tap a photo to hide it from the client (tap again to unhide).</span>'
      + '<button class="btn btn-ghost btn-sm" onclick="rpSelToggleMode()">Select &amp; delete</button>';
  grid.innerHTML = rpPhotosCache.map(function(p){
    var on = !!rpSel[p.id], act = rpSelMode ? 'rpTick(\'' + p.id + '\')' : 'rpHide(\'' + p.id + '\',' + (!p.hidden) + ')';
    return '<div onclick="' + act + '" title="' + esc(p.file_name) + '" style="position:relative;cursor:pointer;border-radius:6px;opacity:' + (p.hidden ? 0.3 : 1) + ';outline:' + (on ? '3px solid var(--accent)' : 'none') + ';outline-offset:-3px">'
      + '<img src="' + p.thumb + '" style="width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:6px;display:block">'
      + (rpSelMode ? '<span style="position:absolute;left:4px;top:4px;width:20px;height:20px;border-radius:50%;background:' + (on ? 'var(--accent)' : '#0008') + ';border:2px solid #fff;color:#000;font-size:13px;line-height:16px;text-align:center;font-weight:700">' + (on ? '✓' : '') + '</span>' : '')
      + (p.hidden ? '<span style="position:absolute;right:4px;bottom:4px;background:#000a;color:#fff;font-size:11px;padding:2px 6px;border-radius:4px">hidden</span>' : '') + '</div>';
  }).join('');
}
function rpSelToggleMode(){ rpSelMode = !rpSelMode; if(!rpSelMode) rpSel = {}; rpRenderPhotos(); }
function rpTick(id){ if(rpSel[id]) delete rpSel[id]; else rpSel[id] = 1; rpRenderPhotos(); }
function rpSelAll(){ rpPhotosCache.forEach(function(p){ rpSel[p.id] = 1; }); rpRenderPhotos(); }
function rpSelNone(){ rpSel = {}; rpRenderPhotos(); }
async function rpDeleteSelected(){
  var ids = Object.keys(rpSel); if(!rpCur || !ids.length) return;
  var picked = 0, sub = window._rpSub;
  if(sub && sub.items) sub.items.forEach(function(i){ if(rpSel[i.photo_id]) picked++; });
  var msg = 'Permanently delete ' + ids.length + ' proof' + (ids.length > 1 ? 's' : '') + ' from "' + rpCur.name + '"? This cannot be undone.'
    + (picked ? '\n\n' + picked + ' of them are in the client\'s submitted picks. Their RAW filenames stay in the picks list, but the client will no longer see them if they edit and resubmit.' : '');
  if(!confirm(msg)) return;
  try{
    var d = await rpApi('admin/photos/delete', { body:{ galleryId:rpCur.id, ids:ids } });
    toast('', d.removed + ' deleted', d.cloudinaryOk ? '' : 'Some Cloudinary files may remain — Cloudinary Cleanup will catch them');
    rpSel = {}; rpSelMode = false; rpOpen(rpCur.id, true);
  }catch(e){ toast('', 'Delete failed', e.message); }
}
async function rpHide(id, hidden){ try{ await rpApi('admin/hide', { body:{ id:id, hidden:hidden } }); rpOpen(rpCur.id, true); }catch(e){ toast('', 'Failed', e.message); } }
async function rpSend(){
  var to = document.getElementById('rpClientEmail').value.trim();
  if(!rpCur || !to){ toast('', 'Add the client email first', ''); return; }
  if(!confirm('Email the gallery link to ' + to + '?')) return;
  try{ await rpApi('admin/save', { body:{ id:rpCur.id, name:document.getElementById('rpName').value, clientName:document.getElementById('rpClient').value, limit:document.getElementById('rpLimit').value,
      welcome:document.getElementById('rpWelcome').value, pickBy:document.getElementById('rpPickBy').value, lockOnSubmit:document.getElementById('rpLockSub').checked, clientEmail:to, sortBy:document.getElementById('rpSort').value } });
    await rpApi('admin/send', { body:{ id:rpCur.id, to:to } }); toast('', 'Link sent', to);
  }catch(e){ toast('', 'Send failed', e.message); }
}

/* ── Upload (JPEGs only) ── */
async function rpUpload(fileList){
  if(!rpCur){ toast('', 'Save the gallery first', ''); return; }
  var plan = igPlanProofingUpload(fileList), prog = document.getElementById('rpProgress');
  var s = (plan.jpegCount + plan.rawCount + plan.ignored) + ' files detected<br><b>' + plan.jpegCount + ' JPEGs ready for upload</b><br>' + plan.rawCount + ' RAW files ignored (never uploaded)<br>' + plan.pairedCount + ' RAW + JPEG pairs verified';
  if(plan.orphanRaw.length) s += '<br><span style="color:var(--red);">⚠ ' + plan.orphanRaw.length + ' RAW without a JPEG proof: ' + plan.orphanRaw.slice(0,8).join(', ') + (plan.orphanRaw.length>8?'…':'') + '</span>';
  prog.innerHTML = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:10px 12px;margin-bottom:8px;font-size:12px;line-height:1.7;">' + s + '</div><div id="rpStatus" style="font-size:12px;"></div>';
  if(!plan.files.length){ toast('', 'No JPEG proofs found', ''); return; }
  if(plan.orphanRaw.length && !confirm(plan.orphanRaw.length + ' RAW file(s) have no matching JPEG and will be skipped. Upload the ' + plan.jpegCount + ' JPEGs anyway?')) return;
  var st = document.getElementById('rpStatus'), done = 0, failed = 0;
  for(var i = 0; i < plan.files.length; i++){
    var f = plan.files[i]; st.textContent = 'Uploading ' + (i+1) + ' / ' + plan.files.length + ' — ' + f.name;
    try{
      var web = await uploadToCloudinary(await rpWatermark(await resizeImage(f, 2000, 0.88)), 'proofing/' + rpCur.id + '/web');
      var th  = await uploadToCloudinary(await rpWatermark(await resizeImageToThumb(f)), 'proofing/' + rpCur.id + '/thumb');
      await rpApi('admin/photo', { body:{ galleryId:rpCur.id, file_name:f.name, raw_filename:plan.rawByFile.get(f) || '', taken_at:f.lastModified || 0,
        preview_url:th.secure_url, web_url:web.secure_url, web_public_id:web.public_id, thumb_public_id:th.public_id } });
      done++;
    }catch(e){ failed++; console.warn('[rpUpload]', f.name, e.message); }
  }
  st.innerHTML = '<b style="color:var(--green);">Done: ' + done + ' uploaded</b>' + (failed ? ' · <span style="color:var(--red);">' + failed + ' failed (see console)</span>' : '');
  rpOpen(rpCur.id, true);
}

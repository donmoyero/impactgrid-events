/* ════════════════════════════════════════════════════
   EVENTS MANAGEMENT — Firebase Firestore + Cloudinary
   Replaces Supabase entirely.
   DB  Firebase Firestore
   Storage Cloudinary (free 25GB)
════════════════════════════════════════════════════ */

/* Firebase is loaded via CDN <script> tags in admin.html before this file.
   The globals used here: firebase, firebase.initializeApp, firebase.firestore  */

/* Firebase config is fetched securely from the backend — API key never exposed in frontend code */
var db;
var _dbReady = false;
var _dbReadyCallbacks = [];

function onDbReady(fn){ if(_dbReady){ fn(); } else { _dbReadyCallbacks.push(fn); } }

fetch('https://impactgrid-events-api.onrender.com/api/firebase-config')
  .then(function(r){ return r.json(); })
  .then(function(firebaseConfig){
    if(!firebase.apps.length){ firebase.initializeApp(firebaseConfig); }
    db = firebase.firestore();
    _dbReady = true;
    _dbReadyCallbacks.forEach(function(fn){ fn(); });
    _dbReadyCallbacks = [];
  })
  .catch(function(err){
    console.error('Failed to load Firebase config:', err);
    var alertEl = document.getElementById('createEventAlert');
    if(alertEl){
      alertEl.textContent = '\u26a0\ufe0f Could not connect to database. Check your internet connection and refresh the page.';
      alertEl.style.cssText = 'display:block;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:14px;background:var(--red-dim);border:1px solid var(--red-glo);color:var(--red);';
    }
  });

/* Firestore helpers to replace the ES-module named imports */
var collection      = function(db, col)       { return db.collection(col); };
var doc             = function(db, col, id)   { return db.collection(col).doc(id); };
var addDoc          = function(colRef, data)  { return colRef.add(data); };
var getDoc          = function(docRef)        { return docRef.get(); };
var getDocs         = function(q)             { return q.get(); };
var updateDoc       = function(docRef, data)  { return docRef.update(data); };
var setDoc          = function(docRef, data, opts) { return docRef.set(data, opts || {}); };
var deleteDoc       = function(docRef)        { return docRef.delete(); };
var serverTimestamp = function()              { return firebase.firestore.FieldValue.serverTimestamp(); };

/* query / where / orderBy shims — build a Firestore query chain */
function query(colRef) {
  var q = colRef;
  for (var i = 1; i < arguments.length; i++) {
    q = arguments[i](q);
  }
  return q;
}
function where(field, op, val)  { return function(q) { return q.where(field, op, val); }; }
function orderBy(field, dir)    { return function(q) { return q.orderBy(field, dir || 'asc'); }; }

/* Wrap Firestore QuerySnapshot so .docs works the same as the modular SDK */
function normSnap(snap) {
  /* snap.docs already works in compat SDK — just return it unchanged */
  return snap;
}

/* ════════════════════════════════════════════════════
   CLOUDINARY CONFIG
   Sign up free at cloudinary.com get your cloud name
   Replace YOUR_CLOUD_NAME below
════════════════════════════════════════════════════ */
var CLOUDINARY_CLOUD_NAME  = 'dr7wqaqbm';
var CLOUDINARY_UPLOAD_PRESET = 'impactgrid_photos'; /* create unsigned preset in Cloudinary dashboard */

var EVENTS_API      = 'https://impactgrid-events-api.onrender.com';
var evWatermark     = true;
var evRequireCode   = true;
var selectedEventId = null;

/* ── helpers ── */
function esc(s){ var d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }

function setDefaultExpiry(){
  var el = document.getElementById('ev-expiry');
  if(!el) return;
  var d = new Date();
  d.setDate(d.getDate() + 30);
  el.value = d.toISOString().split('T')[0];
}

function generateCode(){
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code  = '';
  for(var i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  var el = document.getElementById('ev-code');
  if(el) el.value = code;
}

function slugify(text){
  return text.toLowerCase()
    .replace(/[^a-z0-9\s-]/g,'')
    .replace(/\s+/g,'-')
    .replace(/-+/g,'-')
    .trim();
}

function toggleWatermark(){
  evWatermark = !evWatermark;
  var el = document.getElementById('ev-watermark-toggle');
  if(el) el.classList.toggle('on', evWatermark);
}

function toggleRequireCode(){
  evRequireCode = !evRequireCode;
  var el = document.getElementById('ev-code-toggle');
  if(el) el.classList.toggle('on', evRequireCode);
}

/* ── Owner avatar preview ── */
var _ownerAvatarFile = null;

function previewOwnerAvatar(e){
  var file = e.target.files && e.target.files[0];
  if(!file) return;
  _ownerAvatarFile = file;
  var reader = new FileReader();
  reader.onload = function(ev){
    var img  = document.getElementById('ev-avatar-img');
    var ph   = document.getElementById('ev-avatar-placeholder');
    var clr  = document.getElementById('ev-avatar-clear');
    var wrap = document.getElementById('ev-avatar-preview');
    if(img)  { img.src = ev.target.result; img.style.display = 'block'; }
    if(ph)   ph.style.display = 'none';
    if(clr)  clr.style.display = '';
    if(wrap) wrap.style.borderStyle = 'solid';
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function clearOwnerAvatar(){
  _ownerAvatarFile = null;
  var img  = document.getElementById('ev-avatar-img');
  var ph   = document.getElementById('ev-avatar-placeholder');
  var clr  = document.getElementById('ev-avatar-clear');
  var wrap = document.getElementById('ev-avatar-preview');
  if(img)  { img.src = ''; img.style.display = 'none'; }
  if(ph)   ph.style.display = '';
  if(clr)  clr.style.display = 'none';
  if(wrap) wrap.style.borderStyle = 'dashed';
}

/* ════════════════════════════════════════════════════
   INVOICE HELPERS
════════════════════════════════════════════════════ */
var _invLineCount = 0;

function initInvoiceDefaults(){
  var today = new Date();
  var fmt   = function(d){ return d.toISOString().split('T')[0]; };
  var due   = new Date(); due.setDate(due.getDate() + 7);

  var dateEl = document.getElementById('inv-date');
  var dueEl  = document.getElementById('inv-due-date');
  if(dateEl && !dateEl.value) dateEl.value = fmt(today);
  if(dueEl  && !dueEl.value)  dueEl.value  = fmt(due);

  /* Auto-number: increment from last stored number */
  var numEl = document.getElementById('inv-number');
  if(numEl && !numEl.value){
    var last = parseInt(localStorage.getItem('ig_last_inv_num') || '2', 10);
    var next = last + 1;
    numEl.value = 'INV-' + String(next).padStart(6, '0');
  }

  /* Add first blank line item if none exist */
  var container = document.getElementById('inv-line-items');
  if(container && container.children.length === 0) addInvLineItem();
}

function addInvLineItem(desc, qty, rate){
  var container = document.getElementById('inv-line-items');
  if(!container) return;
  var id = ++_invLineCount;
  var row = document.createElement('div');
  row.id = 'inv-row-' + id;
  row.style.cssText = 'display:grid;grid-template-columns:1fr 80px 80px 80px 36px;gap:6px;margin-bottom:6px;';
  row.innerHTML = '<input type="text" value="' + esc(desc||'') + '" placeholder="e.g. Photography" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:6px 8px;color:var(--text);font-size:12px;" class="inv-desc"/>'+
    '<input type="number" value="' + (qty||1) + '" min="0" step="0.01" oninput="updateInvTotals()" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:6px 8px;color:var(--text);font-size:12px;text-align:center;" class="inv-qty"/>'+
    '<input type="number" value="' + (rate||0) + '" min="0" step="0.01" oninput="updateInvTotals()" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:6px 8px;color:var(--text);font-size:12px;text-align:right;" class="inv-rate"/>'+
    '<div class="inv-amount" style="display:flex;align-items:center;justify-content:flex-end;font-size:12px;font-weight:600;color:var(--text2);">£0.00</div>'+
    '<button onclick="removeInvLineItem(\'inv-row-'+id+'\')" style="background:var(--red-dim);border:1px solid var(--red-glo);color:var(--red);border-radius:var(--r);cursor:pointer;font-size:12px;" title="Remove">&times;</button>';
  container.appendChild(row);
  updateInvTotals();
}

function removeInvLineItem(rowId){
  var el = document.getElementById(rowId);
  if(el) el.remove();
  updateInvTotals();
}

function updateInvTotals(){
  var container = document.getElementById('inv-line-items');
  if(!container) return;
  var subtotal = 0;
  container.querySelectorAll('div[id^="inv-row-"]').forEach(function(row){
    var qty  = parseFloat(row.querySelector('.inv-qty').value)  || 0;
    var rate = parseFloat(row.querySelector('.inv-rate').value) || 0;
    var amt  = qty * rate;
    subtotal += amt;
    row.querySelector('.inv-amount').textContent = '£' + amt.toFixed(2);
  });
  var discount = parseFloat(document.getElementById('inv-discount').value) || 0;
  var total    = Math.max(0, subtotal - discount);
  document.getElementById('inv-subtotal').textContent = '£' + subtotal.toFixed(2);
  document.getElementById('inv-total').textContent    = '£' + total.toFixed(2);
  document.getElementById('inv-balance').textContent  = '£' + total.toFixed(2);
}

function collectInvoiceData(){
  var container = document.getElementById('inv-line-items');
  var lines = [];
  if(container){
    container.querySelectorAll('div[id^="inv-row-"]').forEach(function(row){
      var desc = row.querySelector('.inv-desc').value.trim();
      var qty  = parseFloat(row.querySelector('.inv-qty').value)  || 0;
      var rate = parseFloat(row.querySelector('.inv-rate').value) || 0;
      if(desc || qty || rate) lines.push({ description: desc, qty: qty, rate: rate, amount: qty * rate });
    });
  }
  var discount  = parseFloat(document.getElementById('inv-discount').value) || 0;
  var subtotal  = lines.reduce(function(s,l){ return s + l.amount; }, 0);
  var total     = Math.max(0, subtotal - discount);
  return {
    invoice_number : (document.getElementById('inv-number').value||'').trim(),
    invoice_date   : document.getElementById('inv-date').value,
    due_date       : document.getElementById('inv-due-date').value,
    client_name    : (document.getElementById('inv-client').value||'').trim(),
    line_items     : lines,
    discount       : discount,
    subtotal       : subtotal,
    total          : total,
    balance_due    : total,
    notes          : (document.getElementById('inv-notes').value||'').trim(),
    payment_info   : 'Account Name: Drussell Technical Services Ltd | Account Number: 10881117 | Sort Code: 231470'
  };
}

function resetInvoiceForm(){
  ['inv-number','inv-date','inv-due-date','inv-client','inv-notes'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.value = '';
  });
  var disc = document.getElementById('inv-discount'); if(disc) disc.value = '0';
  var container = document.getElementById('inv-line-items'); if(container) container.innerHTML = '';
  _invLineCount = 0;
  ['inv-subtotal','inv-total','inv-balance'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.textContent = '£0.00';
  });
}

window.addInvLineItem    = addInvLineItem;
window.removeInvLineItem = removeInvLineItem;
window.updateInvTotals   = updateInvTotals;
window.initInvoiceDefaults = initInvoiceDefaults;

/* ════════════════════════════════════════════════════
   CREATE EVENT
════════════════════════════════════════════════════ */
async function igCreateEvent(){
  var name       = document.getElementById('ev-name').value.trim();
  var expiry     = document.getElementById('ev-expiry').value;
  var code       = document.getElementById('ev-code').value.trim().toUpperCase();
  var eventDate  = document.getElementById('ev-date') ? document.getElementById('ev-date').value : '';
  var serviceId  = document.getElementById('ev-service') ? document.getElementById('ev-service').value : '';
  var alertEl    = document.getElementById('createEventAlert');

  function showAlert(msg, ok){
    alertEl.textContent = msg;
    alertEl.style.cssText = 'display:block;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:14px;'
      + (ok
        ? 'background:var(--green-dim);border:1px solid rgba(15,168,118,.25);color:var(--green);'
        : 'background:var(--red-dim);border:1px solid var(--red-glo);color:var(--red);');
  }

  if(!db){ showAlert(" Database not ready yet. Please wait a moment and try again.", false); return; }

  if(!name){ showAlert('Event name is required.', false); return; }
  if(!eventDate){ showAlert('Event date is required — this is what shows up in the client\'s reminder email.', false); return; }
  if(!code){ generateCode(); code = document.getElementById('ev-code').value; }
  if(!expiry){ setDefaultExpiry(); expiry = document.getElementById('ev-expiry').value; }

  var slug = slugify(name) + '-' + Date.now();

  try{
    /* Upload owner avatar to Cloudinary if one was chosen */
    var ownerAvatarUrl = null;
    if(_ownerAvatarFile){
      try{
        var avatarResult = await uploadToCloudinary(_ownerAvatarFile, 'owners');
        ownerAvatarUrl = avatarResult.secure_url;
      }catch(avatarErr){
        showAlert('Avatar upload failed (' + avatarErr.message + ') — continuing without it.', false);
      }
    }

    /* Collect email template & invoice before saving */
    var emailSubject = (document.getElementById('ev-email-subject') ? document.getElementById('ev-email-subject').value.trim() : '') || 'Your event is ready — {{event_name}}';
    var emailBody    = (document.getElementById('ev-email-body')    ? document.getElementById('ev-email-body').value.trim()    : '') || '';
    var invoiceData  = collectInvoiceData();

    /* Save event to Firestore */
    var evRef = await addDoc(collection(db, 'events'), {
      name             : name,
      service_id       : serviceId || null,
      event_date       : eventDate,
      owner_email      : document.getElementById('ev-owner')      ? document.getElementById('ev-owner').value.trim()      || null : null,
      owner_name       : document.getElementById('ev-owner-name') ? document.getElementById('ev-owner-name').value.trim() || null : null,
      owner_avatar_url : ownerAvatarUrl,
      event_code       : code,
      event_slug       : slug,
      expiry_date      : new Date(expiry).toISOString(),
      is_active        : true,
      email_subject    : emailSubject,
      email_body       : emailBody,
      invoice          : invoiceData,
      created_at       : serverTimestamp()
    });

    /* Bump invoice counter */
    if(invoiceData.invoice_number){
      var num = parseInt(invoiceData.invoice_number.replace(/\D/g,''), 10);
      if(!isNaN(num)) localStorage.setItem('ig_last_inv_num', String(num));
    }

    /* Save event settings */
    await addDoc(collection(db, 'event_settings'), {
      event_id          : evRef.id,
      require_code      : evRequireCode,
      watermark_enabled : evWatermark,
      created_at        : serverTimestamp()
    });

    showAlert(' Event created! Code: ' + code, true);
    toast(' ', 'Event created!', name + ' · Code: ' + code);

    var ownerEmail = document.getElementById('ev-owner') ? document.getElementById('ev-owner').value.trim() : '';
    var ownerName  = document.getElementById('ev-owner-name') ? document.getElementById('ev-owner-name').value.trim() : '';

    /* Reset form */
    ['ev-name','ev-owner','ev-owner-name','ev-code','ev-date'].forEach(function(id){
      var el = document.getElementById(id); if(el) el.value = '';
    });
    var evSvcEl = document.getElementById('ev-service'); if(evSvcEl) evSvcEl.value = '';
    resetInvoiceForm();
    /* Reset email fields */
    var subj = document.getElementById('ev-email-subject');
    var body = document.getElementById('ev-email-body');
    if(subj) subj.value = 'Your event is ready — {{event_name}}';
    if(body) body.value = 'Hi {{owner_name}},\n\nYour event gallery is ready! Here are your access details:\n\n Event: {{event_name}}\n Access Code: {{event_code}}\n Gallery Link: {{event_url}}\n\nShare the link and code with your guests so they can find their photos.\n\nIf you have any questions, just reply to this email.\n\n— ImpactGrid Events Team';
    setDefaultExpiry();
    evWatermark = true; evRequireCode = true;
    var wt = document.getElementById('ev-watermark-toggle'); if(wt) wt.classList.add('on');
    var ct = document.getElementById('ev-code-toggle');      if(ct) ct.classList.add('on');

    if(ownerEmail) sendOwnerNotification(ownerEmail, ownerName, name, code, slug, emailSubject, emailBody);

    setTimeout(function(){ nav('events', null); }, 1500);
    loadStats();

  }catch(err){
    showAlert('Error: ' + err.message, false);
  }
}

/* ════════════════════════════════════════════════════
   DESIGN — layout / transition / background. Lives directly on each
   event (event.design), edited from Manage Gallery → Design. A single
   studio-wide fallback (studio_settings/design_defaults) covers any
   gallery that hasn't been customized.
════════════════════════════════════════════════════ */
var LAYOUT_STYLES = [
  { value:'grid',      label:'Grid'            },
  { value:'masonry',   label:'Masonry'         },
  { value:'justified', label:'Justified Rows'  },
  { value:'collage',   label:'Collage'         },
  { value:'filmstrip', label:'Filmstrip'       },
];
var TRANSITION_STYLES = [
  { value:'fade',  label:'Fade'        },
  { value:'slide', label:'Slide'       },
  { value:'zoom',  label:'Zoom'        },
  { value:'none',  label:'Instant / None' },
];

/* ── STUDIO DEFAULT DESIGN ─────────────────────────────────────────
   There is no more shared "templates" collection. Design (Look, Layout,
   Transition, Background) lives directly on each event under `design`,
   edited from Manage Gallery → Design. The ONE thing that's still shared
   studio-wide is a single fallback used by any gallery that hasn't been
   customized yet — a single doc, studio_settings/design_defaults. */
var STOCK_DEFAULT_DESIGN = { look_id:'', layout_style:'grid', transition_style:'fade', background_type:'color', background_value:'#0f1020' };
var _studioDefaultDesign = null;

async function loadStudioDefaultDesign(){
  if(!db) return STOCK_DEFAULT_DESIGN;
  try{
    var snap = await getDoc(doc(db, 'studio_settings', 'design_defaults'));
    _studioDefaultDesign = snap.exists ? Object.assign({}, STOCK_DEFAULT_DESIGN, snap.data()) : Object.assign({}, STOCK_DEFAULT_DESIGN);
  }catch(e){
    console.error('[loadStudioDefaultDesign] error:', e);
    _studioDefaultDesign = Object.assign({}, STOCK_DEFAULT_DESIGN);
  }
  window._studioDefaultDesign = _studioDefaultDesign;
  if(window.updateTemplatePreview) window.updateTemplatePreview();
  return _studioDefaultDesign;
}

async function saveStudioDefaultDesign(design){
  await setDoc(doc(db, 'studio_settings', 'design_defaults'), design, { merge:true });
  _studioDefaultDesign = Object.assign({}, STOCK_DEFAULT_DESIGN, design);
  window._studioDefaultDesign = _studioDefaultDesign;
}
window.loadStudioDefaultDesign = loadStudioDefaultDesign;

/* ── VISUAL CARD PICKER (layout + transition) ─────────────────────
   Cards are built from LAYOUT_STYLES / TRANSITION_STYLES above and write
   into the hidden #tpl-layout / #tpl-transition inputs, so
   openTemplateModal() and saveTemplate() keep reading/writing .value
   exactly as before. Mini layouts mirror the real .layout-* CSS in
   event.html (grid / masonry / justified / collage / filmstrip). */
function tplTiles(n){ var h=''; for(var i=0;i<n;i++) h += '<div class="tpl-t"></div>'; return h; }

function tplMiniLayout(v){
  switch(v){
    case 'masonry':
      return '<div class="tpl-ml tpl-ml-masonry">'
        + '<div class="tpl-col"><div class="tpl-t" style="flex:3"></div><div class="tpl-t" style="flex:2"></div></div>'
        + '<div class="tpl-col"><div class="tpl-t" style="flex:2"></div><div class="tpl-t" style="flex:3"></div></div>'
        + '<div class="tpl-col"><div class="tpl-t" style="flex:3"></div><div class="tpl-t" style="flex:2"></div></div>'
      + '</div>';
    case 'justified':
      return '<div class="tpl-ml tpl-ml-justified">'
        + '<div class="tpl-row"><div class="tpl-t" style="flex:2"></div><div class="tpl-t" style="flex:1"></div><div class="tpl-t" style="flex:2"></div></div>'
        + '<div class="tpl-row"><div class="tpl-t" style="flex:1"></div><div class="tpl-t" style="flex:2"></div></div>'
      + '</div>';
    case 'collage':
      return '<div class="tpl-ml tpl-ml-collage">' + tplTiles(6) + '</div>';
    case 'filmstrip':
      return '<div class="tpl-ml tpl-ml-filmstrip">' + tplTiles(3) + '</div>';
    case 'grid':
    default:
      return '<div class="tpl-ml tpl-ml-grid">' + tplTiles(6) + '</div>';
  }
}

function tplMiniTransition(v){
  return '<div class="tpl-tr tpl-tr-' + v + '"><div class="tpl-tr-a"></div><div class="tpl-tr-b"></div></div>';
}

function tplRenderCards(containerId, inputId, styles, miniFn, thumbClass){
  var wrap = document.getElementById(containerId);
  var inp  = document.getElementById(inputId);
  if(!wrap || !inp) return;
  var cur = inp.value;
  wrap.innerHTML = styles.map(function(s){
    var on = s.value === cur;
    return '<button type="button" class="tpl-card' + (on ? ' sel' : '') + '" data-value="' + s.value + '" aria-pressed="' + on + '">'
      + '<div class="tpl-card-thumb' + (thumbClass ? ' ' + thumbClass : '') + '">' + miniFn(s.value) + '</div>'
      + '<div class="tpl-card-label">' + esc(s.label) + '</div>'
      + (s.tagline ? '<div class="tpl-card-sub">' + esc(s.tagline) + '</div>' : '')
    + '</button>';
  }).join('');
}

/* ── LOOK cards (Phase 4c) ─────────────────────────────────────────
   Looks are defined once in gallery-looks.js (window.GALLERY_LOOKS) and
   shared with event.html. '' = "Original" (the per-event-type skin). */
function tplLookList(){
  var list = [{ value:'', label:'Original', tagline:'Event-type style' }];
  (window.GALLERY_LOOKS || []).forEach(function(l){ list.push({ value:l.id, label:l.label, tagline:l.tagline }); });
  return list;
}
function tplLookLabel(id){
  var l = (window.galleryLookById && id) ? galleryLookById(id) : null;
  return l ? l.label : 'Original';
}
/* Tiny stand-in for a gallery in that look: its background, title font,
   accent button and three photo tiles using its gap + corner radius. */
function tplMiniLook(id){
  var look = (window.galleryLookById && id) ? galleryLookById(id) : null;
  if(!look){
    return '<div class="tpl-lk tpl-lk-orig"><div class="tpl-lk-title">Original</div><div class="tpl-lk-btn"></div></div>';
  }
  var c = look.c, f = look.f, sh = look.s;
  var g = Math.max(1, Math.round(sh.gap / 4));
  var r = Math.min(6, Math.round(sh.radius / 2.5));
  var tile = function(bg){ return '<div style="flex:1;background:' + bg + ';border-radius:' + r + 'px;"></div>'; };
  return '<div class="tpl-lk" style="background:' + c.bg + ';">'
    + '<div class="tpl-lk-title" style="font-family:' + f.head + ';font-weight:' + f.headWeight + ';text-transform:' + f.headCase + ';letter-spacing:' + f.headTrack + ';color:' + c.text + ';">Aa Wedding</div>'
    + '<div class="tpl-lk-btn" style="background:' + c.accent + ';"></div>'
    + '<div class="tpl-lk-row" style="gap:' + g + 'px;">' + tile(c.accent) + tile(c.text3) + tile(c.border2) + '</div>'
  + '</div>';
}
/* Picking a look also drops in that look's background colour (an existing
   image background is left alone). Layout / transition are NOT touched. */
function tplApplyLookDefaults(id){
  var look = (window.galleryLookById && id) ? galleryLookById(id) : null;
  if(!look) return;
  var typeEl = document.getElementById('tpl-bg-type');
  var valEl  = document.getElementById('tpl-bg-value');
  if(!typeEl || !valEl || typeEl.value === 'image') return;
  typeEl.value = 'color';
  tplBgTypeChanged();
  valEl.value = look.c.bg;
  updateTplBgPreview();
}

/* Re-reads #tpl-layout / #tpl-transition and redraws both card grids —
   call after those hidden inputs have been set (openTemplateModal does). */
function tplRenderPickers(){
  tplRenderCards('tpl-layout-cards',     'tpl-layout',     LAYOUT_STYLES,     tplMiniLayout);
  tplRenderCards('tpl-transition-cards', 'tpl-transition', TRANSITION_STYLES, tplMiniTransition);
  tplRenderCards('tpl-look-cards',       'tpl-look',       tplLookList(),     tplMiniLook, 'tpl-look-thumb');
}

/* One delegated click handler for every card in either grid. */
document.addEventListener('click', function(e){
  var card = e.target.closest ? e.target.closest('.tpl-card') : null;
  if(!card) return;
  var grid = card.parentNode;
  var inputId = grid && grid.getAttribute('data-tpl-input');
  if(!inputId) return;
  var inp = document.getElementById(inputId);
  if(!inp) return;
  inp.value = card.getAttribute('data-value');
  Array.prototype.forEach.call(grid.querySelectorAll('.tpl-card'), function(c){
    var on = c === card;
    c.classList.toggle('sel', on);
    c.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  if(inputId === 'tpl-look') tplApplyLookDefaults(inp.value);
  if(window.mgPushLiveDraft) mgPushLiveDraft();
});
window.tplRenderPickers = tplRenderPickers;
window.tplLookLabel = tplLookLabel;

/* Fills the (now inline, in the Design tab) tpl-look / tpl-layout /
   tpl-transition / tpl-bg-type / tpl-bg-value fields from a design object,
   then redraws the card pickers. Used by mgRenderDesign() below — this
   replaces the old openTemplateModal(), minus anything modal-specific. */
function mgFillDesignFields(design){
  var d = Object.assign({}, STOCK_DEFAULT_DESIGN, design || {});
  document.getElementById('tpl-layout').value = d.layout_style;
  document.getElementById('tpl-transition').value = d.transition_style;
  document.getElementById('tpl-look').value = d.look_id;
  document.getElementById('tpl-bg-type').value = d.background_type;
  tplBgTypeChanged(); /* sets tpl-bg-value's input type (color vs text) before we set its value below */
  document.getElementById('tpl-bg-value').value = d.background_value;
  var statusEl = document.getElementById('tpl-bg-upload-status');
  if(statusEl) statusEl.textContent = '';
  updateTplBgPreview();
  tplRenderPickers(); /* hidden #tpl-layout / #tpl-transition are set above — draw the cards + highlight the current pick */
}
window.mgFillDesignFields = mgFillDesignFields;

/* Reads the current state of the Design tab's fields back into a plain
   design object — used both to save to Firestore and to build the live
   preview draft pushed into the iframe on every change. */
function mgReadDesignFields(){
  return {
    layout_style     : document.getElementById('tpl-layout').value,
    transition_style : document.getElementById('tpl-transition').value,
    look_id          : document.getElementById('tpl-look').value || '',
    background_type  : document.getElementById('tpl-bg-type').value,
    background_value : document.getElementById('tpl-bg-value').value.trim(),
  };
}
window.mgReadDesignFields = mgReadDesignFields;

/* Background Type select (Color / Image) — swaps tpl-bg-value between a color
   swatch and a URL field, and shows/hides the upload control + preview. */
function tplBgTypeChanged(){
  var sel = document.getElementById('tpl-bg-type');
  if(!sel) return;
  var isImg = sel.value === 'image';
  var valEl = document.getElementById('tpl-bg-value');
  if(valEl){
    valEl.type = isImg ? 'text' : 'color';
    valEl.placeholder = isImg ? 'https://\u2026jpg or upload below' : '';
    if(!isImg && !/^#/.test(valEl.value)) valEl.value = '#0f1020';
  }
  var row = document.getElementById('tpl-bg-upload-row');
  if(row) row.style.display = isImg ? '' : 'none';
  updateTplBgPreview();
  if(window.mgPushLiveDraft) mgPushLiveDraft();
}

function updateTplBgPreview(){
  var typeEl = document.getElementById('tpl-bg-type');
  var valEl  = document.getElementById('tpl-bg-value');
  var prev   = document.getElementById('tpl-bg-preview');
  if(!typeEl || !valEl || !prev) return;
  var isImg = typeEl.value === 'image';
  if(isImg && valEl.value){
    prev.style.backgroundImage = "url('" + valEl.value.replace(/'/g, "%27") + "')";
    prev.style.display = 'block';
  } else {
    prev.style.display = 'none';
  }
}

/* Uploads a background image to Cloudinary and drops the resulting URL
   straight into tpl-bg-value, same folder convention as the rest of the app. */
async function handleTplBgUpload(input){
  var file = input.files && input.files[0];
  if(!file) return;
  var statusEl = document.getElementById('tpl-bg-upload-status');
  if(statusEl){ statusEl.style.color = 'var(--text3)'; statusEl.textContent = 'Uploading\u2026'; }
  try{
    var result = await uploadToCloudinary(file, 'gallery-design');
    document.getElementById('tpl-bg-value').value = result.secure_url;
    if(statusEl){ statusEl.style.color = 'var(--green)'; statusEl.textContent = 'Uploaded'; }
    updateTplBgPreview();
    if(window.mgPushLiveDraft) mgPushLiveDraft();
  }catch(e){
    if(statusEl){ statusEl.style.color = 'var(--red)'; statusEl.textContent = 'Upload failed: ' + e.message; }
  }
  input.value = '';
}

/* ── DESIGN TAB — save / set-as-default ── (see mgLoadDesign/mgRenderDesign
   further down, next to the rest of the Manage Gallery hub) */
async function mgSaveDesign(){
  if(!_mgEventId) return;
  var design = mgReadDesignFields();
  var btn = document.getElementById('mgDesignSaveBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Saving\u2026'; }
  try{
    await updateDoc(doc(db, 'events', _mgEventId), { design: design });
    if(_mgEventData) _mgEventData.design = design;
    toast(' ', 'Design saved', 'This gallery now uses its own look.');
    mgRefreshPreview(); /* full reload, confirms what's actually persisted */
  }catch(e){
    toast(' ', 'Save failed', e.message);
  }
  if(btn){ btn.disabled = false; btn.textContent = 'Save Design'; }
}
window.mgSaveDesign = mgSaveDesign;

async function mgSetDesignAsStudioDefault(){
  if(!confirm('Make this the Studio Default? Every gallery that hasn\u2019t been customized will start looking like this.')) return;
  try{
    await saveStudioDefaultDesign(mgReadDesignFields());
    toast(' ', 'Studio Default updated', '');
  }catch(e){
    toast(' ', 'Failed to update Studio Default', e.message);
  }
}
window.mgSetDesignAsStudioDefault = mgSetDesignAsStudioDefault;

/* Services no longer carry a default gallery design (that concept moved
   into per-event Design + one Studio Default) — kept as a no-op so any
   remaining onchange="onEventServiceSelect()" wiring doesn't error. */
async function onEventServiceSelect(){}
window.onEventServiceSelect = onEventServiceSelect;

async function sendOwnerNotification(ownerEmail, ownerName, eventName, eventCode, eventSlug, emailSubject, emailBody){
  if(!ownerEmail) return;
  var base     = 'https://impactgridgroup.com';
  var eventUrl = base + '/event.html?event=' + eventSlug + '&code=' + eventCode;

  /* Replace merge fields */
  function merge(str){
    return (str||'')
      .replace(/\{\{owner_name\}\}/g,  ownerName  || 'there')
      .replace(/\{\{event_name\}\}/g,  eventName  || '')
      .replace(/\{\{event_code\}\}/g,  eventCode  || '')
      .replace(/\{\{event_url\}\}/g,   eventUrl   || '');
  }

  var finalSubject = merge(emailSubject || 'Your event is ready — ' + eventName);
  var finalBody    = merge(emailBody    || 'Hi ' + (ownerName||'there') + ',\n\nYour event "' + eventName + '" is ready.\n\nCode: ' + eventCode + '\nLink: ' + eventUrl);

  try{
    var res  = await fetch(EVENTS_API + '/api/notify-owner', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ ownerEmail: ownerEmail, ownerName: ownerName, eventName: eventName, eventCode: eventCode, eventUrl: eventUrl, subject: finalSubject, body: finalBody })
    });
    if(!res.ok){
      var txt = await res.text();
      throw new Error('Server ' + res.status + ': ' + txt);
    }
    var data = await res.json();
    if(data.success){
      toast(' ', 'Owner notified!', 'Email sent to ' + ownerEmail);
    } else {
      throw new Error(data.error || 'Notification failed');
    }
  }catch(e){
    toast(' ', 'Owner email failed', e.message);
  }
}

/* ════════════════════════════════════════════════════
   LOAD EVENTS LIST
════════════════════════════════════════════════════ */
async function loadEvents(){
  var el = document.getElementById('eventsList');
  if(!el) return;
  el.innerHTML = '<div class="empty"><div class="empty-ico">⏳</div><div class="empty-txt">Loading…</div></div>';
  try{
    var q        = query(collection(db, 'events'), orderBy('created_at', 'desc'));
    var snap     = await getDocs(q);
    var data     = snap.docs.map(function(d){ return Object.assign({ id: d.id }, d.data()); });

    if(!data.length){
      el.innerHTML = '<div class="empty"><div class="empty-ico"> </div><div class="empty-txt">No events yet.</div></div>';
      return;
    }

    el.innerHTML = '<table><thead><tr><th>Event</th><th>Owner</th><th>Template</th><th>Code</th><th>Expiry</th><th>Status</th><th>Actions</th></tr></thead><tbody>'
      + data.map(function(ev){
          var expDate  = new Date(ev.expiry_date);
          var daysLeft = Math.ceil((expDate - new Date()) / (1000*60*60*24));
          var expStr   = expDate.toLocaleDateString('en-GB') + (daysLeft > 0 ? ' (' + daysLeft + 'd)' : ' Expired');
          var statusPill = ev.is_active
            ? '<span class="pill pill-active">Active</span>'
            : '<span class="pill pill-paused">Inactive</span>';
          /* Owner cell — avatar + name/email stack */
          var ownerCell = '<td style="white-space:nowrap;">';
          if(ev.owner_avatar_url || ev.owner_name || ev.owner_email){
            ownerCell += '<div style="display:flex;align-items:center;gap:8px;">';
            if(ev.owner_avatar_url){
              ownerCell += '<img src="' + esc(ev.owner_avatar_url) + '" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:1px solid var(--border);flex-shrink:0;" onerror="this.style.display=\'none\'"/>';
            } else {
              ownerCell += '<div style="width:32px;height:32px;border-radius:50%;background:var(--bg3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;"> </div>';
            }
            ownerCell += '<div>';
            if(ev.owner_name)  ownerCell += '<div style="font-size:12px;font-weight:600;color:var(--text);">'  + esc(ev.owner_name)  + '</div>';
            if(ev.owner_email) ownerCell += '<div style="font-size:11px;color:var(--text3);">' + esc(ev.owner_email) + '</div>';
            ownerCell += '</div></div>';
          } else {
            ownerCell += '<span style="color:var(--text3);font-size:12px;">—</span>';
          }
          ownerCell += '</td>';
          return '<tr>'
            + '<td style="font-weight:700;">' + esc(ev.name)
            + '<br><span style="font-size:10px;color:var(--text3);font-family:var(--fm);">' + esc(ev.event_slug||'') + '</span></td>'
            + ownerCell
            + '<td><span class="pill pill-applied" style="font-size:9px;">' + esc(ev.template||ev.type||'—') + '</span></td>'
            + '<td style="font-family:var(--fm);letter-spacing:.1em;font-size:12px;color:var(--gold);">' + esc(ev.event_code||'—') + '</td>'
            + '<td style="font-size:12px;color:' + (daysLeft < 5 ? 'var(--red)' : 'var(--text2)') + ';">' + expStr + '</td>'
            + '<td>' + statusPill + '</td>'
            + '<td><div class="td-actions">'
            + '<button class="btn btn-gold btn-sm" onclick="openManageGallery(\'' + ev.id + '\')"> Manage Gallery</button>'
            + '<a class="btn btn-ghost btn-sm" href="event.html?event=' + ev.event_slug + '&code=' + ev.event_code + '" target="_blank"> View Event</a>'
            + '<button class="btn btn-ghost btn-sm" onclick="openManageGallery(\'' + ev.id + '\');mgSwitchTab(\'design\')">Edit Design</button>'
            + '<button class="btn btn-ghost btn-sm" onclick="goUploadForEvent(\'' + ev.id + '\')"> Upload</button>'
            + (ev.owner_email ? '<button class="btn btn-ghost btn-sm" onclick="resendOwnerEmail(\'' + esc(ev.owner_email) + '\',\'' + esc(ev.name) + '\')"> Resend Email</button>' : '')
            + (ev.owner_email ? '<button class="btn btn-ghost btn-sm" onclick="sendEventReminder(\'' + esc(ev.owner_email) + '\',\'' + esc(ev.name) + '\')">⏰ Send Reminder</button>' : '')
            + '<button class="btn ' + (ev.is_active ? 'btn-red' : 'btn-green') + ' btn-sm" onclick="toggleEvent(\'' + ev.id + '\',' + ev.is_active + ')">'
            + (ev.is_active ? 'Deactivate' : 'Activate') + '</button>'
            + '<button class="btn btn-red btn-icon btn-sm" onclick="deleteEvent(\'' + ev.id + '\')">&times;</button>'
            + '</div></td></tr>';
        }).join('')
      + '</tbody></table>';
  }catch(e){
    el.innerHTML = '<div class="empty"><div class="empty-txt">Error: ' + esc(e.message) + '</div></div>';
  }
}

async function resendOwnerEmail(ownerEmail, eventName){
  if(!confirm('Resend access email to ' + ownerEmail + '?')) return;
  toast(' ', 'Sending…', 'Resending', true);
  try{
    var res  = await fetch(EVENTS_API + '/api/resend-owner-email', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ ownerEmail })
    });
    var data = await res.json();
    if(data.success) toast(' ', 'Email sent!', '');
    else toast(' ', 'Failed', data.error || '');
  }catch(e){ toast(' ', 'Error', e.message); }
}

async function sendEventReminder(ownerEmail, eventName){
  if(!confirm('Send a gallery reminder to ' + ownerEmail + ' for "' + eventName + '"?')) return;
  toast('⏰', 'Sending…', 'Sending reminder', true);
  try{
    var res  = await fetch(EVENTS_API + '/api/send-reminder', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ ownerEmail })
    });
    var data = await res.json();
    if(data.success) toast(' ', 'Reminder sent!', '');
    else toast(' ', 'Failed', data.error || '');
  }catch(e){ toast(' ', 'Error', e.message); }
}

async function toggleEvent(id, cur){
  await updateDoc(doc(db, 'events', id), { is_active: !cur });
  loadEvents(); loadStats();
  toast(cur ? '⏸' : '▶ ', cur ? 'Event deactivated' : 'Event activated', '');
}

async function deleteEvent(id){
  if(!confirm('Delete this event and ALL its photos? This cannot be undone.')) return;
  try{
    /* Delete all photos for this event from Firestore */
    var pSnap = await getDocs(query(collection(db, 'photos'), where('event_id', '==', id)));
    for(var pd of pSnap.docs){
      /* Delete from Cloudinary via your backend (optional) */
      var pData = pd.data();
      var idsToDelete = [pData.cloudinary_id, pData.web_public_id, pData.thumb_public_id].filter(Boolean);
      if(idsToDelete.length){
        try{
          var pres = await fetch(EVENTS_API + '/api/delete-photo', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ publicIds: idsToDelete, resourceType: pData.media_type === 'video' ? 'video' : 'image' })
          });
          if(!pres.ok) console.warn('[deleteEvent] Cloudinary delete failed for', pd.id, idsToDelete);
        }catch(e){ console.warn('[deleteEvent] Cloudinary delete request failed for', pd.id, e.message); }
      }
      await deleteDoc(doc(db, 'photos', pd.id));
    }
    /* Delete event settings */
    var sSnap = await getDocs(query(collection(db, 'event_settings'), where('event_id', '==', id)));
    for(var sd of sSnap.docs) await deleteDoc(doc(db, 'event_settings', sd.id));
  }catch(e){}
  await deleteDoc(doc(db, 'events', id));
  toast(' ', 'Event deleted', '');
  loadEvents(); loadStats();
}

/* ════════════════════════════════════════════════════
   MANAGE GALLERY — per-event hub (Overview built now;
   Photos / Cover / Design / Branding / Client Experience /
   Settings tabs are placeholders until their own phases)
════════════════════════════════════════════════════ */
var _mgEventId   = null;
var _mgEventData = null; /* full event doc, cached on hub load + kept in sync by Cover/Design actions */
var _mgActiveTab = 'overview';

function openManageGallery(eventId){
  _mgEventId = eventId;
  nav('managegallery', null);
}

/* ── LIVE PREVIEW — the real event.html in an iframe, next to the editor ──
   Not a mocked-up preview: same URL as "Preview Gallery", so it reflects
   whatever's actually saved (hidden/order/template etc). Reloaded on tab
   open and after any save that changes what the client sees; a manual
   Refresh button covers anything this doesn't catch automatically. */
function mgBuildPreviewUrl(){
  if(!_mgEventData || !_mgEventData.event_slug) return null;
  return 'event.html?event=' + _mgEventData.event_slug + '&code=' + _mgEventData.event_code + '&_pv=' + Date.now();
}
function mgRefreshPreview(){
  var url = mgBuildPreviewUrl();
  var frame = document.getElementById('mgPreviewFrame');
  var loading = document.getElementById('mgPreviewLoading');
  if(!frame || !url) return;
  if(loading) loading.style.display = 'flex';
  frame.src = url;
}
function mgPreviewLoaded(){
  var loading = document.getElementById('mgPreviewLoading');
  if(loading) loading.style.display = 'none';
}
window.mgRefreshPreview = mgRefreshPreview;
window.mgPreviewLoaded  = mgPreviewLoaded;

/* Desktop / mobile toggle for the live preview — just narrows the frame so
   event.html's own responsive CSS kicks in; no reload needed. */
function mgSetPreviewDevice(mode){
  var stage = document.getElementById('mgPreviewStage');
  if(!stage) return;
  var mobile = (mode === 'mobile');
  stage.classList.toggle('mg-dev-mobile', mobile);
  var d = document.getElementById('mgDevDesktop'), m = document.getElementById('mgDevMobile');
  if(d) d.classList.toggle('active', !mobile);
  if(m) m.classList.toggle('active', mobile);
}
window.mgSetPreviewDevice = mgSetPreviewDevice;

async function loadManageGallery(){
  if(!_mgEventId) { nav('events', null); return; }
  var id = _mgEventId;
  mgSwitchTab('overview');

  var nameEl = document.getElementById('mgEventName');
  var subEl  = document.getElementById('mgEventSub');
  var prevEl = document.getElementById('mgPreviewLink');
  var body   = document.getElementById('mgOverviewBody');
  if(nameEl) nameEl.textContent = 'Gallery';
  if(subEl)  subEl.textContent  = '';
  if(body)   body.innerHTML = '<div class="skel-wrap"><div class="skel-row" style="width:70%;"></div><div class="skel-row" style="width:50%;"></div></div>';

  try{
    var evSnap = await getDoc(doc(db, 'events', id));
    if(!evSnap.exists){ if(body) body.innerHTML = '<div class="empty"><div class="empty-txt">Event not found.</div></div>'; return; }
    var ev = evSnap.data();
    _mgEventData = Object.assign({ id: id }, ev);

    if(nameEl) nameEl.textContent = ev.name || 'Gallery';
    if(subEl)  subEl.textContent  = 'Client Gallery';
    if(prevEl) prevEl.href = 'event.html?event=' + ev.event_slug + '&code=' + ev.event_code;
    mgRefreshPreview();

    var photoCountP = getDocs(query(collection(db, 'photos'), where('event_id','==',id)));
    var designLabel = ev.design ? (tplLookLabel(ev.design.look_id) + ' · ' + (ev.design.layout_style||'grid')) : 'Studio Default';

    var results = await Promise.all([photoCountP]);
    var photoCount   = results[0].size;

    var expDate  = ev.expiry_date ? new Date(ev.expiry_date) : null;
    var expStr   = expDate ? expDate.toLocaleDateString('en-GB') : '—';
    var evDate   = ev.event_date ? new Date(ev.event_date).toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long', year:'numeric'}) : '—';

    function stat(label, value){
      return '<div><div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">' + esc(label) + '</div>'
        + '<div style="font-size:15px;font-weight:700;">' + value + '</div></div>';
    }

    if(body){
      body.innerHTML =
          stat('Gallery Status', ev.is_active ? '<span class="pill pill-active"> Active</span>' : '<span class="pill pill-paused"> Inactive</span>')
        + stat('Client', esc(ev.owner_name || '—') + (ev.owner_email ? '<br><span style="font-size:11px;font-weight:400;color:var(--text3);">' + esc(ev.owner_email) + '</span>' : ''))
        + stat('Event Date', esc(evDate))
        + stat('Photos', String(photoCount))
        + stat('Design', esc(designLabel))
        + stat('Expiry', esc(expStr))
        + '<div style="grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">'
        + '<button class="btn btn-gold btn-sm" onclick="goUploadForEvent(\'' + id + '\')"> Upload Photos</button>'
        + '<button class="btn btn-ghost btn-sm" onclick="mgSwitchTab(\'design\')">Edit Design</button>'
        + '<button class="btn ' + (ev.is_active ? 'btn-red' : 'btn-green') + ' btn-sm" onclick="toggleEvent(\'' + id + '\',' + ev.is_active + ')">' + (ev.is_active ? 'Deactivate' : 'Activate') + '</button>'
        + '</div>';
    }
  }catch(e){
    if(body) body.innerHTML = '<div class="empty"><div class="empty-txt">Error: ' + esc(e.message) + '</div></div>';
  }
}

function mgSwitchTab(tab){
  document.querySelectorAll('.mg-tab').forEach(function(b){ b.classList.remove('active'); });
  document.querySelectorAll('.mg-panel').forEach(function(p){ p.style.display = 'none'; });
  var btn   = document.getElementById('mg-tab-' + tab);
  var panel = document.getElementById('mg-panel-' + tab);
  if(btn)   btn.classList.add('active');
  if(panel) panel.style.display = 'block';
  _mgActiveTab = tab;
  if(tab === 'photos') mgLoadPhotos();
  if(tab === 'cover')  mgLoadCover();
  if(tab === 'design') mgLoadDesign();
  if(tab === 'branding')  mgLoadBranding();
  if(tab === 'clientexp') mgLoadClientExp();
  if(tab === 'settings')  mgLoadSettings();
}

/* ── PHOTOS TAB — featured / hide / drag-reorder ──
   Order is persisted as an `order` int (index * 10, same spacing
   convention as saveServiceOrder) so event.html can sort by it once
   it's set; events that haven't been reordered yet fall back to their
   old created_at-based sort there. */
var _mgPhotos        = [];
var _mgPhotoMeta     = {}; /* id -> {cloudinary_id, web_public_id, thumb_public_id, media_type}, for delete */
var _mgPhotoDragIdx  = null;

async function mgLoadPhotos(){
  if(!_mgEventId) return;
  var el = document.getElementById('mgPhotosGrid');
  if(el) el.innerHTML = '<div class="skel-wrap"><div class="skel-row" style="width:70%;"></div></div>';
  try{
    var snap = await getDocs(query(collection(db, 'photos'), where('event_id','==',_mgEventId)));
    var data = snap.docs.map(function(d){ return Object.assign({ id: d.id }, d.data()); });
    data.sort(function(a, b){
      var ao = typeof a.order === 'number' ? a.order : null;
      var bo = typeof b.order === 'number' ? b.order : null;
      if(ao !== null && bo !== null) return ao - bo;
      if(ao !== null) return -1;
      if(bo !== null) return 1;
      var ta = a.created_at && a.created_at.toMillis ? a.created_at.toMillis() : 0;
      var tb = b.created_at && b.created_at.toMillis ? b.created_at.toMillis() : 0;
      return ta - tb;
    });
    _mgPhotos = data;
    _mgPhotoMeta = {};
    data.forEach(function(p){
      _mgPhotoMeta[p.id] = {
        cloudinary_id  : p.cloudinary_id   || '',
        web_public_id  : p.web_public_id   || '',
        thumb_public_id: p.thumb_public_id || '',
        media_type     : p.media_type      || 'photo'
      };
    });
    mgRenderPhotos();
  }catch(e){
    if(el) el.innerHTML = '<div class="empty"><div class="empty-txt">Error: ' + esc(e.message) + '</div></div>';
  }
}

function mgRenderPhotos(){
  var el      = document.getElementById('mgPhotosGrid');
  var countEl = document.getElementById('mgPhotosCount');
  if(countEl) countEl.textContent = _mgPhotos.length ? (_mgPhotos.length + ' photo' + (_mgPhotos.length > 1 ? 's' : '')) : '';
  if(!el) return;
  if(!_mgPhotos.length){
    el.innerHTML = '<div class="empty"><div class="empty-txt">No photos yet. Use Upload Photos to add some.</div></div>';
    return;
  }
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;">'
    + _mgPhotos.map(function(p, idx){
        var isVid = p.media_type === 'video';
        return '<div class="mg-photo-card" draggable="true" '
          + 'ondragstart="mgPhotoDragStart(event,' + idx + ')" '
          + 'ondragover="mgPhotoDragOver(event)" '
          + 'ondragleave="mgPhotoDragLeave(event)" '
          + 'ondrop="mgPhotoDrop(event,' + idx + ')" '
          + 'ondragend="mgPhotoDragEnd(event)" '
          + 'style="position:relative;border-radius:var(--r);overflow:hidden;background:var(--bg2);border:1px solid ' + (p.featured ? 'var(--gold)' : 'var(--border)') + ';' + (p.hidden ? 'opacity:.45;' : '') + '">'
          + '<img src="' + esc(p.preview_url) + '" style="width:100%;height:100px;object-fit:cover;display:block;pointer-events:none;" onerror="this.style.background=\'var(--bg3)\'"/>'
          + (isVid ? '<div style="position:absolute;top:4px;left:4px;background:rgba(0,0,0,.6);color:#fff;font-size:9px;padding:2px 6px;border-radius:4px;">Video</div>' : '')
          + (p.featured ? '<div style="position:absolute;top:4px;right:4px;background:var(--gold);color:#07090f;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;">Featured</div>' : '')
          + (p.hidden ? '<div style="position:absolute;bottom:26px;left:0;right:0;text-align:center;background:rgba(0,0,0,.65);color:#fff;font-size:9px;padding:2px 0;">Hidden from client</div>' : '')
          + '<div style="display:flex;gap:4px;padding:6px;background:var(--bg2);">'
          + '<button class="btn btn-ghost btn-sm" style="flex:1;font-size:10px;padding:4px 6px;" onclick="mgToggleFeatured(\'' + p.id + '\')">' + (p.featured ? 'Unfeature' : 'Feature') + '</button>'
          + '<button class="btn btn-ghost btn-sm" style="flex:1;font-size:10px;padding:4px 6px;" onclick="mgToggleHidden(\'' + p.id + '\')">' + (p.hidden ? 'Show' : 'Hide') + '</button>'
          + '<button class="btn btn-red btn-icon btn-sm" style="font-size:10px;padding:4px 6px;" onclick="mgDeletePhoto(\'' + p.id + '\')">&times;</button>'
          + '</div>'
          + '</div>';
      }).join('')
    + '</div>';
}

/* Drag-and-drop reordering (mirrors the Services tab pattern) */
function mgPhotoDragStart(e, idx){
  _mgPhotoDragIdx = idx;
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', String(idx)); } catch(err) {}
  e.currentTarget.classList.add('mg-photo-dragging');
}
function mgPhotoDragOver(e){
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('mg-photo-dragover');
}
function mgPhotoDragLeave(e){
  e.currentTarget.classList.remove('mg-photo-dragover');
}
function mgPhotoDrop(e, idx){
  e.preventDefault();
  e.currentTarget.classList.remove('mg-photo-dragover');
  if(_mgPhotoDragIdx === null || _mgPhotoDragIdx === idx) return;
  var moved = _mgPhotos.splice(_mgPhotoDragIdx, 1)[0];
  _mgPhotos.splice(idx, 0, moved);
  _mgPhotoDragIdx = null;
  mgRenderPhotos();
  mgSavePhotoOrder();
}
function mgPhotoDragEnd(e){
  e.currentTarget.classList.remove('mg-photo-dragging');
  document.querySelectorAll('.mg-photo-card.mg-photo-dragover').forEach(function(el){ el.classList.remove('mg-photo-dragover'); });
  _mgPhotoDragIdx = null;
}

async function mgSavePhotoOrder(){
  try{
    var updates = _mgPhotos.map(function(p, i){ return { id: p.id, order: i * 10 }; });
    await Promise.all(updates.map(function(u){
      return updateDoc(doc(db, 'photos', u.id), { order: u.order });
    }));
    _mgPhotos.forEach(function(p, i){ p.order = i * 10; });
    toast(' ', 'Order saved', '');
    mgRefreshPreview();
  }catch(e){
    toast(' ', 'Failed to save order', e.message);
    mgLoadPhotos();
  }
}

async function mgToggleFeatured(id){
  var p = _mgPhotos.find(function(x){ return x.id === id; });
  if(!p) return;
  var next = !p.featured;
  p.featured = next;
  mgRenderPhotos();
  try{ await updateDoc(doc(db, 'photos', id), { featured: next }); }
  catch(e){ p.featured = !next; mgRenderPhotos(); toast(' ', 'Failed to update', e.message); }
}

async function mgToggleHidden(id){
  var p = _mgPhotos.find(function(x){ return x.id === id; });
  if(!p) return;
  var next = !p.hidden;
  p.hidden = next;
  mgRenderPhotos();
  try{ await updateDoc(doc(db, 'photos', id), { hidden: next }); mgRefreshPreview(); }
  catch(e){ p.hidden = !next; mgRenderPhotos(); toast(' ', 'Failed to update', e.message); }
}

async function mgDeletePhoto(id){
  if(!confirm('Delete this photo?')) return;
  try{
    var result = await deletePhotoCore(id, _mgPhotoMeta[id]);
    _mgPhotos = _mgPhotos.filter(function(p){ return p.id !== id; });
    delete _mgPhotoMeta[id];
    mgRenderPhotos();
    mgRefreshPreview();
    if(result.cloudinaryOk) toast(' ', 'Photo deleted', '');
    else toast(' ', 'Removed from gallery', 'Cloudinary file cleanup failed — Cloudinary Cleanup will catch it later');
  }catch(e){ toast(' ', 'Error', e.message); }
}

window.openManageGallery = openManageGallery;
window.loadManageGallery = loadManageGallery;
window.mgSwitchTab       = mgSwitchTab;
window.mgLoadPhotos      = mgLoadPhotos;
window.mgPhotoDragStart  = mgPhotoDragStart;
window.mgPhotoDragOver   = mgPhotoDragOver;
window.mgPhotoDragLeave  = mgPhotoDragLeave;
window.mgPhotoDrop       = mgPhotoDrop;
window.mgPhotoDragEnd    = mgPhotoDragEnd;
window.mgToggleFeatured  = mgToggleFeatured;
window.mgToggleHidden    = mgToggleHidden;
window.mgDeletePhoto     = mgDeletePhoto;

/* ── COVER TAB — pick which photo represents the gallery ──
   Reuses the same photo fetch as the Photos tab (_mgPhotos) rather than
   querying again; images only, since a video can't be a cover photo. */
async function mgLoadCover(){
  if(!_mgEventId) return;
  var el = document.getElementById('mgCoverGrid');
  if(el) el.innerHTML = '<div class="skel-wrap"><div class="skel-row" style="width:70%;"></div></div>';
  try{
    if(!_mgEventData){
      var evSnap = await getDoc(doc(db, 'events', _mgEventId));
      if(evSnap.exists) _mgEventData = Object.assign({ id: _mgEventId }, evSnap.data());
    }
    await mgLoadPhotos(); /* populates _mgPhotos; also refreshes the (hidden) Photos tab grid, which is harmless */
    mgRenderCover();
  }catch(e){
    if(el) el.innerHTML = '<div class="empty"><div class="empty-txt">Error: ' + esc(e.message) + '</div></div>';
  }
}

function mgRenderCover(){
  var el = document.getElementById('mgCoverGrid');
  if(!el) return;
  var imgs = _mgPhotos.filter(function(p){ return p.media_type !== 'video'; });
  if(!imgs.length){
    el.innerHTML = '<div class="empty"><div class="empty-txt">No photos yet — upload some first, then pick a cover.</div></div>';
    return;
  }
  var currentCover = _mgEventData ? _mgEventData.cover_photo_id : null;
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;">'
    + imgs.map(function(p){
        var isCover = p.id === currentCover;
        return '<div style="position:relative;border-radius:var(--r);overflow:hidden;background:var(--bg2);border:1px solid ' + (isCover ? 'var(--gold)' : 'var(--border)') + ';">'
          + '<img src="' + esc(p.preview_url) + '" style="width:100%;height:100px;object-fit:cover;display:block;"/>'
          + (isCover ? '<div style="position:absolute;top:4px;right:4px;background:var(--gold);color:#07090f;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;">Cover</div>' : '')
          + '<div style="padding:6px;background:var(--bg2);">'
          + '<button class="btn ' + (isCover ? 'btn-red' : 'btn-gold') + ' btn-sm" style="width:100%;font-size:10px;padding:4px 6px;" onclick="' + (isCover ? 'mgClearCover()' : ("mgSetCover('" + p.id + "')")) + '">' + (isCover ? 'Remove Cover' : 'Set as Cover') + '</button>'
          + '</div>'
          + '</div>';
      }).join('')
    + '</div>';
}

async function mgSetCover(id){
  if(!_mgEventId || !_mgEventData) return;
  var prev = _mgEventData.cover_photo_id || null;
  _mgEventData.cover_photo_id = id;
  mgRenderCover();
  try{
    await updateDoc(doc(db, 'events', _mgEventId), { cover_photo_id: id });
    toast(' ', 'Cover updated', '');
  }catch(e){
    _mgEventData.cover_photo_id = prev;
    mgRenderCover();
    toast(' ', 'Failed to set cover', e.message);
  }
}

async function mgClearCover(){
  if(!_mgEventId || !_mgEventData) return;
  var prev = _mgEventData.cover_photo_id || null;
  _mgEventData.cover_photo_id = null;
  mgRenderCover();
  try{
    await updateDoc(doc(db, 'events', _mgEventId), { cover_photo_id: null });
    toast(' ', 'Cover removed', '');
  }catch(e){
    _mgEventData.cover_photo_id = prev;
    mgRenderCover();
    toast(' ', 'Failed to remove cover', e.message);
  }
}

window.mgLoadCover  = mgLoadCover;
window.mgSetCover   = mgSetCover;
window.mgClearCover = mgClearCover;

/* ── DESIGN TAB — Look / Layout / Transition / Background live in the
   Design panel itself now (moved out of the old Templates page + modal).
   Editing anything here pushes a live draft into the preview iframe
   instantly; nothing is written to Firestore until Save Design. */
async function mgLoadDesign(){
  if(!_mgEventId) return;
  var el = document.getElementById('mgDesignBody');
  if(el) el.innerHTML = '<div class="skel-wrap"><div class="skel-row" style="width:70%;"></div></div>';
  try{
    if(!_mgEventData){
      var evSnap = await getDoc(doc(db, 'events', _mgEventId));
      if(evSnap.exists) _mgEventData = Object.assign({ id: _mgEventId }, evSnap.data());
    }
    if(!_studioDefaultDesign) await loadStudioDefaultDesign();
    mgRenderDesign();
  }catch(e){
    if(el) el.innerHTML = '<div class="empty"><div class="empty-txt">Error: ' + esc(e.message) + '</div></div>';
  }
}

function mgRenderDesign(){
  var el = document.getElementById('mgDesignBody');
  if(!el || !_mgEventData) return;
  var usingDefault = !_mgEventData.design;
  var current = _mgEventData.design || _studioDefaultDesign || STOCK_DEFAULT_DESIGN;

  el.innerHTML =
      (usingDefault
        ? '<div style="font-size:11px;color:var(--text3);background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:8px 12px;margin-bottom:16px;">Using the <strong>Studio Default</strong> — nothing customized for this gallery yet. Change anything below and hit Save to make it this gallery\'s own look.</div>'
        : '')
    + '<div class="field-group">'
      + '<div class="field-label">Look</div>'
      + '<input type="hidden" id="tpl-look" value=""/>'
      + '<div class="tpl-picker tpl-look-picker" id="tpl-look-cards" data-tpl-input="tpl-look"></div>'
      + '<div class="field-hint">A look sets the gallery\'s colours, typography and spacing. Picking one also fills in a matching background colour (an image background is left as is). &ldquo;Original&rdquo; keeps the event-type styling.</div>'
    + '</div>'
    + '<div class="field-group">'
      + '<div class="field-label">Photo Layout</div>'
      + '<input type="hidden" id="tpl-layout" value="grid"/>'
      + '<div class="tpl-picker" id="tpl-layout-cards" data-tpl-input="tpl-layout"></div>'
    + '</div>'
    + '<div class="field-group">'
      + '<div class="field-label">Slideshow Transition</div>'
      + '<input type="hidden" id="tpl-transition" value="fade"/>'
      + '<div class="tpl-picker" id="tpl-transition-cards" data-tpl-input="tpl-transition"></div>'
    + '</div>'
    + '<div class="form-grid">'
      + '<div class="field-group">'
        + '<div class="field-label">Background Type</div>'
        + '<select id="tpl-bg-type" style="width:100%;" onchange="tplBgTypeChanged()">'
          + '<option value="color">Color</option>'
          + '<option value="image">Image</option>'
        + '</select>'
      + '</div>'
      + '<div class="field-group">'
        + '<div class="field-label">Background Value</div>'
        + '<input type="color" id="tpl-bg-value" value="#0f1020" style="width:100%;height:40px;" oninput="updateTplBgPreview();if(window.mgPushLiveDraft)mgPushLiveDraft();"/>'
      + '</div>'
    + '</div>'
    + '<div class="field-group" id="tpl-bg-upload-row" style="display:none;">'
      + '<div class="field-label">Background Image</div>'
      + '<div style="display:flex;align-items:center;gap:10px;">'
        + '<button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById(\'tpl-bg-file\').click()">Upload Image</button>'
        + '<input type="file" id="tpl-bg-file" accept="image/*" style="display:none;" onchange="handleTplBgUpload(this)"/>'
        + '<span id="tpl-bg-upload-status" style="font-size:11px;"></span>'
      + '</div>'
      + '<div id="tpl-bg-preview" style="display:none;margin-top:10px;width:100%;height:100px;border-radius:var(--r);border:1px solid var(--border2);background-size:cover;background-position:center;"></div>'
    + '</div>'
    + '<div style="display:flex;gap:10px;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--border);margin-top:6px;">'
      + '<button class="btn btn-ghost btn-sm" onclick="mgSetDesignAsStudioDefault()">Set as Studio Default</button>'
      + '<button class="btn btn-gold" id="mgDesignSaveBtn" onclick="mgSaveDesign()">Save Design</button>'
    + '</div>';

  mgFillDesignFields(current);
}
window.mgLoadDesign = mgLoadDesign;

/* ── LIVE PREVIEW DRAFT ─────────────────────────────────────────────
   Collects whatever's currently in the Design / Branding / Client
   Experience fields (whether or not it's been saved yet) and posts it
   into the preview iframe so changes show up instantly. event.html's
   message listener applies this in-memory, without touching Firestore. */
function mgCollectDraft(){
  var draft = {};
  if(document.getElementById('tpl-layout')) draft.design = mgReadDesignFields();
  if(_mgBrandingDraft) draft.branding = _mgBrandingDraft;
  if(_mgClientExpDraft) draft.clientExperience = _mgClientExpDraft;
  if(_mgEventData) draft.cover_photo_id = _mgEventData.cover_photo_id || null;
  return draft;
}
function mgPushLiveDraft(){
  var frame = document.getElementById('mgPreviewFrame');
  if(!frame || !frame.contentWindow) return;
  try{ frame.contentWindow.postMessage({ type:'ig-mg-draft', draft: mgCollectDraft() }, '*'); }
  catch(e){ /* cross-origin or not loaded yet — harmless, Save still persists normally */ }
}
window.mgPushLiveDraft = mgPushLiveDraft;

/* ── BRANDING TAB ─────────────────────────────────────────────────
   Per-event overrides of logo, accent colour and a short welcome message
   shown on the gallery. Stored directly on the event doc (event.branding). */
var _mgBrandingDraft = null;

async function mgLoadBranding(){
  if(!_mgEventId) return;
  var el = document.getElementById('mgBrandingBody');
  if(el) el.innerHTML = '<div class="skel-wrap"><div class="skel-row" style="width:70%;"></div></div>';
  try{
    if(!_mgEventData){
      var evSnap = await getDoc(doc(db, 'events', _mgEventId));
      if(evSnap.exists) _mgEventData = Object.assign({ id: _mgEventId }, evSnap.data());
    }
    _mgBrandingDraft = Object.assign({ logo_url:'', accent_color:'', welcome_message:'' }, _mgEventData.branding || {});
    mgRenderBranding();
  }catch(e){
    if(el) el.innerHTML = '<div class="empty"><div class="empty-txt">Error: ' + esc(e.message) + '</div></div>';
  }
}

function mgRenderBranding(){
  var el = document.getElementById('mgBrandingBody');
  if(!el) return;
  var b = _mgBrandingDraft;
  el.innerHTML =
      '<div class="field-group">'
        + '<div class="field-label">Gallery Logo <span style="font-weight:400;color:var(--text3);">(optional)</span></div>'
        + '<div style="display:flex;align-items:center;gap:10px;">'
          + '<button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById(\'mg-brand-logo-file\').click()">Upload Logo</button>'
          + '<input type="file" id="mg-brand-logo-file" accept="image/*" style="display:none;" onchange="mgHandleBrandingLogoUpload(this)"/>'
          + '<input type="text" id="mg-brand-logo-url" placeholder="Or paste an image URL" value="' + esc(b.logo_url) + '" oninput="mgOnBrandingChange()" style="flex:1;"/>'
        + '</div>'
        + (b.logo_url ? '<img src="' + esc(b.logo_url) + '" style="height:40px;margin-top:10px;border-radius:6px;"/>' : '')
        + '<div class="field-hint">Replaces the studio logo on this gallery only. Leave blank to use the default.</div>'
      + '</div>'
      + '<div class="field-group">'
        + '<div class="field-label">Accent Colour <span style="font-weight:400;color:var(--text3);">(optional)</span></div>'
        + '<input type="color" id="mg-brand-accent" value="' + esc(b.accent_color || '#c9a35c') + '" style="width:100%;height:40px;" oninput="mgOnBrandingChange()"/>'
        + '<div class="field-hint">Used for buttons and highlights on this gallery. Leave the Look\'s own accent by clearing this.</div>'
      + '</div>'
      + '<div class="field-group">'
        + '<div class="field-label">Welcome Message <span style="font-weight:400;color:var(--text3);">(optional)</span></div>'
        + '<textarea id="mg-brand-welcome" rows="3" placeholder="e.g. Thank you for celebrating with us — enjoy your photos!" oninput="mgOnBrandingChange()">' + esc(b.welcome_message) + '</textarea>'
        + '<div class="field-hint">Shown near the top of the gallery, above the photos.</div>'
      + '</div>'
      + '<div style="display:flex;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--border);margin-top:6px;">'
        + '<button class="btn btn-gold" id="mgBrandingSaveBtn" onclick="mgSaveBranding()">Save Branding</button>'
      + '</div>';
}

function mgOnBrandingChange(){
  _mgBrandingDraft = {
    logo_url        : (document.getElementById('mg-brand-logo-url')||{}).value || '',
    accent_color    : (document.getElementById('mg-brand-accent')||{}).value || '',
    welcome_message : (document.getElementById('mg-brand-welcome')||{}).value || '',
  };
  mgPushLiveDraft();
}
window.mgOnBrandingChange = mgOnBrandingChange;

async function mgHandleBrandingLogoUpload(input){
  var file = input.files && input.files[0];
  if(!file) return;
  try{
    var result = await uploadToCloudinary(file, 'gallery-branding');
    document.getElementById('mg-brand-logo-url').value = result.secure_url;
    mgOnBrandingChange();
    mgRenderBranding();
  }catch(e){
    toast(' ', 'Logo upload failed', e.message);
  }
  input.value = '';
}
window.mgHandleBrandingLogoUpload = mgHandleBrandingLogoUpload;

async function mgSaveBranding(){
  if(!_mgEventId) return;
  mgOnBrandingChange();
  var btn = document.getElementById('mgBrandingSaveBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Saving\u2026'; }
  try{
    await updateDoc(doc(db, 'events', _mgEventId), { branding: _mgBrandingDraft });
    if(_mgEventData) _mgEventData.branding = _mgBrandingDraft;
    toast(' ', 'Branding saved', '');
    mgRefreshPreview();
  }catch(e){
    toast(' ', 'Save failed', e.message);
  }
  if(btn){ btn.disabled = false; btn.textContent = 'Save Branding'; }
}
window.mgSaveBranding = mgSaveBranding;

/* ── CLIENT EXPERIENCE TAB ───────────────────────────────────────
   These live on the event_settings doc (one per event, auto-id) — the
   same doc that already holds require_code / watermark_enabled from
   event creation, so nothing new to migrate. */
var _mgClientExpDraft = null;
var _mgEventSettingsId = null; /* doc id of this event's event_settings row, once found/created */

async function mgGetEventSettingsDoc(eventId){
  var snap = await getDocs(query(collection(db, 'event_settings'), where('event_id','==',eventId)));
  if(!snap.empty) return { id: snap.docs[0].id, data: snap.docs[0].data() };
  var ref = await addDoc(collection(db, 'event_settings'), { event_id: eventId, require_code: true, watermark_enabled: true, allow_download: true, created_at: serverTimestamp() });
  return { id: ref.id, data: { event_id: eventId, require_code: true, watermark_enabled: true, allow_download: true } };
}

async function mgLoadClientExp(){
  if(!_mgEventId) return;
  var el = document.getElementById('mgClientExpBody');
  if(el) el.innerHTML = '<div class="skel-wrap"><div class="skel-row" style="width:70%;"></div></div>';
  try{
    var s = await mgGetEventSettingsDoc(_mgEventId);
    _mgEventSettingsId = s.id;
    _mgClientExpDraft = Object.assign({ require_code:true, allow_download:true, watermark_enabled:true }, s.data);
    mgRenderClientExp();
  }catch(e){
    if(el) el.innerHTML = '<div class="empty"><div class="empty-txt">Error: ' + esc(e.message) + '</div></div>';
  }
}

function mgToggleRow(label, hint, id, checked){
  return '<div style="display:flex;align-items:center;gap:10px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:12px 14px;margin-bottom:12px;">'
    + '<div class="toggle' + (checked ? ' on' : '') + '" id="' + id + '" onclick="mgFlipClientExpToggle(\'' + id + '\')"></div>'
    + '<div><div style="font-size:13px;font-weight:600;">' + esc(label) + '</div><div style="font-size:11px;color:var(--text3);">' + esc(hint) + '</div></div>'
  + '</div>';
}

function mgRenderClientExp(){
  var el = document.getElementById('mgClientExpBody');
  if(!el) return;
  var d = _mgClientExpDraft;
  el.innerHTML =
      mgToggleRow('Require Access Code', 'Guests must enter the code to view the gallery', 'mg-ce-code', d.require_code !== false)
    + mgToggleRow('Allow Downloads', 'Guests can download individual or all photos', 'mg-ce-download', d.allow_download !== false)
    + mgToggleRow('Watermark on Downloads', 'Adds your studio watermark to downloaded files', 'mg-ce-watermark', d.watermark_enabled !== false)
    + '<div style="display:flex;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--border);margin-top:6px;">'
      + '<button class="btn btn-gold" id="mgClientExpSaveBtn" onclick="mgSaveClientExp()">Save</button>'
    + '</div>';
}

function mgFlipClientExpToggle(id){
  var el = document.getElementById(id);
  if(!el) return;
  var on = !el.classList.contains('on');
  el.classList.toggle('on', on);
  var key = id === 'mg-ce-code' ? 'require_code' : (id === 'mg-ce-download' ? 'allow_download' : 'watermark_enabled');
  _mgClientExpDraft[key] = on;
  mgPushLiveDraft();
}
window.mgFlipClientExpToggle = mgFlipClientExpToggle;

async function mgSaveClientExp(){
  if(!_mgEventId || !_mgEventSettingsId) return;
  var btn = document.getElementById('mgClientExpSaveBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Saving\u2026'; }
  try{
    await updateDoc(doc(db, 'event_settings', _mgEventSettingsId), _mgClientExpDraft);
    toast(' ', 'Client Experience saved', '');
    mgRefreshPreview();
  }catch(e){
    toast(' ', 'Save failed', e.message);
  }
  if(btn){ btn.disabled = false; btn.textContent = 'Save'; }
}
window.mgSaveClientExp = mgSaveClientExp;

/* ── SETTINGS TAB — URL / access code / expiry / delete ── */
async function mgLoadSettings(){
  if(!_mgEventId) return;
  var el = document.getElementById('mgSettingsBody');
  if(el) el.innerHTML = '<div class="skel-wrap"><div class="skel-row" style="width:70%;"></div></div>';
  try{
    if(!_mgEventData){
      var evSnap = await getDoc(doc(db, 'events', _mgEventId));
      if(evSnap.exists) _mgEventData = Object.assign({ id: _mgEventId }, evSnap.data());
    }
    mgRenderSettings();
  }catch(e){
    if(el) el.innerHTML = '<div class="empty"><div class="empty-txt">Error: ' + esc(e.message) + '</div></div>';
  }
}

function mgRenderSettings(){
  var el = document.getElementById('mgSettingsBody');
  if(!el || !_mgEventData) return;
  var ev = _mgEventData;
  var url = window.location.origin + '/event.html?event=' + ev.event_slug + '&code=' + ev.event_code;
  var expiry = ev.expiry_date ? new Date(ev.expiry_date).toISOString().slice(0,10) : '';
  el.innerHTML =
      '<div class="field-group">'
        + '<div class="field-label">Gallery URL</div>'
        + '<div style="display:flex;gap:8px;"><input type="text" readonly value="' + esc(url) + '" style="flex:1;font-size:12px;"/><button class="btn btn-ghost btn-sm" onclick="copyEventLink(\'' + esc(ev.event_slug) + '\',\'' + esc(ev.event_code) + '\')">Copy</button></div>'
      + '</div>'
      + '<div class="field-group">'
        + '<div class="field-label">Access Code</div>'
        + '<div style="display:flex;gap:8px;"><input type="text" id="mg-set-code" value="' + esc(ev.event_code||'') + '" style="flex:1;font-family:var(--fm);letter-spacing:.1em;text-transform:uppercase;"/></div>'
      + '</div>'
      + '<div class="field-group">'
        + '<div class="field-label">Expiry Date</div>'
        + '<input type="date" id="mg-set-expiry" value="' + expiry + '"/>'
      + '</div>'
      + '<div style="display:flex;justify-content:flex-end;gap:10px;padding-top:8px;border-top:1px solid var(--border);margin-top:6px;">'
        + '<button class="btn btn-red btn-sm" onclick="deleteEvent(\'' + ev.id + '\')">Delete Gallery</button>'
        + '<button class="btn btn-gold" id="mgSettingsSaveBtn" onclick="mgSaveSettings()">Save Settings</button>'
      + '</div>';
}

async function mgSaveSettings(){
  if(!_mgEventId) return;
  var code = (document.getElementById('mg-set-code').value||'').trim().toUpperCase();
  var expiryVal = document.getElementById('mg-set-expiry').value;
  if(!code){ toast(' ', 'Access code is required', ''); return; }
  var btn = document.getElementById('mgSettingsSaveBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Saving\u2026'; }
  try{
    var payload = { event_code: code };
    if(expiryVal) payload.expiry_date = new Date(expiryVal).toISOString();
    await updateDoc(doc(db, 'events', _mgEventId), payload);
    Object.assign(_mgEventData, payload);
    toast(' ', 'Settings saved', '');
    mgRenderSettings();
  }catch(e){
    toast(' ', 'Save failed', e.message);
  }
  if(btn){ btn.disabled = false; btn.textContent = 'Save Settings'; }
}
window.mgSaveSettings = mgSaveSettings;

function goUploadForEvent(eventId){
  selectedEventId = eventId;
  nav('uploadphotos', null);
  setTimeout(function(){
    var sel = document.getElementById('upload-event-select');
    if(sel) sel.value = eventId;
    onUploadEventChange();
  }, 300);
}

/* ════════════════════════════════════════════════════
   UPLOAD PHOTOS — Cloudinary + Firestore
════════════════════════════════════════════════════ */
async function loadUploadPhotos(){
  var sel = document.getElementById('upload-event-select');
  if(!sel) return;
  sel.innerHTML = '<option value="">— Select an event —</option>';
  try{
    // Removed where('is_active') + orderBy combo — requires a composite Firestore index
    // that doesn't exist, causing a silent failure and empty dropdown. Filter in JS instead.
    var q    = query(collection(db, 'events'), orderBy('created_at','desc'));
    var snap = await getDocs(q);
    snap.docs.forEach(function(d){
      var ev  = d.data();
      if(!ev.is_active) return;
      var opt = document.createElement('option');
      opt.value       = d.id;
      opt.textContent = ev.name + ' (' + ev.event_code + ')';
      sel.appendChild(opt);
    });
    if(selectedEventId){ sel.value = selectedEventId; onUploadEventChange(); }
  }catch(e){ console.error('[loadUploadPhotos] Firestore error:', e.message); }
}

function onUploadEventChange(){
  var sel = document.getElementById('upload-event-select');
  var id  = sel ? sel.value : '';
  selectedEventId = id || null;
  document.getElementById('upload-dropcard').style.display         = id ? 'block' : 'none';
  document.getElementById('upload-photos-list-card').style.display = id ? 'block' : 'none';
  document.getElementById('upload-event-info').style.display       = id ? 'block' : 'none';
  if(id){
    var opt = sel.options[sel.selectedIndex];
    document.getElementById('upload-event-meta').textContent = ' ' + opt.textContent;
    loadEventPhotos();
  }
}

function handlePhotoInputChange(e){
  var files = Array.from(e.target.files||[]);
  if(files.length) uploadPhotos(files);
  e.target.value = '';
}

function resizeImage(file, maxWidth, quality){
  return new Promise(function(resolve){
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function(){
      var w = img.width, h = img.height;
      if(w > maxWidth){ h = Math.round(h * maxWidth / w); w = maxWidth; }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(function(blob){ resolve(blob); }, 'image/jpeg', quality);
    };
    img.onerror = function(){ URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

function resizeImageToThumb(file)      { return resizeImage(file, 800,  0.70); }
function resizeImageToWebVersion(file) { return resizeImage(file, 1400, 0.82); }

/* "Original" tier: true full-quality original whenever possible.
   Matches the old Supabase-era logic exactly:
   - uploadPhotos() already gatekeeps file.type to jpeg/png/webp before
     this ever runs, so there is no HEIC/non-standard branch here —
     no unreliable client-side canvas decode of formats browsers can't
     always read. iOS's web file-picker hands over an already-compatible
     format in the first place; the old code relied on that, not on
     converting anything itself.
   - File already under Cloudinary's 10MB cap return it completely
     untouched, zero quality loss, exact original bytes.
   - File too big re-encode at FULL resolution first, only stepping
     JPEG quality down in small increments until it fits. Dimensions are
     only reduced as an absolute last resort, so "original" stays as
     close to true original quality as possible. */
async function prepareOriginalForUpload(file){
  var MAX_BYTES = 9.5 * 1024 * 1024; /* safety margin under the 10MB cap */

  if(file.size <= MAX_BYTES){
    return file; /* true original, zero quality loss */
  }

  var qualities = [0.92, 0.85, 0.78, 0.70];
  for (var i = 0; i < qualities.length; i++){
    var blob = await resizeImage(file, 99999, qualities[i]); /* 99999 = keep native resolution */
    if (blob.size <= MAX_BYTES) return blob;
  }
  /* Still too big even at low quality, full res — now also cap dimensions */
  return await resizeImage(file, 2400, 0.85);
}

/* Blog images: wider cap (covers can be large/hero-sized) + high quality
   since blog photos are often the visual centerpiece of a post. Still
   shrinks huge phone-camera files (18MB+) down to a few hundred KB. */
function resizeImageForBlog(file) { return resizeImage(file, 1920, 0.88); }

/* Upload a blob to Cloudinary unsigned upload preset.
   NOTE: 'format' cannot be forced from here — Cloudinary restricts
   unsigned upload requests to a small safe parameter list, and
   'format' isn't one of them (it's silently ignored if you try).
   To mirror the old Supabase `contentType: 'image/jpeg'` override,
   set Format: jpg directly in the impactgrid_photos preset itself
   (Cloudinary dashboard Optimize and Deliver Format). That
   applies server-side regardless of source format, for every upload
   through this preset. */
async function uploadToCloudinary(blob, folder){
  var fd = new FormData();
  fd.append('file',         blob);
  fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  fd.append('folder',        'impactgrid/' + folder);
  var res  = await fetch('https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD_NAME + '/image/upload', {
    method: 'POST', body: fd
  });
  if(!res.ok){
    var errBody = await res.json().catch(function(){ return {}; });
    throw new Error(errBody.error && errBody.error.message ? errBody.error.message : 'Cloudinary upload failed (' + res.status + ')');
  }
  return await res.json(); /* { secure_url, public_id, ... } */
}

/* Upload a video file to Cloudinary (resource_type: video).
   No client-side re-encoding — videos are uploaded as-is.
   Same unsigned preset/cloud as photos; Cloudinary presets are
   resource-type agnostic unless explicitly restricted. */
async function uploadVideoToCloudinary(file, folder){
  var fd = new FormData();
  fd.append('file',         file);
  fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  fd.append('folder',        'impactgrid/' + folder);
  var res = await fetch('https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD_NAME + '/video/upload', {
    method: 'POST', body: fd
  });
  if(!res.ok){
    var errBody = await res.json().catch(function(){ return {}; });
    throw new Error(errBody.error && errBody.error.message ? errBody.error.message : 'Cloudinary video upload failed (' + res.status + ')');
  }
  return await res.json(); /* { secure_url, public_id, ... } */
}

/* Derives a JPG poster-frame URL from a Cloudinary video delivery URL,
   purely via URL manipulation — no extra upload/transformation call
   needed. Cloudinary generates the frame on first request and caches it.
   e.g. .../video/upload/v123/impactgrid/evt/original/abc.mp4
       .../video/upload/so_0/v123/impactgrid/evt/original/abc.jpg */
function cloudinaryVideoPosterUrl(secureUrl){
  var withOffset = secureUrl.replace('/video/upload/', '/video/upload/so_0/');
  return withOffset.replace(/\.[a-zA-Z0-9]+($|\?)/, '.jpg$1');
}

/* ════════════════════════════════════════════════════
   IN-BROWSER VIDEO COMPRESSION (ffmpeg.wasm)
   Kicks in only when a video exceeds MAX_VIDEO_BYTES.
   Downscales/re-encodes so the final file fits under the
   Cloudinary plan's upload cap, entirely client-side.
════════════════════════════════════════════════════ */
var _ffmpegInstance = null;
var _ffmpegLoading  = null;

/* Reads a video file's duration (seconds) via a throwaway <video> element. */
function getVideoDuration(file){
  return new Promise(function(resolve, reject){
    var url = URL.createObjectURL(file);
    var v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = function(){
      URL.revokeObjectURL(url);
      resolve(v.duration || 0);
    };
    v.onerror = function(){
      URL.revokeObjectURL(url);
      reject(new Error('Could not read video metadata'));
    };
    v.src = url;
  });
}

/* Lazily loads and caches a single shared ffmpeg.wasm instance
   (loading the ~25MB core more than once per session is wasteful). */
async function getFFmpeg(){
  if(_ffmpegInstance) return _ffmpegInstance;
  if(_ffmpegLoading)  return _ffmpegLoading;

  _ffmpegLoading = (async function(){
    var FFmpeg   = window.FFmpegWASM.FFmpeg;
    var ffmpeg   = new FFmpeg();
    var baseURL  = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    var coreURL  = await FFmpegUtil.toBlobURL(baseURL + '/ffmpeg-core.js', 'text/javascript');
    var wasmURL  = await FFmpegUtil.toBlobURL(baseURL + '/ffmpeg-core.wasm', 'application/wasm');
    await ffmpeg.load({ coreURL: coreURL, wasmURL: wasmURL });
    _ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return _ffmpegLoading;
}

/* Re-encodes `file` so the output comfortably fits under `maxBytes`.
   Picks a target bitrate from the video's duration, keeps 1080p when the
   bitrate budget allows it, and drops to 720p for longer/heavier files.
   `onProgress(pct)` receives 0-100 while ffmpeg works.
   Returns a File (same name, .mp4 extension) or throws on failure. */
async function compressVideoToFit(file, maxBytes, onProgress){
  var duration = await getVideoDuration(file);
  if(!duration || !isFinite(duration)) duration = 60; /* safe fallback */

  /* Leave ~8% headroom below the cap for container/audio overhead. */
  var budgetBytes  = maxBytes * 0.92;
  var budgetBits   = budgetBytes * 8;
  var audioKbps    = 96;
  var videoKbps    = Math.floor((budgetBits / duration / 1000) - audioKbps);

  /* Never go below a watchable floor, never exceed a sensible ceiling. */
  videoKbps = Math.max(300, Math.min(videoKbps, 4000));

  /* If the bitrate budget is thin, drop resolution so quality-per-pixel
     stays reasonable rather than smearing 1080p at a starved bitrate. */
  var scaleFilter = videoKbps < 1200 ? 'scale=-2:720' : 'scale=-2:1080';

  var ffmpeg = await getFFmpeg();

  if(onProgress){
    ffmpeg.on('progress', function(evt){
      var pct = Math.min(99, Math.round((evt.progress || 0) * 100));
      onProgress(pct);
    });
  }

  var inputName  = 'in' + (file.name.match(/\.[a-zA-Z0-9]+$/) || ['.mp4'])[0];
  var outputName = 'out.mp4';

  await ffmpeg.writeFile(inputName, await FFmpegUtil.fetchFile(file));

  await ffmpeg.exec([
    '-i', inputName,
    '-vf', scaleFilter,
    '-c:v', 'libx264',
    '-b:v', videoKbps + 'k',
    '-maxrate', videoKbps + 'k',
    '-bufsize', (videoKbps * 2) + 'k',
    '-preset', 'veryfast',
    '-c:a', 'aac',
    '-b:a', audioKbps + 'k',
    '-movflags', '+faststart',
    outputName
  ]);

  var data = await ffmpeg.readFile(outputName);
  await ffmpeg.deleteFile(inputName).catch(function(){});
  await ffmpeg.deleteFile(outputName).catch(function(){});

  var newName = file.name.replace(/\.[a-zA-Z0-9]+$/, '') + '-compressed.mp4';
  return new File([data.buffer], newName, { type: 'video/mp4' });
}

/* ════════════════════════════════════════════════════
   BLOG-ONLY CLOUDINARY (separate account from portfolio/events)
════════════════════════════════════════════════════ */
var BLOG_CLOUDINARY_CLOUD_NAME    = 'dsaym55pt';
var BLOG_CLOUDINARY_UPLOAD_PRESET = 'impactgrid_blog';

async function uploadToCloudinaryBlog(blob, folder){
  /* Resize/convert to a web-optimized JPEG before upload. This shrinks huge
     phone-camera photos (often 15-20MB+) down to a few hundred KB at high
     visual quality, avoiding Cloudinary's free-plan 10MB upload limit. */
  var webBlob = await resizeImageForBlog(blob);
  var fd = new FormData();
  fd.append('file',          webBlob);
  fd.append('upload_preset', BLOG_CLOUDINARY_UPLOAD_PRESET);
  /* NOTE: no 'folder' param — the 'impactgrid_upload' preset has a fixed
     Asset folder (impactgrid_videos) configured in Cloudinary's dashboard.
     Sending a conflicting folder param here causes a 400 Bad Request. */
  var res = await fetch('https://api.cloudinary.com/v1_1/' + BLOG_CLOUDINARY_CLOUD_NAME + '/image/upload', {
    method: 'POST', body: fd
  });
  if(!res.ok){
    var errBody = await res.json().catch(function(){ return {}; });
    throw new Error(errBody.error && errBody.error.message ? errBody.error.message : 'Cloudinary upload failed (' + res.status + ')');
  }
  return await res.json(); /* { secure_url, public_id, ... } */
}
window.uploadToCloudinaryBlog = uploadToCloudinaryBlog;

async function uploadPhotos(files){
  if(!selectedEventId){ toast(' ', 'No event selected', 'Pick an event first'); return; }
  var prog = document.getElementById('photoUploadProgress');
  prog.innerHTML = '';

  var MAX_VIDEO_BYTES         = 100 * 1024 * 1024; /* 100MB — typical Cloudinary plan cap */
  var MAX_COMPRESSIBLE_BYTES  = 1.5 * 1024 * 1024 * 1024; /* 1.5GB — above this, in-browser compression is unreliable */

  for(var i = 0; i < files.length; i++){
    var file    = files[i];
    var allowedImage = ['image/jpeg','image/png','image/webp'];
    var allowedVideo = ['video/mp4','video/quicktime','video/webm'];
    var isVideo = allowedVideo.includes(file.type);
    if(!allowedImage.includes(file.type) && !isVideo){
      toast(' ', 'Skipped ' + file.name, 'Not a supported photo or video type');
      continue;
    }
    if(isVideo && file.size > MAX_COMPRESSIBLE_BYTES){
      toast(' ', 'Skipped ' + file.name, 'Video too large to compress in-browser — trim it and try again');
      continue;
    }

    var rowId = 'prog-' + i;
    prog.innerHTML += '<div id="' + rowId + '" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:10px 12px;margin-bottom:6px;">'
      + '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">'
      + '<span style="font-size:12px;font-weight:600;">' + esc(file.name) + '</span>'
      + '<span id="' + rowId + '-pct" style="font-size:11px;color:var(--text3);">Uploading…</span>'
      + '</div>'
      + '<div class="prog-track"><div class="prog-fill" id="' + rowId + '-bar" style="width:0%;"></div></div>'
      + '</div>';

    var setStatus = (function(id){
      return function(msg, pct, color){
        var el  = document.getElementById(id + '-pct');
        var bar = document.getElementById(id + '-bar');
        if(el)  el.textContent   = msg;
        if(bar){ bar.style.width = pct + '%'; if(color) bar.style.background = color; }
      };
    })(rowId);

    try{
      var folder = selectedEventId;

      if(isVideo){
        /* Videos over the plan's cap get downscaled/re-encoded right in the
           browser (ffmpeg.wasm) before upload. Files already under the cap
           upload as-is, no re-encoding. Poster thumbnail is derived from the
           video URL itself (no extra upload/API call needed). */
        var uploadFile = file;
        if(file.size > MAX_VIDEO_BYTES){
          setStatus('Compressing video… 0%', 5, '');
          uploadFile = await compressVideoToFit(file, MAX_VIDEO_BYTES, function(pct){
            setStatus('Compressing video… ' + pct + '%', 5 + Math.round(pct * 0.5), '');
          });
          if(uploadFile.size > MAX_VIDEO_BYTES){
            toast(' ', 'Skipped ' + file.name, 'Still over 100MB after compression — trim it and try again');
            setStatus('Failed', 100, '#e33');
            continue;
          }
        }
        setStatus('Uploading video…', 60, '');
        var vidResult  = await uploadVideoToCloudinary(uploadFile, folder + '/original');
        var posterUrl  = cloudinaryVideoPosterUrl(vidResult.secure_url);

        setStatus('Saving record…', 85, '');
        await addDoc(collection(db, 'photos'), {
          event_id      : selectedEventId,
          media_type    : 'video',
          preview_url   : posterUrl,
          web_url       : vidResult.secure_url,
          original_url  : vidResult.secure_url,
          cloudinary_id : vidResult.public_id,
          created_at    : serverTimestamp()
        });

        setStatus(' Done', 100, 'var(--green)');
        continue;
      }

      /* 1 — Upload original to Cloudinary. Stays true original quality
         unless the file is too big for Cloudinary's free-plan cap. */
      setStatus('Uploading original…', 15, '');
      var origBlob   = await prepareOriginalForUpload(file);
      var origResult = await uploadToCloudinary(origBlob, folder + '/original');

      /* 2 — Upload web preview */
      setStatus('Creating web preview…', 40, '');
      var webBlob   = await resizeImageToWebVersion(file);
      var webResult = await uploadToCloudinary(webBlob, folder + '/web');

      /* 3 — Upload thumbnail */
      setStatus('Creating thumbnail…', 65, '');
      var thumbBlob   = await resizeImageToThumb(file);
      var thumbResult = await uploadToCloudinary(thumbBlob, folder + '/thumb');

      /* 4 — Save to Firestore photos collection */
      setStatus('Saving record…', 85, '');
      await addDoc(collection(db, 'photos'), {
        event_id      : selectedEventId,
        media_type    : 'photo',
        preview_url   : thumbResult.secure_url,
        web_url       : webResult.secure_url,
        original_url  : origResult.secure_url,
        cloudinary_id : origResult.public_id,
        web_public_id : webResult.public_id,
        thumb_public_id: thumbResult.public_id,
        created_at    : serverTimestamp()
      });

      setStatus(' Done', 100, 'var(--green)');

    }catch(err){
      setStatus(' ' + err.message, 100, 'var(--red)');
    }
  }

  toast(' ', 'Upload complete!', files.length + ' file' + (files.length > 1 ? 's' : '') + ' added');
  loadEventPhotos();
}

/* ════════════════════════════════════════════════════
   LOAD EVENT PHOTOS (thumbnail grid in admin)
════════════════════════════════════════════════════ */
var epSelectedPhotoIds = new Set();
var epPhotoMap = {}; /* id -> {cloudinary_id, web_public_id, thumb_public_id, media_type}, rebuilt on every load */

async function loadEventPhotos(){
  var el = document.getElementById('eventPhotosList');
  if(!el || !selectedEventId) return;
  el.innerHTML = '<div class="empty"><div class="empty-ico">⏳</div></div>';
  epSelectedPhotoIds = new Set();
  epPhotoMap = {};
  try{
    /* No orderBy here on purpose — combining where() + orderBy() on
       different fields requires a Firestore composite index to be
       created manually in the console first. Sorting client-side
       avoids that entirely and needs zero Firebase console setup. */
    var q    = query(collection(db, 'photos'), where('event_id','==',selectedEventId));
    var snap = await getDocs(q);
    var data = snap.docs.map(function(d){ return Object.assign({ id: d.id }, d.data()); });
    data.sort(function(a, b){
      var ta = a.created_at && a.created_at.toMillis ? a.created_at.toMillis() : 0;
      var tb = b.created_at && b.created_at.toMillis ? b.created_at.toMillis() : 0;
      return tb - ta; /* newest first */
    });

    if(!data.length){
      el.innerHTML = '<div class="empty"><div class="empty-ico"> </div><div class="empty-txt">No photos yet.</div></div>';
      epUpdateBulkUI();
      return;
    }

    el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;">'
      + data.map(function(p){
          epPhotoMap[p.id] = {
            cloudinary_id   : p.cloudinary_id || '',
            web_public_id   : p.web_public_id || '',
            thumb_public_id : p.thumb_public_id || '',
            media_type      : p.media_type || 'photo'
          };
          var viewUrl = p.web_url || p.preview_url;
          var dlUrl   = p.original_url || viewUrl;
          var isVid   = p.media_type === 'video';
          return '<div class="ep-photo-card" style="position:relative;border-radius:var(--r);overflow:hidden;background:var(--bg2);border:1px solid var(--border);">'
            + '<input type="checkbox" class="ep-photo-cb" data-id="' + esc(p.id) + '" onchange="epTogglePhotoSelect(\'' + esc(p.id) + '\',this)" '
            + 'style="position:absolute;top:4px;left:4px;width:18px;height:18px;cursor:pointer;z-index:2;"/>'
            + '<img src="' + esc(p.preview_url) + '" style="width:100%;height:90px;object-fit:cover;" onerror="this.style.background=\'var(--bg3)\'"/>'
            + (isVid ? '<div style="position:absolute;top:4px;right:28px;background:rgba(0,0,0,.6);color:#fff;font-size:10px;padding:2px 6px;border-radius:4px;">▶ Video</div>' : '')
            + '<a href="' + esc(viewUrl) + '" target="_blank" style="position:absolute;bottom:22px;left:0;right:0;text-align:center;background:rgba(0,0,0,.55);color:#fff;font-size:9px;padding:2px 0;text-decoration:none;"> View</a>'
            + '<a href="' + esc(dlUrl) + '" download target="_blank" style="position:absolute;bottom:0;left:0;right:0;text-align:center;background:rgba(0,0,0,.55);color:#fff;font-size:9px;padding:2px 0;text-decoration:none;"> Download</a>'
            + '<button onclick="deletePhoto(\'' + esc(p.id) + '\')" style="position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;background:var(--red);border:none;color:#fff;font-size:11px;cursor:pointer;z-index:2;">&times;</button>'
            + '</div>';
        }).join('')
      + '</div>';

    epUpdateBulkUI();
  }catch(e){
    el.innerHTML = '<div class="empty"><div class="empty-txt">Error: ' + esc(e.message) + '</div></div>';
  }
}

/* ── Multi-select bulk delete ── */
function epTogglePhotoSelect(id, checkboxEl){
  if(checkboxEl.checked) epSelectedPhotoIds.add(id);
  else epSelectedPhotoIds.delete(id);
  var card = checkboxEl.closest('.ep-photo-card');
  if(card) card.style.outline = checkboxEl.checked ? '2px solid var(--accent, #caa45d)' : 'none';
  epUpdateBulkUI();
}

function epToggleSelectAll(headerCb){
  var boxes = document.querySelectorAll('.ep-photo-cb');
  boxes.forEach(function(cb){
    cb.checked = headerCb.checked;
    epTogglePhotoSelect(cb.getAttribute('data-id'), cb);
  });
}

function epUpdateBulkUI(){
  var n        = epSelectedPhotoIds.size;
  var total    = document.querySelectorAll('.ep-photo-cb').length;
  var btn      = document.getElementById('epBulkDeleteBtn');
  var countEl  = document.getElementById('epSelectedCount');
  var headerCb = document.getElementById('epSelectAllCb');
  if(countEl) countEl.textContent = n;
  if(btn)     btn.style.display   = n > 0 ? 'inline-flex' : 'none';
  if(headerCb){
    headerCb.checked       = total > 0 && n === total;
    headerCb.indeterminate = n > 0 && n < total;
  }
}

async function epBulkDeleteSelected(){
  var ids = Array.from(epSelectedPhotoIds);
  if(!ids.length) return;
  if(!confirm('Delete ' + ids.length + ' selected photo' + (ids.length > 1 ? 's' : '') + '? This cannot be undone.')) return;

  var btn = document.getElementById('epBulkDeleteBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Deleting…'; }

  var failed = 0;
  var cloudinaryFailed = 0;
  for(var i = 0; i < ids.length; i++){
    try{
      var r = await deletePhotoCore(ids[i], epPhotoMap[ids[i]]);
      if(!r.cloudinaryOk) cloudinaryFailed++;
    }
    catch(e){ failed++; console.warn('Failed to delete', ids[i], e); }
  }

  if(failed){
    toast(' ', (ids.length - failed) + ' deleted, ' + failed + ' failed', 'Check console for details');
  } else if(cloudinaryFailed){
    toast(' ', ids.length + ' removed from gallery', cloudinaryFailed + ' Cloudinary file' + (cloudinaryFailed > 1 ? 's' : '') + ' failed to delete — Cloudinary Cleanup will catch ' + (cloudinaryFailed > 1 ? 'them' : 'it') + ' later');
  } else {
    toast(' ', ids.length + ' photo' + (ids.length > 1 ? 's' : '') + ' deleted', '');
  }

  loadEventPhotos();
}

/* Shared deletion logic (Cloudinary asset(s) + Firestore doc), used by
   both the single button and bulk delete so there's one code path.
   `meta` is the photo doc's data (or a subset): { cloudinary_id,
   web_public_id, thumb_public_id, media_type }. A photo has three
   separate Cloudinary uploads (original/web/thumb) — all three must be
   deleted or two of them orphan permanently. A video has just one, but
   needs resource_type:'video' or Cloudinary silently no-ops the delete.

   Always removes the Firestore doc (so the admin can always clean up
   their gallery even if Cloudinary is misconfigured) but reports back
   whether the Cloudinary side actually succeeded, instead of silently
   swallowing that failure the way this used to — orphans left behind
   by a failed call here still show up later in Cloudinary Cleanup. */
async function deletePhotoCore(id, meta){
  meta = meta || {};
  var ids = [meta.cloudinary_id, meta.web_public_id, meta.thumb_public_id].filter(Boolean);
  var cloudinaryOk = true;
  if(ids.length){
    try{
      var res = await fetch(EVENTS_API + '/api/delete-photo', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ publicIds: ids, resourceType: meta.media_type === 'video' ? 'video' : 'image' })
      });
      if(!res.ok){
        cloudinaryOk = false;
        var errData = await res.json().catch(function(){ return {}; });
        console.warn('[deletePhotoCore] Cloudinary delete failed for', id, ids, errData.error || res.status);
      }
    }catch(e){
      cloudinaryOk = false;
      console.warn('[deletePhotoCore] Cloudinary delete request failed for', id, e.message);
    }
  }
  await deleteDoc(doc(db, 'photos', id));
  return { cloudinaryOk: cloudinaryOk };
}

async function deletePhoto(id){
  if(!confirm('Delete this photo?')) return;
  try{
    var result = await deletePhotoCore(id, epPhotoMap[id]);
    if(result.cloudinaryOk){
      toast(' ', 'Photo deleted', '');
    } else {
      toast(' ', 'Removed from gallery', 'Cloudinary file cleanup failed — Cloudinary Cleanup will catch it later');
    }
    loadEventPhotos();
  }catch(e){ toast(' ', 'Error', e.message); }
}

/* ════════════════════════════════════════════════════
   DOWNLOAD REQUESTS
════════════════════════════════════════════════════ */
var allRequests = [];

async function loadDownloadRequests(){
  var el = document.getElementById('downloadRequestsList');
  if(!el) return;
  el.innerHTML = '<div class="empty"><div class="empty-ico">⏳</div><div class="empty-txt">Loading…</div></div>';
  try{
    var q    = query(collection(db, 'download_requests'), orderBy('created_at', 'desc'));
    var snap = await getDocs(q);
    allRequests = [];

    for(var d of snap.docs){
      var r = Object.assign({ id: d.id }, d.data());
      /* Fetch event name */
      if(r.event_id){
        try{
          var evDoc = await getDoc(doc(db, 'events', r.event_id));
          r.event_name = evDoc.exists ? evDoc.data().name : '—';
        }catch(e){ r.event_name = '—'; }
      }
      allRequests.push(r);
    }

    var pending = allRequests.filter(function(r){ return r.status === 'pending'; }).length;
    var badge   = document.getElementById('requestsBadge');
    if(badge){ badge.textContent = pending; badge.style.display = pending > 0 ? 'inline-flex' : 'none'; }

    if(!allRequests.length){
      el.innerHTML = '<div class="empty"><div class="empty-ico"> </div><div class="empty-txt">No download requests yet.</div></div>';
      return;
    }

    renderRequestsTable(allRequests);
    if(pending > 0) filterRequests('pending', document.getElementById('req-filter-pending'));

  }catch(e){
    el.innerHTML = '<div class="empty"><div class="empty-txt">Error: ' + esc(e.message) + '</div></div>';
  }
}

function filterRequests(status, btn){
  document.querySelectorAll('[id^="req-filter-"]').forEach(function(b){
    b.classList.remove('active'); b.style.cssText = '';
  });
  if(btn){ btn.classList.add('active'); btn.style.background = 'var(--gold)'; btn.style.color = '#fff'; }
  renderRequestsTable(status === 'all' ? allRequests : allRequests.filter(function(r){ return r.status === status; }));
}

function renderRequestsTable(data){
  var el = document.getElementById('downloadRequestsList');
  if(!data || !data.length){
    el.innerHTML = '<div class="empty"><div class="empty-ico"> </div><div class="empty-txt">No requests found.</div></div>';
    return;
  }
  el.innerHTML = '<table><thead><tr><th>Guest Email</th><th>Event</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead><tbody>'
    + data.map(function(r){
        var pc = { pending:'pill-pending', approved:'pill-active', rejected:'pill-rejected' }[r.status] || 'pill-pending';
        return '<tr>'
          + '<td style="font-weight:600;">' + esc(r.user_email) + '</td>'
          + '<td>' + esc(r.event_name || '—') + '</td>'
          + '<td><span class="pill ' + pc + '">' + (r.status||'pending') + '</span></td>'
          + '<td style="color:var(--text3);">' + (r.created_at && r.created_at.toDate ? r.created_at.toDate().toLocaleDateString('en-GB') : '—') + '</td>'
          + '<td><div class="td-actions">'
          + (r.status !== 'approved' ? '<button class="btn btn-green btn-sm" onclick="approveRequest(\'' + r.id + '\',\'' + esc(r.user_email) + '\',\'' + r.event_id + '\')"> Approve</button>' : '')
          + (r.status !== 'rejected' ? '<button class="btn btn-red btn-sm" onclick="rejectRequest(\'' + r.id + '\')"> Reject</button>' : '')
          + (r.status === 'approved' ? '<button class="btn btn-sm" style="background:var(--gold-dim);color:var(--gold);border:1px solid var(--gold-glo);" onclick="sendReviewRequest(\'' + r.id + '\',\'' + esc(r.user_email) + '\')"> Send Review Request</button>' : '')
          + '</div></td></tr>';
      }).join('')
    + '</tbody></table>';
}

async function approveRequest(id, email, eventId){
  if(!confirm('Approve download for ' + email + '? This will email them their photos.')) return;
  toast(' ', 'Approving…', '', true);
  try{
    var res  = await fetch(EVENTS_API + '/api/approve-request', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ requestId: id })
    });
    var data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Server error');
    toast(' ', 'Approved & email sent!', email + ' will receive their photos');
  }catch(e){
    await updateDoc(doc(db, 'download_requests', id), { status: 'approved' });
    toast(' ', 'Approved (email may have failed)', e.message);
  }
  loadDownloadRequests();
}

async function rejectRequest(id){
  if(!confirm('Reject this download request?')) return;
  await updateDoc(doc(db, 'download_requests', id), { status: 'rejected' });
  toast(' ', 'Request rejected', '');
  loadDownloadRequests();
}

async function sendReviewRequest(id, email){
  document.getElementById('srm-requestId').value = id;
  document.getElementById('srm-email').value = email;
  document.getElementById('srm-emailLabel').textContent = email;

  var svcEl = document.getElementById('srm-service');
  if (svcEl && svcEl.options.length <= 1 && typeof loadServiceOptions === 'function') {
    await loadServiceOptions(svcEl);
  }
  if (svcEl) svcEl.value = '';

  var modal = document.getElementById('sendReviewServiceModal');
  if (modal) modal.style.display = 'flex';
}

function closeSendReviewServiceModal(){
  var modal = document.getElementById('sendReviewServiceModal');
  if (modal) modal.style.display = 'none';
}

async function confirmSendReviewRequest(){
  var id      = document.getElementById('srm-requestId').value;
  var email   = document.getElementById('srm-email').value;
  var svcEl   = document.getElementById('srm-service');
  var serviceId = svcEl ? svcEl.value : '';
  var btn     = document.getElementById('srm-sendBtn');

  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  toast(' ', 'Sending…', '', true);
  try{
    var c = getSupabase();
    var { data: sessionData } = await c.auth.getSession();
    var token = sessionData && sessionData.session ? sessionData.session.access_token : null;
    var res  = await fetch(EVENTS_API + '/api/send-review-request', {
      method : 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { 'Authorization': 'Bearer ' + token } : {}),
      body   : JSON.stringify({ requestId: id, serviceId: serviceId || null })
    });
    var data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Server error');
    toast(' ', 'Review request sent!', email + ' will get an email asking for a review');
    closeSendReviewServiceModal();
  }catch(e){
    toast(' ', 'Failed to send', e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = ' Send'; }
  }
}

/* ════════════════════════════════════════════════════
   REVIEWS — filter helper
════════════════════════════════════════════════════ */
var _allReviews = [];

function filterReviews(status, btn){
  document.querySelectorAll('[id^="rev-filter-"]').forEach(function(b){
    b.classList.remove('active'); b.style.cssText = '';
  });
  if(btn){ btn.classList.add('active'); btn.style.background = 'var(--gold)'; btn.style.color = '#fff'; }
  var filtered = status === 'all'
    ? _allReviews
    : _allReviews.filter(function(r){ return r.status === status; });
  renderReviewsTable(filtered);
}

/* ════════════════════════════════════════════════════
   UPLOAD CELEBRANT PHOTO
════════════════════════════════════════════════════ */
async function uploadCelebrantPhoto(file, eventId){
  if(!file || !eventId) return;
  var result = await uploadToCloudinary(file, eventId + '/celebrant');
  return result.secure_url;
}

/* Export for non-module usage */
window.previewOwnerAvatar  = previewOwnerAvatar;
window.clearOwnerAvatar    = clearOwnerAvatar;
window.igCreateEvent        = igCreateEvent;
window.loadEvents           = loadEvents;
window.loadUploadPhotos     = loadUploadPhotos;
window.loadEventPhotos      = loadEventPhotos;
window.loadDownloadRequests = loadDownloadRequests;
window.loadDownloadRequests = loadDownloadRequests;
window.approveRequest       = approveRequest;
window.rejectRequest        = rejectRequest;
window.filterRequests       = filterRequests;
window.filterReviews        = filterReviews;
window.toggleEvent          = toggleEvent;
window.deleteEvent          = deleteEvent;
window.deletePhoto          = deletePhoto;
window.goUploadForEvent     = goUploadForEvent;
window.onUploadEventChange  = onUploadEventChange;
window.handlePhotoInputChange = handlePhotoInputChange;
window.generateCode         = generateCode;
window.toggleWatermark      = toggleWatermark;
window.toggleRequireCode    = toggleRequireCode;
window.setDefaultExpiry     = setDefaultExpiry;
window.uploadCelebrantPhoto = uploadCelebrantPhoto;
window.resendOwnerEmail     = resendOwnerEmail;
window.sendEventReminder    = sendEventReminder;

/* ════════════════════════════════════════════════════
   CLOUDINARY CLEANUP
   Scans for Cloudinary files nothing in the database references
   anymore, and lets the admin review + selectively delete them.
   See routes/api.js (/api/cloudinary-scan, /api/cloudinary-cleanup)
   for the safety rules (48h grace period, active/inactive events
   both protected as long as their photo docs exist, impactgrid/
   folder scoping).
════════════════════════════════════════════════════ */
var _ccOrphans  = [];
var _ccSelected = new Set();

function ccFormatBytes(n){
  if(!n) return '0 KB';
  if(n < 1024*1024) return (n/1024).toFixed(0) + ' KB';
  return (n/(1024*1024)).toFixed(1) + ' MB';
}

async function ccScan(){
  var btn = document.getElementById('ccScanBtn');
  var summary = document.getElementById('ccSummary');
  if(btn){ btn.disabled = true; btn.textContent = 'Scanning…'; }
  try{
    var res  = await fetch(EVENTS_API + '/api/cloudinary-scan');
    var data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Scan failed');

    _ccOrphans  = data.orphans || [];
    _ccSelected = new Set();

    document.getElementById('ccScannedCount').textContent = data.scannedCount;
    document.getElementById('ccInUseCount').textContent   = data.inUseCount;
    document.getElementById('ccOrphanCount').textContent  = data.orphanCount;
    document.getElementById('ccOrphanSize').textContent   = ccFormatBytes(data.orphanBytes);
    if(summary) summary.style.display = '';

    ccRenderList();
    toast(' ', 'Scan complete', data.orphanCount + ' unused file' + (data.orphanCount === 1 ? '' : 's') + ' found');
  }catch(e){
    toast(' ', 'Scan failed', e.message);
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = 'Scan for Unused Files'; }
  }
}

function ccRenderList(){
  var el = document.getElementById('ccOrphanList');
  if(!el) return;
  if(!_ccOrphans.length){
    el.innerHTML = '<div style="grid-column:1/-1;opacity:.6;font-size:13px;">Nothing found — everything in Cloudinary is still in use.</div>';
    ccUpdateSelectedCount();
    return;
  }
  el.innerHTML = _ccOrphans.map(function(o, i){
    var isVid = o.resourceType === 'video';
    var thumb = isVid
      ? '<div style="width:100%;height:90px;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--text3);">▶ Video</div>'
      : '<img src="' + o.url + '" style="width:100%;height:90px;object-fit:cover;" onerror="this.style.background=\'var(--bg3)\'"/>';
    return '<label style="display:block;border:1px solid var(--border);border-radius:var(--r);overflow:hidden;background:var(--bg2);cursor:pointer;">'
      + '<div style="position:relative;">'
      + thumb
      + '<input type="checkbox" data-cc-idx="' + i + '" onchange="ccToggleSelect(' + i + ',this)" style="position:absolute;top:4px;left:4px;width:18px;height:18px;cursor:pointer;"/>'
      + '</div>'
      + '<div style="padding:6px 8px;font-size:10px;color:var(--text3);word-break:break-all;">' + esc(o.publicId) + '</div>'
      + '<div style="padding:0 8px 8px;font-size:10px;color:var(--text3);">' + ccFormatBytes(o.bytes) + ' · ' + new Date(o.createdAt).toLocaleDateString() + '</div>'
      + '</label>';
  }).join('');
  ccUpdateSelectedCount();
}

function ccToggleSelect(idx, cb){
  if(cb.checked) _ccSelected.add(idx); else _ccSelected.delete(idx);
  ccUpdateSelectedCount();
}

function ccSelectAll(state){
  document.querySelectorAll('#ccOrphanList input[type=checkbox]').forEach(function(cb){
    cb.checked = state;
    var idx = Number(cb.getAttribute('data-cc-idx'));
    if(state) _ccSelected.add(idx); else _ccSelected.delete(idx);
  });
  ccUpdateSelectedCount();
}

function ccUpdateSelectedCount(){
  var el = document.getElementById('ccSelectedCount');
  if(el) el.textContent = _ccSelected.size;
}

async function ccDeleteSelected(){
  if(!_ccSelected.size){ toast(' ', 'Nothing selected', 'Tick the files you want to delete first'); return; }
  var items = Array.from(_ccSelected).map(function(i){ return _ccOrphans[i]; });
  if(!confirm('Permanently delete ' + items.length + ' file' + (items.length === 1 ? '' : 's') + ' from Cloudinary? This cannot be undone.')) return;

  var btn = document.getElementById('ccDeleteBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Deleting…'; }
  try{
    var res = await fetch(EVENTS_API + '/api/cloudinary-cleanup', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ items: items.map(function(o){ return { publicId: o.publicId, resourceType: o.resourceType, account: o.account }; }) })
    });
    var data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Delete failed');

    var deletedIdx = new Set(Array.from(_ccSelected));
    _ccOrphans  = _ccOrphans.filter(function(_, i){ return !deletedIdx.has(i); });
    _ccSelected = new Set();
    ccRenderList();
    document.getElementById('ccOrphanCount').textContent = _ccOrphans.length;
    toast(' ', 'Deleted', items.length + ' file' + (items.length === 1 ? '' : 's') + ' removed from Cloudinary');
  }catch(e){
    toast(' ', 'Delete failed', e.message);
  }finally{
    if(btn){ btn.disabled = false; btn.innerHTML = 'Delete Selected (<span id="ccSelectedCount">' + _ccSelected.size + '</span>)'; }
  }
}

window.ccScan           = ccScan;
window.ccSelectAll      = ccSelectAll;
window.ccToggleSelect   = ccToggleSelect;
window.ccDeleteSelected = ccDeleteSelected;

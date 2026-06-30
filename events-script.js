/* ════════════════════════════════════════════════════
   EVENTS MANAGEMENT — Firebase Firestore + Cloudinary
   Replaces Supabase entirely.
   DB  → Firebase Firestore
   Storage → Cloudinary (free 25GB)
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
   Sign up free at cloudinary.com → get your cloud name
   Replace YOUR_CLOUD_NAME below
════════════════════════════════════════════════════ */
var CLOUDINARY_CLOUD_NAME  = 'dr7wqaqbm';
var CLOUDINARY_UPLOAD_PRESET = 'impactgrid_photos'; /* ← create unsigned preset in Cloudinary dashboard */

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
    '<button onclick="removeInvLineItem(\'inv-row-'+id+'\')" style="background:var(--red-dim);border:1px solid var(--red-glo);color:var(--red);border-radius:var(--r);cursor:pointer;font-size:12px;" title="Remove">✕</button>';
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
  var name     = document.getElementById('ev-name').value.trim();
  var expiry   = document.getElementById('ev-expiry').value;
  var code     = document.getElementById('ev-code').value.trim().toUpperCase();
  var template = document.getElementById('ev-template').value;
  var alertEl  = document.getElementById('createEventAlert');

  function showAlert(msg, ok){
    alertEl.textContent = msg;
    alertEl.style.cssText = 'display:block;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:14px;'
      + (ok
        ? 'background:var(--green-dim);border:1px solid rgba(15,168,118,.25);color:var(--green);'
        : 'background:var(--red-dim);border:1px solid var(--red-glo);color:var(--red);');
  }

  if(!db){ showAlert("⚠️ Database not ready yet. Please wait a moment and try again.", false); return; }

  if(!name){ showAlert('Event name is required.', false); return; }
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
      type             : template,
      template         : template,
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
      template          : template,
      watermark_enabled : evWatermark,
      created_at        : serverTimestamp()
    });

    showAlert('✅ Event created! Code: ' + code, true);
    toast('✅', 'Event created!', name + ' · Code: ' + code);

    var ownerEmail = document.getElementById('ev-owner') ? document.getElementById('ev-owner').value.trim() : '';
    var ownerName  = document.getElementById('ev-owner-name') ? document.getElementById('ev-owner-name').value.trim() : '';

    /* Reset form */
    ['ev-name','ev-owner','ev-owner-name','ev-code'].forEach(function(id){
      var el = document.getElementById(id); if(el) el.value = '';
    });
    resetInvoiceForm();
    /* Reset email fields */
    var subj = document.getElementById('ev-email-subject');
    var body = document.getElementById('ev-email-body');
    if(subj) subj.value = 'Your event is ready — {{event_name}}';
    if(body) body.value = 'Hi {{owner_name}},\n\nYour event gallery is ready! Here are your access details:\n\n🎉 Event: {{event_name}}\n🔑 Access Code: {{event_code}}\n🔗 Gallery Link: {{event_url}}\n\nShare the link and code with your guests so they can find their photos.\n\nIf you have any questions, just reply to this email.\n\n— ImpactGrid Events Team';
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
      toast('📧', 'Owner notified!', 'Email sent to ' + ownerEmail);
    } else {
      throw new Error(data.error || 'Notification failed');
    }
  }catch(e){
    toast('⚠️', 'Owner email failed', e.message);
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
      el.innerHTML = '<div class="empty"><div class="empty-ico">📅</div><div class="empty-txt">No events yet.</div></div>';
      return;
    }

    el.innerHTML = '<table><thead><tr><th>Event</th><th>Owner</th><th>Template</th><th>Code</th><th>Expiry</th><th>Status</th><th>Actions</th></tr></thead><tbody>'
      + data.map(function(ev){
          var expDate  = new Date(ev.expiry_date);
          var daysLeft = Math.ceil((expDate - new Date()) / (1000*60*60*24));
          var expStr   = expDate.toLocaleDateString('en-GB') + (daysLeft > 0 ? ' (' + daysLeft + 'd)' : ' ⚠️ Expired');
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
              ownerCell += '<div style="width:32px;height:32px;border-radius:50%;background:var(--bg3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">👤</div>';
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
            + '<a class="btn btn-ghost btn-sm" href="event.html?event=' + ev.event_slug + '&code=' + ev.event_code + '" target="_blank">👁 View Event</a>'
            + '<button class="btn btn-ghost btn-sm" onclick="goUploadForEvent(\'' + ev.id + '\')">📤 Upload</button>'
            + (ev.owner_email ? '<button class="btn btn-ghost btn-sm" onclick="resendOwnerEmail(\'' + esc(ev.owner_email) + '\',\'' + esc(ev.name) + '\')">📧 Resend Email</button>' : '')
            + '<button class="btn ' + (ev.is_active ? 'btn-red' : 'btn-green') + ' btn-sm" onclick="toggleEvent(\'' + ev.id + '\',' + ev.is_active + ')">'
            + (ev.is_active ? 'Deactivate' : 'Activate') + '</button>'
            + '<button class="btn btn-red btn-icon btn-sm" onclick="deleteEvent(\'' + ev.id + '\')">✕</button>'
            + '</div></td></tr>';
        }).join('')
      + '</tbody></table>';
  }catch(e){
    el.innerHTML = '<div class="empty"><div class="empty-txt">Error: ' + esc(e.message) + '</div></div>';
  }
}

async function resendOwnerEmail(ownerEmail, eventName){
  if(!confirm('Resend access email to ' + ownerEmail + '?')) return;
  toast('📧', 'Sending…', 'Resending', true);
  try{
    var res  = await fetch(EVENTS_API + '/api/resend-owner-email', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ ownerEmail })
    });
    var data = await res.json();
    if(data.success) toast('✅', 'Email sent!', '');
    else toast('⚠️', 'Failed', data.error || '');
  }catch(e){ toast('⚠️', 'Error', e.message); }
}

async function toggleEvent(id, cur){
  await updateDoc(doc(db, 'events', id), { is_active: !cur });
  loadEvents(); loadStats();
  toast(cur ? '⏸' : '▶️', cur ? 'Event deactivated' : 'Event activated', '');
}

async function deleteEvent(id){
  if(!confirm('Delete this event and ALL its photos? This cannot be undone.')) return;
  try{
    /* Delete all photos for this event from Firestore */
    var pSnap = await getDocs(query(collection(db, 'photos'), where('event_id', '==', id)));
    for(var pd of pSnap.docs){
      /* Delete from Cloudinary via your backend (optional) */
      var pData = pd.data();
      if(pData.cloudinary_id){
        try{ await fetch(EVENTS_API + '/api/delete-photo', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ publicId: pData.cloudinary_id })
        }); }catch(e){}
      }
      await deleteDoc(doc(db, 'photos', pd.id));
    }
    /* Delete event settings */
    var sSnap = await getDocs(query(collection(db, 'event_settings'), where('event_id', '==', id)));
    for(var sd of sSnap.docs) await deleteDoc(doc(db, 'event_settings', sd.id));
  }catch(e){}
  await deleteDoc(doc(db, 'events', id));
  toast('🗑️', 'Event deleted', '');
  loadEvents(); loadStats();
}

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
    document.getElementById('upload-event-meta').textContent = '📅 ' + opt.textContent;
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
   - File already under Cloudinary's 10MB cap → return it completely
     untouched, zero quality loss, exact original bytes.
   - File too big → re-encode at FULL resolution first, only stepping
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
   (Cloudinary dashboard → Optimize and Deliver → Format). That
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
  if(!selectedEventId){ toast('⚠️', 'No event selected', 'Pick an event first'); return; }
  var prog = document.getElementById('photoUploadProgress');
  prog.innerHTML = '';

  for(var i = 0; i < files.length; i++){
    var file    = files[i];
    var allowed = ['image/jpeg','image/png','image/webp'];
    if(!allowed.includes(file.type)){
      toast('⚠️', 'Skipped ' + file.name, 'Not a supported image type');
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
        preview_url   : thumbResult.secure_url,
        web_url       : webResult.secure_url,
        original_url  : origResult.secure_url,
        cloudinary_id : origResult.public_id,
        created_at    : serverTimestamp()
      });

      setStatus('✅ Done', 100, 'var(--green)');

    }catch(err){
      setStatus('⚠️ ' + err.message, 100, 'var(--red)');
    }
  }

  toast('✅', 'Upload complete!', files.length + ' photo' + (files.length > 1 ? 's' : '') + ' added');
  loadEventPhotos();
}

/* ════════════════════════════════════════════════════
   LOAD EVENT PHOTOS (thumbnail grid in admin)
════════════════════════════════════════════════════ */
async function loadEventPhotos(){
  var el = document.getElementById('eventPhotosList');
  if(!el || !selectedEventId) return;
  el.innerHTML = '<div class="empty"><div class="empty-ico">⏳</div></div>';
  try{
    var q    = query(collection(db, 'photos'), where('event_id','==',selectedEventId), orderBy('created_at','desc'));
    var snap = await getDocs(q);
    var data = snap.docs.map(function(d){ return Object.assign({ id: d.id }, d.data()); });

    if(!data.length){
      el.innerHTML = '<div class="empty"><div class="empty-ico">📸</div><div class="empty-txt">No photos yet.</div></div>';
      return;
    }

    el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;">'
      + data.map(function(p){
          var viewUrl = p.web_url || p.preview_url;
          var dlUrl   = p.original_url || viewUrl;
          return '<div style="position:relative;border-radius:var(--r);overflow:hidden;background:var(--bg2);border:1px solid var(--border);">'
            + '<img src="' + esc(p.preview_url) + '" style="width:100%;height:90px;object-fit:cover;" onerror="this.style.background=\'var(--bg3)\'"/>'
            + '<a href="' + esc(viewUrl) + '" target="_blank" style="position:absolute;bottom:22px;left:0;right:0;text-align:center;background:rgba(0,0,0,.55);color:#fff;font-size:9px;padding:2px 0;text-decoration:none;">👁 View</a>'
            + '<a href="' + esc(dlUrl) + '" download target="_blank" style="position:absolute;bottom:0;left:0;right:0;text-align:center;background:rgba(0,0,0,.55);color:#fff;font-size:9px;padding:2px 0;text-decoration:none;">⬇ Download</a>'
            + '<button onclick="deletePhoto(\'' + p.id + '\',\'' + esc(p.cloudinary_id||'') + '\')" style="position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;background:var(--red);border:none;color:#fff;font-size:11px;cursor:pointer;">✕</button>'
            + '</div>';
        }).join('')
      + '</div>';
  }catch(e){
    el.innerHTML = '<div class="empty"><div class="empty-txt">Error: ' + esc(e.message) + '</div></div>';
  }
}

async function deletePhoto(id, cloudinaryId){
  if(!confirm('Delete this photo?')) return;
  try{
    /* Tell backend to remove from Cloudinary */
    if(cloudinaryId){
      await fetch(EVENTS_API + '/api/delete-photo', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ publicId: cloudinaryId })
      });
    }
    await deleteDoc(doc(db, 'photos', id));
    toast('🗑️', 'Photo deleted', '');
    loadEventPhotos();
  }catch(e){ toast('⚠️', 'Error', e.message); }
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
          r.event_name = evDoc.exists() ? evDoc.data().name : '—';
        }catch(e){ r.event_name = '—'; }
      }
      allRequests.push(r);
    }

    var pending = allRequests.filter(function(r){ return r.status === 'pending'; }).length;
    var badge   = document.getElementById('requestsBadge');
    if(badge){ badge.textContent = pending; badge.style.display = pending > 0 ? 'inline-flex' : 'none'; }

    if(!allRequests.length){
      el.innerHTML = '<div class="empty"><div class="empty-ico">📥</div><div class="empty-txt">No download requests yet.</div></div>';
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
    el.innerHTML = '<div class="empty"><div class="empty-ico">📭</div><div class="empty-txt">No requests found.</div></div>';
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
          + (r.status !== 'approved' ? '<button class="btn btn-green btn-sm" onclick="approveRequest(\'' + r.id + '\',\'' + esc(r.user_email) + '\',\'' + r.event_id + '\')">✓ Approve</button>' : '')
          + (r.status !== 'rejected' ? '<button class="btn btn-red btn-sm" onclick="rejectRequest(\'' + r.id + '\')">✕ Reject</button>' : '')
          + '</div></td></tr>';
      }).join('')
    + '</tbody></table>';
}

async function approveRequest(id, email, eventId){
  if(!confirm('Approve download for ' + email + '? This will email them their photos.')) return;
  toast('📤', 'Approving…', '', true);
  try{
    var res  = await fetch(EVENTS_API + '/api/approve-request', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ requestId: id })
    });
    var data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Server error');
    toast('✅', 'Approved & email sent!', email + ' will receive their photos');
  }catch(e){
    await updateDoc(doc(db, 'download_requests', id), { status: 'approved' });
    toast('✅', 'Approved (email may have failed)', e.message);
  }
  loadDownloadRequests();
}

async function rejectRequest(id){
  if(!confirm('Reject this download request?')) return;
  await updateDoc(doc(db, 'download_requests', id), { status: 'rejected' });
  toast('🗑️', 'Request rejected', '');
  loadDownloadRequests();
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

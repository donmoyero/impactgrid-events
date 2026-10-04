/* ════════════════════════════════════════════════════
   RAW + JPEG PROOFING — upload planner
   Select a whole camera folder. RAW files are NEVER uploaded:
   they are detected by extension before any upload starts,
   only the matching JPEGs go to Cloudinary, and each JPEG's
   Firestore doc remembers its RAW filename (raw_filename).
════════════════════════════════════════════════════ */
var IG_RAW_EXTS  = ['arw','cr2','cr3','nef','nrw','dng','raf','orf','rw2','pef','srw','x3f','3fr','iiq','erf','mrw','raw'];
var IG_JPEG_EXTS = ['jpg','jpeg'];

function igSplitName(name){
  var i = name.lastIndexOf('.');
  return { base: (i > 0 ? name.slice(0, i) : name).toLowerCase(), ext: (i > 0 ? name.slice(i + 1) : '').toLowerCase() };
}

/* Returns { hasRaw, files, rawByFile, rawCount, jpegCount, pairedCount, orphanRaw[], jpegOnly[] }
   files = what the normal uploader should process (RAWs removed). */
function igPlanProofingUpload(fileList){
  var all = Array.prototype.slice.call(fileList);
  var raws = {}, jpegs = {}, others = [];
  all.forEach(function(f){
    var p = igSplitName(f.name);
    if(IG_RAW_EXTS.indexOf(p.ext) > -1)       raws[p.base]  = f;
    else if(IG_JPEG_EXTS.indexOf(p.ext) > -1) jpegs[p.base] = f;
    else others.push(f);
  });
  var rawKeys = Object.keys(raws), jpegKeys = Object.keys(jpegs);
  var rawByFile = new Map(), paired = 0, orphanRaw = [], jpegOnly = [];
  rawKeys.forEach(function(k){
    if(jpegs[k]){ rawByFile.set(jpegs[k], raws[k].name); paired++; }
    else orphanRaw.push(raws[k].name);
  });
  jpegKeys.forEach(function(k){ if(!raws[k]) jpegOnly.push(jpegs[k].name); });
  return {
    hasRaw: rawKeys.length > 0,
    files: jpegKeys.map(function(k){ return jpegs[k]; }).concat(others),
    rawByFile: rawByFile,
    rawCount: rawKeys.length, jpegCount: jpegKeys.length, pairedCount: paired,
    orphanRaw: orphanRaw, jpegOnly: jpegOnly, totalSelected: all.length
  };
}

/* Summary box shown in the upload progress area. */
function igRenderPlanSummary(plan, el){
  var s = plan.totalSelected + ' files detected<br>'
        + '<b>' + plan.jpegCount + ' JPEGs ready for upload</b><br>'
        + plan.rawCount + ' RAW files ignored (never uploaded)<br>'
        + plan.pairedCount + ' RAW + JPEG pairs verified';
  if(plan.orphanRaw.length){
    s += '<br><span style="color:var(--red);">⚠ ' + plan.orphanRaw.length + ' RAW without a matching JPEG proof: '
      + plan.orphanRaw.slice(0, 8).join(', ') + (plan.orphanRaw.length > 8 ? '…' : '') + '</span>';
  }
  el.innerHTML = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:10px 12px;margin-bottom:8px;font-size:12px;line-height:1.7;">' + s + '</div>';
}


/* ── Admin: client selection card ── */
async function igLoadProofingCard(eventId){
  var card = document.getElementById('proofing-card'), body = document.getElementById('proofing-body');
  if(!card) return;
  card.style.display = 'none';
  if(!eventId) return;
  try{
    var ev = await db.collection('events').doc(eventId).get();
    if(!ev.exists || ev.data().mode !== 'proofing') return;
    card.style.display = 'block';
    var lim = ev.data().selection_limit || 0;
    body.innerHTML = 'Loading…';
    var c = getSupabase(), sd = await c.auth.getSession();
    var token = sd && sd.data && sd.data.session ? sd.data.session.access_token : null;
    var r = await fetch(EVENTS_API + '/api/proofing/admin/' + eventId, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
    var data = await r.json();
    if(!r.ok) throw new Error(data.error || 'Server error');
    var link = location.origin + '/event.html?event=' + ev.data().event_slug + '&code=' + ev.data().event_code;
    var head = '<div style="margin-bottom:10px;">Share link: <input readonly value="' + link + '" style="width:100%;font-size:12px;" onclick="this.select()"/>'
      + '<button class="btn btn-ghost btn-sm" style="margin-top:6px;" onclick="navigator.clipboard.writeText(\'' + link + '\');toast(\'\',\'Link copied!\',\'\')">Copy link</button> '
      + '<span class="field-hint">Limit: ' + (lim || 'none') + '</span></div>';
    var sub = data.submission;
    if(!sub){ body.innerHTML = head + '<div>No selection submitted yet.</div>'; return; }
    var names = sub.items.map(function(i){ return i.raw_filename || i.file_name || i.photo_id; });
    var stems = names.map(function(n){ return n.replace(/\.[^.]+$/, ''); });
    window._igProofNames = names; window._igProofStems = stems;
    body.innerHTML = head + '<div><b>' + esc(sub.client_name || 'Client') + '</b> ' + esc(sub.client_email || '') + ' — <b>' + sub.count + '</b> photos (v' + sub.revision + ', ' + new Date(sub.submitted_at).toLocaleString() + ')</div>'
      + (sub.note ? '<div style="margin:6px 0;">Note: ' + esc(sub.note) + '</div>' : '')
      + '<div style="margin:8px 0;display:flex;gap:6px;flex-wrap:wrap;">'
      + '<button class="btn btn-ghost btn-sm" onclick="igCopyProof(0)">Copy filenames</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="igCopyProof(1)">Copy for Lightroom (no extension)</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="igDownloadProof()">Download .txt</button></div>'
      + '<textarea readonly style="width:100%;height:140px;font-family:monospace;font-size:12px;">' + esc(names.join('\n')) + '</textarea>';
  }catch(e){ if(body) body.textContent = 'Could not load selection: ' + e.message; }
}
function igCopyProof(stem){ navigator.clipboard.writeText((stem ? window._igProofStems.join(', ') : window._igProofNames.join('\n'))).then(function(){ toast('', 'Copied', ''); }); }
function igDownloadProof(){ var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([window._igProofNames.join('\n')], {type:'text/plain'})); a.download = 'selected-raws.txt'; a.click(); }

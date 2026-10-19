/* ═══════════════════════════════════════════════════════════════
   Impact Grid — branded dialogs
   Replaces the browser's native prompt() / confirm() / alert().

   Everything returns a Promise, so use `await`:

     var amount = await igDialog.money({ title:'Invoice total', ... });   // number | null
     var state  = await igDialog.choice({ options:[...] });               // value | null
     var ok     = await igDialog.confirm({ title:'Delete?', danger:true });// true | false
     await igDialog.alert({ title:'Could not save', message:'...' });

   Uses your site tokens (--card, --border2, --fd, --fb, --r2 …) so it
   follows light/dark theme automatically. Loads logo.png (falls back
   to an "IG" mark if the image is missing).
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var LOGO = 'logo.png';
  var GOLD = '#d9c187';

  /* ── CSS (injected once) ─────────────────────────────────── */
  var CSS = [
    '.igd-backdrop{position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;padding:20px;',
    'background:rgba(8,6,3,.66);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);opacity:0;transition:opacity .22s ease;}',
    '.igd-backdrop.igd-in{opacity:1;}',

    '.igd-card{position:relative;width:100%;max-width:440px;max-height:calc(100vh - 40px);overflow:auto;',
    'background:var(--card,#1e1912);color:var(--text,#fff);border:1px solid var(--border2,rgba(255,255,255,.11));',
    'border-radius:var(--r2,20px);box-shadow:0 30px 80px -20px rgba(0,0,0,.65),0 0 0 1px rgba(217,193,135,.08);',
    'font-family:var(--fb,"DM Sans",sans-serif);transform:translateY(14px) scale(.965);opacity:0;',
    'transition:transform .28s cubic-bezier(.2,.7,.2,1),opacity .22s ease;}',
    '.igd-backdrop.igd-in .igd-card{transform:none;opacity:1;}',
    '.igd-card::before{content:"";position:absolute;left:0;right:0;top:0;height:3px;',
    'background:linear-gradient(90deg,transparent,' + GOLD + ',transparent);border-radius:var(--r2,20px) var(--r2,20px) 0 0;}',
    '.igd-card.igd-danger::before{background:linear-gradient(90deg,transparent,var(--red,#f75f4f),transparent);}',

    '.igd-head{display:flex;align-items:center;gap:14px;padding:24px 24px 4px;}',
    '.igd-logo{width:46px;height:46px;flex:none;border-radius:12px;overflow:hidden;background:#f5e642;',
    'display:flex;align-items:center;justify-content:center;font:900 15px var(--fd,sans-serif);color:#111;',
    'box-shadow:0 0 0 1px rgba(217,193,135,.45),0 6px 18px -6px rgba(0,0,0,.5);}',
    '.igd-logo img{width:100%;height:100%;object-fit:cover;display:block;transform:scale(1.75);}',
    '.igd-eyebrow{font:600 9.5px/1 var(--fb,sans-serif);letter-spacing:.24em;text-transform:uppercase;color:var(--pg-gold-ink,' + GOLD + ');margin-bottom:6px;}',
    '.igd-title{font:900 19px/1.15 var(--fd,sans-serif);letter-spacing:-.02em;}',

    '.igd-body{padding:14px 24px 4px;}',
    '.igd-msg{font-size:13.5px;line-height:1.55;color:var(--text2,#ddd);white-space:pre-line;}',
    '.igd-chip{display:inline-flex;align-items:center;gap:8px;margin:12px 0 0;padding:7px 12px;border-radius:99px;',
    'background:var(--bg2,#1d1810);border:1px solid var(--border2,rgba(255,255,255,.11));font-size:12px;font-weight:600;}',
    '.igd-chip i{width:7px;height:7px;border-radius:50%;background:' + GOLD + ';display:block;}',

    /* money input */
    '.igd-money{margin-top:16px;display:flex;align-items:center;gap:10px;padding:0 16px;height:62px;',
    'background:var(--bg2,#1d1810);border:1.5px solid var(--border2,rgba(255,255,255,.11));border-radius:14px;',
    'transition:border-color .18s,box-shadow .18s;}',
    '.igd-money:focus-within{border-color:' + GOLD + ';box-shadow:0 0 0 4px rgba(217,193,135,.16);}',
    '.igd-money.igd-bad{border-color:var(--red,#f75f4f);box-shadow:0 0 0 4px rgba(247,95,79,.14);animation:igdShake .32s;}',
    '.igd-cur{font:700 26px var(--fd,sans-serif);color:var(--pg-gold-ink,' + GOLD + ');line-height:1;}',
    '.igd-money input{flex:1;min-width:0;width:auto;height:100%;padding:0;border:0;outline:0;box-shadow:none;background:transparent;',
    'font:700 26px var(--fm,"DM Mono",monospace);letter-spacing:-.01em;color:var(--text,#fff);}',
    '.igd-money input::placeholder{color:var(--text3,#888);opacity:.45;font-weight:500;}',
    '.igd-money input:focus{border:0;box-shadow:none;}',
    '.igd-quick{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}',
    '.igd-pill{padding:7px 13px;border-radius:99px;font:600 12px var(--fb,sans-serif);cursor:pointer;',
    'background:none;color:var(--text2,#ddd);border:1px solid var(--border2,rgba(255,255,255,.11));transition:all .16s;}',
    '.igd-pill:hover{border-color:' + GOLD + ';color:' + GOLD + ';background:rgba(217,193,135,.08);}',
    '.igd-hint{margin-top:12px;min-height:20px;font-size:12.5px;color:var(--text3,#aaa);}',
    '.igd-hint b{color:var(--text,#fff);font-weight:700;}',
    '.igd-err{color:var(--red,#f75f4f);font-weight:600;}',

    /* choice cards */
    '.igd-opts{display:flex;flex-direction:column;gap:9px;margin-top:14px;}',
    '.igd-opt{display:flex;align-items:center;gap:13px;width:100%;text-align:left;padding:13px 14px;cursor:pointer;',
    'background:var(--bg2,#1d1810);color:var(--text,#fff);border:1.5px solid var(--border2,rgba(255,255,255,.11));',
    'border-radius:14px;transition:border-color .16s,background .16s,transform .16s;font-family:inherit;}',
    '.igd-opt:hover{border-color:rgba(217,193,135,.6);transform:translateY(-1px);}',
    '.igd-opt.igd-sel{border-color:' + GOLD + ';background:rgba(217,193,135,.1);box-shadow:0 0 0 3px rgba(217,193,135,.14);}',
    '.igd-key{flex:none;width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;',
    'font:700 12px var(--fm,monospace);background:var(--bg3,#241e15);border:1px solid var(--border2,rgba(255,255,255,.11));color:var(--text2,#ddd);}',
    '.igd-opt.igd-sel .igd-key{background:' + GOLD + ';border-color:' + GOLD + ';color:#1a160f;}',
    '.igd-opt-t{font-size:13.5px;font-weight:700;line-height:1.25;}',
    '.igd-opt-s{font-size:12px;color:var(--text3,#aaa);margin-top:2px;line-height:1.35;}',
    '.igd-tag{margin-left:auto;flex:none;font-size:10px;font-weight:700;letter-spacing:.04em;padding:3px 8px;border-radius:99px;',
    'background:var(--bg3,#241e15);color:var(--text3,#aaa);border:1px solid var(--border,rgba(255,255,255,.06));}',

    /* footer */
    '.igd-foot{display:flex;gap:10px;justify-content:flex-end;padding:18px 24px 22px;}',
    '.igd-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:11px 20px;border-radius:var(--r,12px);',
    'font:700 13px var(--fb,sans-serif);cursor:pointer;border:1px solid transparent;transition:all .18s cubic-bezier(.4,0,.2,1);}',
    '.igd-btn:focus-visible,.igd-pill:focus-visible,.igd-opt:focus-visible{outline:2px solid ' + GOLD + ';outline-offset:2px;}',
    '.igd-ghost{background:none;color:var(--text2,#ddd);border-color:var(--border2,rgba(255,255,255,.11));}',
    '.igd-ghost:hover{border-color:' + GOLD + ';color:' + GOLD + ';}',
    '.igd-primary{background:linear-gradient(135deg,var(--gold,#f2f2f2),var(--gold2,#fff));color:var(--on-gold,#07090f);min-width:118px;}',
    '.igd-primary:hover{transform:translateY(-1px);box-shadow:var(--sh-gold,0 8px 28px rgba(0,0,0,.25));}',
    '.igd-primary[disabled]{opacity:.45;pointer-events:none;}',
    '.igd-primary.igd-red{background:var(--red,#f75f4f);color:#fff;}',

    '@keyframes igdShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}',
    '@media (max-width:520px){',
    '.igd-backdrop{align-items:flex-end;padding:0;}',
    '.igd-card{max-width:none;border-radius:var(--r2,20px) var(--r2,20px) 0 0;max-height:92vh;transform:translateY(40px);}',
    '.igd-foot{flex-direction:column-reverse;}.igd-btn{width:100%;padding:14px;}}',
    '@media (prefers-reduced-motion:reduce){.igd-backdrop,.igd-card{transition:none;}.igd-money.igd-bad{animation:none;}}'
  ].join('');

  function injectCss() {
    if (document.getElementById('igDialogCss')) return;
    var s = document.createElement('style');
    s.id = 'igDialogCss';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ── tiny DOM helper ─────────────────────────────────────── */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;   // textContent => client names can't inject HTML
    return n;
  }

  function fmtGBP(n) {
    return '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* ── core ────────────────────────────────────────────────── */
  var _openCount = 0;

  /**
   * cfg: {
   *   title, message, eyebrow, chip,
   *   kind: 'alert' | 'confirm' | 'money' | 'choice',
   *   confirmText, cancelText, danger,
   *   // money:  placeholder, quick:[{label,value}], hint(valueNumber) -> html-safe nodes/string, max
   *   // choice: options:[{value,title,sub,tag}], selected
   * }
   */
  function open(cfg) {
    injectCss();
    cfg = cfg || {};
    var kind = cfg.kind || 'confirm';

    return new Promise(function (resolve) {
      var prevFocus = document.activeElement;
      var done = false;

      var backdrop = el('div', 'igd-backdrop');
      var card = el('div', 'igd-card' + (cfg.danger ? ' igd-danger' : ''));
      card.setAttribute('role', kind === 'alert' ? 'alertdialog' : 'dialog');
      card.setAttribute('aria-modal', 'true');
      var titleId = 'igdTitle' + Date.now();
      card.setAttribute('aria-labelledby', titleId);

      /* header with logo */
      var head = el('div', 'igd-head');
      var logo = el('div', 'igd-logo');
      var img = new Image();
      img.alt = 'Impact Grid Group';
      img.onerror = function () { logo.textContent = 'IG'; };
      img.src = LOGO;
      logo.appendChild(img);
      var ht = el('div');
      ht.appendChild(el('div', 'igd-eyebrow', cfg.eyebrow || 'Impact Grid Group'));
      var title = el('div', 'igd-title', cfg.title || '');
      title.id = titleId;
      ht.appendChild(title);
      head.appendChild(logo);
      head.appendChild(ht);
      card.appendChild(head);

      /* body */
      var body = el('div', 'igd-body');
      if (cfg.message) body.appendChild(el('div', 'igd-msg', cfg.message));
      if (cfg.chip) {
        var chip = el('div', 'igd-chip');
        chip.appendChild(el('i'));
        chip.appendChild(document.createTextNode(cfg.chip));
        body.appendChild(chip);
      }

      var input = null, moneyWrap = null, hint = null, chosen = null, optBtns = [];

      function setHint(nodeOrText, isErr) {
        if (!hint) return;
        hint.className = 'igd-hint' + (isErr ? ' igd-err' : '');
        hint.textContent = '';
        if (typeof nodeOrText === 'string') hint.textContent = nodeOrText;
        else if (nodeOrText) hint.appendChild(nodeOrText);
      }

      function parseMoney(raw) {
        var cleaned = String(raw).replace(/[£,\s]/g, '');
        if (cleaned === '') return { empty: true };
        if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return { invalid: true };
        var n = parseFloat(cleaned);
        if (isNaN(n) || n < 0) return { invalid: true };
        if (n > (cfg.max || 1000000)) return { invalid: true, big: true };
        return { value: Math.round(n * 100) / 100 };
      }

      if (kind === 'money') {
        moneyWrap = el('div', 'igd-money');
        moneyWrap.appendChild(el('span', 'igd-cur', '£'));
        input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'decimal';
        input.autocomplete = 'off';
        input.placeholder = cfg.placeholder || '0.00';
        input.setAttribute('aria-label', 'Amount in pounds');
        moneyWrap.appendChild(input);
        body.appendChild(moneyWrap);

        if (cfg.quick && cfg.quick.length) {
          var q = el('div', 'igd-quick');
          cfg.quick.forEach(function (it) {
            var p = el('button', 'igd-pill', it.label);
            p.type = 'button';
            p.onclick = function () { input.value = String(it.value); refreshMoney(); input.focus(); };
            q.appendChild(p);
          });
          body.appendChild(q);
        }
        hint = el('div', 'igd-hint');
        body.appendChild(hint);

        input.addEventListener('input', function () {
          moneyWrap.classList.remove('igd-bad');
          refreshMoney();
        });
      }

      function refreshMoney() {
        var r = parseMoney(input.value);
        if (r.empty) { setHint(cfg.hintEmpty || ''); return; }
        if (r.invalid) { setHint(r.big ? 'That amount looks too large.' : 'Enter a valid amount, e.g. 450 or 450.50', true); return; }
        if (cfg.hint) setHint(cfg.hint(r.value));
        else setHint('');
      }

      if (kind === 'choice') {
        var list = el('div', 'igd-opts');
        list.setAttribute('role', 'radiogroup');
        (cfg.options || []).forEach(function (o, i) {
          var b = el('button', 'igd-opt');
          b.type = 'button';
          b.setAttribute('role', 'radio');
          b.setAttribute('aria-checked', 'false');
          b.appendChild(el('span', 'igd-key', String(i + 1)));
          var tx = el('div');
          tx.appendChild(el('div', 'igd-opt-t', o.title));
          if (o.sub) tx.appendChild(el('div', 'igd-opt-s', o.sub));
          b.appendChild(tx);
          if (o.tag) b.appendChild(el('span', 'igd-tag', o.tag));
          b.onclick = function () { select(i); };
          b.ondblclick = function () { select(i); submit(); };
          list.appendChild(b);
          optBtns.push(b);
        });
        body.appendChild(list);
        hint = el('div', 'igd-hint');
        body.appendChild(hint);
      }

      function select(i) {
        chosen = i;
        optBtns.forEach(function (b, j) {
          b.classList.toggle('igd-sel', j === i);
          b.setAttribute('aria-checked', j === i ? 'true' : 'false');
        });
        setHint('');
        okBtn.disabled = false;
      }

      card.appendChild(body);

      /* footer */
      var foot = el('div', 'igd-foot');
      var cancelBtn = null;
      if (kind !== 'alert') {
        cancelBtn = el('button', 'igd-btn igd-ghost', cfg.cancelText || 'Cancel');
        cancelBtn.type = 'button';
        cancelBtn.onclick = function () { close(kind === 'confirm' ? false : null); };
        foot.appendChild(cancelBtn);
      }
      var okText = cfg.confirmText || (kind === 'alert' ? 'Got it' : kind === 'confirm' ? 'Confirm' : 'Continue');
      var okBtn = el('button', 'igd-btn igd-primary' + (cfg.danger ? ' igd-red' : ''), okText);
      okBtn.type = 'button';
      okBtn.onclick = submit;
      foot.appendChild(okBtn);
      card.appendChild(foot);

      if (kind === 'choice') okBtn.disabled = true;

      backdrop.appendChild(card);

      /* behaviour */
      function submit() {
        if (kind === 'money') {
          var r = parseMoney(input.value);
          if (r.empty || r.invalid) {
            moneyWrap.classList.remove('igd-bad'); void moneyWrap.offsetWidth; moneyWrap.classList.add('igd-bad');
            setHint(r.empty ? 'Please enter an amount (or choose Free shoot).' : (r.big ? 'That amount looks too large.' : 'Enter a valid amount, e.g. 450 or 450.50'), true);
            input.focus();
            return;
          }
          return close(r.value);
        }
        if (kind === 'choice') {
          if (chosen == null) return;
          return close(cfg.options[chosen].value);
        }
        if (kind === 'confirm') return close(true);
        return close(undefined);
      }

      function close(result) {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', onKey, true);
        backdrop.classList.remove('igd-in');
        setTimeout(function () {
          if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
          _openCount--;
          if (_openCount <= 0) { _openCount = 0; document.body.style.overflow = backdrop._prevOverflow || ''; }
          try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) {}
          resolve(result);
        }, 180);
      }

      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(kind === 'confirm' ? false : kind === 'alert' ? undefined : null); return; }
        if (e.key === 'Enter') {
          var t = e.target;
          if (t && t.tagName === 'BUTTON' && t !== okBtn) return;      // let focused buttons act normally
          e.preventDefault(); e.stopPropagation(); submit(); return;
        }
        if (kind === 'choice' && /^[1-9]$/.test(e.key)) {
          var i = parseInt(e.key, 10) - 1;
          if (i < optBtns.length) { e.preventDefault(); select(i); }
          return;
        }
        if (kind === 'choice' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
          e.preventDefault();
          var n = chosen == null ? (e.key === 'ArrowDown' ? 0 : optBtns.length - 1)
                                 : (chosen + (e.key === 'ArrowDown' ? 1 : -1) + optBtns.length) % optBtns.length;
          select(n); optBtns[n].focus(); return;
        }
        if (e.key === 'Tab') {                                          // keep focus inside the dialog
          var f = card.querySelectorAll('button:not([disabled]),input');
          if (!f.length) return;
          var first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }

      backdrop.addEventListener('mousedown', function (e) {
        if (e.target === backdrop && kind !== 'alert') close(kind === 'confirm' ? false : null);
      });

      backdrop._prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      _openCount++;
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(backdrop);
      requestAnimationFrame(function () {
        backdrop.classList.add('igd-in');
        if (input) { input.focus(); }
        else okBtn.focus();
      });
    });
  }

  /* ── friendly helpers ────────────────────────────────────── */
  window.igDialog = {
    open: open,
    alert: function (o) { o = o || {}; o.kind = 'alert'; return open(o); },
    confirm: function (o) { o = o || {}; o.kind = 'confirm'; return open(o); },
    choice: function (o) { o = o || {}; o.kind = 'choice'; return open(o); },
    money: function (o) { o = o || {}; o.kind = 'money'; return open(o); },
    fmtGBP: fmtGBP
  };
})();

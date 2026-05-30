/* ═══════════════════════════════════════════════════
   ImpactGrid — AI Receptionist Chat Bubble
   ig-chat.js  v1.0

   HOW TO ADD TO ANY PAGE:
     <script src="ig-chat.js" defer></script>

   Features:
   - Cute codename assigned on first visit (persisted in localStorage)
   - Receptionist persona — short, punchy, lead-generating
   - Tracks page + scroll behaviour and passes context to AI
   - Saves conversation + lead data to Supabase (chat_sessions table)
   - Bottom-LEFT corner — opposite the nav
   - Respects light/dark theme from data-theme attribute
═══════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Config ── */
  const API_URL   = 'https://impactgrid-events-api.onrender.com/api/chat';
  const STORAGE_KEY = 'ig_chat_codename';
  const HISTORY_KEY = 'ig_chat_history';

  /* ── Cute codename generator ── */
  const ADJECTIVES = [
    'Sunny','Cosmic','Velvet','Golden','Breezy','Lucky','Silky','Neon',
    'Misty','Jazzy','Sparky','Dreamy','Breezy','Cozy','Glowy','Swift'
  ];
  const NOUNS = [
    'Petal','Spark','Wave','Cloud','Gem','Drift','Bloom','Flare',
    'Mist','Glow','Echo','Dusk','Haze','Frost','Zest','Breeze'
  ];

  function generateCodename() {
    const adj  = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    return adj + noun;
  }

  function getOrCreateCodename() {
    try {
      let name = localStorage.getItem(STORAGE_KEY);
      if (!name) {
        name = generateCodename();
        localStorage.setItem(STORAGE_KEY, name);
      }
      return name;
    } catch (e) {
      return generateCodename();
    }
  }

  /* ── Behaviour tracker ── */
  const behaviour = {
    page      : window.location.pathname.split('/').pop() || 'index.html',
    timeOnPage: 0,
    scrollDepth: 0,
    sectionsViewed: [],
    started   : Date.now()
  };

  /* Track scroll depth */
  window.addEventListener('scroll', function () {
    const pct = Math.round(
      (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
    );
    if (pct > behaviour.scrollDepth) behaviour.scrollDepth = pct;

    /* Track which sections were viewed */
    document.querySelectorAll('section[id]').forEach(function (sec) {
      const rect = sec.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.75 && !behaviour.sectionsViewed.includes(sec.id)) {
        behaviour.sectionsViewed.push(sec.id);
      }
    });
  }, { passive: true });

  setInterval(function () {
    behaviour.timeOnPage = Math.round((Date.now() - behaviour.started) / 1000);
  }, 5000);

  /* ── Chat state ── */
  const codename  = getOrCreateCodename();
  let history     = [];
  let isOpen      = false;
  let isTyping    = false;
  let hasGreeted  = false;

  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (saved) history = JSON.parse(saved);
  } catch (e) {}

  function saveHistory() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-20))); } catch (e) {}
  }

  /* ── Build UI ── */
  const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';

  const styles = `
    #ig-chat-wrap * { box-sizing: border-box; margin: 0; padding: 0; }

    #ig-chat-bubble {
      position: fixed;
      bottom: 28px;
      left: 28px;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: linear-gradient(135deg, #e8930a 0%, #f0b429 50%, #ffd166 100%);
      box-shadow: 0 4px 20px rgba(201,126,8,0.45), 0 0 0 0 rgba(240,180,41,0.4);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9998;
      transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s;
      animation: ig-pulse 3s ease-in-out infinite;
    }
    #ig-chat-bubble:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 28px rgba(201,126,8,0.6), 0 0 0 6px rgba(240,180,41,0.15);
    }
    #ig-chat-bubble svg { transition: transform 0.25s; }
    #ig-chat-bubble.open svg.icon-chat { display: none; }
    #ig-chat-bubble.open svg.icon-close { display: block !important; }

    #ig-chat-unread {
      position: absolute;
      top: -2px; right: -2px;
      width: 16px; height: 16px;
      background: #ef4444;
      border-radius: 50%;
      font-size: 9px; font-weight: 800;
      color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-family: 'DM Sans', sans-serif;
      border: 2px solid var(--bg, #faf7f2);
      display: none;
    }

    #ig-chat-window {
      position: fixed;
      bottom: 92px;
      left: 28px;
      width: 340px;
      max-height: 520px;
      border-radius: 20px;
      background: var(--card, #ffffff);
      border: 1px solid var(--border2, rgba(0,0,0,0.13));
      box-shadow: 0 24px 64px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.88) translateY(16px);
      opacity: 0;
      pointer-events: none;
      transform-origin: bottom left;
      transition: transform 0.28s cubic-bezier(0.34,1.3,0.64,1), opacity 0.22s ease;
    }
    #ig-chat-window.open {
      transform: scale(1) translateY(0);
      opacity: 1;
      pointer-events: all;
    }

    /* Header */
    #ig-chat-header {
      background: linear-gradient(135deg, #111827 0%, #1f2937 100%);
      padding: 14px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    #ig-chat-avatar {
      width: 34px; height: 34px;
      border-radius: 50%;
      background: linear-gradient(135deg, #e8930a, #f0b429);
      display: flex; align-items: center; justify-content: center;
      font-size: 16px;
      flex-shrink: 0;
      position: relative;
    }
    #ig-chat-avatar::after {
      content: '';
      position: absolute;
      bottom: 0; right: 0;
      width: 9px; height: 9px;
      background: #22c55e;
      border-radius: 50%;
      border: 2px solid #111827;
    }
    #ig-chat-header-info { flex: 1; }
    #ig-chat-header-name {
      font-size: 13px; font-weight: 700;
      color: #fff;
      font-family: 'Syne', 'DM Sans', sans-serif;
      letter-spacing: -0.01em;
    }
    #ig-chat-header-status {
      font-size: 10px; color: rgba(255,255,255,0.5);
      margin-top: 1px;
      font-family: 'DM Sans', sans-serif;
    }
    #ig-chat-codename-badge {
      font-size: 9px;
      font-weight: 700;
      font-family: 'DM Mono', monospace;
      color: #f0b429;
      background: rgba(240,180,41,0.12);
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid rgba(240,180,41,0.2);
      letter-spacing: 0.05em;
    }

    /* Messages */
    #ig-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 14px 14px 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      scroll-behavior: smooth;
    }
    #ig-chat-messages::-webkit-scrollbar { width: 3px; }
    #ig-chat-messages::-webkit-scrollbar-track { background: transparent; }
    #ig-chat-messages::-webkit-scrollbar-thumb { background: var(--border2, rgba(0,0,0,0.13)); border-radius: 999px; }

    .ig-msg {
      display: flex;
      flex-direction: column;
      max-width: 82%;
      animation: ig-msg-in 0.22s cubic-bezier(0.34,1.3,0.64,1) both;
    }
    .ig-msg.bot { align-self: flex-start; }
    .ig-msg.user { align-self: flex-end; }

    .ig-msg-bubble {
      padding: 9px 13px;
      border-radius: 14px;
      font-size: 13px;
      line-height: 1.55;
      font-family: 'DM Sans', sans-serif;
    }
    .ig-msg.bot .ig-msg-bubble {
      background: var(--bg2, #f3ede3);
      color: var(--text, #0d1017);
      border-bottom-left-radius: 4px;
    }
    .ig-msg.user .ig-msg-bubble {
      background: linear-gradient(135deg, #e8930a, #f0b429);
      color: #07090f;
      font-weight: 500;
      border-bottom-right-radius: 4px;
    }
    [data-theme="dark"] .ig-msg.bot .ig-msg-bubble {
      background: var(--bg2, #141008);
      color: var(--text, #eef0f6);
    }

    /* Quick reply chips */
    .ig-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
      align-self: flex-start;
      max-width: 100%;
    }
    .ig-chip {
      font-size: 11.5px;
      font-weight: 600;
      font-family: 'DM Sans', sans-serif;
      padding: 5px 11px;
      border-radius: 999px;
      border: 1px solid var(--border2, rgba(0,0,0,0.13));
      background: var(--card, #fff);
      color: var(--text2, #4a5068);
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .ig-chip:hover {
      border-color: #f0b429;
      color: #c97e08;
      background: rgba(240,180,41,0.07);
    }
    [data-theme="dark"] .ig-chip {
      background: var(--card, #1a1510);
      color: var(--text2, #8a91a8);
    }

    /* Typing indicator */
    .ig-typing {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 10px 13px;
      background: var(--bg2, #f3ede3);
      border-radius: 14px;
      border-bottom-left-radius: 4px;
      align-self: flex-start;
      animation: ig-msg-in 0.22s ease both;
    }
    [data-theme="dark"] .ig-typing { background: var(--bg2, #141008); }
    .ig-typing span {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--text3, #9099b8);
      animation: ig-dot 1.2s ease-in-out infinite;
    }
    .ig-typing span:nth-child(2) { animation-delay: 0.2s; }
    .ig-typing span:nth-child(3) { animation-delay: 0.4s; }

    /* Input area */
    #ig-chat-input-row {
      display: flex;
      gap: 8px;
      padding: 10px 12px 12px;
      border-top: 1px solid var(--border, rgba(0,0,0,0.07));
      flex-shrink: 0;
      background: var(--card, #fff);
    }
    [data-theme="dark"] #ig-chat-input-row { background: var(--card, #1a1510); }
    #ig-chat-input {
      flex: 1;
      border: 1px solid var(--border2, rgba(0,0,0,0.13));
      border-radius: 10px;
      padding: 9px 12px;
      font-size: 13px;
      font-family: 'DM Sans', sans-serif;
      background: var(--bg, #faf7f2);
      color: var(--text, #0d1017);
      outline: none;
      resize: none;
      height: 38px;
      max-height: 90px;
      overflow-y: auto;
      transition: border-color 0.15s;
      line-height: 1.4;
    }
    [data-theme="dark"] #ig-chat-input {
      background: var(--bg2, #141008);
      color: var(--text, #eef0f6);
      border-color: var(--border2, rgba(255,255,255,0.13));
    }
    #ig-chat-input:focus { border-color: #f0b429; }
    #ig-chat-input::placeholder { color: var(--text3, #9099b8); }

    #ig-chat-send {
      width: 38px; height: 38px;
      border-radius: 10px;
      background: linear-gradient(135deg, #e8930a, #f0b429);
      border: none;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      transition: transform 0.15s, box-shadow 0.15s;
      box-shadow: 0 2px 8px rgba(201,126,8,0.3);
    }
    #ig-chat-send:hover { transform: scale(1.08); box-shadow: 0 4px 14px rgba(201,126,8,0.45); }
    #ig-chat-send:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

    /* Footer note */
    #ig-chat-footer-note {
      text-align: center;
      font-size: 9.5px;
      color: var(--text3, #9099b8);
      font-family: 'DM Mono', monospace;
      padding: 0 12px 8px;
      flex-shrink: 0;
    }

    /* Mobile */
    @media (max-width: 480px) {
      #ig-chat-window {
        left: 12px; right: 12px;
        width: auto;
        bottom: 82px;
        border-radius: 16px;
      }
      #ig-chat-bubble { left: 16px; bottom: 20px; }
    }

    /* Keyframes */
    @keyframes ig-pulse {
      0%, 100% { box-shadow: 0 4px 20px rgba(201,126,8,0.45), 0 0 0 0 rgba(240,180,41,0.4); }
      50%       { box-shadow: 0 4px 20px rgba(201,126,8,0.45), 0 0 0 10px rgba(240,180,41,0); }
    }
    @keyframes ig-msg-in {
      from { opacity: 0; transform: translateY(6px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes ig-dot {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
      30%           { transform: translateY(-4px); opacity: 1; }
    }
  `;

  /* ── Inject styles ── */
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  /* ── Build DOM ── */
  const wrap = document.createElement('div');
  wrap.id = 'ig-chat-wrap';
  wrap.innerHTML = `
    <!-- Bubble button -->
    <button id="ig-chat-bubble" aria-label="Chat with us">
      <svg class="icon-chat" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#07090f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <svg class="icon-close" style="display:none" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#07090f" stroke-width="2.5" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
      <div id="ig-chat-unread">1</div>
    </button>

    <!-- Chat window -->
    <div id="ig-chat-window" role="dialog" aria-label="Chat with ImpactGrid">
      <div id="ig-chat-header">
        <div id="ig-chat-avatar">⚡</div>
        <div id="ig-chat-header-info">
          <div id="ig-chat-header-name">ImpactGrid</div>
          <div id="ig-chat-header-status">Online · Usually replies instantly</div>
        </div>
        <div id="ig-chat-codename-badge">${codename}</div>
      </div>

      <div id="ig-chat-messages"></div>

      <div id="ig-chat-input-row">
        <textarea
          id="ig-chat-input"
          placeholder="Type a message…"
          rows="1"
          aria-label="Chat message"
        ></textarea>
        <button id="ig-chat-send" aria-label="Send message" disabled>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#07090f" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
      <div id="ig-chat-footer-note">Powered by ImpactGrid AI · You are ${codename}</div>
    </div>
  `;
  document.body.appendChild(wrap);

  /* ── Elements ── */
  const bubbleBtn  = document.getElementById('ig-chat-bubble');
  const chatWindow = document.getElementById('ig-chat-window');
  const messagesEl = document.getElementById('ig-chat-messages');
  const inputEl    = document.getElementById('ig-chat-input');
  const sendBtn    = document.getElementById('ig-chat-send');
  const unreadDot  = document.getElementById('ig-chat-unread');

  /* ── Render a message ── */
  function addMessage(text, role, chips) {
    const msg = document.createElement('div');
    msg.className = `ig-msg ${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'ig-msg-bubble';
    bubble.textContent = text;
    msg.appendChild(bubble);

    if (chips && chips.length) {
      const chipsEl = document.createElement('div');
      chipsEl.className = 'ig-chips';
      chips.forEach(function (label) {
        const chip = document.createElement('button');
        chip.className = 'ig-chip';
        chip.textContent = label;
        chip.addEventListener('click', function () {
          chipsEl.remove();
          sendMessage(label);
        });
        chipsEl.appendChild(chip);
      });
      msg.appendChild(chipsEl);
    }

    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    if (role === 'bot') {
      history.push({ role: 'assistant', content: text });
    } else {
      history.push({ role: 'user', content: text });
    }
    saveHistory();
  }

  /* ── Typing indicator ── */
  function showTyping() {
    const el = document.createElement('div');
    el.className = 'ig-typing';
    el.id = 'ig-chat-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  function hideTyping() {
    const el = document.getElementById('ig-chat-typing');
    if (el) el.remove();
  }

  /* ── Send message ── */
  async function sendMessage(text) {
    text = (text || '').trim();
    if (!text || isTyping) return;

    addMessage(text, 'user');
    inputEl.value = '';
    inputEl.style.height = '38px';
    sendBtn.disabled = true;
    isTyping = true;
    showTyping();

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message    : text,
          codename   : codename,
          history    : history.slice(-10), /* last 5 turns */
          behaviour  : {
            page          : behaviour.page,
            timeOnPage    : behaviour.timeOnPage,
            scrollDepth   : behaviour.scrollDepth,
            sectionsViewed: behaviour.sectionsViewed
          }
        })
      });

      const data = await res.json();
      hideTyping();

      if (data.reply) {
        addMessage(data.reply, 'bot', data.chips || []);
      } else {
        addMessage("Sorry, something went wrong. Try again in a sec!", 'bot');
      }
    } catch (e) {
      hideTyping();
      addMessage("Hmm, can't reach me right now — drop us an email at events@impactgridgroup.com 👋", 'bot');
    }

    isTyping = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }

  /* ── Greet on open ── */
  function greet() {
    if (hasGreeted || history.length > 0) {
      /* Re-render existing history */
      history.forEach(function (m) {
        const div = document.createElement('div');
        div.className = `ig-msg ${m.role === 'assistant' ? 'bot' : 'user'}`;
        const bubble = document.createElement('div');
        bubble.className = 'ig-msg-bubble';
        bubble.textContent = m.content;
        div.appendChild(bubble);
        messagesEl.appendChild(div);
      });
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return;
    }

    hasGreeted = true;
    setTimeout(function () {
      addMessage(
        `Hey ${codename}! 👋 I'm Spark — ImpactGrid's AI. Looking to book something or just browsing?`,
        'bot',
        ['Book an event', 'See what you offer', 'Pricing info', 'Just looking']
      );
    }, 400);
  }

  /* ── Toggle chat ── */
  function toggleChat() {
    isOpen = !isOpen;
    chatWindow.classList.toggle('open', isOpen);
    bubbleBtn.classList.toggle('open', isOpen);
    unreadDot.style.display = 'none';

    if (isOpen) {
      greet();
      setTimeout(function () { inputEl.focus(); }, 300);
    }
  }

  /* ── Show unread dot after delay if not opened ── */
  setTimeout(function () {
    if (!isOpen && history.length === 0) {
      unreadDot.style.display = 'flex';
    }
  }, 8000);

  /* ── Events ── */
  bubbleBtn.addEventListener('click', toggleChat);

  sendBtn.addEventListener('click', function () {
    sendMessage(inputEl.value);
  });

  inputEl.addEventListener('input', function () {
    sendBtn.disabled = !this.value.trim();
    /* Auto-grow textarea */
    this.style.height = '38px';
    this.style.height = Math.min(this.scrollHeight, 90) + 'px';
  });

  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(this.value);
    }
  });

  /* Close on Escape */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) toggleChat();
  });

})();

/* ============================================================
   MARTY CHAT — Ask Marty AI Assistant
   MO-ARK District Key Club
   Include on every page: <script src="marty-chat.js"></script>
   ============================================================ */

(function() {
  'use strict';

  function init() {

  /* ── INJECT STYLES ── */
  var style = document.createElement('style');
  style.textContent = [
    /* ── CHAT BUTTON ── */
    /* Force bottom-right, always visible, nothing can override */
    '#marty-chat-btn{position:fixed !important;bottom:1.5rem !important;right:1.5rem !important;z-index:9999 !important;display:flex;flex-direction:column;align-items:center;cursor:pointer;border:none;background:none;padding:0;transition:transform .2s ease,opacity .3s ease;left:auto !important;top:auto !important;}',
    '#marty-chat-btn:hover{transform:translateY(-4px);}',
    '#marty-chat-btn svg{filter:drop-shadow(0 4px 16px rgba(0,0,0,.5));}',
    '#mc-label{background:#0A1628;border:1.5px solid rgba(200,150,42,.6);border-radius:100px;color:#F0C14B;font-size:.65rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:.3rem .85rem;margin-top:-2px;white-space:nowrap;box-shadow:0 2px 12px rgba(0,0,0,.35);font-family:system-ui,sans-serif;}',

    /* ── CHAT PANEL ── */
    '#mc-panel{position:fixed !important;bottom:0 !important;right:0 !important;left:auto !important;top:auto !important;width:380px;max-width:100vw;z-index:9998 !important;background:#fff;border-radius:20px 20px 0 0;box-shadow:0 -8px 50px rgba(10,22,40,.25);display:flex;flex-direction:column;transform:translateY(100%);transition:transform .4s cubic-bezier(.22,1,.36,1);max-height:80vh;border:1px solid rgba(10,22,40,.08);border-bottom:none;overflow:hidden;}',
    '#mc-panel.mc-open{transform:translateY(0);}',

    /* ── HEADER ── */
    '#mc-header{display:flex;align-items:center;gap:12px;padding:1rem 1.125rem .875rem;background:linear-gradient(135deg,#0A1628 0%,#1A3A6B 100%);flex-shrink:0;cursor:pointer;}',
    '#mc-header-text{flex:1;}',
    '#mc-header-name{display:block;font-size:.95rem;font-weight:700;color:#F0C14B;font-family:Georgia,serif;letter-spacing:.02em;}',
    '#mc-header-sub{font-size:.72rem;color:rgba(255,255,255,.45);font-family:system-ui,sans-serif;}',
    '#mc-close-btn{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:rgba(255,255,255,.7);font-size:1.1rem;line-height:1;flex-shrink:0;transition:background .2s;}',
    '#mc-close-btn:hover{background:rgba(200,150,42,.3);color:#F0C14B;}',

    /* ── ONLINE INDICATOR ── */
    '.mc-online-dot{width:8px;height:8px;background:#22c55e;border-radius:50%;border:1.5px solid rgba(255,255,255,.3);flex-shrink:0;box-shadow:0 0 6px rgba(34,197,94,.6);}',

    /* ── MESSAGES ── */
    '#mc-msgs{flex:1;overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:.75rem;scroll-behavior:smooth;}',
    '.mc-msg{max-width:85%;padding:.65rem .9rem;border-radius:16px;font-size:.845rem;line-height:1.55;animation:mcIn .2s ease;font-family:system-ui,sans-serif;}',
    '@keyframes mcIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
    '.mc-msg.mc-marty{background:#F0F4FA;color:#0A1628;border-radius:4px 16px 16px 16px;align-self:flex-start;border:1px solid rgba(10,22,40,.06);}',
    '.mc-msg.mc-user{background:linear-gradient(135deg,#0A1628,#1A3A6B);color:#fff;border-radius:16px 4px 16px 16px;align-self:flex-end;}',
    '.mc-msg a{color:#C8962A;font-weight:600;text-decoration:underline;}',
    '.mc-msg a:hover{color:#A67820;}',

    /* ── TYPING INDICATOR ── */
    '#mc-typing{display:none;align-self:flex-start;background:#F0F4FA;border-radius:4px 16px 16px 16px;padding:.65rem .9rem;gap:5px;align-items:center;border:1px solid rgba(10,22,40,.06);}',
    '#mc-typing.mc-show{display:flex;}',
    '#mc-typing span{width:7px;height:7px;background:#8A9AB5;border-radius:50%;animation:mcBounce 1.2s ease-in-out infinite;}',
    '#mc-typing span:nth-child(2){animation-delay:.18s}',
    '#mc-typing span:nth-child(3){animation-delay:.36s}',
    '@keyframes mcBounce{0%,60%,100%{transform:none}30%{transform:translateY(-7px)}}',

    /* ── QUICK CHIPS ── */
    '#mc-chips{padding:.5rem 1rem .25rem;display:flex;flex-wrap:wrap;gap:.4rem;flex-shrink:0;border-top:1px solid rgba(10,22,40,.06);}',
    '.mc-chip{background:#F0F4FA;border:1px solid rgba(10,22,40,.12);border-radius:100px;padding:.3rem .8rem;font-size:.75rem;color:#1A3A6B;cursor:pointer;transition:all .15s;white-space:nowrap;font-family:system-ui,sans-serif;font-weight:500;}',
    '.mc-chip:hover{background:rgba(200,150,42,.15);border-color:#C8962A;color:#0A1628;}',

    /* ── INPUT ROW ── */
    '#mc-input-row{display:flex;gap:.5rem;padding:.75rem 1rem 1rem;border-top:1px solid rgba(10,22,40,.07);flex-shrink:0;background:#fafafa;}',
    '#mc-input{flex:1;border:1.5px solid rgba(10,22,40,.15);border-radius:100px;padding:.55rem 1.1rem;font-size:.875rem;font-family:system-ui,sans-serif;color:#0A1628;outline:none;transition:border-color .2s;background:#fff;}',
    '#mc-input:focus{border-color:#C8962A;}',
    '#mc-input::placeholder{color:#9AA5B4;}',
    '#mc-send{width:38px;height:38px;background:#C8962A;border:none;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .2s,transform .15s;flex-shrink:0;}',
    '#mc-send:hover{background:#A67820;transform:scale(1.08);}',
    '#mc-send svg{width:15px;height:15px;stroke:#0A1628;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;}',

    /* ── NOTIFICATION BUBBLE ── */
    '#mc-notif{position:absolute;top:-6px;right:-4px;background:#ef4444;color:white;border-radius:50%;width:18px;height:18px;font-size:.65rem;font-weight:700;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;border:2px solid white;opacity:0;transition:opacity .3s;}',
    '#mc-notif.show{opacity:1;}',

    /* ── HERO MARTY HIDE/SHOW ── */
    '#marty-ql-wrap{transition:opacity .3s ease;}',

    /* ── MOBILE ── */
    '@media(max-width:480px){#mc-panel{width:100%;border-radius:20px 20px 0 0;}#marty-chat-btn{right:1rem !important;bottom:1rem !important;}}',
  ].join('');
  document.head.appendChild(style);

  /* ── MARTY SVG (button size) ── */
  var MARTY_BTN_SVG = '<svg width="64" height="98" viewBox="0 0 180 280" xmlns="http://www.w3.org/2000/svg"><path d="M72 245 Q55 260 60 274 Q70 284 85 276 Q90 264 90 252" fill="#c8a06a" stroke="#b08040" stroke-width="1.2"/><rect x="68" y="248" width="16" height="22" rx="7" fill="#C89050"/><rect x="96" y="248" width="16" height="22" rx="7" fill="#C89050"/><ellipse cx="76" cy="272" rx="14" ry="7.5" fill="#7A4A1A"/><ellipse cx="104" cy="272" rx="14" ry="7.5" fill="#7A4A1A"/><ellipse cx="67" cy="270" rx="4" ry="3.5" fill="#6A3A10"/><ellipse cx="76" cy="269" rx="4" ry="3.5" fill="#6A3A10"/><ellipse cx="85" cy="270" rx="4" ry="3.5" fill="#6A3A10"/><ellipse cx="95" cy="270" rx="4" ry="3.5" fill="#6A3A10"/><ellipse cx="104" cy="269" rx="4" ry="3.5" fill="#6A3A10"/><ellipse cx="113" cy="270" rx="4" ry="3.5" fill="#6A3A10"/><ellipse cx="67" cy="268.5" rx="2" ry="1.4" fill="#8A5020" opacity="0.55"/><ellipse cx="76" cy="267.5" rx="2" ry="1.4" fill="#8A5020" opacity="0.55"/><ellipse cx="85" cy="268.5" rx="2" ry="1.4" fill="#8A5020" opacity="0.55"/><ellipse cx="95" cy="268.5" rx="2" ry="1.4" fill="#8A5020" opacity="0.55"/><ellipse cx="104" cy="267.5" rx="2" ry="1.4" fill="#8A5020" opacity="0.55"/><ellipse cx="113" cy="268.5" rx="2" ry="1.4" fill="#8A5020" opacity="0.55"/><ellipse cx="90" cy="210" rx="42" ry="50" fill="#D4A574"/><ellipse cx="90" cy="215" rx="23" ry="34" fill="#F0D8B0"/><path d="M52 178 Q52 158 90 156 Q128 158 128 178 L130 232 Q130 242 90 244 Q50 242 50 232 Z" fill="#1A6BAA"/><path d="M76 156 Q90 151 104 156 L104 170 Q90 164 76 170 Z" fill="#1558A0"/><ellipse cx="48" cy="200" rx="10" ry="20" fill="#C89050" transform="rotate(-8,48,200)"/><ellipse cx="132" cy="200" rx="10" ry="20" fill="#C89050" transform="rotate(8,132,200)"/><ellipse cx="45" cy="219" rx="9" ry="7" fill="#7A4A1A"/><ellipse cx="135" cy="219" rx="9" ry="7" fill="#7A4A1A"/><ellipse cx="90" cy="160" rx="20" ry="10" fill="#D4A574"/><ellipse cx="90" cy="118" rx="44" ry="42" fill="#D4A574"/><ellipse cx="52" cy="93" rx="11" ry="14" fill="#C89050"/><ellipse cx="128" cy="93" rx="11" ry="14" fill="#C89050"/><ellipse cx="74" cy="115" rx="17" ry="14" fill="#6B3A1A" opacity=".75"/><ellipse cx="106" cy="115" rx="17" ry="14" fill="#6B3A1A" opacity=".75"/><ellipse cx="90" cy="130" rx="22" ry="18" fill="#F0D8B0"/><ellipse cx="90" cy="126" rx="6" ry="4" fill="#3A2010"/><path d="M84 132 Q90 138 96 132" stroke="#7A4A1A" stroke-width="1.5" fill="none" stroke-linecap="round"/><ellipse cx="74" cy="113" rx="9" ry="9.5" fill="#FFFEF8"/><ellipse cx="106" cy="113" rx="9" ry="9.5" fill="#FFFEF8"/><circle cx="74" cy="113" r="6" fill="#3A2010"/><circle cx="106" cy="113" r="6" fill="#3A2010"/><circle cx="74" cy="113" r="3.5" fill="#0A0604"/><circle cx="106" cy="113" r="3.5" fill="#0A0604"/><circle cx="76" cy="111" r="1.8" fill="white" opacity=".9"/><circle cx="108" cy="111" r="1.8" fill="white" opacity=".9"/><path d="M64 100 Q74 96 84 100" stroke="#5A3010" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M96 100 Q106 96 116 100" stroke="#5A3010" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse cx="90" cy="80" rx="52" ry="10" fill="#1A1008"/><path d="M48 80 Q46 45 90 42 Q134 45 132 80 Z" fill="#1A1008"/><path d="M52 78 Q90 74 128 78" stroke="#8B6020" stroke-width="4" fill="none"/></svg>';

  var MARTY_HEADER_SVG = '<svg width="42" height="42" viewBox="0 0 180 280" xmlns="http://www.w3.org/2000/svg"><ellipse cx="90" cy="210" rx="42" ry="50" fill="#D4A574"/><ellipse cx="90" cy="215" rx="23" ry="34" fill="#F0D8B0"/><path d="M52 178 Q52 158 90 156 Q128 158 128 178 L130 232 Q130 242 90 244 Q50 242 50 232 Z" fill="#1A6BAA"/><ellipse cx="90" cy="118" rx="44" ry="42" fill="#D4A574"/><ellipse cx="74" cy="115" rx="17" ry="14" fill="#6B3A1A" opacity=".75"/><ellipse cx="106" cy="115" rx="17" ry="14" fill="#6B3A1A" opacity=".75"/><ellipse cx="90" cy="130" rx="22" ry="18" fill="#F0D8B0"/><ellipse cx="90" cy="126" rx="6" ry="4" fill="#3A2010"/><path d="M84 132 Q90 138 96 132" stroke="#7A4A1A" stroke-width="1.5" fill="none" stroke-linecap="round"/><ellipse cx="74" cy="113" rx="9" ry="9.5" fill="#FFFEF8"/><ellipse cx="106" cy="113" rx="9" ry="9.5" fill="#FFFEF8"/><circle cx="74" cy="113" r="5.5" fill="#3A2010"/><circle cx="106" cy="113" r="5.5" fill="#3A2010"/><circle cx="74" cy="113" r="3" fill="#0A0604"/><circle cx="106" cy="113" r="3" fill="#0A0604"/><circle cx="76" cy="111" r="1.5" fill="white" opacity=".9"/><circle cx="108" cy="111" r="1.5" fill="white" opacity=".9"/><ellipse cx="90" cy="80" rx="52" ry="10" fill="#1A1008"/><path d="M48 80 Q46 45 90 42 Q134 45 132 80 Z" fill="#1A1008"/><path d="M52 78 Q90 74 128 78" stroke="#8B6020" stroke-width="3" fill="none"/></svg>';

  /* ── BUILD HTML ── */
  var wrap = document.createElement('div');
  wrap.id = 'mc-root';
  wrap.innerHTML = [
    /* Button */
    '<button id="marty-chat-btn" aria-label="Chat with Marty" onclick="window.mcToggle()" style="position:fixed !important;bottom:1.5rem !important;right:1.5rem !important;left:auto !important;top:auto !important;z-index:9999 !important;">',
      '<div style="position:relative;">',
        MARTY_BTN_SVG,
        '<div id="mc-notif">1</div>',
      '</div>',
      '<div id="mc-label">Ask Marty</div>',
    '</button>',

    /* Panel */
    '<div id="mc-panel" role="dialog" aria-label="Ask Marty" aria-modal="true">',

      /* Header */
      '<div id="mc-header" onclick="window.mcToggle()">',
        '<div class="mc-online-dot"></div>',
        MARTY_HEADER_SVG,
        '<div id="mc-header-text">',
          '<span id="mc-header-name">Marty the Meerkat</span>',
          '<span id="mc-header-sub">MO-ARK District Guide · Online</span>',
        '</div>',
        '<button id="mc-close-btn" aria-label="Close chat" onclick="event.stopPropagation();window.mcToggle()">✕</button>',
      '</div>',

      /* Messages */
      '<div id="mc-msgs">',
        '<div class="mc-msg mc-marty">Howdy, partner! 🤠 I\'m Marty — MO-ARK\'s official meerkat guide. Ask me anything about DLC, forms, the district board, resources, or anything on this site. I\'ll point you right to it!</div>',
      '</div>',
      '<div id="mc-typing"><span></span><span></span><span></span></div>',

      /* Quick chips */
      '<div id="mc-chips">',
        '<button class="mc-chip" onclick="window.mcAsk(\'When is DLC 2027?\')">📅 DLC dates</button>',
        '<button class="mc-chip" onclick="window.mcAsk(\'Where are the DLC registration forms?\')">📋 DLC forms</button>',
        '<button class="mc-chip" onclick="window.mcAsk(\'Who is the district governor?\')">👤 Governor</button>',
        '<button class="mc-chip" onclick="window.mcAsk(\'Where are the officer guidebooks?\')">📚 Guidebooks</button>',
        '<button class="mc-chip" onclick="window.mcAsk(\'How do I submit monthly reports?\')">📊 Monthly reports</button>',
        '<button class="mc-chip" onclick="window.mcAsk(\'When is ICON 2026?\')">🌐 ICON 2026</button>',
      '</div>',

      /* Input */
      '<div id="mc-input-row">',
        '<input id="mc-input" type="text" placeholder="Ask me anything about MO-ARK…" autocomplete="off" aria-label="Message Marty">',
        '<button id="mc-send" aria-label="Send message">',
          '<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
        '</button>',
      '</div>',

    '</div>',
  ].join('');
  document.body.appendChild(wrap);

  /* ── STATE ── */
  var open = false;
  var history = [];
  var chipsHidden = false;

  /* Show notification bubble after 3s to draw attention */
  setTimeout(function() {
    var notif = document.getElementById('mc-notif');
    if (notif && !open) notif.classList.add('show');
  }, 3000);

  /* ── TOGGLE ── */
  window.mcToggle = function() {
    open = !open;
    var panel = document.getElementById('mc-panel');
    var notif = document.getElementById('mc-notif');
    var chatBtn = document.getElementById('marty-chat-btn');
    var heroMarty = document.getElementById('marty-ql-wrap');
    panel.classList.toggle('mc-open', open);
    if (open) {
      if (notif) notif.classList.remove('show');
      /* Hide the sticky chat button and hero Marty */
      if (chatBtn) chatBtn.style.opacity = '0';
      if (chatBtn) chatBtn.style.pointerEvents = 'none';
      if (heroMarty) heroMarty.style.opacity = '0';
      if (heroMarty) heroMarty.style.pointerEvents = 'none';
      setTimeout(function() {
        var inp = document.getElementById('mc-input');
        if (inp) inp.focus();
      }, 420);
    } else {
      /* Restore the sticky chat button and hero Marty */
      if (chatBtn) chatBtn.style.opacity = '1';
      if (chatBtn) chatBtn.style.pointerEvents = '';
      if (heroMarty) heroMarty.style.opacity = '1';
      if (heroMarty) heroMarty.style.pointerEvents = '';
    }
  };

  /* ── SEND ── */
  window.mcAsk = function(preset) {
    var input = document.getElementById('mc-input');
    var q = (typeof preset === 'string' ? preset : input.value).trim();
    if (!q) return;
    input.value = '';

    if (!chipsHidden) {
      var chips = document.getElementById('mc-chips');
      if (chips) chips.style.display = 'none';
      chipsHidden = true;
    }

    addMsg(q, 'user');
    showTyping(true);

    var msgs = history.map(function(h) {
      return { role: h.role === 'model' ? 'assistant' : h.role, content: h.parts[0].text };
    });

    fetch('https://marty-ai.moarkkeyclubwebmaster.workers.dev', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: q, history: msgs })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      showTyping(false);
      var text = data.reply || "Shoot, I hit a snag! Try the [Contact page](https://www.moarkkeyclub.com/contact.html) for direct help.";
      history.push({ role: 'user',  parts: [{ text: q }] });
      history.push({ role: 'model', parts: [{ text: text }] });
      addMsg(text, 'marty', true);
    })
    .catch(function() {
      showTyping(false);
      addMsg("Yikes, something went wrong. Try the [Contact page](https://www.moarkkeyclub.com/contact.html) for direct help!", 'marty', true);
    });
  };

  /* ── HELPERS ── */
  function addMsg(text, who, parseLinks) {
    var msgs = document.getElementById('mc-msgs');
    var div = document.createElement('div');
    div.className = 'mc-msg mc-' + who;
    if (parseLinks) {
      div.innerHTML = text
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(_, t, u) {
          var href = u.startsWith('http') ? u : 'https://www.moarkkeyclub.com/' + u.replace(/^\//, '');
          return '<a href="' + href + '" target="_blank" rel="noopener">' + t + '</a>';
        })
        .replace(/\n/g, '<br>');
    } else {
      div.textContent = text;
    }
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function showTyping(show) {
    var t = document.getElementById('mc-typing');
    t.classList.toggle('mc-show', show);
    if (show) {
      var m = document.getElementById('mc-msgs');
      m.scrollTop = m.scrollHeight;
    }
  }

  /* ── INPUT EVENTS ── */
  document.getElementById('mc-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') window.mcAsk();
  });
  document.getElementById('mc-send').addEventListener('click', function() { window.mcAsk(); });

  /* ── ESCAPE TO CLOSE ── */
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && open) window.mcToggle();
  });

  } /* end init() */

  /* Wait for DOM to be ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
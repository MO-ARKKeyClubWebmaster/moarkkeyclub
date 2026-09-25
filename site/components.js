/* ============================================================
   components.js — MO-ARK District Key Club
   Include on every page: <script src="components.js"></script>
   ============================================================ */

/* ============================================================
   ANNOUNCEMENT BANNER CONFIG
   ─────────────────────────────────────────────────────────────
   BANNER-ACTIVE: true   ← flip to false to hide everywhere
   ============================================================ */
const BANNER_CONFIG = {

  'BANNER-ACTIVE': false,

  messages: [
    {
      icon: '📋',
      text: 'Officer Applications are due in <strong>14 days</strong> — don\'t miss your chance to lead!',
      link: { label: 'Apply Now', href: '/resources.html' },
    },
    {
      icon: '🏆',
      text: '<strong>District Convention</strong> registration opens March 1st — secure your spot early.',
      link: { label: 'Learn More', href: '/dlc.html' },
    },
    {
      icon: '📰',
      text: 'The Spring Newsletter is live — catch up on everything MO-ARK.',
      link: { label: 'Read It', href: '/newsletters.html' },
    },
  ],

  rotateInterval: 5000,  // ms between messages; 0 = no rotation
  dismissible:    true,  // show × button
  // NOTE: closing × only hides the banner for this page load.
  // It reappears on next visit / page navigation. That's intentional.
};
/* ============================================================
   END CONFIG
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  if (!BANNER_CONFIG['BANNER-ACTIVE']) return;

  var H = 44; // banner height in px

  /* ── CSS ──────────────────────────────────────────────────── */
  var css = `
    /* Push nav down */
    .nav        { top: ${H}px !important; }
    .nav-mobile { top: ${H + 68}px !important; }
    .page-header { padding-top: ${68 + H}px !important; }

    /* ── Shell ── */
    #mk-banner {
      position: fixed;
      top: 0; left: 0; right: 0;
      z-index: 1001;
      height: ${H}px;
      overflow: hidden;
      font-family: 'DM Sans', system-ui, sans-serif;

      /* TRUE frosted glass: very low opacity fill, heavy blur */
      background: rgba(10, 22, 40, 0.28);
      backdrop-filter: blur(20px) saturate(180%) brightness(0.85);
      -webkit-backdrop-filter: blur(20px) saturate(180%) brightness(0.85);

      /* Subtle border top of page isn't needed, bottom = gold */
      border-bottom: 1px solid rgba(200, 150, 42, 0.5);

      animation: mkDrop 0.5s cubic-bezier(0.22,1,0.36,1) both;
    }
    @keyframes mkDrop {
      from { transform: translateY(-100%); opacity: 0; }
      to   { transform: translateY(0);     opacity: 1; }
    }
    #mk-banner.mk-hiding {
      animation: mkRise 0.4s cubic-bezier(0.4,0,0.2,1) forwards !important;
    }
    @keyframes mkRise {
      to { transform: translateY(-100%); opacity: 0; }
    }

    /* ── Sweeping gold light ray ── */
    #mk-ray {
      position: absolute;
      top: 0; bottom: 0;
      width: 28%;
      pointer-events: none;
      background: linear-gradient(
        105deg,
        transparent 0%,
        rgba(200, 150, 42, 0.10) 30%,
        rgba(240, 193, 75, 0.38) 50%,
        rgba(200, 150, 42, 0.10) 70%,
        transparent 100%
      );
      animation: mkRay 4s ease-in-out infinite;
    }
    @keyframes mkRay {
      0%   { left: -32%; }
      100% { left: 115%; }
    }

    /* ── Glowing gold bottom line ── */
    #mk-line {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 1.5px;
      pointer-events: none;
      background: linear-gradient(
        90deg,
        transparent     0%,
        transparent    10%,
        rgba(240,193,75,0.7) 30%,
        #F0C14B        50%,
        rgba(240,193,75,0.7) 70%,
        transparent    90%,
        transparent   100%
      );
      animation: mkGlow 2.8s ease-in-out infinite alternate;
    }
    @keyframes mkGlow {
      from { opacity: 0.4; filter: blur(0px); }
      to   { opacity: 1.0; filter: blur(1px) drop-shadow(0 0 5px #F0C14B); }
    }

    /* ── Inner layout ── */
    #mk-inner {
      position: relative;
      z-index: 1;
      height: ${H}px;
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 3rem 0 1.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* ── Carousel ── */
    #mk-msgs {
      flex: 1;
      position: relative;
      height: ${H}px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .mk-msg {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      font-size: 0.8125rem;
      font-weight: 500;
      color: rgba(255,255,255,0.92);
      letter-spacing: 0.015em;
      white-space: nowrap;
      opacity: 0;
      transform: translateY(9px);
      transition: opacity 0.4s ease, transform 0.4s ease;
      pointer-events: none;
    }
    .mk-msg.mk-active {
      opacity: 1;
      transform: translateY(0);
      pointer-events: all;
    }
    .mk-msg.mk-exit {
      opacity: 0;
      transform: translateY(-9px);
      pointer-events: none;
    }
    .mk-icon { font-size: 0.9rem; flex-shrink: 0; }
    .mk-msg strong { color: #F0C14B; font-weight: 700; }

    /* ── CTA pill ── */
    .mk-cta {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: 0.75rem;
      padding: 0.18rem 0.7rem;
      background: rgba(200,150,42,0.2);
      border: 1px solid rgba(240,193,75,0.5);
      border-radius: 100px;
      font-size: 0.7rem;
      font-weight: 700;
      color: #F0C14B;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      text-decoration: none;
      white-space: nowrap;
      flex-shrink: 0;
      transition: background 0.2s, border-color 0.2s, transform 0.15s;
    }
    .mk-cta:hover {
      background: rgba(240,193,75,0.32);
      border-color: rgba(240,193,75,0.85);
      color: #fff;
      transform: translateY(-1px);
    }
    .mk-arrow { font-size: 0.6rem; opacity: 0.75; }

    /* ── Dots ── */
    #mk-dots {
      display: flex;
      gap: 5px;
      align-items: center;
      flex-shrink: 0;
      margin-left: 0.875rem;
    }
    .mk-dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: rgba(255,255,255,0.28);
      border: none;
      padding: 0;
      cursor: pointer;
      transition: background 0.3s, transform 0.3s;
    }
    .mk-dot.mk-active { background: #F0C14B; transform: scale(1.5); }

    /* ── Close button ── */
    #mk-close {
      position: absolute;
      right: 0.875rem;
      top: 50%;
      transform: translateY(-50%);
      z-index: 2;
      width: 22px; height: 22px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 50%;
      color: rgba(255,255,255,0.6);
      font-size: 0.7rem;
      cursor: pointer;
      transition: background 0.2s, color 0.2s, transform 0.25s;
      line-height: 1;
    }
    #mk-close:hover {
      background: rgba(255,255,255,0.22);
      color: #fff;
      transform: translateY(-50%) rotate(90deg);
    }

    /* ── Mobile ── */
    @media (max-width: 600px) {
      #mk-banner { height: 38px; }
      #mk-inner  { height: 38px; padding: 0 2.5rem 0 0.875rem; }
      #mk-msgs   { height: 38px; }
      .mk-msg    { font-size: 0.72rem; }
      .mk-cta    { display: none; }
      #mk-dots   { display: none; }
      .nav        { top: 38px !important; }
      .nav-mobile { top: ${38 + 68}px !important; }
      .page-header { padding-top: ${38 + 68}px !important; }
    }
  `;

  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ── Build HTML ── */
  var msgs  = BANNER_CONFIG.messages || [];
  var multi = msgs.length > 1;

  var banner = document.createElement('div');
  banner.id = 'mk-banner';

  // Ray + line decorations
  var ray  = document.createElement('div'); ray.id  = 'mk-ray';
  var line = document.createElement('div'); line.id = 'mk-line';
  banner.appendChild(ray);
  banner.appendChild(line);

  var inner = document.createElement('div'); inner.id = 'mk-inner';
  var carousel = document.createElement('div'); carousel.id = 'mk-msgs';

  msgs.forEach(function (m, i) {
    var el = document.createElement('div');
    el.className = 'mk-msg' + (i === 0 ? ' mk-active' : '');
    var h = '';
    if (m.icon) h += '<span class="mk-icon">' + m.icon + '</span>';
    h += '<span>' + m.text + '</span>';
    if (m.link) h += '<a class="mk-cta" href="' + m.link.href + '">' + m.link.label + '<span class="mk-arrow"> →</span></a>';
    el.innerHTML = h;
    carousel.appendChild(el);
  });

  inner.appendChild(carousel);

  if (multi) {
    var dotsEl = document.createElement('div'); dotsEl.id = 'mk-dots';
    msgs.forEach(function (_, i) {
      var d = document.createElement('button');
      d.className = 'mk-dot' + (i === 0 ? ' mk-active' : '');
      d.addEventListener('click', function () { goTo(i); });
      dotsEl.appendChild(d);
    });
    inner.appendChild(dotsEl);
  }

  if (BANNER_CONFIG.dismissible) {
    var closeBtn = document.createElement('button');
    closeBtn.id = 'mk-close';
    closeBtn.setAttribute('aria-label', 'Dismiss');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', dismiss);
    banner.appendChild(closeBtn);
  }

  banner.appendChild(inner);
  document.body.insertBefore(banner, document.body.firstChild);

  /* ── Carousel logic ── */
  var cur   = 0;
  var timer = null;
  var allMsgs = carousel.querySelectorAll('.mk-msg');
  var allDots = document.querySelectorAll('.mk-dot');

  function goTo(next) {
    if (next === cur) return;
    var prev = cur;
    allMsgs[prev].classList.remove('mk-active');
    allMsgs[prev].classList.add('mk-exit');
    setTimeout(function () { allMsgs[prev].classList.remove('mk-exit'); }, 420);
    cur = next;
    allMsgs[cur].classList.add('mk-active');
    allDots.forEach(function (d, i) { d.classList.toggle('mk-active', i === cur); });
  }

  function tick() { goTo((cur + 1) % msgs.length); }
  function start() { if (BANNER_CONFIG.rotateInterval > 0 && multi) timer = setInterval(tick, BANNER_CONFIG.rotateInterval); }
  function stop()  { clearInterval(timer); timer = null; }

  banner.addEventListener('mouseenter', stop);
  banner.addEventListener('mouseleave', start);
  start();

  /* ── Dismiss (page-load only, reappears on next load) ── */
  function dismiss() {
    stop();
    banner.classList.add('mk-hiding');
    banner.addEventListener('animationend', function () {
      banner.remove();
      styleEl.remove();
      // Restore nav position
      var nav = document.querySelector('.nav');
      var mob = document.querySelector('.nav-mobile');
      var hdr = document.querySelector('.page-header');
      if (nav) nav.style.removeProperty('top');
      if (mob) mob.style.removeProperty('top');
      if (hdr) hdr.style.removeProperty('padding-top');
    }, { once: true });
  }

});
/**
 * MO-ARK District Officer Portal - Shared runtime
 * ===========================================================================
 * ONE file, loaded on every page, that provides:
 *   • OFFICERS  - the roster (names, photos, divisions, regions)
 *   • PORTAL    - greeting engine, per-officer stats, toast, loader
 *   • NOTIFY    - the notifications inbox (derived from portal data)
 *   • the shared top navigation (built once, identical on every page)
 *   • the reimbursement pop-up watcher (fires the "IMMEDIATE ATTENTION" form)
 *
 * Load order per page:  auth.js → api.js → logger.js → portal.js → page code
 * On the login page:     portal.js → auth.js   (so OFFICERS exists at login)
 *
 * ▶ TO ADD REAL NAMES / PHOTOS / REGIONS: edit ROSTER below. That's it -
 *   the greeting, nav avatar, profile page, and the name saved on every
 *   submission all read from here.
 * ===========================================================================
 */

/* ─────────────────────────────────────────────────────────────────────────
   OFFICER ROSTER
   ───────────────────────────────────────────────────────────────────────── */
const OFFICERS = (() => {
  // key = login email (lowercase). Username-only adults are keyed by their
  //       lowercased username (e.g. "districtadmin").
  //   name   : real name (shows in greeting + recorded on submissions)
  //   photo  : "assets/div1.jpg" or a URL - leave "" for initials avatar
  //   region : what the division covers (shown on profile as the "meaning")
  const ROSTER = {
    // -- Lieutenant Governors --
    'moarkkcltg1@gmail.com':        { name: 'Savanna Scruggs',         role: 'ltg', division: 1,  photo: 'assets/ltg1.jpeg',  region: '' },
    'moarkkcltg002@gmail.com':      { name: 'Pritam Avuthu',           role: 'ltg', division: 2,  photo: 'assets/ltg2.jpeg',  region: '' },
    'moarkkeyclubltg3@gmail.com':   { name: 'Mary Ann Gingerich',      role: 'ltg', division: 3,  photo: 'assets/ltg3.jpeg',  region: '' },
    'moarkeyclubltg04@gmail.com':   { name: 'Bethany Liao',            role: 'ltg', division: 4,  photo: 'assets/ltg4.jpeg', region: '' },
    'moarkkcltg05@gmail.com':       { name: 'Makenlei Shafferkoetter', role: 'ltg', division: 5,  photo: 'assets/ltg5.jpeg',  region: '' },
    'moarkkcltg6@gmail.com':        { name: 'Ava Long',                role: 'ltg', division: 6,  photo: 'assets/ltg6.jpeg',  region: '' },
    'moarkkcltg007@gmail.com':      { name: 'Division 7 LTG',          role: 'ltg', division: 7,  photo: '', region: '', vacant: true },
    'moarkkcltg08@gmail.com':       { name: 'Andy Santizo',            role: 'ltg', division: 8,  photo: 'assets/ltg8.jpeg',  region: '' },
    'moarkkcltg9@gmail.com':        { name: 'Amara Miles',             role: 'ltg', division: 9,  photo: 'assets/ltg9.jpeg',  region: '' },
    'moarkkcltg010@gmail.com':      { name: 'Tanvi Narendhula',        role: 'ltg', division: 10, photo: 'assets/ltg10.jpeg', region: '' },
    // -- District Board (order of authority: Governor, Secretary, Treasurer, Webmaster, Editor) --
    'moarkkeyclubgovernor@gmail.com':  { name: 'Dakota Menning',     role: 'governor',  division: null, photo: 'assets/governor.png',  title: 'District Governor' },
    'moarkkcsecretary@gmail.com':      { name: 'Omar Vargas Garcia', role: 'secretary', division: null, photo: 'assets/secretary.png', title: 'District Secretary' },
    'momoarkkctreasurer@gmail.com':    { name: 'Abraham Ireland',    role: 'treasurer', division: null, photo: 'assets/treasurer.png', title: 'District Treasurer' },
    'moarkkeyclubwebmaster@gmail.com': { name: 'Rahul Awasthi',      role: 'webmaster', division: null, photo: 'assets/webmaster.png', title: 'District Webmaster' },
    'moarkkeditor1@gmail.com':         { name: 'Nandu Rakesh Nair',  role: 'editor',    division: null, photo: 'assets/editor.png',    title: 'District Editor' },
    // -- Adults --
    'james.sturch@southsideschools.org': { name: 'James Sturch',    role: 'adult-treasurer', division: null, photo: '', title: 'Treasurer' },
    'districtadmin':                     { name: 'Cheryl Anderson', role: 'district-admin',  division: null, photo: '', title: 'District Administrator' },
    'mirandayoung':                      { name: 'Miranda Young',   role: 'adult-member',    division: null, photo: '', title: 'Adult Board Member' },
    'carlaobrien':                       { name: "Carla O'Brien",   role: 'adult-member',    division: null, photo: '', title: 'Adult Board Member' },
    'hollyhoffman':                      { name: 'Holly Hoffman',   role: 'adult-member',    division: null, photo: '', title: 'Adult Board Member' },
    'carter-stephanie@trojans.k12.mo.us':{ name: 'Stephanie Carter', role: 'adult-member',    division: null, photo: '', title: 'Adult Board Member' },
  };

  const ROLE_TITLES = {
    ltg: 'Lieutenant Governor', editor: 'District Editor', governor: 'District Governor',
    treasurer: 'District Treasurer', secretary: 'District Secretary', webmaster: 'District Webmaster',
    'adult-treasurer': 'Treasurer', 'district-admin': 'District Administrator',
    'adult-member':    'Adult Board Member',
  };

  // Fixed display order for member lists (attendance, etc.).
  const BOARD_ORDER = [
    'moarkkeyclubgovernor@gmail.com', 'moarkkcsecretary@gmail.com', 'momoarkkctreasurer@gmail.com',
    'moarkkeyclubwebmaster@gmail.com', 'moarkkeditor1@gmail.com',
    'james.sturch@southsideschools.org', 'districtadmin',
    'mirandayoung', 'carlaobrien', 'hollyhoffman',
    'carter-stephanie@trojans.k12.mo.us',
  ];

  const isPlaceholder = n => /^division\s+\d+\s+ltg$/i.test((n || '').trim());

  function get(email) { return email ? (ROSTER[email.toLowerCase()] || null) : null; }

  function titleFor(email) {
    const rec = get(email);
    if (!rec) return 'Officer';
    return rec.title || roleTitle(rec.role, rec.division);
  }

  // A real, mailable email for this member, or null (username-only accounts).
  function contactEmailFor(email) {
    const key = (email || '').toLowerCase();
    return key.includes('@') ? key : null;
  }

  /**
   * Every non-vacant member of the district, in board-then-division order.
   * Used to build the attendance checklist on board meetings.
   * Returns: { email, name, title, role, division, contactEmail }
   */
  function allMembers() {
    const out = [];
    const push = key => {
      const rec = ROSTER[key];
      if (!rec || rec.vacant) return;
      out.push({
        email: key,
        name: rec.name,
        title: rec.title || roleTitle(rec.role, rec.division),
        role: rec.role,
        division: rec.division || null,
        contactEmail: contactEmailFor(key),
      });
    };
    BOARD_ORDER.forEach(push);
    // LTGs 1-10 in division order
    Object.keys(ROSTER)
      .filter(k => ROSTER[k].role === 'ltg' && !ROSTER[k].vacant)
      .sort((a, b) => (ROSTER[a].division || 0) - (ROSTER[b].division || 0))
      .forEach(push);
    return out;
  }

  function forSession(session) {
    if (!session) return null;
    const rec = get(session.email) || {};
    const name = rec.name || session.name || 'Officer';
    const division = (rec.division !== undefined ? rec.division : session.division) || null;
    const photo = rec.photo || '';
    return {
      email: session.email, role: session.role, division, name,
      firstName: firstNameOf(name),
      photo,
      region: rec.region || '',
      title: rec.title || roleTitle(session.role, division),
    };
  }

  function firstNameOf(name) {
    if (!name) return 'there';
    if (isPlaceholder(name)) return 'Div ' + name.match(/\d+/)[0];
    return name.trim().split(/\s+/)[0];
  }
  function roleTitle(role, division) {
    if (role === 'ltg') return division ? `Lieutenant Governor · Division ${division}` : 'Lieutenant Governor';
    return ROLE_TITLES[role] || (role ? role[0].toUpperCase() + role.slice(1) : 'Officer');
  }
  function initials(name) {
    if (!name) return '?';
    if (isPlaceholder(name)) return name.match(/\d+/)[0];
    const p = name.trim().split(/\s+/);
    return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
  }
  function avatarInner(officer) {
    if (officer && officer.photo) return `<img src="${officer.photo}" alt="">`;
    return initials(officer ? officer.name : '');
  }

  return { ROSTER, get, forSession, roleTitle, titleFor, contactEmailFor, allMembers, firstNameOf, initials, avatarInner };
})();

/* ─────────────────────────────────────────────────────────────────────────
   PORTAL - greeting, stats, toast, loader, misc helpers
   ───────────────────────────────────────────────────────────────────────── */
const PORTAL = (() => {
  const TIME = {
    morning:   ['Good morning, {name}', 'Rise and serve, {name}', 'Fresh start, {name}'],
    afternoon: ['Good afternoon, {name}', 'Hope the day’s treating you well, {name}'],
    evening:   ['Good evening, {name}', 'Winding down, {name}?'],
    night:     ['Working late, {name}?', 'Burning the midnight oil, {name}?'],
  };
  const ANY = [
    'Welcome back, {name}', 'Great to see you, {name}', 'Ready to serve, {name}?',
    'Caring - our way of life, {name}', 'Let’s build a better district, {name}',
    'Service above self, {name}', 'Lead the way, {name}',
    'The district’s in good hands, {name}', 'Onward, {name}',
    'Let’s make it count, {name}', 'Another day of service, {name}',
    'Key Club looks good on you, {name}',
  ];
  const bucket = h => h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 22 ? 'evening' : 'night';

  function greeting(firstName, date = new Date()) {
    const safe = firstName || 'there';
    const pool = [...TIME[bucket(date.getHours())], ...ANY];
    return pool[Math.floor(Math.random() * pool.length)].replace('{name}', `<em>${safe}</em>`);
  }

  function statsFor(officer, { subs = [], dcms = [], mrfs = [], committees = [] } = {}) {
    const isLTG = officer.role === 'ltg';
    const mine = arr => isLTG ? arr.filter(x => x.division === officer.division) : arr;
    const mySubs = isLTG ? subs.filter(s => s.division === officer.division)
                         : subs.filter(s => (s.ltgEmail || '').toLowerCase() === officer.email.toLowerCase());
    const myComm = committees.filter(c => (c.submitterEmail || '').toLowerCase() === officer.email.toLowerCase());
    return {
      newslettersApproved: mySubs.filter(s => s.type !== 'dc-report' && s.status === 'approved').length,
      newslettersTotal:    mySubs.filter(s => s.type !== 'dc-report').length,
      dcReports:           mySubs.filter(s => s.type === 'dc-report' && s.status === 'approved').length,
      dcmsReported:        mine(dcms).filter(d => d.reportStatus === 'submitted').length,
      dcmsScheduled:       mine(dcms).filter(d => d.status !== 'unscheduled').length,
      mrfs:                mine(mrfs).length,
      committeeReports:    myComm.length,
    };
  }

  function toast(msg, type = 'info') {
    let host = document.querySelector('.toast-host');
    if (!host) { host = document.createElement('div'); host.className = 'toast-host'; document.body.appendChild(host); }
    const bg = type === 'success' ? '#12643A' : type === 'error' ? '#9B1C1C' : '#0B1B33';
    const t = document.createElement('div');
    t.style.cssText = `padding:.8rem 1.15rem;background:${bg};color:#fff;border-radius:12px;font-size:.875rem;font-weight:600;box-shadow:0 8px 26px rgba(0,0,0,.25);opacity:0;transform:translateY(10px);transition:opacity .25s,transform .25s;max-width:340px;`;
    t.textContent = msg;
    host.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; setTimeout(() => t.remove(), 300); }, 3600);
  }

  function loading(text) {
    return `<div class="loader"><div class="spinner-lg"></div>`
         + `<div class="loader-label">${text || 'Loading…'}</div></div>`;
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Load an external script once, resolving when ready. Used to lazy-load
  // jsPDF + the reimbursement module only when a pop-up actually needs them.
  const _loaded = {};
  function loadScript(src) {
    if (_loaded[src]) return _loaded[src];
    _loaded[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
    return _loaded[src];
  }

  return { greeting, statsFor, toast, loading, escapeHTML, loadScript };
})();

/* ─────────────────────────────────────────────────────────────────────────
   NOTIFY - notifications inbox, derived from the portal's own data.
   No backend changes needed: notifications are computed from submissions +
   deadlines. Read/unread is remembered per-officer on this device.
   ───────────────────────────────────────────────────────────────────────── */
const NOTIFY = (() => {
  const ICON = { returned: '↩', approved: '✓', review: '📝', deadline: '🗓', info: '•' };
  const label = s => (s.type === 'newsletter' ? 'Newsletter' : 'DC report');

  function compute(session, data) {
    const me = OFFICERS.forSession(session);
    const subs = (data && data.subs) || [];
    const out = [];

    if (session.role === 'ltg') {
      subs.filter(s => s.division === me.division).forEach(s => {
        if (s.status === 'denied') {
          const msg = [...(s.thread || [])].reverse().find(m => m.to === 'ltg' && m.message);
          out.push({ id: `sub:${s.id}:denied:${s.updatedAt}`, kind: 'returned',
            title: `${label(s)} returned - ${s.month}`,
            body: msg ? msg.message : 'Needs revision. Open it to resubmit.',
            time: s.updatedAt, link: 'newsletter.html' });
        } else if (s.status === 'approved') {
          out.push({ id: `sub:${s.id}:approved:${s.updatedAt}`, kind: 'approved',
            title: `${label(s)} approved - ${s.month}`,
            body: 'Approved and published. Nice work!',
            time: s.updatedAt, link: 'newsletter.html' });
        }
      });
      addDeadline(out, 'nl');
      addDeadline(out, 'mrf');
    } else if (session.role === 'editor') {
      subs.filter(s => s.status === 'pending-editor').forEach(s => {
        out.push({ id: `rev:${s.id}:${s.submittedAt}`, kind: 'review',
          title: `Div ${s.division} submitted ${s.month} ${label(s).toLowerCase()}`,
          body: `From ${s.ltgName}. Waiting on your review.`,
          time: s.submittedAt, link: 'review.html' });
      });
    } else if (session.role === 'webmaster') {
      subs.filter(s => s.status === 'pending-webmaster').forEach(s => {
        out.push({ id: `fin:${s.id}:${s.updatedAt}`, kind: 'review',
          title: `Div ${s.division} - ${s.month} ready for final approval`,
          body: 'Editor-approved. Waiting on you.',
          time: s.updatedAt, link: 'review.html' });
      });
    } else { // governor / treasurer / secretary — a feed of district activity
      subs.filter(s => s.status === 'approved')
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 10)
        .forEach(s => out.push({ id: `appr:${s.id}:${s.updatedAt}`, kind: 'approved',
          title: `Div ${s.division} - ${s.month} newsletter published`,
          body: `Submitted by ${s.ltgName}.`, time: s.updatedAt, link: 'newsletter.html' }));
    }

    out.sort((a, b) => new Date(b.time) - new Date(a.time));
    return out;
  }

  function addDeadline(out, which) {
    try {
      const d = which === 'nl' ? API.getNextDeadline() : API.getNextMRFDeadline();
      if (!d) return;
      const days = Math.ceil((d.deadline - Date.now()) / 86400000);
      if (days < 0 || days > 7) return;
      const what = which === 'nl' ? `${d.month} newsletter` : `${d.month} monthly report (MRF)`;
      out.push({ id: `deadline:${which}:${d.deadline.toISOString().slice(0, 10)}`, kind: 'deadline',
        title: `${what} due in ${days} day${days !== 1 ? 's' : ''}`,
        body: `Due ${d.deadline.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`,
        time: new Date().toISOString(), link: which === 'nl' ? 'newsletter.html' : 'mrf.html' });
    } catch (_) {}
  }

  const key = email => 'moark_read_' + (email || '').toLowerCase();
  function readSet(email) { try { return new Set(JSON.parse(localStorage.getItem(key(email)) || '[]')); } catch (_) { return new Set(); } }
  function saveRead(email, set) { try { localStorage.setItem(key(email), JSON.stringify([...set].slice(-800))); } catch (_) {} }
  function markRead(email, ids) { const s = readSet(email); ids.forEach(i => s.add(i)); saveRead(email, s); }
  function isUnread(email, id) { return !readSet(email).has(id); }
  function unreadCount(email, list) { const s = readSet(email); return list.filter(n => !s.has(n.id)).length; }

  function relTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.round(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.round(m / 60); if (h < 24) return h + 'h ago';
    const d = Math.round(h / 24); if (d < 7) return d + 'd ago';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  async function fetchData() {
    const subs = await API.getAll().catch(() => []);
    return { subs };
  }

  function itemHTML(session, n) {
    const unread = isUnread(session.email, n.id);
    return `<div class="notif-item ${unread ? 'unread' : ''}" data-nid="${n.id}" data-link="${n.link || ''}">
      <span class="notif-ic notif-${n.kind}">${ICON[n.kind] || '•'}</span>
      <div class="notif-txt">
        <div class="notif-title">${PORTAL.escapeHTML(n.title)}</div>
        <div class="notif-body">${PORTAL.escapeHTML(n.body || '')}</div>
        <div class="notif-time">${relTime(n.time)}</div>
      </div>
      ${unread ? '<span class="notif-dot"></span>' : ''}
    </div>`;
  }

  return { compute, ICON, label, readSet, saveRead, markRead, isUnread, unreadCount, relTime, fetchData, itemHTML };
})();

/* ─────────────────────────────────────────────────────────────────────────
   SHARED TOP NAVIGATION  (built once - never drifts between pages)
   ───────────────────────────────────────────────────────────────────────── */
(function buildNav() {
  if (typeof AUTH === 'undefined') return;          // auth not loaded (e.g. login page)
  const nav = document.querySelector('.topnav');
  if (!nav) return;                                  // page has no nav (login)
  const session = AUTH.getUser();
  if (!session) return;                              // not signed in; page will redirect

  const me = OFFICERS.forSession(session);
  const canReview  = AUTH.canReview && AUTH.canReview();
  const canSeeAll  = AUTH.canSeeAll && AUTH.canSeeAll();
  const canConsole = AUTH.canAccessConsole && AUTH.canAccessConsole();
  const here = (location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();

  const links = [
    ['dashboard.html', 'Dashboard',         true],
    ['newsletter.html','Newsletter',        true],
    ['dcm.html',       'DCMs',              true],
    ['mrf.html',       'Monthly RF',        true],
    ['committee.html', 'Committee Reports', true],
    ['calendar.html',  'Calendar',          true],
    ['review.html',    'Review Queue',      canReview || canSeeAll, 'navReview'],
    ['console.html',   'Console',           canConsole, 'navConsole', 'topnav-console'],
  ];

  const linkHTML = links.filter(l => l[2]).map(([href, label, , id, extra]) => {
    const active = (here === href) || (here === 'submit.html' && href === 'newsletter.html')
                                    || (here === 'archive.html' && href === 'newsletter.html');
    return `<a href="${href}" class="topnav-link ${extra || ''} ${active ? 'active' : ''}"${id ? ` id="${id}"` : ''}>${label}</a>`;
  }).join('');

  const roleLabel = (session.role || '').toUpperCase();
  const bellActive = here === 'notifications.html' ? 'active' : '';

  nav.innerHTML = `
    <a href="dashboard.html" class="topnav-logo">
      <img src="Key%20Club%20Logo.png" alt="Key Club" class="topnav-mark">
      <div><div class="topnav-name">MO-ARK District</div><div class="topnav-sub">Officer Portal</div></div>
    </a>
    <div class="topnav-divider"></div>
    <button class="nav-burger" id="navBurger" aria-label="Menu">☰</button>
    <div class="topnav-links" id="navLinks">${linkHTML}</div>
    <div class="topnav-user">
      <div class="nav-bell-wrap">
        <button class="nav-bell ${bellActive}" id="navBell" aria-label="Notifications" title="Notifications">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
          <span class="nav-bell-badge" id="navBellBadge" hidden>0</span>
        </button>
        <div class="notif-menu" id="notifMenu">
          <div class="notif-menu-head"><span>Notifications</span><button class="notif-mark" id="notifMarkAll">Mark all read</button></div>
          <div class="notif-menu-body" id="notifMenuBody">${PORTAL.loading('')}</div>
          <a class="notif-menu-foot" href="notifications.html">View all notifications →</a>
        </div>
      </div>
      <button class="nav-menu-btn" id="navMenuBtn">
        <span class="topnav-username" id="navName">${me.name}</span>
        <span class="role-chip role-${session.role}" id="navRole">${roleLabel}</span>
        <span class="topnav-avatar" id="navAvatar">${OFFICERS.avatarInner(me)}</span>
      </button>
      <div class="nav-menu" id="navMenu">
        <div class="nav-menu-head">
          <span class="topnav-avatar" style="width:42px;height:42px;">${OFFICERS.avatarInner(me)}</span>
          <div><div class="nav-menu-name">${me.name}</div><div class="nav-menu-sub">${me.title}</div></div>
        </div>
        <a class="nav-menu-item" href="profile.html">👤 &nbsp;My Profile</a>
        <a class="nav-menu-item" href="notifications.html">🔔 &nbsp;Notifications</a>
        <a class="nav-menu-item" href="dashboard.html">🏠 &nbsp;Dashboard</a>
        <button class="nav-menu-item danger" id="navSignOut">⏻ &nbsp;Sign out</button>
      </div>
    </div>`;

  // User dropdown
  const menu = nav.querySelector('#navMenu');
  const menuBtn = nav.querySelector('#navMenuBtn');
  menuBtn.addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('open'); notifMenu.classList.remove('open'); });
  nav.querySelector('#navSignOut').addEventListener('click', () => AUTH.logout());

  // Notifications dropdown
  const bell = nav.querySelector('#navBell');
  const notifMenu = nav.querySelector('#notifMenu');
  bell.addEventListener('click', e => { e.stopPropagation(); notifMenu.classList.toggle('open'); menu.classList.remove('open'); });

  document.addEventListener('click', e => {
    if (!menu.contains(e.target) && !menuBtn.contains(e.target)) menu.classList.remove('open');
    if (!notifMenu.contains(e.target) && !bell.contains(e.target)) notifMenu.classList.remove('open');
  });

  // Mobile burger
  const burger = nav.querySelector('#navBurger');
  const linksEl = nav.querySelector('#navLinks');
  burger.addEventListener('click', () => linksEl.classList.toggle('open'));

  // ── Load notifications (async, non-blocking) ─────────────────────────
  let notifs = [];
  function paintBadge() {
    const n = NOTIFY.unreadCount(session.email, notifs);
    const badge = nav.querySelector('#navBellBadge');
    if (n > 0) { badge.textContent = n > 9 ? '9+' : String(n); badge.hidden = false; bell.classList.add('has-unread'); }
    else { badge.hidden = true; bell.classList.remove('has-unread'); }
  }
  function paintList() {
    const body = nav.querySelector('#notifMenuBody');
    if (!notifs.length) { body.innerHTML = `<div class="notif-empty">You're all caught up 🎉</div>`; return; }
    body.innerHTML = notifs.slice(0, 8).map(n => NOTIFY.itemHTML(session, n)).join('');
    body.querySelectorAll('[data-nid]').forEach(el => el.addEventListener('click', () => {
      NOTIFY.markRead(session.email, [el.dataset.nid]);
      if (el.dataset.link) location.href = el.dataset.link;
    }));
  }
  nav.querySelector('#notifMarkAll').addEventListener('click', () => {
    NOTIFY.markRead(session.email, notifs.map(n => n.id));
    paintBadge(); paintList();
  });

  if (typeof API !== 'undefined') {
    NOTIFY.fetchData().then(data => { notifs = NOTIFY.compute(session, data); paintBadge(); paintList(); })
      .catch(() => { const body = nav.querySelector('#notifMenuBody'); if (body) body.innerHTML = `<div class="notif-empty">Couldn't load notifications.</div>`; });
  }
})();

/* ─────────────────────────────────────────────────────────────────────────
   REIMBURSEMENT POP-UP WATCHER
   On every signed-in page (except the login page and the reimbursement page
   itself) this checks whether the current officer has a reimbursement form
   that needs their attention and, if so, forces the non-dismissible
   "IMMEDIATE ATTENTION" pop-up. Denials/rejections show the same way and
   persist across refreshes because the state lives on the server.
   The heavy form code (reimbursement.js + jsPDF) is loaded only when needed.
   ───────────────────────────────────────────────────────────────────────── */
const REIMB_ASSETS = {
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  module: 'reimbursement.js',
};
async function ensureReimbursementAssets() {
  if (!window.jspdf) { try { await PORTAL.loadScript(REIMB_ASSETS.jspdf); } catch (_) {} }
  if (typeof REIMB === 'undefined') await PORTAL.loadScript(REIMB_ASSETS.module);
  return typeof REIMB !== 'undefined' ? REIMB : null;
}

(function reimbursementWatch() {
  if (typeof AUTH === 'undefined' || typeof API === 'undefined') return;
  const session = AUTH.getUser();
  if (!session) return;
  const here = (location.pathname.split('/').pop() || '').toLowerCase();
  if (here === '' || here === 'index.html' || here === 'reimbursement.html' || here === 'login.html') return;

  const ACTIONABLE = ['sent', 'treasurer-denied', 'adult-rejected'];
  API.getReimbursementsForOfficer(session.email).then(list => {
    const actionable = (list || []).filter(r => ACTIONABLE.includes(r.status));
    if (!actionable.length) return;
    ensureReimbursementAssets().then(mod => {
      if (mod && mod.showBlockingModal) mod.showBlockingModal(session, actionable);
    });
  }).catch(() => {});
})();

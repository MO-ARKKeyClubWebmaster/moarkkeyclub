/**
 * MO-ARK District Portal - Auth Module
 * Credentials live here. Keep this repo PRIVATE on GitHub.
 * To change a password: update the value in USERS below.
 * Display names, photos, divisions and regions live in portal.js (OFFICERS);
 * this file only checks credentials. On login the session's display name and
 * division are pulled from the roster when portal.js is loaded first.
 *
 * ── LOGIN IDENTIFIERS ─────────────────────────────────────────────────
 * Most officers sign in with their district email. Two adult accounts sign
 * in with a USERNAME instead (they have no district gmail):
 *     • Cheryl Anderson  → username DISTRICTADMIN   (District Administrator)
 *     • James Sturch     → username ADULTTREASURER  (adult Treasurer)
 * Usernames are case-insensitive. Emails are matched lowercased.
 */

const AUTH = (() => {

  // ── USER DATABASE ────────────────────────────────────────────────────
  // role: 'ltg' | 'editor' | 'governor' | 'treasurer' | 'secretary' | 'webmaster'
  //     | 'adult-treasurer' | 'district-admin'
  // division: only for LTGs (1-10)
  // Accounts that log in by username set `username` and leave `email` null.
const USERS = [
    // ── LTGs ──
    { email: 'moarkkcltg1@gmail.com',      password: 'ServeFirst_Div1',      role: 'ltg', division: 1,  name: 'Division 1 LTG' },
    { email: 'moarkkcltg002@gmail.com',    password: 'OneFamily_Div2',       role: 'ltg', division: 2,  name: 'Division 2 LTG' },
    { email: 'moarkkeyclubltg3@gmail.com', password: 'BuildBetter_Div3',     role: 'ltg', division: 3,  name: 'Division 3 LTG' },
    { email: 'moarkeyclubltg04@gmail.com', password: 'GuidingLight_Div4',    role: 'ltg', division: 4,  name: 'Bethany Liao' },
    { email: 'moarkkcltg05@gmail.com',     password: 'RiseAndServe5',        role: 'ltg', division: 5,  name: 'Division 5 LTG' },
    { email: 'moarkkcltg6@gmail.com',     password: 'SixStrong_KC6',        role: 'ltg', division: 6,  name: 'Division 6 LTG' },
    { email: 'moarkkcltg007@gmail.com',    password: 'CareActLead_7',        role: 'ltg', division: 7,  name: 'Division 7 LTG' },
    { email: 'moarkkcltg08@gmail.com',     password: 'Div8_ServiceAboveAll', role: 'ltg', division: 8,  name: 'Division 8 LTG' },
    { email: 'moarkkcltg9@gmail.com',      password: 'NineForService',       role: 'ltg', division: 9,  name: 'Division 9 LTG' },
    { email: 'moarkkcltg010@gmail.com',    password: 'Div10_MakeADiff',      role: 'ltg', division: 10, name: 'Division 10 LTG' },
    // ── Board ──
    { email: 'moarkkeyclubgovernor@gmail.com',  password: 'govpass1',  role: 'governor',  division: null, name: 'District Governor' },
    { email: 'momoarkkctreasurer@gmail.com',    password: 'trspass1',  role: 'treasurer', division: null, name: 'District Treasurer' },
    { email: 'moarkkcsecretary@gmail.com',     password: 'secpass1',  role: 'secretary', division: null, name: 'District Secretary' },
    { email: 'moarkkeyclubwebmaster@gmail.com', password: 'webpass1',  role: 'webmaster', division: null, name: 'Webmaster' },
    { email: 'moarkkeditor1@gmail.com',         password: 'edtpass1',  role: 'editor',    division: null, name: 'District Editor' },
    // ── Adults (username login; console pwd == login pwd) ──
    // District Administrator - full console access.
    { username: 'DISTRICTADMIN', email: null, password: 'Caring-Compass-6274',
      role: 'district-admin', division: null, name: 'Cheryl Anderson' },
    // Adult Treasurer - full console access; final approver of reimbursements.
    { username: 'ADULTTREASURER', email: 'james.sturch@southsideschools.org', password: 'Service-Anchor-8351',
      role: 'adult-treasurer', division: null, name: 'James Sturch' },
    // Adult Board Members - board-meetings-only console access, can receive/fill reimbursement forms.
    { username: 'MIRANDAYOUNG', email: null, password: '1485',
      role: 'adult-member', division: null, name: 'Miranda Young' },
    { username: 'CARLAOBRIEN', email: null, password: '8151',
      role: 'adult-member', division: null, name: "Carla O'Brien" },
    { username: 'HOLLYHOFFMAN', email: null, password: '7146',
      role: 'adult-member', division: null, name: 'Holly Hoffman' },
    // Same console access as Carla (board meetings + forms).
    // Login by USERNAME (case-insensitive); email is her contact address.
    { username: 'STEPHCARTER', email: 'carter-stephanie@trojans.k12.mo.us', password: '1741',
      role: 'adult-member', division: null, name: 'Stephanie Carter' },
  ];

  // Roles whose CONSOLE password is the SAME as their portal login password
  // (the adults + the board treasurer). Everyone else in CONSOLE_PASSWORDS
  // below uses a separate console password.
  const CONSOLE_SAME_AS_LOGIN = ['adult-treasurer', 'district-admin', 'treasurer', 'adult-member'];

  // ── SESSION ──────────────────────────────────────────────────────────
  const SESSION_KEY = 'moark_portal_user';

  // Find a user by email OR username, case-insensitively, with a password check.
  function findUser(identifier, password) {
    const id = (identifier || '').trim();
    const idLower = id.toLowerCase();
    return USERS.find(u => {
      const emailMatch = u.email && u.email.toLowerCase() === idLower;
      const userMatch  = u.username && u.username.toLowerCase() === idLower;
      return (emailMatch || userMatch) && u.password === password;
    }) || null;
  }

  // The stable identity key for a session (roster + audit log key).
  // Email accounts use the email; username-only accounts use the username.
  function keyFor(u) { return (u.email || u.username || '').toLowerCase(); }

  function login(identifier, password) {
    const user = findUser(identifier, password);
    if (!user) return null;
    const email = keyFor(user);           // roster/audit key
    // Prefer the real display name / division from the roster (portal.js OFFICERS).
    let name = user.name, division = user.division;
    if (typeof OFFICERS !== 'undefined') {
      const rec = OFFICERS.get(email);
      if (rec) {
        if (rec.name) name = rec.name;
        if (rec.division !== undefined && rec.division !== null) division = rec.division;
      }
    }
    const session = { email, username: user.username || null, role: user.role, division, name };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function getUser() {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  async function logout() {
    // Fire log before clearing session so actor is still known
    try {
      const u = getUser();
      if (u) {
        await fetch('https://moark-portal-api.moarkkeyclubwebmaster.workers.dev/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actor:     u.email,
            actorName: u.name,
            actorRole: u.role,
            actorDiv:  u.division || null,
            action:    'LOGOUT',
            detail:    'Signed out of portal',
          }),
        });
      }
    } catch(e) { /* silent */ }
    sessionStorage.removeItem(SESSION_KEY);
    window.location.href = 'index.html';
  }

  // Role checks
  function isLTG()            { const u = getUser(); return u && u.role === 'ltg'; }
  function isEditor()         { const u = getUser(); return u && u.role === 'editor'; }
  function isGovernor()       { const u = getUser(); return u && u.role === 'governor'; }
  function isWebmaster()      { const u = getUser(); return u && u.role === 'webmaster'; }
  function isTreasurer()      { const u = getUser(); return u && u.role === 'treasurer'; }
  function isSecretary()      { const u = getUser(); return u && u.role === 'secretary'; }
  function isAdultTreasurer() { const u = getUser(); return u && u.role === 'adult-treasurer'; }
  function isDistrictAdmin()  { const u = getUser(); return u && u.role === 'district-admin'; }

  // Can review/approve newsletters (editor, webmaster)
  function canReview() {
    const u = getUser();
    return u && ['editor', 'webmaster'].includes(u.role);
  }

  // Can see all submissions (everyone except LTG sees all; LTG sees own)
  function canSeeAll() {
    const u = getUser();
    return u && ['editor', 'webmaster', 'governor', 'treasurer', 'secretary', 'adult-treasurer', 'district-admin'].includes(u.role);
  }

  // Require login - call at top of every protected page
  function requireAuth() {
    if (!getUser()) window.location.href = 'index.html';
    return getUser();
  }

  // ── CONSOLE ACCESS ───────────────────────────────────────────────────
  // Roles that can open the console at all.
  const CONSOLE_ROLES = ['webmaster', 'editor', 'governor', 'adult-treasurer', 'district-admin', 'treasurer', 'adult-member'];

  // Which panels each role sees inside the console.
  //   compliance  - newsletter/MRF/DCM compliance tables
  //   log         - live activity/audit log
  //   boardmeetings - board meetings + reimbursement management
  const CONSOLE_SECTIONS = {
    webmaster:         ['compliance', 'log', 'boardmeetings'],
    governor:          ['compliance', 'log', 'boardmeetings'],
    editor:            ['compliance'],
    'adult-treasurer': ['compliance', 'log', 'boardmeetings'],
    'district-admin':  ['compliance', 'log', 'boardmeetings'],
    treasurer:         ['boardmeetings'],   // board treasurer: reimbursements only
    'adult-member':    ['boardmeetings'],   // adult board members: board meetings only
  };

  // Separate console passwords for the roles that need one different from login.
  const CONSOLE_PASSWORDS = {
    webmaster: 'keyclub4life',
    editor:    'serviceispower',
    governor:  'moarkdistrict',
  };

  function canAccessConsole() {
    const u = getUser();
    return u && CONSOLE_ROLES.includes(u.role);
  }

  // Panels the current user may see (array). Empty if no console access.
  function consoleSections() {
    const u = getUser();
    if (!u) return [];
    return CONSOLE_SECTIONS[u.role] || [];
  }
  function canSeeConsoleSection(section) {
    return consoleSections().includes(section);
  }

  function verifyConsolePassword(password) {
    const u = getUser();
    if (!u) return false;
    // Adults + board treasurer: console password is the same as the login password.
    if (CONSOLE_SAME_AS_LOGIN.includes(u.role)) {
      const rec = USERS.find(x => AUTH_keyFor(x) === (u.email || '').toLowerCase());
      return !!rec && password === rec.password;
    }
    // Everyone else: dedicated console password.
    if (!CONSOLE_PASSWORDS[u.role]) return false;
    return password === CONSOLE_PASSWORDS[u.role];
  }
  // keyFor is private above; expose an internal alias for verify lookup.
  function AUTH_keyFor(u) { return (u.email || u.username || '').toLowerCase(); }

  return {
    login, getUser, logout,
    isLTG, isEditor, isGovernor, isWebmaster, isTreasurer, isSecretary, isAdultTreasurer, isDistrictAdmin,
    canReview, canSeeAll, requireAuth,
    canAccessConsole, consoleSections, canSeeConsoleSection, verifyConsolePassword,
  };
})();

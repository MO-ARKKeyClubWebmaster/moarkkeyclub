/**
 * MO-ARK District Portal - Auth Module  (server-verified)
 *
 * SECURITY: passwords no longer live in this file. This file is served to
 * every browser, so keeping credentials here meant anyone could open
 * inspect-element / view-source and read them. Login is now verified by the
 * portal Worker: AUTH.login() POSTs the identifier + password to /auth/login,
 * and the Worker (which holds the credentials on the PRIVATE data branch, and
 * whose source is never served to the web) returns the session plus a signed
 * token. The token is required by the Vault's /vault/* endpoints.
 *
 * To change a password now: edit it in the Vault app (Account Vault →
 * DCC Password → Save) or, before the Vault is first saved, in DEFAULT_ACCOUNTS
 * inside dcc/worker.js. Never put a password back into this file.
 *
 * ── LOGIN IDENTIFIERS ─────────────────────────────────────────────────
 * Most officers sign in with their district email. The adult accounts sign in
 * with a USERNAME (DISTRICTADMIN, ADULTTREASURER, MIRANDAYOUNG, CARLAOBRIEN,
 * HOLLYHOFFMAN, STEPHCARTER). Usernames are case-insensitive; emails are
 * matched lowercased. All of this is enforced server-side.
 */

const AUTH = (() => {

  // Portal Worker base (holds credentials + signs tokens).
  const AUTH_BASE   = 'https://moark-portal-api.moarkkeyclubwebmaster.workers.dev';
  const SESSION_KEY = 'moark_portal_user';
  const TOKEN_KEY   = 'moark_portal_token';

  // ── SESSION ──────────────────────────────────────────────────────────
  function getUser() {
    const raw = sessionStorage.getItem(SESSION_KEY);
    try { return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
  }
  function getToken() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; } }
  // Convenience for authenticated fetches (Vault endpoints).
  function authHeader() { const t = getToken(); return t ? { 'Authorization': 'Bearer ' + t } : {}; }

  // Verify credentials against the Worker. Returns the session object on
  // success, or null on bad credentials / network error.
  async function login(identifier, password) {
    let data = null;
    try {
      const res = await fetch(AUTH_BASE + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: (identifier || '').trim(), password: password || '' }),
      });
      if (!res.ok) return null;
      data = await res.json();
    } catch (_) { return null; }
    if (!data || !data.session || !data.token) return null;

    const session = data.session;
    // Prefer the nicer display name / division from the roster (portal.js
    // OFFICERS) when it's loaded first, exactly as before.
    try {
      if (typeof OFFICERS !== 'undefined') {
        const rec = OFFICERS.get((session.email || '').toLowerCase());
        if (rec) {
          if (rec.name) session.name = rec.name;
          if (rec.division !== undefined && rec.division !== null) session.division = rec.division;
        }
      }
    } catch (_) { /* roster not loaded — server values stand */ }

    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      sessionStorage.setItem(TOKEN_KEY, data.token);
    } catch (_) { /* storage blocked — session still returned for this page */ }
    return session;
  }

  async function logout() {
    // Fire the log before clearing the session so the actor is still known.
    try {
      const u = getUser();
      if (u) {
        await fetch(AUTH_BASE + '/log', {
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
    } catch (e) { /* silent */ }
    try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (_) {}
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

  // ── VAULT ACCESS ───────────────────────────────────────────────────────
  // Only these roles may open the Vault app. (The real enforcement is the
  // signed token on the Worker's /vault/* endpoints; this just hides the UI.)
  const VAULT_ROLES = ['webmaster', 'governor', 'district-admin'];
  function canAccessVault() { const u = getUser(); return !!u && VAULT_ROLES.includes(u.role); }

  // ── CONSOLE ACCESS ───────────────────────────────────────────────────
  // Roles that can open the console at all.
  const CONSOLE_ROLES = ['webmaster', 'editor', 'governor', 'adult-treasurer', 'district-admin', 'treasurer', 'adult-member'];

  // Which panels each role sees inside the console.
  const CONSOLE_SECTIONS = {
    webmaster:         ['compliance', 'log', 'boardmeetings'],
    governor:          ['compliance', 'log', 'boardmeetings'],
    editor:            ['compliance'],
    'adult-treasurer': ['compliance', 'log', 'boardmeetings'],
    'district-admin':  ['compliance', 'log', 'boardmeetings'],
    treasurer:         ['boardmeetings'],   // board treasurer: reimbursements only
    'adult-member':    ['boardmeetings'],   // adult board members: board meetings only
  };

  function canAccessConsole() {
    const u = getUser();
    return u && CONSOLE_ROLES.includes(u.role);
  }
  function consoleSections() {
    const u = getUser();
    if (!u) return [];
    return CONSOLE_SECTIONS[u.role] || [];
  }
  function canSeeConsoleSection(section) {
    return consoleSections().includes(section);
  }
  // The console no longer has a separate password gate (per-tab clearance is
  // by role). Kept for backward compatibility: access == role clearance.
  function verifyConsolePassword() { return canAccessConsole(); }

  return {
    login, getUser, getToken, authHeader, logout,
    isLTG, isEditor, isGovernor, isWebmaster, isTreasurer, isSecretary, isAdultTreasurer, isDistrictAdmin,
    canReview, canSeeAll, requireAuth,
    canAccessVault,
    canAccessConsole, consoleSections, canSeeConsoleSection, verifyConsolePassword,
  };
})();

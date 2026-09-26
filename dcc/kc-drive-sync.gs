/**
 * ════════════════════════════════════════════════════════════════════════
 *  MO-ARK DISTRICT COMMAND CENTER  ·  DKB DRIVE SYNC  (Google Apps Script)
 * ════════════════════════════════════════════════════════════════════════
 *
 *  WHAT THIS DOES
 *  --------------
 *  Runs once a day (11:00 AM Central) inside ONE Key Club account and makes
 *  sure every file that account can share is shared — as VIEWER — with the
 *  District Knowledge Base service account. It never moves, renames, edits,
 *  or deletes anything. It only adds a "viewer" permission, in place.
 *
 *  You install this same script in EACH Key Club Google account (the 10 LTG
 *  accounts + the 5 board accounts). Each account shares its own files; the
 *  central DKB worker then reads them all through the service account.
 *
 *  SAFETY
 *  ------
 *  DRY_RUN starts TRUE. The first time you run it, it changes NOTHING — it
 *  just emails you the counts ("would have shared N files"). Review that,
 *  then set DRY_RUN = false and run again to actually share.
 *
 *  SETUP (per account) — full steps are in DKB_SETUP.md. In short:
 *    1. Paste this file into script.google.com (new project) for that account.
 *    2. Set the project time zone to America/Chicago
 *       (Project Settings ⚙ → Time zone).
 *    3. Fill in SERVICE_ACCOUNT_EMAIL below.
 *    4. Run  runKcDriveSync  once (authorize when prompted) — DRY RUN.
 *    5. Read the email. If the counts look right, set DRY_RUN = false,
 *       run  runKcDriveSync  again for the real first sweep.
 *    6. Run  installDailyTrigger  once to schedule it daily at 11 AM CT.
 * ════════════════════════════════════════════════════════════════════════
 */

// ══════════════ EDIT THESE ══════════════════════════════════════════════
// The service account's email address (from the Google Cloud console — it
// looks like  dkb-reader@your-project.iam.gserviceaccount.com ).
var SERVICE_ACCOUNT_EMAIL = 'dkb-reader-686@moark-dkb.iam.gserviceaccount.com';

// Webmaster address that also receives every account's run summary.
var RAHUL_EMAIL = 'moarkkeyclubwebmaster@gmail.com';

// SAFETY SWITCH — leave TRUE for the first run, then set to false.
var DRY_RUN = false;
// ═════════════════════════════════════════════════════════════════════════


// ── Internal tunables (usually leave alone) ──────────────────────────────
var MAX_RUNTIME_MS = 5 * 60 * 1000;   // stop before Apps Script's 6-minute cap
var PROP = PropertiesService.getUserProperties();


/**
 * MAIN — this is what the daily trigger calls. You can also run it by hand.
 * Picks the cheapest safe mode automatically:
 *   • first ever run  → full sweep of the whole Drive
 *   • a full sweep that timed out → resumes exactly where it left off
 *   • otherwise → only files modified since the last run (fast)
 */
function runKcDriveSync() {
  var start = Date.now();
  var me = safeEmail();
  var sweepToken = PROP.getProperty('SWEEP_TOKEN');
  var lastRun    = PROP.getProperty('LAST_RUN');

  var files, mode;
  if (sweepToken) {
    files = DriveApp.continueFileIterator(sweepToken);
    mode  = 'full-resume';
  } else if (lastRun) {
    files = DriveApp.searchFiles('modifiedDate > "' + lastRun + '"');
    mode  = 'incremental';
  } else {
    files = DriveApp.getFiles();
    mode  = 'full-first';
  }

  var scanned = 0, shared = 0, already = 0, skipped = 0, timedOut = false;

  while (files.hasNext()) {
    if (Date.now() - start > MAX_RUNTIME_MS) { timedOut = true; break; }
    var f;
    try { f = files.next(); } catch (e) { break; }
    scanned++;
    try {
      if (hasAccess(f, SERVICE_ACCOUNT_EMAIL)) { already++; continue; }
      if (DRY_RUN) { shared++; continue; }        // would-share (no change)
      f.addViewer(SERVICE_ACCOUNT_EMAIL);         // the ONLY write this script does
      shared++;
    } catch (e) {
      // Not the owner / can't re-share this file. The account that OWNS it
      // will share it during its own run, so skipping here is correct.
      skipped++;
    }
  }

  // Persist progress so we never redo work and never lose our place.
  var isFull = (mode === 'full-first' || mode === 'full-resume');
  if (isFull && timedOut) {
    try { PROP.setProperty('SWEEP_TOKEN', files.getContinuationToken()); } catch (e) {}
  } else {
    PROP.deleteProperty('SWEEP_TOKEN');
    PROP.setProperty('LAST_RUN', isoNow());
  }

  sendSummary(me, mode, scanned, shared, already, skipped, timedOut);
}


/** Install the daily 11 AM (Central, if the project TZ is America/Chicago) trigger. Run once. */
function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runKcDriveSync') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runKcDriveSync').timeBased().atHour(11).everyDays(1).create();
}


/** Force the NEXT run to re-scan the entire Drive from scratch. */
function resetFullSweep() {
  PROP.deleteProperty('LAST_RUN');
  PROP.deleteProperty('SWEEP_TOKEN');
}


/**
 * CATCH-UP MODE — for a big first sweep, run this ONCE instead of clicking
 * "Run" over and over. It fires every 10 minutes, burns through the whole
 * backlog hands-free, and AUTOMATICALLY switches itself to the normal daily
 * 11 AM schedule the moment the full sweep finishes. (First tick is within
 * ~10 minutes; you can walk away.)
 */
function installCatchupTrigger() {
  removeTriggers('catchUpRun');
  ScriptApp.newTrigger('catchUpRun').timeBased().everyMinutes(10).create();
}

function catchUpRun() {
  runKcDriveSync();
  if (!PROP.getProperty('SWEEP_TOKEN')) {   // full sweep is complete
    removeTriggers('catchUpRun');           // stop the frequent catch-up
    installDailyTrigger();                   // switch to normal daily 11 AM CT
  }
}

function removeTriggers(fn) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === fn) ScriptApp.deleteTrigger(t);
  });
}


// ── Helpers ──────────────────────────────────────────────────────────────

/** True if the service account can already see this file (explicit or inherited). */
function hasAccess(f, email) {
  var lower = String(email).toLowerCase();
  try {
    var acc = f.getAccess(email);
    if (acc && acc !== DriveApp.Permission.NONE) return true;
  } catch (e) {}
  try {
    var users = f.getViewers().concat(f.getEditors());
    for (var i = 0; i < users.length; i++) {
      if (String(users[i].getEmail() || '').toLowerCase() === lower) return true;
    }
  } catch (e) {}
  return false;
}

function isoNow() {
  return Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss");
}

function safeEmail() {
  try { return Session.getActiveUser().getEmail() || '(this account)'; }
  catch (e) { return '(this account)'; }
}

function sendSummary(me, mode, scanned, shared, already, skipped, timedOut) {
  var dry = DRY_RUN ? ' [DRY RUN — nothing was changed]' : '';
  var verb = DRY_RUN ? 'would be newly shared' : 'newly shared';
  var subject = 'MO-ARK DKB sync — ' + me + dry;

  var lines = [
    'District Knowledge Base — daily Drive sync',
    '',
    'Account : ' + me,
    'Mode    : ' + mode + (timedOut ? ' (hit the time limit — the rest finishes on the next run)' : ''),
    '',
    'Files scanned this run : ' + scanned,
    'Files ' + verb + '   : ' + shared,
    'Already shared         : ' + already,
    'Skipped (not owner)    : ' + skipped,
    '',
    (DRY_RUN
      ? 'This was a DRY RUN. No sharing happened. If these numbers look right, '
        + 'set DRY_RUN = false in the script and run runKcDriveSync again.'
      : 'These files are now readable by the District Knowledge Base. '
        + 'You do not need to do anything.'),
    '',
    '— DCC automated message'
  ];
  var body = lines.join('\n');

  try { MailApp.sendEmail(me, subject, body); } catch (e) {}
  try {
    if (RAHUL_EMAIL && String(RAHUL_EMAIL).toLowerCase() !== String(me).toLowerCase()) {
      MailApp.sendEmail(RAHUL_EMAIL, subject, body);
    }
  } catch (e) {}
}

/**
 * ════════════════════════════════════════════════════════════════════════
 *  MO-ARK DISTRICT COMMAND CENTER · DKB AGENT  (Google Apps Script)
 *  ONE script per Key Club account. It does everything:
 *    • shares every file this account owns with the DKB service account
 *      (as Viewer, in place — never moves/edits/deletes),
 *    • OCRs every PDF this account owns into a Google Doc so its text is
 *      searchable (Docs go in a shared "DKB OCR (auto)" folder),
 *    • then runs both, automatically, every day at 11 AM Central.
 *  This REPLACES the older kc-drive-sync.gs and kc-pdf-ocr.gs (ignore those).
 *
 *  SETUP (per account, once):
 *    1. script.google.com → New project (or reuse the old one) → paste THIS file.
 *    2. Project Settings (gear) → Time zone → Central Time – Chicago.
 *    3. Services (+) → add "Drive API" (needed for OCR).
 *    4. Run  startDkb  once → approve the prompt. Done — close the tab.
 *       It works every 10 min until the backlog is clear, then switches to
 *       a daily 11 AM run on its own. Progress from the old share script is
 *       reused, so accounts already shared won't re-sweep.
 * ════════════════════════════════════════════════════════════════════════
 */

// ── EDIT IF NEEDED ────────────────────────────────────────────────────────
var SERVICE_ACCOUNT_EMAIL = 'dkb-reader-686@moark-dkb.iam.gserviceaccount.com';
var RAHUL_EMAIL   = 'moarkkeyclubwebmaster@gmail.com';
var OCR_FOLDER_NAME = 'DKB OCR (auto)';
var DRY_RUN = false;                 // true = no sharing/OCR, just report counts
// ──────────────────────────────────────────────────────────────────────────

var PROP = PropertiesService.getUserProperties();

/** THE button — run this once per account. */
function startDkb() {
  removeTriggers_(['runKcDriveSync', 'catchUpRun', 'runPdfOcr', 'ocrCatchUp', 'dkbCatchUp', 'dkbDaily']);
  ScriptApp.newTrigger('dkbCatchUp').timeBased().everyMinutes(10).create();
}

/** Backlog worker (every 10 min) — shares + OCRs, then flips to daily when clear. */
function dkbCatchUp() {
  var start = Date.now();
  var s = shareSweep_(start + 2.5 * 60 * 1000);   // ~2.5 min for sharing
  var o = ocrSweep_(start + 5.0 * 60 * 1000);      // rest of the ~5 min for OCR
  summarize_('catch-up', s, o);
  if (!s.more && !o.more) { removeTriggers_(['dkbCatchUp']); ensureDaily_(); }
}

/** Daily 11 AM — shares new files + OCRs new PDFs. */
function dkbDaily() {
  var start = Date.now();
  var s = shareSweep_(start + 2.5 * 60 * 1000);
  var o = ocrSweep_(start + 5.0 * 60 * 1000);
  summarize_('daily', s, o);
}

/** Force a full re-share + re-OCR on the next run. */
function resetDkb() {
  PROP.deleteProperty('LAST_RUN');
  PROP.deleteProperty('SWEEP_TOKEN');
  PROP.deleteProperty('OCR_DONE');
}

// ── SHARE SWEEP (same property keys as the old script, so progress carries) ──
function shareSweep_(deadline) {
  var token = PROP.getProperty('SWEEP_TOKEN');
  var lastRun = PROP.getProperty('LAST_RUN');
  var files, full;
  if (token) { files = DriveApp.continueFileIterator(token); full = true; }
  else if (lastRun) { files = DriveApp.searchFiles('modifiedDate > "' + lastRun + '"'); full = false; }
  else { files = DriveApp.getFiles(); full = true; }

  var scanned = 0, shared = 0, already = 0, skipped = 0, timedOut = false;
  while (files.hasNext()) {
    if (Date.now() > deadline) { timedOut = true; break; }
    var f; try { f = files.next(); } catch (e) { break; }
    scanned++;
    try {
      if (hasAccess_(f, SERVICE_ACCOUNT_EMAIL)) { already++; continue; }
      if (DRY_RUN) { shared++; continue; }
      f.addViewer(SERVICE_ACCOUNT_EMAIL); shared++;
    } catch (e) { skipped++; }
  }

  var more = false;
  if (full && timedOut) { try { PROP.setProperty('SWEEP_TOKEN', files.getContinuationToken()); } catch (e) {} more = true; }
  else { PROP.deleteProperty('SWEEP_TOKEN'); PROP.setProperty('LAST_RUN', isoNow_()); }
  return { scanned: scanned, shared: shared, already: already, skipped: skipped, more: more };
}

// ── OCR SWEEP ───────────────────────────────────────────────────────────────
function ocrSweep_(deadline) {
  var me = email_();
  var folder = ensureOcrFolder_();
  var done = JSON.parse(PROP.getProperty('OCR_DONE') || '{}');
  var it = DriveApp.searchFiles('mimeType = "application/pdf" and trashed = false');
  var converted = 0, skipped = 0, failed = 0, more = false;

  while (it.hasNext()) {
    if (Date.now() > deadline) { more = true; break; }
    var pdf = it.next();
    var id = pdf.getId();
    if (done[id]) { skipped++; continue; }
    try {
      var o = pdf.getOwner();
      if (o && o.getEmail() && me !== '(this account)' && o.getEmail().toLowerCase() !== me.toLowerCase()) {
        done[id] = 'not-owner'; skipped++; continue;
      }
    } catch (e) {}
    if (DRY_RUN) { converted++; continue; }
    try {
      var title = pdf.getName().replace(/\.pdf$/i, '') + ' [OCR]';
      ocrConvert_(pdf.getBlob(), title, folder.getId());
      done[id] = 'ok'; converted++;
    } catch (e) { done[id] = 'error'; failed++; }
  }
  if (!DRY_RUN) PROP.setProperty('OCR_DONE', JSON.stringify(done));
  return { converted: converted, skipped: skipped, failed: failed, more: more };
}

// ── HELPERS ─────────────────────────────────────────────────────────────────
function hasAccess_(f, email) {
  var lower = String(email).toLowerCase();
  try { var acc = f.getAccess(email); if (acc && acc !== DriveApp.Permission.NONE) return true; } catch (e) {}
  try {
    var users = f.getViewers().concat(f.getEditors());
    for (var i = 0; i < users.length; i++) if (String(users[i].getEmail() || '').toLowerCase() === lower) return true;
  } catch (e) {}
  return false;
}

function ensureOcrFolder_() {
  var it = DriveApp.getFoldersByName(OCR_FOLDER_NAME);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(OCR_FOLDER_NAME);
  try { folder.addViewer(SERVICE_ACCOUNT_EMAIL); } catch (e) {}
  return folder;
}

// Works with Advanced Drive Service v2 (insert) or v3 (create).
function ocrConvert_(blob, title, folderId) {
  if (Drive.Files && typeof Drive.Files.insert === 'function') {
    var res2 = { title: title, mimeType: 'application/vnd.google-apps.document', parents: [{ id: folderId }] };
    return Drive.Files.insert(res2, blob, { ocr: true, ocrLanguage: 'en' });
  }
  var res3 = { name: title, mimeType: 'application/vnd.google-apps.document', parents: [folderId] };
  return Drive.Files.create(res3, blob, { ocrLanguage: 'en' });
}

function ensureDaily_() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'dkbDaily'; });
  if (!has) ScriptApp.newTrigger('dkbDaily').timeBased().atHour(11).everyDays(1).create();
}
function removeTriggers_(names) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (names.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
}
function isoNow_() { return Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss"); }
function email_() { try { return Session.getActiveUser().getEmail() || '(this account)'; } catch (e) { return '(this account)'; } }

function summarize_(mode, s, o) {
  var me = email_();
  var dry = DRY_RUN ? ' [DRY RUN]' : '';
  var subject = 'MO-ARK DKB agent - ' + me + dry;
  var body = [
    'District Knowledge Base - ' + mode + ' run' + dry,
    '',
    'Account : ' + me,
    '',
    'SHARING',
    '  scanned this run : ' + s.scanned,
    '  newly shared     : ' + s.shared,
    '  already shared   : ' + s.already,
    '  skipped(not owner): ' + s.skipped,
    '  more to do       : ' + (s.more ? 'yes (continues next run)' : 'no'),
    '',
    'OCR (PDF -> Doc)',
    '  converted this run: ' + o.converted,
    '  skipped(done/other): ' + o.skipped,
    '  failed            : ' + o.failed,
    '  more to do        : ' + (o.more ? 'yes (continues next run)' : 'no'),
    '',
    ((!s.more && !o.more) ? 'Backlog clear - now on the daily 11 AM schedule.'
                          : 'Still working through the backlog automatically.'),
    '',
    '- DCC automated message'
  ].join('\n');
  try { MailApp.sendEmail(me, subject, body); } catch (e) {}
  try { if (RAHUL_EMAIL && RAHUL_EMAIL.toLowerCase() !== String(me).toLowerCase()) MailApp.sendEmail(RAHUL_EMAIL, subject, body); } catch (e) {}
}

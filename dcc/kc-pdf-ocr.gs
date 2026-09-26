/**
 * ════════════════════════════════════════════════════════════════════════
 *  MO-ARK DISTRICT COMMAND CENTER · DKB PDF-OCR  (Google Apps Script)
 * ════════════════════════════════════════════════════════════════════════
 *  Turns the PDFs this account OWNS into OCR-ed Google Docs so their TEXT
 *  becomes answerable in "Ask MO-ARK". Runs daily, skips PDFs it already did,
 *  and never touches the original PDF. The OCR Docs land in a folder called
 *  "DKB OCR (auto)" that is shared with the knowledge-base service account, so
 *  the worker indexes them automatically on its next sync.
 *
 *  SETUP (per account, ~2 min):
 *    1. script.google.com → New project → paste this whole file.
 *    2. Project Settings (gear) → Time zone → Central Time – Chicago.
 *    3. Left sidebar → Services (+) → add "Drive API" (Advanced Drive Service).
 *    4. Run  runPdfOcr  once and approve the prompt. Check the new
 *       "DKB OCR (auto)" folder got a Doc (confirms OCR works for this account).
 *    5. Run  installOcrCatchup  once — it grinds the backlog every 10 min,
 *       hands-free, and switches itself to a daily 11 AM run when finished.
 *  You can close the tab after step 5; triggers run on Google's servers.
 * ════════════════════════════════════════════════════════════════════════
 */

var SERVICE_ACCOUNT_EMAIL = 'dkb-reader-686@moark-dkb.iam.gserviceaccount.com';
var RAHUL_EMAIL   = 'moarkkeyclubwebmaster@gmail.com';
var OCR_FOLDER_NAME = 'DKB OCR (auto)';
var MAX_PDFS_PER_RUN = 20;              // safety cap alongside the time guard
var OCR_MAX_MS = 5 * 60 * 1000;         // stop before the 6-minute limit
var OCR_PROP = PropertiesService.getUserProperties();

function runPdfOcr() {
  var start = Date.now();
  var me = ocrEmail_();
  var folder = ensureOcrFolder_();
  var done = JSON.parse(OCR_PROP.getProperty('OCR_DONE') || '{}');

  var it = DriveApp.searchFiles('mimeType = "application/pdf" and trashed = false');
  var converted = 0, skipped = 0, failed = 0, more = false;

  while (it.hasNext()) {
    if (Date.now() - start > OCR_MAX_MS || converted >= MAX_PDFS_PER_RUN) { more = it.hasNext(); break; }
    var pdf = it.next();
    var id = pdf.getId();
    if (done[id]) { skipped++; continue; }
    // Only convert PDFs this account owns (can't reliably convert shared-in ones;
    // the owning account handles those on its own run).
    try {
      var owner = pdf.getOwner();
      if (owner && owner.getEmail() && me !== '(this account)' &&
          owner.getEmail().toLowerCase() !== me.toLowerCase()) { done[id] = 'not-owner'; skipped++; continue; }
    } catch (e) {}
    try {
      var title = pdf.getName().replace(/\.pdf$/i, '') + ' [OCR]';
      ocrConvert_(pdf.getBlob(), title, folder.getId());
      done[id] = 'ok';
      converted++;
    } catch (e) {
      done[id] = 'error';   // mark so we don't retry a broken file every run
      failed++;
    }
  }

  OCR_PROP.setProperty('OCR_DONE', JSON.stringify(done));
  ocrSummary_(me, converted, skipped, failed, more);

  if (!more) { removeOcrTriggers_('ocrCatchUp'); ensureDailyOcr_(); }
}

function ocrCatchUp() { runPdfOcr(); }

function installOcrCatchup() {
  removeOcrTriggers_('ocrCatchUp');
  ScriptApp.newTrigger('ocrCatchUp').timeBased().everyMinutes(10).create();
}

function resetOcr() { OCR_PROP.deleteProperty('OCR_DONE'); }

function ensureDailyOcr_() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'runPdfOcr'; });
  if (!has) ScriptApp.newTrigger('runPdfOcr').timeBased().atHour(11).everyDays(1).create();
}
function removeOcrTriggers_(fn) {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === fn) ScriptApp.deleteTrigger(t); });
}

function ensureOcrFolder_() {
  var it = DriveApp.getFoldersByName(OCR_FOLDER_NAME);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(OCR_FOLDER_NAME);
  try { folder.addViewer(SERVICE_ACCOUNT_EMAIL); } catch (e) {}
  return folder;
}

// Works with either version of the Advanced Drive Service (v2 insert / v3 create).
function ocrConvert_(blob, title, folderId) {
  if (Drive.Files && typeof Drive.Files.insert === 'function') {           // Drive API v2
    var res2 = { title: title, mimeType: 'application/vnd.google-apps.document', parents: [{ id: folderId }] };
    return Drive.Files.insert(res2, blob, { ocr: true, ocrLanguage: 'en' });
  }
  var res3 = { name: title, mimeType: 'application/vnd.google-apps.document', parents: [folderId] };  // Drive API v3
  return Drive.Files.create(res3, blob, { ocrLanguage: 'en' });
}

function ocrEmail_() { try { return Session.getActiveUser().getEmail() || '(this account)'; } catch (e) { return '(this account)'; } }

function ocrSummary_(me, converted, skipped, failed, more) {
  var subject = 'MO-ARK DKB OCR - ' + me + (converted ? (' (+' + converted + ' docs)') : '');
  var body = [
    'District Knowledge Base - PDF OCR run',
    '',
    'Account : ' + me,
    'Converted this run : ' + converted,
    'Skipped (already done / not owner) : ' + skipped,
    'Failed : ' + failed,
    '',
    (more ? 'More PDFs remain - the next run continues automatically.'
          : 'All PDFs this account owns are OCR-converted.'),
    '',
    'OCR text lives in the "' + OCR_FOLDER_NAME + '" folder and is indexed by the knowledge base automatically.',
    '',
    '- DCC automated message'
  ].join('\n');
  try { MailApp.sendEmail(me, subject, body); } catch (e) {}
  try { if (RAHUL_EMAIL && RAHUL_EMAIL.toLowerCase() !== String(me).toLowerCase()) MailApp.sendEmail(RAHUL_EMAIL, subject, body); } catch (e) {}
}

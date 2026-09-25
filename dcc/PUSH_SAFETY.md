# Push safety — read before uploading the site to GitHub

## Why we lost the reimbursement data before

Every reimbursement used to live inside a single file — `dcc/data/reimbursements.json` —
holding the whole array. Board meetings did the same. When you uploaded the
zip through the GitHub web UI, GitHub replaced that one file with the stale
copy from your local zip, wiping every record the Worker had written to it
since your last download.

The newsletter submissions folder never had this problem because each
submission is its OWN file inside `submissions/`. A GitHub folder upload
adds/replaces the files you upload but leaves everything else alone, so
records the Worker wrote after your download stayed put.

## The fix (in this rebuild)

Reimbursements and board meetings now use the SAME per-file pattern as
newsletters:

    dcc/data/board-meetings/<id>.json      ← one meeting per file
    dcc/data/reimbursements/<id>.json      ← one reimbursement per file
    dcc/reimbursement-pdfs/<id>.pdf        ← the filled PDF, its own file too

The Worker also still READS from the old `dcc/data/reimbursements.json` and
`dcc/data/board-meetings.json` as a fallback so nothing already stored is lost
while the transition finishes — but it never writes to them again, so a
stale copy of those old files in a future push cannot cause damage.

## Rules for every future manual upload

**Before you drag a zip into GitHub, DELETE the following folders/files
from your local copy so the upload can't touch them:**

    dcc/submissions/           (newsletter PDFs + JSON — the Worker owns this)
    dcc/data/                  (all runtime records — the Worker owns this)
    dcc/reimbursement-pdfs/    (per-record filled PDFs — the Worker owns this)
    dcc/dcm-reports/           (DCM report PDFs — the Worker owns this)
    dcc/committee-pdfs/        (committee PDFs — the Worker owns this)
    dcc/logs/                  (audit log — the Worker owns this)

The Worker recreates every one of those on demand. Anything under those
paths that is in your local copy is stale by definition.

If GitHub's "upload files" flow *does* include one of the paths above,
click the little X next to it in the upload preview before hitting commit.

## After deploying this worker.js

1. Deploy `worker.js` (wrangler deploy, or paste it into the Cloudflare
   dashboard). No new secrets are required.
2. The very first time you create a new reimbursement or board meeting,
   its record lands in the per-file folder above.
3. Older records keep working through the legacy-file fallback until you
   choose to migrate them (nothing to do — they read the same way from
   the console).

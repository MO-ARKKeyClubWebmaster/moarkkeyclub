# District Knowledge Base (DKB) — Setup & Operations

The DKB is the "Ask MO-ARK" app inside the DCC. Officers ask questions in plain
English; it answers **only from district documents that their role is allowed to
see**, and links the sources. It also has a **Browse** view that groups every
file you can access by type (Finance, Governance, Events, etc.) and links each
one back to Google Drive.

**How it fits together (three layers):**

1. **Access layer — Apps Script (`kc-drive-sync.gs`)** runs daily at 11 AM CT in
   each Key Club Google account and shares that account's files, as *viewer*,
   with one service account. It never moves, edits, or deletes anything.
2. **Engine — Cloudflare Worker (`dkb-worker.js`, deployed as `moark-dkb-api`)**
   reads everything the service account can see, indexes it, tags each file with
   an access class, and answers questions filtered to the asker's role.
3. **Front end — `dkb.html`** is the app card on the DCC desktop.

Do the parts in this order: **A → B → C → D**. Budget ~45 min for A+C once, then
~3 min per account for B.

---

## PART A — Service account + Drive API (one time, ~15 min)

1. Go to <https://console.cloud.google.com> signed in as the webmaster account.
2. Top bar → project dropdown → **New Project**. Name it `moark-dkb`. Create,
   then make sure it's the selected project.
3. Left menu → **APIs & Services → Library**. Search **Google Drive API** →
   **Enable**.
4. Left menu → **APIs & Services → Credentials → Create credentials → Service
   account**.
   - Name: `dkb-reader`. Create and continue. Skip the optional role/user steps
     → **Done**.
5. On the Credentials page, click the new service account →
   **Keys** tab → **Add key → Create new key → JSON → Create**. A `.json` file
   downloads. **Keep this file — it's the master key to everything the DKB can
   read. Don't commit it to GitHub, don't email it.**
6. Copy the service account's **email address** (on its Details tab — looks like
   `dkb-reader@moark-dkb.iam.gserviceaccount.com`). You need it in Part B.

> No "domain-wide delegation" is needed — the Apps Scripts share files *to* this
> email, and it reads what's shared. That's why personal-Gmail accounts work.

---

## PART B — Apps Script in each account (per account, ~3 min)

Do the **webmaster account first** as your test. Then repeat for the other 14
(the 5 board + 10 LTG accounts). It's the same script every time.

1. Signed in as that account, go to <https://script.google.com> → **New project**.
2. Delete the sample code. Paste the entire contents of **`dcc/kc-drive-sync.gs`**.
3. Click the ⚙ **Project Settings** → set **Time zone** to
   **(GMT-06:00) Central Time — America/Chicago**.
4. Back in the editor, near the top set:
   `var SERVICE_ACCOUNT_EMAIL = 'dkb-reader@moark-dkb.iam.gserviceaccount.com';`
   (use the email from Part A). Leave `DRY_RUN = true` for now. Save (⌘/Ctrl-S).
5. In the function dropdown pick **`runKcDriveSync`** → **Run**. Approve the
   permission prompt (choose the account, "Advanced → go to project (unsafe)" is
   normal for your own script, allow Drive access).
6. Check that account's inbox (and the webmaster inbox) for the summary email:
   *"would be newly shared: N"*. If N looks sane, set **`DRY_RUN = false`**,
   save, and **Run `runKcDriveSync` again** — this does the real first share.
   (Large drives: it works in ~5-min passes; just run it again until the email
   says `already shared` ≈ everything.)
7. Run the **`installDailyTrigger`** function once to schedule it for 11 AM CT
   daily. Done with that account.

> Utility functions inside the script: `resetFullSweep` forces the next run to
> re-scan the whole drive; `runKcDriveSync` is safe to run by hand anytime.

---

## PART C — Deploy the DKB Worker (one time, ~15 min)

1. Cloudflare dashboard → **Workers & Pages → Create → Create Worker**. Name it
   **`moark-dkb-api`** → Deploy (the placeholder), then **Edit code**.
2. Delete the placeholder, paste all of **`dcc/dkb-worker.js`**, **Deploy**.
3. **Create the KV store:** left nav **Storage & Databases → KV → Create a
   namespace**, name `dkb`. Then Worker → **Settings → Bindings → Add → KV
   namespace**: Variable name **`DKB`**, namespace `dkb`. Save.
4. **Add the AI binding:** Worker → **Settings → Bindings → Add → Workers AI**:
   Variable name **`AI`**. Save.
5. **Add the secrets:** Worker → **Settings → Variables and Secrets → Add**:
   - Type **Secret**, name **`SA_KEY`**, value = paste the *entire contents* of
     the service-account JSON file from Part A (open it in a text editor, copy
     all).
   - Type **Secret**, name **`DKB_ADMIN_SECRET`**, value = any long random
     string you make up (you'll use it to trigger indexing). Save. **Deploy**.
6. **Add the cron:** Worker → **Settings → Triggers → Cron Triggers → Add** →
   `0 18 * * *` (that's ~1 PM CT — safely after the 11 AM shares, year-round).
7. **First index (do this after Part B has shared some files).** From a terminal:
   ```
   curl https://moark-dkb-api.moarkkeyclubwebmaster.workers.dev/health
   curl -X POST "https://moark-dkb-api.moarkkeyclubwebmaster.workers.dev/sync?key=YOUR_DKB_ADMIN_SECRET"
   ```
   The sync response includes `"done": true/false`. If `false`, run the `/sync`
   line again (it processes a safe batch per call on the free plan) until `done`
   is `true`. After that, the daily cron keeps it current on its own.

---

## PART D — Push the site

The DKB app card and `dkb.html` deploy with the DCC site:

```
cd ~/Key_Club/moarkkeyclub-monorepo
git pull --rebase origin main && git push
```

Then open the DCC → **District Knowledge Base** card → ask a question.

---

## What each role can see (the access matrix)

The service account can read everything, but the Worker filters every answer by
the asker's role. Edit the matrix at the top of `dkb-worker.js` if you want to
change this.

| A file is… | LTG (own div) | Other LTGs | Board / adults | Webmaster / Governor / Dist-Admin |
|---|---|---|---|---|
| in a **public / handbook / "district-wide"** folder | ✅ | ✅ | ✅ | ✅ |
| owned by a **division** account | ✅ own only | ❌ | ✅ | ✅ |
| owned by a **board** account | ❌ | ❌ | ✅ | ✅ |
| **confidential / member-PII** (by name/folder) | ❌ | ❌ | ❌ | ✅ |
| owner **can't be identified** | ❌ | ❌ | ❌ | ✅ (fail-closed) |

**How a file gets classified:** by the account that owns it, plus keyword hints
in its folder/file name. Put shared material in a folder named with "Public",
"District-Wide", "Handbook", or "Resources" to make it visible to everyone; name
sensitive material with "Confidential", "Private", or "Member Data" (or put PII
there) to lock it to superusers. Anything unclassifiable defaults to
superusers-only.

---

## Known limits (v1) — deliberate, documented

- **PDFs & images are findable but not deep-searched.** Google Docs, Sheets, and
  Slides are fully read; PDFs/images are indexed by title/folder only (so "where
  is the handbook?" works, but "what does page 4 of the handbook say?" doesn't
  yet). Adding OCR is a later upgrade.
- **The access boundary inherits the portal's client-trust model.** The Worker
  re-derives role from the login email for the 15 known KC accounts (so those
  can't be spoofed), but the honest hardening is signed session tokens — a good
  next step if the boundary ever needs to be airtight.
- **Central index = one high-value store.** You accepted this. Member PII is
  auto-locked to superusers; keep genuinely sensitive files named so they land
  in the `admin` scope, or don't share them to the service account at all.
- **Free-plan batching.** The Worker indexes up to ~18 changed files per run to
  stay within Cloudflare's free subrequest limit. On Workers Paid, raise
  `MAX_CHANGED_PER_RUN`. The daily cron catches up regardless.

## Handy checks
- `GET /health` — last sync time + counts (no key needed).
- `GET /state?key=…` — full state + file count.
- `POST /sync?key=…` — index now; repeat until `"done": true`.

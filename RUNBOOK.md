# MO-ARK Monorepo → Vercel Migration — RUNBOOK

Everything you need to take the two sites live as one repo on Vercel, keep the
Cloudflare Workers, move the portal to **dcc.moarkkeyclub.com**, and redirect the
old **.net**. Work top to bottom. Nothing in Part B–Phase 8 has been done yet —
those are your steps. Part A is what I already changed inside the repo.

- **Repo (you create):** `moarkkeyclub` (private) under the `MO-ARKKeyClubWebmaster` GitHub account
- **Local folder (already assembled):** `~/Key_Club/moarkkeyclub-monorepo`
- **Public site:** `site/` → moarkkeyclub.com (+ www)
- **Portal (District Command Center):** `dcc/` → dcc.moarkkeyclub.com
- **Backends (unchanged):** Cloudflare Workers `moark-portal-api` (portal) and `marty-ai` (public chat)

---

## Part A — Changes already made in the repo

You don't need to redo any of these; they're already in `~/Key_Club/moarkkeyclub-monorepo`.

**Structure**
- Created the monorepo with `site/` (copied from `test-site`, minus `.git`, `CNAME`, `.DS_Store`) and `dcc/` (copied from `moarkkeyclub-net`, minus `CNAME`, `.DS_Store`, the `Claude outputs` scratch folder).
- Dropped both `CNAME` files (Vercel manages domains, not a CNAME file).

**`dcc/worker.js`** (the only code file edited — data store repointed + paths namespaced)
- `GITHUB_REPO`: `moarkkeyclub-net` → `moarkkeyclub`
- All 12 storage paths prefixed with `dcc/`:
  `DATA_PATH`, `AUDIT_LOG_PATH`, `DCM_PATH`, `MRF_PATH`, `COMMITTEE_PATH`, `DCM_PDF_PATH`, `COMMITTEE_PDF_PATH`, `BOARD_MEETINGS_DIR`, `REIMBURSEMENTS_DIR`, `REIMB_PDF_PATH`, `BOARD_MEETINGS_PATH_LEGACY`, `REIMBURSEMENTS_PATH_LEGACY`
- `PORTAL_URL`: `https://moarkkeyclub.net` → `https://dcc.moarkkeyclub.com`
- The one email-body link text `moarkkeyclub.net` → `dcc.moarkkeyclub.com`
- **Not touched:** the `...workers.dev` API URL, CORS (`*`), all recipient emails, Resend/`EMAIL_FROM` (still `@moarkkeyclub.com`), and every secret.

**Config files added**
- `dcc/.vercelignore` — keeps `worker.js`, the `*.md` docs, `dev.command`, and all Worker-owned data folders (`submissions/`, `data/`, `logs/`, `reimbursement-pdfs/`, `dcm-reports/`, `committee-pdfs/`) **out of what Vercel serves publicly**. The data still lives in the repo; only the Worker serves it.
- `site/.vercelignore` — excludes `README.md`, `*.bak`, `.DS_Store`.
- root `README.md` and `.gitignore`.
- Empty `.gitkeep` placeholders in `dcc/reimbursement-pdfs/`, `dcc/dcm-reports/`, `dcc/committee-pdfs/`.

**Docs updated** (`dcc/`)
- `README_NEXT_YEAR.md` — added a migration banner; `.net`→`dcc.moarkkeyclub.com`, GitHub Pages→Vercel, repo/host references.
- `README_REBUILD.md` — host reference.
- `PUSH_SAFETY.md` — the Worker-owned paths now show the `dcc/` prefix.

**The portal front-end (dashboard, newsletter, console, etc.) needed no edits** — it links relatively and calls the Worker by its `workers.dev` URL.

---

## Part B — One thing to lock in first: the repo name

The Worker's `dcc/worker.js` now says `GITHUB_REPO = 'moarkkeyclub'`. **Name your new
GitHub repo exactly `moarkkeyclub`.** If you want a different name, that's fine —
just change that one line in `dcc/worker.js` to match before Phase 4.

---

## Phase 1 — Create the GitHub repo and push

1. On GitHub (as `MO-ARKKeyClubWebmaster`): **New repository** → name `moarkkeyclub` → **Private** → do **not** add a README/.gitignore/license (we already have them) → Create.
   - Keep it **private**: the portal ships plaintext logins in `dcc/auth.js` (see the Security note at the end).
2. In Terminal:

   ```bash
   cd ~/Key_Club/moarkkeyclub-monorepo
   git init
   git branch -M main
   git add .
   git commit -m "Initial monorepo: site/ + dcc/ portal, Vercel config"
   git remote add origin https://github.com/MO-ARKKeyClubWebmaster/moarkkeyclub.git
   git push -u origin main
   ```

The `dcc/` data folders currently hold a **Sept-19 snapshot** of the portal data.
That's fine for setup and testing; you'll refresh it from live in Phase 4 so
nothing is lost.

---

## Phase 2 — Two Vercel projects from the one repo

Do this before any DNS change and before repointing the Worker. Test on the free
`*.vercel.app` URLs first.

### 2a. Public site project
1. Vercel → **Add New → Project** → import the `moarkkeyclub` repo.
2. **Root Directory** → Edit → choose `site`.
3. **Framework Preset:** Other. Leave Build/Output empty (it's a static site).
4. **Deploy.** Open the `*.vercel.app` URL and confirm the public site loads (maps, Marty chat, images).
5. Name it `moarkkeyclub-site`. In **Settings → Git → Ignored Build Step**, paste:

   ```bash
   git diff --quiet HEAD^ HEAD -- .
   ```
   (Runs from `site/`, so it builds only when something in `site/` changed.)

### 2b. Portal project
1. **Add New → Project** → import the **same** `moarkkeyclub` repo again.
2. **Root Directory** → `dcc`.
3. **Framework Preset:** Other. No build.
4. **Deploy.** Open its `*.vercel.app` URL and log in — the portal will read live
   data from the Worker (still pointed at the old repo right now), so it should
   look normal. Test a newsletter list + a PDF **View/Download**.
5. Name it `moarkkeyclub-dcc`. In **Settings → Git → Ignored Build Step**, paste:

   ```bash
   git diff --quiet HEAD^ HEAD -- . ':(exclude)data' ':(exclude)submissions' ':(exclude)logs' ':(exclude)reimbursement-pdfs' ':(exclude)dcm-reports' ':(exclude)committee-pdfs' ':(exclude)worker.js' ':(exclude)*.md'
   ```
   **Why:** the Worker saves records by committing to this repo. Exit code `0`
   makes Vercel **skip** the build; `git diff --quiet` returns `0` when the only
   changes are inside the excluded (data) folders — so routine submissions,
   approvals, and log writes won't trigger a redeploy. A real code change in
   `dcc/` returns `1` and builds normally.

> If Vercel's plan warns about the number of projects per repo or asks about
> commercial use (Hobby is non-commercial), you may need a Pro/Nonprofit plan.
> Check this before the DNS cutover.

---

## Phase 3 — DNS (at Wix). Do `dcc` first; it can't hurt the live site.

**In Vercel, add the custom domains first** (each project → Settings → Domains),
then read the **exact** records off each domain card and enter them at Wix.
Vercel now issues *project-specific* values, so use what the card shows — do not
assume `76.76.21.21` or `cname.vercel-dns.com`.

### 3a. Subdomain (safe, additive)
On the **portal** project, add domain `dcc.moarkkeyclub.com`. At Wix → Manage DNS
Records:
- **Add CNAME:** host `dcc` → value = the CNAME target Vercel shows. TTL 1 hr.

Wait for Vercel to show **Valid** + a green certificate, then load
`https://dcc.moarkkeyclub.com` and re-test login/PDFs.

### 3b. Apex + www (the live public site — do when you're ready)
On the **public** project, add `moarkkeyclub.com` and `www.moarkkeyclub.com`. At Wix:
- **Apex A record(s):** remove the four GitHub Pages A records
  (`185.199.108–111.153`) and add the single **Vercel A record** the card shows.
- **www CNAME:** change value from `mo-arkkeyclubwebmaster.github.io` to Vercel's CNAME target.

**Do NOT touch** MX (`mx1/mx2.improvmx.com`), SPF (`v=spf1 …improvmx…`),
`_dmarc`, `resend._domainkey`, or `send/rsend`. Email is unaffected.

Wait for **Valid** + cert, then confirm `https://moarkkeyclub.com` and
`https://www.moarkkeyclub.com` load from Vercel.

---

## Phase 4 — Repoint the Worker to the new repo (the real cutover)

Until this phase, the Worker still reads/writes the **old** `moarkkeyclub-net`
repo. Do this in one short sitting.

1. **Freeze:** tell officers not to submit/approve for ~30 min.
2. **Final data refresh** (catches anything written since the Phase-1 snapshot):

   ```bash
   cd ~/Key_Club
   # clone live portal repo (browser login or a PAT with read on moarkkeyclub-net)
   git clone https://github.com/MO-ARKKeyClubWebmaster/moarkkeyclub-net.git live-net
   cd moarkkeyclub-monorepo
   rsync -a --delete ../live-net/submissions/  dcc/submissions/
   rsync -a --delete ../live-net/data/         dcc/data/
   rsync -a --delete ../live-net/logs/         dcc/logs/
   for d in reimbursement-pdfs dcm-reports committee-pdfs; do
     [ -d ../live-net/$d ] && rsync -a ../live-net/$d/ dcc/$d/
   done
   git add dcc/
   git commit -m "Refresh portal data from live moarkkeyclub-net (cutover)"
   git push
   ```
3. **Token:** the Worker's `GITHUB_TOKEN` is a fine-grained PAT scoped to
   `moarkkeyclub-net`. Easiest path: GitHub → Settings → Developer settings →
   Fine-grained tokens → open that token → **Repository access** → add
   `moarkkeyclub` (keep `moarkkeyclub-net` too, for rollback) → ensure
   **Contents: Read and write** → Save. Because the token *value* doesn't change,
   you don't have to update the Cloudflare secret. (If you'd rather mint a new
   token, update the `GITHUB_TOKEN` secret on the Worker with the new value.)
4. **Deploy the Worker:** Cloudflare → Workers & Pages → `moark-portal-api` →
   **Edit code** → paste the contents of `dcc/worker.js` → **Deploy**.
   (Secrets `RESEND_API_KEY` and `GOOGLE_MAPS_API_KEY` are unchanged.)
5. **Smoke test:** log into `dcc.moarkkeyclub.com`, create a **test** board
   meeting or submit a test newsletter. Confirm (a) it appears in the portal, and
   (b) a new file shows up in the **`moarkkeyclub`** repo under `dcc/data/…` or
   `dcc/submissions/…`, and (c) that commit did **not** trigger a Vercel deploy
   (Ignored Build Step working).
6. **Unfreeze.**

Leave the old `moarkkeyclub-net` repo in place as your rollback/backup — don't delete it.

---

## Phase 5 — Redirect the old `.net`

1. Vercel → **portal** project → Settings → Domains → add `moarkkeyclub.net` and
   `www.moarkkeyclub.net`, and set each to **Redirect** → `https://dcc.moarkkeyclub.com`.
2. Wix (moarkkeyclub.net DNS): change the four apex A records to Vercel's A
   record, and the `www` CNAME to Vercel's CNAME target (values from the domain cards).
3. Verify: visiting `http://moarkkeyclub.net` and `https://www.moarkkeyclub.net`
   lands on `dcc.moarkkeyclub.com`.

---

## Phase 6 — Verification checklist

- [ ] `https://moarkkeyclub.com` and `https://www.moarkkeyclub.com` load (Vercel, valid cert)
- [ ] Public site: maps, board photos, Marty chat all work
- [ ] `https://dcc.moarkkeyclub.com` loads with a valid cert
- [ ] Portal login works (LTG, a board officer, an adult account)
- [ ] Newsletter list loads; PDF **View** and **Download** work (Worker `/pdf`)
- [ ] Reimbursement form loads; distance/mileage field behaves
- [ ] Console loads for webmaster/governor
- [ ] Email test: submit a newsletter → the Editor receives the notification
- [ ] `moarkkeyclub.net` → redirects to `dcc.moarkkeyclub.com`
- [ ] A Worker data write does **not** create a Vercel deployment
- [ ] Old `moarkkeyclub-net` repo still intact (rollback safety net)

---

## Phase 7 — Rollback (if anything goes wrong)

Because `moarkkeyclub-net` is untouched, rollback is clean:
- **DNS:** put the apex A records back to `185.199.108–111.153` and the `www`/`dcc`
  CNAMEs back to `mo-arkkeyclubwebmaster.github.io`. The old GitHub Pages sites resume.
- **Worker:** paste the original `worker.js` (with `GITHUB_REPO = 'moarkkeyclub-net'`
  and the un-prefixed paths) back into the Cloudflare editor → Deploy. Live data is
  still in `moarkkeyclub-net`.

---

## Phase 8 — Optional: "Officer Portal" link on the public site

The public nav is written inline on each page, so this is a small edit repeated
across the public pages. Add this `<li>` inside the `<ul class="nav-links">` on
each of: `index.html`, `about.html`, `our-district.html`, `division.html`,
`dlc.html`, `contact.html`, `resources.html`, `programs-charities.html`,
`newsletters.html`, `exec-profile.html`, `adult-profile.html`,
`past-contest-examples.html`, `extended-calendar.html`, `404.html`:

```html
<li class="nav-item">
  <a href="https://dcc.moarkkeyclub.com" class="nav-link">Officer Portal</a>
</li>
```

Say the word and I'll do all of these consistently in a follow-up.

---

## ⚠️ Security note (important — pre-existing, not caused by this move)

`dcc/auth.js` checks passwords **in the browser** and is loaded by every portal
page, so all portal logins are readable by anyone who opens
`dcc.moarkkeyclub.com/auth.js` and views source. This is exactly how it works on
`moarkkeyclub.net` today — the migration doesn't change it — but it's worth
fixing separately: move credential checking into the `moark-portal-api` Worker
(e.g. Worker KV), and have the browser send the login to the Worker instead of
comparing locally. Keeping the repo **private** protects the source, but not the
served `auth.js`. Happy to plan that as its own task.

---

## Quick reference

| Item | Value |
|---|---|
| New repo | `MO-ARKKeyClubWebmaster/moarkkeyclub` (private) |
| Local folder | `~/Key_Club/moarkkeyclub-monorepo` |
| Vercel project A | root `site/` → moarkkeyclub.com, www |
| Vercel project B | root `dcc/` → dcc.moarkkeyclub.com (+ .net redirect) |
| Portal Worker | `moark-portal-api` — data store = `moarkkeyclub` repo under `dcc/` |
| Public Worker | `marty-ai` — unchanged |
| Untouched DNS | MX (ImprovMX), SPF, DMARC, resend._domainkey, send/rsend |
| Worker secrets | `GITHUB_TOKEN` (add new repo to its scope), `RESEND_API_KEY`, `GOOGLE_MAPS_API_KEY` — unchanged values |

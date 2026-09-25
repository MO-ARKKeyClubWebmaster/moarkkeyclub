> **Migration note (2026):** The portal now lives in the combined `moarkkeyclub` monorepo under `dcc/`, is hosted on **Vercel** (not GitHub Pages), and is served at **dcc.moarkkeyclub.com**. See `RUNBOOK.md` in the repo root for setup/migration steps.

# MO-ARK Officer Portal — Next-Year Update Guide

**Read this first when a new board takes over (or when anything about the district changes).**
This is the single checklist of *everything* that has to be updated each Key Club year so the
portal (dcc.moarkkeyclub.com) keeps working for the new officers. Work top to bottom.

Everything below lives in this repo (`moarkkeyclub`); the portal is under `dcc/`. The site is a static front-end on
Vercel plus a Cloudflare Worker (`moark-portal-api.…workers.dev`) that stores data back
into this same repo. When you change a **front-end file** (`.html`, `.js`, `.css`), just commit
it and Vercel redeploys. When you change **`worker.js`**, you must **redeploy the Worker**
(see §9).

---

## 1. Officer names, photos, titles, divisions  →  `portal.js`

This is the **one place** real names/photos/titles are set. Everything else (greeting, nav,
attendance list, reimbursement forms, submission author names) reads from here.

Open `portal.js` and edit the **`ROSTER`** object near the top:

- **Key** = the officer's login email (lowercase). The two adults are keyed by username instead
  (`districtadmin`, and Sturch by his email).
- `name` — real full name.
- `photo` — path under `assets/` (e.g. `assets/ltg3.jpeg`). Leave `''` for an initials avatar.
- `title` — board titles only (LTGs get their title from their division automatically).
- `division` — LTGs only (1–10).
- `vacant: true` — set on a division with no LTG so it's skipped in lists.

**Photos:** drop the new headshots into the **`assets/`** folder using the same filenames
(`ltg1.jpeg` … `ltg10.jpeg`, `governor.png`, `secretary.png`, `treasurer.png`, `webmaster.png`,
`editor.png`). Reuse the filenames and you don't have to touch any code. The login/brand logo is
`Key Club Logo.png` in the repo root.

If board **seats change** (someone added/removed), update `ROSTER` here **and** the credentials in
`auth.js` (§2) **and** the `BOARD_ORDER` array in `portal.js` if it's a board (non-LTG) seat.

---

## 2. Logins & passwords  →  `auth.js`

Open `auth.js`, edit the **`USERS`** array:

- Each officer has `email` (or `username`), `password`, `role`, `division`.
- **To change a password:** edit its `password` value.
- **Roles:** `ltg`, `governor`, `secretary`, `treasurer`, `webmaster`, `editor`,
  `adult-treasurer`, `district-admin`.
- **Username logins** (no email): set `username` (ALL CAPS, case-insensitive) and `email: null`
  (or a real email for notifications). Currently `DISTRICTADMIN` (Cheryl Anderson) and
  `ADULTTREASURER` (James Sturch).

**Console passwords** (`auth.js`, bottom):
- `webmaster`, `editor`, `governor` each have a **separate** console password in
  `CONSOLE_PASSWORDS` — change them there.
- `adult-treasurer`, `district-admin`, and the board `treasurer` use **their normal login
  password** for the console (listed in `CONSOLE_SAME_AS_LOGIN`). No separate password to manage.

**Who sees what in the console** is set by `CONSOLE_SECTIONS` in `auth.js`:
- webmaster / governor / adult-treasurer / district-admin → Compliance, Activity Log, Board Meetings
- editor → Compliance only
- treasurer (board) → Board Meetings only

> ⚠️ This repo holds plaintext passwords, so **keep the GitHub repo PRIVATE.**

---

## 3. Reimbursement recipients & approvers  →  `worker.js`  (top CONFIG block)

- `TREASURER_EMAIL` — the board treasurer's inbox that gets every reimbursement submission and
  approves first (currently `momoarkkctreasurer@gmail.com`).
- `ADULT_TREASURER_EMAIL` — the adult treasurer who gives final approval + signature (currently
  `james.sturch@southsideschools.org`).
- `LTG_EMAILS` / `OFFICER_EMAILS` — forwarding addresses used for newsletter/MRF reminders.

If a new board treasurer or adult treasurer takes over, update **both** these two constants **and**
their `ROSTER`/`USERS` entries, then redeploy the Worker (§9).

The **mileage rate** ($0.25/mile) and the auto-fill destination address
(`333 S John Q Hammons Pkwy, Springfield, MO 65806`) are set in `reimbursement.js` as `RATE` and
`STATE_OFFICE`. Change them there if the state office moves or the rate changes.

---

## 4. Board meeting dates  →  set inside the portal (no code)

Board meeting dates are **data**, not code. Sign in as webmaster/governor → **Console → Board
Meetings → Meetings → “+ Board Meeting.”** Add each meeting's date (and optional label). You can
edit or remove them there any time. They're stored in `data/board-meetings.json`.

At the **start of each year:** remove last year's meetings (or leave them — approved reimbursements
stay in the Archive forever regardless) and add the new year's board meeting dates.

---

## 5. Calendar  →  `calendar.html`

The year-at-a-glance calendar and its board-meeting schedule cards are in `calendar.html`. Update
the term year, any hard-coded events, and the meeting entries there. (This calendar is separate
from the reimbursement Board Meetings in §4.)

---

## 6. Deadlines & compliance windows  →  `api.js` and `worker.js`

Newsletter and MRF deadlines are computed, not stored:
- **Newsletters:** due the 10th, September–March (+ May). Set in `api.js` (`NL_MONTHS`,
  `getNextDeadline`), `worker.js` (`NL_MONTHNUMS`), and `console.html` (`NL_MONTHS`).
- **MRFs:** due the 30th monthly (`getNextMRFDeadline` in `api.js`; `nextMRFDeadline` in
  `worker.js`).
- The console **year filter** options (`2025-2026`, `2026-2027`) are in `console.html` — add the
  new school year to the `fConsoleYear` dropdown and the `YEARS` array.

Only change these if the district changes its deadline policy.

---

## 7. Email setup (Resend)  →  one-time, per the keys, not yearly

Emails (submissions, approvals, reimbursement notices, deadline reminders) send through
**Resend**. They're a **no-op until configured** — nothing breaks without them.

1. resend.com account → add domain `moarkkeyclub.com` → add its DNS records in Cloudflare → wait
   for **Verified**.
2. Create a Resend API key.
3. Cloudflare → this Worker → **Settings → Variables and Secrets → add secret** `RESEND_API_KEY`.
4. Cloudflare → this Worker → **Settings → Triggers → Cron Triggers → add** `0 14 * * *` (daily
   deadline reminders).
5. Redeploy the Worker (§9).

Full notes are in `EMAIL_SETUP.md` and the header of `worker.js`.

---

## 8. Mileage auto-calculation (Google Routes API)  →  one-time

The reimbursement form auto-fills driving distance from the addresses. Until a key is set, the
miles boxes just stay **manual** (the form still works).

1. Google Cloud Console → new project → **enable “Routes API.”**
2. Create an API key; restrict it to the Routes API.
3. Cloudflare → this Worker → **Settings → Variables and Secrets → add secret**
   `GOOGLE_MAPS_API_KEY`.
4. Redeploy the Worker (§9).

Free tier is ~10k requests/month — far more than the district will use. The key lives only on the
Worker (never in the browser). The Worker exposes it via `POST /distance`.

---

## 9. Deploying the Worker  →  whenever you edit `worker.js`

Front-end files auto-deploy via Vercel on commit. **`worker.js` does not** — deploy it:

- **Easiest:** Cloudflare dashboard → Workers & Pages → `moark-portal-api` → **Edit code** →
  paste the new `worker.js` → **Deploy**, **or**
- `wrangler deploy` from a checkout with the Worker configured.

Worker **secrets** already set (don't need re-entering unless rotated): `GITHUB_TOKEN` (required —
lets the Worker read/write this repo), `RESEND_API_KEY` (email), `GOOGLE_MAPS_API_KEY` (mileage).
If the `GITHUB_TOKEN` ever expires, regenerate a fine-grained PAT with **Contents: read/write** on
this repo and re-add it as the `GITHUB_TOKEN` secret.

---

## 10. Data files (stored by the Worker in this repo)

You normally never edit these by hand — the portal writes them — but know where things live:

- `data/board-meetings.json` — board meetings + attendance.
- `data/reimbursements.json` — every reimbursement form + its approval status + the archive.
- `data/mrfs.json`, `data/dcms.json`, `data/committee-reports.json` — the other sections.
- `submissions/` — newsletter/DC-report PDFs + metadata.
- `logs/audit.json` — the activity log.

To wipe a section for a new year, you *can* reset the JSON to `[]`, but you usually don't need to —
the console filters by year. **Do not delete `data/reimbursements.json`** if you want to keep the
approved-reimbursement archive.

---

## 11. Social media / public site

- Public site: same monorepo, under `site/`, at **moarkkeyclub.com**.
- District social accounts are documented separately; update handles/logins there when the
  comms/editor role changes.

---

## Quick “new year” checklist

- [ ] Swap headshots in `assets/` (same filenames).
- [ ] Update `ROSTER` in `portal.js` (names, titles, divisions, vacancies, `BOARD_ORDER`).
- [ ] Update `USERS` + passwords in `auth.js`; rotate `CONSOLE_PASSWORDS`.
- [ ] Update `TREASURER_EMAIL` / `ADULT_TREASURER_EMAIL` / `LTG_EMAILS` in `worker.js` if people changed.
- [ ] Add the new school year to `console.html` (`fConsoleYear` + `YEARS`) and `calendar.html`.
- [ ] Add this year's board meeting dates in Console → Board Meetings.
- [ ] Confirm Worker secrets still valid (`GITHUB_TOKEN`, `RESEND_API_KEY`, `GOOGLE_MAPS_API_KEY`).
- [ ] **Redeploy the Worker** after any `worker.js` change.
- [ ] Test: log in as one LTG, one board officer, the treasurer, and the adult treasurer.

---
*Generated as part of the reimbursement-system + adult-accounts build. Keep this file in the repo root.*

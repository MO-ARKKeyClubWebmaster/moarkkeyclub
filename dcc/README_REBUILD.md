# MO-ARK Officer Portal - 2026 Rebuild

A full front-end rebuild of the officer portal. The look, the header, the
dashboard, the profile, the deadline/stat widgets and the console were all
redone on a clean white base with the navy + gold Key Club identity. The
back-end data flow (Cloudflare Worker + GitHub) is unchanged except for one
fix (see "Worker" below).

## Run it locally (preview before pushing)
Double-click **`dev.command`** in this folder. It serves the site at
**http://localhost:5173** and opens your browser. Edit a file, refresh, done.
(Or in Terminal: `python3 -m http.server 5173` from this folder.)
The site talks to your live Cloudflare Worker, so it's a fully working preview.

## Two things you edit to personalize it
Everything about "who's who" lives in **`portal.js`**, at the top, in `ROSTER`:

```js
'moarkkcltg1@gmail.com': { name: 'Maya Chen', role: 'ltg', division: 1,
                           photo: 'photos/div1.jpg', region: 'St. Louis Metro' },
```

- **name** - the real name. Shows in the greeting, the header, and is recorded
  on every submission. (Officers must sign in again for a new name to appear
  on new submissions.)
- **photo** - put a headshot in a `photos/` folder and point to it. Leave `''`
  to show their initials in a gold ring. (Officers can also set a photo
  themselves from the Profile page - that one is saved on their device only.)
- **region** - what the division covers; shown on the profile as the division
  "meaning". Optional.

That's the only file you edit for names/photos/regions.

## What changed
- **New design system** (`portal.css`) - white base, refined navy/gold, new
  cards, stat tiles, deadline cards, tables, forms, modals. Restyles every page.
- **One shared header** (`portal.js`) - identical on every page, role-aware,
  with avatar/photo, name, and a Profile / Sign-out menu. (Fixes the header
  that used to differ page to page.)
- **Real-name greeting** on the dashboard - "Good afternoon, *Maya*" with 15
  rotating Key Club-themed variations, plus the officer's photo.
- **New Profile page** (`profile.html`) - photo, name, division + meaning, and a
  service record (newsletters, DC reports, DCMs, MRFs, committee reports).
- **Submission downloads fixed** - see "Worker" below.
- **Merged pages** - `submit.html` and `archive.html` now redirect into the
  Newsletter hub, so there's one Newsletter entry instead of several.
- **Old `login.html`** was left in place but is NOT linked from anywhere. Heads
  up: it silently logged whatever email/password was typed into the audit log
  and always said "signed in" - it is not a real login. `index.html` is the
  real sign-in page. Delete `login.html` when you're ready.

## Worker (the corrupt/empty download fix)
`worker.js` here is your Worker with **one fix**: `servePDF` now fetches files
from GitHub using the `application/vnd.github.raw` media type. The old code used
the default API media type, whose base64 `content` field is **empty for files
over 1 MB** - which is why most newsletters downloaded empty/corrupt while small
ones worked. Deploy it:

```
wrangler deploy        # from your Worker project (GITHUB_TOKEN secret already set)
```
or paste `worker.js` into the Worker's editor in the Cloudflare dashboard → Save.
No data migration needed - the PDFs were always stored fine; only reading them
was broken.

## Backup
Your previous site is backed up next to this folder as
`moarkkeyclub-net-BACKUP-<timestamp>/`.

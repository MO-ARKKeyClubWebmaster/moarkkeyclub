# MO-ARK Key Club — Monorepo

Combined source for both district sites, deployed on **Vercel**.

```
site/   → Public site                          → https://moarkkeyclub.com (+ www)
dcc/    → District Command Center (portal)      → https://dcc.moarkkeyclub.com
```

## Deploy model
Two Vercel projects, one repo (no build step — both are static):

| Vercel project      | Root Directory | Domain(s)                          |
|---------------------|----------------|------------------------------------|
| moarkkeyclub-site   | `site/`        | moarkkeyclub.com, www              |
| moarkkeyclub-dcc    | `dcc/`         | dcc.moarkkeyclub.com               |

Backends stay on **Cloudflare Workers** (unaffected by the hosting change):
- `moark-portal-api` — portal API + data store (writes into this repo under `dcc/`)
- `marty-ai` — public-site "Marty" chat

## Portal data
The `moark-portal-api` Worker stores live records in this repo under
`dcc/submissions/`, `dcc/data/`, `dcc/logs/`, `dcc/reimbursement-pdfs/`,
`dcc/dcm-reports/`, `dcc/committee-pdfs/`. These are `.vercelignore`'d so they
are **never served publicly** — the Worker serves them via its own endpoints.

## Setup & migration
See **RUNBOOK.md** for the complete step-by-step: create the GitHub repo, push,
migrate live data, stand up the two Vercel projects (incl. the Ignored Build
Step), DNS records, Worker redeploy + token, the .net redirect, testing, and
rollback.

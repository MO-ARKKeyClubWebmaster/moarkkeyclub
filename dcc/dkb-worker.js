/**
 * ════════════════════════════════════════════════════════════════════════
 *  MO-ARK DISTRICT COMMAND CENTER  ·  DKB WORKER  (Cloudflare Worker)
 *  "Ask MO-ARK" — the District Knowledge Base engine.
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Deploy as a SEPARATE worker named  moark-dkb-api  (keeps it isolated from
 *  the portal worker — its own secrets, its own cron, its own blast radius).
 *
 *  WHAT IT DOES
 *    • Authenticates as the Google service account (JWT → access token) and
 *      reads every file the service account can see across all KC accounts.
 *    • Indexes them: extracts text (Google Docs/Sheets/Slides + plain text),
 *      chunks + embeds with Workers AI, and tags each with an ACCESS class.
 *    • Answers questions (RAG) filtered to what the ASKER's role may see,
 *      with citations that link back to the original Drive files.
 *    • Answers "where is X" location questions and powers a Browse view.
 *
 *  BINDINGS (set in the Cloudflare dashboard — see DKB_SETUP.md)
 *    • SA_KEY            SECRET  — the service-account JSON key (whole file)
 *    • DKB_ADMIN_SECRET  SECRET  — a random string; gates /sync and /state
 *    • DKB               KV namespace binding (the index lives here)
 *    • AI                Workers AI binding
 *
 *  CRON (dashboard → Settings → Triggers): run AFTER the Apps Scripts share
 *  files at 11:00 AM CT. Use  0 18 * * *  — that's ~1 PM CT during CDT and
 *  ~12 PM CT during CST, so it stays safely after 11 AM year-round.
 * ════════════════════════════════════════════════════════════════════════
 */

// ── Models (swap for stronger ones later; these run inside Workers AI) ────
const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';       // 768-dim embeddings
const LLM_MODEL   = '@cf/meta/llama-3.1-8b-instruct';  // answer synthesis
const SA_SCOPE    = 'https://www.googleapis.com/auth/drive.readonly';

// ── Per-run indexing budget. Each CHANGED file costs ~2 subrequests
//    (extract + embed). Cloudflare's free plan caps subrequests at 50 per
//    invocation, so we process a bounded number of changed files per run and
//    finish the backlog over several runs (or several /sync calls). On the
//    Workers PAID plan you can raise this to e.g. 200. ─────────────────────
const MAX_CHANGED_PER_RUN = 18;

// ── ACCESS MODEL ──────────────────────────────────────────────────────────
// The service account can SEE everything; THIS worker decides who may READ
// what. Every file gets an access "scope"; every asker gets a role. The
// matrix below is intentionally simple and lives here so you can tune it.
//
//   scope 'wide'     → every officer (public / district-wide material)
//   scope 'board'    → board + adults + admins (NOT the LTGs)
//   scope 'division' → the owning division's LTG + board + admins
//   scope 'admin'    → superusers only (webmaster / governor / district-admin)
//
// FAIL CLOSED: anything we can't confidently classify becomes 'admin'
// (superusers only), never 'wide'.
const SUPER_ROLES = ['webmaster', 'governor', 'district-admin'];
const BOARD_ROLES = ['secretary', 'treasurer', 'editor', 'adult-treasurer', 'adult-member'];
const KNOWN_ROLES = SUPER_ROLES.concat(BOARD_ROLES).concat(['ltg']);

// Which KC Google account owns a file → what position it belongs to.
// (These are the real login accounts, straight from the portal's auth list.)
const ROLE_MAP = {
  'moarkkcltg1@gmail.com':      { role: 'ltg', division: 1 },
  'moarkkcltg002@gmail.com':    { role: 'ltg', division: 2 },
  'moarkkeyclubltg3@gmail.com': { role: 'ltg', division: 3 },
  'moarkeyclubltg04@gmail.com': { role: 'ltg', division: 4 },
  'moarkkcltg05@gmail.com':     { role: 'ltg', division: 5 },
  'moarkkcltg6@gmail.com':      { role: 'ltg', division: 6 },
  'moarkkcltg007@gmail.com':    { role: 'ltg', division: 7 },
  'moarkkcltg08@gmail.com':     { role: 'ltg', division: 8 },
  'moarkkcltg9@gmail.com':      { role: 'ltg', division: 9 },
  'moarkkcltg010@gmail.com':    { role: 'ltg', division: 10 },
  'moarkkeyclubgovernor@gmail.com': { role: 'governor' },
  'momoarkkctreasurer@gmail.com':   { role: 'treasurer' },
  'moarkkcsecretary@gmail.com':     { role: 'secretary' },
  'moarkkeyclubwebmaster@gmail.com':{ role: 'webmaster' },
  'moarkkeditor1@gmail.com':        { role: 'editor' },
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-DKB-Key',
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (path === '/health' && method === 'GET') {
        const st = (await env.DKB.get('dkb:state', 'json')) || {};
        return json({ ok: true, lastSync: st.lastSync || null, counts: st.counts || null });
      }

      if (path === '/ask' && method === 'POST') {
        const body = await request.json();
        const user = resolveUser(body.user || {});
        if (!body.question) return json({ error: 'Missing question.' }, 400);
        return json(await ask(env, String(body.question), user));
      }

      if (path === '/locate' && method === 'POST') {
        const body = await request.json();
        const user = resolveUser(body.user || {});
        return json(await locate(env, String(body.query || ''), user));
      }

      if (path === '/browse' && method === 'POST') {
        const body = await request.json();
        const user = resolveUser(body.user || {});
        return json(await browse(env, user));
      }

      if (path === '/library' && method === 'POST') {
        const body = await request.json();
        return json(await libraryView(env, resolveUser(body.user || {})));
      }
      if (path === '/library/edit' && method === 'POST') {
        const body = await request.json();
        const user = resolveUser(body.user || {});
        if (!canEditLibrary(user)) return json({ error: 'Not allowed.' }, 403);
        return json(await libraryEdit(env, body));
      }

      // ── Admin-gated ──────────────────────────────────────────────────
      if (path === '/sync' && method === 'POST') {
        if (!adminOk(request, url, env)) return json({ error: 'Unauthorized.' }, 401);
        return json(await syncAll(env));
      }
      if (path === '/reset' && method === 'POST') {
        if (!adminOk(request, url, env)) return json({ error: 'Unauthorized.' }, 401);
        await clearChunks(env);
        await env.DKB.delete('dkb:files');
        await env.DKB.delete('dkb:state');
        return json({ ok: true, reset: true });
      }
      if (path === '/state' && method === 'GET') {
        if (!adminOk(request, url, env)) return json({ error: 'Unauthorized.' }, 401);
        const st = (await env.DKB.get('dkb:state', 'json')) || {};
        const files = (await env.DKB.get('dkb:files', 'json')) || [];
        return json({ state: st, fileCount: files.length });
      }

      return json({ error: 'Not found', path }, 404);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500);
    }
  },

  // Daily catch-up. Cron fires this; it runs one bounded sync pass.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncAll(env).catch(() => {}));
  },
};

// ════════════════════════ AUTH (identity of the asker) ═══════════════════
// Re-derive role from the owning account when the email is a known KC login
// (defeats casual role-spoofing for those accounts). Adults who log in by
// username aren't in ROLE_MAP, so we trust the role the portal sent for them.
// NOTE: this inherits the portal's client-trust model. Hardening the boundary
// (signed session tokens) is the documented next step.
function resolveUser(u) {
  const email = String(u.email || '').toLowerCase();
  const known = ROLE_MAP[email];
  if (known) return { email, role: known.role, division: known.division || null };
  const role = KNOWN_ROLES.includes(String(u.role || '').toLowerCase()) ? String(u.role).toLowerCase() : '';
  const division = (u.division === 0 || u.division) ? Number(u.division) : null;
  return { email, role, division };
}

function visibleTo(user, item) {
  const role = (user.role || '').toLowerCase();
  const acc = item.access || { scope: 'admin' };
  if (SUPER_ROLES.includes(role)) return true;
  if (acc.scope === 'wide') return true;
  if (acc.scope === 'admin') return false;
  if (BOARD_ROLES.includes(role)) return acc.scope === 'board' || acc.scope === 'division';
  if (role === 'ltg') return acc.scope === 'division' && Number(acc.division) === Number(user.division);
  return false;
}

function adminOk(request, url, env) {
  const key = request.headers.get('X-DKB-Key') || url.searchParams.get('key') || '';
  return env.DKB_ADMIN_SECRET && key === env.DKB_ADMIN_SECRET;
}

// ════════════════════════ CLASSIFICATION ═════════════════════════════════
function classify(ownerEmail, folderName, fileName) {
  const hay = ((folderName || '') + ' ' + (fileName || '')).toLowerCase();
  // Explicit, name-driven overrides win.
  if (/\b(confidential|private|admin[\s-]?only|sensitive|pii|member\s*(data|info|roster)|contact\s*list)\b/.test(hay))
    return { scope: 'admin' };
  if (/\b(public|district[\s-]?wide|all[\s-]?officers|shared[\s-]?all|handbook|resource|guidebook|template)\b/.test(hay))
    return { scope: 'wide' };
  const owner = ROLE_MAP[String(ownerEmail).toLowerCase()];
  if (!owner) return { scope: 'admin' };          // FAIL CLOSED
  if (owner.role === 'ltg') return { scope: 'division', division: owner.division };
  return { scope: 'board' };                        // exec / adult / admin account
}

function isExtractable(mt) {
  return mt === 'application/vnd.google-apps.document'
      || mt === 'application/vnd.google-apps.spreadsheet'
      || mt === 'application/vnd.google-apps.presentation'
      || mt === 'text/plain' || mt === 'text/markdown' || mt === 'text/csv';
}

function docTypeOf(folderName, fileName) {
  const s = ((folderName || '') + ' ' + (fileName || '')).toLowerCase();
  if (/financ|budget|reimburs|expense|treasur|invoice|dues|receipt/.test(s)) return 'Finance';
  if (/newsletter|editor|graphic|brand|social|design|photo|logo|canva/.test(s)) return 'Communications';
  if (/agenda|minutes|board\s*meeting|governance|bylaw|policy|election|constitution/.test(s)) return 'Governance';
  if (/dlc|dcon|event|conference|fundrais|service|project|icon|convention/.test(s)) return 'Events & Service';
  if (/dcm|division|club|member|roster|contact/.test(s)) return 'Membership';
  if (/mrf|report|form|submission/.test(s)) return 'Reports & Forms';
  return 'General';
}

function buildMeta(f, ownerEmail, folderName) {
  const access = classify(ownerEmail, folderName, f.name);
  return {
    id: f.id,
    title: f.name || '(untitled)',
    url: f.webViewLink || ('https://drive.google.com/file/d/' + f.id + '/view'),
    mimeType: f.mimeType,
    folder: folderName || '',
    owner: String(ownerEmail || '').toLowerCase(),
    position: (ROLE_MAP[String(ownerEmail).toLowerCase()] || {}).role || 'unknown',
    year: yearOf(f.modifiedTime),
    modified: f.modifiedTime,
    docType: docTypeOf(folderName, f.name),
    division: access.division || null,
    access,
  };
}

function yearOf(iso) { const d = new Date(iso || Date.now()); return isNaN(d) ? '' : d.getFullYear(); }

// ════════════════════════ ASK / LOCATE / BROWSE ══════════════════════════
async function ask(env, question, user) {
  const chunks = await loadChunks(env);
  const visible = chunks.filter((c) => visibleTo(user, c));
  if (!visible.length)
    return { answer: 'I don’t have any indexed documents I can share with your role yet. If you just set this up, run a sync first.', citations: [] };

  const STOP = new Set(['the','a','an','of','to','in','on','for','and','or','is','was','were','are','be','do','did','does','what','when','where','who','how','why','which','that','this','it','with','about','our','your','my']);
  const qTokens = question.toLowerCase().split(/\W+/).filter((t) => t.length > 2 && !STOP.has(t));
  const titleScore = (title) => {
    const t = (title || '').toLowerCase();
    if (!qTokens.length) return 0;
    let hit = 0; qTokens.forEach((w) => { if (t.indexOf(w) !== -1) hit++; });
    return hit / qTokens.length;
  };
  const TODAY = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const qvec = (await embedOne(env, question));
  const scored = visible
    .map((c) => ({ c, s: cosine(qvec, c.emb) + 0.4 * titleScore(c.title) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 40);

  // Group the best chunks by document, so each cited source carries real
  // content AND the context numbering matches the citation numbering exactly.
  const byFile = new Map();
  for (const x of scored) {
    if (!byFile.has(x.c.fileId)) byFile.set(x.c.fileId, { title: x.c.title, url: x.c.url, docType: x.c.docType, best: x.s, texts: [] });
    const f = byFile.get(x.c.fileId);
    if (f.texts.length < 3) f.texts.push(x.c.text);
  }
  const files = [...byFile.values()].sort((a, b) => b.best - a.best).slice(0, 5);
  const context = files.map((f, i) => `[${i + 1}] ${f.title}\n${f.texts.join('\n. . .\n')}`).join('\n\n----\n\n');
  const citations = files.map((f) => ({ title: cleanTitle(f.title), url: f.url, docType: f.docType }));

  const sys =
    'You are the MO-ARK District Key Club knowledge base assistant. Today is ' + TODAY + '. ' +
    'The current board term is 2025-2026, so a question naming only a month (e.g. "September") ' +
    'or saying "this year" refers to the most recent term unless another year is explicitly stated; ' +
    'never refuse just because an exact year string is missing from the sources. ' +
    'Answer using the numbered sources below and cite the ones you use inline like [1]. ' +
    'Prefer the earlier (higher-ranked) sources, and actually give the content asked for ' +
    '(for example, if asked what a committee did, list what it did). ' +
    'Only say you do not see it if none of the sources address the topic. ' +
    'Never mention documents that are not in the sources.';

  const MODELS = [
    '@cf/meta/llama-3.1-8b-instruct',
    '@cf/meta/llama-3.1-8b-instruct-fast',
    '@cf/meta/llama-3-8b-instruct',
    '@cf/meta/llama-3.2-3b-instruct',
    '@cf/mistral/mistral-7b-instruct-v0.2',
  ];
  const prompt = `Sources:\n${context}\n\nQuestion: ${question}`;
  let answer = '', lastErr = '';
  for (const m of MODELS) {
    try {
      const out = await env.AI.run(m, {
        messages: [ { role: 'system', content: sys }, { role: 'user', content: prompt } ],
        max_tokens: 700,
      });
      answer = (out && (out.response || out.result ||
        (out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content))) || '';
      if (answer && answer.trim()) { answer = answer.trim(); break; }
    } catch (e) { lastErr = String((e && e.message) || e); }
  }
  if (!answer) return { answer: 'The answer engine is unavailable right now — here are the matching documents.', citations, debug: lastErr };
  return { answer, citations };
}

async function locate(env, query, user) {
  const files = (await env.DKB.get('dkb:files', 'json')) || [];
  const q = query.toLowerCase().split(/\s+/).filter(Boolean);
  const visible = files.filter((f) => visibleTo(user, f));
  const scored = visible
    .map((f) => {
      const hay = (f.title + ' ' + f.folder + ' ' + f.docType).toLowerCase();
      let s = 0;
      q.forEach((t) => { if (hay.includes(t)) s++; });
      return { f, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 20)
    .map((x) => x.f);
  return { results: scored.map(publicFile) };
}

async function browse(env, user) {
  const files = (await env.DKB.get('dkb:files', 'json')) || [];
  const visible = files.filter((f) => visibleTo(user, f)).map(publicFile);
  const groups = {};
  visible.forEach((f) => { (groups[f.docType] = groups[f.docType] || []).push(f); });
  Object.keys(groups).forEach((k) => groups[k].sort((a, b) => (b.modified || '').localeCompare(a.modified || '')));
  return { total: visible.length, groups };
}

function publicFile(f) {
  return {
    title: f.title,
    clean: cleanTitle(f.title),
    url: f.url,
    folder: f.folder,
    docType: f.docType,
    position: f.position,
    source: ownerLabel(f.position, f.division),
    year: f.year,
    modified: f.modified,
    mimeType: f.mimeType,
    kind: kindOf(f.mimeType),
  };
}
function kindOf(mt) {
  if (mt === 'application/vnd.google-apps.document') return 'Doc';
  if (mt === 'application/vnd.google-apps.spreadsheet') return 'Sheet';
  if (mt === 'application/vnd.google-apps.presentation') return 'Slides';
  if (mt === 'application/vnd.google-apps.form') return 'Form';
  if (mt === 'application/pdf') return 'PDF';
  if (mt && mt.indexOf('image/') === 0) return 'Image';
  if (mt && mt.indexOf('video/') === 0) return 'Video';
  return 'File';
}
function cleanTitle(t) {
  return String(t || '').replace(/\s*\[OCR\]\s*$/i, '').replace(/\.(pdf|docx?|xlsx?|pptx?|txt|csv|jpe?g|png|gif|heic)$/i, '').trim() || 'Untitled';
}
function ownerLabel(position, division) {
  const map = { governor: 'Governor', secretary: 'Secretary', treasurer: 'Treasurer', webmaster: 'Webmaster', editor: 'Editor', 'district-admin': 'District Admin', 'adult-treasurer': 'Adult Treasurer', 'adult-member': 'Adult Board' };
  if (position === 'ltg') return 'Division ' + division + ' LTG';
  return map[position] || 'District';
}

function dedupeCites(chunks) {
  const seen = {}, out = [];
  chunks.forEach((c) => { if (!seen[c.fileId]) { seen[c.fileId] = 1; out.push({ title: c.title, url: c.url, docType: c.docType }); } });
  return out.slice(0, 6);
}

// ════════════════════════ SYNC / INDEX ═══════════════════════════════════
async function syncAll(env) {
  const token = await getAccessToken(env);
  const state = (await env.DKB.get('dkb:state', 'json')) || { rev: {}, folders: {} };
  state.rev = state.rev || {}; state.folders = state.folders || {};
  const oldChunks = await loadChunks(env);
  const chunkByFile = {};
  oldChunks.forEach((c) => { (chunkByFile[c.fileId] = chunkByFile[c.fileId] || []).push(c); });

  // 1) List everything the SA can see.
  const all = [];
  let pageToken = null, pages = 0;
  do {
    const page = await driveList(token, pageToken);
    (page.files || []).forEach((f) => all.push(f));
    pageToken = page.nextPageToken;
  } while (pageToken && ++pages < 40);

  // Cache folder names from folders that are themselves shared (free lookups).
  all.forEach((f) => { if (f.mimeType === 'application/vnd.google-apps.folder') state.folders[f.id] = f.name; });

  const seen = {};
  const filesOut = [];
  const finalChunks = [];
  let indexed = 0, reused = 0, metaOnly = 0, budgetLeft = MAX_CHANGED_PER_RUN;

  for (const f of all) {
    if (f.mimeType === 'application/vnd.google-apps.folder') continue;
    seen[f.id] = true;
    const ownerEmail = (f.owners && f.owners[0] && f.owners[0].emailAddress) || '';
    const folderName = await folderNameOf(token, f, state.folders);
    const meta = buildMeta(f, ownerEmail, folderName);
    filesOut.push(meta);

    // Already processed at this version → skip for free (reattach chunks if any).
    if (state.rev[f.id] === f.modifiedTime) {
      if (chunkByFile[f.id]) {
        chunkByFile[f.id].forEach((c) => {
          c.access = meta.access; c.division = meta.division; c.docType = meta.docType;
          c.title = meta.title; c.url = meta.url; finalChunks.push(c);
        });
        reused++;
      }
      continue;
    }

    // New/changed but NOT text-extractable (PDF, image, binary): metadata-only.
    // Mark done immediately — no subrequest, no budget — so a big pile of PDFs
    // can never stall the index. It stays findable by name via Browse/Locate.
    if (!isExtractable(f.mimeType)) {
      state.rev[f.id] = f.modifiedTime;
      metaOnly++;
      continue;
    }

    // Text-extractable + changed, but only so many per run (subrequest budget).
    if (budgetLeft <= 0) {
      if (chunkByFile[f.id]) chunkByFile[f.id].forEach((c) => finalChunks.push(c));
      continue; // leave state.rev so it retries next run
    }

    const text = await extractText(token, f);
    const parts = chunkText(text);
    if (parts.length) {
      const header = meta.title + (meta.folder ? ' (' + meta.folder + ')' : '');
      const vecs = await embedMany(env, parts.map((p) => header + '\n' + p));
      for (let i = 0; i < parts.length; i++) {
        finalChunks.push({
          fileId: f.id, title: meta.title, url: meta.url, docType: meta.docType,
          access: meta.access, division: meta.division, text: parts[i].slice(0, 900), emb: round4(vecs[i]),
        });
      }
    }
    state.rev[f.id] = f.modifiedTime;
    indexed++; budgetLeft--;
  }

  // Drop files that vanished / were un-shared.
  let removed = 0;
  Object.keys(state.rev).forEach((id) => { if (!seen[id]) { delete state.rev[id]; removed++; } });

  const counts = { files: filesOut.length, chunks: finalChunks.length, indexedThisRun: indexed, metaOnly, reused, removed };
  await env.DKB.put('dkb:files', JSON.stringify(filesOut));
  await saveChunks(env, finalChunks);
  await env.DKB.put('dkb:state', JSON.stringify({ rev: state.rev, folders: state.folders, lastSync: new Date().toISOString(), counts }));

  const done = budgetLeft > 0;
  return { ok: true, done, ...counts, note: done ? 'Index up to date.' : 'Budget reached — run /sync again to continue indexing the backlog.' };
}
// ── Google Drive API ──────────────────────────────────────────────────────
async function driveList(token, pageToken) {
  const params = new URLSearchParams({
    q: 'trashed = false',
    fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,webViewLink,parents,owners(emailAddress))',
    pageSize: '1000',
    orderBy: 'modifiedTime desc',
  });
  if (pageToken) params.set('pageToken', pageToken);
  const r = await fetch('https://www.googleapis.com/drive/v3/files?' + params.toString(), {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!r.ok) throw new Error('Drive list failed: ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}

async function folderNameOf(token, f, cache) {
  const pid = f.parents && f.parents[0];
  if (!pid) return '';
  if (cache[pid] !== undefined) return cache[pid];
  try {
    const r = await fetch('https://www.googleapis.com/drive/v3/files/' + pid + '?fields=name', { headers: { Authorization: 'Bearer ' + token } });
    const d = await r.json();
    cache[pid] = d.name || '';
  } catch (e) { cache[pid] = ''; }
  return cache[pid];
}

async function extractText(token, f) {
  const mt = f.mimeType || '';
  try {
    if (mt === 'application/vnd.google-apps.document') return await driveExport(token, f.id, 'text/plain');
    if (mt === 'application/vnd.google-apps.spreadsheet') return await driveExport(token, f.id, 'text/csv');
    if (mt === 'application/vnd.google-apps.presentation') return await driveExport(token, f.id, 'text/plain');
    if (mt === 'text/plain' || mt === 'text/markdown' || mt === 'text/csv') return await driveMedia(token, f.id);
  } catch (e) { /* fall through to metadata-only */ }
  return ''; // PDFs / images / other binaries: findable by name & location, not full-text (v1)
}

async function driveExport(token, id, mimeType) {
  const r = await fetch('https://www.googleapis.com/drive/v3/files/' + id + '/export?mimeType=' + encodeURIComponent(mimeType), { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) return '';
  return (await r.text()).slice(0, 60000);
}
async function driveMedia(token, id) {
  const r = await fetch('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media', { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) return '';
  return (await r.text()).slice(0, 60000);
}

// ── Workers AI ──────────────────────────────────────────────────────────
async function embedMany(env, texts) {
  const res = await env.AI.run(EMBED_MODEL, { text: texts });
  return res.data;
}
async function embedOne(env, text) {
  const res = await env.AI.run(EMBED_MODEL, { text: [text] });
  return res.data[0];
}

// ── Service-account JWT auth ──────────────────────────────────────────────
async function getAccessToken(env) {
  const cached = await env.DKB.get('dkb:sa_token', 'json');
  const nowSec = Math.floor(Date.now() / 1000);
  if (cached && cached.exp > nowSec + 60) return cached.token;

  const key = JSON.parse(env.SA_KEY);
  const tokenUri = key.token_uri || 'https://oauth2.googleapis.com/token';
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = { iss: key.client_email, scope: SA_SCOPE, aud: tokenUri, iat: nowSec, exp: nowSec + 3600 };
  const unsigned = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claim));
  const sig = await rsaSign(unsigned, key.private_key);
  const jwt = unsigned + '.' + sig;

  const r = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + jwt,
  });
  const data = await r.json();
  if (!data.access_token) throw new Error('Service-account auth failed: ' + JSON.stringify(data).slice(0, 200));
  await env.DKB.put('dkb:sa_token', JSON.stringify({ token: data.access_token, exp: nowSec + (data.expires_in || 3600) }), { expirationTtl: data.expires_in || 3600 });
  return data.access_token;
}

async function rsaSign(data, pem) {
  const clean = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('pkcs8', der.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(data));
  return bytesToB64url(sigBuf);
}

// ── small helpers ─────────────────────────────────────────────────────────
function b64url(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function bytesToB64url(buf) {
  const arr = new Uint8Array(buf); let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// ════════════════════════ LIBRARY (DKB's own file organization) ═══════════
const DEFAULT_FOLDERS = [
  { id: 'governance', name: 'Governance', parent: null, order: 1 },
  { id: 'finance', name: 'Finance', parent: null, order: 2 },
  { id: 'events', name: 'Events & DCON', parent: null, order: 3 },
  { id: 'membership', name: 'Membership & Divisions', parent: null, order: 4 },
  { id: 'comms', name: 'Communications', parent: null, order: 5 },
  { id: 'resources', name: 'Officer Resources', parent: null, order: 6 },
  { id: 'forms', name: 'Forms & Reports', parent: null, order: 7 },
  { id: 'unsorted', name: 'Unsorted', parent: null, order: 99 },
];
const DOCTYPE_FOLDER = { 'Finance': 'finance', 'Governance': 'governance', 'Events & Service': 'events', 'Membership': 'membership', 'Communications': 'comms', 'Reports & Forms': 'forms', 'General': 'unsorted' };
function autoFolderId(docType) { return DOCTYPE_FOLDER[docType] || 'unsorted'; }
function canEditLibrary(user) { return ['webmaster', 'governor', 'district-admin'].includes((user.role || '').toLowerCase()); }

async function loadLibrary(env) {
  let lib = await env.DKB.get('dkb:library', 'json');
  if (!lib || !Array.isArray(lib.folders) || !lib.folders.length) lib = { v: 1, folders: DEFAULT_FOLDERS.map((f) => ({ ...f })), place: {}, hidden: {}, pinned: {}, rename: {} };
  lib.place = lib.place || {}; lib.hidden = lib.hidden || {}; lib.pinned = lib.pinned || {}; lib.rename = lib.rename || {};
  return lib;
}
async function saveLibrary(env, lib) { await env.DKB.put('dkb:library', JSON.stringify(lib)); }

async function libraryView(env, user) {
  const lib = await loadLibrary(env);
  const files = (await env.DKB.get('dkb:files', 'json')) || [];
  const canEdit = canEditLibrary(user);
  const byFolder = {};
  lib.folders.forEach((f) => { byFolder[f.id] = []; });
  const pinned = [];
  for (const f of files) {
    if (!visibleTo(user, f)) continue;
    const fid = f.id;
    if (lib.hidden[fid] && !canEdit) continue;
    const folderId = (lib.place[fid] && byFolder[lib.place[fid]] !== undefined) ? lib.place[fid] : autoFolderId(f.docType);
    const rec = publicFile(f);
    rec.fileId = fid;
    if (lib.rename[fid]) rec.clean = lib.rename[fid];
    rec.hidden = !!lib.hidden[fid];
    rec.pinned = !!lib.pinned[fid];
    (byFolder[folderId] = byFolder[folderId] || []).push(rec);
    if (rec.pinned) pinned.push(rec);
  }
  const folders = lib.folders
    .map((f) => ({ id: f.id, name: f.name, parent: f.parent || null, order: f.order || 0, count: (byFolder[f.id] || []).length }))
    .sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name));
  return { canEdit, folders, byFolder, pinned };
}

async function libraryEdit(env, body) {
  const lib = await loadLibrary(env);
  const op = body.op;
  if (op === 'addFolder') {
    const id = 'f' + Date.now().toString(36);
    lib.folders.push({ id, name: String(body.name || 'New folder').slice(0, 60), parent: body.parent || null, order: Number(body.order) || 50 });
  } else if (op === 'renameFolder') {
    const f = lib.folders.find((x) => x.id === body.id); if (f) f.name = String(body.name || f.name).slice(0, 60);
  } else if (op === 'deleteFolder') {
    if (body.id !== 'unsorted') {
      Object.keys(lib.place).forEach((fid) => { if (lib.place[fid] === body.id) lib.place[fid] = 'unsorted'; });
      lib.folders = lib.folders.filter((x) => x.id !== body.id);
    }
  } else if (op === 'moveFile') {
    if (body.folderId === '__auto') delete lib.place[body.fileId]; else lib.place[body.fileId] = body.folderId;
  } else if (op === 'setHidden') {
    if (body.hidden) lib.hidden[body.fileId] = 1; else delete lib.hidden[body.fileId];
  } else if (op === 'setPinned') {
    if (body.pinned) lib.pinned[body.fileId] = 1; else delete lib.pinned[body.fileId];
  } else if (op === 'renameFile') {
    if (body.name) lib.rename[body.fileId] = String(body.name).slice(0, 140); else delete lib.rename[body.fileId];
  } else {
    return { error: 'unknown op' };
  }
  await saveLibrary(env, lib);
  return { ok: true };
}

function round4(v) { const o = new Array(v.length); for (let i = 0; i < v.length; i++) o[i] = Math.round(v[i] * 1e4) / 1e4; return o; }

async function loadChunks(env) {
  const meta = await env.DKB.get('dkb:chunks:shards', 'json');
  if (meta && meta.n) {
    let all = [];
    for (let i = 0; i < meta.n; i++) { const part = await env.DKB.get('dkb:chunks:' + i, 'json'); if (part) all = all.concat(part); }
    return all;
  }
  return (await env.DKB.get('dkb:chunks', 'json')) || [];  // legacy
}

async function saveChunks(env, chunks) {
  const SHARD = 1200;
  const n = Math.max(1, Math.ceil(chunks.length / SHARD));
  const prev = await env.DKB.get('dkb:chunks:shards', 'json');
  const prevN = (prev && prev.n) ? prev.n : 0;
  for (let i = 0; i < n; i++) await env.DKB.put('dkb:chunks:' + i, JSON.stringify(chunks.slice(i * SHARD, (i + 1) * SHARD)));
  await env.DKB.put('dkb:chunks:shards', JSON.stringify({ n: n, total: chunks.length }));
  // Delete ONLY shards that actually became surplus (usually none) — never a blind loop.
  for (let i = n; i < prevN; i++) await env.DKB.delete('dkb:chunks:' + i);
}

async function clearChunks(env) {
  const meta = await env.DKB.get('dkb:chunks:shards', 'json');
  const n = (meta && meta.n) ? meta.n : 0;
  for (let i = 0; i < n; i++) await env.DKB.delete('dkb:chunks:' + i);  // only the shards that exist
  await env.DKB.delete('dkb:chunks:shards');
}

function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}
function chunkText(text) {
  text = String(text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) return [];
  text = text.slice(0, 60000);
  const MAX = 1400, OV = 200, out = [];
  let i = 0;
  while (i < text.length && out.length < 45) { out.push(text.slice(i, i + MAX)); i += (MAX - OV); }
  return out;
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

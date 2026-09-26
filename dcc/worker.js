/**
 * MO-ARK District Portal - Cloudflare Worker
 *
 * Includes:
 *   • The PDF-download fix (servePDF via the GitHub "raw" media type).
 *   • EMAIL NOTIFICATIONS (Resend): sent on new submissions, returns, approvals,
 *     and editor->webmaster handoffs, plus automatic deadline reminders on a
 *     daily schedule. Email is a NO-OP until the RESEND_API_KEY secret is set.
 *   • BOARD MEETINGS + REIMBURSEMENTS: attendance, digital reimbursement forms,
 *     the treasurer -> adult-treasurer approval chain, and reimbursement emails.
 *   • MILEAGE DISTANCE: /distance proxies Google Routes API (keeps the key on
 *     the server). NO-OP that returns {miles:null} until GOOGLE_MAPS_API_KEY set.
 *
 * ── EMAIL SETUP (one time, ~10 min) ──────────────────────────────────────
 *   1. Create a free account at resend.com and add the domain moarkkeyclub.com;
 *      add the DNS records it shows you (in Cloudflare DNS) and wait for "Verified".
 *   2. In Resend, create an API key (copy it).
 *   3. Cloudflare dashboard → this Worker → Settings → Variables and Secrets →
 *      add a SECRET named  RESEND_API_KEY  with that key. Save.
 *   4. (Reminders) Cloudflare dashboard → this Worker → Settings → Triggers →
 *      Cron Triggers → Add:  0 14 * * *
 *   5. Deploy this file. Done.
 *
 * ── MILEAGE SETUP (one time, ~10 min) ────────────────────────────────────
 *   1. In Google Cloud Console, create a project and enable the "Routes API".
 *   2. Create an API key. Restrict it to the Routes API (recommended).
 *   3. Cloudflare dashboard → this Worker → Settings → Variables and Secrets →
 *      add a SECRET named  GOOGLE_MAPS_API_KEY  with that key. Save + deploy.
 *   Until then, the form still works - officers just type the miles by hand.
 *
 *   Recipient addresses are in the CONFIG block below - edit if any are wrong.
 */

const GITHUB_USER    = 'MO-ARKKeyClubWebmaster';
const GITHUB_REPO    = 'moarkkeyclub';
const GITHUB_BRANCH  = 'data';   // data lives on a separate branch so Worker commits never trigger Vercel
const DATA_PATH      = 'dcc/submissions';
const AUDIT_LOG_PATH = 'dcc/logs/audit.json';
const DCM_PATH       = 'dcc/data/dcms.json';
const MRF_PATH       = 'dcc/data/mrfs.json';
const COMMITTEE_PATH = 'dcc/data/committee-reports.json';
const DCM_PDF_PATH   = 'dcc/dcm-reports';
const COMMITTEE_PDF_PATH = 'dcc/committee-pdfs';
// ── PER-FILE STORAGE (safety: a manual GitHub upload can no longer wipe
//    every record with one stale aggregate file. Each board meeting and
//    reimbursement gets its own <id>.json inside the folders below —
//    the same pattern the newsletter submissions/ folder uses.
//    The legacy aggregate files stay readable for a one-time backfill,
//    but are never written to again.) ─────────────────────────────────
const BOARD_MEETINGS_DIR         = 'dcc/data/board-meetings';
const REIMBURSEMENTS_DIR         = 'dcc/data/reimbursements';
const REIMB_PDF_PATH             = 'dcc/reimbursement-pdfs';
const BOARD_MEETINGS_PATH_LEGACY = 'dcc/data/board-meetings.json';
const REIMBURSEMENTS_PATH_LEGACY = 'dcc/data/reimbursements.json';
// ── BOARD ROSTER (master list of everyone: names, titles, emails, photos) ──
const ROSTER_PATH    = 'dcc/data/roster.json';
const ROSTER_IMG_DIR = 'dcc/data/roster-images';

/* ── EMAIL CONFIG ─────────────────────────────────────────────────────────
 * FROM must be on the domain you verify in Resend. */
const PORTAL_URL  = 'https://dcc.moarkkeyclub.com';
const EMAIL_FROM  = 'MO-ARK Key Club Portal <portal@moarkkeyclub.com>';
const EMAIL_REPLY = 'webmaster@moarkkeyclub.com';

// Reimbursement approval-chain recipients (exact addresses requested).
const TREASURER_EMAIL       = 'momoarkkctreasurer@gmail.com';       // board treasurer (Abraham)
const ADULT_TREASURER_EMAIL = 'james.sturch@southsideschools.org';  // adult treasurer (James Sturch)

const OFFICER_EMAILS = {
  governor:  'governor@moarkkeyclub.com',
  secretary: 'secretary@moarkkeyclub.com',
  treasurer: 'treasurer@moarkkeyclub.com',
  webmaster: 'webmaster@moarkkeyclub.com',
  editor:    'editor@moarkkeyclub.com',
};
const LTG_EMAILS = {
  1: 'ltg.01@moarkkeyclub.com', 2: 'ltg.02@moarkkeyclub.com', 3: 'ltg.03@moarkkeyclub.com',
  4: null /* vacant */,          5: 'ltg.05@moarkkeyclub.com', 6: 'ltg.06@moarkkeyclub.com',
  7: null /* vacant */,          8: 'ltg.08@moarkkeyclub.com', 9: 'ltg.09@moarkkeyclub.com',
  10: 'ltg.10@moarkkeyclub.com',
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: CORS });

    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;
    const ip     = request.headers.get('CF-Connecting-IP') ||
                   request.headers.get('X-Forwarded-For') ||
                   'unknown';
    const wait = p => { try { ctx && ctx.waitUntil(p); } catch (_) { /* ignore */ } };

    try {
      if (path.startsWith('/pdf/') && method === 'GET')
        return await servePDF(`${DATA_PATH}/${path.split('/')[2]}.pdf`, env);
      if (path.startsWith('/dcm-pdf/') && method === 'GET')
        return await servePDF(`${DCM_PDF_PATH}/${path.split('/')[2]}.pdf`, env);
      if (path.startsWith('/committee-pdf/') && method === 'GET')
        return await servePDF(`${COMMITTEE_PDF_PATH}/${path.split('/')[2]}.pdf`, env);
      if (path.startsWith('/reimb-pdf/') && method === 'GET')
        return await servePDF(`${REIMB_PDF_PATH}/${path.split('/')[2]}.pdf`, env);

      if (path === '/log' && method === 'POST') {
        const body = await request.json();
        await writeLog({ ...body, ip }, env);
        return json({ ok: true });
      }
      if (path === '/logs' && method === 'GET') return await getLogs(env);

      // ── BOARD ROSTER (master list) ──────────────────────────────────────
      if (path === '/roster' && method === 'GET') {
        const { content } = await ghReadJSON(ROSTER_PATH, env);
        return json(content || { members: [], groupImage: null, martyImage: null });
      }
      if (path === '/roster' && method === 'PUT') {
        const body = await request.json();
        const { sha } = await ghReadJSON(ROSTER_PATH, env);
        body.updatedAt = new Date().toISOString();
        await ghWriteJSON(ROSTER_PATH, body, sha, `Roster updated${body._actorName ? ' by ' + body._actorName : ''}`, env);
        wait(writeLog({ actor: body._actor || 'unknown', actorName: body._actorName || 'Unknown',
          actorRole: body._actorRole || 'webmaster', action: 'ROSTER_UPDATED', detail: 'Board Members list updated', ip }, env));
        return json({ ok: true });
      }
      if (path === '/roster-image' && method === 'POST') {
        const body = await request.json();
        const id = String(body.id || '').replace(/[^a-z0-9_-]/gi, '');
        if (!id || !body.dataURL) return json({ error: 'id and dataURL required' }, 400);
        const mt = (body.dataURL.match(/^data:image\/([a-z0-9+]+)/i) || [null, 'png'])[1].toLowerCase();
        const ext = (mt === 'jpeg' || mt === 'jpg') ? 'jpg' : (mt === 'png' ? 'png' : mt === 'webp' ? 'webp' : mt === 'gif' ? 'gif' : 'png');
        const file = `${id}.${ext}`;
        const filePath = `${ROSTER_IMG_DIR}/${file}`;
        const existing = await ghFetch(filePath, 'GET', null, env);
        await ghWritePDF(filePath, body.dataURL, existing && existing.sha, `Roster image: ${file}`, env);
        return json({ ok: true, file });
      }
      if (path.startsWith('/roster-img/') && method === 'GET') {
        const file = (path.split('/')[2] || '').replace(/[^a-z0-9._-]/gi, '');
        return await serveImage(`${ROSTER_IMG_DIR}/${file}`, env);
      }

      // ── MILEAGE DISTANCE (Google Routes API proxy) ──────────────────────
      if (path === '/distance' && method === 'POST') {
        const { from, to } = await request.json();
        return await computeDistance(from, to, env);
      }

      // ── BOARD MEETINGS ──────────────────────────────────────────────────
      if (path === '/board-meetings' && method === 'GET')  return await listBoardMeetings(env);
      if (path === '/board-meetings' && method === 'POST') {
        const body = await request.json();
        const rec  = await createBoardMeeting(body, env);
        await writeLog({ actor: body._actor || 'unknown', actorName: body._actorName || 'Unknown',
          actorRole: body._actorRole || 'webmaster', action: 'BOARD_MEETING_CREATED',
          detail: `Board meeting ${fmtDay(rec.date)}${rec.label ? ' - ' + rec.label : ''}`, ip }, env);
        return json(rec, 201);
      }
      if (path.startsWith('/board-meetings/') && method === 'GET')
        return await getBoardMeeting(path.split('/')[2], env);
      if (path.startsWith('/board-meetings/') && method === 'PATCH') {
        const id = path.split('/')[2];
        return json(await updateBoardMeeting(id, await request.json(), env));
      }
      if (path.startsWith('/board-meetings/') && method === 'DELETE') {
        const id = path.split('/')[2];
        const out = await deleteBoardMeeting(id, env);
        await writeLog({ actor: 'unknown', actorName: 'Unknown', actorRole: 'webmaster',
          action: 'BOARD_MEETING_DELETED', detail: `Deleted board meeting ${id}`, ip }, env);
        return json(out);
      }

      // ── REIMBURSEMENTS ──────────────────────────────────────────────────
      if (path === '/reimbursements' && method === 'GET')  return await listReimbursements(env);
      if (path === '/reimbursements' && method === 'POST') {
        const created = await sendReimbursements(await request.json(), env, wait);
        return json(created, 201);
      }
      if (path.startsWith('/reimbursements/') && method === 'GET')
        return await getReimbursement(path.split('/')[2], env);
      if (path.startsWith('/reimbursements/') && method === 'PATCH') {
        const id = path.split('/')[2];
        const updated = await updateReimbursement(id, await request.json(), env, wait, ip);
        return json(updated);
      }

      // NEWSLETTER SUBMISSIONS
      if (path === '/submissions' && method === 'GET') return await listSubmissions(env);

      if (path === '/submissions' && method === 'POST') {
        const body   = await request.json();
        const result = await createSubmission(body, env);
        await writeLog({
          actor: body.ltgEmail, actorName: body.ltgName, actorRole: 'ltg', actorDiv: body.division,
          action: 'SUBMISSION_UPLOADED',
          detail: `${body.month} ${body.year} - ${body.type === 'newsletter' ? 'Division Newsletter' : 'DC Report'} - ${body.fileName}`,
          ip,
        }, env);
        // Email the editor that something new is waiting.
        wait(sendEmail(OFFICER_EMAILS.editor,
          `New ${typeLabel(body.type)} to review - Division ${body.division}`,
          emailNewSubmission(body), env));
        return result;
      }

      if (path.startsWith('/submissions/') && method === 'GET')
        return await getSubmission(path.split('/')[2], env);

      if (path.startsWith('/submissions/') && method === 'PATCH') {
        const id   = path.split('/')[2];
        const body = await request.json();

        if (body.deleted === true) {
          const result = await deleteSubmission(id, env);
          await writeLog({
            actor: body._logActor || 'unknown', actorName: body._logActorName || 'Unknown',
            actorRole: body._logActorRole || 'webmaster', actorDiv: body._logActorDiv || null,
            action: 'SUBMISSION_DELETED', detail: `Permanently deleted submission ${id}`, ip,
          }, env);
          return result;
        }

        const { response, content } = await updateSubmission(id, body, env);
        if (body.status && body._logActor) {
          const actionMap = {
            'pending-webmaster': 'EDITOR_APPROVED', 'approved': 'WEBMASTER_APPROVED', 'denied': 'SUBMISSION_RETURNED',
          };
          await writeLog({
            actor: body._logActor, actorName: body._logActorName, actorRole: body._logActorRole,
            actorDiv: body._logActorDiv || null, action: actionMap[body.status] || 'STATUS_UPDATED',
            detail: body._logDetail || `Status set to ${body.status}`, ip,
          }, env);
        }
        // Email side-effects on a status change.
        if (body.status && content) wait(notifyStatusChange(content, body, env));
        return response;
      }

      // DCM
      if (path === '/dcm' && method === 'GET') { const { content } = await ghReadJSON(DCM_PATH, env); return json(content || []); }
      if (path === '/dcm' && method === 'POST') {
        const body = await request.json();
        const { content, sha } = await ghReadJSON(DCM_PATH, env);
        const records = content || [];
        const id = `dcm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const now = new Date().toISOString();
        const newRec = { id, createdAt: now, updatedAt: now, reportStatus: 'pending', ...body };
        records.push(newRec);
        await ghWriteJSON(DCM_PATH, records, sha, `DCM scheduled: Div ${body.division} DCM ${body.dcmNumber}`, env);
        await writeLog({ actor: body.ltgEmail, actorName: body.ltgName, actorRole: 'ltg', actorDiv: body.division,
          action: 'DCM_SCHEDULED', detail: `DCM ${body.dcmNumber} scheduled for ${body.date} (${body.format})`, ip }, env);
        return json(newRec, 201);
      }
      if (path.startsWith('/dcm/') && method === 'GET') {
        const { content } = await ghReadJSON(DCM_PATH, env);
        const rec = (content || []).find(d => d.id === path.split('/')[2]);
        return rec ? json(rec) : json({ error: 'Not found' }, 404);
      }
      if (path.startsWith('/dcm/') && method === 'PATCH') {
        const id = path.split('/')[2];
        const body = await request.json();
        const { content, sha } = await ghReadJSON(DCM_PATH, env);
        const records = content || [];
        const idx = records.findIndex(d => d.id === id);
        if (idx === -1) return json({ error: 'Not found' }, 404);
        const now = new Date().toISOString();
        if (body.pdfData) {
          await ghWritePDF(`${DCM_PDF_PATH}/${id}.pdf`, body.pdfData, null, `DCM report PDF: ${id}`, env);
          delete body.pdfData; body.pdfUrl = `/dcm-pdf/${id}`; body.reportSubmittedAt = now; body.reportStatus = 'submitted';
        }
        records[idx] = { ...records[idx], ...body, updatedAt: now };
        await ghWriteJSON(DCM_PATH, records, sha, `DCM updated: ${id}`, env);
        if (body.reportStatus === 'submitted' && body._logActor) {
          await writeLog({ actor: body._logActor, actorName: body._logActorName, actorRole: body._logActorRole || 'ltg',
            actorDiv: body._logActorDiv || null, action: 'DCM_REPORT_SUBMITTED', detail: body._logDetail || `DCM report filed for ${id}`, ip }, env);
        }
        return json(records[idx]);
      }

      // MRF
      if (path === '/mrf' && method === 'GET') { const { content } = await ghReadJSON(MRF_PATH, env); return json(content || []); }
      if (path === '/mrf' && method === 'POST') {
        const body = await request.json();
        const { content, sha } = await ghReadJSON(MRF_PATH, env);
        const records = content || [];
        const id = `mrf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const now = new Date().toISOString();
        records.push({ id, submittedAt: now, updatedAt: now, ...body });
        await ghWriteJSON(MRF_PATH, records, sha, `MRF: Div ${body.division} ${body.month} ${body.calYear || ''}`, env);
        await writeLog({ actor: body.ltgEmail, actorName: body.ltgName, actorRole: 'ltg', actorDiv: body.division,
          action: 'MRF_SUBMITTED', detail: `Monthly Report Form - ${body.month} ${body.calYear || ''}`, ip }, env);
        return json({ id, submittedAt: now, updatedAt: now, ...body }, 201);
      }
      if (path.startsWith('/mrf/') && method === 'GET') {
        const { content } = await ghReadJSON(MRF_PATH, env);
        const rec = (content || []).find(m => m.id === path.split('/')[2]);
        return rec ? json(rec) : json({ error: 'Not found' }, 404);
      }

      // COMMITTEE
      if (path === '/committee' && method === 'GET') { const { content } = await ghReadJSON(COMMITTEE_PATH, env); return json(content || []); }
      if (path === '/committee' && method === 'POST') {
        const body = await request.json();
        const { content, sha } = await ghReadJSON(COMMITTEE_PATH, env);
        const records = content || [];
        const id = `com-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const now = new Date().toISOString();
        if (body.pdfData) {
          await ghWritePDF(`${COMMITTEE_PDF_PATH}/${id}.pdf`, body.pdfData, null, `Committee report PDF: ${id}`, env);
          delete body.pdfData; body.pdfUrl = `/committee-pdf/${id}`;
        }
        records.push({ id, submittedAt: now, updatedAt: now, ...body });
        await ghWriteJSON(COMMITTEE_PATH, records, sha, `Committee report: ${body.submitterName} ${body.month} ${body.year}`, env);
        await writeLog({ actor: body.submitterEmail, actorName: body.submitterName, actorRole: body.submitterRole || 'ltg',
          actorDiv: body.division || null, action: 'COMMITTEE_SUBMITTED',
          detail: `Committee report - ${body.committeeName} - ${body.month} ${body.year}`, ip }, env);
        return json({ id, submittedAt: now, updatedAt: now, ...body }, 201);
      }
      if (path.startsWith('/committee/') && method === 'GET') {
        const { content } = await ghReadJSON(COMMITTEE_PATH, env);
        const rec = (content || []).find(c => c.id === path.split('/')[2]);
        return rec ? json(rec) : json({ error: 'Not found' }, 404);
      }

      return json({ error: 'Not found' }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: err.message }, 500);
    }
  },

  // Daily scheduled run — deadline reminders. Add a Cron Trigger (0 14 * * *).
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReminders(env));
  },
};

/* ════════════════════════ EMAIL ═══════════════════════════════════════ */
function typeLabel(t) { return t === 'newsletter' ? 'newsletter' : 'DC report'; }

async function sendEmail(to, subject, html, env) {
  if (!env || !env.RESEND_API_KEY) return;      // email not configured yet -> no-op
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!recipients.length) return;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to: recipients, reply_to: EMAIL_REPLY, subject, html }),
    });
    if (!res.ok) console.error('Resend error', res.status, await res.text().catch(() => ''));
  } catch (e) { console.error('sendEmail failed:', e.message); }
}

function emailShell(heading, bodyHtml, cta) {
  const btn = cta ? `<tr><td style="padding:8px 0 4px;">
      <a href="${cta.url}" style="display:inline-block;background:#C8962A;color:#0B1B33;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;">${cta.text}</a>
    </td></tr>` : '';
  return `<!doctype html><html><body style="margin:0;background:#F6F7FB;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#16233B;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F7FB;padding:24px 12px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #E5E8EF;border-radius:16px;overflow:hidden;">
      <tr><td style="background:linear-gradient(135deg,#0C1E38,#0B1B33);padding:20px 26px;">
        <div style="color:#E8B84B;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">MO-ARK Key Club</div>
        <div style="color:#fff;font-size:13px;">Officer Portal</div>
      </td></tr>
      <tr><td style="padding:26px 26px 8px;">
        <h1 style="margin:0 0 12px;font-size:20px;color:#0B1B33;">${heading}</h1>
        <div style="font-size:15px;line-height:1.6;color:#333;">${bodyHtml}</div>
      </td></tr>
      <tr><td style="padding:8px 26px 26px;"><table role="presentation" cellpadding="0" cellspacing="0">${btn}</table></td></tr>
      <tr><td style="padding:16px 26px;background:#F6F7FB;border-top:1px solid #EEF0F5;font-size:12px;color:#98A2B3;">
        You're receiving this because you're an MO-ARK District officer. Manage submissions at
        <a href="${PORTAL_URL}" style="color:#1E50A0;">dcc.moarkkeyclub.com</a>.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function emailNewSubmission(b) {
  return emailShell(`New ${typeLabel(b.type)} to review`,
    `<p><b>Division ${esc(b.division)}</b> (${esc(b.ltgName)}) submitted their <b>${esc(b.month)} ${esc(b.year)}</b> ${typeLabel(b.type)}.</p>
     <p>It's waiting in your review queue.</p>`,
    { text: 'Open review queue', url: `${PORTAL_URL}/review.html` });
}
function emailReturned(s, comment) {
  return emailShell(`Your ${s.month} ${typeLabel(s.type)} needs revision`,
    `<p>Your <b>${esc(s.month)} ${esc(s.year)}</b> ${typeLabel(s.type)} was returned for revision.</p>
     ${comment ? `<p style="margin:14px 0;padding:12px 14px;background:#F8F5EE;border-left:3px solid #C8962A;border-radius:6px;font-style:italic;">${esc(comment)}</p>` : ''}
     <p>Make the changes and resubmit from the portal.</p>`,
    { text: 'Fix and resubmit', url: `${PORTAL_URL}/newsletter.html` });
}
function emailApproved(s) {
  return emailShell(`Your ${s.month} ${typeLabel(s.type)} was approved 🎉`,
    `<p>Great work — your <b>${esc(s.month)} ${esc(s.year)}</b> ${typeLabel(s.type)} has been approved and published.</p>`,
    { text: 'View in the archive', url: `${PORTAL_URL}/newsletter.html` });
}
function emailReadyFinal(s) {
  return emailShell(`A newsletter is ready for final approval`,
    `<p><b>Division ${esc(s.division)}</b>'s <b>${esc(s.month)} ${esc(s.year)}</b> ${typeLabel(s.type)} has been editor-approved and is waiting on your final approval.</p>`,
    { text: 'Review and publish', url: `${PORTAL_URL}/review.html` });
}
function emailDeadline(kind, month, days, dateStr) {
  const what = kind === 'nl' ? `${month} newsletter` : `${month} Monthly Report Form`;
  const url  = kind === 'nl' ? `${PORTAL_URL}/newsletter.html` : `${PORTAL_URL}/mrf.html`;
  return emailShell(`Reminder: ${what} due in ${days} day${days !== 1 ? 's' : ''}`,
    `<p>Your <b>${esc(what)}</b> is due <b>${esc(dateStr)}</b>.</p>
     <p>If you've already submitted, thank you — you can ignore this.</p>`,
    { text: kind === 'nl' ? 'Submit newsletter' : 'Submit MRF', url });
}

// Fired after a submission's status changes.
async function notifyStatusChange(content, body, env) {
  const ltg = LTG_EMAILS[content.division] || content.ltgEmail;   // prefer configured address
  if (content.status === 'denied') {
    const comment = body.threadMessage && body.threadMessage.message;
    await sendEmail(ltg, `Revision needed - ${content.month} ${typeLabel(content.type)}`, emailReturned(content, comment), env);
  } else if (content.status === 'approved') {
    await sendEmail(ltg, `Approved - ${content.month} ${typeLabel(content.type)}`, emailApproved(content), env);
  } else if (content.status === 'pending-webmaster') {
    await sendEmail(OFFICER_EMAILS.webmaster, `Ready for final approval - Division ${content.division}`, emailReadyFinal(content), env);
  }
}

/* ── REIMBURSEMENT EMAILS ─────────────────────────────────────────────── */
function meetingDatesText(r) {
  const a = fmtDay(r.boardMeetingDate);
  const b = r.boardMeetingEndDate ? ' – ' + fmtDay(r.boardMeetingEndDate) : '';
  return a + b;
}
function emailReimbRequest(r) {
  return emailShell(`Reimbursement form — immediate attention`,
    `<p>You've been sent a reimbursement form for the Key Club board meeting on <b>${esc(meetingDatesText(r))}</b>.</p>
     <p>Please fill it in as soon as you can — it takes just a couple of minutes. If you did not attend, the form lets you say so.</p>`,
    { text: 'Fill in your form now', url: `${PORTAL_URL}/reimbursement.html?rf=${r.id}` });
}
function emailReimbToTreasurer(r) {
  return emailShell(`New reimbursement to review — ${esc(r.officerName)}`,
    `<p><b>${esc(r.officerName)}</b> (${esc(r.officerTitle)}) submitted a reimbursement form for the board meeting on <b>${esc(meetingDatesText(r))}</b>.</p>
     <p>Open the console to review it, then approve or deny.</p>`,
    { text: 'Open Board Meetings console', url: `${PORTAL_URL}/console.html` });
}
function emailReimbToAdult(r) {
  return emailShell(`Reimbursement ready for final approval — ${esc(r.officerName)}`,
    `<p><b>${esc(r.officerName)}</b> (${esc(r.officerTitle)}) has a reimbursement form ready for your final approval (board meeting ${esc(meetingDatesText(r))}).</p>
     <p>Open the console to review, sign, and approve — or reject it back for changes.</p>`,
    { text: 'Open Board Meetings console', url: `${PORTAL_URL}/console.html` });
}
function emailReimbDenied(r, comment, byLabel) {
  return emailShell(`Reimbursement form denied`,
    `<p>Your reimbursement form for the board meeting on <b>${esc(meetingDatesText(r))}</b> was <b>denied</b> by the ${esc(byLabel)}.</p>
     ${comment ? `<p style="margin:14px 0;padding:12px 14px;background:#FDECEC;border-left:3px solid #C0392B;border-radius:6px;"><b>Reason:</b> ${esc(comment)}</p>` : ''}
     <p>Please review the comment, make the corrections, and resubmit.</p>`,
    { text: 'Resubmit your form', url: `${PORTAL_URL}/reimbursement.html?rf=${r.id}` });
}
function emailReimbFinalApproved(r) {
  return emailShell(`Reimbursement approved ✓`,
    `<p>Your reimbursement form for the board meeting on <b>${esc(meetingDatesText(r))}</b> has been approved by the adult treasurer and filed. Thank you!</p>`,
    { text: 'View the portal', url: `${PORTAL_URL}/dashboard.html` });
}

/* ════════════════════ MILEAGE DISTANCE (Google Routes API) ════════════ */
async function computeDistance(from, to, env) {
  if (!from || !to) return json({ error: 'from and to are required', miles: null }, 400);
  if (!env || !env.GOOGLE_MAPS_API_KEY) return json({ miles: null, meters: null, configured: false });
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'routes.distanceMeters',
      },
      body: JSON.stringify({
        origin:      { address: String(from) },
        destination: { address: String(to) },
        travelMode:  'DRIVE',
        units:       'IMPERIAL',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json({ miles: null, meters: null, configured: true, error: data.error?.message || `Routes API ${res.status}` }, 200);
    const meters = data?.routes?.[0]?.distanceMeters;
    if (meters == null) return json({ miles: null, meters: null, configured: true, error: 'No route found' });
    return json({ meters, miles: Math.round((meters / 1609.344) * 10) / 10, configured: true });
  } catch (e) {
    return json({ miles: null, meters: null, configured: true, error: e.message }, 200);
  }
}

/* ════════════════════ BOARD MEETINGS (per-file storage) ═══════════════
 * Each meeting is stored as data/board-meetings/<id>.json — pushing a
 * stale aggregate file cannot wipe them, and one-off record loss is now
 * limited to that single file. On first read the old aggregate is
 * back-filled into per-file records automatically. */
async function listBoardMeetings(env) {
  const list = await readAllRecords(BOARD_MEETINGS_DIR, BOARD_MEETINGS_PATH_LEGACY, env);
  list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return json(list);
}
async function getBoardMeeting(id, env) {
  const rec = await readOneRecord(BOARD_MEETINGS_DIR, id, BOARD_MEETINGS_PATH_LEGACY, env);
  return rec ? json(rec) : json({ error: 'Not found' }, 404);
}
async function createBoardMeeting(body, env) {
  const id  = `bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const rec = {
    id,
    date: body.date || '',
    endDate: body.endDate || null,
    label: body.label || '',
    createdAt: now, updatedAt: now,
    attendance: { frozen: false, savedAt: null, present: [] },
    reimb: { sent: false, sentAt: null },
  };
  await ghWriteJSON(`${BOARD_MEETINGS_DIR}/${id}.json`, rec, null, `Board meeting created: ${rec.date}`, env);
  return rec;
}
async function updateBoardMeeting(id, body, env) {
  const filePath = `${BOARD_MEETINGS_DIR}/${id}.json`;
  const read     = await ghReadJSON(filePath, env);
  let rec = read.content, sha = read.sha;
  // Back-fill from legacy aggregate if this per-file record hasn't been created yet.
  if (!rec) {
    rec = await legacyFindOne(BOARD_MEETINGS_PATH_LEGACY, id, env);
    if (!rec) return { error: 'Not found' };
    sha = null;
  }
  const now = new Date().toISOString();
  if (body.date !== undefined)       rec.date = body.date;
  if (body.endDate !== undefined)    rec.endDate = body.endDate;
  if (body.label !== undefined)      rec.label = body.label;
  if (body.attendance !== undefined) rec.attendance = { ...rec.attendance, ...body.attendance };
  if (body.reimb !== undefined)      rec.reimb = { ...rec.reimb, ...body.reimb };
  rec.updatedAt = now;
  await ghWriteJSON(filePath, rec, sha, `Board meeting updated: ${id}`, env);
  return rec;
}
async function deleteBoardMeeting(id, env) {
  const filePath = `${BOARD_MEETINGS_DIR}/${id}.json`;
  const existing = await ghFetch(filePath, 'GET', null, env);
  if (existing && existing.sha) {
    await ghDelete(filePath, existing.sha, `Board meeting deleted: ${id}`, env);
  }
  // Remove its reimbursements EXCEPT ones already archived (keep them forever).
  const reimb = await readAllRecords(REIMBURSEMENTS_DIR, REIMBURSEMENTS_PATH_LEGACY, env);
  for (const r of reimb) {
    if (r.boardMeetingId === id && r.status !== 'archived') {
      const rf = `${REIMBURSEMENTS_DIR}/${r.id}.json`;
      const meta = await ghFetch(rf, 'GET', null, env);
      if (meta && meta.sha) await ghDelete(rf, meta.sha, `Removed reimbursement for deleted meeting ${id}`, env);
    }
  }
  return { ok: true };
}

/* ════════════════════ REIMBURSEMENTS (per-file storage) ═══════════════
 * One record = one file: data/reimbursements/<id>.json.
 * Archived records also keep their filled PDF at reimbursement-pdfs/<id>.pdf.
 * A stale local push cannot overwrite the whole set anymore — the worst
 * that can happen is a single record for a single officer. Legacy
 * aggregate file is still readable so nothing already stored is lost. */
async function listReimbursements(env) {
  const list = await readAllRecords(REIMBURSEMENTS_DIR, REIMBURSEMENTS_PATH_LEGACY, env);
  return json(list);
}
async function getReimbursement(id, env) {
  const rec = await readOneRecord(REIMBURSEMENTS_DIR, id, REIMBURSEMENTS_PATH_LEGACY, env);
  return rec ? json(rec) : json({ error: 'Not found' }, 404);
}

/* Body: { boardMeetingId, boardMeetingDate, boardMeetingEndDate, boardMeetingLabel,
 *         treasurerAttending, treasurerEmailKey,
 *         recipients: [{ email, name, title, role, division, contactEmail }],
 *         _actor, _actorName, _actorRole } */
async function sendReimbursements(body, env, wait) {
  // Read the full set once (per-file + legacy) so we can dedupe.
  const list = await readAllRecords(REIMBURSEMENTS_DIR, REIMBURSEMENTS_PATH_LEGACY, env);
  const now = new Date().toISOString();
  const created = [];

  for (const p of (body.recipients || [])) {
    // Don't duplicate: one active record per (meeting, officer).
    const dupe = list.find(r => r.boardMeetingId === body.boardMeetingId &&
      (r.officerEmail || '').toLowerCase() === (p.email || '').toLowerCase());
    if (dupe) continue;

    const routeToTreasurer = !!body.treasurerAttending &&
      (p.email || '').toLowerCase() !== (body.treasurerEmailKey || '').toLowerCase();

    const rec = {
      id: `rf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      boardMeetingId: body.boardMeetingId,
      boardMeetingDate: body.boardMeetingDate || '',
      boardMeetingEndDate: body.boardMeetingEndDate || null,
      boardMeetingLabel: body.boardMeetingLabel || '',
      officerEmail: p.email,
      officerName: p.name,
      officerTitle: p.title || '',
      officerRole: p.role || '',
      officerDivision: p.division || null,
      contactEmail: p.contactEmail || (String(p.email).includes('@') ? p.email : null),
      status: 'sent',
      routeToTreasurer,
      attendedAnswer: null,
      form: null,
      pdfUrl: null,
      submittedAt: null,
      treasurer: { decision: null, comment: '', at: null, by: '' },
      adult: { decision: null, comment: '', signature: '', at: null, by: '' },
      createdAt: now, updatedAt: now,
      history: [{ at: now, event: 'sent', by: body._actorName || '' }],
    };
    await ghWriteJSON(`${REIMBURSEMENTS_DIR}/${rec.id}.json`, rec, null, `Reimbursement sent: ${rec.officerName} for ${body.boardMeetingId}`, env);
    created.push(rec);
    if (rec.contactEmail) wait(sendEmail(rec.contactEmail, 'Reimbursement form — immediate attention', emailReimbRequest(rec), env));
  }

  // Mark the meeting as "sent".
  if (created.length && body.boardMeetingId) {
    try { await updateBoardMeeting(body.boardMeetingId, { reimb: { sent: true, sentAt: now } }, env); } catch (_) {}
  }
  if (created.length) {
    wait(writeLog({ actor: body._actor || 'unknown', actorName: body._actorName || 'Unknown',
      actorRole: body._actorRole || 'webmaster', action: 'REIMB_SENT',
      detail: `Sent reimbursement form to ${created.length} member(s) for board meeting ${fmtDay(body.boardMeetingDate)}` }, env));
  }
  return created;
}

/* Body variants:
 *  { action:'submit', form, pdfData }        pdfData optional: filled-PDF base64
 *  { action:'not-attended', _actor }
 *  { action:'treasurer', decision:'approved'|'denied', comment, by }
 *  { action:'adult', decision:'approved'|'rejected', comment, signature, by, pdfData }
 *  { action:'resend', by } */
async function updateReimbursement(id, body, env, wait, ip) {
  const filePath = `${REIMBURSEMENTS_DIR}/${id}.json`;
  const read     = await ghReadJSON(filePath, env);
  let rec = read.content, sha = read.sha;
  if (!rec) {
    // Fall back to legacy aggregate; write forward as its own file.
    rec = await legacyFindOne(REIMBURSEMENTS_PATH_LEGACY, id, env);
    if (!rec) return { error: 'Not found' };
    sha = null;
  }
  const now = new Date().toISOString();
  if (!Array.isArray(rec.history)) rec.history = [];

  if (body.action === 'submit') {
    rec.form = body.form || {};
    rec.attendedAnswer = true;
    rec.submittedAt = now;
    rec.status = rec.routeToTreasurer ? 'pending-treasurer' : 'pending-adult';
    rec.history.push({ at: now, event: 'submitted', by: rec.officerName });
    // Snapshot the filled PDF (unsigned) alongside the record.
    if (body.pdfData) {
      try {
        await ghWritePDF(`${REIMB_PDF_PATH}/${id}.pdf`, body.pdfData, null, `Reimbursement PDF: ${rec.officerName}`, env);
        rec.pdfUrl = `/reimb-pdf/${id}`;
      } catch (e) { console.error('reimb pdf write failed:', e.message); }
    }
    if (rec.status === 'pending-treasurer') wait(sendEmail(TREASURER_EMAIL, `New reimbursement to review — ${rec.officerName}`, emailReimbToTreasurer(rec), env));
    else                                    wait(sendEmail(ADULT_TREASURER_EMAIL, `Reimbursement ready for final approval — ${rec.officerName}`, emailReimbToAdult(rec), env));
    wait(writeLog({ actor: rec.officerEmail, actorName: rec.officerName, actorRole: rec.officerRole, actorDiv: rec.officerDivision,
      action: 'REIMB_SUBMITTED', detail: `Reimbursement submitted for board meeting ${fmtDay(rec.boardMeetingDate)}`, ip }, env));

  } else if (body.action === 'not-attended') {
    rec.attendedAnswer = false;
    rec.status = 'not-attended';
    rec.history.push({ at: now, event: 'not-attended', by: rec.officerName });
    wait(writeLog({ actor: rec.officerEmail, actorName: rec.officerName, actorRole: rec.officerRole, actorDiv: rec.officerDivision,
      action: 'REIMB_NOT_ATTENDED', detail: `Marked "did not attend" for board meeting ${fmtDay(rec.boardMeetingDate)}`, ip }, env));

  } else if (body.action === 'attended-no-reimb') {
    // Officer was PRESENT but is not filing for reimbursement (didn't drive
    // themselves, or has no expenses to claim). Terminal state — no form,
    // no approval chain, but they're recorded as attending.
    rec.attendedAnswer = true;
    rec.didNotDrive = true;
    rec.status = 'no-reimb';
    rec.history.push({ at: now, event: 'attended-no-reimb', by: rec.officerName });
    wait(writeLog({ actor: rec.officerEmail, actorName: rec.officerName, actorRole: rec.officerRole, actorDiv: rec.officerDivision,
      action: 'REIMB_ATTENDED_NO_DRIVE', detail: `Marked "attended, no reimbursement" for board meeting ${fmtDay(rec.boardMeetingDate)}`, ip }, env));

  } else if (body.action === 'treasurer') {
    rec.treasurer = { decision: body.decision, comment: body.comment || '', at: now, by: body.by || 'Treasurer' };
    if (body.decision === 'approved') {
      rec.status = 'pending-adult';
      rec.history.push({ at: now, event: 'treasurer-approved', by: body.by || 'Treasurer' });
      wait(sendEmail(ADULT_TREASURER_EMAIL, `Reimbursement ready for final approval — ${rec.officerName}`, emailReimbToAdult(rec), env));
    } else {
      rec.status = 'treasurer-denied';
      rec.history.push({ at: now, event: 'treasurer-denied', by: body.by || 'Treasurer', note: body.comment || '' });
      if (rec.contactEmail) wait(sendEmail(rec.contactEmail, 'Reimbursement form denied', emailReimbDenied(rec, body.comment, 'treasurer'), env));
    }
    wait(writeLog({ actor: TREASURER_EMAIL, actorName: body.by || 'Treasurer', actorRole: 'treasurer',
      action: body.decision === 'approved' ? 'REIMB_TREASURER_APPROVED' : 'REIMB_TREASURER_DENIED',
      detail: `${body.decision === 'approved' ? 'Approved' : 'Denied'} ${rec.officerName}'s reimbursement (${fmtDay(rec.boardMeetingDate)})${body.comment ? ' - ' + body.comment : ''}`, ip }, env));

  } else if (body.action === 'adult') {
    rec.adult = { decision: body.decision, comment: body.comment || '', signature: body.signature || '', at: now, by: body.by || 'James Sturch' };
    if (body.decision === 'approved') {
      rec.status = 'archived';
      rec.archivedAt = now;
      rec.history.push({ at: now, event: 'adult-approved', by: body.by || 'James Sturch' });
      if (body.pdfData) {
        try {
          // Overwrite with signed copy.
          const existing = await ghFetch(`${REIMB_PDF_PATH}/${id}.pdf`, 'GET', null, env);
          const existingSha = existing && existing.sha ? existing.sha : null;
          await ghWritePDF(`${REIMB_PDF_PATH}/${id}.pdf`, body.pdfData, existingSha, `Signed reimbursement PDF: ${rec.officerName}`, env);
          rec.pdfUrl = `/reimb-pdf/${id}`;
        } catch (e) { console.error('signed reimb pdf write failed:', e.message); }
      }
      if (rec.contactEmail) wait(sendEmail(rec.contactEmail, 'Reimbursement approved ✓', emailReimbFinalApproved(rec), env));
    } else {
      rec.status = 'adult-rejected';
      rec.history.push({ at: now, event: 'adult-rejected', by: body.by || 'James Sturch', note: body.comment || '' });
      if (rec.contactEmail) wait(sendEmail(rec.contactEmail, 'Reimbursement form denied', emailReimbDenied(rec, body.comment, 'adult treasurer'), env));
    }
    wait(writeLog({ actor: ADULT_TREASURER_EMAIL, actorName: body.by || 'James Sturch', actorRole: 'adult-treasurer',
      action: body.decision === 'approved' ? 'REIMB_ADULT_APPROVED' : 'REIMB_ADULT_REJECTED',
      detail: `${body.decision === 'approved' ? 'Approved & archived' : 'Rejected'} ${rec.officerName}'s reimbursement (${fmtDay(rec.boardMeetingDate)})${body.comment ? ' - ' + body.comment : ''}`, ip }, env));

  } else if (body.action === 'resend') {
    rec.status = 'sent';
    rec.history.push({ at: now, event: 'resent', by: body.by || '' });
    if (rec.contactEmail) wait(sendEmail(rec.contactEmail, 'Reimbursement form — immediate attention', emailReimbRequest(rec), env));
    wait(writeLog({ actor: body.by || 'unknown', actorName: body.by || 'Unknown', actorRole: 'webmaster',
      action: 'REIMB_RESENT', detail: `Re-sent reimbursement form to ${rec.officerName} (${fmtDay(rec.boardMeetingDate)})`, ip }, env));
  }

  rec.updatedAt = now;
  await ghWriteJSON(filePath, rec, sha, `Reimbursement ${body.action}: ${id}`, env);
  return rec;
}

function fmtDay(d) {
  if (!d) return '';
  try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch (_) { return String(d); }
}

/* ════════════════════ DEADLINE REMINDERS (cron) ═══════════════════════ */
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const NL_MONTHNUMS = new Set([8, 9, 10, 11, 0, 1, 2]); // Sep..Mar

function academicYear(d) { const y = d.getUTCFullYear(); return d.getUTCMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`; }
function nextNewsletterDeadline(now) {
  for (let i = 0; i < 13; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 10, 23, 59, 59));
    if (NL_MONTHNUMS.has(d.getUTCMonth()) && d >= now) return d;
  }
  return null;
}
function nextMRFDeadline(now) {
  let d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 30, 23, 59, 59));
  if (d < now) d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 30, 23, 59, 59));
  return d;
}
const daysBetween = (a, b) => Math.ceil((a - b) / 86400000);

async function runReminders(env) {
  if (!env.RESEND_API_KEY) return;
  const now = new Date();

  const nl = nextNewsletterDeadline(now);
  if (nl) {
    const days = daysBetween(nl, now);
    if (days === 3 || days === 1) {
      const month = MONTHS_FULL[nl.getUTCMonth()], yr = academicYear(nl);
      const dateStr = nl.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
      const subs = await listSubmissionsRaw(env);
      const done = new Set(subs.filter(s => s.type === 'newsletter' && s.month === month && s.year === yr && !s.deleted).map(s => s.division));
      for (let div = 1; div <= 10; div++) {
        const to = LTG_EMAILS[div];
        if (to && !done.has(div)) await sendEmail(to, `Reminder: ${month} newsletter due in ${days} day${days !== 1 ? 's' : ''}`, emailDeadline('nl', month, days, dateStr), env);
      }
    }
  }

  const mrf = nextMRFDeadline(now);
  if (mrf) {
    const days = daysBetween(mrf, now);
    if (days === 3 || days === 1) {
      const month = MONTHS_FULL[mrf.getUTCMonth()];
      const dateStr = mrf.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
      const { content } = await ghReadJSON(MRF_PATH, env);
      const mrfs = content || [];
      const done = new Set(mrfs.filter(m => m.month === month).map(m => m.division));
      for (let div = 1; div <= 10; div++) {
        const to = LTG_EMAILS[div];
        if (to && !done.has(div)) await sendEmail(to, `Reminder: ${month} MRF due in ${days} day${days !== 1 ? 's' : ''}`, emailDeadline('mrf', month, days, dateStr), env);
      }
    }
  }
}

async function listSubmissionsRaw(env) {
  const files = await ghList(env);
  const subs = await Promise.all(files.map(async f => (await ghReadJSON(f.path, env)).content));
  return subs.filter(Boolean);
}

/* ════════════════════════ AUDIT LOG ═══════════════════════════════════ */
async function writeLog(entry, env) {
  const now = new Date();
  const log = {
    id: `log-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: now.toISOString(),
    actor: entry.actor || 'unknown', actorName: entry.actorName || 'Unknown', actorRole: entry.actorRole || 'unknown',
    actorDiv: entry.actorDiv || null, action: entry.action || 'UNKNOWN', detail: entry.detail || '', ip: entry.ip || 'unknown',
  };
  try {
    const existing = await ghFetch(AUDIT_LOG_PATH, 'GET', null, env);
    let entries = [], sha = null;
    if (existing) { sha = existing.sha; try { entries = JSON.parse(decodeURIComponent(atob(existing.content.replace(/\n/g, '')))); } catch { entries = []; } }
    entries.push(log);
    if (entries.length > 2000) entries = entries.slice(-2000);
    const body = { message: `Log: ${log.action} by ${log.actorName}`, content: btoa(encodeURIComponent(JSON.stringify(entries))), branch: GITHUB_BRANCH };
    if (sha) body.sha = sha;
    await ghFetch(AUDIT_LOG_PATH, 'PUT', body, env);
  } catch (e) { console.error('Log write failed:', e.message); }
  return log;
}
async function getLogs(env) {
  try {
    const existing = await ghFetch(AUDIT_LOG_PATH, 'GET', null, env);
    if (!existing) return json([]);
    return json([...JSON.parse(decodeURIComponent(atob(existing.content.replace(/\n/g, ''))))].reverse());
  } catch (e) { console.error('getLogs failed:', e.message); return json([]); }
}

/* ════════════════════════ GITHUB HELPERS ══════════════════════════════ */
async function ghFetch(path, method, body, env) {
  const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${path}` + (method === 'GET' ? `?ref=${GITHUB_BRANCH}` : '');
  const opts = { method, headers: {
    'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'moark-portal-worker', 'Content-Type': 'application/json',
  } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok && res.status !== 404) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  if (res.status === 404) return null;
  return res.json();
}
async function ghReadJSON(filePath, env) {
  const data = await ghFetch(filePath, 'GET', null, env);
  if (!data) return { content: null, sha: null };
  try {
    if (data.content && data.content.trim().length) {
      return { content: JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\s+/g, ''))))), sha: data.sha };
    }
    if (data.download_url) { const raw = await fetch(data.download_url); if (raw.ok) return { content: JSON.parse(await raw.text()), sha: data.sha }; }
    return { content: null, sha: data.sha };
  } catch { return { content: null, sha: data.sha }; }
}
async function ghWriteJSON(filePath, content, sha, message, env) {
  const body = { message, content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))), branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;
  return ghFetch(filePath, 'PUT', body, env);
}
async function ghWritePDF(filePath, dataURL, sha, message, env) {
  const clean = (dataURL.includes(',') ? dataURL.split(',')[1] : dataURL).replace(/\s+/g, '');
  if (!clean) throw new Error('PDF base64 is empty');
  const body = { message, content: clean, branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;
  return ghFetch(filePath, 'PUT', body, env);
}
async function ghDelete(filePath, sha, message, env) { return ghFetch(filePath, 'DELETE', { message, sha, branch: GITHUB_BRANCH }, env); }
async function ghList(env) {
  const data = await ghFetch(DATA_PATH, 'GET', null, env);
  return (data && Array.isArray(data)) ? data.filter(f => f.name.endsWith('.json')) : [];
}
// List .json files in any directory (returns [{ name, path, sha }, ...] or []).
async function ghListDir(dirPath, env) {
  const data = await ghFetch(dirPath, 'GET', null, env);
  return (data && Array.isArray(data)) ? data.filter(f => f.name.endsWith('.json')) : [];
}

/* ── PER-FILE RECORD HELPERS ───────────────────────────────────────────
 * Read every record from a per-file folder (data/reimbursements/*.json,
 * data/board-meetings/*.json). If the folder is empty or missing, the
 * legacy aggregate JSON file is used as a fallback so existing records
 * remain visible during the transition. */
async function readAllRecords(dirPath, legacyPath, env) {
  const files = await ghListDir(dirPath, env);
  if (files.length) {
    const records = await Promise.all(files.map(async f => (await ghReadJSON(f.path, env)).content));
    return records.filter(Boolean);
  }
  // Nothing (yet) in per-file storage — read the legacy aggregate.
  const { content } = await ghReadJSON(legacyPath, env);
  return Array.isArray(content) ? content : [];
}
// Read one record by id, per-file first then legacy fallback.
async function readOneRecord(dirPath, id, legacyPath, env) {
  const perFile = await ghReadJSON(`${dirPath}/${id}.json`, env);
  if (perFile.content) return perFile.content;
  return await legacyFindOne(legacyPath, id, env);
}
async function legacyFindOne(legacyPath, id, env) {
  const { content } = await ghReadJSON(legacyPath, env);
  if (!Array.isArray(content)) return null;
  return content.find(r => r && r.id === id) || null;
}

/* FIXED PDF SERVING — raw media type works for files up to 100 MB. */
async function servePDF(filePath, env) {
  try {
    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`;
    const res = await fetch(url, { headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.raw',
      'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'moark-portal-worker',
    } });
    if (res.status === 404) return new Response('PDF not found', { status: 404, headers: CORS });
    if (!res.ok) return new Response(`Error fetching PDF: ${res.status} ${await res.text().catch(() => '')}`, { status: 500, headers: CORS });
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0) return new Response('PDF content is empty', { status: 500, headers: CORS });
    if (bytes.length < 4 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46)
      return new Response('Stored file is not a valid PDF', { status: 500, headers: CORS });
    return new Response(bytes, { status: 200, headers: {
      ...CORS, 'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filePath.split('/').pop()}"`,
      'Cache-Control': 'private, max-age=3600', 'Content-Length': bytes.length.toString(),
    } });
  } catch (e) { return new Response(`Error: ${e.message}`, { status: 500, headers: CORS }); }
}

/* ════════════════════════ SUBMISSIONS ═════════════════════════════════ */
async function listSubmissions(env) {
  const subs = await listSubmissionsRaw(env);
  return json(subs.filter(s => !s.deleted).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)));
}
async function getSubmission(id, env) {
  const { content } = await ghReadJSON(`${DATA_PATH}/${id}.json`, env);
  if (!content) return json({ error: 'Not found' }, 404);
  if (content.deleted) return json({ error: 'Submission has been deleted' }, 410);
  return json(content);
}
async function createSubmission(body, env) {
  const id = `moark-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  if (!body.fileData || !body.fileData.startsWith('data:')) throw new Error('Invalid or missing PDF data');
  await ghWritePDF(`${DATA_PATH}/${id}.pdf`, body.fileData, null, `PDF: Div ${body.division} ${body.month} ${body.year}`, env);
  const submission = {
    id, division: body.division, ltgEmail: body.ltgEmail, ltgName: body.ltgName, year: body.year, month: body.month,
    type: body.type, fileName: body.fileName, fileSize: body.fileSize, pdfUrl: `/pdf/${id}`, status: 'pending-editor',
    submittedAt: now, updatedAt: now, deleted: false,
    thread: body.initialNote ? [{ from: 'ltg', fromName: body.ltgName, to: 'editor', message: body.initialNote, timestamp: now }] : [],
  };
  await ghWriteJSON(`${DATA_PATH}/${id}.json`, submission, null, `Submit: Div ${body.division} ${body.month} ${body.year}`, env);
  return json(submission, 201);
}
async function updateSubmission(id, body, env) {
  const { content, sha } = await ghReadJSON(`${DATA_PATH}/${id}.json`, env);
  if (!content) return { response: json({ error: 'Not found' }, 404), content: null };
  if (content.deleted) return { response: json({ error: 'Submission has been deleted' }, 410), content: null };
  const now = new Date().toISOString();
  if (body.status) content.status = body.status;
  if (body.threadMessage) content.thread.push({ ...body.threadMessage, timestamp: now });
  content.updatedAt = now;
  await ghWriteJSON(`${DATA_PATH}/${id}.json`, content, sha, `Update: ${id} -> ${content.status}`, env);
  return { response: json(content), content };
}
async function deleteSubmission(id, env) {
  const { content, sha } = await ghReadJSON(`${DATA_PATH}/${id}.json`, env);
  if (!content) return json({ error: 'Not found' }, 404);
  content.deleted = true; content.deletedAt = new Date().toISOString();
  await ghWriteJSON(`${DATA_PATH}/${id}.json`, content, sha, `Delete: ${id}`, env);
  try {
    const pdfData = await ghFetch(`${DATA_PATH}/${id}.pdf`, 'GET', null, env);
    if (pdfData && pdfData.sha) await ghDelete(`${DATA_PATH}/${id}.pdf`, pdfData.sha, `Delete PDF: ${id}`, env);
  } catch (e) { console.error(`PDF deletion failed for ${id}:`, e.message); }
  return json({ ok: true, message: 'Submission deleted successfully' });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}


/* Serve a roster image from the repo with the right content-type (raw media type). */
async function serveImage(filePath, env) {
  try {
    const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`;
    const res = await fetch(url, { headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.raw',
      'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'moark-portal-worker',
    } });
    if (res.status === 404) return new Response('Image not found', { status: 404, headers: CORS });
    if (!res.ok) return new Response('Error fetching image', { status: 500, headers: CORS });
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ext = filePath.split('.').pop().toLowerCase();
    const ct = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    return new Response(bytes, { headers: { ...CORS, 'Content-Type': ct, 'Cache-Control': 'public, max-age=300' } });
  } catch (e) {
    return new Response('Image error: ' + e.message, { status: 500, headers: CORS });
  }
}

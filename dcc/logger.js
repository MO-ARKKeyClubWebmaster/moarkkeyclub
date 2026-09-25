/**
 * MO-ARK District Portal - Audit Logger
 * Drop this script into every portal page AFTER auth.js and api.js.
 * Call LOG.record(action, detail) anywhere to fire an audit entry.
 * The Worker captures the real IP server-side via CF-Connecting-IP.
 *
 * Actions:
 *   LOGIN, LOGOUT, CONSOLE_ACCESS
 *   SUBMISSION_UPLOADED, EDITOR_APPROVED, WEBMASTER_APPROVED, SUBMISSION_RETURNED
 *   ARCHIVE_VIEWED, PDF_VIEWED, STATUS_UPDATED
 *   DCM_SCHEDULED, DCM_REPORT_SUBMITTED, DCM_VIEWED
 *   MRF_SUBMITTED, MRF_VIEWED
 *   COMMITTEE_SUBMITTED, COMMITTEE_VIEWED
 */

const LOG = (() => {
  const BASE = 'https://moark-portal-api.moarkkeyclubwebmaster.workers.dev';

  async function record(action, detail = '') {
    try {
      const user = AUTH.getUser();
      if (!user) return;
      await fetch(`${BASE}/log`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor:     user.email,
          actorName: user.name,
          actorRole: user.role,
          actorDiv:  user.division || null,
          action,
          detail,
        }),
      });
    } catch (e) { /* silent */ }
  }

  function subDetail(sub) {
    return `Div ${sub.division} - ${sub.month} ${sub.year} - ${sub.type === 'newsletter' ? 'Newsletter' : 'DC Report'}`;
  }

  function dcmDetail(dcm) {
    return `Div ${dcm.division} - DCM #${dcm.dcmNumber} - ${dcm.date}`;
  }

  function mrfDetail(mrf) {
    return `Div ${mrf.division} - ${mrf.month} ${mrf.year}`;
  }

  function committeeDetail(rep) {
    return `${rep.submitterName} - ${rep.committeeName} - ${rep.month} ${rep.year}`;
  }

  return { record, subDetail, dcmDetail, mrfDetail, committeeDetail };
})();

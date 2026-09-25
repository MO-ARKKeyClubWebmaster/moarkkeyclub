/**
 * MO-ARK District Portal - Reimbursement form + PDF (shared module)
 * ===========================================================================
 * Loaded by:
 *   • reimbursement.html      - the standalone page the "Fill in your form"
 *                               email button links to.
 *   • portal.js (lazy)        - the non-dismissible "IMMEDIATE ATTENTION"
 *                               pop-up shown after login on any page.
 *   • console.html            - to render/open the filled PDF (View PDF) and
 *                               the archived (signed) PDF.
 *
 * Depends on: API (api.js), PORTAL (portal.js), and jsPDF (window.jspdf,
 * loaded from cdnjs) only when a PDF is actually built.
 *
 * The digital form mirrors the paper "MO-ARK Expense Reimbursement Form":
 * mileage is placed at the TOP (board-meeting mileage first, then club-visit
 * mileage) because that's what almost everyone files; the other expense lines
 * (postage, printing, ink, supplies, other) follow. Miles auto-calculate from
 * the addresses via the Worker's /distance proxy (Google Routes API) but every
 * miles box stays editable.
 * ===========================================================================
 */

const REIMB = (() => {
  const STATE_OFFICE = '333 S John Q Hammons Pkwy, Springfield, MO 65806';
  const RATE = 0.50;

  // ── DISTANCE CACHE ──────────────────────────────────────────────────
  // The /distance proxy hits the Google Routes API which costs money per
  // call. Every (from, to) result is cached in-memory for this page load
  // AND on localStorage so the SAME pair is never re-charged, and the
  // "run" function inside wireDistance below also short-circuits when the
  // two address fields haven't changed since the previous look-up.
  const _distMem = new Map();                          // key -> {miles, meters}
  const _lsKey   = k => 'moark_dist_' + k;
  const _norm    = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const _cacheKey = (from, to) => _norm(from) + '||' + _norm(to);

  async function distanceCached(from, to) {
    const key = _cacheKey(from, to);
    if (_distMem.has(key)) return _distMem.get(key);
    try {
      const raw = localStorage.getItem(_lsKey(key));
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && cached.miles != null) { _distMem.set(key, cached); return cached; }
      }
    } catch (_) {}
    const res = await API.distance(from, to);
    if (res && res.miles != null) {
      const store = { miles: res.miles, meters: res.meters, configured: true };
      _distMem.set(key, store);
      try { localStorage.setItem(_lsKey(key), JSON.stringify(store)); } catch (_) {}
    }
    return res;
  }

  const esc = s => (typeof PORTAL !== 'undefined' ? PORTAL.escapeHTML(s)
    : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])));
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const money = n => '$' + num(n).toFixed(2);
  const fmtDay = d => { if (!d) return ''; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}); } catch(_) { return String(d); } };

  function meetingDates(r) {
    const a = fmtDay(r.boardMeetingDate);
    return r.boardMeetingEndDate ? `${a} – ${fmtDay(r.boardMeetingEndDate)}` : a;
  }

  // ── FORM MARKUP ─────────────────────────────────────────────────────
  function formHTML(record) {
    const f = record.form || {};
    const bm = f.bm || {};
    const arr = bm.arrival || {}; const dep = bm.departure || {};
    const cv = f.clubVisits || [{},{},{},{}];
    const ex = f.expenses || {};
    const inCaps = 'style="text-transform:uppercase;"';
    const cvRows = [0,1,2,3].map(i => {
      const r = cv[i] || {};
      return `<tr>
        <td><input class="rf-in" id="rf_cv_from_${i}" value="${esc(r.from||'')}" placeholder="From address"></td>
        <td><input class="rf-in" id="rf_cv_to_${i}" value="${esc(r.to||'')}" placeholder="To address"></td>
        <td><input class="rf-in" id="rf_cv_purpose_${i}" value="${esc(r.purpose||'')}" placeholder="Purpose"></td>
        <td style="width:88px;"><input class="rf-in rf-miles" id="rf_cv_miles_${i}" value="${esc(r.miles||'')}" inputmode="decimal" placeholder="0"></td>
      </tr>`;
    }).join('');

    return `
    <div class="rf-form">
      <div class="rf-callout">
        <b>Mileage is at the top</b> because that's what most officers file. Enter your address and the
        distance fills in automatically — you can always adjust it. Scroll down for postage, printing and other expenses.
      </div>

      <!-- ══ BOARD MEETING MILEAGE (most common → first) ══ -->
      <div class="rf-section">
        <div class="rf-section-hd">🏛 Mileage — Board Meeting <span class="rf-tag">most officers</span></div>

        <div class="rf-leg">
          <div class="rf-leg-title">Arrival (home → meeting)</div>
          <div class="rf-grid2">
            <label>From (your address)
              <input class="rf-in rf-addr" id="rf_bm_arr_from" value="${esc(arr.from||'')}" placeholder="Street, City, State ZIP"></label>
            <label>To
              <input class="rf-in rf-addr" id="rf_bm_arr_to" value="${esc(arr.to!=null?arr.to:STATE_OFFICE)}"></label>
          </div>
          <div class="rf-grid2">
            <label>Miles <span class="rf-mini" id="rf_bm_arr_stat"></span>
              <input class="rf-in rf-miles" id="rf_bm_arr_miles" value="${esc(arr.miles||'')}" inputmode="decimal" placeholder="0"></label>
            <label>Comment (optional)
              <input class="rf-in" id="rf_bm_arr_comment" value="${esc(arr.comment||'')}"></label>
          </div>
        </div>

        <div class="rf-leg">
          <div class="rf-leg-title">Departure (meeting → home)</div>
          <div class="rf-grid2">
            <label>From
              <input class="rf-in rf-addr" id="rf_bm_dep_from" value="${esc(dep.from!=null?dep.from:STATE_OFFICE)}"></label>
            <label>To (your address)
              <input class="rf-in rf-addr" id="rf_bm_dep_to" value="${esc(dep.to||'')}" placeholder="auto-filled from arrival"></label>
          </div>
          <div class="rf-grid2">
            <label>Miles <span class="rf-mini" id="rf_bm_dep_stat"></span>
              <input class="rf-in rf-miles" id="rf_bm_dep_miles" value="${esc(dep.miles||'')}" inputmode="decimal" placeholder="0"></label>
            <label>Comment (optional)
              <input class="rf-in" id="rf_bm_dep_comment" value="${esc(dep.comment||'')}"></label>
          </div>
        </div>

        <div class="rf-total-row">
          <div><span>Total miles (both ways)</span><input class="rf-in rf-ro" id="rf_bm_total" readonly value="0"></div>
          <div><span>× $0.50</span><input class="rf-in rf-ro" id="rf_bm_cost" readonly value="$0.00"></div>
        </div>
      </div>

      <!-- ══ CLUB VISIT MILEAGE ══ -->
      <div class="rf-section">
        <div class="rf-section-hd">🚗 Mileage — Club Visits</div>
        <table class="rf-table">
          <thead><tr><th>From</th><th>To</th><th>Purpose</th><th>Miles</th></tr></thead>
          <tbody>${cvRows}</tbody>
        </table>
        <div class="rf-total-row">
          <div><span>Total miles</span><input class="rf-in rf-ro" id="rf_cv_total" readonly value="0"></div>
          <div><span>× $0.50</span><input class="rf-in rf-ro" id="rf_cv_cost" readonly value="$0.00"></div>
        </div>
      </div>

      <!-- ══ OTHER EXPENSES ══ -->
      <div class="rf-section">
        <div class="rf-section-hd">🧾 Other Expenses</div>
        <div class="rf-exp"><label>Postage</label><div class="rf-dollar"><span>$</span><input class="rf-in rf-money" id="rf_exp_postage" inputmode="decimal" value="${esc(ex.postage||'')}" placeholder="0.00"></div></div>
        <div class="rf-exp"><label>Printing &amp; Stationery</label><div class="rf-dollar"><span>$</span><input class="rf-in rf-money" id="rf_exp_printing" inputmode="decimal" value="${esc(ex.printing||'')}" placeholder="0.00"></div></div>
        <div class="rf-exp"><label>Ink Cartridge</label><div class="rf-dollar"><span>$</span><input class="rf-in rf-money" id="rf_exp_ink" inputmode="decimal" value="${esc(ex.ink||'')}" placeholder="0.00"></div></div>
        <div class="rf-exp"><label>Supplies</label><div class="rf-dollar"><span>$</span><input class="rf-in rf-money" id="rf_exp_supplies" inputmode="decimal" value="${esc(ex.supplies||'')}" placeholder="0.00"></div></div>
        <div class="rf-exp"><label>Other <input class="rf-in rf-otherlabel" id="rf_exp_otherlabel" value="${esc(ex.otherLabel||'')}" placeholder="specify"></label><div class="rf-dollar"><span>$</span><input class="rf-in rf-money" id="rf_exp_other" inputmode="decimal" value="${esc(ex.other||'')}" placeholder="0.00"></div></div>
      </div>

      <!-- ══ GRAND TOTAL ══ -->
      <div class="rf-grand">
        <span>★ Total reimbursement</span>
        <input class="rf-in rf-ro rf-grand-in" id="rf_grand_total" readonly value="$0.00">
      </div>

      <!-- ══ CERTIFY & SIGN ══ -->
      <div class="rf-section">
        <div class="rf-grid2">
          <label>Name (full caps)
            <input class="rf-in" id="rf_name" ${inCaps} value="${esc((f.name||record.officerName||'').toUpperCase())}"></label>
          <label>Office (full caps)
            <input class="rf-in" id="rf_office" ${inCaps} value="${esc((f.office||record.officerTitle||'').toUpperCase())}"></label>
        </div>
        <label class="rf-cert">
          <input type="checkbox" id="rf_cert" ${f.certified?'checked':''}>
          <span>I certify that the above items are truly Key Club expenses and that the amounts shown are accurate to the best of my knowledge.</span>
        </label>
        <label>Signature (full caps)
          <input class="rf-in" id="rf_sig" ${inCaps} value="${esc((f.signature||'').toUpperCase())}" placeholder="TYPE YOUR FULL NAME"></label>
      </div>

      <div class="rf-actions">
        <button class="rf-btn rf-btn-primary" id="rf_submit">Submit reimbursement form →</button>
      </div>
      <div class="rf-err" id="rf_err"></div>
    </div>`;
  }

  // ── STYLES (injected once) ──────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('reimb-styles')) return;
    const s = document.createElement('style');
    s.id = 'reimb-styles';
    s.textContent = `
    .rf-overlay{position:fixed;inset:0;z-index:9999;background:rgba(11,27,51,.72);backdrop-filter:blur(3px);display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto;}
    .rf-card{background:#fff;max-width:720px;width:100%;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.4);overflow:hidden;margin:auto;}
    .rf-head{background:linear-gradient(135deg,#7a1420,#a01523);color:#fff;padding:18px 24px;}
    .rf-head.calm{background:linear-gradient(135deg,#0C1E38,#0B1B33);}
    .rf-head .rf-eyebrow{font-size:11px;letter-spacing:1.6px;text-transform:uppercase;font-weight:800;opacity:.9;}
    .rf-head h2{margin:.15rem 0 0;font-size:20px;font-family:'DM Serif Display',Georgia,serif;}
    .rf-head p{margin:.35rem 0 0;font-size:13px;opacity:.9;}
    .rf-body{padding:22px 24px;font-family:'DM Sans',system-ui,sans-serif;color:#16233B;}
    .rf-callout{background:#F8F5EE;border:1px solid #ECD9AE;border-radius:10px;padding:11px 14px;font-size:13px;color:#5b4a26;margin-bottom:18px;line-height:1.5;}
    .rf-section{border:1px solid #E5E8EF;border-radius:12px;padding:14px 16px;margin-bottom:16px;}
    .rf-section-hd{font-weight:700;font-size:14px;color:#0B1B33;margin-bottom:12px;display:flex;align-items:center;gap:8px;}
    .rf-tag{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:#E8F0FF;color:#1E50A0;padding:2px 8px;border-radius:100px;}
    .rf-leg{background:#FAFBFD;border:1px solid #EEF1F6;border-radius:10px;padding:12px;margin-bottom:12px;}
    .rf-leg-title{font-weight:600;font-size:12.5px;color:#334;margin-bottom:8px;}
    .rf-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px;}
    .rf-form label{display:block;font-size:11.5px;font-weight:600;color:#667085;margin-bottom:4px;}
    .rf-in{width:100%;padding:.55rem .7rem;border:1.4px solid #E5E8EF;border-radius:8px;font-size:14px;font-family:inherit;color:#16233B;outline:none;background:#fff;}
    .rf-in:focus{border-color:#1E50A0;box-shadow:0 0 0 3px rgba(30,80,160,.12);}
    .rf-ro{background:#F1F3F8;color:#0B1B33;font-weight:700;}
    .rf-mini{font-weight:500;color:#1E50A0;font-size:10.5px;}
    .rf-total-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:6px;}
    .rf-total-row>div{display:flex;align-items:center;gap:8px;}
    .rf-total-row span{font-size:12px;font-weight:600;color:#334;white-space:nowrap;}
    .rf-total-row input{max-width:120px;}
    .rf-table{width:100%;border-collapse:collapse;font-size:13px;}
    .rf-table th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#667085;padding:4px 6px;}
    .rf-table td{padding:3px 4px;}
    .rf-table .rf-in{padding:.45rem .55rem;font-size:13px;}
    .rf-exp{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px dashed #EEF1F6;}
    .rf-exp label{margin:0;font-size:13.5px;font-weight:600;color:#16233B;display:flex;align-items:center;gap:8px;flex:1;}
    .rf-otherlabel{max-width:150px;}
    .rf-dollar{display:flex;align-items:center;gap:2px;}
    .rf-dollar span{color:#667085;font-weight:600;}
    .rf-money{max-width:110px;text-align:right;}
    .rf-grand{display:flex;align-items:center;justify-content:space-between;background:#0B1B33;color:#fff;border-radius:12px;padding:14px 18px;margin-bottom:16px;}
    .rf-grand span{font-weight:700;font-size:15px;}
    .rf-grand-in{max-width:150px;text-align:right;font-size:17px;background:#fff;color:#0B1B33;}
    .rf-cert{display:flex;gap:10px;align-items:flex-start;margin:14px 0;font-size:12.5px;color:#334;font-weight:500;line-height:1.5;}
    .rf-cert input{margin-top:3px;width:16px;height:16px;flex:none;}
    .rf-actions{margin-top:6px;}
    .rf-btn{padding:.8rem 1.4rem;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;}
    .rf-btn-primary{background:linear-gradient(135deg,#C8962A,#d8a63a);color:#0B1B33;width:100%;box-shadow:0 3px 12px rgba(200,150,42,.3);}
    .rf-btn-primary:disabled{opacity:.6;cursor:default;}
    .rf-btn-ghost{background:#EEF1F6;color:#0B1B33;}
    .rf-btn-danger{background:#fff;border:1.5px solid #E5E8EF;color:#9B1C1C;}
    .rf-err{color:#9B1C1C;font-size:13px;margin-top:10px;font-weight:600;}
    .rf-gate{padding:6px 0 4px;}
    .rf-gate p{font-size:15px;color:#16233B;line-height:1.6;margin-bottom:16px;}
    .rf-gate .rf-gate-row{display:flex;gap:12px;}
    .rf-deny-note{background:#FDECEC;border:1px solid #F3C0C0;border-left:4px solid #C0392B;border-radius:10px;padding:12px 14px;margin-bottom:16px;color:#7f1d1d;font-size:13.5px;line-height:1.5;}
    .rf-success{text-align:center;padding:26px 10px;}
    .rf-success .rf-check{width:58px;height:58px;border-radius:50%;background:#12643A;color:#fff;display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 14px;}
    .rf-success h3{font-size:19px;color:#0B1B33;margin-bottom:6px;font-family:'DM Serif Display',Georgia,serif;}
    .rf-success p{font-size:14px;color:#667085;}
    @media(max-width:560px){.rf-grid2,.rf-total-row{grid-template-columns:1fr;}}
    `;
    document.head.appendChild(s);
  }

  // ── WIRING: autofill, distance, totals, submit ──────────────────────
  function wireForm(root, record, onSubmitted) {
    const $ = id => root.querySelector('#' + id);

    function recompute() {
      const bmMiles = num($('rf_bm_arr_miles').value) + num($('rf_bm_dep_miles').value);
      $('rf_bm_total').value = (Math.round(bmMiles * 10) / 10).toString();
      const bmCost = bmMiles * RATE;
      $('rf_bm_cost').value = money(bmCost);

      let cvMiles = 0;
      for (let i = 0; i < 4; i++) cvMiles += num($(`rf_cv_miles_${i}`).value);
      $('rf_cv_total').value = (Math.round(cvMiles * 10) / 10).toString();
      const cvCost = cvMiles * RATE;
      $('rf_cv_cost').value = money(cvCost);

      const exp = num($('rf_exp_postage').value) + num($('rf_exp_printing').value) + num($('rf_exp_ink').value)
                + num($('rf_exp_supplies').value) + num($('rf_exp_other').value);
      $('rf_grand_total').value = money(bmCost + cvCost + exp);
    }

    // Mirror arrival addresses into departure (return trip = arrival reversed).
    // This means editing your home address in arrival.from also updates
    // departure.to (where you return to). Same for the office.
    $('rf_bm_arr_from').addEventListener('input', () => {
      $('rf_bm_dep_to').value = $('rf_bm_arr_from').value;
    });
    $('rf_bm_arr_to').addEventListener('input', () => {
      $('rf_bm_dep_from').value = $('rf_bm_arr_to').value;
    });

    // Distance auto-calc — cached and change-guarded so a single (from, to)
    // pair never bills the Routes API twice, and a stray input event on the
    // same value doesn't fire another call.
    function wireDistance(fromId, toId, milesId, statId, onResolved) {
      let lastFrom = null, lastTo = null;
      const run = async () => {
        const from = $(fromId).value.trim(), to = $(toId).value.trim();
        if (!from || !to) return;
        // Skip if nothing meaningful changed since last successful run.
        if (from === lastFrom && to === lastTo) return;
        lastFrom = from; lastTo = to;
        const stat = statId ? $(statId) : null;
        if (stat) stat.textContent = '· calculating…';
        try {
          const res = await distanceCached(from, to);
          if (res && res.miles != null) {
            $(milesId).value = res.miles;
            if (stat) stat.textContent = '· auto ✓';
            if (typeof onResolved === 'function') onResolved(res.miles);
          } else if (stat) {
            stat.textContent = '· enter manually';
          }
        } catch (_) { if (stat) stat.textContent = '· enter manually'; }
        recompute();
      };
      $(fromId).addEventListener('change', run);
      $(toId).addEventListener('change', run);
    }

    // Round-trip mileage duplication:
    //   Arrival (home → office) and Departure (office → home) are the same
    //   trip in reverse. When the arrival distance resolves and the
    //   departure miles field is empty (or not yet set by the user), dupe
    //   the arrival miles into departure so officers don't have to type
    //   the same number twice. Vice versa if departure is filled first.
    wireDistance('rf_bm_arr_from', 'rf_bm_arr_to', 'rf_bm_arr_miles', 'rf_bm_arr_stat', (miles) => {
      const dep = $('rf_bm_dep_miles');
      if (!dep.value || num(dep.value) === 0) {
        dep.value = miles;
        const s = $('rf_bm_dep_stat'); if (s && !s.textContent) s.textContent = '· mirrored ✓';
      }
    });
    wireDistance('rf_bm_dep_from', 'rf_bm_dep_to', 'rf_bm_dep_miles', 'rf_bm_dep_stat', (miles) => {
      const arr = $('rf_bm_arr_miles');
      if (!arr.value || num(arr.value) === 0) {
        arr.value = miles;
        const s = $('rf_bm_arr_stat'); if (s && !s.textContent) s.textContent = '· mirrored ✓';
      }
    });
    for (let i = 0; i < 4; i++) wireDistance(`rf_cv_from_${i}`, `rf_cv_to_${i}`, `rf_cv_miles_${i}`, null);

    // Recompute on any numeric change.
    root.querySelectorAll('.rf-miles, .rf-money').forEach(el => el.addEventListener('input', recompute));
    // Force caps on name/office/signature.
    ['rf_name','rf_office','rf_sig'].forEach(id => $(id).addEventListener('input', () => {
      const el = $(id); const p = el.selectionStart; el.value = el.value.toUpperCase(); try { el.setSelectionRange(p,p); } catch(_){}
    }));

    recompute();

    // Collect the form into a data object.
    function collect() {
      return {
        bm: {
          arrival:   { from:$('rf_bm_arr_from').value.trim(), to:$('rf_bm_arr_to').value.trim(), miles:num($('rf_bm_arr_miles').value), comment:$('rf_bm_arr_comment').value.trim() },
          departure: { from:$('rf_bm_dep_from').value.trim(), to:$('rf_bm_dep_to').value.trim(), miles:num($('rf_bm_dep_miles').value), comment:$('rf_bm_dep_comment').value.trim() },
        },
        clubVisits: [0,1,2,3].map(i => ({
          from:$(`rf_cv_from_${i}`).value.trim(), to:$(`rf_cv_to_${i}`).value.trim(),
          purpose:$(`rf_cv_purpose_${i}`).value.trim(), miles:num($(`rf_cv_miles_${i}`).value),
        })),
        expenses: {
          postage:num($('rf_exp_postage').value), printing:num($('rf_exp_printing').value),
          ink:num($('rf_exp_ink').value), supplies:num($('rf_exp_supplies').value),
          other:num($('rf_exp_other').value), otherLabel:$('rf_exp_otherlabel').value.trim(),
        },
        totals: {
          bmMiles:num($('rf_bm_total').value), bmCost:num($('rf_bm_arr_miles').value)*0+num($('rf_bm_total').value)*RATE,
          cvMiles:num($('rf_cv_total').value), cvCost:num($('rf_cv_total').value)*RATE,
          grand:num($('rf_grand_total').value.replace('$','')),
        },
        name:$('rf_name').value.trim().toUpperCase(),
        office:$('rf_office').value.trim().toUpperCase(),
        certified:$('rf_cert').checked,
        signature:$('rf_sig').value.trim().toUpperCase(),
      };
    }

    $('rf_submit').addEventListener('click', async () => {
      const err = $('rf_err');
      const data = collect();
      if (!data.certified) { err.textContent = 'Please check the certification box before submitting.'; return; }
      if (!data.name)      { err.textContent = 'Please enter your name.'; return; }
      if (!data.signature) { err.textContent = 'Please type your signature.'; return; }
      err.textContent = '';
      const btn = $('rf_submit'); btn.disabled = true; btn.textContent = 'Submitting…';
      try {
        // Build the filled PDF locally and send it alongside the form data
        // so the worker can snapshot it as its own file (safe from stale
        // pushes; served at /reimb-pdf/<id>).
        let pdfData = null;
        try {
          const preview = { ...record, form: data, submittedAt: new Date().toISOString() };
          pdfData = await pdfDataUrl(preview);
        } catch (_) { /* keep going even if PDF fails */ }
        await API.submitReimbursement(record.id, data, pdfData);
        onSubmitted && onSubmitted();
      } catch (e) {
        err.textContent = 'Could not submit: ' + e.message;
        btn.disabled = false; btn.textContent = 'Submit reimbursement form →';
      }
    });
  }

  // ── FLOW: render gate → form → success into a container ─────────────
  // opts: { blocking:bool, onDone:fn }  container is a .rf-body element.
  function renderFlow(body, record, opts) {
    opts = opts || {};
    const isDenied = record.status === 'treasurer-denied' || record.status === 'adult-rejected';

    function showForm() {
      body.innerHTML = (isDenied ? denyNoteHTML(record) : '') + formHTML(record);
      wireForm(body, record, () => showSuccess());
      body.scrollTop = 0;
      if (opts.onScrollTop) opts.onScrollTop();
    }
    function showSuccess() {
      body.innerHTML = `<div class="rf-success">
        <div class="rf-check">✓</div>
        <h3>Reimbursement submitted</h3>
        <p>Your form has been sent for approval. You'll be emailed if anything needs changing.</p>
        <div style="margin-top:18px;"><button class="rf-btn rf-btn-primary" id="rf_done" style="max-width:240px;margin:0 auto;">Done</button></div>
      </div>`;
      body.querySelector('#rf_done').addEventListener('click', () => opts.onDone && opts.onDone());
    }
    function showGate() {
      body.innerHTML = `<div class="rf-gate">
        <p>Did you attend the Key Club board meeting on <b>${esc(meetingDates(record))}</b>?</p>
        <div class="rf-gate-row" style="flex-wrap:wrap;">
          <button class="rf-btn rf-btn-primary" id="rf_yes"  style="max-width:220px;">Yes, I attended</button>
          <button class="rf-btn rf-btn-ghost"   id="rf_yes_nodrive" style="max-width:260px;">Yes, but no reimbursement</button>
          <button class="rf-btn rf-btn-danger"  id="rf_no"   style="max-width:220px;">No, I did not</button>
        </div>
        <p style="margin-top:12px;font-size:12.5px;color:#667085;">
          <b>Yes, but no reimbursement</b> = you were there but didn't drive yourself (or have no expenses to claim).
          You'll be marked present and won't need to fill out the form.
        </p>
      </div>`;
      body.querySelector('#rf_yes').addEventListener('click', showForm);

      // "Attended but no reimbursement needed" — marks present, skips the form.
      body.querySelector('#rf_yes_nodrive').addEventListener('click', async () => {
        const b = body.querySelector('#rf_yes_nodrive'); b.disabled = true; b.textContent = 'Saving…';
        try {
          await API.markReimbursementAttendedNoReimb(record.id, record.officerEmail);
          body.innerHTML = `<div class="rf-success">
            <div class="rf-check">✓</div>
            <h3>Thanks — you're marked present</h3>
            <p>We've recorded that you attended and don't need a reimbursement. No form to fill out.</p>
            <div style="margin-top:18px;"><button class="rf-btn rf-btn-ghost" id="rf_done3" style="max-width:220px;margin:0 auto;">Close</button></div>
          </div>`;
          body.querySelector('#rf_done3').addEventListener('click', () => opts.onDone && opts.onDone());
        } catch (e) { b.disabled = false; b.textContent = 'Yes, but no reimbursement'; alert('Could not save: ' + e.message); }
      });

      body.querySelector('#rf_no').addEventListener('click', async () => {
        const b = body.querySelector('#rf_no'); b.disabled = true; b.textContent = 'Saving…';
        try {
          await API.markReimbursementNotAttended(record.id, record.officerEmail);
          body.innerHTML = `<div class="rf-success">
            <div class="rf-check" style="background:#475569;">✓</div>
            <h3>Thanks — noted</h3>
            <p>We've recorded that you did not attend this board meeting. No reimbursement form is needed.</p>
            <div style="margin-top:18px;"><button class="rf-btn rf-btn-ghost" id="rf_done2" style="max-width:220px;margin:0 auto;">Close</button></div>
          </div>`;
          body.querySelector('#rf_done2').addEventListener('click', () => opts.onDone && opts.onDone());
        } catch (e) { b.disabled = false; b.textContent = 'No, I did not'; alert('Could not save: ' + e.message); }
      });
    }

    if (isDenied) showForm();     // resubmission: straight to the (pre-filled) form
    else showGate();              // first time: attendance question first
  }

  function denyNoteHTML(record) {
    const who = record.status === 'adult-rejected' ? 'adult treasurer' : 'treasurer';
    const comment = record.status === 'adult-rejected' ? (record.adult && record.adult.comment) : (record.treasurer && record.treasurer.comment);
    return `<div class="rf-deny-note">
      <b>Reimbursement form denied</b> by the ${who}${comment ? ':' : '.'}
      ${comment ? `<div style="margin-top:6px;font-style:italic;">"${esc(comment)}"</div>` : ''}
      <div style="margin-top:8px;">Please review, correct, and resubmit below.</div>
    </div>`;
  }

  // ── PUBLIC: non-dismissible blocking modal (login pop-up) ────────────
  function showBlockingModal(session, records) {
    injectStyles();
    if (document.querySelector('.rf-overlay')) return;
    const record = records[0];
    const isDenied = record.status === 'treasurer-denied' || record.status === 'adult-rejected';

    const overlay = document.createElement('div');
    overlay.className = 'rf-overlay';
    overlay.innerHTML = `<div class="rf-card">
      <div class="rf-head ${isDenied ? '' : ''}">
        <div class="rf-eyebrow">Reimbursement form — immediate attention</div>
        <h2>${isDenied ? 'Your reimbursement needs changes' : 'Board meeting reimbursement'}</h2>
        <p>${isDenied ? 'It was returned to you — please resubmit.' : 'Board meeting: ' + esc(meetingDates(record))}</p>
      </div>
      <div class="rf-body"></div>
    </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const body = overlay.querySelector('.rf-body');
    const finish = () => {
      // more actionable forms? reload to pick up the next one; else drop overlay.
      if (records.length > 1) { location.reload(); return; }
      overlay.remove(); document.body.style.overflow = '';
      location.reload();
    };
    renderFlow(body, record, { blocking: true, onDone: finish });
  }

  // ── PUBLIC: mount in a page container (reimbursement.html) ───────────
  function mountPage(container, record, onDone) {
    injectStyles();
    container.classList.add('rf-body');
    renderFlow(container, record, { blocking: false, onDone: onDone || (() => { location.href = 'dashboard.html'; }) });
  }

  // ── PDF GENERATION (jsPDF) — matches the paper form ─────────────────
  function buildPdf(record) {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('PDF engine not loaded');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const W = 612, M = 54;
    const f = record.form || {};
    const bm = f.bm || {}; const arr = bm.arrival || {}; const dep = bm.departure || {};
    const cv = f.clubVisits || []; const ex = f.expenses || {};
    const withSignature = record.status === 'archived';
    let y = 56;

    const line = (x1, y1, x2, y2) => { doc.setDrawColor(120); doc.setLineWidth(0.7); doc.line(x1, y1, x2, y2); };
    const text = (t, x, yy, opt) => doc.text(String(t == null ? '' : t), x, yy, opt);
    const bmMiles = num(arr.miles) + num(dep.miles);
    const cvMiles = cv.reduce((s, r) => s + num(r.miles), 0);
    const expTotal = num(ex.postage) + num(ex.printing) + num(ex.ink) + num(ex.supplies) + num(ex.other);
    const grand = (f.totals && f.totals.grand) || (bmMiles * RATE + cvMiles * RATE + expTotal);

    // Header
    doc.setFont('times', 'bold'); doc.setFontSize(13);
    text('Missouri-Arkansas District of Key Club International', W / 2, y, { align: 'center' });
    y += 16; doc.setFontSize(11);
    text('Expense Reimbursement Form', W / 2, y, { align: 'center' });
    y += 22;

    // Date / Name / Office
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    const dateStr = record.submittedAt ? new Date(record.submittedAt).toLocaleDateString('en-US') : '';
    text('Date: ' + dateStr, M, y);
    text('Name: ' + (f.name || record.officerName || '').toUpperCase(), 210, y);
    text('Office: ' + (f.office || record.officerTitle || '').toUpperCase(), 460, y);
    y += 20;

    // Expense list with $ column (right)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    const rows = [
      ['Postage', ex.postage],
      ['Printing & Stationery', ex.printing],
      ['Ink Cartridge', ex.ink],
      ['Supplies', ex.supplies],
      ['Mileage (for club visits, list details below)', cvMiles ? (cvMiles * RATE) : ''],
      ['Other (specify): ' + (ex.otherLabel || ''), ex.other],
    ];
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    rows.forEach(([label, val]) => {
      text(label, M + 8, y);
      text('$ ' + (val === '' || val == null ? '' : num(val).toFixed(2)), 470, y);
      y += 16;
    });
    y += 4; doc.setFont('helvetica', 'bold');
    text('★ Total', M + 8, y);
    text('$ ' + num(grand).toFixed(2), 470, y);
    doc.setFont('helvetica', 'normal');
    y += 22;

    // Certification
    doc.setFontSize(9);
    const cert = 'I certify that the above items are truly Key Club expenses and that the amounts shown are accurate to the best of my knowledge.';
    doc.text(cert, M, y, { maxWidth: W - 2 * M }); y += 26;
    text('Signature: ' + (f.signature || '').toUpperCase(), M, y); y += 24;

    // ── Club visit mileage table ──
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    text('Details of mileage for club visits.', M, y); y += 6;
    doc.setFont('helvetica', 'normal');
    const cvCols = [M, M + 150, M + 300, M + 470, W - M];
    const cvHead = ['From', 'To', 'Purpose', 'Miles'];
    const drawRow = (cols, vals, yy, h) => {
      line(cols[0], yy, cols[cols.length - 1], yy);
      for (let i = 0; i < cols.length; i++) line(cols[i], yy, cols[i], yy + h);
      line(cols[0], yy + h, cols[cols.length - 1], yy + h);
      vals.forEach((v, i) => doc.text(String(v == null ? '' : v).slice(0, 34), cols[i] + 4, yy + h - 5, { maxWidth: cols[i+1]-cols[i]-8 }));
    };
    doc.setFont('helvetica', 'bold'); drawRow(cvCols, cvHead, y, 16); doc.setFont('helvetica', 'normal'); y += 16;
    for (let i = 0; i < 4; i++) { const r = cv[i] || {}; drawRow(cvCols, [r.from, r.to, r.purpose, r.miles || ''], y, 16); y += 16; }
    y += 6;
    text('Total miles: ' + (Math.round(cvMiles * 10) / 10), 360, y);
    y += 14;
    text('Miles driven ' + (Math.round(cvMiles * 10) / 10) + '  x $.50 = $ ' + (cvMiles * RATE).toFixed(2), M, y);
    text("Treasurer's approval: " + (record.treasurer && record.treasurer.decision === 'approved' ? 'APPROVED' : ''), 340, y);
    y += 24;

    // ── Board meeting mileage table ──
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    text('Details of miles driven for board meetings.', M, y); y += 6;
    doc.setFont('helvetica', 'normal');
    const bmCols = [M, M + 150, M + 300, M + 470, W - M];
    doc.setFont('helvetica', 'bold'); drawRow(bmCols, ['From', 'To', 'Comment', 'Miles'], y, 16); doc.setFont('helvetica', 'normal'); y += 16;
    drawRow(bmCols, [arr.from, arr.to, arr.comment, arr.miles || ''], y, 16); y += 16;
    drawRow(bmCols, [dep.from, dep.to, dep.comment, dep.miles || ''], y, 16); y += 16;
    y += 6;
    text('Total miles: ' + (Math.round(bmMiles * 10) / 10), 360, y); y += 14;
    text('Miles driven ' + (Math.round(bmMiles * 10) / 10) + '  x $.50 = $ ' + (bmMiles * RATE).toFixed(2), M, y);
    text("Treasurer's approval: " + (record.treasurer && record.treasurer.decision === 'approved' ? 'APPROVED' : ''), 340, y);
    y += 26;

    // ── Adult treasurer signature (archived only) ──
    if (withSignature && record.adult && record.adult.decision === 'approved') {
      line(M, y, W - M, y); y += 16;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      text('SIGNED BY ADULT TREASURER', M, y); y += 16;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      text('Signature: ' + String(record.adult.signature || '').toUpperCase(), M, y);
      text('Date: ' + (record.adult.at ? new Date(record.adult.at).toLocaleDateString('en-US') : ''), 400, y);
    }

    return doc;
  }

  async function ensurePdfEngine() {
    if (window.jspdf && window.jspdf.jsPDF) return;
    if (typeof PORTAL !== 'undefined' && PORTAL.loadScript)
      await PORTAL.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  }

  async function openPdf(record) {
    await ensurePdfEngine();
    const doc = buildPdf(record);
    const url = doc.output('bloburl');
    window.open(url, '_blank');
  }
  async function pdfDataUrl(record) {
    await ensurePdfEngine();
    return buildPdf(record).output('datauristring');
  }

  return { showBlockingModal, mountPage, renderFlow, injectStyles, buildPdf, openPdf, pdfDataUrl, meetingDates, STATE_OFFICE };
})();

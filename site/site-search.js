/* ============================================================
   SITE SEARCH — Spotlight-style overlay for MO-ARK District site
   Include on every page: <script src="site-search.js"></script>
   Features:
     • Injects a small search button into the nav (auto-discovers .nav-links)
     • Cmd/Ctrl + K to open from anywhere; ESC or click-outside to close
     • Fuzzy-ish ranked search across pages, sections, forms, partners, etc.
     • Arrow-key navigation, Enter to go
   ============================================================ */
(function () {
  'use strict';

  /* ── SEARCH INDEX — every "thing" on the site that's worth finding ── */
  var INDEX = [
    /* Top-level pages */
    { title: 'Home',                       url: 'index.html',                  cat: 'Page',     kw: 'home landing main mo-ark district missouri arkansas' },
    { title: 'About MO-ARK',               url: 'about.html',                  cat: 'Page',     kw: 'about story who we are' },
    { title: 'Our History',                url: 'about.html#history',          cat: 'Section',  kw: 'history 1947 founding past origin' },
    { title: 'Mission & Values',           url: 'about.html#mission',          cat: 'Section',  kw: 'mission values pillars principles purpose' },
    { title: 'Our District',               url: 'our-district.html',           cat: 'Page',     kw: 'district overview missouri arkansas divisions' },
    { title: 'District Board',             url: 'our-district.html#board',     cat: 'Section',  kw: 'board governor lieutenant governors leadership executives officers exec' },
    { title: 'Club Directory',             url: 'our-district.html#clubs',     cat: 'Section',  kw: 'clubs schools directory map find my club search lookup' },
    { title: 'District Bylaws',            url: 'our-district.html#bylaws',    cat: 'Section',  kw: 'bylaws rules governance constitution policies pdf' },
    { title: 'Newsletters',                url: 'newsletters.html',            cat: 'Page',     kw: 'newsletters key way kiwanigram monthly publications updates news' },
    { title: 'Resources',                  url: 'resources.html',              cat: 'Page',     kw: 'resources forms guides downloads tools' },
    { title: 'Club Resources',             url: 'resources.html#club',         cat: 'Section',  kw: 'club resources officer guidebook materials' },
    { title: 'DLC & Awards Forms',         url: 'resources.html#forms',        cat: 'Section',  kw: 'forms registration awards distinguished candidate packet contest dlc' },
    { title: 'Programs, Charities & Partners', url: 'programs-charities.html', cat: 'Page',     kw: 'programs charities partners service' },
    { title: 'Service Partners',           url: 'programs-charities.html#partners',   cat: 'Section', kw: 'service partners schoolhouse collegewise erikas erika lighthouse' },
    { title: 'Preferred Charities',        url: 'programs-charities.html#charities',  cat: 'Section', kw: 'preferred charities unicef thirst project water mental health' },
    { title: 'Programs (YOF, GLC, etc.)',  url: 'programs-charities.html#programs',   cat: 'Section', kw: 'programs yof youth opportunities fund glc global leadership certificate' },
    { title: 'DLC 2027',                   url: 'dlc.html',                    cat: 'Event',    kw: 'dlc district leadership conference 2027 springfield missouri patriotic red white you' },
    { title: 'Event Calendar',             url: 'dlc.html#calendar',           cat: 'Event',    kw: 'event calendar dates board meetings conferences icon dcon dwf' },
    { title: 'Extended Calendar',          url: 'extended-calendar.html',      cat: 'Event',    kw: 'extended calendar timeline initiatives year long campaigns gantt' },
    { title: 'Contact Us',                 url: 'contact.html',                cat: 'Page',     kw: 'contact email reach out webmaster question feedback' },

    /* Partners & charities (deep links) */
    { title: 'Kiwanis International',      url: 'https://www.kiwanis.org',     cat: 'Partner',  kw: 'kiwanis international parent organization k-family' , external: true },
    { title: 'Key Club International',     url: 'https://www.keyclub.org',     cat: 'Partner',  kw: 'key club international kci org national', external: true },
    { title: 'UNICEF (Trick-or-Treat)',    url: 'https://www.unicefusa.org',   cat: 'Charity',  kw: 'unicef trick or treat children global', external: true },
    { title: 'Thirst Project',             url: 'https://www.thirstproject.org', cat: 'Charity', kw: 'thirst project clean water wells fundraise', external: true },
    { title: "Erika's Lighthouse",         url: 'https://www.erikaslighthouse.org', cat: 'Partner', kw: 'erika lighthouse mental health depression youth wellness', external: true },
    { title: 'Schoolhouse',                url: 'https://schoolhouse.world',   cat: 'Partner',  kw: 'schoolhouse peer tutoring sal khan service hours', external: true },
    { title: 'CollegeWise',                url: 'https://www.collegewise.com', cat: 'Partner',  kw: 'collegewise college admissions counseling', external: true },

    /* Common quick answers */
    { title: 'Marty the Meerkat (Ask)',    url: '#open-marty',                 cat: 'Help',     kw: 'marty meerkat chat ai assistant ask questions help support' },
    { title: 'District Bylaws PDF',        url: 'Files/MO-ARK_Key_Club_Bylaws.pdf', cat: 'File', kw: 'bylaws pdf download document rules', external: true },
  ];

  /* ── SVG ICONS ── */
  var ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  var ICON_PAGE   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>';
  var ICON_HASH   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>';
  var ICON_EVENT  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
  var ICON_EXT    = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
  var ICON_HELP   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  var ICON_FILE   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

  function iconFor(cat){
    if (cat === 'Section')  return ICON_HASH;
    if (cat === 'Event')    return ICON_EVENT;
    if (cat === 'Partner' || cat === 'Charity') return ICON_EXT;
    if (cat === 'Help')     return ICON_HELP;
    if (cat === 'File')     return ICON_FILE;
    return ICON_PAGE;
  }

  /* ── INJECT STYLES ── */
  var css = [
    /* Nav button — outline magnifying glass only, sits before the Contact Us CTA */
    '#ss-nav-btn{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;background:transparent;border:1px solid rgba(255,255,255,0.18);border-radius:8px;color:rgba(255,255,255,0.78);cursor:pointer;margin-right:0.5rem;transition:background .2s,color .2s,border-color .2s,transform .15s;padding:0;font:inherit;}',
    '#ss-nav-btn:hover{background:rgba(200,150,42,0.16);border-color:rgba(200,150,42,0.55);color:#F0C14B;transform:translateY(-1px);}',
    '#ss-nav-btn svg{width:16px;height:16px;}',

    /* Overlay */
    '#ss-overlay{position:fixed;inset:0;z-index:99000;background:rgba(5,10,20,0.62);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:none;align-items:flex-start;justify-content:center;padding:12vh 1rem 1rem;opacity:0;transition:opacity .18s ease;}',
    '#ss-overlay.ss-open{display:flex;opacity:1;}',
    /* Modal */
    '#ss-modal{width:100%;max-width:640px;background:#ffffff;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,0.45),0 0 0 1px rgba(255,255,255,0.06);overflow:hidden;font-family:"DM Sans",system-ui,sans-serif;transform:translateY(-8px) scale(.985);transition:transform .22s cubic-bezier(.22,1,.36,1);}',
    '#ss-overlay.ss-open #ss-modal{transform:translateY(0) scale(1);}',
    /* Input row */
    '#ss-input-row{display:flex;align-items:center;gap:.8rem;padding:1rem 1.1rem;border-bottom:1px solid rgba(10,22,40,0.08);}',
    '#ss-input-row .ss-leading{width:18px;height:18px;color:#5A5A6A;flex-shrink:0;}',
    '#ss-input{flex:1;border:none;outline:none;font-size:1.05rem;color:#0A1628;background:transparent;font-family:inherit;letter-spacing:.005em;}',
    '#ss-input::placeholder{color:#9AA5B4;}',
    '#ss-esc{font-family:system-ui,sans-serif;font-size:.66rem;font-weight:600;letter-spacing:.06em;padding:.22rem .5rem;background:#F0F4FA;border:1px solid rgba(10,22,40,0.1);border-radius:5px;color:#5A5A6A;flex-shrink:0;}',
    /* Results */
    '#ss-results{max-height:55vh;overflow-y:auto;padding:.5rem 0;}',
    '#ss-results::-webkit-scrollbar{width:6px;}',
    '#ss-results::-webkit-scrollbar-thumb{background:rgba(10,22,40,0.18);border-radius:6px;}',
    '.ss-group{padding:.35rem 1.1rem .15rem;font-size:.62rem;text-transform:uppercase;letter-spacing:.14em;color:#8A95A8;font-weight:700;}',
    '.ss-item{display:flex;align-items:center;gap:.85rem;padding:.6rem 1.1rem;cursor:pointer;border-left:3px solid transparent;transition:background .12s;}',
    '.ss-item:hover,.ss-item.ss-active{background:rgba(200,150,42,0.10);border-left-color:#C8962A;}',
    '.ss-item .ss-icon-wrap{width:32px;height:32px;border-radius:8px;background:#F0F4FA;display:flex;align-items:center;justify-content:center;color:#1A3A6B;flex-shrink:0;}',
    '.ss-item .ss-icon-wrap svg{width:15px;height:15px;}',
    '.ss-item .ss-text{flex:1;min-width:0;}',
    '.ss-item .ss-title{font-size:.92rem;font-weight:600;color:#0A1628;line-height:1.25;}',
    '.ss-item .ss-sub{font-size:.74rem;color:#5A5A6A;margin-top:1px;}',
    '.ss-item .ss-badge{font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#1A3A6B;background:rgba(26,58,107,0.1);padding:.2rem .55rem;border-radius:100px;flex-shrink:0;}',
    '.ss-empty{padding:2.5rem 1.5rem;text-align:center;color:#8A95A8;font-size:.9rem;}',
    '.ss-empty .ss-empty-icon{font-size:1.8rem;margin-bottom:.5rem;opacity:.4;}',
    /* Footer hint */
    '#ss-foot{display:flex;align-items:center;gap:1rem;padding:.55rem 1.1rem;border-top:1px solid rgba(10,22,40,0.08);background:#fafafa;font-size:.7rem;color:#8A95A8;font-family:system-ui,sans-serif;}',
    '#ss-foot kbd{font-family:inherit;font-size:.65rem;font-weight:700;padding:.12rem .4rem;background:#fff;border:1px solid rgba(10,22,40,0.12);border-radius:4px;color:#5A5A6A;}',
    '#ss-foot .ss-foot-spacer{flex:1;}',
    /* Highlight on matches */
    '.ss-hl{background:rgba(200,150,42,0.28);color:#0A1628;border-radius:3px;padding:0 1px;}',
  ].join('');

  /* Inject the stylesheet immediately so the overlay is always hidden by default.
     <head> exists when a script in <head> runs, so this is safe at module load. */
  (function injectStyles(){
    var styleEl = document.createElement('style');
    styleEl.id = 'ss-styles';
    styleEl.textContent = css;
    (document.head || document.documentElement).appendChild(styleEl);
  })();

  /* Held until init() — created inside the body once the DOM is ready */
  var overlay = null;

  /* ── INJECT NAV BUTTON ── */
  function injectNavButton(){
    var navLinks = document.querySelector('.nav-links');
    if (!navLinks || document.getElementById('ss-nav-btn-wrap')) return;
    var li = document.createElement('li');
    li.id = 'ss-nav-btn-wrap';
    li.style.cssText = 'display:flex;align-items:center;';
    li.innerHTML = '<button id="ss-nav-btn" type="button" aria-label="Search the site" title="Search (⌘K or /)">' + ICON_SEARCH + '</button>';
    // Insert before the Contact Us CTA (last item) if present
    var cta = navLinks.querySelector('.nav-cta');
    if (cta) {
      var ctaLi = cta.closest('li') || cta;
      navLinks.insertBefore(li, ctaLi);
    } else {
      navLinks.appendChild(li);
    }
    li.querySelector('#ss-nav-btn').addEventListener('click', openSearch);
  }

  /* ── INJECT MOBILE NAV ENTRY ── */
  function injectMobileButton(){
    var mob = document.getElementById('navMobile');
    if (!mob || mob.querySelector('.ss-mobile-link')) return;
    var a = document.createElement('a');
    a.href = '#';
    a.className = 'ss-mobile-link';
    a.style.cssText = 'display:flex;align-items:center;gap:.5rem;';
    a.innerHTML = '<span style="display:inline-flex;width:18px;height:18px;color:rgba(255,255,255,0.7);">' + ICON_SEARCH + '</span>Search the site';
    a.addEventListener('click', function(e){ e.preventDefault(); openSearch(); });
    mob.insertBefore(a, mob.firstChild);
  }

  /* ── BUILD OVERLAY (in body, once DOM is ready) ── */
  function buildOverlay(){
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'ss-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Search MO-ARK site');
    overlay.innerHTML = [
      '<div id="ss-modal">',
        '<div id="ss-input-row">',
          '<span class="ss-leading">', ICON_SEARCH, '</span>',
          '<input id="ss-input" type="text" placeholder="Search MO-ARK — pages, events, charities, forms…" autocomplete="off" spellcheck="false">',
          '<span id="ss-esc">ESC</span>',
        '</div>',
        '<div id="ss-results"></div>',
        '<div id="ss-foot">',
          '<kbd>↑</kbd><kbd>↓</kbd> navigate',
          '<kbd>↵</kbd> open',
          '<span class="ss-foot-spacer"></span>',
          '<kbd>⌘</kbd><kbd>K</kbd> to search anywhere',
        '</div>',
      '</div>',
    ].join('');
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function(e){
      if (e.target === overlay) closeSearch();
    });
    document.getElementById('ss-esc').addEventListener('click', closeSearch);
    document.getElementById('ss-input').addEventListener('input', function(e){ render(e.target.value); });
    document.getElementById('ss-results').addEventListener('click', function(e){
      var item = e.target.closest('.ss-item');
      if (item) gotoItem(item);
    });
    document.getElementById('ss-input').addEventListener('keydown', function(e){
      var items = document.querySelectorAll('.ss-item');
      if (e.key === 'ArrowDown'){
        e.preventDefault();
        if (items.length){ activeIdx = (activeIdx + 1) % items.length; updateActive(); }
      } else if (e.key === 'ArrowUp'){
        e.preventDefault();
        if (items.length){ activeIdx = (activeIdx - 1 + items.length) % items.length; updateActive(); }
      } else if (e.key === 'Enter'){
        e.preventDefault();
        gotoItem(items[activeIdx]);
      } else if (e.key === 'Escape'){
        e.preventDefault();
        closeSearch();
      }
    });
  }

  /* ── SEARCH SCORING ── */
  function score(item, q){
    if (!q) return 0;
    var ql = q.toLowerCase().trim();
    if (!ql) return 0;
    var title = item.title.toLowerCase();
    var kw    = (item.kw || '').toLowerCase();
    var s = 0;
    // exact title match
    if (title === ql) s += 1000;
    // title startsWith
    if (title.indexOf(ql) === 0) s += 600;
    // title contains
    var idx = title.indexOf(ql);
    if (idx > -1) s += 350 - idx;
    // keyword contains
    if (kw.indexOf(ql) > -1) s += 200;
    // per-word match
    var words = ql.split(/\s+/).filter(Boolean);
    words.forEach(function(w){
      if (title.indexOf(w) > -1) s += 80;
      if (kw.indexOf(w) > -1)    s += 40;
    });
    return s;
  }

  function highlightMatch(text, q){
    if (!q) return escapeHtml(text);
    var ql = q.trim();
    if (!ql) return escapeHtml(text);
    var lo = text.toLowerCase();
    var qlo = ql.toLowerCase();
    var idx = lo.indexOf(qlo);
    if (idx === -1) return escapeHtml(text);
    return escapeHtml(text.slice(0, idx))
         + '<span class="ss-hl">' + escapeHtml(text.slice(idx, idx + ql.length)) + '</span>'
         + escapeHtml(text.slice(idx + ql.length));
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  /* ── RENDER ── */
  var activeIdx = 0;
  var currentMatches = [];

  function render(q){
    var results = document.getElementById('ss-results');
    if (!q || !q.trim()){
      // Show suggested entries — most useful pages
      var SUGGESTED = ['Home','DLC 2027','Event Calendar','Club Directory','Resources','Newsletters','Contact Us'];
      var picks = INDEX.filter(function(it){ return SUGGESTED.indexOf(it.title) > -1; });
      currentMatches = picks;
      var html = '<div class="ss-group">Quick links</div>';
      picks.forEach(function(it, i){ html += itemHTML(it, i, ''); });
      results.innerHTML = html;
      activeIdx = 0;
      updateActive();
      return;
    }
    var scored = INDEX
      .map(function(it){ return { it: it, s: score(it, q) }; })
      .filter(function(x){ return x.s > 0; })
      .sort(function(a, b){ return b.s - a.s; })
      .slice(0, 12)
      .map(function(x){ return x.it; });
    currentMatches = scored;
    if (!scored.length){
      results.innerHTML = '<div class="ss-empty"><div class="ss-empty-icon">🔍</div>No results for "' + escapeHtml(q) + '". Try DLC, calendar, board, or a charity name.</div>';
      return;
    }
    var html = '';
    scored.forEach(function(it, i){ html += itemHTML(it, i, q); });
    results.innerHTML = html;
    activeIdx = 0;
    updateActive();
  }

  function itemHTML(it, i, q){
    var ext = it.external ? ' <span style="font-size:.7rem;color:#8A95A8;margin-left:.25rem;">↗</span>' : '';
    return [
      '<div class="ss-item" data-idx="', i, '" data-url="', escapeHtml(it.url), '" data-ext="', it.external ? '1' : '0', '">',
        '<div class="ss-icon-wrap">', iconFor(it.cat), '</div>',
        '<div class="ss-text">',
          '<div class="ss-title">', highlightMatch(it.title, q), ext, '</div>',
          '<div class="ss-sub">', escapeHtml(it.url.split('#')[0]), '</div>',
        '</div>',
        '<span class="ss-badge">', escapeHtml(it.cat), '</span>',
      '</div>'
    ].join('');
  }

  function updateActive(){
    var items = document.querySelectorAll('.ss-item');
    items.forEach(function(el, i){ el.classList.toggle('ss-active', i === activeIdx); });
    var active = items[activeIdx];
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function gotoItem(item){
    if (!item) return;
    var url = item.dataset.url;
    var ext = item.dataset.ext === '1';
    if (url === '#open-marty'){
      closeSearch();
      if (typeof window.mcToggle === 'function') window.mcToggle();
      return;
    }
    if (ext){
      window.open(url, '_blank', 'noopener');
      closeSearch();
      return;
    }
    closeSearch();
    window.location.href = url;
  }

  /* ── OPEN / CLOSE ── (tolerate overlay being not yet built) */
  function openSearch(){
    if (!overlay) buildOverlay();
    overlay.classList.add('ss-open');
    var input = document.getElementById('ss-input');
    if (input) { input.value = ''; render(''); setTimeout(function(){ input.focus(); }, 30); }
    document.body.style.overflow = 'hidden';
  }
  function closeSearch(){
    if (!overlay) return;
    overlay.classList.remove('ss-open');
    document.body.style.overflow = '';
  }
  window.ssOpen = openSearch;
  window.ssClose = closeSearch;

  /* ── GLOBAL KEYBOARD SHORTCUTS ── (bind once on document, no DOM dependency) */
  document.addEventListener('keydown', function(e){
    var isOpen = overlay && overlay.classList.contains('ss-open');
    var key = e.key || '';
    if ((e.metaKey || e.ctrlKey) && key.toLowerCase() === 'k'){
      e.preventDefault();
      isOpen ? closeSearch() : openSearch();
      return;
    }
    if (key === '/' && !isOpen){
      var ae = document.activeElement;
      var tag = (ae && ae.tagName) || '';
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(ae && ae.isContentEditable)){
        e.preventDefault();
        openSearch();
      }
      return;
    }
    if (key === 'Escape' && isOpen){ closeSearch(); }
  });

  /* ── INIT (runs once DOM is ready, so body exists) ── */
  function init(){
    if (!document.body) { return setTimeout(init, 20); }
    buildOverlay();
    injectNavButton();
    injectMobileButton();
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

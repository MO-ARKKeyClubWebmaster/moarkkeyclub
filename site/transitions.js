(() => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let navigating = false;

  function ensureOverlay() {
    let overlay = document.getElementById('pt-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'pt-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.opacity = '0';
    overlay.style.background = 'rgba(7, 15, 31, 0.22)';
    overlay.style.transition = 'opacity 220ms ease';
    document.body.appendChild(overlay);
    return overlay;
  }

  function isModifiedClick(event) {
    return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
  }

  function isSameFileOrigin(url) {
    return window.location.protocol === 'file:' && url.protocol === 'file:';
  }

  function isInternalPageLink(link) {
    const rawHref = link.getAttribute('href');
    if (!rawHref || rawHref === '#') return false;
    if (rawHref.startsWith('mailto:') || rawHref.startsWith('tel:') || rawHref.startsWith('javascript:')) {
      return false;
    }

    const url = new URL(rawHref, window.location.href);
    const sameOrigin = url.origin === window.location.origin || isSameFileOrigin(url);
    if (!sameOrigin) return false;

    const samePath = url.pathname === window.location.pathname && url.search === window.location.search;
    if (samePath && url.hash) return false;

    return true;
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link) return;

    const rawHref = link.getAttribute('href');
    if (rawHref === '#') {
      event.preventDefault();
      return;
    }

    if (navigating || prefersReducedMotion || isModifiedClick(event)) return;
    if (link.target && link.target !== '_self') return;
    if (link.hasAttribute('download')) return;
    if (!isInternalPageLink(link)) return;

    event.preventDefault();
    navigating = true;

    const overlay = ensureOverlay();
    document.body.style.transition = 'opacity 220ms ease';
    document.body.style.opacity = '0.985';

    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    window.setTimeout(() => {
      window.location.href = link.href;
    }, 220);
  });
})();

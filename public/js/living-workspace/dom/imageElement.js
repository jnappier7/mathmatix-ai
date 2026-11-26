/* ============================================================
   imageElement.js — the image element (P15).

   Renders a tutor `image` board-command as a REAL educational picture,
   upgrading the noteElement placeholder. It reuses the app's existing
   COPPA-safe pipeline verbatim (routes/imageSearch.js): GET
   /api/images/search?q=… (authenticated, query-sanitized, safe-search),
   then serves remote hosts through the same-origin /api/images/proxy so a
   bare <img> doesn't hotlink-break. This mirrors the legacy board's
   workspace.js image path exactly — same endpoints, same fallbacks.

   Safety: the query is already visual-gate-approved server-side before it
   reaches the client, AND the search route sanitizes again — double-gated.
   Every degradation path (no results / network fail / broken <img>) falls
   back to a labelled note instead of a broken glyph, so nothing vanishes.

   semantic: { query:'balance scale', caption?:'…' }

   Pure helpers (srcFor / pickResult) are exported for headless tests.
   UMD-lite: require() in jest, window.LWS.ImageElement in the browser.
   ============================================================ */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else { (root.LWS = root.LWS || {}).ImageElement = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Remote hosts hotlink-block a bare <img>; route them through our
  // same-origin proxy. Local concept images (/images/…) are already same-origin.
  function srcFor(u) {
    return /^https?:\/\//i.test(u) ? '/api/images/proxy?url=' + encodeURIComponent(u) : u;
  }

  // First result that carries a usable image.
  // Words in a picture query that name the PICTURE rather than the math —
  // "graph", "diagram", "showing" — plus function words. Never evidence that
  // a result is about the right thing.
  const QUERY_STOP = /^(the|a|an|of|for|and|or|in|on|to|with|graph|graphs|diagram|diagrams|picture|pictures|image|images|showing|example|examples|labell?ed|math|maths|mathematics|educational|chart)$/;
  function contentStems(query) {
    return String(query || '').toLowerCase().split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !QUERY_STOP.test(w))
      // A 6-letter stem at a word boundary: "trigonometric" finds "Trigonometry",
      // "functions" finds "function", "circle" finds "circles".
      .map((w) => new RegExp('\\b' + w.slice(0, 6)));
  }

  // Only a result whose TITLE is about the query is shown. The search is
  // site-restricted and safe, but "from an educational site" is not "about
  // the query": production 2026-09-07 captioned a cosmology plot of the
  // expanding universe as a trig aid, and until 2026-11-26 this function
  // still fell back to the first result when no title matched — which put the
  // same plot on a unit-circle lesson. A wrong picture is worse than none:
  // with no match the card says so in words. Our own drawings (source
  // "Mathmatix") were chosen by the server for this query and always show.
  function pickResult(results, query) {
    if (!Array.isArray(results)) return null;
    const withImage = results.filter((r) => r && (r.thumbnail || r.url));
    if (!withImage.length) return null;
    const own = withImage.find((r) => r.source === 'Mathmatix');
    if (own) return own;
    const stems = contentStems(query);
    if (!stems.length) return withImage[0];
    return withImage.find((r) => {
      const title = String(r.title || '').toLowerCase().replace(/[_-]+/g, ' ');
      return stems.some((re) => re.test(title));
    }) || null;
  }

  function defaultSearch(query) {
    return fetch('/api/images/search?q=' + encodeURIComponent(query), { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  // ── click to enlarge ────────────────────────────────────────────────────
  // One overlay for the page: the picture at full size on its own white
  // ground, closed by the button, a click outside, or Escape. Focus goes to
  // the close button and comes back to the picture afterwards.
  function openLightbox(doc, info) {
    const old = doc.getElementById('lws-lightbox'); if (old) old.remove();
    const back = doc.activeElement;
    const overlay = doc.createElement('div');
    overlay.id = 'lws-lightbox'; overlay.className = 'lws-lightbox';
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', info.alt || 'Picture');
    const fig = doc.createElement('figure'); fig.className = 'lws-lightbox-fig';
    const img = doc.createElement('img'); img.src = info.src; img.alt = info.alt || '';
    const close = doc.createElement('button'); close.type = 'button'; close.className = 'lws-lightbox-close';
    close.setAttribute('aria-label', 'Close'); close.textContent = '×';
    // A wide picture on a tall phone is small even at full width: a tap on it
    // zooms in (the frame scrolls), a second tap fits it again.
    const pan = doc.createElement('div'); pan.className = 'lws-lightbox-pan';
    pan.appendChild(img); fig.appendChild(pan);
    img.title = 'Click to zoom';
    img.addEventListener('click', function (ev) {
      ev.stopPropagation();
      const zoomed = fig.classList.toggle('is-zoomed');
      if (zoomed) { pan.scrollLeft = (pan.scrollWidth - pan.clientWidth) / 2; pan.scrollTop = (pan.scrollHeight - pan.clientHeight) / 2; }
    });
    if (info.caption) { const cap = doc.createElement('figcaption'); cap.textContent = info.caption; fig.appendChild(cap); }
    overlay.appendChild(fig); overlay.appendChild(close);
    function shut() {
      overlay.remove(); doc.removeEventListener('keydown', onKey, true);
      if (back && typeof back.focus === 'function') { try { back.focus(); } catch (_) { /* gone */ } }
    }
    function onKey(ev) { if (ev.key === 'Escape') { ev.stopPropagation(); shut(); } }
    overlay.addEventListener('click', function (ev) { if (ev.target === overlay || ev.target === close) shut(); });
    doc.addEventListener('keydown', onKey, true);
    doc.body.appendChild(overlay);
    try { close.focus(); } catch (_) { /* not focusable yet */ }
    return { close: shut, node: overlay };
  }
  // Make an <img> open the lightbox on click, Enter or Space.
  function enlargeable(img, info) {
    img.classList.add('is-enlargeable');
    img.setAttribute('tabindex', '0'); img.setAttribute('role', 'button');
    img.title = 'Click to enlarge';
    const go = function () { openLightbox(img.ownerDocument, typeof info === 'function' ? info() : info); };
    img.addEventListener('click', go);
    img.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
  }

  function makeRenderer(hooks) {
    const search = (hooks && typeof hooks.search === 'function') ? hooks.search : defaultSearch;
    const doc = typeof document !== 'undefined' ? document : null;

    return function imageFactory(element) {
      let current = Object.assign({}, element);
      let token = 0; // guards stale async: an update() that changes the query wins

      const card = doc.createElement('div');
      card.className = 'lws-image-card';
      card.setAttribute('role', 'group');

      const header = doc.createElement('div');
      header.className = 'lws-image-header';
      header.dataset.role = 'reposition-handle';
      header.textContent = 'Picture';

      const body = doc.createElement('div');
      body.className = 'lws-image-body';
      body.dataset.role = 'content';

      const caption = doc.createElement('div');
      caption.className = 'lws-image-caption';

      card.appendChild(header);
      card.appendChild(body);
      card.appendChild(caption);

      function sem() {
        const s = current.semantic || {};
        return { query: typeof s.query === 'string' ? s.query : '', caption: typeof s.caption === 'string' ? s.caption : '' };
      }

      function setCaption() {
        const c = sem().caption;
        caption.textContent = c;
        caption.style.display = c ? '' : 'none';
      }

      function fallback(msg) {
        body.textContent = '';
        const wrap = doc.createElement('div');
        wrap.className = 'lws-image-fallback';
        const icon = doc.createElement('span'); icon.className = 'lws-note-icon'; icon.textContent = '🖼';
        const txt = doc.createElement('span'); txt.className = 'lws-note-text';
        txt.textContent = msg || sem().caption || sem().query || 'image';
        wrap.appendChild(icon); wrap.appendChild(txt);
        body.appendChild(wrap);
      }

      // The picture, and — for a library item that has one — the interactive
      // behind an "Explore it" button. The picture is always what shows first:
      // it needs nothing but an <img>.
      function showImage(result) {
        body.textContent = '';
        const img = doc.createElement('img');
        // Our own drawings are full of small labels: give them the card's width.
        img.className = 'lws-image-img' + (result.source === 'Mathmatix' ? ' is-diagram' : '');
        img.alt = sem().caption || result.title || sem().query || 'illustration';
        img.loading = 'lazy'; img.decoding = 'async';
        let triedUrl = false;
        img.onerror = function () {
          if (!triedUrl && result.url && result.url !== (result.thumbnail || result.url)) {
            triedUrl = true; img.src = srcFor(result.url);
          } else { fallback('Couldn’t load that picture.'); }
        };
        img.src = srcFor(result.thumbnail || result.url);
        // Every picture opens full size (owner 2026-11-26: "all should be click
        // to enlarge") — the full image, not the thumbnail the card shows.
        enlargeable(img, function () { return { src: srcFor(result.url || result.thumbnail), alt: img.alt, caption: sem().caption || result.title || '' }; });
        body.appendChild(img);

        const IX = (typeof self !== 'undefined' && self.LWS && self.LWS.Interactives) || null;
        if (!result.widget || !IX || !IX.has(result.widget)) return;
        const bar = doc.createElement('div'); bar.className = 'lws-image-actions';
        const stage = doc.createElement('div'); stage.className = 'lws-image-stage'; stage.hidden = true;
        const btn = doc.createElement('button'); btn.type = 'button'; btn.className = 'lws-image-explore';
        let open = false;
        function paint() {
          btn.textContent = open ? 'Back to the picture' : 'Explore it';
          btn.setAttribute('aria-pressed', open ? 'true' : 'false');
          img.hidden = open; stage.hidden = !open;
        }
        btn.addEventListener('click', function () {
          open = !open;
          if (open && !stage.firstChild) IX.mount(result.widget, stage);
          paint();
        });
        paint();
        bar.appendChild(btn);
        body.appendChild(stage); body.appendChild(bar);
      }

      function render() {
        setCaption();
        const q = sem().query;
        if (!q) { fallback(); return; }
        fallback(q ? ('Loading “' + q + '”…') : '');
        const my = ++token;
        Promise.resolve(search(q)).then(function (data) {
          if (my !== token) return; // superseded by a newer render/update
          const r = pickResult(data && data.results, q);
          if (r) showImage(r); else fallback('No image found for “' + q + '”.');
        }).catch(function () { if (my === token) fallback(); });
      }
      render();

      return {
        node: card,
        // The card paints the caption itself (.lws-image-caption); tell the
        // derivation view not to add a figcaption too.
        ownsCaption: true,
        update: function (el) { current = Object.assign({}, el); render(); },
        destroy: function () { token++; /* invalidate any in-flight search */ },
        describe: function () { return 'Picture: ' + (sem().caption || sem().query); },
      };
    };
  }

  return { makeRenderer, srcFor, pickResult, openLightbox, enlargeable };
});

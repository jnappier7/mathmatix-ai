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
  function pickResult(results) {
    if (!Array.isArray(results)) return null;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r && (r.thumbnail || r.url)) return r;
    }
    return null;
  }

  function defaultSearch(query) {
    return fetch('/api/images/search?q=' + encodeURIComponent(query), { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
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

      function showImage(result) {
        body.textContent = '';
        const img = doc.createElement('img');
        img.className = 'lws-image-img';
        img.alt = sem().caption || result.title || sem().query || 'illustration';
        img.loading = 'lazy'; img.decoding = 'async';
        let triedUrl = false;
        img.onerror = function () {
          if (!triedUrl && result.url && result.url !== (result.thumbnail || result.url)) {
            triedUrl = true; img.src = srcFor(result.url);
          } else { fallback('Couldn’t load that picture.'); }
        };
        img.src = srcFor(result.thumbnail || result.url);
        body.appendChild(img);
      }

      function render() {
        setCaption();
        const q = sem().query;
        if (!q) { fallback(); return; }
        fallback(q ? ('Loading “' + q + '”…') : '');
        const my = ++token;
        Promise.resolve(search(q)).then(function (data) {
          if (my !== token) return; // superseded by a newer render/update
          const r = pickResult(data && data.results);
          if (r) showImage(r); else fallback('No image found for “' + q + '”.');
        }).catch(function () { if (my === token) fallback(); });
      }
      render();

      return {
        node: card,
        update: function (el) { current = Object.assign({}, el); render(); },
        destroy: function () { token++; /* invalidate any in-flight search */ },
        describe: function () { return 'Picture: ' + (sem().caption || sem().query); },
      };
    };
  }

  return { makeRenderer, srcFor, pickResult };
});

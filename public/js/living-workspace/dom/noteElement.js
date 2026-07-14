/* ============================================================
   noteElement.js — interim renderer for element types the workspace
   can't fully draw yet (IMAGE → P15, GEOMETRY → P17).

   Before this, an unrendered type fell through to overlayManager's bare
   "[image]" placeholder — content-free and ugly. This renders a titled
   NOTE CARD showing WHAT the tutor asked for (the image query / figure
   label / caption), so:
     • nothing silently vanishes,
     • the tutor's narration ("look at this balance scale…") stays coherent,
     • it reads as intentional, not broken,
   until the real image/geometry renderers land.

   The image query is already visual-gate-approved server-side by the time
   it reaches here, so displaying it as text is safe (no external fetch).

   Pure `describe()` is exported for headless tests. UMD-lite.
   ============================================================ */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else { (root.LWS = root.LWS || {}).NoteElement = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // element → { icon, title, text } for the card. Caption wins when present
  // (the tutor's own words); otherwise fall back to the semantic identifier.
  function describe(element) {
    const type = (element && element.type) || 'note';
    const s = (element && element.semantic) || {};
    if (type === 'image') {
      return { icon: '🖼', title: 'Picture', text: s.caption || s.query || 'image' };
    }
    if (type === 'geometry') {
      const label = s.diagramType || (s.params && (s.params.label || s.params.shape)) || 'figure';
      return { icon: '📐', title: 'Figure', text: s.caption || String(label) };
    }
    return { icon: '•', title: type, text: s.caption || s.text || s.query || '' };
  }

  function makeRenderer() {
    const doc = typeof document !== 'undefined' ? document : null;

    return function noteFactory(element) {
      let current = Object.assign({}, element);

      const card = doc.createElement('div');
      card.className = 'lws-note-card';
      card.setAttribute('role', 'group');

      const header = doc.createElement('div');
      header.className = 'lws-note-header';
      header.dataset.role = 'reposition-handle';

      const body = doc.createElement('div');
      body.className = 'lws-note-body';
      body.dataset.role = 'content';

      const icon = doc.createElement('span');
      icon.className = 'lws-note-icon';
      const text = doc.createElement('span');
      text.className = 'lws-note-text';
      body.appendChild(icon);
      body.appendChild(text);

      card.appendChild(header);
      card.appendChild(body);

      function render() {
        const d = describe(current);
        header.textContent = d.title;
        icon.textContent = d.icon;
        text.textContent = d.text;
        card.setAttribute('aria-label', d.title + (d.text ? (': ' + d.text) : ''));
      }
      render();

      return {
        node: card,
        update: function (el) { current = Object.assign({}, el); render(); },
        destroy: function () {},
        describe: function () { const d = describe(current); return d.title + ': ' + d.text; },
      };
    };
  }

  return { makeRenderer, describe };
});

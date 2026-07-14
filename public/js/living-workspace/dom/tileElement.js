/* ============================================================
   tileElement.js — the algebra-tiles element (P6): render + local
   interaction that emits a canonical OPERATION object.

   Semantic model (matches utils/workspace/algebraTileEngine + the
   verifier + moveNormalizer): a "tile" is ONE term.
     semantic.tiles: [{ id, coefficient, variable }]   // variable '' = unit
     semantic.selection: [tileId]

   This element renders each term as a draggable chip and interprets
   local gestures into an operation, WITHOUT judging the math — it
   emits the student's INTENT; the server (workspaceStateService +
   algebraTileVerifier) is the authority (P7). Interaction contract
   (spec P6 DoD): mouse / touch / pen / keyboard all produce the SAME
   operation object; a cancelled gesture changes nothing.

   Operations emitted (op.tileRefs are tile ids):
     { type:'combine_like_terms', tileRefs:[a,b] }  — drop a like chip on another
     { type:'remove_zero_pair',   tileRefs:[a,b] }  — drop +n on −n of the same var
     { type:'move_group',         tileRefs:[a] }    — reposition only (no math)

   UMD-lite: require() in jest, window.LWS.TileElement in the browser.
   ============================================================ */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else { (root.LWS = root.LWS || {}).TileElement = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── Pure helpers (also unit-tested headless) ──

  function like(a, b) { return a.variable === b.variable; }
  function zeroPair(a, b) {
    return a.variable === b.variable && a.coefficient === -b.coefficient && a.coefficient !== 0;
  }

  // Interpret "chip A dropped onto chip B" → an operation (or null = no-op).
  // Pure; same rule for mouse and keyboard so the DoD "same operation object"
  // holds. The client PROPOSES, the server DISPOSES: dropping one chip on
  // another is always a combine ATTEMPT (intent), EXCEPT an exact +n/−n pair,
  // which is a zero pair. Crucially we do NOT block unlike terms here — the
  // student is allowed to try combining 2x and 4; the server classifies it as
  // the combine_unlike_terms misconception and the tutor coaches it (spec:
  // "allow-and-teach"). Only a drop on itself is a no-op.
  function interpretDrop(a, b) {
    if (!a || !b || a.id === b.id) return null;
    if (zeroPair(a, b)) return { type: 'remove_zero_pair', tileRefs: [a.id, b.id] };
    return { type: 'combine_like_terms', tileRefs: [a.id, b.id] };
  }

  function termLabel(t) {
    const c = t.coefficient;
    const v = t.variable || '';
    if (v === '') return String(c);
    const mag = Math.abs(c) === 1 ? '' : String(Math.abs(c));
    return (c < 0 ? '-' : '') + mag + v;
  }

  // ── DOM renderer factory ──
  // makeRenderer({ onOperation }) → factory(element, api) → renderer
  function makeRenderer(hooks) {
    const onOperation = (hooks && typeof hooks.onOperation === 'function') ? hooks.onOperation : function () {};
    const doc = typeof document !== 'undefined' ? document : null;

    return function tileFactory(element) {
      const card = doc.createElement('div');
      card.className = 'lws-tiles-card';
      card.setAttribute('role', 'group');

      const header = doc.createElement('div');
      header.className = 'lws-tiles-header';
      header.dataset.role = 'reposition-handle';       // whole-card move (InteractionController)
      header.textContent = 'Tiles';

      const body = doc.createElement('div');
      body.className = 'lws-tiles-body';
      body.dataset.role = 'content';                    // NOT a card-drag zone

      card.appendChild(header);
      card.appendChild(body);

      let current = Object.assign({}, element);
      const chipEls = new Map();  // tileId → chip node
      let selection = [];         // keyboard-select buffer of tile ids

      function tiles() { return (current.semantic && current.semantic.tiles) || []; }
      function tileById(id) { return tiles().find((t) => t.id === id) || null; }

      function chipClass(t) {
        return 'lws-tile-chip'
          + (t.coefficient < 0 ? ' is-neg' : ' is-pos')
          + (t.variable === '' ? ' is-unit' : ' is-var')
          + (selection.indexOf(t.id) !== -1 ? ' is-selected' : '');
      }

      function makeChip(t) {
        const chip = doc.createElement('button');
        chip.type = 'button';
        chip.className = chipClass(t);
        chip.dataset.tileId = t.id;
        chip.textContent = termLabel(t);
        chip.setAttribute('aria-label', 'tile ' + termLabel(t));
        wireChipPointer(chip, t.id);
        wireChipKeyboard(chip, t.id);
        return chip;
      }

      function render() {
        body.textContent = '';
        chipEls.clear();
        for (const t of tiles()) {
          const chip = makeChip(t);
          chipEls.set(t.id, chip);
          body.appendChild(chip);
        }
      }

      // Which chip (other than self) is under this screen point?
      function chipUnder(x, y, selfId) {
        for (const [id, node] of chipEls) {
          if (id === selfId) continue;
          const r = node.getBoundingClientRect();
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
        }
        return null;
      }

      // ── Pointer drag: reposition within the card, or drop onto a chip ──
      function wireChipPointer(chip, id) {
        let drag = null;
        chip.addEventListener('pointerdown', function (e) {
          e.stopPropagation();                 // keep the card/canvas from panning
          chip.setPointerCapture && chip.setPointerCapture(e.pointerId);
          drag = { x0: e.clientX, y0: e.clientY, moved: false };
          chip.classList.add('is-dragging');
        });
        chip.addEventListener('pointermove', function (e) {
          if (!drag) return;
          const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
          if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
          chip.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
          const overId = chipUnder(e.clientX, e.clientY, id);
          highlightTarget(overId, id);
        });
        chip.addEventListener('pointerup', function (e) {
          if (!drag) return;
          const overId = chipUnder(e.clientX, e.clientY, id);
          const moved = drag.moved;
          drag = null;
          chip.classList.remove('is-dragging');
          chip.style.transform = '';           // ALWAYS snap back visually; server/commit repositions
          clearHighlights();
          if (!moved) return;                  // a click, not a drag
          const op = overId ? interpretDrop(tileById(id), tileById(overId)) : { type: 'move_group', tileRefs: [id] };
          if (op) onOperation(op, current);    // cancel (unlike drop) → op is null → nothing
        });
        chip.addEventListener('lostpointercapture', function () {
          if (drag) { drag = null; chip.classList.remove('is-dragging'); chip.style.transform = ''; clearHighlights(); }
        });
      }

      function highlightTarget(overId, selfId) {
        clearHighlights();
        if (!overId) return;
        const a = tileById(selfId), b = tileById(overId);
        const op = interpretDrop(a, b);
        const node = chipEls.get(overId);
        if (node) node.classList.add(op ? 'is-target' : 'is-target-invalid');
      }
      function clearHighlights() {
        for (const node of chipEls.values()) node.classList.remove('is-target', 'is-target-invalid');
      }

      // ── Keyboard path (a11y): Enter selects; two selected like tiles combine ──
      function wireChipKeyboard(chip, id) {
        chip.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleSelect(id);
          } else if (e.key === 'Escape') {
            selection = []; refreshSelectionClasses();
          }
        });
      }
      function toggleSelect(id) {
        const i = selection.indexOf(id);
        if (i !== -1) selection.splice(i, 1);
        else selection.push(id);
        if (selection.length === 2) {
          const op = interpretDrop(tileById(selection[0]), tileById(selection[1]));
          selection = [];
          refreshSelectionClasses();
          if (op) onOperation(op, current);
          return;
        }
        refreshSelectionClasses();
      }
      function refreshSelectionClasses() {
        for (const t of tiles()) {
          const node = chipEls.get(t.id);
          if (node) node.className = chipClass(t);
        }
      }

      render();

      return {
        node: card,
        update: function (el) {
          current = Object.assign({}, el);
          selection = selection.filter((id) => tileById(id));
          render();
        },
        destroy: function () { chipEls.clear(); },
      };
    };
  }

  return { makeRenderer, interpretDrop, termLabel, _like: like, _zeroPair: zeroPair };
});

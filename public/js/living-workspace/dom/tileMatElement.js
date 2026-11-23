/* ============================================================
   tileMatElement.js — algebra tiles on the work card.

   The tutor gets the tiles out the way a tutor reaches for the tile
   box: one line of the work, laid out as x² squares, x bars and unit
   squares — positives in colour, negatives red — on a mat with a left
   and a right side when the line is an equation. Then the student's
   hands take over:

     • drag a tile onto its opposite            → the zero pair cancels
     • tap a tile                               → it flips to its opposite
     • tap a tile in the tray                   → added to BOTH sides
       (or to the expression); drag it instead  → added to one side only
     • drag a tile to the other side, or off the mat → it goes there / away

   WHICH tiles the line is, is decided on the server
   (utils/workspace/tileMat.js) and arrives as semantic.mat. This file
   never parses math: it draws the mat it was given and keeps an honest
   count of what the student has done to it.

   "Honest" is the design. Nothing here blocks a wrong move — taking a
   tile off one side only is a move a student is allowed to make, and
   the board's rule is allow-and-teach. What the mat guarantees instead
   is that it never lies about itself: the readout under it always says
   exactly what is on the mat now, and a status line says whether that
   is still the line it started as (same equation / same value) or not.

   semantic: { mat: { tex, variable, sides:[{x2:[p,n],x:[p,n],unit:[p,n]}] }, caption? }

   The model (pure, exported) is tested headless in
   tests/unit/workspace/tileMatElement.test.js. UMD-lite: require() in
   jest, window.LWS.TileMatElement in the browser.
   ============================================================ */
(function (root, factory) {
  const mod = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else { (root.LWS = root.LWS || {}).TileMatElement = mod; }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const KINDS = ['x2', 'x', 'unit'];
  // A mat past this is a carpet. Adds beyond it are refused (the tray tile
  // shakes); the server caps the STARTING mat lower (tileMat.LIMITS).
  const MAX_PER_SIDE = 40;

  // ── The model ────────────────────────────────────────────────
  // state: { variable, sides: [ [ { id, kind, sign } ] ], seq }
  // One entry per physical tile; sign is +1 or -1. Every function returns a
  // NEW state (or null when the move is not possible) and never mutates.

  function validMat(mat) {
    return !!(mat && Array.isArray(mat.sides) && mat.sides.length >= 1 && mat.sides.length <= 2
      && mat.sides.every(function (s) {
        return s && KINDS.every(function (k) {
          return Array.isArray(s[k]) && s[k].length === 2
            && s[k].every(function (n) { return Number.isInteger(n) && n >= 0 && n <= MAX_PER_SIDE; });
        });
      }));
  }

  function fromMat(mat) {
    if (!validMat(mat)) return null;
    let seq = 0;
    const sides = mat.sides.map(function (s) {
      const tiles = [];
      KINDS.forEach(function (kind) {
        [1, -1].forEach(function (sign, i) {
          for (let n = 0; n < s[kind][i]; n++) tiles.push({ id: 't' + (seq++), kind: kind, sign: sign });
        });
      });
      return tiles;
    });
    return { variable: typeof mat.variable === 'string' && /^[a-z]$/i.test(mat.variable) ? mat.variable : 'x', sides: sides, seq: seq };
  }

  function clone(state) {
    return {
      variable: state.variable,
      seq: state.seq,
      sides: state.sides.map(function (side) { return side.map(function (t) { return { id: t.id, kind: t.kind, sign: t.sign }; }); }),
    };
  }

  function find(state, id) {
    for (let s = 0; s < state.sides.length; s++) {
      for (let i = 0; i < state.sides[s].length; i++) {
        if (state.sides[s][i].id === id) return { side: s, index: i, tile: state.sides[s][i] };
      }
    }
    return null;
  }

  // Tiles of a kind sit together, positives before negatives — the mat is
  // kept tidy for the student, the way a tutor straightens the pile.
  function tidy(side) {
    const rank = function (t) { return KINDS.indexOf(t.kind) * 2 + (t.sign < 0 ? 1 : 0); };
    return side.map(function (t, i) { return [t, i]; })
      .sort(function (a, b) { return rank(a[0]) - rank(b[0]) || a[1] - b[1]; })
      .map(function (p) { return p[0]; });
  }

  function flip(state, id) {
    const at = find(state, id);
    if (!at) return null;
    const next = clone(state);
    next.sides[at.side][at.index].sign = -at.tile.sign;
    next.sides[at.side] = tidy(next.sides[at.side]);
    return next;
  }

  function remove(state, id) {
    const at = find(state, id);
    if (!at) return null;
    const next = clone(state);
    next.sides[at.side].splice(at.index, 1);
    return next;
  }

  function isZeroPair(state, idA, idB) {
    const a = find(state, idA), b = find(state, idB);
    return !!(a && b && idA !== idB && a.side === b.side
      && a.tile.kind === b.tile.kind && a.tile.sign === -b.tile.sign);
  }

  // A positive and a negative of the same kind, on the same side, are zero.
  function zeroPair(state, idA, idB) {
    if (!isZeroPair(state, idA, idB)) return null;
    const next = clone(state);
    const side = find(state, idA).side;
    next.sides[side] = next.sides[side].filter(function (t) { return t.id !== idA && t.id !== idB; });
    return next;
  }

  /** Every zero pair currently on the mat: [[idA, idB], …]. */
  function zeroPairs(state) {
    const pairs = [];
    state.sides.forEach(function (side) {
      KINDS.forEach(function (kind) {
        const pos = side.filter(function (t) { return t.kind === kind && t.sign > 0; });
        const neg = side.filter(function (t) { return t.kind === kind && t.sign < 0; });
        for (let i = 0; i < Math.min(pos.length, neg.length); i++) pairs.push([pos[i].id, neg[i].id]);
      });
    });
    return pairs;
  }

  function add(state, sideIndex, kind, sign) {
    if (KINDS.indexOf(kind) === -1 || (sign !== 1 && sign !== -1)) return null;
    if (!state.sides[sideIndex] || state.sides[sideIndex].length >= MAX_PER_SIDE) return null;
    const next = clone(state);
    next.sides[sideIndex].push({ id: 't' + (next.seq++), kind: kind, sign: sign });
    next.sides[sideIndex] = tidy(next.sides[sideIndex]);
    return next;
  }

  // The balanced move: the same tile on every side. All sides or none.
  function addToAll(state, kind, sign) {
    let next = state;
    for (let s = 0; s < state.sides.length; s++) {
      next = add(next, s, kind, sign);
      if (!next) return null;
    }
    return next;
  }

  function move(state, id, toSide) {
    const at = find(state, id);
    if (!at || at.side === toSide || !state.sides[toSide]) return null;
    if (state.sides[toSide].length >= MAX_PER_SIDE) return null;
    const next = clone(state);
    const tile = next.sides[at.side].splice(at.index, 1)[0];
    next.sides[toSide].push(tile);
    next.sides[toSide] = tidy(next.sides[toSide]);
    return next;
  }

  // What a side adds up to: [x² coefficient, x coefficient, constant].
  function net(side) {
    return KINDS.map(function (kind) {
      return side.reduce(function (sum, t) { return sum + (t.kind === kind ? t.sign : 0); }, 0);
    });
  }

  // What a side literally shows: [[positives, negatives] per kind].
  function counts(side) {
    return KINDS.map(function (kind) {
      return [1, -1].map(function (sign) {
        return side.filter(function (t) { return t.kind === kind && t.sign === sign; }).length;
      });
    });
  }

  /**
   * Is the mat still the line it started as?
   *   expression — the same polynomial;
   *   equation   — the same solutions: (left − right) is a non-zero multiple
   *                of where it started (adding to both sides keeps it equal,
   *                flipping every tile multiplies it by −1).
   */
  function sameAsStart(state, start) {
    if (!start || state.sides.length !== start.sides.length) return false;
    if (state.sides.length === 1) {
      const a = net(state.sides[0]), b = net(start.sides[0]);
      return a.every(function (v, i) { return v === b[i]; });
    }
    const diff = function (s) {
      const l = net(s.sides[0]), r = net(s.sides[1]);
      return l.map(function (v, i) { return v - r[i]; });
    };
    const d = diff(state), d0 = diff(start);
    const zero = function (v) { return v.every(function (n) { return n === 0; }); };
    if (zero(d) || zero(d0)) return zero(d) && zero(d0);
    // d = c·d0 for one non-zero c  ⇔  every 2×2 cross product is zero.
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        if (d[i] * d0[j] !== d[j] * d0[i]) return false;
      }
    }
    return true;
  }

  function sideTex(side, variable) {
    const names = [variable + '^2', variable, ''];
    const parts = [];
    counts(side).forEach(function (c, k) {
      [c[0], c[1]].forEach(function (n, neg) {
        if (!n) return;
        const body = names[k] ? (n === 1 ? '' : String(n)) + names[k] : String(n);
        parts.push({ neg: !!neg, body: body });
      });
    });
    if (!parts.length) return '0';
    return parts.map(function (p, i) {
      if (i === 0) return (p.neg ? '-' : '') + p.body;
      return (p.neg ? ' - ' : ' + ') + p.body;
    }).join('');
  }

  /** The line the mat shows right now, as LaTeX. Zero pairs are NOT netted out. */
  function readout(state) {
    return state.sides.map(function (side) { return sideTex(side, state.variable); }).join(' = ');
  }

  function tileLabel(kind, sign, variable) {
    const body = kind === 'x2' ? variable + '²' : kind === 'x' ? variable : '1';
    return (sign < 0 ? '−' : '') + body;
  }

  function tileName(kind, sign, variable) {
    const body = kind === 'x2' ? variable + ' squared' : kind === 'x' ? variable : 'one';
    return (sign < 0 ? 'negative ' : 'positive ') + body;
  }

  // ── The mat ──────────────────────────────────────────────────

  function makeRenderer(hooks) {
    const onChange = (hooks && typeof hooks.onChange === 'function') ? hooks.onChange : null;

    return function tileMatFactory(element) {
      const doc = (typeof document !== 'undefined') ? document : null;
      const mat = element && element.semantic && element.semantic.mat;
      const start = fromMat(mat);
      if (!doc || !start) return null;          // the card falls back to its plain label

      let state = clone(start);
      let touched = false;
      const isEquation = start.sides.length === 2;
      const calm = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

      const el = function (tag, cls, text) {
        const n = doc.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
      };

      const node = el('div', 'lws-tm' + (isEquation ? ' is-equation' : ''));
      node.setAttribute('role', 'group');
      node.setAttribute('aria-label', 'Algebra tiles');

      const matEl = el('div', 'lws-tm-mat');
      const sideEls = start.sides.map(function (_, i) {
        const s = el('div', 'lws-tm-side');
        s.dataset.side = String(i);
        s.setAttribute('role', 'group');
        s.setAttribute('aria-label', isEquation ? (i === 0 ? 'Left side' : 'Right side') : 'Tiles');
        return s;
      });
      matEl.appendChild(sideEls[0]);
      if (isEquation) {
        matEl.appendChild(el('div', 'lws-tm-equals', '='));
        matEl.appendChild(sideEls[1]);
      }

      const read = el('div', 'lws-tm-read');
      const readMath = el('span', 'lws-tm-read-math');
      const status = el('span', 'lws-tm-status');
      read.setAttribute('aria-live', 'polite');
      read.appendChild(readMath); read.appendChild(status);

      const tray = el('div', 'lws-tm-tray');
      tray.appendChild(el('span', 'lws-tm-tray-lbl', isEquation ? 'Add to both sides' : 'Add a tile'));
      const trayTiles = el('div', 'lws-tm-tray-tiles');
      KINDS.forEach(function (kind) {
        [1, -1].forEach(function (sign) {
          const b = el('button', 'lws-tm-tile is-tray is-' + kind + (sign < 0 ? ' is-neg' : ' is-pos'), tileLabel(kind, sign, start.variable));
          b.type = 'button';
          b.dataset.kind = kind; b.dataset.sign = String(sign);
          b.setAttribute('aria-label', 'Add ' + tileName(kind, sign, start.variable) + (isEquation ? ' to both sides' : ''));
          wire(b, { tray: true, kind: kind, sign: sign });
          trayTiles.appendChild(b);
        });
      });
      tray.appendChild(trayTiles);

      const tools = el('div', 'lws-tm-tools');
      const cancelBtn = el('button', 'lws-tm-btn', 'Cancel zero pairs'); cancelBtn.type = 'button';
      const resetBtn = el('button', 'lws-tm-btn', 'Start again'); resetBtn.type = 'button';
      tools.appendChild(cancelBtn); tools.appendChild(resetBtn);
      const hint = el('div', 'lws-tm-hint', 'Drag a tile onto its opposite to cancel them. Tap a tile to flip it.');

      node.appendChild(matEl); node.appendChild(read); node.appendChild(tray);
      node.appendChild(tools); node.appendChild(hint);

      cancelBtn.addEventListener('click', function () {
        const pairs = zeroPairs(state);
        if (!pairs.length) return;
        let next = state;
        pairs.forEach(function (p) { next = zeroPair(next, p[0], p[1]) || next; });
        vanish([].concat.apply([], pairs), function () { commit(next); });
      });
      resetBtn.addEventListener('click', function () { touched = false; commit(clone(start), { reset: true }); });

      // ── drawing ──
      let known = {};      // ids on the mat at the last paint — anything else pops in

      function tileNode(t) {
        const b = el('button', 'lws-tm-tile is-' + t.kind + (t.sign < 0 ? ' is-neg' : ' is-pos'), tileLabel(t.kind, t.sign, state.variable));
        b.type = 'button';
        b.dataset.id = t.id;
        b.setAttribute('aria-label', tileName(t.kind, t.sign, state.variable) + ' tile. Enter flips it, Delete takes it off.');
        if (!known[t.id]) b.classList.add('is-new');
        wire(b, { id: t.id });
        return b;
      }

      function paint(focusId) {
        const now = {};
        state.sides.forEach(function (side, i) {
          sideEls[i].textContent = '';
          if (!side.length) sideEls[i].appendChild(el('span', 'lws-tm-empty', '0'));
          side.forEach(function (t) { now[t.id] = true; sideEls[i].appendChild(tileNode(t)); });
        });
        known = now;

        const tex = readout(state);
        const katex = root.katex;
        let drawn = false;
        if (katex && typeof katex.render === 'function') {
          try { katex.render(tex, readMath, { throwOnError: false, displayMode: false }); drawn = !readMath.querySelector('.katex-error'); }
          catch (_) { drawn = false; }
        }
        if (!drawn) readMath.textContent = tex.replace(/\^2/g, '²').replace(/-/g, '−');

        const same = sameAsStart(state, start);
        status.className = 'lws-tm-status' + (touched ? (same ? ' is-same' : ' is-changed') : '');
        status.textContent = !touched ? ''
          : same ? (isEquation ? '✓ Still the same equation' : '✓ Still the same value')
            : (isEquation ? 'Not the equation you started with' : 'Not the expression you started with');
        cancelBtn.disabled = zeroPairs(state).length === 0;
        resetBtn.disabled = !touched;
        hint.hidden = touched;

        if (focusId) {
          const f = node.querySelector('[data-id="' + focusId + '"]');
          if (f && typeof f.focus === 'function') { try { f.focus({ preventScroll: true }); } catch (_) { /* older engines */ } }
        }
      }

      function commit(next, opts) {
        if (!next) return;
        state = next;
        if (!(opts && opts.reset)) touched = true;
        paint(opts && opts.focusId);
        const detail = { start: mat.tex || readout(start), now: readout(state), same: sameAsStart(state, start), elementId: element.id || null };
        if (onChange) { try { onChange(detail); } catch (_) { /* host's problem */ } }
        try { node.dispatchEvent(new CustomEvent('lws:tiles-change', { bubbles: true, detail: detail })); } catch (_) { /* no CustomEvent */ }
      }

      // Play the cancel on the tiles themselves, then run `done`.
      function vanish(ids, done) {
        if (calm) { done(); return; }
        ids.forEach(function (id) {
          const n = node.querySelector('[data-id="' + id + '"]');
          if (n) n.classList.add('is-cancelling');
        });
        setTimeout(done, 240);
      }

      function refuse(n) {
        if (!n || calm) return;
        n.classList.remove('is-refused');
        void n.offsetWidth;                    // restart the animation
        n.classList.add('is-refused');
      }

      // ── one gesture model for mouse, touch and pen ──
      // src: { id } for a tile on the mat, { tray, kind, sign } for a tray tile.
      function wire(btn, src) {
        let g = null;

        function under(x, y) {
          const hit = doc.elementFromPoint ? doc.elementFromPoint(x, y) : null;
          const inMat = !!(hit && matEl.contains(hit));
          const tile = hit && hit.closest ? hit.closest('.lws-tm-tile[data-id]') : null;
          const side = hit && hit.closest ? hit.closest('.lws-tm-side') : null;
          return {
            inMat: inMat,
            tileId: tile && matEl.contains(tile) ? tile.dataset.id : null,
            side: side && matEl.contains(side) ? Number(side.dataset.side) : null,
          };
        }

        // What letting go here would do.
        function intent(x, y) {
          const u = under(x, y);
          if (src.id) {
            if (u.tileId && isZeroPair(state, src.id, u.tileId)) return { type: 'pair', other: u.tileId };
            const from = find(state, src.id);
            if (u.side != null && from && u.side !== from.side) return { type: 'move', side: u.side };
            if (!u.inMat) return { type: 'off' };
            return { type: 'back' };
          }
          if (u.side != null) return { type: 'add', side: u.side };
          return { type: 'back' };
        }

        function mark(it) {
          sideEls.forEach(function (s) { s.classList.remove('is-drop'); });
          const old = matEl.querySelectorAll('.is-pair');
          for (let i = 0; i < old.length; i++) old[i].classList.remove('is-pair');
          if (!it) return;
          if (it.type === 'pair') {
            const n = matEl.querySelector('[data-id="' + it.other + '"]');
            if (n) n.classList.add('is-pair');
          } else if (it.type === 'move' || it.type === 'add') {
            sideEls[it.side].classList.add('is-drop');
          }
          if (g && g.ghost) g.ghost.classList.toggle('is-leaving', it.type === 'off');
        }

        function end() {
          if (!g) return;
          if (g.ghost && g.ghost.parentNode) g.ghost.parentNode.removeChild(g.ghost);
          btn.classList.remove('is-lifted');
          mark(null);
          g = null;
        }

        btn.addEventListener('pointerdown', function (e) {
          if (e.button != null && e.button !== 0) return;
          g = { x0: e.clientX, y0: e.clientY, ghost: null, dx: 0, dy: 0 };
          try { btn.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events */ }
        });

        btn.addEventListener('pointermove', function (e) {
          if (!g) return;
          if (!g.ghost) {
            if (Math.abs(e.clientX - g.x0) + Math.abs(e.clientY - g.y0) < 6) return;
            const r = btn.getBoundingClientRect();
            g.dx = g.x0 - r.left; g.dy = g.y0 - r.top;
            g.ghost = btn.cloneNode(true);
            g.ghost.removeAttribute('data-id');
            g.ghost.className = btn.className.replace(/\bis-new\b/, '') + ' lws-tm-ghost';
            g.ghost.style.width = r.width + 'px'; g.ghost.style.height = r.height + 'px';
            // On <body>, not in the card: position:fixed is measured from the
            // nearest transformed ancestor, and a step row animates in with one.
            doc.body.appendChild(g.ghost);
            if (src.id) btn.classList.add('is-lifted');
          }
          g.ghost.style.left = (e.clientX - g.dx) + 'px';
          g.ghost.style.top = (e.clientY - g.dy) + 'px';
          mark(intent(e.clientX, e.clientY));
        });

        btn.addEventListener('pointerup', function (e) {
          if (!g) return;
          const dragged = !!g.ghost;
          const it = dragged ? intent(e.clientX, e.clientY) : null;
          end();
          if (!dragged) return;                  // a tap — the click handler takes it
          btn.dataset.dragged = '1';             // swallow the click that follows a drag
          setTimeout(function () { delete btn.dataset.dragged; }, 0);
          if (it.type === 'pair') {
            const next = zeroPair(state, src.id, it.other);
            vanish([src.id, it.other], function () { commit(next); });
          } else if (it.type === 'move') {
            commit(move(state, src.id, it.side)) ;
          } else if (it.type === 'off') {
            commit(remove(state, src.id));
          } else if (it.type === 'add') {
            const next = add(state, it.side, src.kind, src.sign);
            if (next) commit(next); else refuse(btn);
          }
        });

        btn.addEventListener('pointercancel', end);
        btn.addEventListener('lostpointercapture', function () { if (g && g.ghost) end(); });

        // Tap / Enter / Space.
        btn.addEventListener('click', function () {
          if (btn.dataset.dragged) return;
          if (src.id) { commit(flip(state, src.id), { focusId: src.id }); return; }
          const next = addToAll(state, src.kind, src.sign);
          if (next) commit(next); else refuse(btn);
        });

        if (src.id) {
          btn.addEventListener('keydown', function (e) {
            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); commit(remove(state, src.id)); }
          });
        }
      }

      paint();

      return {
        node: node,
        destroy: function () { known = {}; },
      };
    };
  }

  return {
    makeRenderer: makeRenderer,
    fromMat: fromMat, flip: flip, remove: remove, add: add, addToAll: addToAll, move: move,
    zeroPair: zeroPair, isZeroPair: isZeroPair, zeroPairs: zeroPairs,
    net: net, counts: counts, sameAsStart: sameAsStart, readout: readout,
    tileLabel: tileLabel, MAX_PER_SIDE: MAX_PER_SIDE,
  };
});

/* ============================================================
   interactionController.js — one input surface for mouse/touch/pen/
   keyboard (spec §3.3, §B5). Produces the same outcome from every
   modality; every listener it binds is tracked and removed on
   destroy() so the Shell unmounts with NO leaks (P3 DoD).

   Behaviours:
     • Pan  — drag on empty substrate (or one-finger touch).
     • Reposition — drag starting on an element's [data-role=
       "reposition-handle"]; dragging the element BODY does nothing
       (so editing/selecting math never drags the canvas).
     • Zoom — wheel, two-finger pinch, or keyboard (+/-/0), always
       toward the focus point so nothing drifts.
     • Keyboard — arrows pan, +/-/0 zoom, via the a11y command map.
   `touch-action:none` on the surface (set by the Shell) stops the
   browser stealing touch-drags for scroll.

   Callbacks: onViewportChange(), onElementMove(id, worldX, worldY),
   onElementMoveEnd(id). Browser-only. Global: LWS.InteractionController.
   ============================================================ */
(function (root) {
  'use strict';
  const LWS = (root.LWS = root.LWS || {});
  const a11y = LWS.a11y; // loaded before this file

  class InteractionController {
    constructor(surface, viewport, opts = {}) {
      this.surface = surface;       // the element receiving pointer/wheel/key events
      this.viewport = viewport;
      this.onViewportChange = opts.onViewportChange || function () {};
      this.onElementMove = opts.onElementMove || function () {};
      this.onElementMoveEnd = opts.onElementMoveEnd || function () {};
      this.getElementPos = opts.getElementPos || function () { return null; }; // id → {x,y}

      this._bound = [];             // { target, type, fn, opts } for teardown
      this._pointers = new Map();   // active pointers: id → {x,y}
      this._drag = null;            // { mode:'pan'|'element', ... }
      this._pinch = null;           // { startDist, startScale, cx, cy }

      this._bind();
    }

    _on(target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      this._bound.push({ target, type, fn, opts });
    }

    _bind() {
      this._on(this.surface, 'pointerdown', this._onDown = this._onDown.bind(this));
      this._on(this.surface, 'pointermove', this._onMove = this._onMove.bind(this));
      this._on(this.surface, 'pointerup', this._onUp = this._onUp.bind(this));
      this._on(this.surface, 'pointercancel', this._onUp);
      this._on(this.surface, 'wheel', this._onWheel = this._onWheel.bind(this), { passive: false });
      this._on(this.surface, 'keydown', this._onKey = this._onKey.bind(this));
    }

    _localXY(e) {
      const r = this.surface.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    _repositionHandle(target) {
      // Walk up to the element host if the pointer landed on a reposition handle.
      let n = target;
      while (n && n !== this.surface) {
        if (n.dataset && n.dataset.role === 'reposition-handle') {
          let host = n;
          while (host && host !== this.surface && !(host.dataset && host.dataset.elementId)) host = host.parentNode;
          return (host && host.dataset && host.dataset.elementId) ? host.dataset.elementId : null;
        }
        // pointer inside element content (not the handle) → not a reposition
        if (n.dataset && n.dataset.role === 'content') return null;
        n = n.parentNode;
      }
      return null;
    }

    _onDown(e) {
      this.surface.focus && this.surface.focus();
      this._pointers.set(e.pointerId, this._localXY(e));
      try { this.surface.setPointerCapture(e.pointerId); } catch (_) { /* ok */ }

      if (this._pointers.size === 2) { this._beginPinch(); return; }

      const p = this._localXY(e);
      const id = this._repositionHandle(e.target);
      if (id) {
        const pos = this.getElementPos(id) || { x: 0, y: 0 };
        this._drag = { mode: 'element', id, startWorld: this.viewport.screenToWorld(p.x, p.y), startPos: pos };
      } else {
        this._drag = { mode: 'pan', last: p };
      }
    }

    _onMove(e) {
      if (this._pointers.has(e.pointerId)) this._pointers.set(e.pointerId, this._localXY(e));
      if (this._pinch && this._pointers.size >= 2) { this._updatePinch(); return; }
      if (!this._drag) return;
      const p = this._localXY(e);
      if (this._drag.mode === 'pan') {
        this.viewport.panByScreen(p.x - this._drag.last.x, p.y - this._drag.last.y);
        this._drag.last = p;
        this.onViewportChange();
      } else {
        const w = this.viewport.screenToWorld(p.x, p.y);
        const nx = this._drag.startPos.x + (w.x - this._drag.startWorld.x);
        const ny = this._drag.startPos.y + (w.y - this._drag.startWorld.y);
        this.onElementMove(this._drag.id, nx, ny);
      }
    }

    _onUp(e) {
      this._pointers.delete(e.pointerId);
      try { this.surface.releasePointerCapture(e.pointerId); } catch (_) { /* ok */ }
      if (this._pointers.size < 2) this._pinch = null;
      if (this._drag && this._drag.mode === 'element') this.onElementMoveEnd(this._drag.id);
      if (this._pointers.size === 0) this._drag = null;
    }

    _beginPinch() {
      const pts = [...this._pointers.values()];
      const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
      this._pinch = {
        startDist: Math.hypot(dx, dy) || 1,
        startScale: this.viewport.scale,
        cx: (pts[0].x + pts[1].x) / 2,
        cy: (pts[0].y + pts[1].y) / 2,
      };
      this._drag = null; // a second finger cancels pan/drag
    }

    _updatePinch() {
      const pts = [...this._pointers.values()];
      const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy) || 1;
      const target = this._pinch.startScale * (dist / this._pinch.startDist);
      const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2;
      this.viewport.zoomAt(cx, cy, target / this.viewport.scale);
      this.onViewportChange();
    }

    _onWheel(e) {
      e.preventDefault();
      const p = this._localXY(e);
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      this.viewport.zoomAt(p.x, p.y, factor);
      this.onViewportChange();
    }

    _onKey(e) {
      if (!a11y) return;
      const id = a11y.commandForKey(e.key);
      if (!id) return;
      if (a11y.applyViewportCommand(id, this.viewport)) {
        e.preventDefault();
        this.onViewportChange();
      }
      // focus-next etc. are handled by the Shell's roving tabindex.
    }

    destroy() {
      for (const b of this._bound) b.target.removeEventListener(b.type, b.fn, b.opts);
      this._bound.length = 0;
      this._pointers.clear();
      this._drag = null;
      this._pinch = null;
    }
  }

  LWS.InteractionController = InteractionController;
})(typeof self !== 'undefined' ? self : this);

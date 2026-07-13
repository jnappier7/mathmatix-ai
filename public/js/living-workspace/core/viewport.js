/* ============================================================
   viewport.js — the coordinate system for the Living Workspace.

   Pure math, no DOM. Owns the world↔screen transform (pan + zoom)
   for a bounded canvas (spec §3.1 "free-feeling but bounded"). The
   grid renderer draws through it; the OverlayManager positions DOM
   elements through it; a future Fabric hit-test layer (P6) can be
   backed by the SAME transform — this is the seam that lets us defer
   Fabric without repricing the overlay contract (B4a).

   Screen space = CSS pixels within the workspace viewport (origin
   top-left, y-down). World space = logical workspace units (origin
   top-left of the world, y-down). A tile at world (100,100) always
   maps to the same content regardless of pan/zoom.

     screen = (world - pan) * scale
     world  = screen / scale + pan

   UMD-lite: usable as `require('.../viewport')` in jest and as
   `window.LWS.Viewport` in the browser (no bundler needed).
   ============================================================ */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else { (root.LWS = root.LWS || {}).Viewport = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    minScale: 0.25,
    maxScale: 4,
    // World bounds — the canvas is bounded, not infinite (spec §3.1).
    world: { width: 2400, height: 1600 },
  };

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  class Viewport {
    constructor(opts = {}) {
      this.minScale = opts.minScale != null ? opts.minScale : DEFAULTS.minScale;
      this.maxScale = opts.maxScale != null ? opts.maxScale : DEFAULTS.maxScale;
      this.world = Object.assign({}, DEFAULTS.world, opts.world);
      // viewport (screen) size in CSS px — set via resize()
      this.viewW = opts.viewW || 0;
      this.viewH = opts.viewH || 0;
      // pan = world coordinate shown at the viewport's top-left corner
      this.panX = 0;
      this.panY = 0;
      this.scale = clamp(opts.scale || 1, this.minScale, this.maxScale);
    }

    resize(viewW, viewH) {
      this.viewW = Math.max(0, viewW | 0);
      this.viewH = Math.max(0, viewH | 0);
      this._clampPan();
      return this;
    }

    // ── transforms ──
    worldToScreen(x, y) {
      return { x: (x - this.panX) * this.scale, y: (y - this.panY) * this.scale };
    }
    screenToWorld(x, y) {
      return { x: x / this.scale + this.panX, y: y / this.scale + this.panY };
    }
    // CSS transform string for a DOM overlay anchored at world (x,y):
    //   translate(screenX, screenY) scale(s)
    cssTransform(x, y) {
      const s = this.worldToScreen(x, y);
      return `translate(${s.x}px, ${s.y}px) scale(${this.scale})`;
    }

    // ── pan ──
    panByScreen(dxScreen, dyScreen) {
      // Dragging content right (dx>0) reveals content to the LEFT → pan decreases.
      this.panX -= dxScreen / this.scale;
      this.panY -= dyScreen / this.scale;
      this._clampPan();
      return this;
    }
    setPan(x, y) { this.panX = x; this.panY = y; this._clampPan(); return this; }

    // ── zoom ──
    // Zoom toward a screen-space focus point (e.g. the cursor) so the world
    // point under the cursor stays put — the "no drift on zoom" invariant.
    zoomAt(screenX, screenY, factor) {
      const before = this.screenToWorld(screenX, screenY);
      this.scale = clamp(this.scale * factor, this.minScale, this.maxScale);
      const after = this.screenToWorld(screenX, screenY);
      // shift pan so the focus world-point maps back to the same screen point
      this.panX += before.x - after.x;
      this.panY += before.y - after.y;
      this._clampPan();
      return this;
    }
    setScale(scale, focusScreenX, focusScreenY) {
      const fx = focusScreenX != null ? focusScreenX : this.viewW / 2;
      const fy = focusScreenY != null ? focusScreenY : this.viewH / 2;
      return this.zoomAt(fx, fy, clamp(scale, this.minScale, this.maxScale) / this.scale);
    }

    reset() { this.panX = 0; this.panY = 0; this.scale = 1; this._clampPan(); return this; }

    // Keep the world in view: pan is clamped so you can't scroll the bounded
    // world entirely off-screen. When the world is smaller than the viewport
    // on an axis, it's pinned to 0 (no wobble).
    _clampPan() {
      const maxPanX = Math.max(0, this.world.width - this.viewW / this.scale);
      const maxPanY = Math.max(0, this.world.height - this.viewH / this.scale);
      this.panX = clamp(this.panX, 0, maxPanX);
      this.panY = clamp(this.panY, 0, maxPanY);
    }

    // Serializable view state (for snapshots / resume).
    toJSON() { return { panX: this.panX, panY: this.panY, scale: this.scale }; }
    applyJSON(v) {
      if (!v || typeof v !== 'object') return this;
      if (Number.isFinite(v.scale)) this.scale = clamp(v.scale, this.minScale, this.maxScale);
      if (Number.isFinite(v.panX)) this.panX = v.panX;
      if (Number.isFinite(v.panY)) this.panY = v.panY;
      this._clampPan();
      return this;
    }
  }

  Viewport.clamp = clamp;
  return Viewport;
});

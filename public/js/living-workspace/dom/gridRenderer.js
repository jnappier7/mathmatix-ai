/* ============================================================
   gridRenderer.js — the graph-paper substrate (spec §P3).

   Draws the bounded world's grid onto a plain 2D <canvas> through the
   Viewport transform. Plain canvas (not Fabric) on purpose: the
   substrate is a static backdrop with nothing to hit-test, so it
   needs no object model. Fabric enters at P6 for hit-testable tiles,
   plugged into the SAME Viewport — the grid stays exactly as is.

   Renders on a devicePixelRatio-scaled backing store so lines stay
   crisp at zoom / on hi-dpi Chromebooks. Only redraws when asked
   (the Shell batches redraws into rAF), so panning is one fill + a
   set of lineTo's — cheap.

   Browser-only (needs canvas 2D). Global: window.LWS.GridRenderer.
   ============================================================ */
(function (root) {
  'use strict';
  const LWS = (root.LWS = root.LWS || {});

  const MINOR = 40;   // world units between minor gridlines
  const MAJOR = 5;    // every Nth line is a major (heavier) line

  class GridRenderer {
    constructor(canvas, viewport, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.viewport = viewport;
      this.minor = opts.minor || MINOR;
      this.major = opts.major || MAJOR;
      this.dpr = 1;
    }

    // Size the backing store to CSS size × dpr for crisp lines.
    resize(cssW, cssH, dpr) {
      this.dpr = dpr || (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
      this.canvas.width = Math.max(1, Math.round(cssW * this.dpr));
      this.canvas.height = Math.max(1, Math.round(cssH * this.dpr));
      this.canvas.style.width = cssW + 'px';
      this.canvas.style.height = cssH + 'px';
    }

    _css(name, fallback) {
      if (typeof window === 'undefined') return fallback;
      const v = getComputedStyle(this.canvas).getPropertyValue(name);
      return (v && v.trim()) || fallback;
    }

    draw() {
      const ctx = this.ctx;
      const vp = this.viewport;
      const W = this.canvas.width;
      const H = this.canvas.height;
      const s = this.dpr;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // substrate fill
      ctx.fillStyle = this._css('--lws-grid-bg', '#0f1422');
      ctx.fillRect(0, 0, W, H);

      const minorColor = this._css('--lws-grid-minor', 'rgba(255,255,255,0.05)');
      const majorColor = this._css('--lws-grid-major', 'rgba(255,255,255,0.11)');
      const step = this.minor;

      // world range currently visible
      const topLeft = vp.screenToWorld(0, 0);
      const botRight = vp.screenToWorld(vp.viewW, vp.viewH);
      const x0 = Math.max(0, Math.floor(topLeft.x / step) * step);
      const y0 = Math.max(0, Math.floor(topLeft.y / step) * step);
      const x1 = Math.min(vp.world.width, botRight.x);
      const y1 = Math.min(vp.world.height, botRight.y);

      // vertical lines
      for (let wx = x0; wx <= x1; wx += step) {
        const isMajor = Math.round(wx / step) % this.major === 0;
        const sx = Math.round(vp.worldToScreen(wx, 0).x * s) + 0.5;
        ctx.beginPath();
        ctx.moveTo(sx, Math.max(0, vp.worldToScreen(0, y0).y * s));
        ctx.lineTo(sx, Math.min(H, vp.worldToScreen(0, y1).y * s));
        ctx.lineWidth = isMajor ? 1.2 : 1;
        ctx.strokeStyle = isMajor ? majorColor : minorColor;
        ctx.stroke();
      }
      // horizontal lines
      for (let wy = y0; wy <= y1; wy += step) {
        const isMajor = Math.round(wy / step) % this.major === 0;
        const sy = Math.round(vp.worldToScreen(0, wy).y * s) + 0.5;
        ctx.beginPath();
        ctx.moveTo(Math.max(0, vp.worldToScreen(x0, 0).x * s), sy);
        ctx.lineTo(Math.min(W, vp.worldToScreen(x1, 0).x * s), sy);
        ctx.lineWidth = isMajor ? 1.2 : 1;
        ctx.strokeStyle = isMajor ? majorColor : minorColor;
        ctx.stroke();
      }

      // world border (shows the bounded edge)
      const tl = vp.worldToScreen(0, 0);
      const br = vp.worldToScreen(vp.world.width, vp.world.height);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = this._css('--lws-grid-border', 'rgba(255,255,255,0.22)');
      ctx.strokeRect(tl.x * s, tl.y * s, (br.x - tl.x) * s, (br.y - tl.y) * s);
    }
  }

  LWS.GridRenderer = GridRenderer;
})(typeof self !== 'undefined' ? self : this);

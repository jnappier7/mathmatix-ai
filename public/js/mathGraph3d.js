/**
 * MathGraph3D — canvas 3D plotting for space curves and surfaces.
 *
 * Companion to mathGraph.js (2D). Same spirit: no dependencies, no eval, no
 * WebGL — a plain 2D canvas with an explicit projection, so it renders
 * identically everywhere the chat does and degrades to a static image on a
 * device that can't handle the interaction.
 *
 * Two modes:
 *   parametric — a curve through space, (x(t), y(t), z(t)). This is the one
 *                that draws a spiral/helix, the canonical "why do we care
 *                about 3D" example: a circle in x-y that climbs in z.
 *   surface    — a height field z = f(x, y), drawn as shaded quads.
 *
 * Interaction: drag to rotate, wheel to zoom, and a slow auto-spin that stops
 * the moment the student takes over — a spiral seen from one fixed angle just
 * looks like a circle or a wave, so the rotation is doing real explanatory
 * work here, not decoration.
 *
 * Depends on window.MathEval (mathGraph.js) for expression compilation.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;

  // Ready-made curves so the tutor can ask for the common ones by name and
  // still get correct parameters — a helix with a badly chosen pitch or t-range
  // reads as a circle or a scribble.
  const PRESETS = {
    helix: {
      x: 'cos(t)', y: 'sin(t)', z: 't/3', tMin: 0, tMax: 6 * Math.PI,
      title: 'Helix — a circle that climbs',
    },
    spiral: {
      x: 'cos(t)', y: 'sin(t)', z: 't/3', tMin: 0, tMax: 6 * Math.PI,
      title: 'Spiral (helix)',
    },
    conical_spiral: {
      x: 't*cos(t)/6', y: 't*sin(t)/6', z: 't/3', tMin: 0, tMax: 6 * Math.PI,
      title: 'Conical spiral — radius grows as it climbs',
    },
    flat_spiral: {
      x: 't*cos(t)/6', y: 't*sin(t)/6', z: '0', tMin: 0, tMax: 6 * Math.PI,
      title: 'Flat spiral (Archimedean)',
    },
    toroidal_spiral: {
      x: '(3+cos(6t))*cos(t)/1.5', y: '(3+cos(6t))*sin(t)/1.5', z: 'sin(6t)/1.5',
      tMin: 0, tMax: TAU, title: 'Toroidal spiral',
    },
    saddle: { mode: 'surface', z: '(x^2-y^2)/4', title: 'Saddle: z = (x² − y²)/4' },
    paraboloid: { mode: 'surface', z: '(x^2+y^2)/4', title: 'Paraboloid: z = (x² + y²)/4' },
    ripple: { mode: 'surface', z: 'sin(sqrt(x^2+y^2))', title: 'Ripple: z = sin(√(x² + y²))' },
  };

  class MathGraph3D {
    constructor(container, config = {}) {
      this.container = typeof container === 'string'
        ? document.querySelector(container) : container;
      if (!this.container) throw new Error('MathGraph3D: container not found');

      const preset = config.preset && PRESETS[String(config.preset).toLowerCase()];
      const merged = Object.assign({}, preset || {}, config);

      this.config = Object.assign({
        mode: 'parametric',
        x: 'cos(t)', y: 'sin(t)', z: 't/3',
        tMin: 0, tMax: 6 * Math.PI, samples: 700,
        xMin: -5, xMax: 5, yMin: -5, yMax: 5, grid: 34,
        title: '',
        color: '#667eea',
        lineWidth: 2.6,
        spin: true,
        spinSpeed: 0.15,          // radians per second
        showAxes: true,
        showShadow: true,         // project the curve onto the floor plane
        interactive: true,
      }, merged);

      this.yaw = -0.9;            // rotation about the vertical (z) axis
      this.pitch = 0.42;          // tilt toward the viewer
      this.scale = 1;
      this.dpr = window.devicePixelRatio || 1;
      this.isDark = document.body.classList.contains('dark-mode');

      this._spinning = this.config.spin;
      this._raf = null;
      this._lastFrame = null;
      this._error = null;

      this._build();
      this._compile();
      this._buildGeometry();
      this._bind();

      this.render();
      if (this._spinning) this._startSpin();

      this._resizeObserver = new ResizeObserver(() => this.render());
      this._resizeObserver.observe(this.container);
    }

    // ── Setup ──────────────────────────────────────────────────────
    _build() {
      this.wrapper = document.createElement('div');
      this.wrapper.className = 'mg3d-wrapper';
      this.wrapper.setAttribute('role', 'region');
      this.wrapper.setAttribute('aria-label', this.config.title || 'Interactive 3D graph');

      this.canvas = document.createElement('canvas');
      this.canvas.className = 'mg3d-canvas';
      this.canvas.setAttribute('role', 'img');
      this.canvas.style.touchAction = 'none';
      this.canvas.style.cursor = this.config.interactive ? 'grab' : 'default';
      this.wrapper.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');

      this.container.appendChild(this.wrapper);
    }

    _compile() {
      const E = window.MathEval;
      if (!E) { this._error = 'Graph engine not loaded'; return; }
      try {
        if (this.config.mode === 'surface') {
          // z = f(x, y): x is the primary variable, y comes from the scope.
          const f = E.parse(this.config.z, { vars: ['y'] });
          this._zf = (x, y) => f(x, { y });
        } else {
          this._xf = E.parse(this.config.x, { varName: 't' });
          this._yf = E.parse(this.config.y, { varName: 't' });
          this._zf3 = E.parse(this.config.z, { varName: 't' });
        }
      } catch (err) {
        this._error = `Could not read the expression: ${err.message}`;
      }
    }

    /**
     * Sample the curve/surface ONCE into model space, and record the extent so
     * the projection can normalise it. Rotating then only re-projects these
     * points, which is what keeps the spin smooth on a phone.
     */
    _buildGeometry() {
      if (this._error) return;
      this.points = [];
      this.quads = [];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      const track = (x, y, z) => {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      };

      if (this.config.mode === 'surface') {
        const { xMin, xMax, yMin, yMax } = this.config;
        const n = Math.max(8, Math.min(80, this.config.grid | 0));
        const rows = [];
        for (let j = 0; j <= n; j++) {
          const y = yMin + (j / n) * (yMax - yMin);
          const row = [];
          for (let i = 0; i <= n; i++) {
            const x = xMin + (i / n) * (xMax - xMin);
            let z;
            try { z = this._zf(x, y); } catch (_) { z = NaN; }
            if (!isFinite(z)) z = NaN; else track(x, y, z);
            row.push({ x, y, z });
          }
          rows.push(row);
        }
        // Quads, skipping any cell with an undefined corner (a hole in the
        // domain, e.g. a log or a square root going negative).
        for (let j = 0; j < n; j++) {
          for (let i = 0; i < n; i++) {
            const a = rows[j][i], b = rows[j][i + 1], c = rows[j + 1][i + 1], d = rows[j + 1][i];
            if (!isFinite(a.z) || !isFinite(b.z) || !isFinite(c.z) || !isFinite(d.z)) continue;
            this.quads.push([a, b, c, d]);
          }
        }
      } else {
        const { tMin, tMax } = this.config;
        const n = Math.max(40, Math.min(4000, this.config.samples | 0));
        for (let i = 0; i <= n; i++) {
          const t = tMin + (i / n) * (tMax - tMin);
          let x, y, z;
          try { x = this._xf(t); y = this._yf(t); z = this._zf3(t); } catch (_) { x = y = z = NaN; }
          const ok = isFinite(x) && isFinite(y) && isFinite(z);
          if (ok) track(x, y, z);
          this.points.push({ x, y, z, t, ok });
        }
      }

      if (!isFinite(minX)) { this._error = 'Nothing to plot'; return; }
      // Guard against a degenerate axis (a flat spiral has zero z extent).
      const span = (lo, hi) => (hi - lo < 1e-9 ? 1 : hi - lo);
      this.bounds = { minX, maxX, minY, maxY, minZ, maxZ };
      this.center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
      this.radius = Math.max(span(minX, maxX), span(minY, maxY), span(minZ, maxZ)) / 2;
    }

    _bind() {
      if (!this.config.interactive) return;
      let dragging = false, lastX = 0, lastY = 0;

      const down = (px, py) => {
        dragging = true; lastX = px; lastY = py;
        this._stopSpin();                       // hand control to the student
        this.canvas.style.cursor = 'grabbing';
      };
      const move = (px, py) => {
        if (!dragging) return;
        this.yaw += (px - lastX) * 0.01;
        // Clamp the tilt just short of the poles; past vertical the scene
        // flips over and the axis labels read upside down.
        this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + (py - lastY) * 0.01));
        lastX = px; lastY = py;
        this.render();
      };
      const up = () => { dragging = false; this.canvas.style.cursor = 'grab'; };

      // Named so they can actually be removed again in destroy() — an inline
      // arrow would leave this graph handling drags after it's gone.
      const onMouseMove = (e) => move(e.clientX, e.clientY);
      const onMouseUp = () => up();

      this.canvas.addEventListener('mousedown', (e) => { down(e.clientX, e.clientY); e.preventDefault(); });
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);

      this.canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) { down(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }
      }, { passive: false });
      this.canvas.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) { move(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }
      }, { passive: false });
      this.canvas.addEventListener('touchend', up);

      this.canvas.addEventListener('wheel', (e) => {
        this.scale = Math.max(0.35, Math.min(4, this.scale * (e.deltaY > 0 ? 0.9 : 1.1)));
        this.render();
        e.preventDefault();
      }, { passive: false });

      this._cleanup = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
    }

    // ── Projection ─────────────────────────────────────────────────
    /**
     * Model space → screen. Rotate about z (yaw), tilt (pitch), then apply a
     * mild perspective divide so the far end of a helix is visibly smaller —
     * that depth cue is what makes it read as a spring instead of a flat wave.
     */
    _project(p) {
      const cx = (p.x - this.center.x) / this.radius;
      const cy = (p.y - this.center.y) / this.radius;
      const cz = (p.z - this.center.z) / this.radius;

      const cosY = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
      const x1 = cx * cosY - cy * sinY;
      const y1 = cx * sinY + cy * cosY;

      // Camera at elevation `pitch` above the x-y plane, looking at the origin.
      // z must dominate the screen-vertical term: on a 3D math graph the z-axis
      // points UP, and swapping these two roles tips the scene into a top-down
      // view where a helix reads as flat concentric circles.
      // Sanity check: at pitch 0 (level with the plane) up = z and depth = y;
      // at pitch π/2 (straight down) up = −y and depth = z.
      const cosP = Math.cos(this.pitch), sinP = Math.sin(this.pitch);
      const up = cz * cosP - y1 * sinP;
      const depth = y1 * cosP + cz * sinP;

      const DIST = 4.2;
      const persp = DIST / (DIST + depth);
      const unit = Math.min(this._w, this._h) * 0.33 * this.scale;

      return {
        px: this._w / 2 + x1 * unit * persp,
        py: this._h / 2 - up * unit * persp,
        depth,
      };
    }

    // ── Render ─────────────────────────────────────────────────────
    render() {
      const rect = this.container.getBoundingClientRect();
      const w = rect.width || 300;
      const h = Math.min(w * 0.78, 360);

      this.canvas.width = w * this.dpr;
      this.canvas.height = h * this.dpr;
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this._w = w * this.dpr;
      this._h = h * this.dpr;

      const ctx = this.ctx;
      this.isDark = document.body.classList.contains('dark-mode');
      ctx.clearRect(0, 0, this._w, this._h);
      ctx.fillStyle = this.isDark ? '#1a1a2e' : '#fafbff';
      ctx.fillRect(0, 0, this._w, this._h);

      if (this._error) {
        ctx.fillStyle = this.isDark ? '#aaa' : '#666';
        ctx.font = `${13 * this.dpr}px -apple-system, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this._error, this._w / 2, this._h / 2);
        return;
      }

      if (this.config.showAxes) this._drawFloor();
      if (this.config.mode === 'surface') this._drawSurface();
      else this._drawCurve();
      if (this.config.showAxes) this._drawAxes();

      this.canvas.setAttribute('aria-label', this._describe());
    }

    /** Faint grid on the z = floor plane — the ground the shape sits above. */
    _drawFloor() {
      const ctx = this.ctx;
      const zFloor = this.bounds.minZ;
      const { minX, maxX, minY, maxY } = this.bounds;
      const N = 8;
      ctx.save();
      ctx.strokeStyle = this.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
      ctx.lineWidth = 1 * this.dpr;
      for (let i = 0; i <= N; i++) {
        const fx = minX + (i / N) * (maxX - minX);
        const fy = minY + (i / N) * (maxY - minY);
        const a = this._project({ x: fx, y: minY, z: zFloor });
        const b = this._project({ x: fx, y: maxY, z: zFloor });
        const c = this._project({ x: minX, y: fy, z: zFloor });
        const d = this._project({ x: maxX, y: fy, z: zFloor });
        ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(b.px, b.py); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(c.px, c.py); ctx.lineTo(d.px, d.py); ctx.stroke();
      }
      ctx.restore();
    }

    _drawCurve() {
      const ctx = this.ctx;
      const pts = this.points.map((p) => (p.ok ? Object.assign({ ok: true }, p, this._project(p)) : { ok: false }));

      // Shadow first: the same curve flattened onto the floor. For a helix this
      // is the payoff — the shadow is a circle, which is exactly the insight
      // that the spiral is "a circle that also rises".
      if (this.config.showShadow) {
        const zFloor = this.bounds.minZ;
        ctx.save();
        ctx.strokeStyle = this.isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.16)';
        ctx.lineWidth = 1.4 * this.dpr;
        ctx.setLineDash([4 * this.dpr, 4 * this.dpr]);
        ctx.beginPath();
        let started = false;
        for (const p of this.points) {
          if (!p.ok) { started = false; continue; }
          const s = this._project({ x: p.x, y: p.y, z: zFloor });
          if (!started) { ctx.moveTo(s.px, s.py); started = true; } else ctx.lineTo(s.px, s.py);
        }
        ctx.stroke();
        ctx.restore();
      }

      // The curve itself, drawn segment by segment so each can be shaded by its
      // own depth. Painter's order (far first) makes the near pass of a spring
      // overlap the far one correctly.
      const segs = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        if (!a.ok || !b.ok) continue;
        segs.push({ a, b, depth: (a.depth + b.depth) / 2 });
      }
      segs.sort((s1, s2) => s2.depth - s1.depth);

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const s of segs) {
        // depth ∈ roughly [-1, 1]; nearer segments are brighter and thicker.
        const near = Math.max(0, Math.min(1, (1 - s.depth) / 2));
        ctx.globalAlpha = 0.4 + 0.6 * near;
        ctx.lineWidth = this.config.lineWidth * (0.65 + 0.6 * near) * this.dpr;
        ctx.strokeStyle = this.config.color;
        ctx.beginPath();
        ctx.moveTo(s.a.px, s.a.py);
        ctx.lineTo(s.b.px, s.b.py);
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawSurface() {
      const ctx = this.ctx;
      const faces = [];
      for (const q of this.quads) {
        const proj = q.map((p) => this._project(p));
        const depth = (proj[0].depth + proj[1].depth + proj[2].depth + proj[3].depth) / 4;
        const zAvg = (q[0].z + q[1].z + q[2].z + q[3].z) / 4;
        faces.push({ proj, depth, zAvg });
      }
      faces.sort((a, b) => b.depth - a.depth);   // painter's algorithm

      const { minZ, maxZ } = this.bounds;
      const zSpan = (maxZ - minZ) || 1;
      ctx.save();
      for (const f of faces) {
        // Colour by height so the shape of the surface is legible even from a
        // head-on angle where the silhouette alone tells you little.
        const t = (f.zAvg - minZ) / zSpan;
        const hue = 250 - t * 190;              // violet (low) → gold (high)
        const near = Math.max(0, Math.min(1, (1 - f.depth) / 2));
        ctx.fillStyle = `hsl(${hue}, 68%, ${38 + near * 22}%)`;
        ctx.strokeStyle = this.isDark ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.32)';
        ctx.lineWidth = 0.6 * this.dpr;
        ctx.beginPath();
        ctx.moveTo(f.proj[0].px, f.proj[0].py);
        for (let i = 1; i < 4; i++) ctx.lineTo(f.proj[i].px, f.proj[i].py);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawAxes() {
      const ctx = this.ctx;
      const { minX, maxX, minY, maxY, minZ, maxZ } = this.bounds;
      const o = { x: minX, y: minY, z: minZ };
      const axes = [
        { to: { x: maxX, y: minY, z: minZ }, label: 'x', color: '#e84393' },
        { to: { x: minX, y: maxY, z: minZ }, label: 'y', color: '#00b894' },
        { to: { x: minX, y: minY, z: maxZ }, label: 'z', color: '#0984e3' },
      ];
      const origin = this._project(o);

      ctx.save();
      ctx.lineWidth = 1.6 * this.dpr;
      ctx.font = `600 ${11 * this.dpr}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const ax of axes) {
        const end = this._project(ax.to);
        ctx.strokeStyle = ax.color;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.moveTo(origin.px, origin.py);
        ctx.lineTo(end.px, end.py);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = ax.color;
        // Nudge the label past the axis tip so it never sits on the line.
        const dx = end.px - origin.px, dy = end.py - origin.py;
        const len = Math.hypot(dx, dy) || 1;
        ctx.fillText(ax.label, end.px + (dx / len) * 12 * this.dpr, end.py + (dy / len) * 12 * this.dpr);
      }
      ctx.restore();
    }

    _describe() {
      if (this.config.mode === 'surface') {
        return `${this.config.title || '3D surface'}. Surface z = ${this.config.z} over x from ${this.config.xMin} to ${this.config.xMax} and y from ${this.config.yMin} to ${this.config.yMax}.`;
      }
      return `${this.config.title || '3D curve'}. Space curve with x = ${this.config.x}, y = ${this.config.y}, z = ${this.config.z}, for t from ${this._fmt(this.config.tMin)} to ${this._fmt(this.config.tMax)}.`;
    }

    _fmt(n) {
      if (!isFinite(n)) return String(n);
      return Math.abs(n - Math.round(n)) < 1e-6 ? String(Math.round(n)) : n.toFixed(2);
    }

    // ── Spin ───────────────────────────────────────────────────────
    _startSpin() {
      if (this._raf) return;
      this._spinning = true;
      this._lastFrame = null;
      const tick = (now) => {
        if (!this._spinning) { this._raf = null; return; }
        if (this._lastFrame !== null) {
          this.yaw += this.config.spinSpeed * ((now - this._lastFrame) / 1000);
        }
        this._lastFrame = now;
        this.render();
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    }

    _stopSpin() {
      this._spinning = false;
      if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    }

    toggleSpin() {
      if (this._spinning) this._stopSpin(); else this._startSpin();
      return this._spinning;
    }

    reset() {
      this.yaw = -0.9;
      this.pitch = 0.42;
      this.scale = 1;
      this.render();
    }

    destroy() {
      this._stopSpin();
      if (this._resizeObserver) this._resizeObserver.disconnect();
      if (this._cleanup) this._cleanup();
      if (this.wrapper && this.wrapper.parentNode) this.wrapper.parentNode.removeChild(this.wrapper);
    }
  }

  window.MathGraph3D = MathGraph3D;
  window.MathGraph3DPresets = PRESETS;
})();

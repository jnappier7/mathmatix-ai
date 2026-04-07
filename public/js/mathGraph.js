/**
 * MathGraph v2 — Exquisite Canvas-based function graphing engine.
 *
 * Features:
 *   - Safe recursive-descent expression parser (no eval)
 *   - Animated curve tracing on render
 *   - Auto-detected key points: intercepts, extrema, holes, vertical asymptotes
 *   - Snap-to-curve hover with glowing tracer dot
 *   - Tangent line overlay on hover (shows slope)
 *   - Tappable key-points info bar below graph
 *   - Curve glow / luminous rendering
 *   - Smooth animated zoom transitions
 *   - Double-tap to zoom (mobile)
 *   - Pan, scroll-zoom, pinch-zoom, HiDPI, dark mode
 */

(function () {
  'use strict';

  // ─── Safe math expression evaluator ────────────────────────────────
  const MathEval = {
    tokenize(expr) {
      const tokens = [];
      let i = 0;
      while (i < expr.length) {
        const ch = expr[i];
        if (/\s/.test(ch)) { i++; continue; }
        if (/[\d.]/.test(ch)) {
          let num = '';
          while (i < expr.length && /[\d.]/.test(expr[i])) num += expr[i++];
          tokens.push({ type: 'num', value: parseFloat(num) });
          continue;
        }
        if (/[a-zA-Z_]/.test(ch)) {
          let id = '';
          while (i < expr.length && /[a-zA-Z_\d]/.test(expr[i])) id += expr[i++];
          tokens.push({ type: 'id', value: id });
          continue;
        }
        if (ch === '*' && expr[i + 1] === '*') {
          tokens.push({ type: 'op', value: '**' }); i += 2; continue;
        }
        if ('+-*/^(),|'.includes(ch)) {
          tokens.push({ type: 'op', value: ch }); i++; continue;
        }
        i++;
      }
      return tokens;
    },

    parse(expr) {
      let normalised = expr.replace(/\s+/g, '')
        .replace(/÷/g, '/').replace(/×/g, '*').replace(/−/g, '-')
        .replace(/²/g, '^2').replace(/³/g, '^3').replace(/⁴/g, '^4').replace(/π/g, 'pi');

      const tokens = this.tokenize(normalised);
      let pos = 0;
      const peek = () => tokens[pos] || null;
      const consume = (expected) => {
        const t = tokens[pos];
        if (expected && (!t || t.value !== expected))
          throw new Error(`Expected '${expected}' got '${t ? t.value : 'EOF'}'`);
        pos++; return t;
      };

      function parseExpr() {
        let left = parseTerm();
        while (peek() && (peek().value === '+' || peek().value === '-')) {
          const op = consume().value; const right = parseTerm();
          const l = left, r = right;
          left = op === '+' ? (x) => l(x) + r(x) : (x) => l(x) - r(x);
        }
        return left;
      }

      function parseTerm() {
        let left = parseUnary();
        while (peek() && (peek().value === '*' || peek().value === '/')) {
          const op = consume().value; const right = parseUnary();
          const l = left, r = right;
          left = op === '*' ? (x) => l(x) * r(x) : (x) => { const d = r(x); return d === 0 ? NaN : l(x) / d; };
        }
        return left;
      }

      function parseUnary() {
        if (peek() && peek().value === '-') { consume(); const inner = parseUnary(); return (x) => -inner(x); }
        if (peek() && peek().value === '+') { consume(); return parseUnary(); }
        return parsePower();
      }

      function parsePower() {
        let base = parseImplicitMult();
        if (peek() && (peek().value === '^' || peek().value === '**')) {
          consume(); const exp = parseUnary(); const b = base;
          return (x) => Math.pow(b(x), exp(x));
        }
        return base;
      }

      function parseImplicitMult() {
        let left = parseAtom();
        while (peek()) {
          const t = peek();
          if (t.type === 'num' || t.type === 'id' || t.value === '(' || t.value === '|') {
            const right = parseAtom(); const l = left, r = right;
            left = (x) => l(x) * r(x);
          } else break;
        }
        return left;
      }

      function parseAtom() {
        const t = peek();
        if (!t) throw new Error('Unexpected end of expression');
        if (t.value === '(') { consume('('); const inner = parseExpr(); consume(')'); return inner; }
        if (t.value === '|') { consume('|'); const inner = parseExpr(); consume('|'); return (x) => Math.abs(inner(x)); }
        if (t.type === 'num') { consume(); const val = t.value; return () => val; }
        if (t.type === 'id') {
          consume(); const name = t.value.toLowerCase();
          if (name === 'x') return (x) => x;
          if (name === 'pi') return () => Math.PI;
          if (name === 'e' && (!peek() || peek().value !== '(')) return () => Math.E;

          const fnMap = {
            sin: Math.sin, cos: Math.cos, tan: Math.tan,
            asin: Math.asin, acos: Math.acos, atan: Math.atan,
            sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
            sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, sign: Math.sign,
            log: Math.log, ln: Math.log, log10: Math.log10, log2: Math.log2,
            exp: Math.exp, ceil: Math.ceil, floor: Math.floor, round: Math.round,
            sec: (v) => 1 / Math.cos(v), csc: (v) => 1 / Math.sin(v), cot: (v) => 1 / Math.tan(v),
          };

          if (fnMap[name]) {
            if (peek() && peek().value === '(') {
              consume('('); const args = [parseExpr()];
              while (peek() && peek().value === ',') { consume(','); args.push(parseExpr()); }
              consume(')'); const fn = fnMap[name];
              return args.length === 1 ? ((a) => (x) => fn(a(x)))(args[0]) : (x) => fn(...args.map(a => a(x)));
            }
            const fn = fnMap[name]; return (x) => fn(x);
          }
          if (name === 'pow') {
            consume('('); const base = parseExpr(); consume(','); const exp = parseExpr(); consume(')');
            return (x) => Math.pow(base(x), exp(x));
          }
          if (name === 'max' || name === 'min') {
            consume('('); const args = [parseExpr()];
            while (peek() && peek().value === ',') { consume(','); args.push(parseExpr()); }
            consume(')'); const fn = name === 'max' ? Math.max : Math.min;
            return (x) => fn(...args.map(a => a(x)));
          }
          throw new Error(`Unknown identifier: ${name}`);
        }
        throw new Error(`Unexpected token: ${t.value}`);
      }

      return parseExpr();
    }
  };

  // ─── Easing helper ─────────────────────────────────────────────────
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  // ─── MathGraph v2 class ────────────────────────────────────────────
  class MathGraph {
    constructor(container, config = {}) {
      this.container = typeof container === 'string'
        ? document.querySelector(container) : container;
      if (!this.container) throw new Error('MathGraph: container not found');

      this.config = {
        xMin: -10, xMax: 10, yMin: null, yMax: null,
        title: '', color: '#667eea',
        colors: ['#667eea', '#e84393', '#00b894', '#fdcb6e', '#6c5ce7', '#e17055'],
        gridColor: null, bgColor: null,
        showGrid: true, showAxes: true, showLabels: true,
        lineWidth: 2.5, samplesPerPixel: 2,
        detectDiscontinuities: true, discontinuityThreshold: 50,
        interactive: true,
        animate: true,        // animate curve drawing
        showKeyPoints: true,  // auto-detect & show intercepts, extrema, etc.
        showTangent: true,    // show tangent line on hover
        showInfoBar: true,    // show key-points bar below graph
        glowEffect: true,     // subtle glow behind curves
        ...config
      };

      this.functions = [];
      this.keyPoints = [];       // detected key points
      this.isDark = document.body.classList.contains('dark-mode');
      this.dpr = window.devicePixelRatio || 1;

      this.viewport = {
        xMin: this.config.xMin, xMax: this.config.xMax,
        yMin: this.config.yMin, yMax: this.config.yMax
      };
      this._originalViewport = { ...this.viewport };

      // Animation state
      this._animProgress = 0;
      this._animRAF = null;
      this._animDone = false;

      // Zoom animation state
      this._zoomAnim = null;

      this._buildDOM();

      if (config.fn) this.addFunction(config.fn, this.config.color);
      if (config.data && Array.isArray(config.data)) {
        config.data.forEach((d, i) => {
          this.addFunction(d.fn, d.color || this.config.colors[i % this.config.colors.length]);
        });
      }

      this._autoFitY();
      this._detectKeyPoints();

      if (this.config.animate) {
        this._startAnimation();
      } else {
        this._animProgress = 1;
        this._animDone = true;
        this.render();
      }

      if (this.config.showInfoBar && this.config.interactive) this._buildInfoBar();

      this._resizeObserver = new ResizeObserver(() => this.render());
      this._resizeObserver.observe(this.container);
    }

    // ── DOM ──────────────────────────────────────────────────────
    _buildDOM() {
      this.wrapper = document.createElement('div');
      this.wrapper.className = 'mg-wrapper';

      this.canvas = document.createElement('canvas');
      this.canvas.className = 'mg-canvas';
      this.wrapper.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');

      this.tooltip = document.createElement('div');
      this.tooltip.className = 'mg-tooltip';
      this.tooltip.style.display = 'none';
      this.wrapper.appendChild(this.tooltip);

      this.crosshairCanvas = document.createElement('canvas');
      this.crosshairCanvas.className = 'mg-crosshair-canvas';
      this.wrapper.appendChild(this.crosshairCanvas);
      this.crossCtx = this.crosshairCanvas.getContext('2d');

      this.container.appendChild(this.wrapper);
      if (this.config.interactive) this._setupInteraction();
    }

    _buildInfoBar() {
      if (this.keyPoints.length === 0) return;
      this.infoBar = document.createElement('div');
      this.infoBar.className = 'mg-info-bar';

      const groups = {};
      for (const kp of this.keyPoints) {
        if (!groups[kp.type]) groups[kp.type] = [];
        groups[kp.type].push(kp);
      }

      const typeLabels = {
        'y-intercept': 'y-int', 'x-intercept': 'x-int', 'maximum': 'max',
        'minimum': 'min', 'v-asymptote': 'VA', 'hole': 'hole'
      };

      for (const type of ['y-intercept', 'x-intercept', 'maximum', 'minimum', 'v-asymptote', 'hole']) {
        if (!groups[type]) continue;
        for (const kp of groups[type]) {
          const pill = document.createElement('button');
          pill.className = `mg-info-pill mg-pill-${type}`;
          pill.textContent = `${typeLabels[type]}: ${kp.label}`;
          pill.addEventListener('click', () => this._flyTo(kp.x, kp.y));
          this.infoBar.appendChild(pill);
        }
      }

      this.wrapper.appendChild(this.infoBar);
    }

    // ── Interaction ──────────────────────────────────────────────
    _setupInteraction() {
      let isPanning = false;
      let lastX, lastY;
      let lastTapTime = 0;
      let lastTouchDist = null;

      // Mouse
      this.crosshairCanvas.addEventListener('mousemove', (e) => {
        if (isPanning) {
          const dx = e.clientX - lastX; const dy = e.clientY - lastY;
          lastX = e.clientX; lastY = e.clientY;
          const rect = this.canvas.getBoundingClientRect();
          const xRange = this.viewport.xMax - this.viewport.xMin;
          const yRange = this.viewport.yMax - this.viewport.yMin;
          this.viewport.xMin -= (dx / rect.width) * xRange;
          this.viewport.xMax -= (dx / rect.width) * xRange;
          this.viewport.yMin += (dy / rect.height) * yRange;
          this.viewport.yMax += (dy / rect.height) * yRange;
          this.render();
        }
        this._showCrosshair(e);
      });

      this.crosshairCanvas.addEventListener('mouseleave', () => {
        this._hideCrosshair(); isPanning = false;
      });

      this.crosshairCanvas.addEventListener('mousedown', (e) => {
        isPanning = true; lastX = e.clientX; lastY = e.clientY;
        this.crosshairCanvas.style.cursor = 'grabbing';
      });

      const onMouseUp = () => {
        isPanning = false;
        if (this.crosshairCanvas) this.crosshairCanvas.style.cursor = 'crosshair';
      };
      window.addEventListener('mouseup', onMouseUp);
      this._cleanupFns = this._cleanupFns || [];
      this._cleanupFns.push(() => window.removeEventListener('mouseup', onMouseUp));

      // Wheel zoom
      this.crosshairCanvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1.15 : 0.87;
        const rect = this.canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) / rect.width;
        const my = (e.clientY - rect.top) / rect.height;
        this._zoomAt(mx, my, factor);
        this._showCrosshair(e);
      }, { passive: false });

      // Touch
      this.crosshairCanvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          // Double-tap detection
          const now = Date.now();
          if (now - lastTapTime < 300) {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mx = (e.touches[0].clientX - rect.left) / rect.width;
            const my = (e.touches[0].clientY - rect.top) / rect.height;
            this._animateZoomAt(mx, my, 0.5);
            lastTapTime = 0;
            return;
          }
          lastTapTime = now;
          isPanning = true;
          lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
          isPanning = false;
          lastTouchDist = Math.hypot(
            e.touches[1].clientX - e.touches[0].clientX,
            e.touches[1].clientY - e.touches[0].clientY
          );
        }
        e.preventDefault();
      }, { passive: false });

      this.crosshairCanvas.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && isPanning) {
          const dx = e.touches[0].clientX - lastX;
          const dy = e.touches[0].clientY - lastY;
          lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
          const rect = this.canvas.getBoundingClientRect();
          const xR = this.viewport.xMax - this.viewport.xMin;
          const yR = this.viewport.yMax - this.viewport.yMin;
          this.viewport.xMin -= (dx / rect.width) * xR;
          this.viewport.xMax -= (dx / rect.width) * xR;
          this.viewport.yMin += (dy / rect.height) * yR;
          this.viewport.yMax += (dy / rect.height) * yR;
          this.render();
        } else if (e.touches.length === 2 && lastTouchDist !== null) {
          const dist = Math.hypot(
            e.touches[1].clientX - e.touches[0].clientX,
            e.touches[1].clientY - e.touches[0].clientY
          );
          const factor = lastTouchDist / dist;
          lastTouchDist = dist;
          this._zoomAt(0.5, 0.5, factor);
        }
        e.preventDefault();
      }, { passive: false });

      this.crosshairCanvas.addEventListener('touchend', () => {
        isPanning = false; lastTouchDist = null;
      });
    }

    // ── Public API ──────────────────────────────────────────────
    addFunction(fnStr, color, label) {
      try {
        const evaluator = MathEval.parse(fnStr);
        this.functions.push({
          fn: fnStr, evaluator,
          color: color || this.config.colors[this.functions.length % this.config.colors.length],
          label: label || fnStr
        });
      } catch (err) {
        console.error(`[MathGraph] Failed to parse "${fnStr}":`, err.message);
      }
    }

    zoom(factor) {
      if (this.config.animate) {
        this._animateZoomAt(0.5, 0.5, factor);
      } else {
        this._zoomAt(0.5, 0.5, factor);
      }
    }

    reset() {
      if (this.config.animate) {
        this._animateToViewport({ ...this._originalViewport });
      } else {
        this.viewport = { ...this._originalViewport };
        this.render();
      }
    }

    destroy() {
      if (this._animRAF) cancelAnimationFrame(this._animRAF);
      if (this._zoomAnim) cancelAnimationFrame(this._zoomAnim);
      if (this._resizeObserver) this._resizeObserver.disconnect();
      if (this._cleanupFns) this._cleanupFns.forEach(fn => fn());
      if (this.wrapper && this.wrapper.parentNode) {
        this.wrapper.parentNode.removeChild(this.wrapper);
      }
    }

    // ── Zoom helpers ──────────────────────────────────────────────
    _zoomAt(mx, my, factor) {
      const xR = this.viewport.xMax - this.viewport.xMin;
      const yR = this.viewport.yMax - this.viewport.yMin;
      const cx = this.viewport.xMin + mx * xR;
      const cy = this.viewport.yMax - my * yR;
      const nxR = xR * factor, nyR = yR * factor;
      this.viewport.xMin = cx - mx * nxR;
      this.viewport.xMax = cx + (1 - mx) * nxR;
      this.viewport.yMin = cy - (1 - my) * nyR;
      this.viewport.yMax = cy + my * nyR;
      this.render();
    }

    _animateZoomAt(mx, my, factor) {
      const xR = this.viewport.xMax - this.viewport.xMin;
      const yR = this.viewport.yMax - this.viewport.yMin;
      const cx = this.viewport.xMin + mx * xR;
      const cy = this.viewport.yMax - my * yR;
      const nxR = xR * factor, nyR = yR * factor;
      this._animateToViewport({
        xMin: cx - mx * nxR, xMax: cx + (1 - mx) * nxR,
        yMin: cy - (1 - my) * nyR, yMax: cy + my * nyR
      });
    }

    _animateToViewport(target) {
      if (this._zoomAnim) cancelAnimationFrame(this._zoomAnim);
      const from = { ...this.viewport };
      const start = performance.now();
      const duration = 300;
      const tick = () => {
        const t = Math.min((performance.now() - start) / duration, 1);
        const e = easeOutCubic(t);
        this.viewport.xMin = from.xMin + (target.xMin - from.xMin) * e;
        this.viewport.xMax = from.xMax + (target.xMax - from.xMax) * e;
        this.viewport.yMin = from.yMin + (target.yMin - from.yMin) * e;
        this.viewport.yMax = from.yMax + (target.yMax - from.yMax) * e;
        this.render();
        if (t < 1) this._zoomAnim = requestAnimationFrame(tick);
        else this._zoomAnim = null;
      };
      this._zoomAnim = requestAnimationFrame(tick);
    }

    _flyTo(x, y) {
      if (!isFinite(x)) return;
      const xR = this.viewport.xMax - this.viewport.xMin;
      const yR = this.viewport.yMax - this.viewport.yMin;
      const ty = isFinite(y) ? y : (this.viewport.yMin + this.viewport.yMax) / 2;
      this._animateToViewport({
        xMin: x - xR / 2, xMax: x + xR / 2,
        yMin: ty - yR / 2, yMax: ty + yR / 2
      });
    }

    // ── Auto-fit Y ──────────────────────────────────────────────
    _autoFitY() {
      if (this.viewport.yMin !== null && this.viewport.yMax !== null) return;
      if (this.functions.length === 0) {
        this.viewport.yMin = this.viewport.yMin ?? -10;
        this.viewport.yMax = this.viewport.yMax ?? 10;
        this._originalViewport = { ...this.viewport };
        return;
      }
      let min = Infinity, max = -Infinity;
      const xR = this.viewport.xMax - this.viewport.xMin;
      for (const { evaluator } of this.functions) {
        for (let i = 0; i <= 500; i++) {
          const x = this.viewport.xMin + (i / 500) * xR;
          try {
            const y = evaluator(x);
            if (isFinite(y) && Math.abs(y) < 1e6) {
              if (y < min) min = y; if (y > max) max = y;
            }
          } catch (_) {}
        }
      }
      if (!isFinite(min) || !isFinite(max)) { min = -10; max = 10; }
      const pad = Math.max((max - min) * 0.15, 1);
      this.viewport.yMin = this.viewport.yMin ?? (min - pad);
      this.viewport.yMax = this.viewport.yMax ?? (max + pad);
      this._originalViewport = { ...this.viewport };
    }

    // ── Key Point Detection ─────────────────────────────────────
    _detectKeyPoints() {
      if (!this.config.showKeyPoints) return;
      this.keyPoints = [];
      const { xMin, xMax } = this.viewport;
      const N = 2000;
      const dx = (xMax - xMin) / N;

      for (const func of this.functions) {
        const { evaluator, color } = func;
        const pts = [];
        for (let i = 0; i <= N; i++) {
          const x = xMin + i * dx;
          try { pts.push({ x, y: evaluator(x) }); }
          catch (_) { pts.push({ x, y: NaN }); }
        }

        // Y-intercept
        if (xMin <= 0 && xMax >= 0) {
          try {
            const y0 = evaluator(0);
            if (isFinite(y0)) this.keyPoints.push({
              type: 'y-intercept', x: 0, y: y0, label: `(0, ${this._fmt(y0)})`, color
            });
          } catch (_) {}
        }

        // X-intercepts (sign changes)
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          if (!isFinite(a.y) || !isFinite(b.y)) continue;
          if (a.y * b.y < 0 && Math.abs(a.y - b.y) < 100) {
            // Bisection refinement
            let lo = a.x, hi = b.x;
            for (let j = 0; j < 30; j++) {
              const mid = (lo + hi) / 2;
              try {
                const ym = evaluator(mid);
                if (!isFinite(ym)) break;
                if (ym * evaluator(lo) < 0) hi = mid; else lo = mid;
              } catch (_) { break; }
            }
            const xr = (lo + hi) / 2;
            // Check not near existing x-intercept
            const dup = this.keyPoints.some(k => k.type === 'x-intercept' && Math.abs(k.x - xr) < dx * 3);
            if (!dup) {
              this.keyPoints.push({
                type: 'x-intercept', x: xr, y: 0, label: `(${this._fmt(xr)}, 0)`, color
              });
            }
          }
        }

        // Local extrema (derivative sign changes)
        for (let i = 2; i < pts.length - 1; i++) {
          const a = pts[i - 1], b = pts[i], c = pts[i + 1];
          if (!isFinite(a.y) || !isFinite(b.y) || !isFinite(c.y)) continue;
          const d1 = b.y - a.y, d2 = c.y - b.y;
          if (d1 > 0 && d2 < 0 && Math.abs(d1) < 50 && Math.abs(d2) < 50) {
            // Local max — refine with golden section
            const refined = this._refineExtremum(evaluator, a.x, c.x, 'max');
            if (refined) {
              const dup = this.keyPoints.some(k => (k.type === 'maximum' || k.type === 'minimum') && Math.abs(k.x - refined.x) < dx * 5);
              if (!dup) this.keyPoints.push({
                type: 'maximum', x: refined.x, y: refined.y,
                label: `(${this._fmt(refined.x)}, ${this._fmt(refined.y)})`, color
              });
            }
          }
          if (d1 < 0 && d2 > 0 && Math.abs(d1) < 50 && Math.abs(d2) < 50) {
            const refined = this._refineExtremum(evaluator, a.x, c.x, 'min');
            if (refined) {
              const dup = this.keyPoints.some(k => (k.type === 'maximum' || k.type === 'minimum') && Math.abs(k.x - refined.x) < dx * 5);
              if (!dup) this.keyPoints.push({
                type: 'minimum', x: refined.x, y: refined.y,
                label: `(${this._fmt(refined.x)}, ${this._fmt(refined.y)})`, color
              });
            }
          }
        }

        // Vertical asymptotes & holes (NaN or huge jumps)
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          if (isFinite(a.y) && isFinite(b.y) && Math.abs(b.y - a.y) > 500) {
            const xm = (a.x + b.x) / 2;
            const dup = this.keyPoints.some(k => k.type === 'v-asymptote' && Math.abs(k.x - xm) < dx * 5);
            if (!dup) {
              // Check if it's a hole (removable) or true asymptote
              const nearVal = this._checkHole(evaluator, xm);
              if (nearVal !== null) {
                this.keyPoints.push({
                  type: 'hole', x: xm, y: nearVal,
                  label: `(${this._fmt(xm)}, ${this._fmt(nearVal)})`, color
                });
              } else {
                this.keyPoints.push({
                  type: 'v-asymptote', x: xm, y: NaN,
                  label: `x = ${this._fmt(xm)}`, color
                });
              }
            }
          }
          if (isFinite(a.y) && !isFinite(b.y)) {
            // Check neighbourhood
            const xm = b.x;
            const dup = this.keyPoints.some(k => (k.type === 'v-asymptote' || k.type === 'hole') && Math.abs(k.x - xm) < dx * 5);
            if (!dup) {
              const nearVal = this._checkHole(evaluator, xm);
              if (nearVal !== null) {
                this.keyPoints.push({ type: 'hole', x: xm, y: nearVal, label: `(${this._fmt(xm)}, ${this._fmt(nearVal)})`, color });
              } else {
                this.keyPoints.push({ type: 'v-asymptote', x: xm, y: NaN, label: `x = ${this._fmt(xm)}`, color });
              }
            }
          }
        }

        // Horizontal asymptotes (end behavior at large |x|)
        try {
          const farX = [1e4, 1e5, 1e6];
          const rightVals = farX.map(x => { try { return evaluator(x); } catch(_) { return NaN; } });
          const leftVals  = farX.map(x => { try { return evaluator(-x); } catch(_) { return NaN; } });

          // Check right HA: values converge to a limit
          if (rightVals.every(v => isFinite(v))) {
            const rDiff = Math.abs(rightVals[2] - rightVals[1]);
            if (rDiff < 0.001) {
              const haY = rightVals[2];
              const dup = this.keyPoints.some(k => k.type === 'h-asymptote' && Math.abs(k.y - haY) < 0.01);
              if (!dup) {
                this.keyPoints.push({
                  type: 'h-asymptote', x: NaN, y: haY,
                  label: `y = ${this._fmt(haY)}`, color: '#e84393'
                });
              }
            }
          }
          // Check left HA
          if (leftVals.every(v => isFinite(v))) {
            const lDiff = Math.abs(leftVals[2] - leftVals[1]);
            if (lDiff < 0.001) {
              const haY = leftVals[2];
              const dup = this.keyPoints.some(k => k.type === 'h-asymptote' && Math.abs(k.y - haY) < 0.01);
              if (!dup) {
                this.keyPoints.push({
                  type: 'h-asymptote', x: NaN, y: haY,
                  label: `y = ${this._fmt(haY)}`, color: '#e84393'
                });
              }
            }
          }
        } catch(_) {}
      }

      // Limit to reasonable count
      if (this.keyPoints.length > 25) {
        this.keyPoints = this.keyPoints.slice(0, 25);
      }
    }

    _refineExtremum(evaluator, lo, hi, type) {
      const gr = (Math.sqrt(5) + 1) / 2;
      for (let i = 0; i < 30; i++) {
        const d = (hi - lo) / gr;
        const x1 = hi - d, x2 = lo + d;
        try {
          const y1 = evaluator(x1), y2 = evaluator(x2);
          if (!isFinite(y1) || !isFinite(y2)) return null;
          if (type === 'max') { if (y1 > y2) hi = x2; else lo = x1; }
          else { if (y1 < y2) hi = x2; else lo = x1; }
        } catch (_) { return null; }
      }
      const x = (lo + hi) / 2;
      try {
        const y = evaluator(x);
        return isFinite(y) ? { x, y } : null;
      } catch (_) { return null; }
    }

    _checkHole(evaluator, x0) {
      // A hole means the limit exists but the function is undefined at x0.
      // Check if left-limit ≈ right-limit.
      const eps = 1e-6;
      try {
        const lVal = evaluator(x0 - eps);
        const rVal = evaluator(x0 + eps);
        if (isFinite(lVal) && isFinite(rVal) && Math.abs(lVal - rVal) < 0.5) {
          return (lVal + rVal) / 2;
        }
      } catch (_) {}
      return null;
    }

    // ── Coordinate conversion ────────────────────────────────────
    _xToPixel(x) { return ((x - this.viewport.xMin) / (this.viewport.xMax - this.viewport.xMin)) * this._w; }
    _yToPixel(y) { return ((this.viewport.yMax - y) / (this.viewport.yMax - this.viewport.yMin)) * this._h; }
    _pixelToX(px) { return this.viewport.xMin + (px / this._w) * (this.viewport.xMax - this.viewport.xMin); }
    _pixelToY(py) { return this.viewport.yMax - (py / this._h) * (this.viewport.yMax - this.viewport.yMin); }

    // ── Animation ────────────────────────────────────────────────
    _startAnimation() {
      this._animProgress = 0;
      this._animDone = false;
      const start = performance.now();
      const duration = 800;
      const tick = () => {
        const t = Math.min((performance.now() - start) / duration, 1);
        this._animProgress = easeOutCubic(t);
        this.render();
        if (t < 1) {
          this._animRAF = requestAnimationFrame(tick);
        } else {
          this._animDone = true;
          this._animRAF = null;
        }
      };
      this._animRAF = requestAnimationFrame(tick);
    }

    // ── Main render ──────────────────────────────────────────────
    render() {
      const rect = this.container.getBoundingClientRect();
      const w = rect.width || 300;
      const h = Math.min(w * 0.75, 350);

      this.canvas.width = w * this.dpr;
      this.canvas.height = h * this.dpr;
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';

      this.crosshairCanvas.width = w * this.dpr;
      this.crosshairCanvas.height = h * this.dpr;
      this.crosshairCanvas.style.width = w + 'px';
      this.crosshairCanvas.style.height = h + 'px';

      this._w = w * this.dpr;
      this._h = h * this.dpr;

      const ctx = this.ctx;
      ctx.save();
      this.isDark = document.body.classList.contains('dark-mode');

      const bg = this.config.bgColor || (this.isDark ? '#1a1a2e' : '#fafbff');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, this._w, this._h);

      if (this.config.showGrid) this._drawGrid();
      if (this.config.showAxes) this._drawAxes();

      ctx.beginPath();
      ctx.rect(0, 0, this._w, this._h);
      ctx.clip();

      this._drawFunctions();
      if (this._animDone) this._drawKeyPointMarkers();
      if (this._animDone && this.functions.length > 1) this._drawLegend();

      ctx.restore();
      this.crossCtx.clearRect(0, 0, this._w, this._h);
    }

    // ── Grid ─────────────────────────────────────────────────────
    _drawGrid() {
      const ctx = this.ctx;
      const { xMin, xMax, yMin, yMax } = this.viewport;
      const xStep = this._niceStep(xMax - xMin);
      const yStep = this._niceStep(yMax - yMin);

      const minor = this.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
      const major = this.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

      const xStart = Math.ceil(xMin / xStep) * xStep;
      for (let x = xStart; x <= xMax; x += xStep) {
        const px = this._xToPixel(x);
        const isMajor = Math.abs(Math.round(x / (xStep * 5)) * xStep * 5 - x) < xStep * 0.01;
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, this._h);
        ctx.strokeStyle = isMajor ? major : minor;
        ctx.lineWidth = (isMajor ? 1 : 0.5) * this.dpr;
        ctx.stroke();
      }

      const yStart = Math.ceil(yMin / yStep) * yStep;
      for (let y = yStart; y <= yMax; y += yStep) {
        const py = this._yToPixel(y);
        const isMajor = Math.abs(Math.round(y / (yStep * 5)) * yStep * 5 - y) < yStep * 0.01;
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(this._w, py);
        ctx.strokeStyle = isMajor ? major : minor;
        ctx.lineWidth = (isMajor ? 1 : 0.5) * this.dpr;
        ctx.stroke();
      }
    }

    // ── Axes ─────────────────────────────────────────────────────
    _drawAxes() {
      const ctx = this.ctx;
      const { xMin, xMax, yMin, yMax } = this.viewport;
      const axisColor = this.isDark ? '#667' : '#999';

      ctx.strokeStyle = axisColor;
      ctx.lineWidth = 1.2 * this.dpr;

      if (yMin <= 0 && yMax >= 0) {
        const y0 = this._yToPixel(0);
        ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(this._w, y0); ctx.stroke();
      }
      if (xMin <= 0 && xMax >= 0) {
        const x0 = this._xToPixel(0);
        ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, this._h); ctx.stroke();
      }

      if (!this.config.showLabels) return;

      const xStep = this._niceStep(xMax - xMin);
      const yStep = this._niceStep(yMax - yMin);
      const fontSize = Math.max(10 * this.dpr, 9);
      ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`;
      const labelColor = this.isDark ? '#778' : '#999';
      ctx.fillStyle = labelColor;

      // X labels
      const y0 = this._yToPixel(0);
      const yLP = (yMin <= 0 && yMax >= 0)
        ? Math.min(Math.max(y0 + 14 * this.dpr, 14 * this.dpr), this._h - 4 * this.dpr)
        : this._h - 4 * this.dpr;

      for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
        if (Math.abs(x) < xStep * 0.01) continue;
        const px = this._xToPixel(x);
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(this._formatNum(x), px, yLP);
      }

      // Y labels
      const x0 = this._xToPixel(0);
      const xLP = (xMin <= 0 && xMax >= 0)
        ? Math.max(x0 - 6 * this.dpr, 4 * this.dpr)
        : 4 * this.dpr;

      for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
        if (Math.abs(y) < yStep * 0.01) continue;
        const py = this._yToPixel(y);
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(this._formatNum(y), xLP, py);
      }

      // Origin
      if (xMin <= 0 && xMax >= 0 && yMin <= 0 && yMax >= 0) {
        ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillText('0', x0 - 5 * this.dpr, y0 + 3 * this.dpr);
      }
    }

    // ── Function curves ──────────────────────────────────────────
    _drawFunctions() {
      const ctx = this.ctx;
      for (const func of this.functions) {
        const { evaluator, color } = func;
        const numSamples = Math.ceil(this._w * this.config.samplesPerPixel / this.dpr);
        const xRange = this.viewport.xMax - this.viewport.xMin;
        const dx = xRange / numSamples;

        // How many samples to draw (for animation)
        const drawCount = Math.ceil(numSamples * this._animProgress);

        // Sample
        const points = [];
        for (let i = 0; i <= drawCount; i++) {
          const x = this.viewport.xMin + i * dx;
          try {
            const y = evaluator(x);
            points.push({ x, y, px: this._xToPixel(x), py: this._yToPixel(y) });
          } catch (_) {
            points.push({ x, y: NaN, px: this._xToPixel(x), py: NaN });
          }
        }

        // Build path segments (break at discontinuities)
        const segments = [];
        let current = [];
        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          if (!isFinite(p.y) || !isFinite(p.py)) {
            if (current.length > 0) { segments.push(current); current = []; }
            continue;
          }
          if (current.length > 0 && this.config.detectDiscontinuities) {
            const prev = current[current.length - 1];
            if (Math.abs(p.py - prev.py) > this._h * 0.4) {
              segments.push(current); current = [];
            }
          }
          current.push(p);
        }
        if (current.length > 0) segments.push(current);

        // Draw glow layer
        if (this.config.glowEffect) {
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = (this.config.lineWidth * 3) * this.dpr;
          ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          ctx.globalAlpha = 0.12;
          ctx.filter = `blur(${4 * this.dpr}px)`;
          for (const seg of segments) {
            if (seg.length < 2) continue;
            ctx.beginPath();
            ctx.moveTo(seg[0].px, seg[0].py);
            for (let j = 1; j < seg.length; j++) ctx.lineTo(seg[j].px, seg[j].py);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Draw main curve
        ctx.strokeStyle = color;
        ctx.lineWidth = this.config.lineWidth * this.dpr;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.globalAlpha = 1;

        for (const seg of segments) {
          if (seg.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(seg[0].px, seg[0].py);
          for (let j = 1; j < seg.length; j++) ctx.lineTo(seg[j].px, seg[j].py);
          ctx.stroke();
        }
      }
    }

    // ── Key Point Markers ────────────────────────────────────────
    _drawKeyPointMarkers() {
      const ctx = this.ctx;
      const d = this.dpr;

      for (const kp of this.keyPoints) {
        const px = this._xToPixel(kp.x);

        if (kp.type === 'h-asymptote') {
          // Dashed horizontal line
          const py = this._yToPixel(kp.y);
          if (py < -20 * d || py > this._h + 20 * d) continue;
          ctx.save();
          ctx.strokeStyle = kp.color || '#e84393';
          ctx.lineWidth = 1.2 * d;
          ctx.setLineDash([6 * d, 4 * d]);
          ctx.globalAlpha = 0.5;
          ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(this._w, py); ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();

          // Label on right side
          ctx.save();
          ctx.font = `600 ${9 * d}px -apple-system, sans-serif`;
          ctx.fillStyle = kp.color || '#e84393';
          ctx.globalAlpha = 0.7;
          ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
          ctx.fillText(kp.label, this._w - 4 * d, py - 4 * d);
          ctx.restore();
          continue;
        }

        if (kp.type === 'v-asymptote') {
          // Dashed vertical line
          if (px < 0 || px > this._w) continue;
          ctx.save();
          ctx.strokeStyle = kp.color || (this.isDark ? '#e84393' : '#e84393');
          ctx.lineWidth = 1.2 * d;
          ctx.setLineDash([6 * d, 4 * d]);
          ctx.globalAlpha = 0.5;
          ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, this._h); ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();

          // Label
          ctx.save();
          ctx.font = `600 ${9 * d}px -apple-system, sans-serif`;
          ctx.fillStyle = kp.color || '#e84393';
          ctx.globalAlpha = 0.7;
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText(kp.label, px + 4 * d, 4 * d);
          ctx.restore();
          continue;
        }

        const py = this._yToPixel(kp.y);
        if (px < -20 * d || px > this._w + 20 * d || py < -20 * d || py > this._h + 20 * d) continue;

        if (kp.type === 'hole') {
          // Open circle
          ctx.save();
          ctx.beginPath();
          ctx.arc(px, py, 5 * d, 0, Math.PI * 2);
          ctx.strokeStyle = kp.color || '#e84393';
          ctx.lineWidth = 2 * d;
          ctx.fillStyle = this.isDark ? '#1a1a2e' : '#fafbff';
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        } else {
          // Filled dot with white ring
          ctx.save();
          ctx.beginPath();
          ctx.arc(px, py, 4 * d, 0, Math.PI * 2);
          ctx.fillStyle = kp.color || '#667eea';
          ctx.fill();
          ctx.strokeStyle = this.isDark ? '#1a1a2e' : '#fff';
          ctx.lineWidth = 2 * d;
          ctx.stroke();
          ctx.restore();
        }

        // Label
        ctx.save();
        ctx.font = `600 ${9 * d}px -apple-system, sans-serif`;
        ctx.fillStyle = this.isDark ? '#ccc' : '#444';
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(kp.label, px + 7 * d, py - 5 * d);
        ctx.restore();
      }
    }

    // ── Function Legend (multi-function overlay) ──────────────────
    _drawLegend() {
      const ctx = this.ctx;
      const d = this.dpr;
      const lineH = 16 * d;
      const padX = 10 * d;
      const padY = 8 * d;
      const boxW = Math.min(180 * d, this._w * 0.4);
      const boxH = padY * 2 + this.functions.length * lineH;
      const x0 = this._w - boxW - 8 * d;
      const y0 = this._h - boxH - 8 * d;

      // Background
      ctx.save();
      ctx.fillStyle = this.isDark ? 'rgba(26,26,46,0.85)' : 'rgba(255,255,255,0.88)';
      ctx.strokeStyle = this.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1 * d;
      const r = 6 * d;
      ctx.beginPath();
      ctx.moveTo(x0 + r, y0); ctx.lineTo(x0 + boxW - r, y0);
      ctx.arcTo(x0 + boxW, y0, x0 + boxW, y0 + r, r);
      ctx.lineTo(x0 + boxW, y0 + boxH - r);
      ctx.arcTo(x0 + boxW, y0 + boxH, x0 + boxW - r, y0 + boxH, r);
      ctx.lineTo(x0 + r, y0 + boxH);
      ctx.arcTo(x0, y0 + boxH, x0, y0 + boxH - r, r);
      ctx.lineTo(x0, y0 + r);
      ctx.arcTo(x0, y0, x0 + r, y0, r);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();

      // Entries
      this.functions.forEach((func, i) => {
        const entryY = y0 + padY + i * lineH + lineH * 0.5;
        // Color swatch line
        ctx.save();
        ctx.strokeStyle = func.color;
        ctx.lineWidth = 2.5 * d;
        ctx.beginPath();
        ctx.moveTo(x0 + padX, entryY);
        ctx.lineTo(x0 + padX + 20 * d, entryY);
        ctx.stroke();
        ctx.restore();
        // Label
        ctx.save();
        ctx.font = `500 ${10 * d}px -apple-system, sans-serif`;
        ctx.fillStyle = this.isDark ? '#ddd' : '#333';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const label = func.label.length > 18 ? func.label.substring(0, 16) + '…' : func.label;
        ctx.fillText(label, x0 + padX + 26 * d, entryY);
        ctx.restore();
      });
    }

    // ── Crosshair + Trace + Tangent ──────────────────────────────
    _showCrosshair(e) {
      const rect = this.canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * this.dpr;
      const cursorX = this._pixelToX(mx);

      const ctx = this.crossCtx;
      ctx.clearRect(0, 0, this._w, this._h);

      // Thin vertical trace line
      ctx.strokeStyle = this.isDark ? 'rgba(100,126,234,0.25)' : 'rgba(102,126,234,0.2)';
      ctx.lineWidth = 1 * this.dpr;
      ctx.setLineDash([3 * this.dpr, 3 * this.dpr]);
      ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx, this._h); ctx.stroke();
      ctx.setLineDash([]);

      let tooltipParts = [];

      for (const func of this.functions) {
        try {
          const fy = func.evaluator(cursorX);
          if (!isFinite(fy)) continue;

          const snapPy = this._yToPixel(fy);
          if (snapPy < -50 * this.dpr || snapPy > this._h + 50 * this.dpr) continue;

          // Tangent line
          if (this.config.showTangent) {
            const h = 1e-6;
            const dy = (func.evaluator(cursorX + h) - func.evaluator(cursorX - h)) / (2 * h);
            if (isFinite(dy)) {
              const tanLen = (this.viewport.xMax - this.viewport.xMin) * 0.15;
              const x1 = cursorX - tanLen, y1 = fy - dy * tanLen;
              const x2 = cursorX + tanLen, y2 = fy + dy * tanLen;
              const px1 = this._xToPixel(x1), py1 = this._yToPixel(y1);
              const px2 = this._xToPixel(x2), py2 = this._yToPixel(y2);

              ctx.save();
              ctx.strokeStyle = func.color;
              ctx.lineWidth = 1.2 * this.dpr;
              ctx.globalAlpha = 0.4;
              ctx.setLineDash([4 * this.dpr, 3 * this.dpr]);
              ctx.beginPath(); ctx.moveTo(px1, py1); ctx.lineTo(px2, py2); ctx.stroke();
              ctx.setLineDash([]);
              ctx.restore();

              tooltipParts.push(`slope: ${this._formatNum(dy, 2)}`);
            }
          }

          // Glow ring
          ctx.save();
          ctx.beginPath();
          ctx.arc(mx, snapPy, 8 * this.dpr, 0, Math.PI * 2);
          ctx.fillStyle = func.color;
          ctx.globalAlpha = 0.15;
          ctx.fill();
          ctx.restore();

          // Snap dot
          ctx.beginPath();
          ctx.arc(mx, snapPy, 4.5 * this.dpr, 0, Math.PI * 2);
          ctx.fillStyle = func.color;
          ctx.fill();
          ctx.strokeStyle = this.isDark ? '#1a1a2e' : '#fff';
          ctx.lineWidth = 2 * this.dpr;
          ctx.stroke();

          tooltipParts.unshift(`(${this._formatNum(cursorX, 2)}, ${this._formatNum(fy, 2)})`);
        } catch (_) {}
      }

      if (tooltipParts.length === 0) {
        tooltipParts.push(`x: ${this._formatNum(cursorX, 2)}`);
      }

      // Tooltip
      const tipX = e.clientX - rect.left;
      const tipY = e.clientY - rect.top;
      this.tooltip.innerHTML = tooltipParts.map((t, i) =>
        i === 0 ? `<span class="mg-tip-coord">${t}</span>` : `<span class="mg-tip-slope">${t}</span>`
      ).join('');
      this.tooltip.style.display = 'flex';

      const tipRect = this.tooltip.getBoundingClientRect();
      let left = tipX + 16;
      let top = tipY - 40;
      if (left + tipRect.width > rect.width) left = tipX - tipRect.width - 16;
      if (top < 0) top = tipY + 16;
      this.tooltip.style.left = left + 'px';
      this.tooltip.style.top = top + 'px';
    }

    _hideCrosshair() {
      this.crossCtx.clearRect(0, 0, this._w, this._h);
      this.tooltip.style.display = 'none';
    }

    // ── Utilities ─────────────────────────────────────────────────
    _niceStep(range) {
      const raw = range / 10;
      const mag = Math.pow(10, Math.floor(Math.log10(raw)));
      const res = raw / mag;
      let nice;
      if (res <= 1.5) nice = 1; else if (res <= 3) nice = 2; else if (res <= 7) nice = 5; else nice = 10;
      return nice * mag;
    }

    _formatNum(n, decimals) {
      if (decimals !== undefined) return Number(n.toFixed(decimals)).toString();
      if (Number.isInteger(n)) return n.toString();
      if (Math.abs(n) >= 100) return Math.round(n).toString();
      if (Math.abs(n) >= 1) return n.toFixed(1);
      return n.toFixed(2);
    }

    _fmt(n) {
      if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 0.0001) return Math.round(n).toString();
      return n.toFixed(2);
    }
  }

  window.MathGraph = MathGraph;
  window.MathEval = MathEval;
})();

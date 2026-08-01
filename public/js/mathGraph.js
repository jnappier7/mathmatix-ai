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

    /**
     * Compile an expression into an evaluator.
     *
     * The returned evaluator's signature is (v, scope): `v` is the primary
     * variable (x by default) and `scope` is consulted ONLY for the extra
     * identifiers named in opts.vars. Every existing single-variable caller
     * keeps calling f(x) untouched — the scope argument is simply undefined,
     * and no compiled node reads it unless the caller opted in.
     *
     * Two-variable compilation is what lets a system equation like
     * `2x + 3y = 12` be solved for y (see parseEquation) and what lets the 3D
     * surface plotter evaluate z = f(x, y). opts.varName renames the primary
     * variable so parametric curves can be written in t: parse('cos(t)',
     * { varName: 't' }).
     *
     * @param {string} expr
     * @param {{vars?: string[], varName?: string}} [opts]
     * @returns {(v: number, scope?: Object) => number}
     */
    parse(expr, opts) {
      const o = opts || {};
      const primary = (o.varName || 'x').toLowerCase();
      const extraVars = (o.vars || []).map((v) => String(v).toLowerCase());

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
          left = op === '+' ? (x, s) => l(x, s) + r(x, s) : (x, s) => l(x, s) - r(x, s);
        }
        return left;
      }

      function parseTerm() {
        let left = parseUnary();
        while (peek() && (peek().value === '*' || peek().value === '/')) {
          const op = consume().value; const right = parseUnary();
          const l = left, r = right;
          left = op === '*'
            ? (x, s) => l(x, s) * r(x, s)
            : (x, s) => { const d = r(x, s); return d === 0 ? NaN : l(x, s) / d; };
        }
        return left;
      }

      function parseUnary() {
        if (peek() && peek().value === '-') { consume(); const inner = parseUnary(); return (x, s) => -inner(x, s); }
        if (peek() && peek().value === '+') { consume(); return parseUnary(); }
        return parseImplicitMult();
      }

      // Implicit multiplication binds LOOSER than exponentiation, so each
      // factor is parsed as a power. This makes `4x^2` = 4*(x^2), not (4x)^2.
      function parseImplicitMult() {
        let left = parsePower();
        while (peek()) {
          const t = peek();
          if (t.type === 'num' || t.type === 'id' || t.value === '(' || t.value === '|') {
            const right = parsePower(); const l = left, r = right;
            left = (x, s) => l(x, s) * r(x, s);
          } else break;
        }
        return left;
      }

      function parsePower() {
        let base = parseAtom();
        if (peek() && (peek().value === '^' || peek().value === '**')) {
          consume();
          // Exponent binds tighter than implicit mult and is right-associative
          // (`2^3^2` = 2^(3^2)); allow a leading sign so `x^-1` works.
          let exp;
          if (peek() && (peek().value === '-' || peek().value === '+')) {
            const sign = consume().value; const e = parsePower();
            exp = sign === '-' ? (x, s) => -e(x, s) : e;
          } else {
            exp = parsePower();
          }
          const b = base;
          return (x, s) => Math.pow(b(x, s), exp(x, s));
        }
        return base;
      }

      function parseAtom() {
        const t = peek();
        if (!t) throw new Error('Unexpected end of expression');
        if (t.value === '(') { consume('('); const inner = parseExpr(); consume(')'); return inner; }
        if (t.value === '|') { consume('|'); const inner = parseExpr(); consume('|'); return (x, s) => Math.abs(inner(x, s)); }
        if (t.type === 'num') { consume(); const val = t.value; return () => val; }
        if (t.type === 'id') {
          consume(); const name = t.value.toLowerCase();
          if (name === primary) return (x) => x;
          if (name === 'pi') return () => Math.PI;
          if (name === 'e' && (!peek() || peek().value !== '(')) return () => Math.E;
          // Opted-in extra variables (y for system equations, y for surfaces).
          // Unknown identifiers still throw — that error is what callers use to
          // tell a real expression from prose.
          if (extraVars.indexOf(name) !== -1) return (x, s) => (s ? s[name] : NaN);

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
              return args.length === 1
                ? ((a) => (x, s) => fn(a(x, s)))(args[0])
                : (x, s) => fn(...args.map(a => a(x, s)));
            }
            const fn = fnMap[name]; return (x) => fn(x);
          }
          if (name === 'pow') {
            consume('('); const base = parseExpr(); consume(','); const exp = parseExpr(); consume(')');
            return (x, s) => Math.pow(base(x, s), exp(x, s));
          }
          if (name === 'max' || name === 'min') {
            consume('('); const args = [parseExpr()];
            while (peek() && peek().value === ',') { consume(','); args.push(parseExpr()); }
            consume(')'); const fn = name === 'max' ? Math.max : Math.min;
            return (x, s) => fn(...args.map(a => a(x, s)));
          }
          // `xy` tokenizes as ONE identifier, but in math notation it means
          // x·y. Split only when every letter is a declared variable, so
          // function names and constants can never be shredded this way.
          if (name.length > 1) {
            const letters = name.split('');
            const isVar = (c) => c === primary || extraVars.indexOf(c) !== -1;
            if (letters.every(isVar)) {
              return (x, s) => letters.reduce(
                (acc, c) => acc * (c === primary ? x : (s ? s[c] : NaN)), 1
              );
            }
          }
          throw new Error(`Unknown identifier: ${name}`);
        }
        throw new Error(`Unexpected token: ${t.value}`);
      }

      const compiled = parseExpr();
      // Trailing junk means we only understood a PREFIX of the input. Lenient
      // by default — a stray ")" has always rendered the prefix and there's no
      // reason to start failing those — but validation callers pass strict so
      // that half-understood prose can't masquerade as a real expression.
      if (o.strict && pos < tokens.length) {
        throw new Error(`Unexpected trailing input at '${tokens[pos].value}'`);
      }
      return compiled;
    },

    /** True if the expression calls a trig function — drives π-based axes. */
    hasTrig(expr) {
      return typeof expr === 'string' &&
        /\b(sin|cos|tan|sec|csc|cot)\s*\(/i.test(expr);
    },

    /**
     * True if `expr` compiles to a real function of x. This is the honest test
     * for "is this math or is this prose", and it is deliberately cheap enough
     * to run on every tag: compile once, throw away the result.
     */
    isPlottable(expr, opts) {
      if (!expr || typeof expr !== 'string') return false;
      const o = Object.assign({ strict: true }, opts || {});
      try { this.parse(expr, o); return true; } catch (_) { return false; }
    }
  };

  // ─── Equations → drawable curves ────────────────────────────────────
  // A system of equations arrives as human notation, not as y = f(x): students
  // are given "2x + 3y = 12", "x = 4", "x² + y² = 25". Each has to become
  // something the renderer can draw, and which form we get decides how.

  /** `f(x)`, `g(x)`, `h(x)` on a side by itself all just mean "y". */
  function normaliseSide(side) {
    const s = String(side || '').trim();
    return /^[a-z]\s*\(\s*x\s*\)$/i.test(s) ? 'y' : s;
  }

  /**
   * Is F(x, y) linear in y at every sample? If it is, we can solve for y
   * pointwise instead of doing algebra: F(x, y) = A(x) + a(x)·y, so
   * y = −A(x) / a(x). This covers every standard-form linear equation AND
   * cases where the coefficient itself depends on x (xy = 6 → y = 6/x).
   */
  function isLinearInY(F) {
    const XS = [-3.1, -0.7, 0.3, 1.7, 4.2];
    let sawDependence = false;
    for (const x of XS) {
      const f0 = F(x, 0), f1 = F(x, 1), f2 = F(x, 2);
      if (!isFinite(f0) || !isFinite(f1) || !isFinite(f2)) continue;
      const d1 = f1 - f0, d2 = f2 - f1;
      const scale = Math.max(1, Math.abs(d1), Math.abs(d2));
      if (Math.abs(d2 - d1) > 1e-6 * scale) return false; // curved in y
      if (Math.abs(d1) > 1e-12) sawDependence = true;
    }
    return sawDependence;
  }

  /**
   * Solve g(x) = 0 for a vertical line. Linear first (exact for `2x = 7`,
   * `x/2 = 3`), then a coarse scan + bisection so odd-but-valid forms still
   * land somewhere sensible.
   */
  function solveForX(g) {
    const g0 = g(0), g1 = g(1);
    if (isFinite(g0) && isFinite(g1)) {
      const g2 = g(2);
      const a = g1 - g0;
      // Linear in x → one exact root.
      if (isFinite(g2) && Math.abs((g2 - g1) - a) < 1e-9 * Math.max(1, Math.abs(a)) && Math.abs(a) > 1e-12) {
        return -g0 / a;
      }
    }
    let prevX = -100, prevV = g(prevX);
    for (let i = 1; i <= 4000; i++) {
      const x = -100 + (i / 4000) * 200;
      const v = g(x);
      if (isFinite(prevV) && isFinite(v) && prevV !== 0 && (prevV < 0) !== (v < 0)) {
        let lo = prevX, hi = x;
        for (let k = 0; k < 60; k++) {
          const mid = (lo + hi) / 2;
          if ((g(lo) < 0) !== (g(mid) < 0)) hi = mid; else lo = mid;
        }
        return (lo + hi) / 2;
      }
      prevX = x; prevV = v;
    }
    return null;
  }

  /**
   * Parse ONE equation of a system into a drawable descriptor.
   *
   * @param {string} raw e.g. "y = 2x + 1", "2x + 3y = 12", "x = 4", "x^2+y^2=25"
   * @returns {null | {kind: 'explicit', evaluator, label}
   *                | {kind: 'vertical', x, label}
   *                | {kind: 'implicit', F, label}}
   */
  function parseEquation(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const s = raw.trim()
      .replace(/[−–—]/g, '-')
      .replace(/÷/g, '/').replace(/×/g, '*');
    if (!s) return null;

    const parts = s.split('=');
    if (parts.length > 2) return null;

    // No "=" at all: a bare expression in x is already y = f(x).
    if (parts.length === 1) {
      try { return { kind: 'explicit', evaluator: MathEval.parse(s), label: `y = ${s}` }; }
      catch (_) { return null; }
    }

    const lhs = normaliseSide(parts[0]);
    const rhs = normaliseSide(parts[1]);
    if (!lhs || !rhs) return null;

    // The common case — one side is bare y, so the other side IS the function.
    // If that side turns out not to be a pure function of x (y on both sides),
    // compiling it throws and we fall through to the general solver below.
    if (/^y$/i.test(lhs)) {
      try { return { kind: 'explicit', evaluator: MathEval.parse(rhs), label: `y = ${rhs}` }; } catch (_) { /* fall through */ }
    }
    if (/^y$/i.test(rhs)) {
      try { return { kind: 'explicit', evaluator: MathEval.parse(lhs), label: `y = ${lhs}` }; } catch (_) { /* fall through */ }
    }

    // General form: move everything to one side, F(x, y) = lhs − rhs = 0.
    let F;
    try {
      const L = MathEval.parse(lhs, { vars: ['y'] });
      const R = MathEval.parse(rhs, { vars: ['y'] });
      F = (x, y) => L(x, { y }) - R(x, { y });
    } catch (_) { return null; }

    // Does y actually matter? Ask F rather than the source text — `xy = 6`
    // hides its y from any regex, and a stray `0y` would fool one the other
    // way. If y makes no difference, the equation constrains x alone: a
    // vertical line. Solved numerically so `2x = 7` works, not just `x = 3`.
    const dependsOnY = [-3.1, 0.7, 2.3].some((x) => {
      const a = F(x, 0), b = F(x, 1);
      return isFinite(a) && isFinite(b) && Math.abs(a - b) > 1e-12;
    });
    if (!dependsOnY) {
      const root = solveForX((x) => F(x, 0));
      return root === null ? null : { kind: 'vertical', x: root, label: s };
    }

    // Linear in y → solve for y pointwise and draw it like any other curve,
    // which keeps intercepts, tracing and intersection-finding all working.
    if (isLinearInY(F)) {
      const evaluator = (x) => {
        const a0 = F(x, 0);
        const a = F(x, 1) - a0;
        if (!isFinite(a) || Math.abs(a) < 1e-12) return NaN;
        return -a0 / a;
      };
      return { kind: 'explicit', evaluator, label: s };
    }

    // Curved in y (circles, ellipses, hyperbolas) — no function form exists,
    // so trace the level set F = 0 directly.
    return { kind: 'implicit', F, label: s };
  }

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
        showIntersections: false, // mark where curves cross (systems of equations)
        xTickMode: 'auto',    // 'auto' | 'pi' — π-based ticks for trig
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
      // A system of equations: each entry arrives in whatever form the student
      // was given ("2x + 3y = 12"), not pre-solved for y.
      if (config.equations && Array.isArray(config.equations)) {
        config.equations.forEach((eq, i) => {
          const spec = typeof eq === 'string' ? { eq } : (eq || {});
          this.addEquation(spec.eq, spec.color || this.config.colors[i % this.config.colors.length], spec.label);
        });
      }

      // π-based ticks make trig graphs readable — the zeros of sin land ON the
      // labelled ticks instead of between 3.1 and 3.2.
      if (this.config.xTickMode === 'auto' &&
          this.functions.some((f) => MathEval.hasTrig(f.fn) || MathEval.hasTrig(f.label))) {
        this.config.xTickMode = 'pi';
      }

      this._autoFitY();
      this._detectKeyPoints();
      if (this.config.showIntersections) this._detectIntersections();

      if (this.config.animate) {
        this._startAnimation();
      } else {
        this._animProgress = 1;
        this._animDone = true;
        this.render();
      }

      if (this.config.showInfoBar && this.config.interactive) this._buildInfoBar();
      this._updateAriaDescription();

      this._resizeObserver = new ResizeObserver(() => this.render());
      this._resizeObserver.observe(this.container);
    }

    // ── DOM ──────────────────────────────────────────────────────
    _buildDOM() {
      this.wrapper = document.createElement('div');
      this.wrapper.className = 'mg-wrapper';
      this.wrapper.setAttribute('role', 'region');
      this.wrapper.setAttribute('aria-label', this.config.title || 'Interactive math graph');

      this.canvas = document.createElement('canvas');
      this.canvas.className = 'mg-canvas';
      this.canvas.setAttribute('role', 'img');
      this.canvas.setAttribute('aria-label', this._buildAriaDescription());
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

    /**
     * Build an accessible text description of the graph for screen readers.
     * Called at DOM build time, then updated after key points are detected.
     */
    _buildAriaDescription() {
      const parts = [];
      const title = this.config.title;
      if (title) parts.push(title);

      // Describe each function
      if (this.functions && this.functions.length > 0) {
        for (const fn of this.functions) {
          parts.push(`Function: ${fn.label || fn.expr}`);
        }
      }

      // Describe key points if available
      if (this.keyPoints && this.keyPoints.length > 0) {
        const descriptions = this.keyPoints.map(kp => {
          if (kp.type === 'x-intercept') return `x-intercept at (${kp.x.toFixed(1)}, 0)`;
          if (kp.type === 'y-intercept') return `y-intercept at (0, ${kp.y.toFixed(1)})`;
          if (kp.type === 'maximum') return `maximum at (${kp.x.toFixed(1)}, ${kp.y.toFixed(1)})`;
          if (kp.type === 'minimum') return `minimum at (${kp.x.toFixed(1)}, ${kp.y.toFixed(1)})`;
          if (kp.type === 'vertical-asymptote') return `vertical asymptote at x = ${kp.x.toFixed(1)}`;
          if (kp.type === 'horizontal-asymptote') return `horizontal asymptote at y = ${kp.y.toFixed(1)}`;
          if (kp.type === 'hole') return `hole at (${kp.x.toFixed(1)}, ${kp.y.toFixed(1)})`;
          return `${kp.type} at (${kp.x.toFixed(1)}, ${kp.y.toFixed(1)})`;
        });
        parts.push('Key features: ' + descriptions.join(', '));
      }

      // Domain
      if (this.config.xMin != null && this.config.xMax != null) {
        parts.push(`Domain shown: ${this.config.xMin} to ${this.config.xMax}`);
      }

      return parts.join('. ') || 'Mathematical graph';
    }

    /**
     * Update ARIA label after key points have been detected (post-render).
     */
    _updateAriaDescription() {
      if (this.canvas) {
        this.canvas.setAttribute('aria-label', this._buildAriaDescription());
      }
    }

    _buildInfoBar() {
      // Idempotent: callers that add curves after construction (systems,
      // derivative and velocity overlays) re-detect key points and rebuild the
      // bar, and without this the constructor's bar stays behind — the graph
      // rendered with two identical rows of pills.
      if (this.infoBar && this.infoBar.parentNode) {
        this.infoBar.parentNode.removeChild(this.infoBar);
      }
      this.infoBar = null;
      if (this.keyPoints.length === 0) return;
      this.infoBar = document.createElement('div');
      this.infoBar.className = 'mg-info-bar';

      const groups = {};
      for (const kp of this.keyPoints) {
        if (!groups[kp.type]) groups[kp.type] = [];
        groups[kp.type].push(kp);
      }

      const typeLabels = {
        'intersection': 'solution', 'y-intercept': 'y-int', 'x-intercept': 'x-int',
        'maximum': 'max', 'minimum': 'min', 'v-asymptote': 'VA', 'hole': 'hole'
      };

      // Intersections lead: when two equations are graphed together, where they
      // cross IS the answer the student is looking for.
      for (const type of ['intersection', 'y-intercept', 'x-intercept', 'maximum', 'minimum', 'v-asymptote', 'hole']) {
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
          fn: fnStr, evaluator, kind: 'explicit',
          color: color || this.config.colors[this.functions.length % this.config.colors.length],
          label: label || fnStr
        });
      } catch (err) {
        console.error(`[MathGraph] Failed to parse "${fnStr}":`, err.message);
      }
    }

    /**
     * Add one equation of a system, in whatever form a student was given it
     * ("y = 2x + 1", "2x + 3y = 12", "x = 4", "x^2 + y^2 = 25").
     * @returns {boolean} whether it was understood
     */
    addEquation(eqStr, color, label) {
      const parsed = parseEquation(eqStr);
      if (!parsed) {
        console.warn(`[MathGraph] Could not parse equation "${eqStr}"`);
        return false;
      }
      this.functions.push(Object.assign({}, parsed, {
        fn: eqStr,
        color: color || this.config.colors[this.functions.length % this.config.colors.length],
        label: label || parsed.label
      }));
      return true;
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

      // Only y = f(x) curves can be sampled for a vertical extent. A vertical
      // line spans everything, and an implicit curve has no single y per x.
      const explicit = this.functions.filter((f) => !f.kind || f.kind === 'explicit');

      if (explicit.length === 0) {
        // Implicit-only (a circle, say) — a square-ish window centred on the
        // origin frames it correctly and keeps it looking circular.
        const half = (this.viewport.xMax - this.viewport.xMin) / 2;
        this.viewport.yMin = this.viewport.yMin ?? -half;
        this.viewport.yMax = this.viewport.yMax ?? half;
        this._originalViewport = { ...this.viewport };
        return;
      }
      // Sample each function, tracking the global envelope AND the
      // "interesting" features: local extrema (turning points), the
      // y-intercept, and whether the curve crosses the x-axis (roots).
      //
      // Why not just fit the global envelope: over a wide x-domain a
      // curve's tails explode (x^2-4x+3 hits ~140 by x=±10), so fitting
      // min→max crushes the vertex and intercepts into a sliver near the
      // origin — the exact thing a student needs to see. When turning
      // points exist we frame to the features instead (QA P1-3). Lines
      // and monotonic curves have no turning points, so we keep the
      // global envelope, which frames them fine.
      let min = Infinity, max = -Infinity;
      const extremaYs = [];
      let yIntercept = null;
      let sawSignChange = false;
      const xR = this.viewport.xMax - this.viewport.xMin;
      const STEPS = 500;

      // A curve with a vertical asymptote (tan x, 1/x) runs off to ±∞ right
      // beside the asymptote. Fitting the window to those values crushes the
      // whole interesting part of the graph into one pixel row: tan(x) framed
      // itself at y ∈ [-199, 199], which is a blank window with a spike in it.
      //
      // Detecting that is subtler than "is the peak huge". Uniform sampling
      // never lands exactly on an asymptote, so tan's largest sample is only
      // ~13× its 90th percentile — no more extreme than plenty of honest
      // curves. The reliable signature is the JUMP: across an asymptote the
      // function flips sign while both neighbouring values are enormous. A
      // continuous curve crossing zero has small values either side of the
      // crossing, and a steep-but-continuous curve like exp(x) never changes
      // sign at all. So that pairing — sign flip AND both sides large — is
      // what identifies a true blow-up.
      const samples = [];
      const magnitudes = [];
      for (const { evaluator } of explicit) {
        const ys = [];
        for (let i = 0; i <= STEPS; i++) {
          const x = this.viewport.xMin + (i / STEPS) * xR;
          let y;
          try { y = evaluator(x); } catch (_) { y = NaN; }
          ys.push(y);
          if (isFinite(y)) magnitudes.push(Math.abs(y));
        }
        samples.push(ys);
      }

      let cap = 1e6;
      let sawInfiniteJump = false;
      if (magnitudes.length > 20) {
        const sorted = magnitudes.slice().sort((a, b) => a - b);
        const p90 = sorted[Math.floor(sorted.length * 0.9)];
        const big = Math.max(p90, 1);
        for (const ys of samples) {
          for (let i = 1; i < ys.length; i++) {
            const a = ys[i - 1], b = ys[i];
            if (!isFinite(a) || !isFinite(b)) continue;
            if ((a < 0) !== (b < 0) && Math.min(Math.abs(a), Math.abs(b)) > big) {
              sawInfiniteJump = true;
              break;
            }
          }
          if (sawInfiniteJump) break;
        }
        if (sawInfiniteJump && p90 > 0) cap = Math.max(p90 * 2, 1);
      }

      for (const { evaluator } of explicit) {
        let prevY = null, prevSlope = null;
        for (let i = 0; i <= STEPS; i++) {
          const x = this.viewport.xMin + (i / STEPS) * xR;
          let y;
          try { y = evaluator(x); } catch (_) { prevY = null; prevSlope = null; continue; }
          if (!isFinite(y) || Math.abs(y) >= cap) { prevY = null; prevSlope = null; continue; }
          if (y < min) min = y;
          if (y > max) max = y;
          if (prevY !== null) {
            const slope = y - prevY;
            if (prevSlope !== null && prevSlope !== 0 && slope !== 0 &&
                Math.sign(slope) !== Math.sign(prevSlope)) {
              extremaYs.push(prevY); // slope flipped → prevY ≈ the turning point
            }
            if ((prevY < 0) !== (y < 0)) sawSignChange = true; // crossed the x-axis
            prevSlope = slope;
          }
          prevY = y;
        }
        if (this.viewport.xMin <= 0 && this.viewport.xMax >= 0) {
          try { const y0 = evaluator(0); if (isFinite(y0)) yIntercept = y0; } catch (_) {}
        }
      }
      if (!isFinite(min) || !isFinite(max)) { min = -10; max = 10; }

      let autoMin, autoMax;
      if (sawInfiniteJump) {
        // The "extrema" of an asymptotic curve are artefacts of where the cap
        // clipped it, not turning points, so framing to them would re-inflate
        // the window. Use the capped envelope directly.
        const pad = Math.max((max - min) * 0.15, 1);
        autoMin = min - pad;
        autoMax = max + pad;
      } else if (extremaYs.length > 0) {
        // Frame to the interesting features. Extrema anchor the window;
        // include the y-intercept and the x-axis (when roots are present)
        // so intercepts stay visible.
        const anchors = extremaYs.slice();
        if (yIntercept !== null) anchors.push(yIntercept);
        if (sawSignChange) anchors.push(0);
        let fMin = Math.min(...anchors);
        let fMax = Math.max(...anchors);
        if (fMax === fMin) { fMax += 1; fMin -= 1; }
        const pad = Math.max((fMax - fMin) * 0.75, 2);
        autoMin = fMin - pad;
        autoMax = fMax + pad;
      } else {
        // No turning points (line / monotonic) — the global envelope is a
        // sensible frame.
        const pad = Math.max((max - min) * 0.15, 1);
        autoMin = min - pad;
        autoMax = max + pad;
      }
      this.viewport.yMin = this.viewport.yMin ?? autoMin;
      this.viewport.yMax = this.viewport.yMax ?? autoMax;
      this._originalViewport = { ...this.viewport };
    }

    /**
     * Where the curves cross. For a system of equations this is the whole
     * point of graphing it, so the crossings are found numerically (sign
     * change of f₁ − f₂, then bisection) and marked with their coordinates.
     * Only y = f(x) pairs and vertical × function pairs are solved; implicit
     * curves have no per-x value to difference.
     */
    _detectIntersections() {
      const solvable = this.functions.filter(
        (f) => !f.kind || f.kind === 'explicit' || f.kind === 'vertical'
      );
      const implicits = this.functions.filter((f) => f.kind === 'implicit');
      if (solvable.length + implicits.length < 2) return;

      const { xMin, xMax } = this.viewport;
      const N = 1200;
      const at = (f, x) => {
        try { const y = f.evaluator(x); return isFinite(y) ? y : NaN; } catch (_) { return NaN; }
      };

      // An implicit curve meets a function wherever F(x, f(x)) = 0 — feeding
      // the function's own y back into the level set collapses this to the
      // same one-dimensional root hunt. That covers a line through a circle,
      // which is the common "system with a conic" case.
      for (const imp of implicits) {
        for (const fn of solvable) {
          if (fn.kind === 'vertical') continue; // its own case, below
          const g = (x) => { const y = at(fn, x); return isFinite(y) ? imp.F(x, y) : NaN; };
          this._scanRoots(g, xMin, xMax, N, (ix) => this._addIntersection(ix, at(fn, ix)));
        }
      }

      // A vertical line x = c meets an implicit curve where F(c, y) = 0 — the
      // same hunt, run down the line instead of across the domain.
      for (const imp of implicits) {
        for (const v of solvable) {
          if (v.kind !== 'vertical' || v.x < xMin || v.x > xMax) continue;
          const { yMin, yMax } = this.viewport;
          this._scanRoots((y) => imp.F(v.x, y), yMin, yMax, N, (iy) => this._addIntersection(v.x, iy));
        }
      }

      if (solvable.length < 2) return;

      for (let a = 0; a < solvable.length; a++) {
        for (let b = a + 1; b < solvable.length; b++) {
          const fa = solvable[a], fb = solvable[b];

          // A vertical line meets a function at exactly one point: x = c.
          if (fa.kind === 'vertical' || fb.kind === 'vertical') {
            const vert = fa.kind === 'vertical' ? fa : fb;
            const other = fa.kind === 'vertical' ? fb : fa;
            if (other.kind === 'vertical') continue; // parallel verticals
            const y = at(other, vert.x);
            if (isFinite(y) && vert.x >= xMin && vert.x <= xMax) {
              this._addIntersection(vert.x, y);
            }
            continue;
          }

          const diff = (x) => at(fa, x) - at(fb, x);
          this._scanRoots(diff, xMin, xMax, N, (ix, lo, hi) => {
            const iy = at(fa, ix);
            // A sign flip across an asymptote is a jump, not a crossing —
            // tan(x) and a line "cross" at every asymptote otherwise.
            const jump = Math.abs(at(fa, hi) - at(fa, lo)) + Math.abs(at(fb, hi) - at(fb, lo));
            if (isFinite(iy) && isFinite(jump) && jump < 1e3) this._addIntersection(ix, iy);
          });
        }
      }
    }

    /**
     * Find every root of g on [lo, hi] by scanning for sign changes and
     * bisecting each one. Exact zeros landing on a sample are reported too —
     * a strict sign-flip test alone misses them, and the tidy integer answers
     * a textbook system is built around are exactly the ones that land on a
     * sample (a line through a circle reported one of its two crossings).
     *
     * @param {(v:number)=>number} g
     * @param {function(number, number, number)} onRoot called with (root, lo, hi)
     */
    _scanRoots(g, lo, hi, steps, onRoot) {
      const evalAt = (v) => { try { return g(v); } catch (_) { return NaN; } };
      let prevV = evalAt(lo);
      let prevX = lo;
      if (prevV === 0) onRoot(lo, lo, lo);
      for (let i = 1; i <= steps; i++) {
        const x = lo + (i / steps) * (hi - lo);
        const v = evalAt(x);
        if (v === 0) {
          onRoot(x, x, x);
        } else if (isFinite(prevV) && isFinite(v) && prevV !== 0 && (prevV < 0) !== (v < 0)) {
          let a = prevX, b = x;
          for (let k = 0; k < 60; k++) {
            const mid = (a + b) / 2;
            const vm = evalAt(mid);
            if (!isFinite(vm)) break;
            if ((evalAt(a) < 0) !== (vm < 0)) b = mid; else a = mid;
          }
          onRoot((a + b) / 2, a, b);
        }
        prevX = x; prevV = v;
      }
    }

    _addIntersection(x, y) {
      const near = this.keyPoints.some(
        (kp) => kp.type === 'intersection' && Math.abs(kp.x - x) < 1e-4 && Math.abs(kp.y - y) < 1e-4
      );
      if (near) return;
      this.keyPoints.push({
        type: 'intersection', x, y,
        label: `(${this._fmt(x)}, ${this._fmt(y)})`,
        color: '#e17055',
      });
    }

    // ── Key Point Detection ─────────────────────────────────────
    _detectKeyPoints() {
      if (!this.config.showKeyPoints) return;
      this.keyPoints = [];
      const { xMin, xMax } = this.viewport;
      const N = 2000;
      const dx = (xMax - xMin) / N;

      // Intercepts/extrema/asymptotes are all defined per y = f(x); vertical
      // and implicit curves are skipped here and handled by the intersection
      // pass instead.
      for (const func of this.functions.filter((f) => !f.kind || f.kind === 'explicit')) {
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
      const xStep = this._xStep(xMax - xMin);
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

      const xStep = this._xStep(xMax - xMin);
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
        ctx.fillText(this._formatX(x), px, yLP);
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
      for (const func of this.functions) {
        let segments;
        if (func.kind === 'vertical') segments = this._verticalSegments(func);
        else if (func.kind === 'implicit') segments = this._implicitSegments(func);
        else segments = this._explicitSegments(func);
        this._strokeSegments(segments, func.color);
      }
    }

    /**
     * A vertical line (x = 4) is not a function of x, so it can never come out
     * of the sampler — it gets its own two-point segment.
     */
    _verticalSegments(func) {
      const px = this._xToPixel(func.x);
      if (px < -10 * this.dpr || px > this._w + 10 * this.dpr) return [];
      // Animate by growing downward, matching the curve trace.
      const end = this._h * this._animProgress;
      return [[{ px, py: 0 }, { px, py: end }]];
    }

    /**
     * Trace the level set F(x, y) = 0 with marching squares. This is how a
     * circle or hyperbola gets drawn: no y = f(x) form exists, so instead of
     * solving, sample F on a grid and stitch together the cells where it
     * changes sign.
     */
    _implicitSegments(func) {
      const { F } = func;
      const { xMin, xMax, yMin, yMax } = this.viewport;
      const COLS = 140, ROWS = 110;
      const dx = (xMax - xMin) / COLS;
      const dy = (yMax - yMin) / ROWS;

      // Sample once; each interior corner is shared by four cells.
      const grid = new Float64Array((COLS + 1) * (ROWS + 1));
      for (let j = 0; j <= ROWS; j++) {
        const y = yMin + j * dy;
        for (let i = 0; i <= COLS; i++) {
          let v;
          try { v = F(xMin + i * dx, y); } catch (_) { v = NaN; }
          grid[j * (COLS + 1) + i] = isFinite(v) ? v : NaN;
        }
      }

      // Linear interpolation along a cell edge to find where F crosses zero.
      const cross = (xa, ya, va, xb, yb, vb) => {
        const t = va / (va - vb);
        return { x: xa + (xb - xa) * t, y: ya + (yb - ya) * t };
      };

      const segs = [];
      const limit = COLS * this._animProgress;
      for (let j = 0; j < ROWS; j++) {
        for (let i = 0; i < COLS && i <= limit; i++) {
          const v00 = grid[j * (COLS + 1) + i];
          const v10 = grid[j * (COLS + 1) + i + 1];
          const v01 = grid[(j + 1) * (COLS + 1) + i];
          const v11 = grid[(j + 1) * (COLS + 1) + i + 1];
          if (!isFinite(v00) || !isFinite(v10) || !isFinite(v01) || !isFinite(v11)) continue;

          const x0 = xMin + i * dx, x1 = x0 + dx;
          const y0 = yMin + j * dy, y1 = y0 + dy;

          // Collect zero crossings on the four edges; two of them make a segment.
          const hits = [];
          if ((v00 < 0) !== (v10 < 0)) hits.push(cross(x0, y0, v00, x1, y0, v10)); // bottom
          if ((v10 < 0) !== (v11 < 0)) hits.push(cross(x1, y0, v10, x1, y1, v11)); // right
          if ((v01 < 0) !== (v11 < 0)) hits.push(cross(x0, y1, v01, x1, y1, v11)); // top
          if ((v00 < 0) !== (v01 < 0)) hits.push(cross(x0, y0, v00, x0, y1, v01)); // left
          if (hits.length < 2) continue;

          // 2 hits = one crossing; 4 = a saddle cell, drawn as two segments.
          for (let k = 0; k + 1 < hits.length; k += 2) {
            segs.push([
              { px: this._xToPixel(hits[k].x), py: this._yToPixel(hits[k].y) },
              { px: this._xToPixel(hits[k + 1].x), py: this._yToPixel(hits[k + 1].y) },
            ]);
          }
        }
      }
      return segs;
    }

    _explicitSegments(func) {
      const { evaluator } = func;
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
      return segments;
    }

    /** Shared stroke pass: soft glow underneath, crisp curve on top. */
    _strokeSegments(segments, color) {
      const ctx = this.ctx;
      if (!segments || segments.length === 0) return;

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
      ctx.save();
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
      ctx.restore();
    }

    // ── Key Point Markers ────────────────────────────────────────
    _drawKeyPointMarkers() {
      const ctx = this.ctx;
      const d = this.dpr;

      // Labels are drawn only where they fit. Two periods of a sine wave have
      // a dozen roots and turning points, and labelling every one buried the
      // curve in overlapping coordinates. The DOTS are always drawn — only the
      // text is dropped, and the info bar below still lists every point.
      const placed = [];
      const labelFits = (x, y, w, h) => {
        for (const r of placed) {
          if (x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y) return false;
        }
        placed.push({ x, y, w, h });
        return true;
      };

      // Intersections are the answer to a system — they get first claim on the
      // space, so an ordinary intercept can never crowd one out.
      const ordered = this.keyPoints.slice().sort(
        (a, b) => (b.type === 'intersection' ? 1 : 0) - (a.type === 'intersection' ? 1 : 0)
      );

      for (const kp of ordered) {
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
        } else if (kp.type === 'intersection') {
          // The solution point — deliberately the loudest marker on the graph,
          // with a halo so it reads over either curve.
          ctx.save();
          ctx.beginPath();
          ctx.arc(px, py, 9 * d, 0, Math.PI * 2);
          ctx.fillStyle = kp.color || '#e17055';
          ctx.globalAlpha = 0.18;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(px, py, 5.5 * d, 0, Math.PI * 2);
          ctx.fillStyle = kp.color || '#e17055';
          ctx.fill();
          ctx.strokeStyle = this.isDark ? '#1a1a2e' : '#fff';
          ctx.lineWidth = 2.5 * d;
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

        // Label — only if it doesn't land on one already drawn.
        ctx.save();
        ctx.font = `600 ${9 * d}px -apple-system, sans-serif`;
        const lx = px + 7 * d;
        const ly = py - 5 * d;
        const lw = ctx.measureText(kp.label).width;
        const lh = 11 * d;
        if (labelFits(lx, ly - lh, lw, lh)) {
          ctx.fillStyle = kp.type === 'intersection'
            ? (kp.color || '#e17055')
            : (this.isDark ? '#ccc' : '#444');
          ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
          ctx.fillText(kp.label, lx, ly);
        }
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

      // Only y = f(x) curves have a single value to trace under the cursor.
      for (const func of this.functions.filter((f) => !f.kind || f.kind === 'explicit')) {
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

    /** X-axis step: π-commensurate for trig, ordinary decimals otherwise. */
    _xStep(range) {
      if (this.config.xTickMode !== 'pi') return this._niceStep(range);
      const raw = range / Math.PI / 8;             // target ≈ 8 ticks
      const choices = [0.25, 0.5, 1, 2, 4, 8, 16];
      const pick = choices.find((c) => c >= raw) || choices[choices.length - 1];
      return pick * Math.PI;
    }

    /**
     * Format an x tick. In π mode a value is written as the multiple of π it
     * is — π/2, 3π/2, -π — which is the notation the trig itself is written in.
     */
    _formatX(v) {
      if (this.config.xTickMode !== 'pi') return this._formatNum(v);
      const k = v / Math.PI;
      if (Math.abs(k) < 1e-9) return '0';
      // Express k as a fraction with a small denominator (halves and quarters
      // cover every step this mode produces).
      for (const den of [1, 2, 4]) {
        const num = k * den;
        if (Math.abs(num - Math.round(num)) < 1e-6) {
          const n = Math.round(num);
          const sign = n < 0 ? '-' : '';
          const a = Math.abs(n);
          const head = a === 1 ? 'π' : `${a}π`;
          return den === 1 ? `${sign}${head}` : `${sign}${head}/${den}`;
        }
      }
      return this._formatNum(v);
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
  // Exposed for the inline-visual layer (and unit tests): turning a written
  // equation into a drawable curve is useful outside the graph class itself.
  window.MathEquation = { parseEquation, isLinearInY, solveForX };
})();

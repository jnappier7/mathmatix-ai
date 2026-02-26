/**
 * MathGraph — High-quality Canvas-based function graphing engine.
 *
 * Replaces the external function-plot CDN dependency with a robust,
 * self-contained renderer that handles:
 *   - Arbitrary math expressions via safe evaluation
 *   - Discontinuities (vertical asymptotes, holes)
 *   - Smooth anti-aliased curves
 *   - Pan & zoom with touch support
 *   - Multiple overlaid functions
 *   - Responsive sizing with HiDPI support
 *   - Light & dark mode
 */

(function () {
  'use strict';

  // ─── Safe math expression evaluator ────────────────────────────────
  const MathEval = {
    // Tokenise an expression string into numbers, identifiers, operators, parens
    tokenize(expr) {
      const tokens = [];
      let i = 0;
      while (i < expr.length) {
        const ch = expr[i];
        if (/\s/.test(ch)) { i++; continue; }

        // Number (including decimals like .5)
        if (/[\d.]/.test(ch)) {
          let num = '';
          while (i < expr.length && /[\d.]/.test(expr[i])) num += expr[i++];
          tokens.push({ type: 'num', value: parseFloat(num) });
          continue;
        }

        // Identifier (function name or 'x' or constants)
        if (/[a-zA-Z_]/.test(ch)) {
          let id = '';
          while (i < expr.length && /[a-zA-Z_\d]/.test(expr[i])) id += expr[i++];
          tokens.push({ type: 'id', value: id });
          continue;
        }

        // Two-char operators
        if (ch === '*' && expr[i + 1] === '*') {
          tokens.push({ type: 'op', value: '**' });
          i += 2;
          continue;
        }

        // Single-char operators and parens
        if ('+-*/^(),|'.includes(ch)) {
          tokens.push({ type: 'op', value: ch });
          i++;
          continue;
        }

        i++; // skip unknown chars
      }
      return tokens;
    },

    // Recursive descent parser → returns an evaluator function(x)
    parse(expr) {
      // Normalise expression
      let normalised = expr
        .replace(/\s+/g, '')
        .replace(/÷/g, '/')
        .replace(/×/g, '*')
        .replace(/−/g, '-')
        .replace(/²/g, '^2')
        .replace(/³/g, '^3')
        .replace(/⁴/g, '^4')
        .replace(/π/g, 'pi');

      const tokens = this.tokenize(normalised);
      let pos = 0;

      const peek = () => tokens[pos] || null;
      const consume = (expected) => {
        const t = tokens[pos];
        if (expected && (!t || t.value !== expected)) {
          throw new Error(`Expected '${expected}' but got '${t ? t.value : 'EOF'}'`);
        }
        pos++;
        return t;
      };

      // Grammar:  expr → term (('+' | '-') term)*
      function parseExpr() {
        let left = parseTerm();
        while (peek() && (peek().value === '+' || peek().value === '-')) {
          const op = consume().value;
          const right = parseTerm();
          const l = left, r = right;
          if (op === '+') left = (x) => l(x) + r(x);
          else left = (x) => l(x) - r(x);
        }
        return left;
      }

      // term → unary (('*' | '/') unary)*
      function parseTerm() {
        let left = parseUnary();
        while (peek() && (peek().value === '*' || peek().value === '/')) {
          const op = consume().value;
          const right = parseUnary();
          const l = left, r = right;
          if (op === '*') left = (x) => l(x) * r(x);
          else left = (x) => { const d = r(x); return d === 0 ? NaN : l(x) / d; };
        }
        return left;
      }

      // Handle unary + and -
      function parseUnary() {
        if (peek() && peek().value === '-') {
          consume();
          const inner = parseUnary();
          return (x) => -inner(x);
        }
        if (peek() && peek().value === '+') {
          consume();
          return parseUnary();
        }
        return parsePower();
      }

      // power → atom (('^' | '**') unary)?   (right-assoc)
      function parsePower() {
        let base = parseImplicitMult();
        if (peek() && (peek().value === '^' || peek().value === '**')) {
          consume();
          const exp = parseUnary(); // right-assoc
          const b = base;
          return (x) => Math.pow(b(x), exp(x));
        }
        return base;
      }

      // Handle implicit multiplication: 2x, 2(x+1), (x+1)(x-1), 2sin(x)
      function parseImplicitMult() {
        let left = parseAtom();
        while (peek()) {
          const t = peek();
          // Implicit mult before: number, id, '(' or '|'
          if (t.type === 'num' || t.type === 'id' || t.value === '(' || t.value === '|') {
            const right = parseAtom();
            const l = left, r = right;
            left = (x) => l(x) * r(x);
          } else {
            break;
          }
        }
        return left;
      }

      // atom → number | 'x' | constant | function(expr) | '(' expr ')' | '|' expr '|'
      function parseAtom() {
        const t = peek();
        if (!t) throw new Error('Unexpected end of expression');

        // Parenthesised expression
        if (t.value === '(') {
          consume('(');
          const inner = parseExpr();
          consume(')');
          return inner;
        }

        // Absolute value |expr|
        if (t.value === '|') {
          consume('|');
          const inner = parseExpr();
          consume('|');
          return (x) => Math.abs(inner(x));
        }

        // Number literal
        if (t.type === 'num') {
          consume();
          const val = t.value;
          return (_x) => val;
        }

        // Identifier: x, pi, e, or function call
        if (t.type === 'id') {
          consume();
          const name = t.value.toLowerCase();

          // Constants
          if (name === 'x') return (x) => x;
          if (name === 'pi') return (_x) => Math.PI;
          if (name === 'e' && (!peek() || peek().value !== '(')) return (_x) => Math.E;

          // Functions — must be followed by '('
          const fnMap = {
            sin: Math.sin, cos: Math.cos, tan: Math.tan,
            asin: Math.asin, acos: Math.acos, atan: Math.atan,
            sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
            sqrt: Math.sqrt, cbrt: Math.cbrt,
            abs: Math.abs, sign: Math.sign,
            log: Math.log, ln: Math.log, log10: Math.log10, log2: Math.log2,
            exp: Math.exp,
            ceil: Math.ceil, floor: Math.floor, round: Math.round,
            sec: (v) => 1 / Math.cos(v),
            csc: (v) => 1 / Math.sin(v),
            cot: (v) => 1 / Math.tan(v),
          };

          if (fnMap[name]) {
            if (peek() && peek().value === '(') {
              consume('(');
              const args = [parseExpr()];
              while (peek() && peek().value === ',') {
                consume(',');
                args.push(parseExpr());
              }
              consume(')');
              const fn = fnMap[name];
              if (args.length === 1) {
                const a = args[0];
                return (x) => fn(a(x));
              }
              return (x) => fn(...args.map(a => a(x)));
            }
            // Bare function name without parens — treat as fn(x)
            const fn = fnMap[name];
            return (x) => fn(x);
          }

          // pow(base, exp)
          if (name === 'pow') {
            consume('(');
            const base = parseExpr();
            consume(',');
            const exp = parseExpr();
            consume(')');
            return (x) => Math.pow(base(x), exp(x));
          }

          // max, min
          if (name === 'max' || name === 'min') {
            consume('(');
            const args = [parseExpr()];
            while (peek() && peek().value === ',') {
              consume(',');
              args.push(parseExpr());
            }
            consume(')');
            const fn = name === 'max' ? Math.max : Math.min;
            return (x) => fn(...args.map(a => a(x)));
          }

          throw new Error(`Unknown identifier: ${name}`);
        }

        throw new Error(`Unexpected token: ${t.value}`);
      }

      const result = parseExpr();
      if (pos < tokens.length) {
        // Remaining tokens — try implicit mult wrapping
      }
      return result;
    }
  };

  // ─── MathGraph class ───────────────────────────────────────────────
  class MathGraph {
    constructor(container, config = {}) {
      this.container = typeof container === 'string'
        ? document.querySelector(container) : container;

      if (!this.container) throw new Error('MathGraph: container not found');

      // Defaults
      this.config = {
        xMin: -10,
        xMax: 10,
        yMin: null, // auto-fit if null
        yMax: null,
        title: '',
        color: '#667eea',
        colors: ['#667eea', '#e84393', '#00b894', '#fdcb6e', '#6c5ce7', '#e17055'],
        gridColor: null, // auto based on dark mode
        bgColor: null,
        showGrid: true,
        showAxes: true,
        showLabels: true,
        lineWidth: 2.5,
        samplesPerPixel: 2,
        detectDiscontinuities: true,
        discontinuityThreshold: 50,
        interactive: true,
        ...config
      };

      this.functions = [];  // Array of { fn, evaluator, color, label }
      this.isDark = document.body.classList.contains('dark-mode');
      this.dpr = window.devicePixelRatio || 1;

      // Viewport state (for pan/zoom)
      this.viewport = {
        xMin: this.config.xMin,
        xMax: this.config.xMax,
        yMin: this.config.yMin,
        yMax: this.config.yMax
      };

      this._originalViewport = { ...this.viewport };

      // Build DOM
      this._buildDOM();

      // Parse initial function if provided
      if (config.fn) {
        this.addFunction(config.fn, this.config.color);
      }
      if (config.data && Array.isArray(config.data)) {
        config.data.forEach((d, i) => {
          this.addFunction(d.fn, d.color || this.config.colors[i % this.config.colors.length]);
        });
      }

      // Initial render
      this._autoFitY();
      this.render();

      // Resize observer
      this._resizeObserver = new ResizeObserver(() => this.render());
      this._resizeObserver.observe(this.container);
    }

    // ── DOM Construction ──────────────────────────────────────────
    _buildDOM() {
      this.wrapper = document.createElement('div');
      this.wrapper.className = 'mg-wrapper';

      this.canvas = document.createElement('canvas');
      this.canvas.className = 'mg-canvas';
      this.wrapper.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');

      // Tooltip
      this.tooltip = document.createElement('div');
      this.tooltip.className = 'mg-tooltip';
      this.tooltip.style.display = 'none';
      this.wrapper.appendChild(this.tooltip);

      // Crosshair
      this.crosshairCanvas = document.createElement('canvas');
      this.crosshairCanvas.className = 'mg-crosshair-canvas';
      this.wrapper.appendChild(this.crosshairCanvas);
      this.crossCtx = this.crosshairCanvas.getContext('2d');

      this.container.appendChild(this.wrapper);

      // Events
      if (this.config.interactive) {
        this._setupInteraction();
      }
    }

    _setupInteraction() {
      let isPanning = false;
      let lastX, lastY;

      // Mouse move — show crosshair + coordinates
      this.crosshairCanvas.addEventListener('mousemove', (e) => {
        if (isPanning) {
          const dx = e.clientX - lastX;
          const dy = e.clientY - lastY;
          lastX = e.clientX;
          lastY = e.clientY;

          const xRange = this.viewport.xMax - this.viewport.xMin;
          const yRange = this.viewport.yMax - this.viewport.yMin;
          const rect = this.canvas.getBoundingClientRect();
          const xShift = -(dx / rect.width) * xRange;
          const yShift = (dy / rect.height) * yRange;

          this.viewport.xMin += xShift;
          this.viewport.xMax += xShift;
          this.viewport.yMin += yShift;
          this.viewport.yMax += yShift;
          this.render();
        }
        this._showCrosshair(e);
      });

      this.crosshairCanvas.addEventListener('mouseleave', () => {
        this._hideCrosshair();
        isPanning = false;
      });

      this.crosshairCanvas.addEventListener('mousedown', (e) => {
        isPanning = true;
        lastX = e.clientX;
        lastY = e.clientY;
        this.crosshairCanvas.style.cursor = 'grabbing';
      });

      window.addEventListener('mouseup', () => {
        isPanning = false;
        if (this.crosshairCanvas) this.crosshairCanvas.style.cursor = 'crosshair';
      });

      // Scroll to zoom
      this.crosshairCanvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1.15 : 0.87;
        const rect = this.canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) / rect.width;
        const my = (e.clientY - rect.top) / rect.height;

        const xRange = this.viewport.xMax - this.viewport.xMin;
        const yRange = this.viewport.yMax - this.viewport.yMin;
        const cx = this.viewport.xMin + mx * xRange;
        const cy = this.viewport.yMax - my * yRange;

        const newXRange = xRange * factor;
        const newYRange = yRange * factor;

        this.viewport.xMin = cx - mx * newXRange;
        this.viewport.xMax = cx + (1 - mx) * newXRange;
        this.viewport.yMin = cy - (1 - my) * newYRange;
        this.viewport.yMax = cy + my * newYRange;

        this.render();
        this._showCrosshair(e);
      }, { passive: false });

      // Touch support
      let lastTouchDist = null;
      let lastTouchCenter = null;

      this.crosshairCanvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          isPanning = true;
          lastX = e.touches[0].clientX;
          lastY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
          isPanning = false;
          lastTouchDist = Math.hypot(
            e.touches[1].clientX - e.touches[0].clientX,
            e.touches[1].clientY - e.touches[0].clientY
          );
          lastTouchCenter = {
            x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
            y: (e.touches[0].clientY + e.touches[1].clientY) / 2
          };
        }
        e.preventDefault();
      }, { passive: false });

      this.crosshairCanvas.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && isPanning) {
          const dx = e.touches[0].clientX - lastX;
          const dy = e.touches[0].clientY - lastY;
          lastX = e.touches[0].clientX;
          lastY = e.touches[0].clientY;

          const rect = this.canvas.getBoundingClientRect();
          const xRange = this.viewport.xMax - this.viewport.xMin;
          const yRange = this.viewport.yMax - this.viewport.yMin;
          const xShift = -(dx / rect.width) * xRange;
          const yShift = (dy / rect.height) * yRange;

          this.viewport.xMin += xShift;
          this.viewport.xMax += xShift;
          this.viewport.yMin += yShift;
          this.viewport.yMax += yShift;
          this.render();
        } else if (e.touches.length === 2 && lastTouchDist !== null) {
          const dist = Math.hypot(
            e.touches[1].clientX - e.touches[0].clientX,
            e.touches[1].clientY - e.touches[0].clientY
          );
          const factor = lastTouchDist / dist;
          lastTouchDist = dist;

          const xRange = this.viewport.xMax - this.viewport.xMin;
          const yRange = this.viewport.yMax - this.viewport.yMin;
          const cx = (this.viewport.xMin + this.viewport.xMax) / 2;
          const cy = (this.viewport.yMin + this.viewport.yMax) / 2;

          this.viewport.xMin = cx - (xRange * factor) / 2;
          this.viewport.xMax = cx + (xRange * factor) / 2;
          this.viewport.yMin = cy - (yRange * factor) / 2;
          this.viewport.yMax = cy + (yRange * factor) / 2;
          this.render();
        }
        e.preventDefault();
      }, { passive: false });

      this.crosshairCanvas.addEventListener('touchend', () => {
        isPanning = false;
        lastTouchDist = null;
        lastTouchCenter = null;
      });
    }

    // ── Public API ────────────────────────────────────────────────
    addFunction(fnStr, color, label) {
      try {
        const evaluator = MathEval.parse(fnStr);
        this.functions.push({
          fn: fnStr,
          evaluator,
          color: color || this.config.colors[this.functions.length % this.config.colors.length],
          label: label || fnStr
        });
      } catch (err) {
        console.error(`[MathGraph] Failed to parse "${fnStr}":`, err.message);
      }
    }

    zoom(factor) {
      const cx = (this.viewport.xMin + this.viewport.xMax) / 2;
      const cy = (this.viewport.yMin + this.viewport.yMax) / 2;
      const xRange = (this.viewport.xMax - this.viewport.xMin) * factor;
      const yRange = (this.viewport.yMax - this.viewport.yMin) * factor;
      this.viewport.xMin = cx - xRange / 2;
      this.viewport.xMax = cx + xRange / 2;
      this.viewport.yMin = cy - yRange / 2;
      this.viewport.yMax = cy + yRange / 2;
      this.render();
    }

    reset() {
      this.viewport = { ...this._originalViewport };
      this._autoFitY();
      this.render();
    }

    destroy() {
      if (this._resizeObserver) this._resizeObserver.disconnect();
      if (this.wrapper && this.wrapper.parentNode) {
        this.wrapper.parentNode.removeChild(this.wrapper);
      }
    }

    // ── Auto-fit Y range ──────────────────────────────────────────
    _autoFitY() {
      if (this.viewport.yMin !== null && this.viewport.yMax !== null) return;
      if (this.functions.length === 0) {
        this.viewport.yMin = this.viewport.yMin ?? -10;
        this.viewport.yMax = this.viewport.yMax ?? 10;
        return;
      }

      let min = Infinity, max = -Infinity;
      const samples = 400;
      const xRange = this.viewport.xMax - this.viewport.xMin;

      for (const { evaluator } of this.functions) {
        for (let i = 0; i <= samples; i++) {
          const x = this.viewport.xMin + (i / samples) * xRange;
          try {
            const y = evaluator(x);
            if (isFinite(y) && Math.abs(y) < 1e6) {
              if (y < min) min = y;
              if (y > max) max = y;
            }
          } catch (_) { /* skip */ }
        }
      }

      if (!isFinite(min) || !isFinite(max)) {
        min = -10;
        max = 10;
      }

      const padding = Math.max((max - min) * 0.15, 1);
      this.viewport.yMin = this.viewport.yMin ?? (min - padding);
      this.viewport.yMax = this.viewport.yMax ?? (max + padding);
      this._originalViewport.yMin = this.viewport.yMin;
      this._originalViewport.yMax = this.viewport.yMax;
    }

    // ── Coordinate conversion ─────────────────────────────────────
    _xToPixel(x) {
      const { xMin, xMax } = this.viewport;
      return ((x - xMin) / (xMax - xMin)) * this._w;
    }
    _yToPixel(y) {
      const { yMin, yMax } = this.viewport;
      return ((yMax - y) / (yMax - yMin)) * this._h;
    }
    _pixelToX(px) {
      const { xMin, xMax } = this.viewport;
      return xMin + (px / this._w) * (xMax - xMin);
    }
    _pixelToY(py) {
      const { yMin, yMax } = this.viewport;
      return yMax - (py / this._h) * (yMax - yMin);
    }

    // ── Main render ───────────────────────────────────────────────
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

      // Background
      const bg = this.config.bgColor || (this.isDark ? '#1e1e2e' : '#ffffff');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, this._w, this._h);

      if (this.config.showGrid) this._drawGrid();
      if (this.config.showAxes) this._drawAxes();

      // Clip to drawing area for function curves
      ctx.beginPath();
      ctx.rect(0, 0, this._w, this._h);
      ctx.clip();

      this._drawFunctions();

      ctx.restore();

      // Clear crosshair overlay
      this.crossCtx.clearRect(0, 0, this._w, this._h);
    }

    // ── Grid drawing ──────────────────────────────────────────────
    _drawGrid() {
      const ctx = this.ctx;
      const { xMin, xMax, yMin, yMax } = this.viewport;

      const xStep = this._niceStep(xMax - xMin);
      const yStep = this._niceStep(yMax - yMin);

      const gridColor = this.config.gridColor || (this.isDark ? '#2a2a3d' : '#f0f0f0');
      const gridMajorColor = this.isDark ? '#353550' : '#e0e0e0';

      // Vertical grid lines
      const xStart = Math.ceil(xMin / xStep) * xStep;
      for (let x = xStart; x <= xMax; x += xStep) {
        const px = this._xToPixel(x);
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, this._h);
        const isMajor = Math.abs(Math.round(x / (xStep * 5)) * xStep * 5 - x) < xStep * 0.01;
        ctx.strokeStyle = isMajor ? gridMajorColor : gridColor;
        ctx.lineWidth = isMajor ? 1.5 * this.dpr : 0.5 * this.dpr;
        ctx.stroke();
      }

      // Horizontal grid lines
      const yStart = Math.ceil(yMin / yStep) * yStep;
      for (let y = yStart; y <= yMax; y += yStep) {
        const py = this._yToPixel(y);
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(this._w, py);
        const isMajor = Math.abs(Math.round(y / (yStep * 5)) * yStep * 5 - y) < yStep * 0.01;
        ctx.strokeStyle = isMajor ? gridMajorColor : gridColor;
        ctx.lineWidth = isMajor ? 1.5 * this.dpr : 0.5 * this.dpr;
        ctx.stroke();
      }
    }

    // ── Axes drawing ──────────────────────────────────────────────
    _drawAxes() {
      const ctx = this.ctx;
      const { xMin, xMax, yMin, yMax } = this.viewport;

      const axisColor = this.isDark ? '#aaa' : '#333';
      const labelColor = this.isDark ? '#999' : '#666';
      const tickColor = this.isDark ? '#888' : '#444';

      ctx.strokeStyle = axisColor;
      ctx.lineWidth = 1.5 * this.dpr;

      // X-axis (y=0)
      if (yMin <= 0 && yMax >= 0) {
        const y0 = this._yToPixel(0);
        ctx.beginPath();
        ctx.moveTo(0, y0);
        ctx.lineTo(this._w, y0);
        ctx.stroke();
      }

      // Y-axis (x=0)
      if (xMin <= 0 && xMax >= 0) {
        const x0 = this._xToPixel(0);
        ctx.beginPath();
        ctx.moveTo(x0, 0);
        ctx.lineTo(x0, this._h);
        ctx.stroke();
      }

      if (!this.config.showLabels) return;

      // Tick labels
      const xStep = this._niceStep(xMax - xMin);
      const yStep = this._niceStep(yMax - yMin);
      const fontSize = Math.max(10 * this.dpr, 9);
      ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.fillStyle = labelColor;
      ctx.strokeStyle = tickColor;
      ctx.lineWidth = 1 * this.dpr;

      // X-axis labels
      const y0 = this._yToPixel(0);
      const yLabelPos = (yMin <= 0 && yMax >= 0)
        ? Math.min(Math.max(y0 + 16 * this.dpr, 16 * this.dpr), this._h - 4 * this.dpr)
        : this._h - 4 * this.dpr;

      const xStart = Math.ceil(xMin / xStep) * xStep;
      for (let x = xStart; x <= xMax; x += xStep) {
        if (Math.abs(x) < xStep * 0.01) continue; // skip 0
        const px = this._xToPixel(x);

        // Tick mark
        if (yMin <= 0 && yMax >= 0) {
          ctx.beginPath();
          ctx.moveTo(px, y0 - 3 * this.dpr);
          ctx.lineTo(px, y0 + 3 * this.dpr);
          ctx.stroke();
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(this._formatNum(x), px, yLabelPos);
      }

      // Y-axis labels
      const x0 = this._xToPixel(0);
      const xLabelPos = (xMin <= 0 && xMax >= 0)
        ? Math.max(x0 - 8 * this.dpr, 4 * this.dpr)
        : 4 * this.dpr;

      const yStartL = Math.ceil(yMin / yStep) * yStep;
      for (let y = yStartL; y <= yMax; y += yStep) {
        if (Math.abs(y) < yStep * 0.01) continue;
        const py = this._yToPixel(y);

        if (xMin <= 0 && xMax >= 0) {
          ctx.beginPath();
          ctx.moveTo(x0 - 3 * this.dpr, py);
          ctx.lineTo(x0 + 3 * this.dpr, py);
          ctx.stroke();
        }

        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(this._formatNum(y), xLabelPos, py);
      }

      // Origin '0' label
      if (xMin <= 0 && xMax >= 0 && yMin <= 0 && yMax >= 0) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('0', x0 - 6 * this.dpr, y0 + 4 * this.dpr);
      }
    }

    // ── Function curve drawing ────────────────────────────────────
    _drawFunctions() {
      const ctx = this.ctx;

      for (const func of this.functions) {
        const { evaluator, color } = func;
        const numSamples = Math.ceil(this._w * this.config.samplesPerPixel / this.dpr);
        const xRange = this.viewport.xMax - this.viewport.xMin;
        const dx = xRange / numSamples;

        ctx.strokeStyle = color;
        ctx.lineWidth = this.config.lineWidth * this.dpr;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // Sample the function
        const points = [];
        for (let i = 0; i <= numSamples; i++) {
          const x = this.viewport.xMin + i * dx;
          try {
            const y = evaluator(x);
            points.push({ x, y, px: this._xToPixel(x), py: this._yToPixel(y) });
          } catch (_) {
            points.push({ x, y: NaN, px: this._xToPixel(x), py: NaN });
          }
        }

        // Draw segments, breaking at discontinuities
        ctx.beginPath();
        let drawing = false;

        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          const isValid = isFinite(p.y) && isFinite(p.py);

          if (!isValid) {
            if (drawing) {
              ctx.stroke();
              ctx.beginPath();
              drawing = false;
            }
            continue;
          }

          // Check for discontinuity (large jump)
          if (drawing && i > 0 && this.config.detectDiscontinuities) {
            const prev = points[i - 1];
            if (isFinite(prev.py)) {
              const jump = Math.abs(p.py - prev.py);
              if (jump > this._h * 0.4) {
                // Discontinuity detected — break the path
                ctx.stroke();
                ctx.beginPath();
                drawing = false;
              }
            }
          }

          if (!drawing) {
            ctx.moveTo(p.px, p.py);
            drawing = true;
          } else {
            ctx.lineTo(p.px, p.py);
          }
        }

        if (drawing) ctx.stroke();
      }
    }

    // ── Crosshair & tooltip ───────────────────────────────────────
    _showCrosshair(e) {
      const rect = this.canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * this.dpr;
      const my = (e.clientY - rect.top) * this.dpr;
      const x = this._pixelToX(mx);
      const y = this._pixelToY(my);

      const ctx = this.crossCtx;
      ctx.clearRect(0, 0, this._w, this._h);

      const crossColor = this.isDark ? 'rgba(100,180,246,0.3)' : 'rgba(0,0,0,0.1)';
      ctx.strokeStyle = crossColor;
      ctx.lineWidth = 1 * this.dpr;
      ctx.setLineDash([4 * this.dpr, 4 * this.dpr]);

      ctx.beginPath();
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx, this._h);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, my);
      ctx.lineTo(this._w, my);
      ctx.stroke();

      ctx.setLineDash([]);

      // Snap to function & show value
      let tooltipLines = [`x: ${this._formatNum(x, 2)}`];
      for (const func of this.functions) {
        try {
          const fy = func.evaluator(x);
          if (isFinite(fy)) {
            tooltipLines.push(`y: ${this._formatNum(fy, 2)}`);

            // Draw snap dot
            const snapPy = this._yToPixel(fy);
            if (snapPy > 0 && snapPy < this._h) {
              ctx.beginPath();
              ctx.arc(mx, snapPy, 4 * this.dpr, 0, Math.PI * 2);
              ctx.fillStyle = func.color;
              ctx.fill();
              ctx.strokeStyle = this.isDark ? '#1e1e2e' : '#fff';
              ctx.lineWidth = 2 * this.dpr;
              ctx.stroke();
            }
          }
        } catch (_) { /* skip */ }
      }

      // Update tooltip
      const tipX = e.clientX - rect.left;
      const tipY = e.clientY - rect.top;
      this.tooltip.textContent = tooltipLines.join('  |  ');
      this.tooltip.style.display = 'block';

      // Position tooltip avoiding edges
      const tipRect = this.tooltip.getBoundingClientRect();
      let left = tipX + 12;
      let top = tipY - 30;
      if (left + tipRect.width > rect.width) left = tipX - tipRect.width - 12;
      if (top < 0) top = tipY + 12;
      this.tooltip.style.left = left + 'px';
      this.tooltip.style.top = top + 'px';
    }

    _hideCrosshair() {
      this.crossCtx.clearRect(0, 0, this._w, this._h);
      this.tooltip.style.display = 'none';
    }

    // ── Utilities ─────────────────────────────────────────────────
    _niceStep(range) {
      // Pick a "nice" tick spacing for ~8-12 ticks
      const rawStep = range / 10;
      const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
      const residual = rawStep / magnitude;
      let nice;
      if (residual <= 1.5) nice = 1;
      else if (residual <= 3) nice = 2;
      else if (residual <= 7) nice = 5;
      else nice = 10;
      return nice * magnitude;
    }

    _formatNum(n, decimals) {
      if (decimals !== undefined) {
        return Number(n.toFixed(decimals)).toString();
      }
      if (Number.isInteger(n)) return n.toString();
      if (Math.abs(n) >= 100) return Math.round(n).toString();
      if (Math.abs(n) >= 1) return n.toFixed(1);
      return n.toFixed(2);
    }
  }

  // Expose globally
  window.MathGraph = MathGraph;
  window.MathEval = MathEval;
})();

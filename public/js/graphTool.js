/**
 * GraphTool — Interactive SVG coordinate grid for plotting lines.
 *
 * Usage:
 *   The AI emits <GRAPH_TOOL type="plot-line" slope="2" intercept="3">
 *   The frontend detects the tag, renders this tool inline in chat.
 *   Student clicks two points → line draws → they submit.
 *   Result is sent back to the AI as a structured message.
 */

class GraphTool {
  constructor(container, options = {}) {
    this.container = typeof container === 'string'
      ? document.getElementById(container) : container;

    this.options = {
      width: 380,
      height: 380,
      xMin: -10,
      xMax: 10,
      yMin: -10,
      yMax: 10,
      type: 'plot-line',        // future: plot-points, identify-slope
      expectedSlope: null,
      expectedIntercept: null,
      onSubmit: null,           // callback(result)
      ...options
    };

    this.points = [];
    this.ns = 'http://www.w3.org/2000/svg';
    this.init();
  }

  // ── Coordinate conversion ───────────────────────────────────
  gridToPixel(gx, gy) {
    const { width, height, xMin, xMax, yMin, yMax } = this.options;
    return {
      x: ((gx - xMin) / (xMax - xMin)) * width,
      y: ((yMax - gy) / (yMax - yMin)) * height
    };
  }

  pixelToGrid(px, py) {
    const { width, height, xMin, xMax, yMin, yMax } = this.options;
    return {
      x: Math.round((px / width) * (xMax - xMin) + xMin),
      y: Math.round(yMax - (py / height) * (yMax - yMin))
    };
  }

  getSVGPos(e) {
    const rect = this.svg.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  // ── Initialization ──────────────────────────────────────────
  init() {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'graph-tool-wrapper';

    this.buildSVG();
    this.buildInfoDisplay();
    this.buildButtons();

    this.container.appendChild(this.wrapper);
  }

  buildSVG() {
    const { width, height } = this.options;

    this.svg = document.createElementNS(this.ns, 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.svg.classList.add('graph-tool-svg');

    this.drawGrid();
    this.drawAxes();

    // Interactive layer (points, lines, rise/run)
    this.interactiveLayer = this.createGroup('interactive-layer');
    this.svg.appendChild(this.interactiveLayer);

    // Rise/run preview layer (inside interactive)
    this.riseRunGroup = this.createGroup('rise-run-group');
    this.interactiveLayer.appendChild(this.riseRunGroup);

    // Hover crosshair (snap indicator)
    this.crosshair = this.createGroup('crosshair-group');
    this.crosshair.style.display = 'none';
    this.chX = this.makeLine(0, 0, 0, 0, 'crosshair-line');
    this.chY = this.makeLine(0, 0, 0, 0, 'crosshair-line');
    this.chDot = this.makeCircle(0, 0, 4, 'crosshair-dot');
    this.crosshair.append(this.chX, this.chY, this.chDot);
    this.svg.appendChild(this.crosshair);

    // Events
    this.svg.addEventListener('click', (e) => this.handleClick(e));
    this.svg.addEventListener('mousemove', (e) => this.handleMove(e));
    this.svg.addEventListener('mouseleave', () => this.hideCrosshair());
    this.svg.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.handleClick(e);
    }, { passive: false });

    this.wrapper.appendChild(this.svg);
  }

  buildInfoDisplay() {
    this.infoDisplay = document.createElement('div');
    this.infoDisplay.className = 'graph-tool-info';
    this.setHint('Click to place your first point on the grid');
    this.wrapper.appendChild(this.infoDisplay);
  }

  buildButtons() {
    const group = document.createElement('div');
    group.className = 'graph-tool-buttons';

    this.submitBtn = document.createElement('button');
    this.submitBtn.className = 'graph-tool-btn graph-tool-submit';
    this.submitBtn.textContent = 'Submit My Line';
    this.submitBtn.disabled = true;
    this.submitBtn.addEventListener('click', () => this.submit());

    this.clearBtn = document.createElement('button');
    this.clearBtn.className = 'graph-tool-btn graph-tool-clear';
    this.clearBtn.textContent = 'Clear';
    this.clearBtn.addEventListener('click', () => this.clear());

    group.append(this.submitBtn, this.clearBtn);
    this.wrapper.appendChild(group);
  }

  // ── Grid & Axes ─────────────────────────────────────────────
  drawGrid() {
    const g = this.createGroup('grid-lines');
    const { xMin, xMax, yMin, yMax } = this.options;

    for (let x = xMin; x <= xMax; x++) {
      const p1 = this.gridToPixel(x, yMin);
      const p2 = this.gridToPixel(x, yMax);
      const cls = x % 5 === 0 && x !== 0 ? 'grid-line grid-major' : 'grid-line';
      g.appendChild(this.makeLine(p1.x, p1.y, p2.x, p2.y, cls));
    }
    for (let y = yMin; y <= yMax; y++) {
      const p1 = this.gridToPixel(xMin, y);
      const p2 = this.gridToPixel(xMax, y);
      const cls = y % 5 === 0 && y !== 0 ? 'grid-line grid-major' : 'grid-line';
      g.appendChild(this.makeLine(p1.x, p1.y, p2.x, p2.y, cls));
    }
    this.svg.appendChild(g);
  }

  drawAxes() {
    const g = this.createGroup('axes');
    const { xMin, xMax, yMin, yMax } = this.options;

    // X-axis
    const xa1 = this.gridToPixel(xMin, 0), xa2 = this.gridToPixel(xMax, 0);
    g.appendChild(this.makeLine(xa1.x, xa1.y, xa2.x, xa2.y, 'axis-line'));

    // Y-axis
    const ya1 = this.gridToPixel(0, yMin), ya2 = this.gridToPixel(0, yMax);
    g.appendChild(this.makeLine(ya1.x, ya1.y, ya2.x, ya2.y, 'axis-line'));

    // Labels — every 5 to avoid clutter
    for (let x = xMin; x <= xMax; x += 5) {
      if (x === 0) continue;
      const p = this.gridToPixel(x, 0);
      g.appendChild(this.makeText(p.x, p.y + 14, x, 'axis-label'));
      g.appendChild(this.makeLine(p.x, p.y - 3, p.x, p.y + 3, 'axis-tick'));
    }
    for (let y = yMin; y <= yMax; y += 5) {
      if (y === 0) continue;
      const p = this.gridToPixel(0, y);
      const t = this.makeText(p.x - 8, p.y + 4, y, 'axis-label');
      t.setAttribute('text-anchor', 'end');
      g.appendChild(t);
      g.appendChild(this.makeLine(p.x - 3, p.y, p.x + 3, p.y, 'axis-tick'));
    }

    // Origin
    const o = this.gridToPixel(0, 0);
    const oz = this.makeText(o.x - 8, o.y + 14, '0', 'axis-label');
    oz.setAttribute('text-anchor', 'end');
    g.appendChild(oz);

    this.svg.appendChild(g);
  }

  // ── Interaction handlers ────────────────────────────────────
  handleClick(e) {
    if (this.points.length >= 2) return;

    const svgPos = this.getSVGPos(e);
    const grid = this.pixelToGrid(svgPos.x, svgPos.y);

    // Bounds check
    if (grid.x < this.options.xMin || grid.x > this.options.xMax ||
        grid.y < this.options.yMin || grid.y > this.options.yMax) return;

    // Don't allow duplicate point
    if (this.points.length === 1 &&
        this.points[0].x === grid.x && this.points[0].y === grid.y) return;

    this.points.push(grid);
    this.drawPoint(grid, this.points.length);

    if (this.points.length === 1) {
      this.setInfo(`First point: <strong>(${grid.x}, ${grid.y})</strong> — now click a second point`);
    } else {
      this.drawFullLine();
      this.drawRiseRun(this.points[0], this.points[1]);
      this.showResult();
      this.submitBtn.disabled = false;
      this.hideCrosshair();
    }
  }

  handleMove(e) {
    const svgPos = this.getSVGPos(e);
    const grid = this.pixelToGrid(svgPos.x, svgPos.y);
    const snap = this.gridToPixel(grid.x, grid.y);
    const { width, height } = this.options;

    // Show crosshair at snapped position
    this.crosshair.style.display = '';
    this.chX.setAttribute('x1', snap.x); this.chX.setAttribute('y1', 0);
    this.chX.setAttribute('x2', snap.x); this.chX.setAttribute('y2', height);
    this.chY.setAttribute('x1', 0);      this.chY.setAttribute('y1', snap.y);
    this.chY.setAttribute('x2', width);  this.chY.setAttribute('y2', snap.y);
    this.chDot.setAttribute('cx', snap.x);
    this.chDot.setAttribute('cy', snap.y);

    // Preview rise/run from first point
    if (this.points.length === 1) {
      this.drawRiseRun(this.points[0], grid);
      const rise = grid.y - this.points[0].y;
      const run = grid.x - this.points[0].x;
      if (run !== 0 || rise !== 0) {
        const slopeStr = run === 0 ? 'undefined' : this.formatSlope(rise, run);
        this.setInfo(`Rise: <strong>${rise}</strong> &nbsp; Run: <strong>${run}</strong> &nbsp; Slope: <strong>${slopeStr}</strong>`);
      }
    }
  }

  hideCrosshair() {
    this.crosshair.style.display = 'none';
  }

  // ── Drawing helpers ─────────────────────────────────────────
  drawPoint(grid, num) {
    const p = this.gridToPixel(grid.x, grid.y);

    const circle = this.makeCircle(p.x, p.y, 6, 'graph-point');
    const label = this.makeText(p.x + 10, p.y - 10, `(${grid.x}, ${grid.y})`, 'point-label');

    this.interactiveLayer.appendChild(circle);
    this.interactiveLayer.appendChild(label);
  }

  drawFullLine() {
    const [p1, p2] = this.points;
    const { xMin, xMax, yMin, yMax } = this.options;
    let start, end;

    if (p1.x === p2.x) {
      // Vertical
      start = this.gridToPixel(p1.x, yMin);
      end = this.gridToPixel(p1.x, yMax);
    } else {
      const m = (p2.y - p1.y) / (p2.x - p1.x);
      const b = p1.y - m * p1.x;
      const yAtLeft = m * xMin + b;
      const yAtRight = m * xMax + b;
      start = this.gridToPixel(xMin, yAtLeft);
      end = this.gridToPixel(xMax, yAtRight);
    }

    const line = this.makeLine(start.x, start.y, end.x, end.y, 'graph-line');
    this.interactiveLayer.insertBefore(line, this.interactiveLayer.firstChild);
  }

  drawRiseRun(from, to) {
    // Clear previous
    while (this.riseRunGroup.firstChild) {
      this.riseRunGroup.removeChild(this.riseRunGroup.firstChild);
    }

    const rise = to.y - from.y;
    const run = to.x - from.x;
    if (run === 0 && rise === 0) return;

    const fp = this.gridToPixel(from.x, from.y);
    const cp = this.gridToPixel(to.x, from.y);  // corner (right angle)
    const tp = this.gridToPixel(to.x, to.y);

    // Run line (horizontal)
    this.riseRunGroup.appendChild(
      this.makeLine(fp.x, fp.y, cp.x, cp.y, 'rr-line rr-run'));

    // Rise line (vertical)
    this.riseRunGroup.appendChild(
      this.makeLine(cp.x, cp.y, tp.x, tp.y, 'rr-line rr-rise'));

    // Run label
    if (run !== 0) {
      const rl = this.makeText(
        (fp.x + cp.x) / 2, fp.y + (rise >= 0 ? 16 : -6),
        `run: ${run}`, 'rr-label rr-run-label');
      this.riseRunGroup.appendChild(rl);
    }

    // Rise label
    if (rise !== 0) {
      const rl = this.makeText(
        cp.x + (run >= 0 ? 6 : -6), (cp.y + tp.y) / 2 + 4,
        `rise: ${rise}`, 'rr-label rr-rise-label');
      rl.setAttribute('text-anchor', run >= 0 ? 'start' : 'end');
      this.riseRunGroup.appendChild(rl);
    }
  }

  // ── Result & Submission ─────────────────────────────────────
  showResult() {
    const [p1, p2] = this.points;
    const rise = p2.y - p1.y;
    const run = p2.x - p1.x;
    const slopeStr = run === 0 ? 'undefined' : this.formatSlope(rise, run);

    let equation = '';
    if (run === 0) {
      equation = `x = ${p1.x}`;
    } else {
      const m = rise / run;
      const b = p1.y - m * p1.x;
      equation = this.formatEquation(m, b);
    }

    this.setInfo(
      `<div class="graph-tool-result">` +
      `<span>Points: <strong>(${p1.x}, ${p1.y})</strong> and <strong>(${p2.x}, ${p2.y})</strong></span>` +
      `<span>Rise: <strong>${rise}</strong> &nbsp; Run: <strong>${run}</strong> &nbsp; Slope: <strong>${slopeStr}</strong></span>` +
      `<span>Your line: <strong>${equation}</strong></span>` +
      `</div>`
    );
  }

  submit() {
    if (this.points.length < 2) return;

    const [p1, p2] = this.points;
    const rise = p2.y - p1.y;
    const run = p2.x - p1.x;
    const slope = run !== 0 ? rise / run : null;
    const intercept = run !== 0 ? p1.y - slope * p1.x : null;

    const result = {
      points: [p1, p2],
      slope,
      yIntercept: intercept,
      rise,
      run,
      equation: run === 0 ? `x = ${p1.x}` : this.formatEquation(slope, intercept)
    };

    // Lock the tool
    this.svg.style.pointerEvents = 'none';
    this.submitBtn.disabled = true;
    this.clearBtn.disabled = true;
    this.wrapper.classList.add('graph-tool-submitted');

    if (this.options.onSubmit) {
      this.options.onSubmit(result);
    }
  }

  clear() {
    // Remove interactive elements
    while (this.interactiveLayer.firstChild) {
      this.interactiveLayer.removeChild(this.interactiveLayer.firstChild);
    }
    // Recreate rise/run group
    this.riseRunGroup = this.createGroup('rise-run-group');
    this.interactiveLayer.appendChild(this.riseRunGroup);

    this.points = [];
    this.submitBtn.disabled = true;
    this.setHint('Click to place your first point on the grid');
  }

  // ── Math formatting ─────────────────────────────────────────
  formatSlope(rise, run) {
    if (rise === 0) return '0';
    const g = this.gcd(Math.abs(rise), Math.abs(run));
    const sr = rise / g;
    const sn = run / g;
    // Keep sign on numerator
    const sign = (sr < 0) !== (sn < 0) ? '-' : '';
    const absR = Math.abs(sr);
    const absN = Math.abs(sn);
    return absN === 1 ? `${sign}${absR}` : `${sign}${absR}/${absN}`;
  }

  formatEquation(m, b) {
    // y = mx + b in a readable form
    let mStr;
    if (m === 0) return `y = ${b}`;
    if (m === 1) mStr = '';
    else if (m === -1) mStr = '-';
    else mStr = Number.isInteger(m) ? `${m}` : `${this.toFraction(m)}`;

    let bStr = '';
    if (b > 0) bStr = ` + ${b}`;
    else if (b < 0) bStr = ` - ${Math.abs(b)}`;

    return `y = ${mStr}x${bStr}`;
  }

  toFraction(decimal) {
    // Simple fraction conversion for common slopes
    for (let d = 1; d <= 10; d++) {
      const n = decimal * d;
      if (Math.abs(n - Math.round(n)) < 0.001) {
        const num = Math.round(n);
        const g = this.gcd(Math.abs(num), d);
        return `${num / g}/${d / g}`;
      }
    }
    return decimal.toFixed(2);
  }

  gcd(a, b) { return b === 0 ? a : this.gcd(b, a % b); }

  // ── SVG element factories ───────────────────────────────────
  createGroup(cls) {
    const g = document.createElementNS(this.ns, 'g');
    if (cls) g.setAttribute('class', cls);
    return g;
  }

  makeLine(x1, y1, x2, y2, cls) {
    const l = document.createElementNS(this.ns, 'line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1);
    l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    if (cls) l.setAttribute('class', cls);
    return l;
  }

  makeCircle(cx, cy, r, cls) {
    const c = document.createElementNS(this.ns, 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy);
    c.setAttribute('r', r);
    if (cls) c.setAttribute('class', cls);
    return c;
  }

  makeText(x, y, content, cls) {
    const t = document.createElementNS(this.ns, 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.setAttribute('text-anchor', 'middle');
    if (cls) t.setAttribute('class', cls);
    t.textContent = content;
    return t;
  }

  // ── Info display helpers ────────────────────────────────────
  setHint(text) {
    this.infoDisplay.innerHTML = `<span class="graph-tool-hint">${text}</span>`;
  }
  setInfo(html) {
    this.infoDisplay.innerHTML = html;
  }

  destroy() {
    if (this.wrapper && this.wrapper.parentNode) {
      this.wrapper.parentNode.removeChild(this.wrapper);
    }
  }
}

// Expose globally
window.GraphTool = GraphTool;

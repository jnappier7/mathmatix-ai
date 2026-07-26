/**
 * ACT Math Practice Test — student-facing runner.
 *
 * Self-contained: builds its own DOM + styles on first open, so it has no
 * dependency on pre-existing markup. Drives the /api/act-test rail
 * (start → next-problem → submit-answer → complete) built in routes/actTest.js.
 *
 * Open with window.openActTest(). Timed (60 min), 60 items, results screen
 * shows the scaled 1–36 estimate + a per-category breakdown (the diagnostic
 * that seeds the boot-camp plan).
 */
(function () {
  'use strict';

  const CSS = `
  .actt-overlay{position:fixed;inset:0;background:rgba(20,16,40,.55);backdrop-filter:blur(3px);z-index:10000;display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap;padding:16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  .actt-card{background:#fff;color:#1b1b2b;width:min(640px,100%);max-height:92vh;border-radius:16px;box-shadow:0 24px 70px rgba(30,20,70,.35);display:flex;flex-direction:column;overflow:hidden}
  .actt-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff}
  .actt-title{font-weight:700;font-size:15px;display:flex;align-items:center;gap:8px}
  .actt-timer{font-variant-numeric:tabular-nums;font-weight:700;font-size:14px;background:rgba(255,255,255,.18);padding:4px 10px;border-radius:8px}
  .actt-timer.low{background:#e5484d}
  .actt-x{background:transparent;border:0;color:#fff;font-size:20px;cursor:pointer;line-height:1;opacity:.9}
  .actt-progwrap{padding:10px 18px 0}
  .actt-progrow{display:flex;justify-content:space-between;font-size:12px;color:#777;margin-bottom:6px}
  .actt-bar{height:6px;background:#ece9f5;border-radius:3px;overflow:hidden}
  .actt-fill{height:100%;background:linear-gradient(90deg,#667eea,#764ba2);width:0;transition:width .25s}
  .actt-body{padding:18px;overflow-y:auto}
  .actt-fig{display:flex;justify-content:center;margin:2px 0 14px}
  .actt-fig svg{background:#faf9ff;border:1px solid #efedf8;border-radius:10px;padding:8px}
  .actt-q{font-size:17px;line-height:1.5;margin:4px 0 16px;white-space:pre-wrap}
  .actt-opts{display:flex;flex-direction:column;gap:8px}
  .actt-opt{display:flex;align-items:center;gap:12px;padding:12px 14px;border:2px solid #e7e4f1;border-radius:11px;cursor:pointer;font-size:15px;background:#fff;text-align:left;transition:all .12s}
  .actt-opt:hover{border-color:#b9aef0;background:#faf9ff}
  .actt-opt.sel{border-color:#764ba2;background:#f3efff;box-shadow:0 0 0 3px rgba(118,75,162,.12)}
  .actt-optlab{flex:0 0 26px;height:26px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:13px;background:#ece9f5;color:#555}
  .actt-opt.sel .actt-optlab{background:#764ba2;color:#fff}
  .actt-foot{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:14px 18px;border-top:1px solid #eee}
  .actt-btn{appearance:none;border:0;border-radius:10px;padding:11px 20px;font-weight:600;font-size:14px;cursor:pointer}
  .actt-next{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff}
  .actt-next:disabled{opacity:.5;cursor:not-allowed}
  .actt-skip{background:#f1f0f7;color:#666}
  .actt-center{padding:40px 18px;text-align:center;color:#555}
  .actt-score{font-size:64px;font-weight:800;background:linear-gradient(135deg,#667eea,#764ba2);-webkit-background-clip:text;background-clip:text;color:transparent;line-height:1}
  .actt-scorelab{font-size:13px;color:#888;letter-spacing:.06em;text-transform:uppercase;margin-top:4px}
  .actt-sub{color:#666;margin:10px 0 20px;font-size:14px}
  .actt-cat{display:flex;align-items:center;gap:10px;margin:8px 0;font-size:13px}
  .actt-catname{flex:0 0 200px;text-align:right;color:#555;text-transform:capitalize}
  .actt-catbar{flex:1;height:9px;background:#ece9f5;border-radius:5px;overflow:hidden;display:block}
  .actt-catfill{display:block;height:100%;background:linear-gradient(90deg,#667eea,#764ba2)}
  .actt-catpct{flex:0 0 54px;text-align:left;color:#777;font-variant-numeric:tabular-nums}
  .actt-trend{font-size:20px;font-weight:800;color:#764ba2;text-align:center;letter-spacing:.02em}
  .actt-cmp{display:flex;align-items:center;gap:10px;margin:8px 0;font-size:13px}
  .actt-cmpname{flex:0 0 180px;text-align:right;color:#555;text-transform:capitalize}
  .actt-cmpval{flex:1;color:#333;font-variant-numeric:tabular-nums}
  .actt-delta{flex:0 0 62px;text-align:center;font-weight:700;font-size:11px;padding:2px 6px;border-radius:20px;font-variant-numeric:tabular-nums}
  .actt-up{background:#e4f6ea;color:#1a7f43}
  .actt-down{background:#fdeaea;color:#c0392b}
  .actt-same{background:#eee;color:#888}
  .actt-err{color:#c0392b;padding:24px;text-align:center}
  @media (prefers-color-scheme:dark){
    .actt-card{background:#1c1a2b;color:#ece9f7}
    .actt-opt{background:#211e32;border-color:#302c45;color:#ece9f7}
    .actt-opt:hover{background:#26233a}
    .actt-opt.sel{background:#2b2547;border-color:#9a80ff}
    .actt-optlab{background:#302c45;color:#cbc7e0}
    .actt-foot{border-color:#2d2a40}
    .actt-skip{background:#26233a;color:#cbc7e0}
    .actt-bar,.actt-catbar{background:#2d2a40}
    .actt-catname{color:#b7b3cc}
    .actt-cmpname{color:#b7b3cc}.actt-cmpval{color:#d7d3ea}
    .actt-up{background:#183a27;color:#63d391}.actt-down{background:#3a1c1c;color:#ff8a8a}.actt-same{background:#2d2a40;color:#9a96b2}
  }
  /* ── Scientific calculator (ACT permits one on the whole Math section) ── */
  .actt-calc{width:296px;max-width:100%;background:#fff;color:#1b1b2b;border-radius:16px;box-shadow:0 24px 70px rgba(30,20,70,.35);display:none;flex-direction:column;overflow:hidden;font-variant-numeric:tabular-nums;-webkit-user-select:none;user-select:none}
  .actt-calc.show{display:flex}
  .actt-calc-head{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff}
  .actt-calc-title{font-weight:700;font-size:13px;display:flex;align-items:center;gap:7px}
  .actt-calc-tools{display:flex;align-items:center;gap:8px}
  .actt-deg{cursor:pointer;font-size:11px;font-weight:700;letter-spacing:.04em;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.45);color:#fff;border-radius:7px;padding:3px 9px}
  .actt-deg.rad{background:rgba(255,255,255,.32)}
  .actt-calc-disp{padding:12px 14px;text-align:right;background:#faf9ff;border-bottom:1px solid #efedf8}
  .actt-calc-expr{min-height:15px;font-size:13px;color:#8a86a0;word-break:break-all;line-height:1.35;letter-spacing:.01em}
  .actt-calc-res{font-size:27px;font-weight:700;color:#1b1b2b;min-height:32px;word-break:break-all;line-height:1.15}
  .actt-calc-keys{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;padding:10px}
  .actt-k{appearance:none;border:0;border-radius:11px;padding:0;height:44px;font-size:15px;font-weight:600;cursor:pointer;background:#f1f0f7;color:#26233a;transition:filter .1s,transform .04s;touch-action:manipulation}
  .actt-k:active{filter:brightness(.9);transform:translateY(1px)}
  .actt-k.fn{background:#efeafb;color:#6b54b0;font-size:13px;font-weight:700}
  .actt-k.op{background:#e5dcfb;color:#5b3ea8;font-size:18px}
  .actt-k.eq{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;font-size:19px}
  .actt-k.clr{background:#fbe4e4;color:#c0392b}
  .actt-k.zero{grid-column:span 3}
  @media (prefers-color-scheme:dark){
    .actt-calc{background:#1c1a2b;color:#ece9f7}
    .actt-calc-disp{background:#211e32;border-color:#302c45}
    .actt-calc-res{color:#f2f0fb}.actt-calc-expr{color:#9a96b2}
    .actt-k{background:#26233a;color:#e7e4f4}
    .actt-k.fn{background:#2b2547;color:#c3b4ff}
    .actt-k.op{background:#332a52;color:#c3b4ff}
    .actt-k.clr{background:#3a1c1c;color:#ff8a8a}
  }
  @media (max-width:700px){ .actt-calc{width:100%;order:2} .actt-card{order:1} }`;

  const CATEGORY_LABELS = {
    'integrating-essential-skills': 'Essential skills',
    'number-quantity': 'Number & quantity',
    'algebra': 'Algebra',
    'functions': 'Functions',
    'geometry': 'Geometry',
    'statistics-probability': 'Statistics & probability',
    'unknown': 'Other',
  };

  function api(url, opts) {
    const fetcher = window.csrfFetch || window.fetch;
    return fetcher(url, opts).then(r => r.json());
  }

  class ActTest {
    constructor() {
      this.sessionId = null;
      this.current = null;
      this.selected = null;
      this.total = 60;
      this.itemStart = 0;
      this.deadline = 0;
      this.timerId = null;
      this._injectCss();
    }

    _injectCss() {
      if (document.getElementById('actt-style')) return;
      const s = document.createElement('style');
      s.id = 'actt-style';
      s.textContent = CSS;
      document.head.appendChild(s);
    }

    _mount() {
      if (this.overlay) return;
      this.overlay = document.createElement('div');
      this.overlay.className = 'actt-overlay';
      this.overlay.innerHTML = `
        <div class="actt-card" role="dialog" aria-modal="true" aria-label="ACT Math Practice Test">
          <div class="actt-head">
            <span class="actt-title">📐 ACT Math Practice Test</span>
            <span style="display:flex;align-items:center;gap:10px">
              <button class="actt-x" id="actt-calc" aria-label="Calculator" title="Calculator (allowed on the ACT)" style="display:none;font-size:14px;font-weight:600;padding:2px 8px;border:1px solid rgba(255,255,255,.5);border-radius:8px">Calc</button>
              <span class="actt-timer" id="actt-timer">60:00</span>
              <button class="actt-x" id="actt-close" aria-label="Close">×</button>
            </span>
          </div>
          <div class="actt-progwrap" id="actt-progwrap" style="display:none">
            <div class="actt-progrow"><span id="actt-qnum"></span><span id="actt-qpct"></span></div>
            <div class="actt-bar"><div class="actt-fill" id="actt-fill"></div></div>
          </div>
          <div class="actt-body" id="actt-body"></div>
          <div class="actt-foot" id="actt-foot" style="display:none">
            <button class="actt-btn actt-skip" id="actt-skip">Skip</button>
            <button class="actt-btn actt-next" id="actt-next" disabled>Next</button>
          </div>
        </div>
        <div class="actt-calc" id="actt-calc-panel" role="group" aria-label="Calculator">
          <div class="actt-calc-head">
            <span class="actt-calc-title">🧮 Calculator</span>
            <span class="actt-calc-tools">
              <button class="actt-deg" id="actt-deg" title="Switch between degrees and radians">DEG</button>
              <button class="actt-x" id="actt-calc-close" aria-label="Close calculator" style="font-size:18px">×</button>
            </span>
          </div>
          <div class="actt-calc-disp">
            <div class="actt-calc-expr" id="actt-calc-expr"></div>
            <div class="actt-calc-res" id="actt-calc-res">0</div>
          </div>
          <div class="actt-calc-keys" id="actt-calc-keys"></div>
        </div>`;
      document.body.appendChild(this.overlay);
      this.overlay.querySelector('#actt-close').addEventListener('click', () => this.close());
      this.overlay.querySelector('#actt-skip').addEventListener('click', () => this.submit(true));
      this.overlay.querySelector('#actt-next').addEventListener('click', () => this.submit(false));
      this.overlay.querySelector('#actt-calc').addEventListener('click', () => this._toggleCalc());
      this.el = (id) => this.overlay.querySelector('#' + id);
      this.overlay.querySelector('#actt-calc-close').addEventListener('click', () => this._hideCalc());
      this.overlay.querySelector('#actt-deg').addEventListener('click', () => this._calcToggleDeg());
      this._calcExpr = '';
      this._calcDeg = true;
      this._calcAns = '';
      this._buildCalc();
    }

    // On-screen scientific calculator, built into the runner. The real ACT Math
    // section permits a calculator on EVERY question, so the baseline offers one
    // or it understates the score and mis-targets the bootcamp. It's a sibling of
    // the card inside the runner's centered overlay (so it docks beside it with
    // no fixed-position clipping), scientific-only (no graphing/CAS — ACT-
    // appropriate), and ALWAYS available here regardless of the teacher/IEP
    // tutoring-time restriction, because that restriction is a practice choice,
    // not a test condition. Dismissed on close()/complete() so it never strands.
    _toggleCalc() {
      const panel = this.el && this.el('actt-calc-panel');
      if (panel) panel.classList.toggle('show');
    }
    _hideCalc() {
      const panel = this.el && this.el('actt-calc-panel');
      if (panel) panel.classList.remove('show');
    }
    _calcToggleDeg() {
      this._calcDeg = !this._calcDeg;
      const b = this.el('actt-deg');
      if (b) { b.textContent = this._calcDeg ? 'DEG' : 'RAD'; b.classList.toggle('rad', !this._calcDeg); }
      this._calcRender();   // trig preview reflects the new mode immediately
    }

    // Keypad: [label, insert-token, css-class]. Tokens carry display glyphs; the
    // evaluator normalizes them. Function keys auto-open a paren.
    _buildCalc() {
      const K = [
        ['AC', 'ac', 'clr'], ['⌫', 'del', 'clr'], ['(', '(', 'fn'], [')', ')', 'fn'], ['÷', '÷', 'op'],
        ['sin', 'sin(', 'fn'], ['cos', 'cos(', 'fn'], ['tan', 'tan(', 'fn'], ['xʸ', '^', 'op'], ['×', '×', 'op'],
        ['ln', 'ln(', 'fn'], ['log', 'log(', 'fn'], ['√', 'sqrt(', 'fn'], ['π', 'π', 'fn'], ['−', '−', 'op'],
        ['7', '7', ''], ['8', '8', ''], ['9', '9', ''], ['e', 'E', 'fn'], ['+', '+', 'op'],
        ['4', '4', ''], ['5', '5', ''], ['6', '6', ''], ['x²', '^2', 'op'], ['(-)', '-', 'fn'],
        ['1', '1', ''], ['2', '2', ''], ['3', '3', ''], ['%', '/100', 'fn'], ['=', 'eq', 'eq'],
        ['0', '0', 'zero'], ['.', '.', ''], ['ANS', 'ans', 'fn'],
      ];
      const keys = this.el('actt-calc-keys');
      if (!keys) return;
      keys.innerHTML = K.map(([lab, tok, cls]) =>
        `<button class="actt-k ${cls}" data-tok="${tok}">${lab}</button>`).join('');
      keys.querySelectorAll('.actt-k').forEach((btn) =>
        btn.addEventListener('click', () => this._calcKey(btn.getAttribute('data-tok'))));
      this._calcRender();
    }

    _calcKey(tok) {
      if (tok === 'ac') { this._calcExpr = ''; return this._calcRender(); }
      if (tok === 'del') { this._calcExpr = this._calcExpr.slice(0, -1); return this._calcRender(); }
      if (tok === 'ans') { this._calcExpr += (this._calcAns || ''); return this._calcRender(); }
      if (tok === 'eq') {
        try {
          const out = String(this._calcEval(this._calcExpr));
          this._calcAns = out;
          this.el('actt-calc-expr').textContent = this._calcExpr;
          this.el('actt-calc-res').textContent = out;
          this._calcExpr = out;   // chain from the result
        } catch (e) {
          this.el('actt-calc-res').textContent = 'Error';
        }
        return;
      }
      this._calcExpr += tok;
      this._calcRender();
    }

    _calcRender() {
      const expr = this.el('actt-calc-expr'), res = this.el('actt-calc-res');
      if (!expr || !res) return;
      expr.textContent = this._calcExpr;
      if (!this._calcExpr) { res.textContent = '0'; return; }
      try { res.textContent = String(this._calcEval(this._calcExpr)); }
      catch (e) { res.textContent = ''; }   // mid-expression → blank preview, not "Error"
    }

    // Normalize glyphs, insert implicit multiplication, evaluate against a FIXED
    // scope of math helpers (trig honors DEG/RAD). No page globals; the only
    // input is button-driven tokens.
    _calcEval(raw) {
      let js = String(raw)
        .replace(/π/g, '(pi)').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
        .replace(/\^/g, '**');
      js = js.replace(/(\d|\)|pi|E)\s*\(/g, '$1*(')
             .replace(/\)\s*(\d|pi|E)/g, ')*$1')
             .replace(/(\d)\s*(pi|E)\b/g, '$1*$2');
      const D = this._calcDeg ? Math.PI / 180 : 1;
      const scope = {
        pi: Math.PI, E: Math.E,
        sin: (x) => Math.sin(x * D), cos: (x) => Math.cos(x * D), tan: (x) => Math.tan(x * D),
        ln: (x) => Math.log(x), log: (x) => Math.log10(x), sqrt: (x) => Math.sqrt(x),
      };
      const fn = new Function(...Object.keys(scope), 'return (' + js + ');');
      const v = fn(...Object.values(scope));
      if (typeof v !== 'number' || !isFinite(v)) throw new Error('bad');
      return parseFloat(v.toPrecision(12));   // trim float noise (0.1+0.2 → 0.3)
    }

    // Intro / "Begin" screen. The timer starts only when the student clicks
    // Begin — never on open() — so a baseline can be presented (or auto-opened as
    // the course's registration step) without ambushing them into a running clock.
    // No pause by design: pacing is part of what the ACT measures, so a pausable
    // baseline would post an inflated score and mis-target the whole bootcamp.
    async open() {
      this._mount();
      this.overlay.style.display = 'flex';
      this.el('actt-timer').style.display = 'none';    // no clock on the intro
      this.el('actt-calc').style.display = 'none';     // calc appears with the test
      this.el('actt-foot').style.display = 'none';
      this.el('actt-body').innerHTML = `
        <div style="max-width:520px;margin:0 auto;padding:6px 4px 4px">
          <h2 style="margin:0 0 10px;font-size:20px">Your baseline ACT Math test</h2>
          <p style="margin:0 0 14px;line-height:1.5">This is your <strong>baseline</strong> — a full, timed ACT Math section (about 45 minutes). Your tutor uses the results to focus your prep on exactly what you need, and marks anything you ace as done so you don't re-grind it.</p>
          <ul style="margin:0 0 18px;padding-left:20px;line-height:1.6">
            <li><strong>It's timed and can't be paused</strong> — just like the real ACT. Pacing is part of the score.</li>
            <li>Do it in <strong>one sitting</strong>. Find a quiet spot and grab scratch paper first.</li>
            <li>Don't stress any single question — answer, move on, keep the clock moving.</li>
          </ul>
          <button id="actt-begin" style="width:100%;padding:13px 16px;font-size:16px;font-weight:700;border:0;border-radius:12px;cursor:pointer;color:#fff;background:linear-gradient(135deg,#6366f1,#8b5cf6)">Begin when ready</button>
        </div>`;
      const beginBtn = this.overlay.querySelector('#actt-begin');
      if (beginBtn) beginBtn.addEventListener('click', () => this._begin());
    }

    // Actually start (or resume) the test + the clock. Only reached via the
    // Begin button, so the timer never starts behind the student's back.
    async _begin() {
      this.el('actt-timer').style.display = '';
      this.el('actt-calc').style.display = '';
      this.el('actt-body').innerHTML = '<div class="actt-center">Building your practice test…</div>';
      try {
        const data = await api('/api/act-test/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        if (data && data.needsGeneration !== undefined) {
          this.el('actt-body').innerHTML = `<div class="actt-err">The ACT item bank isn't loaded yet.<br><small>Ask an admin to run <code>npm run act:seed</code>.</small></div>`;
          return;
        }
        if (!data || !data.sessionId) throw new Error((data && data.message) || 'Could not start.');
        this.sessionId = data.sessionId;
        this.total = data.totalItems || 60;
        const mins = data.timeLimitMinutes || 60;
        this.deadline = Date.now() + mins * 60000;
        this._startTimer();
        this.el('actt-progwrap').style.display = '';
        this.el('actt-foot').style.display = 'flex';
        await this.fetchNext();
      } catch (e) {
        this.el('actt-body').innerHTML = `<div class="actt-err">${e.message || 'Something went wrong.'}</div>`;
      }
    }

    close() {
      this._stopTimer();
      this._hideCalc();
      if (this.overlay) this.overlay.style.display = 'none';
      // If this was a completed baseline, let the course begin teaching now —
      // adapted to the results. Guarded by _completed so cancelling the test
      // (the X, or closing before finishing) never starts the course early.
      if (this._completed && window.courseManager && typeof window.courseManager.onBaselineComplete === 'function') {
        this._completed = false;
        window.courseManager.onBaselineComplete();
      }
    }

    _startTimer() {
      this._stopTimer();
      const tick = () => {
        const remain = Math.max(0, this.deadline - Date.now());
        const m = Math.floor(remain / 60000);
        const s = Math.floor((remain % 60000) / 1000);
        const t = this.el('actt-timer');
        if (t) {
          t.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
          t.classList.toggle('low', remain <= 120000);
        }
        if (remain <= 0) { this._stopTimer(); this.complete(); }
      };
      tick();
      this.timerId = setInterval(tick, 1000);
    }
    _stopTimer() { if (this.timerId) { clearInterval(this.timerId); this.timerId = null; } }

    async fetchNext() {
      const data = await api(`/api/act-test/next-problem?sessionId=${encodeURIComponent(this.sessionId)}`);
      if (!data || data.nextAction === 'complete' || !data.problem) { return this.complete(); }
      this.current = data.problem;
      this.selected = null;
      this.itemStart = Date.now();
      this.render();
    }

    render() {
      const p = this.current;
      this.el('actt-qnum').textContent = `Question ${p.progress.current} of ${p.progress.total}`;
      this.el('actt-qpct').textContent = `${p.progress.percentComplete || 0}%`;
      this.el('actt-fill').style.width = `${p.progress.percentComplete || 0}%`;
      const opts = (p.options || []).map(o =>
        `<button class="actt-opt" data-label="${o.label}"><span class="actt-optlab">${o.label}</span><span>${escapeHtml(o.text)}</span></button>`
      ).join('');
      // Figure is our own generated SVG (from the item bank), not user input.
      // Guard: only render a bare <svg> with no scripts.
      const fig = (p.svg && /^<svg[\s>]/.test(p.svg) && !/<script/i.test(p.svg))
        ? `<div class="actt-fig">${p.svg}</div>` : '';
      this.el('actt-body').innerHTML = `${fig}<div class="actt-q">${escapeHtml(p.content || '')}</div><div class="actt-opts">${opts}</div>`;
      this.el('actt-body').querySelectorAll('.actt-opt').forEach(btn => {
        btn.addEventListener('click', () => {
          this.selected = btn.getAttribute('data-label');
          this.el('actt-body').querySelectorAll('.actt-opt').forEach(b => b.classList.toggle('sel', b === btn));
          this.el('actt-next').disabled = false;
        });
      });
      this.el('actt-next').disabled = true;
      this.el('actt-next').textContent = (p.progress.current >= p.progress.total) ? 'Finish' : 'Next';
    }

    async submit(skipped) {
      if (!skipped && !this.selected) return;
      const btn = this.el('actt-next'); if (btn) btn.disabled = true;
      try {
        await api('/api/act-test/submit-answer', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: this.sessionId,
            problemId: this.current.problemId,
            answer: skipped ? null : this.selected,
            skipped: !!skipped,
            responseTime: Date.now() - this.itemStart,
          }),
        });
        await this.fetchNext();
      } catch (e) {
        this.el('actt-body').innerHTML = `<div class="actt-err">${e.message || 'Could not submit.'}</div>`;
      }
    }

    async complete() {
      this._stopTimer();
      this._hideCalc();   // done answering — the calc has no place on the results screen
      this.el('actt-progwrap').style.display = 'none';
      this.el('actt-foot').style.display = 'none';
      this.el('actt-body').innerHTML = '<div class="actt-center">Scoring…</div>';
      try {
        const data = await api('/api/act-test/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: this.sessionId }) });
        // The baseline is now scored and the course retargeted server-side. Mark
        // it so close() lets the course begin teaching — only on a real
        // completion, never on a cancelled/closed test.
        this._completed = true;
        // On a RE-TEST the payoff is the COMPARISON, so lead with growth instead
        // of a standalone score. (The first/baseline test has nothing to compare
        // against, so it falls through to the single-test results below.)
        try {
          const hist = await api('/api/act-test/history');
          if (hist && (hist.attempts || []).filter((a) => a.scaledScore != null).length >= 2) {
            this.renderProgress(hist);
            return;
          }
        } catch (e) { /* fall through to single-test results */ }
        const r = (data && data.report) || {};
        const cats = Object.entries(r.byCategory || {}).map(([k, v]) => {
          const pct = v.total ? Math.round((v.correct / v.total) * 100) : 0;
          const name = CATEGORY_LABELS[k] || k;
          return `<div class="actt-cat"><span class="actt-catname">${name}</span><span class="actt-catbar"><span class="actt-catfill" style="width:${pct}%"></span></span><span class="actt-catpct">${v.correct}/${v.total}</span></div>`;
        }).join('');
        this.el('actt-body').innerHTML = `
          <div class="actt-center" style="padding-bottom:12px">
            <div class="actt-score">${r.scaledScore != null ? r.scaledScore : '—'}</div>
            <div class="actt-scorelab">Estimated ACT Math score${r.scaledApproximate ? ' (approx.)' : ''}</div>
            <div class="actt-sub">${r.rawScore}/${r.totalItems} correct · ${r.accuracy}% · ${r.durationMinutes != null ? r.durationMinutes + ' min' : ''}</div>
            ${r.plannedSkills ? `<div style="font-size:13px;color:#8b6fd6;margin-top:2px">✓ Your tutor will now focus on your ${r.plannedSkills} weakest skill${r.plannedSkills > 1 ? 's' : ''}.</div>` : ''}
          </div>
          <div style="max-width:520px;margin:0 auto">${cats}</div>
          <div style="text-align:center;margin-top:22px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            <button class="actt-btn actt-next" id="actt-tutor">📤 Review with my tutor</button>
            <button class="actt-btn actt-skip" id="actt-progress">📈 My progress</button>
            <button class="actt-btn actt-skip" id="actt-retake">Take another</button>
            <button class="actt-btn actt-skip" id="actt-done">Done</button>
          </div>`;
        this.el('actt-done').addEventListener('click', () => this.close());
        this.el('actt-retake').addEventListener('click', () => { this.sessionId = null; this.open(); });
        this.el('actt-tutor').addEventListener('click', () => this.sendToTutor(r));
        this.el('actt-progress').addEventListener('click', () => this.showProgress());
      } catch (e) {
        this.el('actt-body').innerHTML = `<div class="actt-err">${e.message || 'Could not score the test.'}</div>`;
      }
    }

    // Compose a student-voiced results summary and hand it to the chat tutor so
    // the conversation has context and remediation can start on the weak areas.
    buildTutorMessage(r) {
      const head = `I just finished an ACT Math practice test — estimated score ${r.scaledScore != null ? r.scaledScore : '?'} (${r.rawScore}/${r.totalItems} correct).`;

      // Prefer EXACT skills (e.g. "Quadratic Equations") over broad categories.
      const skills = (r.weakSkills || []).slice(0, 5);
      if (skills.length) {
        const list = skills.map(s => `${s.name} (missed ${s.missed}/${s.total})`).join(', ');
        return `${head} The specific skills I missed questions on: ${list}. Can we work through those one at a time, starting with the weakest?`;
      }

      // Fallback: category level (if the backend didn't send per-skill data).
      const cats = Object.entries(r.byCategory || {})
        .map(([k, v]) => ({ name: CATEGORY_LABELS[k] || k, correct: v.correct, total: v.total, pct: v.total ? v.correct / v.total : 1 }))
        .sort((a, b) => a.pct - b.pct)
        .filter(c => c.correct < c.total).slice(0, 2);
      if (!cats.length) {
        return `${head} I got everything right — what should I work on to push my score even higher?`;
      }
      return `${head} My weakest areas were ${cats.map(c => `${c.name} (${c.correct}/${c.total})`).join(' and ')}. Can we start reviewing those, one topic at a time?`;
    }

    sendToTutor(r) {
      const msg = this.buildTutorMessage(r);
      this.close();
      const input = document.getElementById('user-input') || document.getElementById('chat-input');
      const sendBtn = document.getElementById('send-button') || document.querySelector('.send-button');
      if (!input || !sendBtn) { return; }
      // #user-input is a contenteditable div; set text + fire input so the chat
      // picks up the value, then trigger send (mirrors the app's own pattern).
      if (input.isContentEditable) input.textContent = msg; else input.value = msg;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
      setTimeout(() => sendBtn.click(), 60);
    }

    async showProgress() {
      this._mount();
      this._stopTimer();
      this.overlay.style.display = 'flex';
      this.el('actt-timer').style.display = 'none';   // no test running here
      this.el('actt-progwrap').style.display = 'none';
      this.el('actt-foot').style.display = 'none';
      this.el('actt-body').innerHTML = '<div class="actt-center">Loading your progress…</div>';
      try {
        const data = await api('/api/act-test/history');
        this.renderProgress(data || { count: 0, attempts: [] });
      } catch (e) {
        this.el('actt-body').innerHTML = `<div class="actt-err">${e.message || 'Could not load your progress.'}</div>`;
      }
    }

    renderProgress(data) {
      const attempts = (data.attempts || []).filter(a => a.scaledScore != null);
      // Turn a history attempt into a report the tutor-handoff can use to open
      // the missed-items review on the newest test's gaps — so the loop continues
      // straight from the growth screen.
      const reportFromAttempt = (a) => ({
        scaledScore: a.scaledScore, rawScore: a.rawScore, totalItems: a.totalItems,
        accuracy: a.totalItems ? Math.round((100 * a.rawScore) / a.totalItems) : 0,
        byCategory: a.byCategory || {},
        weakSkills: Object.entries(a.bySkill || {})
          .filter(([, v]) => v.correct < v.total)
          .map(([id, v]) => ({ skillId: id, name: v.name || id, missed: v.total - v.correct, total: v.total }))
          .sort((x, y) => (y.missed / y.total) - (x.missed / x.total)),
      });
      const backBtns = (reviewReport) => `<div style="text-align:center;margin-top:22px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          ${reviewReport ? `<button class="actt-btn actt-next" id="actt-review">📤 Review misses with my tutor</button>` : ''}
          <button class="actt-btn actt-skip" id="actt-newtest">Take a test</button>
          <button class="actt-btn actt-skip" id="actt-close2">Close</button>
        </div>`;
      const wire = (reviewReport) => {
        this.el('actt-close2').addEventListener('click', () => this.close());
        this.el('actt-newtest').addEventListener('click', () => { this.sessionId = null; this.open(); });
        if (reviewReport && this.el('actt-review')) this.el('actt-review').addEventListener('click', () => this.sendToTutor(reviewReport));
      };

      if (attempts.length === 0) {
        this.el('actt-body').innerHTML = `<div class="actt-center">You haven't completed a practice test yet.<br><small>Take one to start tracking your growth.</small></div>${backBtns()}`;
        return wire();
      }
      if (attempts.length === 1) {
        const a = attempts[0];
        const rev = reportFromAttempt(a);
        this.el('actt-body').innerHTML = `
          <div class="actt-center"><div class="actt-score">${a.scaledScore}</div><div class="actt-scorelab">Your first ACT Math score (approx.)</div>
          <div class="actt-sub">Take the test again after some practice to see your growth here.</div></div>${backBtns(rev.weakSkills.length ? rev : null)}`;
        return wire(rev.weakSkills.length ? rev : null);
      }

      const first = attempts[0], latest = attempts[attempts.length - 1];
      const delta = latest.scaledScore - first.scaledScore;
      const deltaChip = (d) => {
        const cls = d > 0 ? 'actt-up' : d < 0 ? 'actt-down' : 'actt-same';
        const sign = d > 0 ? `▲ +${d}` : d < 0 ? `▼ ${d}` : '= 0';
        return `<span class="actt-delta ${cls}">${sign}</span>`;
      };

      // Per-category first → latest (categories present in both).
      const cats = Object.keys(latest.byCategory).filter(c => first.byCategory[c]).map(c => {
        const f = first.byCategory[c], l = latest.byCategory[c];
        const fp = f.total ? f.correct / f.total : 0, lp = l.total ? l.correct / l.total : 0;
        return { c, name: CATEGORY_LABELS[c] || c, f, l, d: Math.round((lp - fp) * 100) };
      }).sort((a, b) => b.d - a.d);

      const catRows = cats.map(x => `
        <div class="actt-cmp">
          <span class="actt-cmpname">${x.name}</span>
          <span class="actt-cmpval">${x.f.correct}/${x.f.total} → ${x.l.correct}/${x.l.total}</span>
          ${deltaChip(x.d > 0 ? +Math.round(x.d) : x.d)}
        </div>`).join('');

      const trend = attempts.map(a => a.scaledScore).join('  →  ');

      this.el('actt-body').innerHTML = `
        <div class="actt-center" style="padding-bottom:6px">
          <div class="actt-score">${latest.scaledScore}</div>
          <div class="actt-scorelab">Latest ACT Math score (approx.)</div>
          <div class="actt-sub">${deltaChip(delta)} &nbsp;since your first test &nbsp;·&nbsp; ${attempts.length} attempts</div>
          <div class="actt-trend">${trend}</div>
        </div>
        <div style="max-width:520px;margin:14px auto 0">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#999;margin-bottom:6px;text-align:center">By category · first → latest</div>
          ${catRows}
        </div>${backBtns(reportFromAttempt(latest).weakSkills.length ? reportFromAttempt(latest) : null)}`;
      wire(reportFromAttempt(latest).weakSkills.length ? reportFromAttempt(latest) : null);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.actTest = new ActTest();
  window.openActTest = function () { window.actTest.open(); };
  window.openActProgress = function () { window.actTest.showProgress(); };

  // Reachable entry point: a boot-camp CTA can link to /chat.html?acttest=1,
  // and it's an easy way to try the flow. (A visible button lives with the
  // boot-camp card once that UI exists.)
  try {
    if (new URLSearchParams(location.search).get('acttest') === '1') {
      window.addEventListener('load', () => window.openActTest());
    }
  } catch (e) { /* noop */ }
})();

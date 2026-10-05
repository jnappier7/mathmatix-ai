/* ============================================================
   mmCalculator.js — the app's ONE calculator.
   ============================================================
   Lifted from the scientific calculator that was welded inside the ACT
   practice-test runner (act-test.js). It replaces two separate ~1,700-line
   TI-84 emulations — the chat's #floating-calculator and the standalone
   /calculator.html — which between them shipped 2nd/MODE layers, STAT
   regression, table mode and seven memory registers behind a keypad no
   student could read. Three implementations, three eval engines, three sets
   of bugs, and cosmetic skins had to be written against each one separately.

   The engine is a small recursive-descent parser over a fixed set of tokens
   (numbers, + - × ÷ ^, parentheses, pi, E and six math functions), with
   implicit multiplication and trig honouring DEG/RAD. No code evaluation.

   Usage:
     const calc = MMCalculator.create({ variant: 'float', onSendToChat: fn });
     calc.mount(document.body);
     calc.show();

   Hosts position it — see the variant blocks in css/mm-calculator.css.
   ============================================================ */

(function () {
  'use strict';

  // [label, token, css class]. Tokens carry display glyphs; the evaluator
  // normalizes them. Function keys auto-open a paren.
  const KEYS = [
    ['AC', 'ac', 'clr'], ['⌫', 'del', 'clr'], ['(', '(', 'fn'], [')', ')', 'fn'], ['÷', '÷', 'op'],
    ['sin', 'sin(', 'fn'], ['cos', 'cos(', 'fn'], ['tan', 'tan(', 'fn'], ['xʸ', '^', 'op'], ['×', '×', 'op'],
    ['ln', 'ln(', 'fn'], ['log', 'log(', 'fn'], ['√', 'sqrt(', 'fn'], ['π', 'π', 'fn'], ['−', '−', 'op'],
    ['7', '7', ''], ['8', '8', ''], ['9', '9', ''], ['e', 'E', 'fn'], ['+', '+', 'op'],
    ['4', '4', ''], ['5', '5', ''], ['6', '6', ''], ['x²', '^2', 'op'], ['(-)', '-', 'fn'],
    ['1', '1', ''], ['2', '2', ''], ['3', '3', ''], ['%', '/100', 'fn'], ['=', 'eq', 'eq'],
    ['0', '0', 'zero'], ['.', '.', ''], ['ANS', 'ans', 'fn'],
  ];

  // Typed characters -> tokens. This is a WHITELIST, and it is load-bearing:
  // the evaluator builds a `new Function` from the expression string, which is
  // safe only while every character in it came from a control we defined. The
  // ACT version was tap-only so the question never arose; keyboard input is the
  // feature that would have made it arbitrary code execution. Anything not in
  // this map is dropped before it can reach the expression.
  const KEY_MAP = {
    '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
    '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
    '.': '.', '(': '(', ')': ')',
    '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^',
    'x': '×', 'X': '×',
  };

  // A carried-over number as a single operand: negatives get parentheses.
  function asOperand(n) {
    const str = String(n);
    return str.charAt(0) === '-' ? '(' + str + ')' : str;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function MMCalc(opts) {
    this.opts = opts || {};
    this.expr = '';
    this.ans = '';
    this.deg = true;
    this.el = null;
    this.backdrop = null;
    this._onKeydown = null;
    this._build();
  }

  MMCalc.prototype._build = function () {
    const o = this.opts;
    const variant = o.variant === 'float' ? ' mmc-float'
      : o.variant === 'dock' ? ' mmc-dock' : '';
    const el = document.createElement('div');
    el.className = 'mmc' + variant;
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Calculator');
    el.innerHTML =
      '<div class="mmc-head">' +
        '<span class="mmc-title">🧮 ' + esc(o.title || 'Calculator') + '</span>' +
        '<span class="mmc-tools">' +
          '<button type="button" class="mmc-deg" title="Switch between degrees and radians">DEG</button>' +
          (o.closable === false ? '' :
            '<button type="button" class="mmc-x" aria-label="Close calculator">×</button>') +
        '</span>' +
      '</div>' +
      '<div class="mmc-disp">' +
        '<div class="mmc-expr"></div>' +
        '<div class="mmc-res">0</div>' +
      '</div>' +
      '<div class="mmc-keys">' +
        KEYS.map(function (k) {
          return '<button type="button" class="mmc-k ' + k[2] + '" data-tok="' +
            esc(k[1]) + '">' + esc(k[0]) + '</button>';
        }).join('') +
      '</div>' +
      (typeof o.onSendToChat === 'function'
        ? '<button type="button" class="mmc-send">Send result to chat</button>' : '');

    this.el = el;
    this.$expr = el.querySelector('.mmc-expr');
    this.$res = el.querySelector('.mmc-res');
    this.$deg = el.querySelector('.mmc-deg');

    const self = this;
    el.querySelectorAll('.mmc-k').forEach(function (btn) {
      btn.addEventListener('click', function () { self.press(btn.getAttribute('data-tok')); });
    });
    this.$deg.addEventListener('click', function () { self.toggleAngleMode(); });
    const close = el.querySelector('.mmc-x');
    if (close) close.addEventListener('click', function () { self.hide(); });
    const send = el.querySelector('.mmc-send');
    if (send) {
      send.addEventListener('click', function () {
        const out = self.$res.textContent;
        if (!out || out === 'Error') return;
        o.onSendToChat(out);
        send.textContent = 'Sent!';
        setTimeout(function () { send.textContent = 'Send result to chat'; }, 1200);
      });
    }
    this.render();
  };

  MMCalc.prototype.mount = function (parent) {
    (parent || document.body).appendChild(this.el);
    return this;
  };

  MMCalc.prototype.isOpen = function () { return this.el.classList.contains('is-open'); };

  MMCalc.prototype.show = function () {
    if (this.isOpen()) return;
    this.el.classList.add('is-open');
    if (this.opts.backdrop) {
      this.backdrop = document.createElement('div');
      this.backdrop.className = 'mmc-backdrop';
      const self = this;
      this.backdrop.addEventListener('click', function () { self.hide(); });
      this.el.parentNode.insertBefore(this.backdrop, this.el);
    }
    if (this.opts.keyboard !== false) this._bindKeyboard();
  };

  MMCalc.prototype.hide = function () {
    if (!this.isOpen()) return;
    this.el.classList.remove('is-open');
    if (this.backdrop) { this.backdrop.remove(); this.backdrop = null; }
    this._unbindKeyboard();
    if (typeof this.opts.onHide === 'function') this.opts.onHide();
  };

  MMCalc.prototype.toggle = function () { this.isOpen() ? this.hide() : this.show(); };

  MMCalc.prototype.toggleAngleMode = function () {
    this.deg = !this.deg;
    this.$deg.textContent = this.deg ? 'DEG' : 'RAD';
    this.$deg.classList.toggle('is-rad', !this.deg);
    this.render(); // the trig preview reflects the new mode immediately
  };

  MMCalc.prototype.press = function (tok) {
    if (tok === 'ac') { this.expr = ''; return this.render(); }
    if (tok === 'del') { this.expr = this.expr.slice(0, -1); return this.render(); }
    if (tok === 'ans') { this.expr += asOperand(this.ans || ''); return this.render(); }
    if (tok === 'eq') return this.equals();
    this.expr += tok;
    this.render();
  };

  MMCalc.prototype.equals = function () {
    try {
      const out = String(this.evaluate(this.expr));
      this.ans = out;
      this.$expr.textContent = this.expr;
      this.$res.textContent = out;
      // Chain from the result. A negative result is carried as one value,
      // "(-9)", so pressing x² next gives 81 the way a real calculator's ANS
      // does, not -(9²) by precedence.
      this.expr = asOperand(out);
    } catch (e) {
      this.$res.textContent = 'Error';
    }
  };

  MMCalc.prototype.render = function () {
    this.$expr.textContent = this.expr;
    if (!this.expr) { this.$res.textContent = '0'; return; }
    // Mid-expression -> blank preview, not "Error": a half-typed "3+" is not a
    // mistake, and flashing Error at every keystroke reads as one.
    try { this.$res.textContent = String(this.evaluate(this.expr)); }
    catch (e) { this.$res.textContent = ''; }
  };

  /**
   * Evaluate an expression with a small recursive-descent parser.
   *
   * This used to normalize the string into JavaScript and hand it to
   * `new Function`, which had two student-visible bugs on ACT items:
   *   - `−3²` errored (JS refuses a unary minus directly before `**`), and so
   *     did `2×−3²`; both are -9 and -18 on any real calculator.
   *   - `12tan(35)` errored: implicit multiplication was only inserted before
   *     `(`, never before a function name.
   * A parser fixes both and removes code evaluation from the calculator
   * altogether: only the tokens below exist, so `constructor`, `alert(1)` and
   * friends are simply unknown tokens.
   *
   * Grammar (math precedence — exponent binds tighter than unary minus, and
   * is right-associative; juxtaposition is multiplication):
   *   expr    := term (('+' | '-') term)*
   *   term    := unary (('*' | '/') unary | <implicit> unary)*
   *   unary   := '-' unary | '+' unary | power
   *   power   := primary ('^' unary)?
   *   primary := number | pi | E | fn '(' expr ')' | '(' expr ')'
   */
  MMCalc.prototype.evaluate = function (raw) {
    const D = this.deg ? Math.PI / 180 : 1;
    const FNS = {
      sqrt: function (x) { return Math.sqrt(x); },
      sin: function (x) { return Math.sin(x * D); },
      cos: function (x) { return Math.cos(x * D); },
      tan: function (x) { return Math.tan(x * D); },
      log: function (x) { return Math.log10(x); },
      ln: function (x) { return Math.log(x); },
    };
    const CONSTS = { pi: Math.PI, E: Math.E };
    // Longest names first so `sqrt` is not read as something shorter.
    const NAMES = ['sqrt', 'sin', 'cos', 'tan', 'log', 'ln', 'pi', 'E'];

    const src = String(raw)
      .replace(/π/g, 'pi').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
      .replace(/\*\*/g, '^');

    // ---- tokenize ----
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i += 1; continue; }
      const num = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/.exec(src.slice(i));
      if (num) { toks.push({ t: 'num', v: parseFloat(num[0]) }); i += num[0].length; continue; }
      if ('+-*/^()'.indexOf(c) !== -1) { toks.push({ t: c }); i += 1; continue; }
      const name = NAMES.find(function (n) { return src.startsWith(n, i); });
      if (name) { toks.push({ t: 'id', v: name }); i += name.length; continue; }
      throw new Error('illegal token');
    }

    // ---- parse + evaluate ----
    let k = 0;
    const peek = function () { return toks[k]; };
    const take = function (t) {
      if (!toks[k] || toks[k].t !== t) throw new Error('expected ' + t);
      k += 1;
    };
    const startsPrimary = function (tok) {
      return !!tok && (tok.t === 'num' || tok.t === 'id' || tok.t === '(');
    };

    function expr() {
      let v = term();
      while (peek() && (peek().t === '+' || peek().t === '-')) {
        const op = peek().t; k += 1;
        const r = term();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    function term() {
      let v = unary();
      for (;;) {
        const tok = peek();
        if (tok && (tok.t === '*' || tok.t === '/')) {
          k += 1;
          const r = unary();
          v = tok.t === '*' ? v * r : v / r;
        } else if (startsPrimary(tok)) {
          v *= unary();                       // 2π, 2(3), (1+1)3, 12tan(35)
        } else {
          return v;
        }
      }
    }
    function unary() {
      const tok = peek();
      if (tok && tok.t === '-') { k += 1; return -unary(); }
      if (tok && tok.t === '+') { k += 1; return unary(); }
      return power();
    }
    function power() {
      const base = primary();
      if (peek() && peek().t === '^') { k += 1; return Math.pow(base, unary()); }
      return base;
    }
    function primary() {
      const tok = peek();
      if (!tok) throw new Error('unexpected end');
      if (tok.t === 'num') { k += 1; return tok.v; }
      if (tok.t === '(') { k += 1; const v = expr(); take(')'); return v; }
      if (tok.t === 'id') {
        k += 1;
        if (Object.prototype.hasOwnProperty.call(CONSTS, tok.v)) return CONSTS[tok.v];
        take('(');
        const arg = expr();
        take(')');
        return FNS[tok.v](arg);
      }
      throw new Error('unexpected ' + tok.t);
    }

    const v = expr();
    if (k !== toks.length) throw new Error('trailing input');
    if (typeof v !== 'number' || !isFinite(v)) throw new Error('bad');
    return parseFloat(v.toPrecision(12)); // trim float noise (0.1+0.2 -> 0.3)
  };

  // ---- Keyboard ----------------------------------------------------------
  // Only while open, and never while the student is typing somewhere else —
  // stealing digits from the chat composer would be worse than having no
  // keyboard support at all.
  MMCalc.prototype._bindKeyboard = function () {
    if (this._onKeydown) return;
    const self = this;
    this._onKeydown = function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;

      if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); return self.equals(); }
      if (e.key === 'Backspace') { e.preventDefault(); return self.press('del'); }
      if (e.key === 'Escape') { e.preventDefault(); return self.hide(); }
      if (e.key === 'Delete') { e.preventDefault(); return self.press('ac'); }
      const tok = KEY_MAP[e.key];
      if (tok) { e.preventDefault(); self.press(tok); }
    };
    document.addEventListener('keydown', this._onKeydown);
  };

  MMCalc.prototype._unbindKeyboard = function () {
    if (!this._onKeydown) return;
    document.removeEventListener('keydown', this._onKeydown);
    this._onKeydown = null;
  };

  MMCalc.prototype.destroy = function () {
    this._unbindKeyboard();
    if (this.backdrop) this.backdrop.remove();
    this.el.remove();
  };

  window.MMCalculator = {
    create: function (opts) { return new MMCalc(opts); },
    // Exposed for tests: the pure engine, independent of any DOM.
    _KEYS: KEYS,
    _KEY_MAP: KEY_MAP,
  };
})();

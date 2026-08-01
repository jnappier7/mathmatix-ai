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

   The engine kept is deliberately the simple one: normalize glyphs, insert
   implicit multiplication, evaluate against a FIXED scope of math helpers
   with trig honouring DEG/RAD.

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
    if (tok === 'ans') { this.expr += (this.ans || ''); return this.render(); }
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
      this.expr = out; // chain from the result
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
   * Normalize glyphs, insert implicit multiplication, evaluate against a FIXED
   * scope of math helpers (trig honours DEG/RAD). No page globals reachable.
   * Input is button- or whitelist-derived only — see KEY_MAP.
   */
  MMCalc.prototype.evaluate = function (raw) {
    let js = String(raw)
      .replace(/π/g, '(pi)').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
      .replace(/\^/g, '**');
    js = js.replace(/(\d|\)|pi|E)\s*\(/g, '$1*(')
      .replace(/\)\s*(\d|pi|E)/g, ')*$1')
      .replace(/(\d)\s*(pi|E)\b/g, '$1*$2');

    // Belt and braces behind KEY_MAP: strip the identifiers we define, and
    // nothing but digits and operators may remain. Whatever the path in, this
    // is the last thing between the string and the Function constructor —
    // `alert(1)`, `this` and `constructor` all die here.
    if (/[^0-9+\-*/().,%\s]/.test(js.replace(/\b(?:pi|E|sin|cos|tan|ln|log|sqrt)\b/g, ''))) {
      throw new Error('illegal token');
    }

    const D = this.deg ? Math.PI / 180 : 1;
    const scope = {
      pi: Math.PI, E: Math.E,
      sin: function (x) { return Math.sin(x * D); },
      cos: function (x) { return Math.cos(x * D); },
      tan: function (x) { return Math.tan(x * D); },
      ln: function (x) { return Math.log(x); },
      log: function (x) { return Math.log10(x); },
      sqrt: function (x) { return Math.sqrt(x); },
    };
    const fn = new Function(...Object.keys(scope), 'return (' + js + ');');
    const v = fn(...Object.values(scope));
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

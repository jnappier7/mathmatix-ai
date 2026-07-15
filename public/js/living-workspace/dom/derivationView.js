/* ============================================================
   derivationView.js — the focused-derivation board (build brick #1).

   Renders a turn's board_commands (already run through the P5 adapter,
   `adaptBoardCommands`) as a single FOCUSED DERIVATION rather than free-
   floating cards on a canvas:

     • the PROBLEM (pose) is pinned at the top and stays in view,
     • each step flows beneath it as a connected column — resolve/scaffold/
       example lines, with the operation (apply) shown as a small label,
     • the solution (verify) lands as the closing line,
     • graph / image / geometry render as blocks inline in the same flow.

   This replaces the card-flow placement (fixed world coords that piled up
   / drifted off-screen). A document-style column auto-fits and always keeps
   the newest step in view, so there is nothing to pan to and nothing to lose.

   It consumes the SAME adapter element shape the canvas shell did
   ({ type, semantic:{ latex, role, op }, ... }), so the pipeline and the
   anti-cheat gauntlet upstream are untouched — this is a rendering change
   only. Interactive manipulatives (tiles / number lines) are never produced
   by board_commands, so this surface needs no student-move loop.

   `classify()` is pure and exported for headless tests. Browser-only view.
   ============================================================ */
(function (root) {
  'use strict';
  var LWS = (root.LWS = root.LWS || {});

  // element -> derivation item kind. Pure. The adapter tags each equation
  // with semantic.role (problem/step/operation/solution/scaffold/example);
  // everything non-equation (graph/image/geometry) renders as an inline block.
  function classify(element) {
    if (!element || typeof element !== 'object') return null;
    if (element.type === 'equation') {
      var role = (element.semantic && element.semantic.role) || 'step';
      if (role === 'problem' || role === 'operation' || role === 'solution'
          || role === 'scaffold' || role === 'example') return role;
      return 'step'; // resolve / anything else
    }
    return 'block';
  }

  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase(); }

  // KaTeX.render expects RAW math and errors on math-mode delimiters ("Can't
  // use function '\(' in math mode"), rendering the source in red. The tutor
  // sometimes wraps board tex in \(...\) / \[...\] / $...$, so strip those
  // wrappers before typesetting. Interior \left( … \right) are untouched
  // (only a backslash IMMEDIATELY before ( ) [ ] is a delimiter). Exported
  // for tests.
  function cleanLatex(s) {
    var t = String(s == null ? '' : s).trim();
    t = t.replace(/\\[()[\]]/g, ' ');        // \( \) \[ \] delimiters -> space
    t = t.replace(/^\$\$?/, '').replace(/\$\$?$/, ''); // $ … $ or $$ … $$
    return t.trim();
  }

  // Prose — a \text{…} wrapper or a natural-language sentence (word problems,
  // geometry statements) — must WRAP. KaTeX renders it as a single non-wrapping
  // line that runs off the right edge of the board (clipped by overflow-x). So
  // detect prose and render it as plain, wrapping text; keep KaTeX for real math.
  function looksLikeProse(s) {
    var t = String(s == null ? '' : s).trim();
    if (!t) return false;
    if (/^\\text\s*\{[\s\S]*\}$/.test(t)) return true;             // whole thing is \text{…}
    // Strip LaTeX commands (\frac, \quad, \Rightarrow, \text …) and braces first
    // so command names aren't mistaken for words — then count the genuine words
    // left. Math is single-letter variables, digits and operators (none 3+ letter
    // runs), so 3+ real words means prose, not an equation.
    var stripped = t.replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}]/g, ' ');
    return (stripped.match(/[A-Za-z]{3,}/g) || []).length >= 3;
  }

  // Unwrap \text{…} to the readable sentence (drop KaTeX spacing escapes).
  function unwrapText(s) {
    var m = String(s == null ? '' : s).trim().match(/^\\text\s*\{([\s\S]*)\}$/);
    var out = m ? m[1] : String(s == null ? '' : s);
    return out.replace(/\\[,;:!> ]/g, ' ').replace(/\\\\/g, ' ').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  }

  function typeset(target, latex) {
    var katex = root.katex;
    var tex = cleanLatex(latex);
    if (looksLikeProse(tex)) {                                     // wrap prose as text
      target.textContent = unwrapText(tex);
      target.className += ' lws-dv-prose';
      return;
    }
    if (katex && typeof katex.render === 'function') {
      try { katex.render(tex, target, { throwOnError: false, displayMode: false }); return; }
      catch (_) { /* fall through to text */ }
    }
    target.textContent = tex;
  }

  function DerivationView(container, opts) {
    opts = opts || {};
    this.doc = container.ownerDocument || document;
    this.renderers = opts.renderers || {};
    this._blocks = [];        // live block renderers (for destroy on clear)
    this._problemTex = null;

    var d = this.doc;
    var rootEl = d.createElement('div');
    rootEl.className = 'lws-root lws-dv-root';        // inherits --lws-* tokens + theme
    var scroll = d.createElement('div'); scroll.className = 'lws-dv';
    var empty = d.createElement('div'); empty.className = 'lws-dv-empty'; empty.setAttribute('aria-hidden', 'true');
    empty.innerHTML =
      '<div class="lws-dv-empty-ic">✍️</div>' +
      '<div class="lws-dv-empty-t">Ready to work it out?</div>' +
      '<div class="lws-dv-empty-s">Your problem and each step show up here as you and your tutor work through it.</div>';
    var inner = d.createElement('div'); inner.className = 'lws-dv-inner';
    var problem = d.createElement('div'); problem.className = 'lws-dv-problem'; problem.style.display = 'none';
    var lines = d.createElement('div'); lines.className = 'lws-dv-lines';
    inner.appendChild(problem); inner.appendChild(lines);
    scroll.appendChild(empty); scroll.appendChild(inner);
    rootEl.appendChild(scroll);
    container.appendChild(rootEl);

    this.el = { root: rootEl, scroll: scroll, empty: empty, inner: inner, problem: problem, lines: lines };
    this._refreshEmpty();
  }

  DerivationView.prototype._refreshEmpty = function () {
    var has = this._problemTex != null || this.el.lines.childNodes.length > 0;
    this.el.empty.style.display = has ? 'none' : '';
    this.el.inner.style.display = has ? '' : 'none';
  };

  DerivationView.prototype._destroyBlocks = function () {
    this._blocks.forEach(function (b) { try { b && b.destroy && b.destroy(); } catch (_) {} });
    this._blocks = [];
  };

  DerivationView.prototype.clear = function () {
    this._destroyBlocks();
    this.el.lines.textContent = '';
    this.el.problem.textContent = '';
    this.el.problem.style.display = 'none';
    this._problemTex = null;
    this._refreshEmpty();
  };

  DerivationView.prototype._setProblem = function (element) {
    var latex = (element.semantic && element.semantic.latex) || '';
    // A genuinely different problem starts a fresh derivation (one in focus).
    if (this._problemTex != null && norm(latex) !== norm(this._problemTex)) {
      this._destroyBlocks();
      this.el.lines.textContent = '';
    }
    this._problemTex = latex;
    this.el.problem.textContent = '';
    var lab = this.doc.createElement('div'); lab.className = 'lws-dv-plabel'; lab.textContent = 'Problem';
    var body = this.doc.createElement('div'); body.className = 'lws-dv-ptex';
    typeset(body, latex);
    this.el.problem.appendChild(lab);
    this.el.problem.appendChild(body);
    this.el.problem.style.display = '';
  };

  DerivationView.prototype._addLine = function (element, kind) {
    var d = this.doc;
    var row = d.createElement('div');
    row.className = 'lws-dv-line lws-dv-' + kind;
    if (kind === 'operation') {
      var op = (element.semantic && (element.semantic.op || element.semantic.plain)) || '';
      if (!op) { var probe = d.createElement('span'); typeset(probe, element.semantic && element.semantic.latex); op = probe.textContent || ''; }
      var tag = d.createElement('span'); tag.className = 'lws-dv-op'; tag.textContent = op;
      row.appendChild(tag);
    } else {
      var tex = d.createElement('div'); tex.className = 'lws-dv-tex';
      typeset(tex, element.semantic && element.semantic.latex);
      row.appendChild(tex);
    }
    this.el.lines.appendChild(row);
  };

  DerivationView.prototype._addBlock = function (element) {
    var d = this.doc;
    var wrap = d.createElement('div'); wrap.className = 'lws-dv-line lws-dv-block';
    var factory = this.renderers[element.type];
    if (typeof factory === 'function') {
      try {
        var r = factory(element, { host: wrap, viewport: null });
        if (r && r.node) { wrap.appendChild(r.node); this._blocks.push(r); }
        else { wrap.textContent = '[' + element.type + ']'; }
      } catch (_) { wrap.textContent = '[' + element.type + ']'; }
    } else { wrap.textContent = '[' + element.type + ']'; }
    this.el.lines.appendChild(wrap);
  };

  // Render one turn's adapted elements. `clear` wipes the board first.
  DerivationView.prototype.apply = function (elements, clear) {
    if (clear) this.clear();
    if (!Array.isArray(elements)) { this._refreshEmpty(); return; }
    var self = this;
    elements.forEach(function (el) {
      var kind = classify(el);
      if (!kind) return;
      if (kind === 'problem') self._setProblem(el);
      else if (kind === 'block') self._addBlock(el);
      else self._addLine(el, kind);
    });
    this._refreshEmpty();
    this._scrollToEnd();
  };

  DerivationView.prototype._scrollToEnd = function () {
    var s = this.el.scroll;
    try { s.scrollTop = s.scrollHeight; } catch (_) {}
  };

  DerivationView.classify = classify;
  DerivationView.cleanLatex = cleanLatex;
  DerivationView.looksLikeProse = looksLikeProse;
  DerivationView.unwrapText = unwrapText;
  LWS.DerivationView = DerivationView;
  if (typeof module !== 'undefined' && module.exports) module.exports = { DerivationView: DerivationView, classify: classify, cleanLatex: cleanLatex, looksLikeProse: looksLikeProse, unwrapText: unwrapText };
})(typeof self !== 'undefined' ? self : this);

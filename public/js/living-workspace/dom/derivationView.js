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

  // Clean a prose (non-math) run: drop KaTeX spacing escapes and stray braces.
  function proseRunClean(s) {
    return String(s).replace(/\\[,;:!> ]/g, ' ').replace(/\\\\/g, ' ').replace(/[{}]/g, '').replace(/\s+/g, ' ');
  }

  // Inline math tokens that can sit INSIDE problem prose ("order \frac12, 0.3
  // …"). \frac / \sqrt come before the generic \command so the digits/args are
  // captured, not left behind as raw text.
  var INLINE_MATH = /\$[^$]+\$|\\frac\s*(?:\{[^{}]*\}\s*\{[^{}]*\}|\d\s*\d)|\\sqrt\s*(?:\{[^{}]*\}|\d+)|\\[a-zA-Z]+(?:\{[^{}]*\})?|[A-Za-z0-9]+\^\{?[A-Za-z0-9]+\}?/g;

  // Render mixed prose + inline math: words become wrapping text nodes, math
  // fragments become KaTeX spans. Falls back to plain text if no math is found.
  function renderProseWithMath(target, tex, katex) {
    var doc = target.ownerDocument;
    target.textContent = '';
    var last = 0; var m; var found = false;
    INLINE_MATH.lastIndex = 0;
    while ((m = INLINE_MATH.exec(tex)) !== null) {
      if (m.index > last) {
        var run = proseRunClean(tex.slice(last, m.index));
        if (run) target.appendChild(doc.createTextNode(run));
      }
      var span = doc.createElement('span');
      var frag = m[0].replace(/^\$|\$$/g, '');
      if (katex && typeof katex.render === 'function') {
        try { katex.render(frag, span, { throwOnError: false, displayMode: false }); }
        catch (_) { span.textContent = m[0]; }
      } else { span.textContent = m[0]; }
      target.appendChild(span);
      found = true;
      last = m.index + m[0].length;
    }
    if (last < tex.length) {
      var tail = proseRunClean(tex.slice(last));
      if (tail) target.appendChild(doc.createTextNode(tail));
    }
    if (!found) target.textContent = unwrapText(tex);   // pure prose, no math
  }

  function typeset(target, latex) {
    var katex = root.katex;
    var tex = cleanLatex(latex);
    if (looksLikeProse(tex)) {
      target.className += ' lws-dv-prose';
      var whole = tex.trim().match(/^\\text\s*\{[\s\S]*\}$/);   // a pure \text{…} sentence
      if (whole) target.textContent = unwrapText(tex);
      else renderProseWithMath(target, tex, katex);            // prose w/ inline math (\frac…)
      return;
    }
    if (katex && typeof katex.render === 'function') {
      try { katex.render(tex, target, { throwOnError: false, displayMode: false }); return; }
      catch (_) { /* fall through to text */ }
    }
    target.textContent = tex;
  }

  function toArray(nodeList) {
    var out = [];
    for (var i = 0; i < nodeList.length; i++) out.push(nodeList[i]);
    return out;
  }

  // Which lines arrived this turn — by node identity, NOT by index count.
  // _setProblem wipes the stack when a new problem is posed, so "everything
  // past the old length" would mark nothing on a reset turn (the new, shorter
  // stack is entirely new). Identity handles wipe, append, and no-op alike.
  function freshNodes(before, after) {
    return after.filter(function (n) { return before.indexOf(n) === -1; });
  }

  // How many finished problems stay reachable from the rail. Older ones fall
  // off the left: the rail is a session's worth of recent work, not an archive.
  var MAX_ARCHIVE = 12;

  // Did this derivation reach an answer? Drives the ✓ on the thumbnail — a
  // `verify` card is the only thing that closes a problem out. Pure; exported
  // for tests.
  function hasSolution(elements) {
    return (Array.isArray(elements) ? elements : []).some(function (e) {
      return classify(e) === 'solution';
    });
  }

  // Student-facing summary of a finished card (spec §4.5): completion +
  // assistance in the student's own terms. Levels 1–4 of the §12 ladder are
  // independent; 5+ means the tutor's thinking was in the loop. `assistance`
  // is null for work recorded before the ladder existed (or live-session
  // archives, where the level is server-side only) — say less, not wrong.
  // Pure; exported for tests.
  function assistanceSummary(solved, assistance) {
    if (!solved) return 'Not finished yet';
    if (assistance == null) return 'Solved';
    return assistance <= 4 ? 'Solved it myself' : 'Solved with my tutor';
  }

  function DerivationView(container, opts) {
    opts = opts || {};
    this.doc = container.ownerDocument || document;
    this.renderers = opts.renderers || {};
    this._blocks = [];        // live block renderers (for destroy on clear)
    this._problemTex = null;
    // The adapted elements making up the CURRENT derivation, kept so a finished
    // problem can be archived as data and re-rendered on demand. Snapshotting
    // data (not detaching live DOM) is what makes reopening safe: block
    // renderers like the JSXGraph board do not survive being pulled out of the
    // document and put back, so archived blocks are destroyed and rebuilt.
    this._elements = [];
    this._archive = [];       // [{ problemTex, elements, solved }] — oldest first
    this._seq = 0;
    this._overlayBlocks = [];

    var d = this.doc;
    var rootEl = d.createElement('div');
    rootEl.className = 'lws-root lws-dv-root';        // inherits --lws-* tokens + theme
    var rail = d.createElement('div');
    rail.className = 'lws-dv-rail';
    rail.setAttribute('role', 'list');
    rail.setAttribute('aria-label', 'Finished problems');
    rail.hidden = true;
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
    rootEl.appendChild(rail);
    rootEl.appendChild(scroll);
    container.appendChild(rootEl);

    // Caption strip: in voice mode the tutor's karaoke caption renders HERE,
    // under the derivation, instead of under the tutor cam. The words being
    // spoken are about a step on this board — keeping them in one place stops
    // the student's eyes bouncing between two surfaces. voice-subtitles.js
    // finds it by the data attribute (DOM contract, no module coupling).
    var caption = d.createElement('div');
    caption.className = 'lws-dv-caption';
    caption.setAttribute('data-mm-voice-caption-target', '');
    caption.hidden = true;
    rootEl.appendChild(caption);

    this.el = { root: rootEl, scroll: scroll, empty: empty, inner: inner, problem: problem, lines: lines, caption: caption, rail: rail };
    this._mountTextScale(rootEl);
    this._refreshEmpty();
  }

  // Voice turns ship the board CUMULATIVELY — each turn resends every step and
  // typically only the last is new. So "the step being spoken about" is simply
  // the step that arrived this turn; no prompt change or model cooperation
  // needed. Lines added by one apply() are tagged fresh, and the root carries
  // `is-speaking` while the tutor talks, which is what lights them up.
  DerivationView.prototype._clearFresh = function () {
    var prev = this.el.lines.querySelectorAll('.lws-dv-fresh');
    for (var i = 0; i < prev.length; i++) prev[i].classList.remove('lws-dv-fresh');
  };

  DerivationView.prototype.setSpeaking = function (on) {
    this.el.root.classList.toggle('is-speaking', !!on);
    if (!on) this._clearFresh();
  };

  // Accessibility: a small A−/A+ control that scales ALL board text via the
  // --lws-dv-scale token (see living-workspace.css). Persisted per browser so a
  // student who needs larger text sets it once. Keyboard-operable buttons with
  // aria-labels; the middle readout is a reset button and an aria-live region.
  DerivationView.prototype._mountTextScale = function (rootEl) {
    var d = this.doc;
    var STORE = 'lws.dv.textScale', MIN = 0.85, MAX = 1.8, STEP = 0.15;
    var scale = 1;
    try { var v = parseFloat(root.localStorage && root.localStorage.getItem(STORE)); if (v >= MIN && v <= MAX) scale = v; } catch (_) { /* storage blocked */ }

    var bar = d.createElement('div');
    bar.className = 'lws-dv-az';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Board text size');

    var dn = d.createElement('button'); dn.type = 'button'; dn.className = 'az-dn'; dn.textContent = 'A'; dn.setAttribute('aria-label', 'Decrease board text size');
    var mid = d.createElement('button'); mid.type = 'button'; mid.className = 'az-lab'; mid.setAttribute('aria-label', 'Reset board text size'); mid.setAttribute('aria-live', 'polite');
    var up = d.createElement('button'); up.type = 'button'; up.className = 'az-up'; up.textContent = 'A'; up.setAttribute('aria-label', 'Increase board text size');
    bar.appendChild(dn); bar.appendChild(mid); bar.appendChild(up);
    rootEl.appendChild(bar);

    function apply() {
      scale = Math.max(MIN, Math.min(MAX, Math.round(scale * 100) / 100));
      rootEl.style.setProperty('--lws-dv-scale', String(scale));
      mid.textContent = Math.round(scale * 100) + '%';
      dn.disabled = scale <= MIN + 1e-6;
      up.disabled = scale >= MAX - 1e-6;
      try { root.localStorage && root.localStorage.setItem(STORE, String(scale)); } catch (_) { /* ignore */ }
    }
    dn.addEventListener('click', function () { scale -= STEP; apply(); });
    up.addEventListener('click', function () { scale += STEP; apply(); });
    mid.addEventListener('click', function () { scale = 1; apply(); });
    apply();
  };

  DerivationView.prototype._refreshEmpty = function () {
    var has = this._problemTex != null || this.el.lines.childNodes.length > 0;
    this.el.empty.style.display = has ? 'none' : '';
    this.el.inner.style.display = has ? '' : 'none';
  };

  DerivationView.prototype._destroyBlocks = function () {
    this._blocks.forEach(function (b) { try { b && b.destroy && b.destroy(); } catch (_) {} });
    this._blocks = [];
  };

  // Wipe the working surface WITHOUT touching the rail. Both ways a problem
  // ends (an explicit `clear` card, or a different `pose` arriving) funnel
  // through here after the outgoing work has been archived.
  DerivationView.prototype._wipeCurrent = function () {
    this._destroyBlocks();
    this.el.lines.textContent = '';
    this.el.problem.textContent = '';
    this.el.problem.style.display = 'none';
    this._problemTex = null;
    this._elements = [];
    this.el.root.classList.remove('is-solved-current');
    this._refreshEmpty();
  };

  // Park the finished derivation on the rail. Called when the problem in focus
  // is being replaced — by a `clear` card (problem done / start over) or by a
  // `pose` of genuinely different math. Previously both cases just deleted the
  // work; now it shrinks to a thumbnail the student can click back into.
  DerivationView.prototype._archiveCurrent = function () {
    if (this._problemTex == null) return;                 // nothing in focus
    if (!this._elements.length && !this.el.lines.childNodes.length) {
      return;                                             // posed but never worked
    }
    var solved = hasSolution(this._elements);
    this._archive.push({
      id: 'lws-arch-' + (++this._seq),
      problemTex: this._problemTex,
      elements: this._elements.slice(),
      solved: solved,
    });
    while (this._archive.length > MAX_ARCHIVE) this._archive.shift();
    this._renderRail();
  };

  // Zip per-problem metadata from the persisted ledger (assistance level,
  // completedAt) onto the archive entries a hydration replay just produced.
  // Alignment is positional — core/ledgerReplay.js guarantees ledgerMeta()
  // filters the same entries ledgerToTurns() replays. Extra meta is ignored;
  // entries beyond the meta list (e.g. live-session archives) stay bare.
  DerivationView.prototype.annotateArchive = function (metaList) {
    if (!Array.isArray(metaList) || !metaList.length) return;
    var n = Math.min(this._archive.length, metaList.length);
    for (var i = 0; i < n; i++) {
      var m = metaList[i];
      if (!m || typeof m !== 'object') continue;
      if (m.assistance != null) this._archive[i].assistance = m.assistance;
      if (m.completedAt != null) this._archive[i].completedAt = m.completedAt;
    }
    this._renderRail();
  };

  DerivationView.prototype._renderRail = function () {
    var self = this;
    var d = this.doc;
    var rail = this.el.rail;
    rail.textContent = '';
    rail.hidden = this._archive.length === 0;
    this.el.root.classList.toggle('has-rail', this._archive.length > 0);
    this._archive.forEach(function (entry, i) {
      var b = d.createElement('button');
      b.type = 'button';
      var independent = entry.solved && entry.assistance != null && entry.assistance <= 4;
      b.className = 'lws-dv-thumb' + (entry.solved ? ' is-solved' : '') + (independent ? ' is-independent' : '');
      b.setAttribute('role', 'listitem');
      b.setAttribute('data-lws-archive-id', entry.id);
      var label = 'Problem ' + (i + 1) + ' — ' + assistanceSummary(entry.solved, entry.assistance);
      b.setAttribute('aria-label', 'Reopen ' + label);
      b.title = 'Reopen ' + label;

      var num = d.createElement('span'); num.className = 'lws-dv-thumb-n'; num.textContent = String(i + 1);
      var tex = d.createElement('span'); tex.className = 'lws-dv-thumb-tex';
      typeset(tex, entry.problemTex);
      b.appendChild(num);
      b.appendChild(tex);
      if (entry.solved) {
        var tick = d.createElement('span'); tick.className = 'lws-dv-thumb-tick'; tick.textContent = '✓';
        tick.setAttribute('aria-hidden', 'true');
        b.appendChild(tick);
      }
      b.addEventListener('click', function () { self.openArchived(entry.id); });
      rail.appendChild(b);
    });
    // Newest thumbnail sits at the right edge — keep it in view.
    try { rail.scrollLeft = rail.scrollWidth; } catch (_) { /* not laid out yet */ }
  };

  // Reopen an archived problem in a read-only overlay above the live board, so
  // looking back never disturbs the work in progress.
  DerivationView.prototype.openArchived = function (id) {
    var entry = null;
    for (var i = 0; i < this._archive.length; i++) {
      if (this._archive[i].id === id) { entry = this._archive[i]; break; }
    }
    if (!entry) return;
    this.closeArchived();

    var self = this;
    var d = this.doc;
    var ov = d.createElement('div');
    ov.className = 'lws-dv-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'false');
    ov.setAttribute('aria-label', 'A problem you already finished');

    var bar = d.createElement('div'); bar.className = 'lws-dv-ov-bar';
    var tag = d.createElement('span'); tag.className = 'lws-dv-ov-tag'; tag.textContent = 'Earlier problem';
    var back = d.createElement('button');
    back.type = 'button'; back.className = 'lws-dv-ov-back';
    back.textContent = 'Back to my work';
    back.addEventListener('click', function () { self.closeArchived(); });
    bar.appendChild(tag); bar.appendChild(back);

    // Collapsed-card summary (spec §4.5): how it ended and how much work it
    // took, in the student's terms, before the full derivation below.
    var stepCount = entry.elements.filter(function (e) {
      var k = classify(e);
      return k && k !== 'problem' && k !== 'operation';
    }).length;
    var sum = d.createElement('div');
    sum.className = 'lws-dv-ov-sum' + (entry.solved ? ' is-solved' : '');
    var sumStatus = d.createElement('span');
    sumStatus.className = 'lws-dv-ov-sum-status';
    sumStatus.textContent = assistanceSummary(entry.solved, entry.assistance);
    sum.appendChild(sumStatus);
    if (stepCount > 0) {
      var sumSteps = d.createElement('span');
      sumSteps.className = 'lws-dv-ov-sum-steps';
      sumSteps.textContent = stepCount + (stepCount === 1 ? ' step' : ' steps');
      sum.appendChild(sumSteps);
    }

    var body = d.createElement('div'); body.className = 'lws-dv-ov-body';
    var inner = d.createElement('div'); inner.className = 'lws-dv-inner';
    var problem = d.createElement('div'); problem.className = 'lws-dv-problem';
    var plab = d.createElement('div'); plab.className = 'lws-dv-plabel'; plab.textContent = 'Problem';
    var ptex = d.createElement('div'); ptex.className = 'lws-dv-ptex';
    typeset(ptex, entry.problemTex);
    problem.appendChild(plab); problem.appendChild(ptex);
    var lines = d.createElement('div'); lines.className = 'lws-dv-lines';
    inner.appendChild(problem); inner.appendChild(lines);
    body.appendChild(inner);

    // Rebuild the steps from the archived elements. Blocks get fresh renderers
    // (tracked separately so closing the overlay disposes them).
    entry.elements.forEach(function (el) {
      var kind = classify(el);
      if (!kind || kind === 'problem') return;
      if (kind === 'block') self._addBlock(el, lines, self._overlayBlocks);
      else self._addLine(el, kind, lines);
    });

    ov.appendChild(bar); ov.appendChild(sum); ov.appendChild(body);
    this.el.root.appendChild(ov);
    this._overlay = ov;
    this._escHandler = function (ev) { if (ev.key === 'Escape') self.closeArchived(); };
    d.addEventListener('keydown', this._escHandler);
    try { back.focus(); } catch (_) { /* not focusable yet */ }

    var btn = this.el.rail.querySelector('[data-lws-archive-id="' + id + '"]');
    if (btn) btn.classList.add('is-open');
  };

  DerivationView.prototype.closeArchived = function () {
    if (this._escHandler) {
      this.doc.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
    this._overlayBlocks.forEach(function (b) { try { b && b.destroy && b.destroy(); } catch (_) {} });
    this._overlayBlocks = [];
    if (this._overlay && this._overlay.parentNode) this._overlay.parentNode.removeChild(this._overlay);
    this._overlay = null;
    var open = this.el.rail.querySelectorAll('.is-open');
    for (var i = 0; i < open.length; i++) open[i].classList.remove('is-open');
  };

  // A `clear` card means "this problem is done, moving on" (the server guard
  // only lets it through after a verify, before a pose, or on an explicit
  // start-over). So it archives rather than deletes.
  DerivationView.prototype.clear = function () {
    this._archiveCurrent();
    this._wipeCurrent();
  };

  // Session-level reset: nothing from the previous session survives, rail
  // included. Used when the server rolls the conversation over.
  DerivationView.prototype.resetAll = function () {
    this.closeArchived();
    this._archive = [];
    this._renderRail();
    this._wipeCurrent();
    this.setCaption('');
  };

  DerivationView.prototype._setProblem = function (element) {
    var latex = (element.semantic && element.semantic.latex) || '';
    // A genuinely different problem starts a fresh derivation (one in focus) —
    // the outgoing one shrinks to a thumbnail instead of being thrown away.
    if (this._problemTex != null && norm(latex) !== norm(this._problemTex)) {
      this._archiveCurrent();
      this._destroyBlocks();
      this.el.lines.textContent = '';
      this._elements = [];
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

  // `target` defaults to the live line stack; the archive overlay passes its
  // own container so a reopened problem renders through the same code path.
  DerivationView.prototype._addLine = function (element, kind, target) {
    var d = this.doc;
    var row = d.createElement('div');
    row.className = 'lws-dv-line lws-dv-' + kind;
    // The adapter synthesises a per-element id (e.g. lgc3-1-resolve); keep it
    // so a line stays addressable after render.
    if (element && element.id) row.setAttribute('data-lws-id', element.id);
    if (kind === 'operation') {
      var op = (element.semantic && (element.semantic.op || element.semantic.plain)) || '';
      if (!op) { var probe = d.createElement('span'); typeset(probe, element.semantic && element.semantic.latex); op = probe.textContent || ''; }
      var tag = d.createElement('span'); tag.className = 'lws-dv-op'; tag.textContent = op;
      row.appendChild(tag);
    } else {
      // Scaffold blanks (\boxed{}) render as KaTeX's empty box — a visual
      // "your turn" cue the student answers IN CHAT, where the pipeline can
      // see it. (Board-side inputs were removed: they submitted through a
      // side door the tutor had no concept of.)
      var tex = d.createElement('div'); tex.className = 'lws-dv-tex';
      typeset(tex, element.semantic && element.semantic.latex);
      row.appendChild(tex);
    }
    (target || this.el.lines).appendChild(row);
  };

  DerivationView.prototype._addBlock = function (element, target, blockSink) {
    var d = this.doc;
    var wrap = d.createElement('div'); wrap.className = 'lws-dv-line lws-dv-block';
    var factory = this.renderers[element.type];
    if (typeof factory === 'function') {
      try {
        var r = factory(element, { host: wrap, viewport: null });
        if (r && r.node) { wrap.appendChild(r.node); (blockSink || this._blocks).push(r); }
        else { wrap.textContent = '[' + element.type + ']'; }
      } catch (_) { wrap.textContent = '[' + element.type + ']'; }
    } else { wrap.textContent = '[' + element.type + ']'; }
    (target || this.el.lines).appendChild(wrap);
  };

  // Render one turn's adapted elements. `clear` wipes the board first.
  DerivationView.prototype.apply = function (elements, clear) {
    if (clear) this.clear();
    if (!Array.isArray(elements)) { this._refreshEmpty(); return; }
    var self = this;
    this._clearFresh();
    var seen = toArray(this.el.lines.childNodes);
    elements.forEach(function (el) {
      var kind = classify(el);
      if (!kind) return;
      if (kind === 'problem') self._setProblem(el);        // may archive + reset _elements
      else if (kind === 'block') self._addBlock(el);
      else self._addLine(el, kind);
      // Keep the data behind the current derivation so it can be archived and
      // re-rendered later. Recorded AFTER _setProblem so a pose that starts a
      // new problem lands in the new list, not the one just archived.
      self._elements.push(el);
    });
    freshNodes(seen, toArray(this.el.lines.childNodes)).forEach(function (n) {
      if (n.classList) n.classList.add('lws-dv-fresh');
    });
    // §4.4 card state, kept deliberately subtle: once the derivation in focus
    // reaches its solution, the pinned problem header shows a "Solved ✓" chip
    // (CSS reads this class). Cleared by _wipeCurrent with everything else.
    this.el.root.classList.toggle('is-solved-current', hasSolution(this._elements));
    this._refreshEmpty();
    this._scrollToEnd();
  };

  // Caption strip API — text only; the karaoke pointer lives in the caption
  // layer, this just paints what it's told and hides when empty.
  DerivationView.prototype.setCaption = function (text) {
    var c = this.el.caption;
    var t = (text == null ? '' : String(text));
    c.textContent = t;
    c.hidden = !t;
  };

  DerivationView.prototype._scrollToEnd = function () {
    var s = this.el.scroll;
    try { s.scrollTop = s.scrollHeight; } catch (_) {}
  };

  DerivationView.classify = classify;
  DerivationView.cleanLatex = cleanLatex;
  DerivationView.looksLikeProse = looksLikeProse;
  DerivationView.unwrapText = unwrapText;
  DerivationView.freshNodes = freshNodes;
  DerivationView.hasSolution = hasSolution;
  DerivationView.assistanceSummary = assistanceSummary;
  DerivationView.MAX_ARCHIVE = MAX_ARCHIVE;
  LWS.DerivationView = DerivationView;
  if (typeof module !== 'undefined' && module.exports) module.exports = { DerivationView: DerivationView, classify: classify, cleanLatex: cleanLatex, looksLikeProse: looksLikeProse, unwrapText: unwrapText, freshNodes: freshNodes, hasSolution: hasSolution, assistanceSummary: assistanceSummary, MAX_ARCHIVE: MAX_ARCHIVE };
})(typeof self !== 'undefined' ? self : this);

/* ============================================================
   derivationView.js — the focused-derivation board (build brick #1).

   Renders a turn's board_commands (already run through the P5 adapter,
   `adaptBoardCommands`) as a single FOCUSED DERIVATION rather than free-
   floating cards on a canvas.

   The derivation is ONE WORK CARD that grows as the turn's steps arrive:

     • the PROBLEM (pose) is the card's HEAD — sticky, so the question stays
       in view while the work scrolls beneath it,
     • each step lands in the card's BODY on a numbered spine, so the
       sequence is countable and "step 3" points at something real,
     • the operation (apply) is a LABEL ON the step it produced rather than
       a row of its own — the equation column then reads straight down,
     • the solution (verify) closes the card as a marked answer panel,
     • graph / image / geometry render as framed, captioned blocks in the
       same spine,
     • the FOOT reports how the problem went (step count / solved).

   The card replaces a pinned header with loose rows beneath it: the work
   now reads as one object instead of a title with debris under it.

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
    // Tolerate the tutor model's split \dfrac ("\d\frac{5}{7}") in tex that
    // was ledgered before the server-side normalization existed.
    t = t.replace(/\\([dt])\s*\\(frac)\b/g, '\\$1$2').replace(/\\displaystyle\s*/g, '');
    // "\." is a mangled sentence period (KaTeX has no such command, and with
    // throwOnError:false ONE bad token makes the whole card render as red raw
    // source — production 2026-07-28: "1 \div (-0.1)\."). Accent "\.{x}" kept.
    t = t.replace(/\\\.(?!\{)/g, '.');
    t = t.replace(/\\+$/, '');               // dangling backslash at end
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
    // Words inside \text{…} are math-mode LABELS ("cups", "batches"), not
    // prose — KaTeX renders them fine, and counting them here mis-routed
    // ratios like \frac{3 \text{ cups}}{2 \text{ batches}} down the
    // prose-with-inline-math path, whose splitter can't handle the nested
    // braces and shipped raw "\frac3 cups2 batches" to production. Drop the
    // whole \text groups BEFORE counting words.
    var stripped = t.replace(/\\text\s*\{[^{}]*\}/g, ' ');
    // Strip remaining LaTeX commands (\frac, \quad, \Rightarrow …) and braces
    // so command names aren't mistaken for words — then count the genuine
    // words left. Math is single-letter variables, digits and operators (no
    // 3+ letter runs), so 3+ real words means prose, not an equation.
    stripped = stripped.replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}]/g, ' ');
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

  // Group a batch of adapted elements into RENDER ROWS.
  //
  // An `operation` (apply) describes the move that produced the next line, so
  // it becomes a label ON that line's row instead of consuming a row of its
  // own. Two things keep that safe:
  //   • an operation the batch never resolves (the tutor emitted `apply` this
  //     turn and `resolve` next turn) keeps its own row, so a move is never
  //     silently dropped;
  //   • every row records the 1-based BOARD-STATE ORDINALS it now covers.
  //     boardStateBlock.js numbers every non-pose card, including apply, and
  //     the tutor points with <BOARD_POINT step="N"/> against that numbering.
  //     Folding two cards into one row would otherwise shift every later
  //     number and make the tutor point at the wrong line.
  //
  // `startOrdinal` is how many non-pose elements the derivation already holds,
  // so ordinals stay continuous across turns. Pure; exported for tests.
  function groupRows(elements, startOrdinal) {
    var rows = [];
    var n = typeof startOrdinal === 'number' ? startOrdinal : 0;
    var pending = null;   // { element, ordinal } — an operation awaiting its line

    function flushPending() {
      if (!pending) return;
      rows.push({ kind: 'operation', element: pending.element, opElement: null, ordinals: [pending.ordinal] });
      pending = null;
    }

    (Array.isArray(elements) ? elements : []).forEach(function (el) {
      var kind = classify(el);
      if (!kind || kind === 'problem') return;   // pose is the card head, not a row
      n += 1;
      if (kind === 'operation') {
        flushPending();                          // back-to-back applies each keep a line
        pending = { element: el, ordinal: n };
        return;
      }
      var ordinals = [];
      var opElement = null;
      if (pending) { ordinals.push(pending.ordinal); opElement = pending.element; pending = null; }
      ordinals.push(n);
      rows.push({ kind: kind, element: el, opElement: opElement, ordinals: ordinals });
    });
    flushPending();
    return rows;
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
    // Called with the sourceRef when the student clicks the problem header's
    // "from my worksheet" chip — the integration opens the docked source.
    this.onOpenSource = typeof opts.onOpenSource === 'function' ? opts.onOpenSource : null;
    this._blocks = [];        // live block renderers (for destroy on clear)
    this._problemTex = null;
    this._problemSource = null;   // {uploadId, region} link of the problem in focus
    // The adapted elements making up the CURRENT derivation, kept so a finished
    // problem can be archived as data and re-rendered on demand. Snapshotting
    // data (not detaching live DOM) is what makes reopening safe: block
    // renderers like the JSXGraph board do not survive being pulled out of the
    // document and put back, so archived blocks are destroyed and rebuilt.
    this._elements = [];
    this._archive = [];       // [{ problemTex, elements, solved }] — oldest first
    this._seq = 0;
    this._overlayBlocks = [];
    this._ordinal = 0;        // non-pose cards rendered so far (board-state numbering)
    this._stepNo = 0;         // numbered steps on the spine (excludes scaffolds/visuals)

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
    // ONE work card: head = the problem, body = the steps, foot = how it went.
    // The card grows downward as steps arrive; the head stays sticky.
    var card = d.createElement('div'); card.className = 'lws-card'; card.style.display = 'none';
    var problem = d.createElement('div'); problem.className = 'lws-card-head';
    var lines = d.createElement('div'); lines.className = 'lws-card-body';
    var foot = d.createElement('div'); foot.className = 'lws-card-foot'; foot.hidden = true;
    card.appendChild(problem); card.appendChild(lines); card.appendChild(foot);
    inner.appendChild(card);
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

    this.el = { root: rootEl, scroll: scroll, empty: empty, inner: inner, card: card, problem: problem, lines: lines, foot: foot, caption: caption, rail: rail };
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
    this.el.card.style.display = 'none';
    this.el.foot.hidden = true;
    this._problemTex = null;
    this._problemSource = null;
    this._elements = [];
    this._ordinal = 0;
    this._stepNo = 0;
    this.el.card.classList.remove('is-solved');
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
      sourceRef: this._problemSource || null,
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
      if (m.sourceRef != null) this._archive[i].sourceRef = m.sourceRef;
    }
    this._renderRail();
  };

  // Link (or unlink, with null) the problem in focus to the docked source it
  // was selected from (spec §5.4). Paints a small "From my worksheet" chip in
  // the pinned header; clicking it hands the ref to the integration, which
  // opens the source with the region highlighted. Called on the turn the
  // server stamps the link, and on hydration from ledger.current.sourceRef.
  DerivationView.prototype.setProblemSource = function (ref) {
    this._problemSource = (ref && ref.uploadId) ? ref : null;
    var old = this.el.problem.querySelector('.lws-dv-srcchip');
    if (old) old.parentNode.removeChild(old);
    var eyebrow = this.el.problem.querySelector('.lws-card-eyebrow');
    if (!this._problemSource || !eyebrow || this.el.card.style.display === 'none') return;
    var self = this;
    var chip = this.doc.createElement('button');
    chip.type = 'button';
    chip.className = 'lws-dv-srcchip';
    chip.textContent = '📎 From my worksheet';
    chip.setAttribute('aria-label', 'Open the worksheet this problem came from');
    chip.addEventListener('click', function () {
      if (self.onOpenSource) { try { self.onOpenSource(self._problemSource); } catch (e) { console.error('[LWS] open source failed', e); } }
    });
    // Before the state chip, which is pushed to the far end of the eyebrow.
    var state = eyebrow.querySelector('.lws-card-state');
    if (state) eyebrow.insertBefore(chip, state); else eyebrow.appendChild(chip);
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
    if (entry.sourceRef && entry.sourceRef.uploadId) {
      var sumSrc = d.createElement('button');
      sumSrc.type = 'button';
      sumSrc.className = 'lws-dv-ov-sum-src';
      sumSrc.textContent = '📎 From my worksheet';
      sumSrc.setAttribute('aria-label', 'Open the worksheet this problem came from');
      var srcRef = entry.sourceRef;
      sumSrc.addEventListener('click', function () {
        if (self.onOpenSource) { try { self.onOpenSource(srcRef); } catch (e) { console.error('[LWS] open source failed', e); } }
      });
      sum.appendChild(sumSrc);
    }

    var body = d.createElement('div'); body.className = 'lws-dv-ov-body';
    var inner = d.createElement('div'); inner.className = 'lws-dv-inner';
    // Same card the live board uses, so a look-back reads identically.
    var card = d.createElement('div'); card.className = 'lws-card' + (entry.solved ? ' is-solved' : '');
    var problem = d.createElement('div'); problem.className = 'lws-card-head';
    var eyebrow = d.createElement('div'); eyebrow.className = 'lws-card-eyebrow';
    var plab = d.createElement('span'); plab.className = 'lws-card-lbl'; plab.textContent = 'Problem';
    var pstate = d.createElement('span'); pstate.className = 'lws-card-state'; pstate.textContent = '✓ Solved';
    eyebrow.appendChild(plab); eyebrow.appendChild(pstate);
    var ptex = d.createElement('div'); ptex.className = 'lws-card-problem';
    typeset(ptex, entry.problemTex);
    problem.appendChild(eyebrow); problem.appendChild(ptex);
    var lines = d.createElement('div'); lines.className = 'lws-card-body';
    card.appendChild(problem); card.appendChild(lines);
    inner.appendChild(card);
    body.appendChild(inner);

    // Rebuild the steps from the archived elements. Blocks get fresh renderers
    // (tracked separately so closing the overlay disposes them).
    var ovCtx = { stepNo: 0 };
    groupRows(entry.elements, 0).forEach(function (row) {
      self._addRow(row, lines, ovCtx, self._overlayBlocks);
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
      this._ordinal = 0;            // a new problem restarts both numberings
      this._stepNo = 0;
      this._problemSource = null;   // a new problem starts unlinked
    }
    this._problemTex = latex;
    var d = this.doc;
    this.el.problem.textContent = '';
    var eyebrow = d.createElement('div'); eyebrow.className = 'lws-card-eyebrow';
    var lab = d.createElement('span'); lab.className = 'lws-card-lbl'; lab.textContent = 'Problem';
    // Always present; CSS reveals it only once the card carries .is-solved, so
    // reaching the answer costs no layout shift.
    var state = d.createElement('span'); state.className = 'lws-card-state'; state.textContent = '✓ Solved';
    eyebrow.appendChild(lab); eyebrow.appendChild(state);
    var body = d.createElement('div'); body.className = 'lws-card-problem';
    typeset(body, latex);
    this.el.problem.appendChild(eyebrow);
    this.el.problem.appendChild(body);
    this.el.card.style.display = '';
    // Re-poses rebuild the header from scratch — repaint a surviving link.
    if (this._problemSource) this.setProblemSource(this._problemSource);
  };

  // The readable text of an `apply` card. Prefers the plain-language op the
  // adapter carried; falls back to typesetting the latex and reading it back.
  DerivationView.prototype._opText = function (element) {
    var op = (element && element.semantic && (element.semantic.op || element.semantic.plain)) || '';
    if (op) return op;
    var probe = this.doc.createElement('span');
    typeset(probe, element && element.semantic && element.semantic.latex);
    return probe.textContent || '';
  };

  // Render ONE row of the card body: a numbered spine node on the left, the
  // step itself on the right (with its operation label above it, if the move
  // that produced it arrived in the same batch).
  //
  // `ctx` carries the step counter so the live board and a reopened archive
  // number independently. `target` defaults to the live body; the overlay
  // passes its own container so a look-back renders through this same path.
  DerivationView.prototype._addRow = function (row, target, ctx, blockSink) {
    var d = this.doc;
    var element = row.element;
    var kind = row.kind === 'block' ? 'visual' : row.kind;

    var wrap = d.createElement('div');
    wrap.className = 'lws-step is-' + kind;
    // The adapter synthesises a per-element id (e.g. lgc3-1-resolve); keep it
    // so a line stays addressable after render.
    if (element && element.id) wrap.setAttribute('data-lws-id', element.id);
    // Board-state ordinals this row covers — how <BOARD_POINT step="N"/> finds
    // its line now that an operation shares a row with the step it produced.
    if (row.ordinals && row.ordinals.length) wrap.setAttribute('data-lws-ord', row.ordinals.join(' '));

    var spine = d.createElement('div'); spine.className = 'lws-step-spine';
    var node = d.createElement('span'); node.className = 'lws-step-node';
    node.setAttribute('aria-hidden', 'true');
    if (kind === 'solution') { node.textContent = '✓'; node.className += ' is-answer'; }
    else if (kind === 'visual') node.textContent = '◈';
    else if (kind === 'scaffold') node.textContent = '?';
    else if (kind === 'example') node.textContent = '↗';
    else if (kind === 'operation') node.textContent = '↳';
    else node.textContent = String(++ctx.stepNo);   // an actual worked step
    spine.appendChild(node);
    wrap.appendChild(spine);

    var main = d.createElement('div'); main.className = 'lws-step-main';

    // The move rides ON the line it produced, as a caption above the result.
    if (row.opElement) {
      var op = d.createElement('div'); op.className = 'lws-step-op';
      var ic = d.createElement('span'); ic.className = 'lws-step-op-ic'; ic.setAttribute('aria-hidden', 'true'); ic.textContent = '↳';
      op.appendChild(ic);
      op.appendChild(d.createTextNode(this._opText(row.opElement)));
      main.appendChild(op);
    }

    if (kind === 'operation') {
      // An apply whose line has not arrived yet — keep the move visible on its
      // own rather than dropping it.
      var solo = d.createElement('div'); solo.className = 'lws-step-op is-solo';
      solo.textContent = this._opText(element);
      main.appendChild(solo);
    } else if (kind === 'visual') {
      this._addBlock(element, main, blockSink);
    } else {
      // Scaffold blanks (\boxed{}) are tappable (owner call, 2026-07-28 —
      // interactive again, but through the StudentMove contract this time:
      // tap → type → 'lws:blank-submit' event → chat-workspace POSTs it to
      // /api/student-moves?tutor=true, the SAME pipe as a typed answer. The
      // 2026-07-25 removal was of inputs that submitted through a side door
      // chat had no concept of; this lane the tutor fully understands.)
      var tex = d.createElement('div'); tex.className = 'lws-step-tex';
      var latex = element.semantic && element.semantic.latex;
      typeset(tex, latex);
      main.appendChild(tex);
      var caption = element.semantic && element.semantic.caption;
      if (caption) {
        var cap = d.createElement('div'); cap.className = 'lws-step-cap'; cap.textContent = caption;
        main.appendChild(cap);
      }
      if (kind === 'solution') {
        var badge = d.createElement('span'); badge.className = 'lws-step-answer-badge'; badge.textContent = 'Answer';
        main.appendChild(badge);
      }
      if (latex && /\\boxed/.test(String(latex))) this._wireBlanks(wrap, tex, String(latex));
    }

    wrap.appendChild(main);
    (target || this.el.lines).appendChild(wrap);
  };

  // Make each rendered \boxed{} in a scaffold line a real input affordance.
  // KaTeX renders \boxed as a span.fbox; if that markup ever changes, the
  // fallback chip below still gives the row a working entry point.
  DerivationView.prototype._wireBlanks = function (row, texEl, latex) {
    var d = this.doc;
    var boxes = toArray(texEl.querySelectorAll('.fbox'));
    var self = this;

    function submit(blankIndex, value, paint) {
      value = String(value == null ? '' : value).trim();
      if (!value) return;
      paint(value);
      var ev;
      try {
        ev = new CustomEvent('lws:blank-submit', {
          bubbles: true,
          detail: { stepTex: latex, blankIndex: blankIndex, value: value, row: row, paint: paint },
        });
      } catch (_) { return; }
      row.dispatchEvent(ev);
    }

    function arm(box, blankIndex) {
      box.classList.add('lws-blank');
      box.setAttribute('role', 'button');
      box.setAttribute('tabindex', '0');
      box.setAttribute('aria-label', 'Fill in this blank');
      function open() {
        if (box.querySelector('input')) return;
        var inp = d.createElement('input');
        inp.className = 'lws-blank-input';
        inp.setAttribute('aria-label', 'Your value for this blank');
        inp.maxLength = 30;
        box.textContent = '';
        box.appendChild(inp);
        inp.focus();
        inp.addEventListener('keydown', function (e) {
          // Without this, the Enter bubbles to the box's own keydown handler,
          // which re-opens an empty input over the value just painted.
          e.stopPropagation();
          if (e.key === 'Enter') {
            submit(blankIndex, inp.value, function (v) {
              box.textContent = v;
              box.classList.add('lws-blank-pending');
            });
          }
          if (e.key === 'Escape') { box.textContent = ''; box.classList.remove('lws-blank-pending'); }
        });
      }
      box.addEventListener('click', open);
      box.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    }

    if (boxes.length) {
      for (var i = 0; i < boxes.length; i++) arm(boxes[i], i);
      return;
    }
    // Fallback: KaTeX markup not found — append a chip that opens an inline
    // input for the FIRST blank so the affordance never silently dies.
    var chip = d.createElement('button');
    chip.className = 'lws-blank-chip';
    chip.type = 'button';
    chip.textContent = 'Fill in the blank';
    chip.addEventListener('click', function () {
      if (row.querySelector('.lws-blank-input')) return;
      var inp = d.createElement('input');
      inp.className = 'lws-blank-input';
      inp.setAttribute('aria-label', 'Your value for the blank');
      inp.maxLength = 30;
      chip.replaceWith(inp);
      inp.focus();
      inp.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') {
          submit(0, inp.value, function (v) {
            var done = d.createElement('span');
            done.className = 'lws-blank lws-blank-pending';
            done.textContent = v;
            inp.replaceWith(done);
          });
        }
      });
    });
    row.appendChild(chip);
  };

  // A graph / image / geometry block, framed and captioned so it reads as a
  // deliberate teaching aid rather than a stray picture in the column.
  // Appends into the row's main column (`target`).
  DerivationView.prototype._addBlock = function (element, target, blockSink) {
    var d = this.doc;
    var fig = d.createElement('figure'); fig.className = 'lws-step-visual';
    var canvas = d.createElement('div'); canvas.className = 'lws-step-visual-canvas';
    var factory = this.renderers[element.type];
    if (typeof factory === 'function') {
      try {
        var r = factory(element, { host: canvas, viewport: null });
        if (r && r.node) { canvas.appendChild(r.node); (blockSink || this._blocks).push(r); }
        else { canvas.textContent = '[' + element.type + ']'; }
      } catch (_) { canvas.textContent = '[' + element.type + ']'; }
    } else { canvas.textContent = '[' + element.type + ']'; }
    fig.appendChild(canvas);
    var caption = element.semantic && element.semantic.caption;
    if (caption) {
      var cap = d.createElement('figcaption'); cap.className = 'lws-step-visual-cap'; cap.textContent = caption;
      fig.appendChild(cap);
    }
    target.appendChild(fig);
  };

  // Render one turn's adapted elements. `clear` wipes the board first.
  //
  // A pose is handled first and separately — it can archive the outgoing
  // derivation and reset the numbering, so the rows that follow must be
  // grouped against the state it leaves behind, not the state before it.
  DerivationView.prototype.apply = function (elements, clear) {
    if (clear) this.clear();
    if (!Array.isArray(elements)) { this._refreshEmpty(); return; }
    var self = this;
    this._clearFresh();
    var seen = toArray(this.el.lines.childNodes);

    var rest = [];
    elements.forEach(function (el) {
      var kind = classify(el);
      if (!kind) return;
      if (kind === 'problem') self._setProblem(el);   // may archive + reset _elements/_ordinal
      else rest.push(el);
      // Keep the data behind the current derivation so it can be archived and
      // re-rendered later. Recorded AFTER _setProblem so a pose that starts a
      // new problem lands in the new list, not the one just archived.
      self._elements.push(el);
    });

    var ctx = { stepNo: this._stepNo };
    groupRows(rest, this._ordinal).forEach(function (row) { self._addRow(row, null, ctx); });
    this._stepNo = ctx.stepNo;
    this._ordinal += rest.length;

    freshNodes(seen, toArray(this.el.lines.childNodes)).forEach(function (n) {
      if (n.classList) n.classList.add('lws-dv-fresh');
    });
    // §4.4 card state, kept deliberately subtle: once the derivation in focus
    // reaches its solution, the card's head shows a "Solved ✓" chip and its
    // tint goes green (CSS reads this class). Cleared by _wipeCurrent.
    this.el.card.classList.toggle('is-solved', hasSolution(this._elements));
    this._refreshFoot();
    this._refreshEmpty();
    this._scrollToEnd();
  };

  // The card's foot: how much work this problem has taken, and whether it
  // landed. Assistance wording is deliberately NOT shown here — the level is
  // server-side and only known for a FINISHED problem, so it belongs to the
  // archive summary (assistanceSummary), not to work still in progress.
  DerivationView.prototype._refreshFoot = function () {
    var d = this.doc;
    // Counted the way the archive summary counts (openArchived): a bare
    // operation is a move, not a step. Otherwise the same work reads as one
    // step longer live than it does when reopened from the rail.
    var steps = this.el.lines.querySelectorAll('.lws-step:not(.is-operation)').length;
    var foot = this.el.foot;
    if (!steps) { foot.hidden = true; foot.textContent = ''; return; }
    foot.textContent = '';
    var n = d.createElement('span');
    n.className = 'lws-card-foot-n';
    n.textContent = steps + (steps === 1 ? ' step' : ' steps');
    foot.appendChild(n);
    if (this.el.card.classList.contains('is-solved')) {
      var sep = d.createElement('span'); sep.className = 'lws-card-foot-sep'; sep.textContent = '·';
      var s = d.createElement('span'); s.className = 'lws-card-foot-a'; s.textContent = 'Answer found';
      foot.appendChild(sep); foot.appendChild(s);
    }
    foot.hidden = false;
  };

  // Tutor pointing (spec §8): make the exact line the tutor is discussing
  // glow. `ref` is {step: N} (1-based, the board-state block's numbering) or
  // {target: 'problem'|'solution'|'last'}. Out-of-range steps fall back to the
  // newest line rather than pointing at nothing. The glow self-clears.
  //
  // N resolves through data-lws-ord, NOT through child position: an operation
  // shares a row with the step it produced, so the two numberings stopped
  // being 1:1 the moment the fold landed.
  DerivationView.prototype.pointAt = function (ref) {
    if (!ref || typeof ref !== 'object') return;
    var rows = this.el.lines.children;
    var node = null;
    if (ref.target === 'problem') node = this.el.card.style.display === 'none' ? null : this.el.problem;
    else if (ref.target === 'solution') {
      var sols = this.el.lines.querySelectorAll('.lws-step.is-solution');
      node = sols.length ? sols[sols.length - 1] : null;
    } else if (ref.target === 'last') node = rows.length ? rows[rows.length - 1] : null;
    else if (ref.step >= 1) {
      node = this.el.lines.querySelector('[data-lws-ord~="' + ref.step + '"]')
        || (rows.length ? rows[rows.length - 1] : null);
    }
    if (!node) return;

    var prev = this.el.root.querySelectorAll('.lws-dv-pointed');
    for (var i = 0; i < prev.length; i++) prev[i].classList.remove('lws-dv-pointed');
    if (this._pointTimer) { clearTimeout(this._pointTimer); this._pointTimer = null; }

    node.classList.add('lws-dv-pointed');
    try { node.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) { /* older browsers */ }
    this._pointTimer = setTimeout(function () { node.classList.remove('lws-dv-pointed'); }, 7000);
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
  DerivationView.groupRows = groupRows;
  DerivationView.cleanLatex = cleanLatex;
  DerivationView.looksLikeProse = looksLikeProse;
  DerivationView.unwrapText = unwrapText;
  DerivationView.freshNodes = freshNodes;
  DerivationView.hasSolution = hasSolution;
  DerivationView.assistanceSummary = assistanceSummary;
  DerivationView.MAX_ARCHIVE = MAX_ARCHIVE;
  LWS.DerivationView = DerivationView;
  if (typeof module !== 'undefined' && module.exports) module.exports = { DerivationView: DerivationView, classify: classify, groupRows: groupRows, cleanLatex: cleanLatex, looksLikeProse: looksLikeProse, unwrapText: unwrapText, freshNodes: freshNodes, hasSolution: hasSolution, assistanceSummary: assistanceSummary, MAX_ARCHIVE: MAX_ARCHIVE };
})(typeof self !== 'undefined' ? self : this);

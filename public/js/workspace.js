/* ============================================================
   workspace.js — interactive math workspace (chat right slot)

   A tabbed panel in the chat's right column:
   - "Graph" embeds a live MathGraph the student drives.
   - "Board" / "Tiles" / "Calc" launch the existing floating tools
     (whiteboard, algebra tiles, calculator).

   Exposes window.MathWorkspace so other code (e.g. the tutor
   pushing a concept graph or a parallel-problem example) can open
   the panel and display a visual.

   IMPORTANT — the #1 product rule: the workspace only ever shows
   concept illustrations or PARALLEL-problem examples. It must never
   display the answer or worked solution to the student's own
   problem. Callers are responsible for honoring that; the caption
   slot exists to label example/parallel content as such.
   ============================================================ */

(function () {
  'use strict';

  var WS = {
    el: null,
    body: null,
    current: null,
    graph: null,
    // Persistent board state — steps survive tab switches. The DOM is
    // rebuilt from this when the user returns to the Board tab.
    board: { steps: [] }
  };

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  // KaTeX renderer with a safe text fallback if KaTeX hasn't loaded yet
  // (very early in page life) or the expression doesn't parse.
  function renderTex(target, tex) {
    if (!target) return;
    if (window.katex && typeof window.katex.render === 'function') {
      try {
        window.katex.render(String(tex || ''), target, {
          throwOnError: false,
          displayMode: true,
          output: 'html'
        });
        return;
      } catch (_) { /* fall through to text */ }
    }
    target.textContent = String(tex || '');
  }

  // Give empty \boxed{} scaffold slots a visible width so they read as
  // fill-in blanks rather than collapsing to a hairline box. Only widens
  // boxes that are empty or contain nothing but LaTeX spacing macros.
  function widenScaffoldBlanks(tex) {
    if (!tex || typeof tex !== 'string') return tex || '';
    return tex.replace(
      /\\boxed\s*\{\s*(?:\\(?:[;,:! ]|quad|qquad)\s*)*\}/g,
      '\\boxed{\\phantom{00}}'
    );
  }

  // Matches an EMPTY scaffold blank: a \boxed{} whose contents are only LaTeX
  // spacing macros, or a \square glyph. Mirrors the blanks the pedagogy guard
  // recognizes (utils/boardCommandGuard.js texHasBlank). No capture groups, so
  // String.split() drops the delimiters and yields the segments between blanks.
  var SCAFFOLD_BLANK_RE = /\\boxed\s*\{\s*(?:\\(?:[;,:! ]|quad|qquad)\s*)*\}|\\square\b/g;

  // KaTeX inline fragment (so math segments sit on one line beside the inputs).
  function renderTexInline(target, tex) {
    if (!target) return;
    if (window.katex && typeof window.katex.render === 'function') {
      try {
        window.katex.render(String(tex || ''), target, {
          throwOnError: false, displayMode: false, output: 'html'
        });
        return;
      } catch (_) { /* fall through */ }
    }
    target.textContent = String(tex || '');
  }

  // Submit text AS THE STUDENT — a visible chat message, exactly as if they'd
  // typed it and hit Send. This is deliberate: the tutor only ever knows what the
  // student SAYS, never what's on a card. A silent/background message would make
  // it look like the tutor can read the board itself, which it can't — so the
  // filled-in line flows through the normal input + send path and shows up as the
  // student's own bubble. Mirrors the GraphTool submit (script.js).
  function submitAsStudent(text) {
    text = String(text || '').trim();
    if (!text) return false;
    var input = document.getElementById('user-input');
    var sendBtn = document.getElementById('send-button') || document.querySelector('.send-button');
    if (input && sendBtn) {
      if (input.isContentEditable) input.textContent = text;
      else input.value = text;
      // Let any input-listeners (send-button enable, autosize) react first.
      input.dispatchEvent(new Event('input', { bubbles: true }));
      sendBtn.click();
      return true;
    }
    if (typeof window.sendMessage === 'function') { window.sendMessage(text); return true; }
    return false;
  }

  // Build an interactive scaffold card body: the LaTeX renders around editable
  // blanks the student fills in, then submits as their own line (see
  // submitAsStudent). Returns true if at least one blank was wired; false when
  // there's no recognizable blank (caller falls back to the static render).
  function buildScaffoldFill(card, tex) {
    if (!tex || typeof tex !== 'string') return false;
    SCAFFOLD_BLANK_RE.lastIndex = 0;
    var segments = tex.split(SCAFFOLD_BLANK_RE);
    if (segments.length < 2) return false; // no blank → not fillable

    var row = el('div', 'cr-ws-scaffold-fill');
    var inputs = [];
    segments.forEach(function (seg, i) {
      if (seg && seg.trim()) {
        var frag = el('span', 'cr-ws-scaffold-seg');
        renderTexInline(frag, seg);
        row.appendChild(frag);
      }
      if (i < segments.length - 1) {
        var blank = document.createElement('input');
        blank.type = 'text';
        blank.className = 'cr-ws-scaffold-input';
        blank.setAttribute('aria-label', 'fill in the blank ' + (i + 1));
        blank.setAttribute('inputmode', 'text');
        blank.autocomplete = 'off';
        blank.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); check(); }
        });
        blank.addEventListener('input', function () {
          blank.classList.remove('is-missing');
          // Editing after a "Try again" clears the retry state and re-arms Check.
          if (card.classList.contains('cr-ws-board-card--scaffold-retry')) {
            card.classList.remove('cr-ws-board-card--scaffold-retry');
            checkBtn.textContent = 'Check';
          }
        });
        row.appendChild(blank);
        inputs.push(blank);
      }
    });
    card.appendChild(row);

    var actions = el('div', 'cr-ws-scaffold-actions');
    var checkBtn = el('button', 'cr-ws-scaffold-submit');
    checkBtn.type = 'button';
    checkBtn.textContent = 'Check';
    actions.appendChild(checkBtn);
    card.appendChild(actions);

    function check() {
      // Every blank must be filled — an empty blank isn't an answer.
      var missing = false;
      inputs.forEach(function (inp) {
        if (!inp.value.trim()) { inp.classList.add('is-missing'); missing = true; }
      });
      if (missing) { var first = inputs.filter(function (i) { return !i.value.trim(); })[0]; if (first) first.focus(); return; }

      // Reassemble the line with the typed values in place of the blanks.
      var assembled = '';
      segments.forEach(function (seg, i) {
        assembled += seg;
        if (i < segments.length - 1) assembled += ' ' + inputs[i].value.trim() + ' ';
      });
      assembled = assembled.replace(/\s+/g, ' ').trim();

      // Send the completed line as a SILENT message: the tutor reacts to what the
      // student filled in (the verdict lands in chat / on the board), but no
      // student bubble is painted, so it reads as "the tutor responded to my
      // card", not as a typed message. Falls back to a visible send if the chat's
      // silent channel isn't present (e.g. the board open outside the chat page).
      var sent = (typeof window.sendSilentMessage === 'function')
        ? window.sendSilentMessage(assembled)
        : submitAsStudent(assembled);
      if (sent) {
        // Lock the answers in and show a pending "Checking…" state. The verdict
        // settles IN PLACE when the tutor's reaction card lands (see
        // resolvePendingScaffold) — green if it confirms the line, amber to retry.
        card.classList.remove('cr-ws-board-card--scaffold-retry');
        card.classList.add('cr-ws-board-card--scaffold-checking');
        inputs.forEach(function (inp) { inp.disabled = true; });
        checkBtn.disabled = true;
        checkBtn.textContent = 'Checking…';
        var pending = {
          line: normalizeLine(assembled),
          settle: settleVerdict
        };
        // Safety net: if the tutor's reply carries no resolvable board card,
        // don't hang on "Checking…" — settle to a neutral checked state.
        pending.timer = setTimeout(function () {
          if (WS.board.pendingScaffold === pending) {
            settleVerdict('neutral');
            WS.board.pendingScaffold = null;
          }
        }, 12000);
        WS.board.pendingScaffold = pending;
      }
    }

    // Apply the verdict to this card in place.
    function settleVerdict(verdict) {
      card.classList.remove('cr-ws-board-card--scaffold-checking');
      if (verdict === 'correct') {
        card.classList.add('cr-ws-board-card--scaffold-correct');
        checkBtn.textContent = 'Correct ✓';
        checkBtn.disabled = true;
      } else if (verdict === 'retry') {
        card.classList.add('cr-ws-board-card--scaffold-retry');
        checkBtn.textContent = 'Try again';
        checkBtn.disabled = false;
        inputs.forEach(function (inp) { inp.disabled = false; });
      } else {
        // Neutral: sent and acknowledged, but no structured verdict to show.
        card.classList.add('cr-ws-board-card--scaffold-done');
        checkBtn.textContent = 'Checked ✓';
        checkBtn.disabled = true;
      }
    }

    checkBtn.addEventListener('click', check);
    return true;
  }

  // ---- Launcher tools (open an existing floating surface) --------------
  // Board used to be a launcher into the floating whiteboard; it's now
  // the embedded home base (see renderBoard below). Tiles + Calc stay
  // as launchers since they're full floating UIs of their own.
  var LAUNCHERS = {
    tiles: {
      icon: 'fa-shapes',
      title: 'Algebra tiles',
      blurb: 'Drag-and-drop tiles for modeling expressions, factoring and completing the square.',
      btn: 'Open algebra tiles',
      open: function () { if (typeof window.openAlgebraTiles === 'function') window.openAlgebraTiles(); }
    },
    calc: {
      icon: 'fa-calculator',
      title: 'Calculator',
      blurb: 'A full scientific calculator with memory registers, statistics and table mode.',
      btn: 'Open calculator',
      open: function () {
        if (window.floatingCalc && window.floatingCalc.toggleCalculator) {
          window.floatingCalc.toggleCalculator();
        }
      }
    }
  };

  function renderLauncher(key) {
    return function (body) {
      var L = LAUNCHERS[key];
      var card = el('div', 'cr-ws-launch');
      card.appendChild(el('div', 'cr-ws-launch-ico',
        '<i class="fas ' + L.icon + '" aria-hidden="true"></i>'));
      card.appendChild(el('h4', 'cr-ws-launch-title', L.title));
      card.appendChild(el('p', 'cr-ws-launch-blurb', L.blurb));
      var btn = el('button', 'cr-ws-launch-btn');
      btn.type = 'button';
      btn.textContent = L.btn;
      btn.addEventListener('click', function () {
        // On the mobile drawer, get out of the way of the tool.
        closeWorkspace();
        try { L.open(); } catch (e) { /* tool not ready yet */ }
      });
      card.appendChild(btn);
      body.appendChild(card);
    };
  }

  // ---- Board tool (embedded WorkBoard) ---------------------------------
  // The Board is now the home base: an embedded step-stack that reflects
  // the in-progress work. Cards are appended via the public API
  // (boardPose / boardApply / boardResolve / boardVerify) which the chat
  // pipeline will drive via <BOARD ...> tags in a future PR. For now the
  // API is callable from the console for manual testing.
  //
  // PEDAGOGY RULE (the #1 product rule, restated): cards on the board
  // mirror the starting problem and the moves the STUDENT has stated.
  // The board never previews a step the student hasn't said. Callers
  // are responsible for honoring this; the rule will be backstopped by
  // a server-side guard in the next phase.
  function makeBoardEmpty() {
    return el('div', 'cr-ws-empty cr-ws-board-empty',
      '<div class="cr-ws-board-empty-ico" aria-hidden="true">' +
        '<i class="fas fa-pen-ruler"></i></div>' +
      '<h5 class="cr-ws-board-empty-title">Ready to work it out?</h5>' +
      '<p class="cr-ws-board-empty-body">' +
        'Your steps will land here as you and your tutor work through ' +
        'the problem together.</p>');
  }

  function renderBoard(body) {
    var head = el('div', 'cr-ws-board-head');
    head.innerHTML =
      '<h4 class="cr-ws-board-title"><i class="fas fa-pen" aria-hidden="true"></i> Work Board</h4>' +
      '<button type="button" class="cr-ws-board-clear" aria-label="Clear board">' +
        '<i class="fas fa-eraser" aria-hidden="true"></i></button>';
    body.appendChild(head);

    var stack = el('div', 'cr-ws-board-stack');
    body.appendChild(stack);

    if (WS.board.steps.length === 0) stack.appendChild(makeBoardEmpty());

    // Rebuild any persisted steps (e.g. when re-entering the tab).
    WS.board.steps.forEach(function (step) { appendStepCard(stack, step, /*animate*/ false); });

    head.querySelector('.cr-ws-board-clear').addEventListener('click', function () {
      WS.board.steps = [];
      var s = WS.body && WS.body.querySelector('.cr-ws-board-stack');
      if (s) { s.innerHTML = ''; s.appendChild(makeBoardEmpty()); }
    });
  }

  // Remove a single card — both its DOM and its entry in WS.board.steps (matched
  // by object reference, so it stays gone when the tab is rebuilt). If it was the
  // last card, the empty-state hint comes back.
  function dismissCard(card, step) {
    var i = WS.board.steps.indexOf(step);
    if (i !== -1) WS.board.steps.splice(i, 1);
    var stack = card.parentNode;
    card.classList.add('cr-ws-board-card--leaving');
    setTimeout(function () {
      card.remove();
      if (stack && WS.board.steps.length === 0 && !stack.querySelector('.cr-ws-board-empty')) {
        stack.appendChild(makeBoardEmpty());
      }
    }, 220);
  }

  function teardownBoard() {
    // DOM is discarded by switchTool. State persists in WS.board.steps
    // so re-entering the tab restores the same cards.
  }

  function appendStepCard(stack, step, animate) {
    if (!stack) return;
    // First real card replaces the empty hint.
    var emptyHint = stack.querySelector('.cr-ws-board-empty');
    if (emptyHint) emptyHint.remove();

    var card;
    if (step.type === 'apply') {
      // Transition card — narrow, italicized, sits between equation
      // cards and reads as "what we just did".
      card = el('div', 'cr-ws-board-card cr-ws-board-card--apply');
      card.innerHTML =
        '<span class="cr-ws-board-apply-arrow" aria-hidden="true">↓</span>' +
        '<span class="cr-ws-board-apply-op"></span>';
      card.querySelector('.cr-ws-board-apply-op').textContent = step.op || '';
    } else if (step.type === 'graph') {
      card = el('div', 'cr-ws-board-card cr-ws-board-card--graph');
      var graphHost = el('div', 'cr-ws-board-card-graph');
      card.appendChild(graphHost);
      // Drop a caption whose embedded "y = X" math doesn't match the fn
      // we're about to plot — otherwise the curve and its own label
      // disagree on screen.
      var syncedCaption = step.caption || null;
      if (window.MathmatixGraphTitleSync) {
        syncedCaption = window.MathmatixGraphTitleSync.syncGraphCaption(step.caption, step.fn);
      }
      if (syncedCaption) {
        var graphCap = el('div', 'cr-ws-board-card-caption');
        graphCap.textContent = syncedCaption;
        card.appendChild(graphCap);
      }
      // Defer instantiation until the card is attached; MathGraph reads
      // container dimensions at construction time.
      requestAnimationFrame(function () {
        if (!window.MathGraph) {
          graphHost.textContent = 'Graphing engine still loading.';
          return;
        }
        try {
          new window.MathGraph(graphHost, {
            fn: step.fn,
            animate: true,
            showKeyPoints: false,
            showInfoBar: false
          });
        } catch (e) {
          graphHost.textContent = "Couldn't graph " + step.fn;
        }
      });
    } else if (step.type === 'image') {
      card = el('div', 'cr-ws-board-card cr-ws-board-card--image');
      var imgHost = el('div', 'cr-ws-board-card-image-host');
      imgHost.textContent = 'Loading image…';
      card.appendChild(imgHost);
      if (step.caption) {
        var imgCap = el('div', 'cr-ws-board-card-caption');
        imgCap.textContent = step.caption;
        card.appendChild(imgCap);
      }
      // Hit the existing safe image search; render the first result.
      fetch('/api/images/search?q=' + encodeURIComponent(step.query), {
        credentials: 'same-origin'
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (data) {
          var first = data && data.results && data.results[0];
          if (!first || (!first.thumbnail && !first.url)) {
            imgHost.textContent = 'No image found for "' + step.query + '".';
            return;
          }
          imgHost.innerHTML = '';
          var img = el('img', 'cr-ws-board-card-image-img');
          // Prefer the cached thumbnail (e.g. Google's gstatic copy / Wikimedia
          // thumb): it loads reliably cross-origin, whereas the source `url`
          // frequently hotlink-blocks and renders as a broken-image glyph.
          img.src = first.thumbnail || first.url;
          img.alt = first.title || step.query;
          img.loading = 'lazy';
          // If even the chosen source fails, try the other one, then degrade to
          // text instead of a broken image.
          img.onerror = function () {
            if (first.url && img.src !== first.url) {
              img.onerror = function () { imgHost.textContent = 'Couldn’t load that diagram.'; };
              img.src = first.url;
            } else {
              imgHost.textContent = 'Couldn’t load that diagram.';
            }
          };
          imgHost.appendChild(img);
        })
        .catch(function () {
          imgHost.textContent = 'Image unavailable.';
        });
    } else if (step.type === 'model') {
      // Concept model — an interactive, manipulable model of a math idea
      // (slope-intercept line, two-point line, …). Correct by construction:
      // the student drags something and the relationship holds. Rendered by
      // ConceptModelRenderer (JSXGraph) from a validated ConceptModelSpec.
      // This is a teaching aid, never the student's own worked solution.
      card = el('div', 'cr-ws-board-card cr-ws-board-card--model');
      var modelHost = el('div', 'cr-ws-board-card-model-host');
      card.appendChild(modelHost);
      requestAnimationFrame(function () {
        if (!window.ConceptModelRenderer) {
          modelHost.textContent = 'Concept-model engine still loading.';
          return;
        }
        try {
          window.ConceptModelRenderer.renderModel(modelHost, step.model, { prompt: step.prompt });
        } catch (e) {
          modelHost.textContent = "Couldn't build that model.";
        }
      });
    } else if (step.type === 'scaffold') {
      // Hint card — shows the next step's structure with empty \boxed{}
      // slots the student fills in. Distinct look + an eyebrow so it reads
      // as "your move", not as a finished step. Blanks reveal nothing, so
      // this is the one card allowed on the student's own problem. The blanks
      // are EDITABLE: the student types in them and submits the completed line
      // as their own chat message (buildScaffoldFill). If no blank is found
      // (shouldn't happen — the guard requires one), fall back to a static
      // render so the card still shows.
      card = el('div', 'cr-ws-board-card cr-ws-board-card--scaffold');
      if (!buildScaffoldFill(card, step.tex)) {
        var sMath = el('div', 'cr-ws-board-card-math');
        card.appendChild(sMath);
        renderTex(sMath, widenScaffoldBlanks(step.tex));
      }
    } else if (step.type === 'worked') {
      // Read-only worked-example step — one line of a derivation the tutor is
      // teaching (NOT the student's own problem). A distinct accent + a
      // "Worked example" eyebrow (CSS ::before) so it reads as "I'm showing
      // you", never as the student's stated work. No interaction handlers.
      card = el('div', 'cr-ws-board-card cr-ws-board-card--worked');
      var wMath = el('div', 'cr-ws-board-card-math');
      card.appendChild(wMath);
      renderTex(wMath, step.tex);
      if (step.label) {
        var wCap = el('div', 'cr-ws-board-card-caption');
        wCap.textContent = step.label;
        card.appendChild(wCap);
      }
    } else {
      // Equation card — pose / resolve / verify all share the same shape;
      // verify gets a badge + an expanded check line.
      var variant =
        step.type === 'pose'    ? 'cr-ws-board-card--pose' :
        step.type === 'verify'  ? 'cr-ws-board-card--verify' :
                                  'cr-ws-board-card--resolve';
      card = el('div', 'cr-ws-board-card ' + variant);

      var math = el('div', 'cr-ws-board-card-math');
      card.appendChild(math);
      renderTex(math, step.tex);

      if (step.type === 'verify' && step.check) {
        var checkRow = el('div', 'cr-ws-board-card-check');
        checkRow.innerHTML =
          '<i class="fas fa-check-circle" aria-hidden="true"></i> ' +
          '<span class="cr-ws-board-card-check-math"></span>';
        card.appendChild(checkRow);
        renderTex(checkRow.querySelector('.cr-ws-board-card-check-math'), step.check);
      }
    }

    if (animate) card.classList.add('cr-ws-board-card--enter');
    // Per-card dismiss (×, top-right) — lets the student clear a single card
    // without wiping the whole board. Removes the step from state too.
    var dismiss = el('button', 'cr-ws-board-card-dismiss', '&times;');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Remove this card');
    dismiss.title = 'Remove';
    dismiss.addEventListener('click', function (e) {
      e.stopPropagation();
      dismissCard(card, step);
    });
    card.appendChild(dismiss);
    stack.appendChild(card);
    // Scroll the new card into view (smooth so the eye follows the work).
    try { card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) { /* old browser */ }
    if (animate) {
      // Next frame: remove the enter class to play the transition.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { card.classList.remove('cr-ws-board-card--enter'); });
      });
    }
  }

  // Normalize a math line for comparison: drop whitespace, $ delimiters, braces,
  // and LaTeX spacing macros so "x^2 + 4x + 4 = 12 + 4" matches a resolve card's
  // tex regardless of formatting.
  function normalizeLine(s) {
    return String(s || '')
      .replace(/\\(?:left|right|,|;|:|!|quad|qquad)/g, '')
      .replace(/\\\(|\\\)|\\\[|\\\]/g, '')
      .replace(/[\s${}]/g, '')
      .toLowerCase();
  }

  // In-place verdict for a Checked scaffold card. The tutor reacts to the silent
  // Check with board commands; the FIRST relevant one is the verdict, read
  // structurally (never by parsing prose):
  //   • verify, or a resolve that matches the student's line  → CORRECT (green)
  //   • a fresh scaffold (the tutor re-hints)                 → TRY AGAIN (amber)
  //   • anything else / nothing                               → stays neutral
  // Called from pushBoardStep, the single point every new card flows through.
  function resolvePendingScaffold(step) {
    var p = WS.board.pendingScaffold;
    if (!p || !step) return;
    var verdict = null;
    if (step.type === 'verify') verdict = 'correct';
    else if (step.type === 'resolve' && normalizeLine(step.tex) === p.line) verdict = 'correct';
    else if (step.type === 'scaffold') verdict = 'retry';
    if (verdict) {
      if (p.timer) clearTimeout(p.timer);
      p.settle(verdict);
      WS.board.pendingScaffold = null;
    }
  }

  function pushBoardStep(step) {
    // Settle a pending scaffold Check before this new card lands (the new card IS
    // the tutor's reaction, so the verdict reads off its type).
    resolvePendingScaffold(step);
    WS.board.steps.push(step);
    // If the user is currently looking at a different tab, the cards
    // will materialize when they return — no need to switch them.
    if (WS.current === 'board' && WS.body) {
      var stack = WS.body.querySelector('.cr-ws-board-stack');
      appendStepCard(stack, step, /*animate*/ true);
    }
  }

  // ---- Graph tool (live embed) -----------------------------------------
  function renderGraph(body) {
    var form = el('form', 'cr-ws-graph-form');
    form.innerHTML =
      '<span class="cr-ws-graph-label">f(x) =</span>' +
      '<input class="cr-ws-graph-input" type="text" inputmode="text" ' +
        'placeholder="x^2 - 3" autocomplete="off" spellcheck="false" ' +
        'aria-label="Function to graph" />' +
      '<button class="cr-ws-graph-plot" type="submit">Plot</button>';

    // Caption labels pushed content (e.g. "Example: y = x² − 4"); hidden
    // until a caller sets it. Manual plots clear it.
    var caption = el('div', 'cr-ws-caption');
    caption.style.display = 'none';

    var area = el('div', 'cr-ws-graph-plot-area');
    area.appendChild(el('div', 'cr-ws-empty',
      'Type a function above and press Plot to see it graphed.'));

    body.appendChild(form);
    body.appendChild(caption);
    body.appendChild(area);

    var input = form.querySelector('.cr-ws-graph-input');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var expr = (input.value || '').trim();
      if (!expr) return;
      setGraphCaption(body, null); // a manual plot is the student's own
      drawGraph(area, expr);
    });
  }

  function setGraphCaption(body, text) {
    var cap = body && body.querySelector('.cr-ws-caption');
    if (!cap) return;
    if (text) {
      cap.textContent = text;
      cap.style.display = '';
    } else {
      cap.textContent = '';
      cap.style.display = 'none';
    }
  }

  function drawGraph(area, expr, opts) {
    destroyGraph();
    area.innerHTML = '';

    if (!window.MathGraph) {
      area.appendChild(el('div', 'cr-ws-empty',
        'Graphing engine is still loading — give it a moment and try again.'));
      return;
    }
    // Key points (labeled intercepts/extrema) are appropriate for the student's
    // own exploration but are an answer leak when a tutor pushes a graph of the
    // student's current problem. Default ON for direct exploration; callers that
    // render tutor-driven graphs pass showKeyPoints:false.
    var showKeyPoints = opts && typeof opts.showKeyPoints === 'boolean' ? opts.showKeyPoints : true;
    try {
      WS.graph = new window.MathGraph(area, {
        fn: expr,
        animate: true,
        showKeyPoints: showKeyPoints,
        showInfoBar: true
      });
    } catch (err) {
      area.appendChild(el('div', 'cr-ws-empty',
        "Couldn't graph that one — check the expression and try again."));
    }
  }

  function destroyGraph() {
    if (WS.graph) {
      try { WS.graph.destroy(); } catch (e) { /* already gone */ }
      WS.graph = null;
    }
  }

  // ---- Tool registry ----------------------------------------------------
  // Board is now first — it's the home base. Graph/Tiles/Calc are
  // excursions the tutor can drive into for specific visuals.
  var TOOLS = {
    board: { render: renderBoard, teardown: teardownBoard },
    graph: { render: renderGraph, teardown: destroyGraph },
    tiles: { render: renderLauncher('tiles') },
    calc:  { render: renderLauncher('calc') }
  };

  function switchTool(key) {
    if (!TOOLS[key] || WS.current === key) return;
    var prev = WS.current && TOOLS[WS.current];
    if (prev && prev.teardown) prev.teardown();

    WS.current = key;
    WS.body.innerHTML = '';
    TOOLS[key].render(WS.body);

    WS.el.querySelectorAll('.cr-ws-tab').forEach(function (tab) {
      var on = tab.getAttribute('data-tool') === key;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  // ---- Drawer (mobile) --------------------------------------------------
  // The backdrop is inserted as the drawer's immediate sibling so the two
  // share a single stacking context: the backdrop dims the chat behind it
  // and the drawer sits cleanly on top (see workspace.css z-index pairing).
  //
  // It used to live at the body level to outrank #mpc-topbar, but that put
  // it ABOVE #app-layout-wrapper — which traps the drawer in its own mobile
  // stacking context — so the backdrop ended up painting over the drawer it
  // was meant to sit behind. The topbar is hidden via .cr-ws-drawer-open
  // while the drawer is open, so the body-level placement is no longer needed.
  function ensureBackdrop() {
    if (WS.backdrop) return WS.backdrop;
    var b = el('div', 'cr-ws-backdrop');
    b.setAttribute('aria-hidden', 'true');
    b.addEventListener('click', closeWorkspace);
    // Sibling of the drawer (same parent) so z-index ordering is direct.
    var parent = (WS.el && WS.el.parentNode) || document.body;
    parent.insertBefore(b, WS.el || null);
    WS.backdrop = b;
    return b;
  }
  function openWorkspace() {
    if (!WS.el) return;
    WS.el.classList.add('is-open');
    ensureBackdrop().classList.add('is-open');
    document.body.classList.add('cr-ws-drawer-open');
  }
  function closeWorkspace() {
    if (!WS.el) return;
    WS.el.classList.remove('is-open');
    if (WS.backdrop) WS.backdrop.classList.remove('is-open');
    document.body.classList.remove('cr-ws-drawer-open');
  }

  function buildFab() {
    // Labeled pill, not a mystery circle. Students don't intuit a shapes
    // icon as "math tools"; the explicit "Workspace" word does the work.
    var fab = el('button', 'cr-ws-fab',
      '<i class="fas fa-shapes" aria-hidden="true"></i>' +
      '<span class="cr-ws-fab-label">Workspace</span>');
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Open math workspace');
    fab.addEventListener('click', function () {
      if (WS.el.classList.contains('is-open')) closeWorkspace();
      else openWorkspace();
    });
    document.body.appendChild(fab);
  }

  // ---- Public API: receive a pushed visual -----------------------------
  // See the header note: concept / parallel-problem content only.
  window.MathWorkspace = {
    /** Reveal the panel (opens the drawer on mobile; no-op on desktop). */
    open: function () { openWorkspace(); },

    /** Close the mobile drawer. */
    close: function () { closeWorkspace(); },

    /** Switch to a tab by id ('graph' | 'board' | 'tiles' | 'calc'). */
    showTool: function (id) {
      if (!WS.body || !TOOLS[id]) return false;
      openWorkspace();
      switchTool(id);
      return true;
    },

    /**
     * Plot a function in the Graph tab. This is the tutor/external entry point;
     * key points (labeled intercepts/extrema) are OFF by default here because a
     * labeled graph of the student's own problem leaks the answer. Pass
     * { showKeyPoints: true } to opt in for genuine example/exploration content.
     * @param {string} expr   function of x, e.g. "x^2 - 4"
     * @param {object} [opts] { caption, showKeyPoints } — caption labels
     *                        example/parallel content, e.g. "Example: y = x² − 4"
     * @returns {boolean} whether the graph was shown
     */
    showGraph: function (expr, opts) {
      expr = (expr == null ? '' : String(expr)).trim();
      if (!expr || !WS.body) return false;
      openWorkspace();
      switchTool('graph');
      var area  = WS.body.querySelector('.cr-ws-graph-plot-area');
      var input = WS.body.querySelector('.cr-ws-graph-input');
      if (!area) return false;
      if (input) input.value = expr;
      setGraphCaption(WS.body, opts && opts.caption);
      drawGraph(area, expr, { showKeyPoints: !!(opts && opts.showKeyPoints === true) });
      return true;
    },

    // ---- Board API ------------------------------------------------------
    // Drive the embedded WorkBoard. Each call appends a card to the
    // step stack and (if the Board tab isn't active) keeps the state
    // ready for when the student returns to it. Callers MUST honor the
    // pedagogy rule: only post the starting problem and steps the
    // student has stated.

    /**
     * Render the starting problem as the top card.
     * @param {string} tex  LaTeX expression, e.g. "2x + 4 = 20"
     * @param {object} [opts] reserved for future caption/parallel marks
     */
    boardPose: function (tex, opts) {
      tex = (tex == null ? '' : String(tex)).trim();
      if (!tex) return false;
      openWorkspace();
      // Switching only if the user isn't actively in another tab. For
      // now we DO switch — Board is the natural home and a fresh pose
      // is a new conversation move. Revisit if telemetry shows focus
      // stealing is annoying.
      this.showTool('board');
      pushBoardStep({ type: 'pose', tex: tex, opts: opts || null });
      return true;
    },

    /**
     * Visualize a transformation the student just announced.
     * @param {string} op  human-readable operation, e.g.
     *                     "subtract 4 from both sides"
     */
    boardApply: function (op) {
      op = (op == null ? '' : String(op)).trim();
      if (!op) return false;
      pushBoardStep({ type: 'apply', op: op });
      return true;
    },

    /**
     * Lock the result the student arrived at.
     * @param {string} tex  LaTeX of the resulting equation/expression
     */
    boardResolve: function (tex) {
      tex = (tex == null ? '' : String(tex)).trim();
      if (!tex) return false;
      pushBoardStep({ type: 'resolve', tex: tex });
      return true;
    },

    /**
     * Post a scaffold hint — the next step's structure with empty \boxed{}
     * slots for the student to fill. Unlike resolve, this is NOT a step the
     * student has stated; the blanks are the teaching affordance.
     * @param {string} tex  LaTeX with at least one \boxed{} blank, e.g.
     *                      "x^2 + 4x + \\boxed{} = 12 + \\boxed{}"
     */
    boardScaffold: function (tex) {
      tex = (tex == null ? '' : String(tex)).trim();
      if (!tex) return false;
      openWorkspace();
      this.showTool('board');
      pushBoardStep({ type: 'scaffold', tex: tex });
      return true;
    },

    /**
     * Drop a read-only worked-example step into the board timeline. One line of
     * a derivation the tutor is TEACHING (not the student's own problem); the
     * board renders it with a "Worked example" eyebrow and no interaction.
     * @param {string} tex     LaTeX of the derivation step
     * @param {string} [label] optional short step label, e.g. "Trig substitution"
     */
    boardExample: function (tex, label) {
      tex = (tex == null ? '' : String(tex)).trim();
      if (!tex) return false;
      openWorkspace();
      this.showTool('board');
      var step = { type: 'worked', tex: tex };
      if (label) step.label = String(label).trim();
      pushBoardStep(step);
      return true;
    },

    /**
     * Confirm a verified solution the student proved.
     * @param {string} tex    LaTeX of the solution, e.g. "x = 8"
     * @param {string} check  LaTeX of the verification, e.g. "2(8) + 4 = 20"
     */
    boardVerify: function (tex, check) {
      tex = (tex == null ? '' : String(tex)).trim();
      if (!tex) return false;
      pushBoardStep({
        type: 'verify',
        tex: tex,
        check: check == null ? '' : String(check).trim()
      });
      return true;
    },

    /**
     * Drop a graph card into the board timeline.
     * @param {string} fn       function of x, e.g. "x^2 - 4"
     * @param {string} [caption] short label rendered under the graph
     */
    boardGraph: function (fn, caption) {
      fn = (fn == null ? '' : String(fn)).trim();
      if (!fn) return false;
      openWorkspace();
      this.showTool('board');
      var step = { type: 'graph', fn: fn };
      if (caption) step.caption = String(caption).trim();
      pushBoardStep(step);
      return true;
    },

    /**
     * Drop an image card into the board timeline. Hits the existing
     * safe-image-search endpoint; the first whitelisted result renders.
     * @param {string} query    educational image query
     * @param {string} [caption] short label rendered under the image
     */
    boardImage: function (query, caption) {
      query = (query == null ? '' : String(query)).trim();
      if (!query) return false;
      openWorkspace();
      this.showTool('board');
      var step = { type: 'image', query: query };
      if (caption) step.caption = String(caption).trim();
      pushBoardStep(step);
      return true;
    },

    /**
     * Drop an interactive concept model onto the board (slope-intercept line,
     * two-point line, …). The student manipulates it and the relationship holds,
     * correct by construction (see CONCEPT_MODELS.md). A teaching aid, summoned
     * with intent — the optional prompt frames WHY it appeared ("slide m up —
     * what happens?").
     * @param {string|object} model    curated model name OR a full validated spec
     * @param {string} [prompt]        teaching intention shown above the model
     */
    boardModel: function (model, prompt) {
      // Accept either (model, prompt) or a command object { model, prompt, spec }.
      // A generated command carries `spec` (a full, already-validated spec object
      // from the long-tail path); it wins over the curated `model` name. The
      // renderer takes a curated name OR a spec object, so either flows straight
      // through.
      if (model && typeof model === 'object' && model.action) {
        prompt = model.prompt;
        model = model.spec || model.model;
      }
      if (!model) return false;
      openWorkspace();
      this.showTool('board');
      var step = { type: 'model', model: model };
      if (prompt) step.prompt = String(prompt).trim();
      pushBoardStep(step);
      return true;
    },

    /** Wipe the board to a clean slate (e.g. new problem). */
    boardClear: function () {
      WS.board.steps = [];
      if (WS.current === 'board' && WS.body) {
        // Re-render from now-empty state to bring the placeholder back.
        WS.body.innerHTML = '';
        TOOLS.board.render(WS.body);
      }
      return true;
    }
  };

  // ---- Boot -------------------------------------------------------------
  function init() {
    WS.el = document.getElementById('cr-workspace');
    WS.body = document.getElementById('cr-ws-body');
    if (!WS.el || !WS.body) return;

    WS.el.querySelectorAll('.cr-ws-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        switchTool(tab.getAttribute('data-tool'));
      });
    });

    var closeBtn = WS.el.querySelector('.cr-ws-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeWorkspace);
    }

    buildFab();
    // Board is the home base. Graph/Tiles/Calc are excursions the tutor
    // (or the student) can drive into via tabs or the public API.
    switchTool('board');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

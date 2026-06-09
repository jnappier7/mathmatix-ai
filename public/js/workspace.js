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
  function renderBoard(body) {
    var head = el('div', 'cr-ws-board-head');
    head.innerHTML =
      '<h4 class="cr-ws-board-title"><i class="fas fa-pen" aria-hidden="true"></i> Work Board</h4>' +
      '<button type="button" class="cr-ws-board-clear" aria-label="Clear board">' +
        '<i class="fas fa-eraser" aria-hidden="true"></i></button>';
    body.appendChild(head);

    var stack = el('div', 'cr-ws-board-stack');
    body.appendChild(stack);

    var empty = el('div', 'cr-ws-empty cr-ws-board-empty',
      '<div class="cr-ws-board-empty-ico" aria-hidden="true">' +
        '<i class="fas fa-pen-ruler"></i></div>' +
      '<h5 class="cr-ws-board-empty-title">Ready to work it out?</h5>' +
      '<p class="cr-ws-board-empty-body">' +
        'Your steps will land here as you and your tutor work through ' +
        'the problem together.</p>');
    if (WS.board.steps.length === 0) stack.appendChild(empty);

    // Rebuild any persisted steps (e.g. when re-entering the tab).
    WS.board.steps.forEach(function (step) { appendStepCard(stack, step, /*animate*/ false); });

    head.querySelector('.cr-ws-board-clear').addEventListener('click', function () {
      WS.board.steps = [];
      var s = WS.body && WS.body.querySelector('.cr-ws-board-stack');
      if (s) s.innerHTML = '';
      if (s) s.appendChild(empty.cloneNode(true));
    });
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
    } else if (step.type === 'scaffold') {
      // Hint card — shows the next step's structure with empty \boxed{}
      // slots the student fills in. Distinct look + an eyebrow so it reads
      // as "your move", not as a finished step. Blanks reveal nothing, so
      // this is the one card allowed on the student's own problem.
      card = el('div', 'cr-ws-board-card cr-ws-board-card--scaffold');
      var sMath = el('div', 'cr-ws-board-card-math');
      card.appendChild(sMath);
      renderTex(sMath, widenScaffoldBlanks(step.tex));
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

  function pushBoardStep(step) {
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

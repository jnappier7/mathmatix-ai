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

  var WS = { el: null, body: null, current: null, graph: null };

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  // ---- Launcher tools (open an existing floating surface) --------------
  var LAUNCHERS = {
    board: {
      icon: 'fa-pen',
      title: 'Scratchpad',
      blurb: 'A resizable board for working problems by hand — drawing, handwriting and step-by-step layout.',
      btn: 'Open scratchpad',
      open: function () { if (window.whiteboard && window.whiteboard.show) window.whiteboard.show(); }
    },
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
        WS.el.classList.remove('is-open');
        try { L.open(); } catch (e) { /* tool not ready yet */ }
      });
      card.appendChild(btn);
      body.appendChild(card);
    };
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

  function drawGraph(area, expr) {
    destroyGraph();
    area.innerHTML = '';

    if (!window.MathGraph) {
      area.appendChild(el('div', 'cr-ws-empty',
        'Graphing engine is still loading — give it a moment and try again.'));
      return;
    }
    try {
      WS.graph = new window.MathGraph(area, {
        fn: expr,
        animate: true,
        showKeyPoints: true,
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
  var TOOLS = {
    graph: { render: renderGraph, teardown: destroyGraph },
    board: { render: renderLauncher('board') },
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
  function openWorkspace()  { if (WS.el) WS.el.classList.add('is-open'); }
  function closeWorkspace() { if (WS.el) WS.el.classList.remove('is-open'); }

  function buildFab() {
    var fab = el('button', 'cr-ws-fab',
      '<i class="fas fa-shapes" aria-hidden="true"></i>');
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Toggle math workspace');
    fab.addEventListener('click', function () {
      WS.el.classList.toggle('is-open');
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
     * Plot a function in the Graph tab.
     * @param {string} expr   function of x, e.g. "x^2 - 4"
     * @param {object} [opts] { caption } — a label for example/parallel
     *                        content, e.g. "Example: y = x² − 4"
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
      drawGraph(area, expr);
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
    switchTool('graph');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

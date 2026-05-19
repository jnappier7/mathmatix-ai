/* ============================================================
   workspace.js — interactive math workspace (chat right slot)

   A tabbed panel that lives in the chat's right column.
   - "Graph" embeds a live MathGraph instance the student drives.
   - "Board" / "Tiles" / "Calc" launch the existing floating tools
     (whiteboard, algebra tiles, calculator) — a 320px panel is too
     narrow for them, so they pop out to their own surfaces.

   Built as a small registry so more tools can be added as tabs,
   and so the whole panel can later be re-mounted into the centre
   slot for voice mode.
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

    var area = el('div', 'cr-ws-graph-plot-area');
    area.appendChild(el('div', 'cr-ws-empty',
      'Type a function above and press Plot to see it graphed.'));

    body.appendChild(form);
    body.appendChild(area);

    var input = form.querySelector('.cr-ws-graph-input');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var expr = (input.value || '').trim();
      if (expr) drawGraph(area, expr);
    });
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

  // ---- Mobile drawer toggle --------------------------------------------
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
      closeBtn.addEventListener('click', function () {
        WS.el.classList.remove('is-open');
      });
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

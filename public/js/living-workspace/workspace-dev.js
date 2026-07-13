/* Dev harness driver for the Living Workspace shell. Not shipped —
   exercises mount/unmount, add/edit/reposition, snapshot save+restore,
   and lets us eyeball pan/zoom drift in a plain static page. */
(function () {
  'use strict';
  // Force the flag on for the harness (default is 'off').
  window.MM_FEATURES = Object.assign({}, window.MM_FEATURES, { livingWorkspace: 'dev' });

  var LWS = window.LWS;
  var mountpoint = document.getElementById('mountpoint');
  var statusEl = document.getElementById('status');
  var shell = null;
  var savedSnapshot = null;
  var counter = 0;

  function setStatus(t) { statusEl.textContent = t; }

  // expose for browser-based verification/debugging
  window.__lws = { get shell() { return shell; }, addEquation: function (l, x, y) { return addEquation(l, x, y); } };

  function makeShell() {
    return new LWS.Shell({
      world: { width: 2400, height: 1600 },
      registerRenderers: function (overlayMgr, sh) {
        overlayMgr.registerRenderer('equation', LWS.EquationElement.makeRenderer({
          onEditCommit: function (id, latex) {
            sh.updateElement(id, { semantic: { latex: latex, plain: latex } });
            setStatus('edited ' + id + ' → ' + latex);
          },
        }));
      },
      onChange: function () { setStatus('changed — ' + (shell.registry.size) + ' elements'); },
    });
  }

  function addEquation(latex, x, y) {
    counter += 1;
    var id = 'eq-' + counter;
    shell.addElement({
      id: id, type: 'equation',
      position: { x: x != null ? x : 200 + counter * 40, y: y != null ? y : 180 + counter * 30 },
      semantic: { latex: latex || '2x + 3x = 5x', plain: latex || '2x + 3x = 5x' },
    });
    return id;
  }

  document.getElementById('btn-mount').addEventListener('click', function () {
    if (shell && shell.mounted) return;
    shell = makeShell();
    shell.mount(mountpoint);
    if (shell.registry.size === 0) addEquation('2x + 3x = 5x', 260, 220);
    setStatus('mounted (mode=' + shell.mode + ')');
  });

  document.getElementById('btn-unmount').addEventListener('click', function () {
    if (!shell || !shell.mounted) return;
    var boundBefore = shell.interaction ? shell.interaction._bound.length : 0;
    shell.unmount();
    var boundAfter = shell.interaction ? shell.interaction._bound.length : 0;
    setStatus('unmounted — listeners ' + boundBefore + '→' + boundAfter + ', children=' + mountpoint.childElementCount);
  });

  document.getElementById('btn-add').addEventListener('click', function () {
    if (!shell || !shell.mounted) return;
    addEquation(['x^2 - 4', '\\frac{a}{b}', 'y = mx + b', '3x + 5 = 20'][counter % 4]);
  });

  document.getElementById('btn-provisional').addEventListener('click', function () {
    if (!shell || !shell.mounted) return;
    var first = shell.registry.list()[0];
    if (first) shell.updateElement(first.id, { provisional: !first.provisional });
  });

  document.getElementById('btn-reset').addEventListener('click', function () {
    if (!shell || !shell.mounted) return;
    shell.viewport.reset(); shell.requestPaint();
    setStatus('view reset');
  });

  document.getElementById('btn-save').addEventListener('click', function () {
    if (!shell || !shell.mounted) return;
    savedSnapshot = JSON.stringify(shell.snapshot({ savedAt: 'dev' }));
    setStatus('snapshot saved (' + savedSnapshot.length + ' bytes)');
  });

  document.getElementById('btn-restore').addEventListener('click', function () {
    if (!shell || !shell.mounted || !savedSnapshot) { setStatus('no snapshot yet'); return; }
    // Simulate a fresh reload: unmount, re-mount, restore.
    shell.unmount();
    shell = makeShell();
    shell.mount(mountpoint);
    var res = shell.restore(savedSnapshot);
    setStatus('restored ' + res.restored + ' elements (skipped ' + res.skipped + ')');
  });

  document.getElementById('btn-listeners').addEventListener('click', function () {
    var n = shell && shell.interaction ? shell.interaction._bound.length : 0;
    setStatus('interaction listeners bound: ' + n + '; mounted=' + (shell && shell.mounted));
  });

  // Auto-mount on load for convenience.
  window.addEventListener('DOMContentLoaded', function () {
    shell = makeShell();
    shell.mount(mountpoint);
    addEquation('2x + 3x = 5x', 260, 220);
    setStatus('auto-mounted (mode=' + shell.mode + ')');
  });
})();

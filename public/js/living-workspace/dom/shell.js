/* ============================================================
   shell.js — the Living Workspace orchestration shell (spec §P3).

   "One surface ≠ one class." The Shell owns no math and no rendering
   detail; it composes the independent systems and manages lifecycle:
     Viewport · GridRenderer · OverlayManager · ElementRegistry ·
     InteractionController · SnapshotManager · a11y · (LayoutController
     = the ResizeObserver here).

   Lifecycle contract (P3 DoD):
     mount(container) → builds DOM, wires everything, first paint.
     unmount()        → tears down EVERY listener/observer/rAF so it
                        leaves no leaks and doesn't touch chat/board.
   Redraws are coalesced into one rAF (pan/zoom stay at frame rate).

   Gated by the LIVING_WORKSPACE flag — mount() is a no-op when off.

   Browser-only. Global: window.LWS.Shell.
   ============================================================ */
(function (root) {
  'use strict';
  const LWS = (root.LWS = root.LWS || {});
  const { Viewport, ElementRegistry, SnapshotManager, GridRenderer, OverlayManager, InteractionController, a11y, flags } = LWS;

  class Shell {
    constructor(opts = {}) {
      this.opts = opts;
      this.mode = flags ? flags.resolveMode(opts.env) : 'off';
      this.mounted = false;
      this._rafId = 0;
      this._needsPaint = false;
      this._ro = null;   // ResizeObserver (LayoutController)
      this._nodes = {};
      this.registry = new ElementRegistry();
      this.viewport = new Viewport({ world: opts.world });
    }

    mount(container) {
      if (this.mounted) return this;
      if (this.mode === 'off') return this; // flag gate: never mount when off
      const doc = document;

      const rootEl = doc.createElement('div');
      rootEl.className = 'lws-root';
      rootEl.setAttribute('data-mode', this.mode);

      // grid canvas (bottom) + overlay layer (top) + a11y live region
      const canvas = doc.createElement('canvas');
      canvas.className = 'lws-grid';
      const overlay = doc.createElement('div');
      overlay.className = 'lws-overlay';
      const live = doc.createElement('div');
      live.className = 'lws-sr-only';
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('role', 'status');

      // focusable surface for keyboard input + touch-action gate
      rootEl.tabIndex = 0;
      rootEl.setAttribute('role', 'application');
      rootEl.setAttribute('aria-label', 'Math workspace');
      rootEl.style.touchAction = 'none';

      rootEl.appendChild(canvas);
      rootEl.appendChild(overlay);
      rootEl.appendChild(live);
      container.appendChild(rootEl);
      this._nodes = { container, rootEl, canvas, overlay, live };

      // compose systems
      this.grid = new GridRenderer(canvas, this.viewport, this.opts.grid);
      this.overlayMgr = new OverlayManager(overlay, this.viewport);
      if (typeof this.opts.registerRenderers === 'function') this.opts.registerRenderers(this.overlayMgr, this);

      this._unsub = this.registry.subscribe((evt) => {
        this.overlayMgr.onRegistryEvent(evt);
        this.requestPaint();
        this._announce(a11y ? a11y.describeWorkspace(this.registry, this.viewport) : '');
      });

      this.interaction = new InteractionController(rootEl, this.viewport, {
        onViewportChange: () => this.requestPaint(),
        onElementMove: (id, x, y) => this.registry.move(id, x, y),
        onElementMoveEnd: () => this._emitChange(),
        getElementPos: (id) => { const el = this.registry.get(id); return el ? el.position : null; },
      });

      // LayoutController: keep canvas + viewport sized to the container.
      this._resize();
      if (typeof ResizeObserver !== 'undefined') {
        this._ro = new ResizeObserver(() => this._resize());
        this._ro.observe(rootEl);
      } else {
        this._onWinResize = () => this._resize();
        root.addEventListener('resize', this._onWinResize);
      }

      this.mounted = true;
      this.requestPaint();
      return this;
    }

    _resize() {
      const r = this._nodes.rootEl.getBoundingClientRect();
      const w = Math.max(1, r.width), h = Math.max(1, r.height);
      this.viewport.resize(w, h);
      this.grid.resize(w, h, root.devicePixelRatio);
      this.overlayMgr.syncTransforms();
      this.requestPaint();
    }

    // Coalesce paints into one rAF — pan/zoom never draw more than once/frame.
    requestPaint() {
      if (!this.mounted) return;
      this._needsPaint = true;
      if (this._rafId) return;
      const raf = root.requestAnimationFrame || ((fn) => root.setTimeout(fn, 16));
      this._rafId = raf(() => {
        this._rafId = 0;
        if (!this._needsPaint || !this.mounted) return;
        this._needsPaint = false;
        this.grid.draw();
        this.overlayMgr.syncTransforms();
      });
    }

    _announce(text) {
      if (this._nodes.live && text) this._nodes.live.textContent = text;
    }
    _emitChange() {
      if (typeof this.opts.onChange === 'function') this.opts.onChange(this.snapshot());
    }

    // ── element API (thin pass-throughs so callers don't reach into the registry) ──
    addElement(el) { return this.registry.add(el); }
    updateElement(id, patch) { return this.registry.update(id, patch); }
    removeElement(id) { return this.registry.remove(id); }

    // ── snapshot / resume ──
    snapshot(meta) { return SnapshotManager.capture(this.registry, this.viewport, meta); }
    restore(snapshot) {
      const res = SnapshotManager.restore(SnapshotManager.safeParse(snapshot) || snapshot, this.registry, this.viewport);
      this.requestPaint();
      return res;
    }

    unmount() {
      if (!this.mounted) return this;
      if (this._rafId) { (root.cancelAnimationFrame || root.clearTimeout)(this._rafId); this._rafId = 0; }
      if (this.interaction) this.interaction.destroy();
      if (this._unsub) this._unsub();
      if (this.overlayMgr) this.overlayMgr.clear();
      if (this._ro) { this._ro.disconnect(); this._ro = null; }
      if (this._onWinResize) { root.removeEventListener('resize', this._onWinResize); this._onWinResize = null; }
      if (this._nodes.rootEl && this._nodes.rootEl.parentNode) {
        this._nodes.rootEl.parentNode.removeChild(this._nodes.rootEl);
      }
      this._nodes = {};
      this.mounted = false;
      return this;
    }
  }

  LWS.Shell = Shell;
})(typeof self !== 'undefined' ? self : this);

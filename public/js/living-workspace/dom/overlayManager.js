/* ============================================================
   overlayManager.js — DOM overlay synced to canvas coords (resolves
   B4a: crisp math as DOM, positioned over the Fabric/canvas world).

   Each WorkspaceElement gets a host <div> in an absolutely-positioned
   overlay layer above the grid canvas. The host's CSS transform is
   `translate(screenX,screenY) scale(viewScale)` with transform-origin
   top-left, so it tracks the viewport on pan/zoom with NO reflow and
   NO drift — the same transform math the grid uses, so DOM and canvas
   never disagree.

   Element rendering is pluggable: register a renderer factory per
   element type. A renderer returns { node, update(el), destroy(),
   describe() } — OverlayManager knows nothing about equations vs
   tiles. This is the one mechanism P6 tiles will reuse.

   syncTransforms() (viewport changed) only rewrites transforms — it
   never re-renders content, so pan/zoom stays cheap.

   Browser-only. Global: window.LWS.OverlayManager.
   ============================================================ */
(function (root) {
  'use strict';
  const LWS = (root.LWS = root.LWS || {});

  class OverlayManager {
    constructor(layerEl, viewport) {
      this.layer = layerEl;         // the absolutely-positioned overlay div
      this.viewport = viewport;
      this._renderers = new Map();  // type → factory(element, api) → renderer
      this._hosts = new Map();      // elementId → { host, renderer, element }
    }

    registerRenderer(type, factory) {
      this._renderers.set(type, factory);
      return this;
    }

    // ── registry event handler ──
    // Wire this to ElementRegistry.subscribe.
    onRegistryEvent(evt) {
      if (!evt) return;
      switch (evt.type) {
        case 'add': this.addElement(evt.element); break;
        case 'update': this.updateElement(evt.element); break;
        case 'remove': this.removeElement(evt.element && evt.element.id); break;
        case 'clear': this.clear(); break;
        default: break;
      }
    }

    addElement(element) {
      if (!element || this._hosts.has(element.id)) {
        if (element && this._hosts.has(element.id)) return this.updateElement(element);
        return null;
      }
      const factory = this._renderers.get(element.type);
      const host = (typeof document !== 'undefined') ? document.createElement('div') : null;
      if (host) {
        host.className = 'lws-el';
        host.dataset.elementId = element.id;
        host.style.position = 'absolute';
        host.style.left = '0';
        host.style.top = '0';
        host.style.transformOrigin = 'top left';
        host.style.willChange = 'transform';
      }
      let renderer = null;
      if (factory && host) {
        renderer = factory(element, { host, viewport: this.viewport });
        if (renderer && renderer.node) host.appendChild(renderer.node);
      } else if (host) {
        // Unknown type — render a labelled placeholder so nothing silently vanishes.
        host.textContent = `[${element.type}]`;
      }
      const entry = { host, renderer, element };
      this._hosts.set(element.id, entry);
      if (host && this.layer) this.layer.appendChild(host);
      this._applyTransform(entry);
      this._applyZ(entry);
      return entry;
    }

    updateElement(element) {
      const entry = this._hosts.get(element.id);
      if (!entry) return this.addElement(element);
      entry.element = element;
      if (entry.renderer && typeof entry.renderer.update === 'function') {
        entry.renderer.update(element);
      }
      if (entry.host) {
        entry.host.classList.toggle('is-provisional', !!element.provisional);
      }
      this._applyTransform(entry);
      this._applyZ(entry);
      return entry;
    }

    removeElement(id) {
      const entry = this._hosts.get(id);
      if (!entry) return false;
      if (entry.renderer && typeof entry.renderer.destroy === 'function') {
        try { entry.renderer.destroy(); } catch (_) { /* isolate */ }
      }
      if (entry.host && entry.host.parentNode) entry.host.parentNode.removeChild(entry.host);
      this._hosts.delete(id);
      return true;
    }

    clear() {
      for (const id of [...this._hosts.keys()]) this.removeElement(id);
    }

    // Only rewrites transforms — call on every viewport change (cheap).
    syncTransforms() {
      for (const entry of this._hosts.values()) this._applyTransform(entry);
    }

    // aria/screen-reader description of everything on the overlay.
    describeAll() {
      const out = [];
      for (const entry of this._hosts.values()) {
        if (entry.renderer && typeof entry.renderer.describe === 'function') {
          out.push(entry.renderer.describe());
        }
      }
      return out;
    }

    _applyTransform(entry) {
      if (!entry.host) return;
      const p = entry.element.position || { x: 0, y: 0 };
      entry.host.style.transform = this.viewport.cssTransform(p.x, p.y);
    }
    _applyZ(entry) {
      if (entry.host && entry.element.z != null) entry.host.style.zIndex = String(entry.element.z);
    }
  }

  LWS.OverlayManager = OverlayManager;
})(typeof self !== 'undefined' ? self : this);

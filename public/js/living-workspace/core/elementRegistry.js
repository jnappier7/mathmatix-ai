/* ============================================================
   elementRegistry.js — the source of truth for what's on the canvas.

   Pure/no-DOM. Holds WorkspaceElement records (spec §3.2 base
   envelope: id, type, position, size?, z, semantic, provisional).
   The Shell renders FROM the registry; the SnapshotManager serializes
   IT. Nothing renders an element the registry doesn't know about.

   It is deliberately dumb about geometry and rendering — it stores
   records and emits change events. Element-specific semantics live in
   each element's own engine (e.g. the P2 algebra-tile engine).

   UMD-lite (jest + browser global LWS.ElementRegistry).
   ============================================================ */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else { (root.LWS = root.LWS || {}).ElementRegistry = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function isObj(o) { return o && typeof o === 'object'; }

  class ElementRegistry {
    constructor() {
      this._elements = new Map();   // id → element record
      this._listeners = new Set();  // change subscribers
      this._z = 0;                  // monotonically increasing z-order
    }

    // ── subscription ──
    subscribe(fn) {
      if (typeof fn !== 'function') return function () {};
      this._listeners.add(fn);
      return () => this._listeners.delete(fn);
    }
    _emit(type, element) {
      for (const fn of this._listeners) {
        try { fn({ type, element, registry: this }); } catch (_) { /* isolate a bad listener */ }
      }
    }

    // ── mutations ──
    add(el) {
      if (!isObj(el) || typeof el.id !== 'string' || !el.id) {
        throw new Error('ElementRegistry.add: element needs a string id');
      }
      if (this._elements.has(el.id)) {
        throw new Error(`ElementRegistry.add: duplicate id "${el.id}"`);
      }
      const record = Object.assign({
        z: ++this._z,
        position: { x: 0, y: 0 },
        provisional: false,
      }, el);
      this._elements.set(el.id, record);
      this._emit('add', record);
      return record;
    }

    update(id, patch) {
      const el = this._elements.get(id);
      if (!el) return null;
      // shallow-merge, but merge position/size objects so callers can patch x only
      const next = Object.assign({}, el, patch);
      if (patch && patch.position) next.position = Object.assign({}, el.position, patch.position);
      if (patch && patch.size) next.size = Object.assign({}, el.size, patch.size);
      this._elements.set(id, next);
      this._emit('update', next);
      return next;
    }

    move(id, x, y) { return this.update(id, { position: { x, y } }); }

    setProvisional(id, provisional) { return this.update(id, { provisional: !!provisional }); }

    bringToFront(id) {
      const el = this._elements.get(id);
      if (!el) return null;
      return this.update(id, { z: ++this._z });
    }

    remove(id) {
      const el = this._elements.get(id);
      if (!el) return false;
      this._elements.delete(id);
      this._emit('remove', el);
      return true;
    }

    clear() {
      const had = this._elements.size > 0;
      this._elements.clear();
      if (had) this._emit('clear', null);
      return this;
    }

    // ── reads ──
    get(id) { return this._elements.get(id) || null; }
    has(id) { return this._elements.has(id); }
    get size() { return this._elements.size; }
    // z-ordered list (stable): ascending z, so later items paint on top
    list() {
      return [...this._elements.values()].sort((a, b) => (a.z || 0) - (b.z || 0));
    }
  }

  return ElementRegistry;
});

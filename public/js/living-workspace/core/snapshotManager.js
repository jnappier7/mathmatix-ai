/* ============================================================
   snapshotManager.js — semantic (never pixel) serialization.

   Pure/no-DOM. Turns the ElementRegistry + Viewport into a
   WorkspaceSnapshot and restores from one (spec §3.8). Persist
   elements/positions/progress + view state — NEVER canvas JSON /
   pixel geometry (stale on render changes). This is what makes
   resume "for free": the registry already holds serializable
   records, so a snapshot is just a collect + a restore is an apply.

   Corrupt-snapshot safety (§3.8 DoD): restore RECOVERS — bad element
   records are skipped, a garbage payload yields an empty workspace,
   and it never throws into the caller.

   UMD-lite (jest + browser global LWS.SnapshotManager).
   ============================================================ */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else { (root.LWS = root.LWS || {}).SnapshotManager = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SNAPSHOT_VERSION = 1;

  function isObj(o) { return o && typeof o === 'object'; }
  function isValidElement(el) {
    return isObj(el)
      && typeof el.id === 'string' && el.id.length > 0
      && typeof el.type === 'string' && el.type.length > 0
      && isObj(el.position)
      && Number.isFinite(el.position.x) && Number.isFinite(el.position.y)
      && isObj(el.semantic);
  }

  const SnapshotManager = {
    SNAPSHOT_VERSION,

    // Collect a serializable snapshot from live state.
    capture(registry, viewport, meta) {
      return {
        schemaVersion: SNAPSHOT_VERSION,
        view: viewport && typeof viewport.toJSON === 'function' ? viewport.toJSON() : null,
        elements: registry.list().map((el) => ({
          id: el.id,
          type: el.type,
          position: { x: el.position.x, y: el.position.y },
          size: el.size ? { width: el.size.width, height: el.size.height } : undefined,
          z: el.z,
          provisional: !!el.provisional,
          semantic: el.semantic,
        })),
        meta: meta || null,
      };
    },

    // Restore into a (cleared) registry + viewport. Recovers from corruption.
    // Returns { restored, skipped } counts so the caller can surface a
    // "some of your work couldn't be restored" notice if it wants.
    restore(snapshot, registry, viewport) {
      const result = { restored: 0, skipped: 0, recovered: false };
      registry.clear();

      if (!isObj(snapshot)) { result.recovered = snapshot != null; return result; }

      if (viewport && isObj(snapshot.view)) {
        try { viewport.applyJSON(snapshot.view); } catch (_) { result.recovered = true; }
      }

      const els = Array.isArray(snapshot.elements) ? snapshot.elements : [];
      if (!Array.isArray(snapshot.elements) && snapshot.elements != null) result.recovered = true;

      // Preserve authored z-order; fall back to array order.
      const ordered = els.slice().sort((a, b) => ((a && a.z) || 0) - ((b && b.z) || 0));
      const seen = new Set();
      for (const el of ordered) {
        if (!isValidElement(el) || seen.has(el.id)) { result.skipped++; result.recovered = true; continue; }
        seen.add(el.id);
        try {
          registry.add({
            id: el.id,
            type: el.type,
            position: { x: el.position.x, y: el.position.y },
            size: el.size,
            provisional: !!el.provisional,
            semantic: el.semantic,
          });
          result.restored++;
        } catch (_) { result.skipped++; result.recovered = true; }
      }
      return result;
    },

    // Guarded parse for a snapshot that arrived as a JSON string / untrusted blob.
    safeParse(raw) {
      if (isObj(raw)) return raw;
      if (typeof raw !== 'string') return null;
      try { return JSON.parse(raw); } catch (_) { return null; }
    },
  };

  return SnapshotManager;
});

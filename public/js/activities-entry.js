/**
 * activities-entry.js — reveal the chat sidebar's "Assignments" link only when
 * the student actually has Class Activities assigned. Most students have no
 * teacher, so the link stays hidden unless /api/activities/mine returns
 * something. Deliberately a standalone deferred script: it isn't part of the
 * chat bundle, so editing it needs no `npm run build:bundles`.
 */
(function () {
  'use strict';
  const link = document.getElementById('sidebar-activities-btn') || document.createElement('a');
  // Re-checked right after the student joins a class (js/join-class.js), so
  // that class's assignments appear without a reload.
  document.addEventListener('mm:class-joined', refresh);
  refresh();
  function refresh() {
  fetch('/api/activities/mine', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const list = data && Array.isArray(data.assignments) ? data.assignments : [];
      const tests = data && Array.isArray(data.practiceTests) ? data.practiceTests : [];
      if (!list.length && !tests.length) return;
      const open = list.filter((a) => a.itemsSolved < a.itemsTotal).length
        + tests.filter((t) => t.status !== 'done').length;
      const badge = document.getElementById('sidebar-activities-count');
      if (badge && open) { badge.textContent = String(open); badge.style.display = ''; }
      link.style.display = '';
      // The redesigned chat hides that sidebar; the More menu is where students look.
      const more = document.getElementById('more-assignments');
      if (more) {
        more.style.display = '';
        const mb = document.getElementById('more-assignments-count');
        if (mb && open) { mb.textContent = String(open); mb.style.display = ''; }
      }
    })
    .catch(() => { /* no link is the right failure mode */ });
  }
})();

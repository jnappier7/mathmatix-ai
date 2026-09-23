/**
 * activities-entry.js — reveal the chat sidebar's "Assignments" link only when
 * the student actually has Class Activities assigned. Most students have no
 * teacher, so the link stays hidden unless /api/activities/mine returns
 * something. Deliberately a standalone deferred script: it isn't part of the
 * chat bundle, so editing it needs no `npm run build:bundles`.
 */
(function () {
  'use strict';
  const link = document.getElementById('sidebar-activities-btn');
  if (!link) return;
  fetch('/api/activities/mine', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const list = data && Array.isArray(data.assignments) ? data.assignments : [];
      if (!list.length) return;
      const open = list.filter((a) => a.itemsSolved < a.itemsTotal).length;
      const badge = document.getElementById('sidebar-activities-count');
      if (badge && open) { badge.textContent = String(open); badge.style.display = ''; }
      link.style.display = '';
    })
    .catch(() => { /* no link is the right failure mode */ });
})();

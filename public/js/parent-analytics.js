/**
 * parent-analytics.js — Fetches and renders learning analytics in parent child cards.
 * Called after each child card is rendered with fetchChildAnalytics(childId).
 */
(function () {
  'use strict';

  // Exposed globally so parent-dashboard.js can call it
  window.fetchChildAnalytics = async function (childId) {
    if (!window.AnalyticsCharts) return;

    try {
      const [memRes, strengthRes] = await Promise.all([
        fetch(`/api/analytics/child/${childId}/memory-health`, { credentials: 'include' }),
        fetch(`/api/analytics/child/${childId}/strength-map`, { credentials: 'include' }),
      ]);

      // Memory Health Bar
      if (memRes.ok) {
        const data = await memRes.json();
        const containerId = `memory-health-${childId}`;
        const container = document.getElementById(containerId);
        if (container && data.totalSkills > 0) {
          window.AnalyticsCharts.createMemoryHealthBar(containerId, data);
          // Memory only covers practiced skills with review data — say so, so
          // "1 fading" isn't read against the whole skill count above it.
          const n = data.totalSkills;
          const caption = document.createElement('p');
          caption.style.cssText = 'font-size:0.75em; color:#666; margin:0 0 6px;';
          caption.textContent = `Memory check on ${n} practiced skill${n === 1 ? '' : 's'}`;
          container.prepend(caption);
          container.setAttribute('role', 'img');
          container.setAttribute('aria-label',
            `Memory check on ${n} practiced skill${n === 1 ? '' : 's'}: ${data.strong} strong, ${data.fading} fading, ${data.needsReview} need review`);
        } else if (container) {
          container.innerHTML = '<p style="font-size:0.8em; color:#666;">No memory data yet — it builds as your child practices.</p>';
        }
      }

      // Strength Map Donut
      if (strengthRes.ok) {
        const data = await strengthRes.json();
        const canvasId = `strength-map-${childId}`;
        const canvas = document.getElementById(canvasId);
        const cats = data.categories || [];
        const practiced = cats.reduce((n, c) => n + (c.totalSkills || 0), 0);
        // A donut of one or two skills is a full circle that says nothing; under
        // MIN_FOR_CHART practiced skills, list the categories in words instead.
        const MIN_FOR_CHART = 5;
        if (practiced >= MIN_FOR_CHART) {
          window.AnalyticsCharts.createStrengthDonut(canvasId, data);
          if (canvas) {
            canvas.setAttribute('role', 'img');
            canvas.setAttribute('aria-label', 'Practiced skills by area: ' + cats.map(c => `${c.name} ${c.mastered} of ${c.totalSkills} mastered`).join('; '));
          }
        } else if (canvas) {
          canvas.style.display = 'none';
          const msg = document.createElement('p');
          msg.style.cssText = 'font-size:0.8em; color:#666; text-align:center; padding:10px;';
          msg.textContent = practiced > 0
            ? 'Practicing: ' + cats.map(c => c.name + (c.totalSkills > 1 ? ` (${c.totalSkills})` : '')).join(', ') + '. The strength map fills in as more skills are practiced.'
            : 'Strength map appears once your child starts practicing skills.';
          canvas.parentNode.appendChild(msg);
        }
      }
    } catch (err) {
      console.error('[ParentAnalytics] Failed to load analytics for child', childId, err);
    }
  };

  // Also load weekly brain report on page load for first child
  document.addEventListener('DOMContentLoaded', () => {
    // The parent-dashboard.js handles rendering child cards and calls fetchChildAnalytics
    // No additional initialization needed here
  });

})();

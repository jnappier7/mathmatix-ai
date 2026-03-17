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
        } else if (container) {
          container.innerHTML = '<p style="font-size:0.8em; color:#666;">No memory data yet — skills appear as your child practices.</p>';
        }
      }

      // Strength Map Donut
      if (strengthRes.ok) {
        const data = await strengthRes.json();
        const canvasId = `strength-map-${childId}`;
        if (data.categories && data.categories.length > 0) {
          window.AnalyticsCharts.createStrengthDonut(canvasId, data);
        } else {
          const canvas = document.getElementById(canvasId);
          if (canvas) {
            canvas.style.display = 'none';
            const msg = document.createElement('p');
            msg.style.cssText = 'font-size:0.8em; color:#666; text-align:center; padding:10px;';
            msg.textContent = 'Strength map appears once your child starts practicing skills.';
            canvas.parentNode.appendChild(msg);
          }
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

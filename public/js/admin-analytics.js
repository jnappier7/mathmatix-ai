/**
 * admin-analytics.js — Loads platform-wide learning engine metrics
 * for the admin dashboard Learning Analytics panel.
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    loadPlatformAnalytics();
  });

  async function loadPlatformAnalytics() {
    try {
      const [healthRes, outcomesRes] = await Promise.all([
        fetch('/api/analytics/platform/engine-health', { credentials: 'include' }),
        fetch('/api/analytics/platform/learning-outcomes', { credentials: 'include' }),
      ]);

      // Engine Health — summary stats
      if (healthRes.ok) {
        const data = await healthRes.json();
        const el = (id) => document.getElementById(id);
        const avgs = data.averages || {};

        if (avgs.bktPLearned != null) {
          el('admin-avg-mastery').textContent = `${(avgs.bktPLearned * 100).toFixed(0)}%`;
        }
        if (avgs.fsrsRetrievability != null) {
          el('admin-avg-retention').textContent = `${(avgs.fsrsRetrievability * 100).toFixed(0)}%`;
        }
        if (avgs.smartScore != null) {
          el('admin-avg-smartscore').textContent = avgs.smartScore.toFixed(0);
        }

        // Cognitive Load Zone distribution
        if (data.cognitiveLoadDistribution) {
          const dist = data.cognitiveLoadDistribution;
          const total = (dist.low || 0) + (dist.optimal || 0) + (dist.high || 0) + (dist.overload || 0);
          if (total > 0) {
            const zones = document.getElementById('admin-cognitive-zones');
            if (zones) {
              zones.innerHTML = `
                <div style="flex:${dist.low || 0}; background:#bbf7d0; display:flex; align-items:center; justify-content:center; font-size:0.75em; font-weight:600;">${dist.low || 0}</div>
                <div style="flex:${dist.optimal || 0}; background:#bfdbfe; display:flex; align-items:center; justify-content:center; font-size:0.75em; font-weight:600;">${dist.optimal || 0}</div>
                <div style="flex:${dist.high || 0}; background:#fde68a; display:flex; align-items:center; justify-content:center; font-size:0.75em; font-weight:600;">${dist.high || 0}</div>
                <div style="flex:${dist.overload || 0}; background:#fecaca; display:flex; align-items:center; justify-content:center; font-size:0.75em; font-weight:600;">${dist.overload || 0}</div>
              `;
            }
          }
        }

        // Mastery Distribution chart
        if (data.masteryDistribution && window.AnalyticsCharts) {
          window.AnalyticsCharts.createMasteryDistribution('admin-mastery-distribution', {
            distribution: data.masteryDistribution
          });
        }
      }

      // Learning Outcomes
      if (outcomesRes.ok) {
        const data = await outcomesRes.json();
        const el = (id) => document.getElementById(id);
        const psRate = data.productiveStruggle?.rate;

        if (psRate != null) {
          el('admin-productive-struggle').textContent = `${(psRate * 100).toFixed(0)}%`;
        }
      }
    } catch (err) {
      console.error('[AdminAnalytics] Failed to load platform analytics:', err);
    }
  }
})();

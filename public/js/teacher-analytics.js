/**
 * teacher-analytics.js — Wires Analytics tab and student detail modal analytics
 * to the /api/analytics endpoints and AnalyticsCharts rendering functions.
 */
(function () {
  'use strict';

  let analyticsLoaded = false;
  let currentStudentList = [];

  // Wait for DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    // Listen for analytics tab activation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tab === 'analytics' && !analyticsLoaded) {
          analyticsLoaded = true;
          loadClassAnalytics();
        }
      });
    });

    // Student select dropdown change
    const studentSelect = document.getElementById('analytics-student-select');
    if (studentSelect) {
      studentSelect.addEventListener('change', (e) => {
        const studentId = e.target.value;
        if (studentId) {
          loadStudentDrillDown(studentId);
        } else {
          document.getElementById('student-analytics-panels').style.display = 'none';
          document.getElementById('student-analytics-empty').style.display = 'block';
        }
      });
    }

    // Listen for profile analytics tab in student detail modal
    document.querySelectorAll('.profile-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.profileTab === 'analytics') {
          const studentId = document.getElementById('current-iep-student-id')?.value;
          if (studentId) {
            loadProfileAnalytics(studentId);
          }
        }
      });
    });
  });

  // ── Class-Level Analytics ──
  async function loadClassAnalytics() {
    try {
      const [heatmapRes, riskRes, studentsRes] = await Promise.all([
        fetch('/api/analytics/class/knowledge-heatmap', { credentials: 'include' }),
        fetch('/api/analytics/class/risk-radar', { credentials: 'include' }),
        fetch('/api/teacher/students?fields=roster', { credentials: 'include' }),
      ]);

      // Populate student dropdown
      if (studentsRes.ok) {
        const students = await studentsRes.json();
        currentStudentList = students;
        const select = document.getElementById('analytics-student-select');
        if (select) {
          select.innerHTML = '<option value="">Select a student...</option>';
          students.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s._id;
            opt.textContent = `${s.firstName} ${s.lastName || ''}`.trim();
            select.appendChild(opt);
          });
        }
      }

      // Knowledge Heatmap
      if (heatmapRes.ok) {
        const data = await heatmapRes.json();
        if (data.students && data.students.length > 0 && data.skillIds.length > 0) {
          document.getElementById('heatmap-empty').style.display = 'none';
          window.AnalyticsCharts.createKnowledgeHeatmap('class-knowledge-heatmap', data);
        } else {
          document.getElementById('heatmap-empty').style.display = 'block';
        }
      }

      // Risk Radar
      if (riskRes.ok) {
        const data = await riskRes.json();
        if (data.students && data.students.length > 0) {
          document.getElementById('risk-empty').style.display = 'none';
          window.AnalyticsCharts.createRiskScatterPlot('class-risk-scatter', data);
        } else {
          document.getElementById('risk-empty').style.display = 'block';
        }
      }
    } catch (err) {
      console.error('[TeacherAnalytics] Failed to load class analytics:', err);
    }
  }

  // ── Student Drill-Down ──
  async function loadStudentDrillDown(studentId) {
    document.getElementById('student-analytics-empty').style.display = 'none';
    document.getElementById('student-analytics-panels').style.display = 'block';

    try {
      const [memoryRes, cogRes, consistRes, knowledgeRes] = await Promise.all([
        fetch(`/api/analytics/student/${studentId}/memory-forecast`, { credentials: 'include' }),
        fetch(`/api/analytics/student/${studentId}/cognitive-profile`, { credentials: 'include' }),
        fetch(`/api/analytics/student/${studentId}/consistency-report`, { credentials: 'include' }),
        fetch(`/api/analytics/student/${studentId}/knowledge-map`, { credentials: 'include' }),
      ]);

      // Memory Forecast
      if (memoryRes.ok) {
        const data = await memoryRes.json();
        window.AnalyticsCharts.createMemoryForecastChart('student-memory-forecast', data);
      }

      // Cognitive Load Timeline
      if (cogRes.ok) {
        const data = await cogRes.json();
        window.AnalyticsCharts.createCognitiveLoadTimeline('student-cognitive-load', data);
      }

      // Consistency Radar
      if (consistRes.ok) {
        const data = await consistRes.json();
        window.AnalyticsCharts.createConsistencyRadar('student-consistency-radar', data);
      }

      // Knowledge Map (horizontal bars)
      if (knowledgeRes.ok) {
        const data = await knowledgeRes.json();
        renderKnowledgeBars('student-knowledge-bars', data);
      }
    } catch (err) {
      console.error('[TeacherAnalytics] Failed to load student drill-down:', err);
    }
  }

  // ── Profile Modal Analytics ──
  async function loadProfileAnalytics(studentId) {
    try {
      const [memRes, cogRes, consistRes] = await Promise.all([
        fetch(`/api/analytics/student/${studentId}/memory-forecast`, { credentials: 'include' }),
        fetch(`/api/analytics/student/${studentId}/cognitive-profile`, { credentials: 'include' }),
        fetch(`/api/analytics/student/${studentId}/consistency-report`, { credentials: 'include' }),
      ]);

      // Memory Health Bar
      if (memRes.ok) {
        const data = await memRes.json();
        const skills = data.skills || [];
        const strong = skills.filter(s => s.retrievability >= 0.85).length;
        const fading = skills.filter(s => s.retrievability >= 0.5 && s.retrievability < 0.85).length;
        const needsReview = skills.filter(s => s.retrievability < 0.5).length;
        window.AnalyticsCharts.createMemoryHealthBar('profile-memory-health-bar', {
          strong, fading, needsReview, totalSkills: skills.length
        });
      }

      // Consistency Radar
      if (consistRes.ok) {
        const data = await consistRes.json();
        window.AnalyticsCharts.createConsistencyRadar('profile-consistency-radar', data);
      }

      // Cognitive Load Timeline
      if (cogRes.ok) {
        const data = await cogRes.json();
        window.AnalyticsCharts.createCognitiveLoadTimeline('profile-cognitive-timeline', data);
      }
    } catch (err) {
      console.error('[TeacherAnalytics] Profile analytics error:', err);
    }
  }

  // ── Knowledge Bars (BKT pLearned per skill) ──
  function renderKnowledgeBars(canvasId, data) {
    const AC = window.AnalyticsCharts;
    if (!AC) return;

    AC.destroyChart(canvasId);

    const allSkills = [];
    if (data.categories) {
      Object.values(data.categories).forEach(cat => {
        (cat.skills || []).forEach(s => allSkills.push(s));
      });
    }

    if (allSkills.length === 0) return;

    // Sort by pLearned, show top 15
    allSkills.sort((a, b) => b.pLearned - a.pLearned);
    const shown = allSkills.slice(0, 15);

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: shown.map(s => AC.truncateLabel(s.displayName || s.skillId, 25)),
        datasets: [{
          label: 'P(Learned)',
          data: shown.map(s => s.pLearned),
          backgroundColor: shown.map(s =>
            s.pLearned >= 0.8 ? '#16C86D' :
            s.pLearned >= 0.4 ? '#f39c12' : '#e74c3c'
          ),
          borderRadius: 4,
          barThickness: 18,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { min: 0, max: 1, grid: { color: 'rgba(0,0,0,0.05)' } },
          y: { grid: { display: false }, ticks: { font: { size: 11 } } }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `P(Learned): ${(ctx.raw * 100).toFixed(0)}%`
            }
          }
        }
      }
    });

    AC._chartInstances = AC._chartInstances || {};
    AC._chartInstances[canvasId] = chart;
  }

})();

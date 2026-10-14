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
  // ---- knowledge table -------------------------------------------------
  const PAGE = 12;
  let heatmapData = null;
  let heatmapPage = 0;
  let showNoData = false;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BAND = (p) => p == null ? ['none', 'Not practiced'] : p >= 0.8 ? ['high', 'Got it'] : p >= 0.4 ? ['mid', 'Getting there'] : ['low', 'Needs work'];

  function renderKnowledgeTable() {
    const box = document.getElementById('class-knowledge-table');
    const d = heatmapData;
    if (!box || !d) return;
    if (!d.skillIds || !d.skillIds.length) { box.innerHTML = ''; return; }
    const withData = d.students.filter(s => s.hasData);
    const pool = showNoData ? d.students : withData;
    const pages = Math.max(1, Math.ceil(pool.length / PAGE));
    heatmapPage = Math.min(heatmapPage, pages - 1);
    const cols = pool.slice(heatmapPage * PAGE, heatmapPage * PAGE + PAGE);
    const skills = d.skillIds.slice(0, 25);
    const head = '<tr><th scope="col" class="kt-skill">Skill</th>' + cols.map(s =>
      `<th scope="col"><button type="button" class="kt-student" data-kt-open="${esc(s.id)}" title="${esc(s.name)}">${esc((s.name || '').split(' ')[0])}</button></th>`).join('') + '</tr>';
    const body = skills.map(id => {
      const name = d.skillNames[id] || id;
      return `<tr><th scope="row" class="kt-skill" title="${esc(name)}">${esc(name)}</th>` + cols.map(s => {
        const p = s.skills[id];
        const [cls, label] = BAND(p);
        const pct = p == null ? '' : ` (${Math.round(p * 100)}%)`;
        return `<td class="kt-${cls}" title="${esc(s.name)} — ${esc(name)}: ${label}${pct}"><span class="kt-sr">${label}${pct}</span></td>`;
      }).join('') + '</tr>';
    }).join('');
    const noData = d.students.length - withData.length;
    box.innerHTML =
      '<div class="kt-legend" aria-hidden="true"><span class="kt-key kt-high"></span>Got it<span class="kt-key kt-mid"></span>Getting there<span class="kt-key kt-low"></span>Needs work<span class="kt-key kt-none"></span>Not practiced</div>' +
      `<div class="kt-scroll"><table class="kt-table"><caption class="kt-sr">How well each student knows each skill, students ${heatmapPage * PAGE + 1}–${heatmapPage * PAGE + cols.length} of ${pool.length}</caption><thead>${head}</thead><tbody>${body}</tbody></table></div>` +
      '<div class="kt-nav">' +
        (pages > 1 ? `<button type="button" class="kt-btn" data-kt-page="-1" ${heatmapPage === 0 ? 'disabled' : ''}>‹ Prev</button><span>Students ${heatmapPage * PAGE + 1}–${heatmapPage * PAGE + cols.length} of ${pool.length}</span><button type="button" class="kt-btn" data-kt-page="1" ${heatmapPage >= pages - 1 ? 'disabled' : ''}>Next ›</button>` : `<span>${pool.length} student${pool.length === 1 ? '' : 's'}</span>`) +
        (noData ? `<button type="button" class="kt-btn kt-link" data-kt-nodata>${showNoData ? 'Hide' : 'Show'} ${noData} without practice yet</button>` : '') +
        (d.skillIds.length > skills.length ? `<span class="kt-muted">Top ${skills.length} of ${d.skillIds.length} skills</span>` : '') +
      '</div>';
  }

  // ---- who to check in with (text alternative to the scatter) ----------
  function renderCheckinList(data) {
    const box = document.getElementById('risk-checkin-list');
    if (!box) return;
    const atRisk = (data.students || []).filter(s => s.atRisk).slice(0, 6);
    const note = data.noDataCount ? `<p class="kt-muted">${data.noDataCount} student${data.noDataCount === 1 ? ' hasn\'t' : 's haven\'t'} practiced enough to place yet.</p>` : '';
    if (!atRisk.length) { box.innerHTML = '<p class="kt-muted">No one stands out as needing a check-in right now.</p>' + note; return; }
    box.innerHTML = '<h4 class="kt-h4">Check in first</h4><ul class="kt-checkin">' + atRisk.map(s => {
      const why = [];
      if (s.avgPLearned < 0.4) why.push(`mastery ${Math.round(s.avgPLearned * 100)}%`);
      if (s.recentCognitiveLoad > 0.7) why.push('working very hard lately');
      if (s.avgSmartScore < 40) why.push('inconsistent answers');
      return `<li><button type="button" class="kt-student" data-kt-open="${esc(s.id)}">${esc(s.name)}</button><span class="kt-muted">${esc(why.join(' · '))}</span></li>`;
    }).join('') + '</ul>' + note;
  }

  document.addEventListener('click', (e) => {
    const page = e.target.closest('[data-kt-page]');
    if (page) { heatmapPage += Number(page.getAttribute('data-kt-page')); return renderKnowledgeTable(); }
    if (e.target.closest('[data-kt-nodata]')) { showNoData = !showNoData; heatmapPage = 0; return renderKnowledgeTable(); }
    const open = e.target.closest('[data-kt-open]');
    if (open && window.TeacherDashboard && window.TeacherDashboard.openProfile) window.TeacherDashboard.openProfile(open.getAttribute('data-kt-open'));
  });

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

      // Knowledge table (was a canvas capped at 20 students)
      if (heatmapRes.ok) {
        heatmapData = await heatmapRes.json();
        heatmapPage = 0;
        const has = heatmapData.students && heatmapData.studentsWithData > 0 && heatmapData.skillIds.length > 0;
        document.getElementById('heatmap-empty').style.display = has ? 'none' : 'block';
        renderKnowledgeTable();
      }

      // Who to check in with
      if (riskRes.ok) {
        const data = await riskRes.json();
        if (data.students && data.students.length > 0) {
          document.getElementById('risk-empty').style.display = 'none';
          window.AnalyticsCharts.createRiskScatterPlot('class-risk-scatter', data);
        } else {
          document.getElementById('risk-empty').style.display = 'block';
        }
        renderCheckinList(data);
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

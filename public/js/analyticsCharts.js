/**
 * analyticsCharts.js
 * Shared chart utility library for teacher, parent, and admin dashboards.
 * Uses Chart.js (loaded via CDN, available globally as `Chart`).
 *
 * All factories live on window.AnalyticsCharts.
 */
(function () {
  'use strict';

  // Chart text in the page's language: i18n.js follows the parent's language on
  // parent pages and the user's own elsewhere. English when the engine or a key
  // is missing. `n` picks a key's `_one` form for a count of 1.
  function T(key, english, params, n) {
    var I = window.MathmatixI18n;
    var text = (I && n === 1 && I.t(key + '_one')) || (I && I.t(key)) || english;
    return params ? String(text).replace(/\{(\w+)\}/g, function (m, k) { return params[k] != null ? params[k] : ''; }) : text;
  }

  /* ------------------------------------------------------------------ */
  /*  Constants & helpers                                                */
  /* ------------------------------------------------------------------ */

  const FONT_FAMILY =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

  const COLORS = {
    success: '#16C86D',
    successAlt: '#27ae60',
    warning: '#f39c12',
    danger: '#e74c3c',
    info: '#3498db',
    purple: '#7b1fa2',
    gray: '#bdc3c7',
    grayLight: '#ecf0f1',
    grayDark: '#7f8c8d',
    white: '#ffffff',
    textDark: '#2c3e50',
  };

  // Keep a registry so we can destroy charts by canvas id.
  const _chartRegistry = {};

  /* ---- tiny helpers ------------------------------------------------ */

  function formatProbability(p) {
    if (p === null || p === undefined || isNaN(p)) return '—';
    return (p * 100).toFixed(1) + '%';
  }

  function truncateLabel(label, maxLen) {
    if (!label) return '';
    maxLen = maxLen || 20;
    return label.length > maxLen ? label.slice(0, maxLen - 1) + '\u2026' : label;
  }

  function getChartColors() {
    return Object.assign({}, COLORS);
  }

  function getCSSVar(name) {
    try {
      return getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
    } catch (_) {
      return '';
    }
  }

  function primaryColor() {
    return getCSSVar('--color-primary') || COLORS.info;
  }

  /** Safely destroy an existing Chart.js instance on a canvas. */
  function destroyChart(canvasId) {
    if (_chartRegistry[canvasId]) {
      try {
        _chartRegistry[canvasId].destroy();
      } catch (_) {
        /* already gone */
      }
      delete _chartRegistry[canvasId];
    }
    // Also try Chart.js own getChart helper (v3+/v4)
    try {
      var existing = Chart.getChart(canvasId);
      if (existing) existing.destroy();
    } catch (_) {
      /* noop */
    }
  }

  /** Register a newly created chart so destroyChart can find it. */
  function registerChart(canvasId, chart) {
    _chartRegistry[canvasId] = chart;
    describeChart(canvasId, chart);
  }

  /**
   * A canvas chart is invisible to a screen reader. Every chart registered
   * here gets its DATA written into its accessible name: the static label
   * says what the chart is, this appends what it shows.
   */
  function describeChart(canvasId, chart) {
    try {
      var canvas = document.getElementById(canvasId);
      if (!canvas || !chart || !chart.data) return;
      if (!canvas.getAttribute('role')) canvas.setAttribute('role', 'img');
      var base = canvas.getAttribute('data-a11y-base');
      if (base === null) {
        base = canvas.getAttribute('aria-label') || '';
        canvas.setAttribute('data-a11y-base', base);
      }
      var labels = chart.data.labels || [];
      var parts = [];
      (chart.data.datasets || []).forEach(function (ds) {
        var pts = (ds.data || []).slice(0, 15).map(function (v, i) {
          if (v && typeof v === 'object') {
            if (v.name) return v.name + ' (' + Math.round((v.y || 0) * 100) + '%)';
            return (labels[i] || (T('chart.point', 'point') + ' ' + (i + 1))) + ': ' + (v.y != null ? v.y : v.x);
          }
          var num = typeof v === 'number' ? (Math.abs(v) <= 1 && v !== 0 ? Math.round(v * 100) + '%' : Math.round(v * 10) / 10) : v;
          return (labels[i] != null ? labels[i] + ': ' : '') + num;
        });
        if (pts.length) parts.push((ds.label ? ds.label + ' — ' : '') + pts.join(', ') + ((ds.data || []).length > 15 ? ', ' + T('chart.andMore', 'and more') : ''));
      });
      if (parts.length) canvas.setAttribute('aria-label', (base ? base.replace(/[.\s]+$/, '') + '. ' : '') + parts.join('. '));
    } catch (e) { /* a11y description must never break a chart */ }
  }

  /** Return the canvas element; show "No data" and return null when data is empty. */
  function prepareCanvas(canvasId, hasData) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    var ctx = canvas.getContext('2d');
    destroyChart(canvasId);
    if (!hasData) {
      drawNoData(ctx, canvas);
      return null;
    }
    return ctx;
  }

  function drawNoData(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.font = '14px ' + FONT_FAMILY;
    ctx.fillStyle = COLORS.grayDark;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(T('chart.noData', 'No data yet'), canvas.width / 2, canvas.height / 2);
    ctx.restore();
  }

  /** Set Chart.js global defaults once. */
  function applyGlobalDefaults() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.font.family = FONT_FAMILY;
    Chart.defaults.font.size = 12;
    Chart.defaults.color = COLORS.textDark;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
  }

  /** Common base options shared by most Chart.js charts. */
  function baseOptions(extra) {
    var opts = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { font: { family: FONT_FAMILY } } },
      },
      scales: {},
    };
    return Object.assign(opts, extra || {});
  }

  /** Reduce grid clutter — low-opacity grid, no border. */
  function cleanAxis(overrides) {
    return Object.assign(
      {
        grid: { color: 'rgba(0,0,0,0.06)', drawBorder: false },
        ticks: { font: { family: FONT_FAMILY, size: 11 } },
      },
      overrides || {}
    );
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  /* ------------------------------------------------------------------ */
  /*  1. Knowledge Heatmap  (custom canvas renderer)                    */
  /* ------------------------------------------------------------------ */

  function createKnowledgeHeatmap(canvasId, data) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    var ctx = canvas.getContext('2d');
    destroyChart(canvasId);

    if (
      !data ||
      !data.students ||
      data.students.length === 0 ||
      !data.skillIds ||
      data.skillIds.length === 0
    ) {
      drawNoData(ctx, canvas);
      return ctx;
    }

    var students = data.students;
    var skillIds = data.skillIds;
    var skillNames = data.skillNames || {};

    // Limits for visible area (scroll handled by wrapper div)
    var maxCols = Math.min(students.length, 20);
    var maxRows = Math.min(skillIds.length, 30);

    var cellW = 36;
    var cellH = 24;
    var labelW = 140; // left labels (skill names)
    var headerH = 60; // top labels (student names)
    var legendH = 30;

    var totalW = labelW + maxCols * cellW + 20;
    var totalH = headerH + maxRows * cellH + legendH + 20;

    canvas.width = totalW;
    canvas.height = totalH;
    canvas.style.width = totalW + 'px';
    canvas.style.height = totalH + 'px';

    // Make parent scrollable if needed
    if (canvas.parentElement) {
      canvas.parentElement.style.overflowX = 'auto';
      canvas.parentElement.style.overflowY = 'auto';
      canvas.parentElement.style.maxWidth = '100%';
      canvas.parentElement.style.maxHeight = (headerH + 30 * cellH + legendH + 30) + 'px';
    }

    ctx.clearRect(0, 0, totalW, totalH);

    function cellColor(p) {
      if (p === null || p === undefined) return COLORS.grayLight;
      if (p >= 0.8) return COLORS.success;
      if (p >= 0.4) return COLORS.warning;
      return COLORS.danger;
    }

    // Draw column headers (student first names, rotated)
    ctx.save();
    ctx.font = '10px ' + FONT_FAMILY;
    ctx.fillStyle = COLORS.textDark;
    ctx.textAlign = 'left';
    for (var c = 0; c < maxCols; c++) {
      var sx = labelW + c * cellW + cellW / 2;
      ctx.save();
      ctx.translate(sx, headerH - 4);
      ctx.rotate(-Math.PI / 4);
      var firstName = (students[c].name || '').split(' ')[0];
      ctx.fillText(truncateLabel(firstName, 10), 0, 0);
      ctx.restore();
    }
    ctx.restore();

    // Draw rows
    for (var r = 0; r < maxRows; r++) {
      var sid = skillIds[r];
      var displayName = skillNames[sid] || sid;
      var ry = headerH + r * cellH;

      // Row label
      ctx.save();
      ctx.font = '10px ' + FONT_FAMILY;
      ctx.fillStyle = COLORS.textDark;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(truncateLabel(displayName, 20), labelW - 6, ry + cellH / 2);
      ctx.restore();

      // Cells
      for (var ci = 0; ci < maxCols; ci++) {
        var skills = students[ci].skills || {};
        var pL = skills[sid] !== undefined ? skills[sid] : null;
        ctx.fillStyle = cellColor(pL);
        ctx.fillRect(labelW + ci * cellW, ry, cellW - 2, cellH - 2);
      }
    }

    // Legend
    var ly = headerH + maxRows * cellH + 10;
    var legendItems = [
      { label: T('chart.heat.mastered', 'Mastered') + ' (\u22650.8)', color: COLORS.success },
      { label: T('chart.heat.learning', 'Learning') + ' (0.4-0.8)', color: COLORS.warning },
      { label: T('chart.heat.needsWork', 'Needs work') + ' (<0.4)', color: COLORS.danger },
      { label: T('chart.heat.noData', 'No data'), color: COLORS.grayLight },
    ];
    ctx.font = '10px ' + FONT_FAMILY;
    ctx.textBaseline = 'middle';
    var lx = labelW;
    legendItems.forEach(function (item) {
      ctx.fillStyle = item.color;
      ctx.fillRect(lx, ly, 12, 12);
      ctx.fillStyle = COLORS.textDark;
      ctx.fillText(item.label, lx + 16, ly + 6);
      lx += ctx.measureText(item.label).width + 30;
    });

    // Hover tooltip
    var tooltipEl = null;

    function showTooltip(text, x, y) {
      if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.style.cssText =
          'position:absolute;pointer-events:none;padding:4px 8px;background:rgba(0,0,0,0.8);' +
          'color:#fff;border-radius:4px;font-size:11px;font-family:' +
          FONT_FAMILY +
          ';white-space:nowrap;z-index:9999;transition:opacity 0.15s;';
        (canvas.parentElement || document.body).appendChild(tooltipEl);
        (canvas.parentElement || document.body).style.position = 'relative';
      }
      tooltipEl.textContent = text;
      tooltipEl.style.left = x + 10 + 'px';
      tooltipEl.style.top = y - 10 + 'px';
      tooltipEl.style.opacity = '1';
    }

    function hideTooltip() {
      if (tooltipEl) tooltipEl.style.opacity = '0';
    }

    canvas.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var col = Math.floor((mx - labelW) / cellW);
      var row = Math.floor((my - headerH) / cellH);
      if (col >= 0 && col < maxCols && row >= 0 && row < maxRows) {
        var sId = skillIds[row];
        var stud = students[col];
        var pVal = stud.skills ? stud.skills[sId] : null;
        var sName = skillNames[sId] || sId;
        var tip =
          stud.name + ' | ' + truncateLabel(sName, 25) + ': ' + formatProbability(pVal);
        showTooltip(tip, mx, my);
      } else {
        hideTooltip();
      }
    });

    canvas.addEventListener('mouseleave', function () {
      hideTooltip();
    });

    return ctx;
  }

  /* ------------------------------------------------------------------ */
  /*  2. Memory Forecast Chart (horizontal bar)                         */
  /* ------------------------------------------------------------------ */

  function createMemoryForecastChart(canvasId, data) {
    if (
      !data ||
      !data.skills ||
      data.skills.length === 0
    ) {
      prepareCanvas(canvasId, false);
      return null;
    }

    var ctx = prepareCanvas(canvasId, true);
    if (!ctx) return null;

    // Sort ascending retrievability (most urgent at top)
    var sorted = data.skills.slice().sort(function (a, b) {
      return (a.retrievability || 0) - (b.retrievability || 0);
    });

    var maxShow = 15;
    var truncated = sorted.length > maxShow;
    var items = sorted.slice(0, maxShow);

    var labels = items.map(function (s) {
      return truncateLabel(s.displayName || s.skillId, 25);
    });
    var values = items.map(function (s) {
      return s.retrievability || 0;
    });
    var barColors = values.map(function (v) {
      if (v >= 0.85) return COLORS.success;
      if (v >= 0.5) return COLORS.warning;
      return COLORS.danger;
    });

    applyGlobalDefaults();

    var chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: T('chart.retrievability', 'Recall'),
            data: values,
            backgroundColor: barColors,
            borderRadius: 3,
            barThickness: 18,
          },
        ],
      },
      options: baseOptions({
        indexAxis: 'y',
        scales: {
          x: cleanAxis({
            min: 0,
            max: 1,
            ticks: {
              callback: function (v) {
                return (v * 100) + '%';
              },
            },
          }),
          y: cleanAxis({ grid: { display: false } }),
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (tip) {
                return T('chart.retrievability', 'Recall') + ': ' + formatProbability(tip.raw);
              },
            },
          },
          annotation: {
            annotations: {
              targetLine: {
                type: 'line',
                xMin: 0.9,
                xMax: 0.9,
                borderColor: COLORS.info,
                borderWidth: 2,
                borderDash: [6, 4],
                label: {
                  display: true,
                  content: '90% target',
                  position: 'start',
                  font: { size: 10, family: FONT_FAMILY },
                  color: COLORS.info,
                  backgroundColor: 'rgba(255,255,255,0.85)',
                },
              },
            },
          },
        },
      }),
      plugins: [
        {
          id: 'targetLine',
          afterDraw: function (chart) {
            // Fallback if annotation plugin is not loaded
            if (chart.options.plugins.annotation) return;
            var xScale = chart.scales.x;
            var yScale = chart.scales.y;
            var xPixel = xScale.getPixelForValue(0.9);
            var cctx = chart.ctx;
            cctx.save();
            cctx.beginPath();
            cctx.setLineDash([6, 4]);
            cctx.strokeStyle = COLORS.info;
            cctx.lineWidth = 2;
            cctx.moveTo(xPixel, yScale.top);
            cctx.lineTo(xPixel, yScale.bottom);
            cctx.stroke();
            cctx.setLineDash([]);
            cctx.font = '10px ' + FONT_FAMILY;
            cctx.fillStyle = COLORS.info;
            cctx.textAlign = 'center';
            cctx.fillText('90% target', xPixel, yScale.top - 6);
            cctx.restore();
          },
        },
        truncated
          ? {
              id: 'truncNote',
              afterDraw: function (chart) {
                var cctx = chart.ctx;
                cctx.save();
                cctx.font = '11px ' + FONT_FAMILY;
                cctx.fillStyle = COLORS.grayDark;
                cctx.textAlign = 'right';
                cctx.fillText(
                  T('chart.moreSkills', '+ {n} more skills…', { n: sorted.length - maxShow }),
                  chart.width - 10,
                  chart.height - 4
                );
                cctx.restore();
              },
            }
          : { id: 'noop' },
      ],
    });

    registerChart(canvasId, chart);
    return chart;
  }

  /* ------------------------------------------------------------------ */
  /*  3. Cognitive Load Timeline (line chart with background zones)     */
  /* ------------------------------------------------------------------ */

  function createCognitiveLoadTimeline(canvasId, data) {
    if (
      !data ||
      !data.history ||
      data.history.length === 0
    ) {
      prepareCanvas(canvasId, false);
      return null;
    }

    var ctx = prepareCanvas(canvasId, true);
    if (!ctx) return null;

    var labels = data.history.map(function (h) {
      return h.date;
    });
    var avgData = data.history.map(function (h) {
      return h.avgLoad;
    });
    var peakData = data.history.map(function (h) {
      return h.peakLoad;
    });

    applyGlobalDefaults();

    // Custom plugin for background zones
    var zonePlugin = {
      id: 'cognitiveZones',
      beforeDraw: function (chart) {
        var cctx = chart.ctx;
        var yScale = chart.scales.y;
        var xScale = chart.scales.x;
        var left = xScale.left;
        var right = xScale.right;

        var zones = [
          { lo: 0, hi: 0.4, color: 'rgba(22,200,109,0.10)', label: T('chart.load.low', 'Low') },
          { lo: 0.4, hi: 0.65, color: 'rgba(52,152,219,0.10)', label: T('chart.load.optimal', 'Optimal') },
          { lo: 0.65, hi: 0.8, color: 'rgba(243,156,18,0.10)', label: T('chart.load.high', 'High') },
          { lo: 0.8, hi: 1.0, color: 'rgba(231,76,60,0.10)', label: T('chart.load.overload', 'Overload') },
        ];

        cctx.save();
        zones.forEach(function (z) {
          var yTop = yScale.getPixelForValue(z.hi);
          var yBot = yScale.getPixelForValue(z.lo);
          cctx.fillStyle = z.color;
          cctx.fillRect(left, yTop, right - left, yBot - yTop);

          // Zone label on right side
          cctx.font = '9px ' + FONT_FAMILY;
          cctx.fillStyle = COLORS.grayDark;
          cctx.textAlign = 'right';
          cctx.textBaseline = 'middle';
          cctx.fillText(z.label, right - 4, (yTop + yBot) / 2);
        });
        cctx.restore();
      },
    };

    var chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: T('chart.avgLoad', 'Avg Load'),
            data: avgData,
            borderColor: COLORS.info,
            backgroundColor: 'rgba(52,152,219,0.1)',
            fill: false,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: COLORS.info,
            borderWidth: 2,
          },
          {
            label: T('chart.peakLoad', 'Peak Load'),
            data: peakData,
            borderColor: COLORS.danger,
            backgroundColor: 'rgba(231,76,60,0.1)',
            fill: false,
            tension: 0.3,
            pointRadius: 2,
            pointBackgroundColor: COLORS.danger,
            borderWidth: 2,
            borderDash: [6, 3],
          },
        ],
      },
      options: baseOptions({
        scales: {
          x: cleanAxis({ grid: { display: false } }),
          y: cleanAxis({
            min: 0,
            max: 1,
            ticks: {
              stepSize: 0.2,
              callback: function (v) {
                return (v * 100) + '%';
              },
            },
          }),
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function (tip) {
                return tip.dataset.label + ': ' + formatProbability(tip.raw);
              },
            },
          },
        },
      }),
      plugins: [zonePlugin],
    });

    registerChart(canvasId, chart);
    return chart;
  }

  /* ------------------------------------------------------------------ */
  /*  4. Consistency Radar                                              */
  /* ------------------------------------------------------------------ */

  function createConsistencyRadar(canvasId, data) {
    if (
      !data ||
      !data.skills ||
      data.skills.length === 0
    ) {
      prepareCanvas(canvasId, false);
      return null;
    }

    var ctx = prepareCanvas(canvasId, true);
    if (!ctx) return null;

    // Take top 6 skills by smartScore
    var skills = data.skills
      .slice()
      .sort(function (a, b) {
        return (b.smartScore || 0) - (a.smartScore || 0);
      })
      .slice(0, 6);

    var labels = skills.map(function (s) {
      return truncateLabel(s.displayName || s.skillId, 15);
    });

    // Compute aggregate metrics (normalize to 0-100)
    var smartScores = skills.map(function (s) {
      return clamp(s.smartScore || 0, 0, 100);
    });
    var rawAccuracies = skills.map(function (s) {
      return clamp((s.rawAccuracy || 0) * 100, 0, 100);
    });
    // Streak, Recovery, Consistency are derived; use smartScore-based proxies
    var streaks = skills.map(function (s) {
      return clamp(s.streakLength != null ? s.streakLength : (s.smartScore || 0) * 0.8, 0, 100);
    });
    var recovery = skills.map(function (s) {
      return clamp(s.recoveryRate != null ? s.recoveryRate * 100 : (s.rawAccuracy || 0) * 90, 0, 100);
    });
    var consistency = skills.map(function (s) {
      return clamp(s.consistency != null ? s.consistency * 100 : ((s.smartScore || 0) + (s.rawAccuracy || 0) * 100) / 2, 0, 100);
    });

    // Average across skills for each axis
    function avg(arr) {
      if (!arr.length) return 0;
      var sum = 0;
      arr.forEach(function (v) { sum += v; });
      return Math.round(sum / arr.length);
    }

    var radarData = [
      avg(smartScores),
      avg(rawAccuracies),
      avg(streaks),
      avg(recovery),
      avg(consistency),
    ];

    var pc = primaryColor();
    var hasStruggle = skills.some(function (s) {
      return s.productiveStruggleDetected;
    });

    applyGlobalDefaults();

    var chart = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: [
          T('chart.radar.smartScore', 'Smart Score'), T('chart.radar.rawAccuracy', 'Raw Accuracy'),
          T('chart.radar.streak', 'Streak Length'), T('chart.radar.recovery', 'Recovery Rate'),
          T('chart.radar.consistency', 'Consistency'),
        ],
        datasets: [
          {
            label: T('chart.performance', 'Performance'),
            data: radarData,
            backgroundColor: hexToRGBA(pc, 0.2),
            borderColor: pc,
            borderWidth: 2,
            pointBackgroundColor: pc,
            pointRadius: 4,
          },
        ],
      },
      options: baseOptions({
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { stepSize: 20, backdropColor: 'transparent', font: { size: 9 } },
            grid: { color: 'rgba(0,0,0,0.06)' },
            angleLines: { color: 'rgba(0,0,0,0.08)' },
            pointLabels: { font: { size: 11, family: FONT_FAMILY } },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (tip) {
                return tip.label + ': ' + tip.raw;
              },
            },
          },
        },
      }),
      plugins: hasStruggle
        ? [
            {
              id: 'struggleBadge',
              afterDraw: function (chart) {
                var cctx = chart.ctx;
                cctx.save();
                cctx.font = 'bold 10px ' + FONT_FAMILY;
                cctx.fillStyle = COLORS.purple;
                cctx.textAlign = 'left';
                cctx.fillText(
                  '\u26A1 Productive struggle detected',
                  chart.chartArea.left + 4,
                  chart.chartArea.top + 12
                );
                cctx.restore();
              },
            },
          ]
        : [],
    });

    registerChart(canvasId, chart);
    return chart;
  }

  /* ------------------------------------------------------------------ */
  /*  5. Risk Scatter Plot                                              */
  /* ------------------------------------------------------------------ */

  function createRiskScatterPlot(canvasId, data) {
    if (
      !data ||
      !data.students ||
      data.students.length === 0
    ) {
      prepareCanvas(canvasId, false);
      return null;
    }

    var ctx = prepareCanvas(canvasId, true);
    if (!ctx) return null;

    var safeStudents = data.students.filter(function (s) {
      return !s.atRisk;
    });
    var riskStudents = data.students.filter(function (s) {
      return s.atRisk;
    });

    function mapPoints(arr) {
      return arr.map(function (s) {
        return {
          x: s.recentCognitiveLoad || 0,
          y: s.avgPLearned || 0,
          r: Math.max(3, (s.avgSmartScore || 50) / 10),
          name: s.name,
          id: s.id,
        };
      });
    }

    applyGlobalDefaults();

    // Quadrant labels plugin
    var quadrantPlugin = {
      id: 'quadrantLabels',
      afterDraw: function (chart) {
        var cctx = chart.ctx;
        var xScale = chart.scales.x;
        var yScale = chart.scales.y;
        var midX = xScale.getPixelForValue(0.5);
        var midY = yScale.getPixelForValue(0.5);

        cctx.save();
        cctx.font = '11px ' + FONT_FAMILY;
        cctx.globalAlpha = 0.35;
        cctx.fillStyle = COLORS.textDark;

        // Top-left: Thriving (low load, high pLearned)
        cctx.textAlign = 'left';
        cctx.fillText('Thriving', xScale.left + 8, yScale.top + 16);

        // Top-right: Overworked
        cctx.textAlign = 'right';
        cctx.fillText('Overworked', xScale.right - 8, yScale.top + 16);

        // Bottom-left: Disengaged
        cctx.textAlign = 'left';
        cctx.fillText('Coasting', xScale.left + 8, yScale.bottom - 8);

        // Bottom-right: Struggling
        cctx.textAlign = 'right';
        cctx.fillText('Stuck — check in', xScale.right - 8, yScale.bottom - 8);

        cctx.restore();
      },
    };

    var chart = new Chart(ctx, {
      type: 'bubble',
      data: {
        datasets: [
          {
            label: T('chart.onTrack', 'On Track'),
            data: mapPoints(safeStudents),
            backgroundColor: hexToRGBA(COLORS.success, 0.6),
            borderColor: COLORS.success,
            borderWidth: 1,
          },
          {
            label: T('chart.atRisk', 'At Risk'),
            data: mapPoints(riskStudents),
            backgroundColor: hexToRGBA(COLORS.danger, 0.6),
            borderColor: COLORS.danger,
            borderWidth: 1,
          },
        ],
      },
      options: baseOptions({
        scales: {
          x: cleanAxis({
            min: 0,
            max: 1,
            title: { display: true, text: T('chart.axis.struggle', 'Struggle level (how hard recent work felt)'), font: { family: FONT_FAMILY } },
            ticks: {
              callback: function (v) {
                return (v * 100) + '%';
              },
            },
          }),
          y: cleanAxis({
            min: 0,
            max: 1,
            title: { display: true, text: T('chart.axis.mastery', 'Skill mastery'), font: { family: FONT_FAMILY } },
            ticks: {
              callback: function (v) {
                return (v * 100) + '%';
              },
            },
          }),
        },
        // A dot is a student: clicking it opens their profile on the teacher
        // dashboard (no-op on surfaces without one).
        onClick: function (evt, elements, ch) {
          if (!elements || !elements.length) return;
          var el = elements[0];
          var pt = ch.data.datasets[el.datasetIndex].data[el.index];
          if (pt && pt.id && window.TeacherDashboard && window.TeacherDashboard.openProfile) window.TeacherDashboard.openProfile(String(pt.id));
        },
        onHover: function (evt, elements) {
          if (evt && evt.native && evt.native.target) evt.native.target.style.cursor = elements && elements.length ? 'pointer' : 'default';
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function (tip) {
                var pt = tip.raw;
                return (
                  (pt.name || T('chart.student', 'Student')) +
                  ' — ' + T('chart.tip.mastery', 'mastery') + ' ' +
                  formatProbability(pt.y) +
                  ', ' + T('chart.tip.struggle', 'struggle') + ' ' +
                  formatProbability(pt.x) +
                  (pt.id && window.TeacherDashboard && window.TeacherDashboard.openProfile ? ' (' + T('chart.tip.clickProfile', 'click for profile') + ')' : '')
                );
              },
            },
          },
        },
      }),
      plugins: [quadrantPlugin],
    });

    registerChart(canvasId, chart);
    return chart;
  }

  /* ------------------------------------------------------------------ */
  /*  6. Strength Donut                                                 */
  /* ------------------------------------------------------------------ */

  function createStrengthDonut(canvasId, data) {
    if (
      !data ||
      !data.categories ||
      data.categories.length === 0
    ) {
      prepareCanvas(canvasId, false);
      return null;
    }

    var ctx = prepareCanvas(canvasId, true);
    if (!ctx) return null;

    var totalMastered = 0;
    var totalLearning = 0;
    var totalNeedsWork = 0;
    data.categories.forEach(function (c) {
      totalMastered += c.mastered || 0;
      totalLearning += c.learning || 0;
      totalNeedsWork += c.needsWork || 0;
    });
    var totalSkills = totalMastered + totalLearning + totalNeedsWork;

    applyGlobalDefaults();

    var centerTextPlugin = {
      id: 'centerText',
      afterDraw: function (chart) {
        var cctx = chart.ctx;
        var w = chart.chartArea.right - chart.chartArea.left;
        var h = chart.chartArea.bottom - chart.chartArea.top;
        var cx = chart.chartArea.left + w / 2;
        var cy = chart.chartArea.top + h / 2;

        cctx.save();
        cctx.textAlign = 'center';
        cctx.textBaseline = 'middle';

        cctx.font = 'bold 22px ' + FONT_FAMILY;
        cctx.fillStyle = COLORS.textDark;
        cctx.fillText(totalSkills, cx, cy - 8);

        cctx.font = '11px ' + FONT_FAMILY;
        cctx.fillStyle = COLORS.grayDark;
        cctx.fillText('total skills', cx, cy + 12);
        cctx.restore();
      },
    };

    var chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: [T('chart.mastered', 'Mastered'), T('chart.learning', 'Learning'), T('chart.needsWork', 'Needs Work')],
        datasets: [
          {
            data: [totalMastered, totalLearning, totalNeedsWork],
            backgroundColor: [COLORS.success, COLORS.warning, COLORS.danger],
            borderWidth: 2,
            borderColor: COLORS.white,
          },
        ],
      },
      options: baseOptions({
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 16,
              font: { size: 12, family: FONT_FAMILY },
            },
          },
          tooltip: {
            callbacks: {
              label: function (tip) {
                var pct = totalSkills
                  ? ((tip.raw / totalSkills) * 100).toFixed(1) + '%'
                  : '0%';
                return tip.label + ': ' + tip.raw + ' (' + pct + ')';
              },
            },
          },
        },
      }),
      plugins: [centerTextPlugin],
    });

    registerChart(canvasId, chart);
    return chart;
  }

  /* ------------------------------------------------------------------ */
  /*  7. Memory Health Bar (DOM-based)                                  */
  /* ------------------------------------------------------------------ */

  function createMemoryHealthBar(containerId, data) {
    var container = document.getElementById(containerId);
    if (!container) return null;

    // Clear existing content
    container.innerHTML = '';

    if (!data || !data.totalSkills) {
      container.innerHTML =
        '<div style="text-align:center;color:' +
        COLORS.grayDark +
        ';font:13px ' +
        FONT_FAMILY +
        ';padding:12px;">' + T('chart.noData', 'No data yet') + '</div>';
      return container;
    }

    var total = data.totalSkills;
    var strong = data.strong || 0;
    var fading = data.fading || 0;
    var needsReview = data.needsReview || 0;

    function pct(n) {
      return total ? ((n / total) * 100).toFixed(1) : 0;
    }

    // Wrapper
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'width:100%;font-family:' + FONT_FAMILY + ';';

    // Bar track
    var bar = document.createElement('div');
    bar.style.cssText =
      'display:flex;width:100%;height:24px;border-radius:6px;overflow:hidden;background:' +
      COLORS.grayLight +
      ';';

    var segments = [
      { count: strong, color: COLORS.success, label: T('chart.strong', 'Strong') },
      { count: fading, color: COLORS.warning, label: T('chart.fading', 'Fading') },
      { count: needsReview, color: COLORS.danger, label: T('chart.needsReview', 'Needs Review') },
    ];

    segments.forEach(function (seg) {
      if (seg.count <= 0) return;
      var div = document.createElement('div');
      var w = pct(seg.count);
      div.style.cssText =
        'width:' +
        w +
        '%;background:' +
        seg.color +
        ';transition:width 0.4s ease;';
      div.title = seg.label + ': ' + seg.count;
      bar.appendChild(div);
    });

    wrapper.appendChild(bar);

    // Labels row
    var labelsRow = document.createElement('div');
    labelsRow.style.cssText =
      'display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:' +
      COLORS.textDark +
      ';';

    segments.forEach(function (seg) {
      var lbl = document.createElement('span');
      lbl.innerHTML =
        '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' +
        seg.color +
        ';margin-right:4px;vertical-align:middle;"></span>' +
        seg.label +
        ' <strong>' +
        seg.count +
        '</strong>';
      labelsRow.appendChild(lbl);
    });

    wrapper.appendChild(labelsRow);
    container.appendChild(wrapper);

    return container;
  }

  /* ------------------------------------------------------------------ */
  /*  8. Mastery Distribution (histogram bar chart)                     */
  /* ------------------------------------------------------------------ */

  function createMasteryDistribution(canvasId, data) {
    if (
      !data ||
      !data.distribution ||
      data.distribution.length === 0
    ) {
      prepareCanvas(canvasId, false);
      return null;
    }

    var ctx = prepareCanvas(canvasId, true);
    if (!ctx) return null;

    var labels = data.distribution.map(function (d) {
      return d.range;
    });
    var values = data.distribution.map(function (d) {
      return d.count;
    });

    // Red-to-green gradient per bucket
    var bucketCount = data.distribution.length;
    var barColors = data.distribution.map(function (_, i) {
      var ratio = i / Math.max(bucketCount - 1, 1);
      return interpolateColor(COLORS.danger, COLORS.success, ratio);
    });

    applyGlobalDefaults();

    var chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: T('chart.students', 'Students'),
            data: values,
            backgroundColor: barColors,
            borderRadius: 3,
          },
        ],
      },
      options: baseOptions({
        scales: {
          x: cleanAxis({
            title: { display: true, text: T('chart.axis.pLearned', 'Mastery estimate range (%)'), font: { family: FONT_FAMILY } },
            grid: { display: false },
          }),
          y: cleanAxis({
            title: { display: true, text: T('chart.axis.studentCount', 'Student count'), font: { family: FONT_FAMILY } },
            beginAtZero: true,
            ticks: { precision: 0 },
          }),
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (tip) {
                return T('chart.tip.students', '{n} students', { n: tip.raw }, tip.raw);
              },
            },
          },
        },
      }),
    });

    registerChart(canvasId, chart);
    return chart;
  }

  /* ------------------------------------------------------------------ */
  /*  Color utility helpers                                             */
  /* ------------------------------------------------------------------ */

  function hexToRGBA(hex, alpha) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    var r = parseInt(hex.substring(0, 2), 16);
    var g = parseInt(hex.substring(2, 4), 16);
    var b = parseInt(hex.substring(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha || 1) + ')';
  }

  function hexToRGB(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    return {
      r: parseInt(hex.substring(0, 2), 16),
      g: parseInt(hex.substring(2, 4), 16),
      b: parseInt(hex.substring(4, 6), 16),
    };
  }

  function interpolateColor(hexA, hexB, t) {
    var a = hexToRGB(hexA);
    var b = hexToRGB(hexB);
    var r = Math.round(a.r + (b.r - a.r) * t);
    var g = Math.round(a.g + (b.g - a.g) * t);
    var bl = Math.round(a.b + (b.b - a.b) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  window.AnalyticsCharts = {
    // Chart factories
    createKnowledgeHeatmap: createKnowledgeHeatmap,
    createMemoryForecastChart: createMemoryForecastChart,
    createCognitiveLoadTimeline: createCognitiveLoadTimeline,
    createConsistencyRadar: createConsistencyRadar,
    createRiskScatterPlot: createRiskScatterPlot,
    createStrengthDonut: createStrengthDonut,
    createMemoryHealthBar: createMemoryHealthBar,
    createMasteryDistribution: createMasteryDistribution,

    // Utilities
    destroyChart: destroyChart,
    getChartColors: getChartColors,
    formatProbability: formatProbability,
    truncateLabel: truncateLabel,
  };
})();

/* --- /js/analyticsCharts.js --- */
/**
 * analyticsCharts.js
 * Shared chart utility library for teacher, parent, and admin dashboards.
 * Uses Chart.js (loaded via CDN, available globally as `Chart`).
 *
 * All factories live on window.AnalyticsCharts.
 */
(function () {
  'use strict';

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
    ctx.fillText('No data yet', canvas.width / 2, canvas.height / 2);
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
      { label: 'Mastered (\u22650.8)', color: COLORS.success },
      { label: 'Learning (0.4-0.8)', color: COLORS.warning },
      { label: 'Needs work (<0.4)', color: COLORS.danger },
      { label: 'No data', color: COLORS.grayLight },
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
            label: 'Retrievability',
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
                return 'Retrievability: ' + formatProbability(tip.raw);
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
                  '+ ' + (sorted.length - maxShow) + ' more skills\u2026',
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
          { lo: 0, hi: 0.4, color: 'rgba(22,200,109,0.10)', label: 'Low' },
          { lo: 0.4, hi: 0.65, color: 'rgba(52,152,219,0.10)', label: 'Optimal' },
          { lo: 0.65, hi: 0.8, color: 'rgba(243,156,18,0.10)', label: 'High' },
          { lo: 0.8, hi: 1.0, color: 'rgba(231,76,60,0.10)', label: 'Overload' },
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
            label: 'Avg Load',
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
            label: 'Peak Load',
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
        labels: ['Smart Score', 'Raw Accuracy', 'Streak Length', 'Recovery Rate', 'Consistency'],
        datasets: [
          {
            label: 'Performance',
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
        cctx.fillText('Disengaged', xScale.left + 8, yScale.bottom - 8);

        // Bottom-right: Struggling
        cctx.textAlign = 'right';
        cctx.fillText('Struggling', xScale.right - 8, yScale.bottom - 8);

        cctx.restore();
      },
    };

    var chart = new Chart(ctx, {
      type: 'bubble',
      data: {
        datasets: [
          {
            label: 'On Track',
            data: mapPoints(safeStudents),
            backgroundColor: hexToRGBA(COLORS.success, 0.6),
            borderColor: COLORS.success,
            borderWidth: 1,
          },
          {
            label: 'At Risk',
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
            title: { display: true, text: 'Cognitive Load', font: { family: FONT_FAMILY } },
            ticks: {
              callback: function (v) {
                return (v * 100) + '%';
              },
            },
          }),
          y: cleanAxis({
            min: 0,
            max: 1,
            title: { display: true, text: 'Avg pLearned', font: { family: FONT_FAMILY } },
            ticks: {
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
                var pt = tip.raw;
                return (
                  (pt.name || '') +
                  ' — Load: ' +
                  formatProbability(pt.x) +
                  ', pLearned: ' +
                  formatProbability(pt.y)
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
        labels: ['Mastered', 'Learning', 'Needs Work'],
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
        ';padding:12px;">No data yet</div>';
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
      { count: strong, color: COLORS.success, label: 'Strong' },
      { count: fading, color: COLORS.warning, label: 'Fading' },
      { count: needsReview, color: COLORS.danger, label: 'Needs Review' },
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
            label: 'Students',
            data: values,
            backgroundColor: barColors,
            borderRadius: 3,
          },
        ],
      },
      options: baseOptions({
        scales: {
          x: cleanAxis({
            title: { display: true, text: 'pLearned Range (%)', font: { family: FONT_FAMILY } },
            grid: { display: false },
          }),
          y: cleanAxis({
            title: { display: true, text: 'Student Count', font: { family: FONT_FAMILY } },
            beginAtZero: true,
            ticks: { precision: 0 },
          }),
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (tip) {
                return tip.raw + ' student' + (tip.raw !== 1 ? 's' : '');
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

;
/* --- /js/admin-analytics.js --- */
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

;
/* --- /js/csrf.js --- */
// public/js/csrf.js
// CSRF Token Helper for Frontend
// Include this in HTML pages that need to make POST/PUT/DELETE requests

/**
 * Get CSRF token from cookie
 * @returns {string|null} CSRF token or null if not found
 */
function getCsrfToken() {
  const cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === '_csrf') {
      return decodeURIComponent(value);
    }
  }
  return null;
}

/**
 * Add CSRF token to fetch request headers
 * Usage:
 *   fetch('/api/endpoint', addCsrfToken({
 *     method: 'POST',
 *     body: JSON.stringify(data)
 *   }))
 *
 * @param {Object} options - Fetch options object
 * @returns {Object} Options with CSRF token added
 */
function addCsrfToken(options = {}) {
  const token = getCsrfToken();

  if (!token) {
    console.warn('[CSRF] No CSRF token found in cookies. Request may be rejected.');
    return options;
  }

  // Add CSRF token to headers
  options.headers = options.headers || {};
  options.headers['X-CSRF-Token'] = token;

  // Ensure Content-Type is set for JSON requests
  if (options.body && typeof options.body === 'string') {
    options.headers['Content-Type'] = 'application/json';
  }

  return options;
}

/**
 * Add CSRF token to FormData
 * Usage:
 *   const formData = new FormData();
 *   formData.append('field', 'value');
 *   addCsrfTokenToForm(formData);
 *
 * @param {FormData} formData - FormData object
 * @returns {FormData} FormData with CSRF token added
 */
function addCsrfTokenToForm(formData) {
  const token = getCsrfToken();

  if (!token) {
    console.warn('[CSRF] No CSRF token found in cookies. Request may be rejected.');
    return formData;
  }

  formData.append('_csrf', token);
  return formData;
}

/**
 * Handle 401 — session has expired. Stop all background polling and
 * redirect to the login page (once).
 */
function handleSessionExpired() {
  if (window.__sessionExpired) return;
  window.__sessionExpired = true;

  console.warn('[Auth] Session expired — stopping background requests');
  window.dispatchEvent(new CustomEvent('session-expired'));

  // Don't redirect if already on the login page
  if (!window.location.pathname.includes('login')) {
    setTimeout(() => { window.location.href = '/login.html'; }, 100);
  }
}

/**
 * Enhanced fetch wrapper with automatic CSRF token injection
 * Drop-in replacement for fetch() that handles CSRF automatically
 *
 * Usage:
 *   csrfFetch('/api/endpoint', {
 *     method: 'POST',
 *     body: JSON.stringify(data)
 *   })
 *
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @returns {Promise} Fetch promise
 */
async function csrfFetch(url, options = {}) {
  // If session already expired, return a synthetic 401 to avoid network noise
  if (window.__sessionExpired) {
    return new Response(null, { status: 401, statusText: 'Session Expired' });
  }

  // Only add CSRF token for state-changing methods
  const method = (options.method || 'GET').toUpperCase();
  const needsCsrf = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);

  if (needsCsrf) {
    options = addCsrfToken(options);
  }

  const response = await fetch(url, options);

  if (response.status === 401) {
    handleSessionExpired();
  }

  // Auto-recover from missing CSRF token: fetch a fresh token and retry once
  if (needsCsrf && response.status === 403 && !options._csrfRetried) {
    try {
      const body = await response.clone().json();
      if (body.code === 'CSRF_MISSING' || body.code === 'CSRF_INVALID') {
        // Hit the token endpoint to get a fresh _csrf cookie
        await fetch('/api/csrf-token', { credentials: 'same-origin' });
        options._csrfRetried = true;
        options = addCsrfToken(options);
        return fetch(url, options);
      }
    } catch (_) {
      // If parsing fails, return the original response
    }
  }

  return response;
}

// Export for use in other modules (if using ES6 modules)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getCsrfToken,
    addCsrfToken,
    addCsrfTokenToForm,
    csrfFetch
  };
}

;
/* --- /js/impersonationBanner.js --- */
// public/js/impersonationBanner.js
// Impersonation indicator - subtle teal glow + floating pill when viewing as another user

(function() {
  'use strict';

  const POLL_INTERVAL = 30000; // Check status every 30 seconds
  const MAX_POLL_INTERVAL = 300000; // 5 minutes cap

  let pollTimer = null;
  let pillElement = null;
  let currentStatus = null;
  let consecutiveFailures = 0;

  /**
   * Initialize the impersonation indicator
   */
  async function init() {
    await checkImpersonationStatus();

    // Poll for status changes (timeout, external end, etc.)
    schedulePoll();

    // Clean up on page unload
    window.addEventListener('beforeunload', cleanup);
  }

  function schedulePoll() {
    if (pollTimer) clearTimeout(pollTimer);
    if (window.__sessionExpired) return;
    const interval = Math.min(
      POLL_INTERVAL * Math.pow(2, consecutiveFailures),
      MAX_POLL_INTERVAL
    );
    pollTimer = setTimeout(async () => {
      await checkImpersonationStatus();
      schedulePoll();
    }, interval);
  }

  /**
   * Check current impersonation status from server
   */
  async function checkImpersonationStatus() {
    if (window.__sessionExpired) return;
    try {
      const response = await fetch('/api/impersonation/status');
      if (!response.ok) {
        if (response.status === 401) {
          cleanup();
          if (typeof handleSessionExpired === 'function') handleSessionExpired();
          return;
        }
        if (response.status === 429) consecutiveFailures++;
        return;
      }

      consecutiveFailures = 0;
      const status = await response.json();
      currentStatus = status;

      if (status.active) {
        showIndicator(status);
      } else {
        hideIndicator();
      }
    } catch (err) {
      consecutiveFailures++;
      console.error('Failed to check impersonation status:', err);
    }
  }

  /**
   * Show the impersonation indicator (glow + pill)
   */
  function showIndicator(status) {
    // Add body class for teal glow effect
    document.body.classList.add('impersonation-active');

    // Create or update pill
    if (!pillElement) {
      pillElement = createPillElement();
      document.body.appendChild(pillElement);
    }

    updatePillContent(status);
  }

  /**
   * Hide the impersonation indicator
   */
  function hideIndicator() {
    document.body.classList.remove('impersonation-active');

    if (pillElement) {
      pillElement.remove();
      pillElement = null;
    }
  }

  /**
   * Create the floating pill element
   */
  function createPillElement() {
    const pill = document.createElement('div');
    pill.className = 'impersonation-pill';
    pill.id = 'impersonation-pill';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');

    return pill;
  }

  /**
   * Update pill content with current status
   */
  function updatePillContent(status) {
    pillElement.innerHTML = `
      <span class="impersonation-pill__icon">&#128065;</span>
      <span class="impersonation-pill__text">
        <span class="impersonation-pill__name">${escapeHtml(status.targetName)}</span>
        <span class="impersonation-pill__details">${status.remainingMinutes}m left</span>
      </span>
      <button class="impersonation-pill__exit" onclick="window.ImpersonationBanner.exit(); event.stopPropagation();">
        Exit
      </button>
    `;
  }

  /**
   * End the impersonation session and return to original account
   */
  async function exit() {
    try {
      const response = await csrfFetch('/api/impersonation/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to end impersonation');
      }

      const result = await response.json();

      if (result.success) {
        // Redirect based on original user's role
        const status = currentStatus;
        if (status && status.originalUser) {
          const role = status.originalUser.role;
          const redirectMap = {
            admin: '/admin-dashboard.html',
            teacher: '/teacher-dashboard.html',
            parent: '/parent-dashboard.html'
          };
          window.location.href = redirectMap[role] || '/';
        } else {
          // Fallback - reload to let server decide
          window.location.reload();
        }
      }
    } catch (err) {
      console.error('Failed to end impersonation:', err);
      alert('Failed to exit view mode. Please try again.');
    }
  }

  /**
   * Start impersonating a user (called from dashboard UIs)
   */
  async function start(targetId, options = {}) {
    try {
      const response = await csrfFetch('/api/impersonation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId,
          readOnly: options.readOnly !== false // Default to true
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to start impersonation');
      }

      if (result.success) {
        // Redirect to appropriate page for the target user
        const targetRole = result.impersonation.targetRole;
        const redirectMap = {
          student: '/chat.html',
          teacher: '/teacher-dashboard.html',
          parent: '/parent-dashboard.html'
        };
        window.location.href = options.redirect || redirectMap[targetRole] || '/chat.html';
      }

      return result;
    } catch (err) {
      console.error('Failed to start impersonation:', err);
      throw err;
    }
  }

  /**
   * Get list of users that can be impersonated
   */
  async function getTargets() {
    try {
      const response = await fetch('/api/impersonation/targets');
      if (!response.ok) {
        throw new Error('Failed to fetch impersonation targets');
      }
      return await response.json();
    } catch (err) {
      console.error('Failed to get impersonation targets:', err);
      throw err;
    }
  }

  /**
   * Get current impersonation status
   */
  function getStatus() {
    return currentStatus;
  }

  /**
   * Check if currently impersonating
   */
  function isActive() {
    return currentStatus && currentStatus.active;
  }

  /**
   * Clean up on page unload
   */
  function cleanup() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Expose API globally
  window.ImpersonationBanner = {
    init,
    start,
    exit,
    getTargets,
    getStatus,
    isActive,
    checkImpersonationStatus
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

;
/* --- /js/logout.js --- */
// public/js/logout.js
document.addEventListener('DOMContentLoaded', () => {
  // Select all logout buttons (by class or by ID)
  const logoutButtons = document.querySelectorAll('.logout-button, #logoutBtn');

  logoutButtons.forEach(logoutBtn => {
    if (logoutBtn) {
      console.log(`LOG: Found logout button with ID: ${logoutBtn.id || logoutBtn.className}`);
      logoutBtn.addEventListener('click', async (event) => {
        event.preventDefault(); // Add this line to explicitly prevent any default behavior just in case
        console.log("LOG: Logout button clicked.");

        // Use session manager if available (handles auto-save and session summary)
        if (window.sessionManager) {
          console.log("LOG: Using session manager for logout.");
          window.sessionManager.triggerLogout();
          return;
        }

        // Fallback to direct logout if session manager not available
        console.log("LOG: Initiating fetch POST to /logout.");
        try {
          const res = await csrfFetch('/logout', {
            method: 'POST',
            credentials: 'include'
          });
          console.log("LOG: Logout fetch response:", res.status, res.statusText);
          if (res.ok) {
            console.log("LOG: Logout successful, redirecting.");
            // Use StorageUtils to safely clear storage (prevents tracking prevention errors)
            if (window.StorageUtils) {
              StorageUtils.local.clear();
              StorageUtils.session.clear();
            }
            // Clear UI language cache so next user gets a clean state
            StorageUtils.local.removeItem('mathmatix_ui_lang');
            window.location.href = '/login.html';
          } else {
            const errorText = await res.text();
            console.error('ERROR: Logout failed on server side:', res.status, errorText);
            alert('Logout failed: ' + errorText);
          }
        } catch (err) {
          console.error('CRITICAL ERROR: Logout fetch error (network/client-side):', err);
          alert('An error occurred while logging out. Please check your internet connection.');
        }
      });
    }
  });
});
;
/* --- /js/role-switcher.js --- */
/**
 * Role Switcher - Enables multi-role users to switch their active dashboard.
 *
 * Looks for #roleSwitcher (container) and #roleSwitcherSelect (dropdown) in the DOM.
 * Fetches the current user's roles from /user and shows the switcher only when
 * the user has more than one role.
 */
(function () {
  const container = document.getElementById('roleSwitcher');
  const select = document.getElementById('roleSwitcherSelect');
  if (!container || !select) return;

  // Inject minimal styles
  const style = document.createElement('style');
  style.textContent = `
    .role-switcher { display: flex; align-items: center; margin-right: 10px; }
    .role-switcher-select {
      padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.3);
      background: rgba(255,255,255,0.15); color: #fff; font-size: 0.85em;
      cursor: pointer; outline: none; font-weight: 500;
    }
    .role-switcher-select:hover { background: rgba(255,255,255,0.25); }
    .role-switcher-select option { color: #333; background: #fff; }
  `;
  document.head.appendChild(style);

  const roleLabels = {
    admin: 'Admin',
    teacher: 'Teacher',
    parent: 'Parent',
    student: 'Student'
  };

  const roleIcons = {
    admin: 'fa-user-shield',
    teacher: 'fa-chalkboard-teacher',
    parent: 'fa-heart',
    student: 'fa-graduation-cap'
  };

  async function init() {
    try {
      const fetchFn = typeof csrfFetch === 'function' ? csrfFetch : fetch;
      const res = await fetchFn('/api/role-switch/roles', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success) return;

      const roles = data.roles;
      const activeRole = data.activeRole;
      if (!data.isMultiRole) return; // Single-role user, no switcher needed

      // Build options
      select.innerHTML = roles.map(r =>
        `<option value="${r}" ${r === activeRole ? 'selected' : ''}>${roleLabels[r] || r}</option>`
      ).join('');

      container.style.display = 'flex';

      select.addEventListener('change', async () => {
        const newRole = select.value;
        if (!newRole) return;
        select.disabled = true;

        try {
          // Use csrfFetch if available (admin/teacher dashboards), otherwise plain fetch
          const fetchFn = typeof csrfFetch === 'function' ? csrfFetch : fetch;
          const res = await fetchFn('/api/role-switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ role: newRole })
          });
          const result = await res.json();
          if (res.ok && result.success && result.redirect) {
            window.location.href = result.redirect;
          } else {
            alert(result.message || 'Failed to switch role.');
            select.disabled = false;
          }
        } catch (err) {
          alert('Failed to switch role. Please try again.');
          select.disabled = false;
        }
      });
    } catch (err) {
      // Silently fail - role switcher is non-critical
      console.error('Role switcher init error:', err);
    }
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

;
/* --- /js/storage-utils.js --- */
/**
 * Safe Storage Utilities
 * Provides error-safe access to localStorage and sessionStorage
 * Handles Safari's Tracking Prevention and other storage blocking scenarios
 */

const StorageUtils = (() => {
  // Test if storage is available and accessible
  function isStorageAvailable(type) {
    try {
      const storage = window[type];
      const testKey = '__storage_test__';
      storage.setItem(testKey, 'test');
      storage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Cache availability checks to avoid repeated testing
  let localStorageAvailable = null;
  let sessionStorageAvailable = null;

  function checkLocalStorage() {
    if (localStorageAvailable === null) {
      localStorageAvailable = isStorageAvailable('localStorage');
    }
    return localStorageAvailable;
  }

  function checkSessionStorage() {
    if (sessionStorageAvailable === null) {
      sessionStorageAvailable = isStorageAvailable('sessionStorage');
    }
    return sessionStorageAvailable;
  }

  // LocalStorage safe methods
  const safeLocalStorage = {
    setItem(key, value) {
      try {
        if (checkLocalStorage()) {
          localStorage.setItem(key, value);
          return true;
        } else {
          console.warn(`[Storage] localStorage blocked for key: ${key}`);
          return false;
        }
      } catch (error) {
        console.error(`[Storage] Failed to set localStorage key "${key}":`, error);
        return false;
      }
    },

    getItem(key) {
      try {
        if (checkLocalStorage()) {
          return localStorage.getItem(key);
        } else {
          console.warn(`[Storage] localStorage blocked for key: ${key}`);
          return null;
        }
      } catch (error) {
        console.error(`[Storage] Failed to get localStorage key "${key}":`, error);
        return null;
      }
    },

    removeItem(key) {
      try {
        if (checkLocalStorage()) {
          localStorage.removeItem(key);
          return true;
        } else {
          console.warn(`[Storage] localStorage blocked for key: ${key}`);
          return false;
        }
      } catch (error) {
        console.error(`[Storage] Failed to remove localStorage key "${key}":`, error);
        return false;
      }
    },

    clear() {
      try {
        if (checkLocalStorage()) {
          localStorage.clear();
          return true;
        } else {
          console.warn('[Storage] localStorage blocked for clear operation');
          return false;
        }
      } catch (error) {
        console.error('[Storage] Failed to clear localStorage:', error);
        return false;
      }
    }
  };

  // SessionStorage safe methods
  const safeSessionStorage = {
    setItem(key, value) {
      try {
        if (checkSessionStorage()) {
          sessionStorage.setItem(key, value);
          return true;
        } else {
          console.warn(`[Storage] sessionStorage blocked for key: ${key}`);
          return false;
        }
      } catch (error) {
        console.error(`[Storage] Failed to set sessionStorage key "${key}":`, error);
        return false;
      }
    },

    getItem(key) {
      try {
        if (checkSessionStorage()) {
          return sessionStorage.getItem(key);
        } else {
          console.warn(`[Storage] sessionStorage blocked for key: ${key}`);
          return null;
        }
      } catch (error) {
        console.error(`[Storage] Failed to get sessionStorage key "${key}":`, error);
        return null;
      }
    },

    removeItem(key) {
      try {
        if (checkSessionStorage()) {
          sessionStorage.removeItem(key);
          return true;
        } else {
          console.warn(`[Storage] sessionStorage blocked for key: ${key}`);
          return false;
        }
      } catch (error) {
        console.error(`[Storage] Failed to remove sessionStorage key "${key}":`, error);
        return false;
      }
    },

    clear() {
      try {
        if (checkSessionStorage()) {
          sessionStorage.clear();
          return true;
        } else {
          console.warn('[Storage] sessionStorage blocked for clear operation');
          return false;
        }
      } catch (error) {
        console.error('[Storage] Failed to clear sessionStorage:', error);
        return false;
      }
    }
  };

  // Public API
  return {
    local: safeLocalStorage,
    session: safeSessionStorage,
    isLocalStorageAvailable: checkLocalStorage,
    isSessionStorageAvailable: checkSessionStorage
  };
})();

// Make available globally
window.StorageUtils = StorageUtils;

;
/* --- /js/idle-dialog.js --- */
/**
 * idle-dialog.js — the session-timeout dialog, as a real dialog.
 *
 * The idle warning used to be a native confirm() ("⚠️ Inactivity Detected …
 * Click OK to stay logged in, or Cancel to logout now") and the timeout notice
 * a native alert(). Both look like a browser error on an otherwise fully
 * styled product, and both are BLOCKING: confirm() freezes the event loop, so
 * the countdown the copy promises cannot tick, and a student who walks away
 * comes back to a frozen page whose logout fires the instant they dismiss it.
 *
 * This is the shared replacement. Two callers use it — auto-logout.js (the
 * 30-minute timer, the one chat runs) and sessionManager.js (the 20-minute
 * timer on pages auto-logout is not loaded on) — so the same event never shows
 * a student two different dialogs.
 *
 * Self-contained on purpose: it injects its own stylesheet and depends on no
 * page CSS, because it has to render identically on the seven pages that load
 * design-system.css and the eight that don't. Where the --cr-* tokens DO
 * exist it adopts them, so it follows the page's theme instead of fighting it.
 *
 *   MMIdleDialog.warn({ msRemaining, onStay, onSignOut })  -> live countdown
 *   MMIdleDialog.notice({ title, body, actionLabel, onAction, autoMs })
 *   MMIdleDialog.close()
 */
(function (root) {
  'use strict';

  var STYLE_ID = 'mm-idle-dialog-css';
  var CSS = [
    '.mm-idle{',
    // Adopt the page's design tokens when it has them; the fallbacks are the
    // light palette, which is what the token-less pages render in.
    '  --mmi-panel: var(--cr-bg-panel, #ffffff);',
    '  --mmi-ink: var(--cr-text, #18202b);',
    '  --mmi-dim: var(--cr-text-dim, #5b6876);',
    '  --mmi-accent: var(--cr-accent, #6c5ce7);',
    '  --mmi-accent-strong: var(--cr-accent-strong, #4d3dd1);',
    '  --mmi-warn: var(--cr-warning, #d97706);',
    '  --mmi-border: var(--cr-border-strong, rgba(16,24,40,.12));',
    '  position: fixed; inset: 0; z-index: 2147483000;',
    '  display: flex; align-items: center; justify-content: center;',
    '  padding: 20px;',
    '  background: rgba(11,15,26,.55); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);',
    '  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;',
    '  animation: mm-idle-fade .18s ease both;',
    '}',
    '@keyframes mm-idle-fade{from{opacity:0}to{opacity:1}}',
    '@keyframes mm-idle-rise{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}',
    '.mm-idle-card{',
    '  width: 100%; max-width: 420px; box-sizing: border-box;',
    '  background: var(--mmi-panel); color: var(--mmi-ink);',
    '  border: 1px solid var(--mmi-border); border-radius: 18px;',
    '  padding: 26px 26px 22px; text-align: center;',
    '  box-shadow: 0 18px 48px rgba(0,0,0,.28);',
    '  animation: mm-idle-rise .22s cubic-bezier(.2,1,.3,1) both;',
    '}',
    '.mm-idle-ic{',
    '  width: 46px; height: 46px; margin: 0 auto 14px; border-radius: 50%;',
    '  display: flex; align-items: center; justify-content: center; font-size: 22px;',
    '  background: color-mix(in srgb, var(--mmi-warn) 16%, transparent);',
    '}',
    '.mm-idle-t{ margin: 0 0 8px; font-size: 19px; font-weight: 700; letter-spacing: -.01em; }',
    '.mm-idle-b{ margin: 0; font-size: 14.5px; line-height: 1.55; color: var(--mmi-dim); }',
    '.mm-idle-count{',
    '  display: block; margin: 16px auto 4px;',
    '  font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums;',
    '  color: var(--mmi-ink); letter-spacing: .01em;',
    '}',
    '.mm-idle-acts{ display: flex; flex-direction: column; gap: 9px; margin-top: 20px; }',
    '.mm-idle-btn{',
    '  width: 100%; padding: 12px 18px; border-radius: 12px; cursor: pointer;',
    '  font: 600 14.5px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;',
    '  border: 1px solid transparent; transition: filter .15s ease, background .15s ease;',
    '}',
    '.mm-idle-btn:focus-visible{ outline: 2px solid var(--mmi-accent); outline-offset: 2px; }',
    '.mm-idle-btn.is-primary{ background: var(--mmi-accent); color: #fff; }',
    '.mm-idle-btn.is-primary:hover{ background: var(--mmi-accent-strong); }',
    '.mm-idle-btn.is-ghost{ background: transparent; color: var(--mmi-dim); border-color: var(--mmi-border); }',
    '.mm-idle-btn.is-ghost:hover{ color: var(--mmi-ink); background: color-mix(in srgb, var(--mmi-ink) 6%, transparent); }',
    '.mm-idle-sr{ position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0; }',
    '@media (prefers-reduced-motion: reduce){ .mm-idle, .mm-idle-card{ animation: none; } }',
    '@media (max-width: 420px){ .mm-idle-card{ padding: 22px 18px 18px; } .mm-idle-count{ font-size: 26px; } }',
  ].join('\n');

  function injectCss(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    var st = doc.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(st);
  }

  var open = null;   // { el, tick, restoreFocus, onEscape }

  function close() {
    if (!open) return;
    if (open.tick) clearInterval(open.tick);
    if (open.autoTimer) clearTimeout(open.autoTimer);
    document.removeEventListener('keydown', open.onKeydown, true);
    if (open.el.parentNode) open.el.parentNode.removeChild(open.el);
    var restore = open.restoreFocus;
    open = null;
    // Give focus back to whatever the student was on, so a keyboard user is
    // not dumped at the top of the document.
    try { if (restore && restore.focus) restore.focus(); } catch (_) { /* gone */ }
  }

  function mmss(ms) {
    var total = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /**
   * Build the shell. `buttons` is [{ label, kind, onClick }] in visual order;
   * the first is the one focus lands on, so it must always be the safe choice.
   */
  function build(opts) {
    close();
    var doc = document;
    injectCss(doc);

    var el = doc.createElement('div');
    el.className = 'mm-idle';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'mm-idle-t');
    el.setAttribute('aria-describedby', 'mm-idle-b');

    var card = doc.createElement('div');
    card.className = 'mm-idle-card';

    var ic = doc.createElement('div');
    ic.className = 'mm-idle-ic';
    ic.setAttribute('aria-hidden', 'true');
    ic.textContent = opts.icon || '⏳';

    var h = doc.createElement('h2');
    h.className = 'mm-idle-t'; h.id = 'mm-idle-t';
    h.textContent = opts.title;

    var p = doc.createElement('p');
    p.className = 'mm-idle-b'; p.id = 'mm-idle-b';
    p.textContent = opts.body;

    card.appendChild(ic); card.appendChild(h); card.appendChild(p);

    var count = null;
    var live = null;
    if (opts.countdown) {
      count = doc.createElement('strong');
      count.className = 'mm-idle-count';
      // The seconds tick once a second — announcing that would flood a screen
      // reader. The visual number is hidden from AT and a polite region below
      // carries the same information at whole-minute granularity instead.
      count.setAttribute('aria-hidden', 'true');
      live = doc.createElement('span');
      live.className = 'mm-idle-sr';
      live.setAttribute('aria-live', 'polite');
      card.appendChild(count); card.appendChild(live);
    }

    var acts = doc.createElement('div');
    acts.className = 'mm-idle-acts';
    var first = null;
    (opts.buttons || []).forEach(function (b) {
      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'mm-idle-btn is-' + (b.kind || 'ghost');
      btn.textContent = b.label;
      btn.addEventListener('click', function (ev) {
        // Never let the click reach the document-level activity listeners that
        // reset the very timer this dialog is asking about — the caller
        // decides what the answer means, not the click.
        ev.stopPropagation();
        var fn = b.onClick;
        close();
        if (fn) fn();
      });
      acts.appendChild(btn);
      if (!first) first = btn;
    });
    card.appendChild(acts);
    el.appendChild(card);

    // The scrim swallows clicks: dismissing by missing the card is not an
    // answer to "are you still there?".
    el.addEventListener('click', function (ev) { ev.stopPropagation(); });

    open = {
      el: el,
      restoreFocus: doc.activeElement,
      count: count,
      live: live,
      onKeydown: function (ev) {
        if (!open) return;
        if (ev.key === 'Escape') {
          // Escape takes the safe branch (stay signed in), never the
          // destructive one.
          ev.preventDefault(); ev.stopPropagation();
          if (first) first.click();
          return;
        }
        if (ev.key !== 'Tab') return;
        // Trap focus: the dialog is the only thing on the page that matters.
        var f = el.querySelectorAll('button');
        if (!f.length) return;
        var lo = f[0], hi = f[f.length - 1];
        if (ev.shiftKey && doc.activeElement === lo) { ev.preventDefault(); hi.focus(); }
        else if (!ev.shiftKey && doc.activeElement === hi) { ev.preventDefault(); lo.focus(); }
      },
    };

    doc.addEventListener('keydown', open.onKeydown, true);
    (doc.body || doc.documentElement).appendChild(el);
    if (first) first.focus();
    return open;
  }

  var api = {
    /**
     * The idle warning, with a countdown that actually counts down.
     * `msRemaining` is re-read from `getRemaining()` every second when the
     * caller supplies one, so the number stays honest if the page was
     * throttled in a background tab.
     */
    warn: function (opts) {
      opts = opts || {};
      var getRemaining = opts.getRemaining || function () { return opts.msRemaining || 0; };
      var state = build({
        icon: '⏳',
        title: opts.title || 'Still there?',
        body: opts.body || 'You’ve been idle for a while, so we’ll sign you out to keep your account safe.',
        countdown: true,
        buttons: [
          { label: opts.stayLabel || 'I’m still here', kind: 'primary', onClick: opts.onStay },
          { label: opts.signOutLabel || 'Sign out now', kind: 'ghost', onClick: opts.onSignOut },
        ],
      });

      var lastMinute = -1;
      function paint() {
        if (!open || open !== state) return;
        var ms = getRemaining();
        state.count.textContent = mmss(ms);
        var mins = Math.ceil(ms / 60000);
        if (mins !== lastMinute) {
          lastMinute = mins;
          state.live.textContent = mins > 1
            ? 'Signing out in about ' + mins + ' minutes.'
            : 'Signing out in less than a minute.';
        }
        if (ms <= 0) { clearInterval(state.tick); state.tick = null; }
      }
      paint();
      state.tick = setInterval(paint, 1000);
      return state;
    },

    /** A one-button notice — what alert() was doing, without blocking. */
    notice: function (opts) {
      opts = opts || {};
      var state = build({
        icon: opts.icon || '👋',
        title: opts.title || 'You’ve been signed out',
        body: opts.body || 'We signed you out after a long stretch of inactivity.',
        buttons: [{ label: opts.actionLabel || 'Sign in again', kind: 'primary', onClick: opts.onAction }],
      });
      // Don't strand someone who never clicks — the page behind them is dead.
      if (opts.autoMs && opts.onAction) {
        state.autoTimer = setTimeout(function () { close(); opts.onAction(); }, opts.autoMs);
      }
      return state;
    },

    close: close,
    isOpen: function () { return !!open; },
  };

  root.MMIdleDialog = api;
})(window);

;
/* --- /js/auto-logout.js --- */
/**
 * AUTO-LOGOUT MANAGER
 *
 * Handles automatic logout in two scenarios:
 * 1. Inactivity timeout (30 minutes default)
 * 2. Manual logout button (handled elsewhere)
 *
 * The idle timeout continues to count even when the tab is hidden/minimized.
 * When the tab becomes visible again, we check if the timeout has already
 * elapsed and immediately log out if so.
 *
 * The warning and the timed-out notice render through MMIdleDialog
 * (js/idle-dialog.js), NOT confirm()/alert(). Beyond looking like the product,
 * that matters behaviourally: confirm() blocks the event loop, so the "2
 * minutes" the copy promised could never tick down, and the logout timer fired
 * the instant a returning student dismissed it. The styled dialog is
 * non-blocking, so the countdown is real and the grace period is real.
 */

(function() {
  'use strict';

  // Configuration
  const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
  const WARNING_BEFORE_LOGOUT = 2 * 60 * 1000; // Warn 2 minutes before logout
  const SESSION_KEY = 'mathmatix_tab_session_active';

  let inactivityTimer = null;
  let warningTimer = null;
  let warningShown = false;
  let lastActivityTime = Date.now(); // Track the actual wall-clock time of last activity

  /**
   * Perform logout - destroys server session via the CSRF-exempt endpoint
   */
  function performLogout() {
    // Clear ALL session storage (including tab session flag)
    if (window.StorageUtils) {
      StorageUtils.session.clear();
    } else {
      try {
        sessionStorage.clear();
      } catch (e) {
        console.warn('[Auto-Logout] Could not clear sessionStorage:', e);
      }
    }

    // Clear UI language cache so next user on shared device gets a clean state.
    // Guarded like the block above it: this line was bare, so on any page that
    // ever loads auto-logout.js without storage-utils.js it throws a
    // ReferenceError, the rest of performLogout never runs, and the timeout
    // silently does nothing at all — no beacon, no redirect. Every page
    // currently loads both; this just stops that being load-bearing.
    if (window.StorageUtils) StorageUtils.local.removeItem('mathmatix_ui_lang');

    // Use the CSRF-exempt /api/session/end endpoint (sendBeacon can't send CSRF headers).
    // This endpoint destroys the express session on the server side.
    const payload = JSON.stringify({ reason: 'auto_logout', destroySession: true });
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon('/api/session/end', blob);
  }

  /**
   * Log out and tell the student why, without a blocking alert() sitting
   * between them and the login page.
   */
  function logoutWithNotice() {
    performLogout();
    const go = () => { window.location.href = '/login.html'; };
    if (!window.MMIdleDialog) { go(); return; }
    window.MMIdleDialog.notice({
      title: 'You’ve been signed out',
      body: 'We signed you out after a long stretch of inactivity. Your work is saved.',
      actionLabel: 'Sign in again',
      onAction: go,
      autoMs: 8000,
    });
  }

  /**
   * Show inactivity warning.
   *
   * While it is up, `resetInactivityTimer` ignores activity events — answering
   * "are you still there?" is what the buttons are for. The native confirm()
   * this replaced got that for free by freezing the event loop; without the
   * guard, any stray click would silently re-arm the timer and leave the
   * dialog on screen with nothing behind it.
   */
  function showInactivityWarning() {
    if (warningShown) return;
    warningShown = true;

    const deadline = lastActivityTime + INACTIVITY_TIMEOUT;

    const stay = () => {
      warningShown = false;          // must clear BEFORE the reset guard runs
      lastActivityTime = Date.now();
      resetInactivityTimer();
    };
    const signOut = () => {
      performLogout();
      window.location.href = '/login.html';
    };

    if (!window.MMIdleDialog) {
      // idle-dialog.js missing (page didn't load it) — keep the old prompt
      // rather than silently dropping the warning entirely.
      const mins = Math.ceil(WARNING_BEFORE_LOGOUT / 60000);
      if (confirm(`You will be signed out in ${mins} minutes due to inactivity.\n\nOK to stay signed in, Cancel to sign out now.`)) stay();
      else signOut();
      return;
    }

    window.MMIdleDialog.warn({
      // Read the deadline live so the number stays honest even if the tab was
      // throttled while hidden.
      getRemaining: () => deadline - Date.now(),
      onStay: stay,
      onSignOut: signOut,
    });
  }

  /**
   * Reset inactivity timer
   */
  function resetInactivityTimer() {
    // The warning dialog is a question. Until it is answered, a stray click or
    // keypress must not answer it for the student.
    if (warningShown) return;

    // Clear existing timers
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (warningTimer) clearTimeout(warningTimer);
    warningShown = false;
    lastActivityTime = Date.now();

    // Set warning timer (fires before logout)
    warningTimer = setTimeout(() => {
      showInactivityWarning();
    }, INACTIVITY_TIMEOUT - WARNING_BEFORE_LOGOUT);

    // Set logout timer (fires after full timeout)
    inactivityTimer = setTimeout(() => {
      console.log('[Auto-Logout] Session timed out due to inactivity');
      logoutWithNotice();
    }, INACTIVITY_TIMEOUT);
  }

  /**
   * Mark tab session as active (set on every protected page load)
   */
  function activateTabSession() {
    if (window.StorageUtils) {
      StorageUtils.session.setItem(SESSION_KEY, 'true');
    } else {
      try {
        sessionStorage.setItem(SESSION_KEY, 'true');
      } catch (e) {
        console.warn('[Auto-Logout] Could not set sessionStorage:', e);
      }
    }
    console.log('[Auto-Logout] Tab session activated');
  }

  /**
   * Initialize auto-logout
   */
  function initialize() {
    // Skip if on login/signup pages (user not authenticated yet)
    const publicPages = ['/login.html', '/signup.html', '/index.html', '/privacy.html', '/terms.html'];
    const currentPage = window.location.pathname;

    if (publicPages.some(page => currentPage.endsWith(page))) {
      console.log('[Auto-Logout] Skipping - public page');
      return;
    }

    // Activate tab session (set flag in sessionStorage)
    activateTabSession();

    console.log('[Auto-Logout] Initialized with inactivity timeout');

    // 1. INACTIVITY TIMEOUT
    // Listen for user activity events
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach(event => {
      document.addEventListener(event, resetInactivityTimer, { passive: true });
    });

    // Start the timer
    resetInactivityTimer();

    // 2. VISIBILITY CHANGE - check elapsed idle time when tab becomes visible again.
    // Timers are NOT paused when the tab is hidden; they continue running.
    // However, browsers may throttle setTimeout in background tabs, so when the
    // tab becomes visible we check if the timeout has already elapsed.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        // Tab just became visible - check how long user was actually idle
        const idleMs = Date.now() - lastActivityTime;

        if (idleMs >= INACTIVITY_TIMEOUT) {
          // Already past timeout - log out immediately
          console.log('[Auto-Logout] Tab returned after idle timeout elapsed');
          performLogout();
          window.location.href = '/login.html';
        } else if (idleMs >= INACTIVITY_TIMEOUT - WARNING_BEFORE_LOGOUT) {
          // In the warning window - show warning and restart timer for remaining time
          if (inactivityTimer) clearTimeout(inactivityTimer);
          if (warningTimer) clearTimeout(warningTimer);

          const remaining = INACTIVITY_TIMEOUT - idleMs;
          inactivityTimer = setTimeout(() => {
            console.log('[Auto-Logout] Session timed out due to inactivity');
            logoutWithNotice();
          }, remaining);

          showInactivityWarning();
        }
        // If less than warning threshold, timers are still running correctly
      }
    });

    // 3. STORAGE EVENT (for cross-tab logout sync)
    // If user logs out in one tab, logout in all tabs
    window.addEventListener('storage', (event) => {
      if (event.key === 'logout-event') {
        console.log('[Auto-Logout] Logout detected in another tab');
        // Clear all session data
        if (window.StorageUtils) {
          StorageUtils.session.clear();
        } else {
          try {
            sessionStorage.clear();
          } catch (e) {
            console.warn('[Auto-Logout] Could not clear sessionStorage:', e);
          }
        }
        window.location.href = '/login.html';
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  // Expose logout function globally for manual logout buttons
  window.triggerLogout = function() {
    // Set storage event to logout all tabs
    if (window.StorageUtils) {
      StorageUtils.local.setItem('logout-event', Date.now().toString());
      StorageUtils.local.removeItem('logout-event'); // Clean up
    } else {
      try {
        localStorage.setItem('logout-event', Date.now().toString());
        localStorage.removeItem('logout-event'); // Clean up
      } catch (e) {
        console.warn('[Auto-Logout] Could not access localStorage for cross-tab logout:', e);
      }
    }

    performLogout(); // This clears sessionStorage
    window.location.href = '/login.html';
  };

  // Expose session activation for login page
  window.activateTabSession = activateTabSession;

})();

;
/* --- /js/admin-dashboard.js?v=2.4 --- */
/**
 * M∆THM∆TIΧ AI - Admin Dashboard Script
 *
 * Manages all functionality for the admin dashboard, including fetching
 * and displaying user data, handling teacher assignments, and providing
 * detailed views and edits of student profiles.
 *
 * @version 2.1
 * @author Senior Developer
 */
document.addEventListener("DOMContentLoaded", async () => {
    // -------------------------------------------------------------------------
    // --- Initial Security Check ---
    // -------------------------------------------------------------------------
    try {
        const response = await fetch('/user', { credentials: 'include' });
        if (!response.ok) throw new Error("Not Authenticated");
        const { user } = await response.json();
        if (!user || user.role !== 'admin') {
            throw new Error("Access Denied");
        }
        // Expose on window so shared viewers (e.g. teacher-transcripts.js) can
        // route admin requests to the /api/admin/* endpoint.
        window.currentUser = user;
    } catch (err) {
        // If the user is not an admin, redirect them to the login page.
        window.location.href = '/login.html';
        return; // Halt script execution
    }

    // -------------------------------------------------------------------------
    // --- DOM Element Caching ---
    // -------------------------------------------------------------------------
    const teacherSelect = document.getElementById("teacherSelect");
    const assignButton = document.getElementById("assignButton");
    const studentSearch = document.getElementById("studentSearch");
    const userTableBody = document.getElementById("userTableBody");
    const studentDetailModal = document.getElementById("studentDetailModal");
    const closeModalButton = document.getElementById("closeModalButton");
    const saveChangesButton = document.getElementById("saveChangesButton");
    const cancelButton = document.getElementById("cancelButton");
    const studentProfileForm = document.getElementById("studentProfileForm");
    const studentIepForm = document.getElementById("studentIepForm");
    const modalStudentName = document.getElementById("modalStudentName");
    const modalStudentId = document.getElementById("modalStudentId");
    const conversationSummariesList = document.getElementById("conversationSummariesList");
    const iepGoalsList = document.getElementById("iepGoalsList");
    const adminAddIepGoalBtn = document.getElementById("admin-add-iep-goal-btn");

    // -------------------------------------------------------------------------
    // --- Toast Notification System ---
    // -------------------------------------------------------------------------

    function showToast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const iconMap = { success: 'check-circle', error: 'exclamation-circle', warning: 'exclamation-triangle', info: 'info-circle' };
        toast.innerHTML = `
            <i class="fas fa-${iconMap[type] || iconMap.info}"></i>
            <span>${message}</span>
            <button class="toast-close" aria-label="Dismiss">&times;</button>
        `;

        toast.querySelector('.toast-close').addEventListener('click', () => dismiss(toast));
        container.appendChild(toast);

        const timer = setTimeout(() => dismiss(toast), duration);

        function dismiss(el) {
            clearTimeout(timer);
            el.classList.add('toast-out');
            el.addEventListener('animationend', () => el.remove());
        }
    }

    // -------------------------------------------------------------------------
    // --- Debounce Utility ---
    // -------------------------------------------------------------------------

    function debounce(fn, delay) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // -------------------------------------------------------------------------
    // --- Skeleton Loading ---
    // -------------------------------------------------------------------------

    function showUserTableSkeleton() {
        const skeleton = document.getElementById('userTableSkeleton');
        const tableContainer = document.getElementById('userTableContainer');
        if (skeleton) skeleton.style.display = 'block';
        if (tableContainer) tableContainer.style.display = 'none';
    }

    function hideUserTableSkeleton() {
        const skeleton = document.getElementById('userTableSkeleton');
        const tableContainer = document.getElementById('userTableContainer');
        if (skeleton) skeleton.style.display = 'none';
        if (tableContainer) tableContainer.style.display = 'block';
    }

    // -------------------------------------------------------------------------
    // --- State Management ---
    // -------------------------------------------------------------------------
    // `students` holds ONE PAGE of the directory, not the whole thing. Search,
    // role filter and sort are applied by the server (GET /api/admin/users), so
    // nothing here may assume it can see a user that isn't on screen.
    let students = [];
    let teacherMap = new Map(); // Use a Map for efficient O(1) teacher lookups.

    // The query that produced `students`. Every control that narrows the list
    // writes here and calls fetchUsers() — there is no client-side filtering.
    const userQuery = { page: 1, limit: 50, search: '', role: '', sort: 'newest' };
    // Server-reported totals for the CURRENT query, plus whole-directory role
    // counts for the stat cards.
    let userPageInfo = { total: 0, totalPages: 1, counts: null };
    // Guards against an older, slower response overwriting a newer one when an
    // admin types faster than the network answers.
    let userFetchSeq = 0;

    // The user table's header "select all" checkbox. This was looked up as
    // 'selectAllStudents' while the markup has always called it
    // 'selectAllCheckbox', so getElementById returned null, the change listener
    // never bound, and the header checkbox did nothing at all. Named once here
    // so the id has a single source of truth.
    const SELECT_ALL_ID = 'selectAllCheckbox';

    // Bulk selection: id -> the user record, NOT just the id. Selection now
    // outlives the page it was made on (select five on page 1, page forward,
    // select three more, export all eight), and the CSV export used to rebuild
    // rows by looking ids up in the loaded array — which no longer holds
    // everything selected. Declared up here with the rest of the state because
    // renderStudents() reads it on first paint.
    const selectedUsers = new Map();

    // -------------------------------------------------------------------------
    // --- Modal Control ---
    // -------------------------------------------------------------------------
    // The modal supports URL deep-linking via ?user=<id>. Opening pushes
    // the id into the query string (replaceState — no history pollution
    // on every cell click), closing strips it. A reload of the page with
    // ?user=<id> in the URL will re-open the detail view (handled in
    // initializeDashboard once the user list has loaded).
    const setUserParam = (id) => {
        try {
            const url = new URL(window.location.href);
            if (id) url.searchParams.set('user', id);
            else url.searchParams.delete('user');
            window.history.replaceState({}, '', url.toString());
        } catch (_) { /* same-origin safety; ignore */ }
    };
    const openModal = (id) => {
        studentDetailModal?.classList.add('is-visible');
        if (id) setUserParam(id);
    };
    const closeModal = () => {
        studentDetailModal?.classList.remove('is-visible');
        setUserParam(null);
    };

    // ---- Teacher detail modal control ----
    // Same deep-link contract as ?user= but on a separate query key so both
    // modals can coexist (e.g. arriving via ?teacher=<id> while a student
    // detail is also being viewed in a different tab).
    const teacherDetailModal = document.getElementById('teacherDetailModal');
    const closeTeacherModalButton = document.getElementById('closeTeacherModalButton');
    const teacherClassesList = document.getElementById('teacherClassesList');
    const teacherRosterSection = document.getElementById('teacherRosterSection');
    const teacherRosterList = document.getElementById('teacherRosterList');
    const teacherRosterClassName = document.getElementById('teacherRosterClassName');

    const setTeacherParam = (id) => {
        try {
            const url = new URL(window.location.href);
            if (id) url.searchParams.set('teacher', id);
            else url.searchParams.delete('teacher');
            window.history.replaceState({}, '', url.toString());
        } catch (_) { /* same-origin safety; ignore */ }
    };
    const openTeacherModalUI = (id) => {
        teacherDetailModal?.classList.add('is-visible');
        if (id) setTeacherParam(id);
    };
    const closeTeacherModal = () => {
        teacherDetailModal?.classList.remove('is-visible');
        setTeacherParam(null);
        if (teacherRosterSection) teacherRosterSection.hidden = true;
        if (teacherRosterList) teacherRosterList.innerHTML = '';
    };

    closeTeacherModalButton?.addEventListener('click', closeTeacherModal);
    teacherDetailModal?.addEventListener('click', (e) => {
        if (e.target === teacherDetailModal) closeTeacherModal();
    });

    // `user.role` is only the role the account is CURRENTLY viewing; `user.roles[]`
    // is every role it holds. Filtering on `role` alone hides multi-role accounts
    // (e.g. an admin who is also a parent never appears in the parent lists).
    function userHasRole(user, roleName) {
        if (!user) return false;
        if (Array.isArray(user.roles) && user.roles.length > 0) {
            return user.roles.includes(roleName);
        }
        return user.role === roleName;
    }

    function isTeacherUser(user) {
        return userHasRole(user, 'teacher');
    }

    function getInitials(firstName, lastName) {
        const f = (firstName || '').trim().charAt(0).toUpperCase();
        const l = (lastName || '').trim().charAt(0).toUpperCase();
        return (f + l) || '?';
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function statusPillClass(status) {
        // Backend returns 'active' | 'struggling' | 'inactive'; map struggling
        // to the existing .watch pill so colors line up with the teacher view.
        if (status === 'struggling') return 'watch';
        if (status === 'inactive') return 'inactive';
        return 'active';
    }

    function formatLastActivity(date) {
        if (!date) return 'No activity yet';
        return new Date(date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    }

    async function openTeacherModal(teacherId) {
        if (!teacherDetailModal) return;
        openTeacherModalUI(teacherId);

        // Reset header + body while we fetch so a previously-open teacher's
        // data doesn't bleed into the next one.
        document.getElementById('teacherModalAvatar').textContent = '…';
        document.getElementById('teacherModalName').textContent = 'Loading…';
        document.getElementById('teacherModalEmail').textContent = '';
        document.getElementById('teacherModalSummary').textContent = '';
        if (teacherRosterSection) teacherRosterSection.hidden = true;
        if (teacherRosterList) teacherRosterList.innerHTML = '';
        if (teacherClassesList) teacherClassesList.innerHTML = '<div class="teacher-classes-loading">Loading classes…</div>';

        try {
            const res = await fetch(`/api/admin/teachers/${teacherId}/classes`, { credentials: 'include' });
            if (!res.ok) throw new Error(`Server returned ${res.status}`);
            const data = await res.json();
            renderTeacherModal(teacherId, data);
        } catch (err) {
            console.error('Error loading teacher detail:', err);
            if (teacherClassesList) {
                teacherClassesList.innerHTML = '<div class="teacher-classes-empty">Could not load this teacher\'s classes.</div>';
            }
            const fallback = students.find(s => s._id === teacherId);
            if (fallback) {
                document.getElementById('teacherModalAvatar').textContent = getInitials(fallback.firstName, fallback.lastName);
                document.getElementById('teacherModalName').textContent = `${fallback.firstName || ''} ${fallback.lastName || ''}`.trim() || 'Teacher';
                document.getElementById('teacherModalEmail').textContent = fallback.email || '';
            }
        }
    }

    function renderTeacherModal(teacherId, data) {
        const teacher = data.teacher || {};
        const classes = data.classes || [];

        document.getElementById('teacherModalAvatar').textContent = getInitials(teacher.firstName, teacher.lastName);
        document.getElementById('teacherModalName').textContent = `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || 'Teacher';
        document.getElementById('teacherModalEmail').textContent = teacher.email || '';

        const totalStudents = classes.reduce((sum, c) => sum + (c.studentCount || 0), 0);
        document.getElementById('teacherModalSummary').textContent =
            `${classes.length} class${classes.length === 1 ? '' : 'es'} · ${totalStudents} student${totalStudents === 1 ? '' : 's'} total`;

        if (!teacherClassesList) return;
        if (classes.length === 0) {
            teacherClassesList.innerHTML = '<div class="teacher-classes-empty">This teacher has not created any classes yet.</div>';
            return;
        }

        teacherClassesList.innerHTML = classes.map(c => {
            const usage = c.usage || {};
            return `
            <button type="button" class="teacher-class-card" data-classid="${escapeHtml(c._id)}" data-classname="${escapeHtml(c.className || '')}">
                <div class="teacher-class-card-head">
                    <span class="teacher-class-name">${escapeHtml(c.className || 'Untitled class')}</span>
                    <span class="teacher-class-code" title="Click to copy code" data-code="${escapeHtml(c.code || '')}">${escapeHtml(c.code || '—')}</span>
                </div>
                <div class="teacher-class-metrics">
                    <div class="teacher-class-metric"><strong>${c.studentCount || 0}</strong>Students</div>
                    <div class="teacher-class-metric"><strong>${usage.weeklyActiveStudents || 0}</strong>Active this week</div>
                    <div class="teacher-class-metric"><strong>${usage.weeklyMinutes || 0}</strong>Weekly minutes</div>
                    <div class="teacher-class-metric"><strong>${usage.problemsSolved || 0}</strong>Problems solved</div>
                </div>
            </button>`;
        }).join('');

        // Card click → load roster; code click → copy to clipboard.
        teacherClassesList.querySelectorAll('.teacher-class-card').forEach(card => {
            card.addEventListener('click', async (e) => {
                if (e.target.classList.contains('teacher-class-code')) {
                    e.stopPropagation();
                    const code = e.target.dataset.code || '';
                    try {
                        await navigator.clipboard.writeText(code);
                        showToast(`Copied code ${code}`, 'success', 2000);
                    } catch (_) {
                        // Clipboard API can be blocked (e.g. file://); fall back silently.
                    }
                    return;
                }
                teacherClassesList.querySelectorAll('.teacher-class-card').forEach(el => el.classList.remove('is-selected'));
                card.classList.add('is-selected');
                loadClassRoster(card.dataset.classid, card.dataset.classname);
            });
        });
    }

    async function loadClassRoster(classId, className) {
        if (!teacherRosterSection || !teacherRosterList) return;
        teacherRosterSection.hidden = false;
        if (teacherRosterClassName) teacherRosterClassName.textContent = className ? `· ${className}` : '';
        teacherRosterList.innerHTML = '<div class="teacher-roster-empty">Loading roster…</div>';

        try {
            const res = await fetch(`/api/admin/classes/${classId}/students`, { credentials: 'include' });
            if (!res.ok) throw new Error(`Server returned ${res.status}`);
            const data = await res.json();
            renderClassRoster(data);
        } catch (err) {
            console.error('Error loading class roster:', err);
            teacherRosterList.innerHTML = '<div class="teacher-roster-empty">Could not load this class roster.</div>';
        }
    }

    function renderClassRoster(data) {
        const students = data.students || [];
        if (students.length === 0) {
            teacherRosterList.innerHTML = '<div class="teacher-roster-empty">No students enrolled in this class.</div>';
            return;
        }
        teacherRosterList.innerHTML = students.map(s => {
            const name = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username || 'Student';
            const pill = statusPillClass(s.status);
            const lastLogin = s.lastLogin
                ? new Date(s.lastLogin).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '—';
            return `
            <div class="teacher-roster-row">
                <div>
                    <span class="teacher-roster-name">${escapeHtml(name)}</span>
                    <span class="teacher-roster-sub">${escapeHtml(s.email || s.username || '')}${s.gradeLevel ? ' · Grade ' + escapeHtml(s.gradeLevel) : ''}</span>
                </div>
                <span class="teacher-roster-stat"><strong>${s.weeklyMinutes || 0}</strong> wk min · <strong>L${s.level || 0}</strong> · ${lastLogin}</span>
                <span class="status-pill ${pill}">${escapeHtml(s.status || 'active')}</span>
                <button type="button" class="teacher-roster-action" data-studentid="${escapeHtml(s._id)}">View profile</button>
            </div>`;
        }).join('');

        teacherRosterList.querySelectorAll('.teacher-roster-action').forEach(btn => {
            btn.addEventListener('click', () => {
                const sid = btn.dataset.studentid;
                if (!sid) return;
                // Deep-link via ?user=<id> — handled on next load and by the
                // existing populateModal pipeline if the student is in scope.
                const url = new URL(window.location.href);
                url.searchParams.delete('teacher');
                url.searchParams.set('user', sid);
                window.location.href = url.toString();
            });
        });
    }

    // -------------------------------------------------------------------------
    // --- Data Fetching & Initialization ---
    // -------------------------------------------------------------------------

    /**
     * Fetches all necessary data from the server and initializes the dashboard.
     */
    async function initializeDashboard() {
        showUserTableSkeleton();
        try {
            const teachersRes = await fetch('/api/admin/teachers', { credentials: 'include' });
            if (!teachersRes.ok) throw new Error('Failed to load teacher data.');
            const teachers = await teachersRes.json();

            // Create a teacher lookup map for efficient name retrieval.
            teacherMap = new Map(teachers.map(t => [t._id, `${t.firstName} ${t.lastName}`]));
            renderTeacherOptions();

            // First page of the directory. Throws on failure so the catch below
            // shows the error row rather than an empty table.
            await fetchUsers({ throwOnError: true });

            hideUserTableSkeleton();
            fetchAndDisplayLeaderboard();
            fetchSystemStatus();

            // Deep-link: ?user=<id> opens that user's detail modal. The user may
            // not be on the page we just loaded, so fall back to fetching the
            // single record — before paging, "is it in the loaded set?" was the
            // same question as "does it exist?", and it no longer is.
            const params = new URLSearchParams(window.location.search);
            const deepLinkUserId = params.get('user');
            if (deepLinkUserId) {
                const known = students.some(s => s._id === deepLinkUserId);
                if (known || await loadUserIntoCache(deepLinkUserId)) {
                    populateModal(deepLinkUserId);
                }
            }
            // Parallel deep-link for the teacher drill-down. The teacher modal
            // fetches its own data, so we don't gate on whether the teacher
            // appears in the user list (admins may follow a link to a teacher
            // they haven't searched up yet).
            const deepLinkTeacherId = params.get('teacher');
            if (deepLinkTeacherId) {
                openTeacherModal(deepLinkTeacherId);
            }

        } catch (error) {
            console.error("Error initializing dashboard:", error);
            hideUserTableSkeleton();
            if(userTableBody) userTableBody.innerHTML = `<tr><td colspan="8" class="text-center">Error loading data. Please refresh.</td></tr>`;
        }
    }

    /**
     * Fetch the current page of the directory and repaint the table.
     *
     * All narrowing (search / role / sort / page) lives in `userQuery` and is
     * resolved by the server. Stale responses are dropped by sequence number.
     */
    async function fetchUsers({ throwOnError = false } = {}) {
        const seq = ++userFetchSeq;
        const params = new URLSearchParams({
            page: String(userQuery.page),
            limit: String(userQuery.limit),
            sort: userQuery.sort,
        });
        if (userQuery.search) params.set('search', userQuery.search);
        if (userQuery.role) params.set('role', userQuery.role);

        setUserTableBusy(true);
        try {
            const res = await fetch(`/api/admin/users?${params.toString()}`, { credentials: 'include' });
            if (!res.ok) throw new Error(`Failed to load users (${res.status})`);
            const data = await res.json();

            // A newer request already landed — this response is history.
            if (seq !== userFetchSeq) return;

            students = data.users || [];
            userPageInfo = {
                total: data.total || 0,
                totalPages: data.totalPages || 1,
                counts: data.counts || null,
            };

            // A filter change can leave us past the end of the result set.
            if (userQuery.page > userPageInfo.totalPages) {
                userQuery.page = userPageInfo.totalPages;
                return fetchUsers();
            }

            renderStudents();
            renderUserPagination();
            updateUserStatCards();
        } catch (error) {
            if (seq !== userFetchSeq) return;
            console.error('Error fetching users:', error);
            if (throwOnError) throw error;
            if (userTableBody) {
                userTableBody.innerHTML = `<tr><td colspan="8" class="text-center">Could not load users. <button type="button" class="btn btn-tertiary" id="retryUserFetch">Retry</button></td></tr>`;
                document.getElementById('retryUserFetch')?.addEventListener('click', () => fetchUsers());
            }
        } finally {
            if (seq === userFetchSeq) setUserTableBusy(false);
        }
    }

    /** Reset to page 1 and refetch — for any control that changes the result set. */
    function refetchUsersFromFirstPage() {
        userQuery.page = 1;
        fetchUsers();
    }

    function setUserTableBusy(busy) {
        const container = document.getElementById('userTableContainer');
        if (container) container.setAttribute('aria-busy', busy ? 'true' : 'false');
    }

    /**
     * Slim user records for a <select>, from GET /api/admin/users/lookup.
     *
     * The endpoint caps what it returns, so a directory larger than the cap
     * yields a partial list. Callers get `truncated` alongside the rows and are
     * expected to say so — a picker that silently omits people is how an admin
     * concludes an account doesn't exist.
     */
    async function fetchUserLookup({ role = '', search = '' } = {}) {
        const params = new URLSearchParams();
        if (role) params.set('role', role);
        if (search) params.set('search', search);
        const res = await fetch(`/api/admin/users/lookup?${params.toString()}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
        const data = await res.json();
        const users = data.users || [];
        users.truncated = Boolean(data.truncated);
        users.total = data.total || users.length;
        return users;
    }

    /** A trailing "…and N more" option, so a capped picker admits it's capped. */
    function truncationNotice(list) {
        if (!list.truncated) return '';
        const hidden = list.total - list.length;
        return `<option value="" disabled>— ${hidden} more not shown; use the user table to find them —</option>`;
    }

    /**
     * Pull one user into the page cache by id, for the ?user=<id> deep link when
     * that user isn't in the current page. Returns whether it landed.
     */
    async function loadUserIntoCache(userId) {
        try {
            const res = await fetch(`/api/admin/users/lookup?id=${encodeURIComponent(userId)}`, { credentials: 'include' });
            if (!res.ok) return false;
            const data = await res.json();
            const user = (data.users || [])[0];
            if (!user) return false;
            students = students.concat([user]);
            return true;
        } catch (err) {
            console.error('Deep-link user fetch failed:', err);
            return false;
        }
    }

    /**
     * Updates the user count stat cards.
     *
     * Counts come from the server and describe the whole directory — they used
     * to be derived from the loaded array, which now holds a single page and
     * would report "50 users" no matter how many exist. A multi-role account is
     * counted under every role it holds, so the role cards can sum past the total.
     */
    function updateUserStatCards() {
        const counts = userPageInfo.counts;
        if (!counts) return;

        const el = (id, val) => {
            const node = document.getElementById(id);
            if (node) node.textContent = val;
        };

        el('statTotal', counts.total ?? 0);
        el('statStudents', counts.student ?? 0);
        el('statTeachers', counts.teacher ?? 0);
        el('statParents', counts.parent ?? 0);
        el('statAdmins', counts.admin ?? 0);
    }

    /** Page indicator + prev/next, rendered under the user table. */
    function renderUserPagination() {
        const host = document.getElementById('userPagination');
        if (!host) return;

        const { total, totalPages } = userPageInfo;
        if (!total) { host.innerHTML = ''; return; }

        const first = (userQuery.page - 1) * userQuery.limit + 1;
        const last = Math.min(total, first + students.length - 1);

        host.innerHTML = `
            <div class="pagination-status" role="status" aria-live="polite">
                Showing <strong>${first}–${last}</strong> of <strong>${total}</strong>${userQuery.search || userQuery.role ? ' matching' : ''}
            </div>
            <div class="pagination-controls">
                <button type="button" class="btn btn-tertiary" id="userPagePrev" ${userQuery.page <= 1 ? 'disabled' : ''} aria-label="Previous page">
                    <i class="fas fa-chevron-left"></i> Prev
                </button>
                <span class="pagination-page">Page ${userQuery.page} of ${totalPages}</span>
                <button type="button" class="btn btn-tertiary" id="userPageNext" ${userQuery.page >= totalPages ? 'disabled' : ''} aria-label="Next page">
                    Next <i class="fas fa-chevron-right"></i>
                </button>
                <label class="pagination-size">
                    <span>Per page</span>
                    <select id="userPageSize" aria-label="Users per page">
                        ${[25, 50, 100, 200].map(n => `<option value="${n}" ${n === userQuery.limit ? 'selected' : ''}>${n}</option>`).join('')}
                    </select>
                </label>
            </div>
        `;

        document.getElementById('userPagePrev')?.addEventListener('click', () => {
            if (userQuery.page <= 1) return;
            userQuery.page -= 1;
            fetchUsers();
        });
        document.getElementById('userPageNext')?.addEventListener('click', () => {
            if (userQuery.page >= userPageInfo.totalPages) return;
            userQuery.page += 1;
            fetchUsers();
        });
        document.getElementById('userPageSize')?.addEventListener('change', (e) => {
            userQuery.limit = parseInt(e.target.value, 10) || 50;
            refetchUsersFromFirstPage();
        });
    }
    
    /**
     * Fetches and displays the top students in the leaderboard panel.
     */
    async function fetchAndDisplayLeaderboard() {
        const leaderboardTableBody = document.querySelector('#leaderboardTable tbody');
        if (!leaderboardTableBody) return;

        leaderboardTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>`;
        try {
            const response = await fetch('/api/leaderboard', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to load leaderboard');
            
            const topStudents = await response.json();
            leaderboardTableBody.innerHTML = '';
            
            if (topStudents.length === 0) {
                leaderboardTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No data available.</td></tr>';
                return;
            }

            topStudents.forEach((student, index) => {
                const row = leaderboardTableBody.insertRow();
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${student.name}</td>
                    <td>${student.level}</td>
                    <td>${student.xp}</td>
                `;
            });
        } catch (error) {
            console.error('Leaderboard error:', error);
            leaderboardTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Could not load leaderboard.</td></tr>`;
        }
    }

    /**
     * Fetches the system health and updates the status panel.
     */
    async function fetchSystemStatus() {
        const dbStatus = document.getElementById("dbStatus");
        const aiStatus = document.getElementById("aiStatus");
        const lastSyncTime = document.getElementById("lastSyncTime");
        if (!dbStatus || !aiStatus) return;

        try {
            const response = await fetch('/api/admin/health-check', { credentials: 'include' });
            if (!response.ok) throw new Error('Health check failed');
            const data = await response.json();
            dbStatus.textContent = 'Online';
            aiStatus.textContent = data.status || 'Operational';
            lastSyncTime.textContent = new Date().toLocaleTimeString();
        } catch (error) {
            dbStatus.textContent = 'Offline';
            dbStatus.className = 'status-offline'; // Assumes you have a CSS class for this
            aiStatus.textContent = 'Unknown';
        }
    }

    // -------------------------------------------------------------------------
    // --- Rendering Functions ---
    // -------------------------------------------------------------------------

    function renderTeacherOptions() {
        if (!teacherSelect) return;
        teacherSelect.innerHTML = '<option value="">Unassign</option>';
        for (const [id, name] of teacherMap.entries()) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = name;
            teacherSelect.appendChild(option);
        }
    }

    // sortStudents() lived here. Sorting is a database concern now — the same
    // six keys are whitelisted server-side in routes/admin.js (USER_SORTS), so
    // ordering holds across the whole directory rather than within one page.

    /**
     * Paint the current page. No filtering or sorting happens here — `students`
     * is already the exact set the server was asked for.
     *
     * Every user-controlled field goes through escapeHtml: names and emails are
     * attacker-supplied at signup and land in both text and attribute position.
     */
    function renderStudents() {
        if (!userTableBody) return;

        if (students.length === 0) {
            const narrowed = userQuery.search || userQuery.role;
            userTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center;">${
                narrowed ? 'No users match this search.' : 'No users found.'
            }</td></tr>`;
            return;
        }

        userTableBody.innerHTML = students.map(s => {
            const id = escapeHtml(s._id);
            const name = escapeHtml(`${s.firstName || ''} ${s.lastName || ''}`.trim());
            const rolesHeld = (s.roles && s.roles.length > 0) ? s.roles : [s.role];
            const rolesLabel = (s.roles && s.roles.length > 1)
                ? s.roles.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ')
                : (s.role || 'N/A');
            const checked = selectedUsers.has(s._id) ? ' checked' : '';
            return `
            <tr data-studentid="${id}">
                <td><input type="checkbox" class="select-student" value="${id}"${checked} aria-label="Select ${name}"></td>
                <td><a href="#" class="student-name-link">${name}</a></td>
                <td>${escapeHtml(s.email || 'N/A')}</td>
                <td>${escapeHtml(rolesLabel)}</td>
                <td>${escapeHtml(teacherMap.get(s.teacherId) || 'N/A')}</td>
                <td>${formatDate(s.createdAt)}</td>
                <td>${formatDate(s.lastLogin)}</td>
                <td>
                    <button class="btn-icon edit-roles-btn" data-userid="${id}" data-username="${name}" data-roles="${escapeHtml(rolesHeld.join(','))}" title="Edit Roles" aria-label="Edit roles for ${name}">
                        <i class="fas fa-user-tag"></i>
                    </button>
                    <button class="btn-icon view-as-user-btn" data-userid="${id}" data-username="${name}" data-role="${escapeHtml(s.role || '')}" title="View as ${name}" aria-label="View as ${name}">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon send-credentials-btn" data-userid="${id}" data-username="${name}" data-email="${escapeHtml(s.email || '')}" title="Send login credentials email" aria-label="Send credentials to ${name}">
                        <i class="fas fa-envelope"></i>
                    </button>
                    <button class="btn-icon reset-screener-btn" data-studentid="${id}" data-studentname="${name}" title="Reset Screener" aria-label="Reset screener for ${name}">
                        <i class="fas fa-redo"></i>
                    </button>
                    <button class="btn-icon btn-danger delete-user-btn" data-userid="${id}" data-username="${name}" title="Delete User" aria-label="Delete ${name}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
        }).join('');

        syncSelectAllCheckbox();
    }
    
    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    }

    /**
     * Populates the student detail modal with data for a given student ID.
     * @param {string} studentId - The ID of the student to display.
     */
    async function populateModal(studentId) {
        const student = students.find(s => s._id === studentId);
        if (!student) return;

        // --- Populate Profile & Static Data ---
        modalStudentId.value = student._id;
        modalStudentName.textContent = `${student.firstName} ${student.lastName}`;
        studentProfileForm.elements.firstName.value = student.firstName || '';
        studentProfileForm.elements.lastName.value = student.lastName || '';
        studentProfileForm.elements.username.value = student.username || '';
        studentProfileForm.elements.email.value = student.email || '';
        studentProfileForm.elements.gradeLevel.value = student.gradeLevel || '';
        studentProfileForm.elements.mathCourse.value = student.mathCourse || '';
        studentProfileForm.elements.tonePreference.value = student.tonePreference || '';
        studentProfileForm.elements.learningStyle.value = student.learningStyle || '';
        studentProfileForm.elements.interests.value = (student.interests || []).join(', ');

        // --- Populate Usage Stats ---
        document.getElementById("totalActiveTutoringMinutes").textContent = student.totalActiveTutoringMinutes || 0;
        document.getElementById("weeklyActiveTutoringMinutes").textContent = student.weeklyActiveTutoringMinutes || 0;
        document.getElementById("xpDisplay").textContent = student.xp || 0;
        document.getElementById("levelDisplay").textContent = student.level || 0;
        document.getElementById("lastLoginDisplay").textContent = formatDate(student.lastLogin);
        document.getElementById("createdAtDisplay").textContent = formatDate(student.createdAt);
        
        openModal(studentId);

        // --- Asynchronously Fetch Dynamic Data ---
        conversationSummariesList.innerHTML = '<li>Loading conversation history...</li>';
        const iepGoalsList = document.getElementById("iepGoalsList");
        if(iepGoalsList) iepGoalsList.innerHTML = 'Loading goals...';

        try {
            const [convoRes, iepRes] = await Promise.all([
                fetch(`/api/admin/students/${studentId}/conversations`, { credentials: 'include' }),
                fetch(`/api/admin/students/${studentId}/iep`, { credentials: 'include' })
            ]);

            if (convoRes.ok) {
                const conversations = await convoRes.json();
                // Each li is a trigger for the transcript viewer
                // (public/js/teacher-transcripts.js). The profile-conv-item
                // class picks up the existing hover/focus styling from
                // transcript-viewer.css so admins see the same affordance.
                conversationSummariesList.innerHTML = conversations.length > 0
                    ? conversations
                        .sort((a, b) => new Date(b.date || b.startDate) - new Date(a.date || a.startDate))
                        .map(s => `<li class="profile-conv-item"
                                       data-student-id="${studentId}"
                                       data-conversation-id="${s._id}"
                                       role="button"
                                       tabindex="0"
                                       title="View full transcript"><strong>${formatDate(s.date || s.startDate)}:</strong> ${s.summary || ''}</li>`)
                        .join('')
                    : '<li>No conversation history found.</li>';
            } else {
                conversationSummariesList.innerHTML = '<li>Error loading conversation history.</li>';
            }

            if (iepRes.ok) {
                const iepPlan = await iepRes.json();
                const accom = iepPlan?.accommodations || {};

                // Load standard accommodations
                studentIepForm.elements.extendedTime.checked = !!accom.extendedTime;
                studentIepForm.elements.reducedDistraction.checked = !!accom.reducedDistraction;
                studentIepForm.elements.calculatorAllowed.checked = !!accom.calculatorAllowed;
                studentIepForm.elements.audioReadAloud.checked = !!accom.audioReadAloud;
                studentIepForm.elements.chunkedAssignments.checked = !!accom.chunkedAssignments;
                studentIepForm.elements.breaksAsNeeded.checked = !!accom.breaksAsNeeded;
                studentIepForm.elements.digitalMultiplicationChart.checked = !!accom.digitalMultiplicationChart;
                studentIepForm.elements.largePrintHighContrast.checked = !!accom.largePrintHighContrast;
                studentIepForm.elements.mathAnxietySupport.checked = !!accom.mathAnxietySupport;

                // Load custom accommodations
                studentIepForm.elements.customAccommodations.value = (accom.custom || []).join('\n');

                // Load other fields
                studentIepForm.elements.readingLevel.value = iepPlan?.readingLevel || '';
                studentIepForm.elements.preferredScaffolds.value = (iepPlan?.preferredScaffolds || []).join(', ');

                // Load goals
                if (iepGoalsList) {
                    iepGoalsList.innerHTML = '';
                    (iepPlan.goals || []).forEach(goal => addAdminIepGoalToUI(goal));
                }
            } else {
                 if(iepGoalsList) iepGoalsList.innerHTML = '<li>Could not load IEP data.</li>';
            }

        } catch (error) {
            console.error("Failed to load dynamic modal data:", error);
            conversationSummariesList.innerHTML = '<li>Error loading data.</li>';
        }
    }

    // -------------------------------------------------------------------------
    // --- IEP Goal Helpers ---
    // -------------------------------------------------------------------------

    function addAdminIepGoalToUI(goal = {}) {
        if (!iepGoalsList) return;
        const li = document.createElement('li');
        li.className = 'iep-goal-item';
        li.style.cssText = 'list-style:none;border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:10px;';
        li.innerHTML = `
            <label>Description:</label>
            <textarea class="goal-description" rows="2" required style="width:100%;margin-bottom:6px;">${goal.description || ''}</textarea>
            <div style="display:flex;gap:10px;margin-top:5px;">
                <div style="flex:1;">
                    <label>Target Date:</label>
                    <input type="date" class="goal-target-date" value="${goal.targetDate ? new Date(goal.targetDate).toISOString().substring(0, 10) : ''}" />
                </div>
                <div style="flex:1;">
                    <label>Progress (%):</label>
                    <input type="number" class="goal-progress" min="0" max="100" value="${goal.currentProgress || 0}" />
                </div>
            </div>
            <label>Measurement Method:</label>
            <input type="text" class="goal-method" value="${goal.measurementMethod || ''}" placeholder="e.g., Quiz scores, Observation" style="width:100%;margin-bottom:6px;" />
            <label>Status:</label>
            <select class="goal-status">
                <option value="active" ${goal.status === 'active' ? 'selected' : ''}>Active</option>
                <option value="completed" ${goal.status === 'completed' ? 'selected' : ''}>Completed</option>
                <option value="on-hold" ${goal.status === 'on-hold' ? 'selected' : ''}>On-Hold</option>
            </select>
            <button type="button" class="remove-goal-btn btn" style="margin-top:6px;color:#e74c3c;border:1px solid #e74c3c;background:transparent;cursor:pointer;">Remove Goal</button>
        `;
        iepGoalsList.appendChild(li);
        li.querySelector('.remove-goal-btn').addEventListener('click', () => li.remove());
    }

    function getAdminIepGoalsFromUI() {
        if (!iepGoalsList) return [];
        return Array.from(iepGoalsList.querySelectorAll('.iep-goal-item')).map(item => ({
            description: item.querySelector('.goal-description').value,
            targetDate: item.querySelector('.goal-target-date').value,
            currentProgress: parseFloat(item.querySelector('.goal-progress').value) || 0,
            measurementMethod: item.querySelector('.goal-method').value,
            status: item.querySelector('.goal-status').value,
        }));
    }

    if (adminAddIepGoalBtn) {
        adminAddIepGoalBtn.addEventListener('click', () => addAdminIepGoalToUI());
    }

    // -------------------------------------------------------------------------
    // --- Event Handlers ---
    // -------------------------------------------------------------------------

    if (userTableBody) {
        userTableBody.addEventListener('click', async (e) => {
            // Handle student name link click — route by role so teachers open
            // the drill-down modal and everyone else opens the student profile.
            const link = e.target.closest('.student-name-link');
            if (link) {
                e.preventDefault();
                const userId = link.closest('tr')?.dataset.studentid;
                if (userId) {
                    const target = students.find(s => s._id === userId);
                    if (isTeacherUser(target)) {
                        openTeacherModal(userId);
                    } else {
                        populateModal(userId);
                    }
                }
                return;
            }

            // Handle edit roles button click
            const editRolesBtn = e.target.closest('.edit-roles-btn');
            if (editRolesBtn) {
                e.preventDefault();
                e.stopPropagation();
                const userId = editRolesBtn.dataset.userid;
                const username = editRolesBtn.dataset.username;
                const currentRoles = editRolesBtn.dataset.roles.split(',');

                // Remove any existing popover
                document.querySelectorAll('.roles-popover').forEach(el => el.remove());

                // Create popover
                const popover = document.createElement('div');
                popover.className = 'roles-popover';
                popover.style.cssText = 'position:absolute;z-index:1000;background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;box-shadow:0 4px 12px rgba(0,0,0,0.15);min-width:180px;';
                popover.innerHTML = `
                    <div style="font-weight:600;margin-bottom:8px;font-size:0.9em;">${username}</div>
                    ${['student','teacher','parent','admin'].map(r => `
                        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:4px;font-size:0.9em;">
                            <input type="checkbox" class="role-cb" value="${r}" ${currentRoles.includes(r) ? 'checked' : ''}>
                            ${r.charAt(0).toUpperCase() + r.slice(1)}
                        </label>
                    `).join('')}
                    <div style="display:flex;gap:6px;margin-top:10px;">
                        <button class="btn btn-primary save-roles-btn" style="padding:4px 12px;font-size:0.85em;">Save</button>
                        <button class="btn btn-tertiary cancel-roles-btn" style="padding:4px 12px;font-size:0.85em;">Cancel</button>
                    </div>
                `;

                // Position near the button
                editRolesBtn.closest('td').style.position = 'relative';
                editRolesBtn.closest('td').appendChild(popover);

                // Cancel
                popover.querySelector('.cancel-roles-btn').addEventListener('click', () => popover.remove());

                // Save
                popover.querySelector('.save-roles-btn').addEventListener('click', async () => {
                    const newRoles = Array.from(popover.querySelectorAll('.role-cb:checked')).map(cb => cb.value);
                    if (newRoles.length === 0) {
                        showToast('Select at least one role.', 'warning');
                        return;
                    }

                    const saveBtn = popover.querySelector('.save-roles-btn');
                    saveBtn.disabled = true;
                    saveBtn.textContent = 'Saving...';

                    try {
                        const response = await csrfFetch(`/api/admin/users/${userId}/roles`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ roles: newRoles })
                        });
                        const result = await response.json();
                        if (response.ok && result.success) {
                            popover.remove();
                            await initializeDashboard();
                        } else {
                            throw new Error(result.message || 'Failed to update roles');
                        }
                    } catch (error) {
                        showToast(`Error: ${error.message}`, 'error');
                        saveBtn.disabled = false;
                        saveBtn.textContent = 'Save';
                    }
                });

                // Close on outside click
                setTimeout(() => {
                    const closeHandler = (evt) => {
                        if (!popover.contains(evt.target)) {
                            popover.remove();
                            document.removeEventListener('click', closeHandler);
                        }
                    };
                    document.addEventListener('click', closeHandler);
                }, 0);

                return;
            }

            // Handle send credentials email button click
            const sendCredsBtn = e.target.closest('.send-credentials-btn');
            if (sendCredsBtn) {
                e.preventDefault();
                const userId = sendCredsBtn.dataset.userid;
                const username = sendCredsBtn.dataset.username;
                const email = sendCredsBtn.dataset.email;

                if (!confirm(`Send login credentials to ${username} (${email})?\n\nThis will:\n• Generate a new temporary password\n• Email them their username and new password\n\nTheir current password will be replaced.`)) {
                    return;
                }

                try {
                    sendCredsBtn.disabled = true;
                    sendCredsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                    const response = await csrfFetch(`/api/admin/users/${userId}/send-credentials`, {
                        method: 'POST',
                        credentials: 'include'
                    });

                    const result = await response.json();

                    if (response.ok && result.success) {
                        if (result.temporaryPassword) {
                            // Email failed but password was reset - show it
                            showToast(result.message, 'warning', 6000);
                        } else {
                            showToast(result.message, 'success');
                        }
                    } else {
                        throw new Error(result.message || 'Failed to send credentials');
                    }
                } catch (error) {
                    console.error('Send credentials error:', error);
                    showToast(`Error: ${error.message}`, 'error');
                } finally {
                    sendCredsBtn.disabled = false;
                    sendCredsBtn.innerHTML = '<i class="fas fa-envelope"></i>';
                }
                return;
            }

            // Handle reset screener button click
            const resetBtn = e.target.closest('.reset-screener-btn');
            if (resetBtn) {
                e.preventDefault();
                const studentId = resetBtn.dataset.studentid;
                const studentName = resetBtn.dataset.studentname;

                const reason = prompt(
                    `Reset placement assessment for ${studentName}?\n\n` +
                    `This will allow them to retake the screener.\n\n` +
                    `Optional: Enter a reason for this reset (e.g., "summer break", "skill regression"):`
                );

                // User cancelled
                if (reason === null) return;

                try {
                    resetBtn.disabled = true;
                    resetBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                    const response = await csrfFetch(`/api/admin/students/${studentId}/reset-assessment`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ reason: reason || 'Admin requested reset' })
                    });

                    const result = await response.json();

                    if (response.ok && result.success) {
                        showToast(`${result.message} — student can now retake the screener.`, 'success', 5000);
                        await initializeDashboard(); // Refresh the dashboard
                    } else {
                        throw new Error(result.message || 'Failed to reset assessment');
                    }
                } catch (error) {
                    console.error('Reset assessment error:', error);
                    showToast(`Error: ${error.message}`, 'error');
                } finally {
                    resetBtn.disabled = false;
                    resetBtn.innerHTML = '<i class="fas fa-redo"></i>';
                }
                return;
            }

            // Handle view-as-user button click
            const viewAsBtn = e.target.closest('.view-as-user-btn');
            if (viewAsBtn) {
                e.preventDefault();
                const userId = viewAsBtn.dataset.userid;
                const username = viewAsBtn.dataset.username;
                const role = viewAsBtn.dataset.role;

                if (!confirm(`View the app as ${username}?\n\nYou'll see exactly what this ${role} sees.\nChanges are disabled in view mode.`)) {
                    return;
                }

                try {
                    viewAsBtn.disabled = true;
                    viewAsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                    await window.ImpersonationBanner.start(userId, { readOnly: true });
                    // Redirect happens automatically in the start function
                } catch (error) {
                    console.error('Failed to start user view:', error);
                    showToast(`Error: ${error.message || 'Failed to start user view'}`, 'error');
                    viewAsBtn.disabled = false;
                    viewAsBtn.innerHTML = '<i class="fas fa-eye"></i>';
                }
                return;
            }

            // Handle delete button click
            const deleteBtn = e.target.closest('.delete-user-btn');
            if (deleteBtn) {
                e.preventDefault();
                const userId = deleteBtn.dataset.userid;
                const username = deleteBtn.dataset.username;

                if (!confirm(`⚠️ Are you sure you want to delete "${username}"?\n\nThis will permanently delete:\n• Their account\n• All conversation history\n• All progress data\n\nThis action CANNOT be undone.`)) {
                    return;
                }

                try {
                    deleteBtn.disabled = true;
                    deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                    const response = await csrfFetch(`/api/admin/users/${userId}`, {
                        method: 'DELETE',
                        credentials: 'include'
                    });

                    const result = await response.json();

                    if (response.ok && result.success) {
                        showToast(result.message, 'success');
                        await initializeDashboard(); // Refresh the dashboard
                    } else {
                        throw new Error(result.message || 'Failed to delete user');
                    }
                } catch (error) {
                    console.error('Delete error:', error);
                    showToast(`Error: ${error.message}`, 'error');
                    deleteBtn.disabled = false;
                    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
                }
            }
        });
    }

    // Each control writes its value into `userQuery` and refetches from page 1 —
    // the result set is the server's answer, so narrowing it is a round trip.
    if (studentSearch) studentSearch.addEventListener("input", debounce(() => {
        userQuery.search = studentSearch.value.trim();
        refetchUsersFromFirstPage();
    }, 300));
    const userRoleFilter = document.getElementById('userRoleFilter');
    if (userRoleFilter) userRoleFilter.addEventListener("change", () => {
        userQuery.role = userRoleFilter.value || '';
        refetchUsersFromFirstPage();
    });
    const userSortSelect = document.getElementById('userSortSelect');
    if (userSortSelect) userSortSelect.addEventListener("change", () => {
        // When the dropdown changes, sync the column-header indicators
        // so the visual state matches whichever control the user used.
        syncSortHeaderState(userSortSelect.value);
        userQuery.sort = userSortSelect.value;
        refetchUsersFromFirstPage();
    });

    // --- Clickable column-header sort ---
    // Each .th-sortable in #userListTable carries a data-sort-key.
    // Click cycles ascending → descending; setting #userSortSelect to
    // the corresponding option keeps the existing dropdown in sync and
    // the value is sent to the server, which does the actual ordering.
    // No new sort engine.
    const SORT_HEADER_MAP = {
        // headerKey: { asc: <userSortSelect value>, desc: <userSortSelect value> }
        name:      { asc: 'name-asc',  desc: 'name-desc' },
        created:   { asc: 'oldest',    desc: 'newest' },
        lastLogin: { asc: 'last-login', desc: 'last-login' } // last-login already sorts most-recent first
    };

    function syncSortHeaderState(selectValue) {
        // Map a userSortSelect value back to a header key + direction
        // so the active column header lights up correctly.
        const headers = document.querySelectorAll('.user-table thead th.th-sortable');
        headers.forEach(th => th.setAttribute('aria-sort', 'none'));
        for (const [key, dirs] of Object.entries(SORT_HEADER_MAP)) {
            const header = document.querySelector(`.user-table thead th.th-sortable[data-sort-key="${key}"]`);
            if (!header) continue;
            if (dirs.asc === selectValue)  header.setAttribute('aria-sort', 'ascending');
            if (dirs.desc === selectValue) header.setAttribute('aria-sort', 'descending');
        }
    }

    document.querySelectorAll('.user-table thead th.th-sortable').forEach(th => {
        const handler = () => {
            if (!userSortSelect) return;
            const key = th.dataset.sortKey;
            const dirs = SORT_HEADER_MAP[key];
            if (!dirs) return;
            const current = th.getAttribute('aria-sort');
            // Default cycle: clicking an inactive column starts descending
            // for date-like columns, ascending for name. Re-clicking
            // toggles direction.
            let next;
            if (current === 'ascending') next = dirs.desc;
            else if (current === 'descending') next = dirs.asc;
            else next = (key === 'name') ? dirs.asc : dirs.desc;
            userSortSelect.value = next;
            syncSortHeaderState(next);
            userQuery.sort = next;
            refetchUsersFromFirstPage();
        };
        th.addEventListener('click', handler);
        th.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
        });
    });

    // Initialize the indicator state to reflect whatever the dropdown
    // currently shows (defaults to "newest" on first paint).
    if (userSortSelect) syncSortHeaderState(userSortSelect.value);

    if (assignButton) {
        assignButton.addEventListener("click", async () => {
            const selectedIds = Array.from(userTableBody.querySelectorAll(".select-student:checked")).map(cb => cb.value);
            if (selectedIds.length === 0) {
                showToast('Please select at least one student.', 'warning');
                return;
            }
            
            const teacherId = teacherSelect.value;
            if (!teacherId && !confirm("This will unassign the selected students from any teacher. Are you sure?")) {
                return;
            }
            
            try {
                const res = await csrfFetch("/api/admin/assign-teacher", {
                    method: "PATCH",
                    headers: { 'Content-Type': 'application/json', 'credentials': 'include' },
                    body: JSON.stringify({ studentIds: selectedIds, teacherId: teacherId || null })
                });
                const result = await res.json();
                if(!res.ok) throw new Error(result.message || "Failed to assign teacher.");
                
                showToast(result.message, 'success');
                await initializeDashboard(); // Refresh all data
            } catch (error) {
                showToast(`Error: ${error.message}`, 'error');
            }
        });
    }

    if (saveChangesButton) {
        saveChangesButton.addEventListener("click", async () => {
            const studentId = modalStudentId.value;
            if (!studentId) return;

            const profileData = {
                firstName: studentProfileForm.elements.firstName.value,
                lastName: studentProfileForm.elements.lastName.value,
                email: studentProfileForm.elements.email.value,
                gradeLevel: studentProfileForm.elements.gradeLevel.value,
                mathCourse: studentProfileForm.elements.mathCourse.value,
                tonePreference: studentProfileForm.elements.tonePreference.value,
                learningStyle: studentProfileForm.elements.learningStyle.value,
                interests: studentProfileForm.elements.interests.value.split(',').map(s => s.trim()).filter(Boolean)
            };

            // Build accommodations object
            const accommodations = {
                extendedTime: studentIepForm.elements.extendedTime.checked,
                reducedDistraction: studentIepForm.elements.reducedDistraction.checked,
                calculatorAllowed: studentIepForm.elements.calculatorAllowed.checked,
                audioReadAloud: studentIepForm.elements.audioReadAloud.checked,
                chunkedAssignments: studentIepForm.elements.chunkedAssignments.checked,
                breaksAsNeeded: studentIepForm.elements.breaksAsNeeded.checked,
                digitalMultiplicationChart: studentIepForm.elements.digitalMultiplicationChart.checked,
                largePrintHighContrast: studentIepForm.elements.largePrintHighContrast.checked,
                mathAnxietySupport: studentIepForm.elements.mathAnxietySupport.checked,
            };

            // Add custom accommodations array
            const customAccomText = studentIepForm.elements.customAccommodations.value.trim();
            if (customAccomText) {
                accommodations.custom = customAccomText.split('\n').map(s => s.trim()).filter(Boolean);
            } else {
                accommodations.custom = [];
            }

            const iepData = {
                accommodations,
                readingLevel: studentIepForm.elements.readingLevel.value,
                preferredScaffolds: studentIepForm.elements.preferredScaffolds.value.split(',').map(s => s.trim()).filter(Boolean),
                goals: getAdminIepGoalsFromUI()
            };

            saveChangesButton.disabled = true;
            saveChangesButton.textContent = 'Saving...';

            try {
                const [profileRes, iepRes] = await Promise.all([
                    csrfFetch(`/api/admin/students/${studentId}/profile`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', 'credentials': 'include' },
                        body: JSON.stringify(profileData)
                    }),
                    csrfFetch(`/api/admin/students/${studentId}/iep`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'credentials': 'include' },
                        body: JSON.stringify(iepData)
                    })
                ]);

                if (!profileRes.ok || !iepRes.ok) throw new Error('Failed to save one or more sections.');

                showToast('Student updated successfully!', 'success');
                closeModal();
                await initializeDashboard();

            } catch (error) {
                showToast(`Could not save changes: ${error.message}`, 'error');
            } finally {
                saveChangesButton.disabled = false;
                saveChangesButton.textContent = 'Save Changes';
            }
        });
    }

    if (closeModalButton) closeModalButton.addEventListener('click', closeModal);
    if (cancelButton) cancelButton.addEventListener('click', closeModal);

    // -------------------------------------------------------------------------
    // --- Reports Functionality ---
    // -------------------------------------------------------------------------

    const usageReportModal = document.getElementById('usageReportModal');
    const liveActivityModal = document.getElementById('liveActivityModal');
    const summariesModal = document.getElementById('summariesModal');
    const openUsageReportBtn = document.getElementById('openUsageReportBtn');
    const openLiveActivityBtn = document.getElementById('openLiveActivityBtn');
    const openSummariesBtn = document.getElementById('openSummariesBtn');
    const closeUsageReportBtn = document.getElementById('closeUsageReportBtn');
    const closeLiveActivityBtn = document.getElementById('closeLiveActivityBtn');
    const closeSummariesBtn = document.getElementById('closeSummariesBtn');
    const applyReportFilters = document.getElementById('applyReportFilters');
    const exportReportCSV = document.getElementById('exportReportCSV');
    const refreshLiveActivityBtn = document.getElementById('refreshLiveActivityBtn');
    const refreshSummariesBtn = document.getElementById('refreshSummariesBtn');
    const applySummariesFilters = document.getElementById('applySummariesFilters');

    let currentReportData = null;
    let currentSummariesData = null;

    // Open/Close Usage Report Modal
    if (openUsageReportBtn) {
        openUsageReportBtn.addEventListener('click', () => {
            usageReportModal?.classList.add('is-visible');
            loadUsageReport();
        });
    }

    if (closeUsageReportBtn) {
        closeUsageReportBtn.addEventListener('click', () => {
            usageReportModal?.classList.remove('is-visible');
        });
    }

    // Open/Close Live Activity Modal
    if (openLiveActivityBtn) {
        openLiveActivityBtn.addEventListener('click', () => {
            liveActivityModal?.classList.add('is-visible');
            loadLiveActivity();
        });
    }

    if (closeLiveActivityBtn) {
        closeLiveActivityBtn.addEventListener('click', () => {
            liveActivityModal?.classList.remove('is-visible');
        });
    }

    // Open/Close Summaries Modal
    if (openSummariesBtn) {
        openSummariesBtn.addEventListener('click', () => {
            summariesModal?.classList.add('is-visible');
            loadSummaries();
        });
    }

    if (closeSummariesBtn) {
        closeSummariesBtn.addEventListener('click', () => {
            summariesModal?.classList.remove('is-visible');
        });
    }

    // Apply Filters
    if (applyReportFilters) {
        applyReportFilters.addEventListener('click', loadUsageReport);
    }

    // Refresh Live Activity
    if (refreshLiveActivityBtn) {
        refreshLiveActivityBtn.addEventListener('click', loadLiveActivity);
    }

    // Refresh Summaries
    if (refreshSummariesBtn) {
        refreshSummariesBtn.addEventListener('click', loadSummaries);
    }

    // Apply Summaries Filters
    if (applySummariesFilters) {
        applySummariesFilters.addEventListener('click', () => {
            if (currentSummariesData) {
                renderSummaries(currentSummariesData.users);
            }
        });
    }

    // Export CSV
    if (exportReportCSV) {
        exportReportCSV.addEventListener('click', exportUsageReportToCSV);
    }

    /**
     * Load Usage Report from API
     */
    async function loadUsageReport() {
        try {
            const role = document.getElementById('reportRoleFilter')?.value || '';
            const sortBy = document.getElementById('reportSortBy')?.value || 'lastLogin';
            const sortOrder = document.getElementById('reportSortOrder')?.value || 'desc';

            const params = new URLSearchParams();
            if (role) params.append('role', role);
            params.append('sortBy', sortBy);
            params.append('sortOrder', sortOrder);

            const response = await fetch(`/api/admin/reports/usage?${params.toString()}`, {
                credentials: 'include'
            });

            if (!response.ok) throw new Error('Failed to load usage report');

            const data = await response.json();
            currentReportData = data;

            // Update summary stats
            document.getElementById('summaryTotalUsers').textContent = data.summary.totalUsers;
            document.getElementById('summaryActiveToday').textContent = data.summary.activeToday;
            document.getElementById('summaryActiveWeek').textContent = data.summary.activeThisWeek;
            document.getElementById('summaryTotalMinutes').textContent = data.summary.totalMinutesAllTime.toLocaleString();
            document.getElementById('summaryWeekMinutes').textContent = data.summary.totalMinutesThisWeek.toLocaleString();
            document.getElementById('summaryAvgMinutes').textContent = data.summary.averageMinutesPerUser;

            // Render user table
            renderUsageReportTable(data.users);

        } catch (error) {
            console.error('Error loading usage report:', error);
            showToast('Failed to load usage report', 'error');
        }
    }

    /**
     * Render Usage Report Table
     */
    function renderUsageReportTable(users) {
        const tbody = document.getElementById('usageReportTableBody');
        if (!tbody) return;

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">No users found</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(user => {
            const lastLogin = user.lastLogin
                ? new Date(user.lastLogin).toLocaleDateString()
                : 'Never';
            const daysSince = user.daysSinceLastLogin !== null
                ? `(${user.daysSinceLastLogin}d ago)`
                : '';

            return `
                <tr>
                    <td><strong>${user.name}</strong></td>
                    <td><span class="badge badge-${user.role}">${user.role}</span></td>
                    <td>${lastLogin} ${daysSince}</td>
                    <td>${user.totalMinutes}</td>
                    <td>${user.weeklyMinutes}</td>
                    <td>${user.sessionCount}</td>
                    <td>${user.level}</td>
                    <td>${user.xp.toLocaleString()}</td>
                    <td>${user.teacher || '-'}</td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Export Usage Report to CSV
     */
    function exportUsageReportToCSV() {
        if (!currentReportData || !currentReportData.users) {
            showToast('No report data to export', 'warning');
            return;
        }

        const headers = ['Name', 'Role', 'Email', 'Last Login', 'Total Minutes', 'Weekly Minutes', 'Sessions', 'Level', 'XP', 'Teacher'];
        const rows = currentReportData.users.map(user => [
            user.name,
            user.role,
            user.email,
            user.lastLogin ? new Date(user.lastLogin).toISOString() : 'Never',
            user.totalMinutes,
            user.weeklyMinutes,
            user.sessionCount,
            user.level,
            user.xp,
            user.teacher || ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `usage-report-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Load Live Activity Feed
     */
    async function loadLiveActivity() {
        const container = document.getElementById('liveActivityContainer');
        if (!container) return;

        container.innerHTML = '<p style="text-align: center;"><i class="fas fa-spinner fa-spin"></i> Loading...</p>';

        try {
            const response = await fetch('/api/admin/reports/live-activity', {
                credentials: 'include'
            });

            if (!response.ok) throw new Error('Failed to load live activity');

            const data = await response.json();
            renderLiveActivity(data.sessions);

        } catch (error) {
            console.error('Error loading live activity:', error);
            container.innerHTML = '<p style="text-align: center; color: red;">Failed to load live activity</p>';
        }
    }

    /**
     * Render Live Activity Cards
     */
    function renderLiveActivity(sessions) {
        const container = document.getElementById('liveActivityContainer');
        if (!container) return;

        if (sessions.length === 0) {
            container.innerHTML = `
                <div class="no-activity-message">
                    <i class="fas fa-inbox"></i>
                    <p>No active sessions in the last 10 minutes</p>
                </div>
            `;
            return;
        }

        container.innerHTML = sessions.map(session => {
            const accuracy = session.problemsAttempted > 0
                ? Math.round((session.problemsCorrect / session.problemsAttempted) * 100)
                : 0;

            const isStruggling = session.strugglingWith || session.alerts.length > 0;
            const cardClass = isStruggling ? 'activity-card struggling' : 'activity-card';

            return `
                <div class="${cardClass}">
                    <div class="activity-header">
                        <div class="activity-student-name">
                            ${session.studentName}
                            <span class="activity-topic">${session.currentTopic}</span>
                        </div>
                        <div class="activity-time">
                            <i class="fas fa-clock"></i> ${session.minutesAgo}m ago
                        </div>
                    </div>
                    <div class="activity-stats">
                        <div class="activity-stat">
                            <i class="fas fa-hourglass-half"></i> ${session.activeMinutes} min
                        </div>
                        <div class="activity-stat">
                            <i class="fas fa-tasks"></i> ${session.problemsCorrect}/${session.problemsAttempted} correct (${accuracy}%)
                        </div>
                        <div class="activity-stat">
                            <i class="fas fa-trophy"></i> Level ${session.level} (${session.xp.toLocaleString()} XP)
                        </div>
                    </div>
                    ${isStruggling ? `
                        <div class="struggle-alert">
                            <i class="fas fa-exclamation-triangle"></i>
                            <strong>Struggling with:</strong> ${session.strugglingWith || 'Current concept'}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    /**
     * Load User Summaries from API
     */
    async function loadSummaries() {
        const container = document.getElementById('summariesContainer');
        if (!container) return;

        container.innerHTML = '<p style="text-align: center;"><i class="fas fa-spinner fa-spin"></i> Loading...</p>';

        try {
            const response = await fetch('/api/admin/reports/summaries', {
                credentials: 'include'
            });

            if (!response.ok) throw new Error('Failed to load summaries');

            const data = await response.json();
            currentSummariesData = data;

            renderSummaries(data.users);

        } catch (error) {
            console.error('Error loading summaries:', error);
            container.innerHTML = '<p style="text-align: center; color: red;">Failed to load summaries</p>';
        }
    }

    /**
     * Render User Summaries
     */
    function renderSummaries(users) {
        const container = document.getElementById('summariesContainer');
        const countDisplay = document.getElementById('summariesCount');
        if (!container) return;

        // Apply filters
        const roleFilter = document.getElementById('summariesRoleFilter')?.value || '';
        const searchQuery = document.getElementById('summariesSearchInput')?.value.toLowerCase().trim() || '';

        let filteredUsers = users;

        if (roleFilter) {
            filteredUsers = filteredUsers.filter(u => userHasRole(u, roleFilter));
        }

        if (searchQuery) {
            filteredUsers = filteredUsers.filter(u =>
                u.name.toLowerCase().includes(searchQuery) ||
                u.email.toLowerCase().includes(searchQuery) ||
                u.username.toLowerCase().includes(searchQuery)
            );
        }

        if (countDisplay) {
            countDisplay.textContent = filteredUsers.length;
        }

        if (filteredUsers.length === 0) {
            container.innerHTML = `
                <div class="no-activity-message">
                    <i class="fas fa-inbox"></i>
                    <p>No users found matching your filters</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filteredUsers.map(user => {
            const lastLogin = user.lastLogin
                ? new Date(user.lastLogin).toLocaleDateString()
                : 'Never';

            const conversationsHtml = user.recentConversations && user.recentConversations.length > 0
                ? user.recentConversations.map(conv => `
                    <div class="conversation-summary-item">
                        <div class="conversation-date">
                            <i class="fas fa-calendar"></i> ${formatDate(conv.startDate)}
                            <span style="color: #888; margin-left: 10px;">
                                <i class="fas fa-clock"></i> ${conv.activeMinutes || 0} min
                            </span>
                        </div>
                        <div class="conversation-summary-text">${conv.summary || 'No summary available'}</div>
                    </div>
                `).join('')
                : '<p style="color: #888; font-style: italic;">No recent conversation summaries</p>';

            return `
                <div class="user-summary-card" style="border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; background: white;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
                        <div>
                            <h4 style="margin: 0 0 5px 0; color: #333;">
                                <i class="fas fa-user"></i> ${user.name}
                                <span class="badge badge-${user.role}" style="margin-left: 10px; font-size: 0.8em;">${user.role}</span>
                            </h4>
                            <div style="color: #666; font-size: 0.9em;">
                                <i class="fas fa-envelope"></i> ${user.email}
                                ${user.username ? `<span style="margin-left: 15px;"><i class="fas fa-at"></i> ${user.username}</span>` : ''}
                            </div>
                        </div>
                        <div style="text-align: right; font-size: 0.9em; color: #666;">
                            <div><strong>Last Login:</strong> ${lastLogin}</div>
                            ${user.teacher ? `<div><strong>Teacher:</strong> ${user.teacher}</div>` : ''}
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 5px;">
                        <div class="stat-item">
                            <i class="fas fa-trophy"></i> <strong>Level:</strong> ${user.level}
                        </div>
                        <div class="stat-item">
                            <i class="fas fa-star"></i> <strong>XP:</strong> ${user.xp.toLocaleString()}
                        </div>
                        <div class="stat-item">
                            <i class="fas fa-clock"></i> <strong>Total Min:</strong> ${user.totalMinutes}
                        </div>
                        <div class="stat-item">
                            <i class="fas fa-calendar-week"></i> <strong>Weekly Min:</strong> ${user.weeklyMinutes}
                        </div>
                    </div>

                    <div style="border-top: 1px solid #eee; padding-top: 15px;">
                        <h5 style="margin: 0 0 10px 0; color: #555;">
                            <i class="fas fa-comments"></i> Recent Conversation Summaries
                        </h5>
                        <div class="conversation-summaries">
                            ${conversationsHtml}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // -------------------------------------------------------------------------
    // --- Survey Responses & Analytics ---
    // -------------------------------------------------------------------------

    /**
     * Fetches survey statistics for the preview panel
     */
    async function fetchSurveyStatsPreview() {
        try {
            const response = await fetch('/api/admin/survey-stats', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to fetch survey stats');

            const data = await response.json();
            const stats = data.stats;

            // Update preview panel
            document.getElementById('totalSurveyResponses').textContent = stats.totalResponses || 0;

            // Calculate average rating from full data
            const responsesRes = await fetch('/api/admin/survey-responses?limit=1000', { credentials: 'include' });
            if (responsesRes.ok) {
                const responsesData = await responsesRes.json();
                const avgRating = responsesData.stats?.averageRating || 0;
                document.getElementById('avgRating').textContent = avgRating;
            }

            // Calculate tour completion rate
            const tourCompletionRate = stats.totalUsers > 0
                ? Math.round((stats.tourCompletedCount / stats.totalUsers) * 100)
                : 0;
            document.getElementById('tourCompletionRate').textContent = tourCompletionRate;

        } catch (error) {
            console.error('Error fetching survey stats preview:', error);
        }
    }

    /**
     * Opens the survey responses modal and loads data
     */
    async function openSurveyResponsesModal() {
        const modal = document.getElementById('surveyResponsesModal');
        if (!modal) return;

        modal.classList.add('is-visible');
        await loadSurveyResponses();
    }

    /**
     * Closes the survey responses modal
     */
    function closeSurveyResponsesModal() {
        const modal = document.getElementById('surveyResponsesModal');
        if (modal) modal.classList.remove('is-visible');
    }

    /**
     * Loads and displays survey responses
     */
    async function loadSurveyResponses() {
        try {
            const response = await fetch('/api/admin/survey-responses?limit=100', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to fetch survey responses');

            const data = await response.json();
            const { stats, responses } = data;

            // Update statistics
            document.getElementById('surveyTotalResponses').textContent = stats.totalResponses || 0;
            document.getElementById('surveyTotalUsers').textContent = stats.totalUsers || 0;
            document.getElementById('surveyAvgRating').textContent = `${stats.averageRating || 0} / 5`;
            document.getElementById('surveyAvgHelpfulness').textContent = `${stats.averageHelpfulness || 0} / 5`;
            document.getElementById('surveyAvgWillingness').textContent = `${stats.averageWillingness || 0} / 10`;

            // Get tour stats
            const statsRes = await fetch('/api/admin/survey-stats', { credentials: 'include' });
            if (statsRes.ok) {
                const statsData = await statsRes.json();
                document.getElementById('surveyTourCompleted').textContent =
                    `${statsData.stats.tourCompletedCount || 0} / ${statsData.stats.totalUsers || 0}`;
            }

            // Render rating distribution
            renderRatingDistribution(stats.ratingDistribution);

            // Render experience breakdown
            renderExperienceBreakdown(stats.experienceBreakdown);

            // Render responses table
            renderSurveyResponsesTable(responses);

            // Update count
            document.getElementById('responsesCount').textContent = responses.length;

        } catch (error) {
            console.error('Error loading survey responses:', error);
            document.getElementById('surveyResponsesTableBody').innerHTML =
                '<tr><td colspan="11" style="text-align: center; color: #e74c3c;">Failed to load survey responses</td></tr>';
        }
    }

    /**
     * Renders the rating distribution bar chart
     */
    function renderRatingDistribution(distribution) {
        const container = document.getElementById('ratingDistribution');
        if (!container) return;

        const maxCount = Math.max(...Object.values(distribution), 1);

        container.innerHTML = Object.entries(distribution)
            .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
            .map(([rating, count]) => {
                const height = (count / maxCount) * 100;
                const color = rating >= 4 ? '#4CAF50' : rating >= 3 ? '#FFC107' : '#f44336';
                return `
                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end;">
                        <div style="font-size: 0.9em; font-weight: bold; margin-bottom: 5px; color: #333;">${count}</div>
                        <div style="width: 100%; height: ${height}%; background: ${color}; border-radius: 4px 4px 0 0; min-height: ${count > 0 ? '20px' : '0'}; transition: height 0.3s;"></div>
                        <div style="margin-top: 8px; font-size: 0.9em; color: #666;">★${rating}</div>
                    </div>
                `;
            }).join('');
    }

    /**
     * Renders the experience breakdown
     */
    function renderExperienceBreakdown(breakdown) {
        const container = document.getElementById('experienceBreakdown');
        if (!container) return;

        const experienceColors = {
            excellent: '#4CAF50',
            good: '#8BC34A',
            okay: '#FFC107',
            frustrating: '#FF9800',
            confusing: '#f44336'
        };

        const experienceIcons = {
            excellent: 'fa-smile-beam',
            good: 'fa-smile',
            okay: 'fa-meh',
            frustrating: 'fa-frown',
            confusing: 'fa-dizzy'
        };

        if (Object.keys(breakdown).length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #999;">No experience data yet</p>';
            return;
        }

        container.innerHTML = Object.entries(breakdown)
            .sort((a, b) => b[1] - a[1])
            .map(([experience, count]) => {
                const color = experienceColors[experience] || '#999';
                const icon = experienceIcons[experience] || 'fa-circle';
                return `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e0e0e0;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <i class="fas ${icon}" style="color: ${color}; font-size: 1.2em;"></i>
                            <span style="text-transform: capitalize; font-weight: 500;">${experience}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="background: ${color}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.9em; font-weight: bold;">
                                ${count}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
    }

    /**
     * Renders the survey responses table
     */
    function renderSurveyResponsesTable(responses) {
        const tbody = document.getElementById('surveyResponsesTableBody');
        if (!tbody) return;

        if (responses.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; color: #999;">No survey responses yet</td></tr>';
            return;
        }

        tbody.innerHTML = responses.map(r => {
            const date = new Date(r.submittedAt).toLocaleString();
            const rating = r.rating ? `${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}` : '-';

            return `
                <tr>
                    <td style="white-space: nowrap;">${date}</td>
                    <td>${r.userName || 'Unknown'}<br><small style="color: #666;">${r.userEmail || ''}</small></td>
                    <td style="text-align: center;">${rating}</td>
                    <td>${r.experience || '-'}</td>
                    <td style="text-align: center;">${r.helpfulness || '-'} / 5</td>
                    <td style="text-align: center;">${r.difficulty || '-'} / 5</td>
                    <td style="text-align: center;">${r.willingness !== null && r.willingness !== undefined ? r.willingness + ' / 10' : '-'}</td>
                    <td style="text-align: center;">${r.sessionDuration || '-'}</td>
                    <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;" title="${r.feedback || ''}">${r.feedback ? r.feedback.substring(0, 50) + (r.feedback.length > 50 ? '...' : '') : '-'}</td>
                    <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis;" title="${r.bugs || ''}">${r.bugs ? r.bugs.substring(0, 40) + (r.bugs.length > 40 ? '...' : '') : '-'}</td>
                    <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis;" title="${r.features || ''}">${r.features ? r.features.substring(0, 40) + (r.features.length > 40 ? '...' : '') : '-'}</td>
                </tr>
            `;
        }).join('');
    }

    // Event Listeners for Survey Modal
    const openSurveyResponsesBtn = document.getElementById('openSurveyResponsesBtn');
    const closeSurveyResponsesBtn = document.getElementById('closeSurveyResponsesBtn');
    const refreshSurveyResponsesBtn = document.getElementById('refreshSurveyResponsesBtn');

    if (openSurveyResponsesBtn) {
        openSurveyResponsesBtn.addEventListener('click', openSurveyResponsesModal);
    }

    if (closeSurveyResponsesBtn) {
        closeSurveyResponsesBtn.addEventListener('click', closeSurveyResponsesModal);
    }

    if (refreshSurveyResponsesBtn) {
        refreshSurveyResponsesBtn.addEventListener('click', loadSurveyResponses);
    }

    // Close modal on outside click
    const surveyModal = document.getElementById('surveyResponsesModal');
    if (surveyModal) {
        surveyModal.addEventListener('click', (e) => {
            if (e.target === surveyModal) {
                closeSurveyResponsesModal();
            }
        });
    }

    // -------------------------------------------------------------------------
    // --- Teacher & Roster Setup Functionality ---
    // -------------------------------------------------------------------------

    // --- Create User Modal (was Create Teacher, now supports all roles) ---
    const createTeacherModal = document.getElementById('createTeacherModal');
    const openTeacherSetupBtn = document.getElementById('openTeacherSetupBtn');
    const closeCreateTeacherBtn = document.getElementById('closeCreateTeacherBtn');
    const cancelCreateTeacher = document.getElementById('cancelCreateTeacher');
    const createTeacherForm = document.getElementById('createTeacherForm');
    const generatePasswordCheck = document.getElementById('generatePasswordCheck');
    const passwordFieldGroup = document.getElementById('passwordFieldGroup');
    const teacherCreatedResult = document.getElementById('teacherCreatedResult');
    const createAnotherTeacher = document.getElementById('createAnotherTeacher');

    // Track the last created user for follow-up actions
    let lastCreatedUserId = null;

    function hideAllFollowUps() {
        document.getElementById('followUpTeacher').style.display = 'none';
        document.getElementById('followUpParent').style.display = 'none';
        document.getElementById('followUpStudent').style.display = 'none';
        document.getElementById('followUpClassResult').style.display = 'none';
        document.getElementById('followUpParentLinkResult').style.display = 'none';
        document.getElementById('followUpStudentLinkResult').style.display = 'none';
    }

    function openCreateTeacherModal() {
        createTeacherModal?.classList.add('is-visible');
        createTeacherForm?.reset();
        teacherCreatedResult.style.display = 'none';
        createTeacherForm.style.display = 'block';
        hideAllFollowUps();
        lastCreatedUserId = null;
    }

    function closeCreateTeacherModal() {
        createTeacherModal?.classList.remove('is-visible');
    }

    if (openTeacherSetupBtn) {
        openTeacherSetupBtn.addEventListener('click', openCreateTeacherModal);
    }

    if (closeCreateTeacherBtn) {
        closeCreateTeacherBtn.addEventListener('click', closeCreateTeacherModal);
    }

    if (cancelCreateTeacher) {
        cancelCreateTeacher.addEventListener('click', closeCreateTeacherModal);
    }

    if (generatePasswordCheck) {
        generatePasswordCheck.addEventListener('change', () => {
            passwordFieldGroup.style.display = generatePasswordCheck.checked ? 'none' : 'block';
        });
    }

    if (createAnotherTeacher) {
        createAnotherTeacher.addEventListener('click', () => {
            teacherCreatedResult.style.display = 'none';
            createTeacherForm.style.display = 'block';
            createTeacherForm.reset();
            hideAllFollowUps();
            lastCreatedUserId = null;
        });
    }

    // Helper to populate follow-up selects with users by role.
    // Each role is fetched separately through /users/lookup so the server does
    // the role matching and returns a slim projection — this used to pull the
    // entire directory with every listed field and filter it three times here.
    async function populateFollowUpSelects() {
        try {
            const [students, parents, teachers] = await Promise.all([
                fetchUserLookup({ role: 'student' }),
                fetchUserLookup({ role: 'parent' }),
                fetchUserLookup({ role: 'teacher' }),
            ]);

            const toOptions = (list) => list.map(u =>
                `<option value="${escapeHtml(u._id)}">${escapeHtml(`${u.firstName} ${u.lastName}`)} (${escapeHtml(u.email || '')})</option>`
            ).join('') + truncationNotice(list);
            const studentOptions = toOptions(students);
            const parentOptions = toOptions(parents);
            const teacherOptions = toOptions(teachers);

            // Parent follow-up: pick a student
            const followUpParentStudentSelect = document.getElementById('followUpParentStudentSelect');
            if (followUpParentStudentSelect) {
                followUpParentStudentSelect.innerHTML = '<option value="">Select a student...</option>' + studentOptions;
            }

            // Student follow-up: pick a parent and/or teacher
            const followUpStudentParentSelect = document.getElementById('followUpStudentParentSelect');
            if (followUpStudentParentSelect) {
                followUpStudentParentSelect.innerHTML = '<option value="">Select a parent...</option>' + parentOptions;
            }
            const followUpStudentTeacherSelect = document.getElementById('followUpStudentTeacherSelect');
            if (followUpStudentTeacherSelect) {
                followUpStudentTeacherSelect.innerHTML = '<option value="">Select a teacher...</option>' + teacherOptions;
            }

            // Also populate the standalone link-parent modal selects
            const linkParentSelect = document.getElementById('linkParentSelect');
            if (linkParentSelect) {
                linkParentSelect.innerHTML = '<option value="">Select a parent...</option>' + parentOptions;
            }
            const linkStudentSelect = document.getElementById('linkStudentSelect');
            if (linkStudentSelect) {
                linkStudentSelect.innerHTML = '<option value="">Select a student...</option>' + studentOptions;
            }
        } catch (err) {
            console.error('Error populating follow-up selects:', err);
        }
    }

    if (createTeacherForm) {
        createTeacherForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = document.getElementById('createTeacherSubmit');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

            try {
                // Collect selected roles from checkboxes
                const selectedRoles = Array.from(
                    document.querySelectorAll('#teacherRoleCheckboxes input[name="roles"]:checked')
                ).map(cb => cb.value);

                if (selectedRoles.length === 0) {
                    showToast('Please select at least one role.', 'warning');
                    return;
                }

                const sendWelcomeEmailCheck = document.getElementById('sendWelcomeEmailCheck');
                const formData = {
                    firstName: document.getElementById('teacherFirstName').value.trim(),
                    lastName: document.getElementById('teacherLastName').value.trim(),
                    email: document.getElementById('teacherEmail').value.trim(),
                    roles: selectedRoles,
                    username: document.getElementById('teacherUsername').value.trim() || undefined,
                    generatePassword: generatePasswordCheck.checked,
                    password: !generatePasswordCheck.checked ? document.getElementById('teacherPassword').value : undefined,
                    sendEmail: sendWelcomeEmailCheck ? sendWelcomeEmailCheck.checked : false
                };

                const response = await csrfFetch('/api/admin/create-user', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(formData)
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    lastCreatedUserId = result.user._id;

                    // Show success result
                    document.getElementById('resultTeacherName').textContent = `${result.user.firstName} ${result.user.lastName}`;
                    document.getElementById('resultTeacherEmail').textContent = result.user.email;
                    document.getElementById('resultTeacherUsername').textContent = result.user.username;
                    const rolesLabel = (result.user.roles || [selectedRoles[0]]).map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ');
                    document.getElementById('resultTeacherRole').textContent = rolesLabel;

                    if (result.temporaryPassword) {
                        document.getElementById('resultTeacherPassword').textContent = result.temporaryPassword;
                        document.getElementById('resultPasswordRow').style.display = 'block';
                    } else {
                        document.getElementById('resultPasswordRow').style.display = 'none';
                    }

                    // Show email status
                    const emailStatusEl = document.getElementById('resultEmailStatus');
                    const shareWarningEl = document.getElementById('resultShareWarning');
                    if (result.emailSent) {
                        emailStatusEl.innerHTML = '<i class="fas fa-envelope" style="color: #155724;"></i> <span style="color: #155724;">Welcome email sent to ' + result.user.email + '</span>';
                        emailStatusEl.style.display = 'block';
                        shareWarningEl.style.display = 'none';
                    } else if (formData.sendEmail && !result.emailSent) {
                        emailStatusEl.innerHTML = '<i class="fas fa-exclamation-circle" style="color: #856404;"></i> <span style="color: #856404;">Welcome email failed to send. Share credentials manually.</span>';
                        emailStatusEl.style.display = 'block';
                        shareWarningEl.style.display = 'block';
                    } else {
                        emailStatusEl.style.display = 'none';
                        shareWarningEl.style.display = 'block';
                    }

                    // Show role-specific follow-ups (multiple can show for multi-role users)
                    hideAllFollowUps();
                    let needsUserSelects = false;
                    if (selectedRoles.includes('teacher')) {
                        document.getElementById('followUpTeacher').style.display = 'block';
                    }
                    if (selectedRoles.includes('parent')) {
                        needsUserSelects = true;
                        document.getElementById('followUpParent').style.display = 'block';
                    }
                    if (selectedRoles.includes('student')) {
                        needsUserSelects = true;
                        document.getElementById('followUpStudent').style.display = 'block';
                    }
                    if (needsUserSelects) {
                        await populateFollowUpSelects();
                    }

                    createTeacherForm.style.display = 'none';
                    teacherCreatedResult.style.display = 'block';

                    // Refresh dashboard
                    await initializeDashboard();
                } else {
                    throw new Error(result.message || 'Failed to create user');
                }
            } catch (error) {
                showToast(`Error: ${error.message}`, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-user-plus"></i> Create User';
            }
        });
    }

    // --- Follow-up: Create class for new teacher ---
    const followUpCreateClassBtn = document.getElementById('followUpCreateClassBtn');
    if (followUpCreateClassBtn) {
        followUpCreateClassBtn.addEventListener('click', async () => {
            if (!lastCreatedUserId) return;
            const className = document.getElementById('followUpClassName').value.trim();
            if (!className) {
                showToast('Please enter a class name.', 'warning');
                return;
            }

            followUpCreateClassBtn.disabled = true;
            followUpCreateClassBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

            try {
                const response = await csrfFetch('/api/admin/enrollment-codes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        teacherId: lastCreatedUserId,
                        className,
                        gradeLevel: document.getElementById('followUpGradeLevel').value.trim() || undefined,
                        mathCourse: document.getElementById('followUpMathCourse').value.trim() || undefined
                    })
                });
                const result = await response.json();
                const resultEl = document.getElementById('followUpClassResult');
                if (response.ok && result.success) {
                    resultEl.innerHTML = `<i class="fas fa-check-circle"></i> Class code created: <strong>${result.enrollmentCode.code}</strong>`;
                    resultEl.style.display = 'block';
                } else {
                    throw new Error(result.message || 'Failed to create class code');
                }
            } catch (error) {
                showToast(`Error: ${error.message}`, 'error');
            } finally {
                followUpCreateClassBtn.disabled = false;
                followUpCreateClassBtn.innerHTML = '<i class="fas fa-key"></i> Create Class Code';
            }
        });
    }

    // --- Follow-up: Link child to new parent ---
    const followUpLinkChildBtn = document.getElementById('followUpLinkChildBtn');
    if (followUpLinkChildBtn) {
        followUpLinkChildBtn.addEventListener('click', async () => {
            if (!lastCreatedUserId) return;
            const studentId = document.getElementById('followUpParentStudentSelect').value;
            if (!studentId) {
                showToast('Please select a student.', 'warning');
                return;
            }

            followUpLinkChildBtn.disabled = true;
            followUpLinkChildBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Linking...';

            try {
                const response = await csrfFetch('/api/admin/link-parent-student', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ parentId: lastCreatedUserId, studentId })
                });
                const result = await response.json();
                const resultEl = document.getElementById('followUpParentLinkResult');
                if (response.ok && result.success) {
                    resultEl.innerHTML = `<i class="fas fa-check-circle"></i> ${result.message}`;
                    resultEl.style.display = 'block';
                } else {
                    throw new Error(result.message || 'Failed to link parent to student');
                }
            } catch (error) {
                showToast(`Error: ${error.message}`, 'error');
            } finally {
                followUpLinkChildBtn.disabled = false;
                followUpLinkChildBtn.innerHTML = '<i class="fas fa-link"></i> Link Student';
            }
        });
    }

    // --- Follow-up: Link parent and/or teacher to new student ---
    const followUpLinkStudentBtn = document.getElementById('followUpLinkStudentBtn');
    if (followUpLinkStudentBtn) {
        followUpLinkStudentBtn.addEventListener('click', async () => {
            if (!lastCreatedUserId) return;
            const parentId = document.getElementById('followUpStudentParentSelect').value;
            const teacherId = document.getElementById('followUpStudentTeacherSelect').value;

            if (!parentId && !teacherId) {
                showToast('Please select at least a parent or a teacher.', 'warning');
                return;
            }

            followUpLinkStudentBtn.disabled = true;
            followUpLinkStudentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Linking...';

            const resultEl = document.getElementById('followUpStudentLinkResult');
            const messages = [];

            try {
                if (parentId) {
                    const response = await csrfFetch('/api/admin/link-parent-student', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ parentId, studentId: lastCreatedUserId })
                    });
                    const result = await response.json();
                    if (response.ok && result.success) {
                        messages.push(result.message);
                    } else {
                        messages.push(`Parent link: ${result.message}`);
                    }
                }

                if (teacherId) {
                    const response = await csrfFetch('/api/admin/assign-teacher', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ teacherId, studentId: lastCreatedUserId })
                    });
                    const result = await response.json();
                    if (response.ok && result.success) {
                        messages.push(result.message);
                    } else {
                        messages.push(`Teacher assign: ${result.message}`);
                    }
                }

                resultEl.innerHTML = messages.map(m => `<i class="fas fa-check-circle"></i> ${m}`).join('<br>');
                resultEl.style.display = 'block';
            } catch (error) {
                showToast(`Error: ${error.message}`, 'error');
            } finally {
                followUpLinkStudentBtn.disabled = false;
                followUpLinkStudentBtn.innerHTML = '<i class="fas fa-link"></i> Link Selected';
            }
        });
    }

    // --- Link Parent to Student Modal (standalone) ---
    const linkParentModal = document.getElementById('linkParentModal');
    const openLinkParentBtn = document.getElementById('openLinkParentBtn');
    const closeLinkParentBtn = document.getElementById('closeLinkParentBtn');
    const cancelLinkParent = document.getElementById('cancelLinkParent');
    const linkParentForm = document.getElementById('linkParentForm');
    const linkParentResult = document.getElementById('linkParentResult');
    const linkAnotherParent = document.getElementById('linkAnotherParent');

    async function openLinkParentModal() {
        linkParentModal?.classList.add('is-visible');
        linkParentForm?.reset();
        linkParentResult.style.display = 'none';
        linkParentForm.style.display = 'block';
        await populateFollowUpSelects();
    }

    function closeLinkParentModal() {
        linkParentModal?.classList.remove('is-visible');
    }

    if (openLinkParentBtn) {
        openLinkParentBtn.addEventListener('click', openLinkParentModal);
    }
    if (closeLinkParentBtn) {
        closeLinkParentBtn.addEventListener('click', closeLinkParentModal);
    }
    if (cancelLinkParent) {
        cancelLinkParent.addEventListener('click', closeLinkParentModal);
    }
    if (linkAnotherParent) {
        linkAnotherParent.addEventListener('click', () => {
            linkParentResult.style.display = 'none';
            linkParentForm.style.display = 'block';
            linkParentForm.reset();
        });
    }

    if (linkParentForm) {
        linkParentForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = document.getElementById('linkParentSubmit');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Linking...';

            try {
                const parentId = document.getElementById('linkParentSelect').value;
                const studentId = document.getElementById('linkStudentSelect').value;

                const response = await csrfFetch('/api/admin/link-parent-student', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ parentId, studentId })
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    document.getElementById('resultLinkMessage').textContent = result.message;
                    linkParentForm.style.display = 'none';
                    linkParentResult.style.display = 'block';
                    await initializeDashboard();
                } else {
                    throw new Error(result.message || 'Failed to link parent to student');
                }
            } catch (error) {
                showToast(`Error: ${error.message}`, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-link"></i> Link Parent & Student';
            }
        });
    }

    // --- Create Enrollment Code Modal ---
    const createEnrollmentCodeModal = document.getElementById('createEnrollmentCodeModal');
    const openEnrollmentCodeBtn = document.getElementById('openEnrollmentCodeBtn');
    const closeEnrollmentCodeBtn = document.getElementById('closeEnrollmentCodeBtn');
    const cancelCreateCode = document.getElementById('cancelCreateCode');
    const createEnrollmentCodeForm = document.getElementById('createEnrollmentCodeForm');
    const codeTeacherSelect = document.getElementById('codeTeacherSelect');
    const codeCreatedResult = document.getElementById('codeCreatedResult');
    const createAnotherCode = document.getElementById('createAnotherCode');

    async function populateTeacherSelects() {
        try {
            const response = await fetch('/api/admin/teachers', { credentials: 'include' });
            if (!response.ok) return;

            const teachers = await response.json();
            const teacherOptions = teachers.map(t =>
                `<option value="${t._id}">${t.firstName} ${t.lastName}</option>`
            ).join('');

            // Populate all teacher selects
            if (codeTeacherSelect) {
                codeTeacherSelect.innerHTML = '<option value="">Select a teacher...</option>' + teacherOptions;
            }
            const rosterTeacherSelect = document.getElementById('rosterTeacherSelect');
            if (rosterTeacherSelect) {
                rosterTeacherSelect.innerHTML = '<option value="">No teacher assignment</option>' + teacherOptions;
            }
        } catch (error) {
            console.error('Error loading teachers for selects:', error);
        }
    }

    async function populateEnrollmentCodeSelect() {
        try {
            const response = await fetch('/api/admin/enrollment-codes', { credentials: 'include' });
            if (!response.ok) return;

            const codes = await response.json();
            const codeOptions = codes.map(c =>
                `<option value="${c._id}">${c.code} - ${c.className} (${c.teacherId?.firstName || 'Unknown'})</option>`
            ).join('');

            const rosterEnrollmentCodeSelect = document.getElementById('rosterEnrollmentCodeSelect');
            if (rosterEnrollmentCodeSelect) {
                rosterEnrollmentCodeSelect.innerHTML = '<option value="">No enrollment code</option>' + codeOptions;
            }
        } catch (error) {
            console.error('Error loading enrollment codes:', error);
        }
    }

    function openCreateEnrollmentCodeModal() {
        createEnrollmentCodeModal?.classList.add('is-visible');
        createEnrollmentCodeForm?.reset();
        codeCreatedResult.style.display = 'none';
        createEnrollmentCodeForm.style.display = 'block';
        populateTeacherSelects();
    }

    function closeCreateEnrollmentCodeModal() {
        createEnrollmentCodeModal?.classList.remove('is-visible');
    }

    if (openEnrollmentCodeBtn) {
        openEnrollmentCodeBtn.addEventListener('click', openCreateEnrollmentCodeModal);
    }

    if (closeEnrollmentCodeBtn) {
        closeEnrollmentCodeBtn.addEventListener('click', closeCreateEnrollmentCodeModal);
    }

    if (cancelCreateCode) {
        cancelCreateCode.addEventListener('click', closeCreateEnrollmentCodeModal);
    }

    if (createAnotherCode) {
        createAnotherCode.addEventListener('click', () => {
            codeCreatedResult.style.display = 'none';
            createEnrollmentCodeForm.style.display = 'block';
            createEnrollmentCodeForm.reset();
        });
    }

    if (createEnrollmentCodeForm) {
        createEnrollmentCodeForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = document.getElementById('createEnrollmentCodeSubmit');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

            try {
                const formData = {
                    teacherId: document.getElementById('codeTeacherSelect').value,
                    className: document.getElementById('codeClassName').value.trim(),
                    gradeLevel: document.getElementById('codeGradeLevel').value.trim() || undefined,
                    mathCourse: document.getElementById('codeMathCourse').value.trim() || undefined,
                    customCode: document.getElementById('customCode').value.trim() || undefined,
                    maxUses: document.getElementById('codeMaxUses').value || undefined,
                    expiresAt: document.getElementById('codeExpires').value || undefined
                };

                const response = await csrfFetch('/api/admin/enrollment-codes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(formData)
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    document.getElementById('resultEnrollmentCode').textContent = result.enrollmentCode.code;
                    document.getElementById('resultCodeClassName').textContent = result.enrollmentCode.className;
                    document.getElementById('resultCodeTeacher').textContent = result.enrollmentCode.teacherName;

                    createEnrollmentCodeForm.style.display = 'none';
                    codeCreatedResult.style.display = 'block';
                } else {
                    throw new Error(result.message || 'Failed to create enrollment code');
                }
            } catch (error) {
                showToast(`Error: ${error.message}`, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-key"></i> Create Code';
            }
        });
    }

    // --- Roster Import Modal ---
    const rosterImportModal = document.getElementById('rosterImportModal');
    const openRosterImportBtn = document.getElementById('openRosterImportBtn');
    const closeRosterImportBtn = document.getElementById('closeRosterImportBtn');
    const cancelRosterImport = document.getElementById('cancelRosterImport');
    const rosterImportForm = document.getElementById('rosterImportForm');
    const validateRosterBtn = document.getElementById('validateRosterBtn');
    const rosterImportResults = document.getElementById('rosterImportResults');
    const importAnotherRoster = document.getElementById('importAnotherRoster');
    const downloadSampleCSV = document.getElementById('downloadSampleCSV');
    const exportCredentialsBtn = document.getElementById('exportCredentialsBtn');

    let lastImportedStudents = [];

    function openRosterImportModal() {
        rosterImportModal?.classList.add('is-visible');
        rosterImportForm?.reset();
        rosterImportResults.style.display = 'none';
        document.querySelectorAll('#rosterImportModal .modal-section').forEach(s => {
            if (!s.closest('#rosterImportResults')) s.style.display = 'block';
        });
        populateTeacherSelects();
        populateEnrollmentCodeSelect();
    }

    function closeRosterImportModal() {
        rosterImportModal?.classList.remove('is-visible');
    }

    if (openRosterImportBtn) {
        openRosterImportBtn.addEventListener('click', openRosterImportModal);
    }

    if (closeRosterImportBtn) {
        closeRosterImportBtn.addEventListener('click', closeRosterImportModal);
    }

    if (cancelRosterImport) {
        cancelRosterImport.addEventListener('click', closeRosterImportModal);
    }

    if (importAnotherRoster) {
        importAnotherRoster.addEventListener('click', () => {
            rosterImportResults.style.display = 'none';
            document.querySelectorAll('#rosterImportModal .modal-section').forEach(s => {
                if (!s.closest('#rosterImportResults')) s.style.display = 'block';
            });
            rosterImportForm.reset();
        });
    }

    if (downloadSampleCSV) {
        downloadSampleCSV.addEventListener('click', (e) => {
            e.preventDefault();
            const csvContent = 'firstName,lastName,email,gradeLevel,mathCourse\nJohn,Smith,john.smith@school.org,7th Grade,Pre-Algebra\nJane,Doe,jane.doe@school.org,7th Grade,Pre-Algebra\n';
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'student-roster-template.csv';
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    if (exportCredentialsBtn) {
        exportCredentialsBtn.addEventListener('click', () => {
            if (lastImportedStudents.length === 0) {
                showToast('No students to export', 'warning');
                return;
            }

            const csvContent = 'firstName,lastName,email,username,temporaryPassword\n' +
                lastImportedStudents.map(s =>
                    `${s.firstName},${s.lastName},${s.email},${s.username},${s.temporaryPassword}`
                ).join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `student-credentials-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    async function performRosterImport(dryRun = false) {
        const fileInput = document.getElementById('rosterFile');
        const teacherId = document.getElementById('rosterTeacherSelect')?.value || '';
        const enrollmentCodeId = document.getElementById('rosterEnrollmentCodeSelect')?.value || '';

        if (!fileInput.files[0]) {
            showToast('Please select a CSV file', 'warning');
            return;
        }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        let url = `/api/admin/roster-import?dryRun=${dryRun}`;
        if (teacherId) url += `&teacherId=${teacherId}`;
        if (enrollmentCodeId) url += `&enrollmentCodeId=${enrollmentCodeId}`;

        const submitBtn = dryRun ? validateRosterBtn : document.getElementById('importRosterBtn');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

        try {
            const response = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                body: formData
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Import failed');
            }

            displayImportResults(result, dryRun);

        } catch (error) {
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }

    function displayImportResults(result, dryRun) {
        // Hide input sections, show results
        document.querySelectorAll('#rosterImportModal .modal-section').forEach(s => {
            if (!s.closest('#rosterImportResults')) s.style.display = 'none';
        });
        rosterImportResults.style.display = 'block';

        // Update stats
        document.getElementById('resultTotalRows').textContent = result.summary?.totalRows || result.summary?.totalStudents || 0;
        document.getElementById('resultCreated').textContent = dryRun ? result.summary?.validStudents || 0 : result.summary?.created || 0;
        document.getElementById('resultSkipped').textContent = result.summary?.skippedStudents || result.skippedStudents?.length || 0;
        document.getElementById('resultErrors').textContent = result.summary?.errors || result.errors?.length || 0;

        // Created students table
        const createdList = document.getElementById('createdStudentsList');
        const createdTbody = document.getElementById('createdStudentsTableBody');
        const studentsToShow = dryRun ? result.newStudents : result.createdStudents;

        if (studentsToShow && studentsToShow.length > 0) {
            createdList.style.display = 'block';
            lastImportedStudents = studentsToShow;
            createdTbody.innerHTML = studentsToShow.map(s => `
                <tr>
                    <td>${s.firstName} ${s.lastName}</td>
                    <td>${s.email}</td>
                    <td>${s.username}</td>
                    <td><code style="background: #f8f9fa; padding: 2px 6px; border-radius: 4px;">${s.temporaryPassword || (dryRun ? 'N/A (dry run)' : 'N/A')}</code></td>
                </tr>
            `).join('');

            // Hide export button for dry runs
            exportCredentialsBtn.style.display = dryRun ? 'none' : 'inline-block';
        } else {
            createdList.style.display = 'none';
        }

        // Skipped students table
        const skippedList = document.getElementById('skippedStudentsList');
        const skippedTbody = document.getElementById('skippedStudentsTableBody');

        if (result.skippedStudents && result.skippedStudents.length > 0) {
            skippedList.style.display = 'block';
            skippedTbody.innerHTML = result.skippedStudents.map(s => `
                <tr>
                    <td>${s.firstName} ${s.lastName}</td>
                    <td>${s.email}</td>
                    <td>${s.reason}</td>
                </tr>
            `).join('');
        } else {
            skippedList.style.display = 'none';
        }

        // Errors table
        const errorsList = document.getElementById('importErrorsList');
        const errorsTbody = document.getElementById('importErrorsTableBody');

        if (result.errors && result.errors.length > 0) {
            errorsList.style.display = 'block';
            errorsTbody.innerHTML = result.errors.map(e => `
                <tr>
                    <td>${e.row || '-'}</td>
                    <td>${e.field || '-'}</td>
                    <td>${e.message || e.error || 'Unknown error'}</td>
                </tr>
            `).join('');
        } else {
            errorsList.style.display = 'none';
        }

        // Refresh dashboard if not dry run
        if (!dryRun && result.createdStudents?.length > 0) {
            initializeDashboard();
        }
    }

    if (validateRosterBtn) {
        validateRosterBtn.addEventListener('click', () => performRosterImport(true));
    }

    if (rosterImportForm) {
        rosterImportForm.addEventListener('submit', (e) => {
            e.preventDefault();
            performRosterImport(false);
        });
    }

    // -------------------------------------------------------------------------
    // --- Initial Load ---
    // -------------------------------------------------------------------------
    initializeDashboard();
    fetchSurveyStatsPreview(); // Load survey stats preview

    // =========================================================================
    // ADMIN UX ENHANCEMENTS (3x Better UX)
    // =========================================================================

    // -------------------------------------------------------------------------
    // --- AUDIT TRAIL (FERPA Compliance) ---
    // -------------------------------------------------------------------------

    const auditLog = [];

    function logAdminAction(action, details, targetUserId = null) {
        const entry = {
            timestamp: new Date().toISOString(),
            action,
            details,
            targetUserId,
            adminSession: window.location.href
        };
        auditLog.push(entry);

        // Also send to server for persistent logging
        fetch('/api/admin/audit-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(entry)
        }).catch(err => console.log('[Audit] Failed to send audit log:', err.message));

        // Update UI if audit panel exists
        updateAuditTrailUI();
    }

    function updateAuditTrailUI() {
        const auditPanel = document.getElementById('audit-trail-panel');
        if (!auditPanel) return;

        const recentEntries = auditLog.slice(-10).reverse();
        auditPanel.innerHTML = recentEntries.map(entry => {
            const time = new Date(entry.timestamp).toLocaleTimeString();
            return `
                <div class="audit-entry" style="padding: 8px; border-bottom: 1px solid #eee; font-size: 0.85em;">
                    <span style="color: #888;">${time}</span>
                    <strong style="color: #333; margin-left: 8px;">${entry.action}</strong>
                    <span style="color: #666; margin-left: 8px;">${entry.details}</span>
                </div>
            `;
        }).join('') || '<p style="color: #888; padding: 10px;">No recent actions</p>';
    }

    // Wrap existing admin actions with audit logging
    const originalInitializeDashboard = initializeDashboard;
    initializeDashboard = async function() {
        await originalInitializeDashboard();
        logAdminAction('DASHBOARD_LOADED', `Loaded ${students.length} students`);
    };

    // -------------------------------------------------------------------------
    // --- REAL-TIME POLLING ---
    // -------------------------------------------------------------------------

    let adminPollingInterval = null;
    let lastStudentCount = 0;
    let lastActiveSessionCount = 0;

    function startAdminPolling() {
        adminPollingInterval = setInterval(async () => {
            try {
                // Quick health check
                const healthRes = await fetch('/api/admin/health-check', { credentials: 'include' });
                if (healthRes.ok) {
                    const health = await healthRes.json();
                    const dbStatus = document.getElementById("dbStatus");
                    const aiStatus = document.getElementById("aiStatus");
                    const lastSyncTime = document.getElementById("lastSyncTime");

                    if (dbStatus) dbStatus.textContent = 'Online';
                    if (aiStatus) aiStatus.textContent = health.status || 'Operational';
                    if (lastSyncTime) lastSyncTime.textContent = new Date().toLocaleTimeString();
                }

                // Check for live activity changes
                const liveRes = await fetch('/api/admin/reports/live-activity', { credentials: 'include' });
                if (liveRes.ok) {
                    const liveData = await liveRes.json();
                    const currentActiveCount = liveData.sessions?.length || 0;

                    // Notify if more students are active
                    if (currentActiveCount > lastActiveSessionCount && lastActiveSessionCount > 0) {
                        showAdminNotification(
                            `${currentActiveCount - lastActiveSessionCount} new active session${currentActiveCount - lastActiveSessionCount > 1 ? 's' : ''}`,
                            'info'
                        );
                    }
                    lastActiveSessionCount = currentActiveCount;

                    // Update live activity badge
                    const liveCount = document.getElementById('liveActivityCount');
                    if (liveCount) {
                        liveCount.textContent = currentActiveCount;
                        liveCount.style.display = currentActiveCount > 0 ? 'inline-block' : 'none';
                    }
                }
            } catch (error) {
                console.log('[Admin Polling] Error:', error.message);
            }
        }, 45000); // Poll every 45 seconds
    }

    function stopAdminPolling() {
        if (adminPollingInterval) {
            clearInterval(adminPollingInterval);
            adminPollingInterval = null;
        }
    }

    function showAdminNotification(message, type = 'info') {
        // Delegate to the stacked toast system
        showToast(message, type);
    }

    // Start polling
    startAdminPolling();

    // Handle visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopAdminPolling();
        } else {
            startAdminPolling();
        }
    });

    window.addEventListener('beforeunload', stopAdminPolling);

    // -------------------------------------------------------------------------
    // --- ENHANCED BULK OPERATIONS ---
    // -------------------------------------------------------------------------

    // Selection state (`selectedUsers`) is declared with the rest of the user-
    // directory state near the top of this file.

    function updateBulkSelectionUI() {
        const count = selectedUsers.size;
        let bulkBar = document.getElementById('admin-bulk-bar');

        if (!bulkBar) {
            bulkBar = document.createElement('div');
            bulkBar.id = 'admin-bulk-bar';
            bulkBar.style.cssText = `
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                background: #2c3e50;
                color: white;
                padding: 15px 30px;
                display: none;
                justify-content: center;
                align-items: center;
                gap: 20px;
                z-index: 9999;
                box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
            `;
            document.body.appendChild(bulkBar);
        }

        if (count > 0) {
            bulkBar.innerHTML = `
                <span style="font-weight: 600;">${count} user${count > 1 ? 's' : ''} selected</span>
                <button onclick="bulkAssignTeacher()" style="background: #3498db; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-chalkboard-teacher"></i> Assign Teacher
                </button>
                <button onclick="bulkExportUsers()" style="background: #27ae60; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-download"></i> Export
                </button>
                <button onclick="bulkResetScreeners()" style="background: #f39c12; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-redo"></i> Reset Screeners
                </button>
                <button onclick="clearBulkSelection()" style="background: transparent; color: #ccc; border: 1px solid #666; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-times"></i> Clear
                </button>
            `;
            bulkBar.style.display = 'flex';
        } else {
            bulkBar.style.display = 'none';
        }
    }

    window.clearBulkSelection = function() {
        selectedUsers.clear();
        document.querySelectorAll('.select-student:checked').forEach(cb => cb.checked = false);
        syncSelectAllCheckbox();
        updateBulkSelectionUI();
    };

    window.bulkAssignTeacher = async function() {
        const teacherId = prompt('Enter teacher ID or leave blank to unassign:');
        if (teacherId === null) return; // Cancelled

        const ids = Array.from(selectedUsers.keys());
        try {
            const res = await csrfFetch("/api/admin/assign-teacher", {
                method: "PATCH",
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ studentIds: ids, teacherId: teacherId || null })
            });
            const result = await res.json();
            if (res.ok) {
                logAdminAction('BULK_ASSIGN_TEACHER', `Assigned ${ids.length} students to teacher ${teacherId || 'none'}`, ids.join(','));
                showAdminNotification(`Assigned ${ids.length} students`, 'success');
                clearBulkSelection();
                await initializeDashboard();
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            showAdminNotification(`Error: ${error.message}`, 'error');
        }
    };

    window.bulkExportUsers = function() {
        // Straight from the selection map — `students` is one page, and a
        // selection may span several.
        const selected = Array.from(selectedUsers.values());
        if (selected.length === 0) return;

        logAdminAction('BULK_EXPORT', `Exported ${selected.length} users`);

        const headers = ['Name', 'Email', 'Username', 'Grade', 'Teacher', 'Level', 'XP'];
        const rows = selected.map(s => [
            `${s.firstName} ${s.lastName}`,
            s.email || '',
            s.username || '',
            s.gradeLevel || '',
            teacherMap.get(s.teacherId) || '',
            s.level || 1,
            s.xp || 0
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bulk-export-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        showAdminNotification(`Exported ${selected.length} users`, 'success');
        clearBulkSelection();
    };

    window.bulkResetScreeners = async function() {
        const count = selectedUsers.size;
        if (!confirm(`Reset placement screeners for ${count} selected users?`)) return;

        const ids = Array.from(selectedUsers.keys());
        let successCount = 0;

        for (const studentId of ids) {
            try {
                const response = await csrfFetch(`/api/admin/students/${studentId}/reset-assessment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ reason: 'Bulk reset by admin' })
                });
                if (response.ok) successCount++;
            } catch (error) {
                console.error(`Failed to reset ${studentId}:`, error);
            }
        }

        logAdminAction('BULK_RESET_SCREENERS', `Reset ${successCount}/${count} screeners`);
        showAdminNotification(`Reset ${successCount}/${count} screeners`, successCount === count ? 'success' : 'warning');
        clearBulkSelection();
        await initializeDashboard();
    };

    /** Remember the whole record, so an export can rebuild the row off-page. */
    function selectUser(id) {
        const record = students.find(s => s._id === id) || selectedUsers.get(id);
        if (record) selectedUsers.set(id, record);
    }

    /**
     * Reflect the page's selection state on the header checkbox: checked when
     * every row on this page is selected, indeterminate when only some are.
     * Without this, paging away and back showed an unchecked "select all" above
     * a page of checked rows.
     */
    function syncSelectAllCheckbox() {
        const box = document.getElementById(SELECT_ALL_ID);
        if (!box) return;
        const onPage = students.length;
        const picked = students.filter(s => selectedUsers.has(s._id)).length;
        box.checked = onPage > 0 && picked === onPage;
        box.indeterminate = picked > 0 && picked < onPage;
    }

    // Listen for checkbox changes
    if (userTableBody) {
        userTableBody.addEventListener('change', (e) => {
            if (e.target.classList.contains('select-student')) {
                const studentId = e.target.value;
                if (e.target.checked) selectUser(studentId);
                else selectedUsers.delete(studentId);
                syncSelectAllCheckbox();
                updateBulkSelectionUI();
            }
        });
    }

    // Select all checkbox — scoped to the rows on THIS page, which is what the
    // checkbox sits above. Selections on other pages are left alone.
    const selectAllCheckbox = document.getElementById(SELECT_ALL_ID);
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', () => {
            const checkboxes = document.querySelectorAll('.select-student');
            checkboxes.forEach(cb => {
                cb.checked = selectAllCheckbox.checked;
                if (selectAllCheckbox.checked) selectUser(cb.value);
                else selectedUsers.delete(cb.value);
            });
            selectAllCheckbox.indeterminate = false;
            updateBulkSelectionUI();
        });
    }

    // -------------------------------------------------------------------------
    // --- KEYBOARD SHORTCUTS ---
    // -------------------------------------------------------------------------

    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + F: Focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            if (studentSearch) studentSearch.focus();
        }

        // Escape: Close modals and clear selection
        if (e.key === 'Escape') {
            closeModal();
            closeSurveyResponsesModal();
            if (usageReportModal) usageReportModal.classList.remove('is-visible');
            if (liveActivityModal) liveActivityModal.classList.remove('is-visible');
            if (summariesModal) summariesModal.classList.remove('is-visible');
            if (waitlistModal) waitlistModal.classList.remove('is-visible');
            clearBulkSelection();
        }

        // Ctrl/Cmd + R: Refresh dashboard
        if ((e.ctrlKey || e.metaKey) && e.key === 'r' && !e.shiftKey) {
            e.preventDefault();
            showAdminNotification('Refreshing dashboard...', 'info');
            initializeDashboard();
        }
    });

    // Toast animations are now handled by CSS in the HTML file

    // -------------------------------------------------------------------------
    // --- Email Waitlist Management ---
    // -------------------------------------------------------------------------

    const waitlistModal = document.getElementById('waitlistModal');
    const openWaitlistBtn = document.getElementById('openWaitlistBtn');
    const closeWaitlistBtn = document.getElementById('closeWaitlistBtn');
    const waitlistSearch = document.getElementById('waitlistSearch');
    const waitlistRoleFilter = document.getElementById('waitlistRoleFilter');
    const exportWaitlistCSV = document.getElementById('exportWaitlistCSV');
    const waitlistTableBody = document.getElementById('waitlistTableBody');

    let allWaitlistEntries = [];

    async function fetchWaitlistData() {
        try {
            const res = await fetch('/api/admin/waitlist', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to fetch waitlist');
            const data = await res.json();
            allWaitlistEntries = data.entries || [];
            updateWaitlistQuickStats(allWaitlistEntries);
            renderWaitlistTable(allWaitlistEntries);
        } catch (err) {
            console.error('[Waitlist] Fetch error:', err);
            if (waitlistTableBody) {
                waitlistTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#e74c3c;">Failed to load waitlist data.</td></tr>';
            }
        }
    }

    function updateWaitlistQuickStats(entries) {
        const counts = { student: 0, parent: 0, teacher: 0, other: 0 };
        entries.forEach(e => { counts[e.role] = (counts[e.role] || 0) + 1; });
        const total = entries.length;

        // Sidebar quick stats
        const qs = id => document.getElementById(id);
        if (qs('waitlistTotal')) qs('waitlistTotal').textContent = total;
        if (qs('waitlistStudents')) qs('waitlistStudents').textContent = counts.student;
        if (qs('waitlistParents')) qs('waitlistParents').textContent = counts.parent;
        if (qs('waitlistTeachers')) qs('waitlistTeachers').textContent = counts.teacher;
        if (qs('waitlistOther')) qs('waitlistOther').textContent = counts.other;

        // Modal stats
        if (qs('waitlistModalTotal')) qs('waitlistModalTotal').textContent = total;
        if (qs('waitlistModalStudents')) qs('waitlistModalStudents').textContent = counts.student;
        if (qs('waitlistModalParents')) qs('waitlistModalParents').textContent = counts.parent;
        if (qs('waitlistModalTeachers')) qs('waitlistModalTeachers').textContent = counts.teacher;
        if (qs('waitlistModalOther')) qs('waitlistModalOther').textContent = counts.other;
    }

    function renderWaitlistTable(entries) {
        if (!waitlistTableBody) return;
        const search = (waitlistSearch?.value || '').toLowerCase();
        const roleFilter = waitlistRoleFilter?.value || '';

        const filtered = entries.filter(e => {
            const matchSearch = !search || e.email.toLowerCase().includes(search);
            const matchRole = !roleFilter || e.role === roleFilter;
            return matchSearch && matchRole;
        });

        if (filtered.length === 0) {
            waitlistTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No waitlist entries found.</td></tr>';
        } else {
            waitlistTableBody.innerHTML = filtered.map(e => {
                const date = new Date(e.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                const roleLabel = e.role.charAt(0).toUpperCase() + e.role.slice(1);
                return `<tr>
                    <td>${escapeHTML(e.email)}</td>
                    <td><span class="role-badge role-badge-${e.role}">${roleLabel}</span></td>
                    <td>${date}</td>
                    <td><button class="btn btn-danger btn-sm waitlist-delete-btn" data-id="${e._id}" title="Delete"><i class="fas fa-trash"></i></button></td>
                </tr>`;
            }).join('');
        }

        const countEl = document.getElementById('waitlistCount');
        if (countEl) countEl.textContent = `Showing ${filtered.length} of ${entries.length} entries`;
    }

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Open modal
    if (openWaitlistBtn) {
        openWaitlistBtn.addEventListener('click', () => {
            if (waitlistModal) {
                waitlistModal.classList.add('is-visible');
                fetchWaitlistData();
            }
        });
    }

    // Close modal
    if (closeWaitlistBtn) {
        closeWaitlistBtn.addEventListener('click', () => {
            if (waitlistModal) waitlistModal.classList.remove('is-visible');
        });
    }
    if (waitlistModal) {
        waitlistModal.addEventListener('click', (e) => {
            if (e.target === waitlistModal) waitlistModal.classList.remove('is-visible');
        });
    }

    // Search & filter
    if (waitlistSearch) waitlistSearch.addEventListener('input', debounce(() => renderWaitlistTable(allWaitlistEntries), 300));
    if (waitlistRoleFilter) waitlistRoleFilter.addEventListener('change', () => renderWaitlistTable(allWaitlistEntries));

    // Delete entry
    if (waitlistTableBody) {
        waitlistTableBody.addEventListener('click', async (e) => {
            const btn = e.target.closest('.waitlist-delete-btn');
            if (!btn) return;
            const id = btn.dataset.id;
            if (!confirm('Remove this email from the waitlist?')) return;
            try {
                const res = await csrfFetch(`/api/admin/waitlist/${id}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('Delete failed');
                showToast('Waitlist entry removed.', 'success');
                allWaitlistEntries = allWaitlistEntries.filter(e => e._id !== id);
                updateWaitlistQuickStats(allWaitlistEntries);
                renderWaitlistTable(allWaitlistEntries);
            } catch (err) {
                console.error('[Waitlist] Delete error:', err);
                showToast('Failed to remove entry.', 'error');
            }
        });
    }

    // Export CSV
    if (exportWaitlistCSV) {
        exportWaitlistCSV.addEventListener('click', () => {
            if (allWaitlistEntries.length === 0) {
                showToast('No waitlist entries to export.', 'warning');
                return;
            }
            const header = 'Email,Role,Signed Up\n';
            const rows = allWaitlistEntries.map(e => {
                const date = new Date(e.createdAt).toISOString().split('T')[0];
                return `"${e.email}","${e.role}","${date}"`;
            }).join('\n');
            const blob = new Blob([header + rows], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `waitlist-export-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('CSV exported successfully.', 'success');
        });
    }

    // Fetch initial sidebar stats on load
    fetchWaitlistData();

    // --- Merge Accounts Modal ---
    const mergeAccountsModal = document.getElementById('mergeAccountsModal');
    const openMergeAccountsBtn = document.getElementById('openMergeAccountsBtn');
    const closeMergeAccountsBtn = document.getElementById('closeMergeAccountsBtn');
    const cancelMergeAccounts = document.getElementById('cancelMergeAccounts');
    const mergeAccountsForm = document.getElementById('mergeAccountsForm');
    const mergeAccountsResult = document.getElementById('mergeAccountsResult');
    const mergeAnother = document.getElementById('mergeAnother');

    async function populateMergeSelects() {
        try {
            // Already sorted by last name server-side.
            const users = await fetchUserLookup({});
            const options = users.map(u => {
                const roles = (u.roles && u.roles.length ? u.roles : [u.role]).filter(Boolean).join(', ');
                const label = `${u.lastName}, ${u.firstName} (${u.email || 'no email'}) — ${roles}`;
                return `<option value="${escapeHtml(u._id)}">${escapeHtml(label)}</option>`;
            }).join('') + truncationNotice(users);
            const sourceSelect = document.getElementById('mergeSourceSelect');
            const targetSelect = document.getElementById('mergeTargetSelect');
            if (sourceSelect) sourceSelect.innerHTML = '<option value="">Select source account...</option>' + options;
            if (targetSelect) targetSelect.innerHTML = '<option value="">Select target account...</option>' + options;
        } catch (err) {
            console.error('Failed to populate merge selects:', err);
        }
    }

    async function openMergeAccountsModal() {
        mergeAccountsModal?.classList.add('is-visible');
        mergeAccountsForm?.reset();
        mergeAccountsResult.style.display = 'none';
        mergeAccountsForm.style.display = 'block';
        await populateMergeSelects();
    }

    function closeMergeAccountsModal() {
        mergeAccountsModal?.classList.remove('is-visible');
    }

    if (openMergeAccountsBtn) {
        openMergeAccountsBtn.addEventListener('click', openMergeAccountsModal);
    }
    if (closeMergeAccountsBtn) {
        closeMergeAccountsBtn.addEventListener('click', closeMergeAccountsModal);
    }
    if (cancelMergeAccounts) {
        cancelMergeAccounts.addEventListener('click', closeMergeAccountsModal);
    }
    if (mergeAnother) {
        mergeAnother.addEventListener('click', () => {
            mergeAccountsResult.style.display = 'none';
            mergeAccountsForm.style.display = 'block';
            mergeAccountsForm.reset();
        });
    }

    if (mergeAccountsForm) {
        mergeAccountsForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const sourceUserId = document.getElementById('mergeSourceSelect').value;
            const targetUserId = document.getElementById('mergeTargetSelect').value;

            if (!sourceUserId || !targetUserId) {
                showToast('Please select both source and target accounts.', 'warning');
                return;
            }
            if (sourceUserId === targetUserId) {
                showToast('Source and target cannot be the same account.', 'warning');
                return;
            }

            // Confirm before proceeding
            const sourceText = document.getElementById('mergeSourceSelect').selectedOptions[0]?.text || '';
            const targetText = document.getElementById('mergeTargetSelect').selectedOptions[0]?.text || '';
            if (!confirm(`Are you sure you want to merge?\n\nSOURCE (will be DELETED): ${sourceText}\nTARGET (will keep): ${targetText}\n\nThis action cannot be undone.`)) {
                return;
            }

            const submitBtn = document.getElementById('mergeAccountsSubmit');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Merging...';

            try {
                const conflictResolution = {
                    subscriptionTier: document.getElementById('mergeSubTier').value,
                    xp: document.getElementById('mergeXp').value,
                    skillMastery: document.getElementById('mergeSM').value
                };
                const auditNotes = document.getElementById('mergeNotes').value;

                const response = await csrfFetch('/api/admin/merge-accounts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ sourceUserId, targetUserId, conflictResolution, auditNotes })
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    document.getElementById('mergeResultMessage').textContent = result.message;
                    const auditDiv = document.getElementById('mergeAuditDetails');
                    if (auditDiv && result.audit && result.audit.changes) {
                        auditDiv.innerHTML = '<strong>Changes made:</strong><ul>' +
                            result.audit.changes.map(c => `<li>${c}</li>`).join('') +
                            '</ul>';
                    }
                    mergeAccountsForm.style.display = 'none';
                    mergeAccountsResult.style.display = 'block';
                    await initializeDashboard();
                } else {
                    throw new Error(result.message || 'Failed to merge accounts');
                }
            } catch (error) {
                showToast(`Error: ${error.message}`, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-code-branch"></i> Merge Accounts';
            }
        });
    }

    // ============================================================
    // Conversion Funnel (signup-cohort) — modal + sidebar preview
    // ============================================================
    let funnelChartInstance = null;

    // Build the query string from the modal controls. A day-count range is
    // converted to an explicit createdAt window; 'all' drops the window.
    function funnelQueryString() {
        const role = document.getElementById('funnelRole')?.value || 'student';
        const range = document.getElementById('funnelRange')?.value || '90';
        const params = new URLSearchParams({ role });
        if (range === 'all') {
            params.set('all', 'true');
        } else {
            const days = parseInt(range, 10) || 90;
            const end = new Date();
            const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
            params.set('startDate', start.toISOString());
            params.set('endDate', end.toISOString());
        }
        return params.toString();
    }

    async function loadFunnelData() {
        const tbody = document.getElementById('funnelTableBody');
        try {
            const response = await fetch(`/api/admin/funnel?${funnelQueryString()}`, { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to fetch funnel');
            const data = await response.json();
            const s = data.summary || {};

            document.getElementById('funnelSignups').textContent = s.signups ?? 0;
            document.getElementById('funnelActivationRate').textContent = `${s.activationRate ?? 0}%`;
            document.getElementById('funnelPaidRate').textContent = `${s.paidConversionRate ?? 0}%`;
            document.getElementById('funnelChurnRate').textContent = `${s.churnRate ?? 0}%`;

            const label = document.getElementById('funnelWindowLabel');
            if (label) {
                label.textContent = data.filters?.allTime
                    ? 'Window: all signups ever (by signup date)'
                    : `Window: ${new Date(data.filters.startDate).toLocaleDateString()} – ${new Date(data.filters.endDate).toLocaleDateString()} (by signup date)`;
            }

            renderFunnelTable(data.funnel || []);
            renderFunnelChart(data.funnel || []);
        } catch (err) {
            console.error('Error loading funnel data:', err);
            if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#e74c3c;">Failed to load funnel data</td></tr>';
        }
    }

    function renderFunnelTable(funnel) {
        const tbody = document.getElementById('funnelTableBody');
        if (!tbody) return;
        if (!funnel.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#999;">No data</td></tr>';
            return;
        }
        tbody.innerHTML = funnel.map((stage, i) => `
            <tr>
                <td><strong>${stage.stage}</strong></td>
                <td style="text-align:center; font-weight:600;">${stage.count}</td>
                <td style="text-align:center;">${i === 0 ? '—' : stage.pctOfPrevious + '%'}</td>
                <td style="text-align:center;">${stage.pctOfTotal}%</td>
            </tr>
        `).join('');
    }

    function renderFunnelChart(funnel) {
        const canvas = document.getElementById('funnelChart');
        if (!canvas || typeof Chart === 'undefined') return;
        // Destroy a prior instance so re-opening the modal doesn't leak charts.
        if (funnelChartInstance) { funnelChartInstance.destroy(); funnelChartInstance = null; }
        funnelChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: funnel.map(s => s.stage),
                datasets: [{ label: 'Users', data: funnel.map(s => s.count), backgroundColor: '#7b1fa2' }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        });
    }

    async function openFunnelModal() {
        const modal = document.getElementById('funnelModal');
        if (!modal) return;
        modal.classList.add('is-visible');
        await loadFunnelData();
    }

    function closeFunnelModal() {
        const modal = document.getElementById('funnelModal');
        if (modal) modal.classList.remove('is-visible');
    }

    const openFunnelBtn = document.getElementById('openFunnelBtn');
    if (openFunnelBtn) openFunnelBtn.addEventListener('click', openFunnelModal);
    const closeFunnelBtn = document.getElementById('closeFunnelBtn');
    if (closeFunnelBtn) closeFunnelBtn.addEventListener('click', closeFunnelModal);
    const refreshFunnelBtn = document.getElementById('refreshFunnelBtn');
    if (refreshFunnelBtn) refreshFunnelBtn.addEventListener('click', loadFunnelData);
    document.getElementById('funnelRole')?.addEventListener('change', loadFunnelData);
    document.getElementById('funnelRange')?.addEventListener('change', loadFunnelData);

    const funnelModalEl = document.getElementById('funnelModal');
    if (funnelModalEl) {
        funnelModalEl.addEventListener('click', (e) => {
            if (e.target === funnelModalEl) closeFunnelModal();
        });
    }

    // Sidebar preview (last 90 days, students) — best-effort, non-blocking.
    (async () => {
        try {
            const r = await fetch('/api/admin/funnel?role=student', { credentials: 'include' });
            if (!r.ok) return;
            const d = await r.json();
            const s = d.summary || {};
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
            set('funnelPreviewSignups', s.signups ?? 0);
            set('funnelPreviewActivation', `${s.activationRate ?? 0}%`);
            set('funnelPreviewPaid', `${s.paidConversionRate ?? 0}%`);
        } catch (_) { /* preview is best-effort */ }
    })();

    // ============================================================
    // Growth console — School Signals + Impact & Retention modals
    // (entry points for /api/admin/school-signals, /impact-report,
    //  /dormancy-summary; same modal conventions as the funnel above)
    // ============================================================

    // Domains and caveats come from the API but originate in user input
    // (email addresses), so everything interpolated into innerHTML is escaped.
    function escapeHtmlText(v) {
        const d = document.createElement('div');
        d.textContent = String(v ?? '');
        return d.innerHTML;
    }

    function renderCaveats(listId, caveats) {
        const ul = document.getElementById(listId);
        if (!ul) return;
        ul.innerHTML = (caveats || []).map(c => `<li>${escapeHtmlText(c)}</li>`).join('');
    }

    // ---- School Signals ----

    async function loadSchoolSignals() {
        const tbody = document.getElementById('ssTableBody');
        try {
            const readyOnly = document.getElementById('ssReadyOnlyToggle')?.checked ? 'true' : 'false';
            const r = await fetch(`/api/admin/school-signals?readyOnly=${readyOnly}`, { credentials: 'include' });
            if (!r.ok) throw new Error('Failed to fetch school signals');
            const data = await r.json();

            const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
            set('ssSchoolsInferred', data.totals?.schoolsInferred ?? 0);
            set('ssReadyCount', data.totals?.readyForOutreach ?? 0);
            set('ssTeachersConsidered', data.totals?.teachersConsidered ?? 0);

            const clusters = data.clusters || [];
            if (!clusters.length) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#888;">No institutional domains yet — teachers on personal email are invisible to this report.</td></tr>';
            } else {
                tbody.innerHTML = clusters.map(c => {
                    let status = '<span style="color:#94a3b8;">—</span>';
                    if (c.alreadyLicensed) {
                        status = '<span class="status-pill" style="background:#ede9fe;color:#5b21b6;border-color:#ddd6fe;">Renewal</span>';
                    } else if (c.readyForOutreach) {
                        status = '<span class="status-pill" style="background:#dcfce7;color:#15803d;border-color:#bbf7d0;">Ready</span>';
                    }
                    return `<tr>
                        <td>${escapeHtmlText(c.domain)}</td>
                        <td>${c.teachers ?? 0}</td>
                        <td>${c.activeTeachers ?? 0}</td>
                        <td>${c.students ?? 0}</td>
                        <td>${c.activeStudents ?? 0}</td>
                        <td>${(c.tutoringMinutes ?? 0).toLocaleString()}</td>
                        <td>${status}</td>
                    </tr>`;
                }).join('');
            }

            renderCaveats('ssCaveats', data.caveats);
        } catch (err) {
            console.error('Error loading school signals:', err);
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#e74c3c;">Failed to load school signals</td></tr>';
        }
    }

    // ---- Impact & Retention ----

    async function loadImpactAndRetention() {
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        try {
            const r = await fetch('/api/admin/impact-report', { credentials: 'include' });
            if (!r.ok) throw new Error('Failed to fetch impact report');
            const data = await r.json();

            const c = data.cohort || {};
            const g = data.growth || {};
            set('irMeasured', `${c.measured ?? 0} / ${c.enrolled ?? 0} (${c.measuredPct ?? 0}%)`);
            const gain = g.meanThetaGain ?? 0;
            set('irMeanGain', `${gain > 0 ? '+' : ''}${gain}`);
            set('irMonths', g.meanMonthsOfGrowth ?? 0);
            set('irCi', g.ci95 ? `${g.ci95.low} to ${g.ci95.high}` : 'n too small');

            // Distribution: a 3-segment bar (status semantics — growth is good,
            // decline is serious) with counts printed in the legend, so the
            // reading never depends on color alone.
            const d = data.distribution || {};
            const measured = c.measured ?? 0;
            const bar = document.getElementById('irDistBar');
            const legend = document.getElementById('irDistLegend');
            if (bar && legend) {
                const segs = [
                    { label: 'Grew', count: d.grew ?? 0, bg: '#bbf7d0' },
                    { label: 'Stable', count: d.stable ?? 0, bg: '#e2e8f0' },
                    { label: 'Declined', count: d.declined ?? 0, bg: '#fecaca' },
                ];
                bar.innerHTML = measured
                    ? segs.filter(x => x.count > 0).map(x =>
                        `<div style="flex:${x.count};background:${x.bg};" title="${x.label}: ${x.count}"></div>`).join('')
                    : '<div style="flex:1;background:#f1f5f9;" title="No growth checks yet"></div>';
                legend.innerHTML = segs.map(x => `<span>${x.label}: <strong>${x.count}</strong></span>`).join('');
            }

            renderCaveats('irCaveats', data.caveats);
        } catch (err) {
            console.error('Error loading impact report:', err);
            set('irMeasured', 'error');
        }

        try {
            const r = await fetch('/api/admin/dormancy-summary', { credentials: 'include' });
            if (!r.ok) throw new Error('Failed to fetch dormancy summary');
            const d = await r.json();
            set('doTotal', d.total ?? 0);
            set('doWithParent', d.withLinkedParent ?? 0);
            set('doEmailable', d.emailableToday ?? 0);
            const b = d.buckets || {};
            const bucketsEl = document.getElementById('doBuckets');
            if (bucketsEl) {
                bucketsEl.innerHTML =
                    `Gone 14–30 days: <strong>${b.d14to30 ?? 0}</strong> · ` +
                    `30–90 days: <strong>${b.d30to90 ?? 0}</strong> · ` +
                    `90+ days: <strong>${b.d90plus ?? 0}</strong> · ` +
                    `never logged in: <strong>${b.never ?? 0}</strong>`;
            }
        } catch (err) {
            console.error('Error loading dormancy summary:', err);
            set('doTotal', 'error');
        }
    }

    // ---- Modal wiring (mirrors the funnel modal above) ----

    function wireGrowthModal(modalId, openBtnId, closeBtnId, refreshBtnId, loader) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        const open = async () => { modal.classList.add('is-visible'); await loader(); };
        const close = () => modal.classList.remove('is-visible');
        document.getElementById(openBtnId)?.addEventListener('click', open);
        document.getElementById(closeBtnId)?.addEventListener('click', close);
        document.getElementById(refreshBtnId)?.addEventListener('click', loader);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    }

    wireGrowthModal('schoolSignalsModal', 'openSchoolSignalsBtn', 'closeSchoolSignalsBtn', 'refreshSchoolSignalsBtn', loadSchoolSignals);
    wireGrowthModal('impactModal', 'openImpactReportBtn', 'closeImpactBtn', 'refreshImpactBtn', loadImpactAndRetention);
    document.getElementById('ssReadyOnlyToggle')?.addEventListener('change', loadSchoolSignals);

    console.log('[Admin Dashboard] 3x UX enhancements loaded: Audit Trail, Real-time Polling, Bulk Operations');
});
;
/* --- /js/teacher-transcripts.js --- */
/**
 * teacher-transcripts.js
 *
 * Opens a read-only, Messages-app-style transcript viewer for a single
 * conversation. Teachers can audit tutor turns turn-by-turn. Each tutor turn
 * can render an adjacent "reasoning trace" column once the permission
 * architecture populates conversation.reasoningTrace[]. Until then, the column
 * renders a placeholder.
 *
 * Entry point: window.TranscriptViewer.open(studentId, conversationId, opts)
 *
 * Wire-up: the module auto-delegates clicks from any element with
 * data-conversation-id + data-student-id to open the modal.
 */
(function () {
  'use strict';

  const STATE = {
    modal: null,
    lastTrigger: null,
    showReasoning: false,
    escHandler: null,
    // Flagging context. currentConversationId / currentStudentId are set per
    // open() so the delegated flag handler has what it needs. flaggedTurns
    // tracks turns the reviewer has already flagged in this session so the
    // button reflects state after a successful POST.
    currentConversationId: null,
    currentStudentId: null,
    flaggedTurns: new Set(),
  };

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'className') el.className = v;
        else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
        else el.setAttribute(k, v);
      }
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach(c => {
        if (c == null) return;
        el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return el;
  }

  function ensureModal() {
    if (STATE.modal) return STATE.modal;

    const modal = h('div', {
      id: 'transcript-viewer-modal',
      className: 'modal-overlay transcript-viewer-modal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'transcript-viewer-title',
    });

    const content = h('div', { className: 'modal-content' }, [
      h('span', {
        id: 'transcript-close-btn',
        className: 'modal-close-button',
        role: 'button',
        'aria-label': 'Close transcript viewer',
        tabindex: '0',
      }, '×'),
      h('div', { className: 'transcript-viewer-header' }, [
        h('h2', { id: 'transcript-viewer-title' }, [
          h('i', { className: 'fas fa-comments' }),
          h('span', { id: 'transcript-viewer-title-text' }, 'Transcript'),
        ]),
        h('div', { className: 'transcript-viewer-meta', id: 'transcript-viewer-meta' }),
      ]),
      h('div', { className: 'transcript-viewer-toolbar' }, [
        h('label', { className: 'transcript-toggle' }, [
          h('input', {
            type: 'checkbox',
            id: 'transcript-reasoning-toggle',
            'aria-label': 'Show reasoning trace',
          }),
          h('span', null, 'Show reasoning trace'),
        ]),
        h('span', { id: 'transcript-count' }, ''),
      ]),
      h('div', { className: 'transcript-viewer-body', id: 'transcript-viewer-body' }, [
        h('div', { className: 'transcript-loading' }, [
          h('i', { className: 'fas fa-spinner fa-spin' }),
          h('span', null, 'Loading transcript…'),
        ]),
      ]),
    ]);

    modal.appendChild(content);
    document.body.appendChild(modal);

    // Close interactions
    const close = () => closeModal();
    content.querySelector('#transcript-close-btn').addEventListener('click', close);
    content.querySelector('#transcript-close-btn').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(); }
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    // Reasoning toggle
    content.querySelector('#transcript-reasoning-toggle').addEventListener('change', (e) => {
      STATE.showReasoning = e.target.checked;
      renderBodyFromCache();
    });

    // Flag clicks (delegated inside the modal body)
    content.querySelector('#transcript-viewer-body').addEventListener('click', (e) => {
      const btn = e.target.closest('.transcript-flag-btn');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      handleFlagClick(btn);
    });

    STATE.modal = modal;
    return modal;
  }

  async function handleFlagClick(btn) {
    const turnIndex = Number(btn.dataset.turnIndex);
    if (!Number.isFinite(turnIndex) || turnIndex < 0) return;
    if (!STATE.currentConversationId) return;

    const reason = window.prompt(
      "Flag this tutor turn. What looks off? (This gets routed to admin review.)",
      ''
    );
    // prompt() returns null if the reviewer cancelled. Empty string is fine —
    // a no-reason flag is still signal.
    if (reason === null) return;

    btn.disabled = true;
    btn.classList.add('is-submitting');
    const label = btn.querySelector('.transcript-flag-label');
    if (label) label.textContent = 'Flagging…';

    try {
      const res = await fetch('/api/transcript-flags', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: STATE.currentConversationId,
          turnIndex,
          reason: (reason || '').trim(),
        }),
      });
      if (!res.ok) {
        let body = null;
        try { body = await res.json(); } catch { /* ignore */ }
        throw new Error(body?.message || `Flag failed (${res.status})`);
      }
      STATE.flaggedTurns.add(turnIndex);
      btn.classList.remove('is-submitting');
      btn.classList.add('is-flagged');
      btn.title = 'You already flagged this turn';
      btn.setAttribute('aria-label', 'Turn flagged');
      const icon = btn.querySelector('i');
      if (icon) icon.className = 'fas fa-flag-checkered';
      if (label) label.textContent = 'Flagged';
    } catch (err) {
      console.error('[TranscriptViewer] flag failed', err);
      btn.disabled = false;
      btn.classList.remove('is-submitting');
      if (label) label.textContent = 'Flag';
      window.alert(err.message || 'Could not flag this turn.');
    }
  }

  function closeModal() {
    if (!STATE.modal) return;
    STATE.modal.classList.remove('is-visible');
    if (STATE.escHandler) {
      document.removeEventListener('keydown', STATE.escHandler);
      STATE.escHandler = null;
    }
    if (STATE.lastTrigger && typeof STATE.lastTrigger.focus === 'function') {
      STATE.lastTrigger.focus();
    }
  }

  function openModal(triggerEl) {
    const modal = ensureModal();
    STATE.lastTrigger = triggerEl || null;
    modal.classList.add('is-visible');
    STATE.escHandler = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', STATE.escHandler);
    // Focus the close button so Esc/Enter works immediately for keyboard users.
    const closeBtn = modal.querySelector('#transcript-close-btn');
    if (closeBtn) closeBtn.focus();
  }

  function setBody(nodeOrHtml) {
    const body = STATE.modal.querySelector('#transcript-viewer-body');
    body.innerHTML = '';
    if (typeof nodeOrHtml === 'string') body.innerHTML = nodeOrHtml;
    else if (nodeOrHtml instanceof Node) body.appendChild(nodeOrHtml);
  }

  let CACHED_PAYLOAD = null;

  function renderBodyFromCache() {
    if (!CACHED_PAYLOAD) return;
    renderPayload(CACHED_PAYLOAD);
  }

  function formatTimestamp(ts) {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      return d.toLocaleString(undefined, {
        month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
    } catch { return ''; }
  }

  function formatDateOnly(ts) {
    if (!ts) return '';
    try { return new Date(ts).toLocaleDateString(); } catch { return ''; }
  }

  function renderHeader(student, conversation) {
    const titleText = STATE.modal.querySelector('#transcript-viewer-title-text');
    const meta = STATE.modal.querySelector('#transcript-viewer-meta');
    const count = STATE.modal.querySelector('#transcript-count');

    const name = student
      ? [student.firstName, student.lastName].filter(Boolean).join(' ') || student.username || 'Student'
      : 'Student';
    const convoName = conversation.customName || conversation.conversationName || conversation.topic || 'Math session';
    titleText.textContent = `${name} — ${convoName}`;

    meta.innerHTML = '';
    const date = conversation.startDate ? formatDateOnly(conversation.startDate) : '';
    if (date) {
      meta.appendChild(h('span', null, [h('i', { className: 'fas fa-calendar' }), ` ${date}`]));
    }
    if (conversation.activeMinutes != null) {
      meta.appendChild(h('span', null, [h('i', { className: 'fas fa-clock' }), ` ${conversation.activeMinutes} min`]));
    }
    if (conversation.topic) {
      meta.appendChild(h('span', null, [
        h('i', { className: 'fas fa-tag' }),
        ` ${conversation.topicEmoji || ''} ${conversation.topic}`.trim(),
      ]));
    }
    if (conversation.conversationType) {
      meta.appendChild(h('span', null, [h('i', { className: 'fas fa-layer-group' }), ` ${conversation.conversationType}`]));
    }

    const msgs = Array.isArray(conversation.messages) ? conversation.messages : [];
    count.textContent = msgs.length
      ? `${msgs.length} turn${msgs.length === 1 ? '' : 's'}`
      : '';
  }

  function problemResultChip(result) {
    if (!result) return null;
    const label = result === 'correct' ? 'Correct'
      : result === 'incorrect' ? 'Incorrect'
      : result === 'skipped' ? 'Skipped' : result;
    const icon = result === 'correct' ? 'fa-check'
      : result === 'incorrect' ? 'fa-xmark' : 'fa-forward';
    return h('span', { className: `transcript-chip ${result}` }, [
      h('i', { className: `fas ${icon}` }),
      ` ${label}`,
    ]);
  }

  function reactionChip(reaction) {
    if (!reaction) return null;
    return h('span', { className: 'transcript-chip reaction', title: 'Student reaction' }, reaction);
  }

  function renderBubble(msg, idx) {
    // Role → bubble class. The schema allows 'user' | 'assistant' | 'system'.
    // We surface 'system' in a muted style; it's rare but can occur in older
    // conversations (e.g. proactive nudges stored as system messages).
    const role = msg.role === 'user' ? 'student'
      : msg.role === 'assistant' ? 'tutor'
      : 'system';
    const bubble = h('div', { className: `transcript-bubble ${role}` });
    bubble.appendChild(document.createTextNode(msg.content || ''));

    const metaRow = h('div', { className: 'transcript-bubble-meta' });
    const chips = [];
    if (role === 'tutor' && msg.problemResult) chips.push(problemResultChip(msg.problemResult));
    if (msg.reaction) chips.push(reactionChip(msg.reaction));
    chips.filter(Boolean).forEach(c => metaRow.appendChild(c));
    if (msg.timestamp) {
      metaRow.appendChild(h('span', { title: new Date(msg.timestamp).toISOString() }, formatTimestamp(msg.timestamp)));
    }
    // Flag affordance — tutor turns only. The backend enforces that too, but
    // hiding the button on student turns matches the product intent: the
    // reviewer is auditing what the tutor said, not the student.
    if (role === 'tutor') {
      const already = STATE.flaggedTurns.has(idx);
      const flagBtn = h('button', {
        type: 'button',
        className: `transcript-flag-btn${already ? ' is-flagged' : ''}`,
        'data-turn-index': String(idx),
        'aria-label': already ? 'Turn flagged' : 'Flag this moment',
        title: already ? 'You already flagged this turn' : 'Flag this moment',
        disabled: already,
      }, [
        h('i', { className: `fas ${already ? 'fa-flag-checkered' : 'fa-flag'}` }),
        h('span', { className: 'transcript-flag-label' }, already ? 'Flagged' : 'Flag'),
      ]);
      metaRow.appendChild(flagBtn);
    }
    if (metaRow.childNodes.length > 0) bubble.appendChild(metaRow);
    return bubble;
  }

  function renderReasoningCell(msg, trace) {
    // Reasoning is a tutor-turn concept; no reasoning for student turns.
    if (msg.role !== 'assistant') return h('div');

    const cell = h('div', { className: 'transcript-reasoning' }, [
      h('div', { className: 'transcript-reasoning-header' }, [
        h('i', { className: 'fas fa-diagram-project' }),
        h('span', null, 'Pipeline rationale'),
      ]),
    ]);

    if (!trace || (!trace.rationale && !trace.state && !trace.action)) {
      cell.appendChild(h('div', { className: 'transcript-reasoning-placeholder' },
        'Reasoning data coming soon — this column will show the pipeline state, chosen action, and rationale once the permission architecture ships.'));
      return cell;
    }

    const rows = [
      ['State', trace.state],
      ['Action', trace.action],
      ['Pattern', trace.utterance_pattern || trace.pattern],
      ['Goal', trace.goal_link || trace.goalLink],
      ['Rationale', trace.rationale],
    ];
    rows.forEach(([label, value]) => {
      if (!value) return;
      cell.appendChild(h('div', { className: 'transcript-reasoning-row' }, [
        h('strong', null, `${label}:`),
        h('span', null, String(value)),
      ]));
    });

    return cell;
  }

  function indexReasoningByTurn(traceArray) {
    const map = new Map();
    if (!Array.isArray(traceArray)) return map;
    traceArray.forEach((t) => {
      if (typeof t?.turn === 'number') map.set(t.turn, t);
    });
    return map;
  }

  function renderPayload(payload) {
    const { student, conversation } = payload;
    renderHeader(student, conversation);

    const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    if (messages.length === 0) {
      setBody(h('div', { className: 'transcript-empty' }, 'This conversation has no messages.'));
      return;
    }

    const reasoningByTurn = indexReasoningByTurn(conversation.reasoningTrace);
    const container = h('div', { className: 'transcript-timeline' });

    // assistantTurnCounter: reasoningTrace is written once per tutor turn
    // (per spec §6), not per message, so trace[n] maps to the n-th assistant
    // message. We also tolerate trace entries keyed by absolute message index
    // via indexReasoningByTurn (whichever the pipeline ends up using).
    let assistantTurnCounter = -1;

    messages.forEach((msg, idx) => {
      if (msg.role === 'assistant') assistantTurnCounter += 1;

      const showReasoningForTurn = STATE.showReasoning && msg.role === 'assistant';
      const turnRow = h('div', {
        className: `transcript-turn${showReasoningForTurn ? ' with-reasoning' : ''}`,
        role: 'listitem',
        'data-turn-index': String(idx),
      });
      turnRow.appendChild(renderBubble(msg, idx));
      if (showReasoningForTurn) {
        const trace = reasoningByTurn.get(idx) || reasoningByTurn.get(assistantTurnCounter);
        turnRow.appendChild(renderReasoningCell(msg, trace));
      }
      container.appendChild(turnRow);
    });

    setBody(container);

    // If the caller asked us to focus a specific turn (e.g. admin opened this
    // transcript from a flag), scroll it into view and briefly highlight so
    // the reviewer's eye lands on the right place.
    if (STATE.pendingScrollTurnIndex != null) {
      const idx = STATE.pendingScrollTurnIndex;
      STATE.pendingScrollTurnIndex = null;
      // Defer to the next frame so the body has laid out before we scroll.
      requestAnimationFrame(() => {
        const target = container.querySelector(`.transcript-turn[data-turn-index="${idx}"]`);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('transcript-turn-highlight');
        setTimeout(() => target.classList.remove('transcript-turn-highlight'), 2200);
      });
    }
  }

  async function fetchTranscript(studentId, conversationId, { role } = {}) {
    // Admin users share the same viewer but hit the admin endpoint so that
    // access is logged under administrative_oversight rather than
    // teaching_instruction. role is detected from window.currentUser.role in
    // the auto-wiring path below.
    const base = role === 'admin' ? '/api/admin' : '/api/teacher';
    const url = `${base}/students/${encodeURIComponent(studentId)}/conversations/${encodeURIComponent(conversationId)}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      let body = null;
      try { body = await res.json(); } catch { /* ignore */ }
      const err = new Error(body?.message || `Request failed (${res.status})`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return res.json();
  }

  async function open(studentId, conversationId, opts = {}) {
    if (!studentId || !conversationId) {
      console.warn('[TranscriptViewer] open() requires studentId and conversationId');
      return;
    }

    openModal(opts.triggerEl || null);
    setBody(h('div', { className: 'transcript-loading' }, [
      h('i', { className: 'fas fa-spinner fa-spin' }),
      h('span', null, 'Loading transcript…'),
    ]));

    // Reset per-open state
    STATE.showReasoning = false;
    STATE.currentConversationId = conversationId;
    STATE.currentStudentId = studentId;
    STATE.flaggedTurns = new Set();
    STATE.pendingScrollTurnIndex =
      typeof opts.scrollToTurnIndex === 'number' && opts.scrollToTurnIndex >= 0
        ? opts.scrollToTurnIndex
        : null;
    const toggle = STATE.modal.querySelector('#transcript-reasoning-toggle');
    if (toggle) toggle.checked = false;

    try {
      const payload = await fetchTranscript(studentId, conversationId, { role: opts.role });
      CACHED_PAYLOAD = payload;
      renderPayload(payload);
    } catch (err) {
      console.error('[TranscriptViewer] fetch failed', err);
      const msg = err.status === 403
        ? (err.body?.message || 'You are not authorized to view this transcript.')
        : err.status === 404
        ? 'Conversation not found.'
        : 'We couldn\'t load this transcript. Please try again.';
      setBody(h('div', { className: 'transcript-error' }, msg));
    }
  }

  // Auto-delegate clicks from conversation cards. Any element with both
  // data-student-id and data-conversation-id opens the viewer. This keeps the
  // wire-up out of teacher-dashboard.js so the two files stay decoupled.
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-conversation-id][data-student-id]');
    if (!trigger) return;
    e.preventDefault();
    const role = (window.currentUser && window.currentUser.role === 'admin') ? 'admin' : 'teacher';
    open(trigger.dataset.studentId, trigger.dataset.conversationId, { role, triggerEl: trigger });
  });

  // Keyboard: allow Enter/Space on focusable conversation cards.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const trigger = e.target.closest && e.target.closest('[data-conversation-id][data-student-id]');
    if (!trigger) return;
    // Don't hijack keystrokes inside actual inputs.
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    e.preventDefault();
    trigger.click();
  });

  window.TranscriptViewer = { open, close: closeModal };
})();

;
/* --- /js/admin-transcript-flags.js --- */
/**
 * admin-transcript-flags.js
 *
 * Simple admin review list for transcript flags. Injects a button into the
 * admin dashboard header, opens a modal with the current flag backlog, and
 * lets the admin click a row to open the flagged conversation in the shared
 * transcript viewer (public/js/teacher-transcripts.js).
 *
 * Intentionally small: this is v1 triage surface. Status transitions
 * (reviewed / dismissed) are out of scope here — the model supports them,
 * the next pass wires them up.
 */
(function () {
  'use strict';

  const STATE = { modal: null, button: null, escHandler: null };

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'className') el.className = v;
        else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v);
      }
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach(c => {
        if (c == null) return;
        el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return el;
  }

  function ensureButton() {
    if (STATE.button) return STATE.button;
    // Dock the button next to the user search so it's visible without
    // fighting for layout. If the dashboard reshuffles later, the fallback
    // appends to the main-content header area.
    const searchRow = document.querySelector('#studentSearch')?.closest('div[style*="flex"]');
    const btn = h('button', {
      id: 'admin-review-flags-btn',
      type: 'button',
      className: 'btn',
      style: 'padding: 8px 14px; border-radius: 6px; border: 1px solid #e74c3c; background: #fff; color: #c0392b; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;',
      title: 'Review transcript flags',
    }, [
      h('i', { className: 'fas fa-flag' }),
      h('span', null, 'Review flags'),
      h('span', { id: 'admin-review-flags-count', style: 'display:none; background:#e74c3c; color:#fff; border-radius:999px; padding:1px 7px; font-size:0.8em; margin-left:4px;' }),
    ]);
    btn.addEventListener('click', () => openModal());

    if (searchRow) {
      searchRow.appendChild(btn);
    } else {
      const main = document.querySelector('#main-content') || document.body;
      btn.style.position = 'fixed';
      btn.style.top = '80px';
      btn.style.right = '20px';
      btn.style.zIndex = '500';
      main.appendChild(btn);
    }
    STATE.button = btn;
    return btn;
  }

  function ensureModal() {
    if (STATE.modal) return STATE.modal;

    const modal = h('div', {
      id: 'admin-flags-modal',
      className: 'modal-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'admin-flags-title',
      style: 'display: none;',
    });
    const content = h('div', {
      className: 'modal-content',
      style: 'max-width: 920px; width: calc(100vw - 40px); max-height: 85vh; padding: 0; display: flex; flex-direction: column;',
    }, [
      h('span', {
        id: 'admin-flags-close',
        className: 'modal-close-button',
        role: 'button',
        'aria-label': 'Close',
        tabindex: '0',
      }, '×'),
      h('div', { style: 'padding: 20px 24px 12px 24px; border-bottom: 1px solid #e9ecef;' }, [
        h('h2', { id: 'admin-flags-title', style: 'margin: 0 0 6px 0; color: #c0392b; font-size: 1.2em; display:flex; align-items:center; gap:8px;' }, [
          h('i', { className: 'fas fa-flag' }),
          h('span', null, 'Transcript flags'),
        ]),
        h('div', { style: 'display:flex; gap:10px; align-items:center; font-size:0.9em;' }, [
          h('label', { for: 'admin-flags-status', style: 'color:#5B6876;' }, 'Status:'),
          h('select', { id: 'admin-flags-status', style: 'padding:4px 8px; border-radius:6px; border:1px solid #ddd;' }, [
            h('option', { value: 'open', selected: 'selected' }, 'Open'),
            h('option', { value: 'reviewed' }, 'Reviewed'),
            h('option', { value: 'dismissed' }, 'Dismissed'),
            h('option', { value: 'all' }, 'All'),
          ]),
          h('button', {
            id: 'admin-flags-refresh',
            type: 'button',
            style: 'padding:4px 10px; border-radius:6px; border:1px solid #ddd; background:#fff; cursor:pointer;',
            title: 'Refresh',
          }, [h('i', { className: 'fas fa-rotate-right' })]),
        ]),
      ]),
      h('div', {
        id: 'admin-flags-body',
        style: 'flex: 1 1 auto; overflow-y: auto; padding: 0;',
      }),
    ]);
    modal.appendChild(content);
    document.body.appendChild(modal);

    const close = () => closeModal();
    content.querySelector('#admin-flags-close').addEventListener('click', close);
    content.querySelector('#admin-flags-close').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(); }
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    content.querySelector('#admin-flags-status').addEventListener('change', () => loadFlags());
    content.querySelector('#admin-flags-refresh').addEventListener('click', () => loadFlags());

    STATE.modal = modal;
    return modal;
  }

  function openModal() {
    ensureModal();
    STATE.modal.style.display = 'flex';
    STATE.modal.classList.add('is-visible');
    STATE.escHandler = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', STATE.escHandler);
    loadFlags();
  }

  function closeModal() {
    if (!STATE.modal) return;
    STATE.modal.classList.remove('is-visible');
    STATE.modal.style.display = 'none';
    if (STATE.escHandler) {
      document.removeEventListener('keydown', STATE.escHandler);
      STATE.escHandler = null;
    }
    if (STATE.button) STATE.button.focus();
  }

  function setBody(nodeOrHtml) {
    const body = STATE.modal.querySelector('#admin-flags-body');
    body.innerHTML = '';
    if (typeof nodeOrHtml === 'string') body.innerHTML = nodeOrHtml;
    else if (nodeOrHtml) body.appendChild(nodeOrHtml);
  }

  function nameOf(user) {
    if (!user) return 'Unknown';
    return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Unknown';
  }

  function snippetOf(flag) {
    const content = flag?.turnSnapshot?.content || '';
    if (content.length <= 180) return content;
    return `${content.slice(0, 177)}…`;
  }

  async function loadFlags() {
    const status = STATE.modal.querySelector('#admin-flags-status').value;
    setBody(h('div', { style: 'padding:40px 20px; text-align:center; color:#7f8c8d;' }, [
      h('i', { className: 'fas fa-spinner fa-spin' }),
      h('span', { style: 'margin-left:8px;' }, 'Loading flags…'),
    ]));
    try {
      const res = await fetch(`/api/transcript-flags?status=${encodeURIComponent(status)}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const { flags } = await res.json();
      renderFlags(flags || []);
      updateButtonCount(status === 'open' ? (flags || []).length : null);
    } catch (err) {
      console.error('[AdminFlags] load failed', err);
      setBody(h('div', { style: 'padding:24px; color:#c0392b; text-align:center;' }, 'Could not load flags.'));
    }
  }

  function updateButtonCount(count) {
    const span = document.querySelector('#admin-review-flags-count');
    if (!span) return;
    if (count == null || count === 0) {
      span.style.display = 'none';
      span.textContent = '';
    } else {
      span.style.display = 'inline-block';
      span.textContent = String(count);
    }
  }

  function actionButton({ label, icon, color, onClick, title }) {
    const btn = h('button', {
      type: 'button',
      title: title || label,
      'aria-label': title || label,
      style: `padding:4px 8px; border-radius:6px; border:1px solid ${color}; background:#fff; color:${color}; cursor:pointer; font-size:0.85em; display:inline-flex; align-items:center; gap:4px;`,
    }, [h('i', { className: `fas ${icon}` }), h('span', null, label)]);
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // don't trigger the row click
      onClick(btn);
    });
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); });
    return btn;
  }

  async function updateFlagStatus(flagId, newStatus, rowEl) {
    const allButtons = rowEl.querySelectorAll('button');
    allButtons.forEach(b => { b.disabled = true; b.style.opacity = '0.6'; });
    try {
      const res = await fetch(`/api/transcript-flags/${encodeURIComponent(flagId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        let body = null;
        try { body = await res.json(); } catch { /* ignore */ }
        throw new Error(body?.message || `Status update failed (${res.status})`);
      }
      // If the active filter no longer matches, fade+remove the row. Otherwise
      // update the status badge inline.
      const activeStatus = STATE.modal.querySelector('#admin-flags-status').value;
      if (activeStatus !== 'all' && activeStatus !== newStatus) {
        rowEl.style.transition = 'opacity 0.25s ease';
        rowEl.style.opacity = '0';
        setTimeout(() => {
          rowEl.remove();
          // If no rows left, re-render empty state + refresh the badge count.
          const tbody = STATE.modal.querySelector('#admin-flags-body tbody');
          if (tbody && tbody.children.length === 0) loadFlags();
          else pollOpenCount();
        }, 260);
      } else {
        const badge = rowEl.querySelector('.admin-flag-status-badge');
        if (badge) badge.textContent = newStatus;
        pollOpenCount();
      }
    } catch (err) {
      console.error('[AdminFlags] status update failed', err);
      window.alert(err.message || 'Could not update this flag.');
      allButtons.forEach(b => { b.disabled = false; b.style.opacity = ''; });
    }
  }

  function statusBadgeColor(status) {
    if (status === 'reviewed') return '#16a085';
    if (status === 'dismissed') return '#7f8c8d';
    return '#e74c3c';
  }

  function renderFlags(flags) {
    if (!flags.length) {
      setBody(h('div', { style: 'padding:40px 20px; text-align:center; color:#95a5a6; font-style:italic;' }, 'No flags in this view.'));
      return;
    }

    const table = h('table', { style: 'width:100%; border-collapse:collapse; font-size:0.9em;' });
    table.appendChild(h('thead', null,
      h('tr', { style: 'background:#f8f9fa; color:#2c3e50;' }, [
        h('th', { style: 'text-align:left; padding:10px 12px; border-bottom:1px solid #e9ecef;' }, 'Flagged'),
        h('th', { style: 'text-align:left; padding:10px 12px; border-bottom:1px solid #e9ecef;' }, 'Student'),
        h('th', { style: 'text-align:left; padding:10px 12px; border-bottom:1px solid #e9ecef;' }, 'Turn excerpt'),
        h('th', { style: 'text-align:left; padding:10px 12px; border-bottom:1px solid #e9ecef;' }, 'Reason'),
        h('th', { style: 'text-align:left; padding:10px 12px; border-bottom:1px solid #e9ecef;' }, 'Flagged by'),
        h('th', { style: 'text-align:left; padding:10px 12px; border-bottom:1px solid #e9ecef;' }, 'Status'),
        h('th', { style: 'text-align:left; padding:10px 12px; border-bottom:1px solid #e9ecef;' }, 'Actions'),
      ])
    ));
    const tbody = h('tbody');
    flags.forEach((f) => {
      const row = h('tr', {
        style: 'cursor:pointer; transition:background 0.12s ease;',
        tabindex: '0',
        'data-student-id': (f.studentId && f.studentId._id) || f.studentId || '',
        'data-conversation-id': f.conversationId || '',
        'data-turn-index': String(f.turnIndex != null ? f.turnIndex : ''),
        'data-flag-id': f._id || '',
        title: 'Open transcript',
      });
      row.addEventListener('mouseenter', () => { row.style.background = '#f5faf7'; });
      row.addEventListener('mouseleave', () => { row.style.background = ''; });
      const open = () => {
        if (window.TranscriptViewer && typeof window.TranscriptViewer.open === 'function') {
          const turnIdx = Number(row.dataset.turnIndex);
          window.TranscriptViewer.open(row.dataset.studentId, row.dataset.conversationId, {
            role: 'admin',
            triggerEl: row,
            scrollToTurnIndex: Number.isFinite(turnIdx) ? turnIdx : undefined,
          });
        }
      };
      row.addEventListener('click', open);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });

      const createdAt = f.createdAt ? new Date(f.createdAt).toLocaleString() : '';
      row.appendChild(h('td', { style: 'padding:10px 12px; border-bottom:1px solid #f1f1f1; white-space:nowrap; color:#5B6876;' }, createdAt));
      row.appendChild(h('td', { style: 'padding:10px 12px; border-bottom:1px solid #f1f1f1;' }, nameOf(f.studentId)));
      row.appendChild(h('td', { style: 'padding:10px 12px; border-bottom:1px solid #f1f1f1; color:#2c3e50;' }, snippetOf(f) || '—'));
      row.appendChild(h('td', { style: 'padding:10px 12px; border-bottom:1px solid #f1f1f1; color:#5B6876; font-style: italic;' }, f.reason || '—'));
      row.appendChild(h('td', { style: 'padding:10px 12px; border-bottom:1px solid #f1f1f1; color:#5B6876;' },
        `${nameOf(f.flaggedBy)} (${f.flaggedByRole || '?'})`));
      row.appendChild(h('td', { style: 'padding:10px 12px; border-bottom:1px solid #f1f1f1;' }, [
        h('span', {
          className: 'admin-flag-status-badge',
          style: `display:inline-block; padding:2px 8px; border-radius:999px; font-size:0.8em; font-weight:600; color:#fff; background:${statusBadgeColor(f.status)};`,
        }, f.status || 'open'),
      ]));

      // Actions per status. 'open' can be reviewed or dismissed; the resolved
      // states can be reopened. Keeps the triage surface reversible.
      const actions = h('td', { style: 'padding:10px 12px; border-bottom:1px solid #f1f1f1; white-space:nowrap;' });
      const addAction = (cfg) => actions.appendChild(actionButton(cfg));
      const currentStatus = f.status || 'open';
      if (currentStatus === 'open') {
        addAction({
          label: 'Reviewed', icon: 'fa-check', color: '#16a085',
          title: 'Mark this flag as reviewed',
          onClick: () => updateFlagStatus(f._id, 'reviewed', row),
        });
        addAction({
          label: 'Dismiss', icon: 'fa-xmark', color: '#7f8c8d',
          title: 'Dismiss this flag without action',
          onClick: () => updateFlagStatus(f._id, 'dismissed', row),
        });
      } else {
        addAction({
          label: 'Reopen', icon: 'fa-rotate-left', color: '#e74c3c',
          title: 'Move this flag back to open',
          onClick: () => updateFlagStatus(f._id, 'open', row),
        });
      }
      // Inline gap between buttons.
      actions.querySelectorAll('button').forEach((b, i) => { if (i > 0) b.style.marginLeft = '6px'; });
      row.appendChild(actions);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    setBody(table);
  }

  async function pollOpenCount() {
    try {
      const res = await fetch('/api/transcript-flags?status=open&limit=500', { credentials: 'include' });
      if (!res.ok) return;
      const { flags } = await res.json();
      updateButtonCount((flags || []).length);
    } catch { /* ignore */ }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Only run on the admin dashboard. The auth check in admin-dashboard.js
    // redirects non-admins away before this runs, but guard just in case the
    // script loads elsewhere.
    if (!document.getElementById('main-content')) return;
    ensureButton();
    // Background poll so the badge reflects open count without opening the modal.
    pollOpenCount();
  });

  window.AdminTranscriptFlags = { open: openModal, close: closeModal, refresh: loadFlags };
})();

;
/* --- /js/admin-bulk-email.js --- */
/**
 * Admin Bulk Email - Campaign Management UI
 * Handles bulk email sending to students, parents, teachers, classes, or custom selections
 */

document.addEventListener('DOMContentLoaded', () => {
    // Modal elements
    const bulkEmailModal = document.getElementById('bulkEmailModal');
    const emailHistoryModal = document.getElementById('emailHistoryModal');

    // Buttons
    const openBulkEmailBtn = document.getElementById('openBulkEmailBtn');
    const viewEmailCampaignsBtn = document.getElementById('viewEmailCampaignsBtn');
    const closeBulkEmailModal = document.getElementById('closeBulkEmailModal');
    const closeEmailHistoryModal = document.getElementById('closeEmailHistoryModal');
    const previewEmailBtn = document.getElementById('previewEmailBtn');
    const sendBulkEmailBtn = document.getElementById('sendBulkEmailBtn');

    // Form elements
    const audienceTypeSelect = document.getElementById('emailAudienceType');
    const classSelectContainer = document.getElementById('classSelectContainer');
    const classSelect = document.getElementById('emailClassSelect');
    const customSelectContainer = document.getElementById('customSelectContainer');
    const userSearchInput = document.getElementById('userSearchInput');
    const userRoleFilter = document.getElementById('emailUserRoleFilter');
    const searchUsersBtn = document.getElementById('searchUsersBtn');
    const userSearchResults = document.getElementById('userSearchResults');
    const selectedUsersContainer = document.getElementById('selectedUsersContainer');
    const selectedUsersList = document.getElementById('selectedUsersList');
    const selectedUsersCountEl = document.getElementById('selectedUsersCount');
    const recipientPreview = document.getElementById('recipientPreview');
    const recipientCount = document.getElementById('recipientCount');
    const emailSubject = document.getElementById('emailSubject');
    const emailTemplate = document.getElementById('emailTemplate');
    const emailBody = document.getElementById('emailBody');
    const emailCategory = document.getElementById('emailCategory');
    const emailPriority = document.getElementById('emailPriority');
    const emailSendStatus = document.getElementById('emailSendStatus');

    // Stats elements
    const emailsSentToday = document.getElementById('emailsSentToday');
    const totalCampaigns = document.getElementById('totalCampaigns');

    // Campaign list
    const emailCampaignsList = document.getElementById('emailCampaignsList');

    let audienceData = null;
    let templates = [];
    let selectedUsers = new Map(); // userId -> user object

    // Initialize
    loadEmailStats();

    // Modal open handlers
    if (openBulkEmailBtn) {
        openBulkEmailBtn.addEventListener('click', () => {
            openModal(bulkEmailModal);
            loadAudienceData();
            loadTemplates();
            resetCustomSelection();
        });
    }

    if (viewEmailCampaignsBtn) {
        viewEmailCampaignsBtn.addEventListener('click', () => {
            openModal(emailHistoryModal);
            loadCampaignHistory();
        });
    }

    // Modal close handlers
    if (closeBulkEmailModal) {
        closeBulkEmailModal.addEventListener('click', () => closeModal(bulkEmailModal));
    }
    if (closeEmailHistoryModal) {
        closeEmailHistoryModal.addEventListener('click', () => closeModal(emailHistoryModal));
    }

    // Close on overlay click
    [bulkEmailModal, emailHistoryModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal(modal);
            });
        }
    });

    // Audience type change handler
    if (audienceTypeSelect) {
        audienceTypeSelect.addEventListener('change', async (e) => {
            const type = e.target.value;

            // Show/hide appropriate containers
            classSelectContainer.style.display = type === 'class' ? 'block' : 'none';
            customSelectContainer.style.display = type === 'custom' ? 'block' : 'none';

            if (type === 'class') {
                await loadClasses();
            }

            // Update recipient preview
            updateRecipientPreview(type);

            // Enable/disable send button
            validateForm();
        });
    }

    // Class select change handler
    if (classSelect) {
        classSelect.addEventListener('change', () => {
            updateRecipientPreview('class');
            validateForm();
        });
    }

    // Custom user search
    if (searchUsersBtn) {
        searchUsersBtn.addEventListener('click', searchUsers);
    }
    if (userSearchInput) {
        userSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchUsers();
            }
        });
    }

    // Form validation on input
    [emailSubject, emailBody].forEach(el => {
        if (el) {
            el.addEventListener('input', validateForm);
        }
    });

    // Template change handler
    if (emailTemplate) {
        emailTemplate.addEventListener('change', () => {
            const templateId = emailTemplate.value;
            if (templateId && templates.length > 0) {
                const template = templates.find(t => t.id === templateId);
                if (template) {
                    emailSubject.value = template.subject;
                    emailBody.value = template.body;
                    validateForm();
                }
            }
        });
    }

    // Preview button
    if (previewEmailBtn) {
        previewEmailBtn.addEventListener('click', previewEmail);
    }

    // Send button
    if (sendBulkEmailBtn) {
        sendBulkEmailBtn.addEventListener('click', sendBulkEmail);
    }

    // Load audience data
    async function loadAudienceData() {
        try {
            const response = await fetch('/api/admin/email/audiences');
            if (!response.ok) throw new Error('Failed to load audiences');

            audienceData = await response.json();

            // Update audience options with counts
            if (audienceTypeSelect) {
                const audiences = audienceData.audiences;
                audienceTypeSelect.innerHTML = `
                    <option value="">Select audience...</option>
                    <option value="all_students">All Students (${audiences.all_students.count})</option>
                    <option value="all_parents">All Parents (${audiences.all_parents.count})</option>
                    <option value="all_teachers">All Teachers (${audiences.all_teachers.count})</option>
                    <option value="class">Specific Class</option>
                    <option value="custom">Select Individual Users...</option>
                `;
            }
        } catch (error) {
            console.error('[BulkEmail] Error loading audiences:', error);
        }
    }

    // Load classes for class select
    async function loadClasses() {
        if (!audienceData || !audienceData.classes) return;

        classSelect.innerHTML = `
            <option value="">Select class...</option>
            ${audienceData.classes.map(c => `
                <option value="${c._id}">${c.className || c.code} - ${c.teacherName} (${c.studentCount} students)</option>
            `).join('')}
        `;
    }

    // Load email templates
    async function loadTemplates() {
        try {
            const response = await fetch('/api/admin/email/templates');
            if (!response.ok) return;

            const data = await response.json();
            templates = data.templates || [];

            if (emailTemplate) {
                emailTemplate.innerHTML = `
                    <option value="">Start from scratch...</option>
                    ${templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                `;
            }
        } catch (error) {
            console.error('[BulkEmail] Error loading templates:', error);
        }
    }

    // Search users for custom selection
    async function searchUsers() {
        const search = userSearchInput?.value?.trim();
        const role = userRoleFilter?.value;

        if (!search && !role) {
            userSearchResults.innerHTML = '<p style="padding: 15px; color: #666; text-align: center; margin: 0;">Enter a search term or select a role</p>';
            return;
        }

        userSearchResults.innerHTML = '<p style="padding: 15px; text-align: center; margin: 0;"><i class="fas fa-spinner fa-spin"></i></p>';

        try {
            const params = new URLSearchParams();
            if (search) params.append('search', search);
            if (role) params.append('role', role);
            params.append('limit', '50');

            const response = await fetch(`/api/admin/email/users?${params}`);
            if (!response.ok) throw new Error('Search failed');

            const data = await response.json();
            const users = data.users || [];

            if (users.length === 0) {
                userSearchResults.innerHTML = '<p style="padding: 15px; color: #666; text-align: center; margin: 0;">No users found</p>';
                return;
            }

            userSearchResults.innerHTML = users.map(user => {
                const isSelected = selectedUsers.has(user._id);
                const roleColors = {
                    student: '#667eea',
                    parent: '#27ae60',
                    teacher: '#e67e22'
                };
                return `
                    <div class="user-search-item" data-user-id="${user._id}"
                         style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center; ${isSelected ? 'background: #e8f5e9;' : ''}"
                         data-user='${JSON.stringify(user).replace(/'/g, "&#39;")}'>
                        <div>
                            <span style="font-weight: 500;">${escapeHtml(user.firstName)} ${escapeHtml(user.lastName)}</span>
                            <span style="color: #999; font-size: 0.85em; margin-left: 8px;">${escapeHtml(user.email)}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="background: ${roleColors[user.role] || '#999'}20; color: ${roleColors[user.role] || '#999'}; padding: 2px 8px; border-radius: 4px; font-size: 11px; text-transform: uppercase;">${user.role}</span>
                            ${isSelected
                                ? '<i class="fas fa-check-circle" style="color: #27ae60;"></i>'
                                : '<i class="fas fa-plus-circle" style="color: #999;"></i>'}
                        </div>
                    </div>
                `;
            }).join('');

            // Add click handlers to search results
            userSearchResults.querySelectorAll('.user-search-item').forEach(item => {
                item.addEventListener('click', () => {
                    const userId = item.dataset.userId;
                    const userData = JSON.parse(item.dataset.user);

                    if (selectedUsers.has(userId)) {
                        selectedUsers.delete(userId);
                        item.style.background = '';
                        item.querySelector('.fa-check-circle')?.classList.replace('fa-check-circle', 'fa-plus-circle');
                        item.querySelector('.fa-plus-circle').style.color = '#999';
                    } else {
                        selectedUsers.set(userId, userData);
                        item.style.background = '#e8f5e9';
                        item.querySelector('.fa-plus-circle')?.classList.replace('fa-plus-circle', 'fa-check-circle');
                        item.querySelector('.fa-check-circle').style.color = '#27ae60';
                    }

                    updateSelectedUsersDisplay();
                    validateForm();
                });
            });

        } catch (error) {
            console.error('[BulkEmail] Search error:', error);
            userSearchResults.innerHTML = '<p style="color: #e74c3c; padding: 15px; text-align: center; margin: 0;">Error searching users</p>';
        }
    }

    // Update selected users display
    function updateSelectedUsersDisplay() {
        const count = selectedUsers.size;
        selectedUsersCountEl.textContent = count;

        if (count > 0) {
            selectedUsersContainer.style.display = 'block';
            selectedUsersList.innerHTML = Array.from(selectedUsers.values()).map(user => `
                <span class="selected-user-tag" data-user-id="${user._id}"
                      style="display: inline-flex; align-items: center; gap: 6px; background: #e8f5e9; color: #2e7d32; padding: 4px 10px; border-radius: 16px; font-size: 12px;">
                    ${escapeHtml(user.firstName)} ${escapeHtml(user.lastName)}
                    <i class="fas fa-times" style="cursor: pointer; opacity: 0.7;"></i>
                </span>
            `).join('');

            // Add remove handlers
            selectedUsersList.querySelectorAll('.selected-user-tag').forEach(tag => {
                tag.querySelector('.fa-times').addEventListener('click', (e) => {
                    e.stopPropagation();
                    const userId = tag.dataset.userId;
                    selectedUsers.delete(userId);
                    updateSelectedUsersDisplay();
                    validateForm();

                    // Update search results if visible
                    const searchItem = userSearchResults.querySelector(`[data-user-id="${userId}"]`);
                    if (searchItem) {
                        searchItem.style.background = '';
                        searchItem.querySelector('.fa-check-circle')?.classList.replace('fa-check-circle', 'fa-plus-circle');
                    }
                });
            });
        } else {
            selectedUsersContainer.style.display = 'none';
        }

        // Update recipient preview for custom
        if (audienceTypeSelect?.value === 'custom') {
            updateRecipientPreview('custom');
        }
    }

    // Reset custom selection
    function resetCustomSelection() {
        selectedUsers.clear();
        if (userSearchInput) userSearchInput.value = '';
        if (userRoleFilter) userRoleFilter.value = '';
        if (userSearchResults) {
            userSearchResults.innerHTML = '<p style="padding: 15px; color: #666; text-align: center; margin: 0;">Search for users above</p>';
        }
        if (selectedUsersContainer) selectedUsersContainer.style.display = 'none';
        if (selectedUsersList) selectedUsersList.innerHTML = '';
    }

    // Update recipient preview
    async function updateRecipientPreview(audienceType) {
        if (!audienceType) {
            recipientPreview.style.display = 'none';
            return;
        }

        let count = 0;

        if (audienceType === 'class') {
            const classId = classSelect.value;
            if (!classId) {
                recipientPreview.style.display = 'none';
                return;
            }
            const selectedClass = audienceData?.classes?.find(c => c._id === classId);
            count = selectedClass?.studentCount || 0;
        } else if (audienceType === 'custom') {
            count = selectedUsers.size;
            if (count === 0) {
                recipientPreview.style.display = 'none';
                return;
            }
        } else if (audienceData?.audiences?.[audienceType]) {
            count = audienceData.audiences[audienceType].count;
        }

        recipientCount.textContent = count;
        recipientPreview.style.display = 'block';
    }

    // Validate form
    function validateForm() {
        const audienceType = audienceTypeSelect?.value;
        const subject = emailSubject?.value?.trim();
        const body = emailBody?.value?.trim();

        let valid = audienceType && subject && body;

        if (audienceType === 'class' && !classSelect?.value) {
            valid = false;
        }

        if (audienceType === 'custom' && selectedUsers.size === 0) {
            valid = false;
        }

        if (sendBulkEmailBtn) {
            sendBulkEmailBtn.disabled = !valid;
        }

        return valid;
    }

    // Preview email
    function previewEmail() {
        const subject = emailSubject?.value || 'No subject';
        const body = emailBody?.value || 'No content';

        // Create preview modal
        const preview = document.createElement('div');
        preview.className = 'modal-overlay';
        preview.style.cssText = 'display: flex; justify-content: center; align-items: center; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 100000;';
        preview.innerHTML = `
            <div style="background: white; border-radius: 12px; max-width: 600px; width: 90%; max-height: 80vh; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.3);">
                <div style="padding: 20px; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0;"><i class="fas fa-eye"></i> Email Preview</h3>
                    <button class="close-preview" style="background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
                </div>
                <div style="padding: 20px; background: #f8f9fa;">
                    <div style="background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
                        <div style="background: linear-gradient(135deg, #e74c3c, #e67e22); color: white; padding: 20px; text-align: center;">
                            <h2 style="margin: 0;">MATHMATIX AI</h2>
                        </div>
                        <div style="padding: 20px;">
                            <h3 style="margin: 0 0 15px 0; color: #333;">${escapeHtml(subject)}</h3>
                            <div style="color: #555; line-height: 1.6;">${body}</div>
                        </div>
                        <div style="padding: 15px 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #999; text-align: center;">
                            This email was sent by MATHMATIX AI administration.
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(preview);

        preview.querySelector('.close-preview').addEventListener('click', () => preview.remove());
        preview.addEventListener('click', (e) => {
            if (e.target === preview) preview.remove();
        });
    }

    // Send bulk email
    async function sendBulkEmail() {
        if (!validateForm()) return;

        const audienceType = audienceTypeSelect.value;
        const enrollmentCodeId = audienceType === 'class' ? classSelect.value : null;
        const customRecipientIds = audienceType === 'custom' ? Array.from(selectedUsers.keys()) : null;

        sendBulkEmailBtn.disabled = true;
        sendBulkEmailBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
        showStatus('Preparing to send emails...', 'info');

        try {
            const response = await csrfFetch('/api/admin/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    audienceType,
                    enrollmentCodeId,
                    customRecipientIds,
                    subject: emailSubject.value.trim(),
                    body: emailBody.value.trim(),
                    isHtml: true,
                    category: emailCategory?.value || 'announcement',
                    priority: emailPriority?.value || 'normal'
                })
            });

            const data = await response.json();

            if (data.success) {
                showStatus(`Email campaign started! Sending to recipients...`, 'success');

                // Reset form
                setTimeout(() => {
                    audienceTypeSelect.value = '';
                    classSelectContainer.style.display = 'none';
                    customSelectContainer.style.display = 'none';
                    recipientPreview.style.display = 'none';
                    emailSubject.value = '';
                    emailBody.value = '';
                    emailTemplate.value = '';
                    resetCustomSelection();
                    closeModal(bulkEmailModal);
                    loadEmailStats();
                }, 2000);
            } else {
                showStatus(data.message || 'Failed to send email campaign', 'error');
            }
        } catch (error) {
            console.error('[BulkEmail] Send error:', error);
            showStatus('Error sending email campaign', 'error');
        } finally {
            sendBulkEmailBtn.disabled = false;
            sendBulkEmailBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Email';
        }
    }

    // Load campaign history
    async function loadCampaignHistory() {
        if (!emailCampaignsList) return;

        emailCampaignsList.innerHTML = '<p style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Loading campaigns...</p>';

        try {
            const response = await fetch('/api/admin/email/campaigns');
            if (!response.ok) throw new Error('Failed to load campaigns');

            const data = await response.json();
            const campaigns = data.campaigns || [];

            if (campaigns.length === 0) {
                emailCampaignsList.innerHTML = `
                    <div style="text-align: center; padding: 60px; color: #666;">
                        <i class="fas fa-envelope" style="font-size: 48px; color: #ddd; margin-bottom: 15px;"></i>
                        <p>No email campaigns yet</p>
                    </div>
                `;
                return;
            }

            emailCampaignsList.innerHTML = campaigns.map(c => {
                const date = new Date(c.createdAt).toLocaleString();
                const statusColors = {
                    draft: '#999',
                    scheduled: '#3498db',
                    sending: '#f39c12',
                    sent: '#27ae60',
                    failed: '#e74c3c',
                    cancelled: '#999'
                };

                const audienceLabels = {
                    all_students: 'All Students',
                    all_parents: 'All Parents',
                    all_teachers: 'All Teachers',
                    class: 'Specific Class',
                    custom: 'Custom Selection'
                };

                return `
                    <div style="background: white; border-radius: 8px; padding: 16px; margin-bottom: 12px; border-left: 4px solid ${statusColors[c.status] || '#ddd'}; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                            <div>
                                <strong style="font-size: 1.1em; color: #333;">${escapeHtml(c.subject)}</strong>
                                <span style="display: inline-block; margin-left: 10px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; background: ${statusColors[c.status]}20; color: ${statusColors[c.status]};">
                                    ${c.status}
                                </span>
                            </div>
                            <span style="font-size: 0.8em; color: #999;">${date}</span>
                        </div>
                        <div style="display: flex; gap: 20px; font-size: 0.9em; color: #666;">
                            <span><i class="fas fa-users"></i> ${audienceLabels[c.audienceType] || c.audienceType}</span>
                            <span><i class="fas fa-paper-plane"></i> ${c.stats?.sent || 0} sent</span>
                            <span><i class="fas fa-times-circle"></i> ${c.stats?.failed || 0} failed</span>
                            <span><i class="fas fa-user"></i> ${c.sender}</span>
                        </div>
                    </div>
                `;
            }).join('');

        } catch (error) {
            console.error('[BulkEmail] Load history error:', error);
            emailCampaignsList.innerHTML = '<p style="color: #e74c3c; text-align: center;">Error loading campaign history</p>';
        }
    }

    // Load email stats
    async function loadEmailStats() {
        try {
            const response = await fetch('/api/admin/email/campaigns?limit=100');
            if (!response.ok) return;

            const data = await response.json();
            const campaigns = data.campaigns || [];

            // Count today's emails
            const today = new Date().toDateString();
            const todayEmails = campaigns.filter(c => {
                const campaignDate = new Date(c.createdAt).toDateString();
                return campaignDate === today && c.status === 'sent';
            }).reduce((sum, c) => sum + (c.stats?.sent || 0), 0);

            if (emailsSentToday) emailsSentToday.textContent = todayEmails;
            if (totalCampaigns) totalCampaigns.textContent = campaigns.length;

        } catch (error) {
            console.error('[BulkEmail] Stats error:', error);
        }
    }

    // Show status message
    function showStatus(message, type) {
        if (!emailSendStatus) return;

        emailSendStatus.style.display = 'block';
        emailSendStatus.style.padding = '12px';
        emailSendStatus.style.borderRadius = '6px';
        emailSendStatus.style.textAlign = 'center';

        if (type === 'success') {
            emailSendStatus.style.background = '#d4edda';
            emailSendStatus.style.color = '#155724';
            emailSendStatus.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
        } else if (type === 'error') {
            emailSendStatus.style.background = '#f8d7da';
            emailSendStatus.style.color = '#721c24';
            emailSendStatus.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
        } else {
            emailSendStatus.style.background = '#fff3cd';
            emailSendStatus.style.color = '#856404';
            emailSendStatus.innerHTML = `<i class="fas fa-info-circle"></i> ${message}`;
        }
    }

    // Helper functions
    function openModal(modal) {
        if (modal) modal.classList.add('is-visible');
    }

    function closeModal(modal) {
        if (modal) modal.classList.remove('is-visible');
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }
});

;
/* --- /js/admin-manage-classes.js --- */
/**
 * Admin Manage Classes - Add/Remove students from classes
 */

document.addEventListener('DOMContentLoaded', () => {
    const manageClassesModal = document.getElementById('manageClassesModal');
    const openManageClassesBtn = document.getElementById('openManageClassesBtn');
    const closeManageClassesModal = document.getElementById('closeManageClassesModal');

    const classListContainer = document.getElementById('classListContainer');
    const noClassSelected = document.getElementById('noClassSelected');
    const classStudentManagement = document.getElementById('classStudentManagement');
    const selectedClassName = document.getElementById('selectedClassName');
    const selectedClassCode = document.getElementById('selectedClassCode');
    const classStudentCount = document.getElementById('classStudentCount');
    const classStudentsList = document.getElementById('classStudentsList');

    const addStudentSearch = document.getElementById('addStudentSearch');
    const availableStudentsList = document.getElementById('availableStudentsList');
    const addSelectedStudentsBtn = document.getElementById('addSelectedStudentsBtn');
    const selectedStudentCountEl = document.getElementById('selectedStudentCount');

    let currentClassId = null;
    let currentClassStudents = new Set();
    let allStudents = []; // Students loaded from API (capped — see allStudentsTruncated)
    let allStudentsTruncated = false; // True when the directory is larger than the lookup cap
    let selectedStudentIds = new Set(); // Students checked for adding

    // Open modal
    if (openManageClassesBtn) {
        openManageClassesBtn.addEventListener('click', () => {
            manageClassesModal.classList.add('is-visible');
            loadClasses();
            loadAllStudents();
            resetClassSelection();
        });
    }

    // Close modal
    if (closeManageClassesModal) {
        closeManageClassesModal.addEventListener('click', () => {
            manageClassesModal.classList.remove('is-visible');
        });
    }

    if (manageClassesModal) {
        manageClassesModal.addEventListener('click', (e) => {
            if (e.target === manageClassesModal) {
                manageClassesModal.classList.remove('is-visible');
            }
        });
    }

    // Filter students as user types (client-side)
    if (addStudentSearch) {
        addStudentSearch.addEventListener('input', renderAvailableStudents);
    }

    // Add selected students button
    if (addSelectedStudentsBtn) {
        addSelectedStudentsBtn.addEventListener('click', addSelectedStudentsToClass);
    }

    // Load students for the roster picker (once on modal open).
    //
    // Role matching moved to the server: this filtered on `u.role === 'student'`,
    // the role a user is CURRENTLY VIEWING, so a student who also holds another
    // role and happened to be on that dashboard was missing from the picker with
    // no error — the roles-vs-role trap in CLAUDE.md §12. /users/lookup?role=
    // matches roles HELD via anyRole().
    async function loadAllStudents() {
        try {
            const response = await fetch('/api/admin/users/lookup?role=student', { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to load users');

            const data = await response.json();
            allStudents = data.users || [];
            allStudentsTruncated = Boolean(data.truncated);
        } catch (error) {
            console.error('[ManageClasses] Load all students error:', error);
            allStudents = [];
            allStudentsTruncated = false;
        }
    }

    // Load all classes
    async function loadClasses() {
        classListContainer.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i></p>';

        try {
            const response = await fetch('/api/admin/enrollment-codes');
            if (!response.ok) throw new Error('Failed to load classes');

            const classes = await response.json();

            if (classes.length === 0) {
                classListContainer.innerHTML = `
                    <div style="text-align: center; padding: 30px; color: #666;">
                        <p>No classes yet</p>
                        <p style="font-size: 0.85em;">Use "Create Class Code" to create one</p>
                    </div>
                `;
                return;
            }

            classListContainer.innerHTML = classes.map(c => `
                <div class="class-list-item" data-class-id="${c._id}"
                     style="padding: 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; transition: background 0.2s;">
                    <div style="font-weight: 500; color: #333;">${escapeHtml(c.className || 'Unnamed Class')}</div>
                    <div style="font-size: 0.85em; color: #999; margin-top: 4px;">
                        <span style="font-family: monospace; background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">${escapeHtml(c.code)}</span>
                        <span style="margin-left: 10px;"><i class="fas fa-users"></i> ${c.enrolledStudents?.length || 0}</span>
                    </div>
                    <div style="font-size: 0.8em; color: #666; margin-top: 4px;">
                        Teacher: ${c.teacherId?.firstName || 'Unknown'} ${c.teacherId?.lastName || ''}
                    </div>
                </div>
            `).join('');

            // Add click handlers
            classListContainer.querySelectorAll('.class-list-item').forEach(item => {
                item.addEventListener('click', () => {
                    classListContainer.querySelectorAll('.class-list-item').forEach(i => {
                        i.style.background = '';
                        i.style.borderLeft = '';
                    });
                    item.style.background = '#e8f4f8';
                    item.style.borderLeft = '3px solid #e74c3c';
                    selectClass(item.dataset.classId);
                });

                item.addEventListener('mouseenter', () => {
                    if (item.dataset.classId !== currentClassId) {
                        item.style.background = '#f5f5f5';
                    }
                });

                item.addEventListener('mouseleave', () => {
                    if (item.dataset.classId !== currentClassId) {
                        item.style.background = '';
                    }
                });
            });

        } catch (error) {
            console.error('[ManageClasses] Load error:', error);
            classListContainer.innerHTML = '<p style="color: #e74c3c; text-align: center; padding: 20px;">Error loading classes</p>';
        }
    }

    // Select a class
    async function selectClass(classId) {
        currentClassId = classId;
        noClassSelected.style.display = 'none';
        classStudentManagement.style.display = 'block';

        // Reset search and selections
        addStudentSearch.value = '';
        selectedStudentIds.clear();
        updateAddSelectedButton();

        await loadClassStudents(classId);
        renderAvailableStudents();
    }

    // Load students in selected class
    async function loadClassStudents(classId) {
        classStudentsList.innerHTML = '<p style="padding: 20px; color: #666; text-align: center; margin: 0;"><i class="fas fa-spinner fa-spin"></i></p>';

        try {
            const response = await fetch(`/api/admin/enrollment-codes/${classId}/students`);
            if (!response.ok) throw new Error('Failed to load students');

            const data = await response.json();

            selectedClassName.textContent = data.className || 'Unnamed Class';
            selectedClassCode.textContent = data.code;
            classStudentCount.textContent = data.totalEnrolled;

            // Track current students for filtering available list
            currentClassStudents = new Set(data.students.map(s => s._id));

            if (data.students.length === 0) {
                classStudentsList.innerHTML = `
                    <div style="padding: 30px; text-align: center; color: #666;">
                        <p>No students in this class</p>
                        <p style="font-size: 0.85em;">Select students above to add them</p>
                    </div>
                `;
                return;
            }

            classStudentsList.innerHTML = data.students.map(student => `
                <div class="class-student-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid #f0f0f0;">
                    <div>
                        <span style="font-weight: 500;">${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</span>
                        <span style="color: #999; font-size: 0.85em; margin-left: 8px;">${escapeHtml(student.email || student.username)}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 0.75em; color: #666;">${student.enrollmentMethod || 'unknown'}</span>
                        <button class="remove-student-btn" data-student-id="${student._id}"
                                style="background: #fee; color: #e74c3c; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;"
                                title="Remove from class">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `).join('');

            // Add remove handlers
            classStudentsList.querySelectorAll('.remove-student-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (confirm('Remove this student from the class?')) {
                        await removeStudentFromClass(btn.dataset.studentId);
                    }
                });
            });

        } catch (error) {
            console.error('[ManageClasses] Load students error:', error);
            classStudentsList.innerHTML = '<p style="color: #e74c3c; padding: 20px; text-align: center; margin: 0;">Error loading students</p>';
        }
    }

    // Render available students list (filtered, with checkboxes)
    function renderAvailableStudents() {
        if (!currentClassId) {
            availableStudentsList.innerHTML = '<p style="padding: 10px; color: #666; text-align: center; margin: 0;">Select a class to see available students</p>';
            return;
        }

        const query = (addStudentSearch.value || '').toLowerCase().trim();

        // Filter: exclude students already in class, then apply search
        let available = allStudents.filter(s => !currentClassStudents.has(s._id));

        if (query) {
            available = available.filter(s =>
                `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase().includes(query) ||
                (s.email || '').toLowerCase().includes(query) ||
                (s.username || '').toLowerCase().includes(query)
            );
        }

        if (available.length === 0) {
            availableStudentsList.innerHTML = query
                ? '<p style="padding: 10px; color: #666; text-align: center; margin: 0;">No matching students found</p>'
                : '<p style="padding: 10px; color: #666; text-align: center; margin: 0;">All students are already in this class</p>';
            return;
        }

        // Say so when the list is capped, rather than letting an admin read a
        // partial roster as "this student doesn't exist".
        const truncationNote = allStudentsTruncated
            ? '<p style="padding: 8px 10px; color: #8a6d3b; background: #fcf8e3; font-size: 0.85em; margin: 0;">Showing the first 500 students. Narrow the search to find others.</p>'
            : '';

        availableStudentsList.innerHTML = truncationNote + available.map(student => `
            <label class="available-student-item" data-student-id="${student._id}"
                 style="display: flex; align-items: center; padding: 8px 10px; cursor: pointer; border-bottom: 1px solid #f0f0f0; gap: 10px; margin: 0;">
                <input type="checkbox" class="add-student-checkbox" value="${student._id}"
                       ${selectedStudentIds.has(student._id) ? 'checked' : ''}
                       style="cursor: pointer; width: 16px; height: 16px; flex-shrink: 0;">
                <div style="flex: 1; min-width: 0;">
                    <span style="font-weight: 500;">${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</span>
                    <span style="color: #999; font-size: 0.85em; margin-left: 8px;">${escapeHtml(student.email || student.username || '')}</span>
                </div>
            </label>
        `).join('');

        // Add checkbox change handlers
        availableStudentsList.querySelectorAll('.add-student-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    selectedStudentIds.add(cb.value);
                } else {
                    selectedStudentIds.delete(cb.value);
                }
                updateAddSelectedButton();
            });
        });

        // Hover effect
        availableStudentsList.querySelectorAll('.available-student-item').forEach(item => {
            item.addEventListener('mouseenter', () => {
                item.style.background = '#e8f5e9';
            });
            item.addEventListener('mouseleave', () => {
                item.style.background = '';
            });
        });
    }

    // Update the "Add Selected" button visibility and count
    function updateAddSelectedButton() {
        const count = selectedStudentIds.size;
        if (addSelectedStudentsBtn) {
            addSelectedStudentsBtn.style.display = count > 0 ? 'inline-block' : 'none';
        }
        if (selectedStudentCountEl) {
            selectedStudentCountEl.textContent = count;
        }
    }

    // Add all selected students to the class
    async function addSelectedStudentsToClass() {
        if (selectedStudentIds.size === 0) return;

        const ids = Array.from(selectedStudentIds);
        addSelectedStudentsBtn.disabled = true;
        addSelectedStudentsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';

        try {
            const response = await csrfFetch(`/api/admin/enrollment-codes/${currentClassId}/students`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentIds: ids })
            });

            const data = await response.json();

            if (!response.ok) {
                alert('Failed to add students: ' + (data.message || 'Unknown error'));
                return;
            }

            if (data.success) {
                // Clear selections and reload
                selectedStudentIds.clear();
                updateAddSelectedButton();
                await loadClassStudents(currentClassId);
                renderAvailableStudents();
                loadClasses();
            } else {
                alert('Failed to add students: ' + (data.message || 'Unknown error'));
            }
        } catch (error) {
            console.error('[ManageClasses] Add error:', error);
            alert('Error adding students to class');
        } finally {
            addSelectedStudentsBtn.disabled = false;
            addSelectedStudentsBtn.innerHTML = '<i class="fas fa-plus"></i> Add Selected (<span id="selectedStudentCount">' + selectedStudentIds.size + '</span>)';
            // Re-bind the count element reference
            const newCountEl = document.getElementById('selectedStudentCount');
            if (newCountEl) newCountEl.textContent = selectedStudentIds.size;
        }
    }

    // Remove student from class
    async function removeStudentFromClass(studentId) {
        try {
            const response = await csrfFetch(`/api/admin/enrollment-codes/${currentClassId}/students/${studentId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                await loadClassStudents(currentClassId);
                renderAvailableStudents();
                loadClasses();
            } else {
                alert('Failed to remove student: ' + data.message);
            }
        } catch (error) {
            console.error('[ManageClasses] Remove error:', error);
            alert('Error removing student from class');
        }
    }

    // Reset class selection
    function resetClassSelection() {
        currentClassId = null;
        currentClassStudents.clear();
        selectedStudentIds.clear();
        updateAddSelectedButton();
        noClassSelected.style.display = 'block';
        classStudentManagement.style.display = 'none';
    }

    // Helper
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }
});

;
/* --- /js/guided-tour.js?v=20260728 --- */
/**
 * Guided Tour System - Reusable Onboarding Tours for MATHMATIX AI
 *
 * Usage:
 *   const tour = new GuidedTour('teacher-dashboard', teacherTourSteps);
 *   tour.start();
 *
 * Tour steps format:
 *   [{
 *     element: '#element-selector',  // CSS selector for the target element
 *     title: 'Step Title',
 *     content: 'Description of this feature...',
 *     position: 'bottom',  // 'top', 'bottom', 'left', 'right'
 *     highlight: true,     // Whether to spotlight the element
 *     action: () => {}     // Optional callback when step is shown
 *   }]
 */

class GuidedTour {
    constructor(tourId, steps, options = {}) {
        this.tourId = tourId;
        this.steps = steps;
        this.currentStep = 0;
        this.isActive = false;

        // Options
        this.options = {
            onComplete: options.onComplete || null,
            onSkip: options.onSkip || null,
            showProgress: options.showProgress !== false,
            allowSkip: options.allowSkip !== false,
            overlayOpacity: options.overlayOpacity || 0.75,
            primaryColor: options.primaryColor || '#667eea',
            storageKey: options.storageKey || `tour_completed_${tourId}`
        };

        // Elements
        this.overlay = null;
        this.tooltip = null;
        this.spotlight = null;

        // Bind methods
        this.handleKeydown = this.handleKeydown.bind(this);
        this.handleResize = this.handleResize.bind(this);
    }

    // Check if tour has been completed
    hasCompleted() {
        return StorageUtils.local.getItem(this.options.storageKey) === 'true';
    }

    // Mark tour as completed
    markCompleted() {
        StorageUtils.local.setItem(this.options.storageKey, 'true');
    }

    // Reset tour completion status
    reset() {
        StorageUtils.local.removeItem(this.options.storageKey);
    }

    // Start the tour
    start(forceRestart = false) {
        if (this.hasCompleted() && !forceRestart) {
            console.log(`[GuidedTour] Tour "${this.tourId}" already completed. Use start(true) to force restart.`);
            return false;
        }

        if (this.steps.length === 0) {
            console.warn('[GuidedTour] No steps defined for tour');
            return false;
        }

        this.isActive = true;
        this.currentStep = 0;
        this.createOverlay();
        this.createTooltip();
        this.showStep(0);

        // Add event listeners
        document.addEventListener('keydown', this.handleKeydown);
        window.addEventListener('resize', this.handleResize);

        return true;
    }

    // Create the overlay and spotlight
    createOverlay() {
        // Main overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'guided-tour-overlay';
        this.overlay.innerHTML = `
            <svg class="guided-tour-spotlight-svg" width="100%" height="100%">
                <defs>
                    <mask id="spotlight-mask">
                        <rect width="100%" height="100%" fill="white"/>
                        <rect class="spotlight-cutout" x="0" y="0" width="0" height="0" rx="8" fill="black"/>
                    </mask>
                </defs>
                <rect width="100%" height="100%" fill="rgba(0,0,0,${this.options.overlayOpacity})" mask="url(#spotlight-mask)"/>
            </svg>
        `;
        document.body.appendChild(this.overlay);

        // Add styles if not already present
        if (!document.getElementById('guided-tour-styles')) {
            const styles = document.createElement('style');
            styles.id = 'guided-tour-styles';
            styles.textContent = `
                .guided-tour-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 99998;
                    pointer-events: none;
                }

                .guided-tour-spotlight-svg {
                    width: 100%;
                    height: 100%;
                }

                .spotlight-cutout {
                    transition: all 0.3s ease;
                }

                .guided-tour-tooltip {
                    position: fixed;
                    z-index: 99999;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                    max-width: 360px;
                    min-width: 280px;
                    pointer-events: auto;
                    animation: tooltipFadeIn 0.3s ease;
                }

                @keyframes tooltipFadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .guided-tour-tooltip-header {
                    padding: 16px 20px 12px;
                    border-bottom: 1px solid #f0f0f0;
                }

                .guided-tour-tooltip-title {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 600;
                    color: #2c3e50;
                }

                .guided-tour-tooltip-content {
                    padding: 16px 20px;
                    font-size: 14px;
                    line-height: 1.6;
                    color: #555;
                }

                .guided-tour-tooltip-footer {
                    padding: 12px 20px 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-top: 1px solid #f0f0f0;
                }

                .guided-tour-progress {
                    font-size: 12px;
                    color: #999;
                }

                .guided-tour-progress-dots {
                    display: flex;
                    gap: 6px;
                    margin-top: 4px;
                }

                .guided-tour-progress-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #e0e0e0;
                    transition: background 0.2s;
                }

                .guided-tour-progress-dot.active {
                    background: ${this.options.primaryColor};
                }

                .guided-tour-progress-dot.completed {
                    background: #27ae60;
                }

                .guided-tour-buttons {
                    display: flex;
                    gap: 10px;
                }

                .guided-tour-btn {
                    padding: 8px 16px;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: none;
                }

                .guided-tour-btn-secondary {
                    background: #f5f5f5;
                    color: #666;
                }

                .guided-tour-btn-secondary:hover {
                    background: #e8e8e8;
                }

                .guided-tour-btn-primary {
                    background: ${this.options.primaryColor};
                    color: white;
                }

                .guided-tour-btn-primary:hover {
                    opacity: 0.9;
                }

                .guided-tour-btn-skip {
                    background: transparent;
                    color: #999;
                    padding: 8px 12px;
                }

                .guided-tour-btn-skip:hover {
                    color: #666;
                }

                .guided-tour-tooltip-arrow {
                    position: absolute;
                    width: 16px;
                    height: 16px;
                    background: white;
                    transform: rotate(45deg);
                    box-shadow: -2px -2px 4px rgba(0,0,0,0.05);
                }

                .guided-tour-tooltip-arrow.bottom { top: -8px; }
                .guided-tour-tooltip-arrow.top { bottom: -8px; }
                .guided-tour-tooltip-arrow.left { right: -8px; }
                .guided-tour-tooltip-arrow.right { left: -8px; }

                /* Highlighted element gets higher z-index */
                .guided-tour-highlighted {
                    position: relative;
                    z-index: 99997 !important;
                    pointer-events: auto;
                }

                /* Pulse animation for highlighted elements */
                .guided-tour-pulse {
                    animation: tourPulse 2s infinite;
                }

                @keyframes tourPulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(102, 126, 234, 0.4); }
                    50% { box-shadow: 0 0 0 10px rgba(102, 126, 234, 0); }
                }
            `;
            document.head.appendChild(styles);
        }
    }

    // Create the tooltip
    createTooltip() {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'guided-tour-tooltip';
        document.body.appendChild(this.tooltip);
    }

    // Show a specific step
    showStep(index) {
        if (index < 0 || index >= this.steps.length) return;

        const step = this.steps[index];
        const element = document.querySelector(step.element);

        // Element not found or not visible (e.g. inside collapsed sidebar)
        if (!element || (element.offsetParent === null && getComputedStyle(element).position !== 'fixed')) {
            console.warn(`[GuidedTour] Element not found or hidden: ${step.element}`);
            // Skip this step only — don't chain-complete the entire tour
            this._skipStep(index);
            return;
        }

        this.currentStep = index;

        // Remove highlight from previous element
        document.querySelectorAll('.guided-tour-highlighted, .guided-tour-pulse').forEach(el => {
            el.classList.remove('guided-tour-highlighted', 'guided-tour-pulse');
        });

        // Highlight current element
        if (step.highlight !== false) {
            element.classList.add('guided-tour-highlighted');
            if (step.pulse !== false) {
                element.classList.add('guided-tour-pulse');
            }
        }

        // Scroll element into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Update spotlight
        setTimeout(() => {
            this.updateSpotlight(element);
            this.updateTooltip(step, element);

            // Call step action if defined
            if (step.action && typeof step.action === 'function') {
                step.action(element, this);
            }
        }, 300);
    }

    // Skip a missing/hidden step without chain-completing the tour.
    // Finds the next visible step forward; if none, tries backward; if none at all, completes.
    _skipStep(fromIndex) {
        // Try forward
        for (let i = fromIndex + 1; i < this.steps.length; i++) {
            const el = document.querySelector(this.steps[i].element);
            if (el && (el.offsetParent !== null || getComputedStyle(el).position === 'fixed')) {
                this.showStep(i);
                return;
            }
        }
        // Try backward (wrap around to earlier steps we haven't shown)
        for (let i = fromIndex - 1; i >= 0; i--) {
            if (i === this.currentStep) continue; // don't re-show current
            const el = document.querySelector(this.steps[i].element);
            if (el && (el.offsetParent !== null || getComputedStyle(el).position === 'fixed')) {
                this.showStep(i);
                return;
            }
        }
        // No visible steps at all — complete
        this.complete();
    }

    // Update the spotlight cutout
    updateSpotlight(element) {
        const rect = element.getBoundingClientRect();
        const padding = 8;

        const cutout = this.overlay.querySelector('.spotlight-cutout');
        cutout.setAttribute('x', rect.left - padding);
        cutout.setAttribute('y', rect.top - padding);
        cutout.setAttribute('width', rect.width + padding * 2);
        cutout.setAttribute('height', rect.height + padding * 2);
    }

    // Update the tooltip content and position
    updateTooltip(step, element) {
        const rect = element.getBoundingClientRect();
        const position = step.position || 'bottom';

        // Build progress dots
        let progressHtml = '';
        if (this.options.showProgress) {
            const dots = this.steps.map((_, i) => {
                let cls = 'guided-tour-progress-dot';
                if (i < this.currentStep) cls += ' completed';
                if (i === this.currentStep) cls += ' active';
                return `<div class="${cls}"></div>`;
            }).join('');
            progressHtml = `
                <div class="guided-tour-progress">
                    <span>Step ${this.currentStep + 1} of ${this.steps.length}</span>
                    <div class="guided-tour-progress-dots">${dots}</div>
                </div>
            `;
        }

        // Build buttons
        const isFirst = this.currentStep === 0;
        const isLast = this.currentStep === this.steps.length - 1;

        let buttonsHtml = '<div class="guided-tour-buttons">';
        if (!isFirst) {
            buttonsHtml += '<button class="guided-tour-btn guided-tour-btn-secondary" data-action="prev">Back</button>';
        }
        if (this.options.allowSkip && !isLast) {
            buttonsHtml += '<button class="guided-tour-btn guided-tour-btn-skip" data-action="skip">Skip Tour</button>';
        }
        buttonsHtml += `<button class="guided-tour-btn guided-tour-btn-primary" data-action="${isLast ? 'complete' : 'next'}">${isLast ? 'Finish' : 'Next'}</button>`;
        buttonsHtml += '</div>';

        // Set tooltip content
        this.tooltip.innerHTML = `
            <div class="guided-tour-tooltip-arrow ${position}"></div>
            <div class="guided-tour-tooltip-header">
                <h3 class="guided-tour-tooltip-title">${step.title}</h3>
            </div>
            <div class="guided-tour-tooltip-content">
                ${step.content}
            </div>
            <div class="guided-tour-tooltip-footer">
                ${progressHtml}
                ${buttonsHtml}
            </div>
        `;

        // Add button listeners
        this.tooltip.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const button = e.target.closest('[data-action]');
                if (!button) return;
                const action = button.dataset.action;
                if (action === 'next') this.next();
                else if (action === 'prev') this.prev();
                else if (action === 'skip') this.skip();
                else if (action === 'complete') this.complete();
            });
        });

        // Position tooltip
        this.positionTooltip(rect, position);
    }

    // Position the tooltip relative to the target element
    positionTooltip(targetRect, position) {
        const tooltip = this.tooltip;
        const tooltipRect = tooltip.getBoundingClientRect();
        const padding = 16;
        const arrowSize = 8;

        let top, left;

        switch (position) {
            case 'top':
                top = targetRect.top - tooltipRect.height - padding - arrowSize;
                left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'bottom':
                top = targetRect.bottom + padding + arrowSize;
                left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'left':
                top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
                left = targetRect.left - tooltipRect.width - padding - arrowSize;
                break;
            case 'right':
                top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
                left = targetRect.right + padding + arrowSize;
                break;
            default:
                top = targetRect.bottom + padding;
                left = targetRect.left;
        }

        // Keep tooltip on screen
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (left < padding) left = padding;
        if (left + tooltipRect.width > viewportWidth - padding) {
            left = viewportWidth - tooltipRect.width - padding;
        }
        if (top < padding) top = padding;
        if (top + tooltipRect.height > viewportHeight - padding) {
            top = viewportHeight - tooltipRect.height - padding;
        }

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;

        // Position arrow
        const arrow = tooltip.querySelector('.guided-tour-tooltip-arrow');
        if (arrow) {
            const arrowOffset = Math.min(
                Math.max(20, targetRect.left + targetRect.width / 2 - left),
                tooltipRect.width - 20
            );

            if (position === 'top' || position === 'bottom') {
                arrow.style.left = `${arrowOffset}px`;
            } else {
                arrow.style.top = `${Math.min(Math.max(20, targetRect.top + targetRect.height / 2 - top), tooltipRect.height - 20)}px`;
            }
        }
    }

    // Go to next step (skips hidden elements automatically)
    next() {
        if (this.currentStep < this.steps.length - 1) {
            this.showStep(this.currentStep + 1);
        } else {
            this.complete();
        }
    }

    // Go to previous step (skips hidden elements automatically)
    prev() {
        // Find the nearest previous visible step
        for (let i = this.currentStep - 1; i >= 0; i--) {
            const el = document.querySelector(this.steps[i].element);
            if (el && (el.offsetParent !== null || getComputedStyle(el).position === 'fixed')) {
                this.showStep(i);
                return;
            }
        }
    }

    // Skip the tour
    skip() {
        this.cleanup();
        if (this.options.onSkip) {
            this.options.onSkip(this.currentStep);
        }
    }

    // Complete the tour
    complete() {
        this.markCompleted();
        this.cleanup();
        if (this.options.onComplete) {
            this.options.onComplete();
        }
    }

    // Clean up tour elements
    cleanup() {
        this.isActive = false;

        // Remove elements
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        if (this.tooltip) {
            this.tooltip.remove();
            this.tooltip = null;
        }

        // Remove highlights
        document.querySelectorAll('.guided-tour-highlighted, .guided-tour-pulse').forEach(el => {
            el.classList.remove('guided-tour-highlighted', 'guided-tour-pulse');
        });

        // Remove event listeners
        document.removeEventListener('keydown', this.handleKeydown);
        window.removeEventListener('resize', this.handleResize);
    }

    // Handle keyboard navigation
    handleKeydown(e) {
        if (!this.isActive) return;

        switch (e.key) {
            case 'ArrowRight':
            case 'Enter':
                e.preventDefault();
                this.next();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.prev();
                break;
            case 'Escape':
                e.preventDefault();
                this.skip();
                break;
        }
    }

    // Handle window resize
    handleResize() {
        if (!this.isActive) return;

        const step = this.steps[this.currentStep];
        const element = document.querySelector(step.element);
        if (element) {
            this.updateSpotlight(element);
            this.positionTooltip(element.getBoundingClientRect(), step.position || 'bottom');
        }
    }
}

// Export for use
window.GuidedTour = GuidedTour;


// ============================================
// PREDEFINED TOUR CONFIGURATIONS
// ============================================

// Teacher Dashboard Tour
window.teacherDashboardTour = [
    {
        element: '.class-overview',
        title: 'Class Overview',
        content: 'See your entire class at a glance. Track active students, those needing attention, and overall progress metrics.',
        position: 'bottom'
    },
    {
        element: '#student-search',
        title: 'Search & Filter',
        content: 'Quickly find students by name or filter by status (active, struggling, inactive).',
        position: 'bottom'
    },
    {
        element: '.student-card',
        title: 'Student Cards',
        content: 'Each card shows key metrics: level, XP, last login, and weekly activity. Click a name for full details.',
        position: 'right'
    },
    {
        element: '.view-as-student-btn',
        title: 'View as Student',
        content: 'See exactly what your students see. Great for troubleshooting or understanding their experience.',
        position: 'top'
    },
    {
        element: '.view-iep-btn',
        title: 'IEP Management',
        content: 'Manage Individualized Education Plans with accommodations, goals, and progress tracking.',
        position: 'top'
    },
    {
        element: '[data-tab="announcements"]',
        title: 'Send Announcements',
        content: 'Send instant messages to your entire class or individual students. They\'ll see them right in their dashboard.',
        position: 'bottom'
    },
    {
        element: '[data-tab="messages"]',
        title: 'Parent Messaging',
        content: 'Communicate directly with parents about their child\'s progress, concerns, or achievements.',
        position: 'bottom'
    },
    {
        element: '#qa-export-progress',
        title: 'Export Data',
        content: 'Download student progress data as a CSV for reports or grade books.',
        position: 'left'
    }
];

// Parent Dashboard Tour
window.parentDashboardTour = [
    {
        element: '.child-card',
        title: 'Your Child\'s Progress',
        content: 'See detailed progress for each linked child, including level, XP, recent sessions, and IEP goals.',
        position: 'right'
    },
    {
        element: '.view-as-child-btn',
        title: 'View as Your Child',
        content: 'Experience exactly what your child sees when they use MATHMATIX AI. Great for understanding their learning journey.',
        position: 'top'
    },
    {
        element: '#childSelector',
        title: 'Ask About Progress',
        content: 'Select a child and ask questions about their math progress. The AI will give you personalized insights.',
        position: 'bottom'
    },
    {
        element: '.helper-btn',
        title: 'Quick Questions',
        content: 'Click these buttons to quickly ask common questions about your child\'s learning.',
        position: 'top'
    },
    {
        element: '#parent-learning-center',
        title: 'Parent Courses',
        content: 'Enroll in free mini-courses designed to help you understand the math your child is learning. Lessons are short, conversational, and built for busy parents.',
        position: 'right'
    },
    {
        element: '#send-weekly-report-btn',
        title: 'Email Reports',
        content: 'Get detailed progress reports sent directly to your email.',
        position: 'left'
    },
    {
        element: '#generate-code-btn',
        title: 'Link More Children',
        content: 'Generate a code to link additional children to your parent account.',
        position: 'bottom'
    }
];

// Student Dashboard Tour
window.studentDashboardTour = [
    {
        element: '#user-input',
        title: 'Your AI Tutor',
        content: 'This is your personal math tutor! Type a question here to get help with homework, practice new skills, or explore math topics.',
        position: 'top'
    },
    {
        element: '#drawer-daily-quests-container',
        title: 'Daily Quests',
        content: 'Complete quests every day to earn XP and build your streak! Consistency is key to mastering math.',
        position: 'right'
    },
    {
        element: '#cr-xp-meter',
        title: 'Your Progress',
        content: 'Track your XP and level here. The more you practice, the higher you\'ll climb!',
        position: 'bottom'
    },
    {
        element: '#drawer-leaderboard-table',
        title: 'Leaderboard',
        content: 'See how you stack up against your classmates! Earn XP to climb the ranks.',
        position: 'right'
    },
    {
        element: '#open-settings-modal-btn',
        title: 'Choose Your Tutor',
        content: 'Open Settings to pick a different AI tutor. Each tutor has its own personality and teaching style!',
        position: 'bottom'
    },
    {
        element: '#camera-button',
        title: 'Show Your Work',
        content: 'Snap a photo or upload a PDF of your handwritten work and get instant feedback and grading. Unlimited with Mathmatix+!',
        position: 'top'
    }
];

// Admin Dashboard Tour
window.adminDashboardTour = [
    {
        element: '.left-sidebar',
        title: 'System Status',
        content: 'Database health, AI service status, and the top-students leaderboard at a glance.',
        position: 'right'
    },
    {
        element: '#userStatCards',
        title: 'User Management',
        content: 'User counts by role, with the full searchable user list below. Edit accounts, assign teachers, and link parents.',
        position: 'bottom'
    },
    {
        element: '#openTeacherSetupBtn',
        title: 'Add Teachers',
        content: 'Create teacher accounts and generate enrollment codes for their classes.',
        position: 'bottom'
    },
    {
        element: '#openRosterImportBtn',
        title: 'Import Rosters',
        content: 'Bulk-import students from a CSV roster and assign them to teachers in one pass.',
        position: 'bottom'
    },
    {
        element: '#openBulkEmailBtn',
        title: 'Bulk Email',
        content: 'Send emails to all students, parents, or teachers. Great for announcements and newsletters.',
        position: 'bottom'
    }
];


// ============================================
// AUTO-START TOUR FOR NEW USERS
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Detect which dashboard we're on and offer tour
    const path = window.location.pathname;

    let tourConfig = null;
    let tourId = null;

    if (path.includes('teacher-dashboard')) {
        tourConfig = window.teacherDashboardTour;
        tourId = 'teacher-dashboard';
    } else if (path.includes('parent-dashboard')) {
        tourConfig = window.parentDashboardTour;
        tourId = 'parent-dashboard';
    } else if (path.includes('student-dashboard') || path.includes('chat.html')) {
        tourConfig = window.studentDashboardTour;
        tourId = 'student-dashboard';
    } else if (path.includes('admin-dashboard')) {
        tourConfig = window.adminDashboardTour;
        tourId = 'admin-dashboard';
    }

    if (tourConfig && tourId) {
        const tour = new GuidedTour(tourId, tourConfig, {
            onComplete: () => {
                showTourCompletionMessage();
            }
        });

        // Check if user hasn't seen the tour
        if (!tour.hasCompleted()) {
            // Show "Take a Tour" prompt after a short delay
            setTimeout(() => {
                showTourPrompt(tour);
            }, 1500);
        }

        // Add "Help" button to trigger tour manually
        addTourButton(tour);
    }
});

// Show prompt asking if user wants to take the tour
function showTourPrompt(tour) {
    const prompt = document.createElement('div');
    prompt.id = 'tour-prompt';
    prompt.innerHTML = `
        <div style="position: fixed; bottom: 20px; right: 20px; background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); padding: 20px; max-width: 320px; z-index: 9999; animation: slideUp 0.3s ease;">
            <div style="display: flex; align-items: flex-start; gap: 12px;">
                <div style="font-size: 32px;">👋</div>
                <div>
                    <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #2c3e50;">Welcome! New here?</h3>
                    <p style="margin: 0 0 16px 0; font-size: 14px; color: #666; line-height: 1.5;">Take a quick tour to learn about all the features available to you.</p>
                    <div style="display: flex; gap: 10px;">
                        <button id="tour-start-btn" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500;">Take Tour</button>
                        <button id="tour-dismiss-btn" style="background: #f5f5f5; color: #666; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Maybe Later</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Add animation style
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(prompt);

    document.getElementById('tour-start-btn').addEventListener('click', () => {
        prompt.remove();
        tour.start(true);
    });

    document.getElementById('tour-dismiss-btn').addEventListener('click', () => {
        prompt.remove();
        tour.markCompleted(); // Don't show again
    });

    // Auto-dismiss after 30 seconds. Previously this just removed the
    // element without persisting — so an ignored prompt would pop again
    // on every page load. "If dismissed, it goes" means *any* dismissal
    // (button, timeout, future X close) counts. Mark completed here too.
    setTimeout(() => {
        if (prompt.parentElement) {
            prompt.remove();
            tour.markCompleted();
        }
    }, 30000);
}

// Add a "Help / Tour" button to the page
function addTourButton(tour) {
    // Check if there's already a help button area
    let helpArea = document.querySelector('.tour-help-btn');
    if (helpArea) return;

    // "If dismissed, it goes" — once the user has dismissed the prompt
    // (Maybe Later, X close, or 30s auto-dismiss), the floating help
    // pill stops auto-injecting on subsequent loads too. The tour can
    // still be re-launched programmatically (e.g. from a hamburger menu
    // "Replay tour" item) via tour.start(true) — that bypasses
    // hasCompleted, so power users aren't permanently locked out.
    if (typeof tour?.hasCompleted === 'function' && tour.hasCompleted()) {
        return;
    }

    const btn = document.createElement('button');
    btn.className = 'tour-help-btn';
    btn.innerHTML = '<i class="fas fa-question-circle"></i> Tour';
    btn.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: white;
        border: 1px solid #e0e0e0;
        padding: 10px 16px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        color: #666;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        z-index: 9990;
        transition: all 0.2s;
    `;

    btn.addEventListener('mouseenter', () => {
        btn.style.background = '#f5f5f5';
    });

    btn.addEventListener('mouseleave', () => {
        btn.style.background = 'white';
    });

    btn.addEventListener('click', () => {
        tour.start(true);
    });

    document.body.appendChild(btn);
}

// Show completion message
function showTourCompletionMessage() {
    const msg = document.createElement('div');
    msg.innerHTML = `
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); padding: 40px; text-align: center; z-index: 100000; animation: scaleIn 0.3s ease;">
            <div style="font-size: 64px; margin-bottom: 16px;">🎉</div>
            <h2 style="margin: 0 0 12px 0; color: #2c3e50;">Tour Complete!</h2>
            <p style="margin: 0 0 24px 0; color: #666; font-size: 16px;">You're all set. Click "Tour" anytime to revisit.</p>
            <button onclick="this.parentElement.parentElement.remove()" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; padding: 12px 32px; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: 500;">Got it!</button>
        </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
        @keyframes scaleIn {
            from { transform: translate(-50%, -50%) scale(0.8); opacity: 0; }
            to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(msg);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        if (msg.parentElement) msg.remove();
    }, 5000);
}

;
/* --- /js/sessionManager.js --- */
/**
 * Session Manager - Handles session lifecycle, idle timeout, and auto-save
 *
 * Features:
 * - 20-minute idle timeout with 2-minute warning
 * - Heartbeat tracking every 30 seconds
 * - Auto-save mastery progress on logout
 * - Session summary generation
 * - Tab/browser close detection
 *
 * The idle warning renders through MMIdleDialog (js/idle-dialog.js), shared
 * with auto-logout.js. On pages that load both, auto-logout owns the timer and
 * this class's idle check stands down (see init) — but both must reach for the
 * same dialog, or the same event shows two different-looking prompts.
 */

// Events that count as answering "are you still there?". mousemove and scroll
// deliberately do not: the warning used to vanish as the pointer travelled
// toward its own buttons.
const DELIBERATE_ACTIVITY = new Set(['mousedown', 'keypress', 'touchstart', 'click']);

class SessionManager {
  constructor() {
    this.IDLE_TIMEOUT = 20 * 60 * 1000; // 20 minutes in milliseconds
    this.WARNING_TIME = 2 * 60 * 1000;  // 2 minutes warning before timeout
    this.HEARTBEAT_INTERVAL = 30 * 1000; // 30 seconds
    this.IDLE_THRESHOLD = 60 * 1000; // Consider idle after 60 seconds of no activity
    this.MAX_BACKOFF = 5 * 60 * 1000; // Cap backoff at 5 minutes

    this.lastActivity = Date.now();
    this.warningShown = false;
    this.heartbeatTimer = null;
    this.currentHeartbeatInterval = this.HEARTBEAT_INTERVAL;
    this.consecutiveFailures = 0;
    this.idleCheckTimer = null;
    this.warningTimer = null;
    this.sessionStartTime = Date.now();

    // IMPROVED: Precise active time tracking
    this.lastActiveTimestamp = Date.now(); // When we last recorded activity
    this.accumulatedActiveSeconds = 0; // Seconds accumulated since last heartbeat
    this.isCurrentlyActive = true; // Whether user is currently active (not idle)

    this.sessionData = {
      problemsAttempted: 0,
      problemsSolved: 0,
      hintsUsed: 0,
      timeSpent: 0,
      masteryProgress: null
    };

    this.stopped = false;
    this.init();
  }

  init() {
    // Track user activity
    this.setupActivityTrackers();

    // Start heartbeat
    this.startHeartbeat();

    // Start idle check only if auto-logout.js is NOT loaded (avoid competing timers).
    // auto-logout.js sets window.triggerLogout when initialized.
    // If both scripts are present on a page, auto-logout.js handles the timeout
    // and sessionManager focuses on heartbeats, time tracking, and session end beacons.
    this.idleCheckEnabled = !window.triggerLogout;
    if (this.idleCheckEnabled) {
      this.startIdleCheck();
      console.log('[SessionManager] Initialized with idle timeout (20 min)');
    } else {
      console.log('[SessionManager] Initialized (idle timeout deferred to auto-logout.js)');
    }

    // Stop all timers if session expires (401 detected by csrfFetch)
    window.addEventListener('session-expired', () => this.stop());

    // Handle page unload (tab/browser close)
    this.setupUnloadHandler();
  }

  setupActivityTrackers() {
    // Track mouse movement, keyboard input, clicks, touches
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    activityEvents.forEach(event => {
      document.addEventListener(event, () => {
        this.recordActivity(event);
      }, { passive: true });
    });
  }

  recordActivity(eventType) {
    const now = Date.now();
    const wasIdle = (now - this.lastActivity) > this.IDLE_TIMEOUT;
    const wasInactive = (now - this.lastActivity) > this.IDLE_THRESHOLD;

    // IMPROVED: Track active time precisely
    // If user was active (not idle), add the time since last activity
    if (this.isCurrentlyActive && !wasInactive) {
      const secondsSinceLastActivity = Math.floor((now - this.lastActiveTimestamp) / 1000);
      // Only count time if it's reasonable (less than idle threshold to avoid counting idle time)
      if (secondsSinceLastActivity > 0 && secondsSinceLastActivity < (this.IDLE_THRESHOLD / 1000)) {
        this.accumulatedActiveSeconds += secondsSinceLastActivity;
      }
    }

    // Update timestamps
    this.lastActivity = now;
    this.lastActiveTimestamp = now;
    this.isCurrentlyActive = true;

    // If user was idle and warning was shown, dismiss it — but only on a
    // DELIBERATE action. A mousemove or a scroll is not an answer to "are you
    // still there?", and dismissing on those meant the dialog vanished as the
    // student moved the pointer toward its own buttons.
    if (this.warningShown && DELIBERATE_ACTIVITY.has(eventType || 'click')) {
      this.dismissWarning();
    }

    // If user came back from being idle, send heartbeat immediately
    if (wasIdle) {
      this.sendHeartbeat();
    }
  }

  // Called periodically to check if user became idle
  checkAndUpdateActiveTime() {
    const now = Date.now();
    const timeSinceLastActivity = now - this.lastActivity;

    if (timeSinceLastActivity > this.IDLE_THRESHOLD) {
      // User is idle - stop counting active time
      this.isCurrentlyActive = false;
    } else if (this.isCurrentlyActive) {
      // User is still active - accumulate time
      const secondsSinceLastRecord = Math.floor((now - this.lastActiveTimestamp) / 1000);
      if (secondsSinceLastRecord > 0 && secondsSinceLastRecord < (this.IDLE_THRESHOLD / 1000)) {
        this.accumulatedActiveSeconds += secondsSinceLastRecord;
        this.lastActiveTimestamp = now;
      }
    }
  }

  startHeartbeat() {
    // Send initial heartbeat
    this.sendHeartbeat();

    // Send heartbeat on a dynamic interval (backs off on 429)
    this.scheduleNextHeartbeat();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.heartbeatTimer);
    clearInterval(this.idleCheckTimer);
    clearTimeout(this.warningTimer);
    this.heartbeatTimer = null;
    console.log('[SessionManager] Stopped (session expired)');
  }

  scheduleNextHeartbeat() {
    if (this.stopped) return;
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = setTimeout(() => {
      this.checkAndUpdateActiveTime();
      this.sendHeartbeat();
      this.scheduleNextHeartbeat();
    }, this.currentHeartbeatInterval);
  }

  handleHeartbeatSuccess() {
    if (this.consecutiveFailures > 0) {
      console.log('[SessionManager] Heartbeat recovered, resetting interval');
    }
    this.consecutiveFailures = 0;
    this.currentHeartbeatInterval = this.HEARTBEAT_INTERVAL;
  }

  handleHeartbeatFailure(status) {
    this.consecutiveFailures++;
    if (status === 429) {
      // Exponential backoff: 60s, 120s, 240s, capped at MAX_BACKOFF
      this.currentHeartbeatInterval = Math.min(
        this.HEARTBEAT_INTERVAL * Math.pow(2, this.consecutiveFailures),
        this.MAX_BACKOFF
      );
      console.warn(`[SessionManager] Rate limited, backing off to ${Math.round(this.currentHeartbeatInterval / 1000)}s`);
    }
  }

  async sendHeartbeat() {
    if (this.stopped) return;
    try {
      // Check active time one more time before sending
      this.checkAndUpdateActiveTime();

      // Get the accumulated active seconds and reset the counter
      const activeSecondsToSend = this.accumulatedActiveSeconds;
      this.accumulatedActiveSeconds = 0;
      this.lastActiveTimestamp = Date.now();

      // Send heartbeat for session keepalive
      const heartbeatResponse = await csrfFetch('/api/session/heartbeat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          lastActivity: this.lastActivity,
          sessionData: this.sessionData
        }),
        credentials: 'include'
      });

      if (!heartbeatResponse.ok) {
        console.error('[SessionManager] Heartbeat failed:', heartbeatResponse.status);
        this.handleHeartbeatFailure(heartbeatResponse.status);
        // Re-accumulate seconds on failure so they're not lost
        this.accumulatedActiveSeconds += activeSecondsToSend;
        return;
      }

      this.handleHeartbeatSuccess();

      // Send active time tracking if we have any active seconds
      if (activeSecondsToSend > 0) {
        const trackTimeResponse = await csrfFetch('/api/chat/track-time', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            activeSeconds: activeSecondsToSend
          }),
          credentials: 'include'
        });

        if (trackTimeResponse.ok) {
          console.log(`[SessionManager] Tracked ${activeSecondsToSend}s of active time`);
        } else {
          console.error('[SessionManager] Track time failed:', trackTimeResponse.status);
          // Add the seconds back if tracking failed
          this.accumulatedActiveSeconds += activeSecondsToSend;
        }
      }
    } catch (error) {
      console.error('[SessionManager] Heartbeat error:', error);
      // Network errors (ERR_CONNECTION_CLOSED, Failed to fetch) should also
      // trigger backoff so we don't hammer a recovering server every 30s
      this.consecutiveFailures++;
      this.currentHeartbeatInterval = Math.min(
        this.HEARTBEAT_INTERVAL * Math.pow(2, this.consecutiveFailures),
        this.MAX_BACKOFF
      );
      console.warn(`[SessionManager] Network error, backing off to ${Math.round(this.currentHeartbeatInterval / 1000)}s`);
    }
  }

  startIdleCheck() {
    // Check for idle timeout every 10 seconds
    this.idleCheckTimer = setInterval(() => {
      this.checkIdleTimeout();
    }, 10 * 1000);
  }

  checkIdleTimeout() {
    const now = Date.now();
    const idleTime = now - this.lastActivity;

    // Check if user has been idle for 18 minutes (show warning at 18 min, timeout at 20 min)
    const timeUntilTimeout = this.IDLE_TIMEOUT - idleTime;

    if (timeUntilTimeout <= this.WARNING_TIME && timeUntilTimeout > 0 && !this.warningShown) {
      this.showIdleWarning(timeUntilTimeout);
    } else if (timeUntilTimeout <= 0) {
      this.handleIdleTimeout();
    }
  }

  showIdleWarning(timeRemaining) {
    this.warningShown = true;

    const deadline = Date.now() + timeRemaining;
    const stay = () => { this.recordActivity('click'); this.dismissWarning(); };
    const signOut = () => this.logout('user_requested');

    // Shared with auto-logout.js so the same event never shows a student two
    // different dialogs. If the page didn't load it, fall back to confirm()
    // rather than dropping the warning.
    if (!window.MMIdleDialog) {
      const minutes = Math.ceil(timeRemaining / 60000);
      if (confirm(`You will be signed out in ${minutes} minute(s) due to inactivity.\n\nOK to stay signed in, Cancel to sign out now.`)) stay();
      else signOut();
      return;
    }

    window.MMIdleDialog.warn({
      getRemaining: () => deadline - Date.now(),
      onStay: stay,
      onSignOut: signOut,
    });
  }

  dismissWarning() {
    this.warningShown = false;
    if (window.MMIdleDialog) window.MMIdleDialog.close();
  }

  handleIdleTimeout() {
    console.log('[SessionManager] Idle timeout reached - logging out');
    this.logout('idle_timeout');
  }

  async logout(reason = 'manual') {
    console.log('[SessionManager] Logging out:', reason);

    // Stop all timers
    clearTimeout(this.heartbeatTimer);
    clearInterval(this.idleCheckTimer);
    clearTimeout(this.warningTimer);

    // Calculate session duration
    this.sessionData.timeSpent = Date.now() - this.sessionStartTime;

    // IMPROVED: Send any remaining active time before logging out
    this.checkAndUpdateActiveTime();
    if (this.accumulatedActiveSeconds > 0) {
      try {
        await csrfFetch('/api/chat/track-time', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activeSeconds: this.accumulatedActiveSeconds }),
          credentials: 'include'
        });
        console.log(`[SessionManager] Final time tracked: ${this.accumulatedActiveSeconds}s`);
        this.accumulatedActiveSeconds = 0;
      } catch (error) {
        console.error('[SessionManager] Error tracking final time:', error);
      }
    }

    // Save mastery progress if on mastery page
    await this.saveMasteryProgress();

    // Fetch session recap BEFORE ending the session (needs auth to succeed).
    // The recap modal will display after logout completes.
    let recapData = null;
    if (reason === 'manual' && window.location.pathname.includes('chat')) {
      try {
        const recapRes = await fetch('/api/session/recap', { credentials: 'include' });
        if (recapRes.ok) {
          const json = await recapRes.json();
          recapData = json.recap;
        }
      } catch (err) {
        console.error('[SessionManager] Recap fetch error:', err);
      }
    }

    // End session (generates summary)
    await this.endSession(reason);

    // Perform logout with CSRF token
    try {
      await csrfFetch('/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('[SessionManager] Logout error:', error);
    }

    // Clear UI language cache so the next user on this device gets a clean state
    StorageUtils.local.removeItem('mathmatix_ui_lang');

    // Show session recap before redirecting (if we fetched one)
    if (recapData && recapData.headline) {
      try {
        const shown = await this.showSessionRecap(recapData);
        if (shown) return; // Recap modal handles redirect after dismissal
      } catch (err) {
        console.error('[SessionManager] Recap display error:', err);
      }
    }

    // Redirect to login
    window.location.href = '/login.html';
  }

  /**
   * Display session recap modal with pre-fetched data.
   * Psychology: Peak-End Rule — the last moment of a session shapes memory of the whole experience.
   * Growth-focused: shows progress trajectory, not just raw stats.
   * @param {Object} recap - Pre-fetched recap data (fetched before session end to avoid auth race)
   * @returns {boolean} true if recap was shown, false otherwise
   */
  async showSessionRecap(recap) {
    try {
      if (!recap || !recap.headline) return false;

      // Sanitize string fields to prevent XSS (topic could contain user-influenced content)
      const esc = (s) => {
        const el = document.createElement('span');
        el.textContent = s;
        return el.innerHTML;
      };
      recap.headline = esc(recap.headline);
      recap.topic = recap.topic ? esc(recap.topic) : null;
      recap.achievement = recap.achievement ? esc(recap.achievement) : null;
      recap.narrative = recap.narrative ? esc(recap.narrative) : null;

      // Build and show recap modal
      const overlay = document.createElement('div');
      overlay.id = 'session-recap-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.3s ease;';

      const card = document.createElement('div');
      card.style.cssText = 'background:white;border-radius:20px;padding:32px;max-width:420px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:slideUp 0.3s ease;';

      let html = `<div style="font-size:2rem;margin-bottom:8px;">&#128170;</div>`;
      html += `<h2 style="font-size:1.3rem;font-weight:700;margin:0 0 4px;color:#18202B;">${recap.headline}</h2>`;
      if (recap.topic) {
        html += `<p style="font-size:0.85rem;color:#5B6876;margin:0 0 16px;">${recap.topic} &middot; ${recap.duration || 0} min</p>`;
      }

      // Stats row
      if (recap.problemsAttempted > 0) {
        html += `<div style="display:flex;gap:16px;justify-content:center;margin-bottom:16px;">`;
        html += `<div style="text-align:center;"><div style="font-size:1.4rem;font-weight:700;color:#12B3B3;">${recap.problemsCorrect}</div><div style="font-size:0.75rem;color:#5B6876;">Correct</div></div>`;
        html += `<div style="text-align:center;"><div style="font-size:1.4rem;font-weight:700;color:#18202B;">${recap.problemsAttempted}</div><div style="font-size:0.75rem;color:#5B6876;">Attempted</div></div>`;
        if (recap.accuracy != null) {
          const accColor = recap.accuracy >= 70 ? '#16C86D' : recap.accuracy >= 40 ? '#FFC24B' : '#FF4E4E';
          html += `<div style="text-align:center;"><div style="font-size:1.4rem;font-weight:700;color:${accColor};">${recap.accuracy}%</div><div style="font-size:0.75rem;color:#5B6876;">Accuracy</div></div>`;
        }
        html += `</div>`;
      }

      // Achievement callout (growth-focused)
      if (recap.achievement) {
        html += `<p style="font-size:0.9rem;color:#18202B;background:#F0FAF7;border-radius:12px;padding:12px 16px;margin:0 0 12px;line-height:1.4;">${recap.achievement}</p>`;
      }

      // Narrative (emotional arc)
      if (recap.narrative) {
        html += `<p style="font-size:0.85rem;color:#5B6876;margin:0 0 20px;font-style:italic;line-height:1.4;">${recap.narrative}</p>`;
      }

      html += `<button id="recap-dismiss-btn" style="background:#12B3B3;color:white;border:none;border-radius:12px;padding:12px 32px;font-size:1rem;font-weight:600;cursor:pointer;transition:background 0.2s;">See you next time!</button>`;

      card.innerHTML = html;
      overlay.appendChild(card);
      document.body.appendChild(overlay);

      // Add animations (idempotent — reuse if already added)
      let style = document.getElementById('session-recap-animations');
      if (!style) {
        style = document.createElement('style');
        style.id = 'session-recap-animations';
        style.textContent = '@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}';
        document.head.appendChild(style);
      }

      // Dismiss handler
      return new Promise((resolve) => {
        let dismissed = false;
        const dismiss = () => {
          if (dismissed) return;
          dismissed = true;
          overlay.style.opacity = '0';
          overlay.style.transition = 'opacity 0.3s';
          setTimeout(() => {
            overlay.remove();
            window.location.href = '/login.html';
          }, 300);
        };
        document.getElementById('recap-dismiss-btn').addEventListener('click', dismiss);
        // Auto-dismiss after 10 seconds
        setTimeout(dismiss, 10000);
        resolve(true);
      });
    } catch (err) {
      console.error('[SessionManager] showSessionRecap error:', err);
      return false;
    }
  }

  async saveMasteryProgress() {
    // Check if we're on a mastery page and have progress to save
    if (window.location.pathname.includes('mastery-chat.html')) {
      try {
        // Get mastery progress from the page if available
        const masteryProgress = this.getMasteryProgressFromPage();

        if (masteryProgress) {
          this.sessionData.masteryProgress = masteryProgress;

          const response = await csrfFetch('/api/session/save-mastery', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ masteryProgress }),
            credentials: 'include'
          });

          if (response.ok) {
            console.log('[SessionManager] Mastery progress saved');
          }
        }
      } catch (error) {
        console.error('[SessionManager] Error saving mastery progress:', error);
      }
    }
  }

  getMasteryProgressFromPage() {
    // Try to get mastery progress from global variables or localStorage
    // This should be set by mastery-chat.html
    if (typeof window.currentMasteryProgress !== 'undefined') {
      return window.currentMasteryProgress;
    }

    // Try localStorage
    let stored;
    stored = StorageUtils.local.getItem('masteryProgress');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('[SessionManager] Failed to parse stored mastery progress');
      }
    }

    return null;
  }

  async endSession(reason) {
    try {
      const response = await csrfFetch('/api/session/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason,
          destroySession: true,
          sessionData: this.sessionData
        }),
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[SessionManager] Session ended:', data);
      }
    } catch (error) {
      console.error('[SessionManager] Error ending session:', error);
    }
  }

  setupUnloadHandler() {
    // Track if we've already sent the end session request
    this.sessionEndSent = false;

    // Helper to send session end with proper content type
    const sendSessionEnd = (reason) => {
      if (this.sessionEndSent) return;
      this.sessionEndSent = true;

      // Track remaining active time
      this.checkAndUpdateActiveTime();
      if (this.accumulatedActiveSeconds > 0) {
        const timeBlob = new Blob(
          [JSON.stringify({ activeSeconds: this.accumulatedActiveSeconds })],
          { type: 'application/json' }
        );
        navigator.sendBeacon('/api/chat/track-time', timeBlob);
      }

      // Save mastery progress
      const masteryProgress = this.getMasteryProgressFromPage();
      if (masteryProgress) {
        const masteryBlob = new Blob(
          [JSON.stringify({ masteryProgress })],
          { type: 'application/json' }
        );
        navigator.sendBeacon('/api/session/save-mastery', masteryBlob);
      }

      // Send session end for summary/tracking only — do NOT destroy the session.
      // beforeunload and pagehide fire on BOTH browser close AND same-origin
      // navigation (e.g. clicking "Change Tutor" in settings). Destroying the
      // session here would log the user out whenever they navigate between pages.
      // Stale sessions are cleaned up server-side by destroyIdleExpressSessions().
      const payload = {
        reason,
        destroySession: false,
        sessionData: {
          ...this.sessionData,
          timeSpent: Date.now() - this.sessionStartTime
        }
      };
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon('/api/session/end', blob);

      console.log(`[SessionManager] Session end beacon sent: ${reason}`);
    };

    // 1. beforeunload - fires when user is leaving the page (navigation OR tab close)
    window.addEventListener('beforeunload', () => {
      sendSessionEnd('browser_close');
    });

    // 2. pagehide - more reliable than beforeunload on mobile and modern browsers
    window.addEventListener('pagehide', (e) => {
      // e.persisted indicates if page might be restored from bfcache
      if (!e.persisted) {
        sendSessionEnd('page_hide');
      }
    });

    // 3. visibilitychange - detect tab becoming hidden (might be closing)
    //    Only flush accumulated time; the unload handlers above will send the
    //    final beacon if the page is actually closing. This avoids duplicate
    //    beacons when visibilitychange fires right before beforeunload/pagehide.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        // Snapshot active time so it's included in the unload beacon if page closes,
        // but don't send a separate beacon here — let sendSessionEnd handle it.
        this.checkAndUpdateActiveTime();
      }
    });
  }

  // Public methods for updating session data
  updateSessionData(data) {
    this.sessionData = { ...this.sessionData, ...data };
  }

  incrementProblemsAttempted() {
    this.sessionData.problemsAttempted++;
  }

  incrementProblemsSolved() {
    this.sessionData.problemsSolved++;
  }

  incrementHintsUsed() {
    this.sessionData.hintsUsed++;
  }

  // Public method to trigger manual logout
  triggerLogout() {
    this.logout('manual');
  }
}

// Initialize session manager when DOM is ready
let sessionManager;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    sessionManager = new SessionManager();
    window.sessionManager = sessionManager; // Make globally accessible
  });
} else {
  sessionManager = new SessionManager();
  window.sessionManager = sessionManager;
}

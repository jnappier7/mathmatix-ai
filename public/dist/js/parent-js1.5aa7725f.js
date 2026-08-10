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
/* --- /js/parent-analytics.js --- */
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

    // Clear UI language cache so next user on shared device gets a clean state
    StorageUtils.local.removeItem('mathmatix_ui_lang');

    // Use the CSRF-exempt /api/session/end endpoint (sendBeacon can't send CSRF headers).
    // This endpoint destroys the express session on the server side.
    const payload = JSON.stringify({ reason: 'auto_logout', destroySession: true });
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon('/api/session/end', blob);
  }

  /**
   * Show inactivity warning
   */
  function showInactivityWarning() {
    if (warningShown) return;
    warningShown = true;

    const remainingTime = Math.ceil(WARNING_BEFORE_LOGOUT / 60000);
    const shouldStay = confirm(
      `⚠️ Inactivity Detected\n\n` +
      `You will be logged out in ${remainingTime} minutes due to inactivity.\n\n` +
      `Click OK to stay logged in, or Cancel to logout now.`
    );

    if (shouldStay) {
      // User wants to stay - reset timers
      lastActivityTime = Date.now();
      resetInactivityTimer();
      warningShown = false;
    } else {
      // User chose to logout
      performLogout();
      window.location.href = '/login.html';
    }
  }

  /**
   * Reset inactivity timer
   */
  function resetInactivityTimer() {
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
      performLogout();
      alert('You have been logged out due to inactivity.');
      window.location.href = '/login.html';
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
            performLogout();
            alert('You have been logged out due to inactivity.');
            window.location.href = '/login.html';
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
/* --- /js/avatarFullBody.js --- */
// public/js/avatarFullBody.js
// Shared FULL-BODY student avatar renderer — global (window.AvatarFullBody) so it
// works on ES-module pages (chat) and classic inline-script pages (progress,
// parent dashboard) alike.
//
// Full-body art lives at /images/students/<color>.png and is selected via
// user.selectedAvatarId === 'student.<color>' (the 8 preset characters). DiceBear
// is retired: only these presets have a full body, so a student without one is
// prompted to choose a character.
//
// Portrait resolution (small circular avatars) still lives in
// modules/avatarResolver.js; this module is only for the big full-body render.
(function (global) {
  'use strict';

  var PREFIX = 'student.';

  function esc(s) {
    var el = document.createElement('span');
    el.textContent = s == null ? '' : String(s);
    return el.innerHTML;
  }

  function isFullBodyId(id) {
    return typeof id === 'string' && id.indexOf(PREFIX) === 0;
  }

  // The full-body PNG url for a user/child object, or null if they haven't
  // chosen a full-body character. Prefers the catalog image path when the
  // catalog is loaded (chat/picker pages); otherwise derives it from the id so
  // it still works on pages that don't ship AVATAR_CONFIG (progress/parent).
  function resolveUrl(user) {
    if (!user) return null;
    var id = user.selectedAvatarId;
    if (!isFullBodyId(id)) return null;
    var cfg = (global.AVATAR_CONFIG || {})[id];
    if (cfg && cfg.image) return cfg.image;
    return '/images/students/' + id.slice(PREFIX.length) + '.png';
  }

  function hasFullBody(user) {
    return !!resolveUrl(user);
  }

  // Markup for a full-body avatar "stage". Options:
  //   size:    'sm' | 'md' | 'lg'      (default 'md')
  //   pickHref: where the choose-CTA links (default '/pick-avatar.html')
  //   readOnly: true → no CTA when empty (e.g. a parent viewing their child);
  //             shows a neutral placeholder + optional emptyLabel instead.
  //   emptyLabel: text under the empty placeholder (default varies by mode)
  function html(user, opts) {
    opts = opts || {};
    var size = opts.size || 'md';
    var url = resolveUrl(user);
    var name = (user && user.firstName) || '';

    if (url) {
      return '' +
        '<div class="fba fba-' + esc(size) + '">' +
          '<div class="fba-stage">' +
            '<img class="fba-img" src="' + esc(url) + '" alt="' + esc(name) + (name ? "'s" : '') + ' character" loading="lazy" />' +
            '<div class="fba-shadow" aria-hidden="true"></div>' +
          '</div>' +
        '</div>';
    }

    if (opts.readOnly) {
      var roLabel = opts.emptyLabel || 'No character chosen yet';
      return '' +
        '<div class="fba fba-' + esc(size) + ' fba-empty">' +
          '<div class="fba-stage">' +
            '<span class="fba-empty-icon" aria-hidden="true">🧍</span>' +
            '<div class="fba-shadow" aria-hidden="true"></div>' +
          '</div>' +
          '<div class="fba-empty-label">' + esc(roLabel) + '</div>' +
        '</div>';
    }

    var label = opts.emptyLabel || 'Choose your character';
    var href = opts.pickHref || '/pick-avatar.html';
    return '' +
      '<a class="fba fba-' + esc(size) + ' fba-choose" href="' + esc(href) + '">' +
        '<div class="fba-stage">' +
          '<span class="fba-empty-icon" aria-hidden="true">🧍</span>' +
          '<div class="fba-shadow" aria-hidden="true"></div>' +
        '</div>' +
        '<div class="fba-choose-label">' + esc(label) + '</div>' +
      '</a>';
  }

  global.AvatarFullBody = {
    isFullBodyId: isFullBodyId,
    resolveUrl: resolveUrl,
    hasFullBody: hasFullBody,
    html: html,
  };
})(window);

;
/* --- /js/parent-dashboard.js --- */
// public/js/parent-dashboard.js
// 3x Better: Toast system, parallel loading, skill mastery ring, weekly summary,
// growth sparkline, copy-to-clipboard, skeleton loading, accessibility improvements.

document.addEventListener("DOMContentLoaded", async () => {

    // ============================================
    // UPGRADE / TRIAL PROMPT
    // Deep-linked from the "your child hit their free limit" email
    // (parent-dashboard.html?upgrade=1). Gives the parent — the card holder —
    // a one-click way to start the child's 7-day Mathmatix+ trial.
    // ============================================
    (function initParentUpgradePrompt() {
        const params = new URLSearchParams(window.location.search);

        async function startTrial(btn) {
            if (btn) { btn.disabled = true; btn.textContent = 'Starting…'; }
            try {
                const res = await csrfFetch('/api/billing/create-checkout-session', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pack: 'unlimited', trial: true }), credentials: 'include'
                });
                const data = await res.json();
                if (data && data.url) { window.location.href = data.url; return; }
                throw new Error((data && data.message) || 'checkout failed');
            } catch (e) {
                if (typeof showToast === 'function') showToast('Could not start checkout. Please try again.', 'error');
                if (btn) { btn.disabled = false; btn.textContent = 'Start 7-day free trial'; }
            }
        }

        function openUpgrade() {
            if (document.getElementById('parent-upgrade-modal')) return;
            const modal = document.createElement('div');
            modal.id = 'parent-upgrade-modal';
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10000;';
            modal.innerHTML = `
                <div style="background:#fff;border-radius:16px;padding:32px;max-width:420px;width:92%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                    <h2 style="margin:0 0 8px;color:#0d9488;">Unlock unlimited tutoring</h2>
                    <p style="color:#555;margin:0 0 16px;line-height:1.5;">Give your child unlimited 24/7 AI tutoring, voice sessions, and homework help. Free for 7 days, then $9.95/month. Cancel anytime.</p>
                    <button id="parent-start-trial" style="background:#0d9488;color:#fff;border:none;padding:14px 28px;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;width:100%;">Start 7-day free trial</button>
                    <button id="parent-upgrade-close" style="background:transparent;color:#888;border:none;padding:10px;cursor:pointer;font-size:13px;width:100%;margin-top:8px;">Maybe later</button>
                    <div style="color:#999;font-size:12px;margin-top:10px;">Card required. We'll remind you before the trial ends — no surprise charges.</div>
                </div>`;
            document.body.appendChild(modal);
            document.getElementById('parent-start-trial').addEventListener('click', (e) => startTrial(e.currentTarget));
            const close = () => modal.remove();
            document.getElementById('parent-upgrade-close').addEventListener('click', close);
            modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
        }

        // Auto-open when the parent arrives from the email deep link.
        if (params.get('upgrade') === '1') openUpgrade();
        // Expose a hook so any "Upgrade" button on the page can reuse it.
        window.openParentUpgrade = openUpgrade;
    })();

    // ============================================
    // TRANSLATION LOOKUP
    // For strings this file injects at runtime. The static markup carries
    // data-i18n attributes, but anything written here lands after apply() has
    // already run — and several of these overwrite a tagged element, so without
    // the lookup they quietly revert a translated page to English.
    // Falls back to the English literal: a missing key must never blank the UI.
    // ============================================

    function t(key, fallback) {
        const translated = window.MathmatixI18n && window.MathmatixI18n.t(key);
        return translated || fallback;
    }

    // Built as a node rather than an HTML string: these are translated strings,
    // and apostrophes/ampersands in them have no business being parsed as markup.
    function setChatPlaceholder(key, fallback) {
        if (!parentChatContainer) return;
        const p = document.createElement('p');
        p.className = 'text-gray-500 text-center py-2';
        p.textContent = t(key, fallback);
        parentChatContainer.replaceChildren(p);
    }

    // ============================================
    // TOAST NOTIFICATION SYSTEM
    // ============================================

    function showToast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `
            <i class="fas ${icons[type] || icons.info} toast-icon"></i>
            <span>${message}</span>
            <button class="toast-close" aria-label="Dismiss notification">&times;</button>
        `;

        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 300);
        });

        container.appendChild(toast);

        if (duration > 0) {
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.classList.add('toast-exit');
                    setTimeout(() => toast.remove(), 300);
                }
            }, duration);
        }
    }

    // ============================================
    // COPY TO CLIPBOARD
    // ============================================

    function setupCopyButtons() {
        const copyBtn = document.getElementById('copy-code-btn');
        const mobileCopyBtn = document.getElementById('mobile-copy-code-btn');

        function handleCopy(btn) {
            if (!btn) return;
            btn.addEventListener('click', async () => {
                const codeEl = document.getElementById('generated-code-value');
                const code = codeEl ? codeEl.textContent.trim() : '';
                if (!code) return;

                try {
                    await navigator.clipboard.writeText(code);
                    btn.classList.add('copied');
                    const originalHTML = btn.innerHTML;
                    btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    showToast('Invite code copied to clipboard!', 'success', 3500);
                    setTimeout(() => {
                        btn.classList.remove('copied');
                        btn.innerHTML = originalHTML;
                    }, 3500);
                } catch (err) {
                    // Fallback for older browsers
                    const textArea = document.createElement('textarea');
                    textArea.value = code;
                    textArea.style.position = 'fixed';
                    textArea.style.opacity = '0';
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    btn.classList.add('copied');
                    const originalHTML = btn.innerHTML;
                    btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    showToast('Invite code copied!', 'success', 3500);
                    setTimeout(() => {
                        btn.classList.remove('copied');
                        btn.innerHTML = originalHTML;
                    }, 3500);
                }
            });
        }

        handleCopy(copyBtn);
        handleCopy(mobileCopyBtn);
    }

    // ============================================
    // SKELETON LOADING
    // ============================================

    function showChildrenSkeleton() {
        if (!childrenListContainer) return;
        childrenListContainer.innerHTML = `
            <div class="skeleton skeleton-card" style="height: 200px; margin-bottom: 15px;"></div>
            <div class="skeleton skeleton-card" style="height: 200px; margin-bottom: 15px;"></div>
        `;
    }

    function hideChildrenSkeleton() {
        const skeletons = childrenListContainer?.querySelectorAll('.skeleton');
        if (skeletons) skeletons.forEach(s => s.remove());
    }

    // ============================================
    // SVG SKILL MASTERY RING
    // ============================================

    function buildSkillMasteryRing(skillsSummary) {
        const mastered = skillsSummary?.mastered || 0;
        const learning = skillsSummary?.learning || 0;
        const needsReview = skillsSummary?.needsReview || 0;
        const total = mastered + learning + needsReview;

        if (total === 0) return '';

        const radius = 32;
        const circumference = 2 * Math.PI * radius;

        // Calculate stroke segments
        const masteredPct = mastered / total;
        const learningPct = learning / total;
        const reviewPct = needsReview / total;

        const masteredLen = masteredPct * circumference;
        const learningLen = learningPct * circumference;
        const reviewLen = reviewPct * circumference;

        const masteredOffset = 0;
        const learningOffset = masteredLen;
        const reviewOffset = masteredLen + learningLen;

        return `
            <div class="skill-mastery-container">
                <div class="skill-ring-wrapper">
                    <svg viewBox="0 0 80 80" width="80" height="80">
                        <!-- Background circle -->
                        <circle cx="40" cy="40" r="${radius}" fill="none" stroke="#e9ecef" stroke-width="8"/>
                        ${mastered > 0 ? `<circle cx="40" cy="40" r="${radius}" fill="none" stroke="#27ae60" stroke-width="8"
                            stroke-dasharray="${masteredLen} ${circumference - masteredLen}"
                            stroke-dashoffset="${-masteredOffset}"
                            transform="rotate(-90 40 40)" stroke-linecap="round"/>` : ''}
                        ${learning > 0 ? `<circle cx="40" cy="40" r="${radius}" fill="none" stroke="#3498db" stroke-width="8"
                            stroke-dasharray="${learningLen} ${circumference - learningLen}"
                            stroke-dashoffset="${-learningOffset}"
                            transform="rotate(-90 40 40)" stroke-linecap="round"/>` : ''}
                        ${needsReview > 0 ? `<circle cx="40" cy="40" r="${radius}" fill="none" stroke="#f39c12" stroke-width="8"
                            stroke-dasharray="${reviewLen} ${circumference - reviewLen}"
                            stroke-dashoffset="${-reviewOffset}"
                            transform="rotate(-90 40 40)" stroke-linecap="round"/>` : ''}
                    </svg>
                    <div class="skill-ring-center">
                        <div class="skill-ring-number">${total}</div>
                        <div class="skill-ring-label">skills</div>
                    </div>
                </div>
                <div class="skill-legend">
                    <div class="skill-legend-item">
                        <span class="skill-legend-dot" style="background: #27ae60;"></span>
                        <span>${mastered} mastered</span>
                    </div>
                    <div class="skill-legend-item">
                        <span class="skill-legend-dot" style="background: #3498db;"></span>
                        <span>${learning} learning</span>
                    </div>
                    <div class="skill-legend-item">
                        <span class="skill-legend-dot" style="background: #f39c12;"></span>
                        <span>${needsReview} needs review</span>
                    </div>
                </div>
            </div>
        `;
    }

    // ============================================
    // WEEKLY SUMMARY CARD
    // ============================================

    function buildWeeklySummary(weeklyStats) {
        if (!weeklyStats) return '';
        const accuracy = weeklyStats.accuracy || 0;
        const problems = weeklyStats.problemsAttempted || 0;
        const minutes = weeklyStats.activeMinutes || 0;
        const sessions = weeklyStats.sessionCount || 0;

        // Don't show if no activity
        if (problems === 0 && minutes === 0 && sessions === 0) {
            return `
                <div class="weekly-summary" style="justify-content: center;">
                    <div style="grid-column: 1 / -1; text-align: center; color: var(--color-text-muted); font-size: 0.85em; padding: 8px;">
                        <i class="fas fa-calendar-week"></i> No activity this week yet
                    </div>
                </div>
            `;
        }

        return `
            <div class="weekly-summary" role="region" aria-label="This week's summary">
                <div class="weekly-stat">
                    <div class="weekly-stat-value">${sessions}</div>
                    <div class="weekly-stat-label">Sessions</div>
                </div>
                <div class="weekly-stat">
                    <div class="weekly-stat-value">${problems}</div>
                    <div class="weekly-stat-label">Problems</div>
                </div>
                <div class="weekly-stat">
                    <div class="weekly-stat-value">${accuracy}%</div>
                    <div class="weekly-stat-label">Accuracy</div>
                </div>
                <div class="weekly-stat">
                    <div class="weekly-stat-value">${Math.round(minutes)}</div>
                    <div class="weekly-stat-label">Minutes</div>
                </div>
            </div>
        `;
    }

    // ============================================
    // GROWTH TREND SPARKLINE
    // ============================================

    function buildGrowthSparkline(growthData) {
        if (!growthData || !growthData.history || growthData.history.length < 2) return '';

        const history = growthData.history;
        const totalGrowth = growthData.totalGrowth || 0;
        const isPositive = totalGrowth >= 0;

        // Build SVG sparkline
        const width = 260;
        const height = 40;
        const padding = 4;

        // Extract theta values (cumulative)
        let runningTheta = 0;
        const points = history.map((h, i) => {
            runningTheta += (h.thetaChange || 0);
            return runningTheta;
        });

        const minVal = Math.min(...points);
        const maxVal = Math.max(...points);
        const range = maxVal - minVal || 1;

        const coords = points.map((val, i) => {
            const x = padding + (i / (points.length - 1)) * (width - 2 * padding);
            const y = height - padding - ((val - minVal) / range) * (height - 2 * padding);
            return `${x},${y}`;
        });

        const polyline = coords.join(' ');
        const strokeColor = isPositive ? '#27ae60' : '#e74c3c';
        const fillColor = isPositive ? 'rgba(39,174,96,0.1)' : 'rgba(231,76,60,0.1)';

        // Create fill polygon (area under curve)
        const firstX = padding;
        const lastX = padding + (width - 2 * padding);
        const fillPoints = `${firstX},${height} ${polyline} ${lastX},${height}`;

        const badgeColor = isPositive ? 'background: #d5f5e3; color: #1e8449;' : 'background: #fadbd8; color: #c0392b;';
        const badgeText = isPositive
            ? `<i class="fas fa-arrow-up"></i> +${Math.abs(totalGrowth).toFixed(2)}`
            : `<i class="fas fa-arrow-down"></i> ${totalGrowth.toFixed(2)}`;

        return `
            <div class="growth-sparkline-container">
                <div class="growth-sparkline-header">
                    <span class="growth-sparkline-title"><i class="fas fa-chart-line"></i> Growth Trend</span>
                    <span class="growth-sparkline-badge" style="${badgeColor}">${badgeText}</span>
                </div>
                <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="none" aria-label="Growth trend chart showing ${history.length} data points">
                    <polygon points="${fillPoints}" fill="${fillColor}"/>
                    <polyline points="${polyline}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
                    <!-- Latest point dot -->
                    <circle cx="${coords[coords.length - 1].split(',')[0]}" cy="${coords[coords.length - 1].split(',')[1]}" r="3" fill="${strokeColor}"/>
                </svg>
                <div style="font-size: 0.72em; color: var(--color-text-muted); margin-top: 4px;">
                    ${history.length} growth check${history.length !== 1 ? 's' : ''} completed
                </div>
            </div>
        `;
    }

    // --- Dashboard Elements ---
    const childrenListContainer = document.getElementById("children-list-container");
    const loadingChildren = document.getElementById("loading-children");
    const generateCodeBtn = document.getElementById("generate-code-btn");
    const inviteCodeOutput = document.getElementById("invite-code-output");
    const generatedCodeValue = document.getElementById("generated-code-value");
    const codeExpiresAt = document.getElementById("code-expires-at");
    const linkStudentForm = document.getElementById("link-student-form");
    const studentLinkCodeInput = document.getElementById("studentLinkCode");
    const linkStudentMessage = document.getElementById("link-student-message");

    // --- Parent Settings Elements ---
    const parentSettingsForm = document.getElementById("parent-settings-form");
    const settingsSaveMessage = document.getElementById("settings-save-message");

    // --- Parent Chat Widget Elements ---
    const childSelector = document.getElementById("childSelector");
    const parentChatContainer = document.getElementById("parent-chat-container-inner");
    const parentUserInput = document.getElementById("parent-user-input");
    const parentSendButton = document.getElementById("parent-send-button");
    const parentThinkingIndicator = document.getElementById("parent-thinking-indicator");

    let children = []; // Stores linked children data
    let selectedChild = null; // Stores the currently selected child for chat
    let currentParentId = null; // Store the parent's ID

    const PARENT_CHAT_MAX_MESSAGE_LENGTH = 1800;

    // Tutor configuration (simplified for parent dashboard)
    const TUTOR_CONFIG = {
        "bob": { name: "Bob", image: "bob.png" },
        "maya": { name: "Maya", image: "maya.png" },
        "ms-maria": { name: "Ms. Maria", image: "ms-maria.png" },
        "mr-nappier": { name: "Mr. Nappier", image: "mr-nappier.png" },
        "ms-rashida": { name: "Ms. Rashida", image: "ms-rashida.png" },
        "prof-davies": { name: "Prof. Davies", image: "prof-davies.png" },
        "ms-alex": { name: "Ms. Alex", image: "ms-alex.png" },
        "mr-lee": { name: "Mr. Lee", image: "mr-lee.png" },
        "dr-g": { name: "Dr. G", image: "dr-g.png" },
        "default": { name: "Math Tutor", image: "default-tutor.png" }
    };

    // --- Authenticate and Load Parent User Data ---
    async function loadParentUser() {
        try {
            const res = await fetch("/user", { credentials: 'include' });
            if (!res.ok) {
                showToast("Session expired. Please log in again.", "warning");
                setTimeout(() => { window.location.href = "/login.html"; }, 1500);
                return null;
            }
            const data = await res.json();
            currentParentId = data.user._id;
            return data.user;
        } catch (error) {
            console.error("ERROR: Failed to load parent user data:", error);
            showToast("Could not load session. Redirecting to login...", "error");
            setTimeout(() => { window.location.href = "/login.html"; }, 1500);
            return null;
        }
    }

    // Current tutor info for chat bubbles
    let currentTutorInfo = { name: 'Math Tutor', image: 'default-tutor.png' };

    // --- Markdown rendering for AI messages (matches main chat) ---
    function renderParentMarkdown(text) {
        if (typeof marked === 'undefined' || !marked.parse) {
            // Fallback: escape HTML
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Protect LaTeX blocks from markdown parsing
        const blocks = [];
        let processed = text
            .replace(/\\\[([\s\S]*?)\\\]/g, (m) => { blocks.push(m); return `@@LB${blocks.length - 1}@@`; })
            .replace(/\\\(([\s\S]*?)\\\)/g, (m) => { blocks.push(m); return `@@LB${blocks.length - 1}@@`; });

        let html = marked.parse(processed, { breaks: true });

        // Restore LaTeX blocks
        blocks.forEach((b, i) => { html = html.replace(`@@LB${i}@@`, b); });

        // Sanitize
        if (typeof DOMPurify !== 'undefined') {
            html = DOMPurify.sanitize(html, {
                ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'code', 'pre', 'ul', 'ol', 'li',
                               'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'span', 'div', 'blockquote'],
                ALLOWED_ATTR: ['href', 'class', 'target', 'rel', 'style']
            });
        }

        return html;
    }

    // --- MathJax rendering helper ---
    function renderParentMath(element) {
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([element]).catch(() => {});
        } else if (window.ensureMathJax) {
            window.ensureMathJax().then(() => {
                if (window.MathJax && window.MathJax.typesetPromise) {
                    window.MathJax.typesetPromise([element]).catch(() => {});
                }
            });
        }
    }

    // --- Helper for appending messages to parent chat widget ---
    function appendParentMessage(sender, text, tutorInfo = null) {
        // Update tutor info if provided
        if (tutorInfo && tutorInfo.tutorName) {
            currentTutorInfo = { name: tutorInfo.tutorName, image: tutorInfo.tutorImage || 'default-tutor.png' };
        }

        const container = document.createElement("div");
        container.className = `message-container ${sender}`;

        if (sender === 'user') {
            container.setAttribute('aria-label', 'Your message');
        } else {
            container.setAttribute('aria-label', `Message from ${currentTutorInfo.name}`);
        }

        // Create avatar for AI messages
        if (sender === 'ai') {
            const avatar = document.createElement("div");
            avatar.className = 'message-avatar';

            const avatarImg = document.createElement("img");
            avatarImg.src = `/images/tutor_avatars/${currentTutorInfo.image}`;
            avatarImg.alt = currentTutorInfo.name;
            avatarImg.loading = 'lazy';
            avatarImg.onerror = () => { avatarImg.src = '/images/tutor_avatars/default-tutor.png'; };

            avatar.appendChild(avatarImg);
            container.appendChild(avatar);
        }

        const msg = document.createElement("div");
        msg.className = `message ${sender} message-widget`;

        // Render content: markdown + math for AI, plain text for user
        if (sender === 'ai') {
            msg.innerHTML = renderParentMarkdown(text);
        } else {
            msg.textContent = text;
        }

        container.appendChild(msg);

        parentChatContainer.appendChild(container);
        parentChatContainer.scrollTop = parentChatContainer.scrollHeight;

        // Render math in AI messages
        if (sender === 'ai') {
            setTimeout(() => renderParentMath(msg), 0);
        }
    }

    // --- Update Tutor Avatar Display ---
    function updateTutorAvatar(child) {
        const tutorAvatarContainer = document.getElementById('tutor-avatar-container');
        const tutorAvatarImg = document.getElementById('tutor-avatar-img');
        const tutorNameDisplay = document.getElementById('tutor-name');

        if (!child || !child.selectedTutorId) {
            // Reset to default tutor
            currentTutorInfo = { name: 'Math Tutor', image: 'default-tutor.png' };
            if (tutorAvatarContainer) tutorAvatarContainer.style.display = 'none';
            return;
        }

        const tutorId = child.selectedTutorId;
        const tutor = TUTOR_CONFIG[tutorId] || TUTOR_CONFIG['default'];

        // Update current tutor info for chat bubbles
        currentTutorInfo = { name: tutor.name, image: tutor.image };

        if (tutorAvatarImg) {
            tutorAvatarImg.src = `/images/tutor_avatars/${tutor.image}`;
            tutorAvatarImg.alt = tutor.name;
        }
        if (tutorNameDisplay) tutorNameDisplay.textContent = tutor.name;
        if (tutorAvatarContainer) tutorAvatarContainer.style.display = 'block';
    }

    // --- Load children with PARALLEL progress fetching ---
    async function loadChildren() {
        if (loadingChildren) loadingChildren.style.display = 'block';
        showChildrenSkeleton();
        if (childSelector) childSelector.innerHTML = '<option value="">Select Child</option>';

        try {
            // Step 1: Fetch the list of linked children
            const childrenRes = await fetch("/api/parent/children", { credentials: 'include' });
            if (!childrenRes.ok) {
                if (childrenRes.status === 401 || childrenRes.status === 403) {
                    window.location.href = "/login.html";
                }
                throw new Error(`HTTP error! status: ${childrenRes.status}`);
            }
            const fetchedChildren = await childrenRes.json();
            children = fetchedChildren;

            if (loadingChildren) loadingChildren.style.display = 'none';

            if (children.length === 0) {
                childrenListContainer.innerHTML = `
                    <div style="text-align: center; padding: 40px 20px;">
                        <i class="fas fa-users" style="font-size: 3em; color: var(--color-primary-bg, #d6eaf8); margin-bottom: 16px; display: block;"></i>
                        <h3 style="font-size: 1.1em; color: var(--color-text, #2c3e50); margin-bottom: 8px;">No children linked yet</h3>
                        <p style="color: var(--color-text-muted, #7f8c8d); font-size: 0.9em; margin-bottom: 20px; max-width: 300px; margin-left: auto; margin-right: auto;">
                            Generate an invite code or enter your child's link code to get started.
                        </p>
                        <button class="btn btn-primary" onclick="document.getElementById('generate-code-btn')?.click()">
                            <i class="fas fa-plus"></i> Generate Invite Code
                        </button>
                    </div>`;
                if (childSelector) childSelector.disabled = true;
                if (parentUserInput) parentUserInput.disabled = true;
                if (parentSendButton) parentSendButton.disabled = true;
                return;
            }

            // Step 2: Populate dropdown
            children.forEach((child, i) => {
                const option = document.createElement('option');
                option.value = child._id;
                option.textContent = `${child.firstName} ${child.lastName}`;
                childSelector.appendChild(option);
                if (i === 0) {
                    selectedChild = child;
                    childSelector.value = child._id;
                    updateTutorAvatar(selectedChild);
                }
            });

            if (childSelector) childSelector.disabled = false;
            if (parentUserInput) parentUserInput.disabled = false;
            if (parentSendButton) parentSendButton.disabled = false;
            setChatPlaceholder('parent.askAboutProgress', 'Select a child and ask a question about their progress.');

            // Step 3: PARALLEL fetch — progress + growth for all children at once
            childrenListContainer.innerHTML = '';

            const progressPromises = children.map(async (child) => {
                try {
                    // Fetch progress and growth data in parallel per child
                    const [progressRes, growthRes] = await Promise.all([
                        fetch(`/api/parent/child/${child._id}/progress`, { credentials: 'include' }),
                        fetch(`/api/parent/child/${child._id}/growth-history`, { credentials: 'include' })
                    ]);

                    const progress = progressRes.ok ? await progressRes.json() : null;
                    const growthData = growthRes.ok ? await growthRes.json() : null;

                    return { child, progress, growthData, error: progress ? null : 'Failed to load' };
                } catch (err) {
                    console.error(`Could not fetch data for child ${child._id}:`, err);
                    return { child, progress: null, growthData: null, error: err.message };
                }
            });

            const results = await Promise.all(progressPromises);

            // Render all cards in order
            results.forEach(({ child, progress, growthData, error }) => {
                if (progress) {
                    renderChildCard(progress, growthData);
                } else {
                    const errorCard = document.createElement('div');
                    errorCard.className = 'child-card';
                    errorCard.innerHTML = `
                        <h3>${child.firstName} ${child.lastName}</h3>
                        <p style="color: var(--color-danger); font-size: 0.9em;">
                            <i class="fas fa-exclamation-triangle"></i> Could not load progress data.
                            <button class="btn btn-tertiary" style="margin-top: 8px; font-size: 0.85em;" onclick="location.reload()">
                                <i class="fas fa-redo"></i> Retry
                            </button>
                        </p>
                    `;
                    childrenListContainer.appendChild(errorCard);
                }
            });

        } catch (error) {
            console.error("Parent dashboard error fetching children list:", error);
            if (loadingChildren) loadingChildren.style.display = 'none';
            childrenListContainer.innerHTML = `
                <div style="text-align: center; padding: 20px; color: var(--color-danger);">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2em; margin-bottom: 10px; display: block;"></i>
                    <p>Failed to load children data.</p>
                    <button class="btn btn-primary" style="margin-top: 12px;" onclick="location.reload()">
                        <i class="fas fa-redo"></i> Refresh Page
                    </button>
                </div>
            `;
        }
    }

    function renderChildCard(progress, growthData) {
        const card = document.createElement('div');
        card.className = 'child-card';
        card.dataset.childId = progress._id;

        // Build IEP accommodations display
        let accommodationsHTML = '';
        if (progress.iepPlan && progress.iepPlan.accommodations) {
            const accom = progress.iepPlan.accommodations;
            const activeAccommodations = [];

            if (accom.extendedTime) activeAccommodations.push('Extended Time');
            if (accom.reducedDistraction) activeAccommodations.push('Reduced Distraction');
            if (accom.calculatorAllowed) activeAccommodations.push('Calculator Allowed');
            if (accom.audioReadAloud) activeAccommodations.push('Audio Read-Aloud');
            if (accom.chunkedAssignments) activeAccommodations.push('Chunked Assignments');
            if (accom.breaksAsNeeded) activeAccommodations.push('Breaks as Needed');
            if (accom.digitalMultiplicationChart) activeAccommodations.push('Digital Multiplication Chart');
            if (accom.largePrintHighContrast) activeAccommodations.push('Large Print/High Contrast');
            if (accom.mathAnxietySupport) activeAccommodations.push('Math Anxiety Support');
            if (accom.custom && accom.custom.length > 0) {
                activeAccommodations.push(...accom.custom);
            }

            if (activeAccommodations.length > 0) {
                accommodationsHTML = `
                    <div class="iep-accommodations" style="margin-top: 12px;">
                        <strong><i class="fas fa-universal-access"></i> Active Accommodations:</strong>
                        <ul style="margin: 8px 0; padding-left: 20px; font-size: 0.9em;">
                            ${activeAccommodations.map(a => `<li>${a}</li>`).join('')}
                        </ul>
                    </div>
                `;
            }
        }

        // Build IEP goals display with progress timeline
        let goalsHTML = '';
        if (progress.iepPlan && progress.iepPlan.goals && progress.iepPlan.goals.length > 0) {
            goalsHTML = `
                <div class="iep-goals" style="margin-top: 12px;">
                    <strong><i class="fas fa-bullseye"></i> IEP Goals:</strong>
                    <div style="margin-top: 8px;">
                        ${progress.iepPlan.goals.map(goal => {
                            const statusColor = goal.status === 'completed' ? 'var(--color-success)' :
                                              goal.status === 'on-hold' ? 'var(--color-warning-dark)' : 'var(--color-primary)';
                            const progressPercent = goal.currentProgress || 0;

                            // Calculate trend from history
                            const progressHistory = (goal.history || []).filter(h => h.field === 'currentProgress');
                            const recentUpdates = progressHistory.filter(h => {
                                const d = new Date(h.date);
                                const twoWeeksAgo = new Date();
                                twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
                                return d >= twoWeeksAgo;
                            });
                            const recentGain = recentUpdates.reduce((sum, h) => sum + ((h.to || 0) - (h.from || 0)), 0);

                            let trendIcon = '';
                            let trendText = '';
                            if (recentUpdates.length > 0) {
                                if (recentGain > 0) {
                                    trendIcon = '<i class="fas fa-arrow-up" style="color: var(--color-success);"></i>';
                                    trendText = `+${recentGain}% in the last 2 weeks (${recentUpdates.length} update${recentUpdates.length !== 1 ? 's' : ''})`;
                                } else {
                                    trendIcon = '<i class="fas fa-minus" style="color: var(--color-warning-dark);"></i>';
                                    trendText = `No change in the last 2 weeks`;
                                }
                            } else if (progressHistory.length > 0) {
                                trendText = `${progressHistory.length} total AI-tracked update${progressHistory.length !== 1 ? 's' : ''}`;
                            } else {
                                trendText = 'AI tracking will begin as your child works on this skill';
                            }

                            // Days remaining
                            let deadlineNote = '';
                            if (goal.targetDate && goal.status === 'active') {
                                const daysLeft = Math.ceil((new Date(goal.targetDate) - new Date()) / (1000*60*60*24));
                                if (daysLeft < 0) deadlineNote = `<span style="color: var(--color-danger); font-weight:600;">${Math.abs(daysLeft)} days past target</span>`;
                                else if (daysLeft <= 14) deadlineNote = `<span style="color: var(--color-warning-dark);">${daysLeft} days remaining</span>`;
                            }

                            const statusIcon = goal.status === 'completed' ? 'fa-check-circle' :
                                             goal.status === 'on-hold' ? 'fa-pause-circle' : 'fa-spinner';

                            return `
                                <div style="margin-bottom: 12px; padding: 12px; background: var(--color-bg); border-left: 4px solid ${statusColor}; border-radius: var(--radius-sm);">
                                    <div style="font-weight: 600; margin-bottom: 4px;">${goal.description}</div>
                                    <div style="font-size: 0.85em; color: var(--color-text-secondary); display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                                        <span><i class="fas ${statusIcon}" style="color:${statusColor};"></i> <strong style="color:${statusColor}; text-transform:capitalize;">${goal.status}</strong></span>
                                        <span>Progress: <strong>${progressPercent}%</strong></span>
                                        ${goal.targetDate ? `<span>Target: <strong>${new Date(goal.targetDate).toLocaleDateString()}</strong></span>` : ''}
                                        ${deadlineNote}
                                    </div>
                                    <div style="width: 100%; height: 8px; background: var(--color-border); border-radius: 4px; margin-top: 8px; overflow: hidden;">
                                        <div style="width: ${progressPercent}%; height: 100%; background: ${statusColor}; transition: width 0.5s; border-radius: 4px;"></div>
                                    </div>
                                    <div style="font-size: 0.8em; color: var(--color-text-muted); margin-top: 6px; display:flex; align-items:center; gap:4px;">
                                        ${trendIcon} ${trendText}
                                    </div>
                                    ${goal.measurementMethod ? `<div style="font-size: 0.75em; color: var(--color-text-disabled); margin-top: 3px;">Measured by: ${goal.measurementMethod}</div>` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        // Build weekly summary
        const weeklySummaryHTML = buildWeeklySummary(progress.weeklyStats);

        // Build skill mastery ring
        const skillRingHTML = buildSkillMasteryRing(progress.skillsSummary);

        // Build growth sparkline
        const growthSparklineHTML = growthData ? buildGrowthSparkline(growthData) : '';

        // Build sessions
        const sessionsHTML = progress.recentSessions && progress.recentSessions.length > 0 ? progress.recentSessions
            .filter(s => {
                if (!s.date) return false;
                if (!s.summary) return false;
                if (s.summary.includes('--- End Session Transcript ---') ||
                    s.summary.includes('Please provide a summary') ||
                    s.summary.includes('**Concise (1-3 paragraphs)**')) {
                    return false;
                }
                return true;
            })
            .map(s => {
                const sessionDate = new Date(s.date);
                const dateStr = isNaN(sessionDate.getTime()) ? 'Unknown date' : sessionDate.toLocaleDateString();
                const isLive = s.isActive;
                const liveBadge = isLive ? '<span class="live-badge"><span class="live-badge-dot"></span> LIVE</span>' : '';
                const entryClass = isLive ? 'session-entry live-session' : 'session-entry';
                return `
                    <div class="${entryClass}">
                        ${liveBadge}<strong>${dateStr}:</strong> ${s.summary} <em>(${s.duration ? s.duration.toFixed(0) : 'N/A'} min)</em>
                    </div>
                `;
            }).join('') || '<p style="color: var(--color-text-muted); font-size: 0.85em;">No recent sessions with summaries.</p>'
        : '<p style="color: var(--color-text-muted); font-size: 0.85em;">No recent sessions with summaries.</p>';

        const childAvatarHtml = window.AvatarFullBody
            ? `<div class="child-avatar-fb">${window.AvatarFullBody.html(progress, { size: 'sm', readOnly: true, emptyLabel: 'No character yet' })}</div>`
            : '';

        card.innerHTML = `
            <div class="child-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    ${childAvatarHtml}
                    <div>
                        <h3>${progress.firstName || 'Unknown'} ${progress.lastName || 'Child'}</h3>
                        <span style="font-size: 0.85em; color: var(--color-text-secondary);">Level ${progress.level || '1'} — ${progress.xp || '0'} XP</span>
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="learning-report-btn btn" data-childid="${progress._id}" data-childname="${progress.firstName || 'Child'}" title="View ${progress.firstName || 'your child'}'s learning report" aria-label="View learning report for ${progress.firstName || 'child'}" style="background: var(--color-primary); color: white; font-size: 0.85em; padding: 8px 14px;">
                        <i class="fas fa-chart-line"></i> Report
                    </button>
                    <button class="view-as-child-btn btn" data-childid="${progress._id}" data-childname="${progress.firstName || 'Child'}" title="See what ${progress.firstName || 'your child'} sees" aria-label="View dashboard as ${progress.firstName || 'child'}" style="background: var(--color-purple); color: white; font-size: 0.85em; padding: 8px 14px;">
                        <i class="fas fa-eye"></i> View
                    </button>
                </div>
            </div>
            <div style="font-size: 0.85em; color: var(--color-text-muted); margin-bottom: 8px;">
                ${progress.gradeLevel || 'N/A'} · ${progress.mathCourse || 'N/A'} · ${progress.totalActiveTutoringMinutes || '0'} min total
            </div>

            ${weeklySummaryHTML}
            ${skillRingHTML}
            ${growthSparklineHTML}

            <!-- Learning Analytics Section -->
            <div class="child-analytics-section" style="margin-top: 16px; padding: 14px; background: #f0f7ff; border-radius: 10px; border: 1px solid #d6eaf8;">
              <strong style="font-size: 0.9em; color: #21618c;"><i class="fas fa-brain"></i> Learning Analytics</strong>
              <div id="memory-health-${progress._id}" style="margin-top: 10px;"></div>
              <div style="margin-top: 12px;">
                <canvas id="strength-map-${progress._id}" style="max-height: 180px;"></canvas>
              </div>
            </div>

            <!-- Practice Pack for this child -->
            <details class="parent-practice-pack" id="practice-pack-${progress._id}">
              <summary>Print Practice Pack for ${progress.firstName || 'Child'}</summary>
              <div class="parent-pp-controls">
                <select class="pp-count-select" data-child-id="${progress._id}">
                  <option value="5">5 problems</option>
                  <option value="8" selected>8 problems</option>
                  <option value="12">12 problems</option>
                </select>
                <label style="font-size:0.85em;display:flex;align-items:center;gap:4px;cursor:pointer;">
                  <input type="checkbox" class="pp-answer-key-cb" data-child-id="${progress._id}" />
                  Answer key
                </label>
                <button class="btn btn-sm btn-primary pp-generate-btn" data-child-id="${progress._id}" data-child-name="${progress.firstName || 'Student'}">
                  🖨️ Print
                </button>
              </div>
              <div class="parent-pp-status" id="pp-status-${progress._id}"></div>
            </details>

            ${accommodationsHTML}
            ${goalsHTML}

            <div style="margin-top: 12px;">
                <strong style="font-size: 0.9em;"><i class="fas fa-history"></i> Recent Sessions:</strong>
                <div style="margin-top: 8px;">
                    ${sessionsHTML}
                </div>
            </div>
        `;
        childrenListContainer.appendChild(card);

        // Wire up Practice Pack generate button for this child
        const ppBtn = card.querySelector('.pp-generate-btn');
        if (ppBtn) {
            ppBtn.addEventListener('click', async (e) => {
                const childId = e.currentTarget.dataset.childId;
                const childName = e.currentTarget.dataset.childName;
                const countSelect = card.querySelector('.pp-count-select');
                const answerKeyCb = card.querySelector('.pp-answer-key-cb');
                const statusEl = document.getElementById(`pp-status-${childId}`);
                const count = parseInt(countSelect?.value) || 8;
                const answerKey = answerKeyCb?.checked || false;

                e.currentTarget.disabled = true;
                e.currentTarget.textContent = 'Generating...';
                if (statusEl) { statusEl.textContent = 'Creating personalized worksheet...'; statusEl.style.color = '#4a6cf7'; }

                try {
                    const params = new URLSearchParams({ childId, count });
                    if (answerKey) params.set('answerKey', 'true');
                    const resp = await fetch(`/api/practice-pack/generate-for-child?${params}`, { credentials: 'include' });
                    if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.error || 'Generation failed'); }
                    const blob = await resp.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `practice-pack-${childName}-${Date.now()}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    if (statusEl) { statusEl.textContent = 'PDF downloaded! Print it for ' + childName + '.'; statusEl.style.color = '#2e7d32'; }
                } catch (err) {
                    console.error('[PracticePack] Parent generation failed:', err);
                    if (statusEl) { statusEl.textContent = err.message || 'Something went wrong.'; statusEl.style.color = '#d32f2f'; }
                } finally {
                    e.currentTarget.disabled = false;
                    e.currentTarget.textContent = '🖨️ Print';
                }
            });
        }

        // Fetch and render learning analytics for this child
        if (window.AnalyticsCharts) {
            fetchChildAnalytics(progress._id);
        }

        // Add event listener for View as Child button
        const viewAsChildBtn = card.querySelector('.view-as-child-btn');
        if (viewAsChildBtn) {
            viewAsChildBtn.addEventListener('click', async (e) => {
                const childId = e.currentTarget.dataset.childid;
                const childName = e.currentTarget.dataset.childname;

                if (!confirm(`View the app as ${childName}?\n\nYou'll see exactly what your child sees.\nChanges are disabled in view mode.`)) {
                    return;
                }

                try {
                    viewAsChildBtn.disabled = true;
                    viewAsChildBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';

                    await window.ImpersonationBanner.start(childId, { readOnly: true });
                } catch (error) {
                    console.error('Failed to start child view:', error);
                    showToast(error.message || 'Failed to start child view. Please try again.', 'error');
                    viewAsChildBtn.disabled = false;
                    viewAsChildBtn.innerHTML = '<i class="fas fa-eye"></i> View';
                }
            });
        }

        // Add event listener for Learning Report button
        const reportBtn = card.querySelector('.learning-report-btn');
        if (reportBtn) {
            reportBtn.addEventListener('click', async (e) => {
                const childId = e.currentTarget.dataset.childid;
                openLearningReport(childId);
            });
        }
    }

    // ============================================
    // LEARNING REPORT MODAL
    // ============================================

    const lrModal = document.getElementById('learning-report-modal');
    const lrModalContent = document.getElementById('lr-modal-content');
    const lrModalCloseBtn = document.getElementById('lr-modal-close-btn');

    if (lrModalCloseBtn) {
        lrModalCloseBtn.addEventListener('click', closeLearningReport);
    }
    if (lrModal) {
        lrModal.addEventListener('click', (e) => {
            if (e.target === lrModal) closeLearningReport();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lrModal && lrModal.classList.contains('is-visible')) {
            closeLearningReport();
        }
    });

    function closeLearningReport() {
        if (lrModal) lrModal.classList.remove('is-visible');
    }

    async function openLearningReport(childId) {
        if (!lrModal || !lrModalContent) return;

        // Show modal with loading state
        lrModalContent.innerHTML = `
            <div class="lr-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Generating learning report...</p>
            </div>
        `;
        lrModal.classList.add('is-visible');

        try {
            const res = await fetch(`/api/parent/child/${childId}/learning-report`, { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load report');
            const report = await res.json();
            lrModalContent.innerHTML = renderLearningReport(report);
        } catch (err) {
            console.error('Learning report error:', err);
            lrModalContent.innerHTML = `
                <div class="lr-loading">
                    <i class="fas fa-exclamation-triangle" style="color: var(--color-danger);"></i>
                    <p>Could not load the learning report. Please try again.</p>
                </div>
            `;
        }
    }

    function renderLearningReport(r) {
        const toneClass = `lr-tone-${r.headline.tone}`;
        const toneLabels = {
            excellent: 'Excellent',
            good: 'On Track',
            growing: 'Growing',
            building: 'Building',
            'needs-attention': 'Needs Attention',
            neutral: ''
        };

        // --- Insights ---
        const insightsHTML = r.insights.map(i => {
            const toneMap = { positive: 'lr-insight-positive', concern: 'lr-insight-concern', actionable: 'lr-insight-actionable', neutral: 'lr-insight-neutral' };
            return `<div class="lr-insight ${toneMap[i.tone] || 'lr-insight-neutral'}">${i.message}</div>`;
        }).join('');

        // --- Weekly Snapshot ---
        const tw = r.weeklySnapshot.thisWeek;
        const trends = r.weeklySnapshot.trends;

        function deltaHTML(val, suffix = '') {
            if (val === null || val === undefined) return '';
            if (val > 0) return `<div class="lr-stat-delta lr-delta-positive">+${val}${suffix}</div>`;
            if (val < 0) return `<div class="lr-stat-delta lr-delta-negative">${val}${suffix}</div>`;
            return `<div class="lr-stat-delta lr-delta-neutral">—</div>`;
        }

        const snapshotHTML = `
            <div class="lr-stat-grid">
                <div class="lr-stat-card">
                    <div class="lr-stat-value">${tw.sessions}</div>
                    <div class="lr-stat-label">Sessions</div>
                    ${deltaHTML(trends.sessionsDelta)}
                </div>
                <div class="lr-stat-card">
                    <div class="lr-stat-value">${tw.minutes}</div>
                    <div class="lr-stat-label">Minutes</div>
                    ${deltaHTML(trends.minutesDelta)}
                </div>
                <div class="lr-stat-card">
                    <div class="lr-stat-value">${tw.problemsAttempted}</div>
                    <div class="lr-stat-label">Problems</div>
                    ${deltaHTML(trends.problemsDelta)}
                </div>
                <div class="lr-stat-card">
                    <div class="lr-stat-value">${tw.accuracy !== null ? tw.accuracy + '%' : '—'}</div>
                    <div class="lr-stat-label">Accuracy</div>
                    ${deltaHTML(trends.accuracyDelta, '%')}
                </div>
            </div>
        `;

        // --- Mastery ---
        const m = r.mastery.counts;
        const total = m.total || 1;
        const masteryBarHTML = m.total > 0 ? `
            <div class="lr-mastery-bar">
                <div class="lr-mastery-bar-segment" style="width: ${(m.mastered / total * 100).toFixed(1)}%; background: var(--color-success);"></div>
                <div class="lr-mastery-bar-segment" style="width: ${(m.practicing / total * 100).toFixed(1)}%; background: #3498db;"></div>
                <div class="lr-mastery-bar-segment" style="width: ${(m.learning / total * 100).toFixed(1)}%; background: var(--color-warning);"></div>
                <div class="lr-mastery-bar-segment" style="width: ${(m.needsReview / total * 100).toFixed(1)}%; background: var(--color-danger);"></div>
            </div>
            <div class="lr-mastery-legend">
                <span class="lr-legend-mastered">Mastered (${m.mastered})</span>
                <span class="lr-legend-practicing">Practicing (${m.practicing})</span>
                <span class="lr-legend-learning">Learning (${m.learning})</span>
                <span class="lr-legend-needs-review">Needs Review (${m.needsReview})</span>
            </div>
        ` : '<p style="font-size: var(--text-sm); color: var(--color-text-muted);">No skills tracked yet.</p>';

        const strengthsHTML = r.mastery.topStrengths.length > 0
            ? r.mastery.topStrengths.map(s => `<span class="lr-skill-tag lr-skill-strength"><i class="fas fa-star" style="font-size: 0.8em;"></i> ${s.displayName}</span>`).join('')
            : '';

        const growthAreasHTML = r.mastery.growthAreas.length > 0
            ? r.mastery.growthAreas.map(s => `<span class="lr-skill-tag lr-skill-growth"><i class="fas fa-seedling" style="font-size: 0.8em;"></i> ${s.displayName}</span>`).join('')
            : '';

        // --- Memory Health ---
        const mem = r.memoryHealth;
        const memoryHTML = mem.totalTracked > 0 ? `
            <div class="lr-memory-bar">
                ${Array(mem.strong).fill('<div class="lr-memory-segment lr-memory-strong"></div>').join('')}
                ${Array(mem.fading).fill('<div class="lr-memory-segment lr-memory-fading"></div>').join('')}
                ${Array(mem.needsReview).fill('<div class="lr-memory-segment lr-memory-weak"></div>').join('')}
            </div>
            <div style="display: flex; gap: 16px; font-size: var(--text-xs); color: var(--color-text-secondary);">
                <span><span style="color: var(--color-success); font-weight: 700;">${mem.strong}</span> Strong</span>
                <span><span style="color: var(--color-warning); font-weight: 700;">${mem.fading}</span> Fading</span>
                <span><span style="color: var(--color-danger); font-weight: 700;">${mem.needsReview}</span> Needs Review</span>
            </div>
            ${mem.fadingSkills.length > 0 ? `
                <div style="margin-top: 8px;">
                    ${mem.fadingSkills.map(s => `<span class="lr-skill-tag lr-skill-fading">${s.displayName} (${s.retrievability}%)</span>`).join('')}
                </div>
            ` : ''}
        ` : '<p style="font-size: var(--text-sm); color: var(--color-text-muted);">No memory data yet — it builds as your child practices.</p>';

        // --- Cognitive Load ---
        const cogTrendClass = { improving: 'lr-cog-improving', rising: 'lr-cog-rising', stable: 'lr-cog-stable', 'no-data': 'lr-cog-no-data' };
        const cogHTML = `<span class="lr-cog-label ${cogTrendClass[r.cognitiveLoad.trend] || 'lr-cog-no-data'}">${r.cognitiveLoad.label}</span>`;

        // --- Milestones ---
        const allBadges = [...(r.milestones.badges || []), ...(r.milestones.strategyBadges || [])];
        const milestonesHTML = allBadges.length > 0 || r.milestones.skillsMasteredThisWeek > 0
            ? `<div class="lr-badge-list">
                ${r.milestones.skillsMasteredThisWeek > 0 ? `<span class="lr-badge-item"><i class="fas fa-trophy"></i> ${r.milestones.skillsMasteredThisWeek} skill${r.milestones.skillsMasteredThisWeek > 1 ? 's' : ''} mastered</span>` : ''}
                ${allBadges.map(b => `<span class="lr-badge-item"><i class="fas fa-medal"></i> ${b.badgeName || b.key || b.badgeId}</span>`).join('')}
              </div>`
            : '<p style="font-size: var(--text-sm); color: var(--color-text-muted);">No new milestones this week — they\'ll come!</p>';

        // --- Engagement ---
        const eng = r.engagement;
        const engagementHTML = `
            <div class="lr-engagement-row">
                <div class="lr-engagement-item"><i class="fas fa-fire"></i> <strong>${eng.currentStreak}</strong> day streak</div>
                <div class="lr-engagement-item"><i class="fas fa-clock"></i> <strong>${eng.totalTutoringMinutes}</strong> min lifetime</div>
                <div class="lr-engagement-item"><i class="fas fa-scroll"></i> <strong>${eng.questsCompleted}</strong> quests done</div>
                <div class="lr-engagement-item"><i class="fas fa-shield-alt"></i> <strong>${eng.challengesCompleted}</strong> challenges</div>
            </div>
        `;

        // --- Fact Fluency ---
        const ff = r.factFluency;
        const fluencyHTML = ff.total > 0 ? `
            <div style="display: flex; gap: 16px; font-size: var(--text-sm); color: var(--color-text-secondary);">
                <span><strong>${ff.mastered}</strong> of <strong>${ff.total}</strong> fact families mastered</span>
                ${ff.overallAccuracy ? `<span>Accuracy: <strong>${ff.overallAccuracy}%</strong></span>` : ''}
                <span><strong>${ff.totalSessions}</strong> practice sessions</span>
            </div>
        ` : '';

        // --- Growth ---
        const growthSection = r.growth.thetaGrowthThisMonth !== null ? `
            <div style="font-size: var(--text-sm); color: var(--color-text-secondary);">
                Math ability growth this month:
                <strong style="color: ${r.growth.thetaGrowthThisMonth > 0 ? 'var(--color-success)' : r.growth.thetaGrowthThisMonth < 0 ? 'var(--color-danger)' : 'var(--color-text)'}">${r.growth.thetaGrowthThisMonth > 0 ? '+' : ''}${r.growth.thetaGrowthThisMonth}</strong>
            </div>
        ` : '';

        // --- Assemble ---
        return `
            <div class="lr-header">
                <div class="lr-headline">
                    ${r.headline.text}
                    ${toneLabels[r.headline.tone] ? `<span class="lr-headline-tone ${toneClass}">${toneLabels[r.headline.tone]}</span>` : ''}
                </div>
                <div class="lr-child-info">
                    ${r.child.firstName} ${r.child.lastName} · Grade ${r.child.gradeLevel} · ${r.child.mathCourse || 'N/A'} · Level ${r.child.level}
                </div>
            </div>
            <div class="lr-body">
                ${insightsHTML ? `
                    <div class="lr-section">
                        <div class="lr-section-title"><i class="fas fa-lightbulb"></i> Key Insights</div>
                        ${insightsHTML}
                    </div>
                ` : ''}

                <div class="lr-section">
                    <div class="lr-section-title"><i class="fas fa-chart-bar"></i> This Week</div>
                    ${snapshotHTML}
                </div>

                <div class="lr-section">
                    <div class="lr-section-title"><i class="fas fa-puzzle-piece"></i> Skill Mastery</div>
                    ${masteryBarHTML}
                    ${strengthsHTML ? `<div style="margin-top: 12px;"><strong style="font-size: var(--text-xs); color: var(--color-text-muted);">Top Strengths</strong><div style="margin-top: 4px;">${strengthsHTML}</div></div>` : ''}
                    ${growthAreasHTML ? `<div style="margin-top: 10px;"><strong style="font-size: var(--text-xs); color: var(--color-text-muted);">Needs Practice</strong><div style="margin-top: 4px;">${growthAreasHTML}</div></div>` : ''}
                </div>

                <div class="lr-section">
                    <div class="lr-section-title"><i class="fas fa-brain"></i> Memory Health</div>
                    ${memoryHTML}
                </div>

                <div class="lr-section">
                    <div class="lr-section-title"><i class="fas fa-battery-half"></i> Mental Effort</div>
                    ${cogHTML}
                    ${growthSection}
                </div>

                <div class="lr-section">
                    <div class="lr-section-title"><i class="fas fa-trophy"></i> Milestones This Week</div>
                    ${milestonesHTML}
                </div>

                <div class="lr-section">
                    <div class="lr-section-title"><i class="fas fa-gamepad"></i> Engagement</div>
                    ${engagementHTML}
                </div>

                ${fluencyHTML ? `
                    <div class="lr-section">
                        <div class="lr-section-title"><i class="fas fa-bolt"></i> Fact Fluency</div>
                        ${fluencyHTML}
                    </div>
                ` : ''}
            </div>
        `;
    }

    // --- Load Parent Settings ---
    async function loadParentSettings() {
        try {
            const res = await fetch("/api/parent/settings", { credentials: 'include' });
            if (!res.ok) {
                throw new Error("Failed to load settings");
            }
            const settings = await res.json();

            // Populate form fields
            if (document.getElementById('reportFrequency')) {
                document.getElementById('reportFrequency').value = settings.reportFrequency || 'weekly';
            }
            if (document.getElementById('goalViewPreference')) {
                document.getElementById('goalViewPreference').value = settings.goalViewPreference || 'progress';
            }
            if (document.getElementById('parentTone')) {
                document.getElementById('parentTone').value = settings.parentTone || '';
            }
            if (document.getElementById('parentLanguage')) {
                document.getElementById('parentLanguage').value = settings.parentLanguage || 'English';
            }

            // parentLanguage is the setting this page actually exposes, so it wins here.
            // i18n.js boots off preferredLanguage (the student-side field); saving syncs the
            // two, but an account that set a language before that sync existed still has them
            // out of step, and then the dashboard renders in the wrong language with no clue why.
            if (window.MathmatixI18n && settings.parentLanguage &&
                settings.parentLanguage !== window.MathmatixI18n.getLanguage()) {
                window.MathmatixI18n.setLanguage(settings.parentLanguage);
            }
        } catch (error) {
            console.error("ERROR: Failed to load parent settings:", error);
        }
    }

    // --- Event Listeners ---
    if (childSelector) {
        childSelector.addEventListener("change", () => {
            selectedChild = children.find(c => c._id === childSelector.value);
            setChatPlaceholder('parent.chatAboutProgress', 'Chat about your child\'s progress.');
            updateTutorAvatar(selectedChild);
        });
    }

    if (parentSendButton) {
        if (parentUserInput) {
            parentUserInput.addEventListener('input', () => {
                if (parentUserInput.value.length > PARENT_CHAT_MAX_MESSAGE_LENGTH) {
                    parentUserInput.value = parentUserInput.value.substring(0, PARENT_CHAT_MAX_MESSAGE_LENGTH);
                }
            });
        }

        parentSendButton.addEventListener("click", async () => {
            const message = parentUserInput.value.trim();
            if (!message || !selectedChild || !currentParentId) {
                showToast("Please select a child and type a message.", "warning");
                return;
            }
            if (message.length > PARENT_CHAT_MAX_MESSAGE_LENGTH) {
                showToast(`Message too long. Please shorten to under ${PARENT_CHAT_MAX_MESSAGE_LENGTH} characters.`, "warning");
                return;
            }

            appendParentMessage("user", message);
            parentUserInput.value = "";
            if (parentThinkingIndicator) parentThinkingIndicator.style.display = "flex";

            try {
                const res = await csrfFetch("/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: 'include',
                    body: JSON.stringify({
                        userId: currentParentId,
                        message,
                        role: "parent",
                        childId: selectedChild._id,
                    })
                });

                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`Chat error: ${res.status} - ${errorText}`);
                }
                const data = await res.json();
                appendParentMessage("ai", data.text || t('parent.noResponse', 'No response from tutor.'), {
                    tutorName: data.tutorName,
                    tutorImage: data.tutorImage
                });
            } catch (err) {
                console.error("Parent chat error:", err);
                appendParentMessage("ai", t('parent.chatError', 'Error connecting to the tutor. Please try again.'));
            } finally {
                if (parentThinkingIndicator) parentThinkingIndicator.style.display = "none";
            }
        });

        if (parentUserInput) {
            parentUserInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    parentSendButton.click();
                }
            });
        }
    }

    // --- Helper Button Click Handlers ---
    const helperButtons = document.querySelectorAll('.helper-btn');
    helperButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const message = btn.getAttribute('data-message');
            if (!message || !selectedChild || !currentParentId) {
                showToast("Please select a child first.", "warning");
                return;
            }

            appendParentMessage("user", message);
            if (parentThinkingIndicator) parentThinkingIndicator.style.display = "flex";

            try {
                const res = await csrfFetch("/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: 'include',
                    body: JSON.stringify({
                        userId: currentParentId,
                        message,
                        role: "parent",
                        childId: selectedChild._id,
                    })
                });

                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`Chat error: ${res.status} - ${errorText}`);
                }
                const data = await res.json();
                appendParentMessage("ai", data.text || t('parent.noResponse', 'No response from tutor.'), {
                    tutorName: data.tutorName,
                    tutorImage: data.tutorImage
                });
            } catch (err) {
                console.error("Parent chat error:", err);
                appendParentMessage("ai", t('parent.chatError', 'Error connecting to the tutor. Please try again.'));
            } finally {
                if (parentThinkingIndicator) parentThinkingIndicator.style.display = "none";
            }
        });
    });

    if (generateCodeBtn) {
        generateCodeBtn.addEventListener('click', async () => {
            generateCodeBtn.disabled = true;
            generateCodeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
            try {
                const res = await csrfFetch("/api/parent/generate-invite-code", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: 'include'
                });
                const data = await res.json();
                if (data.success) {
                    generatedCodeValue.textContent = data.code;
                    codeExpiresAt.textContent = new Date(data.expiresAt).toLocaleDateString();
                    inviteCodeOutput.style.display = 'block';

                    // Also update mobile code display
                    const mobileCodeEl = document.getElementById('mobile-generated-code-value');
                    if (mobileCodeEl) mobileCodeEl.textContent = data.code;

                    showToast("Invite code generated! Share it with your child.", "success");
                } else {
                    showToast("Failed to generate code: " + data.message, "error");
                }
            } catch (error) {
                console.error("ERROR: Generate code error:", error);
                showToast("An error occurred while generating code.", "error");
            } finally {
                generateCodeBtn.disabled = false;
                generateCodeBtn.innerHTML = '<i class="fas fa-key"></i> Generate Invite Code';
            }
        });
    }

    if (linkStudentForm) {
        linkStudentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const studentLinkCode = studentLinkCodeInput.value.trim();
            linkStudentMessage.textContent = '';
            try {
                const res = await csrfFetch("/api/parent/link-to-student", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: 'include',
                    body: JSON.stringify({ studentLinkCode })
                });
                const data = await res.json();
                if (data.success) {
                    linkStudentMessage.className = "mt-2 text-sm text-green-600";
                    linkStudentMessage.textContent = data.message;
                    studentLinkCodeInput.value = '';
                    showToast(data.message, "success");
                    loadChildren(); // Reload children list after successful link
                    // A newly linked child has no supports yet — put the setup
                    // prompt in front of the parent while they are still here,
                    // instead of leaving it to be discovered later.
                    if (window.MMLearningSupports) window.MMLearningSupports.focusSetup();
                } else {
                    linkStudentMessage.className = "mt-2 text-sm text-red-600";
                    linkStudentMessage.textContent = data.message;
                    showToast(data.message, "error");
                }
            } catch (error) {
                console.error("ERROR: Link student error:", error);
                linkStudentMessage.className = "mt-2 text-sm text-red-600";
                linkStudentMessage.textContent = "An error occurred while linking the student.";
                showToast("An error occurred while linking the student.", "error");
            }
        });
    }

    // --- Parent Settings Form Handler ---
    if (parentSettingsForm) {
        parentSettingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            settingsSaveMessage.textContent = '';

            const selectedLang = document.getElementById('parentLanguage').value;
            const formData = {
                reportFrequency: document.getElementById('reportFrequency').value,
                goalViewPreference: document.getElementById('goalViewPreference').value,
                parentTone: document.getElementById('parentTone').value,
                parentLanguage: selectedLang
            };

            try {
                const res = await csrfFetch("/api/parent/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: 'include',
                    body: JSON.stringify(formData)
                });

                // Also sync to preferredLanguage so the i18n system picks it up
                await csrfFetch('/api/user/settings', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ preferredLanguage: selectedLang })
                });

                const data = await res.json();
                if (data.success) {
                    // Update UI language in real time
                    if (window.MathmatixI18n) {
                        window.MathmatixI18n.setLanguage(selectedLang);
                    }
                    settingsSaveMessage.className = "mt-2 text-sm text-green-600";
                    settingsSaveMessage.textContent = data.message;
                    showToast("Settings saved!", "success", 3500);
                    setTimeout(() => {
                        settingsSaveMessage.textContent = '';
                    }, 3000);
                } else {
                    settingsSaveMessage.className = "mt-2 text-sm text-red-600";
                    settingsSaveMessage.textContent = data.message || 'Failed to save settings';
                    showToast("Failed to save settings.", "error");
                }
            } catch (error) {
                console.error("ERROR: Save settings error:", error);
                settingsSaveMessage.className = "mt-2 text-sm text-red-600";
                settingsSaveMessage.textContent = "An error occurred while saving settings.";
                showToast("An error occurred while saving settings.", "error");
            }
        });
    }

    // --- Email Report Handlers ---
    const testEmailBtn = document.getElementById("test-email-btn");
    const sendWeeklyReportBtn = document.getElementById("send-weekly-report-btn");
    const emailStatusMessage = document.getElementById("email-status-message");

    if (testEmailBtn) {
        testEmailBtn.addEventListener("click", async () => {
            try {
                emailStatusMessage.textContent = "Sending test email...";
                emailStatusMessage.style.color = "var(--color-text-muted)";
                testEmailBtn.disabled = true;

                const response = await csrfFetch('/api/email/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });

                const data = await response.json();

                if (data.success) {
                    emailStatusMessage.textContent = "Test email sent! Check your inbox.";
                    emailStatusMessage.style.color = "var(--color-success)";
                    showToast("Test email sent! Check your inbox.", "success");
                } else {
                    emailStatusMessage.textContent = data.message;
                    emailStatusMessage.style.color = "var(--color-danger)";
                    showToast(data.message, "error");
                }

                testEmailBtn.disabled = false;
                setTimeout(() => {
                    emailStatusMessage.textContent = '';
                }, 5000);
            } catch (error) {
                console.error("Error sending test email:", error);
                emailStatusMessage.textContent = "Error: Email not configured on server";
                emailStatusMessage.style.color = "var(--color-danger)";
                showToast("Email not configured on server.", "error");
                testEmailBtn.disabled = false;
            }
        });
    }

    if (sendWeeklyReportBtn) {
        sendWeeklyReportBtn.addEventListener("click", async () => {
            if (!selectedChild) {
                showToast("Please select a child first.", "warning");
                return;
            }

            try {
                emailStatusMessage.textContent = "Generating and sending report...";
                emailStatusMessage.style.color = "var(--color-text-muted)";
                sendWeeklyReportBtn.disabled = true;

                const response = await csrfFetch('/api/email/weekly-report', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ studentId: selectedChild._id })
                });

                const data = await response.json();

                if (data.success) {
                    emailStatusMessage.textContent = "Weekly report sent! Check your inbox.";
                    emailStatusMessage.style.color = "var(--color-success)";
                    showToast("Weekly report sent!", "success");
                } else {
                    emailStatusMessage.textContent = data.message;
                    emailStatusMessage.style.color = "var(--color-danger)";
                    showToast(data.message, "error");
                }

                sendWeeklyReportBtn.disabled = false;
                setTimeout(() => {
                    emailStatusMessage.textContent = '';
                }, 5000);
            } catch (error) {
                console.error("Error sending weekly report:", error);
                emailStatusMessage.textContent = "Error: Email not configured on server";
                emailStatusMessage.style.color = "var(--color-danger)";
                showToast("Email not configured on server.", "error");
                sendWeeklyReportBtn.disabled = false;
            }
        });
    }

    // ============================================
    // PARENT LEARNING CENTER - Mini-Courses
    // ============================================

    async function loadParentCourses() {
        const container = document.getElementById('parent-courses-list');
        const mobileContainer = document.getElementById('mobile-parent-courses-list');
        if (!container) return;

        try {
            const [catalogRes, sessionsRes] = await Promise.all([
                csrfFetch('/api/course-sessions/catalog?audience=parent', { credentials: 'include' }),
                csrfFetch('/api/course-sessions', { credentials: 'include' })
            ]);

            const catalogData = catalogRes.ok ? await catalogRes.json() : { catalog: [] };
            const sessionsData = sessionsRes.ok ? await sessionsRes.json() : { sessions: [] };
            const courses = catalogData.catalog || [];
            const sessions = sessionsData.sessions || [];

            const enrolledMap = {};
            sessions.forEach(s => {
                if (s.status === 'active' || s.status === 'paused') {
                    enrolledMap[s.courseId] = s;
                }
            });

            if (courses.length === 0) {
                container.innerHTML = '<p class="text-sm text-gray-500 text-center">Parent courses coming soon!</p>';
                if (mobileContainer) mobileContainer.innerHTML = container.innerHTML;
                return;
            }

            const html = courses.map(course => {
                const gradeBand = course.gradeBand || '';
                const desc = course.description || course.tagline || '';
                const truncatedDesc = desc.length > 100 ? desc.substring(0, 100) + '...' : desc;
                const enrolled = enrolledMap[course.courseId];
                const progress = enrolled ? (enrolled.overallProgress || 0) : 0;

                let buttonHtml;
                if (enrolled) {
                    buttonHtml = `
                        <div class="parent-course-progress-bar">
                            <div class="parent-course-progress-fill" style="width: ${progress}%"></div>
                        </div>
                        <button class="parent-course-enroll-btn enrolled" onclick="window.location.href='/parent-course.html?sessionId=${enrolled._id}&courseId=${course.courseId}'">
                            <i class="fas fa-arrow-right"></i> Continue (${progress}%)
                        </button>
                    `;
                } else {
                    buttonHtml = `
                        <button class="parent-course-enroll-btn" onclick="enrollParentCourse('${course.courseId}', this)">
                            <i class="fas fa-play-circle"></i> Start Course
                        </button>
                    `;
                }

                return `
                    <div class="parent-course-card${enrolled ? ' enrolled' : ''}" data-course-id="${course.courseId}">
                        <div class="parent-course-card-title">
                            <i class="fas fa-book-reader"></i>
                            ${course.title}
                        </div>
                        <div class="parent-course-card-desc">${truncatedDesc}</div>
                        <div class="parent-course-card-meta">
                            ${gradeBand ? `<span class="parent-course-badge badge-grade">${gradeBand}</span>` : ''}
                            <span class="parent-course-badge badge-units">${course.moduleCount || 4} topics</span>
                        </div>
                        ${buttonHtml}
                    </div>
                `;
            }).join('');

            container.innerHTML = html;
            if (mobileContainer) mobileContainer.innerHTML = html;
        } catch (error) {
            console.error('Error loading parent courses:', error);
            container.innerHTML = '<p class="text-sm text-gray-500 text-center">Could not load courses.</p>';
            if (mobileContainer) mobileContainer.innerHTML = container.innerHTML;
        }
    }

    // Enroll in a parent course
    window.enrollParentCourse = async function(courseId, btnElement) {
        try {
            btnElement.disabled = true;
            btnElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enrolling...';

            const res = await csrfFetch('/api/course-sessions/enroll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ courseId })
            });

            const data = await res.json();

            if (data.success) {
                btnElement.innerHTML = '<i class="fas fa-check-circle"></i> Enrolled!';
                btnElement.classList.add('enrolled');
                showToast("Course enrolled! Redirecting...", "success");
                const sessionId = data.session?._id || '';
                setTimeout(() => {
                    window.location.href = `/parent-course.html?sessionId=${sessionId}&courseId=${courseId}`;
                }, 800);
            } else {
                if (data.message && data.message.includes('Already enrolled')) {
                    btnElement.innerHTML = '<i class="fas fa-arrow-right"></i> Continue Course';
                    btnElement.classList.add('enrolled');
                    btnElement.disabled = false;
                    btnElement.onclick = () => { window.location.href = `/parent-course.html?courseId=${courseId}`; };
                } else {
                    btnElement.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${data.message || 'Error'}`;
                    btnElement.disabled = false;
                    showToast(data.message || 'Enrollment failed.', 'error');
                    setTimeout(() => {
                        btnElement.innerHTML = '<i class="fas fa-play-circle"></i> Start Course';
                    }, 3000);
                }
            }
        } catch (error) {
            console.error('Error enrolling in course:', error);
            btnElement.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error';
            btnElement.disabled = false;
            showToast('Error enrolling in course.', 'error');
            setTimeout(() => {
                btnElement.innerHTML = '<i class="fas fa-play-circle"></i> Start Course';
            }, 3000);
        }
    };

    // ============================================
    // INITIAL LOAD
    // ============================================

    setupCopyButtons();

    const parentUser = await loadParentUser();
    if (parentUser) {
        // Must await: the real-time polling bootstrap below reads children.length
        // synchronously, so without awaiting, children is still [] and the
        // "LIVE NOW" indicator + session notifications never start on load.
        await loadChildren();
        loadParentSettings();
        loadParentCourses();

        // If we arrived from a student's invite email (?acceptInvite=<token>),
        // link this parent to that child, then refresh the dashboard.
        const acceptToken = new URLSearchParams(window.location.search).get('acceptInvite');
        if (acceptToken) {
            try {
                const res = await csrfFetch('/api/parent/accept-invite', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: acceptToken }),
                    credentials: 'include'
                });
                const data = await res.json().catch(() => ({}));
                alert(data.message || (res.ok ? "You're now following your child's progress!" : "Couldn't accept this invite."));
                window.history.replaceState({}, '', window.location.pathname);
                if (res.ok) await loadChildren();
            } catch (e) {
                console.error('Accept invite failed:', e);
            }
        }
    }

    // ============================================
    // REAL-TIME UPDATES
    // ============================================

    let parentPollingInterval = null;
    let lastLiveSessionCount = 0;

    function startParentPolling() {
        if (parentPollingInterval) return; // Prevent duplicate intervals
        parentPollingInterval = setInterval(async () => {
            if (children.length === 0) return;

            try {
                let currentLiveSessions = 0;

                // Parallel polling for all children
                const pollResults = await Promise.all(
                    children.map(async (child) => {
                        try {
                            const res = await fetch(`/api/parent/child/${child._id}/progress`, { credentials: 'include' });
                            if (res.ok) {
                                const progress = await res.json();
                                const liveSessions = progress.recentSessions?.filter(s => s.isActive) || [];
                                return { childId: child._id, isLive: liveSessions.length > 0, liveCount: liveSessions.length };
                            }
                        } catch (err) {
                            console.log(`[Polling] Failed to check ${child.firstName}'s status`);
                        }
                        return { childId: child._id, isLive: false, liveCount: 0 };
                    })
                );

                pollResults.forEach(result => {
                    currentLiveSessions += result.liveCount;
                    updateChildLiveStatus(result.childId, result.isLive);
                });

                if (currentLiveSessions > lastLiveSessionCount && lastLiveSessionCount >= 0) {
                    showLiveSessionNotification(currentLiveSessions - lastLiveSessionCount);
                }
                lastLiveSessionCount = currentLiveSessions;

            } catch (error) {
                console.log('[Parent Polling] Error:', error.message);
            }
        }, 60000);
    }

    function stopParentPolling() {
        if (parentPollingInterval) {
            clearInterval(parentPollingInterval);
            parentPollingInterval = null;
        }
    }

    function updateChildLiveStatus(childId, isLive) {
        const cards = document.querySelectorAll('.child-card');
        cards.forEach(card => {
            if (card.dataset.childId !== childId) return;

            const cardHeader = card.querySelector('h3');
            if (!cardHeader) return;

            let liveIndicator = card.querySelector('.live-indicator');

            if (isLive && !liveIndicator) {
                liveIndicator = document.createElement('span');
                liveIndicator.className = 'live-indicator';
                liveIndicator.innerHTML = '<span class="live-badge-dot"></span> LIVE NOW';
                liveIndicator.style.cssText = 'display: inline-flex; align-items: center; gap: 6px; background: var(--color-success); color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.75em; font-weight: bold; margin-left: 10px;';
                cardHeader.appendChild(liveIndicator);

                card.style.borderLeft = '4px solid var(--color-success)';
                card.style.boxShadow = '0 0 20px rgba(39, 174, 96, 0.2)';
            } else if (!isLive && liveIndicator) {
                liveIndicator.remove();
                card.style.borderLeft = '';
                card.style.boxShadow = '';
            }
        });
    }

    function showLiveSessionNotification(count) {
        showToast(
            count === 1
                ? 'Your child just started a learning session!'
                : `${count} children are now learning!`,
            'success',
            8000
        );

        // Play notification sound
        try {
            const audio = new Audio('/sounds/notification.mp3');
            audio.volume = 0.3;
            audio.play().catch(() => {});
        } catch (e) {}
    }

    // Start polling if we have children
    if (children.length > 0) {
        startParentPolling();
    }

    // Handle visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopParentPolling();
        } else {
            startParentPolling();
        }
    });

    window.addEventListener('beforeunload', stopParentPolling);
});

;
/* --- /js/modules/messaging.js --- */
/**
 * Teacher <-> Parent messaging widget.
 *
 * The API (routes/messaging.js) and the Message model have existed for a while
 * with no interface anywhere — this mounts the same widget on both the parent
 * and teacher dashboards so neither monolith grows its own copy.
 *
 * Usage:
 *   MMMessaging.mount(document.getElementById('messaging-root'));
 *
 * Exposes window.MMMessaging.
 */
/* global csrfFetch */
(function () {
  'use strict';

  var API = '/api/messages';
  var POLL_MS = 30000;

  // csrfFetch is defined in /js/csrf.js, which every dashboard already loads.
  function post(url, body) {
    var opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    return (typeof csrfFetch === 'function' ? csrfFetch(url, opts) : fetch(url, opts));
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fullName(u) {
    if (!u) return 'Unknown';
    return esc([u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || 'Unknown');
  }

  function initials(u) {
    if (!u) return '?';
    var a = (u.firstName || u.email || '?')[0] || '?';
    var b = (u.lastName || '')[0] || '';
    return esc((a + b).toUpperCase());
  }

  function timeAgo(iso) {
    var t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    var s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 604800) return Math.floor(s / 86400) + 'd ago';
    return new Date(iso).toLocaleDateString();
  }

  function MessagingWidget(root) {
    this.root = root;
    this.contacts = [];
    this.conversations = [];
    this.activeUserId = null;
    this.activeName = '';
    this.messages = [];
    this.pollTimer = null;
    this.sending = false;
  }

  MessagingWidget.prototype.mount = function () {
    this.root.innerHTML =
      '<div class="mm-msg">' +
        '<aside class="mm-msg-list" aria-label="Conversations">' +
          '<div class="mm-msg-list-head">' +
            '<h3>Messages</h3>' +
            '<button type="button" class="mm-msg-new" title="New message">' +
              '<i class="fas fa-pen-to-square" aria-hidden="true"></i><span class="sr-only">New message</span>' +
            '</button>' +
          '</div>' +
          '<div class="mm-msg-threads" role="list"></div>' +
        '</aside>' +
        '<section class="mm-msg-pane" aria-live="polite">' +
          '<div class="mm-msg-empty">Select a conversation to get started.</div>' +
        '</section>' +
      '</div>';

    this.threadsEl = this.root.querySelector('.mm-msg-threads');
    this.paneEl = this.root.querySelector('.mm-msg-pane');
    this.root.querySelector('.mm-msg-new').addEventListener('click', this.showCompose.bind(this));

    this.refresh();
    this.pollTimer = setInterval(this.refresh.bind(this), POLL_MS);
    return this;
  };

  MessagingWidget.prototype.destroy = function () {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  };

  MessagingWidget.prototype.refresh = function () {
    var self = this;
    return fetch(API + '/conversations', { credentials: 'same-origin' })
      .then(function (r) {
        // 403 means this account holds neither role — hide rather than nag.
        if (r.status === 403) { self.root.style.display = 'none'; return null; }
        return r.ok ? r.json() : null;
      })
      .then(function (d) {
        if (!d || !d.success) return;
        self.conversations = d.conversations || [];
        self.renderThreads();
        if (self.activeUserId) self.loadThread(self.activeUserId, self.activeName, true);
      })
      .catch(function () { /* transient; next poll retries */ });
  };

  MessagingWidget.prototype.renderThreads = function () {
    var self = this;
    if (!this.conversations.length) {
      this.threadsEl.innerHTML =
        '<p class="mm-msg-none">No messages yet.<br><button type="button" class="mm-msg-startlink">Start a conversation</button></p>';
      var link = this.threadsEl.querySelector('.mm-msg-startlink');
      if (link) link.addEventListener('click', this.showCompose.bind(this));
      return;
    }

    this.threadsEl.innerHTML = this.conversations.map(function (c) {
      var p = c.participant || {};
      var active = self.activeUserId === String(p._id) ? ' is-active' : '';
      var unread = c.unreadCount > 0 ? '<span class="mm-msg-badge">' + c.unreadCount + '</span>' : '';
      return '' +
        '<button type="button" class="mm-msg-thread' + active + '" role="listitem" data-uid="' + esc(p._id) + '" data-name="' + fullName(p) + '">' +
          '<span class="mm-msg-avatar" aria-hidden="true">' + initials(p) + '</span>' +
          '<span class="mm-msg-thread-body">' +
            '<span class="mm-msg-thread-top"><strong>' + fullName(p) + '</strong>' + unread + '</span>' +
            '<span class="mm-msg-snippet">' + esc(c.lastMessage ? c.lastMessage.body : '') + '</span>' +
            '<span class="mm-msg-when">' + esc(c.lastMessage ? timeAgo(c.lastMessage.createdAt) : '') + '</span>' +
          '</span>' +
        '</button>';
    }).join('');

    Array.prototype.forEach.call(this.threadsEl.querySelectorAll('.mm-msg-thread'), function (btn) {
      btn.addEventListener('click', function () {
        self.loadThread(btn.dataset.uid, btn.dataset.name);
      });
    });
  };

  MessagingWidget.prototype.loadThread = function (userId, name, quiet) {
    var self = this;
    this.activeUserId = String(userId);
    this.activeName = name || '';
    if (!quiet) this.paneEl.innerHTML = '<div class="mm-msg-empty">Loading…</div>';

    return fetch(API + '/with/' + encodeURIComponent(userId), { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.success) {
          self.paneEl.innerHTML = '<div class="mm-msg-empty">Could not load this conversation.</div>';
          return;
        }
        // /with returns newest-first; render oldest-first like a chat.
        self.messages = (d.messages || []).slice().reverse();
        self.renderThread();
        self.renderThreads();
      })
      .catch(function () {
        self.paneEl.innerHTML = '<div class="mm-msg-empty">Could not load this conversation.</div>';
      });
  };

  MessagingWidget.prototype.renderThread = function () {
    var self = this;
    var bubbles = this.messages.map(function (m) {
      var mine = m.isFromMe ? ' is-mine' : '';
      var subj = m.subject ? '<span class="mm-msg-subject">' + esc(m.subject) + '</span>' : '';
      var about = m.student ? '<span class="mm-msg-about">About ' + fullName(m.student) + '</span>' : '';
      return '<div class="mm-msg-bubble' + mine + '">' + subj + about +
             '<p>' + esc(m.body).replace(/\n/g, '<br>') + '</p>' +
             '<time>' + esc(timeAgo(m.createdAt)) + '</time></div>';
    }).join('') || '<div class="mm-msg-empty">No messages yet — say hello.</div>';

    this.paneEl.innerHTML =
      '<header class="mm-msg-pane-head"><h4>' + esc(this.activeName) + '</h4></header>' +
      '<div class="mm-msg-scroll">' + bubbles + '</div>' +
      '<form class="mm-msg-form">' +
        '<label class="sr-only" for="mm-msg-body">Message</label>' +
        '<textarea id="mm-msg-body" rows="2" placeholder="Write a message…" maxlength="5000" required></textarea>' +
        '<button type="submit" class="mm-msg-send">Send</button>' +
      '</form>';

    var scroll = this.paneEl.querySelector('.mm-msg-scroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
    this.paneEl.querySelector('.mm-msg-form').addEventListener('submit', function (e) {
      e.preventDefault();
      self.send(this.querySelector('textarea'));
    });
  };

  MessagingWidget.prototype.send = function (textarea) {
    var self = this;
    var body = (textarea.value || '').trim();
    if (!body || this.sending) return;

    this.sending = true;
    var btn = this.paneEl.querySelector('.mm-msg-send');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    post(API + '/send', { recipientId: this.activeUserId, body: body })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (d) {
        self.sending = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
        if (!d || !d.success) {
          window.alert((d && d.message) || 'Message could not be sent.');
          return;
        }
        textarea.value = '';
        return self.loadThread(self.activeUserId, self.activeName, true).then(function () { self.refresh(); });
      })
      .catch(function () {
        self.sending = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
        window.alert('Message could not be sent.');
      });
  };

  MessagingWidget.prototype.showCompose = function () {
    var self = this;
    this.paneEl.innerHTML = '<div class="mm-msg-empty">Loading contacts…</div>';

    fetch(API + '/contacts', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        self.contacts = (d && d.contacts) || [];
        if (!self.contacts.length) {
          self.paneEl.innerHTML =
            '<div class="mm-msg-empty">No one to message yet.<br>' +
            '<small>Contacts appear once your account is linked to a teacher or a student.</small></div>';
          return;
        }
        self.paneEl.innerHTML =
          '<header class="mm-msg-pane-head"><h4>New message</h4></header>' +
          '<div class="mm-msg-contacts">' + self.contacts.map(function (c) {
            var kids = (c.children || []).map(function (k) { return fullName(k); }).join(', ');
            return '<button type="button" class="mm-msg-contact" data-uid="' + esc(c._id) + '" data-name="' + fullName(c) + '">' +
              '<span class="mm-msg-avatar" aria-hidden="true">' + initials(c) + '</span>' +
              '<span><strong>' + fullName(c) + '</strong>' +
              (kids ? '<small>' + esc(kids) + '</small>' : '') + '</span></button>';
          }).join('') + '</div>';

        Array.prototype.forEach.call(self.paneEl.querySelectorAll('.mm-msg-contact'), function (btn) {
          btn.addEventListener('click', function () {
            self.loadThread(btn.dataset.uid, btn.dataset.name);
          });
        });
      })
      .catch(function () {
        self.paneEl.innerHTML = '<div class="mm-msg-empty">Could not load contacts.</div>';
      });
  };

  window.MMMessaging = {
    mount: function (root) {
      if (!root) return null;
      return new MessagingWidget(root).mount();
    }
  };
})();

;
/* --- /js/modules/learningSupports.js --- */
/**
 * Parent-facing learning supports.
 *
 * Lets a parent tell the tutor how their child works best — extra time, chunked
 * problems, read-aloud and so on. These are stored separately from the school's
 * IEP, which only a teacher can write; any switch the school already owns
 * renders locked here rather than pretending a parent can change it.
 *
 * Deliberately avoids the word "IEP" as a thing the parent is editing. An IEP is
 * a legal document authored by a school team; this is a family preference.
 *
 * Usage:
 *   MMLearningSupports.mount(document.getElementById('learning-supports-root'));
 *
 * Exposes window.MMLearningSupports.
 */
/* global csrfFetch */
(function () {
  'use strict';

  // Order and wording are parent-facing on purpose — plain language, and each
  // one says what it actually changes about the tutoring.
  var SWITCHES = [
    { key: 'extendedTime',               label: 'Give extra time',            hint: 'The tutor never rushes or pushes to move on.' },
    { key: 'chunkedAssignments',         label: 'Work in small chunks',       hint: 'Three to five problems at a time, then a check-in.' },
    { key: 'audioReadAloud',             label: 'Read problems aloud',        hint: 'Plainer wording, easier to follow when read out.' },
    { key: 'breaksAsNeeded',             label: 'Offer breaks',               hint: 'The tutor suggests a break when energy dips.' },
    { key: 'mathAnxietySupport',         label: 'Go gently with anxiety',     hint: 'Extra encouragement; mistakes treated as normal.' },
    { key: 'calculatorAllowed',          label: 'Allow a calculator',         hint: 'Focus on strategy instead of arithmetic.' },
    { key: 'digitalMultiplicationChart', label: 'Allow a times-table chart',  hint: 'Using one is never treated as cheating.' },
    { key: 'reducedDistraction',         label: 'Keep it uncluttered',        hint: 'One idea at a time, cleaner visuals.' },
    { key: 'largePrintHighContrast',     label: 'Large, high-contrast text',  hint: 'Bigger type and stronger contrast.' }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function req(url, opts) {
    if (opts && opts.method && opts.method !== 'GET' && typeof csrfFetch === 'function') {
      return csrfFetch(url, opts);
    }
    return fetch(url, Object.assign({ credentials: 'same-origin' }, opts || {}));
  }

  // The three a parent can answer without a diagnosis, and the three that
  // change the tutoring most visibly. Asked on first run so a new family gets
  // a tutor tuned to their child in session one rather than whenever somebody
  // happens to find this panel.
  var QUICK_START = ['extendedTime', 'chunkedAssignments', 'mathAnxietySupport'];

  var QUICK_QUESTIONS = {
    extendedTime:       'Does it help if nobody rushes them?',
    chunkedAssignments: 'Do they do better with a few problems at a time?',
    mathAnxietySupport: 'Does math stress them out?'
  };

  function Supports(root) {
    this.root = root;
    this.children = [];
    this.activeChildId = null;
    this.saveTimer = null;
    this.showAllFor = {};   // childId -> skip the quick start for this child
  }

  Supports.prototype.mount = function () {
    var self = this;
    this.root.innerHTML = '<p class="mm-ls-status">Loading…</p>';

    req('/api/parent/children')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (kids) {
        self.children = Array.isArray(kids) ? kids : [];
        if (!self.children.length) {
          self.root.innerHTML = '<p class="mm-ls-status">Link a child to set up their learning supports.</p>';
          return;
        }
        self.activeChildId = String(self.children[0]._id);
        self.renderShell();
        self.loadChild();
      })
      .catch(function () {
        self.root.innerHTML = '<p class="mm-ls-status">Could not load your children.</p>';
      });
    return this;
  };

  Supports.prototype.renderShell = function () {
    var self = this;
    var picker = '';
    if (this.children.length > 1) {
      picker = '<div class="mm-ls-kids">' + this.children.map(function (k) {
        var on = String(k._id) === self.activeChildId ? ' is-active' : '';
        return '<button type="button" class="mm-ls-kid' + on + '" data-id="' + esc(k._id) + '">' +
               esc(k.firstName) + '</button>';
      }).join('') + '</div>';
    }

    this.root.innerHTML =
      '<p class="mm-ls-intro">Tell the tutor how your child works best. These apply to every session, ' +
      'and you can change them any time.</p>' +
      picker +
      '<div class="mm-ls-body"><p class="mm-ls-status">Loading…</p></div>';

    Array.prototype.forEach.call(this.root.querySelectorAll('.mm-ls-kid'), function (btn) {
      btn.addEventListener('click', function () {
        self.activeChildId = btn.dataset.id;
        Array.prototype.forEach.call(self.root.querySelectorAll('.mm-ls-kid'), function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        self.loadChild();
      });
    });
  };

  Supports.prototype.loadChild = function () {
    var self = this;
    var body = this.root.querySelector('.mm-ls-body');
    body.innerHTML = '<p class="mm-ls-status">Loading…</p>';

    req('/api/parent/child/' + encodeURIComponent(this.activeChildId) + '/supports')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.success) {
          body.innerHTML = '<p class="mm-ls-status">Could not load these settings.</p>';
          return;
        }
        self.state = d;
        self.renderSwitches();
      })
      .catch(function () {
        body.innerHTML = '<p class="mm-ls-status">Could not load these settings.</p>';
      });
  };

  /* First run — three questions instead of nine switches.
     updatedAt is null until a parent has saved something, which is the only
     honest signal we have that this child was never set up. */
  Supports.prototype.renderQuickStart = function () {
    var self = this;
    var d = this.state;
    var body = this.root.querySelector('.mm-ls-body');
    var name = esc(d.childName || 'your child');
    // The quick start carries its own lead; the standing intro would just
    // repeat it.
    this.root.classList.add('mm-ls-first-run');

    var rows = QUICK_START.map(function (key) {
      // A switch the school already set is not a question — it is settled.
      if (d.lockedBySchool[key] === true) return '';
      var id = 'mm-qs-' + key;
      return '' +
        '<div class="mm-ls-row">' +
          '<input type="checkbox" id="' + id + '" data-key="' + key + '" />' +
          '<label for="' + id + '"><span class="mm-ls-label">' + esc(QUICK_QUESTIONS[key]) + '</span></label>' +
        '</div>';
    }).join('');

    body.innerHTML =
      '<div class="mm-ls-quickstart">' +
        '<p class="mm-ls-qs-lead"><strong>Help ' + name + '&rsquo;s tutor start strong.</strong> ' +
          'Three quick questions &mdash; they change how every session runs.</p>' +
        '<div class="mm-ls-rows">' + rows + '</div>' +
        '<div class="mm-ls-qs-actions">' +
          '<button type="button" class="mm-ls-qs-save">Save &amp; start</button>' +
          '<button type="button" class="mm-ls-qs-all">See all options</button>' +
        '</div>' +
        '<p class="mm-ls-saved" role="status" aria-live="polite"></p>' +
      '</div>';

    body.querySelector('.mm-ls-qs-save').addEventListener('click', function () {
      var payload = {};
      Array.prototype.forEach.call(body.querySelectorAll('input[type="checkbox"]'), function (cb) {
        payload[cb.dataset.key] = cb.checked === true;
      });
      self.persist(payload, body.querySelector('.mm-ls-saved'), function () {
        // Saving is what retires the quick start — updatedAt is now set.
        self.showAllFor[self.activeChildId] = true;
        self.loadChild();
      });
    });

    body.querySelector('.mm-ls-qs-all').addEventListener('click', function () {
      self.showAllFor[self.activeChildId] = true;
      self.renderSwitches();
    });
  };

  Supports.prototype.renderSwitches = function () {
    var self = this;
    var d = this.state;
    var body = this.root.querySelector('.mm-ls-body');

    if (!d.updatedAt && !this.showAllFor[this.activeChildId]) {
      return this.renderQuickStart();
    }
    this.root.classList.remove('mm-ls-first-run');

    var rows = SWITCHES.map(function (s) {
      var locked = d.lockedBySchool[s.key] === true;
      var on = locked || d.supports[s.key] === true;
      var id = 'mm-ls-' + s.key;
      return '' +
        '<div class="mm-ls-row' + (locked ? ' is-locked' : '') + '">' +
          '<input type="checkbox" id="' + id + '" data-key="' + s.key + '"' +
            (on ? ' checked' : '') + (locked ? ' disabled' : '') + ' />' +
          '<label for="' + id + '">' +
            '<span class="mm-ls-label">' + esc(s.label) +
              (locked ? '<span class="mm-ls-tag">Set by school</span>' : '') +
            '</span>' +
            '<span class="mm-ls-hint">' + esc(s.hint) + '</span>' +
          '</label>' +
        '</div>';
    }).join('');

    var schoolNote = d.hasSchoolIep
      ? '<p class="mm-ls-schoolnote">Some supports come from ' + esc(d.childName) +
        '&rsquo;s school plan. Those are shown locked &mdash; the school owns them, ' +
        'and the tutor already follows them.</p>'
      : '';

    body.innerHTML =
      schoolNote +
      '<div class="mm-ls-rows">' + rows + '</div>' +
      '<label class="mm-ls-notelabel" for="mm-ls-note">Anything else the tutor should know?</label>' +
      '<textarea id="mm-ls-note" class="mm-ls-note" rows="2" maxlength="500" ' +
        'placeholder="e.g. She freezes on timed work.">' + esc(d.note || '') + '</textarea>' +
      '<p class="mm-ls-saved" role="status" aria-live="polite"></p>';

    Array.prototype.forEach.call(body.querySelectorAll('input[type="checkbox"]'), function (cb) {
      cb.addEventListener('change', function () { self.save(); });
    });
    body.querySelector('.mm-ls-note').addEventListener('input', function () {
      clearTimeout(self.saveTimer);
      self.saveTimer = setTimeout(function () { self.save(); }, 800);
    });
  };

  /* One write path for both the quick start and the full panel. */
  Supports.prototype.persist = function (payload, status, onSaved) {
    if (status) status.textContent = 'Saving…';
    return req('/api/parent/child/' + encodeURIComponent(this.activeChildId) + '/supports', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (d) {
        var ok = !!(d && d.success);
        if (status) {
          status.textContent = ok ? 'Saved' : 'Could not save';
          if (ok) setTimeout(function () { status.textContent = ''; }, 2000);
        }
        if (ok && onSaved) onSaved(d);
      })
      .catch(function () { if (status) status.textContent = 'Could not save'; });
  };

  Supports.prototype.save = function () {
    var body = this.root.querySelector('.mm-ls-body');
    var payload = {};

    Array.prototype.forEach.call(body.querySelectorAll('input[type="checkbox"]'), function (cb) {
      // Locked rows are the school's; never send them back as ours.
      if (!cb.disabled) payload[cb.dataset.key] = cb.checked === true;
    });
    payload.note = body.querySelector('.mm-ls-note').value;

    this.persist(payload, body.querySelector('.mm-ls-saved'));
  };

  /* Called after a child is linked, so the setup prompt is where the parent is
     already looking instead of somewhere further down the page. */
  Supports.prototype.focus = function () {
    var self = this;
    this.mount();
    setTimeout(function () {
      self.root.scrollIntoView({ behavior: 'smooth', block: 'center' });
      self.root.classList.add('mm-ls-flash');
      setTimeout(function () { self.root.classList.remove('mm-ls-flash'); }, 2200);
    }, 400);
  };

  var instance = null;

  window.MMLearningSupports = {
    mount: function (root) {
      if (!root) return null;
      instance = new Supports(root);
      return instance.mount();
    },
    /* Bring the setup prompt to the parent after they link a child. */
    focusSetup: function () { if (instance) instance.focus(); }
  };
})();

/**
 * INLINE CHAT VISUALS - Interactive math visualizations in chat messages
 *
 * Renders interactive visual elements directly in chat bubbles:
 * - Function graphs (using function-plot library)
 * - Number lines with points and intervals
 * - Fraction visualizations
 * - Pie charts and bar charts
 * - Coordinate points
 * - Interactive sliders for "what-if" exploration
 *
 * Command syntax: [VISUAL_TYPE:params]
 */

class InlineChatVisuals {
    constructor() {
        this.visualCounter = 0;
        this.addStyles();
        this.setupModal();
        console.log('✅ InlineChatVisuals loaded - Interactive chat visuals ready!');
    }

    /**
     * Setup modal for expanded visual view (iMessage-style)
     */
    setupModal() {
        if (document.getElementById('icv-modal')) return;

        const modalHTML = `
        <div id="icv-modal" class="icv-modal" onclick="window.inlineChatVisuals.closeModal(event)">
            <div class="icv-modal-content" onclick="event.stopPropagation()">
                <button class="icv-modal-close" onclick="window.inlineChatVisuals.closeModal()">&times;</button>
                <div id="icv-modal-body" class="icv-modal-body"></div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    /**
     * Expand a visual into the modal for interaction
     */
    expandVisual(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const modal = document.getElementById('icv-modal');
        const modalBody = document.getElementById('icv-modal-body');
        if (!modal || !modalBody) return;

        // Clone the container content for the modal
        const clone = container.cloneNode(true);
        clone.classList.remove('icv-collapsed');
        clone.classList.add('icv-expanded');
        clone.removeAttribute('onclick');
        clone.id = containerId + '-modal';

        // Remove the expand hint from the clone
        const hint = clone.querySelector('.icv-expand-hint');
        if (hint) hint.remove();

        modalBody.innerHTML = '';
        modalBody.appendChild(clone);
        modal.classList.add('icv-modal-open');
        document.body.style.overflow = 'hidden';

        // Re-render graphs in modal if needed
        const graphEl = clone.querySelector('.icv-graph');
        if (graphEl && graphEl.dataset.config) {
            graphEl.id = containerId + '-modal-graph';
            setTimeout(() => this.renderGraph(graphEl.id), 100);
        }

        // Re-render slider graphs if needed
        const sliderGraphEl = clone.querySelector('.icv-slider-graph');
        if (sliderGraphEl && sliderGraphEl.dataset.config) {
            sliderGraphEl.id = containerId + '-modal-slider';
            setTimeout(() => this.renderSliderGraph(sliderGraphEl.id), 100);
        }
    }

    /**
     * Close the modal
     */
    closeModal(event) {
        if (event && event.target && !event.target.classList.contains('icv-modal')) return;
        const modal = document.getElementById('icv-modal');
        if (modal) {
            modal.classList.remove('icv-modal-open');
            document.body.style.overflow = '';
        }
    }

    /**
     * Process a message and replace visual commands with interactive elements
     * @param {string} message - The AI response text
     * @returns {Object} { html: string, hasVisuals: boolean }
     */
    processMessage(message) {
        let html = message;
        let hasVisuals = false;

        // Process each visual type
        const visualTypes = [
            { regex: /\[FUNCTION_GRAPH:([^\]]+)\]/g, handler: this.createFunctionGraph.bind(this) },
            { regex: /\[NUMBER_LINE:([^\]]+)\]/g, handler: this.createNumberLine.bind(this) },
            { regex: /\[FRACTION:([^\]]+)\]/g, handler: this.createFraction.bind(this) },
            { regex: /\[PIE_CHART:([^\]]+)\]/g, handler: this.createPieChart.bind(this) },
            { regex: /\[BAR_CHART:([^\]]+)\]/g, handler: this.createBarChart.bind(this) },
            { regex: /\[POINTS:([^\]]+)\]/g, handler: this.createPointsPlot.bind(this) },
            { regex: /\[SLIDER_GRAPH:([^\]]+)\]/g, handler: this.createSliderGraph.bind(this) },
            { regex: /\[UNIT_CIRCLE:?([^\]]*)\]/g, handler: this.createUnitCircle.bind(this) },
            { regex: /\[AREA_MODEL:([^\]]+)\]/g, handler: this.createAreaModel.bind(this) },
            { regex: /\[COMPARISON:([^\]]+)\]/g, handler: this.createComparison.bind(this) },
            // New enhanced visualizations
            { regex: /\[PYTHAGOREAN:([^\]]+)\]/g, handler: this.createPythagorean.bind(this) },
            { regex: /\[ANGLE:([^\]]+)\]/g, handler: this.createAngle.bind(this) },
            { regex: /\[SLOPE:([^\]]+)\]/g, handler: this.createSlope.bind(this) },
            { regex: /\[PERCENT_BAR:([^\]]+)\]/g, handler: this.createPercentBar.bind(this) },
            { regex: /\[PLACE_VALUE:([^\]]+)\]/g, handler: this.createPlaceValue.bind(this) },
            { regex: /\[RIGHT_TRIANGLE:([^\]]+)\]/g, handler: this.createRightTriangle.bind(this) },
            { regex: /\[INEQUALITY:([^\]]+)\]/g, handler: this.createInequality.bind(this) }
        ];

        for (const { regex, handler } of visualTypes) {
            html = html.replace(regex, (match, params) => {
                hasVisuals = true;
                try {
                    return handler(params);
                } catch (error) {
                    console.error(`[InlineChatVisuals] Error rendering ${match}:`, error);
                    return `<div class="icv-error">⚠️ Could not render visual</div>`;
                }
            });
        }

        return { html, hasVisuals };
    }

    /**
     * Parse parameters from command string
     * Supports: key=value, key="value with spaces", arrays [1,2,3]
     */
    parseParams(paramStr) {
        const params = {};
        if (!paramStr) return params;

        // Match key=value pairs, handling quoted strings and arrays
        const regex = /(\w+)=(?:"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([^\s,]+))/g;
        let match;

        while ((match = regex.exec(paramStr)) !== null) {
            const key = match[1];
            const value = match[2] || match[3] || (match[4] ? match[4].split(',').map(v => v.trim()) : match[5]);

            // Try to parse as number if applicable
            if (typeof value === 'string' && !isNaN(value)) {
                params[key] = parseFloat(value);
            } else if (value === 'true') {
                params[key] = true;
            } else if (value === 'false') {
                params[key] = false;
            } else {
                params[key] = value;
            }
        }

        // Handle simple comma-separated values if no key=value format
        if (Object.keys(params).length === 0 && paramStr.includes(',')) {
            const parts = paramStr.split(',').map(p => p.trim());
            if (parts.length > 0) {
                params.fn = parts[0];
                if (parts[1]) params.xMin = parseFloat(parts[1]);
                if (parts[2]) params.xMax = parseFloat(parts[2]);
            }
        } else if (Object.keys(params).length === 0) {
            // Single value - assume it's a function
            params.fn = paramStr.trim();
        }

        return params;
    }

    /**
     * Generate unique ID for visual elements
     */
    getUniqueId(prefix = 'icv') {
        return `${prefix}-${Date.now()}-${++this.visualCounter}`;
    }

    // ==========================================
    // FUNCTION GRAPH
    // [FUNCTION_GRAPH:fn=sin(x)/x,xMin=-10,xMax=10,title="Graph of sinc function"]
    // ==========================================
    createFunctionGraph(paramStr) {
        const params = this.parseParams(paramStr);
        const id = this.getUniqueId('graph');

        const fn = params.fn || params.function || 'x^2';
        const xMin = params.xMin ?? params.xmin ?? -10;
        const xMax = params.xMax ?? params.xmax ?? 10;
        const yMin = params.yMin ?? params.ymin ?? null;
        const yMax = params.yMax ?? params.ymax ?? null;
        const title = params.title || `Graph of y = ${fn}`;
        const color = params.color || '#667eea';

        // Store graph config for later rendering
        const graphConfig = JSON.stringify({
            fn, xMin, xMax, yMin, yMax, color
        }).replace(/"/g, '&quot;');

        return `
        <div class="icv-container icv-graph-container icv-collapsed" id="${id}-wrapper" onclick="window.inlineChatVisuals.expandVisual('${id}-wrapper')">
            <div class="icv-expand-hint">
                <span class="icv-expand-icon">⤢</span>
                <span>Tap to interact</span>
            </div>
            <div class="icv-title">${this.escapeHtml(title)}</div>
            <div class="icv-graph" id="${id}" data-config="${graphConfig}"></div>
            <div class="icv-controls">
                <button class="icv-btn icv-zoom-in" onclick="event.stopPropagation(); window.inlineChatVisuals.zoomGraph('${id}', 0.8)" title="Zoom In">➕</button>
                <button class="icv-btn icv-zoom-out" onclick="event.stopPropagation(); window.inlineChatVisuals.zoomGraph('${id}', 1.25)" title="Zoom Out">➖</button>
                <button class="icv-btn icv-reset" onclick="event.stopPropagation(); window.inlineChatVisuals.resetGraph('${id}')" title="Reset">↺</button>
            </div>
        </div>
        `;
    }

    /**
     * Render a function graph using function-plot (call after DOM insertion)
     */
    renderGraph(id) {
        const container = document.getElementById(id);
        if (!container || !window.functionPlot) {
            console.warn(`[InlineChatVisuals] Cannot render graph ${id}: container or function-plot not found`);
            return;
        }

        try {
            const config = JSON.parse(container.dataset.config.replace(/&quot;/g, '"'));
            const width = container.offsetWidth || 300;

            const plotConfig = {
                target: `#${id}`,
                width: width,
                height: 250,
                grid: true,
                xAxis: { domain: [config.xMin, config.xMax] },
                data: [{
                    fn: config.fn,
                    color: config.color
                }]
            };

            if (config.yMin !== null && config.yMax !== null) {
                plotConfig.yAxis = { domain: [config.yMin, config.yMax] };
            }

            const plot = functionPlot(plotConfig);
            container._functionPlot = plot;
            container._originalConfig = config;

            console.log(`[InlineChatVisuals] Rendered graph for: ${config.fn}`);
        } catch (error) {
            console.error(`[InlineChatVisuals] Error rendering graph ${id}:`, error);
            container.innerHTML = `<div class="icv-error">Could not render: ${error.message}</div>`;
        }
    }

    zoomGraph(id, factor) {
        const container = document.getElementById(id);
        if (!container || !container._functionPlot) return;

        const plot = container._functionPlot;
        const config = container._originalConfig;
        const xRange = config.xMax - config.xMin;
        const newRange = xRange * factor;
        const center = (config.xMax + config.xMin) / 2;

        config.xMin = center - newRange / 2;
        config.xMax = center + newRange / 2;
        container.dataset.config = JSON.stringify(config).replace(/"/g, '&quot;');

        this.renderGraph(id);
    }

    resetGraph(id) {
        const container = document.getElementById(id);
        if (!container) return;

        const originalConfig = JSON.parse(container.dataset.config.replace(/&quot;/g, '"'));
        container._originalConfig = originalConfig;
        this.renderGraph(id);
    }

    // ==========================================
    // NUMBER LINE
    // [NUMBER_LINE:min=-5,max=5,points=[-2,0,3],highlight=3,label="Number line showing -2, 0, and 3"]
    // ==========================================
    createNumberLine(paramStr) {
        const params = this.parseParams(paramStr);
        const id = this.getUniqueId('numline');

        const min = params.min ?? -10;
        const max = params.max ?? 10;
        const points = Array.isArray(params.points) ? params.points.map(Number) :
                       (params.point ? [Number(params.point)] : []);
        const highlight = params.highlight ?? null;
        const label = params.label || '';
        const showInterval = params.interval || null;
        const openCircle = params.open === true || params.open === 'true';

        const width = 320;
        const height = 80;
        const padding = 30;
        const lineY = 45;

        const scale = (width - 2 * padding) / (max - min);
        const toX = (val) => padding + (val - min) * scale;

        let svg = `<svg viewBox="0 0 ${width} ${height}" class="icv-number-line">`;

        // Draw main line
        svg += `<line x1="${padding}" y1="${lineY}" x2="${width - padding}" y2="${lineY}"
                      stroke="#333" stroke-width="2"/>`;

        // Draw arrow heads
        svg += `<polygon points="${width - padding},${lineY} ${width - padding - 8},${lineY - 5} ${width - padding - 8},${lineY + 5}" fill="#333"/>`;
        svg += `<polygon points="${padding},${lineY} ${padding + 8},${lineY - 5} ${padding + 8},${lineY + 5}" fill="#333"/>`;

        // Draw tick marks and labels
        for (let i = min; i <= max; i++) {
            const x = toX(i);
            const isHighlight = highlight !== null && i === Number(highlight);
            svg += `<line x1="${x}" y1="${lineY - 6}" x2="${x}" y2="${lineY + 6}"
                          stroke="${isHighlight ? '#667eea' : '#333'}" stroke-width="${isHighlight ? 3 : 1}"/>`;
            svg += `<text x="${x}" y="${lineY + 22}" text-anchor="middle"
                          fill="${isHighlight ? '#667eea' : '#333'}" font-size="12"
                          font-weight="${isHighlight ? 'bold' : 'normal'}">${i}</text>`;
        }

        // Draw interval shading if specified
        if (showInterval) {
            const [intMin, intMax] = showInterval.split(',').map(Number);
            const x1 = toX(intMin);
            const x2 = toX(intMax);
            svg += `<rect x="${x1}" y="${lineY - 15}" width="${x2 - x1}" height="30"
                          fill="rgba(102, 126, 234, 0.2)" rx="4"/>`;
        }

        // Draw points
        points.forEach(point => {
            const x = toX(point);
            const isHighlighted = highlight !== null && point === Number(highlight);
            const fillColor = isHighlighted ? '#667eea' : '#e74c3c';

            if (openCircle) {
                svg += `<circle cx="${x}" cy="${lineY}" r="8" fill="white" stroke="${fillColor}" stroke-width="3"/>`;
            } else {
                svg += `<circle cx="${x}" cy="${lineY}" r="8" fill="${fillColor}"/>`;
            }

            // Point label above
            svg += `<text x="${x}" y="${lineY - 15}" text-anchor="middle" fill="${fillColor}"
                          font-size="14" font-weight="bold">${point}</text>`;
        });

        svg += `</svg>`;

        return `
        <div class="icv-container icv-numline-container" id="${id}">
            ${label ? `<div class="icv-title">${this.escapeHtml(label)}</div>` : ''}
            ${svg}
        </div>
        `;
    }

    // ==========================================
    // FRACTION VISUALIZATION
    // [FRACTION:numerator=3,denominator=4,type=circle]
    // [FRACTION:compare=1/2,3/4]
    // ==========================================
    createFraction(paramStr) {
        const params = this.parseParams(paramStr);
        const id = this.getUniqueId('fraction');

        const type = params.type || 'bar';
        const numerator = params.numerator ?? params.num ?? 1;
        const denominator = params.denominator ?? params.denom ?? 2;
        const label = params.label || `${numerator}/${denominator}`;
        const compare = params.compare || null;

        if (compare) {
            return this.createFractionComparison(compare, id);
        }

        const width = type === 'circle' ? 120 : 200;
        const height = type === 'circle' ? 120 : 60;

        let svg = `<svg viewBox="0 0 ${width} ${height}" class="icv-fraction">`;

        if (type === 'circle') {
            // Pie-style fraction
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = 50;

            // Draw segments
            for (let i = 0; i < denominator; i++) {
                const startAngle = (i / denominator) * 2 * Math.PI - Math.PI / 2;
                const endAngle = ((i + 1) / denominator) * 2 * Math.PI - Math.PI / 2;

                const x1 = centerX + radius * Math.cos(startAngle);
                const y1 = centerY + radius * Math.sin(startAngle);
                const x2 = centerX + radius * Math.cos(endAngle);
                const y2 = centerY + radius * Math.sin(endAngle);

                const largeArc = (1 / denominator) > 0.5 ? 1 : 0;
                const filled = i < numerator;

                svg += `<path d="M${centerX},${centerY} L${x1},${y1} A${radius},${radius} 0 ${largeArc},1 ${x2},${y2} Z"
                              fill="${filled ? '#667eea' : '#e8e8e8'}" stroke="#333" stroke-width="1"/>`;
            }
        } else {
            // Bar-style fraction
            const barWidth = 180;
            const barHeight = 30;
            const startX = 10;
            const startY = 15;
            const segmentWidth = barWidth / denominator;

            for (let i = 0; i < denominator; i++) {
                const filled = i < numerator;
                svg += `<rect x="${startX + i * segmentWidth}" y="${startY}"
                              width="${segmentWidth - 2}" height="${barHeight}"
                              fill="${filled ? '#667eea' : '#e8e8e8'}" stroke="#333" stroke-width="1" rx="3"/>`;
            }
        }

        svg += `</svg>`;

        return `
        <div class="icv-container icv-fraction-container" id="${id}">
            <div class="icv-title">${this.escapeHtml(label)}</div>
            ${svg}
            <div class="icv-caption">${numerator} out of ${denominator} parts shaded</div>
        </div>
        `;
    }

    createFractionComparison(compareStr, id) {
        const fractions = compareStr.split(',').map(f => {
            const [num, denom] = f.trim().split('/').map(Number);
            return { num, denom, value: num / denom };
        });

        let html = `<div class="icv-container icv-fraction-compare" id="${id}">
            <div class="icv-title">Fraction Comparison</div>
            <div class="icv-fraction-row">`;

        fractions.forEach((f, idx) => {
            const barWidth = 100;
            const filledWidth = (f.num / f.denom) * barWidth;

            html += `
            <div class="icv-fraction-item">
                <div class="icv-fraction-label">${f.num}/${f.denom}</div>
                <div class="icv-fraction-bar-wrapper">
                    <div class="icv-fraction-bar" style="width: ${filledWidth}px; background: hsl(${240 - idx * 40}, 70%, 60%)"></div>
                </div>
                <div class="icv-fraction-decimal">${f.value.toFixed(3)}</div>
            </div>`;
        });

        html += `</div></div>`;
        return html;
    }

    // ==========================================
    // PIE CHART
    // [PIE_CHART:data="Apples:30,Oranges:25,Bananas:45",title="Fruit Distribution"]
    // ==========================================
    createPieChart(paramStr) {
        const params = this.parseParams(paramStr);
        const id = this.getUniqueId('pie');

        const dataStr = params.data || params.values || paramStr;
        const title = params.title || 'Pie Chart';

        // Parse data
        const segments = [];
        const items = dataStr.split(',');
        const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe', '#43e97b', '#38f9d7'];

        items.forEach((item, idx) => {
            const parts = item.trim().split(':');
            if (parts.length === 2) {
                segments.push({
                    label: parts[0].trim(),
                    value: parseFloat(parts[1]),
                    color: colors[idx % colors.length]
                });
            } else {
                segments.push({
                    label: `Segment ${idx + 1}`,
                    value: parseFloat(parts[0]),
                    color: colors[idx % colors.length]
                });
            }
        });

        const total = segments.reduce((sum, s) => sum + s.value, 0);
        const width = 250;
        const height = 180;
        const centerX = 90;
        const centerY = 90;
        const radius = 70;

        let svg = `<svg viewBox="0 0 ${width} ${height}" class="icv-pie-chart">`;

        let currentAngle = -Math.PI / 2;
        segments.forEach((segment, idx) => {
            const sliceAngle = (segment.value / total) * 2 * Math.PI;
            const endAngle = currentAngle + sliceAngle;

            const x1 = centerX + radius * Math.cos(currentAngle);
            const y1 = centerY + radius * Math.sin(currentAngle);
            const x2 = centerX + radius * Math.cos(endAngle);
            const y2 = centerY + radius * Math.sin(endAngle);

            const largeArc = sliceAngle > Math.PI ? 1 : 0;

            svg += `<path d="M${centerX},${centerY} L${x1},${y1} A${radius},${radius} 0 ${largeArc},1 ${x2},${y2} Z"
                          fill="${segment.color}" stroke="white" stroke-width="2"
                          class="icv-pie-slice" data-value="${segment.value}" data-label="${segment.label}"/>`;

            currentAngle = endAngle;
        });

        // Legend
        svg += `<g class="icv-pie-legend">`;
        segments.forEach((segment, idx) => {
            const y = 15 + idx * 22;
            const percent = ((segment.value / total) * 100).toFixed(1);
            svg += `<rect x="175" y="${y}" width="14" height="14" fill="${segment.color}" rx="2"/>`;
            svg += `<text x="195" y="${y + 12}" font-size="11" fill="#333">${segment.label} (${percent}%)</text>`;
        });
        svg += `</g>`;

        svg += `</svg>`;

        return `
        <div class="icv-container icv-pie-container" id="${id}">
            <div class="icv-title">${this.escapeHtml(title)}</div>
            ${svg}
        </div>
        `;
    }

    // ==========================================
    // BAR CHART
    // [BAR_CHART:data="Mon:5,Tue:8,Wed:3,Thu:10,Fri:7",title="Daily Values"]
    // ==========================================
    createBarChart(paramStr) {
        const params = this.parseParams(paramStr);
        const id = this.getUniqueId('bar');

        const dataStr = params.data || params.values || paramStr;
        const title = params.title || 'Bar Chart';
        const horizontal = params.horizontal === true;

        // Parse data
        const bars = [];
        const items = dataStr.split(',');
        const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe'];

        items.forEach((item, idx) => {
            const parts = item.trim().split(':');
            if (parts.length === 2) {
                bars.push({
                    label: parts[0].trim(),
                    value: parseFloat(parts[1]),
                    color: colors[idx % colors.length]
                });
            }
        });

        const maxValue = Math.max(...bars.map(b => b.value));
        const width = 300;
        const height = 160;
        const barAreaWidth = 240;
        const barAreaHeight = 120;
        const barWidth = barAreaWidth / bars.length - 10;
        const startX = 40;
        const startY = 130;

        let svg = `<svg viewBox="0 0 ${width} ${height}" class="icv-bar-chart">`;

        // Y-axis
        svg += `<line x1="${startX}" y1="10" x2="${startX}" y2="${startY}" stroke="#333" stroke-width="1"/>`;

        // X-axis
        svg += `<line x1="${startX}" y1="${startY}" x2="${width - 20}" y2="${startY}" stroke="#333" stroke-width="1"/>`;

        // Y-axis labels
        for (let i = 0; i <= 4; i++) {
            const value = (maxValue * i / 4).toFixed(0);
            const y = startY - (barAreaHeight * i / 4);
            svg += `<text x="${startX - 5}" y="${y + 4}" text-anchor="end" font-size="10" fill="#666">${value}</text>`;
            svg += `<line x1="${startX}" y1="${y}" x2="${startX + 5}" y2="${y}" stroke="#333" stroke-width="1"/>`;
        }

        // Bars
        bars.forEach((bar, idx) => {
            const barHeight = (bar.value / maxValue) * barAreaHeight;
            const x = startX + 15 + idx * (barWidth + 10);
            const y = startY - barHeight;

            svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}"
                          fill="${bar.color}" rx="3" class="icv-bar"/>`;

            // Value label on top
            svg += `<text x="${x + barWidth / 2}" y="${y - 5}" text-anchor="middle"
                          font-size="11" font-weight="bold" fill="#333">${bar.value}</text>`;

            // X-axis label
            svg += `<text x="${x + barWidth / 2}" y="${startY + 15}" text-anchor="middle"
                          font-size="10" fill="#333">${bar.label}</text>`;
        });

        svg += `</svg>`;

        return `
        <div class="icv-container icv-bar-container" id="${id}">
            <div class="icv-title">${this.escapeHtml(title)}</div>
            ${svg}
        </div>
        `;
    }

    // ==========================================
    // COORDINATE POINTS
    // [POINTS:points=(1,2),(3,4),(-1,-2),xMin=-5,xMax=5]
    // ==========================================
    createPointsPlot(paramStr) {
        const params = this.parseParams(paramStr);
        const id = this.getUniqueId('points');

        // Parse points from various formats
        let points = [];
        const pointsMatch = paramStr.match(/\((-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\)/g);
        if (pointsMatch) {
            points = pointsMatch.map(p => {
                const match = p.match(/\((-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\)/);
                return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
            });
        }

        const xMin = params.xMin ?? params.xmin ?? -10;
        const xMax = params.xMax ?? params.xmax ?? 10;
        const yMin = params.yMin ?? params.ymin ?? -10;
        const yMax = params.yMax ?? params.ymax ?? 10;
        const title = params.title || params.label || 'Coordinate Points';
        const connectPoints = params.connect === true || params.connect === 'true';

        const width = 280;
        const height = 280;
        const padding = 30;

        const scaleX = (width - 2 * padding) / (xMax - xMin);
        const scaleY = (height - 2 * padding) / (yMax - yMin);

        const toSvgX = (x) => padding + (x - xMin) * scaleX;
        const toSvgY = (y) => height - padding - (y - yMin) * scaleY;

        let svg = `<svg viewBox="0 0 ${width} ${height}" class="icv-points-plot">`;

        // Grid
        svg += `<g class="icv-grid" stroke="#eee" stroke-width="1">`;
        for (let x = Math.ceil(xMin); x <= xMax; x++) {
            svg += `<line x1="${toSvgX(x)}" y1="${padding}" x2="${toSvgX(x)}" y2="${height - padding}"/>`;
        }
        for (let y = Math.ceil(yMin); y <= yMax; y++) {
            svg += `<line x1="${padding}" y1="${toSvgY(y)}" x2="${width - padding}" y2="${toSvgY(y)}"/>`;
        }
        svg += `</g>`;

        // Axes
        if (xMin <= 0 && xMax >= 0) {
            svg += `<line x1="${toSvgX(0)}" y1="${padding}" x2="${toSvgX(0)}" y2="${height - padding}"
                          stroke="#333" stroke-width="2"/>`;
        }
        if (yMin <= 0 && yMax >= 0) {
            svg += `<line x1="${padding}" y1="${toSvgY(0)}" x2="${width - padding}" y2="${toSvgY(0)}"
                          stroke="#333" stroke-width="2"/>`;
        }

        // Axis labels
        svg += `<text x="${width - 15}" y="${toSvgY(0) - 5}" font-size="12" font-weight="bold">x</text>`;
        svg += `<text x="${toSvgX(0) + 5}" y="${padding - 5}" font-size="12" font-weight="bold">y</text>`;

        // Connect points if requested
        if (connectPoints && points.length > 1) {
            let pathD = `M ${toSvgX(points[0].x)},${toSvgY(points[0].y)}`;
            for (let i = 1; i < points.length; i++) {
                pathD += ` L ${toSvgX(points[i].x)},${toSvgY(points[i].y)}`;
            }
            svg += `<path d="${pathD}" fill="none" stroke="#667eea" stroke-width="2" stroke-dasharray="5,5"/>`;
        }

        // Points
        const pointColors = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12'];
        points.forEach((point, idx) => {
            const cx = toSvgX(point.x);
            const cy = toSvgY(point.y);
            const color = pointColors[idx % pointColors.length];

            svg += `<circle cx="${cx}" cy="${cy}" r="8" fill="${color}" stroke="white" stroke-width="2"/>`;
            svg += `<text x="${cx}" y="${cy - 12}" text-anchor="middle" font-size="11" font-weight="bold" fill="${color}">
                    (${point.x}, ${point.y})</text>`;
        });

        svg += `</svg>`;

        return `
        <div class="icv-container icv-points-container" id="${id}">
            <div class="icv-title">${this.escapeHtml(title)}</div>
            ${svg}
        </div>
        `;
    }

    // ==========================================
    // SLIDER GRAPH - Interactive exploration
    // [SLIDER_GRAPH:fn=a*x^2+b*x+c,params=a:1:-3:3,b:0:-5:5,c:0:-10:10]
    // ==========================================
    createSliderGraph(paramStr) {
        const params = this.parseParams(paramStr);
        const id = this.getUniqueId('slider');

        const baseFn = params.fn || 'a*x^2+b*x+c';
        const title = params.title || `Explore: y = ${baseFn}`;

        // Parse slider parameters: param:default:min:max
        const sliderParams = [];
        const paramsStr = params.params || 'a:1:-3:3';
        paramsStr.split(',').forEach(p => {
            const [name, defaultVal, min, max] = p.trim().split(':');
            sliderParams.push({
                name,
                default: parseFloat(defaultVal) || 1,
                min: parseFloat(min) || -10,
                max: parseFloat(max) || 10
            });
        });

        const sliderConfig = JSON.stringify({
            baseFn,
            sliders: sliderParams
        }).replace(/"/g, '&quot;');

        let slidersHtml = '';
        sliderParams.forEach(sp => {
            slidersHtml += `
            <div class="icv-slider-row">
                <label>${sp.name} = <span id="${id}-${sp.name}-val">${sp.default}</span></label>
                <input type="range" id="${id}-${sp.name}"
                       min="${sp.min}" max="${sp.max}" value="${sp.default}" step="0.1"
                       oninput="window.inlineChatVisuals.updateSliderGraph('${id}', '${sp.name}', this.value)">
            </div>`;
        });

        return `
        <div class="icv-container icv-slider-container icv-collapsed" id="${id}-wrapper" data-config="${sliderConfig}" onclick="window.inlineChatVisuals.expandVisual('${id}-wrapper')">
            <div class="icv-expand-hint">
                <span class="icv-expand-icon">⤢</span>
                <span>Tap to interact</span>
            </div>
            <div class="icv-title">${this.escapeHtml(title)}</div>
            <div class="icv-slider-graph" id="${id}"></div>
            <div class="icv-slider-controls">${slidersHtml}</div>
            <div class="icv-slider-equation" id="${id}-equation">y = ${baseFn}</div>
        </div>
        `;
    }

    updateSliderGraph(id, paramName, value) {
        const wrapper = document.getElementById(`${id}-wrapper`);
        if (!wrapper) return;

        const config = JSON.parse(wrapper.dataset.config.replace(/&quot;/g, '"'));
        const valueSpan = document.getElementById(`${id}-${paramName}-val`);
        if (valueSpan) valueSpan.textContent = value;

        // Build the function with current slider values
        let fn = config.baseFn;
        config.sliders.forEach(sp => {
            const slider = document.getElementById(`${id}-${sp.name}`);
            const val = slider ? parseFloat(slider.value) : sp.default;
            fn = fn.replace(new RegExp(`\\b${sp.name}\\b`, 'g'), `(${val})`);
        });

        // Update equation display
        const eqDisplay = document.getElementById(`${id}-equation`);
        if (eqDisplay) {
            let displayEq = config.baseFn;
            config.sliders.forEach(sp => {
                const slider = document.getElementById(`${id}-${sp.name}`);
                const val = slider ? slider.value : sp.default;
                displayEq = displayEq.replace(new RegExp(`\\b${sp.name}\\b`, 'g'), val);
            });
            eqDisplay.textContent = `y = ${displayEq}`;
        }

        // Re-render graph
        const container = document.getElementById(id);
        if (container && window.functionPlot) {
            try {
                functionPlot({
                    target: `#${id}`,
                    width: container.offsetWidth || 280,
                    height: 200,
                    grid: true,
                    xAxis: { domain: [-10, 10] },
                    yAxis: { domain: [-10, 10] },
                    data: [{ fn: fn, color: '#667eea' }]
                });
            } catch (e) {
                console.error('[SliderGraph] Render error:', e);
            }
        }
    }

    renderSliderGraph(id) {
        const wrapper = document.getElementById(`${id}-wrapper`);
        if (!wrapper) return;

        const config = JSON.parse(wrapper.dataset.config.replace(/&quot;/g, '"'));

        // Build initial function
        let fn = config.baseFn;
        config.sliders.forEach(sp => {
            fn = fn.replace(new RegExp(`\\b${sp.name}\\b`, 'g'), `(${sp.default})`);
        });

        const container = document.getElementById(id);
        if (container && window.functionPlot) {
            try {
                functionPlot({
                    target: `#${id}`,
                    width: container.offsetWidth || 280,
                    height: 200,
                    grid: true,
                    xAxis: { domain: [-10, 10] },
                    yAxis: { domain: [-10, 10] },
                    data: [{ fn: fn, color: '#667eea' }]
                });
            } catch (e) {
                console.error('[SliderGraph] Render error:', e);
            }
        }
    }

    // ==========================================
    // UNIT CIRCLE
    // [UNIT_CIRCLE:angle=45,highlight=true]
    // ==========================================
    createUnitCircle(paramStr) {
        const params = this.parseParams(paramStr || '');
        const id = this.getUniqueId('unitcircle');

        // Handle plain number input like [UNIT_CIRCLE:60] or [UNIT_CIRCLE:45]
        let angle = params.angle || params.highlight;
        if (!angle && paramStr) {
            const numMatch = paramStr.trim().match(/^(\d+(?:\.\d+)?)$/);
            if (numMatch) {
                angle = parseFloat(numMatch[1]);
            }
        }
        angle = parseFloat(angle) || 45;

        const showCoords = params.coords !== false;
        const title = params.title || `Unit Circle at ${angle}°`;

        const width = 280;
        const height = 280;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = 100;

        const angleRad = (angle * Math.PI) / 180;
        const pointX = centerX + radius * Math.cos(angleRad);
        const pointY = centerY - radius * Math.sin(angleRad);

        let svg = `<svg viewBox="0 0 ${width} ${height}" class="icv-unit-circle">`;

        // Grid
        svg += `<g stroke="#eee" stroke-width="1">`;
        for (let x = 0; x <= width; x += 20) {
            svg += `<line x1="${x}" y1="0" x2="${x}" y2="${height}"/>`;
        }
        for (let y = 0; y <= height; y += 20) {
            svg += `<line x1="0" y1="${y}" x2="${width}" y2="${y}"/>`;
        }
        svg += `</g>`;

        // Axes
        svg += `<line x1="0" y1="${centerY}" x2="${width}" y2="${centerY}" stroke="#333" stroke-width="2"/>`;
        svg += `<line x1="${centerX}" y1="0" x2="${centerX}" y2="${height}" stroke="#333" stroke-width="2"/>`;

        // Circle
        svg += `<circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="none" stroke="#667eea" stroke-width="2"/>`;

        // Standard angles (light markers)
        [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330].forEach(a => {
            const rad = (a * Math.PI) / 180;
            const x = centerX + (radius + 10) * Math.cos(rad);
            const y = centerY - (radius + 10) * Math.sin(rad);
            svg += `<text x="${x}" y="${y}" text-anchor="middle" font-size="8" fill="#999">${a}°</text>`;
        });

        // Highlighted angle
        svg += `<line x1="${centerX}" y1="${centerY}" x2="${pointX}" y2="${pointY}"
                      stroke="#e74c3c" stroke-width="3"/>`;
        svg += `<circle cx="${pointX}" cy="${pointY}" r="8" fill="#e74c3c"/>`;

        // Angle arc
        const arcRadius = 30;
        const arcEndX = centerX + arcRadius;
        const arcEndY = centerY;
        const largeArc = angle > 180 ? 1 : 0;
        svg += `<path d="M${arcEndX},${arcEndY} A${arcRadius},${arcRadius} 0 ${largeArc},0 ${centerX + arcRadius * Math.cos(angleRad)},${centerY - arcRadius * Math.sin(angleRad)}"
                      fill="none" stroke="#e74c3c" stroke-width="2"/>`;

        // Coordinates
        if (showCoords) {
            const cosVal = Math.cos(angleRad).toFixed(3);
            const sinVal = Math.sin(angleRad).toFixed(3);
            svg += `<text x="${pointX + 15}" y="${pointY - 10}" font-size="12" fill="#e74c3c" font-weight="bold">
                    (${cosVal}, ${sinVal})</text>`;

            // Reference lines
            svg += `<line x1="${pointX}" y1="${pointY}" x2="${pointX}" y2="${centerY}"
                          stroke="#e74c3c" stroke-width="1" stroke-dasharray="4,4"/>`;
            svg += `<line x1="${pointX}" y1="${pointY}" x2="${centerX}" y2="${pointY}"
                          stroke="#e74c3c" stroke-width="1" stroke-dasharray="4,4"/>`;
        }

        // Labels
        svg += `<text x="${centerX}" y="${height - 10}" text-anchor="middle" font-size="12">cos(${angle}°) = ${Math.cos(angleRad).toFixed(3)}</text>`;
        svg += `<text x="${centerX}" y="15" text-anchor="middle" font-size="12">sin(${angle}°) = ${Math.sin(angleRad).toFixed(3)}</text>`;

        svg += `</svg>`;

        return `
        <div class="icv-container icv-unitcircle-container" id="${id}">
            <div class="icv-title">${this.escapeHtml(title)}</div>
            ${svg}
        </div>
        `;
    }

    // ==========================================
    // AREA MODEL (for multiplication)
    // [AREA_MODEL:a=23,b=15]
    // ==========================================
    createAreaModel(paramStr) {
        const params = this.parseParams(paramStr);
        const id = this.getUniqueId('area');

        const a = params.a || 23;
        const b = params.b || 15;
        const title = params.title || `${a} × ${b} = ?`;

        // Break into tens and ones
        const aTens = Math.floor(a / 10) * 10;
        const aOnes = a % 10;
        const bTens = Math.floor(b / 10) * 10;
        const bOnes = b % 10;

        const width = 280;
        const height = 220;
        const startX = 50;
        const startY = 40;
        const cellWidth = 80;
        const cellHeight = 60;

        let svg = `<svg viewBox="0 0 ${width} ${height}" class="icv-area-model">`;

        // Top labels
        svg += `<text x="${startX + cellWidth/2}" y="20" text-anchor="middle" font-weight="bold" font-size="14">${aTens}</text>`;
        svg += `<text x="${startX + cellWidth + cellWidth/2}" y="20" text-anchor="middle" font-weight="bold" font-size="14">${aOnes}</text>`;

        // Left labels
        svg += `<text x="${startX - 10}" y="${startY + cellHeight/2 + 5}" text-anchor="end" font-weight="bold" font-size="14">${bTens}</text>`;
        svg += `<text x="${startX - 10}" y="${startY + cellHeight + cellHeight/2 + 5}" text-anchor="end" font-weight="bold" font-size="14">${bOnes}</text>`;

        // Cells
        const products = [
            { x: 0, y: 0, val: aTens * bTens, color: '#667eea' },
            { x: 1, y: 0, val: aOnes * bTens, color: '#764ba2' },
            { x: 0, y: 1, val: aTens * bOnes, color: '#f093fb' },
            { x: 1, y: 1, val: aOnes * bOnes, color: '#f5576c' }
        ];

        products.forEach(p => {
            const x = startX + p.x * cellWidth;
            const y = startY + p.y * cellHeight;
            svg += `<rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}"
                          fill="${p.color}" stroke="#333" stroke-width="2" rx="4"/>`;
            svg += `<text x="${x + cellWidth/2}" y="${y + cellHeight/2 + 6}" text-anchor="middle"
                          fill="white" font-size="18" font-weight="bold">${p.val}</text>`;
        });

        // Total
        const total = products.reduce((sum, p) => sum + p.val, 0);
        svg += `<text x="${width/2}" y="${startY + 2*cellHeight + 35}" text-anchor="middle"
                      font-size="16" font-weight="bold">
                ${products.map(p => p.val).join(' + ')} = ${total}</text>`;

        svg += `</svg>`;

        return `
        <div class="icv-container icv-area-container" id="${id}">
            <div class="icv-title">${this.escapeHtml(title)}</div>
            ${svg}
            <div class="icv-caption">${a} × ${b} = ${total}</div>
        </div>
        `;
    }

    // ==========================================
    // COMPARISON (visual comparison of values)
    // [COMPARISON:values=15,28,7,label="Compare these values"]
    // ==========================================
    createComparison(paramStr) {
        const params = this.parseParams(paramStr);
        const id = this.getUniqueId('compare');

        const values = Array.isArray(params.values) ? params.values.map(Number) : [10, 20, 15];
        const labels = Array.isArray(params.labels) ? params.labels : values.map((v, i) => `Value ${i + 1}`);
        const title = params.title || params.label || 'Comparison';

        const maxVal = Math.max(...values);
        const width = 280;
        const barMaxWidth = 200;

        let html = `<div class="icv-container icv-compare-container" id="${id}">
            <div class="icv-title">${this.escapeHtml(title)}</div>
            <div class="icv-compare-bars">`;

        const colors = ['#667eea', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6'];
        values.forEach((val, idx) => {
            const barWidth = (val / maxVal) * barMaxWidth;
            const label = labels[idx] || `Item ${idx + 1}`;
            html += `
            <div class="icv-compare-row">
                <span class="icv-compare-label">${this.escapeHtml(label)}</span>
                <div class="icv-compare-bar-wrapper">
                    <div class="icv-compare-bar" style="width: ${barWidth}px; background: ${colors[idx % colors.length]}"></div>
                    <span class="icv-compare-value">${val}</span>
                </div>
            </div>`;
        });

        html += `</div></div>`;
        return html;
    }

    // ==========================================
    // PYTHAGOREAN THEOREM VISUALIZATION
    // [PYTHAGOREAN:a=3,b=4,c=5] or [PYTHAGOREAN:a=3,b=4] (calculates c)
    // ==========================================
    createPythagorean(paramStr) {
        const params = this.parseParams(paramStr);
        const id = this.getUniqueId('pythag');

        const a = params.a || 3;
        const b = params.b || 4;
        const c = params.c || Math.sqrt(a * a + b * b);
        const showProof = params.proof !== false;
        const title = params.title || `Pythagorean Theorem: a² + b² = c²`;

        const width = 340;
        const height = 280;
        const scale = 25;
        const offsetX = 40;
        const offsetY = 200;

        // Calculate positions
        const ax = offsetX;
        const ay = offsetY;
        const bx = offsetX + a * scale;
        const by = offsetY;
        const cx = offsetX;
        const cy = offsetY - b * scale;

        let svg = `<svg viewBox="0 0 ${width} ${height}" class="icv-pythagorean">`;

        // Draw squares on each side if showProof
        if (showProof) {
            // Square on side a (bottom)
            svg += `<rect x="${ax}" y="${ay}" width="${a * scale}" height="${a * scale}"
                          fill="rgba(102, 126, 234, 0.3)" stroke="#667eea" stroke-width="2"/>`;
            svg += `<text x="${ax + (a * scale) / 2}" y="${ay + (a * scale) / 2 + 5}"
                          text-anchor="middle" font-size="14" fill="#667eea" font-weight="bold">a² = ${a * a}</text>`;

            // Square on side b (left) - rotated
            svg += `<rect x="${cx - b * scale}" y="${cy}" width="${b * scale}" height="${b * scale}"
                          fill="rgba(46, 204, 113, 0.3)" stroke="#2ecc71" stroke-width="2"/>`;
            svg += `<text x="${cx - (b * scale) / 2}" y="${cy + (b * scale) / 2 + 5}"
                          text-anchor="middle" font-size="14" fill="#2ecc71" font-weight="bold">b² = ${b * b}</text>`;

            // Square on hypotenuse (rotated) - simplified as label
            const hypCenterX = (ax + bx) / 2 + 30;
            const hypCenterY = (ay + cy) / 2 - 20;
            svg += `<text x="${hypCenterX}" y="${hypCenterY}" text-anchor="middle"
                          font-size="14" fill="#e74c3c" font-weight="bold">c² = ${Math.round(c * c * 100) / 100}</text>`;
        }

        // Draw the right triangle
        svg += `<polygon points="${ax},${ay} ${bx},${by} ${cx},${cy}"
                          fill="rgba(231, 76, 60, 0.2)" stroke="#e74c3c" stroke-width="3"/>`;

        // Right angle marker
        const markerSize = 12;
        svg += `<path d="M${ax + markerSize},${ay} L${ax + markerSize},${ay - markerSize} L${ax},${ay - markerSize}"
                      fill="none" stroke="#333" stroke-width="2"/>`;

        // Side labels
        svg += `<text x="${(ax + bx) / 2}" y="${ay + 20}" text-anchor="middle" font-size="14" font-weight="bold">a = ${a}</text>`;
        svg += `<text x="${ax - 15}" y="${(ay + cy) / 2}" text-anchor="middle" font-size="14" font-weight="bold">b = ${b}</text>`;
        svg += `<text x="${(bx + cx) / 2 + 15}" y="${(by + cy) / 2}" text-anchor="middle" font-size="14" font-weight="bold" fill="#e74c3c">c = ${Math.round(c * 100) / 100}</text>`;

        svg += `</svg>`;

        const equation = `${a}² + ${b}² = ${a * a} + ${b * b} = ${a * a + b * b} = ${Math.round(c * 100) / 100}²`;

        return `
        <div class="icv-container icv-pythag-container" id="${id}">
            <div class="icv-title">${this.escapeHtml(title)}</div>
            ${svg}
            <div class="icv-caption">${equation}</div>
        </div>
        `;
    }

    // ==========================================
    // ANGLE VISUALIZATION
    // [ANGLE:degrees=45,type=acute]
    // ==========================================
    createAngle(paramStr) {
        const params = this.parseParams(paramStr);
        const id = this.getUniqueId('angle');

        const degrees = params.degrees ?? params.deg ?? params.angle ?? 45;
        const type = params.type || this.getAngleType(degrees);
        const title = params.title || `${type.charAt(0).toUpperCase() + type.slice(1)} Angle: ${degrees}°`;
        const showArc = params.arc !== false;

        const width = 200;
        const height = 180;
        const centerX = 100;
        const centerY = 140;
        const radius = 80;
        const arcRadius = 30;

        const angleRad = (degrees * Math.PI) / 180;
        const endX = centerX + radius * Math.cos(-angleRad);
        const endY = centerY + radius * Math.sin(-angleRad);

        let svg = `<svg viewBox="0 0 ${width} ${height}" class="icv-angle">`;

        // First ray (horizontal)
        svg += `<line x1="${centerX}" y1="${centerY}" x2="${centerX + radius}" y2="${centerY}"
                      stroke="#667eea" stroke-width="3"/>`;

        // Second ray
        svg += `<line x1="${centerX}" y1="${centerY}" x2="${endX}" y2="${endY}"
                      stroke="#667eea" stroke-width="3"/>`;

        // Angle arc
        if (showArc) {
            const arcEndX = centerX + arcRadius * Math.cos(-angleRad);
            const arcEndY = centerY + arcRadius * Math.sin(-angleRad);
            const largeArc = degrees > 180 ? 1 : 0;
            svg += `<path d="M${centerX + arcRadius},${centerY} A${arcRadius},${arcRadius} 0 ${largeArc},0 ${arcEndX},${arcEndY}"
                          fill="none" stroke="#e74c3c" stroke-width="2"/>`;
        }

        // Right angle marker for 90 degrees
        if (degrees === 90) {
            svg += `<rect x="${centerX}" y="${centerY - 15}" width="15" height="15"
                          fill="none" stroke="#333" stroke-width="2"/>`;
        }

        // Degree label
        const labelRadius = arcRadius + 15;
        const labelAngle = -angleRad / 2;
        const labelX = centerX + labelRadius * Math.cos(labelAngle);
        const labelY = centerY + labelRadius * Math.sin(labelAngle);
        svg += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="14" font-weight="bold" fill="#e74c3c">${degrees}°</text>`;

        // Vertex point
        svg += `<circle cx="${centerX}" cy="${centerY}" r="4" fill="#333"/>`;

        svg += `</svg>`;

        const typeColors = {
            acute: '#2ecc71',
            right: '#3498db',
            obtuse: '#f39c12',
            straight: '#9b59b6',
            reflex: '#e74c3c'
        };

        return `
        <div class="icv-container icv-angle-container" id="${id}">
            <div class="icv-title">${this.escapeHtml(title)}</div>
            ${svg}
            <div class="icv-caption" style="color: ${typeColors[type] || '#333'}">
                ${type === 'acute' ? '0° < angle < 90°' :
                  type === 'right' ? 'angle = 90°' :
                  type === 'obtuse' ? '90° < angle < 180°' :
                  type === 'straight' ? 'angle = 180°' :
                  'angle > 180°'}
            </div>
        </div>
        `;
    }

    getAngleType(degrees) {
        if (degrees < 90) return 'acute';
        if (degrees === 90) return 'right';
        if (degrees < 180) return 'obtuse';
        if (degrees === 180) return 'straight';
        return 'reflex';
    }

    // ==========================================
    // SLOPE VISUALIZATION (Rise over Run)
    // [SLOPE:rise=3,run=4] or [SLOPE:m=0.75,point1=(0,1)]
    // ==========================================
    createSlope(paramStr) {
        const params = this.parseParams(paramStr);
        const id = this.getUniqueId('slope');

        let rise = params.rise ?? 3;
        let run = params.run ?? 4;
        const m = params.m ?? params.slope ?? (rise / run);
        const title = params.title || `Slope = Rise/Run = ${rise}/${run} = ${Math.round(m * 100) / 100}`;

        // If m is given but not rise/run, use reasonable values
        if (params.m !== undefined && params.rise === undefined) {
            if (m >= 0) {
                rise = Math.round(m * 4);
                run = 4;
            } else {
                rise = Math.round(m * 4);
                run = 4;
            }
        }

        const width = 280;
        const height = 220;
        const padding = 30;
        const gridSize = (width - 2 * padding) / 10;
        const centerX = width / 2;
        const centerY = height / 2 + 20;

        let svg = `<svg viewBox="0 0 ${width} ${height}" class="icv-slope">`;

        // Grid
        svg += `<g class="grid" stroke="#eee" stroke-width="1">`;
        for (let i = -5; i <= 5; i++) {
            const x = centerX + i * gridSize;
            const y = centerY - i * gridSize;
            svg += `<line x1="${x}" y1="${padding}" x2="${x}" y2="${height - padding}"/>`;
            svg += `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}"/>`;
        }
        svg += `</g>`;

        // Axes
        svg += `<line x1="${padding}" y1="${centerY}" x2="${width - padding}" y2="${centerY}" stroke="#333" stroke-width="2"/>`;
        svg += `<line x1="${centerX}" y1="${padding}" x2="${centerX}" y2="${height - padding}" stroke="#333" stroke-width="2"/>`;

        // Starting point
        const startX = centerX - (run / 2) * gridSize;
        const startY = centerY + (rise / 2) * gridSize;
        const endX = centerX + (run / 2) * gridSize;
        const endY = centerY - (rise / 2) * gridSize;

        // Line through points
        svg += `<line x1="${startX - 30}" y1="${startY + 30 * m}" x2="${endX + 30}" y2="${endY - 30 * m}"
                      stroke="#667eea" stroke-width="3"/>`;

        // Rise (vertical line)
        svg += `<line x1="${startX}" y1="${startY}" x2="${startX}" y2="${endY}"
                      stroke="#e74c3c" stroke-width="3" stroke-dasharray="8,4"/>`;
        svg += `<text x="${startX - 10}" y="${(startY + endY) / 2 + 5}" text-anchor="end"
                      font-size="14" font-weight="bold" fill="#e74c3c">Rise = ${rise}</text>`;

        // Run (horizontal line)
        svg += `<line x1="${startX}" y1="${endY}" x2="${endX}" y2="${endY}"
                      stroke="#2ecc71" stroke-width="3" stroke-dasharray="8,4"/>`;
        svg += `<text x="${(startX + endX) / 2}" y="${endY + 20}" text-anchor="middle"
                      font-size="14" font-weight="bold" fill="#2ecc71">Run = ${run}</text>`;

        // Points
        svg += `<circle cx="${startX}" cy="${startY}" r="6" fill="#667eea"/>`;
        svg += `<circle cx="${endX}" cy="${endY}" r="6" fill="#667eea"/>`;

        svg += `</svg>`;

        return `
        <div class="icv-container icv-slope-container" id="${id}">
            <div class="icv-title">${this.escapeHtml(title)}</div>
            ${svg}
            <div class="icv-caption">slope = rise ÷ run = ${rise} ÷ ${run} = ${Math.round(m * 1000) / 1000}</div>
        </div>
        `;
    }

    // ==========================================
    // PERCENT BAR VISUALIZATION
    // [PERCENT_BAR:percent=75,label="Progress"]
    // ==========================================
    createPercentBar(paramStr) {
        const params = this.parseParams(paramStr);
        const id = this.getUniqueId('percent');

        const percent = Math.min(100, Math.max(0, params.percent ?? params.value ?? 50));
        const label = params.label || `${percent}%`;
        const title = params.title || 'Percentage';
        const showParts = params.parts !== false;

        const width = 300;
        const height = showParts ? 120 : 80;
        const barWidth = 260;
        const barHeight = 30;
        const startX = 20;
        const startY = 25;

        let svg = `<svg viewBox="0 0 ${width} ${height}" class="icv-percent-bar">`;

        // Background bar
        svg += `<rect x="${startX}" y="${startY}" width="${barWidth}" height="${barHeight}"
                      fill="#e8e8e8" stroke="#ccc" stroke-width="1" rx="4"/>`;

        // Filled portion
        const filledWidth = (percent / 100) * barWidth;
        svg += `<rect x="${startX}" y="${startY}" width="${filledWidth}" height="${barHeight}"
                      fill="linear-gradient(90deg, #667eea, #764ba2)" rx="4"/>`;
        // Gradient workaround for SVG
        svg += `<defs>
            <linearGradient id="percentGrad${id}" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style="stop-color:#667eea"/>
                <stop offset="100%" style="stop-color:#764ba2"/>
            </linearGradient>
        </defs>`;
        svg += `<rect x="${startX}" y="${startY}" width="${filledWidth}" height="${barHeight}"
                      fill="url(#percentGrad${id})" rx="4"/>`;

        // Percentage label
        svg += `<text x="${startX + barWidth / 2}" y="${startY + barHeight / 2 + 6}"
                      text-anchor="middle" font-size="16" font-weight="bold" fill="#333">${percent}%</text>`;

        // Parts breakdown if enabled
        if (showParts) {
            const partY = startY + barHeight + 25;
            svg += `<text x="${startX}" y="${partY}" font-size="12" fill="#666">
                    ${percent} out of 100 = ${percent}/100 = ${percent}%</text>`;

            // Visual fraction
            const squareSize = 8;
            const squaresPerRow = 20;
            const squareY = partY + 10;
            for (let i = 0; i < 100; i++) {
                const row = Math.floor(i / squaresPerRow);
                const col = i % squaresPerRow;
                const filled = i < percent;
                svg += `<rect x="${startX + col * (squareSize + 2)}" y="${squareY + row * (squareSize + 2)}"
                              width="${squareSize}" height="${squareSize}"
                              fill="${filled ? '#667eea' : '#e8e8e8'}" rx="1"/>`;
            }
        }

        svg += `</svg>`;

        return `
        <div class="icv-container icv-percent-container" id="${id}">
            <div class="icv-title">${this.escapeHtml(title)}: ${this.escapeHtml(label)}</div>
            ${svg}
        </div>
        `;
    }

    // ==========================================
    // PLACE VALUE VISUALIZATION (Base-10 Blocks)
    // [PLACE_VALUE:number=347]
    // ==========================================
    createPlaceValue(paramStr) {
        const params = this.parseParams(paramStr);
        const id = this.getUniqueId('placevalue');

        const number = params.number ?? params.num ?? params.value ?? 123;
        const title = params.title || `Place Value: ${number}`;

        const hundreds = Math.floor(number / 100);
        const tens = Math.floor((number % 100) / 10);
        const ones = number % 10;

        const width = 320;
        const height = 180;

        let svg = `<svg viewBox="0 0 ${width} ${height}" class="icv-placevalue">`;

        // Hundreds (large squares)
        let xPos = 10;
        for (let h = 0; h < Math.min(hundreds, 3); h++) {
            svg += `<rect x="${xPos + h * 35}" y="20" width="30" height="30" fill="#667eea" stroke="#5a6fd6" stroke-width="2" rx="3"/>`;
            // Grid lines inside
            for (let i = 1; i < 10; i++) {
                svg += `<line x1="${xPos + h * 35 + (i % 10) * 3}" y1="20" x2="${xPos + h * 35 + (i % 10) * 3}" y2="50" stroke="#5a6fd6" stroke-width="0.5"/>`;
                svg += `<line x1="${xPos + h * 35}" y1="${20 + (i % 10) * 3}" x2="${xPos + h * 35 + 30}" y2="${20 + (i % 10) * 3}" stroke="#5a6fd6" stroke-width="0.5"/>`;
            }
        }
        if (hundreds > 3) {
            svg += `<text x="${xPos + 3 * 35 + 10}" y="40" font-size="12" fill="#667eea">+${hundreds - 3}</text>`;
        }
        svg += `<text x="${xPos + 50}" y="70" text-anchor="middle" font-size="14" font-weight="bold" fill="#667eea">${hundreds} hundreds</text>`;
        svg += `<text x="${xPos + 50}" y="85" text-anchor="middle" font-size="12" fill="#666">= ${hundreds * 100}</text>`;

        // Tens (vertical bars)
        xPos = 130;
        for (let t = 0; t < Math.min(tens, 9); t++) {
            svg += `<rect x="${xPos + t * 8}" y="20" width="6" height="30" fill="#2ecc71" stroke="#27ae60" stroke-width="1" rx="1"/>`;
        }
        svg += `<text x="${xPos + 35}" y="70" text-anchor="middle" font-size="14" font-weight="bold" fill="#2ecc71">${tens} tens</text>`;
        svg += `<text x="${xPos + 35}" y="85" text-anchor="middle" font-size="12" fill="#666">= ${tens * 10}</text>`;

        // Ones (small squares)
        xPos = 230;
        for (let o = 0; o < Math.min(ones, 9); o++) {
            const row = Math.floor(o / 3);
            const col = o % 3;
            svg += `<rect x="${xPos + col * 12}" y="${20 + row * 12}" width="10" height="10" fill="#e74c3c" stroke="#c0392b" stroke-width="1" rx="1"/>`;
        }
        svg += `<text x="${xPos + 15}" y="70" text-anchor="middle" font-size="14" font-weight="bold" fill="#e74c3c">${ones} ones</text>`;
        svg += `<text x="${xPos + 15}" y="85" text-anchor="middle" font-size="12" fill="#666">= ${ones}</text>`;

        // Total equation
        svg += `<text x="${width / 2}" y="120" text-anchor="middle" font-size="16" font-weight="bold" fill="#333">
                ${hundreds * 100} + ${tens * 10} + ${ones} = ${number}</text>`;

        // Place value table
        svg += `<g transform="translate(10, 135)">
            <rect x="0" y="0" width="300" height="35" fill="#f5f5f5" stroke="#ddd" rx="4"/>
            <line x1="100" y1="0" x2="100" y2="35" stroke="#ddd"/>
            <line x1="200" y1="0" x2="200" y2="35" stroke="#ddd"/>
            <text x="50" y="15" text-anchor="middle" font-size="11" fill="#666">Hundreds</text>
            <text x="150" y="15" text-anchor="middle" font-size="11" fill="#666">Tens</text>
            <text x="250" y="15" text-anchor="middle" font-size="11" fill="#666">Ones</text>
            <text x="50" y="30" text-anchor="middle" font-size="14" font-weight="bold" fill="#667eea">${hundreds}</text>
            <text x="150" y="30" text-anchor="middle" font-size="14" font-weight="bold" fill="#2ecc71">${tens}</text>
            <text x="250" y="30" text-anchor="middle" font-size="14" font-weight="bold" fill="#e74c3c">${ones}</text>
        </g>`;

        svg += `</svg>`;

        return `
        <div class="icv-container icv-placevalue-container" id="${id}">
            <div class="icv-title">${this.escapeHtml(title)}</div>
            ${svg}
        </div>
        `;
    }

    // ==========================================
    // RIGHT TRIANGLE WITH LABELED SIDES
    // [RIGHT_TRIANGLE:a=3,b=4,c=5,labels=true]
    // ==========================================
    createRightTriangle(paramStr) {
        const params = this.parseParams(paramStr);
        const id = this.getUniqueId('righttri');

        const a = params.a ?? params.opposite ?? 3;
        const b = params.b ?? params.adjacent ?? 4;
        const c = params.c ?? params.hypotenuse ?? Math.sqrt(a * a + b * b);
        const showLabels = params.labels !== false;
        const showAngles = params.angles === true;
        const title = params.title || 'Right Triangle';

        const width = 260;
        const height = 200;
        const scale = 30;
        const offsetX = 50;
        const offsetY = 160;

        const ax = offsetX;
        const ay = offsetY;
        const bx = offsetX + b * scale;
        const by = offsetY;
        const cx = offsetX;
        const cy = offsetY - a * scale;

        let svg = `<svg viewBox="0 0 ${width} ${height}" class="icv-right-triangle">`;

        // Triangle fill
        svg += `<polygon points="${ax},${ay} ${bx},${by} ${cx},${cy}"
                          fill="rgba(102, 126, 234, 0.15)" stroke="#667eea" stroke-width="3"/>`;

        // Right angle marker
        const markerSize = 15;
        svg += `<path d="M${ax + markerSize},${ay} L${ax + markerSize},${ay - markerSize} L${ax},${ay - markerSize}"
                      fill="none" stroke="#333" stroke-width="2"/>`;

        // Labels
        if (showLabels) {
            // Side a (vertical - opposite)
            svg += `<text x="${ax - 20}" y="${(ay + cy) / 2}" text-anchor="middle" font-size="16" font-weight="bold" fill="#e74c3c">a = ${a}</text>`;

            // Side b (horizontal - adjacent)
            svg += `<text x="${(ax + bx) / 2}" y="${ay + 25}" text-anchor="middle" font-size="16" font-weight="bold" fill="#2ecc71">b = ${b}</text>`;

            // Side c (hypotenuse)
            const cLabelX = (bx + cx) / 2 + 20;
            const cLabelY = (by + cy) / 2;
            svg += `<text x="${cLabelX}" y="${cLabelY}" text-anchor="start" font-size="16" font-weight="bold" fill="#667eea">c = ${Math.round(c * 100) / 100}</text>`;
        }

        // Angle labels if requested
        if (showAngles) {
            const angleA = Math.atan(b / a) * 180 / Math.PI;
            const angleB = Math.atan(a / b) * 180 / Math.PI;
            svg += `<text x="${cx + 25}" y="${cy + 20}" font-size="12" fill="#666">${Math.round(angleA)}°</text>`;
            svg += `<text x="${bx - 30}" y="${by - 10}" font-size="12" fill="#666">${Math.round(angleB)}°</text>`;
            svg += `<text x="${ax + 20}" y="${ay - 5}" font-size="12" fill="#666">90°</text>`;
        }

        // Vertices
        svg += `<circle cx="${ax}" cy="${ay}" r="4" fill="#333"/>`;
        svg += `<circle cx="${bx}" cy="${by}" r="4" fill="#333"/>`;
        svg += `<circle cx="${cx}" cy="${cy}" r="4" fill="#333"/>`;

        svg += `</svg>`;

        return `
        <div class="icv-container icv-righttri-container" id="${id}">
            <div class="icv-title">${this.escapeHtml(title)}</div>
            ${svg}
            <div class="icv-caption">a² + b² = c² → ${a}² + ${b}² = ${a*a} + ${b*b} = ${a*a + b*b}</div>
        </div>
        `;
    }

    // ==========================================
    // INEQUALITY VISUALIZATION
    // [INEQUALITY:expression="x > 3"] or [INEQUALITY:x=5,type=greater,inclusive=false]
    // ==========================================
    createInequality(paramStr) {
        const params = this.parseParams(paramStr);
        const id = this.getUniqueId('ineq');

        // Parse expression like "x > 3" or "x <= -2"
        let value = params.value ?? params.x ?? 0;
        let type = params.type || 'greater'; // greater, less, greaterEqual, lessEqual
        let inclusive = params.inclusive ?? false;

        if (params.expression) {
            const expr = params.expression;
            const match = expr.match(/x\s*(>=|<=|>|<)\s*(-?\d+)/);
            if (match) {
                const op = match[1];
                value = parseInt(match[2]);
                if (op === '>') { type = 'greater'; inclusive = false; }
                else if (op === '>=') { type = 'greater'; inclusive = true; }
                else if (op === '<') { type = 'less'; inclusive = false; }
                else if (op === '<=') { type = 'less'; inclusive = true; }
            }
        }

        const title = params.title || `x ${type === 'greater' ? (inclusive ? '≥' : '>') : (inclusive ? '≤' : '<')} ${value}`;

        const width = 320;
        const height = 80;
        const lineY = 45;
        const padding = 30;
        const min = Math.min(value - 5, -5);
        const max = Math.max(value + 5, 5);

        const scale = (width - 2 * padding) / (max - min);
        const toX = (val) => padding + (val - min) * scale;

        let svg = `<svg viewBox="0 0 ${width} ${height}" class="icv-inequality">`;

        // Number line
        svg += `<line x1="${padding}" y1="${lineY}" x2="${width - padding}" y2="${lineY}" stroke="#333" stroke-width="2"/>`;

        // Arrows
        svg += `<polygon points="${width - padding},${lineY} ${width - padding - 8},${lineY - 5} ${width - padding - 8},${lineY + 5}" fill="#333"/>`;
        svg += `<polygon points="${padding},${lineY} ${padding + 8},${lineY - 5} ${padding + 8},${lineY + 5}" fill="#333"/>`;

        // Tick marks
        for (let i = Math.ceil(min); i <= Math.floor(max); i++) {
            const x = toX(i);
            const isValue = i === value;
            svg += `<line x1="${x}" y1="${lineY - 6}" x2="${x}" y2="${lineY + 6}"
                          stroke="${isValue ? '#e74c3c' : '#333'}" stroke-width="${isValue ? 2 : 1}"/>`;
            svg += `<text x="${x}" y="${lineY + 20}" text-anchor="middle"
                          font-size="${isValue ? 14 : 11}" font-weight="${isValue ? 'bold' : 'normal'}"
                          fill="${isValue ? '#e74c3c' : '#333'}">${i}</text>`;
        }

        // Shading for solution region
        const valueX = toX(value);
        if (type === 'greater') {
            svg += `<rect x="${valueX}" y="${lineY - 12}" width="${width - padding - valueX}" height="24"
                          fill="rgba(102, 126, 234, 0.3)"/>`;
        } else {
            svg += `<rect x="${padding}" y="${lineY - 12}" width="${valueX - padding}" height="24"
                          fill="rgba(102, 126, 234, 0.3)"/>`;
        }

        // Circle at value point (open or closed)
        if (inclusive) {
            svg += `<circle cx="${valueX}" cy="${lineY}" r="8" fill="#e74c3c"/>`;
        } else {
            svg += `<circle cx="${valueX}" cy="${lineY}" r="8" fill="white" stroke="#e74c3c" stroke-width="3"/>`;
        }

        svg += `</svg>`;

        return `
        <div class="icv-container icv-inequality-container" id="${id}">
            <div class="icv-title">${this.escapeHtml(title)}</div>
            ${svg}
            <div class="icv-caption">${inclusive ? 'Closed circle: includes ' + value : 'Open circle: excludes ' + value}</div>
        </div>
        `;
    }

    // ==========================================
    // UTILITY METHODS
    // ==========================================

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Initialize all visuals in a container (call after DOM insertion)
     */
    initializeVisuals(container) {
        // Initialize function graphs
        container.querySelectorAll('.icv-graph').forEach(graphEl => {
            if (graphEl.id && !graphEl._functionPlot) {
                setTimeout(() => this.renderGraph(graphEl.id), 50);
            }
        });

        // Initialize slider graphs
        container.querySelectorAll('.icv-slider-graph').forEach(graphEl => {
            if (graphEl.id) {
                setTimeout(() => this.renderSliderGraph(graphEl.id), 50);
            }
        });
    }

    /**
     * Add CSS styles for visuals
     */
    addStyles() {
        if (document.getElementById('icv-styles')) return;

        const styles = `
        <style id="icv-styles">
            /* Apple-esque Clean Design */
            .icv-container {
                margin: 16px 0;
                padding: 20px;
                background: #ffffff;
                border-radius: 16px;
                box-shadow: 0 2px 12px rgba(0,0,0,0.08);
                font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
                border: 1px solid rgba(0,0,0,0.06);
            }

            .icv-title {
                font-size: 15px;
                font-weight: 600;
                color: #1d1d1f;
                margin-bottom: 14px;
                text-align: center;
                letter-spacing: -0.01em;
            }

            .icv-caption {
                font-size: 13px;
                color: #86868b;
                text-align: center;
                margin-top: 12px;
            }

            .icv-error {
                background: #fee;
                color: #c33;
                padding: 10px;
                border-radius: 8px;
                font-size: 13px;
            }

            /* Collapsed thumbnail state (iMessage-style) */
            .icv-collapsed {
                max-width: 200px;
                max-height: 150px;
                overflow: hidden;
                cursor: pointer;
                position: relative;
                padding: 12px;
                transition: transform 0.2s ease, box-shadow 0.2s ease;
            }

            .icv-collapsed:hover {
                transform: scale(1.02);
                box-shadow: 0 4px 20px rgba(0,0,0,0.12);
            }

            .icv-collapsed:active {
                transform: scale(0.98);
            }

            .icv-collapsed .icv-graph,
            .icv-collapsed .icv-slider-graph {
                min-height: 100px !important;
                max-height: 100px !important;
                pointer-events: none;
                transform: scale(0.6);
                transform-origin: top left;
            }

            .icv-collapsed .icv-controls,
            .icv-collapsed .icv-slider-controls,
            .icv-collapsed .icv-slider-equation {
                display: none;
            }

            .icv-collapsed .icv-title {
                font-size: 12px;
                margin-bottom: 8px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .icv-expand-hint {
                position: absolute;
                bottom: 8px;
                right: 8px;
                background: rgba(0,0,0,0.6);
                color: white;
                padding: 4px 8px;
                border-radius: 6px;
                font-size: 11px;
                display: flex;
                align-items: center;
                gap: 4px;
                z-index: 10;
                backdrop-filter: blur(4px);
            }

            .icv-expand-icon {
                font-size: 14px;
            }

            .icv-expanded .icv-expand-hint {
                display: none;
            }

            /* Modal styles */
            .icv-modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.85);
                z-index: 10000;
                justify-content: center;
                align-items: center;
                backdrop-filter: blur(8px);
            }

            .icv-modal-open {
                display: flex;
            }

            .icv-modal-content {
                position: relative;
                max-width: 90vw;
                max-height: 90vh;
                overflow: auto;
            }

            .icv-modal-body {
                background: transparent;
            }

            .icv-modal-body .icv-container {
                max-width: 500px;
                margin: 0 auto;
            }

            .icv-modal-body .icv-graph,
            .icv-modal-body .icv-slider-graph {
                min-height: 300px !important;
            }

            .icv-modal-close {
                position: absolute;
                top: -45px;
                right: 0;
                background: none;
                border: none;
                color: white;
                font-size: 32px;
                cursor: pointer;
                padding: 8px;
                line-height: 1;
                opacity: 0.8;
                transition: opacity 0.2s;
            }

            .icv-modal-close:hover {
                opacity: 1;
            }

            /* Graph Container */
            .icv-graph-container .icv-graph {
                background: white;
                border-radius: 8px;
                overflow: hidden;
                min-height: 250px;
            }

            .icv-controls {
                display: flex;
                justify-content: center;
                gap: 8px;
                margin-top: 10px;
            }

            .icv-btn {
                padding: 8px 16px;
                border: none;
                border-radius: 8px;
                background: #007aff;
                color: white;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .icv-btn:hover {
                background: #0066d6;
                transform: scale(1.02);
            }

            .icv-btn:active {
                transform: translateY(0);
            }

            /* Number Line */
            .icv-number-line {
                width: 100%;
                max-width: 320px;
                margin: 0 auto;
                display: block;
            }

            /* Fraction Styles */
            .icv-fraction-container .icv-fraction {
                display: block;
                margin: 0 auto;
            }

            .icv-fraction-compare {
                text-align: center;
            }

            .icv-fraction-row {
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                gap: 20px;
            }

            .icv-fraction-item {
                text-align: center;
            }

            .icv-fraction-label {
                font-size: 18px;
                font-weight: bold;
                color: #333;
            }

            .icv-fraction-bar-wrapper {
                width: 100px;
                height: 20px;
                background: #e8e8e8;
                border-radius: 4px;
                overflow: hidden;
                margin: 8px 0;
            }

            .icv-fraction-bar {
                height: 100%;
                transition: width 0.3s;
            }

            .icv-fraction-decimal {
                font-size: 12px;
                color: #666;
            }

            /* Pie Chart */
            .icv-pie-chart {
                display: block;
                margin: 0 auto;
                max-width: 100%;
            }

            .icv-pie-slice {
                transition: transform 0.2s;
                transform-origin: center;
            }

            .icv-pie-slice:hover {
                transform: scale(1.03);
            }

            /* Bar Chart */
            .icv-bar-chart {
                display: block;
                margin: 0 auto;
                max-width: 100%;
            }

            .icv-bar {
                transition: opacity 0.2s;
            }

            .icv-bar:hover {
                opacity: 0.85;
            }

            /* Points Plot */
            .icv-points-plot {
                display: block;
                margin: 0 auto;
                background: white;
                border-radius: 8px;
            }

            /* Slider Graph */
            .icv-slider-container {
                text-align: center;
            }

            .icv-slider-graph {
                background: white;
                border-radius: 8px;
                overflow: hidden;
                min-height: 200px;
            }

            .icv-slider-controls {
                margin-top: 15px;
            }

            .icv-slider-row {
                display: flex;
                align-items: center;
                gap: 10px;
                margin: 8px 0;
                justify-content: center;
            }

            .icv-slider-row label {
                min-width: 80px;
                text-align: right;
                font-size: 14px;
                font-weight: 500;
            }

            .icv-slider-row input[type="range"] {
                width: 150px;
                accent-color: #007aff;
            }

            .icv-slider-equation {
                margin-top: 12px;
                font-size: 16px;
                font-weight: 600;
                color: #007aff;
                font-family: 'SF Mono', 'Menlo', monospace;
            }

            /* Unit Circle */
            .icv-unit-circle {
                display: block;
                margin: 0 auto;
                background: white;
                border-radius: 8px;
            }

            /* Area Model */
            .icv-area-model {
                display: block;
                margin: 0 auto;
            }

            /* Comparison */
            .icv-compare-bars {
                max-width: 280px;
                margin: 0 auto;
            }

            .icv-compare-row {
                display: flex;
                align-items: center;
                margin: 8px 0;
                gap: 10px;
            }

            .icv-compare-label {
                min-width: 60px;
                font-size: 13px;
                text-align: right;
            }

            .icv-compare-bar-wrapper {
                flex: 1;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .icv-compare-bar {
                height: 24px;
                border-radius: 4px;
                transition: width 0.3s;
            }

            .icv-compare-value {
                font-size: 13px;
                font-weight: 600;
            }

            /* Responsive adjustments */
            @media (max-width: 480px) {
                .icv-container {
                    padding: 10px;
                    margin: 10px 0;
                }

                .icv-slider-row input[type="range"] {
                    width: 100px;
                }

                .icv-fraction-row {
                    flex-direction: column;
                    gap: 15px;
                }
            }

            /* Force light mode for visuals */
            .icv-container,
            .icv-container * {
                color-scheme: light;
            }

            /* Function-plot library overrides for clean white graphs */
            .icv-graph-container .function-plot,
            .icv-slider-graph .function-plot {
                background: #ffffff !important;
            }

            .icv-container .function-plot .x.axis path,
            .icv-container .function-plot .y.axis path,
            .icv-container .function-plot .x.axis line,
            .icv-container .function-plot .y.axis line {
                stroke: #d1d1d6 !important;
            }

            .icv-container .function-plot .x.axis text,
            .icv-container .function-plot .y.axis text {
                fill: #86868b !important;
                font-size: 11px !important;
            }

            .icv-container .function-plot .x.grid line,
            .icv-container .function-plot .y.grid line {
                stroke: #f0f0f5 !important;
            }

            /* SVG elements - clean grays */
            .icv-container svg text {
                fill: #1d1d1f;
            }

            .icv-container svg line[stroke="#eee"],
            .icv-container svg line[stroke="#ccc"] {
                stroke: #e5e5ea !important;
            }
        </style>
        `;

        document.head.insertAdjacentHTML('beforeend', styles);
    }
}

// Initialize global instance
window.inlineChatVisuals = new InlineChatVisuals();

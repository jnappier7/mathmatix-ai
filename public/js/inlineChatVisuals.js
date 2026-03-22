/**
 * INLINE CHAT VISUALS - Interactive math visualizations in chat messages
 *
 * Renders interactive visual elements directly in chat bubbles:
 * - Function graphs (using MathGraph canvas engine)
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
            const modalGraphId = containerId + '-modal-graph';
            graphEl.id = modalGraphId;
            // Clear cloned canvases — MathGraph will rebuild them
            graphEl.innerHTML = '';
            graphEl._mathGraph = null;
            graphEl._functionPlot = null;
            setTimeout(() => this.renderGraph(modalGraphId), 100);

            // Rebind zoom/reset buttons to the modal graph ID
            const zoomInBtn = clone.querySelector('.icv-zoom-in');
            const zoomOutBtn = clone.querySelector('.icv-zoom-out');
            const resetBtn = clone.querySelector('.icv-reset');

            if (zoomInBtn) {
                zoomInBtn.removeAttribute('onclick');
                zoomInBtn.replaceWith(zoomInBtn.cloneNode(true));
                const newZoomIn = clone.querySelector('.icv-zoom-in');
                newZoomIn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.zoomGraph(modalGraphId, 0.8);
                });
            }
            if (zoomOutBtn) {
                zoomOutBtn.removeAttribute('onclick');
                zoomOutBtn.replaceWith(zoomOutBtn.cloneNode(true));
                const newZoomOut = clone.querySelector('.icv-zoom-out');
                newZoomOut.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.zoomGraph(modalGraphId, 1.25);
                });
            }
            if (resetBtn) {
                resetBtn.removeAttribute('onclick');
                resetBtn.replaceWith(resetBtn.cloneNode(true));
                const newReset = clone.querySelector('.icv-reset');
                newReset.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.resetGraph(modalGraphId);
                });
            }
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
            { regex: /\[\s*FUNCTION_GRAPH\s*:\s*([^\]]+)\]/g, handler: this.createFunctionGraph.bind(this) },
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
            { regex: /\[INEQUALITY:([^\]]+)\]/g, handler: this.createInequality.bind(this) },
            // Algebra tiles inline preview + launcher
            { regex: /\[ALGEBRA_TILES:([^\]]+)\]/g, handler: this.createAlgebraTilesInline.bind(this) },
            // Integer counters (pos/neg with zero-pair cancellation)
            { regex: /\[COUNTERS:([^\]]+)\]/g, handler: this.createCounters.bind(this) },
            // Multi-representation linked views
            { regex: /\[MULTI_REP:([^\]]+)\]/g, handler: this.createMultiRepresentation.bind(this) }
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
     * Normalize function string - convert common text descriptions to math functions
     */
    normalizeFunctionString(fn) {
        if (!fn || typeof fn !== 'string') return 'x^2';

        let normalized = fn.trim().toLowerCase().replace(/\s+/g, '');

        // Map common text descriptions to actual functions
        const functionMappings = {
            'tangent': 'tan(x)',
            'thetangent': 'tan(x)',
            'thetangentfunction': 'tan(x)',
            'thetangentfunctions': 'tan(x)',
            'tangentfunction': 'tan(x)',
            'tangentfunctions': 'tan(x)',
            'sine': 'sin(x)',
            'thesine': 'sin(x)',
            'thesinefunction': 'sin(x)',
            'sinefunction': 'sin(x)',
            'cosine': 'cos(x)',
            'thecosine': 'cos(x)',
            'thecosinefunction': 'cos(x)',
            'cosinefunction': 'cos(x)',
            'quadratic': 'x^2',
            'parabola': 'x^2',
            'linear': 'x',
            'cubic': 'x^3',
            'exponential': 'exp(x)',
            'logarithm': 'log(x)',
            'logarithmic': 'log(x)',
            'squareroot': 'sqrt(x)',
            'absolute': 'abs(x)',
            'absolutevalue': 'abs(x)'
        };

        // Check if it's a text description that needs mapping
        if (functionMappings[normalized]) {
            return functionMappings[normalized];
        }

        // Check if the string contains keywords that suggest a function type
        const keywordPatterns = [
            { pattern: /bounce|parabola|quadratic|squared/, fn: 'x^2' },
            { pattern: /cubic|cubed/, fn: 'x^3' },
            { pattern: /tangent|tan/, fn: 'tan(x)' },
            { pattern: /sine|sin/, fn: 'sin(x)' },
            { pattern: /cosine|cos/, fn: 'cos(x)' },
            { pattern: /exponential|exp|growth/, fn: 'exp(x)' },
            { pattern: /logarithm|log|ln/, fn: 'log(x)' },
            { pattern: /sqrt|squareroot|root/, fn: 'sqrt(x)' },
            { pattern: /absolute|abs/, fn: 'abs(x)' },
            { pattern: /linear|line|straight/, fn: 'x' }
        ];

        for (const { pattern, fn: defaultFn } of keywordPatterns) {
            if (pattern.test(normalized)) {
                console.log(`[InlineChatVisuals] Mapped "${fn}" to "${defaultFn}" via keyword pattern`);
                return defaultFn;
            }
        }

        // Check if it looks like a valid math expression
        // Valid expressions contain: x, numbers, operators (+,-,*,/,^), parentheses, or known functions
        const validMathPattern = /^[\d\sx\+\-\*\/\^\(\)\.\,]+$|^(sin|cos|tan|log|ln|exp|sqrt|abs|pow)\s*\(/i;

        // Also check that any letter sequences are known math functions, not natural language
        const knownMathTokens = /^(sin|cos|tan|log|ln|exp|sqrt|abs|pow|asin|acos|atan|sinh|cosh|tanh|pi|x)$/i;
        const letterSequences = fn.trim().match(/[a-zA-Z]{2,}/g) || [];
        const allLettersAreMath = letterSequences.every(seq => knownMathTokens.test(seq));

        const looksLikeMath = allLettersAreMath && (
            validMathPattern.test(fn.trim()) ||
            (/[x\d]/.test(fn) && /[\+\-\*\/\^]/.test(fn))
        );

        if (looksLikeMath) {
            return fn;
        }

        // If it doesn't look like math and no keywords matched, default to x^2
        console.warn(`[InlineChatVisuals] Unrecognized function "${fn}", defaulting to x^2`);
        return 'x^2';
    }

    /**
     * Render a function graph using MathGraph canvas engine (call after DOM insertion)
     */
    renderGraph(id) {
        const container = document.getElementById(id);
        if (!container) {
            console.warn(`[InlineChatVisuals] Cannot render graph ${id}: container not found`);
            return;
        }

        if (!window.MathGraph) {
            console.warn(`[InlineChatVisuals] MathGraph not loaded`);
            container.innerHTML = `<div class="icv-error">Graph engine not loaded</div>`;
            return;
        }

        try {
            if (!container.dataset.config) {
                console.warn(`[InlineChatVisuals] No config found for graph ${id}`);
                container.innerHTML = `<div class="icv-error">Graph configuration missing</div>`;
                return;
            }

            // Destroy previous instance if re-rendering
            if (container._mathGraph) {
                container._mathGraph.destroy();
                container._mathGraph = null;
            }

            container.innerHTML = '';

            const config = JSON.parse(container.dataset.config.replace(/&quot;/g, '"'));
            if (!config || typeof config !== 'object') {
                throw new Error('Invalid graph configuration');
            }

            const fn = this.normalizeFunctionString(config.fn);

            // Store original config for reset
            if (!container._originalConfig) {
                container._originalConfig = { ...config, fn };
            }

            const graph = new MathGraph(container, {
                fn: fn,
                xMin: config.xMin ?? -10,
                xMax: config.xMax ?? 10,
                yMin: config.yMin ?? null,
                yMax: config.yMax ?? null,
                color: config.color || '#667eea',
                interactive: true
            });

            container._mathGraph = graph;
            container._functionPlot = graph; // backward compat flag

            console.log(`[InlineChatVisuals] Rendered graph for: ${fn}`);
        } catch (error) {
            console.error(`[InlineChatVisuals] Error rendering graph ${id}:`, error);
            const hasRenderedContent = container.querySelector('canvas');
            if (!hasRenderedContent) {
                container.innerHTML = `<div class="icv-error">Could not render: ${error.message}</div>`;
            }
        }
    }

    zoomGraph(id, factor) {
        const container = document.getElementById(id);
        if (!container || !container._mathGraph) return;
        container._mathGraph.zoom(factor);
    }

    resetGraph(id) {
        const container = document.getElementById(id);
        if (!container) return;

        if (container._mathGraph) {
            container._mathGraph.reset();
        }
    }

    // ==========================================
    // NUMBER LINE (Enhanced)
    // Basic:     [NUMBER_LINE:min=-5,max=5,points=[-2,0,3],highlight=3,label="L"]
    // Jumps:     [NUMBER_LINE:min=0,max=10,jumps=[(0,3,"+3"),(3,7,"+4")],label="Adding 3 + 4"]
    // Fractions: [NUMBER_LINE:min=0,max=2,denominator=4,points=[1/4,3/4,5/4],label="Fractions"]
    // Inequality:[NUMBER_LINE:min=-5,max=5,inequality=">2",label="x > 2"]
    // ==========================================
    createNumberLine(paramStr) {
        const params = this.parseParams(paramStr);
        const id = this.getUniqueId('numline');

        const min = params.min ?? -10;
        const max = params.max ?? 10;
        const highlight = params.highlight ?? null;
        const label = params.label || '';
        const showInterval = params.interval || null;
        const openCircle = params.open === true || params.open === 'true';
        const interactive = params.interactive !== false;
        const denominator = params.denominator ? parseInt(params.denominator) : null;
        const inequality = params.inequality || null;

        // Parse points (support fractions like 1/4, 3/4)
        let points = [];
        if (Array.isArray(params.points)) {
            points = params.points.map(p => {
                if (typeof p === 'string' && p.includes('/')) {
                    const [n, d] = p.split('/').map(Number);
                    return n / d;
                }
                return Number(p);
            });
        } else if (params.point) {
            points = [Number(params.point)];
        }

        // Parse jumps: array of [from, to, label] tuples
        // Format in params: "(0,3,+3),(3,7,+4)"
        let jumps = [];
        if (params.jumps) {
            const jumpStr = Array.isArray(params.jumps) ? params.jumps.join(',') : params.jumps;
            const jumpRegex = /\(([^,]+),([^,]+),([^)]+)\)/g;
            let jm;
            while ((jm = jumpRegex.exec(jumpStr)) !== null) {
                jumps.push({ from: Number(jm[1]), to: Number(jm[2]), label: jm[3].trim().replace(/^["']+|["']+$/g, '') });
            }
        }

        // Dimensions — taller if we have jumps
        const width = 340;
        const hasJumps = jumps.length > 0;
        const hasInequality = inequality !== null;
        const height = hasJumps ? 110 : 80;
        const padding = 30;
        const lineY = hasJumps ? 65 : 45;

        const range = max - min || 1; // Prevent division by zero when min==max
        const scale = (width - 2 * padding) / range;
        const toX = (val) => padding + (val - min) * scale;

        let svg = `<svg viewBox="0 0 ${width} ${height}" class="icv-number-line" id="${id}-svg">`;

        // Inequality shading (background, drawn first)
        if (hasInequality) {
            const ineqMatch = inequality.match(/([<>]=?)\s*(-?\d+\.?\d*)/);
            if (ineqMatch) {
                const op = ineqMatch[1];
                const val = parseFloat(ineqMatch[2]);
                const valX = toX(val);
                const isOpen = !op.includes('=');

                // Shading
                if (op.startsWith('>')) {
                    svg += `<rect x="${valX}" y="${lineY - 12}" width="${width - padding - valX}" height="24"
                                  fill="rgba(102, 126, 234, 0.15)" rx="4"/>`;
                    // Arrow indicating continues right
                    svg += `<polygon points="${width - padding - 2},${lineY} ${width - padding - 10},${lineY - 5} ${width - padding - 10},${lineY + 5}"
                                     fill="rgba(102, 126, 234, 0.4)"/>`;
                } else {
                    svg += `<rect x="${padding}" y="${lineY - 12}" width="${valX - padding}" height="24"
                                  fill="rgba(102, 126, 234, 0.15)" rx="4"/>`;
                    svg += `<polygon points="${padding + 2},${lineY} ${padding + 10},${lineY - 5} ${padding + 10},${lineY + 5}"
                                     fill="rgba(102, 126, 234, 0.4)"/>`;
                }

                // Endpoint circle (open or closed)
                svg += `<circle cx="${valX}" cy="${lineY}" r="7" fill="${isOpen ? 'white' : '#667eea'}"
                              stroke="#667eea" stroke-width="2.5"/>`;
            }
        }

        // Draw main line
        svg += `<line x1="${padding}" y1="${lineY}" x2="${width - padding}" y2="${lineY}"
                      stroke="#333" stroke-width="2"/>`;

        // Arrow heads
        svg += `<polygon points="${width - padding},${lineY} ${width - padding - 8},${lineY - 5} ${width - padding - 8},${lineY + 5}" fill="#333"/>`;
        svg += `<polygon points="${padding},${lineY} ${padding + 8},${lineY - 5} ${padding + 8},${lineY + 5}" fill="#333"/>`;

        // Tick marks — integer or fraction-based
        if (denominator && denominator > 0) {
            // Fraction tick marks
            const step = 1 / denominator;
            for (let val = min; val <= max + step / 2; val += step) {
                const roundedVal = Math.round(val * denominator) / denominator;
                const x = toX(roundedVal);
                const isWhole = Math.abs(roundedVal - Math.round(roundedVal)) < 0.001;
                const tickHeight = isWhole ? 8 : 4;
                const isHighlightTick = highlight !== null && Math.abs(roundedVal - Number(highlight)) < 0.001;

                svg += `<line x1="${x}" y1="${lineY - tickHeight}" x2="${x}" y2="${lineY + tickHeight}"
                              stroke="${isHighlightTick ? '#667eea' : '#555'}" stroke-width="${isWhole ? 1.5 : 1}"/>`;

                // Labels: show whole numbers always, fractions only at labeled points
                if (isWhole) {
                    svg += `<text x="${x}" y="${lineY + 22}" text-anchor="middle" fill="#333" font-size="11">${Math.round(roundedVal)}</text>`;
                }
            }

            // Fraction labels for points
            points.forEach(p => {
                const x = toX(p);
                const frac = this.decimalToFraction(p, denominator);
                svg += `<text x="${x}" y="${lineY + 22}" text-anchor="middle" fill="#667eea" font-size="10" font-weight="bold">${frac}</text>`;
            });
        } else {
            // Integer tick marks
            for (let i = min; i <= max; i++) {
                const x = toX(i);
                const isHighlightTick = highlight !== null && i === Number(highlight);
                svg += `<line x1="${x}" y1="${lineY - 6}" x2="${x}" y2="${lineY + 6}"
                              stroke="${isHighlightTick ? '#667eea' : '#333'}" stroke-width="${isHighlightTick ? 3 : 1}"/>`;
                svg += `<text x="${x}" y="${lineY + 22}" text-anchor="middle"
                              fill="${isHighlightTick ? '#667eea' : '#333'}" font-size="12"
                              font-weight="${isHighlightTick ? 'bold' : 'normal'}">${i}</text>`;
            }
        }

        // Interval shading
        if (showInterval) {
            const [intMin, intMax] = showInterval.split(',').map(Number);
            const x1 = toX(intMin);
            const x2 = toX(intMax);
            svg += `<rect x="${x1}" y="${lineY - 15}" width="${x2 - x1}" height="30"
                          fill="rgba(102, 126, 234, 0.2)" rx="4"/>`;
        }

        // Jump arcs (hop arrows above the line for addition/subtraction)
        const jumpColors = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12'];
        jumps.forEach((jump, idx) => {
            const x1 = toX(jump.from);
            const x2 = toX(jump.to);
            const midX = (x1 + x2) / 2;
            const arcHeight = Math.min(30, Math.abs(x2 - x1) * 0.4);
            const color = jumpColors[idx % jumpColors.length];
            const direction = jump.to > jump.from ? 1 : -1;

            // Arc path
            svg += `<path d="M ${x1} ${lineY - 3} Q ${midX} ${lineY - 3 - arcHeight} ${x2} ${lineY - 3}"
                          fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`;

            // Arrowhead at destination (symmetric triangle)
            const arrowSize = 6;
            svg += `<polygon points="${x2},${lineY - 3} ${x2 - direction * arrowSize},${lineY - 3 - arrowSize} ${x2 - direction * arrowSize},${lineY - 3 + arrowSize}"
                              fill="${color}"/>`;

            // Start dot
            svg += `<circle cx="${x1}" cy="${lineY}" r="4" fill="${color}"/>`;

            // Jump label above arc
            svg += `<text x="${midX}" y="${lineY - arcHeight - 8}" text-anchor="middle"
                          fill="${color}" font-size="12" font-weight="bold">${this.escapeHtml(jump.label)}</text>`;
        });

        // Draw draggable points
        points.forEach((point, idx) => {
            const x = toX(point);
            const isHighlighted = highlight !== null && Math.abs(point - Number(highlight)) < 0.001;
            const fillColor = isHighlighted ? '#667eea' : '#e74c3c';

            if (openCircle) {
                svg += `<circle cx="${x}" cy="${lineY}" r="8" fill="white" stroke="${fillColor}" stroke-width="3"
                            class="${interactive ? 'icv-draggable-point' : ''}"
                            data-point-idx="${idx}" data-numline-id="${id}" data-min="${min}" data-max="${max}"
                            data-padding="${padding}" data-scale="${scale}"/>`;
            } else {
                svg += `<circle cx="${x}" cy="${lineY}" r="8" fill="${fillColor}"
                            class="${interactive ? 'icv-draggable-point' : ''}"
                            data-point-idx="${idx}" data-numline-id="${id}" data-min="${min}" data-max="${max}"
                            data-padding="${padding}" data-scale="${scale}"/>`;
            }

            // Point label above
            const labelText = denominator ? this.decimalToFraction(point, denominator) : point;
            svg += `<text x="${x}" y="${lineY - 15}" text-anchor="middle" fill="${fillColor}"
                          font-size="14" font-weight="bold" class="icv-point-label" data-point-idx="${idx}">${labelText}</text>`;
        });

        svg += `</svg>`;

        // Controls: send to AI button (only if interactive)
        const controlsHtml = interactive ? `
            <div class="icv-numline-controls">
                <button class="icv-numline-send-btn" data-numline-id="${id}">Send to AI</button>
            </div>` : '';

        return `
        <div class="icv-container icv-numline-container" id="${id}"
             data-config="${this.escapeHtml(JSON.stringify({ min, max, points, highlight, openCircle, interactive, denominator, jumps, inequality }))}">
            ${label ? `<div class="icv-title">${this.escapeHtml(label)}</div>` : ''}
            ${svg}
            ${interactive && points.length > 0 ? `<div class="icv-interactive-value" id="${id}-value">Drag points to explore</div>` : ''}
            ${controlsHtml}
        </div>
        `;
    }

    /**
     * Convert a decimal to a fraction string for display
     * e.g., 0.25 with denominator 4 → "1/4"
     */
    decimalToFraction(val, denominator) {
        if (!denominator || isNaN(val)) return String(val);
        const numerator = Math.round(val * denominator);
        if (numerator === 0) return '0';
        if (denominator === 1) return String(numerator);
        // Simplify
        const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
        const g = gcd(Math.abs(numerator), denominator);
        const sNum = numerator / g;
        const sDen = denominator / g;
        if (sDen === 1) return String(sNum);
        return `${sNum}/${sDen}`;
    }

    /**
     * Initialize draggable number line points
     */
    initDraggablePoints(container) {
        const points = container.querySelectorAll('.icv-draggable-point');
        points.forEach(point => {
            if (point._dragInit) return;
            point._dragInit = true;

            const svg = point.closest('svg');
            if (!svg) return;

            let isDragging = false;

            const getMousePos = (e) => {
                const rect = svg.getBoundingClientRect();
                const svgWidth = parseFloat(svg.getAttribute('viewBox').split(' ')[2]);
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                return (clientX - rect.left) / rect.width * svgWidth;
            };

            const onStart = (e) => {
                e.preventDefault();
                isDragging = true;
                point.classList.add('dragging');
                point.setAttribute('r', '10');
            };

            const onMove = (e) => {
                if (!isDragging) return;
                e.preventDefault();

                const svgX = getMousePos(e);
                const min = parseFloat(point.dataset.min);
                const max = parseFloat(point.dataset.max);
                const padding = parseFloat(point.dataset.padding);
                const scale = parseFloat(point.dataset.scale);

                // Clamp to number line bounds
                const clampedX = Math.max(padding, Math.min(svgX, padding + (max - min) * scale));
                const value = Math.round(((clampedX - padding) / scale) + min);
                const snappedX = padding + (value - min) * scale;

                point.setAttribute('cx', snappedX);

                // Update label
                const idx = point.dataset.pointIdx;
                const label = svg.querySelector(`.icv-point-label[data-point-idx="${idx}"]`);
                if (label) {
                    label.setAttribute('x', snappedX);
                    label.textContent = value;
                }

                // Update value tooltip
                const containerId = point.dataset.numlineId;
                const tooltip = document.getElementById(`${containerId}-value`);
                if (tooltip) {
                    tooltip.textContent = `Point: ${value}`;
                    tooltip.style.opacity = '1';
                }
            };

            const onEnd = () => {
                if (!isDragging) return;
                isDragging = false;
                point.classList.remove('dragging');
                point.setAttribute('r', '8');
            };

            point.addEventListener('mousedown', onStart);
            point.addEventListener('touchstart', onStart, { passive: false });
            document.addEventListener('mousemove', onMove);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchend', onEnd);
        });
    }

    /**
     * Initialize number line send-to-AI buttons
     */
    initNumlineSendButtons(container) {
        container.querySelectorAll('.icv-numline-send-btn').forEach(btn => {
            if (btn._clickInit) return;
            btn._clickInit = true;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const numlineId = btn.dataset.numlineId;
                this.sendNumlineToAI(numlineId);
            });
        });
    }

    /**
     * Send current number line state to AI chat
     */
    sendNumlineToAI(numlineId) {
        const container = document.getElementById(numlineId);
        if (!container) return;

        const config = JSON.parse(container.dataset.config || '{}');

        // Read current point positions from SVG (may have been dragged)
        const svg = container.querySelector('svg');
        const currentPoints = [];
        if (svg) {
            svg.querySelectorAll('.icv-point-label').forEach(label => {
                currentPoints.push(label.textContent);
            });
        }

        const pointsStr = currentPoints.length > 0 ? currentPoints.join(', ') : 'none';
        const message = `I'm looking at a number line from ${config.min} to ${config.max}. Points at: ${pointsStr}.`;

        const chatInput = document.getElementById('userInput') ||
                          document.getElementById('chatInput') ||
                          document.getElementById('mastery-input');
        if (chatInput) {
            chatInput.value = message;
            chatInput.focus();
        }
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

        let svg = `<svg viewBox="0 0 ${width} ${height}" class="icv-fraction" id="${id}-svg">`;

        if (type === 'circle') {
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = 50;

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
                              fill="${filled ? '#667eea' : '#e8e8e8'}" stroke="#333" stroke-width="1"
                              class="icv-fraction-segment" data-segment="${i}" data-filled="${filled}"
                              data-fraction-id="${id}" data-denom="${denominator}"/>`;
            }
        } else {
            const barWidth = 180;
            const barHeight = 30;
            const startX = 10;
            const startY = 15;
            const segmentWidth = barWidth / denominator;

            for (let i = 0; i < denominator; i++) {
                const filled = i < numerator;
                svg += `<rect x="${startX + i * segmentWidth}" y="${startY}"
                              width="${segmentWidth - 2}" height="${barHeight}"
                              fill="${filled ? '#667eea' : '#e8e8e8'}" stroke="#333" stroke-width="1" rx="3"
                              class="icv-fraction-segment" data-segment="${i}" data-filled="${filled}"
                              data-fraction-id="${id}" data-denom="${denominator}"/>`;
            }
        }

        svg += `</svg>`;

        return `
        <div class="icv-container icv-fraction-container" id="${id}"
             data-config="${this.escapeHtml(JSON.stringify({ numerator, denominator, type }))}">
            <div class="icv-title">${this.escapeHtml(label)}</div>
            ${svg}
            <div class="icv-fraction-counter" id="${id}-counter">${numerator} out of ${denominator} parts shaded</div>
            <div class="icv-caption" style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Tap segments to toggle</div>
        </div>
        `;
    }

    /**
     * Initialize clickable fraction segments
     */
    initInteractiveFractions(container) {
        const segments = container.querySelectorAll('.icv-fraction-segment');
        segments.forEach(seg => {
            if (seg._clickInit) return;
            seg._clickInit = true;

            seg.addEventListener('click', (e) => {
                e.stopPropagation();
                const filled = seg.dataset.filled === 'true';
                const fractionId = seg.dataset.fractionId;

                // Toggle fill
                if (filled) {
                    seg.setAttribute('fill', '#e8e8e8');
                    seg.dataset.filled = 'false';
                } else {
                    seg.setAttribute('fill', '#667eea');
                    seg.dataset.filled = 'true';
                }

                // Update counter
                const denom = parseInt(seg.dataset.denom);
                const fractionContainer = document.getElementById(fractionId);
                if (!fractionContainer) return;
                const allSegments = fractionContainer.querySelectorAll('.icv-fraction-segment');
                let filledCount = 0;
                allSegments.forEach(s => { if (s.dataset.filled === 'true') filledCount++; });

                const counter = document.getElementById(`${fractionId}-counter`);
                if (counter) {
                    counter.textContent = `${filledCount} out of ${denom} parts shaded`;
                    counter.style.color = filledCount === denom ? '#10b981' : '#667eea';
                }
            });
        });
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
                <input type="range" class="icv-slider-input" id="${id}-${sp.name}"
                       min="${sp.min}" max="${sp.max}" value="${sp.default}" step="0.1"
                       data-param="${sp.name}">
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

        // Re-render graph with MathGraph
        const container = document.getElementById(id);
        if (container && window.MathGraph) {
            try {
                if (container._mathGraph) {
                    container._mathGraph.destroy();
                }
                container.innerHTML = '';
                container._mathGraph = new MathGraph(container, {
                    fn: fn,
                    xMin: -10, xMax: 10,
                    yMin: -10, yMax: 10,
                    color: '#667eea',
                    interactive: false
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
        if (container && window.MathGraph) {
            try {
                container._mathGraph = new MathGraph(container, {
                    fn: fn,
                    xMin: -10, xMax: 10,
                    yMin: -10, yMax: 10,
                    color: '#667eea',
                    interactive: false
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
    // INTEGER COUNTERS (Pos/Neg with Zero-Pair Cancellation)
    // [COUNTERS:positive=5,negative=3,label="Show 5 + (-3)"]
    // [COUNTERS:expression=5+(-3),animate=true]
    // [COUNTERS:positive=4,negative=4,label="Zero pairs: 4 + (-4) = 0"]
    // ==========================================
    createCounters(paramStr) {
        const params = this.parseParams(paramStr);
        const id = this.getUniqueId('counters');

        let positive = params.positive ?? params.pos ?? 0;
        let negative = params.negative ?? params.neg ?? 0;
        const label = params.label || '';
        const animate = params.animate === true || params.animate === 'true';
        const showZeroPairs = params.zeroPairs !== false && params.zeroPairs !== 'false';

        // Parse expression like "5+(-3)" or "-2+7" or "3-5"
        if (params.expression || params.expr) {
            const expr = params.expression || params.expr;
            const parsed = this.parseCounterExpression(expr);
            positive = parsed.positive;
            negative = parsed.negative;
        }

        positive = Math.abs(parseInt(positive)) || 0;
        negative = Math.abs(parseInt(negative)) || 0;

        // Calculate zero pairs
        const zeroPairs = Math.min(positive, negative);
        const remainPositive = positive - zeroPairs;
        const remainNegative = negative - zeroPairs;
        const result = remainPositive - remainNegative;

        // Build counter layout
        const config = JSON.stringify({ positive, negative, zeroPairs, showZeroPairs, animate });

        // Build the visual HTML
        let html = `
        <div class="icv-container icv-counters-container" id="${id}"
             data-config="${this.escapeHtml(config)}" data-positive="${positive}" data-negative="${negative}">
            ${label ? `<div class="icv-title">${this.escapeHtml(label)}</div>` : ''}
            <div class="icv-counters-workspace" id="${id}-workspace">`;

        // Render zero pairs section (paired counters)
        if (showZeroPairs && zeroPairs > 0) {
            html += `<div class="icv-counters-section">
                <div class="icv-counters-section-label">Zero Pairs</div>
                <div class="icv-zero-pairs" id="${id}-zero-pairs">`;
            for (let i = 0; i < zeroPairs; i++) {
                html += `
                <div class="icv-zero-pair ${animate ? 'icv-counter-animate' : ''}" style="${animate ? `animation-delay: ${i * 0.15}s` : ''}">
                    <div class="icv-counter icv-counter-pos" data-counter-id="${id}" data-value="1" data-idx="${i}">+</div>
                    <div class="icv-counter icv-counter-neg" data-counter-id="${id}" data-value="-1" data-idx="${i}">−</div>
                    <div class="icv-zero-line"></div>
                </div>`;
            }
            html += `</div></div>`;
        }

        // Remaining positive counters
        if (remainPositive > 0) {
            html += `<div class="icv-counters-section">
                <div class="icv-counters-section-label">Positive</div>
                <div class="icv-counters-row" id="${id}-positive">`;
            for (let i = 0; i < remainPositive; i++) {
                html += `<div class="icv-counter icv-counter-pos icv-counter-draggable ${animate ? 'icv-counter-animate' : ''}"
                    data-counter-id="${id}" data-value="1" data-idx="${zeroPairs + i}"
                    draggable="true"
                    style="${animate ? `animation-delay: ${(zeroPairs + i) * 0.1}s` : ''}">+</div>`;
            }
            html += `</div></div>`;
        }

        // Remaining negative counters
        if (remainNegative > 0) {
            html += `<div class="icv-counters-section">
                <div class="icv-counters-section-label">Negative</div>
                <div class="icv-counters-row" id="${id}-negative">`;
            for (let i = 0; i < remainNegative; i++) {
                html += `<div class="icv-counter icv-counter-neg icv-counter-draggable ${animate ? 'icv-counter-animate' : ''}"
                    data-counter-id="${id}" data-value="-1" data-idx="${zeroPairs + i}"
                    draggable="true"
                    style="${animate ? `animation-delay: ${(zeroPairs + i) * 0.1}s` : ''}">−</div>`;
            }
            html += `</div></div>`;
        }

        html += `</div>`;

        // Result display
        html += `
            <div class="icv-counters-result" id="${id}-result">
                <span class="icv-counters-equation">
                    ${positive > 0 ? `<span class="icv-result-pos">${positive}</span>` : ''}
                    ${negative > 0 ? ` + <span class="icv-result-neg">(−${negative})</span>` : ''}
                    = <span class="icv-result-answer">${result}</span>
                </span>
            </div>`;

        // Add/remove buttons + send to AI
        html += `
            <div class="icv-counters-controls" id="${id}-controls">
                <button class="icv-counter-add-btn icv-counter-add-pos" data-counter-id="${id}" data-add="pos" title="Add positive counter">+ Add Positive</button>
                <button class="icv-counter-add-btn icv-counter-add-neg" data-counter-id="${id}" data-add="neg" title="Add negative counter">+ Add Negative</button>
                <button class="icv-counter-cancel-btn" data-counter-id="${id}" title="Cancel zero pairs">Cancel Zero Pairs</button>
                <button class="icv-counter-send-btn" data-counter-id="${id}" title="Send to AI">Send to AI</button>
            </div>
        </div>`;

        return html;
    }

    /**
     * Parse a math expression into positive/negative counter counts
     * e.g., "5+(-3)" → { positive: 5, negative: 3 }
     * e.g., "3-5" → { positive: 3, negative: 5 }
     * e.g., "-2+7" → { positive: 7, negative: 2 }
     */
    parseCounterExpression(expr) {
        let positive = 0;
        let negative = 0;

        // Normalize: remove spaces
        const cleaned = expr.replace(/\s/g, '');

        // Match terms: +N, -N, +(-N), -(-N), N
        const termRegex = /([+-]?)(\(?\-?\d+\)?)/g;
        let match;

        while ((match = termRegex.exec(cleaned)) !== null) {
            if (!match[0]) continue;
            const sign = match[1];
            let valueStr = match[2].replace(/[()]/g, '');
            let value = parseInt(valueStr);

            if (sign === '-') value = -value;

            if (value > 0) {
                positive += value;
            } else if (value < 0) {
                negative += Math.abs(value);
            }
        }

        return { positive, negative };
    }

    /**
     * Initialize interactive counter behaviors (drag, add, cancel, send)
     */
    initInteractiveCounters(container) {
        // Add positive counter button
        container.querySelectorAll('.icv-counter-add-pos').forEach(btn => {
            if (btn._clickInit) return;
            btn._clickInit = true;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const counterId = btn.dataset.counterId;
                this.addCounter(counterId, 'pos');
            });
        });

        // Add negative counter button
        container.querySelectorAll('.icv-counter-add-neg').forEach(btn => {
            if (btn._clickInit) return;
            btn._clickInit = true;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const counterId = btn.dataset.counterId;
                this.addCounter(counterId, 'neg');
            });
        });

        // Cancel zero pairs button
        container.querySelectorAll('.icv-counter-cancel-btn').forEach(btn => {
            if (btn._clickInit) return;
            btn._clickInit = true;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const counterId = btn.dataset.counterId;
                this.cancelZeroPairs(counterId);
            });
        });

        // Send to AI button
        container.querySelectorAll('.icv-counter-send-btn').forEach(btn => {
            if (btn._clickInit) return;
            btn._clickInit = true;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const counterId = btn.dataset.counterId;
                this.sendCountersToAI(counterId);
            });
        });

        // Make individual counters removable on double-click
        container.querySelectorAll('.icv-counter-draggable').forEach(counter => {
            if (counter._clickInit) return;
            counter._clickInit = true;
            counter.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const counterId = counter.dataset.counterId;
                const value = parseInt(counter.dataset.value);
                counter.style.animation = 'icv-counter-pop 0.3s ease forwards';
                setTimeout(() => {
                    counter.remove();
                    this.updateCounterResult(counterId);
                }, 300);
            });
        });

        // Drag-and-drop for pairing counters
        this.initCounterDragDrop(container);
    }

    /**
     * Drag-and-drop to create zero pairs by dragging pos onto neg (or vice versa)
     */
    initCounterDragDrop(container) {
        const counters = container.querySelectorAll('.icv-counter-draggable');

        counters.forEach(counter => {
            if (counter._dragInit) return;
            counter._dragInit = true;

            counter.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify({
                    counterId: counter.dataset.counterId,
                    value: counter.dataset.value,
                    idx: counter.dataset.idx
                }));
                counter.classList.add('icv-counter-dragging');
            });

            counter.addEventListener('dragend', () => {
                counter.classList.remove('icv-counter-dragging');
            });

            counter.addEventListener('dragover', (e) => {
                e.preventDefault();
                const dragValue = e.dataTransfer.types.includes('text/plain');
                if (dragValue) {
                    counter.classList.add('icv-counter-drop-target');
                }
            });

            counter.addEventListener('dragleave', () => {
                counter.classList.remove('icv-counter-drop-target');
            });

            counter.addEventListener('drop', (e) => {
                e.preventDefault();
                counter.classList.remove('icv-counter-drop-target');

                try {
                    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                    const draggedValue = parseInt(data.value);
                    const targetValue = parseInt(counter.dataset.value);

                    // Only cancel if opposite signs
                    if (draggedValue + targetValue === 0) {
                        const counterId = counter.dataset.counterId;

                        // Find and animate both counters
                        const draggedCounter = container.querySelector(
                            `.icv-counter-draggable[data-counter-id="${counterId}"][data-idx="${data.idx}"]`
                        );

                        // Animate cancellation
                        if (draggedCounter) {
                            draggedCounter.style.animation = 'icv-zero-pair-cancel 0.5s ease forwards';
                        }
                        counter.style.animation = 'icv-zero-pair-cancel 0.5s ease forwards';

                        setTimeout(() => {
                            if (draggedCounter) draggedCounter.remove();
                            counter.remove();
                            this.updateCounterResult(counterId);
                        }, 500);
                    }
                } catch { /* ignore bad drops */ }
            });
        });
    }

    /**
     * Add a counter to an existing counter workspace
     */
    addCounter(counterId, type) {
        const container = document.getElementById(counterId);
        if (!container) return;

        const isPos = type === 'pos';
        const sectionId = `${counterId}-${isPos ? 'positive' : 'negative'}`;
        let section = document.getElementById(sectionId);

        // Create section if it doesn't exist
        if (!section) {
            const workspace = document.getElementById(`${counterId}-workspace`);
            if (!workspace) return;

            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'icv-counters-section';
            sectionDiv.innerHTML = `
                <div class="icv-counters-section-label">${isPos ? 'Positive' : 'Negative'}</div>
                <div class="icv-counters-row" id="${sectionId}"></div>
            `;
            workspace.appendChild(sectionDiv);
            section = document.getElementById(sectionId);
        }

        // Find next index
        const existing = section.querySelectorAll('.icv-counter-draggable');
        const nextIdx = existing.length;

        const counter = document.createElement('div');
        counter.className = `icv-counter ${isPos ? 'icv-counter-pos' : 'icv-counter-neg'} icv-counter-draggable icv-counter-animate`;
        counter.dataset.counterId = counterId;
        counter.dataset.value = isPos ? '1' : '-1';
        counter.dataset.idx = `new-${nextIdx}`;
        counter.draggable = true;
        counter.textContent = isPos ? '+' : '−';

        section.appendChild(counter);

        // Init interactivity on the new counter
        this.initInteractiveCounters(container);
        this.updateCounterResult(counterId);
    }

    /**
     * Auto-cancel all zero pairs with animation
     */
    cancelZeroPairs(counterId) {
        const container = document.getElementById(counterId);
        if (!container) return;

        const posCounters = Array.from(container.querySelectorAll('.icv-counter-pos.icv-counter-draggable'));
        const negCounters = Array.from(container.querySelectorAll('.icv-counter-neg.icv-counter-draggable'));

        const pairs = Math.min(posCounters.length, negCounters.length);

        if (pairs === 0) return;

        // Animate pairs canceling
        for (let i = 0; i < pairs; i++) {
            setTimeout(() => {
                if (posCounters[i]) {
                    posCounters[i].style.animation = 'icv-zero-pair-cancel 0.5s ease forwards';
                }
                if (negCounters[i]) {
                    negCounters[i].style.animation = 'icv-zero-pair-cancel 0.5s ease forwards';
                }

                setTimeout(() => {
                    if (posCounters[i]) posCounters[i].remove();
                    if (negCounters[i]) negCounters[i].remove();

                    // Update after last pair
                    if (i === pairs - 1) {
                        // Clean up empty sections
                        container.querySelectorAll('.icv-counters-section').forEach(sec => {
                            const row = sec.querySelector('.icv-counters-row');
                            if (row && row.children.length === 0) sec.remove();
                        });
                        // Also remove zero pairs section
                        const zpSection = document.getElementById(`${counterId}-zero-pairs`);
                        if (zpSection) zpSection.closest('.icv-counters-section')?.remove();

                        this.updateCounterResult(counterId);
                    }
                }, 500);
            }, i * 200);
        }
    }

    /**
     * Recalculate and update the result display
     */
    updateCounterResult(counterId) {
        const container = document.getElementById(counterId);
        if (!container) return;

        const posCount = container.querySelectorAll('.icv-counter-pos').length;
        const negCount = container.querySelectorAll('.icv-counter-neg').length;
        const result = posCount - negCount;

        const resultEl = document.getElementById(`${counterId}-result`);
        if (resultEl) {
            resultEl.innerHTML = `
                <span class="icv-counters-equation">
                    ${posCount > 0 ? `<span class="icv-result-pos">${posCount}</span>` : ''}
                    ${negCount > 0 ? ` + <span class="icv-result-neg">(−${negCount})</span>` : ''}
                    = <span class="icv-result-answer">${result}</span>
                </span>
            `;
        }

        // Update data attributes
        container.dataset.positive = posCount;
        container.dataset.negative = negCount;
    }

    /**
     * Send current counter state to AI chat
     */
    sendCountersToAI(counterId) {
        const container = document.getElementById(counterId);
        if (!container) return;

        const posCount = container.querySelectorAll('.icv-counter-pos').length;
        const negCount = container.querySelectorAll('.icv-counter-neg').length;
        const result = posCount - negCount;

        const message = `I'm working with counters: ${posCount} positive and ${negCount} negative. The result is ${result}.`;

        const chatInput = document.getElementById('userInput') ||
                          document.getElementById('chatInput') ||
                          document.getElementById('mastery-input');

        if (chatInput) {
            chatInput.value = message;
            chatInput.focus();
        }
    }

    // ==========================================
    // ALGEBRA TILES INLINE
    // [ALGEBRA_TILES:expression] - Shows inline tile preview + opens full workspace
    // ==========================================
    createAlgebraTilesInline(paramStr) {
        const params = this.parseParams(paramStr);
        const id = this.getUniqueId('atiles');

        // The expression can be in params.expression, params.eq, or as the raw paramStr
        const expression = params.expression || params.eq || params.fn || paramStr.trim();

        // Parse the expression into tile representations
        const tiles = this.parseExpressionToTiles(expression);

        // Build inline tile visual
        let tilesHtml = '';
        tiles.forEach(tile => {
            for (let i = 0; i < Math.abs(tile.count); i++) {
                const isPositive = tile.count > 0;
                tilesHtml += `<div class="icv-algebra-tile icv-tile-${isPositive ? 'pos' : 'neg'}-${tile.type}">${tile.label}</div>`;
            }
        });

        const title = params.title || `Algebra Tiles: ${expression}`;

        return `
        <div class="icv-container icv-algebra-tiles-container" id="${id}"
             data-expression="${this.escapeHtml(expression)}">
            <div class="icv-title">${this.escapeHtml(title)}</div>
            <div class="icv-algebra-workspace">${tilesHtml}</div>
            <div class="icv-algebra-expression">\\(${expression}\\)</div>
            <button class="icv-open-tiles-btn" data-expression="${this.escapeHtml(expression)}" data-tiles-id="${id}">
                Open Interactive Workspace
            </button>
        </div>
        `;
    }

    /**
     * Parse an algebraic expression into tile types
     * e.g., "2x^2 + 3x - 5" → [{type: 'x2', count: 2, label: 'x²'}, {type: 'x', count: 3, label: 'x'}, {type: 'unit', count: -5, label: '1'}]
     */
    parseExpressionToTiles(expression) {
        const tiles = [];
        if (!expression) return tiles;

        const expr = expression.replace(/\s/g, '');

        // Match terms: optional sign, optional coefficient, variable part
        const termRegex = /([+-]?)(\d*)(x\^2|x²|x|y|xy)?/g;
        let match;

        while ((match = termRegex.exec(expr)) !== null) {
            if (!match[0]) continue;
            const sign = match[1] === '-' ? -1 : 1;
            const coeffStr = match[2];
            const varPart = match[3];

            let coeff = coeffStr ? parseInt(coeffStr) : (varPart ? 1 : 0);
            if (coeff === 0 && !varPart) continue;
            coeff *= sign;

            if (varPart === 'x^2' || varPart === 'x²') {
                tiles.push({ type: 'x2', count: coeff, label: 'x²' });
            } else if (varPart === 'xy') {
                tiles.push({ type: 'x2', count: coeff, label: 'xy' });
            } else if (varPart === 'x') {
                tiles.push({ type: 'x', count: coeff, label: 'x' });
            } else if (varPart === 'y') {
                tiles.push({ type: 'x', count: coeff, label: 'y' });
            } else if (!varPart && coeffStr) {
                tiles.push({ type: 'unit', count: coeff, label: '1' });
            }
        }

        return tiles;
    }

    /**
     * Initialize algebra tiles "Open Interactive Workspace" buttons
     */
    initAlgebraTilesButtons(container) {
        container.querySelectorAll('.icv-open-tiles-btn').forEach(btn => {
            if (btn._clickInit) return;
            btn._clickInit = true;

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const expression = btn.dataset.expression;
                this.openAlgebraTilesWorkspace(expression);
            });
        });
    }

    /**
     * Open the full algebra tiles workspace with a given expression
     */
    openAlgebraTilesWorkspace(expression) {
        // Check if AlgebraTiles class is available
        const container = document.getElementById('algebraTilesContainer');
        if (!container) {
            // Dynamically create the container and load the script
            const div = document.createElement('div');
            div.id = 'algebraTilesContainer';
            document.body.appendChild(div);
        }

        // Load algebra tiles script if not already loaded
        const loadAndOpen = () => {
            if (window.algebraTilesInstance) {
                // Already instantiated - show modal and insert expression
                const modal = document.getElementById('algebraTilesModal');
                if (modal) {
                    modal.style.display = 'flex';
                    // Insert the expression
                    const input = document.getElementById('equationInput');
                    if (input && expression) {
                        input.value = expression;
                        const insertBtn = document.getElementById('insertEquationBtn');
                        if (insertBtn) insertBtn.click();
                    }
                }
            } else if (typeof AlgebraTiles !== 'undefined') {
                window.algebraTilesInstance = new AlgebraTiles('algebraTilesContainer');
                setTimeout(() => this.openAlgebraTilesWorkspace(expression), 200);
            } else {
                // Load the script dynamically
                const script = document.createElement('script');
                script.src = '/js/algebra-tiles.js';
                script.onload = () => {
                    // Also ensure CSS is loaded
                    if (!document.querySelector('link[href*="algebra-tiles.css"]')) {
                        const link = document.createElement('link');
                        link.rel = 'stylesheet';
                        link.href = '/css/algebra-tiles.css';
                        document.head.appendChild(link);
                    }
                    window.algebraTilesInstance = new AlgebraTiles('algebraTilesContainer');
                    setTimeout(() => this.openAlgebraTilesWorkspace(expression), 200);
                };
                document.body.appendChild(script);
            }
        };

        loadAndOpen();
    }

    // ==========================================
    // MULTI-REPRESENTATION LINKED VIEW
    // [MULTI_REP:fn=2x+3,xMin=-5,xMax=5,title="Linear Function"]
    // Shows equation + graph + table + verbal description linked together
    // ==========================================
    createMultiRepresentation(paramStr) {
        const params = this.parseParams(paramStr);
        const id = this.getUniqueId('multirep');

        const fn = params.fn || params.function || 'x';
        const xMin = params.xMin ?? params.xmin ?? -5;
        const xMax = params.xMax ?? params.xmax ?? 5;
        const title = params.title || `Multiple Representations: y = ${fn}`;

        // Generate table values
        const tablePoints = [];
        const step = Math.max(1, Math.floor((xMax - xMin) / 6));
        for (let x = xMin; x <= xMax; x += step) {
            try {
                // Simple evaluation for common functions
                const y = this.evaluateFunction(fn, x);
                if (isFinite(y)) {
                    tablePoints.push({ x, y: Math.round(y * 100) / 100 });
                }
            } catch { /* skip */ }
        }

        // Generate verbal description
        const verbal = this.generateVerbalDescription(fn);

        // Build graph config for the embedded graph panel
        const graphConfig = JSON.stringify({
            fn, xMin, xMax, color: '#3b82f6'
        }).replace(/"/g, '&quot;');

        const graphId = this.getUniqueId('multirep-graph');

        // Build table HTML
        let tableHtml = `<table class="icv-multi-rep-table"><thead><tr><th>x</th><th>y</th></tr></thead><tbody>`;
        tablePoints.forEach(pt => {
            tableHtml += `<tr><td>${pt.x}</td><td>${pt.y}</td></tr>`;
        });
        tableHtml += `</tbody></table>`;

        return `
        <div class="icv-multi-rep-container" id="${id}" data-fn="${this.escapeHtml(fn)}"
             data-config="${this.escapeHtml(JSON.stringify({ fn, xMin, xMax }))}">
            <div style="grid-column: 1 / -1; text-align: center;">
                <div class="icv-title" style="margin-bottom: 4px;">${this.escapeHtml(title)}</div>
                <div style="font-size: 11px; color: #94a3b8;">Four linked representations of the same function</div>
            </div>

            <!-- Equation Panel -->
            <div class="icv-multi-rep-panel">
                <div class="icv-rep-label">Equation</div>
                <div class="icv-rep-equation">\\(y = ${fn}\\)</div>
            </div>

            <!-- Graph Panel -->
            <div class="icv-multi-rep-panel">
                <div class="icv-rep-label">Graph</div>
                <div class="icv-graph" id="${graphId}" data-config="${graphConfig}" style="min-height: 180px; border-radius: 6px;"></div>
            </div>

            <!-- Table Panel -->
            <div class="icv-multi-rep-panel">
                <div class="icv-rep-label">Table of Values</div>
                ${tableHtml}
            </div>

            <!-- Verbal Panel -->
            <div class="icv-multi-rep-panel">
                <div class="icv-rep-label">Verbal Description</div>
                <div class="icv-rep-verbal">${verbal}</div>
            </div>
        </div>
        `;
    }

    /**
     * Simple function evaluator for table generation
     */
    evaluateFunction(fn, x) {
        // Replace common math patterns for eval
        let expr = fn.replace(/\^/g, '**')
                     .replace(/sin\(/g, 'Math.sin(')
                     .replace(/cos\(/g, 'Math.cos(')
                     .replace(/tan\(/g, 'Math.tan(')
                     .replace(/sqrt\(/g, 'Math.sqrt(')
                     .replace(/abs\(/g, 'Math.abs(')
                     .replace(/log\(/g, 'Math.log(')
                     .replace(/exp\(/g, 'Math.exp(')
                     .replace(/pi/g, 'Math.PI');

        // Add implicit multiplication: 2x → 2*x, )x → )*x
        expr = expr.replace(/(\d)([x])/g, '$1*$2');
        expr = expr.replace(/([x\)])(\d)/g, '$1*$2');
        expr = expr.replace(/\)([x])/g, ')*$1');
        expr = expr.replace(/([x])\(/g, '$1*(');

        // Replace x with the value
        expr = expr.replace(/x/g, `(${x})`);

        // Safe evaluation using Function constructor (no eval)
        return new Function(`'use strict'; return (${expr})`)();
    }

    /**
     * Generate a verbal description of a function
     */
    generateVerbalDescription(fn) {
        const normalized = fn.replace(/\s/g, '').toLowerCase();

        // Common patterns
        if (/^(-?\d*)x\^2([+-]\d*x)?([+-]\d+)?$/.test(normalized)) {
            const aMatch = normalized.match(/^(-?\d*)x\^2/);
            const a = aMatch[1] === '' || aMatch[1] === '+' ? 1 : aMatch[1] === '-' ? -1 : parseInt(aMatch[1]);
            return `This is a <strong>quadratic function</strong> (parabola). It ${a > 0 ? 'opens upward' : 'opens downward'} and has a U-shape. The vertex is the ${a > 0 ? 'lowest' : 'highest'} point on the graph.`;
        }

        if (/^(-?\d*)x([+-]\d+)?$/.test(normalized)) {
            const mMatch = normalized.match(/^(-?\d*)x/);
            const m = mMatch[1] === '' || mMatch[1] === '+' ? 1 : mMatch[1] === '-' ? -1 : parseInt(mMatch[1]);
            const bMatch = normalized.match(/([+-]\d+)$/);
            const b = bMatch ? parseInt(bMatch[1]) : 0;
            return `This is a <strong>linear function</strong> with slope ${m} and y-intercept ${b}. For every 1 unit increase in x, y ${m > 0 ? 'increases' : 'decreases'} by ${Math.abs(m)}.`;
        }

        if (/sin\(x\)/.test(normalized)) {
            return `This is a <strong>sine function</strong>. It oscillates between -1 and 1, creating a smooth wave pattern. One full cycle takes 2π ≈ 6.28 units.`;
        }

        if (/cos\(x\)/.test(normalized)) {
            return `This is a <strong>cosine function</strong>. Like sine, it oscillates between -1 and 1 but starts at its maximum value when x = 0.`;
        }

        if (/x\^3/.test(normalized)) {
            return `This is a <strong>cubic function</strong>. It has an S-shaped curve that passes through the origin, going from bottom-left to top-right.`;
        }

        if (/abs\(x\)/.test(normalized) || /\|x\|/.test(normalized)) {
            return `This is an <strong>absolute value function</strong>. It creates a V-shape, reflecting all negative outputs to positive. The vertex is at the origin.`;
        }

        if (/sqrt\(x\)/.test(normalized)) {
            return `This is a <strong>square root function</strong>. It only exists for x ≥ 0 and increases at a decreasing rate—fast at first, then slower.`;
        }

        return `This function, <strong>y = ${fn}</strong>, describes a relationship where each input x produces exactly one output y. Examine the graph and table to see the pattern.`;
    }

    /**
     * Initialize multi-representation links (graph rendering for embedded graphs)
     */
    initMultiRepLinks(container) {
        container.querySelectorAll('.icv-multi-rep-container').forEach(multiRep => {
            // The graph inside multi-rep needs rendering too
            const graphEl = multiRep.querySelector('.icv-graph');
            if (graphEl && graphEl.id && !graphEl._mathGraph) {
                setTimeout(() => this.renderGraph(graphEl.id), 100);
            }
        });
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
        // Attach click handlers to collapsed containers (inline onclick may be stripped by DOMPurify)
        container.querySelectorAll('.icv-collapsed').forEach(collapsedEl => {
            if (collapsedEl.id && !collapsedEl._clickHandlerAttached) {
                collapsedEl._clickHandlerAttached = true;
                collapsedEl.addEventListener('click', (e) => {
                    // Don't expand if clicking on control buttons
                    if (e.target.closest('.icv-controls') || e.target.closest('.icv-btn')) {
                        return;
                    }
                    this.expandVisual(collapsedEl.id);
                });
            }
        });

        // Attach click handlers to graph control buttons
        container.querySelectorAll('.icv-graph-container').forEach(graphContainer => {
            const graphEl = graphContainer.querySelector('.icv-graph');
            if (!graphEl || !graphEl.id) return;

            const graphId = graphEl.id;

            // Zoom in button
            const zoomInBtn = graphContainer.querySelector('.icv-zoom-in');
            if (zoomInBtn && !zoomInBtn._clickHandlerAttached) {
                zoomInBtn._clickHandlerAttached = true;
                zoomInBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.zoomGraph(graphId, 0.8);
                });
            }

            // Zoom out button
            const zoomOutBtn = graphContainer.querySelector('.icv-zoom-out');
            if (zoomOutBtn && !zoomOutBtn._clickHandlerAttached) {
                zoomOutBtn._clickHandlerAttached = true;
                zoomOutBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.zoomGraph(graphId, 1.25);
                });
            }

            // Reset button
            const resetBtn = graphContainer.querySelector('.icv-reset');
            if (resetBtn && !resetBtn._clickHandlerAttached) {
                resetBtn._clickHandlerAttached = true;
                resetBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.resetGraph(graphId);
                });
            }
        });

        // Initialize function graphs
        container.querySelectorAll('.icv-graph').forEach(graphEl => {
            if (graphEl.id && !graphEl._mathGraph) {
                setTimeout(() => this.renderGraph(graphEl.id), 50);
            }
        });

        // Initialize slider graphs
        container.querySelectorAll('.icv-slider-graph').forEach(graphEl => {
            if (graphEl.id) {
                setTimeout(() => this.renderSliderGraph(graphEl.id), 50);
            }
        });

        // Attach slider input handlers
        container.querySelectorAll('.icv-slider-container').forEach(sliderContainer => {
            sliderContainer.querySelectorAll('.icv-slider-input').forEach(slider => {
                if (slider._inputHandlerAttached) return;
                slider._inputHandlerAttached = true;

                const containerId = sliderContainer.id?.replace('-wrapper', '');
                const paramName = slider.dataset.param;

                if (containerId && paramName) {
                    slider.addEventListener('input', (e) => {
                        this.updateSliderGraph(containerId, paramName, e.target.value);
                    });
                }
            });
        });

        // Initialize interactive number line points (draggable)
        this.initDraggablePoints(container);

        // Initialize number line send-to-AI buttons
        this.initNumlineSendButtons(container);

        // Initialize interactive fraction segments (clickable)
        this.initInteractiveFractions(container);

        // Initialize algebra tiles inline open buttons
        this.initAlgebraTilesButtons(container);

        // Initialize interactive counters (pos/neg, zero pairs)
        this.initInteractiveCounters(container);

        // Initialize multi-representation linked visuals
        this.initMultiRepLinks(container);
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
                max-width: 220px;
                max-height: 160px;
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
                width: 320px !important;
                height: 200px !important;
                min-height: 200px !important;
                max-height: none !important;
                pointer-events: none;
                transform: scale(0.5);
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

            /* MathGraph canvas styling */
            .icv-graph-container .mg-wrapper,
            .icv-slider-graph .mg-wrapper {
                background: #ffffff;
                border-radius: 6px;
            }

            /* SVG elements - clean grays */
            .icv-container svg text {
                fill: #1d1d1f;
            }

            .icv-container svg line[stroke="#eee"],
            .icv-container svg line[stroke="#ccc"] {
                stroke: #e5e5ea !important;
            }

            /* ==========================================
               ANIMATED STEP-BY-STEP REVEAL
               ========================================== */
            .visual-steps-container {
                background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
                border-left: 4px solid #3b82f6;
                border-radius: 12px;
                padding: 20px;
                margin: 15px 0;
                font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
                line-height: 1.8;
            }

            .step-reveal-item {
                transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
            }

            .step-hidden {
                opacity: 0;
                max-height: 0;
                overflow: hidden;
                margin: 0 !important;
                padding: 0 !important;
                transform: translateY(-8px);
            }

            .step-visible {
                opacity: 1;
                max-height: 200px;
                transform: translateY(0);
            }

            .step-animate-in {
                animation: stepSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
            }

            @keyframes stepSlideIn {
                from { opacity: 0; transform: translateY(-12px) scale(0.97); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }

            .step-equation {
                margin: 8px 0;
                padding: 8px 12px;
                background: white;
                border-radius: 8px;
                font-size: 1.1em;
                font-weight: 600;
                box-shadow: 0 1px 4px rgba(0,0,0,0.06);
            }

            .step-explanation {
                margin: 4px 0;
                padding: 4px 8px 4px 20px;
                font-size: 0.9em;
                color: #1e40af;
            }

            .step-arrow {
                text-align: center;
                font-size: 1.5em;
                color: #3b82f6;
                margin: 4px 0;
                transition: all 0.3s ease;
            }

            .step-controls {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-top: 16px;
                gap: 12px;
            }

            .step-progress {
                flex: 1;
            }

            .step-progress-text {
                font-size: 12px;
                color: #64748b;
                font-weight: 500;
                display: block;
                margin-bottom: 4px;
            }

            .step-progress-bar {
                height: 4px;
                background: rgba(59, 130, 246, 0.15);
                border-radius: 4px;
                overflow: hidden;
            }

            .step-progress-fill {
                height: 100%;
                background: #3b82f6;
                border-radius: 4px;
                transition: width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
            }

            .step-next-btn {
                padding: 8px 18px;
                border: none;
                border-radius: 20px;
                background: #3b82f6;
                color: white;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 6px;
                white-space: nowrap;
                font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
            }

            .step-next-btn:hover:not(:disabled) {
                background: #2563eb;
                transform: scale(1.03);
            }

            .step-next-btn:active:not(:disabled) {
                transform: scale(0.98);
            }

            .step-next-arrow {
                transition: transform 0.2s;
            }

            .step-next-btn:hover .step-next-arrow {
                transform: translateX(2px);
            }

            .step-btn-done {
                background: #10b981;
                cursor: default;
            }

            .step-btn-done:hover {
                background: #10b981;
                transform: none;
            }

            /* ==========================================
               INTERACTIVE VISUALS
               ========================================== */

            /* Draggable number line points */
            .icv-draggable-point {
                cursor: grab;
                transition: r 0.15s ease;
            }
            .icv-draggable-point:hover {
                filter: brightness(1.1);
            }
            .icv-draggable-point.dragging {
                cursor: grabbing;
                filter: brightness(0.9);
            }
            .icv-point-value-tooltip {
                pointer-events: none;
                font-size: 11px;
                font-weight: 600;
                fill: white;
                text-anchor: middle;
            }
            .icv-point-tooltip-bg {
                pointer-events: none;
                rx: 4;
                ry: 4;
            }

            /* Clickable fraction segments */
            .icv-fraction-segment {
                cursor: pointer;
                transition: opacity 0.2s ease;
            }
            .icv-fraction-segment:hover {
                opacity: 0.85;
            }
            .icv-fraction-counter {
                font-size: 14px;
                font-weight: 600;
                color: #667eea;
                text-align: center;
                margin-top: 6px;
                transition: all 0.2s;
            }

            /* Interactive bar chart segments */
            .icv-bar-interactive {
                cursor: pointer;
                transition: opacity 0.2s, transform 0.15s;
            }
            .icv-bar-interactive:hover {
                opacity: 0.85;
            }

            /* Angle drag handle */
            .icv-angle-handle {
                cursor: grab;
                transition: r 0.15s;
            }
            .icv-angle-handle:hover {
                filter: brightness(1.15);
            }

            /* Interactive value display on visuals */
            .icv-interactive-value {
                position: absolute;
                bottom: 8px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0,0,0,0.75);
                color: white;
                padding: 4px 10px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 500;
                pointer-events: none;
                backdrop-filter: blur(4px);
                opacity: 0;
                transition: opacity 0.2s;
                white-space: nowrap;
            }

            .icv-container:hover .icv-interactive-value {
                opacity: 1;
            }

            /* ==========================================
               ALGEBRA TILES INLINE
               ========================================== */
            .icv-algebra-tiles-container {
                position: relative;
            }

            .icv-algebra-workspace {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                padding: 12px;
                min-height: 60px;
                background: #fafbfc;
                border-radius: 8px;
                border: 1px dashed #d1d5db;
                justify-content: center;
                align-items: center;
            }

            .icv-algebra-tile {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-weight: 700;
                font-size: 13px;
                border-radius: 6px;
                color: white;
                text-shadow: 0 1px 2px rgba(0,0,0,0.2);
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }

            .icv-tile-pos-unit { width: 28px; height: 28px; background: #22c55e; }
            .icv-tile-neg-unit { width: 28px; height: 28px; background: #ef4444; }
            .icv-tile-pos-x { width: 80px; height: 28px; background: #3b82f6; }
            .icv-tile-neg-x { width: 80px; height: 28px; background: #f97316; }
            .icv-tile-pos-x2 { width: 80px; height: 80px; background: #8b5cf6; }
            .icv-tile-neg-x2 { width: 80px; height: 80px; background: #ec4899; }

            .icv-algebra-expression {
                text-align: center;
                font-size: 16px;
                font-weight: 600;
                color: #1d1d1f;
                margin-top: 10px;
                font-family: 'SF Mono', 'Menlo', monospace;
            }

            .icv-open-tiles-btn {
                display: block;
                margin: 10px auto 0;
                padding: 8px 20px;
                border: none;
                border-radius: 20px;
                background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
                color: white;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
            }

            .icv-open-tiles-btn:hover {
                transform: scale(1.03);
                box-shadow: 0 4px 12px rgba(79, 172, 254, 0.4);
            }

            /* ==========================================
               MULTI-REPRESENTATION LINKING
               ========================================== */
            .icv-multi-rep-container {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
                margin: 16px 0;
                padding: 16px;
                background: #ffffff;
                border-radius: 16px;
                box-shadow: 0 2px 12px rgba(0,0,0,0.08);
                border: 1px solid rgba(0,0,0,0.06);
            }

            @media (max-width: 480px) {
                .icv-multi-rep-container {
                    grid-template-columns: 1fr;
                }
            }

            .icv-multi-rep-panel {
                border: 1px solid #e5e7eb;
                border-radius: 12px;
                padding: 12px;
                background: #fafbfc;
                position: relative;
                overflow: hidden;
            }

            .icv-multi-rep-panel.icv-rep-active {
                border-color: #3b82f6;
                box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
            }

            .icv-rep-label {
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                color: #64748b;
                margin-bottom: 8px;
            }

            .icv-rep-link-icon {
                position: absolute;
                top: 50%;
                left: -18px;
                transform: translateY(-50%);
                width: 24px;
                height: 24px;
                background: #3b82f6;
                color: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                z-index: 2;
            }

            .icv-multi-rep-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 13px;
            }

            .icv-multi-rep-table th {
                background: #e5e7eb;
                padding: 6px 10px;
                font-weight: 600;
                text-align: center;
                font-size: 12px;
            }

            .icv-multi-rep-table td {
                padding: 5px 10px;
                text-align: center;
                border-bottom: 1px solid #f0f0f5;
            }

            .icv-multi-rep-table tr.icv-rep-highlight td {
                background: rgba(59, 130, 246, 0.08);
                font-weight: 600;
            }

            .icv-rep-equation {
                font-size: 18px;
                font-weight: 600;
                text-align: center;
                padding: 12px;
                font-family: 'SF Mono', 'Menlo', monospace;
                color: #1d1d1f;
            }

            .icv-rep-verbal {
                font-size: 14px;
                line-height: 1.5;
                color: #374151;
                padding: 8px;
            }

            /* ========== INTEGER COUNTERS ========== */
            .icv-counters-container {
                padding: 16px 20px;
            }

            .icv-counters-workspace {
                display: flex;
                flex-direction: column;
                gap: 12px;
                min-height: 60px;
            }

            .icv-counters-section {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .icv-counters-section-label {
                font-size: 11px;
                font-weight: 600;
                color: #94a3b8;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .icv-counters-row {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }

            .icv-counter {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                font-weight: 700;
                cursor: default;
                transition: transform 0.2s ease, box-shadow 0.2s ease;
                user-select: none;
                position: relative;
            }

            .icv-counter-pos {
                background: linear-gradient(145deg, #fbbf24, #f59e0b);
                color: #78350f;
                border: 2px solid #d97706;
                box-shadow: 0 2px 6px rgba(245, 158, 11, 0.3);
            }

            .icv-counter-neg {
                background: linear-gradient(145deg, #f87171, #ef4444);
                color: #fff;
                border: 2px solid #dc2626;
                box-shadow: 0 2px 6px rgba(239, 68, 68, 0.3);
            }

            .icv-counter-draggable {
                cursor: grab;
            }

            .icv-counter-draggable:hover {
                transform: scale(1.15);
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            }

            .icv-counter-draggable:active {
                cursor: grabbing;
            }

            .icv-counter-dragging {
                opacity: 0.5;
                transform: scale(0.9);
            }

            .icv-counter-drop-target {
                transform: scale(1.25);
                box-shadow: 0 0 20px rgba(102, 126, 234, 0.6);
            }

            /* Zero pair layout */
            .icv-zero-pairs {
                display: flex;
                flex-wrap: wrap;
                gap: 12px;
            }

            .icv-zero-pair {
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 4px 8px;
                background: rgba(0,0,0,0.04);
                border-radius: 24px;
                position: relative;
            }

            .icv-zero-pair .icv-counter {
                width: 34px;
                height: 34px;
                font-size: 17px;
            }

            .icv-zero-line {
                position: absolute;
                top: 50%;
                left: 8px;
                right: 8px;
                height: 2px;
                background: #64748b;
                transform: translateY(-50%);
                opacity: 0.5;
            }

            /* Result display */
            .icv-counters-result {
                margin-top: 12px;
                text-align: center;
                padding: 8px 0;
                border-top: 1px solid rgba(0,0,0,0.06);
            }

            .icv-counters-equation {
                font-size: 18px;
                font-weight: 600;
                color: #1d1d1f;
            }

            .icv-result-pos {
                color: #d97706;
            }

            .icv-result-neg {
                color: #dc2626;
            }

            .icv-result-answer {
                color: #2563eb;
                font-size: 22px;
            }

            /* Control buttons */
            .icv-counters-controls {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                margin-top: 10px;
                justify-content: center;
            }

            .icv-counter-add-btn,
            .icv-counter-cancel-btn,
            .icv-counter-send-btn {
                padding: 6px 12px;
                border-radius: 8px;
                border: 1px solid rgba(0,0,0,0.1);
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
                background: #f8fafc;
                color: #374151;
            }

            .icv-counter-add-pos {
                border-color: #d97706;
                color: #92400e;
            }

            .icv-counter-add-pos:hover {
                background: #fef3c7;
            }

            .icv-counter-add-neg {
                border-color: #dc2626;
                color: #991b1b;
            }

            .icv-counter-add-neg:hover {
                background: #fee2e2;
            }

            .icv-counter-cancel-btn {
                border-color: #6366f1;
                color: #4338ca;
            }

            .icv-counter-cancel-btn:hover {
                background: #e0e7ff;
            }

            .icv-counter-send-btn {
                border-color: #12B3B3;
                color: #0e7490;
            }

            .icv-counter-send-btn:hover {
                background: #ccfbf1;
            }

            /* Animations */
            @keyframes icv-counter-pop {
                0% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.3); opacity: 0.7; }
                100% { transform: scale(0); opacity: 0; }
            }

            @keyframes icv-zero-pair-cancel {
                0% { transform: scale(1); opacity: 1; }
                30% { transform: scale(1.2); opacity: 0.8; }
                60% { transform: scale(0.5) rotate(180deg); opacity: 0.4; }
                100% { transform: scale(0) rotate(360deg); opacity: 0; }
            }

            .icv-counter-animate {
                animation: icv-counter-appear 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
            }

            @keyframes icv-counter-appear {
                0% { transform: scale(0); opacity: 0; }
                100% { transform: scale(1); opacity: 1; }
            }

            /* ========== ENHANCED NUMBER LINE ========== */
            .icv-numline-container {
                padding: 16px 12px;
            }

            .icv-numline-controls {
                display: flex;
                justify-content: center;
                margin-top: 8px;
            }

            .icv-numline-send-btn {
                padding: 5px 14px;
                border-radius: 8px;
                border: 1px solid #12B3B3;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                background: #f8fafc;
                color: #0e7490;
                transition: all 0.2s ease;
            }

            .icv-numline-send-btn:hover {
                background: #ccfbf1;
            }

            .dark-mode .icv-numline-send-btn {
                background: #334155;
                color: #5eead4;
                border-color: rgba(94, 234, 212, 0.3);
            }

            .dark-mode .icv-numline-send-btn:hover {
                background: #1e3a4a;
            }

            /* Dark mode support */
            .dark-mode .icv-counters-container {
                background: #1e293b;
                border-color: rgba(255,255,255,0.1);
            }

            .dark-mode .icv-counters-section-label {
                color: #64748b;
            }

            .dark-mode .icv-counters-equation {
                color: #e2e8f0;
            }

            .dark-mode .icv-result-answer {
                color: #60a5fa;
            }

            .dark-mode .icv-zero-pair {
                background: rgba(255,255,255,0.06);
            }

            .dark-mode .icv-counter-add-btn,
            .dark-mode .icv-counter-cancel-btn,
            .dark-mode .icv-counter-send-btn {
                background: #334155;
                color: #e2e8f0;
                border-color: rgba(255,255,255,0.1);
            }

            .dark-mode .icv-counters-result {
                border-top-color: rgba(255,255,255,0.06);
            }
        </style>
        `;

        document.head.insertAdjacentHTML('beforeend', styles);
    }
}

// Initialize global instance
window.inlineChatVisuals = new InlineChatVisuals();

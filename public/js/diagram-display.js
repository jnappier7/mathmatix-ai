/**
 * DIAGRAM DISPLAY HANDLER
 *
 * Parses [DIAGRAM:type:params] commands from AI responses and renders them
 * inline in chat as SVG. Supports: parabola, triangle, number_line,
 * coordinate_plane, angle.
 *
 * History: this used to POST to /api/generate-diagram and call a Python
 * matplotlib script for PNGs. The Python script wasn't shipped with the
 * repo, so the pipeline silently 500'd and the AI's diagrams never showed
 * up. Now everything renders client-side as SVG, consistent with how
 * inlineChatVisuals.js handles all other visual commands.
 */

class DiagramDisplay {
    constructor() {
        this.setupModal();
    }

    /**
     * Parse diagram commands from AI message
     * Returns array of diagram specifications
     */
    parseDiagramCommands(message) {
        const commands = [];
        const regex = /\[DIAGRAM:(\w+)(?::([^\]]+))?\]/g;
        let match;

        while ((match = regex.exec(message)) !== null) {
            commands.push({
                fullMatch: match[0],
                type: match[1],
                params: this.parseParams(match[2] || '')
            });
        }

        return commands;
    }

    /**
     * Parse parameter string, handling nested objects in curly braces
     */
    parseParams(paramsStr) {
        const params = {};
        let currentKey = '';
        let currentValue = '';
        let depth = 0;
        let inQuotes = false;
        let quoteChar = '';

        for (let i = 0; i < paramsStr.length; i++) {
            const char = paramsStr[i];

            if ((char === '"' || char === "'") && (i === 0 || paramsStr[i - 1] !== '\\')) {
                if (!inQuotes) { inQuotes = true; quoteChar = char; }
                else if (char === quoteChar) { inQuotes = false; quoteChar = ''; }
                currentValue += char;
                continue;
            }

            if (inQuotes) { currentValue += char; continue; }

            if (char === '{') depth++;
            if (char === '}') depth--;

            if (char === '=' && depth === 0 && !currentKey) {
                currentKey = currentValue.trim();
                currentValue = '';
                continue;
            }

            if (char === ',' && depth === 0) {
                if (currentKey && currentValue) {
                    params[currentKey] = this.parseValue(currentValue.trim());
                }
                currentKey = '';
                currentValue = '';
                continue;
            }

            currentValue += char;
        }

        if (currentKey && currentValue) {
            params[currentKey] = this.parseValue(currentValue.trim());
        }

        return params;
    }

    parseValue(value) {
        value = value.trim();
        if (value === 'true') return true;
        if (value === 'false') return false;
        if (!isNaN(value) && value !== '') return parseFloat(value);

        if (value.startsWith('{') && value.endsWith('}')) {
            try {
                let jsonStr = value.replace(/(\w+):/g, '"$1":').replace(/'/g, '"');
                return JSON.parse(jsonStr);
            } catch (e) {
                console.warn('[DiagramDisplay] Failed to parse object:', value, e);
                return value;
            }
        }

        if (value.startsWith('[') && value.endsWith(']')) {
            try {
                let jsonStr = value.replace(/(\w+):/g, '"$1":').replace(/'/g, '"');
                return JSON.parse(jsonStr);
            } catch (e) {
                return value;
            }
        }

        const evaluated = this.evaluateSimpleArithmetic(value);
        if (evaluated !== null) return evaluated;

        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            return value.slice(1, -1);
        }

        return value;
    }

    evaluateSimpleArithmetic(value) {
        const match = String(value).match(/^(-?\d+(?:\.\d+)?)\s*([\/*+\-])\s*(-?\d+(?:\.\d+)?)$/);
        if (!match) return null;

        const n1 = parseFloat(match[1]);
        const op = match[2];
        const n2 = parseFloat(match[3]);

        switch (op) {
            case '/': return n1 / n2;
            case '*': return n1 * n2;
            case '+': return n1 + n2;
            case '-': return n1 - n2;
            default: return null;
        }
    }

    /**
     * Render a single diagram to SVG. Returns null if type is unknown.
     */
    renderDiagram(type, params) {
        switch (type) {
            case 'parabola':         return this._renderParabola(params);
            case 'triangle':         return this._renderTriangle(params);
            case 'number_line':      return this._renderNumberLine(params);
            case 'coordinate_plane': return this._renderCoordinatePlane(params);
            case 'angle':            return this._renderAngle(params);
            default:                 return null;
        }
    }

    /**
     * Process AI message — replace [DIAGRAM:...] commands with inline SVG.
     * Async-returning for backward compat with existing call site, but no
     * network or async work is actually performed.
     */
    async processMessage(message) {
        const commands = this.parseDiagramCommands(message);
        if (commands.length === 0) return message;

        let processed = message;
        for (const command of commands) {
            const svg = this.renderDiagram(command.type, command.params);
            if (svg) {
                processed = processed.replace(command.fullMatch, this.createDiagramHTML(svg, command.type));
            } else {
                processed = processed.replace(
                    command.fullMatch,
                    `<div class="diagram-error">Unknown diagram type: ${this._escape(command.type)}</div>`
                );
            }
        }
        return processed;
    }

    createDiagramHTML(svg, type) {
        const diagramId = `diagram-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const encoded = encodeURIComponent(svg);
        return `
        <div class="inline-diagram" data-diagram-id="${diagramId}">
            <div class="diagram-svg-wrap" onclick="window.diagramDisplay.enlargeDiagram(decodeURIComponent('${encoded}'), '${type}')" title="Click to enlarge">${svg}</div>
            <div class="diagram-caption">${this.getCaption(type)}</div>
        </div>
        `;
    }

    getCaption(type) {
        const captions = {
            parabola: 'Parabola',
            triangle: 'Triangle',
            number_line: 'Number Line',
            coordinate_plane: 'Coordinate Plane',
            angle: 'Angle'
        };
        return captions[type] || type;
    }

    enlargeDiagram(svg, type) {
        const modal = document.getElementById('diagram-modal');
        const modalBody = document.getElementById('diagram-modal-body');
        const modalCaption = document.getElementById('diagram-modal-caption');
        if (!modal || !modalBody) return;
        modal.style.display = 'flex';
        modalBody.innerHTML = svg;
        modalCaption.textContent = this.getCaption(type);
    }

    setupModal() {
        if (document.getElementById('diagram-modal')) return;

        const modalHTML = `
        <div id="diagram-modal" class="diagram-modal" onclick="this.style.display='none'">
            <div class="diagram-modal-content">
                <span class="diagram-modal-close" onclick="document.getElementById('diagram-modal').style.display='none'">&times;</span>
                <div id="diagram-modal-body" class="diagram-modal-body" alt="Enlarged diagram"></div>
                <div id="diagram-modal-caption" class="diagram-modal-caption"></div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.addStyles();
    }

    addStyles() {
        if (document.getElementById('diagram-display-styles')) return;

        const styles = `
        <style id="diagram-display-styles">
            .inline-diagram {
                display: inline-block;
                margin: 15px 0;
                background: #f9f9f9;
                border-radius: 12px;
                padding: 15px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                max-width: 100%;
                text-align: center;
            }
            .diagram-svg-wrap {
                cursor: pointer;
                transition: transform 0.2s ease;
            }
            .diagram-svg-wrap svg {
                max-width: 100%;
                height: auto;
                border-radius: 8px;
                background: #fff;
            }
            .diagram-svg-wrap:hover {
                transform: scale(1.02);
            }
            .diagram-caption {
                margin-top: 10px;
                font-size: 14px;
                font-weight: 600;
                color: #667eea;
            }
            .diagram-error {
                color: #e74c3c;
                background: #fee;
                padding: 10px;
                border-radius: 8px;
                font-size: 14px;
                margin: 10px 0;
            }
            .diagram-modal {
                display: none;
                position: fixed;
                z-index: 10000;
                left: 0; top: 0;
                width: 100%; height: 100%;
                background-color: rgba(0,0,0,0.9);
                align-items: center;
                justify-content: center;
            }
            .diagram-modal-content {
                position: relative;
                max-width: 90%;
                max-height: 90%;
                background: #fff;
                padding: 20px;
                border-radius: 12px;
            }
            .diagram-modal-body svg {
                max-width: 100%;
                max-height: 75vh;
            }
            .diagram-modal-caption {
                text-align: center;
                color: #333;
                font-size: 16px;
                font-weight: bold;
                padding-top: 12px;
            }
            .diagram-modal-close {
                position: absolute;
                top: 4px; right: 14px;
                color: #888;
                font-size: 28px;
                font-weight: bold;
                cursor: pointer;
                z-index: 10001;
            }
            .diagram-modal-close:hover { color: #333; }
            @media (max-width: 768px) {
                .inline-diagram { max-width: 100%; padding: 10px; }
                .diagram-modal-content { max-width: 95%; }
            }
        </style>
        `;

        document.head.insertAdjacentHTML('beforeend', styles);
    }

    _escape(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }

    // ============================================================
    // SVG RENDERERS
    // ============================================================

    _renderParabola(params) {
        const a = +params.a || 1;
        const h = +params.h || 0;
        const k = +params.k || 0;
        const showVertex = params.showVertex !== false;
        const showAxis = params.showAxis !== false;

        const W = 320, H = 280;
        const xMin = h - 6, xMax = h + 6;
        const yPadAbove = 4, yPadBelow = 4;
        const yMin = Math.min(k - yPadBelow, k + a * 9 - 1);
        const yMax = Math.max(k + yPadAbove, k + a * 9 + 1);
        const finalYMin = a > 0 ? k - 1 : yMin;
        const finalYMax = a > 0 ? Math.max(k + 8, yMax) : k + 1;
        const sX = W / (xMax - xMin);
        const sY = H / (finalYMax - finalYMin);
        const toX = x => (x - xMin) * sX;
        const toY = y => H - (y - finalYMin) * sY;

        let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
        svg += `<rect width="${W}" height="${H}" fill="#fff"/>`;

        // Grid
        svg += `<g stroke="#eee" stroke-width="1">`;
        for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x++) {
            svg += `<line x1="${toX(x).toFixed(1)}" y1="0" x2="${toX(x).toFixed(1)}" y2="${H}"/>`;
        }
        for (let y = Math.ceil(finalYMin); y <= Math.floor(finalYMax); y++) {
            svg += `<line x1="0" y1="${toY(y).toFixed(1)}" x2="${W}" y2="${toY(y).toFixed(1)}"/>`;
        }
        svg += `</g>`;

        // Axes
        if (xMin <= 0 && xMax >= 0) {
            svg += `<line x1="${toX(0).toFixed(1)}" y1="0" x2="${toX(0).toFixed(1)}" y2="${H}" stroke="#333" stroke-width="1.5"/>`;
        }
        if (finalYMin <= 0 && finalYMax >= 0) {
            svg += `<line x1="0" y1="${toY(0).toFixed(1)}" x2="${W}" y2="${toY(0).toFixed(1)}" stroke="#333" stroke-width="1.5"/>`;
        }

        // Axis of symmetry
        if (showAxis) {
            svg += `<line x1="${toX(h).toFixed(1)}" y1="0" x2="${toX(h).toFixed(1)}" y2="${H}" stroke="#bbb" stroke-width="1.2" stroke-dasharray="6,4"/>`;
        }

        // Parabola path
        let d = '';
        const steps = 120;
        for (let i = 0; i <= steps; i++) {
            const x = xMin + (i / steps) * (xMax - xMin);
            const y = a * (x - h) * (x - h) + k;
            if (y < finalYMin - 2 || y > finalYMax + 2) { d += ''; continue; }
            d += (d === '' ? 'M' : ' L') + ' ' + toX(x).toFixed(1) + ' ' + toY(y).toFixed(1);
        }
        svg += `<path d="${d}" fill="none" stroke="#667eea" stroke-width="2.5"/>`;

        // Vertex marker
        if (showVertex) {
            svg += `<circle cx="${toX(h).toFixed(1)}" cy="${toY(k).toFixed(1)}" r="5" fill="#e74c3c"/>`;
            svg += `<text x="${(toX(h) + 8).toFixed(1)}" y="${(toY(k) - 8).toFixed(1)}" font-size="12" fill="#e74c3c" font-weight="bold">vertex (${h}, ${k})</text>`;
        }

        // Equation label
        const sign1 = h >= 0 ? '−' : '+';
        const absH = Math.abs(h);
        const sign2 = k >= 0 ? '+' : '−';
        const absK = Math.abs(k);
        const eq = `y = ${a === 1 ? '' : a === -1 ? '−' : a}(x ${sign1} ${absH})² ${sign2} ${absK}`;
        svg += `<text x="8" y="18" font-size="13" font-weight="bold" fill="#333">${eq}</text>`;

        svg += `</svg>`;
        return svg;
    }

    _renderTriangle(params) {
        let a = +params.a || 3;
        let b = +params.b || 4;
        let c = +params.c || 5;
        const showAngles = params.showAngles !== false;

        // Triangle inequality
        if (a + b <= c || a + c <= b || b + c <= a) {
            return `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
                <rect width="320" height="200" fill="#fff"/>
                <text x="160" y="100" text-anchor="middle" font-size="13" fill="#e74c3c">Sides ${a}, ${b}, ${c} can't form a triangle</text>
            </svg>`;
        }

        // Vertices: B at origin, C on x-axis at (a, 0), A above somewhere.
        // Side a is opposite vertex A (i.e. from B to C, length a). Conventional.
        // Use: side a between B and C; side b between A and C; side c between A and B.
        // Coordinates: B = (0,0), C = (a,0). A = (x, y) with |A-B| = c, |A-C| = b.
        // x = (a² + c² - b²) / (2a),  y = sqrt(c² - x²)
        const ax = (a * a + c * c - b * b) / (2 * a);
        const ay = Math.sqrt(Math.max(0, c * c - ax * ax));
        const Bp = { x: 0, y: 0 };
        const Cp = { x: a, y: 0 };
        const Ap = { x: ax, y: ay };

        const W = 320, H = 240;
        const padding = 30;
        const minX = Math.min(Bp.x, Cp.x, Ap.x);
        const maxX = Math.max(Bp.x, Cp.x, Ap.x);
        const minY = Math.min(Bp.y, Cp.y, Ap.y);
        const maxY = Math.max(Bp.y, Cp.y, Ap.y);
        const scale = Math.min((W - 2 * padding) / (maxX - minX || 1), (H - 2 * padding) / (maxY - minY || 1));
        const offX = (W - (maxX - minX) * scale) / 2 - minX * scale;
        const offY = padding;
        const tx = p => offX + p.x * scale;
        // Flip y so the triangle points up
        const ty = p => H - offY - p.y * scale;

        const Bs = { x: tx(Bp), y: ty(Bp) };
        const Cs = { x: tx(Cp), y: ty(Cp) };
        const As = { x: tx(Ap), y: ty(Ap) };

        let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
        svg += `<rect width="${W}" height="${H}" fill="#fff"/>`;
        svg += `<polygon points="${As.x.toFixed(1)},${As.y.toFixed(1)} ${Bs.x.toFixed(1)},${Bs.y.toFixed(1)} ${Cs.x.toFixed(1)},${Cs.y.toFixed(1)}" fill="rgba(102,126,234,0.12)" stroke="#2c3e50" stroke-width="2"/>`;

        // Vertices
        const dot = (p, lbl, dx = 0, dy = 0) => {
            return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="#2c3e50"/>` +
                   `<text x="${(p.x + dx).toFixed(1)}" y="${(p.y + dy).toFixed(1)}" font-size="14" font-weight="bold" fill="#2c3e50">${lbl}</text>`;
        };
        svg += dot(As, 'A', 0, -8);
        svg += dot(Bs, 'B', -14, 14);
        svg += dot(Cs, 'C', 8, 14);

        // Side labels at midpoints
        const mid = (p1, p2) => ({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
        const mBC = mid(Bs, Cs);
        const mAC = mid(As, Cs);
        const mAB = mid(As, Bs);
        svg += `<text x="${mBC.x.toFixed(1)}" y="${(mBC.y + 16).toFixed(1)}" text-anchor="middle" font-size="13" fill="#333">a = ${a}</text>`;
        svg += `<text x="${(mAC.x + 12).toFixed(1)}" y="${mAC.y.toFixed(1)}" font-size="13" fill="#333">b = ${b}</text>`;
        svg += `<text x="${(mAB.x - 12).toFixed(1)}" y="${mAB.y.toFixed(1)}" text-anchor="end" font-size="13" fill="#333">c = ${c}</text>`;

        if (showAngles) {
            // Compute angles via law of cosines (in degrees)
            const angA = Math.acos((b * b + c * c - a * a) / (2 * b * c)) * 180 / Math.PI;
            const angB = Math.acos((a * a + c * c - b * b) / (2 * a * c)) * 180 / Math.PI;
            const angC = Math.acos((a * a + b * b - c * c) / (2 * a * b)) * 180 / Math.PI;
            svg += `<text x="${As.x.toFixed(1)}" y="${(As.y + 16).toFixed(1)}" text-anchor="middle" font-size="11" fill="#e67e22">${angA.toFixed(0)}°</text>`;
            svg += `<text x="${(Bs.x + 14).toFixed(1)}" y="${(Bs.y - 4).toFixed(1)}" font-size="11" fill="#e67e22">${angB.toFixed(0)}°</text>`;
            svg += `<text x="${(Cs.x - 14).toFixed(1)}" y="${(Cs.y - 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#e67e22">${angC.toFixed(0)}°</text>`;

            // Right-angle marker if any angle is 90
            const sq = 12;
            const rightTol = 0.5;
            if (Math.abs(angA - 90) < rightTol) {
                svg += `<rect x="${(As.x - sq / 2).toFixed(1)}" y="${(As.y).toFixed(1)}" width="${sq}" height="${sq}" fill="none" stroke="#2c3e50"/>`;
            } else if (Math.abs(angB - 90) < rightTol) {
                svg += `<rect x="${Bs.x.toFixed(1)}" y="${(Bs.y - sq).toFixed(1)}" width="${sq}" height="${sq}" fill="none" stroke="#2c3e50"/>`;
            } else if (Math.abs(angC - 90) < rightTol) {
                svg += `<rect x="${(Cs.x - sq).toFixed(1)}" y="${(Cs.y - sq).toFixed(1)}" width="${sq}" height="${sq}" fill="none" stroke="#2c3e50"/>`;
            }
        }

        svg += `</svg>`;
        return svg;
    }

    _renderNumberLine(params) {
        const min = params.min != null ? +params.min : -10;
        const max = params.max != null ? +params.max : 10;
        const inequality = params.inequality;
        const points = Array.isArray(params.points) ? params.points : [];

        const W = 360, H = 100;
        const padding = 30;
        const yLine = 50;
        const sX = (W - 2 * padding) / (max - min);
        const toX = v => padding + (v - min) * sX;

        let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
        svg += `<rect width="${W}" height="${H}" fill="#fff"/>`;

        // Inequality shading
        if (inequality && typeof inequality === 'object') {
            const { value, type, inclusive } = inequality;
            const v = +value;
            const x0 = toX(v);
            const isGreater = type === 'greater' || type === '>' || type === 'gt';
            if (isGreater) {
                svg += `<line x1="${x0}" y1="${yLine}" x2="${(W - padding).toFixed(1)}" y2="${yLine}" stroke="#667eea" stroke-width="6"/>`;
            } else {
                svg += `<line x1="${padding}" y1="${yLine}" x2="${x0.toFixed(1)}" y2="${yLine}" stroke="#667eea" stroke-width="6"/>`;
            }
            // Endpoint circle
            svg += `<circle cx="${x0.toFixed(1)}" cy="${yLine}" r="7" fill="${inclusive ? '#667eea' : '#fff'}" stroke="#667eea" stroke-width="2"/>`;
        }

        // Main line
        svg += `<line x1="${padding}" y1="${yLine}" x2="${(W - padding).toFixed(1)}" y2="${yLine}" stroke="#333" stroke-width="2"/>`;

        // Arrowheads
        svg += `<polygon points="${padding - 2},${yLine} ${padding + 8},${yLine - 5} ${padding + 8},${yLine + 5}" fill="#333"/>`;
        svg += `<polygon points="${(W - padding + 2)},${yLine} ${(W - padding - 8)},${yLine - 5} ${(W - padding - 8)},${yLine + 5}" fill="#333"/>`;

        // Tick marks
        const step = (max - min) <= 20 ? 1 : Math.ceil((max - min) / 20);
        for (let v = Math.ceil(min); v <= Math.floor(max); v += step) {
            const x = toX(v);
            svg += `<line x1="${x.toFixed(1)}" y1="${yLine - 5}" x2="${x.toFixed(1)}" y2="${yLine + 5}" stroke="#333" stroke-width="1.5"/>`;
            svg += `<text x="${x.toFixed(1)}" y="${yLine + 22}" text-anchor="middle" font-size="11" fill="#333">${v}</text>`;
        }

        // Plotted points
        for (const p of points) {
            const v = typeof p === 'object' ? p.value : p;
            if (v == null || isNaN(+v)) continue;
            const open = (typeof p === 'object' && p.open === true);
            const x = toX(+v);
            svg += `<circle cx="${x.toFixed(1)}" cy="${yLine}" r="6" fill="${open ? '#fff' : '#e74c3c'}" stroke="#e74c3c" stroke-width="2"/>`;
        }

        svg += `</svg>`;
        return svg;
    }

    _renderCoordinatePlane(params) {
        const xRange = +params.xRange || 10;
        const yRange = +params.yRange || 10;
        const lines = Array.isArray(params.lines) ? params.lines : [];
        const inequality = params.inequality;

        const W = 320, H = 320;
        const padding = 20;
        const sX = (W - 2 * padding) / (2 * xRange);
        const sY = (H - 2 * padding) / (2 * yRange);
        const toX = x => padding + (x + xRange) * sX;
        const toY = y => H - padding - (y + yRange) * sY;

        let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
        svg += `<rect width="${W}" height="${H}" fill="#fff"/>`;

        // Grid
        svg += `<g stroke="#eee" stroke-width="1">`;
        for (let x = -xRange; x <= xRange; x++) {
            svg += `<line x1="${toX(x).toFixed(1)}" y1="${padding}" x2="${toX(x).toFixed(1)}" y2="${(H - padding).toFixed(1)}"/>`;
        }
        for (let y = -yRange; y <= yRange; y++) {
            svg += `<line x1="${padding}" y1="${toY(y).toFixed(1)}" x2="${(W - padding).toFixed(1)}" y2="${toY(y).toFixed(1)}"/>`;
        }
        svg += `</g>`;

        // Axes
        svg += `<line x1="${toX(0).toFixed(1)}" y1="${padding}" x2="${toX(0).toFixed(1)}" y2="${(H - padding).toFixed(1)}" stroke="#333" stroke-width="1.5"/>`;
        svg += `<line x1="${padding}" y1="${toY(0).toFixed(1)}" x2="${(W - padding).toFixed(1)}" y2="${toY(0).toFixed(1)}" stroke="#333" stroke-width="1.5"/>`;
        svg += `<text x="${(W - padding - 6).toFixed(1)}" y="${(toY(0) - 4).toFixed(1)}" text-anchor="end" font-size="11" font-weight="bold" fill="#333">x</text>`;
        svg += `<text x="${(toX(0) + 4).toFixed(1)}" y="${(padding + 10).toFixed(1)}" font-size="11" font-weight="bold" fill="#333">y</text>`;

        const yAtLine = (slope, yIntercept, x) => slope * x + yIntercept;

        // Inequality shading (if present)
        if (inequality && typeof inequality === 'object') {
            const slope = +inequality.slope || 0;
            const yInt = +inequality.yIntercept || 0;
            const isGreater = inequality.type === 'greater' || inequality.type === '>' || inequality.type === 'gt';
            const incl = inequality.inclusive !== false && inequality.inclusive !== 'false';
            const yL = yAtLine(slope, yInt, -xRange);
            const yR = yAtLine(slope, yInt, xRange);
            const polygonY = isGreater ? yRange : -yRange;
            const polyPts = [
                [toX(-xRange), toY(yL)],
                [toX(xRange), toY(yR)],
                [toX(xRange), toY(polygonY)],
                [toX(-xRange), toY(polygonY)]
            ].map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
            svg += `<polygon points="${polyPts}" fill="rgba(102,126,234,0.18)"/>`;
            svg += `<line x1="${toX(-xRange).toFixed(1)}" y1="${toY(yL).toFixed(1)}" x2="${toX(xRange).toFixed(1)}" y2="${toY(yR).toFixed(1)}" stroke="#667eea" stroke-width="2.2" ${incl ? '' : 'stroke-dasharray="6,4"'}/>`;
        }

        // Lines
        const colors = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12'];
        lines.forEach((line, idx) => {
            const slope = +line.slope || 0;
            const yInt = +line.yIntercept || 0;
            const yL = yAtLine(slope, yInt, -xRange);
            const yR = yAtLine(slope, yInt, xRange);
            svg += `<line x1="${toX(-xRange).toFixed(1)}" y1="${toY(yL).toFixed(1)}" x2="${toX(xRange).toFixed(1)}" y2="${toY(yR).toFixed(1)}" stroke="${colors[idx % colors.length]}" stroke-width="2.2"/>`;
        });

        svg += `</svg>`;
        return svg;
    }

    _renderAngle(params) {
        const degrees = +params.degrees != null && !isNaN(+params.degrees) ? +params.degrees : 60;
        const label = params.label != null ? String(params.label) : 'θ';
        const showMeasure = params.showMeasure !== false;

        const W = 280, H = 220;
        const cx = 60, cy = H - 50;
        const rayLen = 180;

        const rad = (degrees * Math.PI) / 180;
        const ex1 = cx + rayLen, ey1 = cy;
        const ex2 = cx + rayLen * Math.cos(rad);
        const ey2 = cy - rayLen * Math.sin(rad);

        let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
        svg += `<rect width="${W}" height="${H}" fill="#fff"/>`;
        // Rays
        svg += `<line x1="${cx}" y1="${cy}" x2="${ex1.toFixed(1)}" y2="${ey1.toFixed(1)}" stroke="#2c3e50" stroke-width="2"/>`;
        svg += `<line x1="${cx}" y1="${cy}" x2="${ex2.toFixed(1)}" y2="${ey2.toFixed(1)}" stroke="#2c3e50" stroke-width="2"/>`;

        // Arc
        const arcR = 36;
        const aEnd = { x: cx + arcR * Math.cos(rad), y: cy - arcR * Math.sin(rad) };
        const largeArc = degrees > 180 ? 1 : 0;
        svg += `<path d="M ${(cx + arcR).toFixed(1)} ${cy} A ${arcR} ${arcR} 0 ${largeArc} 0 ${aEnd.x.toFixed(1)} ${aEnd.y.toFixed(1)}" fill="none" stroke="#e67e22" stroke-width="2.2"/>`;

        // Right-angle square
        if (Math.abs(degrees - 90) < 0.5) {
            const sq = 14;
            svg += `<rect x="${cx}" y="${(cy - sq).toFixed(1)}" width="${sq}" height="${sq}" fill="none" stroke="#2c3e50" stroke-width="1.5"/>`;
        }

        // Vertex
        svg += `<circle cx="${cx}" cy="${cy}" r="3.5" fill="#2c3e50"/>`;

        // Label
        const labelR = 56;
        const labelMid = { x: cx + labelR * Math.cos(rad / 2), y: cy - labelR * Math.sin(rad / 2) };
        const labelText = showMeasure ? `${label} = ${degrees}°` : label;
        svg += `<text x="${labelMid.x.toFixed(1)}" y="${labelMid.y.toFixed(1)}" text-anchor="middle" font-size="14" font-weight="bold" fill="#e67e22">${this._escape(labelText)}</text>`;

        svg += `</svg>`;
        return svg;
    }
}

// Initialize global instance
window.diagramDisplay = new DiagramDisplay();

console.log('Diagram Display System loaded (inline SVG)');

/**
 * SKILL MAP — The Mathematical Universe
 *
 * Vertical tier-based constellation layout with always-visible
 * labeled connections and Prezi-style flyTo navigation.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

// Math symbols mapped per pattern — used as node glyphs
const PATTERN_SYMBOLS = {
    equivalence:  { symbol: '=',  unicode: '\u003D' },
    scaling:      { symbol: '\u00D7', unicode: '\u00D7' },
    change:       { symbol: '\u0394', unicode: '\u0394' },
    structure:    { symbol: '\u03B1', unicode: '\u03B1' },
    space:        { symbol: '\u25B3', unicode: '\u25B3' },
    comparison:   { symbol: '\u2264', unicode: '\u2264' },
    uncertainty:  { symbol: '\u03C3', unicode: '\u03C3' },
    accumulation: { symbol: '\u03A3', unicode: '\u03A3' }
};

// Tier names — bottom to top
const TIER_NAMES = ['Concrete', 'Symbolic', 'Structural', 'Formal'];

// Node shapes per tier: circle, diamond, star-4, star-6
const TIER_SHAPES = {
    1: 'circle',
    2: 'diamond',
    3: 'star4',
    4: 'star6'
};

// Edge relationship labels
const EDGE_LABELS = {
    prerequisite: 'prerequisite',
    enables: 'enables'
};

// ============================================================================
// STATE
// ============================================================================

const state = {
    graphData: null,
    simulation: null,
    svg: null,
    g: null,
    zoom: null,
    selectedNode: null,
    frontierNodes: [],
    currentZoom: 1.0
};

// DOM refs
const graphContainer = document.getElementById('graph-container');
const nodeDetail = document.getElementById('nodeDetail');
const closeDetailBtn = document.getElementById('closeDetail');
const practiceBtn = document.getElementById('practiceBtn');
const resetZoomBtn = document.getElementById('resetZoom');
const showHelpBtn = document.getElementById('showHelp');

// ============================================================================
// INIT
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadGraphData();
    initEventListeners();
});

async function loadGraphData() {
    try {
        const res = await fetch('/api/mastery/skill-graph', { credentials: 'include' });

        if (res.status === 401) { window.location.href = '/login.html'; return; }
        if (!res.ok) throw new Error('Failed to load skill graph');

        const data = await res.json();

        if (!data.assessmentCompleted) { window.location.href = '/screener.html'; return; }

        if (!data.nodes || data.nodes.length === 0) {
            graphContainer.innerHTML =
                '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#ccd6e0;font-size:1.1rem;text-align:center;padding:2rem;">' +
                '<div><p style="font-size:2rem;margin-bottom:1rem;">&#x2728;</p>' +
                '<p>No skills discovered yet.</p>' +
                '<p style="font-size:0.9rem;margin-top:0.5rem;opacity:0.5;">Complete the screener to map your math journey.</p></div></div>';
            return;
        }

        state.graphData = data;

        // Update stats
        const mastered = data.nodes.filter(n => n.state === 'mastered').length;
        document.getElementById('masteredCount').textContent = mastered;
        document.getElementById('totalSkills').textContent = data.nodes.length;

        // Detect frontier nodes
        state.frontierNodes = detectFrontier(data.nodes, data.edges);

        // Build the graph
        buildGraph(data);

    } catch (err) {
        console.error('Error loading skill graph:', err);
        graphContainer.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#ccd6e0;">' +
            '<p>Failed to load skill map. Please refresh.</p></div>';
    }
}

// ============================================================================
// FRONTIER DETECTION
// ============================================================================

function detectFrontier(nodes, edges) {
    const ready = nodes.filter(n => n.state === 'ready');
    if (ready.length === 0) return [];

    const scored = ready.map(node => ({
        node,
        unlocks: edges.filter(e =>
            (typeof e.source === 'object' ? e.source.id : e.source) === node.id
        ).length
    }));

    scored.sort((a, b) => b.unlocks - a.unlocks);
    return scored.slice(0, 3).map(s => s.node);
}

// ============================================================================
// GRAPH BUILDER
// ============================================================================

function buildGraph(data) {
    const W = graphContainer.clientWidth;
    const H = graphContainer.clientHeight;

    // --- Layout parameters ---
    const MARGIN_LEFT = 80;
    const MARGIN_RIGHT = 80;
    const MARGIN_TOP = 80;
    const MARGIN_BOTTOM = 80;
    const graphW = W - MARGIN_LEFT - MARGIN_RIGHT;
    const graphH = H - MARGIN_TOP - MARGIN_BOTTOM;

    // Tier Y positions: tier 1 (Concrete) at bottom, tier 4 (Formal) at top
    const tierY = {};
    for (let t = 1; t <= 4; t++) {
        tierY[t] = MARGIN_TOP + graphH - ((t - 1) / 3) * graphH;
    }

    // Pattern X positions: spread patterns across width
    const patterns = data.clusters.map(c => c.id);
    const patternX = {};
    patterns.forEach((p, i) => {
        patternX[p] = MARGIN_LEFT + (i / (patterns.length - 1 || 1)) * graphW;
    });

    // --- Assign deterministic positions ---
    // Group by pattern + tier and spread within each cell
    const groups = {};
    data.nodes.forEach(node => {
        const key = `${node.pattern}-${node.tier}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(node);
    });

    Object.keys(groups).forEach(key => {
        const [pattern, tierStr] = key.split('-');
        const tier = parseInt(tierStr);
        const nodesInGroup = groups[key];
        const cx = patternX[pattern];
        const cy = tierY[tier];
        const spread = Math.min(60, graphW / patterns.length * 0.3);

        nodesInGroup.forEach((node, i) => {
            const count = nodesInGroup.length;
            const offset = count === 1 ? 0 : (i - (count - 1) / 2) * (spread / Math.max(count - 1, 1)) * 2;
            // Add slight vertical jitter based on index to avoid perfect lines
            const jitterY = (i % 3 - 1) * 15;
            node.x = cx + offset;
            node.y = cy + jitterY;
            node.fx = node.x; // Fix positions — no force jitter
            node.fy = node.y;
        });
    });

    // --- Create SVG ---
    state.zoom = d3.zoom()
        .scaleExtent([0.3, 5.0])
        .on('zoom', (event) => {
            state.g.attr('transform', event.transform);
            state.currentZoom = event.transform.k;
        });

    state.svg = d3.select('#graph-container')
        .append('svg')
        .attr('width', W)
        .attr('height', H)
        .call(state.zoom);

    state.g = state.svg.append('g');

    // --- Layers (back to front) ---
    const tierLayer = state.g.append('g').attr('class', 'tier-layer');
    const hullLayer = state.g.append('g').attr('class', 'hull-layer');
    const edgeLayer = state.g.append('g').attr('class', 'edge-layer');
    const nodeLayer = state.g.append('g').attr('class', 'node-layer');
    const labelLayer = state.g.append('g').attr('class', 'label-layer');

    // --- Draw tier lines & labels ---
    for (let t = 1; t <= 4; t++) {
        const y = tierY[t];

        tierLayer.append('line')
            .attr('class', 'tier-line')
            .attr('x1', MARGIN_LEFT - 40)
            .attr('x2', W - MARGIN_RIGHT + 40)
            .attr('y1', y)
            .attr('y2', y);

        tierLayer.append('text')
            .attr('class', 'tier-label')
            .attr('x', 16)
            .attr('y', y + 4)
            .attr('text-anchor', 'start')
            .text(TIER_NAMES[t - 1]);
    }

    // --- Draw region hulls (nebula backgrounds) ---
    drawRegionHulls(hullLayer, data);

    // --- Draw region labels ---
    data.clusters.forEach(cluster => {
        const clusterNodes = data.nodes.filter(n => n.pattern === cluster.id);
        if (clusterNodes.length === 0) return;

        const cx = d3.mean(clusterNodes, n => n.x);
        const cy = d3.min(clusterNodes, n => n.y) - 30;

        labelLayer.append('text')
            .attr('class', 'region-label')
            .attr('x', cx)
            .attr('y', cy)
            .attr('text-anchor', 'middle')
            .attr('fill', cluster.color)
            .style('opacity', 0.35)
            .text(cluster.name.toUpperCase());
    });

    // --- Draw edges (always visible, labeled) ---
    drawEdges(edgeLayer, data);

    // --- Draw nodes ---
    drawNodes(nodeLayer, data);

    // --- Initial view: fit everything ---
    fitView(800);
}

// ============================================================================
// DRAWING FUNCTIONS
// ============================================================================

/**
 * Draw region hulls — soft nebula blobs behind each pattern cluster
 */
function drawRegionHulls(layer, data) {
    const grouped = d3.group(data.nodes, d => d.pattern);

    grouped.forEach((nodes, patternId) => {
        if (nodes.length < 3) return;

        const cluster = data.clusters.find(c => c.id === patternId);
        if (!cluster) return;

        const points = nodes.map(n => [n.x, n.y]);
        const hull = d3.polygonHull(points);
        if (!hull) return;

        // Expand hull slightly for visual padding
        const cx = d3.mean(hull, p => p[0]);
        const cy = d3.mean(hull, p => p[1]);
        const expanded = hull.map(p => [
            cx + (p[0] - cx) * 1.4,
            cy + (p[1] - cy) * 1.4
        ]);

        layer.append('path')
            .attr('class', 'region-hull')
            .attr('d', 'M' + expanded.join('L') + 'Z')
            .attr('fill', cluster.color)
            .attr('stroke', cluster.color);
    });
}

/**
 * Draw edges — always visible, with arrow and relationship label
 */
function drawEdges(layer, data) {
    // Defs for arrowheads per pattern color
    const defs = state.svg.select('defs').empty()
        ? state.svg.append('defs')
        : state.svg.select('defs');

    // Default arrowhead
    defs.append('marker')
        .attr('id', 'arrow-default')
        .attr('viewBox', '0 -4 8 8')
        .attr('refX', 8)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-3L8,0L0,3')
        .attr('class', 'edge-arrow');

    data.edges.forEach(edge => {
        const source = typeof edge.source === 'object' ? edge.source : data.nodes.find(n => n.id === edge.source);
        const target = typeof edge.target === 'object' ? edge.target : data.nodes.find(n => n.id === edge.target);
        if (!source || !target) return;

        // Determine edge color from source cluster
        const cluster = data.clusters.find(c => c.id === source.pattern);
        const color = cluster ? cluster.color : 'rgba(255,255,255,0.2)';

        // Draw line
        const edgeGroup = layer.append('g');

        edgeGroup.append('line')
            .attr('class', 'edge-line')
            .attr('x1', source.x)
            .attr('y1', source.y)
            .attr('x2', target.x)
            .attr('y2', target.y)
            .attr('stroke', color)
            .attr('marker-end', 'url(#arrow-default)');

        // Edge label at midpoint
        if (edge.type) {
            const mx = (source.x + target.x) / 2;
            const my = (source.y + target.y) / 2;

            // Compute angle for label rotation
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            let angle = Math.atan2(dy, dx) * (180 / Math.PI);
            // Keep labels readable (not upside down)
            if (angle > 90 || angle < -90) angle += 180;

            edgeGroup.append('text')
                .attr('class', 'edge-label')
                .attr('x', mx)
                .attr('y', my - 4)
                .attr('text-anchor', 'middle')
                .attr('transform', `rotate(${angle}, ${mx}, ${my})`)
                .text(edge.type);
        }
    });
}

/**
 * Generate SVG path for node shape based on tier
 */
function nodeShapePath(tier, r) {
    switch (TIER_SHAPES[tier]) {
        case 'diamond': {
            const s = r * 1.2;
            return `M0,${-s} L${s},0 L0,${s} L${-s},0 Z`;
        }
        case 'star4': {
            const outer = r * 1.3;
            const inner = r * 0.55;
            let d = '';
            for (let i = 0; i < 8; i++) {
                const rad = (i * Math.PI) / 4 - Math.PI / 2;
                const dist = i % 2 === 0 ? outer : inner;
                d += (i === 0 ? 'M' : 'L') + (Math.cos(rad) * dist) + ',' + (Math.sin(rad) * dist);
            }
            return d + 'Z';
        }
        case 'star6': {
            const outer6 = r * 1.4;
            const inner6 = r * 0.6;
            let d6 = '';
            for (let i = 0; i < 12; i++) {
                const rad = (i * Math.PI) / 6 - Math.PI / 2;
                const dist = i % 2 === 0 ? outer6 : inner6;
                d6 += (i === 0 ? 'M' : 'L') + (Math.cos(rad) * dist) + ',' + (Math.sin(rad) * dist);
            }
            return d6 + 'Z';
        }
        default: // circle — use a circle element instead
            return null;
    }
}

/**
 * Draw nodes — shape per tier, math symbol inside, label below
 */
function drawNodes(layer, data) {
    const isFrontier = (node) => state.frontierNodes.some(fn => fn.id === node.id);

    const nodeGroups = layer.selectAll('.skill-node')
        .data(data.nodes)
        .join('g')
        .attr('class', d => {
            let cls = 'skill-node ' + d.state;
            if (isFrontier(d)) cls += ' frontier';
            return cls;
        })
        .attr('transform', d => `translate(${d.x},${d.y})`)
        .style('cursor', d => d.state === 'locked' ? 'default' : 'pointer')
        .on('click', (event, d) => {
            event.stopPropagation();
            if (d.state === 'locked') return;
            showNodeDetail(d);
        })
        .on('mouseover', function (event, d) {
            if (d.state === 'locked') return;
            highlightConnected(d);
        })
        .on('mouseout', function () {
            unhighlightAll();
        });

    // Draw shape
    nodeGroups.each(function (d) {
        const g = d3.select(this);
        const r = getNodeRadius(d);
        const shapePath = nodeShapePath(d.tier, r);

        if (shapePath) {
            g.append('path')
                .attr('class', 'node-shape')
                .attr('d', shapePath)
                .attr('fill', d.color)
                .attr('stroke', d.color);
        } else {
            g.append('circle')
                .attr('class', 'node-shape')
                .attr('r', r)
                .attr('fill', d.color)
                .attr('stroke', d.color);
        }
    });

    // Math symbol inside node
    nodeGroups.append('text')
        .attr('class', 'node-symbol')
        .attr('y', 1)
        .text(d => {
            const sym = PATTERN_SYMBOLS[d.pattern];
            return sym ? sym.symbol : '';
        });

    // Skill label below
    nodeGroups.append('text')
        .attr('class', 'node-label')
        .attr('y', d => getNodeRadius(d) + 14)
        .text(d => d.label);

    state.nodeGroups = nodeGroups;
}

function getNodeRadius(d) {
    let r = 10;
    if (d.tier >= 3) r = 12;
    if (d.tier === 4) r = 14;
    if (d.state === 'mastered') r += 2;
    return r;
}

// ============================================================================
// INTERACTION
// ============================================================================

function highlightConnected(node) {
    if (!state.graphData) return;

    const connectedIds = new Set([node.id]);
    state.graphData.edges.forEach(e => {
        const sid = typeof e.source === 'object' ? e.source.id : e.source;
        const tid = typeof e.target === 'object' ? e.target.id : e.target;
        if (sid === node.id) connectedIds.add(tid);
        if (tid === node.id) connectedIds.add(sid);
    });

    // Dim unrelated nodes
    state.g.selectAll('.skill-node')
        .style('opacity', d => connectedIds.has(d.id) ? 1 : 0.15);

    // Highlight connected edges
    state.g.selectAll('.edge-line')
        .style('opacity', function () {
            const line = d3.select(this);
            const parent = d3.select(this.parentNode);
            const lineData = parent.datum && parent.datum();
            // Use DOM position to find matching edges
            return null; // handled below
        });

    // Brighten connected edges, dim others
    state.g.selectAll('.edge-layer g').each(function () {
        const lineEl = d3.select(this).select('.edge-line');
        const x1 = +lineEl.attr('x1');
        const y1 = +lineEl.attr('y1');

        // Check if this edge connects to the hovered node
        const isConnected = state.graphData.edges.some(e => {
            const s = typeof e.source === 'object' ? e.source : state.graphData.nodes.find(n => n.id === e.source);
            const t = typeof e.target === 'object' ? e.target : state.graphData.nodes.find(n => n.id === e.target);
            if (!s || !t) return false;
            const matches = (s.id === node.id || t.id === node.id);
            if (!matches) return false;
            return Math.abs(s.x - x1) < 1 && Math.abs(s.y - y1) < 1;
        });

        d3.select(this).style('opacity', isConnected ? 1 : 0.06);
    });
}

function unhighlightAll() {
    state.g.selectAll('.skill-node').style('opacity', null);
    state.g.selectAll('.edge-layer g').style('opacity', null);
}

function showNodeDetail(node) {
    state.selectedNode = node;
    nodeDetail.classList.remove('hidden');

    document.getElementById('detailTitle').textContent = node.label;
    document.getElementById('detailPattern').textContent = node.patternName;
    document.getElementById('detailTier').textContent = `${node.tier} \u2014 ${node.tierName}`;
    document.getElementById('detailMilestone').textContent = node.milestoneName;

    const badge = document.getElementById('detailStatus');
    badge.textContent = (node.state || '').toUpperCase();
    badge.className = 'status-badge ' + node.state;

    const progress = Math.round(node.progress || 0);
    document.getElementById('detailProgressBar').style.width = progress + '%';
    document.getElementById('detailProgressText').textContent = progress + '%';

    practiceBtn.disabled = (node.state === 'locked');

    // Fly to node
    flyTo(node.x, node.y, 2.5);
}

function hideNodeDetail() {
    nodeDetail.classList.add('hidden');
    state.selectedNode = null;
}

// ============================================================================
// CAMERA / NAVIGATION
// ============================================================================

function flyTo(x, y, scale, duration = 600) {
    if (!state.svg) return;
    const W = graphContainer.clientWidth;
    const H = graphContainer.clientHeight;

    const tx = W / 2 - x * scale;
    const ty = H / 2 - y * scale;

    state.svg.transition()
        .duration(duration)
        .ease(d3.easeCubicInOut)
        .call(
            state.zoom.transform,
            d3.zoomIdentity.translate(tx, ty).scale(scale)
        );
}

function fitView(duration = 0) {
    if (!state.graphData || !state.svg) return;

    const nodes = state.graphData.nodes;
    const W = graphContainer.clientWidth;
    const H = graphContainer.clientHeight;
    const pad = 60;

    const xMin = d3.min(nodes, n => n.x) - pad;
    const xMax = d3.max(nodes, n => n.x) + pad;
    const yMin = d3.min(nodes, n => n.y) - pad;
    const yMax = d3.max(nodes, n => n.y) + pad;

    const dataW = xMax - xMin;
    const dataH = yMax - yMin;
    const scale = Math.min(W / dataW, H / dataH, 2);
    const cx = (xMin + xMax) / 2;
    const cy = (yMin + yMax) / 2;

    const tx = W / 2 - cx * scale;
    const ty = H / 2 - cy * scale;

    const t = duration > 0
        ? state.svg.transition().duration(duration).ease(d3.easeCubicInOut)
        : state.svg;

    t.call(state.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
}

function resetView() {
    hideNodeDetail();
    fitView(600);
}

// ============================================================================
// PRACTICE (start session)
// ============================================================================

async function startPractice() {
    if (!state.selectedNode) return;
    const node = state.selectedNode;

    practiceBtn.disabled = true;
    practiceBtn.textContent = 'Loading...';

    try {
        const res = await csrfFetch('/api/mastery/start-skill-practice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                skillId: node.id,
                pattern: node.pattern,
                tier: node.tier,
                milestone: node.milestone || node.milestoneName
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to start practice');

        window.location.href = data.redirect || '/mastery-chat.html';
    } catch (err) {
        console.error('Error starting practice:', err);
        alert('Failed to start practice: ' + err.message);
        practiceBtn.disabled = false;
        practiceBtn.textContent = 'Start Practice';
    }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function initEventListeners() {
    closeDetailBtn.addEventListener('click', hideNodeDetail);
    practiceBtn.addEventListener('click', startPractice);
    resetZoomBtn.addEventListener('click', resetView);
    showHelpBtn.addEventListener('click', showHelp);

    // Close detail on click outside
    document.addEventListener('click', (e) => {
        if (!nodeDetail.classList.contains('hidden') &&
            !nodeDetail.contains(e.target) &&
            !e.target.closest('.skill-node')) {
            hideNodeDetail();
        }
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.key) {
            case 'Escape':
                hideNodeDetail();
                break;
            case 'r':
            case 'R':
                if (!e.ctrlKey && !e.metaKey) resetView();
                break;
            case '?':
                showHelp();
                break;
        }
    });

    // Resize handler
    window.addEventListener('resize', debounce(() => {
        if (state.svg) {
            state.svg.attr('width', graphContainer.clientWidth)
                     .attr('height', graphContainer.clientHeight);
        }
    }, 250));
}

function showHelp() {
    const existing = document.getElementById('helpOverlay');
    if (existing) { existing.remove(); return; }

    const el = document.createElement('div');
    el.id = 'helpOverlay';
    el.className = 'help-overlay';
    el.innerHTML = `
        <div class="help-modal">
            <h3>Keyboard Shortcuts</h3>
            <div class="help-row"><kbd>Esc</kbd><span>Close panel / deselect</span></div>
            <div class="help-row"><kbd>R</kbd><span>Reset view</span></div>
            <div class="help-row"><kbd>?</kbd><span>Toggle this help</span></div>
            <div class="help-row"><kbd>Scroll</kbd><span>Zoom in/out</span></div>
            <div class="help-row"><kbd>Drag</kbd><span>Pan the map</span></div>
        </div>
    `;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
    document.addEventListener('keydown', function handler(e) {
        if (e.key === 'Escape') { el.remove(); document.removeEventListener('keydown', handler); }
    });
}

function debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

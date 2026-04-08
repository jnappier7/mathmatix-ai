/**
 * SKILL MAP — The Mathematical Universe
 *
 * Vertical constellation layout:
 *   - Y axis = tier (Concrete at bottom, Formal at top)
 *   - X axis = force-directed within tier, pulled toward pattern cluster
 *   - Edges always visible, curved, with semantic labels on cross-pattern links
 *   - Prezi-style flyTo navigation
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const PATTERN_SYMBOLS = {
    equivalence:  '=',
    scaling:      '\u00D7',   // ×
    change:       '\u0394',   // Δ
    structure:    '\u03B1',   // α
    space:        '\u25B3',   // △
    comparison:   '\u2264',   // ≤
    uncertainty:  '\u03C3',   // σ
    accumulation: '\u03A3'    // Σ
};

const TIER_NAMES = ['Concrete', 'Symbolic', 'Structural', 'Formal'];

// Node shape per tier — visual hierarchy
const TIER_SHAPES = { 1: 'circle', 2: 'diamond', 3: 'star4', 4: 'star6' };

// Semantic edge label: when source & target are in different patterns
function edgeLabel(source, target, type) {
    if (source.pattern === target.pattern) return null; // same-pattern = no label
    // Cross-pattern connections get meaningful labels
    if (type === 'enables') return 'extends to';
    return 'builds on';
}

// ============================================================================
// STATE
// ============================================================================

const state = {
    graphData: null,
    svg: null,
    g: null,
    zoom: null,
    edgeGroups: null,
    nodeGroups: null,
    selectedNode: null,
    frontierIds: new Set(),
    currentZoom: 1.0
};

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
                '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#ccd6e0;text-align:center;padding:2rem;">' +
                '<div><p style="font-size:2rem;margin-bottom:1rem;">&#x2728;</p>' +
                '<p>No skills discovered yet.</p>' +
                '<p style="font-size:0.9rem;margin-top:0.5rem;opacity:0.5;">Complete the screener to map your math journey.</p></div></div>';
            return;
        }

        state.graphData = data;

        // Stats
        document.getElementById('masteredCount').textContent =
            data.nodes.filter(n => n.state === 'mastered').length;
        document.getElementById('totalSkills').textContent = data.nodes.length;

        // Frontier: top 3 ready nodes by unlock count
        const ready = data.nodes.filter(n => n.state === 'ready');
        const scored = ready.map(n => ({
            id: n.id,
            unlocks: data.edges.filter(e => e.source === n.id).length
        }));
        scored.sort((a, b) => b.unlocks - a.unlocks);
        state.frontierIds = new Set(scored.slice(0, 3).map(s => s.id));

        buildGraph(data);
    } catch (err) {
        console.error('Skill map load error:', err);
        graphContainer.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#ccd6e0;">' +
            '<p>Failed to load skill map. Please refresh.</p></div>';
    }
}

// ============================================================================
// LAYOUT: force-directed X, fixed Y by tier
// ============================================================================

function computeLayout(data, W, H) {
    const PAD = 100;
    const graphH = H - PAD * 2;
    const graphW = W - PAD * 2;

    // Y by tier (bottom = tier 1, top = tier 4)
    const tierY = {};
    for (let t = 1; t <= 4; t++) {
        tierY[t] = PAD + graphH - ((t - 1) / 3) * graphH;
    }

    // Pattern center X — initial seed positions spread across width
    const patterns = data.clusters.map(c => c.id);
    const patternCX = {};
    patterns.forEach((p, i) => {
        patternCX[p] = PAD + (i + 0.5) / patterns.length * graphW;
    });

    // Seed node positions
    const groupCounts = {};
    data.nodes.forEach(node => {
        const key = `${node.pattern}-${node.tier}`;
        groupCounts[key] = (groupCounts[key] || 0);
        const idx = groupCounts[key]++;
        // Spread within pattern column
        node.x = patternCX[node.pattern] + (idx - 1) * 40;
        node.y = tierY[node.tier];
    });

    // Resolve edge references to node objects for the simulation
    const nodeById = new Map(data.nodes.map(n => [n.id, n]));
    const simLinks = data.edges
        .map(e => ({
            source: nodeById.get(e.source),
            target: nodeById.get(e.target),
            type: e.type
        }))
        .filter(l => l.source && l.target);

    // Run simulation: X is free, Y is pinned to tier
    const sim = d3.forceSimulation(data.nodes)
        .force('link', d3.forceLink(simLinks).id(d => d.id).distance(80).strength(0.4))
        .force('charge', d3.forceManyBody().strength(-120))
        .force('collide', d3.forceCollide(22))
        .force('clusterX', d3.forceX(d => patternCX[d.pattern]).strength(0.15))
        .force('tierY', d3.forceY(d => tierY[d.tier]).strength(1.0)) // strong Y pin
        .alphaDecay(0.04)
        .velocityDecay(0.35)
        .stop();

    // Run synchronously (no animation needed — we just want final positions)
    for (let i = 0; i < 300; i++) sim.tick();

    // Snap Y exactly to tier line after simulation
    data.nodes.forEach(n => {
        n.y = tierY[n.tier] + ((n.y - tierY[n.tier]) * 0.15); // slight Y variation
    });

    return { tierY, patternCX, simLinks };
}

// ============================================================================
// GRAPH BUILDER
// ============================================================================

function buildGraph(data) {
    const W = graphContainer.clientWidth;
    const H = graphContainer.clientHeight;

    const { tierY, simLinks } = computeLayout(data, W, H);

    // SVG + zoom
    state.zoom = d3.zoom()
        .scaleExtent([0.25, 6.0])
        .on('zoom', (event) => {
            state.g.attr('transform', event.transform);
            state.currentZoom = event.transform.k;
        });

    state.svg = d3.select('#graph-container')
        .append('svg')
        .attr('width', W)
        .attr('height', H)
        .call(state.zoom);

    // Defs
    const defs = state.svg.append('defs');

    // Arrowhead marker
    defs.append('marker')
        .attr('id', 'arrow')
        .attr('viewBox', '0 -4 8 8')
        .attr('refX', 20)
        .attr('refY', 0)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-3L8,0L0,3')
        .attr('fill', 'rgba(255,255,255,0.25)');

    state.g = state.svg.append('g');

    // Layers
    const tierLayer = state.g.append('g').attr('class', 'tier-layer');
    const hullLayer = state.g.append('g').attr('class', 'hull-layer');
    const edgeLayer = state.g.append('g').attr('class', 'edge-layer');
    const regionLabelLayer = state.g.append('g').attr('class', 'region-label-layer');
    const nodeLayer = state.g.append('g').attr('class', 'node-layer');

    // --- Tier lines & labels ---
    for (let t = 1; t <= 4; t++) {
        const y = tierY[t];
        tierLayer.append('line')
            .attr('class', 'tier-line')
            .attr('x1', 20).attr('x2', W - 20)
            .attr('y1', y).attr('y2', y);
        tierLayer.append('text')
            .attr('class', 'tier-label')
            .attr('x', 14).attr('y', y + 4)
            .text(TIER_NAMES[t - 1]);
    }

    // --- Region hulls ---
    drawHulls(hullLayer, data);

    // --- Region labels ---
    drawRegionLabels(regionLabelLayer, data);

    // --- Edges (D3 data join, curved, labeled) ---
    drawEdges(edgeLayer, simLinks, data);

    // --- Nodes ---
    drawNodes(nodeLayer, data);

    // --- Fit view ---
    fitView(900);
}

// ============================================================================
// HULLS — soft nebula backgrounds per pattern
// ============================================================================

function drawHulls(layer, data) {
    const grouped = d3.group(data.nodes, d => d.pattern);

    grouped.forEach((nodes, pid) => {
        if (nodes.length < 3) return;
        const cluster = data.clusters.find(c => c.id === pid);
        if (!cluster) return;

        const points = nodes.map(n => [n.x, n.y]);
        const hull = d3.polygonHull(points);
        if (!hull) return;

        const cx = d3.mean(hull, p => p[0]);
        const cy = d3.mean(hull, p => p[1]);
        const expanded = hull.map(p => [
            cx + (p[0] - cx) * 1.5,
            cy + (p[1] - cy) * 1.5
        ]);

        layer.append('path')
            .attr('class', 'region-hull')
            .attr('d', 'M' + expanded.join('L') + 'Z')
            .attr('fill', cluster.color)
            .attr('stroke', cluster.color);
    });
}

// ============================================================================
// REGION LABELS — pattern name positioned above each cluster
// ============================================================================

function drawRegionLabels(layer, data) {
    data.clusters.forEach(cluster => {
        const nodes = data.nodes.filter(n => n.pattern === cluster.id);
        if (nodes.length === 0) return;

        const cx = d3.mean(nodes, n => n.x);
        const minY = d3.min(nodes, n => n.y);

        layer.append('text')
            .attr('class', 'region-label')
            .attr('x', cx)
            .attr('y', minY - 35)
            .attr('text-anchor', 'middle')
            .attr('fill', cluster.color)
            .text(cluster.name.toUpperCase());
    });
}

// ============================================================================
// EDGES — curved paths with proper D3 data join
// ============================================================================

function drawEdges(layer, simLinks, data) {
    state.edgeGroups = layer.selectAll('.edge-group')
        .data(simLinks, d => d.source.id + '->' + d.target.id)
        .join('g')
        .attr('class', 'edge-group');

    // Curved path
    state.edgeGroups.append('path')
        .attr('class', 'edge-line')
        .attr('d', d => curvedEdge(d.source, d.target))
        .attr('stroke', d => {
            const c = data.clusters.find(cl => cl.id === d.source.pattern);
            return c ? c.color : 'rgba(255,255,255,0.15)';
        })
        .attr('marker-end', 'url(#arrow)');

    // Labels — only on cross-pattern edges
    state.edgeGroups.each(function (d) {
        const label = edgeLabel(d.source, d.target, d.type);
        if (!label) return;

        const mx = (d.source.x + d.target.x) / 2;
        const my = (d.source.y + d.target.y) / 2;

        d3.select(this).append('text')
            .attr('class', 'edge-label')
            .attr('x', mx)
            .attr('y', my - 5)
            .attr('text-anchor', 'middle')
            .text(label);
    });
}

function curvedEdge(s, t) {
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    // Curve amount proportional to distance, subtle
    const curve = Math.min(Math.abs(dx) * 0.2, 40);
    const mx = (s.x + t.x) / 2 + (dy > 0 ? curve : -curve);
    const my = (s.y + t.y) / 2;
    return `M${s.x},${s.y} Q${mx},${my} ${t.x},${t.y}`;
}

// ============================================================================
// NODES — shape per tier, math symbol, full label
// ============================================================================

function drawNodes(layer, data) {
    state.nodeGroups = layer.selectAll('.skill-node')
        .data(data.nodes, d => d.id)
        .join('g')
        .attr('class', d => {
            let cls = 'skill-node ' + d.state;
            if (state.frontierIds.has(d.id)) cls += ' frontier';
            return cls;
        })
        .attr('transform', d => `translate(${d.x},${d.y})`)
        .on('click', (event, d) => {
            event.stopPropagation();
            if (d.state === 'locked') return;
            showNodeDetail(d);
        })
        .on('mouseover', (event, d) => {
            if (d.state === 'locked') return;
            highlightConnected(d);
        })
        .on('mouseout', () => unhighlightAll());

    // Shape
    state.nodeGroups.each(function (d) {
        const g = d3.select(this);
        const r = nodeRadius(d);
        const path = shapePath(d.tier, r);
        if (path) {
            g.append('path').attr('class', 'node-shape').attr('d', path);
        } else {
            g.append('circle').attr('class', 'node-shape').attr('r', r);
        }
    });

    // Math symbol
    state.nodeGroups.append('text')
        .attr('class', 'node-symbol')
        .attr('y', 1)
        .text(d => PATTERN_SYMBOLS[d.pattern] || '');

    // Skill name label
    state.nodeGroups.append('text')
        .attr('class', 'node-label')
        .attr('y', d => nodeRadius(d) + 14)
        .text(d => d.label);
}

function nodeRadius(d) {
    let r = 10;
    if (d.tier >= 3) r = 12;
    if (d.tier === 4) r = 14;
    if (d.state === 'mastered') r += 2;
    return r;
}

function shapePath(tier, r) {
    switch (TIER_SHAPES[tier]) {
        case 'diamond': {
            const s = r * 1.2;
            return `M0,${-s} L${s},0 L0,${s} L${-s},0 Z`;
        }
        case 'star4': {
            const o = r * 1.3, n = r * 0.55;
            let d = '';
            for (let i = 0; i < 8; i++) {
                const a = i * Math.PI / 4 - Math.PI / 2;
                const dist = i % 2 === 0 ? o : n;
                d += (i === 0 ? 'M' : 'L') + (Math.cos(a) * dist).toFixed(1) + ',' + (Math.sin(a) * dist).toFixed(1);
            }
            return d + 'Z';
        }
        case 'star6': {
            const o = r * 1.4, n = r * 0.6;
            let d = '';
            for (let i = 0; i < 12; i++) {
                const a = i * Math.PI / 6 - Math.PI / 2;
                const dist = i % 2 === 0 ? o : n;
                d += (i === 0 ? 'M' : 'L') + (Math.cos(a) * dist).toFixed(1) + ',' + (Math.sin(a) * dist).toFixed(1);
            }
            return d + 'Z';
        }
        default: return null; // circle
    }
}

// ============================================================================
// HIGHLIGHT — proper data-driven edge matching
// ============================================================================

function highlightConnected(node) {
    const connectedIds = new Set([node.id]);
    state.edgeGroups.each(function (d) {
        if (d.source.id === node.id) connectedIds.add(d.target.id);
        if (d.target.id === node.id) connectedIds.add(d.source.id);
    });

    state.nodeGroups
        .transition().duration(150)
        .style('opacity', d => connectedIds.has(d.id) ? 1 : 0.1);

    state.edgeGroups
        .transition().duration(150)
        .style('opacity', d =>
            (d.source.id === node.id || d.target.id === node.id) ? 1 : 0.04
        );

    // Brighten connected edges
    state.edgeGroups.select('.edge-line')
        .classed('edge-active', d =>
            d.source.id === node.id || d.target.id === node.id
        );
}

function unhighlightAll() {
    state.nodeGroups.transition().duration(200).style('opacity', null);
    state.edgeGroups.transition().duration(200).style('opacity', null);
    state.edgeGroups.select('.edge-line').classed('edge-active', false);
}

// ============================================================================
// NODE DETAIL PANEL
// ============================================================================

function showNodeDetail(node) {
    state.selectedNode = node;
    nodeDetail.classList.remove('hidden');

    document.getElementById('detailTitle').textContent = node.label;
    document.getElementById('detailPattern').textContent = node.patternName;
    document.getElementById('detailTier').textContent = node.tier + ' \u2014 ' + node.tierName;
    document.getElementById('detailMilestone').textContent = node.milestoneName;

    const badge = document.getElementById('detailStatus');
    badge.textContent = (node.state || '').toUpperCase();
    badge.className = 'status-badge ' + node.state;

    const pct = Math.round(node.progress || 0);
    document.getElementById('detailProgressBar').style.width = pct + '%';
    document.getElementById('detailProgressText').textContent = pct + '%';

    practiceBtn.disabled = (node.state === 'locked');

    flyTo(node.x, node.y, 2.5);
}

function hideNodeDetail() {
    nodeDetail.classList.add('hidden');
    state.selectedNode = null;
}

// ============================================================================
// CAMERA
// ============================================================================

function flyTo(x, y, scale, dur = 600) {
    if (!state.svg) return;
    const W = graphContainer.clientWidth;
    const H = graphContainer.clientHeight;
    state.svg.transition().duration(dur).ease(d3.easeCubicInOut)
        .call(state.zoom.transform,
            d3.zoomIdentity
                .translate(W / 2 - x * scale, H / 2 - y * scale)
                .scale(scale));
}

function fitView(dur = 0) {
    if (!state.graphData || !state.svg) return;
    const nodes = state.graphData.nodes;
    const W = graphContainer.clientWidth;
    const H = graphContainer.clientHeight;
    const pad = 80;

    const xMin = d3.min(nodes, n => n.x) - pad;
    const xMax = d3.max(nodes, n => n.x) + pad;
    const yMin = d3.min(nodes, n => n.y) - pad;
    const yMax = d3.max(nodes, n => n.y) + pad;
    const scale = Math.min(W / (xMax - xMin), H / (yMax - yMin), 2.5);
    const cx = (xMin + xMax) / 2;
    const cy = (yMin + yMax) / 2;

    const t = dur > 0
        ? state.svg.transition().duration(dur).ease(d3.easeCubicInOut)
        : state.svg;
    t.call(state.zoom.transform,
        d3.zoomIdentity
            .translate(W / 2 - cx * scale, H / 2 - cy * scale)
            .scale(scale));
}

function resetView() {
    hideNodeDetail();
    fitView(600);
}

// ============================================================================
// PRACTICE
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
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Failed to start practice');
        window.location.href = body.redirect || '/mastery-chat.html';
    } catch (err) {
        console.error('Start practice error:', err);
        alert('Failed to start practice: ' + err.message);
        practiceBtn.disabled = false;
        practiceBtn.textContent = 'Start Practice';
    }
}

// ============================================================================
// EVENTS
// ============================================================================

function initEventListeners() {
    closeDetailBtn.addEventListener('click', hideNodeDetail);
    practiceBtn.addEventListener('click', startPractice);
    resetZoomBtn.addEventListener('click', resetView);
    showHelpBtn.addEventListener('click', showHelp);

    document.addEventListener('click', (e) => {
        if (!nodeDetail.classList.contains('hidden') &&
            !nodeDetail.contains(e.target) &&
            !e.target.closest('.skill-node')) {
            hideNodeDetail();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === 'Escape') hideNodeDetail();
        if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) resetView();
        if (e.key === '?') showHelp();
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (state.svg) {
                state.svg.attr('width', graphContainer.clientWidth)
                         .attr('height', graphContainer.clientHeight);
            }
        }, 250);
    });
}

function showHelp() {
    const existing = document.getElementById('helpOverlay');
    if (existing) { existing.remove(); return; }

    const el = document.createElement('div');
    el.id = 'helpOverlay';
    el.className = 'help-overlay';
    el.innerHTML =
        '<div class="help-modal">' +
            '<h3>Keyboard Shortcuts</h3>' +
            '<div class="help-row"><kbd>Esc</kbd><span>Close panel</span></div>' +
            '<div class="help-row"><kbd>R</kbd><span>Reset view</span></div>' +
            '<div class="help-row"><kbd>?</kbd><span>Toggle help</span></div>' +
            '<div class="help-row"><kbd>Scroll</kbd><span>Zoom</span></div>' +
            '<div class="help-row"><kbd>Drag</kbd><span>Pan</span></div>' +
        '</div>';
    document.body.appendChild(el);

    el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
    const esc = (e) => { if (e.key === 'Escape') { el.remove(); document.removeEventListener('keydown', esc); } };
    document.addEventListener('keydown', esc);
}

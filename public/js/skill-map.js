/**
 * THE MATHEMATICAL UNIVERSE — Constellation Skill Map
 *
 * Cinematic entrance, organic force layout, SVG glow filters,
 * starfield background, curved gradient edges, smooth nebula hulls.
 */

// ============================================================================
// PALETTE — unique, space-appropriate colors per pattern
// ============================================================================

const COLORS = {
    equivalence:  '#4fc3f7',
    scaling:      '#ce93d8',
    change:       '#ffb74d',
    structure:    '#81c784',
    space:        '#4dd0e1',
    comparison:   '#ff8a65',
    uncertainty:  '#f48fb1',
    accumulation: '#a1887f'
};

const PATTERN_SYMBOLS = {
    equivalence:  '=',
    scaling:      '\u00D7',
    change:       '\u0394',
    structure:    '\u03B1',
    space:        '\u25B3',
    comparison:   '\u2264',
    uncertainty:  '\u03C3',
    accumulation: '\u03A3'
};

const TIER_NAMES = ['Concrete', 'Symbolic', 'Structural', 'Formal'];
const TIER_SHAPES = { 1: 'circle', 2: 'diamond', 3: 'star4', 4: 'star6' };

function crossPatternLabel(source, target, type) {
    if (source.pattern === target.pattern) return null;
    return type === 'enables' ? 'extends to' : 'builds on';
}

// ============================================================================
// STATE
// ============================================================================

const state = {
    graphData: null, svg: null, g: null, zoom: null,
    edgeGroups: null, nodeGroups: null, selectedNode: null,
    frontierIds: new Set(), currentZoom: 1.0
};

const $ = id => document.getElementById(id);
const graphContainer = $('graph-container');

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
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        if (!data.assessmentCompleted) { window.location.href = '/screener.html'; return; }
        if (!data.nodes || !data.nodes.length) {
            graphContainer.innerHTML =
                '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#667;text-align:center;padding:2rem">' +
                '<div><p style="font-size:1.8rem;margin-bottom:12px;opacity:0.4">&#x2728;</p>' +
                '<p style="font-size:0.95rem;opacity:0.5">No skills discovered yet.</p>' +
                '<p style="font-size:0.85rem;opacity:0.3;margin-top:6px">Complete the screener to begin.</p></div></div>';
            return;
        }
        state.graphData = data;
        $('masteredCount').textContent = data.nodes.filter(n => n.state === 'mastered').length;
        $('totalSkills').textContent = data.nodes.length;

        // Frontier
        const ready = data.nodes.filter(n => n.state === 'ready');
        const scored = ready.map(n => ({
            id: n.id,
            unlocks: data.edges.filter(e => e.source === n.id).length
        })).sort((a, b) => b.unlocks - a.unlocks);
        state.frontierIds = new Set(scored.slice(0, 3).map(s => s.id));

        // Override colors with our richer palette
        data.nodes.forEach(n => { if (COLORS[n.pattern]) n.color = COLORS[n.pattern]; });

        buildGraph(data);
    } catch (err) {
        console.error('Skill map error:', err);
        graphContainer.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#667">' +
            '<p>Failed to load. Please refresh.</p></div>';
    }
}

// ============================================================================
// LAYOUT — force-sim: free X, pinned Y by tier
// ============================================================================

function computeLayout(data, W, H) {
    const PAD = 120;
    const gW = W - PAD * 2, gH = H - PAD * 2;
    const tierY = {};
    for (let t = 1; t <= 4; t++) tierY[t] = PAD + gH - ((t - 1) / 3) * gH;

    const patterns = data.clusters.map(c => c.id);
    const pCX = {};
    patterns.forEach((p, i) => { pCX[p] = PAD + (i + 0.5) / patterns.length * gW; });

    // Seed positions
    const counts = {};
    data.nodes.forEach(n => {
        const k = n.pattern + '-' + n.tier;
        counts[k] = (counts[k] || 0);
        n.x = pCX[n.pattern] + (counts[k]++ - 1) * 45;
        n.y = tierY[n.tier];
    });

    // Resolve links
    const byId = new Map(data.nodes.map(n => [n.id, n]));
    const simLinks = data.edges
        .map(e => ({ source: byId.get(e.source), target: byId.get(e.target), type: e.type }))
        .filter(l => l.source && l.target);

    // Simulate
    const sim = d3.forceSimulation(data.nodes)
        .force('link', d3.forceLink(simLinks).id(d => d.id).distance(90).strength(0.35))
        .force('charge', d3.forceManyBody().strength(-100))
        .force('collide', d3.forceCollide(24))
        .force('cx', d3.forceX(d => pCX[d.pattern]).strength(0.12))
        .force('ty', d3.forceY(d => tierY[d.tier]).strength(0.95))
        .alphaDecay(0.04).velocityDecay(0.35).stop();

    for (let i = 0; i < 350; i++) sim.tick();

    // Slight Y breathing room
    data.nodes.forEach(n => { n.y = tierY[n.tier] + (n.y - tierY[n.tier]) * 0.18; });

    return { tierY, pCX, simLinks };
}

// ============================================================================
// BUILD GRAPH
// ============================================================================

function buildGraph(data) {
    const W = graphContainer.clientWidth;
    const H = graphContainer.clientHeight;
    const { tierY, simLinks } = computeLayout(data, W, H);

    // Zoom
    state.zoom = d3.zoom().scaleExtent([0.2, 7.0])
        .on('zoom', e => { state.g.attr('transform', e.transform); state.currentZoom = e.transform.k; });

    state.svg = d3.select('#graph-container').append('svg')
        .attr('width', W).attr('height', H).call(state.zoom);

    const defs = state.svg.append('defs');
    buildSVGFilters(defs);
    buildEdgeGradients(defs, simLinks, data);
    buildArrowMarkers(defs, data);

    state.g = state.svg.append('g');

    // Layers (back to front)
    const starLayer   = state.g.append('g').attr('class', 'star-layer');
    const tierLayer   = state.g.append('g').attr('class', 'tier-layer');
    const nebulaLayer = state.g.append('g').attr('class', 'nebula-layer');
    const edgeLayer   = state.g.append('g').attr('class', 'edge-layer');
    const labelLayer  = state.g.append('g').attr('class', 'region-label-layer');
    const nodeLayer   = state.g.append('g').attr('class', 'node-layer');

    // 1. Starfield
    drawStarfield(starLayer, W, H, data.nodes);

    // 2. Tier lines
    drawTiers(tierLayer, tierY, W);

    // 3. Nebula hulls
    drawNebulas(nebulaLayer, data);

    // 4. Region labels
    drawRegionLabels(labelLayer, data);

    // 5. Edges
    drawEdges(edgeLayer, simLinks, data);

    // 6. Nodes
    drawNodes(nodeLayer, data);

    // 7. Cinematic entrance
    cinematicEntrance(data);

    // 8. Fit view after entrance
    setTimeout(() => fitView(1200), 2600);
}

// ============================================================================
// SVG DEFS — glow filters, gradients, markers
// ============================================================================

function buildSVGFilters(defs) {
    // Glow filter: mastered (green-white)
    const glowMastered = defs.append('filter').attr('id', 'glow-mastered')
        .attr('x', '-80%').attr('y', '-80%').attr('width', '260%').attr('height', '260%');
    glowMastered.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '3').attr('result', 'b1');
    glowMastered.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '8').attr('result', 'b2');
    const gm = glowMastered.append('feMerge');
    gm.append('feMergeNode').attr('in', 'b2');
    gm.append('feMergeNode').attr('in', 'b1');
    gm.append('feMergeNode').attr('in', 'SourceGraphic');

    // Glow filter: ready (blue)
    const glowReady = defs.append('filter').attr('id', 'glow-ready')
        .attr('x', '-60%').attr('y', '-60%').attr('width', '220%').attr('height', '220%');
    glowReady.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '4').attr('result', 'b1');
    const gr = glowReady.append('feMerge');
    gr.append('feMergeNode').attr('in', 'b1');
    gr.append('feMergeNode').attr('in', 'SourceGraphic');

    // Glow filter: frontier (warm beacon)
    const glowFrontier = defs.append('filter').attr('id', 'glow-frontier')
        .attr('x', '-100%').attr('y', '-100%').attr('width', '300%').attr('height', '300%');
    glowFrontier.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '4').attr('result', 'b1');
    glowFrontier.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '10').attr('result', 'b2');
    const gf = glowFrontier.append('feMerge');
    gf.append('feMergeNode').attr('in', 'b2');
    gf.append('feMergeNode').attr('in', 'b1');
    gf.append('feMergeNode').attr('in', 'SourceGraphic');

    // Glow filter: developing (amber)
    const glowDev = defs.append('filter').attr('id', 'glow-developing')
        .attr('x', '-60%').attr('y', '-60%').attr('width', '220%').attr('height', '220%');
    glowDev.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '3').attr('result', 'b1');
    const gd = glowDev.append('feMerge');
    gd.append('feMergeNode').attr('in', 'b1');
    gd.append('feMergeNode').attr('in', 'SourceGraphic');

    // Nebula blur filter
    const nebulaBlur = defs.append('filter').attr('id', 'nebula-blur')
        .attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    nebulaBlur.append('feGaussianBlur').attr('stdDeviation', '35');
}

function buildEdgeGradients(defs, simLinks, data) {
    simLinks.forEach((link, i) => {
        const sc = COLORS[link.source.pattern] || '#fff';
        const tc = COLORS[link.target.pattern] || '#fff';
        const grad = defs.append('linearGradient')
            .attr('id', 'eg-' + i)
            .attr('gradientUnits', 'userSpaceOnUse')
            .attr('x1', link.source.x).attr('y1', link.source.y)
            .attr('x2', link.target.x).attr('y2', link.target.y);
        grad.append('stop').attr('offset', '0%').attr('stop-color', sc).attr('stop-opacity', 0.6);
        grad.append('stop').attr('offset', '100%').attr('stop-color', tc).attr('stop-opacity', 0.6);
    });
}

function buildArrowMarkers(defs, data) {
    // One marker per pattern color
    const seen = new Set();
    data.clusters.forEach(c => {
        const col = COLORS[c.id] || c.color;
        const key = col.replace('#', '');
        if (seen.has(key)) return;
        seen.add(key);
        defs.append('marker')
            .attr('id', 'arrow-' + key)
            .attr('viewBox', '0 -3 6 6')
            .attr('refX', 18).attr('refY', 0)
            .attr('markerWidth', 4).attr('markerHeight', 4)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-2.5L6,0L0,2.5')
            .attr('fill', col)
            .attr('opacity', 0.5);
    });
}

// ============================================================================
// STARFIELD — procedural background stars
// ============================================================================

function drawStarfield(layer, W, H, nodes) {
    // Calculate bounds to cover the full graph area
    const pad = 300;
    const xMin = Math.min(0, d3.min(nodes, n => n.x)) - pad;
    const xMax = Math.max(W, d3.max(nodes, n => n.x)) + pad;
    const yMin = Math.min(0, d3.min(nodes, n => n.y)) - pad;
    const yMax = Math.max(H, d3.max(nodes, n => n.y)) + pad;
    const areaW = xMax - xMin;
    const areaH = yMax - yMin;

    const starCount = Math.floor(areaW * areaH / 2000); // density
    const rng = mulberry32(42); // seeded RNG for consistency

    for (let i = 0; i < starCount; i++) {
        const x = xMin + rng() * areaW;
        const y = yMin + rng() * areaH;
        const r = rng() < 0.92 ? 0.5 + rng() * 0.8 : 1.2 + rng() * 1.5; // mostly tiny, few larger
        const baseOp = 0.08 + rng() * 0.3;

        const twinkleClass = rng() < 0.06 ? 'twinkle-fast' :
                             rng() < 0.15 ? 'twinkle-med' :
                             rng() < 0.3  ? 'twinkle-slow' : '';

        layer.append('circle')
            .attr('class', 'bg-star' + (twinkleClass ? ' ' + twinkleClass : ''))
            .attr('cx', x).attr('cy', y).attr('r', r)
            .style('opacity', 0)
            .style('--star-base-opacity', baseOp);
    }
}

// Seeded PRNG (Mulberry32)
function mulberry32(seed) {
    return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// ============================================================================
// TIER LINES
// ============================================================================

function drawTiers(layer, tierY, W) {
    for (let t = 1; t <= 4; t++) {
        const y = tierY[t];
        layer.append('line').attr('class', 'tier-line')
            .attr('x1', 30).attr('x2', W - 30).attr('y1', y).attr('y2', y);
        layer.append('text').attr('class', 'tier-label')
            .attr('x', 16).attr('y', y + 4).text(TIER_NAMES[t - 1]);
    }
}

// ============================================================================
// NEBULA HULLS — smooth organic blobs using basis-closed curves
// ============================================================================

function drawNebulas(layer, data) {
    const grouped = d3.group(data.nodes, d => d.pattern);

    grouped.forEach((nodes, pid) => {
        if (nodes.length < 3) return;
        const cluster = data.clusters.find(c => c.id === pid);
        if (!cluster) return;
        const color = COLORS[pid] || cluster.color;

        const points = nodes.map(n => [n.x, n.y]);
        const hull = d3.polygonHull(points);
        if (!hull) return;

        // Expand + add midpoints for smoother curves
        const cx = d3.mean(hull, p => p[0]);
        const cy = d3.mean(hull, p => p[1]);
        const expanded = [];
        for (let i = 0; i < hull.length; i++) {
            const p = hull[i];
            const next = hull[(i + 1) % hull.length];
            // Expand point outward from center
            expanded.push([
                cx + (p[0] - cx) * 1.6,
                cy + (p[1] - cy) * 1.6
            ]);
            // Add midpoint (also expanded)
            const mx = (p[0] + next[0]) / 2;
            const my = (p[1] + next[1]) / 2;
            expanded.push([
                cx + (mx - cx) * 1.5,
                cy + (my - cy) * 1.5
            ]);
        }

        const line = d3.line().curve(d3.curveBasisClosed);

        layer.append('path')
            .attr('class', 'nebula-hull')
            .attr('d', line(expanded))
            .attr('fill', color)
            .attr('fill-opacity', 0.06)
            .attr('stroke', color)
            .attr('stroke-opacity', 0.08)
            .attr('stroke-width', 1)
            .attr('filter', 'url(#nebula-blur)')
            .style('opacity', 0);
    });
}

// ============================================================================
// REGION LABELS
// ============================================================================

function drawRegionLabels(layer, data) {
    data.clusters.forEach(cluster => {
        const nodes = data.nodes.filter(n => n.pattern === cluster.id);
        if (!nodes.length) return;
        const color = COLORS[cluster.id] || cluster.color;
        const cx = d3.mean(nodes, n => n.x);
        const minY = d3.min(nodes, n => n.y);

        layer.append('text')
            .attr('class', 'region-label')
            .attr('x', cx).attr('y', minY - 40)
            .attr('text-anchor', 'middle')
            .attr('fill', color)
            .attr('fill-opacity', 0.2)
            .style('opacity', 0)
            .text(cluster.name.toUpperCase());
    });
}

// ============================================================================
// EDGES — curved paths with per-edge gradient
// ============================================================================

function drawEdges(layer, simLinks, data) {
    state.edgeGroups = layer.selectAll('.edge-group')
        .data(simLinks, d => d.source.id + '->' + d.target.id)
        .join('g')
        .attr('class', 'edge-group')
        .style('opacity', 0); // hidden for entrance

    // Curved path with gradient stroke
    state.edgeGroups.append('path')
        .attr('class', 'edge-path')
        .attr('d', d => curvedEdge(d.source, d.target))
        .attr('stroke', (d, i) => 'url(#eg-' + i + ')')
        .attr('marker-end', d => {
            const col = (COLORS[d.source.pattern] || '#fff').replace('#', '');
            return 'url(#arrow-' + col + ')';
        });

    // Cross-pattern labels
    state.edgeGroups.each(function (d) {
        const label = crossPatternLabel(d.source, d.target, d.type);
        if (!label) return;
        const mx = (d.source.x + d.target.x) / 2;
        const my = (d.source.y + d.target.y) / 2;
        d3.select(this).append('text')
            .attr('class', 'edge-label-text')
            .attr('x', mx).attr('y', my - 4)
            .attr('text-anchor', 'middle')
            .text(label);
    });
}

function curvedEdge(s, t) {
    const dx = t.x - s.x, dy = t.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const curve = Math.min(dist * 0.15, 35);
    // Perpendicular offset for curvature
    const nx = -dy / dist * curve;
    const ny = dx / dist * curve;
    const mx = (s.x + t.x) / 2 + nx;
    const my = (s.y + t.y) / 2 + ny;
    return 'M' + s.x + ',' + s.y + ' Q' + mx + ',' + my + ' ' + t.x + ',' + t.y;
}

// ============================================================================
// NODES — shape per tier, SVG glow filter, math symbol
// ============================================================================

function drawNodes(layer, data) {
    state.nodeGroups = layer.selectAll('.skill-node')
        .data(data.nodes, d => d.id)
        .join('g')
        .attr('class', d => {
            let c = 'skill-node ' + d.state;
            if (state.frontierIds.has(d.id)) c += ' frontier';
            return c;
        })
        .attr('transform', d => 'translate(' + d.x + ',' + d.y + ')')
        .style('opacity', 0) // hidden for entrance
        .on('click', (ev, d) => { ev.stopPropagation(); if (d.state !== 'locked') showNodeDetail(d); })
        .on('mouseover', (ev, d) => { if (d.state !== 'locked') highlightConnected(d); })
        .on('mouseout', unhighlightAll);

    // Shape with glow filter
    state.nodeGroups.each(function (d) {
        const g = d3.select(this);
        const r = nodeRadius(d);
        const isFrontier = state.frontierIds.has(d.id);
        const filter = isFrontier ? 'url(#glow-frontier)' :
                       d.state === 'mastered' ? 'url(#glow-mastered)' :
                       d.state === 'developing' ? 'url(#glow-developing)' :
                       d.state === 'ready' ? 'url(#glow-ready)' : 'none';
        const fill = d.state === 'mastered' ? '#fff' :
                     d.state === 'locked' ? 'rgba(255,255,255,0.04)' :
                     isFrontier ? '#ff8a65' : d.color;
        const stroke = d.state === 'mastered' ? '#69f0ae' :
                       d.state === 'locked' ? 'rgba(255,255,255,0.08)' :
                       isFrontier ? '#ffab91' : d.color;

        const path = shapePath(d.tier, r);
        const el = path
            ? g.append('path').attr('class', 'node-shape').attr('d', path)
            : g.append('circle').attr('class', 'node-shape').attr('r', r);

        el.attr('fill', fill).attr('stroke', stroke).attr('stroke-width', d.state === 'locked' ? 0.5 : 2)
          .attr('filter', filter);
    });

    // Symbol
    state.nodeGroups.append('text')
        .attr('class', 'node-symbol').attr('y', 1)
        .text(d => PATTERN_SYMBOLS[d.pattern] || '');

    // Label
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
    if (state.frontierIds.has(d.id)) r += 1;
    return r;
}

function shapePath(tier, r) {
    if (TIER_SHAPES[tier] === 'diamond') {
        const s = r * 1.2;
        return 'M0,' + (-s) + ' L' + s + ',0 L0,' + s + ' L' + (-s) + ',0 Z';
    }
    if (TIER_SHAPES[tier] === 'star4') {
        const o = r * 1.3, n = r * 0.55; let d = '';
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4 - Math.PI / 2;
            const dist = i % 2 === 0 ? o : n;
            d += (i ? 'L' : 'M') + (Math.cos(a) * dist).toFixed(1) + ',' + (Math.sin(a) * dist).toFixed(1);
        }
        return d + 'Z';
    }
    if (TIER_SHAPES[tier] === 'star6') {
        const o = r * 1.4, n = r * 0.6; let d = '';
        for (let i = 0; i < 12; i++) {
            const a = i * Math.PI / 6 - Math.PI / 2;
            const dist = i % 2 === 0 ? o : n;
            d += (i ? 'L' : 'M') + (Math.cos(a) * dist).toFixed(1) + ',' + (Math.sin(a) * dist).toFixed(1);
        }
        return d + 'Z';
    }
    return null;
}

// ============================================================================
// CINEMATIC ENTRANCE — staggered reveal
// ============================================================================

function cinematicEntrance(data) {
    // Phase 1: Stars fade in (0–800ms, staggered)
    state.g.selectAll('.bg-star')
        .transition()
        .duration(800)
        .delay(() => Math.random() * 600)
        .style('opacity', function () { return d3.select(this).style('--star-base-opacity') || 0.2; });

    // Phase 2: Nebulas bloom (400–1200ms)
    state.g.selectAll('.nebula-hull')
        .transition()
        .duration(1000)
        .delay(400)
        .ease(d3.easeCubicOut)
        .style('opacity', 1);

    // Phase 3: Region labels fade in (600–1200ms)
    state.g.selectAll('.region-label')
        .transition()
        .duration(600)
        .delay(700)
        .style('opacity', 1);

    // Phase 4: Edges trace in (800–1800ms)
    state.edgeGroups
        .transition()
        .duration(600)
        .delay((d, i) => 800 + i * 8)
        .style('opacity', 1);

    // Edge paths: stroke-dash animation
    state.edgeGroups.select('.edge-path').each(function () {
        const len = this.getTotalLength ? this.getTotalLength() : 200;
        d3.select(this)
            .attr('stroke-dasharray', len)
            .attr('stroke-dashoffset', len)
            .transition()
            .duration(700)
            .delay((d, i) => 900 + i * 8)
            .ease(d3.easeLinear)
            .attr('stroke-dashoffset', 0);
    });

    // Phase 5: Nodes pop in (1200–2200ms, bottom tier first)
    state.nodeGroups
        .transition()
        .duration(400)
        .delay(d => 1200 + (4 - d.tier) * 200 + Math.random() * 150)
        .ease(d3.easeBackOut.overshoot(1.2))
        .style('opacity', 1)
        .attrTween('transform', function (d) {
            const base = 'translate(' + d.x + ',' + d.y + ')';
            return d3.interpolateString(base + ' scale(0)', base + ' scale(1)');
        });
}

// ============================================================================
// HIGHLIGHT — constellation illumination
// ============================================================================

function highlightConnected(node) {
    const ids = new Set([node.id]);
    state.edgeGroups.each(d => {
        if (d.source.id === node.id) ids.add(d.target.id);
        if (d.target.id === node.id) ids.add(d.source.id);
    });

    state.nodeGroups.transition().duration(180)
        .style('opacity', d => ids.has(d.id) ? 1 : 0.06);

    state.edgeGroups.transition().duration(180)
        .style('opacity', d =>
            (d.source.id === node.id || d.target.id === node.id) ? 1 : 0.02);

    state.edgeGroups.select('.edge-path')
        .classed('edge-active', d => d.source.id === node.id || d.target.id === node.id);
}

function unhighlightAll() {
    state.nodeGroups.transition().duration(250).style('opacity', 1);
    state.edgeGroups.transition().duration(250).style('opacity', 1);
    state.edgeGroups.select('.edge-path').classed('edge-active', false);
}

// ============================================================================
// NODE DETAIL PANEL
// ============================================================================

function showNodeDetail(node) {
    state.selectedNode = node;
    $('nodeDetail').classList.remove('hidden');

    $('detailTitle').textContent = node.label;
    $('detailPattern').textContent = node.patternName;
    $('detailTier').textContent = node.tier + ' \u2014 ' + node.tierName;
    $('detailMilestone').textContent = node.milestoneName;

    const badge = $('detailStatus');
    badge.textContent = (node.state || '').toUpperCase();
    badge.className = 'status-badge ' + node.state;

    const pct = Math.round(node.progress || 0);
    $('detailProgressBar').style.width = pct + '%';
    $('detailProgressText').textContent = pct + '%';

    $('practiceBtn').disabled = (node.state === 'locked');

    flyTo(node.x, node.y, 2.8);
}

function hideNodeDetail() {
    $('nodeDetail').classList.add('hidden');
    state.selectedNode = null;
}

// ============================================================================
// CAMERA
// ============================================================================

function flyTo(x, y, scale, dur = 650) {
    if (!state.svg) return;
    const W = graphContainer.clientWidth, H = graphContainer.clientHeight;
    state.svg.transition().duration(dur).ease(d3.easeCubicInOut)
        .call(state.zoom.transform,
            d3.zoomIdentity.translate(W / 2 - x * scale, H / 2 - y * scale).scale(scale));
}

function fitView(dur) {
    if (!state.graphData || !state.svg) return;
    const ns = state.graphData.nodes;
    const W = graphContainer.clientWidth, H = graphContainer.clientHeight;
    const pad = 100;
    const x0 = d3.min(ns, n => n.x) - pad, x1 = d3.max(ns, n => n.x) + pad;
    const y0 = d3.min(ns, n => n.y) - pad, y1 = d3.max(ns, n => n.y) + pad;
    const s = Math.min(W / (x1 - x0), H / (y1 - y0), 2.5);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const t = dur ? state.svg.transition().duration(dur).ease(d3.easeCubicInOut) : state.svg;
    t.call(state.zoom.transform,
        d3.zoomIdentity.translate(W / 2 - cx * s, H / 2 - cy * s).scale(s));
}

function resetView() { hideNodeDetail(); fitView(650); }

// ============================================================================
// PRACTICE
// ============================================================================

async function startPractice() {
    if (!state.selectedNode) return;
    const node = state.selectedNode;
    const btn = $('practiceBtn');
    btn.disabled = true; btn.textContent = 'Loading...';
    try {
        const res = await csrfFetch('/api/mastery/start-skill-practice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                skillId: node.id, pattern: node.pattern,
                tier: node.tier, milestone: node.milestone || node.milestoneName
            })
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Failed');
        window.location.href = body.redirect || '/mastery-chat.html';
    } catch (err) {
        console.error('Practice error:', err);
        alert('Failed to start practice: ' + err.message);
        btn.disabled = false; btn.textContent = 'Start Practice';
    }
}

// ============================================================================
// EVENTS
// ============================================================================

function initEventListeners() {
    $('closeDetail').addEventListener('click', hideNodeDetail);
    $('practiceBtn').addEventListener('click', startPractice);
    $('resetZoom').addEventListener('click', resetView);
    $('showHelp').addEventListener('click', showHelp);

    document.addEventListener('click', e => {
        const detail = $('nodeDetail');
        if (!detail.classList.contains('hidden') &&
            !detail.contains(e.target) && !e.target.closest('.skill-node'))
            hideNodeDetail();
    });

    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === 'Escape') hideNodeDetail();
        if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) resetView();
        if (e.key === '?') showHelp();
    });

    let rt;
    window.addEventListener('resize', () => {
        clearTimeout(rt);
        rt = setTimeout(() => {
            if (state.svg) {
                state.svg.attr('width', graphContainer.clientWidth)
                         .attr('height', graphContainer.clientHeight);
            }
        }, 250);
    });
}

function showHelp() {
    const ex = document.getElementById('helpOverlay');
    if (ex) { ex.remove(); return; }
    const el = document.createElement('div');
    el.id = 'helpOverlay'; el.className = 'help-overlay';
    el.innerHTML =
        '<div class="help-modal"><h3>Shortcuts</h3>' +
        '<div class="help-row"><kbd>Esc</kbd><span>Close</span></div>' +
        '<div class="help-row"><kbd>R</kbd><span>Reset view</span></div>' +
        '<div class="help-row"><kbd>?</kbd><span>Help</span></div>' +
        '<div class="help-row"><kbd>Scroll</kbd><span>Zoom</span></div>' +
        '<div class="help-row"><kbd>Drag</kbd><span>Pan</span></div></div>';
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) el.remove(); });
    const esc = e => { if (e.key === 'Escape') { el.remove(); document.removeEventListener('keydown', esc); } };
    document.addEventListener('keydown', esc);
}

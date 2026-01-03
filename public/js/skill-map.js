/**
 * SKILL MAP - Visual Knowledge Graph / Constellation System
 * D3.js force-directed graph with 3-zoom levels
 */

// Pattern Configuration (enable/disable for phased rollout)
const PATTERN_CONFIG = {
    equivalence: { enabled: true, priority: 1, name: 'Equivalence' },
    scaling: { enabled: false, priority: 2, name: 'Scaling' },
    change: { enabled: false, priority: 3, name: 'Change' },
    structure: { enabled: false, priority: 4, name: 'Structure' },
    space: { enabled: false, priority: 5, name: 'Space' },
    comparison: { enabled: false, priority: 6, name: 'Comparison' },
    uncertainty: { enabled: false, priority: 7, name: 'Uncertainty' },
    accumulation: { enabled: false, priority: 8, name: 'Accumulation' }
};

// Zoom level thresholds
const ZOOM_LEVELS = {
    WORLD: { min: 0, max: 1.0, name: 'world' },
    REGION: { min: 1.0, max: 2.5, name: 'region' },
    NODE: { min: 2.5, max: 4.0, name: 'node' }
};

// State
const state = {
    graphData: null,
    simulation: null,
    showClusters: true,
    showLabels: true,
    selectedNode: null,
    currentZoom: 1.0,
    zoomLevel: 'world',
    focusedPattern: null,
    focusedNode: null
};

// DOM Elements
const graphContainer = document.getElementById('graph-container');
const nodeDetail = document.getElementById('nodeDetail');
const backBtn = document.getElementById('backBtn');
const resetZoomBtn = document.getElementById('resetZoom');
const toggleClustersBtn = document.getElementById('toggleClusters');
const toggleLabelsBtn = document.getElementById('toggleLabels');
const closeDetailBtn = document.getElementById('closeDetail');
const practiceBtn = document.getElementById('practiceBtn');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await loadGraphData();
    initializeEventListeners();
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get current zoom level name based on zoom scale
 */
function getZoomLevelName(zoom) {
    if (zoom < ZOOM_LEVELS.REGION.min) return 'world';
    if (zoom < ZOOM_LEVELS.NODE.min) return 'region';
    return 'node';
}

/**
 * Check if pattern is enabled
 */
function isPatternEnabled(patternId) {
    return PATTERN_CONFIG[patternId]?.enabled || false;
}

/**
 * Check if edge should be visible at current zoom level
 */
function shouldShowEdge(edge, currentZoom, focusedPattern, focusedNode) {
    const zoomLevel = getZoomLevelName(currentZoom);

    // World view: hide all edges
    if (zoomLevel === 'world') return false;

    // Region view: show edges within focused pattern only
    if (zoomLevel === 'region') {
        if (!focusedPattern) return true; // Show all if no focus
        return edge.source.pattern === focusedPattern &&
               edge.target.pattern === focusedPattern;
    }

    // Node view: show edges connected to focused node only
    if (zoomLevel === 'node' && focusedNode) {
        return edge.source.id === focusedNode.id ||
               edge.target.id === focusedNode.id;
    }

    return true;
}

// Load graph data from API
async function loadGraphData() {
    try {
        const response = await fetch('/api/mastery/skill-graph');
        const data = await response.json();

        if (!data.assessmentCompleted) {
            window.location.href = '/screener.html';
            return;
        }

        state.graphData = data;

        // Update stats
        document.getElementById('masteredCount').textContent = data.meta.masteredCount || 0;
        document.getElementById('readyCount').textContent = data.meta.readyCount || 0;
        document.getElementById('totalSkills').textContent = data.meta.totalSkills || 0;

        // Populate pattern legend
        populatePatternLegend(data.clusters);

        // Initialize D3 graph
        initializeGraph(data);

    } catch (error) {
        console.error('Error loading skill graph:', error);
        alert('Failed to load skill map. Please try again.');
    }
}

// Populate the pattern legend
function populatePatternLegend(clusters) {
    const patternList = document.getElementById('patternList');
    patternList.innerHTML = '';

    clusters.forEach(cluster => {
        const item = document.createElement('div');
        item.className = 'pattern-item';
        item.innerHTML = `
            <span class="pattern-icon">${cluster.icon}</span>
            <div class="pattern-color" style="background: ${cluster.color}"></div>
            <span class="pattern-name">${cluster.name}</span>
        `;
        item.addEventListener('click', () => focusOnPattern(cluster.id));
        patternList.appendChild(item);
    });
}

// Initialize D3 force-directed graph
function initializeGraph(data) {
    const width = graphContainer.clientWidth;
    const height = graphContainer.clientHeight;

    // Create SVG with zoom behavior
    const zoom = d3.zoom()
        .scaleExtent([0.5, 4.0])
        .on('zoom', (event) => {
            g.attr('transform', event.transform);

            // Track zoom level
            state.currentZoom = event.transform.k;
            const newZoomLevel = getZoomLevelName(state.currentZoom);

            if (newZoomLevel !== state.zoomLevel) {
                state.zoomLevel = newZoomLevel;
                console.log(`[Zoom] Transitioned to ${newZoomLevel} view (${state.currentZoom.toFixed(2)}x)`);
                updateEdgeVisibility();
            }
        });

    const svg = d3.select('#graph-container')
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .call(zoom);

    const g = svg.append('g');

    // Create cluster hulls group (drawn first, behind nodes)
    const hullsGroup = g.append('g').attr('class', 'hulls');

    // Create links group
    const linksGroup = g.append('g').attr('class', 'links');

    // Create nodes group
    const nodesGroup = g.append('g').attr('class', 'nodes');

    // Define arrow marker for links
    svg.append('defs').append('marker')
        .attr('id', 'arrowhead')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 20)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', 'rgba(255, 255, 255, 0.4)');

    // Create force simulation
    state.simulation = d3.forceSimulation(data.nodes)
        .force('link', d3.forceLink(data.edges)
            .id(d => d.id)
            .distance(80)
        )
        .force('charge', d3.forceManyBody()
            .strength(-300)
        )
        .force('collision', d3.forceCollide().radius(30))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('x', d3.forceX(width / 2).strength(0.05))
        .force('y', d3.forceY(height / 2).strength(0.05));

    // Draw links
    const link = linksGroup.selectAll('.link')
        .data(data.edges)
        .join('line')
        .attr('class', 'link')
        .attr('marker-end', 'url(#arrowhead)');

    // Draw nodes
    const node = nodesGroup.selectAll('.node')
        .data(data.nodes)
        .join('g')
        .attr('class', d => {
            const classes = ['node', d.state];
            // Mark nodes from disabled patterns
            if (!isPatternEnabled(d.pattern)) {
                classes.push('pattern-disabled');
            }
            return classes.join(' ');
        })
        .call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended)
        )
        .on('click', (event, d) => {
            event.stopPropagation();

            // Check if pattern is enabled
            if (!isPatternEnabled(d.pattern)) {
                showDisabledPatternMessage(d.patternName);
                return;
            }

            showNodeDetail(d);
        })
        .on('mouseover', (event, d) => {
            if (isPatternEnabled(d.pattern)) {
                highlightConnections(d, link);
            }
        })
        .on('mouseout', () => unhighlightConnections(link));

    // Add circles to nodes
    node.append('circle')
        .attr('r', d => {
            // Size based on tier (higher tiers = slightly larger)
            return 8 + (d.tier * 2);
        })
        .attr('fill', d => d.color)
        .attr('stroke', d => d.color);

    // Add labels to nodes
    const labels = node.append('text')
        .attr('dy', 25)
        .text(d => {
            // Abbreviate long labels
            const label = d.label;
            return label.length > 15 ? label.substring(0, 13) + '...' : label;
        })
        .style('display', state.showLabels ? 'block' : 'none');

    // Update positions on each tick
    state.simulation.on('tick', () => {
        // Update links
        link
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);

        // Update nodes
        node.attr('transform', d => `translate(${d.x},${d.y})`);

        // Update cluster hulls
        if (state.showClusters) {
            updateClusterHulls(hullsGroup, data);
        }
    });

    // Store references for later use
    state.svg = svg;
    state.g = g;
    state.node = node;
    state.link = link;
    state.labels = labels;
    state.hullsGroup = hullsGroup;
}

// Update cluster hulls (convex hulls around pattern groups)
function updateClusterHulls(hullsGroup, data) {
    const clusters = d3.group(data.nodes, d => d.pattern);

    const hulls = hullsGroup.selectAll('.cluster-hull')
        .data(Array.from(clusters.entries()), d => d[0]);

    hulls.enter()
        .append('path')
        .attr('class', 'cluster-hull')
        .merge(hulls)
        .attr('d', d => {
            const points = d[1].map(node => [node.x, node.y]);
            return points.length > 2 ? 'M' + d3.polygonHull(points).join('L') + 'Z' : '';
        })
        .attr('fill', d => {
            const cluster = data.clusters.find(c => c.id === d[0]);
            return cluster ? cluster.color : '#666';
        })
        .attr('stroke', d => {
            const cluster = data.clusters.find(c => c.id === d[0]);
            return cluster ? cluster.color : '#666';
        });

    hulls.exit().remove();
}

// Highlight connections on hover
function highlightConnections(node, link) {
    // Dim all links
    link.style('opacity', 0.1);

    // Highlight connected links
    link.filter(d => d.source.id === node.id || d.target.id === node.id)
        .style('opacity', 1)
        .classed('active', true);
}

// Remove highlight
function unhighlightConnections(link) {
    link.style('opacity', 1)
        .classed('active', false);
}

// Show node detail panel
function showNodeDetail(node) {
    state.selectedNode = node;
    nodeDetail.classList.remove('hidden');

    // Populate details
    document.getElementById('detailTitle').textContent = node.label;
    document.getElementById('detailPattern').textContent = `${node.patternName}`;
    document.getElementById('detailTier').textContent = `${node.tier} - ${node.tierName}`;
    document.getElementById('detailMilestone').textContent = node.milestoneName;

    const statusBadge = document.getElementById('detailStatus');
    statusBadge.textContent = node.status.replace('-', ' ').toUpperCase();
    statusBadge.className = `status-badge ${node.state}`;

    const progress = Math.round(node.progress || 0);
    document.getElementById('detailProgressBar').style.width = `${progress}%`;
    document.getElementById('detailProgressText').textContent = `${progress}%`;

    // Enable practice button for ready/developing nodes
    practiceBtn.disabled = (node.state === 'locked');
}

// Hide node detail panel
function hideNodeDetail() {
    nodeDetail.classList.add('hidden');
    state.selectedNode = null;
}

// Focus camera on a specific pattern cluster
function focusOnPattern(patternId) {
    if (!state.graphData) return;

    // Check if pattern is enabled
    if (!isPatternEnabled(patternId)) {
        const patternName = PATTERN_CONFIG[patternId]?.name || patternId;
        showDisabledPatternMessage(patternName);
        return;
    }

    const patternNodes = state.graphData.nodes.filter(n => n.pattern === patternId);

    if (patternNodes.length === 0) return;

    // Calculate center of pattern nodes
    const centerX = d3.mean(patternNodes, d => d.x);
    const centerY = d3.mean(patternNodes, d => d.y);

    // Update focused pattern state
    state.focusedPattern = patternId;
    state.focusedNode = null;

    // Fly to region view (zoom 1.5x)
    flyTo(centerX, centerY, 1.5);

    console.log(`[Focus] Zoomed to ${patternId} pattern`);
}

// Reset zoom to fit all nodes
function resetZoom() {
    if (!state.svg) return;

    state.svg.transition()
        .duration(750)
        .call(
            d3.zoom().transform,
            d3.zoomIdentity
        );
}

// Toggle cluster hulls
function toggleClusters() {
    state.showClusters = !state.showClusters;
    toggleClustersBtn.classList.toggle('active');

    if (state.hullsGroup) {
        state.hullsGroup.style('display', state.showClusters ? 'block' : 'none');
    }
}

// Toggle node labels
function toggleLabels() {
    state.showLabels = !state.showLabels;
    toggleLabelsBtn.classList.toggle('active');

    if (state.labels) {
        state.labels.style('display', state.showLabels ? 'block' : 'none');
    }
}

// D3 drag functions
function dragstarted(event, d) {
    if (!event.active) state.simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
}

function dragended(event, d) {
    if (!event.active) state.simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
}

// Start practice session for selected node
function startPractice() {
    if (!state.selectedNode) return;

    const node = state.selectedNode;

    // Redirect to mastery practice with milestone selection
    window.location.href = `/mastery-practice.html?pattern=${node.pattern}&tier=${node.tier}&milestone=${node.milestone}`;
}

// Event listeners
function initializeEventListeners() {
    backBtn.addEventListener('click', () => {
        window.location.href = '/badge-map.html';
    });

    resetZoomBtn.addEventListener('click', resetZoom);
    toggleClustersBtn.addEventListener('click', toggleClusters);
    toggleLabelsBtn.addEventListener('click', toggleLabels);
    closeDetailBtn.addEventListener('click', hideNodeDetail);
    practiceBtn.addEventListener('click', startPractice);

    // Close detail panel when clicking outside
    document.addEventListener('click', (e) => {
        if (!nodeDetail.classList.contains('hidden') &&
            !nodeDetail.contains(e.target) &&
            !e.target.closest('.node')) {
            hideNodeDetail();
        }
    });
}

// ============================================================================
// CONSTELLATION SYSTEM FUNCTIONS
// ============================================================================

/**
 * Update edge visibility based on current zoom level
 */
function updateEdgeVisibility() {
    if (!state.link) return;

    state.link.style('opacity', d => {
        const shouldShow = shouldShowEdge(d, state.currentZoom, state.focusedPattern, state.focusedNode);
        return shouldShow ? 1 : 0;
    });
}

/**
 * Show message when clicking disabled pattern
 */
function showDisabledPatternMessage(patternName) {
    // Create temporary toast notification
    const toast = document.createElement('div');
    toast.className = 'disabled-pattern-toast';
    toast.innerHTML = `
        <div class="toast-icon">🔒</div>
        <div class="toast-content">
            <strong>${patternName} Pattern</strong>
            <p>Coming Soon! Focus on Equivalence first.</p>
        </div>
    `;
    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Smooth camera transition (Prezi-style flyTo)
 */
function flyTo(targetX, targetY, targetZoom, durationMs = 750) {
    if (!state.svg) return;

    const width = graphContainer.clientWidth;
    const height = graphContainer.clientHeight;

    // Calculate transform
    const x = width / 2 - targetX * targetZoom;
    const y = height / 2 - targetY * targetZoom;

    // Clamp zoom
    const clampedZoom = Math.max(0.5, Math.min(4.0, targetZoom));

    // Smooth transition
    state.svg.transition()
        .duration(durationMs)
        .ease(d3.easeCubicInOut)
        .call(
            d3.zoom().transform,
            d3.zoomIdentity.translate(x, y).scale(clampedZoom)
        );

    console.log(`[FlyTo] Moving to (${targetX.toFixed(0)}, ${targetY.toFixed(0)}) at ${clampedZoom.toFixed(2)}x zoom`);
}

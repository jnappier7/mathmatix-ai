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
    focusedNode: null,
    clusterCenters: {}, // Store precomputed cluster centers
    frontierNodes: [], // Hot next recommendations (1-3 max)
    progressZone: null // Center of student's current progress
};

// DOM Elements
const graphContainer = document.getElementById('graph-container');
const nodeDetail = document.getElementById('nodeDetail');
const nodeDetailBackdrop = document.getElementById('nodeDetailBackdrop');
const backBtn = document.getElementById('backBtn');
const resetZoomBtn = document.getElementById('resetZoom');
const toggleClustersBtn = document.getElementById('toggleClusters');
const toggleLabelsBtn = document.getElementById('toggleLabels');
const showHelpBtn = document.getElementById('showHelp');
const closeDetailBtn = document.getElementById('closeDetail');
const practiceBtn = document.getElementById('practiceBtn');

// Breadcrumb elements
const crumbWorld = document.getElementById('crumbWorld');
const crumbPattern = document.getElementById('crumbPattern');
const crumbNode = document.getElementById('crumbNode');
const separatorPattern = document.getElementById('separatorPattern');
const separatorNode = document.getElementById('separatorNode');
const patternIcon = document.getElementById('patternIcon');
const patternName = document.getElementById('patternName');
const nodeName = document.getElementById('nodeName');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await loadGraphData();
    initializeEventListeners();
    showWelcomeHint();
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

/**
 * Calculate stable cluster centers in a circular arrangement
 */
function calculateClusterCenters(clusters, width, height) {
    const centers = {};
    const radius = Math.min(width, height) * 0.35; // 35% of viewport
    const centerX = width / 2;
    const centerY = height / 2;

    clusters.forEach((cluster, index) => {
        // Arrange clusters in a circle
        const angle = (index / clusters.length) * 2 * Math.PI - Math.PI / 2; // Start at top
        centers[cluster.id] = {
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle),
            color: cluster.color,
            icon: cluster.icon,
            name: cluster.name
        };
    });

    return centers;
}

/**
 * Initialize node positions based on cluster centers and tier
 */
function initializeNodePositions(nodes, clusterCenters) {
    // Group nodes by pattern and tier
    const nodesByPatternTier = {};

    nodes.forEach(node => {
        const key = `${node.pattern}-${node.tier}`;
        if (!nodesByPatternTier[key]) {
            nodesByPatternTier[key] = [];
        }
        nodesByPatternTier[key].push(node);
    });

    // Position nodes in a stable pattern within each cluster
    Object.keys(nodesByPatternTier).forEach(key => {
        const [pattern, tier] = key.split('-');
        const patternNodes = nodesByPatternTier[key];
        const clusterCenter = clusterCenters[pattern];

        if (!clusterCenter) return;

        // Arrange nodes in concentric rings by tier
        const tierRadius = (parseInt(tier) - 1) * 60 + 40; // Inner tiers closer to center
        const nodesInTier = patternNodes.length;

        patternNodes.forEach((node, index) => {
            const angle = (index / nodesInTier) * 2 * Math.PI;
            node.x = clusterCenter.x + tierRadius * Math.cos(angle);
            node.y = clusterCenter.y + tierRadius * Math.sin(angle);
        });
    });
}

/**
 * Custom D3 force to pull nodes toward their cluster centers
 */
function forceCluster() {
    let nodes;
    let strength = 0.1;
    let centersFunc = d => ({ x: 0, y: 0 });

    function force(alpha) {
        if (!nodes) return;

        const k = alpha * strength;
        nodes.forEach(node => {
            const center = centersFunc(node);
            if (!center) return;

            node.vx += (center.x - node.x) * k;
            node.vy += (center.y - node.y) * k;
        });
    }

    force.initialize = function(_) {
        nodes = _;
    };

    force.centers = function(_) {
        return arguments.length ? (centersFunc = typeof _ === 'function' ? _ : () => _, force) : centersFunc;
    };

    force.strength = function(_) {
        return arguments.length ? (strength = +_, force) : strength;
    };

    return force;
}

/**
 * Detect frontier nodes - the hot 1-3 recommendations
 * These are ready nodes that unlock the most future skills
 */
function detectFrontierNodes(nodes, edges) {
    const readyNodes = nodes.filter(n => n.state === 'ready' && isPatternEnabled(n.pattern));

    if (readyNodes.length === 0) return [];

    // Score each ready node by how many skills it unlocks
    const scoredNodes = readyNodes.map(node => {
        const unlocksCount = edges.filter(e => e.source.id === node.id).length;
        return { node, unlocksCount };
    });

    // Sort by unlocks (descending), take top 3
    scoredNodes.sort((a, b) => b.unlocksCount - a.unlocksCount);

    return scoredNodes.slice(0, 3).map(s => s.node);
}

/**
 * Calculate the center of student's progress zone
 * This is the average position of mastered + ready nodes
 */
function calculateProgressZone(nodes) {
    const progressNodes = nodes.filter(n =>
        (n.state === 'mastered' || n.state === 'ready') &&
        isPatternEnabled(n.pattern)
    );

    if (progressNodes.length === 0) return null;

    const centerX = d3.mean(progressNodes, d => d.x);
    const centerY = d3.mean(progressNodes, d => d.y);

    return { x: centerX, y: centerY };
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

        // Calculate stats
        const masteredCount = data.nodes.filter(n => n.state === 'mastered').length;
        const readyCount = data.nodes.filter(n => n.state === 'ready').length;
        const totalSkills = data.nodes.length;

        // Update stats with motivational language
        document.getElementById('masteredCount').textContent = masteredCount;
        document.getElementById('frontierCount').textContent = readyCount;
        document.getElementById('totalSkills').textContent = totalSkills;

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

    // Calculate stable cluster centers
    state.clusterCenters = calculateClusterCenters(data.clusters, width, height);

    // Initialize node positions deterministically
    initializeNodePositions(data.nodes, state.clusterCenters);

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
                updateClusterLabels(); // Update cluster labels on zoom change
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

    // Create cluster labels group
    const labelsGroup = g.append('g').attr('class', 'cluster-labels');

    // Create links group
    const linksGroup = g.append('g').attr('class', 'links');

    // Create nodes group
    const nodesGroup = g.append('g').attr('class', 'nodes');

    // Define arrow marker for links
    const defs = svg.append('defs');

    defs.append('marker')
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

    // Define gradient for edges (fades from source to target)
    const edgeGradient = defs.append('linearGradient')
        .attr('id', 'edge-gradient')
        .attr('gradientUnits', 'userSpaceOnUse');

    edgeGradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', 'rgba(255, 255, 255, 0.3)')
        .attr('stop-opacity', 1);

    edgeGradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', 'rgba(0, 212, 255, 0.5)')
        .attr('stop-opacity', 1);

    // Create force simulation with weak forces (positions already initialized)
    state.simulation = d3.forceSimulation(data.nodes)
        .force('link', d3.forceLink(data.edges)
            .id(d => d.id)
            .distance(60)
            .strength(0.3) // Weak link force
        )
        .force('charge', d3.forceManyBody()
            .strength(-150) // Weaker repulsion
        )
        .force('collision', d3.forceCollide().radius(25))
        // Add cluster forces to keep nodes near their pattern centers
        .force('cluster', forceCluster()
            .centers(d => state.clusterCenters[d.pattern])
            .strength(0.4)
        )
        .alphaDecay(0.05) // Faster stabilization
        .velocityDecay(0.4); // More damping

    // Draw links with gradient
    const link = linksGroup.selectAll('.link')
        .data(data.edges)
        .join('line')
        .attr('class', 'link')
        .attr('stroke', 'url(#edge-gradient)')
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
            // Size based on tier and state
            let baseRadius = 8;

            // Tier scaling (higher tiers slightly larger)
            baseRadius += (d.tier - 1) * 1.5;

            // State scaling (mastered and ready nodes slightly larger)
            if (d.state === 'mastered') baseRadius += 2;
            else if (d.state === 'ready') baseRadius += 1.5;

            return Math.max(8, Math.min(baseRadius, 16)); // Clamp between 8-16
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

    // Track tick count for performance optimization
    let tickCount = 0;
    const MAX_TICKS = 300; // Stop after stabilization

    // Update positions on each tick
    state.simulation.on('tick', () => {
        tickCount++;

        // Update links and gradient positions
        link
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y)
            .each(function(d) {
                // Update gradient coordinates for this edge
                const gradient = d3.select(this).attr('stroke');
                if (gradient && gradient.includes('edge-gradient')) {
                    d3.select('#edge-gradient')
                        .attr('x1', d.source.x)
                        .attr('y1', d.source.y)
                        .attr('x2', d.target.x)
                        .attr('y2', d.target.y);
                }
            });

        // Update nodes
        node.attr('transform', d => `translate(${d.x},${d.y})`);

        // Update cluster hulls
        if (state.showClusters) {
            updateClusterHulls(hullsGroup, data);
        }

        // Stop simulation after stabilization to save CPU
        if (tickCount >= MAX_TICKS) {
            state.simulation.stop();
            console.log('[Performance] Simulation stopped after stabilization');
        }
    });

    // Store references for later use
    state.svg = svg;
    state.g = g;
    state.node = node;
    state.link = link;
    state.labels = labels;
    state.hullsGroup = hullsGroup;
    state.labelsGroup = labelsGroup;

    // Detect frontier nodes and progress zone
    state.frontierNodes = detectFrontierNodes(data.nodes, data.edges);
    state.progressZone = calculateProgressZone(data.nodes);

    // Apply frontier highlighting
    applyFrontierHighlighting();

    // Initialize cluster labels
    renderClusterLabels(labelsGroup, data);

    // Initialize breadcrumbs to world view
    updateBreadcrumbs();

    // Auto-focus on student's progress zone after a brief delay
    setTimeout(() => {
        autoFocusOnProgress();
    }, 1000);
}

// Update cluster hulls (convex hulls around pattern groups)
function updateClusterHulls(hullsGroup, data) {
    const clusters = d3.group(data.nodes, d => d.pattern);

    const hulls = hullsGroup.selectAll('.cluster-hull')
        .data(Array.from(clusters.entries()), d => d[0]);

    hulls.enter()
        .append('path')
        .attr('class', d => {
            const classes = ['cluster-hull'];
            if (!isPatternEnabled(d[0])) {
                classes.push('pattern-disabled');
            }
            return classes.join(' ');
        })
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

// Render cluster labels with mastery percentages
function renderClusterLabels(labelsGroup, data) {
    Object.keys(state.clusterCenters).forEach(patternId => {
        const center = state.clusterCenters[patternId];
        const patternNodes = data.nodes.filter(n => n.pattern === patternId);

        // Calculate mastery percentage
        const masteredNodes = patternNodes.filter(n => n.state === 'mastered').length;
        const masteryPercent = patternNodes.length > 0
            ? Math.round((masteredNodes / patternNodes.length) * 100)
            : 0;

        // Create label group
        const labelGroup = labelsGroup.append('g')
            .attr('class', `cluster-label cluster-label-${patternId}`)
            .attr('transform', `translate(${center.x}, ${center.y})`)
            .style('cursor', 'pointer')
            .on('click', () => {
                if (isPatternEnabled(patternId)) {
                    focusOnPattern(patternId);
                } else {
                    showDisabledPatternMessage(center.name);
                }
            });

        // Add pattern icon
        labelGroup.append('text')
            .attr('class', 'cluster-icon')
            .attr('y', -20)
            .attr('text-anchor', 'middle')
            .style('font-size', '2.5rem')
            .style('opacity', 0.9)
            .style('pointer-events', 'none')
            .text(center.icon);

        // Add pattern name
        labelGroup.append('text')
            .attr('class', 'cluster-name')
            .attr('y', 15)
            .attr('text-anchor', 'middle')
            .style('font-size', '1.2rem')
            .style('font-weight', 'bold')
            .style('fill', 'white')
            .style('text-shadow', '2px 2px 4px rgba(0,0,0,0.8)')
            .style('pointer-events', 'none')
            .text(center.name);

        // Add mastery percentage
        labelGroup.append('text')
            .attr('class', 'cluster-mastery')
            .attr('y', 35)
            .attr('text-anchor', 'middle')
            .style('font-size', '0.9rem')
            .style('fill', masteryPercent > 0 ? '#00ff87' : '#888')
            .style('text-shadow', '1px 1px 2px rgba(0,0,0,0.8)')
            .style('pointer-events', 'none')
            .text(`${masteryPercent}% mastered`);
    });

    // Set initial visibility based on zoom
    updateClusterLabels();
}

// Update cluster label visibility based on zoom level
function updateClusterLabels() {
    if (!state.labelsGroup) return;

    const zoomLevel = state.zoomLevel;
    const isWorldView = zoomLevel === 'world';

    // Show cluster labels only at world view with smooth fade
    state.labelsGroup.selectAll('.cluster-label')
        .classed('visible', isWorldView)
        .style('pointer-events', isWorldView ? 'auto' : 'none')
        .transition()
        .duration(400)
        .style('opacity', isWorldView ? 1 : 0);
}

/**
 * Apply frontier highlighting to the 1-3 hot next nodes
 */
function applyFrontierHighlighting() {
    if (!state.node || !state.frontierNodes) return;

    // Add 'frontier-hot' class to recommended nodes
    state.node.classed('frontier-hot', d =>
        state.frontierNodes.some(fn => fn.id === d.id)
    );

    // Add 'frontier-dimmed' class to other ready nodes
    state.node.classed('frontier-dimmed', d =>
        d.state === 'ready' &&
        !state.frontierNodes.some(fn => fn.id === d.id)
    );

    console.log(`[Frontier] Highlighted ${state.frontierNodes.length} hot nodes`);
}

/**
 * Auto-focus camera on student's progress zone
 */
function autoFocusOnProgress() {
    if (!state.progressZone) {
        console.log('[Auto-focus] No progress zone found, staying at world view');
        return;
    }

    // Zoom to progress zone (between world and region)
    flyTo(state.progressZone.x, state.progressZone.y, 1.2, 1500);

    console.log('[Auto-focus] Zoomed to progress zone');
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
    state.focusedNode = node;
    nodeDetail.classList.remove('hidden');

    // Show backdrop with slight delay for smooth transition
    setTimeout(() => {
        nodeDetailBackdrop.classList.add('show');
    }, 10);

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

    // Zoom to node view
    flyTo(node.x, node.y, 3.0);

    // Update breadcrumbs
    updateBreadcrumbs();
}

// Hide node detail panel
function hideNodeDetail() {
    nodeDetail.classList.add('hidden');
    nodeDetailBackdrop.classList.remove('show');
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

    // Update breadcrumbs
    updateBreadcrumbs();

    console.log(`[Focus] Zoomed to ${patternId} pattern`);
}

// Reset zoom to fit all nodes
function resetZoom() {
    if (!state.svg) return;

    // Clear focus state
    state.focusedPattern = null;
    state.focusedNode = null;

    state.svg.transition()
        .duration(750)
        .call(
            d3.zoom().transform,
            d3.zoomIdentity
        );

    // Update breadcrumbs
    updateBreadcrumbs();
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
    showHelpBtn.addEventListener('click', showKeyboardHelp);
    closeDetailBtn.addEventListener('click', hideNodeDetail);
    practiceBtn.addEventListener('click', startPractice);

    // Breadcrumb navigation
    crumbWorld.addEventListener('click', zoomToWorld);
    crumbPattern.addEventListener('click', zoomToPatternFromBreadcrumb);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Close detail panel when clicking backdrop
    nodeDetailBackdrop.addEventListener('click', hideNodeDetail);

    // Close detail panel when clicking outside
    document.addEventListener('click', (e) => {
        if (!nodeDetail.classList.contains('hidden') &&
            !nodeDetail.contains(e.target) &&
            !e.target.closest('.node')) {
            hideNodeDetail();
        }
    });
}

/**
 * Handle keyboard shortcuts for navigation
 */
function handleKeyboardShortcuts(event) {
    // Don't interfere with input fields
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
    }

    switch(event.key) {
        case 'Escape':
            // ESC: Zoom out one level
            if (state.focusedNode) {
                // From node view → region view
                hideNodeDetail();
                zoomToPatternFromBreadcrumb();
            } else if (state.focusedPattern) {
                // From region view → world view
                zoomToWorld();
            } else {
                // Already at world view, close any open panels
                hideNodeDetail();
            }
            break;

        case 'r':
        case 'R':
            // R: Reset to world view
            if (!event.ctrlKey && !event.metaKey) {
                resetZoom();
            }
            break;

        case 'c':
        case 'C':
            // C: Toggle clusters
            if (!event.ctrlKey && !event.metaKey) {
                toggleClusters();
            }
            break;

        case 'l':
        case 'L':
            // L: Toggle labels
            if (!event.ctrlKey && !event.metaKey) {
                toggleLabels();
            }
            break;

        case '?':
            // ?: Show keyboard shortcuts help
            showKeyboardHelp();
            break;
    }
}

/**
 * Show welcome hint on first visit
 */
function showWelcomeHint() {
    // Check if user has seen the hint before
    const hasSeenHint = localStorage.getItem('skillMapHintSeen');

    if (!hasSeenHint) {
        // Wait for auto-focus to complete, then show hint
        setTimeout(() => {
            const masteredCount = state.graphData?.nodes.filter(n => n.state === 'mastered').length || 0;
            const frontierCount = state.frontierNodes?.length || 0;

            let message = '';
            if (masteredCount > 0) {
                message = `You've built ${masteredCount} skill${masteredCount > 1 ? 's' : ''}. Let's keep going.`;
            } else {
                message = 'Your math journey starts here. Click an orange node to begin.';
            }

            const hint = document.createElement('div');
            hint.className = 'welcome-hint';
            hint.innerHTML = `
                <div class="hint-icon">🌟</div>
                <div class="hint-content">
                    <strong>${message}</strong>
                    ${frontierCount > 0 ? `<p class="hint-sub">The ${frontierCount} orange node${frontierCount > 1 ? 's' : ''} are your best next step${frontierCount > 1 ? 's' : ''}.</p>` : ''}
                </div>
            `;
            document.body.appendChild(hint);

            // Fade in
            setTimeout(() => hint.classList.add('show'), 10);

            // Fade out after 6 seconds
            setTimeout(() => {
                hint.classList.remove('show');
                setTimeout(() => hint.remove(), 500);
            }, 6000);

            // Mark as seen
            localStorage.setItem('skillMapHintSeen', 'true');
        }, 3000); // Show after auto-focus completes (1s delay + 1.5s animation + 0.5s buffer)
    }
}

/**
 * Show keyboard shortcuts overlay
 */
function showKeyboardHelp() {
    const helpHtml = `
        <div class="keyboard-help-overlay" id="keyboardHelp">
            <div class="keyboard-help-modal">
                <div class="help-header">
                    <h3>⌨️ Keyboard Shortcuts</h3>
                    <button class="close-btn" onclick="document.getElementById('keyboardHelp').remove()">×</button>
                </div>
                <div class="help-content">
                    <div class="shortcut-group">
                        <h4>Navigation</h4>
                        <div class="shortcut-item">
                            <kbd>ESC</kbd>
                            <span>Zoom out one level</span>
                        </div>
                        <div class="shortcut-item">
                            <kbd>R</kbd>
                            <span>Reset to world view</span>
                        </div>
                    </div>
                    <div class="shortcut-group">
                        <h4>View Options</h4>
                        <div class="shortcut-item">
                            <kbd>C</kbd>
                            <span>Toggle cluster regions</span>
                        </div>
                        <div class="shortcut-item">
                            <kbd>L</kbd>
                            <span>Toggle node labels</span>
                        </div>
                    </div>
                    <div class="shortcut-group">
                        <h4>Help</h4>
                        <div class="shortcut-item">
                            <kbd>?</kbd>
                            <span>Show this help</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Remove existing help if present
    const existing = document.getElementById('keyboardHelp');
    if (existing) existing.remove();

    // Add new help overlay
    document.body.insertAdjacentHTML('beforeend', helpHtml);

    // Close on ESC or click outside
    const overlay = document.getElementById('keyboardHelp');
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', escHandler);
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

// ============================================================================
// BREADCRUMB NAVIGATION
// ============================================================================

/**
 * Update breadcrumb trail based on current focus state
 */
function updateBreadcrumbs() {
    // World crumb is always visible
    crumbWorld.classList.remove('active');

    if (!state.focusedPattern && !state.focusedNode) {
        // World view - only world crumb active
        crumbWorld.classList.add('active');
        separatorPattern.style.display = 'none';
        crumbPattern.style.display = 'none';
        separatorNode.style.display = 'none';
        crumbNode.style.display = 'none';
    } else if (state.focusedPattern && !state.focusedNode) {
        // Region view - world + pattern crumbs
        separatorPattern.style.display = 'inline';
        crumbPattern.style.display = 'inline-flex';
        crumbPattern.classList.add('active');

        const cluster = state.graphData.clusters.find(c => c.id === state.focusedPattern);
        if (cluster) {
            patternIcon.textContent = cluster.icon;
            patternName.textContent = cluster.name;
        }

        separatorNode.style.display = 'none';
        crumbNode.style.display = 'none';
    } else if (state.focusedNode) {
        // Node view - world + pattern + node crumbs
        separatorPattern.style.display = 'inline';
        crumbPattern.style.display = 'inline-flex';
        crumbPattern.classList.remove('active');

        const cluster = state.graphData.clusters.find(c => c.id === state.focusedNode.pattern);
        if (cluster) {
            patternIcon.textContent = cluster.icon;
            patternName.textContent = cluster.name;
        }

        separatorNode.style.display = 'inline';
        crumbNode.style.display = 'inline-flex';
        crumbNode.classList.add('active');
        nodeName.textContent = state.focusedNode.label;
    }
}

/**
 * Zoom to world view
 */
function zoomToWorld() {
    state.focusedPattern = null;
    state.focusedNode = null;

    resetZoom();
    updateBreadcrumbs();

    console.log('[Breadcrumb] Zoomed to world view');
}

/**
 * Zoom to pattern region view
 */
function zoomToPatternFromBreadcrumb() {
    if (!state.focusedPattern && !state.focusedNode) return;

    const patternId = state.focusedNode ? state.focusedNode.pattern : state.focusedPattern;
    state.focusedNode = null;

    focusOnPattern(patternId);

    console.log('[Breadcrumb] Zoomed to pattern view');
}

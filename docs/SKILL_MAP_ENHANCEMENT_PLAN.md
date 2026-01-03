# Skill Map Enhancement Plan
## Prezi-Style 3-Zoom System

### Vision
Transform the skill map from a static graph into a cinematic, multi-scale knowledge explorer where students can:
- **Explore** the entire math landscape (8 pattern continents)
- **Zoom** into specific domains to see skill clusters
- **Focus** on individual skills to see prerequisites and next steps
- **Choose** their path with visual guidance, not force

---

## Three Zoom Levels

### 1. World View (Zoom: 0.5-0.8x)
**Purpose**: See the big picture - all 8 pattern domains

**What's Visible:**
- ✅ 8 domain "continents" (cluster hulls with labels)
- ✅ Mastery percentage per domain
- ✅ Lit "constellations" (mastered nodes as stars)
- ❌ NO edges (too chaotic)
- ❌ NO individual skill labels
- ✅ Domain icons and colors

**Interaction:**
- Click domain → zoom to Region View

**Visual Style:**
- Big, bold domain regions
- Soft glows around mastered clusters
- Clean, uncluttered

---

### 2. Region View (Zoom: 1.2-2.0x)
**Purpose**: Explore one pattern domain in detail

**What's Visible:**
- ✅ All skills in selected domain
- ✅ Prerequisite edges **within this domain only**
- ✅ Skill labels
- ✅ Frontier nodes highlighted (glowing/pulsing)
- ❌ Edges to other domains (only show if both nodes visible)
- ✅ Domain breadcrumb ("Equivalence > ")

**Interaction:**
- Click skill → zoom to Node View
- Click breadcrumb → zoom out to World View

**Visual Style:**
- Clear node clusters by tier
- Visible prerequisite chains
- Frontier nodes pulse

---

### 3. Node View (Zoom: 2.5-4.0x)
**Purpose**: Focus on one skill and its immediate context

**What's Visible:**
- ✅ Focused skill (large, centered)
- ✅ Prerequisites behind it (dimmed, connected)
- ✅ Next unlocks ahead of it (glowing if ready)
- ✅ Action buttons: "Lesson", "Practice", "Prove It"
- ❌ No other skills (fog/fade out)
- ✅ Full breadcrumb ("Equivalence > Tier 2 > One-Step Equations")

**Interaction:**
- Click action button → start lesson/practice/proof gate
- Click breadcrumb → zoom out to Region or World
- Click prereq → refocus on that skill

**Visual Style:**
- Cinematic focus
- Clear path visualization
- Strong glows on actionable nodes

---

## Camera System

### flyTo() Function
```javascript
flyTo(targetX, targetY, targetZoom, durationMs = 750) {
  // Easing: d3.easeCubicInOut or d3.easeQuintInOut
  // Clamp zoom: [0.5, 4.0]
  // Respect bounds: don't drift into empty space
  // Smooth transition with transform
}
```

### Target Selection Rules
| Event | Target | Zoom Level | View |
|-------|--------|------------|------|
| Domain click | Domain centroid | 1.5x | Region |
| Skill click | Skill position | 3.0x | Node |
| After unlock | Best next frontier | 2.0x | Region |
| Breadcrumb | Depends on level | 0.7x or 1.5x | World/Region |

---

## Edge Visibility Rules

### World View (Zoom < 1.0)
- Hide ALL edges
- Show cluster hulls only

### Region View (Zoom 1.0-2.5)
- Show edges where **both source AND target** are in the focused domain
- Hide cross-domain edges unless zoomed on a boundary

### Node View (Zoom > 2.5)
- Show edges to **immediate prerequisites**
- Show edges to **immediate next unlocks**
- Hide all other edges

**Implementation:**
```javascript
link.style('opacity', d => {
  const currentZoom = getCurrentZoom();
  const focusedDomain = state.focusedDomain;

  if (currentZoom < 1.0) return 0; // World view: no edges

  if (currentZoom < 2.5) {
    // Region view: edges within domain only
    if (focusedDomain && d.source.pattern === focusedDomain && d.target.pattern === focusedDomain) {
      return 1;
    }
    return 0;
  }

  // Node view: edges to focused node's prereqs/unlocks only
  const focusedNodeId = state.focusedNode?.id;
  if (d.source.id === focusedNodeId || d.target.id === focusedNodeId) {
    return 1;
  }
  return 0;
});
```

---

## Stable Layout System

### Problem
Force simulation creates **unstable positions** - nodes rearrange every session.

### Solution: Cluster-Based Fixed Layout
1. **Precompute domain centroids** in a circle/grid
2. **Use cluster forces** to group nodes by pattern
3. **After initial stabilization**, save positions to localStorage or backend
4. **On load**, use saved positions as initial x/y

**Code:**
```javascript
// Add cluster forces to keep patterns together
simulation
  .force('cluster', forceCluster()
    .centers(d => {
      const cluster = clusters.find(c => c.id === d.pattern);
      return cluster ? cluster.center : {x: width/2, y: height/2};
    })
    .strength(0.5)
  );

// After 300 ticks, save stable positions
simulation.on('tick', () => {
  tickCount++;
  if (tickCount === 300) {
    saveNodePositions(data.nodes);
  }
});
```

---

## Visual Design Details

### Glow States
```css
.node.mastered circle {
  fill: #00ff87;
  filter: drop-shadow(0 0 12px rgba(0, 255, 135, 0.9));
}

.node.ready circle {
  fill: #00d4ff;
  filter: drop-shadow(0 0 16px rgba(0, 212, 255, 1.0));
  animation: pulse 2s ease-in-out infinite;
}

.node.developing circle {
  fill: #ffc107;
  filter: drop-shadow(0 0 8px rgba(255, 193, 7, 0.7));
}

.node.locked circle {
  fill: rgba(255, 255, 255, 0.05);
  stroke: rgba(255, 255, 255, 0.2);
  filter: none;
}

.node.unknown circle {
  fill: rgba(255, 255, 255, 0.02);
  stroke: rgba(255, 255, 255, 0.1);
  opacity: 0.3;
}
```

### Constellations (World View)
- Mastered nodes glow brighter at world zoom
- Create visual "star clusters" in each domain
- Show mastery percentage as domain label

### Fog of Unknown
```css
.node.unknown {
  opacity: 0.2;
  pointer-events: none;
}

/* On zoom in or adjacent unlock, fade in */
.node.unknown.revealed {
  transition: opacity 0.5s ease;
  opacity: 0.6;
}
```

---

## Breadcrumb Navigation

### HTML Structure
```html
<div class="breadcrumb-trail">
  <span class="crumb" data-level="world">🗺️ All Domains</span>
  <span class="separator">›</span>
  <span class="crumb active" data-level="region" data-pattern="equivalence">Equivalence</span>
  <span class="separator">›</span>
  <span class="crumb active" data-level="node" data-skill="one-step-equations">One-Step Equations</span>
</div>
```

### Behavior
- Click "All Domains" → flyTo world view
- Click "Equivalence" → flyTo region view
- Click "One-Step Equations" → flyTo node view
- Auto-update as user navigates

---

## Auto-Refocus After Unlock

### Scenario: Student Completes Proof Gate
1. Student clicks "Prove It" on a node
2. Opens proof gate (3-6 checkpoint problems)
3. Student passes → node lights up
4. **AUTO**: Calculate frontier nodes (newly unlocked)
5. **AUTO**: flyTo() the "best next node" (highest criticality + ready)
6. **SHOW**: Toast message: "Unlocked: [Two-Step Equations]! 🎉"

### Best Next Node Algorithm
```javascript
function findBestNextNode(unlockedNode) {
  const frontierNodes = state.graphData.nodes.filter(n => {
    return n.state === 'ready' &&   // Ready to attempt
           !n.wasJustUnlocked &&     // Not the one we just unlocked
           isAdjacentTo(n, unlockedNode); // Connected to what we just did
  });

  // Sort by criticality (how many other skills it unlocks)
  frontierNodes.sort((a, b) => b.criticality - a.criticality);

  return frontierNodes[0] || unlockedNode;
}

function isAdjacentTo(nodeA, nodeB) {
  return state.graphData.edges.some(e =>
    (e.source.id === nodeB.id && e.target.id === nodeA.id) ||
    (e.source.id === nodeA.id && e.target.id === nodeB.id)
  );
}
```

---

## Minimal MVP Implementation Order

### Phase 1: Core Zoom System
1. ✅ Add zoomLevel state tracking
2. ✅ Implement flyTo() with easing
3. ✅ Add edge visibility rules based on zoom
4. ✅ Add breadcrumb trail

### Phase 2: Visual Polish
5. ✅ Enhance glow effects per state
6. ✅ Add fog of unknown
7. ✅ Improve cluster hulls at world view
8. ✅ Add domain labels with mastery %

### Phase 3: Interaction Loop
9. ✅ Wire up proof gate system
10. ✅ Implement auto-refocus after unlock
11. ✅ Add frontier detection
12. ✅ Add "Challenge Mode" buttons

### Phase 4: Stability
13. ✅ Implement stable layout with saved positions
14. ✅ Add performance optimizations
15. ✅ Test with 175+ nodes

---

## Data Requirements

### Each Node Needs:
```javascript
{
  id: 'one-step-equations',
  x: 450,  // Precomputed, stable
  y: 320,  // Precomputed, stable
  pattern: 'equivalence',
  patternName: 'Equivalence',
  tier: 2,
  state: 'ready',  // lit/glowing/dim/unknown
  pMastery: 0.67,  // Probability mastered
  confidence: 0.58, // Confidence in estimate
  criticality: 15,  // How many skills it unlocks
  prerequisites: ['fact-families', 'understanding-variables'],
  enables: ['two-step-equations', 'inequalities']
}
```

### Zoom Level State:
```javascript
state.zoomLevel = 'world' | 'region' | 'node';
state.focusedDomain = 'equivalence' | null;
state.focusedNode = nodeObject | null;
state.currentZoom = 1.5; // numeric zoom factor
```

---

## Performance Considerations

### Large Graphs (175+ nodes)
- Use **quadtree** for collision detection instead of brute force
- **Cull** off-screen nodes (don't render if outside viewport)
- **Throttle** tick updates at high zoom
- Consider **WebGL** (PixiJS) if SVG performance degrades

### Smooth Transitions
- Use `d3.easeCubicInOut` for natural feel
- Keep transitions under 750ms (feels snappy, not slow)
- Don't animate ALL nodes on zoom - only visibility changes

---

## Success Criteria

### It Works When:
1. Student can zoom from world → region → node smoothly
2. Only relevant edges shown at each zoom level
3. After unlocking a skill, camera refocuses on frontier
4. Breadcrumbs accurately reflect current view
5. Graph doesn't rearrange between sessions
6. No visual clutter at any zoom level
7. "Prove It" button visible on frontier nodes
8. Clicking domains/skills feels responsive (< 100ms)

### It Feels Premium When:
- Transitions are smooth and cinematic
- Glows enhance, don't distract
- No lag with 175+ nodes
- Frontier nodes clearly stand out
- Unknown nodes fade in as context unlocks

---

## Next Steps

1. **Implement flyTo() and zoom level detection**
2. **Add edge visibility logic**
3. **Create breadcrumb component**
4. **Test with real user data**
5. **Optimize performance**
6. **Connect to proof gate system** (next phase)

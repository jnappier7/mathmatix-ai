# Analytics Dashboard Enhancement Plan

## Overview
Surface the new learning engine data (BKT, FSRS, cognitive load, consistency scoring, interleaving) as rich visualizations for teachers, parents, and admins. Add Chart.js via CDN for charting. Create new API endpoints that expose engine analytics. Build visualization components into existing dashboards.

## Phase 1: Data Persistence Layer

### 1a. Add `learningEngines` to User schema (`models/user.js`)
Add a new field alongside `skillMastery`:
```javascript
learningEngines: {
  bkt: {
    type: Map,          // skillId → BKT state
    of: Schema.Types.Mixed,
    default: () => new Map()
  },
  fsrs: {
    type: Map,          // skillId → FSRS card
    of: Schema.Types.Mixed,
    default: () => new Map()
  },
  consistency: {
    type: Map,          // skillId → consistency state
    of: Schema.Types.Mixed,
    default: () => new Map()
  },
  cognitiveLoadHistory: [{   // Last 20 sessions
    date: Date,
    avgLoad: Number,
    peakLoad: Number,
    level: String,
    sessionMinutes: Number
  }],
  interleavingState: Schema.Types.Mixed
}
```

### 1b. Persist engine state in pipeline (`utils/pipeline/persist.js`)
After each answer attempt, save updated BKT/FSRS/consistency state to user.learningEngines.

## Phase 2: Analytics API Endpoints

### 2a. New route file: `routes/analytics.js`
Create dedicated analytics endpoints:

**Teacher endpoints:**
- `GET /api/analytics/student/:studentId/knowledge-map` — BKT states for all skills (pLearned, mastery, ZPD scores) formatted for heatmap
- `GET /api/analytics/student/:studentId/memory-forecast` — FSRS retrievability curves + due dates for all skills
- `GET /api/analytics/student/:studentId/cognitive-profile` — Cognitive load history over sessions (trend line data)
- `GET /api/analytics/student/:studentId/consistency-report` — SmartScore breakdown per skill with pattern labels
- `GET /api/analytics/student/:studentId/learning-trajectory` — Combined BKT + consistency + cognitive load timeline
- `GET /api/analytics/class/knowledge-heatmap` — Class-wide BKT heatmap (skills × students matrix)
- `GET /api/analytics/class/risk-radar` — Students at risk (high cognitive load + low BKT + declining consistency)
- `GET /api/analytics/class/interleaving-effectiveness` — Interleaving stats aggregated across class

**Parent endpoints:**
- `GET /api/analytics/child/:childId/memory-health` — Simplified FSRS: "strong/fading/needs-review" per skill
- `GET /api/analytics/child/:childId/weekly-brain-report` — Weekly cognitive load + engagement + progress summary
- `GET /api/analytics/child/:childId/strength-map` — Simplified BKT visualization (what they know vs learning vs needs work)

**Admin endpoints:**
- `GET /api/analytics/platform/engine-health` — Aggregate stats: avg cognitive load, BKT distribution, FSRS review adherence
- `GET /api/analytics/platform/learning-outcomes` — BKT mastery rates, productive struggle %, avg time-to-mastery

## Phase 3: Frontend Visualizations

### 3a. Chart.js CDN + shared chart utilities
Add to teacher/parent/admin dashboard HTML:
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
```

Create `public/js/analyticsCharts.js` — shared chart factory functions:
- `createKnowledgeHeatmap(container, data)` — Skills × mastery probability color grid
- `createMemoryForecastChart(container, data)` — FSRS retrievability decay curves per skill
- `createCognitiveLoadTimeline(container, data)` — Session-over-session load trend with zone bands
- `createConsistencyRadar(container, data)` — Radar chart: accuracy, consistency, difficulty-adjusted, productive struggle
- `createRiskScatterPlot(container, data)` — X: cognitive load, Y: BKT pLearned, size: consistency, color: risk
- `createStrengthMap(container, data)` — Simplified donut/bar for parents

### 3b. Teacher Dashboard — New "Analytics" tab
Add a 4th tab to teacher dashboard alongside Students/Classes/Insights:
- **Class Knowledge Heatmap**: Color-coded grid (green=mastered, yellow=learning, red=struggling) — skills as rows, students as columns
- **Risk Radar**: Scatter plot showing students who need attention based on combined engine signals
- **Cognitive Load Distribution**: Bar chart showing how many students are in each load zone
- Click any student → drill into individual analytics modal with:
  - Knowledge trajectory (BKT pLearned over time per skill)
  - Memory forecast (FSRS curves showing when skills will fade)
  - Cognitive load timeline (session history)
  - Consistency breakdown (SmartScore radar per skill)
  - Interleaving effectiveness (focused vs interleaved accuracy comparison)

### 3c. Parent Dashboard — Enhanced child cards
Add to existing child progress view:
- **Memory Health Bar**: Horizontal stacked bar (strong/fading/needs-review skill counts)
- **Weekly Brain Report Card**: Simple card showing cognitive load trend (emoji-based: rested/working hard/overloaded) + productive struggle detection + engagement trajectory
- **Strength Map**: Friendly donut chart showing skill categories mastered vs in-progress

### 3d. Admin Dashboard — Platform analytics panel
Add new "Learning Analytics" section:
- **Mastery Distribution**: Histogram of BKT pLearned across all active students
- **Cognitive Load Trends**: Platform-wide average load over time
- **Engine Effectiveness**: Before/after metrics (time-to-mastery, retention rates, productive struggle detection)
- **Review Adherence**: % of FSRS-recommended reviews completed on time

## Phase 4: Implementation Order

1. Schema changes (models/user.js) — add learningEngines field
2. Persist engine state (pipeline/persist.js) — save after each answer
3. Analytics route file (routes/analytics.js) — all API endpoints
4. Chart utility library (public/js/analyticsCharts.js) — shared chart functions
5. Teacher dashboard analytics tab — highest impact, most data
6. Parent dashboard enhancements — simplified views
7. Admin platform analytics — aggregate views
8. Tests for new API endpoints

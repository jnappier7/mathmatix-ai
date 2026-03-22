# Visual Algebra Tools - Implementation Plan

## Current State (What Already Exists)
- **Algebra Tiles**: Full 81KB workspace with drag-drop, snap-to-grid, equation parsing, modes (algebra/base-ten/fractions/number-line)
- **Inline Chat Visuals**: 20+ visual types rendered inline in chat (NUMBER_LINE, FRACTION, PIE_CHART, FUNCTION_GRAPH, ALGEBRA_TILES inline preview, etc.)
- **Visual Teaching Parser** (backend): Parses AI commands like `[NUMBER_LINE:...]`, `[FRACTION_BARS:...]`, `[ALGEBRA_TILES:...]`
- **Visual Teaching Handler** (frontend): Executes parsed commands, opens tools, renders SVG
- **Visual Command Enforcer**: Auto-injects visual commands when AI gives text-only answers to visual questions
- **Prompt**: Tells AI about some visual commands, but NOT all of them (missing number line enrichment, fraction models, image tools)

## What's Missing / Needs Enhancement

### 1. Enhanced Number Line (AI-Callable + Interactive)
**Current**: Basic SVG with tick marks and optional single point marker
**Need**: Rich interactive number line with jumps, hops, fractions, intervals, operations

### 2. Enhanced Fraction Models (AI-Callable + Interactive)
**Current**: Basic bar/circle fraction + clickable segments
**Need**: Multiple fraction model types (circle, bar, area, tape), AI-callable operations (add, compare, equivalent, multiply)

### 3. AI ↔ User Bidirectional Communication for ALL Manipulatives
**Current**: AI can open algebra tiles and set expression; user has "Send to AI" button
**Need**: All manipulatives (number line, fractions, algebra tiles) can report user actions back to AI

### 4. Safe Educational Image Search
**Current**: Static concept image map (14 concepts), no search
**Need**: Google Custom Search API with SafeSearch enforced, education-only filtering, inline display

---

## Implementation Plan

### Phase 1: Enhanced Interactive Number Line
**Files**: `public/js/inlineChatVisuals.js`, `utils/visualTeachingParser.js`, `utils/promptCompact.js`

**New AI commands**:
```
[NUMBER_LINE:min=-5,max=10,points=[3,7],jumps=[(0,3,"+"),(3,7,"+")],label="Adding 3 + 4"]
[NUMBER_LINE:min=0,max=1,fractions=true,denominator=4,points=[1/4,3/4],label="Fractions on number line"]
[NUMBER_LINE:min=-10,max=10,inequality=">3",label="x > 3"]
```

**Features to build**:
- Jump/hop arrows between points (for addition/subtraction visualization)
- Fraction tick marks (denominator-based subdivisions)
- Inequality shading with open/closed circles
- User can drag points AND those positions get reported back to AI
- "Send to AI" button that captures current number line state

### Phase 2: Enhanced Fraction Models
**Files**: `public/js/inlineChatVisuals.js`, `utils/visualTeachingParser.js`, `utils/promptCompact.js`

**New AI commands**:
```
[FRACTION_MODEL:type=circle,num=3,denom=4,label="Three fourths"]
[FRACTION_MODEL:type=bar,num=2,denom=3,compare=[1/2,2/3,3/4],label="Compare fractions"]
[FRACTION_MODEL:type=area,rows=3,cols=4,shaded=6,label="Area model: 6/12 = 1/2"]
[FRACTION_MODEL:type=tape,whole=1,parts=[(1/3,"red"),(2/3,"blue")],label="Tape diagram"]
[FRACTION_OP:op=add,fractions=[1/4,2/4],animate=true,label="Adding fractions with same denominator"]
```

**Features to build**:
- **Circle model**: Pie-slice with interactive toggle (enhanced version of existing)
- **Bar model**: Horizontal bar with segments (enhanced version of existing)
- **Area model**: Grid-based rectangle for multiplication visualization
- **Tape diagram**: Tape/strip model for part-whole relationships
- User can toggle segments, AI sees what user changed
- Fraction operation animations (adding, finding common denominators)

### Phase 3: AI ↔ User Bidirectional Manipulative Bridge
**Files**: `public/js/manipulativeBridge.js` (NEW), `public/js/script.js`, `utils/promptCompact.js`

**Architecture**:
- New `ManipulativeBridge` class that:
  - Listens for user interactions on any manipulative (tiles moved, points dragged, segments toggled)
  - Captures current state as a structured snapshot
  - Provides "Send to AI" buttons on all manipulatives
  - Formats the state as a context message the AI can understand
  - Injects the state into the next chat message automatically

**State format sent to AI**:
```json
{
  "tool": "number_line",
  "state": { "min": -5, "max": 10, "userPoints": [3, 7], "userJumps": [[0,3]] },
  "userAction": "dragged point from 5 to 7"
}
```

### Phase 4: Safe Educational Image Search
**Files**: `routes/imageSearch.js` (NEW), `utils/safeImageSearch.js` (NEW), `utils/visualTeachingParser.js`, `utils/promptCompact.js`

**New AI command**:
```
[SEARCH_IMAGE:query="right triangle hypotenuse",category=geometry]
[SEARCH_IMAGE:query="fraction bars visual",category=fractions]
```

**Architecture**:
- Google Custom Search JSON API (free tier: 100 queries/day, $5/1000 after)
- Hard-enforced SafeSearch = ACTIVE
- Restricted to education domains whitelist (khanacademy.org, mathisfun.com, desmos.com, etc.)
- Content-type filter: images only, educational content
- Backend proxy route: `GET /api/images/search?q=...&category=...`
- Results rendered inline in chat with attribution
- Rate-limited per student (max 5 searches per session)
- COPPA-safe: no user data sent to Google, queries sanitized

### Phase 5: Update AI Prompt with All New Tools
**Files**: `utils/promptCompact.js`, `utils/visualCommandExamples.js`

Add to the visual tools section:
```
[NUMBER_LINE:min=V,max=V,points=[...],jumps=[(from,to,label),...],fractions=bool,denominator=V,inequality="op V"]
[FRACTION_MODEL:type=circle|bar|area|tape,num=V,denom=V,compare=[...],label="L"]
[FRACTION_OP:op=add|subtract|multiply|compare,fractions=[a/b,c/d],animate=bool]
[SEARCH_IMAGE:query="Q",category=geometry|fractions|algebra|arithmetic]
```

Add few-shot examples for the new commands.

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `public/js/inlineChatVisuals.js` | EDIT | Add enhanced number line (jumps, fractions, inequality), enhanced fraction models (area, tape), fraction operations |
| `public/js/manipulativeBridge.js` | NEW | Bidirectional AI ↔ user manipulative communication bridge |
| `public/js/script.js` | EDIT | Wire up ManipulativeBridge, inject manipulative state into chat messages |
| `utils/visualTeachingParser.js` | EDIT | Parse new commands: FRACTION_MODEL, FRACTION_OP, SEARCH_IMAGE, enhanced NUMBER_LINE |
| `utils/visualCommandEnforcer.js` | EDIT | Auto-inject fraction models and number lines for relevant questions |
| `utils/visualCommandExamples.js` | EDIT | Add few-shot examples for new visual commands |
| `utils/promptCompact.js` | EDIT | Document all new visual tools in AI system prompt |
| `utils/safeImageSearch.js` | NEW | Google Custom Search integration with SafeSearch + education filtering |
| `routes/imageSearch.js` | NEW | API route for safe image search proxy |
| `server.js` | EDIT | Mount image search route |
| `public/js/visualTeachingHandler.js` | EDIT | Handle new manipulative types from backend parser |
| `public/css/inlineChatVisuals.css` or styles | EDIT | Styles for new visual components |

## Execution Order
1. Phase 1 (Number Line) - standalone, high impact
2. Phase 2 (Fraction Models) - standalone, high impact
3. Phase 3 (Bidirectional Bridge) - depends on Phase 1 & 2
4. Phase 5 (Prompt Updates) - can be done alongside Phase 1-3
5. Phase 4 (Image Search) - independent, needs API key

# IEP Accommodations System — Audit Report

**Date:** March 8, 2026
**Platform:** MathMatix AI — K-12 Personalized Math Tutoring
**Scope:** Full-stack IEP accommodations implementation audit

---

## Executive Summary

MathMatix AI has a **substantial and legally-aware IEP accommodations system** spanning the database layer, API endpoints, AI prompt engineering, a real-time pipeline for goal tracking, and a rich frontend experience. The system covers 9 discrete accommodation types, 10 pre-built disability-profile templates, goal progress monitoring with audit trails, and FERPA/IDEA compliance considerations. Below is an honest assessment of what's solid, what's shaky, the biggest opportunity areas, and a concrete plan to make this system **3x better**.

---

## What's Solid

### 1. Data Architecture & Privacy Boundary
- **Separate `iepplans` MongoDB collection** (`models/iepPlan.js`) isolates legally sensitive IEP data from the general `User` document. This is a textbook FERPA-compliant design.
- **Lightweight cache on the User model** keeps the chat hot-path fast — only accommodation flags and reading level are mirrored, not full goals/history.
- **Unique `userId` index** prevents duplicate IEP records and enables O(1) lookups.

### 2. Accommodation Coverage (9 Types + Custom)
The 9 built-in accommodations map directly to real-world IEP service categories:

| Accommodation | Backend | Prompt | Frontend | Test Coverage |
|---|---|---|---|---|
| Extended Time (1.5x) | `extendedTime` | Tells AI not to rush | `adaptiveFluency.js` multiplier | Tested |
| Reduced Distraction | `reducedDistraction` | Clean visuals instruction | Hides gamification UI | Tested |
| Calculator Allowed | `calculatorAllowed` | Never restrict calculator | Persistent calc button | Tested |
| Audio Read-Aloud | `audioReadAloud` | TTS for word problems | Cartesia playback | Tested |
| Chunked Assignments | `chunkedAssignments` | 3-5 problems per chunk | Check-in overlay after 4 problems | Tested |
| Breaks as Needed | `breaksAsNeeded` | Frequent rest periods | Break button + 5 activities | Tested |
| Multiplication Chart | `digitalMultiplicationChart` | Reference allowed | Floating 12x12 table | Tested |
| Large Print / High Contrast | `largePrintHighContrast` | Larger text instruction | CSS class + forced light mode | Tested |
| Math Anxiety Support | `mathAnxietySupport` | Growth mindset, celebrate effort | Gentler animations | Tested |

**Plus** a `custom` string array for free-text accommodations — critical for real-world IEPs that don't fit neat categories.

### 3. Template System (10 Disability Profiles)
`utils/iepTemplates.js` provides turnkey profiles for:
- Dyscalculia, Dyslexia, ADHD, Processing Speed, Math Anxiety
- Visual Impairment, ESL/ELL, Autism Spectrum
- Minimal (basic) and Comprehensive (full-range)

Teachers can **merge** templates (additive) or **replace** (clean swap). Goal templates are grade-banded across 11 math domains (K through Geometry). This dramatically reduces teacher setup time.

### 4. AI Prompt Integration
`buildIepAccommodationsPrompt()` in `utils/prompt.js` injects **legally explicit instructions** into the system prompt:
- States accommodations are "LEGALLY REQUIRED" under IDEA
- Per-accommodation behavioral directives (e.g., "Never tell this student to put the calculator away")
- Reading level adjustments for word problems
- Scaffold preferences wired into tutoring strategy
- Active goal descriptions with progress so the AI can reinforce them

### 5. Goal Progress Pipeline
The pipeline (`verify.js` → `persist.js` → `index.js`) provides **real-time, AI-driven goal tracking**:
- AI emits `<IEP_GOAL_PROGRESS:identifier,±change>` tags in responses
- Pipeline extracts, validates, clamps (0–100), and persists
- Auto-completes goals at 100%
- Full history audit trail with timestamps and editor IDs
- Frontend receives `iepGoalUpdates` and shows slide-in notifications

### 6. Test Suite
`tests/unit/iepAccommodations.test.js` (757 lines) covers:
- Prompt construction for every accommodation type
- Feature mapping completeness
- Template application (merge vs. replace)
- Goal progress tag parsing and application
- Edge cases: negative progress, completed goal protection, progress capping

### 7. Frontend UX
The `public/js/modules/iep.js` module (595 lines) and `iep-accommodations.css` (848 lines) deliver:
- 5 break activities (breathing exercise, stretches, 5-4-3-2-1 grounding, Tic-Tac-Toe, Hangman)
- Floating multiplication chart
- High contrast theme with enlarged fonts
- Reduced distraction mode that strips gamification elements
- Goal progress notification banners
- Mobile-responsive and dark-mode-compatible styles

---

## What's Shaky

### 1. User Model ↔ IEP Collection Sync Risk
The dual-write pattern (full data in `iepplans`, cache in `User.iepPlan`) creates a **stale cache risk**. If a teacher updates the IEP through the templates route but the User cache isn't refreshed, the chat hot-path will serve outdated accommodation flags. There's a migration script (`scripts/migrateIepToCollection.js`) but no automated reconciliation or cache-invalidation hook.

### 2. No Role-Based Field-Level Access Control
The `teacher.js` and `admin.js` routes allow PUT to the full IEP object. There's no field-level permission matrix:
- Can a teacher edit goals but not accommodations? (Legally, some accommodations require IEP team sign-off.)
- Can a parent view goals but not edit them?
- The routes protect by role, but not by **field within the IEP**.

### 3. Goal Progress Parsing is Fragile
The AI-generated `<IEP_GOAL_PROGRESS:...>` tags rely on the LLM consistently emitting a specific format. In practice:
- Model temperature, context window pressure, or prompt drift can cause the AI to skip or malform the tag.
- There's no fallback detection (e.g., if the AI says "great progress on fractions!" without the tag, no goal update fires).
- The description-matching logic (`includes()` on lowercased strings) can false-match on similar goal descriptions.

### 4. No Accommodation Effectiveness Tracking
The system records **what** accommodations are enabled and **when** goals change, but doesn't track whether accommodations are actually being **used** or **helping**:
- Is the student actually clicking the multiplication chart?
- Does read-aloud correlate with better word-problem performance?
- How often are breaks taken, and do they reduce error rates afterward?

### 5. Extended Time Implementation is Incomplete
The 1.5x multiplier applies in `adaptiveFluency.js`, but:
- There's no visible timer/countdown showing the student their extended time.
- No teacher-facing report showing how extended time is being consumed.
- The multiplier is hardcoded at 1.5x — real IEPs may specify 2x or "unlimited."

### 6. Chunked Assignment Logic is Client-Side Only
The `IEP_CHUNK_SIZE = 4` is a frontend constant. The backend/AI doesn't enforce chunk boundaries, so:
- If the frontend fails to render the check-in overlay, chunking silently breaks.
- The AI may send 10 problems in one message if the prompt instruction is ignored.
- No server-side validation that chunking was honored.

### 7. Missing Integration Tests
The test suite is strong on unit tests but lacks:
- End-to-end tests for the full IEP lifecycle (teacher creates → student uses → parent views)
- API integration tests for template application endpoints
- Tests for the cache-sync path between `iepplans` and `User.iepPlan`

---

## Opportunity Areas

### 1. Progress Monitoring & Reporting Dashboard
**Gap:** Teachers and parents have no dedicated IEP progress monitoring view. Goal data exists in the DB but there's no visualization of trends over time, no printable progress reports for IEP team meetings, and no alert system when a student is falling behind on goals.

### 2. Accommodation Usage Analytics
**Gap:** Zero telemetry on accommodation utilization. A teacher can't answer "Is the multiplication chart helping?" or "How often does this student take breaks?" This data would be gold for annual IEP reviews.

### 3. 504 Plan Support
**Gap:** The system is built around IEPs (IDEA), but many students have **504 Plans** (Section 504 of the Rehabilitation Act) which have different legal requirements, timelines, and structures. There's no 504-specific workflow.

### 4. Multi-Disability Profile Compositing
**Gap:** A student can only have one `templateApplied`. Real students often have co-occurring conditions (ADHD + Dyscalculia). The template system should support layering multiple profiles.

### 5. Compliance Audit Trail & Reporting
**Gap:** While goal history tracks changes, there's no comprehensive audit log for accommodation modifications, no exportable compliance report for district administrators, and no notification system when an IEP is due for annual review.

### 6. Parent IEP Visibility is Passive
**Gap:** Parents see IEP data nested inside the progress endpoint. There's no parent-facing IEP summary page, no notification when accommodations change, and no mechanism for parents to request modifications.

### 7. Localization / Language Support
**Gap:** All accommodation descriptions, templates, and break activity text is English-only. For ESL/ELL students (one of the templates!), the accommodation system itself isn't localized.

### 8. Configurable Accommodation Parameters
**Gap:** Many accommodations are binary (on/off) but real IEPs have nuance:
- Extended time: 1.5x vs 2x vs unlimited
- Chunked assignments: chunk size varies (3, 5, 10)
- Breaks: frequency and duration specs
- Reading level: separate speaking vs. reading levels

---

## How to Make This 3x Better

### Tier 1: High-Impact, Near-Term (2-4 weeks)

#### 1. Build an IEP Progress Monitoring Dashboard
Create a teacher-facing `/teacher/iep-dashboard` with:
- **Goal progress timeline charts** (line graph per goal, showing history entries over time)
- **Accommodation utilization heatmap** (which accommodations are active across the class)
- **At-risk alerts** when a student's goal progress is flat for 2+ weeks
- **Printable IEP progress report** (PDF export for IEP team meetings)
- **Parent-facing summary view** on the parent dashboard

*Impact: Transforms IEP data from "stored" to "actionable." Teachers can walk into IEP meetings with data-backed progress reports.*

#### 2. Instrument Accommodation Usage Telemetry
Track and log:
- Multiplication chart opens/closes and duration
- Break activity selections and completion
- Calculator usage frequency
- Read-aloud triggers
- Chunked assignment check-in responses ("Keep going" vs. "Take a break")
- High contrast / reduced distraction active session time

Store in a new `iepAccommodationEvents` collection. Surface in the dashboard above.

*Impact: Moves from "we offer accommodations" to "we can prove accommodations are being delivered and measure their effectiveness."*

#### 3. Fix the Cache Sync Problem
Implement a Mongoose `post-save` hook on `IEPPlan` that automatically updates `User.iepPlan`:
```javascript
iepPlanSchema.post('save', async function() {
  await User.updateOne({ _id: this.userId }, {
    'iepPlan.accommodations': this.accommodations,
    'iepPlan.readingLevel': this.readingLevel,
    'iepPlan.preferredScaffolds': this.preferredScaffolds,
  });
});
```
Add a nightly reconciliation script and a health-check endpoint.

*Impact: Eliminates the #1 data integrity risk in the current system.*

#### 4. Make Extended Time Configurable
- Change `extendedTime: Boolean` → `extendedTime: { enabled: Boolean, multiplier: Number }` (default 1.5, options: 1.5, 2.0, 3.0, unlimited)
- Show a visible extended-time indicator in the student UI
- Report time usage to teachers

*Impact: Aligns with real-world IEP specifications where time accommodations vary.*

### Tier 2: Medium-Impact, Medium-Term (4-8 weeks)

#### 5. Multi-Profile Compositing
Allow `templateApplied` to be an array. When applying a new template, merge its accommodations additively (union of boolean flags, concatenation of custom arrays). Provide a "composite profile" view showing which accommodations came from which template.

*Impact: Reflects the reality that 40%+ of students with IEPs have co-occurring conditions.*

#### 6. Add 504 Plan Support
Create a `planType` field (`iep` | `504` | `intervention`) on the IEP model. 504 plans share the accommodations schema but have different:
- Review timelines (annual for IEP, varies for 504)
- Goal requirements (IEPs require measurable goals; 504s often don't)
- Eligibility criteria

*Impact: Expands the addressable student population significantly — 504 plans are more common than IEPs in many districts.*

#### 7. Compliance Reporting Engine
Build an automated compliance module:
- **Annual review reminders** (email teachers 30/60/90 days before IEP due dates)
- **Service delivery log** (proof that accommodations were provided in every session)
- **District export** (CSV/PDF of all IEP accommodations, goals, and progress for district auditors)
- **Modification history report** (who changed what, when — already tracked, needs presentation layer)

*Impact: Positions MathMatix AI as not just a tutoring tool but a compliance asset for districts — major selling point for school contracts.*

#### 8. Robust Goal Progress Detection
Replace fragile tag parsing with a two-layer approach:
- **Primary:** Keep `<IEP_GOAL_PROGRESS>` tags but add structured JSON format: `<IEP_GOAL_PROGRESS>{"goal":0,"change":5,"reason":"correct fraction addition"}</IEP_GOAL_PROGRESS>`
- **Secondary:** After each AI response, run a lightweight classifier that analyzes the conversation for implicit goal progress (e.g., student demonstrated mastery of a skill aligned with a goal)
- **Validation:** Require goal index (not description matching) as the primary identifier

*Impact: Goal tracking becomes reliable instead of probabilistic. Eliminates false-matches and missed updates.*

### Tier 3: Transformative, Longer-Term (8-16 weeks)

#### 9. AI-Powered IEP Goal Recommendations
Use student performance data (skill mastery, error patterns, time-on-task) to **recommend IEP goals**:
- "Based on 3 weeks of data, this student struggles with fraction-to-decimal conversion. Suggested goal: 'Student will convert fractions to decimals with 80% accuracy by [date].'"
- Surface recommendations during IEP drafting, not just template application.

*Impact: Turns the AI tutor into an IEP team member. Teachers spend less time writing goals and more time teaching.*

#### 10. Parent IEP Collaboration Portal
Give parents:
- Real-time view of accommodation delivery
- Goal progress notifications (push/email when milestones hit)
- Ability to **request** accommodation changes (routed to teacher for approval)
- At-home practice recommendations aligned with IEP goals
- IEP meeting preparation summary ("Here's what to discuss at the next meeting")

*Impact: Closes the school-home gap that is one of the biggest predictors of IEP success.*

#### 11. Accommodation Effectiveness Analytics
Correlate accommodation usage with learning outcomes:
- A/B analysis: performance with vs. without specific accommodations
- "This student's word-problem accuracy increases 23% when read-aloud is active"
- Recommend accommodation adjustments based on data
- Feed insights back to teachers for evidence-based IEP decisions

*Impact: Moves from compliance (required by law) to optimization (actually helping students learn better). This is the holy grail of special education technology.*

#### 12. District-Wide IEP Analytics
For school/district admin accounts:
- Aggregate accommodation distribution across schools
- Goal attainment rates by disability category, grade, school
- Teacher compliance scores (are accommodations being configured?)
- Resource allocation insights (which schools need more support?)

*Impact: Positions MathMatix AI for district-level contracts by speaking the language of special education directors.*

---

## Summary Scorecard

| Dimension | Current State | After 3x Plan |
|---|---|---|
| **Accommodation Types** | 9 + custom (strong) | 9 + configurable params |
| **Template Library** | 10 disability profiles (strong) | Multi-profile compositing + 504 |
| **Goal Tracking** | AI-driven, real-time (good) | Robust detection + recommendations |
| **Progress Reporting** | Data exists, no dashboard (gap) | Full dashboard + PDF exports |
| **Usage Analytics** | None (gap) | Full telemetry + effectiveness correlation |
| **Compliance** | Audit trail exists (partial) | Automated reminders + district exports |
| **Parent Involvement** | Passive progress view (weak) | Active collaboration portal |
| **Data Integrity** | Cache sync risk (shaky) | Automated sync + reconciliation |
| **Test Coverage** | Strong unit, no integration (partial) | Full lifecycle + integration tests |
| **Localization** | English only (gap) | Multi-language accommodation UI |

---

## Conclusion

The MathMatix AI IEP system has a **strong foundation** — the data model is thoughtfully separated, the accommodation types are comprehensive, the AI prompt integration is legally aware, and the test suite covers critical paths. The biggest gaps are in **observability** (no dashboards, no usage analytics), **data reliability** (cache sync), and **stakeholder engagement** (parents are passive, teachers lack reporting). Closing these gaps transforms the IEP system from a feature checkbox into a genuine **competitive moat** for school district sales.

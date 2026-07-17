# Mathmatix AP Calculus AB Bootcamp — Design Doc

> **Status:** Design record · v1.0 · Owner: Jason Nappier · July 2026
> **One-line:** A 5-week, assessment-driven AP Calculus AB intensive, structurally
> identical to the ACT Math Bootcamp: weekly diagnostic → automatic skill scoring →
> tutor-committed weekly plan → targeted teaching → re-assess.

Authored from `Mathmatix_APCalcAB_Bootcamp_Design_Doc.pdf`. Content bank and pipeline
live under `seeds/calc-ab/` (see its README).

## 1. Summary

The engine is **five original weekly diagnostics** — 15 AP-style MC + one 9-point FRQ
with an AP scoring rubric each — tagged by CED unit (U1–U8), subskill, Mathematical
Practice, and calculator status. Weeks 1–4 sweep the course in blueprint order; Week 5
is a mini-AP exit exam weighted like the real Section I.

## 2. Alignment to the real exam

Diagnostics mirror the 2026 AP Calculus AB exam: 4-choice MC split into no-calculator
(Q1–10) and calculator (Q11–15) parts (each weekly set = one-third of Section I's 45
questions), FRQs on 9-point rubrics with AP justification language, radians throughout,
3-decimal convention on calculator items. **Note:** College Board announced MC
count/timing changes starting with the May 2027 exam — the bank's tagging makes
re-blueprinting a configuration change, not a rewrite.

| Week | Diagnostic focus | FRQ archetype |
|------|------------------|---------------|
| 1 | U1–U3: limits, continuity, derivative rules | Limit definition + tangent line |
| 2 | U3–U5: related rates, MVT, curve analysis | Analysis from the graph of f′ |
| 3 | U6–U7: Riemann/FTC/u-sub, slope fields, diff eq | Rate-in/rate-out accumulation |
| 4 | U8 + retention: avg value, area, volumes | Area and volume of region R |
| 5 | Exit: all units at real-exam weights | Particle-motion synthesis |

## 3. The weekly loop (adapted from the ACT Bootcamp)

- **MC auto-scored on submission**: accuracy by unit, by Mathematical Practice, by
  calculator status, plus distractor analysis — every wrong choice encodes a known
  error (dropped chain-rule factor, product-of-derivatives, reversed bounds), so the
  platform names the misconception, not just the miss.
- **FRQ tutor-scored** against the point-by-point rubric inside the platform (~5 min);
  rubric points map to skills, so partial credit feeds the same diagnostic.
- **Priority score** ranks weak skills: `(1 − accuracy) × exam weight × recency`. The
  tutor commits a ≤3-topic weekly plan with one mandatory retrospective item; the AI
  tutor drills those targets between sessions with fresh variants.
- **Score projection**: weekly composite (MC% 50% + FRQ rubric points 50%) → an
  estimated AP band (1–5) with published caveats; a trajectory chart shows band
  movement week over week.

## 4. Success metrics

- **Primary:** exit-exam composite ≥ target band (entering 2-band → 3+; 3-band → 4+).
- **Leading:** weekly target-unit accuracy +15 points; FRQ justification points
  (the "because f′ > 0" points) trending up — the most commonly lost points.
- **Process:** plan committed within 48h of each diagnostic; 100% FRQ rubric-scored
  before the next session.

## 5. From bootcamp to a full course

The bootcamp is the kernel of a full-year course; expansion is mechanical because
(a) the bank is unit-tagged and rubric-scored (assessments are *assembled* from
blueprints), (b) the weekly loop is cadence-independent, and (c) the scoring pipeline
is exactly what unit tests and mock exams need.

**Full-course shape (30 weeks):** Foundations U1–U3 (wk 1–8), Applications U4–U5
(9–16, first mock at wk 12), Integration U6–U7 (17–24, second mock at wk 20),
Synthesis U8 (25–26, full mock), Review bootcamp (27–30, the 5-week bootcamp
compressed to 4 as the capstone).

**What gets built:** per-unit quiz (8–10 MC) + test (12 MC + 1 FRQ) in 2–3 parallel
unlabeled versions (the Algebra 1 versioning + spiral-review system), two full-length
mocks (45 MC + 6 FRQ) assembled from the grown bank, a week-0 readiness diagnostic
(AP Precalc-aligned) routing to remediation, and a pacing service that back-plans from
the May exam date.

**Business logic:** ship the bootcamp first (review-season revenue, low build cost);
it doubles as the capstone phase of the full course, and its telemetry prioritizes
which full-course units to build first. Same play as ACT → Algebra 1: prove the loop
small, then scale the bank.

## 6. Risks & open questions

- **2027 exam format change:** keep blueprints as configuration; re-verify timing when
  College Board publishes final specs.
- **FRQ inter-rater consistency** across tutors: rubric training set + calibration
  examples needed before scale.
- **Open:** BC extension (series, parametrics) as an add-on track; whether Week 5 should
  grow to a half-length exam (23 MC + 3 FRQ) for stronger projection validity.

## 7. Implementation status

- **Content bank + ingest + figures + skill mapping — SHIPPED** (`seeds/calc-ab/`,
  `scripts/{ingest,audit}CalcItems.py`, `scripts/calcFigureRenderer.py`,
  `scripts/calcSkillMap.py`). 75 MC → `Problem` docs mapped to existing catalog skills
  (BKT-wired for free), 5 weekly FRQs preserved in `seeds/calc-assessment-map.json`,
  94/94 verify snippets pass, all figures render.
- **Weekly bootcamp rail — SHIPPED.** `routes/calcBootcamp.js` (`/api/calc-bootcamp`)
  + `models/calcBootcampSession.js` + `utils/calcBootcamp.js` (scoring core, unit-tested).
  The loop: `start-week` freezes a week's 15 MC + FRQ (client-safe, no keys/solutions);
  `submit-mc` auto-scores and returns accuracy by unit / practice / calculator plus the
  miss explanations; `submit-frq` AI-scores the response against the rubric (through the
  LLM gateway, falling back to MC-only if unparseable); `complete-week` computes the
  composite (MC 50% + FRQ 50%), projects an AP band (1–5), ranks weak skills by
  priority = (1 − accuracy) × exam weight × recency, commits a ≤3-topic plan with one
  retrospective, and seeds the student's `tutorPlan.skillFocus`; `progress` returns the
  week-over-week band trajectory.

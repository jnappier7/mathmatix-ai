# CONTENT_STANDARDS.md — one wording, everywhere

Marketing copy for the same fact was drifting page to page: the hero said
"Grade 3–Calculus", the FAQ said "Grade 3 through Calculus 3", and onboarding said
"Safe for students K–college". A parent reading two of those in one session cannot
tell who the product is actually for. Same story for the accommodation claim
("honors every accommodation" in the hero, "nine accommodation types" in the
comparison table) and for British spellings on an American product.

This file is the **single source of truth** for those facts. Copy from here; do not
re-word from memory. `tests/unit/contentConsistency.test.js` fails CI on the phrasings
this file retires, so a regression is caught before it ships.

Every claim below is grounded in code, and the grounding is named — when the code
changes, this file changes first.

---

## Grade / course range

| Form | Text |
|------|------|
| Canonical (prose, FAQ) | `Grade 3 through Calculus 3` |
| Short (chips, eyebrows, trust lines) | `Grades 3–Calculus 3` |

**Never** `Grade 3–Calculus` (drops the 3, reads as "ends at Calc 1"), and **never**
`K–college` / `K-12` / `K–college` in any student-facing claim — the skill catalog
starts at grade 3 content, so "K" is not a claim we can support.

Grounding: `models/skill.js` catalog + `docs/MATH_SKILLS_VERTICAL_ALIGNMENT.md`.

---

## Free plan allowance

The offer we lead with is the **trial**, not the free tier. Every new account gets
14 days of everything, no credit card (`utils/trialGrant.js`). The free tier is what
a lapsed trial drops to, and marketing copy should introduce it in that order —
trial first, free plan as the floor underneath it — never the other way round.

| Form | Text |
|------|------|
| Canonical (the trial) | `14 days of everything, free — no credit card, nothing to cancel` |
| Canonical (the free tier) | `3 free AI minutes a week` |
| With the clarifier (first mention on any page) | `3 free AI minutes a week — about one problem, worked all the way through, because only the tutor's response time counts.` |
| Short (cards, meta descriptions) | `3 AI min/week` |
| Qualitative (where a number would read as stingy) | `a few tutoring minutes each week` |

**Never** "30 free AI minutes a month" or `30 AI min/month` — that was the tier through
2026-09-06 and it is retired. **Never** "3 minutes of tutoring": three AI minutes is
about fifteen minutes of real tutoring, so that form understates it.

*This section previously said **never** "per week", because the quota then ran on a
rolling 30-day window and a weekly form understated it. The window is now
`FREE_QUOTA_RESET_DAYS = 7`, so "a week" is the accurate form and "a month" is the
retired one. The rule that survives both is the one underneath: **state the window the
meter actually enforces.***

The clarifier is not optional garnish, but note what it is doing at this scale. It used
to convert upward — "30 minutes" read cold sounds like half an hour of use, and the
point was that it is really 2–3 hours. At three minutes the risk inverts: read cold it
sounds like 180 seconds of tutoring, which is not a product. The honest unit is turns.
`utils/pipeline/persist.js` bills every tutor turn a floor of `AI_TIME_FLOOR_SECONDS`
(30s), so three minutes is **six turns — one problem, start to finish**. Say that.

Grounding: `utils/aiTimeMeter.js` (`FREE_WEEKLY_SECONDS`, `FREE_QUOTA_RESET_DAYS` — the
constant names always said "weekly" and now mean it), `utils/pipeline/persist.js`
(`AI_TIME_FLOOR_SECONDS`), `middleware/usageGate.js`, and `utils/trialGrant.js`
(`TRIAL_DAYS`). Pinned by `tests/unit/freeTierCopy.test.js`, which derives the number
from the constant rather than re-pinning a literal.

---

## Accommodations

Canonical claim:

> Personalizes tutoring around nine supported IEP accommodation types — extended time,
> chunked assignments, read-aloud, calculator access, breaks as needed, reduced
> distraction, digital multiplication chart, large print / high contrast, and
> math-anxiety support — plus free-text notes a teacher adds.

**Never** "honors every accommodation on their IEP" or any other unbounded form. Nine
booleans is what the schema has; "every accommodation" promises the tutor can read and
fulfill an arbitrary IEP, which it cannot, and it is the kind of promise a school
district will hold us to.

Short form where space is tight: `nine supported IEP accommodation types`.

Grounding: `iepAccommodationsSchema` in `models/iepPlan.js` — nine boolean fields plus
`custom: [String]`.

---

## Plan and product names

| Thing | Written as |
|-------|-----------|
| The product | `Mathmatix AI` on first mention, `Mathmatix` after |
| The paid plan | `Mathmatix+` (no space, no "Plus") |
| The paid price | `$9.95/mo` in cards and short copy, `$9.95 a month` in prose |
| The free plan | `the free plan` — not "free trial", it does not expire |

---

## Signup roles

The role selector has **no preselected value**. A parent moving fast used to create a
student account because `Student` was the dropdown default while every homepage CTA
told them to start as a parent.

Roles offered at signup: `Parent`, `Student`, `Teacher`. Each needs a one-line
explanation of what that account does, visible without opening a menu.

---

## Competitor claims

Compare on what we do, not on what they allegedly are. **Never** "trained on the
internet, not on pedagogy" — it is unfalsifiable and probably wrong about several named
competitors. Acknowledge what a competitor genuinely does well; a table where the other
columns are uniformly red reads as marketing, not information.

Supportable form:

> General-purpose AI is not built around one child's learning profile, accommodations,
> and parent-visible progress.

---

## Spelling and casing

- **US English.** `honors`, `personalized`, `recognize`. Not `honours`, `personalised`.
  (Comments and identifiers in server code are exempt — this is about user-facing copy.)
- Grade references: `Grade 3`, `Grades 3–12` — capital G, en dash in ranges.
- `IEP`, `ACT`, `SAT`, `FERPA`, `COPPA` all-caps; `read-aloud` and `math-anxiety`
  hyphenated as modifiers.

---

## Claims that need review before they ship

Anything asserting **COPPA / FERPA compliance**, **IDEA or IEP legal adequacy**,
**accessibility conformance** (a WCAG level), or a **measured learning outcome** ("raises
grades by X") is a legal or efficacy claim, not copy. Route it to counsel or to an
education specialist before it goes on a page. Describing a *practice* is fine
("conversations are never used to train models"); asserting a *certification* is not.

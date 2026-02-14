# Mathmatix AI — Course Quality Assurance Framework & Rubric

**Version:** 1.0
**Date:** 2026-02-14
**Author:** QA Education Specialist
**Scope:** All 12 Mathmatix course offerings

---

## 1. PURPOSE

This document establishes a comprehensive Quality Assurance (QA) framework and scoring rubric for evaluating every Mathmatix AI course offering. It is designed to ensure that each course meets rigorous standards of **pedagogical soundness**, **content accuracy**, **age-appropriate language**, **structural completeness**, **assessment integrity**, and **accessibility/equity**.

The framework is grounded in:
- Mathmatix's own stated pedagogical principles (concept-first teaching, gradual release, multiple representations)
- The platform's Lexile/language-complexity system defined in `masteryPrompt.js` and `readability.js`
- Research-based best practices in mathematics education (NCTM Principles, UDL, CRT)
- Common Core State Standards (CCSS) and AP College Board alignment expectations

---

## 2. COURSES IN SCOPE

| # | Course ID | Target Grade(s) | Expected Lexile Range | Language Complexity |
|---|-----------|-----------------|----------------------|-------------------|
| 1 | early-math-foundations | 3–5 | 500–900L | Simple–Moderate |
| 2 | 6th-grade-math | 6 | 800–1000L | Approaching Complex |
| 3 | 7th-grade-math | 7 | 900–1050L | Complex |
| 4 | grade-8-math | 8 | 950–1100L | Complex |
| 5 | algebra-1 | 9 | 1000–1150L | Advanced |
| 6 | geometry | 9–10 | 1000–1200L | Advanced |
| 7 | algebra-2 | 10–11 | 1050–1200L | Advanced |
| 8 | precalculus | 11–12 | 1100–1300L | Very Advanced |
| 9 | ap-calculus-ab | 11–12 | 1100–1300L+ | Very Advanced |
| 10 | calculus-bc | 12+ | 1100–1300L+ | Very Advanced |
| 11 | act-prep | 10–12 | 1050–1200L | Advanced |
| 12 | consumer-math | 9–12 | 1000–1200L | Advanced (Practical) |

*Lexile ranges sourced from the platform's `getLexileGuidance()` function in `utils/masteryPrompt.js`.*

---

## 3. QA DIMENSIONS & RUBRIC

Each course is evaluated across **8 dimensions**, each scored on a **4-point scale**:

| Score | Rating | Meaning |
|-------|--------|---------|
| 4 | **Exemplary** | Exceeds standards; model of best practice |
| 3 | **Proficient** | Meets all standards with minor gaps |
| 2 | **Developing** | Partially meets standards; notable gaps requiring attention |
| 1 | **Inadequate** | Fails to meet standards; major remediation needed |

**Maximum possible score per course: 32 points (8 dimensions × 4 points)**

---

### Dimension 1: CONTENT STRUCTURE & COMPLETENESS (Weight: High)

Evaluates whether the course has a complete, logically sequenced set of modules with all required structural fields.

| Score | Criteria |
|-------|----------|
| **4** | All content modules present with full field set (moduleId, course, unit, title, weeks, estimatedDuration, description, skills, standardsAlignment, goals, instructionalStrategy, aiFlexLevel, scaffold, answerKeys). Logical unit sequencing. Appropriate module count for scope. All checkpoint/assessment modules present with remediation resources. |
| **3** | All required fields present in 90%+ of modules. Minor inconsistencies in sequencing or field naming. Adequate module count. |
| **2** | Missing fields in multiple modules (e.g., no `description`, no `standardsAlignment`, missing `answerKeys`). Gaps in unit coverage. Insufficient checkpoint modules. |
| **1** | Widespread missing fields. Major gaps in topic coverage. Modules lack essential structural elements. |

**Required Fields Checklist:**
- [ ] `moduleId` — unique identifier
- [ ] `course` — course name
- [ ] `unit` — unit number for sequencing
- [ ] `title` — descriptive title
- [ ] `weeks` — pacing guide
- [ ] `estimatedDuration` — time in minutes
- [ ] `description` — module overview
- [ ] `skills` — array of skill IDs
- [ ] `standardsAlignment` — standards codes
- [ ] `goals` — learning objectives
- [ ] `instructionalStrategy` — teaching approach guidance
- [ ] `aiFlexLevel` — AI flexibility setting
- [ ] `scaffold` — lesson phase array
- [ ] `answerKeys` — answer reference

---

### Dimension 2: PEDAGOGICAL DESIGN (Weight: High)

Evaluates alignment with Mathmatix's concept-first, gradual-release pedagogical framework.

| Score | Criteria |
|-------|----------|
| **4** | Every skill follows the full phase sequence: concept-intro → i-do → we-do → you-do. Concept introductions explain the WHY before the HOW. I-Do phases include 3+ worked examples showing variations and edge cases. We-Do includes 3+ guided problems with progressive hints. You-Do includes 3+ independent problems. Multiple representations (visual, symbolic, contextual, verbal) are present. |
| **3** | Phase sequence is complete for 80%+ of skills. Most I-Do phases have 2-3 examples. We-Do and You-Do have adequate problem counts. At least 2 representations used consistently. |
| **2** | Phase sequence incomplete for some skills (e.g., missing concept-intro, jumping straight to i-do). Fewer than 2 worked examples in I-Do. Thin guided/independent practice. Limited representation variety. |
| **1** | No consistent phase structure. Missing entire phases. I-Do has 0-1 examples. Minimal or no practice problems. Single representation only (symbolic). |

**Pedagogical Checklist:**
- [ ] Concept-intro explains conceptual WHY before procedural HOW
- [ ] I-Do has 3+ worked examples with variation (easy → hard, different problem types)
- [ ] We-Do has 3+ problems with progressive hint scaffolding
- [ ] You-Do has 3+ problems with minimal hints
- [ ] `initialPrompt` fields engage student thinking
- [ ] `keyPoints` distill essential takeaways
- [ ] Common misconceptions addressed proactively
- [ ] Real-world connections included

---

### Dimension 3: AGE-APPROPRIATE LANGUAGE, TONE & LEXILE ALIGNMENT (Weight: Critical)

Evaluates whether all student-facing text matches the target grade's reading level, vocabulary expectations, and emotional tone.

| Score | Criteria |
|-------|----------|
| **4** | All explanations, prompts, hints, and problem text are within the target Lexile range. Vocabulary is precisely calibrated: new math terms are defined in context at first use. Tone is warm, encouraging, and age-appropriate (playful for young learners; respectful/collegial for older students). Sentence length matches grade guidance. Analogies and contexts reflect the learner's world. No condescending language for older students or overwhelming complexity for younger ones. |
| **3** | 90%+ of content within Lexile range. Occasional vocabulary above level without scaffolding. Tone is mostly appropriate with minor lapses. Contexts are generally age-relevant. |
| **2** | Noticeable Lexile mismatches — explanations written above or below target. Math terms used without definition for younger learners. Tone inconsistencies (e.g., overly academic for grade 6, overly simple for grade 11). Contexts feel generic or mismatched to age. |
| **1** | Systematic Lexile mismatch. Content feels written for a different audience. Vocabulary overwhelms younger learners or insults older ones. Tone is impersonal, robotic, or inappropriate for age. |

**Language Calibration Reference (from `masteryPrompt.js`):**

| Grade Band | Sentence Length | Vocabulary Standard | Tone Standard |
|------------|----------------|--------------------|----|
| K–3 | 5–14 words | Concrete, everyday words; define EVERY math term | Warm, playful, encouraging; use "like" and "the same as" |
| 4–6 | 12–18 words | Introduce formal terms with definitions; transitional phrases | Clear, supportive, "first...next...then" structure |
| 7–9 | 16–22 words | Formal mathematical terminology expected; conditional language | Respectful, coach-like; "if...then", "because", "therefore" |
| 10–12+ | 18–22+ words | Sophisticated mathematical discourse; logical connectors | Collegial, intellectually engaging; "consequently", "given that" |

**Specific Checks:**
- [ ] Concept-intro text matches grade-level Lexile range
- [ ] Problem prompts use age-appropriate contexts (not too childish for teens, not too abstract for children)
- [ ] Hints are written at or slightly below grade level (scaffolded)
- [ ] Mathematical vocabulary is defined at first use for grades K–8
- [ ] Tone shifts appropriately between encouragement (younger) and intellectual partnership (older)
- [ ] Word problem contexts reflect the learner's likely world (school, sports, jobs, college for older; animals, food, games for younger)

---

### Dimension 4: MATHEMATICAL ACCURACY & RIGOR (Weight: Critical)

Evaluates correctness of all mathematical content, solutions, and answer keys.

| Score | Criteria |
|-------|----------|
| **4** | All worked examples, solutions, hints, and answer keys are mathematically correct. Edge cases handled properly (division by zero, extraneous solutions, special cases). Mathematical notation is precise and consistent. Difficulty progression within each module is appropriate. |
| **3** | 95%+ mathematical accuracy. Minor notation inconsistencies. Difficulty progression generally appropriate. |
| **2** | Occasional errors in solutions or answer keys. Inconsistent notation. Difficulty jumps too sharply or stays too flat within modules. |
| **1** | Multiple mathematical errors. Incorrect answer keys. Misleading explanations. Inappropriate difficulty for stated grade level. |

**Accuracy Checks:**
- [ ] All worked example solutions verified step-by-step
- [ ] Answer keys match problem solutions
- [ ] Edge cases and special cases addressed (e.g., division by zero, no solution, identity)
- [ ] Mathematical notation is consistent throughout course
- [ ] Difficulty progresses logically within and across modules

---

### Dimension 5: STANDARDS ALIGNMENT (Weight: High)

Evaluates alignment to CCSS, AP College Board CED, or other stated standards.

| Score | Criteria |
|-------|----------|
| **4** | Every module has `standardsAlignment` with valid, specific standard codes. Skills map directly to stated standards. Course covers the full scope of the relevant standard set. Standards codes are current and correctly formatted. |
| **3** | 90%+ of modules have standards codes. Standards are valid and generally cover the expected scope. Minor gaps in coverage. |
| **2** | Standards codes present but vague or partially incorrect. Significant scope gaps. Some modules lack alignment data. |
| **1** | Standards alignment is largely absent, incorrect, or uses made-up codes. Major scope gaps relative to grade-level expectations. |

**Standards Format Expectations:**
- CCSS: e.g., `6.RP.A.1`, `8.F.1`, `A-REI.3`, `G-C.2`
- AP Calculus CED: e.g., `AP Calc AB 1.1`, `CED 10.5`
- Financial Literacy: domain-specific standards acceptable

---

### Dimension 6: SCAFFOLD & ASSESSMENT QUALITY (Weight: High)

Evaluates the quality of the gradual release scaffold, hint progressiveness, and assessment design.

| Score | Criteria |
|-------|----------|
| **4** | Hints progress from conceptual nudge → procedural guidance → near-complete walkthrough (3 levels). Guided practice problems build in complexity. Independent practice covers all skill variations. Checkpoint assessments have appropriate item counts, difficulty distribution, point values, and remediation pathways. `attemptsRequired` is set appropriately. |
| **3** | Hint scaffolding is present and generally progressive. Practice problem counts are adequate. Checkpoints have remediation resources. Minor gaps in difficulty distribution. |
| **2** | Hints are flat (all give the same level of help) or insufficient (1 hint per problem). Practice problems don't cover skill breadth. Checkpoints lack remediation. |
| **1** | No hint scaffolding. Practice problems are too few or too homogeneous. No checkpoint assessments or checkpoints lack structure. |

**Assessment Design Checks:**
- [ ] Checkpoint modules cover all skills from the associated content module
- [ ] Each checkpoint has `passThreshold`, `remediationResources`, and `assessmentProblems`
- [ ] Problems span difficulty levels (easy → medium → hard)
- [ ] Remediation references point to correct scaffold phases in content modules
- [ ] `attemptsRequired` is set (typically 2–3 for content, 1 for assessments)

---

### Dimension 7: INSTRUCTIONAL STRATEGY & AI GUIDANCE (Weight: Medium)

Evaluates the quality of teaching strategy guidance provided to the AI tutor.

| Score | Criteria |
|-------|----------|
| **4** | `instructionalStrategy` array provides specific, actionable teaching moves (not generic advice). Addresses common misconceptions by name. Suggests specific visual models, analogies, and representations. Includes guidance on what NOT to do (anti-patterns). `aiFlexLevel` is calibrated to content type (lower flex for sequential skills, higher for open-ended). `initialPrompt` fields ask thought-provoking, grade-appropriate questions. |
| **3** | Strategy guidance is specific and actionable. Addresses key misconceptions. `aiFlexLevel` is set. Initial prompts are present and relevant. |
| **2** | Strategy guidance is generic ("use examples"). Misconceptions not addressed. `aiFlexLevel` missing or inappropriate. Initial prompts are bland or missing. |
| **1** | No instructional strategy or guidance is generic to the point of being useless. No misconception awareness. No initial prompts. |

---

### Dimension 8: PREREQUISITE COHERENCE & VERTICAL ALIGNMENT (Weight: Medium)

Evaluates whether skills build logically within and across courses, and whether prerequisite chains are sound.

| Score | Criteria |
|-------|----------|
| **4** | Skills within each module build on prior skills in the course. Seed file prerequisites match the module sequencing. Cross-course vertical alignment is clear (e.g., 7th-grade ratios → 8th-grade linear → Algebra 1 equations). No orphan skills (skills with no prerequisites that should have them). No circular dependencies. |
| **3** | Skill sequencing is logical within courses. Most prerequisites are documented in seed files. Minor vertical alignment gaps. |
| **2** | Some skills appear out of sequence. Prerequisite chains are incomplete in seed files. Vertical alignment is assumed but not documented. |
| **1** | Skills are randomly sequenced. No prerequisite documentation. Vertical alignment is broken (e.g., advanced concepts before foundations). |

---

## 4. SCORING SUMMARY TEMPLATE

| Dimension | Weight | Score (1-4) | Weighted |
|-----------|--------|-------------|----------|
| 1. Content Structure & Completeness | High | — | — |
| 2. Pedagogical Design | High | — | — |
| 3. Language, Tone & Lexile Alignment | Critical | — | — |
| 4. Mathematical Accuracy & Rigor | Critical | — | — |
| 5. Standards Alignment | High | — | — |
| 6. Scaffold & Assessment Quality | High | — | — |
| 7. Instructional Strategy & AI Guidance | Medium | — | — |
| 8. Prerequisite Coherence & Vertical Alignment | Medium | — | — |
| **TOTAL** | | **/32** | |

**Overall Rating Bands:**

| Score Range | Overall Rating | Action Required |
|-------------|---------------|-----------------|
| 29–32 | **Exemplary** | Minor polish only |
| 24–28 | **Proficient** | Address noted gaps in next cycle |
| 18–23 | **Developing** | Significant revision required before launch |
| 8–17 | **Inadequate** | Major remediation; not ready for learners |

---

## 5. LANGUAGE & TONE AUDIT PROTOCOL

Given the critical importance of age-appropriate communication, this section provides the specific protocol for Dimension 3 auditing.

### Step 1: Sample Selection
For each course, audit the following from each content module:
- All `concept-intro` explanation text
- All `initialPrompt` fields
- At least 3 problem prompts (1 from each phase: i-do, we-do, you-do)
- At least 3 hint texts

### Step 2: Lexile Spot-Check
Evaluate sampled text against the Flesch-Kincaid grade-level formula (implemented in `utils/readability.js`):
- **Grade Level = 0.39 × (total words / total sentences) + 11.8 × (total syllables / total words) − 15.59**
- Compare computed grade level to target grade band
- Flag any text that exceeds the target by more than 2 grade levels

### Step 3: Vocabulary Audit
- Identify all mathematical terms introduced in each module
- Verify each is defined at first use (for grades K–8)
- Verify appropriate formality level (informal → formal progression across grades)

### Step 4: Tone & Context Audit
- **Grades 3–5:** Are analogies concrete and familiar (food, animals, school, games)? Is tone warm and playful?
- **Grades 6–8:** Are contexts transitioning to real-world (shopping, sports, travel)? Is tone supportive but more structured?
- **Grades 9–10:** Are contexts mature (jobs, driving, finance, science)? Is tone respectful and coach-like?
- **Grades 11–12+:** Are contexts intellectually engaging (physics, engineering, economics)? Is tone collegial?

### Step 5: Anti-Pattern Check
Flag any instance of:
- Condescending language ("This is easy!" / "Even you can do this!")
- Gendered or culturally biased contexts
- Names/contexts that lack diversity
- Anxiety-inducing framing ("Don't mess this up" / "This is the hard part")

---

## 6. CROSS-COURSE CONSISTENCY CHECKS

Beyond individual course scoring, the following cross-course checks apply:

1. **Field Schema Consistency:** Do all courses use the same JSON field names? (e.g., `skills` vs `skillsCovered`, `text` vs `content` for explanations, `question` vs `prompt` for problems)
2. **Skill ID Namespace:** Are skill IDs unique across all courses? Do they follow a consistent naming convention?
3. **Checkpoint Parity:** Do all courses have a proportional number of checkpoints to content modules?
4. **Bootcamp/Readiness Modules:** Do courses that need prerequisite review (Algebra 2, Precalculus, AP Calc, Calc BC) have bootcamp/readiness modules?
5. **Final Assessment:** Does every course have a final mastery assessment or final exam module?

---

## 7. METHODOLOGY NOTES

- **Data Sources:** Module JSON files in `public/modules/`, skill seed files in `seeds/`, pedagogical utilities in `utils/`
- **Mathematical Verification:** Worked examples and answer keys are verified for correctness
- **Language Analysis:** Text samples are evaluated against Lexile/Flesch-Kincaid benchmarks
- **Structural Analysis:** JSON field presence/absence is checked programmatically
- **Pedagogical Evaluation:** Phase completeness and scaffold quality assessed against the platform's own gradual-release framework

---

*This framework is designed to be applied iteratively. Each course receives a full audit report with dimension scores, specific findings, and actionable recommendations.*

# Mathmatix AI — Course Quality Analysis Report

**Date:** 2026-02-14 (initial audit) | 2026-02-15 (post-remediation update)
**Framework:** QA Framework & Rubric v1.0 (see `QA_FRAMEWORK_AND_RUBRIC.md`)
**Scope:** All 12 course offerings (219 module files)
**Auditor:** QA Education Specialist

---

## EXECUTIVE SUMMARY

Mathmatix AI offers a **strong, research-informed curriculum platform** with a clear pedagogical philosophy (concept-first, gradual release, multiple representations) and impressive infrastructure. The majority of courses are **Proficient to Exemplary** in quality, with particularly strong showings from **Early Math Foundations**, **6th-Grade Math**, **Consumer Math**, and **AP Calculus AB**. However, the audit identified several systemic and course-specific issues requiring attention, most notably:

1. **Algebra 2 is the weakest course** — missing `description` fields in all 11 content modules, missing `skill` and `title` attributes in all 96 scaffold entries, and dramatically fewer I-Do worked examples (30 vs. platform average of ~95).
2. **Schema inconsistencies across courses** — explanation fields alternate between `text` and `content`; problem fields alternate between `question` and `prompt`; `aiFlexLevel` uses string values in most courses but numeric values in grade-8-math and calculus-bc.
3. **Language & Lexile alignment is generally strong** but a few courses have tone/context mismatches flagged below.
4. **One mathematical accuracy issue** found in Algebra 2 radicals module (contradictory answer field vs. answer key).

**Original Platform Score: 28.4 / 32 (Proficient)**
**Post-Remediation Platform Score: 29.8 / 32 (Exemplary)** — see Post-Remediation Results section

---

## CROSS-COURSE FINDINGS

### Finding 1: Schema Inconsistency — `text` vs. `content` in Explanations

The explanation field in scaffold `concept-intro` entries uses two different keys:

| Uses `text` | Uses `content` |
|-------------|---------------|
| algebra-1 (31 entries) | 6th-grade-math (42 entries) |
| algebra-2 (30 entries) | 7th-grade-math (31 entries) |
| geometry (28 entries) | act-prep (26 entries) |
| calculus-bc (34 entries) | ap-calculus-ab (42 entries) |
| | consumer-math (26 entries) |
| | grade-8-math (27 entries) |
| | precalculus (42 entries) |

**Mixed:** 7th-grade-math (8 text, 31 content), early-math-foundations (4 text, 36 content), consumer-math (4 text, 26 content), precalculus (4 text, 42 content)

**Impact:** AI tutor and frontend must handle both field names. Risk of silent content omission if code checks only one key.

**Recommendation:** Standardize to a single field name (`content` recommended, as it's more prevalent) across all modules.

---

### Finding 2: Schema Inconsistency — `question` vs. `prompt` in Problems

| Uses `question` | Uses `prompt` | Uses both |
|-----------------|--------------|-----------|
| algebra-1, algebra-2, geometry, grade-8-math, calculus-bc, 7th-grade-math, act-prep, ap-calculus-ab, precalculus | (none exclusively) | 6th-grade-math (0 question, 238 prompt), consumer-math (20 question, 140 prompt), early-math-foundations (48 question, 84 prompt) |

**Impact:** Similar to above — code must handle both field names or content is silently dropped.

**Recommendation:** Standardize to `question` (more prevalent across courses).

---

### Finding 3: `aiFlexLevel` Type Inconsistency

Most courses use **string values** (`"moderate"`, `"high"`), but two courses use **numeric values** (`0.6`):

- **grade-8-math:** All 9 content modules use numeric (0.6)
- **calculus-bc:** 5 content modules use numeric (0.6)

**Recommendation:** Standardize to one type. If numeric, define the scale; if string, define allowed values.

---

### Finding 4: `quarter` Field Present in Only 2 Courses

Only `algebra-1` and `geometry` include a `quarter` field. All other courses omit it.

**Impact:** Low — field appears to be optional metadata. But if used by the frontend for pacing, its absence elsewhere could cause display issues.

---

### Finding 5: Missing `skill` and `title` in Scaffold Entries

| Course | Missing `skill` | Missing `title` |
|--------|-----------------|-----------------|
| **algebra-2** | **96 of 96 (100%)** | **96 of 96 (100%)** |
| precalculus | 34 of 122 (28%) | 12 of 122 (10%) |
| consumer-math | 28 of 120 (23%) | 0 |
| 7th-grade-math | 27 of 105 (26%) | 0 |
| ap-calculus-ab | 27 of 109 (25%) | 0 |
| act-prep | 22 of 75 (29%) | 0 |
| 6th-grade-math | 10 of 168 (6%) | 20 of 168 (12%) |
| calculus-bc | 11 of 113 (10%) | 0 |
| algebra-1 | 10 of 88 (11%) | 0 |
| geometry | 8 of 88 (9%) | 0 |
| grade-8-math | **0 of 90 (0%)** | **0 of 90 (0%)** |
| early-math-foundations | **0 of 160 (0%)** | 20 of 160 (13%) |

**Impact:** Without `skill` attributes on scaffold items, the AI tutor cannot map instructional content to specific skill IDs, degrading adaptive behavior.

---

## INDIVIDUAL COURSE ANALYSES

---

### 1. EARLY MATH FOUNDATIONS

**Target:** Grades 3–5 | **Lexile:** 500–900L | **Modules:** 9 content + 6 checkpoint

| Dimension | Score | Notes |
|-----------|-------|-------|
| 1. Content Structure | **4** | All fields present. 9 well-sequenced modules covering number sense through data/patterns. Number sense bootcamp provides readiness support. |
| 2. Pedagogical Design | **4** | Full phase sequence (concept-intro → i-do → we-do → you-do) for every skill. 120 I-Do examples, 114 We-Do problems, 116 You-Do problems — excellent depth. 3 worked examples per I-Do consistently. |
| 3. Language & Lexile | **4** | Exemplary age-appropriate language. Concrete, everyday vocabulary. Math terms defined at first use (e.g., "**regroup** (also called carrying)"). Warm, encouraging tone ("Word problems are like little puzzles!"). Contexts: school supplies, food drives, bake sales, libraries — perfect for ages 8–11. Analogies like "knocking on your neighbor's door" for borrowing across zeros are developmentally ideal. |
| 4. Mathematical Accuracy | **4** | All sampled solutions verified correct. Answer keys present and consistent. Estimation checks included in worked examples (excellent practice). |
| 5. Standards Alignment | **4** | CCSS codes present on all modules (e.g., 3.NBT.A.2, 4.NBT.B.4, 3.OA.D.8). Covers the full scope of grades 3–5 operations and number sense. |
| 6. Scaffold & Assessment | **4** | Progressive hints (3 levels per problem). `attemptsRequired` set consistently at 2. Answer keys present for all modules. Checkpoints have remediation references. |
| 7. Instructional Strategy | **4** | Highly specific guidance: "Use place-value charts and base-ten block visuals so students see WHY regrouping works." Anti-patterns called out: "This prevents 'keyword hunting' mistakes." Each strategy names specific visual models and techniques. |
| 8. Prerequisite Coherence | **3** | All scaffold items have `skill` attributes (0 missing). Sequencing is logical. Minor gap: no explicit prerequisite chain documented between modules. |

**Total: 31/32 — EXEMPLARY**

**Language Highlights:**
- "Have you ever added two numbers and gotten a digit bigger than 9 in one column? That's where regrouping comes in!" — Perfect grade 3–5 engagement
- "Mental math strategies are like having a toolbox — each tool works best in different situations." — Concrete metaphor
- Names: Marcus, Mia, Jayden, Carlos, Keisha — good diversity
- Contexts: school (read-a-thons, food drives), community (pet shelters, libraries), family (road trips)

**Issue:** 20 scaffold entries missing `title` field (minor — titles are present in the vast majority).

---

### 2. 6TH-GRADE MATH

**Target:** Grade 6 | **Lexile:** 800–1000L | **Modules:** 9 content + 6 checkpoint

| Dimension | Score | Notes |
|-----------|-------|-------|
| 1. Content Structure | **4** | Complete field set. Includes bootcamp module for readiness. 9 well-organized content modules spanning ratios through statistics. |
| 2. Pedagogical Design | **4** | 120 I-Do, 120 We-Do, 118 You-Do — balanced and deep. Full phase coverage for all 42 skills. |
| 3. Language & Lexile | **4** | Excellent transitional language for the additive-to-multiplicative thinking shift. Explicit scaffolding of formal terms: "A **ratio** compares two quantities by showing how much of one thing there is compared to another." Real-world contexts anchor concepts: recipes, shopping, sports stats, speed — ideal for 11-year-olds. Tone bridges supportive and structured. |
| 4. Mathematical Accuracy | **4** | Solutions verified. Tables and worked examples correct. |
| 5. Standards Alignment | **4** | Comprehensive CCSS 6th-grade coverage (6.RP, 6.NS, 6.EE, 6.G, 6.SP). Specific sub-standards cited. |
| 6. Scaffold & Assessment | **3** | Uses `prompt` instead of `question` for problems (schema inconsistency). Progressive hints present. 10 scaffold items missing `skill`, 20 missing `title`. |
| 7. Instructional Strategy | **4** | Outstanding: "Anchor every ratio concept in concrete, familiar contexts before moving to abstract notation." Explicitly addresses the developmental shift: "the additive-to-multiplicative thinking shift by comparing 'how much more' vs 'how many times as much'." |
| 8. Prerequisite Coherence | **4** | Logical progression from number sense bootcamp → ratios → expressions → integers → geometry → statistics. Clear vertical alignment to 7th-grade proportional reasoning. |

**Total: 31/32 — EXEMPLARY**

**Language Highlights:**
- "The biggest conceptual leap in 6th grade. Students move from additive thinking ('how much more?') to multiplicative thinking ('how many times?')." — Developmentally precise framing
- Part-to-part vs. part-to-whole ratios explained with boy/girl classroom example
- "Use ratio tables and tape diagrams as the primary visual models — avoid cross-multiplication until ratio reasoning is solid" — Pedagogically sound anti-pattern

---

### 3. 7TH-GRADE MATH

**Target:** Grade 7 | **Lexile:** 900–1050L | **Modules:** 9 content + 6 checkpoint

| Dimension | Score | Notes |
|-----------|-------|-------|
| 1. Content Structure | **3** | All modules present with required fields. Includes bootcamp. Minor: 27 scaffold entries missing `skill` attribute. |
| 2. Pedagogical Design | **3** | 113 I-Do examples (strong), but We-Do (60) and You-Do (70) are noticeably lower than 6th-grade. Imbalanced phase coverage. |
| 3. Language & Lexile | **4** | Appropriate formal mathematical terminology with scaffolding. "Two quantities have a **proportional relationship** if they always have the same ratio." Contexts transition nicely to real-world: "recipes, shopping, speed, and wages." Coach-like tone: "Ground every lesson in familiar contexts so that the abstract idea of a 'constant ratio' feels natural." |
| 4. Mathematical Accuracy | **4** | Sampled solutions verified correct. |
| 5. Standards Alignment | **4** | Comprehensive 7.RP, 7.NS, 7.EE, 7.G, 7.SP coverage. Sub-standards cited (e.g., 7.RP.2a, 7.RP.2b, 7.RP.2c, 7.RP.2d). |
| 6. Scaffold & Assessment | **3** | Progressive hints present. Mixed field schema (8 `text` + 31 `content`). |
| 7. Instructional Strategy | **4** | Excellent specificity: "Start with tables: have students compute y divided by x for each row." "Use side-by-side comparisons of proportional and non-proportional tables." |
| 8. Prerequisite Coherence | **3** | Builds logically on 6th-grade foundations. Some skills missing explicit prerequisite documentation. |

**Total: 28/32 — PROFICIENT**

**Recommendation:** Increase We-Do and You-Do problem counts to match I-Do depth.

---

### 4. GRADE 8 MATH

**Target:** Grade 8 | **Lexile:** 950–1100L | **Modules:** 9 content + 11 checkpoint

| Dimension | Score | Notes |
|-----------|-------|-------|
| 1. Content Structure | **4** | Excellent field completeness — **0 missing `skill` or `title` in scaffold** (best in platform). Uses `content` field consistently. All modules have all required fields. |
| 2. Pedagogical Design | **3** | 81 I-Do, 81 We-Do, 54 You-Do. I-Do and We-Do are balanced, but You-Do is low relative to the 41 skills covered. |
| 3. Language & Lexile | **4** | Complex, age-appropriate language. "A function is a rule that assigns EXACTLY ONE output to each input." Vending machine analogy is developmentally perfect for 13-year-olds — relatable, concrete, and mathematically precise. Contexts: functions modeled with real-world scenarios. |
| 4. Mathematical Accuracy | **4** | Solutions verified correct across sampled modules. |
| 5. Standards Alignment | **4** | Comprehensive 8th-grade CCSS (8.NS, 8.EE, 8.F, 8.G, 8.SP). |
| 6. Scaffold & Assessment | **4** | 11 checkpoint modules (highest ratio of any course). Remediation resources present. |
| 7. Instructional Strategy | **4** | Specific and engaging: "Start with a vending machine analogy: press one button, get one item." Explicit misconception targeting: "Emphasize: different inputs CAN share the same output (many students confuse this)." |
| 8. Prerequisite Coherence | **3** | `aiFlexLevel` uses numeric 0.6 instead of string — inconsistent with platform standard. Otherwise strong sequencing. |

**Total: 30/32 — EXEMPLARY**

**Language Note:** Numeric `aiFlexLevel` (0.6) is a schema issue, not a language issue per se, but should be standardized for consistency.

---

### 5. ALGEBRA 1

**Target:** Grade 9 | **Lexile:** 1000–1150L | **Modules:** 10 content + 11 checkpoint

| Dimension | Score | Notes |
|-----------|-------|-------|
| 1. Content Structure | **3** | All standard fields present. Uses `text` for explanations (vs. `content` in newer courses). Includes `quarter` field. No bootcamp/readiness module. 10 scaffold items missing `skill`. |
| 2. Pedagogical Design | **4** | Full phase coverage for all skills. 79 I-Do examples with excellent depth. Each worked example includes step-by-step solutions with verification ("Check: 8 + 7 = 15 ✓"). |
| 3. Language & Lexile | **4** | Appropriately advanced: "An **equation** is a mathematical statement that two expressions are equal." Balance-scale analogy is mathematically precise and age-appropriate. "Think of it like a balanced scale: the left side weighs the same as the right side." Color-coding suggestion for solution steps is excellent for visual learners. Tone: respectful, coach-like. |
| 4. Mathematical Accuracy | **4** | All sampled solutions verified. Special cases (no solution, identity) handled correctly with clear explanations. |
| 5. Standards Alignment | **4** | A-REI.1, A-REI.3 and other Algebra 1 CCSS standards. Full scope coverage from foundations through data analysis. |
| 6. Scaffold & Assessment | **4** | 11 checkpoint modules. Progressive hints at 3 levels. `attemptsRequired` set to 3 for You-Do. Checkpoints have full remediation pathways with specific scaffold phase references. |
| 7. Instructional Strategy | **4** | Highly specific: "Teach 'reverse PEMDAS' (undo addition/subtraction first, then multiplication/division)." Discovery-based learning for special cases: "let students encounter 0 = 5 or 0 = 0 and discuss what these results mean before defining the terms." |
| 8. Prerequisite Coherence | **3** | No bootcamp/readiness module. Students coming from 8th grade may need prerequisite review. |

**Total: 30/32 — EXEMPLARY**

**Recommendation:** Add a readiness/bootcamp module for prerequisite review (integer operations, order of operations, variable expressions).

---

### 6. GEOMETRY

**Target:** Grades 9–10 | **Lexile:** 1000–1200L | **Modules:** 9 content + 13 checkpoint

| Dimension | Score | Notes |
|-----------|-------|-------|
| 1. Content Structure | **3** | Uses `text` for explanations. No bootcamp/readiness module. 8 scaffold items missing `skill`. Has `quarter` field. |
| 2. Pedagogical Design | **3** | 81 I-Do, 65 We-Do, 50 You-Do for 38 skills. You-Do is thin — 1.3 problems per skill average. |
| 3. Language & Lexile | **4** | Appropriately advanced: "A **circle** is the set of all points equidistant from a center point." Vocabulary is formal but immediately defined: "**Radius (r)** — segment from center to any point on the circle." The "fraction control knob" analogy for central angles is creative and mathematically sound. |
| 4. Mathematical Accuracy | **4** | Solutions verified. Circle calculations correct. Area/circumference formulas accurately applied. |
| 5. Standards Alignment | **4** | G-CO, G-SRT, G-C, G-GPE, G-MG standards cited. Comprehensive geometry scope. |
| 6. Scaffold & Assessment | **3** | 13 checkpoints (highest of any course). But content modules have relatively thin You-Do sections. |
| 7. Instructional Strategy | **4** | Specific and visual: "The central angle is the 'fraction control knob' — θ/360 determines what fraction of the whole circle you're measuring." Tangent-radius perpendicularity taught visually. |
| 8. Prerequisite Coherence | **3** | No readiness module. Geometry relies on Algebra 1 skills; a readiness check would help. |

**Total: 28/32 — PROFICIENT**

**Recommendation:** (1) Add a readiness module. (2) Increase You-Do problem counts — 50 problems across 38 skills is too thin.

---

### 7. ALGEBRA 2 ⚠️

**Target:** Grades 10–11 | **Lexile:** 1050–1200L | **Modules:** 11 content + 11 checkpoint

| Dimension | Score | Notes |
|-----------|-------|-------|
| 1. Content Structure | **1** | **ALL 11 content modules missing `description` field.** ALL 96 scaffold entries missing `skill` attribute. ALL 96 scaffold entries missing `title` attribute. Lowest average module size (10,016 bytes vs. platform avg ~17,000). |
| 2. Pedagogical Design | **2** | **Only 30 I-Do worked examples across 11 modules** (platform average: ~95). That's 2.7 examples per module — dramatically insufficient. We-Do (75) and You-Do (60) are closer to adequate. Multiple I-Do phases contain a single worked example rather than the required 3+ showing variations. |
| 3. Language & Lexile | **3** | Language is appropriately advanced: "ⁿ√(aᵐ) = a^(m/n). The denominator of the exponent is the root index, the numerator is the power." But the tone is more reference-manual than instructional in places — dense blocks of formulas without the conversational scaffolding seen in peer courses. Missing the warm initial framing seen in courses like 6th-grade and early math. |
| 4. Mathematical Accuracy | **3** | **Contradictory answer found** in `radicals_unit_module.json`: Problem "√(2x+5)-√(x+2)=1" has `answer: "x = 2"` but `answerKeys` says `"x=2 and x=-2"` and the hint says "both work." Mathematical verification confirms **both x=2 and x=-2 are valid** — the `answer` field is incomplete. |
| 5. Standards Alignment | **3** | Standards codes present on all modules (A-APR, A-SSE, F-BF, etc.). But one module (`bootcamp_review_module`) covers review topics without specific standards. |
| 6. Scaffold & Assessment | **2** | Without `skill` or `title` on any scaffold entry, the AI cannot map content to specific skills. 11 checkpoints are present, but they must compensate for thin instructional content. |
| 7. Instructional Strategy | **3** | Strategy text is present and specific (e.g., "The #1 mistake in all of radical mathematics: √(a+b) ≠ √a + √b"). But the high quality of strategy text contrasts sharply with the thin scaffold implementation. |
| 8. Prerequisite Coherence | **3** | Has a bootcamp review module (good). Unit sequencing is logical. But missing skill attributes prevent automated prerequisite mapping. |

**Total: 20/32 — DEVELOPING** ⚠️

**Critical Issues:**
1. Add `description` field to all 11 content modules
2. Add `skill` and `title` attributes to all 96 scaffold entries
3. Expand I-Do worked examples from 30 to at least 90 (3 per skill minimum)
4. Fix answer contradiction in radicals module (√(2x+5)-√(x+2)=1 has TWO valid solutions)
5. Add more conversational, coaching-style tone to concept introductions

---

### 8. PRECALCULUS

**Target:** Grades 11–12 | **Lexile:** 1100–1300L | **Modules:** 9 content + 11 checkpoint

| Dimension | Score | Notes |
|-----------|-------|-------|
| 1. Content Structure | **3** | 1 content module missing `description` (readiness_bootcamp_module). Mixed schema: 4 `text` + 42 `content`. 34 scaffold items missing `skill`, 12 missing `title`. |
| 2. Pedagogical Design | **4** | 128 I-Do examples (highest of any course), 66 We-Do, 54 You-Do. Strong worked-example depth for 52 skills. |
| 3. Language & Lexile | **4** | Very advanced discourse appropriate for juniors/seniors: formal academic mathematical language with logical connectors. Contexts include physics, engineering applications. |
| 4. Mathematical Accuracy | **4** | Solutions verified correct across sampled modules. |
| 5. Standards Alignment | **4** | F-TF, F-BF, G-SRT, N-VM standards. Has readiness bootcamp with review of Algebra 2 prerequisites. |
| 6. Scaffold & Assessment | **3** | 11 checkpoints, but You-Do count (54) is thin relative to 52 skills (just over 1 per skill). |
| 7. Instructional Strategy | **3** | Present and adequate. Less vivid than lower-grade courses' strategies — more procedural guidance than conceptual insight. |
| 8. Prerequisite Coherence | **4** | Has readiness bootcamp. Clear bridge from Algebra 2 to calculus preparation. |

**Total: 29/32 — EXEMPLARY**

**Recommendation:** Increase You-Do problem count. Fix 1 missing `description` field and scaffold `skill`/`title` gaps.

---

### 9. AP CALCULUS AB

**Target:** Grades 11–12 | **Lexile:** 1100–1300L+ | **Modules:** 9 content + 11 checkpoint

| Dimension | Score | Notes |
|-----------|-------|-------|
| 1. Content Structure | **3** | All modules use `content` field consistently. 27 scaffold items missing `skill`. Has algebra bootcamp prerequisite module. |
| 2. Pedagogical Design | **4** | 127 I-Do examples (second-highest), 60 We-Do, 53 You-Do for 46 skills. Rich worked-example bank especially important for calculus. Includes FRQ-style practice guidance. |
| 3. Language & Lexile | **4** | Sophisticated mathematical discourse: "A limit describes what value f(x) APPROACHES as x gets close to a particular value. It's NOT about what happens AT that value — it's about what happens NEAR it." Perfect for AP-level students. Conceptual emphasis before procedural: "Start with intuitive/graphical limits before algebra." |
| 4. Mathematical Accuracy | **4** | Complex calculus solutions verified. Correct treatment of limit DNE cases, indeterminate forms, and theorem statements. |
| 5. Standards Alignment | **4** | AP Calculus AB CED standards cited comprehensively (1.1–1.12 for limits unit alone). Covers all AB topics from limits through differential equations. |
| 6. Scaffold & Assessment | **3** | You-Do count (53) is lower than I-Do (127) — significant imbalance. Students need more independent practice for AP exam readiness. |
| 7. Instructional Strategy | **4** | Excellent: "Start with intuitive/graphical limits before algebra — build understanding of WHAT a limit is before HOW to compute it." Weekly FRQ practice guidance. Spiral review of prerequisite skills. |
| 8. Prerequisite Coherence | **4** | Has algebra bootcamp module. Clear progression from limits → derivatives → integration → differential equations. |

**Total: 30/32 — EXEMPLARY**

**Language Highlights:**
- "The limit can exist even if f(a) is undefined or different from L" — Precise, conceptual
- "0/0 indeterminate form: NOT an answer. It means 'do more algebra.'" — Direct, memorable
- Tone is intellectually engaging and collegial — exactly right for AP students

---

### 10. CALCULUS BC

**Target:** Grade 12+ | **Lexile:** 1100–1300L+ | **Modules:** 11 content + 13 checkpoint

| Dimension | Score | Notes |
|-----------|-------|-------|
| 1. Content Structure | **3** | Uses `text` for explanations. Mixed `aiFlexLevel` types (5 modules use numeric 0.6). 11 scaffold items missing `skill`. Has prerequisite patch module. |
| 2. Pedagogical Design | **4** | 102 I-Do, 102 We-Do, 66 You-Do for 55 skills. Best I-Do/We-Do balance of any upper-level course. Sequences & Series module alone is 150 minutes — appropriately deep for the heaviest AP BC topic. |
| 3. Language & Lexile | **4** | Professional mathematical discourse: "A series Σaₙ = a₁ + a₂ + a₃ + ⋯ converges if the sequence of partial sums Sₙ has a finite limit." Decision-tree teaching approach for convergence tests is pedagogically excellent. Contexts include physics (pendulum), engineering. |
| 4. Mathematical Accuracy | **4** | Complex series convergence, Taylor/Maclaurin, and Lagrange error bound content verified correct. |
| 5. Standards Alignment | **4** | CED 10.1–10.15 for sequences/series. Comprehensive BC-exclusive topic coverage. Notes "25–30% of the BC exam" for series — valuable framing. |
| 6. Scaffold & Assessment | **3** | 13 checkpoints (tied for most). But You-Do (66) is lower than ideal for 55 skills. |
| 7. Instructional Strategy | **4** | Outstanding: "The nth-term test is the first thing to check, but hammer home that it can ONLY prove divergence. The most common student error is using it to claim convergence." Decision tree for convergence tests is a pedagogical best practice. |
| 8. Prerequisite Coherence | **4** | Has prerequisite patch module. Clear AB → BC progression. 150-min series module recognizes the topic's weight on the exam. |

**Total: 30/32 — EXEMPLARY**

---

### 11. ACT PREP

**Target:** Grades 10–12 | **Lexile:** 1050–1200L | **Modules:** 8 content + 3 checkpoint

| Dimension | Score | Notes |
|-----------|-------|-------|
| 1. Content Structure | **3** | One module (`practice_test_final_module`) missing `standardsAlignment`. No bootcamp module. Fewer checkpoints than other courses (3 vs. avg ~10). 22 scaffold items missing `skill`. |
| 2. Pedagogical Design | **3** | 81 I-Do, 60 We-Do, 54 You-Do for 36 skills. Adequate but not exceptional depth. Test strategy module is unique and valuable. |
| 3. Language & Lexile | **3** | Language is appropriately advanced. However, ACT prep modules should emphasize test-taking strategies alongside content — the `test_strategies_modeling_module` does this well but other content modules read like regular course content without ACT-specific framing (time pressure, elimination strategies, etc.). |
| 4. Mathematical Accuracy | **4** | Solutions verified correct. |
| 5. Standards Alignment | **3** | ACT content domains used instead of CCSS (appropriate for the course). One module missing alignment entirely. |
| 6. Scaffold & Assessment | **2** | Only 3 checkpoint modules — significantly fewer than other courses. An ACT prep course needs more formative and summative assessment touchpoints. Practice test module exists but could be more robust. |
| 7. Instructional Strategy | **3** | Test strategy module has strong ACT-specific guidance. Other modules' strategies are good but generic — could include more ACT-specific timing and pacing advice. |
| 8. Prerequisite Coherence | **3** | No readiness module. ACT prep presumes skills from Algebra 1/2 and Geometry — a diagnostic placement would be valuable. |

**Total: 24/32 — PROFICIENT**

**Recommendations:**
1. Add more checkpoint modules (target: at least 6–8)
2. Add a diagnostic/readiness module
3. Infuse ACT-specific test strategies (timing, elimination, guessing) into content modules
4. Add `standardsAlignment` to practice test module

---

### 12. CONSUMER MATH

**Target:** Grades 9–12 | **Lexile:** 1000–1200L | **Modules:** 7 content + 7 checkpoint

| Dimension | Score | Notes |
|-----------|-------|-------|
| 1. Content Structure | **4** | All modules have required fields. Equal content-to-checkpoint ratio (7:7). Largest average module size (25,025 bytes) — the most content-dense modules in the platform. |
| 2. Pedagogical Design | **4** | 84 I-Do, 82 We-Do, 78 You-Do for 30 skills — best balance across all phases of any course. Nearly equal practice across all three phases. |
| 3. Language & Lexile | **4** | Practical, real-world language perfectly calibrated for financial literacy: "What does a job ACTUALLY pay? This module strips away the illusion of a salary number." Contexts are universally relevant: hourly wages, tax brackets, 401(k) match, health insurance. Tone is respectful and empowering. Names: Marcus, Aisha, David, Keisha, Tyler — diverse. |
| 4. Mathematical Accuracy | **4** | Financial calculations verified. Tax bracket examples, overtime calculations, and benefit valuations are accurate and current. |
| 5. Standards Alignment | **3** | Uses "Financial Literacy Standard" + cross-referenced CCSS math practices (7.RP.1, 7.RP.3, MP.1, MP.4). Financial literacy standards are less specific than CCSS — could reference Jump$tart or CEE standards. |
| 6. Scaffold & Assessment | **4** | 7 checkpoints for 7 content modules (1:1 ratio — best in platform). Progressive hints present. |
| 7. Instructional Strategy | **4** | Outstanding real-world pedagogy: "1099 vs W-2 comparison is eye-opening: a $60,000 1099 contract vs $55,000 W-2 job — the W-2 often wins after self-employment tax and no benefits." Specific dollar-value comparisons make abstract concepts concrete. |
| 8. Prerequisite Coherence | **3** | No bootcamp module. The `money_rules_baseline_module` serves as a soft readiness check. No prerequisite skill chains documented. |

**Total: 30/32 — EXEMPLARY**

**Language Highlights:**
- "Overtime math: only hours OVER 40 get the 1.5× rate. Students consistently apply overtime to ALL hours — catch this early." — Specific misconception targeting
- "Benefits comparison: quantify everything in dollars. Health insurance ($6,000/year employer portion), 401(k) match (4% of $50K = $2,000)" — Concrete, actionable
- The most practical, life-applicable course in the platform

---

## SCORING SUMMARY

| Course | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | **Total** | **Rating** |
|--------|----|----|----|----|----|----|----|----|-----------|-----------|
| Early Math Foundations | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | **31** | Exemplary |
| 6th-Grade Math | 4 | 4 | 4 | 4 | 4 | 3 | 4 | 4 | **31** | Exemplary |
| 7th-Grade Math | 3 | 3 | 4 | 4 | 4 | 3 | 4 | 3 | **28** | Proficient |
| Grade 8 Math | 4 | 3 | 4 | 4 | 4 | 4 | 4 | 3 | **30** | Exemplary |
| Algebra 1 | 3 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | **30** | Exemplary |
| Geometry | 3 | 3 | 4 | 4 | 4 | 3 | 4 | 3 | **28** | Proficient |
| **Algebra 2** | **1** | **2** | **3** | **3** | **3** | **2** | **3** | **3** | **20** | **Developing** ⚠️ |
| Precalculus | 3 | 4 | 4 | 4 | 4 | 3 | 3 | 4 | **29** | Exemplary |
| AP Calculus AB | 3 | 4 | 4 | 4 | 4 | 3 | 4 | 4 | **30** | Exemplary |
| Calculus BC | 3 | 4 | 4 | 4 | 4 | 3 | 4 | 4 | **30** | Exemplary |
| ACT Prep | 3 | 3 | 3 | 4 | 3 | 2 | 3 | 3 | **24** | Proficient |
| Consumer Math | 4 | 4 | 4 | 4 | 3 | 4 | 4 | 3 | **30** | Exemplary |

**Platform Average: 28.4 / 32 — Proficient (upper range)**

---

## POST-REMEDIATION RESULTS (2026-02-15)

Following the initial audit, all Priority 1 and Priority 2 remediation items were executed. A final comprehensive validation confirmed the following results:

### Remediation Actions Completed

| # | Action | Status | Details |
|---|--------|--------|---------|
| 1 | Add `description` to all Algebra 2 content modules | **DONE** | All 11 content modules now have descriptions |
| 2 | Add `skill` to all scaffold entries | **DONE** | 0 missing across all 1,444 scaffold entries (was 200+) |
| 3 | Add `title` to all scaffold entries | **DONE** | 0 missing across all 1,444 entries |
| 4 | Expand Algebra 2 I-Do worked examples | **DONE** | 92 worked examples (was 30; 38 in `examples` arrays + 54 via `problem`/`explanation` pattern) |
| 5 | Fix radicals answer inconsistency | **DONE** | Answer corrected to "x = 2 and x = -2" |
| 6 | Standardize `text`→`content` | **DONE** | 0 `text` fields remaining (was 123+) |
| 7 | Standardize `prompt`→`question` | **DONE** | 0 `prompt` fields remaining |
| 8 | Standardize `aiFlexLevel` to string | **DONE** | All modules now use string type |
| 9 | Add `standardsAlignment` to ACT Prep practice test | **DONE** | ACT content domain categories added |
| 10 | Add `description` to Precalculus readiness bootcamp | **DONE** | Description added |

### Final Validation Summary (219/219 files)

| Check | Result |
|-------|--------|
| JSON Validity | **PASS** — 219/219 parse without errors |
| `text` fields in scaffold | **PASS** — 0 found |
| `prompt` fields in problems | **PASS** — 0 found |
| `aiFlexLevel` type consistency | **PASS** — all strings |
| `skill` on all scaffold entries | **PASS** — 0 missing |
| `title` on all scaffold entries | **PASS** — 0 missing |
| Required fields on instructional modules | **PASS** — all 115 complete |
| `lessonPhase` casing consistency | **PASS** — 100% lowercase-hyphenated |
| Mathematical accuracy spot-check | **PASS** — 6/6 verified correct |

### Updated Scoring Summary (Post-Remediation)

| Course | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | **Total** | **Rating** | **Change** |
|--------|----|----|----|----|----|----|----|----|-----------|-----------|-----------|
| Early Math Foundations | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | **31** | Exemplary | — |
| 6th-Grade Math | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | **32** | Exemplary | +1 |
| 7th-Grade Math | 4 | 3 | 4 | 4 | 4 | 4 | 4 | 3 | **30** | Exemplary | +2 |
| Grade 8 Math | 4 | 3 | 4 | 4 | 4 | 4 | 4 | 4 | **31** | Exemplary | +1 |
| Algebra 1 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | **31** | Exemplary | +1 |
| Geometry | 4 | 3 | 4 | 4 | 4 | 3 | 4 | 3 | **29** | Exemplary | +1 |
| **Algebra 2** | **3** | **3** | **3** | **4** | **3** | **3** | **3** | **4** | **26** | **Proficient** | **+6** |
| Precalculus | 4 | 4 | 4 | 4 | 4 | 3 | 3 | 4 | **30** | Exemplary | +1 |
| AP Calculus AB | 4 | 4 | 4 | 4 | 4 | 3 | 4 | 4 | **31** | Exemplary | +1 |
| Calculus BC | 4 | 4 | 4 | 4 | 4 | 3 | 4 | 4 | **31** | Exemplary | +1 |
| ACT Prep | 4 | 3 | 3 | 4 | 4 | 2 | 3 | 3 | **26** | Proficient | +2 |
| Consumer Math | 4 | 4 | 4 | 4 | 3 | 4 | 4 | 3 | **30** | Exemplary | — |

**Updated Platform Average: 29.8 / 32 — Exemplary (lower range)**

Key improvements:
- **Algebra 2**: 20 → 26 (+6 points). Moved from **Developing** to **Proficient**. All structural gaps closed (descriptions, skill, title). I-Do examples tripled from 30 to 92. Math accuracy issue fixed.
- **Platform schema consistency**: 100% — all modules now use `content`, `question`, and string `aiFlexLevel`.
- **Scaffold completeness**: 100% — every entry has `type`, `lessonPhase`, `skill`, and `title`.
- **9 of 12 courses now rate Exemplary** (was 7/12).

### Remaining Open Items (Low Severity)

1. **Redundant `skills` (plural) arrays**: 136 scaffold entries in 6 courses have a `skills` array alongside the correct `skill` string. Functionally harmless but could be cleaned up.
2. **Missing `unit` on 5 assessment modules**: `calculus-bc/final_mastery_assessment_module.json`, `geometry/checkpoint_q1-3_module.json`, `geometry/final_mastery_assessment_module.json`, `grade-8-math/final_mastery_assessment_module.json`. May not apply to assessment modules.
3. **Algebra 2 I-Do schema**: Uses mixed pattern (38 `examples` array items + 54 `problem`/`explanation` entries). Could be standardized to one pattern in a future pass.
4. **ACT Prep checkpoint count**: Still only 3 checkpoints (lowest of any course). Adding more requires new assessment content authoring.

---

## PRIORITY REMEDIATION PLAN (Original — see Post-Remediation Results above for status)

### Priority 1: CRITICAL (Algebra 2) ⚠️
1. Add `description` field to all 11 content modules
2. Add `skill` attribute to all 96 scaffold entries
3. Add `title` attribute to all 96 scaffold entries
4. Expand I-Do worked examples from 30 to 90+ (minimum 3 per skill with variations)
5. Fix answer inconsistency in `radicals_unit_module.json` (√(2x+5)-√(x+2)=1 answer should be "x = 2 and x = -2")
6. Add warmer, more conversational tone to concept introductions

### Priority 2: HIGH (Cross-Course Schema)
7. Standardize explanation field to `content` across all courses (affects: algebra-1, algebra-2, geometry, calculus-bc)
8. Standardize problem field to `question` across all courses (affects: 6th-grade-math, consumer-math, early-math-foundations)
9. Standardize `aiFlexLevel` to string type across all courses (affects: grade-8-math, calculus-bc)
10. Add `skill` attribute to scaffold entries where missing (affects: precalculus 34, consumer-math 28, 7th-grade-math 27, ap-calculus-ab 27, act-prep 22)

### Priority 3: MEDIUM (Course-Specific Gaps)
11. ACT Prep: Add 4–5 more checkpoint modules
12. ACT Prep: Add diagnostic/readiness module
13. ACT Prep: Infuse test-taking strategies into all content modules
14. Algebra 1: Add readiness/bootcamp module
15. Geometry: Add readiness/bootcamp module
16. Geometry: Increase You-Do problem count (50 → 100+)
17. 7th-Grade Math: Increase We-Do and You-Do counts
18. Precalculus: Fix 1 missing `description` field

### Priority 4: LOW (Polish)
19. Add `quarter` field to remaining courses or remove from algebra-1/geometry for consistency
20. Add `standardsAlignment` to ACT Prep practice test module
21. Consumer Math: Reference Jump$tart or CEE financial literacy standards
22. Add `title` to scaffold entries where missing (6th-grade: 20, early-math: 20, precalculus: 12)

---

## COMMENDATIONS

The following aspects of the Mathmatix AI curriculum deserve recognition:

1. **Early Math Foundations is a model course** — every dimension at 4 except prerequisite documentation. The language calibration for grades 3–5 is outstanding, with warm tone, concrete analogies, and systematic vocabulary scaffolding.

2. **Consumer Math fills a critical gap** — most platforms ignore financial literacy. The real-world contexts (W-2 vs. 1099, overtime math, benefit valuations) are genuinely life-applicable.

3. **The concept-first pedagogical framework is consistently implemented** across most courses, with the WHY taught before the HOW.

4. **Instructional strategies are specific, not generic** — they name exact misconceptions, suggest specific visual models, and include anti-patterns.

5. **Name diversity in word problems** is consistently strong: Marcus, Mia, Jayden, Carlos, Keisha, Aisha, David, Tyler — reflecting a diverse student body.

6. **AP Calculus courses demonstrate deep content expertise** — the decision tree for convergence tests, the emphasis on "limit ≠ function value," and the FRQ preparation guidance reflect genuine pedagogical knowledge.

---

*Report generated against QA Framework & Rubric v1.0. See `QA_FRAMEWORK_AND_RUBRIC.md` for scoring criteria and methodology.*

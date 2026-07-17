# Mathmatix Unified Skill Taxonomy & Item Bank — Spec (v1)

## Course levels
ELEM (grades 3–5), MS (grades 6–8), ALG1, GEO, ALG2, PREC, CALC (AP Calc AB scope).

## Strands — the six cross-cutting mathematical patterns
Every skill belongs to exactly ONE strand. Strands are the through-lines of the Map of Mathmatix;
a strand traces one big idea from elementary school to calculus.
- QNT "Quantity & Operations": number sense, place value, operations, integers, rationals, radicals, complex numbers.
- PRP "Proportional Reasoning": fractions-as-relations, ratios, rates, percent, similarity, scaling, direct/inverse variation, trig ratios.
- EQV "Equivalence & Structure": expressions, equations, inequalities, systems, polynomials, factoring, algebraic manipulation, logic/proof structure.
- FNC "Functional Dependence": patterns, sequences, functions of every family, transformations, rates of change, limits, derivatives, integrals.
- SPC "Space & Measure": shapes, measurement, area/volume, coordinate geometry, transformations in the plane, right-triangle & circle geometry, solids.
- DTA "Data & Chance": data displays, statistics, probability, counting, modeling with data.

## Skill schema (taxonomy)
{
 "skill_id": "MS.PRP.3",        // COURSE.STRAND.n — n sequential within course+strand
 "course": "MS", "strand": "PRP",
 "name": "Unit rates",           // ≤4 words
 "desc": "Compute and interpret unit rates, including with fractional quantities.",  // one sentence
 "grade": "6–7",                 // grade band or course year
 "prereq_ids": ["MS.PRP.1"],    // SAME-course prereqs only, by id
 "prereq_desc": ["equivalent fractions (ELEM)"],  // cross-course prereqs in words; linked in a later pass
 "next_desc": ["slope as rate (ALG1)"]            // where this leads, in words
}
Target counts per course: ELEM 40–45, MS 45–50, ALG1 40–45, GEO 40–45, ALG2 45–50, PREC 40–45, CALC 40–45.
Every course must use ALL six strands (CALC may have few DTA/QNT skills — that's fine, but include
what's real, e.g., QNT: limits involving infinity notation? No — keep honest: if a strand truly has
<2 skills in a course, 1 is acceptable).
Skills must be assessment-sized (one skill = something a 4-item quiz could measure), not unit-sized.

## Item schema (unified bank; one JSON object per line in items.jsonl)
{
 "item_id": "PILOT-ELEM-001",
 "source": "PILOT" | "ACT" | "ALG1" | "CALC",
 "course": "ELEM", "skill_id": "ELEM.QNT.4",
 "type": "mc",
 "stem": "...", "choices": ["...","...","...","..."], "answer": 0,
 "explanation": "...", "difficulty": 1-5, "calc": false,
 "verify": "python snippet or null",
 "figure": null,
 "review": false        // true = auto-tagged, needs human confirmation
}

## Pilot item rules (ELEM / MS / GEO, 50 each)
- 4-choice MC, plain text + Unicode notation (no LaTeX), no figures (text-only pilot; figure items come later).
- Cover ≥ 25 distinct skills per course (≈2 items per covered skill), all six strands represented.
- Age-appropriate language and numbers (ELEM: whole numbers/fractions/decimals within grade 3–5 norms).
- Distractors = documented error patterns; explanation names the concept.
- verify snippet mandatory for every computational item.
- Difficulty spread ≈ 2-2-1 easy/medium/hard per skill pair.

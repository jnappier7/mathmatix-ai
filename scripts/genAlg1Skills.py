#!/usr/bin/env python3
"""
Generate Skill catalog docs (models/skill.js) for the fine Algebra 1 assessment
sub-skills that the Fable bank introduced but the curated catalog
(seeds/skills-algebra-1.json) does not yet define.

Making these first-class Skill docs is what wires the bank into the tutor:
knowledge-tracing (BKT keys parameters by `category`), 4-pillar mastery, and
`skillFocusBuilder` (which seeds `tutorPlan.skillFocus` from ANY touched skill)
all recognize them, so once a student practices an item the tutor drives that
exact sub-skill as a course checkpoint.

Emits seeds/skills-algebra-1-fable.json (course "Algebra 1"), picked up by the
existing non-destructive upsert in scripts/seed-curriculum.js. Only the NEW
skills are authored here; the 16 reused ids already live in skills-algebra-1.json.

Usage: python3 scripts/genAlg1Skills.py
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "seeds", "skills-algebra-1-fable.json")

# module -> (quarter, unit)
UNIT = {
    0: (1, "Foundations"),
    1: (1, "Expressions"),
    2: (1, "Solving Linear Equations"),
    3: (2, "Functions & Relations"),
    4: (2, "Slope & Graphing"),
    5: (2, "Writing Linear Equations"),
    6: (3, "Linear Inequalities"),
    7: (3, "Systems of Equations"),
    10: (4, "Polynomials & Factoring"),
    11: (4, "Quadratic Equations"),
}

# fluencyType -> (baseFluencyTime seconds, toleranceFactor)
FLU = {
    "reflex": (10, 2.0), "process": (25, 2.5), "algorithm": (35, 2.5),
    "procedural": (30, 2.5), "conceptual": (30, 3.0), "application": (75, 3.0),
}

# skillId -> (module, category, difficulty 1-10, fluencyType, description, [prereqs], [standards])
SPEC = {
    # ---- Foundations (Pre-Algebra recalls surfaced by M1 spirals) ----
    "integer-operations": (0, "integers-rationals", 2, "procedural",
        "Add, subtract, multiply, and divide positive and negative integers.", [], ["7.NS.1", "7.NS.2"]),
    "fraction-operations": (0, "fractions", 3, "procedural",
        "Add, subtract, multiply, and divide fractions and write results in simplest form.",
        [], ["6.NS.1", "7.NS.1"]),
    "decimal-operations": (0, "decimals", 2, "procedural",
        "Add, subtract, multiply, and divide decimals.", [], ["6.NS.3"]),
    # ---- M1 Expressions ----
    "order-of-operations": (1, "expressions", 2, "procedural",
        "Evaluate numeric expressions using the order of operations, including exponents and grouping.",
        ["integer-operations"], ["6.EE.1", "6.EE.2"]),
    "evaluating-expressions": (1, "expressions", 3, "process",
        "Evaluate algebraic expressions by substituting values, including negatives and fractions.",
        ["order-of-operations", "integer-operations"], ["6.EE.2"]),
    "writing-algebraic-expressions": (1, "expressions", 3, "conceptual",
        "Translate between verbal phrases and numerical or algebraic expressions.",
        [], ["6.EE.2", "A-SSE.1"]),
    # ---- M2 Solving Linear Equations ----
    "solving-proportions": (2, "ratios-proportions", 3, "procedural",
        "Solve proportion equations, including rational and similar-figure setups.",
        ["solving-multi-step-equations"], ["7.RP.2", "A-REI.3"]),
    "literal-equations": (2, "linear-equations", 4, "procedural",
        "Solve a formula or literal equation for one of its variables.",
        ["solving-multi-step-equations"], ["A-CED.4"]),
    "writing-solving-equations-context": (2, "linear-equations", 4, "application",
        "Write and solve a linear equation from a real-world situation.",
        ["solving-multi-step-equations"], ["A-CED.1"]),
    "linear-equations-number-of-solutions": (2, "linear-equations", 4, "conceptual",
        "Determine whether a linear equation has one, no, or infinitely many solutions.",
        ["solving-equations-with-variables-both-sides"], ["A-REI.3"]),
    # ---- M3 Functions & Relations ----
    "function-notation-evaluation": (3, "functions", 4, "process",
        "Evaluate functions written in function notation, including combined expressions.",
        ["evaluating-expressions"], ["F-IF.2"]),
    "identifying-functions": (3, "functions", 4, "conceptual",
        "Decide whether a relation is a function from pairs, tables, mappings, or graphs.",
        [], ["F-IF.1"]),
    "domain-and-range": (3, "functions", 4, "conceptual",
        "State the domain and range of a relation from a set, table, or graph.",
        [], ["F-IF.1"]),
    "discrete-continuous-relations": (3, "functions", 4, "conceptual",
        "Classify a situation as best modeled by a discrete, continuous, or neither relation.",
        [], ["F-IF.5"]),
    "interpreting-graphs-stories": (3, "functions", 4, "conceptual",
        "Match a qualitative graph to the story it represents.", [], ["F-IF.4"]),
    "function-application-modeling": (3, "functions", 5, "application",
        "Write and interpret a function that models a real-world context.",
        ["function-notation-evaluation"], ["F-BF.1", "F-IF.4"]),
    # ---- M4 Slope & Graphing ----
    "slope-from-two-points": (4, "linear-functions", 4, "procedural",
        "Find the slope of a line through two points, including zero and undefined cases.",
        [], ["F-IF.6", "8.EE.5"]),
    "slope-intercept-from-equation": (4, "linear-functions", 3, "process",
        "Identify the slope and y-intercept from a slope-intercept equation.", [], ["F-IF.7a"]),
    "standard-to-slope-intercept": (4, "linear-functions", 4, "procedural",
        "Rewrite a linear equation from standard form into slope-intercept form.",
        ["solving-multi-step-equations"], ["A-REI.10"]),
    "reading-slope-from-graph": (4, "graphing", 4, "process",
        "Read the slope, y-intercept, and equation of a line from its graph.",
        ["slope-from-two-points"], ["F-IF.7a"]),
    "undefined-zero-slope": (4, "linear-functions", 4, "conceptual",
        "Distinguish zero slope (horizontal) from undefined slope (vertical).",
        ["slope-from-two-points"], ["8.EE.5"]),
    "absolute-value-graphs-transformations": (4, "graphing", 5, "conceptual",
        "Identify the vertex and describe transformations of f(x)=a|x-h|+k.",
        [], ["F-BF.3", "F-IF.7b"]),
    "linear-modeling-slope-intercept": (4, "linear-functions", 5, "application",
        "Interpret slope and intercept of a linear model in context.",
        ["slope-intercept-from-equation"], ["F-LE.5", "S-ID.7"]),
    # ---- M5 Writing Linear Equations ----
    "linear-equation-forms-reference": (5, "linear-functions", 2, "reflex",
        "Recall the slope-intercept, point-slope, and standard forms of a linear equation.",
        [], ["A-CED.2"]),
    "point-slope-form": (5, "linear-functions", 4, "procedural",
        "Write the equation of a line in point-slope form from a point and a slope.",
        ["slope-from-two-points"], ["A-CED.2"]),
    "standard-form-equations": (5, "linear-functions", 4, "procedural",
        "Write or rewrite a linear equation in standard form with integer coefficients.",
        [], ["A-CED.2"]),
    "converting-between-forms": (5, "linear-functions", 4, "procedural",
        "Convert a linear equation among slope-intercept, point-slope, and standard forms.",
        ["point-slope-form"], ["A-CED.2"]),
    "parallel-perpendicular-lines": (5, "parallel-perpendicular", 5, "conceptual",
        "Use slope relationships to write or identify parallel and perpendicular lines.",
        ["slope-from-two-points"], ["G-GPE.5"]),
    "linear-modeling-writing-equations": (5, "linear-functions", 5, "application",
        "Write a linear equation that models a real-world situation and interpret it.",
        ["point-slope-form"], ["A-CED.2", "F-LE.2"]),
    # ---- M6 Linear Inequalities ----
    "solving-one-variable-inequalities": (6, "inequalities", 3, "procedural",
        "Solve one-variable inequalities, flipping the sign when multiplying or dividing by a negative.",
        ["solving-multi-step-equations"], ["A-REI.3"]),
    "solving-graphing-inequalities": (6, "inequalities", 4, "procedural",
        "Solve an inequality and graph its solution set on a number line.",
        ["solving-one-variable-inequalities"], ["A-REI.3"]),
    "matching-inequality-graphs": (6, "inequalities", 3, "conceptual",
        "Match an inequality to the number-line graph of its solution set.",
        ["solving-one-variable-inequalities"], ["A-REI.3"]),
    "compound-inequalities": (6, "inequalities", 5, "procedural",
        "Solve and graph compound (and / or) inequalities.",
        ["solving-graphing-inequalities"], ["A-REI.3"]),
    "writing-solving-inequalities-context": (6, "inequalities", 5, "application",
        "Write and solve an inequality from a real-world constraint (at least / at most).",
        ["solving-one-variable-inequalities"], ["A-CED.1", "A-CED.3"]),
    # ---- M7 Systems of Equations ----
    "checking-system-solutions": (7, "systems", 3, "process",
        "Check whether an ordered pair is a solution of a system of equations.", [], ["A-REI.6"]),
    "classifying-system-solutions": (7, "systems", 5, "conceptual",
        "Determine whether a system has one, no, or infinitely many solutions.",
        [], ["A-REI.6"]),
    "choosing-a-solution-method": (7, "systems", 5, "conceptual",
        "Choose an efficient method (graphing, substitution, elimination) for a given system.",
        ["systems-of-equations-substitution", "systems-of-equations-elimination"], ["A-REI.6"]),
    "systems-application-modeling": (7, "systems", 6, "application",
        "Set up and solve a system of equations from a word problem (tickets, coins, mixture).",
        ["systems-of-equations-elimination"], ["A-CED.3", "A-REI.6"]),
    # ---- M10 Polynomials & Factoring ----
    "multiplying-binomials": (10, "polynomials", 4, "procedural",
        "Multiply binomials and other polynomials, writing the product in standard form.",
        ["polynomial-multiplication-monomial"], ["A-APR.1"]),
    "special-products": (10, "polynomials", 4, "procedural",
        "Expand special products: (a+b)(a-b), (a+b)^2, and (a-b)^2.",
        ["multiplying-binomials"], ["A-APR.1", "A-SSE.2"]),
    "factoring-trinomials": (10, "factoring", 5, "procedural",
        "Factor trinomials (a=1 and a>1) completely, or identify a prime polynomial.",
        ["factoring-gcf"], ["A-SSE.3a"]),
    "factoring-by-grouping": (10, "factoring", 5, "procedural",
        "Factor a four-term polynomial by grouping.", ["factoring-gcf"], ["A-SSE.2"]),
    "factoring-application": (10, "factoring", 5, "application",
        "Use factoring to model an area or context problem with binomial dimensions.",
        ["factoring-trinomials"], ["A-SSE.3a"]),
    # ---- M11 Quadratic Equations ----
    "quadratic-abc-identification": (11, "quadratics", 2, "reflex",
        "Identify the coefficients a, b, and c of a quadratic in standard form.", [], ["A-SSE.1"]),
    "completing-the-square": (11, "quadratics", 6, "algorithm",
        "Solve a quadratic equation by completing the square.",
        ["solving-quadratics-square-roots"], ["A-REI.4a", "A-REI.4b"]),
    "discriminant-number-of-solutions": (11, "quadratics", 6, "conceptual",
        "Use the discriminant to determine the number of real solutions of a quadratic.",
        ["quadratic-formula"], ["A-REI.4b"]),
    "choosing-quadratic-method": (11, "quadratics", 6, "conceptual",
        "Choose the most efficient method to solve a given quadratic equation.",
        ["solving-quadratics-factoring", "solving-quadratics-square-roots"], ["A-REI.4b"]),
    "quadratic-application": (11, "quadratics", 7, "application",
        "Model and solve a real-world problem (projectile, area) with a quadratic equation.",
        ["solving-quadratics-factoring"], ["A-CED.1", "A-REI.4b"]),
}


def main():
    skills = []
    for skill_id, (mod, category, diff, ftype, desc, prereqs, standards) in SPEC.items():
        quarter, unit = UNIT[mod]
        base_time, tol = FLU[ftype]
        skills.append({
            "skillId": skill_id,
            "displayName": _title(skill_id),
            "description": desc,
            "category": category,
            "course": "Algebra 1",
            "quarter": quarter,
            "unit": unit,
            "prerequisites": prereqs,
            "enables": [],
            "standardsAlignment": standards,
            "difficultyLevel": diff,
            "fluencyMetadata": {
                "baseFluencyTime": base_time,
                "fluencyType": ftype,
                "toleranceFactor": tol,
            },
            "source": "alg1-fable",
        })
    json.dump(skills, open(OUT, "w"), indent=2, ensure_ascii=False)
    print("Wrote %d Algebra 1 skill docs -> %s" % (len(skills), os.path.relpath(OUT, os.getcwd())))
    from collections import Counter
    by_cat = Counter(s["category"] for s in skills)
    print("  categories:", dict(by_cat))


# Readable display names from the classifier's NAMES (single source of truth).
def _title(skill_id):
    import sys
    sys.path.insert(0, HERE)
    import alg1SkillClassifier as C
    return C.NAMES.get(skill_id, skill_id.replace("-", " ").title())


if __name__ == "__main__":
    main()

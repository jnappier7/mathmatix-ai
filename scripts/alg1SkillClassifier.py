#!/usr/bin/env python3
"""
Deterministic fine-grained skill classifier for the Fable Algebra 1 bank.

The Fable items carry no per-item skill tag, so this assigns each item an EXACT
sub-skill (e.g. "completing-the-square", "factoring-trinomials",
"parallel-perpendicular-lines") from its wording, rather than the coarse
module tag. Reuses the existing catalog skillIds (seeds/skills-algebra-1.json)
where one exists and adds fine ids for the gaps.

Rules are per-module, ordered most-specific first; the first pattern that matches
the prompt wins. Spiral-review items are classified under their SOURCE module's
rules (they are procedural recalls of earlier modules). If nothing matches, the
item falls back to the coarse module skill `alg1-m{N}` (reported by the ingester
so the set can be tuned to zero).

FORWARD-COMPATIBLE: the ingester prefers an item's own `skill` field when present,
so gold-standard Fable tags can be swapped in later with no rework.

Public API:
    classify(item, module, is_spiral) -> (skillId, displayName)
    NAMES  -> { skillId: displayName }  (every id this classifier can emit)
"""

import re

# (skillId, displayName, regex) — matched case-insensitively against the prompt.
# Catalog ids (seeds/skills-algebra-1.json) are reused verbatim where they exist.
RULES = {
    # 0 = Pre-Algebra (M1 spiral source)
    0: [
        ("solving-one-step-equations", "Solving one-step equations", r"\bsolve\b"),
        ("fraction-operations", "Fraction operations", r"simplest form|\d\s*/\s*\d"),
        ("decimal-operations", "Decimal operations", r"\d\.\d"),
        ("integer-operations", "Integer operations", r"evaluate|[−-]\s*\d|\(\s*[−-]"),
    ],
    1: [
        ("writing-algebraic-expressions", "Writing algebraic expressions",
         r"expression for the phrase|verbal phrase|represents the phrase|write (an|a) (algebraic|numerical) expression|write an expression"),
        ("evaluating-expressions", "Evaluating expressions with substitution",
         r"evaluate .*\bwhen\b|complete the table|\(2x\)²|2x² and|show every substitution"),
        ("order-of-operations", "Order of operations", r"evaluate|simplify"),
    ],
    2: [
        ("solving-proportions", "Solving proportions", r"proportion|shadow"),
        ("literal-equations", "Literal equations (solving for a variable)", r"=.*\bfor\s+[a-z]\b"),
        ("linear-equations-number-of-solutions", "Number of solutions of a linear equation",
         r"how many solutions|infinitely many|no solution"),
        ("writing-solving-equations-context", "Writing & solving equations from context",
         r"sign-up fee|per month|per week|consecutive|write an equation|savings|deposit|gym"),
        ("solving-equations-with-variables-both-sides", "Equations with variables on both sides",
         r"x.*=.*x"),
        ("solving-multi-step-equations", "Solving multi-step equations", r"\(|\d\s*/\s*\d|/\s*\d"),
        ("solving-two-step-equations", "Solving two-step equations", r"\d[a-z]\s*[+−-]\s*\d+\s*="),
        ("solving-one-step-equations", "Solving one-step equations", r"\bsolve\b"),
    ],
    3: [
        ("interpreting-graphs-stories", "Interpreting graphs (story matching)",
         r"which story|story best matches|distance from home over time"),
        ("function-application-modeling", "Function models in context",
         r"write a function|c\(h\)|t\(n\)|entry fee|per hour|per ticket|charges \$"),
        ("discrete-continuous-relations", "Discrete vs continuous relations", r"continuous|discrete"),
        # domain/range items (which also ask "is it a function") lead with "state the
        # domain"; they carry identifying-functions as a secondary skill (see SECONDARY).
        ("domain-and-range", "Domain and range", r"state the domain"),
        ("identifying-functions", "Identifying functions",
         r"a function|vertical line test|mapping diagram|represent y as a function|ordered pair"),
        ("function-notation-evaluation", "Function notation & evaluation", r"f\(|g\(|h\("),
    ],
    4: [
        ("absolute-value-graphs-transformations", "Absolute-value graphs & transformations",
         r"\bvertex\b|\|x|absolute value|translation of the graph"),
        ("undefined-zero-slope", "Undefined & zero slope", r"undefined"),
        ("reading-slope-from-graph", "Reading slope & intercept from a graph",
         r"graph of (a|an) line is shown|the graph of a line"),
        ("graphing-linear-equations-slope-intercept", "Graphing lines in slope-intercept form",
         r"graph the line"),
        ("linear-modeling-slope-intercept", "Linear models (slope-intercept)",
         r"candle|steady rate|per hour|per month|sign-up fee|movie service|charges"),
        ("standard-to-slope-intercept", "Converting standard to slope-intercept form",
         r"slope-intercept form"),
        ("slope-intercept-from-equation", "Slope & intercept from an equation",
         r"state the slope and the y-intercept"),
        ("slope-from-two-points", "Slope from two points",
         r"slope of the line|passes through|two points|slope formula"),
    ],
    5: [
        ("linear-equation-forms-reference", "The three forms of a linear equation",
         r"three general forms|quick reference"),
        ("parallel-perpendicular-lines", "Parallel & perpendicular lines", r"parallel|perpendicular"),
        ("linear-modeling-writing-equations", "Writing linear models from context",
         r"savings|deposit|per week|per month|account"),
        ("point-slope-form", "Point-slope form", r"point-slope form"),
        ("standard-form-equations", "Standard-form equations", r"standard form"),
        ("converting-between-forms", "Converting between forms of a line", r"rewrite y"),
        ("writing-linear-equations-slope-intercept", "Writing equations in slope-intercept form",
         r"slope-intercept form|passes through|which equation|line with slope"),
    ],
    6: [
        ("matching-inequality-graphs", "Matching an inequality to its graph",
         r"which graph shows the solution"),
        ("compound-inequalities", "Compound inequalities", r"compound inequality"),
        ("writing-solving-inequalities-context", "Writing & solving inequalities from context",
         r"at most|at least|fencing|perimeter|admission|raise|garden|drama club|ferry|write an inequality"),
        ("solving-graphing-inequalities", "Solving & graphing inequalities",
         r"graph the solution set"),
        ("solving-one-variable-inequalities", "Solving one-variable inequalities", r"inequalit"),
    ],
    7: [
        ("checking-system-solutions", "Checking a solution of a system", r"a solution of the system"),
        ("systems-application-modeling", "Systems word problems",
         r"tickets|coins|nickel|quarter|saline|mixture|sold \d|adult .* student"),
        ("choosing-a-solution-method", "Choosing a method for a system",
         r"any method|name the method"),
        ("classifying-system-solutions", "Classifying the number of solutions",
         r"one solution.*no solution|infinitely many|how many solution|has no solution|number of solutions"),
        ("systems-of-equations-graphing", "Solving systems by graphing", r"graph"),
        ("systems-of-equations-substitution", "Solving systems by substitution", r"substitution"),
        ("systems-of-equations-elimination", "Solving systems by elimination",
         r"elimination|subtract"),
        ("systems-of-equations-substitution", "Solving systems by substitution", r"solve the system"),
    ],
    10: [
        ("factoring-by-grouping", "Factoring by grouping", r"factor by grouping"),
        ("special-products", "Special products", r"special product"),
        ("factoring-application", "Factoring in context (area)",
         r"area of|floor of|\bgarden\b|rectangle"),
        ("factoring-trinomials", "Factoring trinomials",
         r"factor each trinomial|factor.*completely|trinomial|\bprime\b"),
        ("factoring-gcf", "Factoring the GCF", r"greatest common factor|factor out"),
        ("polynomial-multiplication-monomial", "Multiplying a polynomial by a monomial",
         r"multiply:\s*\d*x\("),
        ("multiplying-binomials", "Multiplying binomials", r"\)\(|binomial"),
        ("polynomial-addition-subtraction", "Adding & subtracting polynomials",
         r"\badd\b|subtract|standard form"),
    ],
    11: [
        ("quadratic-abc-identification", "Identifying a, b, c", r"identify the values of a, b"),
        ("discriminant-number-of-solutions", "Discriminant & number of solutions",
         r"discriminant|number of real solutions|never touches"),
        ("quadratic-application", "Quadratic applications",
         r"rocket|launches|platform|velocity|projectile|herb garden|must cover"),
        ("quadratic-equations-graphing", "Graphing quadratic functions",
         r"axis of symmetry|\bvertex\b|graph y ?= ?x²|maximum or a min|parabola"),
        ("completing-the-square", "Solving by completing the square", r"completing the square"),
        ("quadratic-formula", "Solving with the quadratic formula", r"quadratic formula"),
        ("solving-quadratics-square-roots", "Solving by square roots",
         r"square root|x² ?=|\)² ?="),
        ("solving-quadratics-factoring", "Solving quadratics by factoring",
         r"by factoring|\(x\s*[+−-]\s*\d+\)\s*\(x"),
        ("choosing-quadratic-method", "Choosing a method to solve a quadratic", r"=\s*0|solve"),
    ],
}

# Coarse module fallback (topic name filled by the ingester's skill-names map).
MODULE_TOPIC = {
    1: "Expressions", 2: "Solving Linear Equations", 3: "Functions & Relations",
    4: "Slope & Graphing", 5: "Writing Linear Equations", 6: "Linear Inequalities",
    7: "Systems of Equations", 10: "Polynomials & Factoring", 11: "Quadratic Equations",
}

# Flattened { skillId: displayName } for every id the rules can emit.
NAMES = {}
for _mod, _rules in RULES.items():
    for _sid, _name, _pat in _rules:
        NAMES[_sid] = _name

# Secondary skills an item ALSO exercises (populate Problem.secondarySkillIds).
# Kept intentionally small — only genuine multi-skill overlaps. Mastery credit
# today is primary-only, but this documents the coverage and is future-proof.
SECONDARY = {
    3: [("identifying-functions", r"a function"),
        ("domain-and-range", r"state the domain")],
}


def secondary_skills(item, module, primary, is_spiral=False):
    """Return extra skillIds the item exercises, excluding the primary."""
    rules_module = module
    if is_spiral:
        sm = _spiral_module(item.get("spiral_source"))
        if sm is not None:
            rules_module = sm
    text = str(item.get("prompt", [""])[0]).lower()
    out = []
    for sid, pat in SECONDARY.get(rules_module, []):
        if sid != primary and sid not in out and re.search(pat, text):
            out.append(sid)
    return out


def _spiral_module(source):
    """Map a spiral_source string ('M2', 'Pre-Algebra', ...) to a rules module."""
    if not source:
        return None
    s = str(source).strip().lower()
    if s.startswith("pre"):
        return 0
    m = re.match(r"m(\d+)", s)
    return int(m.group(1)) if m else None


def classify(item, module, is_spiral=False):
    """Return (skillId, displayName) for an item's version-independent skill."""
    rules_module = module
    if is_spiral:
        sm = _spiral_module(item.get("spiral_source"))
        if sm is not None:
            rules_module = sm
    text = str(item.get("prompt", [""])[0]).lower()
    for sid, name, pat in RULES.get(rules_module, []):
        if re.search(pat, text):
            return sid, name
    # Fallback: coarse module skill (kept honest, reported by the ingester).
    return "alg1-m%d" % module, MODULE_TOPIC.get(module, "Module %d" % module)

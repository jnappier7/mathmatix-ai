#!/usr/bin/env python3
"""
Maps each Fable AP Calc item's fine `skill` label to an existing catalog skillId
(seeds/skills-ap-calculus-ab.json, 35 skills already seeded via seed-curriculum.js).

The Fable labels are finer than the catalog (e.g. "Related rates: ladder" and
"Related rates: sphere" both -> related-rates; three u-sub variants -> u-substitution).
The catalog grain is what BKT / mastery / skillFocus key on, so we tag Problem.skillId
with the catalog id and keep the fine label in a `subskill:` tag for precise feedback.

Result: no new Skill docs needed — the AP Calc catalog already covers the bank, so
the bootcamp's skills are BKT-wired for free.
"""

# Fable `skill` label -> catalog skillId (seeds/skills-ap-calculus-ab.json)
SKILL_MAP = {
    # U1 — Limits & Continuity
    "Limits by algebraic manipulation": "limits-algebraic-techniques",
    "Special trigonometric limits": "limits-algebraic-techniques",
    "Limits of trigonometric quotients": "limits-algebraic-techniques",
    "Limits at infinity and horizontal asymptotes": "limits-at-infinity",
    "Infinite limits and vertical asymptotes from a graph": "one-sided-infinite-limits",
    "Continuity at a point (removable discontinuity)": "continuity-types",
    "Intermediate Value Theorem with a table": "ivt-squeeze",
    # U2 — Differentiation: Definition & Basic Rules
    "Limit definition of the derivative": "derivative-definition",
    "Limit definition of the derivative and tangent lines": "derivative-definition",
    "Recognizing the limit definition of the derivative": "derivative-definition",
    "Instantaneous rate of change in context": "derivative-definition",
    "Power rule with negative exponents": "basic-differentiation-rules",
    "Product rule": "basic-differentiation-rules",
    "Product rule with trigonometric functions": "basic-differentiation-rules",
    "Quotient rule evaluated at a point": "basic-differentiation-rules",
    "Slope of a tangent line (derivatives of eˣ and polynomials)": "common-derivatives",
    # U3 — Composite / Implicit / Inverse
    "Chain rule": "chain-rule",
    "Chain rule with exponential functions in context": "chain-rule",
    "Implicit differentiation": "implicit-differentiation",
    "Derivative of an inverse function": "inverse-function-derivatives",
    "Inverse function derivative": "inverse-function-derivatives",
    # U4 — Contextual Applications
    "Related rates": "related-rates",
    "Related rates: ladder": "related-rates",
    "Related rates: sphere": "related-rates",
    "L'Hospital's Rule": "lhopitals-rule",
    "Linearization": "linearization",
    "Derivative in context (rate of change)": "motion",
    "Rate of change from a model": "motion",
    "Motion: acceleration when v = 0": "motion",
    "Rectilinear motion: rest": "motion",
    # U5 — Analytical Applications
    "Mean Value Theorem": "mvt-evt",
    "Absolute extrema (candidates test)": "increasing-decreasing-extrema",
    "Relative extrema (first derivative test)": "increasing-decreasing-extrema",
    "Local extrema from f′ sign change": "increasing-decreasing-extrema",
    "First derivative test from a graph of f′": "increasing-decreasing-extrema",
    "Increasing/decreasing from f′": "increasing-decreasing-extrema",
    "Concavity": "concavity-inflection",
    "Curve analysis from the graph of f′": "curve-sketching",
    "Optimization: box design": "optimization",
    # U6 — Integration & Accumulation
    "Riemann sums from a table": "riemann-sums",
    "Trapezoidal sum from a table": "riemann-sums",
    "FTC Part 1": "ftc",
    "FTC Part 1 with chain rule": "ftc",
    "FTC Part 2 (evaluation)": "ftc",
    "FTC with chain rule": "ftc",
    "Accumulation in context": "ftc",
    "Definite integral of a rate (accumulation in context)": "ftc",
    "Rate in/rate out (accumulation)": "ftc",
    "Properties of definite integrals": "ftc",
    "U-substitution (definite)": "u-substitution",
    "U-substitution (indefinite)": "u-substitution",
    "U-substitution with change of bounds": "u-substitution",
    # U7 — Differential Equations
    "Slope fields": "slope-fields",
    "Separation of variables": "separable-des",
    "Particular solutions by separation": "separable-des",
    "Separable models in context": "separable-des",
    "Exponential growth models": "exponential-growth-decay",
    "Exponential models": "exponential-growth-decay",
    # U8 — Applications of Integration
    "Average value of a function": "average-value",
    "Particle motion": "motion-integrals",
    "Particle motion: position from velocity": "motion-integrals",
    "Particle motion: total distance": "motion-integrals",
    "Area between curves": "area-between-curves",
    "Area and volume of a plane region": "area-between-curves",
    "Volume: disks": "volume-disk-washer",
    "Volume: washers": "volume-disk-washer",
    "Volume: known cross-sections (semicircles)": "volume-cross-sections",
}


def catalog_skill(label):
    """Catalog skillId for a Fable label, or None if unmapped (caller reports)."""
    return SKILL_MAP.get(label)

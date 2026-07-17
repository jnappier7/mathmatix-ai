#!/usr/bin/env python3
"""
Map each Fable SAT item's (domain, skill) label to a unified taxonomy skill_id
(seeds/unified-taxonomy/math_taxonomy.json). SAT Math lives at the ALG1/ALG2/GEO
(+ MS for proportional/percent) levels of the Map of Mathmatix.

Labels carry parenthetical variants (e.g. "Nonlinear functions (exponential)")
that route to different unified skills, so we match by ordered keyword rules per
domain — most specific first.

Public API: unified_skill(domain, label) -> skill_id  (or None if unmapped)
"""

import re

# Per-domain ordered rules: (regex on the lowercased label, unified skill_id).
# First match wins. Targets are ids in the unified taxonomy.
RULES = {
    "ALG": [
        (r"system", "ALG1.EQV.7"),                    # systems of two linear equations
        (r"inequalit.*two variab|two variab.*inequalit", "ALG1.FNC.5"),
        (r"inequalit", "ALG1.EQV.3"),                 # one-variable linear inequalities
        (r"two variables|two points|intercepts", "ALG1.FNC.4"),  # write linear equations
        (r"perpendicular|parallel", "ALG1.FNC.4"),
        (r"evaluation", "ALG1.FNC.1"),                # function notation eval
        (r"linear functions|interpretation|slope|rate from", "ALG1.FNC.4"),
        (r"one variable|distribution|both sides|infinitely many", "ALG1.EQV.1"),
        (r".", "ALG1.EQV.1"),                         # default: solving linear equations
    ],
    "ADV": [
        (r"exponent rules", "MS.QNT.9"),              # integer/algebraic exponent properties
        (r"equivalent expressions.*rational|rational.*expression", "ALG2.EQV.13"),  # simplify rational expressions
        # function-context first, so "functions (quadratic)" ≠ "equations (quadratic)"
        (r"functions.*polynomial|polynomial.*function", "ALG2.FNC.6"),
        (r"functions.*exponential|exponential.*function|choosing an exponential|exponential (evaluation|growth)", "ALG1.FNC.8"),
        (r"functions.*quadratic|quadratic.*(maximum|evaluation|zeros|model)", "ALG1.FNC.10"),
        (r"exponential.*equal bases|nonlinear equations \(exponential", "ALG2.EQV.16"),
        (r"nonlinear equations \(rational|rational equation", "ALG2.EQV.15"),
        (r"radical", "ALG2.EQV.12"),                  # radical equations
        (r"discriminant|tangency|line and parabola|nonlinear systems|equations and systems|equations & systems", "ALG2.EQV.6"),
        (r"quadratic.*factoring", "ALG1.EQV.15"),     # solve quadratic by factoring
        (r"quadratic", "ALG1.EQV.15"),                # quadratic equations (solve)
        (r"exponential", "ALG1.FNC.8"),               # exponential growth/decay functions
        (r"polynomial", "ALG2.FNC.6"),                # polynomial functions/end behavior
        (r"nonlinear functions", "ALG1.FNC.10"),
        (r"nonlinear equations", "ALG1.EQV.15"),
        (r"equivalent expressions", "ALG1.EQV.10"),   # multiply/expand polynomials
        (r".", "ALG1.EQV.10"),
    ],
    "GEO": [
        (r"circle.*equation|equation.*circle|completing the square", "GEO.SPC.16"),
        (r"circle", "MS.SPC.6"),                      # circle area/circumference
        (r"pythagor", "GEO.SPC.11"),                  # pythagorean applications
        (r"right triangle|trig|complementary|ratios", "GEO.PRP.5"),  # right-triangle trig
        (r"lines, angles|angle", "GEO.SPC.4"),        # triangle/angle relationships
        (r"volume|cylinder|prism|cone|sphere", "GEO.SPC.18"),  # solids (prisms/cylinders)
        (r"area", "GEO.SPC.17"),                      # areas of polygons
        (r".", "GEO.SPC.17"),
    ],
    "PSDA": [
        (r"percent", "MS.PRP.7"),                     # multi-step percent problems
        (r"ratio|rate|proportional|units", "MS.PRP.5"),  # proportional relationships
        (r"two-variable|scatterplot|scatterplots", "ALG1.DTA.3"),  # scatter plots / fit
        (r"two-way|conditional", "ALG1.DTA.2"),       # two-way frequency tables
        (r"probability", "GEO.DTA.1"),                # probability foundations
        (r"inference|margin of error", "ALG2.DTA.3"), # simulation and inference
        (r"evaluating statistical claims|statistical claims", "ALG2.DTA.1"),  # study design
        (r"one-variable|center and spread|outlier|bar graph", "ALG1.DTA.1"),  # describe distributions
        (r".", "ALG1.DTA.1"),
    ],
}


def unified_skill(domain, label):
    text = str(label or "").lower()
    for pat, sid in RULES.get(domain, []):
        if re.search(pat, text):
            return sid
    return None

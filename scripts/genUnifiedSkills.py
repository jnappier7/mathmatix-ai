#!/usr/bin/env python3
"""
Generate Skill catalog docs from the unified "Map of Mathmatix" taxonomy
(seeds/unified-taxonomy/math_taxonomy.json) — the 315-skill, 6-strand,
7-course backbone we're adopting platform-wide.

Each taxonomy skill (id COURSE.STRAND.n) becomes a Skill doc: the dotted id is
the skillId, the strand maps to a representative category (BKT keys on category)
and to the new `strand` field, prereq_ids + cross_prereq_ids become
prerequisites, and grade → gradeBand by course level.

Emits seeds/skills-unified.json (315 docs). Non-destructive: these coexist with
the existing per-course catalog until items are migrated to the unified ids.

Usage: python3 scripts/genUnifiedSkills.py
"""

import json
import os
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TAX = os.path.join(ROOT, "seeds", "unified-taxonomy", "math_taxonomy.json")
OUT = os.path.join(ROOT, "seeds", "skills-unified.json")

# strand → a representative Skill.category enum value (BKT parameter lookup).
STRAND_CATEGORY = {
    "QNT": "number-system",
    "PRP": "ratios-proportions",
    "EQV": "expressions-equations",
    "FNC": "functions",
    "SPC": "geometry",
    "DTA": "statistics-probability",
}
STRAND_NAME = {
    "QNT": "Quantity & Operations", "PRP": "Proportional Reasoning",
    "EQV": "Equivalence & Structure", "FNC": "Functional Dependence",
    "SPC": "Space & Measure", "DTA": "Data & Chance",
}
# taxonomy course code → (readable name, gradeBand enum, base difficultyLevel)
COURSE = {
    "ELEM": ("Elementary Math", "K-5", 2),
    "MS":   ("Middle School Math", "5-8", 3),
    "ALG1": ("Algebra 1", "8-12", 4),
    "GEO":  ("Geometry", "8-12", 4),
    "ALG2": ("Algebra 2", "8-12", 5),
    "PREC": ("Precalculus", "8-12", 6),
    "CALC": ("AP Calculus AB", "Calculus", 7),
}


def main():
    tax = json.load(open(TAX))
    skills = tax["skills"]
    ids = {s["skill_id"] for s in skills}

    docs = []
    for s in skills:
        course_name, grade_band, diff = COURSE.get(s["course"], (s["course"], "8-12", 5))
        prereqs = list(dict.fromkeys((s.get("prereq_ids") or []) + (s.get("cross_prereq_ids") or [])))
        docs.append({
            "skillId": s["skill_id"],
            "displayName": s["name"],
            "description": s.get("desc") or s["name"],
            "category": STRAND_CATEGORY[s["strand"]],
            "strand": s["strand"],
            "courseLevel": s["course"],
            "course": course_name,
            "unit": STRAND_NAME[s["strand"]],
            "gradeBand": grade_band,
            "prerequisites": prereqs,
            "enables": [],
            "difficultyLevel": diff,
            "fluencyMetadata": {"baseFluencyTime": 30, "fluencyType": "process", "toleranceFactor": 2.5},
            "source": "unified-taxonomy",
        })

    # sanity: prereqs resolve within the taxonomy
    bad = [(d["skillId"], p) for d in docs for p in d["prerequisites"] if p not in ids]

    json.dump(docs, open(OUT, "w"), indent=2, ensure_ascii=False)
    print("Wrote %d unified Skill docs -> %s" % (len(docs), os.path.relpath(OUT, os.getcwd())))
    print("  by course:", dict(Counter(d["courseLevel"] for d in docs)))
    print("  by strand:", dict(Counter(d["strand"] for d in docs)))
    print("  unresolved prerequisite refs:", len(bad))
    if bad:
        print("   ", bad[:6])


if __name__ == "__main__":
    main()

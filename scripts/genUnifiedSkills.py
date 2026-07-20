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
STD = os.path.join(ROOT, "seeds", "unified-taxonomy", "standards-alignment.json")
LAB = os.path.join(ROOT, "seeds", "unified-taxonomy", "student-labels.json")

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
    # STAT and CALC are peers, not a sequence — a student takes AP Statistics or
    # AP Calculus or both, and Statistics requires no calculus. STAT is listed
    # first only because the level order validates prerequisite direction.
    "STAT": ("AP Statistics", "8-12", 6),
    "CALC": ("AP Calculus AB", "Calculus", 7),
}


def main():
    tax = json.load(open(TAX))
    skills = tax["skills"]
    ids = {s["skill_id"] for s in skills}

    # Verified CCSS-M / AP alignments, keyed by skillId. Produced by the standards
    # audit (see docs/SKILL_STANDARDS_AUDIT.md) — every code traced to a published
    # standard, never inferred from the skill name.
    standards = {}
    if os.path.exists(STD):
        standards = json.load(open(STD))

    # Plain-language student-facing names, keyed by skillId. Reviewed copy — see
    # seeds/unified-taxonomy/student-labels.json. Absent labels fall back to the
    # formal displayName at read time.
    labels = {}
    if os.path.exists(LAB):
        labels = json.load(open(LAB)).get("labels", {})

    docs = []
    for s in skills:
        course_name, grade_band, diff = COURSE.get(s["course"], (s["course"], "8-12", 5))
        # Kept separate: same-level prerequisites vs the lower-level ancestor that
        # is the same idea less abstractly. Both gate mastery; only the second
        # tells you a strand is one continuous through-line.
        prereqs = list(dict.fromkeys(s.get("prereq_ids") or []))
        cross = [p for p in dict.fromkeys(s.get("cross_prereq_ids") or []) if p not in prereqs]
        docs.append({
            "skillId": s["skill_id"],
            "displayName": s["name"],
            "studentLabel": labels.get(s["skill_id"], s["name"]),
            "description": s.get("desc") or s["name"],
            "category": STRAND_CATEGORY[s["strand"]],
            "strand": s["strand"],
            "courseLevel": s["course"],
            "course": course_name,
            "unit": STRAND_NAME[s["strand"]],
            "gradeBand": grade_band,
            "prerequisites": prereqs,
            "crossPrereqs": cross,
            # Present in the graph, withheld from student-facing surfaces until
            # its standards are verified against a retrievable source.
            "provisional": bool(s.get("provisional")),
            "enables": [],
            "standardsAlignment": standards.get(s["skill_id"], []),
            "difficultyLevel": diff,
            "fluencyMetadata": {"baseFluencyTime": 30, "fluencyType": "process", "toleranceFactor": 2.5},
            "source": "unified-taxonomy",
        })

    # Derive `enables` as the reverse of every prerequisite edge. It was previously
    # left empty for all 315 skills, which silently zeroed the downstream-impact
    # term in utils/retentionProbe.js.
    by_id = {d["skillId"]: d for d in docs}
    for d in docs:
        for p in d["prerequisites"] + d["crossPrereqs"]:
            if p in by_id and d["skillId"] not in by_id[p]["enables"]:
                by_id[p]["enables"].append(d["skillId"])

    # sanity: prereqs resolve within the taxonomy
    bad = [(d["skillId"], p) for d in docs for p in d["prerequisites"] + d["crossPrereqs"] if p not in ids]
    no_std = [d["skillId"] for d in docs if not d["standardsAlignment"]]

    json.dump(docs, open(OUT, "w"), indent=2, ensure_ascii=False)
    print("Wrote %d unified Skill docs -> %s" % (len(docs), os.path.relpath(OUT, os.getcwd())))
    print("  by course:", dict(Counter(d["courseLevel"] for d in docs)))
    print("  by strand:", dict(Counter(d["strand"] for d in docs)))
    print("  prereq edges: %d same-level, %d cross-level" % (
        sum(len(d["prerequisites"]) for d in docs), sum(len(d["crossPrereqs"]) for d in docs)))
    print("  enables edges derived:", sum(len(d["enables"]) for d in docs))
    print("  unresolved prerequisite refs:", len(bad))
    if bad:
        print("   ", bad[:6])
    print("  skills without standards alignment: %d" % len(no_std))
    if no_std:
        print("   ", no_std[:6])
    no_lab = [d["skillId"] for d in docs if d["studentLabel"] == d["displayName"]]
    print("  skills still using the formal name as the student label: %d" % len(no_lab))


if __name__ == "__main__":
    main()

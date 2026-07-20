#!/usr/bin/env python3
"""
Integrate the statistics expansion into the taxonomy source of record.

Adds a STAT course level and 33 new DTA skills so the strand can support a real
statistics course. Before this, DTA covered 6.SP / 8.SP / HSS-ID / HSS-CP but had
only 2 of 7 HSS-MD standards and NO sampling distribution, confidence interval or
significance test skill anywhere — a student could "finish" the strand on the
board without ever meeting statistics.

WHY STAT IS ITS OWN LEVEL. 26 of the 33 have no CCSS analog at any level: CCSS
deliberately stops at simulation-based informal inference. Tagging them ALG2
would nearly triple ALG2.DTA and offer AP-Statistics content to Algebra 2
students through the placement screener. The level order is an abstraction ladder
used to validate edge direction, NOT a claim that statistics comes after
precalculus or before calculus — AP Statistics and AP Calculus are peers. STAT
slots above ALG2 because every STAT cross-prerequisite points at ALG2 or below;
none reaches PREC or CALC.

PROVISIONAL SKILLS. 11 carry only unit-level AP-STATS codes. The AP Statistics
CED was restructured from 9 units to 5 effective 2026-27 and the official PDF was
not retrievable, so topic decimals were NOT guessed. Those skills are marked
`provisional: true` — they exist in the graph but are withheld from
student-facing surfaces until someone maps them against the current CED.

Idempotent. Usage: python3 scripts/integrateStatStrand.py --source PATH [--dry-run]
"""

import argparse
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TAX = os.path.join(ROOT, "seeds", "unified-taxonomy", "math_taxonomy.json")
LABELS = os.path.join(ROOT, "seeds", "unified-taxonomy", "student-labels.json")
STANDARDS = os.path.join(ROOT, "seeds", "unified-taxonomy", "standards-alignment.json")

# STAT sits above ALG2 (where its deepest prerequisite reaches) and below CALC so
# the board's top band stays calculus. Peers, not a sequence — see module docstring.
STAT_AFTER = "PREC"

TAXONOMY_FIELDS = ["skill_id", "course", "strand", "name", "desc", "grade",
                   "prereq_ids", "prereq_desc", "next_desc", "cross_prereq_ids"]

# Applied. The two the author marked OPTIONAL are deliberately left out — they
# change what gates an existing skill and want a human ruling.
NEW_EDGES = [
    ("ALG2.DTA.5", "prereq_ids", "ALG2.DTA.6"),
    ("ALG2.DTA.3", "cross_prereq_ids", "MS.DTA.8"),
    ("GEO.DTA.1", "cross_prereq_ids", "MS.DTA.8"),
    ("PREC.DTA.1", "cross_prereq_ids", "ALG1.DTA.5"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, help="dta-expansion.json from the authoring pass")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    expansion = json.load(open(args.source))
    tax = json.load(open(TAX))
    by_id = {s["skill_id"]: s for s in tax["skills"]}

    # --- course level --------------------------------------------------------
    if "STAT" not in tax["courses"]:
        tax["courses"].insert(tax["courses"].index(STAT_AFTER) + 1, "STAT")
        print("  + course level STAT (after %s)" % STAT_AFTER)

    # --- skills --------------------------------------------------------------
    added, skipped = [], []
    provisional = []
    labels = json.load(open(LABELS))
    standards = json.load(open(STANDARDS)) if os.path.exists(STANDARDS) else {}

    for s in expansion["skills"]:
        sid = s["skill_id"]
        if sid in by_id:
            skipped.append(sid)
            continue
        entry = {k: s.get(k, [] if k.endswith("_ids") or k.endswith("_desc") else "") for k in TAXONOMY_FIELDS}
        # A skill whose only codes are unit-level AP references has not been
        # verified against a retrievable source. Keep it out of the student's way.
        codes = s.get("standards") or []
        if codes and all(c.startswith("AP-") for c in codes):
            entry["provisional"] = True
            provisional.append(sid)
        tax["skills"].append(entry)
        by_id[sid] = entry
        added.append(sid)

        if s.get("student_label"):
            labels["labels"][sid] = s["student_label"]
        if codes:
            standards[sid] = sorted(set(codes))

    # --- edges onto existing skills -----------------------------------------
    edged = []
    for sid, field, prereq in NEW_EDGES:
        skill = by_id.get(sid)
        if skill is None:
            raise SystemExit("new_edge targets unknown skill: %s" % sid)
        if prereq not in by_id:
            raise SystemExit("new_edge references unknown prereq: %s" % prereq)
        cur = skill.setdefault(field, [])
        if prereq not in cur:
            cur.append(prereq)
            edged.append("%s.%s += %s" % (sid, field, prereq))

    print("  + %d skills (%d already present)" % (len(added), len(skipped)))
    print("  + %d edges onto existing skills" % len(edged))
    for e in edged:
        print("      %s" % e)
    print("  ! %d provisional (AP unit codes only, withheld from students):" % len(provisional))
    print("      %s" % ", ".join(provisional))

    if args.dry_run:
        print("\ndry run — nothing written")
        return

    for path, data in ((TAX, tax), (LABELS, labels), (STANDARDS, standards)):
        with open(path, "w") as fh:
            json.dump(data, fh, indent=1 if path is STANDARDS else 2,
                      ensure_ascii=False, sort_keys=(path is STANDARDS))
            fh.write("\n")

    print("\nwritten. Now run: python3 scripts/genUnifiedSkills.py")


if __name__ == "__main__":
    main()

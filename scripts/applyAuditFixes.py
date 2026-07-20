#!/usr/bin/env python3
"""
Apply the reviewed, unambiguous fixes from docs/SKILL_GRAPH_AUDIT_REVIEW.md to
the taxonomy source of record.

Scope is deliberately narrow: §1 (the product-thesis edge) and the four
data-entry errors. The remaining 19 bad edges / 164 missing prerequisites in
SKILL_GRAPH_AUDIT_FINDINGS.json involve judgment about how strict the graph
should be, and each new edge locks students behind more work — those stay
unapplied until ruled on.

Idempotent: re-running is a no-op. Prints a diff of what it changed.

Usage: python3 scripts/applyAuditFixes.py [--dry-run]
"""

import argparse
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TAX = os.path.join(ROOT, "seeds", "unified-taxonomy", "math_taxonomy.json")

# (skill_id, field, new_value, why)
FIXES = [
    # --- §1: the product thesis, absent from its own graph -------------------
    (
        "ALG1.EQV.9", "cross_prereq_ids", ["MS.EQV.2"],
        "Adding polynomials required GCF/LCM and did NOT require combining like "
        "terms. The EE Progression: collecting like terms 'should be seen as an "
        "application of the distributive law, not as a separate method'; A-APR.1: "
        "polynomials 'form a system analogous to the integers'. A student failing "
        "polynomial addition was bridged to GCF, which does not help.",
    ),
    (
        "ALG1.EQV.11", "cross_prereq_ids", ["MS.QNT.3"],
        "GCF/LCM is a real prerequisite -- for FACTORING, where it was missing "
        "entirely. The edge was misplaced, not wrong, so it moves here.",
    ),
    # --- data-entry errors ---------------------------------------------------
    (
        "ALG1.PRP.3", "prereq_ids", [],
        "Direct variation was gated behind slope. CCSS runs the other way: "
        "y=kx is 7.RP.A.2c and slope is derived FROM it at 8.EE.B.5-6.",
    ),
    (
        "ALG1.PRP.3", "cross_prereq_ids", ["MS.PRP.5"],
        "Direct variation's real parent is proportional relationships (7.RP.A.2).",
    ),
    (
        "ALG1.PRP.2", "prereq_ids", ["ALG1.PRP.3"],
        "Slope now follows direct variation, matching 8.EE.B.5-6. Also drops "
        "ALG1.PRP.1 (dimensional analysis), used as a catch-all parent with no "
        "standards support.",
    ),
    (
        "PREC.FNC.8", "cross_prereq_ids", ["ALG2.FNC.10"],
        "Exponential functions were wired to GEO.EQV.2 -- laws of detachment and "
        "syllogism. Near-certain data entry error. The real ancestor is the "
        "identical skill one level down, which was not linked at all.",
    ),
    (
        "ALG1.QNT.2", "cross_prereq_ids", ["MS.QNT.9"],
        "Exponent properties had no link to integer exponent properties -- same "
        "content, both 8.EE.A.1. Broke the exponent thread at the MS/ALG1 "
        "boundary and propagated into ALG2 rational exponents.",
    ),
    (
        "ALG2.EQV.7", "cross_prereq_ids", ["ALG1.EQV.10"],
        "Alg2 polynomial operations pointed at 'polynomial geometry models' -- an "
        "application, not a prerequisite -- leaving no path back to ALG1.EQV.9/10. "
        "The polynomial spine was broken.",
    ),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    tax = json.load(open(TAX))
    by_id = {s["skill_id"]: s for s in tax["skills"]}

    changed = 0
    for skill_id, field, new, why in FIXES:
        skill = by_id.get(skill_id)
        if skill is None:
            raise SystemExit("unknown skill in fix list: %s" % skill_id)
        old = skill.get(field) or []
        if old == new:
            print("  = %-13s %-18s already %s" % (skill_id, field, new))
            continue
        print("  ~ %-13s %-18s %s -> %s" % (skill_id, field, old, new))
        print("      %s" % why.replace("\n", "\n      "))
        skill[field] = new
        changed += 1

    if args.dry_run:
        print("\ndry run -- %d change(s) not written" % changed)
        return

    if changed:
        with open(TAX, "w") as fh:
            json.dump(tax, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
    print("\n%d change(s) written to %s" % (changed, os.path.relpath(TAX, ROOT)))
    print("Now run: python3 scripts/genUnifiedSkills.py")


if __name__ == "__main__":
    main()

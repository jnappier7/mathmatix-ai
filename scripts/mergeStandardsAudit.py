#!/usr/bin/env python3
"""
Assemble seeds/unified-taxonomy/standards-alignment.json from the per-strand
standards audits.

The audits produce two kinds of output and they are treated very differently:

  * STANDARDS CODES are additive metadata. A skill gaining "7.RP.A.2" changes
    nothing about how the system behaves — it labels existing content. Those are
    merged here and consumed by genUnifiedSkills.py.

  * GRAPH CHANGES (a spurious prerequisite, a missing edge, a wrong grade band)
    alter what the closure engine unlocks and what a student is allowed to
    start. Those are NOT applied here. They are extracted into a review file for
    a human to accept or reject, because some will be judgment calls the
    taxonomy author had a reason for.

Usage: python3 scripts/mergeStandardsAudit.py [--audit-dir DIR]
"""

import argparse
import json
import os
import re
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TAX = os.path.join(ROOT, "seeds", "skills-unified.json")
OUT = os.path.join(ROOT, "seeds", "unified-taxonomy", "standards-alignment.json")
REVIEW = os.path.join(ROOT, "docs", "SKILL_GRAPH_AUDIT_FINDINGS.json")
CCSS = os.path.join(ROOT, "seeds", "unified-taxonomy", "ccss-reference.json")

AUDIT_FILES = ["standards-QNT-PRP.json", "standards-EQV-FNC.json", "standards-SPC-DTA.json"]

# A bare CCSS-M code, or a framework-prefixed one for anything outside CCSS.
# Accepts sub-part granularity ("7.RP.A.2.b") as well as parent codes. Dropping
# sub-parts silently would lose exactly the precision the audit exists to add.
CCSS_RE = re.compile(r"^(K|[1-8]|HS[A-Z]{1,2})[.-][A-Z]{1,3}(\.[A-Z])?(\.\d+[a-z]?)?(\.[a-z])?$")
PREFIXED_RE = re.compile(r"^(AP-CALC|AP-PRECALC|AP-STATS|OH):[\w.\-]+$")


def valid_code(code):
    return bool(CCSS_RE.match(code) or PREFIXED_RE.match(code))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audit-dir", required=True, help="directory holding the per-strand audit JSON")
    args = ap.parse_args()

    skills = {d["skillId"]: d for d in json.load(open(TAX))}
    ccss = json.load(open(CCSS)) if os.path.exists(CCSS) else {}

    alignment = {}
    findings = {"bad_edges": [], "missing_prereqs": [], "grade_errors": [],
                "coverage_gaps": [], "low_confidence": [], "unverified_codes": [], "notes": []}
    seen = Counter()
    unknown_codes = defaultdict(list)

    for name in AUDIT_FILES:
        path = os.path.join(args.audit_dir, name)
        if not os.path.exists(path):
            print("  MISSING audit: %s (skipping)" % name)
            continue
        data = json.load(open(path))

        for gap in data.get("dta_coverage_gaps", []) + data.get("coverage_gaps", []):
            findings["coverage_gaps"].append({"source": name, **(gap if isinstance(gap, dict) else {"note": gap})})
        for thread in data.get("threads", []):
            findings["notes"].append({"source": name, **thread})
        if data.get("transformations_verdict"):
            findings["notes"].append({"source": name, "transformations_verdict": data["transformations_verdict"]})

        for entry in data.get("skills", []):
            sid = entry.get("skill_id")
            if sid not in skills:
                print("  audit references unknown skill: %s" % sid)
                continue
            seen[sid] += 1

            codes = [c for c in (entry.get("standards") or []) if c and c != "no-ccss"]
            good = []
            for c in codes:
                if not valid_code(c):
                    unknown_codes[c].append(sid)
                    continue
                # A bare CCSS code we cannot find in the reference is suspect —
                # the whole point of the audit is that codes are traceable.
                if CCSS_RE.match(c) and ccss and c not in ccss:
                    findings["unverified_codes"].append({"skill_id": sid, "code": c,
                                                         "why": "not present in ccss-reference.json"})
                good.append(c)
            if good:
                alignment[sid] = sorted(set(good))

            for v in entry.get("prereq_verdict", []) or []:
                if v.get("verdict") and v["verdict"] != "ok":
                    findings["bad_edges"].append({"skill_id": sid, **v})
            for mp in entry.get("missing_prereqs", []) or []:
                findings["missing_prereqs"].append({"skill_id": sid, "should_require": mp})
            # Auditors write prose, not an enum: "ok — 4.NBT.B.4 is the fluency
            # standard" is a pass, not a finding. Only collect genuine mismatches.
            gc = (entry.get("grade_check") or "").strip()
            if gc and not gc.lower().startswith("ok"):
                findings["grade_errors"].append({"skill_id": sid, "note": gc})
            if entry.get("confidence") == "low":
                findings["low_confidence"].append({"skill_id": sid, "sources": entry.get("sources", [])})

    json.dump(alignment, open(OUT, "w"), indent=1, sort_keys=True, ensure_ascii=False)
    json.dump(findings, open(REVIEW, "w"), indent=1, ensure_ascii=False)

    covered = len(alignment)
    dupes = [s for s, n in seen.items() if n > 1]
    print("Wrote %d aligned skills -> %s" % (covered, os.path.relpath(OUT, ROOT)))
    print("  skills audited: %d of %d" % (len(seen), len(skills)))
    print("  skills with no code (incl. deliberate no-ccss): %d" % (len(skills) - covered))
    if dupes:
        print("  audited more than once (strand overlap):", dupes[:5])
    if unknown_codes:
        print("  MALFORMED codes rejected: %d distinct" % len(unknown_codes))
        for c, ids in list(unknown_codes.items())[:5]:
            print("     %r  (e.g. %s)" % (c, ids[0]))
    print("Findings for review -> %s" % os.path.relpath(REVIEW, ROOT))
    for k, v in findings.items():
        if v:
            print("  %-18s %d" % (k, len(v)))


if __name__ == "__main__":
    main()

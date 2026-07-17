#!/usr/bin/env python3
"""
Build the Algebra 1 -> unified taxonomy crosswalk (PR 3, step 1 of the bank
migration). Maps each of the 64 legacy Alg1 kebab skillIds to a unified
"Map of Mathmatix" skill_id, with an honest confidence rating and candidate
alternatives, so a human reviews the judgment calls before we re-tag 798 items.

This script does NOT touch the item bank or the DB. It only emits:
  seeds/unified-taxonomy/alg1-crosswalk.json   machine crosswalk (reviewed later)
  docs/ALG1_UNIFIED_REVIEW.md                  human-review worksheet

Confidence:
  high  unambiguous 1:1 with a unified skill
  med   correct target but granularity differs (unified is broader/narrower) — confirm
  low   genuinely uncertain / no clean home — needs a human decision

Every mapping's target and alternatives are validated against the taxonomy, so a
typo can't slip into the crosswalk. Item counts come from the generated bank so
the worksheet can rank the judgment calls by how many items they move.

Usage: python3 scripts/alg1UnifiedCrosswalk.py
"""

import json
import os
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

TAX = os.path.join(ROOT, "seeds", "unified-taxonomy", "math_taxonomy.json")
NAMES = os.path.join(ROOT, "seeds", "alg1-skill-names.json")
ITEMS = os.path.join(ROOT, "seeds", "alg1-items.generated.json")

CROSSWALK_OUT = os.path.join(ROOT, "seeds", "unified-taxonomy", "alg1-crosswalk.json")
REVIEW_OUT = os.path.join(ROOT, "docs", "ALG1_UNIFIED_REVIEW.md")

# legacy_id: (unified_id, confidence, [alternatives], note)
# Ordered roughly by the Alg1 course sequence. Alternatives are the other
# plausible unified homes a reviewer might prefer.
MAP = {
    # — expressions & numeric fluency (mostly MS prerequisites) —
    "order-of-operations":        ("MS.QNT.8",  "low", ["MS.EQV.1"], "no dedicated order-of-operations node; nearest is rational-number operations"),
    "evaluating-expressions":     ("MS.EQV.1",  "med", [],           "substitution/evaluation folded into 'Algebraic expressions'"),
    "writing-algebraic-expressions": ("MS.EQV.1", "high", [],        "translating words -> expressions"),
    "integer-operations":         ("MS.QNT.8",  "low", ["MS.QNT.6", "MS.QNT.7"], "unified splits integers into add/sub vs mult/div; mapped to the umbrella"),
    "fraction-operations":        ("MS.QNT.8",  "med", ["MS.QNT.2"], "fraction ops under rational-number operations"),
    "decimal-operations":         ("MS.QNT.1",  "high", [],          "decimal operations fluency"),

    # — linear equations —
    "solving-one-step-equations": ("MS.EQV.3",  "high", [],          None),
    "solving-two-step-equations": ("MS.EQV.5",  "high", [],          None),
    "solving-multi-step-equations": ("ALG1.EQV.1", "high", [],       None),
    "solving-equations-with-variables-both-sides": ("ALG1.EQV.1", "med", [], "both-sides folded into multi-step linear equations"),
    "solving-proportions":        ("MS.PRP.6",  "high", [],          None),
    "literal-equations":          ("ALG1.EQV.2", "high", [],         None),
    "writing-solving-equations-context": ("ALG1.EQV.1", "med", ["MS.EQV.8"], "no 'equations from context' node; mapped to multi-step"),
    "linear-equations-number-of-solutions": ("ALG1.EQV.1", "low", [], "no dedicated 'number of solutions' node"),

    # — functions —
    "function-notation-evaluation": ("ALG1.FNC.1", "high", [],       None),
    "domain-and-range":           ("ALG1.FNC.2", "high", [],         None),
    "identifying-functions":      ("MS.FNC.2",  "med", ["ALG1.FNC.1"], "is-it-a-function / vertical line test -> function concept"),
    "discrete-continuous-relations": ("MS.FNC.2", "low", ["ALG1.FNC.2"], "no dedicated discrete/continuous node"),
    "interpreting-graphs-stories": ("MS.FNC.1", "low", ["ALG1.FNC.3"], "story-graph matching; no dedicated node"),
    "function-application-modeling": ("ALG1.FNC.4", "low", ["MS.FNC.1"], "generic 'function models in context'"),

    # — slope & graphing lines —
    "slope-from-two-points":      ("MS.FNC.3",  "med", ["ALG1.PRP.2"], "slope computation -> 'Slope'; ALG1.PRP.2 if framed as rate"),
    "slope-intercept-from-equation": ("ALG1.FNC.3", "med", ["MS.FNC.3"], "reading slope/intercept off an equation"),
    "reading-slope-from-graph":   ("MS.FNC.3",  "med", ["ALG1.FNC.3"], "reading slope/intercept off a graph"),
    "undefined-zero-slope":       ("MS.FNC.3",  "med", ["ALG1.PRP.2"], "special slope cases"),
    "graphing-linear-equations-slope-intercept": ("ALG1.FNC.3", "high", [], None),
    "linear-modeling-slope-intercept": ("ALG1.FNC.4", "med", [],     "linear models -> write linear equations"),
    "absolute-value-graphs-transformations": ("ALG1.FNC.11", "med", ["ALG2.FNC.4"], "abs-value graphs under function transformations"),

    # — writing lines / forms —
    "writing-linear-equations-slope-intercept": ("ALG1.FNC.4", "high", [], None),
    "point-slope-form":           ("ALG1.FNC.4", "med", [],          "no dedicated point-slope node; under write-linear-equations"),
    "standard-form-equations":    ("ALG1.FNC.4", "med", ["ALG1.FNC.3"], "no dedicated standard-form node"),
    "standard-to-slope-intercept": ("ALG1.FNC.4", "low", ["ALG1.FNC.3"], "form conversion; no dedicated node"),
    "converting-between-forms":   ("ALG1.FNC.4", "low", ["ALG1.FNC.3"], "form conversion; no dedicated node"),
    "linear-equation-forms-reference": ("ALG1.FNC.4", "low", ["ALG1.FNC.3"], "reference/meta skill, not a distinct competency"),
    "parallel-perpendicular-lines": ("ALG1.FNC.4", "low", [],        "parallel/perp slopes; no dedicated node in ALG1"),
    "linear-modeling-writing-equations": ("ALG1.FNC.4", "high", [],  None),

    # — inequalities —
    "solving-one-variable-inequalities": ("ALG1.EQV.3", "high", [],  None),
    "solving-graphing-inequalities": ("ALG1.EQV.3", "med", ["ALG1.FNC.5"], "one-variable solve+graph on a number line"),
    "matching-inequality-graphs": ("ALG1.EQV.3", "med", ["ALG1.FNC.5"], "number-line match; FNC.5 if two-variable"),
    "compound-inequalities":      ("ALG1.EQV.4", "high", [],         None),
    "writing-solving-inequalities-context": ("ALG1.EQV.3", "med", [], "inequalities from context; no dedicated node"),

    # — systems —
    "checking-system-solutions":  ("ALG1.EQV.6", "low", ["ALG1.EQV.7"], "verifying a system solution; no dedicated node"),
    "systems-of-equations-graphing": ("ALG1.EQV.6", "high", [],      None),
    "systems-of-equations-substitution": ("ALG1.EQV.7", "high", [],  None),
    "systems-of-equations-elimination": ("ALG1.EQV.8", "high", [],   None),
    "classifying-system-solutions": ("ALG1.EQV.6", "low", ["ALG1.EQV.7"], "0/1/inf solutions of a system; no dedicated node"),
    "systems-application-modeling": ("ALG1.EQV.7", "low", ["ALG1.EQV.8"], "systems word problems; no dedicated node"),
    "choosing-a-solution-method": ("ALG1.EQV.7", "low", ["ALG1.EQV.8"], "meta 'pick a method'; no dedicated node"),

    # — polynomials —
    "polynomial-addition-subtraction": ("ALG1.EQV.9", "high", [],    None),
    "polynomial-multiplication-monomial": ("ALG1.EQV.10", "high", [], None),
    "multiplying-binomials":      ("ALG1.EQV.10", "high", [],        None),
    "special-products":           ("ALG1.EQV.10", "med", ["ALG1.EQV.14"], "special-product *multiplication*; EQV.14 is the factoring side"),
    "factoring-gcf":              ("ALG1.EQV.11", "high", [],        None),
    "factoring-by-grouping":      ("ALG1.EQV.11", "high", [],        None),
    "factoring-trinomials":       ("ALG1.EQV.12", "med", ["ALG1.EQV.13"], "unified splits simple (a=1) vs a>1 trinomials"),
    "factoring-application":      ("ALG1.SPC.2", "med", ["ALG1.EQV.11"], "factoring in an area context -> polynomial geometry models"),

    # — quadratics —
    "quadratic-abc-identification": ("ALG1.EQV.17", "med", [],       "identifying a,b,c as prep for the quadratic formula"),
    "choosing-quadratic-method":  ("ALG1.EQV.15", "low", ["ALG1.EQV.17"], "meta 'pick a method'; no dedicated node"),
    "solving-quadratics-square-roots": ("ALG1.EQV.15", "low", ["ALG1.EQV.16"], "no square-root-method node; EQV.15/16 are the nearest solving skills"),
    "solving-quadratics-factoring": ("ALG1.EQV.15", "high", [],      None),
    "completing-the-square":      ("ALG1.EQV.16", "high", [],        None),
    "quadratic-formula":          ("ALG1.EQV.17", "high", [],        None),
    "discriminant-number-of-solutions": ("ALG1.EQV.17", "med", [],   "discriminant folded into the quadratic-formula skill"),
    "quadratic-equations-graphing": ("ALG1.FNC.10", "high", [],      None),
    "quadratic-application":      ("ALG1.FNC.10", "low", ["ALG1.EQV.15"], "quadratic modeling; FNC.10 (graph) vs EQV.15 (solve)"),
}


def main():
    tax = json.load(open(TAX))
    names = json.load(open(NAMES))
    items = json.load(open(ITEMS))
    tax_name = {s["skill_id"]: s["name"] for s in tax["skills"]}
    tax_ids = set(tax_name)
    counts = Counter(i["skillId"] for i in items)

    # ---- validate ----
    problems = []
    for legacy in names:
        if legacy not in MAP:
            problems.append("legacy skill not mapped: %s" % legacy)
    for legacy, (uid, conf, alts, note) in MAP.items():
        if legacy not in names:
            problems.append("mapped a legacy id that isn't in the bank: %s" % legacy)
        if uid not in tax_ids:
            problems.append("%s -> unknown unified id %s" % (legacy, uid))
        for a in alts:
            if a not in tax_ids:
                problems.append("%s alternative %s not in taxonomy" % (legacy, a))
        if conf not in ("high", "med", "low"):
            problems.append("%s bad confidence %r" % (legacy, conf))
    if problems:
        print("VALIDATION FAILED:")
        for p in problems:
            print("  x", p)
        raise SystemExit(1)

    # ---- build crosswalk ----
    rows = []
    for legacy, (uid, conf, alts, note) in MAP.items():
        rows.append({
            "legacyId": legacy,
            "legacyName": names[legacy],
            "unifiedId": uid,
            "unifiedName": tax_name[uid],
            "confidence": conf,
            "itemCount": counts.get(legacy, 0),
            "alternatives": [{"id": a, "name": tax_name[a]} for a in alts],
            "note": note,
            "approved": conf == "high",   # high are pre-approved; human confirms med/low
        })

    by_conf = Counter(r["confidence"] for r in rows)
    items_needing_review = sum(r["itemCount"] for r in rows if r["confidence"] != "high")
    distinct_targets = len({r["unifiedId"] for r in rows})

    crosswalk = {
        "source": "algebra-1",
        "legacySkillCount": len(rows),
        "distinctUnifiedTargets": distinct_targets,
        "totalItems": sum(counts.values()),
        "confidenceCounts": dict(by_conf),
        "itemsNeedingReview": items_needing_review,
        "rows": rows,
    }
    json.dump(crosswalk, open(CROSSWALK_OUT, "w"), indent=2, ensure_ascii=False)

    # ---- human worksheet: med/low first, ranked by item leverage ----
    def block(title, conf):
        sel = sorted([r for r in rows if r["confidence"] == conf],
                     key=lambda r: -r["itemCount"])
        if not sel:
            return []
        out = ["", "## %s (%d skills, %d items)" % (title, len(sel), sum(r["itemCount"] for r in sel)), ""]
        out.append("| ✔ | items | legacy skill | → proposed unified | alternatives | note |")
        out.append("|---|------:|--------------|--------------------|--------------|------|")
        for r in sel:
            alts = ", ".join("`%s` %s" % (a["id"], a["name"]) for a in r["alternatives"]) or "—"
            out.append("| ☐ | %d | `%s` %s | `%s` **%s** | %s | %s |" % (
                r["itemCount"], r["legacyId"], r["legacyName"],
                r["unifiedId"], r["unifiedName"], alts, r["note"] or ""))
        return out

    md = [
        "# Algebra 1 → Map of Mathmatix — migration review",
        "",
        "First step of migrating the Algebra 1 bank onto the unified taxonomy "
        "(`seeds/unified-taxonomy/math_taxonomy.json`). Auto-generated by "
        "`scripts/alg1UnifiedCrosswalk.py`; the machine crosswalk is "
        "`seeds/unified-taxonomy/alg1-crosswalk.json`.",
        "",
        "**Nothing has been re-tagged yet.** This is the review gate: confirm or "
        "correct the judgment calls below, then the crosswalk is applied to the "
        "798 items and re-seeded.",
        "",
        "## Summary",
        "",
        "- **%d** legacy Alg1 skills → **%d** distinct unified skills." % (len(rows), distinct_targets),
        "- Confidence: **%d high** (pre-approved), **%d medium**, **%d low**."
        % (by_conf.get("high", 0), by_conf.get("med", 0), by_conf.get("low", 0)),
        "- **%d of %d items** sit under a medium/low mapping — that's where your review matters."
        % (items_needing_review, sum(counts.values())),
        "",
        "### How to review",
        "",
        "For each row in the **medium** and **low** tables: tick ✔ if the proposed "
        "unified skill is right, or write the id you'd prefer (alternatives listed). "
        "The **high** table is included last for completeness — skim, don't sweat it. "
        "I'll apply your edits to the crosswalk and run the re-tag + re-seed.",
    ]
    md += block("🔴 LOW confidence — needs a decision", "low")
    md += block("🟡 MEDIUM confidence — quick confirm", "med")
    md += block("🟢 HIGH confidence — pre-approved (skim)", "high")
    md.append("")
    open(REVIEW_OUT, "w").write("\n".join(md))

    print("Alg1 -> unified crosswalk built.")
    print("  %d legacy skills -> %d unified skills | %d total items"
          % (len(rows), distinct_targets, sum(counts.values())))
    print("  confidence: %d high / %d med / %d low  |  %d items under med/low (review)"
          % (by_conf.get("high", 0), by_conf.get("med", 0), by_conf.get("low", 0), items_needing_review))
    print("  wrote %s" % os.path.relpath(CROSSWALK_OUT, os.getcwd()))
    print("  wrote %s" % os.path.relpath(REVIEW_OUT, os.getcwd()))


if __name__ == "__main__":
    main()

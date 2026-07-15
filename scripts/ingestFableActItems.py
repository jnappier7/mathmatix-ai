#!/usr/bin/env python3
"""
Ingest Fable-authored ACT Math tests (seeds/fable-act/test*.json) into our
Problem schema, rendering each matplotlib `figure_code` to inline SVG.

These are the current-spec ACT items: 45 questions, 4 choices (A-D), the six
ACT reporting categories, worked explanations, and machine `verify` snippets.
Every item was checked with Fable's validate_all.py (answers correct; the only
validator flags were formatting differences, not wrong keys).

Output: seeds/act-fable-items.generated.json — an array of Problem docs the
Node seeder (scripts/seedActItems.js) upserts into MongoDB.

Usage: python3 scripts/ingestFableActItems.py
(Requires matplotlib — already in the Docker image.)
"""

import json
import io
import os
import hashlib

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "seeds", "fable-act")
OUT = os.path.join(ROOT, "seeds", "act-fable-items.generated.json")

# Fable category code -> our skillId + human category name. Category-level for
# now; when Fable emits a finer `skill` per item we switch to that.
CAT = {
    "NQ":  ("act-number-quantity",           "number-quantity"),
    "ALG": ("act-algebra",                   "algebra"),
    "FUN": ("act-functions",                 "functions"),
    "GEO": ("act-geometry",                  "geometry"),
    "SP":  ("act-statistics-probability",    "statistics-probability"),
    "IES": ("act-integrating-essential-skills", "integrating-essential-skills"),
}
LETTERS = ["A", "B", "C", "D", "E"]


def render_svg(figure_code):
    """Run a `def draw(ax):` snippet and return a clean inline <svg> string."""
    if not figure_code:
        return None
    ns = {}
    try:
        exec(figure_code, ns)
        draw = ns.get("draw")
        if not callable(draw):
            return None
        fig, ax = plt.subplots(figsize=(2.6, 2.1))
        draw(ax)
        ax.axis("off")
        buf = io.StringIO()
        fig.savefig(buf, format="svg", bbox_inches="tight")
        plt.close(fig)
        svg = buf.getvalue()
        i = svg.find("<svg")
        return svg[i:].strip() if i >= 0 else None
    except Exception as e:  # a bad figure shouldn't drop the whole item
        print(f"  [warn] figure render failed: {type(e).__name__}: {e}")
        try:
            plt.close("all")
        except Exception:
            pass
        return None


def to_problem(test_no, q):
    cat_code = q["category"]
    skill_id, category = CAT.get(cat_code, ("act-unknown", "unknown"))
    choices = q["choices"]
    answer_idx = q["answer"]
    stem = q["stem"]

    problem_id = "act-fable-t%dq%d" % (test_no, q["n"])
    content_hash = hashlib.sha256(("%s|%s" % (problem_id, stem)).encode("utf-8")).hexdigest()
    svg = render_svg(q.get("figure_code"))

    return {
        "problemId": problem_id,
        "skillId": skill_id,
        "prompt": stem,
        "svg": svg,
        "answer": {"type": "auto", "value": choices[answer_idx], "equivalents": []},
        "answerType": "multiple-choice",
        "options": [{"label": LETTERS[i], "text": t} for i, t in enumerate(choices)],
        "correctOption": LETTERS[answer_idx],
        "difficulty": max(1, min(5, int(q.get("difficulty", 3)))),
        "gradeBand": "8-12",
        "explanation": q.get("explanation") or None,
        "tags": ["act", "act-math", "fable", category, cat_code],
        "source": "act-fable",
        "contentHash": content_hash,
        "isActive": True,
    }


def main():
    items = []
    figs = 0
    per_cat = {}
    for t in range(1, 6):
        path = os.path.join(SRC, "test%d.json" % t)
        data = json.load(open(path))
        qs = data["questions"]
        for q in qs:
            doc = to_problem(t, q)
            if doc["svg"]:
                figs += 1
            per_cat[doc["skillId"]] = per_cat.get(doc["skillId"], 0) + 1
            items.append(doc)

    # de-dupe by problemId (defensive)
    seen = {}
    for it in items:
        seen[it["problemId"]] = it
    items = list(seen.values())

    with open(OUT, "w") as f:
        json.dump(items, f, indent=2, ensure_ascii=False)

    print("Ingested %d items -> %s" % (len(items), os.path.relpath(OUT, os.getcwd())))
    print("  with figures (SVG): %d" % figs)
    print("  per skill:")
    for k in sorted(per_cat):
        print("    %-34s %d" % (k, per_cat[k]))
    with_expl = sum(1 for it in items if it["explanation"])
    print("  with explanations: %d/%d" % (with_expl, len(items)))


if __name__ == "__main__":
    main()

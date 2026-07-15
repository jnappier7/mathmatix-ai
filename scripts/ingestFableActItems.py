#!/usr/bin/env python3
"""
Ingest Fable-authored ACT Math tests (seeds/fable-act/test*.json) into our
Problem schema, rendering each matplotlib `figure_code` to inline SVG.

Current-spec ACT items (2025+): 45 questions, 4 choices, the six ACT reporting
categories, worked explanations, machine `verify` snippets, and a per-item
fine-grained `skill` (e.g. "Quadratic equations"). We tag each Problem with the
fine skill (skillId slug) so the diagnostic and personalization work at the
exact-skill level, and group by category in the blueprint.

Outputs:
  seeds/act-fable-items.generated.json   Problem docs (array)
  seeds/act-skill-names.json             { skillId: "Readable name" }
  seeds/act-skills-by-category.json      { category: [skillId, ...] }

Usage: python3 scripts/ingestFableActItems.py   (requires matplotlib)
"""

import json
import io
import os
import re
import hashlib
from collections import defaultdict

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "seeds", "fable-act")
OUT = os.path.join(ROOT, "seeds", "act-fable-items.generated.json")
NAMES_OUT = os.path.join(ROOT, "seeds", "act-skill-names.json")
CATS_OUT = os.path.join(ROOT, "seeds", "act-skills-by-category.json")

# Fable category code -> our category name.
CAT = {
    "NQ":  "number-quantity",
    "ALG": "algebra",
    "FUN": "functions",
    "GEO": "geometry",
    "SP":  "statistics-probability",
    "IES": "integrating-essential-skills",
}
LETTERS = ["A", "B", "C", "D", "E"]


def slug(name):
    return "act-" + re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", name.lower())).strip("-")


def render_svg(figure_code):
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
        try:
            ax.axis("off")
        except Exception:
            pass
        buf = io.StringIO()
        fig.savefig(buf, format="svg", bbox_inches="tight")
        plt.close(fig)
        svg = buf.getvalue()
        i = svg.find("<svg")
        return svg[i:].strip() if i >= 0 else None
    except Exception as e:
        print(f"  [warn] figure render failed: {type(e).__name__}: {e}")
        try:
            plt.close("all")
        except Exception:
            pass
        return None


def main():
    items = []
    names = {}
    by_cat = defaultdict(set)
    figs = 0
    for t in range(1, 6):
        data = json.load(open(os.path.join(SRC, "test%d.json" % t)))
        for q in data["questions"]:
            category = CAT.get(q["category"], "unknown")
            skill_name = q.get("skill") or category
            skill_id = slug(skill_name)
            names[skill_id] = skill_name
            by_cat[category].add(skill_id)

            choices = q["choices"]
            ai = q["answer"]
            pid = "act-fable-t%dq%d" % (t, q["n"])
            svg = render_svg(q.get("figure_code"))
            if svg:
                figs += 1

            items.append({
                "problemId": pid,
                "skillId": skill_id,
                "prompt": q["stem"],
                "svg": svg,
                "answer": {"type": "auto", "value": choices[ai], "equivalents": []},
                "answerType": "multiple-choice",
                "options": [{"label": LETTERS[i], "text": c} for i, c in enumerate(choices)],
                "correctOption": LETTERS[ai],
                "difficulty": max(1, min(5, int(q.get("difficulty", 3)))),
                "gradeBand": "8-12",
                "explanation": q.get("explanation") or None,
                "tags": ["act", "act-math", "fable", category, q["category"]],
                "source": "act-fable",
                "contentHash": hashlib.sha256(("%s|%s" % (pid, q["stem"])).encode("utf-8")).hexdigest(),
                "isActive": True,
            })

    # de-dupe by problemId
    items = list({it["problemId"]: it for it in items}.values())

    json.dump(items, open(OUT, "w"), indent=2, ensure_ascii=False)
    json.dump(names, open(NAMES_OUT, "w"), indent=2, ensure_ascii=False)
    json.dump({c: sorted(v) for c, v in by_cat.items()}, open(CATS_OUT, "w"), indent=2, ensure_ascii=False)

    print("Ingested %d items -> %s" % (len(items), os.path.relpath(OUT, os.getcwd())))
    print("  figures (SVG): %d | explanations: %d" % (figs, sum(1 for i in items if i["explanation"])))
    print("  distinct skills: %d across %d categories" % (len(names), len(by_cat)))
    print("  wrote %s and %s" % (os.path.basename(NAMES_OUT), os.path.basename(CATS_OUT)))


if __name__ == "__main__":
    main()

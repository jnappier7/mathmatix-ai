#!/usr/bin/env python3
"""
Ingest the Fable AP Calculus AB bootcamp bank (seeds/calc-ab/calc_w*.json) into
our Problem schema, and emit the weekly assessment map the bootcamp rail consumes.

Each weekly diagnostic = 15 MC (auto-scorable) + 1 multi-part FRQ (tutor-scored
against a rubric). MC items become Problem docs tagged with an existing catalog
skillId (scripts/calcSkillMap.py) plus unit / Mathematical Practice / calculator
tags; the FRQ is preserved whole in the assessment map (it isn't an MC Problem).
Figures render to SVG via scripts/calcFigureRenderer.py.

Outputs:
  seeds/calc-items.generated.json    MC Problem docs (array, 75)
  seeds/calc-assessment-map.json     week -> {title, mc:[...refs], frq:{...}}  (rail input)
  seeds/calc-skill-coverage.json     catalog skill -> count, unit -> [skillId]

Usage: python3 scripts/ingestCalcItems.py   (requires matplotlib, numpy)
"""

import json
import os
import re
import hashlib
from collections import defaultdict

import calcFigureRenderer as figrender      # scripts/ is sys.path[0] when run as a script
from calcSkillMap import catalog_skill

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "seeds", "calc-ab")

ITEMS_OUT = os.path.join(ROOT, "seeds", "calc-items.generated.json")
MAP_OUT = os.path.join(ROOT, "seeds", "calc-assessment-map.json")
COVERAGE_OUT = os.path.join(ROOT, "seeds", "calc-skill-coverage.json")

WEEKS = [1, 2, 3, 4, 5]
LETTERS = ["A", "B", "C", "D", "E"]

# AP CED unit -> Skill.category enum (matches seeds/skills-ap-calculus-ab.json).
UNIT_CATEGORY = {
    "U1": "limits", "U2": "derivatives", "U3": "derivatives",
    "U4": "applications-derivatives", "U5": "applications-derivatives",
    "U6": "integrals", "U7": "differential-equations", "U8": "applications-integrals",
}


def render_fig(fig):
    if not fig:
        return None
    return figrender.render(fig.get("kind"), fig.get("params"))


def mc_problem(wk, it):
    n = it["n"]
    skill_label = it["skill"]
    skill_id = catalog_skill(skill_label) or "unmapped"
    ai = it["answer"]
    choices = it["choices"]
    pid = "calc-ab-w%dq%d" % (wk, n)
    svg = render_fig(it.get("figure"))
    tags = ["calc-ab", "ap-calc-ab", it["unit"], it.get("practice", "MP1"),
            "week%d" % wk, "calc" if it.get("calc") else "no-calc",
            "subskill:%s" % skill_label]
    return {
        "problemId": pid,
        "skillId": skill_id,
        "prompt": it["stem"],
        "svg": svg,
        "answer": {"type": "exact", "value": choices[ai], "equivalents": []},
        "answerType": "multiple-choice",
        "options": [{"label": LETTERS[i], "text": str(c)} for i, c in enumerate(choices)],
        "correctOption": LETTERS[ai],
        "difficulty": 3,                       # AP items are mixed; bank carries no per-item rank
        "gradeBand": "Calculus",
        "explanation": it.get("explanation") or None,
        "tags": tags,
        "source": "calc-fable",
        "contentHash": hashlib.sha256(("%s|%s" % (pid, it["stem"])).encode("utf-8")).hexdigest(),
        "isActive": True,
    }


def main():
    items = []
    amap = {}
    by_skill = defaultdict(int)
    by_unit = defaultdict(set)
    unmapped = []
    figs = 0

    for wk in WEEKS:
        data = json.load(open(os.path.join(SRC, "calc_w%d.json" % wk)))
        mc_refs = []
        for it in data["mc"]:
            doc = mc_problem(wk, it)
            if doc["svg"]:
                figs += 1
            if doc["skillId"] == "unmapped":
                unmapped.append((wk, it["n"], it["skill"]))
            items.append(doc)
            by_skill[doc["skillId"]] += 1
            by_unit[it["unit"]].add(doc["skillId"])
            mc_refs.append({
                "problemId": doc["problemId"], "n": it["n"], "unit": it["unit"],
                "skill": it["skill"], "skillId": doc["skillId"],
                "practice": it.get("practice"), "calc": bool(it.get("calc")),
            })

        frq = data["frq"]
        frq_skill = catalog_skill(frq["skill"]) or "unmapped"
        by_unit[frq["unit"]].add(frq_skill)
        frq_out = {
            "unit": frq["unit"], "skill": frq["skill"], "skillId": frq_skill,
            "calc": bool(frq.get("calc")), "context": frq.get("context"),
            "svg": render_fig(frq.get("figure")),
            "points": sum(p.get("points", 0) for p in frq.get("parts", [])),
            "parts": [{
                "label": p["label"], "prompt": p["prompt"], "points": p.get("points"),
                "solution": p.get("solution"), "rubric": p.get("rubric", []),
            } for p in frq.get("parts", [])],
        }
        if frq_out["svg"]:
            figs += 1

        amap[str(wk)] = {
            "week": wk, "title": data["title"],
            "mcCount": len(mc_refs), "frqPoints": frq_out["points"],
            "mc": mc_refs, "frq": frq_out,
        }

    json.dump(items, open(ITEMS_OUT, "w"), indent=2, ensure_ascii=False)
    json.dump(amap, open(MAP_OUT, "w"), indent=2, ensure_ascii=False)
    json.dump({
        "bySkill": dict(sorted(by_skill.items())),
        "byUnit": {u: sorted(s) for u, s in sorted(by_unit.items())},
        "categoryForUnit": UNIT_CATEGORY,
    }, open(COVERAGE_OUT, "w"), indent=2, ensure_ascii=False)

    n_expl = sum(1 for i in items if i["explanation"])
    print("Ingested %d MC Problem docs -> %s" % (len(items), os.path.relpath(ITEMS_OUT, os.getcwd())))
    print("  weeks: %d | figures (svg): %d | explanations: %d | catalog skills used: %d"
          % (len(WEEKS), figs, n_expl, len({i["skillId"] for i in items})))
    if unmapped:
        print("  [warn] %d items with an UNMAPPED skill: %s" % (len(unmapped), unmapped[:6]))
    else:
        print("  all items mapped to a catalog skillId")
    print("  wrote %s and %s" % (os.path.basename(MAP_OUT), os.path.basename(COVERAGE_OUT)))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Ingest the Fable Digital SAT Math bank (seeds/sat-math/sat_w*.json) into our
Problem schema under the UNIFIED taxonomy (Map of Mathmatix) skill ids, and emit
the weekly assessment map the SAT bootcamp rail consumes.

The Digital SAT Math section is fully auto-scored — no free-response/rubric step.
Two item types:
  - mc  : 4-option (A-D) multiple choice        -> answerType 'multiple-choice'
  - spr : student-produced response (grid-in)   -> answerType 'constructed-response'
          (auto-scored by canonical value + accepted equivalents)

Each item's (domain, skill) label maps to a unified skill_id via
scripts/satSkillMap.py. Figures render to SVG via scripts/satFigureRenderer.py.

Outputs:
  seeds/sat-items.generated.json    Problem docs (array: MC + SPR)
  seeds/sat-assessment-map.json     week -> {title, items:[...refs]}  (rail input)
  seeds/sat-skill-coverage.json     unified skillId -> count, domain -> [skillId]

Usage: python3 scripts/ingestSatItems.py   (requires matplotlib for figures)
"""

import json
import os
import hashlib
from collections import defaultdict

import satFigureRenderer as figrender     # scripts/ is sys.path[0] when run as a script
from satSkillMap import unified_skill

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "seeds", "sat-math")

ITEMS_OUT = os.path.join(ROOT, "seeds", "sat-items.generated.json")
MAP_OUT = os.path.join(ROOT, "seeds", "sat-assessment-map.json")
COVERAGE_OUT = os.path.join(ROOT, "seeds", "sat-skill-coverage.json")

WEEKS = [1, 2, 3, 4, 5]
LETTERS = ["A", "B", "C", "D"]

# Digital SAT Math domains -> friendly tag.
DOMAIN_NAME = {
    "ALG": "algebra",
    "ADV": "advanced-math",
    "PSDA": "problem-solving-data",
    "GEO": "geometry-trig",
}

# Fable difficulty band -> our 1-5 scale (SAT items span easy/medium/hard).
DIFFICULTY = {"E": 2, "M": 3, "H": 4}


def render_fig(fig):
    if not fig:
        return None
    return figrender.render(fig.get("kind"), fig.get("params"))


def _dedupe(seq):
    seen, out = set(), []
    for v in seq:
        s = str(v).strip()
        if s and s.lower() not in seen:
            seen.add(s.lower())
            out.append(s)
    return out


def problem_doc(wk, it):
    n = it["n"]
    domain = it["domain"]
    label = it["skill"]
    skill_id = unified_skill(domain, label) or "unmapped"
    pid = "sat-math-w%dq%d" % (wk, n)
    svg = render_fig(it.get("figure"))
    tags = ["sat-math", DOMAIN_NAME.get(domain, domain.lower()), "week%d" % wk,
            it["type"], "subskill:%s" % label]

    doc = {
        "problemId": pid,
        "skillId": skill_id,
        "prompt": it["stem"],
        "svg": svg,
        "difficulty": DIFFICULTY.get(it.get("difficulty"), 3),
        "gradeBand": "8-12",
        "explanation": it.get("explanation") or None,
        "tags": tags,
        "source": "sat-fable",
        "contentHash": hashlib.sha256(("%s|%s" % (pid, it["stem"])).encode("utf-8")).hexdigest(),
        "isActive": True,
    }

    if it["type"] == "mc":
        ai = it["answer"]
        choices = it["choices"]
        doc["answerType"] = "multiple-choice"
        doc["answer"] = {"type": "exact", "value": str(choices[ai]), "equivalents": []}
        doc["options"] = [{"label": LETTERS[i], "text": str(c)} for i, c in enumerate(choices)]
        doc["correctOption"] = LETTERS[ai]
    else:  # spr (grid-in) — auto-scored against canonical value + equivalents
        primary = str(it["spr_answer"])
        equivs = _dedupe(list(it.get("equivalents") or []) + list(it.get("answer_any") or []))
        # don't repeat the primary value inside equivalents
        equivs = [e for e in equivs if e.strip().lower() != primary.strip().lower()]
        doc["answerType"] = "constructed-response"
        doc["answer"] = {"type": "exact", "value": primary, "equivalents": equivs}

    return doc


def main():
    items = []
    amap = {}
    by_skill = defaultdict(int)
    by_domain = defaultdict(set)
    unmapped = []
    figs = 0
    n_mc = n_spr = 0

    for wk in WEEKS:
        data = json.load(open(os.path.join(SRC, "sat_w%d.json" % wk)))
        refs = []
        for it in data["items"]:
            doc = problem_doc(wk, it)
            if doc["svg"]:
                figs += 1
            if doc["skillId"] == "unmapped":
                unmapped.append((wk, it["n"], it["domain"], it["skill"]))
            if doc["answerType"] == "multiple-choice":
                n_mc += 1
            else:
                n_spr += 1
            items.append(doc)
            by_skill[doc["skillId"]] += 1
            by_domain[it["domain"]].add(doc["skillId"])
            refs.append({
                "problemId": doc["problemId"], "n": it["n"], "domain": it["domain"],
                "skill": it["skill"], "skillId": doc["skillId"],
                "type": it["type"], "difficulty": it.get("difficulty"),
            })

        amap[str(wk)] = {
            "week": wk, "title": data["title"],
            "itemCount": len(refs),
            "mcCount": sum(1 for r in refs if r["type"] == "mc"),
            "sprCount": sum(1 for r in refs if r["type"] == "spr"),
            "items": refs,
        }

    json.dump(items, open(ITEMS_OUT, "w"), indent=2, ensure_ascii=False)
    json.dump(amap, open(MAP_OUT, "w"), indent=2, ensure_ascii=False)
    json.dump({
        "bySkill": dict(sorted(by_skill.items())),
        "byDomain": {d: sorted(s) for d, s in sorted(by_domain.items())},
        "domainName": DOMAIN_NAME,
    }, open(COVERAGE_OUT, "w"), indent=2, ensure_ascii=False)

    n_expl = sum(1 for i in items if i["explanation"])
    print("Ingested %d Problem docs (%d MC + %d SPR) -> %s"
          % (len(items), n_mc, n_spr, os.path.relpath(ITEMS_OUT, os.getcwd())))
    print("  weeks: %d | figures (svg): %d | explanations: %d | unified skills used: %d"
          % (len(WEEKS), figs, n_expl, len({i["skillId"] for i in items})))
    if unmapped:
        print("  [warn] %d items with an UNMAPPED skill: %s" % (len(unmapped), unmapped[:6]))
    else:
        print("  all items mapped to a unified skillId")
    print("  wrote %s and %s" % (os.path.basename(MAP_OUT), os.path.basename(COVERAGE_OUT)))


if __name__ == "__main__":
    main()

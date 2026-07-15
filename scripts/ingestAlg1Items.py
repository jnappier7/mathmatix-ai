#!/usr/bin/env python3
"""
Ingest Fable-authored Algebra 1 assessments (seeds/alg1-assessments/alg1_m*.json)
into our Problem schema so the tutor can pull them from the item bank.

Unlike the ACT bank (self-scoring 4-choice), these are teacher-style course
assessments: mostly free-response ("work"), 3 parallel versions per item (for
assessment integrity / retakes), a Quiz + Test per module, a separately-graded
spiral-review section, and figures from a fixed declarative library
(seeds/alg1-assessments/ALG1_SPEC.md). Each version becomes its own Problem so
the tutor has a deep, varied practice pool per module.

Skill tagging (this pass): module-level (`alg1-m{N}`). The Fable items carry no
per-item skill tag, and modules don't map 1:1 to the existing Algebra 1 catalog
(seeds/skills-algebra-1.json), so we tag by module now and emit a crosswalk to
the catalog skills each module covers — the scaffold for a later fine-grained
per-item pass (mirroring how the ACT bank went category -> fine).

Outputs:
  seeds/alg1-items.generated.json      Problem docs (array, ~798)
  seeds/alg1-skill-names.json          { alg1-m{N}: "Module topic" }
  seeds/alg1-assessment-map.json       module -> {quiz,test}->{core,spiral}->[problemId] (+points)
  seeds/alg1-catalog-crosswalk.json    module -> [existing catalog skillId, ...]

Usage: python3 scripts/ingestAlg1Items.py
"""

import json
import os
import re
import hashlib
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "seeds", "alg1-assessments")

ITEMS_OUT = os.path.join(ROOT, "seeds", "alg1-items.generated.json")
NAMES_OUT = os.path.join(ROOT, "seeds", "alg1-skill-names.json")
MAP_OUT = os.path.join(ROOT, "seeds", "alg1-assessment-map.json")
CROSSWALK_OUT = os.path.join(ROOT, "seeds", "alg1-catalog-crosswalk.json")

MODULES = [1, 2, 3, 4, 5, 6, 7, 10, 11]

# answer-choice letters used across versions
LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K"]

# Fable item.type -> Problem.answerType
ANSWER_TYPE = {"work": "constructed-response", "mc": "multiple-choice", "fill": "constructed-response"}

# Best-effort module -> existing catalog skillIds (seeds/skills-algebra-1.json).
# Scaffold for the later fine-grained per-item mapping; not used for tagging yet.
CATALOG_CROSSWALK = {
    1: [],  # Expressions/order-of-ops/evaluating — no catalog skill yet
    2: ["solving-multi-step-equations", "solving-equations-with-variables-both-sides",
        "solving-two-step-equations", "solving-one-step-equations"],
    3: [],  # Functions & relations — no catalog skill yet
    4: ["graphing-linear-equations-slope-intercept"],
    5: ["writing-linear-equations-slope-intercept"],
    6: [],  # Linear inequalities — no catalog skill yet
    7: ["systems-of-equations-graphing", "systems-of-equations-substitution",
        "systems-of-equations-elimination"],
    10: ["polynomial-addition-subtraction", "polynomial-multiplication-monomial",
         "factoring-gcf", "exponent-rules-multiplication", "exponent-rules-division"],
    11: ["solving-quadratics-factoring", "solving-quadratics-square-roots",
         "quadratic-formula", "quadratic-equations-graphing"],
}


def _norm(s):
    """Normalize for text matching: unify minus/dash glyphs, collapse spaces, lower."""
    s = str(s or "")
    for ch in ("−", "–", "—"):  # minus, en dash, em dash -> hyphen
        s = s.replace(ch, "-")
    return re.sub(r"\s+", " ", s).strip().lower()


def parse_correct_option(answer_str, choices):
    """Resolve the correct choice LETTER from the answer, trying, in order:
    1) a leading letter ('B - (2, 6)' -> 'B'),
    2) the answer's leading segment matching a choice's text
       ('3n - 6' -> the 'A' choice; 'Graph B (closed circle...)' -> the 'B' choice)."""
    if not answer_str or not choices:
        return None
    n = len(choices)

    # 1) leading letter
    m = re.match(r"\s*([A-K])\b", str(answer_str))
    if m and m.group(1) in LETTERS and LETTERS.index(m.group(1)) < n:
        return m.group(1)

    # 2) text match on the answer's leading segment (before ' - ' or ' (')
    seg = re.split(r"\s[-‒-―]\s|\s*\(", str(answer_str))[0]
    seg_n = _norm(seg)
    norm_choices = [_norm(c) for c in choices]
    if seg_n in norm_choices:
        return LETTERS[norm_choices.index(seg_n)]
    # also try the full answer normalized (some answers are exactly the choice)
    full_n = _norm(answer_str)
    if full_n in norm_choices:
        return LETTERS[norm_choices.index(full_n)]
    return None


def difficulty_from(points, section):
    """Map point value -> 1-5 difficulty (tests skew a touch harder than quizzes)."""
    d = max(1, min(5, int(points or 2)))
    if section == "test" and d < 5:
        d += 0  # keep points as the primary signal; sub-parts already carry weight
    return d


def build_problem(mod, section, grp, it, vi):
    """One Problem doc for version vi of a Fable item."""
    n = it["n"]
    itype = it.get("type", "work")
    pid = "alg1-m%d-%s-%s-n%d-v%d" % (mod, section, "sp" if grp == "spiral" else "core", n, vi + 1)
    skill_id = "alg1-m%d" % mod

    prompt = it["prompt"][vi]
    answer_val = it["answer"][vi]
    answer_type = ANSWER_TYPE.get(itype, "constructed-response")

    options, correct = None, None
    if itype == "mc" and it.get("choices"):
        choices = it["choices"][vi]
        options = [{"label": LETTERS[i], "text": str(c)} for i, c in enumerate(choices)]
        correct = parse_correct_option(answer_val, choices)

    figure = None
    if it.get("figure"):
        fig = it["figure"]
        params = fig.get("params")
        figure = {"kind": fig.get("kind"), "params": params[vi] if isinstance(params, list) else params}
        if it.get("key_figure"):
            kf = it["key_figure"]
            kparams = kf.get("params")
            figure["keyFigure"] = {"kind": kf.get("kind"),
                                   "params": kparams[vi] if isinstance(kparams, list) else kparams}

    tags = ["alg1", "alg1-m%d" % mod, section, "spiral" if grp == "spiral" else "core",
            itype, "v%d" % (vi + 1)]
    if it.get("spiral_source"):
        tags.append("spiral-src:%s" % it["spiral_source"])

    doc = {
        "problemId": pid,
        "skillId": skill_id,
        "prompt": prompt,
        "figure": figure,
        "answer": {"type": "exact", "value": answer_val, "equivalents": []},
        "answerType": answer_type,
        "options": options,
        "correctOption": correct,
        "difficulty": difficulty_from(it.get("points"), section),
        "gradeBand": "8-12",
        "explanation": it["solution"][vi] if it.get("solution") else None,
        "tags": tags,
        "source": "alg1-fable",
        "contentHash": hashlib.sha256(("%s|%s" % (pid, prompt)).encode("utf-8")).hexdigest(),
        "isActive": True,
    }
    return doc


def main():
    items = []
    names = {}
    amap = {}
    mc_missing_key = []
    figs = 0

    for mod in MODULES:
        data = json.load(open(os.path.join(SRC, "alg1_m%d.json" % mod)))
        names["alg1-m%d" % mod] = data.get("topics") or ("Module %d" % mod)
        amap[str(mod)] = {"topics": data.get("topics"), "quiz": {"core": [], "spiral": []},
                          "test": {"core": [], "spiral": []}}

        for section in ("quiz", "test"):
            for grp in ("items", "spiral"):
                bucket = "core" if grp == "items" else "spiral"
                for it in data.get(section, {}).get(grp, []):
                    for vi in range(3):
                        doc = build_problem(mod, section, grp, it, vi)
                        if doc["figure"]:
                            figs += 1
                        if doc["answerType"] == "multiple-choice" and not doc["correctOption"]:
                            mc_missing_key.append(doc["problemId"])
                        items.append(doc)
                        amap[str(mod)][section][bucket].append({
                            "problemId": doc["problemId"], "n": it["n"],
                            "points": it.get("points"), "type": it.get("type"),
                            "spiralSource": it.get("spiral_source"),
                        })

    # de-dupe by problemId
    items = list({it["problemId"]: it for it in items}.values())

    json.dump(items, open(ITEMS_OUT, "w"), indent=2, ensure_ascii=False)
    json.dump(names, open(NAMES_OUT, "w"), indent=2, ensure_ascii=False)
    json.dump(amap, open(MAP_OUT, "w"), indent=2, ensure_ascii=False)
    json.dump({str(k): v for k, v in CATALOG_CROSSWALK.items()},
              open(CROSSWALK_OUT, "w"), indent=2, ensure_ascii=False)

    n_mc = sum(1 for i in items if i["answerType"] == "multiple-choice")
    n_expl = sum(1 for i in items if i["explanation"])
    print("Ingested %d Problem docs -> %s" % (len(items), os.path.relpath(ITEMS_OUT, os.getcwd())))
    print("  modules: %d | figures: %d | explanations: %d | multiple-choice: %d"
          % (len(MODULES), figs, n_expl, n_mc))
    if mc_missing_key:
        print("  [warn] %d MC items missing a parseable answer key: %s"
              % (len(mc_missing_key), ", ".join(mc_missing_key[:8])))
    else:
        print("  all MC items have a parsed correctOption")
    print("  wrote %s, %s, %s" % (os.path.basename(NAMES_OUT), os.path.basename(MAP_OUT),
                                   os.path.basename(CROSSWALK_OUT)))


if __name__ == "__main__":
    main()

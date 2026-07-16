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

Skill tagging: FINE-GRAINED per item. The Fable items carry no per-item skill
tag, so scripts/alg1SkillClassifier.py assigns each item an exact sub-skill from
its wording (e.g. "completing-the-square", "parallel-perpendicular-lines"),
reusing existing catalog skillIds (seeds/skills-algebra-1.json) where they exist.
Spiral-review items are tagged by their SOURCE module. If a per-item `skill` field
is ever added by Fable (as the ACT bank now carries), it is preferred over the
classifier — so gold-standard tags can be swapped in with no rework.

Outputs:
  seeds/alg1-items.generated.json      Problem docs (array, ~798), fine skillId each
  seeds/alg1-skill-names.json          { fineSkillId: "Readable name" }
  seeds/alg1-assessment-map.json       module -> {quiz,test}->{core,spiral}->[{problemId,skillId}] (+points)
  seeds/alg1-skills-by-module.json     module -> [{skillId, name, inCatalog}]  (worklist for BKT wiring)

Usage: python3 scripts/ingestAlg1Items.py
"""

import json
import os
import re
import hashlib
from collections import defaultdict

import alg1FigureRenderer as figrender  # scripts/ is sys.path[0] when run as a script
import alg1SkillClassifier as classifier

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "seeds", "alg1-assessments")

ITEMS_OUT = os.path.join(ROOT, "seeds", "alg1-items.generated.json")
NAMES_OUT = os.path.join(ROOT, "seeds", "alg1-skill-names.json")
MAP_OUT = os.path.join(ROOT, "seeds", "alg1-assessment-map.json")
BY_MODULE_OUT = os.path.join(ROOT, "seeds", "alg1-skills-by-module.json")
CATALOG_FILE = os.path.join(ROOT, "seeds", "skills-algebra-1.json")

MODULES = [1, 2, 3, 4, 5, 6, 7, 10, 11]

# answer-choice letters used across versions
LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K"]

# Fable item.type -> Problem.answerType
ANSWER_TYPE = {"work": "constructed-response", "mc": "multiple-choice", "fill": "constructed-response"}


def _load_catalog_ids():
    """skillIds already defined in the Algebra 1 catalog (seeds/skills-algebra-1.json)."""
    try:
        data = json.load(open(CATALOG_FILE))
        arr = data if isinstance(data, list) else data.get("skills", [])
        return {s.get("skillId") for s in arr if s.get("skillId")}
    except Exception:
        return set()


CATALOG_IDS = _load_catalog_ids()


def slug(name):
    """kebab-case a skill name (used only for a future per-item Fable `skill` field)."""
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", str(name).lower())).strip("-")


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


def resolve_skill(it, mod, grp):
    """Fine skill for an item. Prefer a per-item `skill` field (forward-compatible
    with gold-standard Fable tags, as the ACT bank carries); otherwise classify
    deterministically from the wording."""
    fable = it.get("skill")
    if fable:
        return slug(fable), fable
    return classifier.classify(it, mod, is_spiral=(grp == "spiral"))


def build_problem(mod, section, grp, it, vi, skill_id, secondary):
    """One Problem doc for version vi of a Fable item."""
    n = it["n"]
    itype = it.get("type", "work")
    pid = "alg1-m%d-%s-%s-n%d-v%d" % (mod, section, "sp" if grp == "spiral" else "core", n, vi + 1)

    prompt = it["prompt"][vi]
    answer_val = it["answer"][vi]
    answer_type = ANSWER_TYPE.get(itype, "constructed-response")

    options, correct = None, None
    if itype == "mc" and it.get("choices"):
        choices = it["choices"][vi]
        options = [{"label": LETTERS[i], "text": str(c)} for i, c in enumerate(choices)]
        correct = parse_correct_option(answer_val, choices)

    svg = None
    figure = None
    src_fig, src_key = it.get("figure"), it.get("key_figure")
    if src_fig or src_key:
        figure = {}
        if src_fig:
            params = src_fig.get("params")
            pv = params[vi] if isinstance(params, list) else params
            figure["kind"] = src_fig.get("kind")
            figure["params"] = pv
            svg = figrender.render(src_fig.get("kind"), pv)  # baked into Problem.svg
        if src_key:
            kparams = src_key.get("params")
            kpv = kparams[vi] if isinstance(kparams, list) else kparams
            figure["keyFigure"] = {"kind": src_key.get("kind"), "params": kpv}
            ksvg = figrender.render(src_key.get("kind"), kpv)  # answer-review overlay
            if ksvg:
                figure["keyFigure"]["svg"] = ksvg

    tags = ["alg1", "alg1-m%d" % mod, section, "spiral" if grp == "spiral" else "core",
            itype, "v%d" % (vi + 1)]
    if it.get("spiral_source"):
        tags.append("spiral-src:%s" % it["spiral_source"])

    doc = {
        "problemId": pid,
        "skillId": skill_id,
        "secondarySkillIds": secondary,
        "prompt": prompt,
        "svg": svg,
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
    by_module = defaultdict(set)   # module -> {fine skillId}
    mc_missing_key = []
    figs = 0

    for mod in MODULES:
        data = json.load(open(os.path.join(SRC, "alg1_m%d.json" % mod)))
        amap[str(mod)] = {"topics": data.get("topics"), "quiz": {"core": [], "spiral": []},
                          "test": {"core": [], "spiral": []}}

        for section in ("quiz", "test"):
            for grp in ("items", "spiral"):
                bucket = "core" if grp == "items" else "spiral"
                for it in data.get(section, {}).get(grp, []):
                    skill_id, skill_name = resolve_skill(it, mod, grp)   # version-independent
                    names[skill_id] = skill_name
                    by_module[mod].add(skill_id)
                    secondary = classifier.secondary_skills(it, mod, skill_id, is_spiral=(grp == "spiral"))
                    for s in secondary:
                        names.setdefault(s, classifier.NAMES.get(s, s))
                        by_module[mod].add(s)
                    for vi in range(3):
                        doc = build_problem(mod, section, grp, it, vi, skill_id, secondary)
                        if doc["figure"]:
                            figs += 1
                        if doc["answerType"] == "multiple-choice" and not doc["correctOption"]:
                            mc_missing_key.append(doc["problemId"])
                        items.append(doc)
                        amap[str(mod)][section][bucket].append({
                            "problemId": doc["problemId"], "n": it["n"], "skillId": skill_id,
                            "points": it.get("points"), "type": it.get("type"),
                            "spiralSource": it.get("spiral_source"),
                        })

    # de-dupe by problemId
    items = list({it["problemId"]: it for it in items}.values())

    # module -> fine skills used, flagged by whether the catalog already defines them
    # (the worklist for piece 3's BKT / skillFocus wiring).
    by_module_out = {}
    for mod in MODULES:
        by_module_out[str(mod)] = [
            {"skillId": s, "name": names.get(s, s), "inCatalog": s in CATALOG_IDS}
            for s in sorted(by_module[mod])
        ]

    json.dump(items, open(ITEMS_OUT, "w"), indent=2, ensure_ascii=False)
    json.dump(names, open(NAMES_OUT, "w"), indent=2, ensure_ascii=False)
    json.dump(amap, open(MAP_OUT, "w"), indent=2, ensure_ascii=False)
    json.dump(by_module_out, open(BY_MODULE_OUT, "w"), indent=2, ensure_ascii=False)

    n_mc = sum(1 for i in items if i["answerType"] == "multiple-choice")
    n_expl = sum(1 for i in items if i["explanation"])
    n_svg = sum(1 for i in items if i.get("svg"))
    n_keysvg = sum(1 for i in items if (i.get("figure") or {}).get("keyFigure", {}).get("svg"))
    all_skills = sorted(names)
    in_cat = sum(1 for s in all_skills if s in CATALOG_IDS)
    print("Ingested %d Problem docs -> %s" % (len(items), os.path.relpath(ITEMS_OUT, os.getcwd())))
    print("  modules: %d | figures: %d (rendered svg: %d, key-svg: %d) | explanations: %d | multiple-choice: %d"
          % (len(MODULES), figs, n_svg, n_keysvg, n_expl, n_mc))
    print("  fine skills: %d (%d already in catalog, %d new) | items still on coarse module tag: %d"
          % (len(all_skills), in_cat, len(all_skills) - in_cat,
             sum(1 for s in all_skills if s.startswith("alg1-m"))))
    if mc_missing_key:
        print("  [warn] %d MC items missing a parseable answer key: %s"
              % (len(mc_missing_key), ", ".join(mc_missing_key[:8])))
    else:
        print("  all MC items have a parsed correctOption")
    print("  wrote %s, %s, %s" % (os.path.basename(NAMES_OUT), os.path.basename(MAP_OUT),
                                   os.path.basename(BY_MODULE_OUT)))


if __name__ == "__main__":
    main()

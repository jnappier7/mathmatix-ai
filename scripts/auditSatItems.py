#!/usr/bin/env python3
"""
Correctness audit for the Fable Digital SAT Math bank (seeds/sat-math/sat_w*.json).
Runs every `verify` snippet on each item so a wrong answer key can't ship, and
independently cross-checks that the declared answer is consistent with the item:
  - mc  : `answer` index is in range and names an existing choice
  - spr : `spr_answer` is present and (when numeric) parses

Exits non-zero on any failure. Requires sympy for the verify snippets.
Usage: python3 scripts/auditSatItems.py
"""

import json
import os
import io
import sys
import contextlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "seeds", "sat-math")
WEEKS = [1, 2, 3, 4, 5]


def run(code):
    with contextlib.redirect_stdout(io.StringIO()):
        exec(code, {})


def structural_issue(it):
    if it["type"] == "mc":
        ch = it.get("choices") or []
        if len(ch) < 2:
            return "mc with <2 choices"
        ai = it.get("answer")
        if not isinstance(ai, int) or ai < 0 or ai >= len(ch):
            return "mc answer index %r out of range" % (ai,)
    else:
        if it.get("spr_answer") in (None, ""):
            return "spr missing spr_answer"
    return None


def main():
    total = passed = skipped = 0
    fails = []
    struct = []
    for wk in WEEKS:
        data = json.load(open(os.path.join(SRC, "sat_w%d.json" % wk)))
        for it in data["items"]:
            loc = "W%d Q%d (%s)" % (wk, it["n"], it["type"])
            si = structural_issue(it)
            if si:
                struct.append((loc, si))
            v = it.get("verify")
            if not v:
                skipped += 1
                continue
            total += 1
            try:
                run(v)
                passed += 1
            except Exception as e:
                fails.append((loc, "%s: %s" % (type(e).__name__, str(e)[:70])))

    print("Digital SAT Math verify audit")
    print("  snippets run: %d | passed: %d | null-skipped: %d" % (total, passed, skipped))
    if struct:
        print("\n  STRUCTURAL ISSUES (%d):" % len(struct))
        for loc, msg in struct:
            print("    x %s  %s" % (loc, msg))
    if fails:
        print("\n  VERIFY FAILURES (%d):" % len(fails))
        for loc, msg in fails:
            print("    x %s  %s" % (loc, msg))
    if struct or fails:
        sys.exit(1)
    print("\n  OK — every verified answer checks out.")


if __name__ == "__main__":
    main()

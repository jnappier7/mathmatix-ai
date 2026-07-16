#!/usr/bin/env python3
"""
Correctness audit for the Fable AP Calculus AB bank (seeds/calc-ab/calc_w*.json).
Runs every `verify` snippet (sympy) on the MC items and FRQ parts so a wrong
answer key or rubric solution can't ship. Exits non-zero on any failure.

Requires: sympy, numpy
Usage: python3 scripts/auditCalcItems.py
"""

import json
import os
import io
import sys
import contextlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "seeds", "calc-ab")
WEEKS = [1, 2, 3, 4, 5]


def run(code):
    with contextlib.redirect_stdout(io.StringIO()):
        exec(code, {})


def main():
    total = passed = skipped = 0
    fails = []
    for wk in WEEKS:
        data = json.load(open(os.path.join(SRC, "calc_w%d.json" % wk)))
        for it in data["mc"]:
            v = it.get("verify")
            loc = "W%d MC%d" % (wk, it["n"])
            if not v:
                skipped += 1
                continue
            total += 1
            try:
                run(v)
                passed += 1
            except Exception as e:
                fails.append((loc, "%s: %s" % (type(e).__name__, str(e)[:70])))
        for p in data["frq"].get("parts", []):
            v = p.get("verify")
            loc = "W%d FRQ(%s)" % (wk, p["label"])
            if not v:
                skipped += 1
                continue
            total += 1
            try:
                run(v)
                passed += 1
            except Exception as e:
                fails.append((loc, "%s: %s" % (type(e).__name__, str(e)[:70])))

    print("AP Calculus AB verify audit")
    print("  snippets run: %d | passed: %d | null-skipped: %d" % (total, passed, skipped))
    if fails:
        print("\n  FAILURES (%d):" % len(fails))
        for loc, msg in fails:
            print("    x %s  %s" % (loc, msg))
        sys.exit(1)
    print("\n  OK — every verified answer checks out.")


if __name__ == "__main__":
    main()

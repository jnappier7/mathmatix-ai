# Low-volume skill top-up — merge notes (2026-07)

820 new items, 10 for each of the 82 skills flagged as low-volume. Every targeted
skill ends at 10+ items; 15 of them had **zero** items before this batch.

## Files

| Path | Status | What it is |
|---|---|---|
| `seeds/fable-act/topup1.json` | new | 400 ACT items (40 skills × 10) in the existing `fable-act` question schema |
| `scripts/ingestFableActItems.py` | **modified** | now also picks up `seeds/fable-act/topup*.json` |
| `seeds/bank-topup-items.generated.json` | new | 420 Problem docs (42 skills × 10) — 60 calc3 MC, 360 constructed-response |
| `scripts/seedBankTopupItems.js` | new | upsert seeder, mirrors `seedActItems.js` |

## Applying

```bash
python3 scripts/ingestFableActItems.py     # 225 -> 625 items in act-fable-items.generated.json
node scripts/seedActItems.js --fresh       # reseeds the ACT bank
node scripts/seedBankTopupItems.js --dry-run   # validate first
node scripts/seedBankTopupItems.js             # then upsert
```

Suggested `package.json` scripts, matching the existing naming:

```json
"bank:topup:seed": "node scripts/seedBankTopupItems.js",
"bank:topup:check": "node scripts/seedBankTopupItems.js --dry-run"
```

## The ingest change

The only edit to an existing file. `main()` used to hard-code `for t in range(1, 6)`;
it now builds a `sources` list of the five numbered tests followed by
`sorted(glob("topup*.json"))`, and derives the problemId prefix from the filename.

Numbered-test problemIds are byte-identical to before (`act-fable-t3q17`), so a
re-ingest is a clean upsert with no orphans. Top-up items are namespaced
`act-fable-topup1q<n>`, leaving room for a `topup2.json` later without renumbering
anything. Verified end-to-end: 625 items out, 625 unique problemIds, field parity
with the existing generated docs, and **zero new skill slugs** — every `skill`
string round-trips through `slug()` to a skillId already in `act-skill-names.json`.

## Conventions followed

- ACT items use the `fable-act` SPEC schema exactly, so `skill` slugs to an existing
  skillId and `category` is one of the six ACT reporting codes.
- Bank docs match `models/problem.js`: `answer.{type,value,equivalents}`, 1–5
  `difficulty`, `gradeBand` and `ohioDomain` copied from the Skill record,
  `contentHash` = `sha256(problemId|prompt)`, `source` = `bank-topup-2026-07`
  (its own namespace, so `--fresh` can't touch ACT/SAT/Calc/Alg1 items).
- Constructed-response for the K-12 skills, matching the 12,619 items already in
  the bank; multiple-choice only for calc3, matching `calc-fable`.
- Plain text + Unicode throughout (`² ³ √ π ≤ ≥ ∠ △ ∂ ∇ ⟨⟩`). No LaTeX, no markdown.
- `figure_code` is null on every ACT item — all 400 stems are self-contained, so
  nothing depends on a diagram that hasn't been drawn. Data tables use the
  plain-text `|` row format the SPEC already sanctions.

## What was verified

- **751 executable `verify` snippets run and reproduce their keyed answer.** 0 errors,
  0 mismatches. All 400 ACT items carry one.
- Two independent adversarial audits (one per half) looking for what the machine
  gate can't catch: ambiguity, multi-correct choices, verify-key divergence, figure
  dependence, explanation defects, distractor quality, CR gradability.
  **All findings fixed** — including 5 tally-chart items whose literal pipe count
  contradicted the key, an equivalent that accepted a mis-rounded answer, two
  duplicate item pairs across files, three explanations that diagnosed a distractor
  that wasn't among the choices, and 4 calc3 items that recalled a theorem instead
  of applying it.
- 0 duplicate prompts against the 12,619-item bank, the 225 existing ACT items, or
  within the batch itself.
- MC: 4 distinct choices everywhere, key position never used more than 4×/10 in a
  skill. CR: `answer` always present in `equivalents`, mean 4.7 accepted input forms
  per item (spaced/unspaced, ASCII `<=` for `≤`, interval and union notation,
  capitalization, units, `sqrt()` for `√`, `^`/`**` for superscripts).
- Difficulty spread is `[1,2,2,3,3,3,4,4,5,5]` per ACT skill and
  `[3,3,4,4,4,4,5,5,5,5]` per calc3 skill, so each skill gives the adaptive engine
  a real IRT range rather than 10 items at one level.

## Known cosmetic item

`adding-fractions-same-denominator`: one item keys `4/6` while its verify snippet
prints the reduced `2/3`. Both are in `equivalents`, so it grades correctly either
way — the prompt asks for the same-denominator form, which is the pedagogical point.

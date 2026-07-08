# Tutor Eval Harness

An **LLM-in-the-loop** regression net for the tutor's *actual replies*.

## Why this exists

Every "the tutor told a correct student they were wrong" bug we've shipped was
found the same way: a human read a production transcript. The unit tests and the
`tests/golden/` suite can't catch these — **they mock the LLM**, so they lock the
deterministic `observe → decide` layer but are blind to what the model actually
*says*.

This harness closes that gap. It replays real failing transcripts as permanent
scenarios and scores the tutor's reply against the failure classes we already
know it hits — turning "Jason finds it in prod" into "CI finds the class in the PR."

## The two layers

| Layer | Runs in | Needs a key? | Catches |
|-------|---------|--------------|---------|
| **Deterministic** | normal `npm test` | no | classification/decision regressions (a self-check `"is it 5/12?"` must be an `answer_attempt`; `"12 2/3 - 4 1/4"` must be a bare problem drop) |
| **Judges (mock model)** | normal `npm test` | no | proves the judge+runner wiring: the real failing transcript lines are flagged, clean replies pass |
| **Live** (`liveEval.test.js`) | opt-in only | **yes** | the *real* gpt-4o-mini reply violating a judge — the thing the golden suite can't see |

```bash
npm run test:eval                # hermetic layers (deterministic + mock model)
npm run test:eval:live           # real model — needs RUN_LLM_EVAL=1 + OPENAI_API_KEY
```

The live eval is **opt-in** (`RUN_LLM_EVAL=1`) so the nondeterministic model never
flakes the keyless PR gate. Wire it as a nightly / pre-release job.

## The failure classes (`judges.js`)

Each judge is a pure `(reply, ctx) → { violated, evidence }`. Current classes,
all drawn from real transcripts:

- **rejectedCorrectAnswer** — hedged/denied ("not quite", "you're close") when the student was right.
- **assertedFalseEquivalence** — claimed two equal forms (e.g. `5/12` and `10/24`) are "not equivalent".
- **lostContext** — asked the student to re-name the topic while a problem/graph was on screen.
- **solvedInsteadOfEliciting** — worked a full solution to a bare problem drop instead of asking for the first move.
- **usedImpreciseTerm** — said "reduce" (say *simplify*) or "improper fraction" (say *a fraction greater than one*).
- **badOrderOfOperations** — asserted "multiplication comes before division" as a rule.
- **revealedAnswer** — leaked a withheld answer.

## Add a scenario — edit `scenarios.json`, no code

Each scenario is a real transcript. Turns are either a pre-seeded `assistant`
line (context) or a `student` turn with:

- `expect` — deterministic `observe()` assertions (`messageType`, `answerValue`, `isBareProblemDrop`, `notAnswerAttempt`).
- `judge` — judge names to score the reply (generation layer).
- `ctx` — flags the judges read: `studentWasCorrect`, `hasFocus`, `shouldElicit`, `mustNotReveal`, `answer`.

Scenario-level `focus` / `focusTerms` / `answer` provide defaults.

When you add a `judge` turn, also add a known-bad and known-good reply for it in
`tutorEval.test.js` (the mock-model fixtures) — the suite-integrity test enforces this.

## Adding a judge

Add a pure function to `judges.js`, register it in the `JUDGES` map, and add
unit tests in `tests/unit/evalJudges.test.js` against real good/bad lines. Every
new production failure should become a judge (the class) **and** a scenario (the case).

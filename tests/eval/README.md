# Tutor Eval Harness

An **LLM-in-the-loop** regression net for the tutor's *actual replies*, plus a
**persona layer** that drives multi-turn student trajectories through the real
observe → diagnose → decide stages.

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

## Board-tag integrity (`boardJudge.js`) — automatic, no opt-in

The live prompt always carries the WORKBOARD TAG PROTOCOL, so any live reply can
carry `<BOARD .../>` tags. The runner pushes EVERY generated reply through the
REAL board pipeline — `utils/boardTagParser` → `utils/boardResponseSchema` →
`utils/boardCommandGuard.enforcePedagogyRule` — and reports two failure classes
alongside the heuristic judges:

- **deadBoardTag** — the tag is schema-invalid (bad action, missing tex/op/fn/query):
  it gets stripped from the text and the student sees *nothing* where the tutor
  believes a card landed.
- **ghostBoardStep** — the tag parses but the guard drops it: an apply/resolve/verify
  that doesn't trace to the student's words (the anti-cheat #1 rule), a blank-less
  scaffold, an unlicensed clear. The tutor keeps narrating board work the student
  never sees.

This is not a simulation of the guard — it *is* the guard, so a violation here is
exactly what production would drop. Pinned by `tests/unit/evalBoardJudge.test.js`.

Jurisdiction matters: the heuristic prose judges and the `answerLeak` LLM judge
score the **cleaned** reply (what the student reads in the bubble — tag markup's
`=` signs read as worked steps, and guard-legal empty-blank scaffolds read as
leaks otherwise), while `visualPedagogy`/`representationShift` see the raw reply
(a graph/scaffold card IS the visual). One deliberate exemption: on a verified-
correct turn, guard-dropped apply/resolve/verify recaps are NOT ghost violations,
because production synthesizes the verify card from the diagnosis — see
`personas.json` `_knownIssues`.

Visual-apt personas judge the **second** exchange, not the first reply: the
model legitimately opens with a gut-check or prerequisite probe (commit-then-
reveal), and the representation is expected once the student's intuition runs
out. A model that still hasn't reached for one by then is the real finding.

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

## The persona layer (`personas.json`)

Where `scenarios.json` replays **known bugs**, `personas.json` scripts
**behavioral trajectories** — the answer-fisher, the frustrated kid, the
oddly-phrased-correct student, the quietly lost one — and asserts pedagogical
*invariants* per turn across three deterministic layers plus the live judges:

- `expect` — observe classification (same as scenarios).
- `expectDecide` — the REAL `diagnose → decide` runs with the LLM boundary
  empty (solver-graded); assert `actionOneOf` / `actionNotIn` /
  `diagnosisType` / `scaffoldLevelAtMost`. Pin action *families*, not single
  actions — legitimate decide tuning must not flake the suite.
- `expectPrompt` — the REAL `assemblePrompt` runs on the decision;
  `mustNotContain` pins the anti-leak invariant (the answer never enters the
  prompt on a non-attempt turn).
- `judgeLlm` — live tier only (`npm run test:eval:live`): LLM judges in
  `llmJudges.js` score the real model's reply — `answerLeak` (strict: any
  wording counts), `scaffoldVsTell`, `toneSupport`, `newSkillIntro`,
  `visualPedagogy` (did the tutor reach for the right representation at a
  visual-apt moment — and skip manipulatives where they'd be noise),
  `representationShift` (after a repeat miss, is the new explanation a
  genuinely different lens, not the same one louder). A judge reporting
  `uncertain` is logged, never counted as a pass or a fail.

`expectDecide` also supports `directivesContain` — substring pins on the
decision's directives (e.g. the repeat-miss turn must carry a "DIFFERENT"
approach/representation order), for invariants that live in directives rather
than the action name.

Deterministic layers run in `personaEval.test.js` (keyless CI); live judges in
`livePersonaEval.test.js` (`RUN_LLM_EVAL=1`). Calibration findings that
represent *current bugs* are documented in `personas.json` `_knownIssues` and
deliberately NOT pinned — fix the bug, then tighten the persona.

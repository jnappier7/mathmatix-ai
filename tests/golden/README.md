# Golden Transcripts

A behavior + **safety** regression net for the tutoring pipeline (`utils/pipeline/`).

The pipeline *is* the product. Prompts and models change constantly. This suite locks
the **deterministic teaching decisions** (`observe` → `decide`) and a set of
non-negotiable **safety invariants**, so a prompt tweak, a model swap, or a refactor
can't silently change how the tutor reads a student — or, worse, start affirming
answers it never verified.

It runs in CI with the normal `npm test` (no API keys, no DB, fast).

## Run it

```bash
npm run test:golden      # just this suite
npm test                 # full unit+integration suite (includes this)
```

## Add a case — no code required

Edit **`transcripts.json`**. Copy an existing block and change the values.

### Classification case — "this message should be read as type X"

```json
{ "name": "skip request is recognized", "message": "skip this one", "expectMessageType": "skip_request" }
```

`expectMessageType` must be one of the `MESSAGE_TYPES` in `utils/pipeline/observe.js`
(`answer_attempt`, `idk`, `frustration`, `help_request`, `question`, `affirmative`,
`skip_request`, `progress_report`, `general_math`, `greeting`, …).

### Decision case — "given this situation, the tutor should do Y (and stay safe)"

```json
{
  "name": "incorrect answer is guided, never confirmed",
  "message": "x = 5",
  "decide": {
    "from": "synthesize",
    "messageType": "answer_attempt",
    "answer": { "value": "5" },
    "streaks": { "recentWrongCount": 0 },
    "diagnosis": { "type": "incorrect", "isCorrect": false, "answer": "5", "correctAnswer": "7" },
    "expectAction": "guide_incorrect"
  }
}
```

- `from`: `"synthesize"` builds the observation from the fields you give (precise control of
  the situation). `"observe"` runs the real classifier on `message` first, then decides
  (true end-to-end). Use `synthesize` for answer-attempt cases where you want to inject a
  specific `diagnosis`; use `observe` for intent cases (give-up, idk, help, off-task).
- `diagnosis.type`: one of `correct`, `incorrect`, `unverifiable`, `correct_partial`,
  `no_answer`. This is *injected* — the suite does not call the math engine or LLM, so you
  decide what the verdict was and assert how the tutor responds to it.
- `expectAction` (or `expectActionOneOf`): an `ACTIONS` value from `utils/pipeline/decide.js`
  (`confirm_correct`, `guide_incorrect`, `hint`, `worked_example`, `reteach_misconception`,
  `scaffold_down`, `exit_ramp`, `redirect_to_math`, `acknowledge_frustration`,
  `acknowledge_progress`, `continue_conversation`, …).

## Safety invariants

These run automatically and are the reason this suite matters. They assert *properties*,
not exact wording, so they survive refactors but catch real regressions:

| Invariant | When it runs | Guarantees |
|-----------|--------------|------------|
| `confirm_implies_correct` | every decision | The tutor only emits `confirm_correct` when the diagnosis was actually `correct` — never for `incorrect`, `unverifiable`, or `no_answer`. The core "don't affirm a wrong/unverified answer" guard. |
| `no_autoconfirm_unverified` | every decision | When the math engine couldn't verify the answer, the tutor never auto-confirms and is handed a "verify before responding" directive. |
| `giveup_no_reveal` | cases that opt in via `"safety": ["giveup_no_reveal"]` | An exit-ramp/give-up turn carries a "never reveal the answer" guard. |

Add a new invariant in `goldenTranscripts.test.js` under `SAFETY_INVARIANTS`. Set
`default: true` to run it on every decision, or `default: false` and opt cases in via the
fixture's `"safety": [...]` array.

## Why a golden file encodes *current* behavior

These fixtures were seeded from the real output of `observe`/`decide` at the time of
writing. That's the point: the file is the agreed-upon baseline. If a change moves a
decision, the test fails — and you make a deliberate choice: was the change intended (update
the fixture) or a regression (fix the code)? Never edit a fixture just to make a red test
green without understanding which case you're in.

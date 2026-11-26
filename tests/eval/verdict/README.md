# Verdict-accuracy eval

How often does grading call a right answer wrong, or a wrong answer right? This eval measures that across the catalog instead of waiting for a student to hit it.

```bash
npm run eval:verdict                       # LIVE: real verifiers (OPENAI + ANTHROPIC keys)
npm run eval:verdict -- --offline          # deterministic graders only, no keys
npm run eval:verdict -- --topic calculus --json out.json
```

`verdictOffline.test.js` runs the offline tier inside `npm test`.

## What it runs

`corpus.js` holds problems as a tutor poses them. Each one has its right answer written the ways students write it (`x = 6`, `so x = 6`, `i got 6`, `is it 6?`, LaTeX, shown work) and the wrong answers students give. Every key was worked by hand. Judgment calls, like a missing `+C` or a half root set, are left out on purpose.

`runner.js` sends every case through **`observeAndDiagnose`** in `utils/pipeline/index.js`. That's the same function `runPipeline` calls, so the eval measures production, not a copy of it. Each case runs in three contexts:

| context | the conversation |
|---|---|
| `pinned` | The tutor posed it in a normal turn. The pin is what the **real** board synthesizer reads from the pose, so a mis-pin is measured. |
| `unpinned` | It arrived where nothing pins it, like a greeting warm-up. |
| `followup` | The student answered, the tutor replied without a verdict, and the student asks "are they correct?" |
| `session` | A recorded multi-turn exchange (`SESSIONS` in `corpus.js`): sub-questions, a parallel example, a confirmation in passing. The pin is the recorded one and every tutor turn carries the key persist would stamp on it. |
| `session-unpinned` | The same exchange with no board pin. |

A single-pose case has one question in play. A session is where the question moves while the pin stays put, which is where the 2026-11-25 false rejections came from: each grader was exact about the problem it held and aimed at something other than what the student was answering.

## Outcomes

| outcome | meaning | severity |
|---|---|---|
| `right` | verdict matches the key | ✓ |
| `abstain` | no verdict; the tutor must ask, not assert | safe |
| `FALSE_REJECT` | a right answer called wrong | worst |
| `FALSE_ACCEPT` | a wrong answer called right | bad |
| `UNGUARDED` | follow-up only: no verdict **and** no restriction, so the tutor may assert anything | bad |

## Adding cases

Found a grading bug live? Add the problem and the student's exact words to `corpus.js` before fixing it. If the bug needed more than one turn to happen, add it as a session: the turns up to the student's reply, the pin at that moment, and the replies keyed by hand. The offline test fails on any new wrong verdict from the deterministic graders. `KNOWN` and `KNOWN_UNGUARDED_FOLLOWUPS` are ratchets: when a fix lands, remove its entry or lower the count.

# Permission Architecture — Anti-Cheat Tutoring Pipeline

**Status:** Spec for MVP implementation.
**Branch:** `claude/fix-tutoring-principles-fkFFj`
**Supersedes:** ad-hoc prompt-level anti-cheat directives in `utils/prompt.js`, `utils/pipeline/decide.js::applyInstructionalMode`, and detector-based retries in `utils/pipeline/verify.js`.

---

## 1. North Star

> **The LLM is not the tutor policy. It is the tutor voice.**

The pipeline decides what the tutor is allowed to do. The LLM decides how it sounds. Anti-cheat is enforced by state and schema, never by asking the model nicely.

---

## 2. Layers

| Layer          | Owns                                                                 | How                                              |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------------ |
| **Pipeline**   | State, allowed-action set, rationale, goal link, hard-lock vs soft-choice | Deterministic code in `utils/pipeline/decide.js` |
| **Registry**   | Action primitives + utterance-pattern dimension                      | Authored JSON config                             |
| **LLM**        | Voice, timing, wording; action choice in soft-choice states          | OpenAI tool-calling with strict schema           |
| **Phrasebook** | Voice variants per (action, tutor, pattern)                          | Authored per tutor in JSON                       |
| **Validator**  | Action-in-allowed-set check; prose-leak guard                        | Code, fails closed                               |

Failure mode for each layer: **closed**. If the LLM returns an action outside the allowed set, if a rationale can't be written, if the phrasebook has no entry — fall back to the deterministic template and log.

---

## 3. MVP Scope

- **8 actions.**
- **5 states.**
- **Hard-lock** on `LEVEL_0_COLD` and `LEVEL_2_CORRECT`. **Soft-choice** on the rest.
- **`utterance_pattern` field in schema**, one pattern authored per (action, tutor) at launch. Expand patterns only when transcript audits show repetition.
- **System-owned rationale.** Written deterministically from pipeline state, stripped from student-facing text, logged for teacher view.
- **Maya phrasebook seeded** with 3–4 variants per action as reference. Bob, Ms. Maria, Mr. Nappier phrasebooks stubbed for a writer to fill.

Non-goals for MVP: LLM-generated rationale, per-skill action variants, dynamic action-registry growth, teacher-facing reasoning UI (logs exist; rendering is a later sprint).

---

## 4. Action Registry

Eight primitives. Each has a fixed slot schema the LLM must fill.

| Action                    | Intent                                                                 | LLM-filled slots          |
| ------------------------- | ---------------------------------------------------------------------- | ------------------------- |
| `ASK_WHAT_TRIED`          | Invite the student's attempt or stuck point. Never hint at method.     | `prose`                   |
| `ASK_NOTICE`              | Probe for structural recognition. Open or narrowed diagnostic.         | `prose`                   |
| `OFFER_PARALLEL_EXAMPLE`  | Present a different-numbers version of the skill. Never the student's problem. | `prose`, `parallel_problem` |
| `GUIDE_STEP`              | Ask about the NEXT step the student would take, after they've attempted. | `prose`                   |
| `CONFIRM_CORRECT`         | Affirm a verified-correct answer. No hedging. Never re-derive.         | `prose`                   |
| `GUIDE_INCORRECT`         | Probe a wrong answer without revealing. Expose reasoning gap.          | `prose`                   |
| `ACKNOWLEDGE_FEELING`     | Validate frustration, confusion, or fatigue. No pedagogy yet.          | `prose`                   |
| `OFFER_CHOICE`            | Present 2–3 options: continue / try easier / parallel / break.         | `prose`, `choices[]`      |

**Forbidden slots at schema level** (the LLM cannot emit these because they are not in any action's schema):

- `solved_answer`
- `step_operation` (e.g. "subtract 4 from both sides")
- `final_value`

This is not validation — it's absence. The model cannot return a field that does not exist in the tool definition.

---

## 5. State → Allowed Actions

| State                      | Trigger                                                         | Mode         | Allowed Actions                                         |
| -------------------------- | --------------------------------------------------------------- | ------------ | ------------------------------------------------------- |
| `LEVEL_0_COLD`             | `isBareProblemDrop && !hasRecentUpload && !phaseState`          | **Hard-lock** | `ASK_WHAT_TRIED` ∪ `OFFER_PARALLEL_EXAMPLE`             |
| `LEVEL_1_ENGAGED`          | Student has shown work, no submitted answer yet                 | Soft-choice  | `ASK_NOTICE`, `GUIDE_STEP`, `OFFER_PARALLEL_EXAMPLE`    |
| `LEVEL_2_CORRECT`          | `diagnosis.isCorrect === true`                                  | **Hard-lock** | `CONFIRM_CORRECT`                                       |
| `LEVEL_2_WRONG`            | `diagnosis.isCorrect === false`                                 | Soft-choice  | `GUIDE_INCORRECT`, `OFFER_PARALLEL_EXAMPLE`             |
| `LEVEL_F_FRUSTRATED`       | Frustration signal OR ≥3 wrong OR ≥2 IDK                        | Soft-choice  | `ACKNOWLEDGE_FEELING`, `OFFER_CHOICE`, `OFFER_PARALLEL_EXAMPLE` |

**Hard-lock behavior:** pipeline picks the single action. `LEVEL_0_COLD` alternates `ASK_WHAT_TRIED` (default) with `OFFER_PARALLEL_EXAMPLE` (when student has already bounced off `ASK_WHAT_TRIED` in this session). `LEVEL_2_CORRECT` always picks `CONFIRM_CORRECT`.

**Soft-choice behavior:** pipeline provides `allowed_actions`, LLM tool-calls one. Validator enforces membership.

States outside this table fall through to existing `decide.js` logic during MVP. The permission architecture is additive, not replacing, until proven.

---

## 6. Rationale Templates (system-owned)

Written deterministically from state. Not shown to student. Logged for teacher view.

```
function buildRationale(state, action, observation, tutorPlan, diagnosis) {
  return {
    state,
    action,
    rationale: RATIONALE_TEMPLATES[state][action](observation, diagnosis),
    goal_link: tutorPlan?.currentTarget
      ? `${tutorPlan.currentTarget.skillId} → ${tutorPlan.currentTarget.instructionPhase || 'current focus'}`
      : 'free-form session',
  };
}
```

Examples:

```
LEVEL_0_COLD × ASK_WHAT_TRIED:
  "Bare problem drop detected; student has not shown any attempt.
   Asking for their work before scaffolding."

LEVEL_0_COLD × OFFER_PARALLEL_EXAMPLE:
  "Student asked for help twice without attempting; offering parallel
   example so the work is on a different problem, not theirs."

LEVEL_2_CORRECT × CONFIRM_CORRECT:
  "Answer verified correct by math engine ({correctAnswer}).
   Affirming without re-derivation."

LEVEL_2_WRONG × GUIDE_INCORRECT:
  "Answer verified wrong ({studentAnswer} vs {correctAnswer}).
   Probing for reasoning gap without revealing correction."

LEVEL_F_FRUSTRATED × ACKNOWLEDGE_FEELING:
  "Frustration signals present ({signals}). Validating before
   attempting pedagogical move."
```

Storage: append each turn's rationale to `conversation.reasoningTrace[]`. Teacher dashboard renders the trace. Pattern detector reads it.

---

## 7. Tool-Call Schema

Soft-choice state example (`LEVEL_1_ENGAGED`):

```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "ASK_NOTICE",
        "description": "Probe for structural recognition. Ask what the student sees in the problem. Do not reveal any operation or step.",
        "parameters": {
          "type": "object",
          "properties": {
            "utterance_pattern": {
              "type": "string",
              "enum": ["open_diagnostic", "narrowed_focus", "reflective_reframe"]
            },
            "prose": {
              "type": "string",
              "description": "The student-facing sentence(s). 1–3 sentences. No operations or steps. End with a question."
            }
          },
          "required": ["utterance_pattern", "prose"]
        }
      }
    },
    { "type": "function", "function": { "name": "GUIDE_STEP", "...": "..." } },
    { "type": "function", "function": { "name": "OFFER_PARALLEL_EXAMPLE", "...": "..." } }
  ],
  "tool_choice": "required"
}
```

Hard-lock states do not invoke the LLM for action selection. The pipeline picks, the phrasebook provides prose variants, the LLM (optionally) is invoked only to **select a phrasebook variant index** or may be skipped entirely.

---

## 8. Validator Rules

Run after LLM returns, before sending to student.

1. **Action membership:** `tool_call.name ∈ state.allowedActions`. Fail → regenerate with reduced action set. Second fail → fall back to deterministic template.
2. **Utterance pattern:** `tool_call.utterance_pattern ∈ action.patterns`. Fail → use default pattern.
3. **Prose leak check** (defense-in-depth, runs on all prose regardless of action):
   - No `[a-z]\s*=\s*-?[\d(]` (variable-assignment leak)
   - No "answer is", "solution is", multi-root `x=A or x=B`
   - For `LEVEL_0_COLD`: no operation verbs (`subtract`, `divide`, `multiply`, `add`, `square`, `factor`, `distribute`) paired with "from both sides" / "by" / "to both sides"
   - Fail → use phrasebook fallback for the same action
4. **Required question for all LEVEL_0/1 actions except `CONFIRM_CORRECT`:** prose must end with `?`. Fail → append phrasebook default ending.

Existing `verify.js` detectors stay as the outermost guard. Their flags contribute to telemetry but are no longer the primary control.

---

## 9. Phrasebook File Format

One file per tutor: `utils/phrasebook/{tutor}.json`.

```json
{
  "tutor": "maya",
  "voice_notes": "Gen-Z supportive older sister. Warm, encouraging, normalizes struggle. Light emoji use (never math symbols).",
  "actions": {
    "ASK_WHAT_TRIED": {
      "open_invite": [
        "Alright {student_name} — before I help, show me what you tried. Even a wild guess is useful.",
        "Okay {student_name}, what's your first move? Even if you're not sure, give me what you've got.",
        "Let's see your work first — doesn't have to be right, I just want to see your thinking."
      ]
    },
    "ASK_NOTICE": {
      "open_diagnostic": [
        "Before you touch it — what jumps out at you about {problem_echo}?",
        "What do you notice about that one? Don't solve yet, just look."
      ],
      "narrowed_focus": [
        "What's happening to {variable_name} in this equation?",
        "Look at the left side only — what do you see?"
      ]
    },
    "OFFER_PARALLEL_EXAMPLE": {
      "teach_with_twin": [
        "Okay, I'll walk through a different one with you, then you try yours. Say \"go\" when ready."
      ]
    },
    "CONFIRM_CORRECT": {
      "direct_affirm": [
        "Yep, {student_answer} is it — nice work.",
        "You got it. {student_answer} is correct."
      ]
    },
    "GUIDE_INCORRECT": {
      "reasoning_probe": [
        "Close — walk me through how you got {student_answer}. I want to see your steps.",
        "Not quite. What was your first move?"
      ]
    },
    "ACKNOWLEDGE_FEELING": {
      "validate_and_pause": [
        "This IS a tough one — totally fair to feel stuck. Take a breath.",
        "You're not alone — this one trips a lot of people up."
      ]
    },
    "OFFER_CHOICE": {
      "two_or_three": [
        "Want to {option_a}, {option_b}, or {option_c}?",
        "Your call: {option_a} or {option_b}?"
      ]
    },
    "GUIDE_STEP": {
      "next_move_question": [
        "Okay — given what you have now, what would you do next?",
        "You're on a path. What's the next move from here?"
      ]
    }
  }
}
```

**Slot substitution:** `{student_name}`, `{problem_echo}`, `{variable_name}`, `{student_answer}`, `{option_a}`, `{option_b}`, `{option_c}` are filled by the pipeline from observation state. If a slot value is missing, the phrasebook entry is skipped and the next variant is tried.

**Stub files for other tutors** (`bob.json`, `maria.json`, `nappier.json`) should ship empty but with the action keys scaffolded, so a writer can fill in voice without touching code.

---

## 10. Implementation Order

### Phase 1 — foundation (1 day)

1. `utils/pipeline/actionRegistry.js` — action definitions + tool schemas + slot validators.
2. `utils/pipeline/statePermissions.js` — state → allowed actions table + hard-lock/soft-choice flags.
3. `utils/pipeline/rationaleTemplates.js` — rationale + goal_link projection from state.
4. `utils/phrasebook/maya.json` — seed variants for all 8 actions.
5. `utils/phrasebook/{bob,maria,nappier}.json` — stubs.

### Phase 2 — wire-up (1 day)

1. Extend `decide.js` to emit `decision.allowedActions`, `decision.mode` (`hard-lock` | `soft-choice`), `decision.rationale`, `decision.goalLink` for the 5 MVP states.
2. Extend `generate.js` to:
   - For hard-lock: render from phrasebook directly, skip LLM for action, optionally call LLM for prose polish with strict validator.
   - For soft-choice: invoke LLM with `tool_choice: "required"` and only allowed tools.
3. Extend `verify.js` to run the new validator on tool-call output before the existing detector layer.

### Phase 3 — observability (0.5 day)

1. Append `{turn, state, action, utterance_pattern, rationale, goalLink}` to `conversation.reasoningTrace[]`.
2. Log to console at INFO: `[Pipeline] Permission: state=LEVEL_0_COLD mode=hard-lock action=ASK_WHAT_TRIED pattern=open_invite`.
3. Surface in `_pipeline` response metadata for frontend/teacher dashboard use.

### Phase 4 — tests (0.5 day)

1. Unit tests per action: validator catches leaks, phrasebook fills slots, hard-lock bypasses LLM.
2. State-permission table tests: every state emits a legal action set.
3. Transcript regression suite: the failing transcripts from prod (`4x-5=22`, `x²=49`, limits problem) produce expected actions.
4. Authoring-format test: every tutor phrasebook parses, has at least one variant per action, no empty arrays.

### Phase 5 — roll-out (gated behind `ENABLE_PERMISSION_ARCHITECTURE` env flag)

1. Shadow-run: compute new decision alongside existing, log divergence, don't emit.
2. Flip for internal test accounts.
3. Flip for opt-in teacher pilots.
4. Default-on after 2 weeks of clean telemetry.

Total: ~3 days engineering + phrasebook authoring (parallel, per-tutor).

---

## 11. Authoring Template — Maya as Reference

**Voice principles for Maya:**
- Second-person, warm, uses student's first name occasionally (not every turn).
- Normalizes struggle: "this trips a lot of people up", "even a wrong guess is useful".
- Never condescends. Never "sweetie" or "honey". Never pity.
- One emoji maximum per turn. Never math emoji (✨ OK; ➕ never).
- Rhythm: short sentences. Questions end with a question mark, not a comma-clause pile.

**Voice anti-patterns for Maya:**
- "Great question!" → banned.
- "Let's dive in!" → banned.
- "I'd be happy to help!" → banned.
- Any "let's [verb] [noun]" construction → three strikes per session, then lint.
- Math symbols in voice-only prose → always banned (those live in `{problem_echo}` slot, already rendered).

When writing variants for other tutors, copy Maya's structure, change only the voice. Keep the information content constant — if Maya asks for an attempt, so does Bob, just in his voice.

---

## 12. Open Questions (for the implementation chat to resolve)

1. **Should `LEVEL_1_ENGAGED` action selection go through the LLM every turn, or should the pipeline pick based on simpler heuristics (e.g. count of recent steps shown)?** Soft-choice is cheap latency-wise but adds LLM variance. Recommend: LLM-picks for MVP, instrument, move to pipeline-picks if variance hurts consistency.
2. **How does this coexist with the existing `decide.js` actions (CONFIRM_CORRECT, GUIDE_INCORRECT, etc.)?** The MVP states map 1:1 to new actions with the same names; the existing actions get subsumed. The non-MVP states (EXIT_RAMP, WORKED_EXAMPLE, RETEACH_MISCONCEPTION, PHASE_INSTRUCTION, DIRECT_INSTRUCTION) stay on the legacy path until expanded in a follow-up.
3. **Streaming UI implication:** deterministic phrasebook prose can be streamed as a single SSE chunk; LLM prose streams normally. Frontend should render both identically.
4. **Cost ceiling:** soft-choice paths add one tool-call round-trip per applicable turn (~$0.0002). Hard-lock paths have zero LLM cost. Net cost change vs. current: roughly flat, because regeneration-on-leak (which the new architecture avoids) is more expensive than the new tool-call overhead.

---

## 13. What This Guarantees (and What It Doesn't)

**Guaranteed:**
- No bare-problem-drop turn can emit a solved answer. The action schema has no slot for one.
- No `LEVEL_2_CORRECT` turn can emit a false rejection. Hard-locked to `CONFIRM_CORRECT`.
- Every turn has a true, system-written rationale tied to the student's current goal. Teachers can audit.
- The LLM cannot choose a forbidden action, because forbidden actions are not in the tool list it sees.

**Not guaranteed:**
- LLM can still write prose that hints at a step inside an allowed action's prose slot. The validator's prose-leak check is defense-in-depth, not a proof. Audit transcripts; expand the leak-pattern library as needed.
- Phrasebook variety depends on authoring effort. At launch, repetition is possible in long sessions. Mitigation: add utterance patterns, commission more variants.
- Pipeline state classification can still be wrong (e.g. a student's genuine attempt misclassified as `LEVEL_0_COLD`). The cost of wrong is a slightly-annoying "show me what you tried" prompt — no cheating, just friction. Tune via audit.

**The core claim, restated:** cheating moves to the ring of "LLM writes a step-hint inside an allowed question" rather than "LLM solves the problem." That's a much smaller attack surface, addressable by targeted validation, and visible in every transcript via the rationale log.

---

*End of spec.*

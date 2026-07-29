/**
 * EVAL RUNNER — walks a scenario turn by turn, running the REAL deterministic
 * pipeline (observe) for classification checks, and — when a model is wired in —
 * generating the tutor's actual reply and scoring it with the judges.
 *
 * The model is dependency-injected via opts.generateReply, so the same runner
 * powers both the hermetic CI test (a canned/mock model) and the live eval (the
 * real gpt-4o-mini pipeline). No network or API key is required unless a real
 * generateReply is passed.
 */
'use strict';

const { observe } = require('../../utils/pipeline/observe');
const { diagnose } = require('../../utils/pipeline/diagnose');
const { decide } = require('../../utils/pipeline/decide');
const { deriveVerificationState, hasMathematicalContent } = require('../../utils/pipeline/verificationState');
const { judgeReply } = require('./judges');

function classify(studentMsg, history, scenario) {
  return observe(studentMsg, {
    recentUserMessages: history.filter((m) => m.role === 'user').slice(-6),
    recentAssistantMessages: history.filter((m) => m.role === 'assistant').slice(-6),
    hasRecentUpload: !!scenario.hasRecentUpload,
  });
}

// Run the REAL diagnose → decide stages, deterministically: the LLM
// verification promises are omitted, so grading falls to mathSolver /
// symbolicVerifier exactly as it does for the ~30% solver-covered topics.
// Mirrors the wiring in utils/pipeline/index.js (observe → verification
// candidate → diagnose → verificationState stamp → decide).
async function runDecideLayer(obs, student, history, scenario) {
  const diagnosis = await diagnose(obs, {
    recentAssistantMessages: history.filter((m) => m.role === 'assistant').slice(-6),
    recentUserMessages: history.filter((m) => m.role === 'user').slice(-6),
    activeSkill: scenario.activeSkill || null,
    user: null,
    lastProblemState: null,
    pinnedProblemTex: scenario.pinnedProblemTex || null,
    verificationCandidate: (obs.answer && obs.answer.value) || null,
    llmVerificationPromise: null,
    conceptualVerificationPromise: null,
  });
  // runPipeline stamps this after diagnose; the UNVERIFIED prompt branch
  // depends on it, so the harness must stamp it too.
  diagnosis.verificationState = deriveVerificationState(diagnosis, hasMathematicalContent(student));

  const decision = decide(obs, diagnosis, {
    phaseState: null,
    activeSkill: scenario.activeSkill || null,
    sessionMood: null,
    evidence: null,
    tutorPlan: null,
    modeTransition: null,
    hasRecentUpload: !!scenario.hasRecentUpload,
    user: null,
    conversation: { messages: history.map((m) => ({ role: m.role, content: m.content })) },
  });
  return { diagnosis, decision };
}

function checkDecideExpectations(expect, decision, checks) {
  if (!expect) return;
  if (Array.isArray(expect.actionOneOf)) {
    checks.decideActionOneOf = {
      got: decision.action,
      want: expect.actionOneOf,
      ok: expect.actionOneOf.includes(decision.action),
    };
  }
  if (Array.isArray(expect.actionNotIn)) {
    checks.decideActionNotIn = {
      got: decision.action,
      want: `none of ${JSON.stringify(expect.actionNotIn)}`,
      ok: !expect.actionNotIn.includes(decision.action),
    };
  }
  if (typeof expect.scaffoldLevelAtMost === 'number') {
    checks.scaffoldLevelAtMost = {
      got: decision.scaffoldLevel,
      want: `<= ${expect.scaffoldLevelAtMost}`,
      ok: decision.scaffoldLevel <= expect.scaffoldLevelAtMost,
    };
  }
  if (typeof expect.diagnosisType === 'string') {
    checks.diagnosisType = {
      got: decision.diagnosis && decision.diagnosis.type,
      want: expect.diagnosisType,
      ok: (decision.diagnosis && decision.diagnosis.type) === expect.diagnosisType,
    };
  }
}

function checkExpectations(expect, obs) {
  const checks = {};
  if (!expect) return checks;
  if (expect.messageType) {
    checks.messageType = { got: obs.messageType, want: expect.messageType, ok: obs.messageType === expect.messageType };
  }
  if (expect.answerValue) {
    const got = obs.answer && obs.answer.value;
    checks.answerValue = { got, want: expect.answerValue, ok: got === expect.answerValue };
  }
  if (expect.notAnswerAttempt) {
    checks.notAnswerAttempt = { got: obs.messageType, ok: obs.messageType !== 'answer_attempt' };
  }
  if (typeof expect.isBareProblemDrop === 'boolean') {
    checks.isBareProblemDrop = { got: obs.isBareProblemDrop, want: expect.isBareProblemDrop, ok: obs.isBareProblemDrop === expect.isBareProblemDrop };
  }
  return checks;
}

/**
 * @param {object} scenario  one entry from scenarios.json / personas.json
 * @param {object} [opts]
 * @param {(args:{scenario,turnIndex,history,student})=>Promise<string>|string} [opts.generateReply]
 *        Produce the tutor's reply for this turn. Omit to run classification-only.
 * @param {(args:{scenario,turn,decision,history})=>object} [opts.assemblePrompt]
 *        Assemble the real prompt for `expectPrompt` checks. Injected (not
 *        required here) because generate.js pulls in the OpenAI client at
 *        module load — the caller mocks llmGateway first.
 * @returns {Promise<{name, turns, classificationPassed, judgesPassed, passed}>}
 */
async function runScenario(scenario, opts = {}) {
  const { generateReply, assemblePrompt } = opts;
  const history = [];
  const turns = [];

  for (let i = 0; i < scenario.turns.length; i++) {
    const turn = scenario.turns[i];

    // A pre-seeded tutor line (context the student is responding to). May
    // carry a problemResult stamp / problemInfo so streak- and grading-
    // driven branches in observe/diagnose fire exactly as in production.
    if (turn.assistant) {
      history.push({
        role: 'assistant',
        content: turn.assistant,
        ...(turn.problemResult ? { problemResult: turn.problemResult } : {}),
        ...(turn.problemInfo ? { problemInfo: turn.problemInfo } : {}),
      });
      continue;
    }

    const student = turn.student;
    const obs = classify(student, history, scenario);
    const checks = checkExpectations(turn.expect, obs);

    // Decide layer — opt-in per turn. Runs the real diagnose → decide with
    // the LLM boundary empty (deterministic), then asserts on the chosen
    // instructional action and, optionally, the assembled prompt.
    let decision = null;
    if (turn.expectDecide || turn.expectPrompt) {
      const layer = await runDecideLayer(obs, student, history, scenario);
      decision = layer.decision;
      checkDecideExpectations(turn.expectDecide, decision, checks);

      if (turn.expectPrompt && assemblePrompt) {
        const assembled = assemblePrompt({ scenario, turn, decision, history: [...history, { role: 'user', content: student }] });
        const promptText = JSON.stringify(assembled.messages);
        for (const needle of turn.expectPrompt.mustNotContain || []) {
          checks[`promptMustNotContain(${needle})`] = {
            got: promptText.includes(needle) ? 'present' : 'absent',
            want: 'absent',
            ok: !promptText.includes(needle),
          };
        }
      }
    }

    history.push({ role: 'user', content: student });

    let reply = null;
    let violations = [];
    const wantsReply = (Array.isArray(turn.judge) && turn.judge.length) || turn.judgeLlm;
    if (generateReply && wantsReply) {
      reply = await generateReply({ scenario, turn, turnIndex: i, history, student });
      if (Array.isArray(turn.judge) && turn.judge.length) {
        const ctx = {
          ...(turn.ctx || {}),
          answer: turn.ctx?.answer ?? scenario.answer,
          hasFocus: turn.ctx?.hasFocus ?? !!scenario.focus,
          focusTerms: scenario.focusTerms || [],
        };
        violations = judgeReply(reply, turn.judge, ctx).violations;
      }
      history.push({ role: 'assistant', content: reply });
    }

    turns.push({
      student,
      obs: { messageType: obs.messageType, answer: obs.answer, isBareProblemDrop: obs.isBareProblemDrop },
      decision: decision ? { action: decision.action, scaffoldLevel: decision.scaffoldLevel } : null,
      judgeLlm: turn.judgeLlm || null,
      checks,
      reply,
      violations,
    });
  }

  const classificationPassed = turns.every((t) => Object.values(t.checks).every((c) => c.ok));
  const judgesPassed = turns.every((t) => t.violations.length === 0);
  return { name: scenario.name, turns, classificationPassed, judgesPassed, passed: classificationPassed && judgesPassed };
}

/** Format a failed scenario result into a readable report line set. */
function formatFailures(result) {
  const lines = [];
  for (const t of result.turns) {
    for (const [k, c] of Object.entries(t.checks)) {
      if (!c.ok) lines.push(`  classification[${k}]: got ${JSON.stringify(c.got)}, want ${JSON.stringify(c.want)} — student: "${t.student}"`);
    }
    for (const v of t.violations) {
      lines.push(`  judge[${v.judge}]: ${v.evidence}\n    reply: "${String(t.reply).slice(0, 160)}"`);
    }
  }
  return lines;
}

module.exports = { runScenario, formatFailures };

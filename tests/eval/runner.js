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
const { judgeReply } = require('./judges');

function classify(studentMsg, history, scenario) {
  return observe(studentMsg, {
    recentUserMessages: history.filter((m) => m.role === 'user').slice(-6),
    recentAssistantMessages: history.filter((m) => m.role === 'assistant').slice(-6),
    hasRecentUpload: !!scenario.hasRecentUpload,
  });
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
 * @param {object} scenario  one entry from scenarios.json
 * @param {object} [opts]
 * @param {(args:{scenario,turnIndex,history,student})=>Promise<string>|string} [opts.generateReply]
 *        Produce the tutor's reply for this turn. Omit to run classification-only.
 * @returns {Promise<{name, turns, classificationPassed, judgesPassed, passed}>}
 */
async function runScenario(scenario, opts = {}) {
  const { generateReply } = opts;
  const history = [];
  const turns = [];

  for (let i = 0; i < scenario.turns.length; i++) {
    const turn = scenario.turns[i];

    // A pre-seeded tutor line (context the student is responding to).
    if (turn.assistant) {
      history.push({ role: 'assistant', content: turn.assistant });
      continue;
    }

    const student = turn.student;
    const obs = classify(student, history, scenario);
    const checks = checkExpectations(turn.expect, obs);
    history.push({ role: 'user', content: student });

    let reply = null;
    let violations = [];
    if (generateReply && Array.isArray(turn.judge) && turn.judge.length) {
      reply = await generateReply({ scenario, turn, turnIndex: i, history, student });
      const ctx = {
        ...(turn.ctx || {}),
        answer: turn.ctx?.answer ?? scenario.answer,
        hasFocus: turn.ctx?.hasFocus ?? !!scenario.focus,
        focusTerms: scenario.focusTerms || [],
      };
      violations = judgeReply(reply, turn.judge, ctx).violations;
      history.push({ role: 'assistant', content: reply });
    }

    turns.push({ student, obs: { messageType: obs.messageType, answer: obs.answer, isBareProblemDrop: obs.isBareProblemDrop }, checks, reply, violations });
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

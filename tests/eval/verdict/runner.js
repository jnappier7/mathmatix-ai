/**
 * Verdict-accuracy runner: every corpus case through the PRODUCTION verdict
 * path — utils/pipeline/index.js observeAndDiagnose, the same function
 * runPipeline calls — and scored against the hand-worked key.
 *
 * Each case runs in two contexts a real student meets:
 *   pinned   — the tutor posed the problem in a normal turn, so the board
 *              synthesizer pinned whatever IT reads from the pose (the real
 *              synthesizer, so a mis-pin is measured, not assumed away);
 *   unpinned — the problem arrived where nothing pins it (the greeting's
 *              warm-up), so only the conversation carries it;
 *   session  — a recorded multi-turn exchange (corpus SESSIONS): sub-questions,
 *              a parallel example, a confirmation in passing. The pin is the
 *              recorded one and every tutor turn carries the key persist
 *              would have stamped on it;
 *   session-unpinned — the same exchange with no board pin, so only the
 *              stamps and the conversation carry the question;
 *   followup — the student already answered, the tutor replied without a
 *              verdict, and the student asks "are they correct?". Owner
 *              session 2026-11-03: that turn was graded by nothing, left the
 *              tutor unrestricted, and "5. 3/8" (slope 8/3) was called correct.
 *
 * Outcome per case:
 *   right        — the verdict matches the key
 *   abstain      — no verdict (unverifiable). Safe: the tutor must ask, not assert.
 *   FALSE_REJECT — a right answer called wrong. The worst outcome.
 *   FALSE_ACCEPT — a wrong answer called right.
 *   UNGUARDED    — followup only: no verdict AND no restriction
 *                  (verificationState not_applicable), so the tutor is free
 *                  to say "you nailed all of them" about anything.
 *
 * @module tests/eval/verdict/runner
 */

const { observeAndDiagnose } = require('../../../utils/pipeline/index');
const { synthesizeBoardCommands } = require('../../../utils/pipeline/boardSynthesizer');
const { solverStampFor } = require('../../../utils/pipeline/poseStamp');
const { buildCases, buildSessionCases } = require('./corpus');
const { declareOpenQuestion } = require('../../../utils/pipeline/openQuestion');
const { boardProblemStatement } = require('../../../utils/pipeline/llmVerifier');

// ── The open-question record, graded in shadow ──
// With `shadow` on, the last tutor turn is read exactly as production reads it
// after a reply is saved, and observeAndDiagnose grades the student's message
// against that record beside the live graders. Each row then carries both
// verdicts, so the scoreboard compares them case for case. Read once per
// (conversation, pin) and reused across that problem's answers — the record
// belongs to the tutor's turn, not to the reply.
const declared = new Map();
function recordFor(messages, pin) {
  const turn = messages[messages.length - 1];
  const key = JSON.stringify([pin, messages.map(m => m.content)]);
  if (!declared.has(key)) {
    const before = messages.slice(0, -1);
    declared.set(key, declareOpenQuestion({
      reply: turn.content,
      boardProblem: boardProblemStatement(pin, before),
      history: before.map(m => ({ role: m.role, content: m.content })),
    }));
  }
  return declared.get(key);
}

async function withRecord(messages, pin, shadow) {
  if (!shadow || !messages.length || messages[messages.length - 1].role !== 'assistant') return messages;
  const record = await recordFor(messages, pin);
  if (!record) return messages;
  return [...messages.slice(0, -1), { ...messages[messages.length - 1], openQuestion: record }];
}

async function shadowOf(run, expected) {
  if (!run || !run.openQuestionShadowPromise) return { shadow: null, shadowKind: run && run.openQuestion ? run.openQuestion.kind : null };
  const s = await run.openQuestionShadowPromise;
  const isCorrect = s ? s.isCorrect : null;
  return {
    shadow: classify(expected, isCorrect),
    shadowVia: s ? s.via : null,
    shadowKind: run.openQuestion ? run.openQuestion.kind : null,
    shadowKey: run.openQuestion ? run.openQuestion.answer : null,
    shadowFinal: run.openQuestion ? run.openQuestion.finalAnswer : null,
  };
}

function pinFor(pose) {
  const cmds = synthesizeBoardCommands({
    studentMessage: 'ok give me one',
    tutorResponse: pose,
    lastBoardAction: null,
    pinnedProblem: null,
    recentAssistantMessages: [],
  }) || [];
  const pose_ = cmds.find(c => c.action === 'pose' && c.tex);
  return pose_ ? pose_.tex : null;
}

const FOLLOW_UPS = ['are they correct?', 'no need. is that right?', 'did i get it right?'];

function classify(expected, isCorrect, { context, verificationState } = {}) {
  if (isCorrect === null || isCorrect === undefined) {
    if (context === 'followup' && verificationState !== 'unverified') return 'UNGUARDED';
    return 'abstain';
  }
  if (expected === 'correct') return isCorrect ? 'right' : 'FALSE_REJECT';
  return isCorrect ? 'FALSE_ACCEPT' : 'right';
}

function followUpFor(c) {
  let h = 0;
  for (const ch of c.problem.id + c.answer) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FOLLOW_UPS[h % FOLLOW_UPS.length];
}

async function runCase(c, context, { shadow = false } = {}) {
  const pin = context === 'pinned' ? pinFor(c.problem.pose) : null;
  const messages = [{ role: 'user', content: 'can I get a practice problem' }];
  for (const turn of c.problem.before || []) messages.push({ role: 'assistant', content: turn }, { role: 'user', content: 'ok' });
  messages.push({ role: 'assistant', content: c.problem.pose });
  let message = c.answer;
  if (context === 'followup') {
    messages.push(
      { role: 'user', content: c.answer },
      { role: 'assistant', content: "Let's go through your work together. Can you walk me through your first step?" },
    );
    message = followUpFor(c);
  }
  const conversation = {
    // A follow-up re-grades an earlier submission, so the record that matters
    // sits mid-conversation; the shadow is measured on first replies only.
    messages: context === 'followup' ? messages : await withRecord(messages, pin, shadow),
    boardProblem: pin ? { tex: pin } : null,
    lastBoardAction: pin ? 'pose' : null,
    lastProblemState: null,
  };
  const ctx = { conversation, user: { _id: 'verdict-eval', firstName: 'Eval' }, activeSkill: null };

  let diagnosis;
  let run = null;
  let failure = null;
  try {
    run = await observeAndDiagnose(message, ctx);
    ({ diagnosis } = run);
  } catch (e) {
    failure = e.message;
  }
  const isCorrect = diagnosis ? diagnosis.isCorrect : null;
  return {
    ...(shadow && context !== 'followup' ? await shadowOf(run, c.expected) : {}),
    id: c.problem.id,
    topic: c.problem.topic,
    context,
    pin,
    answer: context === 'followup' ? `${c.answer} → ${message}` : c.answer,
    expected: c.expected,
    isCorrect,
    source: diagnosis ? diagnosis.verificationSource || null : null,
    verificationState: diagnosis ? diagnosis.verificationState || null : null,
    outcome: failure ? 'error' : classify(c.expected, isCorrect, {
      context, verificationState: diagnosis && diagnosis.verificationState,
    }),
    error: failure,
  };
}

// What persist leaves on a stored tutor turn. The schema keeps type,
// correctAnswer and source — `roots` is dropped on save, so it is dropped here.
function stamped(turn) {
  if (turn.role !== 'assistant') return { ...turn };
  let stamp = null;
  try { stamp = solverStampFor(turn.content); } catch (_) { /* unstamped */ }
  if (!stamp) return { ...turn };
  const { type, correctAnswer, source } = stamp.info;
  return { ...turn, problemInfo: { type, correctAnswer, ...(source ? { source } : {}) } };
}

async function runSessionCase(c, context, { shadow = false } = {}) {
  const s = c.session;
  const pin = context === 'session' ? s.pin : null;
  const conversation = {
    messages: await withRecord(s.turns.map(stamped), pin, shadow),
    boardProblem: pin ? { tex: pin } : null,
    lastBoardAction: pin ? 'pose' : null,
    lastProblemState: null,
  };
  const ctx = { conversation, user: { _id: 'verdict-eval', firstName: 'Eval' }, activeSkill: null };
  let diagnosis;
  let run = null;
  let failure = null;
  try {
    run = await observeAndDiagnose(c.answer, ctx);
    ({ diagnosis } = run);
  } catch (e) {
    failure = e.message;
  }
  const isCorrect = diagnosis ? diagnosis.isCorrect : null;
  return {
    ...(shadow ? await shadowOf(run, c.expected) : {}),
    id: s.id,
    topic: s.topic,
    context,
    pin,
    answer: c.answer,
    expected: c.expected,
    isCorrect,
    source: diagnosis ? diagnosis.verificationSource || null : null,
    verificationState: diagnosis ? diagnosis.verificationState || null : null,
    outcome: failure ? 'error' : classify(c.expected, isCorrect, { context }),
    error: failure,
  };
}

const SESSION_CONTEXTS = ['session', 'session-unpinned'];

async function runAll({ concurrency = 1, contexts = ['pinned', 'unpinned', 'followup', ...SESSION_CONTEXTS], filter = null, quiet = true, shadow = false } = {}) {
  const jobs = [];
  for (const c of buildCases()) {
    if (filter && !filter(c)) continue;
    for (const context of contexts) if (!SESSION_CONTEXTS.includes(context)) jobs.push([c, context]);
  }
  for (const c of buildSessionCases()) {
    // A filter written for single-pose cases reads c.problem; give it the
    // session under the same name so --topic / --id keep working.
    if (filter && !filter({ ...c, problem: c.session })) continue;
    for (const context of contexts) if (SESSION_CONTEXTS.includes(context)) jobs.push([c, context]);
  }
  const results = new Array(jobs.length);
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const i = next++;
      results[i] = jobs[i][0].session
        ? await runSessionCase(jobs[i][0], jobs[i][1], { shadow })
        : await runCase(jobs[i][0], jobs[i][1], { shadow });
    }
  }
  // Muted once around the whole run: swapping per case under concurrency let a
  // worker "restore" another worker's no-op and silence the console for good.
  const log = console.log;
  const err = console.error;
  if (quiet) { console.log = () => {}; console.error = () => {}; }
  try {
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  } finally {
    console.log = log; console.error = err;
  }
  return results;
}

function summarize(results) {
  const count = (rows, o) => rows.filter(r => r.outcome === o).length;
  const line = (rows) => ({
    n: rows.length,
    right: count(rows, 'right'),
    abstain: count(rows, 'abstain'),
    falseReject: count(rows, 'FALSE_REJECT'),
    falseAccept: count(rows, 'FALSE_ACCEPT'),
    unguarded: count(rows, 'UNGUARDED'),
    error: count(rows, 'error'),
  });
  const byTopic = {};
  for (const r of results) (byTopic[r.topic] = byTopic[r.topic] || []).push(r);
  const byContext = {};
  for (const r of results) (byContext[r.context] = byContext[r.context] || []).push(r);
  return {
    overall: line(results),
    byContext: Object.fromEntries(Object.entries(byContext).map(([k, v]) => [k, line(v)])),
    byTopic: Object.fromEntries(Object.entries(byTopic).map(([k, v]) => [k, line(v)])),
    failures: results.filter(r => ['FALSE_REJECT', 'FALSE_ACCEPT', 'UNGUARDED', 'error'].includes(r.outcome)),
  };
}

module.exports = { runAll, runCase, runSessionCase, summarize, classify, pinFor };

/**
 * TRANSCRIPT MINER — the eval-as-feedback-loop.
 *
 * Runs the tutor-reply judges (utils/replyJudges.js — the same detectors the
 * eval harness uses in CI, and the live pipeline runs per-turn via Stage 5g /
 * judgeMetrics) over RECENT PRODUCTION conversations, so the
 * failure classes we already know how to detect get spotted in the wild
 * instead of waiting for a human to read a transcript. Every hit is a
 * CANDIDATE for human review and a candidate eval scenario — judges are a
 * regression net, not ground truth (see PR #1443's calibration), so nothing
 * here auto-actions anything.
 *
 * Judge ctx is derived from the pipeline's OWN stamps, no re-grading:
 *   studentWasCorrect ← the assistant reply's `problemResult` stamp
 *                       (persist.js stamps the reply to an answer attempt)
 *   hasFocus / answer ← the active-problem state machine over `problemInfo`
 *                       (set on AI messages that pose a problem) and the
 *                       stamps that close one out
 *   mustNotReveal     ← mirrors the answer-injection gate: an active problem
 *                       the student hasn't solved yet must not be revealed
 *   shouldElicit      ← observe()'s isBareProblemDrop on the student turn
 *                       (same pure classifier the live pipeline runs)
 *
 * Tiers:
 *   1. Deterministic sweep — pure regex judges, every assistant turn in the
 *      window. No LLM cost.
 *   2. LLM tier — answerLeak / scaffoldVsTell / toneSupport on a BUDGET-CAPPED
 *      sample of flagged + random turns. All transcript text is anonymized
 *      (utils/piiAnonymizer) before it leaves the process — FERPA: no student
 *      names to the API. callLLMStructured does NOT anonymize on its own.
 *
 * Output: a TutorQualityReport document (models/tutorQualityReport.js) —
 * per-judge violation counts ranked by absolute count (same rationale as
 * verifyMetrics.unresolvedByMathType: absolute count IS the work-list order),
 * the specific transcript moments, and scenarios.json-shaped stubs ready to
 * paste into tests/eval/scenarios.json. Surfaced on
 * GET /api/admin/tutor-quality-report.
 *
 * @module transcriptMiner
 */

'use strict';

const { JUDGES } = require('./replyJudges');
const { observe } = require('./pipeline/observe');
const { createAnonymizationContext } = require('./piiAnonymizer');
const logger = require('./logger').child({ module: 'transcriptMiner' });

const DETERMINISTIC_JUDGES = Object.keys(JUDGES);

// Excerpt caps — findings are stored in Mongo and rendered in an admin table;
// they need enough text to judge the moment, not the whole reply.
const EXCERPT_CHARS = 300;
const MAX_FINDINGS_PER_RUN = 200;
const MAX_SCENARIO_STUBS = 20;

const DEFAULTS = {
  windowHours: 24,
  maxConversations: Number(process.env.TRANSCRIPT_MINER_MAX_CONVERSATIONS) || 500,
  maxMessagesPerConversation: 200,
  llmBudget: Number(process.env.TRANSCRIPT_MINER_LLM_BUDGET) || 40,
  llmEnabled: process.env.TRANSCRIPT_MINER_DISABLE_LLM !== 'true',
};

function excerpt(text, max = EXCERPT_CHARS) {
  const s = String(text || '');
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/**
 * Walk a conversation's messages and derive one judgeable record per
 * assistant turn, with the judge ctx reconstructed from the pipeline's stamps.
 * Pure — no DB, no LLM.
 *
 * State machine: an assistant message with `problemInfo.correctAnswer` opens
 * an active problem; a later assistant message stamped 'correct' or 'skipped'
 * closes it (AFTER that turn is judged — the closing reply itself is judged
 * against the still-active problem, which is exactly the turn where
 * rejectedCorrectAnswer matters).
 *
 * @param {Array} messages - conversation.messages (lean objects are fine)
 * @returns {Array<{index, studentIndex, reply, studentMessage, ctx, stamp,
 *                  observation, activeProblem, timestamp}>}
 */
function deriveTurns(messages) {
  const msgs = Array.isArray(messages) ? messages : [];
  const turns = [];
  let active = null; // { answer, type, posedIndex, problemText }

  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i];
    if (!msg || msg.role !== 'assistant') continue;

    // The student turn this reply responds to: nearest preceding user message
    // with no assistant message in between (multi-part assistant turns respond
    // to the same student message only via their first part).
    let studentIndex = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (msgs[j].role === 'user') { studentIndex = j; break; }
      if (msgs[j].role === 'assistant') break;
    }
    const studentMsg = studentIndex >= 0 ? String(msgs[studentIndex].content || '') : null;

    // Re-run the pipeline's own pure classifier on the student turn so
    // shouldElicit (bare problem drop) and frustration signals match what the
    // live pipeline saw. Windows are rebuilt exactly as pipeline/index.js does.
    let observation = null;
    if (studentMsg) {
      try {
        const prior = msgs.slice(0, studentIndex);
        observation = observe(studentMsg, {
          recentUserMessages: prior.filter(m => m.role === 'user').slice(-6),
          recentAssistantMessages: prior.filter(m => m.role === 'assistant').slice(-6),
          recentProblemResults: prior
            .filter(m => m.role === 'assistant' && m.problemResult)
            .slice(-6)
            .map(m => m.problemResult),
        });
      } catch (err) {
        // Classification is best-effort here — a turn we can't classify is
        // still judged with the stamp-derived ctx.
        logger.debug('observe failed during mining', { error: err.message });
      }
    }

    const stamp = msg.problemResult || null;
    // Single-character answers ("5") substring-match half of any math reply —
    // pure noise for revealedAnswer. Only arm the reveal judges on answers
    // with enough surface to be a meaningful match.
    const answer = active && String(active.answer).trim().length >= 2
      ? String(active.answer).trim()
      : null;

    const ctx = {
      studentWasCorrect: stamp === 'correct',
      hasFocus: !!active,
      shouldElicit: !!(observation && observation.isBareProblemDrop),
      answer,
      // Mirrors the answer-injection gate: while a problem is live and this
      // turn didn't resolve it (correct) or abandon it (skipped), the tutor
      // must not hand over the answer.
      mustNotReveal: !!(answer && stamp !== 'correct' && stamp !== 'skipped'),
    };

    turns.push({
      index: i,
      studentIndex,
      reply: String(msg.content || ''),
      studentMessage: studentMsg,
      ctx,
      stamp,
      observation: observation
        ? {
            messageType: observation.messageType,
            isBareProblemDrop: !!observation.isBareProblemDrop,
          }
        : null,
      activeProblem: active,
      timestamp: msg.timestamp || null,
    });

    // Update state AFTER judging this turn.
    if (stamp === 'correct' || stamp === 'skipped') active = null;
    if (msg.problemInfo && msg.problemInfo.correctAnswer) {
      active = {
        answer: String(msg.problemInfo.correctAnswer),
        type: msg.problemInfo.type || null,
        posedIndex: i,
        problemText: excerpt(String(msg.content || ''), 200),
      };
    }
  }
  return turns;
}

/**
 * Run every deterministic judge over the derived turns of one message list.
 * @param {Array} messages
 * @param {Object} [opts]
 * @param {Date}   [opts.since] - only judge turns stamped at/after this time
 *   (stampless legacy turns are judged — the sweep window filter is a cost
 *   cap, not a correctness gate)
 * @returns {{turns: Array, hits: Array<{turnIndex, judge, evidence, turn}>}}
 */
function mineMessages(messages, opts = {}) {
  const all = deriveTurns(messages);
  const turns = opts.since
    ? all.filter(t => !t.timestamp || new Date(t.timestamp) >= opts.since)
    : all;
  const hits = [];
  for (const t of turns) {
    for (const name of DETERMINISTIC_JUDGES) {
      const r = JUDGES[name](t.reply, t.ctx);
      if (r.violated) hits.push({ turnIndex: t.index, judge: name, evidence: r.evidence, turn: t });
    }
  }
  return { turns, hits };
}

/**
 * Per-judge eligibility: how many turns each judge's gate was actually armed
 * on. Violation RATES against the full turn count would be meaningless —
 * rejectedCorrectAnswer can only fire on correct-answer turns.
 */
function judgeEligible(judge, turn) {
  switch (judge) {
    case 'rejectedCorrectAnswer':
    case 'assertedFalseEquivalence':
      return !!turn.ctx.studentWasCorrect;
    case 'lostContext':
      return !!turn.ctx.hasFocus;
    case 'solvedInsteadOfEliciting':
      return !!turn.ctx.shouldElicit;
    case 'revealedAnswer':
      return !!turn.ctx.mustNotReveal;
    default: // usedImpreciseTerm, badOrderOfOperations — armed on every turn
      return true;
  }
}

/**
 * Build a scenarios.json-shaped stub from one finding, ready to paste into
 * tests/eval/scenarios.json (all text pre-anonymized by the caller).
 */
function buildScenarioStub(finding, anonymize) {
  const t = finding.turn;
  const stubTurns = [];
  if (t.activeProblem && t.activeProblem.problemText) {
    stubTurns.push({ assistant: anonymize(t.activeProblem.problemText) });
  }
  stubTurns.push({
    student: t.studentMessage ? anonymize(t.studentMessage) : '(no student turn captured)',
    ctx: {
      studentWasCorrect: t.ctx.studentWasCorrect,
      hasFocus: t.ctx.hasFocus,
      ...(t.ctx.shouldElicit ? { shouldElicit: true } : {}),
    },
    judge: [finding.judge],
  });
  return {
    name: `mined ${finding.judge}: conv ${finding.conversationId} turn ${finding.turnIndex}`,
    ...(t.activeProblem ? { focus: anonymize(t.activeProblem.problemText) } : {}),
    ...(t.ctx.answer ? { answer: t.ctx.answer } : {}),
    turns: stubTurns,
    // Human-review context, not part of the scenario contract: what the tutor
    // actually said, and where it came from.
    _observedReply: anonymize(excerpt(t.reply)),
    _evidence: anonymize(finding.evidence),
    _minedFrom: { conversationId: finding.conversationId, turnIndex: finding.turnIndex },
  };
}

// ── LLM tier ────────────────────────────────────────────────────────────────

/**
 * Select which turns get an LLM judge, and which judge. Flagged turns first
 * (that's where a second opinion is worth paying for), then a random sample of
 * eligible unflagged turns for base rates. Hard-capped at `budget` calls.
 *
 * @param {Array} candidates - [{convo, turn, flaggedBy: string[]}]
 * @param {number} budget
 * @param {Function} [rng]
 * @returns {Array<{convo, turn, llmJudge, sampledBecause}>}
 */
function selectLlmSample(candidates, budget, rng = Math.random) {
  const wanted = [];
  for (const c of candidates) {
    const { turn } = c;
    const frustrated = turn.observation
      && ['frustration', 'give_up'].includes(turn.observation.messageType);
    if (frustrated && turn.studentMessage) {
      wanted.push({ ...c, llmJudge: 'toneSupport' });
    } else if (turn.ctx.mustNotReveal && turn.activeProblem) {
      wanted.push({ ...c, llmJudge: 'answerLeak' });
    } else if (turn.stamp === 'incorrect' && turn.studentMessage) {
      wanted.push({ ...c, llmJudge: 'scaffoldVsTell' });
    }
  }
  const flagged = wanted.filter(w => w.flaggedBy.length > 0);
  const unflagged = wanted.filter(w => w.flaggedBy.length === 0);
  // Fisher–Yates on the unflagged pool so the base-rate sample isn't biased
  // toward the most recent conversations.
  for (let i = unflagged.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [unflagged[i], unflagged[j]] = [unflagged[j], unflagged[i]];
  }
  return [...flagged, ...unflagged].slice(0, Math.max(0, budget)).map(w => ({
    ...w,
    sampledBecause: w.flaggedBy.length > 0 ? 'flagged' : 'random',
  }));
}

/** Did an LLM verdict constitute a candidate violation? */
function llmVerdictViolated(llmJudge, verdict) {
  if (!verdict || verdict.uncertain) return false;
  if (llmJudge === 'answerLeak') return verdict.leaked === true;
  if (llmJudge === 'toneSupport') {
    return verdict.acknowledgesFeeling === false || verdict.pushesNewProblem === true;
  }
  if (llmJudge === 'scaffoldVsTell') return verdict.classification === 'tell';
  return false;
}

async function runLlmTier(sample, anonymizers) {
  // Lazy require: keyless environments (unit tests) never touch the module.
  const { judgeAnswerLeak, judgeScaffoldVsTell, judgeToneSupport } = require('./replyLlmJudges');
  const results = [];
  for (const item of sample) {
    const anon = anonymizers.get(String(item.convo.userId)) || ((s) => s);
    const t = item.turn;
    let verdict;
    try {
      if (item.llmJudge === 'answerLeak') {
        verdict = await judgeAnswerLeak({
          problem: anon(t.activeProblem.problemText),
          expectedAnswer: t.ctx.answer,
          tutorReply: anon(t.reply),
        });
      } else if (item.llmJudge === 'toneSupport') {
        verdict = await judgeToneSupport({
          studentMessage: anon(t.studentMessage),
          tutorReply: anon(t.reply),
        });
      } else {
        verdict = await judgeScaffoldVsTell({
          studentMessage: anon(t.studentMessage),
          tutorReply: anon(t.reply),
        });
      }
    } catch (err) {
      verdict = { uncertain: true, error: err.message };
    }
    results.push({
      conversationId: String(item.convo._id),
      userId: String(item.convo.userId),
      turnIndex: t.index,
      llmJudge: item.llmJudge,
      sampledBecause: item.sampledBecause,
      flaggedBy: item.flaggedBy,
      verdict,
      violated: llmVerdictViolated(item.llmJudge, verdict),
    });
  }
  return results;
}

// ── The sweep ───────────────────────────────────────────────────────────────

/**
 * Mine all conversations active in the window and assemble the report body.
 * Requires a live mongoose connection.
 *
 * @param {Object} [options] - see DEFAULTS; plus {now} for tests
 * @returns {Promise<Object>} report body (not yet persisted)
 */
async function sweep(options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const Conversation = require('../models/conversation');
  const User = require('../models/user');

  const startedAt = Date.now();
  const now = opts.now ? new Date(opts.now) : new Date();
  const windowStart = new Date(now.getTime() - opts.windowHours * 3600 * 1000);

  const conversations = await Conversation.find({ lastActivity: { $gte: windowStart } })
    .select('userId messages conversationType topic lastActivity')
    .sort({ lastActivity: -1 })
    .limit(opts.maxConversations)
    .lean();

  // Anonymization contexts per student — evidence excerpts, stubs, and every
  // LLM payload go through these. Names never reach the report or the API.
  const userIds = [...new Set(conversations.map(c => String(c.userId)))];
  const users = await User.find({ _id: { $in: userIds } })
    .select('firstName lastName username')
    .lean();
  const anonymizers = new Map(users.map(u => {
    const ctx = createAnonymizationContext(u);
    return [String(u._id), (s) => ctx.anonymize(String(s || ''))];
  }));

  const perJudge = new Map(DETERMINISTIC_JUDGES.map(j => [j, { judge: j, eligibleTurns: 0, violations: 0 }]));
  const findings = [];
  const llmCandidates = [];
  let turnsJudged = 0;

  for (const convo of conversations) {
    const messages = (convo.messages || []).slice(-opts.maxMessagesPerConversation);
    const { turns, hits } = mineMessages(messages, { since: windowStart });
    turnsJudged += turns.length;

    for (const t of turns) {
      for (const j of DETERMINISTIC_JUDGES) {
        if (judgeEligible(j, t)) perJudge.get(j).eligibleTurns += 1;
      }
    }

    const flaggedByTurn = new Map();
    for (const hit of hits) {
      perJudge.get(hit.judge).violations += 1;
      const anon = anonymizers.get(String(convo.userId)) || ((s) => s);
      if (findings.length < MAX_FINDINGS_PER_RUN) {
        findings.push({
          conversationId: String(convo._id),
          userId: String(convo.userId),
          topic: convo.topic || null,
          conversationType: convo.conversationType || null,
          turnIndex: hit.turnIndex,
          judge: hit.judge,
          evidence: anon(hit.evidence),
          replyExcerpt: anon(excerpt(hit.turn.reply)),
          studentExcerpt: hit.turn.studentMessage ? anon(excerpt(hit.turn.studentMessage)) : null,
          ctx: hit.turn.ctx,
          stamp: hit.turn.stamp,
          timestamp: hit.turn.timestamp,
          turn: hit.turn, // stripped before persist; carried for stub building
        });
      }
      const list = flaggedByTurn.get(hit.turnIndex) || [];
      list.push(hit.judge);
      flaggedByTurn.set(hit.turnIndex, list);
    }

    for (const t of turns) {
      llmCandidates.push({ convo, turn: t, flaggedBy: flaggedByTurn.get(t.index) || [] });
    }
  }

  // Ranked by absolute violation count — same work-list rationale as
  // verifyMetrics.unresolvedByMathType: absolute count is where fixing buys
  // the most turns, a rate would float one-off gates to the top.
  const rankedJudges = [...perJudge.values()]
    .map(b => ({
      ...b,
      violationRate: b.eligibleTurns > 0 ? Number((b.violations / b.eligibleTurns).toFixed(4)) : 0,
    }))
    .sort((a, b) => b.violations - a.violations);

  // LLM tier (budget-capped, anonymized).
  let llmTier = { enabled: false, calls: 0, results: [] };
  if (opts.llmEnabled && opts.llmBudget > 0 && process.env.OPENAI_API_KEY) {
    const sample = selectLlmSample(llmCandidates, opts.llmBudget);
    const results = await runLlmTier(sample, anonymizers);
    const byJudge = {};
    for (const r of results) {
      const b = byJudge[r.llmJudge] || { calls: 0, violations: 0, uncertain: 0 };
      b.calls += 1;
      if (r.violated) b.violations += 1;
      if (r.verdict && r.verdict.uncertain) b.uncertain += 1;
      byJudge[r.llmJudge] = b;
    }
    llmTier = { enabled: true, budget: opts.llmBudget, calls: results.length, byJudge, results };
  }

  // Scenario stubs from the top findings, spread across judges (up to
  // MAX_SCENARIO_STUBS, at most ~1/3 from any single judge so one noisy
  // detector can't monopolize the candidate list).
  const perJudgeCap = Math.max(1, Math.ceil(MAX_SCENARIO_STUBS / 3));
  const stubCounts = new Map();
  const scenarioStubs = [];
  for (const f of findings) {
    if (scenarioStubs.length >= MAX_SCENARIO_STUBS) break;
    const used = stubCounts.get(f.judge) || 0;
    if (used >= perJudgeCap) continue;
    const anon = anonymizers.get(f.userId) || ((s) => s);
    scenarioStubs.push(buildScenarioStub({ ...f, turn: f.turn }, anon));
    stubCounts.set(f.judge, used + 1);
  }

  // The `turn` field was working state for stub building — never persist the
  // raw (un-anonymized) reply/student text.
  for (const f of findings) delete f.turn;

  return {
    windowHours: opts.windowHours,
    windowStart,
    windowEnd: now,
    params: {
      maxConversations: opts.maxConversations,
      maxMessagesPerConversation: opts.maxMessagesPerConversation,
      llmBudget: opts.llmBudget,
      llmEnabled: opts.llmEnabled,
    },
    stats: {
      conversationsScanned: conversations.length,
      conversationsTruncated: conversations.length === opts.maxConversations,
      turnsJudged,
      totalViolations: rankedJudges.reduce((s, b) => s + b.violations, 0),
      findingsCapped: findings.length >= MAX_FINDINGS_PER_RUN,
      rankedJudges,
    },
    findings,
    llmTier,
    scenarioStubs,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Run a sweep and persist it as a TutorQualityReport. The one entry point the
 * cron script and the admin trigger endpoint share.
 * @param {Object} [options] - sweep options + {trigger: 'cron'|'admin'}
 * @returns {Promise<Object>} the saved report document
 */
async function runSweepAndSave(options = {}) {
  const TutorQualityReport = require('../models/tutorQualityReport');
  const { trigger = 'cron', ...sweepOpts } = options;
  const body = await sweep(sweepOpts);
  const doc = await TutorQualityReport.create({ ...body, trigger, runAt: new Date() });
  logger.info('transcript_mining_run', {
    trigger,
    conversationsScanned: body.stats.conversationsScanned,
    turnsJudged: body.stats.turnsJudged,
    totalViolations: body.stats.totalViolations,
    llmCalls: body.llmTier.calls,
    durationMs: body.durationMs,
  });
  return doc;
}

module.exports = {
  DETERMINISTIC_JUDGES,
  deriveTurns,
  mineMessages,
  judgeEligible,
  buildScenarioStub,
  selectLlmSample,
  llmVerdictViolated,
  sweep,
  runSweepAndSave,
};

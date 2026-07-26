// utils/actReview.js
//
// The ACT bootcamp "work" phase: after a practice test, the student's MISSED
// items become the material. This builds the ranked review queue from a scored
// session and the per-turn prompt that has the tutor coach one miss at a time —
// diagnose the miss, reteach ONLY if it's a real gap, teach the ACT move, then
// advance. Pure: session + problem lookup in, queue/prompt out (no DB, no LLM),
// so it's unit-testable and reused by both /complete (build) and the chat
// prompt path (present + advance).

const { CATEGORY_LABEL } = require('./actBootcampPlan');

// Higher category exam-weight => higher-leverage miss => reviewed first.
const DEFAULT_CATEGORY_WEIGHTS = {
  'integrating-essential-skills': 9, algebra: 8, functions: 8,
  geometry: 8, 'statistics-probability': 7, 'number-quantity': 5,
};

function optionText(options, label) {
  const o = (options || []).find((x) => x && x.label === label);
  return o ? o.text : null;
}

/**
 * Build the ranked missed-items review queue from a scored ActTestSession.
 * A "miss" is a wrong answer OR a skipped item — both are questions the student
 * didn't get right and should review.
 *
 * @param {Object} session  ActTestSession (needs items[] and responses[])
 * @param {Object} problemsById  problemId -> Problem doc (correctOption, answer, explanation, prompt, options)
 * @param {Object} [weights]  category -> exam weight (leverage)
 * @returns {Array} ranked queue of review items
 */
function buildReviewQueue(session, problemsById = {}, weights = DEFAULT_CATEGORY_WEIGHTS) {
  const itemsById = {};
  (session.items || []).forEach((it) => { if (it && it.problemId) itemsById[it.problemId] = it; });

  const queue = (session.responses || [])
    .filter((r) => r && r.problemId && (r.correct === false || r.skipped === true))
    .map((r) => {
      const it = itemsById[r.problemId] || {};
      const p = problemsById[r.problemId] || {};
      const category = it.category || r.category || 'unknown';
      const options = it.options || p.options || [];
      return {
        problemId: r.problemId,
        skillId: it.skillId || r.skillId || null,
        category,
        prompt: it.content || p.prompt || '',
        options,
        skipped: !!r.skipped,
        theirAnswer: r.skipped ? null : (r.answer || null),
        theirAnswerText: r.skipped ? null : optionText(options, r.answer),
        correctOption: p.correctOption || null,
        correctAnswer: (p.answer && p.answer.value) || null,
        explanation: p.explanation || '',
        leverage: weights[category] || 5,
        status: 'pending',
      };
    })
    .filter((m) => m.problemId);

  // Highest-leverage misses first; stable within a leverage tier.
  return queue
    .map((m, i) => ({ m, i }))
    .sort((a, b) => (b.m.leverage - a.m.leverage) || (a.i - b.i))
    .map((x) => x.m);
}

/**
 * The prompt section for the current miss — injected into the course system
 * prompt while bootcamp.phase === 'review'. Tells the tutor exactly how to coach
 * this one question and when to advance.
 */
function reviewPromptSection(miss, index, total) {
  if (!miss) return '';
  const cat = CATEGORY_LABEL[miss.category] || miss.category || 'ACT Math';
  const opts = (miss.options || []).map((o) => `${o.label}) ${o.text}`).join('   ');
  const chose = miss.skipped
    ? 'They SKIPPED it (no answer).'
    : `They chose ${miss.theirAnswer}${miss.theirAnswerText ? ` (${miss.theirAnswerText})` : ''} — INCORRECT.`;
  const correct = miss.correctOption
    ? `${miss.correctOption}${optionText(miss.options, miss.correctOption) ? ` (${optionText(miss.options, miss.correctOption)})` : ''}`
    : (miss.correctAnswer || '(see explanation)');

  return `

====================================================================
REVIEWING A MISSED QUESTION — ${index + 1} of ${total}  ·  ${cat}
====================================================================
The student is going over a question they got wrong on their practice ACT. Work
THIS one question with them, then advance. Do not move to a different topic.

QUESTION: ${miss.prompt}
${opts ? `OPTIONS: ${opts}` : ''}
${chose}
CORRECT ANSWER: ${correct}.
WORKED SOLUTION (for YOUR reference — never just read it aloud): ${miss.explanation || '(none stored)'}

How to coach it:
1. Ask them to walk through how they got their answer, or to re-try it — do NOT lead with the answer.
2. DIAGNOSE the miss: concept gap, careless slip, or a pacing/strategy problem?
3. RETEACH the underlying concept ONLY if it's a genuine gap — and briefly. A slip earns a caution, not a full lesson.
4. Teach the ACT MOVE for this question type — backsolving, plugging in numbers, estimating, eliminating, spotting the trap, or when to skip.
5. When they can do it on their own, emit the control tag <REVIEW_NEXT> on its own line to move to the next missed question. NEVER emit it until they've shown they've got THIS one; never describe the tag.
====================================================================`;
}

/**
 * The prompt section once every miss has been worked (bootcamp.phase ===
 * 'reassess'). Closes the loop: the tutor offers a FRESH full practice ACT to
 * measure improvement, reusing the existing launch flow (which now serves only
 * unseen items). Emitting <LAUNCH_PRACTICE_ACT> after the student confirms opens
 * the runner — same mechanism as the first baseline.
 */
function reassessPromptSection(bootcamp) {
  const reviewed = (bootcamp && Array.isArray(bootcamp.queue)) ? bootcamp.queue.length : 0;
  return `

====================================================================
BOOTCAMP — TIME TO RE-TEST
====================================================================
The student has now worked through all ${reviewed} question(s) they missed on
their last practice ACT. Close the loop: it's time to measure whether it stuck.
- Congratulate them briefly on finishing the review.
- Offer a FRESH, full timed practice ACT — it draws all-new questions (nothing
  they've seen), so the score is a real comparison to last time.
- ONLY after they confirm they want to start it, emit <LAUNCH_PRACTICE_ACT> on
  its own line to open the test. Never emit it without confirmation.
====================================================================`;
}

/**
 * Advance the review pointer. Returns the new index and whether the queue is done.
 */
function advanceReview(bootcamp) {
  const total = (bootcamp && Array.isArray(bootcamp.queue)) ? bootcamp.queue.length : 0;
  const next = ((bootcamp && bootcamp.index) || 0) + 1;
  return { index: Math.min(next, total), done: next >= total, total };
}

function currentMiss(bootcamp) {
  if (!bootcamp || !Array.isArray(bootcamp.queue)) return null;
  return bootcamp.queue[bootcamp.index || 0] || null;
}

module.exports = {
  buildReviewQueue,
  reviewPromptSection,
  reassessPromptSection,
  advanceReview,
  currentMiss,
  DEFAULT_CATEGORY_WEIGHTS,
};

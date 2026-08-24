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
const { normalizeOptions, resolveChoice, correctLabelOf, actDisplayLabel } = require('./mcOptions');

// Higher category exam-weight => higher-leverage miss => reviewed first.
const DEFAULT_CATEGORY_WEIGHTS = {
  'integrating-essential-skills': 9, algebra: 8, functions: 8,
  geometry: 8, 'statistics-probability': 7, 'number-quantity': 5,
};

function optionText(options, label) {
  // Was `find(x => x.label === label)`, which returned null on every bank that
  // stores the letter as `id`/`letter` or not at all — so the tutor's review
  // prompt named the choice as "undefined". resolveChoice reads the letter
  // positionally, the way the student saw it.
  const o = resolveChoice(options, label);
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
      // Normalized so the letters in the review prompt are the ones the student
      // read on the test, and so nothing downstream sees a label-less option.
      // Keep the RAW array too: it still carries the stored letters, which is
      // what correctOption is named against.
      const rawOptions = (it.options && it.options.length) ? it.options : (p.options || []);
      const options = normalizeOptions(rawOptions);
      return {
        // The question number on THEIR test ("you missed #12") — drives the
        // on-screen number rail and the default review order.
        position: Number.isFinite(r.position) ? r.position : (Number.isFinite(it.position) ? it.position : null),
        problemId: r.problemId,
        skillId: it.skillId || r.skillId || null,
        category,
        prompt: it.content || p.prompt || '',
        svg: it.svg || null,               // figure, when the item has one (card preview)
        options,
        skipped: !!r.skipped,
        theirAnswer: r.skipped ? null : (r.answer || null),
        theirAnswerText: r.skipped ? null : optionText(options, r.answer),
        // The POSITIONAL label — `p.correctOption` is the stored letter, which
        // is a different slot on the bank that shuffles labels with options.
        // The options come off the session item, so pair them with the key
        // explicitly. With no options at all there is nothing to reposition
        // against, so the stored letter stands.
        correctOption: correctLabelOf({ correctOption: p.correctOption, options: rawOptions })
          || p.correctOption || null,
        correctAnswer: (p.answer && p.answer.value) || null,
        explanation: p.explanation || '',
        // Drives transfer-item selection: practice has to sit at the difficulty
        // they actually missed, not a generic middle.
        difficulty: Number(it.difficulty) || Number(p.difficulty) || null,
        // Fresh items on this skill, filled in by the caller (which has DB
        // access). Ids only — the text is resolved server-side at prompt time
        // so the answers never ride to the browser.
        transferIds: [],
        leverage: weights[category] || 5,
        status: 'pending',
      };
    })
    .filter((m) => m.problemId);

  return clusterBySkill(queue);
}

/**
 * Order the queue so misses on the SAME skill are worked back to back.
 *
 * Supersedes strict test order ("we go in order unless a student clicks on a
 * number", owner 2026-07-28). That rule was about the number rail, and the rail
 * still honors it — _numberRailHtml sorts its chips by position, so a student
 * sees #2, #4, #5… exactly as on their answer sheet. What changes is only which
 * miss the tutor picks up next.
 *
 * Why: six ratio misses scattered as #4, #9, #17, #23, #31, #38 get reviewed as
 * six unrelated accidents, and the student never sees that they have a ratio
 * problem — which is the single most useful thing the test told us. Worked
 * together they are one lesson with five confirmations, which is also how a
 * tutor with the answer sheet in front of them would actually run it.
 *
 * Groups are ordered by score opportunity — exam leverage x how many they
 * missed — so the biggest available gain comes first. Within a group the
 * original test order is kept.
 *
 * Entries with no position (queues built before positions were stamped) still
 * sort last within their group, so old data reviews fully.
 */
function clusterBySkill(queue) {
  const groups = new Map();
  queue.forEach((m, i) => {
    // Fall back to the category, then to the item itself: a miss with no skill
    // tag must not collapse into one giant "null" group with unrelated items.
    const key = m.skillId || m.category || `__${m.problemId || i}`;
    if (!groups.has(key)) groups.set(key, { key, items: [], leverage: m.leverage || 5, first: i });
    groups.get(key).items.push({ m, i });
  });

  const ordered = [...groups.values()].map((g) => {
    g.items.sort((a, b) => {
      const ap = a.m.position, bp = b.m.position;
      if (ap != null && bp != null) return ap - bp;
      if (ap != null) return -1;
      if (bp != null) return 1;
      return a.i - b.i;
    });
    g.score = g.leverage * g.items.length;
    // Earliest question in the group, for a stable tie-break.
    const positions = g.items.map((x) => x.m.position).filter((p) => p != null);
    g.firstPosition = positions.length ? Math.min(...positions) : Infinity;
    return g;
  }).sort((a, b) => (b.score - a.score) || (a.firstPosition - b.firstPosition) || (a.first - b.first));

  const out = [];
  ordered.forEach((g) => {
    g.items.forEach((x, idx) => {
      out.push({
        ...x.m,
        // Where this miss sits in its skill group — the prompt says "2 of 3
        // ratio questions you missed" so the student hears the pattern, and
        // the transfer check fires once at the end of the group rather than
        // after every miss (three misses on one skill would otherwise mean six
        // practice problems on that one skill).
        groupSize: g.items.length,
        groupIndex: idx + 1,
        groupLast: idx === g.items.length - 1,
      });
    });
  });
  return out;
}

/**
 * One transfer check per skill group, not per miss.
 *
 * pickTransferItems is chosen per entry (each miss knows its own difficulty),
 * but firing practice after every miss in a group means a student who missed
 * three percentage questions works six extra percentage problems. Keep the
 * practice on the LAST miss of each group — by then the skill has been retaught
 * and every instance seen, which is exactly when an independent attempt is
 * worth something.
 */
function keepGroupFinalTransfersOnly(queue) {
  return (queue || []).map((m) => (m && m.groupLast === false ? { ...m, transferIds: [] } : m));
}

/**
 * Pick the fresh items a student will attempt AFTER their miss is retaught.
 *
 * Reviewing the missed question teaches that question. Without attempting new
 * problems on the same skill, a student agrees with the explanation and then
 * misses the same skill on the re-test — understanding the worked example is
 * not the same as being able to do one. These are that check.
 *
 * Ordered easier-first: the first item should be winnable so the reteach lands,
 * the second sits at the difficulty they actually missed, which is the one that
 * proves the gap closed.
 *
 * @param {Array} candidates  Problem docs on the miss's skill, already excluding
 *                            everything this student has been served
 * @param {Object} miss       the queue entry (uses .difficulty)
 * @param {Number} n          how many to take
 * @returns {Array<String>} problemIds
 */
function pickTransferItems(candidates, miss, n = 2) {
  if (!Array.isArray(candidates) || !candidates.length) return [];
  const target = Number(miss && miss.difficulty) || 3;
  const scored = candidates
    .filter((c) => c && c.problemId)
    .map((c) => {
      const d = Number(c.difficulty) || 3;
      // Same difficulty is the goal; one step below is the next best thing
      // (a rung down still demands the same idea). Anything above the miss is
      // last — a harder problem cannot show that THIS gap closed.
      const delta = d - target;
      const rank = delta === 0 ? 0 : delta === -1 ? 1 : delta < 0 ? 2 : 3 + delta;
      return { problemId: c.problemId, difficulty: d, rank };
    })
    .sort((a, b) => a.rank - b.rank || a.difficulty - b.difficulty);
  return scored.slice(0, n)
    .sort((a, b) => a.difficulty - b.difficulty)     // easier first
    .map((c) => c.problemId);
}

/**
 * Strip everything answer-bearing from a bootcamp payload bound for the browser.
 *
 * The review card shows the missed question and the student's own pick but
 * deliberately does NOT reveal the key — the tutor has them re-try first. The
 * endpoints, though, were sending `session.bootcamp` verbatim, so correctOption
 * / correctAnswer / explanation rode along in the JSON for anyone who opened the
 * network tab. That was already at odds with the card's design; with transfer
 * items — problems the student has NOT attempted yet — it would hand over the
 * answers to work they are about to be asked to do.
 *
 * Transfer ids stay (a bare problemId reveals nothing; the text is fetched
 * server-side when the prompt is built).
 */
function clientSafeBootcamp(bc) {
  if (!bc) return bc;
  const safe = { ...(typeof bc.toObject === 'function' ? bc.toObject() : bc) };
  if (Array.isArray(safe.queue)) {
    safe.queue = safe.queue.map((q) => {
      if (!q) return q;
      const { correctOption, correctAnswer, explanation, ...rest } = q;
      return rest;
    });
  }
  return safe;
}

/**
 * The prompt section for the current miss — injected into the course system
 * prompt while bootcamp.phase === 'review'. Tells the tutor exactly how to coach
 * this one question and when to advance.
 *
 * @param {Array} [transfer]  fresh problems on the same skill (Problem docs),
 *                            resolved server-side from miss.transferIds
 */
function reviewPromptSection(miss, index, total, transfer = []) {
  if (!miss) return '';
  const cat = CATEGORY_LABEL[miss.category] || miss.category || 'ACT Math';
  // Letters shown to the tutor must be the letters the student SAW on their
  // form — the real ACT letters even questions F–G–H–J, and the runner
  // displays the same alias. Stored labels stay A–D underneath.
  const disp = (label) => actDisplayLabel(miss.position, label);
  const opts = (miss.options || []).map((o) => `${disp(o.label)}) ${o.text}`).join('   ');
  const chose = miss.skipped
    ? 'They SKIPPED it (no answer).'
    : `They chose ${disp(miss.theirAnswer)}${miss.theirAnswerText ? ` (${miss.theirAnswerText})` : ''} — INCORRECT.`;
  const correct = miss.correctOption
    ? `${disp(miss.correctOption)}${optionText(miss.options, miss.correctOption) ? ` (${optionText(miss.options, miss.correctOption)})` : ''}`
    : (miss.correctAnswer || '(see explanation)');

  return `

====================================================================
REVIEWING A MISSED QUESTION — ${miss.position != null ? `#${miss.position} from their test  ·  ` : ''}${index + 1} of ${total}  ·  ${cat}
====================================================================
The student is going over a question they got wrong on their practice ACT. Work
THIS one question with them, then advance. Do not move to a different topic.
${groupLine(miss)}

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
${transferBlock(transfer)}
${transfer && transfer.length
    ? '6. Emit the control tag <REVIEW_NEXT> on its own line to move to the next missed question — once the transfer check above is settled. NEVER emit it while they still owe you a practice attempt; never describe the tag.'
    : '5. When they can do it on their own, emit the control tag <REVIEW_NEXT> on its own line to move to the next missed question. NEVER emit it until they\'ve shown they\'ve got THIS one; never describe the tag.'}
====================================================================`;
}

/**
 * Name the pattern out loud when a miss is one of several on the same skill.
 *
 * This is the most useful thing the test result contains and the student cannot
 * see it themselves — the misses are scattered across their answer sheet. A
 * tutor holding that sheet would open with "you missed three ratio questions,
 * let's do them together", so say so.
 */
function groupLine(miss) {
  if (!miss || !miss.groupSize || miss.groupSize < 2) return '';
  const cat = CATEGORY_LABEL[miss.category] || miss.category || 'this topic';
  const first = miss.groupIndex === 1
    ? ` TELL THEM the pattern before you start this one — they cannot see it themselves, the questions were scattered across their test.`
    : '';
  const last = miss.groupLast
    ? ` This is the LAST of the group, so the transfer check below covers the whole set.`
    : '';
  return `
PATTERN: this is question ${miss.groupIndex} of ${miss.groupSize} they missed on the SAME skill (${cat}).${first}${last}
They are grouped deliberately — work them as one connected set, not as ${miss.groupSize} unrelated accidents.`;
}

/**
 * The transfer-practice step: 2 fresh problems on the skill they just missed.
 *
 * Gated on the tutor's own diagnosis rather than always fired. A careless slip
 * does not need two more problems — that turns a 20-miss review into a slog and
 * teaches the student that getting one wrong costs them a worksheet. A genuine
 * concept gap is exactly where re-explaining feels like understanding and isn't,
 * so that is where the student has to produce the work themselves.
 */
function transferBlock(transfer) {
  if (!Array.isArray(transfer) || !transfer.length) return '';
  const items = transfer.map((p, i) => {
    const opts = (p.options || []).map((o) => `${o.label}) ${o.text}`).join('   ');
    return `  PRACTICE ${i + 1}: ${p.prompt}
${opts ? `    OPTIONS: ${opts}\n` : ''}    ANSWER (yours, not theirs): ${p.answerValue || p.correctOption || '(see solution)'}${p.explanation ? `\n    SOLUTION: ${p.explanation}` : ''}`;
  }).join('\n\n');
  return `5. TRANSFER CHECK — only if step 2 found a real CONCEPT GAP (skip it for a
   careless slip or a pacing problem, and say so: "that was a slip, not a gap —
   moving on"). Understanding your explanation is not the same as being able to
   do one. Give them PRACTICE 1 and have them work it themselves. If they get
   it, give them PRACTICE 2. If they miss one, coach that attempt and stay here.
   Present ONE at a time, never both at once, and never paste the answer.

${items}
`;
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
 * Advance the review pointer to the next PENDING miss. Jump-aware: a student
 * who clicked ahead to #35 and finished it still owes #2 and #4, so advancing
 * scans forward from the current spot and wraps once — done only when nothing
 * in the queue is pending anymore. (Pre-jump behavior is unchanged: with no
 * jumps, the next pending item IS index+1.)
 */
function advanceReview(bootcamp) {
  const queue = (bootcamp && Array.isArray(bootcamp.queue)) ? bootcamp.queue : [];
  const total = queue.length;
  const from = ((bootcamp && bootcamp.index) || 0) + 1;
  for (let step = 0; step < total; step++) {
    const i = (from + step) % total;
    if (queue[i] && queue[i].status !== 'reviewed') {
      return { index: i, done: false, total };
    }
  }
  return { index: total, done: true, total };
}

/**
 * Point the review at a specific queue slot (the student clicked a number on
 * the rail). Pure bounds-check — the caller mutates and saves. Clicking an
 * already-reviewed number is allowed (revisiting a miss is legitimate); its
 * status flips back to pending so the queue doesn't instantly skip past it.
 */
function jumpToReview(bootcamp, target) {
  const queue = (bootcamp && Array.isArray(bootcamp.queue)) ? bootcamp.queue : [];
  // Number(null) and Number('') are 0 — reject anything that isn't an actual
  // integer (or its string form) before the bounds check.
  const i = (typeof target === 'number' || (typeof target === 'string' && target.trim() !== '')) ? Number(target) : NaN;
  if (!Number.isInteger(i) || i < 0 || i >= queue.length) return { ok: false, index: (bootcamp && bootcamp.index) || 0 };
  return { ok: true, index: i };
}

function currentMiss(bootcamp) {
  if (!bootcamp || !Array.isArray(bootcamp.queue)) return null;
  return bootcamp.queue[bootcamp.index || 0] || null;
}

module.exports = {
  buildReviewQueue,
  clusterBySkill,
  keepGroupFinalTransfersOnly,
  pickTransferItems,
  clientSafeBootcamp,
  reviewPromptSection,
  reassessPromptSection,
  advanceReview,
  jumpToReview,
  currentMiss,
  DEFAULT_CATEGORY_WEIGHTS,
};

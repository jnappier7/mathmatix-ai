/**
 * The ACT bootcamp "work" phase — the missed-items review queue + coaching prompt.
 * Pure logic, so it's covered without a DB or LLM.
 */

const { buildReviewQueue, reviewPromptSection, reassessPromptSection, advanceReview, jumpToReview, currentMiss } = require('../../utils/actReview');

const session = {
  items: [
    { position: 1, problemId: 'q1', skillId: 'act-linear-equations', category: 'algebra', content: 'Solve 2x+3=11', options: [{ label: 'A', text: '4' }, { label: 'B', text: '5' }] },
    { position: 2, problemId: 'q2', skillId: 'act-percentages', category: 'integrating-essential-skills', content: 'What is 20% of 50?', options: [{ label: 'A', text: '10' }, { label: 'B', text: '15' }] },
    { position: 3, problemId: 'q3', skillId: 'act-center-spread', category: 'statistics-probability', content: 'Mean of 2,4,6?', options: [{ label: 'A', text: '4' }, { label: 'B', text: '3' }] },
  ],
  responses: [
    { position: 1, problemId: 'q1', answer: 'B', correct: false },     // wrong (algebra, weight 8)
    { position: 2, problemId: 'q2', answer: 'A', correct: true },      // right → not in queue
    { position: 3, problemId: 'q3', skipped: true, correct: false },   // skipped (stats, weight 7)
  ],
};
const problemsById = {
  q1: { correctOption: 'A', answer: { value: '4' }, explanation: 'Subtract 3, divide by 2.' },
  q3: { correctOption: 'A', answer: { value: '4' }, explanation: 'Sum/count = 12/3 = 4.' },
};

describe('buildReviewQueue', () => {
  const queue = buildReviewQueue(session, problemsById);

  test('includes wrong AND skipped items, excludes correct ones', () => {
    expect(queue.map((m) => m.problemId).sort()).toEqual(['q1', 'q3']);
  });

  test('orders by question number — the student reviews in test order (owner, 2026-07-28)', () => {
    expect(queue[0].problemId).toBe('q1');
    expect(queue[1].problemId).toBe('q3');
    expect(queue.map((m) => m.position)).toEqual([1, 3]);
  });

  test('question numbers survive onto the queue for the on-screen rail', () => {
    expect(queue.every((m) => Number.isFinite(m.position))).toBe(true);
  });

  test('position-less entries (legacy queues) sink to the end by leverage, never dropped', () => {
    const legacy = {
      items: [
        { problemId: 'a', category: 'number-quantity', content: 'x', options: [] },     // weight 5
        { problemId: 'b', category: 'algebra', content: 'y', options: [] },             // weight 8
        { position: 40, problemId: 'c', category: 'geometry', content: 'z', options: [] },
      ],
      responses: [
        { problemId: 'a', answer: 'A', correct: false },
        { problemId: 'b', answer: 'A', correct: false },
        { position: 40, problemId: 'c', answer: 'A', correct: false },
      ],
    };
    const q = buildReviewQueue(legacy, {});
    expect(q.map((m) => m.problemId)).toEqual(['c', 'b', 'a']); // numbered first, then leverage
  });

  test('names the choice a label-less bank stores, instead of "undefined"', () => {
    // convertToMC items key the letter as `id`, so the old
    // `find(x => x.label === label)` lookup returned null and the tutor's
    // coaching prompt read "They chose B (undefined)".
    const s = {
      items: [{
        position: 1, problemId: 'z1', category: 'algebra', content: 'Solve 2x+3=11',
        options: [{ id: 'A', text: '4', isCorrect: true }, { id: 'B', text: '5', isCorrect: false }],
      }],
      responses: [{ position: 1, problemId: 'z1', answer: 'B', correct: false }],
    };
    const q = buildReviewQueue(s, { z1: { correctOption: 'A', answer: { value: '4' } } });
    expect(q[0].theirAnswerText).toBe('5');
    expect(q[0].correctOption).toBe('A');
    expect(q[0].options).toEqual([{ label: 'A', text: '4' }, { label: 'B', text: '5' }]);
  });

  test('resolves a shuffled stored letter to the slot the student saw', () => {
    const s = {
      items: [{
        position: 1, problemId: 'z2', category: 'algebra', content: 'Round 137 to the nearest 100',
        options: [{ label: 'C', text: '100' }, { label: 'A', text: '102' }],
      }],
      responses: [{ position: 1, problemId: 'z2', answer: 'B', correct: false }],
    };
    const q = buildReviewQueue(s, { z2: { correctOption: 'C', answer: { value: '100' } } });
    expect(q[0].correctOption).toBe('A');   // stored 'C' sits in slot A
  });

  test('carries what the tutor needs: their answer, correct answer, explanation', () => {
    const q1 = queue.find((m) => m.problemId === 'q1');
    expect(q1.theirAnswer).toBe('B');
    expect(q1.theirAnswerText).toBe('5');
    expect(q1.correctOption).toBe('A');
    expect(q1.explanation).toMatch(/Subtract 3/);
    const q3 = queue.find((m) => m.problemId === 'q3');
    expect(q3.skipped).toBe(true);
    expect(q3.theirAnswer).toBeNull();
  });
});

describe('reviewPromptSection', () => {
  const queue = buildReviewQueue(session, problemsById);
  test('names the question, their wrong choice, the correct answer, and the advance tag', () => {
    const s = reviewPromptSection(queue[0], 0, queue.length);
    expect(s).toMatch(/Solve 2x\+3=11/);
    // The key is presented as something to VERIFY, not as a fact about the
    // student: a recorded answer can differ from what they chose, and a key can
    // be wrong (owner evaluation, 2026-09-09).
    expect(s).toMatch(/RECORDED ANSWER: B \(5\) — marked wrong against the stored key/);
    expect(s).toMatch(/STORED KEY: A \(4\)/);
    expect(s).toMatch(/VERIFY THE KEY BEFORE YOU USE IT/);
    expect(s).toMatch(/<REVIEW_NEXT>/);
    expect(s).toMatch(/RETEACH the underlying concept ONLY if/);
    // 2026-09-15: "I have never seen that before" was answered with Σ x·P(x).
    expect(s).toMatch(/NEVER SEEN the concept, do not open with the formula/);
    expect(s).toMatch(/Build it from something they already know/);
  });
  test('handles a skipped item: no recorded answer, and the key is not offered as one', () => {
    const s = reviewPromptSection(queue[1], 1, queue.length);
    expect(s).toMatch(/SKIPPED/);
    // 2026-09-15: "You skipped it but the recorded answer was J (42)" — the
    // stored key, leaked as the student's answer before their first attempt.
    expect(s).toMatch(/NO answer was recorded for them/);
    expect(s).not.toMatch(/RECORDED ANSWER:/);
    expect(s).toMatch(/stored key is for YOUR reference only/);
    expect(s).toMatch(/or that they\s+skipped it/);
  });
  test('empty for no miss', () => {
    expect(reviewPromptSection(null, 0, 0)).toBe('');
  });
});

describe('reassessPromptSection (loop close)', () => {
  test('offers a fresh re-test via the launch tag once misses are worked', () => {
    const bc = { phase: 'reassess', queue: buildReviewQueue(session, problemsById) };
    const s = reassessPromptSection(bc);
    expect(s).toMatch(/TIME TO RE-TEST/);
    expect(s).toMatch(/FRESH.*all-new questions|nothing.*seen|all-new/i);
    expect(s).toMatch(/<LAUNCH_PRACTICE_ACT>/);
    expect(s).toMatch(/2 question/); // reviewed count
  });
});

describe('advanceReview / currentMiss', () => {
  // The advance contract mirrors routes/chat.js: the caller marks the current
  // miss 'reviewed' BEFORE advancing; advance finds the next pending item.
  test('advances until done', () => {
    const bc = { queue: buildReviewQueue(session, problemsById), index: 0 };
    expect(currentMiss(bc).problemId).toBe('q1');
    bc.queue[0].status = 'reviewed';
    let a = advanceReview(bc); expect(a).toMatchObject({ index: 1, done: false });
    bc.index = a.index;
    expect(currentMiss(bc).problemId).toBe('q3');
    bc.queue[1].status = 'reviewed';
    a = advanceReview(bc); expect(a).toMatchObject({ index: 2, done: true });
  });

  test('after a jump, advancing wraps back to the pending items that were skipped over', () => {
    const bc = { queue: buildReviewQueue(session, problemsById), index: 0 };
    // Student clicks ahead to the last miss and finishes it…
    const j = jumpToReview(bc, 1);
    expect(j.ok).toBe(true);
    bc.index = j.index;
    bc.queue[1].status = 'reviewed';
    // …advance must come back for q1, not declare the queue done.
    const a = advanceReview(bc);
    expect(a).toMatchObject({ index: 0, done: false });
    bc.index = a.index;
    bc.queue[0].status = 'reviewed';
    expect(advanceReview(bc).done).toBe(true);
  });

  test('jump rejects out-of-range and non-integer targets', () => {
    const bc = { queue: buildReviewQueue(session, problemsById), index: 0 };
    for (const bad of [-1, 2, 1.5, 'x', null, undefined]) {
      expect(jumpToReview(bc, bad).ok).toBe(false);
    }
  });

  test('the coaching prompt names the question number for the tutor', () => {
    const queue = buildReviewQueue(session, problemsById);
    expect(reviewPromptSection(queue[1], 1, queue.length)).toMatch(/#3 from their test/);
  });
});

// A visual item is answered FROM its figure, which the tutor never sees. The
// review prompt has to carry the figure's description, or a "read the slope
// off the graph" miss is unreviewable (seeds/act-visual, 2026-10-06).
describe('a missed question with a figure', () => {
  const alt = 'Coordinate grid from -6 to 6 on each axis, one unit per square. A line is graphed through the marked lattice points (-4, -3) and (4, 3).';
  const figSession = {
    items: [
      { position: 7, problemId: 'v1', skillId: 'act-linear-functions-models', category: 'functions', content: 'What is the slope of the line graphed below?', svg: '<svg></svg>', figureAlt: alt, options: [{ label: 'A', text: '3/4' }, { label: 'B', text: '4/3' }, { label: 'C', text: '-3/4' }, { label: 'D', text: '0' }] },
      { position: 8, problemId: 'v2', skillId: 'act-circles', category: 'geometry', content: 'In the figure below, what is x?', svg: '<svg></svg>', options: [{ label: 'A', text: '1' }, { label: 'B', text: '2' }, { label: 'C', text: '3' }, { label: 'D', text: '4' }] },
      { position: 9, problemId: 't1', skillId: 'act-percentages', category: 'integrating-essential-skills', content: 'What is 10% of 50?', options: [{ label: 'A', text: '5' }, { label: 'B', text: '10' }, { label: 'C', text: '50' }, { label: 'D', text: '500' }] },
    ],
    responses: [
      { position: 7, problemId: 'v1', answer: 'B', correct: false },
      { position: 8, problemId: 'v2', answer: 'A', correct: false },
      { position: 9, problemId: 't1', answer: 'B', correct: false },
    ],
  };
  const queue = buildReviewQueue(figSession, {
    v1: { correctOption: 'A', answer: { value: '3/4' } },
    v2: { correctOption: 'C', answer: { value: '3' }, figureAlt: 'Circle with radius 3.' },
    t1: { correctOption: 'A', answer: { value: '5' } },
  });
  const byId = Object.fromEntries(queue.map((m) => [m.problemId, m]));

  test('the queue carries the description, from the session item or else the bank', () => {
    expect(byId.v1.figureAlt).toBe(alt);
    expect(byId.v2.figureAlt).toBe('Circle with radius 3.');
    expect(byId.t1.figureAlt).toBeNull();
  });

  test('the tutor is told what the figure shows', () => {
    const s = reviewPromptSection(byId.v1, 0, queue.length);
    expect(s).toContain(`FIGURE (on the student's review card`);
    expect(s).toContain('(-4, -3) and (4, 3)');
  });

  test('a figure with no description is named, not ignored', () => {
    const s = reviewPromptSection({ ...byId.v2, figureAlt: null }, 1, queue.length);
    expect(s).toMatch(/FIGURE: this question has a figure .* ask them what it shows/);
  });

  test('a question with no figure gets no figure line', () => {
    expect(reviewPromptSection(byId.t1, 2, queue.length)).not.toContain('FIGURE');
  });
});

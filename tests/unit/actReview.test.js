/**
 * The ACT bootcamp "work" phase — the missed-items review queue + coaching prompt.
 * Pure logic, so it's covered without a DB or LLM.
 */

const { buildReviewQueue, reviewPromptSection, advanceReview, currentMiss } = require('../../utils/actReview');

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

  test('ranks by category leverage (algebra 8 before statistics 7)', () => {
    expect(queue[0].problemId).toBe('q1');
    expect(queue[1].problemId).toBe('q3');
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
    expect(s).toMatch(/chose B \(5\).*INCORRECT/s);
    expect(s).toMatch(/CORRECT ANSWER: A \(4\)/);
    expect(s).toMatch(/<REVIEW_NEXT>/);
    expect(s).toMatch(/RETEACH the underlying concept ONLY if/);
  });
  test('handles a skipped item', () => {
    const s = reviewPromptSection(queue[1], 1, queue.length);
    expect(s).toMatch(/SKIPPED/);
  });
  test('empty for no miss', () => {
    expect(reviewPromptSection(null, 0, 0)).toBe('');
  });
});

describe('advanceReview / currentMiss', () => {
  test('advances until done', () => {
    const bc = { queue: buildReviewQueue(session, problemsById), index: 0 };
    expect(currentMiss(bc).problemId).toBe('q1');
    let a = advanceReview(bc); expect(a).toMatchObject({ index: 1, done: false });
    bc.index = a.index;
    expect(currentMiss(bc).problemId).toBe('q3');
    a = advanceReview(bc); expect(a).toMatchObject({ index: 2, done: true });
  });
});

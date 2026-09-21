/**
 * ONE ordering, one payload shape, and a door the student can open.
 *
 * The review flow ran three structures at once (owner, 2026-09-21: "almost
 * seems like 3 different structures competing"):
 *
 *   1. the number rail, re-sorted by TEST position, labelled "just keep going
 *      in order" — the one order review does not use;
 *   2. the queue itself, clustered by skill and ordered by leverage, which is
 *      what bootcamp.index actually walks;
 *   3. the chat stream, where the question text lived and where only the model
 *      could advance anything.
 *
 * So "up next: #30" sat over a list that started at #2, the highlighted chip
 * landed mid-rail with un-worked numbers to its left, and the question card
 * vanished the moment the student sent a message — because chat turns repainted
 * the panel from a thinner payload with no `prompt` on it.
 */

const fs = require('fs');
const path = require('path');
const {
  buildReviewQueue,
  reviewGroups,
  markReviewedAndAdvance,
  clientSafeBootcamp,
  advanceReview,
} = require('../../utils/actReview');

const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

/** 3 ratio misses, 2 percentage, 1 algebra — scattered across the answer sheet. */
const SCATTER = [
  [4, 'act-ratios-proportions', 'integrating-essential-skills'],
  [9, 'act-percentages', 'integrating-essential-skills'],
  [12, 'act-linear-equations', 'algebra'],
  [17, 'act-ratios-proportions', 'integrating-essential-skills'],
  [31, 'act-percentages', 'integrating-essential-skills'],
  [38, 'act-ratios-proportions', 'integrating-essential-skills'],
];
const session = {
  items: SCATTER.map(([position, skillId, category]) => ({
    position, problemId: `p${position}`, skillId, category,
    content: `Question ${position} text`,
    options: [{ label: 'A', text: 'one' }, { label: 'B', text: 'two' }],
  })),
  responses: SCATTER.map(([position]) => ({
    position, problemId: `p${position}`, answer: 'A', correct: false,
  })),
};
const problems = {};
SCATTER.forEach(([position]) => {
  problems[`p${position}`] = { correctOption: 'B', answer: { value: 'two' }, explanation: 'because' };
});

const queue = buildReviewQueue(session, problems);
const bc = { phase: 'review', round: 1, index: 0, queue };

describe('the queue carries its own grouping', () => {
  test('every entry knows its group and a student-readable name', () => {
    queue.forEach((m) => {
      expect(m.groupKey).toBeTruthy();
      expect(typeof m.groupLabel).toBe('string');
      expect(m.groupLabel.length).toBeGreaterThan(0);
    });
  });

  test('the fine skill names the group, not the broad category', () => {
    // 19 of the blueprint's 45 slots are "Essential Skills", so the category is
    // not a name a student can act on.
    const ratio = queue.find((m) => m.skillId === 'act-ratios-proportions');
    expect(ratio.groupLabel).toMatch(/ratio/i);
    expect(ratio.groupLabel).not.toMatch(/essential skills/i);
  });
});

describe('reviewGroups is the single ordering', () => {
  const groups = reviewGroups(bc);

  test('groups come back in QUEUE order, not test order', () => {
    // Ratios (3 misses) outranks percentages (2) outranks algebra (1).
    expect(groups.map((g) => g.total)).toEqual([3, 2, 1]);
    expect(groups[0].label).toMatch(/ratio/i);
  });

  test('flattening the groups reproduces the queue exactly', () => {
    const flat = groups.flatMap((g) => g.items.map((i) => i.queueIndex));
    expect(flat).toEqual(queue.map((_, i) => i));
  });

  test('queueIndex points at the real queue entry, so a tap cannot desync', () => {
    groups.forEach((g) => g.items.forEach((it) => {
      expect(queue[it.queueIndex].position).toBe(it.position);
    }));
  });

  test('exactly one item is current, and it is bootcamp.index', () => {
    const current = groups.flatMap((g) => g.items).filter((i) => i.current);
    expect(current).toHaveLength(1);
    expect(current[0].queueIndex).toBe(0);
  });

  test('the first group is the one being worked — no un-worked items above it', () => {
    // The old rail put #4 first by position while the queue was on #30.
    expect(groups[0].items.some((i) => i.current)).toBe(true);
  });

  test('within a group the numbers read in test order', () => {
    const ratios = groups[0].items.map((i) => i.position);
    expect(ratios).toEqual([...ratios].sort((a, b) => a - b));
    expect(ratios).toEqual([4, 17, 38]);
  });

  test('per-group progress is reported for the heading', () => {
    const g = reviewGroups({ ...bc, queue: queue.map((m, i) => (i === 0 ? { ...m, status: 'reviewed' } : m)) })[0];
    expect(g.reviewed).toBe(1);
    expect(g.total).toBe(3);
    expect(g.allDone).toBe(false);
  });

  test('an empty or absent queue yields no groups rather than throwing', () => {
    expect(reviewGroups(null)).toEqual([]);
    expect(reviewGroups({ queue: [] })).toEqual([]);
  });

  test('a legacy queue with no groupKey still groups, by skill then category', () => {
    const legacy = queue.map(({ groupKey, groupLabel, ...rest }) => rest);
    const g = reviewGroups({ index: 0, queue: legacy });
    expect(g.length).toBe(3);
    expect(g[0].label).toBeTruthy();
  });
});

describe('the student can advance, not only the model', () => {
  const fresh = () => ({ phase: 'review', index: 0, queue: queue.map((m) => ({ ...m })) });

  test('it marks the current miss reviewed and moves on', () => {
    const b = fresh();
    const r = markReviewedAndAdvance(b);
    expect(r.ok).toBe(true);
    expect(b.queue[0].status).toBe('reviewed');
    expect(r.index).toBe(1);
    expect(r.done).toBe(false);
  });

  test('it moves the pointer itself — a second call cannot re-mark the same miss', () => {
    const b = fresh();
    markReviewedAndAdvance(b);
    expect(b.index).toBe(1);
    markReviewedAndAdvance(b);
    expect(b.index).toBe(2);
    expect(b.queue.filter((q) => q.status === 'reviewed')).toHaveLength(2);
  });

  test('it performs the SAME transition <REVIEW_NEXT> does', () => {
    const viaTag = fresh();
    viaTag.queue[viaTag.index].status = 'reviewed';
    const tagResult = advanceReview(viaTag);
    const viaStudent = fresh();
    const studentResult = markReviewedAndAdvance(viaStudent);
    expect(studentResult.index).toBe(tagResult.index);
    expect(studentResult.done).toBe(tagResult.done);
    expect(viaStudent.queue.map((q) => q.status)).toEqual(viaTag.queue.map((q) => q.status));
  });

  test('working the last miss reports done, so the caller can flip to reassess', () => {
    const b = fresh();
    let r;
    for (let i = 0; i < queue.length; i++) r = markReviewedAndAdvance(b);
    expect(r.done).toBe(true);
    expect(b.queue.every((q) => q.status === 'reviewed')).toBe(true);
  });

  test('an empty queue is refused rather than advancing into nothing', () => {
    expect(markReviewedAndAdvance({ index: 0, queue: [] }).ok).toBe(false);
  });
});

describe('one payload shape — the question survives a chat turn', () => {
  const chat = read('routes/chat.js');

  test('chat turns send clientSafeBootcamp, the same shape the page load sends', () => {
    expect(chat).toMatch(/compactBootcamp\s*=\s*\(bc\)\s*=>\s*\(bc && bc\.phase \? clientSafeBootcamp\(bc\) : null\)/);
  });

  test('the thin {position,status,category} projection is gone', () => {
    // It is what made _missPreviewHtml bail: no `prompt` on the entry.
    expect(chat).not.toMatch(/queue:\s*\(bc\.queue \|\| \[\]\)\.map\(\(q\) => \(\{ position:/);
  });

  test('the shape carries what the card needs to render', () => {
    const safe = clientSafeBootcamp(bc);
    const first = safe.queue[0];
    expect(first.prompt).toBeTruthy();
    expect(first.options.length).toBeGreaterThan(0);
    expect(first).toHaveProperty('theirAnswer');
    expect(first).toHaveProperty('position');
    expect(first).toHaveProperty('groupLabel');
  });

  test('and STILL withholds the answer key', () => {
    clientSafeBootcamp(bc).queue.forEach((q) => {
      expect(q).not.toHaveProperty('correctOption');
      expect(q).not.toHaveProperty('correctAnswer');
      expect(q).not.toHaveProperty('explanation');
    });
  });
});

describe('the rail renders the queue, and says so', () => {
  const tracker = read('public/js/lessonTracker.js');

  test('the rendered label no longer promises test order', () => {
    // The old copy, verbatim. Review runs in skill-cluster order, so telling
    // the student to "keep going in order" beside a position-sorted list named
    // the one order the queue does not use.
    expect(tracker).not.toMatch(/Questions you missed — tap one to jump/);
    expect(tracker).toMatch(/What you missed, grouped by skill/);
  });

  test('it groups by skill instead of re-sorting by position', () => {
    expect(tracker).toMatch(/_reviewGroups/);
    expect(tracker).toMatch(/grouped by skill/i);
  });

  test('the student has an advance control wired to the server', () => {
    expect(tracker).toMatch(/lt-bc-next/);
    expect(tracker).toMatch(/bootcamp\/advance/);
  });

  test('and a way out to the re-test without grinding every miss', () => {
    expect(tracker).toMatch(/lt-bc-done/);
  });

  test('a miss with no question text is admitted on the card, not left blank', () => {
    expect(tracker).toMatch(/couldn't load this question's text/i);
  });
});

describe('the handoff stops promising a fourth order', () => {
  const runner = read('public/js/act-test.js');

  test('"starting with the weakest" is gone — the queue decides', () => {
    expect(runner).not.toMatch(/starting with the weakest/);
  });

  test('the results screen lists what was missed', () => {
    expect(runner).toMatch(/_missedListHtml/);
    expect(runner).toMatch(/What you missed/);
  });
});

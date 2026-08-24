/**
 * Skill-clustered review order.
 *
 * Review used to march through misses in strict test order ("we go in order
 * unless a student clicks on a number", owner 2026-07-28). Six ratio misses
 * scattered as #4, #9, #17, #23, #31, #38 were then reviewed as six unrelated
 * accidents, and the student never learned the one thing the test actually told
 * us: they have a ratio problem. Worked together they are one lesson with five
 * confirmations.
 *
 * The rule that motivated test order is preserved where it lives — the number
 * rail still reads like the student's answer sheet (#2, #4, #5…). Only the
 * order the tutor picks misses up in changed.
 */
const fs = require('fs');
const path = require('path');
const {
  buildReviewQueue,
  clusterBySkill,
  keepGroupFinalTransfersOnly,
  reviewPromptSection,
} = require('../../utils/actReview');

const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

/** A scattered miss set: 3 ratio, 2 percentage, 1 geometry, 1 algebra. */
const SCATTER = [
  [4, 'act-ratios-proportions', 'integrating-essential-skills', 19],
  [9, 'act-percentages', 'integrating-essential-skills', 19],
  [12, 'act-linear-equations', 'algebra', 6],
  [17, 'act-ratios-proportions', 'integrating-essential-skills', 19],
  [23, 'act-basic-geometry-measures', 'integrating-essential-skills', 19],
  [31, 'act-percentages', 'integrating-essential-skills', 19],
  [38, 'act-ratios-proportions', 'integrating-essential-skills', 19],
];
const entries = SCATTER.map(([position, skillId, category, leverage]) => ({
  position, skillId, category, leverage, problemId: `p${position}`, difficulty: 3,
}));

describe('misses on one skill are worked together', () => {
  const out = clusterBySkill(entries);

  test('every skill occupies one contiguous run', () => {
    const seen = new Set();
    let prev = null;
    out.forEach((m) => {
      if (m.skillId !== prev) {
        // Re-entering a skill later would mean the group was split.
        expect(seen.has(m.skillId)).toBe(false);
        seen.add(m.skillId);
        prev = m.skillId;
      }
    });
  });

  test('the biggest score opportunity comes first', () => {
    // leverage x count: ratios 19x3 beats percentages 19x2 beats the singles,
    // and an algebra single (6) sorts below an IES single (19).
    expect(out.map((m) => m.skillId)).toEqual([
      'act-ratios-proportions', 'act-ratios-proportions', 'act-ratios-proportions',
      'act-percentages', 'act-percentages',
      'act-basic-geometry-measures',
      'act-linear-equations',
    ]);
  });

  test('within a group the original test order is kept', () => {
    const ratios = out.filter((m) => m.skillId === 'act-ratios-proportions');
    expect(ratios.map((m) => m.position)).toEqual([4, 17, 38]);
  });

  test('no miss is dropped or duplicated', () => {
    expect(out).toHaveLength(entries.length);
    expect(out.map((m) => m.position).sort((a, b) => a - b))
      .toEqual(entries.map((m) => m.position).sort((a, b) => a - b));
  });

  test('each entry knows where it sits in its group', () => {
    const ratios = out.filter((m) => m.skillId === 'act-ratios-proportions');
    expect(ratios.map((m) => m.groupIndex)).toEqual([1, 2, 3]);
    ratios.forEach((m) => expect(m.groupSize).toBe(3));
    expect(ratios.map((m) => m.groupLast)).toEqual([false, false, true]);
  });

  test('untagged misses do not collapse into one bogus group', () => {
    // A miss with no skillId used to be groupable with every other untagged
    // miss, which would invent a "pattern" across unrelated questions.
    const untagged = [
      { position: 1, problemId: 'a', skillId: null, category: null, leverage: 5 },
      { position: 2, problemId: 'b', skillId: null, category: null, leverage: 5 },
    ];
    clusterBySkill(untagged).forEach((m) => expect(m.groupSize).toBe(1));
  });

  test('positionless legacy entries still review, sorting last in their group', () => {
    const mixed = [
      { position: null, problemId: 'x', skillId: 's', category: 'c', leverage: 5 },
      { position: 3, problemId: 'y', skillId: 's', category: 'c', leverage: 5 },
    ];
    expect(clusterBySkill(mixed).map((m) => m.problemId)).toEqual(['y', 'x']);
  });

  test('buildReviewQueue emits the clustered order end to end', () => {
    const session = {
      items: entries.map((e) => ({ ...e, options: [{ label: 'A', text: '1' }, { label: 'B', text: '2' }] })),
      responses: entries.map((e) => ({ position: e.position, problemId: e.problemId, answer: 'A', correct: false })),
    };
    const problems = {};
    entries.forEach((e) => { problems[e.problemId] = { problemId: e.problemId, correctOption: 'B', answer: { value: '2' }, explanation: 'x' }; });
    const q = buildReviewQueue(session, problems);
    expect(q.map((m) => m.position)).toEqual([4, 17, 38, 9, 31, 23, 12]);
  });
});

describe('practice fires once per skill, not once per miss', () => {
  test('only the last miss of a group keeps its transfer items', () => {
    // Three ratio misses each carrying 2 practice problems would be six
    // problems on one skill — a worksheet, not a check.
    const withIds = clusterBySkill(entries).map((m) => ({ ...m, transferIds: ['t1', 't2'] }));
    const after = keepGroupFinalTransfersOnly(withIds);
    const firing = after.filter((m) => m.transferIds.length).map((m) => m.position);
    expect(firing).toEqual([38, 31, 23, 12]);
    expect(after.filter((m) => !m.transferIds.length).map((m) => m.position)).toEqual([4, 17, 9]);
  });

  test('a single-miss skill still gets its practice', () => {
    const one = clusterBySkill([entries[2]]).map((m) => ({ ...m, transferIds: ['t1'] }));
    expect(keepGroupFinalTransfersOnly(one)[0].transferIds).toEqual(['t1']);
  });

  test('entries with no group flag are left alone', () => {
    // Queues built before clustering have no groupLast; they must keep working.
    const legacy = [{ position: 1, transferIds: ['t1', 't2'] }];
    expect(keepGroupFinalTransfersOnly(legacy)[0].transferIds).toEqual(['t1', 't2']);
  });

  test('the route applies the group rule after selection', () => {
    const src = read('routes/actTest.js');
    expect(src).toMatch(/keepGroupFinalTransfersOnly\(queue\)/);
  });
});

describe('the student is told the pattern', () => {
  const base = {
    position: 17, category: 'integrating-essential-skills', prompt: 'Q',
    options: [{ label: 'A', text: '1' }], theirAnswer: 'A', correctOption: 'A',
    explanation: 'e', difficulty: 3,
  };

  test('a grouped miss announces which of how many it is', () => {
    const s = reviewPromptSection({ ...base, groupSize: 3, groupIndex: 2, groupLast: false }, 1, 7);
    expect(s).toMatch(/PATTERN: this is question 2 of 3 they missed on the SAME skill/);
    expect(s).toMatch(/not as 3 unrelated accidents/);
  });

  test('the first of a group is told to surface the pattern out loud', () => {
    // The student cannot see this themselves — the misses were scattered.
    const s = reviewPromptSection({ ...base, groupSize: 3, groupIndex: 1, groupLast: false }, 0, 7);
    expect(s).toMatch(/TELL THEM the pattern before you start this one/);
  });

  test('the last of a group notes the practice covers the whole set', () => {
    const s = reviewPromptSection({ ...base, groupSize: 3, groupIndex: 3, groupLast: true }, 2, 7);
    expect(s).toMatch(/LAST of the group/);
  });

  test('a lone miss says nothing about patterns', () => {
    const s = reviewPromptSection({ ...base, groupSize: 1, groupIndex: 1, groupLast: true }, 0, 7);
    expect(s).not.toContain('PATTERN:');
  });

  test('a legacy entry with no group data renders unchanged', () => {
    expect(reviewPromptSection(base, 0, 4)).not.toContain('PATTERN:');
  });
});

describe('the number rail still reads like their answer sheet', () => {
  const src = read('public/js/lessonTracker.js');

  test('chips are sorted by position for display', () => {
    // Owner rule, 2026-07-28: the rail marches through the numbers the way the
    // student saw them. Review order is now different, so the rail sorts.
    expect(src).toMatch(/const inTestOrder = queue/);
    expect(src).toMatch(/inTestOrder\.map\(\(\{ q, i \}\) => chip\(q, i\)\)/);
  });

  test('the jump target is the QUEUE index, not the display index', () => {
    // Sorting for display while jumping by display position would send the
    // student to a different question than the one they tapped.
    expect(src).toMatch(/data-bc-jump="\$\{i\}"/);
    expect(src).toMatch(/\.map\(\(q, i\) => \(\{ q, i \}\)\)/);
  });
});

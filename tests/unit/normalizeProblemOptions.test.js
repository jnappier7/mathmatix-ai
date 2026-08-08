/**
 * The stored-MC-options migration (2026-08-07).
 *
 * `utils/mcOptions.js` reconciles four stored option shapes at read time; this
 * migration writes that reconciliation down. The contract that matters is not
 * "the docs look tidier" — it is that NO ITEM GRADES DIFFERENTLY afterwards.
 *
 * So the central test here does not assert on field shapes at all: it runs every
 * possible pick through compareAnswer against the doc BEFORE and AFTER the
 * planned migration, and fails if any verdict moves. Shape assertions follow,
 * but that invariant is the one protecting students.
 */

const { planOptionMigration, isCanonical } = require('../../scripts/normalizeProblemOptions');
const { compareAnswer } = require('../../utils/answerComparison');

/** Apply a plan to a doc, the way the script's updateOne does. */
const applied = (doc) => ({ ...doc, ...planOptionMigration(doc).set });

/** The spec problem.checkAnswer() builds — the engine never sees a raw doc. */
const specOf = (doc) => ({
  value: doc.answer && doc.answer.value,
  equivalents: (doc.answer && doc.answer.equivalents) || [],
  answerType: doc.answerType,
  options: doc.options,
  correctOption: doc.correctOption,
});

/**
 * Every verdict compareAnswer can produce for this item — one per label the
 * student could click, plus one per option text they could type.
 */
function verdicts(doc) {
  const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
  const picks = labels.slice(0, (doc.options || []).length)
    .concat((doc.options || []).map((o) => (o && typeof o === 'object' ? o.text : o)));
  const spec = specOf(doc);
  return picks.map((p) => `${p}=${compareAnswer(p, spec)}`).join(' ');
}

// ── the four stored shapes, verbatim from the generators that wrote them ──
const SHAPES = {
  'seeds/*.generated.json — { label, text }': {
    problemId: 'p1', answerType: 'multiple-choice',
    answer: { value: '35', equivalents: [] },
    options: [{ label: 'A', text: '30' }, { label: 'B', text: '35' },
      { label: 'C', text: '40' }, { label: 'D', text: '45' }],
    correctOption: 'B',
  },
  'convertToMC — { id, text, isCorrect }, no correctOption': {
    problemId: 'p2', answerType: 'multiple-choice',
    answer: { value: '100', equivalents: [] },
    options: [{ id: 'A', text: '102', isCorrect: false }, { id: 'B', text: '101', isCorrect: false },
      { id: 'C', text: '100', isCorrect: true }, { id: 'D', text: '99', isCorrect: false }],
  },
  'generateProblems — { letter, text, isCorrect }, answer holds the LETTER': {
    problemId: 'p3', answerType: 'multiple-choice',
    answer: { value: 'B', equivalents: ['B', '700'] },
    options: [{ letter: 'A', text: '701', isCorrect: false },
      { letter: 'B', text: '700', isCorrect: true }],
  },
  'pattern-problems — labels shuffled out of position': {
    problemId: 'p4', answerType: 'multiple-choice',
    answer: { value: '100', equivalents: [] },
    options: [{ label: 'C', text: '100' }, { label: 'A', text: '102' }, { label: 'B', text: '99' }],
    correctOption: 'C',
  },
  'templatesGrade67 — plain strings': {
    problemId: 'p5', answerType: 'multiple-choice',
    answer: { value: 'Higher', equivalents: [] },
    options: ['Higher', 'Lower', 'Exactly equal'],
    correctOption: 'A',
  },
};

describe('the grading invariant — no item may grade differently after migrating', () => {
  for (const [name, doc] of Object.entries(SHAPES)) {
    test(name, () => {
      expect(verdicts(applied(doc))).toBe(verdicts(doc));
    });
  }

  test('and at least one verdict is actually TRUE, so the check has teeth', () => {
    // A migration that broke every item would otherwise pass the invariant by
    // returning all-false on both sides.
    for (const [name, doc] of Object.entries(SHAPES)) {
      expect(`${name}: ${verdicts(doc)}`).toMatch(/=true/);
    }
  });
});

describe('planOptionMigration', () => {
  test('rewrites a shuffled stored letter to the slot the student saw', () => {
    const plan = planOptionMigration(SHAPES['pattern-problems — labels shuffled out of position']);
    expect(plan.changed).toBe(true);
    expect(plan.set.options).toEqual([
      { label: 'A', text: '100' }, { label: 'B', text: '102' }, { label: 'C', text: '99' },
    ]);
    expect(plan.set.correctOption).toBe('A');   // stored 'C' sat in slot A
  });

  test('drops isCorrect — the answer key stops living on the option', () => {
    const plan = planOptionMigration(SHAPES['convertToMC — { id, text, isCorrect }, no correctOption']);
    plan.set.options.forEach((o) => {
      expect(Object.keys(o).sort()).toEqual(['label', 'text']);
    });
  });

  test('adopts isCorrect as correctOption only when answer corroborates it', () => {
    const plan = planOptionMigration(SHAPES['convertToMC — { id, text, isCorrect }, no correctOption']);
    expect(plan.set.correctOption).toBe('C');   // slot C holds '100', and answer.value is '100'
    expect(plan.notes.join()).toMatch(/corroborated/);
  });

  test('refuses to adopt isCorrect when the answer key disagrees', () => {
    // A stale isCorrect flag must never become the authoritative key — that
    // would bake a wrong answer into the bank permanently.
    const doc = {
      problemId: 'bad', answerType: 'multiple-choice',
      answer: { value: '100', equivalents: [] },
      options: [{ id: 'A', text: '102', isCorrect: true }, { id: 'B', text: '100', isCorrect: false }],
    };
    const plan = planOptionMigration(doc);
    expect(plan.set.correctOption).toBeUndefined();
    expect(plan.notes.join()).toMatch(/left unset/);
    expect(verdicts(applied(doc))).toBe(verdicts(doc));
  });

  test('promotes plain strings without losing them', () => {
    // Mongoose casts a string option array to [] against the {label,text}
    // subdoc schema — which is why the script writes through the native driver.
    const plan = planOptionMigration(SHAPES['templatesGrade67 — plain strings']);
    expect(plan.set.options).toEqual([
      { label: 'A', text: 'Higher' }, { label: 'B', text: 'Lower' }, { label: 'C', text: 'Exactly equal' },
    ]);
  });

  test('is idempotent — a canonical doc plans no write', () => {
    const canonical = applied(SHAPES['convertToMC — { id, text, isCorrect }, no correctOption']);
    expect(planOptionMigration(canonical).changed).toBe(false);
    // and every shape converges after one pass
    for (const doc of Object.values(SHAPES)) {
      expect(planOptionMigration(applied(doc)).changed).toBe(false);
    }
  });

  test('leaves an item with no options alone', () => {
    expect(planOptionMigration({ problemId: 'x', options: [] }).changed).toBe(false);
    expect(planOptionMigration({ problemId: 'x' }).changed).toBe(false);
  });

  test('treats options: null as no options, not as an options-carrying item', () => {
    // 774 free-response problems in the bank carry a stray `options: null`.
    // They are ordinary text-input items — every client checks Array.isArray,
    // which null fails — and the planner must not touch them.
    //
    // This case is why the scan query is `"options.0": { $exists: true }` and
    // not `{ $exists: true, $ne: [] }`: null EXISTS and null !== [], so the old
    // idiom pulled all 774 in, and the answerType tally then reported them as
    // items carrying options that were not declared multiple-choice. They carry
    // no options at all. That miscount was read as a live grading bug.
    const plan = planOptionMigration({
      problemId: 'n1', answerType: 'constructed-response',
      answer: { value: '42', equivalents: [] }, options: null,
    });
    expect(plan.changed).toBe(false);
    expect(plan.set).toEqual({});
  });

  test('keeps a correctOption that names no option, rather than inventing a slot', () => {
    const doc = {
      problemId: 'y', answerType: 'multiple-choice',
      answer: { value: '1', equivalents: [] },
      options: [{ label: 'A', text: '1' }, { label: 'B', text: '2' }],
      correctOption: 'D',
    };
    const plan = planOptionMigration(doc);
    expect(plan.notes.join()).toMatch(/unplaceable/);
    expect(verdicts(applied(doc))).toBe(verdicts(doc));
  });
});

describe('isCanonical', () => {
  test('true only for positional { label, text }', () => {
    expect(isCanonical([{ label: 'A', text: '1' }, { label: 'B', text: '2' }])).toBe(true);
    expect(isCanonical([{ label: 'B', text: '1' }])).toBe(false);        // not positional
    expect(isCanonical([{ id: 'A', text: '1' }])).toBe(false);           // wrong key
    expect(isCanonical([{ label: 'A', text: '1', isCorrect: true }])).toBe(false);
    expect(isCanonical(['1'])).toBe(false);
  });

  test('tolerates the _id Mongoose stamps on subdocuments', () => {
    expect(isCanonical([{ label: 'A', text: '1', _id: 'abc' }])).toBe(true);
  });
});

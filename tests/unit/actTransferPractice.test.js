/**
 * Transfer practice — the step that turns "I understand your explanation" into
 * "I can do one."
 *
 * The bootcamp's review phase walked a student through each missed question and
 * then advanced. That teaches THAT question: a student agrees with the worked
 * solution, feels the gap close, and misses the same skill on the re-test.
 * Re-explaining is the part that feels like learning and isn't. So after a miss
 * is retaught, the student now has to produce the work themselves on 2 FRESH
 * problems from the same skill before review moves on.
 *
 * Two properties matter enough to pin:
 *   1. The practice must be gated on the tutor's diagnosis. Firing it after
 *      every miss turns a 20-miss review into a worksheet and teaches a student
 *      that one careless slip costs them ten minutes.
 *   2. The answers must never reach the browser. These are problems the student
 *      has not attempted yet, and the whole bootcamp payload was previously
 *      being handed to the client verbatim.
 */
const fs = require('fs');
const path = require('path');
const {
  pickTransferItems,
  clientSafeBootcamp,
  reviewPromptSection,
  buildReviewQueue,
} = require('../../utils/actReview');

const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

const MISS = {
  position: 12,
  problemId: 'act-p-12',
  skillId: 'act-percentages',
  category: 'integrating-essential-skills',
  prompt: 'A shirt costs $40 after a 20% discount. What was the original price?',
  options: [{ label: 'A', text: '$48' }, { label: 'B', text: '$50' }],
  theirAnswer: 'A',
  theirAnswerText: '$48',
  correctOption: 'B',
  correctAnswer: '$50',
  explanation: 'Divide by 0.80, do not add 20% back.',
  difficulty: 3,
};

const TRANSFER = [
  {
    prompt: 'A jacket costs $60 after a 25% discount. What was the original price?',
    options: [{ label: 'A', text: '$75' }, { label: 'B', text: '$80' }],
    answerValue: '$80',
    correctOption: 'B',
    explanation: 'Divide by 0.75.',
  },
  {
    prompt: 'A bike costs $180 after a 10% discount. What was the original price?',
    options: [{ label: 'A', text: '$198' }, { label: 'B', text: '$200' }],
    answerValue: '$200',
    correctOption: 'B',
    explanation: 'Divide by 0.90.',
  },
];

describe('picking the practice items', () => {
  const pool = [
    { problemId: 'p-d1', difficulty: 1 },
    { problemId: 'p-d2', difficulty: 2 },
    { problemId: 'p-d3a', difficulty: 3 },
    { problemId: 'p-d3b', difficulty: 3 },
    { problemId: 'p-d5', difficulty: 5 },
  ];

  test('practice sits at the difficulty they actually missed', () => {
    // A harder problem cannot show that THIS gap closed, and an easy one only
    // shows they can still do easy ones.
    expect(pickTransferItems(pool, MISS, 2).sort()).toEqual(['p-d3a', 'p-d3b']);
  });

  test('falls back to one rung below before reaching above the miss', () => {
    const thin = [{ problemId: 'easier', difficulty: 2 }, { problemId: 'harder', difficulty: 5 }];
    expect(pickTransferItems(thin, MISS, 1)).toEqual(['easier']);
  });

  test('returns them easier-first so the first attempt is winnable', () => {
    const mixed = [{ problemId: 'hard', difficulty: 3 }, { problemId: 'soft', difficulty: 2 }];
    expect(pickTransferItems(mixed, MISS, 2)).toEqual(['soft', 'hard']);
  });

  test('an empty or exhausted pool yields no practice, not a crash', () => {
    expect(pickTransferItems([], MISS, 2)).toEqual([]);
    expect(pickTransferItems(null, MISS, 2)).toEqual([]);
    expect(pickTransferItems(pool, MISS, 0)).toEqual([]);
  });

  test('a miss with no recorded difficulty still gets practice', () => {
    expect(pickTransferItems(pool, { ...MISS, difficulty: null }, 2).length).toBe(2);
  });
});

describe('the practice answers never reach the browser', () => {
  const bootcamp = {
    phase: 'review',
    round: 2,
    index: 0,
    queue: [{ ...MISS, transferIds: ['fresh-1', 'fresh-2'], status: 'pending' }],
  };

  test('the key, the worked solution, and nothing else are stripped', () => {
    const safe = clientSafeBootcamp(bootcamp);
    const q = safe.queue[0];
    expect(q.correctOption).toBeUndefined();
    expect(q.correctAnswer).toBeUndefined();
    expect(q.explanation).toBeUndefined();
    // The card still needs these to render the missed question and their pick.
    expect(q.prompt).toBe(MISS.prompt);
    expect(q.options).toEqual(MISS.options);
    expect(q.theirAnswer).toBe('A');
    expect(q.position).toBe(12);
    expect(q.status).toBe('pending');
  });

  test('transfer ids survive — a bare problemId reveals nothing', () => {
    // The text and answers are fetched server-side at prompt time; shipping the
    // ids keeps the client able to say "2 practice problems" without the keys.
    expect(clientSafeBootcamp(bootcamp).queue[0].transferIds).toEqual(['fresh-1', 'fresh-2']);
  });

  test('the source bootcamp is not mutated by sanitizing it', () => {
    clientSafeBootcamp(bootcamp);
    expect(bootcamp.queue[0].correctAnswer).toBe('$50');
    expect(bootcamp.queue[0].explanation).toBeTruthy();
  });

  test('null and mongoose-document inputs are both handled', () => {
    expect(clientSafeBootcamp(null)).toBeNull();
    const asDoc = { toObject: () => JSON.parse(JSON.stringify(bootcamp)) };
    expect(clientSafeBootcamp(asDoc).queue[0].correctAnswer).toBeUndefined();
  });

  test('both client-facing endpoints sanitize before responding', () => {
    // /lesson-progress and /bootcamp/jump both sent session.bootcamp verbatim.
    const src = read('routes/courseSession.js');
    expect(src).toMatch(/progressUpdate\.bootcamp = clientSafeBootcamp\(/);
    expect(src).toMatch(/bootcamp: clientSafeBootcamp\(bc\)/);
    expect(src).not.toMatch(/progressUpdate\.bootcamp = session\.bootcamp/);
  });

  test('the chat turn payload stays compact and answer-free', () => {
    const src = read('routes/chat.js');
    const compact = src.slice(src.indexOf('const compactBootcamp'), src.indexOf('const compactBootcamp') + 400);
    expect(compact).not.toMatch(/correctOption|correctAnswer|explanation/);
  });
});

describe('the prompt asks for the work, not just agreement', () => {
  test('the transfer step appears and is gated on a real concept gap', () => {
    const section = reviewPromptSection(MISS, 0, 4, TRANSFER);
    expect(section).toContain('TRANSFER CHECK');
    expect(section).toMatch(/only if step 2 found a real CONCEPT GAP/);
    expect(section).toMatch(/skip it for a\n\s+careless slip/);
  });

  test('both practice problems are carried, one at a time', () => {
    const section = reviewPromptSection(MISS, 0, 4, TRANSFER);
    expect(section).toContain('PRACTICE 1: A jacket costs $60');
    expect(section).toContain('PRACTICE 2: A bike costs $180');
    expect(section).toMatch(/ONE at a time, never both at once/);
    expect(section).toMatch(/never paste the answer/);
  });

  test('advancing is blocked until the practice is settled', () => {
    const section = reviewPromptSection(MISS, 0, 4, TRANSFER);
    expect(section).toMatch(/6\. Emit the control tag <REVIEW_NEXT>/);
    expect(section).toMatch(/NEVER emit it while they still owe you a practice attempt/);
  });

  test('with no practice available the original 5-step flow is intact', () => {
    // An exhausted bank must not leave a dangling "step 5" or a broken advance
    // instruction — review still has to work.
    const section = reviewPromptSection(MISS, 0, 4, []);
    expect(section).not.toContain('TRANSFER CHECK');
    expect(section).toMatch(/5\. When they can do it on their own, emit the control tag <REVIEW_NEXT>/);
    expect(section).toContain('CORRECT ANSWER:');
  });

  test('practice options are lettered A-D, not aliased to the test form', () => {
    // The F-G-H-J alias mirrors what the student saw on THEIR numbered form.
    // These are fresh problems with no position on that form, so they are
    // plain A-D — aliasing them would invent a question number.
    const section = reviewPromptSection(MISS, 0, 4, TRANSFER);
    const block = section.slice(section.indexOf('PRACTICE 1'));
    expect(block).toContain('A) $75');
    expect(block).not.toMatch(/F\) \$75/);
  });
});

describe('the queue carries what selection needs', () => {
  const session = {
    items: [{ position: 12, problemId: 'act-p-12', skillId: 'act-percentages',
      category: 'integrating-essential-skills', difficulty: 4,
      options: [{ label: 'A', text: '$48' }, { label: 'B', text: '$50' }] }],
    responses: [{ position: 12, problemId: 'act-p-12', answer: 'A', correct: false, skipped: false }],
  };
  const problems = { 'act-p-12': { problemId: 'act-p-12', correctOption: 'B',
    answer: { value: '$50' }, explanation: 'Divide by 0.80.' } };

  test('difficulty rides on the entry so practice can match it', () => {
    expect(buildReviewQueue(session, problems)[0].difficulty).toBe(4);
  });

  test('transferIds starts empty — the caller with DB access fills it', () => {
    expect(buildReviewQueue(session, problems)[0].transferIds).toEqual([]);
  });

  test('selection excludes items the student has already been served', () => {
    // Practice drawn from the seen-ledger would be a question from their own
    // test, which proves nothing about transfer.
    const src = read('routes/actTest.js');
    expect(src).toMatch(/seenProblemIdsForUser\(req\.user\._id\)/);
    expect(src).toMatch(/problemId: \{ \$nin: \[\.\.\.seen\] \}/);
  });

  test('two misses on one skill never hand out the same practice problem', () => {
    const src = read('routes/actTest.js');
    expect(src).toMatch(/claimed\.add\(id\)/);
    expect(src).toMatch(/!claimed\.has\(c\.problemId\)/);
  });

  test('a selection failure leaves review working', () => {
    const src = read('routes/actTest.js');
    expect(src).toMatch(/transfer-item selection error \(non-fatal\)/);
  });
});

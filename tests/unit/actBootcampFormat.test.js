/**
 * ACT prep is a different format, and the code has always half-agreed:
 * courseSession.bootcamp is documented as REPLACING the gradual-release
 * scaffold, LessonTracker renders a Baseline→Review→Re-test→Compare loop
 * instead of the Warm-up/Learn/Practice stepper, and actReview builds a ranked
 * queue of the student's real missed questions. Two wires were missing
 * (owner, 2026-07-29):
 *
 *  1. The tutor "didn't seem informed of the exact questions that were missed."
 *     The missed question WAS injected (chat.js → actReview.reviewPromptSection)
 *     — but a curriculum step anchor was appended to the LAST USER MESSAGE on
 *     the same turn, contradicting it from the higher-attention slot.
 *  2. The ACT loop view switches on progressUpdate.courseId and reads
 *     .bootcamp/.diagnosticPlan — and buildProgressUpdate emitted none of the
 *     three, so ACT students got the curriculum stepper and the loop view was
 *     unreachable.
 */

const fs = require('fs');
const path = require('path');
const { reviewPromptSection, currentMiss } = require('../../utils/actReview');
const { buildProgressUpdate } = require('../../utils/progressState');
const { parseExamWeight, calculateOverallProgress } = require('../../utils/coursePrompt');

const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

const MISS = {
  position: 12,
  problemId: 'act-p-12',
  category: 'algebra',
  prompt: 'If 3x + 7 = 22, what is the value of x?',
  options: [
    { label: 'A', text: '3' }, { label: 'B', text: '5' },
    { label: 'C', text: '7' }, { label: 'D', text: '15' },
  ],
  skipped: false,
  theirAnswer: 'A',
  theirAnswerText: '3',
  correctOption: 'B',
  explanation: 'Subtract 7 from both sides, then divide by 3.',
};

describe('the tutor is handed the exact missed question', () => {
  test('the review section carries question, options, their answer, and the key', () => {
    const section = reviewPromptSection(MISS, 0, 4);
    expect(section).toContain('If 3x + 7 = 22, what is the value of x?');
    expect(section).toContain('A) 3');
    expect(section).toContain('B) 5');
    expect(section).toContain('They chose A (3) — INCORRECT');
    expect(section).toContain('CORRECT ANSWER: B (5)');
    expect(section).toContain('Subtract 7 from both sides');
    expect(section).toContain('#12');          // the number on THEIR test
    expect(section).toContain('1 of 4');
  });

  test('a skipped question reads as skipped, not as a wrong answer', () => {
    const section = reviewPromptSection({ ...MISS, skipped: true, theirAnswer: null }, 0, 1);
    expect(section).toContain('SKIPPED');
    expect(section).not.toContain('They chose');
  });

  test('currentMiss follows the queue index', () => {
    const bc = { queue: [MISS, { ...MISS, position: 15 }], index: 1 };
    expect(currentMiss(bc).position).toBe(15);
  });

  test('no miss → no section (never an empty QUESTION: block)', () => {
    expect(reviewPromptSection(null, 0, 0)).toBe('');
  });
});

describe('the curriculum step anchor must not fight the review', () => {
  const src = read('routes/chat.js');

  test('an active bootcamp clears the scaffold step context', () => {
    expect(src).toMatch(/const actBootcampActive = !!\(conversationContextForPrompt\?\.courseSession\?\.bootcamp\?\.phase\)/);
    expect(src).toMatch(/if \(actBootcampActive\) \{\s*\n\s*courseScaffoldCtx = null;/);
  });

  test('the suppression happens BEFORE the step anchor is appended', () => {
    const suppression = src.indexOf('courseScaffoldCtx = null;');
    const anchor = src.indexOf('teach THIS step. Do not skip ahead');
    expect(suppression).toBeGreaterThan(-1);
    expect(anchor).toBeGreaterThan(suppression);
  });
});

describe('the ACT loop view can actually be reached', () => {
  const session = {
    _id: 's1',
    courseId: 'act-prep',
    currentModuleId: 'algebra',
    currentScaffoldIndex: 0,
    modules: [{ moduleId: 'algebra', unit: 2, status: 'in_progress', scaffoldProgress: 0, lessons: [] }],
    bootcamp: { phase: 'review', round: 1, index: 1, queue: [MISS, MISS] },
    diagnosticPlan: { focusCategories: ['algebra'], masteredCategories: ['geometry'] },
  };

  test('buildProgressUpdate emits the three fields the loop view switches on', () => {
    const pu = buildProgressUpdate({
      courseSession: session,
      moduleData: { scaffold: [{ type: 'explanation', title: 'Intro' }] },
      conversation: { messages: [] },
    });
    expect(pu.courseId).toBe('act-prep');
    expect(pu.bootcamp).toEqual(session.bootcamp);
    expect(pu.diagnosticPlan).toEqual(session.diagnosticPlan);
  });

  test('the client still switches on courseId (contract intact)', () => {
    expect(read('public/js/lessonTracker.js')).toMatch(/pu\.courseId === 'act-prep'/);
  });

  test('a non-ACT course reports courseId with no bootcamp state', () => {
    const pu = buildProgressUpdate({
      courseSession: { ...session, courseId: 'algebra-1', bootcamp: null, diagnosticPlan: null },
      moduleData: { scaffold: [{ type: 'explanation' }] },
      conversation: { messages: [] },
    });
    expect(pu.courseId).toBe('algebra-1');
    expect(pu.bootcamp).toBeNull();
  });
});

describe('exam-weighted progress (score contribution, not module count)', () => {
  test('parses the authored ACT percentage strings', () => {
    expect(parseExamWeight('7-10%')).toBe(8.5);
    expect(parseExamWeight('40-43%')).toBe(41.5);
    expect(parseExamWeight('~25%')).toBe(25);
    expect(parseExamWeight(12)).toBe(12);
    expect(parseExamWeight(null)).toBeNull();
    expect(parseExamWeight('None')).toBeNull();
    expect(parseExamWeight('0%')).toBeNull();
  });

  test('a 40% category outweighs an 8% one', () => {
    const essentials = calculateOverallProgress([
      { moduleId: 'a', status: 'completed', examWeight: 41.5 },
      { moduleId: 'b', status: 'locked', examWeight: 8.5 },
    ]);
    const numberQuantity = calculateOverallProgress([
      { moduleId: 'a', status: 'locked', examWeight: 41.5 },
      { moduleId: 'b', status: 'completed', examWeight: 8.5 },
    ]);
    expect(essentials).toBeGreaterThan(numberQuantity);
    expect(essentials).toBe(83);   // 41.5 / 50
    expect(numberQuantity).toBe(17);
  });

  test('undeclared modules (checkpoints) get the mean, so they still count', () => {
    const pct = calculateOverallProgress([
      { moduleId: 'a', status: 'completed', examWeight: 40 },
      { moduleId: 'b', status: 'locked', examWeight: 20 },
      { moduleId: 'checkpoint', status: 'completed' },   // no declared weight → mean 30
    ]);
    expect(pct).toBe(78);   // (40 + 30) / 90
  });

  test('curriculum courses (no weights anywhere) stay uniformly weighted', () => {
    expect(calculateOverallProgress([
      { moduleId: 'a', status: 'completed' },
      { moduleId: 'b', status: 'locked' },
    ])).toBe(50);
  });
});

describe('the UI tells the truth about the loop (owner report, 2026-08-23)', () => {
  // The purple card showed "Round 1" beside a two-attempt score trend, the
  // Compare step never lit, and the course chrome ("Unit 1 › Number &
  // Quantity · 0/11 modules") described a chapter curriculum the bootcamp
  // never presents.

  test('round is counted from completed tests, not bootcamp increments', () => {
    // A test taken before enrolling lands in /history but never touched
    // cs.bootcamp — round must come from ActTestSession.countDocuments.
    const src = read('routes/actTest.js');
    expect(src).toMatch(/ActTestSession\.countDocuments\(\{ userId: req\.user\._id, status: 'completed' \}\)/);
    expect(src).not.toMatch(/round: prevRound \+ 1/);
  });

  test('the Compare step can light up (two scored attempts = done)', () => {
    const src = read('public/js/lessonTracker.js');
    expect(src).toMatch(/lt-bc-step-compare/);
    expect(src).toMatch(/_bcAttempts/);
    // The old hardcoded permanently-grey step must be gone.
    expect(src).not.toMatch(/step\('fa-chart-line', 'Compare', 'todo'\)/);
  });

  test('a score regression still gets a badge (no bare "33 → 28")', () => {
    const src = read('public/js/lessonTracker.js');
    expect(src).toMatch(/d < 0/);
    expect(src).toMatch(/&#9660;/);   // the ▼ badge
  });

  test('bootcamp turns do not advance the scaffold progress bar', () => {
    // The scaffold evaluator ran on every act-prep turn and moved the module
    // bar through steps the student never saw — and flipping the module to
    // in_progress disarmed planStartModule's round-2+ retargeting.
    const src = read('routes/chat.js');
    expect(src).toMatch(/csDoc\.status === 'active' && csDoc\.courseId !== 'act-prep'/);
  });

  test('sidebar + header chrome switch to loop language for act-prep', () => {
    const src = read('public/js/courseCatalog.js');
    // Both surfaces (sidebar card and top-of-chat header) branch on act-prep.
    expect(src.match(/courseId === 'act-prep'/g).length).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/Reviewing your misses/);
    expect(src).toMatch(/Ready to re-test/);
  });
});

describe('the course describes the test it actually administers', () => {
  // examAlignment is the course's self-description; the blueprint is what the
  // runner administers. They drifted (legacy 60q/60min/5-choice vs. the
  // enhanced-ACT 45q/50min/4-choice) — pin them together.
  const blueprint = JSON.parse(read('seeds/act-math-blueprint.json'));
  const pathway = JSON.parse(read('public/resources/act-prep-pathway.json'));

  test('question count, time, and choice count match the blueprint', () => {
    expect(pathway.examAlignment.totalQuestions).toBe(blueprint.totalItems);
    expect(pathway.examAlignment.totalTime).toBe(`${blueprint.timeLimitMinutes} minutes`);
    expect(pathway.examAlignment.format).toContain(`${blueprint.choicesPerItem} options`);
  });

  test('the runner fallbacks agree with the blueprint', () => {
    const src = read('public/js/act-test.js');
    expect(src).toContain(`data.totalItems || ${blueprint.totalItems}`);
    expect(src).toContain(`data.timeLimitMinutes || ${blueprint.timeLimitMinutes}`);
  });
});

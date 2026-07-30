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

/**
 * Correct, complete work must reach the tutor as correct.
 *
 * Student audit, 2026-10-15, two prod transcripts:
 *   - Five systems posed as one numbered set, all answered correctly by number
 *     with full work. No verdict (the pipeline tracks one problem; the align*
 *     systems didn't even parse), so the tutor called them "solid attempts"
 *     and restarted the steps on all five.
 *   - The student asked about (2x+3)(x+1); the tutor parked it for a parallel
 *     (2x+4)(x+2). "For my original I get 2x^2+5x+3" was graded against the
 *     parallel's key — stamped incorrect twice; the tutor invented a
 *     constant-term error. The next turn's answer was read as "3." (from
 *     "3 times 1 gives 3.") instead of the stated conclusion.
 *
 * The tutor/student texts in the fixture are the real stored turns.
 */

const { gradeBatch, splitNumbered } = require('../../utils/pipeline/batchGrading');
const { diagnose } = require('../../utils/pipeline/diagnose');
const { decide, ACTIONS } = require('../../utils/pipeline/decide');
const { observe } = require('../../utils/pipeline/observe');
const { parseCleanProblem } = require('../../utils/mathSolver');
const fixture = require('../fixtures/auditNumberedSystems.json');

const ai = (content, problemInfo = null) => ({ content, problemInfo });

describe('a numbered set answered by number', () => {
  test('the audit turn grades 5 of 5', () => {
    const batch = gradeBatch(fixture.tutor, fixture.student);
    expect(batch.items.map((i) => i.verdict)).toEqual([true, true, true, true, true]);
    expect(batch.items[4].studentAnswer).toBe('x = 13/3, y = 4/3');
  });

  test('a wrong item is caught by number, the rest still confirmed', () => {
    const wrong = fixture.student.replace('y=33/5', 'y=3.6');
    const batch = gradeBatch(fixture.tutor, wrong);
    expect(batch.items.map((i) => i.verdict)).toEqual([false, true, true, true, true]);
  });

  test('markers must run 1, 2, 3… — "3(-x+4)" is not item 3', () => {
    expect(splitNumbered('2x+3(-x+4)=6 and x + 3 = 5').length).toBe(0);
    expect(splitNumbered(fixture.student).map((i) => i.n)).toEqual([1, 2, 3, 4, 5]);
  });

  test('not a set: a single problem and a single answer', () => {
    expect(gradeBatch('Solve 3x + 4 = 19', 'x = 5')).toBeNull();
  });

  test('diagnose → decide: CONFIRM_CORRECT, every item listed, no re-solve', async () => {
    const obs = observe(fixture.student, { recentUserMessages: [], recentAssistantMessages: [ai(fixture.tutor)], recentProblemResults: [] });
    const dg = await diagnose(obs, { recentAssistantMessages: [ai(fixture.tutor)], recentUserMessages: [] });
    expect(dg).toMatchObject({ isCorrect: true, verificationSource: 'batch', correctAnswer: null });
    const dec = decide(obs, dg, { conversation: { messages: [] }, user: {} });
    expect(dec.action).toBe(ACTIONS.CONFIRM_CORRECT);
    const text = dec.directives.join('\n');
    for (let n = 1; n <= 5; n++) expect(text).toMatch(new RegExp(`${n}\\) x = .* — CORRECT`));
    expect(text).toMatch(/do NOT re-walk its steps/);
  });

  test('a wrong item routes to GUIDE_INCORRECT without revealing its answer', async () => {
    const student = fixture.student.replace('y=33/5', 'y=3.6');
    const obs = observe(student, { recentUserMessages: [], recentAssistantMessages: [ai(fixture.tutor)], recentProblemResults: [] });
    const dg = await diagnose(obs, { recentAssistantMessages: [ai(fixture.tutor)], recentUserMessages: [] });
    const dec = decide(obs, dg, { conversation: { messages: [] }, user: {} });
    expect(dec.action).toBe(ACTIONS.GUIDE_INCORRECT);
    const text = dec.directives.join('\n');
    expect(text).toMatch(/1\) x = 9\/5, y = 3\.6 — NOT CORRECT/);
    expect(text).not.toMatch(/6\.6|33\/5/);
  });
});

describe('systems posed as an align block', () => {
  test.each([
    ['Solve the system of equations:  \\[\n\\begin{align*}\ny &= 2x + 3 \\\\\n3x + y &= 12\n\\end{align*}\n\\]', 'x = 1.8, y = 6.6'],
    ['Solve the system of equations:  \\[\n\\begin{align*}\ny &= \\frac{1}{2}x + 1 \\\\\n4x - y &= 5\n\\end{align*}\n\\]', 'x = 1.7143, y = 1.8571'],
    ['Solve the system: y = x/2 + 1, 4x - y = 5', 'x = 1.7143, y = 1.8571'],
  ])('%#: parses and solves', (text, answer) => {
    const r = parseCleanProblem(text);
    expect(r.problem.type).toBe('system_of_equations');
    expect(r.solution.answer).toBe(answer);
  });
});

describe('an answer to the problem the student came in with', () => {
  // The real stored tutor turns #2, #4, #6 (with their stored problemInfo) and
  // student turns #5, #7.
  const parked = require('../fixtures/auditParkedProblem.json');
  const [t2, t4, t6] = parked.tutor;

  async function grade(message, recent) {
    const obs = observe(message, { recentUserMessages: [], recentAssistantMessages: recent, recentProblemResults: [] });
    return { obs, dg: await diagnose(obs, { recentAssistantMessages: recent, recentUserMessages: [] }) };
  }

  test('turn #5 — "for my original I get 2x^2+5x+3" is correct for the original', async () => {
    const { dg } = await grade(parked.student5, [t2, t4]);
    expect(dg).toMatchObject({ isCorrect: true, verificationSource: 'earlier_problem', correctAnswer: '2x^2 + 5x + 3' });
  });

  test('turn #7 — the stated conclusion is the answer, and the tutor pointed back', async () => {
    const { obs, dg } = await grade(parked.student7, [t2, t4, t6]);
    expect(obs.answer.value).toBe('2x^2+5x+3');
    expect(dg).toMatchObject({ isCorrect: true, verificationSource: 'earlier_problem' });
  });

  test('the earlier answer with no pointer back from anyone is undecided, never wrong', async () => {
    const parallel = { content: "Let's multiply \\((2x + 4)(x + 2)\\) step by step. Sound good?", problemInfo: t4.problemInfo };
    const { dg } = await grade('I get 2x^2+5x+3', [t2, parallel]);
    expect(dg.isCorrect).toBeNull();
  });

  test('a truly wrong answer is still wrong', async () => {
    const { dg } = await grade('For my original I get 2x^2+5x+4', [t2, t4]);
    expect(dg.isCorrect).toBe(false);
  });
});

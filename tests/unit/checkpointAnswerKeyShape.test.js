/**
 * Checkpoint answer keys come in two shapes; the grader must read both.
 *
 * Course audit, 2026-10-18: the 6th- and 7th-grade Q2 checkpoints store every
 * key as { answer, rubric }. Both readers took the object as-is, so the
 * deterministic check and the LLM grader compared students against the text
 * "[object Object]" — 30 items, two whole checkpoints, ungradable.
 */
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';
const path = require('path');
const { resolveAnswerKey } = require('../../utils/answerKeyValue');
const mod = (p) => require(path.join(__dirname, '../../public/modules', p));

describe('resolveAnswerKey', () => {
  test('a string key is the answer', () => {
    expect(resolveAnswerKey({ a: 'x = 8' }, { id: 'a' })).toEqual({ answer: 'x = 8', rubric: null });
  });
  test('an object key yields its answer and rubric, never "[object Object]"', () => {
    const r = resolveAnswerKey({ a: { answer: '102', rubric: 'units required' } }, { id: 'a' });
    expect(r).toEqual({ answer: '102', rubric: 'units required' });
  });
  test('no key → the problem\'s own answer', () => {
    expect(resolveAnswerKey({}, { id: 'a', answer: '7' })).toEqual({ answer: '7', rubric: null });
  });
});

describe('the real Q2 checkpoints grade again', () => {
  // These keys are worded worked answers, so the exact check falls through to
  // the LLM grader — which must now receive the real key and its rubric.
  test.each([
    ['6th-grade-math/checkpoint_q2_module.json', 'cq2-6', /102 square inches/],
    ['7th-grade-math/checkpoint_q2_module.json', 'q2-1', /\$0\.20 per ounce/],
  ])('%s %s hands the grader the real key and rubric', (file, id, expected) => {
    const m = mod(file);
    const problem = m.assessmentProblems.find((p) => p.id === id);
    const { answer, rubric } = resolveAnswerKey(m.answerKeys, problem);
    expect(answer).toMatch(expected);
    expect(String(m.answerKeys[id])).toBe('[object Object]');   // what main graded against
    expect(typeof rubric).toBe('string');
  });

  test('every key in both Q2 checkpoints resolves to text', () => {
    for (const file of ['6th-grade-math/checkpoint_q2_module.json', '7th-grade-math/checkpoint_q2_module.json']) {
      const m = mod(file);
      for (const p of m.assessmentProblems) {
        const { answer } = resolveAnswerKey(m.answerKeys, p);
        expect(answer && answer.length).toBeGreaterThan(0);
        expect(answer).not.toMatch(/object Object/);
      }
    }
  });

  test('no checkpoint anywhere resolves to "[object Object]"', () => {
    const glob = require('fs').readdirSync(path.join(__dirname, '../../public/modules'));
    let n = 0;
    for (const course of glob) {
      const dir = path.join(__dirname, '../../public/modules', course);
      for (const f of require('fs').readdirSync(dir).filter((x) => x.endsWith('.json'))) {
        const m = require(path.join(dir, f));
        for (const p of m.assessmentProblems || []) {
          n++;
          expect(String(resolveAnswerKey(m.answerKeys || {}, p).answer)).not.toMatch(/object Object/);
        }
      }
    }
    expect(n).toBeGreaterThan(500);
  });
});

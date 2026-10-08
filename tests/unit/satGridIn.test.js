/**
 * The SAT grid-in box (public/js/act-test.js sanitizeGridIn / gridInPreviewHtml).
 *
 * The box is half of grading: whatever it lets a student type is what the
 * server compares against the key. So two promises are pinned against the
 * REAL bank and the REAL grader, not hand-picked strings:
 *
 *   1. Every grid-in key in seeds/sat-items.generated.json can be typed in the
 *      box exactly as stored. A key the box can't hold is an unanswerable item.
 *   2. Every entry the box produces for a correct answer grades correct — the
 *      box never accepts a form the grader rejects (it once allowed 7/2.0).
 *
 * Plus the Bluebook entry rules themselves: digits, a leading minus, ONE of a
 * decimal point or a fraction bar, 5 characters (6 with a minus).
 */
const fs = require('fs');
const path = require('path');

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';
const Problem = require('../../models/problem');
const SAT_ITEMS = require('../../seeds/sat-items.generated.json');

function loadRunner() {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'act-test.js'), 'utf8');
  const win = { addEventListener() {} };
  const doc = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} }, addEventListener() {} };
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'location', 'localStorage', src)(win, doc, { search: '' }, { getItem: () => null });
  return win;
}
const win = loadRunner();
const sanitize = win.__actSanitizeGridIn;
const preview = (v) => win.__actGridInPreviewHtml(v).replace(/<[^>]+>/g, '');

const GRID_INS = SAT_ITEMS.filter((p) => p.answerType === 'constructed-response');

test('the bank has grid-ins to check', () => {
  expect(GRID_INS.length).toBeGreaterThan(20);
});

test.each(GRID_INS.map((p) => [p.problemId, p]))('%s: every accepted form can be typed, and grades correct as typed', (_id, item) => {
  const problem = new Problem(item);
  const forms = [item.answer.value, ...(item.answer.equivalents || [])].map(String);
  for (const form of forms) {
    expect(sanitize(form)).toBe(form);
    expect(problem.checkAnswer(sanitize(form))).toBe(true);
  }
});

test('Bluebook entry rules: characters, one separator, field length', () => {
  expect(sanitize('$1,200')).toBe('1200');          // no symbols or commas
  expect(sanitize('123456')).toBe('12345');         // 5 characters…
  expect(sanitize('-123456')).toBe('-12345');       // …6 with a minus
  expect(sanitize('4-5')).toBe('45');               // minus only in front
  expect(sanitize('−4')).toBe('-4');                // a pasted Unicode minus
  expect(sanitize('3.5.1')).toBe('3.51');           // one decimal point
  expect(sanitize('1/2/3')).toBe('1/23');           // one fraction bar
  expect(sanitize('7/2.0')).toBe('7/20');           // never both — the grader can't read 7/2.0
  expect(sanitize('1.5/2')).toBe('1.52');
  expect(sanitize('/3')).toBe('3');                 // a fraction needs a numerator
});

test('a mixed number cannot be typed; the preview shows what it became', () => {
  // The space can't be typed, so "2 1/2" becomes 21/2 — the trap College
  // Board warns about. The stacked preview is what shows the student.
  expect(sanitize('2 1/2')).toBe('21/2');
  expect(preview('21/2')).toBe('Answer preview: 212');
  expect(win.__actGridInPreviewHtml('21/2')).toMatch(/aria-label="21 over 2"/);
});

test('the preview says when an entry is not a finished number', () => {
  expect(preview('')).toMatch(/appears here/);
  expect(preview('-')).toMatch(/isn’t a complete answer/);
  expect(preview('3/')).toMatch(/isn’t a complete answer/);
  expect(preview('3/0')).toMatch(/0 on the bottom/);
  expect(preview('-.5')).toBe('Answer preview: −.5');
});

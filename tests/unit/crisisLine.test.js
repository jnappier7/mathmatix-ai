// tests/unit/crisisLine.test.js
//
// Owner decision 2026-10-17: a self-harm disclosure always gets the 988
// Suicide & Crisis Lifeline in the tutor's reply. Appended server-side
// (Stage 5f.0) because the model can't be relied on to include it.

const fs = require('fs');
const path = require('path');
const { withCrisisLine, isSelfHarmDisclosure, CRISIS_LINE } = require('../../utils/contentFilter');

const REAL = "I'm really sorry to hear that you're feeling this way. It's important to talk to someone who can help you, like a trusted adult or a counselor.";

test.each([
  'i dont want to be alive anymore',
  'ive been cutting myself again',
  'sometimes i think everyone would be better off without me',
  'i want to kill myself',
])('self-harm: %s → 988 appended once', (msg) => {
  expect(isSelfHarmDisclosure(msg)).toBe(true);
  const out = withCrisisLine(REAL, msg);
  expect(out.startsWith(REAL)).toBe(true);
  expect(out).toContain(CRISIS_LINE);
  expect(out.match(/\b988\b/g)).toHaveLength(1);
});

test('not duplicated when the reply already gives 988', () => {
  const r = 'Please reach out — you can call or text 988 any time.';
  expect(withCrisisLine(r, 'i want to kill myself')).toBe(r);
});

test.each([
  'my dad hits me when i get bad grades',   // abuse: the alert fires, but 988 is the wrong line
  'this problem is killing me lol',
  'ugh im gonna die if i fail this test',
  'solve 3x + 5 = 20',
])('no crisis line: %s', (msg) => {
  expect(withCrisisLine('Okay — what is your first step?', msg)).toBe('Okay — what is your first step?');
});

test('the pipeline appends it on the authoritative text; the prompt names it too', () => {
  const idx = fs.readFileSync(path.join(__dirname, '../../utils/pipeline/index.js'), 'utf8');
  expect(idx).toMatch(/verified\.text = withCrisisLine\(verified\.text, message\);/);
  expect(idx.indexOf('withCrisisLine(verified.text')).toBeLessThan(idx.indexOf('Stage 5g: REPLY-JUDGE TELEMETRY'));
  expect(fs.readFileSync(path.join(__dirname, '../../utils/promptCompact.js'), 'utf8')).toMatch(/call or text 988/);
});

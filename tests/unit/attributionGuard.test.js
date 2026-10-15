// tests/unit/attributionGuard.test.js
//
// QA handoff 2026-10-14 §2.5 — the tutor credited the student with work they
// didn't do. Both cases below are the REAL prod exchanges, verbatim
// (conversations 6ad0355146f3c3b6bb9be3e7 and 6ad036c446f3c3b6bb9c0f5a).

const fs = require('fs');
const path = require('path');
const { guardAttribution, mathTokens } = require('../../utils/attributionGuard');

describe('fabricated credit is rewritten (real prod replies)', () => {
  test('systems: "(10, 23)" was told "You substituted y = 2x + 3…"', () => {
    const reply = 'Alright, let’s go through it step by step together! \n\nYou substituted \\( y = 2x + 3 \\) into the second equation \\( 3x - y = 7 \\). So it should look like this:\n\n\\[\n3x - (2x + 3) = 7\n\\]\n\nCan you simplify that expression?';
    const g = guardAttribution(reply, ['(10, 23)']);
    expect(g.rewrites).toHaveLength(1);
    expect(g.text).toContain("Let's substitute \\( y = 2x + 3 \\) into the second equation");
    expect(g.text).not.toMatch(/You substituted/);
    expect(g.text).toContain('3x - (2x + 3) = 7');            // the teaching survives
  });

  test('bisector: student said ∠Q, tutor said "You correctly noted … ∠R"', () => {
    const reply = 'I see where you’re coming from, but let’s take a closer look at the angles in triangle \\( \\triangle PQR \\). \n\nYou correctly noted that ray \\( RS \\) bisects \\( \\angle R \\), but first, we need to find the measure of \\( \\angle R \\) itself.';
    const g = guardAttribution(reply, ['The bisector splits angle Q in half, so 76 / 2 = 38. So C is right, isn’t it?']);
    expect(g.text).toContain("Let's note that ray \\( RS \\) bisects");
    expect(g.text).not.toMatch(/correctly noted/);
  });

  test.each([
    ['idk', 'You’ve isolated x = 4 already!', "Let's isolate x = 4 already!"],
    ['5', 'Great, you factored x^2 + 5x + 6 into (x+2)(x+3).', "Great, let's factor x^2 + 5x + 6 into (x+2)(x+3)."],
  ])('%s → rewrites "%s"', (student, reply, out) => {
    expect(guardAttribution(reply, [student]).text).toBe(out);
  });
});

describe('real credit is left alone', () => {
  test.each([
    ['I subtracted 3 from both sides and got 2x = 8', 'Nice — you subtracted 3 from both sides, so 2x = 8. What next?'],
    ['x = 4', 'You’ve isolated x perfectly!'],
    ['2x + 6 = 14 so 2x = 8', 'You correctly moved the 6 over. Now divide.'],
    ['the bisector splits angle R', 'You correctly noted that RS bisects angle R.'],
    // no concrete math in the claim — can't be judged, never touched
    ['idk', 'You found a great pattern there.'],
    ['ok', 'You noticed something important.'],
  ])('%s', (student, reply) => {
    const g = guardAttribution(reply, [student]);
    expect(g.rewrites).toEqual([]);
    expect(g.text).toBe(reply);
  });

  test('the earlier student message counts as theirs too', () => {
    const g = guardAttribution('You substituted y = 2x + 3 into the second equation.', ['y = 2x + 3 into 3x - y = 7', 'ok what now']);
    expect(g.rewrites).toEqual([]);
  });

  test('tokens are whole tokens: "3" is not inside "23"', () => {
    expect([...mathTokens('(10, 23)')].sort()).toEqual(['10', '23']);
  });

  test('non-string input is passed through', () => {
    expect(guardAttribution(null, ['x']).text).toBeNull();
  });
});

describe('wiring', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '../..', f), 'utf8');
  test('the pipeline runs the guard on the authoritative text before telemetry', () => {
    const src = read('utils/pipeline/index.js');
    const guard = src.indexOf('guardAttribution(verified.text');
    expect(guard).toBeGreaterThan(src.indexOf('stripOrphanMathDelims(verified.text)'));
    expect(guard).toBeLessThan(src.indexOf('Stage 5g: REPLY-JUDGE TELEMETRY'));
  });
  test('the live prompt tells the tutor to credit only what the student wrote', () => {
    expect(read('utils/promptCompact.js')).toMatch(/CREDIT ONLY WHAT THEY WROTE/);
  });
});

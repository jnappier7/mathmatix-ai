/**
 * LaTeX survives the voice tutor's <math> array.
 *
 * Owner, 2026-11-28: "want to make sure that latex works for this feature.
 * Had some weird mark up last test."
 *
 * The array is JSON and its lines are LaTeX; both use the backslash. Written
 * with one backslash, "\frac" parsed as a form feed + "rac", "\times" as a
 * tab + "imes", and "\sqrt" failed the whole parse so the board did not
 * update at all. Every input below is typed as the MODEL would type it
 * (String.raw), and checked on what reaches the board.
 */
'use strict';

const { parseMathArray, tidyLatex } = require('../../utils/voiceMathJson');
const { parseLine } = require('../../utils/pipeline/checkWorkSteps');
const { cardVoiceLines, givenTexes } = require('../../utils/voiceBoardCards');
const { voiceToBoardCommands } = require('../../public/js/living-workspace/dom/voiceBoardTranslate');

const R = String.raw;
const lines = raw => parseMathArray(raw).map(s => s.latex);

describe('one backslash, as a model writes it', () => {
  test('commands that are ALSO JSON escapes keep their backslash (\\f \\t \\n \\r \\b)', () => {
    expect(lines(R`[{"latex":"\frac{3}{4}x + 2 = 5"},{"latex":"3 \times 4 = 12"},{"latex":"x \neq 2"},{"latex":"\left(x+1\right)^2"},{"latex":"\beta + \theta"}]`))
      .toEqual([R`\frac{3}{4}x + 2 = 5`, R`3 \times 4 = 12`, R`x \neq 2`, R`\left(x+1\right)^2`, R`\beta + \theta`]);
  });

  test('commands that are NOT JSON escapes no longer lose the whole board', () => {
    expect(lines(R`[{"latex":"\sqrt{16} = 4"},{"latex":"2 \cdot 3"},{"latex":"8 \div 2"},{"latex":"x \le 5"},{"latex":"\pi r^2"}]`))
      .toEqual([R`\sqrt{16} = 4`, R`2 \cdot 3`, R`8 \div 2`, R`x \le 5`, R`\pi r^2`]);
  });

  test('no control character ever reaches a line', () => {
    const all = lines(R`[{"latex":"\frac{1}{2} \times \text{x} \neq \right. \beta"}]`).join('');
    // eslint-disable-next-line no-control-regex
    expect(all).not.toMatch(/[\u0000-\u001f]/);
  });

  test('a row break in a system survives as a row break', () => {
    expect(lines(R`[{"latex":"\begin{aligned} 2x + y &= 6 \\ x - y &= 0 \end{aligned}"}]`))
      .toEqual([R`\begin{aligned} 2x + y &= 6 \\ x - y &= 0 \end{aligned}`]);
  });

  test('"\\underline" is a command, not a unicode escape', () => {
    expect(lines(R`[{"latex":"\underline{x} + 1"}]`)).toEqual([R`\underline{x} + 1`]);
  });
});

describe('two backslashes, as JSON wants it', () => {
  test('correctly escaped LaTeX is left exactly as it was', () => {
    expect(lines(R`[{"label":"Given","latex":"\\frac{3}{4} + \\frac{1}{8}"},{"latex":"3 \\times 4"}]`))
      .toEqual([R`\frac{3}{4} + \frac{1}{8}`, R`3 \times 4`]);
  });

  test('escaped quotes and real unicode escapes still work', () => {
    const out = parseMathArray(R`[{"label":"say \"hi\"","latex":"2\u00d73"}]`);
    expect(out[0].label).toBe('say "hi"');
    expect(out[0].latex).toBe('2×3');
  });

  test('a mixed array — some doubled, some not — reads both', () => {
    expect(lines(R`[{"latex":"\\frac{1}{2}"},{"latex":"\sqrt{9} \times 2"}]`))
      .toEqual([R`\frac{1}{2}`, R`\sqrt{9} \times 2`]);
  });
});

describe('model quirks that used to cost the board', () => {
  test('a trailing comma', () => {
    expect(lines(R`[{"latex":"2x = 4"},]`)).toEqual(['2x = 4']);
  });
  test('not an array, or empty: null (the caller keeps the last board)', () => {
    expect(parseMathArray('')).toBeNull();
    expect(parseMathArray('{"latex":"x"}')).toBeNull();
    expect(parseMathArray('sorry, no math')).toBeNull();
  });
  test('an empty array is an empty board, not a failure', () => {
    expect(parseMathArray('[]')).toEqual([]);
  });
});

describe('a line is made safe to typeset', () => {
  test('delimiters the prompt forbids are dropped', () => {
    expect(tidyLatex('$x^2 - 5x + 6$').latex).toBe('x^2 - 5x + 6');
    expect(tidyLatex('$$2x = 4$$').latex).toBe('2x = 4');
  });

  test('an empty answer box becomes a question mark (nothing to type with in a call)', () => {
    for (const blank of [R`\boxed{}`, R`\boxed{ }`, R`\boxed{\phantom{x}}`, R`\boxed{?}`, R`\square`, R`\_\_\_`, '____']) {
      expect(tidyLatex(blank + R` = \frac{5\pi}{6}`).latex).toBe(R`? = \frac{5\pi}{6}`);
    }
    // A box with something in it is the tutor boxing an answer: untouched.
    expect(tidyLatex(R`\boxed{x = 4}`).latex).toBe(R`\boxed{x = 4}`);
  });

  test('"Subtract 2: 3x = 15" — the words become the caption', () => {
    const steps = parseMathArray(R`[{"latex":"Subtract 2: \frac{3}{4}x = 3"}]`);
    expect(steps[0].latex).toBe(R`\frac{3}{4}x = 3`);
    expect(steps[0].label).toBe('Subtract 2');
    // A label the tutor gave is never overwritten.
    expect(parseMathArray(R`[{"label":"Step","latex":"Subtract 2: x = 3"}]`)[0].label).toBe('Step');
  });

  test('a stray word inside math is set as a word, not as italic letters', () => {
    expect(tidyLatex('3 apples + 2 apples = 5').latex).toBe(R`3 \text{ apples } + 2 \text{ apples } = 5`);
    expect(tidyLatex(R`\text{area} = 12`).latex).toBe(R`\text{area} = 12`);              // already text
    expect(tidyLatex(R`\sqrt{16} + \sin x`).latex).toBe(R`\sqrt{16} + \sin x`);          // commands
    expect(tidyLatex(R`\begin{aligned} x &= 1 \end{aligned}`).latex).toBe(R`\begin{aligned} x &= 1 \end{aligned}`);
  });

  test('a whole sentence is left for the board\'s own prose path', () => {
    expect(tidyLatex('Subtract 2 from both sides').latex).toBe('Subtract 2 from both sides');
  });
});

describe('the math behind the cards reads fractions correctly', () => {
  const at = (tex, x) => parseLine(tex).f({ x });

  test('\\frac{3}{4}x is three quarters of x, not 3 over 4x', () => {
    expect(at(R`\frac{3}{4}x + 2 = 5`, 4)).toBeCloseTo(0);     // x = 4 solves it
    expect(at(R`\dfrac{x}{2} = 3`, 6)).toBeCloseTo(0);
  });

  test('a mixed number is a whole and a part', () => {
    expect(parseLine(R`2\frac{1}{2} \cdot 4`).f({})).toBeCloseTo(10);
  });

  test('so a fraction solve is one card, closed by its answer', () => {
    const steps = parseMathArray(R`[{"label":"Given","latex":"\frac{3}{4}x + 2 = 5"},{"latex":"\frac{3}{4}x = 3"},{"latex":"x = 4"}]`);
    const cmds = cardVoiceLines(null, voiceToBoardCommands({ mathSteps: steps }), { given: givenTexes(steps) });
    expect(cmds.map(c => c.action)).toEqual(['pose', 'resolve', 'verify']);
  });
});

describe('the wiring', () => {
  const vs = require('fs').readFileSync(require('path').join(__dirname, '../../utils/voiceSession.js'), 'utf8');

  test('the voice session reads its math array through this parser', () => {
    expect(vs).toMatch(/const parsed = parseMathArray\(trimmed\);\s*if \(parsed\) return parsed\.filter\(isUsableStep\);/);
  });

  test('the tutor is shown the format: doubled backslashes, no delimiters, no words', () => {
    const m = vs.match(/const STREAMING_VOICE_INSTRUCTIONS = (`[\s\S]*?`);/);
    const prompt = eval(m[1]);                                   // eslint-disable-line no-eval
    expect(prompt).toContain(R`Fractions are \\frac{3}{4}, roots \\sqrt{16}, times \\times`);
    expect(prompt).toContain(R`"latex":"\\frac{3}{4} + \\frac{1}{8}"`);
    expect(prompt).toMatch(/every LaTeX backslash is written TWICE/);
  });
});

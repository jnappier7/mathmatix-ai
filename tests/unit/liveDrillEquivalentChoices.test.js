/**
 * A drill must never offer the right answer twice in different words. The 2026-10-23 report:
 * "Factor m² − 8m − 9" showed both (m + 1)(m − 9) and (m − 9)(m + 1), and picking the second
 * scored a miss. Choices used to be de-duplicated by exact string, so factors in a different
 * order slipped through whenever a distractor recipe happened to land on the answer's factors
 * (a root of ±1, a = c in ax² + bx + c, q = p + 1 in the PRIME template).
 */
const fs = require('fs');
const path = require('path');
const { choiceKey, mc } = require('../../utils/liveDrill/prep/kit');

describe('choiceKey', () => {
  test('a product of factors reads the same in any order', () => {
    expect(choiceKey('(m + 1)(m − 9)')).toBe(choiceKey('(m − 9)(m + 1)'));
    expect(choiceKey('3(x + 2)(x − 4)')).toBe(choiceKey('3(x − 4)(x + 2)'));
    expect(choiceKey('(x + 3)<sup>2</sup>')).toBe(choiceKey('(x + 3)(x + 3)'));
  });
  test('different factors, coefficients or a not-fully-factored form stay distinct', () => {
    expect(choiceKey('(m + 1)(m − 9)')).not.toBe(choiceKey('(m − 1)(m + 9)'));
    expect(choiceKey('4(x + 6)(x + 8)')).not.toBe(choiceKey('(4x + 24)(x + 8)'));
    expect(choiceKey('2(x + 1)(x + 3)')).not.toBe(choiceKey('(x + 1)(x + 3)'));
    expect(choiceKey('x = 3 and y = 4')).toBe('x = 3 and y = 4');
  });
  test('mc drops a reordered copy of the answer and tops up from the other wrongs', () => {
    const rand = () => 0.5;
    const { choices } = mc(rand, '(m + 1)(m − 9)', ['(m − 9)(m + 1)', '(m − 1)(m + 9)', '(m + 1)(m + 9)', '(m − 1)(m − 9)']);
    expect(choices).toHaveLength(4);
    expect(choices.slice(1)).not.toContain('(m − 9)(m + 1)');
  });
});

describe('no review or prep bank offers the key twice', () => {
  const dirs = ['review', 'prep'].map((d) => path.join(__dirname, '../../utils/liveDrill', d));
  const banks = dirs.flatMap((d) => fs.readdirSync(d).filter((f) => f !== 'kit.js').map((f) => [f, require(path.join(d, f))])).filter(([, b]) => b.TEMPLATES);
  test.each(banks)('%s', (_f, bank) => {
    let s = 4242; const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    for (const id of Object.keys(bank.TEMPLATES)) {
      for (let i = 0; i < 300; i++) {
        const p = bank.makePlay(bank.TEMPLATES[id].book, Object.keys(bank.TEMPLATES).filter((k) => k !== id), rand);
        if (!p.choices || !p.choices.length) continue;
        const keys = p.choices.map((c) => choiceKey(c.html));
        if (new Set(keys).size !== keys.length) throw new Error(`${id}: ${p.choices.map((c) => c.html).join(' | ')}`);
      }
    }
  });
});

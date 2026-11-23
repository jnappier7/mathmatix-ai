/**
 * Steps of a solve line up on the relation sign (owner, 2026-11-23: "Steps for
 * solving equations should line up vertically by the equal sign").
 *
 * The card can only do that if each line is split into left side / sign /
 * right side at the RIGHT place — and a line split in the wrong place is wrong
 * math on a student's page, so the splitter must answer null ("typeset it
 * whole") whenever it is not certain. This pins both halves of that, and the
 * stylesheet contract the three pieces are laid out by.
 */
const fs = require('fs');
const path = require('path');
const { splitRelation } = require('../../../public/js/living-workspace/dom/derivationView.js');

describe('splitRelation — where a line lines up', () => {
  test.each([
    ['2x + 3 = 11', '2x + 3', '=', '11'],
    ['x=4', 'x', '=', '4'],
    ['-2x \\ge 8', '-2x', '\\ge', '8'],
    ['x \\leq -4', 'x', '\\leq', '-4'],
    ['2x \\neq 6', '2x', '\\neq', '6'],
    ['y < 3x + 1', 'y', '<', '3x + 1'],
    ['f(x) = 2x + 1', 'f(x)', '=', '2x + 1'],
    ['\\frac{x}{2} + 1 = \\boxed{\\phantom{0}}', '\\frac{x}{2} + 1', '=', '\\boxed{\\phantom{0}}'],
    ['3\\left(x + 2\\right) = 18', '3\\left(x + 2\\right)', '=', '18'],
    // a chain or a compound inequality lines up on its FIRST sign
    ['-3 < x < 5', '-3', '<', 'x < 5'],
    ['2(3) + 4 = 6 + 4 = 10', '2(3) + 4', '=', '6 + 4 = 10'],
    // a continuation line ("= 12") still puts its sign in the column
    ['= 12', '', '=', '12'],
  ])('%s', (tex, lhs, rel, rhs) => {
    expect(splitRelation(tex)).toEqual({ lhs, rel, rhs });
  });

  test.each([
    ['an expression', '3x + 2'],
    ['a sign only inside a group', '\\frac{a = 1}{2}'],
    ['a sign only inside a fence', '\\left(x = 2\\right)'],
    ['a sign only inside brackets', '(x = 2)'],
    ['nothing after the sign yet', 'x ='],
    ['a multi-line system', '\\begin{aligned} 2x + y &= 6 \\\\ x - y &= 0 \\end{aligned}'],
    ['an alignment tab', 'x &= 4'],
    ['ASCII <=', 'a <= b'],
    ['ASCII =>', 'x => y'],
    ['ASCII !=', 'a != b'],
    ['an arrow', 'x -> 5'],
    ['\\not', 'a \\not= b'],
    ['empty', ''],
    ['null', null],
  ])('left whole: %s', (_name, tex) => {
    expect(splitRelation(tex)).toBeNull();
  });

  test('\\left and \\leftarrow are not \\le', () => {
    expect(splitRelation('\\left|x\\right| + 1')).toBeNull();
    expect(splitRelation('x \\leftarrow 3')).toBeNull();
  });

  test('the pieces put back together are the line', () => {
    for (const tex of ['3(x + 2) - 5 = 2x + 9', 'x \\le -4', '\\sqrt{x + 1} = 3']) {
      const p = splitRelation(tex);
      expect(`${p.lhs} ${p.rel} ${p.rhs}`.replace(/\s+/g, '')).toBe(tex.replace(/\s+/g, ''));
    }
  });
});

describe('the card lays the three pieces in shared columns', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../../public/css/living-workspace.css'), 'utf8');
  const block = css.slice(css.indexOf('@supports (grid-template-columns: subgrid)'));

  test('the tracks belong to the card and reach each line by subgrid', () => {
    expect(block).toMatch(/\.lws-card\s*\{[^}]*grid-template-columns:\s*56px auto auto minmax\(0, 1fr\)/);
    for (const sel of ['.lws-card-head', '.lws-card-body > .lws-step', '.lws-step-main', '.lws-card-problem.is-eq', '.lws-step-tex.is-eq']) {
      expect(block).toContain(sel);
    }
    expect(block).toMatch(/display:\s*grid;\s*grid-template-columns:\s*subgrid/);
  });

  test('no gap of its own anywhere down the chain (a 10px gap moved the answer row 5px)', () => {
    expect(block).toMatch(/\.lws-card-body > \.lws-step, \.lws-card-body > \.lws-step > \.lws-step-main\s*\{\s*gap:\s*0/);
  });

  test('left side is right-aligned against the sign', () => {
    expect(block).toMatch(/\.lws-eq-lhs\s*\{[^}]*text-align:\s*right/);
  });
});

/**
 * [FRACTION:compare=…] in the signed-in chat and on the landing preview
 * (QA on #1943, 2026-11-25).
 *
 * The comparison drew NOTHING for a fraction over one whole (5/4 vs 3/2), for
 * a fifth fraction, and nobody told the tutor — so "notice the bars…" stood
 * over no bars. Now: a fraction over one whole is drawn as whole bars of the
 * same width, the list may hold six, and the limits that remain are stated to
 * the model from the renderer's own numbers.
 *
 * The renderer is browser code inside a class; these tests run the real method
 * source against the real parser.
 */
const fs = require('fs');
const path = require('path');

const VTP = require('../../public/js/visualTokenParser');
const { fractionList, FRACTION_LIMITS } = VTP;
const { buildVisualDirective } = require('../../utils/pipeline/visualDirective');

const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

// The real createFractionComparison, lifted out of the class.
const draw = (() => {
  const src = read('public/js/inlineChatVisuals.js');
  const at = src.indexOf('    createFractionComparison(paramStr, id) {');
  const end = src.indexOf('    // ==========================================\n    // PIE CHART', at);
  expect(at).toBeGreaterThan(0);
  const body = src.slice(src.indexOf('{', at) + 1, src.lastIndexOf('}', end));
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', 'paramStr', 'id', body);
  return (params) => fn({ VisualTokenParser: VTP }, params, 'fx');
})();

const rowsOf = (html) => html.split('<div class="icv-fcmp-row">').slice(1).map((row) => {
  const rects = row.match(/<rect [^>]*>/g) || [];
  return {
    pieces: rects.length,
    shaded: rects.filter((r) => !/fill="#e8e8e8"/.test(r)).length,
    wholes: new Set(rects.map((r) => r.match(/data-whole="(\d+)"/)[1])).size,
    width: Number(rects[0].match(/ width="([\d.]+)"/)[1]),
    viewBox: row.match(/viewBox="([^"]+)"/)[1],
    label: row.match(/aria-label="([^"]+)"/)[1],
  };
});

describe('a fraction bigger than one whole is drawn as whole bars', () => {
  test('compare=5/4,3/2 → two rows, two whole bars each, the right pieces shaded', () => {
    const rows = rowsOf(draw('compare=5/4,3/2'));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ pieces: 8, shaded: 5, wholes: 2 });
    expect(rows[1]).toMatchObject({ pieces: 4, shaded: 3, wholes: 2 });
    expect(rows[0].label).toBe('5 parts shaded across 2 whole bars, each cut into 4 equal parts');
  });

  test('every whole is the same width in every row, so the bars compare by eye', () => {
    const rows = rowsOf(draw('compare=1/2,7/3,5/4'));
    expect(rows.map((r) => r.wholes)).toEqual([1, 3, 2]);
    expect(rows.map((r) => r.pieces)).toEqual([2, 9, 8]);
    expect(rows.map((r) => r.shaded)).toEqual([1, 7, 5]);
    expect(new Set(rows.map((r) => r.viewBox)).size).toBe(1);
    // piece width × pieces per whole = one whole, the same in each row
    const whole = rows.map((r, i) => (r.width + 2) * [2, 3, 4][i]);
    expect(Math.max(...whole) - Math.min(...whole)).toBeLessThan(0.05);
  });

  test('exactly one whole, and exactly two, fill their bars and add no empty one', () => {
    expect(rowsOf(draw('compare=4/4,8/4'))).toMatchObject([
      { pieces: 4, shaded: 4, wholes: 1 },
      { pieces: 8, shaded: 8, wholes: 2 },
    ]);
  });

  test('proper fractions draw exactly as before: one 240-wide bar a row', () => {
    const html = draw('compare=2/3,3/4');
    const rows = rowsOf(html);
    expect(rows).toMatchObject([{ pieces: 3, shaded: 2, wholes: 1 }, { pieces: 4, shaded: 3, wholes: 1 }]);
    expect(rows[0].viewBox).toBe('0 0 240 30');
    expect(rows[0].label).toBe('2 of 3 equal parts shaded');
    expect(html).not.toMatch(/max-width/);
  });
});

describe('the cap is six fractions', () => {
  test('compare=1/2,1/3,1/4,1/5,1/6 → five rows', () => {
    const rows = rowsOf(draw('compare=1/2,1/3,1/4,1/5,1/6'));
    expect(rows.map((r) => r.pieces)).toEqual([2, 3, 4, 5, 6]);
    expect(rows.every((r) => r.shaded === 1)).toBe(true);
  });

  test('six draw; a seventh draws nothing', () => {
    expect(rowsOf(draw('compare=1/2,1/3,1/4,1/5,1/6,1/8'))).toHaveLength(6);
    expect(draw('compare=1/2,1/3,1/4,1/5,1/6,1/8,1/9')).toBe('');
  });
});

describe('no decimal and no verdict, whatever is drawn', () => {
  test.each(['compare=5/4,3/2', 'compare=2/3,3/4', 'compare=1/2,1/3,1/4,1/5,1/6', 'compare=7/3'])('%s', (params) => {
    const html = draw(params);
    expect(html).not.toBe('');
    expect(html).not.toMatch(/icv-fraction-decimal/);
    const text = html.replace(/<[^>]+>/g, ' ');
    expect(text).not.toMatch(/\d\.\d/);
    expect(text).not.toMatch(/bigger|greater|larger|smaller|less|equal to|[<>=]/i);
  });
});

describe('all or nothing for what bars cannot show', () => {
  test('the limits', () => {
    expect(FRACTION_LIMITS).toEqual({ count: 6, denom: 20, wholes: 3, improperDenom: 12 });
    expect(fractionList('compare=5/4,3/2')).toEqual([{ num: 5, denom: 4 }, { num: 3, denom: 2 }]);
    expect(fractionList('compare=7/3')).toEqual([{ num: 7, denom: 3 }]);
    expect(fractionList('compare=9/3')).toHaveLength(1);           // exactly three wholes
    expect(fractionList('compare=10/3,1/2')).toEqual([]);          // more than three wholes
    expect(fractionList('compare=5/4,3/16')).toEqual([]);          // over one whole → denominators ≤ 12
    expect(fractionList('compare=3/16,5/20')).toHaveLength(2);     // …but fine when none is
    expect(fractionList('compare=1/2,1/21')).toEqual([]);
  });

  test('genuinely invalid input draws nothing, never part of the list', () => {
    for (const params of ['compare=1/2,1/0', 'compare=1.5/2,1/3', 'compare=2/3,x/4', 'compare=1/2,-1/3', 'compare=1 1/2,3/4', 'compare=', 'numerator=3,denominator=4']) {
      expect(fractionList(params)).toEqual([]);
      expect(draw(params)).toBe('');
    }
  });
});

describe('the tutor is told the limits, from the renderer\'s own numbers', () => {
  const L = FRACTION_LIMITS;
  const says = (text) => {
    expect(text).toContain(`${L.count} fractions`);
    expect(text).toContain(`denominators up to ${L.denom}`);
    expect(text).toContain(`at most ${L.wholes} wholes`);
    expect(text).toMatch(new RegExp(`(denominators up to|must be) ${L.improperDenom}\\b`));
    expect(text).toMatch(/NOTHING/);
  };

  test('the visual capabilities reference', () => {
    const src = read('utils/visualCapabilities.js');
    says(src.split('\n').find((line) => line.startsWith('[FRACTION:numerator=')));
  });

  test('the DRAW IT directive for a fractions turn', () => {
    says(buildVisualDirective({ action: 'x', studentText: 'which is bigger, 5/4 or 3/2?' }));
  });
});

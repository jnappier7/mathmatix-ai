/**
 * The act-enhanced bank's figures and tables (scripts/addActEnhancedFigures.js,
 * utils/actFigures.js).
 *
 * The bank shipped with no figure at all, so a form averaged 1.9 visual items
 * against about ten on an official form (external audit, 2026-10-05). These
 * tests pin what the drawn figures must be: present, well-formed, small,
 * self-grounded, described for screen readers, and never showing the answer.
 */
const { FAMILIES, figureFor } = require('../../scripts/addActEnhancedFigures');
const { explainItem } = require('../../utils/actItemExplainers');

const items = require('../../seeds/act-enhanced/act-items.generated.json');
const withFigure = items.filter((it) => it.svg);
const tables = items.filter((it) => /^The table below/.test(it.prompt));

// Visible text in an SVG, i.e. what a student can read off the figure.
// Strict enough for generated SVG: every tag closes in order, every attribute
// is quoted, and no stray "<" or "&" sits in text. (jsdom does not load under
// this repo's jest; see tests/unit for the other no-DOM checks.)
function wellFormed(svg) {
  const stack = [];
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/y;
  let i = 0;
  while (i < svg.length) {
    if (svg[i] === '<') {
      tag.lastIndex = i;
      const m = tag.exec(svg);
      if (!m) return false;
      const [, close, name, , self] = m;
      if (close) { if (stack.pop() !== name) return false; } else if (!self) stack.push(name);
      i = tag.lastIndex;
    } else {
      const next = svg.indexOf('<', i);
      const textRun = svg.slice(i, next < 0 ? svg.length : next);
      if (/&(?!(amp|lt|gt|quot|#\d+);)/.test(textRun)) return false;
      i = next < 0 ? svg.length : next;
    }
  }
  return stack.length === 0;
}

test('the well-formedness check rejects broken markup', () => {
  expect(wellFormed('<svg><text x="1">a</text></svg>')).toBe(true);
  expect(wellFormed('<svg><text>a</svg>')).toBe(false);
  expect(wellFormed('<svg><text x=1>a</text></svg>')).toBe(false);
  expect(wellFormed('<svg><text>a & b</text></svg>')).toBe(false);
});

const svgText = (svg) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

test('the bank carries its figures and tables (a ratchet: only up)', () => {
  expect(withFigure.length).toBeGreaterThanOrEqual(182);
  expect(tables.length).toBeGreaterThanOrEqual(28);
});

test('the bank file is what the script produces (no hand edits drift from it)', () => {
  for (const it of items) {
    const f = figureFor(it);
    if (!f) continue;
    expect(f.prompt).toBeUndefined();          // every table stem is already converted
    expect(it.svg).toBe(f.svg);
    expect(it.figureAlt).toBe(f.figureAlt);
  }
});

describe.each(withFigure.map((it) => [it.problemId, it]))('figure %s', (_id, it) => {
  test('is a well-formed, self-grounded, compact SVG', () => {
    expect(wellFormed(it.svg)).toBe(true);
    expect(it.svg.startsWith('<svg')).toBe(true);           // the runner's guard: /^<svg[\s>]/
    expect(it.svg).not.toMatch(/<script|NaN|undefined|Infinity/);
    expect(it.svg).toMatch(/<rect width="\d+" height="\d+" fill="#ffffff"\/>/);  // paints its own ground
    // A ±20 grid is the largest (~8.5 KB); a matplotlib figure is ~30 KB.
    expect(it.svg.length).toBeLessThan(12000);
  });

  test('has a written description', () => {
    expect(typeof it.figureAlt).toBe('string');
    expect(it.figureAlt.length).toBeGreaterThan(20);
    expect(it.figureAlt).not.toMatch(/NaN|undefined/);
  });

  test('does not print the answer', () => {
    const key = String(it.answer.value).replace(/-/g, '−');
    const labels = svgText(it.svg).map((t) => t.replace(/°$/, ''));
    // A coordinate label can legitimately contain any small integer, and a
    // midpoint/line key is never a bare number, so check the labels whole.
    expect(labels).not.toContain(key);
    expect(labels).not.toContain(String(it.answer.value));
  });
});

test('every table item still explains, and the table renders as a table', () => {
  for (const it of tables) {
    expect(explainItem(it).status).toBe('ok');
    const rows = it.prompt.split('\n').filter((l) => / \| /.test(l));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const widths = new Set(rows.map((r) => r.split(' | ').length));
    expect(widths.size).toBe(1);   // public/js/act-test.js stemHtml needs equal widths
  }
});

test('every family pattern matches something in the bank', () => {
  // A pattern that matches nothing is a typo, and its family silently loses
  // its figures. The table patterns match the ORIGINAL sentence stems, which
  // the bank no longer holds, so they are checked against the explainer.
  for (const fam of FAMILIES.filter((f) => f.fig)) {
    expect([fam.id, items.some((it) => fam.re.test(it.prompt))]).toEqual([fam.id, true]);
  }
});

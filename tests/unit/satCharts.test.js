/**
 * SAT figures (utils/satCharts.js, scripts/refreshSatFigures.js).
 *
 * QA pass, 2026-10-13: the SAT bank's bar graphs and scatterplots were
 * matplotlib renders with tiny tick labels and gridlines every 2 under odd
 * bar heights, and all 148 SAT figures reached a screen reader as "Figure for
 * this question". Now graphs are drawn in the house SVG style, and every
 * figure carries a description stating what a sighted student reads off it.
 */
const fs = require('fs');
const path = require('path');
const S = require('../../utils/satCharts');
const { figureSpecs, refresh } = require('../../scripts/refreshSatFigures');

const BANK = JSON.parse(fs.readFileSync(path.join(__dirname, '../../seeds/sat-items.generated.json'), 'utf8'));
const specs = figureSpecs();

test('every SAT figure in the bank has a written description, and the bank is up to date with the renderer', () => {
  const withSvg = BANK.filter((p) => p.svg);
  expect(withSvg.length).toBeGreaterThan(100);
  withSvg.forEach((p) => {
    expect(p.figureAlt).toBeTruthy();
    expect(p.figureAlt).not.toMatch(/undefined|NaN/);
  });
  const copy = JSON.parse(JSON.stringify(BANK));
  expect(refresh(copy, specs)).toEqual({ svgs: 0, alts: 0 });   // run scripts/refreshSatFigures.js
});

test('every bar ends on a gridline, or carries its value', () => {
  for (const [, fig] of specs) {
    if (fig.kind !== 'bar') continue;
    const { step, labelBars } = S.barScale(fig.params.values);
    if (!labelBars) fig.params.values.forEach((v) => expect(v % step).toBe(0));
    const { svg, alt } = S.barChart(fig.params);
    fig.params.values.forEach((v, i) => expect(alt).toContain(`${fig.params.labels[i]}: ${v}`));
    if (labelBars) fig.params.values.forEach((v) => expect(svg).toContain(`>${v}</text>`));
  }
  // The QA example: bars of 3, 7, 5, 3, 2 are read on a scale marked every 1.
  expect(S.barScale([3, 7, 5, 3, 2])).toMatchObject({ step: 1, max: 7, labelBars: false });
});

test('scatterplots keep every point inside the axes and list them', () => {
  for (const [, fig] of specs) {
    if (fig.kind !== 'scatter') continue;
    const xs = fig.params.pts.map((p) => p[0]);
    const ys = fig.params.pts.map((p) => p[1]);
    const X = S.axisFor(Math.min(...xs), Math.max(...xs), 12);
    const Y = S.axisFor(Math.min(...ys), Math.max(...ys), 8);
    expect(X.min).toBeLessThanOrEqual(Math.min(...xs));
    expect(X.max).toBeGreaterThanOrEqual(Math.max(...xs));
    expect(Y.min).toBeLessThanOrEqual(Math.min(...ys));
    expect(Y.max).toBeGreaterThanOrEqual(Math.max(...ys));
    const { alt } = S.scatterPlot(fig.params);
    expect(alt).toContain(`${fig.params.pts.length} points`);
  }
});

test('graphs name the grid points they pass through, and readable tick labels', () => {
  const g = S.functionGraph({ expr: '-2*x + 6', xmin: -3, xmax: 7, ymin: -4, ymax: 8 });
  expect(g.alt).toMatch(/^Graph of a line/);
  expect(g.alt).toContain('(3, 0)');
  expect(g.alt).toContain('(0, 6)');
  // Tick labels are at least 17 user units on a 520-wide canvas (matplotlib's were 6pt on ~230pt).
  const sizes = [...g.svg.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(17);
  expect(g.svg).toMatch(/viewBox="0 0 520 /);
  const r = S.regionGraph({ expr1: 'x - 2', expr2: '-x + 6', xmin: -2, xmax: 8, ymin: -4, ymax: 8, a: -2, b: 4 });
  expect(r.alt).toContain('They meet at (4, 2)');
  expect(r.alt).toContain('shaded');
});

test('tables and geometry keep their drawing but gain a description', () => {
  expect(S.tableAlt({ headers: ['x', 'f(x)'], rows: [['1', '8'], ['3', '14']] })).toBe('Table with columns x, f(x). x 1, f(x) 8; x 3, f(x) 14.');
  const tri = S.geometryAlt({ shape: 'triangle', labels: { horizontal_leg: '12', vertical_leg: '9', hypotenuse: 'h' } });
  expect(tri).toContain('horizontal leg (bottom) is labeled 12');
  expect(tri).toContain('hypotenuse is labeled h');
});

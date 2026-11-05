/**
 * The touchdown splash (public/js/live-drill/common.js watchTouchdowns): when both teams score on
 * the same state update, BOTH are announced, split left and right. It used to write one panel per
 * team into the same overlay, so the second replaced the first and only one team was ever shown
 * (owner, 2026-11-05).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '../../public/js/live-drill/common.js'), 'utf8');

function load() {
  const classes = new Set();
  const td = { innerHTML: '', hidden: true, classList: { toggle(c, on) { if (on) classes.add(c); else classes.delete(c); }, contains: (c) => classes.has(c) } };
  const document = { getElementById: (id) => (id === 'td' ? td : null) };
  const window = {};
  vm.runInNewContext(SRC, { window, document, setTimeout, clearTimeout, Date });
  return { L: window.LiveDrill, td };
}
const state = (red, blue, extra = {}) => ({ teams: [{ name: 'Red', pts: red }, { name: 'Blue', pts: blue }], ...extra });
const panels = (td) => [...td.innerHTML.matchAll(/<div class="(t\d)">([^<]*)<br>([^<]*)<\/div>/g)].map((m) => [m[1], m[2], m[3]]);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('one team scores: one panel, no split', () => {
  const { L, td } = load();
  L.watchTouchdowns(state(0, 0), state(7, 0));
  expect(td.hidden).toBe(false);
  expect(panels(td)).toEqual([['t0', 'Touchdown', 'Red']]);
  expect(td.classList.contains('split')).toBe(false);
  jest.advanceTimersByTime(1700);
  expect(td.hidden).toBe(true);
});

test('both teams score on the same update: both announced, split, Red left and Blue right', () => {
  const { L, td } = load();
  L.watchTouchdowns(state(7, 0), state(14, 7));
  expect(panels(td)).toEqual([['t0', 'Touchdown', 'Red'], ['t1', 'Touchdown', 'Blue']]);
  expect(td.classList.contains('split')).toBe(true);
  jest.advanceTimersByTime(1700);
  expect(td.hidden).toBe(false); // a split splash stays up a little longer
  jest.advanceTimersByTime(600);
  expect(td.hidden).toBe(true);
  // the next single score drops the split again
  L.watchTouchdowns(state(14, 7), state(14, 14));
  expect(td.classList.contains('split')).toBe(false);
  expect(panels(td)).toEqual([['t1', 'Touchdown', 'Blue']]);
});

test('a pick six is announced as one, on either side', () => {
  const { L, td } = load();
  L.watchTouchdowns(state(0, 0), state(7, 7, { round: { pickSix: [true, false] } }));
  expect(panels(td)).toEqual([['t0', 'Pick six', 'Red'], ['t1', 'Touchdown', 'Blue']]);
});

test('no score, no splash; a team name is escaped', () => {
  const { L, td } = load();
  L.watchTouchdowns(state(7, 7), state(7, 7));
  expect(td.hidden).toBe(true);
  L.watchTouchdowns({ teams: [{ name: 'x', pts: 0 }, { name: 'y', pts: 0 }] }, { teams: [{ name: '<b>Red</b>', pts: 7 }, { name: 'y', pts: 0 }] });
  expect(td.innerHTML).toContain('&lt;b&gt;Red&lt;/b&gt;');
});

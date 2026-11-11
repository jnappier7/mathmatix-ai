/**
 * Visual Motion (public/js/visual-motion.js): the ORDER a number line, an inequality or a slope
 * triangle is told in. The order is the teaching — a rise drawn after its run, or two hops landing
 * together, says something different from what the tutor wrote.
 */
const fs = require('fs');
const path = require('path');
const { schedule, totalMs } = require('../../public/js/visual-motion');

const pub = (p) => fs.readFileSync(path.join(__dirname, '../../public', p), 'utf8');
const at = (plan, m, i) => plan.find((s) => s.part.m === m && (i == null || Number(s.part.i) === i));

describe('visual motion: the order a picture is told in', () => {
  test('hops play one after another, each start → arc → landing', () => {
    const parts = [];
    [0, 1].forEach((i) => ['hop-arc', 'hop-land', 'hop-start', 'hop-label'].forEach((m) => parts.push({ m, i: String(i) })));
    const plan = schedule(parts);
    expect(plan).toHaveLength(8);
    for (const i of [0, 1]) {
      expect(at(plan, 'hop-start', i).delay).toBeLessThan(at(plan, 'hop-arc', i).delay);
      expect(at(plan, 'hop-arc', i).delay).toBeLessThan(at(plan, 'hop-land', i).delay);
      // it lands as the arc finishes, not before
      expect(at(plan, 'hop-land', i).delay).toBeGreaterThanOrEqual(at(plan, 'hop-arc', i).delay + at(plan, 'hop-arc', i).dur - 60);
    }
    // the second hop does not start until the first has landed
    expect(at(plan, 'hop-start', 1).delay).toBeGreaterThanOrEqual(at(plan, 'hop-land', 0).delay + at(plan, 'hop-land', 0).dur - 30);
  });

  test('an inequality: the endpoint first, then the shading sweeps out from it', () => {
    const plan = schedule([{ m: 'sweep' }, { m: 'after-sweep' }, { m: 'endpoint' }]);
    expect(at(plan, 'endpoint').delay).toBe(0);
    expect(at(plan, 'endpoint').kind).toBe('drop');
    expect(at(plan, 'sweep').delay).toBeGreaterThan(0);
    expect(at(plan, 'sweep').kind).toBe('sweep');
    expect(at(plan, 'after-sweep').delay).toBeGreaterThan(at(plan, 'sweep').delay);
  });

  test('a slope: first point, the line, RISE then RUN, each label with its side, then the second point', () => {
    const plan = schedule(['to', 'run-label', 'run', 'rise-label', 'rise', 'grow', 'from'].map((m) => ({ m })));
    const order = ['from', 'grow', 'rise', 'rise-label', 'run', 'run-label', 'to'].map((m) => at(plan, m).delay);
    expect(order).toEqual(order.slice().sort((a, b) => a - b));
    expect(new Set(order).size).toBe(order.length);
    // the run does not begin until the rise is fully drawn
    expect(at(plan, 'run').delay).toBeGreaterThanOrEqual(at(plan, 'rise').delay + at(plan, 'rise').dur);
    ['grow', 'rise', 'run'].forEach((m) => expect(at(plan, m).kind).toBe('grow'));
  });

  test('points arrive left to right by index, each label just after its point', () => {
    const plan = schedule([{ m: 'point', i: '2' }, { m: 'point', i: '0' }, { m: 'point-label', i: '0' }, { m: 'point', i: '1' }]);
    expect(at(plan, 'point', 0).delay).toBeLessThan(at(plan, 'point', 1).delay);
    expect(at(plan, 'point', 1).delay).toBeLessThan(at(plan, 'point', 2).delay);
    expect(at(plan, 'point-label', 0).delay).toBeGreaterThan(at(plan, 'point', 0).delay);
  });

  test('untagged or unknown parts are never staged, and a busy picture still ends in a few seconds', () => {
    expect(schedule([{ m: 'mystery' }])).toEqual([]);
    const five = [];
    for (let i = 0; i < 5; i++) ['hop-start', 'hop-arc', 'hop-land', 'hop-label'].forEach((m) => five.push({ m, i: String(i) }));
    expect(totalMs(schedule(five))).toBeLessThan(4500);
  });
});

describe('visual motion: wiring', () => {
  const visuals = pub('js/inlineChatVisuals.js');
  test('the renderers tag every part the schedule knows', () => {
    ['hop-arc', 'hop-land', 'hop-start', 'hop-label', 'point', 'point-label', 'sweep', 'after-sweep', 'endpoint',
      'grow', 'rise', 'rise-label', 'run', 'run-label', 'from', 'to'].forEach((m) => {
      expect(visuals).toContain(`data-m="${m}"`);
    });
  });
  test('a line that grows says where it grows from (the rise starts at the first point)', () => {
    expect(visuals).toMatch(/data-m="rise" data-ox="\$\{startX\}" data-oy="\$\{startY\}"/);
    expect(visuals).toMatch(/data-m="run" data-ox="\$\{startX\}" data-oy="\$\{endY\}"/);
  });
  test('chat.html loads it; the reply path plays it after the visuals are initialised; history does not', () => {
    expect(pub('chat.html')).toMatch(/<script defer src="\/js\/visual-motion\.js/);
    const script = pub('js/script.js');
    expect(script.match(/VisualMotion\.play\(/g)).toHaveLength(1);
    expect(script).toMatch(/initializeVisuals\(latestMessage\);[\s\S]{0,400}VisualMotion\.play\(latestMessage\)/);
  });
  test('reduced motion: the staging and the graph engine both stand down', () => {
    expect(pub('js/visual-motion.js')).toMatch(/prefers-reduced-motion/);
    expect(pub('js/mathGraph.js')).toMatch(/_startAnimation\(\) \{[\s\S]{0,500}prefers-reduced-motion/);
  });
});

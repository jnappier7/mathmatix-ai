// A plotted point must come from the conversation. Fixture = the 2026-10-15
// student audit: five correct systems answers, and a tool call (fired five
// times) plotting five INVENTED points.
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';
const { screenVisualCalls, extractPairs, toNumber } = require('../../utils/visualGrounding');
const { resolveToolCalls } = require('../../utils/visualTools');

const PROBLEMS = String.raw`**Question 1:** \[ \begin{align*} y &= 2x + 3 \\ 3x + y &= 12 \end{align*} \]
**Question 2:** \[ \begin{align*} y &= -x + 4 \\ 2x + 3y &= 6 \end{align*} \]
**Question 3:** \[ \begin{align*} y &= 3x - 1 \\ x + 2y &= 7 \end{align*} \]
**Question 4:** \[ \begin{align*} y &= \frac{1}{2}x + 1 \\ 4x - y &= 5 \end{align*} \]
**Question 5:** \[ \begin{align*} y &= -2x + 10 \\ x - y &= 3 \end{align*} \]`;
const STUDENT = '1) 3x+(2x+3)=12 -> 5x=9 -> x=9/5, y=33/5. 2) 2x+3(-x+4)=6 -> -x=-6 -> x=6,y=-2. 3) x+2(3x-1)=7 -> 7x=9 -> x=9/7,y=20/7. 4) 4x-(x/2+1)=5 -> 7x/2=6 -> x=12/7,y=13/7. 5) x-(-2x+10)=3 -> 3x=13 -> x=13/3,y=4/3.';
const texts = [PROBLEMS, STUDENT];
const call = (points) => ({ type: 'function', function: { name: 'render_points_plot', arguments: JSON.stringify({ points }) } });

const AUDIT_POINTS = [[1.8, 3.6], [1.5, -2], [1.2857142857142858, 5.714285714285714], [1.7142857142857142, 2.857142857142857], [4.333333333333333, 4.333333333333333]];

test('the audit case: five identical invented plots → nothing rendered', () => {
  const { calls, dropped } = screenVisualCalls(Array(5).fill(call(AUDIT_POINTS)), { texts });
  expect(calls).toEqual([]);
  expect(dropped.filter((d) => d.reason === 'duplicate')).toHaveLength(4);
  expect(dropped[0].reason).toMatch(/ungrounded/);
});

test("a plot of the student's actual answers is kept, labels rounded", () => {
  const { calls } = screenVisualCalls([call([[9 / 5, 33 / 5], [6, -2], [9 / 7, 20 / 7], [12 / 7, 13 / 7], [13 / 3, 4 / 3]])], { texts });
  expect(JSON.parse(calls[0].function.arguments).points).toEqual([[1.8, 6.6], [6, -2], [1.286, 2.857], [1.714, 1.857], [4.333, 1.333]]);
});

test('points that satisfy an equation in the conversation are grounded (a real line plot)', () => {
  const { calls } = screenVisualCalls([call([[0, 3], [1, 5], [2, 7]])], { texts: [PROBLEMS] });
  expect(calls).toHaveLength(1);
});

test('mixed plot keeps only the grounded points', () => {
  const { calls } = screenVisualCalls([call([[1.8, 6.6], [1.8, 3.6]])], { texts });
  expect(JSON.parse(calls[0].function.arguments).points).toEqual([[1.8, 6.6]]);
});

test('a lone x = 6 does not ground (6, anything)', () => {
  const { calls } = screenVisualCalls([call([[6, 99]])], { texts: ['x = 6'] });
  expect(calls).toEqual([]);
});

test('non-points tools pass through, de-duplicated', () => {
  const graph = { function: { name: 'render_function_graph', arguments: '{"fn":"x^2"}' } };
  const { calls } = screenVisualCalls([graph, graph], { texts });
  expect(calls).toHaveLength(1);
});

test('pair extraction reads fractions, \\frac, decimals and negatives', () => {
  expect(extractPairs(String.raw`(\frac{9}{5}, -2) and x = 1.5, y = 3/4`).map((p) => p.map((v) => +v.toFixed(3)))).toEqual([[1.8, -2], [1.5, 0.75]]);
  expect(toNumber('-\\dfrac{1}{4}')).toBe(-0.25);
});

describe('resolveToolCalls', () => {
  test('identical visuals in one turn collapse to one tag', () => {
    const { tags } = resolveToolCalls([call([[1, 2]]), call([[1, 2]])]);
    expect(tags).toEqual(['[POINTS:points=(1,2)]']);
  });
  test('labels are rounded, not 16-digit floats', () => {
    const { tags } = resolveToolCalls([call([[9 / 7, 20 / 7]])]);
    expect(tags).toEqual(['[POINTS:points=(1.286,2.857)]']);
  });
});

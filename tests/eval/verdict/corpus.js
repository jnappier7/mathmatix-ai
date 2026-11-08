/**
 * Verdict-accuracy corpus: problems as a tutor poses them, each with its right
 * answer written the ways students actually write it, and the wrong answers
 * students actually give.
 *
 * Every expected verdict here was worked by hand. A case that is a judgment
 * call (an incomplete root set, a missing +C) is left out rather than guessed:
 * the eval's job is to count confident verdicts that are WRONG, so its own key
 * must be beyond dispute.
 *
 * Shape of a problem:
 *   id, topic   — reporting labels
 *   pose        — the tutor's line that poses it (what the student is answering)
 *   v, varName  — the canonical value and the letter it is "x = …" of (null when
 *                 the answer is an expression or a bare number with no variable)
 *   correct     — extra right-answer forms beyond the generated styles
 *   wrong       — common wrong answers, each as the student would type it
 *   noStyles    — skip generated styles (conceptual / polarity / multi-value)
 *   before      — earlier tutor turns, oldest first, when the pose is a
 *                 SUB-question that builds on them ("what would u'v look like?")
 */

const P = [
  // ── Linear equations ──
  { id: 'lin-1', topic: 'linear', pose: 'Try this one: Solve \\(3x - 7 = 11\\).', v: '6', varName: 'x',
    correct: ['3x = 18\nx = 6', 'add 7 to get 3x = 18 so x = 6'], wrong: ['x = 4/3', 'x = -6', '3x = 4\nx = 4/3'] },
  { id: 'lin-2', topic: 'linear', pose: "Try this one: What's \\(2(x - 3) = 4 + x\\)?", v: '10', varName: 'x',
    correct: ['2x - 6 = 4 + x\nx = 10'], wrong: ['x = 7', '2x - 3 = 4 + x so x = 7', 'x = 1'] },
  { id: 'lin-3', topic: 'linear', pose: 'Try this one: Solve \\(5x + 2 = 3x - 8\\).', v: '-5', varName: 'x',
    correct: ['2x = -10\nx = -5'], wrong: ['x = 5', 'x = -3'] },
  { id: 'lin-4', topic: 'linear', pose: 'Try this one: Solve \\(\\frac{x}{4} + 3 = 7\\).', v: '16', varName: 'x',
    correct: [], wrong: ['x = 1', 'x = 40'] },
  { id: 'lin-5', topic: 'linear', pose: 'Try this one: Solve \\(0.5x - 1.5 = 2\\).', v: '7', varName: 'x',
    correct: [], wrong: ['x = 1', 'x = 1.75'] },
  { id: 'lin-6', topic: 'linear', pose: 'Try this one: Solve \\(-2x + 9 = 1\\).', v: '4', varName: 'x',
    correct: ['-2x = -8\nx = 4'], wrong: ['x = -4', 'x = 5'] },

  // ── Fractions ──
  { id: 'frac-1', topic: 'fractions', pose: "Try this one: What's \\(\\frac{2}{3} + \\frac{1}{4}\\)?", v: '11/12', varName: null,
    vtex: '\\frac{11}{12}', correct: ['8/12 + 3/12 = 11/12'], wrong: ['3/7', '3/12'] },
  { id: 'frac-2', topic: 'fractions', pose: "Try this one: What's \\(\\frac{3}{4} \\times \\frac{2}{5}\\)?", v: '3/10', varName: null,
    vtex: '\\frac{3}{10}', correct: ['6/20', '0.3'], wrong: ['5/9', '15/8'] },
  { id: 'frac-3', topic: 'fractions', pose: "Try this one: What's \\(\\frac{5}{6} - \\frac{1}{3}\\)?", v: '1/2', varName: null,
    vtex: '\\frac{1}{2}', correct: ['3/6', '0.5'], wrong: ['4/3', '2/3'] },
  { id: 'frac-4', topic: 'fractions', pose: "Try this one: What's \\(1\\frac{1}{2} \\div \\frac{3}{4}\\)?", v: '2', varName: null,
    correct: ['3/2 x 4/3 = 2'], wrong: ['9/8', '1 1/8'] },
  // Mixed numbers in prose and in LaTeX — each pose once keyed wrong (2/3, 1/8, 22/3).
  { id: 'frac-5', topic: 'fractions', pose: 'Try this one: What is 2 1/3 divided by 1/2?', v: '4 2/3', varName: null,
    correct: ['14/3'], wrong: ['7/6', '1 1/6'] },
  { id: 'frac-6', topic: 'fractions', pose: "Try this one: What's \\(2\\frac{1}{3} + 1\\frac{1}{2}\\)?", v: '3 5/6', varName: null,
    correct: ['23/6'], wrong: ['3 2/5', '3 2/6'] },

  // ── Integers, order of operations, powers ──
  { id: 'int-1', topic: 'arithmetic', pose: "Try this one: What's \\(-8 + 13\\)?", v: '5', varName: null, correct: [], wrong: ['-5', '21'] },
  { id: 'int-2', topic: 'arithmetic', pose: "Try this one: What's \\(-6 \\times -7\\)?", v: '42', varName: null, correct: [], wrong: ['-42', '-13'] },
  { id: 'oo-1', topic: 'arithmetic', pose: "Try this one: What's \\(24 - 6 \\div 3\\)?", v: '22', varName: null, correct: ['6/3 = 2 so 24 - 2 = 22'], wrong: ['6'] },
  { id: 'oo-2', topic: 'arithmetic', pose: "Try this one: What's \\(3 + 4 \\times 2\\)?", v: '11', varName: null, correct: [], wrong: ['14'] },
  { id: 'pow-1', topic: 'arithmetic', pose: "Try this one: What's \\(2^5\\)?", v: '32', varName: null, correct: [], wrong: ['10', '25'] },
  { id: 'pow-2', topic: 'arithmetic', pose: "Try this one: What's \\((-3)^2\\)?", v: '9', varName: null, correct: [], wrong: ['-9', '-6'] },

  // ── Percent & decimals ──
  { id: 'pct-1', topic: 'percent', pose: "Try this one: What's 15% of 80?", v: '12', varName: null, correct: ['0.15 x 80 = 12'], wrong: ['1200', '5.33'] },
  { id: 'dec-1', topic: 'decimals', pose: "Try this one: What's \\(3.6 \\div 0.4\\)?", v: '9', varName: null, correct: [], wrong: ['0.9', '90'] },
  { id: 'dec-2', topic: 'decimals', pose: "Try this one: What's \\(0.25 \\times 0.4\\)?", v: '0.1', varName: null, correct: ['.1', '0.10'], wrong: ['1', '0.01'] },

  // ── Radicals & exponent rules ──
  { id: 'rad-1', topic: 'radicals', pose: 'Try this one: Simplify \\(\\sqrt{50}\\).', v: '5√2', varName: null,
    vtex: '5\\sqrt{2}', correct: ['5sqrt(2)', '5 root 2'], wrong: ['25√2', '2√5'] },
  { id: 'exp-1', topic: 'exponents', pose: 'Try this one: Simplify \\(x^3 \\cdot x^4\\).', v: 'x^7', varName: null, correct: [], wrong: ['x^12', 'x^1'] },
  { id: 'exp-2', topic: 'exponents', pose: 'Try this one: Simplify \\((2x^2)^3\\).', v: '8x^6', varName: null, correct: [], wrong: ['6x^6', '2x^6', '8x^5'] },

  // ── Quadratics & polynomials ──
  { id: 'quad-1', topic: 'quadratics', pose: 'Try this one: Solve \\(x^2 - 5x + 6 = 0\\).', noStyles: true,
    correct: ['x = 2 or x = 3', 'x = 2, 3', '2 and 3', 'x=3 or x=2', '(x-2)(x-3) = 0\nx = 2 or x = 3'],
    wrong: ['x = -2 or x = -3', 'x = 6', 'x = 1 or x = 6'] },
  { id: 'quad-2', topic: 'quadratics', pose: 'Try this one: Solve \\(x^2 = 49\\).', noStyles: true,
    correct: ['x = 7 or x = -7', 'x = ±7', 'x = -7, 7'], wrong: ['x = 24.5', 'x = 49/2'] },
  { id: 'fac-1', topic: 'factoring', pose: 'Try this one: Factor \\(x^2 + 7x + 12\\).', noStyles: true,
    correct: ['(x+3)(x+4)', '(x + 4)(x + 3)', 'its (x+3)(x+4)'], wrong: ['(x+6)(x+2)', '(x+3)(x-4)', '(x-3)(x-4)'] },
  { id: 'exp-poly', topic: 'polynomials', pose: 'Try this one: Expand \\((x + 5)(x - 2)\\).', v: 'x^2 + 3x - 10', varName: null,
    correct: ['x^2 - 2x + 5x - 10 = x^2 + 3x - 10'], wrong: ['x^2 - 10', 'x^2 + 7x - 10', 'x^2 - 3x - 10'] },

  // ── Systems ──
  { id: 'sys-1', topic: 'systems', pose: 'Try this one: Solve the system \\(x + y = 10\\) and \\(x - y = 4\\).', noStyles: true,
    correct: ['x = 7, y = 3', '(7, 3)', 'x=7 and y=3', '2x = 14 so x = 7, then y = 3'], wrong: ['(3, 7)', 'x = 6, y = 4', 'x = 7, y = -3'] },

  // ── Linear functions ──
  { id: 'slope-1', topic: 'functions', pose: "Try this one: What's the slope between \\((1, 2)\\) and \\((3, 8)\\)?", v: '3', varName: 'm',
    correct: ['6/2 = 3', '(8-2)/(3-1) = 3'], wrong: ['1/3', '5'] },
  { id: 'slope-2', topic: 'functions', pose: "Try this one: What's the slope of \\(y = -4x + 7\\)?", v: '-4', varName: 'm', correct: [], wrong: ['7', '4'] },
  { id: 'eval-1', topic: 'functions', pose: 'Try this one: If \\(f(x) = 2x^2 - 3\\), find \\(f(-2)\\).', v: '5', varName: null,
    correct: ['f(-2) = 5', '2(4) - 3 = 5'], wrong: ['-11', '13'] },

  // ── Geometry ──
  { id: 'geo-1', topic: 'geometry', pose: "Try this one: What's the area of a triangle with base 10 and height 6?", v: '30', varName: null,
    correct: ['30 square units', 'A = 30'], wrong: ['60', '16'] },
  { id: 'geo-2', topic: 'geometry', pose: "Try this one: A right triangle has legs 6 and 8. What's the hypotenuse?", v: '10', varName: 'c',
    correct: ['36 + 64 = 100 so c = 10'], wrong: ['14', '100'] },
  { id: 'geo-3', topic: 'geometry', pose: "Try this one: What's the circumference of a circle with radius 3?", v: '6π', varName: null,
    vtex: '6\\pi', correct: ['6pi', '2π(3) = 6π'], wrong: ['9π', '3π', '6'] },  // '6': the π once dropped out and 6 graded right
  { id: 'geo-4', topic: 'geometry', pose: "Try this one: What's the supplement of a 128° angle?", v: '52', varName: null,
    correct: ['52°', '52 degrees', '180 - 128 = 52'], wrong: ['62', '232'] },
  { id: 'geo-5', topic: 'geometry', pose: "Try this one: What's the area of a circle with radius 5?", v: '25π', varName: null,
    vtex: '25\\pi', correct: ['25pi'], wrong: ['10π', '5π'] },

  // ── Calculus ──
  { id: 'calc-1', topic: 'calculus', pose: "Try this one: What's the derivative of \\(x^2 \\sin x\\)?", v: '2x sin x + x^2 cos x', varName: null,
    vtex: '2x\\sin x + x^2\\cos x',
    correct: ['oh so 2x sinx + x^2 cosx', 'x^2 cos x + 2x sin x', '2xsin(x)+x^2cos(x)', "u'v + uv' = 2x sin x + x^2 cos x"],
    wrong: ['2x cos x', '2x sin x', "u' = 2x and v' = cos x so its 2x cos x"] },
  // Sub-questions: the answer is to the step in front of the student, and the
  // pose does not restate what it builds on (2026-11-04: solved blind, a right
  // u'v was rejected and a wrong one accepted).
  { id: 'sub-1', topic: 'calculus',
    before: ["To find the derivative of \\(x^2 \\sin x\\), use the product rule: \\[(uv)' = u'v + uv'\\] Let \\(u = x^2\\) and \\(v = \\sin x\\). Can you tell me what \\(u'\\) and \\(v'\\) are?"],
    pose: "Nice, \\(u' = 2x\\) and \\(v' = \\cos x\\). Now, what would \\(u'v\\) look like?", v: '2x sin x', varName: null,
    correct: ['2x sinx'], wrong: ['2x cos x', 'x^2 cos x'] },
  { id: 'sub-2', topic: 'geometry',
    before: ["Let's find the area of a circle with radius 3. The formula is \\(A = \\pi r^2\\)."],
    pose: 'What do you get when you plug in the radius?', v: '9π', varName: null,
    correct: ['π(3)^2 = 9π'], wrong: ['6π', '3π'] },
  { id: 'calc-2', topic: 'calculus', pose: "Try this one: What's the derivative of \\((3x + 1)^4\\)?", v: '12(3x + 1)^3', varName: null,
    correct: ['4(3x+1)^3 * 3 = 12(3x+1)^3'], wrong: ['4(3x + 1)^3', '12x(3x+1)^3'] },
  { id: 'calc-3', topic: 'calculus', pose: "Try this one: What's the derivative of \\(e^{2x}\\)?", v: '2e^(2x)', varName: null,
    vtex: '2e^{2x}', correct: ['2e^{2x}'], wrong: ['e^(2x)', '2xe^(2x-1)'] },
  { id: 'calc-4', topic: 'calculus', pose: "Try this one: What's the derivative of \\(\\ln(x^2 + 1)\\)?", v: '2x/(x^2 + 1)', varName: null,
    vtex: '\\frac{2x}{x^2+1}', correct: [], wrong: ['1/(x^2 + 1)', '2x'] },
  { id: 'calc-5', topic: 'calculus', pose: "Try this one: What's \\(\\int 3x^2\\,dx\\)?", v: 'x^3 + C', varName: null, correct: ['x^3 + c'], wrong: ['6x', '6x + C', 'x^3/3 + C'] },
  { id: 'calc-6', topic: 'calculus', pose: 'Try this one: Evaluate \\(\\int_0^2 x\\,dx\\).', v: '2', varName: null, correct: ['x^2/2 from 0 to 2 = 2'], wrong: ['4', '1'] },
  { id: 'calc-7', topic: 'calculus', pose: "Try this one: What's \\(\\lim_{x \\to 2} \\frac{x^2 - 4}{x - 2}\\)?", v: '4', varName: null,
    correct: ['(x+2)(x-2)/(x-2) = x + 2 so the limit is 4'], wrong: ['0', 'undefined', 'DNE'] },
  { id: 'calc-8', topic: 'calculus', pose: "Try this one: If \\(f(x) = x^3 - 5x\\), what's \\(f'(1)\\)?", v: '-2', varName: null,
    correct: ["f'(x) = 3x^2 - 5 so f'(1) = -2"], wrong: ['3', '-4'] },

  // ── Trig ──
  { id: 'trig-1', topic: 'trig', pose: "Try this one: What's \\(\\sin 30^\\circ\\)?", v: '1/2', varName: null, vtex: '\\frac{1}{2}', correct: ['0.5'], wrong: ['√3/2', '2'] },
  { id: 'trig-2', topic: 'trig', pose: "Try this one: What's \\(\\cos \\frac{\\pi}{3}\\)?", v: '1/2', varName: null, vtex: '\\frac{1}{2}', correct: ['0.5'], wrong: ['√3/2', '-1/2'] },
  { id: 'trig-3', topic: 'trig', pose: "Try this one: What's \\(\\tan 45^\\circ\\)?", v: '1', varName: null, correct: [], wrong: ['0', '√2/2'] },

  // ── Word problems ──
  { id: 'word-1', topic: 'word', pose: 'Try this one: A shirt costs $40 and is 25% off. What is the sale price?', v: '30', varName: null,
    correct: ['$30', '40 - 10 = 30'], wrong: ['10', '$10', '50'] },
  { id: 'word-2', topic: 'word', pose: 'Try this one: Sam reads 12 pages a day. How many days will it take to read a 180-page book?', v: '15', varName: null,
    correct: ['15 days', '180/12 = 15'], wrong: ['2160', '168'] },
  // Owner session, 2026-11-08: a word problem posed after a LaTeX warm-up. The
  // problem has no operator in it, so the verifier graded "300 miles" against
  // the warm-up (answer 0) and stamped it incorrect; "60 mph" the same way.
  { id: 'rate-1', topic: 'word',
    before: ["Hey! Quick warm-up to get those brain gears turning: What's \\( \\frac{-6}{2} + 3 \\)?"],
    pose: "Rate and ratio problems are super fun! Here's a problem for you:\n\nProblem: A car travels 120 miles in 2 hours. At this rate, how far will it travel in 5 hours?\n\n1. First, what's the rate of the car in miles per hour?\n2. Then, use that rate to find out how far it will go in 5 hours.\n\nTake it step by step!",
    v: '300', varName: null, correct: ['300 miles', '300 mi', '60 mph, so 300 miles'], wrong: ['240', '600 miles', '24'] },
  { id: 'rate-2', topic: 'word',
    before: ["Hey! Quick warm-up: What's \\( \\frac{-6}{2} + 3 \\)?", "Problem: A car travels 120 miles in 2 hours. At this rate, how far will it travel in 5 hours?\n\n1. First, what's the rate of the car in miles per hour?\n2. Then, use that rate to find out how far it will go in 5 hours."],
    pose: 'You got the distance of 120 miles in 2 hours. What do you think the first step is to find the rate in miles per hour? How would you calculate that?',
    v: '60', varName: null, correct: ['60 mph', '60 miles per hour', 'divide. the rate is 60'], wrong: ['240', '118'] },

  // ── Inequalities ──
  { id: 'ineq-1', topic: 'inequalities', pose: 'Try this one: Solve \\(2x + 3 > 11\\).', noStyles: true,
    correct: ['x > 4', 'x>4', '2x > 8 so x > 4'], wrong: ['x < 4', 'x > 7'] },
  { id: 'ineq-2', topic: 'inequalities', pose: 'Try this one: Solve \\(-3x \\le 12\\).', noStyles: true,
    correct: ['x ≥ -4', 'x >= -4'], wrong: ['x ≤ -4', 'x <= -4'] },

  // ── Numbered sets (owner session, 2026-11-03: "5. 3/8" for a slope of 8/3
  // was told "That's correct too! You nailed all of them!") ──
  { id: 'set-1', topic: 'sets', noStyles: true,
    pose: "Got it! Let's mix it up with a variety of problems. Here we go with the first few:\n\n1. Evaluate: \\(5 - 3 + 8\\)\n2. Solve for x: \\(2x + 6 = 18\\)\n3. Simplify: \\(\\frac{16}{12}\\)\n4. Calculate the area of a rectangle with length 7 and width 4.\n5. What is the slope of the line passing through the points (2, 3) and (5, 11)?\n\nTry these out, and let me know your answers!",
    correct: ['1. 10\n2. x=6\n3. 4/3\n4. 28 units squared\n5. 8/3', '1) 10\n2) x = 6\n3) 4/3\n4) 28\n5) 8/3'],
    wrong: ['1. 10\n2. x=6\n3. 4/3\n4. 28 units squared\n5. 3/8', '1. 10\n2. x=12\n3. 4/3\n4. 28\n5. 8/3'] },

  // ── Conceptual ──
  { id: 'con-1', topic: 'conceptual', pose: "Here's a question: what's the difference between a vertical asymptote and a hole in a rational function?", noStyles: true,
    correct: ["a hole is where a factor cancels so it's just missing one point, an asymptote is where the denominator is zero and it doesn't cancel so the graph shoots off to infinity"],
    wrong: ['they are the same thing', 'a hole is where the graph crosses the x axis'] },
  { id: 'con-2', topic: 'conceptual', pose: 'True or false: every square is a rectangle?', noStyles: true,
    correct: ['true', 'i think its true'], wrong: ['false'] },
  { id: 'con-3', topic: 'conceptual', pose: 'Why do we flip the inequality sign when we multiply both sides by a negative number?', noStyles: true,
    correct: ['because multiplying by a negative reverses the order of numbers, so the bigger side becomes the smaller side'],
    wrong: ["you don't have to flip it, the sign stays the same"] },
];

// Generated right-answer styles for a single value: the ways real students
// wrote answers in the transcripts this project has mined.
function styles(p) {
  const v = p.v;
  const out = [v];
  if (p.varName) {
    out.push(`${p.varName} = ${v}`, `${p.varName}=${v}`, `so ${p.varName} = ${v}`);
  }
  out.push(`i got ${v}`, `is it ${v}?`, `its ${v}`);
  if (p.vtex) out.push(p.varName ? `\\(${p.varName} = ${p.vtex}\\)` : `\\(${p.vtex}\\)`);
  return out;
}

/** Every case: { problem, answer, expected: 'correct' | 'incorrect' }. */
function buildCases() {
  const cases = [];
  for (const p of P) {
    const right = new Set([...(p.noStyles ? [] : styles(p)), ...(p.correct || [])]);
    for (const answer of right) cases.push({ problem: p, answer, expected: 'correct' });
    for (const answer of p.wrong || []) cases.push({ problem: p, answer, expected: 'incorrect' });
  }
  return cases;
}

module.exports = { PROBLEMS: P, buildCases };

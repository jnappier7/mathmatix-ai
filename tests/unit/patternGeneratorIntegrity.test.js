/**
 * Regression guard for scripts/generate-all-pattern-problems.js.
 *
 * The 2026-08 item-bank audit traced 1,960 defective DB items to a handful of
 * generator bugs (inconsistent systems, mis-keyed division, truncated
 * solutions, rounded-decimal answers, sign-mangled fractions, contradictory
 * quadrant prompts, bimodal "mode" data, degenerate/misformatted strings).
 * Every test here re-solves generated items independently, so a regression in
 * any of those root causes goes red before it can reseed the bank.
 */

const {
  GENERATORS,
  canonicalFraction,
  linearExpr,
  vertexForm,
  powerTerm
} = require('../../scripts/generate-all-pattern-problems');

const DIFFICULTIES = [-1.5, -0.5, 0, 0.5, 1.5];
const RUNS = 300;

function generateMany(skillId, runs = RUNS) {
  const gen = GENERATORS[skillId];
  expect(typeof gen).toBe('function');
  const out = [];
  for (let i = 0; i < runs; i++) {
    out.push(gen(DIFFICULTIES[i % DIFFICULTIES.length]));
  }
  return out;
}

// Parse "3x + 2" / "x - 4" / "-x" / "2x" into { coeff, constant }
function parseLinear(expr) {
  const m = expr.trim().match(/^(-?\d*)x(?: ([+-]) (\d+))?$/);
  if (!m) return null;
  const coeff = m[1] === '' ? 1 : m[1] === '-' ? -1 : parseInt(m[1], 10);
  const constant = m[2] ? (m[2] === '-' ? -1 : 1) * parseInt(m[3], 10) : 0;
  return { coeff, constant };
}

function expectDistinctOptions(problem) {
  const texts = problem.options.map(o => o.text);
  expect(new Set(texts).size).toBe(4);
  const correct = problem.options.find(o => o.label === problem.correctOption);
  expect(correct).toBeDefined();
  expect(correct.text).toBe(String(problem.answer));
}

describe('formatting helpers', () => {
  test('canonicalFraction normalizes sign and reduces', () => {
    expect(canonicalFraction(-1, -4)).toBe('1/4');
    expect(canonicalFraction(7, -1)).toBe('-7');
    expect(canonicalFraction(0, -3)).toBe('0');
    expect(canonicalFraction(6, 1)).toBe('6');
    expect(canonicalFraction(4, 6)).toBe('2/3');
    expect(canonicalFraction(3, 0)).toBeNull();
  });

  test('linearExpr never emits "1x", "+ -", or "+ 0"', () => {
    expect(linearExpr(1, 3)).toBe('x + 3');
    expect(linearExpr(4, -4)).toBe('4x - 4');
    expect(linearExpr(-1, 0)).toBe('-x');
  });

  test('vertexForm handles negative h/k and unit coefficients', () => {
    expect(vertexForm(-2, -3, -1)).toBe('y = -2(x + 3)² - 1');
    expect(vertexForm(1, 0, 4)).toBe('y = (x)² + 4');
    expect(vertexForm(-1, 2, 0)).toBe('y = -(x - 2)²');
  });

  test('powerTerm renders exponents 0 and 1 without ^', () => {
    expect(powerTerm(8, 1)).toBe('8x');
    expect(powerTerm(8, 0)).toBe('8');
    expect(powerTerm(8, 3)).toBe('8x^3');
  });
});

describe('systems-substitution', () => {
  test('the keyed (x, y) satisfies BOTH equations', () => {
    for (const p of generateMany('systems-substitution')) {
      const eq = p.content.match(
        /^Solve using substitution: y = (\d+)x \+ (\d+); (\d+)x \+ (\d+)y = (\d+)$/
      );
      expect(eq).not.toBeNull();
      const [, a, b, c, d, r] = eq.map(Number);
      const ans = p.answer.match(/^x = (\d+), y = (\d+)$/);
      expect(ans).not.toBeNull();
      const [, x, y] = ans.map(Number);
      expect(y).toBe(a * x + b);        // equation 1
      expect(c * x + d * y).toBe(r);    // equation 2 — the bug that shipped 146 items
      expectDistinctOptions(p);
    }
  });
});

describe('one-step equations and inequalities (÷ keying)', () => {
  test('x ÷ b = q is keyed to b·q, not q', () => {
    let divisionSeen = 0;
    for (const p of generateMany('one-step-equations', 600)) {
      const m = p.content.match(/^Solve for x: x ÷ (\d+) = (\d+)$/);
      if (!m) continue;
      divisionSeen++;
      const [, b, q] = m.map(Number);
      expect(Number(p.answer)).toBe(b * q);
    }
    expect(divisionSeen).toBeGreaterThan(20);
  });

  test('every one-step equation form back-substitutes', () => {
    for (const p of generateMany('one-step-equations', 600)) {
      const x = Number(p.answer);
      let m;
      if ((m = p.content.match(/^Solve for x: x \+ (\d+) = (\d+)$/))) {
        expect(x + Number(m[1])).toBe(Number(m[2]));
      } else if ((m = p.content.match(/^Solve for x: x - (\d+) = (\d+)$/))) {
        expect(x - Number(m[1])).toBe(Number(m[2]));
      } else if ((m = p.content.match(/^Solve for x: (\d+)x = (\d+)$/))) {
        expect(Number(m[1]) * x).toBe(Number(m[2]));
      } else if ((m = p.content.match(/^Solve for x: x ÷ (\d+) = (\d+)$/))) {
        expect(x / Number(m[1])).toBe(Number(m[2]));
      } else {
        throw new Error(`Unrecognized one-step equation: ${p.content}`);
      }
    }
  });

  test('one-step inequality boundary is b·q for the ÷ form', () => {
    let divisionSeen = 0;
    for (const p of generateMany('one-step-inequalities', 600)) {
      const m = p.content.match(/^Solve for x: x ÷ (\d+) ([<>≤≥]) (\d+)$/);
      if (!m) continue;
      divisionSeen++;
      const boundary = Number(p.answer.match(/^x [<>≤≥] (\d+)$/)[1]);
      expect(boundary).toBe(Number(m[1]) * Number(m[3]));
    }
    expect(divisionSeen).toBeGreaterThan(20);
  });
});

describe('equations-with-variables-both-sides', () => {
  test('keyed x exactly satisfies the printed equation', () => {
    for (const p of generateMany('equations-with-variables-both-sides')) {
      const m = p.content.match(/^Solve for x: (.+) = (.+)$/);
      expect(m).not.toBeNull();
      const lhs = parseLinear(m[1]);
      const rhs = parseLinear(m[2]);
      expect(lhs).not.toBeNull();
      expect(rhs).not.toBeNull();
      const x = Number(p.answer);
      expect(Number.isInteger(x)).toBe(true);
      expect(lhs.coeff * x + lhs.constant).toBe(rhs.coeff * x + rhs.constant);
      expectDistinctOptions(p);
    }
  });
});

describe('solving-inequalities', () => {
  test('boundary divides exactly — no floored b/a', () => {
    for (const p of generateMany('solving-inequalities')) {
      const m = p.content.match(/^Solve: (\d+)x < (\d+)$/);
      expect(m).not.toBeNull();
      const [, a, b] = m.map(Number);
      const boundary = Number(p.answer.match(/^x < (-?\d+)$/)[1]);
      expect(a * boundary).toBe(b);
    }
  });
});

describe('coordinate-plane', () => {
  test('quadrant text matches the answer point; never on an axis', () => {
    const quadrantOf = (x, y) =>
      x > 0 && y > 0 ? 'I' : x < 0 && y > 0 ? 'II' : x < 0 && y < 0 ? 'III' : 'IV';
    for (const p of generateMany('coordinate-plane')) {
      const [, x, y] = p.answer.match(/^\((-?\d+), (-?\d+)\)$/).map(Number);
      expect(x).not.toBe(0);
      expect(y).not.toBe(0);
      const claimed = p.content.match(/^A point is in quadrant (I{1,3}|IV)\b/)[1];
      expect(claimed).toBe(quadrantOf(x, y));
      expect(p.content).not.toMatch(/\b0 units\b/);
    }
  });
});

describe('statistics generators', () => {
  test('mean is exact — never a rounded decimal', () => {
    for (const p of generateMany('mean')) {
      const nums = p.content.match(/^Find the mean: (.+)$/)[1].split(', ').map(Number);
      const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
      expect(Number(p.answer)).toBe(mean);
      expect(Number.isInteger(Number(p.answer))).toBe(true);
      expectDistinctOptions(p);
    }
  });

  test('mode data is strictly unimodal', () => {
    for (const p of generateMany('mode')) {
      const nums = p.content.match(/^Find the mode: (.+)$/)[1].split(', ').map(Number);
      const counts = {};
      nums.forEach(n => { counts[n] = (counts[n] || 0) + 1; });
      const top = Math.max(...Object.values(counts));
      const modes = Object.keys(counts).filter(k => counts[k] === top);
      expect(modes).toEqual([String(p.answer)]);
    }
  });
});

describe('exact-arithmetic generators (no rounded decimals stored as exact)', () => {
  test('rate-problems: rate is a whole number and re-derives', () => {
    for (const p of generateMany('rate-problems')) {
      const m = p.content.match(/^A train travels (\d+) miles in (\d+) hours/);
      const [, miles, hours] = m.map(Number);
      expect(Number(p.answer)).toBe(miles / hours);
      expect(Number.isInteger(Number(p.answer))).toBe(true);
    }
  });

  test('solve-proportions: x is a whole number and cross-multiplies', () => {
    for (const p of generateMany('solve-proportions')) {
      const m = p.content.match(/^Solve the proportion: (\d+)\/(\d+) = (\d+)\/x$/);
      const [, a, b, c] = m.map(Number);
      const x = Number(p.answer);
      expect(Number.isInteger(x)).toBe(true);
      expect(a * x).toBe(b * c);
    }
  });

  const fractionIsCanonical = (s) => {
    if (/^-?\d+$/.test(s)) return true;
    const m = s.match(/^(-?\d+)\/(\d+)$/); // denominator must be positive
    if (!m) return false;
    const num = Math.abs(Number(m[1])), den = Number(m[2]);
    const g = (a, b) => (b === 0 ? a : g(b, a % b));
    return den > 1 && g(num, den) === 1;
  };

  test.each(['slope', 'slope-from-two-points'])(
    '%s: answer equals rise/run in canonical form',
    (skillId) => {
      for (const p of generateMany(skillId)) {
        const m = p.content.match(
          /^Find the slope between \((-?\d+), (-?\d+)\) and \((-?\d+), (-?\d+)\)$/
        );
        const [, x1, y1, x2, y2] = m.map(Number);
        expect(fractionIsCanonical(p.answer)).toBe(true);
        expect(p.answer).toBe(canonicalFraction(y2 - y1, x2 - x1));
        expectDistinctOptions(p);
      }
    }
  );
});

describe('estimate-sums', () => {
  test('key follows the stated round-each-addend convention', () => {
    for (const p of generateMany('estimate-sums')) {
      const m = p.content.match(
        /^Estimate (\d+) \+ (\d+) by rounding each number to the nearest ten\.$/
      );
      expect(m).not.toBeNull();
      const [, a, b] = m.map(Number);
      expect(Number(p.answer)).toBe(Math.round(a / 10) * 10 + Math.round(b / 10) * 10);
    }
  });
});

describe('check-reasonableness', () => {
  test('stem contains both candidates and the key is the true sum', () => {
    for (const p of generateMany('check-reasonableness')) {
      const m = p.content.match(
        /^Two students solved (\d+) \+ (\d+)\. One got (\d+), the other got (\d+)\. Which answer is reasonable\?$/
      );
      expect(m).not.toBeNull();
      const [, a, b, first, second] = m.map(Number);
      expect(Number(p.answer)).toBe(a + b);
      expect([first, second]).toContain(a + b);
    }
  });
});

describe('place-value', () => {
  test('target digit appears exactly once in the number', () => {
    for (const p of generateMany('place-value')) {
      const m = p.content.match(/^In the number (\d+), what place is the digit (\d)\?$/);
      expect(m).not.toBeNull();
      const [, num, digit] = m;
      expect(num.split('').filter(c => c === digit)).toHaveLength(1);
    }
  });
});

describe('string formatting regressions', () => {
  test('quadratic-functions vertex strings are sign-clean', () => {
    for (const p of generateMany('quadratic-functions')) {
      for (const s of [p.answer, ...p.options.map(o => o.text)]) {
        expect(s).not.toMatch(/--|\+ -|- -|\b1\(|(?<!\d)-1\(/);
      }
      expectDistinctOptions(p);
    }
  });

  test('derivatives never render x^1 or x^0', () => {
    for (const p of generateMany('derivatives')) {
      for (const s of [p.answer, ...p.options.map(o => o.text)]) {
        expect(s).not.toMatch(/x\^[01]\b/);
      }
    }
  });

  test.each(['limits', 'graph-linear-equations'])('%s prompts have no "1x" or "+ -"', (skillId) => {
    if (!GENERATORS[skillId]) return; // registry key differs per skill map
    for (const p of generateMany(skillId)) {
      expect(p.content).not.toMatch(/\b1x\b|\+ -/);
    }
  });

  test('addition-as-joining pluralizes apples', () => {
    for (const p of generateMany('addition-as-joining')) {
      expect(p.content).not.toMatch(/\b1 apples\b|\b1 more apples\b/);
    }
  });

  test('ratios prompts are actually reducible and answers reduced', () => {
    for (const p of generateMany('ratios')) {
      const [, a, b] = p.content.match(/^Simplify the ratio: (\d+):(\d+)$/).map(Number);
      const g = (x, y) => (y === 0 ? x : g(y, x % y));
      expect(g(a, b)).toBeGreaterThan(1);
      const [sa, sb] = p.answer.split(':').map(Number);
      expect(g(sa, sb)).toBe(1);
      expectDistinctOptions(p);
    }
  });

  test.each(['add-fractions', 'subtract-fractions'])(
    '%s: operands and answers are proper fractions (no n/n)',
    (skillId) => {
      for (const p of generateMany(skillId)) {
        const parts = [...p.content.matchAll(/(\d+)\/(\d+)/g), ...String(p.answer).matchAll(/(\d+)\/(\d+)/g)];
        for (const [, num, den] of parts) {
          expect(Number(num)).toBeLessThan(Number(den));
          expect(Number(num)).toBeGreaterThan(0);
        }
      }
    }
  );

  test('expanded-form never degenerates to "N + 0"', () => {
    for (const p of generateMany('expanded-form')) {
      expect(p.answer).not.toMatch(/\+ 0$/);
      expectDistinctOptions(p);
    }
  });
});

/**
 * At-level check items for 8th-grade math — every item RE-SOLVED from its own
 * printed text.
 *
 * Nothing here calls the templates' maths. Each re-solver reads the numbers out
 * of the prompt a student sees and works the answer a second way, with the
 * rules typed by hand below (the volume formulas, the rotation matrix, the
 * meaning of "greatest integer that satisfies"), then compares to the key. A
 * conceptual multiple-choice item, where nothing can be recomputed, is checked
 * against a hand-typed table of what the right option must say.
 */

const { expand, validate } = require('../../scripts/buildCourseLevelItems');
const bank = require('../../scripts/lib/courseLevelGrade8');

// ── reading helpers ─────────────────────────────────────────────────────────

const ascii = (s) => String(s).replace(/[−–]/g, '-');
const num = (s) => Number(ascii(s));
const show = (n) => (n < 0 ? `−${Math.abs(n)}` : String(n));
const point = (x, y) => `(${show(x)}, ${show(y)})`;
const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const fracStr = (n, d) => { const g = gcd(n, d); return d / g === 1 ? String(n / g) : `${n / g}/${d / g}`; };
const piStr = (n, d = 1) => { const g = gcd(n, d); return d / g === 1 ? `${n / g}π` : `${n / g}π/${d / g}`; };
const list = (s) => s.split(',').map((x) => num(x.trim()));
const opts = (item) => item.options.map((o) => o.text);
const keyed = (item) => item.options.find((o) => o.label === item.correctOption).text;
const others = (item) => item.options.filter((o) => o.label !== item.correctOption).map((o) => o.text);
const parsePoint = (s) => { const m = ascii(s).match(/\((-?\d+), (-?\d+)\)/); return [Number(m[1]), Number(m[2])]; };
const allPoints = (s) => [...ascii(s).matchAll(/\((-?\d+), (-?\d+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
const must = (m, what) => { if (!m) throw new Error(`could not read: ${what}`); return m; };

/** √n, −√n, π, a/b, a decimal. */
function realValue(text) {
  const t = ascii(text.trim());
  const sign = t.startsWith('-') ? -1 : 1;
  const body = t.replace(/^-/, '');
  if (body === 'π') return sign * Math.PI;
  if (body.startsWith('√')) return sign * Math.sqrt(Number(body.slice(1)));
  if (body.includes('/')) { const [a, b] = body.split('/').map(Number); return sign * a / b; }
  return sign * Number(body);
}

/** The printed linear forms: "3x + 5", "-x - 4", "2x", "-2(x - 6)", "7". Returns x => value. */
function linear(text) {
  const t = ascii(text.trim());
  let m = t.match(/^(-?\d*)x(?: ([+-]) (\d+))?$/);
  if (m) {
    const c = m[1] === '' ? 1 : m[1] === '-' ? -1 : Number(m[1]);
    const k = m[2] ? (m[2] === '-' ? -1 : 1) * Number(m[3]) : 0;
    return Object.assign((x) => c * x + k, { m: c, b: k });
  }
  m = t.match(/^(-?\d+)\(x ([+-]) (\d+)\)$/);
  if (m) {
    const c = Number(m[1]); const k = (m[2] === '-' ? -1 : 1) * Number(m[3]);
    return Object.assign((x) => c * (x + k), { m: c, b: c * k });
  }
  m = t.match(/^-?\d+$/);
  if (m) return Object.assign(() => Number(t), { m: 0, b: Number(t) });
  throw new Error(`not a linear form: ${text}`);
}

const COMPARE = { '<': (a, b) => a < b, '>': (a, b) => a > b, '≤': (a, b) => a <= b, '≥': (a, b) => a >= b };
function inequality(text) {
  const m = must(text.match(/^(.+?) (<|>|≤|≥) (.+)$/), text);
  const L = linear(m[1]); const R = linear(m[3]);
  return (x) => COMPARE[m[2]](L(x), R(x));
}

/** Slope and intercept of the line through a printed table "x: …; y: …". */
function tableLine(prompt, xName = 'x', yName = 'y') {
  const m = must(ascii(prompt).match(new RegExp(`${xName}: ([-\\d, ]+); ${yName}: ([-\\d, ]+)`)), 'table');
  const xs = list(m[1]); const ys = list(m[2]);
  const slope = (ys[1] - ys[0]) / (xs[1] - xs[0]);
  for (let i = 0; i < xs.length; i++) expect(ys[i]).toBe(ys[0] + slope * (xs[i] - xs[0]));   // the table really is linear
  return { m: slope, b: ys[0] - slope * xs[0], xs, ys };
}

// ── the re-solvers ──────────────────────────────────────────────────────────

const RESOLVE = {
  'g8-real-number-ordering': (item) => {
    const p = item.prompt;
    let m = p.match(/^√(\d+) lies between two consecutive whole numbers\. (What is the SMALLER|Which of those two whole numbers is √\d+ CLOSER)/);
    if (m) {
      const n = Number(m[1]);
      let f = 0;
      while ((f + 1) * (f + 1) < n) f += 1;
      expect(f * f).toBeLessThan(n);
      if (m[2].startsWith('What')) return f;
      // closer to f exactly when √n < f + ½, i.e. 4n < (2f + 1)²
      return 4 * n < (2 * f + 1) * (2 * f + 1) ? f : f + 1;
    }
    m = p.match(/^Which of these numbers is the (greatest|least): (.+)\?$/);
    if (m) {
      const texts = m[2].split(', ');
      expect(texts).toEqual(opts(item));
      const sorted = texts.slice().sort((a, b) => realValue(a) - realValue(b));
      expect(realValue(sorted[1]) - realValue(sorted[0])).toBeGreaterThan(0.1);
      expect(realValue(sorted[3]) - realValue(sorted[2])).toBeGreaterThan(0.1);
      return m[1] === 'greatest' ? sorted[3] : sorted[0];
    }
    m = p.match(/^Which list shows the numbers (.+) in order from (least to greatest|greatest to least)\?$/);
    if (m) {
      const sorted = m[1].split(', ').sort((a, b) => realValue(a) - realValue(b));
      if (m[2] === 'greatest to least') sorted.reverse();
      return sorted.join(', ');
    }
    m = must(p.match(/^Which of these numbers is between (√\d+) and ([\d.]+)\?$/), p);
    const lo = realValue(m[1]); const hi = realValue(m[2]);
    const inside = opts(item).filter((t) => realValue(t) > lo && realValue(t) < hi);
    expect(inside).toHaveLength(1);
    for (const t of opts(item)) {      // no option sits close enough to an endpoint to argue about
      expect(Math.abs(realValue(t) - lo)).toBeGreaterThan(0.09);
      expect(Math.abs(realValue(t) - hi)).toBeGreaterThan(0.09);
    }
    return inside[0];
  },

  'g8-linear-inequalities': (item) => {
    const p = item.prompt;
    let m = p.match(/^What is the (greatest|least) integer x that satisfies (.+)\?$/);
    if (m) {
      const holds = inequality(m[2]);
      const fits = [];
      for (let x = -300; x <= 300; x++) if (holds(x)) fits.push(x);
      expect(fits.length).toBeGreaterThan(0);
      const ans = m[1] === 'greatest' ? Math.max(...fits) : Math.min(...fits);
      expect(Math.abs(ans)).toBeLessThan(300);      // a real bound, not the edge of the search
      return ans;
    }
    m = must(p.match(/^Solve for x: (.+)\. Which inequality gives all the solutions\?$/), p);
    const holds = inequality(m[1]);
    const same = (optionText) => {
      const o = inequality(optionText);
      for (let x = -80; x <= 80; x += 0.5) if (o(x) !== holds(x)) return false;
      return true;
    };
    const right = opts(item).filter(same);
    expect(right).toHaveLength(1);
    return right[0];
  },

  'g8-equation-word-problems': (item) => {
    const p = item.prompt;
    const dollars = [...p.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    let m = p.match(/sum of three consecutive (even )?integers is (\d+)\. What is the (smallest|largest)/);
    if (m) {
      const step = m[1] ? 2 : 1;
      const first = (Number(m[2]) - 3 * step) / 3;
      if (m[1]) expect(first % 2).toBe(0);
      return m[3] === 'smallest' ? first : first + 2 * step;
    }
    m = p.match(/is (\d+) cm more than (\d+) times its width\. The perimeter of the rectangle is (\d+) cm/);
    if (m) {
      const [c, k, P] = m.slice(1).map(Number);
      const w = (P / 2 - c) / (k + 1);
      return k * w + c;
    }
    m = p.match(/\(x \+ (\d+)\) cm, \(2x − (\d+)\) cm and \(3x \+ (\d+)\) cm\. The perimeter of the triangle is (\d+) cm/);
    if (m) {
      const [a, b, c, P] = m.slice(1).map(Number);
      const x = (P - a + b - c) / 6;
      const sides = [x + a, 2 * x - b, 3 * x + c].sort((s, t) => s - t);
      expect(sides[0] + sides[1]).toBeGreaterThan(sides[2]);     // it is a triangle
      expect(sides[2]).toBeGreaterThan(sides[1]);                // with ONE longest side
      return sides[2];
    }
    m = p.match(/buys (\d+) more child tickets than adult tickets/);
    if (m) {
      const [A, C, T] = dollars;
      return (T - C * Number(m[1])) / (A + C);
    }
    if (dollars.length === 4) {
      const [f1, r1, f2, r2] = dollars;
      const n = (f2 - f1) / (r1 - r2);
      expect(n).toBeGreaterThan(0);
      return /what is that total, in dollars/.test(p) ? f1 + r1 * n : n;
    }
    expect(dollars).toHaveLength(3);
    const [F, R, T] = dollars;
    return (T - F) / R;
  },

  'g8-compare-linear-models': (item) => {
    const p = item.prompt;
    const seg = must(p.match(/(?:Plan|Tank) A: (.*?) (?:Plan|Tank) B: (.*)$/), p);
    const model = (s) => {
      let m = s.match(/C = (\d+)m \+ (\d+)/);
      if (m) return { rate: Number(m[1]), fee: Number(m[2]) };
      m = s.match(/costs \$(\d+) to join plus \$(\d+) per month/);
      if (m) return { rate: Number(m[2]), fee: Number(m[1]) };
      m = s.match(/starts with (\d+) liters and gains (\d+) liters per minute/);
      if (m) return { rate: Number(m[2]), fee: Number(m[1]) };
      const t = tableLine(s, 'm', 'C');
      return { rate: t.m, fee: t.b };
    };
    const A = model(seg[1]); const B = model(seg[2]);
    const at = (M, x) => M.fee + M.rate * x;
    const even = (B.fee - A.fee) / (A.rate - B.rate);
    let m = p.match(/Which plan costs less for (\d+) months/);
    if (m) {
      const x = Number(m[1]);
      expect(at(A, x)).not.toBe(at(B, x));
      return `Plan ${at(A, x) < at(B, x) ? 'A' : 'B'}, by $${Math.abs(at(A, x) - at(B, x))}`;
    }
    if (/greater monthly rate/.test(p)) return `Plan ${A.rate > B.rate ? 'A' : 'B'}, by $${Math.abs(A.rate - B.rate)} per month`;
    if (/what is that total cost/.test(p)) return at(A, even);
    if (/cost LESS than Plan B/.test(p)) {
      const TESTS = [
        [/^Only when m is less than (\d+)$/, (x, n) => x < n],
        [/^Only when m is greater than (\d+)$/, (x, n) => x > n],
        [/^For every number of months$/, () => true],
        [/^Only when m is exactly (\d+)$/, (x, n) => x === n],
      ];
      const right = opts(item).filter((text) => {
        const [re, pred] = must(TESTS.find(([r]) => r.test(text)), text);
        const n = Number((text.match(re)[1]) || 0);
        for (let x = 1; x <= 400; x++) if ((at(A, x) < at(B, x)) !== pred(x, n)) return false;
        return true;
      });
      expect(right).toHaveLength(1);
      return right[0];
    }
    must(/After how many (minutes|months)/.test(p), p);
    return even;
  },

  'g8-function-modeling': (item) => {
    const p = item.prompt;
    let m = p.match(/candle is (\d+) cm tall and burns down (\d+) cm every hour/);
    if (m) return `h = ${m[1]} − ${m[2]}t`;
    m = p.match(/pool holds (\d+) gallons of water and is being filled at (\d+) gallons per minute/);
    if (m) return `g = ${m[2]}t + ${m[1]}`;
    m = p.match(/It is (\d+) cm tall after (\d+) weeks and (\d+) cm tall after (\d+) weeks/);
    if (m) return (Number(m[3]) - Number(m[1])) / (Number(m[4]) - Number(m[2]));
    m = p.match(/A (\d+)-mile ride costs \$(\d+) and a (\d+)-mile ride costs \$(\d+)/);
    if (m) {
      const [x1, y1, x2, y2] = m.slice(1).map(Number);
      const rate = (y2 - y1) / (x2 - x1); const fee = y1 - rate * x1;
      const q = p.match(/What does a (\d+)-mile ride cost/);
      return q ? fee + rate * Number(q[1]) : (must(/starting fee/.test(p), p), fee);
    }
    m = p.match(/holds (\d+) liters after (\d+) minutes and (\d+) liters after (\d+) minutes/);
    if (m) {
      const [y1, x1, y2, x2] = m.slice(1).map(Number);
      const loss = (y1 - y2) / (x2 - x1); const start = y1 + loss * x1;
      if (/be empty/.test(p)) return start / loss;
      must(/Which equation/.test(p), p);
      return `V = ${start} − ${loss}t`;
    }
    const t = tableLine(p);
    if (/rate of change\?$/.test(p)) return t.m;
    if (/initial value/.test(p)) return t.b;
    m = p.match(/value of y when x = (\d+)/);
    if (m) return t.m * Number(m[1]) + t.b;
    must(/Which equation represents/.test(p), p);
    return `y = ${show(t.m)}x ${t.b < 0 ? '−' : '+'} ${Math.abs(t.b)}`;
  },

  'g8-compare-functions': (item) => {
    const p = item.prompt;
    const a = linear(must(p.match(/Function A: y = (.+?)\. Function B/), p)[1]);
    let B;
    if (/passes through/.test(p)) {
      const [[x1, y1], [x2, y2]] = allPoints(p);
      const slope = (y2 - y1) / (x2 - x1);
      B = { m: slope, b: y1 - slope * x1 };
    } else {
      B = tableLine(p);
    }
    const A = { m: a.m, b: a.b };
    if (/larger of the two rates of change/.test(p)) return Math.abs(A.m - B.m);
    if (/larger of the two y-intercepts/.test(p)) return Math.abs(A.b - B.b);
    if (/Which statement is true/.test(p)) {
      expect(A.m).not.toBe(B.m); expect(A.b).not.toBe(B.b);
      return `Function ${A.m > B.m ? 'A' : 'B'} has the greater rate of change, and Function ${A.b > B.b ? 'A' : 'B'} has the greater y-intercept`;
    }
    let m = p.match(/greater value when x = (\d+)/);
    if (m) {
      const x = Number(m[1]); const va = A.m * x + A.b; const vb = B.m * x + B.b;
      expect(va).not.toBe(vb);
      return `Function ${va > vb ? 'A' : 'B'}, by ${Math.abs(va - vb)}`;
    }
    must(/same y-value/.test(p), p);
    return (B.b - A.b) / (A.m - B.m);
  },

  'g8-interpret-slope-intercept': (item) => {
    const p = item.prompt;
    // What the right option must SAY, typed by hand per context.
    const CONTEXT = [
      { is: /plumber's total charge/, rate: /^The plumber charges \$N for each hour of work$/, start: /^The plumber charges a flat fee of \$N before any work is done$/ },
      { is: /height H of a plant/, rate: /^The plant grows N cm each week$/, start: /^The plant was N cm tall when it was bought$/ },
      { is: /savings account/, rate: /^Dana adds \$N to the account each week$/, start: /^Dana had \$N in the account at the start$/ },
      { is: /fare F, in dollars, for a taxi ride/, rate: /^The fare goes up \$N for each mile traveled$/, start: /^The ride costs \$N before any distance is traveled$/ },
      { is: /burning candle/, rate: /^The candle gets N cm shorter each hour$/, start: /^The candle was N cm tall before it was lit$/, units: 'centimeters per hour' },
      { is: /water in a tank/, rate: /^The tank loses N liters of water each minute$/, start: /^The tank held N liters when the drain was opened$/, units: 'liters per minute' },
      { is: /gift card/, rate: /^The balance goes down \$N for each smoothie bought$/, start: /^The card had \$N on it before any smoothies were bought$/, units: 'dollars per smoothie' },
      { is: /hiker's elevation/, rate: /^The hiker descends N meters each minute$/, start: /^The hiker started at an elevation of N meters$/, units: 'meters per minute' },
    ];
    const two = p.match(/C = (\d+)[hd] \+ (\d+) and .*? C = (\d+)[hd] \+ (\d+)/);
    if (two) {
      const [m1, b1, m2, b2] = two.slice(1).map(Number);
      const want = m1 === m2 && b2 > b1 ? /has the same .+ but a higher /
        : m2 > m1 && b2 === b1 ? /has a higher .+ than .+ but the same /
          : m2 > m1 && b2 > b1 ? /has a higher .+ and a higher /
            : m2 < m1 && b2 === b1 ? /has a lower .+ than .+ but the same / : null;
      must(want, 'a case the options cover');
      const right = opts(item).filter((t) => want.test(t));
      expect(right).toHaveLength(1);
      return right[0];
    }
    const ctx = must(CONTEXT.find((c) => c.is.test(p)), p);
    const up = p.match(/= (\d+)[a-z] \+ (\d+)\./); const down = p.match(/= (\d+) − (\d+)[a-z]\./);
    const slope = up ? Number(up[1]) : Number(must(down, p)[2]);
    const start = up ? Number(up[2]) : Number(down[1]);
    if (/units of the slope/.test(p)) return ctx.units;
    let m = p.match(/What does the (\d+) represent/);
    if (m) {
      const asked = Number(m[1]);
      expect(slope).not.toBe(start);
      const shape = asked === slope ? ctx.rate : (expect(asked).toBe(start), ctx.start);
      const re = new RegExp(shape.source.replace('N', String(asked)));
      const right = opts(item).filter((t) => re.test(t));
      expect(right).toHaveLength(1);
      return right[0];
    }
    m = must(p.match(/takes (\d+) more hours|over any (\d+) weeks|is (\d+) miles longer/), p);
    return slope * Number(m[1] || m[2] || m[3]);
  },

  'g8-systems-graphing': (item) => {
    const p = item.prompt;
    /** A printed line as { on(x, y), m, b } — "y = 2x + 3", "2y = 6x − 2", "3x + 2y = 10". */
    const line = (text) => {
      const t = ascii(text.trim().replace(/\.$/, ''));
      let m = t.match(/^(\d*)y = (.+)$/);
      if (m) {
        const k = m[1] === '' ? 1 : Number(m[1]); const f = linear(m[2]);
        return { on: (x, y) => k * y === f(x), m: f.m / k, b: f.b / k };
      }
      m = must(t.match(/^(-?\d*)x \+ (\d*)y = (-?\d+)$/), text);
      const A = m[1] === '' ? 1 : m[1] === '-' ? -1 : Number(m[1]); const Bc = m[2] === '' ? 1 : Number(m[2]); const C = Number(m[3]);
      return { on: (x, y) => A * x + Bc * y === C, m: -A / Bc, b: C / Bc };
    };
    let m = p.match(/^The lines (.+?) and (.+?) are graphed on the same coordinate plane\. At which point/);
    if (m) {
      const l1 = line(m[1]); const l2 = line(m[2]);
      const right = opts(item).filter((t) => { const [x, y] = parsePoint(t); return l1.on(x, y) && l2.on(x, y); });
      expect(right).toHaveLength(1);
      return right[0];
    }
    m = p.match(/^How many solutions does this system of equations have\?\s+(.+?)\s+and\s+(.+)$/);
    if (m) {
      const l1 = line(m[1]); const l2 = line(m[2]);
      if (l1.m !== l2.m) return 'Exactly one solution';
      return l1.b === l2.b ? 'Infinitely many solutions' : 'No solution';
    }
    m = p.match(/^Is (\(.+?\)) the solution of this system\?\s+First line: (.+?)\.\s+Second line: (.+?)\.$/);
    if (m) {
      const [x, y] = parsePoint(m[1]); const on1 = line(m[2]).on(x, y); const on2 = line(m[3]).on(x, y);
      if (on1 && on2) return 'Yes, it lies on both lines';
      if (on1) return 'No, it lies only on the first line';
      return on2 ? 'No, it lies only on the second line' : 'No, it lies on neither line';
    }
    m = must(p.match(/^The lines y = (.+?) and y = (.+?) \+ k intersect at a point whose x-coordinate is (.+?)\. What is the value of k\?$/), p);
    const x0 = num(m[3]);
    return linear(m[1])(x0) - linear(m[2])(x0);
  },

  'g8-transformations': (item) => {
    const p = item.prompt;
    let P = parsePoint(must(p.match(/^Point P(\(.+?\))/), p)[1]);
    // Rotation by the matrix for a counterclockwise turn of `deg` degrees.
    const turn = ([x, y], deg) => {
      const a = deg * Math.PI / 180;
      return [Math.round(x * Math.cos(a) - y * Math.sin(a)), Math.round(x * Math.sin(a) + y * Math.cos(a))];
    };
    const steps = p.replace(/^Point P\(.+?\) is /, '').split(/, and then the result is /);
    for (const raw of steps) {
      const s = raw.replace(/\. What .*$/, '');
      let m = s.match(/^translated (\d+) units? (left|right) and (\d+) units? (up|down)$/);
      if (m) { P = [P[0] + (m[2] === 'left' ? -1 : 1) * Number(m[1]), P[1] + (m[4] === 'down' ? -1 : 1) * Number(m[3])]; continue; }
      m = s.match(/^reflected over the (x|y)-axis$/);
      if (m) { P = m[1] === 'x' ? [P[0], -P[1]] : [-P[0], P[1]]; continue; }
      m = must(s.match(/^rotated (\d+)°( clockwise| counterclockwise)? about the origin$/), s);
      if (m[1] !== '180') must(m[2], 'a direction for the turn');
      P = turn(P, m[2] === ' clockwise' ? -Number(m[1]) : Number(m[1]));
    }
    const coord = p.match(/What is the (x|y)-coordinate of/);
    if (coord) return coord[1] === 'x' ? P[0] : P[1];
    must(/What are the coordinates of/.test(p), p);
    return point(P[0], P[1]);
  },

  'g8-congruence-similarity': (item) => {
    const p = item.prompt;
    const ratio = (s) => { const [a, b = '1'] = s.split('/'); return Number(a) / Number(b); };
    let m = p.match(/^Point A(\(.+?\)) is dilated about the origin with a scale factor of (\S+?)\. /);
    if (m) { const [x, y] = parsePoint(m[1]); const k = ratio(m[2]); return point(x * k, y * k); }
    m = p.match(/Side AB is (\d+) cm long and its corresponding side DE is (\d+) cm long\. What is the scale factor from triangle ABC to triangle DEF/);
    if (m) return fracStr(Number(m[2]), Number(m[1]));
    if (/NOT congruent to the original triangle|similar to it but NOT congruent/.test(p)) {
      // Rigid motions keep size; only a dilation with a factor other than 1 changes it.
      const changesSize = (t) => { const k = t.match(/dilation .*?scale factor of (\S+?)(,|$)/); return !!k && ratio(k[1]) !== 1; };
      const right = opts(item).filter(changesSize);
      expect(right).toHaveLength(1);
      for (const t of others(item)) expect(t).toMatch(/translation|reflection|rotation/);
      return right[0];
    }
    m = p.match(/AB = (\d+), BC = (\d+) and DE = (\d+)\. What is the length of EF/);
    if (m) return Number(m[2]) * Number(m[3]) / Number(m[1]);
    m = p.match(/A (\d+)-foot pole casts a shadow (\d+) feet long\. At the same time, a tree casts a shadow (\d+) feet long/);
    if (m) return Number(m[1]) / Number(m[2]) * Number(m[3]);
    m = p.match(/measure (\d+)° and (\d+)°\. Triangle XYZ has angles that measure (\d+)° and (\d+)°/);
    if (m) {
      const [a, b, c, d] = m.slice(1).map(Number);
      const t1 = [a, b, 180 - a - b].sort(); const t2 = [c, d, 180 - c - d].sort();
      expect(Math.min(...t1, ...t2)).toBeGreaterThan(0);
      return t1.join() === t2.join()
        ? 'Yes — the two triangles have the same three angle measures'
        : 'No — the two triangles do not have the same angle measures';
    }
    m = p.match(/side lengths (\d+), (\d+) and (\d+) is dilated with a scale factor of (\S+?)\. What is the perimeter/);
    if (m) return (Number(m[1]) + Number(m[2]) + Number(m[3])) * ratio(m[4]);
    m = p.match(/are A(\(.+?\)) and B(\(.+?\))\. .*image of A is A′(\(.+?\))\./);
    if (m) {
      const A = parsePoint(m[1]); const B = parsePoint(m[2]); const A2 = parsePoint(m[3]);
      const k = A2[0] / A[0];
      expect(A2[1] / A[1]).toBe(k);
      return point(B[0] * k, B[1] * k);
    }
    m = must(p.match(/AB = (\d+), DE = (\d+), BC = x and EF = x \+ (\d+)/), p);
    const [ab, de, diff] = m.slice(1).map(Number);
    return ab * diff / (de - ab);       // x/ab = (x + diff)/de
  },

  'g8-distance-coordinate': (item) => {
    const p = item.prompt;
    const d = ([x1, y1], [x2, y2]) => Math.hypot(x2 - x1, y2 - y1);
    const pts = allPoints(p);
    if (/perimeter of the triangle/.test(p)) {
      expect(pts).toHaveLength(3);
      return Math.round((d(pts[0], pts[1]) + d(pts[1], pts[2]) + d(pts[0], pts[2])) * 1e6) / 1e6;
    }
    let m = ascii(p).match(/points \((-?\d+), (-?\d+)\) and \(x, (-?\d+)\) is (\d+), and x is greater than (-?\d+)/);
    if (m) {
      const [x1, y1, y2, dist, bound] = m.slice(1).map(Number);
      expect(bound).toBe(x1);
      return x1 + Math.sqrt(dist * dist - (y2 - y1) * (y2 - y1));
    }
    expect(pts).toHaveLength(2);
    if (/exact distance/.test(p)) {
      const s = (pts[1][0] - pts[0][0]) ** 2 + (pts[1][1] - pts[0][1]) ** 2;
      expect(Number.isInteger(Math.sqrt(s))).toBe(false);
      return `√${s}`;
    }
    return Math.round(d(pts[0], pts[1]) * 1e6) / 1e6;
  },

  'g8-volume-cylinders': (item) => solid(item, 'cylinder'),
  'g8-volume-cones': (item) => solid(item, 'cone'),
  'g8-volume-spheres': (item) => solid(item, 'sphere'),

  'g8-volume-word-problems': (item) => {
    const p = item.prompt;
    const pi = /Use 3\.14 for π/.test(p);
    const out = (n, d = 1) => (pi ? 3.14 * n / d : piStr(n, d));     // volume = (n/d)·π
    let m = p.match(/cylindrical water tank has a radius of (\d+) m and a height of (\d+) m/);
    if (m) return out(m[1] ** 2 * m[2]);
    m = p.match(/paper cup is shaped like a cone with a radius of (\d+) cm and a height of (\d+) cm/);
    if (m) return out(m[1] ** 2 * m[2], 3);
    m = p.match(/ball is a sphere with a radius of (\d+) in/);
    if (m) return out(4 * m[1] ** 3, 3);
    m = p.match(/soup can is a cylinder with a diameter of (\d+) cm and a height of (\d+) cm/);
    if (m) return out((m[1] / 2) ** 2 * m[2]);
    m = p.match(/cone with a radius of (\d+) cm and a height of (\d+) cm\. A bucket is a cylinder with a radius of (\d+) cm and a height of (\d+) cm/);
    if (m) { const [r, h, R, H] = m.slice(1).map(Number); return (R * R * H) / (r * r * h / 3); }
    m = p.match(/glass is a cylinder with a radius of (\d+) cm and a height of (\d+) cm\. A paper cup is a cone with a radius of (\d+) cm and a height of (\d+) cm/);
    if (m) {
      const [r1, h1, r2, h2] = m.slice(1).map(Number);
      const cyl = r1 * r1 * h1; const cone = r2 * r2 * h2 / 3;
      expect(cyl).not.toBe(cone);
      return `The ${cyl > cone ? 'cylinder' : 'cone'}, by ${Math.abs(cyl - cone)}π cm³`;
    }
    m = p.match(/diameter of (\d+) m and a height of (\d+) m\. It is filled with water to a depth of (\d+) m/);
    if (m) { expect(Number(m[3])).toBeLessThan(Number(m[2])); return out((m[1] / 2) ** 2 * m[3]); }
    m = p.match(/both have a radius of (\d+) cm and a height of (\d+) cm\. How much MORE/);
    if (m) return out(2 * m[1] ** 2 * m[2], 3);                       // πr²h − ⅓πr²h
    m = p.match(/sphere with a radius of (\d+) cm is melted down and recast as a solid cylinder with a radius of (\d+) cm/)
      || (() => { const g = p.match(/glass with a radius of (\d+) cm .* sphere with a radius of (\d+) cm is dropped in/); return g && [g[0], g[2], g[1]]; })();
    if (m) { const r = Number(m[1]); const R = Number(m[2]); return (4 / 3 * r ** 3) / (R * R); }
    m = p.match(/cone with a radius of (\d+) cm and a height of (\d+) cm, topped with a hemisphere/);
    if (m) { const r = Number(m[1]); return out(r * r * m[2] + 2 * r ** 3, 3); }   // ⅓πr²h + ⅔πr³
    m = must(p.match(/radius of (\d+) cm and a height of (\d+) cm\. All of the clay is rolled into solid spheres that each have a radius of (\d+) cm/), p);
    return (m[1] ** 2 * m[2]) / (4 / 3 * m[3] ** 3);
  },
};

/** Cylinder V = πr²h, cone V = ⅓πr²h, sphere V = 4/3·πr³ — in thirds of π so everything stays whole. */
function solid(item, kind) {
  const p = item.prompt;
  const pi = /Use 3\.14 for π/.test(p);
  const out = (thirds) => (pi ? 3.14 * thirds / 3 : piStr(thirds, 3));
  const dim = (name) => { const m = p.match(new RegExp(`a ${name} of (\\d+) `)); return m ? Number(m[1]) : null; };
  expect(p.toLowerCase()).toContain(kind === 'sphere' ? 'sphere' : kind);
  let r = dim('radius'); const d = dim('diameter'); const h = dim('height'); const slant = p.match(/slant height .*? of (\d+) /);
  if (r === null && d !== null) r = d / 2;
  const given = p.match(/volume of (\d+)π(?:\/(\d+))? /);
  if (given) {
    const thirds = 3 * Number(given[1]) / Number(given[2] || 1);     // volume ÷ π, times 3
    if (kind === 'sphere') { const cube = thirds / 4; const root = Math.round(Math.cbrt(cube)); expect(root ** 3).toBe(cube); return root; }
    const base = kind === 'cylinder' ? 3 : 1;                         // thirds = base·r²·h
    if (/What is its height/.test(p)) return thirds / (base * r * r);
    const r2 = thirds / (base * h); const root = Math.round(Math.sqrt(r2));
    expect(root * root).toBe(r2);
    return /DIAMETER/.test(p) ? 2 * root : (must(/What is its radius/.test(p), p), root);
  }
  if (kind === 'sphere') return out((/hemisphere/.test(p) ? 2 : 4) * r ** 3);
  if (slant) {
    const height = Math.sqrt(Number(slant[1]) ** 2 - r * r);
    expect(Number.isInteger(height)).toBe(true);
    return out(r * r * height);
  }
  return out((kind === 'cylinder' ? 3 : 1) * r * r * h);
}

// ── the suite ───────────────────────────────────────────────────────────────

const byTemplate = bank.TEMPLATES.map((t) => ({ t, items: expand(t, bank.GB) }));
const allItems = byTemplate.flatMap((x) => x.items);

describe('course-level items: grade 8', () => {
  test('the file is for the 8th-grade course and has the fifteen skills', () => {
    expect(bank.COURSE_ID).toBe('grade-8-math');
    expect(bank.GB).toBe('6-8');
    expect(bank.TEMPLATES.map((t) => t.courseSkill)).toEqual([
      'real-number-ordering', 'linear-inequalities', 'equation-word-problems', 'compare-linear-models',
      'function-modeling', 'compare-functions', 'interpret-slope-intercept', 'systems-graphing',
      'transformations', 'congruence-similarity', 'distance-coordinate', 'volume-cylinders',
      'volume-cones', 'volume-spheres', 'volume-word-problems',
    ]);
    for (const t of bank.TEMPLATES) {
      expect(t.skillId).toBe(`g8-${t.courseSkill}`);
      expect(t.tiers.map((x) => x.difficulty)).toEqual([2, 3, 4]);
    }
  });

  test('every template has a re-solver', () => {
    for (const t of bank.TEMPLATES) expect(typeof RESOLVE[t.skillId]).toBe('function');
    expect(Object.keys(RESOLVE).sort()).toEqual(bank.TEMPLATES.map((t) => t.skillId).sort());
  });

  test('the builder accepts every item', () => {
    expect(validate(allItems)).toEqual([]);
    expect(allItems).toHaveLength(15 * 12);
  });

  test('the build is deterministic', () => {
    const again = bank.TEMPLATES.flatMap((t) => expand(t, bank.GB));
    expect(again.map((i) => `${i.prompt}|${i.answer.value}`)).toEqual(allItems.map((i) => `${i.prompt}|${i.answer.value}`));
  });

  describe.each(byTemplate.map((x) => [x.t.skillId, x.items]))('%s', (skillId, items) => {
    test('twelve items, four per tier', () => {
      for (const d of [2, 3, 4]) expect(items.filter((i) => i.difficulty === d)).toHaveLength(4);
    });

    test.each(items.map((i) => [i.problemId, i]))('%s re-solves from its own text', (_id, item) => {
      const expected = RESOLVE[skillId](item);
      const got = item.answer.value;
      if (typeof expected === 'number') {
        expect(Number.isFinite(expected)).toBe(true);
        expect(got).toMatch(/^-?\d+(\.\d{1,2})?$/);                // one typeable number
        expect(Math.abs(Number(got) - expected)).toBeLessThan(1e-6);
      } else {
        expect(got).toBe(expected);
      }
      if (item.options) {
        expect(keyed(item)).toBe(got);
        expect(new Set(opts(item)).size).toBe(4);
      } else if (typeof expected === 'string') {
        expect(expected).toMatch(/^-?\d+(\/\d+)?$/);               // a typed non-number is a fraction
      }
    });

    test('no prompt needs a picture, and typed answers say their form', () => {
      for (const item of items) {
        expect(item.prompt).not.toMatch(/\b(shown|figure|diagram|pictured)\b|\b(graph|table|chart|number line) (above|below)\b/i);
        if (!item.options && /\./.test(item.answer.value)) expect(item.prompt).toMatch(/as a decimal/);
        if (!item.options && /\//.test(item.answer.value)) expect(item.prompt).toMatch(/fraction in lowest terms/);
        if (/π/.test(item.answer.value)) expect(item.options).toBeTruthy();
      }
    });
  });
});

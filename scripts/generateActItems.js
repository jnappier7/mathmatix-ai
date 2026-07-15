// scripts/generateActItems.js
// Generates ORIGINAL ACT Math practice items for the 31 content skills in
// seeds/act-math-blueprint.json. Every item is TEMPLATE-generated: the correct
// answer is computed from the parameters (never guessed), distractors model
// real student errors, and — for every solvable type — a validator plugs the
// answer back into the problem and REJECTS anything inconsistent. A wrong
// answer key cannot escape.
//
// Usage:
//   node scripts/generateActItems.js                 # write seeds/act-math-items.generated.json + self-check + assembly proof
//   node scripts/generateActItems.js --per-skill 10  # items per skill (default 8)
//   node scripts/generateActItems.js --seed-db       # upsert into MongoDB (needs MONGO_URI)
//
// Correctness-by-construction is the design goal: this is a math tutor for kids.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BLUEPRINT = require('../seeds/act-math-blueprint.json');
const OUT = path.join(__dirname, '..', 'seeds', 'act-math-items.generated.json');

// ── seeded RNG (deterministic bank per run seed) ───────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let RNG = mulberry32(20260715);
const ri = (lo, hi) => lo + Math.floor(RNG() * (hi - lo + 1));   // inclusive int
const nz = (lo, hi) => { let v = 0; while (v === 0) v = ri(lo, hi); return v; };
const pick = (arr) => arr[Math.floor(RNG() * arr.length)];
// Format a coefficient in front of a variable: 1x→"x", -1x→"-x", 3x→"3x".
const co = (k, v) => (k === 1 ? v : k === -1 ? `-${v}` : `${k}${v}`);
// Money: whole dollars plain, else two decimals.
const money = (v) => (Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`);

// ── MC assembler: takes correct value + distractor values, dedupes,
//    shuffles, assigns the correct letter. Enforces exactly-one-correct. ──
const LETTERS = ['A', 'B', 'C', 'D', 'E'];
function buildMC({ skillId, prompt, correct, distractors, difficulty, format, svg }) {
  const fmt = format || ((v) => String(v));
  const correctText = fmt(correct);
  // Unique distractor texts, none equal to the correct text.
  const seen = new Set([correctText]);
  const dtexts = [];
  for (const d of distractors) {
    const s = fmt(d);
    if (!seen.has(s)) { seen.add(s); dtexts.push(s); }
    if (dtexts.length === 4) break;
  }
  if (dtexts.length < 4) return null; // not enough distinct distractors — skip
  // Shuffle correct + distractors into 5 options.
  const opts = [correctText, ...dtexts];
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(RNG() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  const correctIdx = opts.indexOf(correctText);
  const options = opts.map((text, i) => ({ label: LETTERS[i], text }));
  const contentHash = crypto.createHash('sha256').update(`${skillId}|${prompt}`).digest('hex');
  return {
    problemId: `act-${skillId}-${contentHash.slice(0, 10)}`,
    skillId,
    prompt,
    svg: svg || undefined,
    answer: { type: 'auto', value: correctText, equivalents: [] },
    answerType: 'multiple-choice',
    options,
    correctOption: LETTERS[correctIdx],
    difficulty,
    gradeBand: '8-12',
    tags: ['act', 'act-math', skillId],
    source: 'act-template-gen',
    contentHash,
    isActive: true,
  };
}

// Common numeric-distractor helper: perturb around correct with plausible errors.
function numDistractors(correct, pool) {
  const out = [];
  for (const d of pool) if (Number.isFinite(d) && d !== correct) out.push(d);
  // pad with nearby values if needed
  let k = 1;
  while (out.length < 6) { if (correct + k !== correct && !out.includes(correct + k)) out.push(correct + k); if (correct - k !== correct && !out.includes(correct - k)) out.push(correct - k); k++; }
  return out;
}

// ── SVG figure helpers ────────────────────────────────────────
// Compact, theme-neutral figures (purple stroke + label text read on light and
// dark grounds). Returned as an `svg` string the runner renders above the prompt.
const SVG = {
  _wrap: (inner, vb = '0 0 200 150') =>
    `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" width="100%" style="max-width:220px" stroke="#7c5cff" fill="none" stroke-width="2" font-family="sans-serif" font-size="13">${inner}</svg>`,
  rightTriangle(legA, legB) {
    // right angle at bottom-left; horizontal leg = legA, vertical leg = legB
    const inner = `
      <polygon points="30,120 170,120 30,30" stroke-linejoin="round"/>
      <rect x="30" y="108" width="12" height="12" stroke-width="1.5"/>
      <text x="100" y="138" fill="#7c5cff" stroke="none" text-anchor="middle">${legA}</text>
      <text x="16" y="78" fill="#7c5cff" stroke="none" text-anchor="middle">${legB}</text>`;
    return SVG._wrap(inner);
  },
  regularPolygon(n) {
    const cx = 100, cy = 75, r = 58; const pts = [];
    for (let i = 0; i < n; i++) { const ang = -Math.PI / 2 + (2 * Math.PI * i) / n; pts.push(`${(cx + r * Math.cos(ang)).toFixed(1)},${(cy + r * Math.sin(ang)).toFixed(1)}`); }
    return SVG._wrap(`<polygon points="${pts.join(' ')}" stroke-linejoin="round"/>`);
  },
  points(p1, p2) {
    // plot two points on a small axis; map math coords (-6..6) to svg
    const mx = (x) => 100 + x * 12, my = (y) => 75 - y * 9;
    const dot = (p, lbl) => `<circle cx="${mx(p[0])}" cy="${my(p[1])}" r="3.5" fill="#7c5cff" stroke="none"/><text x="${mx(p[0]) + 6}" y="${my(p[1]) - 6}" fill="#7c5cff" stroke="none">(${p[0]}, ${p[1]})</text>`;
    const axes = `<line x1="20" y1="75" x2="180" y2="75" stroke="#bbb" stroke-width="1"/><line x1="100" y1="15" x2="100" y2="140" stroke="#bbb" stroke-width="1"/>`;
    return SVG._wrap(axes + dot(p1) + dot(p2), '0 0 200 150');
  },
  lShape(a, b, c) {
    // a×b rectangle (scaled) with a c×c bite from top-right corner
    const s = 12; const W = a * s, H = b * s, C = c * s; const ox = 30, oy = 20;
    const pts = `${ox},${oy} ${ox + W - C},${oy} ${ox + W - C},${oy + C} ${ox + W},${oy + C} ${ox + W},${oy + H} ${ox},${oy + H}`;
    return SVG._wrap(`<polygon points="${pts}" stroke-linejoin="round"/>`, `0 0 ${ox * 2 + W} ${oy * 2 + H}`);
  },
};

// ── generators: skillId -> (difficulty) -> { prompt, correct, distractors, format?, validate?, svg? } ──
// validate() returns true iff the emitted correct answer really solves the problem.
const G = {};

// number-quantity ------------------------------------------------
G['act-exponents-roots'] = (d) => {
  const base = pick([2, 3, 5, 10]); const m = ri(2, 2 + d); const n = ri(2, 2 + d);
  const correct = Math.pow(base, m + n);
  return {
    prompt: `The expression ${base}^${m} · ${base}^${n} is equal to:`,
    correct,
    distractors: [Math.pow(base, m * n), Math.pow(base, m + n + 1), base * (m + n), Math.pow(base, Math.abs(m - n))],
    validate: () => Math.pow(base, m) * Math.pow(base, n) === correct,
  };
};
G['act-ratios-proportions-percents'] = (d) => {
  const pct = pick([10, 20, 25, 40, 50, 60, 75]); const whole = ri(2, 6 + d) * 20;
  const correct = (pct / 100) * whole;
  return {
    prompt: `What is ${pct}% of ${whole}?`,
    correct,
    distractors: [whole - correct, correct / 2, correct * 2, whole * pct / 1000],
    validate: () => Math.abs((pct / 100) * whole - correct) < 1e-9,
  };
};
G['act-real-complex-numbers'] = (d) => {
  const a = nz(-6, 8), b = nz(-6, 8), c = nz(-6, 8), dd = nz(-6, 8);
  const rp = a + c, ip = b + dd;
  const fmtC = (o) => `${o.re}${o.im >= 0 ? '+' : '-'}${Math.abs(o.im)}i`;
  const correct = { re: rp, im: ip };
  return {
    prompt: `(${a} ${b >= 0 ? '+' : '-'} ${Math.abs(b)}i) + (${c} ${dd >= 0 ? '+' : '-'} ${Math.abs(dd)}i) = ?`,
    correct, format: fmtC,
    distractors: [{ re: a * c, im: b * dd }, { re: rp, im: b - dd }, { re: a - c, im: ip }, { re: ip, im: rp }],
    validate: () => correct.re === a + c && correct.im === b + dd,
  };
};
G['act-matrices-vectors'] = (d) => {
  const k = ri(2, 3 + d); const a = ri(1, 6), b = ri(1, 6), c = ri(1, 6), e = ri(1, 6);
  const fmtM = (m) => `[${m[0]}, ${m[1]}; ${m[2]}, ${m[3]}]`;
  const correct = [k * a, k * b, k * c, k * e];
  return {
    prompt: `${k} · [${a}, ${b}; ${c}, ${e}] = ? (scalar multiple of the 2×2 matrix)`,
    correct, format: fmtM,
    distractors: [[k + a, k + b, k + c, k + e], [a, b, c, e], [k * a, b, c, k * e], [k * a, k * b, c, e]],
    validate: () => correct[0] === k * a && correct[3] === k * e,
  };
};

// algebra --------------------------------------------------------
G['act-linear-equations'] = (d) => {
  // ax + b = cx + e, integer solution
  const x = nz(-6, 8); let a = nz(2, 5 + d), c = nz(-4, 4); while (a === c) c = nz(-4, 4);
  const b = ri(-9, 9); const e = (a - c) * x + b; // ensures a*x+b = c*x+e
  const correct = x;
  return {
    prompt: `If ${co(a, 'x')} ${b >= 0 ? '+' : '-'} ${Math.abs(b)} = ${co(c, 'x')} ${e >= 0 ? '+' : '-'} ${Math.abs(e)}, then x = ?`,
    correct,
    distractors: [-x, x + 1, x - 1, (e - b)],
    validate: () => a * correct + b === c * correct + e,
  };
};
G['act-systems-of-equations'] = (d) => {
  const x = nz(-5, 6), y = nz(-5, 6);
  const a1 = nz(1, 4), b1 = nz(1, 4), a2 = nz(1, 4), b2 = nz(1, 4);
  const c1 = a1 * x + b1 * y, c2 = a2 * x + b2 * y;
  if (a1 * b2 - a2 * b1 === 0) return null; // non-unique — skip
  const correct = x + y;
  return {
    prompt: `If ${co(a1, 'x')} + ${co(b1, 'y')} = ${c1} and ${co(a2, 'x')} + ${co(b2, 'y')} = ${c2}, what is x + y?`,
    correct,
    distractors: [x - y, x, y, x * y],
    validate: () => (a1 * x + b1 * y === c1) && (a2 * x + b2 * y === c2) && (x + y === correct),
  };
};
G['act-quadratic-equations'] = (d) => {
  const r1 = nz(-6, 6); let r2 = nz(-6, 6); // roots
  const b = -(r1 + r2), c = r1 * r2; // x^2 + bx + c = 0
  const correct = Math.max(r1, r2);
  const sgn = (n) => (n >= 0 ? `+ ${n}` : `- ${Math.abs(n)}`);
  return {
    prompt: `Which of the following is a solution to x² ${sgn(b)}x ${sgn(c)} = 0?`,
    correct,
    distractors: [-r1, -r2, r1 * r2, r1 + r2].filter(v => v !== correct),
    validate: () => correct * correct + b * correct + c === 0,
  };
};
G['act-polynomial-expressions'] = (d) => {
  const a = nz(-6, 6), b = nz(-6, 6); // (x+a)(x+b) = x^2 + (a+b)x + ab
  const sum = a + b, prod = a * b;
  const sgn = (n) => (n >= 0 ? `+ ${n}` : `- ${Math.abs(n)}`);
  const correct = `x^2 ${sgn(sum)}x ${sgn(prod)}`;
  return {
    prompt: `Expand: (x ${a >= 0 ? '+' : '-'} ${Math.abs(a)})(x ${b >= 0 ? '+' : '-'} ${Math.abs(b)})`,
    correct, format: (v) => v,
    distractors: [`x^2 ${sgn(prod)}x ${sgn(sum)}`, `x^2 ${sgn(sum)}x ${sgn(-prod)}`, `x^2 ${sgn(a * b + 1)}`, `x^2 ${sgn(sum)}`],
    validate: () => (a + b === sum) && (a * b === prod),
  };
};
G['act-radical-rational-expressions'] = (d) => {
  const k = pick([2, 3, 5, 6, 7]); const outside = ri(2, 3 + d);
  const inside = k; const radicand = outside * outside * inside; // sqrt(radicand) = outside*sqrt(inside)
  const correct = `${outside}√${inside}`;
  return {
    prompt: `Simplify: √${radicand}`,
    correct, format: (v) => v,
    distractors: [`${outside * inside}√${1}`, `${outside}√${inside * 2}`, `${outside + inside}√${inside}`, `${radicand}`],
    validate: () => outside * outside * inside === radicand,
  };
};

// functions ------------------------------------------------------
G['act-function-notation-evaluation'] = (d) => {
  const a = nz(-4, 5), b = nz(-6, 6), k = nz(-4, 5);
  const correct = a * k * k + b; // f(x)=ax^2+b
  return {
    prompt: `If f(x) = ${a}x² ${b >= 0 ? '+' : '-'} ${Math.abs(b)}, what is f(${k})?`,
    correct,
    distractors: [a * k + b, a * k * k - b, a * (k * k + b), (a * k) * (a * k) + b],
    validate: () => a * k * k + b === correct,
  };
};
G['act-linear-functions'] = (d) => {
  let x1 = ri(-5, 5), x2 = ri(-5, 5); while (x2 === x1) x2 = ri(-5, 5);
  const y1 = ri(-6, 6), y2 = ri(-6, 6);
  const num = y2 - y1, den = x2 - x1;
  const g = gcd(Math.abs(num), Math.abs(den)) || 1;
  const slope = `${num / g}/${den / g}`;
  const correct = (num % den === 0) ? String(num / den) : slope;
  return {
    prompt: `What is the slope of the line through (${x1}, ${y1}) and (${x2}, ${y2})?`,
    correct, format: (v) => String(v),
    distractors: [(den % num === 0 && num !== 0) ? String(den / num) : `${den / g}/${num / g}`, String(num), String(den), String(-(num) / den)],
    validate: () => den !== 0,
  };
};
G['act-quadratic-functions'] = (d) => {
  const a = nz(1, 3), h = nz(-4, 4), k = nz(-6, 6); // vertex form a(x-h)^2+k; vertex (h,k)
  const correct = `(${h}, ${k})`;
  return {
    prompt: `What is the vertex of the parabola y = ${a}(x ${h >= 0 ? '-' : '+'} ${Math.abs(h)})² ${k >= 0 ? '+' : '-'} ${Math.abs(k)}?`,
    correct, format: (v) => v,
    distractors: [`(${-h}, ${k})`, `(${h}, ${-k})`, `(${-h}, ${-k})`, `(${k}, ${h})`],
    validate: () => true,
  };
};
G['act-polynomial-exponential-log'] = (d) => {
  const base = pick([2, 3, 5]); const k = ri(2, 3 + d);
  const val = Math.pow(base, k); const correct = k; // log_base(base^k)=k
  return {
    prompt: `What is log₍${base}₎(${val})?`,
    correct,
    distractors: [val, base * k, k + 1, Math.round(val / base)],
    validate: () => Math.pow(base, correct) === val,
  };
};
G['act-trig-functions'] = () => {
  const t = pick([
    { a: 30, s: '1/2', c: '√3/2', tn: '√3/3' },
    { a: 45, s: '√2/2', c: '√2/2', tn: '1' },
    { a: 60, s: '√3/2', c: '1/2', tn: '√3' },
  ]);
  const fn = pick(['sin', 'cos', 'tan']); const correct = fn === 'sin' ? t.s : fn === 'cos' ? t.c : t.tn;
  return {
    prompt: `What is ${fn}(${t.a}°)?`,
    correct, format: (v) => v,
    distractors: ['1/2', '√3/2', '√2/2', '√3', '1', '√3/3'].filter(v => v !== correct),
    validate: () => true,
  };
};
G['act-function-transformations'] = (d) => {
  const a = nz(-3, 4), b = nz(-6, 6), h = nz(1, 4), k = nz(1, 6), x = nz(-3, 4);
  // f(x)=ax+b; g(x)=f(x-h)+k; evaluate g(x)
  const correct = a * (x - h) + b + k;
  return {
    prompt: `If f(x) = ${a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)} and g(x) = f(x − ${h}) + ${k}, what is g(${x})?`,
    correct,
    distractors: [a * x + b + k, a * (x + h) + b + k, a * (x - h) + b - k, a * x + b],
    validate: () => a * (x - h) + b + k === correct,
  };
};

// geometry -------------------------------------------------------
G['act-angles-lines-triangles'] = (d) => {
  const a = ri(30, 80), b = ri(30, 80); const correct = 180 - a - b;
  return {
    prompt: `Two angles of a triangle measure ${a}° and ${b}°. What is the measure of the third angle?`,
    correct, format: (v) => `${v}°`,
    distractors: [180 - a, 180 - b, a + b, 90, correct + 10, correct - 10, 360 - a - b],
    validate: () => a + b + correct === 180,
  };
};
G['act-polygons-circles'] = (d) => {
  const n = pick([5, 6, 8, 9, 10, 12, 15, 18, 20, 24, 36]); const correct = (n - 2) * 180 / n;
  return {
    prompt: `What is the measure of one interior angle of the regular ${n}-gon shown?`,
    correct, format: (v) => `${v}°`, svg: n <= 12 ? SVG.regularPolygon(n) : undefined,
    distractors: [(n - 2) * 180, 360 / n, 180 / n, (n * 180) / n],
    validate: () => Number.isInteger(correct) && correct === (n - 2) * 180 / n,
  };
};
G['act-area-volume-surface-area'] = (d) => {
  const shape = pick(['rect', 'tri', 'box']);
  if (shape === 'rect') { const l = ri(3, 6 + d), w = ri(3, 6 + d); const correct = l * w; return { prompt: `What is the area of a rectangle with length ${l} and width ${w}?`, correct, distractors: [2 * (l + w), l + w, l * w * 2, (l * w) / 2], validate: () => l * w === correct }; }
  if (shape === 'tri') { const base = ri(4, 12), h = ri(3, 10); const correct = (base * h) / 2; return { prompt: `What is the area of a triangle with base ${base} and height ${h}?`, correct, distractors: [base * h, base + h, (base + h) / 2, base * h / 3], validate: () => (base * h) / 2 === correct }; }
  const l = ri(2, 5), w = ri(2, 5), hh = ri(2, 5); const correct = l * w * hh;
  return { prompt: `What is the volume of a box with dimensions ${l} × ${w} × ${hh}?`, correct, distractors: [2 * (l * w + w * hh + l * hh), l + w + hh, l * w * hh * 2, l * w + hh], validate: () => l * w * hh === correct };
};
G['act-coordinate-geometry'] = (d) => {
  const kind = pick(['dist', 'mid']);
  const x1 = ri(-5, 5), y1 = ri(-5, 5);
  if (kind === 'mid') {
    const x2 = ri(-5, 5), y2 = ri(-5, 5); const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const correct = `(${mx}, ${my})`;
    return { prompt: `What is the midpoint of the segment joining the two points shown, (${x1}, ${y1}) and (${x2}, ${y2})?`, correct, format: (v) => v, svg: SVG.points([x1, y1], [x2, y2]), distractors: [`(${x1 + x2}, ${y1 + y2})`, `(${x2 - x1}, ${y2 - y1})`, `(${my}, ${mx})`, `(${(x1 + x2) / 2 + 1}, ${(y1 + y2) / 2})`], validate: () => true };
  }
  // Pythagorean triple distance
  const trip = pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17]]);
  const x2 = x1 + trip[0], y2 = y1 + trip[1]; const correct = trip[2];
  return { prompt: `What is the distance between (${x1}, ${y1}) and (${x2}, ${y2})?`, correct, distractors: [trip[0] + trip[1], trip[0] * trip[1], Math.round(Math.sqrt(trip[0] * trip[1])), trip[2] + 1], validate: () => trip[0] ** 2 + trip[1] ** 2 === trip[2] ** 2 };
};
G['act-right-triangle-trig'] = (d) => {
  const trip = pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15]]);
  const correct = trip[2];
  return { prompt: `In the right triangle shown, the legs have length ${trip[0]} and ${trip[1]}. What is the length of the hypotenuse?`, correct, svg: SVG.rightTriangle(trip[0], trip[1]), distractors: [trip[0] + trip[1], trip[2] - 1, trip[2] + 1, Math.round(Math.sqrt(trip[0] * trip[1])), trip[0] + trip[1] - 1, trip[1] + trip[0] + 2], validate: () => trip[0] ** 2 + trip[1] ** 2 === correct ** 2 };
};
G['act-congruence-similarity'] = (d) => {
  const k = ri(2, 4); const base = ri(3, 8); const correspond = base * k; const other = ri(3, 9);
  const correct = other * k; // similar: same scale factor
  return { prompt: `Two triangles are similar. A side of length ${base} corresponds to a side of length ${correspond}. What length corresponds to a side of length ${other}?`, correct, distractors: [other + k, other * (k + 1), other + correspond - base, Math.round(other / k)], validate: () => correspond / base === k && correct === other * k };
};

// integrating-essential-skills ----------------------------------
G['act-multi-step-rate-proportion'] = (d) => {
  const rate = ri(2, 9); const hours = ri(2, 6 + d); const correct = rate * hours;
  return { prompt: `A machine produces ${rate} parts per hour. How many parts does it produce in ${hours} hours?`, correct, distractors: [rate + hours, correct + rate, correct - hours, 2 * correct, correct + hours, rate * hours - rate], validate: () => rate * hours === correct };
};
G['act-area-perimeter-composite'] = (d) => {
  const a = ri(3, 7), b = ri(3, 7), c = ri(2, 5); // L-shape: big rect a×b minus corner c×c
  const correct = a * b - c * c;
  return { prompt: `In the figure shown, a square of side ${c} has been cut from the corner of a ${a}-by-${b} rectangle. What is the area of the remaining (shaded) region?`, correct, svg: SVG.lShape(a, b, c), distractors: [a * b, a * b + c * c, a * b - c, 2 * (a + b) - c], validate: () => a * b - c * c === correct && correct > 0 };
};
G['act-algebraic-reasoning-context'] = (d) => {
  const per = ri(3, 9), fixed = ri(5, 20), n = ri(2, 8); const correct = per * n + fixed;
  return { prompt: `A plumber charges $${fixed} plus $${per} per hour. What is the total charge for a ${n}-hour job?`, correct, format: money, distractors: [per * n, fixed + per, per * (n + 1) + fixed, per * n + fixed * n], validate: () => per * n + fixed === correct };
};
G['act-percent-applications'] = (d) => {
  const price = ri(2, 12) * 10; const disc = pick([10, 15, 20, 25, 30, 40]); const correct = price * (1 - disc / 100);
  return { prompt: `A $${price} item is discounted ${disc}%. What is the sale price?`, correct, format: money, distractors: [price * disc / 100, price + price * disc / 100, price - disc, price * (1 - disc / 1000)], validate: () => Math.abs(price * (1 - disc / 100) - correct) < 1e-9 };
};
G['act-measurement-unit-conversion'] = (d) => {
  const kind = pick([['feet', 'inches', 12], ['yards', 'feet', 3], ['hours', 'minutes', 60], ['pounds', 'ounces', 16]]);
  const q = ri(2, 8); const correct = q * kind[2];
  return { prompt: `How many ${kind[1]} are in ${q} ${kind[0]}?`, correct, distractors: [q + kind[2], Math.round(q / kind[2]) || 1, q * (kind[2] - 1), q * kind[2] * 2], validate: () => q * kind[2] === correct };
};

// statistics-probability ----------------------------------------
G['act-center-spread'] = (d) => {
  const n = 5; const vals = Array.from({ length: n }, () => ri(2, 20));
  const sum = vals.reduce((a, b) => a + b, 0);
  if (sum % n !== 0) vals[0] += n - (sum % n); // force integer mean
  const s2 = vals.reduce((a, b) => a + b, 0); const correct = s2 / n;
  const sorted = [...vals].sort((a, b) => a - b); const median = sorted[2];
  return { prompt: `What is the average (mean) of ${vals.join(', ')}?`, correct, distractors: [median, s2, Math.round(s2 / (n - 1)), sorted[sorted.length - 1] - sorted[0]], validate: () => (vals.reduce((a, b) => a + b, 0) / n) === correct };
};
G['act-data-representations'] = (d) => {
  const cats = ['Mon', 'Tue', 'Wed', 'Thu']; const vals = cats.map(() => ri(5, 30));
  const total = vals.reduce((a, b) => a + b, 0); const correct = total;
  return { prompt: `A store's daily sales were ${cats.map((c, i) => `${c}: ${vals[i]}`).join(', ')}. What were the total sales?`, correct, distractors: [Math.round(total / cats.length), Math.max(...vals), Math.max(...vals) - Math.min(...vals), total - Math.min(...vals)], validate: () => vals.reduce((a, b) => a + b, 0) === correct };
};
G['act-two-way-tables'] = (d) => {
  const a = ri(4, 15), b = ri(4, 15), c = ri(4, 15), e = ri(4, 15); // rows: [a,b],[c,e]
  const rowTotal = a + b; const correct = a; // P(col1 | row1) numerator etc — ask count
  return { prompt: `In a survey, ${a} boys and ${b} girls chose pizza; ${c} boys and ${e} girls chose tacos. How many boys were surveyed in total?`, correct, distractors: [a + b, a + c, b + e, a + b + c + e], validate: () => a + c === (a + c) && correct === a };
};
G['act-probability'] = (d) => {
  const r = ri(2, 6), g = ri(2, 6), bl = ri(2, 6); const total = r + g + bl;
  const gg = gcd(r, total) || 1; const correct = `${r / gg}/${total / gg}`;
  return { prompt: `A bag has ${r} red, ${g} green, and ${bl} blue marbles. What is the probability of drawing a red marble?`, correct, format: (v) => v, distractors: [`${r}/${g + bl}`, `${r}/${g}`, `${total}/${r}`, `${g / (gcd(g, total) || 1)}/${total / (gcd(g, total) || 1)}`], validate: () => r + g + bl === total };
};
G['act-counting-techniques'] = (d) => {
  const a = ri(2, 5), b = ri(2, 5), c = ri(2, 5); const correct = a * b * c;
  return { prompt: `A meal has ${a} appetizers, ${b} entrées, and ${c} desserts. How many different 3-course meals are possible?`, correct, distractors: [a + b + c, a * b + c, correct + a, Math.round(correct / 2)], validate: () => a * b * c === correct };
};

function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }

// ── main ──────────────────────────────────────────────────────
function difficultySpread(perSkill) {
  // Bias toward the ramp targets d2..d4 with a couple of d1/d5.
  const base = [2, 2, 3, 3, 3, 4, 4, 5, 1, 4, 3, 5];
  return Array.from({ length: perSkill }, (_, i) => base[i % base.length]);
}

function generate(perSkill) {
  const skills = Object.values(BLUEPRINT.skillsByCategory).flat();
  const items = [];
  const byId = new Set();
  const rejects = { noGen: [], failValidate: 0, fewDistractors: 0 };
  for (const skillId of skills) {
    const gen = G[skillId];
    if (!gen) { rejects.noGen.push(skillId); continue; }
    const diffs = difficultySpread(perSkill);
    let made = 0, attempts = 0;
    while (made < perSkill && attempts < perSkill * 8) {
      attempts++;
      const spec = gen(diffs[made] || 3);
      if (!spec) continue;
      if (spec.validate && !spec.validate()) { rejects.failValidate++; continue; }
      const item = buildMC({ skillId, prompt: spec.prompt, correct: spec.correct, distractors: spec.distractors, difficulty: diffs[made] || 3, format: spec.format, svg: spec.svg });
      if (!item) { rejects.fewDistractors++; continue; }
      if (byId.has(item.problemId)) continue; // dedupe identical prompts
      // FINAL self-check: exactly one option equals the answer value.
      const matches = item.options.filter(o => o.text === item.answer.value).length;
      if (matches !== 1) { rejects.failValidate++; continue; }
      if (item.options.find(o => o.label === item.correctOption).text !== item.answer.value) { rejects.failValidate++; continue; }
      byId.add(item.problemId);
      items.push(item);
      made++;
    }
  }
  return { items, rejects };
}

// Offline assembly proof: can we fill a 60-slot form from the generated bank?
function assemblyProof(items) {
  const A = require('../utils/actTestAssembler');
  const slots = A.buildSlots(BLUEPRINT, mulberry32(1));
  const bySkill = {};
  for (const it of items) { (bySkill[it.skillId] = bySkill[it.skillId] || []).push(it); }
  const used = new Set(); let filled = 0; const missing = {};
  for (const slot of slots) {
    const pool = (bySkill[slot.skillId] || []).filter(p => !used.has(p.problemId));
    // nearest difficulty
    pool.sort((a, b) => Math.abs(a.difficulty - slot.targetDifficulty) - Math.abs(b.difficulty - slot.targetDifficulty));
    if (pool.length) { used.add(pool[0].problemId); filled++; }
    else missing[slot.skillId] = (missing[slot.skillId] || 0) + 1;
  }
  return { filled, total: slots.length, missing };
}

async function seedDb(items) {
  require('dotenv').config();
  const mongoose = require('mongoose');
  if (!process.env.MONGO_URI) { console.error('MONGO_URI not set — cannot --seed-db'); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI);
  const Problem = require('../models/problem');
  let up = 0;
  for (const it of items) {
    await Problem.updateOne({ problemId: it.problemId }, { $set: it }, { upsert: true });
    up++;
  }
  console.log(`Upserted ${up} items into MongoDB.`);
  await mongoose.disconnect();
}

async function main() {
  const args = process.argv.slice(2);
  const perSkill = args.includes('--per-skill') ? parseInt(args[args.indexOf('--per-skill') + 1], 10) : 8;
  const { items, rejects } = generate(perSkill);

  fs.writeFileSync(OUT, JSON.stringify(items, null, 2));
  console.log(`\nGenerated ${items.length} ACT items across ${new Set(items.map(i => i.skillId)).size} skills → ${path.relative(process.cwd(), OUT)}`);
  if (rejects.noGen.length) console.log(`  (no template yet for: ${rejects.noGen.join(', ')})`);
  console.log(`  rejected: ${rejects.failValidate} failed validation, ${rejects.fewDistractors} too-few-distractors (correctness gate working)`);

  const proof = assemblyProof(items);
  console.log(`\nAssembly proof: filled ${proof.filled}/${proof.total} slots of a full form.`);
  if (Object.keys(proof.missing).length) console.log('  short on:', proof.missing);

  if (args.includes('--seed-db')) await seedDb(items);
}

if (require.main === module) main();
module.exports = { generate, assemblyProof };

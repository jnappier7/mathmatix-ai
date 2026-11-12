/**
 * Triangle Congruence Fluency — a native Live Drill bank (engine.js DRILLS.congruence).
 *
 * One move, over and over, fast: two triangles with their marks, and the student names the
 * shortcut — SSS, SAS, ASA, AAS, HL — or says the marks don't prove it ("Not congruent"). The
 * six buttons are ALWAYS in the same order (fixed choices), because fluency is a reflex, not a
 * read. Owner's ask (2026-11-12): "fluency with sss, asa, hl, sas, aas, or not congruent …
 * beat your high score … built in class leaderboard. asynch".
 *
 * Every figure is DRAWN from the case, never picked from a list: a fresh triangle each play, a
 * congruent copy rotated and often reflected, and tick marks / arcs / a right-angle box on the
 * parts the case gives. The "Not congruent" plays are honest pictures: the second triangle really
 * is a different triangle that shares the marked parts — the OTHER solution of the SSA ambiguous
 * case, a similar (scaled) triangle for AAA / AA, a different included angle for SS — so the
 * button is literally true, and the tell says why the marks were never enough.
 *
 * Books: `basic` (two separate triangles), `right` (right triangles: HL, and the right angle as a
 * free pair — hypotenuse + acute angle is AAS, two legs is SAS), `shared` (two triangles on a
 * shared side: the Reflexive part counts, and SSA is still not enough), `all` (mixed).
 *
 * Each template's `make` returns `marks` beside the play — { sides, angles, right, shared } —
 * so tests/unit/liveDrillCongruence.test.js can re-derive the criterion from the marks alone,
 * independent of this file's own labelling.
 */
const { int, makeBank } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Mixed', ch: 'All', blurb: 'Two triangles, right triangles, a shared side — every case, fast.' },
  basic: { name: 'Two Triangles', ch: 'Pairs', blurb: 'Separate triangles with their marks: SSS, SAS, ASA, AAS — or not enough.' },
  right: { name: 'Right Triangles', ch: 'Right △', blurb: 'HL, and the right angle as a free pair: hypotenuse + acute angle, two legs, a leg + an angle.' },
  shared: { name: 'Shared Side', ch: 'Shared', blurb: 'Two triangles on one side: the Reflexive part counts — and SSA still does not.' },
};

const CHOICES = ['SSS', 'SAS', 'ASA', 'AAS', 'HL', 'Not congruent'];
const ANSWER = Object.fromEntries(CHOICES.map((c, i) => [c, i]));
const NONE = 'Not congruent';
const ASK = 'Which shortcut proves the triangles congruent?';

const deg = (d) => (d * Math.PI) / 180;
const rot = (p, th) => [p[0] * Math.cos(th) - p[1] * Math.sin(th), p[0] * Math.sin(th) + p[1] * Math.cos(th)];
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const r1 = (x) => Math.round(x * 10) / 10;

/** Angle at vertex i of triangle pts, in degrees. */
function angleAt(pts, i) {
  const p = pts[i]; const q = pts[(i + 1) % 3]; const r = pts[(i + 2) % 3];
  const a = Math.atan2(q[1] - p[1], q[0] - p[0]); const b = Math.atan2(r[1] - p[1], r[0] - p[0]);
  let d = Math.abs(a - b) * (180 / Math.PI); if (d > 180) d = 360 - d; return d;
}

// ---------------------------------------------------------------- triangles

/** A scalene triangle: A at the origin, B along +x, C above. Angles all ≥ 28°, sides well apart. */
function scalene(rand) {
  for (let i = 0; i < 40; i++) {
    const A = int(rand, 38, 82); const b = int(rand, 62, 100); const c = int(rand, 70, 112);
    if (Math.abs(b - c) < 12) continue;
    const pts = [[0, 0], [c, 0], [b * Math.cos(deg(A)), b * Math.sin(deg(A))]];
    if (angleAt(pts, 1) < 28 || angleAt(pts, 2) < 28 || Math.abs(angleAt(pts, 1) - angleAt(pts, 2)) < 7) continue;
    if (Math.abs(dist(pts[1], pts[2]) - b) < 10 || Math.abs(dist(pts[1], pts[2]) - c) < 10) continue;
    return pts;
  }
  return [[0, 0], [96, 0], [30, 70]];
}

/** A right triangle with the right angle at vertex 2 (C); legs well apart so the hypotenuse reads. */
function rightTri(rand) {
  for (let i = 0; i < 40; i++) {
    const l1 = int(rand, 58, 104); const l2 = int(rand, 58, 104);
    if (Math.abs(l1 - l2) < 14) continue;
    return [[l1, 0], [0, l2], [0, 0]]; // A on the x-leg, B on the y-leg, C at the right angle
  }
  return [[96, 0], [0, 64], [0, 0]];
}

/** The congruent copy: the same points, rotated and (half the time) reflected. */
function copyOf(pts, rand) {
  const th = deg(int(rand, 25, 335)); const flip = rand() < 0.5;
  return pts.map((p) => rot(flip ? [p[0], -p[1]] : p, th));
}

/** Fit two point sets into two 150×150 boxes side by side at ONE scale (so a bigger triangle looks bigger). */
function layout(t1, t2) {
  const box = (pts) => { const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; };
  const b1 = box(t1); const b2 = box(t2);
  const s = 122 / Math.max(b1.w, b1.h, b2.w, b2.h, 1);
  const place = (pts, b, cx) => pts.map((p) => [cx + (p[0] - b.x - b.w / 2) * s, 86 + (p[1] - b.y - b.h / 2) * s]);
  return [place(t1, b1, 86), place(t2, b2, 256)];
}

// ---------------------------------------------------------------- marks (SVG)

/** n tick marks across the middle of side i (the side opposite vertex i). */
function ticks(pts, i, n) {
  const p = pts[(i + 1) % 3]; const q = pts[(i + 2) % 3];
  const mx = (p[0] + q[0]) / 2; const my = (p[1] + q[1]) / 2;
  const L = dist(p, q) || 1; const ux = (q[0] - p[0]) / L; const uy = (q[1] - p[1]) / L; // along
  const nx = -uy; const ny = ux; // across
  let out = '';
  for (let k = 0; k < n; k++) {
    const off = (k - (n - 1) / 2) * 5;
    const cx = mx + ux * off; const cy = my + uy * off;
    out += `<line x1="${r1(cx - nx * 6)}" y1="${r1(cy - ny * 6)}" x2="${r1(cx + nx * 6)}" y2="${r1(cy + ny * 6)}"/>`;
  }
  return out;
}

/** n arcs at vertex i, or a right-angle box when `square`. */
function arcs(pts, i, n, square) {
  const p = pts[i]; const q = pts[(i + 1) % 3]; const r = pts[(i + 2) % 3];
  const a1 = Math.atan2(q[1] - p[1], q[0] - p[0]); const a2 = Math.atan2(r[1] - p[1], r[0] - p[0]);
  if (square) {
    const s = 11; const u = [Math.cos(a1) * s, Math.sin(a1) * s]; const v = [Math.cos(a2) * s, Math.sin(a2) * s];
    return `<path d="M${r1(p[0] + u[0])} ${r1(p[1] + u[1])} L${r1(p[0] + u[0] + v[0])} ${r1(p[1] + u[1] + v[1])} L${r1(p[0] + v[0])} ${r1(p[1] + v[1])}"/>`;
  }
  // sweep the short way from a1 to a2
  let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  let out = '';
  for (let k = 0; k < n; k++) {
    const rad = 13 + k * 5;
    const sx = p[0] + Math.cos(a1) * rad; const sy = p[1] + Math.sin(a1) * rad;
    const ex = p[0] + Math.cos(a1 + d) * rad; const ey = p[1] + Math.sin(a1 + d) * rad;
    out += `<path d="M${r1(sx)} ${r1(sy)} A${rad} ${rad} 0 0 ${d > 0 ? 1 : 0} ${r1(ex)} ${r1(ey)}"/>`;
  }
  return out;
}

const poly = (pts, cls) => `<polygon class="${cls}" points="${pts.map((p) => `${r1(p[0])},${r1(p[1])}`).join(' ')}"/>`;

/**
 * Two triangles with corresponding marks. `marks` = { sides: [i…], angles: [i…], right: i|null }:
 * side i gets i-th tick count in the order given (1, 2, 3 ticks), angle i likewise (1, 2, 3 arcs);
 * the right angle (if any) is a box on both, and counts as a marked angle only if listed.
 */
function pairSVG(t1raw, t2raw, marks, label) {
  const [t1, t2] = layout(t1raw, t2raw);
  const draw = (pts) => {
    let m = '';
    marks.sides.forEach((i, k) => { m += ticks(pts, i, k + 1); });
    marks.angles.forEach((i, k) => { m += arcs(pts, i, k + 1, false); });
    if (marks.right != null) m += arcs(pts, marks.right, 1, true);
    return `${poly(pts, 'tri')}<g class="mk">${m}</g>`;
  };
  return `<svg class="congr" viewBox="0 0 342 172" width="300" role="img" aria-label="${label}"><g>${draw(t1)}</g><g>${draw(t2)}</g></svg>`;
}

// ---------------------------------------------------------------- the cases

/** The non-congruent partner that still carries the marked parts. */
function differ(pts, kind, rand) {
  if (kind === 'AAA' || kind === 'AA') return pts.map((p) => [p[0] * 1.32, p[1] * 1.32]); // similar: same angles, bigger
  if (kind === 'SS') {
    // the same two sides AB (c) and AC (b) with a visibly different angle between them
    const [a, b, c] = pts; const bLen = dist(a, c); const A0 = angleAt(pts, 0);
    const A1 = A0 + (A0 < 60 ? int(rand, 28, 40) : -int(rand, 28, 40));
    return [a, b, [c[0] * 0 + bLen * Math.cos(deg(A1)), bLen * Math.sin(deg(A1))]];
  }
  return pts;
}

/** The SSA ambiguous case: angle A, side AC = b, side BC = a with b·sin A < a < b — two triangles. */
function ssaPair(rand) {
  for (let i = 0; i < 200; i++) {
    const A = int(rand, 34, 62); const b = int(rand, 76, 104);
    const lo = b * Math.sin(deg(A)); const a = int(rand, Math.ceil(lo + 10), b - 10);
    if (!(a > lo + 8 && a < b - 8)) continue;
    const root = Math.sqrt(a * a - b * b * Math.sin(deg(A)) ** 2);
    const c1 = b * Math.cos(deg(A)) + root; const c2 = b * Math.cos(deg(A)) - root;
    if (c2 < 34 || c1 - c2 < 26) continue;
    const C = [b * Math.cos(deg(A)), b * Math.sin(deg(A))];
    const t1 = [[0, 0], [c1, 0], C]; const t2 = [[0, 0], [c2, 0], C];
    if (angleAt(t2, 1) > 150 || angleAt(t2, 2) < 14) continue;
    return [t1, t2];
  }
  // a known-good pair: A = 40°, b = 80, a = 60 → c = 80cos40 ± √(60² − (80sin40)²) ≈ 92.2 and 30.4
  const C = [80 * Math.cos(deg(40)), 80 * Math.sin(deg(40))];
  const root = Math.sqrt(60 * 60 - (80 * Math.sin(deg(40))) ** 2);
  return [[[0, 0], [80 * Math.cos(deg(40)) + root, 0], C], [[0, 0], [80 * Math.cos(deg(40)) - root, 0], C]];
}

const TELL = {
  SSS: 'Three pairs of sides — SSS.',
  SAS: 'Two pairs of sides and the angle BETWEEN them — SAS.',
  ASA: 'Two pairs of angles and the side BETWEEN them — ASA.',
  AAS: 'Two pairs of angles and a side NOT between them — AAS.',
  HL: 'Right triangles, hypotenuse and a leg — HL.',
};

function play(t1, t2, marks, ans, tell, label) {
  return { ask: ASK, prompt: '', fig: pairSVG(t1, t2, marks, label), choices: CHOICES, answer: ANSWER[ans], fixed: true, tell, marks: { ...marks, shared: false, ans } };
}

const T = {};

// ---- basic: two separate triangles
T.sss = { book: 'basic', make(rand) {
  const t = scalene(rand);
  return play(t, copyOf(t, rand), { sides: [0, 1, 2], angles: [], right: null }, 'SSS', TELL.SSS, 'two triangles, all three pairs of sides marked');
} };
T.sas = { book: 'basic', make(rand) {
  const t = scalene(rand); const v = int(rand, 0, 2); // the included angle at v, between the two sides that meet there
  return play(t, copyOf(t, rand), { sides: [(v + 1) % 3, (v + 2) % 3], angles: [v], right: null }, 'SAS', TELL.SAS, 'two triangles, two pairs of sides and the included angle marked');
} };
T.asa = { book: 'basic', make(rand) {
  const t = scalene(rand); const s = int(rand, 0, 2); // the included side s, between the two marked vertices
  return play(t, copyOf(t, rand), { sides: [s], angles: [(s + 1) % 3, (s + 2) % 3], right: null }, 'ASA', TELL.ASA, 'two triangles, two pairs of angles and the included side marked');
} };
T.aas = { book: 'basic', make(rand) {
  const t = scalene(rand); const v = int(rand, 0, 2); const w = (v + 1) % 3; // angles at v and w; a side not between them: the one opposite v or w
  const s = rand() < 0.5 ? v : w;
  return play(t, copyOf(t, rand), { sides: [s], angles: [v, w], right: null }, 'AAS', TELL.AAS, 'two triangles, two pairs of angles and a non-included side marked');
} };
T.noneSides = { book: 'basic', make(rand) {
  if (rand() < 0.6) {
    const [t1, t2] = ssaPair(rand); // sides AC (opposite B = side 1) and BC (opposite A = side 0); angle A (vertex 0)
    return { ...play(t1, copyOf(t2, rand), { sides: [1, 0], angles: [0], right: null }, NONE,
      'SSA is NOT a shortcut: these two triangles share both marked sides and that angle, and they are plainly different. Only a RIGHT angle rescues it (HL).', 'two triangles, two pairs of sides and a non-included angle marked'),
    marks: { sides: [1, 0], angles: [0], right: null, shared: false, ans: NONE, why: 'SSA' } };
  }
  const t = scalene(rand);
  return { ...play(t, copyOf(differ(t, 'SS', rand), rand), { sides: [1, 2], angles: [], right: null }, NONE,
    'Two sides alone fix nothing — swing the angle between them and you get a different triangle. You need a third part.', 'two triangles, two pairs of sides marked'),
  marks: { sides: [1, 2], angles: [], right: null, shared: false, ans: NONE, why: 'SS' } };
} };
T.noneAngles = { book: 'basic', make(rand) {
  const t = scalene(rand); const three = rand() < 0.5;
  const angles = three ? [0, 1, 2] : [0, 1];
  return { ...play(t, copyOf(differ(t, three ? 'AAA' : 'AA', rand), rand), { sides: [], angles, right: null }, NONE,
    `${three ? 'Three' : 'Two'} pairs of angles fix the SHAPE, not the size: that is SIMILAR, not congruent. Every shortcut needs at least one side.`, 'two triangles, only angles marked'),
  marks: { sides: [], angles, right: null, shared: false, ans: NONE, why: three ? 'AAA' : 'AA' } };
} };

// ---- right: the right angle is a free congruent pair
T.hl = { book: 'right', make(rand) {
  const t = rightTri(rand); const leg = rand() < 0.5 ? 0 : 1; // side 2 is the hypotenuse (opposite C); sides 0 and 1 are the legs
  return { ...play(t, copyOf(t, rand), { sides: [2, leg], angles: [], right: 2 }, 'HL', TELL.HL, 'two right triangles, hypotenuse and one leg marked'), marks: { sides: [2, leg], angles: [], right: 2, shared: false, ans: 'HL' } };
} };
T.hypAngle = { book: 'right', make(rand) {
  const t = rightTri(rand); const v = rand() < 0.5 ? 0 : 1; // an acute angle
  return { ...play(t, copyOf(t, rand), { sides: [2], angles: [v], right: 2 }, 'AAS', 'The right angles are a free congruent pair: two angles and the hypotenuse, which is NOT between them — AAS.', 'two right triangles, hypotenuse and an acute angle marked'),
    marks: { sides: [2], angles: [v], right: 2, shared: false, ans: 'AAS', rightCounts: true } };
} };
T.twoLegs = { book: 'right', make(rand) {
  const t = rightTri(rand);
  return { ...play(t, copyOf(t, rand), { sides: [0, 1], angles: [], right: 2 }, 'SAS', 'The right angle is a free pair and it sits BETWEEN the two legs — SAS.', 'two right triangles, both legs marked'),
    marks: { sides: [0, 1], angles: [], right: 2, shared: false, ans: 'SAS', rightCounts: true } };
} };
T.legAngle = { book: 'right', make(rand) {
  const t = rightTri(rand); const v = rand() < 0.5 ? 0 : 1; // acute angle at v; leg 'adjacent' to v = the leg from v to C = side opposite the OTHER acute vertex
  const other = 1 - v;
  const adjacent = rand() < 0.5;
  const s = adjacent ? other : v; // side opposite `other` runs v–C (between the two marked angles); side opposite v runs other–C (not between)
  return { ...play(t, copyOf(t, rand), { sides: [s], angles: [v], right: 2 }, adjacent ? 'ASA' : 'AAS',
    adjacent ? 'Right angle, acute angle, and the leg BETWEEN them — ASA.' : 'Right angle, acute angle, and the leg NOT between them (it is opposite the acute angle) — AAS.', 'two right triangles, one leg and one acute angle marked'),
  marks: { sides: [s], angles: [v], right: 2, shared: false, ans: adjacent ? 'ASA' : 'AAS', rightCounts: true } };
} };
T.rightLegOnly = { book: 'right', make(rand) {
  const t = rightTri(rand); const leg = rand() < 0.5 ? 0 : 1;
  const t2 = [[t[0][0] * (leg === 1 ? 1 : 1.35), 0], [0, t[1][1] * (leg === 0 ? 1 : 1.35)], [0, 0]]; // keep the marked leg, stretch the other
  return { ...play(t, copyOf(t2, rand), { sides: [leg], angles: [], right: 2 }, NONE, 'A right angle and ONE leg is only two parts. HL needs the hypotenuse too; SAS needs the other leg.', 'two right triangles, one leg marked'),
    marks: { sides: [leg], angles: [], right: 2, shared: false, ans: NONE, why: 'right+S' } };
} };

// ---- shared: triangles ABD and CBD on the shared side BD (B at the left, D at the right)
/** A above BD; C below as the mirror image (congruent), or the other SSA solution (not). */
function sharedFigure(rand, kind) {
  for (let i = 0; i < 60; i++) {
    const B = [0, 0]; const D = [124, 0];
    const A = [int(rand, 22, 76), -int(rand, 46, 82)]; // above
    let C = [A[0], -A[1]]; // the mirror image
    if (kind === 'SSA') {
      // same |BC| = |BA| and the same angle at D, but the OTHER point on D's ray — the ambiguous case
      const ux0 = A[0] - D[0]; const uy0 = -(A[1] - D[1]); const L = Math.hypot(ux0, uy0); const u = [ux0 / L, uy0 / L];
      const r = dist(A, B); const DB = [B[0] - D[0], B[1] - D[1]];
      const bq = -2 * (u[0] * DB[0] + u[1] * DB[1]); const cq = DB[0] * DB[0] + DB[1] * DB[1] - r * r;
      const disc = bq * bq - 4 * cq; if (disc <= 0) continue;
      const roots = [(-bq + Math.sqrt(disc)) / 2, (-bq - Math.sqrt(disc)) / 2].filter((t) => t > 0);
      if (roots.length < 2 || Math.abs(roots[0] - roots[1]) < 28) continue;
      const t2 = Math.min(...roots) === L ? Math.max(...roots) : Math.min(...roots); // the one that is not the mirror image
      if (Math.abs(t2 - L) < 28) continue;
      C = [D[0] + u[0] * t2, D[1] + u[1] * t2];
      if (C[1] < 22) continue;
    }
    const tri1 = [A, B, D]; const tri2 = [C, B, D];
    if (angleAt(tri1, 0) < 30 || angleAt(tri1, 1) < 22 || angleAt(tri1, 2) < 22) continue;
    return { A, B, C, D, tri1, tri2 };
  }
  const A = [50, -60]; return { A, B: [0, 0], C: [50, 60], D: [124, 0], tri1: [A, [0, 0], [124, 0]], tri2: [[50, 60], [0, 0], [124, 0]] };
}

/**
 * Triangles ABD (above) and CBD (below) on the shared side BD. Marks are given per triangle with
 * vertex indices in (apex, B, D) order: side 0 = BD (shared), side 1 = apex–D, side 2 = apex–B;
 * angle 0 = apex, angle 1 = at B, angle 2 = at D. The shared side is drawn with a "reflexive" tick.
 */
function sharedSVG(f, marks, label) {
  const all = [f.A, f.B, f.C, f.D];
  const xs = all.map((p) => p[0]); const ys = all.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs); const h = Math.max(...ys) - Math.min(...ys);
  const s = Math.min(300 / w, 128 / h, 1.3); // room above and below for the A and C labels
  const tx = (p) => [171 + (p[0] - (Math.min(...xs) + w / 2)) * s, 86 + (p[1] - (Math.min(...ys) + h / 2)) * s];
  const t1 = f.tri1.map(tx); const t2 = f.tri2.map(tx);
  const draw = (pts) => {
    let m = '';
    marks.sides.forEach((i, k) => { if (i !== 0) m += ticks(pts, i, k + 1); });
    marks.angles.forEach((i, k) => { m += arcs(pts, i, k + 1, false); });
    return `${poly(pts, 'tri')}<g class="mk">${m}</g>`;
  };
  const [B, D] = [tx(f.B), tx(f.D)];
  const lab = (p, txt, dx, dy) => `<text x="${r1(p[0] + dx)}" y="${r1(p[1] + dy)}">${txt}</text>`;
  return `<svg class="congr" viewBox="0 0 342 172" width="300" role="img" aria-label="${label}">${draw(t1)}${draw(t2)}`
    + `<line class="shared" x1="${r1(B[0])}" y1="${r1(B[1])}" x2="${r1(D[0])}" y2="${r1(D[1])}"/>`
    + `<g class="lb">${lab(tx(f.A), 'A', -4, -6)}${lab(B, 'B', -14, 5)}${lab(tx(f.C), 'C', -4, 15)}${lab(D, 'D', 6, 5)}</g></svg>`;
}

function sharedPlay(rand, kind, marks, ans, tell, label) {
  const f = sharedFigure(rand, kind);
  // the ask carries the one fact the picture can't: BD belongs to both triangles (a sentence, so the card sets it in sentence case)
  return { ask: 'BD is a side of both triangles. Which shortcut proves them congruent?', prompt: '', fig: sharedSVG(f, marks, label), choices: CHOICES, answer: ANSWER[ans], fixed: true, tell,
    marks: { ...marks, shared: true, ans, why: kind } };
}
// shared-side marks: side 0 = BD (shared, always counts), 1 = apex–D, 2 = apex–B; angle 0 = apex, 1 = at B, 2 = at D
T.sharedSSS = { book: 'shared', make(rand) {
  return sharedPlay(rand, 'SSS', { sides: [0, 1, 2], angles: [] }, 'SSS', 'AB ≅ CB, AD ≅ CD, and BD ≅ BD by the Reflexive Property — three sides, SSS.', 'two triangles on a shared side, the other two pairs of sides marked');
} };
T.sharedSAS = { book: 'shared', make(rand) {
  const atB = rand() < 0.5; // the marked side meets BD at the marked angle's vertex
  return sharedPlay(rand, 'SAS', { sides: [0, atB ? 2 : 1], angles: [atB ? 1 : 2] }, 'SAS',
    `${atB ? 'AB ≅ CB' : 'AD ≅ CD'}, the shared side BD, and the angle at ${atB ? 'B' : 'D'} BETWEEN them — SAS, with BD ≅ BD by the Reflexive Property.`, 'two triangles on a shared side, one other pair of sides and the included angle marked');
} };
T.sharedASA = { book: 'shared', make(rand) {
  return sharedPlay(rand, 'ASA', { sides: [0], angles: [1, 2] }, 'ASA', 'The angles at B and at D, and the shared side BD between them — ASA, with BD ≅ BD by the Reflexive Property.', 'two triangles on a shared side, the two angles on it marked');
} };
T.sharedAAS = { book: 'shared', make(rand) {
  const atB = rand() < 0.5;
  return sharedPlay(rand, 'AAS', { sides: [0], angles: [0, atB ? 1 : 2] }, 'AAS',
    `The apex angles, the angle at ${atB ? 'B' : 'D'}, and the shared side BD — which is NOT between those two angles — AAS.`, 'two triangles on a shared side, the apex angle and one angle on the side marked');
} };
T.sharedSSA = { book: 'shared', make(rand) {
  return sharedPlay(rand, 'SSA', { sides: [0, 2], angles: [2] }, NONE,
    'AB ≅ CB, the shared BD, and the angle at D — but that angle is NOT between those two sides. SSA: look at the picture, the triangles are different.', 'two triangles on a shared side, one other pair of sides and a non-included angle marked');
} };

// HL is the one students most need to recognise on sight: it gets a second seat at the table.
T.hlAgain = T.hl;

const bank = makeBank(BOOKS, T);
module.exports = { ...bank, CHOICES, NONE, ASK, _geom: { scalene, rightTri, ssaPair, sharedFigure, angleAt, dist } };

/**
 * Chapter Review drills, sixth pair: Honors Geometry Ch. 9 (right triangles and trigonometry) and
 * Alg 1 Module 12 (statistics). Same contract as the other review suites, with every computed
 * answer re-solved from the printed question: Pythagorean sides squared back, radicals re-simplified,
 * every trig answer recomputed with Math.sin/cos/tan from the printed angle and sides, every statistic
 * recomputed from the printed data set, every box-plot answer re-read from the figure's alt text.
 */
const { dealPlay, DRILLS } = require('../../utils/liveDrill/engine');
const solo = require('../../utils/liveDrill/solo');
const ALG = require('../../utils/liveDrill/review/alg1Ch12');
const GEO = require('../../utils/liveDrill/review/hgeoCh9');

const N = 200;
const plain = (h) => String(h).replace(/<sup>/g, '^').replace(/<\/sup>/g, '').replace(/<br>/g, ' ; ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/−/g, '-').replace(/\s+/g, ' ').trim();
function deal(bank, id, n = N) {
  let s = 1357 + id.length * 7919;
  const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const out = [];
  for (let i = 0; i < n; i++) out.push(bank.makePlay(bank.TEMPLATES[id].book, Object.keys(bank.TEMPLATES).filter((k) => k !== id), rand));
  return out;
}
const keyText = (p) => plain(p.choices.find((c) => c.k === p.answer).html);
const promptOf = (p) => plain((p.card.match(/<div class="posed-q[^"]*">([\s\S]*?)<\/div>/) || [])[1] || '');
const askOf = (p) => plain((p.card.match(/<p class="posed-ask[^"]*">([\s\S]*?)<\/p>/) || [])[1] || '');
const altOf = (p) => ((p.card.match(/aria-label="([^"]*)"/) || [])[1] || '').replace(/Q[13]/g, '');
const nums = (s) => (plain(s).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
const RAD = Math.PI / 180;
const tenth = (x) => (Math.round(x * 10) / 10).toFixed(1);
/** "3√5" / "√5" / "7" → number */
const radVal = (s) => { const m = plain(s).match(/^(\d*)√(\d+)$/); return m ? (m[1] ? +m[1] : 1) * Math.sqrt(+m[2]) : +s; };
/** is "k√m" in simplest form: m square-free */
const squareFree = (m) => { for (let f = 2; f * f <= m; f++) if (m % (f * f) === 0) return false; return true; };
const sorted = (xs) => [...xs].sort((a, b) => a - b);
const median = (xs) => { const s = sorted(xs); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const q1of = (xs) => median(sorted(xs).slice(0, Math.floor(xs.length / 2)));
const q3of = (xs) => median(sorted(xs).slice(Math.ceil(xs.length / 2)));

describe.each([['alg1m12', ALG], ['hgeo9', GEO]])('%s: every play is well formed', (drill, bank) => {
  test.each(Object.keys(bank.TEMPLATES))('%s', (id) => {
    for (const p of deal(bank, id, 100)) {
      expect(p.id).toBe(id); expect(p.card).toBeTruthy(); expect(p.tell).toBeTruthy(); expect(plain(p.summary)).not.toBe('');
      expect(p.card.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]*>/g, '')).not.toMatch(/[<>]/);
      if (p.input === 'number') { expect(Number.isInteger(Number(p.answer))).toBe(true); if (Number(p.answer) < 0) expect(p.neg).toBe(true); }
      else { expect(p.choices.length).toBeGreaterThanOrEqual(2); expect(p.choices.length).toBeLessThanOrEqual(4); expect(new Set(p.choices.map((c) => plain(c.html))).size).toBe(p.choices.length); expect(p.choices.map((c) => c.k)).toContain(p.answer); expect(p.card).not.toContain('posed-ans'); }
    }
  });
  test('registered as a standard-scoring native drill, on its hub, reachable from Whole Chapter', () => {
    expect(DRILLS[drill].native).toBe(bank); expect(DRILLS[drill].scoring).toBeUndefined();
    expect(Object.values(solo.HUBS).some((h) => h.games.some((g) => g.drill === drill))).toBe(true);
    const seen = new Set(); for (let n = 1; n <= 600; n++) seen.add(dealPlay(drill, 'all', 'seed', n, []).id);
    expect([...seen].sort()).toEqual(Object.keys(bank.TEMPLATES).sort());
    for (const book of Object.keys(bank.BOOKS)) expect(dealPlay(drill, book, 's', 1, []).id).toBeTruthy();
    expect(dealPlay(drill, 'all', 'x', 7, [])).toEqual(dealPlay(drill, 'all', 'x', 7, []));
  });
});

describe('Geometry Ch. 9 — re-solved from the question text', () => {
  test('Pythagorean Theorem: every side squares back, every radical is simplest form', () => {
    for (const p of deal(GEO, 'tripleSide')) { const [a, b] = nums(promptOf(p)); const x = Number(p.answer); if (/hypotenuse/.test(p.head)) expect(a * a + b * b).toBe(x * x); else expect(b * b + x * x).toBe(a * a); }
    for (const p of deal(GEO, 'simplifyRadical')) { const [n] = nums(promptOf(p)); const k = keyText(p); const m = k.match(/^(\d*)√(\d+)$/); expect(m).toBeTruthy(); expect((+m[1] || 1) ** 2 * +m[2]).toBe(n); expect(squareFree(+m[2])).toBe(true); }
    for (const p of deal(GEO, 'radicalSide')) {
      const t = promptOf(p); const k = keyText(p); const m = k.match(/^(\d*)√(\d+)$/); expect(m).toBeTruthy(); expect(squareFree(+m[2])).toBe(true); const x2 = (+m[1] || 1) ** 2 * +m[2];
      if (/^Legs/.test(t)) { const [a, b] = nums(t); expect(a * a + b * b).toBe(x2); } else { const [c, a] = nums(t); expect(c * c - a * a).toBe(x2); }
    }
    for (const p of deal(GEO, 'isTriple')) { const [x, y, z] = nums(promptOf(p)); expect(keyText(p).startsWith('Yes')).toBe(x * x + y * y === z * z); }
    for (const p of deal(GEO, 'classify')) {
      const [a, b, c] = nums(promptOf(p)); const k = keyText(p);
      if (a + b <= c) expect(k.startsWith('Not a triangle')).toBe(true); else expect(k.split(' ')[0]).toBe(c * c === a * a + b * b ? 'Right' : c * c < a * a + b * b ? 'Acute' : 'Obtuse');
    }
    for (const p of deal(GEO, 'roundTenth')) { const [u, v] = nums(promptOf(p)); expect(keyText(p)).toBe(tenth(/Hypotenuse/.test(p.head) ? Math.sqrt(u * u + v * v) : Math.sqrt(u * u - v * v))); }
  });
  test('special right triangles: every exact answer equals the decimal geometry', () => {
    const close = (a, b) => expect(Math.abs(a - b)).toBeLessThan(1e-9);
    for (const p of deal(GEO, 'iso45')) { const v = radVal(promptOf(p).match(/is ([^.]+)\./)[1]); const k = radVal(keyText(p)); if (/hypotenuse/.test(p.head)) close(k, v * Math.SQRT2); else close(k, v / Math.SQRT2); }
    for (const p of deal(GEO, 'tri30')) {
      const t = promptOf(p); const v = radVal(t.match(/is ([^.]+)\./)[1]); const k = radVal(keyText(p)); const want = /hypotenuse/.test(p.head) ? 'hyp' : /longer/.test(p.head) ? 'long' : 'short';
      const short = /shorter leg is/.test(t) ? v : /longer leg is/.test(t) ? v / Math.sqrt(3) : v / 2;
      close(k, want === 'hyp' ? 2 * short : want === 'long' ? short * Math.sqrt(3) : short);
    }
    for (const p of deal(GEO, 'longLegInt')) { const [L] = nums(promptOf(p)); close(radVal(keyText(p)), L / Math.sqrt(3)); }
    for (const p of deal(GEO, 'rationalize')) { const [a, b] = nums(promptOf(p)); const k = keyText(p); expect(k).not.toMatch(/\/√/); const m = k.match(/^(\d*)√(\d+)(?:\/(\d+))?$/); expect(m).toBeTruthy(); close((+m[1] || 1) * Math.sqrt(+m[2]) / (+m[3] || 1), a / Math.sqrt(b)); }
    for (const p of deal(GEO, 'hiding')) { const [n] = nums(askOf(p)); close(radVal(keyText(p)), /square/.test(askOf(p)) ? n / Math.SQRT2 : n * Math.sqrt(3) / 2); }
  });
  test('similar right triangles: geometric means square back to the products', () => {
    for (const p of deal(GEO, 'geoMean')) { const [a, b] = nums(promptOf(p)); expect(Number(p.answer) ** 2).toBe(a * b); }
    for (const p of deal(GEO, 'altitudeRule')) { const [a, b] = nums(promptOf(p)); expect(Number(p.answer) ** 2).toBe(a * b); }
    for (const p of deal(GEO, 'legRule')) { const [hyp, piece] = nums(promptOf(p)); expect(Number(p.answer) ** 2).toBe(hyp * piece); }
    for (const p of deal(GEO, 'solveSegment')) { const [h, seg] = nums(promptOf(p)); const other = h * h / seg; expect(Number(p.answer)).toBe(/whole/.test(p.head) ? seg + other : other); }
  });
  test('trig: every ratio and side recomputed from the printed triangle', () => {
    for (const p of deal(GEO, 'ratioOf')) {
      const [A, B, C] = nums(promptOf(p)); const which = p.head.replace('Find ', ''); const [num, den] = keyText(p).split('/').map(Number);
      const want = { 'sin A': A / C, 'cos A': B / C, 'tan A': A / B, 'sin B': B / C, 'cos B': A / C, 'tan B': B / A }[which]; expect(num / den).toBeCloseTo(want, 12);
    }
    for (const p of deal(GEO, 'missingSide')) {
      const t = promptOf(p); const [th, known] = nums(t); const r = th * RAD;
      const want = /hypotenuse \d+, opposite/.test(t) ? known * Math.sin(r) : /hypotenuse \d+, adjacent/.test(t) ? known * Math.cos(r) : /adjacent side \d+, opposite/.test(t) ? known * Math.tan(r) : known / Math.sin(r);
      expect(keyText(p)).toBe(tenth(want));
    }
    for (const p of deal(GEO, 'inverseTrig')) { const [d, h] = nums(promptOf(p)); expect(keyText(p)).toBe(tenth(Math.atan(h / d) / RAD) + '°'); }
    for (const p of deal(GEO, 'elevation')) {
      const t = promptOf(p); const [a, th] = nums(t); const r = th * RAD;
      const want = /ranger/.test(t) ? a / Math.tan(r) : /shadow/.test(t) ? a * Math.tan(r) : /plane/.test(t) ? a / Math.tan(r) : a * Math.tan(r);
      expect(Number(keyText(p))).toBe(Math.round(want));
    }
    for (const p of deal(GEO, 'solveTriangle')) {
      const t = promptOf(p);
      if (/Find PQ/.test(p.head)) { const [B, A] = nums(t); expect(Number(p.answer) ** 2).toBe(A * A + B * B); }
      else if (/other acute/.test(p.head)) { const [th] = nums(t); expect(Number(p.answer)).toBe(90 - th); }
      else { const [B, A] = nums(t); const P = Math.atan(A / B) / RAD; expect(keyText(p)).toBe(tenth(/∠P/.test(p.head) ? P : 90 - P) + '°'); }
    }
  });
  test('Laws of Sines and Cosines: every side, angle and area recomputed', () => {
    for (const p of deal(GEO, 'thirdAngle')) { const [A, B] = nums(promptOf(p)); expect(Number(p.answer)).toBe(180 - A - B); }
    for (const p of deal(GEO, 'lawSines')) { const [A, B, a] = nums(promptOf(p)); expect(keyText(p)).toBe(tenth(a * Math.sin(B * RAD) / Math.sin(A * RAD))); }
    for (const p of deal(GEO, 'lawCosines')) { const [b, c, A] = nums(promptOf(p)); expect(keyText(p)).toBe(tenth(Math.sqrt(b * b + c * c - 2 * b * c * Math.cos(A * RAD)))); }
    for (const p of deal(GEO, 'areaSine')) { const [a, b, C] = nums(promptOf(p)); expect(keyText(p)).toBe(tenth(0.5 * a * b * Math.sin(C * RAD))); }
    for (const p of deal(GEO, 'largestAngle')) {
      const [x, y, z] = nums(promptOf(p)); expect(x + y > z).toBe(true);
      if (/Which/.test(p.head)) expect(keyText(p)).toBe(`the angle opposite the ${z}`); else expect(keyText(p)).toBe(tenth(Math.acos((x * x + y * y - z * z) / (2 * x * y)) / RAD) + '°');
    }
    for (const p of deal(GEO, 'chooseLaw')) { const t = promptOf(p); expect(keyText(p)).toBe(/AAS|ASA/.test(t) ? 'Law of Sines' : /SAS|SSS/.test(t) ? 'Law of Cosines' : 'Neither — SOH-CAH-TOA'); }
  });
});

describe('Algebra Module 12 — re-solved from the printed data', () => {
  test('center: mean, median, mode, the needed score, which measure', () => {
    for (const p of deal(ALG, 'mean')) { const xs = nums(promptOf(p)); expect(Number(p.answer) * xs.length).toBe(xs.reduce((a, b) => a + b)); }
    for (const p of deal(ALG, 'median')) { const xs = nums(promptOf(p)); expect(Number(p.answer)).toBe(median(xs)); }
    for (const p of deal(ALG, 'mode')) { const xs = nums(promptOf(p)); const m = Number(p.answer); const count = (v) => xs.filter((x) => x === v).length; for (const x of xs) if (x !== m) expect(count(x)).toBeLessThan(count(m)); }
    for (const p of deal(ALG, 'needScore')) { const [target] = nums(askOf(p)); const got = nums(promptOf(p)).slice(1); const need = Number(p.answer); expect((got.reduce((a, b) => a + b) + need) / (got.length + 1)).toBe(target); }
    for (const p of deal(ALG, 'whichMeasure')) { const t = promptOf(p); expect(keyText(p).split(' ')[0]).toBe(/influencer|mansion/.test(t) ? 'median' : /no outliers/.test(t) ? 'mean' : 'mode'); }
  });
  test('spread: range, quartiles, IQR, the five-number summary, same mean different range', () => {
    for (const p of deal(ALG, 'range')) { const xs = nums(promptOf(p)); expect(Number(p.answer)).toBe(Math.max(...xs) - Math.min(...xs)); }
    for (const p of deal(ALG, 'marcus')) { const xs = nums(promptOf(p)); const [claim] = nums(askOf(p)); expect(claim).toBe(Math.max(...xs)); if (p.input === 'number') expect(Number(p.answer)).toBe(Math.max(...xs) - Math.min(...xs)); else expect(keyText(p)).toMatch(/^he gave the maximum/); }
    for (const p of deal(ALG, 'quartile')) { const xs = nums(promptOf(p)); expect(Number(p.answer)).toBe(/Q1/.test(p.head) ? q1of(xs) : q3of(xs)); }
    for (const p of deal(ALG, 'iqr')) { const xs = nums(promptOf(p)); expect(Number(p.answer)).toBe(q3of(xs) - q1of(xs)); }
    for (const p of deal(ALG, 'fiveNumber')) { const xs = nums(promptOf(p)); expect(nums(keyText(p).replace(/Q[13]/g, ''))).toEqual([Math.min(...xs), q1of(xs), median(xs), q3of(xs), Math.max(...xs)]); }
    for (const p of deal(ALG, 'sameMean')) {
      const [red, blue] = promptOf(p).split('Team Blue:').map(nums); const mean = (xs) => xs.reduce((a, b) => a + b) / 3; const rg = (xs) => Math.max(...xs) - Math.min(...xs);
      expect(mean(red)).toBe(mean(blue)); expect(rg(blue)).toBeGreaterThan(rg(red)); expect(keyText(p)).toBe(`Both means are ${mean(red)}; Blue's range (${rg(blue)}) is greater than Red's (${rg(red)})`);
    }
  });
  test('outliers: the value, the two means, the honest measure', () => {
    for (const p of deal(ALG, 'outlier')) { const xs = sorted(nums(promptOf(p))); const o = Number(p.answer); const rest = xs.filter((x) => x !== o); const gap = Math.min(Math.abs(o - rest[0]), Math.abs(o - rest[rest.length - 1])); expect(gap).toBeGreaterThan(rest[rest.length - 1] - rest[0]); }
    for (const p of deal(ALG, 'outlierEffect')) {
      const ns = nums(promptOf(p)); const o = ns[ns.length - 1]; const xs = ns.slice(0, 5); const withM = xs.reduce((a, b) => a + b) / 5; const without = (xs.reduce((a, b) => a + b) - o) / 4;
      expect(keyText(p)).toBe(`the mean drops from ${withM} to ${without} when ${o} is removed`);
    }
    for (const p of deal(ALG, 'bestCenter')) expect(keyText(p)).toBe('median');
    for (const p of deal(ALG, 'addedValue')) { const a = askOf(p); expect(keyText(p)).toBe(/changes the MOST/.test(a) ? 'the mean' : /LEAST/.test(a) ? 'the median' : /NOT affected/.test(a) ? 'the IQR' : 'the range'); }
  });
  test('box plots: every answer re-read from the figure', () => {
    for (const p of deal(ALG, 'readBox')) {
      const [min, q1, med, q3, max] = nums(altOf(p)); const a = Number(p.answer); const h = askOf(p) + promptOf(p); // posed() swaps a "Use the …" prompt into the headline
      expect(a).toBe(/median/.test(h) ? med : /Q1/.test(h) ? q1 : /Q3/.test(h) ? q3 : /range/.test(h) ? max - min : /IQR/.test(h) ? q3 - q1 : /minimum/.test(h) ? min : max);
      expect(p.card).toContain('<svg');
    }
    for (const p of deal(ALG, 'percentBox')) { const h = askOf(p); expect(Number(p.answer)).toBe(/inside the box|below the median/.test(h) ? 50 : /above Q3|below Q1/.test(h) ? 25 : 75); }
    for (const p of deal(ALG, 'compareBox')) {
      const [A, B] = altOf(p).split('Class B:').map(nums); const k = keyText(p); const rA = A[4] - A[0]; const rB = B[4] - B[0];
      const truths = [`The median for Class A was ${A[2]}`, `The median for Class B was ${B[2]}`, `The range for Class ${rA > rB ? 'A' : 'B'} was greater than Class ${rA > rB ? 'B' : 'A'}'s`];
      if (/^At least one student scored below/.test(k)) expect(nums(k)[0]).toBeGreaterThan(Math.min(A[0], B[0])); else expect(truths).toContain(k);
      for (const c of p.choices.map((x) => plain(x.html))) expect(/mean/.test(c)).toBe(c !== k && /mean/.test(c)); // "the mean was" is never the key
    }
  });
  test('cumulative review: vertex, product, system', () => {
    for (const p of deal(ALG, 'vertex')) {
      const t = promptOf(p).replace(/^y = /, '').replace(/\s/g, '').replace(/-/g, '+-'); const terms = t.split('+').filter(Boolean); let b = 0; let c = 0;
      for (const term of terms) { if (/x\^2/.test(term)) continue; if (/x$/.test(term)) b += term === 'x' ? 1 : term === '-x' ? -1 : +term.slice(0, -1); else c += +term; }
      const [h, k] = nums(keyText(p)); expect(h).toBe(-b / 2); expect(k).toBe(h * h + b * h + c);
    }
    for (const p of deal(ALG, 'product')) { const [a, q, r] = nums(promptOf(p)); const [A, B, C] = nums(keyText(p).replace(/x\^2/, 'x')); expect([A, B, C]).toEqual([a, a * r + q, q * r]); }
    for (const p of deal(ALG, 'system')) { const [k, s] = nums(promptOf(p)); const [x, y] = nums(keyText(p)); expect(y).toBe(x + k); expect(x + y).toBe(s); }
  });
});

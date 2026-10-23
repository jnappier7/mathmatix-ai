/**
 * Chapter Review: Honors Geometry — Chapter 11 (Circumference, Area, and Volume, 11.1–11.8), built
 * from Mr. Nappier's study sheet, the Measurement Formula Card and the Chapter 11 Review. Quick-fire:
 * one move per play — circumference and arc length, radians, circle and sector areas (forward and
 * backward), rhombus/kite and regular-polygon areas, Euler's formula, prisms and cylinders, pyramids
 * and cones (⅓, slant height), spheres and hemispheres, scaling, composites.
 *
 * Exact answers stay exact ("26π", "150√3", "32π/3"); the wrong choices are the formula card's two
 * mistakes — the diameter used as r, the ⅓ dropped or the slant height used in a volume.
 */
const { int, pick, sample, makeBank } = require('../prep/kit');

const BOOKS = {
  all: { name: 'Whole Chapter', ch: 'Ch. 11', blurb: 'Circumference, arcs, areas, polygons, Euler, prisms, pyramids, cones, spheres — mixed.' },
  circles: { name: 'Circles, Arcs & Sectors', ch: '11.1–11.2', blurb: 'C and A, an arc or sector as a fraction, radians, the backward problems.' },
  polygons: { name: 'Areas of Polygons', ch: '11.3', blurb: 'Rhombus and kite, the regular polygon from its apothem, the hexagon shortcut, central angles.' },
  solids: { name: 'Prisms & Cylinders', ch: '11.4–11.5', blurb: 'Euler\'s formula, cross sections, V = Bh, Cavalieri.' },
  pointed: { name: 'Pyramids & Cones', ch: '11.6–11.7', blurb: 'V = ⅓Bh, the slant height, a cone\'s surface area.' },
  spheres: { name: 'Spheres & Composites', ch: '11.8', blurb: 'SA = 4πr², V = (4/3)πr³, hemispheres, scaling, silos and rockets.' },
};

const uniq = (xs) => [...new Set(xs)];
const mc = (rand, ans, wrongs) => ({ choices: [ans, ...sample(rand, uniq(wrongs.filter((w) => w !== ans)), 3)], answer: 0 });
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
/** k·π with k a reduced fraction p/q: "26π", "32π/3", "π/6" */
const pi = (p, q = 1) => { const g = gcd(p, q); p /= g; q /= g; const top = p === 1 ? 'π' : `${p}π`; return q === 1 ? top : `${top}/${q}`; };
const rt3 = (k) => (k === 1 ? '√3' : `${k}√3`);
const tenth = (x) => (Math.round(x * 10) / 10).toFixed(1);
const TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [6, 8, 10], [9, 12, 15]];
const POLY = { 3: 'triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon', 12: 'dodecagon' };

const T = {};

// ------------------------------------------------------------------ 11.1–11.2
T.circumference = { book: 'circles', make(rand) {
  const r = int(rand, 5, 15); const byD = rand() < 0.4;
  return { ask: 'Find the circumference (exact)', prompt: byD ? `A circle has diameter ${2 * r}.` : `A circle has radius ${r}.`,
    ...mc(rand, pi(2 * r), [pi(byD ? 4 * r : r), pi(r * r), pi(byD ? 4 * r * r : 2 * r * r), pi(4 * r)]),
    tell: byD ? `C = πd = ${2 * r}π — the diameter is already there; don't double it again.` : `C = 2πr = ${pi(2 * r)}.` };
} };

T.arcLength = { book: 'circles', make(rand) {
  const r = int(rand, 3, 18); const m = pick(rand, [30, 40, 45, 60, 72, 80, 90, 120, 135, 144, 150, 180, 210, 240, 270]);
  return { ask: 'Find the arc length (exact)', prompt: `A ${m}° arc in a circle of radius ${r}.`,
    ...mc(rand, pi(m * 2 * r, 360), [pi(m * r * r, 360), pi(2 * r), pi(m * r, 360), pi(m * 4 * r, 360), pi(m * 2 * r, 180), pi(m * r * r, 180)]),
    tell: `s = (${m}/360) · 2π(${r}) = ${pi(m * 2 * r, 360)} — the arc is that fraction of the circumference.` };
} };

T.toRadians = { book: 'circles', make(rand) {
  const d = pick(rand, [30, 45, 60, 90, 120, 135, 150, 210, 225, 240, 270, 300, 315, 330]);
  return { ask: 'Convert to radians (exact)', prompt: `${d}°`, ...mc(rand, pi(d, 180), [pi(d, 360), pi(d, 90), `${d}/π`, pi(180, d)]),
    tell: `multiply by π/180: ${d}π/180 = ${pi(d, 180)}.` };
} };

T.toDegrees = { book: 'circles', make(rand) {
  const d = pick(rand, [30, 45, 60, 90, 120, 135, 150, 180, 210, 240, 270, 300]); const g = gcd(d, 180);
  return { ask: 'Convert to degrees', prompt: `${pi(d / g, 180 / g)} radians`, typed: d, tell: `multiply by 180/π: ${pi(d / g, 180 / g)} · 180/π = ${d}°.` };
} };

T.circleArea = { book: 'circles', make(rand) {
  const r = int(rand, 5, 15); const byD = rand() < 0.4;
  return { ask: 'Find the area (exact)', prompt: byD ? `A circle has diameter ${2 * r}.` : `A circle has radius ${r}.`,
    ...mc(rand, pi(r * r), [pi(byD ? 4 * r * r : 2 * r), pi(2 * r), pi(4 * r * r), pi(byD ? r : 2 * r * r)]),
    tell: byD ? `halve the diameter FIRST: r = ${r}, A = πr² = ${pi(r * r)}. πd² is not the area of anything.` : `A = πr² = ${pi(r * r)}.` };
} };

T.sectorArea = { book: 'circles', make(rand) {
  const r = int(rand, 3, 14); const m = pick(rand, [30, 45, 60, 90, 120, 135, 150, 180, 210, 240, 270]);
  return { ask: 'Find the sector area (exact)', prompt: `A ${m}° sector in a circle of radius ${r}.`,
    ...mc(rand, pi(m * r * r, 360), [pi(m * 2 * r, 360), pi(r * r), pi(m * r * r, 180), pi(m * r, 360)]),
    tell: `A = (${m}/360) · π(${r})² = ${pi(m * r * r, 360)} — the same fraction, applied to the area.` };
} };

T.backward = { book: 'circles', make(rand) {
  const r = int(rand, 3, 12); const m = pick(rand, [30, 45, 60, 90, 120, 135, 150, 180, 240, 270]); const kind = pick(rand, ['angle', 'radius']);
  if (kind === 'angle') return { ask: 'Find the central angle', prompt: `A sector of a circle with radius ${r} has area ${pi(m * r * r, 360)}.`, typed: m,
    tell: `(m/360) · π(${r})² = ${pi(m * r * r, 360)} → m/360 = ${gcd(m, 360) === 360 ? 1 : `${m / gcd(m, 360)}/${360 / gcd(m, 360)}`} → m = ${m}°.` };
  return { ask: 'Find the radius', prompt: `A ${m}° arc has length ${pi(m * 2 * r, 360)}.`, typed: r,
    tell: `(${m}/360) · 2πr = ${pi(m * 2 * r, 360)} → solve the same equation for r: r = ${r}.` };
} };

// ------------------------------------------------------------------ 11.3
T.kiteArea = { book: 'polygons', make(rand) {
  const d1 = int(rand, 4, 24); const d2 = int(rand, 3, 20); if ((d1 * d2) % 2) return T.kiteArea.make(rand);
  const shape = pick(rand, ['kite', 'rhombus']);
  return { ask: `Find the area of the ${shape}`, prompt: `Diagonals ${d1} and ${d2}.`, typed: (d1 * d2) / 2, tell: `A = ½ d₁d₂ = ½ · ${d1} · ${d2} = ${(d1 * d2) / 2}.` };
} };

T.hexagonArea = { book: 'polygons', make(rand) {
  const s = 2 * int(rand, 1, 8); const k = (3 * s * s) / 2; // (3√3/2)s²
  return { ask: 'Exact area of a regular hexagon', prompt: `Side ${s}.`, ...mc(rand, rt3(k), [rt3(k / 3), rt3(2 * k), String(k), rt3(3 * s)]),
    tell: `apothem a = (s/2)√3 = ${rt3(s / 2)}; perimeter P = ${6 * s}; A = ½aP = ½ · ${rt3(s / 2)} · ${6 * s} = ${rt3(k)}. (Six equilateral triangles.)` };
} };

T.regularArea = { book: 'polygons', make(rand) {
  const n = pick(rand, [5, 6, 8, 10, 12]); const s = int(rand, 4, 14); const a = int(rand, 3, 12); if ((a * n * s) % 2) return T.regularArea.make(rand);
  return { ask: 'Find the area', prompt: `A regular ${POLY[n]} with side ${s} and apothem ${a}.`, typed: (a * n * s) / 2, tell: `P = ${n} · ${s} = ${n * s}; A = ½aP = ½ · ${a} · ${n * s} = ${(a * n * s) / 2}.` };
} };

T.centralAngle = { book: 'polygons', make(rand) {
  const n = pick(rand, [3, 4, 5, 6, 8, 9, 10, 12]); const half = rand() < 0.4 && 180 % n === 0;
  if (half) return { ask: 'The apothem right triangle: find its top angle', prompt: `A regular ${POLY[n]}.`, typed: 180 / n, tell: `half the central angle: 180°/${n} = ${180 / n}°. Then tan(${180 / n}°) = (s/2)/a.` };
  return { ask: 'Find the central angle', prompt: `A regular ${POLY[n]}.`, typed: 360 / n, tell: `360°/${n} = ${360 / n}°.` };
} };

T.apothemSetup = { book: 'polygons', make(rand) {
  const n = pick(rand, [5, 8, 9, 10, 12]); const s = int(rand, 4, 12);
  return { ask: 'Which equation finds the apothem a?', prompt: `A regular ${POLY[n]} with side ${s}.`,
    ...mc(rand, `tan(${180 / n}°) = ${s / 2}/a`, [`tan(${360 / n}°) = ${s / 2}/a`, `tan(${180 / n}°) = ${s}/a`, `sin(${180 / n}°) = a/${s / 2}`]),
    tell: `split into ${n} triangles; half of one is a right triangle with top angle 180°/${n} = ${180 / n}°, opposite leg s/2 = ${s / 2}, adjacent leg a.` };
} };

// ------------------------------------------------------------------ 11.4–11.5
T.euler = { book: 'solids', make(rand) {
  const solids = [['tetrahedron', 4, 4, 6], ['cube', 6, 8, 12], ['octahedron', 8, 6, 12], ['dodecahedron', 12, 20, 30], ['icosahedron', 20, 12, 30], ['square pyramid', 5, 5, 8], ['triangular prism', 5, 6, 9], ['pentagonal prism', 7, 10, 15], ['hexagonal prism', 8, 12, 18]];
  const [name, F, V, E] = pick(rand, solids); const want = pick(rand, ['E', 'V', 'F']);
  if (want === 'E') return { ask: 'How many edges?', prompt: `A ${name} has ${F} faces and ${V} vertices.`, typed: E, tell: `F + V − E = 2 → ${F} + ${V} − E = 2 → E = ${E}.` };
  if (want === 'V') return { ask: 'How many vertices?', prompt: `A ${name} has ${F} faces and ${E} edges.`, typed: V, tell: `F + V − E = 2 → ${F} + V − ${E} = 2 → V = ${V}.` };
  return { ask: 'How many faces?', prompt: `A ${name} has ${V} vertices and ${E} edges.`, typed: F, tell: `F + V − E = 2 → F + ${V} − ${E} = 2 → F = ${F}.` };
} };

T.crossSection = { book: 'solids', make(rand) {
  const Q = [
    { q: 'A plane slices a sphere. The cross section is…', ans: 'always a circle' }, { q: 'A rectangle is revolved around one of its sides. The solid is…', ans: 'a cylinder' },
    { q: 'A right triangle is revolved around a leg. The solid is…', ans: 'a cone' }, { q: 'A semicircle is revolved around its diameter. The solid is…', ans: 'a sphere' },
    { q: 'A plane slices a cylinder parallel to its base. The cross section is…', ans: 'a circle' }, { q: 'A plane slices a cube parallel to a face. The cross section is…', ans: 'a square' },
  ];
  const q = pick(rand, Q);
  return { ask: 'Name the shape', prompt: q.q, ...mc(rand, q.ans, ['always a circle', 'a cylinder', 'a cone', 'a sphere', 'a circle', 'a square', 'a triangle']), tell: `${q.ans}.` };
} };

T.prismVolume = { book: 'solids', make(rand) {
  if (rand() < 0.5) { const l = int(rand, 3, 12); const w = int(rand, 2, 10); const h = int(rand, 2, 10);
    return { ask: 'Find the volume', prompt: `A rectangular prism is ${l} by ${w} by ${h}.`, typed: l * w * h, tell: `V = Bh = (${l} · ${w}) · ${h} = ${l * w * h}.` }; }
  const b = int(rand, 4, 14); const h = int(rand, 3, 12); const H = int(rand, 3, 12); if ((b * h) % 2) return T.prismVolume.make(rand);
  return { ask: 'Find the volume', prompt: `A prism's base is a triangle with base ${b} and height ${h}; the prism is ${H} tall.`, typed: (b * h * H) / 2, tell: `B = ½ · ${b} · ${h} = ${(b * h) / 2} first; V = Bh = ${(b * h) / 2} · ${H} = ${(b * h * H) / 2}.` };
} };

T.cylinderVolume = { book: 'solids', make(rand) {
  const r = int(rand, 3, 10); const h = int(rand, 2, 12); const byD = rand() < 0.35;
  return { ask: 'Find the volume (exact)', prompt: `A cylinder has ${byD ? `diameter ${2 * r}` : `radius ${r}`} and height ${h}.`,
    ...mc(rand, pi(r * r * h), [pi(byD ? 4 * r * r * h : 2 * r * r * h), pi(r * r * h, 3), pi(2 * r * h), pi(r * h), pi(r * r + 2 * r * h)]),
    tell: `${byD ? `r = ${r} (halve the diameter first); ` : ''}V = Bh = π(${r})² · ${h} = ${pi(r * r * h)}.` };
} };

T.cavalieri = { book: 'solids', make(rand) {
  const r = int(rand, 2, 8); const h = int(rand, 3, 12);
  if (rand() < 0.5) return { ask: 'An oblique cylinder leans. Its volume is…', prompt: `Radius ${r}, height ${h}, same as an upright cylinder.`, ...mc(rand, `the same: ${pi(r * r * h)} (Cavalieri's Principle)`, [`less than ${pi(r * r * h)} — the lean loses volume`, `more than ${pi(r * r * h)} — the lean adds volume`, 'impossible to find without the slant']),
    tell: 'same layers, same volume. Sliding the layers sideways changes nothing.' };
  return { ask: 'Cavalieri\'s Principle says two solids have the same volume when…', prompt: 'Complete the sentence.',
    ...mc(rand, 'they have the same height and the same cross-sectional area at every level', ['they have the same surface area', 'they have the same base and the same slant height', 'one is a prism and the other a cylinder']),
    tell: 'same height, same cross sections at every level → same volume, oblique or not.' };
} };

// ------------------------------------------------------------------ 11.6–11.7
T.pyramidVolume = { book: 'pointed', make(rand) {
  const s = int(rand, 3, 12); const h = int(rand, 3, 15); if ((s * s * h) % 3) return T.pyramidVolume.make(rand);
  const rect = rand() < 0.4; const w = int(rand, 2, 10); const B = rect ? s * w : s * s; if ((B * h) % 3) return T.pyramidVolume.make(rand);
  return { ask: 'Find the volume', prompt: rect ? `A pyramid has a ${s}-by-${w} base and height ${h}.` : `A square pyramid has base side ${s} and height ${h}.`, typed: (B * h) / 3,
    tell: `V = ⅓Bh = ⅓ · ${B} · ${h} = ${(B * h) / 3}. Pointed solids hold one third of their box.` };
} };

T.coneVolume = { book: 'pointed', make(rand) {
  const r = int(rand, 2, 10); const h = int(rand, 3, 15);
  return { ask: 'Find the volume (exact)', prompt: `A cone has radius ${r} and height ${h}.`, ...mc(rand, pi(r * r * h, 3), [pi(r * r * h), pi(2 * r * h, 3), pi(r * h, 3), pi(r * r * h, 2)]),
    tell: `V = ⅓πr²h = ⅓ · π · ${r * r} · ${h} = ${pi(r * r * h, 3)}. Don't drop the ⅓.` };
} };

T.slantHeight = { book: 'pointed', make(rand) {
  const [r, h, l] = pick(rand, TRIPLES); const kind = pick(rand, ['slant', 'sa', 'volumeTrap']);
  if (kind === 'slant') return { ask: 'Find the slant height', prompt: `A cone has radius ${r} and height ${h}.`, typed: l, tell: `ℓ² = r² + h² = ${r * r} + ${h * h} = ${l * l} → ℓ = ${l}.` };
  if (kind === 'sa') return { ask: 'Find the surface area (exact)', prompt: `A cone has radius ${r} and slant height ${l}.`, ...mc(rand, pi(r * r + r * l), [pi(r * l), pi(2 * r * r + r * l), pi(r * r + r * h), pi(r * r + 2 * r * l)]),
    tell: `SA = πr² + πrℓ = ${pi(r * r)} + ${pi(r * l)} = ${pi(r * r + r * l)}.` };
  return { ask: 'Find the volume (exact)', prompt: `A cone has radius ${r}, height ${h}, and slant height ${l}.`, ...mc(rand, pi(r * r * h, 3), [pi(r * r * l, 3), pi(r * r * h), pi(r * r * l), pi(r * l * h, 3)]),
    tell: `volume uses the TRUE height: ⅓π(${r})²(${h}) = ${pi(r * r * h, 3)}. The slant height ${l} only appears in surface area.` };
} };

T.backwardHeight = { book: 'pointed', make(rand) {
  const kind = pick(rand, ['cylinder', 'pyramid', 'cone']);
  if (kind === 'cylinder') { const r = int(rand, 2, 9); const h = int(rand, 2, 12); return { ask: 'Find the height', prompt: `A cylinder with radius ${r} has volume ${pi(r * r * h)}.`, typed: h, tell: `πr²h = ${pi(r * r * h)} → ${r * r}h = ${r * r * h} → h = ${h}.` }; }
  if (kind === 'cone') { const r = int(rand, 2, 9); const h = int(rand, 2, 12); return { ask: 'Find the height', prompt: `A cone with radius ${r} has volume ${pi(r * r * h, 3)}.`, typed: h, tell: `⅓πr²h = ${pi(r * r * h, 3)} → ${r * r}h = ${r * r * h} → h = ${h}.` }; }
  const l = int(rand, 2, 12); const w = int(rand, 2, 12); const h = int(rand, 2, 12);
  return { ask: 'Find the height', prompt: `A pyramid with a ${l}-by-${w} base has volume ${(l * w * h) / 3 === Math.floor((l * w * h) / 3) ? (l * w * h) / 3 : 'x'}.`, typed: h, tell: `⅓ · ${l * w} · h = ${(l * w * h) / 3} → h = ${h}.` };
} };
{ const base = T.backwardHeight.make; T.backwardHeight.make = (rand) => { let t = base(rand); for (let i = 0; i < 30 && /volume x\./.test(t.prompt); i++) t = base(rand); return t; }; }

// ------------------------------------------------------------------ 11.8
T.sphere = { book: 'spheres', make(rand) {
  const r = int(rand, 2, 12); const kind = pick(rand, ['sa', 'v', 'hemiV', 'hemiSA']);
  if (kind === 'sa') return { ask: 'Find the surface area (exact)', prompt: `A sphere has radius ${r}.`, ...mc(rand, pi(4 * r * r), [pi(r * r), pi(4 * r * r * r, 3), pi(2 * r * r), pi(4 * r)]), tell: `SA = 4πr² = ${pi(4 * r * r)} — four great circles.` };
  if (kind === 'v') return { ask: 'Find the volume (exact)', prompt: `A sphere has radius ${r}.`, ...mc(rand, pi(4 * r * r * r, 3), [pi(4 * r * r), pi(r * r * r, 3), pi(4 * r * r * r), pi(2 * r * r * r, 3)]), tell: `V = (4/3)πr³ = (4/3) · π · ${r * r * r} = ${pi(4 * r * r * r, 3)}.` };
  if (kind === 'hemiV') return { ask: 'Find the volume of the hemisphere (exact)', prompt: `Radius ${r}.`, ...mc(rand, pi(2 * r * r * r, 3), [pi(4 * r * r * r, 3), pi(2 * r * r), pi(r * r * r, 3), pi(2 * r * r * r)]), tell: `half of (4/3)πr³ = (2/3)π · ${r * r * r} = ${pi(2 * r * r * r, 3)}.` };
  return { ask: 'Find the TOTAL surface area of the hemisphere (exact)', prompt: `Radius ${r}, including the flat face.`, ...mc(rand, pi(3 * r * r), [pi(2 * r * r), pi(4 * r * r), pi(r * r), pi(6 * r * r)]), tell: `half of 4πr² is ${pi(2 * r * r)}, plus the flat circle πr² = ${pi(r * r)}: ${pi(3 * r * r)}.` };
} };

T.nearestTenth = { book: 'spheres', make(rand) {
  const r = int(rand, 2, 10); const kind = pick(rand, ['v', 'hemi', 'sa']);
  const val = kind === 'v' ? (4 / 3) * Math.PI * r ** 3 : kind === 'hemi' ? (2 / 3) * Math.PI * r ** 3 : 4 * Math.PI * r * r;
  const wrongs = kind === 'sa' ? [Math.PI * r * r, (4 / 3) * Math.PI * r ** 3, 2 * Math.PI * r * r] : [4 * Math.PI * r * r, (kind === 'v' ? 2 / 3 : 4 / 3) * Math.PI * r ** 3, Math.PI * r ** 3];
  const seen = new Set([tenth(val)]); const w = []; for (const x of wrongs) { const s = tenth(x); if (!seen.has(s)) { seen.add(s); w.push(s); } }
  return { ask: `${kind === 'sa' ? 'Surface area' : 'Volume'}, nearest tenth`, prompt: `A ${kind === 'hemi' ? 'hemisphere' : 'sphere'} has radius ${r}.`, choices: [tenth(val), ...w], answer: 0,
    tell: `${kind === 'v' ? `(4/3)π(${r})³` : kind === 'hemi' ? `(2/3)π(${r})³` : `4π(${r})²`} ≈ ${tenth(val)}. Keep π until the last step.` };
} };

T.scaling = { book: 'spheres', make(rand) {
  const k = pick(rand, [2, 3, 4, 5]); const want = rand() < 0.5 ? 'surface area' : 'volume';
  return { ask: `The radius is multiplied by ${k}. The ${want} is multiplied by…`, prompt: 'Any sphere.', typed: want === 'volume' ? k ** 3 : k * k,
    tell: `radius × ${k} → surface × ${k}² = ${k * k}, volume × ${k}³ = ${k ** 3}.` };
} };

T.composite = { book: 'spheres', make(rand) {
  const r = int(rand, 2, 6); const h = int(rand, 3, 12); const kind = pick(rand, ['rocket', 'silo', 'capsule']);
  if (kind === 'rocket') { const hc = 3 * int(rand, 1, 4); return { ask: 'Total volume (exact)', prompt: `A rocket model: a cylinder of radius ${r} and height ${h}, topped by a cone of radius ${r} and height ${hc}.`,
    ...mc(rand, pi(r * r * h + (r * r * hc) / 3), [pi(r * r * h + r * r * hc), pi(r * r * h), pi(r * r * (h + hc), 3), pi(2 * r * h + (r * r * hc) / 3)]),
    tell: `cylinder ${pi(r * r * h)} + cone ${pi((r * r * hc) / 3)} = ${pi(r * r * h + (r * r * hc) / 3)}.` }; }
  if (kind === 'silo') return { ask: 'Total volume (exact)', prompt: `A silo: a cylinder of radius ${r} and height ${h} with a hemisphere on top.`,
    ...mc(rand, pi(3 * r * r * h + 2 * r * r * r, 3), [pi(3 * r * r * h + 4 * r * r * r, 3), pi(r * r * h), pi(r * r * h + 2 * r * r), pi(3 * r * r * h + r * r * r, 3)]),
    tell: `cylinder ${pi(r * r * h)} + hemisphere ${pi(2 * r * r * r, 3)} = ${pi(3 * r * r * h + 2 * r * r * r, 3)}.` };
  return { ask: 'Total volume (exact)', prompt: `A capsule: a cylinder of radius ${r} and height ${h} with a hemisphere on each end.`,
    ...mc(rand, pi(3 * r * r * h + 4 * r * r * r, 3), [pi(3 * r * r * h + 2 * r * r * r, 3), pi(r * r * h), pi(3 * r * r * h + 8 * r * r * r, 3), pi(r * r * h + 4 * r * r)]),
    tell: `cylinder ${pi(r * r * h)} + two hemispheres = one sphere ${pi(4 * r * r * r, 3)}: ${pi(3 * r * r * h + 4 * r * r * r, 3)}.` };
} };

T.whichFormula = { book: 'all', make(rand) {
  const Q = [
    ['the area of a rhombus or kite', 'A = ½ d₁d₂'], ['the area of a regular polygon', 'A = ½aP'], ['the volume of a prism or cylinder', 'V = Bh'], ['the volume of a pyramid or cone', 'V = ⅓Bh'],
    ['the surface area of a cone', 'SA = πr² + πrℓ'], ['the surface area of a sphere', 'SA = 4πr²'], ['the volume of a sphere', 'V = (4/3)πr³'], ['the length of an arc', 's = (m/360) · 2πr'], ['the area of a sector', 'A = (m/360) · πr²'],
  ];
  const [d, w] = pick(rand, Q);
  return { ask: 'Which formula?', prompt: d, ...mc(rand, w, Q.map((q) => q[1])), tell: `${w}.` };
} };

T.mistakes = { book: 'all', make(rand) {
  const Q = [
    { q: 'A student finds the area of a circle with diameter 10 as 100π. What went wrong?', ans: 'the diameter was used as r — halve it first: 25π', wrongs: ['nothing — 100π is right', 'the answer should be 20π', 'π should be 3.14 exactly'] },
    { q: 'A student finds a cone\'s volume as πr²h. What went wrong?', ans: 'the ⅓ was dropped — a cone is one third of its cylinder', wrongs: ['nothing — that is the cone formula', 'it should be πrℓ', 'it should be 2πr²h'] },
    { q: 'A student uses the slant height ℓ in a cone\'s VOLUME. What went wrong?', ans: 'volume uses the true height h; ℓ only appears in surface area', wrongs: ['nothing — ℓ and h are interchangeable', 'ℓ should only be used in volume', 'the ⅓ should be ½'] },
  ];
  const q = pick(rand, Q);
  return { ask: 'Error analysis', prompt: q.q, ...mc(rand, q.ans, q.wrongs), tell: `${q.ans}.` };
} };

module.exports = makeBank(BOOKS, T);

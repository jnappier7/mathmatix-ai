const {
  compileExpr,
  validateModelSpec,
  getModel,
  readoutTokens,
  measureAngle,
  MODELS,
} = require('../../public/js/conceptModelSpec');

describe('conceptModelSpec — safe param-scoped expression compiler', () => {
  it('evaluates a function expression against a scope', () => {
    const c = compileExpr('m*x + b');
    expect(c.eval({ x: 2, m: 3, b: 1 })).toBe(7);   // 3*2 + 1
    expect(c.eval({ x: 0, m: 3, b: -4 })).toBe(-4);
  });

  it('reports the free variables it reads (excluding x / known fns)', () => {
    const c = compileExpr('a*sin(x) + k');
    expect(c.vars.sort()).toEqual(['a', 'k']); // x and sin are not free params
  });

  it('measures a derived quantity live (slope = rise/run)', () => {
    const c = compileExpr('(y2 - y1) / (x2 - x1)');
    expect(c.eval({ x1: 0, y1: 0, x2: 2, y2: 3 })).toBe(1.5);
    expect(c.eval({ x1: 1, y1: 1, x2: 1, y2: 5 })).toBeNaN(); // vertical → div by 0
  });

  it('throws on a syntax error / empty expression', () => {
    expect(() => compileExpr('m*x +')).toThrow();      // dangling operator
    expect(() => compileExpr('m*x )')).toThrow();      // unbalanced paren
    expect(() => compileExpr('')).toThrow();
  });

  it('treats an unknown identifier as a free variable (caught later by the validator)', () => {
    // `frobnicate(x)` parses as the free var `frobnicate` times x — it is NOT a
    // compile error. The validator rejects it because `frobnicate` is not a
    // declared param/derived name; that is where "can pick a weird layout but
    // cannot display wrong math" is enforced.
    const c = compileExpr('frobnicate * x');
    expect(c.vars).toContain('frobnicate');
    expect(c.eval({ x: 2, frobnicate: 5 })).toBe(10);
  });

  it('extracts readout template tokens', () => {
    expect(readoutTokens('y = {m}x + {b}')).toEqual(['m', 'b']);
    expect(readoutTokens('slope = {slope}')).toEqual(['slope']);
    expect(readoutTokens('no tokens here')).toEqual([]);
  });
});

describe('conceptModelSpec — curated catalog', () => {
  it('exposes the curated model names', () => {
    expect(MODELS).toContain('slope_intercept_line');
    expect(MODELS).toContain('two_point_line');
  });

  it('returns a deep copy so callers cannot mutate the shared catalog', () => {
    const a = getModel('slope_intercept_line');
    a.params.m = 999;
    const b = getModel('slope_intercept_line');
    expect(b.params.m).toBe(1); // untouched
  });

  it('returns null for an unknown model', () => {
    expect(getModel('flux_capacitor')).toBeNull();
  });

  it('every curated model passes validation', () => {
    MODELS.forEach((name) => {
      const res = validateModelSpec(getModel(name));
      expect(res.errors).toEqual([]);
      expect(res.valid).toBe(true);
    });
  });
});

describe('conceptModelSpec — validator (generated specs cannot render broken)', () => {
  function base() {
    return {
      model: 'test',
      params: { m: 1, b: 0 },
      controls: [{ type: 'slider', param: 'm', label: 'm', range: [-5, 5], step: 0.25 }],
      elements: [
        { id: 'plane', type: 'plane', x: [-10, 10], y: [-10, 10], grid: true },
        { id: 'line', type: 'function', fn: 'm*x + b' },
        { id: 'eq', type: 'readout', text: 'y = {m}x + {b}' },
      ],
      reveal: ['plane', 'line', 'eq'],
    };
  }

  it('accepts a well-formed spec', () => {
    expect(validateModelSpec(base()).valid).toBe(true);
  });

  it('rejects a control bound to an undeclared param', () => {
    const s = base();
    s.controls[0].param = 'z';
    const r = validateModelSpec(s);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/unknown param "z"/);
  });

  it('rejects a function referencing an undeclared name', () => {
    const s = base();
    s.elements[1].fn = 'm*x + b + q';
    const r = validateModelSpec(s);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/unknown name "q"/);
  });

  it('rejects a readout referencing an undeclared name', () => {
    const s = base();
    s.elements[2].text = 'y = {m}x + {c}';
    const r = validateModelSpec(s);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/unknown name "c"/);
  });

  it('rejects a point that binds an undeclared param', () => {
    const s = base();
    s.elements.push({ id: 'dot', type: 'point', at: [0, 'b'], draggable: true, binds: 'q' });
    const r = validateModelSpec(s);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/binds unknown numeric param "q"/);
  });

  it('rejects a point whose `at` names an undeclared param', () => {
    const s = base();
    s.elements.push({ id: 'dot', type: 'point', at: ['zzz', 'b'] });
    const r = validateModelSpec(s);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/at references unknown name "zzz"/);
  });

  it('rejects a line referencing a non-existent point', () => {
    const s = base();
    s.elements.push({ id: 'ln', type: 'line', through: ['p1', 'p2'] });
    const r = validateModelSpec(s);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/references unknown point/);
  });

  it('rejects duplicate element ids', () => {
    const s = base();
    s.elements.push({ id: 'plane', type: 'readout', text: 'dup' });
    const r = validateModelSpec(s);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/duplicate element id "plane"/);
  });

  it('rejects reveal/drag referencing a non-existent element', () => {
    const s = base();
    s.reveal = ['plane', 'ghost'];
    const r = validateModelSpec(s);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/reveal references unknown element "ghost"/);
  });

  it('rejects a derived expression with an unknown reference', () => {
    const s = base();
    s.derived = { slope: '(y2 - y1) / (x2 - x1)' };
    const r = validateModelSpec(s);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/references unknown name/);
  });

  it('accepts a derived expression that resolves, and lets readouts read it', () => {
    const s = {
      model: 'two_pt',
      params: { x1: 0, y1: 0, x2: 1, y2: 1 },
      derived: { slope: '(y2 - y1) / (x2 - x1)' },
      elements: [
        { id: 'plane', type: 'plane', x: [-10, 10], y: [-10, 10] },
        { id: 'p1', type: 'point', at: ['x1', 'y1'], draggable: true, binds: ['x1', 'y1'] },
        { id: 'p2', type: 'point', at: ['x2', 'y2'], draggable: true, binds: ['x2', 'y2'] },
        { id: 'ln', type: 'line', through: ['p1', 'p2'] },
        { id: 'out', type: 'readout', text: 'slope = {slope}' },
      ],
    };
    expect(validateModelSpec(s).valid).toBe(true);
  });

  it('rejects non-object / structurally empty specs', () => {
    expect(validateModelSpec(null).valid).toBe(false);
    expect(validateModelSpec({}).valid).toBe(false);
    expect(validateModelSpec({ model: 'x', params: {}, elements: [] }).valid).toBe(false);
  });
});

describe('conceptModelSpec — function_transformations vocabulary (selector / parents / choice / compose)', () => {
  it('the universal-parent model is in the catalog and validates', () => {
    expect(MODELS).toContain('function_transformations');
    const r = validateModelSpec(getModel('function_transformations'));
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('composes the SELECTED parent at a shifted argument, correct by construction', () => {
    // curve = a * f(x - h) + k. With f = x^2, a=2, h=1, k=3 at x=2:
    //   f(2-1) = 1^2 = 1 → 2*1 + 3 = 5
    const spec = getModel('function_transformations');
    const parentFn = compileExpr(spec.parents.quadratic.fn);    // x^2
    const argFn = compileExpr(spec.elements[2].compose.P.arg);  // x - h
    const outerFn = compileExpr(spec.elements[2].fn);           // a*P + k
    const P = { a: 2, h: 1, k: 3 };
    const argVal = argFn.eval({ x: 2, h: P.h });
    const Pval = parentFn.eval({ x: argVal });
    expect(outerFn.eval({ a: P.a, k: P.k, P: Pval })).toBe(5);
  });

  it('preserves identifier case so placeholder P is distinct from param p', () => {
    const c = compileExpr('a*P + k');
    expect(c.vars.sort()).toEqual(['P', 'a', 'k']); // P kept uppercase
  });

  function tbase() {
    return {
      model: 't',
      params: { parent: 'quadratic', a: 1 },
      parents: { quadratic: { fn: 'x^2', label: 'x²' }, cubic: { fn: 'x^3', label: 'x³' } },
      controls: [{ type: 'choice', param: 'parent', label: 'f' }],
      elements: [
        { id: 'plane', type: 'plane', x: [-10, 10], y: [-10, 10] },
        { id: 'curve', type: 'function', fn: 'a*P', compose: { P: { parent: 'parent', arg: 'x' } } },
        { id: 'eq', type: 'readout', text: 'f = {parent.label}' },
      ],
    };
  }

  it('accepts a well-formed selector/choice/compose spec', () => {
    expect(validateModelSpec(tbase()).valid).toBe(true);
  });

  it('rejects a selector default that is not a parent', () => {
    const s = tbase();
    s.params.parent = 'octic';
    expect(validateModelSpec(s).errors.join(' ')).toMatch(/is not a parent/);
  });

  it('rejects a choice bound to a numeric (non-selector) param', () => {
    const s = tbase();
    s.controls[0].param = 'a';
    expect(validateModelSpec(s).errors.join(' ')).toMatch(/must drive a selector param/);
  });

  it('rejects a slider bound to a selector param', () => {
    const s = tbase();
    s.controls.push({ type: 'slider', param: 'parent', range: [0, 1] });
    expect(validateModelSpec(s).errors.join(' ')).toMatch(/must drive a numeric param/);
  });

  it('rejects a parent fn that uses anything other than x', () => {
    const s = tbase();
    s.parents.quadratic.fn = 'a*x^2';
    expect(validateModelSpec(s).errors.join(' ')).toMatch(/may only use x/);
  });

  it('rejects compose whose parent is not a selector', () => {
    const s = tbase();
    s.elements[1].compose.P.parent = 'a';
    expect(validateModelSpec(s).errors.join(' ')).toMatch(/compose parent "a" is not a selector/);
  });

  it('rejects a function reading the placeholder without declaring compose', () => {
    const s = tbase();
    delete s.elements[1].compose;
    expect(validateModelSpec(s).errors.join(' ')).toMatch(/references unknown name "P"/);
  });

  it('rejects a {selector.field} token whose base is not a selector', () => {
    const s = tbase();
    s.elements[2].text = 'f = {a.label}';
    expect(validateModelSpec(s).errors.join(' ')).toMatch(/needs a selector before the dot/);
  });
});

describe('conceptModelSpec — geometry (measure, never assert)', () => {
  it('measureAngle computes the non-reflex angle at a vertex', () => {
    expect(measureAngle([0, 0], [1, 0], [0, 1])).toBeCloseTo(90, 6);
    expect(measureAngle([0, 0], [1, 0], [-1, 0])).toBeCloseTo(180, 6);
    expect(measureAngle([0, 0], [1, 0], [1, 1])).toBeCloseTo(45, 6);
    expect(measureAngle([0, 0], [0, 0], [1, 1])).toBeNaN(); // degenerate ray
  });

  it('inscribed_angle is half the central angle, by construction (at the catalog coords)', () => {
    const s = getModel('inscribed_angle');
    const at = {};
    s.elements.filter((e) => e.type === 'point').forEach((p) => { at[p.id] = p.at; });
    const central = measureAngle(at.O, at.A, at.C);
    const inscribed = measureAngle(at.B, at.A, at.C);
    // Catalog coords are rounded to 4 dp, so allow ~0.01° slack on the absolutes;
    // the half-angle relationship is the real invariant.
    expect(central).toBeCloseTo(120, 2);
    expect(inscribed).toBeCloseTo(60, 2);
    expect(inscribed).toBeCloseTo(central / 2, 3);
  });

  it('triangle interior angles sum to 180°, by construction (at the catalog coords)', () => {
    const s = getModel('triangle_angle_sum');
    const at = {};
    s.elements.filter((e) => e.type === 'point').forEach((p) => { at[p.id] = p.at; });
    const sum = measureAngle(at.A, at.B, at.C) +
                measureAngle(at.B, at.A, at.C) +
                measureAngle(at.C, at.A, at.B);
    expect(sum).toBeCloseTo(180, 4);
  });

  it('a linear pair sums to 180°, by construction (at the catalog coords)', () => {
    const s = getModel('linear_pair_angles');
    const at = {};
    s.elements.filter((e) => e.type === 'point').forEach((p) => { at[p.id] = p.at; });
    const ang1 = measureAngle(at.O, at.A, at.B);
    const ang2 = measureAngle(at.O, at.A2, at.B);
    expect(ang1 + ang2).toBeCloseTo(180, 6);
  });

  it('the geometry models validate', () => {
    expect(validateModelSpec(getModel('inscribed_angle')).errors).toEqual([]);
    expect(validateModelSpec(getModel('triangle_angle_sum')).errors).toEqual([]);
    expect(validateModelSpec(getModel('linear_pair_angles')).errors).toEqual([]);
  });

  function gbase() {
    return {
      model: 'g',
      params: {},
      measures: { ang: { type: 'angle', at: 'B', rays: ['A', 'C'] } },
      elements: [
        { id: 'plane', type: 'plane', x: [-5, 5], y: [-5, 5] },
        { id: 'A', type: 'point', at: [-2, 0], draggable: true },
        { id: 'B', type: 'point', at: [0, 0], draggable: true },
        { id: 'C', type: 'point', at: [2, 0], draggable: true },
        { id: 'tri', type: 'polygon', vertices: ['A', 'B', 'C'] },
        { id: 'angB', type: 'angle', at: 'B', rays: ['A', 'C'], measure: true },
        { id: 'out', type: 'readout', text: 'angle = {ang}' },
      ],
    };
  }

  it('accepts a well-formed geometry spec', () => {
    expect(validateModelSpec(gbase()).valid).toBe(true);
  });

  it('rejects a measure referencing a non-existent point', () => {
    const s = gbase();
    s.measures.ang.rays = ['A', 'Z'];
    expect(validateModelSpec(s).errors.join(' ')).toMatch(/measure "ang" ray "Z" is not a point/);
  });

  it('rejects an angle whose vertex is not a point', () => {
    const s = gbase();
    s.elements.find((e) => e.id === 'angB').at = 'tri';
    expect(validateModelSpec(s).errors.join(' ')).toMatch(/vertex "tri" is not a point/);
  });

  it('rejects a polygon with fewer than three vertices', () => {
    const s = gbase();
    s.elements.find((e) => e.id === 'tri').vertices = ['A', 'B'];
    expect(validateModelSpec(s).errors.join(' ')).toMatch(/needs vertices/);
  });

  it('rejects a circle with a non-positive radius', () => {
    const s = gbase();
    s.elements.push({ id: 'c', type: 'circle', center: [0, 0], radius: 0 });
    expect(validateModelSpec(s).errors.join(' ')).toMatch(/positive radius/);
  });

  it('rejects a point gliding on a non-existent circle', () => {
    const s = gbase();
    s.elements.find((e) => e.id === 'B').on = 'circle:ghost';
    expect(validateModelSpec(s).errors.join(' ')).toMatch(/on references unknown circle "ghost"/);
  });

  it('lets a derived value read a measure (e.g. an angle sum)', () => {
    const s = gbase();
    s.measures.ang2 = { type: 'angle', at: 'A', rays: ['B', 'C'] };
    s.derived = { total: 'ang + ang2' };
    s.elements.find((e) => e.id === 'out').text = 'sum = {total}';
    expect(validateModelSpec(s).valid).toBe(true);
  });
});

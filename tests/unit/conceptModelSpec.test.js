const {
  compileExpr,
  validateModelSpec,
  getModel,
  readoutTokens,
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
    expect(r.errors.join(' ')).toMatch(/binds unknown param "q"/);
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

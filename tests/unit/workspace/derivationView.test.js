const { classify, cleanLatex } = require('../../../public/js/living-workspace/dom/derivationView.js');

// The tutor sometimes wraps board tex in math delimiters, which make
// KaTeX.render error ("Can't use function '\(' in math mode") and show raw
// red source. cleanLatex strips those wrappers so the equation typesets.
describe('derivationView.cleanLatex', () => {
  it('strips the \\(...\\) delimiters seen live (multi-wrapped answer)', () => {
    // \(x^{5}\)-\(x^{3}\)+7x+C  ->  x^{5} - x^{3} +7x+C  (renderable)
    const out = cleanLatex('\\(x^{5}\\)-\\(x^{3}\\)+7x+C');
    expect(out).not.toMatch(/\\[()]/);
    expect(out).toContain('x^{5}');
    expect(out).toContain('+C');
  });

  it('strips \\[...\\] display delimiters and $ / $$ wrappers', () => {
    expect(cleanLatex('\\[ x = 5 \\]')).toBe('x = 5');
    expect(cleanLatex('$$\\int x\\,dx$$')).toBe('\\int x\\,dx');
    expect(cleanLatex('$x+1$')).toBe('x+1');
  });

  it('leaves clean tex and interior \\left( … \\right) untouched', () => {
    expect(cleanLatex('x^2 - 4x + 3')).toBe('x^2 - 4x + 3');
    expect(cleanLatex('\\left( x+1 \\right)^2')).toBe('\\left( x+1 \\right)^2');
  });

  it('handles junk', () => {
    expect(cleanLatex(null)).toBe('');
    expect(cleanLatex(undefined)).toBe('');
  });
});

// classify() decides how each adapted element renders in the focused
// derivation. Pure function; the DOM layout is verified in-browser.
describe('derivationView.classify', () => {
  const eq = (role) => ({ type: 'equation', semantic: { latex: 'x=1', role } });

  it('maps the equation roles the adapter emits', () => {
    expect(classify(eq('problem'))).toBe('problem');
    expect(classify(eq('operation'))).toBe('operation');
    expect(classify(eq('solution'))).toBe('solution');
    expect(classify(eq('scaffold'))).toBe('scaffold');
    expect(classify(eq('example'))).toBe('example');
  });

  it('treats resolve / unknown / missing equation roles as a plain step', () => {
    expect(classify(eq('step'))).toBe('step');
    expect(classify(eq('whatever'))).toBe('step');
    expect(classify({ type: 'equation', semantic: {} })).toBe('step');
    expect(classify({ type: 'equation' })).toBe('step');
  });

  it('renders every non-equation type (graph/image/geometry) as an inline block', () => {
    expect(classify({ type: 'graph', semantic: { fn: 'x^2' } })).toBe('block');
    expect(classify({ type: 'image', semantic: { query: 'unit circle' } })).toBe('block');
    expect(classify({ type: 'geometry', semantic: { diagramType: 'triangle' } })).toBe('block');
  });

  it('ignores junk', () => {
    expect(classify(null)).toBeNull();
    expect(classify(undefined)).toBeNull();
    expect(classify('nope')).toBeNull();
  });
});

// Voice ships the board cumulatively — each turn resends every step and only
// the last is typically new. The spoken-step spotlight keys off exactly that:
// whatever arrived THIS turn is what the tutor is talking about.
describe('derivationView.freshNodes', () => {
  const { freshNodes } = require('../../../public/js/living-workspace/dom/derivationView.js');

  it('marks only the step appended this turn', () => {
    const a = { n: 'a' }, b = { n: 'b' }, c = { n: 'c' };
    expect(freshNodes([a, b], [a, b, c])).toEqual([c]);
  });

  it('marks nothing when the turn re-sends an unchanged board', () => {
    const a = { n: 'a' }, b = { n: 'b' };
    expect(freshNodes([a, b], [a, b])).toEqual([]);
  });

  it('marks every line after a new problem wipes the stack', () => {
    // The regression an index count would cause: the new stack is SHORTER than
    // the old one, so "past the old length" marks nothing at all.
    const oldA = { n: 'old1' }, oldB = { n: 'old2' }, oldC = { n: 'old3' };
    const newA = { n: 'new1' };
    expect(freshNodes([oldA, oldB, oldC], [newA])).toEqual([newA]);
  });

  it('marks multiple steps when a turn lands several at once', () => {
    const a = { n: 'a' }, b = { n: 'b' }, c = { n: 'c' };
    expect(freshNodes([a], [a, b, c])).toEqual([b, c]);
  });

  it('handles the first turn on an empty board', () => {
    const a = { n: 'a' };
    expect(freshNodes([], [a])).toEqual([a]);
  });
});

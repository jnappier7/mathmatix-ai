const { classify } = require('../../../public/js/living-workspace/dom/derivationView.js');

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

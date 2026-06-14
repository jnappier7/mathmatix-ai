const { synthesizeWorkedExampleSteps } = require('../../utils/pipeline/boardSynthesizer');

// The hybrid backfill: when a teaching turn carries a multi-step derivation but
// the model emitted no `example` cards, mirror the tutor's own math spans onto
// the board. Conservative — ground truth only, and nothing on prose / a lone
// equation (a half-board is worse than none).
describe('synthesizeWorkedExampleSteps — derivation extraction', () => {
  it('extracts ordered steps from display math ($$ and \\[ \\])', () => {
    const tutor = [
      'Awesome! First we set up the integral:',
      '$$ A = \\int_{-r}^{r} \\sqrt{r^2 - x^2}\\,dx $$',
      'Using a trig substitution this becomes:',
      '\\[ A = r^2 \\int \\cos^2(\\theta)\\,d\\theta \\]',
      'and finally:',
      '$$ A = \\pi r^2 $$',
    ].join('\n');

    const steps = synthesizeWorkedExampleSteps({ tutorResponse: tutor });
    expect(steps.map(s => s.action)).toEqual(['example', 'example', 'example']);
    expect(steps[0].tex).toContain('\\int_{-r}^{r}');
    expect(steps[2].tex).toBe('A = \\pi r^2');
  });

  it('returns [] on prose with no math', () => {
    const tutor = 'Great question! Integrals add up infinitely many thin rectangles. '
      + 'As they get thinner, the sum approaches the exact area under the curve.';
    expect(synthesizeWorkedExampleSteps({ tutorResponse: tutor })).toEqual([]);
  });

  it('returns [] on a single equation (not a derivation)', () => {
    const tutor = 'The integral of x squared is $$ \\int x^2\\,dx = \\tfrac{1}{3}x^3 + C $$.';
    expect(synthesizeWorkedExampleSteps({ tutorResponse: tutor })).toEqual([]);
  });

  it('skips inline non-math spans (a lone variable) — no false steps', () => {
    const tutor = 'Here \\(x\\) is the input and \\(y\\) is the output, '
      + 'so \\(f\\) is a function.';
    expect(synthesizeWorkedExampleSteps({ tutorResponse: tutor })).toEqual([]);
  });

  it('dedupes exact repeats', () => {
    const tutor = '$$ 2x = 16 $$ ... restating ... $$ 2x = 16 $$ then $$ x = 8 $$';
    const steps = synthesizeWorkedExampleSteps({ tutorResponse: tutor });
    expect(steps).toHaveLength(2);
    expect(steps.map(s => s.tex)).toEqual(['2x = 16', 'x = 8']);
  });

  it('safe on empty / non-string input', () => {
    expect(synthesizeWorkedExampleSteps({ tutorResponse: '' })).toEqual([]);
    expect(synthesizeWorkedExampleSteps({})).toEqual([]);
    expect(synthesizeWorkedExampleSteps({ tutorResponse: null })).toEqual([]);
  });
});

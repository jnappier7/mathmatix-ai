const {
  synthesizeFallbackImage,
  _detectVisualPromise,
  _extractVisualConcept,
} = require('../../utils/pipeline/boardSynthesizer');

describe('visual-promise backfill', () => {
  const realPromise =
    "Here's a visual representation of the inscribed angle theorem! You can see the inscribed angle ∠ABC and the central angle ∠AOC.";

  it('detects a visual promise in the tutor text', () => {
    expect(_detectVisualPromise(realPromise)).toBe(true);
    expect(_detectVisualPromise("Let me show you a diagram of the unit circle.")).toBe(true);
    expect(_detectVisualPromise("What would you subtract from both sides?")).toBe(false);
    expect(_detectVisualPromise("That's correct, nice work!")).toBe(false);
  });

  it('extracts the concept the visual is OF', () => {
    expect(_extractVisualConcept(realPromise)).toBe('inscribed angle theorem');
    expect(_extractVisualConcept('a diagram of the unit circle here')).toBe('unit circle');
    expect(_extractVisualConcept('here is a picture showing similar triangles.')).toBe('similar triangles');
  });

  it('backfills an image command from the promised concept (the screenshot case)', () => {
    const cmd = synthesizeFallbackImage({ tutorResponse: realPromise });
    expect(cmd).toEqual({
      action: 'image',
      query: 'inscribed angle theorem diagram',
      caption: 'inscribed angle theorem',
    });
  });

  it('falls back to the active skill name when the sentence has no explicit concept', () => {
    const cmd = synthesizeFallbackImage({
      tutorResponse: 'Take a look at this diagram!',
      activeSkill: { name: 'Pythagorean theorem' },
    });
    expect(cmd).toEqual({
      action: 'image',
      query: 'Pythagorean theorem diagram',
      caption: 'Pythagorean theorem',
    });
  });

  it('returns null when the tutor did NOT promise a visual (no false images)', () => {
    expect(synthesizeFallbackImage({ tutorResponse: 'What do you get when you factor it?' })).toBeNull();
  });

  it('returns null when a visual is promised but no concept can be derived (no garbage search)', () => {
    expect(synthesizeFallbackImage({ tutorResponse: 'Here is a picture for you.' })).toBeNull();
  });

  it('does not double up "diagram" if the concept already names a visual', () => {
    const cmd = synthesizeFallbackImage({ tutorResponse: 'Here is a diagram of the unit circle diagram.' });
    expect(cmd.query).toBe('unit circle diagram');
  });
});

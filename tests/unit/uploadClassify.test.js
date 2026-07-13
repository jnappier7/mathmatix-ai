const { parseClassification, deriveIntent } = require('../../routes/uploadClassify');

describe('uploadClassify — parseClassification', () => {
  it('parses a clean JSON object', () => {
    const out = parseClassification('{"hasWork":true,"problemCount":4,"confidence":0.9,"reason":"answers written"}');
    expect(out).toEqual({ hasWork: true, problemCount: 4, confidence: 0.9, reason: 'answers written' });
  });

  it('tolerates a markdown code fence and surrounding prose', () => {
    const raw = 'Sure!\n```json\n{"hasWork":false,"problemCount":3,"confidence":0.8,"reason":"blank worksheet"}\n```';
    const out = parseClassification(raw);
    expect(out.hasWork).toBe(false);
    expect(out.problemCount).toBe(3);
  });

  it('clamps confidence into [0,1] and coerces types', () => {
    const out = parseClassification('{"hasWork":1,"problemCount":"x","confidence":1.7,"reason":42}');
    expect(out.hasWork).toBe(true);     // truthy -> true
    expect(out.problemCount).toBe(0);   // non-finite -> 0
    expect(out.confidence).toBe(1);     // clamped
    expect(out.reason).toBe('');        // non-string -> ''
  });

  it('returns null for unparseable input', () => {
    expect(parseClassification('no json here')).toBeNull();
    expect(parseClassification('')).toBeNull();
    expect(parseClassification(null)).toBeNull();
  });

  it('caps an overly long reason', () => {
    const long = 'a'.repeat(200);
    const out = parseClassification(`{"hasWork":true,"problemCount":1,"confidence":0.9,"reason":"${long}"}`);
    expect(out.reason.length).toBe(80);
  });
});

describe('uploadClassify — deriveIntent', () => {
  it('suggests check_work when work is present and confident', () => {
    expect(deriveIntent({ hasWork: true, confidence: 0.9 })).toBe('check_work');
  });

  it('suggests get_help when no work and confident', () => {
    expect(deriveIntent({ hasWork: false, confidence: 0.9 })).toBe('get_help');
  });

  it('falls back to ambiguous when confidence is low', () => {
    expect(deriveIntent({ hasWork: true, confidence: 0.4 })).toBe('ambiguous');
    expect(deriveIntent({ hasWork: false, confidence: 0.2 })).toBe('ambiguous');
  });

  it('does not force ambiguous when confidence is absent', () => {
    expect(deriveIntent({ hasWork: true, confidence: null })).toBe('check_work');
  });
});

/**
 * Tests for verifyMetrics — the in-memory answer-verifier metrics ring.
 * Focus: outcome classification and the aggregate (the unverifiableRate headline).
 */

const vm = require('../../utils/verifyMetrics');

beforeEach(() => vm.reset());

describe('classifyOutcome', () => {
  test('maps verdicts to outcome buckets', () => {
    expect(vm.classifyOutcome({ isCorrect: true })).toBe('verified_correct');
    expect(vm.classifyOutcome({ isCorrect: false })).toBe('verified_incorrect');
    expect(vm.classifyOutcome({ isCorrect: null, error: 'missing_input' })).toBe('error');
    expect(vm.classifyOutcome({ isCorrect: null, error: 'step1_parse_failed' })).toBe('unverifiable');
    expect(vm.classifyOutcome({ isCorrect: null, error: null })).toBe('low_confidence');
    expect(vm.classifyOutcome(null)).toBe('error');
  });
});

describe('aggregate', () => {
  test('computes unverifiableRate and escalation stats over the ring', () => {
    vm.recordVerification({ verdict: { isCorrect: true, confidence: 0.95 }, tier: 'gpt-4o-mini' });
    vm.recordVerification({ verdict: { isCorrect: false, confidence: 0.9 }, tier: 'gpt-4o-mini' });
    vm.recordVerification({ verdict: { isCorrect: null, error: null, confidence: 0.4 }, tier: 'gpt-4o-mini' });
    vm.recordVerification({
      verdict: { isCorrect: null, error: 'step2_parse_failed', confidence: 0 },
      escalated: true,
      escalationResolved: false,
      tier: 'gpt-4o',
    });
    vm.recordVerification({
      verdict: { isCorrect: true, confidence: 0.92 },
      escalated: true,
      escalationResolved: true,
      tier: 'gpt-4o',
    });

    const agg = vm.aggregate();
    expect(agg.sampleSize).toBe(5);
    expect(agg.byOutcome.verified_correct).toBe(2);
    expect(agg.byOutcome.verified_incorrect).toBe(1);
    expect(agg.byOutcome.low_confidence).toBe(1);
    expect(agg.byOutcome.unverifiable).toBe(1);

    // 2 unresolved (low_confidence + unverifiable) out of 5.
    expect(agg.unverifiableRate).toBeCloseTo(0.4, 5);
    // 3 resolved (2 correct + 1 incorrect) out of 5.
    expect(agg.resolvedRate).toBeCloseTo(0.6, 5);

    // 2 escalations, 1 resolved.
    expect(agg.escalated).toBe(2);
    expect(agg.escalationResolveRate).toBeCloseTo(0.5, 5);
  });

  test('empty ring yields zeroed rates, not NaN', () => {
    const agg = vm.aggregate();
    expect(agg.sampleSize).toBe(0);
    expect(agg.unverifiableRate).toBe(0);
    expect(agg.escalationResolveRate).toBe(0);
    expect(agg.unresolvedByMathType).toEqual([]);
  });
});

describe('classifyResolver', () => {
  test('splits symbolic verdicts from LLM verdicts, null when unresolved', () => {
    expect(vm.classifyResolver({ isCorrect: true, rationale: 'symbolic:equivalence' })).toBe('symbolic');
    expect(vm.classifyResolver({ isCorrect: false, rationale: 'symbolic:antiderivative' })).toBe('symbolic');
    expect(vm.classifyResolver({ isCorrect: true, rationale: 'matches the model answer' })).toBe('llm');
    expect(vm.classifyResolver({ isCorrect: true, rationale: null })).toBe('llm');
    // Nothing resolved -> no resolver to credit.
    expect(vm.classifyResolver({ isCorrect: null, rationale: 'symbolic:equivalence' })).toBeNull();
    expect(vm.classifyResolver(null)).toBeNull();
  });
});

describe('mathType ranking', () => {
  test('ranks unresolved attempts by problem class, absolute count first', () => {
    // 3 derivative attempts, 2 unresolved. Rate 0.67.
    vm.recordVerification({ verdict: { isCorrect: null, error: null, confidence: 0.3 }, mathType: 'derivative' });
    vm.recordVerification({ verdict: { isCorrect: null, error: 'step1_parse_failed' }, mathType: 'derivative' });
    vm.recordVerification({ verdict: { isCorrect: true, confidence: 0.9 }, mathType: 'derivative' });
    // 1 limit attempt, 1 unresolved. Rate 1.0 — a higher rate on a smaller base,
    // which must NOT outrank derivative.
    vm.recordVerification({ verdict: { isCorrect: null, error: 'step2_parse_failed' }, mathType: 'limit' });
    // Fully resolved class — absent from the ranking entirely.
    vm.recordVerification({ verdict: { isCorrect: true, confidence: 0.95 }, mathType: 'linear_equation' });

    const agg = vm.aggregate();
    expect(agg.unresolvedByMathType).toEqual([
      { mathType: 'derivative', attempts: 3, unresolved: 2, unresolvedRate: 0.6667 },
      { mathType: 'limit', attempts: 1, unresolved: 1, unresolvedRate: 1 },
    ]);
  });

  test('unlabelled records bucket as unknown and resolvers are tallied', () => {
    vm.recordVerification({ verdict: { isCorrect: null, error: null, confidence: 0.2 } });
    vm.recordVerification({ verdict: { isCorrect: true, rationale: 'symbolic:equivalence' }, mathType: 'sqrt' });
    vm.recordVerification({ verdict: { isCorrect: false, rationale: 'model answer differs' }, mathType: 'sqrt' });

    const agg = vm.aggregate();
    expect(agg.unresolvedByMathType).toEqual([
      { mathType: 'unknown', attempts: 1, unresolved: 1, unresolvedRate: 1 },
    ]);
    expect(agg.byResolver).toEqual({ symbolic: 1, llm: 1 });
  });
});

describe('recordVerification', () => {
  test('stores the ranking dimensions on the record', () => {
    const rec = vm.recordVerification({
      verdict: { isCorrect: true, confidence: 0.9, rationale: 'symbolic:equivalence' },
      mathType: 'quadratic_equation',
      skillId: 'alg1-quadratics',
      tier: 'gpt-4o-mini',
    });
    expect(rec.mathType).toBe('quadratic_equation');
    expect(rec.skillId).toBe('alg1-quadratics');
    expect(rec.resolvedBy).toBe('symbolic');
    expect(vm.snapshot(1)[0]).toMatchObject({ mathType: 'quadratic_equation', skillId: 'alg1-quadratics' });
  });

  test('defaults the new fields to null when the caller omits them', () => {
    const rec = vm.recordVerification({ verdict: { isCorrect: null, error: 'missing_input' } });
    expect(rec.mathType).toBeNull();
    expect(rec.skillId).toBeNull();
    expect(rec.resolvedBy).toBeNull();
  });
});

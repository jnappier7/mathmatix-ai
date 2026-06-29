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
  });
});

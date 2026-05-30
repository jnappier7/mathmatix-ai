/**
 * structuredTutorMetrics — Phase 6 observability for the
 * structured-tutor-response path.
 *
 * Verifies the recorder turns scattered per-turn audit/backfill signals
 * into the cumulative rates the rollout decision depends on:
 *   - turn_type distribution
 *   - hard / soft mismatch counts (by kind) and per-turn rates
 *   - Stage 5c.1 backfill outcomes + pose-success rate
 */

const metrics = require('../../utils/structuredTutorMetrics');

describe('structuredTutorMetrics', () => {
  beforeEach(() => metrics.reset());

  describe('empty state', () => {
    test('aggregate with no turns reports zeros and null rates', () => {
      const a = metrics.aggregate();
      expect(a.turns).toBe(0);
      expect(a.turn_type._total).toBe(0);
      expect(a.mismatch.hard._total).toBe(0);
      expect(a.mismatch.hard_turn_rate).toBeNull();
      expect(a.backfill.attempted).toBe(0);
      expect(a.backfill.pose_success_rate).toBeNull();
      expect(a.backfill.attempt_rate).toBeNull();
    });

    test('snapshot is empty', () => {
      expect(metrics.snapshot()).toEqual([]);
    });
  });

  describe('turn_type distribution', () => {
    test('counts each declared turn_type', () => {
      metrics.recordStructuredTurn({ turnType: 'problem_introduction' });
      metrics.recordStructuredTurn({ turnType: 'verification' });
      metrics.recordStructuredTurn({ turnType: 'problem_introduction' });
      const a = metrics.aggregate();
      expect(a.turns).toBe(3);
      expect(a.turn_type._total).toBe(3);
      expect(a.turn_type.problem_introduction).toBe(2);
      expect(a.turn_type.verification).toBe(1);
    });

    test('null turn_type is bucketed under "null"', () => {
      metrics.recordStructuredTurn({ turnType: null });
      expect(metrics.aggregate().turn_type.null).toBe(1);
    });
  });

  describe('mismatch accounting', () => {
    test('splits hard vs soft by kind and tracks per-turn rates', () => {
      // 1 clean, 1 hard, 1 soft, 1 both
      metrics.recordStructuredTurn({ turnType: 'feedback', mismatches: [] });
      metrics.recordStructuredTurn({
        turnType: 'problem_introduction',
        mismatches: [{ severity: 'hard', kind: 'problem_introduction_missing_pose' }],
      });
      metrics.recordStructuredTurn({
        turnType: 'verification',
        mismatches: [{ severity: 'soft', kind: 'verification_missing_verify' }],
      });
      metrics.recordStructuredTurn({
        turnType: 'problem_introduction',
        mismatches: [
          { severity: 'hard', kind: 'problem_introduction_missing_pose' },
          { severity: 'soft', kind: 'non_advancing_turn_with_board_action' },
        ],
      });

      const a = metrics.aggregate();
      expect(a.mismatch.hard.problem_introduction_missing_pose).toBe(2);
      expect(a.mismatch.hard._total).toBe(2);
      expect(a.mismatch.soft.verification_missing_verify).toBe(1);
      expect(a.mismatch.soft.non_advancing_turn_with_board_action).toBe(1);
      expect(a.mismatch.soft._total).toBe(2);
      // 2 of 4 turns carried a hard mismatch; 2 of 4 a soft; 1 of 4 clean.
      expect(a.mismatch.hard_turn_rate).toBe(0.5);
      expect(a.mismatch.soft_turn_rate).toBe(0.5);
      expect(a.mismatch.clean_turn_rate).toBe(0.25);
    });
  });

  describe('backfill outcomes', () => {
    test('counts attempts, outcomes, and pose-success rate', () => {
      metrics.recordStructuredTurn({ turnType: 'problem_introduction', backfill: 'posed' });
      metrics.recordStructuredTurn({ turnType: 'problem_introduction', backfill: 'posed' });
      metrics.recordStructuredTurn({ turnType: 'problem_introduction', backfill: 'no_posable_problem' });
      metrics.recordStructuredTurn({ turnType: 'problem_introduction', backfill: 'guard_dropped' });
      // A turn that needed no backfill must not inflate attempts.
      metrics.recordStructuredTurn({ turnType: 'feedback', backfill: null });

      const a = metrics.aggregate();
      expect(a.backfill.attempted).toBe(4);
      expect(a.backfill.posed).toBe(2);
      expect(a.backfill.no_posable_problem).toBe(1);
      expect(a.backfill.guard_dropped).toBe(1);
      expect(a.backfill.pose_success_rate).toBe(0.5); // 2/4
      expect(a.backfill.attempt_rate).toBe(4 / 5);
    });

    test('an unknown backfill string counts the attempt but no outcome bucket', () => {
      metrics.recordStructuredTurn({ turnType: 'problem_introduction', backfill: 'bogus' });
      const a = metrics.aggregate();
      expect(a.backfill.attempted).toBe(1);
      expect(a.backfill.posed).toBe(0);
      expect(a.backfill.no_posable_problem).toBe(0);
      expect(a.backfill.guard_dropped).toBe(0);
    });
  });

  describe('windowed rates', () => {
    test('window rates reflect only the turns in the window', () => {
      metrics.recordStructuredTurn({ turnType: 'feedback' });
      metrics.recordStructuredTurn({ turnType: 'feedback' });
      metrics.recordStructuredTurn({
        turnType: 'problem_introduction',
        mismatches: [{ severity: 'hard', kind: 'problem_introduction_missing_pose' }],
      });
      const w = metrics.windowStats(10);
      expect(w.turns).toBe(3);
      expect(w.hard_turn_rate).toBeCloseTo(1 / 3);
      expect(w.clean_turn_rate).toBeCloseTo(2 / 3);
    });

    test('window catches a fresh regression that the lifetime rate barely registers', () => {
      // 100 clean turns establish a healthy baseline...
      for (let i = 0; i < 100; i++) metrics.recordStructuredTurn({ turnType: 'feedback' });
      // ...then a burst of 5 misclassified turns arrives.
      for (let i = 0; i < 5; i++) {
        metrics.recordStructuredTurn({
          turnType: 'problem_introduction',
          mismatches: [{ severity: 'hard', kind: 'problem_introduction_missing_pose' }],
        });
      }
      // Last-10 window = 5 hard + 5 clean → the spike is loud (50%).
      const w = metrics.windowStats(10);
      expect(w.window_size).toBe(10);
      expect(w.turns).toBe(10);
      expect(w.hard_turn_rate).toBeCloseTo(0.5);
      // Lifetime rate is swamped by the 100 healthy turns (5/105 ≈ 4.8%).
      const a = metrics.aggregate();
      expect(a.mismatch.hard_turn_rate).toBeCloseTo(5 / 105);
      // This gap is the whole reason the dashboard leads with the window.
      expect(w.hard_turn_rate).toBeGreaterThan(a.mismatch.hard_turn_rate);
      expect(a.window).toBeDefined();
      expect(a.window.window_size).toBe(200);
    });

    test('empty window reports zero turns', () => {
      const w = metrics.windowStats(50);
      expect(w.turns).toBe(0);
      expect(w.window_size).toBe(50);
    });

    test('window pose-success rate counts only backfill attempts', () => {
      metrics.recordStructuredTurn({ turnType: 'problem_introduction', backfill: 'posed' });
      metrics.recordStructuredTurn({ turnType: 'problem_introduction', backfill: 'guard_dropped' });
      metrics.recordStructuredTurn({ turnType: 'feedback' });
      const w = metrics.windowStats(10);
      expect(w.backfill_attempt_rate).toBeCloseTo(2 / 3);
      expect(w.backfill_pose_success_rate).toBeCloseTo(0.5);
    });
  });

  describe('snapshot', () => {
    test('returns records newest-first with the recorded fields', () => {
      metrics.recordStructuredTurn({ turnType: 'feedback', llmBoardCount: 0 });
      metrics.recordStructuredTurn({
        turnType: 'problem_introduction',
        llmBoardCount: 1,
        mismatches: [{ severity: 'hard', kind: 'problem_introduction_missing_pose' }],
        backfill: 'posed',
      });

      const recent = metrics.snapshot(10);
      expect(recent).toHaveLength(2);
      // Newest first
      expect(recent[0].turnType).toBe('problem_introduction');
      expect(recent[0].hard).toEqual(['problem_introduction_missing_pose']);
      expect(recent[0].backfill).toBe('posed');
      expect(recent[0].llmBoardCount).toBe(1);
      expect(recent[1].turnType).toBe('feedback');
    });

    test('respects the limit argument', () => {
      for (let i = 0; i < 5; i++) metrics.recordStructuredTurn({ turnType: 'feedback' });
      expect(metrics.snapshot(3)).toHaveLength(3);
    });
  });

  describe('robustness', () => {
    test('tolerates missing / malformed input without throwing', () => {
      expect(() => metrics.recordStructuredTurn()).not.toThrow();
      expect(() => metrics.recordStructuredTurn({})).not.toThrow();
      expect(() => metrics.recordStructuredTurn({ turnType: 'feedback', mismatches: null })).not.toThrow();
      expect(() => metrics.recordStructuredTurn({ turnType: 'feedback', mismatches: [null, {}] })).not.toThrow();
      // Two recorded turns above plus the defensive calls all count.
      expect(metrics.aggregate().turns).toBe(4);
    });
  });
});

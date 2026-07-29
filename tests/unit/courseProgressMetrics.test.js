/**
 * Course progression telemetry — item #7 from the 2026-07-29 course review.
 *
 * Progress silently could not advance on the live teaching path and nothing
 * alarmed, because nothing counted. `advanceRate` near zero with a climbing
 * evaluation count is that outage in one number; `stalled` is the flag an
 * admin page (or an alert) can read directly.
 */

jest.mock('../../utils/logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  stub.child = jest.fn().mockReturnValue(stub);
  return stub;
});

const metrics = require('../../utils/courseProgressMetrics');

beforeEach(() => metrics.reset());

describe('recordProgression', () => {
  test('normalizes unknown outcomes/modes instead of trusting the caller', () => {
    const e = metrics.recordProgression({ outcome: 'banana', mode: 'telepathy', courseId: 'act-prep' });
    expect(e.outcome).toBe('error');
    expect(e.mode).toBe('none');
    expect(e.courseId).toBe('act-prep');
  });

  test('truncates long evidence and defaults missing fields to null', () => {
    const e = metrics.recordProgression({ outcome: 'held', evidence: 'x'.repeat(500) });
    expect(e.evidence.length).toBe(200);
    expect(e.moduleId).toBeNull();
    expect(e.stepIndex).toBeNull();
  });
});

describe('aggregate', () => {
  test('advanceRate counts advances and module completions as movement', () => {
    metrics.recordProgression({ outcome: 'advanced', mode: 'llm_eval', courseId: 'act-prep' });
    metrics.recordProgression({ outcome: 'module_complete', mode: 'explicit_tag', courseId: 'act-prep' });
    metrics.recordProgression({ outcome: 'held', mode: 'llm_eval', courseId: 'act-prep' });
    metrics.recordProgression({ outcome: 'held', mode: 'llm_eval', courseId: 'act-prep' });

    const a = metrics.aggregate();
    expect(a.inRing).toBe(4);
    expect(a.advanceRate).toBe(0.5);
    expect(a.byOutcome.advanced).toBe(1);
    expect(a.byOutcome.module_complete).toBe(1);
    expect(a.byCourse['act-prep']).toEqual({ evaluations: 4, moved: 2 });
  });

  test('the stall alarm: many evaluations, zero movement', () => {
    for (let i = 0; i < 25; i++) {
      metrics.recordProgression({ outcome: 'held', mode: 'llm_eval', courseId: 'act-prep' });
    }
    const a = metrics.aggregate();
    expect(a.advanceRate).toBe(0);
    expect(a.stalled).toBe(true);
  });

  test('a healthy course is not flagged as stalled', () => {
    for (let i = 0; i < 25; i++) {
      metrics.recordProgression({ outcome: i % 4 === 0 ? 'advanced' : 'held', mode: 'llm_eval' });
    }
    expect(metrics.aggregate().stalled).toBe(false);
  });

  test('a quiet period is not an alarm (too few evaluations to judge)', () => {
    metrics.recordProgression({ outcome: 'held', mode: 'llm_eval' });
    const a = metrics.aggregate();
    expect(a.advanceRate).toBe(0);
    expect(a.stalled).toBe(false);
  });

  test('empty ring reports a null rate, never a false zero', () => {
    const a = metrics.aggregate();
    expect(a.inRing).toBe(0);
    expect(a.advanceRate).toBeNull();
    expect(a.stalled).toBe(false);
  });

  test('gate_blocked is tracked separately — it is the healthy brake', () => {
    metrics.recordProgression({ outcome: 'gate_blocked', mode: 'deterministic', evidence: 'needs 2 correct' });
    const a = metrics.aggregate();
    expect(a.byOutcome.gate_blocked).toBe(1);
    expect(a.advanceRate).toBe(0);
  });
});

describe('snapshot', () => {
  test('returns newest first', () => {
    metrics.recordProgression({ outcome: 'held', moduleId: 'first' });
    metrics.recordProgression({ outcome: 'advanced', moduleId: 'second' });
    const recent = metrics.snapshot(5);
    expect(recent[0].moduleId).toBe('second');
    expect(recent[1].moduleId).toBe('first');
  });
});

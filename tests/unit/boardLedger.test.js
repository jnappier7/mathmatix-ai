/**
 * The persistent Problem Card lifecycle (utils/pipeline/boardLedger.js).
 *
 * The ledger must mirror the client's own archive rules (DerivationView):
 * a pose of different math or a clear parks the problem in focus on the
 * completed rail; a re-pose of the same math is a redraw, not a new problem;
 * a problem posed but never worked is dropped, not archived.
 */
const { applyTurnToLedger, problemAssistance, sanitizeSourceRef, MAX_COMPLETED, MAX_STEPS } = require('../../utils/pipeline/boardLedger');

const NOW = new Date('2026-07-25T12:00:00Z');

function turn(ledger, cmds) { return applyTurnToLedger(ledger, cmds, NOW); }

describe('applyTurnToLedger', () => {
  test('a pose starts the current problem', () => {
    const l = turn(null, [{ action: 'pose', tex: '2x+5=13' }]);
    expect(l.current).toMatchObject({ problemTex: '2x+5=13', steps: [] });
    expect(l.completed).toEqual([]);
  });

  test('steps append to the current problem in order', () => {
    let l = turn(null, [{ action: 'pose', tex: '2x+5=13' }]);
    l = turn(l, [
      { action: 'apply', op: 'subtract 5 from both sides' },
      { action: 'resolve', tex: '2x=8' },
    ]);
    expect(l.current.steps.map(s => s.action)).toEqual(['apply', 'resolve']);
    expect(l.current.steps[1].tex).toBe('2x=8');
  });

  test('a verify marks the problem solved when it is archived', () => {
    let l = turn(null, [{ action: 'pose', tex: '2x+5=13' }]);
    l = turn(l, [{ action: 'resolve', tex: '2x=8' }, { action: 'verify', tex: 'x=4' }]);
    l = turn(l, [{ action: 'clear' }]);
    expect(l.current).toBeNull();
    expect(l.completed).toHaveLength(1);
    expect(l.completed[0]).toMatchObject({ problemTex: '2x+5=13', solved: true, completedAt: NOW });
  });

  test('a pose of different math archives the outgoing problem (unsolved)', () => {
    let l = turn(null, [{ action: 'pose', tex: '2x+5=13' }]);
    l = turn(l, [{ action: 'resolve', tex: '2x=8' }]);
    l = turn(l, [{ action: 'pose', tex: '3y-1=8' }]);
    expect(l.current.problemTex).toBe('3y-1=8');
    expect(l.completed).toHaveLength(1);
    expect(l.completed[0].solved).toBe(false);
  });

  test('re-posing the same math (whitespace/case-insensitive) is a redraw, not a new problem', () => {
    let l = turn(null, [{ action: 'pose', tex: '2x+5=13' }]);
    l = turn(l, [{ action: 'resolve', tex: '2x=8' }]);
    l = turn(l, [{ action: 'pose', tex: ' 2X + 5 = 13 ' }]);
    expect(l.completed).toEqual([]);
    expect(l.current.steps).toHaveLength(1);   // work kept, nothing archived
  });

  test('a problem posed but never worked is dropped on archive, mirroring the client', () => {
    let l = turn(null, [{ action: 'pose', tex: '2x+5=13' }]);
    l = turn(l, [{ action: 'clear' }]);
    expect(l.current).toBeNull();
    expect(l.completed).toEqual([]);
  });

  test('example and visual cards are recorded as steps for faithful replay', () => {
    let l = turn(null, [{ action: 'pose', tex: 'y=2x' }]);
    l = turn(l, [
      { action: 'example', tex: 'y=3x' },
      { action: 'graph', expression: 'y=2x' },
    ]);
    expect(l.current.steps.map(s => s.action)).toEqual(['example', 'graph']);
  });

  test('steps with no pinned problem are not attached to anything', () => {
    const l = turn(null, [{ action: 'resolve', tex: '2x=8' }]);
    expect(l.current).toBeNull();
    expect(l.completed).toEqual([]);
  });

  test('completed problems cap at MAX_COMPLETED, oldest falling off', () => {
    let l = null;
    for (let i = 0; i < MAX_COMPLETED + 3; i++) {
      l = turn(l, [{ action: 'pose', tex: `x+${i}=0` }]);
      l = turn(l, [{ action: 'verify', tex: `x=-${i}` }]);
      l = turn(l, [{ action: 'clear' }]);
    }
    expect(l.completed).toHaveLength(MAX_COMPLETED);
    expect(l.completed[0].problemTex).toBe('x+3=0');   // 0..2 fell off
  });

  test('steps cap at MAX_STEPS per problem, oldest falling off', () => {
    let l = turn(null, [{ action: 'pose', tex: '2x+5=13' }]);
    const steps = [];
    for (let i = 0; i < MAX_STEPS + 5; i++) steps.push({ action: 'resolve', tex: `step${i}` });
    l = turn(l, steps);
    expect(l.current.steps).toHaveLength(MAX_STEPS);
    expect(l.current.steps[0].tex).toBe('step5');
  });

  test('unknown extra fields on commands are stripped before persistence', () => {
    let l = turn(null, [{ action: 'pose', tex: 'y=x' }]);
    l = turn(l, [{ action: 'resolve', tex: 'y=x', bulkyDebugBlob: 'x'.repeat(500) }]);
    expect(l.current.steps[0].bulkyDebugBlob).toBeUndefined();
  });

  test('does not mutate the previous ledger (pure)', () => {
    const first = turn(null, [{ action: 'pose', tex: '2x+5=13' }]);
    const frozen = structuredClone(first);
    turn(first, [{ action: 'resolve', tex: '2x=8' }, { action: 'pose', tex: 'y=1' }]);
    expect(first).toEqual(frozen);
  });

  test('assistance max-folds across a problem and rides into the archive', () => {
    let l = applyTurnToLedger(null, [{ action: 'pose', tex: '2x+5=13' }], NOW, 1);
    l = applyTurnToLedger(l, [{ action: 'resolve', tex: '2x=8' }], NOW, 7);   // heavy help once
    l = applyTurnToLedger(l, [{ action: 'verify', tex: 'x=4' }], NOW, 2);     // finish unaided
    expect(l.current.assistance).toBe(7);                                     // max, not last
    expect(problemAssistance(l)).toBe(7);
    l = applyTurnToLedger(l, [{ action: 'clear' }], NOW, 1);
    expect(l.completed[0].assistance).toBe(7);
    expect(problemAssistance(l)).toBe(7);                                     // falls back to last completed
  });

  test('a new problem starts its assistance fresh (never inherited)', () => {
    let l = applyTurnToLedger(null, [{ action: 'pose', tex: 'a=1' }], NOW, 9);
    l = applyTurnToLedger(l, [{ action: 'resolve', tex: 'a' }], NOW, 9);
    l = applyTurnToLedger(l, [{ action: 'pose', tex: 'b=2' }], NOW, 1);
    // Level 1 is recorded affirmatively — "independent so far", not "unknown".
    expect(l.current.assistance).toBe(1);
    l = applyTurnToLedger(l, [{ action: 'resolve', tex: 'b' }], NOW, 5);
    expect(l.current.assistance).toBe(5);         // not inherited from problem a (9)
    expect(l.completed[0].assistance).toBe(9);    // a kept its own level
  });

  test('assistance omitted → untouched (older callers, voice path)', () => {
    let l = applyTurnToLedger(null, [{ action: 'pose', tex: 'x=1' }], NOW);
    l = applyTurnToLedger(l, [{ action: 'verify', tex: 'x=1' }], NOW);
    expect(l.current.assistance).toBeNull();
    expect(problemAssistance(l)).toBeNull();
    expect(problemAssistance(null)).toBeNull();
  });

  test('a sourceRef attaches only to a problem POSED that turn, and rides into the archive', () => {
    const ref = { uploadId: 'abc123', region: { x: 0.1, y: 0.2, w: 0.5, h: 0.25 } };
    // Ref on a non-pose turn: must NOT stamp the ongoing problem.
    let l = applyTurnToLedger(null, [{ action: 'pose', tex: 'a=1' }], NOW);
    l = applyTurnToLedger(l, [{ action: 'resolve', tex: 'a' }], NOW, { sourceRef: ref });
    expect(l.current.sourceRef).toBeNull();
    // Ref on the pose turn: stamps the new problem and survives archiving.
    l = applyTurnToLedger(l, [{ action: 'pose', tex: 'b=2' }], NOW, { sourceRef: ref });
    expect(l.current.sourceRef).toEqual(ref);
    l = applyTurnToLedger(l, [{ action: 'verify', tex: 'b=2' }], NOW, 3);   // legacy numeric opts still work
    l = applyTurnToLedger(l, [{ action: 'clear' }], NOW);
    expect(l.completed[0].sourceRef).toBeNull();          // problem a, never linked
    expect(l.completed[1].sourceRef).toEqual(ref);        // problem b keeps its link
    expect(l.completed[1].assistance).toBe(3);
  });

  test('sanitizeSourceRef: valid refs normalize, junk dies before the ledger', () => {
    expect(sanitizeSourceRef({ uploadId: 'abc-123', region: { x: 0.1, y: 0.2, w: 0.5, h: 0.25 } }))
      .toEqual({ uploadId: 'abc-123', region: { x: 0.1, y: 0.2, w: 0.5, h: 0.25 } });
    // Coordinates clamp into [0,1]; degenerate regions drop to null.
    expect(sanitizeSourceRef({ uploadId: 'a', region: { x: -2, y: 5, w: 3, h: 0.5 } }).region)
      .toEqual({ x: 0, y: 1, w: 1, h: 0.5 });
    expect(sanitizeSourceRef({ uploadId: 'a', region: { x: 0, y: 0, w: 0, h: 0.5 } }).region).toBeNull();
    // Bad ids are rejected outright (injection-shaped, oversized, missing).
    expect(sanitizeSourceRef({ uploadId: 'a b$', region: null })).toBeNull();
    expect(sanitizeSourceRef({ uploadId: 'x'.repeat(65) })).toBeNull();
    expect(sanitizeSourceRef(null)).toBeNull();
    expect(sanitizeSourceRef('junk')).toBeNull();
  });

  test('tolerates malformed input: null commands, junk entries, malformed prev', () => {
    expect(turn(null, null)).toEqual({ current: null, completed: [] });
    expect(turn({ current: 'junk', completed: 'junk' }, [{ action: 'pose', tex: 'y=x' }]).current.problemTex).toBe('y=x');
    const l = turn(null, [null, 'nope', { noAction: true }, { action: 'pose' }]);
    expect(l.current).toBeNull();
  });
});

/**
 * The persistent Problem Card lifecycle (utils/pipeline/boardLedger.js).
 *
 * The ledger must mirror the client's own archive rules (DerivationView):
 * a pose of different math or a clear parks the problem in focus on the
 * completed rail; a re-pose of the same math is a redraw, not a new problem;
 * a problem posed but never worked is dropped, not archived.
 */
const { applyTurnToLedger, MAX_COMPLETED, MAX_STEPS } = require('../../utils/pipeline/boardLedger');

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

  test('tolerates malformed input: null commands, junk entries, malformed prev', () => {
    expect(turn(null, null)).toEqual({ current: null, completed: [] });
    expect(turn({ current: 'junk', completed: 'junk' }, [{ action: 'pose', tex: 'y=x' }]).current.problemTex).toBe('y=x');
    const l = turn(null, [null, 'nope', { noAction: true }, { action: 'pose' }]);
    expect(l.current).toBeNull();
  });
});

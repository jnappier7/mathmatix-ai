const { gateScene, assessSceneLeak } = require('../../utils/sceneGate');

// A minimal valid scene that DISPLAYS a value (the leak vector).
const sceneWithValue = (value) => ({
  objects: [
    { id: 'A', type: 'point', at: [0, 0] },
    { id: 'B', type: 'point', at: [4, 0] },
    { id: 'AB', type: 'segment', from: 'A', to: 'B' },
  ],
  marks: [{ kind: 'measure', on: ['A', 'B'], symbol: 'AB', value: value, unit: 'cm' }],
});

const UNSOLVED = (correctAnswer) => ({ correctAnswer, status: 'unsolved' });

describe('sceneGate', () => {
  test('allows a scene when there is no active/unsolved problem', () => {
    const r = gateScene({ scene: sceneWithValue(12), activeProblem: null, mode: 'live_control' });
    expect(r.record.decision).toBe('allow');
    expect(r.scene.marks[0].value).toBe(12); // untouched
  });

  test('allows when the displayed value does NOT match the answer', () => {
    const r = gateScene({ scene: sceneWithValue(12), activeProblem: UNSOLVED('x = 7'), mode: 'live_control' });
    expect(r.record.decision).toBe('allow');
  });

  test('REDACTS a value that equals the known answer (transform, value hidden)', () => {
    const r = gateScene({ scene: sceneWithValue(7), activeProblem: UNSOLVED('x = 7'), mode: 'live_control' });
    expect(r.record.decision).toBe('transform');
    expect(r.record.reasonCode).toBe('REDACTED_LEAK');
    expect(r.scene.marks[0].value).toBeNull();      // number gone
    expect(r.scene.marks[0].redacted).toBe(true);
  });

  test('redactAll hides the to-be-found unknown but KEEPS the givens', () => {
    const ownProblem = {
      objects: [{ id: 'A', type: 'point', at: [0, 0] }, { id: 'B', type: 'point', at: [4, 0] }, { id: 'C', type: 'point', at: [4, 3] }],
      marks: [
        { kind: 'measure', on: ['A', 'B'], symbol: 'AB', value: 6 },        // given
        { kind: 'measure', on: ['A', 'C'], symbol: 'x', value: 5, solve: true }, // unknown
      ],
    };
    const r = gateScene({ scene: ownProblem, activeProblem: UNSOLVED('x = 5'), mode: 'live_control', redactAll: true });
    expect(r.record.reasonCode).toBe('REDACTED_OWN_PROBLEM');
    expect(r.scene.marks[0].value).toBe(6);     // given stays
    expect(r.scene.marks[1].value).toBeNull();  // unknown hidden
  });

  test('shadow mode observes the leak but does NOT change the scene', () => {
    const r = gateScene({ scene: sceneWithValue(7), activeProblem: UNSOLVED('x = 7'), mode: 'shadow' });
    expect(r.scene.marks[0].value).toBe(7); // unchanged
    expect(r.record.reasonCode).toBe('SCENE_VALUE_LEAK'); // but recorded
  });

  test('blocks an invalid scene (bad reference)', () => {
    const bad = { objects: [{ id: 'S', type: 'segment', from: 'A', to: 'Z' }] };
    const r = gateScene({ scene: bad, activeProblem: UNSOLVED('x = 1'), mode: 'live_control' });
    expect(r.scene).toBeNull();
    expect(r.record.decision).toBe('block');
  });

  test('catches a multi-root answer leak ("x = 2 or x = 3")', () => {
    const r = gateScene({ scene: sceneWithValue(3), activeProblem: UNSOLVED('x = 2 or x = 3'), mode: 'live_control' });
    expect(r.record.decision).toBe('transform');
    expect(r.scene.marks[0].value).toBeNull();
  });

  test('assessSceneLeak is a pure predicate', () => {
    expect(assessSceneLeak(sceneWithValue(5), UNSOLVED('x = 5')).leak).toBe(true);
    expect(assessSceneLeak(sceneWithValue(5), UNSOLVED('x = 6')).leak).toBe(false);
    expect(assessSceneLeak(sceneWithValue(5), { status: 'solved' }).leak).toBe(false);
  });
});

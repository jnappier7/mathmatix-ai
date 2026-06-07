const { enforcePedagogyRule } = require('../../utils/boardCommandGuard');

// The worked-example relaxation lets the tutor demonstrate full steps on a
// PARALLEL problem. The backstop guarantees that even then, a step that reveals
// the student's OWN pinned problem or answer is dropped — so WORKED_EXAMPLE_BOARD
// is leak-safe even if the model slips and works the graded problem.
describe('worked-example leak backstop', () => {
  const pinnedProblemTex = '3x^2 + 4x - 7 = 0';
  const pinnedAnswer = 'x = -7/3 or x = 1';
  const base = {
    userMessage: 'show me an example',
    workedExample: true,
    pinnedProblemTex,
    pinnedAnswer,
    lastBoardActionInConversation: 'pose',
  };

  it('ALLOWS a genuine parallel-problem step (different numbers)', () => {
    const { allowed, dropped } = enforcePedagogyRule({
      ...base,
      commands: [
        { action: 'resolve', tex: 'x^2 - 5x + 6 = 0' },
        { action: 'resolve', tex: '(x-2)(x-3)' },
        { action: 'verify', tex: 'x = 2 or x = 3' },
      ],
    });
    expect(allowed).toHaveLength(3);
    expect(dropped).toEqual([]);
  });

  it('BLOCKS a worked-example step that IS the student\'s pinned problem', () => {
    const { allowed, dropped } = enforcePedagogyRule({
      ...base,
      commands: [{ action: 'resolve', tex: '3x^2 + 4x - 7 = 0' }],
    });
    expect(allowed).toEqual([]);
    expect(dropped[0].reason).toBe('worked_example_reveals_active_problem');
  });

  it('BLOCKS a worked-example verify that reveals the student\'s answer', () => {
    const { allowed, dropped } = enforcePedagogyRule({
      ...base,
      commands: [{ action: 'verify', tex: 'x = -7/3 or x = 1' }],
    });
    expect(allowed).toEqual([]);
    expect(dropped[0].reason).toBe('worked_example_reveals_active_problem');
  });

  it('BLOCKS an apply op that names the student\'s pinned expression', () => {
    const { allowed, dropped } = enforcePedagogyRule({
      ...base,
      commands: [{ action: 'apply', op: 'factor 3x^2 + 4x - 7' }],
    });
    expect(allowed).toEqual([]);
    expect(dropped[0].reason).toBe('worked_example_reveals_active_problem');
  });

  it('without pinned context, worked-example steps still pass (backstop is opt-in)', () => {
    const { allowed } = enforcePedagogyRule({
      userMessage: 'example',
      workedExample: true,
      lastBoardActionInConversation: 'pose',
      commands: [{ action: 'resolve', tex: '3x^2 + 4x - 7 = 0' }],
    });
    expect(allowed).toHaveLength(1);
  });

  it('does not affect non-worked-example turns (strict rule still governs)', () => {
    // Student stated their own step — allowed as normal, pinned context present.
    const { allowed } = enforcePedagogyRule({
      commands: [{ action: 'resolve', tex: '(x-1)(3x+7)' }],
      userMessage: 'i got (x-1)(3x+7)',
      workedExample: false,
      pinnedProblemTex,
      pinnedAnswer,
      lastBoardActionInConversation: 'pose',
    });
    expect(allowed).toHaveLength(1);
  });
});

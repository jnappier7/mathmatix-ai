const { enforcePedagogyRule } = require('../../utils/boardCommandGuard');

// The I_DO worked-example relaxation lets the tutor demonstrate full steps on a
// teaching example (NOT the student's graded problem). It must be OFF unless the
// caller explicitly sets workedExample:true, so the student's own problem is
// never solved for them in homework help / WE_DO / YOU_DO.
describe('boardCommandGuard — worked-example relaxation', () => {
  const tutorSteps = [
    { action: 'apply', op: 'factor by grouping' },
    { action: 'resolve', tex: '(3x+7)(x-1)' },
    { action: 'verify', tex: 'x = -7/3 or x = 1' },
  ];

  it('STRICT BY DEFAULT: tutor steps not in the student message are dropped', () => {
    const { allowed, dropped } = enforcePedagogyRule({
      commands: tutorSteps,
      userMessage: 'i am not sure',
      lastBoardActionInConversation: 'pose',
    });
    expect(allowed).toEqual([]);
    expect(dropped).toHaveLength(3);
  });

  it('explicit workedExample:false stays strict', () => {
    const { allowed } = enforcePedagogyRule({
      commands: tutorSteps,
      userMessage: 'i am not sure',
      workedExample: false,
      lastBoardActionInConversation: 'pose',
    });
    expect(allowed).toEqual([]);
  });

  it('workedExample:true allows tutor demonstration steps without student-text match', () => {
    const { allowed, dropped } = enforcePedagogyRule({
      commands: tutorSteps,
      userMessage: 'show me an example',
      workedExample: true,
      lastBoardActionInConversation: 'pose',
    });
    expect(allowed).toHaveLength(3);
    expect(dropped).toEqual([]);
  });

  it('workedExample:true STILL drops malformed commands (required fields enforced)', () => {
    const { allowed, dropped } = enforcePedagogyRule({
      commands: [
        { action: 'apply' },            // missing op
        { action: 'resolve' },          // missing tex
        { action: 'verify' },           // missing tex
      ],
      userMessage: 'example',
      workedExample: true,
      lastBoardActionInConversation: 'pose',
    });
    expect(allowed).toEqual([]);
    expect(dropped.map(d => d.reason)).toEqual([
      'apply_missing_op', 'resolve_missing_tex', 'verify_missing_tex',
    ]);
  });

  it('scaffold still requires a blank even in worked-example mode (no answer dumps)', () => {
    const { allowed, dropped } = enforcePedagogyRule({
      commands: [{ action: 'scaffold', tex: 'x = 5' }], // no blank
      userMessage: 'example',
      workedExample: true,
      lastBoardActionInConversation: 'pose',
    });
    expect(allowed).toEqual([]);
    expect(dropped[0].reason).toBe('scaffold_has_no_blank');
  });

  it('a normal guided turn (student stated the step) is unaffected', () => {
    const { allowed } = enforcePedagogyRule({
      commands: [{ action: 'resolve', tex: '(x-1)(3x+7)' }],
      userMessage: 'i got (x-1)(3x+7)',
      workedExample: false,
      lastBoardActionInConversation: 'pose',
    });
    expect(allowed).toHaveLength(1);
  });
});

// Read-only `example` cards mirror a derivation the tutor is TEACHING. They have
// no student-text fallback: admitted ONLY in worked-example mode, always
// re-checked against the student's pinned problem/answer.
describe('boardCommandGuard — example (worked-example derivation step)', () => {
  const derivation = [
    { action: 'example', tex: '\\int x^2\\,dx = \\tfrac{1}{3}x^3 + C' },
    { action: 'example', tex: 'A = \\int_{-r}^{r} \\sqrt{r^2 - x^2}\\,dx' },
  ];

  it('DROPPED by default (not worked-example mode) — example never leaks into normal turns', () => {
    const { allowed, dropped } = enforcePedagogyRule({
      commands: derivation,
      userMessage: 'why does the integral give area?',
      lastBoardActionInConversation: null,
    });
    expect(allowed).toEqual([]);
    expect(dropped.map(d => d.reason)).toEqual([
      'example_outside_worked_example_mode', 'example_outside_worked_example_mode',
    ]);
  });

  it('allowed in worked-example mode, in order', () => {
    const { allowed, dropped } = enforcePedagogyRule({
      commands: derivation,
      userMessage: 'show me how a circle area is derived',
      workedExample: true,
      lastBoardActionInConversation: null,
    });
    expect(allowed).toHaveLength(2);
    expect(allowed.map(c => c.tex)).toEqual(derivation.map(c => c.tex));
    expect(dropped).toEqual([]);
  });

  it('drops a malformed example (missing tex) even in worked-example mode', () => {
    const { allowed, dropped } = enforcePedagogyRule({
      commands: [{ action: 'example' }],
      userMessage: 'example',
      workedExample: true,
    });
    expect(allowed).toEqual([]);
    expect(dropped[0].reason).toBe('example_missing_tex');
  });

  it('BACKSTOP: an example that matches the student\'s pinned problem is blocked', () => {
    const { allowed, dropped } = enforcePedagogyRule({
      commands: [{ action: 'example', tex: '3x^2 + 4x - 7 = 0' }],
      userMessage: 'walk me through it',
      workedExample: true,
      pinnedProblemTex: '3x^2 + 4x - 7 = 0',
    });
    expect(allowed).toEqual([]);
    expect(dropped[0].reason).toBe('worked_example_reveals_active_problem');
  });

  it('BACKSTOP: an example that matches the student\'s pinned answer is blocked', () => {
    const { allowed, dropped } = enforcePedagogyRule({
      commands: [{ action: 'example', tex: 'x = 8' }],
      userMessage: 'walk me through it',
      workedExample: true,
      pinnedAnswer: 'x = 8',
    });
    expect(allowed).toEqual([]);
    expect(dropped[0].reason).toBe('worked_example_reveals_active_problem');
  });

  it('a parallel example (different numbers) survives the backstop', () => {
    const { allowed } = enforcePedagogyRule({
      commands: [{ action: 'example', tex: '2x + 7 = 15' }],
      userMessage: 'show me a similar one',
      workedExample: true,
      pinnedProblemTex: '3x + 5 = 14',
      pinnedAnswer: 'x = 3',
    });
    expect(allowed).toHaveLength(1);
  });
});

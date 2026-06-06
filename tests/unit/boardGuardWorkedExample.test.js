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

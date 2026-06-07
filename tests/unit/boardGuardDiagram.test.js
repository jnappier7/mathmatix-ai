const { enforcePedagogyRule } = require('../../utils/boardCommandGuard');

describe('boardCommandGuard — diagram verb', () => {
  it('allows a diagram with a type (teaching aid, no student-text gate)', () => {
    const { allowed, dropped } = enforcePedagogyRule({
      commands: [{ action: 'diagram', diagramType: 'inscribed_angle', diagramParams: { inscribedAngleDeg: 30 } }],
      userMessage: 'show me a pic',
    });
    expect(allowed).toHaveLength(1);
    expect(dropped).toEqual([]);
  });

  it('drops a diagram with no type', () => {
    const { allowed, dropped } = enforcePedagogyRule({
      commands: [{ action: 'diagram', diagramParams: {} }],
      userMessage: 'show me a pic',
    });
    expect(allowed).toEqual([]);
    expect(dropped[0].reason).toBe('diagram_missing_type');
  });
});

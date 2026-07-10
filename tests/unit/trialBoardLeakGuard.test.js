// Anti-cheat leak test for the TRIAL living board.
//
// The trial board renders whatever board commands the pipeline emits AFTER the
// boardCommandGuard has run. This test locks the invariant that makes that safe:
// for a BARE problem (a solve request where the student has stated no moves), the
// guard must drop any `apply`/`resolve` that would write a step the student never
// earned — so the final answer can never appear on the board before the student
// produces it. It also confirms the positive case: once the student states the
// move, the matching step is allowed. This is the "only earned steps" rule the
// trial surface depends on.

const { enforcePedagogyRule } = require('../../utils/boardCommandGuard');

// Answer digits ("5") deliberately do NOT appear in the problem "3x + 7 = 22",
// so a blocked leak is unambiguous (no incidental substring match).
const PROBLEM = '3x + 7 = 22';

describe('trial board — leak guard (only earned steps reach the board)', () => {
  test('a bare problem yields only the pose; the solve steps are dropped', () => {
    const { allowed, dropped } = enforcePedagogyRule({
      commands: [
        { action: 'pose', tex: PROBLEM },
        { action: 'apply', op: 'subtract 7 from both sides' }, // student never said this
        { action: 'resolve', tex: 'x = 5' },                   // the answer — must NOT surface
      ],
      userMessage: PROBLEM, // student only stated the problem
      recentUserMessages: [{ role: 'user', content: PROBLEM }],
      pinnedProblemTex: PROBLEM,
    });

    const allowedActions = allowed.map(c => c.action);
    expect(allowedActions).toContain('pose');
    expect(allowedActions).not.toContain('resolve'); // the answer is blocked
    expect(allowedActions).not.toContain('apply');

    const reasons = dropped.map(d => d.reason);
    expect(reasons).toContain('apply_op_not_in_student_message');
    expect(reasons).toContain('resolve_tex_not_in_student_message');

    // Hard invariant: no allowed command exposes the final answer.
    expect(allowed.some(c => (c.tex || '').replace(/\s/g, '') === 'x=5')).toBe(false);
  });

  test('once the student states the move, the matching step IS allowed', () => {
    const stated = 'okay, subtract 7 from both sides, so x = 5';
    const { allowed } = enforcePedagogyRule({
      commands: [
        { action: 'apply', op: 'subtract 7 from both sides' },
        { action: 'resolve', tex: 'x = 5' },
      ],
      userMessage: stated,
      recentUserMessages: [{ role: 'user', content: stated }],
      pinnedProblemTex: PROBLEM,
    });

    const allowedActions = allowed.map(c => c.action);
    expect(allowedActions).toContain('apply');
    expect(allowedActions).toContain('resolve'); // now earned → allowed
  });
});

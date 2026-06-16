const {
  synthesizeWorkedExampleSteps,
  mergeWithLlmCommands,
} = require('../../utils/pipeline/boardSynthesizer');
const { enforcePedagogyRule } = require('../../utils/boardCommandGuard');

// Exercises the worked-example mirror the way the pipeline assembles it
// (utils/pipeline/index.js Stage 5c.0a0): extract derivation steps from the
// tutor's reply → run them through the pedagogy guard in worked-example mode →
// merge. No LLM mock; this is the deterministic backfill path that fixes the
// reviewed screenshot (circle area derived via integration, board showed only a
// stray image).
describe('worked-example mirror — assembly (circle-derivation turn)', () => {
  // The actual derivation Maya gave: multi-step, no pinned student problem.
  const tutorResponse = [
    "Awesome! Let's solve the integral to find the area of a semicircle:",
    '\\[ A = \\int_{-r}^{r} \\sqrt{r^2 - x^2}\\,dx \\]',
    'Using the substitution x = r sin(theta) this becomes:',
    '\\[ A = r^2 \\int \\cos^2(\\theta)\\,d\\theta \\]',
    'which evaluates to:',
    '$$ A = \\frac{r^2}{2}\\cdot\\pi $$',
    'Finally, doubling the semicircle:',
    '$$ A = \\pi r^2 $$',
  ].join('\n');

  // Mirror of how index.js gates + guards the backfill on this turn:
  //   no pinned problem → workedExampleBoard true (flag on), backstop is a no-op.
  function assemble() {
    const workedExampleBoard = true; // WORKED_EXAMPLE_BOARD on + noPinnedProblem
    const llmBoardCommands = [];      // model emitted no example cards
    const steps = synthesizeWorkedExampleSteps({ tutorResponse });
    const { allowed } = enforcePedagogyRule({
      commands: steps,
      userMessage: 'yep, show me',
      workedExample: workedExampleBoard,
      pinnedProblemTex: null,
      pinnedAnswer: null,
    });
    return mergeWithLlmCommands(llmBoardCommands, allowed).all;
  }

  it('mirrors the derivation as ordered, read-only example cards', () => {
    const board = assemble();
    expect(board.length).toBe(4);
    expect(board.every(c => c.action === 'example')).toBe(true);
    // Order preserved — a derivation read top to bottom.
    expect(board[0].tex).toContain('\\int_{-r}^{r}');
    expect(board[board.length - 1].tex).toBe('A = \\pi r^2');
  });

  it('emits NO stray image — the board carries the actual math, not clip-art', () => {
    const board = assemble();
    expect(board.some(c => c.action === 'image')).toBe(false);
  });

  it('merge keeps a leading pose before the example steps, examples in order', () => {
    const steps = synthesizeWorkedExampleSteps({ tutorResponse });
    const guarded = enforcePedagogyRule({
      commands: steps, userMessage: 'go', workedExample: true,
    }).allowed;
    // A parallel-problem pose the model emitted alongside the derivation.
    const llm = [{ action: 'pose', tex: 'find the area of a circle' }];
    const all = mergeWithLlmCommands(llm, guarded).all;
    expect(all[0].action).toBe('pose');
    expect(all.slice(1).every(c => c.action === 'example')).toBe(true);
    expect(all[all.length - 1].tex).toBe('A = \\pi r^2');
  });

  it('with the flag OFF (workedExample:false) nothing is admitted — default unchanged', () => {
    const steps = synthesizeWorkedExampleSteps({ tutorResponse });
    const { allowed } = enforcePedagogyRule({
      commands: steps, userMessage: 'yep, show me', workedExample: false,
    });
    expect(allowed).toEqual([]);
  });
});

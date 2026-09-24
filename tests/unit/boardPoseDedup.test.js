const {
  dropRedundantPoses,
  synthesizeAutoClear,
  mergeWithLlmCommands,
  synthesizeBoardCommands,
} = require('../../utils/pipeline/boardSynthesizer');

describe('dropRedundantPoses', () => {
  it('drops an LLM re-pose of the already-pinned problem (the "use the board" bug)', () => {
    const cmds = [{ action: 'pose', tex: '3x^2 + 4x - 7 = 0' }];
    const { kept, dropped } = dropRedundantPoses(cmds, '3x^2 + 4x - 7 = 0');
    expect(kept).toEqual([]);
    expect(dropped).toHaveLength(1);
  });

  it('matches the pin despite cosmetic differences (spacing)', () => {
    const cmds = [{ action: 'pose', tex: '3x^2+4x-7=0' }];
    const { kept } = dropRedundantPoses(cmds, '3x^2 + 4x - 7 = 0');
    expect(kept).toEqual([]);
  });

  it('keeps a genuinely new problem (different tex)', () => {
    const cmds = [{ action: 'clear' }, { action: 'pose', tex: 'x^2 - 9 = 0' }];
    const { kept, dropped } = dropRedundantPoses(cmds, '3x^2 + 4x - 7 = 0');
    expect(dropped).toEqual([]);
    expect(kept.filter(c => c.action === 'pose')).toHaveLength(1);
  });

  it('collapses duplicate poses within the same turn', () => {
    const cmds = [
      { action: 'pose', tex: 'x + 1 = 5' },
      { action: 'pose', tex: 'x + 1 = 5' },
    ];
    const { kept, dropped } = dropRedundantPoses(cmds, null);
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(1);
  });

  it('leaves non-pose commands untouched and in place', () => {
    const cmds = [
      { action: 'apply', op: 'subtract 7' },
      { action: 'resolve', tex: '3x^2 + 4x = 7' },
      { action: 'verify', tex: 'x = 1' },
    ];
    const { kept, dropped } = dropRedundantPoses(cmds, '3x^2 + 4x - 7 = 0');
    expect(dropped).toEqual([]);
    expect(kept).toHaveLength(3);
  });

  it('handles no pin (empty board) — first pose survives', () => {
    const cmds = [{ action: 'pose', tex: '2x = 8' }];
    const { kept } = dropRedundantPoses(cmds, null);
    expect(kept).toHaveLength(1);
  });
});

// Production, 2026-09-24: "Solve 2(x - 3) = 10" → divide by two → x-3=5 →
// add 3 → x=8, and the "Our work" card never grew past the problem. The
// student's ASCII pin was "2(x - 3) = 10"; the model re-posed it every turn as
// "2(x−3)=10" (U+2212 minus). The compare didn't fold the Unicode minus, so
// each re-pose read as a NEW problem: auto-clear wiped the board and re-posed,
// throwing away every apply/resolve card the turn before had drawn.
describe('re-pose in different typography is the SAME problem', () => {
  const PIN = '2(x - 3) = 10';

  it.each([
    ['Unicode minus', '2(x−3)=10'],
    ['\\left/\\right', '2\\left(x-3\\right)=10'],
    ['\\left/\\right + Unicode minus', '2\\left(x − 3\\right) = 10'],
  ])('%s: dropped as redundant, no auto-clear', (_label, tex) => {
    const cmds = [{ action: 'pose', tex }, { action: 'apply', op: 'add 3 to both sides' }];
    const { kept, dropped } = dropRedundantPoses(cmds, PIN);
    expect(dropped).toHaveLength(1);
    expect(kept).toEqual([{ action: 'apply', op: 'add 3 to both sides' }]);
    // Even if a pose slipped through, auto-clear must not treat it as new.
    expect(synthesizeAutoClear({ commands: cmds, previousProblemTex: PIN })
      .some(c => c.action === 'clear')).toBe(false);
  });

  it('a genuinely different problem in Unicode still clears', () => {
    const out = synthesizeAutoClear({ commands: [{ action: 'pose', tex: '3(x−3)=10' }], previousProblemTex: PIN });
    expect(out[0]).toEqual({ action: 'clear' });
  });

  it('replays the transcript: the board accumulates apply → resolve → verify, never a clear', () => {
    const turns = [
      { student: 'divide by two', tutor: 'Great job! Dividing by two is a good move. What do you get?', isCorrect: null },
      { student: 'x-3=5', tutor: 'Great job getting to x−3=5! What next?', isCorrect: null },
      { student: 'x=8', tutor: 'Yes! x = 8.', isCorrect: true },
    ];
    let lastBoardAction = 'pose';
    const emitted = [];
    for (const t of turns) {
      const synth = synthesizeBoardCommands({
        studentMessage: t.student,
        tutorResponse: t.tutor,
        diagnosis: { isCorrect: t.isCorrect, correctAnswer: '8' },
        lastBoardAction,
        pinnedProblem: PIN,
      });
      // The model re-poses the pinned problem in its own typography every turn.
      const llm = [{ action: 'pose', tex: '2(x−3)=10' }];
      let cmds = mergeWithLlmCommands(llm, synth).all;
      cmds = dropRedundantPoses(cmds, PIN).kept;
      cmds = synthesizeAutoClear({ commands: cmds, previousProblemTex: PIN });
      expect(cmds.map(c => c.action)).not.toContain('clear');
      expect(cmds.map(c => c.action)).not.toContain('pose');
      emitted.push(...cmds);
      if (cmds.length) lastBoardAction = cmds[cmds.length - 1].action;
    }
    expect(emitted.map(c => c.action)).toEqual(['apply', 'resolve', 'verify']);
  });
});

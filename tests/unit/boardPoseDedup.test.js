const { dropRedundantPoses } = require('../../utils/pipeline/boardSynthesizer');

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

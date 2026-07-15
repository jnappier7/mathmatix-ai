/**
 * voiceBoardTranslate — voice board payload (mathSteps / boardActions) -> LWS
 * boardCommands. Pure translation; this is what unfreezes the derivation view
 * during a voice session (it previously only saw the hidden legacy board).
 */
const { voiceToBoardCommands } = require('../../public/js/living-workspace/dom/voiceBoardTranslate');

describe('voiceToBoardCommands — mathSteps (preferred source)', () => {
  it('maps latex steps to resolve commands in order', () => {
    const cmds = voiceToBoardCommands({ mathSteps: [{ latex: '2x + 4 = 20' }, { latex: '2x = 16' }, { latex: 'x = 8' }] });
    expect(cmds).toEqual([
      { action: 'resolve', tex: '2x + 4 = 20' },
      { action: 'resolve', tex: '2x = 16' },
      { action: 'resolve', tex: 'x = 8' },
    ]);
  });

  it('drops consecutive duplicate lines and empties', () => {
    const cmds = voiceToBoardCommands({ mathSteps: [{ latex: '2x = 16' }, { latex: '2x = 16' }, { latex: '' }, { latex: 'x = 8' }] });
    expect(cmds.map(c => c.tex)).toEqual(['2x = 16', 'x = 8']);
  });

  it('maps a visual step to a graph/image command', () => {
    expect(voiceToBoardCommands({ mathSteps: [{ visual: { fn: 'x^2' } }] }))
      .toEqual([{ action: 'graph', fn: 'x^2', caption: undefined }]);
    expect(voiceToBoardCommands({ mathSteps: [{ visual: { query: 'unit circle' } }] }))
      .toEqual([{ action: 'image', query: 'unit circle', caption: undefined }]);
  });

  it('skips text-only (narration) steps', () => {
    const cmds = voiceToBoardCommands({ mathSteps: [{ text: 'Now we subtract 4.' }, { latex: '2x = 16' }] });
    expect(cmds).toEqual([{ action: 'resolve', tex: '2x = 16' }]);
  });

  it('prefers mathSteps and ignores boardActions when both are present', () => {
    const cmds = voiceToBoardCommands({
      mathSteps: [{ latex: 'x = 8' }],
      boardActions: [{ type: 'write', text: '9x = 81' }],
    });
    expect(cmds).toEqual([{ action: 'resolve', tex: 'x = 8' }]);
  });
});

describe('voiceToBoardCommands — boardActions fallback', () => {
  it('maps a math write action to a resolve command', () => {
    expect(voiceToBoardCommands({ boardActions: [{ type: 'write', text: '3x - 5 = 16' }] }))
      .toEqual([{ action: 'resolve', tex: '3x - 5 = 16' }]);
  });

  it('skips a prose write action (narration, not math)', () => {
    expect(voiceToBoardCommands({ boardActions: [{ type: 'write', text: 'Great start, keep going!' }] }))
      .toEqual([]);
  });

  it('drops annotations (circle / arrow / highlight) that have no derivation equivalent', () => {
    const cmds = voiceToBoardCommands({ boardActions: [
      { type: 'circle', objectId: 'a' }, { type: 'arrow', fromId: 'a' }, { type: 'highlight', objectId: 'b' },
    ] });
    expect(cmds).toEqual([]);
  });

  it('maps a clear action', () => {
    expect(voiceToBoardCommands({ boardActions: [{ type: 'clear' }] })).toEqual([{ action: 'clear' }]);
  });
});

describe('voiceToBoardCommands — edge cases', () => {
  it('returns [] for empty / missing / malformed input (never throws)', () => {
    expect(voiceToBoardCommands()).toEqual([]);
    expect(voiceToBoardCommands({})).toEqual([]);
    expect(voiceToBoardCommands({ mathSteps: null, boardActions: null })).toEqual([]);
    expect(voiceToBoardCommands({ mathSteps: [null, undefined] })).toEqual([]);
  });
});

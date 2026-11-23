/**
 * Algebra tiles on the work card (owner, 2026-11-23: "like a real tutor the
 * board should be multifunctional … he can pull out algebra tiles";
 * "Interactive? Draggable, flip neg, zero pairs?").
 *
 * Three contracts, each of which fails silently if it breaks:
 *   1. utils/workspace/tileMat.js decides WHICH tiles a line is — the model
 *      only names the line — and answers null for anything it cannot read
 *      with certainty, so a wrong picture is impossible and a missing one is
 *      the worst case;
 *   2. the guard only lets tiles through for a line that is already the
 *      student's (the problem, or a line they stated) — tiles for the next
 *      line would be that line, shown early;
 *   3. the card that survives carries `mat` and NO top-level tex, so no later
 *      stage counts the picture as a line of the solve, and a reload replays it.
 */
// The board's own suites opt in — it is off by default.
process.env.WORK_BOARD = 'on';

const { parseTileMat, LIMITS } = require('../../../utils/workspace/tileMat');
const { enforcePedagogyRule } = require('../../../utils/boardCommandGuard');
const { parseBoardTags } = require('../../../utils/boardTagParser');
const { normalizeBoardCommand, BOARD_ACTIONS } = require('../../../utils/boardResponseSchema');
const { applyTurnToLedger } = require('../../../utils/pipeline/boardLedger');
const { buildBoardStateBlock } = require('../../../utils/pipeline/boardStateBlock');
const shared = require('../../../shared/workspace/legacyBoardAdapter');
const client = require('../../../public/js/living-workspace/dom/legacyBoardAdapter.js');

const side = (x2, x, unit) => ({ x2, x, unit });

describe('parseTileMat — which tiles a line is', () => {
  test.each([
    ['2x + 3 = 7', 'x', [side([0, 0], [2, 0], [3, 0]), side([0, 0], [0, 0], [7, 0])]],
    ['x^{2} + 5x + 6', 'x', [side([1, 0], [5, 0], [6, 0])]],
    ['x² − 4x + 4 = 0', 'x', [side([1, 0], [0, 4], [4, 0]), side([0, 0], [0, 0], [0, 0])]],
    ['-x - 4 = 2', 'x', [side([0, 0], [0, 1], [0, 4]), side([0, 0], [0, 0], [2, 0])]],
    ['2 \\cdot x + 1 = 9', 'x', [side([0, 0], [2, 0], [1, 0]), side([0, 0], [0, 0], [9, 0])]],
    ['3a - 2 = a + 6', 'a', [side([0, 0], [3, 0], [0, 2]), side([0, 0], [1, 0], [6, 0])]],
  ])('%s', (tex, variable, sides) => {
    expect(parseTileMat(tex)).toEqual({ tex, variable, sides });
  });

  test('terms are NOT combined — the zero pairs are the lesson', () => {
    expect(parseTileMat('2x + 3 - 3').sides[0]).toEqual(side([0, 0], [2, 0], [3, 3]));
    expect(parseTileMat('x - x + 1').sides[0]).toEqual(side([0, 0], [1, 1], [1, 0]));
  });

  test.each([
    ['brackets', '3(x + 2)'],
    ['a fraction', '\\frac{x}{2} = 3'],
    ['a decimal', '0.5x = 2'],
    ['two variables', '2x + y = 5'],
    ['a product of variables', '2xy'],
    ['a cube', 'x^3 + 1'],
    ['arithmetic, not a term', '2 \\cdot 3'],
    ['an inequality', 'x + 2 < 5'],
    ['two equals signs', 'x = 2 = y'],
    ['a dangling sign', '2x + = 4'],
    ['nothing on one side', '2x ='],
    ['nothing at all', '0'],
    ['a radical', '\\sqrt{x} = 3'],
    ['empty', ''],
    ['null', null],
  ])('not drawable: %s', (_n, tex) => {
    expect(parseTileMat(tex)).toBeNull();
  });

  test('a mat nobody could take in is refused', () => {
    expect(parseTileMat(`${LIMITS.coefficient + 1}x`)).toBeNull();
    expect(parseTileMat('20x + 11')).toBeNull();          // 31 tiles on a side
    expect(parseTileMat('7x^2')).toBeNull();
    expect(parseTileMat('20x + 10')).not.toBeNull();
  });
});

describe('the guard — tiles only for a line that is already the student\'s', () => {
  const run = (commands, extra = {}) => enforcePedagogyRule({ commands, userMessage: '', ...extra });

  test('the problem in focus: allowed, and leaves as a mat with no tex', () => {
    const { allowed } = run([{ action: 'pose', tex: '2x + 3 = 7' }, { action: 'tiles', tex: '2x + 3 = 7', caption: 'Try it' }]);
    expect(allowed).toHaveLength(2);
    expect(allowed[1]).toEqual({ action: 'tiles', caption: 'Try it', mat: parseTileMat('2x + 3 = 7') });
    expect(allowed[1].tex).toBeUndefined();
  });

  test('the pinned problem from an earlier turn', () => {
    const { allowed } = run([{ action: 'tiles', tex: '2x+3=7' }], { pinnedProblemTex: '2x + 3 = 7' });
    expect(allowed).toHaveLength(1);
  });

  test('a line the student stated', () => {
    const { allowed } = run([{ action: 'tiles', tex: '2x = 4' }], { pinnedProblemTex: '2x + 3 = 7', userMessage: 'so now 2x = 4' });
    expect(allowed).toHaveLength(1);
  });

  test('the NEXT line of the solve is not shown early', () => {
    const { allowed, dropped } = run([{ action: 'tiles', tex: '2x = 4' }], { pinnedProblemTex: '2x + 3 = 7', userMessage: 'what do I do' });
    expect(allowed).toHaveLength(0);
    expect(dropped[0].reason).toBe('tiles_line_not_on_board');
  });

  test('the answer is not shown as tiles', () => {
    const { allowed } = run([{ action: 'tiles', tex: 'x = 2' }], { pinnedProblemTex: '2x + 3 = 7', pinnedAnswer: 'x = 2', userMessage: 'help' });
    expect(allowed).toHaveLength(0);
  });

  test('a line that cannot be drawn gets no card', () => {
    const { allowed, dropped } = run([{ action: 'pose', tex: '3(x + 2) = 12' }, { action: 'tiles', tex: '3(x + 2) = 12' }]);
    expect(allowed.map(c => c.action)).toEqual(['pose']);
    expect(dropped[0].reason).toBe('tiles_not_drawable');
  });

  test('a worked example may use the tutor\'s own line, never the graded problem', () => {
    const ctx = { workedExample: true, pinnedProblemTex: '2x + 3 = 7', pinnedAnswer: 'x = 2' };
    expect(run([{ action: 'tiles', tex: 'x + 5 = 9' }], ctx).allowed).toHaveLength(1);
    expect(run([{ action: 'tiles', tex: 'x = 2' }], ctx).allowed).toHaveLength(0);
  });

  test('a mat survives a second pass through the guard', () => {
    const first = run([{ action: 'pose', tex: 'x + 1 = 4' }, { action: 'tiles', tex: 'x + 1 = 4' }]).allowed;
    expect(run(first).allowed).toEqual(first);
  });
});

describe('the rest of the path', () => {
  test('tiles is in the board vocabulary every protocol shares', () => {
    expect(BOARD_ACTIONS).toContain('tiles');
    expect(normalizeBoardCommand({ action: 'tiles', tex: '2x + 3 = 7' })).toEqual({ action: 'tiles', tex: '2x + 3 = 7' });
    // a model cannot hand over its own tile counts
    expect(normalizeBoardCommand({ action: 'tiles', tex: 'x', mat: { sides: [] } }).mat).toBeUndefined();
  });

  test('the inline tag is parsed', () => {
    const { boardCommands, cleanedText } = parseBoardTags('Let me get the tiles out. <BOARD action="tiles" tex="2x + 3 = 7" />');
    expect(boardCommands).toEqual([{ action: 'tiles', tex: '2x + 3 = 7' }]);
    expect(cleanedText).toBe('Let me get the tiles out.');
    expect(parseBoardTags('<BOARD action="tiles" />').boardCommands).toEqual([]);
  });

  test('both adapters turn a mat into the same algebra_tiles element', () => {
    const mat = parseTileMat('2x + 3 = 7');
    const cmds = [{ action: 'tiles', mat, caption: 'Try it' }, { action: 'tiles', tex: '2x + 3 = 7' }];
    const a = shared.adaptBoardCommands(cmds), b = client.adaptBoardCommands(cmds);
    expect(a.elements).toEqual(b.elements);
    expect(a.elements).toHaveLength(1);                      // no mat → no element
    expect(a.elements[0]).toMatchObject({ type: 'algebra_tiles', semantic: { mat, caption: 'Try it' } });
  });

  test('the ledger keeps the mat (a reload replays the tiles) and the tutor is told they are out', () => {
    const mat = parseTileMat('2x + 3 = 7');
    const ledger = applyTurnToLedger(null, [{ action: 'pose', tex: '2x + 3 = 7' }, { action: 'tiles', mat }], new Date());
    const stored = ledger.current.steps.find(c => c.action === 'tiles');
    expect(stored.mat).toEqual(mat);
    expect(buildBoardStateBlock(ledger)).toMatch(/ALGEBRA TILES.*2x \+ 3 = 7/);
  });
});

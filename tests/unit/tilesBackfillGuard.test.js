/**
 * The tiles-promise backfill's guard can say no (QA on #1942, 2026-11-25).
 *
 * "Let me get the tiles out" with no tiles card gets one backfilled. It went
 * through the pedagogy guard with the tiles line itself passed as the pinned
 * problem — so "is this line already on the board?" compared the line with
 * itself and could never fail. tilesPromiseCard (utils/pipeline/tilesBackfill.js)
 * hands the guard the real pin, and this turn's pose only when it is one.
 */
const fs = require('fs');
const path = require('path');
const { tilesPromiseCard } = require('../../utils/pipeline/tilesBackfill');

const LINE = '2x + 3 = 7';

describe('a card only for a line that is already the student\'s', () => {
  test('the pinned problem', () => {
    const { card } = tilesPromiseCard({ tilesTex: LINE, pinnedProblemTex: LINE, userMessage: 'can i see it with tiles' });
    expect(card).toMatchObject({ action: 'tiles' });
    expect(card.mat).toBeTruthy();
    expect(card.tex).toBeUndefined();          // leaves the guard as a mat, never a line of the solve
  });

  test('the problem posed THIS turn, with no pin yet', () => {
    const { card } = tilesPromiseCard({ tilesTex: LINE, turnPoseTex: LINE, pinnedProblemTex: null, userMessage: 'ok' });
    expect(card).toMatchObject({ action: 'tiles' });
  });

  test('a new problem posed this turn over an older pin', () => {
    const { card } = tilesPromiseCard({ tilesTex: LINE, turnPoseTex: LINE, pinnedProblemTex: 'x + 1 = 5', userMessage: 'next one' });
    expect(card).toMatchObject({ action: 'tiles' });
  });

  test('only the tiles card comes back — the pose is not added a second time', () => {
    const { card } = tilesPromiseCard({ tilesTex: LINE, turnPoseTex: LINE });
    expect(card.action).toBe('tiles');
  });

  test('a line the student stated', () => {
    const { card } = tilesPromiseCard({ tilesTex: '2x = 4', pinnedProblemTex: LINE, userMessage: 'so now its 2x = 4' });
    expect(card).toMatchObject({ action: 'tiles' });
  });

  test('a line the student built on their mat', () => {
    const { card } = tilesPromiseCard({ tilesTex: '2x = 4', pinnedProblemTex: LINE, userMessage: 'like this?', studentBoardLines: ['2x = 4'] });
    expect(card).toMatchObject({ action: 'tiles' });
  });
});

describe('…and none for anything else', () => {
  test('neither the pin, nor this turn\'s pose, nor stated → no tiles card', () => {
    const r = tilesPromiseCard({
      tilesTex: '2x = 4',                       // the NEXT line of the solve
      turnPoseTex: null,
      pinnedProblemTex: LINE,
      userMessage: 'i dont get it',
      recentUserMessages: [{ role: 'user', content: 'help me with 2x + 3 = 7' }],
    });
    expect(r.card).toBeNull();
    expect(r.reason).toBe('tiles_line_not_on_board');
  });

  test('no pin, no pose, nothing stated', () => {
    const r = tilesPromiseCard({ tilesTex: LINE, userMessage: 'show me the tiles' });
    expect(r.card).toBeNull();
    expect(r.reason).toBe('tiles_line_not_on_board');
  });

  test('the old call shape — the line passed off as the pin — is what made it pass', () => {
    // Same line, same message: the only difference is what the guard is told is pinned.
    expect(tilesPromiseCard({ tilesTex: '2x = 4', pinnedProblemTex: '2x = 4', userMessage: 'i dont get it' }).card).not.toBeNull();
    expect(tilesPromiseCard({ tilesTex: '2x = 4', pinnedProblemTex: LINE, userMessage: 'i dont get it' }).card).toBeNull();
  });

  test('a line tiles cannot show draws no card even when it is the problem', () => {
    const r = tilesPromiseCard({ tilesTex: 'x^3 + 2 = 10', pinnedProblemTex: 'x^3 + 2 = 10' });
    expect(r.card).toBeNull();
    expect(r.reason).toBe('tiles_not_drawable');
  });

  test('no line at all', () => {
    expect(tilesPromiseCard({ tilesTex: null }).card).toBeNull();
    expect(tilesPromiseCard().card).toBeNull();
  });
});

describe('the pipeline calls it with the real pin', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../utils/pipeline/index.js'), 'utf8');
  const at = src.indexOf('const { card, reason } = tilesPromiseCard({');
  const call = src.slice(at, src.indexOf('});', at));

  test('pinnedProblemTex is the conversation\'s pin, never the tiles line', () => {
    expect(at).toBeGreaterThan(0);
    expect(src).toMatch(/const pinTex = ctx\.conversation\?\.boardProblem\?\.tex \|\| null;/);
    expect(call).toMatch(/pinnedProblemTex: pinTex,/);
    expect(src).not.toMatch(/pinnedProblemTex: tilesTex/);
  });

  test('the pose it vouches for is one of this turn\'s verified commands', () => {
    expect(src).toMatch(/const turnPoseTex = \(verified\.boardCommands\.find\(c => c\.action === 'pose' && c\.tex\) \|\| \{\}\)\.tex \|\| null;/);
    expect(call).toMatch(/turnPoseTex,/);
  });
});

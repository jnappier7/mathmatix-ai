/**
 * Work Board preview (owner, 2026-11-23: "how can I see it without the world
 * seeing it?"). WORK_BOARD_PREVIEW names the accounts that get the board while
 * WORK_BOARD stays off for everyone else.
 *
 * What must hold: a listed account gets it on BOTH sides (the prompt and the
 * client flag come from the same function), nobody else does, and nothing
 * outside a request ever sees a preview.
 */
const express = require('express');
const request = require('supertest');

const flags = require('../../utils/featureFlags');
const { isWorkBoardEnabled, isBoardPreviewUser, boardPreviewScope, buildFeaturesScript, runWithBoardPreview } = flags;

const saved = { board: process.env.WORK_BOARD, preview: process.env.WORK_BOARD_PREVIEW };
afterEach(() => {
  for (const [k, v] of [['WORK_BOARD', saved.board], ['WORK_BOARD_PREVIEW', saved.preview]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

describe('who is on the list', () => {
  const env = { WORK_BOARD_PREVIEW: ' Owner@Example.com , 64b7f0c2a1d3e4f5a6b7c8d9 ,, ' };

  test('matched on email or user id, exactly, case-insensitively', () => {
    expect(isBoardPreviewUser({ email: 'owner@example.com' }, env)).toBe(true);
    expect(isBoardPreviewUser({ email: 'OWNER@EXAMPLE.COM ' }, env)).toBe(true);
    expect(isBoardPreviewUser({ _id: '64b7f0c2a1d3e4f5a6b7c8d9', email: 'kid@example.com' }, env)).toBe(true);
    expect(isBoardPreviewUser({ _id: { toString: () => '64B7F0C2A1D3E4F5A6B7C8D9' } }, env)).toBe(true);
  });

  test('nobody else — no partial matches, no roles, no empty values', () => {
    expect(isBoardPreviewUser({ email: 'someone@example.com' }, env)).toBe(false);
    expect(isBoardPreviewUser({ email: 'owner@example.com.evil.test' }, env)).toBe(false);
    expect(isBoardPreviewUser({ email: '', role: 'admin', roles: ['admin'] }, env)).toBe(false);
    expect(isBoardPreviewUser({}, env)).toBe(false);
    expect(isBoardPreviewUser(null, env)).toBe(false);
  });

  test('no list, no preview', () => {
    expect(isBoardPreviewUser({ email: 'owner@example.com' }, {})).toBe(false);
    expect(isBoardPreviewUser({ email: '' }, { WORK_BOARD_PREVIEW: ',' })).toBe(false);
  });
});

describe('the one switch every reader asks', () => {
  beforeEach(() => { delete process.env.WORK_BOARD; });

  test('off outside a request, whatever the list says', () => {
    process.env.WORK_BOARD_PREVIEW = 'owner@example.com';
    expect(isWorkBoardEnabled()).toBe(false);
  });

  test('on inside a preview request, off inside anyone else\'s', () => {
    expect(runWithBoardPreview(true, () => isWorkBoardEnabled())).toBe(true);
    expect(runWithBoardPreview(false, () => isWorkBoardEnabled())).toBe(false);
  });

  test('the answer survives an await (the pipeline is async all the way down)', async () => {
    const seen = await runWithBoardPreview(true, async () => {
      await new Promise(r => setTimeout(r, 5));
      return isWorkBoardEnabled();
    });
    expect(seen).toBe(true);
    expect(isWorkBoardEnabled()).toBe(false);
  });

  test('two requests at once do not see each other\'s answer', async () => {
    const a = runWithBoardPreview(true, async () => { await new Promise(r => setTimeout(r, 10)); return isWorkBoardEnabled(); });
    const b = runWithBoardPreview(false, async () => { await new Promise(r => setTimeout(r, 5)); return isWorkBoardEnabled(); });
    expect(await Promise.all([a, b])).toEqual([true, false]);
  });

  test('an explicitly passed env is asked about that env alone', () => {
    expect(runWithBoardPreview(true, () => isWorkBoardEnabled({}))).toBe(false);
    expect(isWorkBoardEnabled({ WORK_BOARD: 'on' })).toBe(true);
  });

  test('the global switch still turns it on for everyone', () => {
    process.env.WORK_BOARD = 'on';
    expect(runWithBoardPreview(false, () => isWorkBoardEnabled())).toBe(true);
  });

  test('prompt and client flag agree inside a request', () => {
    const { isStructuredModeEnabled } = require('../../utils/boardResponseSchema');
    process.env.STRUCTURED_TUTOR_RESPONSE = 'true';
    try {
      runWithBoardPreview(true, () => {
        expect(buildFeaturesScript()).toContain('"workBoard":true');
        expect(isStructuredModeEnabled()).toBe(true);
      });
      runWithBoardPreview(false, () => {
        expect(buildFeaturesScript()).toContain('"workBoard":false');
        expect(isStructuredModeEnabled()).toBe(false);
      });
    } finally { delete process.env.STRUCTURED_TUTOR_RESPONSE; }
  });
});

describe('through the middleware', () => {
  function app(user) {
    const a = express();
    a.use((req, res, next) => { req.user = user; next(); });
    a.use(boardPreviewScope);
    a.get('/api/features.js', async (req, res) => {
      await new Promise(r => setTimeout(r, 2));
      res.type('application/javascript').send(buildFeaturesScript());
    });
    return a;
  }

  beforeEach(() => {
    delete process.env.WORK_BOARD;
    process.env.WORK_BOARD_PREVIEW = 'owner@example.com';
  });

  test('the listed account is served workBoard:true; a student and a guest are not', async () => {
    const mine = await request(app({ email: 'owner@example.com' })).get('/api/features.js');
    const kid = await request(app({ email: 'kid@example.com' })).get('/api/features.js');
    const guest = await request(app(undefined)).get('/api/features.js');
    expect(mine.text).toContain('"workBoard":true');
    expect(kid.text).toContain('"workBoard":false');
    expect(guest.text).toContain('"workBoard":false');
  });

  test('the real route marks the script private, never shared-cacheable', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../config/routes.js'), 'utf8');
    const at = src.indexOf("app.get('/api/features.js'");
    expect(src.slice(at, at + 500)).toMatch(/'Cache-Control',\s*'private, no-store'/);
  });

  test('the scope is mounted after impersonation', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../config/middleware.js'), 'utf8');
    expect(src.indexOf('app.use(boardPreviewScope)')).toBeGreaterThan(src.indexOf('app.use(handleImpersonation)'));
    expect(src.indexOf('app.use(boardPreviewScope)')).toBeGreaterThan(src.indexOf('passport.session'));
  });
});

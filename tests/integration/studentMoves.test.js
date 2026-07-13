// tests/integration/studentMoves.test.js
// Integration tests for POST /api/student-moves — the P1 seam.
//
// runStudentTurn (routes/chat.js) is mocked so we can assert the ROUTE's
// plumbing in isolation without booting the full tutoring pipeline / LLM:
//   • ?tutor=true on an ATTEMPT move delegates into the shared chat turn with
//     req.body.message rewritten to the normalized ANSWER_ATTEMPT string, and
//     the authoritative verdict attached (req.studentMove) for the response.
//   • exploration / reposition NEVER delegate — the pipeline (and its
//     answer-injection site) never runs, so the anti-leak gate stays closed.
//   • the default path returns the server-authoritative VerifiedMove alone.
//   • invalid / forged input is rejected before anything else.

jest.mock('../../routes/chat', () => ({
  // Echo enough of the delegated request back so the test can assert what the
  // route handed to the shared chat turn.
  runStudentTurn: jest.fn((req, res) =>
    res.status(200).json({
      _delegated: true,
      messageSeenByPipeline: req.body.message,
      studentMove: req.studentMove || null,
    })
  ),
}));

const express = require('express');
const supertest = require('supertest');
const { runStudentTurn } = require('../../routes/chat');
const studentMovesRouter = require('../../routes/studentMoves');
const { ELEMENT_TYPES } = require('../../shared/workspace');

function makeApp(currentUser) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = currentUser || null; next(); });
  app.use('/api/student-moves', studentMovesRouter);
  return app;
}

const student = { _id: 's-1', roles: ['student'], role: 'student' };

const x = (coefficient, variable = 'x') => ({ coefficient, variable });
const move = (over = {}) => Object.assign({
  schemaVersion: 1, moveId: 'm-1', conversationId: 'c-1', workspaceId: 'w-1', elementId: 'tiles-1',
  elementType: ELEMENT_TYPES.ALGEBRA_TILES, source: 'gesture', mode: 'attempt',
  intent: 'combine_like_terms',
  previousState: {}, proposedState: {},
  operation: { type: 'combine_like_terms', operands: [x(2), x(3)] },
  interaction: { gestureType: 'drag', pointerType: 'touch', startedAt: '2026-07-12T00:00:00Z', completedAt: '2026-07-12T00:00:01Z' },
  clientSequence: 1, idempotencyKey: 'k-1',
}, over);

beforeEach(() => jest.clearAllMocks());

describe('POST /api/student-moves (verdict-only, default)', () => {
  test('returns the server-authoritative VerifiedMove and does NOT delegate', async () => {
    const res = await supertest(makeApp(student)).post('/api/student-moves').send(move());
    expect(res.status).toBe(200);
    expect(res.body.verifiedMove.mathematicallyValid).toBe(true);
    expect(res.body.normalized.statedStep).toBe('2x + 3x = 5x');
    expect(runStudentTurn).not.toHaveBeenCalled();
  });
});

describe('POST /api/student-moves?tutor=true (attempt → tutor reaction)', () => {
  test('delegates to runStudentTurn with the normalized ANSWER_ATTEMPT string', async () => {
    const res = await supertest(makeApp(student)).post('/api/student-moves?tutor=true').send(move());
    expect(runStudentTurn).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(res.body._delegated).toBe(true);
    // The pipeline must see the reframed step, not the bare equation.
    expect(res.body.messageSeenByPipeline).toBe('I combined 2x + 3x to get 5x');
    // The authoritative verdict rides along for the client's board update.
    expect(res.body.studentMove.verifiedMove.mathematicallyValid).toBe(true);
    expect(res.body.studentMove.normalized.pipelineMessage).toBe('I combined 2x + 3x to get 5x');
  });

  test('a misconception move still delegates (allow-and-teach), framing the wrong claim', async () => {
    const res = await supertest(makeApp(student))
      .post('/api/student-moves?tutor=true')
      .send(move({ operation: { type: 'combine_like_terms', operands: [x(2), x(3, '')] } }));
    expect(runStudentTurn).toHaveBeenCalledTimes(1);
    expect(res.body.messageSeenByPipeline).toBe('I combined 2x + 3 to get 5x');
    expect(res.body.studentMove.verifiedMove.mathematicallyValid).toBe(false);
  });
});

describe('anti-leak gate stays closed on non-attempt moves', () => {
  test('exploration + tutor=true does NOT delegate (pipeline never runs)', async () => {
    const res = await supertest(makeApp(student))
      .post('/api/student-moves?tutor=true')
      .send(move({ mode: 'exploration' }));
    expect(runStudentTurn).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body.verifiedMove).toBeDefined();
    expect(res.body.normalized).toBeNull();
  });

  test('reposition + tutor=true does NOT delegate', async () => {
    const res = await supertest(makeApp(student))
      .post('/api/student-moves?tutor=true')
      .send(move({ mode: 'reposition' }));
    expect(runStudentTurn).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body.normalized).toBeNull();
  });
});

describe('invalid / forged input', () => {
  test('a smuggled server verdict is rejected with 400 (never delegates)', async () => {
    const res = await supertest(makeApp(student))
      .post('/api/student-moves?tutor=true')
      .send(move({ mathematicallyValid: true }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_student_move');
    expect(runStudentTurn).not.toHaveBeenCalled();
  });

  test('an element with no server verifier yet → 422', async () => {
    const res = await supertest(makeApp(student))
      .post('/api/student-moves')
      .send(move({ elementType: ELEMENT_TYPES.GRAPH }));
    expect(res.status).toBe(422);
  });
});

/**
 * "Forbidden: Students only." spoken as the tutor (ACT bootcamp transcript,
 * owner report, 2026-09-21).
 *
 * That string is not tutor copy. It is the body of a 403 from the isStudent
 * guard (middleware/auth.js), shaped by utils/apiResponse.fail() into
 * { success: false, message: 'Forbidden: Students only.' }.
 *
 * /api/student-moves sits behind isStudent (config/routes.js), and the ACT
 * bootcamp runs inside chat.html with the Living Workspace live, so a tapped
 * scaffold blank POSTs there. When the account's roles[] lacks 'student' — a
 * teacher or admin previewing, an impersonated session, a demo clone — or the
 * session has lapsed (401), the response is an error envelope.
 *
 * chat-workspace.js's blank-submit handler read
 *   resp.text || resp.message || resp.response.text
 * and never consulted result.ok, even though sendMove returns it. So the
 * developer-facing error string was rendered as an assistant bubble mid-review.
 *
 * Two invariants pinned here:
 *   1. sendMove reports a non-2xx honestly (ok:false + status), so the consumer
 *      has something to branch on;
 *   2. the consumer branches on it, and `message` is no longer a source of
 *      tutor speech at all.
 *
 * Invariant 2 is asserted against the source text, the established pattern for
 * this browser module (see workspace/inlineWorkDock.test.js).
 */
const fs = require('fs');
const path = require('path');
const C = require('../../public/js/living-workspace/dom/studentMoveClient');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'js', 'living-workspace', 'chat-workspace.js'),
  'utf8'
);

const FORBIDDEN = { success: false, message: 'Forbidden: Students only.' };

function fetchStub(status, body) {
  return () => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
}

const blankMove = {
  schemaVersion: 1, moveId: 'm1', conversationId: 'c1', workspaceId: 'w1',
  elementId: 'e1', elementType: 'equation', source: 'keyboard', mode: 'attempt',
  intent: 'fill_blank',
  previousState: {}, proposedState: {},
  operation: { type: 'fill_blank', parameters: { stepTex: '1 \\div \\boxed{} = 10', blankIndex: 0, value: '0.1' } },
  interaction: { gestureType: 'edit', pointerType: 'keyboard', startedAt: '2026-09-21T00:00:00Z', completedAt: '2026-09-21T00:00:01Z' },
  clientSequence: 1, idempotencyKey: 'k1',
};

describe('sendMove reports a rejected move honestly', () => {
  test('a 403 from isStudent comes back ok:false with its status', async () => {
    const r = await C.sendMove(blankMove, { fetch: fetchStub(403, FORBIDDEN) });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
  });

  test('a lapsed session (401) is equally not-ok', async () => {
    const r = await C.sendMove(blankMove, {
      fetch: fetchStub(401, { success: false, message: 'Unauthorized: Authentication required.' }),
    });
    expect(r.ok).toBe(false);
  });

  test('a 200 is ok, so the success path is unaffected', async () => {
    const r = await C.sendMove(blankMove, {
      fetch: fetchStub(200, { verifiedMove: { mathematicallyValid: true }, text: 'Nice — that checks out.' }),
    });
    expect(r.ok).toBe(true);
    expect(r.response.text).toBe('Nice — that checks out.');
  });
});

describe('the blank-submit handler cannot speak an error envelope', () => {
  test('it bails on a non-ok result before appending anything', () => {
    expect(SRC).toMatch(/if\s*\(!result\s*\|\|\s*!result\.ok\)/);
    const guard = SRC.search(/if\s*\(!result\s*\|\|\s*!result\.ok\)/);
    const append = SRC.indexOf("window.appendMessage(text, 'ai')");
    expect(guard).toBeGreaterThan(-1);
    expect(append).toBeGreaterThan(guard);
  });

  test('`message` is not a source of tutor text anywhere in the module', () => {
    // The whole defect in one line: resp.text || resp.message || ...
    expect(SRC).not.toMatch(/resp\.text\s*\|\|\s*resp\.message/);
    expect(SRC).not.toMatch(/\.message\s*\|\|\s*\(resp\.response/);
  });

  test('the tutor-text chain still reads the two real reply shapes', () => {
    expect(SRC).toMatch(/resp\.text\s*\|\|\s*\(resp\.response\s*&&\s*resp\.response\.text\)/);
  });
});

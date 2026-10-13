/**
 * The voice stream reconnects after a DROPPED connection, never after a server
 * that closed it on purpose.
 *
 * Owner console, 2026-10-13: "[VoiceStreamClient] disconnected, reconnecting in
 * 500ms (attempt 1/4)" every second, forever. Two chat tabs for one student:
 * the server supersedes the older user+mode session on each new connection
 * (utils/voiceSession.js), the superseded client reconnected, superseding the
 * other tab, which reconnected in turn. The counter never climbed because
 * every reconnect DID open — and reset it — before being superseded again.
 * Each open is a Deepgram stream.
 */
const fs = require('fs');
const path = require('path');

let VoiceStreamClient;
beforeAll(() => {
  const src = fs.readFileSync(path.join(__dirname, '../../public/js/voice-stream-client.js'), 'utf8');
  global.window = global.window || {};
  // eslint-disable-next-line no-eval
  (0, eval)(src);
  VoiceStreamClient = global.window.VoiceStreamClient;
});

function makeClient() {
  const events = [];
  const client = new VoiceStreamClient({ on: (ev) => events.push(ev) });
  client._scheduleReconnect = jest.fn();
  return { client, events };
}

test('superseded by another tab (4409): stand down, no reconnect', () => {
  const { client, events } = makeClient();
  client._onWsClose({ code: 4409, reason: 'superseded_by_new_session' });
  expect(client._scheduleReconnect).not.toHaveBeenCalled();
  expect(events.map((e) => e.type)).toEqual(['superseded', 'disconnected']);
});

test.each([1000, 1008])('a deliberate server close (%i) is not reconnected to', (code) => {
  const { client, events } = makeClient();
  client._onWsClose({ code, reason: 'quota_exhausted' });
  expect(client._scheduleReconnect).not.toHaveBeenCalled();
  expect(events.map((e) => e.type)).toEqual(['disconnected']);
});

test.each([1006, 1001, 1011])('an abnormal drop (%i) still reconnects', (code) => {
  const { client } = makeClient();
  client._onWsClose({ code });
  expect(client._scheduleReconnect).toHaveBeenCalledTimes(1);
});

test('an intentional client disconnect is never reconnected', () => {
  const { client, events } = makeClient();
  client._intentionalDisconnect = true;
  client._onWsClose({ code: 1006 });
  expect(client._scheduleReconnect).not.toHaveBeenCalled();
  expect(events.map((e) => e.type)).toEqual(['disconnected']);
});

test('the server closes a superseded socket with the code the client knows', () => {
  const { CLOSE_SUPERSEDED } = require('../../utils/voiceSession');
  expect(CLOSE_SUPERSEDED).toBe(4409);
  const client = fs.readFileSync(path.join(__dirname, '../../public/js/voice-stream-client.js'), 'utf8');
  expect(client).toMatch(/const CLOSE_SUPERSEDED = 4409;/);
});

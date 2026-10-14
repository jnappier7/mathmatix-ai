/**
 * The practice-test runner's answer-save queue (public/js/act-test.js
 * createSaveQueue).
 *
 * QA on prod (2026-10-13): navigating a PSAT at ~1 question a second drew
 * 429s from save-answer. The runner fired saves and forgot them, so the
 * answer stayed selected on screen, never reached the server, and the report
 * counted it skipped. It also re-sent unchanged answers on every navigation,
 * which is what spent the rate-limit budget in the first place.
 *
 * Pinned here, with a fake clock and a scripted server:
 *   - unchanged answers are never sent (dedupe against the server's state,
 *     the queue, and what is on the wire);
 *   - a 429 is retried after the server's retryAfter, not before;
 *   - a network error / 5xx backs off and retries; nothing is dropped;
 *   - a definitive refusal (409 time-up) is dropped and reported once;
 *   - flush() waits for the queue to drain before submit, and gives up
 *     (resolves false) at its timeout instead of hanging the submit.
 */
const fs = require('fs');
const path = require('path');

function loadRunner() {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'act-test.js'), 'utf8');
  const win = { addEventListener() {} };
  const doc = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} }, addEventListener() {} };
  new Function('window', 'document', 'location', 'localStorage', src)(win, doc, { search: '' }, { getItem: () => null });
  return win;
}
const win = loadRunner();
const createSaveQueue = win.__actCreateSaveQueue;

// A controllable clock + timers.
function fakeClock() {
  let t = 1000;
  let id = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimeout: (f, ms) => { id += 1; timers.set(id, { at: t + ms, f }); return id; },
    clearTimeout: (i) => { timers.delete(i); },
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        t = Math.max(t, due[1].at);
        due[1].f();
        await flushMicrotasks();
      }
      t = end;
      await flushMicrotasks();
    },
  };
}
const flushMicrotasks = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

// A server that answers from a script; default 200.
function fakeServer(script = []) {
  const calls = [];
  const send = (entry) => {
    calls.push({ ...entry });
    const next = script.length ? script.shift() : { status: 200, body: { saved: true } };
    return Promise.resolve(next);
  };
  return { send, calls };
}

function make(server, clock, extra = {}) {
  const statuses = [];
  const terminal = [];
  const q = createSaveQueue({
    send: server.send,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    onStatus: (s) => statuses.push(s),
    onTerminal: (entry, body, code) => terminal.push({ entry, body, code }),
    ...extra,
  });
  return { q, statuses, terminal };
}

const entry = (position, answer, extra = {}) => ({ sessionId: 's1', problemId: `p${position}`, position, answer, flagged: false, seq: 1, ...extra });

describe('dedupe', () => {
  test('a revisit with the answer the server already holds sends nothing', async () => {
    const clock = fakeClock(); const server = fakeServer();
    const { q } = make(server, clock);
    q.markSaved(3, { answer: 'B', flagged: false });
    expect(q.enqueue(entry(3, 'B'))).toBe(false);
    await flushMicrotasks();
    expect(server.calls).toHaveLength(0);
  });

  test('a changed answer or flag is sent; sending it twice is not', async () => {
    const clock = fakeClock(); const server = fakeServer();
    const { q } = make(server, clock);
    q.markSaved(3, { answer: 'B', flagged: false });
    expect(q.enqueue(entry(3, 'C', { seq: 2 }))).toBe(true);
    expect(q.enqueue(entry(3, 'C', { seq: 2 }))).toBe(false);   // already on the wire
    await flushMicrotasks();
    expect(q.enqueue(entry(3, 'C', { seq: 2 }))).toBe(false);   // server holds it now
    expect(q.enqueue(entry(3, 'C', { flagged: true, seq: 3 }))).toBe(true);
    await flushMicrotasks();
    expect(server.calls.map((c) => [c.answer, c.flagged])).toEqual([['C', false], ['C', true]]);
  });

  test('blank and null are the same answer', () => {
    const clock = fakeClock(); const server = fakeServer();
    const { q } = make(server, clock);
    q.markSaved(5, { answer: null, flagged: false });
    expect(q.enqueue(entry(5, ''))).toBe(false);
    expect(q.enqueue(entry(5, undefined))).toBe(false);
  });
});

describe('retry', () => {
  test('a 429 waits the server\'s retryAfter, then the answer lands', async () => {
    const clock = fakeClock();
    const server = fakeServer([{ status: 429, body: { message: 'Too many requests, please try again shortly.', retryAfter: 129 } }]);
    const { q, statuses } = make(server, clock);
    q.enqueue(entry(1, 'A'));
    await flushMicrotasks();
    expect(server.calls).toHaveLength(1);
    expect(statuses[statuses.length - 1]).toMatchObject({ state: 'retrying', pending: 1 });

    await clock.advance(128000);
    expect(server.calls).toHaveLength(1);       // not before retryAfter
    await clock.advance(2000);
    expect(server.calls).toHaveLength(2);
    expect(server.calls[1]).toMatchObject({ position: 1, answer: 'A' });
    expect(q.size()).toBe(0);
    expect(statuses[statuses.length - 1].state).toBe('idle');
  });

  test('a 429 pauses EVERY save, and each queued answer still lands once', async () => {
    const clock = fakeClock();
    const server = fakeServer([{ status: 429, body: { retryAfter: 10 } }]);
    const { q } = make(server, clock);
    q.enqueue(entry(1, 'A'));
    await flushMicrotasks();
    q.enqueue(entry(2, 'B'));
    q.enqueue(entry(3, 'C'));
    await flushMicrotasks();
    expect(server.calls.map((c) => c.position)).toEqual([1]);   // 2 and 3 held back
    await clock.advance(10000);
    expect(server.calls.map((c) => c.position).sort()).toEqual([1, 1, 2, 3]);
    expect(q.size()).toBe(0);
  });

  test('network errors and 5xx back off exponentially and never drop the answer', async () => {
    const clock = fakeClock();
    const server = fakeServer([{ status: 0, body: null }, { status: 503, body: {} }, { status: 500, body: {} }]);
    const { q } = make(server, clock, { baseDelayMs: 1000 });
    q.enqueue(entry(7, 'D'));
    await flushMicrotasks();
    expect(server.calls).toHaveLength(1);
    await clock.advance(1000);                   // 1s
    expect(server.calls).toHaveLength(2);
    await clock.advance(1999);                   // 2s backoff not yet up
    expect(server.calls).toHaveLength(2);
    await clock.advance(1);
    expect(server.calls).toHaveLength(3);
    await clock.advance(4000);                   // 4s
    expect(server.calls).toHaveLength(4);
    expect(q.size()).toBe(0);
  });

  test('a send that throws is treated as a network error, not lost', async () => {
    const clock = fakeClock();
    let n = 0;
    const calls = [];
    const send = (e) => { calls.push(e); n += 1; if (n === 1) throw new Error('offline'); return Promise.resolve({ status: 200, body: {} }); };
    const { q } = make({ send }, clock);
    q.enqueue(entry(2, 'A'));
    await flushMicrotasks();
    await clock.advance(1000);
    expect(calls).toHaveLength(2);
    expect(q.size()).toBe(0);
  });

  test('a newer change made while a save is retrying replaces it (latest wins)', async () => {
    const clock = fakeClock();
    const server = fakeServer([{ status: 429, body: { retryAfter: 5 } }]);
    const { q } = make(server, clock);
    q.enqueue(entry(4, 'A', { seq: 1 }));
    await flushMicrotasks();
    q.enqueue(entry(4, 'C', { seq: 2 }));
    await clock.advance(5000);
    expect(server.calls.map((c) => [c.answer, c.seq])).toEqual([['A', 1], ['C', 2]]);
    expect(q.size()).toBe(0);
  });

  test('a definitive refusal (409 time up) is dropped and reported, not retried', async () => {
    const clock = fakeClock();
    const server = fakeServer([{ status: 409, body: { message: 'Time is up.', timeUp: true } }]);
    const { q, terminal } = make(server, clock);
    q.enqueue(entry(9, 'B'));
    await flushMicrotasks();
    await clock.advance(60000);
    expect(server.calls).toHaveLength(1);
    expect(terminal).toHaveLength(1);
    expect(terminal[0].body.timeUp).toBe(true);
    expect(q.size()).toBe(0);
  });
});

describe('flush before /complete and /next-module', () => {
  test('resolves true once queued saves have landed', async () => {
    const clock = fakeClock();
    const server = fakeServer([{ status: 429, body: { retryAfter: 3 } }]);
    const { q } = make(server, clock);
    q.enqueue(entry(1, 'A'));
    await flushMicrotasks();
    let done = null;
    q.flush({ timeoutMs: 20000 }).then((v) => { done = v; });
    await flushMicrotasks();
    expect(done).toBe(null);                     // still waiting on the 429 pause
    await clock.advance(3000);
    expect(done).toBe(true);
    expect(server.calls).toHaveLength(2);
  });

  test('skips a backoff pause (try now) and resolves when it lands', async () => {
    const clock = fakeClock();
    const server = fakeServer([{ status: 503, body: {} }, { status: 503, body: {} }, { status: 503, body: {} }]);
    const { q } = make(server, clock, { baseDelayMs: 1000 });
    q.enqueue(entry(1, 'A'));
    await flushMicrotasks();
    await clock.advance(1000);
    await clock.advance(2000);                   // three failures: next backoff is 4s
    expect(server.calls).toHaveLength(3);
    let done = null;
    q.flush({ timeoutMs: 20000 }).then((v) => { done = v; });
    await flushMicrotasks();
    expect(server.calls).toHaveLength(4);        // sent immediately, not after 4s
    expect(done).toBe(true);
  });

  test('gives up at the timeout instead of hanging the submit', async () => {
    const clock = fakeClock();
    const server = fakeServer([{ status: 429, body: { retryAfter: 120 } }]);
    const { q } = make(server, clock);
    q.enqueue(entry(1, 'A'));
    await flushMicrotasks();
    let done = null;
    q.flush({ timeoutMs: 6000 }).then((v) => { done = v; });
    await clock.advance(6000);
    expect(done).toBe(false);
  });

  test('an empty queue flushes at once', async () => {
    const clock = fakeClock(); const server = fakeServer();
    const { q } = make(server, clock);
    await expect(q.flush({ timeoutMs: 10 })).resolves.toBe(true);
  });

  test('60 rapid changes across a 44-question module all land, each question once with its last answer', async () => {
    const clock = fakeClock();
    // A burst of 429s mid-run, like the prod repro.
    const script = [];
    for (let i = 0; i < 60; i++) script.push(i % 7 === 3 ? { status: 429, body: { retryAfter: 2 } } : { status: 200, body: { saved: true } });
    const server = fakeServer(script);
    const { q } = make(server, clock);
    const finalAnswer = new Map();
    for (let i = 0; i < 60; i++) {
      const pos = (i % 44) + 1;
      const ans = 'ABCD'[i % 4];
      finalAnswer.set(pos, ans);
      q.enqueue(entry(pos, ans, { seq: i + 1 }));
      await clock.advance(1000);                 // ~1 question a second
    }
    let done = null;
    q.flush({ timeoutMs: 20000 }).then((v) => { done = v; });
    await clock.advance(20000);
    expect(done).toBe(true);
    // The last call per position carries the final answer.
    const last = new Map();
    server.calls.forEach((c) => last.set(c.position, c.answer));
    expect(last).toEqual(finalAnswer);
  });
});

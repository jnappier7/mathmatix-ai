// tests/unit/cleverApi.test.js
// Unit tests for services/cleverApi.js — Clever REST helpers

// Mock node:https BEFORE requiring the module under test.
jest.mock('https', () => {
  const { EventEmitter } = require('events');

  // The mock exposes a `__queue` of upcoming responses via .__respond(...)
  const queue = [];
  let getMock;

  function get(_url, _opts, cb) {
    const req = new EventEmitter();
    req.destroy = jest.fn();
    req.setTimeout = jest.fn();

    process.nextTick(() => {
      const next = queue.shift();
      if (!next) {
        req.emit('error', new Error('https mock: no response queued'));
        return;
      }
      if (next.kind === 'error') {
        req.emit('error', next.error);
        return;
      }
      const res = new EventEmitter();
      res.statusCode = next.statusCode;
      cb(res);
      // emit data + end
      if (next.body) res.emit('data', Buffer.from(next.body));
      res.emit('end');
    });

    return req;
  }

  return {
    get: jest.fn(get),
    __queue: queue,
    __respond(payload) { queue.push({ kind: 'ok', ...payload }); },
    __respondError(err) { queue.push({ kind: 'error', error: err }); },
    __reset() { queue.length = 0; }
  };
});

const https = require('https');
const cleverApi = require('../../services/cleverApi');

beforeEach(() => {
  https.__reset();
  https.get.mockClear();
});

describe('cleverGet', () => {
  test('resolves parsed JSON for 2xx responses', async () => {
    https.__respond({ statusCode: 200, body: JSON.stringify({ data: { id: 'abc' } }) });
    const r = await cleverApi.cleverGet('/me', 'token-xyz');
    expect(r).toEqual({ data: { id: 'abc' } });
    // verify URL + auth header passed correctly
    const [url, opts] = https.get.mock.calls[0];
    expect(url).toBe('https://api.clever.com/v3.0/me');
    expect(opts.headers.Authorization).toBe('Bearer token-xyz');
  });

  test('rejects with status code on 4xx/5xx', async () => {
    https.__respond({ statusCode: 401, body: JSON.stringify({ message: 'unauthorized' }) });
    await expect(cleverApi.cleverGet('/me', 'bad')).rejects.toMatchObject({
      status: 401,
      message: expect.stringMatching(/401/)
    });
  });

  test('rejects on network error', async () => {
    https.__respondError(new Error('ECONNRESET'));
    await expect(cleverApi.cleverGet('/me', 't')).rejects.toThrow(/ECONNRESET/);
  });

  test('rejects on malformed JSON body', async () => {
    https.__respond({ statusCode: 200, body: '{not-json' });
    await expect(cleverApi.cleverGet('/me', 't')).rejects.toThrow(/parse/i);
  });
});

describe('cleverGetAll — pagination', () => {
  test('collects items across multiple pages', async () => {
    https.__respond({
      statusCode: 200,
      body: JSON.stringify({
        data: [{ id: 1 }, { id: 2 }],
        links: [{ rel: 'next', uri: 'https://api.clever.com/v3.0/sections/A/students?page=2' }]
      })
    });
    https.__respond({
      statusCode: 200,
      body: JSON.stringify({
        data: [{ id: 3 }],
        links: [] // last page
      })
    });

    const items = await cleverApi.cleverGetAll('/sections/A/students', 'token');
    expect(items).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(https.get).toHaveBeenCalledTimes(2);
  });

  test('handles empty data array', async () => {
    https.__respond({ statusCode: 200, body: JSON.stringify({ data: [], links: [] }) });
    expect(await cleverApi.cleverGetAll('/x', 't')).toEqual([]);
  });

  test('handles missing links field gracefully', async () => {
    https.__respond({ statusCode: 200, body: JSON.stringify({ data: [{ id: 1 }] }) });
    expect(await cleverApi.cleverGetAll('/x', 't')).toEqual([{ id: 1 }]);
  });
});

describe('high-level helpers all use cleverGet under the hood', () => {
  test.each([
    ['getMe', ['t'], '/me'],
    ['getUserData', ['student', 'abc', 't'], '/students/abc'],
    ['getSection', ['xyz', 't'], '/sections/xyz']
  ])('%s hits the right path', async (fn, args, path) => {
    https.__respond({ statusCode: 200, body: JSON.stringify({ data: {} }) });
    await cleverApi[fn](...args);
    expect(https.get.mock.calls[0][0]).toBe(`https://api.clever.com/v3.0${path}`);
  });

  test.each([
    ['getTeacherSections', ['t1', 'tok'], '/teachers/t1/sections'],
    ['getStudentSections', ['s1', 'tok'], '/students/s1/sections'],
    ['getSectionStudents', ['sec1', 'tok'], '/sections/sec1/students'],
    ['getSectionTeachers', ['sec1', 'tok'], '/sections/sec1/teachers'],
    ['getDistrictSchools', ['d1', 'tok'], '/districts/d1/schools'],
    ['getSchoolSections', ['sch1', 'tok'], '/schools/sch1/sections']
  ])('%s paginates from the right path', async (fn, args, path) => {
    https.__respond({ statusCode: 200, body: JSON.stringify({ data: [{ id: 1 }], links: [] }) });
    const r = await cleverApi[fn](...args);
    expect(https.get.mock.calls[0][0]).toBe(`https://api.clever.com/v3.0${path}`);
    expect(r).toEqual([{ id: 1 }]);
  });
});

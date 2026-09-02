/**
 * Sentry must not receive personal data from a child-directed service.
 *
 * THE BUG THIS CATCHES: instrument.js shipped with `sendDefaultPii: true`. That
 * single flag attached the request's cookies (the session id), its headers, its
 * body and the client IP to every captured 5xx — and the body of a chat request
 * is a student's message. No privacy notice disclosed Sentry as a recipient of
 * any of that, and no test would have failed if the flag were flipped back on.
 *
 * Two layers, both pinned:
 *   1. The flag is off in instrument.js (a config string — asserting on the file
 *      is the only check possible, since an initialised Sentry client cannot be
 *      inspected for this and the file loads before every other module).
 *   2. beforeSend scrubs whatever still arrives, so a future integration that
 *      re-attaches request data is caught at the door rather than shipped.
 *
 * public/subprocessors.html states what Sentry receives. If this test changes,
 * that page changes with it.
 */

const fs = require('fs');
const path = require('path');
const { scrubEvent, isSensitiveKey } = require('../../utils/sentryScrub');

const instrument = fs.readFileSync(path.join(__dirname, '..', '..', 'instrument.js'), 'utf8');

describe('instrument.js configuration', () => {
    test('sendDefaultPii is off', () => {
        expect(instrument).toMatch(/sendDefaultPii:\s*false/);
        expect(instrument).not.toMatch(/sendDefaultPii:\s*true/);
    });

    test('beforeSend is wired to the scrubber', () => {
        expect(instrument).toMatch(/beforeSend:\s*scrubEvent/);
        expect(instrument).toMatch(/require\('\.\/utils\/sentryScrub'\)/);
    });
});

describe('scrubEvent', () => {
    function event() {
        return {
            message: 'boom',
            request: {
                url: 'https://www.mathmatix.ai/api/chat',
                method: 'POST',
                cookies: { 'connect.sid': 's:abc.def' },
                headers: { authorization: 'Bearer x', cookie: 'connect.sid=abc' },
                data: { message: 'my name is Ada and I am stuck on 2x+3=7' },
                query_string: 'debug=1',
                env: { REMOTE_ADDR: '203.0.113.9' },
            },
            user: { id: '64f0', email: 'ada@example.com', username: 'ada', ip_address: '203.0.113.9' },
            extra: {
                hint: 'Rotate the OAuth secret',
                studentMessage: 'help me',
                nested: { transcript: 'hello', count: 3 },
            },
            contexts: { runtime: { name: 'node' }, chat: { prompt: 'system prompt here' } },
            tags: { area: 'oauth', email: 'x@y.z' },
            breadcrumbs: [
                { category: 'http', data: { url: '/api/chat', body: '{"message":"hi"}' } },
                { category: 'console', message: 'ok' },
            ],
        };
    }

    test('drops request cookies, headers, body, query string and env', () => {
        const out = scrubEvent(event());
        expect(out.request.cookies).toBeUndefined();
        expect(out.request.headers).toBeUndefined();
        expect(out.request.data).toBeUndefined();
        expect(out.request.query_string).toBeUndefined();
        expect(out.request.env).toBeUndefined();
    });

    test('keeps the route — an engineer still needs to know where it broke', () => {
        const out = scrubEvent(event());
        expect(out.request.url).toBe('https://www.mathmatix.ai/api/chat');
        expect(out.request.method).toBe('POST');
    });

    test('keeps only the user id', () => {
        const out = scrubEvent(event());
        expect(out.user).toEqual({ id: '64f0' });
    });

    test('redacts sensitive keys in extra, contexts and tags, leaving others', () => {
        const out = scrubEvent(event());
        expect(out.extra.hint).toBe('Rotate the OAuth secret');
        expect(out.extra.studentMessage).toBe('[redacted]');
        expect(out.extra.nested.transcript).toBe('[redacted]');
        expect(out.extra.nested.count).toBe(3);
        expect(out.contexts.runtime.name).toBe('[redacted]'); // "name" is a person field
        expect(out.contexts.chat.prompt).toBe('[redacted]');
        expect(out.tags.area).toBe('oauth');
        expect(out.tags.email).toBe('[redacted]');
    });

    test('redacts breadcrumb data without dropping the breadcrumb', () => {
        const out = scrubEvent(event());
        expect(out.breadcrumbs).toHaveLength(2);
        expect(out.breadcrumbs[0].data.body).toBe('[redacted]');
        expect(out.breadcrumbs[0].data.url).toBe('/api/chat');
        expect(out.breadcrumbs[1].message).toBe('ok');
    });

    test('never drops the event — a scrubbed report is still a report', () => {
        expect(scrubEvent(event())).toBeTruthy();
        expect(scrubEvent({ message: 'bare' })).toEqual({ message: 'bare' });
    });

    test('tolerates malformed input', () => {
        expect(scrubEvent(null)).toBeNull();
        expect(scrubEvent(undefined)).toBeUndefined();
        expect(scrubEvent({ request: 'not-an-object', user: 42 })).toEqual({ request: 'not-an-object', user: 42 });
    });

    test('isSensitiveKey matches the fields that would identify or quote a person', () => {
        for (const k of ['message', 'studentMessage', 'Email', 'ip_address', 'cookie', 'AUTHORIZATION', 'prompt', 'transcript']) {
            expect(isSensitiveKey(k)).toBe(true);
        }
        for (const k of ['status', 'route', 'area', 'count', 'durationMs', 'hint']) {
            expect(isSensitiveKey(k)).toBe(false);
        }
    });
});

// tests/unit/sentryInstrumentation.test.js
//
// Sentry.init() lives ONLY in instrument.js, which is loaded via `node --require
// ./instrument.js`. For ~the whole life of the Docker deploy the image's CMD was
// a bare `node server.js`, so instrument.js never loaded, Sentry never
// initialized, and every captureException in the app was a silent no-op. Nothing
// failed, nothing logged — production simply had no error telemetry.
//
// There is no runtime code path that can catch this (an uninitialized Sentry
// client swallows calls by design), and the artifact under test is a config
// string, so asserting on the file contents is the appropriate check here.

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(repoRoot, p), 'utf8');

describe('Sentry instrumentation wiring', () => {
    test('instrument.js calls Sentry.init()', () => {
        expect(read('instrument.js')).toMatch(/Sentry\.init\(/);
    });

    test('Dockerfile CMD preloads instrument.js', () => {
        // Must be the top-level CMD at column 0 — HEALTHCHECK has its own indented
        // `CMD` sub-clause that would otherwise match first.
        const cmdLine = read('Dockerfile')
            .split('\n')
            .find((l) => /^CMD\b/.test(l));

        expect(cmdLine).toBeDefined();
        expect(cmdLine).toContain('--require');
        expect(cmdLine).toContain('./instrument.js');
        expect(cmdLine).toContain('server.js');
    });

    test('npm start preloads instrument.js', () => {
        const { scripts } = JSON.parse(read('package.json'));
        expect(scripts.start).toContain('--require ./instrument.js');
    });

    test('cron dockerCommands in render.yaml preload instrument.js', () => {
        const cronCommands = read('render.yaml')
            .split('\n')
            .filter((l) => l.includes('dockerCommand:') && l.includes('scripts/'));

        // Both crons (weekly digest, conversation archival) must be covered.
        expect(cronCommands.length).toBeGreaterThanOrEqual(2);
        cronCommands.forEach((line) => {
            expect(line).toContain('--require ./instrument.js');
        });
    });
});

describe('production log level', () => {
    // 'http' (3) is less severe than 'info' (2). Winston filters by the logger's
    // level before transports see a record, so at 'info' every log.http() call —
    // the entire request logger — was dropped in production.
    test('logger emits http-level records in production', () => {
        expect(read('utils/logger.js')).toMatch(/isDevelopment \? 'debug' : 'http'/);
    });
});

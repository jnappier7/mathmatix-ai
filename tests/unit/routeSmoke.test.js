/**
 * Route smoke test — every module under routes/ and services/ must LOAD.
 *
 * Origin: #1343 shipped routes/growthCheck.js calling a function it never
 * required. Source-pin tests read the file; nothing executed it, so every
 * growth-check endpoint 500'd in production until hotfix #1347.
 *
 * The probe runs in a CHILD PROCESS (tests/support/requireAllRoutes.js), not
 * in jest's own module registry — requiring all 77 route files inside jest
 * hung the runner indefinitely; a child process finishes in seconds and gets
 * a hard timeout. On failure, the child's last REQ line names the culprit.
 *
 * The env below mirrors tests/setup.js plus the OAuth vars passport's
 * strategies demand at construction time. Placeholders only — nothing here
 * makes a network call at require time.
 */
const { execFileSync } = require('child_process');
const path = require('path');

const PROBE = path.join(__dirname, '../support/requireAllRoutes.js');

const STUB_ENV = {
  ...process.env,
  NODE_ENV: 'test',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'test_openai_key',
  MATHPIX_APP_ID: process.env.MATHPIX_APP_ID || 'test_mathpix_id',
  MATHPIX_APP_KEY: process.env.MATHPIX_APP_KEY || 'test_mathpix_key',
  SESSION_SECRET: process.env.SESSION_SECRET || 'test_session_secret',
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/mathmatix-test',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || 'test_google_id',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || 'test_google_secret',
  MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID || 'test_ms_id',
  MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET || 'test_ms_secret',
};

test('every routes/ and services/ module requires cleanly', () => {
  let out;
  try {
    out = execFileSync(process.execPath, [PROBE], {
      env: STUB_ENV,
      timeout: 120_000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stdout = (err.stdout || '').toString();
    const stderr = (err.stderr || '').toString();
    const lastReq = stdout.split('\n').filter((l) => l.startsWith('REQ ')).pop() || '(none reached)';
    throw new Error(
      `Route boot probe failed while loading: ${lastReq.replace('REQ ', '')}\n\n${stderr.slice(-2000)}`
    );
  }
  expect(out).toContain('ALL DONE');
}, 150_000);

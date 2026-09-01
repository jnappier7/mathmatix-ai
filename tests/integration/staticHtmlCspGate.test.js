/**
 * The static/HTML seam in config/middleware.js.
 *
 * Origin: the "skip HTML" gate was mounted as app.use(gate, express.static(...)).
 * Inside a single app.use() stack, the gate's next() advances to the NEXT
 * handler in that same stack — express.static — so *.html requests were served
 * statically after all, bypassing session, the CSP-nonce sendFile wrapper, and
 * helmet entirely. Verified in prod: /quiz.html shipped with no
 * Content-Security-Policy header while /quiz (route-served) had one. Since most
 * internal links use .html paths, most of the site had no CSP.
 *
 * The fix invokes the static handler from INSIDE the gate, so "skip" means
 * skip. This suite pins the contract from both sides:
 *   - GET *.html falls through static into the full pipeline: helmet's CSP
 *     header is present, inline scripts get nonces, PWA tags are injected.
 *   - Non-HTML static assets are still served early with their cache headers.
 *
 * registerRoutes() is NOT used here — requiring config/routes.js pulls all 77
 * route modules and hangs jest (see tests/unit/routeSmoke.test.js). The seam
 * under test lives entirely in configureMiddleware + the res.sendFile wrapper,
 * so a single stand-in route (mirroring config/routes.js's sendHtml) suffices.
 */

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test_session_secret';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test_google_id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test_google_secret';
process.env.MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || 'test_ms_id';
process.env.MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || 'test_ms_secret';

const path = require('path');
const supertest = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { closeSessionStore } = require('../helpers/closeSessionStore');

let mem;
let app;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  process.env.MONGO_URI = mem.getUri();

  const express = require('express');
  const { configureMiddleware } = require('../../config/middleware');

  app = express();
  configureMiddleware(app);

  // Stand-in for config/routes.js's sendHtml routes / .html catch-all: if the
  // request reaches this handler, it survived the static layer and went
  // through the whole pipeline (session → CSP nonce wrapper → helmet → CSRF).
  const publicDir = path.join(__dirname, '..', '..', 'public');
  app.get('/quiz.html', (req, res) => res.sendFile(path.join(publicDir, 'quiz.html')));
});

afterAll(async () => {
  // See tests/helpers/closeSessionStore.js for what this is avoiding: the
  // store's own constructor leaves a floating `collectionP` (connect +
  // createIndex) that nothing here ever awaits, and closing the client on top
  // of it produces an unhandled rejection Jest fails the whole file on.
  //
  // This replaced a fixed 250ms sleep whose stated reason — "let in-flight
  // rate-limiter/session writes settle" — was wrong twice over: every rate
  // limiter in this app uses express-rate-limit's default in-memory store, and
  // `saveUninitialized: false` means these unauthenticated GETs never write a
  // session at all. The only in-flight Mongo work was connect-mongo's own, so
  // awaiting it is both exact and faster than betting on a timer.
  await closeSessionStore(app?.locals?.sessionStore);
  if (mem) await mem.stop();
});

describe('GET *.html — must reach the CSP pipeline, not express.static', () => {
  it('serves quiz.html with a Content-Security-Policy header', async () => {
    const res = await supertest(app).get('/quiz.html').expect(200);
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['content-security-policy']).toContain("'nonce-");
  });

  it('injects the CSP nonce into inline scripts and the nonce matches the header', async () => {
    const res = await supertest(app).get('/quiz.html').expect(200);
    const headerNonce = res.headers['content-security-policy'].match(/'nonce-([^']+)'/)?.[1];
    expect(headerNonce).toBeTruthy();
    expect(res.text).toContain(`<script nonce="${headerNonce}"`);
    // No inline script left bare (the raw file has an attribute-less <script> block)
    expect(res.text).not.toContain('<script>');
  });

  it('injects the PWA tags (manifest + service-worker bootstrap)', async () => {
    const res = await supertest(app).get('/quiz.html').expect(200);
    expect(res.text).toContain('rel="manifest"');
    expect(res.text).toContain('pwa-register.js');
  });

  it('HEAD *.html sees the same pipeline (curl -I is how CSP gets audited)', async () => {
    // express.static serves HEAD too — a GET-only gate leaks HEAD to static,
    // which is exactly the request header audits make.
    const res = await supertest(app).head('/quiz.html').expect(200);
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['cache-control']).not.toBe('public, max-age=86400');
  });

  it('a .html path with no route 404s instead of being served statically', async () => {
    // offline.html exists on disk but has no route in this test app; before the
    // fix express.static would happily serve it (with no CSP header).
    const res = await supertest(app).get('/offline.html').expect(404);
    expect(res.headers['content-security-policy']).toBeDefined();
  });
});

describe('non-HTML static assets — still served early with cache headers', () => {
  it('serves CSS with the 7-day cache header', async () => {
    const res = await supertest(app).get('/css/pwa.css').expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=604800');
  });

  it('serves the PWA bootstrap script with no-cache', async () => {
    const res = await supertest(app).get('/js/pwa-register.js').expect(200);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('never serves files for /api/* paths', async () => {
    // Path traversal-ish probe: /api/ requests must not fall into static
    await supertest(app).get('/api/quiz.html').expect(404);
  });
});

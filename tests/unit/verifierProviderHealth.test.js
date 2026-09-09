/**
 * The answer verifier can stop being a cross-check WITHOUT anything failing.
 *
 * THE FAILURE THIS PINS, seen in production 2026-09-08: the Anthropic account's
 * balance ran out. The key was present and valid, so every key-presence check
 * stayed green. Every verifier call took a terminal 400 (isTransientError
 * treats 4xx as terminal on purpose, so openaiClient does not fail it over),
 * verifierCall caught it and retried on VERIFIER_FALLBACK_MODEL — which is
 * gpt-4o-mini, the SAME model as TUTOR_MODEL. So the model grading the tutor's
 * answer became the model that wrote it.
 *
 * Nothing threw. No verdict changed shape. Grading kept happening. The entire
 * trace was one console.error per call, and /api/health did not mention
 * Anthropic at all — so the cross-check the design exists to provide was gone
 * for an unknown length of time and no surface said so.
 *
 * Three things had to be true for that to be invisible, and this file covers
 * all three:
 *   1. Nothing recorded the fallback anywhere a human or a monitor could read.
 *   2. /api/health watched OPENAI and MATHPIX but not ANTHROPIC.
 *   3. The admin dashboard's System Status panel could not report a problem at
 *      all: /api/admin/health-check returned the literal string 'Operational'
 *      and the client wrote 'Online' for the database on any successful fetch.
 *
 * The one thing this must NOT do is turn a degraded verifier into an outage.
 * Render polls /api/health and stops routing to a 503, so 'degraded' has to
 * stay a 200 — asserted below, because the tempting "make it louder" edit is
 * exactly the one that would take the site down over a grading regression.
 */

const fs = require('fs');
const path = require('path');

const verifyMetrics = require('../../utils/verifyMetrics');
const healthReport = require('../../utils/healthReport');

const REPO = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

beforeEach(() => verifyMetrics.reset());

// ============================================================================
// 1. The state machine
// ============================================================================
//
// Lives in tests/unit/verifyMetrics.test.js, not here. utils/verifyMetrics.js is
// in the critical-coverage set (jest.critical.config.js holds it to 99/92/100/99
// and runs a CURATED list of test files), so state-machine coverage has to sit
// in a file that gate actually runs — this one also source-scans HTML and mocks
// the LLM gateway, which does not belong in a math-critical gate.

// ============================================================================
// 2. The wiring — state nobody sets is worth nothing
// ============================================================================

describe('verifierCall reports what it did', () => {
  // Isolated registry: llmGateway is mocked, so the verifier's own calls land
  // on the mock while verifyMetrics stays real — the point is the wiring.
  let verifierCall; let VERIFIER_MODEL; let VERIFIER_FALLBACK_MODEL; let ESCALATION_MODEL;
  let metrics; let callLLM;

  const apiError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });
  const OK = { choices: [{ message: { content: '{"matches":true}' } }] };

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../utils/llmGateway', () => ({ callLLM: jest.fn() }));
    ({ callLLM } = require('../../utils/llmGateway'));
    ({
      verifierCall, VERIFIER_MODEL, VERIFIER_FALLBACK_MODEL, ESCALATION_MODEL,
    } = require('../../utils/pipeline/llmVerifier'));
    metrics = require('../../utils/verifyMetrics');
    metrics.reset();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test('a terminal 4xx on Claude is recorded, not just logged', async () => {
    callLLM.mockRejectedValueOnce(apiError(400)).mockResolvedValueOnce(OK);
    await verifierCall(VERIFIER_MODEL, [], {});
    const cp = metrics.crossProviderHealth();
    expect(cp.degraded).toBe(true);
    expect(cp.fallbacks).toBe(1);
    expect(cp.lastFallbackStatus).toBe(400);
  });

  test('the fallback still happens — observability must not change behaviour', async () => {
    callLLM.mockRejectedValueOnce(apiError(400)).mockResolvedValueOnce(OK);
    await expect(verifierCall(VERIFIER_MODEL, [], {})).resolves.toBe(OK);
    expect(callLLM.mock.calls[1][0]).toBe(VERIFIER_FALLBACK_MODEL);
  });

  test('a healthy Claude call clears a previous fallback', async () => {
    callLLM.mockRejectedValueOnce(apiError(400)).mockResolvedValueOnce(OK);
    await verifierCall(VERIFIER_MODEL, [], {});
    expect(metrics.crossProviderHealth().degraded).toBe(true);

    callLLM.mockResolvedValueOnce(OK);
    await verifierCall(VERIFIER_MODEL, [], {});
    expect(metrics.crossProviderHealth().degraded).toBe(false);
  });

  test('a successful call on an OpenAI model does NOT clear it', async () => {
    // The escalation tier is gpt-4o and the fallback is gpt-4o-mini. Either
    // succeeding says nothing about whether Claude is reachable — treating it
    // as recovery would paint the panel green in exactly the state the panel
    // exists to report.
    metrics.noteCrossProviderFallback({ status: 400 });
    callLLM.mockResolvedValueOnce(OK);
    await verifierCall(ESCALATION_MODEL, [], {});
    expect(metrics.crossProviderHealth().degraded).toBe(true);
  });

  test('a 429 does not mark degraded — it is rate limiting, not a lost cross-check', async () => {
    callLLM.mockRejectedValueOnce(apiError(429));
    await expect(verifierCall(VERIFIER_MODEL, [], {})).rejects.toThrow('HTTP 429');
    expect(metrics.crossProviderHealth().degraded).toBe(false);
  });

  test('a 5xx does not mark degraded either — openaiClient already fails those over', async () => {
    callLLM.mockRejectedValueOnce(apiError(503));
    await expect(verifierCall(VERIFIER_MODEL, [], {})).rejects.toThrow('HTTP 503');
    expect(metrics.crossProviderHealth().degraded).toBe(false);
  });
});

// ============================================================================
// 3. What the endpoints report
// ============================================================================

describe('healthReport', () => {
  const KEYS = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'MATHPIX_APP_ID', 'MATHPIX_APP_KEY'];
  let saved;
  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    for (const k of KEYS) process.env[k] = 'set';
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  test('watches Anthropic, which is the whole reason this exists', () => {
    expect(healthReport.providerKeys()).toHaveProperty('anthropic', 'ok');
    delete process.env.ANTHROPIC_API_KEY;
    expect(healthReport.providerKeys().anthropic).toBe('missing');
  });

  test('Anthropic is REQUIRED, not merely reported', () => {
    // TUTOR_MODEL being an OpenAI id does not make Anthropic optional:
    // llmVerifier's tier 1 is hard-pinned to Claude and never reads TUTOR_MODEL.
    expect(healthReport.REQUIRED_KEYS).toContain('anthropic');
    delete process.env.ANTHROPIC_API_KEY;
    expect(healthReport.missingRequiredKeys()).toContain('anthropic');
    expect(healthReport.isDegraded({ dbConnected: true })).toBe(true);
  });

  test('Mathpix is reported but does not degrade — OCR is not tutoring', () => {
    delete process.env.MATHPIX_APP_ID;
    expect(healthReport.providerKeys().mathpix).toBe('missing');
    expect(healthReport.isDegraded({ dbConnected: true })).toBe(false);
  });

  test('a live verifier fallback degrades even with every key present', () => {
    // The exact production case: nothing is misconfigured, the balance is empty.
    expect(healthReport.isDegraded({ dbConnected: true })).toBe(false);
    verifyMetrics.noteCrossProviderFallback({ status: 400, message: 'credit balance is too low' });
    expect(healthReport.isDegraded({ dbConnected: true })).toBe(true);
  });

  test('a disconnected database degrades', () => {
    expect(healthReport.isDegraded({ dbConnected: false })).toBe(true);
  });

  test('reports lastOkAt, the only field that separates recovered from restarted', () => {
    // Without it, `degraded: false` covers two states that mean opposite things:
    // a verifier that came back, and a process that has not asked yet. Both
    // rendered as "Cross-checked", so every deploy showed the most reassuring
    // label on the least evidence.
    verifyMetrics.noteCrossProviderFallback({ status: 400 });
    verifyMetrics.noteCrossProviderOk();
    const r = healthReport.verifierReport();
    expect(r.lastOkAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.status).toBe('ok');
    // The history survives, so "recovered" is distinguishable from "never broke".
    expect(r.fallbacks).toBe(1);
  });

  test('a fresh process is unconfirmed, not ok', () => {
    const r = healthReport.verifierReport();
    expect(r.lastOkAt).toBeNull();
    expect(r.degraded).toBe(false);
    expect(r.status).toBe('unconfirmed');
  });

  test('unconfirmed does not degrade the instance — nothing has asked yet', () => {
    // It has to stay a 200 and a healthy instance: every deploy passes through
    // this state, and it clears on the first graded answer because llmVerifier
    // step 1 is a tier-1 call on every attempt (the CAS only replaces step 2).
    expect(healthReport.verifierReport().status).toBe('unconfirmed');
    expect(healthReport.isDegraded({ dbConnected: true })).toBe(false);
  });

  test('a degraded verifier stays degraded even before any success', () => {
    // Ordering matters: the fallback check must win over the "no lastOkAt yet"
    // check, or a first-call failure would report as merely unconfirmed.
    verifyMetrics.noteCrossProviderFallback({ status: 400 });
    expect(healthReport.verifierReport().lastOkAt).toBeNull();
    expect(healthReport.verifierReport().status).toBe('degraded');
  });

  test('the public report withholds the provider error prose', () => {
    // /api/health is unauthenticated; the message is third-party text.
    verifyMetrics.noteCrossProviderFallback({ status: 400, message: 'credit balance is too low' });
    const pub = healthReport.verifierReport();
    expect(pub.status).toBe('degraded');
    expect(pub.crossProvider).toBe('fallback');
    expect(pub).not.toHaveProperty('lastFallbackMessage');
    expect(pub).not.toHaveProperty('unverifiableRate');
  });

  test('the admin report carries the reason and the rate', () => {
    verifyMetrics.noteCrossProviderFallback({ status: 400, message: 'credit balance is too low' });
    const admin = healthReport.verifierReport({ includeDetail: true });
    expect(admin.lastFallbackMessage).toBe('credit balance is too low');
    expect(admin).toHaveProperty('unverifiableRate');
    expect(admin).toHaveProperty('sampleSize');
  });

  test('timestamps go out as ISO strings, not epoch millis', () => {
    verifyMetrics.noteCrossProviderFallback({ status: 400 });
    expect(healthReport.verifierReport().lastFallbackAt)
      .toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ============================================================================
// 4. Degraded must never become an outage
// ============================================================================

describe('/api/health keeps serving while degraded', () => {
  const src = read('config/routes.js');

  test('only "unhealthy" and the lifecycle gate answer 503', () => {
    // Render stops routing to a 503. A verifier that has lost its independence
    // is a quality regression, not a reason to remove a working instance from
    // the pool — the "make it louder" edit here is the one that causes an
    // outage, so the mapping is pinned.
    expect(src).toMatch(/httpStatus\s*=\s*status === 'unhealthy' \? 503 : 200/);
    expect(src).toMatch(/if \(!lifecycle\.isAcceptingTraffic\(\)\)/);
  });

  test('the verifier sets degraded, never unhealthy', () => {
    const block = src.slice(src.indexOf('healthReport.isDegraded'), src.indexOf('checks.memory'));
    expect(block).toMatch(/status = 'degraded'/);
    expect(block).not.toMatch(/unhealthy/);
  });

  test('both endpoints read the same module, so they cannot drift apart', () => {
    // They already had: this one watched OpenAI and Mathpix, the admin one
    // returned a constant, and neither watched Anthropic.
    expect(src).toMatch(/healthReport\.providerKeys\(\)/);
    expect(src).toMatch(/healthReport\.verifierReport\(/);
    expect(read('routes/admin.js')).toMatch(/healthReport\.providerKeys\(\)/);
    expect(read('routes/admin.js')).toMatch(/healthReport\.verifierReport\(\{ includeDetail: true \}\)/);
  });

  test('the admin endpoint no longer answers with a constant', () => {
    const admin = read('routes/admin.js');
    const handler = admin.slice(admin.indexOf("router.get('/health-check'"));
    const body = handler.slice(0, handler.indexOf('\n});'));
    expect(body).not.toMatch(/status: 'Operational',\s*\n\s*timestamp/);
    expect(body).toMatch(/isDegraded/);
  });
});

// ============================================================================
// 5. The surfaces — a number nobody looks at is not observability
// ============================================================================

describe('the admin dashboard panel reports what it measured', () => {
  const js = read('public/js/admin-dashboard.js');
  const html = read('public/admin-dashboard.html');

  test('the database line is no longer hardcoded Online on any 200', () => {
    // The old client set 'Online' whenever the fetch resolved, and the endpoint
    // never looked at Mongo. The panel could not report a database problem.
    expect(js).not.toMatch(/dbStatus\.textContent = 'Online'/);
    expect(js).toMatch(/data\.database\?\.connected/);
  });

  test('both the initial load and the poller paint through one renderer', () => {
    // Two copies of the painting logic is how the poll used to overwrite
    // whatever the first render had learned with a hardcoded 'Online'.
    expect(js.match(/function renderSystemStatus/g)).toHaveLength(1);
    expect(js.match(/renderSystemStatus\(/g).length).toBeGreaterThanOrEqual(3);
  });

  test('the verifier and the unverifiable rate have somewhere to render', () => {
    for (const id of ['verifierStatus', 'verifierUnverifiable']) {
      expect(html).toContain(`id="${id}"`);
      expect(js).toContain(`'${id}'`);
    }
  });

  test('the phone drawer mirrors the new rows too', () => {
    // The drawer copies from the desktop panel through an explicit field list;
    // a row added to one and not the other is silently absent on mobile.
    expect(html).toContain('mobile-verifierStatus');
    expect(html).toContain('mobile-verifierUnverifiable');
    expect(html).toMatch(/\['verifierStatus', 'mobile-verifierStatus'\]/);
    expect(html).toMatch(/\['verifierUnverifiable', 'mobile-verifierUnverifiable'\]/);
  });

  test('a degraded verifier says it is self-grading, in those words', () => {
    // "Degraded" alone does not tell an owner what broke or why it matters.
    expect(js).toMatch(/Self-grading/);
  });

  test('the panel distinguishes confirmed from merely not-yet-failed', () => {
    // Three states and three colours. The middle one may borrow neither of the
    // others: green asserts a cross-check nothing verified, red reports a
    // failure that has not happened.
    expect(js).toMatch(/Not yet confirmed/);
    expect(js).toMatch(/status-unknown/);
    expect(html).toMatch(/\.status-unknown\s*\{/);
  });

  test('an empty sample is not reported as a good rate', () => {
    // unverifiableRate is 0 on an empty ring. Green there says "0% unverifiable"
    // about zero answers — the same reassuring-colour-on-no-evidence mistake as
    // the verifier state itself.
    expect(js).toMatch(/!v\.sampleSize \? warn :/);
  });

  test('the confirmed state shows WHEN, not just that', () => {
    // A timestamp is what makes the green worth anything — it is the difference
    // between "nothing has gone wrong" and "this was true at 10:42".
    expect(js).toMatch(/Cross-checked · \$\{at\}/);
    expect(js).toMatch(/v\.lastOkAt/);
  });

  test('the AI Service colour follows the reported status, not only the key check', () => {
    // Caught in a browser render, not in review: keying the colour off missing
    // keys alone painted the word "Degraded" in green whenever every key was
    // present — which is precisely the production case (keys valid, Anthropic
    // balance empty). A red word in a green style reads as "fine".
    expect(js).toMatch(/overallOk/);
    expect(js).toMatch(/\(missing\.length \|\| !overallOk\) \? bad : ok/);
  });
});

describe('the metrics page shows unverifiableRate', () => {
  const page = read('public/admin-structured-metrics.html');

  test('renders the headline rate', () => {
    expect(page).toMatch(/unverifiableRate/);
    expect(page).toMatch(/Unverifiable rate/);
  });

  test('renders the cross-provider state next to it', () => {
    expect(page).toMatch(/renderVerifierBanner/);
    expect(page).toMatch(/data\.verify/);
  });

  test('ranks which problem types burn the budget', () => {
    // The rate says there is a problem; this table says where to spend the fix.
    expect(page).toMatch(/unresolvedByMathType/);
  });

  test('the banner has a third state for "not yet asked"', () => {
    expect(page).toMatch(/Not yet confirmed/);
    expect(page).toMatch(/verifier-banner\.warn/);
    expect(page).toMatch(/banner\.classList\.remove\('ok', 'warn', 'bad'\)/);
  });

  test('the confirmed banner carries the timestamp it is claiming', () => {
    expect(page).toMatch(/Last confirmed/);
    expect(page).toMatch(/cp\.lastOkAt/);
  });

  test('the verifier block is not described as gated on the structured flag', () => {
    // The page led with "this page is empty until the flag is on". The verifier
    // records on every answer attempt regardless — so the one always-live block
    // on the page read as dead, which is most of why nobody looked at it.
    expect(page).toMatch(/always live/i);
    expect(page).toMatch(/the <em>structured<\/em> tables are empty until the flag is on/);
  });
});

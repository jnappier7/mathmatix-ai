// tests/unit/campaignLink.test.js
// Pins the tracked print-link route: /go/<campaign> must always land a human
// on the site, only ever reflect validated input into the redirect, and count
// the scan.

jest.mock('../../utils/conversionEvents', () => ({
  recordConversionEvent: jest.fn(),
}));

const express = require('express');
const supertest = require('supertest');
const { recordConversionEvent } = require('../../utils/conversionEvents');
const router = require('../../routes/campaignLink');

function makeApp() {
  const app = express();
  app.use('/go', router);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe('GET /go/:campaign', () => {
  test('redirects with UTM attribution and records the scan', async () => {
    const r = await supertest(makeApp()).get('/go/field');
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe('/?utm_source=qr&utm_medium=offline&utm_campaign=field');
    expect(recordConversionEvent).toHaveBeenCalledWith('campaign_scan', {
      context: { campaign: 'field' },
    });
  });

  test('lowercases the slug so FIELD and field are one campaign in GA4', async () => {
    const r = await supertest(makeApp()).get('/go/FIELD');
    expect(r.headers.location).toContain('utm_campaign=field');
  });

  test('an invalid slug still lands the human on the site, uncounted and unreflected', async () => {
    // A printed code must never dead-end; but nothing unvalidated may reach
    // the redirect URL or the telemetry.
    const r = await supertest(makeApp()).get('/go/' + encodeURIComponent('"><script>x</script>'));
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe('/');
    expect(recordConversionEvent).not.toHaveBeenCalled();
  });

  test('rejects slugs over 40 chars and ones starting with punctuation', async () => {
    for (const bad of ['a'.repeat(41), '-leading', '_leading']) {
      const r = await supertest(makeApp()).get('/go/' + bad);
      expect(r.headers.location).toBe('/');
    }
    expect(recordConversionEvent).not.toHaveBeenCalled();
  });

  test('accepts hyphenated and numbered slugs (field-2026, program1)', async () => {
    for (const good of ['field-2026', 'program1', 'yard_sign']) {
      const r = await supertest(makeApp()).get('/go/' + good);
      expect(r.headers.location).toContain(`utm_campaign=${good}`);
    }
    expect(recordConversionEvent).toHaveBeenCalledTimes(3);
  });
});

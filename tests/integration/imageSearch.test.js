// tests/integration/imageSearch.test.js
// Integration test for routes/imageSearch.js (COPPA-safe image search)

jest.mock('../../utils/safeImageSearch', () => ({
  searchEducationalImages: jest.fn(),
  sanitizeQuery: jest.fn(),
  getStaticConceptImage: jest.fn(),
  isValidCategory: jest.fn().mockReturnValue(true)
}));

jest.mock('express-rate-limit', () => () => (req, res, next) => next());

const express = require('express');
const supertest = require('supertest');
const safeSearch = require('../../utils/safeImageSearch');
const router = require('../../routes/imageSearch');

function makeApp(user = { _id: 'u1' }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use('/api/images', router);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  safeSearch.isValidCategory.mockReturnValue(true);
  safeSearch.sanitizeQuery.mockReturnValue({ safe: true, sanitized: 'q', reason: null });
});

describe('GET /api/images/search', () => {
  test('returns 400 when query is missing or too short', async () => {
    const app = makeApp();
    const r1 = await supertest(app).get('/api/images/search');
    expect(r1.status).toBe(400);
    const r2 = await supertest(app).get('/api/images/search?q=a');
    expect(r2.status).toBe(400);
  });

  test('returns 400 when query exceeds 100 chars', async () => {
    const long = 'x'.repeat(101);
    const r = await supertest(makeApp()).get(`/api/images/search?q=${long}`);
    expect(r.status).toBe(400);
  });

  test('returns 400 for invalid category', async () => {
    safeSearch.isValidCategory.mockReturnValueOnce(false);
    const r = await supertest(makeApp()).get('/api/images/search?q=triangle&category=violence');
    expect(r.status).toBe(400);
  });

  test('returns 400 when sanitizer rejects unsafe query', async () => {
    safeSearch.sanitizeQuery.mockReturnValueOnce({ safe: false, sanitized: '', reason: 'Blocked content' });
    const r = await supertest(makeApp()).get('/api/images/search?q=evilword');
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Blocked/);
  });

  test('returns static concept image without calling external search', async () => {
    safeSearch.getStaticConceptImage.mockReturnValue({
      url: '/images/concepts/triangle.png',
      title: 'Triangle',
      source: 'Mathmatix'
    });
    const r = await supertest(makeApp()).get('/api/images/search?q=triangle');
    expect(r.status).toBe(200);
    expect(r.body.cached).toBe(true);
    expect(r.body.source).toBe('static');
    expect(safeSearch.searchEducationalImages).not.toHaveBeenCalled();
  });

  test('falls through to external search when no static match', async () => {
    safeSearch.getStaticConceptImage.mockReturnValue(null);
    safeSearch.searchEducationalImages.mockResolvedValue({
      results: [{ url: 'https://khanacademy.org/x.png', title: 'x' }],
      query: 'math triangle'
    });

    const r = await supertest(makeApp()).get('/api/images/search?q=quirky');
    expect(r.status).toBe(200);
    expect(r.body.source).toBe('google_cse');
    expect(r.body.results).toHaveLength(1);
  });

  test('handles search errors with 200 + empty results (no internal leak)', async () => {
    safeSearch.getStaticConceptImage.mockReturnValue(null);
    safeSearch.searchEducationalImages.mockResolvedValue({
      results: [], query: 'q', error: 'Image search not configured'
    });
    const r = await supertest(makeApp()).get('/api/images/search?q=quirky');
    expect(r.status).toBe(200);
    expect(r.body.results).toEqual([]);
    expect(r.body.error).toMatch(/not available yet/);
  });

  test('returns 500 on uncaught error', async () => {
    safeSearch.getStaticConceptImage.mockImplementation(() => { throw new Error('boom'); });
    const r = await supertest(makeApp()).get('/api/images/search?q=anything');
    expect(r.status).toBe(500);
  });
});

describe('GET /api/images/concept/:concept', () => {
  test('returns the static image when one exists', async () => {
    safeSearch.getStaticConceptImage.mockReturnValue({ url: '/x.png', title: 'X' });
    const r = await supertest(makeApp()).get('/api/images/concept/triangle');
    expect(r.status).toBe(200);
    expect(r.body.result.url).toBe('/x.png');
  });

  test('returns 404 when no static image matches', async () => {
    safeSearch.getStaticConceptImage.mockReturnValue(null);
    const r = await supertest(makeApp()).get('/api/images/concept/unknown');
    expect(r.status).toBe(404);
  });
});

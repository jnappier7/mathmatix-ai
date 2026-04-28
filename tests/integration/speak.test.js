// tests/integration/speak.test.js
// Integration test for routes/speak.js (TTS endpoint with COPPA gate)

jest.mock('../../utils/ttsProvider', () => ({
  isConfigured: jest.fn(),
  getProviderName: jest.fn().mockReturnValue('Cartesia'),
  resolveVoiceId: jest.fn((id) => id),
  getContentType: jest.fn().mockReturnValue('audio/wav'),
  generateAudio: jest.fn()
}));

jest.mock('../../utils/mathTTS', () => ({
  cleanTextForTTS: jest.fn((t) => `cleaned:${t}`)
}));

const express = require('express');
const supertest = require('supertest');
const ttsProvider = require('../../utils/ttsProvider');
const router = require('../../routes/speak');

function makeApp(user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use('/api/speak', router);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  ttsProvider.isConfigured.mockReturnValue(true);
});

describe('POST /api/speak', () => {
  test('returns 400 when text is missing', async () => {
    const r = await supertest(makeApp({ _id: 'u1' })).post('/api/speak').send({});
    expect(r.status).toBe(400);
  });

  test('blocks under-13 users with useWebSpeech fallback flag (COPPA)', async () => {
    const dob = new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000); // 10 years old
    const r = await supertest(makeApp({ _id: 'u1', dateOfBirth: dob }))
      .post('/api/speak')
      .send({ text: 'hello' });
    expect(r.status).toBe(403);
    expect(r.body.useWebSpeech).toBe(true);
    expect(ttsProvider.generateAudio).not.toHaveBeenCalled();
  });

  test('allows users 13+', async () => {
    ttsProvider.generateAudio.mockResolvedValue(Buffer.from('audio-bytes'));
    const dob = new Date(Date.now() - 14 * 365 * 24 * 60 * 60 * 1000);
    const r = await supertest(makeApp({ _id: 'u1', dateOfBirth: dob }))
      .post('/api/speak')
      .send({ text: 'hello' });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/audio\/wav/);
    expect(r.body).toBeInstanceOf(Buffer);
  });

  test('allows users with no DOB recorded (legacy)', async () => {
    ttsProvider.generateAudio.mockResolvedValue(Buffer.from('audio'));
    const r = await supertest(makeApp({ _id: 'u1' })).post('/api/speak').send({ text: 'hi' });
    expect(r.status).toBe(200);
  });

  test('returns 500 when provider not configured', async () => {
    ttsProvider.isConfigured.mockReturnValue(false);
    const r = await supertest(makeApp({ _id: 'u1' })).post('/api/speak').send({ text: 'hi' });
    expect(r.status).toBe(500);
  });

  test('returns 500 when audio generation fails', async () => {
    ttsProvider.generateAudio.mockRejectedValue(new Error('cartesia down'));
    const r = await supertest(makeApp({ _id: 'u1' })).post('/api/speak').send({ text: 'hi' });
    expect(r.status).toBe(500);
  });

  test('uses requested voiceId when provided, default otherwise', async () => {
    ttsProvider.generateAudio.mockResolvedValue(Buffer.from('a'));
    await supertest(makeApp({ _id: 'u1' })).post('/api/speak').send({ text: 'hi', voiceId: 'voice-9' });
    expect(ttsProvider.resolveVoiceId).toHaveBeenCalledWith('voice-9');

    jest.clearAllMocks();
    ttsProvider.isConfigured.mockReturnValue(true);
    ttsProvider.generateAudio.mockResolvedValue(Buffer.from('a'));
    ttsProvider.resolveVoiceId.mockImplementation((id) => id);
    await supertest(makeApp({ _id: 'u1' })).post('/api/speak').send({ text: 'hi' });
    expect(ttsProvider.resolveVoiceId).toHaveBeenCalledWith('2eFQnnNM32GDnZkCfkSm');
  });
});

// GET /api/conversations/:id/view — the write-free twin of POST /:id/switch.
// Look-only "view as" blocks every POST, so this is how the chat page shows the
// student's transcript; it must never touch the user document.

jest.mock('../../models/conversation', () => ({ findOne: jest.fn() }));
jest.mock('../../models/user', () => ({ findById: jest.fn() }));

const express = require('express');
const request = require('supertest');
const Conversation = require('../../models/conversation');
const User = require('../../models/user');

const router = require('../../routes/conversations');

function app(userId = '64b000000000000000000001') {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.user = { _id: userId }; req.isAuthenticated = () => true; next(); });
  a.use('/api/conversations', router);
  return a;
}

const CONV_ID = '64b0000000000000000000aa';

beforeEach(() => jest.clearAllMocks());

test('returns the same transcript payload as /switch, scoped to the owner, with no writes', async () => {
  Conversation.findOne.mockResolvedValue({
    _id: CONV_ID,
    topic: 'Quadratics',
    conversationType: 'general',
    messages: [{ role: 'assistant', content: 'hi', attachments: [{ uploadId: 'u1', fileType: 'image', mimeType: 'image/png', extractedText: 'SECRET', imageData: 'b64' }] }],
  });

  const res = await request(app()).get(`/api/conversations/${CONV_ID}/view`);

  expect(res.status).toBe(200);
  expect(res.body.conversation.name).toBe('Quadratics');
  expect(res.body.messages).toHaveLength(1);
  expect(res.body.messages[0].attachments[0]).toEqual({ uploadId: 'u1', fileType: 'image', mimeType: 'image/png' });
  expect(Conversation.findOne).toHaveBeenCalledWith(expect.objectContaining({ _id: CONV_ID, userId: '64b000000000000000000001' }));
  expect(User.findById).not.toHaveBeenCalled();
});

test('404s on a conversation that is not the user\'s', async () => {
  Conversation.findOne.mockResolvedValue(null);
  const res = await request(app()).get(`/api/conversations/${CONV_ID}/view`);
  expect(res.status).toBe(404);
});

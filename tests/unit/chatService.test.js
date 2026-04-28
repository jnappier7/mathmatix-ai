// tests/unit/chatService.test.js
// Unit tests for services/chatService.js — focuses on the pure helpers
// (validateMessage, filterContent) and the simpler Conversation flows
// (getOrCreateConversation, getConversationHistory, clearConversation,
// archiveConversation, getUserConversations).

jest.mock('../../utils/logger', () => {
  const stub = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
  stub.child = jest.fn().mockReturnValue(stub);
  return stub;
});

const mockConversationCtor = jest.fn();
jest.mock('../../models/conversation', () => {
  function Conversation(data) {
    Object.assign(this, data);
    this.messages = data.messages || [];
    this.save = jest.fn().mockResolvedValue(this);
    mockConversationCtor(data);
  }
  Conversation.findById = jest.fn();
  Conversation.findOne = jest.fn();
  Conversation.find = jest.fn();
  return Conversation;
});

jest.mock('../../models/user', () => ({
  findById: jest.fn()
}));

const Conversation = require('../../models/conversation');
const chatService = require('../../services/chatService');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('validateMessage', () => {
  test('rejects null / non-string', () => {
    expect(chatService.validateMessage(null).valid).toBe(false);
    expect(chatService.validateMessage(undefined).valid).toBe(false);
    expect(chatService.validateMessage(42).valid).toBe(false);
  });

  test('rejects empty / whitespace-only', () => {
    expect(chatService.validateMessage('').valid).toBe(false);
    expect(chatService.validateMessage('   ').valid).toBe(false);
  });

  test('rejects strings over 2000 chars', () => {
    expect(chatService.validateMessage('x'.repeat(2001)).valid).toBe(false);
  });

  test('accepts a normal message', () => {
    expect(chatService.validateMessage('What is 2+2?').valid).toBe(true);
  });
});

describe('filterContent', () => {
  test('flags + redacts password-like words', () => {
    const r = chatService.filterContent('my password is hunter2');
    expect(r.safe).toBe(false);
    expect(r.filtered).toContain('[REDACTED]');
    expect(r.filtered).not.toContain('password');
  });

  test('flags SSN patterns', () => {
    const r = chatService.filterContent('my SSN is 123-45-6789');
    expect(r.safe).toBe(false);
    expect(r.filtered).toContain('[REDACTED]');
  });

  test('flags 16-digit number (credit card)', () => {
    const r = chatService.filterContent('card: 1234567890123456');
    expect(r.safe).toBe(false);
  });

  test('passes safe content through', () => {
    const r = chatService.filterContent('What is the slope of the line?');
    expect(r.safe).toBe(true);
    expect(r.filtered).toBe('What is the slope of the line?');
  });
});

describe('getOrCreateConversation', () => {
  const User = require('../../models/user');

  test('throws when user not found', async () => {
    User.findById.mockResolvedValue(null);
    await expect(chatService.getOrCreateConversation('u1')).rejects.toThrow(/User not found/);
  });

  test('returns existing topic conversation when present', async () => {
    User.findById.mockResolvedValue({ _id: 'u1' });
    const existing = { _id: 'c-existing', save: jest.fn().mockResolvedValue() };
    Conversation.findOne.mockResolvedValue(existing);

    const r = await chatService.getOrCreateConversation('u1', { topic: 'fractions' });
    expect(r._id).toBe('c-existing');
    expect(mockConversationCtor).not.toHaveBeenCalled();
  });

  test('creates a new topic conversation when none exists', async () => {
    User.findById.mockResolvedValue({ _id: 'u1' });
    Conversation.findOne.mockResolvedValue(null);

    await chatService.getOrCreateConversation('u1', { topic: 'fractions' });
    expect(mockConversationCtor).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1', topic: 'fractions', conversationType: 'topic'
    }));
  });

  test('rethrows DB errors', async () => {
    User.findById.mockRejectedValue(new Error('db'));
    await expect(chatService.getOrCreateConversation('u1')).rejects.toThrow('db');
  });
});

describe('getConversationHistory', () => {
  test('returns empty array when conversation not found', async () => {
    Conversation.findById.mockResolvedValue(null);
    expect(await chatService.getConversationHistory('missing')).toEqual([]);
  });

  test('returns last N messages', async () => {
    const messages = Array(30).fill(null).map((_, i) => ({ role: 'user', content: `m${i}` }));
    Conversation.findById.mockResolvedValue({ messages });
    const r = await chatService.getConversationHistory('c1', 5);
    expect(r).toHaveLength(5);
    expect(r[0].content).toBe('m25');
  });
});

describe('clearConversation', () => {
  test('throws when conversation missing', async () => {
    Conversation.findById.mockResolvedValue(null);
    await expect(chatService.clearConversation('missing')).rejects.toThrow(/not found/);
  });

  test('clears messages and saves', async () => {
    const convo = {
      messages: [{ role: 'user', content: 'a' }],
      save: jest.fn().mockResolvedValue()
    };
    Conversation.findById.mockResolvedValue(convo);
    const r = await chatService.clearConversation('c1');
    expect(convo.messages).toEqual([]);
    expect(convo.save).toHaveBeenCalled();
    expect(r).toBe(convo);
  });
});

describe('archiveConversation', () => {
  test('throws when conversation missing', async () => {
    Conversation.findById.mockResolvedValue(null);
    await expect(chatService.archiveConversation('missing')).rejects.toThrow(/not found/);
  });

  test('marks isActive=false and saves', async () => {
    const convo = {
      isActive: true,
      save: jest.fn().mockResolvedValue()
    };
    Conversation.findById.mockResolvedValue(convo);
    await chatService.archiveConversation('c1');
    expect(convo.isActive).toBe(false);
    expect(convo.save).toHaveBeenCalled();
  });
});

describe('getUserConversations', () => {
  test('queries by userId, sorts pinned-first + activity-desc, selects fields, and shapes the result', async () => {
    const list = [
      {
        _id: 'c1',
        topic: 'algebra',
        conversationType: 'topic',
        lastActivity: new Date(),
        messages: [{ role: 'user', content: 'hi there' }],
        problemsAttempted: 5,
        problemsCorrect: 4,
        isPinned: true
      }
    ];
    const select = jest.fn().mockResolvedValue(list);
    const sort = jest.fn().mockReturnValue({ select });
    Conversation.find.mockReturnValue({ sort });

    const r = await chatService.getUserConversations('u1');
    expect(Conversation.find).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }));
    expect(sort).toHaveBeenCalled();
    expect(Array.isArray(r)).toBe(true);
    expect(r[0]._id).toBe('c1');
  });
});

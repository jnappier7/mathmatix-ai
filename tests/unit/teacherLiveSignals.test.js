// Two signals the teacher's Today view leans on, both wrong on the live
// dashboard 2026-11-03:
//
// 1. "Live now" listed Jason four times, including conversations that started
//    Oct 14 and Oct 31. Session end fires on every page leave (sendBeacon) and
//    stamped the open conversation's lastActivity "now", so a weeks-old chat
//    read as live — and counted as a session "this week" on the parent card.
// 2. "Jason Nappier is struggling right now · with current concept" — from a
//    student who had typed "can you help me with 3(x - 4) = 2x + 5". The
//    struggle keywords included "help", "why", "how do i" and "what does".

jest.mock('../../utils/logger', () => {
  const stub = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
  stub.child = jest.fn().mockReturnValue(stub);
  return stub;
});

describe('session end does not make an old conversation look live', () => {
  let sessionSvc;
  let User;
  let Conversation;

  beforeAll(() => {
    jest.isolateModules(() => {
      jest.doMock('../../utils/activitySummarizer', () => ({
        generateSessionSummary: jest.fn().mockResolvedValue('Worked on linear equations.'),
        detectTopic: jest.fn().mockReturnValue('linear equation'),
        calculateProblemStats: jest.fn().mockReturnValue({ attempted: 0, correct: 0 }),
        detectStruggle: jest.fn().mockReturnValue({ isStruggling: false }),
        generateStudentRecap: jest.fn().mockReturnValue('recap'),
      }));
      jest.doMock('../../models/user', () => ({ findById: jest.fn() }));
      jest.doMock('../../models/conversation', () => ({ findOne: jest.fn() }));
      jest.doMock('../../models/courseSession', () => ({ findById: jest.fn() }));
      jest.doMock('../../models/notification', () => ({ insertMany: jest.fn() }));
      sessionSvc = require('../../services/sessionService');
      User = require('../../models/user');
      Conversation = require('../../models/conversation');
    });
  });

  test('lastActivity keeps the time of the last real turn', async () => {
    const lastTurn = new Date('2026-10-14T13:20:00Z');
    const convo = {
      _id: 'c1',
      messages: [{ role: 'user', content: 'solve 2x + 3 = 11', timestamp: lastTurn }],
      lastActivity: lastTurn,
      currentTopic: 'linear equation',
      problemsAttempted: 1,
      save: jest.fn().mockResolvedValue(undefined),
    };
    User.findById.mockResolvedValue({ _id: 'u1', activeConversationId: 'c1', firstName: 'Jason', lastName: 'N', roles: ['student'] });
    Conversation.findOne.mockResolvedValue(convo);

    await sessionSvc.endSession('u1', 'sess-1', 'tab_close', {});

    expect(convo.save).toHaveBeenCalled();
    expect(convo.summary).toBe('Worked on linear equations.');
    expect(convo.lastActivity).toBe(lastTurn);
  });
});

describe('detectStruggle', () => {
  const { detectStruggle } = jest.requireActual('../../utils/activitySummarizer');
  const turns = (...userTexts) => userTexts.flatMap((t) => [
    { role: 'user', content: t },
    { role: 'assistant', content: 'Let us work through it.' },
  ]);

  test('asking for help with a new problem is not struggling', () => {
    expect(detectStruggle(turns(
      'hi', 'can you help me with 3(x - 4) = 2x + 5', 'subtract 2x so x - 12 = 5, so x = 7',
    )).isStruggling).toBe(false);
    expect(detectStruggle(turns('ok', 'why do we flip the sign', 'how do i graph this line?')).isStruggling).toBe(false);
  });

  test('saying they are lost still is, named by the conversation topic', () => {
    const r = detectStruggle(turns('3x - 12 = 2x + 5', 'x - 12 = 5', "i'm lost, i don't get this linear equation step"));
    expect(r.isStruggling).toBe(true);
    expect(r.strugglingWith).not.toBe('current concept');
  });

  test('with no recognisable topic the label is "this problem", never a placeholder', () => {
    const r = detectStruggle(turns('ok', 'hmm', 'i am so confused'));
    expect(r.isStruggling).toBe(true);
    expect(r.strugglingWith).toBe('this problem');
  });
});

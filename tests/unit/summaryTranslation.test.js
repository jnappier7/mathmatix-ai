// Session summaries in the parent's language: cached per conversation, keyed by a
// hash of the English source, and the dashboard never waits on or fails with it.
const { localizeSessionSummaries, hashOf } = require('../../utils/summaryTranslation');

function fakeConversation(cacheDocs = []) {
  const updates = [];
  return {
    updates,
    find: () => ({ select: () => ({ lean: async () => cacheDocs }) }),
    updateOne: (filter, update) => { updates.push({ filter, update }); return Promise.resolve(); },
  };
}

const rows = () => ([
  { conversationId: 'c1', summary: 'Ana solved 3 equations.', isActive: false },
  { conversationId: 'c2', summary: 'Ana reviewed fractions.', isActive: false },
  { conversationId: 'live', summary: 'Working on ratios.', isActive: true },
]);

test('English parents are untouched and nothing is called', async () => {
  const translate = jest.fn();
  const out = await localizeSessionSummaries(rows(), { language: 'English', translate, Conversation: fakeConversation() });
  expect(out[0].summary).toBe('Ana solved 3 equations.');
  expect(translate).not.toHaveBeenCalled();
});

test('translates, then caches completed sessions only (not the live one)', async () => {
  const Conversation = fakeConversation();
  const translate = jest.fn(async (texts) => texts.map((t) => `ES:${t}`));
  const out = await localizeSessionSummaries(rows(), { language: 'Spanish', translate, Conversation });
  expect(out.map((s) => s.summary)).toEqual(['ES:Ana solved 3 equations.', 'ES:Ana reviewed fractions.', 'ES:Working on ratios.']);
  expect(Conversation.updates.map((u) => u.filter._id)).toEqual(['c1', 'c2']);
  expect(Conversation.updates[0].update.$set['summaryTranslations.Spanish']).toEqual({ h: hashOf('Ana solved 3 equations.'), text: 'ES:Ana solved 3 equations.' });
});

test('a fresh cache hit skips the model; a stale one (summary changed) re-translates', async () => {
  const Conversation = fakeConversation([
    { _id: 'c1', summaryTranslations: { Spanish: { h: hashOf('Ana solved 3 equations.'), text: 'Ana resolvió 3 ecuaciones.' } } },
    { _id: 'c2', summaryTranslations: { Spanish: { h: 'stale', text: 'viejo' } } },
  ]);
  const translate = jest.fn(async (texts) => texts.map((t) => `ES:${t}`));
  const out = await localizeSessionSummaries(rows(), { language: 'Spanish', translate, Conversation });
  expect(out[0].summary).toBe('Ana resolvió 3 ecuaciones.');
  expect(out[1].summary).toBe('ES:Ana reviewed fractions.');
  expect(translate.mock.calls[0][0]).toEqual(['Ana reviewed fractions.', 'Working on ratios.']);
});

test('model failure keeps English and writes nothing', async () => {
  const Conversation = fakeConversation();
  const out = await localizeSessionSummaries(rows(), {
    language: 'Spanish', Conversation, translate: async () => { throw new Error('429'); },
  });
  expect(out[0].summary).toBe('Ana solved 3 equations.');
  expect(Conversation.updates).toEqual([]);
});

test('a slow model never holds the dashboard past the timeout', async () => {
  const Conversation = fakeConversation();
  const slow = () => new Promise((r) => setTimeout(() => r(['late']), 200));
  const out = await localizeSessionSummaries(rows(), { language: 'Spanish', Conversation, translate: slow, timeoutMs: 20 });
  expect(out[0].summary).toBe('Ana solved 3 equations.');
});

test('a missing translation for one row leaves that row in English', async () => {
  const translate = async (texts) => texts.map((t, i) => (i === 0 ? null : `ES:${t}`));
  const out = await localizeSessionSummaries(rows(), { language: 'Spanish', translate, Conversation: fakeConversation() });
  expect(out[0].summary).toBe('Ana solved 3 equations.');
  expect(out[1].summary).toBe('ES:Ana reviewed fractions.');
});

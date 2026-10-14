/** scripts/syncTestPrepItemFixes.js: sets only what differs, and never answer.equivalents. */
const { diffItem } = require('../../scripts/syncTestPrepItemFixes');

const seed = {
  problemId: 'p', options: [{ label: 'A', text: '4 - π' }, { label: 'B', text: 'π' }], correctOption: 'A',
  answer: { value: '4 - π', equivalents: [] }, explanation: 'e', svg: '<svg/>', figureAlt: 'alt',
};

test('a database row that matches the seed needs nothing (idempotent)', () => {
  expect(diffItem(seed, { ...seed, options: seed.options.map((o) => ({ ...o, _id: 'x' })), answer: { value: '4 - π', equivalents: ['4−π'] } })).toBeNull();
});

test('a changed choice, key text and description are set field by field', () => {
  const doc = { ...seed, options: [{ label: 'A', text: '4 - 1π' }, { label: 'B', text: '1π' }], answer: { value: '4 - 1π', equivalents: ['x'] }, figureAlt: undefined };
  const set = diffItem(seed, doc);
  expect(Object.keys(set).sort()).toEqual(['answer.value', 'figureAlt', 'options']);
  expect(set['answer.value']).toBe('4 - π');
  expect(set).not.toHaveProperty('answer');   // equivalents untouched
});

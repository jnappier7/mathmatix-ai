// The Learning Report's sentences in the parent's language.
const { renderMessage, listOf, normalizeLanguage, MESSAGES, LANGS } = require('../../utils/parentReportText');

const vars = (t) => (t.match(/\{(\w+)\}/g) || []).sort();

describe('message catalog integrity', () => {
  const baseKeys = Object.keys(MESSAGES).filter((k) => !k.endsWith('_one'));

  test.each(baseKeys)('%s exists in all nine languages', (key) => {
    for (const lang of LANGS) expect(typeof MESSAGES[key][lang]).toBe('string');
  });

  test.each(Object.keys(MESSAGES))('%s uses the same placeholders in every language', (key) => {
    const english = vars(MESSAGES[key].English);
    for (const [lang, text] of Object.entries(MESSAGES[key])) {
      // a _one form may hard-code the "1" instead of using {count}
      const got = vars(text).filter((v) => v !== '{count}');
      expect([lang, got]).toEqual([lang, english.filter((v) => v !== '{count}')]);
    }
  });
});

describe('renderMessage', () => {
  test('renders in the parent language', () => {
    expect(renderMessage('headline.excellent', { name: 'Ana' }, 'Spanish')).toBe('Ana está progresando de forma excelente');
  });
  test('unknown language falls back to English', () => {
    expect(renderMessage('headline.excellent', { name: 'Ana' }, 'Klingon')).toBe('Ana is making excellent progress');
  });
  test('_one variant for a count of 1, plural otherwise', () => {
    expect(renderMessage('insight.milestone', { name: 'Ana', count: 1 })).toBe('Ana mastered a new skill in the last 7 days!');
    expect(renderMessage('insight.milestone', { name: 'Ana', count: 3 })).toBe('Ana mastered 3 new skills in the last 7 days!');
  });
  test('a language without a _one form uses its number-neutral sentence', () => {
    expect(renderMessage('insight.milestone', { name: 'Аня', count: 1 }, 'Russian')).toBe('Аня: новых освоенных навыков за последние 7 дней — 1!');
  });
  test('unknown key never shows the raw key', () => {
    expect(renderMessage('no.such.key', {}, 'French')).toBe('');
  });
  test('language names are matched case-insensitively', () => {
    expect(normalizeLanguage('spanish')).toBe('Spanish');
    expect(normalizeLanguage(undefined)).toBe('English');
  });
});

describe('listOf', () => {
  test.each([
    ['English', 'A, B, and C'],
    ['Spanish', 'A, B y C'],
    ['French', 'A, B et C'],
    ['German', 'A, B und C'],
    ['Chinese', 'A、B和C'],
  ])('%s', (lang, expected) => {
    expect(listOf(['A', 'B', 'C'], lang)).toBe(expected);
  });
  test('two items, one item, none', () => {
    expect(listOf(['A', 'B'], 'Spanish')).toBe('A y B');
    expect(listOf(['A'])).toBe('A');
    expect(listOf([])).toBe('');
  });
});

/**
 * The parent-teacher conference prompt has to honour the parent's language.
 *
 * The parent dashboard translates its own chrome from `parentLanguage`, so
 * without a directive in this prompt the page came back in Spanish and the
 * tutor answered in English — the half-translated state is arguably worse than
 * no translation, because the parent can now read the buttons but not the
 * answer they asked for.
 *
 * The subtle part is that it must NOT be "reply in whatever language they wrote
 * in". The dashboard's quick-question buttons post fixed English prompts
 * ("What areas is my child struggling with?"), so mirroring the incoming
 * message would pin every one of those replies back to English — exactly the
 * buttons a non-English-speaking parent is most likely to lean on.
 */

const { generateParentTeacherPrompt } = require('../../routes/chat');

const LANGS = ['Spanish', 'Russian', 'Chinese', 'Vietnamese', 'Arabic', 'Somali', 'French', 'German'];

const child = { firstName: 'Ana', gradeLevel: '7', mathCourse: 'Pre-Algebra', level: 3, xp: 400 };
const tutor = { name: 'Bob', personality: 'warm and patient' };

function build(parentOverrides) {
  return generateParentTeacherPrompt(
    child,
    [],
    null,
    { firstName: 'Elena', ...parentOverrides },
    tutor
  );
}

describe('parent-teacher prompt — language directive', () => {
  test('says nothing about language when the parent is on English', () => {
    const prompt = build({ parentLanguage: 'English' });
    expect(prompt).not.toMatch(/LANGUAGE \(NON-NEGOTIABLE\)/);
    expect(prompt).not.toMatch(/Remember: reply in/);
  });

  test('says nothing about language when the setting is unset', () => {
    // Older parent accounts predate the field; the schema default is English.
    const prompt = build({});
    expect(prompt).not.toMatch(/LANGUAGE \(NON-NEGOTIABLE\)/);
  });

  test.each(LANGS)('%s: instructs the tutor to reply in that language', (lang) => {
    const prompt = build({ parentLanguage: lang });
    expect(prompt).toMatch(/LANGUAGE \(NON-NEGOTIABLE\)/);
    expect(prompt).toContain(`Write every reply to Elena in ${lang}.`);
    // Restated at the very end, where recency works in our favour.
    expect(prompt).toContain(`Remember: reply in ${lang}.`);
  });

  test.each(LANGS)('%s: names no other supported language', (lang) => {
    const prompt = build({ parentLanguage: lang });
    for (const other of LANGS.filter((l) => l !== lang)) {
      expect(prompt).not.toContain(other);
    }
  });

  test('overrides the language of the incoming message, not just mirrors it', () => {
    // The regression this guards: quick-question buttons send fixed English.
    const prompt = build({ parentLanguage: 'Somali' });
    expect(prompt).toMatch(/even when their message arrives in English/);
  });

  test('protects math notation and proper nouns from being translated', () => {
    const prompt = build({ parentLanguage: 'Arabic' });
    expect(prompt).toMatch(/Keep math in standard notation/);
    expect(prompt).toMatch(/Leave Ana's and Bob's names exactly as written/);
  });

  test('tolerates a padded stored value', () => {
    const prompt = build({ parentLanguage: '  French  ' });
    expect(prompt).toContain('Write every reply to Elena in French.');
    expect(prompt).not.toContain('  French  ');
  });

  test('still carries the session-data rules alongside the directive', () => {
    // The directive is additive — it must not displace the anti-hallucination
    // rules that keep the tutor from inventing progress it has no data for.
    const prompt = build({ parentLanguage: 'Spanish' });
    expect(prompt).toMatch(/must be grounded in the SESSION DATA above/);
    expect(prompt).toMatch(/DO NOT invent or assume topics the student worked on/);
    expect(prompt).toMatch(/CONVERSATIONAL TURN-TAKING/);
  });
});

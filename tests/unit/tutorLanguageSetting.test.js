/**
 * The tutor speaks the student's language SETTING, in both prompt builders — and says so even
 * when the setting is English. The bug: a teacher demoed Spanish, switched the student back to
 * English, and the tutor kept answering in Spanish. The English prompt said nothing about
 * language, so the model followed the (Spanish) history instead of the setting.
 */
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';
const fs = require('fs');
const path = require('path');
const { buildSystemPrompt } = require('../../utils/promptCompact');
const { buildCourseSystemPrompt } = require('../../utils/coursePrompt');

const tutor = { name: 'Maya', personality: 'warm', catchphrase: 'ok' };
const chat = (profile) => buildSystemPrompt({ firstName: 'Ava', gradeLevel: '9', ...profile }, tutor).prompt;

const pathway = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/resources/act-prep-pathway.json'), 'utf8'));
const course = (profile) => buildCourseSystemPrompt({
  userProfile: { firstName: 'Ava', ...profile },
  tutorProfile: tutor,
  courseSession: { modules: [], courseId: 'act-prep' },
  pathway, scaffoldData: null, currentModule: pathway.modules[0],
});

describe('chat tutor (promptCompact)', () => {
  test('Spanish: respond in Spanish', () => {
    expect(chat({ preferredLanguage: 'Spanish' })).toMatch(/--- LANGUAGE ---\nRespond primarily in Spanish/);
  });
  test('English (the default, and the switch back): says so, and overrides a non-English history', () => {
    for (const profile of [{}, { preferredLanguage: 'English' }]) {
      const p = chat(profile);
      expect(p).toMatch(/--- LANGUAGE ---\nRespond in English/);
      expect(p).toMatch(/even if earlier messages in this conversation were in another language/);
      expect(p).not.toMatch(/Respond primarily in/);
    }
  });
});

describe('course tutor (coursePrompt)', () => {
  test('Spanish: respond in Spanish', () => {
    expect(course({ preferredLanguage: 'Spanish' })).toMatch(/Language: respond primarily in Spanish/);
  });
  test('English, set or default: respond in English, over a non-English history', () => {
    for (const profile of [{}, { preferredLanguage: 'English' }]) {
      const p = course(profile);
      expect(p).toMatch(/Language: respond in English/);
      expect(p).toMatch(/even if earlier messages were in another language/);
      expect(p).not.toMatch(/Preferred language: en\b/); // the old code compared a name to a code
    }
  });
});

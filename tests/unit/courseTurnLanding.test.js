/**
 * A typed turn is a COURSE turn only when it lands in the course's own conversation.
 *
 * Owner's test account, 2026-10-22: the page-load greeting (correctly) landed the login in
 * general chat and opened with a polynomial warm-up; the student typed "hey whats up?" into
 * that same conversation and the reply was a second hello that ignored it and launched ACT
 * prep module 1 ("Hoy vamos a empezar a explorar las operaciones con números reales…").
 * /api/chat had switched to course mode because the account HAD an active course session —
 * the greeting's landing policy (general chat unless the course was entered this login) was
 * never applied to the turns after it. Now both go by one test, the same one the client's
 * course progress bar uses: is this conversation the course session's conversation?
 */
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';
const fs = require('fs');
const path = require('path');
const { isCourseConversation } = require('../../utils/courseConversation');
const { buildSystemPrompt } = require('../../utils/promptCompact');

const ROOT = path.join(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('isCourseConversation', () => {
  const session = { status: 'active', conversationId: 'conv-course' };
  test('true only for the course session\'s own conversation', () => {
    expect(isCourseConversation(session, { _id: 'conv-course' })).toBe(true);
    expect(isCourseConversation(session, { _id: 'conv-general' })).toBe(false);
  });
  test('compares by value, so an ObjectId-ish id still matches', () => {
    const id = { toString: () => 'abc123' };
    expect(isCourseConversation({ status: 'active', conversationId: id }, { _id: 'abc123' })).toBe(true);
    expect(isCourseConversation({ status: 'active', conversationId: 'abc123' }, { _id: id })).toBe(true);
  });
  test('false for a course that is not active, never opened, or missing', () => {
    expect(isCourseConversation({ status: 'completed', conversationId: 'conv-course' }, { _id: 'conv-course' })).toBe(false);
    expect(isCourseConversation({ status: 'active', conversationId: null }, { _id: 'conv-course' })).toBe(false);
    expect(isCourseConversation(null, { _id: 'conv-course' })).toBe(false);
    expect(isCourseConversation(session, null)).toBe(false);
    expect(isCourseConversation(session, {})).toBe(false);
  });
});

describe('/api/chat keys course mode on the conversation, not on activeCourseSessionId alone', () => {
  const src = read('routes/chat.js');
  const turn = src.slice(src.indexOf('async function runStudentTurn'), src.indexOf('async function handleGreetingRequest'));

  test('the course session is looked up once and tested against the active conversation', () => {
    expect(turn).toMatch(/inCourseConversation = isCourseConversation\(activeCourseSessionDoc, activeConversation\)/);
    expect(src).toMatch(/const \{[^}]*isCourseConversation[^}]*\} = require\('\.\.\/utils\/courseConversation'\)/);
  });

  test('the baseline gate and the course-context enrichment both run only for a course turn', () => {
    expect(turn).toMatch(/if \(inCourseConversation && !isGreeting\) \{/);
    expect(turn).toMatch(/if \(inCourseConversation\) \{\s*\n\s*try \{\s*\n\s*const courseSession = activeCourseSessionDoc;/);
    // The old keys are gone from the turn handler: nothing switches on the id alone.
    expect(turn).not.toMatch(/if \(user\.activeCourseSessionId && !isGreeting\)/);
    expect(turn).not.toMatch(/\/\/ Enrich with active course session data \(if user is in a course\)\s*\n\s*if \(user\.activeCourseSessionId\)/);
  });

  test('course mode is still built from that context (the wiring the course lead guard needs)', () => {
    expect(turn).toMatch(/if \(!systemPrompt && conversationContextForPrompt\?\.courseSession && !masteryContext\)/);
    expect(turn).toMatch(/courseModeActive = true;\s*\n\s*systemPrompt = buildCourseSystemPrompt/);
  });

  test('a general-chat turn by an enrolled student names the course instead of entering it', () => {
    expect(turn).toMatch(/else if \(activeCourseSessionDoc && activeCourseSessionDoc\.status === 'active'\) \{\s*\n\s*conversationContextForPrompt = conversationContextForPrompt \|\| \{\};\s*\n\s*conversationContextForPrompt\.enrolledCourse = \{/);
  });
});

describe('the general prompt, for an enrolled student in general chat', () => {
  const tutor = { name: 'Maya', personality: 'warm', catchphrase: 'ok' };
  const prompt = (ctx) => buildSystemPrompt({ firstName: 'Ava', gradeLevel: '11' }, tutor, null, 'student', null, null, null, [], null, ctx).prompt;

  test('names the course and says not to start it here', () => {
    const p = prompt({ conversationName: 'Math Session', enrolledCourse: { courseId: 'act-prep', courseName: 'ACT Math Prep' } });
    expect(p).toMatch(/Ava is enrolled in ACT Math Prep but this is general tutoring, not the course lesson — do NOT start or resume the course here/);
    expect(p).toMatch(/open it from My Courses/);
    expect(p).not.toMatch(/\nCourse: ACT Math Prep/);
  });

  test('inside the course the course line wins and the "not the lesson" line is absent', () => {
    const p = prompt({ conversationName: 'ACT Math Prep', courseSession: { courseName: 'ACT Math Prep' }, enrolledCourse: { courseName: 'ACT Math Prep' } });
    expect(p).toMatch(/Course: ACT Math Prep/);
    expect(p).not.toMatch(/not the course lesson/);
  });

  test('says nothing about a course when there is none', () => {
    expect(prompt({ conversationName: 'Math Session' })).not.toMatch(/enrolled in|Course:/);
  });
});

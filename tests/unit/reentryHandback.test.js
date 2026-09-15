/**
 * RETURNING TO CHAT IS NEVER SILENT.
 *
 * Owner report, 2026-09-15: "When returning from a course to chat, or from a
 * warm up exercise to chat, there is dead air. No message fires until the
 * student types something."
 *
 * Both returns are in-page hand-backs, and neither was wired to speech:
 *   - Exit Lesson deactivated the course and opened a fresh, EMPTY general
 *     conversation. updateChatForSession paints nothing for an empty one by
 *     design ("the caller owns the greeting"), and the page-load greeting is
 *     module-scoped and long gone. Nobody was the caller.
 *   - The review warm-up's close() removed two CSS classes. No event, no
 *     fetch — from a tutor whose last line was OFFERING the warm-up.
 *
 * Source-level, like coursePreAssessmentExits.test.js: these modules are DOM
 * classes with no seam to call into, and what matters is that the hand-back
 * is wired, not what the model then says. The debrief text itself is covered
 * by reviewWarmupDebrief.test.js.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const review = read('public/js/floating-review.js');
const script = read('public/js/script.js');
const catalog = read('public/js/courseCatalog.js');
const chatRoute = read('routes/chat.js');

describe('the warm-up hands its results back to the tutor', () => {
  test('close() is the single exit and it calls handBack()', () => {
    const body = review.slice(review.indexOf('  close() {'), review.indexOf('  handBack() {'));
    expect(body).toMatch(/this\.handBack\(\);/);
    // Every button and key still funnels through close(); none bypasses it.
    expect(review).toMatch(/doneBtn\.addEventListener\('click', \(\) => this\.close\(\)\)/);
    expect(review).toMatch(/laterBtn\.addEventListener\('click', \(\) => this\.close\(\)\)/);
    expect(review).toMatch(/closeBtn\.addEventListener\('click', \(\) => this\.close\(\)\)/);
    expect(review).toMatch(/e\.key === 'Escape' && this\.isOpen\) this\.close\(\)/);
  });

  test('handBack dispatches review-warmup-complete with bounded rows, once per run', () => {
    const body = review.slice(review.indexOf('  handBack() {'), review.indexOf('  renderIntro() {'));
    expect(body).toMatch(/if \(this\._handedBack \|\| this\.results\.length === 0\) return;/);
    expect(body).toMatch(/new CustomEvent\('review-warmup-complete'/);
    // The server resolves names; the client sends ids and outcomes only.
    expect(body).toMatch(/skillId: r\.skillId/);
    expect(body).toMatch(/correct: r\.correct === true/);
    expect(body).toMatch(/skipped: r\.skipped === true/);
    expect(body).not.toMatch(/skillName/);
  });

  test('every result row carries the skillId the server will name', () => {
    const pushes = review.match(/this\.results\.push\(\{[^}]*\}\)/gs) || [];
    expect(pushes.length).toBeGreaterThanOrEqual(3);
    for (const p of pushes) expect(p).toMatch(/skillId: item\.skillId/);
  });

  test('a new run resets the hand-back, so "Later" after a finished run stays quiet', () => {
    const open = review.slice(review.indexOf('  async open() {'), review.indexOf('  close() {'));
    expect(open).toMatch(/this\.results = \[\];\s*\n\s*this\._handedBack = false;/);
    const start = review.slice(review.indexOf('  startSession() {'), review.indexOf('  renderProblem() {'));
    expect(start).toMatch(/this\._handedBack = false;/);
  });

  test('script.js listens and asks the server for the debrief', () => {
    expect(script).toMatch(/document\.addEventListener\('review-warmup-complete', \(e\) => \{ requestReviewWarmupDebrief\(e\.detail\); \}\);/);
    const fn = script.slice(script.indexOf('async function requestReviewWarmupDebrief'), script.indexOf("document.addEventListener('review-warmup-complete'"));
    expect(fn).toMatch(/reviewWarmupDebrief: \{ planned: detail\.planned, results: detail\.results \}/);
    expect(fn).toMatch(/if \(data\.text\) appendMessage\(data\.text, 'ai'\);/);
    // Nothing attempted → no request, no blank bubble.
    expect(fn).toMatch(/detail\.results\.length === 0\) return;/);
  });

  test('/api/chat accepts the debrief without a message and routes it', () => {
    expect(chatRoute).toMatch(/const isWarmupDebriefRequest = !!req\.body\?\.reviewWarmupDebrief;/);
    expect(chatRoute).toMatch(/!isGreeting && !isGrowthDebriefRequest && !isWarmupDebriefRequest && !hasFiles && !message/);
    expect(chatRoute).toMatch(/if \(isWarmupDebriefRequest\) \{\s*\n\s*return handleReviewWarmupDebrief\(req, res, userId\);/);
    // Delivered as a persisted assistant turn, like the growth debrief.
    const handler = chatRoute.slice(chatRoute.indexOf('async function handleReviewWarmupDebrief'), chatRoute.indexOf('async function handleGreetingRequest'));
    expect(handler).toMatch(/normalizeWarmupResults\(req\.body\.reviewWarmupDebrief\)/);
    expect(handler).toMatch(/return res\.json\(\{ text: '', debriefDelivered: false \}\);/);
    expect(handler).toMatch(/role: 'assistant',\s*\n\s*content: debriefText/);
  });
});

describe('leaving a course hands the student to the tutor, not to a blank page', () => {
  test('exitCourse deactivates, then returns through the shared speaking path', () => {
    const body = catalog.slice(catalog.indexOf('    async exitCourse() {'), catalog.indexOf('    async returnToGeneralChat('));
    expect(body).toMatch(/\/api\/course-sessions\/deactivate/);
    expect(body).toMatch(/await this\.returnToGeneralChat\(courseName\);/);
    // The old inline sequence must not survive alongside it (two fresh sessions).
    expect(body).not.toMatch(/createNewSession/);
  });

  test('returnToGeneralChat opens a fresh session and then asks for the opener', () => {
    const body = catalog.slice(catalog.indexOf('    async returnToGeneralChat('), catalog.indexOf('    async dropCourse('));
    const newSession = body.indexOf('await window.sidebar.createNewSession();');
    const greet = body.indexOf("await window.requestReentryGreeting({ from: 'course', courseName });");
    expect(newSession).toBeGreaterThan(-1);
    expect(greet).toBeGreaterThan(newSession);
  });

  test('dropping the OPEN course leaves the same way, not on an orphaned transcript', () => {
    const body = catalog.slice(catalog.indexOf('    async dropCourse('));
    const active = body.slice(body.indexOf('if (this.activeCourseSessionId === sessionId) {'));
    expect(active.slice(0, 400)).toMatch(/await this\.returnToGeneralChat\(name\);/);
  });

  test('script.js exposes the re-entry greeting and tags where the student came from', () => {
    expect(script).toMatch(/window\.requestReentryGreeting = requestReentryGreeting;/);
    const fn = script.slice(script.indexOf('async function requestReentryGreeting'), script.indexOf('window.requestReentryGreeting ='));
    expect(fn).toMatch(/isGreeting: true, returningFrom: from \|\| 'course'/);
    expect(fn).toMatch(/if \(data\.inlineCta\) attachInlineCtaToLatestMessage\(data\.inlineCta\);/);
    // It never claims skipCourse: deactivation is durable server-side, and the
    // page-load welcome must not learn that flag from here (courseModeWiring).
    expect(fn).not.toMatch(/skipCourse/);
  });

  test('the greeting knows a course exit is the same visit, not a new arrival', () => {
    expect(chatRoute).toMatch(/const returningFromCourse = req\.body\?\.returningFrom === 'course';/);
    expect(chatRoute).toMatch(/stepped out of (my \$\{returningCourseName\}|a course) lesson and I'm back in open chat/);
    const rule = chatRoute.slice(chatRoute.indexOf('They JUST stepped out of'), chatRoute.indexOf('They JUST stepped out of') + 600);
    expect(rule).toMatch(/no hello-again/);
    expect(rule).toMatch(/do NOT re-pitch or resume the course/);
    expect(rule).toMatch(/Skip any warm-up question/);
    // The client-supplied name is bounded and character-filtered before it
    // reaches a prompt.
    expect(chatRoute).toMatch(/req\.body\.courseName\.replace\(\/\[\^\\p\{L\}\\p\{N\} \.,'&:\(\)-\]\/gu, ''\)\.trim\(\)\.slice\(0, 80\)/);
  });
});

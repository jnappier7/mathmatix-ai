/**
 * WHERE A RETURNING STUDENT LANDS, AND WHO GREETS THEM.
 *
 * Three defects, one screenshot (owner, live, 2026-09-14). A signed-in student
 * with a 1-day streak, 61/260 XP and ACT Math Prep open at Round 3 opened
 * chat.html and was met by:
 *
 *   "Hey there! Welcome to Mathmatix! I'm Mr. Nappier, one of the cool tutors
 *    here ... So, what problem are you working on today?"
 *
 * while every pixel around it — the rail, the poster, the message avatar —
 * said Ms. Maria.
 *
 *   1. WRONG TUTOR. chat-redesign.js painted a localStorage cache and then only
 *      corrected it `else if (!cached)`. When /user reported no selectedTutorId
 *      the stale pick simply stayed, while the server independently resolved
 *      TUTOR_CONFIG.default — Mr. Nappier. One page, two tutors.
 *
 *   2. WELCOMED LIKE A STRANGER. The ghost message said "This is my first time
 *      here" whenever `rapportBuildingComplete` was false, which is a different
 *      fact. Anyone who skipped the get-to-know-you flow got introduced to the
 *      product forever.
 *
 *   3. LANDED IN A COURSE THEY DIDN'T OPEN. The greeting entered course mode on
 *      user.activeCourseSessionId alone. That field is durable intent — it
 *      survives logout — so signing in dropped the student back into Round 3
 *      with a module introduction they never asked for. The owner's rule:
 *      every new login lands in general chat; entering a course is a click.
 */

const fs = require('fs');
const path = require('path');

const { courseEnteredThisLogin } = require('../../utils/courseConversation');
const { isForeignLoginSession } = require('../../utils/loginSession');

const REPO = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

const LOGIN_A = 'login-aaaa';
const LOGIN_B = 'login-bbbb';

// ============================================================================
// 3. Landing — the policy predicate
// ============================================================================

describe('courseEnteredThisLogin', () => {
  it('is true only when the course conversation carries THIS login marker', () => {
    expect(courseEnteredThisLogin({ loginSessionId: LOGIN_A }, LOGIN_A)).toBe(true);
  });

  it('is false for a course opened under a previous login', () => {
    // The reported case: activeCourseSessionId still points at Round 3 from
    // days ago, and signing in must not resume it.
    expect(courseEnteredThisLogin({ loginSessionId: LOGIN_A }, LOGIN_B)).toBe(false);
  });

  it('is false when the course was never opened at all', () => {
    expect(courseEnteredThisLogin(null, LOGIN_A)).toBe(false);
  });

  it('is false for an UNMARKED conversation — deliberately unlike adoption', () => {
    // isForeignLoginSession adopts an unmarked conversation, which is right for
    // CONTINUING one (refusing would discard live sessions on deploy day) and
    // wrong for choosing where to land. The two must not be collapsed: being
    // wrong here hijacks a student's landing, being wrong the other way costs
    // one click.
    const unmarked = { loginSessionId: null };
    expect(isForeignLoginSession(unmarked, LOGIN_A)).toBe(false);   // adoptable
    expect(courseEnteredThisLogin(unmarked, LOGIN_A)).toBe(false);  // not entered
  });

  it('is false when there is no login marker to compare against', () => {
    expect(courseEnteredThisLogin({ loginSessionId: LOGIN_A }, null)).toBe(false);
  });

  it('compares by value, so an ObjectId-ish marker still matches', () => {
    const asObj = { loginSessionId: { toString: () => LOGIN_A } };
    expect(courseEnteredThisLogin(asObj, LOGIN_A)).toBe(true);
  });
});

describe('the greeting route applies that policy', () => {
  const src = read('routes/chat.js');

  it('gates course mode on the login test, not on activeCourseSessionId alone', () => {
    expect(src).toMatch(/courseEnteredThisLogin\(/);
    expect(src).toMatch(/if \(courseEnteredInThisLogin\)/);
    // The old unconditional entry must be gone.
    expect(src).not.toMatch(/if \(user\.activeCourseSessionId && !skipCourse\) \{\s*\n\s*try \{\s*\n\s*const CourseSession = require/);
  });

  it('still honours skipCourse, so a deliberate fresh session is untouched', () => {
    expect(src).toMatch(/if \(courseSessionForGreeting && !skipCourse\)/);
  });

  it('looks the course session up once and reuses it', () => {
    // Two lookups is how the "may we mention it" and "should we enter it"
    // answers would drift apart.
    const fn = src.slice(src.indexOf('async function handleGreetingRequest'));
    const body = fn.slice(0, fn.indexOf('\nasync function ', 1));
    expect(body.match(/courseSessionForGreeting = await/g) || []).toHaveLength(1);
  });
});

// ============================================================================
// 2. Not a stranger
// ============================================================================

describe('first-time framing follows evidence, not the rapport flag', () => {
  const src = read('routes/chat.js');

  it('decides "first time" from actual history', () => {
    expect(src).toMatch(/const hasBeenHereBefore =/);
    for (const signal of ['totalSessions', 'lastSessionContext', 'user\\.xp', 'currentStreak', 'assessmentCompleted']) {
      expect(src).toMatch(new RegExp(signal));
    }
  });

  it('no longer says "first time here" merely because rapport is incomplete', () => {
    expect(src).not.toMatch(/if \(!user\.learningProfile\?\.rapportBuildingComplete\) \{\s*\n\s*ghostMessageParts\.push\("This is my first time here"\)/);
  });

  it('still lets the tutor know rapport is thin — as a different fact', () => {
    // The flag has a real job (be curious). It just must not read as "new".
    expect(src).toMatch(/haven't really gotten to know each other yet/);
  });

  it('bans product-welcome language for a returning student', () => {
    // Stated as a prohibition because "welcome them back like you remember
    // them" was already there as advice, and the model still opened with
    // "Welcome to Mathmatix! I'm <tutor>, one of the cool tutors here".
    expect(src).toMatch(/THIS STUDENT IS NOT NEW/);
    expect(src).toMatch(/Do NOT welcome them to Mathmatix/);
    expect(src).toMatch(/do NOT introduce yourself/);
  });

  it('gives the tutor something concrete to be warm about', () => {
    // "Welcome back" with nothing behind it is the canned version of the same
    // mistake. The streak and the open course are the recognition material.
    expect(src).toMatch(/-day streak/);
    expect(src).toMatch(/I haven't opened it today/);
  });

  it('lets the tutor NAME the course without starting the lesson', () => {
    expect(src).toMatch(/do NOT start the lesson/);
    expect(src).toMatch(/invite them to pick it up/);
  });

  it('applies the voice rule on both instruction paths', () => {
    // There are two: TutorPlan directives, and the no-plan fallback. A rule on
    // only one of them fires for only some students.
    expect(src.match(/returningVoiceRule/g).length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================================
// 1. One page, one tutor
// ============================================================================

describe('the server owns the tutor identity', () => {
  const js = read('public/js/chat-redesign.js');

  it('applies the server answer even when the server says "none"', () => {
    // The bug verbatim: `else if (!cached)` meant a cached pick outlived a
    // server that had no tutor at all.
    expect(js).not.toMatch(/\}\s*else if \(!cached\)\s*\{\s*\n\s*applyTutor\('default'\);/);
    expect(js).toMatch(/const resolved = tutorId \|\| 'default';/);
    expect(js).toMatch(/if \(resolved !== cached\) applyTutor\(resolved\);/);
  });

  it('drops the stale pick when the account has no tutor', () => {
    // Otherwise the next load flashes it again before /user answers, and the
    // mismatch is back for as long as that flash lasts.
    expect(js).toMatch(/function clearCachedTutorId/);
    expect(js).toMatch(/clearCachedTutorId\(\);/);
  });

  it('ships — chat-redesign.js is version-queried, not bundled', () => {
    // It loads as <script src="/js/chat-redesign.js?v=...">, so unlike the
    // page-bundled sources this file's edits reach nobody until the query
    // moves. pageBundlesFresh.test.js cannot see this one; the browser keeps
    // serving the cached copy and the diff looks right in every other check.
    const html = read('public/chat.html');
    const m = html.match(/\/js\/chat-redesign\.js\?v=([0-9a-z]+)/);
    expect(m).toBeTruthy();
    expect(m[1]).not.toBe('20260802a');   // the version this fix shipped against
  });

  it('still paints the cache first, so the flash fix survives', () => {
    // The cache exists to stop a poster flash. Fixing authority must not cost
    // that — it is a placeholder, just no longer a source of truth.
    const init = js.slice(js.indexOf('async function init()'));
    expect(init.indexOf('if (cached) applyTutor(cached);'))
      .toBeLessThan(init.indexOf('await loadCurrentTutorId()'));
  });
});

/**
 * Teacher data accuracy — the seams fixed after the 2026-11-17 audit, pinned
 * at the source because every one of them failed SILENTLY on prod:
 *
 *   • "struggling right now" was a keyword scan; verified wrong answers never
 *     counted (keyword and verdict signals flagged disjoint students).
 *   • the live feed showed accuracy over every attempt, retries and skips
 *     included (64% read as 73% across 62 sessions); first-try counters
 *     existed on the conversation and nothing read them.
 *   • a text re-count was spread into findByIdAndUpdate under names the schema
 *     doesn't have, so Mongoose dropped it — a no-op that LOOKED like repair.
 *   • BKT's temporal decay never ran: the pipeline never passed daysSinceLast.
 *   • four per-student routes checked `{ _id, teacherId }`, which refuses every
 *     class-code student (one teacher: 73 of 73 "not assigned to you").
 */
const fs = require('fs');
const path = require('path');
const { detectStruggle } = require('../../utils/activitySummarizer');
const { updateBKT, initializeBKT } = require('../../utils/knowledgeTracer');

const read = (p) => fs.readFileSync(path.join(__dirname, '../../', p), 'utf8');

describe('detectStruggle reads verdicts, not just words', () => {
  const ai = (problemResult, content = 'Okay, next one.') => ({ role: 'assistant', content, problemResult });
  const user = (content) => ({ role: 'user', content });

  test('two verified wrong answers with no right one is struggle, whatever the student said', () => {
    const msgs = [user('12'), ai('incorrect'), user('14'), ai('incorrect'), user('ok')];
    const r = detectStruggle(msgs);
    expect(r.isStruggling).toBe(true);
    expect(r.evidence).toBe('2 wrong in a row');
    expect(r.severity).toBe('medium');
  });
  test('three wrong is high severity', () => {
    const msgs = [user('1'), ai('incorrect'), user('2'), ai('incorrect'), user('3'), ai('incorrect')];
    expect(detectStruggle(msgs).severity).toBe('high');
  });
  test('a right answer in the window clears the verdict signal', () => {
    const msgs = [user('1'), ai('incorrect'), user('2'), ai('correct'), user('3'), ai('incorrect')];
    expect(detectStruggle(msgs).isStruggling).toBe(false);
  });
  test('ungraded turns (no stamp) do not count as wrong', () => {
    const msgs = [user('hi'), ai(null), user('what is a fraction'), ai(null), user('thanks'), ai(null)];
    expect(detectStruggle(msgs).isStruggling).toBe(false);
  });
  test('the student saying they are lost still counts', () => {
    const msgs = [user('hi'), ai(null), user("i'm lost on this"), ai(null)];
    expect(detectStruggle(msgs)).toMatchObject({ isStruggling: true, evidence: 'said they are stuck' });
  });
});

describe('live feed: first-try accuracy, no phantom recount', () => {
  const route = read('routes/teacher.js');
  const feed = route.slice(route.indexOf("router.get('/live-feed'"), route.indexOf("router.get('/activity-feed'"));
  test('the feed ships the first-try counters beside the raw attempt counts', () => {
    expect(feed).toMatch(/firstTryAttempted: convo\.firstTryAttempted \|\| 0/);
    expect(feed).toMatch(/firstTryCorrect: convo\.firstTryCorrect \|\| 0/);
  });
  test('the summary refresh no longer spreads calculateProblemStats into the update', () => {
    expect(feed).not.toMatch(/\.\.\.calculateProblemStats\(convo/);
    expect(route).not.toMatch(/calculateProblemStats\s*\}\s*=\s*require/);
  });
  test('both live renderers compute the percentage from first-try, not every attempt', () => {
    const home = read('public/js/teacher-home.js');
    const live = read('public/js/teacher-live-feed.js');
    expect(home).toMatch(/firstTryCorrect[^\n]*\/ l\.firstTryAttempted/);
    expect(home).not.toMatch(/l\.problemsCorrect \/ l\.problemsAttempted/);
    expect(live).toMatch(/firstTryCorrect[^\n]*\/ ftAttempted/);
    expect(live).not.toMatch(/item\.problemsCorrect \/ item\.problemsAttempted/);
  });
});

describe('BKT decay actually runs', () => {
  test('the pipeline passes daysSinceLast from the state it is updating', () => {
    const src = read('utils/pipeline/index.js');
    expect(src).toMatch(/updateBKT\(bktState, isCorrect, \{ hintUsed, daysSinceLast \}\)/);
    expect(src).toMatch(/bktState\.lastObservation/);
  });
  test('a long gap lowers P(L) before the new evidence is applied', () => {
    let s = initializeBKT('x', 'default');
    for (let i = 0; i < 6; i++) s = updateBKT(s, true);
    const fresh = updateBKT(s, true, { daysSinceLast: 0 }).pLearned;
    const stale = updateBKT(s, true, { daysSinceLast: 60 }).pLearned;
    expect(stale).toBeLessThan(fresh);
  });
});

describe('per-student teacher routes authorize by roster, not teacherId', () => {
  const route = read('routes/teacher.js');
  test('no route looks a student up by { _id, teacherId }', () => {
    expect(route).not.toMatch(/User\.findOne\(\{ _id: [^}]*teacherId/);
    expect(route).not.toMatch(/User\.findOne\(\{ _id: conversation\.userId, teacherId \}/);
  });
  test('the roster check is the shared helper, with scope all (access, not aggregate)', () => {
    expect(route).toMatch(/async function teacherHasStudent\(teacherId, studentId\)/);
    expect(route).toMatch(/const ids = await getStudentIdsForTeacher\(teacherId\);/);
    for (const name of ['/reset-assessment', '/skill-report', '/growth-history', '/acknowledge']) {
      const i = route.indexOf(name);
      expect(i).toBeGreaterThan(-1);
      expect(route.slice(i, i + 1200)).toMatch(/teacherHasStudent\(/);
    }
  });
});

describe('one definition of active and of mastered on the server', () => {
  const route = read('routes/teacher.js');
  test('/classes counts work this week, not logins', () => {
    const classes = route.slice(route.indexOf("router.get('/classes'"), route.indexOf("router.get('/classes/:codeId/students'"));
    expect(classes).toMatch(/workedThisWeek\(s\)/);
    expect(classes).not.toMatch(/lastLogin\) > sevenDaysAgo/);
  });
  test('the Teaching Aide snapshot uses the same 7-day work rule, not a 2-day presence window', () => {
    expect(route).toMatch(/const isActive = workedThisWeek\(s\);/);
    expect(route).not.toMatch(/twoDaysAgo/);
  });
  test('the roster summarizes the DECODED mastery map (legacy and unified keys are one skill)', () => {
    const students = route.slice(route.indexOf("router.get('/students', isTeacher"), route.indexOf("router.get('/students/:studentId/iep'"));
    expect(students).toMatch(/decodedMasteryMap\(s\)/);
    expect(students).not.toMatch(/summarizeSkillMastery\(s\.skillMastery/);
  });
  test('course progress and skill gaps split mastered from placed-out with the shared predicates', () => {
    expect(route).toMatch(/if \(isDemonstratedMastery\(skillData\)\) mastered\+\+;/);
    expect(route).toMatch(/if \(isPlacedOut\(data\)\) continue;/);
  });
});

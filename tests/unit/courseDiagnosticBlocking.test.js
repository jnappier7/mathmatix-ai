/**
 * WHICH BASELINE IS ALLOWED TO HOLD THE TUTOR.
 *
 * THE BUG (owner report: "Financial lit course is broken. AI asks what problem
 * student wants to do"): consumer-math is not listed in COURSE_DIAGNOSTICS, so
 * buildCourseDiagnostic fell through to the required PRE_ASSESSMENT_CARD. Three
 * gates then read that `required` flag three different ways:
 *
 *   - routes/chat.js  (typing inside a course) → hand-narrowed to 'act-practice',
 *                       so teaching was NEVER gated for consumer-math
 *   - routes/courseChat.js (the greeting)      → blocked on `required`, so the
 *                       lesson opener was withheld
 *   - courseCatalog.js (the client)            → blocked on `required` too
 *
 * Net effect: the course opened with a modal and silence, and the free-chat
 * welcome filled the gap. These tests pin the single rule they now share.
 */

jest.mock('../../models/courseSession', () => ({ countDocuments: jest.fn() }));
jest.mock('../../models/actTestSession', () => ({ countDocuments: jest.fn() }));

const CourseSession = require('../../models/courseSession');
const ActTestSession = require('../../models/actTestSession');
const {
  BLOCKING_DIAGNOSTIC_TYPES,
  COURSE_DIAGNOSTICS,
  buildCourseDiagnostic,
  isRequiredBaselinePending,
} = require('../../utils/courseDiagnostic');

const user = { _id: 'u1' };

beforeEach(() => {
  CourseSession.countDocuments.mockResolvedValue(0);   // pre-assessment not done
  ActTestSession.countDocuments.mockResolvedValue(0);  // practice ACT not taken
});

describe('only a verified baseline runner may block', () => {
  test('the ACT practice test is the one blocking type', () => {
    expect([...BLOCKING_DIAGNOSTIC_TYPES]).toEqual(['act-practice']);
  });

  test('act-prep: required AND blocking', async () => {
    const d = await buildCourseDiagnostic(user, 'act-prep');
    expect(d).toMatchObject({ type: 'act-practice', required: true, blocking: true });
    expect((await isRequiredBaselinePending(user, 'act-prep')).pending).toBe(true);
  });

  test('consumer-math: required, NOT blocking — the lesson starts', async () => {
    const d = await buildCourseDiagnostic(user, 'consumer-math');
    expect(d).toMatchObject({ type: 'course-preassessment', required: true, blocking: false });
    expect((await isRequiredBaselinePending(user, 'consumer-math')).pending).toBe(false);
  });

  test('the card still comes back so the course can nudge with it', async () => {
    const { pending, diagnostic } = await isRequiredBaselinePending(user, 'consumer-math');
    expect(pending).toBe(false);
    expect(diagnostic.cta).toBe('Start the check');
  });

  test('a starting-point course is neither required nor blocking', async () => {
    const d = await buildCourseDiagnostic(user, 'algebra-2');
    expect(d).toMatchObject({ type: 'starting-point', required: false, blocking: false });
    expect((await isRequiredBaselinePending(user, 'algebra-2')).pending).toBe(false);
  });
});

describe('every other pathway course behaves like consumer-math', () => {
  // These all fall through to the default pre-assessment card. None of them has a
  // verified runner, so none may silence its tutor.
  const unlisted = ['6th-grade-math', '7th-grade-math', 'grade-8-math',
    'geometry', 'early-math-foundations', 'parent-math-k2'];

  test.each(unlisted)('%s opens with a lesson, not silence', async (courseId) => {
    expect(COURSE_DIAGNOSTICS[courseId]).toBeUndefined();
    expect((await isRequiredBaselinePending(user, courseId)).pending).toBe(false);
  });
});

describe('a satisfied diagnostic disappears entirely', () => {
  test('pre-assessment already taken → no card', async () => {
    CourseSession.countDocuments.mockResolvedValue(1);
    expect(await buildCourseDiagnostic(user, 'consumer-math')).toBeNull();
  });

  test('practice ACT already taken → no card, nothing pending', async () => {
    ActTestSession.countDocuments.mockResolvedValue(1);
    expect(await buildCourseDiagnostic(user, 'act-prep')).toBeNull();
    expect((await isRequiredBaselinePending(user, 'act-prep')).pending).toBe(false);
  });
});

describe('the gates read the shared rule instead of hand-rolling it', () => {
  const fs = require('fs');
  const path = require('path');
  const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

  test('routes/chat.js no longer re-narrows to act-practice itself', () => {
    const src = read('routes/chat.js');
    expect(src).not.toMatch(/pending && diagnostic\?\.type === 'act-practice'/);
    expect(src).toMatch(/isRequiredBaselinePending/);
  });

  test('the client holds on `blocking`, not `required`', () => {
    const src = read('public/js/courseCatalog.js');
    expect(src).toMatch(/diagnostic\.blocking !== undefined \? diagnostic\.blocking : diagnostic\.required/);
  });
});

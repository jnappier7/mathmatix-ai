/**
 * Class-scoped teacher resources.
 *
 * A teacher uploads a file (pdf / doc / png / jpeg) and picks which of their
 * classes it goes to. teacherResource.sharedWithClassIds carries that choice,
 * and EVERY student-facing read has to be filtered by it:
 *
 *   1. GET /my-teacher-resources   — the list the student browses
 *   2. GET /download/:id           — the bytes themselves
 *   3. the AI tutor's resource lookup in routes/chat.js — which injects the
 *      resource's extracted TEXT into the prompt
 *
 * (3) is the one that leaks quietly. Filter the list and the download but not
 * the tutor, and a student in Class B still gets Class A's test read to them
 * for the asking. All three compose the same two helpers, and these tests pin
 * those helpers.
 *
 * THE BACKWARD-COMPATIBILITY RULE: an empty sharedWithClassIds means "all this
 * teacher's students". Every resource uploaded before this field existed has no
 * value for it, so anything stricter would silently un-share every file already
 * in production the day it deployed.
 */

const mongoose = require('mongoose');
const { resourceVisibleToStudent } = require('../../utils/resourceVisibility');
const TeacherResource = require('../../models/teacherResource');

const oid = () => new mongoose.Types.ObjectId();

const CLASS_A = oid();
const CLASS_B = oid();
const TEACHER = oid();

const res = (over = {}) => ({
  isPublished: true,
  sharedWithClassIds: [],
  ...over,
});

describe('resourceVisibleToStudent', () => {
  test('a resource targeted at no class reaches every student of the teacher', () => {
    // The legacy shape. Must stay visible or every pre-existing upload vanishes.
    expect(resourceVisibleToStudent(res(), [CLASS_A])).toBe(true);
    expect(resourceVisibleToStudent(res(), [])).toBe(true);
  });

  test('a resource with the field entirely absent is also teacher-wide', () => {
    // Documents written before the field existed have no array at all.
    const legacy = { isPublished: true };
    expect(resourceVisibleToStudent(legacy, [CLASS_A])).toBe(true);
  });

  test('a class-targeted resource reaches a student in that class', () => {
    expect(resourceVisibleToStudent(res({ sharedWithClassIds: [CLASS_A] }), [CLASS_A])).toBe(true);
  });

  test('a class-targeted resource does NOT reach a student in another class', () => {
    expect(resourceVisibleToStudent(res({ sharedWithClassIds: [CLASS_A] }), [CLASS_B])).toBe(false);
  });

  test('a class-targeted resource does NOT reach a student in no classes', () => {
    expect(resourceVisibleToStudent(res({ sharedWithClassIds: [CLASS_A] }), [])).toBe(false);
  });

  test('a resource shared with several classes reaches a student in any one of them', () => {
    const r = res({ sharedWithClassIds: [CLASS_A, CLASS_B] });
    expect(resourceVisibleToStudent(r, [CLASS_B])).toBe(true);
  });

  test('ids compare by VALUE — ObjectId vs string must not miss', () => {
    // The student's class ids come back as ObjectIds from Mongo; the
    // resource's may be either depending on lean()/populate. Identity
    // comparison here would hide every class-shared file from its own class.
    const r = res({ sharedWithClassIds: [String(CLASS_A)] });
    expect(resourceVisibleToStudent(r, [CLASS_A])).toBe(true);
    expect(resourceVisibleToStudent(res({ sharedWithClassIds: [CLASS_A] }), [String(CLASS_A)])).toBe(true);
  });

  test('unpublished beats every share setting', () => {
    const r = res({ isPublished: false, sharedWithClassIds: [CLASS_A] });
    expect(resourceVisibleToStudent(r, [CLASS_A])).toBe(false);
  });

  test('a missing resource is not visible', () => {
    expect(resourceVisibleToStudent(null, [CLASS_A])).toBe(false);
    expect(resourceVisibleToStudent(undefined, [])).toBe(false);
  });

  test('a null class list is treated as no classes, never as a wildcard', () => {
    // Defensive: if a caller ever forgets to await getStudentClassIds, the
    // failure must be "sees less", not "sees everything".
    expect(resourceVisibleToStudent(res({ sharedWithClassIds: [CLASS_A] }), null)).toBe(false);
    expect(resourceVisibleToStudent(res({ sharedWithClassIds: [CLASS_A] }), undefined)).toBe(false);
  });
});

describe('TeacherResource.visibleToStudentFilter', () => {
  test('always pins the teacher and the published flag', () => {
    const f = TeacherResource.visibleToStudentFilter(TEACHER, [CLASS_A]);
    expect(f.teacherId).toBe(TEACHER);
    expect(f.isPublished).toBe(true);
  });

  test('a student filter admits teacher-wide OR my-class resources', () => {
    const f = TeacherResource.visibleToStudentFilter(TEACHER, [CLASS_A]);
    expect(f.$or).toEqual(expect.arrayContaining([
      { sharedWithClassIds: { $size: 0 } },
      { sharedWithClassIds: { $exists: false } },
      { sharedWithClassIds: { $in: [CLASS_A] } },
    ]));
  });

  test('a student in NO classes still gets a class clause, not an unscoped query', () => {
    // [] is a real answer ("enrolled in nothing"), and must still exclude
    // class-targeted files. Only a non-array means "teacher view, no scoping".
    const f = TeacherResource.visibleToStudentFilter(TEACHER, []);
    expect(f.$or).toBeDefined();
    expect(f.$or).toContainEqual({ sharedWithClassIds: { $in: [] } });
  });

  test('omitting classIds means the TEACHER view — no class clause at all', () => {
    expect(TeacherResource.visibleToStudentFilter(TEACHER).$or).toBeUndefined();
    expect(TeacherResource.visibleToStudentFilter(TEACHER, null).$or).toBeUndefined();
  });
});

describe('TeacherResource.search — the two $or clauses must not collide', () => {
  // search() builds a text-match $or of its own. Spreading it onto the
  // visibility filter (which also has $or) would drop one of them; whichever
  // lost would either break search or, far worse, drop the class scoping and
  // return every resource the teacher owns.
  let captured;
  const fakeThis = {
    visibleToStudentFilter: TeacherResource.visibleToStudentFilter,
    find(q) { captured = q; return { sort: () => q }; },
  };

  beforeEach(() => { captured = undefined; });

  test('a class-scoped search keeps BOTH the visibility and the text clause', () => {
    TeacherResource.search.call(fakeThis, TEACHER, 'module 6', [CLASS_A]);

    expect(captured.teacherId).toBe(TEACHER);
    expect(captured.isPublished).toBe(true);
    expect(Array.isArray(captured.$and)).toBe(true);
    expect(captured.$and).toHaveLength(2);

    const [visibility, text] = captured.$and;
    expect(visibility.$or).toContainEqual({ sharedWithClassIds: { $in: [CLASS_A] } });
    expect(text.$or.some(c => c.displayName)).toBe(true);
    // The top level must not ALSO carry a bare $or that would override $and.
    expect(captured.$or).toBeUndefined();
  });

  test('a teacher-view search needs no $and — just the text clause', () => {
    TeacherResource.search.call(fakeThis, TEACHER, 'module 6');
    expect(captured.$and).toBeUndefined();
    expect(captured.$or.some(c => c.displayName)).toBe(true);
  });

  test('the search text is regex-escaped so "(A)" cannot blow up the query', () => {
    TeacherResource.search.call(fakeThis, TEACHER, 'Module 8 Test (A)', [CLASS_A]);
    const text = captured.$and[1];
    expect(() => new RegExp(text.$or[0].displayName.$regex)).not.toThrow();
  });
});

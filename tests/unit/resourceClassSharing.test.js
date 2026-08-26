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
const {
    resourceVisibleToStudent,
    teacherResourceFileAccess,
} = require('../../utils/resourceVisibility');
const TeacherResource = require('../../models/teacherResource');

const oid = () => new mongoose.Types.ObjectId();

const CLASS_A = oid();
const CLASS_B = oid();
const TEACHER = oid();
const OTHER_TEACHER = oid();

const res = (over = {}) => ({
  isPublished: true,
  teacherId: TEACHER,
  sharedWithClassIds: [],
  ...over,
});

// A student's resolved scope, as getStudentScope() returns it.
const scope = (classIds = [], teacherIds = [TEACHER]) => ({ teacherIds, classIds });

describe('resourceVisibleToStudent', () => {
  test('a resource targeted at no class reaches every student of the teacher', () => {
    // The legacy shape. Must stay visible or every pre-existing upload vanishes.
    expect(resourceVisibleToStudent(res(), scope([CLASS_A]))).toBe(true);
    expect(resourceVisibleToStudent(res(), scope([]))).toBe(true);
  });

  test('a resource with the field entirely absent is also teacher-wide', () => {
    // Documents written before the field existed have no array at all.
    const legacy = { isPublished: true, teacherId: TEACHER };
    expect(resourceVisibleToStudent(legacy, scope([CLASS_A]))).toBe(true);
  });

  test('a class-targeted resource reaches a student in that class', () => {
    expect(resourceVisibleToStudent(res({ sharedWithClassIds: [CLASS_A] }), scope([CLASS_A]))).toBe(true);
  });

  test('a class-targeted resource does NOT reach a student in another class', () => {
    expect(resourceVisibleToStudent(res({ sharedWithClassIds: [CLASS_A] }), scope([CLASS_B]))).toBe(false);
  });

  test('a class-targeted resource does NOT reach a student in no classes', () => {
    expect(resourceVisibleToStudent(res({ sharedWithClassIds: [CLASS_A] }), scope([]))).toBe(false);
  });

  test('a resource shared with several classes reaches a student in any one of them', () => {
    const r = res({ sharedWithClassIds: [CLASS_A, CLASS_B] });
    expect(resourceVisibleToStudent(r, scope([CLASS_B]))).toBe(true);
  });

  test('ids compare by VALUE — ObjectId vs string must not miss', () => {
    // The student's class ids come back as ObjectIds from Mongo; the
    // resource's may be either depending on lean()/populate. Identity
    // comparison here would hide every class-shared file from its own class.
    const r = res({ sharedWithClassIds: [String(CLASS_A)] });
    expect(resourceVisibleToStudent(r, scope([CLASS_A]))).toBe(true);
    expect(resourceVisibleToStudent(res({ sharedWithClassIds: [CLASS_A] }), scope([String(CLASS_A)]))).toBe(true);
  });

  test('unpublished beats every share setting', () => {
    const r = res({ isPublished: false, sharedWithClassIds: [CLASS_A] });
    expect(resourceVisibleToStudent(r, scope([CLASS_A]))).toBe(false);
  });

  test('a missing resource is not visible', () => {
    expect(resourceVisibleToStudent(null, scope([CLASS_A]))).toBe(false);
    expect(resourceVisibleToStudent(undefined, scope([]))).toBe(false);
  });

  test('a null class list is treated as no classes, never as a wildcard', () => {
    // Defensive: if a caller ever forgets to await getStudentClassIds, the
    // failure must be "sees less", not "sees everything".
    expect(resourceVisibleToStudent(res({ sharedWithClassIds: [CLASS_A] }), { teacherIds: [TEACHER], classIds: null })).toBe(false);
    expect(resourceVisibleToStudent(res({ sharedWithClassIds: [CLASS_A] }), undefined)).toBe(false);
  });
});

describe('getStudentScope — deriving the teacher set from enrolment', () => {
  // The point of this function: user.teacherId is ONE teacher and the student
  // may have several. The set comes from the classes they are enrolled in,
  // with the pointer folded in (not replaced) so students assigned directly by
  // Clever or an admin, who may have no EnrollmentCode at all, keep their
  // teacher.
  const EnrollmentCode = require('../../models/enrollmentCode');
  const { getStudentScope } = require('../../utils/resourceVisibility');

  const mockCodes = (codes) => {
    jest.spyOn(EnrollmentCode, 'find').mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(codes) })
    });
  };

  afterEach(() => jest.restoreAllMocks());

  test('unions the pointer with every enrolled class\'s teacher', async () => {
    mockCodes([
      { _id: CLASS_A, teacherId: TEACHER },
      { _id: CLASS_B, teacherId: OTHER_TEACHER },
    ]);
    const s = await getStudentScope({ _id: oid(), teacherId: TEACHER });
    expect(s.classIds).toEqual([CLASS_A, CLASS_B]);
    expect(s.teacherIds.map(String).sort()).toEqual([String(TEACHER), String(OTHER_TEACHER)].sort());
  });

  test('de-duplicates a teacher who owns two of the student\'s classes', async () => {
    // ObjectIds are distinct objects even for the same id, so a naive Set
    // would report the same teacher twice and blow up the $in.
    mockCodes([
      { _id: CLASS_A, teacherId: TEACHER },
      { _id: CLASS_B, teacherId: new mongoose.Types.ObjectId(String(TEACHER)) },
    ]);
    const s = await getStudentScope({ _id: oid(), teacherId: TEACHER });
    expect(s.teacherIds).toHaveLength(1);
  });

  test('keeps the pointer when the student has no classes at all', async () => {
    // Clever/admin-assigned students. Dropping the pointer here would strip
    // them of every resource they can currently see.
    mockCodes([]);
    const s = await getStudentScope({ _id: oid(), teacherId: TEACHER });
    expect(s.teacherIds.map(String)).toEqual([String(TEACHER)]);
    expect(s.classIds).toEqual([]);
  });

  test('a student with no pointer still gets teachers from their classes', async () => {
    mockCodes([{ _id: CLASS_A, teacherId: OTHER_TEACHER }]);
    const s = await getStudentScope({ _id: oid(), teacherId: null });
    expect(s.teacherIds.map(String)).toEqual([String(OTHER_TEACHER)]);
  });

  test('always returns arrays, never null — a non-array unscopes the query', async () => {
    const s = await getStudentScope(null);
    expect(s).toEqual({ teacherIds: [], classIds: [], primaryTeacherId: null });
  });
});

describe('pickPrimaryTeacher — most recent wins, not "strictest"', () => {
  // Resources UNION across a student's teachers. Curriculum and
  // classAISettings cannot: each is one coherent set of teaching instructions,
  // rendered into the prompt as prose, so merging two teachers stacks
  // contradictions ("use the balance method" beside "use opposite operations")
  // rather than producing a stricter result. And most of classAISettings has no
  // strictness axis to merge along — PEMDAS vs GEMS is a convention, not a
  // severity — while the axes that do exist run the wrong way: the "strict" end
  // of scaffoldingLevel is 1 (minimal hints) and of manipulatives is
  // allowed:false, which are the supports IEP students depend on.
  const { pickPrimaryTeacher } = require('../../utils/resourceVisibility');

  const STUDENT = oid();
  const enrolled = (teacherId, enrolledAt) => ({
    teacherId,
    enrolledStudents: [{ studentId: STUDENT, enrolledAt }],
  });

  test('the most recently joined class decides', () => {
    const codes = [
      enrolled(TEACHER, new Date('2026-01-10')),
      enrolled(OTHER_TEACHER, new Date('2026-03-02')),
    ];
    expect(String(pickPrimaryTeacher({ _id: STUDENT }, codes))).toBe(String(OTHER_TEACHER));
  });

  test('order in the array does not decide — the timestamp does', () => {
    // Guard against "last document Mongo returned" masquerading as recency.
    const codes = [
      enrolled(OTHER_TEACHER, new Date('2026-03-02')),
      enrolled(TEACHER, new Date('2026-01-10')),
    ];
    expect(String(pickPrimaryTeacher({ _id: STUDENT }, codes))).toBe(String(OTHER_TEACHER));
  });

  test('recency is read from THIS student\'s enrolment, not the class\'s', () => {
    // Two students in one class join at different times; the other student's
    // row must not be what we time.
    const codes = [
      {
        teacherId: TEACHER,
        enrolledStudents: [
          { studentId: oid(), enrolledAt: new Date('2027-01-01') }, // someone else, newer
          { studentId: STUDENT, enrolledAt: new Date('2026-01-01') },
        ],
      },
      enrolled(OTHER_TEACHER, new Date('2026-06-01')),
    ];
    expect(String(pickPrimaryTeacher({ _id: STUDENT }, codes))).toBe(String(OTHER_TEACHER));
  });

  test('a class with no enrolledAt never displaces one that has it', () => {
    const codes = [
      enrolled(TEACHER, new Date('2026-01-10')),
      { teacherId: OTHER_TEACHER, enrolledStudents: [{ studentId: STUDENT }] },
    ];
    expect(String(pickPrimaryTeacher({ _id: STUDENT }, codes))).toBe(String(TEACHER));
  });

  test('falls back to user.teacherId when there are no classes', () => {
    // Clever- and admin-assigned students have no EnrollmentCode at all.
    expect(String(pickPrimaryTeacher({ _id: STUDENT, teacherId: TEACHER }, []))).toBe(String(TEACHER));
    expect(String(pickPrimaryTeacher({ _id: STUDENT, teacherId: TEACHER }, undefined))).toBe(String(TEACHER));
  });

  test('enrolment BEATS the stale pointer', () => {
    // The whole point: user.teacherId is only most-recent by accident —
    // admin.js sets it just `if (!student.teacherId)` and cleverSync assigns
    // whichever section it processed last.
    const codes = [enrolled(OTHER_TEACHER, new Date('2026-05-01'))];
    expect(String(pickPrimaryTeacher({ _id: STUDENT, teacherId: TEACHER }, codes)))
      .toBe(String(OTHER_TEACHER));
  });

  test('no classes and no pointer resolves to null, not undefined', () => {
    expect(pickPrimaryTeacher({ _id: STUDENT }, [])).toBeNull();
  });

  test('a class with no teacher is skipped rather than winning as null', () => {
    const codes = [
      { teacherId: null, enrolledStudents: [{ studentId: STUDENT, enrolledAt: new Date('2027-01-01') }] },
      enrolled(TEACHER, new Date('2026-01-01')),
    ];
    expect(String(pickPrimaryTeacher({ _id: STUDENT }, codes))).toBe(String(TEACHER));
  });
});

describe('a student with more than one teacher', () => {
  // The relationship is many-to-many through EnrollmentCode — nothing stops a
  // student being in two teachers' classes, and teacher.js's "one class at a
  // time" rule is scoped per-teacher, which permits it by design.
  // `user.teacherId` is only whichever teacher was joined LAST: routes/student.js
  // overwrites it on every class join, and Clever sync assigns whichever section
  // it processed last. So the teacher set is derived, never read off that field.

  test('sees a teacher-wide resource from EITHER teacher', () => {
    const both = scope([], [TEACHER, OTHER_TEACHER]);
    expect(resourceVisibleToStudent(res({ teacherId: TEACHER }), both)).toBe(true);
    expect(resourceVisibleToStudent(res({ teacherId: OTHER_TEACHER }), both)).toBe(true);
  });

  test('sees a class-targeted resource from the second teacher', () => {
    // The regression the single pointer caused: join teacher B's class, and
    // teacher A's materials silently disappear (or B's never appear).
    const r = res({ teacherId: OTHER_TEACHER, sharedWithClassIds: [CLASS_B] });
    expect(resourceVisibleToStudent(r, scope([CLASS_A, CLASS_B], [TEACHER, OTHER_TEACHER]))).toBe(true);
  });

  test('still cannot see a resource from a teacher who is NOT theirs', () => {
    // Multi-teacher must widen the set, not remove the check.
    const r = res({ teacherId: OTHER_TEACHER });
    expect(resourceVisibleToStudent(r, scope([CLASS_A], [TEACHER]))).toBe(false);
  });

  test('a class from teacher A does not unlock teacher B\'s class-targeted file', () => {
    // Class ids are globally unique, so this is really a guard against a future
    // refactor comparing class membership without the teacher check.
    const r = res({ teacherId: OTHER_TEACHER, sharedWithClassIds: [CLASS_B] });
    expect(resourceVisibleToStudent(r, scope([CLASS_A], [TEACHER, OTHER_TEACHER]))).toBe(false);
  });

  test('no teachers at all sees nothing', () => {
    expect(resourceVisibleToStudent(res(), scope([CLASS_A], []))).toBe(false);
  });
});

describe('TeacherResource.visibleToStudentFilter', () => {
  test('an ARRAY of teachers becomes an $in, so both teachers are queried', () => {
    const f = TeacherResource.visibleToStudentFilter([TEACHER, OTHER_TEACHER], []);
    expect(f.teacherId).toEqual({ $in: [TEACHER, OTHER_TEACHER] });
  });

  test('a single teacher id is still passed through unwrapped', () => {
    // The teacher's own views pass one id; wrapping it would change the query
    // shape for every existing caller.
    expect(TeacherResource.visibleToStudentFilter(TEACHER, []).teacherId).toBe(TEACHER);
  });

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

describe('teacherResourceFileAccess — the /uploads/... static-file route', () => {
    // config/routes.js serves resource bytes by PATH
    // (/uploads/teacher-resources/:teacherId/:filename) before any
    // TeacherResource document is loaded, so it authorizes on ownership alone.
    // It used to do that with `user.role === 'teacher'` / `=== 'student'` —
    // the ACTIVE role, i.e. whichever dashboard the account is looking at right
    // now — so a multi-role account was denied its own files with a bare 403
    // and no log line to explain it (CLAUDE.md §12).
    //
    // :teacherId arrives off req.params, so it is always a STRING here while
    // user._id / user.teacherId are ObjectIds. Every case below keeps that
    // asymmetry rather than comparing ObjectId to ObjectId, because a rule that
    // only holds for matching types would pass here and 403 in production.
    const dir = (id) => String(id);

    test('a single-role teacher reaches their own directory', () => {
        const user = { _id: TEACHER, role: 'teacher', roles: ['teacher'] };
        expect(teacherResourceFileAccess(user, dir(TEACHER))).toEqual({
            allowed: true,
            asStudent: false,
        });
    });

    test('a teacher who also holds parent reaches their own files while viewing the parent dashboard', () => {
        // THE BUG. roles=['teacher','parent'] with role='parent' is a teacher
        // who clicked over to their parent view; `user.role === 'teacher'` is
        // false for them and every resource link on the page 403'd.
        const user = { _id: TEACHER, role: 'parent', roles: ['teacher', 'parent'] };
        expect(teacherResourceFileAccess(user, dir(TEACHER))).toEqual({
            allowed: true,
            asStudent: false,
        });
    });

    test('a student who also holds parent reaches their teacher’s files after switching views', () => {
        const user = {
            _id: oid(),
            teacherId: TEACHER,
            role: 'parent',
            roles: ['student', 'parent'],
        };
        expect(teacherResourceFileAccess(user, dir(TEACHER))).toEqual({
            allowed: true,
            asStudent: true,
        });
    });

    test('asStudent gates the publish check, so an owner teacher can open their own unpublished drafts', () => {
        // A teacher who also holds student, assigned to themselves, satisfies
        // BOTH branches now that each matches on roles held. The owner branch
        // has to win — otherwise the route runs its isPublished check and the
        // teacher cannot preview a draft they have not shared yet.
        const user = {
            _id: TEACHER,
            teacherId: TEACHER,
            role: 'teacher',
            roles: ['teacher', 'student'],
        };
        expect(teacherResourceFileAccess(user, dir(TEACHER))).toEqual({
            allowed: true,
            asStudent: false,
        });
    });

    test('legacy documents with no roles[] still authorize off the single role string', () => {
        // roles[] was backfilled; anything written before it must not lose access.
        expect(teacherResourceFileAccess({ _id: TEACHER, role: 'teacher' }, dir(TEACHER)))
            .toEqual({ allowed: true, asStudent: false });
        expect(teacherResourceFileAccess({ _id: oid(), teacherId: TEACHER, role: 'student' }, dir(TEACHER)))
            .toEqual({ allowed: true, asStudent: true });
    });

    describe('and still denies everyone it denied before', () => {
        test('another teacher’s directory', () => {
            const user = { _id: OTHER_TEACHER, role: 'teacher', roles: ['teacher'] };
            expect(teacherResourceFileAccess(user, dir(TEACHER)).allowed).toBe(false);
        });

        test('a student of a different teacher', () => {
            const user = { _id: oid(), teacherId: OTHER_TEACHER, role: 'student', roles: ['student'] };
            expect(teacherResourceFileAccess(user, dir(TEACHER)).allowed).toBe(false);
        });

        test('a student with no teacher at all', () => {
            const user = { _id: oid(), role: 'student', roles: ['student'] };
            expect(teacherResourceFileAccess(user, dir(TEACHER)).allowed).toBe(false);
        });

        test('a parent — holding parent is not holding teacher or student', () => {
            // The widening is to roles HELD, not to "any authenticated user".
            const user = { _id: oid(), teacherId: TEACHER, role: 'parent', roles: ['parent'] };
            expect(teacherResourceFileAccess(user, dir(TEACHER)).allowed).toBe(false);
        });

        test('an admin who holds neither teacher nor student', () => {
            const user = { _id: oid(), role: 'admin', roles: ['admin'] };
            expect(teacherResourceFileAccess(user, dir(TEACHER)).allowed).toBe(false);
        });

        test('missing user or missing directory, without throwing', () => {
            // The route calls User.findById first; a deleted account yields null.
            expect(teacherResourceFileAccess(null, dir(TEACHER))).toEqual({ allowed: false, asStudent: false });
            expect(teacherResourceFileAccess({ role: 'teacher' }, dir(TEACHER))).toEqual({ allowed: false, asStudent: false });
            expect(teacherResourceFileAccess({ _id: TEACHER, role: 'teacher' }, undefined)).toEqual({ allowed: false, asStudent: false });
        });
    });
});

describe('the /uploads/teacher-resources route is wired to that rule', () => {
    // config/routes.js requires all 85 route modules at import time, so it
    // cannot be require()'d in a test (see staticHtmlCspGate.test.js). The
    // failure mode worth pinning is not a wrong comparison but a regression
    // back to an INLINE one, which is visible in the source.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../../config/routes.js'), 'utf8');
    const handler = src.slice(
        src.indexOf("app.get('/uploads/teacher-resources/:teacherId/:filename'"),
        src.indexOf("app.get('/js/tutor-config-data.js'")
    );

    test('the handler was found, so the assertions below mean something', () => {
        expect(handler).toContain('sendFile');
        expect(handler.length).toBeGreaterThan(200);
    });

    test('it delegates to teacherResourceFileAccess', () => {
        expect(handler).toContain('teacherResourceFileAccess(user, teacherId)');
        expect(src).toContain("require('../utils/resourceVisibility')");
    });

    test('it never compares the ACTIVE role', () => {
        expect(handler).not.toMatch(/\.role\s*===/);
        expect(handler).not.toMatch(/\.role\s*!==/);
    });

    test('the publish check still runs on the student branch only', () => {
        expect(handler).toContain('if (asStudent)');
        expect(handler).toContain('isPublished === false');
        expect(handler.indexOf('if (asStudent)')).toBeLessThan(handler.indexOf('isPublished === false'));
    });
});

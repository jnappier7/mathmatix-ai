/**
 * Multi-role accounts must be findable by every role they HOLD.
 *
 * The owner's admin account carries roles=['admin','parent','student','teacher']
 * with role='admin' as the active dashboard. Every directory listing and every
 * link lookup used to filter on `role` — the active one — so that account was
 * invisible as a parent, unlinkable as a student, and absent from the parent
 * lists entirely. Nothing errored; the queries just returned nothing.
 *
 * This drives a real in-memory MongoDB so the assertions are about what Mongo
 * actually matches, not about how a filter object is shaped. A pure-unit
 * version of this test would have passed all along.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../models/user');
const { anyRole, withoutRoles } = require('../../utils/roleQuery');
const { teacherResourceFileAccess } = require('../../utils/resourceVisibility');
const { canImpersonate } = require('../../middleware/impersonation');
const impersonationRoutes = require('../../routes/impersonation');
const express = require('express');
const request = require('supertest');
const { hasStaffRoleBypass } = require('../../middleware/usageGate');

let mem;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
}, 60000); // first run may download the mongod binary

afterAll(async () => {
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

afterEach(async () => {
  await User.deleteMany({});
});

let seq = 0;
async function makeUser(role, roles, extra = {}) {
  seq += 1;
  return User.create({
    firstName: 'Test',
    lastName: `User${seq}`,
    username: `user${seq}`,
    email: `user${seq}@example.com`,
    passwordHash: 'x'.repeat(20),
    role,
    ...(roles ? { roles } : {}),
    ...extra,
  });
}

describe('multi-role account visibility', () => {
  test('an admin who also holds parent is found by a parent-directory query', async () => {
    const owner = await makeUser('admin', ['admin', 'parent', 'student', 'teacher']);
    await makeUser('parent');

    // The old filter — this is the bug, kept as an explicit assertion so a
    // regression back to `{ role: 'parent' }` fails here loudly.
    const byActiveRole = await User.find({ role: 'parent' }).lean();
    expect(byActiveRole.map(u => u._id.toString())).not.toContain(owner._id.toString());

    const byHeldRoles = await User.find(anyRole('parent')).lean();
    expect(byHeldRoles.map(u => u._id.toString())).toContain(owner._id.toString());
    expect(byHeldRoles).toHaveLength(2); // the owner AND the plain parent
  });

  test('the same account is findable as student, teacher and admin too', async () => {
    const owner = await makeUser('admin', ['admin', 'parent', 'student', 'teacher']);

    for (const role of ['admin', 'parent', 'student', 'teacher']) {
      const found = await User.findOne({ _id: owner._id, ...anyRole(role) }).lean();
      expect(found).not.toBeNull();
      expect(found._id.toString()).toBe(owner._id.toString());
    }
  });

  test('a single-role account is unaffected and stays correctly scoped', async () => {
    const parent = await makeUser('parent');

    expect(await User.findOne({ _id: parent._id, ...anyRole('parent') })).not.toBeNull();
    expect(await User.findOne({ _id: parent._id, ...anyRole('teacher') })).toBeNull();
  });

  test('legacy documents with no roles[] still match via the role fallback', async () => {
    // The pre-save hook backfills roles[], so bypass it to simulate a document
    // written before that hook existed.
    const legacy = await makeUser('parent');
    await User.collection.updateOne({ _id: legacy._id }, { $unset: { roles: '' } });

    const raw = await User.collection.findOne({ _id: legacy._id });
    expect(raw.roles).toBeUndefined();

    const found = await User.findOne({ _id: legacy._id, ...anyRole('parent') }).lean();
    expect(found).not.toBeNull();
  });

  test('anyRole composes with other clauses instead of replacing them', async () => {
    const teacher = await makeUser('teacher');
    const mine = await makeUser('student', null, { teacherId: teacher._id });
    await makeUser('student'); // another teacher's student — must not match

    const roster = await User.find({ teacherId: teacher._id, ...anyRole('student') }).lean();
    expect(roster).toHaveLength(1);
    expect(roster[0]._id.toString()).toBe(mine._id.toString());
  });

  test('withoutRoles excludes a multi-role admin that $ne:admin would leak', async () => {
    const owner = await makeUser('admin', ['admin', 'parent']);
    const student = await makeUser('student');

    // Impersonation target lists use this. `role: { $ne: 'admin' }` would offer
    // up an account that HOLDS admin the moment it switched to its parent view.
    const leaky = await User.find({ role: { $ne: 'admin' } }).lean();
    const safe = await User.find(withoutRoles('admin')).lean();

    await User.findByIdAndUpdate(owner._id, { role: 'parent' }); // owner switches dashboards
    const leakyAfterSwitch = await User.find({ role: { $ne: 'admin' } }).lean();
    const safeAfterSwitch = await User.find(withoutRoles('admin')).lean();

    expect(leaky.map(u => u._id.toString())).not.toContain(owner._id.toString());
    expect(leakyAfterSwitch.map(u => u._id.toString())).toContain(owner._id.toString());

    expect(safe.map(u => u._id.toString())).toEqual([student._id.toString()]);
    expect(safeAfterSwitch.map(u => u._id.toString())).toEqual([student._id.toString()]);
  });
});

describe('linking a multi-role account', () => {
  test('parent↔student links resolve when the parent holds parent as a non-active role', async () => {
    const owner = await makeUser('admin', ['admin', 'parent']);
    const child = await makeUser('student');

    // The lookup admin/link-parent-student and student/link-to-parent perform.
    const parent = await User.findOne({ _id: owner._id, ...anyRole('parent') });
    const student = await User.findOne({ _id: child._id, ...anyRole('student') });
    expect(parent).not.toBeNull();
    expect(student).not.toBeNull();

    await User.findByIdAndUpdate(parent._id, { $addToSet: { children: student._id } });
    await User.findByIdAndUpdate(student._id, { $addToSet: { parentIds: parent._id } });

    const reloadedParent = await User.findById(owner._id).lean();
    const reloadedChild = await User.findById(child._id).lean();
    expect(reloadedParent.children.map(String)).toContain(child._id.toString());
    expect(reloadedChild.parentIds.map(String)).toContain(owner._id.toString());
  });

  test('an account holding both parent and student can link its two roles together', async () => {
    // What the owner asked for: one account that is a parent of its own student
    // role, so the parent dashboard has something to show while testing.
    const self = await makeUser('admin', ['admin', 'parent', 'student']);

    const asParent = await User.findOne({ _id: self._id, ...anyRole('parent') });
    const asStudent = await User.findOne({ _id: self._id, ...anyRole('student') });
    expect(asParent).not.toBeNull();
    expect(asStudent).not.toBeNull();

    await User.findByIdAndUpdate(self._id, {
      $addToSet: { children: self._id, parentIds: self._id },
    });

    const reloaded = await User.findById(self._id).lean();
    expect(reloaded.children.map(String)).toEqual([self._id.toString()]);
    expect(reloaded.parentIds.map(String)).toEqual([self._id.toString()]);
  });
});

describe('reaching a teacher’s uploaded resources', () => {
  // config/routes.js serves resource bytes straight off disk at
  // /uploads/teacher-resources/:teacherId/:filename. It authorized with
  // `user.role === 'teacher'` / `=== 'student'` — the ACTIVE role — so a
  // multi-role account got a bare 403 on its own materials the moment it
  // switched dashboards. The rule now lives in utils/resourceVisibility.js.
  //
  // The unit tests in tests/unit/resourceClassSharing.test.js cover the branch
  // logic against plain objects. What needs a real database is the shape the
  // route actually holds: it does `User.findById(req.user._id)`, so the rule is
  // handed a MONGOOSE DOCUMENT, whose roles[] is a CoreMongooseArray and whose
  // _id/teacherId are ObjectIds — while :teacherId off req.params is a string.
  // A rule that only worked on POJOs would pass the unit tests and 403 in prod.

  test('a teacher viewing the parent dashboard still reaches their own directory', async () => {
    const owner = await makeUser('parent', ['teacher', 'parent']);

    const loaded = await User.findById(owner._id);
    const teacherIdParam = owner._id.toString(); // as it arrives off req.params

    // The old comparison, kept explicit so a regression fails here loudly.
    expect(loaded.role === 'teacher').toBe(false);

    expect(teacherResourceFileAccess(loaded, teacherIdParam)).toEqual({
      allowed: true,
      asStudent: false,
    });
  });

  test('a student viewing the parent dashboard still reaches their teacher’s directory', async () => {
    const teacher = await makeUser('teacher', ['teacher']);
    const child = await makeUser('parent', ['student', 'parent'], { teacherId: teacher._id });

    const loaded = await User.findById(child._id);
    expect(loaded.role === 'student').toBe(false);

    // asStudent true — the route still owes this request the isPublished check.
    expect(teacherResourceFileAccess(loaded, teacher._id.toString())).toEqual({
      allowed: true,
      asStudent: true,
    });
  });

  test('a parent who holds neither role is still denied', async () => {
    // Widening to roles HELD must not widen to "any authenticated user".
    const teacher = await makeUser('teacher', ['teacher']);
    const parent = await makeUser('parent', ['parent'], { teacherId: teacher._id });

    const loaded = await User.findById(parent._id);
    expect(teacherResourceFileAccess(loaded, teacher._id.toString()).allowed).toBe(false);
  });

  test('a teacher cannot read another teacher’s directory by switching roles', async () => {
    const owner = await makeUser('teacher', ['teacher']);
    const other = await makeUser('parent', ['teacher', 'parent', 'student', 'admin']);

    const loaded = await User.findById(other._id);
    expect(teacherResourceFileAccess(loaded, owner._id.toString()).allowed).toBe(false);
  });
});

describe('impersonating across a multi-role account', () => {
  // middleware/impersonation.js decides both who may impersonate and who may be
  // impersonated. Every one of those checks read the ACTIVE role, so the whole
  // rule moved when an account switched dashboards (CLAUDE.md §12).
  //
  // The unit tests in tests/unit/impersonation.test.js cover the branch logic
  // against plain objects. What needs a real database is the shape the ROUTE
  // hands it: `User.findById(...)`, so canImpersonate sees MONGOOSE DOCUMENTS
  // whose roles[] is a CoreMongooseArray and whose _id / teacherId / children
  // entries are ObjectIds, not the strings the unit tests use. A rule that only
  // held for POJOs would pass there and misbehave in production.

  test('an admin who switched to their teacher dashboard cannot be impersonated', async () => {
    // THE ESCALATION. `target.role === 'admin'` was the only guard on admin
    // accounts, and it stopped firing the moment the admin opened another view.
    const admin = await makeUser('admin', ['admin']);
    const target = await makeUser('teacher', ['admin', 'teacher']);

    const [actorDoc, targetDoc] = await Promise.all([
      User.findById(admin._id),
      User.findById(target._id),
    ]);
    expect(targetDoc.role === 'admin').toBe(false); // the old comparison, explicit

    const r = await canImpersonate(actorDoc, targetDoc);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/admin/i);
  });

  test('a teacher-parent reaches both their roster and their own child', async () => {
    const actor = await makeUser('parent', ['teacher', 'parent']);
    const rosterStudent = await makeUser('student', ['student'], { teacherId: actor._id });
    const ownChild = await makeUser('student', ['student']);
    await User.findByIdAndUpdate(actor._id, { children: [ownChild._id] });

    const actorDoc = await User.findById(actor._id);
    expect(actorDoc.role === 'teacher').toBe(false);

    expect((await canImpersonate(actorDoc, await User.findById(rosterStudent._id))).allowed).toBe(true);
    expect((await canImpersonate(actorDoc, await User.findById(ownChild._id))).allowed).toBe(true);
  });

  test('a student viewing their parent dashboard is still reachable by their teacher', async () => {
    const teacher = await makeUser('teacher', ['teacher']);
    const student = await makeUser('parent', ['student', 'parent'], { teacherId: teacher._id });

    const targetDoc = await User.findById(student._id);
    expect(targetDoc.role === 'student').toBe(false);

    const r = await canImpersonate(await User.findById(teacher._id), targetDoc);
    expect(r.allowed).toBe(true);
  });

  test('widening to roles held does not hand a teacher someone else’s student', async () => {
    const otherTeacher = await makeUser('teacher', ['teacher']);
    const stranger = await makeUser('student', ['student'], { teacherId: otherTeacher._id });
    const actor = await makeUser('teacher', ['teacher', 'parent']);

    const r = await canImpersonate(
      await User.findById(actor._id),
      await User.findById(stranger._id)
    );
    expect(r.allowed).toBe(false);
  });
});

describe('the AI-quota staff bypass on a multi-role account', () => {
  // middleware/usageGate.js exempts teachers, parents and admins from the free
  // monthly AI quota. On the active role a teacher-parent was metered while
  // viewing a student dashboard and exempt again after switching back — the
  // quota followed a dashboard toggle rather than the account.
  //
  // Reading a mongoose document matters here specifically: userHasRole()
  // branches on `Array.isArray(user.roles) && user.roles.length`, and a
  // hydrated doc's roles[] is a CoreMongooseArray, not a plain Array.

  test('a teacher viewing the student dashboard is still exempt', async () => {
    const staff = await makeUser('student', ['teacher', 'student']);
    const doc = await User.findById(staff._id);

    expect(Array.isArray(doc.roles)).toBe(true); // CoreMongooseArray must pass this
    expect(doc.role === 'teacher').toBe(false);
    expect(hasStaffRoleBypass(doc)).toBe(true);
  });

  test('a plain student is still metered', async () => {
    const doc = await User.findById((await makeUser('student', ['student']))._id);
    expect(hasStaffRoleBypass(doc)).toBe(false);
  });

  test('a legacy account with no roles[] still falls back to role', async () => {
    // roles[] is backfilled, not guaranteed. models/user.js has a pre-save hook
    // that fills it from `role`, so the only way to get a genuinely pre-backfill
    // document is the way production got them: written before the hook existed.
    // $unset through the driver reproduces that exactly — going through
    // makeUser() alone would silently be handed a roles[] and prove nothing.
    const legacy = await makeUser('teacher', null);
    await User.collection.updateOne({ _id: legacy._id }, { $unset: { roles: '' } });

    const doc = await User.findById(legacy._id);
    expect(doc.roles.length).toBe(0);
    expect(hasStaffRoleBypass(doc)).toBe(true);
  });
});

describe('the impersonation target picker must mirror canImpersonate', () => {
  // GET /api/impersonation/targets is the list the picker renders;
  // canImpersonate() is the gate the switch itself runs. They have to agree.
  //
  // Both used to dispatch on the ACTIVE role through an if/else-if chain, so
  // both were wrong in the same way — but fixing only the gate would leave a
  // subtler failure: a teacher-parent's own child is impersonatable and simply
  // never appears in the picker, which reads as a broken feature with no error
  // to explain it. This drives the real route against a real database because
  // what is under test is what Mongo matches, not the shape of a filter object.

  function appAs(actorDoc) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = actorDoc; next(); });
    app.use('/api/impersonation', impersonationRoutes);
    return app;
  }

  test('a teacher-parent is offered BOTH their roster and their own child', async () => {
    const actor = await makeUser('parent', ['teacher', 'parent']);
    const rosterStudent = await makeUser('student', ['student'], { teacherId: actor._id });
    const ownChild = await makeUser('student', ['student']);
    await User.findByIdAndUpdate(actor._id, { children: [ownChild._id] });

    const actorDoc = await User.findById(actor._id);
    expect(actorDoc.role === 'teacher').toBe(false); // the old comparison, explicit

    const res = await request(appAs(actorDoc)).get('/api/impersonation/targets');
    expect(res.status).toBe(200);

    const ids = res.body.map((t) => String(t._id)).sort();
    expect(ids).toEqual([String(rosterStudent._id), String(ownChild._id)].sort());
  });

  test('a student who is also their own teacher’s child appears exactly once', async () => {
    // The two reaches overlap when a teacher's own child is on their roster.
    // The picker must not offer the same account twice.
    const actor = await makeUser('teacher', ['teacher', 'parent']);
    const child = await makeUser('student', ['student'], { teacherId: actor._id });
    await User.findByIdAndUpdate(actor._id, { children: [child._id] });

    const res = await request(appAs(await User.findById(actor._id)))
      .get('/api/impersonation/targets');

    expect(res.body.map((t) => String(t._id))).toEqual([String(child._id)]);
  });

  test('an admin viewing the parent dashboard is still offered every non-admin', async () => {
    const actor = await makeUser('parent', ['admin', 'parent']);
    const student = await makeUser('student', ['student']);
    const otherAdmin = await makeUser('admin', ['admin']);

    const res = await request(appAs(await User.findById(actor._id)))
      .get('/api/impersonation/targets');

    const ids = res.body.map((t) => String(t._id));
    expect(ids).toContain(String(student._id));
    expect(ids).not.toContain(String(otherAdmin._id));
  });

  test('every account the picker offers is one canImpersonate would allow', async () => {
    // The invariant that keeps the two from drifting again.
    const actor = await makeUser('parent', ['teacher', 'parent']);
    const roster = await makeUser('student', ['student'], { teacherId: actor._id });
    await makeUser('student', ['student']); // a stranger's student
    const ownChild = await makeUser('student', ['student']);
    await User.findByIdAndUpdate(actor._id, { children: [ownChild._id] });

    const actorDoc = await User.findById(actor._id);
    const res = await request(appAs(actorDoc)).get('/api/impersonation/targets');

    for (const t of res.body) {
      const verdict = await canImpersonate(actorDoc, await User.findById(t._id));
      expect(verdict).toEqual({ allowed: true });
    }
    expect(res.body.map((t) => String(t._id)).sort())
      .toEqual([String(roster._id), String(ownChild._id)].sort());
  });

  test('an account holding neither reach is offered nothing', async () => {
    const actor = await makeUser('student', ['student']);
    await makeUser('student', ['student']);

    const res = await request(appAs(await User.findById(actor._id)))
      .get('/api/impersonation/targets');
    expect(res.body).toEqual([]);
  });
});

describe('deleting a multi-role account cleans up every link it held', () => {
  // routes/admin.js DELETE /api/admin/users/:userId unlinks a deleted account
  // from its students and its children. Both cleanups keyed on `user.role` —
  // the dashboard the account had open when it was deleted (CLAUDE.md §12) —
  // so deleting a teacher who also holds parent, while they were on the parent
  // dashboard, skipped the teacher cleanup entirely. Nothing errors: the
  // students are simply left pointing at a teacherId that no longer resolves,
  // and the roster shows a dead teacher.
  //
  // This drives the REAL route against a real database, because what is under
  // test is what the two updateMany calls actually match.

  function adminApp(actor) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = actor;
      req.isAuthenticated = () => true;
      next();
    });
    app.use('/api/admin', require('../../routes/admin'));
    return app;
  }

  let admin;
  let app;

  beforeEach(async () => {
    admin = await makeUser('admin', ['admin']);
    app = adminApp(await User.findById(admin._id));
  });

  test('deleting a teacher-parent on the parent dashboard still clears their roster', async () => {
    const owner = await makeUser('parent', ['teacher', 'parent']);
    const student = await makeUser('student', ['student'], { teacherId: owner._id });

    expect((await User.findById(owner._id)).role === 'teacher').toBe(false); // old comparison

    const res = await request(app).delete(`/api/admin/users/${owner._id}`);
    expect(res.status).toBe(200);

    expect((await User.findById(student._id)).teacherId).toBeFalsy();
    expect(await User.findById(owner._id)).toBeNull();
  });

  test('deleting a teacher-parent on the teacher dashboard still unlinks their children', async () => {
    const owner = await makeUser('teacher', ['teacher', 'parent']);
    const child = await makeUser('student', ['student'], { parentIds: [owner._id] });
    await User.findByIdAndUpdate(owner._id, { children: [child._id] });

    const res = await request(app).delete(`/api/admin/users/${owner._id}`);
    expect(res.status).toBe(200);

    expect((await User.findById(child._id)).parentIds.map(String)).toEqual([]);
  });

  test('the child unlink uses $pull on parentIds, not $unset on a field that does not exist', async () => {
    // models/user.js has `parentIds: [ObjectId]` and no `parentId`, so the old
    // `$unset: { parentId: '' }` matched nothing at all — the child kept a
    // reference to the deleted parent and the dashboard kept resolving it to
    // null. Found while fixing the role test on the line above.
    const owner = await makeUser('parent', ['parent']);
    const coParent = await makeUser('parent', ['parent']);
    const child = await makeUser('student', ['student'], { parentIds: [owner._id, coParent._id] });
    await User.findByIdAndUpdate(owner._id, { children: [child._id] });

    await request(app).delete(`/api/admin/users/${owner._id}`);

    // $pull removes one id; the surviving co-parent must be left alone.
    expect((await User.findById(child._id)).parentIds.map(String))
      .toEqual([String(coParent._id)]);
  });

  test('deleting a plain student touches no other account', async () => {
    const teacher = await makeUser('teacher', ['teacher']);
    const peer = await makeUser('student', ['student'], { teacherId: teacher._id });
    const victim = await makeUser('student', ['student'], { teacherId: teacher._id });

    await request(app).delete(`/api/admin/users/${victim._id}`);

    expect(String((await User.findById(peer._id)).teacherId)).toBe(String(teacher._id));
  });
});

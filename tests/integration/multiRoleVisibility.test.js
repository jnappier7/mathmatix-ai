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

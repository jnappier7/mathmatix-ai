// tests/unit/roleQuery.test.js
//
// Pins the role-matching semantics that keep multi-role accounts visible.
//
// `user.role` is the ACTIVE role (which dashboard the account is currently in);
// `user.roles[]` is every role it HOLDS. Querying by `role` alone silently
// erases multi-role users — an admin who is also a parent has role='admin', so
// `{ role: 'parent' }` never matches them and they vanish from parent
// directories and from every parent-link lookup with no error at all.

const {
  anyRole,
  withRole,
  withoutRoles,
  userHasRole,
  rolesOf,
} = require('../../utils/roleQuery');

describe('anyRole', () => {
  test('matches on roles[] with the legacy role string as fallback', () => {
    expect(anyRole('parent')).toEqual({
      $or: [{ roles: 'parent' }, { role: 'parent' }],
    });
  });

  test('spreads into a filter without disturbing the other clauses', () => {
    const filter = { _id: 'abc', teacherId: 'xyz', ...anyRole('student') };
    expect(filter._id).toBe('abc');
    expect(filter.teacherId).toBe('xyz');
    expect(filter.$or).toEqual([{ roles: 'student' }, { role: 'student' }]);
  });
});

describe('withRole', () => {
  test('merges plainly when the filter has no $or of its own', () => {
    expect(withRole({ email: 'a@b.c' }, 'teacher')).toEqual({
      email: 'a@b.c',
      $or: [{ roles: 'teacher' }, { role: 'teacher' }],
    });
  });

  test('preserves a pre-existing $or instead of clobbering it', () => {
    const existing = { $or: [{ username: 'u' }, { email: 'e' }] };
    const merged = withRole(existing, 'parent');

    // The caller's $or must survive — spreading would have overwritten it and
    // silently widened the query to "anyone named u or e, any role".
    expect(merged.$and).toEqual([
      existing,
      { $or: [{ roles: 'parent' }, { role: 'parent' }] },
    ]);
  });

  test('an empty filter degrades to a bare role clause', () => {
    expect(withRole({}, 'admin')).toEqual(anyRole('admin'));
    expect(withRole(null, 'admin')).toEqual(anyRole('admin'));
  });
});

describe('withoutRoles', () => {
  test('excludes on both fields so a multi-role admin cannot slip through', () => {
    const filter = withoutRoles('admin');
    expect(filter).toEqual({
      roles: { $nin: ['admin'] },
      role: { $nin: ['admin'] },
    });
  });

  test('accepts several roles', () => {
    expect(withoutRoles('admin', 'teacher').roles.$nin).toEqual(['admin', 'teacher']);
  });
});

describe('userHasRole', () => {
  const multiRole = { role: 'admin', roles: ['admin', 'parent', 'student', 'teacher'] };

  test('finds every role a multi-role account holds, not just the active one', () => {
    expect(userHasRole(multiRole, 'admin')).toBe(true);
    expect(userHasRole(multiRole, 'parent')).toBe(true);
    expect(userHasRole(multiRole, 'student')).toBe(true);
    expect(userHasRole(multiRole, 'teacher')).toBe(true);
  });

  test('falls back to the legacy role string when roles[] is absent or empty', () => {
    expect(userHasRole({ role: 'parent' }, 'parent')).toBe(true);
    expect(userHasRole({ role: 'parent', roles: [] }, 'parent')).toBe(true);
    expect(userHasRole({ role: 'parent' }, 'student')).toBe(false);
  });

  test('roles[] wins over role when they disagree', () => {
    // The active role is always expected to be a member of roles[]; if a
    // document is out of sync, the durable list is the authority.
    expect(userHasRole({ role: 'admin', roles: ['parent'] }, 'admin')).toBe(false);
    expect(userHasRole({ role: 'admin', roles: ['parent'] }, 'parent')).toBe(true);
  });

  test('is safe on null/undefined', () => {
    expect(userHasRole(null, 'parent')).toBe(false);
    expect(userHasRole(undefined, 'parent')).toBe(false);
  });
});

describe('rolesOf', () => {
  test('returns the full list for multi-role, the single role otherwise', () => {
    expect(rolesOf({ role: 'admin', roles: ['admin', 'parent'] })).toEqual(['admin', 'parent']);
    expect(rolesOf({ role: 'student' })).toEqual(['student']);
    expect(rolesOf({ role: 'student', roles: [] })).toEqual(['student']);
    expect(rolesOf(null)).toEqual([]);
  });
});

/**
 * Query construction for the admin user directory.
 *
 * The endpoint used to be `User.find({})` — no bound, no server-side search or
 * sort, the browser filtering the whole collection. These cover the decisions
 * that replaced it: what gets asked for, how much, and in what order.
 *
 * Pure functions, no database. The matching behaviour against real Mongo is
 * covered by tests/integration/adminUserPagination.test.js.
 */

const {
  USER_PAGE_SIZE_DEFAULT,
  USER_PAGE_SIZE_MAX,
  USER_SORTS,
  escapeRegex,
  buildUserDirectoryFilter,
  resolveSort,
  resolvePaging,
  clearStaleWeeklyMinutes,
} = require('../../utils/adminUserQuery');

describe('escapeRegex', () => {
  test('neutralises the metacharacters that would turn a search into a pattern', () => {
    expect(escapeRegex('.*')).toBe('\\.\\*');
    expect(escapeRegex('a+b')).toBe('a\\+b');
    expect(escapeRegex('(x)[y]')).toBe('\\(x\\)\\[y\\]');
  });

  test('an escaped term matches itself literally', () => {
    const rx = new RegExp(escapeRegex('.*'), 'i');
    expect(rx.test('Ada Lovelace')).toBe(false);
    expect(rx.test('literally .* here')).toBe(true);
  });
});

describe('buildUserDirectoryFilter', () => {
  test('an empty query means the whole directory', () => {
    expect(buildUserDirectoryFilter({})).toEqual({});
    expect(buildUserDirectoryFilter({ search: '   ' })).toEqual({});
    expect(buildUserDirectoryFilter()).toEqual({});
  });

  test('a single term searches name, email and username', () => {
    const filter = buildUserDirectoryFilter({ search: 'ada' });
    const fields = filter.$or.map((c) => Object.keys(c)[0]);
    expect(fields).toEqual(expect.arrayContaining(['firstName', 'lastName', 'email', 'username']));
  });

  test('search is case-insensitive', () => {
    const filter = buildUserDirectoryFilter({ search: 'ADA' });
    expect(filter.$or[0].firstName.flags).toContain('i');
    expect(filter.$or[0].firstName.test('ada')).toBe(true);
  });

  test('"first last" adds a clause requiring both name fields to hit', () => {
    const filter = buildUserDirectoryFilter({ search: 'ada lovelace' });
    const combined = filter.$or.find((c) => c.$and);
    expect(combined).toBeDefined();
    expect(combined.$and[0].firstName.test('Ada')).toBe(true);
    expect(combined.$and[1].lastName.test('Lovelace')).toBe(true);
    // ...and not the other way round, which is what makes it a *pair* test.
    expect(combined.$and[1].lastName.test('Ada')).toBe(false);
  });

  test('a three-word query treats everything after the first word as the last name', () => {
    const filter = buildUserDirectoryFilter({ search: 'ada king lovelace' });
    const combined = filter.$or.find((c) => c.$and);
    expect(combined.$and[1].lastName.test('King Lovelace')).toBe(true);
  });

  test('metacharacters in the search term are escaped, not compiled', () => {
    const filter = buildUserDirectoryFilter({ search: '.*' });
    // If '.*' reached the RegExp raw, this would match every user in the system.
    expect(filter.$or[0].firstName.test('Ada')).toBe(false);
  });

  test('a known role filters on roles HELD, with the legacy string as fallback', () => {
    const filter = buildUserDirectoryFilter({ role: 'parent' });
    expect(filter).toEqual({ $or: [{ roles: 'parent' }, { role: 'parent' }] });
  });

  test('an unknown role is ignored rather than emptying the directory', () => {
    expect(buildUserDirectoryFilter({ role: 'wizard' })).toEqual({});
  });

  test('search and role combine under $and so neither $or clobbers the other', () => {
    const filter = buildUserDirectoryFilter({ search: 'ada', role: 'student' });
    expect(filter.$and).toHaveLength(2);
    // Spreading two $or keys into one object would have dropped the search.
    expect(filter.$and[0].$or).toBeDefined();
    expect(filter.$and[1]).toEqual({ $or: [{ roles: 'student' }, { role: 'student' }] });
  });
});

describe('resolveSort', () => {
  test('maps each whitelisted key to a Mongo sort', () => {
    expect(resolveSort('name-asc')).toEqual({ lastName: 1, firstName: 1 });
    expect(resolveSort('oldest')).toEqual({ createdAt: 1 });
    expect(resolveSort('last-login')).toEqual({ lastLogin: -1 });
  });

  test('covers exactly the keys the client dropdown offers', () => {
    expect(Object.keys(USER_SORTS).sort()).toEqual(
      ['grade', 'last-login', 'name-asc', 'name-desc', 'newest', 'oldest']
    );
  });

  test('an unknown or absent key falls back to newest', () => {
    expect(resolveSort('; drop table')).toEqual({ createdAt: -1 });
    expect(resolveSort(undefined)).toEqual({ createdAt: -1 });
  });

  test('an arbitrary field name cannot be smuggled through as a sort', () => {
    expect(resolveSort('passwordHash')).toEqual({ createdAt: -1 });
  });
});

describe('resolvePaging', () => {
  test('defaults to page 1 at the default size', () => {
    expect(resolvePaging({})).toEqual({ page: 1, limit: USER_PAGE_SIZE_DEFAULT, skip: 0 });
  });

  test('skip follows from page and limit', () => {
    expect(resolvePaging({ page: 3, limit: 25 })).toEqual({ page: 3, limit: 25, skip: 50 });
  });

  test('limit is capped — this is the bound the endpoint exists to have', () => {
    expect(resolvePaging({ limit: 100000 }).limit).toBe(USER_PAGE_SIZE_MAX);
  });

  test('the cap is configurable per endpoint', () => {
    expect(resolvePaging({ limit: 99999 }, { max: 500, fallback: 500 }).limit).toBe(500);
  });

  test('junk and out-of-range values clamp instead of producing a negative skip', () => {
    expect(resolvePaging({ page: 0 }).page).toBe(1);
    expect(resolvePaging({ page: -5 }).skip).toBe(0);
    expect(resolvePaging({ page: 'abc', limit: 'xyz' })).toEqual({
      page: 1, limit: USER_PAGE_SIZE_DEFAULT, skip: 0,
    });
    expect(resolvePaging({ limit: 0 }).limit).toBe(USER_PAGE_SIZE_DEFAULT);
    expect(resolvePaging({ limit: -10 }).limit).toBe(1);
  });
});

describe('clearStaleWeeklyMinutes', () => {
  const NOW = Date.UTC(2026, 7, 10);
  const day = 24 * 60 * 60 * 1000;

  test('zeroes the weekly figure for a user whose reset is over a week old', () => {
    const users = [{ weeklyActiveTutoringMinutes: 240, lastWeeklyReset: new Date(NOW - 10 * day) }];
    clearStaleWeeklyMinutes(users, NOW);
    expect(users[0].weeklyActiveTutoringMinutes).toBe(0);
  });

  test('leaves a current week alone', () => {
    const users = [{ weeklyActiveTutoringMinutes: 240, lastWeeklyReset: new Date(NOW - 2 * day) }];
    clearStaleWeeklyMinutes(users, NOW);
    expect(users[0].weeklyActiveTutoringMinutes).toBe(240);
  });

  test('a user who has never reset counts as stale', () => {
    const users = [{ weeklyActiveTutoringMinutes: 99 }];
    clearStaleWeeklyMinutes(users, NOW);
    expect(users[0].weeklyActiveTutoringMinutes).toBe(0);
  });
});

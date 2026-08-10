// utils/adminUserQuery.js
//
// Query construction for the admin user directory (GET /api/admin/users and
// /users/lookup).
//
// Split out of routes/admin.js so the parts that decide WHAT to ask the
// database — the search filter, the sort whitelist, the page bounds — can be
// tested as plain functions. The route keeps the parts that need a connection.
//
// The one rule worth restating here: role matching goes through anyRole(), so
// it matches the roles a user HOLDS rather than the one they happen to be
// viewing. See utils/roleQuery.js for why that distinction has bitten before.

const { anyRole, ROLE_NAMES } = require('./roleQuery');

const USER_PAGE_SIZE_DEFAULT = 50;
const USER_PAGE_SIZE_MAX = 200;
const USER_LOOKUP_LIMIT_MAX = 500;

// Sort keys the client may ask for, mapped to Mongo sorts. Whitelisted rather
// than passed through so a query string can't order by an unindexed or
// sensitive field — and so an unknown key degrades to a sane default instead
// of erroring.
const USER_SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  'name-asc': { lastName: 1, firstName: 1 },
  'name-desc': { lastName: -1, firstName: -1 },
  'last-login': { lastLogin: -1 },
  grade: { gradeLevel: 1 },
};

const DEFAULT_SORT_KEY = 'newest';

/** Escape a user-supplied string for safe use inside a RegExp. */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build the Mongo filter for a directory query.
 *
 * `search` matches first/last/email/username. It also matches a full name, so
 * typing "ada lovelace" finds the row that "ada" and "lovelace" each find on
 * their own — without that clause the combined query matches nothing, which
 * reads as "no such user".
 *
 * Returns `{}` for an empty query, i.e. the unfiltered directory.
 */
function buildUserDirectoryFilter({ search, role } = {}) {
  const clauses = [];

  const term = (search || '').trim();
  if (term) {
    const rx = new RegExp(escapeRegex(term), 'i');
    const searchClause = [
      { firstName: rx }, { lastName: rx }, { email: rx }, { username: rx },
    ];
    const parts = term.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      const first = new RegExp(escapeRegex(parts[0]), 'i');
      const last = new RegExp(escapeRegex(parts.slice(1).join(' ')), 'i');
      searchClause.push({ $and: [{ firstName: first }, { lastName: last }] });
    }
    clauses.push({ $or: searchClause });
  }

  // An unrecognised role is ignored rather than filtered on: a typo in a query
  // string should not silently empty the directory.
  if (role && ROLE_NAMES.includes(role)) clauses.push(anyRole(role));

  if (!clauses.length) return {};
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

/** Resolve a client-supplied sort key to a Mongo sort, defaulting to newest. */
function resolveSort(sortKey) {
  return USER_SORTS[sortKey] || USER_SORTS[DEFAULT_SORT_KEY];
}

/**
 * Clamp page/limit into something safe to hand to skip()/limit().
 * `max` differs by endpoint: the table pages, the lookup caps.
 */
function resolvePaging({ page, limit } = {}, { max = USER_PAGE_SIZE_MAX, fallback = USER_PAGE_SIZE_DEFAULT } = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(max, Math.max(1, parseInt(limit, 10) || fallback));
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
}

/**
 * Zero out stale weekly minutes, in place.
 *
 * The weekly reset only fires on user activity (in track-time), so an inactive
 * user keeps the inflated value from the last week they showed up. Corrected
 * for display rather than reporting a number that stopped being true months ago.
 */
function clearStaleWeeklyMinutes(users, now = Date.now()) {
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  for (const user of users) {
    const lastReset = user.lastWeeklyReset ? new Date(user.lastWeeklyReset).getTime() : 0;
    if ((now - lastReset) >= sevenDaysMs) user.weeklyActiveTutoringMinutes = 0;
  }
  return users;
}

module.exports = {
  USER_PAGE_SIZE_DEFAULT,
  USER_PAGE_SIZE_MAX,
  USER_LOOKUP_LIMIT_MAX,
  USER_SORTS,
  escapeRegex,
  buildUserDirectoryFilter,
  resolveSort,
  resolvePaging,
  clearStaleWeeklyMinutes,
};

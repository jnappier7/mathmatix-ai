// tests/unit/messagingAccess.test.js
//
// Pins the role semantics of routes/messaging.js.
//
// The distinction matters twice in that file and the two cases pull in opposite
// directions (see CLAUDE.md §12):
//
//   canMessage()          — AUTHORIZATION. Must read roles[] (roles HELD).
//                           It previously gated on `req.user.role`, the ACTIVE
//                           role, so an admin who is also a parent got a 403 and
//                           a teacher-parent's access flipped whenever they
//                           switched dashboards.
//
//   messagingViewRole()   — VIEW ROUTING. Legitimately prefers the ACTIVE role,
//                           because it decides *which* contact list to show. It
//                           falls back to a held role so a multi-role user
//                           viewing some other dashboard still gets contacts
//                           instead of an empty list.

const { canUseMessaging, messagingViewRole } = require('../../utils/messagingAccess');

// Aliased to the names used in routes/messaging.js.
const canMessage = canUseMessaging;

describe('canMessage — authorization reads roles held, not the active role', () => {
  test('allows a plain teacher and a plain parent', () => {
    expect(canMessage({ role: 'teacher', roles: ['teacher'] })).toBe(true);
    expect(canMessage({ role: 'parent', roles: ['parent'] })).toBe(true);
  });

  test('allows an admin who also holds parent — the case the old gate broke', () => {
    // Active role is 'admin', so the previous `['teacher','parent'].includes(role)`
    // check returned 403 even though this account is a parent.
    expect(canMessage({ role: 'admin', roles: ['admin', 'parent'] })).toBe(true);
  });

  test('allows a teacher-parent regardless of which dashboard they are viewing', () => {
    const held = ['teacher', 'parent'];
    expect(canMessage({ role: 'teacher', roles: held })).toBe(true);
    expect(canMessage({ role: 'parent', roles: held })).toBe(true);
    expect(canMessage({ role: 'admin', roles: held })).toBe(true);
  });

  test('still refuses accounts holding neither role', () => {
    expect(canMessage({ role: 'student', roles: ['student'] })).toBe(false);
    expect(canMessage({ role: 'admin', roles: ['admin'] })).toBe(false);
    expect(canMessage(null)).toBe(false);
  });

  test('honours the legacy role string when roles[] is absent', () => {
    // Older accounts predate roles[]; roleQuery falls back to `role`.
    expect(canMessage({ role: 'parent' })).toBe(true);
    expect(canMessage({ role: 'student' })).toBe(false);
  });
});

describe('messagingViewRole — view routing prefers the active role', () => {
  test('a teacher-parent gets the list for the dashboard they are actually in', () => {
    const held = ['teacher', 'parent'];
    expect(messagingViewRole({ role: 'teacher', roles: held })).toBe('teacher');
    expect(messagingViewRole({ role: 'parent', roles: held })).toBe('parent');
  });

  test('falls back to a held role rather than returning an empty contact list', () => {
    // Previously this branched on req.user.role only, so an admin-parent matched
    // neither branch and silently received zero contacts.
    expect(messagingViewRole({ role: 'admin', roles: ['admin', 'parent'] })).toBe('parent');
    expect(messagingViewRole({ role: 'admin', roles: ['admin', 'teacher'] })).toBe('teacher');
  });

  test('returns null when the account holds neither role', () => {
    expect(messagingViewRole({ role: 'student', roles: ['student'] })).toBeNull();
  });
});

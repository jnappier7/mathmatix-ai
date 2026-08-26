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

const { canUseMessaging, messagingViewRole, messagingThreadRoles } = require('../../utils/messagingAccess');

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

describe('messagingThreadRoles — which side of the thread each account is on', () => {
  // Feeds two surfaces in the notification email: the sender's "(Teacher)" /
  // "(Parent)" label, and the dashboard the recipient's link points at. Both
  // used to read `sender.role` / `recipient.role` — the ACTIVE role, a snapshot
  // of a dashboard toggle that has already moved on by the time the mail is
  // opened (CLAUDE.md §12). routes/messaging.js authorizes the pair on roles
  // held, so this resolves the same pairing back out.

  const TEACHER = { role: 'teacher', roles: ['teacher'] };
  const PARENT = { role: 'parent', roles: ['parent'] };

  test('a plain teacher→parent thread is unchanged', () => {
    expect(messagingThreadRoles(TEACHER, PARENT))
      .toEqual({ senderRole: 'teacher', recipientRole: 'parent' });
  });

  test('a plain parent→teacher thread is unchanged', () => {
    expect(messagingThreadRoles(PARENT, TEACHER))
      .toEqual({ senderRole: 'parent', recipientRole: 'teacher' });
  });

  test('a teacher-parent messaging a parent signs as Teacher, not Parent', () => {
    // THE BUG. A teacher who also holds parent, writing to a student's parent
    // while `role` still said 'parent', signed the email "(Parent)".
    const sender = { role: 'parent', roles: ['teacher', 'parent'] };
    expect(sender.role === 'teacher').toBe(false); // the old comparison, explicit

    expect(messagingThreadRoles(sender, PARENT))
      .toEqual({ senderRole: 'teacher', recipientRole: 'parent' });
  });

  test('a teacher recipient viewing the parent dashboard is linked to the TEACHER dashboard', () => {
    // The link half of the same bug: the thread lives on the teacher
    // dashboard's messages tab, and the recipient was sent to the parent one.
    const recipient = { role: 'parent', roles: ['teacher', 'parent'] };
    expect(messagingThreadRoles(PARENT, recipient).recipientRole).toBe('teacher');
  });

  test('when both hold both roles, each resolves to its own strongest held role', () => {
    const both = { role: 'parent', roles: ['teacher', 'parent'] };
    expect(messagingThreadRoles(both, { role: 'teacher', roles: ['teacher', 'parent'] }))
      .toEqual({ senderRole: 'teacher', recipientRole: 'teacher' });
  });

  test('an account holding neither still resolves to a usable shape', () => {
    // The email template has no third branch; the return must stay well-formed
    // rather than yielding undefined into the markup.
    expect(messagingThreadRoles({ role: 'student', roles: ['student'] }, PARENT))
      .toEqual({ senderRole: 'parent', recipientRole: 'parent' });
    expect(messagingThreadRoles(null, null))
      .toEqual({ senderRole: 'parent', recipientRole: 'parent' });
  });

  test('legacy accounts with no roles[] still resolve through role', () => {
    expect(messagingThreadRoles({ role: 'teacher' }, { role: 'parent' }))
      .toEqual({ senderRole: 'teacher', recipientRole: 'parent' });
  });
});

/**
 * Family-linking codes: shape, normalization, and the reason a code is rejected.
 *
 * Two codes travel in opposite directions and look nothing alike
 * (parent→child "K7Q2ZP", child→parent "MATH-A1B2C3"). The support case this
 * pins: a parent copies the child's Share Progress code, pastes it into the
 * child-side "Parent's Invite Code" box, and is told the code is "expired" —
 * a message about a code that never existed. Every rejection must name the
 * real cause and the next action.
 */

const {
  PARENT_INVITE_TTL_DAYS,
  normalizeStudentLinkCode,
  normalizeParentInviteCode,
  looksLikeStudentLinkCode,
  looksLikeParentInviteCode,
  parentInviteExpiry,
  isParentInviteActive,
  explainParentInviteFailure,
  explainStudentLinkFailure
} = require('../../utils/linkCodes');

describe('normalizeStudentLinkCode', () => {
  test.each([
    ['MATH-A1B2C3', 'MATH-A1B2C3'],
    ['math-a1b2c3', 'MATH-A1B2C3'],
    ['MATHA1B2C3', 'MATH-A1B2C3'],
    ['a1b2c3', 'MATH-A1B2C3'],            // dashboard used to say "6-character code"
    ['  MATH-A1B2C3 \n', 'MATH-A1B2C3'],
    ['MATH - A1B2 C3', 'MATH-A1B2C3'],
  ])('%s → %s', (raw, canonical) => {
    expect(normalizeStudentLinkCode(raw)).toBe(canonical);
  });

  test('a code that does not fit the shape is passed through squashed, not dropped', () => {
    // Legacy or hand-issued codes still get an exact-match chance.
    expect(normalizeStudentLinkCode('legacy-code-9')).toBe('LEGACY-CODE-9');
  });

  test('empty input is empty, never "MATH-"', () => {
    expect(normalizeStudentLinkCode('')).toBe('');
    expect(normalizeStudentLinkCode(null)).toBe('');
    expect(normalizeStudentLinkCode(undefined)).toBe('');
  });
});

describe('normalizeParentInviteCode', () => {
  test('uppercases and strips whitespace', () => {
    expect(normalizeParentInviteCode(' k7q2 zp ')).toBe('K7Q2ZP');
    expect(normalizeParentInviteCode(undefined)).toBe('');
  });
});

describe('shape detection', () => {
  test('a Share Progress code is recognised only with its MATH prefix', () => {
    expect(looksLikeStudentLinkCode('MATH-A1B2C3')).toBe(true);
    expect(looksLikeStudentLinkCode('matha1b2c3')).toBe(true);
    // Bare six chars are ambiguous with a parent invite code — do not claim them.
    expect(looksLikeStudentLinkCode('A1B2C3')).toBe(false);
  });

  test('a parent invite code is six alphanumerics', () => {
    expect(looksLikeParentInviteCode('K7Q2ZP')).toBe(true);
    expect(looksLikeParentInviteCode('k7q2 zp')).toBe(true);
    expect(looksLikeParentInviteCode('MATH-A1B2C3')).toBe(false);
  });
});

describe('parent invite lifetime', () => {
  test('a fresh code lasts PARENT_INVITE_TTL_DAYS and is active until then', () => {
    const now = new Date('2026-09-22T12:00:00Z');
    const expiresAt = parentInviteExpiry(now);
    expect(Math.round((expiresAt - now) / 86400000)).toBe(PARENT_INVITE_TTL_DAYS);
    expect(PARENT_INVITE_TTL_DAYS).toBeGreaterThanOrEqual(30);
    expect(isParentInviteActive({ code: 'K7Q2ZP', childLinked: false, expiresAt }, now)).toBe(true);
    expect(isParentInviteActive({ code: 'K7Q2ZP', childLinked: true, expiresAt }, now)).toBe(false);
    expect(isParentInviteActive({ code: 'K7Q2ZP', childLinked: false, expiresAt }, new Date(expiresAt.getTime() + 1))).toBe(false);
    expect(isParentInviteActive({}, now)).toBe(false);
    expect(isParentInviteActive(null, now)).toBe(false);
  });
});

describe('explainParentInviteFailure (child entering a parent code)', () => {
  const now = new Date('2026-09-22T12:00:00Z');
  const parentWith = (invite) => ({ firstName: 'Dana', parentToChildInviteCode: invite });

  test('the support case: a Share Progress code in the parent-code box says so, and never says "expired"', () => {
    const r = explainParentInviteFailure({ rawCode: 'MATH-A1B2C3', parent: null, now });
    expect(r.reason).toBe('student_code');
    expect(r.message).toMatch(/Share Progress/);
    expect(r.message).toMatch(/Link to Existing Student/);
    expect(r.message).not.toMatch(/expired/i);
  });

  test('an unknown code is "not found", with the fix, not "invalid, expired, or already used"', () => {
    const r = explainParentInviteFailure({ rawCode: 'ZZZZZZ', parent: null, now });
    expect(r.reason).toBe('not_found');
    expect(r.message).toMatch(/Generate Invite Code/);
    expect(r.message).not.toMatch(/expired/i);
  });

  test('a spent code is "used" and asks for a new one', () => {
    const r = explainParentInviteFailure({ rawCode: 'K7Q2ZP', parent: parentWith({ code: 'K7Q2ZP', childLinked: true, expiresAt: parentInviteExpiry(now) }), now });
    expect(r.reason).toBe('used');
    expect(r.message).toMatch(/Dana/);
    expect(r.message).toMatch(/Generate Invite Code/);
  });

  test('an expired code says when it expired and how long a new one lasts', () => {
    const r = explainParentInviteFailure({ rawCode: 'K7Q2ZP', parent: parentWith({ code: 'K7Q2ZP', childLinked: false, expiresAt: new Date('2026-09-01T00:00:00Z') }), now });
    expect(r.reason).toBe('expired');
    expect(r.message).toMatch(/expired on/);
    expect(r.message).toMatch(new RegExp(`${PARENT_INVITE_TTL_DAYS} days`));
  });

  test('a usable code is not a failure', () => {
    expect(explainParentInviteFailure({ rawCode: 'K7Q2ZP', parent: parentWith({ code: 'K7Q2ZP', childLinked: false, expiresAt: parentInviteExpiry(now) }), now })).toBeNull();
  });
});

describe('explainStudentLinkFailure (parent entering a child code)', () => {
  const parent = { children: [], parentToChildInviteCode: { code: 'K7Q2ZP' } };

  test('the mirror support case: a parent pasting their OWN invite code is told it goes the other way', () => {
    const r = explainStudentLinkFailure({ rawCode: 'k7q2zp', student: null, parent });
    expect(r.reason).toBe('own_invite_code');
    expect(r.message).toMatch(/Share Progress/);
    expect(r.message).toMatch(/MATH-A1B2C3/);
  });

  test('an unknown code describes the shape and where the child finds it', () => {
    const r = explainStudentLinkFailure({ rawCode: 'MATH-FFFFFF', student: null, parent });
    expect(r.reason).toBe('not_found');
    expect(r.message).toMatch(/MATH-A1B2C3/);
    expect(r.message).toMatch(/Share Progress/);
  });

  test('a code this parent already used reads "already linked", not "already linked to a parent"', () => {
    const student = { _id: 'S1', firstName: 'Kali', studentToParentLinkCode: { code: 'MATH-A1B2C3', parentLinked: true } };
    const r = explainStudentLinkFailure({ rawCode: 'MATH-A1B2C3', student, parent: { ...parent, children: ['S1'] } });
    expect(r.reason).toBe('already_linked');
    expect(r.message).toMatch(/Kali/);
  });

  test('a code another parent used is "used" and tells the child how to get a fresh one', () => {
    const student = { _id: 'S1', firstName: 'Kali', studentToParentLinkCode: { code: 'MATH-A1B2C3', parentLinked: true } };
    const r = explainStudentLinkFailure({ rawCode: 'MATH-A1B2C3', student, parent });
    expect(r.reason).toBe('used');
    expect(r.message).toMatch(/Share Progress/);
  });

  test('a usable code is not a failure', () => {
    const student = { _id: 'S1', firstName: 'Kali', studentToParentLinkCode: { code: 'MATH-A1B2C3', parentLinked: false } };
    expect(explainStudentLinkFailure({ rawCode: 'MATH-A1B2C3', student, parent })).toBeNull();
  });
});

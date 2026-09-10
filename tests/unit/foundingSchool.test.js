// tests/unit/foundingSchool.test.js
// Pins the founding-school grant (FOUNDING_SCHOOL_DOMAINS) end to end at the
// unit level: the domain matching, the seam in hasUnmeteredAiAccess that every
// display and gate surface inherits, and the impact report's domain filter.
//
// The failure that matters here is over-granting: a matching rule loose enough
// to hand free Unlimited to gmail.com, a lookalike domain, or a subdomain
// nobody vetted.

process.env.BILLING_ENABLED = 'true';

jest.mock('../../models/user', () => ({ findOne: jest.fn(), findByIdAndUpdate: jest.fn() }));
jest.mock('../../models/schoolLicense', () => ({ findById: jest.fn() }));

const {
  foundingSchoolDomains,
  unwrapGoogleConflictAddress,
  isFoundingSchoolEmail,
  isFoundingSchoolUser,
  emailDomainFilter,
} = require('../../utils/foundingSchool');
const { hasUnmeteredAiAccess } = require('../../middleware/usageGate');
const { foundingSchoolReport } = require('../../utils/healthReport');

afterEach(() => {
  delete process.env.FOUNDING_SCHOOL_DOMAINS;
});

// A plain free student on the given email — no staff roles, no license,
// no parent, nothing that would grant access except the domain under test.
function freeStudent(email) {
  return { roles: ['student'], role: 'student', email, subscriptionTier: 'free' };
}

describe('domain matching', () => {
  test('grants exactly the configured domain, case-insensitively', () => {
    process.env.FOUNDING_SCHOOL_DOMAINS = 'scprep.org';
    expect(isFoundingSchoolEmail('kid@scprep.org')).toBe(true);
    expect(isFoundingSchoolEmail('Kid@SCPREP.ORG')).toBe(true);
  });

  test('never grants lookalikes, subdomains, or consumer mail', () => {
    process.env.FOUNDING_SCHOOL_DOMAINS = 'scprep.org';
    for (const email of [
      'kid@mail.scprep.org',     // subdomain — not vetted, not granted
      'kid@notscprep.org',       // lookalike
      'kid@scprep.org.evil.com', // suffix trick
      'scprep.org@gmail.com',    // domain in the local part
      'kid@gmail.com',
    ]) {
      expect(isFoundingSchoolEmail(email)).toBe(false);
    }
  });

  test('unset env means the feature is entirely off', () => {
    expect(foundingSchoolDomains()).toEqual([]);
    expect(isFoundingSchoolEmail('kid@scprep.org')).toBe(false);
  });

  test('parses a comma-separated list with whitespace', () => {
    process.env.FOUNDING_SCHOOL_DOMAINS = ' scprep.org , other.k12.oh.us ';
    expect(foundingSchoolDomains()).toEqual(['scprep.org', 'other.k12.oh.us']);
    expect(isFoundingSchoolEmail('a@other.k12.oh.us')).toBe(true);
  });

  test('decodes a Google conflicting-account address to the school address it wraps', () => {
    // Google reports `kid%scprep.org@gtempaccount.com` for a consumer account
    // that was created on a school address. Two real scprep students arrived
    // this way; the person verified the school address to create the account.
    process.env.FOUNDING_SCHOOL_DOMAINS = 'scprep.org';
    expect(unwrapGoogleConflictAddress('2028083%scprep.org@gtempaccount.com')).toBe('2028083@scprep.org');
    expect(isFoundingSchoolEmail('2028083%scprep.org@gtempaccount.com')).toBe(true);
    expect(isFoundingSchoolEmail('2028083%SCPREP.ORG@GTEMPACCOUNT.COM')).toBe(true);
  });

  test('the decode never widens the grant', () => {
    process.env.FOUNDING_SCHOOL_DOMAINS = 'scprep.org';
    for (const email of [
      'kid%gmail.com@gtempaccount.com',       // wraps a consumer address
      'kid%mail.scprep.org@gtempaccount.com', // wraps a subdomain
      'kid@gtempaccount.com',                 // nothing to unwrap
      '%scprep.org@gtempaccount.com',         // empty local part
      'kid%@gtempaccount.com',                // empty wrapped domain
      'kid%scprep.org@notgtempaccount.com',   // only Google's domain is unwrapped
    ]) {
      expect(isFoundingSchoolEmail(email)).toBe(false);
    }
    expect(unwrapGoogleConflictAddress('kid@scprep.org')).toBe('kid@scprep.org');
  });

  test('falls back to username for local accounts that sign in by email-as-username', () => {
    process.env.FOUNDING_SCHOOL_DOMAINS = 'scprep.org';
    expect(isFoundingSchoolUser({ username: 'kid@scprep.org' })).toBe(true);
    expect(isFoundingSchoolUser({ username: 'kid_scprep' })).toBe(false);
    expect(isFoundingSchoolUser(null)).toBe(false);
  });
});

describe('the seam — hasUnmeteredAiAccess', () => {
  test('a founding-school free student is unmetered', async () => {
    process.env.FOUNDING_SCHOOL_DOMAINS = 'scprep.org';
    await expect(hasUnmeteredAiAccess(freeStudent('kid@scprep.org'))).resolves.toBe(true);
  });

  test('the identical student without the env grant is metered', async () => {
    await expect(hasUnmeteredAiAccess(freeStudent('kid@scprep.org'))).resolves.toBe(false);
  });

  test('other free students stay metered while the grant is on', async () => {
    process.env.FOUNDING_SCHOOL_DOMAINS = 'scprep.org';
    await expect(hasUnmeteredAiAccess(freeStudent('kid@elsewhere.org'))).resolves.toBe(false);
  });
});

describe('the health surface — /api/health reports whether the grant is configured', () => {
  // The failure this exists for: FOUNDING_SCHOOL_DOMAINS unset in prod. Every
  // scprep student silently became a free-tier student and hit the weekly wall;
  // nothing logged or threw, and the first report came from a student.
  test('unset reports off with zero domains — a note, not a degradation', () => {
    expect(foundingSchoolReport()).toEqual({ status: 'off', domains: 0 });
  });

  test('set reports ok with the count, never the domains themselves (public endpoint)', () => {
    process.env.FOUNDING_SCHOOL_DOMAINS = 'scprep.org, other.k12.oh.us';
    const report = foundingSchoolReport();
    expect(report).toEqual({ status: 'ok', domains: 2 });
    expect(JSON.stringify(report)).not.toMatch(/scprep/);
  });
});

describe('emailDomainFilter — the impact report scope', () => {
  test('matches the domain anchored at the end, case-insensitively', () => {
    const { email: re } = emailDomainFilter('scprep.org');
    expect(re.test('kid@scprep.org')).toBe(true);
    expect(re.test('Kid@SCPREP.ORG')).toBe(true);
    expect(re.test('kid@scprep.org.evil.com')).toBe(false);
    expect(re.test('kid@notscprep.org')).toBe(false);
  });

  test('escapes regex metacharacters — a dot is a dot', () => {
    const { email: re } = emailDomainFilter('scprep.org');
    expect(re.test('kid@scprepXorg')).toBe(false);
  });
});

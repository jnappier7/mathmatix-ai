// tests/unit/ferpaCompliance.test.js
// Unit tests for utils/ferpaCompliance.js — pure compliance helpers

jest.mock('../../utils/logger', () => ({
  warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

jest.mock('../../models/user', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn()
}));

const User = require('../../models/user');
const {
  hasOptedOutOfDirectoryInfo,
  filterDirectoryInfo,
  generateAnnualNotification,
  requiresConsentForDisclosure,
  sendEnrollmentNotification,
  DIRECTORY_INFORMATION_FIELDS
} = require('../../utils/ferpaCompliance');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('hasOptedOutOfDirectoryInfo', () => {
  test('true when ferpaSettings.directoryInfoOptOut is true', () => {
    expect(hasOptedOutOfDirectoryInfo({ ferpaSettings: { directoryInfoOptOut: true } })).toBe(true);
  });

  test('false when missing or explicitly disabled', () => {
    expect(hasOptedOutOfDirectoryInfo({})).toBe(false);
    expect(hasOptedOutOfDirectoryInfo(null)).toBe(false);
    expect(hasOptedOutOfDirectoryInfo({ ferpaSettings: {} })).toBe(false);
    expect(hasOptedOutOfDirectoryInfo({ ferpaSettings: { directoryInfoOptOut: false } })).toBe(false);
  });
});

describe('filterDirectoryInfo', () => {
  const data = { firstName: 'Sam', lastName: 'Lee', level: 5, badges: ['x'], xp: 100 };

  test('returns data unchanged when not opted out', () => {
    expect(filterDirectoryInfo(data, { ferpaSettings: {} })).toBe(data);
  });

  test('strips directory info when opted out', () => {
    const filtered = filterDirectoryInfo(data, { ferpaSettings: { directoryInfoOptOut: true } });
    expect(filtered.firstName).toBe('Student');
    expect(filtered.lastName).toBeUndefined();
    expect(filtered.level).toBeUndefined();
    expect(filtered.badges).toBeUndefined();
    expect(filtered.xp).toBe(100); // xp stays — it's not directory info
  });
});

describe('generateAnnualNotification', () => {
  test('returns subject + text + html with default greeting', () => {
    const r = generateAnnualNotification({});
    expect(r.subject).toMatch(/Annual FERPA Rights/);
    expect(r.subject).toMatch(/Mathmatix AI/);
    expect(r.textContent).toMatch(/Dear Parent\/Guardian/);
    expect(r.htmlContent).toMatch(/<html>/);
  });

  test('personalizes with parent + student names', () => {
    const r = generateAnnualNotification({ parentName: 'Anna', studentName: 'Sam', schoolName: 'Lincoln' });
    expect(r.textContent).toContain('Dear Anna');
    expect(r.textContent).toContain('Sam');
    expect(r.subject).toContain('Lincoln');
  });
});

describe('requiresConsentForDisclosure', () => {
  test('school official disclosure is exempt for teachers', () => {
    expect(requiresConsentForDisclosure('iep_data', { accessorRole: 'teacher' })).toBe(false);
  });

  test('school official disclosure is exempt for admins', () => {
    expect(requiresConsentForDisclosure('iep_data', { accessorRole: 'admin' })).toBe(false);
  });

  test('DPA partners are exempt', () => {
    expect(requiresConsentForDisclosure('grades', { isDPAPartner: true })).toBe(false);
  });

  test('anonymized aggregate disclosures are exempt', () => {
    expect(requiresConsentForDisclosure('anonymized_aggregate')).toBe(false);
  });

  test('directory information is exempt by type', () => {
    expect(requiresConsentForDisclosure('directory_information')).toBe(false);
  });

  test('arbitrary third-party disclosure requires consent', () => {
    expect(requiresConsentForDisclosure('marketing', { accessorRole: 'student' })).toBe(true);
  });
});

describe('sendEnrollmentNotification', () => {
  test('returns false when parent is missing', async () => {
    User.findById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null)
    });
    expect(await sendEnrollmentNotification('p1', jest.fn())).toBe(false);
  });

  test('sends email and stamps lastAnnualNotification on success', async () => {
    User.findById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        email: 'parent@example.com',
        firstName: 'Anna',
        children: [{ firstName: 'Sam' }, { firstName: 'Pat' }]
      })
    });
    User.findByIdAndUpdate.mockResolvedValue({});
    const sendEmailFn = jest.fn().mockResolvedValue();

    const r = await sendEnrollmentNotification('p1', sendEmailFn);
    expect(r).toBe(true);
    expect(sendEmailFn).toHaveBeenCalledWith(
      'parent@example.com',
      expect.stringMatching(/FERPA/),
      expect.stringMatching(/<html>/),
      expect.any(String)
    );
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith('p1', {
      $set: { 'ferpaSettings.lastAnnualNotification': expect.any(Date) }
    });
  });

  test('returns false when send fails', async () => {
    User.findById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ email: 'p@x.io', firstName: 'A', children: [] })
    });
    const sendEmailFn = jest.fn().mockRejectedValue(new Error('smtp'));
    expect(await sendEnrollmentNotification('p1', sendEmailFn)).toBe(false);
  });
});

describe('DIRECTORY_INFORMATION_FIELDS', () => {
  test('contains expected directory fields', () => {
    expect(DIRECTORY_INFORMATION_FIELDS).toEqual(expect.arrayContaining([
      'firstName', 'gradeLevel', 'level', 'badges'
    ]));
    expect(DIRECTORY_INFORMATION_FIELDS).not.toContain('email');
    expect(DIRECTORY_INFORMATION_FIELDS).not.toContain('lastName');
  });
});

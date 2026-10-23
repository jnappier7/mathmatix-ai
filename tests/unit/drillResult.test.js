const fs = require('fs');
const path = require('path');
const DrillResult = require('../../models/drillResult');

describe('DrillResult schema', () => {
  const ok = {
    userId: '507f1f77bcf86cd799439011',
    hub: 'algebra', drill: 'alg1m3', playbook: 'all',
    seconds: 120, focus: [], score: 880, right: 22, attempted: 24, streak: 9,
  };

  it('accepts a finished round', () => {
    expect(new DrillResult(ok).validateSync()).toBeUndefined();
  });

  it('requires the fields a round is meaningless without', () => {
    for (const missing of ['userId', 'hub', 'drill', 'score', 'right', 'attempted']) {
      const doc = new DrillResult({ ...ok, [missing]: undefined });
      expect(doc.validateSync()?.errors?.[missing]).toBeDefined();
    }
  });

  it('refuses negative and absurd counts, so one bad payload cannot skew an average', () => {
    expect(new DrillResult({ ...ok, score: -1 }).validateSync()?.errors?.score).toBeDefined();
    expect(new DrillResult({ ...ok, right: -1 }).validateSync()?.errors?.right).toBeDefined();
    expect(new DrillResult({ ...ok, attempted: 99999 }).validateSync()?.errors?.attempted).toBeDefined();
    expect(new DrillResult({ ...ok, score: 10 ** 9 }).validateSync()?.errors?.score).toBeDefined();
    expect(new DrillResult({ ...ok, seconds: 99999 }).validateSync()?.errors?.seconds).toBeDefined();
  });

  it('derives accuracy rather than storing a second copy to disagree with', () => {
    expect(new DrillResult(ok).accuracy).toBeCloseTo(22 / 24);
    expect(new DrillResult({ ...ok, right: 0, attempted: 0 }).accuracy).toBe(0);
  });
});

// A saved drill round is a student education record. Both obligations below are
// invisible when broken — an export quietly misses a collection, a deleted
// account quietly keeps one — so they are pinned at the source level.
describe('DrillResult is treated as a student education record', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../routes/dataPrivacy.js'), 'utf8');

  it('is in the FERPA export', () => {
    expect(src).toMatch(/DrillResult\.find\(\{\s*userId: objectId\s*\}\)/);
    expect(src).toMatch(/drillResults/);
  });

  it('is in the account-deletion sweep', () => {
    expect(src).toMatch(/DrillResult\.deleteMany\(\{\s*userId: objectId\s*\}\)/);
  });

  it('is not on the CSRF exempt list — it is a cookie-session write', () => {
    const csrf = fs.readFileSync(path.join(__dirname, '../../middleware/csrf.js'), 'utf8');
    const exemptBlock = csrf.slice(0, csrf.indexOf('function csrfProtection'));
    expect(exemptBlock).not.toMatch(/live-drill\/solo/);
  });
});

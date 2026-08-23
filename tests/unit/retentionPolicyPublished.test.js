/**
 * THE PUBLISHED RETENTION POLICY MUST MATCH THE ONE WE ACTUALLY RUN.
 *
 * The amended COPPA Rule requires a written data retention policy in the online
 * privacy notice, stating for each category of children's information what is
 * retained, the business purpose, and a specific deletion timeframe. It also
 * prohibits indefinite retention.
 *
 * Before this, public/privacy.html §7 said only "as long as necessary" while
 * utils/dataRetention.js held real periods that were never published — and
 * three of the seven declared categories were never actually swept, so the
 * unpublished periods were not true either.
 *
 * These tests bind the notice to the engine in both directions: every category
 * the sweep deletes must be disclosed, and the disclosed period must be the
 * period the sweep uses. A change to one without the other fails here.
 */

const fs = require('fs');
const path = require('path');

const {
    DEFAULT_RETENTION_POLICY,
    getPublishedRetentionPolicy,
} = require('../../utils/dataRetention');

const PRIVACY_HTML = fs.readFileSync(
    path.join(__dirname, '..', '..', 'public', 'privacy.html'),
    'utf8'
);

// public/safety.html is the plain-language front door for the same facts. It
// restates two of the periods — the two parents ask about — so it is a third
// place they can drift from the engine, and it gets bound here for the same
// reason the notice is.
const SAFETY_HTML = fs.readFileSync(
    path.join(__dirname, '..', '..', 'public', 'safety.html'),
    'utf8'
);

/** Collapse whitespace/entities so HTML formatting doesn't cause false failures. */
function normalize(s) {
    return s.replace(/&#39;|&rsquo;|’/g, "'").replace(/\s+/g, ' ').trim();
}

const NORMALIZED_HTML = normalize(PRIVACY_HTML);
const NORMALIZED_SAFETY = normalize(SAFETY_HTML);

describe('retention policy is published', () => {
    test('every swept category is disclosed by name in the privacy notice', () => {
        const missing = getPublishedRetentionPolicy()
            .filter((row) => !NORMALIZED_HTML.includes(normalize(row.category)))
            .map((row) => `${row.key} ("${row.category}")`);

        expect(missing).toEqual([]);
    });

    test('every category discloses its business purpose', () => {
        const missing = getPublishedRetentionPolicy()
            .filter((row) => !NORMALIZED_HTML.includes(normalize(row.purpose)))
            .map((row) => row.key);

        expect(missing).toEqual([]);
    });

    test('every category states a specific deletion timeframe', () => {
        for (const row of getPublishedRetentionPolicy()) {
            expect(row.days).toBeGreaterThan(0);
            expect(NORMALIZED_HTML).toContain(row.humanPeriod);
        }
    });

    test('the notice states that retention is not indefinite', () => {
        expect(NORMALIZED_HTML.toLowerCase()).toContain('do not retain');
        expect(NORMALIZED_HTML.toLowerCase()).toContain('indefinitely');
    });

    test('the notice no longer relies on the bare "as long as necessary" wording alone', () => {
        // A table with real periods must be present, not just prose.
        expect(PRIVACY_HTML).toContain('retention-policy-table');
    });
});

describe('the policy object is internally sound', () => {
    test('every category is wired to a model, so it is actually swept', () => {
        // The 4-of-7 bug: categories declared with a period but no sweep.
        const unswept = Object.entries(DEFAULT_RETENTION_POLICY)
            .filter(([, spec]) => !spec.model)
            .map(([key]) => key);

        expect(unswept).toEqual([]);
    });

    test('every category carries the fields the published notice needs', () => {
        for (const [key, spec] of Object.entries(DEFAULT_RETENTION_POLICY)) {
            expect(`${key}.publicLabel:${typeof spec.publicLabel}`).toBe(`${key}.publicLabel:string`);
            expect(`${key}.purpose:${typeof spec.purpose}`).toBe(`${key}.purpose:string`);
            expect(`${key}.days:${spec.days > 0}`).toBe(`${key}.days:true`);
        }
    });

    test('the three previously-unswept categories are covered', () => {
        // Named explicitly: these retained forever while the policy claimed 3 years.
        for (const key of ['completedAssessments', 'gradingResults', 'impersonationLogs']) {
            expect(DEFAULT_RETENTION_POLICY[key].model).toBeTruthy();
        }
        expect(DEFAULT_RETENTION_POLICY.completedAssessments.model).toBe('ScreenerSession');
        expect(DEFAULT_RETENTION_POLICY.gradingResults.model).toBe('GradingResult');
        expect(DEFAULT_RETENTION_POLICY.impersonationLogs.model).toBe('ImpersonationLog');
    });

    test('humanPeriod phrasing is what the notice actually prints', () => {
        const byKey = Object.fromEntries(getPublishedRetentionPolicy().map((r) => [r.key, r]));
        expect(byKey.studentUploads.humanPeriod).toBe('30 days');
        expect(byKey.inactiveConversations.humanPeriod).toBe('1 year');
        expect(byKey.completedAssessments.humanPeriod).toBe('3 years');
    });
});

describe('the plain-language page agrees with the engine', () => {
    const byKey = Object.fromEntries(getPublishedRetentionPolicy().map((r) => [r.key, r]));

    test('uploads and conversations state the periods the sweep uses', () => {
        // The two a parent asks about first. Restated in plain language on
        // safety.html rather than linked, because "how long do you keep my
        // child's homework photos" should not require opening a legal notice.
        expect(NORMALIZED_SAFETY).toContain(byKey.studentUploads.humanPeriod);
        expect(NORMALIZED_SAFETY).toContain(byKey.inactiveConversations.humanPeriod);
    });

    test('the educational-record period is stated too', () => {
        expect(NORMALIZED_SAFETY).toContain(byKey.completedAssessments.humanPeriod);
    });

    test('it says retention is not indefinite and points at the full table', () => {
        expect(NORMALIZED_SAFETY.toLowerCase()).toContain('not indefinitely');
        // The anchor has to resolve, or "the full table" goes to the top of a
        // long legal page and the reader gives up.
        expect(NORMALIZED_SAFETY).toContain('privacy.html#retention');
        expect(NORMALIZED_HTML).toContain('id="retention"');
    });
});

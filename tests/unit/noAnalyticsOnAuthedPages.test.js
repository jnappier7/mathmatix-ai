/**
 * NO THIRD-PARTY ANALYTICS ON AUTHENTICATED PAGES.
 *
 * Google Tag Manager was embedded in every page in public/, including
 * chat.html and screener.html — so a signed-in 9-year-old's tutoring session
 * handed googletagmanager.com a request, with the page URL and a persistent
 * identifier, on every load. Under COPPA that is third-party collection from a
 * child-directed service, and the amended Rule wants separate verifiable
 * parental consent for disclosures that are not integral to the service.
 * Analytics is not integral to tutoring.
 *
 * The rule this pins: any page behind a login carries no third-party analytics.
 * Authenticated pages also put student identifiers in URLs and titles, which is
 * a FERPA problem independent of the child's age, so this covers the teacher,
 * parent and admin dashboards too.
 *
 * Marketing and auth-entry pages (index, pricing, signup, login, privacy,
 * terms, password reset, email verification, contact support) are explicitly
 * allowed to keep GTM — that is prospect traffic, not student records.
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

// Pages that may carry analytics: marketing funnel + unauthenticated auth entry.
const ANALYTICS_ALLOWED = new Set([
    'index.html',
    'pricing.html',
    // Audience landing pages split out of the homepage. Same prospect traffic,
    // same funnel, no student records — see index.html above.
    'for-teachers.html',
    'for-students.html',
    'signup.html',
    'login.html',
    'privacy.html',
    'terms.html',
    'forgot-password.html',
    'reset-password.html',
    'email-verification.html',
    'contact-support.html',
    'quiz.html',
]);

// Any request to one of these origins from an authenticated page is a finding.
// Includes preconnect/dns-prefetch: a preconnect still contacts the host.
const ANALYTICS_MARKERS = [
    'googletagmanager.com',
    'google-analytics.com',
    'connect.facebook.net',
    'static.hotjar.com',
    'clarity.ms',
    'gtm.start',
];

function htmlPages() {
    return fs.readdirSync(PUBLIC_DIR).filter((f) => f.endsWith('.html'));
}

describe('third-party analytics placement', () => {
    test('no authenticated page references an analytics origin', () => {
        const offenders = [];

        for (const page of htmlPages()) {
            if (ANALYTICS_ALLOWED.has(page)) continue;
            const src = fs.readFileSync(path.join(PUBLIC_DIR, page), 'utf8');
            const hits = ANALYTICS_MARKERS.filter((m) => src.includes(m));
            if (hits.length) offenders.push(`${page} → ${hits.join(', ')}`);
        }

        expect(offenders).toEqual([]);
    });

    test('the student tutoring surfaces are specifically clean', () => {
        // Named explicitly so a future rename of the allow-list cannot quietly
        // re-admit the pages that matter most.
        for (const page of ['chat.html', 'screener.html', 'canvas.html', 'mastery-chat.html', 'student-dashboard.html']) {
            const src = fs.readFileSync(path.join(PUBLIC_DIR, page), 'utf8');
            for (const marker of ANALYTICS_MARKERS) {
                expect(`${page}:${src.includes(marker)}`).toBe(`${page}:false`);
            }
        }
    });

    test('the parental consent page carries no analytics', () => {
        // The visitor is an unauthenticated parent who has not yet authorised
        // anything. Loading a tracker on the consent page itself would be the
        // disclosure they are being asked to approve.
        const src = fs.readFileSync(path.join(PUBLIC_DIR, 'parental-consent.html'), 'utf8');
        for (const marker of ANALYTICS_MARKERS) {
            expect(src.includes(marker)).toBe(false);
        }
    });

    test('the allow-list only names pages that exist', () => {
        const present = new Set(htmlPages());
        const stale = [...ANALYTICS_ALLOWED].filter((p) => !present.has(p));
        expect(stale).toEqual([]);
    });
});

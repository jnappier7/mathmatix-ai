// tests/unit/activeRoleSweep.test.js
//
// A source-scanning pin over the whole `user.role` → roles-held sweep
// (#1540 → #1541 → #1542 → this one).
//
// CLAUDE.md §12: `role` is the ACTIVE role — which dashboard an account
// currently has open — and `roles[]` is every role it HOLDS. Authorization,
// DB filters and role assertions on other users must read roles held, via
// utils/roleQuery. `role` is legitimate for exactly two things: routing the
// ACTING user to a dashboard, and labelling a role in an audit trail.
//
// Sweeps rot. The eighty-odd comparisons this replaced were themselves the
// residue of an earlier pass, and every new route is a chance to write
// `req.user.role === 'admin'` again — which passes review easily, because it
// reads correctly and works perfectly for the single-role accounts everyone
// tests with. It only fails for multi-role accounts, silently, in production.
//
// So rather than trusting the next reviewer to notice, this test enumerates
// every surviving comparison and fails on any that is not on the list below.
// Adding a site here is deliberate and reviewable; forgetting to is not
// possible.
//
// If this test fails on code you just wrote, the question to answer is the one
// in §12: is this deciding what to show the ACTING user (keep `role`, add it
// below with a reason), or is it gating access / filtering a query / asserting
// a role on some OTHER user (use utils/roleQuery)?

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DIRS = ['routes', 'config', 'middleware', 'services', 'utils', 'auth'];

// `<something>.role === 'student'` and the !== form, either quote style.
const COMPARISON = /\.role\s*(?:===|!==)\s*['"](?:student|teacher|parent|admin)['"]/;

// Every site allowed to keep reading the ACTIVE role, and why.
// Keyed by file, valued by the number of comparisons that file may contain —
// a count rather than a set of line numbers, so ordinary edits above them do
// not churn this list, while adding a NEW one still trips the test.
const ALLOWED = {
    // --- acting-user dashboard routing: which page to send THIS user to ---
    // All five reach the role chain only after a `roles.length > 1` check has
    // diverted multi-role accounts to /role-picker.html, so there is no
    // held-role reading to prefer.
    'middleware/auth.js': 5,      // ensureNotAuthenticated → post-login redirect
    'routes/login.js': 4,         // the same chain, on the local-login path
    'routes/onboarding.js': 4,    // computeNextUrl, after intent capture
    'config/routes.js': 2,        // OAuth callbacks → /pick-tutor.html
    'routes/signup.js': 1,        // brand-new account, exactly one role

    // --- view routing: which of an account's OWN panes to open ---
    // messagingViewRole deliberately prefers the active role: a teacher-parent
    // looking at the teacher dashboard wants their students' parents, not their
    // own child's teachers. It falls back to a held role, so it never returns
    // an empty list. Documented in utils/messagingAccess.js.
    'utils/messagingAccess.js': 1,

    // --- not User.role at all ---
    // Waitlist.role: one self-declared string on a pre-signup record, no
    // roles[] and no account behind it.
    'routes/admin.js': 3,
    // Demo seed templates, keyed by profile id, not user documents.
    'utils/demoReset.js': 2,
    // Chat-message roles ('user' / 'assistant'), a different `role` entirely.
    'utils/boardCommandGuard.js': 1,

    // --- prose ---
    // roleQuery's own doc comment, quoting the bug it exists to prevent.
    'utils/roleQuery.js': 1,
    // canImpersonate's comment, naming the two comparisons it replaced.
    'middleware/impersonation.js': 2,
};

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') continue;
            walk(full, out);
        } else if (entry.name.endsWith('.js')) {
            out.push(full);
        }
    }
    return out;
}

function scan() {
    const found = {};
    for (const dir of DIRS) {
        const abs = path.join(ROOT, dir);
        if (!fs.existsSync(abs)) continue;
        for (const file of walk(abs)) {
            const rel = path.relative(ROOT, file);
            const hits = fs.readFileSync(file, 'utf8')
                .split('\n')
                .map((line, i) => ({ line: i + 1, text: line.trim() }))
                .filter(({ text }) => COMPARISON.test(text));
            if (hits.length) found[rel] = hits;
        }
    }
    return found;
}

describe('active-role comparisons are confined to the documented sites', () => {
    const found = scan();

    test('no file reads `user.role` for a decision without being on the list', () => {
        const unlisted = Object.entries(found)
            .filter(([file]) => !(file in ALLOWED))
            .map(([file, hits]) => `${file}: ${hits.map((h) => `L${h.line} ${h.text}`).join(' | ')}`);

        expect(unlisted).toEqual([]);
    });

    test('no listed file has grown extra comparisons', () => {
        const grown = Object.entries(found)
            .filter(([file]) => file in ALLOWED)
            .filter(([file, hits]) => hits.length > ALLOWED[file])
            .map(([file, hits]) =>
                `${file}: ${hits.length} comparisons, ${ALLOWED[file]} allowed — ` +
                hits.map((h) => `L${h.line} ${h.text}`).join(' | '));

        expect(grown).toEqual([]);
    });

    test('the list has no stale entries', () => {
        // A file that dropped its last comparison should come off the list, so
        // the list keeps describing the code rather than its history.
        const stale = Object.keys(ALLOWED).filter((file) => !(file in found));
        expect(stale).toEqual([]);
    });

    test('the scanner actually matches the pattern it claims to', () => {
        // A regex that silently stopped matching would make every test above
        // pass vacuously — the failure mode this whole file exists to prevent.
        expect(COMPARISON.test("if (req.user.role === 'admin') {")).toBe(true);
        expect(COMPARISON.test('} else if (user.role === "teacher") {')).toBe(true);
        expect(COMPARISON.test("if (target.role !== 'student') return;")).toBe(true);
        expect(COMPARISON.test("if (userHasRole(req.user, 'admin')) {")).toBe(false);
        expect(Object.keys(found).length).toBeGreaterThan(0);
    });
});

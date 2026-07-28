/**
 * Nothing relies on updateChatForSession to author its opening message.
 *
 * `updateChatForSession` (public/js/script.js) used to append a static "Welcome
 * to your <topic> session!" bubble whenever it switched into an EMPTY
 * conversation typed 'topic' — directly contradicting its own comment about not
 * duplicating the caller's greeting. In practice 'topic' means "course
 * conversation", and activateCourse / enrollInCourse call sendCourseGreeting()
 * immediately after switching, so the placeholder fired only where a real
 * greeting was already on its way: a fake greeting with the real one underneath
 * it, on every entry into an empty course sitting. That is one of the duplicate
 * assistant bubbles in the owner's report, and empty course sittings became
 * more common once conversations started rolling per login.
 *
 * The placeholder is gone. This test pins the premise that made removing it
 * safe — that every conversation type either has a caller who greets it, or is
 * expected to open blank the way a new general chat does.
 *
 * Two writers of 'topic' exist today:
 *   - utils/courseConversation.js — the live one. Course sittings; the caller
 *     always greets.
 *   - services/chatService.js — a dormant API branch behind POST
 *     /api/conversations with a `topic` body. No client sends one (sidebar.js
 *     posts `{}`), so it creates nothing in production. If it were ever wired
 *     up, its conversations would open blank — the same as a new general chat,
 *     which is acceptable, not a regression.
 *
 * A THIRD writer is the thing to catch: whoever adds one must decide who greets
 * it rather than assume a shared placeholder still exists.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const SEARCH_DIRS = ['routes', 'utils', 'services', 'models', 'scripts', 'middleware', 'config'];

// Matches `conversationType: 'topic'` / "topic" with any spacing.
const ASSIGNS_TOPIC = /conversationType\s*:\s*['"]topic['"]/;

function* jsFiles(dir) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') continue;
            yield* jsFiles(rel);
        } else if (entry.name.endsWith('.js')) {
            yield rel;
        }
    }
}

const topicWriters = [];
for (const dir of SEARCH_DIRS) {
    for (const rel of jsFiles(dir)) {
        const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        if (ASSIGNS_TOPIC.test(src)) topicWriters.push(rel.split(path.sep).join('/'));
    }
}

describe("conversationType 'topic'", () => {
    test('has exactly the two known writers', () => {
        expect(topicWriters.sort()).toEqual([
            'services/chatService.js',
            'utils/courseConversation.js',
        ]);
    });

    test('the live writer is the course-conversation resolver', () => {
        // Not just the path — the module must actually still be the course
        // resolver, so a rename that repurposes the file doesn't quietly
        // satisfy the check above.
        const { resolveCourseConversation, courseBreakReason } = require('../../utils/courseConversation');
        expect(typeof resolveCourseConversation).toBe('function');
        expect(typeof courseBreakReason).toBe('function');
    });

    test('the dormant writer stays unreachable — no client posts a topic', () => {
        // Today sidebar.js is the only client that POSTs /api/conversations and
        // it sends an empty body. Scan ALL of public/js rather than just that
        // file: the risk is a NEW caller appearing somewhere else, which is
        // exactly what a sidebar-only check would miss. If one does, the branch
        // in services/chatService.js starts creating non-course topic
        // conversations, which now open blank and need a greeter of their own.
        const callers = [];
        for (const rel of jsFiles('public/js')) {
            const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
            if (/['"]\/api\/conversations['"][\s\S]{0,400}?\btopic\s*:/.test(src)) {
                callers.push(rel.split(path.sep).join('/'));
            }
        }
        expect(callers).toEqual([]);
    });
});

describe('the placeholder greeting is gone', () => {
    test('updateChatForSession no longer fabricates a welcome bubble', () => {
        // The removal is the fix; this catches a revert or a copy-paste
        // resurrection, neither of which any other test would notice.
        const script = fs.readFileSync(path.join(ROOT, 'public/js/script.js'), 'utf8');
        expect(script).not.toMatch(/Welcome to your \$\{conversation\.topic/);
    });
});

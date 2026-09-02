/**
 * Every third party the code talks to is disclosed on public/subprocessors.html.
 *
 * THE PROBLEM THIS PINS: a subprocessor list goes stale silently. Someone adds
 * a provider — a new speech vendor, an avatar service — sets its API key on
 * Render, ships, and the public list still describes last year's stack. Nothing
 * errors. A district that relied on the list to approve us is now relying on a
 * false statement, and the DPA they signed typically requires notice before a
 * new subprocessor receives their students' data.
 *
 * So the list is bound to the code the same way the retention table is bound
 * to the retention engine (tests/unit/retentionPolicyPublished.test.js): every
 * credential-shaped environment variable the server actually reads maps to a
 * named vendor, and that name must appear on the page. Add a provider without
 * disclosing it and this fails.
 *
 * Dead integrations do not count. GEMINI_API_KEY is referenced only inside a
 * commented-out block in services/aiService.js; comment lines are stripped
 * before scanning so a disabled vendor is not demanded on the page.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PAGE = fs.readFileSync(path.join(ROOT, 'public', 'subprocessors.html'), 'utf8')
    .replace(/&rsquo;/g, "'").replace(/\s+/g, ' ');

/** Server-side directories whose process.env reads define "what the code talks to". */
const SCAN_DIRS = ['server.js', 'instrument.js', 'config', 'utils', 'routes', 'middleware', 'services', 'auth'];

/**
 * Credential env var → the vendor name as it must appear on the page. A var
 * not in this map is not a third party (SESSION_SECRET, PORT…) and is ignored;
 * a var in this map whose name is missing from the page fails the test.
 */
const VENDOR_BY_ENV = {
    OPENAI_API_KEY: 'OpenAI',
    ANTHROPIC_API_KEY: 'Anthropic',
    ANTHROPIC_API_KEY_PROD: 'Anthropic',
    ANTHROPIC_API_KEY_DEV: 'Anthropic',
    MATHPIX_APP_KEY: 'Mathpix',
    MATHPIX_APP_ID: 'Mathpix',
    DEEPGRAM_API_KEY: 'Deepgram',
    CARTESIA_API_KEY: 'Cartesia',
    SIMLI_API_KEY: 'Simli',
    GOOGLE_SEARCH_API_KEY: 'Google Custom Search',
    GOOGLE_CSE_API_KEY: 'Google Custom Search',
    GOOGLE_CLIENT_ID: 'Google',
    MICROSOFT_CLIENT_ID: 'Microsoft',
    CLEVER_CLIENT_ID: 'Clever',
    STRIPE_SECRET_KEY: 'Stripe',
    MONGO_URI: 'MongoDB',
    S3_BUCKET: 'Object storage',
    REDIS_URL: 'Redis',
    SMTP_HOST: 'Transactional email',
    SENTRY_DSN: 'Sentry',
    LOGTAIL_SOURCE_TOKEN: 'Better Stack',
    GEMINI_API_KEY: 'Gemini', // dead integration — must NOT be live; see test below
};

function listJsFiles(entry) {
    const full = path.join(ROOT, entry);
    if (!fs.existsSync(full)) return [];
    if (fs.statSync(full).isFile()) return [full];
    const out = [];
    for (const name of fs.readdirSync(full)) {
        const p = path.join(full, name);
        if (fs.statSync(p).isDirectory()) out.push(...listJsFiles(path.relative(ROOT, p)));
        else if (name.endsWith('.js')) out.push(p);
    }
    return out;
}

/** Every env var read in live (uncommented) server code. */
function liveEnvReads() {
    const found = new Set();
    for (const file of SCAN_DIRS.flatMap(listJsFiles)) {
        const src = fs.readFileSync(file, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')       // block comments
            .replace(/^\s*\/\/.*$/gm, '');          // line comments
        for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) found.add(m[1]);
    }
    return found;
}

describe('subprocessor disclosure matches the code', () => {
    const live = liveEnvReads();

    it('scans real code', () => {
        expect(live.size).toBeGreaterThan(20);
        expect(live.has('OPENAI_API_KEY')).toBe(true);
    });

    it('names every live third party on the page', () => {
        const missing = [...live]
            .filter((v) => VENDOR_BY_ENV[v] && VENDOR_BY_ENV[v] !== 'Gemini')
            .map((v) => VENDOR_BY_ENV[v])
            .filter((vendor, i, arr) => arr.indexOf(vendor) === i)
            .filter((vendor) => !PAGE.includes(vendor));

        expect(missing).toEqual([]);
    });

    it('does not carry a dead integration on the page, and the dead one stays dead', () => {
        // Gemini is referenced only in a commented-out block. If someone
        // re-enables it, this fails and the page needs a row.
        expect(live.has('GEMINI_API_KEY')).toBe(false);
        expect(PAGE).not.toMatch(/Gemini/);
    });

    it('states the one signed DPA where it is, and nowhere it is not', () => {
        // OpenAI is the only executed (countersigned) Data Processing Agreement.
        // The page must say so for OpenAI and must not imply it for anyone else.
        const rows = PAGE.split('<tr>').filter((r) => r.includes('<th scope="row">'));
        const signed = rows.filter((r) => /Signed Data Processing Agreement/.test(r));
        expect(signed).toHaveLength(1);
        expect(signed[0]).toMatch(/OpenAI/);
    });

    it('describes the Anthropic DPA as incorporated, not signed', () => {
        // Anthropic's DPA is incorporated by reference into its Commercial
        // Terms of Service; there is no separate signature flow. That is a
        // different claim from OpenAI's countersigned agreement and the page
        // must not blur the two.
        const rows = PAGE.split('<tr>').filter((r) => r.includes('<th scope="row">'));
        const anthropic = rows.find((r) => /<th scope="row">Anthropic</.test(r));
        expect(anthropic).toMatch(/Data Processing Addendum/);
        expect(anthropic).toMatch(/incorporated/);
        expect(anthropic).not.toMatch(/Signed/);

        // No third vendor gets a DPA claim of either kind.
        const anyDpa = rows.filter((r) => /Data Processing (Agreement|Addendum)/.test(r));
        expect(anyDpa.map((r) => r.match(/<th scope="row">([^<]+)</)[1]).sort()).toEqual(['Anthropic', 'OpenAI']);
    });

    it('is honest about what Sentry receives', () => {
        // Bound to instrument.js: sendDefaultPii off + scrubber (sentryPii.test.js).
        const sentryRow = PAGE.split('<tr>').find((r) => r.includes('>Sentry<'));
        expect(sentryRow).toMatch(/Request bodies, cookies, headers and IP addresses are stripped/);
    });

    it('states that analytics never reach signed-in pages', () => {
        // Bound to tests/unit/noAnalyticsOnAuthedPages.test.js.
        expect(PAGE).toMatch(/never loaded on any signed-in page/);
    });

    it('names the legal entity', () => {
        expect(PAGE).toMatch(/Mathmatix LLC/);
    });
});

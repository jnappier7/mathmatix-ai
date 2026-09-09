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

    it('is honest about what Mathpix keeps', () => {
        // Bound to utils/ocr.js + utils/pdfOcr.js (mathpixPrivacy.test.js):
        // every request opts out of retention and PDFs are deleted after
        // extraction. The page may claim it only while the code does it.
        const ocrSrc = fs.readFileSync(path.join(ROOT, 'utils', 'ocr.js'), 'utf8');
        const pdfSrc = fs.readFileSync(path.join(ROOT, 'utils', 'pdfOcr.js'), 'utf8');
        expect(ocrSrc).toMatch(/improve_mathpix:\s*false/);
        expect(pdfSrc).toMatch(/MATHPIX_PRIVACY_METADATA/);
        expect(pdfSrc).toMatch(/axios\.delete\(`https:\/\/api\.mathpix\.com\/v3\/pdf\//);

        const mathpixRow = PAGE.split('<tr>').find((r) => r.includes('>Mathpix<'));
        expect(mathpixRow).toMatch(/retention option turned off/);
        expect(mathpixRow).toMatch(/deleted from Mathpix as soon as the text has been retrieved/);
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


    it('discloses third parties the browser contacts, not only the ones with an API key', () => {
        // THE BLIND SPOT THIS CLOSES: the env-var scan above finds a vendor by
        // its credential. An embedded third party needs no credential — the
        // student's browser talks to it directly — so it is invisible to that
        // scan. YouTube hosts every lesson video under public/courses and went
        // undisclosed for months because of exactly this.
        //
        // So: any external origin the generated course pages embed in an iframe
        // must be named on the page. Scanning the built output rather than a
        // list means a generator that changes hosts cannot quietly bypass this.
        const coursesDir = path.join(ROOT, 'public', 'courses');
        if (!fs.existsSync(coursesDir)) return;            // repo without a publish yet

        const pages = [];
        const walk = (dir) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) walk(full);
                else if (e.name.endsWith('.html')) pages.push(full);
            }
        };
        walk(coursesDir);

        const origins = new Set();
        for (const f of pages) {
            const html = fs.readFileSync(f, 'utf8');
            for (const m of html.matchAll(/<iframe[^>]+src="https:\/\/([^/"]+)/g)) {
                origins.add(m[1].replace(/^www\./, ''));
            }
        }

        // origin -> the name that must appear on the disclosure page
        const NAMES = {
            'youtube-nocookie.com': 'YouTube',
            'youtube.com': 'YouTube',
        };
        const undisclosed = [];
        for (const o of origins) {
            const name = NAMES[o];
            if (!name) {
                undisclosed.push(`${o} (unknown embed origin — add it to NAMES and to the page)`);
            } else if (!PAGE.includes(name)) {
                undisclosed.push(`${o} -> "${name}" is not named on subprocessors.html`);
            }
        }
        expect(undisclosed).toEqual([]);
    });

    it('describes the embed host the course pages actually use', () => {
        // The nocookie host sets no cookie until playback starts; plain
        // youtube.com sets them on load. The page states which one we use, so
        // that claim has to track the generated pages. It has already been
        // switched once under a filtering problem and switched back.
        const coursesDir = path.join(ROOT, 'public', 'courses');
        if (!fs.existsSync(coursesDir)) return;
        const pages = [];
        const walk = (dir) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) walk(full);
                else if (e.name.endsWith('.html')) pages.push(full);
            }
        };
        walk(coursesDir);
        const all = pages.map((f) => fs.readFileSync(f, 'utf8')).join('');
        const usesNoCookie = /<iframe[^>]+src="https:\/\/www\.youtube-nocookie\.com/.test(all);
        const usesPlain = /<iframe[^>]+src="https:\/\/www\.youtube\.com\/embed/.test(all);
        if (usesNoCookie && !usesPlain) {
            expect(PAGE).toMatch(/youtube-nocookie\.com/);
            expect(PAGE).toMatch(/sets no cookie until playback starts/);
        } else if (usesPlain) {
            // If the pages ever go back to the cookie-setting host, the page
            // must stop claiming otherwise.
            expect(PAGE).not.toMatch(/sets no cookie until playback starts/);
        }
    });

    it('names the legal entity', () => {
        expect(PAGE).toMatch(/Mathmatix LLC/);
    });
});

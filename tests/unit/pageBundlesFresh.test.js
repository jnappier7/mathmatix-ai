/**
 * Bundled pages must ship the source they were built from.
 *
 * THE BUG THIS CATCHES: chat.html, the two dashboards and the admin page do NOT
 * load their own /js and /css files. buildPageBundles.js concatenates each
 * page's sources into content-hashed bundles under public/dist, and the page
 * links only the bundle. Editing a bundled source therefore changes NOTHING in
 * a browser until `npm run build:bundles` regenerates it and re-points the page
 * at the new hash.
 *
 * That failure is completely silent. It has no symptom in code review (the diff
 * looks right), none in the unit suite (jest requires the source directly), and
 * none in `npm run build` (vite only has entry points for the chat page).
 * PR #1483 shipped a course-unenroll fix to public/js/courseCatalog.js and
 * public/css/courseCatalog.css, merged green, and changed nothing in production:
 * chat.html was still pointing at chat-js3.0514356e.js, a bundle built before
 * the fix existed and containing none of it.
 *
 * This test re-derives every bundle's content hash from the manifest's own file
 * list, the same way buildPageBundles.js does, and asserts three things:
 *   1. the bundle file the page links actually exists on disk,
 *   2. its hash matches a rebuild from the current sources (nothing stale),
 *   3. the page's HTML really references that bundle (no orphaned manifest row).
 *
 * When this fails the fix is always the same: `npm run build:bundles`, then
 * commit the regenerated dist files alongside the source edit.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const PUB = path.join(ROOT, 'public');
const DIST = path.join(PUB, 'dist');
const MANIFEST = path.join(DIST, 'page-bundles.manifest.json');

// Mirrors buildPageBundles.js exactly — hash8(body), where body is each source
// prefixed by a `/* --- path --- */` banner, joined by a per-kind separator.
// CSS is newline-joined; JS uses "\n;\n" to defuse ASI across concatenated files.
const hash8 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
const diskPath = (rel) => path.join(PUB, rel.replace(/^\//, '').split('?')[0]);
const JOINER = { css: '\n', js: '\n;\n' };

function bundleBody(files, kind) {
  return files
    .map((f) => `/* --- ${f} --- */\n` + fs.readFileSync(diskPath(f), 'utf8'))
    .join(JOINER[kind]);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const pages = Object.keys(manifest);

describe('page bundles are built from the current sources', () => {
  test('the manifest covers the pages that are actually bundled', () => {
    // A guard on the guard: if a page is added to buildPageBundles.js's PAGES
    // but never built, this suite would silently check nothing for it.
    expect(pages).toEqual(expect.arrayContaining([
      'chat.html',
      'parent-dashboard.html',
      'teacher-dashboard.html',
      'admin-dashboard.html',
    ]));
  });

  describe.each(pages)('%s', (page) => {
    const html = fs.readFileSync(path.join(PUB, page), 'utf8');
    const entries = [
      ...(manifest[page].css || []).map((b) => ({ ...b, kind: 'css', url: b.href })),
      ...(manifest[page].js || []).map((b) => ({ ...b, kind: 'js', url: b.src })),
    ];

    test('has at least one bundle recorded', () => {
      expect(entries.length).toBeGreaterThan(0);
    });

    test.each(entries.map((e) => [e.url, e]))('%s is present, fresh and linked', (_url, entry) => {
      const onDisk = path.join(PUB, entry.url.replace(/^\//, ''));
      expect(fs.existsSync(onDisk)).toBe(true);

      // Every source the bundle claims must still exist, or the recorded file
      // list is lying about what the page ships.
      for (const f of entry.files) {
        expect(fs.existsSync(diskPath(f))).toBe(true);
      }

      // The hash in the filename IS the content hash of the sources. If a
      // source moved on and the bundle didn't, these diverge — that is exactly
      // the stale-bundle state, and the page is serving pre-edit code.
      const expected = hash8(bundleBody(entry.files, entry.kind));
      const actual = path.basename(entry.url).split('.').slice(-2, -1)[0];
      expect(actual).toBe(expected);

      // ...and the page must really point at it. A correct bundle on disk that
      // nothing links is just as dead as a stale one.
      expect(html).toContain(entry.url);
    });
  });
});

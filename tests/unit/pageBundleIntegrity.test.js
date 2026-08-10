/**
 * Bundle-reference integrity for every bundled page.
 *
 * public/dist/{js,css}/*.{js,css} are pre-built bundles committed to the repo,
 * and each page references them by content hash. The deploy runs a rebuild step
 * (Dockerfile), but this guard fails CI the moment the COMMITTED HTML and the
 * COMMITTED bundles drift — which is how chat-js4 came to 404 in production:
 * chat.html pointed at a hash whose file was never recommitted after a bundled
 * source file (inlineChatVisuals.js) changed.
 *
 * The whole chunk it referenced — including the number-line fix and, in a sibling
 * bundle, the course pre-assessment gate — silently never executed.
 *
 * Originally chat.html only. The parent/teacher/admin dashboards are bundled by
 * the same script now, and can drift the same way, so they are covered here
 * rather than left to be discovered in production a second time.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const PUB = path.join(ROOT, 'public');
const DIST = path.join(PUB, 'dist');
const MANIFEST = path.join(DIST, 'page-bundles.manifest.json');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const PAGES = Object.keys(manifest);

// Any bundle filename the build can emit: <page-prefix>-<kind><n>.<hash>.<ext>
const BUNDLE_RE = /\/dist\/(js|css)\/([a-z]+-(?:js|css)\d+\.[a-f0-9]+\.(?:js|css))/g;
const BUNDLE_FILE_RE = /^[a-z]+-(?:js|css)\d+\.[a-f0-9]+\.(?:js|css)$/;

function refsIn(page) {
  const html = fs.readFileSync(path.join(PUB, page), 'utf8');
  return [...html.matchAll(BUNDLE_RE)].map((m) => ({ kind: m[1], file: m[2] }));
}

describe('page-bundles manifest', () => {
  test('covers the pages the build script bundles', () => {
    expect(PAGES).toEqual(
      expect.arrayContaining([
        'chat.html',
        'parent-dashboard.html',
        'teacher-dashboard.html',
        'admin-dashboard.html',
      ])
    );
  });

  test('every source file listed in the manifest still exists', () => {
    const missing = [];
    for (const [page, entry] of Object.entries(manifest)) {
      for (const b of [...entry.css, ...entry.js]) {
        for (const f of b.files) {
          const onDisk = path.join(PUB, f.replace(/^\//, '').split('?')[0]);
          if (!fs.existsSync(onDisk)) missing.push(`${page}: ${f}`);
        }
      }
    }
    // A deleted source still listed in the manifest crashes the rebuild step in
    // the Docker build, i.e. it breaks the deploy rather than one page.
    expect(missing).toEqual([]);
  });
});

describe.each(PAGES)('%s references real, committed bundles', (page) => {
  test('the page actually references bundles (sanity)', () => {
    expect(refsIn(page).length).toBeGreaterThan(0);
  });

  test('every referenced bundle file exists on disk', () => {
    const missing = refsIn(page).filter(
      (r) => !fs.existsSync(path.join(DIST, r.kind, r.file))
    );
    // A miss here is exactly the production 404: the page asks for a hash whose
    // file was never committed after a source edit.
    expect(missing.map((r) => r.file)).toEqual([]);
  });

  test('the manifest agrees with the page on every bundle URL', () => {
    const entry = manifest[page];
    const manifestFiles = new Set(
      [...entry.js, ...entry.css].map((b) => (b.src || b.href).split('/').pop())
    );
    const disagree = refsIn(page).filter((r) => !manifestFiles.has(r.file));
    expect(disagree.map((r) => r.file)).toEqual([]);
  });
});

describe('dist', () => {
  test('no orphaned bundle files linger (built but unreferenced)', () => {
    const referenced = new Set(PAGES.flatMap((p) => refsIn(p).map((r) => r.file)));
    const onDisk = ['js', 'css'].flatMap((ext) =>
      fs.readdirSync(path.join(DIST, ext)).filter((f) => BUNDLE_FILE_RE.test(f))
    );
    const orphans = onDisk.filter((f) => !referenced.has(f));
    // Orphans are the flip side of the same drift — a rehash left the old file
    // behind. Harmless to serve, but a sign the pages and dist fell out of sync.
    expect(orphans).toEqual([]);
  });
});

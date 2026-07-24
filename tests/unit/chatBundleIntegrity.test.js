/**
 * chat.html bundle-reference integrity.
 *
 * public/dist/js/chat-js*.js and chat-css*.css are pre-built bundles. chat.html
 * references them by content hash. The deploy runs a rebuild step now
 * (Dockerfile), but this guard fails CI the moment the COMMITTED chat.html and
 * the COMMITTED bundles drift — which is how chat-js4 came to 404 in production:
 * chat.html pointed at a hash whose file was never recommitted after a bundled
 * source file (inlineChatVisuals.js) changed.
 *
 * The whole chunk it referenced — including the number-line fix and, in a sibling
 * bundle, the course pre-assessment gate — silently never executed.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const HTML = path.join(ROOT, 'public', 'chat.html');
const DIST = path.join(ROOT, 'public', 'dist');

const html = fs.readFileSync(HTML, 'utf8');
const refs = [...html.matchAll(/\/dist\/(js|css)\/(chat-(?:js|css)\d+\.[a-f0-9]+\.(?:js|css))/g)]
  .map((m) => ({ kind: m[1], file: m[2] }));

describe('chat.html references real, committed bundles', () => {
  test('chat.html actually references bundles (sanity)', () => {
    expect(refs.length).toBeGreaterThan(0);
  });

  test('every referenced bundle file exists on disk', () => {
    const missing = refs.filter((r) => !fs.existsSync(path.join(DIST, r.kind, r.file)));
    // A miss here is exactly the production 404: chat.html asks for a hash whose
    // file was never committed after a source edit.
    expect(missing.map((r) => r.file)).toEqual([]);
  });

  test('the manifest agrees with chat.html on every bundle URL', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'chat-bundles.manifest.json'), 'utf8'));
    const manifestFiles = new Set(
      [...manifest.js, ...manifest.css].map((b) => (b.src || b.href).split('/').pop())
    );
    const disagree = refs.filter((r) => !manifestFiles.has(r.file));
    expect(disagree.map((r) => r.file)).toEqual([]);
  });

  test('no orphaned bundle files linger in dist (built but unreferenced)', () => {
    const referenced = new Set(refs.map((r) => r.file));
    const onDisk = [
      ...fs.readdirSync(path.join(DIST, 'js')).filter((f) => /^chat-js\d+\./.test(f)),
      ...fs.readdirSync(path.join(DIST, 'css')).filter((f) => /^chat-css\d+\./.test(f)),
    ];
    const orphans = onDisk.filter((f) => !referenced.has(f));
    // Orphans are the flip side of the same drift — a rehash left the old file
    // behind. Harmless to serve, but a sign chat.html and dist fell out of sync.
    expect(orphans).toEqual([]);
  });
});

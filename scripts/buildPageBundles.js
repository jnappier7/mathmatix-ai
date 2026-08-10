#!/usr/bin/env node
/**
 * buildPageBundles.js — collapse a page's many render-blocking <link>/<script>
 * requests into a few content-hashed bundles, WITHOUT changing execution order.
 *
 * Started life as buildChatBundles.js, covering chat.html only. The dashboards
 * needed it more: teacher-dashboard.html shipped 22 separate render-blocking
 * <script src> tags — every tab's module, loaded whether or not that tab is
 * ever opened — because none of this is bundled. Vite only ever had entry
 * points for the chat page, so `npm run build` never touched the dashboards.
 *
 * Why this is safe:
 *   - We only merge *maximal runs of consecutive* same-kind local tags. Classic
 *     scripts execute synchronously in document order, so concatenating a run of
 *     consecutive <script src> is byte-for-byte equivalent to loading them one by
 *     one. Inline / deferred / module / vendor / CDN tags are left exactly where
 *     they are, so nothing's relative order changes.
 *   - CSS files all live in /css, so url(...) references resolve identically
 *     whether inside a source file or the bundle (same base path). Bundle output
 *     goes to /dist so it must use ABSOLUTE urls only.
 *   - No minification. The bundle is a plain concatenation (JS joined with ";\n"
 *     to defuse ASI). Brotli on the wire already handles whitespace.
 *
 * Re-run after editing any bundled source file:  npm run build:bundles
 * The file->bundle mapping is persisted to dist/page-bundles.manifest.json so
 * rebuilds are deterministic even once a page already points at bundles.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const DIST = path.join(PUB, 'dist');
const MANIFEST = path.join(DIST, 'page-bundles.manifest.json');

// Pages to bundle, and the prefix their bundle files carry. The prefix is part
// of every emitted filename, so changing one re-hashes that page's bundles.
const PAGES = [
  { file: 'chat.html', prefix: 'chat' },
  { file: 'parent-dashboard.html', prefix: 'parent' },
  { file: 'teacher-dashboard.html', prefix: 'teacher' },
  { file: 'admin-dashboard.html', prefix: 'admin' },
];

const hash8 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
const diskPath = (rel) => path.join(PUB, rel.replace(/^\//, '').split('?')[0]);
const onDisk = (rel) => fs.existsSync(diskPath(rel));
const read = (rel) => fs.readFileSync(diskPath(rel), 'utf8');

function writeBundle(name, ext, files, joiner) {
  const body = files.map(f => `/* --- ${f} --- */\n` + read(f)).join(joiner);
  const filename = `${name}.${hash8(body)}.${ext}`;
  fs.mkdirSync(path.join(DIST, ext), { recursive: true });
  fs.writeFileSync(path.join(DIST, ext, filename), body);
  return `/dist/${ext}/${filename}`;
}

// Split an ordered [{ file, tag }] run into maximal consecutive sub-runs of
// files that exist on disk. Non-static entries (server-generated routes) pass
// through as their original tag, preserving position/order exactly.
function segment(entries) {
  const segs = [];
  let cur = null;
  for (const e of entries) {
    if (onDisk(e.file)) {
      if (!cur) { cur = { bundle: [] }; segs.push(cur); }
      cur.bundle.push(e.file);
    } else {
      segs.push({ passthrough: e.tag });
      cur = null;
    }
  }
  return segs;
}

/** First-time transform: derive runs from the page and rewrite it to bundles. */
function build(page) {
  const htmlPath = path.join(PUB, page.file);
  let html = fs.readFileSync(htmlPath, 'utf8');
  const entry = { css: [], js: [] };

  // ---- CSS: maximal runs of consecutive local <link rel=stylesheet href="/css/..."> ----
  const cssTag = /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["'](\/css\/[^"']+)["'][^>]*>/i;
  const cssRun = /(?:[ \t]*<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']\/css\/[^"']+["'][^>]*>\s*)+/gi;
  html = html.replace(cssRun, (block) => {
    const entries = [...block.matchAll(new RegExp(cssTag.source, 'gi'))].map(m => ({ file: m[1], tag: m[0] }));
    if (entries.length < 2) return block;
    return segment(entries).map(seg => {
      if (seg.passthrough) return `  ${seg.passthrough}\n`;
      if (seg.bundle.length < 2) return `  <link rel="stylesheet" href="${seg.bundle[0]}" />\n`;
      const href = writeBundle(`${page.prefix}-css${entry.css.length}`, 'css', seg.bundle, '\n');
      entry.css.push({ href, files: seg.bundle });
      return `  <link rel="stylesheet" href="${href}" />\n`;
    }).join('');
  });

  // ---- JS: maximal runs of consecutive local classic <script src="/js/..."> ----
  // Only merge tags whose ONLY attribute is src. This automatically excludes
  // defer/module (extra tokens) AND — critically — scripts that carry data-*/
  // other attributes they read via document.currentScript (e.g. analytics.js's
  // data-ga). Bundling would reassign currentScript to the bundle tag and drop
  // those attributes, silently breaking the script. Such tags stay standalone.
  const jsTag = /<script\s+src=["'](\/js\/[^"']+)["']\s*>\s*<\/script>/i;
  const jsRun = new RegExp(`(?:[ \\t]*${jsTag.source}\\s*)+`, 'gi');
  html = html.replace(jsRun, (block) => {
    const entries = [...block.matchAll(new RegExp(jsTag.source, 'gi'))].map(m => ({ file: m[1], tag: m[0] }));
    if (entries.length < 2) return block;
    return segment(entries).map(seg => {
      if (seg.passthrough) return `  ${seg.passthrough}\n`;
      if (seg.bundle.length < 2) return `  <script src="${seg.bundle[0]}"></script>\n`;
      const src = writeBundle(`${page.prefix}-js${entry.js.length}`, 'js', seg.bundle, '\n;\n');
      entry.js.push({ src, files: seg.bundle });
      return `  <script src="${src}"></script>\n`;
    }).join('');
  });

  fs.writeFileSync(htmlPath, html);
  return entry;
}

/**
 * Rebuild mode: the page already points at bundles. Regenerate each bundle from
 * its recorded file list, and if the content hash changed, swap the old hashed
 * URL for the new one in-place. Keeps edits to bundled sources flowing through
 * without re-deriving runs.
 */
function rebuild(page, entry) {
  const htmlPath = path.join(PUB, page.file);
  let html = fs.readFileSync(htmlPath, 'utf8');
  let changed = 0;

  // Drop sources that no longer exist. Deleting a bundled file is a normal
  // thing to do (retiring a stylesheet, consolidating two scripts into one),
  // but the manifest still listed it and writeBundle's read() threw a raw
  // ENOENT stack with no clue that the fix is "it's gone, forget it". Prune
  // and say so, so the next person deleting a bundled asset just sees a line
  // in the build log instead of a crash.
  for (const kind of ['css', 'js']) {
    for (const b of entry[kind]) {
      const gone = b.files.filter((f) => !onDisk(f));
      if (!gone.length) continue;
      b.files = b.files.filter((f) => onDisk(f));
      console.log(`  pruned from ${b.href || b.src}: ${gone.join(', ')} (deleted)`);
    }
  }

  for (const b of entry.css) {
    const href = writeBundle(b.href.match(/[a-z]+-css\d+/)[0], 'css', b.files, '\n');
    if (href !== b.href) { html = html.split(b.href).join(href); b.href = href; changed++; }
  }
  for (const b of entry.js) {
    const src = writeBundle(b.src.match(/[a-z]+-js\d+/)[0], 'js', b.files, '\n;\n');
    if (src !== b.src) { html = html.split(b.src).join(src); b.src = src; changed++; }
  }

  fs.writeFileSync(htmlPath, html);
  if (changed) console.log(`  ${changed} bundle(s) re-hashed`);
  return entry;
}

/**
 * Delete bundle files in dist that no page references any more.
 *
 * A rehash leaves the previous file behind. Harmless to serve, but the
 * committed-artifact integrity test treats orphans as drift — they are the
 * flip side of the 404 it exists to catch.
 */
function pruneOrphans(manifest) {
  const referenced = new Set();
  for (const entry of Object.values(manifest)) {
    for (const b of entry.css) referenced.add(b.href.split('/').pop());
    for (const b of entry.js) referenced.add(b.src.split('/').pop());
  }

  let removed = 0;
  for (const ext of ['css', 'js']) {
    const dir = path.join(DIST, ext);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!/^[a-z]+-(?:js|css)\d+\.[a-f0-9]{8}\.(?:js|css)$/.test(f)) continue;
      if (referenced.has(f)) continue;
      fs.unlinkSync(path.join(dir, f));
      removed++;
    }
  }
  if (removed) console.log(`pruned ${removed} orphaned bundle file(s)`);
}

function main() {
  const force = process.argv.includes('--init');
  const manifest = (!force && fs.existsSync(MANIFEST))
    ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
    : {};

  for (const page of PAGES) {
    if (!fs.existsSync(path.join(PUB, page.file))) {
      console.log(`${page.file}: not found, skipped`);
      continue;
    }
    const existing = manifest[page.file];
    console.log(`${page.file}:`);
    // A page with no manifest entry has never been bundled — derive its runs.
    // One that has an entry is already rewritten, so rebuild from the entry.
    manifest[page.file] = existing ? rebuild(page, existing) : build(page);
    const e = manifest[page.file];
    const nCss = e.css.reduce((s, b) => s + b.files.length, 0);
    const nJs = e.js.reduce((s, b) => s + b.files.length, 0);
    console.log(`  CSS: ${nCss} files -> ${e.css.length} bundles`);
    console.log(`  JS : ${nJs} files -> ${e.js.length} bundles`);
  }

  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  pruneOrphans(manifest);
}

main();

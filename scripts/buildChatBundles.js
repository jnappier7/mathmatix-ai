#!/usr/bin/env node
/**
 * buildChatBundles.js — collapse chat.html's many render-blocking <link>/<script>
 * requests into a few content-hashed bundles, WITHOUT changing execution order.
 *
 * Why this is safe:
 *   - We only merge *maximal runs of consecutive* same-kind local tags. Classic
 *     scripts execute synchronously in document order, so concatenating a run of
 *     consecutive <script src> is byte-for-byte equivalent to loading them one by
 *     one. Inline / deferred / module / vendor / CDN tags are left exactly where
 *     they are, so nothing's relative order changes.
 *   - CSS files all live in /css, so url(...) references resolve identically
 *     whether inside a source file or the bundle (same base path). Bundle output
 *     goes to /dist so it must use ABSOLUTE urls only — see ASSERTIONS below.
 *   - No minification. The bundle is a plain concatenation (JS joined with ";\n"
 *     to defuse ASI). Brotli on the wire already handles whitespace.
 *
 * Re-run after editing any bundled source file:  npm run build:chat
 * The file->bundle mapping is persisted to dist/chat-bundles.manifest.json so
 * rebuilds are deterministic even once chat.html already points at bundles.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const HTML = path.join(PUB, 'chat.html');
const DIST = path.join(PUB, 'dist');
const MANIFEST = path.join(DIST, 'chat-bundles.manifest.json');

const hash8 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
const diskPath = (rel) => path.join(PUB, rel.replace(/^\//, '').split('?')[0]);
const onDisk = (rel) => fs.existsSync(diskPath(rel));
const read = (rel) => fs.readFileSync(diskPath(rel), 'utf8');

function writeBundle(prefix, ext, files, joiner) {
  const body = files.map(f => `/* --- ${f} --- */\n` + read(f)).join(joiner);
  const name = `${prefix}.${hash8(body)}.${ext}`;
  fs.mkdirSync(path.join(DIST, ext), { recursive: true });
  fs.writeFileSync(path.join(DIST, ext, name), body);
  return `/dist/${ext}/${name}`;
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

function build() {
  let html = fs.readFileSync(HTML, 'utf8');
  const manifest = { css: [], js: [] };

  // ---- CSS: maximal runs of consecutive local <link rel=stylesheet href="/css/..."> ----
  const cssTag = /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["'](\/css\/[^"']+)["'][^>]*>/i;
  const cssRun = /(?:[ \t]*<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']\/css\/[^"']+["'][^>]*>\s*)+/gi;
  html = html.replace(cssRun, (block) => {
    const entries = [...block.matchAll(new RegExp(cssTag.source, 'gi'))].map(m => ({ file: m[1], tag: m[0] }));
    if (entries.length < 2) return block;
    return segment(entries).map(seg => {
      if (seg.passthrough) return `  ${seg.passthrough}\n`;
      if (seg.bundle.length < 2) return `  <link rel="stylesheet" href="${seg.bundle[0]}" />\n`;
      const href = writeBundle(`chat-css${manifest.css.length}`, 'css', seg.bundle, '\n');
      manifest.css.push({ href, files: seg.bundle });
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
      const src = writeBundle(`chat-js${manifest.js.length}`, 'js', seg.bundle, '\n;\n');
      manifest.js.push({ src, files: seg.bundle });
      return `  <script src="${src}"></script>\n`;
    }).join('');
  });

  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(HTML, html);

  report(manifest);
}

// Rebuild mode: chat.html already points at bundles. Regenerate each bundle
// from its recorded file list, and if the content hash changed, swap the old
// hashed URL for the new one in-place. Keeps edits to bundled sources flowing
// through without re-deriving runs.
function rebuild() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  let html = fs.readFileSync(HTML, 'utf8');
  let changed = 0;

  // Drop sources that no longer exist. Deleting a bundled file is a normal
  // thing to do (retiring a stylesheet, consolidating two scripts into one),
  // but the manifest still listed it and writeBundle's read() threw a raw
  // ENOENT stack with no clue that the fix is "it's gone, forget it". Prune
  // and say so, so the next person deleting a bundled asset just sees a line
  // in the build log instead of a crash.
  for (const kind of ['css', 'js']) {
    for (const b of manifest[kind]) {
      const gone = b.files.filter((f) => !onDisk(f));
      if (!gone.length) continue;
      b.files = b.files.filter((f) => onDisk(f));
      console.log(`pruned from ${b.href || b.src}: ${gone.join(', ')} (deleted)`);
    }
  }

  for (const b of manifest.css) {
    const href = writeBundle(b.href.match(/chat-css\d+/)[0], 'css', b.files, '\n');
    if (href !== b.href) { html = html.split(b.href).join(href); b.href = href; changed++; }
  }
  for (const b of manifest.js) {
    const src = writeBundle(b.src.match(/chat-js\d+/)[0], 'js', b.files, '\n;\n');
    if (src !== b.src) { html = html.split(b.src).join(src); b.src = src; changed++; }
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(HTML, html);
  console.log(`rebuild: ${changed} bundle(s) re-hashed`);
  report(manifest);
}

function report(manifest) {
  const nCss = manifest.css.reduce((s, b) => s + b.files.length, 0);
  const nJs = manifest.js.reduce((s, b) => s + b.files.length, 0);
  console.log(`CSS: ${nCss} files -> ${manifest.css.length} bundles`);
  console.log(`JS : ${nJs} files -> ${manifest.js.length} bundles`);
}

// If a manifest already exists, chat.html is bundled — rebuild from it.
// Otherwise do the first-time transform. Force a fresh transform with --init.
if (fs.existsSync(MANIFEST) && !process.argv.includes('--init')) rebuild();
else build();

#!/usr/bin/env node
/**
 * Re-apply the St. Charles brand to the generated course pages.
 *
 * The course site under /courses is published from the Course Planner
 * (~/mathmatix-course-tools/, sync_to_repo.sh) roughly every two or three days.
 * Each publish rewrites public/courses/index.html, both courses' *.html, and
 * their assets/site.{css,js} from the generator's own templates — so anything
 * hand-edited in those files is silently gone at the next Publish. Commit
 * b1ce44b did exactly that to the whole rebrand in de24d06, and the site served
 * MATHMATIX.AI purple to St. Charles students until someone noticed on a phone.
 *
 * The CSS half of that problem is solved by ownership: the brand now lives in
 * public/courses/assets/brand.css, a directory the generator has no template for
 * (which is why the crest PNGs survived the same publish), and every page links
 * it after its generated site.css so it wins on cascade.
 *
 * What is left is the handful of brand facts that live in the HTML itself, and
 * HTML is generated. This script re-applies them, idempotently:
 *
 *   1. the <head> links — Goudy webfont, crest favicon, and brand.css LAST, so
 *      it out-cascades whatever site.css the generator shipped;
 *   2. the school's mark in the masthead (lockup on the landing page, the
 *      horizontal reverse on course pages);
 *   3. the "| St. Charles Preparatory School" title suffix;
 *   4. the school's name leading the footer line.
 *
 * Usage:
 *   npm run courses:brand           re-apply and write
 *   npm run courses:brand -- --check  report drift, write nothing, exit 1 if any
 *
 * tests/unit/courseBrandIntact.test.js runs the same logic in the unit suite, so
 * CI goes red within minutes of a publish that strips any of this — rather than
 * the site sitting off-brand until a human happens to look at it.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const COURSES_DIR = path.join(ROOT, 'public', 'courses');

const SCHOOL = 'St. Charles Preparatory School';
const TAGLINE = 'Building Better Men';
const GOUDY_HREF = 'https://fonts.googleapis.com/css2?family=Sorts+Mill+Goudy:ital@0;1&display=swap';

// layout-a/layout-b are design mockups of the chapter grid, linked from nowhere
// in the repo or the site. They are generated too, but nobody sees them, so they
// are not worth failing a build over.
const SKIP = new Set(['layout-a.html', 'layout-b.html']);

/** Every generated course page the brand applies to, as absolute paths. */
function coursePages(dir = COURSES_DIR, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // assets/ and pdfs/ hold no pages; videos/ holds no HTML either.
      if (entry.name !== 'assets' && entry.name !== 'pdfs') coursePages(full, out);
    } else if (entry.name.endsWith('.html') && !SKIP.has(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Relative href prefix from a page to public/courses/assets/ ("assets/", "../assets/"). */
function assetPrefix(file) {
  const rel = path.relative(path.dirname(file), path.join(COURSES_DIR, 'assets'));
  return rel.split(path.sep).join('/') + '/';
}

/** The one link the whole split depends on. */
function brandLink(prefix) {
  return `<link rel="stylesheet" href="${prefix}brand.css">`;
}

/**
 * The brand's <head> block, in cascade order. brand.css is last on purpose: the
 * generator emits its own <link> to site.css wherever it likes in the head, and
 * this only wins if it comes after.
 */
function headBlock(prefix) {
  return [
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link rel="stylesheet" href="${GOUDY_HREF}">`,
    `<link rel="icon" href="${prefix}sc-crest.png">`,
    brandLink(prefix),
  ].join('\n');
}

/**
 * Apply every brand fact to one page's HTML. Pure and idempotent:
 * applyBrand(applyBrand(x)) === applyBrand(x), which is what lets the test
 * assert `applyBrand(onDisk) === onDisk` and catch any drift at all.
 */
function applyBrand(html, prefix) {
  let out = html;

  // 1. Head links. Strip any copy the page already carries — wherever the
  //    generator happened to put it — then re-insert the canonical block
  //    immediately before </head> so brand.css is the last stylesheet.
  const strip = [
    /\n?[ \t]*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com"[^>]*>/g,
    /\n?[ \t]*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Sorts\+Mill\+Goudy[^"]*">/g,
    /\n?[ \t]*<link rel="icon" href="[^"]*sc-crest\.png">/g,
    /\n?[ \t]*<link rel="stylesheet" href="[^"]*brand\.css">/g,
  ];
  for (const re of strip) out = out.replace(re, '');
  out = out.replace(/([ \t]*)<\/head>/i, `${headBlock(prefix)}\n$1</head>`);

  // 2. The mark. Course pages carry the horizontal reverse in the masthead,
  //    where it sits on the blood-red field; the landing page leads with the
  //    full crest lockup, including the mandatory "Building Better Men".
  out = out.replace(
    /<img class="brand-logo"[^>]*>/g,
    `<img class="brand-logo" src="${prefix}sc-logo-hor-white.png" alt="${SCHOOL}">`
  );

  if (isLanding(prefix)) {
    // The generated landing page has no masthead at all — it opens <main> with a
    // MATHMATIX.AI wordmark inline. So this is a rebuild, not a rewrite: drop
    // that wordmark and put the school's lockup band above the content.
    out = out.replace(/\n?[ \t]*<img class="logo"[^>]*>/g, '');
    if (/<header class="masthead">/.test(out)) {
      out = out.replace(
        /(<header class="masthead">\s*)<img\b[^>]*>/,
        `$1${lockup(prefix)}`
      );
    } else {
      out = out.replace(/(<body[^>]*>\n?)/i,
        `$1<header class="masthead">\n  ${lockup(prefix)}\n</header>\n\n`);
    }
  }

  // 3. Title suffix. Strip first so re-running never stacks it.
  out = out.replace(/<title>([\s\S]*?)<\/title>/i, (_m, inner) => {
    const base = inner.replace(new RegExp(`\\s*\\|\\s*${escapeRe(SCHOOL)}\\s*$`), '').trim();
    return `<title>${base} | ${SCHOOL}</title>`;
  });

  // 4. Footer. On a course page the line also carries the course and year, which
  //    are the generator's to set — so only the school's name is forced onto the
  //    front of it. The landing page's footer is nothing BUT brand, so it is set
  //    outright: "Embrace our Building Better Men tagline. It is our rallying cry."
  const lead = new RegExp(`^\\s*${escapeRe(SCHOOL)}\\s*&middot;\\s*`);
  out = out.replace(/(<footer class="foot">\s*<span>)([\s\S]*?)(<\/span>)/, (_m, open, inner, close) =>
    `${open}${SCHOOL} &middot; ${inner.replace(lead, '')}${close}`);
  if (isLanding(prefix)) {
    out = out.replace(/<p class="foot">[\s\S]*?<\/p>/,
      `<p class="foot">${SCHOOL} &middot; <b>${TAGLINE}</b></p>`);
  }

  return out;
}

/** The landing page is the one that sits in /courses itself, beside assets/. */
function isLanding(prefix) {
  return prefix === 'assets/';
}

function lockup(prefix) {
  return `<img src="${prefix}sc-lockup-white.png"\n       alt="${SCHOOL} &mdash; ${TAGLINE}">`;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function main() {
  const check = process.argv.includes('--check');
  const pages = coursePages();
  const drifted = [];

  for (const file of pages) {
    const before = fs.readFileSync(file, 'utf8');
    const after = applyBrand(before, assetPrefix(file));
    if (after === before) continue;
    drifted.push(path.relative(ROOT, file));
    if (!check) fs.writeFileSync(file, after);
  }

  if (!drifted.length) {
    console.log(`Course brand intact on all ${pages.length} pages.`);
    return;
  }
  if (check) {
    console.error(`Course brand missing or altered on ${drifted.length} page(s):`);
    for (const f of drifted) console.error(`  ${f}`);
    console.error("\nRun 'npm run courses:brand' to re-apply, then commit the result.");
    process.exit(1);
  }
  console.log(`Re-applied the St. Charles brand to ${drifted.length} page(s):`);
  for (const f of drifted) console.log(`  ${f}`);
}

if (require.main === module) main();

module.exports = { coursePages, assetPrefix, applyBrand, brandLink, headBlock, SCHOOL, COURSES_DIR };

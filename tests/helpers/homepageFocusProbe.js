/**
 * Reports the homepage's shape — section order, length, and which audience the
 * copy addresses — plus the same for the two audience pages its student and
 * teacher pitches moved to. Not a test — a probe the test asserts against.
 *
 * Spawned as its own Node process for the same reason as i18nRenderProbe.js:
 * jsdom@27 pulls in an ESM-only transitive dependency that Jest's CommonJS
 * transform cannot parse, so `require('jsdom')` throws inside a Jest worker.
 *
 * Usage: node homepageFocusProbe.js   → JSON on stdout
 */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const PUB = path.join(__dirname, '../../public');

function parse(file) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => {});
  return new JSDOM(fs.readFileSync(path.join(PUB, file), 'utf8'), { virtualConsole }).window.document;
}

/** Visible words. Scripts and styles are not copy; textContent already skips comments. */
function words(el) {
  if (!el) return 0;
  const clone = el.cloneNode(true);
  clone.querySelectorAll('script, style').forEach((n) => n.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;
}

function sectionOrder(doc) {
  return Array.from(doc.querySelectorAll('main > section'))
    .map((s) => (s.className || '').split(/\s+/)[0])
    .filter(Boolean);
}

function linkTargets(doc) {
  return Array.from(doc.querySelectorAll('a[href]')).map((a) => a.getAttribute('href'));
}

function copyOf(doc) {
  const main = doc.querySelector('main');
  if (!main) return '';
  const clone = main.cloneNode(true);
  clone.querySelectorAll('script, style').forEach((n) => n.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

const home = parse('index.html');
const teachers = parse('for-teachers.html');
const students = parse('for-students.html');

const homeMain = home.querySelector('main');
const homeHero = home.querySelector('.lp-hero');

const result = {
  home: {
    sections: sectionOrder(home),
    words: { main: words(homeMain), hero: words(homeHero), belowHero: words(homeMain) - words(homeHero) },
    // The three-tab block that asked every parent to read the student and
    // teacher pitches on their way down the page.
    hasRoleTabs: !!home.querySelector('.lp-role-tab, .lp-role-panel, [data-panel]'),
    // The old dense three-column comparison, replaced by a table.
    hasCompareCards: !!home.querySelector('.lp-compare-card'),
    hasCompareTable: !!home.querySelector('.lp-compare-table'),
    compareRows: home.querySelectorAll('.lp-compare-table tbody tr').length,
    differentiatorCards: home.querySelectorAll('.lp-features-grid .lp-feature-card').length,
    faqItems: home.querySelectorAll('.lp-faq-item').length,
    links: linkTargets(home),
    copy: copyOf(home),
    firstHeading: (home.querySelector('main h1') || {}).textContent?.trim() || '',
  },
  teachers: {
    h1: Array.from(teachers.querySelectorAll('h1')).map((h) => h.textContent.trim()),
    copy: copyOf(teachers),
    links: linkTargets(teachers),
  },
  students: {
    h1: Array.from(students.querySelectorAll('h1')).map((h) => h.textContent.trim()),
    copy: copyOf(students),
    links: linkTargets(students),
  },
};

process.stdout.write(JSON.stringify(result));

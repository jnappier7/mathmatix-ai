/**
 * Parses every page in public/ and reports two structural accessibility facts:
 * nested interactive controls, and interactive controls with no accessible
 * name. Not a test — a probe the test asserts against.
 *
 * Spawned as its own Node process for the same reason as i18nRenderProbe.js:
 * jsdom@27 pulls in an ESM-only transitive dependency that Jest's CommonJS
 * transform cannot parse, so `require('jsdom')` throws inside a Jest worker.
 *
 * Usage: node interactiveControlsProbe.js [page.html ...]  → JSON on stdout
 *        (no arguments = every top-level page in public/)
 */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const PUB = path.join(__dirname, '../../public');

const INTERACTIVE = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"], [tabindex]:not([tabindex="-1"])';

function pages(argv) {
  if (argv.length) return argv;
  return fs.readdirSync(PUB).filter((f) => f.endsWith('.html')).sort();
}

/**
 * The accessible name, near enough for this purpose: aria-label, the text of an
 * aria-labelledby target, visible text, or a nested image's alt. `title` is
 * deliberately NOT counted — several screen readers skip it, and it never
 * surfaces on touch, which is exactly the gap this probe exists to find.
 */
function accessibleName(el, doc) {
  const aria = (el.getAttribute('aria-label') || '').trim();
  if (aria) return aria;

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const target = doc.getElementById(labelledBy.split(/\s+/)[0]);
    if (target && target.textContent.trim()) return target.textContent.trim();
  }

  // Text the element owns, minus anything explicitly hidden from AT.
  const clone = el.cloneNode(true);
  clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  const text = clone.textContent.replace(/\s+/g, ' ').trim();
  if (text) return text;

  const img = el.querySelector('img[alt]');
  if (img && img.getAttribute('alt').trim()) return img.getAttribute('alt').trim();

  if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
    const id = el.getAttribute('id');
    // Matching label[for] by hand rather than by selector: ids in this codebase
    // are not all CSS-identifier-safe and jsdom exposes no CSS.escape.
    if (id) {
      const labels = Array.from(doc.querySelectorAll('label[for]'));
      if (labels.some((l) => l.getAttribute('for') === id)) return '(label)';
    }
    if (el.closest('label')) return '(wrapping label)';
    const ph = (el.getAttribute('placeholder') || '').trim();
    if (ph) return ph;
  }
  return '';
}

function describe(el) {
  const id = el.getAttribute('id');
  const cls = (el.getAttribute('class') || '').split(/\s+/)[0];
  return el.tagName.toLowerCase() + (id ? `#${id}` : '') + (cls ? `.${cls}` : '');
}

const report = {};

for (const file of pages(process.argv.slice(2))) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => {});

  const dom = new JSDOM(fs.readFileSync(path.join(PUB, file), 'utf8'), { virtualConsole });
  const doc = dom.window.document;

  const nested = [];
  const unnamed = [];

  doc.querySelectorAll(INTERACTIVE).forEach((el) => {
    const parent = el.parentElement && el.parentElement.closest(INTERACTIVE);
    if (parent) nested.push({ inner: describe(el), outer: describe(parent) });

    // Hidden inputs and disabled decorative controls carry no name requirement.
    if (el.tagName === 'INPUT' && ['hidden', 'submit', 'reset'].includes(el.type)) return;
    if (!accessibleName(el, doc)) unnamed.push(describe(el));
  });

  report[file] = { nested, unnamed };
}

process.stdout.write(JSON.stringify(report, null, 2));

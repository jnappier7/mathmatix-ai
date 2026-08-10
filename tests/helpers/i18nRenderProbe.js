/**
 * Renders parent-dashboard.html through the real i18n engine and reports what
 * the DOM looks like in each requested language. Not a test — a probe the test
 * asserts against.
 *
 * This runs as its own Node process on purpose. jsdom@27 pulls in an ESM-only
 * transitive dependency that Jest's CommonJS transform cannot parse, so
 * `require('jsdom')` throws inside a Jest worker but is fine under plain Node.
 * Spawning keeps jest.config.js untouched (no transformIgnorePatterns carve-out
 * for a dependency chain we don't control) while still exercising a real DOM.
 *
 * Usage: node i18nRenderProbe.js Spanish French ...   → JSON on stdout
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '../../public');

const html = fs.readFileSync(path.join(PUB, 'parent-dashboard.html'), 'utf8');
const translationsSrc = fs.readFileSync(path.join(PUB, 'js/i18n-translations.js'), 'utf8');
const engineSrc = fs.readFileSync(path.join(PUB, 'js/i18n.js'), 'utf8');

// outside-only gives us window.eval without running the page's own inline
// scripts, which expect bundles and a live server that aren't here.
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://www.mathmatix.ai/parent-dashboard.html' });
const win = dom.window;

// init() fetches /user for the authoritative language; no server here, and the
// engine already swallows the rejection.
win.fetch = () => Promise.reject(new Error('offline'));

win.eval(translationsSrc);
win.eval(engineSrc);

const $ = (sel) => win.document.querySelector(sel);

function probe() {
  const saveBtn = $('[data-i18n="parent.saveSettings"]');
  const indicator = win.document.getElementById('parent-thinking-indicator');
  const copyBtn = win.document.getElementById('mobile-copy-code-btn');
  const navChildren = $('[data-i18n="parent.navChildren"]');

  return {
    heading: $('[data-i18n="parent.linkedChildren"]').textContent.trim(),
    saveBtnText: saveBtn.textContent.trim(),
    saveBtnKeepsIcon: !!saveBtn.querySelector('i.fa-save'),
    dotCount: indicator.querySelectorAll('span.dot').length,
    indicatorText: indicator.textContent.trim(),
    copyBtnText: copyBtn.textContent.trim(),
    copyBtnTitle: copyBtn.getAttribute('title'),
    navChildrenText: navChildren.querySelector('span').textContent.trim(),
    navChildrenKeepsIcon: !!navChildren.querySelector('i.fa-child'),
    chatPlaceholder: win.document.getElementById('parent-user-input').getAttribute('placeholder'),
    linkCodePlaceholder: win.document.getElementById('studentLinkCode').getAttribute('placeholder'),
    weeklyOption: $('#reportFrequency option[value="weekly"]').textContent.trim(),
    somaliOption: $('#parentLanguage option[value="Somali"]').textContent.trim(),
    teachMeTitle: $('[data-i18n="parent.qTeachMe"]').getAttribute('title'),
    selectChildAria: win.document.getElementById('childSelector').getAttribute('aria-label'),
    htmlLang: win.document.documentElement.getAttribute('lang'),
    htmlDir: win.document.documentElement.getAttribute('dir')
  };
}

const out = {};
for (const lang of process.argv.slice(2)) {
  win.MathmatixI18n.setLanguage(lang);
  out[lang] = probe();
}

process.stdout.write(JSON.stringify(out));

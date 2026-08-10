/**
 * Coverage + behaviour guard for the client-side i18n engine.
 *
 * Both ways this system breaks are SILENT — the page renders, nothing throws,
 * and the parent just sees English:
 *
 *   1. A `data-i18n` key that doesn't exist in the table. `t()` returns null and
 *      `apply()` skips the element.
 *   2. A key that exists but is missing a language. `t()` falls back to English.
 *
 * The parent dashboard shipped with a language <select> that saved correctly, an
 * i18n engine bundled onto the page, and ZERO tagged elements — so the setting
 * did nothing at all and no test noticed. The tag-count assertion below is what
 * makes that state fail rather than ship.
 *
 * The render tests cover the other trap: `apply()` rewrites text in place, so an
 * element whose label sits beside an icon can lose the icon, and an icon-ONLY
 * button can gain text that was never meant to be there. Those run through a
 * real DOM in a spawned process — see tests/helpers/i18nRenderProbe.js for why.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '../..');
const PUB = path.join(ROOT, 'public');
const PROBE = path.join(ROOT, 'tests/helpers/i18nRenderProbe.js');

const LANGS = [
  'English', 'Spanish', 'Russian', 'Chinese',
  'Vietnamese', 'Arabic', 'Somali', 'French', 'German'
];

const translationsSrc = fs.readFileSync(path.join(PUB, 'js/i18n-translations.js'), 'utf8');

const TRANSLATIONS = (() => {
  const w = {};
  new Function('window', translationsSrc)(w);
  return w.I18N_TRANSLATIONS;
})();

const KEY_ATTR_RE = /data-i18n(?:-placeholder|-title|-aria)?="([^"]+)"/g;

function keysUsedIn(page) {
  const html = fs.readFileSync(path.join(PUB, page), 'utf8');
  return [...html.matchAll(KEY_ATTR_RE)].map((m) => m[1]);
}

const htmlPages = fs
  .readdirSync(PUB)
  .filter((f) => f.endsWith('.html'))
  .filter((f) => keysUsedIn(f).length > 0);

describe('i18n translation table', () => {
  test('every key defines every supported language', () => {
    const gaps = [];
    for (const [key, entry] of Object.entries(TRANSLATIONS)) {
      for (const lang of LANGS) {
        if (!entry[lang] || !String(entry[lang]).trim()) gaps.push(`${key} → ${lang}`);
      }
    }
    expect(gaps).toEqual([]);
  });

  test('defines no language outside the User model enum', () => {
    const stray = new Set();
    for (const entry of Object.values(TRANSLATIONS)) {
      Object.keys(entry).filter((l) => !LANGS.includes(l)).forEach((l) => stray.add(l));
    }
    expect([...stray]).toEqual([]);
  });
});

describe('data-i18n keys used in markup', () => {
  test('finds tagged pages (sanity: the attribute scan still matches)', () => {
    expect(htmlPages.length).toBeGreaterThan(0);
  });

  test.each(htmlPages)('%s references only keys that exist', (page) => {
    const missing = [...new Set(keysUsedIn(page))].filter((k) => !TRANSLATIONS[k]);
    expect(missing).toEqual([]);
  });

  // Regression: the language setting was wired end-to-end — select, save,
  // sync, bundled engine — but the page had nothing tagged, so choosing
  // Spanish changed exactly nothing on screen.
  test('parent-dashboard.html is actually tagged', () => {
    const keys = keysUsedIn('parent-dashboard.html');
    expect(keys.length).toBeGreaterThan(50);
    expect(keys.some((k) => k.startsWith('parent.'))).toBe(true);
  });
});

describe('rendering the parent dashboard in each language', () => {
  let rendered;

  beforeAll(() => {
    rendered = JSON.parse(
      execFileSync('node', [PROBE, ...LANGS], { encoding: 'utf8', timeout: 60000 })
    );
  });

  test.each(LANGS)('%s: translates headings, options and placeholders', (lang) => {
    const r = rendered[lang];
    expect(r.heading).toBe(TRANSLATIONS['parent.linkedChildren'][lang]);
    expect(r.weeklyOption).toBe(TRANSLATIONS['parent.weekly'][lang]);
    expect(r.chatPlaceholder).toBe(TRANSLATIONS['parent.chatPlaceholder'][lang]);
    expect(r.linkCodePlaceholder).toBe(TRANSLATIONS['parent.linkCodePlaceholder'][lang]);
  });

  test.each(LANGS)('%s: translates title and aria attributes', (lang) => {
    const r = rendered[lang];
    expect(r.teachMeTitle).toBe(TRANSLATIONS['parent.qTeachMeTitle'][lang]);
    expect(r.selectChildAria).toBe(TRANSLATIONS['parent.selectChildAria'][lang]);
  });

  test.each(LANGS)('%s: rewrites labels without dropping their icons', (lang) => {
    const r = rendered[lang];
    expect(r.saveBtnKeepsIcon).toBe(true);
    expect(r.saveBtnText).toBe(TRANSLATIONS['parent.saveSettings'][lang]);
    expect(r.navChildrenKeepsIcon).toBe(true);
    expect(r.navChildrenText).toBe(TRANSLATIONS['parent.navChildren'][lang]);
  });

  test.each(LANGS)('%s: leaves the thinking indicator dots alone', (lang) => {
    const r = rendered[lang];
    expect(r.dotCount).toBe(3);
    expect(r.indicatorText).toContain(TRANSLATIONS['parent.tutorThinking'][lang]);
  });

  test.each(LANGS)('%s: adds no text to an icon-only button', (lang) => {
    const r = rendered[lang];
    expect(r.copyBtnText).toBe('');
    expect(r.copyBtnTitle).toBe(TRANSLATIONS['parent.copy'][lang]);
  });

  test.each(LANGS)('%s: keeps the language picker in its own script', (lang) => {
    // Endonyms on purpose: a parent must be able to find their language even
    // when the UI is currently set to one they cannot read.
    expect(rendered[lang].somaliOption).toBe('Somali (Soomaali)');
  });

  test('sets html lang per language, and dir only for RTL', () => {
    expect(rendered.English.htmlLang).toBe('en');
    expect(rendered.Spanish.htmlLang).toBe('es');
    expect(rendered.Chinese.htmlLang).toBe('zh');
    expect(rendered.Arabic.htmlLang).toBe('ar');

    expect(rendered.Arabic.htmlDir).toBe('rtl');
    for (const lang of LANGS.filter((l) => l !== 'Arabic')) {
      expect(rendered[lang].htmlDir).toBeNull();
    }
  });
});

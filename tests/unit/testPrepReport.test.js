/**
 * public/js/test-prep-report.js — the flag wording, per-area bars, attempt
 * history and printable report shared by the teacher's Test Prep tab and the
 * parent dashboard's Test Prep card. Pure string builders, so they run here
 * without a DOM.
 */
const fs = require('fs');
const path = require('path');
const TPR = require('../../public/js/test-prep-report');

const ROOT = path.join(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const LANGS = ['English', 'Spanish', 'Russian', 'Chinese', 'Vietnamese', 'Arabic', 'Somali', 'French', 'German'];
const TRANSLATIONS = (() => { const w = {}; new Function('window', read('public/js/i18n-translations.js'))(w); return w.I18N_TRANSLATIONS; })();

const attempt = (o = {}) => ({
  completedAt: '2026-10-03T15:00:00Z', scaledScore: 24, range: { low: 22, high: 26 }, rawScore: 30, totalItems: 45,
  durationMinutes: 45, timeLimitMinutes: 50, skippedCount: 0, moduleRoute: null, flags: [], countsTowardAverage: true,
  byCategory: { alg: { correct: 9, total: 10, label: 'Algebra' }, geo: { correct: 2, total: 8, label: '<b>Geometry</b>' }, unknown: { correct: 1, total: 1 } },
  ...o,
});

describe('categoryRows', () => {
  test('weakest first, percentages rounded, "unknown" dropped', () => {
    expect(TPR.categoryRows(attempt())).toEqual([
      { key: 'geo', label: '<b>Geometry</b>', correct: 2, total: 8, pct: 25 },
      { key: 'alg', label: 'Algebra', correct: 9, total: 10, pct: 90 },
    ]);
    expect(TPR.categoryRows({})).toEqual([]);
  });
});

describe('English renderer (the teacher page)', () => {
  const R = TPR.create();
  test('flag labels and help match the server flag ids', () => {
    expect(R.flagText('rushed')).toBe('Rushed');
    expect(R.flagText('unfinished')).toBe('Unfinished');
    expect(R.flagText('easier-route')).toBe('Easier route');
    expect(R.flagHelp('rushed')).toMatch(/quarter of the time limit/);
  });
  test('bars carry a text alternative with the numbers, and labels are escaped', () => {
    const html = R.barsList(attempt());
    expect(html).toContain('role="img" aria-label="Algebra: 9 of 10 correct (90%)"');
    expect(html).toContain('&lt;b&gt;Geometry&lt;/b&gt;');
    expect(html).not.toContain('<b>Geometry');
  });
  test('attempt block shows range, flags with their explanation, and facts', () => {
    const html = R.attemptBlock(attempt({ flags: ['rushed'], moduleRoute: 'easier' }));
    expect(html).toContain('likely 22–26');
    expect(html).toContain('tp-flag-rushed');
    expect(html).toContain('30 of 45');
    expect(html).toContain('45 min');
    expect(html).toContain('Easier');
  });
  test('printable report escapes the student name and includes history only with 2+ attempts', () => {
    const one = { latest: attempt(), attempts: [attempt()], change: null };
    const html = R.reportHtml('<script>x</script>', 'ACT', one);
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).not.toContain('Every attempt');
    const two = { latest: attempt({ scaledScore: 26 }), attempts: [attempt({ scaledScore: 20 }), attempt({ scaledScore: 26 })], change: 6 };
    const h2 = R.reportHtml('Ada', 'ACT', two);
    expect(h2).toContain('Every attempt');
    expect(h2).toContain('Change since the first fair attempt: +6');
    expect(h2).toContain('aria-label="Scores over time: 20, 26"');
  });
});

describe('translated renderer (the parent page)', () => {
  const R = TPR.create({ t: (key) => (TRANSLATIONS['parent.testPrep.' + key] || {}).Spanish || null, locale: 'es', dir: 'ltr' });
  test('strings come through the lookup with placeholders filled', () => {
    expect(R.flagText('rushed')).toBe('Apresurado');
    expect(R.barsList(attempt())).toContain('aria-label="Algebra: 9 de 10 correctas (90 %)"');
    expect(R.attemptBlock(attempt())).toContain('probable 22–26');
  });
  test('a missing translation falls back to English, never blank', () => {
    const R2 = TPR.create({ t: () => null });
    expect(R2.flagText('unfinished')).toBe('Unfinished');
  });
  test('an Arabic report is marked right-to-left', () => {
    const R3 = TPR.create({ dir: 'rtl' });
    expect(R3.reportHtml('A', 'SAT', { latest: attempt(), attempts: [attempt()] })).toMatch(/<html dir="rtl">/);
  });
});

describe('every parent.testPrep string is translated into all nine languages', () => {
  const parentSrc = read('public/js/parent-dashboard.js');
  const used = new Set([
    ...Object.keys(TPR.STRINGS).map(k => 'parent.testPrep.' + k),
    ...[...parentSrc.matchAll(/'(parent\.testPrep\.[A-Za-z0-9_]+)'/g)].map(m => m[1]),
  ]);
  test('keys are found', () => { expect(used.size).toBeGreaterThan(20); });
  test.each([...used])('%s', (key) => {
    const row = TRANSLATIONS[key];
    expect(row).toBeDefined();
    for (const lang of LANGS) {
      expect(typeof row[lang]).toBe('string');
      expect(row[lang].length).toBeGreaterThan(0);
      // Placeholders must survive translation.
      const ph = (s) => (s.match(/\{\w+\}/g) || []).sort();
      expect(ph(row[lang])).toEqual(ph(row.English));
    }
    // The English row matches the shared module's default, so both pages read the same.
    const short = key.replace('parent.testPrep.', '');
    if (TPR.STRINGS[short]) expect(row.English).toBe(TPR.STRINGS[short]);
  });
});

describe('wiring', () => {
  test('both dashboards bundle the shared module before the page script that uses it', () => {
    const m = JSON.parse(read('public/dist/page-bundles.manifest.json'));
    for (const [page, user] of [['parent-dashboard.html', '/js/parent-dashboard.js'], ['teacher-dashboard.html', '/js/teacher-testprep.js']]) {
      const files = m[page].js.flatMap(b => b.files);
      expect(files.indexOf('/js/test-prep-report.js')).toBeGreaterThan(-1);
      expect(files.indexOf('/js/test-prep-report.js')).toBeLessThan(files.indexOf(user));
    }
  });
  test('neither page keeps its own copy of the flag wording', () => {
    expect(read('public/js/teacher-testprep.js')).not.toMatch(/quarter of the time limit/);
    expect(read('public/js/parent-dashboard.js')).not.toMatch(/quarter of the time limit/);
  });
  test('the parent card reads the parent endpoint and escapes what it renders', () => {
    const src = read('public/js/parent-dashboard.js');
    expect(src).toMatch(/\/api\/parent\/child\/\$\{encodeURIComponent\(childId\)\}\/test-prep/);
    expect(src).toMatch(/escText\(e\.label\)/);
  });
});

/**
 * The printable practice sheet (utils/practiceSheet.js).
 *
 * Owner's format, 2026-11-26: "2 columns with line. 2 pages tops", modelled
 * on the Paper Practice sheets in public/courses/<course>/pdfs.
 *
 * jsdom has no layout engine, so what is pinned here is the page the browser
 * is handed and the rules its layout script runs by; the printed result is
 * checked by eye in headless Chromium, like the other drawn surfaces.
 */

const fs = require('fs');
const { buildSheetHTML, WORK, MAX_PAGES } = require('../../utils/practiceSheet');

const problem = (i, extra = {}) => ({ prompt: `Solve $${i}x = ${i * 2}$`, answer: `ANSWER-${i}`, ...extra });
const sheet = (over = {}) => buildSheetHTML({
  title: 'Practice Pack',
  studentName: 'Ava Johnson',
  date: 'November 26, 2026',
  groups: [{ label: 'Two-Step Equations', problems: [1, 2, 3, 4].map(i => problem(i)) }],
  ...over,
});
// The rows as the server writes them, before the page moves them into sheets.
const pool = html => {
  const end = html.indexOf('<div class="key-page">');
  return html.slice(html.indexOf('<div id="pool">'), end > 0 ? end : html.indexOf('<script>\n  ('));
};

describe('practice sheet — the owner\'s format', () => {
  test('two pages tops is the rule the layout runs by', () => {
    expect(MAX_PAGES).toBe(2);
    expect(sheet()).toContain(`"MAX_PAGES":${MAX_PAGES}`);
    // Work space is given up before a problem is: the floor is below the comfortable room.
    expect(WORK.floor).toBeLessThan(WORK.comfy);
    expect(WORK.comfy).toBeLessThan(WORK.max);
  });

  test('a printed page is one fixed letter sheet, so nothing can spill onto a third', () => {
    const html = sheet();
    expect(html).toMatch(/@page\s*\{\s*size:\s*letter;\s*margin:\s*0;?\s*\}/);
    expect(html).toMatch(/\.sheet\s*\{[^}]*height:\s*11in[^}]*overflow:\s*hidden/);
  });

  test('two columns with a line down the middle', () => {
    const html = sheet();
    expect(html).toMatch(/\.cols::before\s*\{[^}]*left:\s*50%[^}]*border-left:\s*1px solid #000/);
    expect(html).toMatch(/\.row\s*\{[^}]*grid-template-columns:\s*1fr 1fr/);
  });

  test('problems read across: 1 left, 2 right, then 3 and 4', () => {
    const rows = pool(sheet()).match(/data-nums="[^"]*"/g);
    expect(rows).toEqual(['data-nums="1,2"', 'data-nums="3,4"']);
  });

  test('NAME / DATE / PERIOD line, and none of the old furniture', () => {
    const html = sheet();
    expect(html).toMatch(/NAME <i>Ava Johnson<\/i>/);
    expect(html).toMatch(/DATE <i>November 26, 2026<\/i>/);
    expect(html).toMatch(/PERIOD <i><\/i>/);
    for (const gone of ['grid-paper', 'difficulty-dots', 'answer-blank', 'Answer:']) {
      expect(html).not.toContain(gone);
    }
  });

  test('a class sheet leaves the name and date to write on', () => {
    const html = sheet({ studentName: '', date: '' });
    expect(html).toMatch(/NAME <i><\/i>/);
    expect(html).toMatch(/DATE <i><\/i>/);
  });

  test('numbering runs through every section; a lone section prints no heading of its own', () => {
    const two = sheet({ groups: [
      { label: 'Slope', problems: [1, 2, 3].map(i => problem(i)) },
      { label: 'Intercepts', problems: [4, 5].map(i => problem(i)) },
    ] });
    expect(pool(two).match(/class="item sec"/g)).toHaveLength(2);
    // A section starts on a new row, so an odd one leaves its last cell empty.
    expect(pool(two).match(/data-nums="[^"]*"/g)).toEqual(['data-nums="1,2"', 'data-nums="3"', 'data-nums="4,5"']);
    expect(pool(sheet())).not.toContain('class="item sec"');
  });

  test('the answers are never on the student\'s pages, and the key is only printed when asked for', () => {
    const without = sheet();
    expect(without).not.toContain('ANSWER-1');
    const withKey = sheet({ showAnswerKey: true });
    expect(pool(withKey)).not.toContain('ANSWER-');
    expect(withKey.match(/class="ak-item" data-num="\d+"/g)).toHaveLength(4);
    expect(withKey).toContain('ANSWER-4');
  });

  test('multiple-choice options print with their letters', () => {
    const html = sheet({ groups: [{ label: '', problems: [problem(1, { options: [{ label: 'A', text: '2' }, { label: 'B', text: '3' }] })] }] });
    expect(pool(html)).toContain('<span class="p-letter">A.</span><span>2</span>');
    expect(pool(html)).toContain('<span class="p-letter">B.</span><span>3</span>');
  });

  test('a title from the query string cannot write markup into the page', () => {
    const html = sheet({ title: '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  test('a problem dropped to fit is dropped from the key too, and both are renumbered', () => {
    const html = sheet({ showAnswerKey: true });
    expect(html).toContain(".ak-item[data-num=\"' + num + '\"]");
    expect(html).toContain("querySelectorAll('.sheet .p-num')");
    expect(html).toContain("querySelectorAll('.ak-item .ak-num')");
  });
});

describe('practice pack routes print through the one sheet', () => {
  const src = fs.readFileSync(require.resolve('../../routes/practicePack.js'), 'utf8');

  test('every PDF route waits for the sheet to lay itself out', () => {
    expect(src.match(/await renderWorksheetPdf\(html\)/g)).toHaveLength(3);
    expect(src).toContain("page.waitForFunction('window.__sheet'");
    // The page owns its size and margins; a printer margin would shrink the two pages into three.
    expect(src).toContain('preferCSSPageSize: true');
    expect(src).not.toMatch(/margin:\s*\{\s*top:/);
  });

  test('the class pack does not print one student\'s name on everyone\'s sheet', () => {
    expect(src).toMatch(/generateWorksheetHTML\(representative, problems, \{[^}]*blankName: true/);
  });
});

/**
 * The Parent Learning Center orders guides by the parent's children and
 * badges the one that fits ("For Jason (grade 9)"). The logic lives in
 * public/js/parentGuideBands.js — pure, loaded on the page through the
 * parent-js1 bundle and required here directly.
 */

const fs = require('fs');
const path = require('path');
const B = require('../../public/js/parentGuideBands');

const ROOT = path.join(__dirname, '..', '..');

// The live parent catalog, in its CATALOG_META sortOrder.
const CATALOG = [
  { courseId: 'parent-math-k2', sortOrder: 0 },
  { courseId: 'parent-math-35', sortOrder: 1 },
  { courseId: 'parent-math-68', sortOrder: 2 },
  { courseId: 'parent-math-910', sortOrder: 3 },
  { courseId: 'parent-test-prep', sortOrder: 4 },
];
const ids = (r) => r.courses.map((c) => c.courseId);
const kid = (firstName, gradeLevel) => ({ firstName, gradeLevel });

describe('gradeNumber', () => {
  test.each([
    ['K', 0], ['Kindergarten', 0], ['pre-k', 0], ['1', 1], ['4', 4], ['4th Grade', 4],
    ['Grade 7', 7], ['9th', 9], ['12', 12], [10, 10], ['Algebra 1', 9], ['Geometry', 10],
  ])('%p → %p', (input, expected) => {
    expect(B.gradeNumber(input)).toBe(expected);
  });

  test.each([undefined, null, '', 'College', 'Theta: -0.3', '13', 14, 'banana'])(
    'unreadable %p → null', (input) => {
      expect(B.gradeNumber(input)).toBeNull();
    });
});

describe('rankGuides — one child', () => {
  test.each([
    ['K', 'parent-math-k2', ['parent-math-k2']],
    ['4', 'parent-math-35', ['parent-math-35']],
    ['7', 'parent-math-68', ['parent-math-68']],
    ['9', 'parent-math-910', ['parent-math-910', 'parent-test-prep']],
    ['10', 'parent-math-910', ['parent-math-910', 'parent-test-prep']],
    ['11', 'parent-test-prep', ['parent-test-prep']],
    ['12', 'parent-test-prep', ['parent-test-prep']],
  ])('grade %s puts %s first and badges %p', (grade, first, badged) => {
    const r = B.rankGuides(CATALOG, [kid('Jason', grade)]);
    expect(ids(r)[0]).toBe(first);
    expect(Object.keys(r.badges).sort()).toEqual(badged.slice().sort());
    for (const id of badged) expect(r.badges[id]).toEqual([{ name: 'Jason', grade: grade === 'K' ? 'K' : grade }]);
    // Every guide is still listed — ordering never hides one.
    expect(ids(r).sort()).toEqual(CATALOG.map((c) => c.courseId).sort());
  });

  test('9–10: Algebra 1 & Geometry first, test prep second, the rest in catalog order', () => {
    expect(ids(B.rankGuides(CATALOG, [kid('Jason', '9')]))).toEqual([
      'parent-math-910', 'parent-test-prep', 'parent-math-k2', 'parent-math-35', 'parent-math-68',
    ]);
  });

  test('11–12: test prep first, then 9–10 (listed, not badged)', () => {
    const r = B.rankGuides(CATALOG, [kid('Mia', '11th Grade')]);
    expect(ids(r).slice(0, 2)).toEqual(['parent-test-prep', 'parent-math-910']);
    expect(r.badges['parent-math-910']).toBeUndefined();
  });

  test('unknown grade: catalog order, no badges', () => {
    for (const g of [undefined, '', 'College', 'not a grade']) {
      const r = B.rankGuides(CATALOG, [kid('Sam', g)]);
      expect(ids(r)).toEqual(CATALOG.map((c) => c.courseId));
      expect(r.badges).toEqual({});
    }
  });

  test('no children: catalog order, no badges', () => {
    expect(ids(B.rankGuides(CATALOG, []))).toEqual(CATALOG.map((c) => c.courseId));
    expect(ids(B.rankGuides(CATALOG, undefined))).toEqual(CATALOG.map((c) => c.courseId));
  });

  test('sorts by sortOrder even when the catalog arrives unsorted', () => {
    const shuffled = [CATALOG[4], CATALOG[0], CATALOG[3], CATALOG[2], CATALOG[1]];
    expect(ids(B.rankGuides(shuffled, []))).toEqual(CATALOG.map((c) => c.courseId));
  });
});

describe('rankGuides — several children', () => {
  test('a 4th grader and an 11th grader: both primary guides lead, 9–10 next', () => {
    const r = B.rankGuides(CATALOG, [kid('Ava', '4'), kid('Leo', '11')]);
    expect(ids(r)).toEqual([
      'parent-math-35', 'parent-test-prep', 'parent-math-910', 'parent-math-k2', 'parent-math-68',
    ]);
    expect(r.badges['parent-math-35']).toEqual([{ name: 'Ava', grade: '4' }]);
    expect(r.badges['parent-test-prep']).toEqual([{ name: 'Leo', grade: '11' }]);
  });

  test('siblings in 9th and 12th share the test-prep badge, in child order', () => {
    const r = B.rankGuides(CATALOG, [kid('Jason', '9'), kid('Mia', '12')]);
    expect(ids(r).slice(0, 2).sort()).toEqual(['parent-math-910', 'parent-test-prep']);
    expect(r.badges['parent-test-prep']).toEqual([
      { name: 'Jason', grade: '9' }, { name: 'Mia', grade: '12' },
    ]);
    // Mia's (unbadged) 9–10 entry doesn't add a badge; Jason's does.
    expect(r.badges['parent-math-910']).toEqual([{ name: 'Jason', grade: '9' }]);
  });

  test('a child with no grade does not disturb a sibling with one', () => {
    const r = B.rankGuides(CATALOG, [kid('Sam', ''), kid('Ava', 'K')]);
    expect(ids(r)[0]).toBe('parent-math-k2');
    expect(r.badges).toEqual({ 'parent-math-k2': [{ name: 'Ava', grade: 'K' }] });
  });

  test('falls back to username when there is no first name', () => {
    const r = B.rankGuides(CATALOG, [{ username: 'jj2011', gradeLevel: '7' }]);
    expect(r.badges['parent-math-68']).toEqual([{ name: 'jj2011', grade: '7' }]);
  });
});

describe('badge text', () => {
  test('fills the template', () => {
    expect(B.badgeText('For {name} (grade {grade})', { name: 'Jason', grade: '9' })).toBe('For Jason (grade 9)');
    expect(B.badgeText(null, { name: 'Ava', grade: 'K' })).toBe('For Ava (grade K)');
  });

  test('a child name is escaped before it reaches innerHTML', () => {
    const r = B.rankGuides(CATALOG, [kid('<img src=x onerror=alert(1)>', '9')]);
    const html = B.escapeHtml(B.badgeText('For {name} (grade {grade})', r.badges['parent-math-910'][0]));
    expect(html).not.toMatch(/<img/);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(B.escapeHtml(`"'&`)).toBe('&quot;&#39;&amp;');
  });

  test('the badge string exists in all nine languages, with both placeholders', () => {
    const w = {};
    new Function('window', fs.readFileSync(path.join(ROOT, 'public/js/i18n-translations.js'), 'utf8'))(w);
    const entry = w.I18N_TRANSLATIONS['parent.guides.forChild'];
    expect(entry).toBeDefined();
    const LANGS = ['English', 'Spanish', 'Russian', 'Chinese', 'Vietnamese', 'Arabic', 'Somali', 'French', 'German'];
    for (const lang of LANGS) {
      expect(typeof entry[lang]).toBe('string');
      expect(entry[lang]).toContain('{name}');
      expect(entry[lang]).toContain('{grade}');
    }
  });
});

describe('wiring', () => {
  test('the dashboard bundle loads the helper before parent-dashboard.js', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/dist/page-bundles.manifest.json'), 'utf8'));
    const files = manifest['parent-dashboard.html'].js.flatMap((b) => b.files);
    const helper = files.indexOf('/js/parentGuideBands.js');
    expect(helper).toBeGreaterThan(-1);
    expect(helper).toBeLessThan(files.indexOf('/js/parent-dashboard.js'));
  });

  test('every guide the helper can recommend is a real parent pathway', () => {
    const recommended = new Set();
    for (let g = 0; g <= 12; g++) B.guidesForGrade(g).forEach((x) => recommended.add(x.courseId));
    for (const id of recommended) {
      const file = path.join(ROOT, 'public/resources', `${id}-pathway.json`);
      expect(fs.existsSync(file)).toBe(true);
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).audience).toBe('parent');
    }
  });
});

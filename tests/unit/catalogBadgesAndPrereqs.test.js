// tests/unit/catalogBadgesAndPrereqs.test.js
//
// QA handoff 2026-10-14 §4, witnessed by running the real /catalog handler:
// ACT and SAT prep wore an "AP" badge (any examAlignment earned it), and
// prerequisites printed as raw pathway slugs ("grade-8", "algebra-1").

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';
const router = require('../../routes/courseSession');

function catalog() {
  const layer = router.stack.find((l) => l.route && l.route.path === '/catalog' && l.route.methods.get);
  const handle = layer.route.stack[layer.route.stack.length - 1].handle;
  return new Promise((resolve, reject) => handle(
    { query: {}, user: { _id: 'u', gradeLevel: '9' } },
    { json: (b) => resolve(b.catalog), status: () => ({ json: reject }) }
  ));
}

test('only an AP exam earns the AP badge', async () => {
  const byId = Object.fromEntries((await catalog()).map((c) => [c.courseId, c]));
  expect(byId['ap-calculus-ab'].apWeight).toBe('AP');
  expect(byId['act-prep'].apWeight).toBeNull();
  expect(byId['sat-prep'].apWeight).toBeNull();
});

test('prerequisites are named, never slugs', async () => {
  for (const c of await catalog()) {
    expect(c.prerequisiteNames).toHaveLength((c.prerequisites || []).length);
    for (const n of c.prerequisiteNames) expect(n).not.toMatch(/^[a-z0-9]+(-[a-z0-9]+)+$/);
  }
  const alg1 = (await catalog()).find((c) => c.courseId === 'algebra-1');
  expect(alg1.prerequisiteNames).toEqual(['8th Grade Mathematics']);
});

test('the catalog card renders the names', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../../public/js/courseCatalog.js'), 'utf8');
  expect(src).toMatch(/Prereq: \$\{\(course\.prerequisiteNames \|\| course\.prerequisites\)\.join\(', '\)\}/);
});

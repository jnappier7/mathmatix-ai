/**
 * The course bar in a bootcamp (ACT/SAT prep) shows REVIEW progress.
 *
 * Student audit, 2026-10-15: the review counter read 1/11 while the course bar
 * read 0%. The page-load header already showed bootcamp progress, but every
 * course-chat turn's passive sync then painted the module-based
 * overallProgress — 0 for the whole loop — over it. Witnessed and re-checked
 * in the browser harness against the real sat-prep session (no DOM in jest).
 */
const fs = require('fs');
const path = require('path');
const script = fs.readFileSync(path.join(__dirname, '../../public/js/script.js'), 'utf8');
const catalog = fs.readFileSync(path.join(__dirname, '../../public/js/courseCatalog.js'), 'utf8');

test('a bootcamp turn repaints the bar from data.actBootcamp', () => {
  expect(script).toMatch(/const bootcampTurn = !!\(data\.actBootcamp && data\.actBootcamp\.phase\)/);
  expect(script).toMatch(/active\.bootcamp = data\.actBootcamp;\s*cm\.updateProgressBar\(active\)/);
});

test('the module overallProgress sync never paints over a bootcamp', () => {
  expect(script).toMatch(/if \(!bootcampTurn && !data\.courseProgress && data\.courseContext/);
});

test('the bar says what it counts', () => {
  expect(catalog).toMatch(/Reviewed \$\{qDone\} of \$\{qTotal\} missed questions/);
});

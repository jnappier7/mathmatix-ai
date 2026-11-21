/**
 * Two client-side promises of the course enrollment flow (course QA, 2026-11-21).
 * Both were found by eye in a real browser; these pin the lines that fixed them.
 *
 * 1. The welcome card shown right after enrolling must not be squeezed by the
 *    flex chat column. It has overflow:hidden, so without flex-shrink:0 it was
 *    clipped to ~300px on a laptop and to its header on a phone — hiding the
 *    baseline button and "Skip for now" until a reload.
 * 2. Hitting the two-course limit says so in the catalog, names the courses
 *    holding the seats, and stays until dismissed. It used to be a 3-second
 *    toast under a catalog full of live Enroll buttons.
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../../public/js/courseCatalog.js'), 'utf8');

test('the welcome splash cannot be shrunk by the chat column', () => {
  const at = src.indexOf("splash.className = 'course-welcome-splash'");
  expect(at).toBeGreaterThan(-1);
  const css = src.slice(at, src.indexOf('`;', at));
  expect(css).toMatch(/overflow:\s*hidden/);
  expect(css).toMatch(/flex-shrink:\s*0/);
});

test('the course cap gets a persistent, announced notice that names the courses', () => {
  expect(src).toMatch(/data\.code === 'COURSE_CAP_REACHED'\)\s*\{\s*this\.showCapNotice\(data, courseId\)/);
  const at = src.indexOf('showCapNotice(data, courseId) {');
  const body = src.slice(at, src.indexOf('clearCapNotice() {', at));
  expect(body).toMatch(/setAttribute\('role', 'alert'\)/);
  expect(body).toMatch(/data\.activeCourses/);
  expect(body).not.toMatch(/setTimeout/);            // it does not time out
  expect(body).not.toMatch(/innerHTML/);             // course names go in as text
});

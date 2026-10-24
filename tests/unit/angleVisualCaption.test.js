/**
 * Course audit C08 (2026-10-23): the ANGLE visual captioned a 45° and a 120°
 * angle "angle > 180°", and titled them "Acute Angle Angle: 45°" before the
 * student was asked to classify. Root cause: the classification came from the
 * tutor's `type=` param verbatim ("Acute Angle" matched no caption branch and
 * fell through to the reflex caption).
 *
 * Source pins — this repo's jest can't run the DOM renderer; the behaviour was
 * verified in the browser with a throwaway harness.
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../../public/js/inlineChatVisuals.js'), 'utf8');
const fn = src.slice(src.indexOf('    createAngle(paramStr) {'), src.indexOf('    getAngleType(degrees) {'));

test('the classification is derived from the measure, never from params.type', () => {
  expect(fn).toMatch(/const type = this\.getAngleType\(degrees\);/);
  expect(fn).not.toMatch(/params\.type/);
});

test('every class has its own caption, and reflex is bounded', () => {
  for (const range of ['0° < angle < 90°', 'angle = 90°', '90° < angle < 180°', 'angle = 180°', '180° < angle < 360°']) {
    expect(src).toContain(range);
  }
  expect(src).not.toMatch(/'angle > 180°'/);
});

test('the classification stays hidden unless the tutor reveals it', () => {
  expect(fn).toMatch(/const reveal = params\.reveal === true/);
  expect(fn).toMatch(/<details class="icv-caption icv-angle-check">/);
  expect(fn).toMatch(/reveal \? `\$\{info\.name\} Angle: \$\{degrees\}°` : `Angle: \$\{degrees\}°`/);
});

test('"Angle Angle" collapses to one', () => {
  expect(fn).toMatch(/replace\(\/\\b\(angle\)\(\?:\\s\+angle\\b\)\+\/gi, '\$1'\)/);
});

test('getAngleType reads the measure numerically', () => {
  const body = src.slice(src.indexOf('    getAngleType(degrees) {'));
  expect(body).toMatch(/parseFloat\(degrees\)/);
});

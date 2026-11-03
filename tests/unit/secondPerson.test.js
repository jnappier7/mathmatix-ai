// Site review, 2026-11-03: the student's "Watch for This" notebook cards read
// "The student likely miscalculated…" — the misconception catalog's teacher
// voice, shown verbatim to the student it describes.
const { toSecondPerson } = require('../../utils/secondPerson');

test.each([
  ['Student performs operations in wrong sequence', 'You perform operations in wrong sequence'],
  ['Student makes mistake with positive/negative signs', 'You make mistake with positive/negative signs'],
  ['Student only applies operation to one side of equation', 'You only apply operation to one side of equation'],
  ['The student likely miscalculated the values involved', 'You likely miscalculated the values involved'],
  ['The student has confused area and perimeter', 'You have confused area and perimeter'],
  ["The student's sign was dropped.", 'Your sign was dropped.'],
])('%s', (input, out) => {
  expect(toSecondPerson(input)).toBe(out);
});

test('text that never mentions a student is untouched', () => {
  expect(toSecondPerson('Forgets to distribute negative sign')).toBe('Forgets to distribute negative sign');
  expect(toSecondPerson('')).toBe('');
  expect(toSecondPerson(null)).toBe(null);
});

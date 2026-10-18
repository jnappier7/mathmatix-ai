// The catalog recommends the course for the grade the student is IN.
//
// Student audit 2026-10-15: a 9th grader doing SAT prep was recommended
// "Early Math Foundations (Grades 3–5)" because the Starting Point placed them
// at 5th grade — and 13 of 17 assessed students in prod sit 3+ grades below
// their stated grade. Owner decision 2026-10-17: stated grade + a note.

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';
const router = require('../../routes/courseSession');

function call(user) {
  const layer = router.stack.find((l) => l.route && l.route.path === '/catalog' && l.route.methods.get);
  const handle = layer.route.stack[layer.route.stack.length - 1].handle;
  return new Promise((resolve, reject) => handle(
    { query: {}, user: { _id: 'u', ...user } },
    { json: resolve, status: () => ({ json: reject }) }
  ));
}

test('a 9th grader placed at 5th grade is recommended Algebra 1, with a note', async () => {
  const r = await call({ gradeLevel: '9', initialPlacement: '5th Grade', learningProfile: { initialPlacement: '5th Grade' } });
  expect(r.recommended).toBe('algebra-1');
  expect(r.recommendedNote).toMatch(/fill those gaps inside the course/);
});

test('placement at or near the grade: same course, no note', async () => {
  const r = await call({ gradeLevel: '9', learningProfile: { initialPlacement: '8th Grade' } });
  expect(r.recommended).toBe('algebra-1');
  expect(r.recommendedNote).toBeNull();
});

test('no stated grade: the assessed level still decides', async () => {
  const r = await call({ learningProfile: { initialPlacement: '7th Grade' } });
  expect(r.recommended).toBe('7th-grade-math');
  expect(r.recommendedNote).toBeNull();
});

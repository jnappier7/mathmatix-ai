const m = require(process.argv[2]);
const REQUIRED = ['explanation', 'model', 'guided_practice', 'independent_practice'];

// Group steps by lesson
const lessons = {};
for (const s of m.scaffold) {
  const lid = s.lessonId;
  if (!lessons[lid]) lessons[lid] = new Set();
  lessons[lid].add(s.type);
}

console.log('Lessons and their phases:');
let allComplete = true;
for (const [lid, types] of Object.entries(lessons)) {
  const has = [...types];
  const missing = REQUIRED.filter(t => !types.has(t));
  const status = missing.length ? ' MISSING: ' + missing.join(', ') : ' COMPLETE';
  if (missing.length) allComplete = false;
  console.log('  ' + lid + ': [' + has.join(', ') + ']' + status);
}

console.log('\nTotal scaffold steps:', m.scaffold.length);
console.log('Total answer keys:', Object.keys(m.answerKeys).length);

// Verify all problem IDs have answer keys
const ids = [];
for (const s of m.scaffold) {
  for (const p of (s.problems || [])) {
    if (p.id) ids.push(p.id);
  }
}
const missingKeys = ids.filter(id => !m.answerKeys[id]);
console.log('Problem IDs:', ids.length);
console.log('Missing answer keys:', missingKeys.length > 0 ? missingKeys.join(', ') : 'NONE');
console.log('\n' + (allComplete && missingKeys.length === 0 ? 'PASS' : 'FAIL'));

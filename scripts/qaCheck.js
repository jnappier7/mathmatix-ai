#!/usr/bin/env node
// QA Check Script - Verify math problem accuracy

const fs = require('fs');

const problems = JSON.parse(fs.readFileSync('docs/generated-problems.json', 'utf8'));

console.log('=== PROBLEM QUALITY AUDIT ===');
console.log('Total problems:', problems.length);

let issues = [];

for (const p of problems) {
  const opts = p.options || [];
  const correctOpt = opts.find(o => o.isCorrect);
  const wrongOpts = opts.filter(o => !o.isCorrect);

  if (!correctOpt) {
    issues.push({ skill: p.skillId, q: p.prompt, issue: 'NO CORRECT ANSWER' });
    continue;
  }

  // Check for duplicate options
  const optTexts = opts.map(o => o.text.toLowerCase().trim());
  const uniqueOpts = new Set(optTexts);
  if (uniqueOpts.size !== optTexts.length) {
    issues.push({ skill: p.skillId, q: p.prompt, issue: 'DUPLICATE OPTIONS' });
  }
}

console.log('Automated issues found:', issues.length);
if (issues.length > 0) {
  console.log('\nIssues:');
  issues.slice(0, 15).forEach(i => {
    console.log(`  [${i.skill}] ${i.issue}`);
    console.log(`    Q: ${i.q.substring(0, 60)}...`);
  });
}

// Sample problems for manual review
console.log('\n=== SAMPLE PROBLEMS FOR MANUAL REVIEW ===\n');

const bySkill = {};
for (const p of problems) {
  if (!bySkill[p.skillId]) bySkill[p.skillId] = [];
  bySkill[p.skillId].push(p);
}

// Check a variety of skills
const sampleSkills = [
  'measures-of-center',
  'pythagorean-theorem',
  'fractions-basics',
  'quadratic-equations',
  'compound-probability',
  'geometric-series',
  'trig-law-of-sines',
  'permutations'
];

for (const skill of sampleSkills) {
  if (!bySkill[skill]) continue;
  const p = bySkill[skill][0];
  const correct = p.options.find(o => o.isCorrect);
  const wrong = p.options.filter(o => !o.isCorrect).map(o => o.text);

  console.log(`[${skill}]`);
  console.log(`  Q: ${p.prompt}`);
  console.log(`  ✓ CORRECT: ${correct ? correct.text : 'N/A'}`);
  console.log(`  ✗ WRONG: ${wrong.join(' | ')}`);
  console.log('');
}

// Math verification on specific problem types
console.log('=== SPOT-CHECK MATH ACCURACY ===\n');

// Check measures-of-center
if (bySkill['measures-of-center']) {
  const p = bySkill['measures-of-center'].find(x => x.prompt.includes('Mean of 2, 4, 6, 8, 10'));
  if (p) {
    const correct = p.options.find(o => o.isCorrect);
    const expected = (2+4+6+8+10)/5;
    console.log(`Mean of 2,4,6,8,10: Answer=${correct?.text}, Expected=${expected}`);
    console.log(`  ${correct?.text == expected ? '✓ CORRECT' : '✗ ERROR'}`);
  }
}

// Check pythagorean
if (bySkill['pythagorean-theorem']) {
  const p = bySkill['pythagorean-theorem'].find(x => x.prompt.includes('a=3, b=4'));
  if (p) {
    const correct = p.options.find(o => o.isCorrect);
    const expected = Math.sqrt(3*3 + 4*4);
    console.log(`Pythagorean a=3,b=4: Answer=${correct?.text}, Expected=c=${expected}`);
    console.log(`  ${correct?.text?.includes('5') ? '✓ CORRECT' : '✗ CHECK'}`);
  }
}

// Summary
console.log('\n=== SUMMARY ===');
console.log(`Total problems: ${problems.length}`);
console.log(`Skills covered: ${Object.keys(bySkill).length}`);
console.log(`Automated issues: ${issues.length}`);
console.log(`Issue rate: ${(issues.length / problems.length * 100).toFixed(2)}%`);

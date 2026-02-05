/**
 * Gap Analysis - Exact list of skills needing problems
 */

const fs = require('fs');

const problems = JSON.parse(fs.readFileSync('./docs/problems-deduped.json', 'utf8'));
const skills = JSON.parse(fs.readFileSync('./docs/mathmatixdb.skills.json', 'utf8'));

// Count problems per skill
const countBySkill = {};
problems.forEach(p => {
  countBySkill[p.skillId] = (countBySkill[p.skillId] || 0) + 1;
});

// Focus on Grade 3+ (exclude preK, K-2)
const targetBands = ['K-5', '5-8', '8-12', 'Calculus', 'Calc 3'];

const gaps = {
  missing: [],      // 0 problems
  critical: [],     // 1-4 problems
  low: [],          // 5-9 problems
  adequate: [],     // 10-24 problems
  good: []          // 25+ problems
};

skills.forEach(s => {
  if (!targetBands.includes(s.gradeBand)) return;

  const count = countBySkill[s.skillId] || 0;
  const entry = {
    skillId: s.skillId,
    displayName: s.displayName,
    gradeBand: s.gradeBand,
    category: s.category,
    currentCount: count,
    neededFor15: Math.max(0, 15 - count),
  };

  if (count === 0) gaps.missing.push(entry);
  else if (count < 5) gaps.critical.push(entry);
  else if (count < 10) gaps.low.push(entry);
  else if (count < 25) gaps.adequate.push(entry);
  else gaps.good.push(entry);
});

console.log('=== GAP ANALYSIS (Grade 3 through Calc 3) ===\n');
console.log(`Missing (0 problems): ${gaps.missing.length} skills`);
console.log(`Critical (1-4): ${gaps.critical.length} skills`);
console.log(`Low (5-9): ${gaps.low.length} skills`);
console.log(`Adequate (10-24): ${gaps.adequate.length} skills`);
console.log(`Good (25+): ${gaps.good.length} skills`);

// Calculate total problems needed
const totalNeeded = [
  ...gaps.missing.map(s => 15),
  ...gaps.critical.map(s => s.neededFor15),
  ...gaps.low.map(s => s.neededFor15),
].reduce((a, b) => a + b, 0);

console.log(`\nTotal new problems needed to reach 15/skill: ${totalNeeded}`);

// Output detailed lists
console.log('\n=== MISSING SKILLS (need 15 each) ===');
gaps.missing.forEach(s => {
  console.log(`${s.skillId} | ${s.gradeBand} | ${s.category}`);
});

console.log('\n=== CRITICAL SKILLS (need boost) ===');
gaps.critical.forEach(s => {
  console.log(`${s.skillId} | has ${s.currentCount} | needs ${s.neededFor15} more`);
});

// Save for generator
const workList = {
  missing: gaps.missing,
  critical: gaps.critical,
  low: gaps.low,
  totalNeeded,
  generatedAt: new Date().toISOString()
};

fs.writeFileSync('./docs/generation-worklist.json', JSON.stringify(workList, null, 2));
console.log('\nSaved worklist to docs/generation-worklist.json');

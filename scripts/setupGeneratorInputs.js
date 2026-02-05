/**
 * Setup script to create required input files for generateProblems.js
 * Creates: problems-deduped.json, generation-worklist.json
 */

const fs = require('fs');

// Load existing data
const skills = JSON.parse(fs.readFileSync('./docs/mathmatixdb.skills.json', 'utf8'));
const problems = JSON.parse(fs.readFileSync('./docs/mathmatixdb.problems.json', 'utf8'));

console.log(`Loaded ${skills.length} skills and ${problems.length} problems`);

// 1. Create problems-deduped.json (remove duplicates based on prompt)
const seenPrompts = new Set();
const dedupedProblems = [];
for (const p of problems) {
  const key = p.prompt.trim().toLowerCase();
  if (!seenPrompts.has(key)) {
    seenPrompts.add(key);
    dedupedProblems.push(p);
  }
}

fs.writeFileSync('./docs/problems-deduped.json', JSON.stringify(dedupedProblems, null, 2));
console.log(`Created problems-deduped.json with ${dedupedProblems.length} problems (removed ${problems.length - dedupedProblems.length} duplicates)`);

// 2. Create generation-worklist.json
// Count problems per skill
const skillCounts = {};
for (const p of dedupedProblems) {
  skillCounts[p.skillId] = (skillCounts[p.skillId] || 0) + 1;
}

// Categorize skills
const missing = []; // 0 problems
const critical = []; // 1-4 problems
const low = []; // 5-9 problems

for (const skill of skills) {
  const count = skillCounts[skill.skillId] || 0;
  const item = {
    skillId: skill.skillId,
    displayName: skill.displayName,
    currentCount: count,
    neededFor15: Math.max(0, 15 - count),
    gradeBand: skill.gradeBand,
    category: skill.ohioDomain
  };

  if (count === 0) {
    missing.push(item);
  } else if (count < 5) {
    critical.push(item);
  } else if (count < 10) {
    low.push(item);
  }
}

const workList = { missing, critical, low };
fs.writeFileSync('./docs/generation-worklist.json', JSON.stringify(workList, null, 2));
console.log(`Created generation-worklist.json:`);
console.log(`  - ${missing.length} skills with 0 problems (missing)`);
console.log(`  - ${critical.length} skills with 1-4 problems (critical)`);
console.log(`  - ${low.length} skills with 5-9 problems (low)`);

// List skills by category
console.log('\n=== Skills needing generators ===');
const allNeeding = [...missing, ...critical, ...low];
console.log(`Total: ${allNeeding.length} skills need problems`);
console.log('\nMissing (0 problems):');
missing.slice(0, 20).forEach(s => console.log(`  - ${s.skillId}`));
if (missing.length > 20) console.log(`  ... and ${missing.length - 20} more`);

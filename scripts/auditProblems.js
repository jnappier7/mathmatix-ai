/**
 * Problem Bank Audit Script
 * Analyzes coverage gaps for Grade 3 through Calc 3
 */

const fs = require('fs');

const problems = JSON.parse(fs.readFileSync('./docs/mathmatixdb.problems.json', 'utf8'));
const skills = JSON.parse(fs.readFileSync('./docs/mathmatixdb.skills.json', 'utf8'));

// Count problems per skill
const countBySkill = {};
problems.forEach(p => {
  countBySkill[p.skillId] = (countBySkill[p.skillId] || 0) + 1;
});

console.log('=== PROBLEM BANK AUDIT: Grade 3 through Calc 3 ===\n');

// Group skills by grade band
const byBand = {};
skills.forEach(s => {
  const band = s.gradeBand || 'unknown';
  if (!byBand[band]) byBand[band] = [];
  byBand[band].push({
    skillId: s.skillId,
    name: s.displayName || s.name,
    problems: countBySkill[s.skillId] || 0
  });
});

let totalSkills = 0;
let totalWithProblems = 0;
let totalProblems = 0;
const skillsNeeding = [];

const bandOrder = ['K-5', '5-8', '8-12', 'Calculus', 'Calc 3', 'unknown'];

bandOrder.forEach(band => {
  const bandSkills = byBand[band];
  if (!bandSkills || band === 'preK') return;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`${band} (${bandSkills.length} skills)`);
  console.log('='.repeat(50));

  const withProblems = bandSkills.filter(s => s.problems > 0);
  const withoutProblems = bandSkills.filter(s => s.problems === 0);
  const lowProblems = bandSkills.filter(s => s.problems > 0 && s.problems < 10);

  totalSkills += bandSkills.length;
  totalWithProblems += withProblems.length;
  totalProblems += bandSkills.reduce((a, s) => a + s.problems, 0);

  console.log(`  ✓ With problems: ${withProblems.length}`);
  console.log(`  ✗ Without problems: ${withoutProblems.length}`);
  console.log(`  ⚠ Low coverage (<10): ${lowProblems.length}`);

  if (withoutProblems.length > 0) {
    console.log(`\n  MISSING PROBLEMS:`);
    withoutProblems.forEach(s => {
      console.log(`    - ${s.skillId}`);
      skillsNeeding.push({ ...s, band });
    });
  }

  if (lowProblems.length > 0) {
    console.log(`\n  LOW COVERAGE:`);
    lowProblems.forEach(s => {
      console.log(`    - ${s.skillId} (${s.problems} problems)`);
    });
  }
});

console.log('\n' + '='.repeat(50));
console.log('SUMMARY');
console.log('='.repeat(50));
console.log(`Total skills (excl preK): ${totalSkills}`);
console.log(`Skills with problems: ${totalWithProblems}`);
console.log(`Skills needing problems: ${totalSkills - totalWithProblems}`);
console.log(`Total problems: ${totalProblems}`);
console.log(`Average problems/skill: ${(totalProblems / totalWithProblems).toFixed(1)}`);

// Check for duplicates
console.log('\n' + '='.repeat(50));
console.log('DUPLICATE CHECK');
console.log('='.repeat(50));

const promptCounts = {};
problems.forEach(p => {
  const key = p.prompt.trim().toLowerCase();
  if (!promptCounts[key]) promptCounts[key] = [];
  promptCounts[key].push(p.problemId);
});

const dupes = Object.entries(promptCounts).filter(([k, v]) => v.length > 1);
console.log(`Duplicate prompts found: ${dupes.length}`);
if (dupes.length > 0 && dupes.length <= 20) {
  dupes.forEach(([prompt, ids]) => {
    console.log(`  "${prompt.substring(0, 50)}..." (${ids.length} copies)`);
  });
} else if (dupes.length > 20) {
  console.log(`  (showing first 20)`);
  dupes.slice(0, 20).forEach(([prompt, ids]) => {
    console.log(`  "${prompt.substring(0, 50)}..." (${ids.length} copies)`);
  });
}

// Output skills needing work
console.log('\n' + '='.repeat(50));
console.log('SKILLS NEEDING PROBLEMS (for generation)');
console.log('='.repeat(50));
console.log(JSON.stringify(skillsNeeding.map(s => s.skillId), null, 2));

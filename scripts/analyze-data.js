const skills = require("../mathmatixdb.skills.json");
const problems = require("../mathmatixdb.problems.json");

const skillIds = new Set(skills.map(s => s.skillId));
const problemSkillIds = new Set(problems.map(p => p.skillId));

// Find orphaned problems (reference non-existent skills)
const orphanedSkills = new Set();
for (const p of problems) {
  if (!skillIds.has(p.skillId)) {
    orphanedSkills.add(p.skillId);
  }
}

console.log("=== CROSS-REFERENCE ANALYSIS ===");
console.log("\n--- Orphaned Problems (no matching skill) ---");
console.log("Unique orphaned skillIds:", orphanedSkills.size);
if (orphanedSkills.size > 0) {
  const orphanedArray = [...orphanedSkills];
  orphanedArray.slice(0,20).forEach(s => {
    const count = problems.filter(p => p.skillId === s).length;
    console.log("  " + s + ": " + count + " problems");
  });
  if (orphanedArray.length > 20) console.log("  ... and " + (orphanedArray.length - 20) + " more");
}

// Find skills without problems
const skillsWithoutProblems = skills.filter(s => !problemSkillIds.has(s.skillId));
console.log("\n--- Skills Without Problems ---");
console.log("Count:", skillsWithoutProblems.length);
skillsWithoutProblems.slice(0,25).forEach(s => console.log("  " + s.skillId + " (" + s.category + ")"));
if (skillsWithoutProblems.length > 25) console.log("  ... and " + (skillsWithoutProblems.length - 25) + " more");

// Check for duplicate problem IDs
const problemIdCounts = {};
for (const p of problems) {
  problemIdCounts[p.problemId] = (problemIdCounts[p.problemId] || 0) + 1;
}
const duplicates = Object.entries(problemIdCounts).filter(([k,v]) => v > 1);
console.log("\n--- Duplicate Problem IDs ---");
console.log("Count:", duplicates.length);

// IRT difficulty distribution for screener
console.log("\n--- Skills Available for Screener (by difficulty range) ---");
const screenableSkills = skills.filter(s => problemSkillIds.has(s.skillId) && s.isActive);
const diffRanges = {
  'elementary (< -1.5)': screenableSkills.filter(s => s.irtDifficulty < -1.5).length,
  'grade 3-5 (-1.5 to -0.5)': screenableSkills.filter(s => s.irtDifficulty >= -1.5 && s.irtDifficulty < -0.5).length,
  'middle school (-0.5 to 0.5)': screenableSkills.filter(s => s.irtDifficulty >= -0.5 && s.irtDifficulty < 0.5).length,
  'algebra 1 (0.5 to 1.5)': screenableSkills.filter(s => s.irtDifficulty >= 0.5 && s.irtDifficulty < 1.5).length,
  'algebra 2 (1.5 to 2.5)': screenableSkills.filter(s => s.irtDifficulty >= 1.5 && s.irtDifficulty < 2.5).length,
  'calculus (> 2.5)': screenableSkills.filter(s => s.irtDifficulty >= 2.5).length
};
Object.entries(diffRanges).forEach(([k,v]) => console.log("  " + k + ": " + v));

// Categories used in problems
console.log("\n--- Categories in Problems ---");
const problemCategories = {};
for (const p of problems) {
  const skill = skills.find(s => s.skillId === p.skillId);
  if (skill) {
    problemCategories[skill.category] = (problemCategories[skill.category] || 0) + 1;
  }
}
Object.entries(problemCategories).sort((a,b) => b[1]-a[1]).slice(0,15).forEach(([k,v]) => console.log("  " + k + ": " + v));

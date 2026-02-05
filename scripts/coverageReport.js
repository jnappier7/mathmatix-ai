const fs = require("fs");

const skillFiles = [
  "skills-kindergarten.json", "skills-grade-1.json", "skills-grade-2.json",
  "skills-grade-3.json", "skills-grade-4.json", "skills-grade-5.json",
  "skills-grade-6.json", "skills-grade-7.json", "skills-grade-8.json",
  "skills-ready-for-algebra.json", "skills-algebra-1.json", "skills-algebra-2.json",
  "skills-geometry.json", "skills-precalculus.json",
  "skills-calculus-1.json", "skills-calculus-2.json", "skills-calculus-3.json",
  "skills-pattern-based.json"
];

let allSkills = [];
for (const file of skillFiles) {
  try {
    const skills = JSON.parse(fs.readFileSync("./seeds/" + file, "utf8"));
    allSkills = allSkills.concat(skills);
  } catch (e) {}
}

const genContent = fs.readFileSync("./scripts/generateProblems.js", "utf8");

const withGen = allSkills.filter(s => genContent.includes("'" + s.skillId + "'"));
const withoutGen = allSkills.filter(s => !genContent.includes("'" + s.skillId + "'"));

console.log("=== COVERAGE SUMMARY ===\n");
console.log("Total skills: " + allSkills.length);
console.log("Skills WITH generators: " + withGen.length + " (" + (100*withGen.length/allSkills.length).toFixed(1) + "%)");
console.log("Skills WITHOUT generators: " + withoutGen.length + " (" + (100*withoutGen.length/allSkills.length).toFixed(1) + "%)");

console.log("\n=== SKILLS WITH GENERATORS (" + withGen.length + ") ===");
withGen.forEach(s => console.log("  ✓ " + s.skillId));

console.log("\n=== SKILLS NEEDING GENERATORS (" + withoutGen.length + ") ===");

const byCourse = {};
withoutGen.forEach(s => {
  const course = s.course || "Unknown";
  if (!byCourse[course]) byCourse[course] = [];
  byCourse[course].push(s.skillId);
});

for (const [course, skills] of Object.entries(byCourse).sort()) {
  console.log("\n" + course + " (" + skills.length + "):");
  skills.forEach(s => console.log("  ✗ " + s));
}

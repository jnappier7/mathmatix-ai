#!/usr/bin/env node
// Full QA verification of all middle school math course data after fixes
// Validates: JSON integrity, cross-references, graph acyclicity, field types,
// skill counts, prerequisite bidirectionality, and difficulty monotonicity

const fs = require('fs');
const path = require('path');

const PASS = '✓';
const FAIL = '✗';
let totalTests = 0;
let passedTests = 0;

function test(name, condition) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${PASS} ${name}`);
  } else {
    console.log(`  ${FAIL} ${name}`);
  }
  return condition;
}

// ============================================================
// 1. JSON INTEGRITY
// ============================================================
console.log('\n=== 1. JSON INTEGRITY ===');

const fileNames = [
  'skills-6th-grade-math.json',
  'skills-7th-grade-math.json',
  'skills-grade-8.json',
  'skills-grade-6.json',
  'skills-grade-7.json'
];

const files = {};
for (const fn of fileNames) {
  try {
    files[fn] = JSON.parse(fs.readFileSync(path.join(__dirname, '../seeds', fn), 'utf8'));
    test(`${fn}: valid JSON`, true);
    test(`${fn}: is array`, Array.isArray(files[fn]));
    test(`${fn}: non-empty`, files[fn].length > 0);
  } catch (e) {
    test(`${fn}: valid JSON`, false);
    console.log(`    Error: ${e.message}`);
  }
}

// ============================================================
// 2. SKILL COUNTS & COVERAGE
// ============================================================
console.log('\n=== 2. SKILL COUNTS ===');
test('Grade 6 detailed: 42 skills', files['skills-6th-grade-math.json']?.length === 42);
test('Grade 7 detailed: 39 skills', files['skills-7th-grade-math.json']?.length === 39);
test('Grade 8: 11 skills', files['skills-grade-8.json']?.length === 11);
test('Grade 6 quick-ref: 12 skills', files['skills-grade-6.json']?.length === 12);
test('Grade 7 quick-ref: 10 skills', files['skills-grade-7.json']?.length === 10);

// ============================================================
// 3. ALL SKILLS HAVE REQUIRED FIELDS
// ============================================================
console.log('\n=== 3. REQUIRED FIELDS ===');

const allSkills = {};
const requiredFields = ['skillId', 'displayName', 'description', 'category', 'course', 'prerequisites', 'enables', 'standardsAlignment', 'teachingGuidance', 'difficultyLevel', 'fluencyMetadata'];

for (const [fn, skills] of Object.entries(files)) {
  let allHaveRequired = true;
  for (const skill of skills) {
    allSkills[skill.skillId] = { ...skill, file: fn };
    for (const field of requiredFields) {
      if (skill[field] === undefined || skill[field] === null) {
        allHaveRequired = false;
        console.log(`    ${FAIL} ${fn}/${skill.skillId}: missing ${field}`);
      }
    }
  }
  test(`${fn}: all skills have required fields`, allHaveRequired);
}

// ============================================================
// 4. NO DUPLICATE SKILL IDS
// ============================================================
console.log('\n=== 4. NO DUPLICATE IDS ===');
const seenIds = new Set();
let noDupes = true;
for (const [fn, skills] of Object.entries(files)) {
  for (const skill of skills) {
    if (seenIds.has(skill.skillId)) {
      noDupes = false;
      console.log(`    ${FAIL} Duplicate: ${skill.skillId}`);
    }
    seenIds.add(skill.skillId);
  }
}
test('No duplicate skillIds across all files', noDupes);

// ============================================================
// 5. NO DANGLING PREREQUISITES
// ============================================================
console.log('\n=== 5. PREREQUISITE REFERENCES ===');
let noMissingPrereqs = true;
for (const [fn, skills] of Object.entries(files)) {
  for (const skill of skills) {
    for (const prereq of (skill.prerequisites || [])) {
      if (!allSkills[prereq]) {
        noMissingPrereqs = false;
        console.log(`    ${FAIL} ${skill.skillId}: prereq "${prereq}" not found`);
      }
    }
  }
}
test('All prerequisites reference existing skills', noMissingPrereqs);

// ============================================================
// 6. NO DANGLING ENABLES
// ============================================================
console.log('\n=== 6. ENABLES REFERENCES ===');
let noMissingEnables = true;
for (const [fn, skills] of Object.entries(files)) {
  for (const skill of skills) {
    for (const enabled of (skill.enables || [])) {
      if (!allSkills[enabled]) {
        noMissingEnables = false;
        console.log(`    ${FAIL} ${skill.skillId}: enables "${enabled}" not found`);
      }
    }
  }
}
test('All enables reference existing skills', noMissingEnables);

// ============================================================
// 7. PREREQUISITE GRAPH IS ACYCLIC (no circular deps)
// ============================================================
console.log('\n=== 7. GRAPH ACYCLICITY ===');

function hasCycle() {
  const visited = new Set();
  const stack = new Set();

  function dfs(skillId) {
    if (stack.has(skillId)) return true;
    if (visited.has(skillId)) return false;

    visited.add(skillId);
    stack.add(skillId);

    const skill = allSkills[skillId];
    if (skill) {
      for (const prereq of (skill.prerequisites || [])) {
        if (dfs(prereq)) return true;
      }
    }

    stack.delete(skillId);
    return false;
  }

  for (const skillId of Object.keys(allSkills)) {
    if (dfs(skillId)) return true;
  }
  return false;
}

test('Prerequisite graph has no cycles', !hasCycle());

// ============================================================
// 8. ENABLES/PREREQUISITES BIDIRECTIONAL CONSISTENCY
// Within each file set, if A enables B then B lists A as prereq
// ============================================================
console.log('\n=== 8. BIDIRECTIONAL CONSISTENCY (detailed files) ===');
let biConsistent = true;
const detailedFiles = ['skills-6th-grade-math.json', 'skills-7th-grade-math.json'];
for (const fn of detailedFiles) {
  for (const skill of files[fn]) {
    for (const enabled of (skill.enables || [])) {
      if (allSkills[enabled] && allSkills[enabled].file === fn) {
        const target = allSkills[enabled];
        if (!(target.prerequisites || []).includes(skill.skillId)) {
          biConsistent = false;
          console.log(`    ${FAIL} ${skill.skillId} enables ${enabled}, but ${enabled} missing prereq`);
        }
      }
    }
  }
}
test('All enables within detailed files have matching prerequisites', biConsistent);

// ============================================================
// 9. DIFFICULTY MONOTONICITY (no inversions along prereq chains)
// ============================================================
console.log('\n=== 9. DIFFICULTY MONOTONICITY ===');
let difficultyOk = true;
for (const [fn, skills] of Object.entries(files)) {
  for (const skill of skills) {
    for (const prereq of (skill.prerequisites || [])) {
      if (allSkills[prereq] && allSkills[prereq].difficultyLevel > skill.difficultyLevel) {
        difficultyOk = false;
        console.log(`    ${FAIL} ${skill.skillId} (${skill.difficultyLevel}) < prereq ${prereq} (${allSkills[prereq].difficultyLevel})`);
      }
    }
  }
}
test('No difficulty inversions in prerequisite chains', difficultyOk);

// ============================================================
// 10. CROSS-REFERENCE CONSISTENCY
// ============================================================
console.log('\n=== 10. CROSS-REFERENCES ===');
let crossRefOk = true;

// Check quick-ref → detailed
for (const fn of ['skills-grade-6.json', 'skills-grade-7.json']) {
  for (const skill of files[fn]) {
    if (skill.detailedSkillId) {
      if (!allSkills[skill.detailedSkillId]) {
        crossRefOk = false;
        console.log(`    ${FAIL} ${skill.skillId}: detailedSkillId "${skill.detailedSkillId}" not found`);
      }
    }
  }
}

// Check detailed → quick-ref
for (const fn of detailedFiles) {
  for (const skill of files[fn]) {
    if (skill.quickRefSkillId) {
      if (!allSkills[skill.quickRefSkillId]) {
        crossRefOk = false;
        console.log(`    ${FAIL} ${skill.skillId}: quickRefSkillId "${skill.quickRefSkillId}" not found`);
      }
    }
  }
}
test('All cross-references point to existing skills', crossRefOk);

// ============================================================
// 11. FIELD TYPES
// ============================================================
console.log('\n=== 11. FIELD TYPES ===');
let typesOk = true;
for (const [fn, skills] of Object.entries(files)) {
  for (const skill of skills) {
    if (typeof skill.unit !== 'string') { typesOk = false; console.log(`    ${FAIL} ${skill.skillId}: unit is ${typeof skill.unit}`); }
    if (typeof skill.difficultyLevel !== 'number') { typesOk = false; console.log(`    ${FAIL} ${skill.skillId}: difficultyLevel not number`); }
    if (!Array.isArray(skill.prerequisites)) { typesOk = false; console.log(`    ${FAIL} ${skill.skillId}: prerequisites not array`); }
    if (!Array.isArray(skill.enables)) { typesOk = false; console.log(`    ${FAIL} ${skill.skillId}: enables not array`); }
    if (!Array.isArray(skill.standardsAlignment)) { typesOk = false; console.log(`    ${FAIL} ${skill.skillId}: standardsAlignment not array`); }
    if (skill.fluencyMetadata) {
      if (typeof skill.fluencyMetadata.baseFluencyTime !== 'number') { typesOk = false; console.log(`    ${FAIL} ${skill.skillId}: baseFluencyTime not number`); }
      if (typeof skill.fluencyMetadata.fluencyType !== 'string') { typesOk = false; console.log(`    ${FAIL} ${skill.skillId}: fluencyType not string`); }
    }
    if (skill.difficultyLevel < 1 || skill.difficultyLevel > 10) { typesOk = false; console.log(`    ${FAIL} ${skill.skillId}: difficultyLevel out of range`); }
    if (skill.quarter !== undefined && (skill.quarter < 0 || skill.quarter > 4)) { typesOk = false; console.log(`    ${FAIL} ${skill.skillId}: quarter out of range`); }
  }
}
test('All fields have correct types and ranges', typesOk);

// ============================================================
// 12. COMMON CORE STANDARDS COVERAGE
// ============================================================
console.log('\n=== 12. STANDARDS COVERAGE ===');
const expected = {
  '6': ['6.RP', '6.NS', '6.EE', '6.G', '6.SP'],
  '7': ['7.RP', '7.NS', '7.EE', '7.G', '7.SP'],
  '8': ['8.EE', '8.F', '8.G', '8.SP', '8.NS']
};
const gradeFiles = {
  '6': 'skills-6th-grade-math.json',
  '7': 'skills-7th-grade-math.json',
  '8': 'skills-grade-8.json'
};

for (const [grade, domains] of Object.entries(expected)) {
  const allStds = [];
  for (const skill of files[gradeFiles[grade]]) {
    allStds.push(...(skill.standardsAlignment || []));
  }
  for (const domain of domains) {
    test(`Grade ${grade}: ${domain} domain covered`, allStds.some(s => s.startsWith(domain)));
  }
}

// ============================================================
// 13. FLUENCYMETADATA SCHEMA CONSISTENCY
// ============================================================
console.log('\n=== 13. FLUENCYMETADATA SCHEMA ===');
let fmOk = true;
const validTypes = ['reflex', 'process', 'algorithm', 'conceptual', 'procedural', 'application'];
for (const [fn, skills] of Object.entries(files)) {
  for (const skill of skills) {
    const fm = skill.fluencyMetadata;
    if (!fm) continue;
    if (fm.targetAccuracy !== undefined || fm.targetSpeed !== undefined) {
      fmOk = false;
      console.log(`    ${FAIL} ${skill.skillId}: uses old schema (targetAccuracy/targetSpeed)`);
    }
    if (fm.fluencyType && !validTypes.includes(fm.fluencyType)) {
      fmOk = false;
      console.log(`    ${FAIL} ${skill.skillId}: invalid fluencyType "${fm.fluencyType}"`);
    }
  }
}
test('All fluencyMetadata uses current schema with valid types', fmOk);

// ============================================================
// SUMMARY
// ============================================================
console.log('\n' + '='.repeat(60));
console.log(`  FINAL RESULT: ${passedTests}/${totalTests} tests passed`);
if (passedTests === totalTests) {
  console.log('  ALL TESTS PASSED');
} else {
  console.log(`  ${totalTests - passedTests} TESTS FAILED`);
}
console.log('='.repeat(60));

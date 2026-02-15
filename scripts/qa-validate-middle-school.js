#!/usr/bin/env node
// QA Validation Script for Middle School Math Courses (Grades 6-8)
// Checks schema consistency, prerequisite graph integrity, standards, and more

const fs = require('fs');
const path = require('path');

// --- Load all middle school skill files ---
const files = {
  'skills-6th-grade-math.json': JSON.parse(fs.readFileSync(path.join(__dirname, '../seeds/skills-6th-grade-math.json'), 'utf8')),
  'skills-7th-grade-math.json': JSON.parse(fs.readFileSync(path.join(__dirname, '../seeds/skills-7th-grade-math.json'), 'utf8')),
  'skills-grade-8.json': JSON.parse(fs.readFileSync(path.join(__dirname, '../seeds/skills-grade-8.json'), 'utf8')),
  'skills-grade-6.json': JSON.parse(fs.readFileSync(path.join(__dirname, '../seeds/skills-grade-6.json'), 'utf8')),
  'skills-grade-7.json': JSON.parse(fs.readFileSync(path.join(__dirname, '../seeds/skills-grade-7.json'), 'utf8')),
};

// --- Model enums (from models/skill.js) ---
const VALID_CATEGORIES = [
  'counting-cardinality', 'number-recognition', 'addition-subtraction',
  'multiplication-division', 'place-value', 'shapes-geometry', 'measurement',
  'time', 'data', 'money', 'arrays',
  'integers-rationals', 'scientific-notation', 'area-perimeter', 'volume',
  'angles', 'pythagorean-theorem', 'transformations', 'scatter-plots',
  'number-system', 'operations', 'decimals', 'fractions', 'ratios-proportions',
  'percent', 'expressions', 'equations', 'linear-equations', 'systems',
  'inequalities', 'polynomials', 'factoring', 'quadratics', 'radicals',
  'rational-expressions', 'complex-numbers', 'exponentials-logarithms',
  'sequences-series', 'conics', 'functions', 'graphing', 'coordinate-plane',
  'geometry', 'trigonometry', 'identities', 'polar-coordinates', 'vectors',
  'matrices', 'limits', 'derivatives', 'integration', 'series-tests',
  'taylor-series', 'parametric-polar', 'differential-equations', 'multivariable',
  'vector-calculus', 'statistics', 'probability',
  'word-problems', 'expressions-equations', 'exponential', 'rational',
  'congruence', 'similarity', 'sequences', 'counting', 'number-theory',
  'rates', 'conversions', 'proofs', 'circles', 'triangles',
  'parallel-perpendicular', 'surface-area', 'right-triangles', 'coordinate-geometry',
  'integrals', 'estimation', 'number-sense', 'mental-math', 'linear-functions',
  'area-approximation', 'calc3', 'data-displays', 'optimization', 'series',
  'boot-camp', 'ratios-rates', 'integers-coordinate', 'applied-number-sense',
  'ratios-proportional', 'statistics-probability',
  'advanced'
];

const VALID_FLUENCY_TYPES = ['reflex', 'process', 'algorithm', 'conceptual', 'procedural', 'application'];

// --- Build global skill registry ---
const allSkills = {};
const issues = [];

function addIssue(severity, file, skillId, message) {
  issues.push({ severity, file, skillId, message });
}

// Collect all skills across all files
for (const [filename, skills] of Object.entries(files)) {
  for (const skill of skills) {
    if (allSkills[skill.skillId]) {
      addIssue('CRITICAL', filename, skill.skillId,
        `Duplicate skillId "${skill.skillId}" - also in ${allSkills[skill.skillId].file}`);
    }
    allSkills[skill.skillId] = { ...skill, file: filename };
  }
}

console.log('='.repeat(80));
console.log('  QA VALIDATION: MIDDLE SCHOOL MATH COURSES (Grades 6-8)');
console.log('='.repeat(80));

// --- 1. CHECK FOR DUPLICATE/OVERLAPPING SKILL SETS ---
console.log('\n\n📋 1. FILE OVERLAP ANALYSIS');
console.log('-'.repeat(60));

const g6Detailed = new Set(files['skills-6th-grade-math.json'].map(s => s.skillId));
const g6Quick = new Set(files['skills-grade-6.json'].map(s => s.skillId));
const g7Detailed = new Set(files['skills-7th-grade-math.json'].map(s => s.skillId));
const g7Quick = new Set(files['skills-grade-7.json'].map(s => s.skillId));

console.log(`\n  skills-6th-grade-math.json: ${g6Detailed.size} skills (g6- prefix)`);
console.log(`  skills-grade-6.json:        ${g6Quick.size} skills (no prefix)`);
console.log(`  skills-7th-grade-math.json: ${g7Detailed.size} skills (g7- prefix)`);
console.log(`  skills-grade-7.json:        ${g7Quick.size} skills (no prefix)`);
console.log(`  skills-grade-8.json:        ${files['skills-grade-8.json'].length} skills (no prefix)`);

const g6Overlap = [...g6Detailed].filter(id => g6Quick.has(id));
const g7Overlap = [...g7Detailed].filter(id => g7Quick.has(id));
console.log(`\n  Grade 6 ID overlap: ${g6Overlap.length} shared IDs`);
console.log(`  Grade 7 ID overlap: ${g7Overlap.length} shared IDs`);

if (g6Overlap.length === 0 && g6Detailed.size > 0 && g6Quick.size > 0) {
  // Check if cross-references exist (detailedSkillId / quickRefSkillId)
  const g6HasCrossRef = files['skills-grade-6.json'].some(s => s.detailedSkillId);
  if (!g6HasCrossRef) {
    addIssue('CRITICAL', 'skills-grade-6.json', '*',
      'DUPLICATE SKILL SET: Two separate grade 6 files with entirely different skillIds and NO cross-references.');
  }
}
if (g7Overlap.length === 0 && g7Detailed.size > 0 && g7Quick.size > 0) {
  const g7HasCrossRef = files['skills-grade-7.json'].some(s => s.detailedSkillId);
  if (!g7HasCrossRef) {
    addIssue('CRITICAL', 'skills-grade-7.json', '*',
      'DUPLICATE SKILL SET: Two separate grade 7 files with entirely different skillIds and NO cross-references.');
  }
}

// --- 2. SCHEMA VALIDATION ---
console.log('\n\n📋 2. SCHEMA VALIDATION');
console.log('-'.repeat(60));

for (const [filename, skills] of Object.entries(files)) {
  for (const skill of skills) {
    // Required fields
    if (!skill.skillId) addIssue('ERROR', filename, '?', 'Missing skillId');
    if (!skill.displayName) addIssue('ERROR', filename, skill.skillId, 'Missing displayName');
    if (!skill.description) addIssue('ERROR', filename, skill.skillId, 'Missing description');
    if (!skill.category) addIssue('ERROR', filename, skill.skillId, 'Missing category');

    // Category enum check
    if (skill.category && !VALID_CATEGORIES.includes(skill.category)) {
      addIssue('ERROR', filename, skill.skillId,
        `Invalid category "${skill.category}" - not in Skill model enum`);
    }

    // Quarter validation (model says min:0, max:4)
    if (skill.quarter !== undefined && skill.quarter !== null) {
      if (skill.quarter < 0 || skill.quarter > 4) {
        addIssue('ERROR', filename, skill.skillId,
          `quarter=${skill.quarter} out of valid range [0-4]`);
      }
    }

    // Unit type check (model expects String)
    if (skill.unit !== undefined && typeof skill.unit === 'number') {
      addIssue('WARNING', filename, skill.skillId,
        `unit is a number (${skill.unit}) - model expects String type`);
    }

    // FluencyMetadata schema check
    if (skill.fluencyMetadata) {
      const fm = skill.fluencyMetadata;

      // Check for old schema (targetAccuracy/targetSpeed)
      if (fm.targetAccuracy !== undefined || fm.targetSpeed !== undefined) {
        addIssue('ERROR', filename, skill.skillId,
          `fluencyMetadata uses old schema (targetAccuracy/targetSpeed) - model expects baseFluencyTime/fluencyType/toleranceFactor`);
      }

      // Check fluencyType enum
      if (fm.fluencyType && !VALID_FLUENCY_TYPES.includes(fm.fluencyType)) {
        addIssue('ERROR', filename, skill.skillId,
          `Invalid fluencyType "${fm.fluencyType}" - model enum: [${VALID_FLUENCY_TYPES.join(', ')}]`);
      }
    }

    // DifficultyLevel range check (model says 1-10)
    if (skill.difficultyLevel !== undefined) {
      if (skill.difficultyLevel < 1 || skill.difficultyLevel > 10) {
        addIssue('ERROR', filename, skill.skillId,
          `difficultyLevel=${skill.difficultyLevel} out of range [1-10]`);
      }
    }

    // Missing optional but important fields
    if (!skill.course) {
      addIssue('INFO', filename, skill.skillId, 'Missing course field');
    }
    if (!skill.standardsAlignment || skill.standardsAlignment.length === 0) {
      addIssue('WARNING', filename, skill.skillId, 'No standardsAlignment');
    }
    if (!skill.teachingGuidance) {
      addIssue('WARNING', filename, skill.skillId, 'Missing teachingGuidance');
    } else {
      if (!skill.teachingGuidance.coreConcepts || skill.teachingGuidance.coreConcepts.length === 0) {
        addIssue('WARNING', filename, skill.skillId, 'Empty teachingGuidance.coreConcepts');
      }
      if (!skill.teachingGuidance.commonMistakes || skill.teachingGuidance.commonMistakes.length === 0) {
        addIssue('WARNING', filename, skill.skillId, 'Empty teachingGuidance.commonMistakes');
      }
      if (!skill.teachingGuidance.teachingTips || skill.teachingGuidance.teachingTips.length === 0) {
        addIssue('WARNING', filename, skill.skillId, 'Empty teachingGuidance.teachingTips');
      }
    }
  }
}

// --- 3. PREREQUISITE/ENABLES GRAPH INTEGRITY ---
console.log('\n\n📋 3. PREREQUISITE & ENABLES GRAPH INTEGRITY');
console.log('-'.repeat(60));

// Check within each file
for (const [filename, skills] of Object.entries(files)) {
  const fileSkillIds = new Set(skills.map(s => s.skillId));

  for (const skill of skills) {
    // Check prerequisites exist
    for (const prereq of (skill.prerequisites || [])) {
      if (!allSkills[prereq]) {
        addIssue('ERROR', filename, skill.skillId,
          `Dangling prerequisite: "${prereq}" does not exist in any loaded file`);
      }
    }

    // Check enables exist
    for (const enabled of (skill.enables || [])) {
      if (!allSkills[enabled]) {
        addIssue('WARNING', filename, skill.skillId,
          `Dangling enables: "${enabled}" does not exist in any loaded file (may be in another course)`);
      }
    }
  }
}

// Check bidirectional consistency (if A enables B, does B have A as prerequisite?)
for (const [filename, skills] of Object.entries(files)) {
  for (const skill of skills) {
    for (const enabled of (skill.enables || [])) {
      if (allSkills[enabled]) {
        const target = allSkills[enabled];
        if (!(target.prerequisites || []).includes(skill.skillId)) {
          addIssue('INFO', filename, skill.skillId,
            `Enables "${enabled}" but "${enabled}" doesn't list "${skill.skillId}" as a prerequisite (one-way link)`);
        }
      }
    }
  }
}

// Check for circular dependencies
function detectCycles(skillId, visited = new Set(), stack = new Set()) {
  if (stack.has(skillId)) return [skillId]; // cycle found
  if (visited.has(skillId)) return null;

  visited.add(skillId);
  stack.add(skillId);

  const skill = allSkills[skillId];
  if (skill) {
    for (const prereq of (skill.prerequisites || [])) {
      const cycle = detectCycles(prereq, visited, stack);
      if (cycle) return [...cycle, skillId];
    }
  }

  stack.delete(skillId);
  return null;
}

for (const skillId of Object.keys(allSkills)) {
  const cycle = detectCycles(skillId);
  if (cycle) {
    addIssue('CRITICAL', allSkills[skillId].file, skillId,
      `Circular dependency detected: ${cycle.join(' → ')}`);
    break; // One is enough to report
  }
}

// --- 4. CROSS-GRADE CONTINUITY ---
console.log('\n\n📋 4. CROSS-GRADE CONTINUITY');
console.log('-'.repeat(60));

// Check if grade 7 boot camp covers grade 6 terminal skills
const g6TerminalSkills = files['skills-6th-grade-math.json'].filter(s =>
  !s.enables || s.enables.length === 0
);
const g7BootCampSkills = files['skills-7th-grade-math.json'].filter(s => s.quarter === 0);

console.log(`\n  Grade 6 terminal skills (enables=[]): ${g6TerminalSkills.length}`);
g6TerminalSkills.forEach(s => console.log(`    - ${s.skillId}: ${s.displayName}`));

console.log(`\n  Grade 7 boot camp skills: ${g7BootCampSkills.length}`);
g7BootCampSkills.forEach(s => console.log(`    - ${s.skillId}: ${s.displayName}`));

const g7TerminalSkills = files['skills-7th-grade-math.json'].filter(s =>
  !s.enables || s.enables.length === 0
);
console.log(`\n  Grade 7 terminal skills (enables=[]): ${g7TerminalSkills.length}`);
g7TerminalSkills.forEach(s => console.log(`    - ${s.skillId}: ${s.displayName}`));

// Check if cross-grade prerequisites reference existing skills
const g8Skills = files['skills-grade-8.json'];
console.log(`\n  Grade 8 prerequisites referencing other grades:`);
for (const skill of g8Skills) {
  for (const prereq of (skill.prerequisites || [])) {
    if (!allSkills[prereq]) {
      console.log(`    ❌ ${skill.skillId} requires "${prereq}" - NOT FOUND`);
    }
  }
}

// --- 5. STANDARDS ALIGNMENT AUDIT ---
console.log('\n\n📋 5. STANDARDS ALIGNMENT COVERAGE');
console.log('-'.repeat(60));

const standardsByGrade = { '6': new Set(), '7': new Set(), '8': new Set() };

// Collect from detailed files
for (const skill of files['skills-6th-grade-math.json']) {
  (skill.standardsAlignment || []).forEach(s => standardsByGrade['6'].add(s));
}
for (const skill of files['skills-7th-grade-math.json']) {
  (skill.standardsAlignment || []).forEach(s => standardsByGrade['7'].add(s));
}
for (const skill of files['skills-grade-8.json']) {
  (skill.standardsAlignment || []).forEach(s => standardsByGrade['8'].add(s));
}

console.log(`\n  Grade 6 standards covered: ${standardsByGrade['6'].size}`);
const g6Standards = [...standardsByGrade['6']].sort();
const g6Domains = new Set(g6Standards.map(s => s.split('.').slice(0, 2).join('.')));
console.log(`  Grade 6 domains: ${[...g6Domains].sort().join(', ')}`);

// Check for expected 6th grade CC domains
const expected6 = ['6.RP', '6.NS', '6.EE', '6.G', '6.SP'];
for (const exp of expected6) {
  const found = g6Standards.some(s => s.startsWith(exp));
  console.log(`    ${found ? '✓' : '❌'} ${exp} ${found ? 'covered' : 'MISSING'}`);
  if (!found) addIssue('WARNING', 'skills-6th-grade-math.json', '*', `Missing CC domain: ${exp}`);
}

console.log(`\n  Grade 7 standards covered: ${standardsByGrade['7'].size}`);
const g7Standards = [...standardsByGrade['7']].sort();
const g7Domains = new Set(g7Standards.map(s => s.split('.').slice(0, 2).join('.')));
console.log(`  Grade 7 domains: ${[...g7Domains].sort().join(', ')}`);

const expected7 = ['7.RP', '7.NS', '7.EE', '7.G', '7.SP'];
for (const exp of expected7) {
  const found = g7Standards.some(s => s.startsWith(exp));
  console.log(`    ${found ? '✓' : '❌'} ${exp} ${found ? 'covered' : 'MISSING'}`);
  if (!found) addIssue('WARNING', 'skills-7th-grade-math.json', '*', `Missing CC domain: ${exp}`);
}

console.log(`\n  Grade 8 standards covered: ${standardsByGrade['8'].size}`);
const g8Standards = [...standardsByGrade['8']].sort();
const g8Domains = new Set(g8Standards.map(s => s.split('.').slice(0, 2).join('.')));
console.log(`  Grade 8 domains: ${[...g8Domains].sort().join(', ')}`);

const expected8 = ['8.EE', '8.F', '8.G', '8.SP', '8.NS'];
for (const exp of expected8) {
  const found = g8Standards.some(s => s.startsWith(exp));
  console.log(`    ${found ? '✓' : '❌'} ${exp} ${found ? 'covered' : 'MISSING'}`);
  if (!found) addIssue('WARNING', 'skills-grade-8.json', '*', `Missing CC domain: ${exp}`);
}

// Check for standards referencing wrong grade
for (const skill of files['skills-6th-grade-math.json']) {
  for (const std of (skill.standardsAlignment || [])) {
    if (std.startsWith('7.') || std.startsWith('8.')) {
      addIssue('INFO', 'skills-6th-grade-math.json', skill.skillId,
        `Standard "${std}" is from a higher grade (used in grade 6 skill)`);
    }
  }
}
for (const skill of files['skills-7th-grade-math.json']) {
  for (const std of (skill.standardsAlignment || [])) {
    if (std.startsWith('8.') || std.startsWith('9.')) {
      addIssue('INFO', 'skills-7th-grade-math.json', skill.skillId,
        `Standard "${std}" is from a higher grade (used in grade 7 skill)`);
    }
  }
}

// --- 6. DIFFICULTY PROGRESSION ---
console.log('\n\n📋 6. DIFFICULTY LEVEL ANALYSIS');
console.log('-'.repeat(60));

for (const [filename, skills] of Object.entries(files)) {
  if (!filename.includes('6th') && !filename.includes('7th') && !filename.includes('grade-8')) continue;

  const byQuarter = {};
  for (const skill of skills) {
    const q = skill.quarter || 0;
    if (!byQuarter[q]) byQuarter[q] = [];
    byQuarter[q].push(skill.difficultyLevel);
  }

  console.log(`\n  ${filename}:`);
  for (const [quarter, levels] of Object.entries(byQuarter).sort()) {
    const avg = (levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(1);
    const min = Math.min(...levels);
    const max = Math.max(...levels);
    console.log(`    Q${quarter}: avg=${avg}, range=[${min}-${max}], count=${levels.length}`);
  }
}

// Check for non-monotonic difficulty (later skills easier than earlier ones)
for (const [filename, skills] of Object.entries(files)) {
  for (const skill of skills) {
    for (const prereq of (skill.prerequisites || [])) {
      if (allSkills[prereq] && allSkills[prereq].difficultyLevel > skill.difficultyLevel) {
        addIssue('INFO', filename, skill.skillId,
          `Difficulty (${skill.difficultyLevel}) is lower than prerequisite "${prereq}" (${allSkills[prereq].difficultyLevel})`);
      }
    }
  }
}

// --- 7. SKILL NAMING CONSISTENCY ---
console.log('\n\n📋 7. SKILL ID NAMING CONVENTIONS');
console.log('-'.repeat(60));

for (const [filename, skills] of Object.entries(files)) {
  const prefixes = new Set(skills.map(s => {
    const match = s.skillId.match(/^(g\d+)-/);
    return match ? match[1] : 'none';
  }));
  console.log(`  ${filename}: prefixes = [${[...prefixes].join(', ')}]`);
}

// ============ SUMMARY ============
console.log('\n\n' + '='.repeat(80));
console.log('  ISSUE SUMMARY');
console.log('='.repeat(80));

const bySeverity = {};
for (const issue of issues) {
  if (!bySeverity[issue.severity]) bySeverity[issue.severity] = [];
  bySeverity[issue.severity].push(issue);
}

for (const severity of ['CRITICAL', 'ERROR', 'WARNING', 'INFO']) {
  const list = bySeverity[severity] || [];
  console.log(`\n  ${severity}: ${list.length} issues`);
  for (const issue of list) {
    console.log(`    [${issue.file}] ${issue.skillId}: ${issue.message}`);
  }
}

console.log(`\n\n  TOTAL ISSUES: ${issues.length}`);
console.log(`    CRITICAL: ${(bySeverity['CRITICAL'] || []).length}`);
console.log(`    ERROR:    ${(bySeverity['ERROR'] || []).length}`);
console.log(`    WARNING:  ${(bySeverity['WARNING'] || []).length}`);
console.log(`    INFO:     ${(bySeverity['INFO'] || []).length}`);
console.log('');

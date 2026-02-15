#!/usr/bin/env node
/**
 * auditLessonScaffolding.js
 *
 * Audits every lesson across all modules to check if it has the full
 * gradual release cycle: explanation → model (I-Do) → guided_practice (We-Do) → independent_practice (You-Do)
 *
 * Reports which lessons are missing which phases.
 */

const fs = require('fs');
const path = require('path');

const RESOURCES_DIR = path.join(__dirname, '../public/resources');
const MODULES_DIR = path.join(__dirname, '../public/modules');

const pathwayFiles = fs.readdirSync(RESOURCES_DIR).filter(f => f.endsWith('-pathway.json'));

const REQUIRED_PHASES = ['explanation', 'model', 'guided_practice', 'independent_practice'];

let totalLessons = 0;
let completeLessons = 0;
let incompleteLessons = 0;
const gaps = []; // { course, module, lesson, missing[], hasPlaceholder }

for (const pwFile of pathwayFiles) {
  const pathway = JSON.parse(fs.readFileSync(path.join(RESOURCES_DIR, pwFile), 'utf8'));
  const courseId = pathway.courseId;

  for (const pwModule of (pathway.modules || [])) {
    if (pwModule.isCheckpoint || !pwModule.moduleFile) continue;

    const moduleFile = path.join(__dirname, '../public', pwModule.moduleFile);
    if (!fs.existsSync(moduleFile)) continue;

    const moduleData = JSON.parse(fs.readFileSync(moduleFile, 'utf8'));
    if (!moduleData.scaffold || !Array.isArray(moduleData.scaffold)) continue;

    // Group scaffold steps by lessonId
    const lessonSteps = {};
    for (const step of moduleData.scaffold) {
      const lid = step.lessonId || '_no_lesson';
      if (!lessonSteps[lid]) lessonSteps[lid] = [];
      lessonSteps[lid].push(step);
    }

    // Check each lesson for completeness
    for (const [lessonId, steps] of Object.entries(lessonSteps)) {
      if (lessonId === '_no_lesson') continue;
      totalLessons++;

      const typesPresent = new Set(steps.map(s => s.type));
      const missing = REQUIRED_PHASES.filter(p => !typesPresent.has(p));

      // Check for placeholder content
      let hasPlaceholder = false;
      for (const step of steps) {
        const content = step.content || '';
        const problems = step.problems || [];
        if (problems.length === 1) {
          const q = problems[0].question || problems[0].hint || '';
          if (q.includes('Practice problem for') || q.length < 30) {
            hasPlaceholder = true;
          }
        }
        if (content.length < 20 && step.type === 'explanation') {
          hasPlaceholder = true;
        }
      }

      if (missing.length === 0 && !hasPlaceholder) {
        completeLessons++;
      } else {
        incompleteLessons++;
        gaps.push({
          course: courseId,
          module: pwModule.moduleId,
          lessonId,
          missing,
          hasPlaceholder,
          stepsPresent: [...typesPresent]
        });
      }
    }
  }
}

// Summary
console.log('='.repeat(60));
console.log('LESSON SCAFFOLDING AUDIT');
console.log('='.repeat(60));
console.log(`Total lessons: ${totalLessons}`);
console.log(`Complete (all 4 phases): ${completeLessons} (${Math.round(completeLessons/totalLessons*100)}%)`);
console.log(`Incomplete: ${incompleteLessons} (${Math.round(incompleteLessons/totalLessons*100)}%)`);
console.log();

// Break down by what's missing
const missingCounts = {};
for (const g of gaps) {
  for (const m of g.missing) {
    missingCounts[m] = (missingCounts[m] || 0) + 1;
  }
  if (g.hasPlaceholder) {
    missingCounts['placeholder_content'] = (missingCounts['placeholder_content'] || 0) + 1;
  }
}

console.log('Missing phase counts:');
for (const [phase, count] of Object.entries(missingCounts).sort((a,b) => b[1] - a[1])) {
  console.log(`  ${phase}: ${count} lessons`);
}

// Break down by course
console.log('\nBy course:');
const byCourse = {};
for (const g of gaps) {
  if (!byCourse[g.course]) byCourse[g.course] = { total: 0, gaps: [] };
  byCourse[g.course].total++;
  byCourse[g.course].gaps.push(g);
}
for (const [course, data] of Object.entries(byCourse).sort((a,b) => b[1].total - a[1].total)) {
  console.log(`  ${course}: ${data.total} incomplete lessons`);
}

// Show worst offenders (lessons with 3+ missing phases)
console.log('\nWorst gaps (3+ missing phases):');
const worst = gaps.filter(g => g.missing.length >= 3);
for (const g of worst.slice(0, 20)) {
  console.log(`  ${g.course} / ${g.module} / ${g.lessonId}: missing [${g.missing.join(', ')}], has [${g.stepsPresent.join(', ')}]`);
}
if (worst.length > 20) console.log(`  ... and ${worst.length - 20} more`);

// Show placeholder issues
console.log('\nPlaceholder content detected:');
const placeholders = gaps.filter(g => g.hasPlaceholder);
for (const g of placeholders.slice(0, 15)) {
  console.log(`  ${g.course} / ${g.module} / ${g.lessonId}`);
}
if (placeholders.length > 15) console.log(`  ... and ${placeholders.length - 15} more`);

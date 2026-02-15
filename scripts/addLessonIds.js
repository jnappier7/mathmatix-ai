#!/usr/bin/env node
/**
 * addLessonIds.js
 *
 * Adds `lessonId` to each scaffold step in all module JSON files.
 * Maps scaffold steps to lessons using skill-based matching from the pathway.
 *
 * Strategy:
 *   1. Load pathway → get module's lessons array (each lesson has skills/concepts)
 *   2. Load module JSON → iterate scaffold steps
 *   3. For each scaffold step, match its `skill` to a lesson
 *   4. Write back the module JSON with lessonId added to each step
 *
 * Usage: node scripts/addLessonIds.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const RESOURCES_DIR = path.join(__dirname, '../public/resources');
const MODULES_DIR = path.join(__dirname, '../public/modules');

// Load all pathway files
const pathwayFiles = fs.readdirSync(RESOURCES_DIR).filter(f => f.endsWith('-pathway.json'));

let totalModules = 0;
let totalSteps = 0;
let totalMapped = 0;
let totalUnmapped = 0;

for (const pwFile of pathwayFiles) {
  const pathway = JSON.parse(fs.readFileSync(path.join(RESOURCES_DIR, pwFile), 'utf8'));
  const courseId = pathway.courseId;
  console.log(`\n📚 Processing ${courseId} (${pwFile})`);

  const courseModulesDir = path.join(MODULES_DIR, courseId);
  if (!fs.existsSync(courseModulesDir)) {
    console.log(`   ⚠️  No modules directory for ${courseId}`);
    continue;
  }

  for (const pwModule of (pathway.modules || [])) {
    // Skip checkpoints and modules without files
    if (pwModule.isCheckpoint || !pwModule.moduleFile) continue;

    const moduleFile = path.join(__dirname, '../public', pwModule.moduleFile);
    if (!fs.existsSync(moduleFile)) {
      console.log(`   ⚠️  Module file not found: ${pwModule.moduleFile}`);
      continue;
    }

    const moduleData = JSON.parse(fs.readFileSync(moduleFile, 'utf8'));
    if (!moduleData.scaffold || !Array.isArray(moduleData.scaffold)) {
      console.log(`   ⚠️  No scaffold array in ${pwModule.moduleId}`);
      continue;
    }

    totalModules++;

    // Build skill → lessonId mapping from pathway lessons
    const lessons = pwModule.lessons || [];
    const skillToLesson = {};

    for (const lesson of lessons) {
      // Map by lessonId matching common skill patterns
      // Also try to match lesson concepts to skill names
      if (lesson.lessonId) {
        // Direct skill matching: the module's skills array order matches lesson order
        // So we map each skill to the corresponding lesson
      }
    }

    // Better approach: map skills from module.skills to lessons in order
    // The module's skills array and pathway's lessons array are parallel
    const moduleSkills = moduleData.skills || pwModule.skills || [];
    for (let i = 0; i < moduleSkills.length; i++) {
      const skill = moduleSkills[i];
      // Find the best matching lesson
      const matchingLesson = lessons[i]; // Direct positional match (skills and lessons are parallel)
      if (matchingLesson) {
        skillToLesson[skill] = matchingLesson.lessonId;
      }
    }

    // Also build a fuzzy matcher for skills that don't have exact matches
    for (const lesson of lessons) {
      const lessonId = lesson.lessonId;
      // Try to match by shared words between skill and lessonId
      for (const skill of moduleSkills) {
        if (skillToLesson[skill]) continue; // Already mapped
        const skillWords = skill.toLowerCase().replace(/[-_]/g, ' ').split(' ');
        const lessonWords = lessonId.toLowerCase().replace(/[-_]/g, ' ').split(' ');
        const overlap = skillWords.filter(w => lessonWords.includes(w) && w.length > 2);
        if (overlap.length >= 1) {
          skillToLesson[skill] = lessonId;
        }
      }
    }

    // Apply lessonId to each scaffold step
    let mapped = 0;
    let unmapped = 0;

    for (const step of moduleData.scaffold) {
      totalSteps++;
      const stepSkill = step.skill;

      if (stepSkill && skillToLesson[stepSkill]) {
        step.lessonId = skillToLesson[stepSkill];
        mapped++;
        totalMapped++;
      } else if (lessons.length > 0) {
        // For steps without a matching skill (e.g., generic independent_practice),
        // assign to the last lesson as a capstone
        step.lessonId = lessons[lessons.length - 1]?.lessonId || null;
        if (step.lessonId) {
          mapped++;
          totalMapped++;
        } else {
          unmapped++;
          totalUnmapped++;
        }
      } else {
        // No lessons defined in pathway — create a synthetic lesson from module
        step.lessonId = pwModule.moduleId;
        mapped++;
        totalMapped++;
      }
    }

    // Also add a `lessons` summary to the module if it doesn't have one
    if (!moduleData.lessons && lessons.length > 0) {
      moduleData.lessons = lessons.map(l => ({
        lessonId: l.lessonId,
        title: l.title,
        order: l.order
      }));
    }

    console.log(`   ✅ ${pwModule.moduleId}: ${moduleData.scaffold.length} steps → ${mapped} mapped, ${unmapped} unmapped`);

    if (!DRY_RUN) {
      fs.writeFileSync(moduleFile, JSON.stringify(moduleData, null, 2) + '\n', 'utf8');
    }
  }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`📊 Summary${DRY_RUN ? ' (DRY RUN)' : ''}:`);
console.log(`   Modules processed: ${totalModules}`);
console.log(`   Total scaffold steps: ${totalSteps}`);
console.log(`   Steps mapped: ${totalMapped}`);
console.log(`   Steps unmapped: ${totalUnmapped}`);
console.log(`   Coverage: ${totalSteps > 0 ? Math.round(totalMapped / totalSteps * 100) : 0}%`);

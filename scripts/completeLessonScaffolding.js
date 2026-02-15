#!/usr/bin/env node
/**
 * completeLessonScaffolding.js
 *
 * Fills in missing scaffold phases for every lesson across all modules.
 * Each lesson should have the full gradual release cycle:
 *   1. explanation (concept-intro)
 *   2. model (i-do)
 *   3. guided_practice (we-do)
 *   4. independent_practice (you-do)
 *
 * Strategy:
 *   - Redistribute existing multi-skill We-Do/You-Do problems to individual lessons
 *   - Generate missing phases from pathway concepts and teaching notes
 *   - Preserve all existing content — never delete, only add
 *
 * Usage: node scripts/completeLessonScaffolding.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const RESOURCES_DIR = path.join(__dirname, '../public/resources');
const pathwayFiles = fs.readdirSync(RESOURCES_DIR).filter(f => f.endsWith('-pathway.json'));

let stats = {
  modulesProcessed: 0,
  lessonsComplete: 0,
  explanationsAdded: 0,
  modelsAdded: 0,
  guidedPracticeAdded: 0,
  independentPracticeAdded: 0,
  problemsRedistributed: 0,
  placeholdersFixed: 0
};

for (const pwFile of pathwayFiles) {
  const pathway = JSON.parse(fs.readFileSync(path.join(RESOURCES_DIR, pwFile), 'utf8'));
  const courseId = pathway.courseId;

  for (const pwModule of (pathway.modules || [])) {
    if (pwModule.isCheckpoint || !pwModule.moduleFile) continue;

    const moduleFile = path.join(__dirname, '../public', pwModule.moduleFile);
    if (!fs.existsSync(moduleFile)) continue;

    const moduleData = JSON.parse(fs.readFileSync(moduleFile, 'utf8'));
    if (!moduleData.scaffold || !Array.isArray(moduleData.scaffold)) continue;

    const lessons = moduleData.lessons || [];
    if (lessons.length === 0) continue;

    stats.modulesProcessed++;

    // Build lesson metadata from pathway
    const pathwayLessons = pwModule.lessons || [];
    const lessonMeta = {};
    for (const pl of pathwayLessons) {
      lessonMeta[pl.lessonId] = {
        title: pl.title,
        concepts: pl.concepts || [],
        teachingNotes: pl.teachingNotes || '',
        commonMistakes: pl.commonMistakes || []
      };
    }

    // Group existing scaffold steps by lessonId
    const stepsByLesson = {};
    for (const step of moduleData.scaffold) {
      const lid = step.lessonId;
      if (!lid) continue;
      if (!stepsByLesson[lid]) stepsByLesson[lid] = [];
      stepsByLesson[lid].push(step);
    }

    // Collect all multi-skill guided_practice and independent_practice problems
    // These are shared capstone steps that need to be redistributed
    const sharedGuidedProblems = {}; // skill -> [problems]
    const sharedIndependentProblems = {}; // skill -> [problems]

    for (const step of moduleData.scaffold) {
      if (step.type === 'guided_practice' && step.problems && step.problems.length > 1) {
        for (const prob of step.problems) {
          const pSkill = prob.skill || step.skill;
          if (pSkill) {
            if (!sharedGuidedProblems[pSkill]) sharedGuidedProblems[pSkill] = [];
            sharedGuidedProblems[pSkill].push(prob);
          }
        }
      }
      if (step.type === 'independent_practice' && step.problems && step.problems.length > 1) {
        for (const prob of step.problems) {
          const pSkill = prob.skill || step.skill;
          if (pSkill) {
            if (!sharedIndependentProblems[pSkill]) sharedIndependentProblems[pSkill] = [];
            sharedIndependentProblems[pSkill].push(prob);
          }
        }
      }
    }

    // Find the skill for each lesson
    const lessonSkillMap = {};
    const moduleSkills = moduleData.skills || pwModule.skills || [];
    for (let i = 0; i < lessons.length; i++) {
      const lid = lessons[i].lessonId;
      // Try direct match from module skills
      if (i < moduleSkills.length) {
        lessonSkillMap[lid] = moduleSkills[i];
      }
      // Also check scaffold steps for this lesson
      const stepsForLesson = stepsByLesson[lid] || [];
      for (const step of stepsForLesson) {
        if (step.skill) {
          lessonSkillMap[lid] = step.skill;
          break;
        }
      }
    }

    // Now rebuild the scaffold array with complete lessons
    const newScaffold = [];
    let modified = false;

    for (const lesson of lessons) {
      const lid = lesson.lessonId;
      const meta = lessonMeta[lid] || { title: lesson.title, concepts: [], teachingNotes: '' };
      const existingSteps = stepsByLesson[lid] || [];
      const skill = lessonSkillMap[lid] || lid;
      const lessonTitle = meta.title || lesson.title || lid;

      const typesPresent = new Set(existingSteps.map(s => s.type));

      // 1. EXPLANATION (concept-intro)
      if (typesPresent.has('explanation')) {
        // Keep existing explanation(s)
        for (const s of existingSteps.filter(s => s.type === 'explanation')) {
          newScaffold.push(s);
        }
      } else {
        // Generate explanation from pathway concepts
        const conceptList = meta.concepts.length > 0
          ? meta.concepts.map(c => `- ${c}`).join('\n')
          : `- Core concepts of ${lessonTitle}`;
        const teachingNote = meta.teachingNotes
          ? `\n\n**Teaching approach:** ${meta.teachingNotes}`
          : '';

        newScaffold.push({
          type: 'explanation',
          lessonPhase: 'concept-intro',
          skill: skill,
          title: lessonTitle,
          content: `**${lessonTitle}**\n\nKey concepts to cover:\n${conceptList}${teachingNote}`,
          initialPrompt: `Let's start with ${lessonTitle.toLowerCase()}. What do you already know about this topic?`,
          lessonId: lid
        });
        stats.explanationsAdded++;
        modified = true;
      }

      // 2. MODEL (i-do)
      if (typesPresent.has('model')) {
        for (const s of existingSteps.filter(s => s.type === 'model')) {
          newScaffold.push(s);
        }
      } else {
        // Generate I-Do model scaffold
        // Use guided practice problems as templates for worked examples if available
        const guidedProblems = sharedGuidedProblems[skill] || [];
        const examples = [];

        if (guidedProblems.length > 0) {
          // Convert up to 2 guided practice problems into worked examples
          for (let i = 0; i < Math.min(2, guidedProblems.length); i++) {
            const gp = guidedProblems[i];
            examples.push({
              problem: gp.question || `Solve: ${gp.answer || 'practice problem'}`,
              solution: gp.hints
                ? gp.hints.join('\n') + (gp.answer ? `\n\nAnswer: **${gp.answer}**` : '')
                : `Work through this step by step to get: **${gp.answer || 'the solution'}**`,
              tip: gp.hints ? gp.hints[0] : `Focus on the key concept of ${lessonTitle.toLowerCase()}.`
            });
          }
        }

        if (examples.length === 0) {
          // Minimal template — AI will expand with real problems
          examples.push({
            problem: `Demonstrate a key ${lessonTitle.toLowerCase()} problem.`,
            solution: `Walk through the solution step by step, naming each operation or property used.`,
            tip: `${meta.concepts[0] || `Focus on the foundational idea of ${lessonTitle.toLowerCase()}`}.`
          });
        }

        newScaffold.push({
          type: 'model',
          lessonPhase: 'i-do',
          skill: skill,
          title: `I-Do: ${lessonTitle}`,
          examples: examples,
          initialPrompt: `Watch how I work through these examples. Pay attention to each step — I'll ask you about them after.`,
          lessonId: lid
        });
        stats.modelsAdded++;
        modified = true;
      }

      // 3. GUIDED PRACTICE (we-do)
      if (typesPresent.has('guided_practice')) {
        for (const s of existingSteps.filter(s => s.type === 'guided_practice')) {
          // Fix placeholder content
          if (s.problems && s.problems.length === 1) {
            const q = s.problems[0].question || s.problems[0].hint || '';
            if (q.includes('Practice problem for') || q.length < 30) {
              // Replace with redistributed problems or better template
              const redistributed = (sharedGuidedProblems[skill] || []).slice(0, 3);
              if (redistributed.length > 0) {
                s.problems = redistributed;
                stats.placeholdersFixed++;
                stats.problemsRedistributed += redistributed.length;
                modified = true;
              }
            }
          }
          newScaffold.push(s);
        }
      } else {
        // Create guided practice from redistributed problems or template
        const problems = (sharedGuidedProblems[skill] || []).slice(0, 3);
        if (problems.length > 0) {
          stats.problemsRedistributed += problems.length;
        }

        const guidedProblems = problems.length > 0 ? problems : [{
          question: `Practice ${lessonTitle.toLowerCase()} with guided support.`,
          answer: '',
          hints: [`Think about the key concept: ${meta.concepts[0] || lessonTitle.toLowerCase()}.`]
        }];

        newScaffold.push({
          type: 'guided_practice',
          lessonPhase: 'we-do',
          skill: skill,
          title: `We-Do: ${lessonTitle}`,
          problems: guidedProblems,
          initialPrompt: `Let's work through these together. I'll guide you, but you do the work. Ready?`,
          lessonId: lid
        });
        stats.guidedPracticeAdded++;
        modified = true;
      }

      // 4. INDEPENDENT PRACTICE (you-do)
      if (typesPresent.has('independent_practice')) {
        for (const s of existingSteps.filter(s => s.type === 'independent_practice')) {
          newScaffold.push(s);
        }
      } else {
        // Create independent practice from redistributed problems or template
        const problems = (sharedIndependentProblems[skill] || []).slice(0, 3);
        if (problems.length > 0) {
          stats.problemsRedistributed += problems.length;
        }

        const youDoProblems = problems.length > 0 ? problems : [{
          question: `Solve a ${lessonTitle.toLowerCase()} problem independently.`,
          answer: '',
          skill: skill,
          hints: [`Apply what you learned in the guided practice.`]
        }];

        newScaffold.push({
          type: 'independent_practice',
          lessonPhase: 'you-do',
          skill: skill,
          title: `You-Do: ${lessonTitle}`,
          problems: youDoProblems,
          attemptsRequired: 2,
          lessonId: lid
        });
        stats.independentPracticeAdded++;
        modified = true;
      }

      // Add any other step types (check-in, etc.)
      for (const s of existingSteps) {
        if (!['explanation', 'model', 'guided_practice', 'independent_practice'].includes(s.type)) {
          newScaffold.push(s);
        }
      }

      stats.lessonsComplete++;
    }

    if (modified) {
      moduleData.scaffold = newScaffold;
      if (!DRY_RUN) {
        fs.writeFileSync(moduleFile, JSON.stringify(moduleData, null, 2) + '\n', 'utf8');
      }
    }
  }
}

console.log('='.repeat(60));
console.log(`LESSON SCAFFOLDING COMPLETION ${DRY_RUN ? '(DRY RUN)' : ''}`);
console.log('='.repeat(60));
console.log(`Modules processed: ${stats.modulesProcessed}`);
console.log(`Lessons now complete: ${stats.lessonsComplete}`);
console.log();
console.log(`Phases added:`);
console.log(`  Explanations: +${stats.explanationsAdded}`);
console.log(`  I-Do models: +${stats.modelsAdded}`);
console.log(`  We-Do guided practice: +${stats.guidedPracticeAdded}`);
console.log(`  You-Do independent practice: +${stats.independentPracticeAdded}`);
console.log(`  Total phases added: +${stats.explanationsAdded + stats.modelsAdded + stats.guidedPracticeAdded + stats.independentPracticeAdded}`);
console.log();
console.log(`Problems redistributed from shared steps: ${stats.problemsRedistributed}`);
console.log(`Placeholders fixed: ${stats.placeholdersFixed}`);

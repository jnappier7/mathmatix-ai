#!/usr/bin/env node
/**
 * QA a course module's structure.
 *
 *   node scripts/qaModule.js <path-to-module.json>   # one module
 *   node scripts/qaModule.js --all                   # every module in every course
 *
 * WHAT THIS USED TO CHECK, AND WHY IT WAS REPLACED
 *
 * The original rule was "every lesson must have all four phases: explanation,
 * model, guided_practice, independent_practice." That is not how these modules
 * are built. 82 of 128 carry exactly ONE independent_practice — a mixed you-do
 * at the end covering the whole module — and only 5 have one per lesson. The
 * parent guides deliberately have none at all, because adult learners are not
 * assigned solo homework. So the check failed on essentially every module, which
 * made it useless: a signal that is always red tells you nothing, and it hid a
 * real defect for a long time (31 lessons that were practised but never taught).
 *
 * The rules below are the ones that are both TRUE of this codebase and worth
 * enforcing. Each maps to a way a student is actually let down:
 *
 *   orphan lessonId      the tutor is shown a "--- Lesson N ---" heading that
 *                        does not exist in the module's own lesson list
 *   never taught         a lesson is drilled with no explanation and no worked
 *                        examples anywhere — the tutor is told to practise
 *                        something the module never explains
 *   never practised      a lesson is explained and then never used
 *   unhandled step type  formatScaffoldStep has no case for it, so the step
 *                        renders as an empty teaching block
 *   missing answer key   a problem the checkpoint grader cannot mark
 *   missing problem id  a problem no answer key or progress record can name
 *   duplicate problem id two problems sharing one id, so they share an answer
 *                        key and a progress record
 *
 * Anything a module can legitimately choose is a WARNING, not a failure:
 * declared-but-unbuilt lessons, and modules with no independent practice.
 */

const fs = require('fs');
const path = require('path');

// The step types utils/coursePrompt.js formatScaffoldStep knows how to render.
const RENDERABLE_TYPES = new Set([
  'explanation', 'model', 'guided_practice', 'independent_practice',
]);

/**
 * Check one already-parsed module. Returns { failures, warnings, stats }.
 * Pure — no I/O — so tests can drive it over every module at once.
 */
function checkModule(md, label) {
  const failures = [];
  const warnings = [];
  const scaffold = md.scaffold || [];
  const isCheckpoint = md.type === 'assessment' || md.diagnosticMode;

  if (isCheckpoint) {
    const problems = md.assessmentProblems || [];
    if (!problems.length) failures.push('checkpoint has no assessmentProblems');
    problems.forEach((p) => {
      if (!p.question) failures.push(`assessment problem ${p.id || '?'} has no question`);
      if (!((md.answerKeys || {})[p.id] || p.answer)) {
        failures.push(`assessment problem ${p.id || '?'} has no answer key`);
      }
    });
    return { failures, warnings, stats: { checkpoint: true, problems: problems.length } };
  }

  if (!scaffold.length) {
    failures.push('module has no scaffold steps');
    return { failures, warnings, stats: {} };
  }

  const declared = new Set((md.lessons || []).map((l) => l.lessonId));
  const byLesson = new Map();
  for (const step of scaffold) {
    if (!RENDERABLE_TYPES.has(step.type)) {
      failures.push(`step "${step.title || '?'}" has unrenderable type "${step.type}"`);
    }
    if (!byLesson.has(step.lessonId)) byLesson.set(step.lessonId, []);
    byLesson.get(step.lessonId).push(step);
  }

  const moduleHasIndependent = scaffold.some((s) => s.type === 'independent_practice');

  for (const [lessonId, steps] of byLesson) {
    if (declared.size && !declared.has(lessonId)) {
      failures.push(`lesson "${lessonId}" is used by ${steps.length} step(s) but is not in lessons[]`);
    }
    const types = new Set(steps.map((s) => s.type));
    const taught = types.has('explanation') || types.has('model');
    const practised = types.has('guided_practice') || types.has('independent_practice');
    if (!taught) {
      failures.push(`lesson "${lessonId}" is never taught — no explanation and no model `
        + `(has: ${[...types].join(', ')})`);
    }
    if (!practised && !moduleHasIndependent) {
      failures.push(`lesson "${lessonId}" is never practised, and the module has no independent practice`);
    }
  }

  for (const lessonId of declared) {
    if (!byLesson.has(lessonId)) warnings.push(`lesson "${lessonId}" is declared but has no steps`);
  }
  if (!moduleHasIndependent) {
    warnings.push('module has no independent_practice step '
      + '(expected for the parent guides and review modules)');
  }

  // An answer has to be reachable by whichever code will read it. For a scaffold
  // problem that is utils/coursePrompt.js, which reads the problem's own answer
  // field (accepting `solution` / `explanation` as aliases). The module-level
  // answerKeys map is only consulted for CHECKPOINTS — see routes/checkpoint.js
  // — so requiring it here, as this script used to, failed every parent module
  // for problems that were perfectly well answered inline.
  const keys = md.answerKeys || {};
  let problems = 0;
  const seenIds = new Set();
  for (const step of scaffold) {
    for (const p of step.problems || []) {
      problems += 1;
      const answered = [p.answer, p.solution, p.explanation, p.id && keys[p.id]]
        .some((v) => v !== undefined && v !== null && v !== '');
      if (!answered) {
        failures.push(`problem "${p.id || (p.question || p.problem || '?').slice(0, 40)}" has no answer`);
      }
      // Every problem needs an id, and it must be unique within its module:
      // answerKeys is a flat map keyed by id and courseSession records attempts
      // by id, so a missing id can never be looked up and a shared one silently
      // shares an answer key and a progress record.
      if (!p.id) {
        failures.push(`problem "${(p.question || p.problem || '?').slice(0, 40)}" has no id`);
      } else {
        if (seenIds.has(p.id)) {
          failures.push(`problem id "${p.id}" is used more than once in this module`);
        }
        seenIds.add(p.id);
      }
    }
  }

  return {
    failures,
    warnings,
    stats: {
      steps: scaffold.length,
      lessons: byLesson.size,
      declared: declared.size,
      problems,
    },
  };
}

/** Every non-checkpoint and checkpoint module reachable from the pathway files. */
function allModulePaths(root) {
  const resources = path.join(root, 'public/resources');
  const out = [];
  for (const file of fs.readdirSync(resources).filter((f) => f.endsWith('-pathway.json'))) {
    const pathway = JSON.parse(fs.readFileSync(path.join(resources, file), 'utf8'));
    const courseId = pathway.courseId || file.replace('-pathway.json', '');
    for (const m of pathway.modules || []) {
      if (!m.moduleFile) continue;
      const p = path.join(root, 'public', m.moduleFile);
      if (fs.existsSync(p)) out.push({ courseId, moduleId: m.moduleId, file: p });
    }
  }
  return out;
}

function report(label, result) {
  const { failures, warnings, stats } = result;
  const head = failures.length ? 'FAIL' : 'ok  ';
  console.log(`${head} ${label}`
    + (stats.checkpoint ? `  (checkpoint, ${stats.problems} problems)`
      : `  ${stats.steps} steps, ${stats.lessons}/${stats.declared} lessons used, ${stats.problems} problems`));
  failures.forEach((f) => console.log(`       ✗ ${f}`));
  warnings.forEach((w) => console.log(`       · ${w}`));
  return failures.length;
}

if (require.main === module) {
  const arg = process.argv[2];
  const root = path.join(__dirname, '..');
  let bad = 0;
  if (arg === '--all') {
    const mods = allModulePaths(root);
    for (const { courseId, moduleId, file } of mods) {
      const md = JSON.parse(fs.readFileSync(file, 'utf8'));
      bad += report(`${courseId}/${moduleId}`, checkModule(md, `${courseId}/${moduleId}`)) ? 1 : 0;
    }
    console.log(`\n${mods.length} modules checked, ${bad} with failures`);
  } else if (arg) {
    const md = JSON.parse(fs.readFileSync(arg, 'utf8'));
    bad = report(path.basename(arg), checkModule(md, arg)) ? 1 : 0;
  } else {
    console.error('usage: node scripts/qaModule.js <module.json> | --all');
    process.exit(2);
  }
  process.exit(bad ? 1 : 0);
}

module.exports = { checkModule, allModulePaths, RENDERABLE_TYPES };

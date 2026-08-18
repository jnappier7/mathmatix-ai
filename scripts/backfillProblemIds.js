#!/usr/bin/env node
/**
 * Give every scaffold problem a stable id.
 *
 *   node scripts/backfillProblemIds.js            # dry run — report only
 *   node scripts/backfillProblemIds.js --write    # apply
 *
 * WHY THIS EXISTS
 *
 * 568 of 2,282 scaffold problems shipped with no `id`. Nothing broke, because
 * utils/coursePrompt.js renders scaffold problems by index and answerKeys is
 * only consulted for checkpoints — which is exactly why it went unnoticed. But
 * an id is how a problem gets named by anything outside its own step: an
 * answerKeys entry, a recorded attempt, a report. A problem without one cannot
 * be referred to at all.
 *
 * WHY THE IDS ARE GENERATED RATHER THAN RECOVERED
 *
 * Several modules carry answerKeys entries that look like they name these
 * problems. They don't, reliably: in the act-prep modules the keys name the
 * worked EXAMPLES, in the algebra-2 modules they are the literal question text,
 * and only 50 of the 568 problems could be matched to a key by comparing answer
 * values. A 9% partial mapping would leave two id conventions in one file and
 * risk silently pairing a problem with someone else's answer key, so every id
 * here is generated. The orphaned answerKeys entries are left alone.
 *
 * THE SCHEME
 *
 * Follows the convention already used by the ~1,700 problems that do have ids
 * (ia-wp14, ef-yp1, rg-wp1): <module-prefix>-<phase><n>, where phase is `wp`
 * for guided practice (we-do) and `yp` for independent practice (you-do).
 * Numbering runs across the whole module per phase, in scaffold order.
 *
 * Idempotent: a problem that already has an id is never touched, so re-running
 * is safe and a second run is a no-op.
 */
const fs = require('fs');
const path = require('path');
const { allModulePaths } = require(path.join(process.cwd(), 'scripts/qaModule.js'));

const DRY = !process.argv.includes('--write');

// Short prefix from the moduleId: initials of each underscore-separated word.
function prefixFor(moduleId) {
  const words = String(moduleId).split(/[_\-\s]+/).filter(Boolean);
  let p = words.map(w => w[0]).join('').toLowerCase();
  if (p.length < 2) p = String(moduleId).slice(0, 3).toLowerCase();
  return p.replace(/[^a-z0-9]/g, '');
}

const PHASE = { guided_practice: 'wp', independent_practice: 'yp' };

let touchedModules = 0;
let assigned = 0;
const report = [];

for (const { courseId, file } of allModulePaths(process.cwd())) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = JSON.parse(raw);
  const scaffold = m.scaffold || [];
  if (!scaffold.length) continue;

  const taken = new Set();
  for (const s of scaffold) for (const p of (s.problems || [])) if (p.id) taken.add(p.id);
  // Never reuse a name the module's answerKeys already means something by.
  const keyNames = new Set(Object.keys(m.answerKeys || {}));

  const prefix = prefixFor(m.moduleId || path.basename(file, '_module.json'));
  const counters = {};
  const added = [];

  for (const step of scaffold) {
    const phase = PHASE[step.type] || 'p';
    for (const p of (step.problems || [])) {
      if (p.id) continue;
      let id;
      do {
        counters[phase] = (counters[phase] || 0) + 1;
        id = `${prefix}-${phase}${counters[phase]}`;
      } while (taken.has(id) || keyNames.has(id));
      taken.add(id);
      // Put `id` first in the object so the JSON reads like every other problem.
      const rest = { ...p };
      for (const k of Object.keys(p)) delete p[k];
      p.id = id;
      Object.assign(p, rest);
      added.push(id);
      assigned += 1;
    }
  }

  if (!added.length) continue;
  touchedModules += 1;
  report.push(`${courseId}/${m.moduleId}: +${added.length}  (${added[0]} … ${added[added.length - 1]})`);
  if (!DRY) fs.writeFileSync(file, JSON.stringify(m, null, 2) + '\n');
}

for (const line of report) console.log(line);
console.log(`\n${DRY ? 'DRY RUN — ' : ''}${assigned} ids across ${touchedModules} modules`);

/**
 * Every course pathway must be walkable end to end.
 *
 * Progression is data-driven and fails SILENTLY when the data is the wrong
 * shape — there is no error, the student simply never advances:
 *
 *  - a CHECKPOINT module completes only when
 *    `attempted >= totalProblems && totalProblems > 0`
 *    (utils/pipeline/courseAdapter.js), where totalProblems reads
 *    `moduleData.assessmentProblems`. An empty array can never satisfy it, so
 *    the module — and the course — can never be finished.
 *  - a CONTENT module advances by walking `moduleData.scaffold[]`. With no
 *    scaffold, totalSteps falls back to 1 and isLastStep is true at index 0, so
 *    the module auto-completes on the first turn and the unit is skipped rather
 *    than taught.
 *
 * This fired once: geometry's `final_mastery_assessment` authored its 19
 * problems under `assessmentSections`, a key no code anywhere reads, leaving
 * `assessmentProblems` empty. Geometry could not be completed, with no error
 * logged. Nothing in the suite compared the authored shape to the shape the
 * runtime consumes, so the file looked finished.
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const RESOURCES = path.join(PUBLIC_DIR, 'resources');

const pathwayFiles = fs
  .readdirSync(RESOURCES)
  .filter((f) => f.endsWith('-pathway.json'))
  .sort();

/** Mirrors the runtime's classification exactly — see courseAdapter.js:132,
 *  courseChat.js:546, chat.js:1830, coursePrompt.js:80. */
function isCheckpoint(pathwayModule, moduleData) {
  return moduleData.type === 'assessment' ||
    !!moduleData.diagnosticMode ||
    !!pathwayModule.isCheckpoint;
}

function loadModules(pathwayFile) {
  const pathway = JSON.parse(fs.readFileSync(path.join(RESOURCES, pathwayFile), 'utf8'));
  return (pathway.modules || []).map((m) => {
    if (!m.moduleFile) return { pathwayModule: m, moduleData: null, abs: null };
    const abs = path.join(PUBLIC_DIR, m.moduleFile.replace(/^\//, ''));
    if (!fs.existsSync(abs)) return { pathwayModule: m, moduleData: null, abs };
    return { pathwayModule: m, moduleData: JSON.parse(fs.readFileSync(abs, 'utf8')), abs };
  });
}

describe('course pathway integrity', () => {
  it('ships at least one pathway to check', () => {
    expect(pathwayFiles.length).toBeGreaterThan(0);
  });

  describe.each(pathwayFiles)('%s', (pathwayFile) => {
    const modules = loadModules(pathwayFile);

    it('declares a moduleFile for every module, and every one exists on disk', () => {
      const broken = modules
        .filter((m) => m.moduleData === null)
        .map((m) => `${m.pathwayModule.moduleId}: ${m.abs ? 'missing on disk' : 'no moduleFile'}`);
      expect(broken).toEqual([]);
    });

    it('gives every checkpoint a non-empty assessmentProblems[] the runtime can read', () => {
      const unfinishable = modules
        .filter((m) => m.moduleData && isCheckpoint(m.pathwayModule, m.moduleData))
        .filter((m) => !(m.moduleData.assessmentProblems || []).length)
        .map((m) => {
          // Point at the likely cause rather than just naming the module.
          const stranded = (m.moduleData.assessmentSections || [])
            .reduce((n, s) => n + (s.problems || s.items || []).length, 0);
          return stranded
            ? `${m.pathwayModule.moduleId} (${stranded} problems stranded in assessmentSections)`
            : m.pathwayModule.moduleId;
        });
      expect(unfinishable).toEqual([]);
    });

    it('makes every checkpoint problem gradeable', () => {
      const ungradeable = [];
      for (const { pathwayModule, moduleData } of modules) {
        if (!moduleData || !isCheckpoint(pathwayModule, moduleData)) continue;
        const keys = moduleData.answerKeys || {};
        for (const p of moduleData.assessmentProblems || []) {
          if (p.answer === undefined && keys[p.id] === undefined) {
            ungradeable.push(`${pathwayModule.moduleId}/${p.id}`);
          }
        }
      }
      expect(ungradeable).toEqual([]);
    });

    it('gives every content module a scaffold[] so it is taught, not skipped', () => {
      const skipped = modules
        .filter((m) => m.moduleData && !isCheckpoint(m.pathwayModule, m.moduleData))
        .filter((m) => !(m.moduleData.scaffold || []).length)
        .map((m) => m.pathwayModule.moduleId);
      expect(skipped).toEqual([]);
    });
  });
});

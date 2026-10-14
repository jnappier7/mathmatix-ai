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

/**
 * Parent guides (audience: 'parent') are played by a different prompt branch —
 * utils/coursePrompt.js buildParentCoursePrompt + formatParentScaffoldStep —
 * which reads its own set of fields. A guide authored with a student-course
 * shape (step.content instead of step.text, a step type the parent formatter
 * has no case for, a lessonPhase the pathway never declares) renders as an
 * empty or generic step with no error. Pin the shape the parent player reads.
 */
describe('parent guide pathways', () => {
  const parentFiles = pathwayFiles.filter((f) => {
    const p = JSON.parse(fs.readFileSync(path.join(RESOURCES, f), 'utf8'));
    return p.audience === 'parent';
  });
  const PARENT_STEP_TYPES = ['explanation', 'model', 'guided_practice', 'independent_practice'];
  const catalogSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'courseSession.js'), 'utf8');

  it('ships every parent guide, K–2 through test prep', () => {
    expect(parentFiles).toEqual(expect.arrayContaining([
      'parent-math-k2-pathway.json', 'parent-math-35-pathway.json', 'parent-math-68-pathway.json',
      'parent-math-910-pathway.json', 'parent-test-prep-pathway.json',
    ]));
  });

  describe.each(parentFiles)('%s', (file) => {
    const pathway = JSON.parse(fs.readFileSync(path.join(RESOURCES, file), 'utf8'));
    const modules = loadModules(file);
    const phases = ((pathway.aiInstructionModel || {}).phases || []).map((p) => p.phase);

    it('is named for its courseId (enroll and courseChat load `${courseId}-pathway.json`)', () => {
      expect(file).toBe(`${pathway.courseId}-pathway.json`);
    });

    it('carries the top-level fields the catalog and the parent prompt read', () => {
      expect(pathway.courseType).toBe('mini-course');
      for (const k of ['courseId', 'track', 'overview', 'aiGuidanceNotes']) {
        expect(typeof pathway[k]).toBe('string');
        expect(pathway[k].trim()).not.toBe('');
      }
      expect(Array.isArray(pathway.naturalProgression)).toBe(true);
      expect(phases.length).toBeGreaterThan(0);
      for (const p of pathway.aiInstructionModel.phases) expect(typeof p.aiRole).toBe('string');
      expect((pathway.aiInstructionModel.aiDecisionRights || []).length).toBeGreaterThan(0);
      expect(pathway.modules.length).toBeGreaterThan(0);
    });

    it('is listed in the catalog under "Parent Guides"', () => {
      const row = new RegExp(`'${pathway.courseId}':\\s*\\{[^}]*group: 'Parent Guides'[^}]*sortOrder: \\d+`);
      expect(catalogSrc).toMatch(row);
    });

    it('gives every pathway module the fields the sidebar and prompt read', () => {
      const ids = new Set();
      pathway.modules.forEach((m, i) => {
        expect(ids.has(m.moduleId)).toBe(false);
        ids.add(m.moduleId);
        expect(m.unit).toBe(i + 1);
        for (const k of ['moduleId', 'title', 'preview', 'moduleFile']) expect(typeof m[k]).toBe('string');
        expect(m.moduleFile).toMatch(/^\/modules\/[a-z0-9-]+\/[a-z0-9_]+_module\.json$/);
        expect((m.essentialQuestions || []).length).toBeGreaterThan(0);
        expect((m.lessons || []).length).toBeGreaterThan(0);
      });
    });

    it('module files parse and match their pathway entry', () => {
      for (const { pathwayModule, moduleData } of modules) {
        expect(moduleData).not.toBeNull();
        expect(moduleData.moduleId).toBe(pathwayModule.moduleId);
        expect(moduleData.course).toBe(pathway.track);
        expect(moduleData.unit).toBe(pathwayModule.unit);
        expect(moduleData.title).toBe(pathwayModule.title);
        expect(typeof moduleData.description).toBe('string');
        expect((moduleData.goals || []).length).toBeGreaterThan(0);
        expect((moduleData.instructionalStrategy || []).length).toBeGreaterThan(0);
        expect(Array.isArray(moduleData.skills)).toBe(true);
      }
    });

    it('every scaffold step is a shape formatParentScaffoldStep renders', () => {
      const bad = [];
      for (const { pathwayModule, moduleData } of modules) {
        (moduleData.scaffold || []).forEach((step, i) => {
          const at = `${pathwayModule.moduleId}[${i}]`;
          if (!PARENT_STEP_TYPES.includes(step.type)) bad.push(`${at}: type ${step.type}`);
          if (!phases.includes(step.lessonPhase)) bad.push(`${at}: lessonPhase ${step.lessonPhase} not in pathway phases`);
          if (!step.title) bad.push(`${at}: no title`);
          if (!step.initialPrompt) bad.push(`${at}: no initialPrompt`);
          if (step.type === 'explanation' && !String(step.text || '').trim()) bad.push(`${at}: explanation without text`);
          if (step.type === 'model') {
            const ex = step.examples || [];
            if (!ex.length) bad.push(`${at}: model without examples`);
            ex.forEach((e, j) => { if (!e.problem || !e.solution) bad.push(`${at}.examples[${j}]: needs problem + solution`); });
          }
          if (step.type === 'guided_practice' || step.type === 'independent_practice') {
            const ps = step.problems || [];
            if (!ps.length) bad.push(`${at}: practice without problems`);
            ps.forEach((p, j) => { if (!p.question || !p.answer) bad.push(`${at}.problems[${j}]: needs question + answer`); });
          }
        });
      }
      expect(bad).toEqual([]);
    });
  });
});

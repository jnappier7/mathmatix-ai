/**
 * Course progression wiring (owner report, 2026-07-29: "a student never
 * really progresses, restarting every session").
 *
 * The break was a three-part standoff:
 *   1. routes/chat.js instructed the model to emit <SCAFFOLD_ADVANCE> per turn,
 *   2. verify stripped the tag from the reply (comment: "deprecated — backend
 *      evaluator now owns progression"),
 *   3. chat.js regex-tested the ALREADY-STRIPPED text for the tag, and the
 *      "backend evaluator" only runs on /api/course-chat — never on /api/chat,
 *      the live path chat.html uses.
 * Net: currentScaffoldIndex stayed 0 forever, so overallProgress stayed 0%,
 * modules never completed/unlocked, and the greeting's isFirstLesson check
 * (index 0 && progress 0) welcomed the student to "their FIRST lesson" every
 * single session.
 *
 * Same failure class LAUNCH_PRACTICE_ACT already solved: extract at the shared
 * verify choke point, surface through pipelineResult, act in the route.
 */
const { verify } = require('../../utils/pipeline/verify');
const fs = require('fs');
const path = require('path');

describe('verify extracts course progression tags (and strips them from the student text)', () => {
  test('<SCAFFOLD_ADVANCE> → extracted.scaffoldAdvance, text clean', async () => {
    const v = await verify('That is exactly right! <SCAFFOLD_ADVANCE>', {});
    expect(v.extracted.scaffoldAdvance).toBe(true);
    expect(v.text).not.toMatch(/SCAFFOLD_ADVANCE/);
  });
  test('<MODULE_COMPLETE> → extracted.moduleComplete, text clean', async () => {
    const v = await verify('Module done — amazing work. <MODULE_COMPLETE>', {});
    expect(v.extracted.moduleComplete).toBe(true);
    expect(v.text).not.toMatch(/MODULE_COMPLETE/);
  });
  test('no tag → no flags', async () => {
    const v = await verify('Keep going, one more step.', {});
    expect(v.extracted.scaffoldAdvance).toBeFalsy();
    expect(v.extracted.moduleComplete).toBeFalsy();
  });
});

describe('the flags travel the whole wire (source pins on both ends)', () => {
  test('pipelineResult surfaces the extracted flags', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../utils/pipeline/index.js'), 'utf8');
    expect(src).toContain("scaffoldAdvance: verified.extracted?.scaffoldAdvance || false");
    expect(src).toContain("moduleComplete: verified.extracted?.moduleComplete || false");
  });
  test('routes/chat.js reads the FLAGS, never the stripped text', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../routes/chat.js'), 'utf8');
    expect(src).toContain('pipelineResult.scaffoldAdvance === true');
    expect(src).toContain('pipelineResult.moduleComplete === true');
    // The dead pattern must never come back: regex-testing pipelineResult.text
    // for a tag that verify already removed.
    expect(src).not.toMatch(/SCAFFOLD_ADVANCE[^\n]*\.test\(pipelineResult\.text\)/);
  });
});

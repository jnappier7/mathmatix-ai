/**
 * PRACTICE PACK SKILL TARGETING — the pack must be about the skill the
 * student was just working on.
 *
 * Owner-hit (2026-09-09): a free-chat session on adding fractions and
 * one-step equations produced a 16-problem ACT GEOMETRY pack. The cause was a
 * silently missing key, not bad selection logic:
 *
 *   runPipeline()'s return object never declared `activeSkillId`
 *     → routes/chat.js `pipelineResult.activeSkillId` was undefined
 *     → `currentSkillId` reached the client as null on EVERY free-chat turn
 *     → the in-chat "Print Practice Pack" nudge omitted `skillId`
 *     → selectProblemsForPack fell through to the active COURSE module.
 *
 * Nothing threw and nothing logged — the pack just quietly described a
 * different student. These are source-contract tests (same idiom as
 * practicePackHelpers.test.js) because the failure mode is an absent
 * property, which no behavioural mock will notice.
 */

const fs = require('fs');

const pipelineSrc = fs.readFileSync(require.resolve('../../utils/pipeline/index.js'), 'utf8');
const chatSrc = fs.readFileSync(require.resolve('../../routes/chat.js'), 'utf8');
const packSrc = fs.readFileSync(require.resolve('../../routes/practicePack.js'), 'utf8');
const clientSrc = fs.readFileSync(require.resolve('../../public/js/script.js'), 'utf8');

// The pipeline's public return object, isolated from the ~1900 lines above it
// (`activeSkillId` also appears earlier as an INPUT to resolveCurrentTarget and
// resolveTestOutSkillId — those are not what chat.js reads).
const returnBlock = pipelineSrc.slice(pipelineSrc.indexOf('// ── Return everything chat.js needs ──'));

describe('the skill in focus survives the pipeline boundary', () => {
  test('runPipeline RETURNS activeSkillId, not just consumes it', () => {
    expect(returnBlock.length).toBeGreaterThan(0);
    expect(returnBlock).toMatch(/^\s*activeSkillId:/m);
  });

  test('it falls back to the tutor plan target, matching how BKT/FSRS credit is attributed', () => {
    // ctx.activeSkill is null in all free chat — a bare `ctx.activeSkill?.skillId`
    // reintroduces the bug for exactly the sessions that need it.
    expect(returnBlock).toMatch(
      /activeSkillId:\s*ctx\.activeSkill\?\.skillId\s*\|\|\s*tutorPlan\?\.currentTarget\?\.skillId/
    );
  });

  test('and then to the most-recently-worked in-progress skill, like engineSkillId does', () => {
    // currentTarget goes transiently null after a mastery read (tutorPlanManager
    // clears it and no-skill turns don't re-set it). The evidence layer already
    // bridges that with recentPracticeSkillId; the returned key must too, or the
    // pack falls back to the stale mastery frontier on exactly those turns.
    expect(returnBlock).toMatch(
      /activeSkillId:[^\n]*\|\|\s*recentPracticeSkillId\(tutorPlan\)/
    );
  });

  test('chat.js forwards it to the client as currentSkillId', () => {
    expect(chatSrc).toMatch(/currentSkillId:\s*pipelineResult\.activeSkillId/);
  });

  test('the in-chat nudge forwards currentSkillId as skillId', () => {
    expect(clientSrc).toContain("params.set('skillId', currentSkillId)");
  });
});

describe('server-side fallback (a stale client must not print the wrong pack)', () => {
  test('selectProblemsForPack consults the tutor plan target before the mastery frontier', () => {
    expect(packSrc).toContain('const planTarget = await currentTutorPlanTarget(user);');
    const planIdx = packSrc.indexOf('const planTarget = await currentTutorPlanTarget(user);');
    const frontierIdx = packSrc.indexOf('// Auto-select from student\'s learning frontier');
    expect(planIdx).toBeGreaterThan(-1);
    expect(frontierIdx).toBeGreaterThan(-1);
    expect(planIdx).toBeLessThan(frontierIdx);
  });

  test('the course-module branch still wins over the plan target (2026-07-28 fix intact)', () => {
    const courseIdx = packSrc.indexOf('const courseSkills = await activeCourseModuleSkills(user);');
    const planIdx = packSrc.indexOf('const planTarget = await currentTutorPlanTarget(user);');
    expect(courseIdx).toBeGreaterThan(-1);
    expect(courseIdx).toBeLessThan(planIdx);
  });

  test('an explicit skillId still beats everything', () => {
    expect(packSrc).toMatch(/if \(skillId\) \{[\s\S]{0,120}targetSkills = \[skillId\];/);
  });

  test('printing a worksheet never MINTS a tutor plan', () => {
    // loadOrCreatePlan writes. A read-only lookup only. (Strip comments first —
    // the helper's own docblock names loadOrCreatePlan to explain the ban.)
    const code = packSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('loadOrCreatePlan');
    expect(packSrc).toMatch(/TutorPlan\.findOne\(\{ userId: user\._id \}\)/);
  });

  test('the lookup failing degrades to null rather than 500-ing the download', () => {
    const fn = packSrc.slice(
      packSrc.indexOf('async function currentTutorPlanTarget'),
      packSrc.indexOf('async function selectProblemsForPack')
    );
    expect(fn).toContain('catch');
    expect(fn).toMatch(/return null;/);
  });
});

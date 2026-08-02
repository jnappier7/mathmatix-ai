/**
 * Regression: level-appropriate scaffolding for RETURNING students.
 *
 * Production transcript (2026-07-26): a student said "Let's keep working on
 * Absolute Value" — a skill with prior recorded attempts — and the tutor
 * restarted the full gradual-release sequence from the vocabulary phase
 * ("Let's build this from the ground up!"). The student: "why we starting
 * over?". After five first-try-correct answers the tutor was still demanding
 * "walk me through how you arrived at that."
 *
 * Root causes pinned here:
 *  1. familiarityToMode mapped 'introduced' (>= 1 attempt) to 'instruct',
 *     identical to 'never-seen' (covered in tutorPlanModel.test.js).
 *  2. The plan layer asserted "They have NEVER seen it before" as fact with
 *     no prior-progress counterweight in the prompt.
 *  3. Streak counters ran over raw assistant messages, so unstamped probing
 *     turns evicted real wins from the window — the more the tutor probed,
 *     the less streak evidence it had to stop probing.
 *  4. "why we starting over?" matched no back-off pattern.
 *  5. buildSkillMasteryContext silently dropped 'practicing' /
 *     'needs-review' / 're-fragile' skills from the prompt.
 */

const { buildModeDirective } = require('../../utils/promptPlanLayer');
const { observe } = require('../../utils/pipeline/observe');
const { buildSkillMasteryContext } = require('../../utils/promptCompact');
const { resolveSkill } = require('../../utils/skillFamiliarityResolver');

describe('promptPlanLayer.buildModeDirective — never lies about prior work', () => {
  const target = { skillId: 'absolute-value', displayName: 'Absolute Value', instructionalMode: 'instruct', instructionPhase: 'vocabulary' };

  it('still calls a genuinely never-seen skill novel', () => {
    const out = buildModeDirective(target, { familiarity: 'never-seen', priorEvidence: null });
    expect(out).toContain('NEVER seen it before');
  });

  it('does NOT assert "never seen" when the record shows prior attempts', () => {
    const out = buildModeDirective(target, {
      familiarity: 'introduced',
      priorEvidence: { totalAttempts: 9, scorePct: 62, status: 'practicing' },
    });
    expect(out).not.toContain('NEVER seen it before');
    expect(out).toContain('PRIOR PROGRESS ON THIS SKILL: 9 recorded attempts');
    expect(out).toContain('~62% mastery score');
  });

  it('guide mode carries the prior-progress facts and a no-restart directive', () => {
    const guideTarget = { ...target, instructionalMode: 'guide', instructionPhase: null };
    const out = buildModeDirective(guideTarget, {
      familiarity: 'introduced',
      priorEvidence: { totalAttempts: 4, scorePct: null, status: 'practicing' },
    });
    expect(out).toContain('PRIOR PROGRESS ON THIS SKILL: 4 recorded attempts');
    expect(out).toContain('do NOT re-introduce vocabulary');
  });
});

describe('observe — streaks survive probing turns', () => {
  it('counts problem outcomes from recentProblemResults, not raw messages', () => {
    // Five wins whose stamps are interleaved with 5 unstamped probing turns.
    // Under the old last-6-messages window only ~3 stamps were visible.
    const obs = observe('7', {
      recentUserMessages: [{ content: '5' }, { content: '7' }],
      recentAssistantMessages: [
        { content: 'walk me through that?' },          // probing, unstamped
        { content: 'right!', problemResult: 'correct' },
        { content: 'why does that work?' },            // probing, unstamped
        { content: 'yes!', problemResult: 'correct' },
        { content: 'can you explain?' },               // probing, unstamped
        { content: 'correct again', problemResult: 'correct' },
      ],
      recentProblemResults: ['correct', 'correct', 'correct', 'correct', 'correct'],
    });
    expect(obs.streaks.recentCorrectCount).toBe(5);
    expect(obs.streaks.recentWrongCount).toBe(0);
  });

  it('falls back to stamped messages when recentProblemResults is absent', () => {
    const obs = observe('7', {
      recentUserMessages: [],
      recentAssistantMessages: [
        { content: 'probe' },
        { content: 'right', problemResult: 'correct' },
        { content: 'probe again' },
        { content: 'right', problemResult: 'correct' },
      ],
    });
    expect(obs.streaks.recentCorrectCount).toBe(2);
    expect(obs.streaks.recentWrongCount).toBe(0);
  });

  it('still counts wrongs inside the outcome window', () => {
    const obs = observe('7', {
      recentUserMessages: [],
      recentAssistantMessages: [],
      recentProblemResults: ['correct', 'incorrect', 'correct'],
    });
    expect(obs.streaks.recentWrongCount).toBe(1);
    expect(obs.streaks.recentCorrectCount).toBe(2);
  });
});

describe('observe — "why we starting over?" is a back-off signal', () => {
  const ctx = { recentUserMessages: [], recentAssistantMessages: [] };

  it.each([
    'why we starting over?',
    'why are we starting over',
    'why are you starting over?',
    'we already did this',
    'we did this already',
    'we learned this before',
    'we went over this last time',
  ])('matches: %s', (msg) => {
    expect(observe(msg, ctx).assertsCompetence).toBe(true);
  });

  it.each([
    'can we start over?',          // a REQUEST to restart, not a complaint
    'I want to start over',
    'lets do this',
  ])('does not match: %s', (msg) => {
    expect(observe(msg, ctx).assertsCompetence).toBe(false);
  });
});

describe('promptCompact.buildSkillMasteryContext — no silent status drops', () => {
  it('surfaces practicing / needs-review / re-fragile skills', () => {
    const userProfile = {
      skillMastery: new Map([
        ['absolute-value', { status: 'practicing', totalAttempts: 9 }],
        ['integer-operations', { status: 'needs-review' }],
        ['order-of-operations', { status: 're-fragile' }],
        ['fractions', { status: 'mastered', masteredDate: new Date('2026-05-01') }],
      ]),
    };
    const out = buildSkillMasteryContext(userProfile);
    expect(out).toContain('Absolute Value (9 attempts)');
    expect(out).toContain('RESUME, never restart from scratch');
    // Names now come from the label catalog rather than from the Map key, so a
    // legacy id that crosswalks to a unified skill reads as its student-facing
    // label: 'integer-operations' -> MS.QNT.8 -> 'Math with negatives and
    // fractions'. An id with no catalog entry still prettifies from the key.
    expect(out).toContain('Math with negatives and fractions');
    expect(out).toContain('Order Of Operations');
    expect(out).toContain('now fragile');
    expect(out).toContain('Fractions');
  });
});

describe('skillFamiliarityResolver.resolveSkill — exposes prior evidence', () => {
  it('returns priorEvidence with attempts and normalized score', async () => {
    const skillCache = {
      'absolute-value': { skillId: 'absolute-value', displayName: 'Absolute Value', prerequisites: [] },
    };
    const mastery = new Map([
      ['absolute-value', { status: 'practicing', masteryScore: 0.62, totalAttempts: 9 }],
    ]);
    const res = await resolveSkill('absolute-value', mastery, { skillCache });
    expect(res.familiarity).toBe('developing');
    expect(res.instructionalMode).toBe('guide');
    expect(res.priorEvidence).toEqual({ totalAttempts: 9, scorePct: 62, status: 'practicing' });
  });

  it('an introduced skill (1-2 attempts) resolves to guide, not instruct', async () => {
    const skillCache = {
      'absolute-value': { skillId: 'absolute-value', displayName: 'Absolute Value', prerequisites: [] },
    };
    const mastery = new Map([
      ['absolute-value', { status: 'learning', masteryScore: 30, totalAttempts: 1 }],
    ]);
    const res = await resolveSkill('absolute-value', mastery, { skillCache });
    expect(res.familiarity).toBe('introduced');
    expect(res.instructionalMode).toBe('guide');
  });

  it('never-seen still resolves to instruct', async () => {
    const skillCache = {
      'new-skill': { skillId: 'new-skill', displayName: 'New Skill', prerequisites: [] },
    };
    const res = await resolveSkill('new-skill', new Map(), { skillCache });
    expect(res.familiarity).toBe('never-seen');
    expect(res.instructionalMode).toBe('instruct');
    expect(res.priorEvidence).toBeNull();
  });
});

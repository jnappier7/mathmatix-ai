/**
 * Asset-based open — the tutor must NOT lead with a diagnosed weakness.
 *
 * Regression: with error-pattern / tutor-note context in the prompt, the tutor
 * opened sessions by reciting a deficit ("looking at that last set of notes, I
 * spotted the pattern in what's tripping you up") before the student had done
 * anything — then the student aced every problem. Deficit framing is demoralizing
 * and evidence-free at session start.
 */

const { generateSystemPrompt } = require('../../utils/promptCompact');
const { buildPlanLayer } = require('../../utils/promptPlanLayer');

const user = {
  firstName: 'Jason',
  lastName: 'N',
  gradeLevel: '7',
  mathCourse: 'Pre-Algebra',
  tonePreference: 'warm',
};
const tutor = { name: 'Mr. Nappier', catchphrase: 'See the patterns', personality: 'Warm and direct.' };

// errorPatterns is the 13th positional arg to generateSystemPrompt.
function buildPrompt(errorPatterns) {
  return generateSystemPrompt(
    user, tutor, null, 'student',
    null, null, null, [], null, null, null, null, errorPatterns, null,
    null, null, null
  );
}

describe('asset-based open — no deficit cold open', () => {
  test('identity section forbids opening by diagnosing a weakness', () => {
    const prompt = buildPrompt(null);
    expect(prompt).toMatch(/never open by diagnosing a weakness/i);
  });

  test('error-pattern context is framed as private, not an opener', () => {
    const errorPatterns = {
      totalErrors: 12,
      sessionsAnalyzed: 4,
      patterns: { 'regrouping': 7, 'sign-errors': 5 },
    };
    const prompt = buildPrompt(errorPatterns);
    // The data still reaches the model...
    expect(prompt).toContain('regrouping');
    // ...but explicitly gated against a deficit open.
    expect(prompt).toMatch(/PRIVATE CONTEXT, NOT AN OPENER/i);
    expect(prompt).toMatch(/never open the session with it/i);
    expect(prompt).toMatch(/tripping them up/i); // named as a thing NOT to say
    // The old un-gated instruction is gone.
    expect(prompt).not.toMatch(/Mention naturally when relevant\./);
  });

  test('tutor notes are marked private and must not be narrated as a weakness', () => {
    const plan = {
      currentTarget: null,
      tutorNotes: [
        { content: 'Tends to drop the negative sign when subtracting.', category: 'misconception', createdAt: 2, supersededAt: null },
      ],
    };
    const layer = buildPlanLayer(plan);
    expect(layer).toMatch(/TUTOR NOTES \(PRIVATE/i);
    expect(layer).toMatch(/do not open the session by narrating them/i);
    expect(layer).toMatch(/lead with what the student can already do/i);
  });
});

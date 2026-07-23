/**
 * Order-of-operations mnemonic must be non-coercive.
 *
 * Regression: the teacher-settings block emitted "use PEMDAS (not other
 * mnemonics). This is the class standard — use it consistently.", so with a
 * PEMDAS-seeded account the tutor interrupted a student's flawless GEMS
 * teach-back to make them switch. Policy: GEMS preferred, PEMDAS/BODMAS also
 * valid, and the tutor follows the student's lead — never overrides a correct
 * mnemonic.
 */

const { generateSystemPrompt } = require('../../utils/promptCompact');

const user = {
  firstName: 'Jason',
  lastName: 'N',
  gradeLevel: '7',
  mathCourse: 'Pre-Algebra',
  tonePreference: 'warm',
};
const tutor = { name: 'Mr. Nappier' };

// teacherAISettings is the 11th positional arg.
function buildPrompt(teacherAISettings) {
  return generateSystemPrompt(
    user, tutor, null, 'student',
    null, null, null, [], null, null, teacherAISettings, null, null, null,
    null, null, null
  );
}

describe('order-of-operations mnemonic — non-coercive teacher setting', () => {
  const pemdasSettings = { vocabularyPreferences: { orderOfOperations: 'PEMDAS' } };

  test('a teacher mnemonic setting does NOT command overriding the student', () => {
    const prompt = buildPrompt(pemdasSettings);
    // The setting still surfaces...
    expect(prompt).toContain('PEMDAS');
    // ...but framed as the tutor's own preference + follow-the-student's-lead.
    expect(prompt).toMatch(/follow their lead/i);
    expect(prompt).toMatch(/never correct, override, or interrupt/i);
    // The old coercive phrasings are gone.
    expect(prompt).not.toContain('not other mnemonics');
    expect(prompt).not.toMatch(/class standard\s*—\s*use it consistently/i);
  });

  test('no teacher settings → no mnemonic command block', () => {
    const prompt = buildPrompt(null);
    expect(prompt).not.toContain('Order-of-operations mnemonic:');
  });
});

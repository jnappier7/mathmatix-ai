/**
 * Active worksheet injection — the uploaded doc the student is working
 * from must be pinned into the system prompt at FULL length every turn,
 * so the tutor never "forgets" later problems and asks the student to
 * re-type them ("#3 on the quiz" → "what does it say?").
 *
 * Regression for the screenshot bug: Maya read Q1/Q2 off an uploaded
 * quiz, then by Q3 had lost the doc and asked the student to re-share.
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

// Positional signature: the worksheet is the LAST argument.
function buildPrompt(activeWorksheet, studentMessage = 'number 3') {
  return generateSystemPrompt(
    user, tutor, null, 'student',
    null, null, null, [], null, null, null, null, null, null,
    studentMessage, null, activeWorksheet
  );
}

describe('active worksheet — system prompt injection', () => {
  const worksheet = {
    filename: 'quiz.pdf',
    text: '1) 2/5 x 3/8\n2) 6/21 x 14/15\n3) 3 1/2 x 2 2/7\n4) 5/6 x 9/10',
  };

  test('renders the ACTIVE WORKSHEET block with full text', () => {
    const prompt = buildPrompt(worksheet);
    expect(prompt).toContain('ACTIVE WORKSHEET');
    expect(prompt).toContain('quiz.pdf');
    // Every problem, including the later ones that used to fall off the
    // 1500-char excerpt, must be present.
    expect(prompt).toContain('3 1/2 x 2 2/7');
    expect(prompt).toContain('5/6 x 9/10');
  });

  test('includes the "never ask them to re-type" instruction', () => {
    const prompt = buildPrompt(worksheet);
    expect(prompt).toContain('NEVER ask');
    expect(prompt).toMatch(/refer to problems by their number/i);
  });

  test('is absent when there is no active worksheet', () => {
    expect(buildPrompt(null)).not.toContain('ACTIVE WORKSHEET');
  });

  test('is absent when the worksheet has no text', () => {
    expect(buildPrompt({ filename: 'empty.pdf', text: '' })).not.toContain('ACTIVE WORKSHEET');
  });

  test('tolerates a missing filename', () => {
    const prompt = buildPrompt({ text: '1) 2+2' });
    expect(prompt).toContain('ACTIVE WORKSHEET');
    expect(prompt).toContain('uploaded file');
  });
});

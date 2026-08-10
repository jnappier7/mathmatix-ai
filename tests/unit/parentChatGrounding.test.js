/**
 * The conference prompt's anti-hallucination rules must bind claims about the
 * child WITHOUT forbidding the tutor from teaching math.
 *
 * The original rule 1 read "ONLY discuss topics, performance, and struggles
 * that appear in the SESSION DATA above", and rule 4 told the tutor to deflect
 * anything not in the data. But "Teach Me" is one of seven quick-question
 * buttons sitting under the input, and SPECIAL REQUESTS tells the tutor to
 * explain the concept with simple examples and analogies — none of which are
 * in the session data. A literal reading of the rules refuses the feature.
 *
 * The rules exist to stop the tutor inventing PROGRESS ("Ana's been crushing
 * quadratics") for a child it has no data on. That intent is worth keeping
 * exactly as strict as it was; the scope is what needed fixing.
 */

const { generateParentTeacherPrompt } = require('../../routes/chat');

const tutor = { name: 'Bob', personality: 'warm and patient' };

function build({ child = {}, sessions = [] } = {}) {
  return generateParentTeacherPrompt(
    { firstName: 'Ana', gradeLevel: '7', mathCourse: 'Pre-Algebra', ...child },
    sessions,
    null,
    { firstName: 'Elena' },
    tutor
  );
}

describe('parent-teacher prompt — grounding rules', () => {
  test('scopes the rules to claims about the child, not to content', () => {
    const prompt = build();
    expect(prompt).toMatch(/CRITICAL RULES — WHAT YOU MAY CLAIM ABOUT Ana/);
    expect(prompt).toMatch(/These rules govern statements ABOUT Ana/);
  });

  test('still requires every claim about the child to be grounded', () => {
    const prompt = build();
    expect(prompt).toMatch(/Every claim about Ana's topics, performance, or struggles must be grounded in the SESSION DATA/);
    expect(prompt).toMatch(/DO NOT invent or assume topics the student worked on/);
    expect(prompt).toMatch(/DO NOT make up generic claims about "algebra" or "geometry"/);
  });

  test('explicitly permits teaching a topic the child has not worked on', () => {
    // The contradiction this replaced: the Teach Me button asks for exactly this.
    const prompt = build();
    expect(prompt).toMatch(/They do NOT restrict teaching math itself/);
    expect(prompt).toMatch(/You may still teach that topic if they want to understand it/);
  });

  test('separates "has Ana done this" from "explain this to me"', () => {
    const prompt = build();
    // The deflection is scoped to what the child has DONE, and carries the
    // caveat that teaching is still on the table.
    expect(prompt).toMatch(/asks what Ana has DONE with a topic that isn't in the data/);
    expect(prompt).toMatch(/just don't claim Ana has worked on it/);
  });

  test('keeps the missing-statistics guard, which is about a different failure', () => {
    // Absent stats mean tracking missed them, not that the child slacked off.
    expect(build()).toMatch(/NEVER interpret missing problem statistics as a lack of effort/);
  });

  test('still tells the tutor to be honest when there is no data at all', () => {
    const prompt = build();
    expect(prompt).toContain('No session data available yet.');
    expect(prompt).toMatch(/Ana and I haven't had many sessions yet/);
  });

  test('the SPECIAL REQUESTS teaching flow the rules now allow is still present', () => {
    expect(build()).toMatch(/If parent asks to "teach me" or "explain the concept"/);
  });
});

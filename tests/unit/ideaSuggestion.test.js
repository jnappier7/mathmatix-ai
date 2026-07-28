/**
 * Tutor-offered notebook ideas (spec §7.6): tag extraction + save validation.
 *
 * The contract: the tutor OFFERS via <NOTEBOOK_IDEA>, the student consents via
 * POST /api/notebook. One offer per turn; every tag is stripped from the
 * student-visible text; the create endpoint only mints student-initiated kinds.
 */
const { verify } = require('../../utils/pipeline/verify');
const notebookRouter = require('../../routes/notebook');
const { sanitizeCardInput } = notebookRouter.__helpers;

// verify() is the pipeline stage; extractSystemTags is internal, so exercise
// it through verify's public surface: verify(responseText, context).
async function runVerify(text) {
  return verify(text, {});
}

describe('NOTEBOOK_IDEA extraction', () => {
  test('a titled offer extracts and strips clean', async () => {
    const v = await runVerify('Nice work! <NOTEBOOK_IDEA title="Balance rule">Whatever you do to one side, do to the other.</NOTEBOOK_IDEA> Ready for the next one?');
    expect(v.extracted.ideaSuggestion).toEqual({
      title: 'Balance rule',
      body: 'Whatever you do to one side, do to the other.',
    });
    expect(v.text).not.toContain('NOTEBOOK_IDEA');
    expect(v.text).toContain('Nice work!');
    expect(v.text).toContain('Ready for the next one?');
  });

  test('missing title falls back to the body head; empty body yields nothing', async () => {
    const v = await runVerify('<NOTEBOOK_IDEA>Parallel lines have equal slopes.</NOTEBOOK_IDEA>');
    expect(v.extracted.ideaSuggestion.title).toBe('Parallel lines have equal slopes.');
    const empty = await runVerify('plain reply, no tags');
    expect(empty.extracted.ideaSuggestion).toBeNull();
  });

  test('only the FIRST offer counts; all tags are stripped regardless', async () => {
    const v = await runVerify(
      '<NOTEBOOK_IDEA title="One">first</NOTEBOOK_IDEA> and <NOTEBOOK_IDEA title="Two">second</NOTEBOOK_IDEA>'
    );
    expect(v.extracted.ideaSuggestion.title).toBe('One');
    expect(v.text).not.toContain('NOTEBOOK_IDEA');
    expect(v.text).not.toContain('second');
  });
});

describe('sanitizeCardInput (POST /api/notebook)', () => {
  test('valid idea passes through with caps applied', () => {
    const input = sanitizeCardInput({ type: 'idea', title: 'Balance rule', body: 'Do it to both sides.', skillId: 'two-step-equations' });
    // `source` marks whose words these are — 'tutor' for an offered idea, so it
    // stays read-only. Student-authored `note` cards are the editable ones; see
    // tests/unit/notebookStudentNotes.test.js.
    expect(input).toEqual({ type: 'idea', source: 'tutor', title: 'Balance rule', body: 'Do it to both sides.', skillId: 'two-step-equations' });
  });

  test('pipeline-only kinds are coerced to idea — clients cannot mint AHA/reminder evidence', () => {
    expect(sanitizeCardInput({ type: 'aha', title: 'fake', body: 'x' }).type).toBe('idea');
    expect(sanitizeCardInput({ type: 'reminder', title: 'fake', body: 'x' }).type).toBe('idea');
    expect(sanitizeCardInput({ type: 'reflection', title: 't', body: 'x' }).type).toBe('reflection');
  });

  test('empty submissions are rejected; missing title derives from body', () => {
    expect(sanitizeCardInput({})).toBeNull();
    expect(sanitizeCardInput({ body: '   ' })).toBeNull();
    expect(sanitizeCardInput({ body: 'Estimate before calculating.' }).title).toBe('Estimate before calculating.');
  });

  test('oversized fields are truncated, not rejected', () => {
    const input = sanitizeCardInput({ title: 'T'.repeat(500), body: 'B'.repeat(5000) });
    expect(input.title.length).toBe(160);
    expect(input.body.length).toBe(2000);
  });
});

/**
 * Student-authored notebook entries (routes/notebook.js, spec §15).
 *
 * The notebook is the student's — they can add notes, edit what they wrote,
 * and drag chat messages in. Two invariants hold that open without letting it
 * corrupt the tutor's record of what actually happened:
 *
 *   1. A client cannot MINT an aha/reminder card. Those carry evidence
 *      semantics the mastery pillars read; only the pipeline writes them.
 *   2. A client cannot claim `source: 'student'` on a tutor-worded card —
 *      source is derived from the type server-side. Since the edit route
 *      filters on `source: 'student'`, a spoofable source would be an edit
 *      permit for the tutor's own cards.
 */
const router = require('../../routes/notebook');
const { sanitizeCardInput, sanitizeCardEdit, sourceForType, TYPES, CREATABLE_TYPES } = router.__helpers;

describe('sanitizeCardInput — what a client is allowed to create', () => {
  test('a student note is accepted as its own kind', () => {
    const out = sanitizeCardInput({ type: 'note', title: 'Slope trick', body: 'rise over run' });
    expect(out).toMatchObject({ type: 'note', source: 'student', title: 'Slope trick', body: 'rise over run' });
  });

  test('aha and reminder cannot be minted — they coerce to idea', () => {
    for (const forbidden of ['aha', 'reminder']) {
      const out = sanitizeCardInput({ type: forbidden, title: 'I totally mastered this' });
      expect(out.type).toBe('idea');
      expect(out.source).toBe('tutor');
    }
  });

  test('an unknown or missing type coerces to idea rather than throwing', () => {
    expect(sanitizeCardInput({ type: 'trophy', title: 'x' }).type).toBe('idea');
    expect(sanitizeCardInput({ title: 'x' }).type).toBe('idea');
  });

  test('a client-supplied source is ignored — it is derived from the type', () => {
    // The attack this blocks: post an idea flagged 'student', then PATCH it.
    const out = sanitizeCardInput({ type: 'idea', title: 'tutor wording', source: 'student' });
    expect(out.source).toBe('tutor');
  });

  test('the tutor-offered idea chip still works unchanged', () => {
    const out = sanitizeCardInput({ type: 'idea', title: 'Balance both sides', body: 'why', skillId: 'alg-1' });
    expect(out).toMatchObject({ type: 'idea', source: 'tutor', skillId: 'alg-1' });
  });

  test('empty input is rejected, whitespace included', () => {
    expect(sanitizeCardInput({ type: 'note', title: '   ', body: '\n ' })).toBeNull();
    expect(sanitizeCardInput({})).toBeNull();
    expect(sanitizeCardInput(null)).toBeNull();
  });

  test('a body with no title borrows the first 60 chars as a headline', () => {
    const out = sanitizeCardInput({ type: 'note', body: 'y'.repeat(100) });
    expect(out.title).toBe('y'.repeat(60));
  });

  test('over-long fields are truncated to the schema maxima, not rejected', () => {
    const out = sanitizeCardInput({ type: 'note', title: 'a'.repeat(500), body: 'b'.repeat(5000) });
    expect(out.title).toHaveLength(160);
    expect(out.body).toHaveLength(2000);
    expect(String(sanitizeCardInput({ type: 'note', title: 'x', skillId: 's'.repeat(200) }).skillId)).toHaveLength(80);
  });

  test('non-string fields are coerced, not trusted (no object injection)', () => {
    const out = sanitizeCardInput({ type: 'note', title: { $ne: null }, body: ['a'] });
    expect(typeof out.title).toBe('string');
    expect(typeof out.body).toBe('string');
  });
});

describe('sourceForType', () => {
  test('only the student-written kind is student-sourced', () => {
    expect(sourceForType('note')).toBe('student');
    for (const t of ['aha', 'reminder', 'idea', 'strategy', 'reflection']) {
      expect(sourceForType(t)).toBe('tutor');
    }
  });
});

describe('sanitizeCardEdit — what a client is allowed to change', () => {
  test('title and body come through trimmed', () => {
    expect(sanitizeCardEdit({ title: '  Slope  ', body: '  rise/run  ' }))
      .toEqual({ title: 'Slope', body: 'rise/run' });
  });

  test('an edit cannot change the kind or re-source the card', () => {
    const out = sanitizeCardEdit({ title: 'x', type: 'aha', source: 'tutor', userId: 'someone-else' });
    expect(Object.keys(out).sort()).toEqual(['body', 'title']);
  });

  test('an empty edit is rejected — clearing a note is a delete, not an edit', () => {
    expect(sanitizeCardEdit({ title: '', body: '   ' })).toBeNull();
    expect(sanitizeCardEdit(null)).toBeNull();
  });

  test('over-long edits truncate to the schema maxima', () => {
    const out = sanitizeCardEdit({ title: 'a'.repeat(400), body: 'b'.repeat(4000) });
    expect(out.title).toHaveLength(160);
    expect(out.body).toHaveLength(2000);
  });
});

describe('type lists', () => {
  test('note is filterable via ?type= and creatable; aha/reminder are neither', () => {
    expect(TYPES).toContain('note');
    expect(CREATABLE_TYPES).toContain('note');
    expect(CREATABLE_TYPES).not.toContain('aha');
    expect(CREATABLE_TYPES).not.toContain('reminder');
  });

  test('every creatable type is a valid model enum value', () => {
    const modelEnum = require('../../models/learningCard').schema.path('type').enumValues;
    for (const t of CREATABLE_TYPES) expect(modelEnum).toContain(t);
    for (const t of TYPES) expect(modelEnum).toContain(t);
  });
});

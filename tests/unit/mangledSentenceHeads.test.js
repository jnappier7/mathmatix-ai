/**
 * Mangled sentence-head production bug (owner transcript, 2026-07-26).
 *
 * Two verbatim shapes shipped to a student:
 *   ", Jason! You're suggesting we multiply…"   (head eaten before the comma)
 *   "Alright, together. You've got…"            (middle of the sentence eaten)
 *
 * Root cause: verify()'s canned-phrase scrub deleted banned transition
 * phrases ("let's work through this", "let's tackle this", …) wherever they
 * appeared, leaving the sentence's trimmings behind. The anchored opener
 * strips (false-affirmation, CANNED_OPENERS) could orphan a comma the same
 * way ("Exactly, Jason!" → ", Jason!").
 *
 * These tests pin: phrase removal is sentence-aware, stripping never orphans
 * punctuation or ships a decapitated sentence, and clean text is untouched.
 */
const { verify, stripCannedTransitions, repairStrippedHead } = require('../../utils/pipeline/verify');
const { ACTIONS } = require('../../utils/pipeline/decide');
const { MESSAGE_TYPES } = require('../../utils/pipeline/observe');

describe('production shape 1: ", Jason! You\'re suggesting…"', () => {
  test('transition phrase heading the sentence drops the whole filler sentence', async () => {
    const v = await verify(
      "Let's work through this, Jason! You're suggesting we multiply both sides by 4.",
      { firstName: 'Jason' }
    );
    expect(v.text).toBe("You're suggesting we multiply both sides by 4.");
    expect(v.flags).toContain('canned_transitions_stripped');
  });

  test('false-affirmation strip does not orphan the vocative comma', async () => {
    const v = await verify(
      "Exactly, Jason! Which number should we look at first?",
      { action: ACTIONS.HINT, messageType: MESSAGE_TYPES.IDK, firstName: 'Jason' }
    );
    expect(v.text).not.toMatch(/^[,;]/);
    expect(v.text).toMatch(/^Jason! Which number/);
    expect(v.flags).toContain('false_affirmation_stripped');
  });
});

describe('production shape 2: "Alright, together. You\'ve got…"', () => {
  test('mid-sentence transition drops the whole filler sentence, not just the phrase', async () => {
    const v = await verify(
      "Alright, let's work through this together. You've got \\(3x + 5 = 20\\).",
      {}
    );
    expect(v.text).toBe("You've got \\(3x + 5 = 20\\).");
    expect(v.text).not.toMatch(/Alright,\s*together/);
    expect(v.flags).toContain('canned_transitions_stripped');
  });

  test('"let\'s tackle this" variant with a vocative', async () => {
    const v = await verify(
      "Now let's tackle this, Jason! What does the 5 tell you?",
      { firstName: 'Jason' }
    );
    expect(v.text).toBe('What does the 5 tell you?');
  });
});

describe('sentence-aware scrub keeps real content', () => {
  test('substantive remainder survives with repaired seams', () => {
    const { text, changed } = stripCannedTransitions(
      "Now let's break this down: first, find the GCF of 12 and 18.",
      'Jason'
    );
    expect(changed).toBe(true);
    expect(text).toBe('First, find the GCF of 12 and 18.');
  });

  test('phrase embedded in a content-bearing sentence never leaves a lowercase orphan head', () => {
    const { text } = stripCannedTransitions(
      'Moving on to quadratics, remember the vertex form.',
      null
    );
    expect(text).toBe('Quadratics, remember the vertex form.');
  });

  test('surrounding sentences are untouched when the filler sentence drops', () => {
    const { text } = stripCannedTransitions(
      "Nice work on that step. Let's tackle this together. What is 12 divided by 3?",
      null
    );
    expect(text).toBe('Nice work on that step. What is 12 divided by 3?');
  });

  test('decimals do not split a sentence', () => {
    const { text } = stripCannedTransitions(
      "Let's work through this with 3.5 as the rate. What is 3.5 times 4?",
      null
    );
    expect(text).not.toMatch(/^\s*[,.]/);
    expect(text).toContain('What is 3.5 times 4?');
  });
});

describe('the orphaned-head safety net (§8e)', () => {
  test('a system tag heading the reply cannot leave its comma behind', async () => {
    const v = await verify('<AWARD_XP:5,effort>, nice work on setting that up. What comes next?', {});
    expect(v.text).toBe('Nice work on setting that up. What comes next?');
  });

  test('repairStrippedHead never capitalizes a math variable', () => {
    expect(repairStrippedHead(', x = 2 is what you found. Why?')).toBe('x = 2 is what you found. Why?');
    expect(repairStrippedHead(', so the slope is 3.')).toBe('So the slope is 3.');
  });
});

describe('clean text passes through unmangled', () => {
  test('a normal affirmation with a vocative is untouched', async () => {
    const v = await verify("Great thinking, Jason! You're suggesting we multiply both sides by 4.", {});
    expect(v.text).toBe("Great thinking, Jason! You're suggesting we multiply both sides by 4.");
    expect(v.flags).toEqual([]);
  });
});

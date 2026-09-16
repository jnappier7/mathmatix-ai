/**
 * Mangled sentence heads (owner transcripts, 2026-07-26 and 2026-09-16).
 *
 * Three verbatim shapes shipped to students:
 *   ", Jason! You're suggesting we multiply…"   (2026-07-26, head eaten)
 *   "Alright, together. You've got…"            (2026-07-26, middle eaten)
 *   "Great problem! It together."               (2026-09-16, trial page)
 *
 * Root cause, all three: verify() had a scrub that deleted "canned transition"
 * phrases ("let's work through this", "let's tackle it together", "let's dive
 * into it", "moving on to") from wherever they sat. The model had built the
 * sentence around the phrase, so what was left was not a sentence. The first
 * fix made the deletion sentence-aware; the third shape arrived anyway.
 *
 * The scrub is gone. These phrases are filler, not a teaching error, and the
 * prompt (OPENERS block, shared by open chat and course chat) now asks the
 * model to sound like a tutor at the table rather than announce the teaching
 * — a principle, not another phrase list, because a banned-phrase list is
 * itself canned. A sentence never written needs no repair. What
 * remains in verify() is the anchored opener strip at the head of the reply,
 * which cannot orphan mid-sentence text, plus repairStrippedHead for the one
 * seam it can leave (a vocative comma).
 *
 * Pinned here:
 *   1. every historical shape now passes through verify() byte-for-byte —
 *      no scrub means no mangling;
 *   2. the scrub is not exported, so nothing can quietly wire it back in;
 *   3. the prompt carries the ban, in the block both chat modes include;
 *   4. the anchored opener strip and repairStrippedHead still behave.
 */
const verifyModule = require('../../utils/pipeline/verify');
const { verify, repairStrippedHead } = verifyModule;
const { ACTIONS } = require('../../utils/pipeline/decide');
const { MESSAGE_TYPES } = require('../../utils/pipeline/observe');
const { SHARED_VOICE_BLOCKS, STATIC_RULES } = require('../../utils/promptCompact');

describe('replies with a transition phrase pass through verify() untouched', () => {
  test.each([
    // 2026-09-16 trial page — became "Great problem! It together."
    "Great problem! Let's dive into it together.\n\nWhat do you think is the first step to take when solving \\(2(x - 3) = 10\\)?",
    // 2026-07-26 — became ", Jason! You're suggesting…"
    "Let's work through this, Jason! You're suggesting we multiply both sides by 4.",
    // 2026-07-26 — became "Alright, together. You've got…"
    "Alright, let's work through this together. You've got \\(3x + 5 = 20\\).",
    "Now let's tackle this, Jason! What does the 5 tell you?",
    "Let's tackle it step by step. What is 2 times x?",
    "Let's break this down: first, find the GCF of 12 and 18.",
    'Moving on to quadratics, remember the vertex form.',
    "You nailed the setup, so let's tackle it together. What is 2 times x?",
  ])('%s', async (reply) => {
    const v = await verify(reply, { firstName: 'Jason' });
    expect(v.text).toBe(reply);
    expect(v.flags).not.toContain('canned_transitions_stripped');
  });

  test('the scrub is not exported', () => {
    expect(verifyModule.stripCannedTransitions).toBeUndefined();
  });
});

describe('the fix lives in the prompt, as a principle rather than a phrase list', () => {
  // A blacklist of phrases is itself canned: the model dodges those exact
  // strings and reaches for the next stilted substitute. The prompt asks for
  // the behaviour instead — sound like the tutor at the table.
  test('the shared OPENERS block asks the model not to announce teaching before doing it', () => {
    expect(SHARED_VOICE_BLOCKS).toMatch(/announce the teaching before doing it/);
    expect(SHARED_VOICE_BLOCKS).toMatch(/Write the way that tutor talks/);
  });

  test('open chat carries it (course chat includes SHARED_VOICE_BLOCKS, see courseVoiceBlocks.test.js)', () => {
    expect(STATIC_RULES).toMatch(/announce the teaching before doing it/);
  });
});

describe('the anchored opener strip still cannot orphan a head', () => {
  test('false-affirmation strip does not orphan the vocative comma', async () => {
    const v = await verify(
      'Exactly, Jason! Which number should we look at first?',
      { action: ACTIONS.HINT, messageType: MESSAGE_TYPES.IDK, firstName: 'Jason' }
    );
    expect(v.text).not.toMatch(/^[,;]/);
    expect(v.text).toMatch(/^Jason! Which number/);
    expect(v.flags).toContain('false_affirmation_stripped');
  });

  test('a canned opener at the head of the reply is stripped cleanly', async () => {
    const v = await verify("Great question! What is 12 divided by 3?", {});
    expect(v.text).toBe('What is 12 divided by 3?');
    expect(v.flags).toContain('canned_opener_stripped');
  });

  test('a system tag heading the reply cannot leave its comma behind (§8e)', async () => {
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

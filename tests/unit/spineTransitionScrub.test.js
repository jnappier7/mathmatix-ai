/**
 * "Great problem! It together." (trial chat, owner screenshot, 2026-09-16).
 *
 * The model wrote "Great problem! Let's dive into it together." The canned
 * transition scrub matched "let's dive into", deleted it, and kept the rest of
 * the sentence because "it together" contains a word ("it") that was not on
 * its filler list. The student saw a headless fragment as the tutor's reply.
 *
 * The 2026-07-26 fix made the scrub sentence-aware but still decided by word
 * counting. That is the wrong test when the banned phrase IS the sentence's
 * subject and verb: whatever follows ("it together", "step by step", "this
 * one, Jason", "using the distributive property") is the verb's complement,
 * not a clause, so no amount of it makes a sentence.
 *
 * Pinned here:
 *   1. the exact production shape drops the whole filler sentence;
 *   2. its siblings (every object / tail the phrase can take) do too;
 *   3. a phrase embedded in a real clause still leaves that clause, with
 *      the seams repaired;
 *   4. a separate clause after the phrase survives, without the phrase's
 *      own complement dragged along in front of it;
 *   5. a dropped sentence leaves no stranded whitespace before a newline.
 */
const { verify, stripCannedTransitions } = require('../../utils/pipeline/verify');

const PRODUCTION_REPLY =
  "Great problem! Let's dive into it together.\n\nWhat do you think is the first step to take when solving \\(2(x - 3) = 10\\)?";

describe('the 2026-09-16 shape: "Great problem! It together."', () => {
  test('the exact reply through verify() loses the filler sentence whole', async () => {
    const v = await verify(PRODUCTION_REPLY, { firstName: null });
    expect(v.text).toBe(
      "Great problem!\n\nWhat do you think is the first step to take when solving \\(2(x - 3) = 10\\)?"
    );
    expect(v.text).not.toMatch(/\bIt together\b/);
    expect(v.flags).toContain('canned_transitions_stripped');
  });

  test('no stranded space is left before the paragraph break', () => {
    const { text } = stripCannedTransitions(PRODUCTION_REPLY, null);
    expect(text).not.toMatch(/ \n/);
  });
});

describe('a spine phrase takes its whole sentence, whatever its complement', () => {
  const cases = [
    ["Great problem! Let's dive into it together. What first?", 'Great problem! What first?'],
    ["Great problem! Let's dive in and tackle it together. What first?", 'Great problem! What first?'],
    ["Great problem! Let's tackle it step by step. What first?", 'Great problem! What first?'],
    ["Great problem! Let's break it down together, step by step. What first?", 'Great problem! What first?'],
    ["Let's tackle this one together. What do you notice about 2(x - 3)?", 'What do you notice about 2(x - 3)?'],
    ["Let's dive into this one, Jason! What is 2 times 3?", 'What is 2 times 3?'],
    ["Let's break this down step by step so it feels easy. What is the first move?", 'What is the first move?'],
    ["Let's tackle this using the distributive property first. What is 2 times x?", 'What is 2 times x?'],
    ["Alright, Jason, let's work through it together. What is 2 times x?", 'What is 2 times x?'],
  ];

  test.each(cases)('%s', (input, expected) => {
    const { text, changed } = stripCannedTransitions(input, 'Jason');
    expect(changed).toBe(true);
    expect(text).toBe(expected);
  });

  test('never ships a fragment made only of the phrase\'s leftovers', () => {
    const leftovers = /^(It|One|Together|Step|This|That|In|Into|Using)\b[^.!?]*[.!?]/;
    for (const [input] of cases) {
      const { text } = stripCannedTransitions(input, 'Jason');
      for (const sentence of text.split(/(?<=[.!?])\s+/)) {
        expect(sentence).not.toMatch(leftovers);
      }
    }
  });
});

describe('a phrase embedded in a real clause leaves the clause, seams repaired', () => {
  test('a trailing "so let\'s tackle it together" is cut with its conjunction', () => {
    const { text } = stripCannedTransitions(
      "You nailed the setup, so let's tackle it together. What is 2 times x?",
      null
    );
    expect(text).toBe('You nailed the setup. What is 2 times x?');
  });

  test('a comma-joined phrase after a content head does not leave ", ."', () => {
    const { text } = stripCannedTransitions("Great problem, let's dive into it together. What first?", null);
    expect(text).toBe('Great problem. What first?');
  });

  test('a mid-sentence "with that said" keeps the conjunction it sat behind', () => {
    const { text } = stripCannedTransitions(
      'The slope is 3.5, so with that said, the line rises. What is the intercept?',
      null
    );
    expect(text).toBe('The slope is 3.5, so the line rises. What is the intercept?');
  });
});

describe('a separate clause after a spine phrase survives on its own', () => {
  test('the clause stays, the phrase\'s complement in front of it does not', () => {
    const { text } = stripCannedTransitions(
      "Alright, Jason, let's break this down together, starting with the parentheses. What is inside them?",
      'Jason'
    );
    expect(text).toBe('Starting with the parentheses. What is inside them?');
  });

  test('a bare vocative after the comma is not a clause', () => {
    const { text } = stripCannedTransitions("Let's tackle this together, Jason! What is 6 times 7?", 'Jason');
    expect(text).toBe('What is 6 times 7?');
  });
});

describe('clean text is untouched', () => {
  test.each([
    'What is 2(x - 3) equal to? Hint: it is not 2x - 3.',
    'Together, those two steps undo the parentheses. Which one comes first?',
    'Dive into the second step now: what is 10 divided by 2?',
  ])('%s', (input) => {
    const { text, changed } = stripCannedTransitions(input, 'Jason');
    expect(changed).toBe(false);
    expect(text).toBe(input);
  });
});

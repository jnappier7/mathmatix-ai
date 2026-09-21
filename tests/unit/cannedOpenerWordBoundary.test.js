/**
 * "To question 30!" (ACT bootcamp transcript, owner screenshot, 2026-09-21).
 *
 * The tutor wrote "Let's dive into question 30! What have you tried so far?"
 * verify()'s canned-opener strip matched "let's dive in" INSIDE the word
 * "into", deleted it, and left "to question 30!", which repairStrippedHead
 * dutifully capitalized. The student saw "To question 30!" as the reply.
 *
 * The opener strip survived the 2026-09-16 scrub removal because its comment
 * claimed anchoring to the head of the reply made deletion safe. It does not.
 * Anchoring prevents deleting from the middle of a REPLY; it says nothing
 * about stopping mid-WORD or mid-CLAUSE. The same pattern also truncated
 * "Great questions!" to "s!" and "Let's dive in and find out." to
 * "And find out."
 *
 * The invariant now: an opener is stripped only when it is a COMPLETE leading
 * sentence (phrase + terminal punctuation). Removing a whole sentence cannot
 * leave a fragment. A phrase that runs on into its own object or a following
 * clause is not an opener — it is a sentence with content, and it ships as
 * written. The prompt's OPENERS block is what discourages writing one.
 */
const { verify } = require('../../utils/pipeline/verify');

describe('the 2026-09-21 shape: "Let\'s dive into question 30!"', () => {
  test('the exact reply survives verify() byte-for-byte', async () => {
    const reply = "Let's dive into question 30! What have you tried so far? Where are you getting stuck?";
    const v = await verify(reply, { firstName: 'Jason' });
    expect(v.text).toBe(reply);
    expect(v.text).not.toMatch(/^To question/);
    expect(v.flags).not.toContain('canned_opener_stripped');
  });
});

describe('a phrase that runs into its own object or clause is not an opener', () => {
  test.each([
    "Let's dive into the problem. What is 2 times 3?",
    "Let's dive in and find out. What is the first step?",
    'Great questions! Which one do you want first?',
    "I'd be happy to help you understand fractions.",
    'Absolutely nothing changes here. Why is that?',
    'Of course you can factor that. How would you start?',
    'Certainly worth checking. What is 6 times 7?',
  ])('%s', async (reply) => {
    const v = await verify(reply, { firstName: 'Jason' });
    expect(v.text).toBe(reply);
  });

  test('no reply is ever left starting mid-word', async () => {
    for (const reply of [
      "Let's dive into question 30! What next?",
      'Great questions! Which first?',
      "Let's dive into it, Jason! What next?",
    ]) {
      const v = await verify(reply, { firstName: 'Jason' });
      // The head of the output must be the head of a real word in the input.
      expect(reply.startsWith(v.text) || reply.includes(v.text)).toBe(true);
      expect(v.text).not.toMatch(/^(To|S|And|You understand)\b/);
    }
  });
});

describe('a complete leading opener sentence is still stripped', () => {
  test.each([
    ['Great question! What is 12 divided by 3?', 'What is 12 divided by 3?'],
    ['Great question. Let me show you.', 'Let me show you.'],
    ["That's a great question! Where do we start?", 'Where do we start?'],
    ["Let's dive in! What is 2 times 3?", 'What is 2 times 3?'],
    ["Let's dive right in. What is 2 times 3?", 'What is 2 times 3?'],
    ['Absolutely! You nailed it.', 'You nailed it.'],
    ['No problem! Let me show you.', 'Let me show you.'],
    ['Of course! Here is the first step.', 'Here is the first step.'],
    ["I'd be happy to help with that. First, distribute the 2.", 'First, distribute the 2.'],
    ['I can definitely help you with that! What is 2 times x?', 'What is 2 times x?'],
  ])('%s', async (input, expected) => {
    const v = await verify(input, { firstName: 'Jason' });
    expect(v.text).toBe(expected);
    expect(v.flags).toContain('canned_opener_stripped');
  });
});

describe('an opener that is the whole reply is never stripped to nothing', () => {
  test.each(['Great question!', 'Absolutely!', "Let's dive in."])('%s', async (reply) => {
    const v = await verify(reply, {});
    expect(v.text).toBe(reply);
    expect(v.flags).not.toContain('canned_opener_stripped');
  });
});

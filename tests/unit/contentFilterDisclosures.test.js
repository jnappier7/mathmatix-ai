// tests/unit/contentFilterDisclosures.test.js
//
// The chat keyword filter answered abuse disclosures with "that topic isn't
// appropriate — let's focus on math", so the tutor never saw them and no
// safety alert fired. Witnessed 2026-10-17 against the production filter: 4 of
// 6 disclosures blocked. A disclosure now always reaches the tutor; ordinary
// profanity / off-topic asks are still blocked.

const fs = require('fs');
const path = require('path');
const { shouldCannedBlock, looksLikeDisclosure } = require('../../utils/contentFilter');

describe('disclosures always reach the tutor', () => {
  test.each([
    'my mom gets drunk and hits me',
    'my uncle touches me and says its our secret, he showed me porn',
    'someone at a party made me drink alcohol and i dont remember what happened',
    'my stepdad does sex stuff to me',
    'my dad beats me when hes drunk',
    'my brother sells drugs and said hed hurt me if i tell',
    'i fucking hate my life and i want to die',
    'a kid said hes bringing a gun to school tomorrow, its the shit',
    'someone keeps sending me porn and says to keep it a secret',
    'im scared to go home, my dad is drunk again',
    'i dont feel safe at home, theres alcohol everywhere',
  ])('%s', (msg) => {
    expect(looksLikeDisclosure(msg)).toBe(true);
    expect(shouldCannedBlock(msg)).toBe(false);
  });
});

describe('ordinary profanity / off-topic asks are still blocked', () => {
  test.each([
    'damn i got it wrong', 'this is shit', 'show me porn', 'whats the best weed',
    'fuck this problem', 'is beer a liquid',
  ])('%s', (msg) => {
    expect(shouldCannedBlock(msg)).toBe(true);
  });
});

test('clean math never trips the block', () => {
  for (const m of ['solve 3x + 5 = 20', 'x = 5', 'this problem is killing me lol', 'i want to kill myself']) {
    expect(shouldCannedBlock(m)).toBe(false);
  }
});

test('routes/chat.js uses the shared filter, not its own pattern list', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../routes/chat.js'), 'utf8');
  expect(src).toMatch(/const containsInappropriate = shouldCannedBlock\(message\);/);
  expect(src).not.toMatch(/const inappropriatePatterns = \[/);
});

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

// The model does not reliably emit <SAFETY_CONCERN>: on gpt-4o-mini (live
// safety eval, 2026-10-17) it tagged 1 of 8 disclosures. persist now raises the
// alert from the student's own words; this set emails a person, so it is
// stricter than the pass-through set above.
describe('alert-grade detection (persist fallback)', () => {
  const { disclosureConcern } = require('../../utils/contentFilter');
  test.each([
    ['i want to kill myself', 'self-harm'],
    ['sometimes i think everyone would be better off without me', 'self-harm'],
    ['ive been cutting myself again', 'self-harm'],
    ['i dont want to be alive anymore', 'self-harm'],
    ['my dad hits me when i get bad grades', 'abuse'],
    ['my mom gets drunk and hits me', 'abuse'],
    ['my uncle touches me and says its our secret', 'sexual abuse'],
    ['my stepdad does sex stuff to me', 'sexual abuse'],
    ['a kid in my class said hes bringing a gun to school tomorrow', 'threat / weapon'],
    ['im scared to go home', 'unsafe at home'],
  ])('%s → %s', (msg, kind) => {
    expect(disclosureConcern(msg)).toMatch(new RegExp(`Possible .*${kind.replace('/', '\\/')}`));
  });

  test.each([
    'this problem is killing me lol', 'ugh im gonna die if i fail this test',
    'my teacher is going to murder me if i get this wrong', 'my teacher made me redo it',
    'its a secret code', 'the knife problem in the book', 'cut the pizza into 8 slices',
    'this hurts my brain', 'i hit the wrong button', 'solve 3x + 5 = 20',
  ])('no alert: %s', (msg) => {
    expect(disclosureConcern(msg)).toBeNull();
  });

  test('persist falls back to it when the model did not tag', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../utils/pipeline/persist.js'), 'utf8');
    expect(src).toMatch(/const safetyConcern = resolveSafetyConcern\(extracted\.safetyConcern, originalMessage\);/);
    expect(src).toMatch(/sendSafetyConcernAlert\([\s\S]{0,200}safetyConcern,\s*\n\s*originalMessage/);
  });
});

// gpt-6-luna tagged classroom hyperbole <SAFETY_CONCERN> in 3 of 4 live safety
// runs (2026-11-22), and once more after the prompt named the idioms. The tag
// emails a real adult, so persist resolves it through resolveSafetyConcern.
describe('school hyperbole never raises an alert on the model\'s word alone', () => {
  const { isSchoolHyperbole, resolveSafetyConcern, disclosureConcern } = require('../../utils/contentFilter');
  let warn;
  beforeEach(() => { warn = jest.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => warn.mockRestore());

  test.each([
    'this problem is killing me lol',
    'ugh im gonna die if i fail this test',
    'my teacher is going to murder me if i get this wrong',
    'my mom will kill me if i get a bad grade',
    'this homework is the death of me',
  ])('vetoes the model tag on %s', (msg) => {
    expect(isSchoolHyperbole(msg)).toBe(true);
    expect(resolveSafetyConcern('possible self-harm risk related to failing a test', msg)).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  test.each([
    'i want to die if i fail this test',          // self-harm pattern: never vetoed
    'i fucking hate my life and i want to die',
    'my dad hits me when i get bad grades',       // abuse pattern: never vetoed
    'ive been cutting myself again',
  ])('a genuine disclosure phrased near school words keeps the tag: %s', (msg) => {
    expect(isSchoolHyperbole(msg)).toBe(false);
    expect(resolveSafetyConcern('model tag', msg)).toBe('model tag');
    // and the server raises it even with no tag
    expect(resolveSafetyConcern(null, msg)).toBe(disclosureConcern(msg));
  });

  test('a model tag on an ordinary message passes through untouched', () => {
    expect(resolveSafetyConcern('student mentioned a plan to run away', 'i might just leave tonight')).toBe('student mentioned a plan to run away');
    expect(warn).not.toHaveBeenCalled();
  });

  test('no tag and no disclosure → no concern', () => {
    expect(resolveSafetyConcern(null, 'can you check 3x + 2 = 11')).toBeNull();
  });
});

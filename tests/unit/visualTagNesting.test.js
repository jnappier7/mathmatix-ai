/**
 * The half-eaten visual tag (production, Kandy's session 2026-07-26):
 * ',label="−3 and 3 are both 3 steps from zero"]' leaked into a tutor
 * message. Chain of failure: unicode minus in params → renderer rejected the
 * tag → safety-net stripper's first-']' regex ate only the head → tail
 * shipped as student-visible text. All three layers pinned here.
 */
const { stripUnrenderedVisualTags } = require('../../public/js/stripVisualTags.js');
const { verify } = require('../../utils/pipeline/verify');

const PROD_TAG = '[NUMBER_LINE:min=-5,max=5,points=[−3,3],label="−3 and 3 are both 3 steps from zero"]';

describe('stripVisualTags strips nested-bracket tags WHOLE', () => {
  test('the exact production tag leaves no residue', () => {
    const out = stripUnrenderedVisualTags(`Distance only cares how far. ${PROD_TAG} See both land 3 away.`);
    expect(out).not.toContain('label=');
    expect(out).not.toContain(']');
    expect(out).toContain('Distance only cares how far.');
    expect(out).toContain('See both land 3 away.');
  });

  test('plain brackets and intervals still never touched', () => {
    const text = 'The interval [0, 3] and the pair [a, b] stay.';
    expect(stripUnrenderedVisualTags(text)).toBe(text);
  });
});

describe('the tag SURVIVES verify whole — students must see the number line', () => {
  test('the tag round-trips verify without the tail being exposed', async () => {
    const v = await verify(`Distance only cares how far. ${PROD_TAG}`, {});
    // The whole tag must survive intact — no half-protection artifacts like
    // a mangled tail or injected \( \) inside the label.
    expect(v.text).toContain('label="−3 and 3 are both 3 steps from zero"]');
    expect(v.text.match(/\[NUMBER_LINE:/g)).toHaveLength(1);
  });
});

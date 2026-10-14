const { unsetFor, junkFilter } = require('../../scripts/cleanupJunkEngineKeys');

test('unsets only junk keys, in every engine store', () => {
  const doc = { learningEngines: {
    bkt: { undefined: {}, 'act-sequences': {} },
    fsrs: { undefined: {}, null: {} },
    consistency: { MS_EQV_10: {} },
  } };
  expect(unsetFor(doc)).toEqual({
    'learningEngines.bkt.undefined': '',
    'learningEngines.fsrs.undefined': '',
    'learningEngines.fsrs.null': '',
  });
});

test('filter targets all three stores', () => {
  const paths = junkFilter().$or.map((c) => Object.keys(c)[0]);
  for (const e of ['bkt', 'fsrs', 'consistency']) expect(paths).toContain(`learningEngines.${e}.undefined`);
});

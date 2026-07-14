'use strict';
/* The client adapter (public/js/living-workspace/dom/legacyBoardAdapter.js)
   is a hand-maintained browser twin of the shared one. This test fails if
   they ever produce different output — the only guard against drift. */

const shared = require('../../../shared/workspace/legacyBoardAdapter');
const client = require('../../../public/js/living-workspace/dom/legacyBoardAdapter');

const TURNS = [
  [{ action: 'pose', tex: '2x + 4 = 20' }],
  [{ action: 'apply', op: 'subtract 4 from both sides' }],
  [{ action: 'resolve', tex: '2x = 16' }],
  [{ action: 'verify', tex: 'x = 8', check: '2(8)+4 = 20' }],
  [{ action: 'scaffold', tex: 'x^2 + 4x + \\boxed{} = 12' }],
  [{ action: 'example', tex: '\\int x^2 dx', caption: 'Power rule' }],
  [{ action: 'graph', fn: 'x^2 - 4', caption: 'Zeros' }],
  [{ action: 'image', query: 'unit circle', caption: 'Ref' }],
  [{ action: 'diagram', diagram_type: 'triangle', diagram_params: { a: 3 } }],
  [{ action: 'clear' }],
  [{ action: 'model', model: 'slope_intercept_line' }],
  [{ action: 'pose' }, { action: 'graph' }],                 // missing payloads
  [null, 42, {}, { action: 5 }, { action: 'pose', tex: 'x=1' }], // malformed
  // a full turn + a with-timestamp variant
  [
    { action: 'pose', tex: '2x + 4 = 20' },
    { action: 'apply', op: 'subtract 4 from both sides' },
    { action: 'resolve', tex: '2x = 16' },
    { action: 'verify', tex: 'x = 8', check: '2(8)+4 = 20' },
  ],
];

describe('legacy board adapter — shared vs client parity', () => {
  test('the two adapters export the same function shape', () => {
    expect(typeof shared.adaptBoardCommands).toBe('function');
    expect(typeof client.adaptBoardCommands).toBe('function');
  });

  for (let i = 0; i < TURNS.length; i++) {
    test(`identical output for turn #${i}`, () => {
      expect(client.adaptBoardCommands(TURNS[i]))
        .toEqual(shared.adaptBoardCommands(TURNS[i]));
      // with an explicit timestamp too
      expect(client.adaptBoardCommands(TURNS[i], { now: '2026-07-13T00:00:00.000Z' }))
        .toEqual(shared.adaptBoardCommands(TURNS[i], { now: '2026-07-13T00:00:00.000Z' }));
    });
  }
});

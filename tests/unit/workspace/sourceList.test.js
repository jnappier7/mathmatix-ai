/**
 * Source Cards list derivation (core/sourceList.js, spec §5.1).
 *
 * The dock's contract: sources come from USER messages' attachment refs,
 * dedupe by uploadId, keep arrival order, cap at MAX_SOURCES with the oldest
 * falling off — the board holds a working set, the transcript is the archive.
 */
const { sourcesFromMessages, mergeSources, MAX_SOURCES } =
  require('../../../public/js/living-workspace/core/sourceList.js');

describe('sourcesFromMessages', () => {
  test('collects user-message attachments in order, normalized to servable refs', () => {
    const messages = [
      { role: 'user', content: 'here is my worksheet', attachments: [{ uploadId: 'u1', fileType: 'image', mimeType: 'image/jpeg' }] },
      { role: 'assistant', content: 'got it' },
      { role: 'user', content: 'and the pdf', attachments: [{ uploadId: 'u2', fileType: 'pdf', mimeType: 'application/pdf' }] },
    ];
    expect(sourcesFromMessages(messages)).toEqual([
      { uploadId: 'u1', fileType: 'image', mimeType: 'image/jpeg' },
      { uploadId: 'u2', fileType: 'pdf', mimeType: 'application/pdf' },
    ]);
  });

  test('ignores assistant attachments, junk entries, and messages without attachments', () => {
    const messages = [
      { role: 'assistant', attachments: [{ uploadId: 'tutor-img', fileType: 'image' }] },
      { role: 'user', content: 'plain' },
      { role: 'user', attachments: [null, {}, { uploadId: 'u1' }] },
      null,
    ];
    // Unknown fileType defaults to image (only two servable types exist).
    expect(sourcesFromMessages(messages)).toEqual([{ uploadId: 'u1', fileType: 'image', mimeType: null }]);
  });

  test('dedupes by uploadId across messages', () => {
    const messages = [
      { role: 'user', attachments: [{ uploadId: 'u1', fileType: 'image' }] },
      { role: 'user', attachments: [{ uploadId: 'u1', fileType: 'image' }, { uploadId: 'u2', fileType: 'pdf' }] },
    ];
    expect(sourcesFromMessages(messages).map(s => s.uploadId)).toEqual(['u1', 'u2']);
  });

  test('caps at MAX_SOURCES, oldest falling off', () => {
    const messages = Array.from({ length: MAX_SOURCES + 3 }, (_, i) => ({
      role: 'user', attachments: [{ uploadId: 'u' + i, fileType: 'image' }],
    }));
    const out = sourcesFromMessages(messages);
    expect(out).toHaveLength(MAX_SOURCES);
    expect(out[0].uploadId).toBe('u3');
    expect(out[out.length - 1].uploadId).toBe('u' + (MAX_SOURCES + 2));
  });
});

describe('mergeSources', () => {
  test('appends a live-turn delta without duplicating and without mutating inputs', () => {
    const existing = [{ uploadId: 'u1', fileType: 'image', mimeType: null }];
    const frozen = JSON.parse(JSON.stringify(existing));
    const out = mergeSources(existing, [
      { uploadId: 'u1', fileType: 'image' },              // already docked
      { uploadId: 'u2', fileType: 'pdf', mimeType: 'application/pdf' },
    ]);
    expect(out.map(s => s.uploadId)).toEqual(['u1', 'u2']);
    expect(existing).toEqual(frozen);
  });

  test('tolerates junk on both sides', () => {
    expect(mergeSources(null, null)).toEqual([]);
    expect(mergeSources('junk', [{ uploadId: 'u1' }])).toEqual([{ uploadId: 'u1', fileType: 'image', mimeType: null }]);
  });
});

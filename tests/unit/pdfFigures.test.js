// A PDF worksheet's figures reach the tutor as labeled images, not as
// Mathpix CDN links that 404 once pdfOcr deletes the document. Replay of a
// 2026-10-28 prod turn: "1. Name the vector and write its component form."
// came through as a dead link, and the tutor asked the student to describe
// the vector.
const sharp = require('sharp');
const {
  extractFigureLinks, labelFigures, fetchFigures, figureVisionBlocks, FIGURE_READING_RULE, MAX_FIGURES,
} = require('../../utils/pdfFigures');
const { findWorksheetInMessages, referencesWorksheet } = require('../../utils/activeWorksheetImage');

const crop = (n) => `https://cdn.mathpix.com/cropped/d832de48-${n}.jpg?height=318&width=329`;
const sheet = [
  '1. Name the vector and write its component form.',
  `![](${crop(1)})`,
  '5. Graph △ABC with A(-4, 1), B(-2, 4), C(-1, 1).',
  `![](${crop(2)})`,
  `See again: ![](${crop(1)})`,
  '![logo](https://example.com/logo.png)',
].join('\n');

let jpeg;
beforeAll(async () => {
  jpeg = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#fff' } }).jpeg().toBuffer();
});
beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

describe('figure links in Mathpix markdown', () => {
  test('distinct Mathpix crops in document order; other links ignored', () => {
    expect(extractFigureLinks(sheet)).toEqual([crop(1), crop(2)]);
    expect(extractFigureLinks(undefined)).toEqual([]);
  });

  test('each crop becomes a [Figure N] marker; a missing figure says so', () => {
    const out = labelFigures(sheet, ['data:image/jpeg;base64,AA', null]);
    expect(out).toContain('component form.\n[Figure 1]\n');
    expect(out).toContain('[Figure 2 — image not available]');
    expect(out).toContain('See again: [Figure 1]');
    expect(out).not.toContain('cdn.mathpix.com');
    expect(out).toContain('https://example.com/logo.png');
  });
});

describe('fetchFigures', () => {
  test('downscaled data URLs aligned with the links; a failed fetch is null, not a throw', async () => {
    const get = jest.fn(async (url) => {
      if (url === crop(2)) throw Object.assign(new Error('gone'), { response: { status: 404 } });
      return { data: jpeg };
    });
    const out = await fetchFigures([crop(1), crop(2)], { get });
    expect(out[0]).toMatch(/^data:image\/jpeg;base64,/);
    expect(out[1]).toBeNull();
    expect(get).toHaveBeenCalledWith(crop(1), expect.objectContaining({ responseType: 'arraybuffer' }));
  });

  test(`stops at ${MAX_FIGURES} figures`, async () => {
    const get = jest.fn(async () => ({ data: jpeg }));
    const urls = Array.from({ length: MAX_FIGURES + 3 }, (_, i) => crop(i));
    const out = await fetchFigures(urls, { get });
    expect(get).toHaveBeenCalledTimes(MAX_FIGURES);
    expect(out.slice(MAX_FIGURES)).toEqual([null, null, null]);
  });
});

describe('figureVisionBlocks', () => {
  test('reading rule first, then each figure under the label its text marker uses', () => {
    const blocks = figureVisionBlocks(['data:image/jpeg;base64,AA', '', 'data:image/jpeg;base64,CC']);
    expect(blocks[0]).toEqual({ type: 'text', text: FIGURE_READING_RULE });
    expect(blocks.slice(1)).toEqual([
      { type: 'text', text: '[Figure 1] from the worksheet:' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AA', detail: 'high' } },
      { type: 'text', text: '[Figure 3] from the worksheet:' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,CC', detail: 'high' } },
    ]);
  });

  test('the rule forbids marking a student wrong on the tutor\'s own grid count', () => {
    expect(FIGURE_READING_RULE).toMatch(/approximate/);
    expect(FIGURE_READING_RULE).toMatch(/never call their reading wrong/);
  });

  test('no figures, no blocks (and no stray rule)', () => {
    expect(figureVisionBlocks([])).toEqual([]);
    expect(figureVisionBlocks(['', null])).toEqual([]);
    expect(figureVisionBlocks(undefined)).toEqual([]);
  });
});

describe('figures on later turns', () => {
  const now = Date.parse('2026-10-28T14:31:32Z');
  const pdfMsg = (at, figures) => ({
    role: 'user', timestamp: new Date(at), content: 'help',
    attachments: [{ fileType: 'pdf', extractedText: 'sheet', figures }],
  });

  test('the newest PDF\'s figures come back with their slots intact', () => {
    const msgs = [pdfMsg('2026-10-28T14:27:46Z', ['data:a', '', 'data:c'])];
    expect(findWorksheetInMessages(msgs, now).figureDataUrls).toEqual(['data:a', '', 'data:c']);
  });

  test('an older PDF\'s figures never label a newer, figure-less sheet', () => {
    const msgs = [pdfMsg('2026-10-28T14:00:00Z', ['data:old']), pdfMsg('2026-10-28T14:27:46Z', undefined)];
    expect(findWorksheetInMessages(msgs, now).figureDataUrls).toEqual([]);
  });

  test('past the TTL the text stays but the figures stop being re-sent', () => {
    const out = findWorksheetInMessages([pdfMsg('2026-10-28T12:00:00Z', ['data:a'])], now);
    expect(out.text).toBe('sheet');
    expect(out.figureDataUrls).toEqual([]);
  });

  test('"my guy im doing question one" is a turn about the sheet', () => {
    expect(referencesWorksheet('my guy im doing question one')).toBe(true);
    expect(referencesWorksheet('number twelve')).toBe(true);
    expect(referencesWorksheet('one at a time')).toBe(false);
    expect(referencesWorksheet('yep')).toBe(false);
  });
});

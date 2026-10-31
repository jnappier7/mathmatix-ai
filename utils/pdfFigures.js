// utils/pdfFigures.js
//
// Keeps a PDF worksheet's FIGURES visible to the tutor.
//
// Mathpix returns a PDF as markdown, with every figure as a link to a crop on
// its CDN: ![](https://cdn.mathpix.com/cropped/<id>-1.jpg?...). Those links
// only live as long as the document does, and utils/pdfOcr.js deletes the
// document from Mathpix as soon as the text is back (privacy), so by the time
// the tutor reads the text every link is a 404. A student asked for help with
// "1. Name the vector and write its component form" and the tutor, holding
// only a dead link, asked HIM to describe the vector (production, 2026-10-28).
//
// So the crops are fetched while they still exist (before the delete), each
// link in the text becomes a "[Figure N]" marker, and the figures travel to
// the model as vision blocks labeled to match: on the upload turn, and stored
// downscaled on the message attachment for later turns about the sheet.

let sharp = null;
try { sharp = require('sharp'); } catch (_) { /* optional — figures then skipped */ }

// A worksheet page rarely has more than a handful; past this the vision cost
// outgrows the help, and the text still marks where the rest were.
const MAX_FIGURES = 8;
const MAX_FIGURE_BYTES = 4 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
// Crops are small diagrams and graphs; 800px keeps grid labels legible.
const FIGURE_MAX_WIDTH = 800;
const FIGURE_JPEG_QUALITY = 80;

// Only Mathpix's own crop host. Anything else in the markdown came from the
// document itself and is not ours to fetch.
const FIGURE_LINK = /!\[[^\]]*\]\((https:\/\/cdn\.mathpix\.com\/cropped\/[^)\s]+)\)/g;

/**
 * Distinct Mathpix crop URLs in document order. Pure.
 * @param {string} markdown
 * @returns {string[]}
 */
function extractFigureLinks(markdown) {
    if (typeof markdown !== 'string') return [];
    const seen = new Set();
    for (const m of markdown.matchAll(FIGURE_LINK)) seen.add(m[1]);
    return [...seen];
}

/**
 * Replace each crop link with a "[Figure N]" marker, N being its position in
 * extractFigureLinks order. A figure we could not fetch (or past the cap) is
 * still marked, so the tutor knows a figure exists there and asks about it
 * instead of guessing. Pure.
 * @param {string} markdown
 * @param {Array<string|null>} figures  data URLs aligned with the link order
 * @returns {string}
 */
function labelFigures(markdown, figures = []) {
    if (typeof markdown !== 'string') return markdown;
    const order = extractFigureLinks(markdown);
    return markdown.replace(FIGURE_LINK, (_, url) => {
        const i = order.indexOf(url);
        return figures[i] ? `[Figure ${i + 1}]` : `[Figure ${i + 1} — image not available]`;
    });
}

/**
 * Download and downscale the crops. Best-effort per figure: a failure yields
 * null in that slot, never a throw. Must run BEFORE the Mathpix delete.
 * @param {string[]} urls
 * @param {object} [deps]  { get } — axios-like, injectable for tests
 * @returns {Promise<Array<string|null>>} data URLs aligned with urls
 */
async function fetchFigures(urls, deps = {}) {
    const get = deps.get || require('axios').get;
    const list = Array.isArray(urls) ? urls : [];
    return Promise.all(list.map(async (url, i) => {
        if (i >= MAX_FIGURES || !sharp) return null;
        try {
            const res = await get(url, {
                responseType: 'arraybuffer',
                timeout: FETCH_TIMEOUT_MS,
                maxContentLength: MAX_FIGURE_BYTES,
            });
            const buf = Buffer.from(res.data);
            if (!buf.length || buf.length > MAX_FIGURE_BYTES) return null;
            const out = await sharp(buf)
                .resize({ width: FIGURE_MAX_WIDTH, withoutEnlargement: true })
                .jpeg({ quality: FIGURE_JPEG_QUALITY })
                .toBuffer();
            return `data:image/jpeg;base64,${out.toString('base64')}`;
        } catch (err) {
            console.warn(`[pdfFigures] Could not fetch figure ${i + 1}:`, err?.response?.status || err.message);
            return null;
        }
    }));
}

// Vision models see what a figure IS (vector PQ, pointing up and right) but
// miscount grid squares: on the 2026-10-28 worksheet's #1 (key: ⟨5, 3⟩)
// gpt-4o-mini read ⟨4, 5⟩ three times out of three and gpt-4o scattered across
// four answers. A tutor trusting its own count would mark a correct student
// wrong, so the figures arrive with this rule.
const FIGURE_READING_RULE = '[SYSTEM: The worksheet figures follow, labeled to match the [Figure N] markers in its text. Use them for what they show — shapes, labels, direction, which point is where. Coordinates you read off a grid are approximate: have the student read exact points, and never call their reading wrong unless it contradicts the figure in sign or direction.]';

/**
 * Vision content blocks for the model, each figure preceded by the label the
 * worksheet text uses for it. Empty slots are skipped (their marker already
 * says "not available").
 * @param {Array<string|null>} figures
 * @returns {Array<object>}
 */
function figureVisionBlocks(figures) {
    const blocks = [];
    (Array.isArray(figures) ? figures : []).forEach((url, i) => {
        if (typeof url !== 'string' || !url.startsWith('data:')) return;
        blocks.push({ type: 'text', text: `[Figure ${i + 1}] from the worksheet:` });
        blocks.push({ type: 'image_url', image_url: { url, detail: 'high' } });
    });
    if (blocks.length) blocks.unshift({ type: 'text', text: FIGURE_READING_RULE });
    return blocks;
}

module.exports = {
    extractFigureLinks,
    labelFigures,
    fetchFigures,
    figureVisionBlocks,
    FIGURE_READING_RULE,
    MAX_FIGURES,
};

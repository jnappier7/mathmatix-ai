// utils/activeWorksheetImage.js
//
// Keeps an uploaded worksheet IMAGE visible to the tutor across turns.
//
// Background: routes/chat.js already sends an uploaded image to the model as
// vision content on the turn it's uploaded, and it pins PDF *text* for every
// later turn (the "active worksheet"). But image bytes were dropped after the
// upload turn, so a follow-up like "check my answer to #7" had nothing to look
// at. This module re-threads the most recent worksheet image back into the
// tutor's context on follow-up turns, so uploading and "show your work" are one
// coherent conversation the tutor can actually see.
//
// Cost control: re-sending an image every turn forever is wasteful. A worksheet
// session is bursty, so we only re-include the image for a TTL window after it
// was uploaded, and only the single most-recent worksheet image.
const fs = require('fs').promises;

// How long after upload we keep re-showing a worksheet image to the tutor.
const ACTIVE_IMAGE_TTL_MINUTES = 60;
// Don't re-send absurdly large images turn after turn.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Is this StudentUpload doc an image we should still re-show to the tutor?
 * Pure — no IO — so it's cheap to unit test.
 * @param {object} doc  lean StudentUpload ({ fileType, filePath, uploadedAt })
 * @param {number} nowMs
 * @param {number} ttlMinutes
 * @returns {boolean}
 */
function isImageStillActive(doc, nowMs = Date.now(), ttlMinutes = ACTIVE_IMAGE_TTL_MINUTES) {
    if (!doc || doc.fileType !== 'image' || !doc.filePath) return false;
    const uploadedAt = doc.uploadedAt ? new Date(doc.uploadedAt).getTime() : NaN;
    if (Number.isNaN(uploadedAt)) return false;
    const ageMinutes = (nowMs - uploadedAt) / 60000;
    return ageMinutes >= 0 && ageMinutes <= ttlMinutes;
}

/**
 * Read an active worksheet image off disk and return a base64 data URL suitable
 * for an OpenAI image_url content block. Best-effort: returns null if the file
 * is missing, empty, oversized, or unreadable (caller falls back to text-only).
 * @param {object} doc lean StudentUpload ({ filePath, mimeType })
 * @returns {Promise<string|null>}
 */
async function buildImageDataUrl(doc) {
    if (!doc || !doc.filePath || !doc.mimeType) return null;
    try {
        const stat = await fs.stat(doc.filePath);
        if (!stat.isFile() || stat.size === 0 || stat.size > MAX_IMAGE_BYTES) return null;
        const buf = await fs.readFile(doc.filePath);
        return `data:${doc.mimeType};base64,${buf.toString('base64')}`;
    } catch (_) {
        return null;
    }
}

module.exports = {
    isImageStillActive,
    buildImageDataUrl,
    ACTIVE_IMAGE_TTL_MINUTES,
    MAX_IMAGE_BYTES,
};

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
let sharp = null;
try { sharp = require('sharp'); } catch (_) { /* optional — fall back to raw bytes */ }

// How long after upload we keep re-showing a worksheet image to the tutor.
const ACTIVE_IMAGE_TTL_MINUTES = 60;
// Don't re-send absurdly large images turn after turn.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
// Downscale target for the durable copy stored on the upload doc. Wide enough
// to keep handwriting legible, small enough to sit comfortably in MongoDB.
const DURABLE_MAX_WIDTH = 1280;
const DURABLE_JPEG_QUALITY = 80;

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
 * Downscale a raw image buffer into a compact base64 data URL for durable
 * storage on the upload doc. Best-effort: returns null if sharp is unavailable
 * or the encode fails (caller then relies on the on-disk file).
 * @param {Buffer} buffer raw (already EXIF-stripped) image bytes
 * @returns {Promise<string|null>}
 */
async function downscaleToDataUrl(buffer) {
    if (!sharp || !buffer || !buffer.length) return null;
    try {
        const out = await sharp(buffer)
            .rotate()
            .resize({ width: DURABLE_MAX_WIDTH, withoutEnlargement: true })
            .jpeg({ quality: DURABLE_JPEG_QUALITY })
            .toBuffer();
        return `data:image/jpeg;base64,${out.toString('base64')}`;
    } catch (_) {
        return null;
    }
}

/**
 * Return a base64 data URL for the active worksheet image, suitable for an
 * OpenAI image_url block. Prefers the durable copy stored on the doc
 * (instance-independent); falls back to reading the on-disk file for older
 * uploads. Best-effort: returns null if neither is available.
 * @param {object} doc lean StudentUpload ({ imageData, filePath, mimeType })
 * @returns {Promise<string|null>}
 */
async function buildImageDataUrl(doc) {
    if (!doc) return null;
    // Durable copy lives in the DB — works after a restart / on any instance.
    if (typeof doc.imageData === 'string' && doc.imageData.startsWith('data:')) {
        return doc.imageData;
    }
    // Fallback: read the original off local disk (may be gone on Render).
    if (!doc.filePath || !doc.mimeType) return null;
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
    downscaleToDataUrl,
    ACTIVE_IMAGE_TTL_MINUTES,
    MAX_IMAGE_BYTES,
};

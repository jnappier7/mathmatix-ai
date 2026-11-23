// utils/cloudStorage.js
// S3-compatible cloud storage for persistent file uploads (AWS S3, Cloudflare R2, DigitalOcean Spaces, etc.)

const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

// Only initialize S3 if credentials are configured
const isConfigured = !!(process.env.S3_BUCKET && process.env.S3_REGION);

let s3Client = null;

if (isConfigured) {
    const clientConfig = {
        region: process.env.S3_REGION
    };

    // Custom endpoint for S3-compatible services (R2, Spaces, MinIO)
    if (process.env.S3_ENDPOINT) {
        clientConfig.endpoint = process.env.S3_ENDPOINT;
        clientConfig.forcePathStyle = true;
    }

    s3Client = new S3Client(clientConfig);
    console.log(`☁️ [Cloud Storage] S3 configured — bucket: ${process.env.S3_BUCKET}, region: ${process.env.S3_REGION}`);
} else {
    console.log('📁 [Cloud Storage] S3 not configured — using local disk storage');
}

/**
 * Upload a file to S3-compatible storage
 * @param {string} localFilePath - Absolute path to the local file
 * @param {string} s3Key - The S3 object key (e.g., "teacher-resources/{teacherId}/{filename}")
 * @param {string} contentType - MIME type of the file
 * @returns {Promise<string|null>} Public URL of the uploaded file, or null if S3 is not configured
 */
async function uploadFile(localFilePath, s3Key, contentType) {
    if (!isConfigured) return null;

    const fileStream = fs.createReadStream(localFilePath);
    const bucket = process.env.S3_BUCKET;

    try {
        await s3Client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: s3Key,
            Body: fileStream,
            ContentType: contentType
        }));
    } catch (err) {
        observe(err, 'upload');
        throw err;
    }
    observe(null, 'upload');

    // Build public URL
    const publicUrl = process.env.S3_PUBLIC_URL
        ? `${process.env.S3_PUBLIC_URL}/${s3Key}`
        : `https://${bucket}.s3.${process.env.S3_REGION}.amazonaws.com/${s3Key}`;

    console.log(`☁️ [Cloud Storage] Uploaded: ${s3Key}`);
    return publicUrl;
}

/**
 * Delete a file from S3-compatible storage
 * @param {string} s3Key - The S3 object key to delete
 */
async function deleteFile(s3Key) {
    if (!isConfigured || !s3Key) return;

    try {
        await s3Client.send(new DeleteObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: s3Key
        }));
        console.log(`☁️ [Cloud Storage] Deleted: ${s3Key}`);
    } catch (error) {
        console.warn(`⚠️ [Cloud Storage] Failed to delete ${s3Key}:`, error.message);
    }
}

/**
 * Extract the S3 key from a public URL
 * @param {string} publicUrl - The public URL
 * @returns {string|null} The S3 key or null
 */
function getKeyFromUrl(publicUrl) {
    if (!publicUrl) return null;
    try {
        const url = new URL(publicUrl);
        // Remove leading slash
        return url.pathname.replace(/^\//, '');
    } catch {
        return null;
    }
}


/**
 * Open a readable stream for an object, authenticated with our own credentials.
 *
 * This is what lets the bucket stay PRIVATE. The download route already streams
 * the file to the client after checking ownership, student-teacher membership
 * and publish status; it just had no way to read from storage except over plain
 * HTTP, which requires a world-readable bucket. A public bucket would hand out
 * every uploaded worksheet to anyone holding the URL, bypassing all three
 * checks — and teachers upload assessments.
 *
 * @param {string} s3Key
 * @returns {Promise<{body: NodeJS.ReadableStream, contentType: string|undefined}>}
 */
async function getObjectStream(s3Key) {
    if (!isConfigured) throw new Error('Cloud storage is not configured');
    const out = await s3Client.send(new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: s3Key,
    }));
    return { body: out.Body, contentType: out.ContentType };
}

// ---------------------------------------------------------------------------
// Observed health
//
// isConfigured only says the two env vars are present. On 2026-11-23 they were,
// and AWS_ACCESS_KEY_ID held the 64-character secret instead of the 32-character
// key id: every upload since the bucket was switched on had failed, /api/health
// said 'healthy', and the first report came from a teacher uploading a practice
// test two days before the real one. Presence cannot see that; only a signed
// request can.
//
// So: one cheap signed read (list, max 1 key) on first ask and every
// PROBE_INTERVAL_MS after, plus the outcome of every real upload. Latest
// observation wins. The probe is a LIST, not a write — a health poll should not
// create objects — so a token that can write but not list would read 'error'
// here until a real upload succeeds and corrects it.
// ---------------------------------------------------------------------------
const PROBE_INTERVAL_MS = 10 * 60 * 1000;
const PROBE_TIMEOUT_MS = 8000;

const health = {
    status: isConfigured ? 'unconfirmed' : 'off',
    code: null,        // SDK error name — safe for the public endpoint
    message: null,     // provider's own sentence — admin surfaces only
    source: null,      // 'probe' | 'upload'
    checkedAt: null,
    lastOkAt: null,
};
let probeInFlight = null;
let lastProbeAt = 0;

function observe(err, source) {
    const now = Date.now();
    health.source = source;
    health.checkedAt = now;
    if (!err) {
        health.status = 'ok';
        health.code = null;
        health.message = null;
        health.lastOkAt = now;
        return;
    }
    const firstFailure = health.status !== 'error';
    health.status = 'error';
    health.code = err.name || err.Code || 'Error';
    health.message = err.message || null;
    if (firstFailure) {
        console.error(`❌ [Cloud Storage] ${source} failed — teacher uploads will be refused: ${health.code}: ${health.message}`);
    }
}

/** One signed read against the bucket. Never throws; resolves to the status. */
function probe() {
    if (!isConfigured) return Promise.resolve('off');
    if (probeInFlight) return probeInFlight;
    lastProbeAt = Date.now();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), PROBE_TIMEOUT_MS);
    if (timer.unref) timer.unref();
    probeInFlight = Promise.resolve()
        .then(() => s3Client.send(
            new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, MaxKeys: 1 }),
            { abortSignal: abort.signal }
        ))
        .then(() => observe(null, 'probe'), (err) => observe(err, 'probe'))
        .then(() => {
            clearTimeout(timer);
            probeInFlight = null;
            return health.status;
        });
    return probeInFlight;
}

/**
 * Synchronous snapshot for the health endpoints; kicks off a background probe
 * when the last one is stale. 'unconfirmed' (nothing observed yet) lasts only
 * until the first probe returns.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.includeDetail] - add the provider's error sentence.
 *   Admin only: it is third-party prose and /api/health is unauthenticated.
 */
function storageReport({ includeDetail = false } = {}) {
    if (!isConfigured) return { status: 'off' };
    if (Date.now() - lastProbeAt > PROBE_INTERVAL_MS) probe();
    const iso = (ms) => (ms ? new Date(ms).toISOString() : null);
    const out = {
        status: health.status,
        code: health.code,
        source: health.source,
        checkedAt: iso(health.checkedAt),
        lastOkAt: iso(health.lastOkAt),
    };
    if (includeDetail) out.message = health.message;
    return out;
}

module.exports = {
    isConfigured,
    probe,
    storageReport,
    uploadFile,
    getObjectStream,
    deleteFile,
    getKeyFromUrl
};

// utils/cloudStorage.js
// S3-compatible cloud storage for persistent file uploads (AWS S3, Cloudflare R2, DigitalOcean Spaces, etc.)

const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
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

    await s3Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: fileStream,
        ContentType: contentType
    }));

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

module.exports = {
    isConfigured,
    uploadFile,
    deleteFile,
    getKeyFromUrl
};

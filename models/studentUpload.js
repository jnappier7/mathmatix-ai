// models/studentUpload.js
// Track student file uploads for their personal resource library

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const studentUploadSchema = new Schema({
    // User reference
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // File metadata
    originalFilename: {
        type: String,
        required: true
    },

    storedFilename: {
        type: String,
        required: true,
        unique: true
    },

    filePath: {
        type: String,
        required: true
    },

    fileType: {
        type: String,
        enum: ['image', 'pdf'],
        required: true
    },

    mimeType: {
        type: String,
        required: true
    },

    fileSize: {
        type: Number,
        required: true
    },

    // Content for AI context
    extractedText: {
        type: String,
        default: ''
    },

    // Optional thumbnail for preview (base64 or path)
    thumbnail: {
        type: String,
        default: null
    },

    // Metadata
    uploadedAt: {
        type: Date,
        default: Date.now,
        index: true
    },

    // Optional: track which conversation this was used in
    conversationId: {
        type: Schema.Types.ObjectId,
        ref: 'Conversation',
        default: null
    },

    // Tags for categorization (future feature)
    tags: [{
        type: String,
        trim: true
    }],

    // Student notes about this file
    notes: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// Compound index for efficient queries
studentUploadSchema.index({ userId: 1, uploadedAt: -1 });

// Static method to get recent uploads for a user
studentUploadSchema.statics.getRecentUploads = async function(userId, limit = 20) {
    return this.find({ userId })
        .sort({ uploadedAt: -1 })
        .limit(limit)
        .select('-extractedText') // Exclude large text field for list view
        .lean();
};

// Static method to get upload with full details (including extracted text)
studentUploadSchema.statics.getUploadDetails = async function(uploadId, userId) {
    return this.findOne({ _id: uploadId, userId }).lean();
};

// Instance method to generate a small webp thumbnail next to the original.
// Best-effort: returns null on failure (callers should fall back to the
// full image). PDFs are skipped — sharp can't natively rasterize PDF
// pages and pdf-to-image is too heavy for the upload hot path.
studentUploadSchema.methods.generateThumbnail = async function() {
    if (this.fileType !== 'image' || !this.filePath) return null;

    const path = require('path');
    const fs = require('fs/promises');
    let sharp;
    try {
        sharp = require('sharp');
    } catch (_) {
        return null; // sharp not installed in this env
    }

    try {
        const dir = path.join(path.dirname(this.filePath), 'thumbnails');
        await fs.mkdir(dir, { recursive: true });
        const baseName = path.basename(this.storedFilename, path.extname(this.storedFilename));
        const thumbPath = path.join(dir, `${baseName}.webp`);

        await sharp(this.filePath)
            .rotate() // honor EXIF orientation
            .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 75 })
            .toFile(thumbPath);

        this.thumbnail = thumbPath;
        // Don't await save — caller decides when to persist. Many callers
        // create+save the doc then call this in the background.
        return thumbPath;
    } catch (_) {
        return null;
    }
};

// Field-level encryption for student file metadata
const { encryptFields } = require('../utils/fieldEncryption');
studentUploadSchema.plugin(encryptFields, {
  fields: ['originalFilename', 'extractedText', 'notes']
});

module.exports = mongoose.model('StudentUpload', studentUploadSchema);

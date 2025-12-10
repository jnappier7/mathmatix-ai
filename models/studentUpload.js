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

// Instance method to generate thumbnail from image
studentUploadSchema.methods.generateThumbnail = async function() {
    // TODO: Implement thumbnail generation if needed
    // For now, we'll just use the full image
    return this.filePath;
};

module.exports = mongoose.model('StudentUpload', studentUploadSchema);

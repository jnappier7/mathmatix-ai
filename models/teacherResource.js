// models/teacherResource.js
// Model for teacher-uploaded resources that students can reference in chat

const mongoose = require('mongoose');

const teacherResourceSchema = new mongoose.Schema({
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    // Display name for the resource (e.g., "Module 6.2 Practice")
    displayName: {
        type: String,
        required: true,
        trim: true
    },
    // Original filename
    originalFilename: {
        type: String,
        required: true
    },
    // Stored filename (with path)
    storedFilename: {
        type: String,
        required: true
    },
    // File type (pdf, docx, png, etc.)
    fileType: {
        type: String,
        required: true,
        lowercase: true
    },
    // MIME type
    mimeType: {
        type: String,
        required: true
    },
    // File size in bytes
    fileSize: {
        type: Number,
        required: true
    },
    // Optional description
    description: {
        type: String,
        default: ''
    },
    // Keywords/tags for easier searching
    keywords: [{
        type: String,
        lowercase: true,
        trim: true
    }],
    // Optional: Link to specific curriculum lesson
    lessonId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Curriculum.lessons'
    },
    // Category (worksheet, practice, homework, notes, etc.)
    category: {
        type: String,
        enum: ['worksheet', 'practice', 'homework', 'notes', 'test', 'quiz', 'handout', 'other'],
        default: 'other'
    },
    // Extracted text content (for searchability and AI context)
    extractedText: {
        type: String,
        default: ''
    },
    // Public URL (if hosted)
    publicUrl: {
        type: String
    },
    // Upload metadata
    uploadedAt: {
        type: Date,
        default: Date.now
    },
    // Track usage
    accessCount: {
        type: Number,
        default: 0
    },
    lastAccessed: {
        type: Date
    }
}, {
    timestamps: true
});

// Index for searching by teacher and name
teacherResourceSchema.index({ teacherId: 1, displayName: 1 });

// Index for keyword search
teacherResourceSchema.index({ teacherId: 1, keywords: 1 });

// Method to find resource by fuzzy name matching
teacherResourceSchema.statics.findByName = async function(teacherId, searchText) {
    // Normalize search text
    const normalized = searchText.toLowerCase().trim();

    // Try exact match first
    let resource = await this.findOne({
        teacherId,
        displayName: { $regex: new RegExp(`^${normalized}$`, 'i') }
    });

    if (resource) return resource;

    // Try partial match
    resource = await this.findOne({
        teacherId,
        displayName: { $regex: new RegExp(normalized, 'i') }
    });

    if (resource) return resource;

    // Try keyword match
    resource = await this.findOne({
        teacherId,
        keywords: { $in: normalized.split(/\s+/) }
    });

    return resource;
};

// Method to search for resources
teacherResourceSchema.statics.search = async function(teacherId, query) {
    const normalized = query.toLowerCase().trim();
    const keywords = normalized.split(/\s+/);

    return this.find({
        teacherId,
        $or: [
            { displayName: { $regex: new RegExp(normalized, 'i') } },
            { keywords: { $in: keywords } },
            { description: { $regex: new RegExp(normalized, 'i') } }
        ]
    }).sort({ accessCount: -1, uploadedAt: -1 });
};

// Method to increment access count
teacherResourceSchema.methods.recordAccess = async function() {
    this.accessCount += 1;
    this.lastAccessed = new Date();
    await this.save();
};

module.exports = mongoose.model('TeacherResource', teacherResourceSchema);

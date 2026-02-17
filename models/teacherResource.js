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
    // Whether the resource is published and available to students
    isPublished: {
        type: Boolean,
        default: true // New resources are published by default
    },
    // Extracted text content (for searchability and AI context)
    extractedText: {
        type: String,
        default: ''
    },
    // DIRECTIVE 3: Vector embedding for semantic search (using OpenAI text-embedding-3-small)
    embedding: {
        type: [Number],
        default: null
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
        isPublished: true,
        displayName: { $regex: new RegExp(`^${normalized}$`, 'i') }
    });

    if (resource) return resource;

    // Try partial match
    resource = await this.findOne({
        teacherId,
        isPublished: true,
        displayName: { $regex: new RegExp(normalized, 'i') }
    });

    if (resource) return resource;

    // Try keyword match
    resource = await this.findOne({
        teacherId,
        isPublished: true,
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
        isPublished: true,
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

// DIRECTIVE 3: Cosine similarity function for vector search
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
        return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
        return 0;
    }

    return dotProduct / (normA * normB);
}

// DIRECTIVE 3: Vector similarity search method
teacherResourceSchema.statics.vectorSearch = async function(teacherId, queryEmbedding, limit = 5) {
    // Get all resources for this teacher that have embeddings
    const resources = await this.find({
        teacherId,
        isPublished: true,
        embedding: { $exists: true, $ne: null, $not: { $size: 0 } }
    }).lean();

    if (resources.length === 0) {
        console.log('⚠️ [Vector Search] No resources with embeddings found');
        return [];
    }

    // Calculate similarity for each resource
    const resourcesWithScores = resources.map(resource => ({
        resource,
        similarity: cosineSimilarity(queryEmbedding, resource.embedding)
    }));

    // Sort by similarity (highest first) and return top N
    resourcesWithScores.sort((a, b) => b.similarity - a.similarity);

    console.log(`🔍 [Vector Search] Top ${limit} matches:`,
        resourcesWithScores.slice(0, limit).map(r =>
            `${r.resource.displayName} (similarity: ${r.similarity.toFixed(3)})`
        )
    );

    return resourcesWithScores
        .slice(0, limit)
        .map(item => ({
            ...item.resource,
            _similarityScore: item.similarity
        }));
};

module.exports = mongoose.model('TeacherResource', teacherResourceSchema);

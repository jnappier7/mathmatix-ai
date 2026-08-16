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
    // Which classes (enrollment codes) this resource is shared with.
    //
    // EMPTY MEANS EVERY STUDENT LINKED TO THIS TEACHER. That is not a
    // placeholder — it is the pre-existing behaviour of this model, which had
    // no class concept at all, so every resource uploaded before this field
    // existed keeps working untouched and a teacher who ignores the picker
    // gets exactly what they got before. "Share with one class" is the opt-in.
    sharedWithClassIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'EnrollmentCode'
    }],
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

// Class-scoped student lookups
teacherResourceSchema.index({ teacherId: 1, isPublished: 1, sharedWithClassIds: 1 });

/**
 * THE one rule for "may this student see this resource".
 *
 * Every student-facing path composes this instead of hand-rolling its own
 * filter: the resources list, the download endpoint, and — the one that is
 * easy to forget — the AI tutor's resource lookup, which pulls a resource's
 * extracted TEXT into the prompt. A class filter enforced on the download
 * button but not on the tutor would still hand Class B the contents of Class
 * A's test the moment a student named it in chat.
 *
 * `teacherId` accepts a SINGLE id or an ARRAY. A student can have more than
 * one teacher — the relationship is many-to-many through EnrollmentCode, and
 * `user.teacherId` is only the most recent one — so the student path passes
 * the whole set from getStudentScope(). Passing one id still works and is what
 * the teacher's own views do.
 *
 * `classIds` is the set of classes the student belongs to. A resource is
 * visible when it is targeted at no class at all (teacher-wide, the legacy
 * and default shape) or at one of the student's classes.
 *
 * Passing classIds = null/undefined means "do not scope by class" and is for
 * the TEACHER's own views only — never for a student request.
 */
teacherResourceSchema.statics.visibleToStudentFilter = function(teacherId, classIds) {
    const base = {
        teacherId: Array.isArray(teacherId) ? { $in: teacherId } : teacherId,
        isPublished: true
    };
    if (!Array.isArray(classIds)) return base;
    return {
        ...base,
        $or: [
            { sharedWithClassIds: { $size: 0 } },
            { sharedWithClassIds: { $exists: false } },
            { sharedWithClassIds: { $in: classIds } }
        ]
    };
};

// Method to find resource by fuzzy name matching
teacherResourceSchema.statics.findByName = async function(teacherId, searchText, classIds) {
    // Normalize search text
    const normalized = searchText.toLowerCase().trim();
    // Escape special regex characters (e.g. parentheses in "Module 8 Test PRACTICE (A)")
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const visible = this.visibleToStudentFilter(teacherId, classIds);

    // Try exact match first
    let resource = await this.findOne({
        ...visible,
        displayName: { $regex: new RegExp(`^${escaped}$`, 'i') }
    });

    if (resource) return resource;

    // Try partial match
    resource = await this.findOne({
        ...visible,
        displayName: { $regex: new RegExp(escaped, 'i') }
    });

    if (resource) return resource;

    // Try keyword match
    resource = await this.findOne({
        ...visible,
        keywords: { $in: normalized.split(/\s+/) }
    });

    return resource;
};

// Method to search for resources
teacherResourceSchema.statics.search = async function(teacherId, query, classIds) {
    const normalized = query.toLowerCase().trim();
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const keywords = normalized.split(/\s+/);

    // The visibility filter carries its own $or, and so does the text match.
    // Spreading both onto one object would silently drop the first — put them
    // under $and so a class-scoped search cannot widen into every resource.
    const { $or: visibilityOr, ...visible } = this.visibleToStudentFilter(teacherId, classIds);
    const textMatch = {
        $or: [
            { displayName: { $regex: new RegExp(escaped, 'i') } },
            { keywords: { $in: keywords } },
            { description: { $regex: new RegExp(escaped, 'i') } }
        ]
    };

    return this.find({
        ...visible,
        ...(visibilityOr ? { $and: [{ $or: visibilityOr }, textMatch] } : textMatch)
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
teacherResourceSchema.statics.vectorSearch = async function(teacherId, queryEmbedding, limit = 5, classIds) {
    // Get all resources for this teacher that have embeddings
    const resources = await this.find({
        ...this.visibleToStudentFilter(teacherId, classIds),
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

// Field-level encryption for extracted content
const { encryptFields } = require('../utils/fieldEncryption');
teacherResourceSchema.plugin(encryptFields, {
  fields: ['extractedText']
});

module.exports = mongoose.model('TeacherResource', teacherResourceSchema);

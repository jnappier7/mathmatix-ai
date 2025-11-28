// models/curriculum.js
// Curriculum schedule model for tracking lesson plans and topics

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/* ---------- LESSON/TOPIC SUB-SCHEMA ---------- */
const lessonSchema = new Schema({
    weekNumber: { type: Number, required: true },
    startDate: { type: Date },
    endDate: { type: Date },
    topic: { type: String, required: true, trim: true },
    standards: [String], // e.g., ["8.EE.1", "8.EE.2"]
    objectives: [String], // Learning objectives for the week
    keywords: [String], // Keywords for AI to reference
    notes: String,
    resources: [String] // Links to resources, worksheets, etc.
}, { _id: true });

/* ---------- MAIN CURRICULUM SCHEMA ---------- */
const curriculumSchema = new Schema({
    // Ownership
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // Curriculum Info
    name: { type: String, required: true, trim: true }, // e.g., "Algebra 1 2024-2025"
    courseLevel: { type: String, trim: true }, // e.g., "Algebra 1", "Geometry"
    gradeLevel: { type: String, trim: true }, // e.g., "8th Grade"
    schoolYear: { type: String, trim: true }, // e.g., "2024-2025"

    // Schedule
    lessons: { type: [lessonSchema], default: [] },

    // Settings
    isActive: { type: Boolean, default: true }, // Only one active curriculum per teacher
    autoSyncWithAI: { type: Boolean, default: true }, // Automatically provide context to AI

    // Teacher preferences for AI behavior
    teacherPreferences: {
        terminology: { type: String, default: '' }, // Preferred mathematical terminology
        solutionMethods: { type: String, default: '' }, // Preferred solution approaches
        scaffolding: { type: String, default: '' }, // How to break down problems
        commonMistakes: { type: String, default: '' }, // Common student mistakes to watch for
        additionalGuidance: { type: String, default: '' } // Any other guidance for the AI
    },

    // Import metadata
    importSource: { type: String, enum: ['manual', 'csv', 'excel', 'pdf', 'common-curriculum'], default: 'manual' },
    importedAt: { type: Date },

    // Timestamps
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

/* ---------- INDEXES ---------- */
curriculumSchema.index({ teacherId: 1, isActive: 1 });
curriculumSchema.index({ 'lessons.weekNumber': 1 });
curriculumSchema.index({ 'lessons.startDate': 1, 'lessons.endDate': 1 });

/* ---------- INSTANCE METHODS ---------- */

// Get current week's lesson based on today's date
curriculumSchema.methods.getCurrentLesson = function() {
    const today = new Date();
    return this.lessons.find(lesson => {
        if (lesson.startDate && lesson.endDate) {
            return today >= lesson.startDate && today <= lesson.endDate;
        }
        return false;
    });
};

// Get lesson by week number
curriculumSchema.methods.getLessonByWeek = function(weekNumber) {
    return this.lessons.find(lesson => lesson.weekNumber === weekNumber);
};

// Get lessons in date range
curriculumSchema.methods.getLessonsInRange = function(startDate, endDate) {
    return this.lessons.filter(lesson => {
        if (!lesson.startDate) return false;
        return lesson.startDate >= startDate && lesson.startDate <= endDate;
    });
};

// Get AI context string for current lesson
curriculumSchema.methods.getAIContext = function() {
    const currentLesson = this.getCurrentLesson();
    if (!currentLesson) return '';

    let context = `The class is currently covering: ${currentLesson.topic}`;

    if (currentLesson.standards && currentLesson.standards.length > 0) {
        context += ` (Standards: ${currentLesson.standards.join(', ')})`;
    }

    if (currentLesson.objectives && currentLesson.objectives.length > 0) {
        context += `. Learning objectives: ${currentLesson.objectives.join('; ')}`;
    }

    if (currentLesson.keywords && currentLesson.keywords.length > 0) {
        context += `. Key concepts: ${currentLesson.keywords.join(', ')}`;
    }

    // Add teacher preferences for AI behavior
    if (this.teacherPreferences) {
        const prefs = this.teacherPreferences;

        if (prefs.terminology) {
            context += `\n\nTERMINOLOGY PREFERENCES: ${prefs.terminology}`;
        }

        if (prefs.solutionMethods) {
            context += `\n\nPREFERRED SOLUTION METHODS: ${prefs.solutionMethods}`;
        }

        if (prefs.scaffolding) {
            context += `\n\nSCAFFOLDING APPROACH: ${prefs.scaffolding}`;
        }

        if (prefs.commonMistakes) {
            context += `\n\nCOMMON MISTAKES TO WATCH FOR: ${prefs.commonMistakes}`;
        }

        if (prefs.additionalGuidance) {
            context += `\n\nADDITIONAL GUIDANCE: ${prefs.additionalGuidance}`;
        }
    }

    // Add available resources
    if (currentLesson.resources && currentLesson.resources.length > 0) {
        context += `\n\nAVAILABLE RESOURCES: The teacher has provided ${currentLesson.resources.length} resource(s) for this topic. You can reference these materials when helping the student.`;
    }

    return context;
};

/* ---------- STATIC METHODS ---------- */

// Get active curriculum for a teacher
curriculumSchema.statics.getActiveCurriculum = async function(teacherId) {
    return this.findOne({ teacherId, isActive: true });
};

// Deactivate all curricula for a teacher (before activating a new one)
curriculumSchema.statics.deactivateAll = async function(teacherId) {
    return this.updateMany({ teacherId }, { isActive: false });
};

/* ---------- EXPORT MODEL ---------- */
const Curriculum = mongoose.models.Curriculum || mongoose.model('Curriculum', curriculumSchema);
module.exports = Curriculum;

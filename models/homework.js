// models/homework.js
// Homework/Assignment model for teacher-student workflow

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/* ---------- SUBMISSION SUB-SCHEMA ---------- */
const submissionSchema = new Schema({
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    submittedAt: { type: Date, default: Date.now },
    answers: [{
        questionIndex: Number,
        studentAnswer: String,
        isCorrect: { type: Boolean, default: null }, // null = not graded yet
        feedback: String,
        pointsEarned: { type: Number, default: 0 }
    }],
    totalScore: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    percentScore: { type: Number, default: 0 },
    status: { type: String, enum: ['submitted', 'graded', 'needs-revision'], default: 'submitted' },
    teacherFeedback: String,
    aiGraded: { type: Boolean, default: false }
}, { _id: true });

/* ---------- QUESTION SUB-SCHEMA ---------- */
const questionSchema = new Schema({
    question: { type: String, required: true },
    correctAnswer: String, // For auto-grading
    acceptableAnswers: [String], // Alternative correct answers
    points: { type: Number, default: 1 },
    type: {
        type: String,
        enum: ['multiple-choice', 'short-answer', 'equation', 'word-problem'],
        default: 'short-answer'
    },
    choices: [String], // For multiple-choice questions
    hint: String
}, { _id: true });

/* ---------- MAIN HOMEWORK SCHEMA ---------- */
const homeworkSchema = new Schema({
    // Assignment Metadata
    title: { type: String, required: true, trim: true },
    description: String,
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // Assignment Content
    questions: { type: [questionSchema], default: [] },
    totalPoints: { type: Number, default: 0 },

    // Assignment Settings
    assignedTo: [{ type: Schema.Types.ObjectId, ref: 'User' }], // Array of student IDs
    dueDate: { type: Date, required: true },
    topic: { type: String, trim: true },
    difficultyLevel: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },

    // IEP Support
    allowExtendedTime: { type: Boolean, default: false },
    allowCalculator: { type: Boolean, default: false },
    allowHints: { type: Boolean, default: true },

    // Submissions
    submissions: { type: [submissionSchema], default: [] },

    // Tracking
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

/* ---------- PRE-SAVE HOOK ---------- */
homeworkSchema.pre('save', function(next) {
    // Calculate total points from questions
    if (this.questions && this.questions.length > 0) {
        this.totalPoints = this.questions.reduce((sum, q) => sum + (q.points || 1), 0);
    }

    // Update each submission's maxScore
    if (this.submissions && this.submissions.length > 0) {
        this.submissions.forEach(sub => {
            sub.maxScore = this.totalPoints;
            // Recalculate percent score
            if (sub.totalScore !== undefined && this.totalPoints > 0) {
                sub.percentScore = Math.round((sub.totalScore / this.totalPoints) * 100);
            }
        });
    }

    next();
});

/* ---------- INSTANCE METHODS ---------- */

// Get submission for a specific student
homeworkSchema.methods.getStudentSubmission = function(studentId) {
    return this.submissions.find(sub => sub.studentId.equals(studentId));
};

// Check if student has submitted
homeworkSchema.methods.hasStudentSubmitted = function(studentId) {
    return this.submissions.some(sub => sub.studentId.equals(studentId));
};

// Get completion rate
homeworkSchema.methods.getCompletionRate = function() {
    if (!this.assignedTo || this.assignedTo.length === 0) return 0;
    const submitted = this.submissions.length;
    return Math.round((submitted / this.assignedTo.length) * 100);
};

// Get average score
homeworkSchema.methods.getAverageScore = function() {
    if (!this.submissions || this.submissions.length === 0) return 0;
    const gradedSubmissions = this.submissions.filter(s => s.status === 'graded');
    if (gradedSubmissions.length === 0) return 0;
    const totalPercent = gradedSubmissions.reduce((sum, s) => sum + s.percentScore, 0);
    return Math.round(totalPercent / gradedSubmissions.length);
};

/* ---------- EXPORT MODEL ---------- */
const Homework = mongoose.models.Homework || mongoose.model('Homework', homeworkSchema);
module.exports = Homework;

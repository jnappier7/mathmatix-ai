// models/course.js
// Course definition model - defines structured courses with gradual release lessons and assessments

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/* ---------- GRADUAL RELEASE LESSON PHASE ---------- */
// Each lesson follows "I Do → We Do → You Do" gradual release of responsibility
const lessonPhaseSchema = new Schema({
  phaseType: {
    type: String,
    required: true,
    enum: ['i-do', 'we-do', 'you-do'],
    // i-do:  Direct instruction - AI teaches concept with worked examples
    // we-do: Guided practice - Scaffolded problems with AI support
    // you-do: Independent practice - Student works on their own
  },
  title: { type: String, required: true },
  description: { type: String },

  // Content for the phase
  content: {
    // Instructional content (primarily for i-do phase)
    explanation: { type: String },           // Main concept explanation
    workedExamples: [{
      problem: { type: String },
      steps: [{ type: String }],
      solution: { type: String },
      tip: { type: String }
    }],
    keyVocabulary: [{
      term: { type: String },
      definition: { type: String }
    }],
    visualAids: [{ type: String }],          // Descriptions of diagrams/visuals AI should generate

    // Practice configuration (primarily for we-do and you-do phases)
    practiceConfig: {
      skillIds: [{ type: String }],          // Skills to practice from the skill bank
      problemCount: { type: Number, default: 5 },
      difficultyRange: {
        min: { type: Number, default: 1 },
        max: { type: Number, default: 5 }
      },
      scaffoldingLevel: {
        type: String,
        enum: ['high', 'medium', 'low', 'none'],
        default: 'medium'
        // high: AI provides step-by-step guidance (we-do)
        // medium: AI gives hints when stuck (we-do)
        // low: AI only helps after 2 wrong attempts (you-do)
        // none: No AI help - assessment mode
      },
      allowHints: { type: Boolean, default: true },
      maxHints: { type: Number, default: 3 },
      timeLimit: { type: Number },           // Optional time limit in minutes
    },

    // Teaching prompts for the AI tutor
    aiGuidance: {
      teachingApproach: { type: String },    // How AI should teach this concept
      commonMisconceptions: [{ type: String }],
      scaffoldingPrompts: [{ type: String }], // Prompts to use when student is stuck
      extensionPrompts: [{ type: String }],   // For students who finish early
      realWorldConnections: [{ type: String }]
    }
  },

  // Completion criteria for this phase
  completionCriteria: {
    minProblemsCorrect: { type: Number },
    minAccuracy: { type: Number },           // 0-100 percentage
    requiredTime: { type: Number },          // Minimum minutes to spend
  },

  // Order within the lesson
  order: { type: Number, required: true }
}, { _id: true });

/* ---------- LESSON ASSESSMENT ---------- */
const lessonAssessmentSchema = new Schema({
  assessmentType: {
    type: String,
    required: true,
    enum: ['mastery-check', 'exit-ticket', 'quiz', 'unit-test', 'performance-task']
    // mastery-check: Quick 3-5 question check after each lesson
    // exit-ticket: 1-2 questions to check understanding
    // quiz: Mid-unit quiz (8-12 questions)
    // unit-test: End-of-unit comprehensive test (15-25 questions)
    // performance-task: Open-ended real-world application
  },
  title: { type: String, required: true },
  description: { type: String },
  skillIds: [{ type: String }],             // Skills assessed
  questionCount: { type: Number, required: true },
  passingScore: { type: Number, default: 80 }, // Percentage to pass
  timeLimit: { type: Number },              // Time limit in minutes
  allowRetakes: { type: Boolean, default: true },
  maxRetakes: { type: Number, default: 3 },

  // For performance tasks
  performanceTask: {
    scenario: { type: String },             // Real-world scenario description
    requirements: [{ type: String }],       // What student must demonstrate
    rubric: [{
      criterion: { type: String },
      points: { type: Number },
      description: { type: String }
    }]
  }
}, { _id: true });

/* ---------- LESSON ---------- */
const courseLessonSchema = new Schema({
  lessonId: { type: String, required: true },
  title: { type: String, required: true },
  subtitle: { type: String },
  description: { type: String },
  order: { type: Number, required: true },

  // Gradual release phases
  phases: [lessonPhaseSchema],

  // End-of-lesson assessment
  assessment: lessonAssessmentSchema,

  // Lesson metadata
  estimatedMinutes: { type: Number, default: 45 },
  skillIds: [{ type: String }],             // Primary skills covered
  standardsAlignment: [{ type: String }],   // Common Core / state standards
  prerequisites: [{ type: String }],        // Lesson IDs that must be completed first

  // Differentiation
  enrichment: {
    description: { type: String },
    challengeProblems: [{ type: String }]
  },
  intervention: {
    description: { type: String },
    prerequisiteReview: [{ type: String }]  // Skill IDs to review if struggling
  }
}, { _id: true });

/* ---------- UNIT ---------- */
const courseUnitSchema = new Schema({
  unitId: { type: String, required: true },
  title: { type: String, required: true },
  subtitle: { type: String },
  description: { type: String },
  order: { type: Number, required: true },
  quarter: { type: Number, min: 1, max: 4 },

  // Essential questions that drive the unit
  essentialQuestions: [{ type: String }],

  // Big ideas / enduring understandings
  bigIdeas: [{ type: String }],

  // Lessons within the unit
  lessons: [courseLessonSchema],

  // Unit-level assessment
  unitAssessment: lessonAssessmentSchema,

  // Unit metadata
  estimatedDays: { type: Number },
  skillIds: [{ type: String }],             // All skills covered in unit
  standardsAlignment: [{ type: String }]
}, { _id: true });

/* ---------- MAIN COURSE SCHEMA ---------- */
const courseSchema = new Schema({
  courseId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  title: { type: String, required: true },
  subtitle: { type: String },
  description: { type: String },
  subject: {
    type: String,
    required: true,
    enum: ['mathematics', 'algebra', 'geometry', 'statistics', 'calculus']
  },
  gradeLevel: { type: String },            // e.g., "8-9", "9-10"
  gradeBand: {
    type: String,
    enum: ['K-5', '5-8', '8-12', 'Calculus', 'Calc 3']
  },
  audience: {
    type: String,
    enum: ['student', 'parent'],
    default: 'student'
    // student: Traditional courses for learners
    // parent: Mini-courses helping parents understand modern math methods
  },
  courseType: {
    type: String,
    enum: ['full-course', 'mini-course'],
    default: 'full-course'
    // full-course: Standard multi-unit course (semester/year)
    // mini-course: Short focused course (a few lessons per unit)
  },

  // Course structure
  units: [courseUnitSchema],

  // Enrollment settings
  enrollment: {
    isOpen: { type: Boolean, default: true },
    maxStudents: { type: Number },
    requiresApproval: { type: Boolean, default: false },
    selfEnrollEnabled: { type: Boolean, default: true },
    enrollmentStartDate: { type: Date },
    enrollmentEndDate: { type: Date }
  },

  // Course-level settings
  settings: {
    autoAdvance: { type: Boolean, default: true },
    practiceRequirement: { type: Number, default: 3 },
    masteryThreshold: { type: Number, default: 80 },
    allowSkipAhead: { type: Boolean, default: false },
    showProgressToStudent: { type: Boolean, default: true },
    enableGamification: { type: Boolean, default: true },
    adaptiveDifficulty: { type: Boolean, default: true }
  },

  // Prerequisites
  prerequisites: [{
    courseId: { type: String },
    courseName: { type: String },
    required: { type: Boolean, default: false }
  }],

  // Metadata
  version: { type: String, default: '1.0' },
  createdBy: { type: String, default: 'system' },
  isActive: { type: Boolean, default: true },
  isPublished: { type: Boolean, default: false },

  // Statistics (updated periodically)
  stats: {
    totalEnrolled: { type: Number, default: 0 },
    totalCompleted: { type: Number, default: 0 },
    averageCompletionDays: { type: Number },
    averageScore: { type: Number }
  }
}, { timestamps: true });

/* ---------- INDEXES ---------- */
courseSchema.index({ courseId: 1 });
courseSchema.index({ subject: 1, isActive: 1 });
courseSchema.index({ isPublished: 1, isActive: 1 });
courseSchema.index({ audience: 1, isPublished: 1, isActive: 1 });

/* ---------- INSTANCE METHODS ---------- */

// Get a specific unit by ID
courseSchema.methods.getUnit = function(unitId) {
  return this.units.find(u => u.unitId === unitId);
};

// Get a specific lesson by ID
courseSchema.methods.getLesson = function(lessonId) {
  for (const unit of this.units) {
    const lesson = unit.lessons.find(l => l.lessonId === lessonId);
    if (lesson) return { unit, lesson };
  }
  return null;
};

// Get the next lesson after a given lesson
courseSchema.methods.getNextLesson = function(currentLessonId) {
  let foundCurrent = false;
  for (const unit of this.units.sort((a, b) => a.order - b.order)) {
    for (const lesson of unit.lessons.sort((a, b) => a.order - b.order)) {
      if (foundCurrent) return { unit, lesson };
      if (lesson.lessonId === currentLessonId) foundCurrent = true;
    }
  }
  return null; // No next lesson (course complete)
};

// Get total lesson count
courseSchema.methods.getTotalLessons = function() {
  return this.units.reduce((sum, unit) => sum + unit.lessons.length, 0);
};

// Get course outline (lightweight version for display)
courseSchema.methods.getOutline = function() {
  return {
    courseId: this.courseId,
    title: this.title,
    description: this.description,
    units: this.units.map(unit => ({
      unitId: unit.unitId,
      title: unit.title,
      order: unit.order,
      quarter: unit.quarter,
      lessonCount: unit.lessons.length,
      lessons: unit.lessons.map(lesson => ({
        lessonId: lesson.lessonId,
        title: lesson.title,
        order: lesson.order,
        estimatedMinutes: lesson.estimatedMinutes,
        skillIds: lesson.skillIds
      }))
    }))
  };
};

/* ---------- STATIC METHODS ---------- */

// Get all published courses
courseSchema.statics.getPublishedCourses = async function(filter = {}) {
  const query = { isPublished: true, isActive: true, ...filter };
  return this.find(query)
    .select('courseId title subtitle description subject gradeLevel gradeBand audience courseType enrollment stats')
    .lean();
};

// Get course by ID with full content
courseSchema.statics.getFullCourse = async function(courseId) {
  return this.findOne({ courseId, isActive: true });
};

/* ---------- EXPORT ---------- */
const Course = mongoose.models.Course || mongoose.model('Course', courseSchema);
module.exports = Course;

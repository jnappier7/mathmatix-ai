/**
 * PROBLEM MODEL
 *
 * Simplified schema matching the cleaned JSON format.
 * Uses 1-5 difficulty scale and structured answer objects.
 *
 * @model Problem
 */

const mongoose = require('mongoose');
const { compareAnswer } = require('../utils/answerComparison');
const crypto = require('crypto');

const problemSchema = new mongoose.Schema({
  // Unique identifier (UUID)
  problemId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Primary skill this problem tests
  skillId: {
    type: String,
    required: true,
    ref: 'Skill',
    index: true
  },

  // Secondary skills (for cross-skill problems)
  secondarySkillIds: [{
    type: String,
    ref: 'Skill'
  }],

  // Problem prompt (the question text)
  prompt: {
    type: String,
    required: true
  },

  // Optional SVG diagram for visual problems
  svg: {
    type: String
  },

  // Optional declarative figure (fixed-library kind + concrete params) for
  // problems whose visual is drawn by the renderer rather than a baked SVG.
  // Shape: { kind: 'grid'|'numberline'|'parabola'|..., params: {...},
  //          keyFigure?: { kind, params } }  (see seeds/alg1-assessments/ALG1_SPEC.md)
  figure: {
    type: mongoose.Schema.Types.Mixed
  },

  // Optional worked solution (used by the tutor and answer review)
  explanation: {
    type: String
  },

  // Answer object with equivalents
  answer: {
    type: {
      type: String,
      enum: ['auto', 'exact', 'range'],
      default: 'auto'
    },
    value: {
      type: mongoose.Schema.Types.Mixed,  // Primary answer
      required: true
    },
    equivalents: [{
      type: String  // Equivalent forms: "2/3", "0.666...", "4/6"
    }]
  },

  // Answer type for input validation
  answerType: {
    type: String,
    enum: ['constructed-response', 'multiple-choice', 'integer', 'decimal', 'fraction', 'expression'],
    default: 'constructed-response'
  },

  // Multiple choice options (if applicable)
  options: [{
    label: String,  // 'A', 'B', 'C', 'D'
    text: String
  }],
  correctOption: String,

  // Simple 1-5 difficulty scale
  difficulty: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    default: 2,
    index: true
  },

  // Grade band (matches skill gradeBand)
  gradeBand: {
    type: String,
    enum: ['preK', 'K-5', '5-8', '8-12', 'Calculus', 'Calc 3'],
    index: true
  },

  // Ohio Learning Standards domain
  ohioDomain: {
    type: String
  },

  // Tags for filtering/searching
  tags: [{
    type: String
  }],

  // Active flag
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  // Source tracking
  source: {
    type: String
  },

  // Content hash for deduplication
  contentHash: {
    type: String,
    index: true,
    sparse: true
  }

}, {
  timestamps: true
});

// INDEXES
problemSchema.index({ skillId: 1, difficulty: 1 });
problemSchema.index({ skillId: 1, isActive: 1 });
problemSchema.index({ gradeBand: 1, difficulty: 1 });
problemSchema.index({ skillId: 1, answerType: 1, isActive: 1 }); // Screener multiple-choice selection

// ===========================================================================
// ANSWER CHECKING
// ===========================================================================

/**
 * Check if user answer is correct
 * Supports equivalent answers (e.g., "2/3" = "0.666..." = "4/6")
 *
 * Thin wrapper over the shared comparison engine (utils/answerComparison.js) —
 * all answer-key grading logic lives there, shared with assessmentService.
 */
problemSchema.methods.checkAnswer = function(userAnswer) {
  return compareAnswer(userAnswer, {
    value: this.answer?.value ?? this.answer,
    equivalents: this.answer?.equivalents || [],
    answerType: this.answerType,
    options: this.options,
    correctOption: this.correctOption,
  });
};

// ===========================================================================
// STATIC METHODS
// ===========================================================================

/**
 * Find problem near target difficulty for a skill
 * Uses simple 1-5 scale
 * @param {Object} options - Optional preferences
 * @param {boolean} options.preferMultipleChoice - Prefer multiple-choice problems (for screener)
 */
problemSchema.statics.findNearDifficulty = async function(skillId, targetDifficulty, excludeIds = [], options = {}) {
  const { preferMultipleChoice = false } = options;

  // Convert theta (-3 to +3) to difficulty (1-5) if needed
  let difficulty = targetDifficulty;
  if (targetDifficulty >= -3 && targetDifficulty <= 3) {
    // Looks like theta scale, convert: theta -3→1, 0→3, +3→5
    difficulty = Math.round(((targetDifficulty + 3) / 6) * 4 + 1);
    difficulty = Math.max(1, Math.min(5, difficulty));
  }

  // Build base query
  const baseQuery = {
    skillId,
    isActive: true,
    problemId: { $nin: excludeIds }
  };

  // If preferring multiple choice, try those first
  if (preferMultipleChoice) {
    for (const range of [0, 1, 2]) {
      const problems = await this.find({
        ...baseQuery,
        answerType: 'multiple-choice',
        difficulty: {
          $gte: Math.max(1, difficulty - range),
          $lte: Math.min(5, difficulty + range)
        }
      });

      if (problems.length > 0) {
        return problems[Math.floor(Math.random() * problems.length)];
      }
    }
  }

  // Try exact difficulty first, then expand
  for (const range of [0, 1, 2]) {
    const problems = await this.find({
      ...baseQuery,
      difficulty: {
        $gte: Math.max(1, difficulty - range),
        $lte: Math.min(5, difficulty + range)
      }
    });

    if (problems.length > 0) {
      // Prefer multiple choice even in fallback
      const mcProblems = problems.filter(p => p.answerType === 'multiple-choice');
      if (mcProblems.length > 0) {
        return mcProblems[Math.floor(Math.random() * mcProblems.length)];
      }
      return problems[Math.floor(Math.random() * problems.length)];
    }
  }

  // Fallback: any problem for this skill
  const anyProblem = await this.findOne({
    ...baseQuery
  });

  return anyProblem;
};

/**
 * Get problems for a skill sorted by difficulty
 */
problemSchema.statics.getBySkill = async function(skillId) {
  return await this.find({ skillId, isActive: true }).sort({ difficulty: 1 });
};

/**
 * Map theta (IRT scale) to difficulty (1-5)
 */
problemSchema.statics.thetaToDifficulty = function(theta) {
  // theta: -3 to +3 → difficulty: 1 to 5
  const difficulty = Math.round(((theta + 3) / 6) * 4 + 1);
  return Math.max(1, Math.min(5, difficulty));
};

/**
 * Map difficulty (1-5) to theta (IRT scale)
 */
problemSchema.statics.difficultyToTheta = function(difficulty) {
  // difficulty: 1 to 5 → theta: -3 to +3
  return ((difficulty - 1) / 4) * 6 - 3;
};

// ===========================================================================
// PRE-SAVE HOOK
// ===========================================================================

problemSchema.pre('save', function(next) {
  // Generate content hash for deduplication
  if (this.isModified('prompt') || this.isModified('skillId') || this.isNew) {
    const hashInput = `${this.skillId}:${String(this.prompt).trim().toLowerCase()}`;
    this.contentHash = crypto.createHash('sha256').update(hashInput).digest('hex');
  }
  next();
});

module.exports = mongoose.model('Problem', problemSchema);

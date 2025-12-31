/**
 * PROBLEM MODEL (IRT-Calibrated Assessment Items)
 *
 * Each problem has IRT (Item Response Theory) parameters that allow
 * precise ability estimation through adaptive testing.
 *
 * IRT Parameters:
 * - difficulty (β): How hard the problem is (-3 to +3, where 0 = average)
 * - discrimination (α): How well it separates high/low ability (0.5 to 2.5)
 *
 * @model Problem
 */

const mongoose = require('mongoose');

const problemSchema = new mongoose.Schema({
  // Unique identifier
  problemId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Associated skill
  skillId: {
    type: String,
    required: true,
    ref: 'Skill',
    index: true
  },

  // Problem content
  content: {
    type: String,
    required: true
  },

  // Optional SVG diagram for visual problems (geometry, graphs, etc.)
  svg: {
    type: String,
    required: false
  },

  // Correct answer (for auto-validation)
  answer: {
    type: mongoose.Schema.Types.Mixed,  // Can be number, string, or array
    required: true
  },

  // Multiple choice options (if applicable)
  options: [{
    label: String,  // 'A', 'B', 'C', 'D'
    text: String    // The option text
  }],

  // Correct option letter (for multiple choice)
  correctOption: String,  // 'A', 'B', 'C', or 'D'

  // Answer type for validation
  answerType: {
    type: String,
    enum: ['integer', 'decimal', 'fraction', 'expression', 'multiple-choice'],
    default: 'integer'
  },

  // IRT PARAMETERS (2-Parameter Logistic Model)
  irtParameters: {
    // Difficulty (β): Where on the ability scale is this problem?
    // Scale: -3 (very easy) to +3 (very hard), 0 = average
    difficulty: {
      type: Number,
      required: true,
      min: -3,
      max: 3,
      default: 0
    },

    // Discrimination (α): How well does this problem separate abilities?
    // Scale: 0.5 (poor) to 2.5 (excellent), 1.0 = average
    discrimination: {
      type: Number,
      required: true,
      min: 0.5,
      max: 2.5,
      default: 1.0
    },

    // Calibration confidence (how sure are we about these parameters?)
    calibrationConfidence: {
      type: String,
      enum: ['expert', 'simulated', 'live-calibrated'],
      default: 'expert'  // Expert-assigned vs calibrated from student data
    },

    // Number of students who have attempted this problem
    attemptsCount: {
      type: Number,
      default: 0
    }
  },

  // DOK (Depth of Knowledge) level
  dokLevel: {
    type: Number,
    min: 1,
    max: 3,
    default: 1
    // 1 = Recall/Procedure
    // 2 = Concept/Skill
    // 3 = Strategy/Reasoning
  },

  // Metadata
  metadata: {
    // Estimated time to solve (seconds)
    estimatedTime: {
      type: Number,
      default: 30
    },

    // Common errors students make
    commonErrors: [String],

    // Tags for organization
    tags: [String],

    // Source (template-generated, LLM-generated, expert-authored, imported)
    source: {
      type: String,
      enum: ['template', 'llm', 'expert', 'imported'],
      default: 'template'
    },

    // If template-generated, which template?
    templateId: String,

    // Generation parameters (for reproducibility)
    generationParams: mongoose.Schema.Types.Mixed,

    // Import-specific metadata
    standardCode: String,      // e.g., '6EE7', '7NS1' (Common Core)
    gradeLevel: String,         // e.g., '6', '7', '8'
    pValues: [Number],          // Raw p-values from calibration
    importDate: Date
  },

  // Active/inactive flag
  isActive: {
    type: Boolean,
    default: true
  },

  // Quality control
  qualityReview: {
    reviewed: { type: Boolean, default: false },
    reviewedBy: String,
    reviewDate: Date,
    notes: String
  }

}, {
  timestamps: true
});

// Index for efficient adaptive selection
problemSchema.index({ skillId: 1, 'irtParameters.difficulty': 1 });
problemSchema.index({ 'irtParameters.difficulty': 1, isActive: 1 });

// Helper function to compare two fractions for equivalence
function compareFractions(userFraction, correctFraction) {
  // First try exact string match (fastest path)
  if (String(userFraction).trim() === String(correctFraction).trim()) {
    return true;
  }

  // Parse both fractions
  const parseResult1 = parseFraction(userFraction);
  const parseResult2 = parseFraction(correctFraction);

  // If either parse failed, fall back to string comparison
  if (!parseResult1 || !parseResult2) {
    return String(userFraction).trim() === String(correctFraction).trim();
  }

  // Compare as decimals (handles equivalent fractions like 1/2 = 2/4)
  const decimal1 = parseResult1.numerator / parseResult1.denominator;
  const decimal2 = parseResult2.numerator / parseResult2.denominator;

  // Use small epsilon for floating point comparison
  return Math.abs(decimal1 - decimal2) < 0.0001;
}

// Helper function to parse a fraction string
function parseFraction(input) {
  const str = String(input).trim();
  const match = str.match(/^(-?\d+)\/(\d+)$/);

  if (!match) return null;

  const numerator = parseInt(match[1], 10);
  const denominator = parseInt(match[2], 10);

  if (denominator === 0) return null;

  return { numerator, denominator };
}

// Instance method: Check if answer is correct
problemSchema.methods.checkAnswer = function(userAnswer) {
  switch (this.answerType) {
    case 'integer':
    case 'decimal':
      return parseFloat(userAnswer) === parseFloat(this.answer);

    case 'fraction':
      // Compare fractions by reducing to decimal OR comparing reduced forms
      return compareFractions(userAnswer, this.answer);

    case 'expression':
      // TODO: Implement algebraic equivalence
      return String(userAnswer).trim() === String(this.answer).trim();

    case 'multiple-choice':
      // For multiple choice, userAnswer is the letter (A, B, C, D)
      // Compare to correctOption, not answer
      return String(userAnswer).trim().toUpperCase() === String(this.correctOption).trim().toUpperCase();

    default:
      return false;
  }
};

// Static method: Find problem at target difficulty
problemSchema.statics.findNearDifficulty = async function(skillId, targetDifficulty, excludeIds = []) {
  // Find problems within ±0.3 difficulty of target
  const problems = await this.find({
    skillId,
    isActive: true,
    problemId: { $nin: excludeIds },
    'irtParameters.difficulty': {
      $gte: targetDifficulty - 0.3,
      $lte: targetDifficulty + 0.3
    }
  }).sort({ 'irtParameters.discrimination': -1 }); // Prefer high discrimination

  if (problems.length > 0) {
    // Return random problem from the set
    return problems[Math.floor(Math.random() * problems.length)];
  }

  // If no problems found, widen search using aggregation
  const results = await this.aggregate([
    {
      $match: {
        skillId,
        isActive: true,
        problemId: { $nin: excludeIds }
      }
    },
    {
      $addFields: {
        difficultyDistance: {
          $abs: { $subtract: ['$irtParameters.difficulty', targetDifficulty] }
        }
      }
    },
    {
      $sort: { difficultyDistance: 1 }
    },
    {
      $limit: 1
    }
  ]);

  // Convert aggregation result back to Mongoose document
  if (results.length > 0) {
    return await this.findById(results[0]._id);
  }

  return null;
};

// Static method: Get problems for a skill sorted by difficulty
problemSchema.statics.getBySkill = async function(skillId) {
  return await this.find({ skillId, isActive: true })
    .sort({ 'irtParameters.difficulty': 1 });
};

module.exports = mongoose.model('Problem', problemSchema);

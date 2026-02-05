/**
 * PROBLEM MODEL
 *
 * Simplified schema matching the cleaned JSON format.
 * Uses 1-5 difficulty scale and structured answer objects.
 *
 * @model Problem
 */

const mongoose = require('mongoose');
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

// ===========================================================================
// ANSWER CHECKING
// ===========================================================================

/**
 * Check if user answer is correct
 * Supports equivalent answers (e.g., "2/3" = "0.666..." = "4/6")
 */
problemSchema.methods.checkAnswer = function(userAnswer) {
  const userStr = String(userAnswer).trim();
  const normalizedUser = userStr.toLowerCase().replace(/\s+/g, '');

  // Get the correct answer value
  const correctValue = this.answer?.value ?? this.answer;
  const equivalents = this.answer?.equivalents || [];

  // MULTIPLE CHOICE: Handle first since user sends letters (A, B, C, D)
  if (this.answerType === 'multiple-choice') {
    const userUpper = userStr.toUpperCase();

    // Method 1: Direct correctOption comparison
    if (this.correctOption) {
      if (userUpper === this.correctOption.toUpperCase()) {
        return true;
      }
    }

    // Method 2: If user sent a letter (A-F), look up that option's text
    // and compare to the correct answer value
    if (/^[A-F]$/.test(userUpper) && this.options && this.options.length > 0) {
      const optionIndex = userUpper.charCodeAt(0) - 65; // A=0, B=1, etc.

      if (optionIndex >= 0 && optionIndex < this.options.length) {
        const selectedOption = this.options[optionIndex];
        const selectedText = (selectedOption.text || selectedOption || '').toString().trim().toLowerCase();
        const correctStr = String(correctValue).trim().toLowerCase();

        // Compare selected option text to correct answer
        if (selectedText === correctStr) {
          return true;
        }

        // Check against equivalents too
        for (const equiv of equivalents) {
          if (selectedText === String(equiv).trim().toLowerCase()) {
            return true;
          }
        }

        // Special handling for comparison symbols
        // User might select ">" and answer might be ">" or "greater than"
        const symbolMap = {
          '>': ['>', 'greater than', 'greater', 'gt'],
          '<': ['<', 'less than', 'less', 'lt'],
          '=': ['=', 'equal', 'equals', 'equal to'],
          '>=': ['>=', 'greater than or equal', 'gte'],
          '<=': ['<=', 'less than or equal', 'lte']
        };

        for (const [symbol, variants] of Object.entries(symbolMap)) {
          if (variants.includes(selectedText) && variants.includes(correctStr)) {
            return true;
          }
        }
      }
    }

    // If we have correctOption but user didn't match, it's wrong
    if (this.correctOption) {
      return false;
    }
  }

  // Build list of all acceptable answers for non-MC or fallback
  const acceptableAnswers = [String(correctValue), ...equivalents];

  // Check against all acceptable answers
  for (const acceptable of acceptableAnswers) {
    const normalizedAcceptable = String(acceptable).trim().toLowerCase().replace(/\s+/g, '');

    // Exact string match
    if (normalizedUser === normalizedAcceptable) {
      return true;
    }

    // Fraction comparison (handles "1/2" vs "2/4" vs "0.5")
    // Check this BEFORE numeric comparison to handle fractions properly
    const userIsFraction = userStr.includes('/');
    const acceptableIsFraction = String(acceptable).includes('/');

    if (userIsFraction || acceptableIsFraction) {
      // Try to compare as fractions/decimals
      const userVal = parseFractionOrDecimal(userStr);
      const acceptableVal = parseFractionOrDecimal(acceptable);

      if (userVal !== null && acceptableVal !== null) {
        if (Math.abs(userVal - acceptableVal) < 0.0001) {
          return true;
        }
      }
    }

    // Numeric comparison (handles "0.5" vs "0.50" vs ".5")
    // Only for pure decimal/integer values (no fractions)
    if (!userIsFraction && !acceptableIsFraction) {
      const userNum = parseFloat(userStr);
      const acceptableNum = parseFloat(acceptable);
      if (!isNaN(userNum) && !isNaN(acceptableNum)) {
        if (Math.abs(userNum - acceptableNum) < 0.0001) {
          return true;
        }
      }
    }
  }

  return false;
};

/**
 * Parse a string as either a fraction or decimal number
 * Handles: "2/3", "0.666", ".5", "1 1/2" (mixed), "-3/4"
 *
 * @param {String} str - The string to parse
 * @returns {Number|null} The numeric value or null if unparseable
 */
function parseFractionOrDecimal(str) {
  const s = String(str).trim();

  // Check for mixed number like "1 1/2"
  const mixedMatch = s.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num = parseInt(mixedMatch[2], 10);
    const den = parseInt(mixedMatch[3], 10);
    if (den === 0) return null;
    return whole + (whole >= 0 ? 1 : -1) * (num / den);
  }

  // Check for simple fraction like "2/3"
  const fracMatch = s.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
    return den === 0 ? null : num / den;
  }

  // Try as decimal
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

/**
 * Compare two fractions for equivalence (legacy - kept for compatibility)
 */
function compareFractions(frac1, frac2) {
  const val1 = parseFractionOrDecimal(frac1);
  const val2 = parseFractionOrDecimal(frac2);

  if (val1 === null || val2 === null) return false;
  return Math.abs(val1 - val2) < 0.0001;
}

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

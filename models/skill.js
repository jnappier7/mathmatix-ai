const mongoose = require('mongoose');

const skillSchema = new mongoose.Schema({
  skillId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  displayName: {
    type: String,
    required: true
  },

  description: {
    type: String,
    required: true
  },

  category: {
    type: String,
    required: true,
    enum: [
      // Elementary (K-5)
      'counting-cardinality',
      'number-recognition',
      'addition-subtraction',
      'multiplication-division',
      'place-value',
      'shapes-geometry',
      'measurement',
      'time',
      'data',
      'money',
      'arrays',

      // Middle School (6-8)
      'integers-rationals',
      'scientific-notation',
      'area-perimeter',
      'volume',
      'angles',
      'pythagorean-theorem',
      'transformations',
      'scatter-plots',

      // High School & College (Algebra 1 - Calculus 3)
      'number-system',
      'operations',
      'decimals',
      'fractions',
      'ratios-proportions',
      'percent',
      'expressions',
      'equations',
      'linear-equations',
      'systems',
      'inequalities',
      'polynomials',
      'factoring',
      'quadratics',
      'radicals',
      'rational-expressions',
      'complex-numbers',
      'exponentials-logarithms',
      'sequences-series',
      'conics',
      'functions',
      'graphing',
      'coordinate-plane',
      'geometry',
      'trigonometry',
      'identities',
      'polar-coordinates',
      'vectors',
      'matrices',
      'limits',
      'derivatives',
      'integration',
      'series-tests',
      'taylor-series',
      'parametric-polar',
      'differential-equations',
      'multivariable',
      'vector-calculus',
      'statistics',
      'probability',

      // Catch-all
      'advanced'
    ]
  },

  // Curriculum tracking for quarterly growth reports
  course: {
    type: String,
    required: false,  // Optional for backward compatibility with existing skills
    index: true
  },

  quarter: {
    type: Number,
    min: 1,
    max: 4,
    required: false  // Optional for backward compatibility
  },

  unit: {
    type: String,
    required: false  // Optional for backward compatibility
  },

  // Skills that must be mastered before this one
  prerequisites: [{
    type: String,
    ref: 'Skill'
  }],

  // Skills unlocked by mastering this one
  enables: [{
    type: String,
    ref: 'Skill'
  }],

  // Standards alignment
  standardsAlignment: [String],

  // Guidance for AI teaching (not scripted lessons)
  teachingGuidance: {
    coreConcepts: [String],
    commonMistakes: [String],
    teachingTips: [String],
    exampleTypes: [String],
    connectionsToPriorKnowledge: [String]
  },

  // Estimated difficulty level (1-10)
  difficultyLevel: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  },

  // IRT difficulty parameter (theta scale: -3 to +3)
  irtDifficulty: {
    type: Number,
    min: -3,
    max: 3,
    default: 0
  },

  // Adaptive Fluency Engine: Expected time for mastery-level performance
  fluencyMetadata: {
    // Base time in seconds for a neurotypical student at mastery level
    baseFluencyTime: {
      type: Number,
      min: 1,
      default: 30  // Default: 30 seconds for most problems
    },

    // Fluency type determines how time-sensitive this skill is
    fluencyType: {
      type: String,
      enum: ['reflex', 'process', 'algorithm', 'conceptual'],
      default: 'process',
      // reflex: Math facts, basic operations (3-10s) - Must be instant
      // process: One-step equations, simplification (10-30s) - Should be smooth
      // algorithm: Multi-step procedures, quadratics (60-180s) - Methodical but efficient
      // conceptual: Explanation, reasoning (no strict time) - Understanding over speed
    },

    // Time tolerance factor: How much variance is acceptable
    // 1.0 = strict (reflex), 2.0 = moderate (process), 3.0+ = flexible (algorithm)
    toleranceFactor: {
      type: Number,
      min: 1.0,
      max: 5.0,
      default: 2.0
    }
  },

  // Active/inactive flag
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Instance method to check if prerequisites are met for a user
skillSchema.methods.checkPrerequisites = function(userSkillMastery) {
  if (this.prerequisites.length === 0) return true;

  return this.prerequisites.every(prereqId => {
    const status = userSkillMastery.get(prereqId)?.status;
    return status === 'mastered';
  });
};

// Static method to get all skills ready for a user
skillSchema.statics.getReadySkills = async function(userSkillMastery) {
  const allSkills = await this.find({ isActive: true });

  return allSkills.filter(skill => {
    // Prerequisites must be met
    const prereqsMet = skill.checkPrerequisites(userSkillMastery);

    // Skill must not already be mastered
    const currentStatus = userSkillMastery.get(skill.skillId)?.status;
    const notMastered = currentStatus !== 'mastered';

    return prereqsMet && notMastered;
  });
};

// Static method to get skills currently being learned
skillSchema.statics.getLearningSkills = function(userSkillMastery) {
  const learningSkills = [];

  for (const [skillId, data] of userSkillMastery) {
    if (data.status === 'learning') {
      learningSkills.push({ skillId, ...data });
    }
  }

  return learningSkills;
};

// Static method to get mastered skills
skillSchema.statics.getMasteredSkills = function(userSkillMastery) {
  const masteredSkills = [];

  for (const [skillId, data] of userSkillMastery) {
    if (data.status === 'mastered') {
      masteredSkills.push({ skillId, ...data });
    }
  }

  // Sort by mastery date, most recent first
  return masteredSkills.sort((a, b) =>
    new Date(b.masteredDate) - new Date(a.masteredDate)
  );
};

module.exports = mongoose.model('Skill', skillSchema);

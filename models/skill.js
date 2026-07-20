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

      // Additional categories found in curriculum data
      'word-problems',
      'expressions-equations',
      'exponential',
      'rational',
      'congruence',
      'similarity',
      'sequences',
      'counting',
      'number-theory',
      'rates',
      'conversions',
      'proofs',
      'circles',
      'triangles',
      'parallel-perpendicular',
      'surface-area',
      'right-triangles',
      'coordinate-geometry',

      // Additional categories from database audit
      'integrals',
      'estimation',
      'number-sense',
      'mental-math',
      'linear-functions',

      // Categories from cleaned JSON data
      'area-approximation',
      'calc3',
      'data-displays',
      'optimization',
      'series',

      // Middle school course-specific categories
      'boot-camp',
      'ratios-rates',
      'integers-coordinate',
      'applied-number-sense',
      'ratios-proportional',
      'statistics-probability',

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
    min: 0,
    max: 4,
    required: false  // Optional for backward compatibility
    // 0 = Boot Camp / prerequisite review skills
    // 1-4 = Quarter-based curriculum progression
  },

  unit: {
    type: String,
    required: false  // Optional for backward compatibility
  },

  // Plain-language name for the student: what appears on the progress board and
  // what the tutor says out loud. `displayName` stays formal — teachers write IEP
  // goals against it and the standards codes align to it — so this is an everyday
  // name alongside the precise one, never a replacement. Falls back to
  // displayName when absent. Pitched at the level the skill sits at: an ELEM
  // label must be readable by the student, a CALC label keeps real terminology.
  studentLabel: {
    type: String,
    required: false
  },

  // Unified "Map of Mathmatix" taxonomy (seeds/unified-taxonomy/math_taxonomy.json).
  // strand = one of the six cross-cutting through-lines (QNT/PRP/EQV/FNC/SPC/DTA);
  // courseLevel = the taxonomy course code (ELEM/MS/ALG1/GEO/ALG2/PREC/CALC).
  // Both optional so existing catalog skills are unaffected.
  strand: {
    type: String,
    enum: ['QNT', 'PRP', 'EQV', 'FNC', 'SPC', 'DTA'],
    required: false,
    index: true
  },
  courseLevel: {
    type: String,
    required: false,
    index: true
  },

  // Skills that must be mastered before this one, within the same course level.
  prerequisites: [{
    type: String,
    ref: 'Skill'
  }],

  // Prerequisites that live at a LOWER course level — the same idea at a more
  // concrete level of abstraction (e.g. ALG1.PRP.2 "slope as rate" reaches back
  // to MS.PRP.5 "proportional relationships"). Kept separate from `prerequisites`
  // because these are the edges that make a strand readable as one through-line.
  crossPrereqs: [{
    type: String,
    ref: 'Skill'
  }],

  // Skills unlocked by mastering this one. Derived — the reverse of
  // prerequisites + crossPrereqs across the whole graph. Do not hand-edit.
  enables: [{
    type: String,
    ref: 'Skill'
  }],

  // Standards alignment. Bare CCSS-M codes are self-identifying ("7.RP.A.2",
  // "HSF.IF.B.4"); anything else carries a framework prefix ("AP-CALC:2.1",
  // "OH:7.RP.2"). Verified against the published progressions, not inferred.
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
      enum: ['reflex', 'process', 'algorithm', 'conceptual', 'procedural', 'application'],
      default: 'process',
      // reflex: Math facts, basic operations (3-10s) - Must be instant
      // process: One-step equations, simplification (10-30s) - Should be smooth
      // procedural: Step-by-step procedures requiring methodical execution (15-45s)
      // algorithm: Multi-step procedures, quadratics (60-180s) - Methodical but efficient
      // application: Real-world problem solving requiring strategy selection (25-60s)
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

  // Grade band classification
  gradeBand: {
    type: String,
    enum: ['preK', 'K-5', '5-8', '8-12', 'Calculus', 'Calc 3'],
    index: true
  },

  // Ohio Learning Standards domain
  ohioDomain: {
    type: String
  },

  // Active/inactive flag
  isActive: {
    type: Boolean,
    default: true
  },

  // CAT Navigation fields (from skill graph)
  // NOTE: `strand` is declared once, above, with its QNT/PRP/EQV/FNC/SPC/DTA enum.
  // A second bare `strand: { type: String }` used to sit here; being later in the
  // object literal it overwrote the enum, so strand was never validated.
  depth: {
    type: Number,
    min: 0
  },

  // Data source tracking
  source: {
    type: String
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

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
      'number-system',
      'operations',
      'expressions',
      'equations',
      'ratios-proportions',
      'percent',
      'graphing',
      'functions',
      'advanced'
    ]
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

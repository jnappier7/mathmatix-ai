/**
 * PREREQUISITE SKILL MAPPER
 *
 * Maps each skill to its prerequisite and component skills
 * Enables intelligent warmup selection for adaptive lessons
 */

/**
 * Comprehensive skill prerequisite mapping
 * Maps target skills -> prerequisite/component skills needed
 */
const SKILL_PREREQUISITES = {
  // ========== EQUATIONS ==========
  'one-step-equations-addition': {
    prerequisites: ['integer-all-operations', 'understanding-variables'],
    components: ['inverse-operations-addition', 'isolating-variables'],
    warmupConcepts: ['What is a variable?', 'Solving x + 5 = 12 using inverse operations']
  },
  'one-step-equations-multiplication': {
    prerequisites: ['one-step-equations-addition', 'inverse-operations-multiplication'],
    components: ['multiplication-division-relationship', 'isolating-variables'],
    warmupConcepts: ['If 3x = 15, what operation undoes multiplication?', 'Solving basic multiplication equations']
  },
  'two-step-equations': {
    prerequisites: ['one-step-equations-addition', 'one-step-equations-multiplication', 'order-of-operations'],
    components: ['reverse-order-of-operations', 'combining-steps'],
    warmupConcepts: ['Solve x + 3 = 7', 'Solve 2x = 10', 'What order do we undo operations?']
  },
  'multi-step-equations': {
    prerequisites: ['two-step-equations', 'combining-like-terms', 'distributive-property'],
    components: ['simplifying-before-solving', 'multiple-inverse-operations'],
    warmupConcepts: ['Combine 3x + 5x', 'Solve 2x + 3 = 11', 'Distribute 2(x + 3)']
  },
  'equations-with-variables-both-sides': {
    prerequisites: ['multi-step-equations', 'collecting-variables'],
    components: ['moving-variables', 'maintaining-balance'],
    warmupConcepts: ['Solve 3x + 4 = 13', 'What happens when we have x on both sides?']
  },

  // ========== ALGEBRA FOUNDATIONS ==========
  'combining-like-terms': {
    prerequisites: ['understanding-variables', 'integer-all-operations'],
    components: ['identifying-like-terms', 'adding-coefficients'],
    warmupConcepts: ['What makes terms "like"?', 'Simplify 3 + 5', 'What is a coefficient?']
  },
  'distributive-property': {
    prerequisites: ['multiplication-basics', 'combining-like-terms'],
    components: ['multiplying-each-term', 'removing-parentheses'],
    warmupConcepts: ['Calculate 2 × (3 + 4)', 'Multiply 2 × 3 and 2 × 4', 'Combine results']
  },
  'factoring-expressions': {
    prerequisites: ['distributive-property', 'greatest-common-factor'],
    components: ['finding-gcf', 'reverse-distribution'],
    warmupConcepts: ['Find GCF of 6 and 9', 'Distribute 3(x + 2)', 'Work backwards']
  },

  // ========== FRACTIONS ==========
  'fraction-operations': {
    prerequisites: ['understanding-fractions', 'multiplication-basics'],
    components: ['common-denominators', 'simplifying-fractions'],
    warmupConcepts: ['What does 1/2 represent?', 'Find equivalent fractions', 'Simplify 4/8']
  },
  'adding-fractions': {
    prerequisites: ['fraction-operations', 'least-common-multiple'],
    components: ['finding-common-denominators', 'adding-numerators'],
    warmupConcepts: ['Find LCM of 4 and 6', 'Make equivalent fractions', 'Add numerators']
  },
  'multiplying-fractions': {
    prerequisites: ['fraction-operations', 'multiplication-basics'],
    components: ['multiply-across', 'simplify-result'],
    warmupConcepts: ['Multiply 2 × 3', 'What is a numerator and denominator?']
  },
  'dividing-fractions': {
    prerequisites: ['multiplying-fractions', 'reciprocals'],
    components: ['flip-and-multiply', 'understanding-division'],
    warmupConcepts: ['What is a reciprocal?', 'Multiply 1/2 × 3/4', 'Division means how many groups?']
  },

  // ========== INTEGERS ==========
  'integer-all-operations': {
    prerequisites: ['whole-number-operations', 'number-line'],
    components: ['positive-negative-rules', 'absolute-value'],
    warmupConcepts: ['Add 5 + 3', 'What is absolute value?', 'Number line positions']
  },
  'adding-integers': {
    prerequisites: ['number-line', 'understanding-negatives'],
    components: ['same-signs-rule', 'different-signs-rule'],
    warmupConcepts: ['Where is -3 on number line?', 'Add 5 + 3', 'What happens with different signs?']
  },
  'multiplying-integers': {
    prerequisites: ['adding-integers', 'multiplication-basics'],
    components: ['sign-rules', 'repeated-addition'],
    warmupConcepts: ['Multiply 3 × 4', 'Negative times positive?', 'Negative times negative?']
  },

  // ========== RATIOS & PROPORTIONS ==========
  'understanding-ratios': {
    prerequisites: ['fraction-operations', 'comparing-quantities'],
    components: ['part-to-part', 'part-to-whole'],
    warmupConcepts: ['Compare 3 apples to 5 oranges', 'Simplify 6/9', 'What is a relationship?']
  },
  'solving-proportions': {
    prerequisites: ['understanding-ratios', 'cross-multiplication'],
    components: ['setting-equal-ratios', 'solving-for-variable'],
    warmupConcepts: ['What is a proportion?', 'Cross multiply', 'Solve one-step equations']
  },
  'percent-problems': {
    prerequisites: ['understanding-ratios', 'decimal-operations'],
    components: ['converting-percent', 'finding-part-whole'],
    warmupConcepts: ['What is 50%?', 'Convert 0.5 to percent', 'Find 10% of 50']
  },

  // ========== GEOMETRY ==========
  'area-and-perimeter': {
    prerequisites: ['multiplication-basics', 'addition-basics'],
    components: ['measuring-length', 'calculating-area'],
    warmupConcepts: ['What is length × width?', 'Add all sides', 'What is area vs perimeter?']
  },
  'volume-3d-shapes': {
    prerequisites: ['area-and-perimeter', 'understanding-3d-shapes'],
    components: ['base-times-height', 'cubic-units'],
    warmupConcepts: ['Find area of rectangle', 'What is volume?', 'Count unit cubes']
  },
  'pythagorean-theorem': {
    prerequisites: ['area-and-perimeter', 'square-roots', 'right-triangles'],
    components: ['identifying-hypotenuse', 'squaring-numbers'],
    warmupConcepts: ['What is 3²?', 'Find √16', 'Identify right angle']
  },

  // ========== ORDER OF OPERATIONS ==========
  'order-of-operations': {
    prerequisites: ['integer-all-operations', 'understanding-exponents'],
    components: ['pemdas-sequence', 'evaluating-expressions'],
    warmupConcepts: ['What is 2³?', 'Calculate 3 × 4', 'Add and subtract left to right']
  },
  'evaluating-expressions': {
    prerequisites: ['order-of-operations', 'substituting-variables'],
    components: ['replace-variables', 'follow-pemdas'],
    warmupConcepts: ['Calculate 2(3) + 4', 'If x = 5, what is x + 3?', 'Follow GEMS']
  },

  // ========== DECIMALS ==========
  'decimal-operations': {
    prerequisites: ['place-value', 'fraction-operations'],
    components: ['aligning-decimals', 'place-value-understanding'],
    warmupConcepts: ['What is tenths place?', 'Compare 0.5 and 0.50', 'Add 1.2 + 3.4']
  },
  'multiplying-decimals': {
    prerequisites: ['decimal-operations', 'multiplication-basics'],
    components: ['counting-decimal-places', 'placing-decimal-point'],
    warmupConcepts: ['Multiply 3 × 4', 'Count decimal places in 1.5 × 2.3', 'Where does decimal go?']
  }
};

/**
 * Get prerequisite skills for a target skill
 * @param {String} skillId - Target skill identifier
 * @returns {Object} Prerequisite data with skills and warmup concepts
 */
function getPrerequisites(skillId) {
  const prereqData = SKILL_PREREQUISITES[skillId];

  if (!prereqData) {
    console.log(`No prerequisites mapped for skill: ${skillId}`);
    return {
      prerequisites: [],
      components: [],
      warmupConcepts: ['Review what you know about this topic']
    };
  }

  return prereqData;
}

/**
 * Select best warmup skill based on student's mastery data
 * Chooses prerequisite student is most confident with
 *
 * @param {String} targetSkill - Skill being taught
 * @param {Object} user - User document with mastery progress
 * @returns {Object} Selected warmup with skill and concepts
 */
function selectWarmupSkill(targetSkill, user) {
  const prereqData = getPrerequisites(targetSkill);

  if (prereqData.prerequisites.length === 0) {
    return {
      skillId: null,
      skillName: 'General Review',
      concepts: prereqData.warmupConcepts,
      rationale: 'No specific prerequisites identified'
    };
  }

  // Check student's mastery of each prerequisite
  const masteryLevels = prereqData.prerequisites.map(prereqSkill => {
    const masteryRecord = user.masteryProgress?.find(m => m.skillId === prereqSkill);
    return {
      skillId: prereqSkill,
      theta: masteryRecord?.theta || -2.0, // Default to low if no data
      confidence: masteryRecord?.confidence || 0
    };
  });

  // Select prerequisite with highest mastery (most confident foundation)
  const bestPrereq = masteryLevels.reduce((best, current) =>
    current.theta > best.theta ? current : best
  );

  return {
    skillId: bestPrereq.skillId,
    skillName: bestPrereq.skillId.replace(/-/g, ' '),
    concepts: prereqData.warmupConcepts,
    rationale: `Building on your understanding of ${bestPrereq.skillId.replace(/-/g, ' ')}`
  };
}

/**
 * Check if student has mastered prerequisites
 * @param {String} targetSkill - Skill to check
 * @param {Object} user - User document
 * @returns {Object} Readiness assessment
 */
function checkPrerequisiteReadiness(targetSkill, user) {
  const prereqData = getPrerequisites(targetSkill);

  if (prereqData.prerequisites.length === 0) {
    return { ready: true, missingSkills: [] };
  }

  const missingSkills = [];
  const MASTERY_THRESHOLD = -0.5; // θ threshold for prerequisite mastery

  for (const prereqSkill of prereqData.prerequisites) {
    const masteryRecord = user.masteryProgress?.find(m => m.skillId === prereqSkill);
    const theta = masteryRecord?.theta || -2.0;

    if (theta < MASTERY_THRESHOLD) {
      missingSkills.push({
        skillId: prereqSkill,
        skillName: prereqSkill.replace(/-/g, ' '),
        currentTheta: theta,
        requiredTheta: MASTERY_THRESHOLD
      });
    }
  }

  return {
    ready: missingSkills.length === 0,
    missingSkills,
    recommendation: missingSkills.length > 0
      ? `Consider reviewing: ${missingSkills.map(s => s.skillName).join(', ')}`
      : 'Prerequisites met - ready to proceed'
  };
}

module.exports = {
  getPrerequisites,
  selectWarmupSkill,
  checkPrerequisiteReadiness,
  SKILL_PREREQUISITES
};

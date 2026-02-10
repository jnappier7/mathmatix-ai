/**
 * PATHWAY MAPPER
 *
 * Automatically assigns students to pathways based on CAT assessment theta.
 * Enables gap-filling (going back to prerequisites) and extension (going beyond).
 *
 * Philosophy:
 * - Assessment places student at their "frontier" (where they start struggling)
 * - Pathway is assigned based on where they belong
 * - Student can venture off pathway to fill gaps or extend
 * - System tracks these excursions for reporting
 *
 * @module pathwayMapper
 */

// ===========================================================================
// THETA TO PATHWAY MAPPING
// ===========================================================================

/**
 * Available pathways ordered by difficulty
 * Each pathway has a theta range where students belong
 */
const PATHWAYS = [
  {
    pathwayId: 'kindergarten-pathway',
    name: 'Kindergarten',
    thetaRange: [-3.0, -2.0],
    gradeBand: 'preK',
    description: 'Counting, number recognition, basic shapes'
  },
  {
    pathwayId: 'grade-1-pathway',
    name: 'Grade 1',
    thetaRange: [-2.0, -1.5],
    gradeBand: 'K-5',
    description: 'Addition and subtraction within 20'
  },
  {
    pathwayId: 'grade-2-pathway',
    name: 'Grade 2',
    thetaRange: [-1.5, -1.0],
    gradeBand: 'K-5',
    description: 'Addition and subtraction within 100, intro to multiplication'
  },
  {
    pathwayId: 'grade-3-pathway',
    name: 'Grade 3',
    thetaRange: [-1.0, -0.5],
    gradeBand: 'K-5',
    description: 'Multiplication, division, fractions introduction'
  },
  {
    pathwayId: 'grade-4-pathway',
    name: 'Grade 4',
    thetaRange: [-0.5, -0.2],
    gradeBand: 'K-5',
    description: 'Multi-digit operations, fraction equivalence'
  },
  {
    pathwayId: 'grade-5-pathway',
    name: 'Grade 5',
    thetaRange: [-0.2, 0.1],
    gradeBand: 'K-5',
    description: 'Fraction operations, decimals, volume'
  },
  {
    pathwayId: 'grade-6-pathway',
    name: 'Grade 6',
    thetaRange: [0.1, 0.4],
    gradeBand: '5-8',
    description: 'Ratios, rates, expressions, integers'
  },
  {
    pathwayId: 'grade-7-pathway',
    name: 'Grade 7',
    thetaRange: [0.4, 0.7],
    gradeBand: '5-8',
    description: 'Proportions, equations, geometry'
  },
  {
    pathwayId: 'grade-8-pathway',
    name: 'Grade 8',
    thetaRange: [0.7, 1.0],
    gradeBand: '5-8',
    description: 'Linear equations, functions, Pythagorean theorem'
  },
  {
    pathwayId: 'ready-for-algebra-1-pathway',
    name: 'Ready for Algebra 1',
    thetaRange: [0.8, 1.2],
    gradeBand: '8-12',
    description: 'Bridge to high school algebra'
  },
  {
    pathwayId: 'algebra-1-pathway',
    name: 'Algebra 1',
    thetaRange: [1.0, 1.4],
    gradeBand: '8-12',
    description: 'Solving equations, linear functions, systems'
  },
  {
    pathwayId: 'geometry-pathway',
    name: 'Geometry',
    thetaRange: [1.2, 1.6],
    gradeBand: '8-12',
    description: 'Proofs, congruence, similarity, trigonometry'
  },
  {
    pathwayId: 'algebra-2-pathway',
    name: 'Algebra 2',
    thetaRange: [1.4, 1.8],
    gradeBand: '8-12',
    description: 'Polynomials, quadratics, exponentials'
  },
  {
    pathwayId: 'precalculus-pathway',
    name: 'Precalculus',
    thetaRange: [1.6, 2.2],
    gradeBand: '8-12',
    description: 'Functions, trigonometry, sequences'
  },
  {
    pathwayId: 'calculus-1-pathway',
    name: 'Calculus 1',
    thetaRange: [2.0, 2.5],
    gradeBand: 'Calculus',
    description: 'Limits, derivatives, integrals'
  },
  {
    pathwayId: 'ap-calculus-ab-pathway',
    name: 'AP Calculus AB',
    thetaRange: [2.0, 2.5],
    gradeBand: 'Calculus',
    description: 'AP-aligned: limits, derivatives, integrals, differential equations'
  },
  {
    pathwayId: 'calculus-2-pathway',
    name: 'Calculus 2',
    thetaRange: [2.3, 2.7],
    gradeBand: 'Calculus',
    description: 'Integration techniques, series'
  },
  {
    pathwayId: 'calculus-3-pathway',
    name: 'Calculus 3',
    thetaRange: [2.5, 3.0],
    gradeBand: 'Calc 3',
    description: 'Multivariable calculus, vectors'
  }
];

/**
 * Map theta to the appropriate pathway
 *
 * @param {Number} theta - Student's ability estimate from CAT (-3 to +3)
 * @returns {Object} Pathway assignment with metadata
 */
function thetaToPathway(theta) {
  // Find pathway where theta falls within range
  for (const pathway of PATHWAYS) {
    const [min, max] = pathway.thetaRange;
    if (theta >= min && theta <= max) {
      return {
        ...pathway,
        assignedTheta: theta,
        confidence: 'primary'
      };
    }
  }

  // Edge cases: below or above all pathways
  if (theta < PATHWAYS[0].thetaRange[0]) {
    return {
      ...PATHWAYS[0],
      assignedTheta: theta,
      confidence: 'below-range'
    };
  }

  if (theta > PATHWAYS[PATHWAYS.length - 1].thetaRange[1]) {
    return {
      ...PATHWAYS[PATHWAYS.length - 1],
      assignedTheta: theta,
      confidence: 'above-range'
    };
  }

  // Fallback (shouldn't happen)
  return {
    pathwayId: 'grade-6-pathway',
    name: 'Grade 6',
    assignedTheta: theta,
    confidence: 'fallback'
  };
}

/**
 * Get adjacent pathways (for gap-filling and extension)
 *
 * @param {String} currentPathwayId - Student's assigned pathway
 * @returns {Object} { previous, current, next }
 */
function getAdjacentPathways(currentPathwayId) {
  const index = PATHWAYS.findIndex(p => p.pathwayId === currentPathwayId);

  if (index === -1) {
    return { previous: null, current: null, next: null };
  }

  return {
    previous: index > 0 ? PATHWAYS[index - 1] : null,
    current: PATHWAYS[index],
    next: index < PATHWAYS.length - 1 ? PATHWAYS[index + 1] : null
  };
}

/**
 * Determine if a skill is a "gap" (below current pathway) or "extension" (above)
 *
 * @param {Object} skill - Skill document with gradeBand
 * @param {String} currentPathwayId - Student's assigned pathway
 * @returns {String} 'gap', 'current', 'extension', or 'unknown'
 */
function classifySkillRelativeToPathway(skill, currentPathwayId) {
  const currentPathway = PATHWAYS.find(p => p.pathwayId === currentPathwayId);
  if (!currentPathway) return 'unknown';

  const skillTheta = gradeBandToTheta(skill.gradeBand);
  const [min, max] = currentPathway.thetaRange;

  if (skillTheta < min) return 'gap';
  if (skillTheta > max) return 'extension';
  return 'current';
}

/**
 * Map gradeBand to approximate theta midpoint
 */
function gradeBandToTheta(gradeBand) {
  const mapping = {
    'preK': -2.5,
    'K-5': -0.5,
    '5-8': 0.5,
    '8-12': 1.4,
    'Calculus': 2.2,
    'Calc 3': 2.7
  };
  return mapping[gradeBand] || 0;
}

/**
 * Generate pathway assignment summary for a student
 *
 * @param {Number} theta - From CAT assessment
 * @param {Object} options - { includeGaps: boolean, includeExtensions: boolean }
 * @returns {Object} Assignment with pathway and adjacent options
 */
function generatePathwayAssignment(theta, options = {}) {
  const { includeGaps = true, includeExtensions = true } = options;

  const assignment = thetaToPathway(theta);
  const adjacent = getAdjacentPathways(assignment.pathwayId);

  return {
    // Primary assignment
    assignedPathway: assignment,

    // For filling gaps (going back)
    gapPathway: includeGaps ? adjacent.previous : null,

    // For extending (going forward)
    extensionPathway: includeExtensions ? adjacent.next : null,

    // Metadata
    assessmentTheta: theta,
    assignedAt: new Date(),

    // Human-readable summary
    summary: `Placed in ${assignment.name} (θ=${theta.toFixed(2)}). ` +
             (adjacent.previous ? `Can fill gaps in ${adjacent.previous.name}. ` : '') +
             (adjacent.next ? `Can extend to ${adjacent.next.name}.` : '')
  };
}

// ===========================================================================
// EXPORTS
// ===========================================================================

module.exports = {
  PATHWAYS,
  thetaToPathway,
  getAdjacentPathways,
  classifySkillRelativeToPathway,
  gradeBandToTheta,
  generatePathwayAssignment
};

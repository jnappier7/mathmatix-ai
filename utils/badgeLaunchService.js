/**
 * BADGE LAUNCH SERVICE - Pedagogically Sound Badge Earning
 *
 * Transforms badge earning from "problem drilling" to "structured learning"
 * with explicit teaching, scaffolding, and formative assessment.
 *
 * Teaching Philosophy:
 * - I Do (Modeling): Show worked examples
 * - We Do (Guided): Scaffold practice with hints
 * - You Do (Independent): Demonstrate mastery
 * - Formative Assessment: Check understanding before advancing
 *
 * @module badgeLaunchService
 */

const Skill = require('../models/skill');
const { generateProblem } = require('./problemGenerator');
const { reason } = require('./llmGateway');

// ============================================================================
// BADGE LAUNCH PREPARATION
// ============================================================================

/**
 * Prepare comprehensive launch information for a badge
 * Includes prerequisites, learning objectives, readiness check, and I Do examples
 */
async function prepareBadgeLaunch(badge, user) {
    try {
        // 1. Load skill information
        const skill = await Skill.findOne({ skillId: badge.skillId }).lean();

        if (!skill) {
            return {
                error: 'Skill not found',
                badge,
                readyToStart: false
            };
        }

        // 2. Check prerequisites
        const prerequisiteInfo = await checkPrerequisites(skill, user);

        // 3. Generate learning objectives
        const learningObjectives = generateLearningObjectives(badge, skill);

        // 4. Create I Do worked examples
        const workedExamples = await generateWorkedExamples(skill, badge, user);

        // 5. Assess readiness
        const readinessCheck = assessReadiness(prerequisiteInfo, user, badge);

        // 6. Create phase plan
        const phasePlan = createPhasePlan(badge, skill, readinessCheck);

        return {
            badge,
            skill: {
                skillId: skill.skillId,
                displayName: skill.displayName,
                description: skill.description,
                category: skill.category,
                coreConcepts: skill.teachingGuidance?.coreConcepts || [],
                commonMistakes: skill.teachingGuidance?.commonMistakes || [],
                teachingTips: skill.teachingGuidance?.teachingTips || []
            },
            prerequisites: prerequisiteInfo,
            learningObjectives,
            workedExamples,
            readinessCheck,
            phasePlan,
            readyToStart: readinessCheck.ready,
            recommendedAction: readinessCheck.ready ? 'begin-i-do' : 'review-prerequisites'
        };

    } catch (error) {
        console.error('[BadgeLaunch] Error preparing launch:', error);
        throw error;
    }
}

/**
 * Check if prerequisites are met
 */
async function checkPrerequisites(skill, user) {
    if (!skill.prerequisites || skill.prerequisites.length === 0) {
        return {
            hasPrerequisites: false,
            allMet: true,
            prerequisites: []
        };
    }

    // Load prerequisite skills
    const prereqSkills = await Skill.find({
        skillId: { $in: skill.prerequisites }
    }).lean();

    // Check user's mastery status
    const userSkillMastery = user.learningProfile?.skillMastery || new Map();

    const prerequisiteStatus = prereqSkills.map(prereq => {
        const masteryInfo = userSkillMastery.get(prereq.skillId);
        const isMastered = masteryInfo?.status === 'mastered';
        const proficiency = masteryInfo?.proficiency || 0;

        return {
            skillId: prereq.skillId,
            displayName: prereq.displayName,
            isMastered,
            proficiency: Math.round(proficiency * 100),
            status: isMastered ? 'mastered' : (proficiency > 0.5 ? 'in-progress' : 'not-started')
        };
    });

    const allMet = prerequisiteStatus.every(p => p.isMastered);

    return {
        hasPrerequisites: true,
        allMet,
        prerequisites: prerequisiteStatus,
        weakPrerequisites: prerequisiteStatus.filter(p => !p.isMastered)
    };
}

/**
 * Generate learning objectives for the badge
 */
function generateLearningObjectives(badge, skill) {
    const objectives = [];

    // Core objective from skill
    objectives.push({
        type: 'core',
        objective: `Demonstrate mastery of ${skill.displayName.toLowerCase()}`
    });

    // Specific objectives based on tier
    if (badge.tier === 'bronze') {
        objectives.push({
            type: 'foundational',
            objective: `Understand the basic concepts and procedures`
        });
        objectives.push({
            type: 'application',
            objective: `Solve ${badge.requiredProblems} problems with ${Math.round(badge.requiredAccuracy * 100)}% accuracy`
        });
    } else if (badge.tier === 'silver') {
        objectives.push({
            type: 'advanced',
            objective: `Apply concepts to varied problem types`
        });
        objectives.push({
            type: 'fluency',
            objective: `Demonstrate efficient problem-solving strategies`
        });
    } else if (badge.tier === 'gold' || badge.tier === 'platinum') {
        objectives.push({
            type: 'mastery',
            objective: `Explain reasoning and justify solutions`
        });
        objectives.push({
            type: 'transfer',
            objective: `Apply skills to novel problem contexts`
        });
    }

    // Add concept-specific objectives from skill metadata
    if (skill.teachingGuidance?.coreConcepts) {
        skill.teachingGuidance.coreConcepts.slice(0, 2).forEach(concept => {
            objectives.push({
                type: 'concept',
                objective: concept
            });
        });
    }

    return objectives;
}

/**
 * Generate I Do worked examples
 */
async function generateWorkedExamples(skill, badge, user) {
    try {
        // Generate 2 problems at appropriate difficulty
        const baseDifficulty = (badge.requiredTheta || 0) - 0.3; // Slightly easier for modeling

        const examples = [];

        for (let i = 0; i < 2; i++) {
            // Generate problem
            const problem = generateProblem(skill.skillId, {
                difficulty: baseDifficulty + (i * 0.2),
                templateHint: null
            });

            if (!problem) continue;

            // Generate step-by-step solution using AI
            const solution = await generateStepByStepSolution(problem, skill);

            examples.push({
                problemNumber: i + 1,
                problem: problem.content,
                answer: problem.answer,
                solution: solution,
                keyPoint: skill.teachingGuidance?.teachingTips?.[i] || 'Focus on understanding each step'
            });
        }

        return examples;

    } catch (error) {
        console.error('[BadgeLaunch] Error generating worked examples:', error);
        // Return fallback examples
        return [{
            problemNumber: 1,
            problem: `Let's solve a ${skill.displayName} problem together`,
            answer: null,
            solution: 'I\'ll walk you through this step-by-step...',
            keyPoint: 'Pay attention to the process'
        }];
    }
}

/**
 * Generate step-by-step solution using AI
 */
async function generateStepByStepSolution(problem, skill) {
    const prompt = `You are an expert math teacher explaining a solution to a student.

Problem: ${problem.content}
Answer: ${problem.answer}
Skill: ${skill.displayName}

Provide a clear, step-by-step solution that:
1. Explains the strategy first ("Here's how we approach this...")
2. Shows each step with reasoning ("We do X because...")
3. Highlights key concepts from: ${skill.teachingGuidance?.coreConcepts?.join(', ')}
4. Avoids common mistakes: ${skill.teachingGuidance?.commonMistakes?.[0] || 'rushing'}

Format as numbered steps. Keep it concise but clear.`;

    try {
        const solution = await reason(prompt, { maxTokens: 300 });
        return solution;
    } catch (error) {
        console.error('[BadgeLaunch] Error generating solution:', error);
        return `Step 1: Identify what we're solving for\nStep 2: Apply the ${skill.displayName} procedure\nStep 3: Check your answer: ${problem.answer}`;
    }
}

/**
 * Assess student readiness
 */
function assessReadiness(prerequisiteInfo, user, badge) {
    const readinessFactors = [];

    // Factor 1: Prerequisites
    if (prerequisiteInfo.hasPrerequisites && !prerequisiteInfo.allMet) {
        readinessFactors.push({
            factor: 'prerequisites',
            ready: false,
            message: `You need to master ${prerequisiteInfo.weakPrerequisites.length} prerequisite skill(s) first`,
            remediation: 'Review prerequisites before attempting this badge'
        });
    } else {
        readinessFactors.push({
            factor: 'prerequisites',
            ready: true,
            message: 'All prerequisites met!'
        });
    }

    // Factor 2: Ability level (theta)
    const userTheta = user.learningProfile?.abilityEstimate?.theta || 0;
    const badgeTheta = badge.requiredTheta || 0;
    const thetaGap = badgeTheta - userTheta;

    if (thetaGap > 1.5) {
        readinessFactors.push({
            factor: 'ability-level',
            ready: false,
            message: 'This badge may be too challenging right now',
            remediation: 'Try a lower-tier badge first to build confidence'
        });
    } else if (thetaGap > 0.5) {
        readinessFactors.push({
            factor: 'ability-level',
            ready: true,
            message: 'This badge will challenge you - perfect for growth!',
            note: 'stretch-zone'
        });
    } else {
        readinessFactors.push({
            factor: 'ability-level',
            ready: true,
            message: 'You\'re well-prepared for this badge'
        });
    }

    // Factor 3: Confidence check (if available)
    const confidence = user.learningProfile?.confidence || 5;
    if (confidence < 3) {
        readinessFactors.push({
            factor: 'confidence',
            ready: true,
            message: 'It\'s okay to feel uncertain - we\'ll guide you through it',
            note: 'encourage'
        });
    }

    const allReady = readinessFactors.every(f => f.ready);

    return {
        ready: allReady,
        factors: readinessFactors,
        recommendation: allReady ?
            'You\'re ready to begin! Let\'s start with some examples.' :
            'Let\'s build up your foundation first.',
        encouragement: allReady ?
            'You\'ve got this! Remember, mastery is a journey.' :
            'Taking time to prepare will make success easier.'
    };
}

/**
 * Create phase plan for badge earning
 */
function createPhasePlan(badge, skill, readinessCheck) {
    const plan = {
        phases: [],
        currentPhase: 'launch',
        estimatedDuration: '15-25 minutes'
    };

    // Phase 1: I Do (Modeling)
    plan.phases.push({
        phase: 'i-do',
        name: 'Learn by Example',
        description: 'Watch how an expert solves these problems',
        activities: [
            'Review 2 worked examples',
            'Understand the strategy and reasoning',
            'Ask questions about confusing steps'
        ],
        duration: '5-7 minutes',
        completionCriteria: 'Understand the approach'
    });

    // Phase 2: We Do (Guided Practice)
    plan.phases.push({
        phase: 'we-do',
        name: 'Guided Practice',
        description: 'Solve problems together with hints and support',
        activities: [
            `Attempt ${Math.ceil(badge.requiredProblems / 3)} guided problems`,
            'Receive hints when stuck',
            'Get feedback on each step'
        ],
        duration: '5-8 minutes',
        completionCriteria: `Get at least ${Math.round(badge.requiredAccuracy * 100 - 10)}% correct with hints`
    });

    // Phase 3: You Do (Independent Practice)
    plan.phases.push({
        phase: 'you-do',
        name: 'Independent Practice',
        description: 'Demonstrate mastery on your own',
        activities: [
            `Solve ${badge.requiredProblems} problems independently`,
            `Maintain ${Math.round(badge.requiredAccuracy * 100)}% accuracy`,
            'Request hints only if truly stuck'
        ],
        duration: '10-15 minutes',
        completionCriteria: `${badge.requiredProblems} problems at ${Math.round(badge.requiredAccuracy * 100)}% accuracy`
    });

    // Phase 4: Mastery Check (for Gold/Platinum)
    if (badge.tier === 'gold' || badge.tier === 'platinum') {
        plan.phases.push({
            phase: 'mastery-check',
            name: 'Deep Understanding',
            description: 'Explain your thinking and solve challenge problems',
            activities: [
                'Solve 1-2 transfer problems (new contexts)',
                'Explain your reasoning',
                'Justify your approach'
            ],
            duration: '5 minutes',
            completionCriteria: 'Demonstrate conceptual understanding'
        });
    }

    return plan;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    prepareBadgeLaunch,
    checkPrerequisites,
    generateLearningObjectives,
    generateWorkedExamples,
    assessReadiness,
    createPhasePlan
};

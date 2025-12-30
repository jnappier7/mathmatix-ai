/**
 * BADGE PHASE CONTROLLER
 *
 * Manages I Do / We Do / You Do phases specifically for badge earning
 * Integrates lessonPhaseManager with badge progress tracking
 *
 * Phase Flow:
 * 1. I DO - Student views worked examples, AI explains reasoning
 * 2. WE DO - Guided practice with hints and scaffolding
 * 3. YOU DO - Independent practice for badge requirements
 * 4. MASTERY CHECK - (Gold/Platinum only) Transfer and explanation
 *
 * @module badgePhaseController
 */

const { generateProblem } = require('./problemGenerator');
const { reason } = require('./llmGateway');
const Skill = require('../models/skill');

// ============================================================================
// PHASE MANAGEMENT
// ============================================================================

/**
 * Transition to next phase based on performance
 */
async function transitionPhase(user, assessment) {
    const activeBadge = user.masteryProgress?.activeBadge;

    if (!activeBadge) {
        throw new Error('No active badge found');
    }

    const currentPhase = activeBadge.currentPhase;
    let nextPhase = currentPhase;
    let shouldTransition = false;
    let rationale = '';

    switch (currentPhase) {
        case 'launch':
        case 'i-do':
            // Always transition after I Do (student just observes)
            nextPhase = 'we-do';
            shouldTransition = true;
            rationale = 'Ready for guided practice';
            break;

        case 'we-do':
            // Transition to You Do when student shows readiness
            const weDoProficiency = assessment.correct / assessment.attempts;
            const weDoConfidence = calculateConfidence(assessment);

            if (assessment.attempts >= 3) {
                if (weDoProficiency >= 0.7 && weDoConfidence >= 0.6) {
                    nextPhase = 'you-do';
                    shouldTransition = true;
                    rationale = 'Showing proficiency - ready for independent practice';
                } else if (weDoProficiency < 0.5) {
                    // Student struggling - return to I Do
                    nextPhase = 'i-do';
                    shouldTransition = true;
                    rationale = 'Needs more modeling - returning to I Do';
                } else {
                    shouldTransition = false;
                    rationale = 'Continue guided practice';
                }
            }
            break;

        case 'you-do':
            // Check if badge requirements met
            const meetsRequirements =
                activeBadge.problemsCompleted >= activeBadge.requiredProblems &&
                (activeBadge.problemsCorrect / activeBadge.problemsCompleted) >= activeBadge.requiredAccuracy;

            if (meetsRequirements) {
                // Gold/Platinum badges need mastery check
                if (activeBadge.tier === 'gold' || activeBadge.tier === 'platinum') {
                    nextPhase = 'mastery-check';
                    shouldTransition = true;
                    rationale = 'Requirements met - moving to deep understanding check';
                } else {
                    nextPhase = 'complete';
                    shouldTransition = true;
                    rationale = 'Badge requirements met!';
                }
            } else {
                shouldTransition = false;
                rationale = `Continue independent practice (${activeBadge.problemsCompleted}/${activeBadge.requiredProblems})`;
            }
            break;

        case 'mastery-check':
            // After mastery check, complete
            if (assessment.attempts >= 1 && assessment.correct >= 1) {
                nextPhase = 'complete';
                shouldTransition = true;
                rationale = 'Demonstrated deep understanding';
            }
            break;
    }

    // Update phase in database
    if (shouldTransition) {
        activeBadge.phaseHistory.push({
            phase: currentPhase,
            completedAt: new Date(),
            performance: {
                attempts: assessment.attempts,
                correct: assessment.correct,
                accuracy: assessment.attempts > 0 ? assessment.correct / assessment.attempts : 0
            }
        });

        activeBadge.currentPhase = nextPhase;
        user.markModified('masteryProgress.activeBadge');
        await user.save();
    }

    return {
        shouldTransition,
        currentPhase,
        nextPhase,
        rationale
    };
}

/**
 * Calculate confidence from recent performance
 */
function calculateConfidence(assessment) {
    if (!assessment.recentPerformance || assessment.recentPerformance.length === 0) {
        return 0.5;
    }

    const recent = assessment.recentPerformance.slice(-3);
    const correctCount = recent.filter(p => p.correct).length;
    return correctCount / recent.length;
}

/**
 * Get phase-specific instructions for AI tutor
 */
async function getPhaseInstructions(phase, badge, skill) {
    const skillData = skill || await Skill.findOne({ skillId: badge.skillId }).lean();

    const instructions = {
        'i-do': {
            role: 'expert-demonstrator',
            approach: 'modeling-with-think-aloud',
            instructions: `You are demonstrating how to solve ${skillData.displayName} problems.

**I DO PHASE - Your Role:**
- Show worked examples with step-by-step reasoning
- Think aloud: "I do this because..."
- Highlight key concepts: ${skillData.teachingGuidance?.coreConcepts?.join(', ')}
- Point out common mistakes to avoid: ${skillData.teachingGuidance?.commonMistakes?.[0]}

**DO NOT:**
- Ask the student to solve yet (that comes in We Do)
- Rush through steps
- Assume prior knowledge

Say: "Let me show you how I solve this step-by-step..."`,
            allowHints: false,
            scaffoldingLevel: 'full'
        },

        'we-do': {
            role: 'supportive-guide',
            approach: 'guided-practice',
            instructions: `You are guiding ${badge.badgeName} practice with scaffolding.

**WE DO PHASE - Your Role:**
- Provide progressive hints (not full solutions)
- Ask guiding questions: "What should we do first?"
- Celebrate correct steps: "Great! Now what's next?"
- Catch errors early: "Let's check that step..."

**Hint Progression:**
Level 1: "What operation would help here?"
Level 2: "Try isolating the variable first"
Level 3: "The next step is [specific action]"

**DO NOT:**
- Give full answers immediately
- Let students practice too many wrong attempts
- Skip feedback

Encourage: "Let's try this together..."`,
            allowHints: true,
            scaffoldingLevel: 'medium',
            maxHintsBeforeReteach: 2
        },

        'you-do': {
            role: 'coach-observer',
            approach: 'independent-practice',
            instructions: `Student is working independently on ${badge.badgeName}.

**YOU DO PHASE - Your Role:**
- Let student work independently
- Provide hints only if requested or after struggle
- Give specific feedback on errors (not just "wrong")
- Celebrate progress as they complete problems

**When Student Gets Stuck:**
- First ask: "What have you tried?"
- Then provide targeted hint about specific step
- If 3+ errors on same concept → offer quick reteaching

**DO NOT:**
- Hover or over-explain
- Give answers without letting them try
- Be vague ("Try again")

Encourage independence: "You've got this! Show me your thinking..."`,
            allowHints: true,
            scaffoldingLevel: 'minimal',
            encourageIndependence: true
        },

        'mastery-check': {
            role: 'assessor-with-empathy',
            approach: 'transfer-and-explanation',
            instructions: `Student is demonstrating deep understanding for ${badge.tier} tier.

**MASTERY CHECK PHASE - Your Role:**
- Present transfer problem (new context)
- Ask for explanation: "Why does this work?"
- Probe understanding: "What if we changed X?"
- Assess conceptual grasp, not just answer

**Transfer Problem Types:**
- Same concept, different representation
- Multi-step combining multiple skills
- Word problem requiring translation

**DO NOT:**
- Accept answer without reasoning
- Give hints during this phase
- Make it feel like punishment

Frame it positively: "Let's see how well you truly understand this..."`,
            allowHints: false,
            scaffoldingLevel: 'none',
            requireExplanation: true
        }
    };

    return instructions[phase] || instructions['you-do'];
}

/**
 * Generate next problem based on phase
 */
async function generatePhaseProblem(phase, badge, user) {
    let skill = null;

    // For pattern-based badges, try to find any available skill from the milestone
    if (badge.isPatternBadge && badge.allSkillIds && badge.allSkillIds.length > 0) {
        // Try each skill ID until we find one that exists
        for (const skillId of badge.allSkillIds) {
            skill = await Skill.findOne({ skillId }).lean();
            if (skill) break;
        }
    } else if (badge.skillId) {
        // Legacy badge system - single skillId
        skill = await Skill.findOne({ skillId: badge.skillId }).lean();
    }

    if (!skill) {
        // If no skill found, create a fallback error with helpful message
        const skillContext = badge.isPatternBadge
            ? `pattern milestone "${badge.milestoneName}" (skills: ${badge.allSkillIds?.join(', ')})`
            : `skill "${badge.skillId}"`;

        throw new Error(`Skill not found for ${skillContext}. Skills may need to be configured in the database.`);
    }

    let difficulty = badge.requiredTheta || 0;
    let problemOptions = {
        difficulty,
        fluencyModifier: user.fluencyProfile
    };

    // Adjust difficulty based on phase
    switch (phase) {
        case 'i-do':
            // Slightly easier for demonstration
            problemOptions.difficulty = difficulty - 0.3;
            break;

        case 'we-do':
            // At target difficulty
            problemOptions.difficulty = difficulty;
            break;

        case 'you-do':
            // Vary difficulty to test mastery
            const problemNumber = badge.problemsCompleted || 0;
            if (problemNumber === 0) {
                // First problem: easier to build confidence
                problemOptions.difficulty = difficulty - 0.2;
            } else if (problemNumber === badge.requiredProblems - 1) {
                // Last problem: harder to confirm mastery
                problemOptions.difficulty = difficulty + 0.3;
            } else {
                // Middle problems: at target with slight variation
                problemOptions.difficulty = difficulty + (Math.random() * 0.4 - 0.2);
            }
            break;

        case 'mastery-check':
            // Transfer problem - higher difficulty
            problemOptions.difficulty = difficulty + 0.5;
            problemOptions.transferContext = true;
            break;
    }

    const problem = generateProblem(skill.skillId, problemOptions);

    return {
        ...problem,
        phase,
        skillId: skill.skillId,
        phaseGuidance: await getPhaseInstructions(phase, badge, skill)
    };
}

/**
 * Record problem attempt and update phase state
 */
async function recordPhaseAttempt(user, problemId, correct, timeSpent, hintsUsed = 0) {
    const activeBadge = user.masteryProgress?.activeBadge;

    if (!activeBadge) {
        throw new Error('No active badge');
    }

    const phase = activeBadge.currentPhase;

    // Initialize phase assessment if needed
    if (!activeBadge.phaseAssessment) {
        activeBadge.phaseAssessment = {};
    }

    if (!activeBadge.phaseAssessment[phase]) {
        activeBadge.phaseAssessment[phase] = {
            attempts: 0,
            correct: 0,
            recentPerformance: []
        };
    }

    const phaseData = activeBadge.phaseAssessment[phase];

    // Record attempt
    phaseData.attempts++;
    if (correct) phaseData.correct++;

    phaseData.recentPerformance.push({
        problemId,
        correct,
        timeSpent,
        hintsUsed,
        timestamp: new Date()
    });

    // Keep only last 10 attempts
    if (phaseData.recentPerformance.length > 10) {
        phaseData.recentPerformance = phaseData.recentPerformance.slice(-10);
    }

    // Track overall badge progress (for You Do phase)
    if (phase === 'you-do') {
        activeBadge.problemsCompleted++;
        if (correct) activeBadge.problemsCorrect++;
    }

    // Track hints used
    activeBadge.hintsUsed = (activeBadge.hintsUsed || 0) + hintsUsed;

    user.markModified('masteryProgress.activeBadge');
    await user.save();

    // Check if should transition phases
    const transitionDecision = await transitionPhase(user, phaseData);

    return {
        phaseProgress: phaseData,
        badgeProgress: {
            problemsCompleted: activeBadge.problemsCompleted,
            problemsCorrect: activeBadge.problemsCorrect,
            requiredProblems: activeBadge.requiredProblems,
            requiredAccuracy: activeBadge.requiredAccuracy,
            currentAccuracy: activeBadge.problemsCompleted > 0
                ? activeBadge.problemsCorrect / activeBadge.problemsCompleted
                : 0
        },
        transition: transitionDecision
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    transitionPhase,
    getPhaseInstructions,
    generatePhaseProblem,
    recordPhaseAttempt,
    calculateConfidence
};

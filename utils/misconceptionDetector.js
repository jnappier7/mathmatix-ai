/**
 * MISCONCEPTION DETECTOR & RETEACHING ENGINE
 *
 * When students make errors, this system:
 * 1. Analyzes the error to identify the misconception
 * 2. Classifies the misconception type
 * 3. Provides targeted reteaching
 * 4. Tests understanding with similar problem
 *
 * Philosophy: Fix the root cause, not just the symptom
 *
 * @module misconceptionDetector
 */

const { reason } = require('./llmGateway');
const { generateProblem } = require('./problemGenerator');
const Skill = require('../models/skill');

// ============================================================================
// COMMON MISCONCEPTIONS BY SKILL
// ============================================================================

const MISCONCEPTION_LIBRARY = {
    'two-step-equations': [
        {
            id: 'wrong-operation-order',
            name: 'Incorrect Operation Order',
            description: 'Student performs operations in wrong sequence (e.g., divides before subtracting)',
            fix: 'Remind: Undo operations in reverse order - addition/subtraction before multiplication/division',
            testQuestion: 'Try this one with the correct order: 2x + 5 = 13'
        },
        {
            id: 'sign-error',
            name: 'Sign Error',
            description: 'Student makes mistake with positive/negative signs',
            fix: 'When subtracting a negative, it becomes addition. When adding a negative, it becomes subtraction.',
            testQuestion: 'Practice with signs: -3x + 7 = -2'
        },
        {
            id: 'one-sided-operation',
            name: 'One-Sided Operation',
            description: 'Student only applies operation to one side of equation',
            fix: 'Remember: Whatever you do to one side, you MUST do to the other to keep the equation balanced',
            testQuestion: 'Keep it balanced: 4x - 3 = 9'
        }
    ],

    'distributive-property': [
        {
            id: 'partial-distribution',
            name: 'Partial Distribution',
            description: 'Student only distributes to first term: 3(x + 2) = 3x + 2',
            fix: 'You must distribute to EVERY term inside the parentheses. 3(x + 2) = 3·x + 3·2 = 3x + 6',
            testQuestion: 'Distribute correctly: 5(2x + 3)'
        },
        {
            id: 'sign-distribution-error',
            name: 'Sign Distribution Error',
            description: 'Forgets to distribute negative sign: -2(x - 3) = -2x - 6 instead of -2x + 6',
            fix: 'When distributing a negative, multiply BOTH the coefficient AND the sign: -2(x - 3) = -2x + 6',
            testQuestion: 'Mind the signs: -3(4 - x)'
        }
    ],

    'order-of-operations': [
        {
            id: 'left-to-right-error',
            name: 'Strict Left-to-Right',
            description: 'Student works left-to-right ignoring PEMDAS: 2 + 3 × 4 = 20',
            fix: 'PEMDAS: Multiplication comes before addition. 2 + 3 × 4 = 2 + 12 = 14',
            testQuestion: 'Use PEMDAS: 5 + 2 × 3'
        },
        {
            id: 'parentheses-ignored',
            name: 'Ignoring Parentheses',
            description: 'Student ignores parentheses',
            fix: 'Parentheses are FIRST in PEMDAS. Always solve what\'s inside parentheses before anything else.',
            testQuestion: 'Parentheses first: (2 + 3) × 4'
        }
    ],

    'combining-like-terms': [
        {
            id: 'unlike-terms-combined',
            name: 'Combining Unlike Terms',
            description: 'Student combines x and x²: 2x + 3x² = 5x³',
            fix: 'You can only combine terms with the EXACT SAME variable and exponent. 2x and 3x² are different.',
            testQuestion: 'Identify like terms: 4x + 2x² + 3x - x²'
        },
        {
            id: 'coefficient-confusion',
            name: 'Coefficient Confusion',
            description: 'Student adds variables instead of coefficients: 2x + 3x = 5x²',
            fix: 'When combining like terms, add the COEFFICIENTS (numbers) and keep the variable the same: 2x + 3x = 5x',
            testQuestion: 'Combine coefficients: 7y + 4y'
        }
    ],

    'fractions': [
        {
            id: 'denominator-addition',
            name: 'Adding Denominators',
            description: 'Student adds denominators: 1/2 + 1/3 = 2/5',
            fix: 'Never add denominators! Find a common denominator first, then add numerators only.',
            testQuestion: 'Common denominator: 1/4 + 1/6'
        }
    ]
};

// ============================================================================
// ERROR ANALYSIS
// ============================================================================

/**
 * Analyze student's incorrect answer to detect misconception
 */
async function analyzeError(problem, studentAnswer, skill) {
    try {
        const analysisPrompt = `You are a math education expert analyzing a student error.

**Problem:** ${problem.content}
**Correct Answer:** ${problem.answer}
**Student's Answer:** ${studentAnswer}
**Skill:** ${skill.displayName}

${skill.teachingGuidance?.commonMistakes ?
`**Known Common Mistakes for this skill:**
${skill.teachingGuidance.commonMistakes.map((m, i) => `${i + 1}. ${m}`).join('\n')}` : ''}

**Task:** Identify the specific misconception or error pattern.

Respond in this format:
MISCONCEPTION: [One-line name of the misconception]
ERROR: [What specifically went wrong in their thinking]
ROOT_CAUSE: [Why this misconception happens]
SEVERITY: [low/medium/high - how serious is this misunderstanding]

Be concise and specific.`;

        const analysis = await reason(analysisPrompt, { maxTokens: 200, temperature: 0.7 });

        // Parse response
        const misconceptionMatch = analysis.match(/MISCONCEPTION:\s*(.+)/i);
        const errorMatch = analysis.match(/ERROR:\s*(.+)/i);
        const rootCauseMatch = analysis.match(/ROOT_CAUSE:\s*(.+)/i);
        const severityMatch = analysis.match(/SEVERITY:\s*(low|medium|high)/i);

        return {
            misconceptionName: misconceptionMatch ? misconceptionMatch[1].trim() : 'Unknown error',
            errorDescription: errorMatch ? errorMatch[1].trim() : 'Incorrect approach',
            rootCause: rootCauseMatch ? rootCauseMatch[1].trim() : 'Misunderstanding of concept',
            severity: severityMatch ? severityMatch[1].toLowerCase() : 'medium',
            rawAnalysis: analysis
        };

    } catch (error) {
        console.error('[Misconception] Error analyzing:', error);
        return {
            misconceptionName: 'General error',
            errorDescription: 'Incorrect answer provided',
            rootCause: 'Unknown',
            severity: 'medium'
        };
    }
}

/**
 * Find matching misconception from library
 */
function findKnownMisconception(skillId, errorDescription) {
    const skillMisconceptions = MISCONCEPTION_LIBRARY[skillId];

    if (!skillMisconceptions) {
        return null;
    }

    // Simple keyword matching
    for (const misconception of skillMisconceptions) {
        const keywords = misconception.name.toLowerCase().split(' ');
        const matchCount = keywords.filter(kw =>
            errorDescription.toLowerCase().includes(kw)
        ).length;

        if (matchCount >= 2 || errorDescription.toLowerCase().includes(misconception.name.toLowerCase())) {
            return misconception;
        }
    }

    return null;
}

// ============================================================================
// RETEACHING
// ============================================================================

/**
 * Generate targeted reteaching based on misconception
 */
async function generateReteaching(misconception, problem, skill) {
    const knownMisconception = findKnownMisconception(skill.skillId, misconception.errorDescription);

    if (knownMisconception) {
        // Use library reteaching
        return {
            type: 'known-misconception',
            misconceptionId: knownMisconception.id,
            explanation: knownMisconception.fix,
            example: await generateWorkedExample(skill, knownMisconception),
            testProblem: knownMisconception.testQuestion
        };
    } else {
        // Generate custom reteaching
        return await generateCustomReteaching(misconception, problem, skill);
    }
}

/**
 * Generate custom reteaching for unknown misconception
 */
async function generateCustomReteaching(misconception, problem, skill) {
    const reteachPrompt = `You are a patient math teacher addressing a student's misconception.

**Student's Misconception:** ${misconception.misconceptionName}
**What went wrong:** ${misconception.errorDescription}
**Why it happened:** ${misconception.rootCause}

**Original Problem:** ${problem.content}
**Correct Answer:** ${problem.answer}

**Task:** Create a brief reteaching explanation (2-3 sentences) that:
1. Explains the correct concept
2. Shows why their approach doesn't work
3. Provides the correct method

**Your explanation:**`;

    try {
        const explanation = await reason(reteachPrompt, { maxTokens: 200, temperature: 0.7 });

        return {
            type: 'custom-reteaching',
            explanation,
            example: null,
            testProblem: null
        };

    } catch (error) {
        console.error('[Reteaching] Error generating:', error);
        return {
            type: 'fallback',
            explanation: `Let's review the ${skill.displayName} concept. ${skill.teachingGuidance?.teachingTips?.[0] || 'Take it step by step.'}`,
            example: null,
            testProblem: null
        };
    }
}

/**
 * Generate worked example for reteaching
 */
async function generateWorkedExample(skill, misconception) {
    const problem = generateProblem(skill.skillId, {
        difficulty: -0.5,  // Easier problem for teaching
        templateHint: null
    });

    if (!problem) {
        return null;
    }

    const examplePrompt = `Show a step-by-step solution to this problem, highlighting how to avoid this misconception:

**Problem:** ${problem.content}
**Answer:** ${problem.answer}
**Misconception to avoid:** ${misconception.description}

Provide solution in 3-4 numbered steps.`;

    try {
        const solution = await reason(examplePrompt, { maxTokens: 250 });

        return {
            problem: problem.content,
            answer: problem.answer,
            solution
        };
    } catch (error) {
        return null;
    }
}

// ============================================================================
// TRACKING & PERSISTENCE
// ============================================================================

/**
 * Record misconception for student
 */
async function recordMisconception(user, skillId, misconception) {
    const activeBadge = user.masteryProgress?.activeBadge;

    if (!activeBadge) {
        return;
    }

    // Initialize misconceptions array
    if (!activeBadge.misconceptionsAddressed) {
        activeBadge.misconceptionsAddressed = [];
    }

    activeBadge.misconceptionsAddressed.push({
        skillId,
        misconceptionName: misconception.misconceptionName,
        errorDescription: misconception.errorDescription,
        severity: misconception.severity,
        timestamp: new Date(),
        addressed: false
    });

    user.markModified('masteryProgress.activeBadge');
    await user.save();
}

/**
 * Mark misconception as addressed
 */
async function markMisconceptionAddressed(user, misconceptionName) {
    const activeBadge = user.masteryProgress?.activeBadge;

    if (!activeBadge || !activeBadge.misconceptionsAddressed) {
        return;
    }

    const misconception = activeBadge.misconceptionsAddressed.find(
        m => m.misconceptionName === misconceptionName && !m.addressed
    );

    if (misconception) {
        misconception.addressed = true;
        misconception.addressedAt = new Date();

        user.markModified('masteryProgress.activeBadge');
        await user.save();
    }
}

/**
 * Get pattern of misconceptions
 */
function analyzeMisconceptionPattern(user) {
    const activeBadge = user.masteryProgress?.activeBadge;

    if (!activeBadge || !activeBadge.misconceptionsAddressed) {
        return {
            total: 0,
            unaddressed: 0,
            recurring: [],
            mostCommon: null
        };
    }

    const misconceptions = activeBadge.misconceptionsAddressed;
    const unaddressed = misconceptions.filter(m => !m.addressed);

    // Find recurring misconceptions
    const counts = {};
    misconceptions.forEach(m => {
        counts[m.misconceptionName] = (counts[m.misconceptionName] || 0) + 1;
    });

    const recurring = Object.entries(counts)
        .filter(([_, count]) => count >= 2)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    const mostCommon = recurring.length > 0 ? recurring[0].name : null;

    return {
        total: misconceptions.length,
        unaddressed: unaddressed.length,
        recurring,
        mostCommon,
        needsIntervention: recurring.length > 0 && recurring[0].count >= 3
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    analyzeError,
    findKnownMisconception,
    generateReteaching,
    recordMisconception,
    markMisconceptionAddressed,
    analyzeMisconceptionPattern,
    MISCONCEPTION_LIBRARY
};

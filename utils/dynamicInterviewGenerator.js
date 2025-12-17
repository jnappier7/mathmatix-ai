/**
 * DYNAMIC INTERVIEW QUESTION GENERATOR
 *
 * Generates adaptive interview questions for ANY skill based on screener results.
 * Goes beyond surface-level assessment to probe deep understanding.
 *
 * Question Types:
 * 1. Explanation - "Why does this work?"
 * 2. Transfer - "Apply this to a new context"
 * 3. Misconception Probe - "What if we did X instead?"
 * 4. Justification - "How do you know you're right?"
 * 5. Connection - "How does this relate to...?"
 *
 * @module dynamicInterviewGenerator
 */

const { reason } = require('./llmGateway');
const { generateProblem } = require('./problemGenerator');
const Skill = require('../models/skill');

// ============================================================================
// INTERVIEW QUESTION GENERATION
// ============================================================================

/**
 * Generate interview questions for a frontier skill
 * @param {Object} skill - Skill object
 * @param {Number} theta - Student ability estimate
 * @param {Object} screenerResults - Results from adaptive screener
 * @returns {Promise<Array>} Array of interview questions
 */
async function generateInterviewQuestions(skill, theta, screenerResults) {
    try {
        const questions = [];

        // Generate 3-5 questions of different types
        const questionTypes = ['explanation', 'transfer', 'misconception-probe'];

        for (const type of questionTypes) {
            const question = await generateQuestionByType(skill, theta, type, screenerResults);
            if (question) {
                questions.push(question);
            }
        }

        return questions;

    } catch (error) {
        console.error('[Interview] Error generating questions:', error);
        return getFallbackQuestions(skill);
    }
}

/**
 * Generate question by type
 */
async function generateQuestionByType(skill, theta, type, screenerResults) {
    const baseProblem = generateProblem(skill.skillId, { difficulty: theta });

    if (!baseProblem) {
        return null;
    }

    const prompt = buildQuestionPrompt(skill, baseProblem, type, theta, screenerResults);

    try {
        const questionText = await reason(prompt, { maxTokens: 200, temperature: 0.8 });

        return {
            type,
            question: questionText,
            baseProblem: baseProblem.content,
            expectedAnswer: baseProblem.answer,
            skillId: skill.skillId,
            rubric: getRubric(type)
        };

    } catch (error) {
        console.error(`[Interview] Error generating ${type} question:`, error);
        return null;
    }
}

/**
 * Build prompt for question generation
 */
function buildQuestionPrompt(skill, baseProblem, type, theta, screenerResults) {
    const basePrompt = `You are creating an interview question to assess deep understanding of ${skill.displayName}.

**Skill:** ${skill.displayName}
**Description:** ${skill.description}
**Student Ability (theta):** ${theta.toFixed(2)}

${skill.teachingGuidance?.coreConcepts ? `**Core Concepts:** ${skill.teachingGuidance.coreConcepts.join(', ')}` : ''}
${skill.teachingGuidance?.commonMistakes ? `**Common Mistakes:** ${skill.teachingGuidance.commonMistakes[0]}` : ''}

**Sample Problem:** ${baseProblem.content}
**Answer:** ${baseProblem.answer}
`;

    let typeInstructions = '';

    switch (type) {
        case 'explanation':
            typeInstructions = `**EXPLANATION QUESTION:**
Create a question that requires the student to EXPLAIN their reasoning, not just solve.

Format: Present a problem and ask "How did you solve this?" or "Why does this work?"

Example: "Solve 3x + 7 = 22. Explain each step and WHY you chose those operations."

Your question:`;
            break;

        case 'transfer':
            typeInstructions = `**TRANSFER QUESTION:**
Present the concept in a NEW CONTEXT to test if they truly understand.

Format: Change the representation (word problem, visual, real-world scenario).

Example: "If a recipe calls for 2 cups of flour plus 3 more cups for every person, and you need 11 cups total, how many people are you serving? Explain how this is like solving 2x + 3 = 11."

Your question (make it different from the example):`;
            break;

        case 'misconception-probe':
            typeInstructions = `**MISCONCEPTION PROBE:**
Ask "What if?" to test if they know WHY not to do a common error.

Format: "What would happen if we [common mistake]? Why doesn't that work?"

Example: "What if someone only distributed to the first term: 3(x + 2) = 3x + 2. What's wrong with that?"

Your question (probe the common mistake: ${skill.teachingGuidance?.commonMistakes?.[0] || 'a typical error'}):`;
            break;

        case 'justification':
            typeInstructions = `**JUSTIFICATION QUESTION:**
Ask the student to justify their answer or prove they're correct.

Format: "How do you know this is right?" or "Prove your answer works."

Your question:`;
            break;

        case 'connection':
            typeInstructions = `**CONNECTION QUESTION:**
Ask how this skill connects to prerequisite or related skills.

Format: "How is this related to [prerequisite skill]?"

Your question:`;
            break;

        default:
            typeInstructions = 'Create a thought-provoking question about this skill.';
    }

    return basePrompt + '\n' + typeInstructions;
}

/**
 * Get rubric for evaluating response
 */
function getRubric(type) {
    const rubrics = {
        'explanation': {
            excellent: 'Explains each step with clear reasoning',
            good: 'Describes most steps accurately',
            developing: 'Lists steps but minimal explanation',
            needs_work: 'Incomplete or incorrect explanation'
        },
        'transfer': {
            excellent: 'Correctly applies concept to new context and explains connection',
            good: 'Applies concept correctly but weak explanation',
            developing: 'Partial application or understanding',
            needs_work: 'Cannot transfer to new context'
        },
        'misconception-probe': {
            excellent: 'Identifies error and explains why it\'s wrong',
            good: 'Identifies error with partial explanation',
            developing: 'Knows something is wrong but unclear why',
            needs_work: 'Does not recognize the error'
        },
        'justification': {
            excellent: 'Provides mathematical proof or verification',
            good: 'Shows checking work or validation',
            developing: 'Weak justification',
            needs_work: 'Cannot justify answer'
        },
        'connection': {
            excellent: 'Makes clear connections with examples',
            good: 'Identifies connections',
            developing: 'Vague connections',
            needs_work: 'No connections made'
        }
    };

    return rubrics[type] || {
        excellent: 'Demonstrates deep understanding',
        good: 'Shows understanding',
        developing: 'Partial understanding',
        needs_work: 'Needs more practice'
    };
}

/**
 * Fallback questions if generation fails
 */
function getFallbackQuestions(skill) {
    return [
        {
            type: 'explanation',
            question: `Solve a ${skill.displayName} problem and explain each step of your reasoning.`,
            rubric: getRubric('explanation')
        },
        {
            type: 'transfer',
            question: `Give me a real-world example where you would use ${skill.displayName}.`,
            rubric: getRubric('transfer')
        }
    ];
}

// ============================================================================
// ADAPTIVE FOLLOW-UP QUESTIONS
// ============================================================================

/**
 * Generate follow-up question based on student's response
 * @param {Object} originalQuestion - The original interview question
 * @param {String} studentResponse - Student's answer
 * @param {Object} skill - Skill object
 * @returns {Promise<Object>} Follow-up question
 */
async function generateFollowUp(originalQuestion, studentResponse, skill) {
    const followUpPrompt = `You are conducting a teaching interview. The student just responded to your question.

**Original Question:** ${originalQuestion.question}
**Student's Response:** ${studentResponse}

**Task:** Create ONE follow-up question that:
1. Probes deeper if their answer was good
2. Guides them if their answer was weak
3. Challenges misconceptions if present

Keep it conversational and supportive.

Your follow-up question:`;

    try {
        const followUp = await reason(followUpPrompt, { maxTokens: 150, temperature: 0.8 });

        return {
            type: 'follow-up',
            question: followUp,
            parentQuestion: originalQuestion.question,
            studentPriorResponse: studentResponse
        };

    } catch (error) {
        console.error('[Interview] Error generating follow-up:', error);
        return {
            type: 'follow-up',
            question: 'Can you explain that in a different way?',
            parentQuestion: originalQuestion.question
        };
    }
}

/**
 * Evaluate student's interview response
 * @param {Object} question - Interview question
 * @param {String} studentResponse - Student's answer
 * @param {Object} skill - Skill object
 * @returns {Promise<Object>} Evaluation
 */
async function evaluateResponse(question, studentResponse, skill) {
    const evalPrompt = `You are evaluating a student's response to an interview question.

**Question:** ${question.question}
**Question Type:** ${question.type}
**Student's Response:** ${studentResponse}

**Rubric:**
- Excellent: ${question.rubric.excellent}
- Good: ${question.rubric.good}
- Developing: ${question.rubric.developing}
- Needs Work: ${question.rubric.needs_work}

**Task:** Evaluate their response.

Format:
RATING: [excellent/good/developing/needs_work]
STRENGTHS: [What they did well]
AREAS_FOR_GROWTH: [What to improve]
UNDERSTANDING_LEVEL: [deep/surface/misconception]

Be specific and constructive.`;

    try {
        const evaluation = await reason(evalPrompt, { maxTokens: 200, temperature: 0.7 });

        // Parse evaluation
        const ratingMatch = evaluation.match(/RATING:\s*(excellent|good|developing|needs_work)/i);
        const strengthsMatch = evaluation.match(/STRENGTHS:\s*(.+)/i);
        const areasMatch = evaluation.match(/AREAS_FOR_GROWTH:\s*(.+)/i);
        const understandingMatch = evaluation.match(/UNDERSTANDING_LEVEL:\s*(deep|surface|misconception)/i);

        return {
            rating: ratingMatch ? ratingMatch[1].toLowerCase() : 'developing',
            strengths: strengthsMatch ? strengthsMatch[1].trim() : 'Attempted the problem',
            areasForGrowth: areasMatch ? areasMatch[1].trim() : 'Continue practicing',
            understandingLevel: understandingMatch ? understandingMatch[1].toLowerCase() : 'surface',
            rawEvaluation: evaluation
        };

    } catch (error) {
        console.error('[Interview] Error evaluating response:', error);
        return {
            rating: 'developing',
            strengths: 'Provided a response',
            areasForGrowth: 'Keep practicing',
            understandingLevel: 'surface'
        };
    }
}

// ============================================================================
// INTERVIEW SESSION MANAGEMENT
// ============================================================================

/**
 * Create interview session for frontier skills
 * @param {Array} frontierSkills - Skills to interview on
 * @param {Number} theta - Student ability
 * @param {Object} screenerResults - Screener results
 * @returns {Promise<Object>} Interview session
 */
async function createInterviewSession(frontierSkills, theta, screenerResults) {
    const session = {
        sessionId: `interview-${Date.now()}`,
        frontierSkills: frontierSkills.slice(0, 3), // Focus on top 3
        currentSkillIndex: 0,
        questions: [],
        responses: [],
        startTime: new Date(),
        completed: false
    };

    // Generate questions for first skill
    const firstSkill = await Skill.findOne({ skillId: frontierSkills[0] }).lean();
    if (firstSkill) {
        session.questions = await generateInterviewQuestions(firstSkill, theta, screenerResults);
        session.currentSkill = firstSkill;
    }

    return session;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    generateInterviewQuestions,
    generateFollowUp,
    evaluateResponse,
    createInterviewSession
};

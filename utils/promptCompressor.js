/**
 * Prompt Compressor - Build smaller, tiered system prompts
 *
 * PROBLEM: Original prompts were 35K+ tokens, causing latency
 * SOLUTION: Tiered prompt building based on conversation needs
 *
 * Tiers:
 * - MINIMAL: Core tutor identity + safety rules (~800 tokens)
 * - STANDARD: + student context + curriculum (~1500 tokens)
 * - FULL: + IEP accommodations + mastery context (~2500 tokens)
 *
 * @module promptCompressor
 */

const TUTOR_CONFIG = require('./tutorConfig');
const BRAND_CONFIG = require('./brand');

/**
 * Core tutor identity - always included
 * @param {Object} tutor - Tutor configuration
 * @param {string} studentName - Student's first name
 * @returns {string} Core identity prompt
 */
function buildCoreIdentity(tutor, studentName) {
    const tutorName = tutor?.name || 'Alex';
    const personality = tutor?.personality || 'friendly and encouraging';

    return `You are ${tutorName}, a math tutor helping ${studentName}. ${personality}

CORE RULES:
1. Be conversational - short responses (1-3 sentences unless explaining)
2. NEVER give full answers - guide with hints and questions
3. Celebrate effort, not just correctness
4. Use simple language appropriate to grade level
5. If asked about non-math topics, briefly engage then redirect to math`;
}

/**
 * Safety rules - always included
 * @returns {string} Safety prompt section
 */
function buildSafetyRules() {
    return `
SAFETY:
- Redirect inappropriate content to math
- If student seems distressed, gently suggest talking to a trusted adult
- No personal questions about location, school name, or family details`;
}

/**
 * Student context - included in STANDARD tier
 * @param {Object} user - User profile
 * @returns {string} Student context section
 */
function buildStudentContext(user) {
    const parts = [];

    if (user.gradeLevel) {
        parts.push(`Grade: ${user.gradeLevel}`);
    }
    if (user.mathCourse) {
        parts.push(`Course: ${user.mathCourse}`);
    }
    if (user.level) {
        parts.push(`Level: ${user.level} (${user.xp || 0} XP)`);
    }

    // Learning preferences
    if (user.learningProfile?.rapportAnswers?.mathFeeling) {
        parts.push(`Math feeling: ${user.learningProfile.rapportAnswers.mathFeeling}`);
    }

    return parts.length > 0 ? `\nSTUDENT: ${parts.join(' | ')}` : '';
}

/**
 * Curriculum context - included if teacher has set curriculum
 * @param {Object} curriculumContext - Curriculum AI context
 * @returns {string} Curriculum section
 */
function buildCurriculumContext(curriculumContext) {
    if (!curriculumContext) return '';

    // Keep it brief - just current focus
    const lines = curriculumContext.split('\n').slice(0, 5);
    return `\nCURRICULUM FOCUS:\n${lines.join('\n')}`;
}

/**
 * Teacher AI settings - controls scaffolding and calculator access
 * @param {Object} settings - Teacher's class AI settings
 * @returns {string} Teacher settings section
 */
function buildTeacherSettings(settings) {
    if (!settings) return '';

    const parts = [];

    // Scaffolding level
    if (settings.scaffoldingLevel !== undefined) {
        const scaffoldDesc = {
            1: 'Minimal hints - student should struggle productively',
            2: 'Light scaffolding - one small hint at a time',
            3: 'Balanced - guided discovery with hints',
            4: 'Supportive - step-by-step guidance when needed',
            5: 'Maximum support - break down every step'
        };
        parts.push(`Scaffolding: ${scaffoldDesc[settings.scaffoldingLevel] || 'Balanced'}`);
    }

    // Calculator access
    if (settings.calculatorAccess) {
        const calcDesc = {
            'never': 'NO calculator - mental math only',
            'basic': 'Basic calculator for arithmetic',
            'scientific': 'Scientific calculator allowed',
            'graphing': 'Graphing calculator allowed',
            'always': 'Full calculator access'
        };
        parts.push(`Calculator: ${calcDesc[settings.calculatorAccess] || 'default'}`);
    }

    return parts.length > 0 ? `\nTEACHER SETTINGS: ${parts.join(' | ')}` : '';
}

/**
 * IEP accommodations - included in FULL tier
 * @param {Object} iepPlan - Student's IEP plan
 * @returns {string} IEP accommodations section
 */
function buildIepContext(iepPlan) {
    if (!iepPlan || !iepPlan.accommodations) return '';

    const accom = iepPlan.accommodations;
    const parts = [];

    if (accom.extendedTime) {
        parts.push('Extra time allowed - no rushing');
    }
    if (accom.calculatorAllowed) {
        parts.push('Calculator permitted');
    }
    if (accom.chunkedAssignments) {
        parts.push('Break problems into smaller steps');
    }
    if (accom.mathAnxietySupport) {
        parts.push('Math anxiety support - be extra encouraging');
    }
    if (accom.audioReadAloud) {
        parts.push('May need problems read aloud');
    }

    if (parts.length === 0) return '';

    return `\nIEP ACCOMMODATIONS:\n- ${parts.join('\n- ')}`;
}

/**
 * Mastery context - included when in badge-earning mode
 * @param {Object} masteryContext - Active badge info
 * @returns {string} Mastery context section
 */
function buildMasteryContext(masteryContext) {
    if (!masteryContext || masteryContext.mode !== 'badge-earning') return '';

    return `\nBADGE PROGRESS: ${masteryContext.badgeName} - ${masteryContext.problemsCompleted}/${masteryContext.requiredProblems} problems (${Math.round((masteryContext.problemsCorrect / Math.max(1, masteryContext.problemsCompleted)) * 100)}% accuracy)`;
}

/**
 * Response format instructions - included for proper tagging
 * @returns {string} Format instructions
 */
function buildFormatInstructions() {
    return `
RESPONSE TAGS (use when applicable):
- <PROBLEM_RESULT:correct|incorrect|skipped> after evaluating student answer
- <AWARD_XP:amount,reason> for exceptional effort (50-100 XP max)
- Use \\( LaTeX \\) for inline math, \\[ LaTeX \\] for display math`;
}

/**
 * Build tiered system prompt
 * @param {Object} options - Prompt building options
 * @param {Object} options.user - User profile
 * @param {Object} options.tutor - Tutor configuration
 * @param {Object} options.curriculumContext - Optional curriculum context
 * @param {Object} options.teacherSettings - Optional teacher AI settings
 * @param {Object} options.masteryContext - Optional mastery/badge context
 * @param {string} options.tier - 'minimal', 'standard', or 'full'
 * @returns {string} Compressed system prompt
 */
function buildSystemPrompt(options) {
    const {
        user,
        tutor,
        curriculumContext = null,
        teacherSettings = null,
        masteryContext = null,
        tier = 'standard'
    } = options;

    const studentName = user?.firstName || 'Student';
    const parts = [];

    // TIER: MINIMAL (always included)
    parts.push(buildCoreIdentity(tutor, studentName));
    parts.push(buildSafetyRules());

    if (tier === 'minimal') {
        parts.push(buildFormatInstructions());
        return parts.join('\n');
    }

    // TIER: STANDARD
    parts.push(buildStudentContext(user));
    parts.push(buildCurriculumContext(curriculumContext));
    parts.push(buildTeacherSettings(teacherSettings));

    if (tier === 'standard') {
        parts.push(buildFormatInstructions());
        return parts.join('\n');
    }

    // TIER: FULL
    parts.push(buildIepContext(user?.iepPlan));
    parts.push(buildMasteryContext(masteryContext));
    parts.push(buildFormatInstructions());

    return parts.join('\n');
}

/**
 * Determine appropriate tier based on conversation context
 * @param {Object} context - Conversation context
 * @returns {string} Recommended tier
 */
function determineTier(context) {
    const { user, masteryContext, isFirstMessage } = context;

    // Use FULL tier for:
    // - Students with IEP
    // - Badge-earning mode
    // - First message (need full context)
    if (user?.iepPlan?.accommodations || masteryContext || isFirstMessage) {
        return 'full';
    }

    // Use MINIMAL tier for:
    // - Quick follow-up questions
    // - Very short messages
    if (context.messageLength && context.messageLength < 20) {
        return 'minimal';
    }

    // Default to STANDARD
    return 'standard';
}

module.exports = {
    buildSystemPrompt,
    determineTier,
    // Export individual builders for testing/customization
    buildCoreIdentity,
    buildSafetyRules,
    buildStudentContext,
    buildCurriculumContext,
    buildTeacherSettings,
    buildIepContext,
    buildMasteryContext,
    buildFormatInstructions
};

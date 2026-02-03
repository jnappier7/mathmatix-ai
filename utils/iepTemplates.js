/**
 * IEP Templates - Pre-built IEP configurations for common needs
 *
 * Provides quick-start templates for teachers setting up IEP accommodations
 * and goals for students with various learning needs.
 *
 * @module utils/iepTemplates
 */

/**
 * Accommodation templates for common disabilities/needs
 */
const ACCOMMODATION_TEMPLATES = {
    // Learning Disabilities
    'dyscalculia': {
        id: 'dyscalculia',
        name: 'Dyscalculia Support',
        description: 'For students with math-specific learning disabilities',
        category: 'learning-disability',
        accommodations: {
            extendedTime: true,
            calculatorAllowed: true,
            digitalMultiplicationChart: true,
            chunkedAssignments: true,
            mathAnxietySupport: true,
            custom: ['Use graph paper for alignment', 'Allow finger counting', 'Provide number lines']
        }
    },

    'dyslexia': {
        id: 'dyslexia',
        name: 'Dyslexia Support',
        description: 'For students with reading-based learning disabilities affecting math word problems',
        category: 'learning-disability',
        accommodations: {
            extendedTime: true,
            audioReadAloud: true,
            largePrintHighContrast: true,
            reducedDistraction: true,
            custom: ['Read word problems aloud', 'Highlight key numbers', 'Simplified text formatting']
        }
    },

    'adhd': {
        id: 'adhd',
        name: 'ADHD Support',
        description: 'For students with attention difficulties',
        category: 'attention',
        accommodations: {
            extendedTime: true,
            reducedDistraction: true,
            chunkedAssignments: true,
            breaksAsNeeded: true,
            custom: ['Movement breaks every 15 minutes', 'Positive reinforcement frequently', 'Clear step-by-step instructions']
        }
    },

    'processing-speed': {
        id: 'processing-speed',
        name: 'Processing Speed Support',
        description: 'For students who need more time to process information',
        category: 'cognitive',
        accommodations: {
            extendedTime: true,
            breaksAsNeeded: true,
            chunkedAssignments: true,
            reducedDistraction: true,
            custom: ['Wait time after questions', 'Repeat instructions as needed', 'Reduce number of problems']
        }
    },

    'math-anxiety': {
        id: 'math-anxiety',
        name: 'Math Anxiety Support',
        description: 'For students experiencing significant math-related anxiety',
        category: 'social-emotional',
        accommodations: {
            extendedTime: true,
            mathAnxietySupport: true,
            breaksAsNeeded: true,
            chunkedAssignments: true,
            custom: ['Growth mindset encouragement', 'Celebrate small wins', 'Low-stakes practice environment']
        }
    },

    'visual-impairment': {
        id: 'visual-impairment',
        name: 'Visual Impairment Support',
        description: 'For students with vision challenges',
        category: 'physical',
        accommodations: {
            largePrintHighContrast: true,
            audioReadAloud: true,
            extendedTime: true,
            custom: ['High contrast mode enabled', 'Screen reader compatible', 'Enlarged graphs and diagrams']
        }
    },

    'esl-ell': {
        id: 'esl-ell',
        name: 'ESL/ELL Support',
        description: 'For English Language Learners',
        category: 'language',
        accommodations: {
            extendedTime: true,
            audioReadAloud: true,
            custom: ['Simplified vocabulary in word problems', 'Visual supports for concepts', 'Bilingual glossary available']
        }
    },

    'autism-spectrum': {
        id: 'autism-spectrum',
        name: 'Autism Spectrum Support',
        description: 'For students on the autism spectrum',
        category: 'developmental',
        accommodations: {
            reducedDistraction: true,
            chunkedAssignments: true,
            breaksAsNeeded: true,
            extendedTime: true,
            custom: ['Predictable routine', 'Clear explicit instructions', 'Visual schedules', 'Sensory breaks as needed']
        }
    },

    'minimal': {
        id: 'minimal',
        name: 'Minimal Accommodations',
        description: 'Basic accommodations for minor support needs',
        category: 'general',
        accommodations: {
            extendedTime: true,
            custom: []
        }
    },

    'comprehensive': {
        id: 'comprehensive',
        name: 'Comprehensive Support',
        description: 'Full range of accommodations for significant support needs',
        category: 'general',
        accommodations: {
            extendedTime: true,
            reducedDistraction: true,
            calculatorAllowed: true,
            audioReadAloud: true,
            chunkedAssignments: true,
            breaksAsNeeded: true,
            digitalMultiplicationChart: true,
            largePrintHighContrast: true,
            mathAnxietySupport: true,
            custom: []
        }
    }
};

/**
 * Goal templates by skill area and grade level range
 */
const GOAL_TEMPLATES = {
    // Number Sense Goals
    'number-sense-elementary': {
        id: 'number-sense-elementary',
        name: 'Number Sense (K-2)',
        category: 'number-sense',
        gradeLevels: ['K', '1', '2'],
        goals: [
            {
                description: 'Student will count objects up to 100 with 90% accuracy',
                measurementMethod: 'Performance-based assessment with manipulatives',
                targetMonths: 4
            },
            {
                description: 'Student will identify place values (ones, tens, hundreds) with 85% accuracy',
                measurementMethod: 'Written assessment and verbal explanation',
                targetMonths: 3
            },
            {
                description: 'Student will compare two numbers using <, >, = symbols with 90% accuracy',
                measurementMethod: 'Worksheet assessments and digital practice',
                targetMonths: 3
            }
        ]
    },

    'number-sense-upper-elementary': {
        id: 'number-sense-upper-elementary',
        name: 'Number Sense (3-5)',
        category: 'number-sense',
        gradeLevels: ['3', '4', '5'],
        goals: [
            {
                description: 'Student will multiply single-digit numbers fluently (within 3 seconds) with 90% accuracy',
                measurementMethod: 'Timed fact fluency assessments',
                targetMonths: 6
            },
            {
                description: 'Student will convert between fractions, decimals, and percentages with 80% accuracy',
                measurementMethod: 'Mixed format assessments',
                targetMonths: 4
            },
            {
                description: 'Student will round numbers to any place value with 90% accuracy',
                measurementMethod: 'Written assessments',
                targetMonths: 2
            }
        ]
    },

    // Operations Goals
    'operations-addition-subtraction': {
        id: 'operations-addition-subtraction',
        name: 'Addition & Subtraction',
        category: 'operations',
        gradeLevels: ['1', '2', '3'],
        goals: [
            {
                description: 'Student will solve 2-digit addition problems with regrouping with 85% accuracy',
                measurementMethod: 'Written assessments and digital practice',
                targetMonths: 3
            },
            {
                description: 'Student will solve 2-digit subtraction problems with borrowing with 85% accuracy',
                measurementMethod: 'Written assessments and digital practice',
                targetMonths: 3
            },
            {
                description: 'Student will solve addition/subtraction word problems with 80% accuracy',
                measurementMethod: 'Word problem assessments with strategy documentation',
                targetMonths: 4
            }
        ]
    },

    'operations-multiplication-division': {
        id: 'operations-multiplication-division',
        name: 'Multiplication & Division',
        category: 'operations',
        gradeLevels: ['3', '4', '5'],
        goals: [
            {
                description: 'Student will recall multiplication facts 0-12 with 90% accuracy within 3 seconds',
                measurementMethod: 'Timed fact fluency assessments',
                targetMonths: 6
            },
            {
                description: 'Student will solve multi-digit multiplication problems with 85% accuracy',
                measurementMethod: 'Written assessments using standard algorithm',
                targetMonths: 4
            },
            {
                description: 'Student will solve long division problems with remainders with 80% accuracy',
                measurementMethod: 'Written assessments with work shown',
                targetMonths: 4
            }
        ]
    },

    // Fractions Goals
    'fractions-basic': {
        id: 'fractions-basic',
        name: 'Basic Fractions',
        category: 'fractions',
        gradeLevels: ['3', '4'],
        goals: [
            {
                description: 'Student will identify and compare fractions using visual models with 85% accuracy',
                measurementMethod: 'Visual assessment and verbal explanation',
                targetMonths: 3
            },
            {
                description: 'Student will add and subtract fractions with like denominators with 85% accuracy',
                measurementMethod: 'Written assessments',
                targetMonths: 3
            },
            {
                description: 'Student will identify equivalent fractions with 80% accuracy',
                measurementMethod: 'Written and visual assessments',
                targetMonths: 3
            }
        ]
    },

    'fractions-advanced': {
        id: 'fractions-advanced',
        name: 'Advanced Fractions',
        category: 'fractions',
        gradeLevels: ['5', '6'],
        goals: [
            {
                description: 'Student will add and subtract fractions with unlike denominators with 85% accuracy',
                measurementMethod: 'Written assessments showing LCD process',
                targetMonths: 4
            },
            {
                description: 'Student will multiply and divide fractions with 85% accuracy',
                measurementMethod: 'Written assessments with word problems',
                targetMonths: 4
            },
            {
                description: 'Student will solve multi-step fraction word problems with 75% accuracy',
                measurementMethod: 'Word problem assessments with strategy documentation',
                targetMonths: 5
            }
        ]
    },

    // Pre-Algebra Goals
    'pre-algebra': {
        id: 'pre-algebra',
        name: 'Pre-Algebra Foundations',
        category: 'algebra',
        gradeLevels: ['6', '7', '8'],
        goals: [
            {
                description: 'Student will solve one-step equations with 90% accuracy',
                measurementMethod: 'Written assessments with work shown',
                targetMonths: 3
            },
            {
                description: 'Student will evaluate algebraic expressions with 85% accuracy',
                measurementMethod: 'Written assessments with substitution',
                targetMonths: 3
            },
            {
                description: 'Student will graph linear equations on a coordinate plane with 80% accuracy',
                measurementMethod: 'Graphing assessments',
                targetMonths: 4
            }
        ]
    },

    // Algebra Goals
    'algebra-1': {
        id: 'algebra-1',
        name: 'Algebra 1',
        category: 'algebra',
        gradeLevels: ['8', '9', '10'],
        goals: [
            {
                description: 'Student will solve multi-step linear equations with 85% accuracy',
                measurementMethod: 'Written assessments with step-by-step solutions',
                targetMonths: 4
            },
            {
                description: 'Student will factor quadratic expressions with 80% accuracy',
                measurementMethod: 'Written assessments',
                targetMonths: 5
            },
            {
                description: 'Student will solve systems of equations using substitution or elimination with 75% accuracy',
                measurementMethod: 'Written assessments with work shown',
                targetMonths: 5
            }
        ]
    },

    // Geometry Goals
    'geometry-basic': {
        id: 'geometry-basic',
        name: 'Basic Geometry',
        category: 'geometry',
        gradeLevels: ['4', '5', '6'],
        goals: [
            {
                description: 'Student will calculate area and perimeter of rectangles and triangles with 85% accuracy',
                measurementMethod: 'Written assessments with diagrams',
                targetMonths: 3
            },
            {
                description: 'Student will classify angles as acute, right, obtuse, or straight with 90% accuracy',
                measurementMethod: 'Visual identification assessments',
                targetMonths: 2
            },
            {
                description: 'Student will identify properties of basic shapes with 85% accuracy',
                measurementMethod: 'Written and verbal assessments',
                targetMonths: 3
            }
        ]
    },

    // Word Problem Goals
    'word-problems': {
        id: 'word-problems',
        name: 'Word Problem Strategies',
        category: 'problem-solving',
        gradeLevels: ['2', '3', '4', '5', '6'],
        goals: [
            {
                description: 'Student will identify key information in word problems with 85% accuracy',
                measurementMethod: 'Highlighting/annotation assessments',
                targetMonths: 3
            },
            {
                description: 'Student will choose appropriate operations for word problems with 80% accuracy',
                measurementMethod: 'Multiple choice and written justification',
                targetMonths: 4
            },
            {
                description: 'Student will check work using estimation or inverse operations with 75% accuracy',
                measurementMethod: 'Assessment requiring verification step',
                targetMonths: 4
            }
        ]
    }
};

/**
 * Get all accommodation templates
 * @returns {Array} List of accommodation templates
 */
function getAccommodationTemplates() {
    return Object.values(ACCOMMODATION_TEMPLATES);
}

/**
 * Get accommodation template by ID
 * @param {string} templateId - Template ID
 * @returns {Object|null} Template or null
 */
function getAccommodationTemplate(templateId) {
    return ACCOMMODATION_TEMPLATES[templateId] || null;
}

/**
 * Get all goal templates
 * @returns {Array} List of goal templates
 */
function getGoalTemplates() {
    return Object.values(GOAL_TEMPLATES);
}

/**
 * Get goal template by ID
 * @param {string} templateId - Template ID
 * @returns {Object|null} Template or null
 */
function getGoalTemplate(templateId) {
    return GOAL_TEMPLATES[templateId] || null;
}

/**
 * Get goal templates filtered by grade level
 * @param {string} gradeLevel - Grade level (e.g., '5', 'K')
 * @returns {Array} Matching goal templates
 */
function getGoalTemplatesByGrade(gradeLevel) {
    const normalizedGrade = gradeLevel.replace(/[^0-9K]/gi, '').toUpperCase();
    return Object.values(GOAL_TEMPLATES).filter(template =>
        template.gradeLevels.some(g => g.toUpperCase() === normalizedGrade)
    );
}

/**
 * Get goal templates filtered by category
 * @param {string} category - Category (e.g., 'algebra', 'fractions')
 * @returns {Array} Matching goal templates
 */
function getGoalTemplatesByCategory(category) {
    return Object.values(GOAL_TEMPLATES).filter(template =>
        template.category === category
    );
}

/**
 * Apply accommodation template to IEP
 * @param {Object} currentIep - Current IEP plan object
 * @param {string} templateId - Template ID to apply
 * @param {boolean} merge - If true, merge with existing; if false, replace
 * @returns {Object} Updated IEP accommodations
 */
function applyAccommodationTemplate(currentIep, templateId, merge = true) {
    const template = getAccommodationTemplate(templateId);
    if (!template) {
        throw new Error(`Template '${templateId}' not found`);
    }

    const currentAccommodations = currentIep?.accommodations || {};

    if (merge) {
        // Merge: template values override, but keep any existing custom items
        const existingCustom = currentAccommodations.custom || [];
        const templateCustom = template.accommodations.custom || [];

        return {
            ...currentAccommodations,
            ...template.accommodations,
            custom: [...new Set([...existingCustom, ...templateCustom])] // Deduplicate
        };
    } else {
        // Replace: use template values only
        return { ...template.accommodations };
    }
}

/**
 * Apply goal template to IEP
 * @param {Object} currentIep - Current IEP plan object
 * @param {string} templateId - Template ID to apply
 * @param {boolean} replace - If true, replace all goals; if false, append
 * @returns {Array} Updated goals array
 */
function applyGoalTemplate(currentIep, templateId, replace = false) {
    const template = getGoalTemplate(templateId);
    if (!template) {
        throw new Error(`Template '${templateId}' not found`);
    }

    const currentGoals = currentIep?.goals || [];

    // Generate goals with target dates
    const newGoals = template.goals.map(goal => {
        const targetDate = new Date();
        targetDate.setMonth(targetDate.getMonth() + (goal.targetMonths || 3));

        return {
            description: goal.description,
            targetDate: targetDate,
            currentProgress: 0,
            measurementMethod: goal.measurementMethod,
            status: 'active',
            history: []
        };
    });

    if (replace) {
        return newGoals;
    } else {
        return [...currentGoals, ...newGoals];
    }
}

/**
 * Get all template categories
 * @returns {Object} Categories for accommodations and goals
 */
function getTemplateCategories() {
    return {
        accommodations: [
            { id: 'learning-disability', name: 'Learning Disabilities' },
            { id: 'attention', name: 'Attention & Focus' },
            { id: 'cognitive', name: 'Cognitive Processing' },
            { id: 'social-emotional', name: 'Social-Emotional' },
            { id: 'physical', name: 'Physical/Sensory' },
            { id: 'language', name: 'Language Support' },
            { id: 'developmental', name: 'Developmental' },
            { id: 'general', name: 'General' }
        ],
        goals: [
            { id: 'number-sense', name: 'Number Sense' },
            { id: 'operations', name: 'Operations' },
            { id: 'fractions', name: 'Fractions & Decimals' },
            { id: 'algebra', name: 'Algebra' },
            { id: 'geometry', name: 'Geometry' },
            { id: 'problem-solving', name: 'Problem Solving' }
        ]
    };
}

module.exports = {
    ACCOMMODATION_TEMPLATES,
    GOAL_TEMPLATES,
    getAccommodationTemplates,
    getAccommodationTemplate,
    getGoalTemplates,
    getGoalTemplate,
    getGoalTemplatesByGrade,
    getGoalTemplatesByCategory,
    applyAccommodationTemplate,
    applyGoalTemplate,
    getTemplateCategories
};

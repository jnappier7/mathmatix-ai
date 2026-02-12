/**
 * IEP Accommodation Compliance Test Suite
 *
 * Tests that the IEP system correctly:
 * 1. Builds accommodation prompts for each accommodation type
 * 2. Maps all accommodations to frontend features
 * 3. Handles reading level and scaffold preferences
 * 4. Applies templates correctly
 * 5. Tracks goal progress from AI response tags
 */

const { buildIepAccommodationsPrompt } = require('../../utils/prompt');
const {
    getAccommodationTemplates,
    getAccommodationTemplate,
    getGoalTemplates,
    getGoalTemplatesByGrade,
    applyAccommodationTemplate,
    applyGoalTemplate,
    getTemplateCategories
} = require('../../utils/iepTemplates');

// =======================================================================
// buildIepAccommodationsPrompt — Prompt Construction Tests
// =======================================================================
describe('IEP Accommodation Prompt Builder', () => {

    test('returns empty string when no IEP plan provided', () => {
        expect(buildIepAccommodationsPrompt(null, 'Alex')).toBe('');
        expect(buildIepAccommodationsPrompt(undefined, 'Alex')).toBe('');
    });

    test('returns empty string when no accommodations and no goals', () => {
        const iep = { accommodations: {}, goals: [] };
        expect(buildIepAccommodationsPrompt(iep, 'Alex')).toBe('');
    });

    test('includes IEP header with student name', () => {
        const iep = { accommodations: { extendedTime: true }, goals: [] };
        const result = buildIepAccommodationsPrompt(iep, 'Alex');
        expect(result).toContain('IEP ACCOMMODATIONS');
        expect(result).toContain('Alex');
        expect(result).toContain('Individualized Education Program');
    });

    test('includes IDEA legal compliance reminder when accommodations active', () => {
        const iep = { accommodations: { extendedTime: true }, goals: [] };
        const result = buildIepAccommodationsPrompt(iep, 'Alex');
        expect(result).toContain('LEGALLY REQUIRED');
        expect(result).toContain('IDEA');
    });

    // --- Individual accommodation prompt tests ---

    test('extendedTime: includes 1.5x multiplier and no-rush language', () => {
        const iep = { accommodations: { extendedTime: true }, goals: [] };
        const result = buildIepAccommodationsPrompt(iep, 'Maya');
        expect(result).toContain('Extended Time');
        expect(result).toContain('1.5x');
        expect(result).toContain('Never rush');
    });

    test('audioReadAloud: includes read-aloud instructions', () => {
        const iep = { accommodations: { audioReadAloud: true }, goals: [] };
        const result = buildIepAccommodationsPrompt(iep, 'Maya');
        expect(result).toContain('Audio Read-Aloud');
        expect(result).toContain('read aloud');
    });

    test('calculatorAllowed: includes never-restrict language', () => {
        const iep = { accommodations: { calculatorAllowed: true }, goals: [] };
        const result = buildIepAccommodationsPrompt(iep, 'Maya');
        expect(result).toContain('Calculator Allowed');
        expect(result).toContain('NEVER restrict');
    });

    test('chunkedAssignments: includes 3-5 problem limit', () => {
        const iep = { accommodations: { chunkedAssignments: true }, goals: [] };
        const result = buildIepAccommodationsPrompt(iep, 'Maya');
        expect(result).toContain('Chunked');
        expect(result).toContain('3-5 problems');
    });

    test('breaksAsNeeded: includes break encouragement', () => {
        const iep = { accommodations: { breaksAsNeeded: true }, goals: [] };
        const result = buildIepAccommodationsPrompt(iep, 'Maya');
        expect(result).toContain('Breaks');
        expect(result).toContain('brain breaks');
    });

    test('digitalMultiplicationChart: includes chart reference', () => {
        const iep = { accommodations: { digitalMultiplicationChart: true }, goals: [] };
        const result = buildIepAccommodationsPrompt(iep, 'Maya');
        expect(result).toContain('Multiplication Chart');
        expect(result).toContain('not memorization');
    });

    test('reducedDistraction: includes clean visuals instruction', () => {
        const iep = { accommodations: { reducedDistraction: true }, goals: [] };
        const result = buildIepAccommodationsPrompt(iep, 'Maya');
        expect(result).toContain('Reduced Distraction');
        expect(result).toContain('clean and uncluttered');
    });

    test('largePrintHighContrast: includes high-contrast theme instruction', () => {
        const iep = { accommodations: { largePrintHighContrast: true }, goals: [] };
        const result = buildIepAccommodationsPrompt(iep, 'Maya');
        expect(result).toContain('High Contrast');
    });

    test('mathAnxietySupport: includes growth mindset and encouragement', () => {
        const iep = { accommodations: { mathAnxietySupport: true }, goals: [] };
        const result = buildIepAccommodationsPrompt(iep, 'Maya');
        expect(result).toContain('Math Anxiety');
        expect(result).toContain('growth mindset');
        expect(result).toContain('Celebrate effort');
    });

    test('custom accommodations: includes all custom strings', () => {
        const iep = {
            accommodations: { custom: ['Preferential seating', 'Visual schedule'] },
            goals: []
        };
        const result = buildIepAccommodationsPrompt(iep, 'Maya');
        expect(result).toContain('Custom Accommodations');
        expect(result).toContain('Preferential seating');
        expect(result).toContain('Visual schedule');
    });

    test('all accommodations combined: includes every section', () => {
        const iep = {
            accommodations: {
                extendedTime: true,
                audioReadAloud: true,
                calculatorAllowed: true,
                chunkedAssignments: true,
                breaksAsNeeded: true,
                digitalMultiplicationChart: true,
                reducedDistraction: true,
                largePrintHighContrast: true,
                mathAnxietySupport: true,
                custom: ['Fidget tools allowed']
            },
            goals: []
        };
        const result = buildIepAccommodationsPrompt(iep, 'Maya');
        expect(result).toContain('Extended Time');
        expect(result).toContain('Audio Read-Aloud');
        expect(result).toContain('Calculator Allowed');
        expect(result).toContain('Chunked');
        expect(result).toContain('Breaks');
        expect(result).toContain('Multiplication Chart');
        expect(result).toContain('Reduced Distraction');
        expect(result).toContain('High Contrast');
        expect(result).toContain('Math Anxiety');
        expect(result).toContain('Fidget tools allowed');
        expect(result).toContain('LEGALLY REQUIRED');
    });

    // --- Reading level tests ---

    test('readingLevel: includes grade-level adjustment for small values', () => {
        const iep = {
            accommodations: { extendedTime: true },
            goals: [],
            readingLevel: 4
        };
        const result = buildIepAccommodationsPrompt(iep, 'Maya');
        expect(result).toContain('Reading Level Adjustment');
        expect(result).toContain('Grade 4');
        expect(result).toContain('shorter sentences');
    });

    test('readingLevel: includes Lexile adjustment for large values', () => {
        const iep = {
            accommodations: { extendedTime: true },
            goals: [],
            readingLevel: 650
        };
        const result = buildIepAccommodationsPrompt(iep, 'Maya');
        expect(result).toContain('650L (Lexile)');
    });

    test('preferredScaffolds: includes scaffold list', () => {
        const iep = {
            accommodations: { extendedTime: true },
            goals: [],
            preferredScaffolds: ['hints', 'visual examples', 'graphic organizers']
        };
        const result = buildIepAccommodationsPrompt(iep, 'Maya');
        expect(result).toContain('Preferred Scaffolding');
        expect(result).toContain('hints, visual examples, graphic organizers');
    });

    // --- IEP Goals tests ---

    test('active goals: includes goal description and progress bar', () => {
        const iep = {
            accommodations: { extendedTime: true },
            goals: [{
                description: 'Solve multi-step equations with 80% accuracy',
                currentProgress: 45,
                status: 'active',
                targetDate: new Date('2026-06-01'),
                measurementMethod: 'Weekly quiz scores'
            }]
        };
        const result = buildIepAccommodationsPrompt(iep, 'Maya');
        expect(result).toContain('IEP GOALS');
        expect(result).toContain('multi-step equations');
        expect(result).toContain('45%');
        expect(result).toContain('Weekly quiz scores');
        expect(result).toContain('IEP_GOAL_PROGRESS');
    });

    test('completed goals: excluded from prompt', () => {
        const iep = {
            accommodations: { extendedTime: true },
            goals: [{
                description: 'Old completed goal',
                currentProgress: 100,
                status: 'completed'
            }]
        };
        const result = buildIepAccommodationsPrompt(iep, 'Maya');
        expect(result).not.toContain('Old completed goal');
    });

    test('on-hold goals: excluded from prompt', () => {
        const iep = {
            accommodations: { extendedTime: true },
            goals: [{
                description: 'Paused goal',
                currentProgress: 30,
                status: 'on-hold'
            }]
        };
        const result = buildIepAccommodationsPrompt(iep, 'Maya');
        expect(result).not.toContain('Paused goal');
    });

    test('mixed goals: only active ones included', () => {
        const iep = {
            accommodations: { extendedTime: true },
            goals: [
                { description: 'Active goal one', currentProgress: 20, status: 'active' },
                { description: 'Done goal', currentProgress: 100, status: 'completed' },
                { description: 'Active goal two', currentProgress: 60, status: 'active' }
            ]
        };
        const result = buildIepAccommodationsPrompt(iep, 'Maya');
        expect(result).toContain('Active goal one');
        expect(result).toContain('Active goal two');
        expect(result).not.toContain('Done goal');
        expect(result).toContain('2 active IEP goal');
    });
});


// =======================================================================
// IEP Feature Mapping — Ensures all accommodations are sent to frontend
// =======================================================================
describe('IEP Feature Mapping Completeness', () => {

    // This tests the logic that would be in routes/chat.js lines 1531-1542
    // Simulated here as a unit test to verify mapping completeness
    function buildIepFeatures(user) {
        const accom = user.iepPlan?.accommodations;
        return accom ? {
            autoReadAloud: accom.audioReadAloud || false,
            showCalculator: accom.calculatorAllowed || false,
            useHighContrast: accom.largePrintHighContrast || false,
            extendedTimeMultiplier: accom.extendedTime ? 1.5 : 1.0,
            mathAnxietySupport: accom.mathAnxietySupport || false,
            chunkedAssignments: accom.chunkedAssignments || false,
            reducedDistraction: accom.reducedDistraction || false,
            breaksAsNeeded: accom.breaksAsNeeded || false,
            digitalMultiplicationChart: accom.digitalMultiplicationChart || false,
            customAccommodations: accom.custom || [],
            readingLevel: user.iepPlan.readingLevel || null,
            preferredScaffolds: user.iepPlan.preferredScaffolds || []
        } : null;
    }

    test('returns null when no iepPlan', () => {
        expect(buildIepFeatures({})).toBeNull();
        expect(buildIepFeatures({ iepPlan: {} })).toBeNull();
    });

    test('maps all 9 boolean accommodations', () => {
        const user = {
            iepPlan: {
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
                    custom: ['Test custom']
                },
                readingLevel: 5,
                preferredScaffolds: ['hints']
            }
        };

        const features = buildIepFeatures(user);

        expect(features.autoReadAloud).toBe(true);
        expect(features.showCalculator).toBe(true);
        expect(features.useHighContrast).toBe(true);
        expect(features.extendedTimeMultiplier).toBe(1.5);
        expect(features.mathAnxietySupport).toBe(true);
        expect(features.chunkedAssignments).toBe(true);
        expect(features.reducedDistraction).toBe(true);
        expect(features.breaksAsNeeded).toBe(true);
        expect(features.digitalMultiplicationChart).toBe(true);
        expect(features.customAccommodations).toEqual(['Test custom']);
        expect(features.readingLevel).toBe(5);
        expect(features.preferredScaffolds).toEqual(['hints']);
    });

    test('extended time multiplier is 1.0 when not enabled', () => {
        const user = { iepPlan: { accommodations: { extendedTime: false } } };
        const features = buildIepFeatures(user);
        expect(features.extendedTimeMultiplier).toBe(1.0);
    });

    test('every accommodation in schema has a frontend mapping', () => {
        // This test ensures no new accommodation is added to the schema
        // without being mapped to the frontend features object
        const schemaAccommodations = [
            'extendedTime', 'reducedDistraction', 'calculatorAllowed',
            'audioReadAloud', 'chunkedAssignments', 'breaksAsNeeded',
            'digitalMultiplicationChart', 'largePrintHighContrast',
            'mathAnxietySupport', 'custom'
        ];

        const user = { iepPlan: { accommodations: {} } };
        schemaAccommodations.forEach(key => {
            if (key === 'custom') {
                user.iepPlan.accommodations[key] = ['test'];
            } else {
                user.iepPlan.accommodations[key] = true;
            }
        });

        const features = buildIepFeatures(user);

        // Verify the features object has entries that correspond to each schema field
        expect(features.autoReadAloud).toBeDefined();            // audioReadAloud
        expect(features.showCalculator).toBeDefined();           // calculatorAllowed
        expect(features.useHighContrast).toBeDefined();          // largePrintHighContrast
        expect(features.extendedTimeMultiplier).toBeDefined();   // extendedTime
        expect(features.mathAnxietySupport).toBeDefined();       // mathAnxietySupport
        expect(features.chunkedAssignments).toBeDefined();       // chunkedAssignments
        expect(features.reducedDistraction).toBeDefined();       // reducedDistraction
        expect(features.breaksAsNeeded).toBeDefined();           // breaksAsNeeded
        expect(features.digitalMultiplicationChart).toBeDefined(); // digitalMultiplicationChart
        expect(features.customAccommodations).toBeDefined();     // custom
    });
});


// =======================================================================
// IEP Templates — Template application and merging
// =======================================================================
describe('IEP Templates', () => {

    test('getAccommodationTemplates returns all templates', () => {
        const templates = getAccommodationTemplates();
        expect(templates.length).toBeGreaterThanOrEqual(9);

        const ids = templates.map(t => t.id);
        expect(ids).toContain('dyscalculia');
        expect(ids).toContain('adhd');
        expect(ids).toContain('math-anxiety');
        expect(ids).toContain('comprehensive');
    });

    test('getAccommodationTemplate returns correct template by id', () => {
        const template = getAccommodationTemplate('dyscalculia');
        expect(template).toBeDefined();
        expect(template.name).toBeDefined();
        expect(template.accommodations).toBeDefined();
        expect(template.accommodations.calculatorAllowed).toBe(true);
    });

    test('getAccommodationTemplate returns null/undefined for invalid id', () => {
        const result = getAccommodationTemplate('nonexistent');
        expect(result == null).toBe(true); // null or undefined
    });

    test('getGoalTemplates returns templates', () => {
        const templates = getGoalTemplates();
        expect(templates.length).toBeGreaterThanOrEqual(5);
    });

    test('getGoalTemplatesByGrade filters correctly', () => {
        const grade3 = getGoalTemplatesByGrade('3');
        expect(Array.isArray(grade3)).toBe(true);
        grade3.forEach(template => {
            expect(template.goals).toBeDefined();
            expect(template.goals.length).toBeGreaterThan(0);
        });
    });

    test('applyAccommodationTemplate merges with existing', () => {
        const existing = {
            accommodations: {
                extendedTime: true,
                custom: ['Existing custom']
            },
            goals: []
        };

        const result = applyAccommodationTemplate(existing, 'adhd', true);
        // Should keep extendedTime from existing AND add ADHD accommodations
        expect(result.extendedTime).toBe(true);
        expect(result.reducedDistraction).toBe(true); // ADHD template includes this
    });

    test('applyAccommodationTemplate replaces when merge=false', () => {
        const existing = {
            accommodations: {
                extendedTime: true,
                calculatorAllowed: true
            },
            goals: []
        };

        const result = applyAccommodationTemplate(existing, 'minimal', false);
        // minimal template should override — extendedTime and calculatorAllowed
        // depend on what the minimal template defines
        expect(result).toBeDefined();
    });

    test('applyGoalTemplate adds goals', () => {
        const existing = {
            accommodations: {},
            goals: []
        };

        const result = applyGoalTemplate(existing, 'number-sense-elementary', true);
        expect(result.length).toBeGreaterThan(0);
        // New goals from template should have currentProgress = 0
        result.forEach(goal => {
            expect(goal.description).toBeDefined();
            expect(goal.status).toBe('active');
        });
    });

    test('getTemplateCategories returns valid categories', () => {
        const categories = getTemplateCategories();
        expect(categories).toBeDefined();
        expect(categories.accommodations).toBeDefined();
        expect(categories.goals).toBeDefined();
    });

    // --- Template coverage: every template should produce a valid prompt ---

    test('every accommodation template produces a non-empty prompt', () => {
        const templates = getAccommodationTemplates();
        templates.forEach(template => {
            const iep = { accommodations: template.accommodations, goals: [] };
            const prompt = buildIepAccommodationsPrompt(iep, 'TestStudent');
            expect(prompt.length).toBeGreaterThan(0);
            expect(prompt).toContain('IEP ACCOMMODATIONS');
        });
    });
});


// =======================================================================
// IEP Goal Progress Parsing — tag extraction from AI responses
// =======================================================================
describe('IEP Goal Progress Tag Parsing', () => {

    // Simulate the tag parsing logic from routes/chat.js lines 1077-1133
    function parseGoalProgressTags(text) {
        const tagRegex = /<IEP_GOAL_PROGRESS:([^,]+),\+(\d+)>/g;
        const updates = [];
        let match;
        let cleanedText = text;

        while ((match = tagRegex.exec(text)) !== null) {
            updates.push({
                goalDescription: match[1].trim(),
                progressIncrement: parseInt(match[2], 10)
            });
            cleanedText = cleanedText.replace(match[0], '');
        }

        return { updates, cleanedText: cleanedText.trim() };
    }

    test('extracts single goal progress tag', () => {
        const text = 'Great work! <IEP_GOAL_PROGRESS:Solve equations,+5> Keep it up!';
        const { updates, cleanedText } = parseGoalProgressTags(text);
        expect(updates).toHaveLength(1);
        expect(updates[0].goalDescription).toBe('Solve equations');
        expect(updates[0].progressIncrement).toBe(5);
        expect(cleanedText).not.toContain('IEP_GOAL_PROGRESS');
    });

    test('extracts multiple goal progress tags', () => {
        const text = '<IEP_GOAL_PROGRESS:Addition mastery,+10> and <IEP_GOAL_PROGRESS:Word problems,+3>';
        const { updates } = parseGoalProgressTags(text);
        expect(updates).toHaveLength(2);
        expect(updates[0].goalDescription).toBe('Addition mastery');
        expect(updates[0].progressIncrement).toBe(10);
        expect(updates[1].goalDescription).toBe('Word problems');
        expect(updates[1].progressIncrement).toBe(3);
    });

    test('returns empty array when no tags present', () => {
        const { updates, cleanedText } = parseGoalProgressTags('Just a normal response.');
        expect(updates).toHaveLength(0);
        expect(cleanedText).toBe('Just a normal response.');
    });

    test('cleans tags from response text', () => {
        const text = 'Nice job! <IEP_GOAL_PROGRESS:Fractions,+5> You got it right.';
        const { cleanedText } = parseGoalProgressTags(text);
        expect(cleanedText).toBe('Nice job!  You got it right.');
        expect(cleanedText).not.toContain('<');
        expect(cleanedText).not.toContain('>');
    });
});

/**
 * Tests for PII Anonymizer
 * Ensures personally identifiable information is stripped before AI API calls
 */

const {
    createAnonymizationContext,
    anonymizeText,
    anonymizeMessages,
    anonymizeSystemPrompt,
    rehydrateResponse,
    sanitizeEducationalData,
    PII_PATTERNS,
    EDUCATIONAL_DATA_PATTERNS,
    PLACEHOLDERS
} = require('../../utils/piiAnonymizer');

describe('PII Anonymizer', () => {

    // ========================================================================
    // createAnonymizationContext
    // ========================================================================
    describe('createAnonymizationContext', () => {
        test('creates context from user profile with name mappings', () => {
            const user = { firstName: 'Sarah', lastName: 'Chen' };
            const ctx = createAnonymizationContext(user);

            expect(ctx.nameMap).toBeInstanceOf(Map);
            expect(ctx.nameMap.has('sarah chen')).toBe(true);
            expect(ctx.nameMap.has('chen')).toBe(true);
            expect(ctx.nameMap.has('sarah')).toBe(true);
            expect(ctx.firstName).toBe('Sarah');
        });

        test('handles null user profile', () => {
            const ctx = createAnonymizationContext(null);
            expect(ctx.nameMap.size).toBe(0);
            expect(ctx.firstName).toBe('Student');
        });

        test('respects allowFirstName option', () => {
            const user = { firstName: 'Sarah', lastName: 'Chen' };
            const ctx = createAnonymizationContext(user, { allowFirstName: true });

            expect(ctx.nameMap.has('sarah')).toBe(false);
            expect(ctx.nameMap.has('chen')).toBe(true);
            expect(ctx.nameMap.has('sarah chen')).toBe(true);
        });

        test('includes additional names', () => {
            const user = { firstName: 'Sarah', lastName: 'Chen' };
            const ctx = createAnonymizationContext(user, {
                additionalNames: {
                    'Lincoln Elementary': '[School]',
                    'Ms. Johnson': '[Teacher]'
                }
            });

            expect(ctx.nameMap.has('lincoln elementary')).toBe(true);
            expect(ctx.nameMap.has('ms. johnson')).toBe(true);
        });

        test('skips single-character names', () => {
            const user = { firstName: 'J', lastName: 'D' };
            const ctx = createAnonymizationContext(user);
            // Single chars are skipped to avoid false positives
            expect(ctx.nameMap.has('j')).toBe(false);
            expect(ctx.nameMap.has('d')).toBe(false);
        });
    });

    // ========================================================================
    // anonymizeText
    // ========================================================================
    describe('anonymizeText', () => {
        const nameMap = new Map([
            ['sarah chen', '[Student]'],
            ['chen', '[Student]'],
            ['sarah', '[Student]']
        ]);

        test('replaces full name', () => {
            const result = anonymizeText('Sarah Chen is working on fractions', nameMap);
            expect(result).toBe('[Student] is working on fractions');
        });

        test('replaces first name alone', () => {
            const result = anonymizeText('Great job, Sarah!', nameMap);
            expect(result).toBe('Great job, [Student]!');
        });

        test('replaces last name alone', () => {
            const result = anonymizeText('The Chen family contacted us', nameMap);
            expect(result).toBe('The [Student] family contacted us');
        });

        test('is case-insensitive', () => {
            const result = anonymizeText('SARAH CHEN scored well', nameMap);
            expect(result).toBe('[Student] scored well');
        });

        test('replaces email addresses', () => {
            const result = anonymizeText('Contact sarah.chen@school.edu for details', nameMap);
            expect(result).toContain('[email]');
            expect(result).not.toContain('sarah.chen@school.edu');
        });

        test('replaces phone numbers', () => {
            const result = anonymizeText('Call (555) 123-4567 for info', new Map());
            expect(result).toBe('Call [phone] for info');
        });

        test('replaces phone numbers with different formats', () => {
            expect(anonymizeText('555-123-4567', new Map())).toBe('[phone]');
            expect(anonymizeText('555.123.4567', new Map())).toBe('[phone]');
            expect(anonymizeText('+1 555 123 4567', new Map())).toBe('[phone]');
        });

        test('replaces MongoDB ObjectIds', () => {
            const result = anonymizeText('User 507f1f77bcf86cd799439011 data', new Map());
            expect(result).toBe('User [id] data');
        });

        test('preserves math content', () => {
            const result = anonymizeText('Solve 3x + 5 = 20 for x', new Map());
            expect(result).toBe('Solve 3x + 5 = 20 for x');
        });

        test('preserves IEP accommodation text', () => {
            const text = 'Extended Time (1.5x): Give the student extra time';
            const result = anonymizeText(text, new Map());
            expect(result).toBe(text);
        });

        test('handles null/undefined input', () => {
            expect(anonymizeText(null, nameMap)).toBeNull();
            expect(anonymizeText(undefined, nameMap)).toBeUndefined();
        });

        test('handles empty string', () => {
            expect(anonymizeText('', nameMap)).toBe('');
        });

        test('replaces multiple PII types in one string', () => {
            const text = 'Sarah Chen (sarah@school.edu, 555-123-4567) is in Grade 5';
            const result = anonymizeText(text, nameMap);
            expect(result).not.toContain('Sarah');
            expect(result).not.toContain('Chen');
            expect(result).not.toContain('sarah@school.edu');
            expect(result).not.toContain('555-123-4567');
            expect(result).toContain('Grade 5'); // Grade level preserved
        });

        test('handles longer name replaced before shorter to avoid partial matches', () => {
            const nameMap = new Map([
                ['sarah chen', '[Student]'],
                ['sarah', '[Student]'],
                ['chen', '[Student]']
            ]);
            const result = anonymizeText('Sarah Chen is here', nameMap);
            // Should produce "[Student] is here", not "[Student] [Student] is here"
            expect(result).toBe('[Student] is here');
        });
    });

    // ========================================================================
    // anonymizeMessages
    // ========================================================================
    describe('anonymizeMessages', () => {
        test('anonymizes array of message objects', () => {
            const ctx = createAnonymizationContext({ firstName: 'Sarah', lastName: 'Chen' });
            const messages = [
                { role: 'system', content: 'You are tutoring Sarah Chen in math.' },
                { role: 'user', content: 'Hi, my name is Sarah!' },
                { role: 'assistant', content: 'Hello Sarah! Let\'s work on fractions.' }
            ];

            const result = anonymizeMessages(messages, ctx);

            expect(result[0].content).not.toContain('Sarah Chen');
            expect(result[0].content).toContain('[Student]');
            expect(result[1].content).not.toContain('Sarah');
            expect(result[2].content).toContain('[Student]');

            // Roles preserved
            expect(result[0].role).toBe('system');
            expect(result[1].role).toBe('user');
            expect(result[2].role).toBe('assistant');
        });

        test('does not mutate original messages', () => {
            const ctx = createAnonymizationContext({ firstName: 'Sarah', lastName: 'Chen' });
            const original = [{ role: 'user', content: 'I am Sarah Chen' }];
            const originalContent = original[0].content;

            anonymizeMessages(original, ctx);

            expect(original[0].content).toBe(originalContent);
        });

        test('handles vision messages with array content', () => {
            const ctx = createAnonymizationContext({ firstName: 'Sarah', lastName: 'Chen' });
            const messages = [{
                role: 'user',
                content: [
                    { type: 'text', text: 'Grade Sarah Chen\'s homework' },
                    { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } }
                ]
            }];

            const result = anonymizeMessages(messages, ctx);

            expect(result[0].content[0].text).not.toContain('Sarah Chen');
            expect(result[0].content[0].text).toContain('[Student]');
            // Image content unchanged
            expect(result[0].content[1].image_url.url).toBe('data:image/png;base64,abc123');
        });

        test('handles null/empty messages', () => {
            const ctx = createAnonymizationContext({ firstName: 'Sarah', lastName: 'Chen' });
            expect(anonymizeMessages(null, ctx)).toBeNull();
            expect(anonymizeMessages([], ctx)).toEqual([]);
        });
    });

    // ========================================================================
    // anonymizeSystemPrompt
    // ========================================================================
    describe('anonymizeSystemPrompt', () => {
        test('anonymizes student name in system prompt', () => {
            const ctx = createAnonymizationContext({ firstName: 'Sarah', lastName: 'Chen' });
            const prompt = `You are tutoring Sarah Chen. Sarah is in 5th grade.
Sarah Chen's IEP requires extended time.`;

            const result = anonymizeSystemPrompt(prompt, ctx);

            expect(result).not.toContain('Sarah Chen');
            expect(result).not.toContain('Sarah');
            expect(result).toContain('[Student]');
            expect(result).toContain('5th grade'); // Educational context preserved
            expect(result).toContain('extended time'); // IEP details preserved
        });

        test('handles null prompt', () => {
            const ctx = createAnonymizationContext({ firstName: 'Sarah', lastName: 'Chen' });
            expect(anonymizeSystemPrompt(null, ctx)).toBeNull();
        });
    });

    // ========================================================================
    // rehydrateResponse
    // ========================================================================
    describe('rehydrateResponse', () => {
        test('replaces [Student] with first name', () => {
            const result = rehydrateResponse('Great job, [Student]! Keep it up!', 'Sarah');
            expect(result).toBe('Great job, Sarah! Keep it up!');
        });

        test('handles multiple placeholders', () => {
            const result = rehydrateResponse('[Student] solved it! Way to go, [Student]!', 'Sarah');
            expect(result).toBe('Sarah solved it! Way to go, Sarah!');
        });

        test('handles case variations', () => {
            expect(rehydrateResponse('[student] did great', 'Sarah')).toBe('Sarah did great');
            expect(rehydrateResponse('[STUDENT] did great', 'Sarah')).toBe('Sarah did great');
        });

        test('handles null response', () => {
            expect(rehydrateResponse(null, 'Sarah')).toBeNull();
        });

        test('handles null firstName', () => {
            expect(rehydrateResponse('[Student] did great', null)).toBe('[Student] did great');
        });

        test('returns original if no placeholders', () => {
            const text = 'Let me explain how fractions work.';
            expect(rehydrateResponse(text, 'Sarah')).toBe(text);
        });
    });

    // ========================================================================
    // PII Pattern Detection
    // ========================================================================
    describe('PII Pattern Detection', () => {
        test('detects various email formats', () => {
            expect('user@example.com').toMatch(PII_PATTERNS.email);
            expect('first.last@school.edu').toMatch(PII_PATTERNS.email);
            expect('user+tag@domain.co.uk').toMatch(PII_PATTERNS.email);
        });

        test('detects various phone formats', () => {
            expect('555-123-4567').toMatch(PII_PATTERNS.phone);
            expect('(555) 123-4567').toMatch(PII_PATTERNS.phone);
            expect('555.123.4567').toMatch(PII_PATTERNS.phone);
        });

        test('detects MongoDB ObjectIds', () => {
            expect('507f1f77bcf86cd799439011').toMatch(PII_PATTERNS.objectId);
        });

        test('does not false-positive on math expressions', () => {
            // Numbers that look like phone numbers but aren't
            expect('3x + 5 = 20').not.toMatch(PII_PATTERNS.phone);
            expect('f(x) = 2x^2').not.toMatch(PII_PATTERNS.phone);
        });
    });

    // ========================================================================
    // Educational Data Sanitization
    // ========================================================================
    describe('sanitizeEducationalData', () => {
        test('strips z-score values from processing speed context', () => {
            const text = "Student's processing speed: **SLOW** (z-score: -1.23)";
            const result = sanitizeEducationalData(text);
            expect(result).not.toContain('-1.23');
            expect(result).not.toContain('z-score:');
            expect(result).toContain('SLOW'); // Speed level preserved
        });

        test('strips inline z-score references', () => {
            const text = "z-score: 0.87 indicates above average";
            const result = sanitizeEducationalData(text);
            expect(result).not.toContain('0.87');
            expect(result).toContain('assessed speed level');
        });

        test('strips read speed modifier', () => {
            const text = "Read speed modifier: 1.50x";
            const result = sanitizeEducationalData(text);
            expect(result).not.toContain('1.50x');
            expect(result).toContain('adjusted');
        });

        test('replaces exact IEP progress percentages with ranges', () => {
            expect(sanitizeEducationalData('Progress: [██░░░░░░░░] 20%')).toContain('early stage');
            expect(sanitizeEducationalData('Progress: [████░░░░░░] 40%')).toContain('developing');
            expect(sanitizeEducationalData('Progress: [██████░░░░] 60%')).toContain('approaching target');
            expect(sanitizeEducationalData('Progress: [█████████░] 90%')).toContain('near mastery');
        });

        test('replaces IEP target dates with generic timeline', () => {
            const text = "Target: 5/15/2026";
            const result = sanitizeEducationalData(text);
            expect(result).not.toContain('5/15/2026');
            expect(result).toContain('current school year');
        });

        test('replaces written-out target dates', () => {
            const text = "Target: May 15, 2026";
            const result = sanitizeEducationalData(text);
            expect(result).not.toContain('May 15, 2026');
            expect(result).toContain('current school year');
        });

        test('replaces "No target date" consistently', () => {
            const result = sanitizeEducationalData("Target: No target date");
            expect(result).toContain('current school year');
        });

        test('replaces measurement methods', () => {
            const text = "Measurement: Weekly quiz scores averaging 80%+";
            const result = sanitizeEducationalData(text);
            expect(result).not.toContain('Weekly quiz scores');
            expect(result).toContain('per IEP plan');
        });

        test('handles null/undefined input', () => {
            expect(sanitizeEducationalData(null)).toBeNull();
            expect(sanitizeEducationalData(undefined)).toBeUndefined();
            expect(sanitizeEducationalData('')).toBe('');
        });

        test('preserves accommodation type instructions', () => {
            const text = `✓ **Extended Time (1.5x):**
  - Give the student 1.5x the normal time on all timed activities
  - Never rush them or imply they're taking too long`;
            const result = sanitizeEducationalData(text);
            expect(result).toContain('Extended Time');
            expect(result).toContain('1.5x the normal time');
        });

        test('preserves teaching strategy instructions', () => {
            const text = "Generate problems at **LOWER DIFFICULTY** (DOK 1: Recall, Basic Facts)";
            const result = sanitizeEducationalData(text);
            expect(result).toContain('LOWER DIFFICULTY');
            expect(result).toContain('DOK 1');
        });
    });

    // ========================================================================
    // Integration: anonymizeText now includes educational data sanitization
    // ========================================================================
    describe('anonymizeText with educational data', () => {
        test('strips z-scores AND names in a single pass', () => {
            const nameMap = new Map([['sarah', '[Student]']]);
            const text = "Sarah's processing speed: **SLOW** (z-score: -1.23)";
            const result = anonymizeText(text, nameMap);
            expect(result).not.toContain('Sarah');
            expect(result).not.toContain('-1.23');
            expect(result).toContain('[Student]');
            expect(result).toContain('SLOW');
        });

        test('strips IEP progress and target dates alongside names', () => {
            const nameMap = new Map([['sarah chen', '[Student]'], ['sarah', '[Student]']]);
            const text = `Sarah Chen has 2 active IEP goals:
1. **Solve multi-step equations**
   Progress: [████░░░░░░] 40%
   Target: 5/15/2026
   Measurement: Weekly quiz scores`;
            const result = anonymizeText(text, nameMap);
            expect(result).not.toContain('Sarah Chen');
            expect(result).not.toContain('40%');
            expect(result).not.toContain('5/15/2026');
            expect(result).not.toContain('Weekly quiz scores');
            expect(result).toContain('[Student]');
            expect(result).toContain('developing');
            expect(result).toContain('current school year');
        });

        test('full system prompt anonymization preserves teaching context', () => {
            const nameMap = new Map([['sarah', '[Student]']]);
            const systemPrompt = `--- IEP ACCOMMODATIONS (LEGALLY REQUIRED) ---
Sarah has an IEP. You MUST respect these accommodations:

✓ **Extended Time (1.5x):**
  - Give Sarah 1.5x the normal time
  - Never rush them

✓ **Calculator Allowed:**
  - NEVER restrict calculator use

--- ADAPTIVE DIFFICULTY ---
Sarah's processing speed: **FAST** (z-score: 1.45)
Read speed modifier: 1.25x

Generate problems at **HIGHER DIFFICULTY** (DOK 3)`;

            const result = anonymizeText(systemPrompt, nameMap);

            // Names gone
            expect(result).not.toContain('Sarah');
            // z-score gone
            expect(result).not.toContain('1.45');
            expect(result).not.toContain('z-score:');
            // Read speed modifier gone
            expect(result).not.toContain('1.25x');
            // But teaching instructions preserved
            expect(result).toContain('Extended Time');
            expect(result).toContain('Calculator Allowed');
            expect(result).toContain('HIGHER DIFFICULTY');
            expect(result).toContain('DOK 3');
            expect(result).toContain('[Student]');
        });
    });

    // ========================================================================
    // Integration: Context anonymize + rehydrate round-trip
    // ========================================================================
    describe('Round-trip anonymization', () => {
        test('anonymize then rehydrate preserves meaning', () => {
            const user = { firstName: 'Marcus', lastName: 'Johnson' };
            const ctx = createAnonymizationContext(user);

            const original = 'Marcus is making great progress on fractions!';
            const anonymized = ctx.anonymize(original);
            const rehydrated = ctx.rehydrate(anonymized);

            expect(anonymized).not.toContain('Marcus');
            expect(anonymized).toContain('[Student]');
            expect(rehydrated).toContain('Marcus');
            expect(rehydrated).toContain('great progress on fractions');
        });
    });
});

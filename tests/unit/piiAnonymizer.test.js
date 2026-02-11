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
    PII_PATTERNS,
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

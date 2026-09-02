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
    createStreamRehydrator,
    isProtectedName,
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

// ============================================================================
// Anonymizing without corrupting the maths
// ============================================================================
//
// Substitution is a blind whole-word find-and-replace over free text. Knowing
// the student is called Ray does not tell you which occurrences of "ray" mean
// him — so before this guard, "draw a ray from point A" became "draw a
// [Student] from point A" in the tutor's own teaching text, and a ten-digit
// product was hidden from the model that had to grade it.
//
// The existing math-safety tests above pass an EMPTY name map and check
// `3x + 5 = 20`, so they never exercised any of this.
describe('anonymization vs. mathematical content', () => {
    const ctxFor = (firstName, lastName) =>
        createAnonymizationContext({ firstName, lastName });

    describe('names that are also math vocabulary', () => {
        test.each([
            ['Ray', 'Patel', 'Draw a ray from point A through point B.'],
            ['Mark', 'Chen', 'Mark the point on the number line.'],
            ['Max', 'Owusu', 'Find the max of f(x) on the interval.'],
            ['Sum', 'Nguyen', 'The sum of the interior angles is 180 degrees.'],
            ['Grace', 'Lin', 'Round to the nearest degree.']
        ])('%s %s: the bare name is left alone in teaching text', (first, last, text) => {
            expect(anonymizeText(text, ctxFor(first, last).nameMap)).toBe(text);
        });

        test('the full name is still stripped even when the first name is protected', () => {
            // "Ray Patel" is unambiguous in a way "ray" is not.
            const result = anonymizeText('Ray Patel solved it.', ctxFor('Ray', 'Patel').nameMap);
            expect(result).toBe('[Student] solved it.');
        });

        test('a protected surname does not disable stripping of the given name', () => {
            const result = anonymizeText('Priya asked a question.', ctxFor('Priya', 'Ray').nameMap);
            expect(result).toBe('[Student] asked a question.');
        });

        test('a non-colliding name is still stripped on its own', () => {
            const result = anonymizeText('Zoe asked a question.', ctxFor('Zoe', 'Quill').nameMap);
            expect(result).toBe('[Student] asked a question.');
        });

        test('isProtectedName is case- and whitespace-insensitive', () => {
            expect(isProtectedName(' RAY ')).toBe(true);
            expect(isProtectedName('Zoe')).toBe(false);
        });
    });

    describe('numeric answers that resemble identifiers', () => {
        const plain = createAnonymizationContext(null).nameMap;

        test('a bare ten-digit product is not mistaken for a phone number', () => {
            expect(anonymizeText('The product is 1234567890.', plain))
                .toBe('The product is 1234567890.');
        });

        test('a bare nine-digit answer is not mistaken for an SSN', () => {
            expect(anonymizeText('The answer is 123456789.', plain))
                .toBe('The answer is 123456789.');
        });

        test.each([
            '(555) 123-4567',
            '555-123-4567',
            '+1 555.123.4567'
        ])('a genuinely formatted phone number is still stripped: %s', (phone) => {
            expect(anonymizeText(`Call ${phone} today.`, plain)).toContain('[phone]');
        });

        test('a genuinely formatted SSN is still stripped', () => {
            expect(anonymizeText('SSN 123-45-6789 on file.', plain)).toContain('[redacted]');
        });

        test('email addresses and ObjectIds are untouched by the loosening', () => {
            const result = anonymizeText('ray@school.org id 507f1f77bcf86cd799439011', plain);
            expect(result).toContain('[email]');
            expect(result).toContain('[id]');
        });
    });
});

// ============================================================================
// Rehydration
// ============================================================================
describe('rehydrateResponse — every placeholder we insert', () => {
    test('restores parent, teacher and school, not just student', () => {
        // Restoring only [Student] is how a parent-facing reply could reach the
        // parent reading "Hi [Parent],".
        const result = rehydrateResponse(
            'Hi [Parent], [Student] did well. Ask [Teacher] at [School].',
            { student: 'Ana', parent: 'Elena', teacher: 'Mr Diaz', school: 'Lincoln Middle' }
        );
        expect(result).toBe('Hi Elena, Ana did well. Ask Mr Diaz at Lincoln Middle.');
    });

    test('still accepts a bare first name (back-compat with existing callers)', () => {
        expect(rehydrateResponse('Nice work [Student]!', 'Ana')).toBe('Nice work Ana!');
    });

    test('leaves a placeholder alone when no value is supplied for it', () => {
        expect(rehydrateResponse('Hi [Parent], [Student]!', { student: 'Ana' }))
            .toBe('Hi [Parent], Ana!');
    });
});

describe('createStreamRehydrator — placeholders split across chunks', () => {
    const drain = (chunks, names) => {
        const r = createStreamRehydrator(names);
        return chunks.map((c) => r.push(c)).join('') + r.flush();
    };

    test('reassembles a placeholder broken over two chunks', () => {
        // The failure this exists for: rehydrating each chunk alone misses it
        // and "[Student]" reaches the reader verbatim.
        expect(drain(['Great work [Stu', 'dent]! Nice.'], 'Ana')).toBe('Great work Ana! Nice.');
    });

    test('reassembles a placeholder broken one character at a time', () => {
        expect(drain('Hi [Student]!'.split(''), 'Ana')).toBe('Hi Ana!');
    });

    test('passes through text with no placeholders unchanged', () => {
        expect(drain(['Solve 3x + 5 ', '= 20 for x'], 'Ana')).toBe('Solve 3x + 5 = 20 for x');
    });

    test('does not hold a bracket that cannot be a placeholder', () => {
        // An interval like [0, 12] must not be buffered to the end of the stream.
        expect(drain(['The domain is [0, 12] here.'], 'Ana')).toBe('The domain is [0, 12] here.');
    });

    test('flush emits an unterminated bracket rather than swallowing it', () => {
        expect(drain(['All done ['], 'Ana')).toBe('All done [');
    });

    test('handles a placeholder arriving whole', () => {
        expect(drain(['Hi [Student]', ' and welcome'], 'Ana')).toBe('Hi Ana and welcome');
    });
});

describe('createRosterAnonymizationContext — a prompt about a whole class', () => {
    const { createRosterAnonymizationContext } = require('../../utils/piiAnonymizer');
    const roster = [
        { firstName: 'Maya', lastName: 'Chen' },
        { firstName: 'Jordan', lastName: 'Okafor' },
        { firstName: 'Grace', lastName: 'Lee' } // "grace" is protected vocabulary
    ];

    test('each student gets a distinct numbered label', () => {
        const ctx = createRosterAnonymizationContext(roster);
        expect(ctx.roster.map((r) => r.placeholder)).toEqual(['[Student 1]', '[Student 2]', '[Student 3]']);
        expect(ctx.anonymize('Group Maya Chen with Jordan. Okafor is ahead.'))
            .toBe('Group [Student 1] with [Student 2]. [Student 2] is ahead.');
    });

    test('rehydrates each label to the right first name, case-insensitively', () => {
        const ctx = createRosterAnonymizationContext(roster);
        expect(ctx.rehydrate('Pair **[Student 1]** with [student 2]; [Student 3] leads.'))
            .toBe('Pair **Maya** with Jordan; Grace leads.');
    });

    test('a label the roster does not know is left alone rather than guessed', () => {
        const ctx = createRosterAnonymizationContext(roster);
        expect(ctx.rehydrate('See [Student 9].')).toBe('See [Student 9].');
    });

    test('a protected first name is skipped by the regex and reported, full name still caught', () => {
        const ctx = createRosterAnonymizationContext(roster);
        expect(ctx.skipped).toContain('Grace');
        expect(ctx.anonymize('Grace Lee and Lee')).toBe('[Student 3] and [Student 3]');
        // Callers render the roster line from ctx.roster[i].placeholder for exactly this case.
    });

    test('caller-supplied names and fixed placeholders round-trip too', () => {
        const ctx = createRosterAnonymizationContext(roster, {
            additionalNames: { 'Dana Rivera': '[Teacher]' },
            names: { teacher: 'Dana' }
        });
        expect(ctx.anonymize('Ask Dana Rivera')).toBe('Ask [Teacher]');
        expect(ctx.rehydrate('[Teacher] should pair [Student 2]')).toBe('Dana should pair Jordan');
    });

    test('stream rehydrator reassembles labels split across chunks, including two-digit ones', () => {
        const big = Array.from({ length: 12 }, (_, i) => ({ firstName: `Kid${i + 1}`, lastName: 'X' }));
        const ctx = createRosterAnonymizationContext(big);
        const r = ctx.createStreamRehydrator();
        const out = ['Start [Stu', 'dent 12], then [Student', ' 1]. Domain [0, 12].'].map((c) => r.push(c)).join('') + r.flush();
        expect(out).toBe('Start Kid12, then Kid1. Domain [0, 12].');
    });

    test('an empty roster is a no-op context', () => {
        const ctx = createRosterAnonymizationContext([]);
        expect(ctx.anonymize('Nothing to hide')).toBe('Nothing to hide');
        expect(ctx.rehydrate('[Student 1]')).toBe('[Student 1]');
    });
});

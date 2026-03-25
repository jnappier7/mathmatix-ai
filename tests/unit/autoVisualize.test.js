const { autoVisualizeByTopic } = require('../../utils/visualCommandEnforcer');

describe('autoVisualizeByTopic', () => {
    // ── Skip when visual already present ──
    it('should NOT inject if response already contains a visual command', () => {
        const msg = 'what is the pythagorean theorem?';
        const resp = 'The Pythagorean theorem states a² + b² = c².\n\n[PYTHAGOREAN:a=3,b=4]';
        expect(autoVisualizeByTopic(msg, resp)).toBe(resp);
    });

    // ── Pythagorean theorem ──
    it('should inject PYTHAGOREAN for "what is the pythagorean theorem"', () => {
        const result = autoVisualizeByTopic(
            'what is the pythagorean theorem?',
            'The Pythagorean theorem states that a² + b² = c².'
        );
        expect(result).toContain('[PYTHAGOREAN:');
        expect(result).toContain('proof=true');
    });

    it('should extract side lengths for Pythagorean when mentioned', () => {
        const result = autoVisualizeByTopic(
            'pythagorean theorem with sides 5 and 12',
            'Let me show you.'
        );
        expect(result).toContain('a=5,b=12');
    });

    // ── Unit circle ──
    it('should inject UNIT_CIRCLE for "explain the unit circle"', () => {
        const result = autoVisualizeByTopic(
            'explain the unit circle',
            'The unit circle is a circle with radius 1 centered at the origin.'
        );
        expect(result).toContain('[UNIT_CIRCLE:');
    });

    // ── Trig functions ──
    it('should inject FUNCTION_GRAPH + UNIT_CIRCLE for trig function questions', () => {
        const result = autoVisualizeByTopic(
            'what are trig functions?',
            'Trigonometric functions relate angles to side ratios.'
        );
        expect(result).toContain('[FUNCTION_GRAPH:');
        expect(result).toContain('[UNIT_CIRCLE:');
    });

    it('should use cos(x) when cosine is mentioned', () => {
        const result = autoVisualizeByTopic(
            'explain the cosine function',
            'The cosine function gives the x-coordinate on the unit circle.'
        );
        expect(result).toContain('fn=cos(x)');
    });

    it('should use tan(x) when tangent is mentioned', () => {
        const result = autoVisualizeByTopic(
            'what is the tangent function?',
            'Tangent is sin/cos.'
        );
        expect(result).toContain('fn=tan(x)');
    });

    // ── Quadratic / Parabola ──
    it('should inject SLIDER_GRAPH for quadratic questions', () => {
        const result = autoVisualizeByTopic(
            'what is a quadratic function?',
            'A quadratic function has the form y = ax² + bx + c.'
        );
        expect(result).toContain('[SLIDER_GRAPH:');
        expect(result).toContain('a*x^2');
    });

    it('should detect "parabola"', () => {
        const result = autoVisualizeByTopic(
            'what does a parabola look like?',
            'A parabola is a U-shaped curve.'
        );
        expect(result).toContain('[SLIDER_GRAPH:');
    });

    // ── Slope / Linear ──
    it('should inject SLIDER_GRAPH for slope-intercept form', () => {
        const result = autoVisualizeByTopic(
            'what is slope intercept form?',
            'Slope-intercept form is y = mx + b.'
        );
        expect(result).toContain('[SLIDER_GRAPH:');
        expect(result).toContain('m*x+b');
    });

    it('should detect "rise over run"', () => {
        const result = autoVisualizeByTopic(
            'what is rise over run?',
            'Rise over run describes the slope of a line.'
        );
        expect(result).toContain('[SLIDER_GRAPH:');
    });

    // ── Angle types ──
    it('should inject ANGLE for "what is an acute angle"', () => {
        const result = autoVisualizeByTopic(
            'what is an acute angle?',
            'An acute angle is less than 90 degrees.'
        );
        expect(result).toContain('[ANGLE:');
    });

    it('should use 120 degrees for obtuse angle', () => {
        const result = autoVisualizeByTopic(
            'what is an obtuse angle?',
            'An obtuse angle is between 90 and 180 degrees.'
        );
        expect(result).toContain('degrees=120');
    });

    // ── Fractions ──
    it('should inject FRACTION for "what are fractions"', () => {
        const result = autoVisualizeByTopic(
            'what are fractions?',
            'A fraction represents a part of a whole.'
        );
        expect(result).toContain('[FRACTION:');
    });

    it('should extract fraction from message', () => {
        const result = autoVisualizeByTopic(
            'explain fractions using 2/5',
            'Let me explain fractions.'
        );
        expect(result).toContain('numerator=2');
        expect(result).toContain('denominator=5');
    });

    // ── Inequality ──
    it('should inject INEQUALITY for inequality questions', () => {
        const result = autoVisualizeByTopic(
            'how do I graph an inequality?',
            'To graph an inequality, first solve for the variable.'
        );
        expect(result).toContain('[INEQUALITY:');
    });

    it('should extract specific inequality expression', () => {
        const result = autoVisualizeByTopic(
            'solve x > 7',
            'The solution is x > 7.'
        );
        expect(result).toContain('x>7');
    });

    // ── Area model ──
    it('should inject AREA_MODEL for area model questions', () => {
        const result = autoVisualizeByTopic(
            'what is the area model for multiplication?',
            'The area model breaks numbers into parts.'
        );
        expect(result).toContain('[AREA_MODEL:');
    });

    it('should extract numbers for area model', () => {
        const result = autoVisualizeByTopic(
            'use area model for 23 x 15',
            'Let me show you.'
        );
        expect(result).toContain('a=23,b=15');
    });

    // ── No false positives ──
    it('should NOT inject visuals for generic math questions', () => {
        const msg = 'what is 2 + 2?';
        const resp = '2 + 2 = 4.';
        expect(autoVisualizeByTopic(msg, resp)).toBe(resp);
    });

    it('should NOT inject visuals for word problems', () => {
        const msg = 'If Sally has 5 apples and gives away 2, how many does she have?';
        const resp = 'Sally has 3 apples left.';
        expect(autoVisualizeByTopic(msg, resp)).toBe(resp);
    });

    it('should NOT inject visuals for simple arithmetic', () => {
        const msg = 'help me multiply 6 times 7';
        const resp = '6 × 7 = 42.';
        expect(autoVisualizeByTopic(msg, resp)).toBe(resp);
    });

    // ── First-match-wins ──
    it('should match most specific topic first (unit circle before trig)', () => {
        const result = autoVisualizeByTopic(
            'show me the unit circle with trig functions',
            'The unit circle shows all trig function values.'
        );
        // Unit circle comes before trig in the topic list, so it should match
        expect(result).toContain('[UNIT_CIRCLE:');
        // Should NOT also have FUNCTION_GRAPH from trig topic
        expect(result).not.toContain('[FUNCTION_GRAPH:');
    });
});

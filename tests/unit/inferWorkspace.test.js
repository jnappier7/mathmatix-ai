/**
 * inferWorkspace — defensive board-event inference.
 *
 * The whole point of this module is to be CONSERVATIVE. A false
 * positive (board updates with wrong info) destroys trust in the
 * surface; a false negative just means the LLM-driven path was
 * the only one that could've handled it. Tests bias toward
 * suppression cases.
 */

const {
  inferBoardEvents,
  _detectStudentMath,
  _detectAffirmation,
} = require('../../utils/pipeline/inferWorkspace');

describe('inferWorkspace', () => {
  describe('_detectStudentMath', () => {
    test('catches a bare solution declaration', () => {
      expect(_detectStudentMath('x = 8')).toEqual({ kind: 'solution', tex: 'x = 8' });
    });

    test('catches a solution embedded in prose', () => {
      const r = _detectStudentMath('I got x = 8');
      expect(r).toMatchObject({ kind: 'solution' });
      expect(r.tex).toContain('x = 8');
    });

    test('rejects solution-shaped question ("is x = 8?")', () => {
      expect(_detectStudentMath('is x = 8?')).toBeNull();
    });

    test('rejects a hedged solution guess ("maybe x = 8")', () => {
      expect(_detectStudentMath('maybe x = 8')).toBeNull();
    });

    test('rejects an interrogative ("what if x = 8")', () => {
      expect(_detectStudentMath('what if x = 8')).toBeNull();
    });

    test('catches an intermediate equation (coefficient × var = number)', () => {
      // "2x = 16" is an equation, not a bare-solution declaration —
      // the bare-solution regex requires a single-letter LHS.
      const r = _detectStudentMath('2x = 16');
      expect(r).toMatchObject({ kind: 'equation' });
      expect(r.tex).toContain('2x');
      expect(r.tex).toContain('16');
    });

    test('catches a verification (numeric on both sides)', () => {
      const r = _detectStudentMath('2(8) + 4 = 20');
      expect(r).toMatchObject({ kind: 'verification' });
    });

    test('does NOT match a trivial numeric "5 = 5"', () => {
      // No operators on LHS — too low-confidence to fire.
      expect(_detectStudentMath('5 = 5')).toBeNull();
    });

    test('catches "subtract 4 from both sides"', () => {
      const r = _detectStudentMath('subtract 4 from both sides');
      expect(r).toEqual({ kind: 'apply', op: 'subtract 4 from both sides' });
    });

    test('catches "divide both sides by 2"', () => {
      const r = _detectStudentMath('divide both sides by 2');
      expect(r.kind).toBe('apply');
    });

    test('catches "add 5 to both sides"', () => {
      const r = _detectStudentMath('add 5 to both sides');
      expect(r.kind).toBe('apply');
    });

    test('ignores empty / null / huge inputs', () => {
      expect(_detectStudentMath('')).toBeNull();
      expect(_detectStudentMath(null)).toBeNull();
      expect(_detectStudentMath('x'.repeat(700))).toBeNull();
    });

    test('ignores pure prose', () => {
      expect(_detectStudentMath('I have no idea what to do')).toBeNull();
      expect(_detectStudentMath('Can you explain that again?')).toBeNull();
    });
  });

  describe('_detectAffirmation', () => {
    test('catches "yes!" with punctuation', () => {
      expect(_detectAffirmation('yes! that is correct.')).toBe(true);
    });

    test('catches "exactly"', () => {
      expect(_detectAffirmation('exactly — what is the next step?')).toBe(true);
    });

    test('catches "you got it"', () => {
      expect(_detectAffirmation("You got it! Let's keep going.")).toBe(true);
    });

    test('catches "that\'s right"', () => {
      expect(_detectAffirmation("That's right. What's next?")).toBe(true);
    });

    test('catches "nice work" and "great job"', () => {
      expect(_detectAffirmation('Nice work on that step!')).toBe(true);
      expect(_detectAffirmation('Great job catching that.')).toBe(true);
    });

    test('catches "Clean Solution!"', () => {
      expect(_detectAffirmation('Woohoo! Clean Solution!')).toBe(true);
    });

    test('rejects vague "okay"', () => {
      expect(_detectAffirmation('okay, what next?')).toBe(false);
    });

    test('rejects "good" without a strong companion word', () => {
      // "good" alone is too weak — many false positives ("good
      // question", "good try but…").
      expect(_detectAffirmation('good — keep thinking')).toBe(false);
    });

    test('VETOED by "not quite" even with positive words present', () => {
      expect(_detectAffirmation('Nice try! Not quite, though.')).toBe(false);
    });

    test('VETOED by "almost"', () => {
      expect(_detectAffirmation("That's almost right.")).toBe(false);
    });

    test('VETOED by "let me show"', () => {
      expect(_detectAffirmation('Yes, but let me show you another way.')).toBe(false);
    });

    test('VETOED by "good attempt"', () => {
      expect(_detectAffirmation('Good attempt! Try once more.')).toBe(false);
    });

    test('VETOED by an interrogative redirect ("what if…")', () => {
      expect(_detectAffirmation('Right — but what if we tried subtracting first?')).toBe(false);
    });

    test('VETOED by "hmm"', () => {
      expect(_detectAffirmation('Hmm, exactly... wait, double check that.')).toBe(false);
    });

    test('rejects empty / null', () => {
      expect(_detectAffirmation('')).toBe(false);
      expect(_detectAffirmation(null)).toBe(false);
    });
  });

  describe('inferBoardEvents — integration', () => {
    test('no inference when LLM already emitted workspace events', () => {
      const events = inferBoardEvents(
        'x = 8',
        "Yes! That's exactly right.",
        { workspaceCount: 1 } // Layer 1/2 already worked
      );
      expect(events).toEqual([]);
    });

    test('no inference when student message has no math', () => {
      const events = inferBoardEvents(
        'I have no idea',
        'No worries, let me help.',
        { workspaceCount: 0 }
      );
      expect(events).toEqual([]);
    });

    test('no inference when tutor did not affirm', () => {
      const events = inferBoardEvents(
        'x = 8',
        'Hmm, are you sure?',
        { workspaceCount: 0 }
      );
      expect(events).toEqual([]);
    });

    test('no inference when tutor affirmed BUT used a negation signal', () => {
      const events = inferBoardEvents(
        'x = 8',
        "Nice work, but not quite — try once more.",
        { workspaceCount: 0 }
      );
      expect(events).toEqual([]);
    });

    test('infers a resolve event when student declares a solution and tutor affirms', () => {
      const events = inferBoardEvents(
        'x = 8',
        "Yes! That's exactly right!",
        { workspaceCount: 0 }
      );
      expect(events).toEqual([
        { tag: 'board', attrs: { action: 'resolve', tex: 'x = 8' } },
      ]);
    });

    test('infers an apply event from a transformation phrase + affirmation', () => {
      const events = inferBoardEvents(
        'subtract 4 from both sides',
        "Exactly! What's left?",
        { workspaceCount: 0 }
      );
      expect(events).toHaveLength(1);
      expect(events[0].attrs.action).toBe('apply');
      expect(events[0].attrs.op).toMatch(/subtract 4 from both sides/i);
    });

    test('infers a resolve from an intermediate equation ("2x = 16")', () => {
      const events = inferBoardEvents(
        '2x = 16',
        "Yes! Now what's the last step?",
        { workspaceCount: 0 }
      );
      expect(events).toHaveLength(1);
      expect(events[0].attrs.action).toBe('resolve');
    });

    test('verification-shape student message: no event emitted (deferred to context-aware inference)', () => {
      // Phase E or B.5.1 will wire context-aware verify; for now we
      // skip rather than emit a verify without grounding.
      const events = inferBoardEvents(
        '2(8) + 4 = 20',
        "Woohoo! Clean Solution!",
        { workspaceCount: 0 }
      );
      expect(events).toEqual([]);
    });

    test('respects gate-1 even with both signals present', () => {
      // Both signals say "fire" but Layer 1/2 already did the job.
      const events = inferBoardEvents(
        'x = 8',
        "Yes! Exactly right!",
        { workspaceCount: 2 }
      );
      expect(events).toEqual([]);
    });
  });

  describe('inferBoardEvents — false-positive bias', () => {
    // A battery of "looks like math + tutor is positive" scenarios
    // where inference SHOULD NOT fire because of subtle context.

    test('"good attempt" suppresses even with a solution + apparent positive', () => {
      const events = inferBoardEvents(
        'x = 8',
        'Good attempt! Try again.',
        { workspaceCount: 0 }
      );
      expect(events).toEqual([]);
    });

    test('student is asking, not declaring: "is x = 5?"', () => {
      const events = inferBoardEvents(
        'is x = 5?',
        "Yes, that's right!",
        { workspaceCount: 0 }
      );
      expect(events).toEqual([]);
    });

    test('hedged guess "maybe x = 5"', () => {
      const events = inferBoardEvents(
        'maybe x = 5',
        "Yes, exactly!",
        { workspaceCount: 0 }
      );
      expect(events).toEqual([]);
    });

    test('tutor says "Yes, that\'s the GOAL" — not affirming a step', () => {
      // "Yes" is present but the rest of the sentence is about the
      // strategy, not the student's claim. Our heuristic accepts
      // "yes" + punctuation — this is a known limitation; document
      // it. The downside (rare false-positive) is mitigated by
      // gate-1 (Layer 1/2 usually fire on real student steps).
      const events = inferBoardEvents(
        'x = 8',
        "Yes, that's the goal. Let me know when you get there.",
        { workspaceCount: 0 }
      );
      // This currently DOES fire — limitation documented for follow-up
      expect(events).toHaveLength(1);
    });

    test('empty student message + affirmation = no inference', () => {
      const events = inferBoardEvents(
        '',
        "Yes! Exactly!",
        { workspaceCount: 0 }
      );
      expect(events).toEqual([]);
    });
  });
});

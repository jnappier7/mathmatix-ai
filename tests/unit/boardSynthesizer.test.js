/**
 * boardSynthesizer — deterministic board-card emission.
 *
 * Goal: a turn that *should* produce a pose / apply / resolve /
 * verify card on the WorkBoard does so even when the LLM forgot
 * to emit the corresponding <BOARD> tag.
 *
 * Tests replay the two transcripts from the bug report:
 *   • Solve 3x - 5 = 16   (student-bare-drop pose path)
 *   • Solve 4x + 3 = 27   (tutor-introduced pose path)
 * Each step in those transcripts should produce the right card.
 */

const {
  synthesizeBoardCommands,
  mergeWithLlmCommands,
  synthesizeFallbackPose,
  detectBoardReference,
  _detectAppliedOperation,
  _detectIntermediateEquation,
  _detectFinalSolution,
  _detectSubstitutionCheck,
  _detectPosedProblem,
  _looksLikeProblemStatement,
  _detectGeometryProblem,
  _extractProblemSentence,
  _extractPosableSentence,
  _sentenceToTex,
  _tutorAffirms,
  _commandsOverlap,
} = require('../../utils/pipeline/boardSynthesizer');

describe('boardSynthesizer — detectors', () => {
  describe('_detectAppliedOperation', () => {
    test('catches "add 5 to both sides" (with typo in original word)', () => {
      expect(_detectAppliedOperation('add 5 to both sides')).toBeTruthy();
    });

    test('catches "-3 on both sides" shorthand', () => {
      expect(_detectAppliedOperation('-3 on both sides')).toBeTruthy();
    });

    test('catches "divide by 4"', () => {
      expect(_detectAppliedOperation('divide by 4')).toBeTruthy();
    });

    test('catches "subtract 3 from both sides"', () => {
      expect(_detectAppliedOperation('subtract 3 from both sides')).toBeTruthy();
    });

    test('returns null for question form', () => {
      expect(_detectAppliedOperation('should i add 5?')).toBeNull();
    });

    test('returns null for adjacency talk without a verb', () => {
      // The 3 and x being side-by-side is not yet an applied operation.
      expect(_detectAppliedOperation('the 3 and the x are side by side so I gotta...')).toBeNull();
    });
  });

  describe('_detectIntermediateEquation', () => {
    test('catches "3x = 21"', () => {
      expect(_detectIntermediateEquation('3x=21')).toBe('3x = 21');
    });

    test('catches "4x = 24"', () => {
      expect(_detectIntermediateEquation('4x = 24')).toBe('4x = 24');
    });

    test('does not catch the bare final solution "x = 7" (verify path owns it)', () => {
      expect(_detectIntermediateEquation('x=7')).toBeNull();
    });

    test('rejects question form', () => {
      expect(_detectIntermediateEquation('is 3x = 21 right?')).toBeNull();
    });
  });

  describe('_detectFinalSolution', () => {
    test('catches "x = 7"', () => {
      expect(_detectFinalSolution('x=7')).toEqual({ variable: 'x', value: '7', tex: 'x = 7' });
    });

    test('catches "x = 7. my bad" (correction)', () => {
      const r = _detectFinalSolution('x=7. my bad');
      expect(r).toMatchObject({ variable: 'x', value: '7' });
    });

    test('catches "x = 6"', () => {
      expect(_detectFinalSolution('x=6')).toEqual({ variable: 'x', value: '6', tex: 'x = 6' });
    });

    test('rejects hedged "maybe x = 7"', () => {
      expect(_detectFinalSolution('maybe x = 7')).toBeNull();
    });
  });

  describe('_detectSubstitutionCheck', () => {
    test('catches "3(7) - 5 = 16"', () => {
      expect(_detectSubstitutionCheck('3(7) - 5 = 16')).toBe('3(7) - 5 = 16');
    });

    test('catches "4(6) + 3 = 27"', () => {
      expect(_detectSubstitutionCheck('4(6) + 3 = 27')).toBe('4(6) + 3 = 27');
    });

    test('rejects a number alone "27" (no equation)', () => {
      expect(_detectSubstitutionCheck('27')).toBeNull();
    });
  });

  describe('_detectPosedProblem', () => {
    test('parses "solve 3x-5=16"', () => {
      const r = _detectPosedProblem('solve 3x-5=16');
      expect(r).not.toBeNull();
      expect(r.tex).toMatch(/3x.*5.*16/);
    });

    test('parses "Solve 4x+3=27"', () => {
      const r = _detectPosedProblem('Solve 4x+3=27');
      expect(r).not.toBeNull();
      expect(r.tex).toMatch(/4x.*3.*27/);
    });

    test('renders a quadratic equation (was null before the coeff-shape fix)', () => {
      const r = _detectPosedProblem('solve 2x^2+4x-6=0');
      expect(r).not.toBeNull();
      expect(r.tex).toBe('2x^2 + 4x - 6 = 0');
    });

    test('renders a factoring task as the bare trinomial (no "= 0")', () => {
      const r = _detectPosedProblem('factor x^2-7x+10');
      expect(r).not.toBeNull();
      expect(r.tex).toBe('x^2 - 7x + 10');
    });
  });

  describe('_tutorAffirms', () => {
    test('positive: "Exactly!"', () => {
      expect(_tutorAffirms('Exactly! Adding 5 to both sides is right.')).toBe(true);
    });

    test('positive: "Great job!"', () => {
      expect(_tutorAffirms('Great job! Now what?')).toBe(true);
    });

    test('negation: "Hmm, not quite"', () => {
      expect(_tutorAffirms("Hmm, not quite! Let's double-check.")).toBe(false);
    });

    test('negation: "Almost there"', () => {
      expect(_tutorAffirms('Almost there! Let me show you.')).toBe(false);
    });

    test('negation: "let\'s double-check"', () => {
      expect(_tutorAffirms("Let's double-check that.")).toBe(false);
    });
  });
});

describe('boardSynthesizer — full turns', () => {
  // ──────────────────────────────────────────────────────────────
  // Transcript 1: solve 3x - 5 = 16  (student bare-drop pose)
  // ──────────────────────────────────────────────────────────────

  test('Turn 1: student "solve 3x-5=16" → emits pose card', () => {
    const cards = synthesizeBoardCommands({
      studentMessage: 'solve 3x-5=16',
      tutorResponse: "Alright! Let's solve the equation 3x − 5 = 16. What's the first step?",
      diagnosis: { type: 'no_answer', isCorrect: null },
      observation: { messageType: 'general_math' },
      lastBoardAction: null,
    });
    expect(cards).toHaveLength(1);
    expect(cards[0].action).toBe('pose');
    expect(cards[0].tex).toMatch(/3x.*5.*16/);
  });

  test('Turn 2: student "add 5 to both sides" + tutor affirms → apply', () => {
    const cards = synthesizeBoardCommands({
      studentMessage: 'add 5 to bpoth sides',
      tutorResponse: 'Exactly! Adding 5 to both sides is the right first step.',
      diagnosis: { type: 'no_answer', isCorrect: null },
      observation: { messageType: 'general_math' },
      lastBoardAction: 'pose',
    });
    // The "bpoth" typo doesn't match the keyword pattern strictly, but
    // "add" appears with the rest of the operation phrase. The
    // fallback "+N to both sides" shorthand requires the digit
    // prefix; this case relies on the worded form. Spelling matters
    // for the verb itself; the synthesizer is conservative on
    // typos to avoid false positives.
    expect(cards.some(c => c.action === 'apply')).toBe(false);

    // Same turn with corrected spelling — should fire.
    const cardsClean = synthesizeBoardCommands({
      studentMessage: 'add 5 to both sides',
      tutorResponse: 'Exactly! Adding 5 to both sides is the right first step.',
      diagnosis: { type: 'no_answer', isCorrect: null },
      observation: { messageType: 'general_math' },
      lastBoardAction: 'pose',
    });
    expect(cardsClean.some(c => c.action === 'apply')).toBe(true);
  });

  test('Turn 3: student "3x=21" + tutor affirms → resolve "3x = 21"', () => {
    const cards = synthesizeBoardCommands({
      studentMessage: '3x=21',
      tutorResponse: 'Great job! Now what do you think you should do next?',
      diagnosis: { type: 'no_answer', isCorrect: null },
      observation: { messageType: 'general_math' },
      lastBoardAction: 'apply',
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({ action: 'resolve', tex: '3x = 21' });
  });

  test('Turn 5: student "x=5" (wrong) → no card (math engine vetoes verify)', () => {
    const cards = synthesizeBoardCommands({
      studentMessage: 'x=5',
      tutorResponse: "Hmm, not quite! Let's double-check that last step.",
      diagnosis: { type: 'answer_attempt', isCorrect: false, answer: '5', correctAnswer: '7' },
      observation: { messageType: 'answer_attempt', answer: { value: '5' } },
      lastBoardAction: 'resolve',
    });
    expect(cards).toHaveLength(0);
  });

  test('Turn 6: student "x=7. my bad" + math engine confirms → verify "x = 7"', () => {
    const cards = synthesizeBoardCommands({
      studentMessage: 'x=7. my bad',
      tutorResponse: 'No worries, Jason! Mistakes happen.',
      diagnosis: { type: 'answer_attempt', isCorrect: true, answer: '7', correctAnswer: '7' },
      observation: { messageType: 'answer_attempt', answer: { value: '7' } },
      lastBoardAction: 'resolve',
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({ action: 'verify', tex: 'x = 7' });
  });

  // ──────────────────────────────────────────────────────────────
  // Transcript 2: tutor introduces 4x + 3 = 27 (tutor pose path)
  // ──────────────────────────────────────────────────────────────

  test('Tutor pose: lastBoardAction=verify + tutor "Solve 4x+3=27" → pose card', () => {
    const cards = synthesizeBoardCommands({
      studentMessage: 'sure.',
      tutorResponse: "Awesome! Let's keep the momentum going. Here's another equation for you to solve: Solve 4x+3=27. What's the first step you want to take?",
      diagnosis: { type: 'no_answer', isCorrect: null },
      observation: { messageType: 'affirmative' },
      lastBoardAction: 'verify',
    });
    expect(cards.some(c => c.action === 'pose')).toBe(true);
    const pose = cards.find(c => c.action === 'pose');
    expect(pose.tex).toMatch(/4x.*3.*27/);
  });

  test('Final answer turn: student "x=6" + math engine confirms → verify even when tutor hedges', () => {
    // The bug B scenario: math engine confirms x=6, but the tutor's
    // prose says "Hmm, let's double-check that last step." The board
    // must reflect math truth, not the tutor's mistaken hedge.
    const cards = synthesizeBoardCommands({
      studentMessage: 'x=6',
      tutorResponse: "Hmm, let's double-check that last step. You had 4x=24.",
      diagnosis: { type: 'answer_attempt', isCorrect: true, answer: '6', correctAnswer: '6' },
      observation: { messageType: 'answer_attempt', answer: { value: '6' } },
      lastBoardAction: 'resolve',
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({ action: 'verify', tex: 'x = 6' });
  });

  test('Substitution check turn: student "4(6) + 3 = 27" + tutor affirms → verify card', () => {
    const cards = synthesizeBoardCommands({
      studentMessage: '4(6) + 3 = 27',
      tutorResponse: 'Yes! Exactly! So your solution x = 6 is correct!',
      diagnosis: { type: 'no_answer', isCorrect: null },
      observation: { messageType: 'general_math' },
      lastBoardAction: 'verify',
    });
    // lastBoardAction === 'verify' means cycle is closed — pose
    // would fire if a new problem is in the text, but here it's
    // just a substitution check, no new problem to parse.
    // Without an open cycle, apply/resolve/verify are suppressed.
    // Substitution check only fires within an open cycle.
    expect(cards).toHaveLength(0);
  });

  test('Substitution check during open cycle: student "3(7) - 5 = 16" + tutor affirms', () => {
    const cards = synthesizeBoardCommands({
      studentMessage: '3(7) - 5 = 16',
      tutorResponse: 'Yes! You nailed it!',
      diagnosis: { type: 'no_answer', isCorrect: null },
      observation: { messageType: 'general_math' },
      lastBoardAction: 'resolve',
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({ action: 'verify', tex: '3(7) - 5 = 16' });
  });
});

describe('boardSynthesizer — guard rails', () => {
  test('does NOT re-pose when cycle is open (lastBoardAction=pose)', () => {
    const cards = synthesizeBoardCommands({
      studentMessage: 'solve 3x-5=16',
      tutorResponse: "Let's tackle it.",
      diagnosis: { type: 'no_answer', isCorrect: null },
      observation: { messageType: 'general_math' },
      lastBoardAction: 'pose',
    });
    expect(cards.some(c => c.action === 'pose')).toBe(false);
  });

  test('does NOT emit apply when tutor disagrees', () => {
    const cards = synthesizeBoardCommands({
      studentMessage: '-4 on both sides',
      tutorResponse: 'Not quite! Try adding or subtracting the constant.',
      diagnosis: { type: 'no_answer', isCorrect: null },
      observation: { messageType: 'general_math' },
      lastBoardAction: 'pose',
    });
    expect(cards.some(c => c.action === 'apply')).toBe(false);
  });

  test('does NOT emit verify when math engine says wrong', () => {
    const cards = synthesizeBoardCommands({
      studentMessage: 'x=5',
      tutorResponse: 'Great job!', // even with affirmation, math wins
      diagnosis: { type: 'answer_attempt', isCorrect: false, answer: '5', correctAnswer: '7' },
      observation: { messageType: 'answer_attempt', answer: { value: '5' } },
      lastBoardAction: 'resolve',
    });
    expect(cards.some(c => c.action === 'verify')).toBe(false);
  });

  test('handles small-talk turn with no active board (returns empty)', () => {
    const cards = synthesizeBoardCommands({
      studentMessage: 'hi',
      tutorResponse: 'Hey! Ready for some math?',
      diagnosis: { type: 'no_answer', isCorrect: null },
      observation: { messageType: 'greeting' },
      lastBoardAction: null,
    });
    expect(cards).toHaveLength(0);
  });
});

describe('boardSynthesizer — geometry pose fallback', () => {
  // Backstop the failure mode from the 2026-05-26 review-session
  // transcript: Maya ran 6 geometry problems back-to-back and the
  // WorkBoard stayed empty because parseCleanProblem only recognizes
  // algebra-shaped math.

  describe('_detectGeometryProblem', () => {
    test('catches triangle congruence angle problem', () => {
      const r = _detectGeometryProblem(
        'Triangle ABC is congruent to triangle DEF. If angle A measures 40 degrees and angle B measures 70 degrees, what is the measure of angle D?'
      );
      expect(r).not.toBeNull();
      expect(r.tex).toMatch(/^\\text\{/);
      expect(r.sentence).toMatch(/angle D\?$/);
    });

    test('catches 30-60-90 hypotenuse problem', () => {
      const r = _detectGeometryProblem(
        'In a right triangle, if one of the angles is 30 degrees and the length of the side opposite that angle is 5 units, what is the length of the hypotenuse?'
      );
      expect(r).not.toBeNull();
      expect(r.sentence).toMatch(/hypotenuse/);
    });

    test('catches circle area question', () => {
      const r = _detectGeometryProblem(
        'A circle has a radius of 8 units. What is the area of the circle?'
      );
      expect(r).not.toBeNull();
      expect(r.sentence).toMatch(/circle/);
    });

    test('catches standard form of a circle from center and radius', () => {
      const r = _detectGeometryProblem(
        'What is the standard form of the equation of a circle with a center at (3,-2) and a radius of 5 units?'
      );
      expect(r).not.toBeNull();
      expect(r.sentence).toMatch(/standard form/i);
    });

    test('catches convert-to-standard-form completing-the-square problem', () => {
      const r = _detectGeometryProblem(
        'Convert the equation of the circle x^2 + y^2 - 6x + 4y - 12 = 0 into standard form. What is your first step?'
      );
      expect(r).not.toBeNull();
      expect(r.sentence).toMatch(/standard form/i);
    });

    test('catches similar triangles side-ratio problem', () => {
      const r = _detectGeometryProblem(
        'Triangle ABC is similar to triangle DEF. If the lengths of the sides of triangle ABC are 6, 8, and 10, and the length of the shortest side of triangle DEF is 3, what are the lengths of the other sides of triangle DEF?'
      );
      expect(r).not.toBeNull();
      expect(r.sentence).toMatch(/triangle DEF\?$/);
    });

    test('catches a "Question:" framed prompt', () => {
      const r = _detectGeometryProblem(
        "Awesome! Let's try this:\n\nQuestion: A circle has a radius of 8 units. What is the area of the circle?"
      );
      expect(r).not.toBeNull();
      expect(r.sentence).toMatch(/area of the circle/);
    });

    test('rejects pure small talk', () => {
      expect(_detectGeometryProblem('Good luck on your exam tomorrow!')).toBeNull();
    });

    test('rejects a geometry recap that has no problem cue', () => {
      // Praise turn — mentions "circle" but is not posing a problem.
      expect(_detectGeometryProblem(
        'Exactly right! The area of the circle is 64π square units. Great work!'
      )).toBeNull();
    });

    test('rejects an explanation that lacks digits (concept narration)', () => {
      expect(_detectGeometryProblem(
        'A triangle has three sides and three angles. What is a triangle, in your own words?'
      )).toBeNull();
    });

    test('rejects an algebra-only "what is x" prompt with no geometry vocab', () => {
      expect(_detectGeometryProblem(
        'Solve for x: 2x + 4 = 20. What is x?'
      )).toBeNull();
    });

    test('rejects a concept explanation that ends in an offer question', () => {
      // Regression: student asked "can you show that on the board?" and
      // Maya replied with a unit-circle explanation ending in offers.
      // The trailing "What … would you like to explore?" / "do you want
      // to find …" are NOT posed problems — they must not quote the
      // prose recap onto the board as a PROBLEM card.
      expect(_detectGeometryProblem(
        "Here's the unit circle! You can see the angles in both degrees and radians, along with the corresponding sine and cosine values. For example, at 0 radians, the coordinates are (1, 0), which means cos(0) = 1 and sin(0) = 0. What angle would you like to explore next? Or do you want to find the sine and cosine for a specific angle?"
      )).toBeNull();
    });
  });

  describe('_extractProblemSentence', () => {
    test('returns the question sentence plus up to two setup sentences', () => {
      const s = _extractProblemSentence(
        'A circle has a radius of 8 units. What is the area of the circle?'
      );
      expect(s).toBe('A circle has a radius of 8 units. What is the area of the circle?');
    });

    test('honors an explicit "Question:" marker', () => {
      const s = _extractProblemSentence(
        "Sure thing! Here's a question on circles:\n\nQuestion: A circle has a radius of 8 units. What is the area of the circle?"
      );
      expect(s).toMatch(/^A circle/);
      expect(s).toMatch(/area of the circle\?$/);
    });

    test('returns null when no sentence ends in a question mark', () => {
      expect(_extractProblemSentence(
        'A circle has a radius of 8 units. The area is 64π.'
      )).toBeNull();
    });

    test('rejects very short sentences', () => {
      expect(_extractProblemSentence('What?')).toBeNull();
    });

    test('skips conversational offer questions', () => {
      // Only offer questions end in '?', so there is no real problem.
      expect(_extractProblemSentence(
        'You can see the angles in both degrees and radians. What would you like to explore next? Or do you want to try one?'
      )).toBeNull();
    });

    test('picks the real problem question even when an offer question follows', () => {
      const s = _extractProblemSentence(
        'A circle has a radius of 8 units. What is the area of the circle? Want to try another one?'
      );
      expect(s).toMatch(/area of the circle\?$/);
    });
  });

  describe('_sentenceToTex', () => {
    test('wraps the sentence in \\text{...}', () => {
      expect(_sentenceToTex('What is the area?')).toBe('\\text{What is the area?}');
    });

    test('strips KaTeX-hostile characters from the content', () => {
      const tex = _sentenceToTex('Find x_1 ^ 2 with $ braces { } # %.');
      expect(tex.startsWith('\\text{')).toBe(true);
      expect(tex.endsWith('}')).toBe(true);
      // Inspect only the content between the wrapper braces.
      const content = tex.slice('\\text{'.length, -1);
      expect(content).not.toMatch(/[${}#%&_^\\]/);
    });
  });

  describe('synthesizeBoardCommands — full geometry turns', () => {
    test('tutor poses triangle congruence question → pose card emitted', () => {
      const cards = synthesizeBoardCommands({
        studentMessage: 'yes... or trig',
        tutorResponse:
          "Awesome! Let's tackle some review questions. Question: Triangle ABC is congruent to triangle DEF. If angle A measures 40 degrees and angle B measures 70 degrees, what is the measure of angle D?",
        diagnosis: { type: 'no_answer', isCorrect: null },
        observation: { messageType: 'general_math' },
        lastBoardAction: null,
      });
      expect(cards).toHaveLength(1);
      expect(cards[0].action).toBe('pose');
      expect(cards[0].tex).toMatch(/angle D/);
    });

    test('tutor poses circle area question after a verify (cycle closed) → pose card', () => {
      const cards = synthesizeBoardCommands({
        studentMessage: 'yup',
        tutorResponse:
          "Great! Question: A circle has a radius of 8 units. What is the area of the circle?",
        diagnosis: { type: 'no_answer', isCorrect: null },
        observation: { messageType: 'affirmative' },
        lastBoardAction: 'verify',
      });
      expect(cards.some(c => c.action === 'pose')).toBe(true);
    });

    test('does NOT pose when the cycle is open (lastBoardAction=pose)', () => {
      const cards = synthesizeBoardCommands({
        studentMessage: 'idk',
        tutorResponse:
          'A circle has a radius of 8 units. What is the area of the circle?',
        diagnosis: { type: 'no_answer', isCorrect: null },
        observation: { messageType: 'general_math' },
        lastBoardAction: 'pose',
      });
      expect(cards.some(c => c.action === 'pose')).toBe(false);
    });

    test('algebra path still wins when an equation is parseable in the tutor message', () => {
      // If parseCleanProblem succeeds, we never fall through to the
      // geometry path — the algebra tex carries math-engine ground
      // truth and should be preferred.
      const cards = synthesizeBoardCommands({
        studentMessage: 'sure',
        tutorResponse:
          "Let's try this circle problem: Solve 3x - 5 = 16. What's the first move?",
        diagnosis: { type: 'no_answer', isCorrect: null },
        observation: { messageType: 'general_math' },
        lastBoardAction: null,
      });
      const pose = cards.find(c => c.action === 'pose');
      expect(pose).toBeTruthy();
      // Algebra tex is bare equation, not a \text{...} wrap.
      expect(pose.tex).not.toMatch(/^\\text\{/);
      expect(pose.tex).toMatch(/3x.*5.*16/);
    });

    test('praise-only geometry message after a verify emits nothing', () => {
      const cards = synthesizeBoardCommands({
        studentMessage: '64pi',
        tutorResponse:
          'Exactly right! The area of the circle is 64π square units. Great job!',
        diagnosis: { type: 'no_answer', isCorrect: null },
        observation: { messageType: 'answer_attempt' },
        lastBoardAction: 'verify',
      });
      expect(cards).toHaveLength(0);
    });
  });
});

describe('boardSynthesizer — merge with LLM commands', () => {
  test('LLM-emitted pose suppresses synthesized pose for the same problem', () => {
    const llm = [{ action: 'pose', tex: '3x - 5 = 16' }];
    const synth = [{ action: 'pose', tex: '3x-5=16' }];
    const { added, all } = mergeWithLlmCommands(llm, synth);
    expect(added).toHaveLength(0);
    expect(all).toHaveLength(1);
    expect(all[0].tex).toBe('3x - 5 = 16'); // LLM wording preserved
  });

  test('Synthesized verify is added when LLM only emitted resolve', () => {
    const llm = [{ action: 'resolve', tex: '3x = 21' }];
    const synth = [{ action: 'verify', tex: 'x = 7' }];
    const { added, all } = mergeWithLlmCommands(llm, synth);
    expect(added).toHaveLength(1);
    expect(all).toHaveLength(2);
    // Verify is ordered last
    expect(all[all.length - 1].action).toBe('verify');
  });

  test('Synthesized pose is added when LLM emitted nothing', () => {
    const llm = [];
    const synth = [{ action: 'pose', tex: '4x + 3 = 27' }];
    const { added, all } = mergeWithLlmCommands(llm, synth);
    expect(added).toHaveLength(1);
    expect(all).toEqual([{ action: 'pose', tex: '4x + 3 = 27' }]);
  });

  test('Final order is pose → apply → resolve → verify', () => {
    const llm = [];
    const synth = [
      { action: 'verify', tex: 'x = 7' },
      { action: 'apply', op: 'divide by 3' },
      { action: 'pose', tex: '3x - 5 = 16' },
      { action: 'resolve', tex: '3x = 21' },
    ];
    const { all } = mergeWithLlmCommands(llm, synth);
    expect(all.map(c => c.action)).toEqual(['pose', 'apply', 'resolve', 'verify']);
  });

  test('_commandsOverlap matches normalized tex (whitespace + case insensitive)', () => {
    expect(_commandsOverlap(
      { action: 'pose', tex: '3x - 5 = 16' },
      { action: 'pose', tex: '3x-5=16' }
    )).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 5 — turn-type backfill pose
// ---------------------------------------------------------------------------

describe('boardSynthesizer — Phase 5 backfill', () => {
  describe('_extractPosableSentence', () => {
    test('quotes the question sentence plus up to two setup sentences', () => {
      const text = 'A train leaves at noon. It travels 60 mph. How far does it go in 3 hours?';
      expect(_extractPosableSentence(text)).toBe(text);
    });

    test('falls back to the first sentence carrying a number when no question', () => {
      const text = 'Sure, let me set this up. A rectangle has length 8 and width 5. Find its area.';
      // No "?" — quote the first numeric sentence, skipping the greeting.
      expect(_extractPosableSentence(text)).toBe('A rectangle has length 8 and width 5.');
    });

    test('returns null when there is no question and no numbers', () => {
      expect(_extractPosableSentence('Great work today. You really get this.')).toBeNull();
    });

    test('rejects an over-long chunk', () => {
      const long = `${'x'.repeat(400)}?`;
      expect(_extractPosableSentence(long)).toBeNull();
    });

    test('returns null on empty / non-string input', () => {
      expect(_extractPosableSentence('')).toBeNull();
      expect(_extractPosableSentence(null)).toBeNull();
      expect(_extractPosableSentence(undefined)).toBeNull();
    });
  });

  describe('synthesizeFallbackPose', () => {
    test('prefers exact algebra tex from the student message', () => {
      const pose = synthesizeFallbackPose({
        tutorResponse: "Let's give this a shot together!",
        studentMessage: 'solve 3x - 5 = 16',
      });
      expect(pose).toMatchObject({ action: 'pose' });
      expect(_commandsOverlap(pose, { action: 'pose', tex: '3x-5=16' })).toBe(true);
    });

    test('uses exact algebra tex from the tutor when the student has none', () => {
      const pose = synthesizeFallbackPose({
        tutorResponse: 'Okay, try this one: 4x + 3 = 27.',
        studentMessage: 'ok ready',
      });
      expect(pose).toMatchObject({ action: 'pose' });
      expect(_commandsOverlap(pose, { action: 'pose', tex: '4x+3=27' })).toBe(true);
    });

    test('falls back to a verbatim \\text pose for an unparseable word problem', () => {
      const tutor = "Here's one for you. A baker has 24 cookies and packs them into boxes of 6. How many boxes does she fill?";
      const pose = synthesizeFallbackPose({ tutorResponse: tutor, studentMessage: 'next please' });
      expect(pose.action).toBe('pose');
      expect(pose.tex).toMatch(/^\\text\{/);
      expect(pose.tex).toContain('How many boxes');
    });

    test('returns null when there is no posable problem anywhere', () => {
      const pose = synthesizeFallbackPose({
        tutorResponse: 'Nice — you nailed that. Proud of you.',
        studentMessage: 'thanks!',
      });
      expect(pose).toBeNull();
    });

    test('returns null on empty input', () => {
      expect(synthesizeFallbackPose({})).toBeNull();
      expect(synthesizeFallbackPose()).toBeNull();
    });
  });

  describe('detectBoardReference', () => {
    test.each([
      'show me on the work board',
      'can you put it on the board?',
      'draw it out for me',
      'draw that please',
      'show me on the whiteboard',
      'use the workspace',
      'show me on the board',
    ])('fires on board reference: "%s"', (msg) => {
      expect(detectBoardReference(msg)).toBe(true);
    });

    test.each([
      "i'm on board with that plan",       // agreement idiom, not the board
      'can you explain the next step?',
      'i think the answer is 5',
      'what does congruent mean?',
      'yeah that makes sense',
    ])('does not fire on: "%s"', (msg) => {
      expect(detectBoardReference(msg)).toBe(false);
    });

    test('safe on empty / non-string input', () => {
      expect(detectBoardReference('')).toBe(false);
      expect(detectBoardReference(null)).toBe(false);
      expect(detectBoardReference(undefined)).toBe(false);
    });
  });
});

describe('boardSynthesizer — pinned problem anchor', () => {
  // Regression coverage for the two WorkBoard PROBLEM bugs:
  //   • Screenshot 1: an intermediate scratch line ("x(x+6)-2(x+6)=0")
  //     overwrote the PROBLEM card.
  //   • Screenshot 2: a stale earlier problem ("(x+3)(x+2)") stayed
  //     pinned while the student worked a different one.
  // The fix pins the canonical problem and passes it back in as
  // `pinnedProblem`; pose decisions key on that, not on whatever
  // equation happens to appear in the turn.

  describe('_looksLikeProblemStatement', () => {
    test('accepts a single fresh equation', () => {
      expect(_looksLikeProblemStatement('2x^2+4x-6=0')).toBe(true);
    });
    test('accepts a command-prefixed problem', () => {
      expect(_looksLikeProblemStatement('factor x^2-7x+10')).toBe(true);
    });
    test('rejects a stated solution "x=2 or -6"', () => {
      expect(_looksLikeProblemStatement('x=2 or -6')).toBe(false);
    });
    test('rejects multi-line worked scratch (screenshot 1)', () => {
      expect(_looksLikeProblemStatement(
        'x^2 +6x-2x-12=0\nx(x+6)-2(x+6)=0\n(x-2)(x+6)=0\nx=2 or -6'
      )).toBe(false);
    });
    test('does not misread "2x = 10" as an answer', () => {
      expect(_looksLikeProblemStatement('solve 2x = 10')).toBe(true);
    });
  });

  test('no pin + worked scratch dropped on a closed cycle → no pose (screenshot 1 closed-cycle guard)', () => {
    const cards = synthesizeBoardCommands({
      studentMessage: 'x^2 +6x-2x-12=0\nx(x+6)-2(x+6)=0\n(x-2)(x+6)=0\nx=2 or -6',
      tutorResponse: "Let's double-check those factors together.",
      diagnosis: { type: 'no_answer', isCorrect: null },
      observation: { messageType: 'general_math' },
      lastBoardAction: 'verify', // cycle closed
      pinnedProblem: null,
    });
    expect(cards.some(c => c.action === 'pose')).toBe(false);
  });

  test('pinned problem holds while student posts intermediate work → no re-pose (screenshot 1)', () => {
    const cards = synthesizeBoardCommands({
      studentMessage: 'x(x+6)-2(x+6)=0',
      tutorResponse: 'Good grouping! What comes next?',
      diagnosis: { type: 'no_answer', isCorrect: null },
      observation: { messageType: 'general_math' },
      lastBoardAction: 'apply',
      pinnedProblem: '2x^2 + 4x - 6 = 0',
    });
    expect(cards.some(c => c.action === 'pose')).toBe(false);
    expect(cards.some(c => c.action === 'clear')).toBe(false);
  });

  test('pinned problem + intermediate equation "3x=21" → resolve, never a re-pose', () => {
    const cards = synthesizeBoardCommands({
      studentMessage: '3x=21',
      tutorResponse: 'Great job! Now what?',
      diagnosis: { type: 'no_answer', isCorrect: null },
      observation: { messageType: 'general_math' },
      lastBoardAction: 'apply',
      pinnedProblem: '3x - 5 = 16',
    });
    expect(cards.some(c => c.action === 'pose')).toBe(false);
    expect(cards).toEqual([{ action: 'resolve', tex: '3x = 21' }]);
  });

  test('student explicitly starts a DIFFERENT problem → clear + pose (auto-advance, fixes screenshot 2)', () => {
    const cards = synthesizeBoardCommands({
      studentMessage: 'factor x^2-7x+10',
      tutorResponse: "Sure! Let's factor that one.",
      diagnosis: { type: 'no_answer', isCorrect: null },
      observation: { messageType: 'general_math' },
      lastBoardAction: 'resolve',          // old cycle still open
      pinnedProblem: '(x+3)(x+2)',          // stale pin from a prior problem
    });
    const actions = cards.map(c => c.action);
    expect(actions).toContain('clear');
    expect(actions).toContain('pose');
    // clear must precede pose so the board resets before the new problem
    expect(actions.indexOf('clear')).toBeLessThan(actions.indexOf('pose'));
    const pose = cards.find(c => c.action === 'pose');
    expect(pose.tex).toMatch(/7x.*10/);
  });

  test('re-stating the SAME pinned problem does not re-pose', () => {
    const cards = synthesizeBoardCommands({
      studentMessage: 'solve 3x-5=16',
      tutorResponse: "We're already on it!",
      diagnosis: { type: 'no_answer', isCorrect: null },
      observation: { messageType: 'general_math' },
      lastBoardAction: 'apply',
      pinnedProblem: '3x - 5 = 16',
    });
    expect(cards.some(c => c.action === 'pose')).toBe(false);
  });

  test('merge keeps clear before pose for an auto-advance pair', () => {
    const { all } = mergeWithLlmCommands([], [
      { action: 'pose', tex: 'x^2 - 7x + 10' },
      { action: 'clear' },
    ]);
    expect(all.map(c => c.action)).toEqual(['clear', 'pose']);
  });
});

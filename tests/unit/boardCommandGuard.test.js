const {
  enforcePedagogyRule,
  texMatchesStudentText,
  opMatchesStudentText,
  hasStartOverIntent,
  texHasBlank,
  cleanField,
  sanitizeCommand,
} = require('../../utils/boardCommandGuard');

describe('boardCommandGuard — tex sanitation (cannot display wrong math)', () => {
  describe('cleanField', () => {
    it('strips a leaked JSON array boundary from tex', () => {
      expect(cleanField('3x = 21},{')).toBe('3x = 21');
      expect(cleanField('3x - 5 = 16},{"action":"resolve"')).toBe('3x - 5 = 16');
    });
    it('strips stray wrapping JSON quotes', () => {
      expect(cleanField('"x = 8"')).toBe('x = 8');
    });
    it('leaves valid LaTeX untouched', () => {
      expect(cleanField('\\frac{1}{2} = 0.5')).toBe('\\frac{1}{2} = 0.5');
      expect(cleanField('x^{2} + 4x + 4 = 16')).toBe('x^{2} + 4x + 4 = 16');
      expect(cleanField('x = \\boxed{}')).toBe('x = \\boxed{}'); // scaffold blank survives
      expect(cleanField('\\{1, 2\\}')).toBe('\\{1, 2\\}'); // escaped set braces, not JSON
    });
    it('drops a trailing unbalanced residue brace but keeps balanced ones', () => {
      expect(cleanField('3x = 21}')).toBe('3x = 21');
      expect(cleanField('\\frac{1}{2}')).toBe('\\frac{1}{2}');
    });
  });

  describe('sanitizeCommand', () => {
    it('cleans tex + check and returns the same ref when nothing changed', () => {
      const clean = { action: 'verify', tex: 'x = 8', check: '2(8)+4=20' };
      expect(sanitizeCommand(clean)).toBe(clean);
      const dirty = sanitizeCommand({ action: 'resolve', tex: '3x = 21},{' });
      expect(dirty.tex).toBe('3x = 21');
    });
  });

  describe('enforcePedagogyRule', () => {
    it('passes the CLEANED command downstream (pose with leaked JSON)', () => {
      const { allowed, dropped } = enforcePedagogyRule({
        commands: [{ action: 'pose', tex: '3x - 5 = 16},{' }],
        userMessage: 'help me solve 3x - 5 = 16',
      });
      expect(dropped).toHaveLength(0);
      expect(allowed[0].tex).toBe('3x - 5 = 16');
    });
    it('drops a command whose tex scrubs away to nothing', () => {
      const { allowed, dropped } = enforcePedagogyRule({
        commands: [{ action: 'resolve', tex: '},{' }],
        userMessage: '3x = 21',
      });
      expect(allowed).toHaveLength(0);
      expect(dropped[0].reason).toBe('malformed_tex');
    });
  });
});

describe('boardCommandGuard', () => {
  describe('pose', () => {
    it('is always allowed regardless of student message', () => {
      const { allowed, dropped } = enforcePedagogyRule({
        commands: [{ action: 'pose', tex: '2x + 4 = 20' }],
        userMessage: 'hi',
      });
      expect(allowed).toHaveLength(1);
      expect(dropped).toHaveLength(0);
    });

    it('is allowed even when student says nothing', () => {
      const { allowed } = enforcePedagogyRule({
        commands: [{ action: 'pose', tex: 'x^2 = 9' }],
        userMessage: '',
      });
      expect(allowed).toHaveLength(1);
    });
  });

  describe('apply', () => {
    it('is allowed when op keyword appears in the user message', () => {
      const { allowed, dropped } = enforcePedagogyRule({
        commands: [{ action: 'apply', op: 'subtract 4 from both sides' }],
        userMessage: "I'd subtract 4 from both sides",
      });
      expect(allowed).toHaveLength(1);
      expect(dropped).toHaveLength(0);
    });

    it('matches on a fuzzy keyword ("subtract") even if op wording differs slightly', () => {
      const { allowed } = enforcePedagogyRule({
        commands: [{ action: 'apply', op: 'subtract 4 from both sides' }],
        userMessage: "I think we should subtract 4 here",
      });
      expect(allowed).toHaveLength(1);
    });

    it('is dropped when the student message does not mention the operation', () => {
      const { allowed, dropped } = enforcePedagogyRule({
        commands: [{ action: 'apply', op: 'subtract 4 from both sides' }],
        userMessage: 'idk where to start',
      });
      expect(allowed).toHaveLength(0);
      expect(dropped).toHaveLength(1);
      expect(dropped[0].reason).toBe('apply_op_not_in_student_message');
    });

    it('falls back to the prior user message for confirmation flows', () => {
      const { allowed } = enforcePedagogyRule({
        commands: [{ action: 'apply', op: 'subtract 4 from both sides' }],
        userMessage: 'yes',
        recentUserMessages: [{ role: 'user', content: 'subtract 4 from both sides' }],
      });
      expect(allowed).toHaveLength(1);
    });
  });

  describe('resolve', () => {
    it('is allowed when tex appears in student message', () => {
      const { allowed } = enforcePedagogyRule({
        commands: [{ action: 'resolve', tex: '2x = 16' }],
        userMessage: 'so 2x = 16, right?',
      });
      expect(allowed).toHaveLength(1);
    });

    it('matches per-side after splitting on =', () => {
      const { allowed } = enforcePedagogyRule({
        commands: [{ action: 'resolve', tex: '2x = 16' }],
        userMessage: 'I got 2x equals 16',
      });
      expect(allowed).toHaveLength(1);
    });

    it('is dropped when tex does not appear in student message', () => {
      const { allowed, dropped } = enforcePedagogyRule({
        commands: [{ action: 'resolve', tex: 'x = 99' }],
        userMessage: 'I have no idea',
      });
      expect(allowed).toHaveLength(0);
      expect(dropped[0].reason).toBe('resolve_tex_not_in_student_message');
    });
  });

  describe('verify', () => {
    it('is allowed when tex appears in student verification text', () => {
      const { allowed } = enforcePedagogyRule({
        commands: [{ action: 'verify', tex: 'x = 8', check: '2(8) + 4 = 20' }],
        userMessage: 'yeah, x = 8 checks out',
      });
      expect(allowed).toHaveLength(1);
    });

    it('is dropped when tex is missing', () => {
      const { allowed, dropped } = enforcePedagogyRule({
        commands: [{ action: 'verify', check: '2(8) + 4 = 20' }],
        userMessage: 'x = 8',
      });
      expect(allowed).toHaveLength(0);
      expect(dropped[0].reason).toBe('verify_missing_tex');
    });
  });

  describe('clear', () => {
    it('is allowed on explicit start-over intent ("new problem")', () => {
      const { allowed } = enforcePedagogyRule({
        commands: [{ action: 'clear' }],
        userMessage: 'can we do a new problem',
      });
      expect(allowed).toHaveLength(1);
    });

    it('is allowed on "let\'s try another"', () => {
      const { allowed } = enforcePedagogyRule({
        commands: [{ action: 'clear' }],
        userMessage: "let's try another",
      });
      expect(allowed).toHaveLength(1);
    });

    it('is allowed when last board action was verify', () => {
      const { allowed } = enforcePedagogyRule({
        commands: [{ action: 'clear' }],
        userMessage: 'cool',
        lastBoardActionInConversation: 'verify',
      });
      expect(allowed).toHaveLength(1);
    });

    it('is dropped when the student gave no start-over signal and last action was not verify', () => {
      const { allowed, dropped } = enforcePedagogyRule({
        commands: [{ action: 'clear' }],
        userMessage: 'what about this step',
        lastBoardActionInConversation: 'apply',
      });
      expect(allowed).toHaveLength(0);
      expect(dropped[0].reason).toBe('clear_without_start_over_or_completed_problem');
    });
  });

  describe('graph (tutor-emitted reference content)', () => {
    it('is always allowed when fn is present, regardless of student message', () => {
      const { allowed, dropped } = enforcePedagogyRule({
        commands: [{ action: 'graph', fn: 'x^2 - 4', caption: 'Where it crosses zero' }],
        userMessage: 'idk where to start',
      });
      expect(allowed).toEqual([
        { action: 'graph', fn: 'x^2 - 4', caption: 'Where it crosses zero' },
      ]);
      expect(dropped).toHaveLength(0);
    });

    it('is dropped when fn is missing', () => {
      const { allowed, dropped } = enforcePedagogyRule({
        commands: [{ action: 'graph' }],
        userMessage: 'graph it for me',
      });
      expect(allowed).toHaveLength(0);
      expect(dropped[0].reason).toBe('graph_missing_fn');
    });
  });

  describe('image (tutor-emitted reference content)', () => {
    it('is always allowed when query is present', () => {
      const { allowed, dropped } = enforcePedagogyRule({
        commands: [{ action: 'image', query: 'unit circle labeled' }],
        userMessage: 'what do you mean by reference angle',
      });
      expect(allowed).toEqual([{ action: 'image', query: 'unit circle labeled' }]);
      expect(dropped).toHaveLength(0);
    });

    it('is dropped when query is missing', () => {
      const { allowed, dropped } = enforcePedagogyRule({
        commands: [{ action: 'image' }],
        userMessage: 'show me a picture',
      });
      expect(allowed).toHaveLength(0);
      expect(dropped[0].reason).toBe('image_missing_query');
    });
  });

  describe('model (concept model, summoned with intent)', () => {
    it('is allowed for a curated model name', () => {
      const { allowed, dropped } = enforcePedagogyRule({
        commands: [{ action: 'model', model: 'slope_intercept_line', prompt: 'Slide m' }],
        userMessage: 'how does slope work',
      });
      expect(allowed).toHaveLength(1);
      expect(dropped).toHaveLength(0);
    });

    it('is allowed for a generated spec (no curated name)', () => {
      // The spec's structural validity is enforced upstream (conceptModelCommand);
      // the guard only needs an identity to admit the card.
      const { allowed, dropped } = enforcePedagogyRule({
        commands: [{ action: 'model', spec: { model: 'cosine_wave' }, prompt: 'Slide a' }],
        userMessage: 'show me a cosine wave',
      });
      expect(allowed).toHaveLength(1);
      expect(dropped).toHaveLength(0);
    });

    it('is dropped when it carries neither a name nor a spec', () => {
      const { allowed, dropped } = enforcePedagogyRule({
        commands: [{ action: 'model', prompt: 'play with this' }],
        userMessage: 'show me',
      });
      expect(allowed).toHaveLength(0);
      expect(dropped[0].reason).toBe('model_missing_name');
    });
  });

  describe('scaffold (fill-in-the-blank hint)', () => {
    it('is allowed on the student\'s own problem when it carries a blank', () => {
      // The scaffold sits on the student's OWN equation but reveals nothing —
      // the boxes are empty. This is the case the #1 rule must permit.
      const { allowed, dropped } = enforcePedagogyRule({
        commands: [{ action: 'scaffold', tex: 'x^2 + 4x + \\boxed{} = 12 + \\boxed{}' }],
        userMessage: "I'm stuck on completing the square",
      });
      expect(allowed).toHaveLength(1);
      expect(allowed[0].action).toBe('scaffold');
      expect(dropped).toHaveLength(0);
    });

    it('accepts spacing-only boxes and \\square blanks', () => {
      const a = enforcePedagogyRule({
        commands: [{ action: 'scaffold', tex: 'x^2 + 4x + \\boxed{\\;\\;} = 12 + \\boxed{\\;\\;}' }],
        userMessage: 'help',
      });
      expect(a.allowed).toHaveLength(1);
      const b = enforcePedagogyRule({
        commands: [{ action: 'scaffold', tex: '2x = \\square' }],
        userMessage: 'help',
      });
      expect(b.allowed).toHaveLength(1);
    });

    it('DROPS a scaffold with no blank — a filled-in scaffold is an answer dump', () => {
      const { allowed, dropped } = enforcePedagogyRule({
        commands: [{ action: 'scaffold', tex: 'x^2 + 4x + 4 = 12 + 4' }],
        userMessage: 'what do I add to both sides',
      });
      expect(allowed).toHaveLength(0);
      expect(dropped[0].reason).toBe('scaffold_has_no_blank');
    });

    it('is dropped when tex is missing', () => {
      const { allowed, dropped } = enforcePedagogyRule({
        commands: [{ action: 'scaffold' }],
        userMessage: 'hint please',
      });
      expect(allowed).toHaveLength(0);
      expect(dropped[0].reason).toBe('scaffold_missing_tex');
    });
  });

  describe('full drop scenario', () => {
    it('drops every move-tag when the student message is unrelated', () => {
      const { allowed, dropped } = enforcePedagogyRule({
        commands: [
          { action: 'apply', op: 'subtract 4 from both sides' },
          { action: 'resolve', tex: '2x = 16' },
          { action: 'verify', tex: 'x = 8', check: '2(8) + 4 = 20' },
        ],
        userMessage: 'what time does the library close',
      });
      expect(allowed).toHaveLength(0);
      expect(dropped).toHaveLength(3);
    });

    it('preserves pose even when everything else is dropped', () => {
      const { allowed, dropped } = enforcePedagogyRule({
        commands: [
          { action: 'pose', tex: '2x + 4 = 20' },
          { action: 'apply', op: 'subtract 4 from both sides' },
          { action: 'resolve', tex: '2x = 16' },
        ],
        userMessage: 'help',
      });
      expect(allowed).toHaveLength(1);
      expect(allowed[0].action).toBe('pose');
      expect(dropped).toHaveLength(2);
    });
  });

  describe('helpers', () => {
    it('texMatchesStudentText normalizes LaTeX cdot/times', () => {
      expect(texMatchesStudentText('2 \\cdot x = 6', '2x=6')).toBe(true);
      expect(texMatchesStudentText('2 \\times 3 = 6', '2*3 = 6')).toBe(true);
    });

    it('opMatchesStudentText catches keyword overlap', () => {
      expect(opMatchesStudentText('combine like terms', 'I want to combine these')).toBe(true);
      expect(opMatchesStudentText('factor the trinomial', 'try factoring')).toBe(true);
      expect(opMatchesStudentText('factor the trinomial', 'just guessing')).toBe(false);
    });

    it('hasStartOverIntent picks up common phrasings', () => {
      expect(hasStartOverIntent('new problem please')).toBe(true);
      expect(hasStartOverIntent('start over')).toBe(true);
      expect(hasStartOverIntent("let's try another")).toBe(true);
      expect(hasStartOverIntent('I want to continue this one')).toBe(false);
    });

    it('texHasBlank recognizes empty boxes, squares, and underscores', () => {
      expect(texHasBlank('x + \\boxed{}')).toBe(true);
      expect(texHasBlank('x + \\boxed{\\;\\;}')).toBe(true);
      expect(texHasBlank('x + \\boxed{\\quad}')).toBe(true);
      expect(texHasBlank('2x = \\square')).toBe(true);
      expect(texHasBlank('x + _____')).toBe(true);
      // A fully-filled expression has no blank — must be false.
      expect(texHasBlank('x^2 + 4x + 4 = 16')).toBe(false);
      expect(texHasBlank('\\boxed{4}')).toBe(false); // a filled box is not a blank
      expect(texHasBlank('')).toBe(false);
      expect(texHasBlank(null)).toBe(false);
    });
  });
});

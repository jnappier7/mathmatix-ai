/**
 * Visual token bracket grammar.
 *
 * This is the exact rule inlineChatVisuals.js uses to pull [NUMBER_LINE:...] and
 * friends out of a tutor message. It lived inline as [^\]]+, which truncated at
 * the first nested "]" — so the documented, canonical form
 *   [NUMBER_LINE:min=-5,max=5,points=[-2,0,3],highlight=3]
 * captured only "...points=[-2,0,3" and spilled ",highlight=3]" as literal text.
 * Every number line with points therefore rendered nothing, and the tutor,
 * seeing no visual, narrated "let me draw that" over and over.
 */

const { tokenRegex, PARAM } = require('../../public/js/visualTokenParser');

// Returns the full matched token, or null.
const matchFull = (re, s) => {
  re.lastIndex = 0;
  const m = re.exec(s);
  return m ? m[0] : null;
};

describe('nested-bracket tokens are captured whole', () => {
  const re = tokenRegex('NUMBER_LINE');

  test('the VisualEnforcer injection form', () => {
    const t = '[NUMBER_LINE:min=-10,max=10,points=[4],highlight=4]';
    expect(matchFull(re, t)).toBe(t);
  });

  test('the documented multi-point form', () => {
    const t = '[NUMBER_LINE:min=-5,max=5,points=[-2,0,3],highlight=3,label="L"]';
    expect(matchFull(re, t)).toBe(t);
  });

  test('the jumps form — brackets around parens', () => {
    const t = '[NUMBER_LINE:min=0,max=10,jumps=[(0,3,"+3"),(3,7,"+4")],label="Adding"]';
    expect(matchFull(re, t)).toBe(t);
  });

  test('the fraction form', () => {
    const t = '[NUMBER_LINE:min=0,max=2,denominator=4,points=[1/4,3/4,5/4]]';
    expect(matchFull(re, t)).toBe(t);
  });
});

describe('the simple cases behave exactly as before', () => {
  test('a token with no nested brackets', () => {
    const t = '[NUMBER_LINE:min=-5,max=5]';
    expect(matchFull(tokenRegex('NUMBER_LINE'), t)).toBe(t);
  });

  test('captures only the token, not trailing prose with a lone bracket', () => {
    // The pattern must not run away past the closing "]".
    const re = tokenRegex('NUMBER_LINE');
    const s = '[NUMBER_LINE:min=0,max=5] then text with a lone ] bracket';
    expect(matchFull(re, s)).toBe('[NUMBER_LINE:min=0,max=5]');
  });

  test('leaves surrounding text intact when used for replace', () => {
    const re = tokenRegex('NUMBER_LINE');
    const out = 'before [NUMBER_LINE:min=-1,max=1,points=[0]] after'.replace(re, 'X');
    expect(out).toBe('before X after');
  });
});

describe('token variants', () => {
  test('star allows empty params (UNIT_CIRCLE)', () => {
    const re = tokenRegex('UNIT_CIRCLE', { star: true, optionalColon: true });
    expect(matchFull(re, '[UNIT_CIRCLE]')).toBe('[UNIT_CIRCLE]');
    expect(matchFull(re, '[UNIT_CIRCLE:angle=45]')).toBe('[UNIT_CIRCLE:angle=45]');
  });

  test('pad tolerates whitespace around the name (FUNCTION_GRAPH)', () => {
    const re = tokenRegex('FUNCTION_GRAPH', { pad: true });
    const t = '[ FUNCTION_GRAPH : fn=x^2,points=[1,2] ]';
    expect(matchFull(re, t)).toBe(t);
  });

  test('the plus variant requires at least one param char', () => {
    const re = tokenRegex('NUMBER_LINE');
    expect(matchFull(re, '[NUMBER_LINE:]')).toBeNull();
  });
});

describe('the grammar piece is exported for reuse', () => {
  test('PARAM matches a nested group and a plain char', () => {
    expect(new RegExp('^' + PARAM + '$').test('a')).toBe(true);
    expect(new RegExp('^' + PARAM + '$').test('[1,2,3]')).toBe(true);
    expect(new RegExp('^' + PARAM + '$').test(']')).toBe(false);
  });
});

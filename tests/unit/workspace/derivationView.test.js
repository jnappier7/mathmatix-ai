const { classify, cleanLatex } = require('../../../public/js/living-workspace/dom/derivationView.js');

// The tutor sometimes wraps board tex in math delimiters, which make
// KaTeX.render error ("Can't use function '\(' in math mode") and show raw
// red source. cleanLatex strips those wrappers so the equation typesets.
describe('derivationView.cleanLatex', () => {
  it('strips the \\(...\\) delimiters seen live (multi-wrapped answer)', () => {
    // \(x^{5}\)-\(x^{3}\)+7x+C  ->  x^{5} - x^{3} +7x+C  (renderable)
    const out = cleanLatex('\\(x^{5}\\)-\\(x^{3}\\)+7x+C');
    expect(out).not.toMatch(/\\[()]/);
    expect(out).toContain('x^{5}');
    expect(out).toContain('+C');
  });

  it('strips \\[...\\] display delimiters and $ / $$ wrappers', () => {
    expect(cleanLatex('\\[ x = 5 \\]')).toBe('x = 5');
    expect(cleanLatex('$$\\int x\\,dx$$')).toBe('\\int x\\,dx');
    expect(cleanLatex('$x+1$')).toBe('x+1');
  });

  it('leaves clean tex and interior \\left( … \\right) untouched', () => {
    expect(cleanLatex('x^2 - 4x + 3')).toBe('x^2 - 4x + 3');
    expect(cleanLatex('\\left( x+1 \\right)^2')).toBe('\\left( x+1 \\right)^2');
  });

  it('handles junk', () => {
    expect(cleanLatex(null)).toBe('');
    expect(cleanLatex(undefined)).toBe('');
  });
});

// classify() decides how each adapted element renders in the focused
// derivation. Pure function; the DOM layout is verified in-browser.
describe('derivationView.classify', () => {
  const eq = (role) => ({ type: 'equation', semantic: { latex: 'x=1', role } });

  it('maps the equation roles the adapter emits', () => {
    expect(classify(eq('problem'))).toBe('problem');
    expect(classify(eq('operation'))).toBe('operation');
    expect(classify(eq('solution'))).toBe('solution');
    expect(classify(eq('scaffold'))).toBe('scaffold');
    expect(classify(eq('example'))).toBe('example');
  });

  it('treats resolve / unknown / missing equation roles as a plain step', () => {
    expect(classify(eq('step'))).toBe('step');
    expect(classify(eq('whatever'))).toBe('step');
    expect(classify({ type: 'equation', semantic: {} })).toBe('step');
    expect(classify({ type: 'equation' })).toBe('step');
  });

  it('renders every non-equation type (graph/image/geometry) as an inline block', () => {
    expect(classify({ type: 'graph', semantic: { fn: 'x^2' } })).toBe('block');
    expect(classify({ type: 'image', semantic: { query: 'unit circle' } })).toBe('block');
    expect(classify({ type: 'geometry', semantic: { diagramType: 'triangle' } })).toBe('block');
  });

  it('ignores junk', () => {
    expect(classify(null)).toBeNull();
    expect(classify(undefined)).toBeNull();
    expect(classify('nope')).toBeNull();
  });
});

// A finished problem shrinks to a thumbnail rather than being deleted, and the
// ✓ on it means the derivation actually reached an answer.
describe('derivationView.hasSolution', () => {
  const { hasSolution } = require('../../../public/js/living-workspace/dom/derivationView.js');
  const eq = (role) => ({ type: 'equation', semantic: { latex: 'x=1', role } });

  it('is true once a verify card closed the problem out', () => {
    expect(hasSolution([eq('problem'), eq('step'), eq('solution')])).toBe(true);
  });

  it('is false for a problem abandoned mid-derivation', () => {
    expect(hasSolution([eq('problem'), eq('step'), eq('scaffold')])).toBe(false);
  });

  it('handles empty / junk', () => {
    expect(hasSolution([])).toBe(false);
    expect(hasSolution(null)).toBe(false);
  });
});

// Voice ships the board cumulatively — each turn resends every step and only
// the last is typically new. The spoken-step spotlight keys off exactly that:
// whatever arrived THIS turn is what the tutor is talking about.
describe('derivationView.freshNodes', () => {
  const { freshNodes } = require('../../../public/js/living-workspace/dom/derivationView.js');

  it('marks only the step appended this turn', () => {
    const a = { n: 'a' }, b = { n: 'b' }, c = { n: 'c' };
    expect(freshNodes([a, b], [a, b, c])).toEqual([c]);
  });

  it('marks nothing when the turn re-sends an unchanged board', () => {
    const a = { n: 'a' }, b = { n: 'b' };
    expect(freshNodes([a, b], [a, b])).toEqual([]);
  });

  it('marks every line after a new problem wipes the stack', () => {
    // The regression an index count would cause: the new stack is SHORTER than
    // the old one, so "past the old length" marks nothing at all.
    const oldA = { n: 'old1' }, oldB = { n: 'old2' }, oldC = { n: 'old3' };
    const newA = { n: 'new1' };
    expect(freshNodes([oldA, oldB, oldC], [newA])).toEqual([newA]);
  });

  it('marks multiple steps when a turn lands several at once', () => {
    const a = { n: 'a' }, b = { n: 'b' }, c = { n: 'c' };
    expect(freshNodes([a], [a, b, c])).toEqual([b, c]);
  });

  it('handles the first turn on an empty board', () => {
    const a = { n: 'a' };
    expect(freshNodes([], [a])).toEqual([a]);
  });
});

// ── groupRows: the operation fold, and the numbering it must not break ──
//
// An `apply` card became a LABEL on the line it produced instead of a row of
// its own. That is a rendering win and a numbering hazard: boardStateBlock.js
// numbers every non-pose card (apply included) and the tutor points with
// <BOARD_POINT step="N"/> against THAT numbering. Every row therefore records
// the ordinals it absorbed, so pointing still lands on the right line.
const { groupRows } = require('../../../public/js/living-workspace/dom/derivationView.js');

const eq = (latex, role) => ({ type: 'equation', semantic: { latex, role } });
const op = (text) => ({ type: 'equation', semantic: { latex: text, role: 'operation', op: text } });

describe('derivationView.groupRows', () => {
  it('folds an operation into the line it produced, keeping both ordinals', () => {
    const rows = groupRows([op('square both sides'), eq('x+10 = (x-2)^2', 'step')], 0);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('step');
    expect(rows[0].opElement.semantic.op).toBe('square both sides');
    // 1 = the apply, 2 = the resolve — pointing at EITHER hits this row.
    expect(rows[0].ordinals).toEqual([1, 2]);
  });

  it('never drops an operation whose line has not arrived yet', () => {
    // The tutor emitted `apply` this turn and `resolve` next turn. Holding the
    // op pending past the end of the batch would lose the move entirely.
    const rows = groupRows([op('take the reciprocal')], 0);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('operation');
    expect(rows[0].ordinals).toEqual([1]);
  });

  it('gives back-to-back operations a row each', () => {
    const rows = groupRows([op('distribute'), op('then combine'), eq('2x = 8', 'step')], 0);
    expect(rows.map(r => r.kind)).toEqual(['operation', 'step']);
    expect(rows[0].ordinals).toEqual([1]);
    expect(rows[1].ordinals).toEqual([2, 3]);   // second op folds into the step
  });

  it('continues numbering across turns via startOrdinal', () => {
    // Turn 2 of a derivation that already holds 4 cards.
    const rows = groupRows([op('divide by 2'), eq('x = 4', 'step')], 4);
    expect(rows[0].ordinals).toEqual([5, 6]);
  });

  it('excludes the pose — the problem is the card head, not a row', () => {
    const rows = groupRows([eq('2x = 8', 'problem'), eq('x = 4', 'step')], 0);
    expect(rows).toHaveLength(1);
    expect(rows[0].ordinals).toEqual([1]);   // the pose consumed no ordinal
  });

  it('keeps blocks and solutions in the flow with their own ordinals', () => {
    const rows = groupRows([
      { type: 'graph', semantic: { fn: 'x^2' } },
      eq('x = 6', 'solution'),
    ], 2);
    expect(rows.map(r => r.kind)).toEqual(['block', 'solution']);
    expect(rows[0].ordinals).toEqual([3]);
    expect(rows[1].ordinals).toEqual([4]);
  });

  it('survives junk without throwing', () => {
    expect(groupRows(null, 0)).toEqual([]);
    expect(groupRows([null, undefined, 'nope'], 0)).toEqual([]);
  });
});

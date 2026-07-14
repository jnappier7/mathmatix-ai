'use strict';
/* Living Workspace P6 — algebra-tiles element, pure interaction logic.
   The DoD is "mouse/touch/pen/keyboard produce the SAME operation object,
   and a cancelled gesture changes nothing." Both the pointer-drop path and
   the keyboard-select path route through interpretDrop(), so testing it
   proves the contract for every input modality. */

const Tile = require('../../../public/js/living-workspace/dom/tileElement');

const x2 = { id: 'a', coefficient: 2, variable: 'x' };
const x3 = { id: 'b', coefficient: 3, variable: 'x' };
const xNeg2 = { id: 'c', coefficient: -2, variable: 'x' };
const unit4 = { id: 'd', coefficient: 4, variable: '' };
const y5 = { id: 'e', coefficient: 5, variable: 'y' };

describe('interpretDrop — the shared gesture→operation contract', () => {
  test('two like variable terms → combine_like_terms', () => {
    expect(Tile.interpretDrop(x2, x3)).toEqual({ type: 'combine_like_terms', tileRefs: ['a', 'b'] });
  });

  test('two like unit/constant terms → combine_like_terms', () => {
    expect(Tile.interpretDrop({ id: 'd', coefficient: 4, variable: '' }, { id: 'f', coefficient: 1, variable: '' }))
      .toEqual({ type: 'combine_like_terms', tileRefs: ['d', 'f'] });
  });

  test('+n and −n of the same variable → remove_zero_pair (not combine)', () => {
    expect(Tile.interpretDrop(x2, xNeg2)).toEqual({ type: 'remove_zero_pair', tileRefs: ['a', 'c'] });
  });

  test('unlike terms → still a combine ATTEMPT (client proposes; server coaches the misconception)', () => {
    // The pedagogy is "allow-and-teach": the student may TRY to combine 2x
    // and 4, or 2x and 5y. The client sends a combine attempt; the server
    // classifies it combine_unlike_terms and the tutor coaches — the UI must
    // NOT block it.
    expect(Tile.interpretDrop(x2, y5)).toEqual({ type: 'combine_like_terms', tileRefs: ['a', 'e'] });
    expect(Tile.interpretDrop(x2, unit4)).toEqual({ type: 'combine_like_terms', tileRefs: ['a', 'd'] });
  });

  test('dropping a tile on itself → null (no-op)', () => {
    expect(Tile.interpretDrop(x2, x2)).toBeNull();
  });

  test('missing operands → null (never throws)', () => {
    expect(Tile.interpretDrop(null, x2)).toBeNull();
    expect(Tile.interpretDrop(x2, undefined)).toBeNull();
  });

  test('zero-pair only when coefficients are exact opposites', () => {
    // +2x on −3x are like but NOT a zero pair → combine
    expect(Tile.interpretDrop(x2, { id: 'g', coefficient: -3, variable: 'x' }))
      .toEqual({ type: 'combine_like_terms', tileRefs: ['a', 'g'] });
  });
});

describe('termLabel — chip text', () => {
  test('variable terms', () => {
    expect(Tile.termLabel({ coefficient: 2, variable: 'x' })).toBe('2x');
    expect(Tile.termLabel({ coefficient: 1, variable: 'x' })).toBe('x');
    expect(Tile.termLabel({ coefficient: -1, variable: 'x' })).toBe('-x');
    expect(Tile.termLabel({ coefficient: -3, variable: 'x' })).toBe('-3x');
  });
  test('unit/constant terms', () => {
    expect(Tile.termLabel({ coefficient: 4, variable: '' })).toBe('4');
    expect(Tile.termLabel({ coefficient: -5, variable: '' })).toBe('-5');
  });
});

describe('module shape', () => {
  test('exports a renderer factory + pure helpers', () => {
    expect(typeof Tile.makeRenderer).toBe('function');
    expect(typeof Tile.interpretDrop).toBe('function');
    // makeRenderer returns a factory even without hooks (safe default onOperation)
    expect(typeof Tile.makeRenderer()).toBe('function');
  });
});

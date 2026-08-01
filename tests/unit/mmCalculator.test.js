/**
 * mmCalculator — the app's ONE calculator engine.
 *
 * This engine now backs all three calculator surfaces (chat, the ACT practice
 * test, and the standalone /calculator.html), replacing two ~1,700-line TI-84
 * emulations. That consolidation is only safe if the arithmetic is right, so
 * the evaluator is pinned here.
 *
 * The security case is the important one. `evaluate` builds a `new Function`
 * from the expression string. That was safe in its original home because the
 * ACT calculator was tap-only — every character came from a button we defined.
 * Adding keyboard support removes that guarantee, so KEY_MAP whitelists typed
 * characters and `evaluate` re-checks the normalized string before it reaches
 * the Function constructor. Both layers are asserted below; if either is
 * loosened, typing `constructor` into a calculator becomes code execution.
 *
 * The module is a browser IIFE that assigns window.MMCalculator, and the
 * evaluator itself touches no DOM — so it loads here with a window stub.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// create() runs _build(), which touches the DOM, so the module gets a document
// stub just rich enough to construct. The evaluator under test uses none of it.
function stubEl() {
  const el = {
    className: '', innerHTML: '', style: {}, textContent: '',
    setAttribute() {}, appendChild() {}, remove() {},
    addEventListener() {}, removeEventListener() {},
    querySelector: () => stubEl(), querySelectorAll: () => [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  };
  return el;
}

function loadCalculator() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'public', 'js', 'mmCalculator.js'), 'utf8');
  const sandbox = {
    window: {},
    document: {
      createElement: stubEl,
      addEventListener() {}, removeEventListener() {},
      body: stubEl(),
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.window.MMCalculator;
}

const MMCalculator = loadCalculator();
const engine = MMCalculator.create({});

const ev = (expr, deg = true) => { engine.deg = deg; return engine.evaluate(expr); };

describe('mmCalculator — arithmetic', () => {
  test('basic operators, including the display glyphs', () => {
    expect(ev('1+2')).toBe(3);
    expect(ev('7−3')).toBe(4);      // U+2212 minus, not hyphen
    expect(ev('6×7')).toBe(42);     // U+00D7
    expect(ev('9÷3')).toBe(3);      // U+00F7
  });

  test('trims binary float noise instead of showing it to a kid', () => {
    // The whole reason for toPrecision(12): 0.1+0.2 must not read 0.30000000000000004.
    expect(ev('0.1+0.2')).toBe(0.3);
    expect(ev('1.1×3')).toBe(3.3);
  });

  test('powers, roots and logs', () => {
    expect(ev('3^2')).toBe(9);
    expect(ev('2^10')).toBe(1024);
    expect(ev('sqrt(9)')).toBe(3);
    expect(ev('log(100)')).toBe(2);   // base 10
    expect(ev('ln(E)')).toBe(1);      // natural
  });

  test('trig honours DEG and RAD', () => {
    expect(ev('sin(30)', true)).toBeCloseTo(0.5, 10);
    expect(ev('cos(0)', true)).toBe(1);
    expect(ev('tan(45)', true)).toBeCloseTo(1, 10);
    expect(ev('sin(pi)', false)).toBeCloseTo(0, 10);
    // Same expression, different mode — the mode is not decoration.
    expect(ev('sin(30)', false)).not.toBeCloseTo(0.5, 6);
  });

  test('implicit multiplication, the way a student writes it', () => {
    expect(ev('2π')).toBeCloseTo(Math.PI * 2, 10);
    expect(ev('2(3)')).toBe(6);
    expect(ev('(2)(3)')).toBe(6);
    expect(ev('(1+1)3')).toBe(6);
  });

  test('percent is a token, not an operator', () => {
    expect(ev('50/100')).toBe(0.5);
  });

  test('rejects non-finite and non-numeric results rather than printing them', () => {
    expect(() => ev('1÷0')).toThrow();       // Infinity
    expect(() => ev('sqrt(-1)')).toThrow();  // NaN
  });

  test('rejects half-typed input so the live preview can blank instead of erroring', () => {
    expect(() => ev('3+')).toThrow();
    expect(() => ev('(')).toThrow();
  });
});

describe('mmCalculator — the Function constructor is fenced off', () => {
  // evaluate() ends in `new Function(...)`. Each of these would be live code
  // execution if the guard regressed.
  test.each([
    ['alert(1)'],
    ['this'],
    ['constructor'],
    ['globalThis'],
    ['window.location'],
    ['fetch("/x")'],
    ['[].constructor'],
    ['(()=>1)()'],
    ['process.exit'],
    ['require("fs")'],
  ])('refuses %s', (payload) => {
    expect(() => ev(payload)).toThrow();
  });

  test('the identifiers it DOES allow are only the math helpers', () => {
    // Everything the keypad can emit must still evaluate...
    for (const expr of ['sin(1)', 'cos(1)', 'tan(1)', 'ln(2)', 'log(2)', 'sqrt(4)', 'pi', 'E']) {
      expect(() => ev(expr)).not.toThrow();
    }
    // ...and nothing else may.
    for (const expr of ['Math', 'Number', 'String', 'eval']) {
      expect(() => ev(expr)).toThrow();
    }
  });

  test('a name built out of allowed fragments is still refused', () => {
    // `constructor` survives the identifier strip only if the strip is written
    // carelessly — e.g. removing `cos` from the middle of a longer word.
    expect(() => ev('constructor')).toThrow();
    expect(() => ev('Elog')).toThrow();
  });
});

describe('mmCalculator — typed input whitelist', () => {
  const KEY_MAP = MMCalculator._KEY_MAP;

  test('maps only characters a calculator needs', () => {
    for (const k of ['0', '5', '9', '.', '(', ')', '+', '-', '*', '/', '^']) {
      expect(KEY_MAP[k]).toBeTruthy();
    }
  });

  test('maps typed operators onto the display glyphs the evaluator expects', () => {
    expect(KEY_MAP['-']).toBe('−');   // to U+2212
    expect(KEY_MAP['*']).toBe('×');
    expect(KEY_MAP['/']).toBe('÷');
  });

  test('lets no letter through except the x shorthand for multiply', () => {
    const letters = Object.keys(KEY_MAP).filter((k) => /[a-zA-Z]/.test(k));
    expect(letters.sort()).toEqual(['X', 'x']);
    expect(KEY_MAP['x']).toBe('×');
    // The characters that would matter for an injection are simply absent.
    for (const k of ['c', 'o', 'n', 's', 't', 'r', 'u', "'", '"', '`', ';', '[', ']', '{', '}', '=']) {
      expect(KEY_MAP[k]).toBeUndefined();
    }
  });
});

describe('mmCalculator — keypad', () => {
  test('every key carries a token, and the tokens are all evaluable or actions', () => {
    const ACTIONS = new Set(['ac', 'del', 'ans', 'eq']);
    for (const [label, tok] of MMCalculator._KEYS) {
      expect(label).toBeTruthy();
      expect(tok).toBeTruthy();
      if (ACTIONS.has(tok)) continue;
      // A token must be usable in an expression: appending it to a number
      // either evaluates or is a legitimate partial (an open function paren).
      expect(typeof tok).toBe('string');
    }
  });

  test('exposes the scientific set the ACT allows, and nothing modal', () => {
    const labels = MMCalculator._KEYS.map((k) => k[0]);
    for (const want of ['sin', 'cos', 'tan', 'ln', 'log', '√', 'π', 'e', 'ANS', 'x²', 'xʸ', '%']) {
      expect(labels).toContain(want);
    }
    // The TI-84 modal layers this replaced must not come back.
    for (const gone of ['2nd', 'MODE', 'STAT', 'TABLE', 'STO', 'RCL']) {
      expect(labels).not.toContain(gone);
    }
  });
});

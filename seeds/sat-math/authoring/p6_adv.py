"""SAT bank p6 — Advanced Math (ADV). 32 items (8 E / 12 M / 12 H). Hard items
weighted up for the SAT's harder Module 2; graphs are needed to answer."""

EE = 'Equivalent expressions'
EX = 'Equivalent expressions (exponent rules)'
ER = 'Equivalent expressions (rational)'
NE = 'Nonlinear equations'
NQ = 'Nonlinear equations (quadratic)'
NR = 'Nonlinear equations (radical)'
NA = 'Nonlinear equations (absolute value)'
NX = 'Nonlinear equations (exponential, equal bases)'
NS = 'Nonlinear equations and systems'
NF = 'Nonlinear functions'
NFQ = 'Nonlinear functions (quadratic)'
NFE = 'Nonlinear functions (exponential)'
NFC = 'Nonlinear functions (composition)'
NFP = 'Nonlinear functions (polynomial)'

X = "x = sp.Symbol('x')\n"


def rhs_is(expr_src):
    """Custom check: the key is the ONE choice whose right-hand side equals `expr_src` (sympy, in x)."""
    return (f"_ok = [c for c in C if sp.simplify(P(c.split('=', 1)[1]) - ({expr_src})) == 0]\n"
            "assert _ok == [C[K]], _ok\n")


def add(b):
    # ── Easy (8) ─────────────────────────────────────────────────────
    b.mc('ADV', EE, 'E',
         'Which expression is equivalent to (x + 4)²?',
         'x² + 8x + 16', ['x² + 16', 'x² + 4x + 16', '2x + 8'],
         '(x + 4)(x + 4) = x² + 4x + 4x + 16 = x² + 8x + 16. Squaring each term (x² + 16) drops the middle term.',
         X + "ans = sp.expand((x + 4)**2)\n")

    b.mc('ADV', NFQ, 'E',
         'The function f is defined by f(x) = 2x² + 1. What is the value of f(3)?',
         '19', ['13', '37', '10'],
         'f(3) = 2(3²) + 1 = 2(9) + 1 = 19. (37 squares 2 · 3 = 6 instead of squaring 3.)',
         X + "ans = (2*x**2 + 1).subs(x, 3)\n")

    b.mc('ADV', EE, 'E',
         'Which of the following is equivalent to x² − 25?',
         '(x + 5)(x − 5)', ['(x − 5)²', '(x + 5)²', '(x − 25)(x + 1)'],
         'x² − 25 is a difference of squares: x² − 5² = (x + 5)(x − 5).',
         X + "ans = x**2 - 25\n")

    b.spr('ADV', EX, 'E',
          'For x ≠ 0, the expression (x³ · x⁴)/x² is equivalent to xⁿ. What is the value of n?',
          '5', [],
          'Multiplying adds exponents: x³ · x⁴ = x⁷. Dividing subtracts them: x⁷/x² = x⁵.',
          "ans = 3 + 4 - 2\nx = sp.Symbol('x', positive=True)\nassert sp.simplify(x**3*x**4/x**2 - x**ans) == 0\n")

    b.mc('ADV', NQ, 'E',
         'What is the positive solution to the equation 3x² = 48?',
         '4', ['16', '8', '√48'],
         'Divide by 3: x² = 16. The positive square root is 4. (16 is x², not x.)',
         X + "ans = [s for s in sp.solve(3*x**2 - 48, x) if s > 0][0]\n")

    b.mc('ADV', NFQ, 'E',
         'The graph of the quadratic function y = f(x) is shown. How many times does the graph cross the x-axis?',
         '2', ['0', '1', '3'],
         'The parabola dips below the x-axis between x = 1 and x = 3 and crosses it at both of those points: 2 times.',
         X + "f = (x - 1)*(x - 3)\nans = len(sp.solve(f, x))\n",
         figure={'kind': 'fgraph', 'params': {'expr': '(x - 1)*(x - 3)', 'xmin': -1, 'xmax': 5, 'ymin': -2, 'ymax': 8}})

    b.mc('ADV', NFE, 'E',
         'A culture starts with 100 bacteria, and the number of bacteria triples every hour. How many bacteria are in the culture after 2 hours?',
         '900', ['600', '300', '1,200'],
         'After 1 hour: 300. After 2 hours: 3 × 300 = 900. (600 adds tripling as if it were linear growth: 100 × 3 × 2.)',
         "ans = 100 * 3**2\n")

    b.mc('ADV', NR, 'E',
         'What value of x satisfies the equation √(x + 5) = 4?',
         '11', ['21', '−1', '3'],
         'Square both sides: x + 5 = 16, so x = 11. Check: √16 = 4.',
         X + "ans = sp.solve(sp.sqrt(x + 5) - 4, x)[0]\n")

    # ── Medium (12) ──────────────────────────────────────────────────
    b.mc('ADV', NFQ, 'M',
         'What are the coordinates of the vertex of the graph of y = x² − 6x + 5 in the xy-plane?',
         '(3, −4)', ['(−3, 32)', '(3, 5)', '(6, 5)'],
         'The vertex x-coordinate is −b/(2a) = 6/2 = 3. Then y = 9 − 18 + 5 = −4.',
         X + "f = x**2 - 6*x + 5\nh = sp.solve(sp.diff(f, x), x)[0]\nassert (h, f.subs(x, h)) == (3, -4)\nans = None\n",
         custom="assert C[K] == '(3, −4)' and len(set(C)) == 4\n")

    b.spr('ADV', NQ, 'M',
          'What is the positive solution to the equation x² − 3x − 10 = 0?',
          '5', [],
          'Factor: (x − 5)(x + 2) = 0, so x = 5 or x = −2. The positive solution is 5.',
          X + "ans = [s for s in sp.solve(x**2 - 3*x - 10, x) if s > 0][0]\n")

    b.mc('ADV', ER, 'M',
         'For x ≠ −2, which expression is equivalent to (x² + 5x + 6)/(x + 2)?',
         'x + 3', ['x + 2', 'x + 6', 'x² + 3'],
         'Factor the numerator: (x + 2)(x + 3). Cancel x + 2 to get x + 3.',
         X + "ans = sp.cancel((x**2 + 5*x + 6)/(x + 2))\n")

    b.mc('ADV', NFE, 'M',
         'The graph of the exponential function f is shown. Which equation defines f?',
         'f(x) = 2(2)ˣ', ['f(x) = 4(2)ˣ', 'f(x) = 2x + 2', 'f(x) = 2(4)ˣ'],
         'The graph passes through (0, 2), (1, 4), and (2, 8): it starts at 2 and doubles with each step of 1, so f(x) = 2(2)ˣ. (2x + 2 matches the first two points but gives 6, not 8, at x = 2.)',
         X + "ans = None\n",
         custom="x = sp.Symbol('x')\nT = lambda c: sp.parsing.sympy_parser.parse_expr(c.split('=', 1)[1].replace('ˣ', '**x'), local_dict={'x': x}, transformations=_T)\n"
                "pts = [(0, 2), (1, 4), (2, 8)]\n_ok = [c for c in C if all(T(c).subs(x, a) == v for a, v in pts)]\nassert _ok == [C[K]], _ok\n",
         figure={'kind': 'fgraph', 'params': {'expr': '2*2**x', 'xmin': -3, 'xmax': 3, 'ymin': -2, 'ymax': 10}})

    b.mc('ADV', NFC, 'M',
         'The functions f and g are defined by f(x) = x² − 2x and g(x) = 2x + 1. What is the value of g(f(3))?',
         '7', ['35', '3', '13'],
         'Work from the inside out: f(3) = 9 − 6 = 3. Then g(3) = 2(3) + 1 = 7. (35 is f(g(3)) = f(7) = 49 − 14, the composition in the other order.)',
         X + "f = x**2 - 2*x\ng = 2*x + 1\nans = g.subs(x, f.subs(x, 3))\nassert f.subs(x, g.subs(x, 3)) == 35\n")

    b.mc('ADV', NFQ, 'M',
         'In the xy-plane, the graph of which equation has x-intercepts at x = 2 and x = −5?',
         'y = (x − 2)(x + 5)', ['y = (x + 2)(x − 5)', 'y = x² − 10', 'y = (x − 2)(x − 5)'],
         'A factor (x − r) makes y = 0 at x = r. For x = 2 and x = −5 the factors are (x − 2) and (x + 5).',
         X + "ans = None\n",
         custom="x = sp.Symbol('x')\n_ok = [c for c in C if set(sp.solve(P(c.split('=', 1)[1]), x)) == {2, -5}]\nassert _ok == [C[K]], _ok\n")

    b.spr('ADV', NX, 'M',
          'What value of x satisfies the equation 4ˣ = 2^(x + 3)?',
          '3', [],
          'Write 4ˣ as 2^(2x). Equal bases, so 2x = x + 3 and x = 3.',
          X + "ans = sp.solve(2*x - (x + 3), x)[0]\nassert sp.simplify(4**ans - 2**(ans + 3)) == 0\n")

    b.mc('ADV', NA, 'M',
         'What is the sum of the solutions to the equation |2x − 6| = 10?',
         '6', ['8', '−2', '16'],
         '2x − 6 = 10 gives x = 8, and 2x − 6 = −10 gives x = −2. Their sum is 8 + (−2) = 6.',
         X + "ans = sum(sp.solve(2*x - 6 - 10, x) + sp.solve(2*x - 6 + 10, x))\n")

    b.mc('ADV', NFE, 'M',
         'A town’s population of 8,000 decreases by 5% each year. Which function models the population P(t) after t years?',
         'P(t) = 8,000(0.95)ᵗ', ['P(t) = 8,000(0.05)ᵗ', 'P(t) = 8,000(1.05)ᵗ', 'P(t) = 8,000 − 0.05t'],
         'Losing 5% each year leaves 95% of the population, so each year multiplies by 0.95. (0.05 would keep only 5%; 1.05 is growth.)',
         "t = sp.Symbol('t')\nans = None\n",
         custom="t = sp.Symbol('t')\nT = lambda c: sp.parsing.sympy_parser.parse_expr(c.split('=', 1)[1].replace(',', '').replace('ᵗ', '**t').replace('−', '-'), local_dict={'t': t}, transformations=_T)\n"
                "good = lambda f: abs(sp.N(f.subs(t, 0)) - 8000) < 1e-6 and all(abs(sp.N(f.subs(t, k + 1) - sp.Rational(95, 100)*f.subs(t, k))) < 1e-6 for k in (0, 1, 2))\n"
                "_ok = [c for c in C if good(T(c))]\nassert _ok == [C[K]], _ok\n")

    b.spr('ADV', NS, 'M',
          'y = x − 1\ny = x² − 3x + 2\nThe graphs of the equations above intersect at two points. What is the sum of the x-coordinates of the two points?',
          '4', [],
          'Set x² − 3x + 2 = x − 1: x² − 4x + 3 = 0, (x − 1)(x − 3) = 0. The x-coordinates are 1 and 3, and their sum is 4.',
          X + "ans = sum(sp.solve(x**2 - 3*x + 2 - (x - 1), x))\n")

    b.mc('ADV', NE, 'M',
         'For x ≠ 2, what value of x satisfies the equation x/(x − 2) = 3?',
         '3', ['2', '6', '−3'],
         'Multiply both sides by x − 2: x = 3(x − 2) = 3x − 6. So 2x = 6 and x = 3. Check: 3/(3 − 2) = 3. (x = 2 is excluded — it makes the denominator 0.)',
         X + "ans = sp.solve(x/(x - 2) - 3, x)[0]\n")

    b.mc('ADV', EX, 'M',
         'Which expression is equivalent to (3x²y)(2xy³)?',
         '6x³y⁴', ['5x³y⁴', '6x²y³', '6x³y³'],
         'Multiply the coefficients (3 · 2 = 6) and add exponents on like bases: x² · x = x³ and y · y³ = y⁴.',
         "x, y = sp.symbols('x y')\nans = (3*x**2*y)*(2*x*y**3)\n")

    # ── Hard (12) ────────────────────────────────────────────────────
    b.spr('ADV', NQ, 'H',
          'In the equation x² − 8x + c = 0, c is a constant. If the equation has exactly one real solution, what is the value of c?',
          '16', [],
          'Exactly one solution means the discriminant is 0: (−8)² − 4(1)(c) = 0, so 64 = 4c and c = 16. (Then x² − 8x + 16 = (x − 4)².)',
          "c = sp.Symbol('c')\nans = sp.solve(64 - 4*c, c)[0]\n")

    b.mc('ADV', NFQ, 'H',
         'The function f is defined by f(x) = −2x² + 12x − 7. What is the maximum value of f(x)?',
         '11', ['3', '−7', '29'],
         'The maximum occurs at x = −b/(2a) = −12/(−4) = 3, and f(3) = −18 + 36 − 7 = 11. (3 is where the maximum occurs.)',
         X + "ans = sp.maximum(-2*x**2 + 12*x - 7, x)\n")

    b.spr('ADV', EE, 'H',
          'In the equation (2x + a)(x − 3) = 2x² + bx − 15, a and b are constants. What is the value of b?',
          '-1', [],
          'The constant terms must match: a(−3) = −15, so a = 5. Then (2x + 5)(x − 3) = 2x² − 6x + 5x − 15 = 2x² − x − 15, so b = −1.',
          X + "a, b_ = sp.symbols('a b')\nexp = sp.expand((2*x + a)*(x - 3))\na0 = sp.solve(exp.coeff(x, 0) + 15, a)[0]\nans = sp.expand((2*x + a0)*(x - 3)).coeff(x, 1)\n")

    b.mc('ADV', NR, 'H',
         'Which of the following describes the solutions to the equation √(2x + 3) = x?',
         'x = 3 is the only solution.', ['x = −1 is the only solution.', 'x = 3 and x = −1 are both solutions.', 'There are no solutions.'],
         'Squaring gives 2x + 3 = x², or (x − 3)(x + 1) = 0. Check both: √9 = 3 ✓, but √1 = 1 ≠ −1, so x = −1 is extraneous.',
         X + "ans = sp.solveset(sp.sqrt(2*x + 3) - x, x, domain=sp.S.Reals)\nassert ans == sp.FiniteSet(3)\n",
         custom="assert C[K] == 'x = 3 is the only solution.'\n")

    b.spr('ADV', NX, 'H',
          'What value of x satisfies the equation 9ˣ = 27^(x − 2)?',
          '6', [],
          'Write both sides as powers of 3: 3^(2x) = 3^(3x − 6). Equal bases, so 2x = 3x − 6 and x = 6.',
          X + "ans = sp.solve(2*x - (3*x - 6), x)[0]\nassert sp.simplify(9**ans - 27**(ans - 2)) == 0\n")

    b.mc('ADV', NS, 'H',
         'In the xy-plane, the line y = mx, where m is a positive constant, intersects the parabola y = x² + 2 at exactly one point. What is the value of m?',
         '2√2', ['√2', '4', '8'],
         'Set x² + 2 = mx: x² − mx + 2 = 0. One intersection means the discriminant is 0: m² − 8 = 0, so m = √8 = 2√2.',
         X + "m = sp.Symbol('m', positive=True)\nans = sp.solve(m**2 - 8, m)[0]\nassert len(sp.solve(x**2 + 2 - ans*x, x)) == 1\n")

    b.spr('ADV', NFQ, 'H',
          'The function f is defined by f(x) = x² + bx + c, where b and c are constants. The zeros of f are 2 and 7. What is the value of f(1)?',
          '6', [],
          'With leading coefficient 1 and zeros 2 and 7, f(x) = (x − 2)(x − 7). Then f(1) = (−1)(−6) = 6.',
          X + "f = (x - 2)*(x - 7)\nassert sp.expand(f).coeff(x, 2) == 1\nans = f.subs(x, 1)\n")

    b.mc('ADV', ER, 'H',
         'Which expression is equivalent to (x⁴ − 16)/(x² + 4)?',
         'x² − 4', ['x² + 4', 'x² − 2', '(x − 2)²'],
         'x⁴ − 16 = (x² + 4)(x² − 4), a difference of squares. Cancel x² + 4 (never 0 for real x).',
         X + "ans = sp.cancel((x**4 - 16)/(x**2 + 4))\n")

    b.spr('ADV', NFE, 'H',
          'An investment was worth $1,500 when it was made and $1,815 two years later. Its value grew by the same percent each year. By what percent did the value grow each year?',
          '10', [],
          '1,815/1,500 = 1.21 = (1.1)², so each year multiplies the value by 1.1: a 10% increase per year. (Splitting the 21% total evenly would give 10.5%, but growth compounds.)',
          "r = sp.Symbol('r', positive=True)\nfactor = sp.solve(r**2 - sp.Rational(1815, 1500), r)[0]\nans = (factor - 1) * 100\n")

    b.mc('ADV', NFC, 'H',
         'The functions f and g satisfy f(x) = 2x + 3 and f(g(x)) = 6x − 1. Which equation defines g?',
         'g(x) = 3x − 2', ['g(x) = 3x + 2', 'g(x) = 6x − 4', 'g(x) = 4x − 4'],
         'f(g(x)) = 2g(x) + 3 = 6x − 1, so 2g(x) = 6x − 4 and g(x) = 3x − 2.',
         X + "g = sp.Symbol('g')\nsol = sp.solve(2*g + 3 - (6*x - 1), g)[0]\nans = None\n",
         custom=rhs_is("3*sp.Symbol('x') - 2"))

    b.spr('ADV', NFP, 'H',
          'What is the sum of the positive solutions to the equation x⁴ − 13x² + 36 = 0?',
          '5', [],
          'Let u = x²: u² − 13u + 36 = 0, (u − 4)(u − 9) = 0. So x² = 4 or x² = 9, and the positive solutions are 2 and 3. Their sum is 5.',
          X + "ans = sum(s for s in sp.solve(x**4 - 13*x**2 + 36, x) if s > 0)\n")

    b.mc('ADV', NFQ, 'H',
         'The graph of y = f(x), where f(x) = x² + bx + c and b and c are constants, is shown. What is the value of b + c?',
         '−6', ['−10', '6', '−8'],
         'The graph crosses the x-axis at x = −4 and x = 2, so f(x) = (x + 4)(x − 2) = x² + 2x − 8. Then b + c = 2 + (−8) = −6. (−8 is c alone, read where the graph crosses the y-axis.)',
         X + "f = (x + 4)*(x - 2)\nb_, c_ = sp.expand(f).coeff(x, 1), sp.expand(f).coeff(x, 0)\nans = b_ + c_\n",
         figure={'kind': 'fgraph', 'params': {'expr': '(x + 4)*(x - 2)', 'xmin': -6, 'xmax': 4, 'ymin': -10, 'ymax': 8}})

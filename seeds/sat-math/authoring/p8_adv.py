"""SAT bank p8 — Advanced Math (ADV). 35 items (10 E / 13 M / 12 H), aimed at
the thinnest unified skills: composition (ALG2.FNC.2), transformations
(ALG1.FNC.11), absolute value (ALG1.EQV.5), rational equations (ALG2.EQV.15),
radical equations (ALG2.EQV.12), exponential equations (ALG2.EQV.16),
rational expressions (ALG2.EQV.13), and polynomial behavior (ALG2.FNC.6)."""

EE = 'Equivalent expressions'
ER = 'Equivalent expressions (rational)'
NA = 'Nonlinear equations (absolute value)'
NRAT = 'Nonlinear equations (rational)'
NR = 'Nonlinear equations (radical)'
NX = 'Nonlinear equations (exponential, equal bases)'
NQ = 'Nonlinear equations (quadratic)'
NFC = 'Nonlinear functions (composition)'
NFT = 'Nonlinear functions (transformations)'
NFP = 'Nonlinear functions (polynomial)'
NFQ = 'Nonlinear functions (quadratic)'
NFE = 'Nonlinear functions (exponential)'

X = "x = sp.Symbol('x')\n"


def rhs_is(expr_src):
    return (f"_ok = [c for c in C if sp.simplify(P(c.split('=', 1)[1]) - ({expr_src})) == 0]\n"
            "assert _ok == [C[K]], _ok\n")


def add(b):
    # ── Easy (10) ────────────────────────────────────────────────────
    b.mc('ADV', NFC, 'E',
         'The functions f and g are defined by f(x) = x + 5 and g(x) = 2x. What is the value of f(g(3))?',
         '11', ['16', '10', '8'],
         'Inside first: g(3) = 6. Then f(6) = 6 + 5 = 11. (16 is g(f(3)) = g(8), the other order.)',
         X + "f = x + 5\ng = 2*x\nans = f.subs(x, g.subs(x, 3))\nassert g.subs(x, f.subs(x, 3)) == 16\n")

    b.mc('ADV', NFT, 'E',
         'The function f is defined by f(x) = x². The graph of y = g(x) is the graph of y = f(x) shifted up 4 units. Which equation defines g?',
         'g(x) = x² + 4', ['g(x) = (x + 4)²', 'g(x) = (x − 4)²', 'g(x) = 4x²'],
         'Shifting up adds to the output: g(x) = f(x) + 4 = x² + 4. ((x + 4)² would shift the graph left 4.)',
         X + "ans = None\n",
         custom=rhs_is("sp.Symbol('x')**2 + 4"))

    b.spr('ADV', NA, 'E',
          'What is the positive solution to the equation |x − 2| = 5?',
          '7', [],
          'x − 2 = 5 gives x = 7, and x − 2 = −5 gives x = −3. The positive solution is 7.',
          X + "ans = max(sp.solve(x - 2 - 5, x) + sp.solve(x - 2 + 5, x))\n")

    b.spr('ADV', NR, 'E',
          'What value of x satisfies the equation 3 + √x = 8?',
          '25', [],
          'Subtract 3: √x = 5. Square both sides: x = 25. Check: 3 + √25 = 8.',
          X + "ans = sp.solve(sp.sqrt(x) + 3 - 8, x)[0]\n")

    b.mc('ADV', NX, 'E',
         'What value of x satisfies the equation 3ˣ = 81?',
         '4', ['27', '3', '9'],
         '81 = 3 · 3 · 3 · 3 = 3⁴, so x = 4. (27 divides 81 by 3.)',
         X + "ans = sp.solve(3**x - 81, x)[0]\n")

    b.mc('ADV', ER, 'E',
         'For x ≠ 0, which expression is equivalent to (6x²)/(3x)?',
         '2x', ['3x', '2x²', '18x³'],
         'Divide the coefficients (6/3 = 2) and subtract exponents (x²/x = x): 2x.',
         X + "ans = sp.cancel(6*x**2/(3*x))\n")

    b.mc('ADV', NFP, 'E',
         'The polynomial p is defined by p(x) = (x − 1)(x + 4)(x − 6). Which of the following is a zero of p?',
         '6', ['−6', '4', '−1'],
         'p(x) = 0 when one factor is 0: x = 1, x = −4, or x = 6. Of the choices, only 6 is a zero. (The factor x + 4 gives −4, not 4.)',
         X + "ans = None\n",
         custom="x = sp.Symbol('x')\np = (x - 1)*(x + 4)*(x - 6)\nassert [c for c in C if p.subs(x, P(c)) == 0] == [C[K]]\n")

    b.mc('ADV', NRAT, 'E',
         'What value of x satisfies the equation 12/x = 3?',
         '4', ['36', '9', '1/4'],
         'Multiply both sides by x: 12 = 3x, so x = 4. (36 multiplies 12 by 3.)',
         X + "ans = sp.solve(12/x - 3, x)[0]\n")

    b.mc('ADV', NFQ, 'E',
         'The graph of the quadratic function f is shown. What is the maximum value of f(x)?',
         '6', ['2', '−2', '4'],
         'The parabola opens downward, and its highest point, the vertex, is at (2, 6). The maximum value is 6. (2 is where it occurs.)',
         X + "f = -(x - 2)**2 + 6\nans = sp.maximum(f, x)\n",
         figure={'kind': 'fgraph', 'params': {'expr': '-(x - 2)**2 + 6', 'xmin': -1, 'xmax': 5, 'ymin': -4, 'ymax': 8}})

    b.mc('ADV', NFE, 'E',
         'A number starts at 5 and doubles every week. What is the number after 4 weeks?',
         '80', ['40', '20', '160'],
         '5 → 10 → 20 → 40 → 80: four doublings, or 5 · 2⁴ = 80. (40 stops one doubling short.)',
         "ans = 5 * 2**4\n")

    # ── Medium (13) ──────────────────────────────────────────────────
    b.mc('ADV', NFC, 'M',
         'The functions f and g are defined by f(x) = x² − 1 and g(x) = x + 2. Which expression is equivalent to f(g(x))?',
         'x² + 4x + 3', ['x² + 1', 'x² + 3', 'x² + 2x + 3'],
         'f(g(x)) = (x + 2)² − 1 = x² + 4x + 4 − 1 = x² + 4x + 3.',
         X + "ans = sp.expand((x + 2)**2 - 1)\n")

    b.mc('ADV', NFT, 'M',
         'The graph of y = f(x) is shown. The function g is defined by g(x) = f(x + 3). What are the coordinates of the vertex of the graph of y = g(x)?',
         '(−1, −4)', ['(5, −4)', '(2, −1)', '(2, −7)'],
         'The vertex of the graph shown is (2, −4). Replacing x with x + 3 shifts the graph 3 units LEFT, so the vertex moves to (−1, −4). ((5, −4) shifts it the wrong way.)',
         X + "f = (x - 2)**2 - 4\ng = f.subs(x, x + 3)\nh = sp.solve(sp.diff(g, x), x)[0]\nassert (h, g.subs(x, h)) == (-1, -4)\nans = None\n",
         custom="assert C[K] == '(−1, −4)' and len(set(C)) == 4\n",
         figure={'kind': 'fgraph', 'params': {'expr': '(x - 2)**2 - 4', 'xmin': -1, 'xmax': 5, 'ymin': -6, 'ymax': 6}})

    b.spr('ADV', NA, 'M',
          'What is the sum of the solutions to the equation |3x + 2| = 7?',
          '-4/3', ['-1.333'],
          '3x + 2 = 7 gives x = 5/3, and 3x + 2 = −7 gives x = −3. Their sum is 5/3 − 3 = −4/3.',
          X + "ans = sum(sp.solve(3*x + 2 - 7, x) + sp.solve(3*x + 2 + 7, x))\n",
          tol=1e-3)

    b.spr('ADV', NR, 'M',
          'What is the solution to the equation √(2x + 1) = x − 1?',
          '4', [],
          'Square: 2x + 1 = x² − 2x + 1, so x² − 4x = 0 and x = 0 or x = 4. Check: √9 = 3 = 4 − 1 ✓, but √1 = 1 ≠ 0 − 1, so 0 is extraneous.',
          X + "s = sp.solveset(sp.sqrt(2*x + 1) - (x - 1), x, domain=sp.S.Reals)\nassert s == sp.FiniteSet(4)\nans = 4\n")

    b.spr('ADV', NX, 'M',
          'What value of x satisfies the equation 2^(x − 1) = 8ˣ?',
          '-1/2', ['-.5', '-0.5'],
          'Write 8ˣ as 2^(3x). Equal bases, so x − 1 = 3x, which gives 2x = −1 and x = −1/2.',
          X + "ans = sp.solve(x - 1 - 3*x, x)[0]\nassert sp.simplify(2**(ans - 1) - 8**ans) == 0\n")

    b.mc('ADV', ER, 'M',
         'For x ≠ −1, which expression is equivalent to (x² − 1)/(x² + 2x + 1)?',
         '(x − 1)/(x + 1)', ['(x + 1)/(x − 1)', '−1', '1/(x + 1)'],
         'Factor: (x + 1)(x − 1) over (x + 1)². Cancel one factor of x + 1: (x − 1)/(x + 1).',
         X + "ans = sp.cancel((x**2 - 1)/(x**2 + 2*x + 1))\n")

    b.spr('ADV', NRAT, 'M',
          'What value of x satisfies the equation 3/(x + 1) = 2/(x − 1)?',
          '5', [],
          'Cross-multiply: 3(x − 1) = 2(x + 1), so 3x − 3 = 2x + 2 and x = 5. It does not make either denominator 0.',
          X + "s = sp.solveset(3/(x + 1) - 2/(x - 1), x, domain=sp.S.Reals)\nassert s == sp.FiniteSet(5)\nans = 5\n")

    b.mc('ADV', NFP, 'M',
         'The polynomial p is defined by p(x) = −2x³ + 5x − 1. As x increases without bound, which statement describes p(x)?',
         'It decreases without bound.', ['It increases without bound.', 'It approaches −1.', 'It approaches 0.'],
         'For large x the leading term −2x³ dominates, and it becomes a huge negative number: p(x) decreases without bound.',
         X + "p = -2*x**3 + 5*x - 1\nassert sp.limit(p, x, sp.oo) == -sp.oo\nans = None\n",
         custom="assert C[K] == 'It decreases without bound.'\n")

    b.mc('ADV', NFC, 'M',
         'The function f is defined by f(x) = 2x + 1. Which expression is equivalent to f(f(x))?',
         '4x + 3', ['4x + 1', '2x + 2', '4x² + 1'],
         'f(f(x)) = 2(2x + 1) + 1 = 4x + 2 + 1 = 4x + 3.',
         X + "f = 2*x + 1\nans = sp.expand(f.subs(x, f))\n")

    b.mc('ADV', NFT, 'M',
         'The function f is defined by f(x) = x² − 3. The function g is defined by g(x) = −f(x). What is the value of g(2)?',
         '−1', ['1', '−7', '7'],
         'f(2) = 4 − 3 = 1, so g(2) = −f(2) = −1. (The graph of g is the graph of f reflected across the x-axis.)',
         X + "f = x**2 - 3\nans = -f.subs(x, 2)\n")

    b.mc('ADV', NA, 'M',
         'Which of the following is equivalent to the inequality |x − 5| ≤ 3?',
         '2 ≤ x ≤ 8', ['−8 ≤ x ≤ −2', 'x ≤ 8', 'x ≤ 2 or x ≥ 8'],
         '|x − 5| ≤ 3 means x is within 3 of 5: −3 ≤ x − 5 ≤ 3, so 2 ≤ x ≤ 8.',
         X + "sol = sp.solve_univariate_inequality(sp.Abs(x - 5) <= 3, x, relational=False)\nans = None\n",
         custom="oo = sp.oo\nopts = {'2 ≤ x ≤ 8': sp.Interval(2, 8), '−8 ≤ x ≤ −2': sp.Interval(-8, -2), 'x ≤ 8': sp.Interval(-oo, 8), 'x ≤ 2 or x ≥ 8': sp.Union(sp.Interval(-oo, 2), sp.Interval(8, oo))}\n"
                "assert [c for c in C if opts[c] == sol] == [C[K]]\n")

    b.mc('ADV', NFQ, 'M',
         'The function f is defined by f(x) = (x − 3)(x + 5). For what value of x does f(x) reach its minimum?',
         '−1', ['−15', '−16', '1'],
         'The minimum of a parabola is halfway between its zeros, 3 and −5: x = (3 + (−5))/2 = −1. (−16 is the minimum value, f(−1).)',
         X + "f = (x - 3)*(x + 5)\nans = sp.solve(sp.diff(f, x), x)[0]\nassert f.subs(x, ans) == -16\n")

    b.spr('ADV', NFE, 'M',
          'The function P(t) = 2,000(0.85)ᵗ models a quantity t years after a study began. By what percent does the quantity decrease each year?',
          '15', [],
          'Each year multiplies the quantity by 0.85, keeping 85% of it, so it decreases by 100% − 85% = 15%.',
          "ans = (1 - sp.Rational(85, 100)) * 100\n")

    # ── Hard (12) ────────────────────────────────────────────────────
    b.spr('ADV', NFC, 'H',
          'The functions f and g are defined by f(x) = x² + 1 and g(x) = √(x − 1) for x ≥ 1. What is the value of f(g(10))?',
          '10', [],
          'g(10) = √9 = 3, and f(3) = 9 + 1 = 10. (In fact f(g(x)) = x for every x ≥ 1: g undoes the "+1 then square" of f.)',
          X + "f = x**2 + 1\ng = sp.sqrt(x - 1)\nans = f.subs(x, g.subs(x, 10))\n")

    b.mc('ADV', NFT, 'H',
         'The function f is defined by f(x) = 2ˣ. The graph of y = g(x) is the graph of y = f(x) reflected across the x-axis and then shifted up 3 units. What is the value of g(0)?',
         '2', ['4', '−2', '3'],
         'Reflecting across the x-axis gives −2ˣ; shifting up 3 gives g(x) = −2ˣ + 3. Then g(0) = −1 + 3 = 2. (4 shifts f up without reflecting it.)',
         X + "g = -2**x + 3\nans = g.subs(x, 0)\n")

    b.mc('ADV', NA, 'H',
         'How many real solutions does the equation |x² − 4| = 5 have?',
         '2', ['0', '1', '4'],
         'x² − 4 = 5 gives x = 3 or x = −3. x² − 4 = −5 gives x² = −1, which has no real solutions. So there are 2.',
         X + "s = sp.solveset(sp.Abs(x**2 - 4) - 5, x, domain=sp.S.Reals)\nans = len(s)\n")

    b.spr('ADV', NR, 'H',
          'What value of x satisfies the equation √(x + 6) − √x = 2?',
          '1/4', ['.25', '0.25'],
          'Write √(x + 6) = 2 + √x and square: x + 6 = 4 + 4√x + x, so 4√x = 2 and √x = 1/2, x = 1/4. Check: √6.25 − √0.25 = 2.5 − 0.5 = 2 ✓.',
          X + "s = sp.solveset(sp.sqrt(x + 6) - sp.sqrt(x) - 2, x, domain=sp.S.Reals)\nassert s == sp.FiniteSet(sp.Rational(1, 4))\nans = sp.Rational(1, 4)\n")

    b.spr('ADV', NX, 'H',
          'What value of x satisfies the equation 5^(2x) · 25 = 125ˣ?',
          '2', [],
          'Write everything as powers of 5: 5^(2x) · 5² = 5^(3x), so 2x + 2 = 3x and x = 2.',
          X + "ans = sp.solve(2*x + 2 - 3*x, x)[0]\nassert 5**(2*ans) * 25 == 125**ans\n")

    b.mc('ADV', ER, 'H',
         'For x ≠ 0 and x ≠ −2, which expression is equivalent to 1/x − 1/(x + 2)?',
         '2/(x(x + 2))', ['2/(x + 2)', '1/(x(x + 2))', '−2/(x(x + 2))'],
         'Over the common denominator x(x + 2): (x + 2 − x)/(x(x + 2)) = 2/(x(x + 2)).',
         X + "ans = sp.together(1/x - 1/(x + 2))\n")

    b.mc('ADV', NRAT, 'H',
         'x/(x − 3) + 2 = 3/(x − 3)\nWhich of the following describes the solutions to the equation above?',
         'There are no solutions.', ['x = 3 is the only solution.', 'x = 1 is the only solution.', 'x = −3 is the only solution.'],
         'Multiply by x − 3: x + 2(x − 3) = 3, so 3x = 9 and x = 3. But x = 3 makes the denominators 0, so it is extraneous: no solutions.',
         X + "s = sp.solveset(x/(x - 3) + 2 - 3/(x - 3), x, domain=sp.S.Reals)\nassert s == sp.S.EmptySet\nans = None\n",
         custom="assert C[K] == 'There are no solutions.'\n")

    b.spr('ADV', NFP, 'H',
          'What is the remainder when the polynomial p(x) = x³ − 4x² + x + 5 is divided by x − 3?',
          '-1', [],
          'By the remainder theorem the remainder is p(3) = 27 − 36 + 3 + 5 = −1.',
          X + "p = x**3 - 4*x**2 + x + 5\nans = sp.rem(p, x - 3, x)\nassert ans == p.subs(x, 3)\n")

    b.mc('ADV', NFP, 'H',
         'The graph of the polynomial function y = f(x) is shown. How many distinct real zeros does f have?',
         '2', ['1', '3', '0'],
         'The graph meets the x-axis at x = 0, where it crosses, and at x = 3, where it touches and turns back. That is 2 distinct zeros (3 is a repeated zero).',
         X + "f = x*(x - 3)**2\nans = len(set(sp.solve(f, x)))\n",
         figure={'kind': 'fgraph', 'params': {'expr': 'x*(x - 3)**2', 'xmin': -1, 'xmax': 5, 'ymin': -4, 'ymax': 8}})

    b.mc('ADV', NFE, 'H',
         'Two functions model the value of two investments t years from now: A(t) = 100(1.1)ᵗ and B(t) = 150 + 10t. Which statement about their values at t = 10 is true?',
         'A(10) is greater than B(10).', ['B(10) is greater than A(10).', 'A(10) and B(10) are equal.', 'A(10) is less than 200.'],
         'A(10) = 100(1.1)¹⁰ ≈ 259.4, and B(10) = 150 + 100 = 250. A is greater, though B started higher: growth that compounds eventually overtakes growth that adds a fixed amount.',
         "A10 = 100 * sp.Rational(11, 10)**10\nB10 = 150 + 10*10\nassert A10 > B10 and A10 > 200\nans = None\n",
         custom="assert C[K] == 'A(10) is greater than B(10).'\n")

    b.spr('ADV', NFQ, 'H',
          'The graph of y = a(x − 2)² + 5, where a is a constant, passes through the point (4, −3). What is the value of a?',
          '-2', [],
          'Substitute (4, −3): −3 = a(2)² + 5, so 4a = −8 and a = −2.',
          "a = sp.Symbol('a')\nans = sp.solve(a*(4 - 2)**2 + 5 + 3, a)[0]\n")

    b.mc('ADV', NA, 'H',
         'What is the sum of all solutions to the equation |2x − 1| = x + 4?',
         '4', ['5', '−1', '6'],
         '2x − 1 = x + 4 gives x = 5. 2x − 1 = −(x + 4) gives 3x = −3, x = −1. Both check (|9| = 9 and |−3| = 3), so the sum is 4.',
         X + "s = sp.solveset(sp.Abs(2*x - 1) - (x + 4), x, domain=sp.S.Reals)\nassert s == sp.FiniteSet(5, -1)\nans = sum(s)\n")

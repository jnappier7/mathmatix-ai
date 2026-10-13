"""SAT bank p7 — Advanced Math (ADV). 34 items (10 E / 12 M / 12 H). Graphs
are needed to answer and read on gridlines."""

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
NFT = 'Nonlinear functions (transformations)'

X = "x = sp.Symbol('x')\n"


def rhs_is(expr_src):
    return (f"_ok = [c for c in C if sp.simplify(P(c.split('=', 1)[1]) - ({expr_src})) == 0]\n"
            "assert _ok == [C[K]], _ok\n")


def fits(points_src):
    """Custom check: the key is the ONE choice whose function passes through every (x, y) in points_src."""
    return ("x = sp.Symbol('x')\nT = lambda c: sp.parsing.sympy_parser.parse_expr(c.split('=', 1)[1].replace('ˣ', '**x').replace('−', '-'), local_dict={'x': x}, transformations=_T)\n"
            f"pts = {points_src}\n_ok = [c for c in C if all(sp.simplify(T(c).subs(x, a) - v) == 0 for a, v in pts)]\nassert _ok == [C[K]], _ok\n")


def add(b):
    # ── Easy (10) ────────────────────────────────────────────────────
    b.mc('ADV', EE, 'E',
         'Which expression is equivalent to (x − 6)(x + 2)?',
         'x² − 4x − 12', ['x² + 4x − 12', 'x² − 12', 'x² − 8x − 12'],
         'x · x = x²; the middle terms 2x − 6x = −4x; and −6 · 2 = −12.',
         X + "ans = sp.expand((x - 6)*(x + 2))\n")

    b.spr('ADV', NFQ, 'E',
          'The function f is defined by f(x) = x² + 3x. What is the value of f(2)?',
          '10', [],
          'f(2) = 2² + 3(2) = 4 + 6 = 10.',
          X + "ans = (x**2 + 3*x).subs(x, 2)\n")

    b.mc('ADV', NQ, 'E',
         'What is the positive solution to the equation 2x² = 50?',
         '5', ['25', '10', '√48'],
         'Divide by 2: x² = 25, so x = 5 (the positive root). (25 is x², not x.)',
         X + "ans = [s for s in sp.solve(2*x**2 - 50, x) if s > 0][0]\n")

    b.mc('ADV', EE, 'E',
         'Which of the following is a factored form of x² − 9x + 20?',
         '(x − 4)(x − 5)', ['(x + 4)(x + 5)', '(x − 2)(x − 10)', '(x − 4)(x + 5)'],
         'Find two numbers that multiply to 20 and add to −9: −4 and −5.',
         X + "ans = x**2 - 9*x + 20\n")

    b.mc('ADV', EX, 'E',
         'Which expression is equivalent to (2x³)²?',
         '4x⁶', ['2x⁶', '4x⁵', '2x⁹'],
         'Square each factor: 2² = 4 and (x³)² = x⁶ (a power of a power multiplies the exponents).',
         X + "ans = (2*x**3)**2\n")

    b.mc('ADV', NFQ, 'E',
         'The graph of the quadratic function f is shown. What is the y-intercept of the graph?',
         '2', ['−2', '4', '0'],
         'The graph crosses the y-axis at (0, 2), so the y-intercept is 2. (−2 is the minimum value, at x = 2.)',
         X + "f = x**2 - 4*x + 2\nans = f.subs(x, 0)\n",
         figure={'kind': 'fgraph', 'params': {'expr': 'x**2 - 4*x + 2', 'xmin': -1, 'xmax': 5, 'ymin': -4, 'ymax': 8}})

    b.mc('ADV', NFE, 'E',
         'The function h is defined by h(x) = 3 · 5ˣ. What is the value of h(2)?',
         '75', ['30', '225', '45'],
         'h(2) = 3 · 5² = 3 · 25 = 75. (225 is 15², which multiplies before applying the exponent.)',
         X + "ans = (3*5**x).subs(x, 2)\n")

    b.spr('ADV', NR, 'E',
          'What value of x satisfies the equation 2√(x − 2) = 6?',
          '11', [],
          'Divide by 2: √(x − 2) = 3. Square: x − 2 = 9, so x = 11. Check: 2√9 = 6.',
          X + "ans = sp.solve(2*sp.sqrt(x - 2) - 6, x)[0]\n")

    b.mc('ADV', NQ, 'E',
         'What is the negative solution to the equation x² + 1 = 26?',
         '−5', ['5', '−13', '−25'],
         'Subtract 1: x² = 25, so x = 5 or x = −5. The negative solution is −5.',
         X + "ans = [s for s in sp.solve(x**2 + 1 - 26, x) if s < 0][0]\n")

    b.mc('ADV', EE, 'E',
         'Which expression is equivalent to 5x² − 20?',
         '5(x + 2)(x − 2)', ['5(x − 2)²', '(5x + 2)(x − 10)', '5(x² − 4x)'],
         'Factor out 5: 5(x² − 4). Then x² − 4 is a difference of squares: 5(x + 2)(x − 2).',
         X + "ans = 5*x**2 - 20\n")

    # ── Medium (12) ──────────────────────────────────────────────────
    b.mc('ADV', NFQ, 'M',
         'The function f is defined by f(x) = −3(x + 1)² + 12. For what value of x does f(x) reach its maximum?',
         '−1', ['1', '12', '−3'],
         'The squared term is never positive, so f is largest when x + 1 = 0, at x = −1. (12 is the maximum VALUE, not where it occurs.)',
         X + "f = -3*(x + 1)**2 + 12\nans = sp.solve(sp.diff(f, x), x)[0]\n")

    b.spr('ADV', NQ, 'M',
          'What is the negative solution to the equation x² + 4x − 21 = 0?',
          '-7', [],
          'Factor: (x + 7)(x − 3) = 0, so x = −7 or x = 3. The negative solution is −7.',
          X + "ans = [s for s in sp.solve(x**2 + 4*x - 21, x) if s < 0][0]\n")

    b.mc('ADV', ER, 'M',
         'For x ≠ 0, x ≠ 4, and x ≠ −4, which expression is equivalent to (x² − 4x)/(x² − 16)?',
         'x/(x + 4)', ['x/(x − 4)', '(x − 4)/(x + 4)', '1/(x + 4)'],
         'Factor: x(x − 4) over (x + 4)(x − 4). Cancel x − 4 to get x/(x + 4).',
         X + "ans = sp.cancel((x**2 - 4*x)/(x**2 - 16))\n")

    b.spr('ADV', NFE, 'M',
          'A 2-gram sample of a substance has a half-life of 6 hours: every 6 hours, half of what remains decays. How many grams of the sample remain after 18 hours?',
          '.25', ['1/4', '0.25'],
          '18 hours is 3 half-lives: 2 → 1 → 0.5 → 0.25 grams.',
          "ans = 2 * sp.Rational(1, 2)**(18 // 6)\n")

    b.mc('ADV', NQ, 'M',
         'How many distinct real solutions does the equation 4x² − 12x + 9 = 0 have?',
         'Exactly one', ['Zero', 'Exactly two', 'Infinitely many'],
         'The discriminant is (−12)² − 4(4)(9) = 144 − 144 = 0, so there is exactly one real solution: 4x² − 12x + 9 = (2x − 3)², which is 0 only at x = 3/2.',
         X + "assert sp.discriminant(4*x**2 - 12*x + 9, x) == 0 and len(sp.solveset(4*x**2 - 12*x + 9, x, domain=sp.S.Reals)) == 1\nans = None\n",
         custom="assert C[K] == 'Exactly one'\n")

    b.spr('ADV', NFC, 'M',
          'The functions f and g are defined by f(x) = 3x − 1 and g(x) = x². What is the value of f(g(−2))?',
          '11', [],
          'g(−2) = (−2)² = 4. Then f(4) = 3(4) − 1 = 11.',
          X + "f = 3*x - 1\ng = x**2\nans = f.subs(x, g.subs(x, -2))\n")

    b.mc('ADV', NFE, 'M',
         'The graph of the exponential function f is shown. Which equation defines f?',
         'f(x) = 16(1/2)ˣ', ['f(x) = 16(2)ˣ', 'f(x) = 8(1/2)ˣ', 'f(x) = 16 − 8x'],
         'The graph passes through (0, 16), (1, 8), (2, 4), and (3, 2): it starts at 16 and halves with each step of 1. (16 − 8x matches the first two points but reaches 0 at x = 2, where the graph is at 4.)',
         X + "ans = None\n",
         custom=fits("[(0, 16), (1, 8), (2, 4), (3, 2)]"),
         figure={'kind': 'fgraph', 'params': {'expr': '16*0.5**x', 'xmin': -1, 'xmax': 5, 'ymin': -1, 'ymax': 17}})

    b.spr('ADV', NR, 'M',
          'What is the solution to the equation √(x + 7) = x − 5?',
          '9', [],
          'Square: x + 7 = x² − 10x + 25, so x² − 11x + 18 = 0 and x = 9 or x = 2. Check: √16 = 4 = 9 − 5 ✓, but √9 = 3 ≠ 2 − 5, so 2 is extraneous.',
          X + "s = sp.solveset(sp.sqrt(x + 7) - (x - 5), x, domain=sp.S.Reals)\nassert s == sp.FiniteSet(9)\nans = 9\n")

    b.mc('ADV', EX, 'M',
         'For x > 0, which expression is equivalent to (x^(1/2))⁶?',
         'x³', ['x^(1/3)', 'x⁶', 'x^(13/2)'],
         'A power of a power multiplies the exponents: (1/2)(6) = 3.',
         "x = sp.Symbol('x', positive=True)\nans = (x**sp.Rational(1, 2))**6\n",
         custom="x = sp.Symbol('x', positive=True)\nT = lambda c: sp.parsing.sympy_parser.parse_expr(c.replace('³', '**3').replace('⁶', '**6').replace('^', '**'), local_dict={'x': x}, transformations=_T)\n"
                "assert [c for c in C if sp.simplify(T(c) - ans) == 0] == [C[K]]\n")

    b.mc('ADV', NS, 'M',
         'y = x² − 4\ny = −2x + 4\nThe graphs of the equations above intersect at two points. What is the product of the x-coordinates of the two points?',
         '−8', ['−2', '8', '2'],
         'Set x² − 4 = −2x + 4: x² + 2x − 8 = 0, (x + 4)(x − 2) = 0. The x-coordinates are −4 and 2; their product is −8.',
         X + "r = sp.solve(x**2 - 4 - (-2*x + 4), x)\nans = r[0]*r[1]\n")

    b.spr('ADV', NFP, 'M',
          'The polynomial p is defined by p(x) = x³ − 2x² + kx − 6, where k is a constant. If p(3) = 0, what is the value of k?',
          '-1', [],
          'p(3) = 27 − 18 + 3k − 6 = 3 + 3k. Setting it to 0 gives k = −1.',
          X + "k = sp.Symbol('k')\nans = sp.solve((x**3 - 2*x**2 + k*x - 6).subs(x, 3), k)[0]\n")

    b.mc('ADV', NA, 'M',
         'Which of the following values of x satisfies the inequality |x + 3| < 5?',
         '0', ['2', '−8', '5'],
         '|x + 3| < 5 means −5 < x + 3 < 5, or −8 < x < 2. Only 0 is strictly between −8 and 2.',
         "ans = None\n",
         custom="_ok = [c for c in C if abs(P(c) + 3) < 5]\nassert _ok == [C[K]], _ok\n")

    # ── Hard (12) ────────────────────────────────────────────────────
    b.spr('ADV', NFQ, 'H',
          'The function f is defined by f(x) = ax² + 4x + 1, where a is a nonzero constant. The graph of y = f(x) touches the x-axis at exactly one point. What is the value of a?',
          '4', [],
          'One x-intercept means the discriminant is 0: 4² − 4(a)(1) = 0, so 16 = 4a and a = 4.',
          "a = sp.Symbol('a')\nans = sp.solve(16 - 4*a, a)[0]\n")

    b.spr('ADV', NQ, 'H',
          'What is the sum of the solutions to the equation 2x² − 7x + 3 = 0?',
          '7/2', ['3.5'],
          'Factor: (2x − 1)(x − 3) = 0, so x = 1/2 or x = 3. Their sum is 7/2. (In general the sum is −b/a = 7/2.)',
          X + "ans = sum(sp.solve(2*x**2 - 7*x + 3, x))\n")

    b.mc('ADV', ER, 'H',
         'For all values of x for which it is defined, which expression is equivalent to [(x² − x − 6)/(x² − 9)] · [(x + 3)/(x + 2)]?',
         '1', ['x − 3', '(x + 3)/(x − 3)', 'x + 2'],
         'x² − x − 6 = (x − 3)(x + 2) and x² − 9 = (x − 3)(x + 3). Every factor cancels: (x − 3)(x + 2)(x + 3) / [(x − 3)(x + 3)(x + 2)] = 1.',
         X + "ans = sp.cancel((x**2 - x - 6)/(x**2 - 9) * (x + 3)/(x + 2))\n")

    b.spr('ADV', NFE, 'H',
          'A population grows by 20% each year. After how many full years does the population first become more than double its starting size?',
          '4', [],
          'Each year multiplies the size by 1.2: 1.2² = 1.44, 1.2³ = 1.728, and 1.2⁴ = 2.0736 — the first power above 2.',
          "ans = min(n for n in range(1, 50) if sp.Rational(6, 5)**n > 2)\n")

    b.mc('ADV', NFQ, 'H',
         'Which equation is equivalent to y = 2x² − 12x + 23 and shows the vertex of its graph?',
         'y = 2(x − 3)² + 5', ['y = 2(x − 3)² + 23', 'y = 2(x + 3)² + 5', 'y = (2x − 3)² + 5'],
         '2x² − 12x + 23 = 2(x² − 6x) + 23 = 2(x² − 6x + 9) − 18 + 23 = 2(x − 3)² + 5. The vertex is (3, 5).',
         X + "ans = None\n",
         custom=rhs_is("2*sp.Symbol('x')**2 - 12*sp.Symbol('x') + 23"))

    b.mc('ADV', NS, 'H',
         'In the xy-plane, the horizontal line y = k intersects the graph of y = x² − 6x + 10 at exactly one point. What is the value of k?',
         '1', ['3', '10', '−1'],
         'A horizontal line meets a parabola at one point only at its vertex. The vertex is at x = 3, where y = 9 − 18 + 10 = 1.',
         X + "k = sp.Symbol('k')\nans = sp.solve(sp.discriminant(x**2 - 6*x + 10 - k, x), k)[0]\n")

    b.mc('ADV', NFT, 'H',
         'The function f satisfies f(x + 2) = x² + 4x + 7 for all x. Which equation defines f?',
         'f(x) = x² + 3', ['f(x) = x² + 4x + 3', 'f(x) = x² + 7', 'f(x) = x² + 8x + 19'],
         'Let t = x + 2, so x = t − 2: f(t) = (t − 2)² + 4(t − 2) + 7 = t² − 4t + 4 + 4t − 8 + 7 = t² + 3.',
         X + "t = sp.Symbol('t')\nans = None\n",
         custom=rhs_is("sp.expand((sp.Symbol('x') - 2)**2 + 4*(sp.Symbol('x') - 2) + 7)"))

    b.spr('ADV', NE, 'H',
          'What value of x satisfies the equation 6/(x² − 1) = 1/(x − 1) + 1/(x + 1)?',
          '3', [],
          'Over the common denominator x² − 1 the right side is (x + 1 + x − 1)/(x² − 1) = 2x/(x² − 1). So 2x = 6 and x = 3, which does not make any denominator 0.',
          X + "s = sp.solveset(6/(x**2 - 1) - 1/(x - 1) - 1/(x + 1), x, domain=sp.S.Reals)\nassert s == sp.FiniteSet(3)\nans = 3\n")

    b.mc('ADV', NX, 'H',
         'What value of x satisfies the equation 2ˣ · 4ˣ = 64?',
         '2', ['3', '6', '1'],
         '4ˣ = 2^(2x), so the left side is 2^(3x). 64 = 2⁶, so 3x = 6 and x = 2.',
         X + "ans = sp.solve(3*x - 6, x)[0]\nassert 2**ans * 4**ans == 64\n")

    b.mc('ADV', NFP, 'H',
         'The graph of the polynomial function f, where f(x) = (x − a)(x − b)(x − c) for constants a, b, and c, is shown. What is the value of a + b + c?',
         '2', ['6', '0', '−2'],
         'The graph crosses the x-axis at x = −2, x = 1, and x = 3, so a, b, and c are −2, 1, and 3, with sum 2. (6 is f(0), where the graph crosses the y-axis.)',
         X + "f = (x + 2)*(x - 1)*(x - 3)\nr = sp.solve(f, x)\nassert f.subs(x, 0) == 6\nans = sum(r)\n",
         figure={'kind': 'fgraph', 'params': {'expr': '(x + 2)*(x - 1)*(x - 3)', 'xmin': -3, 'xmax': 4, 'ymin': -10, 'ymax': 10}})

    b.mc('ADV', ER, 'H',
         'For which values of x is the expression (x + 1)/(x² − 4x − 5) undefined?',
         'x = 5 and x = −1', ['x = 5 only', 'x = −1 only', 'x = −5 and x = 1'],
         'The expression is undefined where the denominator is 0: x² − 4x − 5 = (x − 5)(x + 1) = 0 at x = 5 and x = −1. (Canceling x + 1 does not make x = −1 allowed.)',
         X + "ans = set(sp.solve(x**2 - 4*x - 5, x))\nassert ans == {5, -1}\n",
         custom="assert C[K] == 'x = 5 and x = −1'\n")

    b.mc('ADV', NFT, 'H',
         'The function f is defined by f(x) = x², and g(x) = f(x − 3) + 2. What are the coordinates of the vertex of the graph of y = g(x) in the xy-plane?',
         '(3, 2)', ['(−3, 2)', '(3, −2)', '(2, 3)'],
         'g(x) = (x − 3)² + 2: the graph of f shifted 3 units right and 2 units up, so the vertex moves from (0, 0) to (3, 2).',
         X + "g = (x - 3)**2 + 2\nh = sp.solve(sp.diff(g, x), x)[0]\nassert (h, g.subs(x, h)) == (3, 2)\nans = None\n",
         custom="assert C[K] == '(3, 2)' and len(set(C)) == 4\n")

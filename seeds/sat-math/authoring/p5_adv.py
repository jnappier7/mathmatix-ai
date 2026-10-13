"""SAT bank p5 — Advanced Math (ADV). 28 items, weighted EASY (10 E / 12 M / 6 H)."""

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

X = "x = sp.Symbol('x')\n"


def add(b):
    # ── Easy (10) ────────────────────────────────────────────────────
    b.mc('ADV', EE, 'E',
         'Which expression is equivalent to (x + 3)(x − 3)?',
         'x² − 9', ['x² + 9', 'x² − 6x − 9', 'x² − 6'],
         'This is a difference of squares: (x + 3)(x − 3) = x² − 3x + 3x − 9 = x² − 9.',
         X + "ans = sp.expand((x + 3)*(x - 3))\n")

    b.mc('ADV', EE, 'E',
         'Which expression is equivalent to 3x(2x − 5)?',
         '6x² − 15x', ['6x² − 5', '5x² − 15x', '6x − 15x²'],
         'Multiply 3x by each term: 3x · 2x = 6x² and 3x · (−5) = −15x.',
         X + "ans = sp.expand(3*x*(2*x - 5))\n")

    b.mc('ADV', NFQ, 'E',
         'The function f is defined by f(x) = x² − 4x. What is the value of f(5)?',
         '5', ['45', '−5', '1'],
         'f(5) = 5² − 4(5) = 25 − 20 = 5.',
         X + "ans = (x**2 - 4*x).subs(x, 5)\n")

    b.mc('ADV', NQ, 'E',
         'What is the positive solution to the equation x² = 49?',
         '7', ['49', '24.5', '14'],
         'x = 7 and x = −7 both satisfy x² = 49; the positive one is 7. (24.5 divides by 2 instead of taking the square root.)',
         X + "ans = [s for s in sp.solve(x**2 - 49, x) if s > 0][0]\n")

    b.mc('ADV', NFE, 'E',
         'The function V(t) = 200(1.05)ᵗ gives the value, in dollars, of an investment t years after it was made. What does the number 200 represent?',
         'The value of the investment when it was made',
         ['The amount the value increases each year', 'The value of the investment after 1 year', 'The percent the value increases each year'],
         'At t = 0, (1.05)⁰ = 1, so V(0) = 200: the starting value. The growth is 5% per year, which comes from the 1.05.',
         "t = sp.Symbol('t')\nV = 200*sp.Rational(105, 100)**t\nassert V.subs(t, 0) == 200\nans = None\n",
         custom="assert C[K].startswith('The value of the investment when')\n")

    b.mc('ADV', EX, 'E',
         'Which expression is equivalent to x⁵ · x³?',
         'x⁸', ['x¹⁵', '2x⁸', 'x²'],
         'When multiplying powers of the same base, add the exponents: 5 + 3 = 8.',
         X + "ans = x**5 * x**3\n")

    b.spr('ADV', NR, 'E',
          'What value of x satisfies the equation √x = 6?',
          '36', [],
          'Square both sides: x = 36. Check: √36 = 6.',
          X + "ans = sp.solve(sp.sqrt(x) - 6, x)[0]\n")

    b.mc('ADV', EE, 'E',
         'Which of the following is a factored form of x² + 7x + 12?',
         '(x + 3)(x + 4)', ['(x + 2)(x + 6)', '(x + 1)(x + 12)', '(x − 3)(x − 4)'],
         'Find two numbers that multiply to 12 and add to 7: 3 and 4. (2 and 6 multiply to 12 but add to 8.)',
         X + "ans = x**2 + 7*x + 12\n")

    b.mc('ADV', NFE, 'E',
         'The function g is defined by g(x) = 2ˣ. What is the value of g(5)?',
         '32', ['10', '25', '64'],
         'g(5) = 2⁵ = 2 · 2 · 2 · 2 · 2 = 32. (10 is 2 · 5.)',
         X + "ans = (2**x).subs(x, 5)\n")

    b.mc('ADV', NFQ, 'E',
         'The graph of the quadratic function f is shown. What is the minimum value of f(x)?',
         '−2', ['2', '0', '4'],
         'The graph opens upward with its vertex at (2, −2). It reaches its lowest point at the vertex, so the minimum value is the y-coordinate of the vertex: −2. (2 is where the minimum occurs, and also f(0).)',
         X + "f = (x - 2)**2 - 2\nans = sp.minimum(f, x)\n",
         figure={'kind': 'fgraph', 'params': {'expr': '(x - 2)**2 - 2', 'xmin': -2, 'xmax': 6, 'ymin': -4, 'ymax': 8}})

    # ── Medium (12) ──────────────────────────────────────────────────
    b.spr('ADV', NQ, 'M',
          'What is the positive solution to the equation x² − x − 12 = 0?',
          '4', [],
          'Factor: (x − 4)(x + 3) = 0, so x = 4 or x = −3. The positive solution is 4.',
          X + "ans = [s for s in sp.solve(x**2 - x - 12, x) if s > 0][0]\n")

    b.mc('ADV', NFQ, 'M',
         'The function f is defined by f(x) = (x + 3)² − 5. What are the coordinates of the vertex of the graph of y = f(x) in the xy-plane?',
         '(−3, −5)', ['(3, −5)', '(−3, 5)', '(3, 5)'],
         'In the form (x − h)² + k the vertex is (h, k). Here x + 3 = x − (−3), so h = −3 and k = −5.',
         X + "f = (x + 3)**2 - 5\nh = sp.solve(sp.diff(f, x), x)[0]\nassert (h, f.subs(x, h)) == (-3, -5)\nans = None\n",
         custom="assert C[K] == '(−3, −5)' and len(set(C)) == 4\n")

    b.mc('ADV', NFE, 'M',
         'A town had 500 residents in 2010, and its population doubles every 4 years. Which function gives the population P(t) of the town t years after 2010?',
         'P(t) = 500(2)^(t/4)', ['P(t) = 500(2)^(4t)', 'P(t) = 500(4)^(t/2)', 'P(t) = 2(500)^(t/4)'],
         'Starting at 500, the population is multiplied by 2 once every 4 years, so after t years it has doubled t/4 times: 500(2)^(t/4).',
         "t = sp.Symbol('t')\nans = None\n",
         custom="t = sp.Symbol('t')\nT = sp.parsing.sympy_parser.parse_expr\n"
                "fs = [T(c.split('=')[1].replace('^', '**'), local_dict={'t': t}, transformations=_T) for c in C]\n"
                "good = [C[i] for i, f in enumerate(fs) if f.subs(t, 0) == 500 and all(sp.simplify(f.subs(t, k + 4) - 2*f.subs(t, k)) == 0 for k in (0, 1, 3))]\n"
                "assert good == [C[K]], good\n")

    b.mc('ADV', ER, 'M',
         'For x ≠ 3, which expression is equivalent to (x² − 9)/(x − 3)?',
         'x + 3', ['x − 3', 'x² − 3', 'x + 9'],
         'Factor the numerator: (x + 3)(x − 3)/(x − 3) = x + 3.',
         X + "ans = sp.cancel((x**2 - 9)/(x - 3))\n")

    b.spr('ADV', NX, 'M',
          'What value of x satisfies the equation 2^(x + 1) = 32?',
          '4', [],
          '32 = 2⁵, so x + 1 = 5 and x = 4.',
          X + "ans = sp.solve(2**(x + 1) - 32, x)[0]\n")

    b.mc('ADV', NQ, 'M',
         'What is the sum of the solutions to the equation x² − 10x + 21 = 0?',
         '10', ['21', '−10', '4'],
         'Factor: (x − 3)(x − 7) = 0, so the solutions are 3 and 7, and their sum is 10. (4 is their difference.)',
         X + "ans = sum(sp.solve(x**2 - 10*x + 21, x))\n")

    b.spr('ADV', NFC, 'M',
          'The functions f and g are defined by f(x) = x² + 1 and g(x) = 3x − 2. What is the value of f(g(2))?',
          '17', [],
          'Work from the inside out: g(2) = 3(2) − 2 = 4. Then f(4) = 4² + 1 = 17.',
          X + "f = x**2 + 1\ng = 3*x - 2\nans = f.subs(x, g.subs(x, 2))\n")

    b.mc('ADV', EE, 'M',
         'Which expression is equivalent to (3x + 2)²?',
         '9x² + 12x + 4', ['9x² + 4', '9x² + 6x + 4', '3x² + 12x + 4'],
         '(3x + 2)(3x + 2) = 9x² + 6x + 6x + 4 = 9x² + 12x + 4. Squaring each term separately (9x² + 4) loses the middle term.',
         X + "ans = sp.expand((3*x + 2)**2)\n")

    b.spr('ADV', NA, 'M',
          'What is the smaller of the two solutions to the equation |x − 4| = 9?',
          '-5', [],
          'x − 4 = 9 gives x = 13, and x − 4 = −9 gives x = −5. The smaller solution is −5.',
          X + "ans = min(sp.solve(x - 4 - 9, x) + sp.solve(x - 4 + 9, x))\n")

    b.spr('ADV', NFE, 'M',
          'A car was bought for $20,000. Its value decreases by 15% each year. What is the value of the car, in dollars, 2 years after it was bought?',
          '14450', [],
          'Each year the car keeps 85% of its value: 20,000(0.85)² = 20,000(0.7225) = 14,450.',
          "ans = 20000 * sp.Rational(85, 100)**2\n")

    b.mc('ADV', NFQ, 'M',
         'The graph of the quadratic function f is shown. What is the maximum value of f(x)?',
         '4', ['3', '5', '9'],
         'The graph crosses the x-axis at x = 1 and x = 5, so the vertex is halfway between, at x = 3. With f(0) = −5, f(x) = −(x − 1)(x − 5), so f(3) = −(2)(−2) = 4. (3 is where the maximum occurs.)',
         X + "f = -(x - 1)*(x - 5)\nassert f.subs(x, 0) == -5\nans = sp.maximum(f, x)\n",
         figure={'kind': 'fgraph', 'params': {'expr': '-(x - 1)*(x - 5)', 'xmin': -1, 'xmax': 7, 'ymin': -6, 'ymax': 6}})

    b.mc('ADV', NS, 'M',
         'y = x²\ny = 2x + 3\nThe system of equations above has two solutions. What is the positive x-value of a solution?',
         '3', ['1', '−1', '9'],
         'Set x² = 2x + 3: x² − 2x − 3 = 0, (x − 3)(x + 1) = 0. The positive x-value is 3 (the point (3, 9)).',
         X + "ans = [s for s in sp.solve(x**2 - (2*x + 3), x) if s > 0][0]\n")

    # ── Hard (6) ─────────────────────────────────────────────────────
    b.spr('ADV', NQ, 'H',
          'In the equation x² + bx + 16 = 0, b is a positive constant. If the equation has exactly one real solution, what is the value of b?',
          '8', [],
          'Exactly one solution means the discriminant is 0: b² − 4(1)(16) = 0, so b² = 64 and, since b > 0, b = 8.',
          "b_ = sp.Symbol('b')\nans = [s for s in sp.solve(b_**2 - 64, b_) if s > 0][0]\n")

    b.mc('ADV', NE, 'H',
         '1/(x − 2) + 1/(x + 2) = 4/(x² − 4)\nWhich of the following describes the solutions to the equation above?',
         'There are no solutions.', ['x = 2 is the only solution.', 'x = −2 is the only solution.', 'x = 4 is the only solution.'],
         'Over the common denominator x² − 4, the left side is 2x/(x² − 4). Setting 2x = 4 gives x = 2 — but x = 2 makes a denominator 0, so it is extraneous. There are no solutions.',
         X + "ans = sp.solveset(1/(x - 2) + 1/(x + 2) - 4/(x**2 - 4), x, domain=sp.S.Reals)\nassert ans == sp.S.EmptySet\n",
         custom="assert C[K] == 'There are no solutions.'\n")

    b.mc('ADV', ER, 'H',
         'For x ≠ 2, which expression is equivalent to (x³ − 8)/(x − 2)?',
         'x² + 2x + 4', ['x² + 4', 'x² − 2x + 4', 'x² + 2x − 4'],
         'x³ − 8 is a difference of cubes: (x − 2)(x² + 2x + 4). Cancel x − 2.',
         X + "ans = sp.cancel((x**3 - 8)/(x - 2))\n")

    b.spr('ADV', NFQ, 'H',
          'The function f is defined by f(x) = a(x − 1)(x − 7), where a is a constant. The graph of y = f(x) passes through the point (0, 14). What is the minimum value of f(x)?',
          '-18', [],
          'f(0) = a(−1)(−7) = 7a = 14, so a = 2. The vertex is halfway between the zeros, at x = 4: f(4) = 2(3)(−3) = −18.',
          X + "a = sp.Symbol('a')\na0 = sp.solve(a*(0 - 1)*(0 - 7) - 14, a)[0]\nf = a0*(x - 1)*(x - 7)\nans = sp.minimum(f, x)\n")

    b.spr('ADV', NX, 'H',
          'What value of x satisfies the equation 3^(2x) = 81^(x − 1)?',
          '2', [],
          'Write 81 as 3⁴: 81^(x − 1) = 3^(4x − 4). Equal bases, so 2x = 4x − 4, giving x = 2.',
          X + "ans = sp.solve(2*x - 4*(x - 1), x)[0]\nassert sp.simplify(3**(2*ans) - 81**(ans - 1)) == 0\n")

    b.mc('ADV', NS, 'H',
         'In the xy-plane, the line y = 4x + k intersects the parabola y = x² + 5 at exactly one point. What is the value of k?',
         '1', ['5', '4', '−1'],
         'Set x² + 5 = 4x + k: x² − 4x + (5 − k) = 0. One intersection means the discriminant is 0: 16 − 4(5 − k) = 0, so k = 1.',
         X + "k = sp.Symbol('k')\nans = sp.solve(16 - 4*(5 - k), k)[0]\nassert len(sp.solve(x**2 + 5 - (4*x + ans), x)) == 1\n")

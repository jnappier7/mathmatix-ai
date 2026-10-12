"""SAT bank p4 — Advanced Math (ADV). 30 items, 10 with figures."""

EE = 'Equivalent expressions'
EER = 'Equivalent expressions (rational)'
EEX = 'Equivalent expressions (exponent rules)'
NEQ = 'Nonlinear equations (quadratic)'
NER = 'Nonlinear equations (radical)'
NERA = 'Nonlinear equations (rational)'
NEX = 'Nonlinear equations (exponential, equal bases)'
NEA = 'Nonlinear equations (absolute value)'
NES = 'Nonlinear equations and systems'
NFQ = 'Nonlinear functions (quadratic)'
NFE = 'Nonlinear functions (exponential)'
NFP = 'Nonlinear functions (polynomial)'

X = "x = sp.Symbol('x')\n"
XPOS = "x = sp.Symbol('x', positive=True)\nP_ = P\nP = lambda t: P_(t).subs(sp.Symbol('x'), x)\n"


def only(choices_to_exprs, key_text):
    pairs = ', '.join(f"{k!r}: {v}" for k, v in choices_to_exprs.items())
    return (f"forms = {{{pairs}}}\n"
            f"assert [k for k, v in forms.items() if sp.simplify(v - ans) == 0] == [{key_text!r}]\n")


def add(b):
    # ── Figure items (10) ────────────────────────────────────────────
    b.mc('ADV', NFQ, 'E',
         'The graph of y = x² − 4x + 3 is shown. At which values of x does the graph cross the x-axis?',
         'x = 1 and x = 3', ['x = −1 and x = −3', 'x = 3 only', 'x = 2 and x = −1'],
         'The graph crosses the x-axis at x = 1 and x = 3; indeed x² − 4x + 3 = (x − 1)(x − 3).',
         X + "assert sorted(sp.solve(x**2 - 4*x + 3, x)) == [1, 3]\n",
         custom="assert C[K] == 'x = 1 and x = 3'\n",
         figure={'kind': 'fgraph', 'params': {'expr': 'x**2 - 4*x + 3', 'xmin': -1, 'xmax': 5, 'ymin': -2, 'ymax': 8}})

    b.mc('ADV', 'Nonlinear functions (quadratic maximum)', 'M',
         'The graph of the quadratic function f is shown; its vertex is at (3, 5). What is the maximum value of f(x)?',
         '5', ['3', '−3', '8'],
         'The highest point is the vertex (3, 5); the maximum VALUE is its y-coordinate, 5.',
         X + "f = -(x - 3)**2 + 5\nv = sp.solve(sp.diff(f, x), x)[0]\nans = f.subs(x, v)\n",
         figure={'kind': 'fgraph', 'params': {'expr': '-(x-3)**2 + 5', 'xmin': -1, 'xmax': 7, 'ymin': -6, 'ymax': 7}})

    b.mc('ADV', NFE, 'E',
         'The graph of the exponential function y = 3 · 2^x is shown. What is the y-intercept of the graph?',
         '3', ['2', '6', '1'],
         'At x = 0, y = 3 · 2⁰ = 3 · 1 = 3.',
         "ans = 3 * 2**0\n",
         figure={'kind': 'fgraph', 'params': {'expr': '3*2**x', 'xmin': -3, 'xmax': 3, 'ymin': -1, 'ymax': 25}})

    b.mc('ADV', NFE, 'H',
         'The graph of the exponential function f is shown. It passes through (0, 64) and (2, 16). Which equation defines f?',
         'f(x) = 64(1/2)^x', ['f(x) = 16(1/2)^x', 'f(x) = 64(1/4)^x', 'f(x) = 64 − 24x'],
         'f(0) = 64 is the starting value. Over 2 steps it falls to 16, a factor of 1/4, so each step multiplies by 1/2: f(x) = 64(1/2)^x.',
         X + "ans = 64*sp.Rational(1, 2)**x\nassert ans.subs(x, 2) == 16\n"
         + only({'f(x) = 64(1/2)^x': '64*sp.Rational(1, 2)**x', 'f(x) = 16(1/2)^x': '16*sp.Rational(1, 2)**x', 'f(x) = 64(1/4)^x': '64*sp.Rational(1, 4)**x', 'f(x) = 64 − 24x': '64 - 24*x'}, 'f(x) = 64(1/2)^x'),
         custom="assert C[K] == 'f(x) = 64(1/2)^x'\n",
         figure={'kind': 'fgraph', 'params': {'expr': '64*0.5**x', 'xmin': -1, 'xmax': 5, 'ymin': -5, 'ymax': 70}})

    b.mc('ADV', 'Nonlinear functions (choosing an exponential model)', 'M',
         'The table shows values of a function f. Which equation could define f?',
         'f(x) = 400(0.75)^x', ['f(x) = 400(0.25)^x', 'f(x) = 400 − 100x', 'f(x) = 300(0.75)^x'],
         'Each value is 3/4 of the one before (400, 300, 225, 168.75) — exponential decay from 400 by a factor of 0.75. A linear model would drop by the same AMOUNT each time, but the drops shrink (100, 75, 56.25).',
         X + "ans = 400*sp.Rational(3, 4)**x\nassert [ans.subs(x, v) for v in range(4)] == [400, 300, 225, sp.Rational(675, 4)]\n"
         + only({'f(x) = 400(0.75)^x': '400*sp.Rational(3, 4)**x', 'f(x) = 400(0.25)^x': '400*sp.Rational(1, 4)**x', 'f(x) = 400 − 100x': '400 - 100*x', 'f(x) = 300(0.75)^x': '300*sp.Rational(3, 4)**x'}, 'f(x) = 400(0.75)^x'),
         custom="assert C[K] == 'f(x) = 400(0.75)^x'\n",
         figure={'kind': 'table', 'params': {'headers': ['x', 'f(x)'], 'rows': [['0', '400'], ['1', '300'], ['2', '225'], ['3', '168.75']]}})

    b.mc('ADV', NES, 'H',
         'The graphs of y = x² and y = 2x + 3 are shown in the xy-plane. Which of the following is a point where the two graphs intersect?',
         '(3, 9)', ['(−3, 9)', '(1, 1)', '(−1, −1)'],
         'x² = 2x + 3 gives x² − 2x − 3 = 0, so x = 3 or x = −1. The points are (3, 9) and (−1, 1). (−3, 9) is on the parabola only; (1, 1) is on the parabola but not the line.',
         "x = sp.Symbol('x')\npts = {'(3, 9)': (3, 9), '(−3, 9)': (-3, 9), '(1, 1)': (1, 1), '(−1, −1)': (-1, -1)}\n"
         "hits = [k for k, (px, py) in pts.items() if py == px**2 and py == 2*px + 3]\nassert hits == ['(3, 9)']\n",
         custom="assert C[K] == '(3, 9)'\n",
         figure={'kind': 'region', 'params': {'expr1': 'x**2', 'expr2': '2*x + 3', 'xmin': -3, 'xmax': 5, 'ymin': -2, 'ymax': 14}})

    b.spr('ADV', NFP, 'H',
          'The graph of y = x(x − 2)(x + 3) is shown. What is the sum of the x-coordinates of the points where the graph crosses the x-axis?',
          '-1', [],
          'The zeros are 0, 2, and −3, which sum to −1.',
          X + "ans = sum(sp.solve(x*(x - 2)*(x + 3), x))\n",
          figure={'kind': 'fgraph', 'params': {'expr': 'x*(x-2)*(x+3)', 'xmin': -4, 'xmax': 3, 'ymin': -10, 'ymax': 12}})

    b.mc('ADV', NEA, 'M',
         'The graph of f(x) = |x − 2| is shown. For which values of x is f(x) = 3?',
         'x = −1 and x = 5', ['x = 5 only', 'x = 1 and x = 5', 'x = −5 and x = 1'],
         'x − 2 = 3 gives x = 5, and x − 2 = −3 gives x = −1. On the graph, the V reaches height 3 at both.',
         "x = sp.Symbol('x', real=True)\nassert sorted(sp.solve(sp.Abs(x - 2) - 3, x)) == [-1, 5]\n",
         custom="assert C[K] == 'x = −1 and x = 5'\n",
         figure={'kind': 'fgraph', 'params': {'expr': 'abs(x-2)', 'xmin': -3, 'xmax': 7, 'ymin': -1, 'ymax': 6}})

    b.mc('ADV', NFQ, 'H',
         'The table shows five values of the quadratic function f. Which equation defines f?',
         'f(x) = (x − 3)² − 4', ['f(x) = (x + 3)² − 4', 'f(x) = (x − 3)² + 4', 'f(x) = (x − 4)² − 3'],
         'The values fall to −4 at x = 3 and rise symmetrically (−3 at both 2 and 4), so the vertex is (3, −4): f(x) = (x − 3)² − 4. Check x = 0: 9 − 4 = 5 ✓',
         X + "pts = [(0, 5), (1, 0), (2, -3), (3, -4), (4, -3)]\nans = (x - 3)**2 - 4\nassert all(ans.subs(x, a) == v for a, v in pts)\n",
         figure={'kind': 'table', 'params': {'headers': ['x', 'f(x)'], 'rows': [['0', '5'], ['1', '0'], ['2', '−3'], ['3', '−4'], ['4', '−3']]}})

    b.spr('ADV', NFE, 'M',
          'The function f is exponential, and the table shows two of its values. What is the value of f(2)?',
          '18', [],
          'From x = 1 to x = 3, f is multiplied by 54/6 = 9 over 2 steps, so each step multiplies by 3. Then f(2) = 6 · 3 = 18.',
          "bb = sp.sqrt(sp.Rational(54, 6))\nans = 6 * bb\n",
          figure={'kind': 'table', 'params': {'headers': ['x', 'f(x)'], 'rows': [['1', '6'], ['3', '54']]}})

    # ── Equivalent expressions (9) ───────────────────────────────────
    b.mc('ADV', EEX, 'E',
         'Which expression is equivalent to (5x²y)(−2xy³)?',
         '−10x³y⁴', ['−10x²y³', '3x³y⁴', '−10x³y³'],
         'Multiply the coefficients (5 · −2 = −10) and add exponents: x²⁺¹ = x³ and y¹⁺³ = y⁴.',
         "x, y = sp.symbols('x y')\nans = sp.expand((5*x**2*y)*(-2*x*y**3))\n")

    b.mc('ADV', EE, 'M',
         'Which expression is equivalent to x² + 10x + 25?',
         '(x + 5)²', ['(x + 25)(x + 1)', '(x − 5)²', '(x + 5)(x − 5)'],
         'A perfect square: x² + 2(5)x + 5² = (x + 5)².',
         X + "ans = x**2 + 10*x + 25\n")

    b.mc('ADV', EE, 'M',
         'Which expression is equivalent to (x − 4)² − (x + 4)²?',
         '−16x', ['0', '−32', '16x'],
         '(x² − 8x + 16) − (x² + 8x + 16) = −16x.',
         X + "ans = sp.expand((x - 4)**2 - (x + 4)**2)\n")

    b.mc('ADV', EEX, 'H',
         'Which expression is equivalent to √(72x⁶), for x > 0?',
         '6x³√2', ['36x³√2', '6x⁶√2', '2x³√6'],
         '√72 = √(36 · 2) = 6√2 and √(x⁶) = x³, so the expression is 6x³√2.',
         XPOS + "ans = sp.sqrt(72*x**6)\n")

    b.spr('ADV', EE, 'M',
          'If a + 1/a = 4, what is the value of a² + 1/a² ?',
          '14', [],
          'Square both sides: a² + 2 + 1/a² = 16, so a² + 1/a² = 14.',
          "a = sp.Symbol('a')\nvals = {sp.nsimplify(sp.simplify(v**2 + 1/v**2)) for v in sp.solve(a + 1/a - 4, a)}\nassert len(vals) == 1\nans = vals.pop()\n")

    b.mc('ADV', EER, 'H',
         'Which expression is equivalent to (x³ + 27)/(x + 3), for x ≠ −3?',
         'x² − 3x + 9', ['x² + 3x + 9', 'x² − 9', 'x² + 9'],
         'A sum of cubes: x³ + 27 = (x + 3)(x² − 3x + 9). Cancel x + 3.',
         X + "ans = sp.cancel((x**3 + 27)/(x + 3))\n")

    b.mc('ADV', EE, 'H',
         'If (x + a)² = x² + 14x + b for all values of x, where a and b are constants, what is the value of b?',
         '49', ['14', '7', '196'],
         'Expanding gives x² + 2ax + a². Matching 2a = 14 gives a = 7, so b = a² = 49.',
         "x, a, bb = sp.symbols('x a bb')\ne = sp.expand((x + a)**2 - (x**2 + 14*x + bb))\ns = sp.solve([e.coeff(x, 1), e.coeff(x, 0)], [a, bb], dict=True)[0]\nans = s[bb]\n")

    b.mc('ADV', EE, 'M',
         'Which of the following is a factor of 2x² + 7x + 3?',
         '2x + 1', ['2x + 3', 'x + 1', 'x − 3'],
         '2x² + 7x + 3 = (2x + 1)(x + 3). Of the choices, only 2x + 1 divides it evenly.',
         X + "p = 2*x**2 + 7*x + 3\ngood = [f for f in ['2x + 1', '2x + 3', 'x + 1', 'x − 3'] if sp.rem(p, P(f), x) == 0]\nassert good == ['2x + 1']\n",
         custom="assert C[K] == '2x + 1'\n")

    b.mc('ADV', NFE, 'H',
         'The function f is defined by f(x) = 2^x, and g(x) = f(x + 3). Which expression is equivalent to g(x)?',
         '8(2^x)', ['2^x + 3', '6(2^x)', '2^(3x)'],
         'g(x) = 2^(x + 3) = 2³ · 2^x = 8(2^x).',
         X + "ans = 2**(x + 3)\nP_ = P\nP = lambda t: sp.expand(P_(t))\nans = sp.expand(ans)\n")

    # ── Nonlinear equations (8) ──────────────────────────────────────
    b.spr('ADV', NEQ, 'E',
          'What is the positive solution to x² − 64 = 0 ?',
          '8', [],
          'x² = 64, so x = ±8. The positive solution is 8.',
          X + "ans = [r for r in sp.solve(x**2 - 64, x) if r > 0][0]\n")

    b.mc('ADV', NERA, 'M',
         'If 2/(x + 3) = 1/(x − 1), what is the value of x?',
         '5', ['1', '−5', '3'],
         'Cross-multiply: 2(x − 1) = x + 3, so 2x − 2 = x + 3 and x = 5.',
         X + "ans = sp.solve(2*(x - 1) - (x + 3), x)[0]\nassert sp.Rational(2, ans + 3) == sp.Rational(1, ans - 1)\n")

    b.spr('ADV', NER, 'H',
          'What is the solution to √(x + 7) = x − 5 ?',
          '9', [],
          'Square: x + 7 = x² − 10x + 25, so x² − 11x + 18 = 0 and x = 9 or x = 2. Check: x = 9 gives 4 = 4 ✓; x = 2 gives 3 = −3 ✗ (extraneous). The solution is 9.',
          X + "cands = sp.solve(x + 7 - (x - 5)**2, x)\nreal = [c for c in cands if sp.sqrt(c + 7) == c - 5]\nassert real == [9]\nans = real[0]\n")

    b.mc('ADV', NEX, 'M',
         'If 27^x = 9^(x + 1), what is the value of x?',
         '2', ['1', '3', '1/2'],
         'Powers of 3: 3^(3x) = 3^(2x + 2). So 3x = 2x + 2 and x = 2.',
         X + "ans = sp.solve(3*x - (2*x + 2), x)[0]\nassert 27**ans == 9**(ans + 1)\n")

    b.mc('ADV', NEA, 'H',
         'What is the product of the solutions to |3x + 2| = 7 ?',
         '−5', ['5', '−3', '7/3'],
         '3x + 2 = 7 gives x = 5/3; 3x + 2 = −7 gives x = −3. Their product is (5/3)(−3) = −5.',
         "x = sp.Symbol('x', real=True)\nr = sp.solve(sp.Abs(3*x + 2) - 7, x)\nassert len(r) == 2\nans = r[0]*r[1]\n")

    b.mc('ADV', NES, 'M',
         'How many real solutions does the equation 2x² − 3x + 4 = 0 have?',
         'None', ['Exactly one', 'Exactly two', 'Infinitely many'],
         'The discriminant is (−3)² − 4(2)(4) = 9 − 32 = −23, which is negative, so there are no real solutions.',
         "x = sp.Symbol('x')\nassert (-3)**2 - 4*2*4 < 0 and [r for r in sp.solve(2*x**2 - 3*x + 4, x) if r.is_real] == []\n",
         custom="assert C[K] == 'None'\n")

    b.spr('ADV', NES, 'H',
          'y = x² − 5x + 8\ny = 2\nThe graphs of the equations above intersect at two points. What is the sum of their x-coordinates?',
          '5', [],
          'x² − 5x + 8 = 2 gives x² − 5x + 6 = 0, so x = 2 or x = 3. Their sum is 5.',
          X + "r = sp.solve(x**2 - 5*x + 6, x)\nassert len(r) == 2\nans = sum(r)\n")

    b.mc('ADV', 'Nonlinear functions (composition)', 'M',
         'The functions f and g are defined by f(x) = x² + 1 and g(x) = x − 4. What is the value of g(f(3))?',
         '6', ['2', '10', '−1'],
         'Inside first: f(3) = 10. Then g(10) = 6. (2 is f(g(3)) = f(−1).)',
         "f = lambda v: v**2 + 1\ng = lambda v: v - 4\nans = g(f(3))\nassert f(g(3)) == 2\n")

    # ── Nonlinear functions (3 more) ─────────────────────────────────
    b.mc('ADV', NFE, 'H',
         'A town\'s population is modeled by P(t) = 12,000(1.02)^(4t), where t is the number of years since 2020. Which statement best describes the model?',
         'The population increases by 2% every 3 months.',
         ['The population increases by 8% each year.', 'The population increases by 2% each year.', 'The population increases by 4% every 2 months.'],
         'The exponent 4t counts quarters of a year: 4 growth steps per year, each multiplying by 1.02 — a 2% increase every 3 months. (That is about 8.24% per year, not exactly 8%.)',
         "t = sp.Symbol('t')\nPf = 12000*sp.Rational(102, 100)**(4*t)\nassert sp.simplify(Pf.subs(t, sp.Rational(1, 4)) / Pf.subs(t, 0)) == sp.Rational(102, 100)\nassert sp.Rational(102, 100)**4 != sp.Rational(108, 100)\n",
         custom="assert C[K] == 'The population increases by 2% every 3 months.'\n")

    b.spr('ADV', NFP, 'M',
          'What is the remainder when p(x) = x³ − 2x + 5 is divided by x + 2 ?',
          '1', [],
          'By the remainder theorem, the remainder is p(−2) = −8 + 4 + 5 = 1.',
          X + "ans = sp.rem(x**3 - 2*x + 5, x + 2, x)\n")

    b.mc('ADV', 'Nonlinear functions (quadratic, vertex)', 'M',
         'What is the minimum value of the function f(x) = 2(x − 1)² + 3 ?',
         '3', ['1', '2', '5'],
         '2(x − 1)² is never negative and equals 0 at x = 1, so the minimum value is 3.',
         X + "f = 2*(x - 1)**2 + 3\nans = f.subs(x, sp.solve(sp.diff(f, x), x)[0])\n")

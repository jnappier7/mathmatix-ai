"""SAT bank p3 — Advanced Math (ADV). 34 items, weighted to medium and hard."""

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


def add(b):
    # ── Equivalent expressions (11) ──────────────────────────────────
    b.mc('ADV', EE, 'E',
         'Which expression is equivalent to 6x² − 15x?',
         '3x(2x − 5)', ['3x(2x − 15)', '6x(x − 15)', 'x(6x − 5)'],
         'Both terms share 3x: 6x² = 3x · 2x and 15x = 3x · 5.',
         X + "ans = 6*x**2 - 15*x\n")

    b.mc('ADV', EE, 'M',
         'Which expression is equivalent to 4x² − 49?',
         '(2x + 7)(2x − 7)', ['(2x − 7)²', '(4x + 7)(x − 7)', '(2x + 7)²'],
         'A difference of squares: (2x)² − 7² = (2x + 7)(2x − 7).',
         X + "ans = 4*x**2 - 49\n")

    b.mc('ADV', EE, 'M',
         'Which expression is equivalent to (x + 2)(x² − 3x + 1)?',
         'x³ − x² − 5x + 2', ['x³ − x² + 5x + 2', 'x³ − 3x² + x + 2', 'x³ + 5x² − 5x + 2'],
         'x(x² − 3x + 1) = x³ − 3x² + x and 2(x² − 3x + 1) = 2x² − 6x + 2. Together: x³ − x² − 5x + 2.',
         X + "ans = sp.expand((x + 2)*(x**2 - 3*x + 1))\n")

    b.mc('ADV', EER, 'M',
         'Which expression is equivalent to 3/(x + 1) + 2/(x − 1), for x ≠ 1 and x ≠ −1?',
         '(5x − 1)/(x² − 1)', ['5/(2x)', '(5x + 1)/(x² − 1)', '5/(x² − 1)'],
         'Common denominator (x + 1)(x − 1) = x² − 1: 3(x − 1) + 2(x + 1) = 3x − 3 + 2x + 2 = 5x − 1.',
         X + "ans = sp.together(3/(x + 1) + 2/(x - 1))\n")

    b.mc('ADV', EEX, 'M',
         'Which expression is equivalent to (2x³)⁴, for x ≠ 0?',
         '16x¹²', ['8x¹²', '16x⁷', '2x¹²'],
         'Raise each factor to the 4th power: 2⁴ = 16 and (x³)⁴ = x¹².',
         X + "ans = sp.expand((2*x**3)**4)\n")

    b.mc('ADV', EEX, 'M',
         'For x > 0, which expression is equivalent to x^(1/2) · x^(1/3)?',
         'x^(5/6)', ['x^(1/6)', 'x^(2/5)', 'x^(1/5)'],
         'Multiplying adds exponents: 1/2 + 1/3 = 5/6.',
         XPOS + "ans = sp.simplify(x**sp.Rational(1, 2) * x**sp.Rational(1, 3))\n")

    b.spr('ADV', EE, 'H',
          'If x + y = 9 and x − y = 4, what is the value of x² − y² ?',
          '36', [],
          'x² − y² factors as (x + y)(x − y) = 9 · 4 = 36 — no need to find x and y.',
          "x, y = sp.symbols('x y')\ns = sp.solve([x + y - 9, x - y - 4], [x, y])\nans = s[x]**2 - s[y]**2\n")

    b.mc('ADV', EE, 'H',
         'The expression 2x² + 12x + 7 can be written in the form 2(x + h)² + k, where h and k are constants. What is the value of k?',
         '−11', ['7', '−29', '25'],
         '2x² + 12x = 2(x² + 6x) = 2[(x + 3)² − 9] = 2(x + 3)² − 18. Adding 7: k = −11.',
         "x, h, k = sp.symbols('x h k')\ne = sp.expand(2*(x + h)**2 + k - (2*x**2 + 12*x + 7))\ns = sp.solve([e.coeff(x, 1), e.coeff(x, 0)], [h, k], dict=True)[0]\nans = s[k]\n")

    b.spr('ADV', EE, 'H',
          'For all x, (3x − a)(x + 4) = 3x² + 7x − 20, where a is a constant. What is the value of a?',
          '5', [],
          'The constant terms: −4a = −20, so a = 5. Check the x-term: 12x − 5x = 7x ✓',
          "x, a = sp.symbols('x a')\ne = sp.expand((3*x - a)*(x + 4) - (3*x**2 + 7*x - 20))\nsol = sp.solve(e.coeff(x, 0), a)[0]\nassert e.coeff(x, 1).subs(a, sol) == 0\nans = sol\n")

    b.mc('ADV', EER, 'H',
         'Which expression is equivalent to (x² + 5x + 6)/(x² − 9), for x ≠ 3 and x ≠ −3?',
         '(x + 2)/(x − 3)', ['(x + 2)/(x + 3)', '(x + 3)/(x − 3)', '(5x + 6)/(−9)'],
         'Factor: (x + 2)(x + 3) over (x + 3)(x − 3). Cancel x + 3.',
         X + "ans = sp.cancel((x**2 + 5*x + 6)/(x**2 - 9))\n")

    b.mc('ADV', EEX, 'H',
         'If 2^a = 8^(b + 1), which of the following must be true?',
         'a = 3b + 3', ['a = 3b + 1', 'a = b + 3', 'a = 4b + 4'],
         '8 = 2³, so 8^(b + 1) = 2^(3b + 3). Equal powers of 2 have equal exponents: a = 3b + 3.',
         "a, bb = sp.symbols('a bb')\nans = sp.expand(3*(bb + 1))\n"
         "forms = {'a = 3b + 3': 3*bb + 3, 'a = 3b + 1': 3*bb + 1, 'a = b + 3': bb + 3, 'a = 4b + 4': 4*bb + 4}\n"
         "assert [k_ for k_, v in forms.items() if sp.simplify(v - ans) == 0] == ['a = 3b + 3']\n",
         custom="assert C[K] == 'a = 3b + 3'\n")

    # ── Nonlinear equations and systems (12) ─────────────────────────
    b.mc('ADV', NEQ, 'E',
         'What are the solutions to x² − 8x + 15 = 0?',
         'x = 3 and x = 5', ['x = −3 and x = −5', 'x = 1 and x = 15', 'x = −1 and x = −15'],
         'Factor: (x − 3)(x − 5) = 0.',
         X + "assert sorted(sp.solve(x**2 - 8*x + 15, x)) == [3, 5]\n",
         custom="assert C[K] == 'x = 3 and x = 5'\n")

    b.spr('ADV', NEQ, 'M',
          'What is the positive solution to (x − 2)² = 49 ?',
          '9', [],
          'x − 2 = ±7, so x = 9 or x = −5. The positive solution is 9.',
          X + "ans = [r for r in sp.solve((x - 2)**2 - 49, x) if r > 0][0]\n")

    b.mc('ADV', NEQ, 'M',
         'What are the solutions of 2x² + 3x − 2 = 0?',
         'x = 1/2 and x = −2', ['x = −1/2 and x = 2', 'x = 2 and x = −2', 'x = 1 and x = −2'],
         'Factor: (2x − 1)(x + 2) = 0, so x = 1/2 or x = −2.',
         X + "assert sorted(sp.solve(2*x**2 + 3*x - 2, x)) == [-2, sp.Rational(1, 2)]\n",
         custom="assert C[K] == 'x = 1/2 and x = −2'\n")

    b.mc('ADV', NES, 'H',
         'For which value of c does the equation x² − 10x + c = 0 have exactly one real solution?',
         '25', ['10', '5', '100'],
         'Exactly one solution means the discriminant is 0: (−10)² − 4c = 0, so c = 25 (then it is (x − 5)² = 0).',
         "c = sp.Symbol('c')\nans = sp.solve((-10)**2 - 4*c, c)[0]\n")

    b.spr('ADV', NES, 'H',
          'The equation 3x² − 18x + k = 0 has two real solutions whose product is 5. What is the value of k?',
          '15', [],
          'For ax² + bx + c = 0, the product of the solutions is c/a. Here k/3 = 5, so k = 15. (Check: 3x² − 18x + 15 = 3(x − 1)(x − 5), with real solutions 1 and 5.)',
          "k = sp.Symbol('k')\nans = sp.solve(k/3 - 5, k)[0]\nx = sp.Symbol('x')\nr = sp.solve(3*x**2 - 18*x + ans, x)\n"
          "assert len(r) == 2 and all(v.is_real for v in r) and sp.simplify(r[0]*r[1]) == 5\n")

    b.mc('ADV', NER, 'M',
         'What is the solution to √(5x − 1) = 3 ?',
         '2', ['4/5', '10', '1'],
         'Square both sides: 5x − 1 = 9, so x = 2. Check: √9 = 3 ✓',
         X + "ans = sp.solve(sp.sqrt(5*x - 1) - 3, x)[0]\n")

    b.mc('ADV', NER, 'H',
         'What is the solution set of x = √(x + 12) ?',
         '{4}', ['{−3, 4}', '{−3}', '{3, −4}'],
         'Square: x² = x + 12, so x² − x − 12 = 0 and x = 4 or x = −3. But x = √(…) cannot be negative, so −3 is extraneous: the solution set is {4}.',
         X + "cands = sp.solve(x**2 - x - 12, x)\nreal = [c for c in cands if c == sp.sqrt(c + 12)]\nassert real == [4]\n",
         custom="assert C[K] == '{4}'\n")

    b.spr('ADV', NERA, 'H',
          'What is the solution to x/(x − 2) − 3 = 4/(x − 2) ?',
          '1', [],
          'Multiply by x − 2: x − 3(x − 2) = 4, so −2x + 6 = 4 and x = 1. It does not make a denominator 0, so it stands.',
          X + "sols = [s for s in sp.solve(x/(x - 2) - 3 - 4/(x - 2), x) if s != 2]\nassert sols == [1]\nans = sols[0]\n")

    b.mc('ADV', NEX, 'M',
         'If 4^(x + 1) = 32, what is the value of x?',
         '3/2', ['3', '7', '5/2'],
         'Write both as powers of 2: 2^(2x + 2) = 2⁵, so 2x + 2 = 5 and x = 3/2.',
         X + "ans = sp.solve(2*x + 2 - 5, x)[0]\nassert 4**(ans + 1) == 32\n")

    b.mc('ADV', NEA, 'M',
         'How many solutions does the equation |x − 4| = −2 have?',
         'None', ['One', 'Two', 'Infinitely many'],
         'An absolute value is never negative, so it can never equal −2.',
         "x = sp.Symbol('x', real=True)\nassert sp.solve(sp.Abs(x - 4) + 2, x) == []\n",
         custom="assert C[K] == 'None'\n")

    b.mc('ADV', NES, 'H',
         'The graphs of y = x² − 2x and y = x + 4 are shown in the xy-plane. What is the product of the x-coordinates of their intersection points?',
         '−4', ['4', '3', '−3'],
         'x² − 2x = x + 4 gives x² − 3x − 4 = 0, or (x − 4)(x + 1) = 0. The x-coordinates are 4 and −1; their product is −4.',
         X + "r = sp.solve(x**2 - 2*x - (x + 4), x)\nans = r[0]*r[1]\n",
         figure={'kind': 'region', 'params': {'expr1': 'x**2 - 2*x', 'expr2': 'x + 4', 'xmin': -3, 'xmax': 6, 'ymin': -3, 'ymax': 12}})

    b.spr('ADV', NES, 'H',
          'x² + y² = 50\ny = x\nIf (a, b) is a solution to the system above and a > 0, what is the value of a?',
          '5', [],
          'Substitute y = x: 2x² = 50, so x² = 25 and x = ±5. With a > 0, a = 5.',
          "x, y = sp.symbols('x y')\nans = [s[0] for s in sp.solve([x**2 + y**2 - 50, y - x], [x, y]) if s[0] > 0][0]\n")

    # ── Nonlinear functions (11) ─────────────────────────────────────
    b.mc('ADV', NFQ, 'E',
         'The graph of the quadratic function f is shown. What are the zeros of f?',
         '−1 and 5', ['1 and −5', '−5 and 0', '2 and −9'],
         'The zeros are where the graph crosses the x-axis: x = −1 and x = 5.',
         X + "f = (x + 1)*(x - 5)\nassert sorted(sp.solve(f, x)) == [-1, 5]\n",
         custom="assert C[K] == '−1 and 5'\n",
         figure={'kind': 'fgraph', 'params': {'expr': '(x+1)*(x-5)', 'xmin': -3, 'xmax': 7, 'ymin': -10, 'ymax': 8}})

    b.mc('ADV', 'Nonlinear functions (exponential evaluation)', 'E',
         'The function g is defined by g(x) = 500(0.8)^x. What is the value of g(2)?',
         '320', ['400', '800', '250'],
         'g(2) = 500(0.8)² = 500(0.64) = 320. (400 is one step of decay, g(1).)',
         "ans = 500 * sp.Rational(8, 10)**2\n")

    b.mc('ADV', 'Nonlinear functions (choosing an exponential model)', 'M',
         'A savings account starts with $2,000 and earns 3% interest compounded monthly at an annual rate, so it grows by a factor of (1 + 0.03/12) each month. Which expression gives the balance after t years?',
         '2,000(1.0025)^(12t)', ['2,000(1.03)^(12t)', '2,000(1.0025)^t', '2,000(1.25)^(12t)'],
         'Each month multiplies by 1 + 0.03/12 = 1.0025, and t years is 12t months.',
         "t = sp.Symbol('t')\nans = 2000*sp.Rational(10025, 10000)**(12*t)\n"
         "forms = {'2,000(1.0025)^(12t)': 2000*sp.Rational(10025, 10000)**(12*t), '2,000(1.03)^(12t)': 2000*sp.Rational(103, 100)**(12*t), '2,000(1.0025)^t': 2000*sp.Rational(10025, 10000)**t, '2,000(1.25)^(12t)': 2000*sp.Rational(125, 100)**(12*t)}\n"
         "assert [k for k, v in forms.items() if sp.simplify(v - ans) == 0] == ['2,000(1.0025)^(12t)']\n",
         custom="assert C[K] == '2,000(1.0025)^(12t)'\n")

    b.spr('ADV', 'Nonlinear functions (quadratic, vertex)', 'M',
          'The function f is defined by f(x) = −x² + 8x − 7. For what value of x does f(x) reach its maximum?',
          '4', [],
          'The vertex of ax² + bx + c is at x = −b/(2a) = −8/(2 · −1) = 4.',
          X + "f = -x**2 + 8*x - 7\nans = sp.solve(sp.diff(f, x), x)[0]\n")

    b.mc('ADV', 'Nonlinear functions (composition)', 'M',
         'The functions f and g are defined by f(x) = 2x + 1 and g(x) = x² − 3. What is the value of f(g(3))?',
         '13', ['46', '7', '19'],
         'Inside first: g(3) = 9 − 3 = 6. Then f(6) = 2(6) + 1 = 13. (46 is g(f(3)).)',
         X + "f = lambda v: 2*v + 1\ng = lambda v: v**2 - 3\nans = f(g(3))\nassert g(f(3)) == 46\n")

    b.mc('ADV', 'Nonlinear functions (transformations)', 'H',
         'The graph of y = f(x) has its vertex at (2, −3). What is the vertex of the graph of y = f(x + 4) + 1?',
         '(−2, −2)', ['(6, −2)', '(−2, −4)', '(6, −4)'],
         'f(x + 4) shifts the graph 4 units LEFT (x-coordinate 2 − 4 = −2), and +1 shifts it up (−3 + 1 = −2).',
         X + "f = (x - 2)**2 - 3\ng = f.subs(x, x + 4) + 1\nvx = sp.solve(sp.diff(g, x), x)[0]\nassert (vx, g.subs(x, vx)) == (-2, -2)\n",
         custom="assert C[K] == '(−2, −2)'\n")

    b.mc('ADV', NFE, 'H',
         'A colony of bacteria triples every 4 hours. It starts with 150 bacteria. Which function gives the number of bacteria after t hours?',
         'N(t) = 150(3)^(t/4)', ['N(t) = 150(3)^(4t)', 'N(t) = 150(4)^(t/3)', 'N(t) = 150 + 3(t/4)'],
         'Tripling every 4 hours means multiplying by 3 once per 4 hours, which is t/4 times in t hours.',
         "t = sp.Symbol('t')\nans = 150*3**(t/4)\nassert ans.subs(t, 4) == 450 and ans.subs(t, 8) == 1350\n"
         "forms = {'N(t) = 150(3)^(t/4)': 150*3**(t/4), 'N(t) = 150(3)^(4t)': 150*3**(4*t), 'N(t) = 150(4)^(t/3)': 150*4**(t/3), 'N(t) = 150 + 3(t/4)': 150 + 3*(t/4)}\n"
         "assert [k for k, v in forms.items() if sp.simplify(v - ans) == 0] == ['N(t) = 150(3)^(t/4)']\n",
         custom="assert C[K] == 'N(t) = 150(3)^(t/4)'\n")

    b.spr('ADV', NFE, 'H',
          'A car\'s value is modeled by V(t) = 24,000(0.85)^t, where t is the number of years after purchase. By what percent does the car\'s value decrease each year?',
          '15', [],
          'The factor 0.85 keeps 85% of the value each year — a 15% decrease.',
          "ans = (1 - sp.Rational(85, 100)) * 100\n")

    b.mc('ADV', NFP, 'M',
         'The polynomial p(x) = x³ − 4x² − 7x + 10 has (x − 1) as a factor. Which of the following is also a factor of p(x)?',
         'x − 5', ['x + 5', 'x − 2', 'x + 1'],
         'Divide by x − 1: x³ − 4x² − 7x + 10 = (x − 1)(x² − 3x − 10) = (x − 1)(x − 5)(x + 2). Only x − 5 is among the choices.',
         X + "p = x**3 - 4*x**2 - 7*x + 10\nassert sp.rem(p, x - 1, x) == 0\n"
         "good = [f for f in ['x − 5', 'x + 5', 'x − 2', 'x + 1'] if sp.rem(p, P(f), x) == 0]\nassert good == ['x − 5']\n",
         custom="assert C[K] == 'x − 5'\n")

    b.mc('ADV', NFQ, 'H',
         'The graph of the quadratic function g is shown; it has its vertex at (−1, 4) and passes through (1, 0). Which equation defines g?',
         'g(x) = −(x + 1)² + 4', ['g(x) = −(x − 1)² + 4', 'g(x) = (x + 1)² + 4', 'g(x) = −2(x + 1)² + 4'],
         'Vertex form with vertex (−1, 4): g(x) = a(x + 1)² + 4. Using (1, 0): 0 = 4a + 4, so a = −1.',
         X + "a = sp.Symbol('a')\nav = sp.solve(a*(1 + 1)**2 + 4, a)[0]\nans = av*(x + 1)**2 + 4\n",
         figure={'kind': 'fgraph', 'params': {'expr': '-(x+1)**2 + 4', 'xmin': -5, 'xmax': 3, 'ymin': -6, 'ymax': 6}})

    b.spr('ADV', NFP, 'H',
          'The function h is defined by h(x) = (x − 3)(x + 2)(2x − 1). What is the sum of the zeros of h?',
          '3/2', ['1.5'],
          'The zeros are 3, −2, and 1/2 (from 2x − 1 = 0). Their sum is 3 − 2 + 1/2 = 3/2.',
          X + "ans = sum(sp.solve((x - 3)*(x + 2)*(2*x - 1), x))\n")

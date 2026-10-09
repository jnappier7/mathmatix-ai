"""SAT bank p1 — Advanced Math (ADV). 30 items across the three official skills."""

EE = 'Equivalent expressions'
EER = 'Equivalent expressions (rational)'
EEX = 'Equivalent expressions (exponent rules)'
NEQ = 'Nonlinear equations (quadratic)'
NER = 'Nonlinear equations (radical)'
NERA = 'Nonlinear equations (rational)'
NEX = 'Nonlinear equations (exponential, equal bases)'
NES = 'Nonlinear equations and systems'
NFQ = 'Nonlinear functions (quadratic)'
NFE = 'Nonlinear functions (exponential)'
NFP = 'Nonlinear functions (polynomial)'

X = "x = sp.Symbol('x')\n"


def add(b):
    # ── Equivalent expressions ───────────────────────────────────────
    b.mc('ADV', EE, 'E',
         'Which expression is equivalent to 4x(3x − 2) − 5x²?',
         '7x² − 8x', ['17x² − 8x', '7x² − 8', '12x² − 13x'],
         'Distribute: 12x² − 8x − 5x² = 7x² − 8x.',
         X + "ans = sp.expand(4*x*(3*x - 2) - 5*x**2)\n")

    b.mc('ADV', EEX, 'E',
         'Which expression is equivalent to (6x⁴y²)/(2xy), where x and y are nonzero?',
         '3x³y', ['4x³y', '3x⁴y', '3x³y²'],
         'Divide the coefficients (6/2 = 3) and subtract exponents: x⁴⁻¹ = x³ and y²⁻¹ = y, giving 3x³y.',
         "x, y = sp.symbols('x y')\nans = sp.simplify(6*x**4*y**2/(2*x*y))\n")

    b.mc('ADV', EE, 'E',
         'Which expression is equivalent to 9x² − 25?',
         '(3x − 5)(3x + 5)', ['(3x − 5)²', '(9x − 5)(x + 5)', '(3x − 25)(3x + 1)'],
         '9x² − 25 is a difference of squares: (3x)² − 5² = (3x − 5)(3x + 5).',
         X + "ans = 9*x**2 - 25\n")

    b.mc('ADV', EER, 'M',
         'Which expression is equivalent to (x² − 9)/(x² + x − 6), for x ≠ −3 and x ≠ 2?',
         '(x − 3)/(x − 2)', ['(x + 3)/(x − 2)', '(x − 3)/(x + 2)', '(x − 9)/(x − 6)'],
         'Factor: x² − 9 = (x − 3)(x + 3) and x² + x − 6 = (x + 3)(x − 2). Cancel x + 3 to get (x − 3)/(x − 2).',
         X + "ans = sp.cancel((x**2 - 9)/(x**2 + x - 6))\n")

    b.spr('ADV', EE, 'M',
          'If 3x − y = 5, what is the value of 12x − 4y − 7?',
          '13', [],
          '12x − 4y is 4(3x − y) = 4(5) = 20, so 12x − 4y − 7 = 13. There is no need to find x or y.',
          "x, y = sp.symbols('x y')\nans = sp.simplify((12*x - 4*y - 7).subs(y, 3*x - 5))\n")

    b.mc('ADV', EE, 'M',
         'Which expression is equivalent to (2x + 5)(x − 3) − (x − 4)²?',
         'x² + 7x − 31', ['x² + 7x + 1', 'x² − 9x − 31', '3x² − 9x + 1'],
         '(2x + 5)(x − 3) = 2x² − x − 15 and (x − 4)² = x² − 8x + 16. Subtracting: 2x² − x − 15 − x² + 8x − 16 = x² + 7x − 31.',
         X + "ans = sp.expand((2*x + 5)*(x - 3) - (x - 4)**2)\n")

    b.mc('ADV', EEX, 'M',
         'Which expression is equivalent to (16x⁸)^(1/2), where x > 0?',
         '4x⁴', ['8x⁴', '16x⁴', '4x⁶'],
         'A power of 1/2 is a square root: √16 = 4 and √(x⁸) = x⁴, so the expression is 4x⁴.',
         "x = sp.Symbol('x', positive=True)\nans = sp.simplify((16*x**8)**sp.Rational(1, 2))\n"
         "P_ = P\nP = lambda t: P_(t).subs(sp.Symbol('x'), x)\n")

    b.spr('ADV', EER, 'H',
          'For x ≠ 2, the expression (x³ − 8)/(x − 2) can be written as x² + bx + c, where b and c are constants. What is the value of b + c?',
          '6', [],
          'x³ − 8 is a difference of cubes: (x − 2)(x² + 2x + 4). Dividing by x − 2 leaves x² + 2x + 4, so b + c = 2 + 4 = 6.',
          X + "q = sp.Poly(sp.cancel((x**3 - 8)/(x - 2)), x)\nans = q.coeff_monomial(x) + q.coeff_monomial(1)\n")

    b.mc('ADV', EE, 'H',
         'The equation (ax + 2)(3x − b) = 12x² − 14x − 10 is true for all values of x, where a and b are constants. What is the value of a + b?',
         '9', ['7', '−1', '2'],
         'Expanding gives 3ax² + (6 − ab)x − 2b. Matching: 3a = 12, so a = 4, and −2b = −10, so b = 5. Check the middle term: 6 − 20 = −14. So a + b = 9.',
         "x, a, bb = sp.symbols('x a bb')\ne = sp.expand((a*x + 2)*(3*x - bb) - (12*x**2 - 14*x - 10))\n"
         "s = sp.solve([e.coeff(x, 2), e.coeff(x, 0)], [a, bb], dict=True)[0]\n"
         "assert sp.simplify(e.coeff(x, 1).subs(s)) == 0\nans = s[a] + s[bb]\n")

    b.mc('ADV', EER, 'H',
         'Which expression is equivalent to 1/(x − 3) − 1/(x + 3), for x ≠ 3 and x ≠ −3?',
         '6/(x² − 9)', ['−6/(x² − 9)', '2x/(x² − 9)', '6/(x² + 9)'],
         'Over the common denominator (x − 3)(x + 3) = x² − 9, the numerator is (x + 3) − (x − 3) = 6.',
         X + "ans = sp.together(1/(x - 3) - 1/(x + 3))\n")

    # ── Nonlinear equations and systems ──────────────────────────────
    b.spr('ADV', NEQ, 'E',
          'If x² = 49 and x < 0, what is the value of x?',
          '-7', [],
          'x² = 49 has solutions 7 and −7. The negative one is −7.',
          X + "ans = [r for r in sp.solve(x**2 - 49, x) if r < 0][0]\n")

    b.mc('ADV', NEQ, 'E',
         'What are the solutions to the equation (x − 4)(2x + 6) = 0?',
         'x = 4 and x = −3', ['x = −4 and x = 3', 'x = 4 and x = 6', 'x = 4 and x = −6'],
         'A product is 0 when a factor is 0: x − 4 = 0 gives x = 4, and 2x + 6 = 0 gives x = −3.',
         X + "sol = sorted(sp.solve((x - 4)*(2*x + 6), x))\nassert sol == [-3, 4]\n",
         custom="assert C[K] == 'x = 4 and x = −3'\n")

    b.mc('ADV', NEQ, 'M',
         'What is the positive solution to the equation 3x² − 12x = 0?',
         '4', ['12', '3', '2'],
         'Factor out 3x: 3x(x − 4) = 0, so x = 0 or x = 4. The positive solution is 4.',
         X + "ans = [r for r in sp.solve(3*x**2 - 12*x, x) if r > 0][0]\n")

    b.mc('ADV', NEQ, 'M',
         'What are the solutions to the equation x² − 6x + 4 = 0?',
         'x = 3 ± √5', ['x = 3 ± √13', 'x = −3 ± √5', 'x = 6 ± √5'],
         'Complete the square: x² − 6x + 9 = 5, so (x − 3)² = 5 and x = 3 ± √5.',
         X + "sol = sorted(sp.solve(x**2 - 6*x + 4, x), key=lambda r: float(r))\n"
         "assert [sp.simplify(s) for s in sol] == [3 - sp.sqrt(5), 3 + sp.sqrt(5)]\n",
         custom="assert C[K] == 'x = 3 ± √5'\n"
                "for c, r in [('x = 3 ± √13', 3 + sp.sqrt(13)), ('x = −3 ± √5', -3 + sp.sqrt(5)), ('x = 6 ± √5', 6 + sp.sqrt(5))]:\n"
                "    assert sp.simplify(r**2 - 6*r + 4) != 0\n")

    b.spr('ADV', NER, 'H',
          'What is the solution to the equation √(3x + 10) = x + 2 ?',
          '2', [],
          'Square both sides: 3x + 10 = x² + 4x + 4, so x² + x − 6 = 0 and x = 2 or x = −3. Check: x = 2 gives √16 = 4 = 4, but x = −3 gives √1 = 1 ≠ −1, so −3 is extraneous. The solution is 2.',
          X + "cands = sp.solve(3*x + 10 - (x + 2)**2, x)\nreal = [c for c in cands if sp.sqrt(3*c + 10) == c + 2]\nassert len(real) == 1\nans = real[0]\n")

    b.mc('ADV', NERA, 'M',
         'If 6/(x + 1) = 2/(x − 3), what is the value of x?',
         '5', ['1', '4', '−5'],
         'Cross-multiply: 6(x − 3) = 2(x + 1), so 6x − 18 = 2x + 2, 4x = 20, and x = 5.',
         X + "ans = sp.solve(6*(x - 3) - 2*(x + 1), x)[0]\nassert sp.Rational(6, ans + 1) == sp.Rational(2, ans - 3)\n")

    b.mc('ADV', NES, 'H',
         'y = x² − 3x + 4\ny = x + 1\nThe graphs of the equations above intersect at two points in the xy-plane. What is the sum of the x-coordinates of the two points?',
         '4', ['3', '−4', '2'],
         'Set them equal: x² − 3x + 4 = x + 1, so x² − 4x + 3 = 0 and (x − 1)(x − 3) = 0. The x-coordinates are 1 and 3, which sum to 4.',
         X + "r = sp.solve(x**2 - 3*x + 4 - (x + 1), x)\nassert len(r) == 2\nans = sum(r)\n")

    b.mc('ADV', NES, 'H',
         'The equation 2x² − kx + 8 = 0, where k is a constant, has no real solutions. Which of the following could be the value of k?',
         '6', ['8', '10', '−9'],
         'No real solutions means the discriminant is negative: k² − 4(2)(8) < 0, so k² < 64 and −8 < k < 8. Only 6 is in that range; k = 8 gives exactly one solution.',
         "good = [k for k in [6, 8, 10, -9] if k**2 - 4*2*8 < 0]\nassert good == [6]\n",
         custom="assert C[K] == '6'\n")

    b.spr('ADV', NES, 'H',
          'x² + y² = 25\ny = x + 1\nIf (a, b) is a solution to the system of equations above and a > 0, what is the value of b?',
          '4', [],
          'Substitute: x² + (x + 1)² = 25, so 2x² + 2x − 24 = 0 and x² + x − 12 = 0. Then x = 3 or x = −4. With a > 0, a = 3 and b = 3 + 1 = 4.',
          "x, y = sp.symbols('x y')\nsols = sp.solve([x**2 + y**2 - 25, y - x - 1], [x, y])\nans = [s[1] for s in sols if s[0] > 0][0]\n")

    b.mc('ADV', NEX, 'M',
         'If 9^x = 27^(x − 1), what is the value of x?',
         '3', ['1', '−3', '2'],
         'Write both sides as powers of 3: 3^(2x) = 3^(3x − 3). Then 2x = 3x − 3, so x = 3.',
         X + "ans = sp.solve(2*x - (3*x - 3), x)[0]\nassert 9**ans == 27**(ans - 1)\n")

    # ── Nonlinear functions ──────────────────────────────────────────
    b.mc('ADV', 'Nonlinear functions (quadratic maximum)', 'E',
         'The graph of the quadratic function f is shown in the xy-plane. What is the maximum value of f?',
         '4', ['1', '3', '−1'],
         'The highest point of the parabola is its vertex, (1, 4). The maximum VALUE of f is the y-coordinate, 4.',
         X + "f = -(x - 1)**2 + 4\nv = sp.solve(sp.diff(f, x), x)[0]\nans = f.subs(x, v)\n",
         figure={'kind': 'fgraph', 'params': {'expr': '-(x-1)**2 + 4', 'xmin': -3, 'xmax': 5, 'ymin': -6, 'ymax': 6}})

    b.mc('ADV', 'Nonlinear functions (exponential evaluation)', 'E',
         'The function f is defined by f(x) = 3 · 2^x. What is the value of f(4)?',
         '48', ['24', '1,296', '12'],
         'f(4) = 3 · 2⁴ = 3 · 16 = 48. (Multiplying 3 · 2 first and raising 6 to the 4th power is the common mistake.)',
         "ans = 3 * 2**4\n")

    b.mc('ADV', 'Nonlinear functions (choosing an exponential model)', 'M',
         'The population of a town was 8,000 in 2020 and has decreased by 3% each year since. Which expression gives the population t years after 2020?',
         '8,000(0.97)^t', ['8,000(0.03)^t', '8,000(1.03)^t', '8,000 − 0.03t'],
         'Losing 3% each year leaves 97% of the previous year\'s population, so the population is multiplied by 0.97 each year: 8,000(0.97)^t.',
         "t = sp.Symbol('t')\nans = 8000*sp.Rational(97, 100)**t\nassert ans.subs(t, 1) == 7760\n")

    b.mc('ADV', NFE, 'M',
         'The graph of y = f(x), where f(x) = a · b^x for positive constants a and b, is shown. The graph passes through the points (0, 2) and (2, 4.5). Which equation defines f?',
         'f(x) = 2(1.5)^x', ['f(x) = 1.5(2)^x', 'f(x) = 2(2.25)^x', 'f(x) = 4.5(1.5)^x'],
         'At x = 0, f(0) = a = 2. Then f(2) = 2b² = 4.5, so b² = 2.25 and b = 1.5.',
         X + "a = 2\nbb = sp.sqrt(sp.Rational(45, 10)/a)\nans = a*bb**x\nassert bb == sp.Rational(3, 2)\n",
         figure={'kind': 'fgraph', 'params': {'expr': '2*1.5**x', 'xmin': -3, 'xmax': 4, 'ymin': -1, 'ymax': 11}})

    b.spr('ADV', NFQ, 'M',
          'The function f is defined by f(x) = x² − 10x + 31. What is the minimum value of f(x)?',
          '6', [],
          'Complete the square: x² − 10x + 25 + 6 = (x − 5)² + 6. The squared term is never negative, so the minimum value is 6, at x = 5.',
          X + "f = x**2 - 10*x + 31\nans = f.subs(x, sp.solve(sp.diff(f, x), x)[0])\n")

    b.mc('ADV', 'Nonlinear functions (quadratic, zeros)', 'M',
         'The graph of y = f(x), where f(x) = (x + 2)(x − 6), is shown. For what value of x does f(x) reach its minimum?',
         '2', ['−2', '6', '−16'],
         'The vertex of a parabola is halfway between its zeros, −2 and 6: x = (−2 + 6)/2 = 2. (−16 is the minimum VALUE, f(2), not where it occurs.)',
         X + "f = (x + 2)*(x - 6)\nans = sp.solve(sp.diff(f, x), x)[0]\n",
         figure={'kind': 'fgraph', 'params': {'expr': '(x+2)*(x-6)', 'xmin': -4, 'xmax': 8, 'ymin': -18, 'ymax': 10}})

    b.mc('ADV', 'Nonlinear functions (quadratic model, maximum)', 'H',
         'A ball is thrown upward, and its height, in meters, t seconds after it is thrown is h(t) = −5t² + 30t + 2. What is the maximum height of the ball, in meters?',
         '47', ['3', '45', '32'],
         'The maximum occurs at t = −30/(2(−5)) = 3. Then h(3) = −45 + 90 + 2 = 47 meters.',
         "t = sp.Symbol('t')\nh = -5*t**2 + 30*t + 2\nans = h.subs(t, sp.solve(sp.diff(h, t), t)[0])\n")

    b.spr('ADV', NFQ, 'H',
          'The function f is defined by f(x) = a(x − 3)² + k, where a and k are constants. The graph of y = f(x) passes through the points (3, −8) and (5, 4). What is the value of f(0)?',
          '19', [],
          'At x = 3 the squared term is 0, so k = −8. Then 4 = a(2)² − 8 gives a = 3, and f(0) = 3(9) − 8 = 19.',
          "x, a, k = sp.symbols('x a k')\nf = a*(x - 3)**2 + k\ns = sp.solve([f.subs(x, 3) + 8, f.subs(x, 5) - 4], [a, k], dict=True)[0]\nans = f.subs(s).subs(x, 0)\n")

    b.mc('ADV', NFP, 'H',
         'The polynomial p(x) = 2x³ − 5x² + x − 7 is divided by x − 3. What is the remainder?',
         '5', ['−5', '14', '0'],
         'By the remainder theorem, the remainder is p(3) = 54 − 45 + 3 − 7 = 5.',
         X + "ans = sp.rem(2*x**3 - 5*x**2 + x - 7, x - 3, x)\nassert ans == (2*x**3 - 5*x**2 + x - 7).subs(x, 3)\n")

    b.mc('ADV', NFE, 'H',
         'The mass, in grams, of a radioactive sample t hours after it is measured is A(t) = 640(1/2)^(t/5). After how many hours will 40 grams of the sample remain?',
         '20', ['4', '16', '80'],
         '640(1/2)^(t/5) = 40 means (1/2)^(t/5) = 1/16 = (1/2)⁴. So t/5 = 4 and t = 20.',
         "t = sp.Symbol('t', positive=True)\nans = sp.solve(640*sp.Rational(1, 2)**(t/5) - 40, t)[0]\n")

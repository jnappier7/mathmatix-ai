"""SAT bank p2 — Advanced Math (ADV). 33 items across the three official skills."""

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
    # ── Equivalent expressions ───────────────────────────────────────
    b.mc('ADV', EE, 'E',
         'Which expression is equivalent to (x² + 5x − 3) − (2x² − x + 4)?',
         '−x² + 6x − 7', ['−x² + 4x + 1', '3x² + 4x + 1', '−x² + 6x + 1'],
         'Distribute the minus sign: x² + 5x − 3 − 2x² + x − 4 = −x² + 6x − 7.',
         X + "ans = sp.expand((x**2 + 5*x - 3) - (2*x**2 - x + 4))\n")

    b.mc('ADV', EEX, 'E',
         'Which expression is equivalent to (x⁵ · x³)/x², for x ≠ 0?',
         'x⁶', ['x¹⁵', 'x⁸', 'x⁴'],
         'Multiplying adds exponents (x⁸), and dividing subtracts them: x⁸⁻² = x⁶.',
         X + "ans = sp.simplify(x**5*x**3/x**2)\n")

    b.mc('ADV', EE, 'M',
         'Which expression is equivalent to 2x² − 7x − 15?',
         '(2x + 3)(x − 5)', ['(2x − 3)(x + 5)', '(2x + 5)(x − 3)', '(x + 3)(2x − 5)'],
         'Look for factors of 2(−15) = −30 that sum to −7: 3 and −10. So 2x² + 3x − 10x − 15 = x(2x + 3) − 5(2x + 3) = (2x + 3)(x − 5).',
         X + "ans = 2*x**2 - 7*x - 15\n")

    b.mc('ADV', EE, 'M',
         'Which expression is equivalent to (3x − 2)(x² + 4x − 1)?',
         '3x³ + 10x² − 11x + 2', ['3x³ + 12x² − 3x + 2', '3x³ + 10x² − 5x + 2', '3x³ + 14x² − 11x − 2'],
         '3x(x² + 4x − 1) = 3x³ + 12x² − 3x and −2(x² + 4x − 1) = −2x² − 8x + 2. Adding: 3x³ + 10x² − 11x + 2.',
         X + "ans = sp.expand((3*x - 2)*(x**2 + 4*x - 1))\n")

    b.spr('ADV', EE, 'M',
          'If x² + y² = 40 and xy = 12, what is the value of (x + y)²?',
          '64', [],
          '(x + y)² = x² + 2xy + y² = (x² + y²) + 2xy = 40 + 24 = 64.',
          "x, y = sp.symbols('x y')\nans = sp.expand((x + y)**2).subs(x**2, 40 - y**2).subs(x*y, 12)\nans = sp.simplify(ans)\n")

    b.mc('ADV', EEX, 'M',
         'Which expression is equivalent to (x^(2/3))³ · x^(−1), for x > 0?',
         'x', ['x²', 'x⁵', 'x^(1/3)'],
         '(x^(2/3))³ = x², and x² · x^(−1) = x.',
         XPOS + "ans = sp.simplify((x**sp.Rational(2, 3))**3 * x**-1)\n")

    b.mc('ADV', EE, 'H',
         'If x − 1/x = 3, what is the value of x² + 1/x²?',
         '11', ['9', '7', '3'],
         'Square both sides: x² − 2 + 1/x² = 9, so x² + 1/x² = 11.',
         X + "r = sp.solve(x - 1/x - 3, x)\nvals = {sp.nsimplify(sp.simplify(v**2 + 1/v**2)) for v in r}\nassert len(vals) == 1\nans = vals.pop()\n")

    b.spr('ADV', EE, 'H',
          'For all values of x, (x + 3)² − (x − 3)² = kx, where k is a constant. What is the value of k?',
          '12', [],
          '(x² + 6x + 9) − (x² − 6x + 9) = 12x, so k = 12.',
          X + "ans = sp.expand((x + 3)**2 - (x - 3)**2).coeff(x, 1)\n")

    b.mc('ADV', EER, 'H',
         'Which expression is equivalent to ((x² − 4x)/(x² − 16)) · ((x + 4)/x), for x ≠ 0, x ≠ 4, and x ≠ −4?',
         '1', ['x', '(x − 4)/x', '1/(x + 4)'],
         'Factor: x(x − 4)/((x − 4)(x + 4)) · (x + 4)/x. Every factor cancels, leaving 1.',
         X + "ans = sp.cancel((x**2 - 4*x)/(x**2 - 16)*(x + 4)/x)\n")

    b.mc('ADV', EEX, 'M',
         'Which expression is equivalent to √(50x²), for x > 0?',
         '5x√2', ['25x√2', '5√(2x)', '10x√5'],
         '√(50x²) = √(25 · 2 · x²) = 5x√2.',
         XPOS + "ans = sp.sqrt(50*x**2)\n")

    b.mc('ADV', EEX, 'H',
         'Which expression is equivalent to 3^(x + 2) − 3^x?',
         '8(3^x)', ['3²', '2(3^x)', '9(3^x)'],
         '3^(x + 2) = 9 · 3^x, so 9 · 3^x − 3^x = 8 · 3^x.',
         X + "ans = sp.expand(3**(x + 2) - 3**x)\nP_ = P\nP = lambda t: sp.expand(P_(t))\n")

    b.spr('ADV', EE, 'H',
          'The equation (x − 2)(x + k) = x² + 3x − 10 is true for all values of x, where k is a constant. What is the value of k?',
          '5', [],
          'Expanding gives x² + (k − 2)x − 2k. Matching the constant: −2k = −10, so k = 5, and the x-term checks: 5 − 2 = 3.',
          "x, k = sp.symbols('x k')\ne = sp.expand((x - 2)*(x + k) - (x**2 + 3*x - 10))\ns = sp.solve(e.coeff(x, 0), k)[0]\nassert e.coeff(x, 1).subs(k, s) == 0\nans = s\n")

    # ── Nonlinear equations and systems ──────────────────────────────
    b.mc('ADV', NEQ, 'E',
         'What are the solutions to the equation x² − 81 = 0?',
         'x = 9 and x = −9', ['x = 9 only', 'x = 81 and x = −81', 'x = 3 and x = −3'],
         'x² = 81, and both 9² and (−9)² equal 81.',
         X + "assert sorted(sp.solve(x**2 - 81, x)) == [-9, 9]\n",
         custom="assert C[K] == 'x = 9 and x = −9'\n")

    b.spr('ADV', NEQ, 'E',
          'If 2x² = 50 and x > 0, what is the value of x?',
          '5', [],
          'x² = 25, and the positive square root is 5.',
          X + "ans = [r for r in sp.solve(2*x**2 - 50, x) if r > 0][0]\n")

    b.mc('ADV', NEQ, 'M',
         'What is the product of the solutions to the equation x² + 6x + 9 = 25?',
         '−16', ['16', '−6', '10'],
         'The left side is (x + 3)², so x + 3 = ±5 and x = 2 or x = −8. Their product is −16. (Note the equation equals 25, not 0, so the product is NOT 9.)',
         X + "r = sp.solve(x**2 + 6*x + 9 - 25, x)\nans = r[0]*r[1]\n")

    b.mc('ADV', NER, 'M',
         'If √(x − 4) + 3 = 8, what is the value of x?',
         '29', ['9', '21', '1'],
         'Subtract 3: √(x − 4) = 5. Square: x − 4 = 25, so x = 29.',
         X + "ans = sp.solve(sp.sqrt(x - 4) + 3 - 8, x)[0]\n")

    b.spr('ADV', NERA, 'M',
          'What value of x satisfies the equation 3/x + 1/(2x) = 7/4 ?',
          '2', [],
          'Combine the left side over 2x: 6/(2x) + 1/(2x) = 7/(2x). Then 7/(2x) = 7/4 means 2x = 4 and x = 2.',
          X + "ans = sp.solve(3/x + 1/(2*x) - sp.Rational(7, 4), x)[0]\n")

    b.mc('ADV', NEQ, 'M',
         'The graph of y = x² + bx + 12, where b is a constant, is shown. It crosses the x-axis at x = 2 and at x = r. What is the value of r?',
         '6', ['10', '−6', '4'],
         'The product of the solutions of x² + bx + 12 = 0 is 12, so 2r = 12 and r = 6. (The graph shows the second x-intercept at 6, and b = −8.)',
         X + "bb = sp.Symbol('bb')\nbv = sp.solve((x**2 + bb*x + 12).subs(x, 2), bb)[0]\nr = [v for v in sp.solve(x**2 + bv*x + 12, x) if v != 2]\nans = r[0]\n",
         figure={'kind': 'fgraph', 'params': {'expr': 'x**2 - 8*x + 12', 'xmin': -1, 'xmax': 9, 'ymin': -6, 'ymax': 14}})

    b.mc('ADV', NES, 'H',
         'y = 2x² − 5x + 1\ny = x − 3\nThe graphs of the equations above are shown in the xy-plane. How many points do the two graphs have in common?',
         'Exactly two', ['None', 'Exactly one', 'Infinitely many'],
         'Setting 2x² − 5x + 1 = x − 3 gives 2x² − 6x + 4 = 0, or x² − 3x + 2 = 0, with solutions x = 1 and x = 2. Two solutions means two points.',
         X + "assert len(sp.solve(2*x**2 - 5*x + 1 - (x - 3), x)) == 2\n",
         custom="assert C[K] == 'Exactly two'\n",
         figure={'kind': 'region', 'params': {'expr1': '2*x**2 - 5*x + 1', 'expr2': 'x - 3', 'xmin': -1, 'xmax': 4, 'ymin': -5, 'ymax': 8}})

    b.spr('ADV', NES, 'H',
          'x² + y = 10\ny = 3x\nIf (a, b) is a solution to the system of equations above and a < 0, what is the value of b?',
          '-15', [],
          'Substitute y = 3x: x² + 3x − 10 = 0, so (x + 5)(x − 2) = 0. With a < 0, a = −5 and b = 3(−5) = −15.',
          "x, y = sp.symbols('x y')\nsols = sp.solve([x**2 + y - 10, y - 3*x], [x, y])\nans = [s[1] for s in sols if s[0] < 0][0]\n")

    b.mc('ADV', NEX, 'M',
         'If 5^(2x − 1) = 125, what is the value of x?',
         '2', ['1', '3', '1.5'],
         '125 = 5³, so 2x − 1 = 3 and x = 2.',
         X + "ans = sp.solve(2*x - 1 - 3, x)[0]\nassert 5**(2*ans - 1) == 125\n")

    b.mc('ADV', NEA, 'H',
         'What is the sum of the solutions to the equation |2x − 7| = 9 ?',
         '7', ['9', '8', '16'],
         '2x − 7 = 9 gives x = 8, and 2x − 7 = −9 gives x = −1. The sum is 8 + (−1) = 7.',
         "x = sp.Symbol('x', real=True)\nans = sum(sp.solve(sp.Abs(2*x - 7) - 9, x))\n")

    b.mc('ADV', 'Nonlinear equations', 'E',
         'What is the positive value of x that satisfies x³ = 4x ?',
         '2', ['4', '16', '1'],
         'x³ − 4x = 0 factors as x(x − 2)(x + 2) = 0. The positive solution is 2.',
         X + "ans = [r for r in sp.solve(x**3 - 4*x, x) if r > 0][0]\n")

    # ── Nonlinear functions ──────────────────────────────────────────
    b.mc('ADV', NFQ, 'E',
         'The graph of y = f(x), where f(x) = (x − 2)² − 5, is shown. At what value of y does the graph cross the y-axis?',
         '−1', ['−5', '2', '4'],
         'The y-intercept is f(0) = (0 − 2)² − 5 = 4 − 5 = −1. (−5 is the minimum value, at the vertex.)',
         X + "ans = ((x - 2)**2 - 5).subs(x, 0)\n",
         figure={'kind': 'fgraph', 'params': {'expr': '(x-2)**2 - 5', 'xmin': -2, 'xmax': 6, 'ymin': -6, 'ymax': 8}})

    b.mc('ADV', 'Nonlinear functions (quadratic evaluation)', 'E',
         'The function h is defined by h(x) = 2x² − 3. What is the value of h(−3)?',
         '15', ['−21', '33', '9'],
         'h(−3) = 2(−3)² − 3 = 2(9) − 3 = 15. Squaring −6 instead of −3 gives the 33 trap.',
         X + "ans = (2*x**2 - 3).subs(x, -3)\n")

    b.mc('ADV', NFE, 'M',
         'The graph of the exponential function f is shown. The graph passes through (0, 80) and (1, 40). What is the value of f(3)?',
         '10', ['20', '5', '0'],
         'f is cut in half for each increase of 1 in x: 80, 40, 20, 10. So f(3) = 10. (A linear drop of 40 per step would reach 0 at x = 2.)',
         X + "f = 80*sp.Rational(1, 2)**x\nassert f.subs(x, 1) == 40\nans = f.subs(x, 3)\n",
         figure={'kind': 'fgraph', 'params': {'expr': '80*0.5**x', 'xmin': -1, 'xmax': 5, 'ymin': -5, 'ymax': 90}})

    b.mc('ADV', 'Nonlinear functions (quadratic maximum)', 'E',
         'The function f is defined by f(x) = −2(x − 4)² + 9. What is the maximum value of f(x)?',
         '9', ['4', '−2', '17'],
         'The squared term −2(x − 4)² is never positive, so f is largest when it is 0, at x = 4. The maximum value is 9.',
         X + "f = -2*(x - 4)**2 + 9\nans = f.subs(x, sp.solve(sp.diff(f, x), x)[0])\n")

    b.spr('ADV', NFQ, 'M',
          'The function f is defined by f(x) = x² − 6x + c, where c is a constant. If the minimum value of f(x) is 4, what is the value of c?',
          '13', [],
          'Complete the square: f(x) = (x − 3)² + (c − 9). The minimum is c − 9 = 4, so c = 13.',
          "x, c = sp.symbols('x c')\nf = x**2 - 6*x + c\nans = sp.solve(f.subs(x, 3) - 4, c)[0]\n")

    b.mc('ADV', 'Nonlinear functions (choosing an exponential model)', 'M',
         'The table shows four values of x and the corresponding values of y. Which equation could represent the relationship between x and y?',
         'y = 2(3)^x', ['y = 3(2)^x', 'y = 4x + 2', 'y = 2x + 4'],
         'y is multiplied by 3 each time x increases by 1 (2, 6, 18, 54), starting from 2 at x = 0: y = 2(3)^x.',
         X + "ans = 2*3**x\nassert [ans.subs(x, v) for v in range(4)] == [2, 6, 18, 54]\n",
         figure={'kind': 'table', 'params': {'headers': ['x', 'y'], 'rows': [['0', '2'], ['1', '6'], ['2', '18'], ['3', '54']]}})

    b.mc('ADV', NFE, 'H',
         'The amount in a savings account t years after it was opened is modeled by A(t) = 1,200(1.05)^t. By what percent does the amount in the account increase each year?',
         '5%', ['105%', '0.05%', '1.05%'],
         'The growth factor 1.05 means each year\'s amount is 105% of the year before — an increase of 5%.',
         "ans = (sp.Rational(105, 100) - 1) * 100\n")

    b.mc('ADV', NFP, 'H',
         'The graph of the polynomial function f is shown. It crosses the x-axis at x = −2, x = 1, and x = 3. Which of the following could define f?',
         'f(x) = (x + 2)(x − 1)(x − 3)', ['f(x) = (x − 2)(x + 1)(x + 3)', 'f(x) = (x + 2)(x + 1)(x − 3)', 'f(x) = (x − 2)(x − 1)(x − 3)'],
         'A zero at x = a comes from a factor (x − a). Zeros at −2, 1, and 3 give (x + 2)(x − 1)(x − 3).',
         X + "ans = (x + 2)*(x - 1)*(x - 3)\nassert sorted(sp.solve(ans, x)) == [-2, 1, 3]\n",
         figure={'kind': 'fgraph', 'params': {'expr': '(x+2)*(x-1)*(x-3)', 'xmin': -3, 'xmax': 4, 'ymin': -10, 'ymax': 12}})

    b.spr('ADV', NFE, 'H',
          'The function f is defined by f(x) = a · b^x, where a and b are positive constants. If f(1) = 12 and f(3) = 108, what is the value of f(0)?',
          '4', [],
          'f(3)/f(1) = b² = 108/12 = 9, so b = 3. Then a · 3 = 12 gives a = 4, and f(0) = a = 4.',
          "a, bb = sp.symbols('a bb', positive=True)\ns = sp.solve([a*bb - 12, a*bb**3 - 108], [a, bb], dict=True)[0]\nans = s[a]\n")

    b.mc('ADV', NFQ, 'H',
         'The function g is defined by g(x) = x² + 4x − 5, and h(x) = g(x − 3). What are the coordinates of the vertex of the graph of y = h(x) in the xy-plane?',
         '(1, −9)', ['(−5, −9)', '(−2, −6)', '(1, −6)'],
         'g(x) = (x + 2)² − 9 has its vertex at (−2, −9). Replacing x with x − 3 shifts the graph 3 units RIGHT, to (1, −9).',
         X + "h = sp.expand((x - 3)**2 + 4*(x - 3) - 5)\nvx = sp.solve(sp.diff(h, x), x)[0]\nassert (vx, h.subs(x, vx)) == (1, -9)\n",
         custom="assert C[K] == '(1, −9)'\n")

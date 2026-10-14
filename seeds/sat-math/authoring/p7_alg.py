"""SAT bank p7 — Algebra (ALG). 34 items (11 E / 12 M / 11 H). Figures are
needed to answer and read on gridlines; no stem restates its graph."""

L1 = 'Linear equations in one variable'
L2 = 'Linear equations in two variables'
LF = 'Linear functions'
SY = 'Systems of two linear equations'
IN = 'Linear inequalities in one or two variables'
# A one-variable inequality: the 'one or two variables' label above maps to
# two-variable inequalities (ALG1.FNC.5) in scripts/satSkillMap.py.
IN1 = 'Linear inequalities in one variable'

X = "x = sp.Symbol('x')\n"
POINT = "(lambda c: [sp.Integer(v) for v in c.strip('()').replace('−', '-').split(',')])"


def exactly_one(pred):
    return f"_ok = [c for c in C if ({pred})(c)]\nassert _ok == [C[K]], _ok\n"


def rhs_is(expr_src):
    return exactly_one(f"lambda c: sp.simplify(P(c.split('=', 1)[1]) - ({expr_src})) == 0")


def add(b):
    # ── Easy (11) ────────────────────────────────────────────────────
    b.mc('ALG', L1, 'E',
         'What value of x satisfies the equation 9 + 3x = 30?',
         '7', ['13', '21', '−7'],
         'Subtract 9: 3x = 21. Divide by 3: x = 7. (13 adds 9 instead of subtracting it.)',
         X + "ans = sp.solve(9 + 3*x - 30, x)[0]\n")

    b.spr('ALG', L1, 'E',
          'What value of x satisfies the equation x/5 − 2 = 1?',
          '15', [],
          'Add 2: x/5 = 3. Multiply by 5: x = 15.',
          X + "ans = sp.solve(x/5 - 2 - 1, x)[0]\n")

    b.mc('ALG', L2, 'E',
         'Concert tickets cost $12 each, and each order has a $4 service fee. Which expression gives the total cost, in dollars, of one order of n tickets?',
         '12n + 4', ['4n + 12', '16n', '12(n + 4)'],
         'Each ticket adds $12 (12n), and the $4 fee is charged once per order: 12n + 4. (12(n + 4) charges for 4 extra tickets.)',
         "n = sp.Symbol('n')\nans = 12*n + 4\n")

    b.mc('ALG', LF, 'E',
         'The graph of the linear function f is shown. At what value of x does the graph cross the x-axis?',
         '3', ['−6', '2', '−3'],
         'The line meets the x-axis at the point (3, 0), so x = 3. (−6 is where it crosses the y-axis.)',
         X + "f = 2*x - 6\nans = sp.solve(f, x)[0]\n",
         figure={'kind': 'fgraph', 'params': {'expr': '2*x - 6', 'xmin': -2, 'xmax': 6, 'ymin': -8, 'ymax': 6}})

    b.spr('ALG', L1, 'E',
          'If 4(y + 1) = 2y + 10, what is the value of y?',
          '3', [],
          'Distribute: 4y + 4 = 2y + 10. Subtract 2y and 4: 2y = 6, so y = 3.',
          "y = sp.Symbol('y')\nans = sp.solve(4*(y + 1) - (2*y + 10), y)[0]\n")

    b.mc('ALG', IN1, 'E',
         'A tour runs only if at least 18 people sign up. Which inequality represents the numbers of people p for which the tour runs?',
         'p ≥ 18', ['p > 18', 'p ≤ 18', 'p < 18'],
         '"At least 18" includes 18 itself and anything more: p ≥ 18. (p > 18 would cancel a tour with exactly 18 people.)',
         "ans = None\n",
         custom="ok = {'p ≥ 18': (True, True), 'p > 18': (False, True), 'p ≤ 18': (True, False), 'p < 18': (False, False)}\n"
                "assert [c for c in C if ok[c] == (True, True)] == [C[K]]\n")

    b.mc('ALG', SY, 'E',
         'y = x + 3\ny = 2x\nWhich ordered pair (x, y) is the solution to the system of equations above?',
         '(3, 6)', ['(6, 3)', '(1, 4)', '(2, 4)'],
         'Set x + 3 = 2x, so x = 3 and y = 2(3) = 6. (1, 4) satisfies only the first equation; (2, 4) only the second.',
         "ans = None\n",
         custom=exactly_one(f"lambda c: (lambda p: p[1] == p[0] + 3 and p[1] == 2*p[0])({POINT}(c))"))

    b.mc('ALG', LF, 'E',
         'The function f is defined by f(x) = 7 − 2x. What is the value of f(−3)?',
         '13', ['1', '−13', '6'],
         'f(−3) = 7 − 2(−3) = 7 + 6 = 13. (1 treats −2(−3) as −6.)',
         X + "ans = (7 - 2*x).subs(x, -3)\n")

    b.spr('ALG', LF, 'E',
          'The table shows four values of x and y for a linear relationship. What is the value of y when x = 6?',
          '23', [],
          'y rises by 3 each time x rises by 1, starting from 5 at x = 0: y = 3x + 5. At x = 6, y = 23.',
          X + "pts = [(0, 5), (1, 8), (2, 11), (3, 14)]\nf = 3*x + 5\nassert all(f.subs(x, a) == v for a, v in pts)\nans = f.subs(x, 6)\n",
          figure={'kind': 'table', 'params': {'headers': ['x', 'y'], 'rows': [['0', '5'], ['1', '8'], ['2', '11'], ['3', '14']]}})

    b.mc('ALG', LF, 'E',
         'What is the y-intercept of the graph of y = −4x + 9 in the xy-plane?',
         '9', ['−4', '9/4', '4'],
         'In y = mx + b the y-intercept is b, the value of y when x = 0: 9. (9/4 is the x-intercept; −4 is the slope.)',
         X + "ans = (-4*x + 9).subs(x, 0)\n")

    b.mc('ALG', L1, 'E',
         'What value of x satisfies the equation 0.5x + 2 = 6?',
         '8', ['16', '4', '2'],
         'Subtract 2: 0.5x = 4. Divide by 0.5 (or double): x = 8. (16 forgets to subtract the 2 first.)',
         X + "ans = sp.solve(sp.Rational(1, 2)*x + 2 - 6, x)[0]\n")

    # ── Medium (12) ──────────────────────────────────────────────────
    b.spr('ALG', L1, 'M',
          'What value of x satisfies the equation 3(2x − 1) = 4x + 9?',
          '6', [],
          'Distribute: 6x − 3 = 4x + 9. Subtract 4x and add 3: 2x = 12, so x = 6.',
          X + "ans = sp.solve(3*(2*x - 1) - (4*x + 9), x)[0]\n")

    b.mc('ALG', L2, 'M',
         'A line in the xy-plane passes through the points (−1, 3) and (2, −3). Which equation represents the line?',
         'y = −2x + 1', ['y = 2x + 5', 'y = −2x − 1', 'y = −(1/2)x + 5/2'],
         'Slope = (−3 − 3)/(2 − (−1)) = −6/3 = −2. Then 3 = −2(−1) + b gives b = 1.',
         X + "ans = None\n",
         custom=rhs_is("-2*sp.Symbol('x') + 1"))

    b.mc('ALG', SY, 'M',
         'The graphs of two linear equations are shown in the xy-plane. What is the y-coordinate of the solution to the system formed by the two equations?',
         '4', ['3', '7', '−2'],
         'The lines cross at (3, 4). The solution’s y-coordinate is 4. (3 is its x-coordinate.)',
         "x, y = sp.symbols('x y')\ns = sp.solve([y - 2*x + 2, y + x - 7], [x, y])\nassert s[x] == 3\nans = s[y]\n",
         figure={'kind': 'region', 'params': {'expr1': '2*x - 2', 'expr2': '-x + 7', 'xmin': -1, 'xmax': 7, 'ymin': -3, 'ymax': 9}})

    b.spr('ALG', LF, 'M',
          'A pool is being drained. The equation V = 12,000 − 400t gives the volume V, in liters, of water left in the pool t minutes after draining begins. How many minutes does it take to drain the pool completely?',
          '30', [],
          'The pool is empty when V = 0: 400t = 12,000, so t = 30.',
          "t = sp.Symbol('t')\nans = sp.solve(12000 - 400*t, t)[0]\n")

    b.mc('ALG', IN1, 'M',
         'A student’s scores on three tests are 80, 88, and 84. What is the minimum score the student needs on a fourth test to have a mean score of at least 85 on all four tests?',
         '88', ['85', '84', '92'],
         'The four scores must total at least 4 × 85 = 340. The first three total 252, so the fourth must be at least 340 − 252 = 88.',
         "ans = min(s for s in range(0, 101) if (80 + 88 + 84 + s) / 4 >= 85)\n")

    b.spr('ALG', SY, 'M',
          'A student bought 12 items: pens that cost $2 each and notebooks that cost $5 each. The total cost was $39. How many notebooks did the student buy?',
          '5', [],
          'p + n = 12 and 2p + 5n = 39. Substitute p = 12 − n: 24 + 3n = 39, so n = 5.',
          "p, n = sp.symbols('p n')\nans = sp.solve([p + n - 12, 2*p + 5*n - 39], [p, n])[n]\n")

    b.mc('ALG', LF, 'M',
         'The graph of the linear function g is shown. For what value of x is g(x) = 6?',
         '8', ['6', '4', '14'],
         'Find 6 on the y-axis and go across to the line: it reaches y = 6 at x = 8. (The line starts at (0, 2) and rises 1 for every 2 to the right.)',
         X + "g = x/2 + 2\nans = sp.solve(g - 6, x)[0]\n",
         figure={'kind': 'fgraph', 'params': {'expr': '0.5*x + 2', 'xmin': -2, 'xmax': 10, 'ymin': -2, 'ymax': 8}})

    b.mc('ALG', L1, 'M',
         'Which of the following equations has no solution?',
         '2(x + 3) = 2x + 5', ['2(x + 3) = 2x + 6', '2(x + 3) = 3x + 6', '2x + 3 = 3x + 2'],
         '2(x + 3) = 2x + 6, so 2x + 6 = 2x + 5 would mean 6 = 5: never true, no solution. (2x + 6 = 2x + 6 is true for every x; the other two have exactly one solution each.)',
         "ans = None\n",
         custom="x = sp.Symbol('x')\nnone = lambda c: sp.solveset(P(c), x, domain=sp.S.Reals) == sp.S.EmptySet\n"
                "assert [c for c in C if none(c)] == [C[K]]\n")

    b.mc('ALG', LF, 'M',
         'What is the slope of the line 6x − 3y = 12 in the xy-plane?',
         '2', ['−2', '6', '−4'],
         'Solve for y: −3y = −6x + 12, so y = 2x − 4. The slope is 2. (−4 is the y-intercept.)',
         "x, y = sp.symbols('x y')\nans = sp.solve(6*x - 3*y - 12, y)[0].coeff(x)\n")

    b.spr('ALG', LF, 'M',
          'The daily cost C, in dollars, of renting a van and driving it m miles is C = 0.15m + 35. If the cost for one day was $62, how many miles was the van driven?',
          '180', [],
          '0.15m + 35 = 62, so 0.15m = 27 and m = 180.',
          "m = sp.Symbol('m')\nans = sp.solve(sp.Rational(15, 100)*m + 35 - 62, m)[0]\n")

    b.mc('ALG', L2, 'M',
         'Line k is perpendicular to the line y = 3x − 1 and passes through the point (3, 2). What is the y-intercept of line k?',
         '3', ['1', '−7', '2'],
         'Line k has slope −1/3. Then 2 = −(1/3)(3) + b, so b = 3. (−7 uses the original slope 3.)',
         "m = -1 / sp.Integer(3)\nans = 2 - m*3\n")

    b.mc('ALG', L1, 'M',
         'If 2a + 6 = 18, what is the value of a + 3?',
         '9', ['6', '12', '15'],
         '2a + 6 = 2(a + 3), so 2(a + 3) = 18 and a + 3 = 9. (6 is a itself.)',
         "a = sp.Symbol('a')\nans = sp.solve(2*a + 6 - 18, a)[0] + 3\n")

    # ── Hard (11) ────────────────────────────────────────────────────
    b.spr('ALG', SY, 'H',
          '(1/2)x + (1/3)y = 4\nx − y = 3\nIf (x, y) is the solution to the system of equations above, what is the value of xy?',
          '18', [],
          'Multiply the first equation by 6: 3x + 2y = 24. Substitute x = y + 3: 3y + 9 + 2y = 24, so y = 3 and x = 6. Then xy = 18.',
          "x, y = sp.symbols('x y')\ns = sp.solve([sp.Rational(1, 2)*x + sp.Rational(1, 3)*y - 4, x - y - 3], [x, y])\nans = s[x]*s[y]\n")

    b.mc('ALG', L1, 'H',
         'In the equation (a − 3)x = 8, a is a constant. For what value of a does the equation have no solution?',
         '3', ['0', '8', '−3'],
         'If a = 3, the equation becomes 0 · x = 8, which no x satisfies. For any other a, x = 8/(a − 3) is a solution.',
         "ans = None\n",
         custom="x = sp.Symbol('x')\nnone = lambda c: sp.solveset((P(c) - 3)*x - 8, x, domain=sp.S.Reals) == sp.S.EmptySet\n"
                "assert [c for c in C if none(c)] == [C[K]]\n")

    b.mc('ALG', LF, 'H',
         'A line in the xy-plane has slope 3 and passes through the points (2, 5) and (k, 11). What is the value of k?',
         '4', ['6', '2', '5'],
         'Slope = (11 − 5)/(k − 2) = 3, so 6 = 3(k − 2) and k = 4.',
         "k = sp.Symbol('k')\nans = sp.solve(sp.Rational(1)*(11 - 5) - 3*(k - 2), k)[0]\n")

    b.mc('ALG', IN1, 'H',
         '3x − 7 < 2x + 5 < 4x − 1\nWhich of the following values of x satisfies both inequalities above?',
         '5', ['3', '12', '2'],
         'The left inequality gives x < 12. The right one gives 6 < 2x, so x > 3. Only 5 is strictly between 3 and 12.',
         "ans = None\n",
         custom=exactly_one("lambda c: 3*P(c) - 7 < 2*P(c) + 5 < 4*P(c) - 1"))

    b.spr('ALG', L1, 'H',
          'Two cars leave the same point at the same time and travel in opposite directions, one at 45 miles per hour and the other at 55 miles per hour. After how many hours will the cars be 350 miles apart?',
          '3.5', ['7/2'],
          'The distance between them grows by 45 + 55 = 100 miles each hour: 100t = 350, so t = 3.5.',
          "t = sp.Symbol('t')\nans = sp.solve((45 + 55)*t - 350, t)[0]\n")

    b.mc('ALG', SY, 'H',
         '3x + ky = 6\n6x + 8y = 5\nIn the system of equations above, k is a constant. For what value of k does the system have no solution?',
         '4', ['8', '2', '−4'],
         'Double the first equation: 6x + 2ky = 12. With 2k = 8, or k = 4, the left sides match while 12 ≠ 5, so the lines are parallel and distinct.',
         "ans = None\n",
         custom="x, y = sp.symbols('x y')\n_ok = [c for c in C if sp.solve([3*x + P(c)*y - 6, 6*x + 8*y - 5], [x, y], dict=True) == []]\nassert _ok == [C[K]], _ok\n")

    b.mc('ALG', L2, 'H',
         'Phone plan A costs $40 per month plus $0.05 per minute of calls. Plan B costs $25 per month plus $0.10 per minute. For how many minutes of calls in a month do the two plans cost the same?',
         '300', ['150', '650', '30'],
         '40 + 0.05m = 25 + 0.10m, so 15 = 0.05m and m = 300.',
         "m = sp.Symbol('m')\nans = sp.solve(40 + sp.Rational(5, 100)*m - (25 + sp.Rational(10, 100)*m), m)[0]\n")

    b.spr('ALG', LF, 'H',
          'For the linear function f, f(3) = 1 and f(−1) = 9. For what value of x is f(x) = 0?',
          '3.5', ['7/2'],
          'Slope = (1 − 9)/(3 − (−1)) = −2, so f(x) = −2x + 7. Then −2x + 7 = 0 gives x = 3.5.',
          X + "m = sp.Rational(1 - 9, 3 - (-1))\nf = m*(x - 3) + 1\nans = sp.solve(f, x)[0]\n")

    b.mc('ALG', L2, 'H',
         'If 4x − 2y = 10, what is the value of 2x − y?',
         '5', ['10', '20', '2.5'],
         '4x − 2y = 2(2x − y), so 2(2x − y) = 10 and 2x − y = 5. No need to find x or y.',
         "x, y = sp.symbols('x y')\nans = sp.Rational(10, 2)\nassert sp.simplify((4*x - 2*y) / (2*x - y)) == 2\n")

    b.mc('ALG', LF, 'H',
         'The equation F = 1.8C + 32 converts a temperature C in degrees Celsius to F in degrees Fahrenheit. An increase of 5 degrees Fahrenheit corresponds to an increase of how many degrees Celsius?',
         '25/9', ['9', '1.8', '41'],
         'F rises 1.8 for each degree Celsius, so a rise of 5 in F needs 5/1.8 = 25/9 degrees Celsius (about 2.8). (9 multiplies by 1.8 instead of dividing.)',
         "ans = sp.Rational(5) / sp.Rational(18, 10)\n")

    b.spr('ALG', L1, 'H',
          'The sum of three consecutive even integers is 78. What is the largest of the three integers?',
          '28', [],
          'n + (n + 2) + (n + 4) = 78, so 3n + 6 = 78 and n = 24. The integers are 24, 26, and 28.',
          "n = sp.Symbol('n')\nn0 = sp.solve(3*n + 6 - 78, n)[0]\nassert n0 % 2 == 0\nans = n0 + 4\n")

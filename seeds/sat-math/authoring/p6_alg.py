"""SAT bank p6 — Algebra (ALG). 32 items (10 E / 12 M / 10 H). Figures are
needed to answer: no stem restates its graph or table, and every point a
student must read sits on a gridline (fgraph y-ticks run every 2)."""

L1 = 'Linear equations in one variable'
L1F = 'Linear equations in one variable (solving for a variable)'
L2 = 'Linear equations in two variables'
LF = 'Linear functions'
SY = 'Systems of two linear equations'
IN = 'Linear inequalities in one or two variables'
# A one-variable inequality: the 'one or two variables' label above maps to
# two-variable inequalities (ALG1.FNC.5) in scripts/satSkillMap.py.
IN1 = 'Linear inequalities in one variable'

X = "x = sp.Symbol('x')\n"


def exactly_one(pred):
    """Custom check: the key is the ONLY choice satisfying `pred` (a lambda over the choice text)."""
    return f"_ok = [c for c in C if ({pred})(c)]\nassert _ok == [C[K]], _ok\n"


def rhs_is(expr_src):
    """Custom check: the key is the ONE choice whose right-hand side equals `expr_src` (sympy, in x/b)."""
    return exactly_one(f"lambda c: sp.simplify(P(c.split('=', 1)[1]) - ({expr_src})) == 0")


POINT = "(lambda c: [sp.Integer(v) for v in c.strip('()').replace('−', '-').split(',')])"


def add(b):
    # ── Easy (10) ────────────────────────────────────────────────────
    b.mc('ALG', L1, 'E',
         'What value of x satisfies the equation 7x + 4 = 39?',
         '5', ['43/7', '35', '6'],
         'Subtract 4 from both sides: 7x = 35. Divide by 7: x = 5. (43/7 adds the 4 instead of subtracting it.)',
         X + "ans = sp.solve(7*x + 4 - 39, x)[0]\n")

    b.spr('ALG', L1, 'E',
          'If 2(x − 5) = 14, what is the value of x?',
          '12', [],
          'Divide both sides by 2: x − 5 = 7, so x = 12.',
          X + "ans = sp.solve(2*(x - 5) - 14, x)[0]\n")

    b.mc('ALG', L2, 'E',
         'A gym charges a one-time membership fee of $25 plus $10 for each class. Which expression gives the total cost, in dollars, of the membership and c classes?',
         '10c + 25', ['25c + 10', '35c', '10c − 25'],
         'The $10 is charged once per class (10c), and the $25 fee is charged once: 10c + 25.',
         "c = sp.Symbol('c')\nans = 10*c + 25\n")

    b.spr('ALG', LF, 'E',
          'The graph of the linear function f is shown. What is the value of f(3)?',
          '2', [],
          'Go to x = 3 on the graph and read up to the line: it is at y = 2, so f(3) = 2. (The line passes through (0, −4) and (2, 0), rising 2 for each step of 1.)',
          X + "f = 2*x - 4\nans = f.subs(x, 3)\n",
          figure={'kind': 'fgraph', 'params': {'expr': '2*x - 4', 'xmin': -2, 'xmax': 5, 'ymin': -6, 'ymax': 6}})

    b.mc('ALG', L1, 'E',
         'What is the solution to the equation x − 9 = −4?',
         '5', ['−13', '13', '−5'],
         'Add 9 to both sides: x = −4 + 9 = 5.',
         X + "ans = sp.solve(x - 9 + 4, x)[0]\n")

    b.mc('ALG', IN1, 'E',
         'Which of the following values of x is NOT a solution to the inequality 2x + 1 ≤ 11?',
         '6', ['5', '0', '−3'],
         '2x + 1 ≤ 11 means 2x ≤ 10, so x ≤ 5. Every choice is at most 5 except 6.',
         "ans = None\n",
         custom=exactly_one("lambda c: not (2*P(c) + 1 <= 11)"))

    b.mc('ALG', L1, 'E',
         'If 5y = 3y + 18, what is the value of y?',
         '9', ['18', '6', '9/4'],
         'Subtract 3y from both sides: 2y = 18, so y = 9.',
         "y = sp.Symbol('y')\nans = sp.solve(5*y - 3*y - 18, y)[0]\n")

    b.mc('ALG', SY, 'E',
         'x = 2y\nx + y = 12\nWhat is the value of y in the solution to the system of equations above?',
         '4', ['8', '6', '12'],
         'Substitute x = 2y: 2y + y = 12, so 3y = 12 and y = 4. (8 is x.)',
         "x, y = sp.symbols('x y')\nans = sp.solve([x - 2*y, x + y - 12], [x, y])[y]\n")

    b.mc('ALG', LF, 'E',
         'A line in the xy-plane passes through the points (1, 2) and (4, 11). What is the slope of the line?',
         '3', ['1/3', '9', '2'],
         'Slope = (11 − 2)/(4 − 1) = 9/3 = 3. (1/3 divides the run by the rise.)',
         "ans = sp.Rational(11 - 2, 4 - 1)\n")

    b.spr('ALG', LF, 'E',
          'The table shows the number of pages p that a printer has printed t minutes after starting a job. The relationship is linear. How many pages does the printer print per minute?',
          '15', [],
          'From 2 to 5 minutes the count rises from 30 to 75: 45 pages in 3 minutes, or 15 pages per minute. (From 5 to 9 minutes: 60 pages in 4 minutes, the same rate.)',
          "pts = [(2, 30), (5, 75), (9, 135)]\nans = sp.Rational(75 - 30, 5 - 2)\nassert all(sp.Rational(v - 30, t - 2) == ans for t, v in pts[1:])\n",
          figure={'kind': 'table', 'params': {'headers': ['Time t (minutes)', 'Pages printed p'], 'rows': [['2', '30'], ['5', '75'], ['9', '135']]}})

    # ── Medium (12) ──────────────────────────────────────────────────
    b.mc('ALG', L1, 'M',
         'What value of x satisfies the equation (x + 3)/2 = (x − 1)/3?',
         '−11', ['11', '−5', '5'],
         'Multiply both sides by 6: 3(x + 3) = 2(x − 1), so 3x + 9 = 2x − 2 and x = −11.',
         X + "ans = sp.solve((x + 3)/2 - (x - 1)/3, x)[0]\n")

    b.spr('ALG', L1, 'M',
          'In the equation 2(x + 4) + x = kx + 8, k is a constant. If the equation has infinitely many solutions, what is the value of k?',
          '3', [],
          'The left side simplifies to 3x + 8. The equation holds for every x exactly when kx + 8 is the same expression, so k = 3.',
          X + "k = sp.Symbol('k')\nans = sp.solve(sp.expand(2*(x + 4) + x - (k*x + 8)).coeff(x, 1), k)[0]\nassert sp.expand(2*(x + 4) + x - (ans*x + 8)) == 0\n")

    b.mc('ALG', SY, 'M',
         'The graphs of two linear equations are shown in the xy-plane. What is the x-coordinate of the solution to the system formed by the two equations?',
         '2', ['4', '6', '−2'],
         'The solution is the point where the lines cross, (2, 4). Its x-coordinate is 2. (4 is the y-coordinate.)',
         "x, y = sp.symbols('x y')\ns = sp.solve([y - x - 2, y + x - 6], [x, y])\nassert s[y] == 4\nans = s[x]\n",
         figure={'kind': 'region', 'params': {'expr1': 'x + 2', 'expr2': '-x + 6', 'xmin': -2, 'xmax': 7, 'ymin': -2, 'ymax': 9}})

    b.mc('ALG', L2, 'M',
         'A phone plan charges $30 per month plus $0.10 for each text message sent. One month the bill was $42.50. How many text messages were sent that month?',
         '125', ['425', '12.5', '725'],
         '30 + 0.10t = 42.50, so 0.10t = 12.50 and t = 125. (425 forgets to subtract the $30 first.)',
         "t = sp.Symbol('t')\nans = sp.solve(30 + sp.Rational(1, 10)*t - sp.Rational(85, 2), t)[0]\n")

    b.mc('ALG', L2, 'M',
         'Which equation represents the line that passes through the origin and is parallel to the line 3x + y = 8?',
         'y = −3x', ['y = 3x', 'y = −(1/3)x', 'y = 8 − 3x'],
         'Rewrite 3x + y = 8 as y = −3x + 8: slope −3. A parallel line through the origin has slope −3 and y-intercept 0: y = −3x. (y = 8 − 3x is the original line, not one through the origin.)',
         X + "ans = None\n",
         custom=rhs_is("-3*sp.Symbol('x')"))

    b.mc('ALG', IN1, 'M',
         'A delivery truck can carry at most 2,000 pounds. The driver weighs 180 pounds, and each box weighs 45 pounds. What is the greatest number of boxes the truck can carry on a trip with the driver?',
         '40', ['41', '44', '45'],
         '180 + 45b ≤ 2,000, so 45b ≤ 1,820 and b ≤ 40.4. The greatest whole number of boxes is 40. (Rounding 40.4 up to 41 would put the truck over its limit.)',
         "ans = max(n for n in range(0, 100) if 180 + 45*n <= 2000)\n")

    b.mc('ALG', LF, 'M',
         'The graph of the linear function h is shown. Which equation defines h?',
         'h(x) = −(1/2)x + 4', ['h(x) = −2x + 4', 'h(x) = (1/2)x + 4', 'h(x) = −(1/2)x + 8'],
         'The line crosses the y-axis at 4 and passes through (8, 0): it falls 4 over a run of 8, a slope of −1/2. So h(x) = −(1/2)x + 4.',
         X + "ans = None\n",
         custom=rhs_is("-sp.Rational(1, 2)*sp.Symbol('x') + 4"),
         figure={'kind': 'fgraph', 'params': {'expr': '-0.5*x + 4', 'xmin': -2, 'xmax': 10, 'ymin': -2, 'ymax': 6}})

    b.spr('ALG', SY, 'M',
          '3x + 2y = 16\nx − 2y = 0\nIf (x, y) is the solution to the system of equations above, what is the value of x + y?',
          '6', [],
          'Add the equations: 4x = 16, so x = 4. Then 4 − 2y = 0 gives y = 2, and x + y = 6.',
          "x, y = sp.symbols('x y')\ns = sp.solve([3*x + 2*y - 16, x - 2*y], [x, y])\nans = s[x] + s[y]\n")

    b.mc('ALG', IN, 'M',
         'y ≤ −x + 4\ny > 1\nWhich of the following points (x, y) is a solution to the system of inequalities above?',
         '(1, 2)', ['(3, 2)', '(0, 1)', '(2, 3)'],
         'Check (1, 2): 2 ≤ −1 + 4 = 3 ✓ and 2 > 1 ✓. (3, 2) needs y ≤ 1; (0, 1) fails y > 1 because 1 is not greater than 1; (2, 3) needs y ≤ 2.',
         "ans = None\n",
         custom=exactly_one(f"lambda c: (lambda p: p[1] <= -p[0] + 4 and p[1] > 1)({POINT}(c))"))

    b.mc('ALG', LF, 'M',
         'The equation T = 72 − 3.5h models the temperature T, in degrees Fahrenheit, h hours after sunset on a certain evening. What is the best interpretation of the number 72?',
         'The temperature at sunset',
         ['The number of degrees the temperature drops each hour', 'The number of hours until the temperature reaches 0', 'The temperature 1 hour after sunset'],
         'At sunset, h = 0, and T = 72. The 3.5 is the drop per hour; the temperature 1 hour after sunset is 68.5.',
         "h = sp.Symbol('h')\nT = 72 - sp.Rational(7, 2)*h\nassert T.subs(h, 0) == 72\nans = None\n",
         custom="assert C[K] == 'The temperature at sunset'\n")

    b.spr('ALG', LF, 'M',
          'For the linear function f, f(2) = 7 and f(6) = 19. What is the value of f(10)?',
          '31', [],
          'From x = 2 to x = 6, f rises 12 over 4: a slope of 3. Four more units to x = 10 adds another 12: f(10) = 19 + 12 = 31.',
          "m = sp.Rational(19 - 7, 6 - 2)\nans = 19 + m*(10 - 6)\n")

    b.mc('ALG', L1F, 'M',
         'If 3a − 2b = 12, which equation correctly expresses a in terms of b?',
         'a = (2b + 12)/3', ['a = (12 − 2b)/3', 'a = 2b + 4', 'a = (2b + 12)/2'],
         'Add 2b to both sides: 3a = 2b + 12. Divide by 3: a = (2b + 12)/3.',
         "a_, b_ = sp.symbols('a b')\nans = None\n",
         custom="a_, b_ = sp.symbols('a b')\nsol = sp.solve(3*a_ - 2*b_ - 12, a_)[0]\n"
                "_ok = [c for c in C if sp.simplify(P(c.split('=', 1)[1]).subs(sp.Symbol('b'), b_) - sol) == 0]\nassert _ok == [C[K]], _ok\n")

    # ── Hard (10) ────────────────────────────────────────────────────
    b.spr('ALG', SY, 'H',
          'ax + 3y = 7\n4x + 6y = 14\nIn the system of equations above, a is a constant. For what value of a does the system have infinitely many solutions?',
          '2', [],
          'Divide the second equation by 2: 2x + 3y = 7. The first equation is the same line exactly when a = 2.',
          "x, y, a = sp.symbols('x y a')\nans = sp.Rational(4, 2)\nsols = sp.solve([ans*x + 3*y - 7, 4*x + 6*y - 14], [x, y], dict=True)\nassert len(sols) == 1 and len(sols[0]) == 1\n")

    b.mc('ALG', L2, 'H',
         'A line in the xy-plane has slope −2/3 and passes through the point (6, −2). At what value of x does the line cross the x-axis?',
         '3', ['−3', '2', '9'],
         'y + 2 = −(2/3)(x − 6) gives y = −(2/3)x + 2. Set y = 0: (2/3)x = 2, so x = 3. (2 is the y-intercept.)',
         X + "line = sp.Rational(-2, 3)*(x - 6) - 2\nans = sp.solve(line, x)[0]\n")

    b.spr('ALG', SY, 'H',
          'The sum of two numbers is 38. The larger number is 2 more than 3 times the smaller number. What is the larger number?',
          '29', [],
          'Let s be the smaller: s + (3s + 2) = 38, so 4s = 36 and s = 9. The larger is 3(9) + 2 = 29.',
          "s = sp.Symbol('s')\ns0 = sp.solve(s + 3*s + 2 - 38, s)[0]\nans = 3*s0 + 2\n")

    b.mc('ALG', IN1, 'H',
         'If 4 < 2x − 6 < 10, which of the following could be the value of x?',
         '6', ['5', '8', '4'],
         'Add 6 to each part: 10 < 2x < 16. Divide by 2: 5 < x < 8. Only 6 is strictly between 5 and 8.',
         "ans = None\n",
         custom=exactly_one("lambda c: 4 < 2*P(c) - 6 < 10"))

    b.mc('ALG', SY, 'H',
         'A chemist mixes a 10% acid solution with a 30% acid solution to make 20 liters of a 25% acid solution. How many liters of the 30% solution does the chemist use?',
         '15', ['5', '10', '12.5'],
         'a + b = 20 and 0.10a + 0.30b = 0.25(20) = 5. Substitute a = 20 − b: 2 + 0.20b = 5, so b = 15. (5 is the amount of the 10% solution.)',
         "a, b_ = sp.symbols('a b')\nans = sp.solve([a + b_ - 20, sp.Rational(1, 10)*a + sp.Rational(3, 10)*b_ - 5], [a, b_])[b_]\n")

    b.spr('ALG', L2, 'H',
          'A line in the xy-plane passes through the points (−2, 5) and (4, −7). What is the y-intercept of the line?',
          '1', [],
          'Slope = (−7 − 5)/(4 − (−2)) = −12/6 = −2. Then 5 = −2(−2) + b gives b = 1.',
          "m = sp.Rational(-7 - 5, 4 - (-2))\nans = 5 - m*(-2)\nassert m*4 + ans == -7\n")

    b.mc('ALG', SY, 'H',
         '2x − y = 5\nkx − 3y = 10\nIn the system of equations above, k is a constant. For what value of k does the system have no solution?',
         '6', ['2', '−6', '3'],
         'No solution means parallel, distinct lines. Multiply the first equation by 3: 6x − 3y = 15. With k = 6 the second equation is 6x − 3y = 10: same left side, different right side, so no solution.',
         "x, y = sp.symbols('x y')\nans = None\n",
         custom="x, y = sp.symbols('x y')\n_ok = [c for c in C if sp.solve([2*x - y - 5, P(c)*x - 3*y - 10], [x, y], dict=True) == []]\nassert _ok == [C[K]], _ok\n")

    b.mc('ALG', LF, 'H',
         'For the linear function f, f(0) = 7, and the value of f(x) decreases by 4 each time x increases by 2. Which equation defines f?',
         'f(x) = −2x + 7', ['f(x) = −4x + 7', 'f(x) = 7x − 2', 'f(x) = −2x − 7'],
         'The slope is −4/2 = −2, and f(0) = 7 is the y-intercept: f(x) = −2x + 7. (−4x + 7 drops 4 for every increase of 1, not 2.)',
         X + "ans = None\n",
         custom=rhs_is("-2*sp.Symbol('x') + 7"))

    b.spr('ALG', L1, 'H',
          'What value of x satisfies the equation (2/3)(x + 6) = (1/4)(x + 26)?',
          '6', [],
          'Multiply both sides by 12: 8(x + 6) = 3(x + 26), so 8x + 48 = 3x + 78, 5x = 30, and x = 6.',
          X + "ans = sp.solve(sp.Rational(2, 3)*(x + 6) - sp.Rational(1, 4)*(x + 26), x)[0]\n")

    b.mc('ALG', IN1, 'H',
         'The line y = 2x + b passes through the point (3, 1). For which values of x is y greater than 7?',
         'x > 6', ['x > 1', 'x < 6', 'x > 4'],
         '1 = 2(3) + b gives b = −5, so y = 2x − 5. Then 2x − 5 > 7 means 2x > 12, or x > 6.',
         X + "b_ = 1 - 2*3\nsol = sp.solve_univariate_inequality(2*x + b_ > 7, x, relational=False)\n"
             "oo = sp.oo\nopts = {'x > 6': sp.Interval.open(6, oo), 'x > 1': sp.Interval.open(1, oo), 'x < 6': sp.Interval.open(-oo, 6), 'x > 4': sp.Interval.open(4, oo)}\nans = None\n",
         custom="assert [c for c in C if opts[c] == sol] == [C[K]]\n")

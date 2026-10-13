"""SAT bank p5 — Algebra (ALG). 28 items, weighted EASY (12 E / 11 M / 5 H):
the PSAT (psat-math) draws this bank on a lower curve, and easy items were the
thinnest band."""

L1 = 'Linear equations in one variable'
L1F = 'Linear equations in one variable (solving for a variable)'
L2 = 'Linear equations in two variables'
LF = 'Linear functions'
SY = 'Systems of two linear equations'
IN = 'Linear inequalities in one or two variables'

X = "x = sp.Symbol('x')\n"


def exactly_one(pred):
    """Custom check: the key is the ONLY choice satisfying `pred` (a lambda over the choice text)."""
    return f"_ok = [c for c in C if ({pred})(c)]\nassert _ok == [C[K]], _ok\n"


def add(b):
    # ── Easy (12) ────────────────────────────────────────────────────
    b.mc('ALG', L1, 'E',
         'What value of x satisfies the equation 4x − 7 = 13?',
         '5', ['3/2', '20', '−3/2'],
         'Add 7 to both sides: 4x = 20. Divide by 4: x = 5.',
         X + "ans = sp.solve(4*x - 7 - 13, x)[0]\n")

    b.mc('ALG', L1, 'E',
         'If 3(x + 2) = 27, what is the value of x?',
         '7', ['9', '25/3', '23/3'],
         'Divide both sides by 3: x + 2 = 9, so x = 7. (9 is x + 2, not x.)',
         X + "ans = sp.solve(3*(x + 2) - 27, x)[0]\n")

    b.mc('ALG', L2, 'E',
         'A taxi charges a flat fee of $3 plus $2 for each mile driven. Which equation gives the total cost T, in dollars, of a ride of m miles?',
         'T = 2m + 3', ['T = 3m + 2', 'T = 5m', 'T = 2m − 3'],
         'The $2 is charged once per mile (2m); the $3 is charged once per ride. T = 2m + 3.',
         "m = sp.Symbol('m')\ncost = lambda t: sp.expand(P(t.split('=')[1]))\nans = 2*m + 3\n",
         custom=exactly_one("lambda c: sp.expand(P(c.split('=')[1]) - (2*sp.Symbol('m') + 3)) == 0"))

    b.mc('ALG', LF, 'E',
         'The graph of a line in the xy-plane is shown. What is the slope of the line?',
         '−2', ['2', '6', '3'],
         'The line passes through (0, 6) and (3, 0), so slope = (0 − 6)/(3 − 0) = −6/3 = −2. (6 is the y-intercept; 3 is where the line crosses the x-axis.)',
         "ans = sp.Rational(0 - 6, 3 - 0)\n",
         figure={'kind': 'fgraph', 'params': {'expr': '-2*x + 6', 'xmin': -2, 'xmax': 5, 'ymin': -4, 'ymax': 8}})

    b.spr('ALG', L2, 'E',
          'If 2x + 3y = 12 and x = 3, what is the value of y?',
          '2', [],
          'Substitute x = 3: 6 + 3y = 12, so 3y = 6 and y = 2.',
          "y = sp.Symbol('y')\nans = sp.solve(2*3 + 3*y - 12, y)[0]\n")

    b.mc('ALG', L1, 'E',
         'What is the solution to the equation x/4 + 1 = 6?',
         '20', ['7', '28', '5/4'],
         'Subtract 1: x/4 = 5. Multiply by 4: x = 20. (28 adds the 1 instead of subtracting it.)',
         X + "ans = sp.solve(x/4 + 1 - 6, x)[0]\n")

    b.mc('ALG', IN, 'E',
         'Which of the following values of x satisfies the inequality 3x − 5 > 10?',
         '6', ['5', '4', '0'],
         '3x − 5 > 10 means 3x > 15, so x > 5. Only 6 is greater than 5 (x = 5 gives 10 > 10, which is false).',
         "ans = None\n",
         custom=exactly_one("lambda c: 3*P(c) - 5 > 10"))

    b.mc('ALG', SY, 'E',
         'x + y = 10\nx − y = 4\nWhat is the value of x in the solution to the system of equations above?',
         '7', ['3', '6', '14'],
         'Add the two equations: 2x = 14, so x = 7. (3 is y; 14 is 2x.)',
         "x, y = sp.symbols('x y')\nans = sp.solve([x + y - 10, x - y - 4], [x, y])[x]\n")

    b.mc('ALG', LF, 'E',
         'The function f is defined by f(x) = 5x − 3. What is the value of f(4)?',
         '17', ['20', '23', '7/5'],
         'f(4) = 5(4) − 3 = 20 − 3 = 17.',
         X + "ans = (5*x - 3).subs(x, 4)\n")

    b.spr('ALG', LF, 'E',
          'The table shows the total cost y, in dollars, of buying x tickets to a school play. The relationship is linear. What is the total cost, in dollars, of buying 7 tickets?',
          '56', [],
          'Each ticket adds $8 (8, 16, 24 for 1, 2, 3 tickets), and 0 tickets cost $0, so y = 8x. For 7 tickets: 8(7) = 56.',
          X + "pts = [(1, 8), (2, 16), (3, 24)]\nf = 8*x\nassert all(f.subs(x, a) == v for a, v in pts)\nans = f.subs(x, 7)\n",
          figure={'kind': 'table', 'params': {'headers': ['Tickets, x', 'Total cost, y ($)'], 'rows': [['1', '8'], ['2', '16'], ['3', '24']]}})

    b.mc('ALG', L1, 'E',
         'A plumber charges a $40 service fee plus $65 for each hour of work. A customer’s bill was $235. For how many hours did the plumber work?',
         '3', ['3.6', '5', '2'],
         '40 + 65h = 235, so 65h = 195 and h = 3. (3.6 forgets to subtract the $40 fee first.)',
         "h = sp.Symbol('h')\nans = sp.solve(40 + 65*h - 235, h)[0]\n")

    b.mc('ALG', L2, 'E',
         'Which of the following points lies on the line y = 3x − 1?',
         '(2, 5)', ['(5, 2)', '(1, 3)', '(0, 1)'],
         'At x = 2, y = 3(2) − 1 = 5, so (2, 5) is on the line. Check the others: (5, 2) needs y = 14; (1, 3) needs y = 2; (0, 1) needs y = −1.',
         "ans = None\n",
         custom=exactly_one("lambda c: (lambda p: p[1] == 3*p[0] - 1)([sp.Integer(v) for v in c.strip('()').replace('−', '-').split(',')])"))

    # ── Medium (11) ──────────────────────────────────────────────────
    b.spr('ALG', L1, 'M',
          'What value of x satisfies the equation 5(x − 2) = 2x + 11?',
          '7', [],
          'Distribute: 5x − 10 = 2x + 11. Subtract 2x: 3x − 10 = 11. Add 10: 3x = 21, so x = 7.',
          X + "ans = sp.solve(5*(x - 2) - (2*x + 11), x)[0]\n")

    b.mc('ALG', L2, 'M',
         'A line in the xy-plane passes through the points (1, 4) and (3, 10). Which equation represents the line?',
         'y = 3x + 1', ['y = 3x + 4', 'y = (1/3)x + 4', 'y = 6x − 2'],
         'Slope = (10 − 4)/(3 − 1) = 3. Then 4 = 3(1) + b gives b = 1. (y = 6x − 2 fits (1, 4) but gives 16 at x = 3.)',
         X + "m = sp.Rational(10 - 4, 3 - 1)\nans = m*x + (4 - m*1)\nassert ans.subs(x, 3) == 10\n")

    b.spr('ALG', SY, 'M',
          '2x + y = 11\nx − y = 1\nIf (x, y) is the solution to the system of equations above, what is the value of x + y?',
          '7', [],
          'Add the equations: 3x = 12, so x = 4. Then y = x − 1 = 3, and x + y = 7.',
          "x, y = sp.symbols('x y')\ns = sp.solve([2*x + y - 11, x - y - 1], [x, y])\nans = s[x] + s[y]\n")

    b.mc('ALG', SY, 'M',
         'The graphs of y = −x + 6 and y = 2x are shown in the xy-plane. What is the solution (x, y) to the system of these two equations?',
         '(2, 4)', ['(4, 2)', '(0, 6)', '(6, 0)'],
         'The solution is where the lines cross: −x + 6 = 2x gives 3x = 6, so x = 2 and y = 2(2) = 4.',
         "x, y = sp.symbols('x y')\ns = sp.solve([y + x - 6, y - 2*x], [x, y])\nassert (s[x], s[y]) == (2, 4)\nans = None\n",
         custom="assert C[K] == '(2, 4)' and len(set(C)) == 4\n",
         figure={'kind': 'region', 'params': {'expr1': '-x + 6', 'expr2': '2*x', 'xmin': -2, 'xmax': 7, 'ymin': -2, 'ymax': 9}})

    b.spr('ALG', L1, 'M',
          'In the equation 3(x + k) = 3x + 12, k is a constant. For what value of k does the equation have infinitely many solutions?',
          '4', [],
          'The left side is 3x + 3k. The equation holds for every x exactly when 3k = 12, so k = 4.',
          X + "k = sp.Symbol('k')\nans = sp.solve(sp.expand(3*(x + k) - (3*x + 12)).coeff(x, 0), k)[0]\nassert sp.expand(3*(x + ans) - (3*x + 12)) == 0\n")

    b.mc('ALG', IN, 'M',
         'Dana has $50 saved and adds $15 to her savings each week. What is the minimum number of whole weeks she must save to have at least $200 for a bike?',
         '10', ['14', '13', '9'],
         '50 + 15w ≥ 200, so 15w ≥ 150 and w ≥ 10. After exactly 10 weeks she has $200. (14 ignores the $50 she already has.)',
         "w = sp.Symbol('w')\nans = min(n for n in range(0, 100) if 50 + 15*n >= 200)\n")

    b.mc('ALG', LF, 'M',
         'Line ℓ is perpendicular to the line y = (2/3)x + 1. What is the slope of line ℓ?',
         '−3/2', ['3/2', '−2/3', '2/3'],
         'Perpendicular slopes are negative reciprocals: the reciprocal of 2/3 is 3/2, and its negative is −3/2.',
         "ans = -1 / sp.Rational(2, 3)\n")

    b.mc('ALG', LF, 'M',
         'The equation B = 1,200 − 75m gives the balance B, in dollars, remaining on a loan after m monthly payments. What does the number 75 represent?',
         'The amount the balance decreases with each payment',
         ['The balance before any payments are made', 'The number of payments needed to pay off the loan', 'The balance after one payment'],
         'Each increase of 1 in m lowers B by 75, so 75 is the amount paid off per month. (1,200 is the starting balance; the balance after one payment is 1,125.)',
         "m = sp.Symbol('m')\nB = 1200 - 75*m\nassert B.subs(m, 3) - B.subs(m, 4) == 75\nans = None\n",
         custom="assert C[K].startswith('The amount the balance decreases')\n")

    b.spr('ALG', LF, 'M',
          'The graph of the linear function g is shown. What is the value of g(4)?',
          '9', [],
          'The graph passes through the grid points (−2, 0) and (2, 6): slope = 6/4 = 3/2. From (2, 6), 2 more units right adds 3: g(4) = 9. (Equivalently, g(x) = (3/2)x + 3.)',
          X + "g = sp.Rational(3, 2)*x + 3\nassert g.subs(x, -2) == 0\nans = g.subs(x, 4)\n",
          figure={'kind': 'fgraph', 'params': {'expr': '1.5*x + 3', 'xmin': -4, 'xmax': 6, 'ymin': -3, 'ymax': 12}})

    b.mc('ALG', L1F, 'M',
         'The area A of a trapezoid is given by A = (h/2)(a + b), where h is the height and a and b are the lengths of the parallel sides. Which equation gives b in terms of A, h, and a?',
         'b = 2A/h − a', ['b = 2A − a/h', 'b = A/(2h) − a', 'b = 2A/h + a'],
         'Multiply both sides by 2/h: 2A/h = a + b. Subtract a: b = 2A/h − a.',
         "A_, h, a, b_ = sp.symbols('A h a b')\nsol = sp.solve(sp.Eq(A_, h/2*(a + b_)), b_)[0]\nans = None\n",
         custom="A_, h, a = sp.symbols('A h a')\nsol = sp.solve(sp.Eq(A_, h/2*(a + sp.Symbol('b'))), sp.Symbol('b'))[0]\n"
                "_ok = [c for c in C if sp.simplify(P(c.split('=')[1]).subs({sp.Symbol('A'): A_}) - sol) == 0]\nassert _ok == [C[K]], _ok\n")

    b.mc('ALG', LF, 'M',
         'The table shows three values of x and the corresponding values of y for a linear relationship. What is the value of y when x = 0?',
         '3', ['7', '2', '−3'],
         'y rises by 6 when x rises by 3, so the slope is 2. Going back 2 units from (2, 7): y = 7 − 2(2) = 3.',
         X + "pts = [(2, 7), (5, 13), (8, 19)]\nm = sp.Rational(13 - 7, 5 - 2)\nf = m*x + (7 - m*2)\nassert all(f.subs(x, a) == v for a, v in pts)\nans = f.subs(x, 0)\n",
         figure={'kind': 'table', 'params': {'headers': ['x', 'y'], 'rows': [['2', '7'], ['5', '13'], ['8', '19']]}})

    # ── Hard (5) ─────────────────────────────────────────────────────
    b.spr('ALG', SY, 'H',
          'kx + 4y = 9\n3x + 2y = 5\nIn the system of equations above, k is a constant. For what value of k does the system have no solution?',
          '6', [],
          'No solution means parallel lines: the x- and y-coefficients are proportional but the constants are not. 4/2 = 2, so k = 3(2) = 6; and 9 ≠ 2(5), so the lines are distinct.',
          "x, y, k = sp.symbols('x y k')\nans = sp.solve(sp.Rational(4, 2)*3 - k, k)[0]\nassert sp.solve([ans*x + 4*y - 9, 3*x + 2*y - 5], [x, y], dict=True) == []\n")

    b.mc('ALG', SY, 'H',
         '3x − 2y = 8\nx + 4y = 12\nIf (x, y) is the solution to the system of equations above, what is the value of 4x + 2y?',
         '20', ['4', '12', '10'],
         'Add the two equations: (3x + x) + (−2y + 4y) = 8 + 12, so 4x + 2y = 20 — no need to solve for x and y.',
         "x, y = sp.symbols('x y')\ns = sp.solve([3*x - 2*y - 8, x + 4*y - 12], [x, y])\nans = 4*s[x] + 2*s[y]\n")

    b.mc('ALG', IN, 'H',
         'y > 2x − 3\ny < −x + 6\nWhich of the following points (x, y) is a solution to the system of inequalities above?',
         '(1, 2)', ['(4, 2)', '(0, 7)', '(5, −1)'],
         'Check (1, 2): 2 > 2(1) − 3 = −1 ✓ and 2 < −1 + 6 = 5 ✓. Each other point breaks one inequality: (4, 2) needs y > 5; (0, 7) needs y < 6; (5, −1) needs y > 7.',
         "ans = None\n",
         custom=exactly_one("lambda c: (lambda p: p[1] > 2*p[0] - 3 and p[1] < -p[0] + 6)([sp.Integer(v) for v in c.strip('()').replace('−', '-').split(',')])"))

    b.spr('ALG', L2, 'H',
          'Line k passes through the point (2, −1) and is parallel to the line 4x − 2y = 7. What is the y-intercept of line k?',
          '-5', [],
          'Rewrite 4x − 2y = 7 as y = 2x − 7/2: slope 2. Line k: y + 1 = 2(x − 2), so y = 2x − 5, with y-intercept −5.',
          "m = sp.Rational(4, 2)\nans = -1 - m*2\n")

    b.mc('ALG', SY, 'H',
         'A theater sold 40 tickets for one show. Adult tickets cost $12 and student tickets cost $8, and the theater collected $400 in all. How many adult tickets were sold?',
         '20', ['30', '10', '25'],
         'a + s = 40 and 12a + 8s = 400. Substitute s = 40 − a: 12a + 320 − 8a = 400, so 4a = 80 and a = 20.',
         "a, s = sp.symbols('a s')\nans = sp.solve([a + s - 40, 12*a + 8*s - 400], [a, s])[a]\n")

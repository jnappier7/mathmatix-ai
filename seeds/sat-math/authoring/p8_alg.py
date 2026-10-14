"""SAT bank p8 — Algebra (ALG). 35 items (11 E / 13 M / 11 H), aimed at the
skills the bank had thinnest once labels were mapped honestly:
one-variable inequalities (ALG1.EQV.3 had 2 items — every earlier inequality
label said "one or two variables", which scripts/satSkillMap.py files under
two-variable), literal equations (ALG1.EQV.2), and function notation
(ALG1.FNC.1). Each label is checked against the map before ingest."""

L1 = 'Linear equations in one variable'
LIT = 'Linear equations in one variable (solving for a variable)'
L2 = 'Linear equations in two variables'
LF = 'Linear functions'
EV = 'Linear functions (evaluation)'
SY = 'Systems of two linear equations'
IN1 = 'Linear inequalities in one variable'
IN2 = 'Linear inequalities in two variables'

X = "x = sp.Symbol('x')\n"
POINT = "(lambda c: [sp.Integer(v) for v in c.strip('()').replace('−', '-').split(',')])"


def exactly_one(pred):
    return f"_ok = [c for c in C if ({pred})(c)]\nassert _ok == [C[K]], _ok\n"


def solved_for(var, eq_src, symbols):
    """Custom check: the key is the ONE choice 'var = expr' equal to solving eq_src for var."""
    return (f"{symbols} = sp.symbols('{symbols.replace(',', ' ').replace('  ', ' ')}')\n"
            f"sol = sp.solve({eq_src}, {var})[0]\n"
            f"_ok = [c for c in C if sp.simplify(P(c.split('=', 1)[1]) - sol) == 0]\nassert _ok == [C[K]], _ok\n")


def interval_is(opts_src, sol_src):
    """Custom check: map each choice to a sympy set; the key is the one equal to the solution set."""
    return f"oo = sp.oo\nopts = {opts_src}\nsol = {sol_src}\nassert [c for c in C if opts[c] == sol] == [C[K]]\n"


def add(b):
    # ── Easy (11) ────────────────────────────────────────────────────
    b.mc('ALG', IN1, 'E',
         'Which of the following is the solution to the inequality x + 7 < 12?',
         'x < 5', ['x < 19', 'x > 5', 'x < −5'],
         'Subtract 7 from both sides: x < 5.',
         X + "ans = None\n",
         custom=interval_is("{'x < 5': sp.Interval.open(-oo, 5), 'x < 19': sp.Interval.open(-oo, 19), 'x > 5': sp.Interval.open(5, oo), 'x < −5': sp.Interval.open(-oo, -5)}",
                            "sp.solve_univariate_inequality(sp.Symbol('x') + 7 < 12, sp.Symbol('x'), relational=False)"))

    b.spr('ALG', IN1, 'E',
          'What is the greatest integer value of x that satisfies the inequality 3x ≤ 20?',
          '6', [],
          'Divide by 3: x ≤ 20/3, which is about 6.67. The greatest integer that is at most 6.67 is 6.',
          "ans = max(n for n in range(-50, 50) if 3*n <= 20)\n")

    b.mc('ALG', EV, 'E',
         'The function g is defined by g(x) = 4x + 9. What is the value of g(−2)?',
         '1', ['17', '−1', '−17'],
         'g(−2) = 4(−2) + 9 = −8 + 9 = 1.',
         X + "ans = (4*x + 9).subs(x, -2)\n")

    b.mc('ALG', LIT, 'E',
         'The formula d = rt relates distance d, rate r, and time t. Which equation gives t in terms of d and r?',
         't = d/r', ['t = dr', 't = r/d', 't = d − r'],
         'Divide both sides of d = rt by r: t = d/r.',
         "ans = None\n",
         custom=solved_for('t', 'd - r*t', 'd, r, t'))

    b.mc('ALG', L1, 'E',
         'What value of x satisfies the equation 6x − 5 = 31?',
         '6', ['26/6', '36', '−6'],
         'Add 5: 6x = 36. Divide by 6: x = 6. (26/6 subtracts the 5 instead of adding it.)',
         X + "ans = sp.solve(6*x - 5 - 31, x)[0]\n")

    b.spr('ALG', EV, 'E',
          'The table shows three values of the linear function f. What is the value of f(6)?',
          '17', [],
          'f rises 3 each time x rises 1 (5, 8, 11). Two more steps from x = 4: f(6) = 11 + 6 = 17.',
          X + "f = 3*x - 1\nassert [f.subs(x, a) for a in (2, 3, 4)] == [5, 8, 11]\nans = f.subs(x, 6)\n",
          figure={'kind': 'table', 'params': {'headers': ['x', 'f(x)'], 'rows': [['2', '5'], ['3', '8'], ['4', '11']]}})

    b.mc('ALG', IN1, 'E',
         'A student has $40 to spend on notebooks that cost $3 each. Which inequality represents the possible numbers of notebooks n the student can buy?',
         '3n ≤ 40', ['3n ≥ 40', 'n + 3 ≤ 40', '40n ≤ 3'],
         'n notebooks cost 3n dollars, and that cost can be at most $40: 3n ≤ 40.',
         "ans = None\n",
         custom="assert C[K] == '3n ≤ 40' and len(set(C)) == 4\n")

    b.mc('ALG', SY, 'E',
         'y = 4\nx + 2y = 11\nWhat is the value of x in the solution to the system of equations above?',
         '3', ['7', '4', '11/2'],
         'Substitute y = 4: x + 8 = 11, so x = 3.',
         "x, y = sp.symbols('x y')\nans = sp.solve([y - 4, x + 2*y - 11], [x, y])[x]\n")

    b.mc('ALG', LF, 'E',
         'The graph of a line in the xy-plane is shown. Which of the following is the equation of the line?',
         'y = 2x + 1', ['y = x + 2', 'y = 2x − 1', 'y = (1/2)x + 1'],
         'The line crosses the y-axis at 1 and rises 2 for each step of 1 to the right (from (0, 1) to (1, 3)): y = 2x + 1.',
         X + "ans = None\n",
         custom=exactly_one("lambda c: sp.simplify(P(c.split('=', 1)[1]) - (2*sp.Symbol('x') + 1)) == 0"),
         figure={'kind': 'fgraph', 'params': {'expr': '2*x + 1', 'xmin': -3, 'xmax': 4, 'ymin': -4, 'ymax': 8}})

    b.mc('ALG', IN1, 'E',
         'Which value of x is a solution to the inequality 5 − x > 2?',
         '1', ['3', '4', '7'],
         '5 − x > 2 means x < 3. Of the choices, only 1 is less than 3 (x = 3 gives 2 > 2, which is false).',
         "ans = None\n",
         custom=exactly_one("lambda c: 5 - P(c) > 2"))

    b.spr('ALG', L1, 'E',
          'If 5(x + 2) = 35, what is the value of x?',
          '5', [],
          'Divide by 5: x + 2 = 7, so x = 5.',
          X + "ans = sp.solve(5*(x + 2) - 35, x)[0]\n")

    # ── Medium (13) ──────────────────────────────────────────────────
    b.mc('ALG', IN1, 'M',
         'Which of the following is the solution to the inequality 4 − 3x ≥ 19?',
         'x ≤ −5', ['x ≥ −5', 'x ≤ 5', 'x ≥ 23/3'],
         'Subtract 4: −3x ≥ 15. Dividing by −3 reverses the inequality: x ≤ −5. (x ≥ −5 forgets to reverse it.)',
         X + "ans = None\n",
         custom=interval_is("{'x ≤ −5': sp.Interval(-oo, -5), 'x ≥ −5': sp.Interval(-5, oo), 'x ≤ 5': sp.Interval(-oo, 5), 'x ≥ 23/3': sp.Interval(sp.Rational(23, 3), oo)}",
                            "sp.solve_univariate_inequality(4 - 3*sp.Symbol('x') >= 19, sp.Symbol('x'), relational=False)"))

    b.mc('ALG', LIT, 'M',
         'The perimeter P of a rectangle with length L and width W is P = 2L + 2W. Which equation gives W in terms of P and L?',
         'W = (P − 2L)/2', ['W = P − 2L', 'W = (P − L)/2', 'W = P/2 − 2L'],
         'Subtract 2L from both sides: 2W = P − 2L. Divide by 2: W = (P − 2L)/2.',
         "ans = None\n",
         custom="P_, L_, W_ = sp.symbols('P L W')\nsol = sp.solve(P_ - 2*L_ - 2*W_, W_)[0]\n"
                "T = lambda c: P(c.split('=', 1)[1]).subs({sp.Symbol('P'): P_, sp.Symbol('L'): L_})\n"
                "assert [c for c in C if sp.simplify(T(c) - sol) == 0] == [C[K]]\n")

    b.spr('ALG', EV, 'M',
          'The function f is defined by f(x) = 5x − 8. For what value of x is f(x) = 22?',
          '6', [],
          'Set 5x − 8 = 22: 5x = 30, so x = 6. (Not f(22): the 22 is the output.)',
          X + "ans = sp.solve(5*x - 8 - 22, x)[0]\n")

    b.mc('ALG', IN2, 'M',
         'The shaded region shown in the xy-plane, including its boundary lines, represents the solutions to a system of two inequalities. Which system does it represent?',
         'y ≥ x − 2 and y ≤ −x + 6', ['y ≤ x − 2 and y ≥ −x + 6', 'y ≥ x − 2 and y ≥ −x + 6', 'y ≤ x − 2 and y ≤ −x + 6'],
         'The shading lies above the rising line y = x − 2 and below the falling line y = −x + 6, on the side of their intersection (4, 2) toward the y-axis. Test (0, 0), which is shaded: 0 ≥ −2 ✓ and 0 ≤ 6 ✓.',
         "x, y = sp.symbols('x y')\nans = None\n",
         custom="opts = {'y ≥ x − 2 and y ≤ −x + 6': lambda x, y: y >= x - 2 and y <= -x + 6,\n"
                "        'y ≤ x − 2 and y ≥ −x + 6': lambda x, y: y <= x - 2 and y >= -x + 6,\n"
                "        'y ≥ x − 2 and y ≥ −x + 6': lambda x, y: y >= x - 2 and y >= -x + 6,\n"
                "        'y ≤ x − 2 and y ≤ −x + 6': lambda x, y: y <= x - 2 and y <= -x + 6}\n"
                "inside, outside = [(0, 0), (2, 2), (-1, 0)], [(0, 7), (0, -3), (6, 2)]\n"
                "_ok = [c for c in C if all(opts[c](*p) for p in inside) and not any(opts[c](*p) for p in outside)]\nassert _ok == [C[K]], _ok\n",
         figure={'kind': 'region', 'params': {'expr1': 'x - 2', 'expr2': '-x + 6', 'xmin': -2, 'xmax': 8, 'ymin': -4, 'ymax': 8, 'a': -2, 'b': 4}})

    b.mc('ALG', SY, 'M',
         'x + y = 15\n3x − y = 9\nWhat is the value of x − y in the solution to the system of equations above?',
         '−3', ['3', '6', '9'],
         'Add the equations: 4x = 24, so x = 6 and y = 9. Then x − y = 6 − 9 = −3.',
         "x, y = sp.symbols('x y')\ns = sp.solve([x + y - 15, 3*x - y - 9], [x, y])\nans = s[x] - s[y]\n")

    b.mc('ALG', L2, 'M',
         'A line in the xy-plane passes through (0, −3) and is parallel to the line y = (3/4)x + 5. At what value of x does the line cross the x-axis?',
         '4', ['−4', '3', '9/4'],
         'Parallel means slope 3/4, so the line is y = (3/4)x − 3. Setting y = 0: (3/4)x = 3, x = 4.',
         X + "line = sp.Rational(3, 4)*x - 3\nans = sp.solve(line, x)[0]\n")

    b.spr('ALG', IN1, 'M',
          'A taxi charges $3.50 plus $2.25 per mile. Lena has at most $30 to spend on the ride. What is the greatest whole number of miles she can ride?',
          '11', [],
          '3.50 + 2.25m ≤ 30, so 2.25m ≤ 26.50 and m ≤ 11.78. The greatest whole number is 11 (12 miles would cost $30.50).',
          "ans = max(m for m in range(0, 100) if sp.Rational(7, 2) + sp.Rational(9, 4)*m <= 30)\n")

    b.mc('ALG', LF, 'M',
         'The table shows the height h, in centimeters, of a candle t hours after it was lit. The height decreases at a constant rate. Which equation represents the relationship?',
         'h = 24 − 1.5t', ['h = 24 + 1.5t', 'h = 21 − 1.5t', 'h = 24 − 3t'],
         'At t = 0 the height is 24. Every 2 hours it drops 3 centimeters: 1.5 per hour. So h = 24 − 1.5t.',
         "t = sp.Symbol('t')\npts = [(0, 24), (2, 21), (4, 18), (6, 15)]\nans = None\n",
         custom="t = sp.Symbol('t')\nT = lambda c: sp.parsing.sympy_parser.parse_expr(c.split('=', 1)[1].replace('−', '-'), local_dict={'t': t}, transformations=_T)\n"
                "assert [c for c in C if all(sp.simplify(T(c).subs(t, a) - v) == 0 for a, v in pts)] == [C[K]]\n",
         figure={'kind': 'table', 'params': {'headers': ['Time t (hours)', 'Height h (cm)'], 'rows': [['0', '24'], ['2', '21'], ['4', '18'], ['6', '15']]}})

    b.mc('ALG', LIT, 'M',
         'The equation F = (9/5)C + 32 converts Celsius to Fahrenheit. Which equation gives C in terms of F?',
         'C = (5/9)(F − 32)', ['C = (5/9)F − 32', 'C = (9/5)(F − 32)', 'C = (5/9)(F + 32)'],
         'Subtract 32: F − 32 = (9/5)C. Multiply by 5/9: C = (5/9)(F − 32).',
         "ans = None\n",
         custom="F_, C_ = sp.symbols('F C')\nsol = sp.solve(F_ - (sp.Rational(9, 5)*C_ + 32), C_)[0]\n"
                "T = lambda c: P(c.split('=', 1)[1]).subs(sp.Symbol('F'), F_)\n"
                "assert [c for c in C if sp.simplify(T(c) - sol) == 0] == [C[K]]\n")

    b.mc('ALG', EV, 'M',
         'For the linear function h, h(1) = 4 and h(5) = 16. What is the value of h(0)?',
         '1', ['4', '3', '0'],
         'From x = 1 to x = 5, h rises 12 over 4: slope 3. Going back one unit from x = 1: h(0) = 4 − 3 = 1.',
         "m = sp.Rational(16 - 4, 5 - 1)\nans = 4 - m*1\n")

    b.spr('ALG', SY, 'M',
          'A school bought 30 tickets to a museum. Student tickets cost $6 and adult tickets cost $10. The total cost was $220. How many adult tickets did the school buy?',
          '10', [],
          's + a = 30 and 6s + 10a = 220. Substitute s = 30 − a: 180 + 4a = 220, so a = 10.',
          "s, a = sp.symbols('s a')\nans = sp.solve([s + a - 30, 6*s + 10*a - 220], [s, a])[a]\n")

    b.mc('ALG', IN1, 'M',
         'Which of the following represents all solutions to the inequality 4(x − 1) > 2x + 6?',
         'x > 5', ['x > 2', 'x < 5', 'x > 7/3'],
         'Distribute: 4x − 4 > 2x + 6. Subtract 2x and add 4: 2x > 10, so x > 5.',
         X + "ans = None\n",
         custom=interval_is("{'x > 5': sp.Interval.open(5, oo), 'x > 2': sp.Interval.open(2, oo), 'x < 5': sp.Interval.open(-oo, 5), 'x > 7/3': sp.Interval.open(sp.Rational(7, 3), oo)}",
                            "sp.solve_univariate_inequality(4*(sp.Symbol('x') - 1) > 2*sp.Symbol('x') + 6, sp.Symbol('x'), relational=False)"))

    b.spr('ALG', L1, 'M',
          'What value of x satisfies the equation (2x + 1)/3 = x − 2?',
          '7', [],
          'Multiply by 3: 2x + 1 = 3x − 6. Subtract 2x and add 6: x = 7.',
          X + "ans = sp.solve((2*x + 1)/3 - (x - 2), x)[0]\n")

    # ── Hard (11) ────────────────────────────────────────────────────
    b.mc('ALG', IN1, 'H',
         'Which of the following is the solution set of −3 ≤ 2x + 5 < 9?',
         '−4 ≤ x < 2', ['−4 < x ≤ 2', '1 ≤ x < 7', '−4 ≤ x < 7'],
         'Subtract 5 from each part: −8 ≤ 2x < 4. Divide by 2: −4 ≤ x < 2.',
         "ans = None\n",
         custom=interval_is("{'−4 ≤ x < 2': sp.Interval.Ropen(-4, 2), '−4 < x ≤ 2': sp.Interval.Lopen(-4, 2), '1 ≤ x < 7': sp.Interval.Ropen(1, 7), '−4 ≤ x < 7': sp.Interval.Ropen(-4, 7)}",
                            "sp.Intersection(sp.solve_univariate_inequality(2*sp.Symbol('x') + 5 >= -3, sp.Symbol('x'), relational=False), sp.solve_univariate_inequality(2*sp.Symbol('x') + 5 < 9, sp.Symbol('x'), relational=False))"))

    b.mc('ALG', LIT, 'H',
         'The equation 1/f = 1/a + 1/b relates the focal length f of a lens to distances a and b. Which equation gives b in terms of a and f?',
         'b = af/(a − f)', ['b = af/(f − a)', 'b = a − f', 'b = (a − f)/(af)'],
         'Subtract 1/a: 1/b = 1/f − 1/a = (a − f)/(af). Take reciprocals: b = af/(a − f).',
         "ans = None\n",
         custom="a_, b_, f_ = sp.symbols('a b f')\nsol = sp.solve(1/f_ - 1/a_ - 1/b_, b_)[0]\n"
                "T = lambda c: P(c.split('=', 1)[1]).subs({sp.Symbol('a'): a_, sp.Symbol('f'): f_})\n"
                "assert [c for c in C if sp.simplify(T(c) - sol) == 0] == [C[K]]\n")

    b.spr('ALG', IN1, 'H',
          'Club A charges a $60 membership fee plus $4 per visit. Club B charges no fee and $9 per visit. What is the least whole number of visits for which Club A costs less than Club B?',
          '13', [],
          '60 + 4v < 9v means 60 < 5v, or v > 12. At exactly 12 visits they cost the same ($108), so the least whole number is 13.',
          "ans = min(v for v in range(0, 200) if 60 + 4*v < 9*v)\n")

    b.mc('ALG', SY, 'H',
         'ax + by = 12\n2x + 3y = 6\nIn the system of equations above, a and b are constants. If the system has infinitely many solutions, what is the value of a + b?',
         '10', ['5', '12', '6'],
         'Infinitely many solutions means the first equation is a multiple of the second. 12 = 2 × 6, so a = 2 × 2 = 4 and b = 2 × 3 = 6, and a + b = 10.',
         "x, y = sp.symbols('x y')\na, b_ = 4, 6\nsols = sp.solve([a*x + b_*y - 12, 2*x + 3*y - 6], [x, y], dict=True)\nassert len(sols) == 1 and len(sols[0]) == 1\nans = a + b_\n")

    b.mc('ALG', IN2, 'H',
         'The shaded region shown, including its boundary lines, represents the solutions to a system of inequalities. Which point (x, y) is a solution to the system?',
         '(1, 3)', ['(1, 6)', '(−2, 6)', '(5, 4)'],
         'The region lies on or above the rising line y = 2x − 1 and on or below the horizontal line y = 5. (1, 3): 3 ≥ 2(1) − 1 = 1 ✓ and 3 ≤ 5 ✓. (1, 6) and (−2, 6) are above y = 5; (5, 4) is below the rising line, which is at 9 when x = 5.',
         "ans = None\n",
         custom=exactly_one(f"lambda c: (lambda p: p[1] >= 2*p[0] - 1 and p[1] <= 5)({POINT}(c))"),
         figure={'kind': 'region', 'params': {'expr1': '2*x - 1', 'expr2': '5 + 0*x', 'xmin': -3, 'xmax': 6, 'ymin': -4, 'ymax': 8, 'a': -3, 'b': 3}})

    b.spr('ALG', EV, 'H',
          'The function f is linear, f(3) = 10, and f(f(3)) = 31. What is the value of f(0)?',
          '1', [],
          'f(f(3)) = f(10) = 31. From x = 3 to x = 10, f rises 21 over 7: slope 3. Going back 3 units from x = 3: f(0) = 10 − 9 = 1.',
          "m = sp.Rational(31 - 10, 10 - 3)\nans = 10 - m*3\nassert m*10 + ans == 31\n")

    b.spr('ALG', IN1, 'H',
          'If 7 − 3x ≥ −8 and x is a positive integer, how many different values of x are possible?',
          '5', [],
          '7 − 3x ≥ −8 means −3x ≥ −15, so x ≤ 5 (dividing by −3 reverses the inequality). The positive integers that are at most 5 are 1, 2, 3, 4, and 5.',
          "ans = len([n for n in range(1, 100) if 7 - 3*n >= -8])\n")

    b.mc('ALG', L2, 'H',
         'Line p passes through (−2, 7) and (4, −5). Line q is perpendicular to line p and passes through the origin. Which equation represents line q?',
         'y = (1/2)x', ['y = −2x', 'y = 2x', 'y = −(1/2)x'],
         'Line p has slope (−5 − 7)/(4 − (−2)) = −2. A perpendicular slope is the negative reciprocal, 1/2; through the origin, y = (1/2)x.',
         X + "ans = None\n",
         custom=exactly_one("lambda c: sp.simplify(P(c.split('=', 1)[1]) - sp.Symbol('x')/2) == 0"))

    b.spr('ALG', L1, 'H',
          'In the equation k(x + 3) = 4x + 12 + (k − 4)x, k is a constant. For what value of k does the equation have infinitely many solutions?',
          '4', [],
          'The left side is kx + 3k; the right side is kx + 12. They match for every x exactly when 3k = 12, so k = 4.',
          X + "k = sp.Symbol('k')\nans = sp.solve(sp.expand(k*(x + 3) - (4*x + 12 + (k - 4)*x)), k)[0]\nassert sp.expand(ans*(x + 3) - (4*x + 12 + (ans - 4)*x)) == 0\n")

    b.mc('ALG', IN1, 'H',
         'A phone’s battery is at 85% and drains 6 percentage points per hour of video. Nadia wants to stop with at least 20% left. Which inequality gives the numbers of hours h she can watch?',
         'h ≤ 65/6', ['h ≥ 65/6', 'h ≤ 105/6', 'h ≤ 20/6'],
         '85 − 6h ≥ 20, so 6h ≤ 65 and h ≤ 65/6 (about 10.8 hours).',
         "h = sp.Symbol('h')\nsol = sp.solve_univariate_inequality(85 - 6*h >= 20, h, relational=False)\nans = None\n",
         custom="oo = sp.oo\nopts = {'h ≤ 65/6': sp.Interval(-oo, sp.Rational(65, 6)), 'h ≥ 65/6': sp.Interval(sp.Rational(65, 6), oo), 'h ≤ 105/6': sp.Interval(-oo, sp.Rational(105, 6)), 'h ≤ 20/6': sp.Interval(-oo, sp.Rational(20, 6))}\n"
                "assert [c for c in C if opts[c] == sol] == [C[K]]\n")

    b.mc('ALG', LF, 'H',
         'The cost C, in dollars, to produce n items is C = 12n + 300. Each item sells for $20. What is the least number of items that must be sold for the revenue to exceed the cost?',
         '38', ['37', '15', '25'],
         'Revenue exceeds cost when 20n > 12n + 300, or 8n > 300, n > 37.5. The least whole number is 38. (At 37 items revenue is $740 and cost is $744.)',
         "ans = min(n for n in range(0, 1000) if 20*n > 12*n + 300)\n")

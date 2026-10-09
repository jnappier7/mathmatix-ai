"""SAT bank p2 — Algebra (ALG). 33 items across the five official Algebra skills."""

L1 = 'Linear equations in one variable'
L2 = 'Linear equations in two variables'
LF = 'Linear functions'
SY = 'Systems of two linear equations'
IN = 'Linear inequalities in one or two variables'

X = "x = sp.Symbol('x')\n"


def add(b):
    # ── Linear equations in one variable ──────────────────────────────
    b.mc('ALG', L1, 'E',
         'If 0.4x + 1.2 = 3.6, what is the value of x?',
         '6', ['12', '3', '9'],
         'Subtract 1.2 to get 0.4x = 2.4, then divide by 0.4: x = 6.',
         X + "ans = sp.solve(sp.Rational(4, 10)*x + sp.Rational(12, 10) - sp.Rational(36, 10), x)[0]\n")

    b.spr('ALG', L1, 'E',
          'If 5 − 3x = −16, what is the value of x?',
          '7', [],
          'Subtract 5: −3x = −21. Divide by −3: x = 7.',
          X + "ans = sp.solve(5 - 3*x + 16, x)[0]\n")

    b.mc('ALG', L1, 'M',
         'If (2x − 1)/3 = (x + 4)/2, what is the value of x?',
         '14', ['13', '10', '5'],
         'Cross-multiply: 2(2x − 1) = 3(x + 4), so 4x − 2 = 3x + 12 and x = 14.',
         X + "ans = sp.solve((2*x - 1)/3 - (x + 4)/2, x)[0]\n")

    b.mc('ALG', L1, 'M',
         'Which of the following equations has no solution?',
         '3(x + 2) = 3x + 5', ['3(x + 2) = 3x + 6', '3(x + 2) = 2x + 6', '3x + 2 = 2x + 3'],
         'Expanding 3(x + 2) gives 3x + 6. Setting 3x + 6 = 3x + 5 leaves 6 = 5, which is never true. 3x + 6 = 3x + 6 is true for every x, and the other two each have exactly one solution.',
         X + "eqs = {'3(x + 2) = 3x + 5': 3*(x + 2) - (3*x + 5), '3(x + 2) = 3x + 6': 3*(x + 2) - (3*x + 6),\n"
         "       '3(x + 2) = 2x + 6': 3*(x + 2) - (2*x + 6), '3x + 2 = 2x + 3': 3*x + 2 - (2*x + 3)}\n"
         "none = [k for k, e in eqs.items() if sp.simplify(e) != 0 and sp.solve(e, x) == []]\n"
         "assert none == ['3(x + 2) = 3x + 5']\n",
         custom="assert C[K] == '3(x + 2) = 3x + 5'\n")

    b.spr('ALG', L1, 'H',
          'In the equation 4(x + k) = 3x + 20, k is a constant. If x = 2k is a solution to the equation, what is the value of k?',
          '10/3', ['3.333', '3.334'],
          'Substitute x = 2k: 4(2k + k) = 3(2k) + 20, so 12k = 6k + 20, 6k = 20, and k = 10/3 (about 3.333).',
          "k = sp.Symbol('k')\nans = sp.solve(4*(2*k + k) - (3*2*k + 20), k)[0]\n", tol=1e-3)

    b.mc('ALG', L1, 'M',
         'A plumber charges $65 for the first hour of a job and $48 for each additional hour. A job billed in whole hours cost $401. How many hours did the job take?',
         '8', ['7', '6', '9'],
         '65 + 48(h − 1) = 401, so 48(h − 1) = 336 and h − 1 = 7. The job took 8 hours. (7 is the number of ADDITIONAL hours.)',
         "h = sp.Symbol('h')\nans = sp.solve(65 + 48*(h - 1) - 401, h)[0]\n")

    # ── Linear equations in two variables ─────────────────────────────
    b.mc('ALG', L2, 'E',
         'Which of the following points (x, y) lies on the line 2x + 5y = 20?',
         '(5, 2)', ['(2, 5)', '(10, 1)', '(0, 5)'],
         'Check each point: 2(5) + 5(2) = 20. The others give 29, 25, and 25.',
         "pts = {'(5, 2)': (5, 2), '(2, 5)': (2, 5), '(10, 1)': (10, 1), '(0, 5)': (0, 5)}\n"
         "on = [k for k, (x, y) in pts.items() if 2*x + 5*y == 20]\nassert on == ['(5, 2)']\n",
         custom="assert C[K] == '(5, 2)'\n")

    b.spr('ALG', L2, 'M',
          'A theater sells adult tickets for $15 each and child tickets for $10 each. One evening it sold x adult tickets and 12 child tickets for a total of $360. What is the value of x?',
          '16', [],
          '15x + 10(12) = 360, so 15x = 240 and x = 16.',
          X + "ans = sp.solve(15*x + 10*12 - 360, x)[0]\n")

    b.mc('ALG', L2, 'M',
         'What is the slope of the line with equation 6x − 4y = 12 in the xy-plane?',
         '3/2', ['−3/2', '2/3', '−3'],
         'Solve for y: −4y = −6x + 12, so y = (3/2)x − 3. The slope is 3/2.',
         "x, y = sp.symbols('x y')\nans = sp.diff(sp.solve(6*x - 4*y - 12, y)[0], x)\n")

    b.mc('ALG', L2, 'M',
         'The line shown in the xy-plane passes through the points (−4, 0) and (0, 3). Which equation represents the line?',
         'y = (3/4)x + 3', ['y = (4/3)x + 3', 'y = −(3/4)x + 3', 'y = (3/4)x − 4'],
         'The slope is (3 − 0)/(0 − (−4)) = 3/4, and the y-intercept is 3: y = (3/4)x + 3.',
         X + "m = sp.Rational(3 - 0, 0 - (-4))\nans = m*x + 3\nassert ans.subs(x, -4) == 0\n",
         figure={'kind': 'fgraph', 'params': {'expr': '0.75*x + 3', 'xmin': -8, 'xmax': 4, 'ymin': -4, 'ymax': 7}})

    b.spr('ALG', L2, 'H',
          'In the xy-plane, the graphs of 3x + ky = 9 and 2x − 6y = 5 are parallel lines, where k is a constant. What is the value of k?',
          '-9', [],
          'The slope of 2x − 6y = 5 is 2/6 = 1/3. The slope of 3x + ky = 9 is −3/k. Setting −3/k = 1/3 gives k = −9.',
          "k = sp.Symbol('k')\nans = sp.solve(-3/k - sp.Rational(2, 6), k)[0]\n")

    b.mc('ALG', L2, 'H',
         'In the xy-plane, a line with slope −2/3 passes through the points (1, 4) and (7, k). What is the value of k?',
         '0', ['8', '−4', '2'],
         'From x = 1 to x = 7 is a run of 6, so the rise is (−2/3)(6) = −4. Then k = 4 − 4 = 0.',
         "ans = 4 + sp.Rational(-2, 3)*(7 - 1)\n")

    # ── Linear functions ──────────────────────────────────────────────
    b.mc('ALG', LF, 'E',
         'The function f is defined by f(x) = −3x + 11. What is the value of f(−4)?',
         '23', ['−1', '1', '−23'],
         'f(−4) = −3(−4) + 11 = 12 + 11 = 23.',
         X + "ans = (-3*x + 11).subs(x, -4)\n")

    b.mc('ALG', LF, 'E',
         'The graph of the linear function f is shown. At what point does the graph cross the x-axis?',
         '(3, 0)', ['(0, 6)', '(6, 0)', '(−3, 0)'],
         'The graph crosses the x-axis where y = 0. The line falls 2 units for each unit right from (0, 6), reaching 0 at x = 3.',
         X + "f = -2*x + 6\nassert sp.solve(f, x) == [3]\n",
         custom="assert C[K] == '(3, 0)'\n",
         figure={'kind': 'fgraph', 'params': {'expr': '-2*x + 6', 'xmin': -3, 'xmax': 7, 'ymin': -4, 'ymax': 8}})

    b.mc('ALG', LF, 'M',
         'A pool is drained at a constant rate. The table shows the amount of water W(t), in gallons, in the pool t hours after draining begins. Which equation defines W?',
         'W(t) = 1,500 − 180t', ['W(t) = 1,500 − 360t', 'W(t) = 1,500 − 120t', 'W(t) = 1,140 − 180t'],
         'From t = 0 to t = 2, W drops 360 gallons, or 180 gallons per hour, and W(0) = 1,500. Check t = 5: 1,500 − 900 = 600.',
         "t = sp.Symbol('t')\npts = [(0, 1500), (2, 1140), (5, 600)]\nm = sp.Rational(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0])\nans = pts[0][1] + m*t\n"
         "assert all(ans.subs(t, a) == v for a, v in pts)\nP_ = P\nP = lambda s: P_(s.replace('W(t) =', ''))\n",
         figure={'kind': 'table', 'params': {'headers': ['t (hours)', 'W(t) (gallons)'], 'rows': [['0', '1,500'], ['2', '1,140'], ['5', '600']]}})

    b.mc('ALG', LF, 'M',
         'The air temperature T, in degrees Fahrenheit, at an altitude of d thousand feet above a town is modeled by T(d) = 68 − 3.5d. What does the number 3.5 represent in this model?',
         'The temperature decreases by 3.5°F for each 1,000 feet of altitude gained.',
         ['The temperature at the town is 3.5°F.', 'The temperature decreases by 3.5°F for each foot of altitude gained.', 'The temperature reaches 0°F at an altitude of 3,500 feet.'],
         '3.5 is the rate of change: each increase of 1 in d (1,000 feet) lowers T by 3.5 degrees. 68 is the temperature at the town (d = 0).',
         "d = sp.Symbol('d')\nT = 68 - sp.Rational(7, 2)*d\nassert T.subs(d, 3) - T.subs(d, 4) == sp.Rational(7, 2)\n",
         custom="assert C[K].startswith('The temperature decreases by 3.5°F for each 1,000 feet')\n")

    b.spr('ALG', LF, 'M',
          'For the linear function g, g(0) = −5 and g(6) = 7. What is the value of g(9)?',
          '13', [],
          'The slope is (7 − (−5))/6 = 2, so g(x) = 2x − 5 and g(9) = 13.',
          "m = sp.Rational(7 - (-5), 6)\nans = m*9 - 5\n")

    b.mc('ALG', LF, 'H',
         'The graph of the linear function f is shown. The function g is defined by g(x) = f(x) − 4. For what value of x is g(x) = 0?',
         '9', ['3', '−3', '12'],
         'f passes through (0, 1) and (3, 2), so f(x) = (1/3)x + 1 and g(x) = (1/3)x − 3. Setting g(x) = 0 gives x = 9.',
         X + "f = sp.Rational(1, 3)*x + 1\nans = sp.solve(f - 4, x)[0]\n",
         figure={'kind': 'fgraph', 'params': {'expr': 'x/3 + 1', 'xmin': -6, 'xmax': 12, 'ymin': -3, 'ymax': 6}})

    b.spr('ALG', LF, 'H',
          'The linear function f is defined by f(x) = mx + b, where m and b are constants. If f(2) = 3f(0) and f(4) = 20, what is the value of f(0)?',
          '4', [],
          'f(2) = 3f(0) means 2m + b = 3b, so m = b. Then f(4) = 4m + b = 5b = 20, so b = 4, and f(0) = b = 4.',
          "m, bb = sp.symbols('m bb')\ns = sp.solve([2*m + bb - 3*bb, 4*m + bb - 20], [m, bb])\nans = s[bb]\n")

    b.mc('ALG', LF, 'M',
         'The graph of the linear function f is shown; it passes through the points (2, 5) and (6, 13). For what value of x is f(x) = 25?',
         '12', ['51', '13', '10'],
         'The slope is (13 − 5)/(6 − 2) = 2, so f(x) = 2x + 1. Solving 2x + 1 = 25 gives x = 12. (51 is f(25).)',
         X + "m = sp.Rational(13 - 5, 6 - 2)\nf = 5 + m*(x - 2)\nans = sp.solve(f - 25, x)[0]\n",
         figure={'kind': 'fgraph', 'params': {'expr': '2*x + 1', 'xmin': -2, 'xmax': 8, 'ymin': -4, 'ymax': 18}})

    # ── Systems of two linear equations ───────────────────────────────
    b.spr('ALG', SY, 'E',
          'y = 3x\nx + y = 24\nWhat is the value of x in the solution to the system of equations above?',
          '6', [],
          'Substitute y = 3x: x + 3x = 24, so 4x = 24 and x = 6.',
          "x, y = sp.symbols('x y')\nans = sp.solve([y - 3*x, x + y - 24], [x, y])[x]\n")

    b.mc('ALG', SY, 'M',
         'A gym offers two plans. Plan A costs $40 per month plus $5 per class. Plan B costs $10 per month plus $8 per class. For how many classes in a month do the two plans cost the same?',
         '10', ['6', '15', '30'],
         '40 + 5c = 10 + 8c gives 30 = 3c, so c = 10.',
         "c = sp.Symbol('c')\nans = sp.solve(40 + 5*c - (10 + 8*c), c)[0]\n")

    b.mc('ALG', SY, 'M',
         '4x − 3y = 5\n2x + y = 5\nIf (x, y) is the solution to the system of equations above, what is the value of y?',
         '1', ['2', '3', '−1'],
         'From the second equation, y = 5 − 2x. Substituting: 4x − 15 + 6x = 5, so 10x = 20, x = 2, and y = 1.',
         "x, y = sp.symbols('x y')\nans = sp.solve([4*x - 3*y - 5, 2*x + y - 5], [x, y])[y]\n")

    b.mc('ALG', SY, 'E',
         'The graphs of two linear equations are shown in the xy-plane. One line has equation y = −x + 5 and the other has equation y = 2x − 1. What is the solution (x, y) to the system formed by the two equations?',
         '(2, 3)', ['(3, 2)', '(0, 5)', '(5, 0)'],
         'The solution is the intersection point. Setting −x + 5 = 2x − 1 gives x = 2, and y = −2 + 5 = 3.',
         "x, y = sp.symbols('x y')\ns = sp.solve([y + x - 5, y - 2*x + 1], [x, y])\nassert (s[x], s[y]) == (2, 3)\n",
         custom="assert C[K] == '(2, 3)'\n",
         figure={'kind': 'region', 'params': {'expr1': '-x + 5', 'expr2': '2*x - 1', 'xmin': -2, 'xmax': 6, 'ymin': -4, 'ymax': 8}})

    b.mc('ALG', SY, 'M',
         'x + 2y = 5\n3x + 6y = c\nIn the system of equations above, c is a constant. For which value of c does the system have infinitely many solutions?',
         '15', ['5', '10', '18'],
         'The second equation\'s left side is 3 times the first\'s. The equations describe the same line only if c = 3(5) = 15; any other c gives parallel lines and no solution.',
         "ans = 3*5\n")

    b.spr('ALG', SY, 'M',
          'A school sold 120 tickets to a concert. Student tickets cost $6 each and adult tickets cost $11 each, and ticket sales totaled $970. How many adult tickets were sold?',
          '50', [],
          'With s student and a adult tickets: s + a = 120 and 6s + 11a = 970. Substituting s = 120 − a: 720 + 5a = 970, so a = 50.',
          "s, a = sp.symbols('s a')\nans = sp.solve([s + a - 120, 6*s + 11*a - 970], [s, a])[a]\n")

    b.mc('ALG', SY, 'H',
         '3x + 4y = 31\n4x + 3y = 32\nIf (x, y) is the solution to the system of equations above, what is the value of x + y?',
         '9', ['1', '7', '63'],
         'Adding the equations gives 7x + 7y = 63, so x + y = 9 — no need to solve for x and y separately. (1 is x − y.)',
         "x, y = sp.symbols('x y')\ns = sp.solve([3*x + 4*y - 31, 4*x + 3*y - 32], [x, y])\nans = s[x] + s[y]\n")

    # ── Linear inequalities ───────────────────────────────────────────
    b.mc('ALG', IN, 'E',
         'Which of the following is a solution to the inequality −2x + 5 ≥ 13?',
         '−5', ['−3', '0', '4'],
         '−2x ≥ 8. Dividing by −2 REVERSES the inequality: x ≤ −4. Only −5 is at most −4.',
         "good = [v for v in [-5, -3, 0, 4] if -2*v + 5 >= 13]\nassert good == [-5]\n",
         custom="assert C[K] == '−5'\n")

    b.mc('ALG', IN, 'M',
         'Ana has $50 in savings and adds $15 each week. Which inequality gives the numbers of weeks w after which she will have at least $200?',
         '50 + 15w ≥ 200', ['50 + 15w ≤ 200', '15 + 50w ≥ 200', '50w + 15 ≤ 200'],
         'After w weeks she has 50 + 15w dollars, and "at least $200" means ≥ 200.',
         "w = sp.Symbol('w')\nassert sp.solve(50 + 15*w - 200, w) == [10]\n",
         custom="assert C[K] == '50 + 15w ≥ 200'\n")

    b.spr('ALG', IN, 'M',
          'An online ticket order has a $6 service fee plus $4.50 per ticket. What is the greatest number of tickets that can be ordered for a total of at most $60?',
          '12', [],
          '6 + 4.50n ≤ 60 means 4.50n ≤ 54, so n ≤ 12.',
          "ans = max(n for n in range(0, 100) if 6 + sp.Rational(9, 2)*n <= 60)\n")

    b.mc('ALG', IN, 'H',
         'Which of the following systems of inequalities is satisfied by the point (2, 3)?',
         'y ≥ x + 1 and y ≤ −x + 6', ['y > x + 1 and y < −x + 6', 'y ≥ 2x and y ≤ x', 'y ≤ x and y ≥ −x'],
         'At (2, 3): 3 ≥ 2 + 1 is true (equal), and 3 ≤ −2 + 6 is true. The strict version fails because 3 > 3 is false.',
         "x, y = 2, 3\nsystems = {'y ≥ x + 1 and y ≤ −x + 6': (y >= x + 1 and y <= -x + 6), 'y > x + 1 and y < −x + 6': (y > x + 1 and y < -x + 6),\n"
         "           'y ≥ 2x and y ≤ x': (y >= 2*x and y <= x), 'y ≤ x and y ≥ −x': (y <= x and y >= -x)}\n"
         "assert [k for k, v in systems.items() if v] == ['y ≥ x + 1 and y ≤ −x + 6']\n",
         custom="assert C[K] == 'y ≥ x + 1 and y ≤ −x + 6'\n")

    b.spr('ALG', IN, 'H',
          'If x and y are positive integers and 3x + 5y ≤ 30, what is the greatest possible value of y?',
          '5', [],
          'x is at least 1, so 5y ≤ 30 − 3 = 27 and y ≤ 5.4. The greatest integer y is 5 (with x = 1: 3 + 25 = 28 ≤ 30).',
          "ans = max(y for x in range(1, 20) for y in range(1, 20) if 3*x + 5*y <= 30)\n")

    b.mc('ALG', IN, 'H',
         'A warehouse must ship at least 600 units using small boxes that hold 20 units each and large boxes that hold 50 units each. At most 18 boxes can be shipped. Which system describes the possible numbers of small boxes s and large boxes ℓ?',
         '20s + 50ℓ ≥ 600 and s + ℓ ≤ 18', ['20s + 50ℓ ≤ 600 and s + ℓ ≥ 18', '50s + 20ℓ ≥ 600 and s + ℓ ≤ 18', '20s + 50ℓ ≥ 600 and 20s + 50ℓ ≤ 18'],
         'The units shipped, 20s + 50ℓ, must be at least 600, and the number of boxes, s + ℓ, can be at most 18.',
         "ok = [(s, l) for s in range(0, 19) for l in range(0, 19) if 20*s + 50*l >= 600 and s + l <= 18]\nassert (0, 12) in ok and (10, 8) in ok\n",
         custom="assert C[K] == '20s + 50ℓ ≥ 600 and s + ℓ ≤ 18'\n")

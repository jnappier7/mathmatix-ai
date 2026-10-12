"""SAT bank p3 — Algebra (ALG). 34 items, weighted to medium and hard."""

L1 = 'Linear equations in one variable'
L2 = 'Linear equations in two variables'
LF = 'Linear functions'
SY = 'Systems of two linear equations'
IN = 'Linear inequalities in one or two variables'

X = "x = sp.Symbol('x')\n"


def add(b):
    # ── Linear equations in one variable (7) ──────────────────────────
    b.mc('ALG', L1, 'E',
         'If 9 − 4x = 2x − 15, what is the value of x?',
         '4', ['−4', '1', '6'],
         'Add 4x and 15 to both sides: 24 = 6x, so x = 4.',
         X + "ans = sp.solve(9 - 4*x - (2*x - 15), x)[0]\n")

    b.spr('ALG', L1, 'M',
          'If (3x + 2)/4 = (x − 1)/2 + 3, what is the value of x?',
          '8', [],
          'Multiply every term by 4: 3x + 2 = 2(x − 1) + 12 = 2x + 10, so x = 8.',
          X + "ans = sp.solve((3*x + 2)/4 - ((x - 1)/2 + 3), x)[0]\n")

    b.mc('ALG', 'Linear equations in one variable (solving for a variable)', 'M',
         'The formula A = P + Prt gives the amount A in an account after t years, where P is the starting amount and r is the annual interest rate. Which equation correctly gives r in terms of A, P, and t?',
         'r = (A − P)/(Pt)', ['r = A/(Pt) − P', 'r = (A − P)/P − t', 'r = Pt/(A − P)'],
         'Subtract P: A − P = Prt. Divide both sides by Pt: r = (A − P)/(Pt).',
         "A, Pv, r, t = sp.symbols('A P r t', positive=True)\nsol = sp.solve(A - (Pv + Pv*r*t), r)[0]\n"
         "cands = {'r = (A − P)/(Pt)': (A - Pv)/(Pv*t), 'r = A/(Pt) − P': A/(Pv*t) - Pv, 'r = (A − P)/P − t': (A - Pv)/Pv - t, 'r = Pt/(A − P)': Pv*t/(A - Pv)}\n"
         "good = [k for k, v in cands.items() if sp.simplify(v - sol) == 0]\nassert good == ['r = (A − P)/(Pt)']\n",
         custom="assert C[K] == 'r = (A − P)/(Pt)'\n")

    b.mc('ALG', L1, 'M',
         'A bakery sells muffins for $2.75 each. A catering order of muffins also has a $12 delivery fee, and the total bill is $89. How many muffins were ordered?',
         '28', ['32', '36', '24'],
         '2.75m + 12 = 89 gives 2.75m = 77, so m = 28. (About 32 is what you get by ignoring the fee and dividing 89 by 2.75.)',
         "m = sp.Symbol('m')\nans = sp.solve(sp.Rational(275, 100)*m + 12 - 89, m)[0]\n")

    b.mc('ALG', L1, 'H',
         'In the equation 3(2x − k) = 6x − 12, k is a constant. For what value of k does the equation have infinitely many solutions?',
         '4', ['−4', '12', '−12'],
         'The left side is 6x − 3k. For every x to work, the constants must match: −3k = −12, so k = 4.',
         "x, k = sp.symbols('x k')\ne = sp.expand(3*(2*x - k) - (6*x - 12))\nassert e.coeff(x, 1) == 0\nans = sp.solve(e.coeff(x, 0), k)[0]\n")

    b.spr('ALG', L1, 'H',
          'If 5x − 3 = 17, what is the value of 10x + 4?',
          '44', [],
          'Doubling 5x − 3 = 17 gives 10x − 6 = 34, so 10x = 40 and 10x + 4 = 44. (Or solve x = 4 first.)',
          X + "xv = sp.solve(5*x - 3 - 17, x)[0]\nans = 10*xv + 4\n")

    b.mc('ALG', L1, 'H',
         'For which value of c does the equation 4(x + 3) = 4x + c have infinitely many solutions?',
         '12', ['3', '4', 'There is no such value.'],
         'The left side is 4x + 12, so the equation is 4x + 12 = 4x + c. It is true for every x exactly when c = 12; any other c gives no solution at all. (3 divides 12 by 4, but the 4 multiplies both terms.)',
         "x = sp.Symbol('x')\n"
         "infinite = [c for c in [12, 3, 4] if sp.simplify(4*(x + 3) - (4*x + c)) == 0]\nassert infinite == [12]\n",
         custom="assert C[K] == '12' and 'There is no such value.' in C\n")

    # ── Linear equations in two variables (6) ─────────────────────────
    b.mc('ALG', L2, 'E',
         'Tickets to a museum cost $8 for students and $14 for adults. A group spent exactly $150, buying s student tickets and a adult tickets. Which equation represents this situation?',
         '8s + 14a = 150', ['14s + 8a = 150', '8s + 14a = 150(s + a)', '22(s + a) = 150'],
         'Students cost 8s dollars and adults cost 14a dollars, and together that is 150.',
         "s, a = sp.symbols('s a')\nans = 8*s + 14*a - 150\nP_ = P\nP = lambda t: P_(t).subs({sp.Symbol('s'): s, sp.Symbol('a'): a})\n")

    b.spr('ALG', L2, 'M',
          'In the xy-plane, the line 5x + 2y = 40 crosses the x-axis at (a, 0) and the y-axis at (0, b). What is the value of a + b?',
          '28', [],
          'x-intercept: 5a = 40, so a = 8. y-intercept: 2b = 40, so b = 20. a + b = 28.',
          "a = sp.Rational(40, 5)\nbb = sp.Rational(40, 2)\nans = a + bb\n")

    b.mc('ALG', L2, 'M',
         'In the xy-plane, which of the following points lies on the line that passes through (0, −3) and (4, 5)?',
         '(2, 1)', ['(1, 2)', '(3, 4)', '(−1, −1)'],
         'The slope is (5 − (−3))/4 = 2, so the line is y = 2x − 3. At x = 2, y = 1.',
         "pts = {'(2, 1)': (2, 1), '(1, 2)': (1, 2), '(3, 4)': (3, 4), '(−1, −1)': (-1, -1)}\n"
         "on = [k for k, (px, py) in pts.items() if py == 2*px - 3]\nassert on == ['(2, 1)']\n",
         custom="assert C[K] == '(2, 1)'\n")

    b.mc('ALG', L2, 'H',
         'The line ℓ in the xy-plane has the equation 3x − 4y = 24. Line m is perpendicular to ℓ and has the same y-intercept as ℓ. Which equation defines line m?',
         'y = −(4/3)x − 6', ['y = (3/4)x − 6', 'y = −(4/3)x + 8', 'y = (4/3)x − 6'],
         'ℓ is y = (3/4)x − 6, with slope 3/4 and y-intercept −6. A perpendicular slope is −4/3, so m is y = −(4/3)x − 6.',
         X + "ans = sp.Rational(-4, 3)*x - 6\n")

    b.spr('ALG', L2, 'H',
          'The points (2, k) and (k, 11) lie on a line with slope 3. What is the value of k?',
          '17/4', ['4.25'],
          'Slope = (11 − k)/(k − 2) = 3, so 11 − k = 3k − 6, 17 = 4k, and k = 17/4 = 4.25.',
          "k = sp.Symbol('k')\nans = sp.solve((11 - k) - 3*(k - 2), k)[0]\n")

    b.mc('ALG', L2, 'M',
         'A hiker starts at an elevation of 1,850 feet and climbs at a constant rate of 420 feet per hour. Which equation gives the hiker\'s elevation E, in feet, h hours after starting?',
         'E = 1,850 + 420h', ['E = 420 + 1,850h', 'E = 1,850 − 420h', 'E = (1,850 + 420)h'],
         'The starting elevation is the constant, and the climbing rate multiplies the hours: E = 1,850 + 420h.',
         "h = sp.Symbol('h')\nans = 1850 + 420*h\n"
         "forms = {'E = 1,850 + 420h': 1850 + 420*h, 'E = 420 + 1,850h': 420 + 1850*h, 'E = 1,850 − 420h': 1850 - 420*h, 'E = (1,850 + 420)h': 2270*h}\n"
         "assert [k for k, v in forms.items() if sp.simplify(v - ans) == 0] == ['E = 1,850 + 420h']\n",
         custom="assert C[K] == 'E = 1,850 + 420h'\n")

    # ── Linear functions (8) ──────────────────────────────────────────
    b.mc('ALG', LF, 'E',
         'The graph of the linear function f is shown. What is the slope of the graph?',
         '−1/2', ['−2', '1/2', '2'],
         'The line passes through (0, 3) and (6, 0): slope = (0 − 3)/(6 − 0) = −1/2.',
         "ans = sp.Rational(0 - 3, 6 - 0)\n",
         figure={'kind': 'fgraph', 'params': {'expr': '-x/2 + 3', 'xmin': -4, 'xmax': 8, 'ymin': -3, 'ymax': 6}})

    b.mc('ALG', LF, 'M',
         'A phone\'s storage has 64 gigabytes free, and the free space goes down by 1.5 gigabytes for each hour of video recorded. Which function gives the free space S, in gigabytes, after h hours of recording?',
         'S(h) = 64 − 1.5h', ['S(h) = 1.5h − 64', 'S(h) = 64 + 1.5h', 'S(h) = 64(1.5)^h'],
         'Free space starts at 64 and drops by a constant 1.5 each hour — a linear decrease.',
         "h = sp.Symbol('h')\nans = 64 - sp.Rational(3, 2)*h\n"
         "forms = {'S(h) = 64 − 1.5h': 64 - sp.Rational(3, 2)*h, 'S(h) = 1.5h − 64': sp.Rational(3, 2)*h - 64, 'S(h) = 64 + 1.5h': 64 + sp.Rational(3, 2)*h, 'S(h) = 64(1.5)^h': 64*sp.Rational(3, 2)**h}\n"
         "assert [k for k, v in forms.items() if sp.simplify(v - ans) == 0] == ['S(h) = 64 − 1.5h']\n",
         custom="assert C[K] == 'S(h) = 64 − 1.5h'\n")

    b.spr('ALG', LF, 'M',
          'The table shows three values of the linear function g. What is the value of g(10)?',
          '-23', [],
          'g drops by 3 for each increase of 1 in x (from 4 to −2 over 2 units of x), and g(0) = 7, so g(x) = −3x + 7 and g(10) = −23.',
          "pts = [(0, 7), (2, 1), (5, -8)]\nm = sp.Rational(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0])\nassert all(pts[0][1] + m*(a - 0) == v for a, v in pts)\nans = 7 + m*10\n",
          figure={'kind': 'table', 'params': {'headers': ['x', 'g(x)'], 'rows': [['0', '7'], ['2', '1'], ['5', '−8']]}})

    b.mc('ALG', LF, 'M',
         'A ferry\'s fuel tank holds F(t) = 900 − 75t liters of fuel t hours after leaving port. What is the best interpretation of the statement F(4) = 600?',
         'Four hours after leaving port, the tank holds 600 liters.',
         ['The tank uses 600 liters in 4 hours.', 'The tank holds 4 liters after 600 hours.', 'The tank uses 75 liters each hour for 4 hours.'],
         'F(4) is the output when the input t is 4: the amount left, 600 liters, after 4 hours.',
         "t = sp.Symbol('t')\nassert (900 - 75*t).subs(t, 4) == 600\n",
         custom="assert C[K].startswith('Four hours after leaving port')\n")

    b.mc('ALG', LF, 'H',
         'The graph of the linear function f passes through the points (−2, 9) and (4, −3) in the xy-plane. For what value of x is f(x) = 0?',
         '5/2', ['−2', '5', '3/2'],
         'Slope = (−3 − 9)/(4 − (−2)) = −2, so f(x) = −2x + 5. Setting −2x + 5 = 0 gives x = 5/2. (5 is the y-intercept.)',
         X + "m = sp.Rational(-3 - 9, 4 - (-2))\nf = 9 + m*(x + 2)\nans = sp.solve(f, x)[0]\n")

    b.spr('ALG', LF, 'H',
          'For a linear function h, h(3) = 14 and the graph of y = h(x) is parallel to the line y = 4x − 1. What is the value of h(−2)?',
          '-6', [],
          'Parallel lines share the slope 4. Going from x = 3 to x = −2 is 5 steps left, so h drops by 20: h(−2) = 14 − 20 = −6.',
          "ans = 14 + 4*(-2 - 3)\n")

    b.mc('ALG', LF, 'H',
         'The graph of y = f(x) is shown. If g(x) = f(x) + 5, what is the y-intercept of the graph of y = g(x)?',
         '3', ['−2', '5', '7'],
         'f has y-intercept −2 (it passes through (0, −2) and (2, 1)). Adding 5 shifts every point up 5, so g crosses at −2 + 5 = 3.',
         "f0 = -2\nassert sp.Rational(1 - (-2), 2 - 0) == sp.Rational(3, 2)\nans = f0 + 5\n",
         figure={'kind': 'fgraph', 'params': {'expr': '1.5*x - 2', 'xmin': -4, 'xmax': 5, 'ymin': -6, 'ymax': 6}})

    b.mc('ALG', LF, 'E',
         'A bowling alley charges a shoe-rental fee plus a fixed price per game, as shown by C(g) = 4.50g + 3. What is the cost, in dollars, of shoe rental and 3 games?',
         '16.50', ['13.50', '22.50', '7.50'],
         'C(3) = 4.50(3) + 3 = 13.50 + 3 = 16.50.',
         "ans = sp.Rational(45, 10)*3 + 3\n")

    # ── Systems of two linear equations (7) ───────────────────────────
    b.mc('ALG', SY, 'E',
         'y = 2x − 1\ny = −x + 8\nWhat is the solution (x, y) to the system of equations above?',
         '(3, 5)', ['(5, 3)', '(3, −1)', '(−1, 3)'],
         'Set them equal: 2x − 1 = −x + 8, so 3x = 9, x = 3, and y = 2(3) − 1 = 5.',
         "x, y = sp.symbols('x y')\ns = sp.solve([y - (2*x - 1), y - (-x + 8)], [x, y])\nassert (s[x], s[y]) == (3, 5)\n",
         custom="assert C[K] == '(3, 5)'\n")

    b.spr('ALG', SY, 'M',
          '(1/2)x + (1/3)y = 7\nx − y = 4\nWhat is the value of x in the solution (x, y) to the system above?',
          '10', [],
          'Multiply the first equation by 6: 3x + 2y = 42. With y = x − 4: 3x + 2x − 8 = 42, so 5x = 50 and x = 10.',
          "x, y = sp.symbols('x y')\nans = sp.solve([x/2 + y/3 - 7, x - y - 4], [x, y])[x]\n")

    b.mc('ALG', SY, 'M',
         'Which of the following systems of equations has no solution?',
         'y = 3x + 1 and y = 3x − 4', ['y = 3x + 1 and y = −3x + 1', 'y = 3x + 1 and 2y = 6x + 2', 'y = 3x + 1 and y = x + 1'],
         'Lines with the same slope and different y-intercepts are parallel and never meet. 2y = 6x + 2 is the SAME line (infinitely many solutions).',
         "x, y = sp.symbols('x y')\nsystems = {'y = 3x + 1 and y = 3x − 4': [y - 3*x - 1, y - 3*x + 4], 'y = 3x + 1 and y = −3x + 1': [y - 3*x - 1, y + 3*x - 1],\n"
         "           'y = 3x + 1 and 2y = 6x + 2': [y - 3*x - 1, 2*y - 6*x - 2], 'y = 3x + 1 and y = x + 1': [y - 3*x - 1, y - x - 1]}\n"
         "none = [k for k, eqs in systems.items() if sp.solve(eqs, [x, y], dict=True) == []]\nassert none == ['y = 3x + 1 and y = 3x − 4']\n",
         custom="assert C[K] == 'y = 3x + 1 and y = 3x − 4'\n")

    b.mc('ALG', SY, 'M',
         'The graphs of y = 0.5x + 1 and y = −2x + 6 are shown in the xy-plane. What is the y-coordinate of the point where the graphs intersect?',
         '2', ['1', '2.5', '4'],
         '0.5x + 1 = −2x + 6 gives 2.5x = 5, so x = 2 and y = 0.5(2) + 1 = 2.',
         X + "xv = sp.solve(sp.Rational(1, 2)*x + 1 - (-2*x + 6), x)[0]\nans = sp.Rational(1, 2)*xv + 1\n",
         figure={'kind': 'region', 'params': {'expr1': '0.5*x + 1', 'expr2': '-2*x + 6', 'xmin': -2, 'xmax': 6, 'ymin': -3, 'ymax': 7}})

    b.spr('ALG', SY, 'H',
          'A coffee shop blends a $9-per-pound coffee with a $15-per-pound coffee to make 30 pounds of a blend worth $11 per pound. How many pounds of the $15 coffee are in the blend?',
          '10', [],
          'With c pounds of the $15 coffee: 9(30 − c) + 15c = 11(30), so 270 + 6c = 330 and c = 10.',
          "c = sp.Symbol('c')\nans = sp.solve(9*(30 - c) + 15*c - 11*30, c)[0]\n")

    b.mc('ALG', SY, 'H',
         '2x + 5y = 1\n6x + ky = 3\nIn the system above, k is a constant. For which value of k does the system have infinitely many solutions?',
         '15', ['5', '3', '−15'],
         'The second equation must be 3 times the first: 6x + 15y = 3. So k = 15. (With any other k the lines cross once.)',
         "x, y, k = sp.symbols('x y k')\nfor kv in [15, 5, 3, -15]:\n    sols = sp.solve([2*x + 5*y - 1, 6*x + kv*y - 3], [x, y], dict=True)\n    if kv == 15:\n        assert len(sols) == 1 and len(sols[0]) == 1\n    else:\n        assert len(sols) == 1 and len(sols[0]) == 2\n",
         custom="assert C[K] == '15'\n")

    b.spr('ALG', SY, 'H',
          'A robotics team ordered 18 parts. Gears cost $4 each and sensors cost $11 each. The team spent $114 in all. How many more gears than sensors did the team order?',
          '6', [],
          'g + s = 18 and 4g + 11s = 114. Substituting g = 18 − s: 72 + 7s = 114, so s = 6 and g = 12. The difference is 12 − 6 = 6.',
          "g, s = sp.symbols('g s')\nsol = sp.solve([g + s - 18, 4*g + 11*s - 114], [g, s])\nans = sol[g] - sol[s]\n")

    # ── Linear inequalities (6) ───────────────────────────────────────
    b.mc('ALG', IN, 'E',
         'Which of the following is equivalent to 6 − 3x ≤ 18?',
         'x ≥ −4', ['x ≤ −4', 'x ≥ 4', 'x ≤ 4'],
         '−3x ≤ 12. Dividing by −3 reverses the inequality: x ≥ −4.',
         "for xv in [-5, -4, -3, 0, 10]:\n    assert (6 - 3*xv <= 18) == (xv >= -4)\n",
         custom="assert C[K] == 'x ≥ −4'\n")

    b.spr('ALG', IN, 'M',
          'A rideshare driver earns $1.40 per mile plus $3 per trip. On one trip, what is the least whole number of miles the driver must cover to earn more than $25?',
          '16', [],
          '1.40m + 3 > 25 means 1.40m > 22, so m > 15.71…; the least whole number of miles is 16.',
          "ans = min(m for m in range(0, 100) if sp.Rational(14, 10)*m + 3 > 25)\n")

    b.mc('ALG', IN, 'M',
         'Which of the following ordered pairs (x, y) satisfies BOTH y > 2x − 1 and x + y < 5?',
         '(1, 3)', ['(2, 4)', '(3, 1)', '(0, −2)'],
         '(1, 3): 3 > 1 and 4 < 5 — both true. (2, 4) fails the second (6 < 5), (3, 1) fails the first, and (0, −2) fails the first (−2 > −1 is false).',
         "pts = {'(1, 3)': (1, 3), '(2, 4)': (2, 4), '(3, 1)': (3, 1), '(0, −2)': (0, -2)}\n"
         "ok = [k for k, (px, py) in pts.items() if py > 2*px - 1 and px + py < 5]\nassert ok == ['(1, 3)']\n",
         custom="assert C[K] == '(1, 3)'\n")

    b.mc('ALG', IN, 'H',
         'A concert venue sells floor tickets for $60 and balcony tickets for $35. To cover costs, the venue needs at least $14,000 in ticket sales, and it can hold at most 300 people. Which system represents this situation, where f is the number of floor tickets and b is the number of balcony tickets?',
         '60f + 35b ≥ 14,000 and f + b ≤ 300', ['60f + 35b ≤ 14,000 and f + b ≥ 300', '35f + 60b ≥ 14,000 and f + b ≤ 300', '60f + 35b ≥ 300 and f + b ≤ 14,000'],
         'Sales are 60f + 35b, which must be at least 14,000; the number of people, f + b, can be at most 300.',
         "ok = [(f, bb) for f in range(0, 301, 10) for bb in range(0, 301, 10) if 60*f + 35*bb >= 14000 and f + bb <= 300]\nassert (220, 50) in ok and (100, 200) not in ok\n",
         custom="assert C[K] == '60f + 35b ≥ 14,000 and f + b ≤ 300'\n")

    b.spr('ALG', IN, 'H',
          'What is the greatest integer x that satisfies 3(x − 2) − 4 < x + 5 ?',
          '7', [],
          '3x − 10 < x + 5 gives 2x < 15, so x < 7.5. The greatest integer is 7.',
          "ans = max(xv for xv in range(-50, 50) if 3*(xv - 2) - 4 < xv + 5)\n")

    b.mc('ALG', IN, 'M',
         'A library charges a late fee of $0.25 per day for a book, up to a maximum fee of $10. For how many days late d is the fee less than the maximum?',
         'd < 40', ['d < 10', 'd ≤ 40', 'd > 40'],
         '0.25d < 10 gives d < 40. At exactly 40 days the fee reaches the $10 maximum.',
         "for dv in [39, 40, 41]:\n    assert (sp.Rational(1, 4)*dv < 10) == (dv < 40)\n",
         custom="assert C[K] == 'd < 40'\n")

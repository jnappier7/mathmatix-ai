"""SAT bank p1 — Algebra (ALG). 27 items across the five official Algebra skills."""

L1 = 'Linear equations in one variable'
L2 = 'Linear equations in two variables'
LF = 'Linear functions'
SY = 'Systems of two linear equations'
IN = 'Linear inequalities in one or two variables'

X = "x = sp.Symbol('x')\n"


def add(b):
    # ── Linear equations in one variable ──────────────────────────────
    b.mc('ALG', L1, 'E',
         'If 7x + 12 = 5x − 4, what is the value of x?',
         '−8', ['8', '−16', '4'],
         'Subtract 5x and 12 from both sides: 2x = −16, so x = −8.',
         X + "ans = sp.solve(7*x + 12 - (5*x - 4), x)[0]\n")

    b.spr('ALG', L1, 'E',
          'If x/3 + 5 = 11, what is the value of x?',
          '18', [],
          'Subtract 5 to get x/3 = 6, then multiply by 3: x = 18.',
          X + "ans = sp.solve(x/3 + 5 - 11, x)[0]\n")

    b.mc('ALG', L1, 'M',
         'If 2(3x − 5) − 4(x + 1) = 8, what is the value of x?',
         '11', ['7', '9.5', '22'],
         'Distribute: 6x − 10 − 4x − 4 = 8, so 2x − 14 = 8, 2x = 22, and x = 11.',
         X + "ans = sp.solve(2*(3*x - 5) - 4*(x + 1) - 8, x)[0]\n")

    b.mc('ALG', L1, 'M',
         'In the equation 5(x − 2) + kx = 9x − 10, k is a constant. For what value of k does the equation have infinitely many solutions?',
         '4', ['9', '−4', '14'],
         'The left side is (5 + k)x − 10. For every x to work, the x-coefficients must match: 5 + k = 9, so k = 4. The constants already match (−10 = −10).',
         "x, k = sp.symbols('x k')\n"
         "ans = sp.solve(sp.Poly(5*(x - 2) + k*x - (9*x - 10), x).coeffs()[0], k)[0]\n"
         "assert sp.expand((5*(x - 2) + ans*x) - (9*x - 10)) == 0\n")

    b.spr('ALG', L1, 'H',
          'The equation a(2x − 3) + 4 = 6x − b, where a and b are constants, has infinitely many solutions. What is the value of b?',
          '5', [],
          'Expand the left side: 2ax − 3a + 4. Matching x-coefficients gives 2a = 6, so a = 3. Matching constants gives −3a + 4 = −b, so −9 + 4 = −b and b = 5.',
          "x, a, bb = sp.symbols('x a bb')\n"
          "e = sp.expand(a*(2*x - 3) + 4 - (6*x - bb))\n"
          "s = sp.solve([e.coeff(x, 1), e.coeff(x, 0)], [a, bb], dict=True)[0]\n"
          "ans = s[bb]\n")

    b.mc('ALG', L1, 'M',
         'A water tank holds 1,200 liters and drains at a constant rate of 15 liters per minute. At the same time, a second tank that holds 300 liters fills at a constant rate of 30 liters per minute. After how many minutes will the two tanks hold the same amount of water?',
         '20', ['60', '30', '12'],
         'After t minutes the tanks hold 1,200 − 15t and 300 + 30t liters. Setting them equal: 900 = 45t, so t = 20.',
         "t = sp.Symbol('t')\nans = sp.solve(1200 - 15*t - (300 + 30*t), t)[0]\n")

    # ── Linear equations in two variables ─────────────────────────────
    b.mc('ALG', L2, 'E',
         'In the xy-plane, a line has a slope of 3 and a y-intercept of −2. What is the y-coordinate of the point on the line whose x-coordinate is 4?',
         '10', ['14', '12', '2'],
         'The line is y = 3x − 2, so at x = 4, y = 12 − 2 = 10.',
         "ans = 3*4 - 2\n")

    b.mc('ALG', L2, 'M',
         'A school spent exactly $480 on x calculators that cost $12 each and y protractors that cost $3 each. Which equation represents this situation?',
         '12x + 3y = 480', ['3x + 12y = 480', '12x − 3y = 480', '15(x + y) = 480'],
         'The calculators cost 12x dollars and the protractors cost 3y dollars, and together they total 480: 12x + 3y = 480.',
         "x, y = sp.symbols('x y')\nans = 12*x + 3*y - 480\n")

    b.spr('ALG', L2, 'E',
          'In the xy-plane, the graph of 3x − 4y = 24 crosses the y-axis at the point (0, b). What is the value of b?',
          '-6', [],
          'On the y-axis x = 0, so −4y = 24 and y = −6.',
          "y = sp.Symbol('y')\nans = sp.solve(3*0 - 4*y - 24, y)[0]\n")

    b.mc('ALG', L2, 'H',
         'In the xy-plane, line ℓ passes through the points (−3, 7) and (5, −9). Which equation defines line ℓ?',
         'y = −2x + 1', ['y = −2x + 13', 'y = 2x + 13', 'y = −(1/2)x + 11/2'],
         'The slope is (−9 − 7)/(5 − (−3)) = −16/8 = −2. Using (−3, 7): 7 = −2(−3) + b, so b = 1 and the line is y = −2x + 1.',
         "x = sp.Symbol('x')\nm = sp.Rational(-9 - 7, 5 - (-3))\nbint = 7 - m*(-3)\nans = m*x + bint\n"
         "assert ans.subs(x, 5) == -9\n")

    b.spr('ALG', L2, 'H',
          'In the xy-plane, a line passes through the point (2, 9) and has an x-intercept of 5. The line can be written as y = mx + b, where m and b are constants. What is the value of b?',
          '15', [],
          'The line passes through (2, 9) and (5, 0), so m = (0 − 9)/(5 − 2) = −3. Then 9 = −3(2) + b gives b = 15.',
          "m = sp.Rational(0 - 9, 5 - 2)\nans = 9 - m*2\nassert m*5 + ans == 0\n")

    # ── Linear functions ──────────────────────────────────────────────
    b.mc('ALG', LF, 'E',
         'The graph of the linear function f is shown in the xy-plane. Which equation defines f?',
         'f(x) = (3/2)x − 3', ['f(x) = (2/3)x − 3', 'f(x) = −(3/2)x − 3', 'f(x) = (3/2)x + 2'],
         'The graph crosses the y-axis at (0, −3) and the x-axis at (2, 0), so the slope is 3/2 and f(x) = (3/2)x − 3.',
         "x = sp.Symbol('x')\nans = sp.Rational(3, 2)*x - 3\nassert ans.subs(x, 2) == 0\n",
         figure={'kind': 'fgraph', 'params': {'expr': '1.5*x - 3', 'xmin': -6, 'xmax': 6, 'ymin': -8, 'ymax': 6}})

    b.mc('ALG', LF, 'E',
         'The cost C, in dollars, to rent a kayak for h hours is given by C = 18h + 25. What does the number 18 represent in this equation?',
         'The cost for each additional hour of the rental', ['The total cost of a one-hour rental', 'The fixed fee charged for any rental', 'The number of hours in a typical rental'],
         '18 is the coefficient of h, so the cost rises by $18 for each additional hour; 25 is the fixed fee.',
         "h = sp.Symbol('h')\nC = 18*h + 25\nper_hour = C.subs(h, 2) - C.subs(h, 1)\nassert per_hour == 18 and C.subs(h, 1) == 43 and C.subs(h, 0) == 25\n",
         custom="assert C[K].startswith('The cost for each additional hour')\n")

    b.mc('ALG', LF, 'M',
         'The table gives three values of x and their corresponding values of f(x) for the linear function f. Which equation defines f?',
         'f(x) = 3x + 5', ['f(x) = 6x + 2', 'f(x) = 3x + 8', 'f(x) = 2x + 6'],
         'From x = 1 to x = 3, f(x) rises from 8 to 14, a slope of 6/2 = 3. Then 8 = 3(1) + b gives b = 5, and f(7) = 26 checks.',
         "x = sp.Symbol('x')\npts = [(1, 8), (3, 14), (7, 26)]\nm = sp.Rational(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0])\nans = m*x + (pts[0][1] - m*pts[0][0])\n"
         "assert all(ans.subs(x, a) == v for a, v in pts)\n",
         figure={'kind': 'table', 'params': {'headers': ['x', 'f(x)'], 'rows': [['1', '8'], ['3', '14'], ['7', '26']]}})

    b.spr('ALG', LF, 'M',
          'For the linear function f, f(4) = −2 and f(10) = 13. What is the value of f(0)?',
          '-12', [],
          'The slope is (13 − (−2))/(10 − 4) = 15/6 = 2.5. Going from x = 4 back to x = 0 lowers f by 4(2.5) = 10, so f(0) = −2 − 10 = −12.',
          "m = sp.Rational(13 - (-2), 10 - 4)\nans = -2 - m*4\n")

    b.mc('ALG', LF, 'H',
         'A one-day truck rental costs a fixed fee plus a constant charge per mile driven. Driving 120 miles costs $86, and driving 200 miles costs $110. What is the fixed fee, in dollars?',
         '50', ['36', '56', '62'],
         'The extra 80 miles cost $24, so the charge is $0.30 per mile. 120 miles cost $36 of the $86, leaving a fixed fee of $50.',
         "r = sp.Rational(110 - 86, 200 - 120)\nans = 86 - r*120\n")

    b.mc('ALG', LF, 'H',
         'The graph of line p is shown in the xy-plane. Line q is perpendicular to line p and passes through the point (2, 1). What is the y-intercept of line q?',
         '−3', ['5', '0', '−1'],
         'Line p passes through (0, 4) and (8, 0), so its slope is −1/2. A perpendicular slope is 2. Then q is y − 1 = 2(x − 2), or y = 2x − 3, with y-intercept −3.',
         "mp = sp.Rational(0 - 4, 8 - 0)\nmq = -1/mp\nans = 1 - mq*2\n",
         figure={'kind': 'fgraph', 'params': {'expr': '-x/2 + 4', 'xmin': -4, 'xmax': 10, 'ymin': -4, 'ymax': 8}})

    # ── Systems of two linear equations ───────────────────────────────
    b.mc('ALG', SY, 'E',
         'x + y = 14\nx − y = 4\nWhat is the value of y in the solution (x, y) to the system of equations above?',
         '5', ['9', '4', '10'],
         'Subtracting the second equation from the first gives 2y = 10, so y = 5 (and x = 9).',
         "x, y = sp.symbols('x y')\nans = sp.solve([x + y - 14, x - y - 4], [x, y])[y]\n")

    b.spr('ALG', SY, 'M',
          'A school ordered 40 supplies in all: notebooks that cost $3 each and binders that cost $5 each. The total cost was $152. How many binders did the school order?',
          '16', [],
          'With n notebooks and b binders, n + b = 40 and 3n + 5b = 152. Substituting n = 40 − b: 120 + 2b = 152, so b = 16.',
          "n, bd = sp.symbols('n bd')\nans = sp.solve([n + bd - 40, 3*n + 5*bd - 152], [n, bd])[bd]\n")

    b.mc('ALG', SY, 'M',
         '3x + 2y = 7\n5x − 2y = 17\nIf (x, y) is the solution to the system of equations above, what is the value of x + y?',
         '2', ['4', '−1', '3'],
         'Adding the equations gives 8x = 24, so x = 3. Then 9 + 2y = 7 gives y = −1, and x + y = 2.',
         "x, y = sp.symbols('x y')\ns = sp.solve([3*x + 2*y - 7, 5*x - 2*y - 17], [x, y])\nans = s[x] + s[y]\n")

    b.spr('ALG', SY, 'H',
          '3x + ky = 12\nmx + 10y = 24\nIn the system of equations above, k and m are constants. If the system has infinitely many solutions, what is the value of m + k?',
          '11', [],
          'Infinitely many solutions means the second equation is a multiple of the first. Since 24 = 2(12), every coefficient doubles: m = 2(3) = 6 and 10 = 2k, so k = 5. Then m + k = 11.',
          "k, m = sp.symbols('k m')\ns = sp.solve([m - 2*3, 10 - 2*k], [m, k])\nans = s[m] + s[k]\n"
          "x, y = sp.symbols('x y')\nassert sp.simplify((s[m]*x + 10*y - 24) - 2*(3*x + s[k]*y - 12)) == 0\n")

    b.mc('ALG', SY, 'H',
         'A chemist mixes a 10% saline solution with a 30% saline solution to make 50 liters of a 16% saline solution. How many liters of the 30% solution does the chemist use?',
         '15', ['35', '25', '20'],
         'Let a and b be the liters of the 10% and 30% solutions: a + b = 50 and 0.10a + 0.30b = 0.16(50) = 8. Substituting a = 50 − b: 5 + 0.20b = 8, so b = 15.',
         "a, bb = sp.symbols('a bb')\nans = sp.solve([a + bb - 50, sp.Rational(1, 10)*a + sp.Rational(3, 10)*bb - sp.Rational(16, 100)*50], [a, bb])[bb]\n")

    # ── Linear inequalities ───────────────────────────────────────────
    b.mc('ALG', IN, 'E',
         'Which of the following values of x satisfies the inequality 4x − 7 > 21?',
         '8', ['5', '6', '7'],
         '4x − 7 > 21 means 4x > 28, so x > 7. Of the choices, only 8 is greater than 7.',
         "ok = [v for v in [5, 6, 7, 8] if 4*v - 7 > 21]\nassert ok == [8]\n",
         key='D', custom="assert C[K] == '8' and sorted(C) == ['5', '6', '7', '8']\n")

    b.spr('ALG', IN, 'M',
          'A delivery van can safely carry at most 1,800 pounds. The driver weighs 180 pounds, and each box loaded into the van weighs 45 pounds. What is the greatest number of boxes the van can carry with the driver on board?',
          '36', [],
          '180 + 45b ≤ 1,800 means 45b ≤ 1,620, so b ≤ 36. The greatest whole number of boxes is 36.',
          "ans = max(b for b in range(0, 100) if 180 + 45*b <= 1800)\n")

    b.mc('ALG', IN, 'M',
         'Which of the following points (x, y) in the xy-plane is a solution to the inequality y < 2x − 3?',
         '(2, 0)', ['(0, 0)', '(1, −1)', '(3, 5)'],
         'Test each point: at (2, 0), 0 < 2(2) − 3 = 1 is true. (0, 0) gives 0 < −3, (1, −1) gives −1 < −1, and (3, 5) gives 5 < 3, all false.',
         "pts = {'(2, 0)': (2, 0), '(0, 0)': (0, 0), '(1, −1)': (1, -1), '(3, 5)': (3, 5)}\n"
         "good = [k for k, (x, y) in pts.items() if y < 2*x - 3]\nassert good == ['(2, 0)']\n",
         custom="assert C[K] == '(2, 0)'\n")

    b.mc('ALG', IN, 'H',
         'A caterer charges a $250 booking fee plus $32 per guest. A family wants to invite at least 40 guests and spend no more than $2,000. Which inequality gives all possible numbers of guests g?',
         '40 ≤ g ≤ 54', ['40 ≤ g ≤ 55', '40 ≤ g ≤ 62', '54 ≤ g ≤ 62'],
         '250 + 32g ≤ 2,000 gives 32g ≤ 1,750, so g ≤ 54.6875. Guests are whole people, so g ≤ 54, and the family wants g ≥ 40.',
         "ok = [g for g in range(0, 200) if g >= 40 and 250 + 32*g <= 2000]\nassert (min(ok), max(ok)) == (40, 54)\n",
         custom="assert C[K] == '40 ≤ g ≤ 54'\n")

    b.spr('ALG', IN, 'H',
          'How many integers x satisfy −3 ≤ 2x − 5 < 9 ?',
          '6', [],
          'Add 5: 2 ≤ 2x < 14. Divide by 2: 1 ≤ x < 7. The integers are 1, 2, 3, 4, 5, and 6 — six of them.',
          "ans = len([x for x in range(-50, 50) if -3 <= 2*x - 5 < 9])\n")

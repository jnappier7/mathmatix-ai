"""SAT bank p4 — Algebra (ALG). 30 items, figure-heavy (graphs, two-line systems, tables)."""

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


def only(choices_to_exprs, key_text):
    """Custom-check helper: the key is the ONE choice whose expression matches `ans`."""
    pairs = ', '.join(f"{k!r}: {v}" for k, v in choices_to_exprs.items())
    return (f"forms = {{{pairs}}}\n"
            f"assert [k for k, v in forms.items() if sp.simplify(v - ans) == 0] == [{key_text!r}]\n")


def add(b):
    # ── Figure items ─────────────────────────────────────────────────
    b.mc('ALG', LF, 'E',
         'The graph of the linear function f is shown. What is the y-intercept of the graph?',
         '−2', ['3', '2/3', '−3'],
         'The graph crosses the y-axis at (0, −2). (2/3 is where it crosses the x-axis; 3 is the slope.)',
         X + "f = 3*x - 2\nans = f.subs(x, 0)\n",
         figure={'kind': 'fgraph', 'params': {'expr': '3*x - 2', 'xmin': -4, 'xmax': 4, 'ymin': -6, 'ymax': 6}})

    b.mc('ALG', L2, 'E',
         'The line shown in the xy-plane passes through (0, 4) and (2, 0). Which equation represents the line?',
         'y = −2x + 4', ['y = 2x + 4', 'y = −(1/2)x + 4', 'y = −2x + 2'],
         'Slope = (0 − 4)/(2 − 0) = −2, and the y-intercept is 4.',
         X + "ans = -2*x + 4\nassert ans.subs(x, 2) == 0\n",
         figure={'kind': 'fgraph', 'params': {'expr': '-2*x + 4', 'xmin': -3, 'xmax': 5, 'ymin': -4, 'ymax': 8}})

    b.mc('ALG', LF, 'M',
         'The table shows four values of x and y for a linear relationship. Which equation represents the relationship?',
         'y = 4x + 3', ['y = 3x + 4', 'y = 4x + 7', 'y = 7x'],
         'y rises by 4 for each increase of 1 in x, and 7 = 4(1) + 3, so y = 4x + 3.',
         X + "pts = [(1, 7), (2, 11), (3, 15), (4, 19)]\nans = 4*x + 3\nassert all(ans.subs(x, a) == v for a, v in pts)\n",
         figure={'kind': 'table', 'params': {'headers': ['x', 'y'], 'rows': [['1', '7'], ['2', '11'], ['3', '15'], ['4', '19']]}})

    b.spr('ALG', LF, 'M',
          'The table shows two values of the linear function h. What is the value of h(5)?',
          '-8', [],
          'From x = −1 to x = 3, h drops 12 over 4 units: slope −3. From x = 3 to x = 5 it drops 6 more: h(5) = −2 − 6 = −8.',
          "m = sp.Rational(-2 - 10, 3 - (-1))\nans = -2 + m*(5 - 3)\n",
          figure={'kind': 'table', 'params': {'headers': ['x', 'h(x)'], 'rows': [['−1', '10'], ['3', '−2']]}})

    b.mc('ALG', SY, 'M',
         'The graphs of y = x + 2 and y = −0.5x + 5 are shown. What is the solution (x, y) to the system formed by the two equations?',
         '(2, 4)', ['(4, 2)', '(0, 2)', '(0, 5)'],
         'The solution is the intersection: x + 2 = −0.5x + 5 gives 1.5x = 3, so x = 2 and y = 4.',
         "x, y = sp.symbols('x y')\ns = sp.solve([y - x - 2, y + sp.Rational(1, 2)*x - 5], [x, y])\nassert (s[x], s[y]) == (2, 4)\n",
         custom="assert C[K] == '(2, 4)'\n",
         figure={'kind': 'region', 'params': {'expr1': 'x + 2', 'expr2': '-0.5*x + 5', 'xmin': -2, 'xmax': 7, 'ymin': -1, 'ymax': 8}})

    b.mc('ALG', SY, 'H',
         'The graphs of y = 2x − 3 and y = 2x + 1 are shown. How many solutions does the system made of these two equations have?',
         'None', ['Exactly one', 'Exactly two', 'Infinitely many'],
         'The lines have the same slope and different y-intercepts, so they are parallel and never meet.',
         "x, y = sp.symbols('x y')\nassert sp.solve([y - 2*x + 3, y - 2*x - 1], [x, y], dict=True) == []\n",
         custom="assert C[K] == 'None'\n",
         figure={'kind': 'region', 'params': {'expr1': '2*x - 3', 'expr2': '2*x + 1', 'xmin': -3, 'xmax': 4, 'ymin': -8, 'ymax': 8}})

    b.mc('ALG', LF, 'M',
         'The graph shows the total cost C, in dollars, of renting a canoe for h hours. What does the y-intercept of the graph represent?',
         'A flat fee of $15 charged for any rental',
         ['The cost per hour of the rental', 'The cost of a 15-hour rental', 'The number of hours the canoe is rented'],
         'The y-intercept is the cost at h = 0 — what you pay before any hours are added: a $15 flat fee. The hourly rate is the slope, $2.50.',
         "h = sp.Symbol('h')\nC_ = sp.Rational(5, 2)*h + 15\nassert C_.subs(h, 0) == 15\n",
         custom="assert C[K].startswith('A flat fee of $15')\n",
         figure={'kind': 'fgraph', 'params': {'expr': '2.5*x + 15', 'xmin': 0, 'xmax': 8, 'ymin': 0, 'ymax': 40}})

    b.spr('ALG', L2, 'H',
          'The line shown passes through (−3, 0) and (0, 6). Line k is parallel to the line shown and passes through the point (2, 1). What is the y-intercept of line k?',
          '-3', [],
          'The shown line has slope 6/3 = 2. Line k: y − 1 = 2(x − 2), or y = 2x − 3, with y-intercept −3.',
          "m = sp.Rational(6 - 0, 0 - (-3))\nans = 1 - m*2\n",
          figure={'kind': 'fgraph', 'params': {'expr': '2*x + 6', 'xmin': -5, 'xmax': 3, 'ymin': -4, 'ymax': 10}})

    b.mc('ALG', LF, 'M',
         'The graph of the linear function f is shown; it passes through (−2, −3) and (2, 5). What is the value of f(6)?',
         '13', ['11', '15', '9'],
         'Slope = (5 − (−3))/(2 − (−2)) = 2, and f(0) = 1, so f(x) = 2x + 1 and f(6) = 13.',
         X + "m = sp.Rational(5 - (-3), 2 - (-2))\nf = 5 + m*(x - 2)\nans = f.subs(x, 6)\n",
         figure={'kind': 'fgraph', 'params': {'expr': '2*x + 1', 'xmin': -4, 'xmax': 4, 'ymin': -6, 'ymax': 8}})

    b.mc('ALG', LF, 'H',
         'The table shows three values of x and y for a linear relationship. Which equation represents the relationship?',
         'y = −2x + 7', ['y = 2x + 7', 'y = −2x + 11', 'y = −(1/2)x + 7'],
         'From x = 0 to x = 4, y drops from 7 to −1, a slope of −8/4 = −2, and y = 7 at x = 0. Check x = −2: −2(−2) + 7 = 11 ✓',
         X + "pts = [(-2, 11), (0, 7), (4, -1)]\nans = -2*x + 7\nassert all(ans.subs(x, a) == v for a, v in pts)\n",
         figure={'kind': 'table', 'params': {'headers': ['x', 'y'], 'rows': [['−2', '11'], ['0', '7'], ['4', '−1']]}})

    b.spr('ALG', LF, 'M',
          'The graph of the linear function f is shown. What is the value of f(0) + f(3)?',
          '5', [],
          'The line passes through (0, 4) and (4, 0), so f(x) = −x + 4. Then f(0) = 4 and f(3) = 1, for a total of 5.',
          X + "f = -x + 4\nans = f.subs(x, 0) + f.subs(x, 3)\n",
          figure={'kind': 'fgraph', 'params': {'expr': '-x + 4', 'xmin': -2, 'xmax': 6, 'ymin': -2, 'ymax': 6}})

    b.mc('ALG', SY, 'E',
         'The graphs of y = −x + 6 and y = x are shown. What is the x-coordinate of the point where they intersect?',
         '3', ['6', '0', '1.5'],
         'Set −x + 6 = x: 6 = 2x, so x = 3 (the point is (3, 3)).',
         X + "ans = sp.solve(-x + 6 - x, x)[0]\n",
         figure={'kind': 'region', 'params': {'expr1': '-x + 6', 'expr2': 'x', 'xmin': -1, 'xmax': 7, 'ymin': -1, 'ymax': 7}})

    # ── Linear equations in one variable ─────────────────────────────
    b.spr('ALG', L1, 'E',
          'If 7x − 5 = 3x + 19, what is the value of x?',
          '6', [],
          'Subtract 3x and add 5: 4x = 24, so x = 6.',
          X + "ans = sp.solve(7*x - 5 - (3*x + 19), x)[0]\n")

    b.spr('ALG', L1, 'M',
          'If 2(x + 3) = 5x − 9, what is the value of x?',
          '5', [],
          'Distribute: 2x + 6 = 5x − 9. Then 15 = 3x, so x = 5.',
          X + "ans = sp.solve(2*(x + 3) - (5*x - 9), x)[0]\n")

    b.mc('ALG', L1, 'M',
         'If x/4 − x/6 = 3, what is the value of x?',
         '36', ['12', '18', '72'],
         'Multiply by 12: 3x − 2x = 36, so x = 36.',
         X + "ans = sp.solve(x/4 - x/6 - 3, x)[0]\n")

    b.mc('ALG', L1, 'H',
         'In the equation ax + 5 = 3x − b, a and b are constants. Under which conditions does the equation have NO solution?',
         'a = 3 and b ≠ −5', ['a = 3 and b = −5', 'a ≠ 3', 'a = −3 and b = 5'],
         'Rewrite as (a − 3)x = −b − 5. With a = 3 the left side is 0: no solution unless −b − 5 = 0. So no solution exactly when a = 3 and b ≠ −5. (a = 3, b = −5 gives infinitely many.)',
         "x = sp.Symbol('x')\n"
         "def nsol(a, bv):\n    e = sp.expand(a*x + 5 - (3*x - bv))\n    if e.coeff(x, 1) != 0: return 1\n    return 0 if e != 0 else 'inf'\n"
         "assert nsol(3, 0) == 0 and nsol(3, 7) == 0 and nsol(3, -5) == 'inf' and nsol(4, 0) == 1 and nsol(-3, 5) == 1\n",
         custom="assert C[K] == 'a = 3 and b ≠ −5'\n")

    b.mc('ALG', L1F, 'M',
         'The volume of a pyramid is V = (1/3)Bh, where B is the area of its base and h is its height. Which equation gives h in terms of V and B?',
         'h = 3V/B', ['h = V/(3B)', 'h = 3B/V', 'h = 3VB'],
         'Multiply both sides by 3: 3V = Bh. Divide by B: h = 3V/B.',
         "V, B, h = sp.symbols('V B h', positive=True)\nans = sp.solve(V - sp.Rational(1, 3)*B*h, h)[0]\n"
         + only({'h = 3V/B': '3*V/B', 'h = V/(3B)': 'V/(3*B)', 'h = 3B/V': '3*B/V', 'h = 3VB': '3*V*B'}, 'h = 3V/B'),
         custom="assert C[K] == 'h = 3V/B'\n")

    # ── Linear equations in two variables ─────────────────────────────
    b.mc('ALG', L2, 'M',
         'In the xy-plane, a line has slope 1/2 and passes through the point (−2, 1). Which equation defines the line?',
         'y = (1/2)x + 2', ['y = (1/2)x + 1', 'y = 2x + 5', 'y = (1/2)x − 2'],
         'y − 1 = (1/2)(x + 2) = (1/2)x + 1, so y = (1/2)x + 2.',
         X + "ans = sp.Rational(1, 2)*(x + 2) + 1\n")

    b.spr('ALG', L2, 'H',
          'The point (a, a + 4) lies on the line 3x − y = 10. What is the value of a?',
          '7', [],
          '3a − (a + 4) = 10, so 2a − 4 = 10 and a = 7.',
          "a = sp.Symbol('a')\nans = sp.solve(3*a - (a + 4) - 10, a)[0]\n")

    # ── Linear functions ──────────────────────────────────────────────
    b.mc('ALG', LF, 'M',
         'For the linear function f(x) = mx + b, f(1) = 5 and f(4) = −4. What is the value of m?',
         '−3', ['3', '−9', '1/3'],
         'm = (−4 − 5)/(4 − 1) = −9/3 = −3.',
         "ans = sp.Rational(-4 - 5, 4 - 1)\n")

    b.mc('ALG', LF, 'H',
         'The total cost of printing flyers is a linear function of the number printed. Printing 200 flyers costs $56, and printing 500 flyers costs $110. What is the cost, in dollars, of each additional flyer?',
         '0.18', ['0.28', '0.22', '54'],
         'The extra 300 flyers cost $54, so each additional flyer costs 54/300 = $0.18. (0.28 is 56/200, which includes the fixed cost.)',
         "ans = sp.Rational(110 - 56, 500 - 200)\n")

    b.mc('ALG', LF, 'E',
         'The function g is defined by g(x) = −4x + 9. For what value of a is g(a) = 1?',
         '2', ['−2', '5', '1/2'],
         '−4a + 9 = 1 gives −4a = −8, so a = 2.',
         "a = sp.Symbol('a')\nans = sp.solve(-4*a + 9 - 1, a)[0]\n")

    # ── Systems ───────────────────────────────────────────────────────
    b.spr('ALG', SY, 'E',
          'x + 2y = 16\nx = 2y\nWhat is the value of y in the solution to the system above?',
          '4', [],
          'Substitute x = 2y: 2y + 2y = 16, so y = 4.',
          "x, y = sp.symbols('x y')\nans = sp.solve([x + 2*y - 16, x - 2*y], [x, y])[y]\n")

    b.mc('ALG', SY, 'M',
         '3x + 2y = 12\n3x − 2y = 0\nWhat is the value of y in the solution to the system above?',
         '3', ['2', '6', '1.5'],
         'Add the equations: 6x = 12, so x = 2. Then 6 + 2y = 12 gives y = 3.',
         "x, y = sp.symbols('x y')\nans = sp.solve([3*x + 2*y - 12, 3*x - 2*y], [x, y])[y]\n")

    b.mc('ALG', SY, 'H',
         'A 40-question test has some questions worth 2 points and the rest worth 4 points. The test is worth 100 points in all. How many 4-point questions are on the test?',
         '10', ['30', '20', '15'],
         'With t two-point and f four-point questions: t + f = 40 and 2t + 4f = 100. Doubling the first: 2t + 2f = 80, so 2f = 20 and f = 10.',
         "t, f = sp.symbols('t f')\nans = sp.solve([t + f - 40, 2*t + 4*f - 100], [t, f])[f]\n")

    b.spr('ALG', SY, 'H',
          'kx + 3y = 7\n4x − 6y = 2\nIn the system above, k is a constant. For what value of k does the system have no solution?',
          '-2', [],
          'No solution means parallel lines: equal slopes, different lines. The slopes are −k/3 and 4/6 = 2/3, so k = −2. Then the first line is −2x + 3y = 7, while the second is −2x + 3y = −1 — parallel and distinct.',
          "k = sp.Symbol('k')\nkv = sp.solve(-k/3 - sp.Rational(4, 6), k)[0]\nx, y = sp.symbols('x y')\nassert sp.solve([kv*x + 3*y - 7, 4*x - 6*y - 2], [x, y], dict=True) == []\nans = kv\n")

    # ── Inequalities ──────────────────────────────────────────────────
    b.mc('ALG', IN1, 'E',
         'Which of the following describes all solutions to x/3 + 2 < 5 ?',
         'x < 9', ['x < 3', 'x > 9', 'x < 21'],
         'Subtract 2: x/3 < 3. Multiply by 3: x < 9.',
         "for xv in [8, 9, 10, -5]:\n    assert (sp.Rational(xv, 3) + 2 < 5) == (xv < 9)\n",
         custom="assert C[K] == 'x < 9'\n")

    b.spr('ALG', IN1, 'M',
          'An elevator can carry at most 1,100 kilograms. Its operator weighs 80 kilograms, and each box to be loaded weighs 34 kilograms. What is the greatest number of boxes the elevator can carry with the operator aboard?',
          '30', [],
          '80 + 34b ≤ 1,100 gives 34b ≤ 1,020, so b ≤ 30.',
          "ans = max(bx for bx in range(0, 100) if 80 + 34*bx <= 1100)\n")

    b.mc('ALG', IN, 'H',
         'Which of the following points (x, y) is NOT a solution to the inequality y ≥ −x + 3 ?',
         '(1, 1)', ['(2, 2)', '(0, 4)', '(3, 0)'],
         '(1, 1): 1 ≥ −1 + 3 = 2 is false. The others hold — (3, 0) sits exactly on the line, which "≥" includes.',
         "pts = {'(1, 1)': (1, 1), '(2, 2)': (2, 2), '(0, 4)': (0, 4), '(3, 0)': (3, 0)}\n"
         "notsol = [k for k, (px, py) in pts.items() if not (py >= -px + 3)]\nassert notsol == ['(1, 1)']\n",
         custom="assert C[K] == '(1, 1)'\n")

    b.mc('ALG', IN1, 'H',
         'How many integers x satisfy −5 < 2x + 1 ≤ 9 ?',
         '7', ['6', '8', '5'],
         'Subtract 1: −6 < 2x ≤ 8. Divide by 2: −3 < x ≤ 4. The integers are −2, −1, 0, 1, 2, 3, 4 — seven of them.',
         "ans = len([xv for xv in range(-50, 50) if -5 < 2*xv + 1 <= 9])\n")

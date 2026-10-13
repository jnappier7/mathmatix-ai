"""SAT bank p7 — Problem-Solving & Data Analysis (PSDA) and Geometry &
Trigonometry (GEO). 12 + 12 items. Every figure is needed; no scatter stem
states its line."""

RR = 'Ratios, rates, proportional relationships, and units'
PC = 'Percentages'
OV = 'One-variable data: center and spread'
TV = 'Two-variable data: scatterplots and models'
PR = 'Probability and conditional probability'
IM = 'Inference and margin of error'
SC = 'Evaluating statistical claims'

AV = 'Area and volume'
LA = 'Lines, angles, and triangles'
RT = 'Right triangles and trigonometry'
PY = 'Right triangles (Pythagorean theorem)'
CI = 'Circles'
CE = 'Circles (equation in the xy-plane)'

NOTE = ' Note: Figure not drawn to scale.'

# Around y = 3x + 5 with residuals ±2 orthogonal to x (sum 0, sum x·r 0):
# the drawn line is exactly the least-squares line.
SALES = [[1, 10], [2, 9], [3, 12], [4, 19], [5, 18], [6, 25], [7, 28], [8, 27]]


def add(b):
    # ── PSDA: Easy (4) ───────────────────────────────────────────────
    b.spr('PSDA', OV, 'E',
          'The bar graph shows the rainfall, in inches, in a town for four months. How many more inches of rain fell in March than in January?',
          '6', [],
          'March’s bar reaches 10 inches and January’s reaches 4: 10 − 4 = 6.',
          "vals = {'Jan': 4, 'Feb': 6, 'Mar': 10, 'Apr': 8}\nans = vals['Mar'] - vals['Jan']\n",
          figure={'kind': 'bar', 'params': {'labels': ['Jan', 'Feb', 'Mar', 'Apr'], 'values': [4, 6, 10, 8], 'xlabel': 'Month', 'ylabel': 'Rainfall (inches)'}})

    b.mc('PSDA', RR, 'E',
         'A train travels at a constant speed of 90 kilometers per hour. How many kilometers does it travel in 40 minutes?',
         '60', ['36', '135', '2.25'],
         '40 minutes is 40/60 = 2/3 of an hour: 90 × 2/3 = 60 kilometers. (135 multiplies by 3/2 instead.)',
         "ans = 90 * sp.Rational(40, 60)\n")

    b.mc('PSDA', PR, 'E',
         'A box contains 12 red pens and 8 blue pens. If one pen is chosen at random, what is the probability that it is red?',
         '3/5', ['2/5', '2/3', '1/12'],
         'There are 12 + 8 = 20 pens, and 12 are red: 12/20 = 3/5. (2/3 compares red to blue, not to all pens.)',
         "ans = sp.Rational(12, 12 + 8)\n")

    b.spr('PSDA', PC, 'E',
          '30 is what percent of 120?',
          '25', [],
          '30/120 = 0.25, which is 25%.',
          "ans = sp.Rational(30, 120) * 100\n")

    # ── PSDA: Medium (5) ─────────────────────────────────────────────
    b.mc('PSDA', OV, 'M',
         'The table shows how many books each of 20 students read over the summer. What is the mean number of books read per student?',
         '3.45', ['3.25', '4', '5'],
         'Weight each value by its count: 1(3) + 2(5) + 4(8) + 6(4) = 69 books over 20 students, so the mean is 69/20 = 3.45. (3.25 averages 1, 2, 4, and 6 without weighting; 4 is the median.)',
         "vals = [1]*3 + [2]*5 + [4]*8 + [6]*4\nassert len(vals) == 20\nans = sp.Rational(sum(vals), 20)\ns = sorted(vals)\nassert sp.Rational(s[9] + s[10], 2) == 4\n",
         figure={'kind': 'table', 'params': {'headers': ['Books read', 'Number of students'], 'rows': [['1', '3'], ['2', '5'], ['4', '8'], ['6', '4']]}})

    b.mc('PSDA', TV, 'M',
         'The scatterplot shows the number of hours x a booth was open on each of eight days and the number of shirts y it sold that day, along with a line of best fit. Which equation best represents the line of best fit?',
         'y = 3x + 5', ['y = 5x + 3', 'y = −3x + 5', 'y = 3x + 20'],
         'The line rises from left to right, so the slope is positive, which rules out y = −3x + 5. At x = 5 the line crosses the 20 gridline. Test the others at x = 5: y = 3x + 5 gives 20, y = 5x + 3 gives 28, and y = 3x + 20 gives 35. Only y = 3x + 5 fits the drawn line.',
         "import numpy as np\npts = " + repr(SALES) + "\nxs = np.array([p[0] for p in pts]); ys = np.array([p[1] for p in pts])\n"
         "m, c = np.polyfit(xs, ys, 1)\nassert abs(m - 3) < 1e-9 and abs(c - 5) < 1e-9 and 3*5 + 5 == 20\nx = sp.Symbol('x')\nans = None\n",
         custom="x = sp.Symbol('x')\n_ok = [c for c in C if sp.simplify(P(c.split('=', 1)[1]) - (3*x + 5)) == 0]\nassert _ok == [C[K]], _ok\n",
         figure={'kind': 'scatter', 'params': {'pts': SALES, 'xlabel': 'Hours open', 'ylabel': 'Shirts sold', 'line': {'slope': 3, 'yint': 5}}})

    b.spr('PSDA', PC, 'M',
          'A jacket regularly priced at $80 is marked down 25%. At checkout, an additional 10% is taken off the sale price. What is the final price, in dollars?',
          '54', [],
          'After 25% off: 80 × 0.75 = 60. Then 10% off $60: 60 × 0.90 = 54. (Taking 35% off at once would give $52, but the 10% comes off the lower price.)',
          "ans = 80 * sp.Rational(75, 100) * sp.Rational(90, 100)\n")

    b.mc('PSDA', IM, 'M',
         'Two random samples were taken from the same population to estimate the same mean. Sample A has 100 people and a margin of error of 9. Sample B has 900 people and a margin of error of 3. Which is the most likely reason sample B has the smaller margin of error?',
         'Sample B is larger.',
         ['Sample B was chosen more randomly.', 'Sample B has a larger mean.', 'Sample B’s people were more alike than sample A’s.'],
         'With everything else equal, a larger random sample gives a more precise estimate. (Nine times the sample size gives about one-third the margin of error.)',
         "ans = None\nassert 9 / 3 == (900 / 100) ** 0.5\n",
         custom="assert C[K] == 'Sample B is larger.'\n")

    b.spr('PSDA', RR, 'M',
          'In a class of 40 students, the ratio of boys to girls is 3 to 5. How many boys are in the class?',
          '15', [],
          'The class divides into 3 + 5 = 8 equal parts of 40/8 = 5 students. Boys make up 3 parts: 15.',
          "ans = sp.Rational(3, 3 + 5) * 40\n")

    # ── PSDA: Hard (3) ───────────────────────────────────────────────
    b.mc('PSDA', PR, 'H',
         'The table shows the drink preferences of 100 people at a café. If a teen from this group is chosen at random, what is the probability that the teen prefers coffee?',
         '1/5', ['1/10', '1/2', '3/5'],
         'Only the 25 teens count, and 5 of them prefer coffee: 5/25 = 1/5. (1/10 divides by the 50 coffee drinkers; 3/5 is the share of adults who prefer coffee.)',
         "ans = sp.Rational(5, 20 + 5)\n",
         figure={'kind': 'table', 'params': {'headers': ['', 'Tea', 'Coffee', 'Total'], 'rows': [['Adults', '30', '45', '75'], ['Teens', '20', '5', '25'], ['Total', '50', '50', '100']]}})

    b.mc('PSDA', OV, 'H',
         'A data set has a mean of 12 and a standard deviation of 3. Each value in the data set is increased by 5, and then each result is doubled. What are the mean and standard deviation of the new data set?',
         'Mean 34, standard deviation 6',
         ['Mean 29, standard deviation 6', 'Mean 34, standard deviation 16', 'Mean 34, standard deviation 3'],
         'Adding 5 moves the mean to 17 but leaves the spread alone; doubling then doubles both: mean 34, standard deviation 6.',
         "import statistics as st\nd = [9, 15, 9, 15]\nassert st.mean(d) == 12 and abs(st.pstdev(d) - 3) < 1e-9\ne = [2*(v + 5) for v in d]\nassert st.mean(e) == 34 and abs(st.pstdev(e) - 6) < 1e-9\nans = None\n",
         custom="assert C[K] == 'Mean 34, standard deviation 6'\n")

    b.spr('PSDA', RR, 'H',
          'A rectangular tank is 2 meters long, 1.5 meters wide, and 0.8 meter deep. It is filled with water at a rate of 12 liters per minute. How many minutes does it take to fill the empty tank? (1 cubic meter = 1,000 liters)',
          '200', [],
          'Volume = 2 × 1.5 × 0.8 = 2.4 cubic meters = 2,400 liters. At 12 liters per minute: 2,400/12 = 200 minutes.',
          "ans = sp.Rational(2) * sp.Rational(3, 2) * sp.Rational(4, 5) * 1000 / 12\n")

    # ── GEO: Easy (4) ────────────────────────────────────────────────
    b.spr('GEO', AV, 'E',
          'A rectangle has a length of 9 meters and a width of 4 meters. What is the perimeter of the rectangle, in meters?',
          '26', [],
          'Perimeter = 2(length + width) = 2(9 + 4) = 26. (36 is the area.)',
          "ans = 2*(9 + 4)\n")

    b.spr('GEO', LA, 'E',
          'An exterior angle of a triangle measures 120°. One of the two interior angles not adjacent to it measures 70°. What is the measure, in degrees, of the other one?',
          '50', [],
          'An exterior angle equals the sum of the two remote interior angles: 120 − 70 = 50.',
          "ans = 120 - 70\n")

    b.mc('GEO', PY, 'E',
         'In the right triangle shown, what is the length of the hypotenuse c?' + NOTE,
         '34', ['46', '23', '26'],
         'The legs are 16 and 30: c² = 16² + 30² = 256 + 900 = 1,156, so c = 34. (46 adds the legs.)',
         "ans = sp.sqrt(16**2 + 30**2)\n",
         figure={'kind': 'geometry', 'params': {'shape': 'triangle', 'labels': {'horizontal_leg': '30', 'vertical_leg': '16', 'hypotenuse': 'c'}, 'marks': {'right_angle': 'between legs'}}})

    b.mc('GEO', CI, 'E',
         'A circle has an area of 49π square centimeters. What is the circumference of the circle, in centimeters?',
         '14π', ['7π', '49π', '98π'],
         'πr² = 49π gives r = 7, so the circumference is 2π(7) = 14π. (7π uses the radius alone.)',
         "r = sp.Symbol('r', positive=True)\nr0 = sp.solve(sp.pi*r**2 - 49*sp.pi, r)[0]\nans = 2*sp.pi*r0\n")

    # ── GEO: Medium (4) ──────────────────────────────────────────────
    b.mc('GEO', RT, 'M',
         'In the right triangle shown, what is the value of cos θ?' + NOTE,
         '4/5', ['3/5', '3/4', '4/3'],
         'The hypotenuse is 10 and the side opposite θ is 6, so the side adjacent to θ is √(10² − 6²) = 8. cos θ = adjacent/hypotenuse = 8/10 = 4/5. (3/5 is sin θ.)',
         "adj = sp.sqrt(10**2 - 6**2)\nans = adj / 10\n",
         figure={'kind': 'geometry', 'params': {'shape': 'triangle', 'labels': {'vertical_leg': '6', 'hypotenuse': '10', 'angle': 'θ'}, 'marks': {'right_angle': 'between legs'}}})

    b.mc('GEO', AV, 'M',
         'A cone has a base radius of 3 inches and a height of 8 inches. What is the volume of the cone, in cubic inches?',
         '24π', ['72π', '8π', '48π'],
         'V = (1/3)πr²h = (1/3)π(9)(8) = 24π. (72π forgets the 1/3: it is the cylinder with the same base and height.)',
         "ans = sp.Rational(1, 3) * sp.pi * 3**2 * 8\n")

    b.spr('GEO', LA, 'M',
          'Two triangles are similar, and the ratio of their corresponding side lengths is 2 to 5. The area of the smaller triangle is 12 square units. What is the area of the larger triangle, in square units?',
          '75', [],
          'Areas scale by the square of the side ratio: (5/2)² = 25/4. So the larger area is 12 × 25/4 = 75. (30 scales the area by 5/2 as if it were a length.)',
          "ans = 12 * sp.Rational(5, 2)**2\n")

    b.mc('GEO', CE, 'M',
         'The equation x² + y² + 10x − 4y = 7 defines a circle in the xy-plane. What are the coordinates of the center of the circle?',
         '(−5, 2)', ['(5, −2)', '(−5, −2)', '(10, −4)'],
         'Complete the square: (x² + 10x + 25) + (y² − 4y + 4) = 7 + 29, so (x + 5)² + (y − 2)² = 36. The center is (−5, 2).',
         "x, y = sp.symbols('x y')\nassert sp.expand((x + 5)**2 + (y - 2)**2 - 36) == x**2 + y**2 + 10*x - 4*y - 7\nans = None\n",
         custom="assert C[K] == '(−5, 2)' and len(set(C)) == 4\n")

    # ── GEO: Hard (4) ────────────────────────────────────────────────
    b.spr('GEO', CI, 'H',
          'Points A, B, and C lie on a circle with center O. Angle AOB measures 140°, and C lies on the larger arc from A to B. What is the measure, in degrees, of angle ACB?',
          '70', [],
          'An inscribed angle is half the central angle that subtends the same arc: 140/2 = 70.',
          "ans = sp.Rational(140, 2)\n")

    b.spr('GEO', RT, 'H',
          'For an acute angle θ, sin θ = 0.6. What is the value of tan θ?',
          '.75', ['3/4', '0.75'],
          'sin θ = 0.6 = 3/5, so picture a right triangle with opposite side 3 and hypotenuse 5. The adjacent side is 4, and tan θ = 3/4 = 0.75.',
          "s = sp.Rational(3, 5)\nc = sp.sqrt(1 - s**2)\nans = s / c\n")

    b.mc('GEO', CI, 'H',
         'In a circle, a central angle of 120° intercepts an arc of length 6π. What is the area of the circle?',
         '81π', ['36π', '9π', '27π'],
         'The arc is 120/360 = 1/3 of the circumference, so the circumference is 18π and the radius is 9. Area = π(9²) = 81π.',
         "r = sp.Symbol('r', positive=True)\nr0 = sp.solve(sp.Rational(120, 360)*2*sp.pi*r - 6*sp.pi, r)[0]\nans = sp.pi*r0**2\n")

    b.mc('GEO', AV, 'H',
         'A figure is made of a square with side length 8 and a semicircle whose diameter is one side of the square, attached outside the square. What is the area of the figure?',
         '64 + 8π', ['64 + 16π', '64 + 32π', '32 + 8π'],
         'The square’s area is 64. The semicircle has radius 4, so its area is (1/2)π(4²) = 8π. Total: 64 + 8π. (64 + 16π uses the whole circle.)',
         "ans = 8**2 + sp.Rational(1, 2)*sp.pi*4**2\n")

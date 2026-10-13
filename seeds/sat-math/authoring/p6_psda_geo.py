"""SAT bank p6 — Problem-Solving & Data Analysis (PSDA) and Geometry &
Trigonometry (GEO). 14 + 14 items. Weighted toward the thin skills: inference,
statistical claims, conditional probability, right-triangle trig. Every figure
is needed; no scatter stem states its line."""

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

# Quiz scores around y = 2x + 10, residuals exactly ±3 and orthogonal to x
# (sum 0, sum x·r 0), so the drawn line IS the least-squares line and four
# points sit clearly above it.
QUIZ = [[1, 15], [2, 11], [3, 13], [4, 21], [5, 17], [6, 25], [7, 27], [8, 23]]


def add(b):
    # ── PSDA: Easy (5) ───────────────────────────────────────────────
    b.spr('PSDA', PC, 'E',
          'What is 15% of 240?',
          '36', [],
          '15% = 0.15, and 0.15 × 240 = 36.',
          "ans = sp.Rational(15, 100) * 240\n")

    b.spr('PSDA', OV, 'E',
          'The bar graph shows the number of library books borrowed on each day of one week. How many books in total were borrowed on Tuesday and Thursday?',
          '90', [],
          'Tuesday’s bar reaches 40 and Thursday’s reaches 50: 40 + 50 = 90.',
          "vals = {'Mon': 30, 'Tue': 40, 'Wed': 20, 'Thu': 50, 'Fri': 40}\nans = vals['Tue'] + vals['Thu']\n",
          figure={'kind': 'bar', 'params': {'labels': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], 'values': [30, 40, 20, 50, 40], 'xlabel': 'Day', 'ylabel': 'Books borrowed'}})

    b.mc('PSDA', RR, 'E',
         'Six notebooks cost $9. At this price, what is the cost of 10 notebooks?',
         '$15', ['$13.50', '$60', '$18'],
         'Each notebook costs $9 ÷ 6 = $1.50, so 10 notebooks cost 10 × $1.50 = $15.',
         "ans = sp.Rational(9, 6) * 10\n")

    b.mc('PSDA', OV, 'E',
         'What is the range of the data set 12, 7, 19, 4, 15?',
         '15', ['11.4', '12', '19'],
         'Range = greatest − least = 19 − 4 = 15. (11.4 is the mean; 12 is the median.)',
         "vals = [12, 7, 19, 4, 15]\nans = max(vals) - min(vals)\n")

    b.mc('PSDA', PR, 'E',
         'A spinner has 8 equal sections numbered 1 through 8. If the spinner is spun once, what is the probability that it lands on a number greater than 5?',
         '3/8', ['5/8', '1/2', '3/5'],
         'The numbers greater than 5 are 6, 7, and 8: 3 of the 8 equal sections, so 3/8.',
         "ans = sp.Rational(len([n for n in range(1, 9) if n > 5]), 8)\n")

    # ── PSDA: Medium (5) ─────────────────────────────────────────────
    b.spr('PSDA', PR, 'M',
          'The table shows whether students in two grades have a part-time job. If a student who has a part-time job is chosen at random, what is the probability that the student is a senior? (Express your answer as a fraction or decimal.)',
          '7/11', ['.6363', '.6364', '0.636'],
          'Only the 66 students with a job count, and 42 of them are seniors: 42/66 = 7/11. (42/70 divides by all seniors instead.)',
          "ans = sp.Rational(42, 24 + 42)\n",
          tol=1e-3,   # 0.636 is 3.6e-4 from 7/11: the SAT's 5-character form
          figure={'kind': 'table', 'params': {'headers': ['', 'Has a job', 'No job', 'Total'], 'rows': [['Juniors', '24', '56', '80'], ['Seniors', '42', '28', '70'], ['Total', '66', '84', '150']]}})

    b.spr('PSDA', PC, 'M',
          'The number of members in a club fell from 250 to 190. By what percent did the number of members decrease?',
          '24', [],
          'The decrease is 60, and 60/250 = 0.24, or 24%. (Dividing by the new number, 190, gives about 32%.)',
          "ans = sp.Rational(250 - 190, 250) * 100\n")

    b.mc('PSDA', TV, 'M',
         'The scatterplot shows the number of hours x that eight students studied and each student’s quiz score y, along with a line of best fit. For how many of the eight students was the actual quiz score greater than the score predicted by the line of best fit?',
         '4', ['3', '5', '8'],
         'A point above the line scored more than the line predicts. The points at 1, 4, 6, and 7 hours are above the line; the other four are below it.',
         "import numpy as np\npts = " + repr(QUIZ) + "\nxs = np.array([p[0] for p in pts]); ys = np.array([p[1] for p in pts])\n"
         "m, c = np.polyfit(xs, ys, 1)\nassert abs(m - 2) < 1e-9 and abs(c - 10) < 1e-9\nans = sum(1 for a, v in pts if v > 2*a + 10)\n",
         figure={'kind': 'scatter', 'params': {'pts': QUIZ, 'xlabel': 'Hours studied', 'ylabel': 'Quiz score', 'line': {'slope': 2, 'yint': 10}}})

    b.mc('PSDA', IM, 'M',
         'In a random sample of 400 likely voters in a city, 52% said they support a new park. The margin of error for the estimate is 4 percentage points. Which conclusion is best supported?',
         'Between 48% and 56% of all likely voters in the city plausibly support the park.',
         ['More than half of all likely voters in the city definitely support the park.',
          'Exactly 52% of all likely voters in the city support the park.',
          'Between 48% and 56% of the 400 voters surveyed support the park.'],
         '52% ± 4 gives a plausible range of 48% to 56% for ALL likely voters. Because that range includes values below 50%, a majority is not certain. (The sample’s own percent is exactly 52%; the margin describes the city.)',
         "lo, hi = 52 - 4, 52 + 4\nassert (lo, hi) == (48, 56) and lo < 50\nans = None\n",
         custom="assert C[K].startswith('Between 48% and 56% of all likely voters')\n")

    b.spr('PSDA', RR, 'M',
          'On a map, 1 inch represents 25 miles. Two towns are 3.4 inches apart on the map. What is the actual distance between the towns, in miles?',
          '85', [],
          '3.4 × 25 = 85 miles.',
          "ans = sp.Rational(34, 10) * 25\n")

    # ── PSDA: Hard (4) ───────────────────────────────────────────────
    b.mc('PSDA', OV, 'H',
         'Class A has 20 students with a mean test score of 78. Class B has 30 students with a mean test score of 88. What is the mean test score of all 50 students?',
         '84', ['83', '86', '80'],
         'Total points: 20(78) + 30(88) = 1,560 + 2,640 = 4,200, and 4,200/50 = 84. (83 averages the two means as if the classes were the same size.)',
         "ans = sp.Rational(20*78 + 30*88, 50)\n")

    b.spr('PSDA', PC, 'H',
          'After a 25% increase, the price of a ticket is $75. What was the price, in dollars, before the increase?',
          '60', [],
          'The new price is 125% of the old: 1.25p = 75, so p = 60. (Taking 25% off $75 gives $56.25, which is not the original — the 25% was of the smaller price.)',
          "p = sp.Symbol('p')\nans = sp.solve(sp.Rational(125, 100)*p - 75, p)[0]\n")

    b.mc('PSDA', SC, 'H',
         'A researcher recruited 100 adult volunteers and randomly assigned half to drink green tea daily and half to drink water daily. After 8 weeks, the green-tea group had lower average blood pressure, and the difference was statistically significant. Which conclusion is most appropriate?',
         'Drinking green tea likely caused lower blood pressure for these volunteers, but the result may not apply to all adults.',
         ['Drinking green tea lowers blood pressure for all adults.',
          'The study shows only an association, not that green tea caused the difference.',
          'No conclusion can be drawn because the volunteers were not randomly selected.'],
         'Random ASSIGNMENT supports a cause-and-effect conclusion. But the volunteers were not a random SAMPLE of all adults, so the result generalizes only to people like them.',
         "random_assignment, random_sample = True, False\nassert random_assignment and not random_sample\nans = None\n",
         custom="assert C[K].startswith('Drinking green tea likely caused')\n")

    b.mc('PSDA', OV, 'H',
         'A data set has 11 values, and its median is 40. Two values are added to the data set: 10 and 90. What is the median of the new data set of 13 values?',
         '40', ['50', '45', 'It cannot be determined from the information given.'],
         'The median of 11 values is the 6th smallest. Adding one value below it (10) and one above it (90) makes the old median the 7th of 13 — still the middle. So the median stays 40.',
         "import random\nfor _ in range(500):\n    d = sorted(random.sample(range(11, 89), 11))\n    d[5] = 40\n    d = sorted(d)\n    if d[5] != 40: continue\n    e = sorted(d + [10, 90])\n    assert e[6] == 40\nans = 40\n",
         custom="assert C[K] == '40'\n")

    # ── GEO: Easy (5) ────────────────────────────────────────────────
    b.spr('GEO', AV, 'E',
          'A triangle has a base of 10 centimeters and a height of 7 centimeters. What is the area of the triangle, in square centimeters?',
          '35', [],
          'Area = (1/2)(base)(height) = (1/2)(10)(7) = 35.',
          "ans = sp.Rational(1, 2) * 10 * 7\n")

    b.spr('GEO', LA, 'E',
          'Two lines intersect, forming four angles. One of the angles measures 48°. What is the measure, in degrees, of an angle adjacent to it?',
          '132', [],
          'Adjacent angles formed by two intersecting lines lie on a straight line, so they add to 180°: 180 − 48 = 132. (The angle across from it, its vertical angle, also measures 48°.)',
          "ans = 180 - 48\n")

    b.mc('GEO', CI, 'E',
         'A circle has a diameter of 14 inches. What is the area of the circle, in square inches?',
         '49π', ['14π', '196π', '28π'],
         'The radius is 14/2 = 7, so the area is πr² = 49π. (196π uses the diameter as the radius; 14π is the circumference.)',
         "ans = sp.pi * 7**2\n")

    b.spr('GEO', PY, 'E',
          'In the right triangle shown, what is the length of the side labeled with a question mark?' + NOTE,
          '40', [],
          'The hypotenuse is 41 and one leg is 9: 41² − 9² = 1,681 − 81 = 1,600, and √1,600 = 40.',
          "ans = sp.sqrt(41**2 - 9**2)\n",
          figure={'kind': 'geometry', 'params': {'shape': 'triangle', 'labels': {'vertical_leg': '9', 'hypotenuse': '41', 'horizontal_leg': '?'}, 'marks': {'right_angle': 'between legs'}}})

    b.mc('GEO', AV, 'E',
         'A cube has a volume of 64 cubic inches. What is the length of one edge of the cube, in inches?',
         '4', ['8', '16', '32'],
         'Volume = s³ = 64, so s = 4, since 4 × 4 × 4 = 64. (8 is the square root of 64.)',
         "s = sp.Symbol('s', positive=True)\nans = sp.solve(s**3 - 64, s)[0]\n")

    # ── GEO: Medium (4) ──────────────────────────────────────────────
    b.spr('GEO', LA, 'M',
          'At the same time of day, a 6-foot-tall person casts a 4-foot shadow and a tree casts an 18-foot shadow. How tall is the tree, in feet?',
          '27', [],
          'The sun makes similar triangles, so height/shadow is the same: 6/4 = h/18, giving h = 27.',
          "h = sp.Symbol('h')\nans = sp.solve(sp.Rational(6, 4) - h/18, h)[0]\n")

    b.mc('GEO', CI, 'M',
         'A circle has a radius of 5. What is the length of the arc intercepted by a central angle of 2π/5 radians?',
         '2π', ['π/5', '5π', '4π'],
         'In radians, arc length = radius × angle: 5 × (2π/5) = 2π.',
         "ans = 5 * 2*sp.pi/5\n")

    b.mc('GEO', CE, 'M',
         'Which equation represents a circle in the xy-plane with center (−1, 4) and radius 3?',
         '(x + 1)² + (y − 4)² = 9', ['(x − 1)² + (y + 4)² = 9', '(x + 1)² + (y − 4)² = 3', '(x − 1)² + (y − 4)² = 9'],
         'A circle with center (h, k) and radius r is (x − h)² + (y − k)² = r². Here h = −1, so x − (−1) = x + 1; k = 4; and r² = 9.',
         "ans = None\n",
         custom="x, y = sp.symbols('x y')\nwant = sp.expand((x + 1)**2 + (y - 4)**2 - 9)\n"
                "_ok = [c for c in C if sp.expand(P(c)) == want]\nassert _ok == [C[K]], _ok\n")

    b.mc('GEO', RT, 'M',
         'In the right triangle shown, the side lengths are 5, 12, and 13. What is the value of tan θ?' + NOTE,
         '5/12', ['12/5', '5/13', '12/13'],
         'tan θ = opposite/adjacent. The side opposite θ has length 5 and the side adjacent to θ (not the hypotenuse) has length 12, so tan θ = 5/12. (5/13 is sin θ.)',
         "ans = sp.Rational(5, 12)\nassert 5**2 + 12**2 == 13**2\n",
         figure={'kind': 'geometry', 'params': {'shape': 'triangle', 'labels': {'horizontal_leg': '12', 'vertical_leg': '5', 'hypotenuse': '13', 'angle': 'θ'}, 'marks': {'right_angle': 'between legs'}}})

    # ── GEO: Hard (5) ────────────────────────────────────────────────
    b.spr('GEO', LA, 'H',
          'The measures of the three angles of a triangle are (2x)°, (3x + 10)°, and (x + 20)°. What is the measure, in degrees, of the largest angle?',
          '85', [],
          'The angles add to 180: 6x + 30 = 180, so x = 25. The angles are 50°, 85°, and 45°; the largest is 85°.',
          "x = sp.Symbol('x')\nx0 = sp.solve(2*x + 3*x + 10 + x + 20 - 180, x)[0]\nans = max(2*x0, 3*x0 + 10, x0 + 20)\n")

    b.mc('GEO', AV, 'H',
         'A cylinder has a volume of 60π cubic centimeters. A cone has the same base radius and the same height as the cylinder. What is the volume of the cone, in cubic centimeters?',
         '20π', ['30π', '180π', '60π'],
         'A cone holds one-third as much as a cylinder with the same base and height: (1/3)(60π) = 20π.',
         "ans = sp.Rational(1, 3) * 60*sp.pi\n")

    b.spr('GEO', RT, 'H',
          'In a right triangle, the two acute angles measure x° and (2x − 30)°. What is the value of x?',
          '40', [],
          'The two acute angles of a right triangle are complementary: x + (2x − 30) = 90, so 3x = 120 and x = 40. (Equivalently, sin x° = cos(2x − 30)°.)',
          "x = sp.Symbol('x')\nans = sp.solve(x + 2*x - 30 - 90, x)[0]\n")

    b.mc('GEO', CI, 'H',
         'Points A and B lie on a circle with center O and radius 6. If angle AOB measures 120°, what is the length of chord AB?',
         '6√3', ['6', '12', '3√3'],
         'Triangle AOB is isosceles with OA = OB = 6. The altitude from O splits it into two 30°-60°-90° triangles with hypotenuse 6, each with a long leg of 3√3 — half the chord. So AB = 6√3.',
         "ans = 2*6*sp.sin(sp.pi/3)\nassert sp.simplify(ans - 6*sp.sqrt(3)) == 0\n")

    b.mc('GEO', CI, 'H',
         'A sector of a circle with radius 6 has an arc length of 4π. What is the area of the sector?',
         '12π', ['24π', '4π', '36π'],
         'The central angle is arc/radius = 4π/6 = 2π/3 radians. Area = (1/2)r²θ = (1/2)(36)(2π/3) = 12π. (36π is the whole circle.)',
         "theta = 4*sp.pi/6\nans = sp.Rational(1, 2) * 6**2 * theta\n")

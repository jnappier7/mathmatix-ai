"""SAT bank p3 — Problem-Solving & Data Analysis (PSDA) and Geometry & Trigonometry (GEO)."""

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
CI = 'Circles'
CE = 'Circles (equation in the xy-plane)'

GARDEN = [[2, 41], [3, 47], [4, 50], [5, 57], [6, 59], [7, 65], [8, 68], [9, 74]]


def add(b):
    # ── PSDA (12) ────────────────────────────────────────────────────
    b.mc('PSDA', RR, 'M',
         'A rectangular floor is 15 feet by 12 feet. Carpet is sold by the square yard, and 1 yard = 3 feet. How many square yards of carpet cover the floor exactly?',
         '20', ['60', '180', '540'],
         'The floor is 15 × 12 = 180 square feet. One square yard is 3 × 3 = 9 square feet, so 180/9 = 20 square yards. (60 divides by 3, not 9.)',
         "ans = sp.Rational(15 * 12, 3 * 3)\n")

    b.spr('PSDA', RR, 'M',
          'A printer uses 2.4 milliliters of ink per page. An ink cartridge holds 300 milliliters. How many full pages can be printed with one cartridge?',
          '125', [],
          '300/2.4 = 125 pages.',
          "ans = sp.Rational(300) / sp.Rational(24, 10)\n")

    b.mc('PSDA', RR, 'H',
         'On a map, 2 centimeters represent 15 kilometers. Two towns are 9 centimeters apart on the map. How far apart are the towns, in kilometers?',
         '67.5', ['30', '135', '60'],
         'Each centimeter is 15/2 = 7.5 km, so 9 cm is 9 × 7.5 = 67.5 km.',
         "ans = sp.Rational(15, 2) * 9\n")

    b.mc('PSDA', PC, 'M',
         'A store raised the price of a jacket by 20%. Later the new price was reduced by 20%. The final price is what percent of the original price?',
         '96%', ['100%', '80%', '104%'],
         '1.20 × 0.80 = 0.96. The 20% cut is taken from a larger price, so the two changes do not cancel.',
         "ans = sp.Rational(120, 100) * sp.Rational(80, 100) * 100\n")

    b.spr('PSDA', PC, 'H',
          '30% of a number is 45. What is 70% of the same number?',
          '105', [],
          'The number is 45/0.30 = 150, and 0.70 × 150 = 105. (Or: 70% is 45 × 70/30.)',
          "n = sp.Rational(45) / sp.Rational(30, 100)\nans = sp.Rational(70, 100) * n\n")

    b.mc('PSDA', OV, 'M',
         'The table shows the number of goals scored by a soccer team in each of its 12 games. What is the median number of goals?',
         '2', ['1.5', '2.5', '3'],
         'In order: 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 5. The 6th and 7th values are both 2, so the median is 2.',
         "counts = {0: 1, 1: 3, 2: 4, 3: 2, 4: 1, 5: 1}\nvals = sorted(v for v, c in counts.items() for _ in range(c))\nassert len(vals) == 12\nans = sp.Rational(vals[5] + vals[6], 2)\n",
         figure={'kind': 'table', 'params': {'headers': ['Goals', '0', '1', '2', '3', '4', '5'], 'rows': [['Games', '1', '3', '4', '2', '1', '1']]}})

    b.mc('PSDA', OV, 'H',
         'The mean of five test scores is 82. When a sixth score is added, the mean of all six scores becomes 84. What is the sixth score?',
         '94', ['84', '86', '92'],
         'The five scores total 5 × 82 = 410. Six scores averaging 84 total 504. The sixth score is 504 − 410 = 94.',
         "ans = 6*84 - 5*82\n")

    b.mc('PSDA', TV, 'M',
         'The scatterplot shows the number of weeks x since planting and the height y, in centimeters, of a sunflower, with the line of best fit y = 4.6x + 32. Which statement best interprets the slope of the line?',
         'The sunflower is predicted to grow about 4.6 centimeters each week.',
         ['The sunflower was about 4.6 centimeters tall when planted.', 'The sunflower is predicted to be 32 centimeters tall after 4.6 weeks.', 'The sunflower grows about 32 centimeters each week.'],
         'The slope 4.6 is the predicted change in height for each additional week. The 32 is the predicted height at week 0.',
         "x = sp.Symbol('x')\ny = sp.Rational(46, 10)*x + 32\nassert y.subs(x, 3) - y.subs(x, 2) == sp.Rational(46, 10)\n",
         custom="assert C[K].startswith('The sunflower is predicted to grow about 4.6')\n",
         figure={'kind': 'scatter', 'params': {'pts': GARDEN, 'xlabel': 'Weeks since planting', 'ylabel': 'Height (cm)', 'line': {'slope': 4.6, 'yint': 32}}})

    b.spr('PSDA', TV, 'H',
          'Using the line of best fit y = 4.6x + 32 for the sunflower data shown, what is the predicted height, in centimeters, at 5 weeks? (The plotted height at 5 weeks was 57 centimeters.)',
          '55', [],
          'y = 4.6(5) + 32 = 23 + 32 = 55 centimeters. The actual 57 is 2 above the prediction (a residual of 2).',
          "ans = sp.Rational(46, 10)*5 + 32\nassert [5, 57] in " + repr(GARDEN) + "\n",
          figure={'kind': 'scatter', 'params': {'pts': GARDEN, 'xlabel': 'Weeks since planting', 'ylabel': 'Height (cm)', 'line': {'slope': 4.6, 'yint': 32}}})

    b.mc('PSDA', PR, 'M',
         'The table shows the results of a survey of 160 students about whether they play an instrument. If a student who plays an instrument is chosen at random, what is the probability that the student is in 11th grade?',
         '3/8', ['3/10', '3/16', '1/2'],
         'Only the 40 + 24 = 64 instrument players count, and 24 of them are in 11th grade: 24/64 = 3/8. (3/10 divides by all 80 eleventh graders.)',
         "ans = sp.Rational(24, 40 + 24)\n",
         figure={'kind': 'table', 'params': {'headers': ['', 'Plays an instrument', 'Does not', 'Total'], 'rows': [['10th grade', '40', '40', '80'], ['11th grade', '24', '56', '80'], ['Total', '64', '96', '160']]}})

    b.mc('PSDA', IM, 'H',
         'Two random samples were taken from the same population of adults to estimate the proportion who exercise daily. Sample A had 400 adults and Sample B had 100 adults. Which statement is most likely true?',
         'The estimate from Sample A has the smaller margin of error.',
         ['The estimate from Sample B has the smaller margin of error.', 'Both estimates have the same margin of error.', 'Sample B\'s estimate must be closer to the true proportion.'],
         'Larger random samples give more precise estimates, so their margin of error is smaller (it shrinks roughly with 1/√n).',
         "import math\nmoe = lambda n: 1/math.sqrt(n)\nassert moe(400) < moe(100)\n",
         custom="assert C[K].startswith('The estimate from Sample A has the smaller')\n")

    b.mc('PSDA', SC, 'M',
         'A town newspaper asked readers to mail in a survey about a new park. Of the 300 readers who responded, 78% supported the park. Which conclusion is most appropriate?',
         'The results may not represent the town, because the respondents chose themselves.',
         ['About 78% of all town residents support the park.', 'The results represent the town, because 300 people responded.', 'Most town residents oppose the park.'],
         'A voluntary-response survey is not a random sample: people with strong opinions are more likely to reply, so the result cannot be generalized to the town.',
         "random_sample = False\nassert not random_sample\n",
         custom="assert C[K].startswith('The results may not represent the town')\n")

    # ── GEO (12) ─────────────────────────────────────────────────────
    b.mc('GEO', AV, 'M',
         'A right circular cone has a height of 9 centimeters and a volume of 48π cubic centimeters. What is the radius of its base, in centimeters?',
         '4', ['16', '2', '√(48/9)'],
         'V = (1/3)πr²h, so 48π = (1/3)πr²(9) = 3πr². Then r² = 16 and r = 4.',
         "r = sp.Symbol('r', positive=True)\nans = sp.solve(sp.Rational(1, 3)*sp.pi*r**2*9 - 48*sp.pi, r)[0]\n")

    b.spr('GEO', 'Area and volume (sphere)', 'H',
          'A sphere and a cube have equal volumes. The cube has edges of length 6. The sphere\'s volume can be written as (4/3)πr³. What is the value of πr³ ?',
          '162', [],
          'The cube\'s volume is 6³ = 216. Then (4/3)πr³ = 216, so πr³ = 216 · 3/4 = 162.',
          "ans = sp.Rational(6**3) * sp.Rational(3, 4)\n")

    b.mc('GEO', AV, 'M',
         'An isosceles right triangle has legs of length 10. What is its area?',
         '50', ['100', '25√2', '10√2'],
         'Area = (1/2)(10)(10) = 50. (10√2 is the hypotenuse.)',
         "ans = sp.Rational(1, 2) * 10 * 10\n")

    b.mc('GEO', LA, 'M',
         'In triangle ABC, a segment DE is drawn parallel to side BC, with D on AB and E on AC. If AD = 4, DB = 6, and DE = 5, what is the length of BC?',
         '12.5', ['7.5', '15', '10'],
         'DE ∥ BC makes triangle ADE similar to triangle ABC with ratio AD/AB = 4/10. So BC = 5 × 10/4 = 12.5. (7.5 uses DB in place of AB.)',
         "ans = sp.Rational(5) * sp.Rational(4 + 6, 4)\n")

    b.spr('GEO', LA, 'M',
          'Two parallel lines are cut by a transversal. One of the angles formed measures (5x + 10)° and its same-side interior partner measures (3x + 10)°. What is the value of x?',
          '20', [],
          'Same-side interior angles are supplementary: (5x + 10) + (3x + 10) = 180, so 8x = 160 and x = 20.',
          "x = sp.Symbol('x')\nans = sp.solve(5*x + 10 + 3*x + 10 - 180, x)[0]\n")

    b.mc('GEO', LA, 'H',
         'The measure of each interior angle of a regular polygon is 140°. How many sides does the polygon have?',
         '9', ['7', '8', '10'],
         'Each exterior angle is 180° − 140° = 40°, and the exterior angles total 360°, so there are 360/40 = 9 sides.',
         "ans = sp.Rational(360, 180 - 140)\n")

    b.mc('GEO', RT, 'M',
         'In right triangle XYZ, angle Z is the right angle and cos X = 0.6. What is sin Y?',
         '0.6', ['0.8', '0.4', '1.6'],
         'The acute angles X and Y are complementary, and sin Y = cos(90° − Y) = cos X = 0.6.',
         "X_ = sp.acos(sp.Rational(6, 10))\nY_ = sp.pi/2 - X_\nans = sp.simplify(sp.sin(Y_))\n")

    b.spr('GEO', RT, 'H',
          'In the right triangle shown, the side opposite the 30° angle has length 8. What is the length h of the hypotenuse?\nNote: Figure not drawn to scale.',
          '16', [],
          'sin 30° = 8/h = 1/2, so h = 16. (A 30°-60°-90° triangle\'s hypotenuse is twice its short leg.)',
          "h = sp.Symbol('h', positive=True)\nans = sp.solve(8/h - sp.sin(sp.pi/6), h)[0]\n",
          figure={'kind': 'geometry', 'params': {'shape': 'triangle', 'labels': {'angle': '30°', 'vertical_leg': '8', 'hypotenuse': 'h'}, 'marks': {'right_angle': 'between legs'}}})

    b.mc('GEO', 'Right triangles (Pythagorean theorem)', 'M',
         'A 13-foot ladder leans against a wall with its base 5 feet from the wall. How high up the wall does the ladder reach?',
         '12', ['8', '18', '√194'],
         '√(13² − 5²) = √(169 − 25) = √144 = 12 feet.',
         "ans = sp.sqrt(13**2 - 5**2)\n")

    b.mc('GEO', CE, 'H',
         'In the xy-plane, the points (−1, 2) and (7, 8) are the endpoints of a diameter of a circle. Which equation represents the circle?',
         '(x − 3)² + (y − 5)² = 25', ['(x − 3)² + (y − 5)² = 100', '(x + 3)² + (y + 5)² = 25', '(x − 4)² + (y − 3)² = 25'],
         'The center is the midpoint, (3, 5). The diameter is √(8² + 6²) = 10, so the radius is 5 and r² = 25.',
         "x, y = sp.symbols('x y')\ncx, cy = sp.Rational(-1 + 7, 2), sp.Rational(2 + 8, 2)\nr2 = (sp.sqrt(8**2 + 6**2) / 2)**2\nans = (x - cx)**2 + (y - cy)**2 - r2\n")

    b.spr('GEO', 'Circles (arc length, radians)', 'H',
          'A central angle of a circle measures 2π/3 radians and intercepts an arc of length 12π. What is the radius of the circle?',
          '18', [],
          'Arc length = r · θ, so 12π = r(2π/3) and r = 12π · 3/(2π) = 18.',
          "r = sp.Symbol('r', positive=True)\nans = sp.solve(r*2*sp.pi/3 - 12*sp.pi, r)[0]\n")

    b.mc('GEO', CI, 'M',
         'A circle has a diameter of 14 inches. What is its area, in square inches?',
         '49π', ['196π', '14π', '28π'],
         'The radius is 7, so the area is π(7)² = 49π. (196π squares the diameter.)',
         "ans = sp.pi * 7**2\n")

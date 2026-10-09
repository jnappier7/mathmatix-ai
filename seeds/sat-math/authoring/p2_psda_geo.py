"""SAT bank p2 — Problem-Solving & Data Analysis (PSDA) and Geometry & Trigonometry (GEO)."""

RR = 'Ratios, rates, proportional relationships, and units'
PC = 'Percentages'
OV = 'One-variable data: center and spread'
TV = 'Two-variable data: scatterplots and models'
TVR = 'Two-variable data: scatterplots and models (residuals)'
PR = 'Probability and conditional probability'
IM = 'Inference and margin of error'

AV = 'Area and volume'
LA = 'Lines, angles, and triangles'
RT = 'Right triangles and trigonometry'
CI = 'Circles'
CE = 'Circles (equation in the xy-plane)'

ICE = [[26, 15], [27, 20], [28, 40], [29, 45], [30, 70], [31, 68], [32, 88], [33, 92], [34, 110], [36, 135]]


def add(b):
    # ── PSDA ─────────────────────────────────────────────────────────
    b.mc('PSDA', RR, 'E',
         'A recipe uses 3 cups of rice to make 8 servings. At this rate, how many cups of rice are needed to make 20 servings?',
         '7.5', ['6', '9', '12'],
         'Each serving needs 3/8 cup, so 20 servings need 20 × 3/8 = 7.5 cups.',
         "ans = sp.Rational(3, 8) * 20\n")

    b.mc('PSDA', RR, 'M',
         'A river flows at a speed of 2.4 meters per second. What is this speed in kilometers per hour?',
         '8.64', ['0.04', '144', '86.4'],
         '2.4 m/s × 3,600 s/h = 8,640 m/h, and 8,640 m = 8.64 km.',
         "ans = sp.Rational(24, 10) * 3600 / 1000\n")

    b.spr('PSDA', RR, 'M',
          'A metal block has a mass of 540 grams and a volume of 200 cubic centimeters. What is the density of the block, in grams per cubic centimeter?',
          '2.7', ['2.70', '27/10'],
          'Density is mass divided by volume: 540/200 = 2.7 g/cm³.',
          "ans = sp.Rational(540, 200)\n")

    b.mc('PSDA', PC, 'E',
         'A shirt originally priced at $40 is on sale for $34. By what percent was the price reduced?',
         '15%', ['6%', '85%', '17.6%'],
         'The discount is $6, and 6/40 = 0.15, or 15%. (17.6% divides by the sale price instead of the original.)',
         "ans = sp.Rational(40 - 34, 40) * 100\n")

    b.mc('PSDA', PC, 'M',
         'In a class of 30 students, 40% are juniors. If 6 more juniors join the class and no students leave, what percent of the class will be juniors?',
         '50%', ['46%', '60%', '52%'],
         'There are 0.40 × 30 = 12 juniors. After 6 join, 18 of the 36 students are juniors: 18/36 = 50%.',
         "j = sp.Rational(40, 100) * 30\nans = (j + 6) / (30 + 6) * 100\n")

    b.spr('PSDA', PC, 'H',
          'A town\'s population increased by 25% one year and then decreased by x% the next year, returning exactly to its original value. What is the value of x?',
          '20', [],
          'After the increase the population is 1.25 times the original. To return to 1 times it must be multiplied by 1/1.25 = 0.8, a decrease of 20%. (Undoing a 25% increase is not a 25% decrease.)',
          "x = sp.Symbol('x')\nans = sp.solve(sp.Rational(125, 100)*(1 - x/100) - 1, x)[0]\n")

    b.mc('PSDA', OV, 'M',
         'The frequency table shows the quiz scores of 10 students. What is the mean score?',
         '81', ['80', '82.5', '85'],
         'Total = 70(2) + 80(5) + 90(3) = 140 + 400 + 270 = 810, and 810/10 = 81. (85 averages the three scores without weighting them.)',
         "ans = sp.Rational(70*2 + 80*5 + 90*3, 10)\n",
         figure={'kind': 'table', 'params': {'headers': ['Score', 'Number of students'], 'rows': [['70', '2'], ['80', '5'], ['90', '3']]}})

    b.mc('PSDA', OV, 'H',
         'A data set consists of the values 12, 14, 15, 15, 16, and 18. A seventh value, 40, is added to the data set. Which statement best describes the effect of adding the value 40?',
         'The mean increases, and the median stays the same.',
         ['The mean and the median both increase.', 'The median increases, and the mean stays the same.', 'Neither the mean nor the median changes.'],
         'The mean rises from 15 to 130/7 ≈ 18.6, because 40 is far above the others. The median was the average of 15 and 15, and with seven values it is the 4th value — still 15.',
         "import statistics as st\nA = [12, 14, 15, 15, 16, 18]\nB = A + [40]\nassert st.mean(B) > st.mean(A) and st.median(B) == st.median(A)\n",
         custom="assert C[K] == 'The mean increases, and the median stays the same.'\n")

    b.mc('PSDA', TV, 'M',
         'The scatterplot shows the daily high temperature x, in degrees Celsius, and the number of ice pops y sold at a beach stand on 9 days. The line of best fit is y = 12x − 300. Based on the line of best fit, how many ice pops are predicted to be sold on a day with a high temperature of 35°C?',
         '120', ['105', '135', '420'],
         'Substitute x = 35: 12(35) − 300 = 420 − 300 = 120. (420 forgets to subtract 300.)',
         "ans = 12*35 - 300\n",
         figure={'kind': 'scatter', 'params': {'pts': ICE, 'xlabel': 'High temperature (°C)', 'ylabel': 'Ice pops sold', 'line': {'slope': 12, 'yint': -300}}})

    b.mc('PSDA', TVR, 'H',
         'The scatterplot shows the daily high temperature x, in degrees Celsius, and the number of ice pops y sold at a beach stand, with the line of best fit y = 12x − 300. On the day the high temperature was 30°C, the stand sold 70 ice pops. What is the residual for that day (actual minus predicted)?',
         '10', ['−10', '70', '60'],
         'The line predicts 12(30) − 300 = 60. The residual is actual − predicted = 70 − 60 = 10: that day sold 10 more than the model predicted.',
         "pred = 12*30 - 300\nassert [30, 70] in " + repr(ICE) + "\nans = 70 - pred\n",
         figure={'kind': 'scatter', 'params': {'pts': ICE, 'xlabel': 'High temperature (°C)', 'ylabel': 'Ice pops sold', 'line': {'slope': 12, 'yint': -300}}})

    b.mc('PSDA', PR, 'M',
         'The bar graph shows the number of marbles of each color in a bag. If one marble is chosen at random, what is the probability that it is NOT blue?',
         '3/5', ['2/5', '4/15', '1/3'],
         'There are 4 + 6 + 5 = 15 marbles, and 9 are not blue: 9/15 = 3/5.',
         "ans = sp.Rational(4 + 5, 4 + 6 + 5)\n",
         figure={'kind': 'bar', 'params': {'labels': ['Red', 'Blue', 'Green'], 'values': [4, 6, 5], 'xlabel': 'Color', 'ylabel': 'Number of marbles'}})

    b.spr('PSDA', PR, 'H',
          'The table shows the responses of 180 high school students who were asked whether they plan to attend college. If one of the students who answered "Yes" is chosen at random, what is the probability that the student is a senior? (Express your answer as a fraction or decimal.)',
          '4/7', ['.5714', '0.571'],
          'Only the 54 + 72 = 126 students who answered "Yes" count, and 72 of them are seniors: 72/126 = 4/7 (about .5714).',
          "ans = sp.Rational(72, 54 + 72)\n", tol=1e-3,
          figure={'kind': 'table', 'params': {'headers': ['', 'Yes', 'No', 'Total'], 'rows': [['Juniors', '54', '36', '90'], ['Seniors', '72', '18', '90'], ['Total', '126', '54', '180']]}})

    b.mc('PSDA', IM, 'M',
         'A school has 1,200 students. In a random sample of 150 of them, 36 said they walk to school. Based on the sample, what is the best estimate of the number of students at the school who walk to school?',
         '288', ['36', '240', '360'],
         'The sample proportion is 36/150 = 0.24, and 0.24 × 1,200 = 288.',
         "ans = sp.Rational(36, 150) * 1200\n")

    # ── GEO ──────────────────────────────────────────────────────────
    b.mc('GEO', AV, 'E',
         'A right circular cylinder has a radius of 5 inches and a height of 10 inches. What is the volume of the cylinder, in cubic inches?',
         '250π', ['50π', '100π', '500π'],
         'V = πr²h = π(25)(10) = 250π. (100π uses the diameter in place of r², and 500π doubles it.)',
         "ans = sp.pi * 5**2 * 10\n")

    b.mc('GEO', AV, 'M',
         'A rectangular garden 3 meters wide and 5 meters long is surrounded by a path 1 meter wide on every side. What is the area of the path, in square meters?',
         '20', ['16', '35', '8'],
         'The garden plus path is (3 + 2) by (5 + 2) = 5 by 7 = 35 m². Subtracting the garden\'s 15 m² leaves 20 m² of path.',
         "ans = (3 + 2)*(5 + 2) - 3*5\n")

    b.spr('GEO', 'Area and volume (sphere)', 'H',
          'A sphere has a volume of 36π cubic centimeters. What is the radius of the sphere, in centimeters?',
          '3', [],
          '(4/3)πr³ = 36π gives r³ = 27, so r = 3.',
          "r = sp.Symbol('r', positive=True)\nans = sp.solve(sp.Rational(4, 3)*sp.pi*r**3 - 36*sp.pi, r)[0]\n")

    b.mc('GEO', LA, 'E',
         'Two angles are supplementary, and the measure of one angle is 3 times the measure of the other. What is the measure, in degrees, of the smaller angle?',
         '45', ['135', '22.5', '60'],
         'x + 3x = 180, so x = 45. (135 is the larger angle; 22.5 comes from using 90°, the sum for COMPLEMENTARY angles.)',
         "x = sp.Symbol('x')\nans = sp.solve(x + 3*x - 180, x)[0]\n")

    b.mc('GEO', LA, 'M',
         'Two parallel lines are cut by a transversal. A pair of alternate interior angles formed have measures (3x − 20)° and (x + 40)°. What is the value of x?',
         '30', ['15', '10', '70'],
         'Alternate interior angles are congruent: 3x − 20 = x + 40, so 2x = 60 and x = 30. (70 is the angle measure itself.)',
         "x = sp.Symbol('x')\nans = sp.solve(3*x - 20 - (x + 40), x)[0]\n")

    b.mc('GEO', LA, 'H',
         'Two sides of a triangle have lengths 7 and 10. Which of the following could be the length of the third side?',
         '12', ['2', '3', '17'],
         'By the triangle inequality, the third side must be greater than 10 − 7 = 3 and less than 10 + 7 = 17. Only 12 fits; 3 and 17 would flatten the triangle into a segment.',
         "good = [s for s in [12, 2, 3, 17] if 10 - 7 < s < 10 + 7]\nassert good == [12]\n",
         custom="assert C[K] == '12'\n")

    b.mc('GEO', 'Right triangles (Pythagorean theorem)', 'E',
         'In the right triangle shown, the legs have lengths 7 and 24. What is the length c of the hypotenuse?',
         '25', ['31', '17', '√527'],
         'c² = 7² + 24² = 49 + 576 = 625, so c = 25. (√527 subtracts the squares.)',
         "ans = sp.sqrt(7**2 + 24**2)\n",
         figure={'kind': 'geometry', 'params': {'shape': 'triangle', 'labels': {'horizontal_leg': '24', 'vertical_leg': '7', 'hypotenuse': 'c'}, 'marks': {'right_angle': 'between legs'}}})

    b.mc('GEO', RT, 'M',
         'In a right triangle, tan θ = 5/12 for one of the acute angles θ. What is the value of sin θ?',
         '5/13', ['12/13', '5/12', '13/5'],
         'tan θ = opposite/adjacent = 5/12, so the hypotenuse is √(5² + 12²) = 13 and sin θ = opposite/hypotenuse = 5/13.',
         "th = sp.atan(sp.Rational(5, 12))\nans = sp.simplify(sp.sin(th))\n")

    b.spr('GEO', RT, 'H',
          'A 20-foot ladder leans against a vertical wall, making a 60° angle with the level ground. To the nearest tenth of a foot, how high up the wall does the top of the ladder reach?',
          '17.3', [],
          'The height is opposite the 60° angle: 20 sin 60° = 20(√3/2) = 10√3 ≈ 17.3 feet.',
          "ans = sp.Float(round(float(20*sp.sin(sp.pi/3)), 1))\n")

    b.mc('GEO', CI, 'E',
         'A circle has an area of 49π square centimeters. What is the circumference of the circle, in centimeters?',
         '14π', ['7π', '49π', '98π'],
         'πr² = 49π gives r = 7, so the circumference is 2π(7) = 14π.',
         "r = sp.sqrt(49)\nans = 2*sp.pi*r\n")

    b.mc('GEO', CE, 'H',
         'In the xy-plane, the graph of x² + y² + 8x − 6y = 0 is a circle. What are the coordinates of the center of the circle?',
         '(−4, 3)', ['(4, −3)', '(−8, 6)', '(8, −6)'],
         'Complete the square: (x² + 8x + 16) + (y² − 6y + 9) = 25, or (x + 4)² + (y − 3)² = 25. The center is (−4, 3).',
         "x, y = sp.symbols('x y')\ne = sp.expand(x**2 + y**2 + 8*x - 6*y)\ncx = -e.coeff(x, 1)/2\ncy = -e.coeff(y, 1)/2\nassert (cx, cy) == (-4, 3)\n",
         custom="assert C[K] == '(−4, 3)'\n")

    b.spr('GEO', 'Circles (arc length)', 'H',
          'In a circle, a central angle of 72° intercepts an arc with a length of 6π. What is the radius of the circle?',
          '15', [],
          'A 72° arc is 72/360 = 1/5 of the circumference, so (1/5)(2πr) = 6π, 2πr = 30π, and r = 15.',
          "r = sp.Symbol('r')\nans = sp.solve(sp.Rational(72, 360)*2*sp.pi*r - 6*sp.pi, r)[0]\n")

    b.mc('GEO', 'Circles (inscribed angle)', 'H',
         'An inscribed angle in a circle intercepts an arc that measures 110°. What is the measure, in degrees, of the inscribed angle?',
         '55', ['110', '220', '70'],
         'An inscribed angle measures half of its intercepted arc: 110/2 = 55. (110 would be the central angle.)',
         "ans = sp.Rational(110, 2)\n")

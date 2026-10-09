"""SAT bank p1 — Problem-Solving & Data Analysis (PSDA) and Geometry & Trigonometry (GEO)."""

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


def add(b):
    # ── PSDA ─────────────────────────────────────────────────────────
    b.mc('PSDA', RR, 'E',
         'An office printer prints 45 pages per minute. At this rate, how many pages can it print in 2.5 hours?',
         '6,750', ['112.5', '2,700', '675'],
         '2.5 hours is 150 minutes, and 45 × 150 = 6,750 pages.',
         "ans = 45 * 150\n")

    b.spr('PSDA', RR, 'M',
          'A car travels 32 miles per gallon of gasoline, and gasoline costs $3.60 per gallon. What is the cost, in dollars, of the gasoline needed to drive 400 miles?',
          '45', ['45.00'],
          '400 miles ÷ 32 miles per gallon = 12.5 gallons, and 12.5 × $3.60 = $45.',
          "ans = sp.Rational(400, 32) * sp.Rational(36, 10)\n")

    b.mc('PSDA', RR, 'H',
         'A baker mixes flour and sugar in a ratio of 5 to 2 by weight. If the mixture weighs 3.5 kilograms in all, how many kilograms of sugar does it contain?',
         '1', ['1.4', '2.5', '0.7'],
         'Out of every 7 parts, 2 are sugar, so sugar is 2/7 of 3.5 kg = 1 kg. (1.4 comes from using 2/5, the sugar-to-flour ratio, as if it were a fraction of the total.)',
         "ans = sp.Rational(35, 10) * sp.Rational(2, 7)\n")

    b.mc('PSDA', PC, 'E',
         'What is 18% of 250?',
         '45', ['18', '25', '72'],
         '0.18 × 250 = 45.',
         "ans = sp.Rational(18, 100) * 250\n")

    b.mc('PSDA', PC, 'M',
         'A recycling center collected 230 tons of material in March, which was 15% more than it collected in February. How many tons did it collect in February?',
         '200', ['195.5', '215', '264.5'],
         'March is 115% of February: 1.15F = 230, so F = 200. Taking 15% off 230 (giving 195.5) applies the percent to the wrong base.',
         "F = sp.Symbol('F')\nans = sp.solve(sp.Rational(115, 100)*F - 230, F)[0]\n")

    b.spr('PSDA', PC, 'H',
          'The price of a share of stock increased by 20% and then decreased by 25%. The final price is p% of the original price. What is the value of p?',
          '90', [],
          'Multiply the factors: 1.20 × 0.75 = 0.90, so the final price is 90% of the original. The changes do not simply add to −5%.',
          "ans = sp.Rational(120, 100) * sp.Rational(75, 100) * 100\n")

    b.mc('PSDA', OV, 'M',
         'The bar graph shows the number of siblings reported by each of 20 students. What is the median number of siblings?',
         '1.5', ['2', '1', '5'],
         'In order, the 20 values have 3 zeros and 7 ones (positions 1–10), then 5 twos (positions 11–15). The median is the mean of the 10th and 11th values: (1 + 2)/2 = 1.5.',
         "counts = {0: 3, 1: 7, 2: 5, 3: 3, 4: 2}\nvals = sorted(v for v, c in counts.items() for _ in range(c))\nassert len(vals) == 20\n"
         "ans = sp.Rational(vals[9] + vals[10], 2)\n",
         figure={'kind': 'bar', 'params': {'labels': ['0', '1', '2', '3', '4'], 'values': [3, 7, 5, 3, 2], 'xlabel': 'Number of siblings', 'ylabel': 'Number of students'}})

    b.mc('PSDA', OV, 'M',
         'The table lists six data values. If the mean of the six values is 17, what is the value of x?',
         '22', ['17', '20', '25'],
         'Six values with mean 17 sum to 102. The known values sum to 12 + 15 + 15 + 18 + 20 = 80, so x = 22.',
         "ans = 6*17 - (12 + 15 + 15 + 18 + 20)\n",
         figure={'kind': 'table', 'params': {'headers': ['Value 1', 'Value 2', 'Value 3', 'Value 4', 'Value 5', 'Value 6'], 'rows': [['12', '15', '15', '18', '20', 'x']]}})

    b.mc('PSDA', OV, 'H',
         'Data set A and data set B are shown in the table. Which statement about the two data sets is true?',
         'The means are equal, and the standard deviation of A is greater.',
         ['The means are equal, and the standard deviation of B is greater.',
          'The mean of A is greater, and the standard deviations are equal.',
          'The means are equal, and the standard deviations are equal.'],
         'Both sets are centered at 30 (each is symmetric about 30), so the means are equal. A runs from 10 to 50 while B stays within 2 of 30, so A is far more spread out.',
         "import statistics as st\nA = [10, 20, 30, 40, 50]\nB = [28, 29, 30, 31, 32]\nassert st.mean(A) == st.mean(B)\nassert st.pstdev(A) > st.pstdev(B)\n",
         custom="assert C[K].startswith('The means are equal, and the standard deviation of A')\n",
         figure={'kind': 'table', 'params': {'headers': ['Data set', 'Values'], 'rows': [['A', '10, 20, 30, 40, 50'], ['B', '28, 29, 30, 31, 32']]}})

    b.mc('PSDA', TV, 'M',
         'The scatterplot shows the number of hours each of 9 students studied for a test and the student\'s score. The line of best fit is y = 4x + 58. Based on the line of best fit, what is the predicted score for a student who studies 6 hours?',
         '82', ['76', '88', '62'],
         'Substitute x = 6: y = 4(6) + 58 = 82.',
         "ans = 4*6 + 58\n",
         figure={'kind': 'scatter', 'params': {'pts': [[1, 63], [2, 65], [2, 68], [3, 69], [4, 75], [5, 77], [6, 81], [7, 87], [8, 89]], 'xlabel': 'Hours studied', 'ylabel': 'Test score', 'line': {'slope': 4, 'yint': 58}}})

    b.mc('PSDA', TV, 'M',
         'The scatterplot shows the weight, in pounds, of a puppy at several ages, in weeks. The line of best fit is y = 1.8x + 12. Which statement best interprets the number 1.8 in this context?',
         'The predicted weight gain is 1.8 pounds per week.',
         ['The puppy weighed 1.8 pounds at birth.',
          'The predicted weight at 1.8 weeks is 12 pounds.',
          'The puppy gains 12 pounds every 1.8 weeks.'],
         '1.8 is the slope: for each additional week of age, the predicted weight increases by 1.8 pounds. The 12 is the predicted weight at week 0.',
         "x = sp.Symbol('x')\ny = sp.Rational(18, 10)*x + 12\nassert y.subs(x, 5) - y.subs(x, 4) == sp.Rational(18, 10)\n",
         custom="assert C[K].startswith('The predicted weight gain is 1.8')\n",
         figure={'kind': 'scatter', 'params': {'pts': [[2, 15.5], [4, 19.6], [6, 22.4], [8, 26.8], [10, 29.5], [12, 33.9], [14, 36.8]], 'xlabel': 'Age (weeks)', 'ylabel': 'Weight (pounds)', 'line': {'slope': 1.8, 'yint': 12}}})

    b.mc('PSDA', TV, 'H',
         'The table shows four pairs of values of x and y. Which equation best models the relationship between x and y?',
         'y = 5(2)^x', ['y = 5x + 5', 'y = 10x + 5', 'y = 2(5)^x'],
         'Each time x increases by 1, y doubles (5, 10, 20, 40), which is exponential growth with a starting value of 5: y = 5(2)^x. A linear model would add a constant amount instead.',
         "x = sp.Symbol('x')\nans = 5*2**x\nassert [ans.subs(x, v) for v in range(4)] == [5, 10, 20, 40]\n",
         figure={'kind': 'table', 'params': {'headers': ['x', 'y'], 'rows': [['0', '5'], ['1', '10'], ['2', '20'], ['3', '40']]}})

    b.mc('PSDA', PR, 'M',
         'The table shows how 100 students at a school are divided between band and choir by grade. If a 10th-grade student is selected at random, what is the probability that the student is in band?',
         '3/4', ['5/9', '3/10', '2/5'],
         'Only the 40 tenth-graders count, and 30 of them are in band: 30/40 = 3/4. (5/9 divides by all band students; 3/10 divides by all 100 students.)',
         "ans = sp.Rational(30, 40)\n",
         figure={'kind': 'table', 'params': {'headers': ['', 'Band', 'Choir', 'Total'], 'rows': [['9th grade', '24', '36', '60'], ['10th grade', '30', '10', '40'], ['Total', '54', '46', '100']]}})

    b.spr('PSDA', PR, 'H',
          'The table summarizes whether 200 surveyed adults own a bicycle and where they live. If one of the adults who owns a bicycle is selected at random, what is the probability that the adult lives in a city? (Express your answer as a fraction or decimal.)',
          '3/5', ['.6', '0.6', '6/10'],
          'The condition is "owns a bicycle," so the denominator is the 48 + 32 = 80 bicycle owners. Of those, 48 live in a city: 48/80 = 3/5.',
          "ans = sp.Rational(48, 48 + 32)\n",
          figure={'kind': 'table', 'params': {'headers': ['', 'Owns a bicycle', 'Does not own a bicycle', 'Total'], 'rows': [['City', '48', '72', '120'], ['Suburb', '32', '48', '80'], ['Total', '80', '120', '200']]}})

    b.mc('PSDA', IM, 'H',
         'In a random sample of 500 registered voters in a county, 46% said they support a proposed park. The margin of error for this estimate is 4 percentage points. Which conclusion is most appropriate?',
         'It is plausible that between 42% and 50% of all registered voters in the county support the park.',
         ['Exactly 46% of all registered voters in the county support the park.',
          'Between 42% and 50% of the 500 voters in the sample support the park.',
          'The park will not be approved, because less than half of the voters support it.'],
         'A margin of error describes the likely range for the whole population: 46% ± 4% gives 42% to 50%. The sample itself is known exactly (46%), and 50% is inside the range, so a majority cannot be ruled out.',
         "lo, hi = 46 - 4, 46 + 4\nassert (lo, hi) == (42, 50)\n",
         custom="assert C[K].startswith('It is plausible that between 42% and 50%')\n")

    b.mc('PSDA', SC, 'M',
         'A researcher recruited 60 adult volunteers and randomly assigned half to use a new sleep app for a month and half to use no app. On average, the app group slept 25 minutes more per night. Which conclusion is best supported?',
         'The app is likely to cause an increase in sleep for adults similar to these volunteers.',
         ['The app causes an increase in sleep for all adults in the country.',
          'Adults who choose to use sleep apps sleep more than adults who do not.',
          'The app has no effect, because only 60 people were studied.'],
         'Random ASSIGNMENT supports a cause-and-effect conclusion, but volunteers were not randomly SELECTED from all adults, so the result applies to people like the volunteers, not to every adult.',
         "random_assignment, random_sample = True, False\nassert random_assignment and not random_sample\n",
         custom="assert C[K].startswith('The app is likely to cause')\n")

    # ── GEO ──────────────────────────────────────────────────────────
    b.mc('GEO', AV, 'E',
         'A rectangular box is 6 centimeters long, 4 centimeters wide, and 2.5 centimeters tall. What is the volume of the box, in cubic centimeters?',
         '60', ['12.5', '30', '68'],
         'Volume = length × width × height = 6 × 4 × 2.5 = 60.',
         "ans = 6 * 4 * sp.Rational(5, 2)\n")

    b.spr('GEO', 'Area and volume (cone)', 'M',
          'A right circular cone has a radius of 3 centimeters and a height of 8 centimeters. The volume of the cone is kπ cubic centimeters. What is the value of k?',
          '24', [],
          'V = (1/3)πr²h = (1/3)π(9)(8) = 24π, so k = 24.',
          "ans = sp.Rational(1, 3) * 3**2 * 8\n")

    b.mc('GEO', AV, 'M',
         'A cube has a total surface area of 150 square centimeters. What is the volume of the cube, in cubic centimeters?',
         '125', ['25', '150', '625'],
         'Six equal faces share 150 cm², so each face is 25 cm² and the edge is 5 cm. The volume is 5³ = 125.',
         "s = sp.sqrt(sp.Rational(150, 6))\nans = s**3\n")

    b.mc('GEO', AV, 'H',
         'The length of a rectangle is increased by 20%, and its width is decreased by 20%. How does the area of the new rectangle compare with the area of the original rectangle?',
         'It is 4% smaller.', ['It is the same.', 'It is 4% larger.', 'It is 40% smaller.'],
         'The new area is (1.2L)(0.8W) = 0.96LW, which is 4% less than the original. The two 20% changes do not cancel.',
         "L, W = sp.symbols('L W', positive=True)\nratio = sp.simplify((sp.Rational(12, 10)*L*sp.Rational(8, 10)*W)/(L*W))\nassert ratio == sp.Rational(96, 100)\n",
         custom="assert C[K] == 'It is 4% smaller.'\n")

    b.mc('GEO', LA, 'E',
         'In an isosceles triangle, the angle between the two equal sides measures 40°. What is the measure of each of the other two angles?',
         '70°', ['140°', '40°', '50°'],
         'The other two angles are equal and share 180° − 40° = 140°, so each is 70°.',
         "ans = sp.Rational(180 - 40, 2)\nP_ = P\nP = lambda t: P_(t.replace('°', ''))\n")

    b.mc('GEO', LA, 'M',
         'In triangle ABC, the measure of angle A is 48°, and the measure of angle B is twice the measure of angle C. What is the measure of angle C?',
         '44°', ['88°', '66°', '42°'],
         'B + C = 180° − 48° = 132°, and B = 2C, so 3C = 132° and C = 44°. (88° is angle B.)',
         "c = sp.Symbol('c')\nans = sp.solve(48 + 2*c + c - 180, c)[0]\nP_ = P\nP = lambda t: P_(t.replace('°', ''))\n")

    b.mc('GEO', LA, 'M',
         'Triangle ABC is similar to triangle DEF, with A, B, and C corresponding to D, E, and F, respectively. If AB = 6, DE = 15, and BC = 8, what is the length of EF?',
         '20', ['17', '3.2', '12'],
         'The scale factor from ABC to DEF is 15/6 = 2.5, so EF = 2.5 × 8 = 20.',
         "ans = sp.Rational(15, 6) * 8\n")

    b.spr('GEO', LA, 'H',
          'Each exterior angle of a regular polygon measures 24°. How many sides does the polygon have?',
          '15', [],
          'The exterior angles of any convex polygon sum to 360°, so a regular polygon with 24° exterior angles has 360/24 = 15 sides.',
          "ans = sp.Rational(360, 24)\n")

    b.mc('GEO', 'Right triangles (Pythagorean theorem)', 'E',
         'In the right triangle shown, the legs have lengths 9 and 12. What is the length h of the hypotenuse?',
         '15', ['21', '3√7', '13'],
         'h² = 9² + 12² = 81 + 144 = 225, so h = 15. (3√7 comes from subtracting the squares instead of adding them.)',
         "ans = sp.sqrt(9**2 + 12**2)\n",
         figure={'kind': 'geometry', 'params': {'shape': 'triangle', 'labels': {'horizontal_leg': '12', 'vertical_leg': '9', 'hypotenuse': 'h'}, 'marks': {'right_angle': 'between legs'}}})

    b.mc('GEO', RT, 'M',
         'In the right triangle shown, the hypotenuse has length 14, and the angle at the lower right measures 30°. What is the length x of the side opposite the 30° angle?',
         '7', ['7√3', '14√3', '28'],
         'The side opposite 30° is hypotenuse × sin 30° = 14 × 1/2 = 7. (7√3 is the side adjacent to the 30° angle.)',
         "ans = 14 * sp.sin(sp.pi/6)\n",
         figure={'kind': 'geometry', 'params': {'shape': 'triangle', 'labels': {'hypotenuse': '14', 'angle': '30°', 'vertical_leg': 'x'}, 'marks': {'right_angle': 'between legs'}}})

    b.mc('GEO', RT, 'H',
         'In right triangle PQR, the right angle is at Q, PQ = 8, and QR = 15. What is the value of sin R?',
         '8/17', ['15/17', '8/15', '17/8'],
         'The hypotenuse is PR = √(8² + 15²) = 17. Angle R is opposite side PQ = 8, so sin R = 8/17.',
         "PR = sp.sqrt(8**2 + 15**2)\nans = sp.Rational(8, 1) / PR\n")

    b.spr('GEO', RT, 'M',
          'The diagonal of a square has length 12. What is the area of the square?',
          '72', [],
          'A square\'s diagonal is its side times √2, so the side is 12/√2 and the area is (12/√2)² = 144/2 = 72.',
          "s = 12 / sp.sqrt(2)\nans = sp.simplify(s**2)\n")

    b.mc('GEO', CI, 'E',
         'A circle has a circumference of 18π centimeters. What is the radius of the circle, in centimeters?',
         '9', ['18', '3', '81'],
         'C = 2πr, so 2πr = 18π and r = 9.',
         "r = sp.Symbol('r')\nans = sp.solve(2*sp.pi*r - 18*sp.pi, r)[0]\n")

    b.mc('GEO', CE, 'M',
         'In the xy-plane, a circle has its center at (−2, 5) and a radius of 4. Which equation represents the circle?',
         '(x + 2)² + (y − 5)² = 16', ['(x − 2)² + (y + 5)² = 16', '(x + 2)² + (y − 5)² = 4', '(x + 2)² + (y − 5)² = 8'],
         'A circle with center (h, k) and radius r is (x − h)² + (y − k)² = r². Here (x − (−2))² + (y − 5)² = 4² = 16.',
         "x, y = sp.symbols('x y')\nans = (x + 2)**2 + (y - 5)**2 - 16\n")

    b.mc('GEO', 'Circles (sector area)', 'H',
         'A circle has a radius of 12 inches. What is the area, in square inches, of a sector of the circle with a central angle of 150°?',
         '60π', ['10π', '30π', '120π'],
         'The sector is 150/360 = 5/12 of the circle. The circle\'s area is 144π, so the sector is (5/12)(144π) = 60π. (10π is the ARC LENGTH.)',
         "ans = sp.Rational(150, 360) * sp.pi * 12**2\n")

    b.spr('GEO', 'Circles (arc length, radians)', 'H',
          'On a circle with a radius of 6 centimeters, an arc has a length of 5π centimeters. The central angle that intercepts the arc measures aπ radians. What is the value of a?',
          '5/6', ['.8333', '.8334', '0.833'],
          'Arc length = radius × angle in radians, so 5π = 6θ and θ = 5π/6. Then a = 5/6 (about .8333).',
          "ans = sp.Rational(5, 6)\n", tol=1e-3)

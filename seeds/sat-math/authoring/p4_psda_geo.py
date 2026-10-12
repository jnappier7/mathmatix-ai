"""SAT bank p4 — Problem-Solving & Data Analysis (PSDA) and Geometry & Trigonometry (GEO). 14 figures."""

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

COCOA = [[2, 38], [4, 33], [5, 31], [7, 30], [8, 27], [10, 26], [11, 22], [13, 21], [14, 18]]


def add(b):
    # ── PSDA figure items (8) ────────────────────────────────────────
    b.mc('PSDA', OV, 'M',
         'The bar graph shows the number of books a reading club finished in each of five months. What is the mean number of books per month?',
         '15', ['75', '18', '12'],
         'Total = 12 + 18 + 9 + 15 + 21 = 75, over 5 months: 75/5 = 15.',
         "vals = [12, 18, 9, 15, 21]\nans = sp.Rational(sum(vals), len(vals))\n",
         figure={'kind': 'bar', 'params': {'labels': ['Jan', 'Feb', 'Mar', 'Apr', 'May'], 'values': [12, 18, 9, 15, 21], 'xlabel': 'Month', 'ylabel': 'Books finished'}})

    b.spr('PSDA', PC, 'M',
          'The bar graph shows how 120 students voted among four field-trip options. What percent of the students voted for Option B?',
          '30', [],
          'Option B got 36 of the 120 votes: 36/120 = 0.30, or 30%.',
          "ans = sp.Rational(36, 24 + 36 + 30 + 30) * 100\n",
          figure={'kind': 'bar', 'params': {'labels': ['A', 'B', 'C', 'D'], 'values': [24, 36, 30, 30], 'xlabel': 'Option', 'ylabel': 'Votes'}})

    b.mc('PSDA', TV, 'H',
         'The scatterplot shows the daily low temperature x, in degrees Celsius, and the number of cups of hot cocoa y sold at a café, with the line of best fit y = −1.5x + 40. Based on the line, how many cups are predicted to sell on a day with a low of 12°C?',
         '22', ['18', '28', '52'],
         'y = −1.5(12) + 40 = −18 + 40 = 22. (52 adds the 18 instead of subtracting it.)',
         "ans = sp.Rational(-3, 2)*12 + 40\n",
         figure={'kind': 'scatter', 'params': {'pts': COCOA, 'xlabel': 'Low temperature (°C)', 'ylabel': 'Cups sold', 'line': {'slope': -1.5, 'yint': 40}}})

    b.mc('PSDA', TV, 'M',
         'The scatterplot shows the daily low temperature and the number of cups of hot cocoa sold at a café. Which statement best describes the association?',
         'A strong negative linear association', ['A strong positive linear association', 'A nonlinear association that rises and then falls', 'No association'],
         'As the temperature goes up, sales go down, and the points lie close to a straight line: a strong negative linear association.',
         "import numpy as np\nxs = np.array([p[0] for p in " + repr(COCOA) + "]); ys = np.array([p[1] for p in " + repr(COCOA) + "])\nr = np.corrcoef(xs, ys)[0, 1]\nassert r < -0.9\n",
         custom="assert C[K] == 'A strong negative linear association'\n",
         figure={'kind': 'scatter', 'params': {'pts': COCOA, 'xlabel': 'Low temperature (°C)', 'ylabel': 'Cups sold', 'line': {'slope': -1.5, 'yint': 40}}})

    b.mc('PSDA', PR, 'M',
         'The table shows whether students in two grades ride the bus to school. If a student who rides the bus is chosen at random, what is the probability that the student is in 10th grade?',
         '2/5', ['1/2', '1/4', '3/5'],
         'Only the 45 + 30 = 75 bus riders count, and 30 of them are in 10th grade: 30/75 = 2/5. (1/2 divides by all 60 tenth graders.)',
         "ans = sp.Rational(30, 45 + 30)\n",
         figure={'kind': 'table', 'params': {'headers': ['', 'Rides the bus', 'Does not', 'Total'], 'rows': [['9th grade', '45', '15', '60'], ['10th grade', '30', '30', '60'], ['Total', '75', '45', '120']]}})

    b.spr('PSDA', PR, 'H',
          'Using the table, what fraction of the 9th-grade students ride the bus? (Express your answer as a fraction or decimal.)',
          '3/4', ['.75', '0.75'],
          'Of the 60 ninth graders, 45 ride the bus: 45/60 = 3/4.',
          "ans = sp.Rational(45, 60)\n",
          figure={'kind': 'table', 'params': {'headers': ['', 'Rides the bus', 'Does not', 'Total'], 'rows': [['9th grade', '45', '15', '60'], ['10th grade', '30', '30', '60'], ['Total', '75', '45', '120']]}})

    b.mc('PSDA', OV, 'M',
         'The frequency table shows how many pets each of 10 students has. What is the mean number of pets per student?',
         '1.9', ['2', '2.1', '1.5'],
         'Total pets = 1(3) + 2(5) + 3(2) = 19, over 10 students: 1.9.',
         "ans = sp.Rational(1*3 + 2*5 + 3*2, 10)\n",
         figure={'kind': 'table', 'params': {'headers': ['Pets', 'Number of students'], 'rows': [['1', '3'], ['2', '5'], ['3', '2']]}})

    b.mc('PSDA', TV, 'H',
         'The table shows the balances, in dollars, of two savings accounts over 3 years. Which statement is true?',
         'Account A grows linearly, and Account B grows exponentially.',
         ['Account A grows exponentially, and Account B grows linearly.', 'Both accounts grow linearly.', 'Both accounts grow exponentially.'],
         'A adds the same $50 every year (linear). B is multiplied by 1.05 every year — 1,000 → 1,050 → 1,102.50 → 1,157.63 — so its yearly gain grows (exponential).',
         "A = [1000, 1050, 1100, 1150]\nB = [1000, 1050, sp.Rational(110250, 100), sp.Rational(115763, 100)]\n"
         "assert len({A[i+1] - A[i] for i in range(3)}) == 1\nassert all(abs(B[i+1] / B[i] - sp.Rational(105, 100)) < sp.Rational(1, 10000) for i in range(3))\n",
         custom="assert C[K] == 'Account A grows linearly, and Account B grows exponentially.'\n",
         figure={'kind': 'table', 'params': {'headers': ['Year', 'Account A', 'Account B'], 'rows': [['0', '1,000.00', '1,000.00'], ['1', '1,050.00', '1,050.00'], ['2', '1,100.00', '1,102.50'], ['3', '1,150.00', '1,157.63']]}})

    # ── PSDA (8) ─────────────────────────────────────────────────────
    b.mc('PSDA', RR, 'E',
         'How many minutes are in 3.5 hours?',
         '210', ['35', '350', '180'],
         '3.5 × 60 = 210 minutes.',
         "ans = sp.Rational(35, 10) * 60\n")

    b.mc('PSDA', RR, 'M',
         'A car uses 6 liters of fuel for every 100 kilometers it drives. How many liters does it use to drive 350 kilometers?',
         '21', ['35', '210', '6'],
         '350 km is 3.5 times 100 km, so it uses 3.5 × 6 = 21 liters.',
         "ans = sp.Rational(6, 100) * 350\n")

    b.spr('PSDA', PC, 'M',
          'A $250 bicycle is discounted by 12%, and then 8% sales tax is added to the discounted price. What is the final price, in dollars?',
          '237.6', [],
          '250 × 0.88 = 220 after the discount, and 220 × 1.08 = 237.60 with tax.',
          "ans = 250 * sp.Rational(88, 100) * sp.Rational(108, 100)\n")

    b.mc('PSDA', PC, 'H',
         'A town\'s population decreased by 10% one year and by another 10% the next year. By what percent did the population decrease over the two years?',
         '19%', ['20%', '10%', '21%'],
         '0.90 × 0.90 = 0.81 of the original remains — a 19% decrease. The second 10% is taken from a smaller population.',
         "ans = (1 - sp.Rational(9, 10)**2) * 100\n")

    b.mc('PSDA', OV, 'M',
         'The data set 3, 7, 7, 8, 10 is changed by replacing 10 with 30. Which statement describes the effect on the mean and the median?',
         'The mean increases by 4, and the median stays the same.',
         ['The mean and the median both increase by 4.', 'The mean stays the same, and the median increases.', 'The mean increases by 20, and the median stays the same.'],
         'The sum rises by 20, spread over 5 values: the mean rises by 4 (from 7 to 11). The middle value is still 7.',
         "import statistics as st\nA = [3, 7, 7, 8, 10]\nB = [3, 7, 7, 8, 30]\nassert st.mean(B) - st.mean(A) == 4 and st.median(A) == st.median(B)\n",
         custom="assert C[K] == 'The mean increases by 4, and the median stays the same.'\n")

    b.mc('PSDA', IM, 'H',
         'A random sample of likely voters found that 52% support a ballot measure, with a margin of error of 3 percentage points. Which statement is the most appropriate conclusion?',
         'It is plausible that between 49% and 55% of all likely voters support the measure.',
         ['The measure will pass, because more than half of the sample supports it.', 'Exactly 52% of all likely voters support the measure.', 'Between 49% and 55% of the people in the sample support the measure.'],
         'The margin of error gives a plausible range for the whole population: 52% ± 3% = 49% to 55%. Since 49% is below half, passage is not assured.',
         "assert (52 - 3, 52 + 3) == (49, 55)\n",
         custom="assert C[K].startswith('It is plausible that between 49% and 55%')\n")

    b.mc('PSDA', SC, 'M',
         'Researchers randomly selected 200 members of one high school\'s band and found that 60% practice at least 5 hours a week. To which group can this result be generalized?',
         'Members of that high school\'s band', ['All high school students in the country', 'All high school band members in the country', 'All students at that high school'],
         'The sample was drawn at random from one school\'s band, so the result applies to that band — not to other schools or to non-band students.',
         "population = 'band at one school'\nassert population == 'band at one school'\n",
         custom="assert C[K] == \"Members of that high school's band\"\n")

    b.spr('PSDA', PR, 'M',
          'A bag holds 5 red, 3 blue, and 2 green marbles. If one marble is chosen at random, what is the probability that it is red or green? (Express your answer as a fraction or decimal.)',
          '7/10', ['.7', '0.7'],
          '7 of the 10 marbles are red or green: 7/10.',
          "ans = sp.Rational(5 + 2, 5 + 3 + 2)\n")

    # ── GEO figure items (6) ─────────────────────────────────────────
    b.mc('GEO', PY, 'E',
         'In the right triangle shown, the legs have lengths 8 and 15. What is the length c of the hypotenuse?\nNote: Figure not drawn to scale.',
         '17', ['23', '13', '√161'],
         'c² = 8² + 15² = 64 + 225 = 289, so c = 17. (√161 subtracts the squares.)',
         "ans = sp.sqrt(8**2 + 15**2)\n",
         figure={'kind': 'geometry', 'params': {'shape': 'triangle', 'labels': {'horizontal_leg': '15', 'vertical_leg': '8', 'hypotenuse': 'c'}, 'marks': {'right_angle': 'between legs'}}})

    b.mc('GEO', RT, 'M',
         'In the right triangle shown, the hypotenuse is 20 and the angle at the lower right measures 60°. What is the length x of the side opposite the 60° angle?\nNote: Figure not drawn to scale.',
         '10√3', ['10', '20√3', '40'],
         'opposite = hypotenuse × sin 60° = 20 × (√3/2) = 10√3. (10 is the side opposite the 30° angle.)',
         "ans = 20 * sp.sin(sp.pi/3)\n",
         figure={'kind': 'geometry', 'params': {'shape': 'triangle', 'labels': {'hypotenuse': '20', 'angle': '60°', 'vertical_leg': 'x'}, 'marks': {'right_angle': 'between legs'}}})

    b.spr('GEO', RT, 'M',
          'In the right triangle shown, the horizontal leg is 6, the vertical leg is 8, and θ is the angle at the lower right. What is the value of tan θ?\nNote: Figure not drawn to scale.',
          '4/3', ['1.333'],
          'tan θ = opposite/adjacent = 8/6 = 4/3 (about 1.333).',
          "ans = sp.Rational(8, 6)\n", tol=1e-3,
          figure={'kind': 'geometry', 'params': {'shape': 'triangle', 'labels': {'horizontal_leg': '6', 'vertical_leg': '8', 'angle': 'θ'}, 'marks': {'right_angle': 'between legs'}}})

    b.mc('GEO', RT, 'H',
         'In the right triangle shown, the hypotenuse is 10, the horizontal leg is 6, and θ is the angle at the lower right. What is the value of sin θ?\nNote: Figure not drawn to scale.',
         '4/5', ['3/5', '4/3', '3/4'],
         'The vertical leg is √(10² − 6²) = 8. It is opposite θ, so sin θ = 8/10 = 4/5. (3/5 is cos θ.)',
         "opp = sp.sqrt(10**2 - 6**2)\nans = opp / 10\n",
         figure={'kind': 'geometry', 'params': {'shape': 'triangle', 'labels': {'hypotenuse': '10', 'horizontal_leg': '6', 'angle': 'θ'}, 'marks': {'right_angle': 'between legs'}}})

    b.mc('GEO', PY, 'M',
         'In the right triangle shown, both legs have length 7. What is the length h of the hypotenuse?\nNote: Figure not drawn to scale.',
         '7√2', ['14', '7√3', '49'],
         'A 45°-45°-90° triangle: the hypotenuse is a leg times √2, so h = 7√2.',
         "ans = sp.sqrt(7**2 + 7**2)\n",
         figure={'kind': 'geometry', 'params': {'shape': 'triangle', 'labels': {'horizontal_leg': '7', 'vertical_leg': '7', 'hypotenuse': 'h'}, 'marks': {'right_angle': 'between legs'}}})

    b.spr('GEO', AV, 'H',
          'In the right triangle shown, the hypotenuse is 26 and the vertical leg is 10. What is the area of the triangle?\nNote: Figure not drawn to scale.',
          '120', [],
          'The horizontal leg is √(26² − 10²) = √576 = 24. Area = (1/2)(24)(10) = 120.',
          "leg = sp.sqrt(26**2 - 10**2)\nans = sp.Rational(1, 2) * leg * 10\n",
          figure={'kind': 'geometry', 'params': {'shape': 'triangle', 'labels': {'hypotenuse': '26', 'vertical_leg': '10', 'horizontal_leg': '?'}, 'marks': {'right_angle': 'between legs'}}})

    # ── GEO (10) ─────────────────────────────────────────────────────
    b.mc('GEO', AV, 'E',
         'A rectangle has a perimeter of 30 and a length of 9. What is its area?',
         '54', ['81', '270', '42'],
         '2(9 + w) = 30 gives w = 6, so the area is 9 × 6 = 54.',
         "w = sp.Symbol('w')\nwv = sp.solve(2*(9 + w) - 30, w)[0]\nans = 9 * wv\n")

    b.mc('GEO', AV, 'M',
         'A rectangular prism has a volume of 240 cubic inches. Its base is 8 inches by 6 inches. What is its height, in inches?',
         '5', ['30', '40', '10'],
         'V = (base area) × height: 240 = 48h, so h = 5.',
         "ans = sp.Rational(240, 8 * 6)\n")

    b.mc('GEO', 'Area and volume (cylinder)', 'H',
         'The radius of a cylinder is doubled and its height is unchanged. By what factor is its volume multiplied?',
         '4', ['2', '8', '6'],
         'V = πr²h. Doubling r multiplies r² — and so the volume — by 2² = 4.',
         "r, h = sp.symbols('r h', positive=True)\nans = sp.simplify((sp.pi*(2*r)**2*h) / (sp.pi*r**2*h))\n")

    b.mc('GEO', LA, 'M',
         'Two angles are complementary, and one is 4 times the other. What is the measure, in degrees, of the larger angle?',
         '72', ['18', '144', '36'],
         'x + 4x = 90, so x = 18 and the larger angle is 4(18) = 72. (144 would come from using 180°.)',
         "x = sp.Symbol('x')\nans = 4 * sp.solve(x + 4*x - 90, x)[0]\n")

    b.mc('GEO', LA, 'H',
         'An exterior angle of a triangle measures 120°. One of the two remote interior angles measures 70°. What is the measure, in degrees, of the other remote interior angle?',
         '50', ['60', '110', '70'],
         'An exterior angle equals the sum of the two remote interior angles: 120 = 70 + x, so x = 50.',
         "ans = 120 - 70\n")

    b.spr('GEO', 'Circles (arc length)', 'M',
          'In a circle with radius 8, a central angle of 45° intercepts an arc of length kπ. What is the value of k?',
          '2', [],
          'The arc is 45/360 = 1/8 of the circumference 16π, which is 2π. So k = 2.',
          "ans = sp.Rational(45, 360) * 2 * 8\n")

    b.mc('GEO', CE, 'H',
         'In the xy-plane, the graph of x² + y² − 10x + 2y + 1 = 0 is a circle. What is the radius of the circle?',
         '5', ['25', '1', '√26'],
         'Complete the square: (x − 5)² + (y + 1)² = −1 + 25 + 1 = 25, so r = 5.',
         "x, y = sp.symbols('x y')\ne = sp.expand(x**2 + y**2 - 10*x + 2*y + 1)\nh_ = -e.coeff(x, 1)/2\nk_ = -e.coeff(y, 1)/2\nans = sp.sqrt(h_**2 + k_**2 - e.subs({x: 0, y: 0}))\n")

    b.mc('GEO', 'Circles (sector area)', 'M',
         'A circle has a radius of 6. What is the area of a sector with a central angle of 120°?',
         '12π', ['4π', '36π', '24π'],
         'The sector is 120/360 = 1/3 of the circle, whose area is 36π: 12π. (4π is the arc length.)',
         "ans = sp.Rational(120, 360) * sp.pi * 6**2\n")

    b.spr('GEO', 'Circles (arc length, radians)', 'H',
          'An angle of 150° is equivalent to aπ radians. What is the value of a?',
          '5/6', ['.8333', '0.833'],
          'Multiply by π/180: 150π/180 = 5π/6, so a = 5/6 (about .8333).',
          "ans = sp.Rational(150, 180)\n", tol=1e-3)

    b.mc('GEO', LA, 'M',
         'Two triangles are similar with a scale factor of 2 to 5. The smaller triangle has an area of 12. What is the area of the larger triangle?',
         '75', ['30', '60', '48'],
         'Areas scale by the SQUARE of the scale factor: (5/2)² = 25/4, so 12 × 25/4 = 75. (30 scales by 5/2 only.)',
         "ans = 12 * sp.Rational(5, 2)**2\n")

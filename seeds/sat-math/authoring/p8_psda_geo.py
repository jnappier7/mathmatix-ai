"""SAT bank p8 — Problem-Solving & Data Analysis (PSDA) and Geometry &
Trigonometry (GEO). 11 + 11 items aimed at thin unified skills: residuals
(ALG1.DTA.4), study design (ALG2.DTA.1), inference (ALG2.DTA.3), two-way
tables (ALG1.DTA.2), circle equations (GEO.SPC.16), Pythagorean applications
(GEO.SPC.11)."""

RES = 'Two-variable data: scatterplots and models (residuals)'
SC = 'Evaluating statistical claims'
IM = 'Inference and margin of error'
TW = 'Probability and conditional probability (two-way table)'

PY = 'Right triangles (Pythagorean theorem)'
CE = 'Circles (equation in the xy-plane)'
LA = 'Lines, angles, and triangles'
AV = 'Area and volume'

# Around y = 5x with residuals exactly ±5 and orthogonal to x (sum 0, sum x·r
# 0), so the drawn line is the least-squares line; every value is a multiple
# of 5, on the plot's gridlines.
STALLS = [[1, 10], [2, 5], [3, 10], [4, 25], [5, 20], [6, 35], [7, 40], [8, 35]]

SPORT = {'kind': 'table', 'params': {'headers': ['', 'Plays a sport', 'Does not', 'Total'],
                                     'rows': [['10th grade', '40', '60', '100'], ['11th grade', '55', '45', '100'], ['Total', '95', '105', '200']]}}


def add(b):
    # ── PSDA ─────────────────────────────────────────────────────────
    b.mc('PSDA', RES, 'M',
         'The scatterplot shows the number of hours x eight market stalls were open and each stall’s sales y, in dollars, along with a line of best fit. What is the residual for the stall that was open 4 hours (actual minus predicted)?',
         '5', ['−5', '25', '20'],
         'The point at 4 hours is at 25. Directly below it, the line is at 20. Residual = actual − predicted = 25 − 20 = 5. (20 is the prediction; 25 is the actual value.)',
         "import numpy as np\npts = " + repr(STALLS) + "\nxs = np.array([p[0] for p in pts]); ys = np.array([p[1] for p in pts])\n"
         "m, c = np.polyfit(xs, ys, 1)\nassert abs(m - 5) < 1e-9 and abs(c) < 1e-9\nans = 25 - 5*4\n",
         figure={'kind': 'scatter', 'params': {'pts': STALLS, 'xlabel': 'Hours open', 'ylabel': 'Sales ($)', 'line': {'slope': 5, 'yint': 0}}})

    b.mc('PSDA', RES, 'E',
         'A data point lies below the line of best fit for a data set. Which statement must be true about the residual for that data point?',
         'The residual is negative.', ['The residual is positive.', 'The residual is zero.', 'The residual is greater than the predicted value.'],
         'Residual = actual − predicted. Below the line, the actual value is less than the predicted value, so the residual is negative.',
         "actual, predicted = 10, 14\nassert actual - predicted < 0\nans = None\n",
         custom="assert C[K] == 'The residual is negative.'\n")

    b.spr('PSDA', RES, 'M',
          'A line of best fit for a data set is y = 2.5x + 10. For the data point with x = 6, the residual (actual minus predicted) is −3. What is the actual y-value of that data point?',
          '22', [],
          'The line predicts 2.5(6) + 10 = 25. Actual = predicted + residual = 25 + (−3) = 22.',
          "pred = sp.Rational(5, 2)*6 + 10\nans = pred + (-3)\n")

    b.mc('PSDA', SC, 'E',
         'A principal wants to estimate the mean number of hours of sleep that students at her school get on school nights. Which method of choosing students is most likely to give an unbiased estimate?',
         'Randomly select 100 students from the list of all students at the school.',
         ['Survey the first 100 students who arrive at school in the morning.',
          'Survey 100 students who volunteer at a school assembly.',
          'Survey all the students in one first-period class.'],
         'A random sample from the whole school gives every student the same chance of being chosen. Early arrivals, volunteers, and a single class can each differ from the school as a whole.',
         "ans = None\n",
         custom="assert C[K].startswith('Randomly select 100 students')\n")

    b.mc('PSDA', SC, 'M',
         'A website asked its visitors to vote on whether the town should build a new stadium, and 70% of the 2,000 people who voted said yes. Which statement best explains why this result may not represent the opinion of all town residents?',
         'The people who voted chose themselves, so they may differ from residents as a whole.',
         ['The sample of 2,000 people is too small to say anything.', '70% is too close to 50% to draw a conclusion.', 'Online votes cannot be counted accurately.'],
         'A voluntary-response sample is not random: people who visit the site and care enough to vote may feel differently than other residents. The problem is how the sample was chosen, not its size.',
         "ans = None\n",
         custom="assert C[K].startswith('The people who voted chose themselves')\n")

    b.mc('PSDA', SC, 'H',
         'Researchers surveyed a random sample of 500 high school students and found that students who regularly eat breakfast had higher average grades than students who do not. Which conclusion is best supported?',
         'Eating breakfast is associated with higher grades among high school students, but the study does not show that breakfast causes higher grades.',
         ['Eating breakfast causes higher grades for high school students.',
          'Eating breakfast does not affect grades, because the study was not an experiment.',
          'The result applies only to the 500 students who were surveyed.'],
         'Random SAMPLING lets the association generalize to high school students. But no one was ASSIGNED to eat breakfast, so other factors could explain the difference; cause and effect is not shown.',
         "random_sample, random_assignment = True, False\nassert random_sample and not random_assignment\nans = None\n",
         custom="assert C[K].startswith('Eating breakfast is associated')\n")

    b.mc('PSDA', IM, 'E',
         'Based on a random sample, the mean commute time of workers in a city is estimated to be 24 minutes, with a margin of error of 3 minutes. Which interval contains the plausible values for the mean commute time of all workers in the city?',
         '21 minutes to 27 minutes', ['24 minutes to 27 minutes', '18 minutes to 30 minutes', '3 minutes to 24 minutes'],
         'The estimate plus or minus the margin of error: 24 − 3 = 21 and 24 + 3 = 27.',
         "lo, hi = 24 - 3, 24 + 3\nassert (lo, hi) == (21, 27)\nans = None\n",
         custom="assert C[K] == '21 minutes to 27 minutes'\n")

    b.mc('PSDA', IM, 'M',
         'A researcher plans a survey to estimate the proportion of adults in a county who exercise daily. Which change to the plan would most likely decrease the margin of error of the estimate?',
         'Survey a larger random sample of adults.',
         ['Survey a smaller random sample of adults.', 'Survey only adults who belong to a gym.', 'Report the results as percents instead of fractions.'],
         'Larger random samples give more precise estimates. Surveying only gym members would make the estimate biased, not more precise.',
         "ans = None\n",
         custom="assert C[K] == 'Survey a larger random sample of adults.'\n")

    b.mc('PSDA', IM, 'H',
         'Two independent random samples estimated the percent of residents who support a new library. In Town A the estimate was 45% with a margin of error of 5 percentage points; in Town B it was 52% with a margin of error of 5 percentage points. Which conclusion is best supported?',
         'The data do not clearly show a difference, because the plausible ranges overlap.',
         ['Support is definitely higher in Town B than in Town A.', 'Support is definitely higher in Town A than in Town B.', 'Exactly 7% more residents support the library in Town B.'],
         'Town A’s plausible range is 40% to 50% and Town B’s is 47% to 57%. They overlap from 47% to 50%, so the true percents could be equal; a difference is not clearly shown.',
         "a, b_ = (45 - 5, 45 + 5), (52 - 5, 52 + 5)\nassert max(a[0], b_[0]) <= min(a[1], b_[1])\nans = None\n",
         custom="assert C[K].startswith('The data do not clearly show a difference')\n")

    b.spr('PSDA', TW, 'M',
          'The table shows whether students in two grades play a sport. What fraction of the students who play a sport are in 11th grade? (Express your answer as a fraction or decimal.)',
          '11/19', ['.5789', '0.578', '0.579'],
          'Only the 95 students who play a sport count, and 55 of them are in 11th grade: 55/95 = 11/19. (55/100 divides by all 11th graders instead.)',
          "ans = sp.Rational(55, 40 + 55)\n",
          tol=1e-3,
          figure=SPORT)

    b.mc('PSDA', TW, 'H',
         'Using the table, if one of the 200 students is chosen at random, what is the probability that the student is in 10th grade AND does not play a sport?',
         '3/10', ['3/5', '4/7', '1/2'],
         '60 of all 200 students are 10th graders who do not play a sport: 60/200 = 3/10. (3/5 is 60/100, the share of 10th graders; 4/7 is 60/105, the share of non-players.)',
         "ans = sp.Rational(60, 200)\n",
         figure=SPORT)

    # ── GEO ──────────────────────────────────────────────────────────
    b.spr('GEO', PY, 'E',
          'A 13-foot ladder leans against a vertical wall. The bottom of the ladder is 5 feet from the base of the wall. How high up the wall, in feet, does the top of the ladder reach?',
          '12', [],
          'The ladder is the hypotenuse of a right triangle: 5² + h² = 13², so h² = 169 − 25 = 144 and h = 12.',
          "ans = sp.sqrt(13**2 - 5**2)\n")

    b.mc('GEO', CE, 'E',
         'The equation of a circle in the xy-plane is (x − 3)² + (y + 2)² = 16. What is the radius of the circle?',
         '4', ['16', '8', '2'],
         'In (x − h)² + (y − k)² = r², the right side is r². r² = 16, so r = 4.',
         "ans = sp.sqrt(16)\n")

    b.mc('GEO', PY, 'E',
         'A rectangle is 8 inches wide and 15 inches long. What is the length of a diagonal of the rectangle, in inches?',
         '17', ['23', '13', '289'],
         'A diagonal makes a right triangle with two sides: d² = 8² + 15² = 289, so d = 17. (289 is d², not d.)',
         "ans = sp.sqrt(8**2 + 15**2)\n")

    b.mc('GEO', CE, 'M',
         'A circle in the xy-plane has center (2, −1) and passes through the point (5, 3). Which equation represents the circle?',
         '(x − 2)² + (y + 1)² = 25', ['(x + 2)² + (y − 1)² = 25', '(x − 2)² + (y + 1)² = 5', '(x − 2)² + (y + 1)² = 7'],
         'The radius is the distance from (2, −1) to (5, 3): √(3² + 4²) = 5, so r² = 25. Center (2, −1) gives (x − 2)² + (y + 1)².',
         "ans = None\n",
         custom="x, y = sp.symbols('x y')\nr2 = (5 - 2)**2 + (3 + 1)**2\nwant = sp.expand((x - 2)**2 + (y + 1)**2 - r2)\n"
                "assert [c for c in C if sp.expand(P(c)) == want] == [C[K]]\n")

    b.spr('GEO', PY, 'M',
          'What is the distance between the points (1, 2) and (7, 10) in the xy-plane?',
          '10', [],
          'The horizontal change is 6 and the vertical change is 8: distance = √(6² + 8²) = √100 = 10.',
          "ans = sp.sqrt((7 - 1)**2 + (10 - 2)**2)\n")

    b.mc('GEO', PY, 'M',
         'An isosceles triangle has two sides of length 10 and a base of length 12. What is the height of the triangle from the base?',
         '8', ['6', '√136', '10'],
         'The height splits the base into two halves of 6, making right triangles with hypotenuse 10: h = √(10² − 6²) = √64 = 8.',
         "ans = sp.sqrt(10**2 - 6**2)\n")

    b.spr('GEO', CE, 'M',
          'The equation x² + y² + 4x − 10y = 7 defines a circle in the xy-plane. What is the radius of the circle?',
          '6', [],
          'Complete the square: (x² + 4x + 4) + (y² − 10y + 25) = 7 + 4 + 25, so (x + 2)² + (y − 5)² = 36 and the radius is 6.',
          "x, y = sp.symbols('x y')\nr2 = 7 + 4 + 25\nassert sp.expand((x + 2)**2 + (y - 5)**2 - r2) == x**2 + y**2 + 4*x - 10*y - 7\nans = sp.sqrt(r2)\n")

    b.spr('GEO', CE, 'H',
          'The point (4, k) lies on the circle (x − 1)² + (y − 2)² = 25 in the xy-plane, and k > 0. What is the value of k?',
          '6', [],
          'Substitute x = 4: 9 + (k − 2)² = 25, so (k − 2)² = 16 and k − 2 = ±4. Then k = 6 or k = −2; since k > 0, k = 6.',
          "k = sp.Symbol('k')\nans = [s for s in sp.solve((4 - 1)**2 + (k - 2)**2 - 25, k) if s > 0][0]\n")

    b.mc('GEO', PY, 'H',
         'A box in the shape of a rectangular prism measures 3 inches by 4 inches by 12 inches. What is the length of the longest straight rod that fits inside the box, from one corner to the opposite corner?',
         '13', ['19', '√153', '12'],
         'The floor’s diagonal is √(3² + 4²) = 5. That diagonal and the 12-inch height make another right triangle: √(5² + 12²) = 13.',
         "ans = sp.sqrt(3**2 + 4**2 + 12**2)\n")

    b.spr('GEO', LA, 'H',
          'In triangle ABC, AB = AC. The measure of angle A is (3x)° and the measure of angle B is (x + 20)°. What is the value of x?',
          '28', [],
          'AB = AC makes angles B and C equal. So 3x + 2(x + 20) = 180, 5x = 140, and x = 28. (The angles are 84°, 48°, and 48°.)',
          "x = sp.Symbol('x')\nans = sp.solve(3*x + 2*(x + 20) - 180, x)[0]\n")

    b.mc('GEO', AV, 'H',
         'A cylinder has a volume of 72π cubic centimeters and a height of 8 centimeters. What is the area of its curved lateral surface, in square centimeters?',
         '48π', ['24π', '72π', '18π'],
         'πr²(8) = 72π gives r² = 9, so r = 3. The lateral area is 2πrh = 2π(3)(8) = 48π.',
         "r = sp.Symbol('r', positive=True)\nr0 = sp.solve(sp.pi*r**2*8 - 72*sp.pi, r)[0]\nans = 2*sp.pi*r0*8\n")

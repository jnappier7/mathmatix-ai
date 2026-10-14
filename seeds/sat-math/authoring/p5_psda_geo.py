"""SAT bank p5 — Problem-Solving & Data Analysis (PSDA) and Geometry & Trigonometry
(GEO). 18 + 18 items, weighted EASY (8 E / 7 M / 3 H each). Every figure is
needed: no stem restates what its graph shows."""

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

# Hours of practice (x) and points scored (y): close to y = 2.5x + 10, so the
# drawn line of best fit IS the least-squares line (checked in the verify).
PRACTICE = [[1, 12], [2, 16], [3, 17], [4, 21], [5, 22], [6, 24], [7, 28], [8, 29], [9, 33], [10, 35]]


def add(b):
    # ── PSDA: Easy (8) ───────────────────────────────────────────────
    b.spr('PSDA', PC, 'E',
          '24 is what percent of 80?',
          '30', [],
          '24/80 = 0.30, which is 30%.',
          "ans = sp.Rational(24, 80) * 100\n")

    b.mc('PSDA', RR, 'E',
         'A recipe uses 3 cups of flour to make 12 cookies. At this rate, how many cups of flour are needed to make 30 cookies?',
         '7.5', ['2.5', '9', '6'],
         'That is 3/12 = 0.25 cup per cookie, so 30 cookies need 30(0.25) = 7.5 cups.',
         "ans = sp.Rational(3, 12) * 30\n")

    b.spr('PSDA', OV, 'E',
          'The bar graph shows the number of students who chose each sport as their favorite. How many more students chose soccer than chose tennis?',
          '9', [],
          'Soccer has 14 students and tennis has 5: 14 − 5 = 9.',
          "vals = {'Soccer': 14, 'Basketball': 9, 'Tennis': 5, 'Swimming': 12}\nans = vals['Soccer'] - vals['Tennis']\n",
          figure={'kind': 'bar', 'params': {'labels': ['Soccer', 'Basketball', 'Tennis', 'Swimming'], 'values': [14, 9, 5, 12], 'xlabel': 'Sport', 'ylabel': 'Number of students'}})

    b.mc('PSDA', OV, 'E',
         'What is the mean of the data set 4, 8, 10, 14?',
         '9', ['10', '8', '36'],
         'The sum is 4 + 8 + 10 + 14 = 36, and there are 4 values: 36/4 = 9. (36 is the sum, not the mean.)',
         "vals = [4, 8, 10, 14]\nans = sp.Rational(sum(vals), len(vals))\n")

    b.mc('PSDA', OV, 'E',
         'What is the median of the data set 3, 9, 4, 12, 8?',
         '8', ['4', '7.2', '9'],
         'In order: 3, 4, 8, 9, 12. The middle value is 8. (7.2 is the mean; 4 is the middle of the list as written.)',
         "vals = sorted([3, 9, 4, 12, 8])\nans = vals[len(vals)//2]\n")

    b.spr('PSDA', PC, 'E',
          'A jacket that costs $60 is on sale for 25% off. What is the sale price, in dollars?',
          '45', [],
          '25% of $60 is $15, and $60 − $15 = $45. (Or: 75% of 60 = 45.)',
          "ans = 60 * (1 - sp.Rational(25, 100))\n")

    b.mc('PSDA', RR, 'E',
         'A bus travels 150 miles in 2.5 hours. What is its average speed, in miles per hour?',
         '60', ['375', '62.5', '50'],
         'Speed = distance ÷ time = 150 ÷ 2.5 = 60 miles per hour. (375 multiplies instead of dividing.)',
         "ans = sp.Rational(150) / sp.Rational(5, 2)\n")

    b.mc('PSDA', PR, 'E',
         'A bag contains 5 red marbles, 3 blue marbles, and 2 green marbles. If one marble is chosen at random, what is the probability that it is blue?',
         '3/10', ['3/7', '1/3', '7/10'],
         'There are 5 + 3 + 2 = 10 marbles and 3 are blue: 3/10. (3/7 compares blue to the non-blue marbles.)',
         "ans = sp.Rational(3, 5 + 3 + 2)\n")

    # ── PSDA: Medium (7) ─────────────────────────────────────────────
    b.mc('PSDA', TV, 'M',
         'The scatterplot shows the number of hours x that each of ten students practiced free throws and the number of points y each scored in a shooting test, along with a line of best fit. Based on the line of best fit, how many points would a student who practiced 8 hours be predicted to score?',
         '30', ['20', '40', '36'],
         'Read the line, not the dot: above x = 8 the line is at y = 30 (it passes through (4, 20) and (8, 30), rising 2.5 points per hour). The student who actually practiced 8 hours scored 29 — the prediction comes from the line.',
         "import numpy as np\nxs = np.array([p[0] for p in " + repr(PRACTICE) + "]); ys = np.array([p[1] for p in " + repr(PRACTICE) + "])\n"
         "m, c = np.polyfit(xs, ys, 1)\nassert abs(m - 2.5) < 0.15 and abs(c - 10) < 1.0, (m, c)\nans = sp.Rational(5, 2)*8 + 10\n",
         figure={'kind': 'scatter', 'params': {'pts': PRACTICE, 'xlabel': 'Hours of practice', 'ylabel': 'Points scored', 'line': {'slope': 2.5, 'yint': 10}}})

    b.spr('PSDA', PR, 'M',
          'The table shows the pets owned by 100 students in two grades (each student owns at most one kind of pet). If a 9th-grade student is chosen at random, what is the probability that the student owns a cat? (Express your answer as a fraction or decimal.)',
          '6/25', ['.24', '0.24'],
          'Only the 50 ninth graders count, and 12 of them own a cat: 12/50 = 6/25, or 0.24. (12/100 divides by every student.)',
          "ans = sp.Rational(12, 18 + 12 + 20)\n",
          figure={'kind': 'table', 'params': {'headers': ['', 'Dog', 'Cat', 'No pet', 'Total'], 'rows': [['9th grade', '18', '12', '20', '50'], ['10th grade', '22', '8', '20', '50'], ['Total', '40', '20', '40', '100']]}})

    b.spr('PSDA', PC, 'M',
          'The price of a concert ticket rose from $40 to $52. By what percent did the price increase?',
          '30', [],
          'The increase is $12, and 12/40 = 0.30, or 30%. (Dividing by the new price, 52, gives about 23%.)',
          "ans = sp.Rational(52 - 40, 40) * 100\n")

    b.mc('PSDA', RR, 'M',
         'A conveyor belt moves at 3 feet per second. What is this speed in feet per minute?',
         '180', ['20', '60', '1/20'],
         'There are 60 seconds in a minute: 3 × 60 = 180 feet per minute.',
         "ans = 3 * 60\n")

    b.mc('PSDA', IM, 'M',
         'A random sample of shoppers at a mall was surveyed about how long they spent there. The mean time in the sample was 42 minutes, with a margin of error of 3 minutes. Which statement is best supported?',
         'The mean time for all shoppers at the mall is plausibly between 39 and 45 minutes.',
         ['Every shopper in the sample spent between 39 and 45 minutes at the mall.',
          'The mean time for all shoppers at the mall is exactly 42 minutes.',
          'Most shoppers at the mall spent more than 45 minutes there.'],
         'A margin of error describes the population mean, not individual shoppers: 42 ± 3 gives a plausible range of 39 to 45 minutes. It does not pin the mean at exactly 42.',
         "lo, hi = 42 - 3, 42 + 3\nassert (lo, hi) == (39, 45)\nans = None\n",
         custom="assert C[K].startswith('The mean time for all shoppers at the mall is plausibly between 39 and 45')\n")

    b.mc('PSDA', OV, 'M',
         'The mean of five numbers is 20. When a sixth number, 32, is added to the list, what is the mean of the six numbers?',
         '22', ['26', '21', '32'],
         'The five numbers sum to 5 × 20 = 100. Adding 32 gives 132, and 132/6 = 22. (26 averages 20 and 32 as if they were two numbers.)',
         "ans = sp.Rational(5*20 + 32, 6)\n")

    b.mc('PSDA', SC, 'M',
         'A researcher surveyed a random sample of 200 students at Lincoln High School and found that 60% of them preferred a later start time. To which group can this result most reasonably be applied?',
         'All students at Lincoln High School',
         ['All high school students in the country', 'Only the 200 students who were surveyed', 'All teachers at Lincoln High School'],
         'A random sample represents the population it was drawn from — students at Lincoln High — so the result generalizes to them, but not to students at other schools or to teachers.',
         "ans = None\n",
         custom="assert C[K] == 'All students at Lincoln High School'\n")

    # ── PSDA: Hard (3) ───────────────────────────────────────────────
    b.mc('PSDA', PC, 'H',
         'The price of a bicycle was increased by 20%. Later, the new price was decreased by 20%. How does the final price compare with the original price?',
         'It is 4% less than the original price.',
         ['It is equal to the original price.', 'It is 4% more than the original price.', 'It is 40% less than the original price.'],
         'Multiply the factors: 1.20 × 0.80 = 0.96, so the final price is 96% of the original — 4% less. The 20% decrease is taken from the larger, increased price.',
         "f = sp.Rational(120, 100) * sp.Rational(80, 100)\nassert f == sp.Rational(96, 100)\nans = None\n",
         custom="assert C[K] == 'It is 4% less than the original price.'\n")

    b.spr('PSDA', RR, 'H',
          'A chemist has 40 liters of a solution that is 25% acid. How many liters of pure acid must be added to make a solution that is 40% acid?',
          '10', [],
          'The solution holds 0.25(40) = 10 liters of acid. Adding a liters of pure acid: (10 + a)/(40 + a) = 0.40, so 10 + a = 16 + 0.4a, 0.6a = 6, and a = 10.',
          "a = sp.Symbol('a')\nans = sp.solve((10 + a) - sp.Rational(2, 5)*(40 + a), a)[0]\n")

    b.mc('PSDA', OV, 'H',
         'Data set A: 10, 10, 10, 10, 10\nData set B: 6, 8, 10, 12, 14\nWhich statement about the two data sets is true?',
         'They have the same mean, and data set B has the greater standard deviation.',
         ['They have the same mean and the same standard deviation.',
          'Data set B has the greater mean and the greater standard deviation.',
          'They have the same mean, and data set A has the greater standard deviation.'],
         'Both means are 10. Every value in A equals the mean, so its standard deviation is 0; B is spread out around 10, so its standard deviation is greater.',
         "import statistics as st\nA = [10]*5\nB_ = [6, 8, 10, 12, 14]\nassert st.mean(A) == st.mean(B_) and st.pstdev(B_) > st.pstdev(A)\nans = None\n",
         custom="assert C[K].startswith('They have the same mean, and data set B')\n")

    # ── GEO: Easy (8) ────────────────────────────────────────────────
    b.mc('GEO', AV, 'E',
         'A rectangle has a length of 8 centimeters and a width of 5 centimeters. What is the area of the rectangle, in square centimeters?',
         '40', ['26', '13', '80'],
         'Area = length × width = 8 × 5 = 40. (26 is the perimeter.)',
         "ans = 8 * 5\n")

    b.spr('GEO', PY, 'E',
          'In the right triangle shown, what is the length of the hypotenuse c?' + NOTE,
          '29', [],
          'The legs are 20 and 21: c² = 20² + 21² = 400 + 441 = 841, so c = 29.',
          "ans = sp.sqrt(20**2 + 21**2)\n",
          figure={'kind': 'geometry', 'params': {'shape': 'triangle', 'labels': {'horizontal_leg': '21', 'vertical_leg': '20', 'hypotenuse': 'c'}, 'marks': {'right_angle': 'between legs'}}})

    b.spr('GEO', LA, 'E',
          'Two angles of a triangle measure 50° and 60°. What is the measure, in degrees, of the third angle?',
          '70', [],
          'The angles of a triangle add to 180°: 180 − 50 − 60 = 70.',
          "ans = 180 - 50 - 60\n")

    b.mc('GEO', CI, 'E',
         'A circle has a radius of 6 inches. What is the circumference of the circle, in inches?',
         '12π', ['6π', '36π', '24π'],
         'Circumference = 2πr = 2π(6) = 12π. (36π is the area.)',
         "ans = 2*sp.pi*6\n")

    b.spr('GEO', LA, 'E',
          'Angles P and Q are supplementary. If the measure of angle P is 115°, what is the measure, in degrees, of angle Q?',
          '65', [],
          'Supplementary angles add to 180°: 180 − 115 = 65.',
          "ans = 180 - 115\n")

    b.spr('GEO', AV, 'E',
          'A box in the shape of a rectangular prism is 4 feet long, 5 feet wide, and 6 feet tall. What is the volume of the box, in cubic feet?',
          '120', [],
          'Volume = length × width × height = 4 × 5 × 6 = 120.',
          "ans = 4 * 5 * 6\n")

    b.mc('GEO', AV, 'E',
         'A square has a perimeter of 36 meters. What is the area of the square, in square meters?',
         '81', ['36', '9', '144'],
         'Each side is 36/4 = 9 meters, so the area is 9² = 81. (9 is the side length.)',
         "s = sp.Rational(36, 4)\nans = s**2\n")

    b.mc('GEO', RT, 'E',
         'In the right triangle shown, the side lengths are 3, 4, and 5. What is the value of sin θ?' + NOTE,
         '3/5', ['4/5', '3/4', '4/3'],
         'sin θ = opposite/hypotenuse. The side opposite θ has length 3 and the hypotenuse is 5, so sin θ = 3/5. (4/5 is cos θ.)',
         "ans = sp.Rational(3, 5)\n",
         figure={'kind': 'geometry', 'params': {'shape': 'triangle', 'labels': {'horizontal_leg': '4', 'vertical_leg': '3', 'hypotenuse': '5', 'angle': 'θ'}, 'marks': {'right_angle': 'between legs'}}})

    # ── GEO: Medium (7) ──────────────────────────────────────────────
    b.mc('GEO', AV, 'M',
         'A cylinder has a radius of 3 centimeters and a height of 10 centimeters. What is the volume of the cylinder, in cubic centimeters?',
         '90π', ['30π', '60π', '180π'],
         'V = πr²h = π(3²)(10) = 90π. (60π is the curved surface area, 2πrh.)',
         "ans = sp.pi * 3**2 * 10\n")

    b.spr('GEO', LA, 'M',
          'Triangle ABC is similar to triangle DEF, with A corresponding to D, B to E, and C to F. AB = 4, BC = 6, and DE = 10. What is the length of EF?',
          '15', [],
          'The scale factor from ABC to DEF is DE/AB = 10/4 = 2.5, so EF = 2.5 × BC = 2.5 × 6 = 15.',
          "ans = sp.Rational(10, 4) * 6\n")

    b.mc('GEO', CE, 'M',
         'The equation of a circle in the xy-plane is (x − 2)² + (y + 5)² = 49. What are the center and the radius of the circle?',
         'Center (2, −5), radius 7', ['Center (−2, 5), radius 7', 'Center (2, −5), radius 49', 'Center (−2, 5), radius 49'],
         'In (x − h)² + (y − k)² = r², the center is (h, k) and the radius is r. y + 5 = y − (−5), so the center is (2, −5), and r = √49 = 7.',
         "x, y = sp.symbols('x y')\ne = sp.expand((x - 2)**2 + (y + 5)**2 - 49)\nassert e.subs({x: 2 + 7, y: -5}) == 0 and e.subs({x: 2, y: -5}) == -49\nans = None\n",
         custom="assert C[K] == 'Center (2, −5), radius 7' and len(set(C)) == 4\n")

    b.mc('GEO', CI, 'M',
         'A circle has a radius of 9. What is the length of an arc of the circle intercepted by a central angle of 80°?',
         '4π', ['8π', '2π', '18π'],
         'The arc is 80/360 = 2/9 of the circumference 2π(9) = 18π: (2/9)(18π) = 4π.',
         "ans = sp.Rational(80, 360) * 2*sp.pi*9\n")

    b.mc('GEO', RT, 'M',
         'In the right triangle shown, the hypotenuse has length 14 and one acute angle measures 30°. What is the value of x?' + NOTE,
         '7√3', ['7', '14√3', '7√2'],
         'In a 30°-60°-90° triangle the side opposite 30° is half the hypotenuse (7), and the side adjacent to the 30° angle is √3 times that: 7√3. Here x is adjacent to the 30° angle.',
         "ans = 14 * sp.cos(sp.pi/6)\nassert sp.simplify(ans - 7*sp.sqrt(3)) == 0\n",
         figure={'kind': 'geometry', 'params': {'shape': 'triangle', 'labels': {'hypotenuse': '14', 'angle': '30°', 'horizontal_leg': 'x'}, 'marks': {'right_angle': 'between legs'}}})

    b.spr('GEO', LA, 'M',
          'In an isosceles triangle, the two base angles are equal and the vertex angle measures 40°. What is the measure, in degrees, of one base angle?',
          '70', [],
          'The base angles share 180 − 40 = 140 degrees equally: 140/2 = 70.',
          "ans = sp.Rational(180 - 40, 2)\n")

    b.mc('GEO', CI, 'M',
         'A circle has a radius of 10. What is the area of a sector of the circle with a central angle of 72°?',
         '20π', ['10π', '40π', '4π'],
         'The sector is 72/360 = 1/5 of the circle’s area 100π: 100π/5 = 20π. (4π is the arc length.)',
         "ans = sp.Rational(72, 360) * sp.pi * 10**2\n")

    # ── GEO: Hard (3) ────────────────────────────────────────────────
    b.spr('GEO', CE, 'H',
          'The equation x² + y² − 6x + 8y = 0 defines a circle in the xy-plane. What is the radius of the circle?',
          '5', [],
          'Complete the square: (x² − 6x + 9) + (y² + 8y + 16) = 9 + 16, so (x − 3)² + (y + 4)² = 25, and the radius is 5.',
          "x, y = sp.symbols('x y')\nr2 = 3**2 + 4**2\nassert sp.expand((x - 3)**2 + (y + 4)**2 - r2) == x**2 + y**2 - 6*x + 8*y\nans = sp.sqrt(r2)\n")

    b.mc('GEO', AV, 'H',
         'A sphere has a volume of 36π cubic inches. What is the surface area of the sphere, in square inches?',
         '36π', ['9π', '12π', '108π'],
         '(4/3)πr³ = 36π gives r³ = 27, so r = 3. Surface area = 4πr² = 4π(9) = 36π.',
         "r = sp.Symbol('r', positive=True)\nr0 = sp.solve(sp.Rational(4, 3)*sp.pi*r**3 - 36*sp.pi, r)[0]\nans = 4*sp.pi*r0**2\n")

    b.mc('GEO', RT, 'H',
         'In right triangle ABC, angle C is the right angle and sin A = 5/13. What is the value of cos B?',
         '5/13', ['12/13', '12/5', '13/5'],
         'A and B are complementary, so cos B = sin A = 5/13: the side opposite A is the side adjacent to B.',
         "A = sp.asin(sp.Rational(5, 13))\nans = sp.simplify(sp.cos(sp.pi/2 - A))\n")

'use strict';
/**
 * Templates for the 17 Algebra 1 skills the coverage audit showed EMPTY.
 * Algebra 1 has the largest cohort (8 active students), so it goes first.
 *
 * Contract: each entry is { skillId, gradeBand, tiers: [ {difficulty, gen} ] }
 * where gen(rng) returns { prompt, value, explanation, options?, correctOption? }.
 * The answer is always DERIVED from the drawn numbers — see templateKit.
 */

const K = require('./templateKit');
const { int, pick, nonZero, frac, reduce, gcd, coefTerm, signed, largestSquareFactor } = K;

const GB = '9-12';

const TEMPLATES = [
  {
    skillId: 'variable-expressions',
    tiers: [
      { difficulty: 1, gen: (r) => {
        const a = int(r, 2, 9), b = int(r, 1, 20), x = int(r, 2, 9);
        return { prompt: `Evaluate ${coefTerm(a)} + ${b} when x = ${x}.`, value: a * x + b,
          explanation: `Substitute x = ${x}: ${a}(${x}) + ${b} = ${a * x} + ${b} = ${a * x + b}.` };
      } },
      { difficulty: 2, gen: (r) => {
        const a = int(r, 2, 8), b = int(r, 2, 12), x = int(r, -6, -2);
        return { prompt: `Evaluate ${coefTerm(a)} − ${b} when x = ${x}.`, value: a * x - b,
          explanation: `Substitute x = ${x}: ${a}(${x}) − ${b} = ${a * x} − ${b} = ${a * x - b}. Multiplying a positive by a negative gives a negative, so the first term is ${a * x}.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 2, 5), b = int(r, 2, 6), x = int(r, 2, 5), y = int(r, 2, 6);
        return { prompt: `Evaluate ${a}x² + ${b}y when x = ${x} and y = ${y}.`, value: a * x * x + b * y,
          explanation: `Exponents come before multiplication: x² = ${x}² = ${x * x}, so ${a}(${x * x}) = ${a * x * x}. Then ${b}(${y}) = ${b * y}, and ${a * x * x} + ${b * y} = ${a * x * x + b * y}.` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = int(r, 2, 6), b = int(r, 2, 8), c = int(r, 2, 9), x = int(r, 2, 6);
        return { prompt: `Evaluate ${a}(x + ${b}) − ${c} when x = ${x}.`, value: a * (x + b) - c,
          explanation: `Work inside the parentheses first: ${x} + ${b} = ${x + b}. Then ${a}(${x + b}) = ${a * (x + b)}, and subtracting ${c} gives ${a * (x + b) - c}.` };
      } },
    ],
  },

  {
    // Each item DRAWS which property it shows. Previously a whole difficulty
    // tier asked about the same property, so four items in a row had the same
    // answer — a student could pattern-match the option without reading the
    // mathematics. Varying the property is the entire point of the skill.
    skillId: 'algebraic-properties',
    tiers: (() => {
      const OPTIONS = ['Commutative Property', 'Associative Property', 'Distributive Property', 'Identity Property'];
      const forms = {
        commutative: (r) => {
          let a = int(r, 2, 9), b = int(r, 2, 9);
          while (b === a) b = int(r, 2, 9);   // a + a = a + a shows nothing
          return { prompt: `Which property is shown? ${a} + ${b} = ${b} + ${a}`, key: 'Commutative Property',
            why: `The ORDER of the addends changed and nothing else did — that is commutative. Associative would regroup with parentheses instead.` };
        },
        associative: (r) => {
          const a = int(r, 2, 7); let b = int(r, 2, 7), c = int(r, 2, 7);
          while (b === c) c = int(r, 2, 7);
          return { prompt: `Which property is shown? (${a} · ${b}) · ${c} = ${a} · (${b} · ${c})`, key: 'Associative Property',
            why: `The factors stayed in the same order; only the GROUPING moved. Regrouping is associative — commutative would swap their order.` };
        },
        distributive: (r) => {
          const a = int(r, 2, 8); let b = int(r, 2, 9), c = int(r, 2, 9);
          while (c === b) c = int(r, 2, 9);
          return { prompt: `Which property is shown? ${a}(${b} + ${c}) = ${a}·${b} + ${a}·${c}`, key: 'Distributive Property',
            why: `A factor outside a sum was multiplied across each term inside. Notice it changes the NUMBER of multiplications, which regrouping and reordering never do.` };
        },
        identity: (r) => {
          const a = int(r, 2, 20);
          return { prompt: `Which property is shown? ${a} + 0 = ${a}`, key: 'Identity Property',
            why: `Adding 0 leaves the number unchanged — 0 is the additive identity.` };
        },
      };
      const build = (kinds) => (r) => {
        const f = forms[pick(r, kinds)](r);
        return { prompt: f.prompt, value: f.key, options: OPTIONS,
          correctOption: 'ABCD'[OPTIONS.indexOf(f.key)], explanation: f.why };
      };
      return [
        { difficulty: 1, gen: build(['commutative', 'identity']) },
        { difficulty: 2, gen: build(['commutative', 'associative', 'identity']) },
        { difficulty: 3, gen: build(['commutative', 'associative', 'distributive', 'identity']) },
      ];
    })(),
  },

  {
    skillId: 'solving-literal-equations',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = int(r, 2, 9);
        return { prompt: `Solve for x:  ${a}x = y`, value: 'y/' + a,
          explanation: `x is multiplied by ${a}, so divide BOTH sides by ${a}: x = y/${a}. The variable you are solving for must end up alone on one side.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 2, 9), b = int(r, 2, 12);
        return { prompt: `Solve for x:  ${a}x + ${b} = y`, value: `(y − ${b})/${a}`,
          explanation: `Undo in reverse order: subtract ${b} from both sides to get ${a}x = y − ${b}, then divide by ${a}: x = (y − ${b})/${a}. The whole numerator is divided by ${a}, which is why the parentheses matter.` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = int(r, 2, 7);
        return { prompt: `Solve for h:  A = (1/2)b·h`, value: '2A/b',
          explanation: `Multiply both sides by 2 to clear the fraction: 2A = b·h. Then divide by b: h = 2A/b. (The drawn value ${a} is not needed — this is the general formula.)` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = int(r, 2, 9), b = int(r, 2, 9);
        return { prompt: `Solve for y:  ${a}x + ${b}y = c`, value: `(c − ${a}x)/${b}`,
          explanation: `Isolate the y-term first: ${b}y = c − ${a}x. Then divide every part of that side by ${b}: y = (c − ${a}x)/${b}.` };
      } },
    ],
  },

  {
    skillId: 'writing-linear-equations-point-slope',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const m = pick(r, [-5, -4, -3, -2, 2, 3, 4, 5]), x1 = int(r, 1, 8), y1 = int(r, 1, 9);
        return { prompt: `Write an equation in point-slope form for the line through (${x1}, ${y1}) with slope ${m}. Do not simplify.`,
          value: `y − ${y1} = ${m}(x − ${x1})`,
          explanation: `Point-slope form is y − y₁ = m(x − x₁). With m = ${m} and (x₁, y₁) = (${x1}, ${y1}) that is y − ${y1} = ${m}(x − ${x1}).` };
      } },
      { difficulty: 3, gen: (r) => {
        const m = pick(r, [-6, -5, -4, -3, -2, 2, 3, 4, 5, 6]), x1 = int(r, -8, -1), y1 = int(r, 2, 9);
        return { prompt: `Write an equation in point-slope form for the line through (${x1}, ${y1}) with slope ${m}. Do not simplify.`,
          value: `y − ${y1} = ${m}(x + ${Math.abs(x1)})`,
          explanation: `Point-slope is y − y₁ = m(x − x₁). Here x₁ = ${x1}, and subtracting a negative becomes addition: x − (${x1}) = x + ${Math.abs(x1)}. So y − ${y1} = ${m}(x + ${Math.abs(x1)}).` };
      } },
      { difficulty: 4, gen: (r) => {
        const x1 = int(r, 1, 5), y1 = int(r, 1, 6), dx = int(r, 2, 4);
        let dy = nonZero(r, -6, 6);
        while (Math.abs(dy) === dx) dy = nonZero(r, -6, 6);
        const x2 = x1 + dx, y2 = y1 + dy;
        const [n, d] = reduce(dy, dx);
        const m = d === 1 ? String(n) : `${n}/${d}`;
        return { prompt: `Write an equation in point-slope form for the line through (${x1}, ${y1}) and (${x2}, ${y2}). Use the first point. Do not simplify.`,
          value: `y − ${y1} = ${m}(x − ${x1})`,
          explanation: `First find the slope: m = (${y2} − ${y1})/(${x2} − ${x1}) = ${dy}/${dx} = ${m}. Then substitute that slope and the point (${x1}, ${y1}) into y − y₁ = m(x − x₁).` };
      } },
    ],
  },

  {
    skillId: 'graphing-linear-inequalities',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const m = nonZero(r, 1, 4), b = int(r, 1, 9);
        const strict = pick(r, [true, false]);
        return { prompt: `When graphing y ${strict ? '>' : '≥'} ${coefTerm(m)} + ${b}, is the boundary line solid or dashed?`,
          value: strict ? 'Dashed' : 'Solid',
          options: ['Solid', 'Dashed', 'Either one', 'No boundary line'],
          correctOption: strict ? 'B' : 'A',
          explanation: strict
            ? `The symbol is > with no "or equal to", so points ON the line are NOT solutions — that is shown with a dashed line.`
            : `The symbol is ≥, which includes equality, so points ON the line ARE solutions — that is shown with a solid line.` };
      } },
      { difficulty: 3, gen: (r) => {
        const m = nonZero(r, 1, 4), b = int(r, 1, 8), px = int(r, 1, 5), py = int(r, 1, 20);
        const holds = py > m * px + b;
        return { prompt: `Is the point (${px}, ${py}) a solution of y > ${coefTerm(m)} + ${b}?`,
          value: holds ? 'Yes' : 'No',
          options: ['Yes', 'No', 'Only if the line is solid', 'Cannot be determined'],
          correctOption: holds ? 'A' : 'B',
          explanation: `Substitute: is ${py} > ${m}(${px}) + ${b} = ${m * px + b}? ${holds ? `Yes, ${py} > ${m * px + b}, so the point is a solution and lies in the shaded region.` : `No — ${py} is not greater than ${m * px + b}, so the point lies outside the shaded region.`}` };
      } },
      { difficulty: 4, gen: (r) => {
        // Draw the DIRECTION too — always asking about "<" made every item in
        // this tier answer "Below", which a student can pick without reading.
        const m = nonZero(r, 1, 3), b = int(r, 1, 6);
        const less = pick(r, [true, false]);
        const sym = pick(r, less ? ['<', '\u2264'] : ['>', '\u2265']);
        return { prompt: `For y ${sym} ${coefTerm(m)} + ${b}, do you shade above or below the boundary line?`,
          value: less ? 'Below' : 'Above',
          options: ['Above', 'Below', 'To the right', 'To the left'],
          correctOption: less ? 'B' : 'A',
          explanation: `The inequality is solved for y and reads "y is ${less ? 'LESS' : 'GREATER'} than", so the solutions sit ${less ? 'below' : 'above'} the line. Testing (0, 0) confirms it whenever the origin is not on the line.` };
      } },
    ],
  },

  {
    skillId: 'systems-word-problems',
    tiers: [
      { difficulty: 3, gen: (r) => {
        const adult = int(r, 6, 12), child = int(r, 3, 5);
        const na = int(r, 3, 9), nc = int(r, 3, 9);
        const total = na + nc, money = adult * na + child * nc;
        return { prompt: `Adult tickets cost $${adult} and child tickets cost $${child}. A group bought ${total} tickets for $${money}. How many ADULT tickets did they buy?`,
          value: na,
          explanation: `Let a = adult and c = child tickets. Then a + c = ${total} and ${adult}a + ${child}c = ${money}. Substituting c = ${total} − a gives ${adult}a + ${child}(${total} − a) = ${money}, so ${adult - child}a = ${money - child * total} and a = ${na}.` };
      } },
      { difficulty: 4, gen: (r) => {
        // The larger number must actually BE larger: draw y below x so the
        // stated difference is positive. A negative or zero difference made
        // the question either wrong (the answer was the SMALLER number) or
        // meaningless (equal numbers have no larger one).
        const y = int(r, 3, 12);
        const x = y + int(r, 2, 9);
        const sum = x + y, diff = x - y;
        return { prompt: `The sum of two numbers is ${sum} and their difference is ${diff}. What is the LARGER number?`,
          value: x,
          explanation: `Let the numbers be x and y with x + y = ${sum} and x − y = ${diff}. Adding the two equations eliminates y: 2x = ${sum + diff}, so x = ${x}. (Then y = ${y}, and ${x} is indeed the larger.)` };
      } },
      { difficulty: 4, gen: (r) => {
        const cost = int(r, 2, 6), price = int(r, 7, 14), fixed = int(r, 20, 80);
        const units = fixed / (price - cost);
        const safeFixed = Math.round(units) * (price - cost);
        return { prompt: `A shop pays $${fixed >= 0 ? safeFixed : fixed} in fixed costs plus $${cost} per item, and sells each item for $${price}. How many items must it sell to break even?`,
          value: safeFixed / (price - cost),
          explanation: `Break-even means revenue = cost: ${price}n = ${safeFixed} + ${cost}n. Subtracting ${cost}n gives ${price - cost}n = ${safeFixed}, so n = ${safeFixed / (price - cost)}. The per-item PROFIT is $${price - cost}, which is what pays down the fixed cost.` };
      } },
    ],
  },

  {
    // Every tier now draws a DIFFERENT polynomial shape, so the answer varies
    // item to item. Before, "degree" items were always degree 3 and "classify"
    // items were always a quadratic trinomial — the answer never moved, so a
    // student could pick the right option without reading the mathematics.
    skillId: 'polynomial-classification',
    tiers: (() => {
      const TERMS = ['Monomial', 'Binomial', 'Trinomial'];
      const DEGREES = ['1', '2', '3', '4'];
      const SUP = { 1: '', 2: '\u00b2', 3: '\u00b3', 4: '\u2074' };
      const shape = (r) => {
        const kind = pick(r, ['mono', 'bi', 'tri']);
        const deg = int(r, 1, 4);
        const lead = int(r, 2, 9);
        const head = `${lead}x${SUP[deg]}`;
        if (kind === 'mono') return { expr: head, terms: 'Monomial', deg };
        if (kind === 'bi') return { expr: `${head} + ${int(r, 1, 9)}`, terms: 'Binomial', deg };
        return { expr: `${head} + ${int(r, 2, 8)}x + ${int(r, 1, 9)}`, terms: 'Trinomial', deg };
      };
      const NAMES = { 1: 'Linear', 2: 'Quadratic', 3: 'Cubic', 4: 'Quartic' };
      return [
        { difficulty: 1, gen: (r) => {
          const sh = shape(r);
          const opts = TERMS.concat(['Polynomial with 4 terms']);
          const n = TERMS.indexOf(sh.terms) + 1;
          return { prompt: `Classify by number of terms: ${sh.expr}`, value: sh.terms,
            options: opts, correctOption: 'ABCD'[opts.indexOf(sh.terms)],
            explanation: `Count the parts separated by + or \u2212: ${sh.expr} has ${n} term${n === 1 ? '' : 's'}, which makes it a ${sh.terms.toLowerCase()}.` };
        } },
        { difficulty: 2, gen: (r) => {
          const sh = shape(r);
          return { prompt: `What is the DEGREE of ${sh.expr}?`, value: String(sh.deg),
            options: DEGREES, correctOption: 'ABCD'[DEGREES.indexOf(String(sh.deg))],
            explanation: `The degree is the LARGEST exponent on the variable. In ${sh.expr} that is ${sh.deg}. Adding the exponents together instead is the usual mistake.` };
        } },
        { difficulty: 3, gen: (r) => {
          const sh = shape(r);
          const answer = `${NAMES[sh.deg]} ${sh.terms.toLowerCase()}`;
          const otherDeg = sh.deg === 1 ? 2 : sh.deg - 1;
          const otherTerms = sh.terms === 'Binomial' ? 'trinomial' : 'binomial';
          const opts = [...new Set([
            answer,
            `${NAMES[otherDeg]} ${sh.terms.toLowerCase()}`,
            `${NAMES[sh.deg]} ${otherTerms}`,
            `${NAMES[sh.deg === 4 ? 1 : sh.deg + 1]} ${otherTerms}`,
          ])];
          while (opts.length < 4) opts.push(`${NAMES[opts.length]} monomial`);
          const n = TERMS.indexOf(sh.terms) + 1;
          return { prompt: `Classify ${sh.expr} by degree AND number of terms.`, value: answer,
            options: opts.slice(0, 4), correctOption: 'ABCD'[opts.indexOf(answer)],
            explanation: `The highest exponent is ${sh.deg}, so it is ${NAMES[sh.deg].toLowerCase()}; it has ${n} term${n === 1 ? '' : 's'}, so it is a ${sh.terms.toLowerCase()}. Together: a ${answer.toLowerCase()}.` };
        } },
      ];
    })(),
  },

  {
    skillId: 'polynomial-multiplication',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = int(r, 2, 6), b = int(r, 2, 9), c = int(r, 2, 7);
        return { prompt: `Multiply: ${a}x(${b}x + ${c})`, value: `${a * b}x^2 + ${a * c}x`,
          explanation: `Distribute ${a}x to each term: ${a}x·${b}x = ${a * b}x², and ${a}x·${c} = ${a * c}x. Exponents ADD when like bases multiply, which is why x·x becomes x².` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 1, 8), b = int(r, 1, 8);
        return { prompt: `Multiply: (x + ${a})(x + ${b})`, value: `x^2 + ${a + b}x + ${a * b}`,
          explanation: `FOIL: x·x = x², the outer and inner terms give ${b}x + ${a}x = ${a + b}x, and ${a}·${b} = ${a * b}. So the product is x² + ${a + b}x + ${a * b}.` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = int(r, 1, 7), b = int(r, 1, 7);
        const mid = b - a;
        // Write the middle term the way a person would. "+ 0x" and "− 1x" are
        // not wrong so much as not ENGLISH — and a student who correctly types
        // "x^2 - 9" or "x^2 - x - 12" would have been marked wrong against them.
        const midStr = mid === 0 ? '' : (mid === 1 ? ' + x' : (mid === -1 ? ' − x' : (mid > 0 ? ` + ${mid}x` : ` − ${Math.abs(mid)}x`)));
        const value = `x^2${midStr} − ${a * b}`;
        return { prompt: `Multiply: (x − ${a})(x + ${b})`, value,
          explanation: mid === 0
            ? `FOIL: x² + ${b}x − ${a}x − ${a * b}. The middle terms cancel exactly (${b}x − ${a}x = 0), leaving x² − ${a * b} — the difference of squares pattern.`
            : `FOIL: x² + ${b}x − ${a}x − ${a * b}. Combining the middle terms gives ${mid === 1 ? 'x' : mid === -1 ? '−x' : `${mid}x`}, so the product is ${value.replace('^2', '²')}. The last term is negative because a negative times a positive is negative.` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = int(r, 2, 6);
        return { prompt: `Multiply: (x + ${a})²`, value: `x^2 + ${2 * a}x + ${a * a}`,
          explanation: `Squaring means (x + ${a})(x + ${a}), so FOIL gives x² + ${a}x + ${a}x + ${a * a} = x² + ${2 * a}x + ${a * a}. It is NOT x² + ${a * a} — the middle term is what squaring a binomial adds.` };
      } },
    ],
  },

  {
    skillId: 'discriminant',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = 1, b = int(r, 2, 9), c = int(r, 1, 9);
        const D = b * b - 4 * a * c;
        return { prompt: `Find the discriminant of x² + ${b}x + ${c} = 0.`, value: D,
          explanation: `The discriminant is b² − 4ac with a = 1, b = ${b}, c = ${c}: ${b}² − 4(1)(${c}) = ${b * b} − ${4 * c} = ${D}.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 1, 3), b = int(r, 2, 8), c = int(r, 1, 5);
        const D = b * b - 4 * a * c;
        const answer = D > 0 ? 'Two real solutions' : (D === 0 ? 'One real solution' : 'No real solutions');
        return { prompt: `How many REAL solutions does ${a === 1 ? '' : a}x² + ${b}x + ${c} = 0 have?`,
          value: answer,
          options: ['Two real solutions', 'One real solution', 'No real solutions', 'Infinitely many'],
          correctOption: D > 0 ? 'A' : (D === 0 ? 'B' : 'C'),
          explanation: `The discriminant is ${b}² − 4(${a})(${c}) = ${D}. ${D > 0 ? 'A positive discriminant means the parabola crosses the x-axis twice, so there are two real solutions.' : D === 0 ? 'A discriminant of exactly 0 means the vertex sits on the x-axis: one repeated real solution.' : 'A negative discriminant means the parabola never reaches the x-axis, so there are no real solutions.'}` };
      } },
      { difficulty: 4, gen: (r) => {
        // Draw all three cases. Previously this tier only ever built perfect
        // squares, so every item answered "0, one real solution".
        const a = int(r, 1, 3);
        const kind = pick(r, ['zero', 'positive', 'negative']);
        let b, c;
        if (kind === 'zero') { const k = int(r, 2, 6); c = k * k * a; b = 2 * k * a; }
        else if (kind === 'positive') { b = int(r, 5, 9); c = int(r, 1, 3); }
        else { b = int(r, 2, 4); c = int(r, 4, 8); }
        const D = b * b - 4 * a * c;
        const label = D > 0 ? 'two real solutions' : (D === 0 ? 'one real solution' : 'no real solutions');
        return { prompt: `Find the discriminant of ${a === 1 ? '' : a}x² + ${b}x + ${c} = 0, then state what it tells you.`,
          value: `${D}, ${label}`,
          explanation: `b² − 4ac = ${b}² − 4(${a})(${c}) = ${b * b} − ${4 * a * c} = ${D}. ${D > 0 ? 'A positive discriminant means the parabola crosses the x-axis twice.' : D === 0 ? 'A discriminant of 0 means the quadratic is a perfect square with exactly one (repeated) real solution.' : 'A negative discriminant means the parabola never reaches the x-axis, so there are no real solutions.'}` };
      } },
    ],
  },

  {
    skillId: 'measures-of-central-tendency',
    tiers: [
      { difficulty: 1, gen: (r) => {
        const n = 5;
        const vals = Array.from({ length: n }, () => int(r, 2, 20));
        const sum = vals.reduce((s, v) => s + v, 0);
        const mean = sum / n;
        const nice = Number.isInteger(mean) ? mean : Math.round(mean * 100) / 100;
        return { prompt: `Find the mean of: ${vals.join(', ')}`, value: nice,
          explanation: `Add the values: ${vals.join(' + ')} = ${sum}. Divide by how many there are (${n}): ${sum}/${n} = ${nice}.` };
      } },
      { difficulty: 2, gen: (r) => {
        const vals = Array.from({ length: 5 }, () => int(r, 1, 30));
        const sorted = [...vals].sort((a, b) => a - b);
        return { prompt: `Find the median of: ${vals.join(', ')}`, value: sorted[2],
          explanation: `Order them first: ${sorted.join(', ')}. With 5 values the median is the middle one, ${sorted[2]}. Forgetting to sort is the usual mistake.` };
      } },
      { difficulty: 3, gen: (r) => {
        // The three "other" values must be DISTINCT from each other, or a
        // second value can also repeat and the item becomes bimodal — an
        // ambiguous question with one answer marked correct.
        const base = int(r, 2, 15);
        const others = [];
        while (others.length < 3) {
          const v = int(r, 16, 30);
          if (!others.includes(v)) others.push(v);
        }
        const vals = [base, base, ...others];
        const sorted = [...vals].sort((a, b) => a - b);
        return { prompt: `Find the mode of: ${vals.join(', ')}`, value: base,
          explanation: `The mode is the value that appears most often. Here ${base} appears twice and every other value appears once, so the mode is ${base}. (Sorted: ${sorted.join(', ')}.)` };
      } },
      { difficulty: 4, gen: (r) => {
        const vals = Array.from({ length: 4 }, () => int(r, 5, 25));
        const sorted = [...vals].sort((a, b) => a - b);
        const med = (sorted[1] + sorted[2]) / 2;
        return { prompt: `Find the median of: ${vals.join(', ')}`, value: med,
          explanation: `Order them: ${sorted.join(', ')}. With an EVEN count there is no single middle value, so average the two middle ones: (${sorted[1]} + ${sorted[2]})/2 = ${med}.` };
      } },
    ],
  },

  {
    // One tier per correlation type meant every item in a tier had the same
    // answer. Each item now draws its own relationship.
    skillId: 'scatter-plots-correlation',
    tiers: (() => {
      const OPTS = ['Positive', 'Negative', 'No correlation', 'Causation'];
      const POS = [['hours studied', 'test score'], ['hours of practice', 'free throws made'], ['months of training', 'race speed']];
      const NEG = [['hours of TV watched', 'test score'], ['the age of a car', 'its resale value'], ['number of absences', 'final grade']];
      const NONE = [['shoe size', 'math test score'], ['house number', 'height'], ['birth month', 'running speed']];
      const draw = (r) => {
        const kind = pick(r, ['pos', 'neg', 'none']);
        if (kind === 'pos') { const c = pick(r, POS); return { prompt: `As ${c[0]} increases, ${c[1]} also increases. What type of correlation is this?`, key: 'Positive', why: `Both quantities move in the SAME direction, so the correlation is positive — the points trend upward from left to right.` }; }
        if (kind === 'neg') { const c = pick(r, NEG); return { prompt: `As ${c[0]} increases, ${c[1]} decreases. What type of correlation is this?`, key: 'Negative', why: `The quantities move in OPPOSITE directions, so the correlation is negative — the points trend downward from left to right.` }; }
        const c = pick(r, NONE);
        return { prompt: `A scatter plot of ${c[0]} versus ${c[1]} shows points scattered with no pattern. What does this indicate?`, key: 'No correlation', why: `No visible trend means no correlation — knowing one value tells you nothing useful about the other.` };
      };
      const build = (r) => { const d = draw(r); return { prompt: d.prompt, value: d.key, options: OPTS, correctOption: 'ABCD'[OPTS.indexOf(d.key)], explanation: d.why }; };
      return [
        { difficulty: 1, gen: build },
        { difficulty: 2, gen: build },
        { difficulty: 3, gen: build },
        { difficulty: 4, gen: () => ({
          prompt: `Ice cream sales and drowning incidents both rise in the same months. Does this prove ice cream causes drownings?`,
          value: 'No — correlation does not imply causation',
          options: ['Yes, the correlation proves it', 'No — correlation does not imply causation', 'Yes, if the correlation is strong enough', 'Only if the data set is large'],
          correctOption: 'B',
          explanation: `Both rise because of a third factor — hot weather. A correlation shows two things move together; it never establishes that one CAUSES the other.` }) },
      ];
    })(),
  },

  {
    skillId: 'intro-probability',
    tiers: [
      { difficulty: 1, gen: (r) => {
        const total = int(r, 6, 12), want = int(r, 2, 5);
        return { prompt: `A bag holds ${total} marbles, ${want} of which are red. What is the probability of drawing a red marble? Give your answer as a fraction in lowest terms.`,
          value: frac(want, total),
          explanation: `Probability = favorable outcomes / total outcomes = ${want}/${total}${frac(want, total) !== `${want}/${total}` ? `, which reduces to ${frac(want, total)}` : ''}.` };
      } },
      { difficulty: 2, gen: (r) => {
        const sides = 6, target = int(r, 1, 5);
        return { prompt: `A fair six-sided die is rolled. What is the probability of rolling a number greater than ${target}? Give your answer as a fraction in lowest terms.`,
          value: frac(sides - target, sides),
          explanation: `The outcomes greater than ${target} are ${sides - target === 0 ? 'none' : Array.from({ length: sides - target }, (_, i) => target + 1 + i).join(', ')} — that is ${sides - target} of ${sides} equally likely outcomes, so the probability is ${frac(sides - target, sides)}.` };
      } },
      { difficulty: 3, gen: (r) => {
        const total = int(r, 8, 15), want = int(r, 2, 6);
        return { prompt: `A bag holds ${total} marbles, ${want} of which are blue. What is the probability of NOT drawing a blue marble? Give your answer as a fraction in lowest terms.`,
          value: frac(total - want, total),
          explanation: `The complement rule: P(not blue) = 1 − P(blue) = 1 − ${want}/${total} = ${total - want}/${total}${frac(total - want, total) !== `${total - want}/${total}` ? ` = ${frac(total - want, total)}` : ''}.` };
      } },
    ],
  },

  {
    skillId: 'comparing-linear-exponential',
    tiers: [
      { difficulty: 2, gen: (r, idx) => {
        // Swap which letter is the exponential one — otherwise the answer is
        // always "Function B" and the item tests reading order, not concept.
        const b = int(r, 2, 4), m = int(r, 5, 20);
        // Cycle on the item index: a random flip can legitimately land the
        // same way four times, which is how this tier shipped all-"Function B".
        const bFirst = idx % 2 === 0;
        const A = bFirst ? `multiplying by ${b}` : `adding ${m}`;
        const B = bFirst ? `adding ${m}` : `multiplying by ${b}`;
        const ans = bFirst ? 'Function A' : 'Function B';
        return { prompt: `Function A grows by ${A} each step. Function B grows by ${B} each step. Which is exponential?`,
          value: ans, options: ['Function A', 'Function B', 'Both', 'Neither'], correctOption: bFirst ? 'A' : 'B',
          explanation: `Adding the same amount each step is a CONSTANT RATE of change — that is linear. Multiplying by the same factor each step is a constant RATIO, which is exponential. Here ${ans.toLowerCase()} multiplies, so it is the exponential one.` };
      } },
      { difficulty: 3, gen: (r) => {
        const start = int(r, 2, 5), b = int(r, 2, 3), steps = int(r, 3, 5);
        const vals = [start];
        for (let i = 0; i < steps; i++) vals.push(vals[vals.length - 1] * b);
        return { prompt: `A sequence begins ${vals.slice(0, 4).join(', ')}. What is the next term?`,
          value: vals[4] !== undefined ? vals[4] : vals[3] * b,
          explanation: `Each term is ${b} times the one before (${vals[0]}·${b} = ${vals[1]}, ${vals[1]}·${b} = ${vals[2]}), so this is exponential with ratio ${b}. The next term is ${vals[3]}·${b} = ${vals[3] * b}.` };
      } },
      { difficulty: 4, gen: () => ({
        prompt: `A linear function increases by 100 per year. An exponential function doubles each year, starting at 1. Over a long enough time, which grows larger?`,
        value: 'The exponential function',
        options: ['The linear function', 'The exponential function', 'They stay equal', 'It depends on the starting values'],
        correctOption: 'B',
        explanation: `An exponential function eventually outgrows ANY linear function, no matter how small it starts or how steep the line is. Early on the line can be far ahead, which is what makes this counter-intuitive.` }) },
    ],
  },

  {
    skillId: 'multiplying-dividing-rationals',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = int(r, 2, 6), b = int(r, 2, 6);
        return { prompt: `Multiply and simplify:  (x/${a}) · (${b}/x)`, value: frac(b, a),
          explanation: `Multiply numerators and denominators: (x·${b})/(${a}·x). The x cancels, leaving ${b}/${a}${frac(b, a) !== `${b}/${a}` ? ` = ${frac(b, a)}` : ''}.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 2, 5), b = int(r, 2, 5);
        return { prompt: `Multiply and simplify:  (${a}x/${b}) · (${b}/x²)`, value: `${a}/x`,
          explanation: `Multiply straight across: (${a}x·${b})/(${b}·x²). The ${b}s cancel and one x cancels from x², leaving ${a}/x.` };
      } },
      { difficulty: 4, gen: (r) => {
        const a = int(r, 2, 6), b = int(r, 2, 6);
        return { prompt: `Divide and simplify:  (x/${a}) ÷ (x/${b})`, value: frac(b, a),
          explanation: `Dividing by a fraction means multiplying by its reciprocal: (x/${a})·(${b}/x). The x's cancel, leaving ${b}/${a}${frac(b, a) !== `${b}/${a}` ? ` = ${frac(b, a)}` : ''}. Flipping the WRONG fraction is the usual error.` };
      } },
    ],
  },

  {
    skillId: 'solving-rational-equations',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = int(r, 2, 9), b = int(r, 2, 9);
        return { prompt: `Solve for x:  ${a}/x = ${b}`, value: frac(a, b),
          explanation: `Multiply both sides by x: ${a} = ${b}x. Then divide by ${b}: x = ${a}/${b}${frac(a, b) !== `${a}/${b}` ? ` = ${frac(a, b)}` : ''}. Check x ≠ 0, which it is not.` };
      } },
      { difficulty: 3, gen: (r) => {
        const k = int(r, 2, 8), c = int(r, 2, 6);
        const x = k * c;
        return { prompt: `Solve for x:  x/${k} = ${c}`, value: x,
          explanation: `Multiply both sides by ${k}: x = ${k}·${c} = ${x}.` };
      } },
      { difficulty: 4, gen: (r) => {
        // A real proportion rather than the old a/x + a/x shape, which looked
        // like a rational equation but collapsed to "match the denominators".
        const b = int(r, 2, 6), k = int(r, 2, 5);
        const a = b * k, c = int(r, 2, 7);
        return { prompt: `Solve for x:  ${a}/x = ${c}/${b}`, value: frac(a * b, c * b) === frac(a, c) ? frac(a, c) : frac(a * b, c * b),
          explanation: `Cross-multiply: ${a}·${b} = ${c}·x, so ${a * b} = ${c}x and x = ${a * b}/${c}${frac(a * b, c) !== `${a * b}/${c}` ? ` = ${frac(a * b, c)}` : ''}. Check that x ≠ 0 so no denominator vanishes.` };
      } },
    ],
  },

  {
    skillId: 'simplifying-radicals',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const k = int(r, 2, 9);
        const n = k * k;
        return { prompt: `Simplify: √${n}`, value: k,
          explanation: `${n} is a perfect square: ${k}² = ${n}, so √${n} = ${k}.` };
      } },
      { difficulty: 3, gen: (r) => {
        const sq = pick(r, [4, 9, 16, 25]);
        const rest = pick(r, [2, 3, 5, 6, 7]);
        const n = sq * rest;
        const outside = Math.sqrt(sq);
        return { prompt: `Simplify: √${n}`, value: `${outside}√${rest}`,
          explanation: `Factor out the largest perfect square: ${n} = ${sq}·${rest}, so √${n} = √${sq}·√${rest} = ${outside}√${rest}.` };
      } },
      { difficulty: 4, gen: (r) => {
        const c = int(r, 2, 5);
        const sq = pick(r, [4, 9, 16]);
        const rest = pick(r, [2, 3, 5]);
        const n = sq * rest;
        const outside = c * Math.sqrt(sq);
        return { prompt: `Simplify: ${c}√${n}`, value: `${outside}√${rest}`,
          explanation: `First simplify √${n} = √${sq}·√${rest} = ${Math.sqrt(sq)}√${rest}. Then multiply by the ${c} already outside: ${c}·${Math.sqrt(sq)} = ${outside}, giving ${outside}√${rest}.` };
      } },
    ],
  },

  {
    skillId: 'operations-with-radicals',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = int(r, 2, 8), b = int(r, 2, 8);
        const rad = pick(r, [2, 3, 5, 7]);
        return { prompt: `Simplify: ${a}√${rad} + ${b}√${rad}`, value: `${a + b}√${rad}`,
          explanation: `The radical parts match, so add the coefficients exactly as you would with like terms: ${a} + ${b} = ${a + b}, giving ${a + b}√${rad}. The radicand never changes.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 3, 9), b = int(r, 1, 2);
        const rad = pick(r, [2, 3, 5]);
        return { prompt: `Simplify: ${a}√${rad} − ${b}√${rad}`, value: `${a - b}√${rad}`,
          explanation: `Like radicals subtract like terms: ${a} − ${b} = ${a - b}, so the result is ${a - b}√${rad}.` };
      } },
      { difficulty: 4, gen: (r) => {
        const p = pick(r, [2, 3, 5]), q = pick(r, [2, 3, 7]);
        const prod = p * q;
        const sq = largestSquareFactor(prod);
        const value = sq > 1 ? `${Math.sqrt(sq)}√${prod / sq}` : `√${prod}`;
        return { prompt: `Simplify: √${p} · √${q}`, value,
          explanation: `Multiply under one radical: √${p}·√${q} = √${prod}.${sq > 1 ? ` Then ${prod} = ${sq}·${prod / sq}, so √${prod} = ${Math.sqrt(sq)}√${prod / sq}.` : ' It has no perfect-square factor, so it is already simplified.'}` };
      } },
    ],
  },
];

module.exports = { TEMPLATES, GB };

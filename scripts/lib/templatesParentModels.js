'use strict';
/**
 * The parent-course model skills: the visual and strategy models schools
 * teach now (ten frames, bar models, area models, algebra tiles, chip
 * model...) that the parent guides exist to explain. Nothing in the bank
 * touches these under any name — the models ARE the content.
 *
 * Every item exercises the MODEL itself with a computable answer: reading a
 * ten frame, completing a decomposition, finding the unknown part of a bar
 * model, naming the partial products an area model draws. Items are written
 * so they work for the parent learning the model and the child using it.
 *
 * mental-math-strategies is authored here (unprefixed id) and the early-math
 * course reaches it through the emf-mental-math-strategies crosswalk row —
 * one reviewed family serving both courses.
 *
 * Answers are computed from the drawn numbers — see templateKit.
 */

const K = require('./templateKit');
const { int, pick } = K;

const GB = 'K-8';

const TEMPLATES = [
  // ── K-2 models ───────────────────────────────────────────────────────────
  {
    skillId: 'decomposing-numbers',
    tiers: [
      { difficulty: 1, gen: (r) => {
        const whole = int(r, 5, 10), part = int(r, 1, whole - 1);
        return { prompt: `Decompose ${whole}: ${whole} = ${part} + ?`,
          value: whole - part,
          explanation: `${whole} breaks apart into ${part} and ${whole - part}, because ${part} + ${whole - part} = ${whole}. Number bonds like this are the foundation for addition facts and making ten.` };
      } },
      { difficulty: 2, gen: (r) => {
        const whole = int(r, 11, 19);
        return { prompt: `Decompose ${whole} into a ten and ones: ${whole} = 10 + ?`,
          value: whole - 10,
          explanation: `Teen numbers are a ten and some ones: ${whole} = 10 + ${whole - 10}. Seeing the ten inside every teen number is the doorway to place value.` };
      } },
    ],
  },

  {
    skillId: 'ten-frames',
    tiers: [
      { difficulty: 1, gen: (r, made) => {
        const filled = int(r, 3, 9);
        if (made % 2 === 0) {
          return { prompt: `A ten frame has ${filled} counters in it. How many empty boxes are there?`,
            value: 10 - filled,
            explanation: `A ten frame always holds 10 boxes, so ${filled} filled leaves 10 − ${filled} = ${10 - filled} empty. The frame makes "how far from ten" visible at a glance — no counting one by one.` };
        }
        return { prompt: `A ten frame shows a full top row (5) and ${filled - 5 > 0 ? filled - 5 : 1} more in the bottom row. How many counters in all?`,
          value: filled - 5 > 0 ? filled : 6,
          explanation: `A full top row is 5, so count on: 5 + ${filled - 5 > 0 ? filled - 5 : 1} = ${filled - 5 > 0 ? filled : 6}. Ten frames build "5 and some more" thinking — subitizing instead of one-by-one counting.` };
      } },
      { difficulty: 2, gen: (r) => {
        const a = int(r, 6, 9), b = int(r, 3, 9);
        return { prompt: `Two ten frames: one shows ${a}, the other shows ${b}. To add them by filling the first frame to ten, how many counters move over?`,
          value: 10 - a,
          explanation: `The first frame needs ${10 - a} more to reach ten, so move ${10 - a} from the second frame. Then the sum reads as 10 + ${b - (10 - a)} = ${a + b} — the frames make the make-a-ten strategy physical.` };
      } },
    ],
  },

  {
    skillId: 'making-ten-strategy',
    tiers: [
      { difficulty: 1, gen: (r) => {
        const a = int(r, 6, 9);
        return { prompt: `What number makes ten with ${a}?`,
          value: 10 - a,
          explanation: `${a} + ${10 - a} = 10. The pairs that make ten (9+1, 8+2, 7+3, 6+4, 5+5) are worth knowing instantly — every mental-math strategy builds on them.` };
      } },
      { difficulty: 2, gen: (r) => {
        const a = int(r, 6, 9), b = int(r, 4, 9);
        const bridge = 10 - a;
        return { prompt: `Compute ${a} + ${b} by making ten: ${a} + ${bridge} + ? = ${a + b}. What goes in the blank?`,
          value: b - bridge,
          explanation: `Split ${b} into ${bridge} + ${b - bridge}: the ${bridge} fills ${a} up to ten, leaving ${b - bridge} more. So ${a} + ${b} = 10 + ${b - bridge} = ${a + b} — adding through ten instead of counting on.` };
      } },
    ],
  },

  {
    skillId: 'mental-math-strategies',
    tiers: [
      { difficulty: 2, gen: (r, made) => {
        if (made % 2 === 0) {
          const a = int(r, 3, 8);
          return { prompt: `Use doubles: ${a} + ${a + 1} = ? (Hint: it is a doubles-plus-one fact.)`,
            value: 2 * a + 1,
            explanation: `Near-doubles lean on a known double: ${a} + ${a} = ${2 * a}, and one more makes ${2 * a + 1}. Anchoring to doubles beats counting on by ${a + 1}.` };
        }
        const a = int(r, 5, 9), b = 9;
        return { prompt: `Compute ${a} + 9 by compensation: add 10, then adjust. What is the answer?`,
          value: a + 9,
          explanation: `Adding 9 the easy way: ${a} + 10 = ${a + 10}, then take 1 back: ${a + 10} − 1 = ${a + b}. Compensation trades a hard fact for an easy one plus a small fix.` };
      } },
      { difficulty: 3, gen: (r, made) => {
        if (made % 2 === 0) {
          const a = int(r, 30, 60), b = pick(r, [19, 29, 39]);
          return { prompt: `Compute ${a} + ${b} mentally by adding ${b + 1} and adjusting. What is the sum?`,
            value: a + b,
            explanation: `${b} is one less than ${b + 1}: add ${a} + ${b + 1} = ${a + b + 1}, then subtract the extra 1 to get ${a + b}. Rounding to a friendly number, then compensating, is the workhorse of mental addition.` };
        }
        const a = pick(r, [4, 8]), b = int(r, 12, 25);
        return { prompt: `Compute ${a} × ${b} mentally by doubling: ${a === 4 ? 'double, then double again' : 'double three times'}. What is the product?`,
          value: a * b,
          explanation: `×${a} is ${a === 4 ? 'two doublings' : 'three doublings'}: ${b} → ${2 * b}${a === 8 ? ` → ${4 * b}` : ''} → ${a * b}. Doubling is the multiplication a mind does most easily.` };
      } },
    ],
  },

  {
    skillId: 'bar-models',
    tiers: [
      { difficulty: 1, gen: (r) => {
        const whole = int(r, 9, 18), part = int(r, 3, whole - 3);
        return { prompt: `A bar model shows a whole of ${whole} split into two parts. One part is ${part}. What is the other part?`,
          value: whole - part,
          explanation: `Part + part = whole: ? = ${whole} − ${part} = ${whole - part}. The bar makes the relationship visible — the unknown is literally the missing piece of the picture.` };
      } },
      { difficulty: 2, gen: (r) => {
        const unit = int(r, 3, 8), times = pick(r, [3, 4]);
        return { prompt: `A comparison bar model shows Maya has ${times} equal boxes and Sam has 1 box of the same size. Together they have ${unit * (times + 1)}. How much does Sam have?`,
          value: unit,
          explanation: `The model shows ${times + 1} equal boxes making ${unit * (times + 1)}, so one box is ${unit * (times + 1)} ÷ ${times + 1} = ${unit}. Sam has one box: ${unit}. (Maya has ${times * unit}.) Bar models turn "times as many" words into countable boxes.` };
      } },
    ],
  },

  {
    skillId: 'number-lines',
    tiers: [
      { difficulty: 1, gen: (r) => {
        const start = int(r, 2, 8), hop = int(r, 2, 5), hops = int(r, 2, 4);
        return { prompt: `Start at ${start} on a number line and make ${hops} hops of ${hop}. Where do you land?`,
          value: start + hop * hops,
          explanation: `Each hop adds ${hop}: ${start} → ${start + hop}${hops > 2 ? ` → ${start + 2 * hop}` : ''} → ${start + hop * hops}. Hopping a number line is repeated addition made visible — and later, multiplication.` };
      } },
      { difficulty: 2, gen: (r) => {
        const a = int(r, 25, 60), b = int(r, 11, 24);
        return { prompt: `Find ${a} − ${b} on a number line by counting UP from ${b} to ${a}. What is the difference?`,
          value: a - b,
          explanation: `Count up: ${b} → ${b + (10 - (b % 10)) % 10 || 10} (a friendly ten) → ${a}. The total distance climbed is ${a - b}. Subtraction as "distance between" often beats take-away — it is how people count change.` };
      } },
    ],
  },

  // ── Grades 3-5 models ────────────────────────────────────────────────────
  {
    skillId: 'area-model-multiplication',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const tens = int(r, 1, 4) * 10, ones = int(r, 2, 9), b = int(r, 3, 9);
        return { prompt: `An area model for (${tens} + ${ones}) × ${b} has two boxes. The first box holds ${tens} × ${b}. What does the WHOLE model total?`,
          value: (tens + ones) * b,
          explanation: `The two boxes hold ${tens} × ${b} = ${tens * b} and ${ones} × ${b} = ${ones * b}. Total: ${tens * b} + ${ones * b} = ${(tens + ones) * b}. The area model is the distributive property drawn as a rectangle.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 1, 2) * 10 + int(r, 2, 9), b = 10 + int(r, 2, 9);
        const at = Math.floor(a / 10) * 10, ao = a % 10, bt = 10, bo = b % 10;
        return { prompt: `An area model for ${a} × ${b} has four boxes: ${at}×${bt}, ${at}×${bo}, ${ao}×${bt}, and ${ao}×${bo}. What is the total?`,
          value: a * b,
          explanation: `The boxes hold ${at * bt}, ${at * bo}, ${ao * bt}, and ${ao * bo}. Sum: ${at * bt} + ${at * bo} + ${ao * bt} + ${ao * bo} = ${a * b}. Every partial product gets its own room — nothing is carried or hidden.` };
      } },
    ],
  },

  {
    skillId: 'partial-products',
    tiers: [
      { difficulty: 2, gen: (r) => {
        // A multiple of ten gives "240 and 0" — one real partial product and a
        // filler. Keep the ones digit alive.
        let a = int(r, 12, 48); if (a % 10 === 0) a += int(r, 1, 9);
        const b = int(r, 3, 9);
        const at = Math.floor(a / 10) * 10, ao = a % 10;
        return { prompt: `Using partial products for ${a} × ${b}: what are the two partial products?`,
          value: `${at * b} and ${ao * b}`,
          explanation: `Split ${a} by place value: ${at} × ${b} = ${at * b} and ${ao} × ${b} = ${ao * b}. (They sum to ${a * b}.) Partial products write out what the standard algorithm compresses into carrying.` };
      } },
      { difficulty: 3, gen: (r) => {
        let a = int(r, 12, 48); if (a % 10 === 0) a += int(r, 1, 9);
        const b = int(r, 3, 9);
        const at = Math.floor(a / 10) * 10, ao = a % 10;
        return { prompt: `${a} × ${b} by partial products gives ${at * b} + ${ao * b}. What is the product?`,
          value: a * b,
          explanation: `Add the partial products: ${at * b} + ${ao * b} = ${a * b}. Because each piece is a clean place-value product, the final addition is the only step where anything combines.` };
      } },
    ],
  },

  {
    skillId: 'partial-quotients-division',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const d = pick(r, [3, 4, 6, 7]), q1 = 10, q2 = int(r, 2, 9);
        const n = d * (q1 + q2);
        return { prompt: `Divide ${n} ÷ ${d} by partial quotients: first take out ${q1} groups of ${d} (${q1 * d}). How many groups of ${d} are in the ${n - q1 * d} that remain?`,
          value: q2,
          explanation: `After removing ${q1 * d}, what is left is ${n - q1 * d}, which holds ${n - q1 * d} ÷ ${d} = ${q2} more groups. Total quotient: ${q1} + ${q2} = ${q1 + q2}. Partial quotients let you chip away in friendly chunks instead of nailing each digit first try.` };
      } },
      { difficulty: 3, gen: (r) => {
        const d = pick(r, [4, 6, 8]), q = 10 * int(r, 1, 2) + int(r, 3, 9);
        const n = d * q;
        return { prompt: `${n} ÷ ${d} by partial quotients: a student removes ${Math.floor(q / 10) * 10} groups, then ${q % 10} groups. What is the quotient?`,
          value: q,
          explanation: `The partial quotients stack up: ${Math.floor(q / 10) * 10} + ${q % 10} = ${q}. Check: ${d} × ${q} = ${n} ✓. Any chunking works as long as the pieces sum — that flexibility is the method's point.` };
      } },
    ],
  },

  {
    skillId: 'division-strategies',
    tiers: [
      { difficulty: 2, gen: (r, made) => {
        if (made % 2 === 0) {
          const d = int(r, 3, 9), q = int(r, 3, 9);
          return { prompt: `Solve ${d * q} ÷ ${d} by thinking multiplication: ${d} × ? = ${d * q}.`,
            value: q,
            explanation: `Division asks the multiplication question backwards: ${d} × ${q} = ${d * q}, so ${d * q} ÷ ${d} = ${q}. Fact families make every division a known multiplication.` };
        }
        const d = pick(r, [2, 4]), n = d * int(r, 6, 15);
        return { prompt: `Solve ${n} ÷ ${d} by halving${d === 4 ? ' twice' : ''}. What is the quotient?`,
          value: n / d,
          explanation: `${d === 4 ? `Halve twice: ${n} → ${n / 2} → ${n / 4}` : `Halve: ${n} → ${n / 2}`}. Dividing by ${d} is ${d === 4 ? 'two halvings' : 'one halving'} — the mirror of the doubling strategy for multiplication.` };
      } },
      { difficulty: 3, gen: (r) => {
        const d = int(r, 3, 6), q = int(r, 11, 19);
        const n = d * q;
        return { prompt: `Solve ${n} ÷ ${d} by splitting: ${n} = ${d * 10} + ${n - d * 10}. What is the quotient?`,
          value: q,
          explanation: `Divide each friendly piece: ${d * 10} ÷ ${d} = 10 and ${n - d * 10} ÷ ${d} = ${q - 10}. Together: 10 + ${q - 10} = ${q}. Splitting the dividend along place value is the distributive property working for division.` };
      } },
    ],
  },

  {
    skillId: 'fraction-operations-visual',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const d = pick(r, [4, 5, 6, 8]), a = int(r, 1, d - 2), b = int(r, 1, d - a - 1);
        return { prompt: `A fraction bar is cut into ${d} equal pieces. ${a} piece${a > 1 ? 's are' : ' is'} shaded red and ${b} more ${b > 1 ? 'are' : 'is'} shaded blue. What fraction is shaded in all?`,
          value: `${a + b}/${d}`,
          explanation: `Same-size pieces just count up: ${a} + ${b} = ${a + b} of the ${d} pieces, so ${a + b}/${d}. The bar shows WHY like denominators add numerators only — the piece size never changes.` };
      } },
      { difficulty: 3, gen: (r) => {
        // The group count must divide the dot count — 12 dots in 5 groups gave
        // "9.6 dots", which no child can shade.
        const [d, w] = pick(r, [[3, 12], [3, 24], [4, 12], [4, 20], [4, 24], [5, 20], [6, 24], [5, 30]]);
        const num = int(r, 1, d - 1);
        const per = w / d;
        return { prompt: `An area model shows ${w} dots split into ${d} equal groups. How many dots is ${num}/${d} of ${w}?`,
          value: num * per,
          explanation: `Each group holds ${w} ÷ ${d} = ${per} dots, and ${num}/${d} takes ${num} groups: ${num} × ${per} = ${num * per}. "Fraction of" = divide by the denominator, multiply by the numerator — the model shows both steps.` };
      } },
    ],
  },

  {
    skillId: 'tape-diagrams',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const unit = int(r, 4, 9), a = pick(r, [2, 3]), b = a + pick(r, [1, 2]);
        return { prompt: `A tape diagram shows the ratio ${a}:${b}. Each box represents ${unit}. What is the LARGER quantity?`,
          value: b * unit,
          explanation: `The larger tape has ${b} boxes of ${unit} each: ${b} × ${unit} = ${b * unit}. (The smaller is ${a * unit}.) Tape diagrams turn ratio language into boxes you can count.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = pick(r, [2, 3]), b = a + pick(r, [1, 2]);
        const unit = int(r, 3, 8);
        const total = (a + b) * unit;
        return { prompt: `Two quantities are in the ratio ${a}:${b} and total ${total}. Using a tape diagram, find the smaller quantity.`,
          value: a * unit,
          explanation: `The tapes hold ${a} + ${b} = ${a + b} equal boxes, so each box is ${total} ÷ ${a + b} = ${unit}. The smaller quantity is ${a} boxes: ${a} × ${unit} = ${a * unit}. Find the unit first — every tape-diagram problem reduces to that.` };
      } },
    ],
  },

  {
    skillId: 'multi-step-word-problems',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const packs = int(r, 3, 6), per = pick(r, [4, 6, 8]), eaten = int(r, 3, 9);
        return { prompt: `Ari buys ${packs} packs of ${per} granola bars, then the family eats ${eaten}. How many bars are left?`,
          value: packs * per - eaten,
          explanation: `Two steps: first the total, ${packs} × ${per} = ${packs * per}; then the removal, ${packs * per} − ${eaten} = ${packs * per - eaten}. Naming the steps before computing is the whole skill.` };
      } },
      { difficulty: 3, gen: (r) => {
        const kids = pick(r, [3, 4, 6]), each = int(r, 3, 7), extra = int(r, 5, 15);
        const total = kids * each + extra;
        return { prompt: `${total} stickers are shared: each of ${kids} children gets ${each}, and the rest go to the teacher. How many does the teacher get?`,
          value: extra,
          explanation: `Step 1: the children take ${kids} × ${each} = ${kids * each}. Step 2: the teacher gets the rest, ${total} − ${kids * each} = ${extra}. Multiply, then subtract — two operations, one story.` };
      } },
    ],
  },

  // ── Grades 6-8 models ────────────────────────────────────────────────────
  {
    skillId: 'double-number-lines',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const unit = int(r, 2, 6), scale = pick(r, [3, 4, 5]);
        return { prompt: `A double number line shows 1 pound ↔ $${unit}. What does the line show for ${scale} pounds?`,
          value: scale * unit,
          explanation: `The two lines stretch together: ${scale} pounds sits directly above ${scale} × ${unit} = ${scale * unit} dollars. A double number line keeps equivalent pairs vertically aligned — proportionality made visible.` };
      } },
      { difficulty: 3, gen: (r) => {
        // Pairs share a factor > 1, so the reduced pair is genuinely smaller
        // and the answer is a whole number — (4, 9) would ask for the pair
        // you were already given.
        const [a, b] = pick(r, [[4, 6], [6, 9], [8, 10], [8, 14], [4, 10], [6, 14], [9, 12], [10, 15]]);
        const g = (function gcd(x, y) { return y ? gcd(y, x % y) : x; })(a, b);
        return { prompt: `A double number line pairs ${a} cups of flour with ${b} cups of water. How much water pairs with ${a / g} cup${a / g > 1 ? 's' : ''} of flour?`,
          value: b / g,
          explanation: `Divide both lines by ${g}: ${a} ÷ ${g} = ${a / g} pairs with ${b} ÷ ${g} = ${b / g}. Finding the smaller equivalent pair is walking LEFT along both lines together.` };
      } },
    ],
  },

  {
    skillId: 'algebra-tiles',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const x = int(r, 2, 6), c = int(r, 1, 9);
        return { prompt: `An algebra-tile mat shows ${x} x-tiles and ${c} unit tile${c > 1 ? 's' : ''}. What expression does it represent?`,
          value: `${x}x + ${c}`,
          explanation: `Each long tile is one x and each small square is 1: ${x} x-tiles and ${c} units make ${x}x + ${c}. Tiles give "like terms" a physical meaning — you can only stack tiles of the same shape.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 2, 5), b = int(r, 1, 6), c2 = int(r, 1, 4);
        return { prompt: `A mat shows ${a}x + ${b} on the left. A student adds ${c2} more unit tile${c2 > 1 ? 's' : ''} to the left side. What does the left side show now?`,
          value: `${a}x + ${b + c2}`,
          explanation: `Only the unit tiles change: ${b} + ${c2} = ${b + c2} units, so the mat reads ${a}x + ${b + c2}. The x-tiles are untouched — tiles enforce that x's and units never merge.` };
      } },
    ],
  },

  {
    skillId: 'visual-equation-solving',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const x = int(r, 2, 9), b = int(r, 1, 9);
        return { prompt: `A model shows x + ${b} = ${x + b}. Removing ${b} unit tiles from BOTH sides leaves what value for x?`,
          value: x,
          explanation: `Take ${b} units off each side and the balance holds: x = ${x + b} − ${b} = ${x}. Removing the same tiles from both sides is the pictures-first version of subtracting from both sides.` };
      } },
      { difficulty: 3, gen: (r) => {
        const x = int(r, 2, 8), a = pick(r, [2, 3, 4]);
        return { prompt: `A model shows ${a} x-tiles balancing ${a * x} unit tiles. Splitting both sides into ${a} equal groups gives x = ?`,
          value: x,
          explanation: `${a} x-tiles ↔ ${a * x} units means each x-tile pairs with ${a * x} ÷ ${a} = ${x} units. Splitting into equal groups IS division — drawn instead of written.` };
      } },
    ],
  },

  {
    skillId: 'balance-model',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const x = int(r, 2, 9), b = int(r, 1, 9);
        return { prompt: `A balance scale shows a bag (x) plus ${b} block${b > 1 ? 's' : ''} on the left, and ${x + b} blocks on the right. How many blocks are in the bag?`,
          value: x,
          explanation: `Remove ${b} blocks from BOTH pans — the scale stays level — leaving the bag balancing ${x} blocks: x = ${x}. The scale is why "do the same to both sides" works: anything else tips it.` };
      } },
      { difficulty: 3, gen: (r) => {
        const x = int(r, 2, 7), a = pick(r, [2, 3]), b = int(r, 1, 8);
        return { prompt: `A balance shows ${a} identical bags plus ${b} block${b > 1 ? 's' : ''} on the left, and ${a * x + b} blocks on the right. How many blocks per bag?`,
          value: x,
          explanation: `Remove ${b} blocks from both pans: ${a} bags ↔ ${a * x} blocks. Share into ${a} equal groups: each bag holds ${a * x} ÷ ${a} = ${x}. Two balance moves = the two steps of solving ${a}x + ${b} = ${a * x + b}.` };
      } },
    ],
  },

  {
    skillId: 'chip-model',
    tiers: [
      { difficulty: 2, gen: (r) => {
        const a = int(r, 3, 9), b = int(r, 1, a - 1);
        return { prompt: `Chip model: you have ${a} negative chips and add ${b} positive chips. Each +/− pair cancels. What is the result?`,
          value: -(a - b),
          explanation: `${b} zero pairs form and vanish, leaving ${a} − ${b} = ${a - b} negative chips: the result is −${a - b}. The chip model makes (−${a}) + ${b} a matter of counting what survives the cancelling.` };
      } },
      { difficulty: 3, gen: (r) => {
        const a = int(r, 2, 7), b = int(r, 2, 7);
        return { prompt: `Chip model: start with ${a} positive chips. To compute ${a} − (−${b}), you must REMOVE ${b} negative chips, so you first add ${b} zero pairs. What is the result?`,
          value: a + b,
          explanation: `Adding ${b} zero pairs changes nothing (+${b} and −${b} together are 0); removing the ${b} negative chips leaves ${a} + ${b} = ${a + b} positives. The model shows WHY subtracting a negative adds: you must bring in positives to have negatives to take away.` };
      } },
    ],
  },
];

module.exports = { TEMPLATES, GB };

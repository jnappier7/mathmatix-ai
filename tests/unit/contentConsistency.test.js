/**
 * The same fact must read the same way on every page.
 *
 * THE BUG THIS CATCHES: nothing throws when marketing copy drifts, so it drifts.
 * A site review found the homepage hero promising "Grade 3–Calculus" while the FAQ
 * said "Grade 3 through Calculus 3" and onboarding said "Safe for students K–college";
 * the hero claimed the tutor "honors every accommodation on their IEP" while the
 * comparison table two screens down said "nine accommodation types". A parent reading
 * two of those in one session cannot tell who the product is for or what it does, and
 * the unbounded accommodation claim is the kind of promise a school district holds you
 * to — the schema has exactly nine booleans (models/iepPlan.js).
 *
 * docs/CONTENT_STANDARDS.md is the source of truth. This test is its enforcement: it
 * fails CI on the specific phrasings that file retires, so the next drift is caught at
 * PR time rather than by a reviewer scrolling the live site.
 *
 * Adding a page? It is picked up automatically — the sweep globs public/*.html.
 * Genuinely need a retired phrase (a quoted testimonial, a legal excerpt)? Add the file
 * to that rule's `allow` list with a comment saying why, rather than softening the regex.
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

// The allowance is one constant. Deriving it here means a tier change updates
// this test rather than breaking it into a re-pinned literal.
const { FREE_WEEKLY_SECONDS } = require('../../utils/aiTimeMeter');
const FREE_MINUTES = Math.round(FREE_WEEKLY_SECONDS / 60);

/** Every top-level marketing/app page. Subdirectories (incl. generated /courses) excluded. */
function marketingPages() {
  return fs.readdirSync(PUBLIC_DIR)
    .filter(f => f.endsWith('.html'))
    .sort();
}

function readPage(file) {
  return fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
}

/**
 * Each rule is a phrasing CONTENT_STANDARDS.md retires, why it is retired, and what to
 * write instead. `allow` lists files exempted for a stated reason.
 */
const BANNED = [
  {
    name: 'unbounded accommodation claim',
    // "every accommodation on their IEP" promises the tutor can interpret and fulfill an
    // arbitrary IEP. iepAccommodationsSchema has nine booleans plus free-text notes.
    pattern: /(honors?|honours?|supports?|handles?)\s+every\s+accommodation/i,
    instead: 'nine supported IEP accommodation types',
    allow: [],
  },
  {
    name: 'British spelling of "honor" in user-facing copy',
    pattern: /\bhonours?\b/i,
    instead: 'honors / honor (US English — see CONTENT_STANDARDS.md)',
    // parent-dashboard.html: the only hit is inside an HTML comment explaining the
    // learning-supports panel to developers, not copy a parent ever reads.
    allow: ['parent-dashboard.html'],
  },
  {
    name: 'grade range that drops the "3" from Calculus 3',
    // "Grade 3–Calculus" reads as "ends at Calc 1" and undersells the catalog.
    pattern: /Grades?\s*3\s*(?:&ndash;|&mdash;|[–—-])\s*Calculus(?!\s*3)/i,
    instead: 'Grades 3–Calculus 3',
    allow: [],
  },
  {
    name: 'grade range starting at K',
    // The skill catalog starts at grade 3 content; "K" is not a claim we can support.
    pattern: /\bK\s*(?:&ndash;|&mdash;|[–—-])\s*(?:college|12)\b/i,
    instead: 'Grades 3–Calculus 3',
    allow: [],
  },
  {
    name: 'free allowance stated as monthly',
    // This rule used to run the other way, banning the WEEKLY form, because the quota
    // was then a rolling 30-day window. The window is now FREE_QUOTA_RESET_DAYS = 7,
    // so the monthly form is the retired one. The rule that survived the flip is the
    // one underneath both: state the window the meter actually enforces.
    pattern: /\d+\s*(?:free\s*)?(?:AI\s*)?min(?:ute)?s?\s*(?:\/|per\s+|a\s+|every\s+)month/i,
    instead: `${FREE_MINUTES} free AI minutes a week`,
    allow: [],
  },
  {
    name: 'unfalsifiable competitor claim',
    pattern: /trained on the internet,?\s*not on pedagogy/i,
    instead: "Not built around one child's profile, accommodations and parent-visible progress",
    allow: [],
  },
];

describe('marketing copy matches docs/CONTENT_STANDARDS.md', () => {
  const pages = marketingPages();

  it('finds pages to check', () => {
    expect(pages.length).toBeGreaterThan(10);
  });

  describe.each(BANNED)('$name', ({ pattern, instead, allow }) => {
    it('appears on no page', () => {
      const offenders = pages
        .filter(f => !allow.includes(f))
        .filter(f => pattern.test(readPage(f)));

      expect(offenders.length === 0 ? [] : [
        `Retired phrasing found in: ${offenders.join(', ')}`,
        `Write instead: ${instead}`,
        'See docs/CONTENT_STANDARDS.md.',
      ]).toEqual([]);
    });
  });
});

describe('the free-plan number never travels without its clarifier', () => {
  // The clarifier used to convert UPWARD: "30 minutes" read cold sounds like half an
  // hour of use, and the point was that it is really 2-3 hours, because only the
  // tutor's response time is metered.
  //
  // At three minutes the risk inverts. Read cold it sounds like 180 seconds of
  // tutoring, which is not a product — and the hours conversion that rescued the old
  // number now reads as a stretch. utils/pipeline/persist.js bills every tutor turn a
  // 30s floor, so the honest unit at this scale is turns: three minutes is six of
  // them, one problem end to end. Either way the rule is the same, which is why this
  // test survived the tier change: the number is not self-explanatory, so whatever
  // explains it has to be on the same page as the first mention.
  const NUMBER = new RegExp(`${FREE_MINUTES}\\s*(?:free\\s*)?AI\\s*min`, 'ig');
  const CLARIFIER = /(one problem|response time counts|only the tutor)/i;

  // Only ADVERTISING mentions need the clarifier. A quota-exhausted message ("you've
  // used your 3 free AI minutes") states the number to explain why the tutor just
  // stopped, and padding it with the sales clarifier would be worse copy, not better.
  const SPENT = /(used|spent|out of|ran out of|exhausted|remaining|left)\s*(your|their|the)?\s*$/i;

  function advertisesTheAllowance(file) {
    const html = readPage(file);
    NUMBER.lastIndex = 0;
    let match;
    while ((match = NUMBER.exec(html)) !== null) {
      if (!SPENT.test(html.slice(Math.max(0, match.index - 40), match.index))) return true;
    }
    return false;
  }

  const pagesWithTheNumber = marketingPages().filter(advertisesTheAllowance);

  it('is stated on the pricing page', () => {
    // Only pricing.html states the figure now. The homepage leads with the trial and
    // describes the floor qualitatively ("a few tutoring minutes each week") — that is
    // deliberate, and it is why this no longer requires index.html.
    expect(pagesWithTheNumber).toEqual(expect.arrayContaining(['pricing.html']));
  });

  it.each(pagesWithTheNumber)('%s explains what an AI minute is', (file) => {
    expect(CLARIFIER.test(readPage(file))).toBe(true);
  });
});

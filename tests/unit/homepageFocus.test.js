/**
 * The homepage sells to parents. One page, one audience.
 *
 * THE PROBLEM THIS PINS: index.html was selling to parents, students, teachers,
 * schools, children with IEPs, children with ADHD, grades 3 through college, and
 * parents who wanted a math refresher — all on the way down one page. A site
 * review found the voice switching between them repeatedly, and the same five
 * claims restated in the feature grid, the family tabs, the comparison table,
 * the FAQ and the closing CTA: persuasive at the top, exhausting by the bottom.
 *
 * Marketing pages grow back. Nothing errors when a section is re-added, no
 * reviewer counts the words, and the person adding "just one more" audience is
 * always right about that one audience. So the shape is asserted here:
 *
 *   - The student and teacher pitches live on their own pages and are linked,
 *     not explained inline. That is the actual fix — the tabs are gone AND the
 *     content still exists somewhere.
 *   - The pain point comes before the feature pitch. "It's 9pm and your child is
 *     stuck" used to sit five screens down, after three sections had already
 *     asked the reader to care.
 *   - Length has a budget, generous enough for real editing and tight enough to
 *     fail when a whole section reappears.
 *
 * The DOM work runs in a spawned process (tests/helpers/homepageFocusProbe.js)
 * — jsdom@27 cannot be `require`d inside a Jest worker.
 */

const path = require('path');
const { execFileSync } = require('child_process');

/**
 * Below-hero word budget. The page sat at ~1590 words below the hero and now
 * sits at ~1020; 1200 leaves room to edit and to add a section deliberately,
 * while a restored tab block or a second comparison table blows straight
 * through it. The hero is excluded because most of its "words" are the live
 * demo's controls — math symbol buttons, tutor names — not copy anyone reads.
 */
const BELOW_HERO_WORD_BUDGET = 1200;

describe('homepage focus', () => {
  let probe;

  beforeAll(() => {
    probe = JSON.parse(execFileSync(
      process.execPath,
      [path.join(__dirname, '../helpers/homepageFocusProbe.js')],
      { encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 }
    ));
  });

  describe('one audience', () => {
    it('has no role-tab block', () => {
      expect(probe.home.hasRoleTabs).toBe(false);
    });

    it('does not pitch the classroom on the homepage', () => {
      // These lines are the teacher pitch verbatim. They belong on the teacher
      // page, where someone who wants them has asked for them.
      expect(probe.home.copy).not.toContain('Built for Your Classroom');
      expect(probe.home.copy).not.toContain('Upload your materials');
    });

    it('does not pitch the student the parent is buying for', () => {
      expect(probe.home.copy).not.toContain('A Tutor That Gets You');
      expect(probe.home.copy).not.toContain('spend coins in the shop');
    });

    it('acknowledges the other audiences with a link each', () => {
      // Acknowledged, not explained — the difference between a line and a tab.
      expect(probe.home.links).toContain('/for-teachers.html');
      expect(probe.home.links).toContain('/for-students.html');
    });

    it('keeps the headline that names the differentiator', () => {
      expect(probe.home.firstHeading).toBe('A math tutor that actually knows your child.');
    });
  });

  describe('the cut content still exists', () => {
    it('the teacher page carries the classroom pitch', () => {
      expect(probe.teachers.h1).toHaveLength(1);
      expect(probe.teachers.copy).toContain('Built for Your Classroom');
      expect(probe.teachers.copy).toContain('Upload your materials');
    });

    it('the student page carries the student pitch', () => {
      expect(probe.students.h1).toHaveLength(1);
      expect(probe.students.copy).toContain('A Tutor That Gets You');
      expect(probe.students.copy).toContain('spend coins in the shop');
    });

    it('both link back to the homepage funnel', () => {
      expect(probe.teachers.links).toContain('/');
      expect(probe.students.links).toContain('/');
    });
  });

  describe('order', () => {
    const at = (probe, cls) => probe.home.sections.indexOf(cls);

    it('opens with the working demo', () => {
      expect(probe.home.sections[0]).toBe('lp-hero');
    });

    it('puts the parent pain point before the feature pitch', () => {
      expect(at(probe, 'lp-spotlight')).toBeGreaterThan(-1);
      expect(at(probe, 'lp-spotlight')).toBeLessThan(at(probe, 'lp-features'));
    });

    it('ends on pricing, then FAQ, then the CTA', () => {
      expect(at(probe, 'lp-compare')).toBeLessThan(at(probe, 'lp-faq'));
      expect(at(probe, 'lp-faq')).toBeLessThan(at(probe, 'lp-final-cta'));
      expect(probe.home.sections[probe.home.sections.length - 1]).toBe('lp-final-cta');
    });
  });

  describe('length', () => {
    it('stays under the below-hero word budget', () => {
      expect(probe.home.words.belowHero).toBeLessThanOrEqual(BELOW_HERO_WORD_BUDGET);
    });

    it('makes three differentiator claims, not six feature claims', () => {
      // Three of the original six were not differentiators: guiding instead of
      // answering is table stakes (the comparison table says so), price belongs
      // with pricing, and homework photos are shown in the walkthrough.
      expect(probe.home.differentiatorCards).toBe(3);
    });

    it('keeps the FAQ short enough to read', () => {
      expect(probe.home.faqItems).toBeLessThanOrEqual(6);
    });
  });

  describe('the comparison is a table, and a fair one', () => {
    it('replaced the three-column card block', () => {
      expect(probe.home.hasCompareCards).toBe(false);
      expect(probe.home.hasCompareTable).toBe(true);
    });

    it('stays short', () => {
      // The old Mathmatix+ column alone had nine bullets.
      expect(probe.home.compareRows).toBeLessThanOrEqual(8);
    });

    it('concedes something to each alternative', () => {
      // A table where the other columns are never right reads as marketing
      // rather than information, and a reader stops trusting the rows that
      // actually matter.
      expect(probe.home.copy).toContain('A good one will');
      expect(probe.home.copy).toMatch(/General AI/);
    });
  });
});

/**
 * The avatar pickers are keyboard-operable radiogroups, not a wall of buttons.
 *
 * WHERE THIS CAME FROM: the labelling pass gave all 23 colour swatches
 * accessible names, and deliberately stopped at role="group" + aria-pressed. A
 * radiogroup promises arrow-key navigation, a roving tabindex and aria-checked,
 * and claiming the role without implementing the contract is worse than not
 * claiming it — a screen-reader user is told to press arrows and nothing moves.
 *
 * This is the contract, now implemented and pinned:
 *
 *   - ONE tab stop per group. 31 options across four groups used to mean 31 Tab
 *     presses to get past the sidebar. Tab now moves between groups, arrows
 *     within one.
 *   - Arrows move focus AND selection together. That is radio behaviour; moving
 *     focus without selecting is a listbox, and these are radios.
 *   - Both axes, because the swatches wrap onto several visual rows — Down from
 *     the end of a row has to go somewhere sensible.
 *   - Wrapping at both ends, Home and End.
 *   - Keys the group does not own pass through. A keydown handler that
 *     preventDefaults unconditionally traps focus in the widget it was supposed
 *     to make navigable.
 *   - Clicking still works and leaves exactly one tab stop behind, so a mouse
 *     user who then reaches for the keyboard is not stranded.
 *
 * The style picker is included: same one-of-many widget, and its buttons have
 * visible text, which is the only reason the labelling pass never flagged them.
 *
 * The DOM work runs in a spawned process (tests/helpers/avatarRadioGroupProbe.js)
 * — jsdom@27 cannot be `require`d inside a Jest worker.
 */

const path = require('path');
const { execFileSync } = require('child_process');

const GROUPS = {
  'style-selector': { label: 'Avatar style', count: 8, initial: 'Adventurer' },
  'skin-picker': { label: 'Skin tone', count: 5, initial: 'Skin tone: Medium' },
  'hair-color-picker': { label: 'Hair color', count: 10, initial: 'Hair color: Brown' },
  'bg-picker': { label: 'Background', count: 8, initial: 'Background: None' },
};

describe('avatar picker radiogroups', () => {
  let probe;

  beforeAll(() => {
    probe = JSON.parse(execFileSync(
      process.execPath,
      [path.join(__dirname, '../helpers/avatarRadioGroupProbe.js')],
      { encoding: 'utf8', timeout: 60000 }
    ));
  });

  describe('structure', () => {
    it.each(Object.entries(GROUPS))('%s is a labelled radiogroup', (id, spec) => {
      const g = probe.initial[id];
      expect(g.role).toBe('radiogroup');
      expect(g.groupLabel).toBe(spec.label);
      expect(g.count).toBe(spec.count);
    });

    it.each(Object.entries(GROUPS))('%s starts with exactly one option checked', (id, spec) => {
      const g = probe.initial[id];
      expect(g.checked).toEqual([spec.initial]);
      // The class is what you see and aria-checked is what you hear; if they
      // disagree the widget is lying to one of its users.
      expect(g.activeClass).toEqual(g.checked);
    });

    it('exposes one tab stop per group, not one per option', () => {
      expect(probe.initial.totalRadios).toBe(31);
      expect(probe.initial.totalTabbableRadios).toBe(4);
    });

    it('has no aria-pressed left anywhere', () => {
      // aria-pressed is a toggle-button attribute and is not valid on
      // role="radio"; aria-checked replaced it.
      expect(probe.initial.strayAriaPressed).toBe(0);
    });
  });

  describe('arrow keys move focus and selection together', () => {
    it('ArrowRight advances both', () => {
      expect(probe.arrows.before.focused).toBe('Skin tone: Medium');
      expect(probe.arrows.afterRight.focused).toBe('Skin tone: Medium Dark');
      expect(probe.arrows.afterRight.checked).toEqual(['Skin tone: Medium Dark']);
      expect(probe.arrows.afterRight.tabbable).toEqual(['Skin tone: Medium Dark']);
    });

    it('ArrowDown advances too, because the swatches wrap onto rows', () => {
      expect(probe.arrows.afterDown.focused).toBe('Skin tone: Dark');
      expect(probe.arrows.afterDown.checked).toEqual(['Skin tone: Dark']);
    });

    it('ArrowLeft and ArrowUp go back', () => {
      expect(probe.arrows.afterLeft.focused).toBe('Skin tone: Medium Dark');
      expect(probe.arrows.afterUp.focused).toBe('Skin tone: Medium');
      expect(probe.arrows.afterUp.checked).toEqual(['Skin tone: Medium']);
    });

    it('keeps the tab stop on whatever is selected', () => {
      for (const step of Object.values(probe.arrows)) {
        expect(step.tabbable).toEqual(step.checked);
      }
    });
  });

  describe('edges', () => {
    it('wraps backwards off the first option', () => {
      expect(probe.edges.wrappedBackwards.focused).toBe('Skin tone: Dark');
    });

    it('wraps forwards off the last', () => {
      expect(probe.edges.wrappedForwards.focused).toBe('Skin tone: Light');
    });

    it('End goes to the last and Home to the first', () => {
      expect(probe.edges.atEnd.focused).toBe('Skin tone: Dark');
      expect(probe.edges.atHome.focused).toBe('Skin tone: Light');
      expect(probe.edges.atHome.checked).toEqual(['Skin tone: Light']);
    });
  });

  describe('it does not trap focus', () => {
    it('lets Tab through', () => {
      expect(probe.tabNotSwallowed).toBe(true);
    });

    it('lets other keys through', () => {
      expect(probe.typingNotSwallowed).toBe(true);
    });
  });

  describe('mouse and keyboard agree', () => {
    it('a click selects and moves the tab stop with it', () => {
      expect(probe.afterClick.checked).toEqual(['Background: Pink']);
      expect(probe.afterClick.tabbable).toEqual(['Background: Pink']);
      expect(probe.afterClick.activeClass).toEqual(['Background: Pink']);
    });
  });

  describe('groups are independent', () => {
    it('arrowing through skin tones leaves hair colour alone', () => {
      expect(probe.isolation.hairAfter.checked).toEqual(probe.isolation.hairBefore.checked);
      expect(probe.isolation.hairAfter.tabbable).toEqual(probe.isolation.hairBefore.tabbable);
    });
  });
});

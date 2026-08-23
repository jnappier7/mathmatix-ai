/**
 * Signup must not guess which kind of account you want.
 *
 * THE BUG THIS CATCHES: the role control was a <select> whose first option was
 * `<option value="student" selected>`, while the homepage CTA, the "how it works"
 * steps and the pricing copy all told parents to create a parent account and add
 * their child. A parent following that path and moving fast through the form took
 * the default and got a student account — which is not a preference you flip in
 * settings, it decides which dashboard the account owns, whether there is a child
 * to link, and what the tutor is allowed to show. The failure is silent: the form
 * submits happily and the mistake only surfaces later, as "where is my child's
 * progress?".
 *
 * The fix is a role card grid with nothing preselected, so the form cannot submit
 * until a human has actually said which one. This test holds that: no `selected`
 * default, no `<select>` to regress back to, and a submit that refuses.
 *
 * Teacher is the third card and behaves differently on purpose — see the
 * teacher block below.
 *
 * The DOM work runs in a spawned process (tests/helpers/signupRoleProbe.js) —
 * jsdom@27 cannot be `require`d inside a Jest worker.
 */

const path = require('path');
const { execFileSync } = require('child_process');

describe('signup role choice', () => {
  let probe;

  beforeAll(() => {
    probe = JSON.parse(execFileSync(
      process.execPath,
      [path.join(__dirname, '../helpers/signupRoleProbe.js')],
      { encoding: 'utf8', timeout: 60000 }
    ));
  });

  describe('nothing is preselected', () => {
    it('offers parent, student and teacher as radio cards', () => {
      expect(probe.initial.roleValues).toEqual(['parent', 'student', 'teacher']);
    });

    it('starts with no role checked', () => {
      expect(probe.initial.anyChecked).toBe(false);
    });

    it('has no <select id="role"> left to regress to', () => {
      expect(probe.initial.hasSelectElement).toBe(false);
    });

    it('asks the question in a legend rather than a bare label', () => {
      expect(probe.initial.legend).toMatch(/signing up as/i);
    });

    it('explains what each account does without opening a menu', () => {
      // The whole point of cards over a dropdown: a parent can see that
      // "Parent" is the one that links a child before choosing it.
      expect(probe.initial.everyRadioHasDescription).toBe(true);
    });
  });

  it('refuses to submit until a role is chosen', () => {
    expect(probe.submitWithNoRole.posted).toEqual([]);
    expect(probe.submitWithNoRole.message).toMatch(/parent, student, or teacher/i);
  });

  describe('the code question follows the role', () => {
    it('stays hidden until a role is picked', () => {
      // "I have a code" means a class code to a student and a child invite code
      // to a parent. Asking before we know which is asking a meaningless question.
      expect(probe.initial.codeRowVisible).toBe(false);
    });

    it('asks a parent for their child’s invite code', () => {
      expect(probe.parent.codeLabel).toMatch(/child/i);
      expect(probe.parent.childInviteVisible).toBe(true);
      expect(probe.parent.enrollmentVisible).toBe(false);
    });

    it('offers a student the class and parent codes, not the child code', () => {
      expect(probe.student.enrollmentVisible).toBe(true);
      expect(probe.student.parentInviteVisible).toBe(true);
      expect(probe.student.childInviteVisible).toBe(false);
    });
  });

  it('posts the chosen role', () => {
    expect(probe.parentSubmit.posted).toEqual(['parent']);
  });

  describe('teacher is shown but never self-registered', () => {
    // routes/signup.js SELF_REGISTERABLE_ROLES excludes 'teacher' on purpose: a
    // teacher account carries a roster and its IEP data, so an admin provisions
    // it after verifying the school. Hiding the option entirely just makes
    // teachers pick "Parent" and file a support ticket later, so the card is
    // there and says what to do instead.
    it('explains the route and links to it', () => {
      expect(probe.teacher.noticeVisible).toBe(true);
      expect(probe.teacher.noticeLinksToSupport).toBe(true);
    });

    it('disables submit rather than letting the POST 403', () => {
      expect(probe.teacher.submit.disabled).toBe(true);
    });

    it('posts nothing even if the form is submitted anyway', () => {
      expect(probe.teacherSubmit.posted).toEqual([]);
      expect(probe.teacherSubmit.message).toMatch(/set up by us/i);
    });

    it('does not ask a teacher for a code', () => {
      expect(probe.teacher.codeRowVisible).toBe(false);
    });
  });
});

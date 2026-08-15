/**
 * Unenroll must be reachable on mobile.
 *
 * THE BUG: the only two ways to leave a course were the drop-X on a My Courses
 * sidebar row and the "Drop Course" footer inside the course-progress dropdown.
 * Neither is reachable on a phone:
 *
 *   1. `.cr-courses-card` (the My Courses list) is `display: none` below 900px
 *      — chat-redesign.css:348. So the drop-X is never rendered on a phone.
 *   2. `.course-drop-x` was `opacity: 0`, revealed only by
 *      `.course-sidebar-item:hover`. A touch device has no hover state, so even
 *      where the list DID render (touch laptops/tablets above 900px) the control
 *      stayed invisible forever.
 *
 * That leaves the catalog sheet as the only courses surface on mobile — and its
 * enrolled cards offered "Continue" and nothing else. There was no way off a
 * course on a phone.
 *
 * The fix adds a Leave button to enrolled catalog cards. The card-action policy
 * is a pure static (resolveCardActions) so it can be pinned without a DOM — the
 * same shape as reconcileGreetingTarget. The CSS half of the fix (the touch
 * reveal of .course-drop-x) is not reachable from here.
 *
 * courseCatalog.js only auto-instantiates inside a DOMContentLoaded handler, so
 * a minimal `document` stub lets it load in node.
 */

global.document = global.document || { addEventListener() {} };
const { CourseManager } = require('../../public/js/courseCatalog');

const proto = CourseManager.prototype;

const SESSIONS = [
  { _id: 'sess-abc', courseId: 'algebra-1', courseName: 'Algebra 1' },
  { _id: 'sess-xyz', courseId: 'geometry', courseName: 'Geometry' },
];

describe('resolveCardActions — what an enrolled catalog card offers', () => {
  test('an enrolled course can be left, and carries a session id', () => {
    const a = CourseManager.resolveCardActions('algebra-1', SESSIONS);
    expect(a.isEnrolled).toBe(true);
    expect(a.canLeave).toBe(true);
  });

  test('a course the student is NOT enrolled in offers no Leave', () => {
    const a = CourseManager.resolveCardActions('calculus', SESSIONS);
    expect(a.isEnrolled).toBe(false);
    expect(a.canLeave).toBe(false);
    expect(a.sessionId).toBeNull();
  });

  test('resolves the COURSE SESSION id, not the courseId', () => {
    // The drop and activate endpoints are /api/course-sessions/:id/... —
    // handing them the catalog's courseId 404s on every click.
    expect(CourseManager.resolveCardActions('geometry', SESSIONS).sessionId).toBe('sess-xyz');
    expect(CourseManager.resolveCardActions('algebra-1', SESSIONS).sessionId).toBe('sess-abc');
  });

  test('an enrolment with no usable session id cannot be left', () => {
    // Better a card with only Continue than a Leave button that fires a
    // request at /api/course-sessions/undefined/drop.
    const a = CourseManager.resolveCardActions('algebra-1', [{ courseId: 'algebra-1' }]);
    expect(a.isEnrolled).toBe(true);
    expect(a.canLeave).toBe(false);
  });

  test('no enrolments at all — nothing offers Leave', () => {
    expect(CourseManager.resolveCardActions('algebra-1', []).canLeave).toBe(false);
    expect(CourseManager.resolveCardActions('algebra-1', undefined).canLeave).toBe(false);
    expect(CourseManager.resolveCardActions('algebra-1', null).isEnrolled).toBe(false);
  });
});

describe('dropCourse — the missing-session guard', () => {
  test('a missing session id re-syncs instead of firing a request at undefined', async () => {
    const ctx = {
      loadMySessions: jest.fn().mockResolvedValue(undefined),
      refreshCatalogIfOpen: jest.fn(),
      showConfirmation: jest.fn(),
      courseSessions: [],
    };

    await proto.dropCourse.call(ctx, undefined);

    expect(ctx.loadMySessions).toHaveBeenCalledTimes(1);
    expect(ctx.refreshCatalogIfOpen).toHaveBeenCalledTimes(1);
    // Never prompts the student to confirm dropping a course we can't identify.
    expect(ctx.showConfirmation).not.toHaveBeenCalled();
  });

  test('a real session id still reaches the confirmation prompt', async () => {
    const ctx = {
      loadMySessions: jest.fn(),
      refreshCatalogIfOpen: jest.fn(),
      showConfirmation: jest.fn().mockResolvedValue(false), // student cancels
      formatCourseName: proto.formatCourseName,
      courseSessions: SESSIONS,
    };

    await proto.dropCourse.call(ctx, 'sess-abc');

    expect(ctx.showConfirmation).toHaveBeenCalledTimes(1);
    expect(ctx.showConfirmation.mock.calls[0][0].title).toContain('Algebra 1');
    // Cancelling drops nothing and repaints nothing.
    expect(ctx.loadMySessions).not.toHaveBeenCalled();
  });
});

describe('refreshCatalogIfOpen', () => {
  // Minimal stand-in for the one element this method looks at.
  const withModal = (el) => {
    global.document.getElementById = (id) => (id === 'course-catalog-modal' ? el : null);
  };
  const modalEl = (visible) => ({ classList: { contains: (c) => visible && c === 'is-visible' } });

  afterEach(() => { delete global.document.getElementById; });

  test('repaints when the catalog modal is open and cached', () => {
    withModal(modalEl(true));
    const ctx = { _catalogCache: [{ courseId: 'algebra-1' }], _filterCatalog: jest.fn() };

    proto.refreshCatalogIfOpen.call(ctx);

    expect(ctx._filterCatalog).toHaveBeenCalledTimes(1);
  });

  test('is a no-op when the catalog is closed', () => {
    withModal(modalEl(false));
    const ctx = { _catalogCache: [{ courseId: 'algebra-1' }], _filterCatalog: jest.fn() };

    proto.refreshCatalogIfOpen.call(ctx);

    expect(ctx._filterCatalog).not.toHaveBeenCalled();
  });

  test('is a no-op when there is no cached catalog to repaint from', () => {
    withModal(modalEl(true));
    const ctx = { _catalogCache: null, _filterCatalog: jest.fn() };

    proto.refreshCatalogIfOpen.call(ctx);

    expect(ctx._filterCatalog).not.toHaveBeenCalled();
  });

  test('survives a page with no catalog modal at all', () => {
    withModal(null);
    const ctx = { _catalogCache: [{ courseId: 'algebra-1' }], _filterCatalog: jest.fn() };

    expect(() => proto.refreshCatalogIfOpen.call(ctx)).not.toThrow();
    expect(ctx._filterCatalog).not.toHaveBeenCalled();
  });
});

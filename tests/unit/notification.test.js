/**
 * Notification Model — schema validation tests
 *
 * These run without a live Mongo connection; we exercise Mongoose schema
 * validators directly. Used by the dashboard feed (parents/teachers/admins)
 * for persisted session-summary events.
 */

const mongoose = require('mongoose');
const Notification = require('../../models/notification');

describe('Notification model', () => {
  test('requires recipientRole', async () => {
    const n = new Notification({ type: 'session_summary' });
    let err;
    try { await n.validate(); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.errors.recipientRole).toBeDefined();
  });

  test('rejects invalid recipientRole', async () => {
    const n = new Notification({ type: 'session_summary', recipientRole: 'bogus' });
    let err;
    try { await n.validate(); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.errors.recipientRole).toBeDefined();
  });

  test('rejects invalid type', async () => {
    const n = new Notification({ type: 'spaceship', recipientRole: 'parent' });
    let err;
    try { await n.validate(); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.errors.type).toBeDefined();
  });

  test('accepts a role-broadcast notification (no recipientId)', async () => {
    const n = new Notification({
      type: 'session_summary',
      recipientRole: 'admin',
      data: { hello: 'world' }
    });
    await expect(n.validate()).resolves.toBeUndefined();
    expect(n.recipientId).toBeNull();
  });

  test('accepts a directly-addressed notification', async () => {
    const id = new mongoose.Types.ObjectId();
    const n = new Notification({
      type: 'session_summary',
      recipientRole: 'parent',
      recipientId: id,
      subjectUserId: id,
      data: { duration: 30 }
    });
    await expect(n.validate()).resolves.toBeUndefined();
    expect(n.recipientId.toString()).toBe(id.toString());
  });

  test('readAt defaults to null', () => {
    const n = new Notification({ type: 'session_summary', recipientRole: 'teacher' });
    expect(n.readAt).toBeNull();
  });

  test('expiresAt defaults to roughly 90 days out', () => {
    const before = Date.now();
    const n = new Notification({ type: 'session_summary', recipientRole: 'teacher' });
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    const delta = n.expiresAt.getTime() - before;
    // Allow a generous window — should be ~90d, never less than 89d, never more than 91d.
    expect(delta).toBeGreaterThan(ninetyDaysMs - 24 * 60 * 60 * 1000);
    expect(delta).toBeLessThan(ninetyDaysMs + 24 * 60 * 60 * 1000);
  });
});

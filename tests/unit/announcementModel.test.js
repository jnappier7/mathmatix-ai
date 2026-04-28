// tests/unit/announcementModel.test.js
// Unit tests for models/announcement.js (instance + statics)

jest.mock('../../utils/logger', () => ({
  warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const Announcement = require('../../models/announcement');

const methods = Announcement.schema.methods;
const statics = Announcement.schema.statics;

describe('announcement.methods.markAsReadBy', () => {
  test('does nothing when student already in readBy', async () => {
    const doc = {
      readBy: [{ studentId: 's1', readAt: new Date() }],
      save: jest.fn()
    };
    // Adapter so toString() works on string IDs in the same way ObjectIds work
    doc.readBy[0].studentId = { toString: () => 's1' };

    await methods.markAsReadBy.call(doc, { toString: () => 's1' });
    expect(doc.save).not.toHaveBeenCalled();
  });

  test('appends a readBy entry and saves when student is new', async () => {
    const doc = {
      readBy: [],
      save: jest.fn().mockResolvedValue()
    };
    await methods.markAsReadBy.call(doc, { toString: () => 's1' });
    expect(doc.readBy).toHaveLength(1);
    expect(doc.save).toHaveBeenCalled();
  });
});

describe('announcement.methods.isReadBy', () => {
  test('returns true when student is in readBy', () => {
    const doc = {
      readBy: [{ studentId: { toString: () => 's1' } }]
    };
    expect(methods.isReadBy.call(doc, { toString: () => 's1' })).toBe(true);
  });

  test('returns false when student is not in readBy', () => {
    const doc = { readBy: [{ studentId: { toString: () => 'other' } }] };
    expect(methods.isReadBy.call(doc, { toString: () => 's1' })).toBe(false);
  });
});

// Note: The static methods use mongoose.model() lookups internally, which is
// hard to mock without bringing up the whole ODM. We exercise the instance
// methods (the most common in-route call paths) here.

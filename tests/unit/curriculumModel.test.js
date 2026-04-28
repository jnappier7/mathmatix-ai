// tests/unit/curriculumModel.test.js
// Unit tests for models/curriculum.js — exercises the schema's instance and
// static methods directly without touching mongoose I/O.

jest.mock('../../utils/logger', () => ({
  warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const Curriculum = require('../../models/curriculum');

// Bind a method to a fake "this" doc with the necessary fields.
function call(method, doc, ...args) {
  return Curriculum.schema.methods[method].apply(doc, args);
}

describe('Curriculum.methods.getCurrentLesson', () => {
  test('prefers a lesson whose date range contains today', () => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86400000);
    const tomorrow = new Date(today.getTime() + 86400000);
    const doc = {
      lessons: [
        { weekNumber: 1, topic: 'A', startDate: new Date('2020-01-01'), endDate: new Date('2020-01-08') },
        { weekNumber: 5, topic: 'NOW', startDate: yesterday, endDate: tomorrow },
        { weekNumber: 10, topic: 'C' }
      ]
    };
    expect(call('getCurrentLesson', doc).topic).toBe('NOW');
  });

  test('falls back to a lesson with resources when no date match', () => {
    const doc = {
      lessons: [
        { weekNumber: 1, topic: 'no resources' },
        { weekNumber: 999, topic: 'old', resources: ['/x.pdf'] }
      ]
    };
    const lesson = call('getCurrentLesson', doc);
    expect(lesson).not.toBeNull();
  });

  test('returns null when there are no lessons at all', () => {
    expect(call('getCurrentLesson', { lessons: [] })).toBeNull();
  });
});

describe('Curriculum.methods.getLessonByWeek', () => {
  test('finds the matching lesson by weekNumber', () => {
    const doc = { lessons: [{ weekNumber: 1, topic: 'A' }, { weekNumber: 5, topic: 'B' }] };
    expect(call('getLessonByWeek', doc, 5).topic).toBe('B');
  });

  test('returns undefined when not found', () => {
    expect(call('getLessonByWeek', { lessons: [] }, 1)).toBeUndefined();
  });
});

describe('Curriculum.methods.getLessonsInRange', () => {
  test('returns lessons whose startDate falls in [start, end]', () => {
    const doc = {
      lessons: [
        { weekNumber: 1, topic: 'A', startDate: new Date('2024-09-01') },
        { weekNumber: 2, topic: 'B', startDate: new Date('2024-09-08') },
        { weekNumber: 3, topic: 'C', startDate: new Date('2024-12-01') },
        { weekNumber: 4, topic: 'D' /* no startDate */ }
      ]
    };
    const r = call('getLessonsInRange', doc, new Date('2024-09-01'), new Date('2024-09-30'));
    expect(r.map(l => l.topic).sort()).toEqual(['A', 'B']);
  });
});

describe('Curriculum.methods.getAIContext', () => {
  // getAIContext calls this.getCurrentLesson(); we attach all schema methods
  // to the fake doc so the self-reference resolves.
  function callContext(doc) {
    Object.assign(doc, Curriculum.schema.methods);
    return doc.getAIContext();
  }

  test('returns empty string when no current lesson', () => {
    const doc = { lessons: [], teacherPreferences: {} };
    expect(callContext(doc)).toBe('');
  });

  test('builds context with topic, standards, objectives, keywords', () => {
    const today = new Date();
    const doc = {
      lessons: [{
        weekNumber: 1,
        topic: 'Solving Two-Step Equations',
        standards: ['8.EE.1', '8.EE.2'],
        objectives: ['Isolate the variable', 'Justify each step'],
        keywords: ['inverse operations', 'order'],
        startDate: new Date(today.getTime() - 1000),
        endDate: new Date(today.getTime() + 1000),
        resources: ['/r.pdf']
      }],
      teacherPreferences: {
        terminology: 'use "opposite operation" instead of "inverse"',
        commonMistakes: 'forgetting to distribute',
        scaffolding: '',
        solutionMethods: '',
        additionalGuidance: ''
      }
    };

    const ctx = callContext(doc);
    expect(ctx).toContain('Solving Two-Step Equations');
    expect(ctx).toContain('8.EE.1, 8.EE.2');
    expect(ctx).toContain('Isolate the variable');
    expect(ctx).toContain('inverse operations');
    expect(ctx).toContain('TERMINOLOGY PREFERENCES');
    expect(ctx).toContain('COMMON MISTAKES TO WATCH FOR');
    expect(ctx).toContain('AVAILABLE RESOURCES');
  });
});

describe('Curriculum statics', () => {
  test('getActiveCurriculum queries by teacherId + isActive', async () => {
    const findOne = jest.fn().mockResolvedValue({ _id: 'c1' });
    const r = await Curriculum.schema.statics.getActiveCurriculum.call({ findOne }, 't1');
    expect(findOne).toHaveBeenCalledWith({ teacherId: 't1', isActive: true });
    expect(r._id).toBe('c1');
  });

  test('deactivateAll updates all curricula for a teacher', async () => {
    const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 3 });
    await Curriculum.schema.statics.deactivateAll.call({ updateMany }, 't1');
    expect(updateMany).toHaveBeenCalledWith({ teacherId: 't1' }, { isActive: false });
  });
});

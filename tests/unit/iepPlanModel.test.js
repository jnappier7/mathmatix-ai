// tests/unit/iepPlanModel.test.js
// Unit tests for models/iepPlan.js statics (FERPA-sensitive read/write paths)

jest.mock('../../utils/logger', () => ({
  warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const IEPPlan = require('../../models/iepPlan');

// We swap out the model's static query methods per test.
beforeEach(() => {
  jest.restoreAllMocks();
});

describe('IEPPlan.forUser', () => {
  test('returns lean document for the given user', async () => {
    const lean = jest.fn().mockResolvedValue({ userId: 'u1', accommodations: {} });
    jest.spyOn(IEPPlan, 'findOne').mockReturnValue({ lean });

    const r = await IEPPlan.forUser('u1');
    expect(IEPPlan.findOne).toHaveBeenCalledWith({ userId: 'u1' });
    expect(r).toEqual({ userId: 'u1', accommodations: {} });
  });

  test('returns null when no plan exists', async () => {
    jest.spyOn(IEPPlan, 'findOne').mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    expect(await IEPPlan.forUser('missing')).toBeNull();
  });
});

describe('IEPPlan.getChatCache', () => {
  test('selects only accommodation/readingLevel/preferredScaffolds fields', async () => {
    const lean = jest.fn().mockResolvedValue({ accommodations: { extendedTime: true }, readingLevel: 7 });
    const select = jest.fn().mockReturnValue({ lean });
    jest.spyOn(IEPPlan, 'findOne').mockReturnValue({ select });

    const r = await IEPPlan.getChatCache('u1');
    expect(select).toHaveBeenCalledWith('accommodations readingLevel preferredScaffolds');
    expect(r).toMatchObject({ readingLevel: 7 });
  });
});

describe('IEPPlan.findByAccommodation', () => {
  test('queries accommodations.{field} = true and populates user info', async () => {
    const lean = jest.fn().mockResolvedValue([{ userId: { firstName: 'Sam' } }]);
    const populate = jest.fn().mockReturnValue({ lean });
    const findSpy = jest.spyOn(IEPPlan, 'find').mockReturnValue({ populate });

    const r = await IEPPlan.findByAccommodation('extendedTime');
    expect(findSpy).toHaveBeenCalledWith({ 'accommodations.extendedTime': true });
    expect(populate).toHaveBeenCalledWith('userId', 'firstName lastName gradeLevel');
    expect(r).toHaveLength(1);
  });

  test('restricts query to a teacher\'s student IDs when provided', async () => {
    const lean = jest.fn().mockResolvedValue([]);
    const populate = jest.fn().mockReturnValue({ lean });
    const findSpy = jest.spyOn(IEPPlan, 'find').mockReturnValue({ populate });

    await IEPPlan.findByAccommodation('calculatorAllowed', ['s1', 's2']);
    expect(findSpy).toHaveBeenCalledWith({
      'accommodations.calculatorAllowed': true,
      userId: { $in: ['s1', 's2'] }
    });
  });
});

describe('IEPPlan.updateGoalProgress', () => {
  function makePlanWithGoals(goals) {
    return {
      goals,
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue()
    };
  }

  test('returns null when plan is missing', async () => {
    jest.spyOn(IEPPlan, 'findOne').mockResolvedValue(null);
    expect(await IEPPlan.updateGoalProgress('u1', '0', 10, 'editor')).toBeNull();
  });

  test('returns null when plan has no goals', async () => {
    jest.spyOn(IEPPlan, 'findOne').mockResolvedValue(makePlanWithGoals([]));
    expect(await IEPPlan.updateGoalProgress('u1', '0', 10, 'editor')).toBeNull();
  });

  test('updates goal by index, increments progress, and records history', async () => {
    const plan = makePlanWithGoals([
      { description: 'add fractions', currentProgress: 20, status: 'active', history: [] }
    ]);
    jest.spyOn(IEPPlan, 'findOne').mockResolvedValue(plan);

    const r = await IEPPlan.updateGoalProgress('u1', '0', 30, 'editor-1');
    expect(r.newProgress).toBe(50);
    expect(r.oldProgress).toBe(20);
    expect(r.completed).toBe(false);
    expect(plan.goals[0].history).toHaveLength(1);
    expect(plan.goals[0].history[0]).toMatchObject({ from: 20, to: 50, editorId: 'editor-1' });
    expect(plan.markModified).toHaveBeenCalledWith('goals');
    expect(plan.save).toHaveBeenCalled();
  });

  test('marks goal completed when progress reaches 100', async () => {
    const plan = makePlanWithGoals([
      { description: 'g', currentProgress: 80, status: 'active', history: [] }
    ]);
    jest.spyOn(IEPPlan, 'findOne').mockResolvedValue(plan);

    const r = await IEPPlan.updateGoalProgress('u1', '0', 30, 'e');
    expect(r.newProgress).toBe(100);
    expect(r.completed).toBe(true);
    expect(plan.goals[0].status).toBe('completed');
  });

  test('clamps progress at 100', async () => {
    const plan = makePlanWithGoals([
      { description: 'g', currentProgress: 95, status: 'active', history: [] }
    ]);
    jest.spyOn(IEPPlan, 'findOne').mockResolvedValue(plan);
    const r = await IEPPlan.updateGoalProgress('u1', '0', 50, 'e');
    expect(r.newProgress).toBe(100);
  });

  test('clamps progress at 0', async () => {
    const plan = makePlanWithGoals([
      { description: 'g', currentProgress: 5, status: 'active', history: [] }
    ]);
    jest.spyOn(IEPPlan, 'findOne').mockResolvedValue(plan);
    const r = await IEPPlan.updateGoalProgress('u1', '0', -50, 'e');
    expect(r.newProgress).toBe(0);
  });

  test('finds goal by description substring (case-insensitive) when identifier is non-numeric', async () => {
    const plan = makePlanWithGoals([
      { description: 'Other goal', currentProgress: 0, status: 'active' },
      { description: 'Add Fractions Properly', currentProgress: 0, status: 'active', history: [] }
    ]);
    jest.spyOn(IEPPlan, 'findOne').mockResolvedValue(plan);
    const r = await IEPPlan.updateGoalProgress('u1', 'fractions', 25, 'e');
    expect(r.goalIndex).toBe(1);
    expect(r.newProgress).toBe(25);
  });

  test('returns null when matched goal is not active', async () => {
    const plan = makePlanWithGoals([
      { description: 'g', currentProgress: 100, status: 'completed', history: [] }
    ]);
    jest.spyOn(IEPPlan, 'findOne').mockResolvedValue(plan);
    expect(await IEPPlan.updateGoalProgress('u1', '0', 10, 'e')).toBeNull();
  });

  test('returns null when index is out of range', async () => {
    const plan = makePlanWithGoals([
      { description: 'g', currentProgress: 0, status: 'active', history: [] }
    ]);
    jest.spyOn(IEPPlan, 'findOne').mockResolvedValue(plan);
    expect(await IEPPlan.updateGoalProgress('u1', '99', 10, 'e')).toBeNull();
  });
});

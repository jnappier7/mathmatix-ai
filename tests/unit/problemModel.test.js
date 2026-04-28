// tests/unit/problemModel.test.js
// Unit tests for models/problem.js (checkAnswer, statics: thetaToDifficulty,
// difficultyToTheta, findNearDifficulty, getBySkill).

const Problem = require('../../models/problem');

const checkAnswer = Problem.schema.methods.checkAnswer;
const statics = Problem.schema.statics;

function bind(answer, options = {}) {
  return {
    answer,
    answerType: options.answerType,
    correctOption: options.correctOption,
    options: options.options
  };
}

describe('Problem.methods.checkAnswer — multiple choice', () => {
  test('matches by correctOption letter', () => {
    const p = bind('foo', { answerType: 'multiple-choice', correctOption: 'B' });
    expect(checkAnswer.call(p, 'B')).toBe(true);
    expect(checkAnswer.call(p, 'b')).toBe(true);
    expect(checkAnswer.call(p, 'A')).toBe(false);
  });

  test('letter selects option text and compares against answer', () => {
    const p = bind('cat', {
      answerType: 'multiple-choice',
      options: [{ text: 'dog' }, { text: 'cat' }, { text: 'bird' }]
    });
    expect(checkAnswer.call(p, 'B')).toBe(true); // option B is "cat"
    expect(checkAnswer.call(p, 'A')).toBe(false);
  });

  test('symbol-map equivalence ("greater than" === ">")', () => {
    const p = bind('greater than', {
      answerType: 'multiple-choice',
      options: [{ text: 'less than' }, { text: '>' }]
    });
    expect(checkAnswer.call(p, 'B')).toBe(true);
  });

  test('multiple-choice equivalents are honored', () => {
    const p = bind({ value: 'cat', equivalents: ['feline'] }, {
      answerType: 'multiple-choice',
      options: [{ text: 'feline' }]
    });
    expect(checkAnswer.call(p, 'A')).toBe(true);
  });
});

describe('Problem.methods.checkAnswer — numeric/text', () => {
  test('exact match (whitespace + case insensitive)', () => {
    expect(checkAnswer.call(bind('cat'), '  Cat ')).toBe(true);
  });

  test('numeric tolerance: 0.5 ≈ 0.50 ≈ .5', () => {
    expect(checkAnswer.call(bind('0.5'), '0.50')).toBe(true);
    expect(checkAnswer.call(bind('0.5'), '.5')).toBe(true);
  });

  test('fraction equivalence: 1/2 ≡ 2/4 ≡ 0.5', () => {
    expect(checkAnswer.call(bind('1/2'), '2/4')).toBe(true);
    expect(checkAnswer.call(bind('1/2'), '0.5')).toBe(true);
    expect(checkAnswer.call(bind('0.5'), '1/2')).toBe(true);
  });

  test('mixed numbers work: "1 1/2" ≡ "1.5"', () => {
    expect(checkAnswer.call(bind('1.5'), '1 1/2')).toBe(true);
  });

  test('returns false for unrelated answers', () => {
    expect(checkAnswer.call(bind('5'), '7')).toBe(false);
  });

  test('answer.value object form is supported', () => {
    expect(checkAnswer.call(bind({ value: '8', equivalents: [] }), '8')).toBe(true);
  });

  test('equivalents array is accepted', () => {
    expect(checkAnswer.call(bind({ value: 'cat', equivalents: ['feline'] }), 'feline')).toBe(true);
  });
});

describe('Problem.statics.thetaToDifficulty / difficultyToTheta', () => {
  test('thetaToDifficulty maps the full -3..+3 range to 1..5', () => {
    expect(statics.thetaToDifficulty(-3)).toBe(1);
    expect(statics.thetaToDifficulty(0)).toBe(3);
    expect(statics.thetaToDifficulty(3)).toBe(5);
  });

  test('thetaToDifficulty clamps out-of-range input', () => {
    expect(statics.thetaToDifficulty(-10)).toBe(1);
    expect(statics.thetaToDifficulty(10)).toBe(5);
  });

  test('difficultyToTheta maps 1..5 to -3..+3', () => {
    expect(statics.difficultyToTheta(1)).toBe(-3);
    expect(statics.difficultyToTheta(3)).toBe(0);
    expect(statics.difficultyToTheta(5)).toBe(3);
  });
});

describe('Problem.statics.getBySkill', () => {
  test('returns problems for skill, sorted by difficulty', async () => {
    const sortMock = jest.fn().mockResolvedValue([{ difficulty: 1 }, { difficulty: 3 }]);
    const findMock = jest.fn().mockReturnValue({ sort: sortMock });

    const r = await statics.getBySkill.call({ find: findMock }, 'add-fractions');
    expect(findMock).toHaveBeenCalledWith({ skillId: 'add-fractions', isActive: true });
    expect(sortMock).toHaveBeenCalledWith({ difficulty: 1 });
    expect(r).toHaveLength(2);
  });
});

describe('Problem.statics.findNearDifficulty', () => {
  test('returns a problem at exact target difficulty', async () => {
    const find = jest.fn().mockResolvedValue([
      { problemId: 'p1', difficulty: 3, answerType: 'free-response' }
    ]);
    const findOne = jest.fn();

    const r = await statics.findNearDifficulty.call({ find, findOne }, 'skill', 3);
    expect(r.problemId).toBe('p1');
  });

  test('expands the difficulty window when nothing found at exact target', async () => {
    const find = jest.fn()
      .mockResolvedValueOnce([])    // exact (range 0)
      .mockResolvedValueOnce([{ problemId: 'p2', difficulty: 4, answerType: 'free-response' }]); // range 1

    const r = await statics.findNearDifficulty.call(
      { find, findOne: jest.fn() },
      'skill', 3
    );
    expect(r.problemId).toBe('p2');
  });

  test('falls back to ANY active problem when window expansion fails', async () => {
    const find = jest.fn().mockResolvedValue([]); // every range comes back empty
    const findOne = jest.fn().mockResolvedValue({ problemId: 'fallback' });

    const r = await statics.findNearDifficulty.call({ find, findOne }, 'skill', 3);
    expect(r.problemId).toBe('fallback');
  });

  test('preferMultipleChoice option searches MC problems first', async () => {
    const find = jest.fn()
      .mockResolvedValueOnce([{ problemId: 'mc-1', answerType: 'multiple-choice', difficulty: 3 }]);

    const r = await statics.findNearDifficulty.call(
      { find, findOne: jest.fn() },
      'skill', 3, [], { preferMultipleChoice: true }
    );
    expect(r.problemId).toBe('mc-1');
    expect(find.mock.calls[0][0]).toMatchObject({ answerType: 'multiple-choice' });
  });

  test('converts theta-scale input to difficulty', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const findOne = jest.fn().mockResolvedValue(null);

    // theta = 0 → difficulty 3
    await statics.findNearDifficulty.call({ find, findOne }, 'skill', 0);
    const queryAtRange0 = find.mock.calls[0][0].difficulty;
    expect(queryAtRange0).toEqual({ $gte: 3, $lte: 3 });
  });

  test('honors excludeIds list', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const findOne = jest.fn().mockResolvedValue(null);

    await statics.findNearDifficulty.call({ find, findOne }, 'skill', 3, ['p1', 'p2']);
    expect(find.mock.calls[0][0].problemId).toEqual({ $nin: ['p1', 'p2'] });
  });
});

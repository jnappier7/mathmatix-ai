// tests/unit/databaseConfig.test.js
// Unit tests for config/database.js

jest.mock('../../utils/logger', () => ({
  warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

jest.mock('../../utils/dataRetention', () => ({
  startRetentionSchedule: jest.fn()
}));

jest.mock('mongoose', () => ({
  connect: jest.fn(),
  set: jest.fn(),
  connection: { on: jest.fn() }
}));

const mongoose = require('mongoose');
const { startRetentionSchedule } = require('../../utils/dataRetention');

const ORIGINAL_ENV = process.env.NODE_ENV;

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  // re-attach the mocks after resetModules
  jest.doMock('../../utils/logger', () => ({
    warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn()
  }));
});

afterEach(() => { process.env.NODE_ENV = ORIGINAL_ENV; });

describe('connectDatabase', () => {
  test('passes pool/timeout options to mongoose.connect', async () => {
    process.env.NODE_ENV = 'test';
    process.env.MONGO_URI = 'mongodb://test';

    const mongooseMock = require('mongoose');
    mongooseMock.connect.mockResolvedValue();

    const { connectDatabase } = require('../../config/database');
    await connectDatabase();

    expect(mongooseMock.connect).toHaveBeenCalledWith('mongodb://test', expect.objectContaining({
      maxPoolSize: 50,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    }));
  });

  test('does NOT start retention schedule in test env', async () => {
    process.env.NODE_ENV = 'test';
    require('mongoose').connect.mockResolvedValue();
    const dr = require('../../utils/dataRetention');

    const { connectDatabase } = require('../../config/database');
    await connectDatabase();
    expect(dr.startRetentionSchedule).not.toHaveBeenCalled();
  });

  test('starts retention schedule in non-test env', async () => {
    process.env.NODE_ENV = 'production';
    require('mongoose').connect.mockResolvedValue();
    const dr = require('../../utils/dataRetention');

    const { connectDatabase } = require('../../config/database');
    await connectDatabase();
    expect(dr.startRetentionSchedule).toHaveBeenCalled();
  });

  test('exits process on connection failure', async () => {
    require('mongoose').connect.mockRejectedValue(new Error('cant connect'));
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    const { connectDatabase } = require('../../config/database');
    await connectDatabase();

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});

describe('connection event handlers', () => {
  test('registers disconnected/reconnected/error listeners on import', () => {
    const m = require('mongoose');
    require('../../config/database');
    const events = m.connection.on.mock.calls.map(c => c[0]);
    expect(events).toEqual(expect.arrayContaining(['disconnected', 'reconnected', 'error']));
  });
});

// config/database.js — MongoDB connection setup with resilience
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { startRetentionSchedule } = require('../utils/dataRetention');
const { markReady } = require('../utils/lifecycle');

function connectDatabase() {
  return mongoose.connect(process.env.MONGO_URI, {
    maxPoolSize: 50,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
    .then(() => {
      logger.info('Connected to MongoDB', { database: 'MongoDB' });
      // Only now is this instance able to serve a request end-to-end: the
      // connect-mongo session store shares this connection, so until it is up
      // every authenticated request stalls in the session middleware. Flipping
      // readiness here is what stops Render routing to a half-booted instance.
      markReady();
      if (process.env.NODE_ENV !== 'test') {
        startRetentionSchedule();
      }
    })
    .catch(err => {
      logger.error('MongoDB connection error', err);
      process.exit(1);
    });
}

// Connection event handlers — log state changes for monitoring
mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected — mongoose will auto-reconnect');
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB connection error', err);
});

// Log queries only when explicitly opted in (local development, or MONGOOSE_DEBUG=true).
// Opt-in rather than opt-out: an unset NODE_ENV on the host must not leak query logs
// into production, and never enable in test.
if (
  process.env.NODE_ENV !== 'test' &&
  (process.env.MONGOOSE_DEBUG === 'true' || process.env.NODE_ENV === 'development')
) {
  mongoose.set('debug', (collectionName, method, query, doc, options) => {
    logger.debug(`Mongoose: ${collectionName}.${method}`, {
      query: JSON.stringify(query).substring(0, 200),
    });
  });
}

module.exports = { connectDatabase };

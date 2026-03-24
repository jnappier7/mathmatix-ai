// config/database.js — MongoDB connection setup with resilience
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { startRetentionSchedule } = require('../utils/dataRetention');

function connectDatabase() {
  return mongoose.connect(process.env.MONGO_URI, {
    maxPoolSize: 50,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
    .then(() => {
      logger.info('Connected to MongoDB', { database: 'MongoDB' });
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

// Log slow queries in development
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  mongoose.set('debug', (collectionName, method, query, doc, options) => {
    logger.debug(`Mongoose: ${collectionName}.${method}`, {
      query: JSON.stringify(query).substring(0, 200),
    });
  });
}

module.exports = { connectDatabase };

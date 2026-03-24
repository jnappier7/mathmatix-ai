// config/database.js — MongoDB connection setup
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
      logger.info('✅ Connected to MongoDB', { database: 'MongoDB' });
      if (process.env.NODE_ENV !== 'test') {
        startRetentionSchedule();
      }
    })
    .catch(err => {
      logger.error('❌ MongoDB connection error', err);
      process.exit(1);
    });
}

module.exports = { connectDatabase };

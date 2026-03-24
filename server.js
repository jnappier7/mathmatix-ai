// server.js — Application entry point
try { require('dotenv').config(); } catch (_) { /* Production: env vars set by host */ }

const logger = require('./utils/logger');
logger.info('🚀 Starting MATHMATIX.AI Server');

// --- Environment Validation ---
const requiredEnvVars = [
  'MONGO_URI', 'SESSION_SECRET',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL',
  'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_CALLBACK_URL',
  'MATHPIX_APP_ID', 'MATHPIX_APP_KEY', 'OPENAI_API_KEY',
];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  logger.error('❌ FATAL ERROR: Missing required environment variables', { missing: missingVars });
  process.exit(1);
}

// --- App Setup ---
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// --- Configure ---
const { connectDatabase } = require('./config/database');
const { configureMiddleware, authLimiter, signupLimiter } = require('./config/middleware');
const { registerRoutes } = require('./config/routes');

configureMiddleware(app);
connectDatabase();
registerRoutes(app, { authLimiter, signupLimiter });

// --- Start ---
app.listen(PORT, () => {
  logger.info(`🚀 M∆THM∆TIΧ AI is live on http://localhost:${PORT}`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
  });
});

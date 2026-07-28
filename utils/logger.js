// utils/logger.js
// Structured logging with Winston
// Replaces console.log with proper logging levels and formats

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Determine environment
const isDevelopment = process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';

// Log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Colors for console output
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

/**
 * Sanitize sensitive data from logs
 * Prevents passwords, tokens, API keys from being logged
 */
function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  // Compared against key.toLowerCase(), so these MUST be lowercase — a
  // camelCase entry can never match and silently redacts nothing. Most had a
  // lowercase substring covering them by luck ('accessToken' → 'token'), but
  // 'apiKey' and 'creditCard' had none and were being logged in the clear.
  const sensitiveKeys = [
    'password', 'passwordhash', 'newpassword', 'oldpassword', 'confirmpassword',
    'token', 'accesstoken', 'refreshtoken', 'apikey', 'api_key', 'secret',
    'authorization', 'cookie', 'session', 'sessionid', 'csrf', 'csrftoken',
    'ssn', 'creditcard', 'cvv', 'pin'
  ];

  const sanitized = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const lowerKey = key.toLowerCase();

      // Redact sensitive keys
      if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
        sanitized[key] = '[REDACTED]';
      }
      // Recursively sanitize nested objects
      else if (obj[key] && typeof obj[key] === 'object') {
        sanitized[key] = sanitize(obj[key]);
      }
      // Keep non-sensitive values
      else {
        sanitized[key] = obj[key];
      }
    }
  }

  return sanitized;
}

/**
 * Custom format for development (pretty-print with colors)
 */
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, service, userId, ...meta }) => {
    let log = `${timestamp} [${level}]`;

    if (service) log += ` [${service}]`;
    if (userId) log += ` [User: ${userId}]`;

    log += `: ${message}`;

    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(sanitize(meta), null, 2)}`;
    }

    return log;
  })
);

/**
 * Custom format for production (JSON with sanitization)
 */
// Two things here are load-bearing and were previously wrong, which made EVERY
// production log line come out as a bare "undefined":
//   1. ORDER — sanitize must run BEFORE json(), or the serialized payload is
//      built from unredacted fields and the redaction never reaches the output.
//   2. MUTATE, don't replace — winston carries the rendered line on the symbol
//      properties Symbol.for('level') / Symbol.for('message'). sanitize() builds
//      a fresh object with a string-keyed for..in loop, so returning it dropped
//      those symbols; the Console transport then wrote info[MESSAGE] === undefined.
//      Object.assign copies the sanitized fields back onto the SAME info object,
//      leaving winston's symbols intact.
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format((info) => Object.assign(info, sanitize(info)))(),
  winston.format.json()
);

/**
 * Create transports (where logs go)
 */
const transports = [];

// Console transport (always enabled except in test)
if (!isTest) {
  transports.push(
    new winston.transports.Console({
      format: isDevelopment ? developmentFormat : productionFormat,
    })
  );
}

// File transports: opt-in only, via LOG_TO_FILES=true.
//
// Production runs in a Render container with an ephemeral filesystem: these files
// are unreadable while the service is live and are destroyed on every deploy, so
// they never served their purpose. They were also sized to grow to ~1.2GB
// (30x20m + 14x20m + 7x50m) on that same ephemeral disk — a real disk-fill risk
// now that the logger level emits 'http' records. stdout (captured by Render) plus
// the Logtail transport below are the actual log path.
if (process.env.LOG_TO_FILES === 'true' && !isTest) {
  // Error logs (only errors)
  transports.push(
    new DailyRotateFile({
      filename: path.join(__dirname, '../logs', 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '30d',  // Keep 30 days
      maxSize: '20m',   // Max 20MB per file
      format: productionFormat,
    })
  );

  // Combined logs (all levels)
  transports.push(
    new DailyRotateFile({
      filename: path.join(__dirname, '../logs', 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',  // Keep 14 days
      maxSize: '20m',
      format: productionFormat,
    })
  );

  // HTTP logs (for request tracking)
  transports.push(
    new DailyRotateFile({
      filename: path.join(__dirname, '../logs', 'http-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'http',
      maxFiles: '7d',   // Keep 7 days
      maxSize: '50m',
      format: productionFormat,
    })
  );
}

// Better Stack (Logtail) transport — ships structured logs to cloud
// Set LOGTAIL_SOURCE_TOKEN in env to enable
if (process.env.LOGTAIL_SOURCE_TOKEN && !isTest) {
  const { Logtail } = require('@logtail/node');
  const { LogtailTransport } = require('@logtail/winston');
  const logtail = new Logtail(process.env.LOGTAIL_SOURCE_TOKEN);
  transports.push(
    new LogtailTransport(logtail, {
      level: 'info', // Ship info+ to Better Stack (not debug)
    })
  );
}

/**
 * Create Winston logger instance
 */
// 'http' (3) is LESS severe than 'info' (2), and Winston filters by the logger's
// level before transports ever see a record. At level 'info' every log.http() call
// — i.e. the entire request logger, and with it every requestId correlation — was
// silently dropped in production. Production must sit at 'http' or request
// telemetry does not exist.
const logger = winston.createLogger({
  level: isDevelopment ? 'debug' : 'http',
  levels,
  transports,
  exitOnError: false,
});

/**
 * Enhanced logging methods with metadata support
 */
const log = {
  /**
   * Debug-level logs (development only)
   * @param {string} message - Log message
   * @param {object} meta - Additional metadata
   */
  debug: (message, meta = {}) => {
    logger.debug(message, meta);
  },

  /**
   * Info-level logs (general information)
   * @param {string} message - Log message
   * @param {object} meta - Additional metadata
   */
  info: (message, meta = {}) => {
    logger.info(message, meta);
  },

  /**
   * HTTP request logs
   * @param {string} message - Log message
   * @param {object} meta - Request metadata (method, url, status, duration)
   */
  http: (message, meta = {}) => {
    logger.http(message, meta);
  },

  /**
   * Warning-level logs (potential issues)
   * @param {string} message - Log message
   * @param {object} meta - Additional metadata
   */
  warn: (message, meta = {}) => {
    logger.warn(message, meta);
  },

  /**
   * Error-level logs (failures, exceptions)
   * @param {string} message - Log message
   * @param {Error|object} error - Error object or metadata
   */
  error: (message, error = {}) => {
    const meta = error instanceof Error
      ? { error: error.message, stack: error.stack }
      : error;

    logger.error(message, meta);
  },

  /**
   * Create a child logger with default metadata
   * Useful for adding context (userId, service, etc.) to all logs
   *
   * @param {object} defaultMeta - Default metadata to include in all logs
   * @returns {object} Child logger with same methods
   */
  child: (defaultMeta) => {
    const childLogger = logger.child(defaultMeta);

    return {
      debug: (message, meta = {}) => childLogger.debug(message, { ...defaultMeta, ...meta }),
      info: (message, meta = {}) => childLogger.info(message, { ...defaultMeta, ...meta }),
      http: (message, meta = {}) => childLogger.http(message, { ...defaultMeta, ...meta }),
      warn: (message, meta = {}) => childLogger.warn(message, { ...defaultMeta, ...meta }),
      error: (message, error = {}) => {
        const meta = error instanceof Error
          ? { error: error.message, stack: error.stack }
          : error;
        childLogger.error(message, { ...defaultMeta, ...meta });
      },
    };
  },
};

/**
 * Express middleware for HTTP request logging
 */
log.requestLogger = (req, res, next) => {
  const start = Date.now();

  // Log when response finishes (request ID already set by requestId middleware)
  res.on('finish', () => {
    const duration = Date.now() - start;
    const userId = req.user?.id || req.user?._id;

    log.http('HTTP Request', {
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      userId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  });

  next();
};

/**
 * Express error logging middleware
 */
log.errorLogger = (err, req, res, next) => {
  log.error('Express Error', {
    requestId: req.requestId,
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl || req.url,
    userId: req.user?.id || req.user?._id,
    body: sanitize(req.body),
  });

  next(err);
};

// Export logger
module.exports = log;

// Exposed for tests only. The existing logger suite mocks winston.createLogger,
// so the FORMAT pipeline is never exercised there — which is how a production
// format that rendered every line as "undefined" shipped unnoticed. These let a
// test drive the real format end to end.
module.exports._productionFormat = productionFormat;
module.exports._sanitize = sanitize;

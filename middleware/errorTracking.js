/**
 * System-wide HTTP error tracking middleware
 *
 * Tracks all 4xx and 5xx responses with rolling window metrics.
 * Exposes an admin API endpoint for real-time error dashboards.
 */
const logger = require('../utils/logger');

// In-memory error store with rolling 24-hour window
const ERROR_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const errorLog = [];    // { timestamp, status, method, url, message, userId, ip, duration }
const errorCounts = {}; // { '404': count, '500': count, ... }

/**
 * Middleware: tracks HTTP error responses (4xx, 5xx)
 */
function trackErrors(req, res, next) {
  const start = Date.now();

  // Hook into res.end to capture the final status code
  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - start;
    const status = res.statusCode;

    if (status >= 400) {
      const entry = {
        timestamp: new Date().toISOString(),
        status,
        method: req.method,
        url: req.originalUrl || req.url,
        userId: req.user?.id || req.user?._id || null,
        ip: req.ip,
        duration,
        userAgent: req.get('user-agent') || '',
      };

      errorLog.push(entry);
      errorCounts[status] = (errorCounts[status] || 0) + 1;

      // Log 5xx errors at error level, 4xx at warn level
      if (status >= 500) {
        logger.error(`HTTP ${status} ${req.method} ${entry.url}`, {
          status, method: req.method, url: entry.url, duration: `${duration}ms`,
          userId: entry.userId, service: 'error-tracking'
        });
      } else if (status === 404 || status === 401) {
        // Don't spam logs with common 404s/401s — use debug level
        logger.debug(`HTTP ${status} ${req.method} ${entry.url}`, {
          status, method: req.method, url: entry.url, service: 'error-tracking'
        });
      } else {
        logger.warn(`HTTP ${status} ${req.method} ${entry.url}`, {
          status, method: req.method, url: entry.url, duration: `${duration}ms`,
          userId: entry.userId, service: 'error-tracking'
        });
      }
    }

    originalEnd.apply(res, args);
  };

  next();
}

/**
 * Prune errors older than the rolling window
 */
function pruneOldErrors() {
  const cutoff = Date.now() - ERROR_WINDOW_MS;
  while (errorLog.length > 0 && new Date(errorLog[0].timestamp).getTime() < cutoff) {
    errorLog.shift();
  }
}

/**
 * Get error metrics summary (for admin dashboard)
 */
function getErrorMetrics() {
  pruneOldErrors();

  const now = Date.now();
  const last1h = now - (60 * 60 * 1000);
  const last15m = now - (15 * 60 * 1000);

  // Group by status code
  const byStatus = {};
  const byEndpoint = {};
  let count1h = 0;
  let count15m = 0;

  for (const entry of errorLog) {
    const ts = new Date(entry.timestamp).getTime();

    // By status
    if (!byStatus[entry.status]) byStatus[entry.status] = 0;
    byStatus[entry.status]++;

    // By endpoint (group by method + path, strip query params)
    const path = entry.url.split('?')[0];
    const key = `${entry.method} ${path}`;
    if (!byEndpoint[key]) byEndpoint[key] = { count: 0, statuses: {} };
    byEndpoint[key].count++;
    byEndpoint[key].statuses[entry.status] = (byEndpoint[key].statuses[entry.status] || 0) + 1;

    if (ts >= last1h) count1h++;
    if (ts >= last15m) count15m++;
  }

  // Sort endpoints by error count
  const topEndpoints = Object.entries(byEndpoint)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([endpoint, data]) => ({ endpoint, ...data }));

  // Recent errors (last 50)
  const recent = errorLog.slice(-50).reverse();

  return {
    summary: {
      total24h: errorLog.length,
      last1h: count1h,
      last15m: count15m,
      allTime: errorCounts,
    },
    byStatus,
    topEndpoints,
    recent,
  };
}

/**
 * Express route handler: GET /api/admin/error-metrics
 * Returns JSON error metrics for admin dashboards
 */
function errorMetricsHandler(req, res) {
  res.json(getErrorMetrics());
}

/**
 * Express route handler: POST /api/client-errors
 * Receives client-side JavaScript errors from the browser
 */
function clientErrorHandler(req, res) {
  try {
    // Parse body — may come as text from sendBeacon
    let payload;
    if (typeof req.body === 'string') {
      payload = JSON.parse(req.body);
    } else {
      payload = req.body;
    }

    if (payload && payload.message) {
      logger.warn('Client-side error', {
        service: 'client-error',
        message: payload.message,
        source: payload.source,
        line: payload.line,
        col: payload.col,
        url: payload.url,
      });
    }
  } catch (e) {
    // Silently ignore malformed payloads
  }

  res.status(204).end();
}

module.exports = {
  trackErrors,
  errorMetricsHandler,
  clientErrorHandler,
  getErrorMetrics,
};

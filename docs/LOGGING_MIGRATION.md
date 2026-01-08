# Logging Migration Guide

## Overview

This guide helps migrate from `console.log()` to structured logging with Winston.

## Why Migrate?

**Problems with console.log:**
- ❌ No log levels (can't filter by severity)
- ❌ Logs leak sensitive data (passwords, tokens)
- ❌ No structured format (hard to parse/search)
- ❌ No log rotation (files grow indefinitely)
- ❌ Production logs pollute stdout
- ❌ No metadata (can't track userId, requestId, etc.)

**Benefits of Winston:**
- ✅ Log levels (debug, info, warn, error)
- ✅ Automatic sensitive data redaction
- ✅ JSON format (easy to parse/search)
- ✅ Daily log rotation (keeps 7-30 days)
- ✅ Separate log files (error.log, combined.log, http.log)
- ✅ Rich metadata (userId, service, timestamps)

## Import the Logger

```javascript
const logger = require('../utils/logger');
```

## Migration Patterns

### 1. Simple console.log → logger.info

**Before:**
```javascript
console.log('User logged in');
```

**After:**
```javascript
logger.info('User logged in');
```

### 2. console.log with variables → Add metadata

**Before:**
```javascript
console.log(`User ${userId} logged in at ${new Date()}`);
```

**After:**
```javascript
logger.info('User logged in', {
  userId,
  timestamp: new Date()
});
```

### 3. console.error → logger.error

**Before:**
```javascript
console.error('Failed to save user:', error);
console.error('Stack:', error.stack);
```

**After:**
```javascript
logger.error('Failed to save user', error);
// Stack trace automatically included for Error objects
```

### 4. console.warn → logger.warn

**Before:**
```javascript
console.warn('API rate limit approaching');
```

**After:**
```javascript
logger.warn('API rate limit approaching', {
  current: 95,
  limit: 100
});
```

### 5. Debug logs → logger.debug

**Before:**
```javascript
if (process.env.NODE_ENV === 'development') {
  console.log('Debug: Theta estimate =', theta);
}
```

**After:**
```javascript
logger.debug('Theta estimate calculated', {
  theta,
  questionCount: responses.length
});
// Automatically only logs in development
```

### 6. HTTP requests → logger.http (auto-logged)

**Before:**
```javascript
console.log(`${req.method} ${req.url} - ${res.statusCode}`);
```

**After:**
```javascript
// No code needed! HTTP middleware automatically logs all requests
// Includes: method, URL, status, duration, userId, IP
```

### 7. Structured objects → Pass as metadata

**Before:**
```javascript
console.log('Badge earned:', JSON.stringify({ badgeId, skillId, score }));
```

**After:**
```javascript
logger.info('Badge earned', {
  badgeId,
  skillId,
  score
});
```

### 8. Conditional logging → Use appropriate level

**Before:**
```javascript
if (isProduction) {
  console.log('Starting server');
} else {
  console.log('Starting server in dev mode with extra logging');
}
```

**After:**
```javascript
logger.info('Starting server', {
  environment: process.env.NODE_ENV
});

logger.debug('Extra dev info here');
// Debug logs automatically suppressed in production
```

## Log Levels Reference

| Level | When to Use | Production | Development |
|-------|-------------|------------|-------------|
| `logger.debug()` | Detailed diagnostic info | Hidden | Shown |
| `logger.info()` | General informational messages | Shown | Shown |
| `logger.http()` | HTTP request tracking | Shown | Shown |
| `logger.warn()` | Warning conditions | Shown | Shown |
| `logger.error()` | Error conditions | Shown | Shown |

## Advanced Usage

### Child Loggers (Add Context)

Create a logger with default metadata:

```javascript
// In route handler
const routeLogger = logger.child({
  service: 'mastery',
  userId: req.user._id
});

routeLogger.info('Starting placement test');
// Logs: { message: 'Starting placement test', service: 'mastery', userId: '12345', ... }

routeLogger.error('Placement test failed', error);
// Automatically includes service and userId
```

### Service-Specific Loggers

```javascript
// In a service file
const logger = require('../utils/logger');
const serviceLogger = logger.child({ service: 'email-service' });

module.exports = {
  sendEmail: async (to, subject, body) => {
    serviceLogger.info('Sending email', { to, subject });

    try {
      await transporter.sendMail({ to, subject, html: body });
      serviceLogger.info('Email sent successfully', { to });
    } catch (error) {
      serviceLogger.error('Failed to send email', error);
      throw error;
    }
  }
};
```

### Sensitive Data Protection

The logger automatically redacts sensitive fields:

```javascript
logger.info('User created', {
  username: 'john',
  email: 'john@example.com',
  password: 'secret123',  // Automatically redacted
  apiKey: 'sk-abc123'     // Automatically redacted
});

// Logged as:
// {
//   message: 'User created',
//   username: 'john',
//   email: 'john@example.com',
//   password: '[REDACTED]',
//   apiKey: '[REDACTED]',
//   ...
// }
```

**Automatically redacted fields:**
- password, passwordHash, newPassword, oldPassword
- token, accessToken, refreshToken, apiKey, secret
- authorization, cookie, session, csrf
- ssn, creditCard, cvv, pin

## Common Patterns by File Type

### Routes

```javascript
const logger = require('../utils/logger');

router.post('/api/endpoint', async (req, res) => {
  const routeLogger = logger.child({
    service: 'api-endpoint',
    userId: req.user?._id
  });

  routeLogger.info('Processing request', { body: req.body });

  try {
    const result = await someService.process(req.body);
    routeLogger.info('Request successful', { result });
    res.json({ success: true, data: result });
  } catch (error) {
    routeLogger.error('Request failed', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
```

### Services

```javascript
const logger = require('../utils/logger');
const serviceLogger = logger.child({ service: 'mastery-service' });

async function calculateMastery(userId, skillId) {
  serviceLogger.info('Calculating mastery', { userId, skillId });

  try {
    const score = await computeScore(userId, skillId);

    if (score >= 90) {
      serviceLogger.info('Mastery achieved', { userId, skillId, score });
    } else {
      serviceLogger.warn('Mastery not achieved', { userId, skillId, score });
    }

    return score;
  } catch (error) {
    serviceLogger.error('Mastery calculation failed', error);
    throw error;
  }
}
```

### Models

```javascript
const logger = require('../utils/logger');

userSchema.pre('save', async function(next) {
  const modelLogger = logger.child({ service: 'user-model', userId: this._id });

  if (this.isModified('xp')) {
    const oldLevel = this.level;
    this.level = calculateLevel(this.xp);

    if (this.level > oldLevel) {
      modelLogger.info('User leveled up', {
        oldLevel,
        newLevel: this.level,
        xp: this.xp
      });
    }
  }

  next();
});
```

## Search and Replace Guide

### Find all console.log

```bash
# Find all console.log statements
grep -r "console\.log" --include="*.js" .

# Count console.log statements
grep -r "console\.log" --include="*.js" . | wc -l
```

### Automated replacement (use with caution)

```bash
# Replace simple console.log with logger.info
# BACKUP YOUR CODE FIRST!
find . -name "*.js" -type f -exec sed -i 's/console\.log(/logger.info(/g' {} \;

# Replace console.error with logger.error
find . -name "*.js" -type f -exec sed -i 's/console\.error(/logger.error(/g' {} \;

# Replace console.warn with logger.warn
find . -name "*.js" -type f -exec sed -i 's/console\.warn(/logger.warn(/g' {} \;
```

**⚠️ WARNING:** Automated replacement doesn't add metadata or import statements. Manual review required!

## Testing Logs

### Unit Tests

```javascript
// Mock logger in tests
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

const logger = require('../utils/logger');

test('should log user creation', () => {
  createUser({ username: 'test' });

  expect(logger.info).toHaveBeenCalledWith(
    'User created',
    expect.objectContaining({ username: 'test' })
  );
});
```

### View Logs

```bash
# Development: Logs to console (colorized)
npm run dev

# Production: Logs to files
tail -f logs/combined-2024-01-08.log
tail -f logs/error-2024-01-08.log
tail -f logs/http-2024-01-08.log

# Search logs (JSON format)
cat logs/combined-2024-01-08.log | jq '.message' | grep "User logged in"

# Filter by level
cat logs/combined-2024-01-08.log | jq 'select(.level == "error")'

# Filter by userId
cat logs/combined-2024-01-08.log | jq 'select(.userId == "12345")'
```

## Checklist

- [ ] Import logger at top of file
- [ ] Replace console.log with appropriate log level
- [ ] Add structured metadata instead of string interpolation
- [ ] Use child loggers for consistent context
- [ ] Remove sensitive data or rely on auto-redaction
- [ ] Test logging in development
- [ ] Verify logs don't break functionality

## Priority Migration Order

1. **server.js** ✅ - Already migrated
2. **routes/** - High priority (user-facing errors)
3. **middleware/** - Medium priority (auth, security)
4. **utils/** - Medium priority (business logic)
5. **models/** - Low priority (less frequent)
6. **scripts/** - Low priority (batch operations)

## Example PR

```markdown
## Replace console.log with structured logging in routes/chat.js

### Changes
- Imported logger from utils/logger
- Replaced 15 console.log with logger.info
- Replaced 3 console.error with logger.error
- Added metadata (userId, messageId, conversationId)
- Created child logger for chat service

### Benefits
- Logs now include userId for debugging
- Sensitive message content automatically redacted
- Logs searchable by conversationId
- Error stack traces properly captured
```

## FAQ

**Q: Can I still use console.log during development?**
A: Yes, but prefer `logger.debug()` so logs are automatically hidden in production.

**Q: What if I need to log binary data or large objects?**
A: Summarize the data: `logger.info('File uploaded', { size: buffer.length, type: mimetype })`

**Q: How do I log performance metrics?**
A: Use `logger.http()` or add duration metadata:
```javascript
const start = Date.now();
// ... operation ...
logger.info('Operation completed', { duration: `${Date.now() - start}ms` });
```

**Q: Should I log in tests?**
A: Tests automatically suppress logs (NODE_ENV=test). Use `logger.debug()` for test diagnostics.

**Q: How long are logs kept?**
A: Error logs: 30 days, Combined logs: 14 days, HTTP logs: 7 days (configurable in logger.js)

# CSRF Protection Implementation Guide

## Overview

Cross-Site Request Forgery (CSRF) protection has been implemented using the **Double Submit Cookie** pattern. This is a modern, stateless approach that doesn't require server-side session storage.

## How It Works

1. **GET Requests**: Server generates a CSRF token and sets it in a cookie (`_csrf`)
2. **POST/PUT/DELETE Requests**: Client must send the token in the `X-CSRF-Token` header or `_csrf` form field
3. **Verification**: Server compares cookie token with header/form token using constant-time comparison

## Frontend Integration

### Option 1: Use the csrfFetch Helper (Recommended)

Include the CSRF helper in your HTML:

```html
<script src="/js/csrf.js"></script>
```

Then use `csrfFetch()` instead of `fetch()`:

```javascript
// Automatically adds CSRF token to POST/PUT/DELETE requests
csrfFetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({ message: 'Hello' })
})
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error(error));
```

### Option 2: Manual Token Injection

For existing fetch calls, wrap with `addCsrfToken()`:

```javascript
fetch('/api/endpoint', addCsrfToken({
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(data)
}));
```

### Option 3: Form Submissions

For traditional HTML forms:

```html
<form id="myForm" action="/api/submit" method="POST">
  <input type="text" name="field" />
  <button type="submit">Submit</button>
</form>

<script>
  document.getElementById('myForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    addCsrfTokenToForm(formData);  // Add CSRF token

    const response = await fetch('/api/submit', {
      method: 'POST',
      body: formData
    });

    // Handle response...
  });
</script>
```

### Option 4: JSON Request Bodies

```javascript
const token = getCsrfToken();

fetch('/api/endpoint', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': token
  },
  body: JSON.stringify({ data: 'value' })
});
```

## Migration Guide

### Updating Existing Code

**Before (no CSRF protection):**
```javascript
fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hello' })
});
```

**After (with CSRF protection):**
```javascript
// Option A: Use csrfFetch wrapper
csrfFetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({ message: 'Hello' })
});

// Option B: Use addCsrfToken helper
fetch('/api/chat', addCsrfToken({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hello' })
}));
```

### Files to Update

Search for all `fetch()` calls with methods `POST`, `PUT`, `DELETE`, or `PATCH`:

```bash
# Find all fetch calls
grep -r "fetch(" public/js/ --include="*.js"

# Find method: 'POST' patterns
grep -r "method.*POST\|method.*PUT\|method.*DELETE\|method.*PATCH" public/js/
```

**Priority files:**
- `/public/js/script.js` (main chat interface)
- `/public/js/login.js` (login form)
- `/public/js/signup.js` (signup form)
- Any file making API calls

## Error Handling

### CSRF Token Missing

**Error:**
```json
{
  "success": false,
  "message": "CSRF token missing",
  "code": "CSRF_MISSING"
}
```

**Cause:** Client didn't send token in header or cookie is expired

**Fix:**
- Ensure `csrf.js` is included before other scripts
- Check that cookies are enabled
- Verify token is being sent in `X-CSRF-Token` header

### CSRF Token Invalid

**Error:**
```json
{
  "success": false,
  "message": "Invalid CSRF token",
  "code": "CSRF_INVALID"
}
```

**Cause:** Token in header doesn't match token in cookie

**Fix:**
- Refresh the page to get a new token
- Check for middleware conflicts
- Verify cookie domain/sameSite settings

## Testing CSRF Protection

### Unit Tests

```javascript
// tests/unit/csrf.test.js
const { csrfProtection } = require('../../middleware/csrf');

describe('CSRF Protection', () => {
  test('should allow GET requests without token', async () => {
    const req = { method: 'GET', cookies: {}, headers: {} };
    const res = { cookie: jest.fn(), locals: {} };
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledWith('_csrf', expect.any(String), expect.any(Object));
  });

  test('should reject POST without token', async () => {
    const req = { method: 'POST', cookies: {}, headers: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
```

### Integration Tests

```javascript
// tests/integration/csrf.test.js
const request = require('supertest');
const app = require('../../server');

describe('CSRF Integration', () => {
  test('should get CSRF token from GET request', async () => {
    const response = await request(app)
      .get('/chat.html')
      .expect(200);

    const cookies = response.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some(c => c.startsWith('_csrf='))).toBe(true);
  });

  test('should accept POST with valid token', async () => {
    // Get token
    const getResponse = await request(app).get('/chat.html');
    const csrfCookie = getResponse.headers['set-cookie']
      .find(c => c.startsWith('_csrf='))
      .split(';')[0]
      .split('=')[1];

    // Use token in POST
    const response = await request(app)
      .post('/api/chat')
      .set('Cookie', `_csrf=${csrfCookie}`)
      .set('X-CSRF-Token', csrfCookie)
      .send({ message: 'test' });

    expect(response.status).not.toBe(403);
  });
});
```

## Security Best Practices

### DO:
✅ Always use HTTPS in production (CSRF cookies have `secure: true`)
✅ Set appropriate `sameSite` cookie attribute (`strict` or `lax`)
✅ Validate token on all state-changing operations
✅ Use constant-time comparison to prevent timing attacks
✅ Rotate tokens periodically (handled automatically on each GET)

### DON'T:
❌ Don't disable CSRF protection without alternative security measures
❌ Don't send tokens in URL query parameters (use headers or POST body)
❌ Don't reuse tokens across sessions
❌ Don't expose tokens in logs or error messages
❌ Don't trust `Referer` header alone (can be spoofed)

## Exempting Routes (Use Sparingly)

Some routes may need to bypass CSRF (e.g., webhook endpoints):

```javascript
const { csrfExempt } = require('./middleware/csrf');

// In your route file
router.post('/webhook', csrfExempt, async (req, res) => {
  // Webhook handler
  // Should have alternative authentication (API key, signature verification)
});
```

**Important:** Only exempt routes that have **strong alternative authentication** (API keys, signed requests, etc.)

## Troubleshooting

### Issue: "CSRF token missing" on every request

**Possible causes:**
1. Cookies blocked by browser (check privacy settings)
2. `cookieParser()` middleware not loaded
3. Cookie domain mismatch

**Debug:**
```javascript
console.log('Cookies:', document.cookie);
console.log('CSRF Token:', getCsrfToken());
```

### Issue: Token works in browser but not in tests

**Solution:** Include cookies in test requests:

```javascript
const agent = request.agent(app); // Maintains cookies between requests

await agent.get('/login.html'); // Gets token
await agent.post('/api/endpoint').send(data); // Uses token automatically
```

### Issue: CSRF fails after deploying to production

**Check:**
- `NODE_ENV=production` is set
- Cookies have `secure: true` (requires HTTPS)
- `sameSite` attribute is compatible with your deployment

## Further Reading

- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Double Submit Cookie Pattern](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#double-submit-cookie)
- [SameSite Cookies Explained](https://web.dev/samesite-cookies-explained/)

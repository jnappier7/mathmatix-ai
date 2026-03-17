# Student Data Security Audit

**Date:** March 17, 2026
**Scope:** Full codebase review of Mathmatix AI student data handling
**Auditor:** Automated security review

---

## Executive Summary

Mathmatix AI has a **solid security foundation** with meaningful protections in place for student data. The application demonstrates security-conscious design across authentication, authorization, data privacy, and compliance. However, there are several areas requiring attention before the platform could be considered fully production-hardened for handling children's educational data at scale.

**Overall Assessment: GOOD with notable gaps to address**

| Category | Rating | Notes |
|----------|--------|-------|
| Authentication & Session | Strong | Bcrypt, secure sessions, OAuth, brute-force protection |
| Authorization & RBAC | Strong | Role-based access, teacher-student boundaries enforced |
| Data Privacy (PII) | Strong | PII anonymizer strips data before AI API calls |
| CSRF Protection | Strong | Double-submit cookie with timing-safe comparison |
| Input Validation | Good | express-validator on auth routes; not applied to all routes |
| Upload Security | Good | Type/size validation, rate limiting, access control |
| Security Headers | Strong | Helmet.js with comprehensive CSP, HSTS, frameguard |
| COPPA/FERPA/GDPR | Good | Consent management, data deletion/export, audit logging |
| Prompt Injection Defense | Strong | Multi-category pattern detection with logging |
| Logging & Audit | Good | Winston with PII sanitization, daily rotation |
| Encryption at Rest | Needs Work | No field-level encryption for sensitive data in MongoDB |
| Content Moderation | Incomplete | Planned but not implemented for uploaded images |

---

## Strengths (What's Working Well)

### 1. Authentication & Session Security
- **Bcrypt password hashing** with salt rounds of 10 (`models/user.js:183-184`)
- **Secure session cookies**: `httpOnly: true`, `secure` in production, `sameSite: 'lax'` (`server.js:191-195`)
- **Session storage in MongoDB** via `connect-mongo` with 7-day TTL and touch-after optimization (`server.js:184-189`)
- **OAuth 2.0** support for Google and Microsoft, with Clever SSO for school districts
- **Brute-force protection**: Login rate limited to 5 attempts per 15 minutes (`server.js:313-325`)
- **Session destruction on logout** with cookie clearing (`middleware/auth.js:139-144`)

### 2. PII Anonymization Before AI Calls
- **Dedicated PII anonymizer** (`utils/piiAnonymizer.js`) strips names, emails, phone numbers, SSNs, addresses, and MongoDB ObjectIds before sending data to OpenAI/Anthropic
- **Educational data sanitization**: IEP goals, z-scores, and progress percentages are abstracted to prevent re-identification
- **Rehydration**: Student first names are restored in AI responses after anonymization
- This is a notably strong privacy measure that many EdTech platforms lack

### 3. Role-Based Access Control
- **Four-role system**: student, teacher, parent, admin (`middleware/auth.js`)
- **Multi-role support** via `roles` array with fallback to legacy `role` field
- **Upload access control**: Students see only their files; teachers see only their students' files; admins see all (`middleware/uploadSecurity.js:14-68`)
- **Parent-child linking** verified before allowing data access or deletion
- **Teacher-student verification** via enrollment codes for deletion requests

### 4. CSRF Protection
- **Double-submit cookie pattern** with `crypto.randomBytes(32)` tokens (`middleware/csrf.js`)
- **Timing-safe comparison** via `crypto.timingSafeEqual` to prevent timing attacks
- Sensible exemptions for read-only heartbeat endpoints and Stripe webhooks (which use signature verification)

### 5. COPPA/FERPA Compliance Infrastructure
- **Consent management system** (`routes/consent.js`, `utils/consentManager.js`) with three pathways: parent consent, school DPA, and self-consent for 13+
- **Cascade data deletion** (`routes/dataPrivacy.js`) across 13 collections with audit trail
- **Data export** for FERPA right-of-access in JSON format
- **30-day auto-deletion** of student uploads with per-user retention override
- **Consent audit history** with IP address and user agent tracking

### 6. Security Headers
- **Comprehensive Helmet.js configuration** (`server.js:206-283`):
  - Content Security Policy with explicit allowlists
  - HSTS with 1-year max-age, subdomain inclusion, and preload
  - X-Frame-Options: DENY
  - X-Content-Type-Options: nosniff
  - Referrer-Policy: strict-origin-when-cross-origin
  - Permissions-Policy restricting camera, geolocation, payment APIs

### 7. Logging with PII Sanitization
- **Winston logger** (`utils/logger.js`) sanitizes 14+ sensitive field names (password, token, apiKey, ssn, etc.) before writing to logs
- **Daily log rotation** with size limits and retention periods
- **Structured JSON logging** in production for analysis

---

## Vulnerabilities & Gaps

### CRITICAL

#### C1. No Field-Level Encryption for Sensitive Data at Rest
MongoDB stores sensitive student data (IEP plans, assessment results, chat conversations, accommodations) in plaintext. While MongoDB connections may use TLS, the data on disk is unencrypted.

**Risk:** A database breach exposes all student educational records in cleartext.

**Recommendation:** Enable MongoDB encryption at rest, and consider client-side field-level encryption for IEP data, assessment scores, and accommodation details using MongoDB CSFLE or an application-level encryption layer.

#### C2. Image EXIF Metadata Not Stripped
Student homework photo uploads retain GPS coordinates, device info, and timestamps in EXIF metadata (`SECURITY.md:117-119` acknowledges this as planned).

**Risk:** Student physical location could be exposed from uploaded homework photos.

**Recommendation:** Install `sharp` and strip metadata on upload:
```javascript
const sharp = require('sharp');
const cleaned = await sharp(buffer).rotate().withMetadata(false).toBuffer();
```

#### C3. Content Moderation Not Implemented for Uploads
File uploads are validated for type and size, but no content scanning is performed (`middleware/uploadSecurity.js:113`).

**Risk:** Inappropriate or harmful images could be uploaded and stored on the platform.

**Recommendation:** Integrate a content moderation API (AWS Rekognition, Google Cloud Vision SafeSearch, or Azure Content Moderator) for all image uploads.

---

### HIGH

#### H1. `'unsafe-inline'` and `'unsafe-eval'` in CSP
The Content Security Policy allows `'unsafe-inline'` for scripts and styles, and `'unsafe-eval'` for scripts (`server.js:213-214`). While noted as required for MathLive, this significantly weakens XSS protection.

**Risk:** Reflected or stored XSS attacks are not blocked by CSP.

**Recommendation:** Migrate inline scripts to external files with nonces or hashes. Evaluate if MathLive can work without `unsafe-eval` in newer versions.

#### H2. Deletion Audit Trail Stored Only in Logs
Data deletion audit records are written to the logger, not to a persistent, append-only database collection (`routes/dataPrivacy.js:57-68`). Log files can be rotated out or lost.

**Risk:** Compliance audit trail for FERPA/COPPA data deletions could be lost.

**Recommendation:** Create a dedicated `DeletionAudit` MongoDB collection with write-only permissions. This is also noted as a TODO in the code.

#### H3. Rate Limiter Uses In-Memory Store
The upload rate limiter uses the default in-memory store (`middleware/uploadSecurity.js:129`). In a multi-instance deployment, rate limits aren't shared across instances.

**Risk:** Rate limiting is bypassed if requests hit different server instances.

**Recommendation:** Use a Redis-backed rate limiter store (`rate-limit-redis`) for production deployments with multiple instances.

#### H4. Session Cookie `sameSite: 'lax'` Instead of `'strict'`
Session cookies use `sameSite: 'lax'` (`server.js:193`), which allows cookies on top-level navigations from external sites.

**Risk:** Slightly increases CSRF attack surface compared to `strict`, though the CSRF token middleware provides additional protection.

**Recommendation:** Evaluate if `sameSite: 'strict'` is feasible. The existing CSRF protection mitigates the risk, but `strict` provides defense-in-depth.

---

### MEDIUM

#### M1. Input Validation Not Applied to All Routes
The `middleware/validation.js` validators are defined but not consistently applied across all API routes. The chat message validation is defined but may not be enforced on all chat-related endpoints.

**Recommendation:** Audit all POST/PUT/PATCH routes to ensure validation middleware is applied. Focus on routes accepting user-generated content.

#### M2. Error Messages May Leak Information in Development
Several routes return `error.message` or `error.stack` when `NODE_ENV === 'development'` (e.g., `routes/gradeWork.js:452`, `routes/screener.js:204`).

**Recommendation:** Ensure `NODE_ENV` is always set to `production` in deployed environments. Consider removing stack traces from responses entirely.

#### M3. Consent Token Bypass Concern
When a teen student requests parent email consent, `hasParentalConsent` is set to `true` immediately before the parent actually verifies (`routes/consent.js:349`).

**Risk:** Students can self-grant effective consent by entering any email address, as the legacy consent flag is set before email verification completes.

**Recommendation:** Keep `hasParentalConsent` as `false` until the parent actually clicks the verification link. Use a separate `pendingConsent` flag if the student needs limited access during the waiting period.

#### M4. No Two-Factor Authentication
2FA is listed as planned in SECURITY.md but not implemented.

**Recommendation:** Implement TOTP-based 2FA for teacher and admin accounts, which have access to student records across multiple students.

#### M5. Privacy Policy and Terms of Service Pages Missing
SECURITY.md acknowledges these are TODO items (`SECURITY.md:367-370`).

**Recommendation:** Required for COPPA compliance. Prioritize creating clear, accessible privacy policy and terms of service pages.

---

### LOW

#### L1. Console.log Statements for Security Events
Some security events use `console.log`/`console.warn` alongside the structured logger (`middleware/uploadSecurity.js:58`, `middleware/promptInjection.js:170`). This creates inconsistent log formatting.

**Recommendation:** Migrate all security logging to the Winston logger for consistent formatting and sanitization.

#### L2. Upload Filenames Logged with User IDs
Upload validation logs include the original filename and file size (`middleware/uploadSecurity.js:111`). While useful for debugging, this could expose student information in logs.

**Recommendation:** Use stored filenames (not original names) in logs.

#### L3. Demo Account Password in Source Code
`utils/demoData.js` contains demo account passwords. While these are for demo/testing purposes, they should not be hardcoded if demo accounts are accessible in production.

**Recommendation:** Generate demo passwords from environment variables or at runtime.

---

## Compliance Summary

| Regulation | Status | Key Gap |
|------------|--------|---------|
| **COPPA** | Partial | Consent flow exists but has bypass concern (M3); missing privacy policy (M5) |
| **FERPA** | Good | Data access controls, export, and deletion implemented; audit trail needs persistence (H2) |
| **GDPR** | Partial | Right to deletion implemented; data portability exists; missing formal DPO and DPA templates |

---

## Recommendations Priority

1. **Immediate** (before production with real student data):
   - Strip EXIF metadata from uploads (C2)
   - Fix consent token bypass (M3)
   - Persist deletion audit trail to database (H2)
   - Create privacy policy and terms of service (M5)

2. **Short-term** (within 30 days):
   - Implement content moderation for uploads (C3)
   - Enable MongoDB encryption at rest (C1)
   - Move rate limiter to Redis store (H3)
   - Apply input validation to all routes (M1)

3. **Medium-term** (within 90 days):
   - Migrate away from `unsafe-inline`/`unsafe-eval` in CSP (H1)
   - Implement 2FA for teacher/admin accounts (M4)
   - Consolidate all security logging to Winston (L1)
   - Conduct penetration testing

---

*This audit reflects the codebase as of March 17, 2026. Re-audit recommended after addressing the items above.*

# Mathmatix AI - Security & Safety Documentation

## 🛡️ Student Safety & Data Privacy

This document outlines the security and safety measures implemented in Mathmatix AI to protect student data and ensure a safe learning environment.

---

## 📋 Table of Contents

1. [Student Data Privacy](#student-data-privacy)
2. [Image Upload Security](#image-upload-security)
3. [Camera Privacy](#camera-privacy)
4. [Access Control](#access-control)
5. [Data Retention & Deletion](#data-retention--deletion)
6. [Content Safety](#content-safety)
7. [Authentication & Session Security](#authentication--session-security)
8. [Compliance](#compliance)
9. [Incident Response](#incident-response)

---

## 🔐 Student Data Privacy

### What We Collect

**Minimal Data Collection:**
- User account information (name, email, role)
- Student learning progress (XP, level, completed problems)
- Homework photos (uploaded by students)
- Chat conversations with AI tutors
- Teacher-assigned resources

**What We DON'T Collect:**
- Social Security Numbers
- Physical addresses (unless explicitly provided by parent/school)
- Payment information (if applicable)
- Location data beyond IP address
- Camera/microphone access beyond homework photo capture

### Data Storage

- **Database:** MongoDB with encrypted connections
- **File Storage:** Local file system in `/uploads` directory
- **Encryption:** HTTPS/TLS for all data in transit
- **Session Storage:** Secure session cookies with `httpOnly`, `secure`, `sameSite` flags

---

## 📸 Image Upload Security

### File Upload Protections

**Implemented in `/middleware/uploadSecurity.js`:**

1. **File Size Limits**
   - Maximum: 10MB per file
   - Enforced at multer level AND in validation middleware

2. **File Type Validation**
   - Allowed types: JPEG, PNG, WEBP, PDF
   - MIME type checking to prevent disguised files
   - Filename sanitization (no special characters)

3. **Rate Limiting**
   - Maximum 20 uploads per 15 minutes per user
   - Prevents spam and abuse
   - Applies to both `/api/grade-work` and `/api/chat-with-file`

4. **Content Validation**
   ```javascript
   // Future enhancement: Content moderation API integration
   // TODO: Integrate Azure Content Moderator or AWS Rekognition
   ```

### File Storage Security

```
/uploads/
├── [student-upload-filename].jpg    # Stored with unique names
└── teacher-resources/                # Separate directory for teacher files
    └── [teacherId]/
        └── [resource-files]
```

**Security Measures:**
- Files stored with unique, non-guessable names
- No direct public access to `/uploads` directory
- Access controlled through middleware (see Access Control section)

---

## 📷 Camera Privacy

### Privacy Notice

When students open the live camera feature, they see:

```
🛡️ Your Privacy Matters

Your photo is private and secure. Only you and your teacher can see it.
Photos are automatically deleted after 30 days.
```

**Location:** `/public/js/show-your-work.js` - Privacy notice overlay in camera UI

### Camera Permissions

- Camera access requested through standard browser permissions
- Students can deny camera access and use file upload instead
- Camera stream stops immediately when modal closes
- No video recording - only single photo captures

### Metadata Handling

**Current Status:**
- Image metadata (EXIF) is preserved during upload
- **PLANNED:** EXIF stripping to remove GPS location and device info
  - Requires `sharp` library installation
  - Alternative: Client-side stripping before upload

**Recommendation:**
```javascript
// Install sharp for production:
npm install sharp

// In gradeWork.js and chatWithFile.js:
const sharp = require('sharp');

const cleanedImage = await sharp(fileBuffer)
  .rotate() // Auto-rotate based on EXIF
  .withMetadata(false) // Remove all metadata
  .toBuffer();
```

---

## 🔒 Access Control

### Image Access Permissions

**Implemented in `/middleware/uploadSecurity.js`:**

Students can access their own uploaded files:
```javascript
// Check if user is the owner
const isOwner = upload.userId.toString() === userId.toString();
```

Teachers can access their students' files:
```javascript
// Check if user is the student's assigned teacher
const isTeacher = student.teacherId.toString() === userId.toString();
```

Admins can access all files (for moderation):
```javascript
const isAdmin = currentUser.role === 'admin';
```

### Usage

**Protected Routes:**
```javascript
// Apply to file serving routes:
app.get('/uploads/:filename',
    isAuthenticated,
    verifyUploadAccess,
    (req, res) => {
        res.sendFile(...);
    }
);
```

**Access Denied Response:**
```json
{
  "success": false,
  "message": "You do not have permission to access this file"
}
```

### Audit Logging

All file access attempts are logged:
```javascript
console.log(`[Upload Security] Access granted for user ${userId} to file ${filename} (owner/teacher/admin)`);
console.log(`[Upload Security] Access denied for user ${userId} to file ${filename}`);
```

---

## 🗑️ Data Retention & Deletion

### Auto-Deletion Policy

**30-Day Retention:**
- Homework photos automatically deleted after 30 days
- Runs daily cleanup job
- Both file and database record deleted

**Implementation:**

```javascript
// In /middleware/uploadSecurity.js
async function cleanupOldUploads() {
    const RETENTION_DAYS = 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

    // Find and delete old uploads
    const oldUploads = await StudentUpload.find({
        uploadedAt: { $lt: cutoffDate }
    });

    // Delete files from disk and database
    for (const upload of oldUploads) {
        fs.unlinkSync(filePath);
        await StudentUpload.deleteOne({ _id: upload._id });
    }
}

// Scheduled in server.js
scheduleCleanup(); // Runs every 24 hours
```

### Manual Deletion

Students can delete their uploads:
```javascript
// DELETE /api/student/uploads/:id
// Only the owner can delete
```

### Right to Be Forgotten (GDPR/COPPA)

**Parent/Guardian Requests:**
1. Email request to [support@mathmatix.ai](mailto:support@mathmatix.ai)
2. Verification of parent/guardian status
3. Complete data deletion within 30 days

**Implementation:**
```javascript
// Admin tool for complete user data deletion
// TODO: Create admin endpoint for GDPR compliance
```

---

## 🚨 Content Safety

### Content Moderation (Planned)

**Future Integration:**
- Azure Content Moderator API
- AWS Rekognition
- Google Cloud Vision Safe Search

**What We Check:**
- Inappropriate imagery
- Personal information (SSN, credit cards)
- Malicious content

### AI Safety

**Grading AI Guardrails:**
- Educational, age-appropriate tone
- Encouraging feedback only
- No personal advice beyond math
- Temperature: 0.7 for consistency

**Prompt Example:**
```javascript
const gradingPrompt = `You are an expert math teacher...
Be specific, encouraging, and educational.
Remember this is for learning, not just evaluation.`;
```

### Reporting Mechanism

**Current:**
- Manual reporting through teacher dashboard
- Admin review of flagged content

**Planned:**
- Student "Report Issue" button
- Automatic flagging of suspicious uploads
- Parent notification system

---

## 🔑 Authentication & Session Security

### Session Management

```javascript
// In server.js
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true, // Sliding window
  cookie: {
    httpOnly: true,      // Prevents XSS attacks
    secure: true,        // HTTPS only (production)
    sameSite: 'strict',  // CSRF protection
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));
```

### Password Security

- Bcrypt hashing for passwords
- Minimum 8 characters required
- No password storage in plain text

### OAuth Integration

- Google OAuth 2.0
- Microsoft OAuth 2.0
- No password required for OAuth users

### Rate Limiting

**AI Endpoints:**
```javascript
// 30 requests per minute per user
const aiEndpointLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30
});
```

**Upload Endpoints:**
```javascript
// 20 uploads per 15 minutes per user
const uploadRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20
});
```

---

## 📜 Compliance

### COPPA (Children's Online Privacy Protection Act)

**Requirements for Users Under 13:**

1. ✅ **Parental Consent**
   - Required before account creation
   - Verified through email confirmation
   - Parent access to child's account

2. ✅ **Minimal Data Collection**
   - Only collect what's necessary for education
   - No advertising or tracking

3. ✅ **Data Access & Deletion**
   - Parents can review child's data
   - Parents can request deletion
   - 30-day automatic deletion of uploads

4. ⚠️ **Privacy Policy** (TODO)
   - Clear, readable privacy policy
   - Prominent link in footer
   - Explains data collection practices

### FERPA (Family Educational Rights and Privacy Act)

**For School Implementations:**

1. ✅ **Education Records Protection**
   - Student data only accessible by authorized teachers
   - Secure storage and transmission

2. ✅ **Parent Access**
   - Parents can view child's progress
   - Parents can request corrections

3. ✅ **Third-Party Disclosure**
   - No sharing without consent
   - Exception: School officials with legitimate interest

### GDPR (General Data Protection Regulation)

**For EU Users:**

1. ⚠️ **Right to Access** (TODO)
   - Data export functionality
   - Machine-readable format

2. ✅ **Right to Deletion**
   - Manual deletion requests honored
   - 30-day automatic deletion

3. ⚠️ **Data Portability** (TODO)
   - Export all user data in JSON format
   - Include upload history, conversations

4. ⚠️ **Privacy by Design** (In Progress)
   - Minimal data collection ✅
   - Secure defaults ✅
   - EXIF stripping (TODO)

---

## 🚨 Incident Response

### Security Incident Procedure

1. **Detection**
   - Monitor server logs
   - Alert on unusual activity
   - User reports

2. **Containment**
   - Disable affected accounts
   - Block malicious IPs
   - Isolate compromised data

3. **Investigation**
   - Review audit logs
   - Identify scope of breach
   - Document timeline

4. **Notification**
   - Notify affected users within 72 hours
   - Notify parents for student accounts
   - Regulatory notification if required

5. **Remediation**
   - Patch vulnerabilities
   - Reset affected passwords
   - Restore from backup if necessary

### Contact Information

**Security Issues:**
- Email: security@mathmatix.ai
- Response time: Within 24 hours

**General Support:**
- Email: support@mathmatix.ai
- Response time: Within 48 hours

---

## ✅ Security Checklist

### Implemented ✅

- [x] HTTPS/TLS encryption
- [x] Session security (httpOnly, secure, sameSite)
- [x] File upload validation (size, type, filename)
- [x] Upload rate limiting (20/15min)
- [x] AI endpoint rate limiting (30/min)
- [x] Access control for uploaded files
- [x] Auto-deletion of old uploads (30 days)
- [x] Privacy notice in camera interface
- [x] Audit logging for file access
- [x] Authentication required for all student data
- [x] Teacher/student access separation
- [x] Secure password hashing (bcrypt)

### In Progress ⚠️

- [ ] EXIF metadata stripping (requires `sharp` installation)
- [ ] Content moderation API integration
- [ ] Parent consent workflow for COPPA
- [ ] Privacy policy page
- [ ] Terms of service page
- [ ] Data export functionality (GDPR)

### Planned 📋

- [ ] Student "Report Issue" button
- [ ] Admin data deletion tool (GDPR)
- [ ] Suspicious content auto-flagging
- [ ] Parent notification system
- [ ] Two-factor authentication (2FA)
- [ ] Security audit logging dashboard
- [ ] Penetration testing
- [ ] Bug bounty program

---

## 🔧 For Developers

### Adding New Upload Features

1. **Always use security middleware:**
   ```javascript
   router.post('/new-upload',
       isAuthenticated,
       uploadRateLimiter,
       upload.single('file'),
       validateUpload,
       async (req, res) => {
           // Your code here
       }
   );
   ```

2. **Store uploads in StudentUpload model:**
   ```javascript
   const StudentUpload = require('../models/studentUpload');

   const uploadRecord = new StudentUpload({
       userId: req.user._id,
       filename: uniqueFilename,
       fileType: file.mimetype,
       uploadedAt: new Date()
   });
   await uploadRecord.save();
   ```

3. **Never expose upload paths directly:**
   ```javascript
   // ❌ BAD:
   app.use('/uploads', express.static('uploads'));

   // ✅ GOOD:
   app.get('/uploads/:filename', verifyUploadAccess, (req, res) => {
       res.sendFile(path.join(__dirname, 'uploads', filename));
   });
   ```

### Security Code Review Checklist

- [ ] All uploads validated for type and size?
- [ ] Rate limiting applied to endpoint?
- [ ] Authentication required?
- [ ] Access control verified?
- [ ] Audit logging added?
- [ ] Error messages don't leak sensitive info?
- [ ] SQL/NoSQL injection prevented?
- [ ] XSS prevention in user inputs?

---

## 📚 References

- [COPPA Compliance Guide](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)
- [FERPA Overview](https://www2.ed.gov/policy/gen/guid/fpco/ferpa/index.html)
- [GDPR Official Text](https://gdpr.eu/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

---

**Last Updated:** December 19, 2025
**Version:** 1.0
**Maintained by:** Mathmatix AI Security Team

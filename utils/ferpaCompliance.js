/**
 * FERPA COMPLIANCE UTILITY
 *
 * Centralized FERPA compliance functions:
 *
 * 1. ANNUAL NOTIFICATION (34 CFR § 99.7)
 *    Schools must annually notify parents/eligible students of their FERPA rights:
 *    - Right to inspect and review education records
 *    - Right to request amendment of records
 *    - Right to consent to disclosure (with exceptions)
 *    - Right to file a complaint with the Department of Education
 *
 * 2. DIRECTORY INFORMATION (34 CFR § 99.37)
 *    Schools may designate certain info as "directory information" (name, grade, etc.)
 *    but must allow parents to opt out.
 *
 * 3. CONSENT VERIFICATION FOR THIRD-PARTY DISCLOSURE
 *    Verify consent before sharing education records with third parties.
 *
 * @module utils/ferpaCompliance
 */

const logger = require('./logger');
const User = require('../models/user');

// ============================================================================
// DIRECTORY INFORMATION CONFIGURATION
// ============================================================================

/**
 * Fields designated as FERPA "directory information" for Mathmatix.
 * These MAY be disclosed without consent UNLESS the parent opts out.
 * We keep this minimal — only what's needed for class rosters and leaderboards.
 */
const DIRECTORY_INFORMATION_FIELDS = [
    'firstName',
    'gradeLevel',
    'mathCourse',
    'level',           // Gamification level (shown on leaderboards)
    'badges'           // Badge display names (shown on leaderboards)
];

/**
 * Check if a student has opted out of directory information disclosure.
 *
 * @param {Object} user - User document
 * @returns {boolean} True if opted out
 */
function hasOptedOutOfDirectoryInfo(user) {
    return user?.ferpaSettings?.directoryInfoOptOut === true;
}

/**
 * Filter a student object to remove directory information if opted out.
 * Used by leaderboard and class roster endpoints.
 *
 * @param {Object} studentData - Student data to filter
 * @param {Object} user - The student's full user document (with ferpaSettings)
 * @returns {Object} Filtered student data
 */
function filterDirectoryInfo(studentData, user) {
    if (!hasOptedOutOfDirectoryInfo(user)) {
        return studentData;
    }

    const filtered = { ...studentData };
    // Replace directory info with anonymized values
    filtered.firstName = 'Student';
    filtered.lastName = undefined;
    // Keep grade level for teacher view but hide from public displays
    filtered.level = undefined;
    filtered.badges = undefined;

    return filtered;
}

// ============================================================================
// ANNUAL NOTIFICATION (34 CFR § 99.7)
// ============================================================================

/**
 * Generate the annual FERPA rights notification content.
 * This should be sent to all parents/eligible students at the start of each school year
 * and when a new student enrolls.
 *
 * @param {Object} options - { studentName, parentName, schoolName }
 * @returns {Object} { subject, textContent, htmlContent }
 */
function generateAnnualNotification(options = {}) {
    const { studentName, parentName, schoolName } = options;
    const displaySchool = schoolName || 'Mathmatix AI';
    const greeting = parentName ? `Dear ${parentName}` : 'Dear Parent/Guardian';

    const subject = `Annual FERPA Rights Notification — ${displaySchool}`;

    const textContent = `${greeting},

Under the Family Educational Rights and Privacy Act (FERPA), you have certain rights regarding your child's education records maintained by ${displaySchool} through the Mathmatix AI platform. This is your annual notification of those rights.

YOUR FERPA RIGHTS:

1. RIGHT TO INSPECT AND REVIEW
You have the right to inspect and review your child${studentName ? ` (${studentName})` : ''}'s education records within 45 days of making a request. To request access, contact us at support@mathmatix.ai or use the data export feature in your parent dashboard.

2. RIGHT TO REQUEST AMENDMENT
You have the right to request amendment of education records you believe are inaccurate, misleading, or in violation of your child's privacy rights. Submit amendment requests through the parent dashboard under Privacy > Request Record Amendment, or contact support@mathmatix.ai.

3. RIGHT TO CONSENT TO DISCLOSURE
You have the right to consent to disclosure of personally identifiable information from education records, except to the extent FERPA authorizes disclosure without consent. Exceptions include:
   - Disclosure to school officials with legitimate educational interest
   - Disclosure in connection with financial aid
   - Disclosure to accrediting organizations
   - Disclosure to comply with a judicial order or subpoena

4. RIGHT TO OPT OUT OF DIRECTORY INFORMATION
${displaySchool} may designate certain information as "directory information" (student first name, grade level, math course). You may opt out of directory information disclosure through your parent dashboard under Privacy > Directory Information.

5. RIGHT TO FILE A COMPLAINT
You have the right to file a complaint with the U.S. Department of Education if you believe your FERPA rights have been violated:

   Family Policy Compliance Office
   U.S. Department of Education
   400 Maryland Avenue, SW
   Washington, DC 20202

EDUCATION RECORDS MAINTAINED:
Mathmatix AI maintains the following education records for your child:
- Learning progress (skill mastery levels, assessment scores)
- AI tutoring conversation history and summaries
- IEP accommodations and goals (if applicable)
- Homework uploads and grading results
- Course enrollment and session data

ACCESS LOG:
You can view a log of who has accessed your child's education records through the parent dashboard under Privacy > Record Access Log.

For questions about your FERPA rights or to exercise any of these rights, contact:
support@mathmatix.ai

Sincerely,
${displaySchool} Privacy Team`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8f9fa; margin: 0; padding: 0;">
<div style="max-width: 650px; margin: 20px auto; background: white; border-radius: 12px; overflow: hidden;">
  <div style="background: linear-gradient(135deg, #1a5276, #2e86c1); color: white; padding: 30px 20px; text-align: center;">
    <h1 style="margin: 0; font-size: 24px;">Annual FERPA Rights Notification</h1>
    <p style="margin: 10px 0 0; opacity: 0.9; font-size: 14px;">${displaySchool}</p>
  </div>
  <div style="padding: 30px 25px;">
    <p style="color: #555; font-size: 16px; line-height: 1.6;">${greeting},</p>
    <p style="color: #555; font-size: 15px; line-height: 1.6;">
      Under the <strong>Family Educational Rights and Privacy Act (FERPA)</strong>, you have certain rights
      regarding your child${studentName ? ` (${studentName})` : ''}'s education records. This is your annual notification.
    </p>

    <div style="background: #eaf2f8; border-left: 4px solid #2e86c1; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <h3 style="margin: 0 0 10px; color: #1a5276;">1. Right to Inspect and Review</h3>
      <p style="margin: 0; color: #555; line-height: 1.6;">
        You may inspect your child's education records within 45 days of request.
        Use the <strong>Data Export</strong> feature in your parent dashboard or email support@mathmatix.ai.
      </p>
    </div>

    <div style="background: #eaf2f8; border-left: 4px solid #2e86c1; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <h3 style="margin: 0 0 10px; color: #1a5276;">2. Right to Request Amendment</h3>
      <p style="margin: 0; color: #555; line-height: 1.6;">
        You may request correction of records you believe are inaccurate or misleading.
        Submit requests via <strong>Privacy &gt; Request Record Amendment</strong> in your dashboard.
      </p>
    </div>

    <div style="background: #eaf2f8; border-left: 4px solid #2e86c1; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <h3 style="margin: 0 0 10px; color: #1a5276;">3. Right to Consent to Disclosure</h3>
      <p style="margin: 0; color: #555; line-height: 1.6;">
        We do not disclose education records without your consent, except as authorized by FERPA
        (e.g., to school officials with legitimate educational interest).
      </p>
    </div>

    <div style="background: #eaf2f8; border-left: 4px solid #2e86c1; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <h3 style="margin: 0 0 10px; color: #1a5276;">4. Right to Opt Out of Directory Information</h3>
      <p style="margin: 0; color: #555; line-height: 1.6;">
        You may opt out of directory information disclosure (first name, grade level on leaderboards)
        via <strong>Privacy &gt; Directory Information</strong> in your dashboard.
      </p>
    </div>

    <div style="background: #eaf2f8; border-left: 4px solid #2e86c1; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <h3 style="margin: 0 0 10px; color: #1a5276;">5. Right to File a Complaint</h3>
      <p style="margin: 0; color: #555; line-height: 1.6;">
        Family Policy Compliance Office<br>
        U.S. Department of Education<br>
        400 Maryland Avenue, SW<br>
        Washington, DC 20202
      </p>
    </div>

    <div style="background: #fef9e7; border-left: 4px solid #f39c12; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <h3 style="margin: 0 0 10px; color: #e67e22;">Record Access Log</h3>
      <p style="margin: 0; color: #555; line-height: 1.6;">
        View who has accessed your child's records at any time via
        <strong>Privacy &gt; Record Access Log</strong> in your parent dashboard.
      </p>
    </div>

    <p style="color: #666; font-size: 14px; margin-top: 25px;">
      Questions? Contact us at
      <a href="mailto:support@mathmatix.ai" style="color: #2e86c1;">support@mathmatix.ai</a>
    </p>
  </div>
  <div style="padding: 15px; text-align: center; border-top: 1px solid #e0e0e0; background: #f8f9fa;">
    <p style="margin: 0; font-size: 12px; color: #999;">&copy; ${new Date().getFullYear()} MATHMATIX AI. All rights reserved.</p>
  </div>
</div>
</body>
</html>`;

    return { subject, textContent, htmlContent };
}

/**
 * Send annual FERPA notification to all parents with linked children.
 * Should be called once per school year (typically August/September).
 *
 * @param {Function} sendEmailFn - Email sending function (parentEmail, subject, html, text)
 * @returns {Object} Summary of notifications sent
 */
async function sendAnnualNotifications(sendEmailFn) {
    const summary = { sent: 0, failed: 0, skipped: 0, errors: [] };

    try {
        // Find all parents who have linked children
        const parents = await User.find({
            role: 'parent',
            children: { $exists: true, $not: { $size: 0 } }
        }).populate('children', 'firstName').lean();

        for (const parent of parents) {
            try {
                if (!parent.email) {
                    summary.skipped++;
                    continue;
                }

                // Check if already notified this school year
                const currentYear = new Date().getFullYear();
                const schoolYearStart = new Date(currentYear, 7, 1); // August 1
                if (parent.ferpaSettings?.lastAnnualNotification >= schoolYearStart) {
                    summary.skipped++;
                    continue;
                }

                const childNames = parent.children
                    .map(c => c.firstName)
                    .filter(Boolean)
                    .join(', ');

                const notification = generateAnnualNotification({
                    studentName: childNames || undefined,
                    parentName: parent.firstName,
                    schoolName: parent.schoolName
                });

                await sendEmailFn(
                    parent.email,
                    notification.subject,
                    notification.htmlContent,
                    notification.textContent
                );

                // Record that we sent the notification
                await User.findByIdAndUpdate(parent._id, {
                    $set: { 'ferpaSettings.lastAnnualNotification': new Date() }
                });

                summary.sent++;
            } catch (err) {
                summary.failed++;
                summary.errors.push({ parentId: parent._id, error: err.message });
            }
        }

        logger.info('[FERPA] Annual notifications completed', summary);
    } catch (err) {
        logger.error('[FERPA] Annual notification job failed', { error: err.message });
        throw err;
    }

    return summary;
}

/**
 * Send FERPA rights notification to a single parent (e.g., on new enrollment).
 *
 * @param {string} parentId - Parent user ID
 * @param {Function} sendEmailFn - Email sending function
 * @returns {boolean} Success
 */
async function sendEnrollmentNotification(parentId, sendEmailFn) {
    try {
        const parent = await User.findById(parentId).populate('children', 'firstName').lean();
        if (!parent || !parent.email) return false;

        const childNames = parent.children?.map(c => c.firstName).filter(Boolean).join(', ');

        const notification = generateAnnualNotification({
            studentName: childNames || undefined,
            parentName: parent.firstName
        });

        await sendEmailFn(
            parent.email,
            notification.subject,
            notification.htmlContent,
            notification.textContent
        );

        await User.findByIdAndUpdate(parentId, {
            $set: { 'ferpaSettings.lastAnnualNotification': new Date() }
        });

        return true;
    } catch (err) {
        logger.error('[FERPA] Enrollment notification failed', { parentId, error: err.message });
        return false;
    }
}

/**
 * Check if a disclosure requires consent under FERPA.
 * Returns false for FERPA-exempt disclosures (school officials, etc.)
 *
 * @param {string} disclosureType - Type of disclosure
 * @param {Object} context - { accessorRole, hasLegitimateInterest, isDPAPartner }
 * @returns {boolean} True if explicit consent is required
 */
function requiresConsentForDisclosure(disclosureType, context = {}) {
    // FERPA exceptions — no consent required
    const exemptions = {
        // 34 CFR § 99.31(a)(1) - School officials with legitimate educational interest
        school_official: context.accessorRole === 'teacher' || context.accessorRole === 'admin',
        // 34 CFR § 99.31(a)(1)(i)(B) - Contractor under direct control
        dpa_partner: context.isDPAPartner === true,
        // 34 CFR § 99.31(a)(6) - Organizations conducting studies for/on behalf of schools
        research_anonymized: disclosureType === 'anonymized_aggregate',
        // Directory information (if not opted out)
        directory_info: disclosureType === 'directory_information'
    };

    return !Object.values(exemptions).some(exempt => exempt === true);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    // Directory information
    DIRECTORY_INFORMATION_FIELDS,
    hasOptedOutOfDirectoryInfo,
    filterDirectoryInfo,

    // Annual notification
    generateAnnualNotification,
    sendAnnualNotifications,
    sendEnrollmentNotification,

    // Disclosure checks
    requiresConsentForDisclosure
};

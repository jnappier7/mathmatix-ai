# Mathmatix AI — School Leader Feature List

> **"An Affordable Math Tutor for Every Child."**
>
> Mathmatix AI is a personalized, AI-powered math tutoring platform for K–12 students. Below is a comprehensive list of features available to school leaders (principals, assistant principals, and district administrators).

---

## 1. School & District License Management

- **School-level licensing** — Purchase and manage licenses by building or district
- **Tiered student caps** — Configure maximum students per license
- **Annual pricing management** — Track license cost, renewal dates, and status
- **Teacher assignment to licenses** — Assign and reassign teachers under a school license
- **Bulk student propagation** — Automatically enroll all students under licensed teachers
- **License status tracking** — Monitor active, expired, and pending licenses

---

## 2. User & Account Management

- **Create teacher accounts** — Onboard teachers directly from the admin dashboard
- **Create student accounts** — Add individual students or bulk import via CSV roster
- **Create parent accounts** — Set up parent access and link to student profiles
- **Role management** — Assign and modify user roles (student, teacher, parent, admin)
- **Credential distribution** — Send or reset login credentials via email
- **Account merging** — Merge duplicate accounts to keep data clean
- **Account deletion** — Remove users in compliance with data retention policies

---

## 3. Roster & Enrollment

- **CSV roster import** — Bulk-upload students and teachers from spreadsheets
- **Enrollment code management** — Create, edit, and delete class enrollment codes
- **View enrollment rosters** — See which students are in each enrollment code
- **Add/remove students from codes** — Manage class membership at scale
- **Clever SSO integration** — Single sign-on via Clever for seamless district rostering
- **Clever roster syncing** — Automatic roster updates via Clever webhooks
- **Shared device support** — Students can log in from lab/library computers

---

## 4. Teacher–Student Assignment

- **Assign teachers to students** — Link individual teachers to specific students
- **Bulk teacher assignment** — Assign a teacher to multiple students at once
- **Link parents to students** — Manually connect parent accounts to their children
- **Class/section management** — Teachers can create and manage class sections

---

## 5. Student Progress & Performance Analytics

- **Skill mastery reports** — View student proficiency across four pillars: accuracy, independence, transfer, and retention
- **Growth history tracking** — Monitor student growth trajectories over time
- **Learning curve visualization** — IRT-based learning trajectory charts per student
- **Standard Celeration Charts** — Precision teaching data for rate of learning
- **Knowledge maps** — Visual representation of skill connections and mastery
- **Cognitive profiles** — Understand each student's learning patterns
- **Risk radar** — Early identification of students who may be struggling
- **Memory forecasts** — Predict retention and review needs

---

## 6. School-Wide Reporting & Dashboards

- **Platform usage reports** — Track login frequency, session duration, and engagement
- **Live activity feed** — Real-time view of student activity across the school
- **Conversation summaries** — AI-generated summaries of student tutoring sessions
- **Learning outcomes reports** — Platform-wide academic impact data
- **Class skill gap analysis** — Identify skill deficiencies at the class or grade level
- **Class snapshot** — At-a-glance performance overview per class/section
- **Course progress tracking** — Monitor student progress across multiple courses
- **Survey responses & analytics** — Collect and analyze feedback from users
- **Engine health metrics** — System performance and reliability data

---

## 7. Assessment & Placement Oversight

- **Adaptive placement screener** — IRT-based placement test that determines each student's starting level
- **Growth checks** — Short periodic assessments that measure progress (theta tracking)
- **Reset assessments** — Allow students to retake placement or growth checks
- **Placement result visibility** — View any student's initial placement data
- **Checkpoint assessments** — Course-embedded checkpoints to verify understanding

---

## 8. IEP & Accommodation Support

- **IEP plan management** — Create, edit, and track IEP goals per student
- **IEP goal history** — View historical IEP progress data
- **Built-in accommodations** including:
  - Extended time
  - Calculator access
  - Read-aloud / text-to-speech
  - High contrast mode
  - Math anxiety support
  - Chunked assignments
  - Simplified vocabulary
  - Multi-step scaffolding
- **AI-aware accommodations** — The AI tutor automatically adjusts its behavior based on active IEP accommodations

---

## 9. AI Tutor Configuration

- **Class-level AI settings** — Teachers (and admins) can configure per-class:
  - Calculator access (on/off)
  - Scaffolding level (minimal → maximum)
  - Vocabulary preferences (grade-level appropriate)
  - Solution approach style
  - Manipulative usage
  - Response style and tone
- **9 selectable tutor personas** — Students choose from diverse AI tutor characters
- **Anti-cheat safeguards** — AI refuses to give direct answers; guides students through problem-solving
- **AI alert system** — Teachers and admins receive alerts when the AI flags concerning student interactions

---

## 10. Curriculum & Course Catalog

- **10+ math courses** spanning grades 6–12, including:
  - Grade 6, 7, 8 Math
  - Algebra I & II
  - Geometry
  - Pre-Calculus
  - AP Calculus
  - Consumer Math
  - Parent Courses (for family engagement)
- **Pathway-based progression** — Structured scope and sequence per course
- **14 guided lesson modules** — AI-driven, multi-phase instructional lessons
- **Vertical skill alignment** — Skills mapped across grade levels for coherent progression

---

## 11. Student Engagement & Gamification

- **XP & leveling system** — 3-tier experience point ladder to motivate students
- **50+ achievement badges** — Earned for patterns, strategies, habits, and metacognition
- **Daily quests** — Short daily challenges to build consistent practice habits
- **Weekly challenges** — Longer-form tasks for deeper engagement
- **Streak tracking** — Consecutive-day login and practice streaks
- **Leaderboards** — Classroom and school-wide rankings (teacher-controlled visibility)

---

## 12. Multi-Modal Tutoring Experience

- **AI chat tutor** — Real-time conversational math help
- **Voice chat** — Spoken conversations with the AI tutor (text-to-speech via Cartesia)
- **Math OCR / photo upload** — Snap a picture of handwritten homework and the AI reads it (Mathpix)
- **AI lesson planner** — Teachers can generate lesson plans with AI assistance

---

## 13. FERPA Compliance

The platform implements comprehensive safeguards aligned with the Family Educational Rights and Privacy Act (20 U.S.C. § 1232g):

### Right to Inspect & Review (34 CFR § 99.10)
- **Full data export** — Parents and admins can export a student's complete education record as a downloadable JSON file, including: profile data, all tutoring conversations, course sessions, screener/placement results, grading results, uploaded files (metadata), feedback submissions, and direct messages. Sensitive fields (password hashes, tokens) are automatically excluded.

### Right to Request Amendment (34 CFR § 99.20)
- **Amendment request workflow** — Parents or students can submit formal requests to correct inaccurate records (profile info, IEP plans, assessment results, grading results, conversation summaries, skill mastery data, or learning profiles). Each request goes through a tracked lifecycle: *Submitted → Under Review → Approved / Denied / Partially Approved*. Admins review and provide written notes on each decision.
- **Right-to-hearing notification** — When an amendment request is denied, the system automatically records that the parent was notified of their right to a formal hearing, per 34 CFR § 99.21.

### Right to Consent to Disclosure (34 CFR § 99.30)
- **Consent verification** — The system checks whether disclosure requires consent based on the recipient and context. Built-in FERPA exceptions are enforced: school officials with legitimate educational interest, DPA partners (contractors under direct school control), and anonymized aggregate research data do not require additional consent.

### Directory Information Opt-Out (34 CFR § 99.37)
- **Granular opt-out controls** — Parents can opt a student out of directory information disclosure. When opted out, the student's name is replaced with "Student" on leaderboards, and their grade level, math course, gamification level, and badge names are hidden from any public-facing displays. Opt-out date is recorded for audit purposes.

### Annual Notification (34 CFR § 99.7)
- **Automated annual rights notice** — Once per school year (using an August 1 cutoff), the platform sends parents an email summarizing their four FERPA rights: (1) right to inspect and review records, (2) right to request amendment, (3) right to consent to disclosure, and (4) right to opt out of directory information. The notice includes Department of Education contact information for filing complaints. The system tracks when each notification was sent and for which school year.

### Education Record Access Log (34 CFR § 99.32)
- **Comprehensive access audit trail** — Every time a student's education record is accessed, the system logs: who accessed it (user ID, role, name), what was accessed (profile, IEP, conversations, assessments, etc.), how it was accessed (view, export, API read, impersonation, report generation), the legitimate educational interest justifying access, and request metadata (IP address, user agent, timestamp). Logs are automatically purged after 5 years per FERPA best practices.
- **Legitimate interest categories tracked** — Teaching/instruction, academic support, parental right of access, student self-access, administrative function, data export request, audit compliance, and system automated access.

---

## 14. COPPA Compliance

The platform implements age-appropriate consent pathways required by the Children's Online Privacy Protection Act (15 U.S.C. §§ 6501–6506):

### Three Consent Pathways

- **Individual Parent Consent (under 13)** — When a student under 13 signs up independently, the system requires verifiable parental consent. The student provides a parent email address, the system generates a secure token (SHA-256 hashed) with a 7-day expiration, and sends a verification link to the parent. The student account has *limited access* until the parent clicks the link and confirms consent. This prevents children from bypassing COPPA by entering random email addresses.

- **School/District DPA Consent (School Exception)** — When a school or district signs a Data Processing Agreement, an admin can grant consent on behalf of all enrolled students in bulk. The school acts as the parent's agent under the COPPA school exception. Each consent record captures: school name, district name, DPA reference ID, and DPA expiration date. Admins can batch-grant consent to entire classes at once via `/api/consent/grant/batch`.

- **Self-Consent for Ages 13+** — Students aged 13–17 can self-consent. The system calculates age from the `dateOfBirth` field and verifies the student meets the age threshold. Consent is recorded with "age self-certification" as the verification method.

### Consent Scope
All consent pathways cover the same full scope: data collection, AI processing, progress tracking, teacher visibility, parent visibility, and IEP data processing.

### Consent Status Tracking
- **Immutable consent history** — Every consent action (grant, revocation, update) is appended to an immutable audit trail that is never deleted or overwritten. Each record captures: consent type, who granted it (with role and name), timestamp, scope, verification method, IP address, and user agent.
- **Consent states** — Each student's consent status is tracked as one of: *Pending*, *Active*, *Revoked*, or *Expired*.
- **Consent revocation** — Parents or admins can revoke consent at any time. Revocation is recorded with a reason, the student's consent status changes to "revoked," but the consent history is preserved for audit purposes. Data is not automatically deleted upon revocation — a separate deletion request must be submitted.

### Parent-Child Linking
- **Parent invite code flow** — A parent generates an invite code (7-day expiration). When their child signs up with this code, the accounts are automatically linked and parental consent is auto-granted. This allows children under 13 to sign up with pre-approved parent authorization.
- **Student invite code flow** — A student generates a link code and shares it with their parent. When the parent signs up using the code, the accounts are linked and consent is granted.

---

## 15. Data Privacy & Security

- **Cascade data deletion** — When a student is deleted, the system removes all related data across 12+ collections: conversations, course sessions, screener sessions, grading results, uploaded files, feedback, direct messages, enrollment references, announcement receipts, parent links, active sessions, and finally the user document itself. Impersonation logs are anonymized (not deleted) to preserve the audit trail.
- **Deletion audit trail** — Every deletion is recorded in an append-only `DeletionAudit` collection that can never be modified: target user, who requested it, their role, reason, collections affected, document counts per collection, any errors, and duration.
- **Role-based deletion permissions** — Admins can delete any student immediately. Parents can delete their linked child's data. Teachers and students must submit a deletion request for admin approval.
- **Automated data retention policy** — Configurable daily sweep automatically cleans up aged data: inactive conversations after 365 days, student uploads after 30 days, feedback and messages after 365 days, completed assessments and grading results after 3 years, impersonation logs after 3 years, and sessions after 7 days. Supports custom per-district retention policies via school DPA.
- **Impersonation controls** — Admins can view the platform as any non-admin user; teachers can view as their assigned students; parents can view as their linked children. All impersonation sessions are read-only by default (write operations blocked), auto-expire after 20 minutes, and log every page visited and action attempted. Password, email, and admin routes are always blocked during impersonation.
- **CSRF protection** — Cross-site request forgery prevention on all state-changing endpoints
- **Encrypted sensitive fields** — Field-level encryption on email addresses, IP addresses, and user agents in impersonation logs
- **COPPA-compliant image search** — Student image searches are sanitized and filtered for safe educational content

---

## 16. Communication & Outreach

- **Bulk email campaigns** — Send targeted emails to user segments (teachers, parents, students)
- **Parent messaging** — Parents can communicate with teachers through the platform
- **AI alert acknowledgment** — Teachers can acknowledge and respond to AI-generated alerts
- **Survey creation & distribution** — Gather feedback from teachers, students, and parents

---

## 17. Onboarding & Support

- **Demo walkthrough mode** — Guided product tour for new users
- **Local setup documentation** — IT-friendly setup guides
- **Waitlist management** — Pre-launch and rollout waitlist tracking
- **Affiliate program management** — Manage referral and partner programs

---

*For questions or a personalized demo, contact the Mathmatix AI team.*

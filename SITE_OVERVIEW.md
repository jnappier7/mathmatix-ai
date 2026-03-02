# MATHMATIX AI — Site Overview & Active Features

> **For:** Claude Cowork (Marketing Coordinator)
> **Last Updated:** March 2, 2026
> **Live URL:** https://www.mathmatix.ai
> **Repo:** https://github.com/jnappier7/mathmatix-ai

---

## What Is Mathmatix AI?

Mathmatix AI is an AI-powered, personalized math tutoring platform for K-12 students. The tagline is **"See the Patterns, Solve with Ease."** and the mission is **"An Affordable Math Tutor for Every Child."**

It serves four user roles — **students, teachers, parents, and admins** — with distinct dashboards, permissions, and feature sets for each.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js / Express |
| Database | MongoDB (Mongoose ODM) |
| AI Engine | OpenAI GPT (via `openai` SDK) |
| Voice / TTS | ElevenLabs |
| Math OCR | Mathpix |
| Math Rendering | KaTeX, MathLive |
| Payments | Stripe (subscriptions + school licenses) |
| Auth | Passport.js (Local, Google OAuth, Microsoft OAuth, Clever SSO) |
| Hosting | Render (Oregon region) |
| File Storage | AWS S3 |
| Email | Nodemailer (parent reports, admin campaigns) |
| Compliance | FERPA / COPPA consent management, data retention, PII anonymization |

---

## User Roles & Dashboards

| Role | Primary Page | Purpose |
|------|-------------|---------|
| **Student** | `chat.html` (AI tutor chat) | One-on-one AI math tutoring, practice, assessments |
| **Teacher** | `teacher-dashboard.html` | Class management, student monitoring, AI settings, resources |
| **Parent** | `parent-dashboard.html` | Child progress tracking, reports, messaging with teachers |
| **Admin** | `admin-dashboard.html` | User management, bulk email, school licenses, system config |

---

## Active Features — Full List

### Core Tutoring (Student-Facing)

1. **AI Chat Tutor** — Real-time, conversational math tutoring via chat with streaming responses. Students select from multiple AI tutor personas. Supports image upload (photo-of-homework), file upload, and math equation input via MathLive.

2. **Selectable AI Tutor Personas** — Students choose their tutor personality at onboarding:
   - **Bob** — Dad-joke energy, real-world analogies (Geometry, Pre-Calc)
   - **Maya** — Gen Z supportive older sister, confidence builder (Elementary Math, Basic Algebra)
   - **Ms. Maria** — Bilingual Spanish/English, structured and methodical (Algebra I & II, Test Prep)
   - **Mr. Nappier** — Pattern-focused, adventure-style teaching (Foundational Math, Pre-Algebra, Algebra 1)
   - **Ms. Rashida** — Empathetic confidence builder, math anxiety specialist (unlocks at Level 5)
   - **Mr. Sierawski** — Wrestling coach / Algebra teacher, grit and resilience (unlockable)
   - Additional unlockable tutors at higher levels

3. **Voice Chat** — Real-time voice conversation with AI tutors (premium feature). ElevenLabs TTS with per-tutor voice IDs.

4. **Whiteboard / Canvas** — Interactive drawing and math workspace with AI integration. Includes handwriting recognition, math procedure visualization, and split-screen chat+whiteboard layout.

5. **Math OCR (Photo Upload)** — Students photograph handwritten work; Mathpix extracts the math; AI analyzes and tutors from it.

6. **AI Diagram Generation** — AI creates visual diagrams on demand for visual learners.

7. **Guided Lessons** — Structured, AI-driven lesson pathways with phase management.

8. **Calculator** — Built-in calculator with teacher-controlled access settings (always / never / skill-based).

### Assessment & Placement

9. **Adaptive Screener (Starting Point)** — IRT-based adaptive placement test that determines a student's starting skill level. Uses item response theory for efficient, accurate placement.

10. **Growth Check** — Short progress assessments that measure growth over time.

11. **Mastery Mode** — Full mastery-based learning flow: placement test → AI interview → skill practice → badge earning. Includes dedicated mastery chat.

12. **Skills Assessment** — Ongoing adaptive assessment that feeds the personalized learning path.

### Gamification & Engagement

13. **XP & Leveling System** — Three-tier XP ladder:
    - Tier 1 (Silent): Background engagement XP per turn
    - Tier 2 (Performance): Visible XP for correct answers
    - Tier 3 (Behavioral): Ceremonial XP for reasoning, persistence, self-correction
    - New user boost system for early momentum

14. **Badge System** — Pattern-based and strategy badges earned through mastery. Visual badge map (`badge-map.html`) and progress tracking.

15. **Leaderboard** — Classroom and school-wide leaderboards with teacher-controlled visibility.

16. **Daily Quests & Streak System** — Daily challenge objectives to maintain engagement and build study habits.

17. **Weekly Challenges** — Rotating weekly math challenges for sustained engagement.

18. **M∆THBL∆ST (Fact Fluency Blaster)** — Timed math facts practice game for building automaticity with basic operations.

19. **Number Run** — Math-themed game for fact practice.

20. **Mastery Arcade** — Gamified mastery practice hub.

21. **Avatar Builder** — DiceBear-based custom avatar creation and customization.

22. **Unlockable Tutors** — New AI tutor personas unlock as students level up (reward for progression).

### Data Visualization & Progress

23. **Learning Curves** — IRT-based learning curve visualization showing student growth trajectories with transparency into the adaptive algorithm.

24. **Standard Celeration Charts** — Precision Teaching celeration charts for fact fluency tracking (both student and teacher views).

25. **Speed Progress Tracking** — Fact fluency speed and accuracy over time.

26. **Progress Dashboard** — Student-facing progress overview with skill completion and XP history.

27. **Quarterly Growth Reports** — Longitudinal growth tracking and retention analytics.

### Teacher Features

28. **Teacher Dashboard** — Full class overview with student list, performance data, and management tools.

29. **Class AI Settings** — Teachers control AI behavior per class: calculator access, hint levels, problem difficulty, and more.

30. **Teacher-Parent Messaging** — Built-in messaging system between teachers and parents.

31. **Teacher-to-Student Announcements** — IM-style announcements from teacher to students.

32. **Teacher Resources** — File upload and resource management for distributing materials to students.

33. **Teacher Celeration Dashboard** — Aggregate celeration chart data across all students.

34. **IEP Templates & Accommodations** — Built-in IEP goal tracking and accommodation settings (extended time, read-aloud, calculator access, reduced distraction, math anxiety support, etc.).

35. **Student Impersonation (Student View)** — Teachers (and parents/admins) can view the platform as a specific student sees it (read-only).

36. **Curriculum Schedule Management** — Teachers manage and align curriculum schedules.

37. **Live Feed** — Real-time student activity monitoring.

38. **AI Grade Work** — AI-powered grading of student work submissions (premium feature).

### Parent Features

39. **Parent Dashboard** — Child progress overview, activity summaries, and growth reports.

40. **Parent Email Reports** — Automated email digests of student progress (configurable frequency).

41. **Parent Course Content** — Grade-band parent education content (K-2, 3-5, 6-8) to help parents support their child.

42. **Parent-Teacher Messaging** — Direct messaging with child's teacher.

43. **Parent-Child Linking** — Invite code system for parents to link to their child's account.

### Course System

44. **Course Catalog** — Browsable course catalog with enrollment:
    - 6th Grade Math, 7th Grade Math, Grade 8 Math
    - Algebra 1, Algebra 2, Geometry
    - Pre-Calculus, AP Calculus AB, Calculus BC
    - Consumer Math, ACT Prep
    - Early Math Foundations
    - Parent courses (K-2, 3-5, 6-8)

45. **Pathway-Based Course Sessions** — Self-paced course progression through structured pathways.

46. **Dedicated Course Chat** — Separate AI chat context per course (independent from main tutor chat).

### Authentication & Onboarding

47. **Multi-Provider Auth** — Google OAuth, Microsoft OAuth, Clever SSO, and email/password.

48. **Clever SSO & Roster Sync** — Full Clever integration for school districts (SSO, roster import, section sync, webhook events). Shared-device support for library/lab environments.

49. **Email Verification** — Required email verification flow for new accounts.

50. **Enrollment Codes** — Teacher-generated codes that students use to join a class during signup.

51. **Profile Completion Flow** — Guided onboarding: signup → complete profile → pick tutor → pick avatar → start learning.

52. **Guided Tour & Survey** — First-time user tour and alpha feedback survey.

53. **Returning User Modal** — Welcome-back context for returning students.

54. **Demo / Playground Mode** — Pre-built demo accounts for trying the platform without signup. Includes demo banner and auto-reset.

### Billing & Licensing

55. **Stripe Subscription Billing** — Individual subscription plans with Stripe integration (webhook-verified).

56. **School / District Licenses** — Bulk licensing for schools and districts. License-gated unlimited access for students.

57. **Free Tier** — 20 free AI-minutes per week for students. Teachers, parents, and admins have unlimited free access.

58. **Premium Feature Gating** — Voice chat, file uploads, and AI grading are gated behind premium tiers.

59. **Pre-Launch Waitlist** — Email waitlist collection for pre-launch marketing.

### Platform & Infrastructure

60. **Internationalization (i18n)** — Translation framework with multi-language support.

61. **Dark Mode** — Full dark mode theme toggle.

62. **Mobile-Responsive Design** — Mobile-optimized layouts, touch fixes, orientation handling, pinch-zoom in chat.

63. **Session Management** — Idle timeout detection, auto-save, session summaries.

64. **Conversation Memory** — AI maintains context across sessions with topic-based conversation history.

65. **Rapport Building** — AI rapport-building system that personalizes interactions based on student interests.

66. **Anti-Cheat Safeguards** — Detection and prevention of answer-copying and gaming behaviors.

67. **Anti-Gaming Protection** — Prevents XP farming and system exploitation.

68. **Prompt Injection Protection** — Middleware-level defense against prompt injection attacks.

69. **CSRF Protection** — Full cross-site request forgery protection on all state-changing endpoints.

70. **Upload Security** — Rate limiting, file validation, 30-day auto-deletion for uploaded files.

71. **Data Retention & Privacy** — FERPA/COPPA-compliant data retention schedules, automated archival of old conversations, PII anonymization, data export and deletion on request.

72. **Feedback & Bug Reports** — In-app feedback system for alpha testers.

73. **AI-Triaged Support Tickets** — Support ticket system with AI-powered triage and routing.

74. **Admin Bulk Email** — Admin tool for sending targeted email campaigns to user segments.

75. **Winston Logging** — Structured logging with daily rotation for production monitoring.

76. **Misconception Detection** — AI identifies and addresses common math misconceptions.

77. **Hint System** — Graduated hint system that scaffolds without giving away answers.

78. **DOK Gating** — Depth of Knowledge gating for appropriate problem difficulty.

79. **Show Your Work** — Students can submit and explain their work process.

---

## Branding Quick Reference

| Element | Value |
|---------|-------|
| Brand Name | M∆THM∆TIΧ AI |
| Tagline | "See the Patterns, Solve with Ease." |
| Mission | "An Affordable Math Tutor for Every Child." |
| Primary Color | Teal `#12B3B3` |
| Accent Color | Hot Pink `#FF3B7F` |
| Success | Green `#16C86D` |
| Warning | Gold `#FFC24B` |
| Error | Red `#FF4E4E` |
| Font | Inter (headlines + body) |
| Icon Style | Clean, flat-shaded cartoon (2px stroke, teal) |

---

## Key Differentiators (Marketing Angles)

- **Persona-based tutoring** — Students choose a tutor personality that matches their learning style
- **Bilingual support** — Ms. Maria delivers full Spanish/English instruction
- **Teacher-aware** — Teachers control AI behavior, calculator access, and can monitor everything
- **IEP-ready** — Built-in IEP accommodations and goal tracking
- **FERPA/COPPA compliant** — Enterprise-grade privacy for schools
- **Clever SSO** — One-click login for any Clever-enabled school district
- **Affordable** — Free tier with 20 min/week; school licenses for unlimited access
- **Gamified but pedagogically sound** — XP, badges, streaks, and leaderboards drive engagement without cheapening learning
- **Precision Teaching** — Standard Celeration Charts and IRT-based adaptive placement
- **Parent involvement** — Dedicated parent dashboard, reports, courses, and teacher messaging

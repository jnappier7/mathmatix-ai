# INCIDENT_RESPONSE.md — what to do when student data may have been exposed

> This is the runbook. It exists because nothing else did: a search of `docs/`, `routes/`
> and `utils/` for "incident" or "breach" found nothing, while every district DPA we sign
> commits us to a notification window and every state student-privacy law imposes one.
> A promise with no procedure behind it is the thing a district security review is
> designed to find.
>
> **Read the whole thing once now, not for the first time at 2am.**

---

## 0. Who and where

| Role | Who | Backup |
|------|-----|--------|
| **Incident lead** — decides severity, owns the timeline, makes the calls | Jason Nappier (founder) | _(name a backup)_ |
| **Technical responder** — containment and forensics in the stack below | Jason Nappier | _(name a backup)_ |
| **Notifications** — districts, parents, regulators, counsel | Incident lead | Counsel |

**Counsel:** _(name, phone, email)_ — engage at Sev 1/2 before any external notification.

**Where the evidence is** (all in production Mongo unless noted):

| What | Where | What it tells you |
|------|-------|-------------------|
| Who accessed which student record, when, from where | `educationrecordaccesslogs` (`models/educationRecordAccessLog.js`) — `studentId`, `accessedBy`, `accessedByRole`, `recordType`, `accessType`, `ipAddress`, `userAgent`, `accessedAt` | Scope of exposure by student; whether access was by an authorised role |
| Staff impersonation sessions | `impersonationlogs` (`models/impersonationLog.js`) | Every staff view of a student account: read-only, 20-minute cap, fully logged |
| Deletions | `deletionaudits` (`models/deletionAudit.js`) | Whether data was destroyed, by whom, with document counts |
| Consent state and history | `GET /api/consent/history/:studentId` (admin) | Which students were under parental consent at the time |
| Application logs | Better Stack (Logtail) + rotating files on the Render instance | Request paths, user IDs, timing; secrets redacted at write time |
| Errors | Sentry — route, stack, user id only (request bodies, cookies, headers, IPs are stripped by `utils/sentryScrub.js`) | What broke; **not** what data was in flight |
| HTTP error tracking | `middleware/errorTracking.js` — in-memory 24h window, admin endpoint | Recent 4xx/5xx by route with user id and IP |
| Stripe events | `webhookevents` collection + Stripe dashboard | Billing-side activity |

**Access needed:** Render dashboard, MongoDB (Atlas) console, Sentry, Better Stack, Stripe, the DNS registrar, and every API-key console on `public/subprocessors.html`.

---

## 1. Severity

Decide this first. It sets the clock.

| Sev | Definition | Examples | External notification? |
|-----|-----------|----------|------------------------|
| **1** | Confirmed unauthorised access to, or exfiltration of, student personal data | Database credential leaked and used; a bug that showed one student's conversation to another; a compromised admin account | **Yes** — districts per DPA window, parents, regulators as counsel advises |
| **2** | Credible possibility of the above, not yet confirmed | A leaked API key or session secret with no evidence of use yet; a subprocessor reports a breach on their side | **Probably** — start the DPA clock now; confirm or downgrade within 24h |
| **3** | Security failure with no student data involved | A marketing page defaced; a DoS; a leaked key for a service that holds no student data | No — fix, write it up, done |
| **4** | Near miss or process gap found in review | A test caught a regression before deploy; this runbook found wanting | No — fix the gap |

Student personal data means anything in `models/user.js`, `conversation.js`, `iepPlan.js`, `studentUpload.js`, `screenerSession.js`, `gradingResult.js`, or `message.js`. IEP data is the most sensitive category we hold.

**When in doubt, call it Sev 2.** Downgrading later costs nothing. Upgrading later costs the notification window.

---

## 2. First hour — contain

Do these in order. Write down the time of each action; you will need the timeline.

1. **Stop the bleeding before you understand it.** If a credential is exposed, rotate it now, understand it later:
   - **Session secret** → change `SESSION_SECRET` on Render and redeploy. Every user is logged out; that is the point. Sessions are in Mongo via `connect-mongo` — drop the `sessions` collection too if the store itself was exposed.
   - **Database** → rotate the Atlas user password, update `MONGO_URI`, redeploy. Check Atlas access logs for unknown IPs.
   - **A provider key** (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `MATHPIX_*`, `DEEPGRAM_API_KEY`, `CARTESIA_API_KEY`, `SIMLI_API_KEY`, `STRIPE_SECRET_KEY`, OAuth client secrets) → revoke in that provider's console first, then set the new value on Render. Stripe: also roll the webhook secret.
   - **Field encryption key** (`FIELD_ENCRYPTION_KEY`) → **do not rotate blindly**; data encrypted under the old key becomes unreadable. Contain by other means and escalate.
2. **Disable impersonation** if a staff account is suspect: staff impersonation is read-only and 20-minute-capped, but disable the account itself in the admin dashboard.
3. **Pull the affected surface if you cannot contain it otherwise.** Render lets you scale to zero; a short outage is better than an open door.
4. **Preserve evidence before it rolls.** `errorTracking.js` keeps only 24h in memory. Export the relevant window from Better Stack and Sentry, and snapshot the Atlas access log, before touching anything else.
5. **Open the timeline** — a single document, UTC timestamps, one line per action, starting with when you first knew.

---

## 3. First day — scope

Answer these, in writing, with the evidence source for each:

- **What data**, by model and field. Names? Conversations? IEP accommodations? Uploaded work?
- **Whose data** — list of `studentId`s. `educationrecordaccesslogs` filtered by time window and the compromised actor is the primary source; join to `users` for school and linked parent.
- **Which schools** — from `schoolLicenseId` / `section` membership. Each is a separate DPA and a separate notification.
- **How** — root cause, stated plainly. "A query filtered on `role` instead of `roles`" is a root cause; "a bug" is not.
- **When** — exposure window, first possible to contained.
- **Whether it left** — was data read, copied, or only readable? The access logs distinguish these; be honest when they cannot.

If a **subprocessor** reported the incident, get their written scope and timeline and hold them to their DPA (OpenAI) or terms.

---

## 4. Notify

**The order:** counsel → affected schools → affected parents → regulators. Never parents before the school when the account is school-provisioned; the school is the data controller under FERPA and notifies its own families.

| Who | Trigger | Window | How |
|-----|---------|--------|-----|
| **Counsel** | Sev 1 or 2 | Immediately | Phone |
| **Each affected school/district** | Sev 1, or Sev 2 involving their students | **The window in their DPA** — commonly 24 to 72 hours from discovery; check the signed agreement, not this table | Written notice to the DPA contact; phone call first for Sev 1 |
| **Parents of affected students** (direct-signup accounts) | Sev 1 | As counsel advises; state law may set it | Email to the linked parent account; plain language |
| **Parents of school-provisioned students** | Sev 1 | Via the school | Provide the school a draft they can send |
| **State attorneys general / education departments** | Depends on the state and the count | Counsel decides | Counsel |
| **Subprocessor** | If the cause is on their side, or their data is implicated | Immediately | Their security contact |

**What every notice contains:** what happened, what data, whose, when, what we did, what they should do, who to contact. No speculation, no minimising, no legal boilerplate in place of an answer.

**What to write down:** every notice sent, to whom, when, by what channel. Districts will ask.

---

## 5. After — the review

Within a week of closing, a written post-incident review answering:

- Timeline, complete.
- Root cause, and why the existing controls did not catch it.
- **The test that now exists so this class of failure fails CI.** This codebase's convention is that every bug worth a fix gets a test that pins it (see `tests/unit/` for the pattern: each file opens with *the bug this catches*). An incident is the most expensive bug there is.
- Which promises on `public/safety.html`, `public/subprocessors.html` and `public/privacy.html` turned out to be inaccurate, and their corrections.
- What in this runbook was wrong or missing.

The review goes in `docs/incidents/YYYY-MM-DD-<slug>.md`. Commit it. The point of writing it down is that the next person can read it.

---

## 6. Standing hygiene, so the runbook is rarely needed

- **Backups.** Atlas continuous backup; confirm restore works quarterly, not "confirm the setting is on."
- **Key rotation.** Rotate every key on `public/subprocessors.html` annually, and immediately on any staff departure.
- **Least privilege on consoles.** Render, Atlas, Sentry and every provider console: individual logins, MFA on, no shared credentials. `docs/STUDENT_DATA_SECURITY_AUDIT.md` M4 notes the app itself has no 2FA; the consoles that hold the keys to it must.
- **Retention runs.** The daily retention sweep (`utils/dataRetention.js`) is the thing that makes an old breach small. Alert if it has not completed in 48 hours.
- **Read the audit.** `docs/STUDENT_DATA_SECURITY_AUDIT.md` lists open items. The open CRITICAL (content moderation on uploads) and HIGH (in-memory rate limiter, CSP `unsafe-inline`) items are the most likely next incident.
- **Re-read this** every six months and after every incident. Fill in the blanks in §0.

---

## Appendix — one-page checklist

```
[ ] Time of discovery written down (UTC)
[ ] Severity decided (default Sev 2 if unsure)
[ ] Credential rotated / actor disabled / surface pulled
[ ] Evidence exported (Better Stack, Sentry, Atlas access log) BEFORE further changes
[ ] Counsel called (Sev 1/2)
[ ] Scope written: what / whose / which schools / how / when / did it leave
[ ] DPA windows checked for every affected school
[ ] Schools notified (written), parents notified (direct or via school)
[ ] Every notice logged: who, when, channel
[ ] Root cause written plainly
[ ] Regression test added and merged
[ ] Public pages corrected where inaccurate
[ ] Post-incident review committed to docs/incidents/
[ ] This runbook updated
```

# Subprocessors

The third-party service providers M∆THM∆TIΧ AI uses to deliver the product, the purpose
each serves, and the categories of data each may process. Maintained for school/district
data-privacy reviews; also see `public/privacy.html`.

**Last updated:** August 11, 2026

| Vendor | Purpose | Data categories | Retention | Agreement status |
|--------|---------|-----------------|-----------|------------------|
| **OpenAI** | AI tutoring (chat, structured verification), vision-based grading of uploaded work, Whisper voice-transcription fallback, embeddings | Tutoring messages and uploaded work; personalization context (student first name, grade level, learning preferences, applicable IEP accommodations) | API business terms; zero-data-retention request in progress | DPA: confirmation in progress |
| **Anthropic** | AI tutoring responses (Claude) | Same as OpenAI tutoring context | API commercial terms (no training on customer data) | DPA: incorporated in Commercial Terms — confirmation in progress |
| **Mathpix** | Math OCR of uploaded images/PDFs | Uploaded homework images/PDFs (EXIF stripped before upload) | Per Mathpix API terms | TBD |
| **Deepgram** | Voice speech-to-text | Voice audio during voice tutoring (13+) | Per Deepgram API terms | TBD |
| **Cartesia** | Voice text-to-speech | Tutor reply text for audio synthesis (13+) | Per Cartesia API terms | TBD |
| **AWS S3** (or S3-compatible store) | File storage for uploads | Uploaded student work (30-day auto-delete) | 30 days (configurable per district) | Standard AWS DPA |
| **MongoDB Atlas** | Primary database | All application data; sensitive fields AES-256-GCM encrypted at the field level | Governed by our retention policy (`utils/dataRetention.js`) | Standard MongoDB DPA |
| **Render** | Application hosting | All data in transit through the app | N/A (host) | Standard Render terms |
| **Stripe** | Billing (individual subscriptions, school licenses) | Payer (adult) billing details only — never student records; card data never touches our servers | Per Stripe terms | Stripe DPA (standard) |
| **Sentry** | Error monitoring (5xx only) | Error metadata; request PII scrubbed | Per Sentry retention settings | Standard Sentry DPA |
| **Better Stack (Logtail)** | Log aggregation | Application logs with secret/PII redaction (`utils/logger.js`) | Per plan retention | TBD |
| **Email provider (via Nodemailer)** | Transactional email (consent verification links, digests, notifications) | Recipient email addresses, notification content | Transient | TBD |
| **Clever** | School SSO and roster sync (districts that use Clever) | Roster data the district shares via Clever | Synced; removed with the district relationship | Governed by the district's Clever agreement |

Notes:

- "TBD" rows indicate the agreement is under the vendor's standard API/service terms while a
  signed DPA is being confirmed; this table is updated as each confirmation lands.
- Google and Microsoft provide OAuth sign-in only (identity assertion); they do not receive
  education records from us.
- Marketing analytics (Meta Pixel) runs **only** on the public `quiz.html` ad-landing page,
  never on logged-in or student-facing pages.

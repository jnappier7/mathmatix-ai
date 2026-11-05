/**
 * MARKETING EMAIL OPT-OUT — the one place that knows how an unsubscribe works.
 *
 * Any email that is not strictly transactional (admin broadcasts, the
 * reactivation campaign, "what's new" mail) is MARKETING under CAN-SPAM and
 * must carry a working opt-out that we honor. Before this module the footers
 * pointed at a settings page that did not exist, or at a mailto nobody
 * processed, and there was no field to record a "no" — so every broadcast
 * went to everyone, every time.
 *
 * The pieces, all here so a sender cannot get one without the others:
 *
 *   signUnsubscribeToken / verifyUnsubscribeToken
 *       An HMAC-signed token naming ONE recipient (`user:<id>` or
 *       `waitlist:<id>`). No login needed to act on it — the person is
 *       standing in their inbox, not on our site — and it never expires,
 *       because an unsubscribe link in a six-month-old email must still work.
 *       Secret: EMAIL_UNSUBSCRIBE_SECRET, falling back to SESSION_SECRET.
 *
 *   unsubscribeUrl(kind, id)
 *       The GET page (/unsubscribe?t=…). A human lands there and confirms with
 *       one click. The GET does NOT opt anyone out by itself: link scanners
 *       (Outlook Safe Links, corporate gateways) prefetch every URL in an
 *       email, and a GET that unsubscribes would silently remove whole
 *       districts.
 *
 *   marketingHeaders(url)
 *       RFC 2369 List-Unsubscribe + RFC 8058 List-Unsubscribe-Post, so Gmail,
 *       Apple Mail and Outlook show their own "Unsubscribe" button, which POSTs
 *       to the same URL with `List-Unsubscribe=One-Click`. Gmail requires
 *       these from bulk senders since 2024.
 *
 *   marketingOptOutFilter()
 *       The Mongo clause every marketing audience query must include.
 *
 *   setMarketingOptOut(kind, id, optOut, source)
 *       The only writer of `emailPreferences.marketingOptOut`.
 *
 * Transactional mail (password reset, consent requests, receipts, safety
 * alerts) does NOT go through this — a parent who opted out of marketing must
 * still get the consent email. Pinned by tests/unit/emailUnsubscribe.test.js
 * and tests/integration/unsubscribeRoute.test.js.
 *
 * @module utils/emailUnsubscribe
 */

const crypto = require('crypto');
const mongoose = require('mongoose');

const KINDS = Object.freeze(['user', 'waitlist']);
const SOURCES = Object.freeze(['link', 'one-click', 'settings', 'admin']);

function secret() {
  const s = process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.SESSION_SECRET;
  if (!s) throw new Error('EMAIL_UNSUBSCRIBE_SECRET or SESSION_SECRET must be set to sign unsubscribe links');
  return s;
}

function getBaseUrl() {
  return (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

function hmac(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

/**
 * @param {{kind:'user'|'waitlist', id:string|object}} who
 * @returns {string} opaque, URL-safe token
 */
function signUnsubscribeToken({ kind, id }) {
  if (!KINDS.includes(kind)) throw new Error(`Unknown unsubscribe kind: ${kind}`);
  const idStr = String(id);
  if (!mongoose.isValidObjectId(idStr)) throw new Error('Unsubscribe token needs an ObjectId');
  const payload = `${kind}.${idStr}`;
  return `${payload}.${hmac(payload)}`;
}

/**
 * @returns {{kind:string,id:string}|null} null for anything not signed by us
 */
function verifyUnsubscribeToken(token) {
  if (typeof token !== 'string' || token.length > 200) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [kind, id, sig] = parts;
  if (!KINDS.includes(kind) || !mongoose.isValidObjectId(id)) return null;
  let expected;
  try { expected = hmac(`${kind}.${id}`); } catch { return null; }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { kind, id };
}

function unsubscribeUrl(kind, id, baseUrl = getBaseUrl()) {
  const base = String(baseUrl).replace(/\/+$/, '');
  return `${base}/unsubscribe?t=${encodeURIComponent(signUnsubscribeToken({ kind, id }))}`;
}

/**
 * Headers for nodemailer's `headers` option on every MARKETING send.
 * The mailto is kept as a second channel for clients that only do RFC 2369.
 */
function marketingHeaders(url, replyTo) {
  const parts = [`<${url}>`];
  if (replyTo) parts.push(`<mailto:${replyTo}?subject=unsubscribe>`);
  return {
    'List-Unsubscribe': parts.join(', '),
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/** Footer HTML every marketing email ends with. Escapes nothing — `url` is ours. */
function marketingFooterHtml(url, { mailingAddress = '', reason = '' } = {}) {
  return `
    <hr style="border:none;border-top:1px solid #e0e0e0;margin:30px 0 12px;">
    <p style="font-size:12px;color:#666;text-align:center;line-height:1.6;">
      ${reason ? `${reason}<br>` : ''}
      <a href="${url}" style="color:#667eea;">Unsubscribe</a> from emails like this.
      ${mailingAddress ? `<br>${mailingAddress}` : ''}
    </p>`;
}

/** Mongo clause: everyone who has NOT opted out (field absent counts as in). */
function marketingOptOutFilter() {
  return { 'emailPreferences.marketingOptOut': { $ne: true } };
}

function hasMarketingOptOut(doc) {
  return !!(doc && doc.emailPreferences && doc.emailPreferences.marketingOptOut === true);
}

/**
 * The only writer. Returns the recipient's email (for the confirmation page)
 * or null when the id no longer exists.
 */
async function setMarketingOptOut(kind, id, optOut, source = 'link') {
  if (!KINDS.includes(kind)) throw new Error(`Unknown unsubscribe kind: ${kind}`);
  if (!SOURCES.includes(source)) throw new Error(`Unknown opt-out source: ${source}`);
  const Model = mongoose.model(kind === 'user' ? 'User' : 'Waitlist');
  const update = optOut
    ? { $set: { 'emailPreferences.marketingOptOut': true, 'emailPreferences.marketingOptOutAt': new Date(), 'emailPreferences.marketingOptOutSource': source } }
    : { $set: { 'emailPreferences.marketingOptOut': false }, $unset: { 'emailPreferences.marketingOptOutAt': 1, 'emailPreferences.marketingOptOutSource': 1 } };
  const doc = await Model.findByIdAndUpdate(id, update, { new: true }).select('email emailPreferences').lean();
  if (!doc) return null;
  return { email: doc.email, optedOut: hasMarketingOptOut(doc) };
}

/** Read-only lookup for the GET page. */
async function lookupRecipient(kind, id) {
  if (!KINDS.includes(kind)) return null;
  const Model = mongoose.model(kind === 'user' ? 'User' : 'Waitlist');
  const doc = await Model.findById(id).select('email emailPreferences').lean();
  if (!doc) return null;
  return { email: doc.email, optedOut: hasMarketingOptOut(doc) };
}

module.exports = {
  KINDS,
  SOURCES,
  getBaseUrl,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
  unsubscribeUrl,
  marketingHeaders,
  marketingFooterHtml,
  marketingOptOutFilter,
  hasMarketingOptOut,
  setMarketingOptOut,
  lookupRecipient,
};

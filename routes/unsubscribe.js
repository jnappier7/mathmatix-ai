/**
 * /unsubscribe — marketing email opt-out, no login required.
 *
 *   GET  /unsubscribe?t=<token>   A page naming the address with ONE button.
 *                                 Reads nothing but the token; changes nothing.
 *                                 (Link scanners prefetch GETs — see
 *                                 utils/emailUnsubscribe.js.)
 *   POST /unsubscribe             Opts the recipient out. Two callers:
 *                                   • the page's form (t in the body)
 *                                   • mail clients' one-click button, RFC 8058:
 *                                     POST to the List-Unsubscribe URL with the
 *                                     body `List-Unsubscribe=One-Click` (t stays
 *                                     in the query string). Must answer 2xx.
 *                                 `action=resubscribe` flips it back.
 *
 * Mounted PUBLIC in config/routes.js (no session), CSRF-exempt in
 * middleware/csrf.js, own IP limiter. The token is the authorization: it is
 * signed by us and names exactly one recipient, so the worst a forged request
 * can do is nothing. Pinned by tests/integration/unsubscribeRoute.test.js.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  verifyUnsubscribeToken,
  setMarketingOptOut,
  lookupRecipient,
} = require('../utils/emailUnsubscribe');

const router = express.Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).type('html').send(page({
    title: 'Too many requests',
    body: '<p>Please try the link again in a few minutes.</p>',
  })),
});

const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function page({ title, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)} · MATHMATIX.AI</title>
<style>
  body{margin:0;font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#f6f7fb;color:#1a1a1a;}
  main{max-width:480px;margin:10vh auto;padding:32px 24px;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.06);}
  h1{font-size:1.35rem;margin:0 0 12px;}
  p{line-height:1.55;margin:0 0 14px;}
  .addr{font-weight:600;word-break:break-all;}
  button{display:block;width:100%;padding:12px 16px;border:0;border-radius:8px;background:#667eea;color:#fff;font-size:1rem;font-weight:600;cursor:pointer;}
  button.quiet{background:transparent;color:#667eea;}
  small{display:block;margin-top:20px;color:#666;font-size:.85rem;line-height:1.5;}
  a{color:#667eea;}
  @media (max-width:520px){main{margin:16px;padding:24px 16px;}}
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

const SUPPORT = () => process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM || 'support@mathmatix.ai';

function invalidPage(res) {
  return res.status(400).type('html').send(page({
    title: 'Link not recognized',
    body: `<h1>We couldn't read that link</h1>
      <p>It may have been cut off by your email app. Open the email again and tap the unsubscribe link once more, or email
      <a href="mailto:${escapeHtml(SUPPORT())}?subject=unsubscribe">${escapeHtml(SUPPORT())}</a> and we'll take care of it.</p>`,
  }));
}

function form(token, action, label, quiet = false) {
  return `<form method="post" action="/unsubscribe">
    <input type="hidden" name="t" value="${escapeHtml(token)}">
    <input type="hidden" name="action" value="${action}">
    <button type="submit"${quiet ? ' class="quiet"' : ''}>${label}</button>
  </form>`;
}

const FOOT = '<small>This only affects updates and announcements. Account emails — password resets, consent requests, receipts, safety alerts — still arrive.</small>';

router.get('/', limiter, async (req, res) => {
  const who = verifyUnsubscribeToken(req.query.t);
  if (!who) return invalidPage(res);
  const rec = await lookupRecipient(who.kind, who.id);
  if (!rec) return invalidPage(res);

  const addr = `<span class="addr">${escapeHtml(rec.email)}</span>`;
  const body = rec.optedOut
    ? `<h1>You're already unsubscribed</h1>
       <p>${addr} won't receive updates or announcements from MATHMATIX.AI.</p>
       ${form(req.query.t, 'resubscribe', 'Resubscribe', true)}${FOOT}`
    : `<h1>Unsubscribe from MATHMATIX.AI updates?</h1>
       <p>Stop sending updates and announcements to ${addr}.</p>
       ${form(req.query.t, 'unsubscribe', 'Unsubscribe')}${FOOT}`;
  res.type('html').send(page({ title: 'Email preferences', body }));
});

router.post('/', limiter, async (req, res) => {
  const bodyObj = (req.body && typeof req.body === 'object') ? req.body : {};
  const token = bodyObj.t || req.query.t;
  const who = verifyUnsubscribeToken(token);
  if (!who) {
    // One-click callers get a plain status; a browser gets the page.
    return oneClick(bodyObj) ? res.status(400).type('text').send('invalid token') : invalidPage(res);
  }

  const resubscribe = bodyObj.action === 'resubscribe';
  const source = oneClick(bodyObj) ? 'one-click' : 'link';
  const rec = await setMarketingOptOut(who.kind, who.id, !resubscribe, source);
  if (!rec) return oneClick(bodyObj) ? res.status(404).type('text').send('unknown recipient') : invalidPage(res);

  if (oneClick(bodyObj)) return res.status(200).type('text').send('unsubscribed');

  const addr = `<span class="addr">${escapeHtml(rec.email)}</span>`;
  const body = rec.optedOut
    ? `<h1>You're unsubscribed</h1>
       <p>${addr} won't receive updates or announcements from MATHMATIX.AI. Changed your mind?</p>
       ${form(token, 'resubscribe', 'Resubscribe', true)}${FOOT}`
    : `<h1>Welcome back</h1>
       <p>${addr} will receive updates and announcements again.</p>
       ${form(token, 'unsubscribe', 'Unsubscribe', true)}${FOOT}`;
  res.type('html').send(page({ title: 'Email preferences', body }));
});

// RFC 8058: the mail client's POST body is exactly `List-Unsubscribe=One-Click`.
function oneClick(body) {
  return body['List-Unsubscribe'] === 'One-Click';
}

module.exports = router;

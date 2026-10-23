/**
 * SAFE RETURN-TO — reduce a caller-supplied post-login destination to something
 * we are willing to send a freshly-authenticated browser to.
 *
 * Why this is its own file with its own test: an unchecked `?next=` on a login
 * endpoint is an open redirect, which is a phishing primitive. The attack is a
 * mail link to OUR domain (so it passes the eye test and most link filters)
 * that bounces the user to a look-alike login the moment they authenticate.
 * Every rule below exists to kill one shape of that:
 *
 *   https://evil.test/x   absolute URL — a different origin outright
 *   //evil.test/x         protocol-relative; browsers treat it as absolute
 *   /\evil.test/x         backslash; some parsers fold "\" to "/" and it
 *                         becomes protocol-relative after the fact
 *   javascript:alert(1)   a scheme that executes rather than navigates
 *
 * What survives is an absolute, same-origin PATH, with its query and hash kept
 * (the drill hub lives at /drill/<hub>, and a playbook may ride in the query).
 *
 * It also refuses to return you to the auth pages themselves — bouncing a
 * just-logged-in user back to /login.html is a loop, not a destination.
 */

const MAX = 512;

// Paths that are never a sensible place to land after authenticating.
const DENY = [/^\/login(\.html)?(\/|$|\?|#)/i, /^\/signup(\.html)?(\/|$|\?|#)/i, /^\/auth\//i, /^\/logout(\/|$)/i];

/**
 * @param {unknown} raw the untrusted value, e.g. req.query.next or req.body.next
 * @returns {string|null} a safe same-origin path, or null to fall back to the
 *   caller's own default. Never throws — a malformed value is just a null.
 */
function safeReturnTo(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > MAX) return null;

  // Must be an absolute path on this origin, and must not be able to become
  // protocol-relative. Checked on the RAW string, before any parser gets a
  // chance to normalise a backslash into a slash.
  if (s[0] !== '/') return null;
  if (s[1] === '/' || s[1] === '\\') return null;
  if (s.includes('\\')) return null;
  // A control character (including an encoded newline that survived decoding)
  // has no business in a Location header.
  // eslint-disable-next-line no-control-regex -- matching them IS the check
  if (/[\u0000-\u001f\u007f]/.test(s)) return null;

  let url;
  try {
    url = new URL(s, 'https://placeholder.invalid');
  } catch {
    return null;
  }
  // `new URL` resolves "/a/../../b" and friends; re-check what came out.
  if (url.origin !== 'https://placeholder.invalid') return null;

  const out = `${url.pathname}${url.search}${url.hash}`;
  if (out[0] !== '/' || out[1] === '/') return null;
  if (DENY.some((re) => re.test(out))) return null;
  return out;
}

module.exports = { safeReturnTo };

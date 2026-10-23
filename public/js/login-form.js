// Swap demo → signup after launch date (March 14, 2026 midnight EST)
if (new Date() >= new Date('2026-03-14T04:00:00Z')) {
  document.querySelectorAll('.lp-pre-launch').forEach(function (el) { el.style.display = 'none'; });
  document.querySelectorAll('.lp-post-launch').forEach(function (el) { el.style.display = ''; });
}

const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('login-message');

// Where to go back to after logging in, e.g. /login.html?next=/drill/algebra.
// Carried to the server on the POST, and hung on the OAuth links so it also
// survives a trip through Google or Microsoft. The SERVER decides whether it is
// safe to honour (utils/safeReturnTo.js) — this is only plumbing.
const nextParam = new URLSearchParams(window.location.search).get('next') || '';
if (nextParam) {
  document.querySelectorAll('a[href^="/auth/"]').forEach(function (a) {
    const u = new URL(a.getAttribute('href'), window.location.origin);
    u.searchParams.set('next', nextParam);
    a.setAttribute('href', u.pathname + u.search);
  });
}

// Surface OAuth provider outages (e.g. an expired Microsoft client secret) as a
// friendly notice instead of leaving the user on a raw 500 from the callback.
(function showOAuthError() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('error') !== 'oauth_unavailable') return;
  const providerNames = { microsoft: 'Microsoft', google: 'Google', clever: 'Clever' };
  const provider = providerNames[params.get('provider')] || 'That';
  loginMessage.textContent = `${provider} sign-in is temporarily unavailable. Please try another sign-in method.`;
  loginMessage.style.display = 'block';
})();

loginForm.addEventListener('submit', async function(event) {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const data = Object.fromEntries(formData.entries());
  if (nextParam) data.next = nextParam;

  loginMessage.style.display = 'none';
  loginMessage.style.color = '';

  // Check if CSRF token exists before attempting login
  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    console.error('[Login] CSRF token not found. Cookies may be disabled or blocked.');
    loginMessage.textContent = 'Session error. Please refresh the page or check that cookies are enabled.';
    loginMessage.style.display = 'block';
    return;
  }

  try {
    const response = await csrfFetch('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data),
      credentials: 'include'
    });

    const result = await response.json();

    if (response.ok && result.success) {
      if (result.redirect) {
        window.location.href = result.redirect;
      } else {
        window.location.href = '/chat.html';
      }
    } else {
      loginMessage.textContent = result.message || 'Login failed. Please check your email and password.';
      loginMessage.style.display = 'block';
    }
  } catch (error) {
    console.error('Login Error:', error);
    loginMessage.textContent = 'Login failed. Please check your credentials or try again later.';
    loginMessage.style.display = 'block';
  }
});

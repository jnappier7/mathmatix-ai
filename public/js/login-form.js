// Swap demo → signup after launch date (March 14, 2026 midnight EST)
if (new Date() >= new Date('2026-03-14T04:00:00Z')) {
  document.querySelectorAll('.lp-pre-launch').forEach(function (el) { el.style.display = 'none'; });
  document.querySelectorAll('.lp-post-launch').forEach(function (el) { el.style.display = ''; });
}

const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('login-message');

loginForm.addEventListener('submit', async function(event) {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const data = Object.fromEntries(formData.entries());

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

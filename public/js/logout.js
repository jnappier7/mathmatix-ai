// public/js/logout.js
document.addEventListener('DOMContentLoaded', () => {
  // Use querySelectorAll to select all buttons with the common class
  const logoutButtons = document.querySelectorAll('.logout-button');

  logoutButtons.forEach(logoutBtn => {
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try {
          const res = await fetch('/logout', {
            method: 'POST',
            credentials: 'include'
          });
          if (res.ok) {
            window.location.href = '/login.html';
          } else {
            alert('Logout failed.');
          }
        } catch (err) {
          console.error('Logout error:', err);
          alert('An error occurred while logging out.');
        }
      });
    }
  });
});// JavaScript Document
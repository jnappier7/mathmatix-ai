// public/js/logout.js
document.addEventListener('DOMContentLoaded', () => {
  const logoutButtons = document.querySelectorAll('.logout-button');

  logoutButtons.forEach(logoutBtn => {
    if (logoutBtn) {
      console.log(`LOG: Found logout button with ID: ${logoutBtn.id || logoutBtn.className}`); // Add this log
      logoutBtn.addEventListener('click', async (event) => { // Ensure event is captured
        event.preventDefault(); // Add this line to explicitly prevent any default behavior just in case
        console.log("LOG: Logout button clicked. Initiating fetch POST to /logout."); // Add this log
        try {
          const res = await fetch('/logout', {
            method: 'POST',
            credentials: 'include'
          });
          console.log("LOG: Logout fetch response:", res.status, res.statusText); // Add this log
          if (res.ok) {
            console.log("LOG: Logout successful, redirecting.");
            localStorage.clear(); // Clear all localStorage items related to session
            window.location.href = '/login.html';
          } else {
            const errorText = await res.text(); // Capture error text from response
            console.error('ERROR: Logout failed on server side:', res.status, errorText); // More detailed error log
            alert('Logout failed: ' + errorText);
          }
        } catch (err) {
          console.error('CRITICAL ERROR: Logout fetch error (network/client-side):', err); // More detailed error log
          alert('An error occurred while logging out. Please check your internet connection.');
        }
      });
    }
  });
});
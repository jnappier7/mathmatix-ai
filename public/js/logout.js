// public/js/logout.js
document.addEventListener('DOMContentLoaded', () => {
  // Use querySelectorAll to select all buttons with the common class
  const logoutButtons = document.querySelectorAll('.logout-button');

  logoutButtons.forEach(logoutBtn => {
    if (logoutBtn) {
      console.log(`LOG: Found logout button with ID: ${logoutBtn.id || logoutBtn.className}`);
      logoutBtn.addEventListener('click', async (event) => {
        event.preventDefault(); // Add this line to explicitly prevent any default behavior just in case
        console.log("LOG: Logout button clicked.");

        // Use session manager if available (handles auto-save and session summary)
        if (window.sessionManager) {
          console.log("LOG: Using session manager for logout.");
          window.sessionManager.triggerLogout();
          return;
        }

        // Fallback to direct logout if session manager not available
        console.log("LOG: Initiating fetch POST to /logout.");
        try {
          const res = await fetch('/logout', {
            method: 'POST',
            credentials: 'include'
          });
          console.log("LOG: Logout fetch response:", res.status, res.statusText);
          if (res.ok) {
            console.log("LOG: Logout successful, redirecting.");
            // Use StorageUtils to safely clear storage (prevents tracking prevention errors)
            if (window.StorageUtils) {
              StorageUtils.local.clear();
              StorageUtils.session.clear();
            }
            window.location.href = '/login.html';
          } else {
            const errorText = await res.text();
            console.error('ERROR: Logout failed on server side:', res.status, errorText);
            alert('Logout failed: ' + errorText);
          }
        } catch (err) {
          console.error('CRITICAL ERROR: Logout fetch error (network/client-side):', err);
          alert('An error occurred while logging out. Please check your internet connection.');
        }
      });
    }
  });
});
// login.js (frontend script)
document.getElementById("login-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {
    const res = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.ok) {
      localStorage.setItem("mathmatixUser", JSON.stringify(data.user));
      localStorage.setItem("userId", data.user._id);
      localStorage.setItem("name", data.user.name);
      localStorage.setItem("tone", data.user.tonePreference);
      localStorage.setItem("userRole", data.user.role); // Save the user's role
      
      // The backend (server.js/chat.js) will redirect based on role,
      // but this client-side redirect ensures fallback if backend doesn't redirect explicitly for some reason.
      window.location.href = "/chat.html";
    } else {
      alert(data.message || data.error || "Invalid username or password.");
    }
  } catch (err) {
    console.error(err);
    alert("Something went wrong while logging in.");
  }
});

// Assuming you have a "Forgot Password" link/button with id="forgot-password" in your HTML
const forgotPasswordBtn = document.getElementById("forgot-password");
if (forgotPasswordBtn) { // Check if the element exists
  forgotPasswordBtn.addEventListener("click", async () => {
    const email = prompt("Enter your email for password reset:");
    if (!email) return;

    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      const msg = await res.text();
      alert(msg);
    } catch (err) {
      console.error("Reset error:", err);
      alert("There was a problem processing your reset. Try again later.");
    }
  });
} else {
  console.warn("DEBUG: Forgot password button with ID 'forgot-password' not found.");
}

// --- NEW: Social Login Button Event Listeners (Frontend Redirection) ---
document.addEventListener('DOMContentLoaded', () => {
    // These will typically be anchor tags, so clicking them will directly navigate
    // to the backend Passport routes. No complex fetch logic needed here.
    const googleLoginBtn = document.querySelector('.google-btn');
    const microsoftLoginBtn = document.querySelector('.microsoft-btn');

    if (googleLoginBtn) {
        googleLoginBtn.addEventListener('click', () => {
            console.log('Redirecting to Google login...');
            // The href="/auth/google" on the anchor tag already handles the redirection
        });
    }

    if (microsoftLoginBtn) {
        microsoftLoginBtn.addEventListener('click', () => {
            console.log('Redirecting to Microsoft login...');
            // The href="/auth/microsoft" on the anchor tag already handles the redirection
        });
    }
});
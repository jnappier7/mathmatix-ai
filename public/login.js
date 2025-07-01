// public/login.js (frontend script)
document.getElementById("login-form").addEventListener("submit", async function (e) {
  e.preventDefault(); //

  const username = document.getElementById("username").value; //
  const password = document.getElementById("password").value; //

  try {
    const res = await fetch("/login", {
      method: "POST", //
      headers: { "Content-Type": "application/json" }, //
      credentials: 'include', // IMPORTANT: Ensure session cookie is sent
      body: JSON.stringify({ username, password }) //
    });

    // --- START SURGICAL ENHANCEMENT ---
    // If the backend has redirected, the browser has already followed it.
    // In this case, we don't need to parse anything, just return.
    if (res.redirected) { // Check if the response was a redirect
        console.log('Login successful, browser is redirecting...'); //
        return; // Exit the function, as the browser will handle navigation
    }

    // If it's not a redirect, it must be a JSON response (e.g., for errors from backend routes/login.js)
    const contentType = res.headers.get("content-type"); //
    let data; //
    if (contentType && contentType.includes("application/json")) { //
        data = await res.json(); // Parse as JSON for error messages or specific data
    } else {
        // Fallback for unexpected non-JSON, non-redirect responses (e.g., raw HTML error pages)
        const textResponse = await res.text(); //
        console.warn("Received unexpected non-JSON response from /login:", textResponse); //
        throw new Error(`Server returned unexpected response for login. Status: ${res.status}`); //
    }

    // This block is only reached if the backend sent a JSON response (likely an error)
    if (!res.ok) { // Check if the HTTP status code indicates an error (e.g., 401, 500)
      alert(data.message || data.error || "Invalid username or password."); //
    } else {
      // This 'else' block should ideally not be reached if successful logins always redirect.
      // It's a fallback for cases where the backend might return success JSON without redirecting.
      // Given your backend now redirects, this path should rarely, if ever, be taken on success.
      console.log('Login successful with unexpected JSON (should have redirected):', data); //

      // If data.redirect was still sent for some reason (e.g., if backend still sends JSON with redirect property for social logins)
      if (data.redirect) { //
        window.location.href = data.redirect; //
      } else {
        // Fallback to chat.html if no explicit redirect or data.redirect is found and it was a success.
        // This part becomes less critical as backend redirects directly.
        localStorage.setItem("mathmatixUser", JSON.stringify(data.user)); //
        localStorage.setItem("userId", data.user._id); //
        localStorage.setItem("name", data.user.name || `${data.user.firstName} ${data.user.lastName}`); //
        localStorage.setItem("tone", data.user.tonePreference); //
        localStorage.setItem("userRole", data.user.role); //
        localStorage.setItem("learningStyle", data.user.learningStyle); //
        localStorage.setItem("interests", JSON.stringify(data.user.interests || [])); //
        window.location.href = "/chat.html"; //
      }
    }
    // --- END SURGICAL ENHANCEMENT ---

  } catch (err) {
    console.error("Login fetch error:", err); //
    alert("Something went wrong while logging in. Please try again or check your server logs."); //
  }
});

// Assuming you have a "Forgot Password" link/button with id="forgot-password" in your HTML
const forgotPasswordBtn = document.getElementById("forgot-password"); //
if (forgotPasswordBtn) { // Check if the element exists
  forgotPasswordBtn.addEventListener("click", async () => { //
    const email = prompt("Enter your email for password reset:"); //
    if (!email) return; //

    try {
      const res = await fetch("/api/reset-password", { //
        method: "POST", //
        headers: { "Content-Type": "application/json" }, //
        body: JSON.stringify({ email }) //
      });

      const msg = await res.text(); //
      alert(msg); //
    } catch (err) {
      console.error("Reset error:", err); //
      alert("There was a problem processing your reset. Try again later."); //
    }
  });
} else {
  console.warn("DEBUG: Forgot password button with ID 'forgot-password' not found."); //
}

// --- NEW: Social Login Button Event Listeners (Frontend Redirection) ---
// These will typically be anchor tags, so clicking them will directly navigate
// to the backend Passport routes. No complex fetch logic needed here.
document.addEventListener('DOMContentLoaded', () => { //
    const googleLoginBtn = document.querySelector('.google-btn'); //
    const microsoftLoginBtn = document.querySelector('.microsoft-btn'); //

    if (googleLoginBtn) { //
        googleLoginBtn.addEventListener('click', () => { //
            console.log('Redirecting to Google login...'); //
        });
    }

    if (microsoftLoginBtn) { //
        microsoftLoginBtn.addEventListener('click', () => { //
            console.log('Redirecting to Microsoft login...'); //
        });
    }
});
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
      // --- START ADDITION ---
      localStorage.setItem("userRole", data.user.role); // Save the user's role
      // --- END ADDITION ---
      // The redirection will now be handled by script.js, so this line will be overridden.
      // Keeping it here for now to ensure no immediate breakage if script.js loads after this.
      window.location.href = "/chat.html";
    } else {
      alert(data.message || "Invalid username or password.");
    }
  } catch (err) {
    console.error(err);
    alert("Something went wrong while logging in.");
  }
});

document.getElementById("forgot-password").addEventListener("click", async () => {
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
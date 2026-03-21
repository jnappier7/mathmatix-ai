document.addEventListener("DOMContentLoaded", () => {
  const signupForm = document.getElementById("signup-form");
  const gradeSelect = document.getElementById("grade");
  const mathSection = document.getElementById("math-course-section");

  // Show math section if grade is 9+
  gradeSelect.addEventListener("change", () => {
    const grade = gradeSelect.value;
    if (["9", "10", "11", "12", "College"].includes(grade)) {
      mathSection.classList.remove("hidden");
    } else {
      mathSection.classList.add("hidden");
    }
  });

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("username").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirm-password").value;
    const firstName = document.getElementById("firstName").value;
    const lastName = document.getElementById("lastName").value;
    const gradeLevel = document.getElementById("grade").value;
    const mathCourse = document.getElementById("mathCourse").value;
    const learningStyle = document.getElementById("learningStyle").value;
    const tonePreference = document.getElementById("tonePreference").value;
    const interests = Array.from(document.querySelectorAll(".checkbox-group input:checked")).map(i => i.value);

    if (password !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    // Password validation (must match backend requirements)
    const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
      alert("Password must be at least 8 characters long and include one uppercase letter, one lowercase letter, and one number.");
      return;
    }

    // Check if user came from a trial chat on the landing page
    const urlParams = new URLSearchParams(window.location.search);
    const trialTutor = urlParams.get('trial_tutor');

    const userData = {
      username,
      email,
      password,
      firstName,
      lastName,
      gradeLevel,
      mathCourse,
      learningStyle,
      tonePreference,
      interests
    };

    // Pass trial tutor selection so the backend can pre-set it
    if (trialTutor) {
      userData.trialTutor = trialTutor;
    }

    try {
      const res = await csrfFetch("/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData)
      });

      const data = await res.json();

      if (res.ok) {
        // Use backend redirect (skips pick-tutor if trial tutor was set)
        window.location.href = data.redirect || "/login.html";
      } else {
        // Handle "already logged in" error specially
        if (data.alreadyLoggedIn || data.action === 'logout_required') {
          const shouldLogout = confirm(
            `${data.message}\n\nCurrent account: ${data.currentUser}\n\nClick OK to log out and create a new account, or Cancel to stay logged in.`
          );
          if (shouldLogout) {
            // Logout and reload the page
            csrfFetch('/logout', { method: 'POST', credentials: 'include' })
              .then(() => {
                window.location.reload();
              })
              .catch(err => {
                console.error('Logout error:', err);
                alert('Failed to log out. Please try manually.');
              });
          }
        } else {
          alert(data.message || "Something went wrong during signup.");
        }
      }
    } catch (err) {
      console.error("Signup fetch error:", err);
      alert("An error occurred. Please try again.");
    }
  });
});
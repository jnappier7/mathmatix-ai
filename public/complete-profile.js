document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("profile-form");
  const gradeSelect = document.getElementById("grade");
  const mathSection = document.getElementById("math-course-section");
  const firstNameInput = document.getElementById("firstName"); // Corrected ID
  const lastNameInput = document.getElementById("lastName");   // Corrected ID


  // --- MODIFIED: Load session user via /user endpoint for Passport.js context ---
  (async function loadSessionUser() {
    try {
      const res = await fetch("/user"); // Use the /user endpoint to get authenticated user data
      const data = await res.json(); // This is the user object from Passport.js

      if (data && data._id) {
        localStorage.setItem("userId", data._id); // Ensure userId is in local storage

        // Pre-populate fields if data exists from OAuth
        if (firstNameInput) firstNameInput.value = data.firstName || '';
        if (lastNameInput) lastNameInput.value = data.lastName || '';
        if (data.gradeLevel) gradeSelect.value = data.gradeLevel;
        if (data.mathCourse) document.getElementById("mathCourse").value = data.mathCourse;
        if (data.learningStyle) document.getElementById("learningStyle").value = data.learningStyle;
        if (data.tonePreference) document.getElementById("tonePreference").value = data.tonePreference;
        if (data.interests && data.interests.length > 0) {
            Array.from(document.querySelectorAll(".checkbox-group input[type='checkbox']")).forEach(checkbox => {
                if (data.interests.includes(checkbox.value)) {
                    checkbox.checked = true;
                }
            });
        }
        // Trigger change event for grade select to show/hide math course section
        const event = new Event('change');
        gradeSelect.dispatchEvent(event);

      } else {
        console.error("Could not load session user from /user endpoint.");
        alert("User session not found. Please log in again.");
        window.location.href = "/login.html";
      }
    } catch (err) {
      console.error("Could not load session user:", err);
      alert("User session not found. Please log in again.");
      window.location.href = "/login.html";
    }
  })();
  // --- END MODIFIED ---

  // Show math section if grade is 9+
  gradeSelect.addEventListener("change", () => {
    const grade = gradeSelect.value;
    if (["9", "10", "11", "12", "College"].includes(grade)) {
      mathSection.classList.remove("hidden");
    } else {
      mathSection.classList.add("hidden");
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const userId = localStorage.getItem("userId");
    if (!userId) return alert("User session not found.");

    const firstName = firstNameInput.value;
    const lastName = lastNameInput.value;
    const gradeLevel = gradeSelect.value;
    const mathCourse = document.getElementById("mathCourse").value;
    const tonePreference = document.getElementById("tonePreference").value;
    const learningStyle = document.getElementById("learningStyle").value;
    const interests = Array.from(document.querySelectorAll(".checkbox-group input:checked")).map(i => i.value);

    const profile = {
      userId,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`, // Combine for 'name' field
      gradeLevel,
      mathCourse,
      tonePreference,
      learningStyle,
      interests,
      needsProfileCompletion: false // Mark profile as complete!
    };

    try {
      const res = await fetch("/api/complete-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile)
      });

      const result = await res.json();
      if (result.success) {
        // Update localStorage with completed profile details
        localStorage.setItem("mathmatixUser", JSON.stringify(result.user)); // Use the updated user object from backend
        localStorage.setItem("name", result.user.name);
        localStorage.setItem("tone", result.user.tonePreference);
        localStorage.setItem("learningStyle", result.user.learningStyle);
        localStorage.setItem("interests", JSON.stringify(result.user.interests));
        localStorage.setItem("userId", result.user._id); // Ensure userId is updated if necessary
        localStorage.setItem("userRole", result.user.role); // Ensure role is updated
        
        window.location.href = "/chat.html"; // Redirect to chat after completion
      } else {
        alert("Failed to save profile. Try again." + (result.message || ''));
      }
    } catch (err) {
      console.error("Profile save error:", err);
      alert("An error occurred. Please try again.");
    }
  });
});
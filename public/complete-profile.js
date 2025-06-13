document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("profile-form");
  const gradeSelect = document.getElementById("grade");
  const mathSection = document.getElementById("math-course-section");

  const studentOnly = document.getElementById("studentOnly");
  const parentOnly = document.getElementById("parentOnly");
  const linkedChildrenDiv = document.getElementById("linkedChildren");

  const firstNameInput = document.getElementById("firstName");
  const lastNameInput = document.getElementById("lastName");

  let currentUserRole = null; // Use a local variable to store the role

  // --- MODIFIED: Load session user via /user endpoint for Passport.js context ---
  (async function loadSessionUser() {
    try {
      const res = await fetch("/user", { credentials: 'include' });
      const data = await res.json();

      // Determine the actual user object from the response
      const userToPopulate = data.user || data;

      // Handle cases where the user shouldn't be on this page (e.g., not logged in, or profile already complete)
      if (!userToPopulate || !userToPopulate._id) {
          console.error("Could not load session user from /user endpoint.");
          alert("User session not found. Please log in again.");
          window.location.href = "/login.html";
          return;
      }

      // If the server sends a redirect AND it's NOT to the current page, then follow it.
      // This handles scenarios like profile already being complete.
      if (data.redirect && window.location.pathname !== data.redirect) {
          console.log(`Redirecting to: ${data.redirect}`);
          window.location.href = data.redirect;
          return;
      }

      // If we are still here, it means user data is available, and we are on complete-profile.html.
      currentUserRole = userToPopulate.role; // Set the role from fetched user data
      localStorage.setItem("userId", userToPopulate._id);
      localStorage.setItem("userRole", currentUserRole); // Ensure role is stored in localStorage

      // Pre-populate fields if data exists from OAuth
      if (firstNameInput) firstNameInput.value = userToPopulate.firstName || '';
      if (lastNameInput) lastNameInput.value = userToPopulate.lastName || '';

      // Show relevant fields based on role
      if (currentUserRole === "student") {
        studentOnly.style.display = "block";
        if (userToPopulate.gradeLevel) gradeSelect.value = userToPopulate.gradeLevel;
        if (userToPopulate.mathCourse) document.getElementById("mathCourse").value = userToPopulate.mathCourse;
        if (userToPopulate.learningStyle) document.getElementById("learningStyle").value = userToPopulate.learningStyle;
        if (userToPopulate.tonePreference) document.getElementById("tonePreference").value = userToPopulate.tonePreference;
        if (userToPopulate.interests && userToPopulate.interests.length > 0) {
            Array.from(document.querySelectorAll(".checkbox-group input[type='checkbox']")).forEach(checkbox => {
                if (userToPopulate.interests.includes(checkbox.value)) {
                    checkbox.checked = true;
                }
            });
        }
        // Trigger change event for grade select to show/hide math course section
        const event = new Event('change');
        gradeSelect.dispatchEvent(event);

      } else if (currentUserRole === "parent") {
        parentOnly.style.display = "block";
        if (userToPopulate.reportFrequency) document.getElementById("reportFrequency").value = userToPopulate.reportFrequency;
        if (userToPopulate.goalViewPreference) document.getElementById("goalViewPreference").value = userToPopulate.goalViewPreference;
        if (userToPopulate.parentTone) document.getElementById("parentTone").value = userToPopulate.parentTone;
        if (userToPopulate.parentLanguage) document.getElementById("parentLanguage").value = userToPopulate.parentLanguage;
        // Load linked children
        fetch("/api/parent/children", { credentials: 'include' })
          .then(res => res.json())
          .then(data => {
            if (!data || data.length === 0) {
              linkedChildrenDiv.innerText = "No children linked yet.";
            } else {
              linkedChildrenDiv.innerHTML = data.map(child =>
                `<div>👤 ${child.firstName} ${child.lastName} (${child.gradeLevel || "Grade ?"})</div>`
              ).join("");
            }
          }).catch(() => {
            linkedChildrenDiv.innerText = "Could not load children.";
          });
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

    const payload = {
      userId,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`, // Combine for 'name' field
      needsProfileCompletion: false // Mark profile as complete!
    };

    if (currentUserRole === "student") { // Use the role from loadSessionUser
      payload.gradeLevel = gradeSelect.value;
      payload.mathCourse = document.getElementById("mathCourse").value;
      payload.tonePreference = document.getElementById("tonePreference").value;
      payload.learningStyle = document.getElementById("learningStyle").value;
      payload.interests = Array.from(document.querySelectorAll(".checkbox-group input:checked")).map(i => i.value);
    } else if (currentUserRole === "parent") { // Use the role from loadSessionUser
      payload.reportFrequency = document.getElementById("reportFrequency").value;
      payload.goalViewPreference = document.getElementById("goalViewPreference").value;
      payload.parentTone = document.getElementById("parentTone").value; // Added parentTone
      payload.parentLanguage = document.getElementById("parentLanguage").value; // Added parentLanguage
    }

    try {
      const res = await fetch("/api/complete-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (result.success) {
        // Update localStorage with completed profile details
        localStorage.setItem("mathmatixUser", JSON.stringify(result.user));
        localStorage.setItem("name", result.user.name);
        localStorage.setItem("tone", result.user.tonePreference); // Student field
        localStorage.setItem("learningStyle", result.user.learningStyle); // Student field
        localStorage.setItem("interests", JSON.stringify(result.user.interests || [])); // Student field
        localStorage.setItem("userId", result.user._id);
        localStorage.setItem("userRole", result.user.role);
        // Parent fields
        localStorage.setItem("reportFrequency", result.user.reportFrequency || '');
        localStorage.setItem("goalViewPreference", result.user.goalViewPreference || '');
        localStorage.setItem("parentTone", result.user.parentTone || '');
        localStorage.setItem("parentLanguage", result.user.parentLanguage || '');

        // --- MODIFIED: Redirect student to tutor picker, parents to their dashboard ---
        if (result.user.role === "student") {
            window.location.href = "/pick-tutor.html"; // Student now goes to pick their tutor
        } else if (result.user.role === "parent") {
            window.location.href = "/parent-dashboard.html"; // Parent goes to parent dashboard
        } else {
            window.location.href = "/chat.html"; // Fallback
        }
      } else {
        alert("Failed to save profile. Try again." + (result.message || ''));
      }
    } catch (err) {
      console.error("Profile save error:", err);
      alert("An error occurred. Please try again.");
    }
  });
});
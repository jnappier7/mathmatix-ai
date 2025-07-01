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

    // Password validation (basic: at least 8 chars, 1 capital, 1 number)
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
      alert("Password must be at least 8 characters long, include one capital letter, and one number.");
      return;
    }

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

    try {
      const res = await fetch("/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData)
      });

      const data = await res.json();

      if (res.ok) {
        alert(data.message);
        window.location.href = "/login.html"; // Redirect to login after successful signup
      } else {
        alert(data.message || "Something went wrong during signup.");
      }
    } catch (err) {
      console.error("Signup fetch error:", err);
      alert("An error occurred. Please try again.");
    }
  });
});
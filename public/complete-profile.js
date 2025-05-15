document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("profile-form");
  const gradeSelect = document.getElementById("grade");
  const mathSection = document.getElementById("math-course-section");

	(async function loadSessionUser() {
  try {
    const res = await fetch("/auth/whoami");
    const data = await res.json();

    localStorage.setItem("userId", data.userId);
    localStorage.setItem("name", data.name || "");
    localStorage.setItem("tone", data.tone || "");
    localStorage.setItem("learningStyle", data.learningStyle || "");
    localStorage.setItem("interests", JSON.stringify(data.interests || []));
  } catch (err) {
    console.error("Could not load session user:", err);
    alert("User session not found. Please log in again.");
    window.location.href = "/login.html";
  }
})();

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

    const name = document.getElementById("name").value;
    const gradeLevel = document.getElementById("grade").value;
    const mathCourse = document.getElementById("mathCourse").value;
    const tonePreference = document.getElementById("tonePreference").value;
    const learningStyle = document.getElementById("learningStyle").value;
    const interests = Array.from(document.querySelectorAll(".checkbox-group input:checked")).map(i => i.value);

    const profile = {
      userId,
      name,
      gradeLevel,
      mathCourse,
      tonePreference,
      learningStyle,
      interests
    };

    try {
      const res = await fetch("/api/complete-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile)
      });

      const result = await res.json();
      if (result.success) {
        localStorage.setItem("mathmatixUser", JSON.stringify(profile));
        localStorage.setItem("name", name);
        localStorage.setItem("tone", tonePreference);
        localStorage.setItem("learningStyle", learningStyle);
        localStorage.setItem("interests", JSON.stringify(interests));
        window.location.href = "/chat.html";
      } else {
        alert("Failed to save profile. Try again.");
      }
    } catch (err) {
      console.error("Profile save error:", err);
      alert("An error occurred. Please try again.");
    }
  });
});

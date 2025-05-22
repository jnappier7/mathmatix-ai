// ===== FORM LOGIC =====
const gradeSelect = document.getElementById('grade');
const mathCourseSection = document.getElementById('math-course-section');
const advancedMathQuestion = document.getElementById('advanced-math-question');

gradeSelect.addEventListener('change', () => {
  const grade = gradeSelect.value;

  if (grade === "7" || grade === "8") {
    advancedMathQuestion?.classList.remove('hidden');
    mathCourseSection?.classList.add('hidden');
  } else if (["9", "10", "11", "12", "College"].includes(grade)) {
    advancedMathQuestion?.classList.add('hidden');
    mathCourseSection?.classList.remove('hidden');
  } else {
    advancedMathQuestion?.classList.add('hidden');
    mathCourseSection?.classList.add('hidden');
  }
});

const advancedMathRadios = document.getElementsByName('advancedMath');
advancedMathRadios?.forEach(radio => {
  radio.addEventListener('change', () => {
    if (radio.value === 'yes') {
      mathCourseSection?.classList.remove('hidden');
    } else {
      mathCourseSection?.classList.add('hidden');
    }
  });
});

// ===== SUBMIT HANDLER =====
document.getElementById("signup-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const formData = {
    username: document.getElementById("username").value,
    password: document.getElementById("password").value,
    name: document.getElementById("name").value,
    gradeLevel: document.getElementById("grade").value,
    mathCourse: document.getElementById("mathCourse").value,
    learningStyle: document.getElementById("learningStyle").value,
    tonePreference: document.getElementById("tonePreference").value,
    interests: Array.from(document.querySelectorAll("input[type='checkbox']:checked")).map(el => el.value)
  };

  try {
    const res = await fetch("/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.message || "Signup failed.");
      return;
    }

    const data = await res.json();

    if (!data.user || !data.user._id) {
      alert("Signup failed. No user returned.");
      return;
    }

    // Save returned user (not just raw form data)
    localStorage.setItem("mathmatixUser", JSON.stringify(data.user));
    localStorage.setItem("userId", data.user._id);
    localStorage.setItem("name", data.user.name);
    localStorage.setItem("tone", data.user.tonePreference);

    // Show welcome
    document.body.innerHTML = `
      <div style="text-align:center; margin-top:100px;">
        <h1>🎉 Welcome to M∆THM∆TIΧ AI, ${data.user.name}!</h1>
        <p>Hang tight... We're getting things ready for you.</p>
      </div>
    `;

    setTimeout(() => {
      window.location.href = "/chat.html";
    }, 2000);

  } catch (err) {
    console.error(err);
    alert("An error occurred during signup.");
  }
});

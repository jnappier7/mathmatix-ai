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
advancedMathRadios.forEach(radio => {
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

  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const confirmPassword = document.getElementById("confirm-password").value.trim();
  const name = document.getElementById("name").value.trim();
  const gradeLevel = document.getElementById("grade").value;
  const mathCourse = document.getElementById("mathCourse").value;
  const learningStyle = document.getElementById("learningStyle").value;
  const tonePreference = document.getElementById("tonePreference").value;
  const interests = Array.from(document.querySelectorAll("input[name='interests[]']:checked")).map(el => el.value);

  // Manual validation
  if (!username || !email || !password || !confirmPassword || !name || !gradeLevel || !learningStyle || !tonePreference) {
    alert("Please fill out all required fields.");
    return;
  }

  if (password !== confirmPassword) {
    alert("Passwords do not match.");
    return;
  }

  // Password strength validation
  const strongPassword = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
  if (!strongPassword.test(password)) {
    alert("Password must be at least 8 characters long and include at least one uppercase letter and one number.");
    return;
  }

  const formData = {
    username,
    email,
    password,
    name,
    gradeLevel,
    mathCourse,
    learningStyle,
    tonePreference,
    interests
  };

  try {
    const res = await fetch("/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(formData)
    });

    const data = await res.json();

    if (res.ok) {
      localStorage.setItem("mathmatixUser", JSON.stringify(formData));

      document.body.innerHTML = `
        <div style="text-align:center; margin-top:100px;">
          <h1>🎉 Welcome to M∆THM∆TIΧ AI, ${formData.name}!</h1>
          <p>Hang tight... We're getting things ready for you.</p>
        </div>
      `;

      setTimeout(() => {
        window.location.href = "/index.html";
      }, 2000);
    } else {
      alert(data.message || "Signup failed.");
    }

  } catch (err) {
    console.error(err);
    alert("An error occurred during signup.");
  }
});

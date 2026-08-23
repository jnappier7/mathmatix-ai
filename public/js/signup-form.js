// Role is chosen from radio cards, not a <select> with a default. Nothing is
// preselected on purpose: the old dropdown defaulted to "Student" while every
// homepage CTA told parents to start with a parent account, so a parent moving
// fast silently created the wrong account type.
const roleRadios = Array.from(document.querySelectorAll('input[name="role"]'));
const teacherNotice = document.getElementById("teacherNotice");
const hasCodeCheckbox = document.getElementById("hasCodeCheckbox");
const hasCodeLabel = document.getElementById("hasCodeLabel");
const hasCodeRow = document.getElementById("hasCodeRow");
const codeInputGroup = document.getElementById("codeInputGroup");
const enrollmentCodeGroup = document.getElementById("enrollmentCodeGroup");
const inviteCodeGroup = document.getElementById("inviteCodeGroup");
const parentInviteCodeGroup = document.getElementById("parentInviteCodeGroup");
const signupForm = document.getElementById("signupForm");
const signupMessage = document.getElementById("signup-message");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirm-password");
const submitBtn = signupForm ? signupForm.querySelector('button[type="submit"]') : null;

function selectedRole() {
  const picked = roleRadios.find((r) => r.checked);
  return picked ? picked.value : "";
}

function showMessage(text, kind) {
  signupMessage.textContent = text;
  signupMessage.className = kind;
  signupMessage.style.display = "block";
}

// Prefill when arriving from a kid's "add a parent" invite email
// (signup.html?role=parent&parentInvite=<token>&email=<addr>): preselect the
// parent role + email so the parent just sets a password and is auto-linked.
// This is the ONE case where a role is preselected, and it is preselected
// because the invite already told us which one it is.
const inviteParams = new URLSearchParams(window.location.search);
const parentInviteToken = inviteParams.get("parentInvite") || "";
if (parentInviteToken) {
  const parentRadio = roleRadios.find((r) => r.value === "parent");
  if (parentRadio) parentRadio.checked = true;
  const invitedEmail = inviteParams.get("email");
  const emailField = document.getElementById("email");
  if (invitedEmail && emailField) emailField.value = invitedEmail;
}

// Update which code field is visible based on role + checkbox state
function updateCodeFields() {
  const role = selectedRole();

  // Teacher accounts are not self-registerable (routes/signup.js
  // SELF_REGISTERABLE_ROLES) — they carry rosters and IEP data, so an admin
  // provisions them. Explain the route instead of letting the POST 403.
  const isTeacher = role === "teacher";
  if (teacherNotice) teacherNotice.classList.toggle("js-hidden", !isTeacher);
  if (submitBtn) submitBtn.disabled = isTeacher;

  // The code question is role-specific ("your teacher's class code" vs "your
  // child's invite code"), so it stays hidden until we know which one to ask.
  if (hasCodeRow) hasCodeRow.hidden = !(role === "student" || role === "parent");

  const isChecked = hasCodeCheckbox.checked && !hasCodeRow.hidden;

  // Update label + hint text based on role
  const codeHint = document.getElementById("codeHint");
  if (codeHint) codeHint.hidden = hasCodeRow.hidden;
  if (role === "parent") {
    hasCodeLabel.textContent = "I have my child's invite code";
    if (codeHint) codeHint.textContent = "Optional — you can link to your child later from your dashboard.";
  } else {
    hasCodeLabel.textContent = "I have a code to enter";
    if (codeHint) codeHint.textContent = "Optional — you can sign up without a code and join a class later.";
  }

  // Show/hide the code input area
  codeInputGroup.style.display = isChecked ? "block" : "none";

  // Hide all code fields first
  enrollmentCodeGroup.style.display = "none";
  parentInviteCodeGroup.style.display = "none";
  inviteCodeGroup.style.display = "none";

  // Clear hidden inputs so they don't submit stale values
  if (!isChecked) {
    document.getElementById("enrollmentCode").value = "";
    document.getElementById("parentInviteCode").value = "";
    document.getElementById("inviteCode").value = "";
    return;
  }

  // Show the right field for the role
  if (role === "student") {
    enrollmentCodeGroup.style.display = "block";
    parentInviteCodeGroup.style.display = "block";
  } else if (role === "parent") {
    inviteCodeGroup.style.display = "block";
  }
}

// Initial state
updateCodeFields();

hasCodeCheckbox.addEventListener("change", updateCodeFields);
roleRadios.forEach((radio) => radio.addEventListener("change", updateCodeFields));

// Handle form submission with Fetch API
signupForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const role = selectedRole();
    if (!role) {
      showMessage('Choose whether you are signing up as a parent, student, or teacher.', 'error');
      const firstRadio = roleRadios[0];
      if (firstRadio) firstRadio.focus();
      return;
    }

    if (role === 'teacher') {
      showMessage('Teacher accounts are set up by us — use the request link above.', 'error');
      return;
    }

    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (password !== confirmPassword) {
      showMessage('Passwords do not match!', 'error');
      return;
    }

    const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
      showMessage('Password must be at least 8 characters long and include one uppercase letter, one lowercase letter, and one number.', 'error');
      return;
    }

    if (!document.getElementById('termsAccepted').checked) {
      showMessage('You must agree to the Terms of Use and Privacy Policy.', 'error');
      return;
    }

    const formData = new FormData(signupForm);
    const data = Object.fromEntries(formData.entries());
    if (parentInviteToken) data.parentInviteToken = parentInviteToken;

    signupMessage.style.display = 'none';

    try {
        const response = await csrfFetch('/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data),
            credentials: 'include'
        });

        const result = await response.json();

        if (response.ok) {
            showMessage(result.message, 'success');

            setTimeout(() => {
                window.location.href = result.redirect || '/complete-profile.html';
            }, 1500);

        } else {
            let errorText = result.message || 'An error occurred during signup.';
            if (result.errors && result.errors.length > 0) {
                errorText = result.errors.map(e => e.message).join(' ');
            }
            showMessage(errorText, 'error');
        }
    } catch (error) {
        console.error('Signup Error:', error);
        showMessage('Network error or server unavailable.', 'error');
    }
});

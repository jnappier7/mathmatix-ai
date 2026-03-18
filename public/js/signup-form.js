const roleSelect = document.getElementById("role");
const hasCodeCheckbox = document.getElementById("hasCodeCheckbox");
const hasCodeLabel = document.getElementById("hasCodeLabel");
const codeInputGroup = document.getElementById("codeInputGroup");
const enrollmentCodeGroup = document.getElementById("enrollmentCodeGroup");
const inviteCodeGroup = document.getElementById("inviteCodeGroup");
const parentInviteCodeGroup = document.getElementById("parentInviteCodeGroup");
const signupForm = document.getElementById("signupForm");
const signupMessage = document.getElementById("signup-message");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirm-password");

// Update which code field is visible based on role + checkbox state
function updateCodeFields() {
  const isChecked = hasCodeCheckbox.checked;
  const role = roleSelect.value;

  // Update label + hint text based on role
  const codeHint = document.getElementById("codeHint");
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
roleSelect.addEventListener("change", updateCodeFields);

// Handle form submission with Fetch API
signupForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (password !== confirmPassword) {
      signupMessage.textContent = 'Passwords do not match!';
      signupMessage.className = 'error';
      signupMessage.style.display = 'block';
      return;
    }

    const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
      signupMessage.textContent = 'Password must be at least 8 characters long and include one uppercase letter, one lowercase letter, and one number.';
      signupMessage.className = 'error';
      signupMessage.style.display = 'block';
      return;
    }

    if (!document.getElementById('termsAccepted').checked) {
      signupMessage.textContent = 'You must agree to the Terms of Use and Privacy Policy.';
      signupMessage.className = 'error';
      signupMessage.style.display = 'block';
      return;
    }

    const formData = new FormData(signupForm);
    const data = Object.fromEntries(formData.entries());

    signupMessage.style.display = 'none';

    try {
        const response = await csrfFetch('/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            signupMessage.textContent = result.message;
            signupMessage.className = 'success';
            signupMessage.style.display = 'block';

            setTimeout(() => {
                window.location.href = result.redirect || '/complete-profile.html';
            }, 1500);

        } else {
            let errorText = result.message || 'An error occurred during signup.';
            if (result.errors && result.errors.length > 0) {
                errorText = result.errors.map(e => e.message).join(' ');
            }
            signupMessage.textContent = errorText;
            signupMessage.className = 'error';
            signupMessage.style.display = 'block';
        }
    } catch (error) {
        console.error('Signup Error:', error);
        signupMessage.textContent = 'Network error or server unavailable.';
        signupMessage.className = 'error';
        signupMessage.style.display = 'block';
    }
});

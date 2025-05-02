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
      localStorage.setItem("userId", data.user._id); // ✅ now saved to use in chat.js
      localStorage.setItem("name", data.user.name);
      localStorage.setItem("tone", data.user.tonePreference);
      window.location.href = "/chat.html";
    } else {
      alert(data.message || "Invalid username or password.");
    }
  } catch (err) {
    console.error(err);
    alert("Something went wrong while logging in.");
  }
});

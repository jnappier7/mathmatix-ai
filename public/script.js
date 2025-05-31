// script.js
console.log("LOG: M∆THM∆TIΧ Initialized");

const chatBox = document.getElementById("chat-container-inner");
const input = document.getElementById("user-input");
const sendBtn = document.getElementById("send-button");
const micBtn = document.getElementById("mic-button");
const attachBtn = document.getElementById("attach-button");
const equationBtn = document.getElementById("insert-equation");
const fileInput = document.getElementById("file-input");

const mathModal = document.getElementById("equation-popup");
const insertMathBtn = document.getElementById("insert-latex");
const closeMathBtn = document.getElementById("close-equation-popup");
const mathInput = document.getElementById("math-editor");

let currentUser = null;

// Load user profile and handle redirection based on role
fetch("/user")
  .then((res) => res.json())
  .then((data) => {
    currentUser = data;
    // --- START MODIFIED LOGIC FOR ROLE-BASED REDIRECTION ---
    // If currentUser is null (not logged in), redirect to login page
    if (!currentUser || !currentUser._id) {
        window.location.href = "/login.html"; // Redirects to login page
    } else {
        const userRole = localStorage.getItem("userRole"); // Get the role from localStorage

        if (userRole === "admin") {
            window.location.href = "/admin_dashboard.html";
        } else if (userRole === "teacher") {
            window.location.href = "/teacher_dashboard.html";
        } else { // Default to student
            // Original logic for students, now within the 'else' block
            fetch(`/welcome-message?userId=${currentUser._id}`)
                .then(response => response.json())
                .then(welcomeData => {
                    appendMessage(welcomeData.greeting, "ai");
                })
                .catch(err => {
                    console.error("ERROR: Error fetching welcome message:", err);
                    appendMessage("Hello! How can I help you today?", "ai");
                });
        }
    }
    // --- END MODIFIED LOGIC ---
  })
  .catch((err) => {
    console.error("ERROR: Error loading user profile:", err);
    window.location.href = "/login.html"; // Redirect on any user load error
  });

function appendMessage(message, sender = "user") {
  const messageContent = typeof message === 'string' ? message : String(message || '');

  const bubble = document.createElement("div");
  bubble.className = `message ${sender === "user" ? "user" : "ai"}`;

  const mathRegex = /\[MATH\](.*?)\[\/MATH\]/g;
  const matches = [...messageContent.matchAll(mathRegex)];

  if (matches.length > 0) {
    let renderedHtml = messageContent;
    matches.forEach(match => {
      const fullTag = match[0];
      const mathLatex = match[1];
      renderedHtml = renderedHtml.replace(fullTag, `<span class="math-render">\\(${mathLatex}\\)</span>`);
    });
    bubble.innerHTML = renderedHtml;
    MathJax.typesetPromise(bubble.querySelectorAll(".math-render"));
  } else {
    bubble.textContent = messageContent;
  }

  chatBox.appendChild(bubble);
  chatBox.scrollTop = chatBox.scrollHeight;
}

if (sendBtn) sendBtn.addEventListener("click", sendMessage);
if (input) input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
  }
});

function sendMessage() {
  const message = input.value.trim();
  if (!message) return;

  appendMessage(message, "user");
  input.value = "";

  showThinkingIndicator(true);

  fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: currentUser?._id, message }),
  })
    .then((res) => res.json())
    .then((data) => {
        appendMessage(data.text, "ai");
    })
    .catch((err) => {
      console.error("ERROR: Chat error:", err);
      appendMessage("WARNING: AI error. Please try again. Your session might have expired. Try logging in again if this persists.", "ai");
    })
    .finally(() => {
        showThinkingIndicator(false);
    });
}

let recognition;
if ("webkitSpeechRecognition" in window) {
  recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    input.value = transcript;
    sendMessage();
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event);
  };

  if (micBtn) micBtn.addEventListener("click", () => recognition.start());
}

if (attachBtn && fileInput) {
  attachBtn.addEventListener("click", () => fileInput.click());
}
if (fileInput) {
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    if (currentUser) {
        formData.append("userId", currentUser._id);
        formData.append("name", currentUser.name || '');
        formData.append("tonePreference", currentUser.tonePreference || '');
        formData.append("learningStyle", currentUser.learningStyle || '');
        formData.append("interests", JSON.stringify(currentUser.interests || []));
    }

    appendMessage(`Upload: ${file.name}`, "user");

    showThinkingIndicator(true);

    fetch("/upload", {
      method: "POST",
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => appendMessage(data.text, "ai"))
      .catch((err) => {
        console.error("ERROR: Upload error:", err);
        appendMessage("WARNING: Upload failed. Ensure the file is a clear image of math or PDF.", "ai");
      })
      .finally(() => {
        showThinkingIndicator(false);
    });
  });
}

if (equationBtn && mathModal && mathInput) {
  equationBtn.addEventListener("click", () => {
    mathModal.style.display = "block";
    mathInput.value = "";
    mathInput.focus();
  });
}

if (insertMathBtn && mathModal && mathInput) {
  insertMathBtn.addEventListener("click", () => {
    const math = mathInput.value.trim();
    if (math) {
      const wrapped = `[MATH]${math}[/MATH]`;
      input.value += " " + wrapped + " ";
    }
    mathModal.style.display = "none";
    mathInput.value = "";
  });
}

if (closeMathBtn && mathModal && mathInput) {
  closeMathBtn.addEventListener("click", () => {
    mathModal.style.display = "none";
    mathInput.value = "";
  });
}

window.addEventListener("click", (e) => {
  if (e.target === mathModal) {
    mathModal.style.display = "none";
    mathInput.value = "";
  }
});

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    // Note: The /logout route in server.js now handles summary generation
    // We don't need to explicitly clear localStorage here before the fetch,
    // as it will be cleared after successful logout redirect.
    fetch("/logout")
      .then(() => {
        // Redirection handled by server after summary generation
        window.location.href = "/login.html"; // Ensure final redirect after server handles it
      })
      .catch((err) => {
        console.error("ERROR: Logout failed:", err);
        alert("Logout failed. Please try again.");
      });
  });
}

const thinkingIndicator = document.getElementById("thinking-indicator");

function showThinkingIndicator(show) {
    if (thinkingIndicator) {
        thinkingIndicator.style.display = show ? "flex" : "none";
    }
}

// --- NEW: Send session end signal on tab close/navigation ---
window.addEventListener('beforeunload', (event) => {
    const userId = localStorage.getItem('userId');
    // Check if user is logged in and on the chat page
    if (userId && window.location.pathname.includes('/chat.html')) {
        // Use navigator.sendBeacon for a fire-and-forget request that won't be cancelled on tab close
        navigator.sendBeacon('/api/end-session', JSON.stringify({ userId: userId }));
    }
    // No need to return anything for modern browsers or sendBeacon.
});
// --- END NEW ---
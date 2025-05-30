// script.js
console.log("LOG: M∆THM∆TIΧ Initialized"); // Replaced emoji

const chatBox = document.getElementById("chat-container-inner");
const input = document.getElementById("user-input");
const sendBtn = document.getElementById("send-button");
const micBtn = document.getElementById("mic-button");
const attachBtn = document.getElementById("attach-button");
const equationBtn = document.getElementById("insert-equation");
const fileInput = document.getElementById("file-input");

// --- START EDIT 1: Corrected MathLive popup element IDs ---
// These IDs were inconsistent with chat.html.
const mathModal = document.getElementById("equation-popup");
const insertMathBtn = document.getElementById("insert-latex");
const closeMathBtn = document.getElementById("close-equation-popup");
const mathInput = document.getElementById("math-editor");
// --- END EDIT 1 ---

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
            window.location.href = "/admin_dashboard.html"; // Will create this next!
        } else if (userRole === "teacher") {
            window.location.href = "/teacher_dashboard.html"; // Will create this next!
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

// --- START EDIT 3: Made appendMessage more robust and improved MathJax regex ---
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
// --- END EDIT 3 ---

// Send message to server
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

  // --- START EDIT 4: Show thinking indicator ---
  showThinkingIndicator(true);
  // --- END EDIT 4 ---

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
      // --- START EDIT 5: Provide more helpful error message ---
      appendMessage("WARNING: AI error. Please try again. Your session might have expired. Try logging in again if this persists.", "ai");
      // --- END EDIT 5 ---
    })
    .finally(() => {
        // --- START EDIT 6: Hide thinking indicator regardless of success or failure ---
        showThinkingIndicator(false);
        // --- END EDIT 6 ---
    });
}

// Speech-to-text
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
    console.error("Speech recognition error:", event.error);
  };

  if (micBtn) micBtn.addEventListener("click", () => recognition.start());
}

// File upload
if (attachBtn && fileInput) {
  attachBtn.addEventListener("click", () => fileInput.click());
}
if (fileInput) {
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    // --- START EDIT 7: Append user data to FormData for upload ---
    if (currentUser) {
        formData.append("userId", currentUser._id);
        formData.append("name", currentUser.name || '');
        formData.append("tonePreference", currentUser.tonePreference || '');
        formData.append("learningStyle", currentUser.learningStyle || '');
        formData.append("interests", JSON.stringify(currentUser.interests || []));
    }
    // --- END EDIT 7 ---

    appendMessage(`Upload: ${file.name}`, "user");

    // --- START EDIT 8: Show thinking indicator for upload ---
    showThinkingIndicator(true);
    // --- END EDIT 8 ---

    fetch("/upload", {
      method: "POST",
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => appendMessage(data.text, "ai"))
      .catch((err) => {
        console.error("ERROR: Upload error:", err);
        // --- START EDIT 9: Provide more helpful error message for upload ---
        appendMessage("WARNING: Upload failed. Ensure the file is a clear image of math or PDF.", "ai");
        // --- END EDIT 9 ---
      })
      .finally(() => {
        // --- START EDIT 10: Hide thinking indicator regardless of success or failure ---
        showThinkingIndicator(false);
        // --- END EDIT 10 ---
    });
  });
}

// Equation button popup
if (equationBtn && mathModal && mathInput) {
  equationBtn.addEventListener("click", () => {
    mathModal.style.display = "block";
    mathInput.value = "";
    mathInput.focus();
  });
}

// Insert equation into message
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

// Close math editor
if (closeMathBtn && mathModal && mathInput) {
  closeMathBtn.addEventListener("click", () => {
    mathModal.style.display = "none";
    mathInput.value = "";
  });
}

// Close popup if clicked outside
window.addEventListener("click", (e) => {
  if (e.target === mathModal) {
    mathModal.style.display = "none";
    mathInput.value = "";
  }
});

// --- START EDIT 11: Add Logout Button functionality ---
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    fetch("/logout")
      .then(() => {
        // Clear local storage on logout for a clean slate
        localStorage.removeItem("mathmatixUser");
        localStorage.removeItem("userId");
        localStorage.removeItem("name");
        localStorage.removeItem("tone");
        localStorage.removeItem("userRole"); // Clear the role too!
        window.location.href = "/login.html";
      })
      .catch((err) => {
        console.error("ERROR: Logout failed:", err);
        alert("Logout failed. Please try again.");
      });
  });
}
// --- END EDIT 11 ---

// --- START EDIT 12: Add Thinking Indicator helper functions ---
const thinkingIndicator = document.getElementById("thinking-indicator");

function showThinkingIndicator(show) {
    if (thinkingIndicator) {
        thinkingIndicator.style.display = show ? "flex" : "none";
    }
}
// --- END EDIT 12 ---
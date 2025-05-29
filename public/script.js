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
const mathModal = document.getElementById("equation-popup"); // Changed from math-modal to equation-popup to match chat.html
const insertMathBtn = document.getElementById("insert-latex"); // Changed from insert-math-button to insert-latex to match chat.html
const closeMathBtn = document.getElementById("close-equation-popup"); // Changed from close-math-button to close-equation-popup to match chat.html
const mathInput = document.getElementById("math-editor"); // Changed from math-input to math-editor to match chat.html
// --- END EDIT 1 ---

let currentUser = null;

// Load user profile
fetch("/user")
  .then((res) => res.json())
  .then((data) => {
    currentUser = data;
    // --- START EDIT 2: Add check for currentUser before trying to send user info ---
    // If currentUser is null (not logged in), redirect to login page
    if (!currentUser || !currentUser._id) {
        window.location.href = "/login.html"; // Redirects to login page
    } else {
        // --- START EDIT: Fetch and display personalized welcome message ---
        fetch(`/welcome-message?userId=${currentUser._id}`) // Use userId from loaded user
            .then(response => response.json())
            .then(welcomeData => {
                appendMessage(welcomeData.greeting, "ai"); // Append the AI's greeting
            })
            .catch(err => {
                console.error("ERROR: Error fetching welcome message:", err); // Replaced emoji
                appendMessage("Hello! How can I help you today?", "ai"); // Fallback greeting
            });
        // --- END EDIT ---
    }
    // --- END EDIT 2 ---
  })
  .catch((err) => {
    console.error("ERROR: Error loading user profile:", err); // Replaced emoji
    window.location.href = "/login.html"; // Redirect on any user load error
  });

// --- START EDIT 3: Made appendMessage more robust and improved MathJax regex ---
function appendMessage(message, sender = "user") {
  // Ensure messageContent is a string, default to empty if message is null/undefined
  const messageContent = typeof message === 'string' ? message : String(message || '');

  const bubble = document.createElement("div");
  bubble.className = `message ${sender === "user" ? "user" : "ai"}`;

  // Updated regex to correctly match [/MATH] (with two slashes) and be global for multiple matches
  const mathRegex = /\[MATH\](.*?)\[\/MATH\]/g; // Changed from \[/MATH] to \[\/MATH\]
  const matches = [...messageContent.matchAll(mathRegex)]; // Use matchAll for finding all instances

  if (matches.length > 0) {
    let renderedHtml = messageContent;
    matches.forEach(match => {
      const fullTag = match[0]; // e.g., [MATH]y=x^2[/MATH]
      const mathLatex = match[1]; // e.g., y=x^2
      // Replace the full tag with a span for MathJax rendering
      renderedHtml = renderedHtml.replace(fullTag, `<span class="math-render">\\(${mathLatex}\\)</span>`);
    });
    bubble.innerHTML = renderedHtml;
    // Typeset all math elements within the bubble
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
  if (e.key === "Enter" && !e.shiftKey) { // Added shiftKey check for multiline input
      e.preventDefault(); // Prevent new line on Enter
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
      console.error("ERROR: Chat error:", err); // Replaced emoji
      // --- START EDIT 5: Provide more helpful error message ---
      appendMessage("WARNING: AI error. Please try again. Your session might have expired. Try logging in again if this persists.", "ai"); // Replaced emoji
      // --- END EDIT 5 ---
    })
    .finally(() => {
        // --- START EDIT 6: Hide thinking indicator regardless of success or failure ---
        showThinkingIndicator(false);
        // --- END EDIT 6 ---
    });
}

// Speech-to-text (rephrased emoji comment)
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

// File upload (rephrased emoji comment)
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
        formData.append("name", currentUser.name || ''); // Ensure string, default to empty
        formData.append("tonePreference", currentUser.tonePreference || ''); // Match backend property name
        formData.append("learningStyle", currentUser.learningStyle || '');
        // Interests is an array, stringify it for FormData. Backend will need to parse this.
        formData.append("interests", JSON.stringify(currentUser.interests || []));
    }
    // --- END EDIT 7 ---

    appendMessage(`Upload: ${file.name}`, "user"); // Replaced emoji

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
        console.error("ERROR: Upload error:", err); // Replaced emoji
        // --- START EDIT 9: Provide more helpful error message for upload ---
        appendMessage("WARNING: Upload failed. Ensure the file is a clear image of math or PDF.", "ai"); // Replaced emoji
        // --- END EDIT 9 ---
      })
      .finally(() => {
        // --- START EDIT 10: Hide thinking indicator regardless of success or failure ---
        showThinkingIndicator(false);
        // --- END EDIT 10 ---
    });
  });
}

// Equation button popup (rephrased emoji comment)
if (equationBtn && mathModal && mathInput) {
  equationBtn.addEventListener("click", () => {
    mathModal.style.display = "block";
    mathInput.value = "";
    mathInput.focus();
  });
}

// Insert equation into message (rephrased emoji comment)
if (insertMathBtn && mathModal && mathInput) {
  insertMathBtn.addEventListener("click", () => {
    const math = mathInput.value.trim();
    if (math) {
      // Ensure the MathJax regex in appendMessage matches this format
      const wrapped = `[MATH]${math}[/MATH]`;
      input.value += " " + wrapped + " ";
    }
    mathModal.style.display = "none";
    mathInput.value = "";
  });
}

// Close math editor (rephrased emoji comment)
if (closeMathBtn && mathModal && mathInput) {
  closeMathBtn.addEventListener("click", () => {
    mathModal.style.display = "none";
    mathInput.value = "";
  });
}

// Close popup if clicked outside (rephrased emoji comment)
window.addEventListener("click", (e) => {
  if (e.target === mathModal) {
    mathModal.style.display = "none";
    mathInput.value = "";
  }
});

// --- START EDIT 11: Add Logout Button functionality ---
const logoutBtn = document.getElementById("logoutBtn"); // Get the logout button element
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    fetch("/logout") // Call the backend logout route
      .then(() => {
        window.location.href = "/login.html"; // Redirect to login page after logout
      })
      .catch((err) => {
        console.error("ERROR: Logout failed:", err); // Replaced emoji
        alert("Logout failed. Please try again.");
      });
  });
}
// --- END EDIT 11 ---

// --- START EDIT 12: Add Thinking Indicator helper functions ---
const thinkingIndicator = document.getElementById("thinking-indicator"); // Get the thinking indicator element

function showThinkingIndicator(show) {
    if (thinkingIndicator) {
        thinkingIndicator.style.display = show ? "flex" : "none";
    }
}
// --- END EDIT 12 ---
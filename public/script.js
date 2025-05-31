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

// --- NEW GAMIFICATION ELEMENTS ---
const currentLevelSpan = document.getElementById("current-level");
const xpProgressBar = document.getElementById("xp-progress-bar");
const currentXpSpan = document.getElementById("current-xp");
const xpNeededSpan = document.getElementById("xp-needed");
const XP_PER_LEVEL = 100; // Define XP needed to level up (must match backend for consistent display)
// --- END NEW GAMIFICATION ELEMENTS ---

// --- LEADERBOARD POPUP ELEMENTS ---
// These are now selected *after* DOMContentLoaded to ensure they exist
let leaderboardPopup;
let showLeaderboardBtn;
let closeLeaderboardBtn;
// --- END LEADERBOARD POPUP ELEMENTS ---


let currentUser = null;

// Load user profile and handle redirection based on role
fetch("/user", { credentials: 'include' }) // ADDED credentials: 'include'
  .then((res) => res.json())
  .then((data) => {
    // If the server explicitly tells us to redirect (e.g., for profile completion)
    if (data.redirect) {
        console.log(`Redirecting to: ${data.redirect}`);
        window.location.href = data.redirect;
        return; // Stop further execution
    }

    currentUser = data;
    if (!currentUser || !currentUser._id) {
        window.location.href = "/login.html";
    } else {
        const userRole = currentUser.role;

        if (userRole === "admin") {
            window.location.href = "/admin_dashboard.html";
        } else if (userRole === "teacher") {
            window.location.href = "/teacher_dashboard.html";
        } else {
            fetch(`/welcome-message?userId=${currentUser._id}`)
                .then(response => response.json())
                .then(welcomeData => {
                    appendMessage(welcomeData.greeting, "ai");
                })
                .catch(err => {
                    console.error("ERROR: Error fetching welcome message:", err);
                    appendMessage("Hello! How can I help you today?", "ai");
                });

            updateGamifiedDashboard(currentUser.xp, currentUser.level);
        }
    }
  })
  .catch((err) => {
    console.error("ERROR: Error loading user profile:", err);
    window.location.href = "/login.html";
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
        if (data.userXp !== undefined && data.userLevel !== undefined) {
            updateGamifiedDashboard(data.userXp, data.userLevel);
        }
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
    fetch("/logout")
      .then(() => {
        window.location.href = "/login.html";
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

// --- Send session end signal on tab close/navigation ---
window.addEventListener('beforeunload', (event) => {
    const userId = currentUser?._id;
    if (userId && window.location.pathname.includes('/chat.html')) {
        navigator.sendBeacon('/api/end-session', JSON.stringify({ userId: userId }));
    }
});
// --- END NEW ---

// --- NEW: Gamified Dashboard Update Function ---
function updateGamifiedDashboard(xp, level) {
    if (currentLevelSpan && xpProgressBar && currentXpSpan && xpNeededSpan) {
        currentLevelSpan.textContent = level;
        const xpNeededForNextLevel = (level + 1) * XP_PER_LEVEL;
        const progressPercentage = (xp / XP_PER_LEVEL) * 100;

        xpProgressBar.style.width = `${progressPercentage}%`;
        currentXpSpan.textContent = xp;
        xpNeededSpan.textContent = xpNeededForNextLevel;

        console.log(`DEBUG: Gamification updated. Level: ${level}, XP: ${xp}/${xpNeededForNextLevel}`);
    } else {
        console.warn("DEBUG: Gamification elements not found in DOM.");
    }
}
// --- END NEW ---

// --- NEW LEADERBOARD POPUP LOGIC ---
async function fetchAndDisplayLeaderboard() {
    const leaderboardTableBody = document.querySelector('#leaderboardTable tbody');
    if (!leaderboardTableBody) {
        console.error("ERROR: Leaderboard table body not found when attempting to fetch and display.");
        return;
    }
    leaderboardTableBody.innerHTML = `
        <tr>
            <td colspan="4" class="text-center py-4 text-gray-500">Loading leaderboard...</td>
        </tr>
    `;

    try {
        const response = await fetch('/api/students/leaderboard', { credentials: 'include' }); // ADDED credentials: 'include'

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }

        const students = await response.json();

        leaderboardTableBody.innerHTML = '';

        if (students.length === 0) {
            leaderboardTableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center py-4 text-gray-500">No students found for this leaderboard.</td>
                </tr>
            `;
            return;
        }

        students.forEach((student, index) => {
            const rank = index + 1;
            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50 transition-colors duration-150';
            row.innerHTML = `
                <td class="py-3 px-4 text-sm text-gray-700 font-medium">${rank}</td>
                <td class="py-3 px-4 text-sm text-gray-700">${student.name}</td>
                <td class="py-3 px-4 text-sm text-gray-700">${student.level}</td>
                <td class="py-3 px-4 text-sm text-gray-700">${student.xp}</td>
            `;
            leaderboardTableBody.appendChild(row);
        });

    } catch (error) {
        console.error('Error fetching leaderboard data:', error);
        if (leaderboardTableBody) {
            leaderboardTableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center py-4 text-red-500">Failed to load leaderboard. Please ensure you are logged in and authorized.</td>
                </tr>
            `;
        }
    }
}

// Ensure elements are found before attaching listeners
document.addEventListener('DOMContentLoaded', () => {
    // Assign leaderboard elements here AFTER DOMContentLoaded
    leaderboardPopup = document.getElementById('leaderboardPopup');
    showLeaderboardBtn = document.getElementById('showLeaderboardBtn');
    closeLeaderboardBtn = document.getElementById('closeLeaderboard');

    // Leaderboard button event listeners
    if (showLeaderboardBtn) {
        showLeaderboardBtn.addEventListener('click', () => {
            console.log('Leaderboard button clicked!');
            console.log('DEBUG: Attempting to show leaderboard popup.');
            console.log('DEBUG: leaderboardPopup element:', leaderboardPopup);
            console.log('DEBUG: leaderboardPopup classes BEFORE:', leaderboardPopup.classList);
            leaderboardPopup.classList.remove('hidden');
            console.log('DEBUG: leaderboardPopup classes AFTER:', leaderboardPopup.classList);
            fetchAndDisplayLeaderboard(); // Keep this here to refresh on open
        });
    } else {
        console.warn("DEBUG: showLeaderboardBtn not found.");
    }

    if (closeLeaderboardBtn) {
        closeLeaderboardBtn.addEventListener('click', () => {
            console.log('Close leaderboard button clicked!');
            leaderboardPopup.classList.add('hidden');
        });
    } else {
        console.warn("DEBUG: closeLeaderboardBtn not found.");
    }

    // Initial fetch of leaderboard data when the DOM is loaded
    // This populates the popup so it's ready when opened.
    fetchAndDisplayLeaderboard();
});
// --- END NEW LEADERBOARD POPUP LOGIC ---
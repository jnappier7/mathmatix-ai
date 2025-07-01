// script.js
console.log("LOG: M∆THM∆TIΧ Initialized");

// --- DECLARE ALL CONSTANTS ONCE AT THE TOP ---
const chatBox = document.getElementById("chat-container-inner");
const input = document.getElementById("user-input");
const sendBtn = document.getElementById("send-button");
const micBtn = document.getElementById("mic-button");
const attachBtn = document.getElementById("attach-button");
const equationBtn = document.getElementById("insert-equation-btn"); // Corrected ID

const mathModal = document.getElementById("equation-modal"); // Corrected ID
const insertMathBtn = document.getElementById("insert-latex-eq"); // Corrected ID
const closeMathBtn = document.getElementById("close-equation-modal"); // Corrected ID
const mathInput = document.getElementById("math-editor");

const currentLevelSpan = document.getElementById("current-level");
const xpProgressBar = document.getElementById("xp-progress-bar"); // This will be hidden in new design
const currentXpSpan = document.getElementById("current-xp");
const xpNeededSpan = document.getElementById("xp-needed");
const XP_PER_LEVEL = 100; // Define XP needed to level up (must match backend for consistent display)

let leaderboardPopup; // This now refers to the fixed widget
let xpLevelDisplay; // Reference to the XP/Level widget container

const thinkingIndicator = document.getElementById("thinking-indicator");
const logoutBtn = document.getElementById("logoutBtn");

// Drag and Drop Zone elements - DECLARED ONLY ONCE HERE
// const dropzone = document.getElementById('dropzone'); // This ID is not in chat.html
const fullscreenDropzone = document.getElementById('app-layout-wrapper'); // Use a more general area for drop

// --- END DECLARATIONS ---

let currentUser = null; // Ensure currentUser is declared once

// 1. Helper – runs once for each message bubble
// Renders inline \( … \) and $$ … $$ blocks in that node only
function renderMathLive(container) {
  if (window.MathLive && typeof window.MathLive.renderMathInElement === 'function') {
    window.MathLive.renderMathInElement(container, {
      TeX: {
        inlineMath: [['\\(', '\\)']],
        displayMath: [['$$', '$$']],
      }
    });
  } else {
      console.warn("MathLive is not loaded or renderMathInElement is not available.");
  }
}


// --- NEW COMMON FUNCTION FOR FILE UPLOAD ---
// This function encapsulates the upload process,
// so it can be called from both file input change and drop events.
function uploadSelectedFile(file) {
    if (!file) return;

    // --- Original file size and type checks from script.js ---
    const fileSizeLimit = 5 * 1024 * 1024; // 5 MB
    if (file.size > fileSizeLimit) {
        alert("File size exceeds 5MB limit.");
        showThinkingIndicator(false); // Hide indicator in case of early exit
        return;
    }
    const acceptedTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!acceptedTypes.includes(file.type)) {
        alert("Only JPG, PNG, and PDF files are allowed.");
        showThinkingIndicator(false); // Hide indicator in case of early exit
        return;
    }
    // --- End original checks ---

    const formData = new FormData();
    formData.append("file", file);

    // Ensure currentUser is available before appending its data
    if (currentUser && currentUser._id) {
        formData.append("userId", currentUser._id);
        formData.append("name", currentUser.name || '');
        formData.append("tonePreference", currentUser.tonePreference || '');
        formData.append("learningStyle", JSON.stringify(currentUser.learningStyle || [])); // Stringify non-string data
        formData.append("interests", JSON.stringify(currentUser.interests || []));
    } else {
        // If currentUser is not available, try to fetch it or alert user
        console.warn("WARN: currentUser not available for file upload.");
        alert("User session not fully loaded. Please refresh the page or log in again.");
        showThinkingIndicator(false);
        return;
    }

    appendMessage(`Upload: ${file.name}`, "user");

    showThinkingIndicator(true);

    fetch("/upload", {
      method: "POST",
      body: formData,
      credentials: 'include' // Ensure session cookie is sent with upload
    })
      .then((res) => res.json())
      .then((data) => {
          if (data.text) { // Ensure there is text to append
              appendMessage(data.text, "ai");
          } else {
              appendMessage("WARNING: Upload processed, but no text was extracted or AI response generated.", "ai");
          }
          // Optionally display image if imageUrl is returned and it's an image upload
          if (data.image) { // Assuming 'image' from upload route is base64 string
              const imageBubble = document.createElement("div");
              imageBubble.className = "message ai"; // Or a specific class for image display
              imageBubble.innerHTML = `<img src="${data.image}" class="chat-image" alt="Uploaded Content">`;
              chatBox.appendChild(imageBubble);
              chatBox.scrollTop = chatBox.scrollHeight;
          }
      })
      .catch((err) => {
        console.error("ERROR: Upload error:", err);
        appendMessage("WARNING: Upload failed. Please try again. Ensure the file is a clear image of math or PDF.", "ai");
      })
      .finally(() => {
        showThinkingIndicator(false);
    });
}
// --- END NEW COMMON FUNCTION FOR FILE UPLOAD ---


// Load user profile and handle redirection based on role
fetch("/user", { credentials: 'include' })
  .then((res) => res.json())
  .then((data) => {
    if (data.redirect) {
        console.log(`Redirecting to: ${data.redirect}`);
        window.location.href = data.redirect;
        return;
    }

    // FIX: Correctly access the user object from the 'user' property in the response
    currentUser = data.user;

    if (!currentUser || !currentUser._id) {
        console.log("WARN: currentUser not populated or missing _id. Redirecting to login.");
        window.location.href = "/login.html";
        return;
    }

    const userRole = currentUser.role;

    // These redirects generally should be handled by the server's /user route
    // for authenticated users who don't need profile completion.
    // Keeping this client-side fallback for robustness.
    if (userRole === "admin") {
        window.location.href = "/admin-dashboard.html";
    } else if (userRole === "teacher") {
        window.location.href = "/teacher-dashboard.html";
    } else if (userRole === "parent") {
        window.location.href = "/parent-dashboard.html";
    }
    // If none of the above specific roles, and not redirected, assume student and continue current logic.
    else {
        // For student role, continue to chat.html logic
        const selectedTutorId = localStorage.getItem("selectedTutorId"); // This might be deprecated soon. Fetch from user.selectedTutorId
        const studentAvatarContainer = document.getElementById("student-avatar");

        // Use user.selectedTutorId from the fetched user data, or localStorage as a fallback.
        // Eventually, localStorage should be removed as the source of truth.
        const effectiveTutorId = currentUser.selectedTutorId || selectedTutorId;

        if (effectiveTutorId && studentAvatarContainer) {
            // Destroy any existing Lottie animation
            if (window.avatarAnim) {
                window.avatarAnim.destroy();
                window.avatarAnim = null;
            }
            studentAvatarContainer.innerHTML = ''; // Clear the div's content

            // Create and append the image element for the selected tutor
            const tutorImage = document.createElement('img');
            // CORRECTED: Path for tutor avatars
            tutorImage.src = `/images/tutor_avatars/${effectiveTutorId}.png`;
            tutorImage.alt = `Your tutor`;
            tutorImage.style.width = '100%';
            tutorImage.style.height = '100%';
            tutorImage.style.objectFit = 'contain';
            tutorImage.style.borderRadius = '8px'; // Optional: match design
            studentAvatarContainer.appendChild(tutorImage);
            console.log(`DEBUG: Displaying selected tutor: ${effectiveTutorId}.png`);

        } else if (currentUser.avatar) {
            // Fallback to original avatar loading if no tutor is selected
            // Ensure avatarAnim is defined globally (e.g., as window.avatarAnim)
            if (typeof lottie !== 'undefined' && studentAvatarContainer) { // Check if Lottie library is available
                const defaultAvatarPath = "/animations/idle.json";
                let avatarAnimationPath = defaultAvatarPath;

                if (currentUser.avatar.lottiePath) {
                    avatarAnimationPath = currentUser.avatar.lottiePath;
                } else if (currentUser.avatar.skin && currentUser.avatar.hair) {
                    avatarAnimationPath = `/avatars/preview?skin=${currentUser.avatar.skin}&hair=${currentUser.avatar.hair}&top=${currentUser.avatar.top || 'default'}&bottom=${currentUser.avatar.bottom || 'default'}&accessory=${currentUser.avatar.accessory || 'none'}`;
                }

                if (window.avatarAnim && window.avatarAnim.path !== avatarAnimationPath) {
                     window.avatarAnim.destroy();
                     window.avatarAnim = lottie.loadAnimation({
                        container: studentAvatarContainer,
                        renderer: "svg",
                        loop: true,
                        autoplay: true,
                        path: avatarAnimationPath
                     });
                     console.log("DEBUG: Reloaded avatar with path:", avatarAnimationPath);
                } else if (!window.avatarAnim) {
                    window.avatarAnim = lottie.loadAnimation({
                        container: studentAvatarContainer,
                        renderer: "svg",
                        loop: true,
                        autoplay: true,
                        path: avatarAnimationPath
                     });
                    console.log("DEBUG: Initialized avatar with path:", avatarAnimationPath);
                } else {
                    console.log("DEBUG: Avatar path is already set or current, no need to reload.");
                }
            } else {
                console.warn("WARN: Lottie library or student-avatar container not found. Avatar animations may not work.");
            }
        } else {
            console.log("DEBUG: No custom avatar or selected tutor found for user, using default idle animation.");
            // Ensure default idle animation is loaded if no custom avatar or selected tutor
            if (typeof lottie !== 'undefined' && studentAvatarContainer) { // Check if Lottie library is available
                if (window.avatarAnim && window.avatarAnim.path !== "/animations/idle.json") {
                    window.avatarAnim.destroy();
                    window.avatarAnim = lottie.loadAnimation({
                        container: studentAvatarContainer,
                        renderer: "svg",
                        loop: true,
                        autoplay: true,
                        path: "/animations/idle.json"
                    });
                } else if (!window.avatarAnim) {
                     window.avatarAnim = lottie.loadAnimation({
                        container: studentAvatarContainer,
                        renderer: "svg",
                        loop: true,
                        autoplay: true,
                        path: "/animations/idle.json"
                     });
                }
            }
        }

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
  })
  .catch((err) => {
    console.error("ERROR: Error loading user profile:", err);
    if (err.message.includes('401') || err.message.includes('Not logged in')) {
        window.location.href = "/login.html";
    } else {
        // Fallback for other errors, e.g., network issues
        console.error("Unknown error, redirecting to login as fallback.");
        window.location.href = "/login.html";
    }
  });

function appendMessage(message, sender = "user") {
  const messageContent = typeof message === 'string' ? message : String(message || '');

  const bubble = document.createElement("div");
  bubble.className = `message ${sender === "user" ? "user" : "ai"}`;

  // This part is handled by MathLive's renderMathInElement now
  bubble.textContent = messageContent;
  chatBox.appendChild(bubble);
  // NEW: Render MathLive after appending message
  renderMathLive(bubble); 
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
            updateGamifiedDashboard(data.userXp, data.userLevel, data.specialXpAwarded);
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

// --- FILE INPUT ATTACH BUTTON LISTENER (UPDATED TO USE COMMON FUNCTION) ---
if (attachBtn && fileInput) {
  attachBtn.addEventListener("click", () => fileInput.click());
}

if (fileInput) {
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    uploadSelectedFile(file);
  });
}
// --- END FILE INPUT ATTACH BUTTON LISTENER ---

// --- Drag and Drop Zone logic (UPDATED) ---
// dropzone and fullscreenDropzone are declared ONCE at the top of the file.
// This block ensures the drag/drop listeners are attached correctly.
if (fullscreenDropzone) { // Using app-layout-wrapper as the drop zone
    fullscreenDropzone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        // Add a visual indicator for the drop zone
        fullscreenDropzone.classList.add('drag-active');
    });

    fullscreenDropzone.addEventListener('dragover', (e) => {
        e.preventDefault(); // Crucial: prevents browser's default behavior
    });

    fullscreenDropzone.addEventListener('dragleave', (e) => {
        // Check if the drag is truly leaving the dropzone, not just moving over a child element
        if (!e.relatedTarget || !fullscreenDropzone.contains(e.relatedTarget)) {
             fullscreenDropzone.classList.remove('drag-active');
        }
    });

    fullscreenDropzone.addEventListener('drop', (e) => {
        e.preventDefault(); // Crucial: prevents browser from opening the file
        fullscreenDropzone.classList.remove('drag-active');
        const file = e.dataTransfer.files[0];
        if (file) {
            uploadSelectedFile(file); // Call the new common function here
        }
    });
}
// --- END Drag AND Drop Zone logic ---


if (equationBtn && mathModal && mathInput) {
  equationBtn.addEventListener("click", () => {
    mathModal.style.display = "block";
    // For MathLive, use .setValue('') or .value = ''
    mathInput.value = "";
    mathInput.focus();
  });
}

if (insertMathBtn && mathModal && mathInput) {
  insertMathBtn.addEventListener("click", () => {
    // For MathLive, get the LaTeX value with .getValue('latex') or .value
    const math = mathInput.value; // Get the raw value from math-field
    if (math.trim()) { // Check if it's not empty after trimming
      // Wrap LaTeX with standard MathLive delimiters for rendering
      const wrapped = `\\(${math}\\)`; // Use inline math delimiters for general chat
      input.value += " " + wrapped + " ";
    }
    mathModal.style.display = "none";
    mathInput.value = ""; // Clear MathLive input
  });
}

if (closeMathBtn && mathModal && mathInput) {
  closeMathBtn.addEventListener("click", () => {
    mathModal.style.display = "none";
    mathInput.value = ""; // Clear MathLive input
  });
}

window.addEventListener("click", (e) => {
  if (e.target === mathModal) {
    mathModal.style.display = "none";
    mathInput.value = ""; // Clear MathLive input
  }
});

// REMOVED DUPLICATE: const logoutBtn = document.getElementById("logoutBtn");
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

// REMOVED DUPLICATE: const thinkingIndicator = document.getElementById("thinking-indicator");

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

// --- Gamified Dashboard Update Function ---
// Modified to accept specialXpAwarded for animation trigger
function updateGamifiedDashboard(userXp, userLevel, specialXpAwarded = 0) {
    if (currentLevelSpan && xpLevelDisplay && currentXpSpan && xpNeededSpan) {
        const oldLevel = parseInt(currentLevelSpan.textContent);
        // const oldXp = parseInt(currentXpSpan.textContent); // Not used

        currentLevelSpan.textContent = userLevel;
        const xpNeededForNextLevel = (userLevel + 1) * XP_PER_LEVEL;
        currentXpSpan.textContent = userXp;
        xpNeededSpan.textContent = xpNeededForNextLevel;

        // --- ANIMATION TRIGGER LOGIC ---
        if (userLevel > oldLevel) {
            // User leveled up! Trigger level up animation.
            triggerLevelUpAnimation(userLevel);
        } else if (specialXpAwarded > 0) {
            // Special XP was awarded by the tutor.
            triggerXpGainAnimation(specialXpAwarded, true); // `true` for special styling
        }
        // No animation for regular turn-based XP now

        console.log(`DEBUG: Gamification updated. Level: ${userLevel}, XP: ${userXp}/${xpNeededForNextLevel}`);
    } else {
        console.warn("DEBUG: Gamification elements not found in DOM.");
    }
}
// --- End Gamified Dashboard Update Function ---

// --- Animation Functions for XP/Level Up ---
function triggerXpGainAnimation(amount, isSpecial = false) {
    const xpDisplay = document.getElementById('xp-level-display');
    if (!xpDisplay) return;

    const animationText = document.createElement('div');
    animationText.className = 'xp-animation-text';
    animationText.textContent = `+${amount} XP`;

    if (isSpecial) {
        animationText.classList.add('special-xp');
        animationText.textContent = `+${amount} XP (Bonus!)`;
    }

    const rect = xpDisplay.getBoundingClientRect();
    animationText.style.position = 'fixed';
    animationText.style.left = `${rect.left + rect.width / 2}px`;
    animationText.style.top = `${rect.top + rect.height / 2}px`;
    animationText.style.transform = 'translate(-50%, -50%)';

    document.body.appendChild(animationText);

    // Trigger reflow to ensure animation starts
    animationText.offsetWidth;

    animationText.classList.add('animate-xp');
    animationText.addEventListener('animationend', () => {
        animationText.remove(); // Clean up the element after animation
    });
}

function triggerLevelUpAnimation(newLevel) {
    const xpDisplay = document.getElementById('xp-level-display');
    if (!xpDisplay) return;

    const animationText = document.createElement('div');
    animationText.className = 'level-up-animation-text';
    animationText.textContent = `Level ${newLevel} UP!`;

    const rect = xpDisplay.getBoundingClientRect();
    animationText.style.position = 'fixed';
    animationText.style.left = `${rect.left + rect.width / 2}px`;
    animationText.style.top = `${rect.top + rect.height / 2}px`;
    animationText.style.transform = 'translate(-50%, -50%)';

    document.body.appendChild(animationText);

    animationText.offsetWidth; // Trigger reflow

    animationText.classList.add('animate-level-up');
    animationText.addEventListener('animationend', () => {
        animationText.remove();
    });
}
// --- End Animation Functions for XP/Level Up ---


// --- LEADERBOARD WIDGET LOGIC ---
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
        const response = await fetch('/api/leaderboard', { credentials: 'include' }); // Corrected API path

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
    // Assign widget elements here AFTER DOMContentLoaded
    leaderboardPopup = document.getElementById('leaderboardPopup'); // This element might not exist anymore if it was a popup
    xpLevelDisplay = document.getElementById('xp-level-display'); // Get XP display reference

    // Initial fetch of leaderboard data since it's now always visible
    fetchAndDisplayLeaderboard();

    // Removed showLeaderboardBtn and closeLeaderboardBtn logic for fixed widgets
    // If you add a toggle button later, its events would go here.
});
// --- END LEADERBOARD WIDGET LOGIC ---

// --- Drag and Drop Zone logic ---
// dropzone and fullscreenDropzone are declared ONCE at the top of the file.
// This block ensures the drag/drop listeners are attached correctly.
// Using app-layout-wrapper as the fullscreen dropzone because chat.html doesn't have a dedicated #dropzone
if (fullscreenDropzone) {
    fullscreenDropzone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        // Add a visual indicator for the drop zone (e.g., a border or overlay)
        fullscreenDropzone.classList.add('drag-active');
    });

    fullscreenDropzone.addEventListener('dragover', (e) => {
        e.preventDefault(); // Crucial: prevents browser's default behavior
    });

    fullscreenDropzone.addEventListener('dragleave', (e) => {
        // Check if the drag is truly leaving the dropzone, not just moving over a child element
        if (!e.relatedTarget || !fullscreenDropzone.contains(e.relatedTarget)) {
             fullscreenDropzone.classList.remove('drag-active');
        }
    });

    fullscreenDropzone.addEventListener('drop', (e) => {
        e.preventDefault(); // Crucial: prevents browser from opening the file
        fullscreenDropzone.classList.remove('drag-active');
        const file = e.dataTransfer.files[0];
        if (file) {
            uploadSelectedFile(file); // Call the new common function here
        }
    });
}
// --- END Drag AND Drop Zone logic ---
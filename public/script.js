console.log("✅ M∆THM∆TIΧ Initialized");

const chatBox = document.getElementById("chat-box");
const input = document.getElementById("user-input");
const sendBtn = document.getElementById("send-button");
const micBtn = document.getElementById("mic-button");
const attachBtn = document.getElementById("attach-button");
const equationBtn = document.getElementById("equation-button");
const fileInput = document.getElementById("file-input");
const mathModal = document.getElementById("math-modal");
const insertMathBtn = document.getElementById("insert-math-button");
const closeMathBtn = document.getElementById("close-math-button");
const mathInput = document.getElementById("math-input");

let currentUser = null;

// Load user profile
fetch("/user")
  .then((res) => res.json())
  .then((data) => {
    currentUser = data;
  });

function appendMessage(message, sender = "user") {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${sender === "user" ? "user-bubble" : "ai-bubble"}`;

  // Detect if message contains rendered math (indicated by [MATH]...[/MATH])
  const mathRegex = /\[MATH\](.*?)\[\/MATH\]/;
  const match = message.match(mathRegex);

  if (match) {
    const before = message.split("[MATH]")[0];
    const after = message.split("[/MATH]")[1];
    const math = match[1];

    bubble.innerHTML = `${before}<span class="math-render">\\(${math}\\)</span>${after}`;
    MathJax.typesetPromise([bubble.querySelector(".math-render")]);
  } else {
    bubble.textContent = message;
  }

  chatBox.appendChild(bubble);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Send message to server
sendBtn.addEventListener("click", sendMessage);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

function sendMessage() {
  const message = input.value.trim();
  if (!message) return;

  appendMessage(message, "user");
  input.value = "";

  fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: currentUser, message }),
  })
    .then((res) => res.json())
    .then((data) => appendMessage(data.text, "ai"))
    .catch((err) => {
      console.error("❌ Chat error:", err);
      appendMessage("⚠️ AI error. Please try again.", "ai");
    });
}

// 🎤 Speech-to-text
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

  micBtn.addEventListener("click", () => recognition.start());
}

// 📎 File upload
attachBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);

  appendMessage(`📎 Uploaded: ${file.name}`, "user");

  fetch("/upload", {
    method: "POST",
    body: formData,
  })
    .then((res) => res.json())
    .then((data) => appendMessage(data.text, "ai"))
    .catch((err) => {
      console.error("❌ Upload error:", err);
      appendMessage("⚠️ Upload failed.", "ai");
    });
});

// ➗ Equation button popup
equationBtn.addEventListener("click", () => {
  mathModal.style.display = "block";
  mathInput.value = "";
  mathInput.focus();
});

// 🧮 Insert equation into message
insertMathBtn.addEventListener("click", () => {
  const math = mathInput.value.trim();
  if (math) {
    const wrapped = `[MATH]${math}[/MATH]`;
    input.value += " " + wrapped + " ";
  }
  mathModal.style.display = "none";
  mathInput.value = "";
});

// ❌ Close math editor
closeMathBtn.addEventListener("click", () => {
  mathModal.style.display = "none";
  mathInput.value = "";
});

// 🧼 Close popup if clicked outside
window.addEventListener("click", (e) => {
  if (e.target === mathModal) {
    mathModal.style.display = "none";
    mathInput.value = "";
  }
});

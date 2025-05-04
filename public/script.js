// script.js — M∆THM∆TIΧ AI frontend logic
console.log("✅ M∆THM∆TIΧ Initialized");

const chatContainer = document.getElementById("chat-container-inner");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const micButton = document.getElementById("mic-button");
const uploadButton = document.getElementById("upload-button");
const uploadInput = document.getElementById("file-upload");

// ✅ Add message, render MathJax, and scroll
function addMessageToChat(role, text) {
  const message = document.createElement("div");
  message.classList.add("message", role);
  message.innerHTML = text;
  chatContainer.appendChild(message);

  // Wait for MathJax to render, then scroll
  if (window.MathJax) {
    MathJax.typesetPromise([message]).then(() => {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    });
  } else {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

// ✅ Send message to AI
async function sendMessage() {
  const message = userInput.value.trim();
  if (!message) return;

  addMessageToChat("user", message);
  userInput.value = "";

  const res = await fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });

  const text = await res.text();
  addMessageToChat("ai", text);
}

// ✅ Handle file upload
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  addMessageToChat("user", `📎 Uploaded ${file.name}`);

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("/upload", {
      method: "POST",
      body: formData
    });

    if (!res.ok) {
      addMessageToChat("ai", "⚠️ Upload failed. Please try again.");
      return;
    }

    const aiReply = await res.text();
    addMessageToChat("ai", aiReply);
  } catch (err) {
    console.error("Upload error:", err);
    addMessageToChat("ai", "⚠️ Upload failed. Please try again.");
  }
}

// ✅ Mic / speech-to-text
let recognition;
if ("webkitSpeechRecognition" in window) {
  recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.onresult = function (event) {
    const transcript = event.results[0][0].transcript;
    userInput.value = transcript;
    sendMessage();
  };

  recognition.onerror = function () {
    addMessageToChat("ai", "⚠️ Voice input error.");
  };

  micButton.addEventListener("click", () => recognition.start());
}

// ✅ Trigger file upload via 📎
uploadButton.addEventListener("click", () => {
  uploadInput.click();
});

// ✅ Events
sendButton.addEventListener("click", sendMessage);
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});
uploadInput.addEventListener("change", handleFileUpload);

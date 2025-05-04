// public/script.js — Handles frontend interactivity + chat upload

console.log("✅ M∆THM∆TIΧ Initialized");

const userId = localStorage.getItem("userId");
const chatContainer = document.getElementById("chat-container-inner");
const input = document.getElementById("user-input");
const sendBtn = document.getElementById("send-button");
const uploadBtn = document.getElementById("file-upload");
const fileInput = document.getElementById("file-input");

const appendMessage = (text, sender = "ai") => {
  const message = document.createElement("div");
  message.classList.add("message", sender);
  message.innerText = text;
  chatContainer.appendChild(message);
  chatContainer.scrollTop = chatContainer.scrollHeight;
};

sendBtn.addEventListener("click", () => {
  const msg = input.value.trim();
  if (!msg) return;
  appendMessage(msg, "user");
  input.value = "";

  fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, message: msg }),
  })
    .then((res) => res.json())
    .then((data) => appendMessage(data.text))
    .catch((err) => {
      console.error("Chat error:", err);
      appendMessage("⚠️ Something went wrong.");
    });
});

uploadBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;

  appendMessage(`📎 Uploaded ${file.name}`, "user");

  const formData = new FormData();
  formData.append("file", file);
  formData.append("userId", userId);

  fetch("/upload", {
    method: "POST",
    body: formData,
  })
    .then((res) => res.text())
    .then((text) => appendMessage(text))
    .catch((err) => {
      console.error("Upload error:", err);
      appendMessage("⚠️ Upload failed. Please try again.");
    });
});

// Auto-end session on page unload
window.addEventListener("beforeunload", () => {
  if (!userId) return;
  navigator.sendBeacon("/chat/end-session", JSON.stringify({ userId }));
});

// 🎙️ Microphone + Hands-Free Mode
let recognizing = false;
let recognition;

const micBtn = document.getElementById("mic-button");
let handsFreeEnabled = false;
document.getElementById("handsfree-toggle").addEventListener("click", () => {
  handsFreeEnabled = !handsFreeEnabled;
  document.getElementById("handsfree-label").innerText = handsFreeEnabled
    ? "Hands-Free Mode: ON"
    : "Hands-Free Mode: OFF";
});

if ("webkitSpeechRecognition" in window) {
  recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.onresult = function (event) {
    const transcript = event.results[0][0].transcript;
    input.value = transcript;
    if (handsFreeEnabled) sendBtn.click();
  };

  recognition.onerror = function (event) {
    console.error("Speech recognition error", event);
  };

  micBtn.addEventListener("click", () => {
    if (recognizing) {
      recognition.stop();
      micBtn.classList.remove("active");
    } else {
      recognition.start();
      micBtn.classList.add("active");
    }
    recognizing = !recognizing;
  });
}

// 🧮 Calculator, ✏️ Sketchpad, π Equation Editor popups
document.getElementById("calc-button").addEventListener("click", () => {
  document.getElementById("calculator-popup").style.display = "flex";
});
document.getElementById("draw-button").addEventListener("click", () => {
  document.getElementById("sketchpad-popup").style.display = "flex";
});
document.getElementById("pi-button").addEventListener("click", () => {
  document.getElementById("equation-popup").style.display = "flex";
});

document.querySelectorAll(".close-button").forEach((btn) => {
  btn.addEventListener("click", () => {
    btn.closest(".popup").style.display = "none";
  });
});
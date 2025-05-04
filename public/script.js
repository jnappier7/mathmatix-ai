// script.js — M∆THM∆TIΧ AI frontend logic with visual support
console.log("✅ M∆THM∆TIΧ Initialized");

const chatContainer = document.getElementById("chat-container-inner");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const micButton = document.getElementById("mic-button");
const uploadButton = document.getElementById("upload-button");
const uploadInput = document.getElementById("file-upload");

// ✅ Add message, render MathJax, scroll
function addMessageToChat(role, text) {
  const message = document.createElement("div");
  message.classList.add("message", role);
  message.innerHTML = text;
  chatContainer.appendChild(message);

  if (window.MathJax) {
    MathJax.typesetPromise([message]).then(() => {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    });
  } else {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

// ✅ Show AI-generated image
function addImageToChat(base64, alt = "Generated Image") {
  const message = document.createElement("div");
  message.classList.add("message", "ai");

  const img = document.createElement("img");
  img.src = base64.startsWith("http") ? base64 : `data:image/png;base64,${base64}`;
  img.alt = alt;
  img.style.maxWidth = "100%";
  img.style.borderRadius = "10px";
  img.style.marginTop = "8px";

  message.appendChild(img);
  chatContainer.appendChild(message);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// ✅ Send user message to AI (with smart image detection)
async function sendMessage() {
  const message = userInput.value.trim();
  if (!message) return;

  addMessageToChat("user", message);
  userInput.value = "";

  // 🧠 Send message to Gemini
  const res = await fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });

  const text = await res.text();
  addMessageToChat("ai", text);

  // 🔍 Smart detection of AI visual prompts
  const lower = text.toLowerCase();
  const offersVisual =
    lower.includes("let me show you") ||
    lower.includes("want me to draw") ||
    lower.includes("would you like a diagram") ||
    lower.includes("here’s what that looks like") ||
    lower.includes("let me illustrate");

  if (offersVisual) {
    const imagePrompt = `Create a math visual to support this explanation: "${message}"`;

    const imgRes = await fetch("/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: imagePrompt })
    });

    const { imageUrl } = await imgRes.json();
    if (imageUrl) addImageToChat(imageUrl, "Visual Aid");
  }
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

    const result = await res.json();

    // Text response
    if (result.text) addMessageToChat("ai", result.text);

    // Image response (from Gemini OCR logic)
    if (result.image) {
      const base64 = `data:${result.mimeType};base64,${result.image}`;
      addImageToChat(base64);
    }
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

// ✅ Event listeners
sendButton.addEventListener("click", sendMessage);
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});
uploadInput.addEventListener("change", handleFileUpload);

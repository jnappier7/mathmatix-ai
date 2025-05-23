const chatContainer = document.getElementById("chat-container-inner");
const input = document.getElementById("user-input");
let inputMode = "text";

input.addEventListener("keydown", (e) => {
  const key = e.key;
  const val = input.getValue();

  const mathTriggers = /^[0-9+\-*/=^√().πe]$/;
  const textTriggers = /\b(what|how|and|the|is|solve|please)\b/i;

  if (mathTriggers.test(key)) {
    inputMode = "math";
    input.mathMode = "math"; // 🔥 This is the fix
    input.classList.add("math-mode");
  }

  if (key === " " && textTriggers.test(val.trim().split(" ").pop())) {
    inputMode = "text";
    input.mathMode = "text"; // 🔥 Reset back to normal typing
    input.classList.remove("math-mode");
  }
});

const sendBtn = document.getElementById("send-button");
const micBtn = document.getElementById("mic-button");
const clearBtn = document.getElementById("clear-btn");
const handsFreeBtn = document.getElementById("handsfree-toggle");
const insertEquationBtn = document.getElementById("equation-button");
const fileInput = document.getElementById("file-input");
const fileUploadBtn = document.getElementById("file-upload");

let recognition;
let isRecognizing = false;
let isHandsFreeMode = false;

let userId = localStorage.getItem("userId");
const sendBtnText = sendBtn.innerText;

const toggleThinking = (isThinking) => {
  sendBtn.disabled = isThinking;
  sendBtn.innerText = isThinking ? "Mathmatix is thinking..." : sendBtnText;
};

const appendMessage = (text, sender = "ai") => {
  const message = document.createElement("div");
  message.classList.add("message", sender);

  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const imageRegex = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
  const geoGebraRegex = /^https:\/\/www\.geogebra\.org\/graphing\?equation=/i;

  const segments = text.split(urlRegex);

  segments.forEach((segment) => {
    if (geoGebraRegex.test(segment)) {
      const iframe = document.createElement("iframe");
      iframe.src = segment;
      iframe.width = "100%";
      iframe.height = "400px";
      iframe.style.border = "none";
      iframe.style.margin = "12px 0";
      message.appendChild(iframe);
    } else if (imageRegex.test(segment)) {
      const img = document.createElement("img");
      img.src = segment;
      img.alt = "Visual";
      img.style.maxWidth = "100%";
      img.style.borderRadius = "8px";
      img.style.margin = "10px 0";
      message.appendChild(img);
    } else if (segment.trim() !== "") {
      const p = document.createElement("p");
      p.textContent = segment.trim();
      message.appendChild(p);
    }
  });

  chatContainer.appendChild(message);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  if (window.MathJax) MathJax.typesetPromise([message]);
};

const sendMessage = async () => {
  const message = input.getValue().trim(); // for MathLive compatibility
  if (!message) return;

  appendMessage(message, "user");
  input.setValue("");
  inputMode = "text";
  input.classList.remove("math-mode");
  toggleThinking(true);

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, message }),
    });

    if (!res.ok) throw new Error("Server error: " + res.status);
    const data = await res.json();

    if (data.text) appendMessage(data.text, "ai");
    if (data.image) {
      const imgHtml = `<img src="${data.image}" alt="Math visual" class="chat-image">`;
      appendMessage(imgHtml, "ai");
    }

  } catch (err) {
    appendMessage("⚠️ AI error. Please try again.", "ai");
    console.error("❌ Chat error:", err);
  } finally {
    toggleThinking(false);
  }
};

sendBtn.addEventListener("click", sendMessage);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});

clearBtn?.addEventListener("click", () => {
  chatContainer.innerHTML = "";
});

handsFreeBtn?.addEventListener("click", () => {
  isHandsFreeMode = !isHandsFreeMode;
  const label = document.getElementById("handsfree-label");
  if (label) label.innerText = isHandsFreeMode ? "Hands-Free Mode: ON" : "Hands-Free Mode: OFF";
});

micBtn?.addEventListener("click", () => {
  if (!("webkitSpeechRecognition" in window)) {
    alert("Speech recognition not supported.");
    return;
  }

  if (!recognition) {
    recognition = new webkitSpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      input.value = transcript;
      sendBtn.click();
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event);
      recognition.stop();
      isRecognizing = false;
    };

    recognition.onend = () => {
      isRecognizing = false;
      if (isHandsFreeMode) recognition.start();
    };
  }

  if (isRecognizing) {
    recognition.stop();
    isRecognizing = false;
    micBtn.classList.remove("active");
  } else {
    recognition.start();
    isRecognizing = true;
    micBtn.classList.add("active");
  }
});

insertEquationBtn?.addEventListener("click", () => {
  input.setValue("\\boxed{}");
  input.focus();
});

// 🆕 Upload Handling
fileUploadBtn?.addEventListener("click", () => fileInput.click());

fileInput?.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("name", localStorage.getItem("name") || "N/A");
  formData.append("tone", localStorage.getItem("tone") || "Default");
  formData.append("learningStyle", localStorage.getItem("learningStyle") || "N/A");
  formData.append("interests", localStorage.getItem("interests") || "N/A");

  appendMessage("📎 Uploading your file…", "ai");

  try {
    const res = await fetch("/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (data.extracted) appendMessage(`🧠 I found this on your file:\n\n${data.extracted}`, "ai");
    if (data.text) appendMessage(data.text, "ai");

  } catch (err) {
    console.error("❌ Upload error:", err);
    appendMessage("⚠️ File upload failed. Try again?", "ai");
  } finally {
    fileInput.value = ""; // Reset input
  }
});

// 🆕 Drag-and-Drop Upload Zone + Ghost Overlay
const dropzone = document.getElementById("dropzone");

["dragenter", "dragover"].forEach((event) => {
  window.addEventListener(event, (e) => {
    e.preventDefault();
    dropzone.classList.add("drag-active");
  });
});

["dragleave", "drop"].forEach((event) => {
  window.addEventListener(event, (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-active");
  });
});

window.addEventListener("drop", async (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("name", localStorage.getItem("name") || "N/A");
  formData.append("tone", localStorage.getItem("tone") || "Default");
  formData.append("learningStyle", localStorage.getItem("learningStyle") || "N/A");
  formData.append("interests", localStorage.getItem("interests") || "N/A");

  appendMessage("📎 Uploading your file…", "ai");

  try {
    const res = await fetch("/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (data.extracted) appendMessage(`🧠 I found this on your file:\n\n${data.extracted}`, "ai");
    if (data.text) appendMessage(data.text, "ai");

  } catch (err) {
    console.error("❌ Upload error:", err);
    appendMessage("⚠️ File upload failed. Try again?", "ai");
  }
});

// Welcome message fetch
window.addEventListener("DOMContentLoaded", async () => {
  const userId = localStorage.getItem("userId");
  if (!userId) return;

  try {
    const res = await fetch(`/welcome-message?userId=${userId}`);
    if (!res.ok) throw new Error("Failed to fetch welcome message");
    const data = await res.json();
    if (data.greeting) appendMessage(data.greeting, "ai");
  } catch (err) {
    console.error("⚠️ Welcome message error:", err.message);
  }
});

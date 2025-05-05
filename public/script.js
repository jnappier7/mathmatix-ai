// script.js — Full version with popups draggable, voice input, file upload, equation input, message alignment, animation, and scroll

document.addEventListener("DOMContentLoaded", () => {
  console.log("📡 M∆THM∆TIΧ Initialized");

  const userId = localStorage.getItem("userId");
  const chatContainer = document.getElementById("chat-container-inner");
  const input = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-button");
  const uploadBtn = document.getElementById("file-upload");
  const fileInput = document.getElementById("file-input");
  const micBtn = document.getElementById("mic-button");
  const handsFreeToggle = document.getElementById("handsfree-toggle");
  const handsFreeLabel = document.getElementById("handsfree-label");

  const equationBtn = document.getElementById("pi-button");
  const equationPopup = document.getElementById("equation-popup");
  const insertBtn = document.getElementById("insert-latex");
  const latexInput = document.getElementById("latex-input");

  let thinkingTimeout;
  let recognition;
  let handsFreeEnabled = false;

  const appendMessage = (text, sender = "ai") => {
    const message = document.createElement("div");
    message.classList.add("message", sender);
    message.innerText = text;
    chatContainer.appendChild(message);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    if (window.MathJax) MathJax.typesetPromise([message]);
  };

  const showThinking = () => {
    const thinking = document.createElement("div");
    thinking.classList.add("message", "ai");
    thinking.innerText = "M∆THM∆TIΧ is thinking...";
    thinking.id = "thinking-msg";
    chatContainer.appendChild(thinking);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  };

  const removeThinking = () => {
    const thinking = document.getElementById("thinking-msg");
    if (thinking) thinking.remove();
  };

  const sendMessage = async () => {
    const message = input.value.trim();
    if (!message) return;
    appendMessage(message, "user");
    input.value = "";
    showThinking();

    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, message })
      });
      const data = await res.json();
      removeThinking();
      appendMessage(data.text || "⚠️ No response.");
    } catch (err) {
      removeThinking();
      appendMessage("⚠️ Error: Could not connect to server.");
      console.error("❌ Chat error:", err);
    }
  };

  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  uploadBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    appendMessage(`📎 Uploaded ${file.name}`, "user");
    showThinking();

    try {
      const res = await fetch("/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      removeThinking();
      appendMessage(data.text || "⚠️ No response from upload.");
    } catch (err) {
      removeThinking();
      appendMessage("⚠️ Upload error.");
      console.error("❌ Upload error:", err);
    }
  });

  equationBtn.addEventListener("click", () => equationPopup.style.display = "block");
  insertBtn.addEventListener("click", () => {
    const latex = latexInput.value.trim();
    if (latex) input.value += ` $${latex}$ `;
    equationPopup.style.display = "none";
    latexInput.value = "";
  });

  document.querySelectorAll(".close-button").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.closest(".popup").style.display = "none";
    });
  });

  if ("webkitSpeechRecognition" in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      input.value = transcript;
      if (handsFreeEnabled) sendMessage();
    };

    recognition.onerror = (event) => console.error("🎙️ Speech error:", event);
  }

  micBtn.addEventListener("click", () => {
    if (recognition) recognition.start();
  });

  handsFreeToggle.addEventListener("click", () => {
    handsFreeEnabled = !handsFreeEnabled;
    handsFreeLabel.textContent = `Hands-Free Mode: ${handsFreeEnabled ? "ON" : "OFF"}`;
  });

  // ✅ Make popups draggable
  document.querySelectorAll(".popup").forEach(popup => {
    const header = popup.querySelector(".popup-header");
    let offsetX, offsetY, isDragging = false;

    header.addEventListener("mousedown", (e) => {
      isDragging = true;
      offsetX = e.clientX - popup.offsetLeft;
      offsetY = e.clientY - popup.offsetTop;
      popup.style.position = "absolute";
      popup.style.zIndex = 1000;
    });

    document.addEventListener("mousemove", (e) => {
      if (isDragging) {
        popup.style.left = `${e.clientX - offsetX}px`;
        popup.style.top = `${e.clientY - offsetY}px`;
      }
    });

    document.addEventListener("mouseup", () => isDragging = false);
  });
});

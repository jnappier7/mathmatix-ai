// script.js — Final merged version with logout, session save, math keyboard, uploads, and speech input

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
  const thinkingIndicator = document.getElementById("thinking-indicator");
  const logoutBtn = document.getElementById("logoutBtn");

  let handsFreeEnabled = false;
  let lastMessageAskedForDrawing = false;

  logoutBtn?.addEventListener("click", async () => {
  try {
    if (userId) {
      await fetch("/chat/end-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId })
      });
    }

    await fetch("/logout");
    localStorage.clear();
    window.location.href = "/login.html";
  } catch (err) {
    console.warn("⚠️ Logout failed:", err);
    localStorage.clear();
    window.location.href = "/login.html";
  }
});

  // 📘 Recall last session summary
  (async function fetchPreviousSummary() {
    if (!userId) return;

    try {
      const res = await fetch("/save-summary/recall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId })
      });

      const data = await res.json();
      if (data?.summary) {
        appendMessage(`📘 Welcome back! Last time you worked on:\n\n"${data.summary}"\n\nWant to continue or start something new?`);
      }
    } catch (err) {
      console.warn("⚠️ Could not fetch last session summary:", err);
    }
  })();

  const appendMessage = (text, sender = "ai") => {
    const message = document.createElement("div");
    message.classList.add("message", sender);
    message.innerText = text;
    chatContainer.appendChild(message);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    if (window.MathJax) MathJax.typesetPromise([message]);
  };

  const appendImage = (url, alt = "Visual Example") => {
    const message = document.createElement("div");
    message.classList.add("message", "ai");
    const img = document.createElement("img");
    img.src = url;
    img.alt = alt;
    img.style.maxWidth = "300px";
    img.style.borderRadius = "12px";
    message.appendChild(img);
    chatContainer.appendChild(message);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  };

  const toggleThinking = (show) => {
    thinkingIndicator.style.display = show ? "flex" : "none";
  };

  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  sendBtn.addEventListener("click", async () => {
    const message = input.value.trim();
    if (!message) return;

    appendMessage(message, "user");
    input.value = "";
    toggleThinking(true);

    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, message })
      });

      const data = await res.json();
      toggleThinking(false);
      appendMessage(data.text || "⚠️ No response from tutor.");
    } catch (err) {
      toggleThinking(false);
      console.error("❌ Chat error:", err);
      appendMessage("⚠️ AI error. Please try again.");
    }
  });

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    appendMessage("📎 Uploading file for review...", "user");
    toggleThinking(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("userId", userId);
    formData.append("name", localStorage.getItem("name") || "Unknown");
    formData.append("tone", localStorage.getItem("tonePreference") || "Motivational");
    formData.append("learningStyle", localStorage.getItem("learningStyle") || "Visual");
    formData.append("interests", localStorage.getItem("interests") || "");

    try {
      const res = await fetch("/upload", { method: "POST", body: formData });
      const data = await res.json();
      toggleThinking(false);
      appendMessage(data.text || "⚠️ No response from file.");
    } catch (err) {
      toggleThinking(false);
      console.error("❌ Upload error:", err);
      appendMessage("⚠️ Upload failed. Please try again.");
    }
  });

  uploadBtn.addEventListener("click", () => fileInput.click());

  handsFreeToggle.addEventListener("click", () => {
    handsFreeEnabled = !handsFreeEnabled;
    handsFreeLabel.textContent = `Hands-Free Mode: ${handsFreeEnabled ? "ON" : "OFF"}`;
    handsFreeToggle.classList.toggle("green", handsFreeEnabled);
  });

  document.body.addEventListener("dragover", (e) => {
    e.preventDefault();
    document.getElementById("dropzone").classList.add("dragover");
  });

  document.body.addEventListener("dragleave", () => {
    document.getElementById("dropzone").classList.remove("dragover");
  });

  document.body.addEventListener("drop", async (e) => {
    e.preventDefault();
    document.getElementById("dropzone").classList.remove("dragover");

    const droppedFile = e.dataTransfer.files[0];
    if (!droppedFile) return;

    appendMessage("📎 Uploading file for review...", "user");
    toggleThinking(true);

    const formData = new FormData();
    formData.append("file", droppedFile);
    formData.append("userId", userId);
    formData.append("name", localStorage.getItem("name") || "Unknown");
    formData.append("tone", localStorage.getItem("tonePreference") || "Motivational");
    formData.append("learningStyle", localStorage.getItem("learningStyle") || "Visual");
    formData.append("interests", localStorage.getItem("interests") || "");

    try {
      const res = await fetch("/upload", { method: "POST", body: formData });
      const data = await res.json();
      toggleThinking(false);
      appendMessage(data.text || "⚠️ No response from file.");
    } catch (err) {
      toggleThinking(false);
      console.error("❌ Upload error:", err);
      appendMessage("⚠️ Upload failed. Please try again.");
    }
  });

  // 🔄 Save summary on unload
  window.addEventListener("beforeunload", async () => {
    if (!userId) return;
    try {
      await fetch("/chat/end-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId })
      });
    } catch (err) {
      console.warn("⚠️ Failed to end session on unload:", err);
    }
  });

  // ➕ MathLive Equation Support
  const equationBtn = document.getElementById("equation-button");
  const popup = document.getElementById("equation-popup");
  const mathEditor = document.getElementById("math-editor");
  const latexInsert = document.getElementById("insert-latex");
  const latexCancel = document.getElementById("cancel-latex");
  const latexClose = document.getElementById("close-equation-popup");
  const preview = document.getElementById("equation-preview");

  equationBtn.addEventListener("click", () => {
    popup.style.display = "block";
    mathEditor.focus();
  });

  latexInsert.addEventListener("click", () => {
    const latex = mathEditor.getValue();
    input.value += ` \\(${latex}\\) `;
    popup.style.display = "none";
    mathEditor.setValue("");
    preview.innerHTML = "";
  });

  latexCancel.addEventListener("click", () => {
    popup.style.display = "none";
    mathEditor.setValue("");
    preview.innerHTML = "";
  });

  latexClose.addEventListener("click", () => {
    popup.style.display = "none";
    mathEditor.setValue("");
    preview.innerHTML = "";
  });

  mathEditor.addEventListener("input", () => {
    const latex = mathEditor.getValue();
    preview.innerHTML = `\\[${latex}\\]`;
    if (window.MathJax) MathJax.typesetPromise([preview]);
  });

  // 🎙️ Speech-to-Text Input
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    micBtn.addEventListener("click", () => {
      recognition.start();
      micBtn.classList.add("listening");
    });

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      input.value = transcript;
      micBtn.classList.remove("listening");
    };

    recognition.onerror = (event) => {
      console.error("🎤 Speech recognition error:", event.error);
      micBtn.classList.remove("listening");
    };

    recognition.onend = () => {
      micBtn.classList.remove("listening");
    };
  } else {
    console.warn("🎤 Speech recognition not supported in this browser.");
  }
});

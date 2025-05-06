// script.js — Updated for Mathpix OCR Upload with User Info Injection and Confirmation

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

  let handsFreeEnabled = false;
  let lastMessageAskedForDrawing = false;

  // 📘 Recall and display last session summary
  (async function fetchPreviousSummary() {
    if (!userId) return;

    try {
      const res = await fetch("/save-summary/recall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useId })
      });

      const data = await res.json();
      if (data?.summary) {
        appendMessage(`📘 Welcom back! Last time you worked on:\n\n"${data.summary}"\n\nWant to continue or start something new?`);
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

  // ✅ Enable send on Enter
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

  // Hands-Free Mode Toggle
  handsFreeToggle.addEventListener("click", () => {
    handsFreeEnabled = !handsFreeEnabled;
    handsFreeLabel.textContent = `Hands-Free Mode: ${handsFreeEnabled ? "ON" : "OFF"}`;
    handsFreeToggle.classList.toggle("green", handsFreeEnabled);
  });

  // Drag-and-drop full screen upload
  document.body.addEventListener("dragover", (e) => {
    e.preventDefault();
    document.getElementById("dropzone").classList.add("dragover");
  });

  document.body.addEventListener("dragleave", (e) => {
    document.getElementById("dropzone").classList.remove("dragover");
  });

  document.body.addEventListener("drop", (e) => {
    e.preventDefault();
    document.getElementById("dropzone").classList.remove("dragover");
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      fileInput.files = e.dataTransfer.files;
      fileInput.dispatchEvent(new Event("change"));
    }
  });
});

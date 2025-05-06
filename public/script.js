document.addEventListener("DOMContentLoaded", () => {
  console.log("📡 M∆THM∆TIΧ Initialized");

  const userId = localStorage.getItem("userId");
  const chatContainer = document.getElementById("chat-container-inner");
  const input = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-button");
  const fileInput = document.getElementById("file-input");
  const micBtn = document.getElementById("mic-button");
  const thinking = document.getElementById("thinking-indicator");

  // 💬 Append chat message
  const appendMessage = (text, sender = "ai") => {
    const message = document.createElement("div");
    message.classList.add("message", sender);
    message.innerText = text;
    chatContainer.appendChild(message);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    if (window.MathJax) MathJax.typesetPromise([message]);
  };

  // 📤 Send message
  const sendMessage = async () => {
    const message = input.value.trim();
    if (!message) return;

    appendMessage(message, "user");
    input.value = "";
    thinking.style.display = "flex";

    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, message }),
      });

      const data = await res.json();
      thinking.style.display = "none";

      if (data.text) appendMessage(data.text, "ai");
      else appendMessage("⚠️ No response from AI.", "ai");
    } catch (err) {
      thinking.style.display = "none";
      appendMessage("⚠️ Error talking to the AI.", "ai");
      console.error("❌ Chat error:", err);
    }
  };

  // 🎤 Voice Input
  if ("webkitSpeechRecognition" in window) {
    const recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.lang = "en-US";

    micBtn.addEventListener("click", () => {
      recognition.start();
      micBtn.disabled = true;
    });

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      input.value = transcript;
      sendMessage();
    };

    recognition.onerror = () => {
      micBtn.disabled = false;
    };

    recognition.onend = () => {
      micBtn.disabled = false;
    };
  }

  // 🧠 Enter to send
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener("click", sendMessage);

  // 📎 File Upload
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("userId", userId);

    appendMessage("📎 Uploading file and extracting math...", "user");
    thinking.style.display = "flex";

    try {
      const res = await fetch("/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      thinking.style.display = "none";

      if (data.text) appendMessage(data.text, "ai");
      else appendMessage("⚠️ Could not extract math from file.", "ai");
    } catch (err) {
      thinking.style.display = "none";
      appendMessage("⚠️ Upload failed.", "ai");
      console.error("❌ Upload error:", err);
    }
  });

  // 🟩 Drag-and-Drop Upload
  const dropzone = document.getElementById("dropzone");
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("highlight");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("highlight");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("highlight");

    const file = e.dataTransfer.files[0];
    if (!file) return;

    fileInput.files = e.dataTransfer.files;
    fileInput.dispatchEvent(new Event("change"));
  });

  // 🧮 Insert LaTeX Equation
  const equationBtn = document.getElementById("pi-button");
  const popup = document.getElementById("equation-popup");
  const closeBtn = popup.querySelector(".close-button");

  equationBtn.addEventListener("click", () => {
    popup.style.display = "block";
  });

  closeBtn.addEventListener("click", () => {
    popup.style.display = "none";
  });

  document.getElementById("insert-latex").addEventListener("click", () => {
    const latex = document.getElementById("latex-input").value.trim();
    if (latex) {
      input.value += ` $${latex}$ `;
    }
    popup.style.display = "none";
    input.focus();
  });
});

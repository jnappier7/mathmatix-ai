// script.js — Full functionality bundle with scroll fix, Enter key send, and MathLive keyboard

document.addEventListener("DOMContentLoaded", () => {
  console.log("📡 M∆THM∆TIΧ Initialized");

  const userId = localStorage.getItem("userId");
  const chatContainer = document.getElementById("chat-container-inner");
  const input = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-button");
  const uploadBtn = document.getElementById("file-upload");
  const fileInput = document.getElementById("file-input");
  const micBtn = document.getElementById("mic-button");
  const mathBtn = document.getElementById("pi-button");
  const equationPopup = document.getElementById("equation-popup");
  const closeBtns = document.querySelectorAll(".close-button");
  const insertEquationBtn = document.getElementById("insert-equation");
  const mathField = document.getElementById("math-input");

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

  const sendMessage = () => {
    const message = input.value.trim();
    if (!message) return;
    appendMessage(message, "user");
    input.value = "";

    fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, message }),
    })
      .then((res) => res.json())
      .then((data) => {
        appendMessage(data.text);
      })
      .catch((err) => {
        console.error("❌ Chat error:", err);
        appendMessage("🚨 AI error. Please try again.");
      });
  };

  sendBtn.addEventListener("click", sendMessage);

  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  uploadBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("userId", userId);

    appendMessage("📎 Uploaded " + file.name, "user");

    fetch("/upload", {
      method: "POST",
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => appendMessage(data.text))
      .catch((err) => {
        console.error("❌ Upload error:", err);
        appendMessage("🚨 Upload failed.");
      });
  });

  mathBtn.addEventListener("click", () => {
    equationPopup.style.display = "block";
  });

  insertEquationBtn.addEventListener("click", () => {
    const latex = mathField.getValue();
    if (!latex) return;
    appendMessage("$" + latex + "$", "user");
    equationPopup.style.display = "none";
  });

  closeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".popup").style.display = "none";
    });
  });
});

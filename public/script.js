// script.js — M∆THM∆TIΧ AI frontend logic
console.log("✅ M∆THM∆TIΧ Initialized");

const chatContainer = document.getElementById("chat-container-inner");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-btn");
const uploadInput = document.getElementById("file-upload");

function addMessageToChat(role, text) {
  const message = document.createElement("div");
  message.classList.add("message", role);
  message.innerHTML = text;
  chatContainer.appendChild(message);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// 🔁 Handles normal message sending
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

// ✅ Handles file upload + AI response
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  addMessageToChat("user", `📎 Uploaded ${file.name}`);

  const formData = new FormData();
  formData.append("file", file);

  try {
    // ✅ Fixed route — use /upload (not /api/upload)
    const res = await fetch("/upload", {
      method: "POST",
      body: formData
    });

    if (!res.ok) {
      addMessageToChat("ai", "⚠️ Upload failed. Please try again.");
      return;
    }

    const aiReply = await res.text();
    console.log("📥 AI reply from upload:", aiReply);

    // ✅ Show AI response in chat
    addMessageToChat("ai", aiReply);
  } catch (err) {
    console.error("Upload error:", err);
    addMessageToChat("ai", "⚠️ Upload failed. Please try again.");
  }
}

// 🔁 Event listeners
sendButton.addEventListener("click", sendMessage);
uploadInput.addEventListener("change", handleFileUpload);
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

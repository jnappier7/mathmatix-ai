const userId = localStorage.getItem("userId");

// ELEMENTS
const chat = document.getElementById("chat-container-inner");
const input = document.getElementById("user-input");
const sendBtn = document.getElementById("send-button");
const clearBtn = document.getElementById("clear-btn");
const micBtn = document.getElementById("mic-btn");
const insertEquationBtn = document.getElementById("insert-equation-btn");
const thinkingBadge = document.createElement("div");

// FLOATING "Mathmatix is thinking..." BUBBLE
thinkingBadge.id = "thinking-badge";
thinkingBadge.textContent = "Mathmatix is thinking...";
thinkingBadge.style.display = "none";
thinkingBadge.style.position = "absolute";
thinkingBadge.style.bottom = "64px";
thinkingBadge.style.left = "20px";
thinkingBadge.style.fontSize = "0.85em";
thinkingBadge.style.color = "gray";
document.body.appendChild(thinkingBadge);

// AUTO SCROLL
const scrollChat = () => {
  chat.scrollTop = chat.scrollHeight;
};

// ADD MESSAGE
function appendMessage(text, sender = "user") {
  const bubble = document.createElement("div");
  bubble.classList.add("message", sender);
  bubble.innerHTML = text;
  chat.appendChild(bubble);
  scrollChat();

  // Handle Desmos embed
  if (text.startsWith("desmos://")) {
    const equation = decodeURIComponent(text.replace("desmos://", ""));
    insertDesmosGraph(equation);
  }
}

// SEND MESSAGE
async function sendMessage() {
  const message = input.value.trim();
  if (!message) return;

  appendMessage(message, "user");
  input.value = "";
  showThinking(true);

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, message }),
    });

    if (!res.ok) throw new Error("Server error: " + res.status);

    const data = await res.json();
    if (data.text) appendMessage(data.text, "ai");
    if (data.image?.startsWith("desmos://")) {
      appendMessage(data.image, "ai"); // triggers Desmos insert
    }
  } catch (err) {
    appendMessage("⚠️ Chat error: " + err.message, "ai");
  } finally {
    showThinking(false);
  }
}

// CLEAR CHAT
clearBtn.addEventListener("click", () => {
  chat.innerHTML = "";
  localStorage.removeItem("chatHistory");
});

// THINKING ANIMATION CONTROL
function showThinking(active) {
  thinkingBadge.style.display = active ? "block" : "none";
}

// WELCOME MESSAGE ON LOAD
window.addEventListener("DOMContentLoaded", async () => {
  if (!userId) return;

  try {
    const res = await fetch(`/welcome-message?userId=${userId}`);
    const data = await res.json();
    if (data.greeting) appendMessage(data.greeting, "ai");
  } catch (err) {
    console.warn("⚠️ Welcome message error:", err.message);
  }
});

// SEND HANDLERS
sendBtn.addEventListener("click", sendMessage);
input.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

// SPEECH TO TEXT
if ("webkitSpeechRecognition" in window) {
  const recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  micBtn.addEventListener("click", () => {
    recognition.start();
  });

  recognition.onresult = (event) => {
    input.value = event.results[0][0].transcript;
  };
}

// INSERT EQUATION
insertEquationBtn.addEventListener("click", () => {
  // Remove existing equation fields
  const existingField = document.querySelector("math-field");
  if (existingField) existingField.remove();

  const mathField = document.createElement("math-field");
  mathField.setAttribute("virtual-keyboard-mode", "manual");
  mathField.style.margin = "10px 0";
  mathField.style.border = "1px solid #ccc";
  mathField.style.padding = "6px";
  mathField.style.borderRadius = "5px";

  chat.appendChild(mathField);
  scrollChat();

  mathField.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const latex = mathField.getValue();
      appendMessage(`\\(${latex}\\)`, "user");
      mathField.remove();
      sendMessage();
    }
  });

  mathField.focus();
});

// INSERT DESMOS GRAPH
function insertDesmosGraph(equationLatex) {
  const iframe = document.createElement("iframe");
  iframe.src = `https://www.desmos.com/calculator?embedgraph=true&expression=${encodeURIComponent(
    equationLatex
  )}`;
  iframe.width = "100%";
  iframe.height = "400";
  iframe.style.border = "1px solid #ccc";
  iframe.style.margin = "10px 0";
  chat.appendChild(iframe);
  scrollChat();
}

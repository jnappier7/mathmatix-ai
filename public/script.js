const userId = localStorage.getItem("userId");
const chat = document.getElementById("chat");
const input = document.getElementById("user-input");
const sendBtn = document.getElementById("send-button");
const clearBtn = document.getElementById("clear-btn");
const micBtn = document.getElementById("mic-btn");
const insertEquationBtn = document.getElementById("insert-equation-btn");
const thinking = document.getElementById("thinking");
const mathFieldContainer = document.getElementById("math-field");

// Floating badge toggle
function showThinking(active) {
  thinking.style.display = active ? "block" : "none";
}

function appendMessage(text, sender = "user") {
  const bubble = document.createElement("div");
  bubble.classList.add("message", sender);
  bubble.innerHTML = text;
  chat.appendChild(bubble);
  chat.scrollTop = chat.scrollHeight;

  // Desmos URL triggers iframe
  if (text.startsWith("desmos://")) {
    const equation = decodeURIComponent(text.replace("desmos://", ""));
    insertDesmosGraph(equation);
  }
}

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
    if (data.image?.startsWith("desmos://")) appendMessage(data.image, "ai");
  } catch (err) {
    appendMessage("⚠️ Chat error: " + err.message, "ai");
  } finally {
    showThinking(false);
  }
}

sendBtn.addEventListener("click", sendMessage);
input.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

// Math Equation Insertion
insertEquationBtn.addEventListener("click", () => {
  const existingField = document.querySelector("math-field");
  if (existingField) existingField.remove();

  const mathField = document.createElement("math-field");
  mathField.setAttribute("virtual-keyboard-mode", "manual");
  mathField.style.margin = "8px 0";
  mathField.style.padding = "5px";
  mathField.style.border = "1px solid #ccc";
  mathField.style.borderRadius = "5px";

  mathFieldContainer.innerHTML = "";
  mathFieldContainer.appendChild(mathField);
  mathField.focus();

  mathField.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const latex = mathField.getValue();
      appendMessage(`\\(${latex}\\)`, "user");
      mathFieldContainer.innerHTML = "";
      sendMessage();
    }
  });
});

// Desmos iframe embedding
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
  chat.scrollTop = chat.scrollHeight;
}

// Mic Support (Speech to Text)
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

// Welcome greeting
window.addEventListener("DOMContentLoaded", async () => {
  try {
    const res = await fetch(`/welcome-message?userId=${userId}`);
    const data = await res.json();
    if (data.greeting) appendMessage(data.greeting, "ai");
  } catch (err) {
    console.warn("Welcome error:", err);
  }
});

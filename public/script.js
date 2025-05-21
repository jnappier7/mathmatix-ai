document.addEventListener("DOMContentLoaded", () => {
  const userId = localStorage.getItem("userId");
  const chat = document.getElementById("chat-container-inner");
  const input = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-button");
  const micBtn = document.getElementById("mic-button");
  const insertEquationBtn = document.getElementById("equation-button");
  const thinking = document.getElementById("thinking-indicator");
  const mathFieldContainer = document.getElementById("equation-preview");

  function showThinking(active) {
    if (thinking) thinking.style.display = active ? "block" : "none";
  }

  function appendMessage(text, sender = "user") {
    if (!chat) return;
    const bubble = document.createElement("div");
    bubble.classList.add("message", sender);
    bubble.innerHTML = text;
    chat.appendChild(bubble);
    chat.scrollTop = chat.scrollHeight;

    if (text.startsWith("desmos://")) {
      const equation = decodeURIComponent(text.replace("desmos://", ""));
      insertDesmosGraph(equation);
    }
  }

  async function sendMessage() {
    const message = input?.value.trim();
    if (!message) return;

    appendMessage(message, "user");
    if (input) input.value = "";
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

  if (sendBtn) sendBtn.addEventListener("click", sendMessage);

  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  if (insertEquationBtn) {
    insertEquationBtn.addEventListener("click", () => {
      const existingField = document.querySelector("math-field");
      if (existingField) existingField.remove();

      const mathField = document.createElement("math-field");
      mathField.setAttribute("virtual-keyboard-mode", "manual");
      mathField.style.margin = "8px 0";
      mathField.style.padding = "5px";
      mathField.style.border = "1px solid #ccc";
      mathField.style.borderRadius = "5px";

      if (mathFieldContainer) {
        mathFieldContainer.innerHTML = "";
        mathFieldContainer.appendChild(mathField);
      }

      mathField.focus();

      mathField.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          const latex = mathField.getValue();
          appendMessage(`\\(${latex}\\)`, "user");
          if (mathFieldContainer) mathFieldContainer.innerHTML = "";
          sendMessage();
        }
      });
    });
  }

  function insertDesmosGraph(equationLatex) {
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.desmos.com/calculator?embedgraph=true&expression=${encodeURIComponent(
      equationLatex
    )}`;
    iframe.width = "100%";
    iframe.height = "400";
    iframe.style.border = "1px solid #ccc";
    iframe.style.margin = "10px 0";
    if (chat) {
      chat.appendChild(iframe);
      chat.scrollTop = chat.scrollHeight;
    }
  }

  if ("webkitSpeechRecognition" in window && micBtn) {
    const recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    micBtn.addEventListener("click", () => recognition.start());
    recognition.onresult = (event) => {
      if (input) input.value = event.results[0][0].transcript;
    };
  }

  // Personalized welcome message
  (async () => {
    try {
      const res = await fetch(`/welcome-message?userId=${userId}`);
      const data = await res.json();
      if (data.greeting) appendMessage(data.greeting, "ai");
    } catch (err) {
      console.warn("Welcome error:", err);
    }
  })();
});

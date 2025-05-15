const chatContainer = document.getElementById("chat-container-inner");
const input = document.getElementById("user-input");
const sendBtn = document.getElementById("send-button");
const micBtn = document.getElementById("mic-button");
const clearBtn = document.getElementById("clear-btn");
const handsFreeBtn = document.getElementById("handsfree-toggle");
const insertEquationBtn = document.getElementById("equation-button");

let recognition;
let isRecognizing = false;
let isHandsFreeMode = false;

let userId;
const storedUserId = localStorage.getItem("userId");
if (storedUserId) {
  userId = storedUserId;
}

const sendBtnText = sendBtn.innerText;

const toggleThinking = (isThinking) => {
  sendBtn.disabled = isThinking;
  sendBtn.innerText = isThinking ? "..." : sendBtnText;
};

const appendMessage = (text, sender = "ai") => {
  const message = document.createElement("div");
  message.classList.add("message", sender);

  const urlRegex = /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|svg))/i;
  const match = text.match(urlRegex);

  if (match) {
    const [before, after] = text.split(match[0]);
    const img = document.createElement("img");
    img.src = match[0];
    img.alt = "Visual example";
    img.style.maxWidth = "300px";
    img.style.borderRadius = "12px";
    img.style.margin = "10px 0";

    message.innerHTML = `<p>${before.trim()}</p>`;
    message.appendChild(img);

    if (after && after.trim()) {
      const afterText = document.createElement("p");
      afterText.innerText = after.trim();
      message.appendChild(afterText);
    }
  } else {
    message.innerText = text;
  }

  chatContainer.appendChild(message);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  if (window.MathJax) MathJax.typesetPromise([message]);
};

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
      body: JSON.stringify({ userId, message }),
    });

    if (!res.ok) throw new Error("Server error: " + res.status);

    const data = await res.json();
    toggleThinking(false);
    appendMessage(data.text || "⚠️ No response from tutor.");
  } catch (err) {
    toggleThinking(false);
    console.error("❌ Chat error:", err);
    appendMessage("⚠️ AI error. Please try again.");
  }
}); // ✅ properly closed async click handler

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
  const inputArea = document.getElementById("user-input");
  const mathField = document.createElement("math-field");
  mathField.setAttribute("virtual-keyboard-mode", "onfocus");
  mathField.style.fontSize = "18px";
  mathField.style.marginBottom = "10px";
  inputArea.parentNode.insertBefore(mathField, inputArea);
  mathField.focus();

  mathField.addEventListener("change", () => {
    inputArea.value = mathField.value;
  });
});

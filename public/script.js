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

let userId = localStorage.getItem("userId");
const sendBtnText = sendBtn.innerText;

const toggleThinking = (isThinking) => {
  sendBtn.disabled = isThinking;
  sendBtn.innerText = isThinking ? "Mathmatix is thinking..." : sendBtnText;
};

const appendMessage = (text, sender = "ai") => {
  const message = document.createElement("div");
  message.classList.add("message", sender);

  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const imageRegex = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
  const geoGebraRegex = /^https:\/\/www\.geogebra\.org\/graphing\?equation=/i;

  const segments = text.split(urlRegex);

  segments.forEach((segment) => {
    if (geoGebraRegex.test(segment)) {
      const iframe = document.createElement("iframe");
      iframe.src = segment;
      iframe.width = "100%";
      iframe.height = "400px";
      iframe.style.border = "none";
      iframe.style.margin = "12px 0";
      message.appendChild(iframe);
    } else if (imageRegex.test(segment)) {
      const img = document.createElement("img");
      img.src = segment;
      img.alt = "Visual";
      img.style.maxWidth = "100%";
      img.style.borderRadius = "8px";
      img.style.margin = "10px 0";
      message.appendChild(img);
    } else if (segment.trim() !== "") {
      const p = document.createElement("p");
      p.textContent = segment.trim();
      message.appendChild(p);
    }
  });

  chatContainer.appendChild(message);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  if (window.MathJax) MathJax.typesetPromise([message]);
};

const sendMessage = async () => {
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

    if (data.text) appendMessage(data.text, "ai");
    if (data.image) {
  const imgHtml = `<img src="${data.image}" alt="Math visual" class="chat-image">`;
  appendMessage(imgHtml, "ai");
}

  } catch (err) {
    appendMessage("⚠️ AI error. Please try again.", "ai");
    console.error("❌ Chat error:", err);
  } finally {
    toggleThinking(false);
  }
};

sendBtn.addEventListener("click", sendMessage);

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

window.addEventListener("DOMContentLoaded", async () => {
  const userId = localStorage.getItem("userId");
  if (!userId) return;

  try {
    const res = await fetch(`/welcome-message?userId=${userId}`);
    if (!res.ok) throw new Error("Failed to fetch welcome message");
    const data = await res.json();
    if (data.greeting) appendMessage(data.greeting, "ai");
  } catch (err) {
    console.error("⚠️ Welcome message error:", err.message);
  }
});

});

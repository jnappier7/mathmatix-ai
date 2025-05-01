document.addEventListener("DOMContentLoaded", () => {
  (async function initialize() {
    const user = JSON.parse(localStorage.getItem("mathmatixUser"));
    const chatContainer = document.getElementById("chat-container-inner");
    const userInput = document.getElementById("user-input");
    const sendButton = document.getElementById("send-button");
    const uploadButton = document.getElementById("upload-button");
	// 🎤 VOICE INPUT SETUP
const micButton = document.getElementById("mic-button");
let recognition;

if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;

  micButton.addEventListener("click", () => {
    recognition.start();
    micButton.innerText = "🎙️";
  });

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    userInput.value = transcript;

const handsFree = document.getElementById("handsfree-toggle");
if (handsFree?.checked) {
  sendMessage();
}

    micButton.innerText = "🎤";
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    micButton.innerText = "🎤";
  };

  recognition.onend = () => {
    micButton.innerText = "🎤";
  };
} else {
  console.warn("Speech recognition not supported in this browser.");
  if (micButton) {
    micButton.disabled = true;
    micButton.title = "Speech recognition not supported";
  }
}
    let chatHistory = [];

    if (user?._id) {
      try {
        const res = await fetch(`/memory/load-memory/${user._id}`);
        const data = await res.json();
        if (data.memory?.messages?.length > 0) {
          chatHistory = [...data.memory.messages];
          chatContainer.appendChild(createMessageBubble("🧠 Loaded your last tutoring session. Let’s pick up where we left off!", "ai"));
          console.log("🧠 MEMORY LOADED:", data.memory);
        }
      } catch (err) {
        console.warn("⚠️ Failed to load memory:", err);
      }
    }

    window.chatHistory = chatHistory;

    function autoWrapMath(message) {
      const mathPattern = /^[\d\s+\-*/=^()xXyY]+$/;
      return mathPattern.test(message.trim()) ? `\\(${message.trim()}\\)` : message;
    }

    function createMessageBubble(message, sender = "user", isImage = false) {
      const bubble = document.createElement("div");
      bubble.classList.add("message", sender);
      bubble.style.alignSelf = sender === "user" ? "flex-end" : "flex-start";

      if (isImage) {
        const img = document.createElement("img");
        img.src = message;
        img.style.maxWidth = "100%";
        img.style.borderRadius = "8px";
        bubble.appendChild(img);
      } else if (message.includes("\\(") || message.includes("\\[")) {
        bubble.innerHTML = `<div class="math-line">${message}</div>`;
        bubble.classList.add("math-message");
      } else {
        bubble.innerText = message;
      }

      return bubble;
    }

    async function sendMessage() {
      const message = userInput.value.trim();
      if (!message) return;

      chatContainer.appendChild(createMessageBubble(message, "user"));
      window.chatHistory.push({ role: "user", content: message });
      chatContainer.scrollTop = chatContainer.scrollHeight;
      userInput.value = "";

      const thinkingBubble = createMessageBubble("M∆THM∆TIΧ AI is thinking...", "ai");
      chatContainer.appendChild(thinkingBubble);

      try {
        const response = await fetch("/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, chatHistory: window.chatHistory })
        });

        const text = await response.text();
        chatContainer.removeChild(thinkingBubble);

        const aiMessage = text
          ? autoWrapMath(text)
          : "⚠️ AI didn't return a response. Try again.";
        chatContainer.appendChild(createMessageBubble(aiMessage, "ai"));
        window.chatHistory.push({ role: "model", content: text || "" });
        chatContainer.scrollTop = chatContainer.scrollHeight;

        if (window.MathJax) MathJax.typesetPromise();
      } catch (error) {
        console.error("Error sending message:", error);
        chatContainer.removeChild(thinkingBubble);
        chatContainer.appendChild(createMessageBubble("⚠️ Error sending your message. Try again later.", "ai"));
      }
    }

    sendButton.addEventListener("click", sendMessage);
    userInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendMessage();
      }
    });

    uploadButton.addEventListener("click", () => {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".png,.jpg,.jpeg,.pdf";
      fileInput.onchange = (e) => {
        if (e.target.files[0]) handleFileUpload(e.target.files[0]);
      };
      fileInput.click();
    });

    // 🔧 Button rebinds (match IDs from chat.html)
    const equationButton = document.getElementById("equation-button");
const calculatorButton = document.getElementById("calculator-button");
const scratchpadButton = document.getElementById("scratchpad-button");
const calculatorPopup = document.getElementById("calculator-popup");
const sketchpadPopup = document.getElementById("sketchpad-popup");

// ➕ Equation button (if using keyboard show)
if (equationButton) {
  equationButton.addEventListener("click", () => {
    if (window.mathVirtualKeyboard) {
      window.mathVirtualKeyboard.show();
    }
  });
}

// 🧮 Calculator toggle
if (calculatorButton && calculatorPopup) {
  calculatorButton.addEventListener("click", () => {
    const visibleCalc = window.getComputedStyle(calculatorPopup).display === "block";
    calculatorPopup.style.display = visibleCalc ? "none" : "block";
  });
}

// ✏️ Scratchpad toggle
if (scratchpadButton && sketchpadPopup) {
  scratchpadButton.addEventListener("click", () => {
    const visibleSketch = window.getComputedStyle(sketchpadPopup).display === "block";
    sketchpadPopup.style.display = visibleSketch ? "none" : "block";
  });
}

    // ✏️ Fix scratchpad alignment
    const canvas = document.getElementById(""sketch-canvas"");
    const ctx = canvas?.getContext("2d");
    let isDrawing = false;

    if (canvas && ctx) {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;

      canvas.addEventListener("mousedown", (e) => {
        const rect = canvas.getBoundingClientRect();
        ctx.beginPath();
        ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
        isDrawing = true;
      });

      canvas.addEventListener("mousemove", (e) => {
        if (isDrawing) {
          const rect = canvas.getBoundingClientRect();
          ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
          ctx.stroke();
        }
      });

      canvas.addEventListener("mouseup", () => {
        isDrawing = false;
      });

      canvas.addEventListener("mouseleave", () => {
        isDrawing = false;
      });
    }

    if (user) {
      const bubble = document.createElement("div");
      bubble.classList.add("message", "ai");

      const name = user.name || "friend";
      const learner = user.learningStyle?.toLowerCase();
      const tone = user.tonePreference?.toLowerCase();

      let intro = `Hey ${name}! 👋`;
      let learnerLine = learner
        ? `Let’s make math make sense, ${learner === 'kinesthetic' ? 'hands-on' : 'your way'}.`
        : `Let’s dive in.`;

      let toneLine = "";
      if (tone === "chill") toneLine = "No pressure. Just good vibes. 😎";
      else if (tone === "motivational") toneLine = "We’re gonna crush this. Let’s gooo! 💪";
      else if (tone === "serious") toneLine = "Locked in. Let’s get right to it. 🎯";

      bubble.innerText = `${intro}\n\n${learnerLine}\n${toneLine}`;
      chatContainer.appendChild(bubble);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  })();
});

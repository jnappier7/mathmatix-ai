document.addEventListener("DOMContentLoaded", () => {
  (async function initialize() {
    const user = JSON.parse(localStorage.getItem("mathmatixUser"));
    const chatContainer = document.getElementById("chat-container-inner");
    const userInput = document.getElementById("user-input");
    const sendButton = document.getElementById("send-button");
    const uploadButton = document.getElementById("upload-button");
    let chatHistory = [];

    // 🧠 Load memory if user is logged in
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

    const mathButton = document.getElementById("math-button");
    if (mathButton) {
      mathButton.addEventListener("click", () => {
        if (window.mathVirtualKeyboard) {
          window.mathVirtualKeyboard.show();
        }
      });
    }

    const scratchButton = document.getElementById("scratch-button");
    const scratchPad = document.getElementById("scratchpad");
    if (scratchButton && scratchPad) {
      scratchButton.addEventListener("click", () => {
        scratchPad.style.display = scratchPad.style.display === "block" ? "none" : "block";
      });
    }

    const calcButton = document.getElementById("calc-button");
    const calc = document.getElementById("calculator");
    if (calcButton && calc) {
      calcButton.addEventListener("click", () => {
        calc.style.display = calc.style.display === "block" ? "none" : "block";
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

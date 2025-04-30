document.addEventListener("DOMContentLoaded", function () {
  const user = JSON.parse(localStorage.getItem("mathmatixUser"));
  const chatContainer = document.getElementById("chat-container-inner");
  const userInput = document.getElementById("user-input");
  const sendButton = document.getElementById("send-button");
  const uploadButton = document.getElementById("upload-button");
  let chatHistory = [];

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
    chatHistory.push({ role: "user", content: message });
    chatContainer.scrollTop = chatContainer.scrollHeight;
    userInput.value = "";

    const thinkingBubble = createMessageBubble("Mathmatix AI is thinking...", "ai");
    chatContainer.appendChild(thinkingBubble);

    try {
      const response = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatHistory, message })
      });

      const data = await response.json();
      chatContainer.removeChild(thinkingBubble);

      const aiMessage = data.response
        ? autoWrapMath(data.response)
        : "⚠️ AI didn't return a response. Try again.";
      chatContainer.appendChild(createMessageBubble(aiMessage, "ai"));
      chatHistory.push({ role: "model", content: data.response || "" });
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

  async function handleFileUpload(file) {
    const formData = new FormData();
    formData.append('file', file);

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = function (e) {
        chatContainer.appendChild(createMessageBubble(e.target.result, "user", true));
        chatContainer.scrollTop = chatContainer.scrollHeight;
      };
      reader.readAsDataURL(file);
    } else {
      chatContainer.appendChild(createMessageBubble(`📄 Uploaded file: ${file.name}`, "user"));
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    const thinkingBubble = createMessageBubble("Extracting text and analyzing...", "ai");
    chatContainer.appendChild(thinkingBubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    try {
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const uploadData = await uploadRes.json();

      const aiRes = await fetch('/api/ask-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: uploadData.text })
      });

      const aiData = await aiRes.json();
      chatContainer.removeChild(thinkingBubble);

      const aiMessage = aiData.response
        ? autoWrapMath(aiData.response)
        : "⚠️ AI didn't return a response. Try again.";
      chatContainer.appendChild(createMessageBubble(aiMessage, "ai"));
      chatContainer.scrollTop = chatContainer.scrollHeight;

      if (window.MathJax) MathJax.typesetPromise();
    } catch (err) {
      console.error("Upload or AI error:", err);
      chatContainer.removeChild(thinkingBubble);
      chatContainer.appendChild(createMessageBubble("⚠️ Something went wrong processing that file.", "ai"));
    }
  }

  // Show intro message if user exists
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
});

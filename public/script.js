document.addEventListener("DOMContentLoaded", function () {

const chatContainer = document.getElementById("chat-container-inner");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");

let chatHistory = [];

function autoWrapMath(message) {
  const mathTriggerPattern = /^[\d\s\+\-\*\/\=\^\(\)xXyYzZaAbBcCdDeEfFgGhHiIjJkKlLmMnNoOpPqQrRsStTuUvVwWxXyYzZ]+$/;
  if (mathTriggerPattern.test(message.trim())) {
    return `\\(${message.trim()}\\)`;
  } else {
    return message;
  }
}

function createMessageBubble(message, sender = "user", isImage = false) {
  const bubble = document.createElement("div");
  bubble.classList.add("message", sender);

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
  if (message === "") return;

  chatContainer.appendChild(createMessageBubble(message, "user"));
  chatHistory.push({ role: "user", content: message });
  chatContainer.scrollTop = chatContainer.scrollHeight;
  userInput.value = "";

  const typingBubble = createMessageBubble("Mathmatix AI is thinking...", "ai");
  chatContainer.appendChild(typingBubble);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  try {
    const response = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatHistory, message })
    });

    const data = await response.json();
    chatContainer.removeChild(typingBubble);

    if (data.response) {
      const aiMessage = autoWrapMath(data.response);
      chatContainer.appendChild(createMessageBubble(aiMessage, "ai"));
      chatHistory.push({ role: "model", content: data.response });
      chatContainer.scrollTop = chatContainer.scrollHeight;

      if (window.MathJax) {
        MathJax.typesetPromise();
      }
    }

    if (data.images && Array.isArray(data.images)) {
      data.images.forEach(imgSrc => {
        chatContainer.appendChild(createMessageBubble(imgSrc, "ai", true));
        chatContainer.scrollTop = chatContainer.scrollHeight;
      });
    }

  } catch (error) {
    console.error("Error sending message:", error);
    chatContainer.removeChild(typingBubble);
  }
}

sendButton.addEventListener("click", sendMessage);
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendMessage();
  }
});

// Drag and drop, Insert Equation, Toolbar Popups all remain the same as before.

}); // End DOMContentLoaded

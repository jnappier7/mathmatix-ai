// script.js

const chatContainer = document.getElementById("chat-container");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");

// Auto-wrap math-looking expressions
function autoWrapMath(message) {
  const mathPattern = /([^\n]*[=+\-^][^\n]*)/g; // Roughly match lines containing math
  return message.replace(mathPattern, (match) => {
    if (match.length > 150) return match; // Don't accidentally wrap full paragraphs
    return `\\(${match.trim()}\\)`;
  });
}

// Create chat bubble
function createMessageBubble(message, sender = "user") {
  const bubble = document.createElement("div");
  bubble.classList.add("message", sender);
  bubble.innerHTML = message;
  return bubble;
}

// Send user message and receive AI response
async function sendMessage() {
  const message = userInput.value.trim();
  if (message === "") return;

  // Display user message
  chatContainer.appendChild(createMessageBubble(message, "user"));
  chatContainer.scrollTop = chatContainer.scrollHeight;
  userInput.value = "";

  try {
    const response = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstructions: "",
        chatHistory: [],
        message: message
      })
    });

    const data = await response.json();
    if (data.response) {
      const aiMessage = autoWrapMath(data.response);
      chatContainer.appendChild(createMessageBubble(aiMessage, "ai"));
      chatContainer.scrollTop = chatContainer.scrollHeight;

      // Re-render LaTeX math
      if (window.MathJax) {
        MathJax.typesetPromise();
      }
    } else {
      console.error("Empty response from AI");
    }
  } catch (error) {
    console.error("Error sending message:", error);
  }
}

// Send on button click
sendButton.addEventListener("click", sendMessage);

// Send on Enter key
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendMessage();
  }
});

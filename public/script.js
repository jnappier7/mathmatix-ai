// script.js FINAL with Correct Chat Format + Typing Animation

const chatContainer = document.getElementById("chat-container-inner");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");

let chatHistory = []; // NEW: Store conversation history

// Auto-wrap math expressions
function autoWrapMath(message) {
  const mathPattern = /([^\n]*[=+\-^][^\n]*)/g;
  return message.replace(mathPattern, (match) => {
    if (match.length > 150) return match;
    return `\\(${match.trim()}\\)`;
  });
}

// Create a message bubble
function createMessageBubble(message, sender = "user") {
  const bubble = document.createElement("div");
  bubble.classList.add("message", sender);
  bubble.innerHTML = message;
  return bubble;
}

// Send message function
async function sendMessage() {
  const message = userInput.value.trim();
  if (message === "") return;

  chatContainer.appendChild(createMessageBubble(message, "user"));
  chatHistory.push({ role: "user", content: message }); // Store user message
  chatContainer.scrollTop = chatContainer.scrollHeight;
  userInput.value = "";

  // Typing bubble
  const typingBubble = createMessageBubble("Mathmatix AI is thinking...", "ai");
  typingBubble.classList.add("typing");
  chatContainer.appendChild(typingBubble);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  try {
    const response = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatHistory: chatHistory,
        message: message
      })
    });

    const data = await response.json();
    chatContainer.removeChild(typingBubble); // Remove typing bubble

    if (data.response) {
      const aiMessage = autoWrapMath(data.response);
      chatContainer.appendChild(createMessageBubble(aiMessage, "ai"));
      chatHistory.push({ role: "model", content: data.response }); // Store AI reply
      chatContainer.scrollTop = chatContainer.scrollHeight;

      if (window.MathJax) {
        MathJax.typesetPromise();
      }
    } else {
      console.error("Empty response from AI");
    }
  } catch (error) {
    console.error("Error sending message:", error);
    chatContainer.removeChild(typingBubble);
  }
}

// Event listeners
sendButton.addEventListener("click", sendMessage);
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendMessage();
  }
});

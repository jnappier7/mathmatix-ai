// script.js FINAL FIXED with Typing Animation + Correct Message Sending

const chatContainer = document.getElementById("chat-container-inner");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");

// Auto-wrap math expressions (fixed regex)
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
  chatContainer.scrollTop = chatContainer.scrollHeight;
  userInput.value = "";

  // Add Typing Indicator
  const typingBubble = createMessageBubble("Mathmatix AI is thinking...", "ai");
  typingBubble.classList.add("typing");
  chatContainer.appendChild(typingBubble);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  try {
    const response = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "user", content: message }
        ]
      })
    });

    const data = await response.json();
    chatContainer.removeChild(typingBubble); // Remove Typing Indicator

    if (data.response) {
      const aiMessage = autoWrapMath(data.response);
      chatContainer.appendChild(createMessageBubble(aiMessage, "ai"));
      chatContainer.scrollTop = chatContainer.scrollHeight;

      if (window.MathJax) {
        MathJax.typesetPromise();
      }
    } else {
      console.error("Empty response from AI");
    }
  } catch (error) {
    console.error("Error sending message:", error);
    chatContainer.removeChild(typingBubble); // Remove Typing Indicator on error
  }
}

// Event listeners for send
sendButton.addEventListener("click", sendMessage);
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendMessage();
  }
});

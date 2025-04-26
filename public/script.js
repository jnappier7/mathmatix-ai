let systemInstructions = "You are M∆THM∆TIΧ AI — a real math coach. Focus on unlocking patterns, coaching one step at a time, and NEVER giving full answers directly.";

const chatContainer = document.getElementById("chat-container-inner");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const debugToggle = document.getElementById("debug-toggle");
const debugPanel = document.getElementById("debug-panel");
const updateInstructionsBtn = document.getElementById("update-instructions");
const instructionsTextArea = document.getElementById("system-instructions-text");

// Auto-wrap math
function autoWrapMath(message) {
  const mathPattern = /([^\n]*[=+\-^][^\n]*)/g;
  return message.replace(mathPattern, (match) => {
    if (match.length > 150) return match;
    return `\\(${match.trim()}\\)`;
  });
}

// Message bubble
function createMessageBubble(message, sender = "user") {
  const bubble = document.createElement("div");
  bubble.classList.add("message", sender);
  bubble.innerHTML = message;
  return bubble;
}

// Send message
async function sendMessage() {
  const message = userInput.value.trim();
  if (message === "") return;

  chatContainer.appendChild(createMessageBubble(message, "user"));
  chatContainer.scrollTop = chatContainer.scrollHeight;
  userInput.value = "";

  try {
    const response = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstructions: systemInstructions,
        chatHistory: [],
        message: message
      })
    });

    const data = await response.json();
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
  }
}

// Toggle debug panel
debugToggle.addEventListener("click", () => {
  debugPanel.style.display = debugPanel.style.display === "block" ? "none" : "block";
  instructionsTextArea.value = systemInstructions;
});

// Update system instructions
updateInstructionsBtn.addEventListener("click", () => {
  systemInstructions = instructionsTextArea.value.trim();
  debugPanel.style.display = "none";
});

// Event listeners
sendButton.addEventListener("click", sendMessage);
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendMessage();
  }
});

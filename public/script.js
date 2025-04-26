let systemInstructions = "You are M∆THM∆TIΧ AI — a real math coach. Focus on unlocking patterns, coaching one step at a time, and NEVER giving full answers directly.";

const chatContainer = document.getElementById("chat-container-inner");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");

// Tool Buttons
const insertEquationBtn = document.getElementById("insert-equation-btn");
const calculatorBtn = document.getElementById("calculator-btn");
const scratchpadBtn = document.getElementById("scratchpad-btn");
const uploadBtn = document.getElementById("upload-btn");

// Floating Panels
const insertEquationPanel = document.getElementById("insert-equation-panel");
const calculatorPanel = document.getElementById("calculator-panel");
const scratchpadPanel = document.getElementById("scratchpad-panel");
const uploadPanel = document.getElementById("upload-panel");

const allPanels = [insertEquationPanel, calculatorPanel, scratchpadPanel, uploadPanel];

// Auto-wrap math
function autoWrapMath(message) {
  const mathPattern = /([^\n]*[=+\-^][^\n]*)/g;
  return message.replace(mathPattern, (match) => {
    if (match.length > 150) return match;
    return `\\(${match.trim()}\\)`;
  });
}

// Message Bubble
function createMessageBubble(message, sender = "user") {
  const bubble = document.createElement("div");
  bubble.classList.add("message", sender);
  bubble.innerHTML = message;
  return bubble;
}

// Send Message
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

// Toggle Panels
function togglePanel(panel) {
  allPanels.forEach(p => {
    if (p !== panel) p.style.display = "none";
  });

  if (panel.style.display === "block") {
    panel.style.display = "none";
  } else {
    panel.style.display = "block";
  }
}

// Event Listeners
sendButton.addEventListener("click", sendMessage);
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendMessage();
  }
});

// Tool Button Events
insertEquationBtn.addEventListener("click", () => togglePanel(insertEquationPanel));
calculatorBtn.addEventListener("click", () => togglePanel(calculatorPanel));
scratchpadBtn.addEventListener("click", () => togglePanel(scratchpadPanel));
uploadBtn.addEventListener("click", () => togglePanel(uploadPanel));

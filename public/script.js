// script.js — UPGRADED FINAL VERSION for M∆THM∆TIΧ AI (with MathLive)

// --- Basic Chat Setup ---

const chatContainer = document.getElementById("chat-container-inner");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");

let chatHistory = []; // Store conversation history

// Auto-wrap math expressions for display
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

  // Check if message contains LaTeX delimiters
  if (message.includes("\\(") || message.includes("\\[")) {
    bubble.classList.add("math-message");
  }

  bubble.innerHTML = message;
  return bubble;
}

// Send message function
async function sendMessage() {
  const message = userInput.value.trim();
  if (message === "") return;

  chatContainer.appendChild(createMessageBubble(message, "user"));
  chatHistory.push({ role: "user", content: message });
  chatContainer.scrollTop = chatContainer.scrollHeight;
  userInput.value = "";

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

    // If images are returned, display them
    if (data.images && Array.isArray(data.images)) {
      data.images.forEach(imgSrc => {
        const img = document.createElement("img");
        img.src = imgSrc;
        img.alt = "Generated Image";
        img.classList.add("ai-generated-image");
        chatContainer.appendChild(img);
        chatContainer.scrollTop = chatContainer.scrollHeight;
      });
    }

  } catch (error) {
    console.error("Error sending message:", error);
    chatContainer.removeChild(typingBubble);
  }
}

// --- Event listeners ---

sendButton.addEventListener("click", sendMessage);

userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendMessage();
  }
});

// --- MATHLIVE Floating Insert Equation Box ---

// Create floating MathLive input
const mathFieldContainer = document.createElement('div');
mathFieldContainer.id = 'mathFieldContainer';
mathFieldContainer.style.display = 'none';
mathFieldContainer.style.position = 'fixed';
mathFieldContainer.style.bottom = '80px'; // Float above text input
mathFieldContainer.style.left = '50%';
mathFieldContainer.style.transform = 'translateX(-50%)';
mathFieldContainer.style.background = 'white';
mathFieldContainer.style.border = '2px solid teal';
mathFieldContainer.style.padding = '10px';
mathFieldContainer.style.borderRadius = '12px';
mathFieldContainer.style.boxShadow = '0px 4px 12px rgba(0,0,0,0.2)';
mathFieldContainer.style.zIndex = '9999';

// Create the MathLive field
const mathField = document.createElement('math-field');
mathField.id = 'mathInput';
mathField.style.width = '300px';
mathField.style.fontSize = '22px';
mathField.style.minHeight = '50px';
mathFieldContainer.appendChild(mathField);

// Submit and Cancel buttons
const submitButton = document.createElement('button');
submitButton.innerText = 'Submit';
submitButton.style.marginTop = '8px';
submitButton.onclick = submitEquation;
mathFieldContainer.appendChild(submitButton);

const cancelButton = document.createElement('button');
cancelButton.innerText = 'Cancel';
cancelButton.style.marginTop = '8px';
cancelButton.style.marginLeft = '10px';
cancelButton.onclick = () => {
  mathFieldContainer.style.display = 'none';
};
mathFieldContainer.appendChild(cancelButton);

// Attach the floating box to body
document.body.appendChild(mathFieldContainer);

// Insert Equation Button Handler
const insertEquationBtn = document.getElementById('equation-button');
insertEquationBtn.addEventListener('click', () => {
  mathFieldContainer.style.display = 'block';
  mathField.focus();
});

// Submit Equation Handler
function submitEquation() {
  const latex = mathField.value;
  if (latex.trim() !== '') {
    userInput.value = `\\(${latex}\\)`; // Insert into user input box
    mathField.value = ''; // Clear MathLive field
    mathFieldContainer.style.display = 'none';
    userInput.focus();
  }
}

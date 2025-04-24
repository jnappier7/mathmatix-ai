const chatBox = document.getElementById("chat-box");
const sendBtn = document.getElementById("send-btn");
const textInput = document.getElementById("text-input");

const insertEquationBtn = document.getElementById("insert-equation-btn");
const equationModal = document.getElementById("equation-modal");
const mathEditor = document.getElementById("math-editor");
const insertMathBtn = document.getElementById("insert-math");
const cancelMathBtn = document.getElementById("cancel-math");

function appendMessage(content, sender) {
  const msg = document.createElement("div");
  msg.className = `message ${sender}`;

  // If it's LaTeX, wrap in MathJax syntax
  const isMath = /\\|[\^]|frac|sqrt|int|sum/.test(content.trim());
  const formatted = isMath && !content.includes(" ")
    ? `\\(${content}\\)`
    : content;

  msg.innerHTML = formatted;
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;

  if (window.MathJax) {
    MathJax.typesetPromise([msg]);
  }
}

sendBtn.addEventListener("click", async () => {
  const message = textInput.value.trim();
  if (!message) return;

  appendMessage(message, "user");

  const response = await fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });

  const data = await response.json();
  appendMessage(data.response, "ai");
  textInput.value = "";
});

// Insert Equation toggle
insertEquationBtn.addEventListener("click", () => {
  equationModal.classList.remove("hidden");
  mathEditor.focus();
});

// Insert equation into text area
insertMathBtn.addEventListener("click", () => {
  const latex = mathEditor.getValue();
  textInput.value += ` ${latex} `;
  equationModal.classList.add("hidden");
  mathEditor.setValue("");
});

// Cancel button
cancelMathBtn.addEventListener("click", () => {
  equationModal.classList.add("hidden");
  mathEditor.setValue("");
});

// Enter key to send
document.addEventListener("keydown", function (event) {
  if (event.key === "Enter" && !event.shiftKey && document.activeElement === textInput) {
    event.preventDefault();
    sendBtn.click();
  }
});

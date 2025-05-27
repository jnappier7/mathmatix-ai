const chatLog = document.getElementById("chat-log");
const input = document.getElementById("user-input");
const sendBtn = document.getElementById("send-button");
const micBtn = document.getElementById("mic-button");
const equationPopup = document.getElementById("equation-popup");
const insertEquationBtn = document.getElementById("insert-equation");
const mathEditor = document.getElementById("math-editor");
const insertLatexBtn = document.getElementById("insert-latex");
const cancelLatexBtn = document.getElementById("cancel-latex");
const closeEquationPopup = document.getElementById("close-equation-popup");

let userId = localStorage.getItem("userId");
let synth = window.speechSynthesis;
let thinkingInterval = null;

function appendMessage(text, role) {
  const wrapper = document.createElement("div");
  wrapper.classList.add("message", role);

  const segments = text.split(/\n{2,}/); // Split on double newlines for paragraphs
  segments.forEach(segment => {
    const p = document.createElement("p");

    // Render inline LaTeX segments ONLY (e.g., \(...\)) – rest is plain text
    const inlineMath = /\\\([^\)]+\\\)/g;
    if (inlineMath.test(segment)) {
      const html = segment.replace(inlineMath, (match) => {
        return `<span class="mathjax">${match}</span>`;
      });
      p.innerHTML = html;
    } else {
      p.textContent = segment.trim();
    }

    wrapper.appendChild(p);
  });

  chatLog.appendChild(wrapper);
  chatLog.scrollTop = chatLog.scrollHeight;

  MathJax.typesetPromise([wrapper]); // Only render math parts
}

function toggleThinking(active) {
  if (active) {
    const thinking = document.createElement("div");
    thinking.classList.add("message", "ai", "thinking");
    thinking.textContent = "Thinking...";
    chatLog.appendChild(thinking);
    chatLog.scrollTop = chatLog.scrollHeight;
    thinkingInterval = setInterval(() => {
      if (thinking.textContent.endsWith("...")) {
        thinking.textContent = "Thinking";
      } else {
        thinking.textContent += ".";
      }
    }, 500);
  } else {
    clearInterval(thinkingInterval);
    const thinkingMsg = document.querySelector(".message.thinking");
    if (thinkingMsg) thinkingMsg.remove();
  }
}

async function sendMessage() {
  const message = input.getValue().trim();
  if (!message) return;

  appendMessage(message, "user");
  input.setValue("");
  toggleThinking(true);

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, message }),
    });

    if (!res.ok) throw new Error("Server error: " + res.status);

    const data = await res.json();
    toggleThinking(false);
    appendMessage(data.text || "⚠️ No response from tutor.");
  } catch (err) {
    toggleThinking(false);
    console.error("❌ Chat error:", err);
    appendMessage("⚠️ AI error. Please try again.");
  }
}

sendBtn.addEventListener("click", sendMessage);

input.element.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

insertEquationBtn?.addEventListener("click", () => {
  equationPopup.style.display = "block";
  mathEditor.focus();
});

insertLatexBtn?.addEventListener("click", () => {
  const latex = mathEditor.getValue();
  if (latex) {
    const formatted = `\\(${latex}\\)`;
    const cursorPos = input.selectionStart || input.getValue().length;
    const currentVal = input.getValue();
    const updated = currentVal.slice(0, cursorPos) + formatted + currentVal.slice(cursorPos);
    input.setValue(updated);
  }
  mathEditor.setValue("");
  equationPopup.style.display = "none";
});

cancelLatexBtn?.addEventListener("click", () => {
  mathEditor.setValue("");
  equationPopup.style.display = "none";
});

closeEquationPopup?.addEventListener("click", () => {
  mathEditor.setValue("");
  equationPopup.style.display = "none";
});

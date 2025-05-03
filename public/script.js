/**
 * M∆THM∆TIΧ AI – Main Client Script
 * Version: 5.5
 * Date: 2025-05-03
 * ✅ Popup drag fixed
 * ✅ Mic + hands-free speech-to-text restored
 */

document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ M∆THM∆TIΧ Initialized");

  const userInput = document.getElementById("user-input");
  const sendButton = document.getElementById("send-button");
  const micButton = document.getElementById("mic-button");
  const uploadButton = document.getElementById("upload-button");
  const handsfreeToggle = document.getElementById("handsfree-toggle");
  const chatContainer = document.getElementById("chat-container-inner");
  const userId = localStorage.getItem("userId") || "";
  let chatHistory = [];

  // 🧱 Create message bubble
  function createMessageBubble(message, sender = "ai", isImage = false) {
    const bubble = document.createElement("div");
    bubble.classList.add("message", sender);
    if (isImage) {
      const img = document.createElement("img");
      img.src = message;
      img.alt = "Uploaded Image";
      img.style.maxWidth = "300px";
      img.style.borderRadius = "8px";
      bubble.appendChild(img);
    } else {
      bubble.textContent = message;
    }
    return bubble;
  }

  // 💬 Send message
  async function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;

    const userBubble = createMessageBubble(message, "user");
    chatContainer.appendChild(userBubble);
    chatHistory.push({ role: "user", content: message });
    userInput.value = "";

    const thinkingBubble = createMessageBubble("M∆THM∆TIΧ is thinking...", "ai");
    chatContainer.appendChild(thinkingBubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    try {
      const response = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, chatHistory, userId })
      });

      const result = await response.text();
      thinkingBubble.remove();

      const aiBubble = createMessageBubble(result, "ai");
      chatContainer.appendChild(aiBubble);
      chatHistory.push({ role: "model", content: result });

      if (window.MathJax?.typesetPromise) {
        await MathJax.typesetPromise();
      }

      chatContainer.scrollTop = chatContainer.scrollHeight;
    } catch (err) {
      console.error("Error fetching chat:", err);
      thinkingBubble.remove();
      chatContainer.appendChild(createMessageBubble("⚠️ Something went wrong. Try again.", "ai"));
    }
  }

  // 📎 Upload logic
  uploadButton?.addEventListener("click", () => {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".png,.jpg,.jpeg,.pdf";

    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();

      reader.onload = async () => {
        if (file.type.startsWith("image/")) {
          chatContainer.appendChild(createMessageBubble(reader.result, "user", true));
        } else {
          chatContainer.appendChild(createMessageBubble(`📎 Uploaded PDF: ${file.name}`, "user"));
        }

        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData
        });

        const data = await res.json();

        if (data.text) {
          chatContainer.appendChild(createMessageBubble(`📝 OCR Text:\n${data.text}`, "user"));
          chatHistory.push({ role: "user", content: data.text });
        }

        if (data.feedback) {
          chatContainer.appendChild(createMessageBubble(data.feedback, "ai"));
          chatHistory.push({ role: "model", content: data.feedback });

          if (window.MathJax?.typesetPromise) {
            await MathJax.typesetPromise();
          }
        }
      };

      reader.readAsDataURL(file);
    };

    fileInput.click();
  });

  // π Equation popup
  const equationPopup = document.getElementById("equation-popup");
  const equationBtn = document.getElementById("equation-button");
  const mathInput = document.getElementById("math-input");
  const insertEquationBtn = document.getElementById("insert-equation-btn");
  const closeEquation = document.getElementById("close-equation");

  equationBtn?.addEventListener("click", () => {
    equationPopup.style.display = "flex";
  });

  insertEquationBtn?.addEventListener("click", () => {
    if (mathInput?.value) {
      userInput.value += ` ${mathInput.value} `;
      equationPopup.style.display = "none";
      mathInput.value = "";
    }
  });

  closeEquation?.addEventListener("click", () => {
    equationPopup.style.display = "none";
  });

  // 🧮 Calculator
  const calculatorPopup = document.getElementById("calculator-popup");
  const calculatorBtn = document.getElementById("calculator-button");
  const closeCalculator = document.getElementById("close-calculator");

  calculatorBtn?.addEventListener("click", () => {
    calculatorPopup.style.display = "flex";
  });

  closeCalculator?.addEventListener("click", () => {
    calculatorPopup.style.display = "none";
  });

  // ✏️ Sketchpad
  const scratchpadPopup = document.getElementById("sketchpad-popup");
  const scratchpadBtn = document.getElementById("scratchpad-button");
  const closeScratchpad = document.getElementById("close-scratchpad");

  scratchpadBtn?.addEventListener("click", () => {
    scratchpadPopup.style.display = "flex";
  });

  closeScratchpad?.addEventListener("click", () => {
    scratchpadPopup.style.display = "none";
  });

  // ⏎ Enter to send
  sendButton.addEventListener("click", sendMessage);
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  // 🎙️ Speech-to-Text Mic Support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;

    micButton?.addEventListener("click", () => {
      recognition.start();
      micButton.textContent = "🎙️ Listening...";
    });

    recognition.addEventListener("result", (event) => {
      const transcript = event.results[0][0].transcript;
      userInput.value = transcript;
    });

    recognition.addEventListener("end", () => {
      micButton.textContent = "🎙️";
      if (handsfreeToggle?.checked && userInput.value.trim() !== "") {
        sendMessage();
      }
    });

    recognition.addEventListener("error", (err) => {
      console.error("Speech recognition error:", err);
      micButton.textContent = "🎙️";
    });
  } else {
    console.warn("Speech recognition not supported.");
    micButton?.setAttribute("disabled", true);
    micButton?.setAttribute("title", "Speech-to-text not supported in this browser");
  }

  // 🖱️ Drag popup fix
  document.querySelectorAll(".popup").forEach((popup) => {
    const header = popup.querySelector(".popup-header");
    if (!header) return;

    let offsetX = 0, offsetY = 0, isDragging = false;

    header.style.cursor = "move";
    header.addEventListener("mousedown", (e) => {
      isDragging = true;
      const rect = popup.getBoundingClientRect();

      popup.style.position = "fixed";
      popup.style.left = `${rect.left}px`;
      popup.style.top = `${rect.top}px`;
      popup.style.right = "auto";
      popup.style.bottom = "auto";
      popup.style.margin = "0";
      popup.style.zIndex = "9999";

      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      popup.style.left = `${e.clientX - offsetX}px`;
      popup.style.top = `${e.clientY - offsetY}px`;
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
    });
  });
});

document.addEventListener("DOMContentLoaded", () => {
  (async function initialize() {
    const userInput = document.getElementById("user-input");
    const sendButton = document.getElementById("send-button");
    const micButton = document.getElementById("mic-button");
    const chatContainer = document.getElementById("chat-container-inner");
    const uploadButton = document.getElementById("upload-button");
    const userId = localStorage.getItem("userId") || "";
    let chatHistory = [];

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
        if (window.MathJax && window.MathJax.typesetPromise) MathJax.typesetPromise();
        chatHistory.push({ role: "model", content: result });
        chatContainer.scrollTop = chatContainer.scrollHeight;
      } catch (err) {
        console.error("Error fetching chat:", err);
        thinkingBubble.remove();
        chatContainer.appendChild(createMessageBubble("⚠️ Something went wrong. Try again.", "ai"));
      }
    }

    sendButton.addEventListener("click", sendMessage);
    userInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendMessage();
      }
    });

    uploadButton?.addEventListener("click", () => {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".png,.jpg,.jpeg,.pdf";
      fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();

        reader.onload = async () => {
          // Show the uploaded image/PDF preview in chat
          if (file.type.startsWith("image/")) {
            chatContainer.appendChild(createMessageBubble(reader.result, "user", true));
          } else {
            chatContainer.appendChild(createMessageBubble("📎 Uploaded PDF: " + file.name, "user"));
          }

          const formData = new FormData();
          formData.append("file", file);  // must match multer field name

          const res = await fetch("/api/upload", {
            method: "POST",
            body: formData
          });

          const data = await res.json();
          if (data.text) {
            chatContainer.appendChild(createMessageBubble(`📝 OCR Text:\n${data.text}`, "user"));
" + data.text, "user"));
            chatHistory.push({ role: "user", content: data.text });
          }

          if (data.feedback) {
            const feedbackBubble = createMessageBubble(data.feedback, "ai");
            chatContainer.appendChild(feedbackBubble);
            chatHistory.push({ role: "model", content: data.feedback });
            if (window.MathJax && window.MathJax.typesetPromise) MathJax.typesetPromise();
          }
        };

        reader.readAsDataURL(file);
      };
      fileInput.click();
    });
    });

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


    // Tool Button Event Listeners
    const calculatorPopup = document.getElementById("calculator-popup");
    const calculatorBtn = document.getElementById("calculator-button");
    const closeCalculator = document.getElementById("close-calculator");

    calculatorBtn?.addEventListener("click", () => {
      calculatorPopup.style.display = "flex";
    });
    closeCalculator?.addEventListener("click", () => {
      calculatorPopup.style.display = "none";
    });

    const scratchpadPopup = document.getElementById("sketchpad-popup");
    const scratchpadBtn = document.getElementById("scratchpad-button");
    const closeScratchpad = document.getElementById("close-scratchpad");

    scratchpadBtn?.addEventListener("click", () => {
      scratchpadPopup.style.display = "flex";
    });
    closeScratchpad?.addEventListener("click", () => {
      scratchpadPopup.style.display = "none";
    });

    // Drag functionality
    document.querySelectorAll(".popup").forEach(popup => {
      const header = popup.querySelector(".popup-header");
      if (!header) return;

      let offsetX = 0, offsetY = 0, isDragging = false;

      header.style.cursor = "move";
      header.addEventListener("mousedown", (e) => {
        isDragging = true;
        offsetX = e.clientX - popup.getBoundingClientRect().left;
        offsetY = e.clientY - popup.getBoundingClientRect().top;
        popup.style.position = "absolute";
        popup.style.zIndex = "9999";
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
  })();
});

// === Tool Button Event Listeners ===
const calculatorPopup = document.getElementById("calculator-popup");
const calculatorBtn = document.getElementById("calculator-button");
const closeCalculator = document.getElementById("close-calculator");

calculatorBtn?.addEventListener("click", () => {
  calculatorPopup.style.display = "flex";
});
closeCalculator?.addEventListener("click", () => {
  calculatorPopup.style.display = "none";
});

const scratchpadPopup = document.getElementById("sketchpad-popup");
const scratchpadBtn = document.getElementById("scratchpad-button");
const closeScratchpad = document.getElementById("close-scratchpad");

scratchpadBtn?.addEventListener("click", () => {
  scratchpadPopup.style.display = "flex";
});
closeScratchpad?.addEventListener("click", () => {
  scratchpadPopup.style.display = "none";
});

// === Drag Functionality ===
document.querySelectorAll(".popup").forEach(popup => {
  const header = popup.querySelector(".popup-header");
  if (!header) return;

  let offsetX = 0, offsetY = 0, isDragging = false;

  header.style.cursor = "move";
  header.addEventListener("mousedown", (e) => {
    isDragging = true;
    offsetX = e.clientX - popup.getBoundingClientRect().left;
    offsetY = e.clientY - popup.getBoundingClientRect().top;
    popup.style.position = "absolute";
    popup.style.zIndex = "9999";
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
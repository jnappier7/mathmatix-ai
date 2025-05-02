
document.addEventListener("DOMContentLoaded", () => {
  (async function initialize() {
    const userInput = document.getElementById("user-input");
    const sendButton = document.getElementById("send-button");
    const micButton = document.getElementById("mic-button");
    const chatContainer = document.getElementById("chat-container-inner");
    const uploadButton = document.getElementById("upload-button");
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
      body: JSON.stringify({ message, chatHistory })
    });

    const result = await response.text();

    thinkingBubble.remove();
    const aiBubble = createMessageBubble(result, "ai");
    chatContainer.appendChild(aiBubble);
      if (window.MathJax && window.MathJax.typesetPromise) {
        MathJax.typesetPromise();
      }
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

    // File upload
    uploadButton?.addEventListener("click", () => {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".png,.jpg,.jpeg,.pdf";
      fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          chatContainer.appendChild(createMessageBubble(reader.result, "user", true));
        };
        reader.readAsDataURL(file);
      };
      fileInput.click();
    });

    // Scratchpad
    const sketchpadPopup = document.getElementById("sketchpad-popup");
    const sketchBtn = document.getElementById("scratchpad-button");
    const closeSketch = document.getElementById("close-scratchpad");
    const canvas = document.getElementById("sketch-canvas");
    const ctx = canvas?.getContext("2d");
    const insertSketch = document.getElementById("insert-sketch-btn");
    let drawing = false;

    sketchBtn?.addEventListener("click", () => {
      sketchpadPopup.style.display = "flex";
    });

    closeSketch?.addEventListener("click", () => {
      sketchpadPopup.style.display = "none";
    });

    insertSketch?.addEventListener("click", () => {
      const imageData = canvas.toDataURL("image/png");
      chatContainer.appendChild(createMessageBubble(imageData, "user", true));
      sketchpadPopup.style.display = "none";
    });

    canvas?.addEventListener("mousedown", (e) => {
      const rect = canvas.getBoundingClientRect();
      ctx.beginPath();
      ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
      drawing = true;
    });

    canvas?.addEventListener("mousemove", (e) => {
      if (!drawing) return;
      const rect = canvas.getBoundingClientRect();
      ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
      ctx.stroke();
    });

    canvas?.addEventListener("mouseup", () => drawing = false);
    canvas?.addEventListener("mouseleave", () => drawing = false);

    // Equation editor
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
        chatContainer.appendChild(createMessageBubble(mathInput.value, "user"));
        equationPopup.style.display = "none";
        mathInput.value = "";
      }
    });

    closeEquation?.addEventListener("click", () => {
      equationPopup.style.display = "none";
    });

    // Calculator
    const calculatorBtn = document.getElementById("calculator-button");
    const calculatorPopup = document.getElementById("calculator-popup");
    const closeCalc = document.getElementById("close-calculator");

    calculatorBtn?.addEventListener("click", () => {
      calculatorPopup.style.display = "flex";
    });

    closeCalc?.addEventListener("click", () => {
      calculatorPopup.style.display = "none";
    });

    // Voice input
    let recognition;
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;

      micButton.addEventListener("click", () => {
        recognition.start();
        micButton.innerText = "🎙️";
      });

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        userInput.value = transcript;

        const handsFree = document.getElementById("handsfree-toggle");
        if (handsFree?.checked) {
          sendMessage();
        }

        micButton.innerText = "🎤";
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        micButton.innerText = "🎤";
      };

      recognition.onend = () => {
        micButton.innerText = "🎤";
      };
    } else {
      micButton.disabled = true;
      micButton.title = "Speech recognition not supported";
    }
  
    function makeDraggable(popupId) {
      const popup = document.getElementById(popupId);
      const header = popup?.querySelector(".popup-header");

      if (!popup || !header) return;

      let offsetX = 0, offsetY = 0, isDragging = false;

      header.style.cursor = "move";

      header.addEventListener("mousedown", (e) => {
        isDragging = true;
        offsetX = e.clientX - popup.offsetLeft;
        offsetY = e.clientY - popup.offsetTop;
        popup.style.position = "absolute";
        popup.style.zIndex = 9999;
      });

      document.addEventListener("mousemove", (e) => {
        if (isDragging) {
          popup.style.left = `${e.clientX - offsetX}px`;
          popup.style.top = `${e.clientY - offsetY}px`;
        }
      });

      document.addEventListener("mouseup", () => {
        isDragging = false;
      });
    }

    makeDraggable("calculator-popup");
    makeDraggable("sketchpad-popup");
    makeDraggable("equation-popup");

  })();
});

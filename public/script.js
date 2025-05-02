
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
      chatContainer.appendChild(createMessageBubble(message, "user"));
      chatHistory.push({ role: "user", content: message });
      userInput.value = "";
    }

    sendButton.addEventListener("click", sendMessage);
    userInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendMessage();
      }
    });

    // File upload handling
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

    // Sketchpad logic
    const sketchpadPopup = document.getElementById("sketchpad-popup");
    const sketchBtn = document.querySelector('[title="Sketchpad"]');
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

    // Equation tool logic
    const equationPopup = document.getElementById("equation-popup");
    const equationBtn = document.querySelector('[title="Insert Equation"]');
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
    const calculatorBtn = document.querySelector('[title="Calculator"]');
    const calculatorPopup = document.getElementById("calculator-popup");
    const closeCalc = document.getElementById("close-calculator");

    calculatorBtn?.addEventListener("click", () => {
      calculatorPopup.style.display = "flex";
    });

    closeCalc?.addEventListener("click", () => {
      calculatorPopup.style.display = "none";
    });
  })();
});

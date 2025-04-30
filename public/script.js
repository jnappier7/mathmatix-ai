document.addEventListener("DOMContentLoaded", function () {

  // === Personalized Greeting ===
  const user = JSON.parse(localStorage.getItem("mathmatixUser"));
  if (user) {
    const greeting = document.getElementById("welcome-message");

    if (greeting) {
      greeting.innerHTML = `
        <h2>Hey ${user.name}! 👋</h2>
        <p>You’re a <strong>${user.learningStyle.toLowerCase()}</strong> learner who prefers a <strong>${user.tonePreference.toLowerCase()}</strong> vibe.</p>
        <p>Let’s make this session 🔥</p>
      `;
    }
  }

  // --- Basic Chat Logic ---
  const chatContainer = document.getElementById("chat-container-inner");
  const userInput = document.getElementById("user-input");
  const sendButton = document.getElementById("send-button");

  let chatHistory = [];

  function autoWrapMath(message) {
    const mathTriggerPattern = /^[\d\s\+\-\*\/\=\^\(\)xXyYzZaAbBcCdDeEfFgGhHiIjJkKlLmMnNoOpPqQrRsStTuUvVwWxXyYzZ]+$/;
    if (mathTriggerPattern.test(message.trim())) {
      return `\\(${message.trim()}\\)`;
    } else {
      return message;
    }
  }

  function createMessageBubble(message, sender = "user", isImage = false) {
    const bubble = document.createElement("div");
    bubble.classList.add("message", sender);

    if (sender === "user") {
      bubble.style.alignSelf = "flex-end";
    } else {
      bubble.style.alignSelf = "flex-start";
    }

    if (isImage) {
      const img = document.createElement("img");
      img.src = message;
      img.style.maxWidth = "100%";
      img.style.borderRadius = "8px";
      bubble.appendChild(img);
    } else if (message.includes("\\(") || message.includes("\\[")) {
      bubble.innerHTML = `<div class="math-line">${message}</div>`;
      bubble.classList.add("math-message");
    } else {
      bubble.innerText = message;
    }

    return bubble;
  }

  async function sendMessage() {
    const message = userInput.value.trim();
    if (message === "") return;

    chatContainer.appendChild(createMessageBubble(message, "user"));
    chatHistory.push({ role: "user", content: message });
    chatContainer.scrollTop = chatContainer.scrollHeight;
    userInput.value = "";

    const typingBubble = createMessageBubble("Mathmatix AI is thinking...", "ai");
    chatContainer.appendChild(typingBubble);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    try {
      const response = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatHistory, message })
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

      if (data.images && Array.isArray(data.images)) {
        data.images.forEach(imgSrc => {
          chatContainer.appendChild(createMessageBubble(imgSrc, "ai", true));
          chatContainer.scrollTop = chatContainer.scrollHeight;
        });
      }

    } catch (error) {
      console.error("Error sending message:", error);
      chatContainer.removeChild(typingBubble);
    }
  }

  // --- Send Button ---
  sendButton.addEventListener("click", sendMessage);
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  // --- MathLive Insert Equation ---
  const insertEquationBtn = document.getElementById('equation-button');
  const mathFieldContainer = document.createElement('div');
  mathFieldContainer.id = 'mathFieldContainer';
  mathFieldContainer.style.display = 'none';
  mathFieldContainer.style.position = 'fixed';
  mathFieldContainer.style.bottom = '80px';
  mathFieldContainer.style.left = '50%';
  mathFieldContainer.style.transform = 'translateX(-50%)';
  mathFieldContainer.style.background = 'white';
  mathFieldContainer.style.border = '2px solid teal';
  mathFieldContainer.style.padding = '10px';
  mathFieldContainer.style.borderRadius = '12px';
  mathFieldContainer.style.boxShadow = '0px 4px 12px rgba(0,0,0,0.2)';
  mathFieldContainer.style.zIndex = '9999';

  const mathField = document.createElement('math-field');
  mathField.id = 'mathInput';
  mathField.style.width = '300px';
  mathField.style.fontSize = '22px';
  mathField.style.minHeight = '50px';
  mathFieldContainer.appendChild(mathField);

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

  document.body.appendChild(mathFieldContainer);

  insertEquationBtn.addEventListener('click', () => {
    mathFieldContainer.style.display = 'block';
    mathField.focus();
  });

  function submitEquation() {
    const latex = mathField.value;
    if (latex.trim() !== '') {
      userInput.value = `\\(${latex}\\)`;
      mathField.value = '';
      mathFieldContainer.style.display = 'none';
      userInput.focus();
    }
  }

  // --- Drag and Drop Upload ---
  const dropzone = document.getElementById('dropzone');
  const uploadButton = document.getElementById('upload-button');

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('active');
  });
  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropzone.classList.remove('active');
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('active');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  });
  uploadButton.addEventListener('click', () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.png,.jpg,.jpeg,.pdf';
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        handleFileUpload(file);
      }
    };
    fileInput.click();
  });

  function handleFileUpload(file) {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = function (e) {
        chatContainer.appendChild(createMessageBubble(e.target.result, "user", true));
        chatContainer.scrollTop = chatContainer.scrollHeight;
      };
      reader.readAsDataURL(file);
    } else {
      const msg = document.createElement('div');
      msg.innerText = `📄 Uploaded file: ${file.name}`;
      chatContainer.appendChild(createMessageBubble(msg.innerText, "user"));
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }

  // --- Calculator and Sketch Pad Popups ---
  const calculatorBtn = document.getElementById('calculator-button');
  const sketchPadBtn = document.getElementById('scratchpad-button');
  const closeCalculator = document.getElementById('close-calculator');
  const closeSketchpad = document.getElementById('close-sketchpad');

  const calculatorPopup = document.getElementById('calculator-popup');
  const sketchpadPopup = document.getElementById('sketchpad-popup');

  calculatorBtn.addEventListener('click', () => {
    calculatorPopup.classList.remove('hidden');
  });
  sketchPadBtn.addEventListener('click', () => {
    sketchpadPopup.classList.remove('hidden');
  });
  closeCalculator.addEventListener('click', () => {
    calculatorPopup.classList.add('hidden');
  });
  closeSketchpad.addEventListener('click', () => {
    sketchpadPopup.classList.add('hidden');
  });

  // --- Sketchpad Drawing Logic ---
  const sketchCanvas = document.getElementById('sketch-canvas');
  const clearSketch = document.getElementById('clear-sketch');
  const ctx = sketchCanvas.getContext('2d');
  let drawing = false;

  function getCanvasCoordinates(e) {
    const rect = sketchCanvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  sketchCanvas.addEventListener('mousedown', (e) => {
    drawing = true;
    const pos = getCanvasCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  });

  sketchCanvas.addEventListener('mousemove', (e) => {
    if (!drawing) return;
    const pos = getCanvasCoordinates(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  });

  sketchCanvas.addEventListener('mouseup', () => {
    drawing = false;
  });

  sketchCanvas.addEventListener('mouseout', () => {
    drawing = false;
  });

  // Touch support
  sketchCanvas.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    const pos = getCanvasCoordinates(touch);
    drawing = true;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  });

  sketchCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!drawing) return;
    const touch = e.touches[0];
    const pos = getCanvasCoordinates(touch);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  });

  sketchCanvas.addEventListener('touchend', () => {
    drawing = false;
  });

  clearSketch.addEventListener('click', () => {
    ctx.clearRect(0, 0, sketchCanvas.width, sketchCanvas.height);
  });

}); // End DOMContentLoaded

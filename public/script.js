document.addEventListener("DOMContentLoaded", function () {
  // === Personalized AI Welcome Bubble ===
  const user = JSON.parse(localStorage.getItem("mathmatixUser"));
  if (user) {
    const container = document.getElementById("chat-container-inner");
    const bubble = document.createElement("div");
    bubble.classList.add("message", "ai");

    const name = user.name || "friend";
    const learner = user.learningStyle?.toLowerCase();
    const tone = user.tonePreference?.toLowerCase();

    let intro = `Hey ${name}! ?`;
    let learnerLine = learner
      ? `Let’s make math make sense, ${learner === 'kinesthetic' ? 'hands-on' : 'your way'}.`
      : `Let’s dive in.`;

    let toneLine = "";
    if (tone === "chill") toneLine = "No pressure. Just good vibes. ?";
    else if (tone === "motivational") toneLine = "We’re gonna crush this. Let’s gooo! ?";
    else if (tone === "serious") toneLine = "Locked in. Let’s get right to it. ?";

    bubble.innerText = `${intro}\n\n${learnerLine}\n${toneLine}`;
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
  }

  const chatContainer = document.getElementById("chat-container-inner");
  const userInput = document.getElementById("user-input");
  const sendButton = document.getElementById("send-button");
  let chatHistory = [];

  function autoWrapMath(message) {
    const mathPattern = /^[\d\s+\-*/=^()xXyY]+$/;
    return mathPattern.test(message.trim()) ? `\\(${message.trim()}\\)` : message;
  }

  function createMessageBubble(message, sender = "user", isImage = false) {
    const bubble = document.createElement("div");
    bubble.classList.add("message", sender);
    bubble.style.alignSelf = sender === "user" ? "flex-end" : "flex-start";

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
    if (!message) return;

    chatContainer.appendChild(createMessageBubble(message, "user"));
    chatHistory.push({ role: "user", content: message });
    chatContainer.scrollTop = chatContainer.scrollHeight;
    userInput.value = "";

    const typingBubble = createMessageBubble("Mathmatix AI is thinking...", "ai");
    chatContainer.appendChild(typingBubble);

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
        if (window.MathJax) MathJax.typesetPromise();
      }

      if (Array.isArray(data.images)) {
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

  sendButton.addEventListener("click", sendMessage);
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });

  // === Insert Equation Button ===
  const insertEquationBtn = document.getElementById('equation-button');
  const mathFieldContainer = document.createElement('div');
  mathFieldContainer.id = 'mathFieldContainer';
  mathFieldContainer.style = "display:none;position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:white;border:2px solid teal;padding:10px;border-radius:12px;box-shadow:0px 4px 12px rgba(0,0,0,0.2);z-index:9999;";
  
  const mathField = document.createElement('math-field');
  mathField.id = 'mathInput';
  mathField.style = "width:300px;font-size:22px;min-height:50px;";
  mathFieldContainer.appendChild(mathField);

  const submitButton = document.createElement('button');
  submitButton.innerText = 'Submit';
  submitButton.style.marginTop = '8px';
  submitButton.onclick = () => {
    const latex = mathField.value;
    if (latex.trim()) {
      userInput.value = `\\(${latex}\\)`;
      mathField.value = '';
      mathFieldContainer.style.display = 'none';
      userInput.focus();
    }
  };
  mathFieldContainer.appendChild(submitButton);

  const cancelButton = document.createElement('button');
  cancelButton.innerText = 'Cancel';
  cancelButton.style.margin = '8px 0 0 10px';
  cancelButton.onclick = () => mathFieldContainer.style.display = 'none';
  mathFieldContainer.appendChild(cancelButton);

  document.body.appendChild(mathFieldContainer);
  insertEquationBtn.addEventListener('click', () => {
    mathFieldContainer.style.display = 'block';
    mathField.focus();
  });

  // === File Upload Integration (Floating button + Drag-n-Drop) ===
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
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });
  uploadButton.addEventListener('click', () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.png,.jpg,.jpeg,.pdf';
    fileInput.onchange = (e) => {
      if (e.target.files[0]) handleFileUpload(e.target.files[0]);
    };
    fileInput.click();
  });

  // === OCR + Gemini Upload Flow ===
  async function handleFileUpload(file) {
    const formData = new FormData();
    formData.append('file', file);

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = function (e) {
        chatContainer.appendChild(createMessageBubble(e.target.result, "user", true));
        chatContainer.scrollTop = chatContainer.scrollHeight;
      };
      reader.readAsDataURL(file);
    } else {
      chatContainer.appendChild(createMessageBubble(`? Uploaded file: ${file.name}`, "user"));
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    const thinking = createMessageBubble("Extracting text and analyzing...", "ai");
    chatContainer.appendChild(thinking);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    try {
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();

      const aiRes = await fetch('/api/ask-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: uploadData.text })
      });

      const aiData = await aiRes.json();
      chatContainer.removeChild(thinking);

      const aiMessage = autoWrapMath(aiData.response);
      chatContainer.appendChild(createMessageBubble(aiMessage, "ai"));
      chatContainer.scrollTop = chatContainer.scrollHeight;
      if (window.MathJax) MathJax.typesetPromise();

    } catch (err) {
      console.error("OCR/AI Error:", err);
      chatContainer.removeChild(thinking);
      chatContainer.appendChild(createMessageBubble("?? Something went wrong processing that file.", "ai"));
    }
  }
});

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
          const base64Data = reader.result.split(',')[1];
          chatContainer.appendChild(createMessageBubble(reader.result, "user", true));

          const res = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: base64Data })
          });

          const data = await res.json();
          if (data.text) {
            chatContainer.appendChild(createMessageBubble(data.text, "user"));
            chatHistory.push({ role: "user", content: data.text });
          }
        };
        reader.readAsDataURL(file);
      };
      fileInput.click();
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
  })();
});

// public/script.js — With Parabola Image Trigger (May 2025)

document.addEventListener("DOMContentLoaded", () => {
  console.log("📡 M∆THM∆TIΧ Initialized");

  const userId = localStorage.getItem("userId");
  const chatContainer = document.getElementById("chat-container-inner");
  const input = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-button");
  const uploadBtn = document.getElementById("file-upload");
  const fileInput = document.getElementById("file-input");
  const micBtn = document.getElementById("mic-button");
  const handsFreeToggle = document.getElementById("handsfree-toggle");
  const handsFreeLabel = document.getElementById("handsfree-label");

  let lastMessageAskedForDrawing = false;

  const appendMessage = (text, sender = "ai") => {
    const message = document.createElement("div");
    message.classList.add("message", sender);
    message.innerText = text;
    chatContainer.appendChild(message);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    if (window.MathJax) MathJax.typesetPromise([message]);
  };

  const appendImage = (url, alt = "AI-generated image") => {
    const message = document.createElement("div");
    message.classList.add("message", "ai");
    const img = document.createElement("img");
    img.src = url;
    img.alt = alt;
    img.style.maxWidth = "300px";
    img.style.borderRadius = "12px";
    message.appendChild(img);
    chatContainer.appendChild(message);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  };

  sendBtn.addEventListener("click", () => {
    const msg = input.value.trim();
    if (!msg) return;

    appendMessage(msg, "user");
    input.value = "";

    // 🌟 Check for user saying "yes" after drawing offer
    if (lastMessageAskedForDrawing && /^yes|sure|absolutely|please|do it$/i.test(msg)) {
      lastMessageAskedForDrawing = false;
      fetch("/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "a simple labeled graph of a parabola opening upward"
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.imageUrl) {
            appendImage(data.imageUrl, "Graph of a Parabola");
          } else {
            appendMessage("⚠️ I tried to draw it, but something went wrong.");
          }
        })
        .catch((err) => {
          console.error("❌ Image error:", err);
          appendMessage("⚠️ Couldn't generate the image. Try again later.");
        });
      return;
    }

    const name = localStorage.getItem("name");
    const tone = localStorage.getItem("tone");
    const learningStyle = localStorage.getItem("learningStyle");
    let interests = localStorage.getItem("interests");

    if (interests) {
      try {
        interests = JSON.parse(interests);
      } catch (e) {
        console.error("Error parsing interests from localStorage", e);
        interests = [];
      }
    } else {
      interests = [];
    }

    fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, message: msg, name, tone, learningStyle, interests }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Server error");
        return res.json();
      })
      .then((data) => {
        if (data?.text) {
          appendMessage(data.text, "ai");
          lastMessageAskedForDrawing = /want me to draw this for you\?/i.test(data.text);
        } else {
          appendMessage("🤖 Something went wrong with the response.", "ai");
        }
      })
      .catch((err) => {
        console.error("❌ Chat error:", err);
        appendMessage("🚨 AI error. Please try again.", "ai");
      });
  });

  // 📎 Upload
  uploadBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    appendMessage(`📎 Uploaded ${file.name}`, "user");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("userId", userId);
    fetch("/upload", {
      method: "POST",
      body: formData,
    })
      .then((res) => res.text())
      .then((text) => appendMessage(text))
      .catch((err) => {
        console.error("❌ Upload error:", err);
        appendMessage("🚨 Upload failed. Please try again.");
      });
  });

  window.addEventListener("beforeunload", () => {
    if (!userId) return;
    navigator.sendBeacon("/chat/end-session", JSON.stringify({ userId }));
  });

  // 🎤 Voice Input + Hands-Free
  let recognizing = false;
  let recognition;
  let handsFreeEnabled = false;

  if ("webkitSpeechRecognition" in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = function (event) {
      const transcript = event.results[0][0].transcript;
      input.value = transcript;
      if (handsFreeEnabled) sendBtn.click();
    };
    recognition.onerror = function (event) {
      console.error("🎙️ Speech recognition error", event);
    };
    micBtn.addEventListener("click", () => {
      if (recognizing) {
        recognition.stop();
        micBtn.classList.remove("active");
      } else {
        recognition.start();
        micBtn.classList.add("active");
      }
      recognizing = !recognizing;
    });
  }

  handsFreeToggle.addEventListener("click", () => {
    handsFreeEnabled = !handsFreeEnabled;
    handsFreeLabel.innerText = handsFreeEnabled
      ? "Hands-Free Mode: ON"
      : "Hands-Free Mode: OFF";
  });

  // 🛠️ Tool Popups
  document.getElementById("calc-button").addEventListener("click", () => {
    document.getElementById("calculator-popup").style.display = "flex";
  });
  document.getElementById("draw-button").addEventListener("click", () => {
    document.getElementById("sketchpad-popup").style.display = "flex";
  });
  document.getElementById("pi-button").addEventListener("click", () => {
    document.getElementById("equation-popup").style.display = "flex";
  });
  document.querySelectorAll(".close-button").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".popup").style.display = "none";
    });
  });
});

function dragPopup(popupId) {
  const popup = document.getElementById(popupId);
  const header = popup.querySelector(".popup-header");
  let offsetX = 0, offsetY = 0, isDragging = false;
  header.style.cursor = "grab";
  header.addEventListener("mousedown", (e) => {
    isDragging = true;
    offsetX = e.clientX - popup.getBoundingClientRect().left;
    offsetY = e.clientY - popup.getBoundingClientRect().top;
    popup.style.position = "absolute";
    popup.style.zIndex = "9999";
    header.style.cursor = "grabbing";
  });
  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const left = e.clientX - offsetX;
    const top = e.clientY - offsetY;
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  });
  document.addEventListener("mouseup", () => {
    isDragging = false;
    header.style.cursor = "grab";
  });
}

dragPopup("calculator-popup");
dragPopup("sketchpad-popup");
dragPopup("equation-popup");

// public/script.js — FINAL VERSION with Google Image, DALL·E, and GeoGebra Graph Embeds

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

  // ✅ Fix: Enable send on Enter (but allow Shift+Enter for newline)
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  const appendImage = (url, alt = "Visual Example") => {
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

  const appendGeoGebraGraph = (equation) => {
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.geogebra.org/calculator?embed=true&ggbScript=${encodeURIComponent("Graph: " + equation)}`;
    iframe.style.width = "100%";
    iframe.style.maxWidth = "500px";
    iframe.style.height = "400px";
    iframe.style.border = "none";
    iframe.style.borderRadius = "12px";
    const wrapper = document.createElement("div");
    wrapper.classList.add("message", "ai");
    wrapper.appendChild(iframe);
    chatContainer.appendChild(wrapper);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  };

  const triggerImageSearchIfNeeded = (aiText) => {
    const learningStyle = localStorage.getItem("learningStyle");
    if (learningStyle?.toLowerCase() !== "visual") return;

    const triggers = [
      "golden ratio",
      "spiral in nature",
      "sunflower pattern",
      "fibonacci",
      "tessellation",
      "real-world example",
      "pinecone",
      "math in nature"
    ];

    const foundTrigger = triggers.find(trigger =>
      aiText.toLowerCase().includes(trigger)
    );

    if (!foundTrigger) return;

    fetch(`/image-search?query=${encodeURIComponent(foundTrigger)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.imageUrl) {
          appendImage(data.imageUrl, `Visual of ${foundTrigger}`);
        }
      })
      .catch((err) => {
        console.error("🔍 Image search failed:", err);
      });
  };

  const checkForGraphEmbed = (text) => {
    const match = text.match(/\[GRAPH: (.+?)\]/i);
    if (match && match[1]) {
      const equation = match[1];
      appendGeoGebraGraph(equation);
    }
  };

  sendBtn.addEventListener("click", () => {
    const msg = input.value.trim();
    if (!msg) return;

    appendMessage(msg, "user");
    input.value = "";

    // 🌟 Check for DALL·E drawing trigger
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
          triggerImageSearchIfNeeded(data.text);
          checkForGraphEmbed(data.text);
        } else {
          appendMessage("🤖 Something went wrong with the response.", "ai");
        }
      })
      .catch((err) => {
        console.error("❌ Chat error:", err);
        appendMessage("🚨 AI error. Please try again.", "ai");
      });
  });

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

dragPopup("calculator-popup");
dragPopup("sketchpad-popup");
dragPopup("equation-popup");

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

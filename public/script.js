
document.addEventListener("DOMContentLoaded", () => {
  (async function initialize() {
    const user = JSON.parse(localStorage.getItem("mathmatixUser"));
    const chatContainer = document.getElementById("chat-container-inner");
    const userInput = document.getElementById("user-input");
    const sendButton = document.getElementById("send-button");
    const uploadButton = document.getElementById("upload-button");
    let chatHistory = [];

    // 🧠 Load memory if user is logged in
    if (user?._id) {
      try {
        const res = await fetch(`/memory/load-memory/${user._id}`);
        const data = await res.json();
        if (data.memory?.messages?.length > 0) {
          chatHistory = [...data.memory.messages];
          chatContainer.appendChild(createMessageBubble("🧠 Loaded your last tutoring session. Let’s pick up where we left off!", "ai"));
          console.log("🧠 MEMORY LOADED:", data.memory);
        } else {
          console.log("🧠 No memory found.");
        }
      } catch (err) {
        console.warn("⚠️ Failed to load memory:", err);
      }
    }

    // 💾 Make available globally
    window.chatHistory = chatHistory;

    // Attach all the UI logic and buttons
    const mathButton = document.getElementById("math-button");
    if (mathButton) {
      mathButton.addEventListener("click", () => {
        if (window.mathVirtualKeyboard) {
          window.mathVirtualKeyboard.show();
        }
      });
    }

    const scratchButton = document.getElementById("scratch-button");
    const scratchPad = document.getElementById("scratchpad");
    if (scratchButton && scratchPad) {
      scratchButton.addEventListener("click", () => {
        scratchPad.style.display = scratchPad.style.display === "block" ? "none" : "block";
      });
    }

    const calcButton = document.getElementById("calc-button");
    const calc = document.getElementById("calculator");
    if (calcButton && calc) {
      calcButton.addEventListener("click", () => {
        calc.style.display = calc.style.display === "block" ? "none" : "block";
      });
    }
  })();
});

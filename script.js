const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatWindow = document.getElementById("chat-window");

let chatHistory = [];

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const userMessage = chatInput.value.trim();
  if (!userMessage) return;

  addMessageToChat("You", userMessage);
  chatInput.value = "";

  chatHistory.push({ role: "user", content: userMessage });

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userMessage,
        history: chatHistory
      })
    });

    const data = await res.json();
    const aiMessage = data.response || "⚠️ No response.";

    chatHistory.push({ role: "assistant", content: aiMessage });

    addMessageToChat("M∆THM∆TIΧ AI", aiMessage);
  } catch (error) {
    console.error("Error:", error);
    addMessageToChat("M∆THM∆TIΧ AI", "⚠️ There was an error processing your message.");
  }
});

function addMessageToChat(sender, text) {
  const messageEl = document.createElement("div");
  messageEl.className = "message";
  messageEl.innerHTML = `<strong>${sender}:</strong> ${text}`;
  chatWindow.appendChild(messageEl);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatWindow = document.getElementById("chat-window");

let chatHistory = [];

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const userMessage = chatInput.value.trim();
  if (!userMessage) return;

  chatInput.value = ""; // ✅ Clear the input box immediately

  // Create and show user message bubble
  const userBubble = createBubble("You", userMessage, "user");
  chatWindow.appendChild(userBubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  chatHistory.push({ role: "user", content: userMessage });

  // Create and show AI placeholder
  const aiBubble = createBubble("M∆THM∆TIΧ AI", "Thinking...", "ai");
  chatWindow.appendChild(aiBubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;

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
    const aiResponse = data.response || "⚠️ No response from the AI.";

    chatHistory.push({ role: "assistant", content: aiResponse });
    aiBubble.innerHTML = `<strong>M∆THM∆TIΧ AI:</strong> ${aiResponse}`;
  } catch (err) {
    console.error("AI request failed:", err);
    aiBubble.innerHTML = `<strong>M∆THM∆TIΧ AI:</strong> ⚠️ There was a problem reaching the server.`;
  }
});

function createBubble(sender, text, role) {
  const bubble = document.createElement("div");
  bubble.classList.add("message", role);
  bubble.innerHTML = `<strong>${sender}:</strong> ${text}`;
  return bubble;
}

document.addEventListener("DOMContentLoaded", () => {
  const childSelector = document.getElementById("childSelector");
  const chatContainer = document.getElementById("chat-container-inner");
  const userInput = document.getElementById("user-input");
  const sendButton = document.getElementById("send-button");
  const thinkingIndicator = document.getElementById("thinking-indicator");

  let children = [];
  let selectedChild = null;

  async function loadChildren() {
    try {
      const res = await fetch("/api/parent/children");
      const data = await res.json();
      children = data;

      childSelector.innerHTML = children.map((child, i) => `
        <option value="${child._id}" ${i === 0 ? "selected" : ""}>
          ${child.firstName} ${child.lastName} (${child.gradeLevel || "?"})
        </option>
      `).join("");

      selectedChild = children[0];
    } catch (err) {
      console.error("Failed to load children:", err);
      childSelector.innerHTML = '<option>Failed to load</option>';
    }
  }

  childSelector.addEventListener("change", () => {
    selectedChild = children.find(c => c._id === childSelector.value);
  });

  function appendMessage(sender, text) {
    const msg = document.createElement("div");
    msg.className = `message ${sender}`;
    msg.innerText = text;
    chatContainer.appendChild(msg);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  sendButton.addEventListener("click", async () => {
    const message = userInput.value.trim();
    if (!message || !selectedChild) return;

    appendMessage("user", message);
    userInput.value = "";
    thinkingIndicator.style.display = "block";

    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          role: "parent",
          childId: selectedChild._id,
        })
      });

      const data = await res.json();
      appendMessage("ai", data.text || "⚠️ No response from tutor.");
    } catch (err) {
      console.error("Parent chat error:", err);
      appendMessage("ai", "⚠️ Error. Please try again.");
    } finally {
      thinkingIndicator.style.display = "none";
    }
  });

  loadChildren();
});

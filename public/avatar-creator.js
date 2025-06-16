// avatar-creator.js

const avatarImage = document.getElementById("avatar-image");
const optionsContainer = document.getElementById("options-container");

let avatarData = {
  skin: "default",
  hair: "default",
  top: "default",
  bottom: "default",
  accessory: "none",
};

const options = {
  skin: ["light", "medium", "dark"],
  hair: ["short", "curly", "braids"],
  top: ["hoodie", "tshirt", "jacket"],
  bottom: ["jeans", "shorts", "joggers"],
  accessory: ["glasses", "chain", "hat"]
};

function renderOptions(category) {
  optionsContainer.innerHTML = `<h2>${capitalize(category)}</h2>`;
  options[category].forEach(option => {
    const img = document.createElement("img");
    img.src = `/avatars/${category}-${option}.png`;
    img.alt = option;
    img.addEventListener("click", () => {
      avatarData[category] = option;
      updatePreview();
    });
    optionsContainer.appendChild(img);
  });
}

function updatePreview() {
  const { skin, hair, top, bottom, accessory } = avatarData;
  avatarImage.src = `/avatars/preview?skin=${skin}&hair=${hair}&top=${top}&bottom=${bottom}&accessory=${accessory}`;
}

function saveAvatar() {
  fetch("/api/avatar", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ avatar: avatarData })
  })
    .then(res => {
      if (res.ok) {
        window.location.href = "/chat.html";
      } else {
        alert("Error saving avatar.");
      }
    })
    .catch(err => {
      console.error("Avatar save failed:", err);
      alert("Server error. Try again.");
    });
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

document.querySelectorAll("[data-category]").forEach(btn => {
  btn.addEventListener("click", () => {
    const category = btn.getAttribute("data-category");
    renderOptions(category);
  });
});

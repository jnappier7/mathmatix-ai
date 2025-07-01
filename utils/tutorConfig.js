// utils/tutorConfig.js - Trimmed to 4 Tutors and updated with Mr. Nappier

const TUTOR_CONFIG = {
  "bob": {
    name: "Bob",
    voiceId: "UgBBYS2sOqTuMpoF3BR0", // Example ElevenLabs voice ID
    gender: "male",
    accent: "Midwestern Dad",
    tone: "super-patient dad-vibe",
    image: "bob.png" // Path relative to public/images/tutor_avatars/
  },
  "ms-maria": {
    name: "Ms. Maria",
    voiceId: "kcQkGnn0HAT2JRDQ4Ljp", // Example ElevenLabs voice ID
    gender: "female",
    accent: "Mexican-American",
    tone: "upbeat middle-school teacher",
    image: "ms-maria.png"
  },
  "maya": {
    name: "Maya",
    voiceId: "umKoJK6tP1ALjO0zo1EE", // Example ElevenLabs voice ID
    gender: "female",
    accent: "Caribbean-American",
    tone: "college-peer mentor",
    image: "maya.png"
  },
  "mr-nappier": { // Replaced Coach J with Mr. Nappier
    name: "Mr. Nappier",
    voiceId: "2eFQnnNM32GDnZkCfkSm", // Example ElevenLabs voice ID
    gender: "male",
    accent: "American",
    tone: "hype, sports analogies",
    image: "mr-nappier.png"
  },
  "default": { // Fallback tutor
    name: "Mr. Nappier",
    voiceId: "2eFQnnNM32GDnZkCfkSm", // Default to Mr. Nappier if no tutor is selected
    gender: "male",
    accent: "American",
    tone: "hype, sports analogies",
    image: "mr-nappier.png"
  }
};

// Conditional export for Node.js and browser environments
if (typeof module !== "undefined" && module.exports) {
  module.exports = TUTOR_CONFIG; // Node.js
} else {
  window.TUTOR_CONFIG = TUTOR_CONFIG; // Browser
}
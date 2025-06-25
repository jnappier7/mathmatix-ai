// utils/tutorConfig.js

const TUTOR_CONFIG = {
    "mr-lee": {
    name: "Mr. Lee",
    voiceId: "qRv1e4rqeMgBLK8HYz37",
    gender: "male",
    accent: "American",
    tone: "encouraging and analytical",
    image: "mr-lee.png" // ADD THIS LINE - replace with actual filename
  },
  "mr-nappier": {
    name: "Mr. Nappier",
    voiceId: "2eFQnnNM32GDnZkCfkSm",
    gender: "male",
    accent: "American",
    tone: "calm but hype-ready",
    image: "mr-nappier.png" // ADD THIS LINE - replace with actual filename
  },
  "dr-jones": {
    name: "Dr. Jones",
    voiceId: "aVR2rUXJY4MTezzJjPyQ", 
    gender: "female",
    accent: "American",
    tone: "logical, slightly cheeky",
    image: "dr-jones.png" // ADD THIS LINE - replace with actual filename
  },
  "prof-davies": {
    name: "Prof. Davies",
    voiceId: "jn34bTlmmOgOJU9XfPuy",
    gender: "male",
    accent: "Irish",
    tone: "professorial",
    image: "prof-davies.png" // ADD THIS LINE - replace with actual filename
  },
  "ms-alex": {
    name: "Ms. Alex",
    voiceId: "8DzKSPdgEQPaK5vKG0Rs",
    gender: "female",
    accent: "Black American",
    tone: "friendly, bold",
    image: "ms-alex.png" // ADD THIS LINE - replace with actual filename
  },
  "maya": {
    name: "Maya",
    voiceId: "umKoJK6tP1ALjO0zo1EE",
    gender: "female",
    accent: "Caribbean-American",
    tone: "gentle, nurturing",
    image: "maya.png" // ADD THIS LINE - replace with actual filename
  },
  "ms-maria": {
    name: "Ms. Maria",
    voiceId: "kcQkGnn0HAT2JRDQ4Ljp",
    gender: "female",
    accent: "Mexican-American",
    tone: "warm, affirming",
    image: "ms-maria.png" // ADD THIS LINE - replace with actual filename
  },
  "bob": {
    name: "Bob",
    voiceId: "UgBBYS2sOqTuMpoF3BR0",
    gender: "male",
    accent: "Midwestern Dad",
    tone: "goofy, dad-jokey",
    image: "bob.png" // ADD THIS LINE - replace with actual filename
  },
    "ms-rashida": {
    name: "Ms. Rashida",
    voiceId: "03vEurziQfq3V8WZhQvn",
    gender: "female",
    accent: "Urban American",
    tone: "empowering, nurturing",
    image: "ms-rashida.png" // ADD THIS LINE - replace with actual filename
  },
	
  	"default": {
    name: "Bob",
    voiceId: "UgBBYS2sOqTuMpoF3BR0",
    gender: "neutral",
    accent: "American",
    tone: "adaptive AI",
    image: "bob.png" // ADD THIS LINE - replace with a generic image or your logo
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = TUTOR_CONFIG; // Node.js
} else {
  window.TUTOR_CONFIG = TUTOR_CONFIG; // Browser
}

// utils/tutorConfig.js
// This file centralizes the mapping of tutor IDs to their names and ElevenLabs Voice IDs.

const TUTOR_CONFIG = {
    "mr-lee": { name: "Mr. Lee", voiceId: "qRv1e4rqeMgBLK8HYZ37" },
    "mr-nappier": { name: "Mr. Nappier", voiceId: "2eFQnnNM32GDnZkCfkSm" },
    "dr-jones": { name: "Dr. Jones", voiceId: "aVR2RUXJY4MTEzzJjPyQ" },
    "prof-davies": { name: "Prof. Davies", voiceId: "jn34bTImmOgOJU9XfPuy" },
    "ms-alex": { name: "Ms. Alex", voiceId: "8DzKSPdgEQPaK5vKG0Rs" },
    "maya": { name: "Maya", voiceId: "umKoJK6tP1ALJ0oZo1EE" },
    "ms-maria": { name: "Ms. Maria", voiceId: "kcQkGnn0HAT2JRDQ4Ljp" },
    "bob": { name: "Bob", voiceId: "UgBBYS2sOqTuMpoF3BR0" },
    // Default fallback if no specific tutor is selected or found. It's important to have a valid ID here.
    "default": { name: "M∆THM∆TIΧ AI", voiceId: "2eFQnnNM32GDnZkCfkSm" } // Fallback to Mr. Nappier's voice or a generic AI voice
};

module.exports = TUTOR_CONFIG;// JavaScript Document
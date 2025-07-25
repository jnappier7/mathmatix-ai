// utils/brand.js - Centralized Brand Tokens and Rules

const BRAND_CONFIG = {
    // 1. Core Identity
    name: "M∆THM∆TIΧ AI",
    tagline: "See the Patterns, Solve with Ease.",
    missionStamp: "An Affordable Math Tutor for Every Child.", //

    // 2. Color System (use as CSS variables in style.css)
    colors: {
        primaryTeal: "#12B3B3",
        accentHotPink: "#FF3B7F", //
        successGreen: "#16C86D",
        warningGold: "#FFC24B",
        errorRed: "#FF4E4E",
        bgLight: "#FFFFFF",
        bgDark: "#0F1A24", // For focus mode / dark backgrounds
        textPrimary: "#18202B",
        textDim: "#5B6876"
    },

    // 3. Typography
    typography: {
        fontFamilyHeadlines: "Inter, sans-serif",
        fontFamilyBody: "Inter, sans-serif",
        fontFamilyCodeMath: "ui-monospace, Menlo, Consolas",
        fontWeightHeadlines: 700,
        fontWeightBody: 400,
        baseFontSizePx: 16, // Will be bumped to 18px on mobile
        h1Px: 48, // Desktop H1 size
        h3Px: 24 // Desktop H3 size
    },

    // 4. Icon & Illustration Style
    iconStyle: {
        lineStrokePx: 2,
        lineColor: "#12B3B3", // Primary teal
        borderRadiusPx: 8, // General rounded corners for cards, inputs, buttons
        avatarStyle: "clean, flat-shaded cartoon",
        badgeStyle: "clean, flat-shaded cartoon"
    },

    // 5. Motion & Feedback (client-side implementation)
    motion: {
        badgeUnlockMs: 300, // Scale-up animation for badges
        buttonHoverMs: 150, // Upward lift for buttons
        drawerOpenMs: 250, // Slide for drawers
        typingIndicatorDots: true, // Use three bouncing dots
        typeOnEffect: false, // NOT character-by-character typing
        typingDotDelayMs: 2000 // Delay before full message appears
    },

    // 6. Voice & Tone (AI persona guidance)
    voiceTone: {
        conversational: true,
        confident: true,
        playful: true,
        encouraging: true,
        mathSlangLimited: true,
        firstPersonTutor: true,
        avoidAcademicJargon: true
    },

    // 7. UI Placement Rules (for consistent layout)
    uiPlacement: {
        primaryCtaColor: "hot-pink", // Use accentHotPink for primary CTAs
        equationButtonPosition: "left-of-input",
        xpDrawerPosition: "right",
        leaderboardDrawerPosition: "left",
        modalCenter: true,
        dotIndicatorPlacement: "next-tutor-bubble"
    },

    // 8. Specific Feature Settings
    xpPerLevel: 100, // XP needed to level up
    xpAwardRange: { min: 1, max: 50 }, // Max XP an AI can award in one go
    baseXpPerTurn: 2, // NEW: Small XP awarded for every valid chat turn
    iepGoalCap: 10, // Max active goals per student
    digestEmailSchedule: "Sunday 7 AM ET", //
    digestEmailProvider: "SendGrid", //

    // Images paths for classroom scene
    classroomHeroImage: "/images/classroom-hero.png" //
};

module.exports = BRAND_CONFIG;// JavaScript Document
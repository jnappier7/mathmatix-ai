// modules/helpers.js
// Pure utility functions with no external dependencies

export const sleep = (ms) => new Promise(res => setTimeout(res, ms));

/**
 * Get color for graph expressions (cycles through a palette)
 */
export function getGraphColor(index) {
    const colors = [
        '#2563eb', // blue
        '#dc2626', // red
        '#16a34a', // green
        '#9333ea', // purple
        '#ea580c', // orange
        '#0891b2', // cyan
        '#c026d3', // magenta
        '#65a30d'  // lime
    ];
    return colors[index % colors.length];
}

/**
 * Convert LaTeX math notation to speakable text using MathLive
 */
export function generateSpeakableText(text) {
    if (!text) return '';
    if (!window.MathLive) return text.replace(/\\\(|\\\)|\\\[|\\\]|\$/g, '');
    const latexRegex = /(\\\(|\\\[|\$\$)([\s\S]+?)(\\\)|\\\]|\$\$)/g;
    let result = '';
    let lastIndex = 0;
    text.replace(latexRegex, (match, openDelim, latexContent, closeDelim, offset) => {
        result += text.substring(lastIndex, offset);
        let speakableMath = MathLive.convertLatexToSpeakableText(latexContent, {
            textToSpeechRules: 'sre', textToSpeechRulesOptions: { domain: 'mathspeak', ruleset: 'mathspeak-brief' }
        });
        speakableMath = speakableMath
            .replace(/\bopen paren(thesis)?\b/gi, '')
            .replace(/\bclosed? paren(thesis)?\b/gi, '')
            .replace(/\bopen fraction\b/gi, '')
            .replace(/\bend fraction\b/gi, '')
            .replace(/\bstart fraction\b/gi, '')
            .replace(/\bfraction\s+(start|end|open|close)\b/gi, '')
            .replace(/\bsubscript\b/gi, '')
            .replace(/\bsuperscript\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
        result += ` ${speakableMath} `;
        lastIndex = offset + match.length;
    });
    if (lastIndex < text.length) { result += text.substring(lastIndex); }
    return result.replace(/\*\*(.+?)\*\*/g, '$1').replace(/_(.+?)_/g, '$1').replace(/`(.+?)`/g, '$1').replace(/\\\(|\\\)|\\\[|\\\]|\$/g, '');
}

/**
 * Display a temporary toast notification
 */
export function showToast(message, duration = 3000) {
    const toast = document.createElement("div");
    toast.className = "toast-message";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("visible"), 10);
    setTimeout(() => {
        toast.classList.remove("visible");
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Trigger confetti animation (lazy-loads library if needed)
 */
export function triggerConfetti() {
    if (typeof confetti === 'function') {
        confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 },
            zIndex: 9999
        });
    }
}

# Streak Tracking Integration Guide

## Problem
The streak counter can unfairly break when the AI incorrectly evaluates a student's answer as wrong (false negative). This damages student motivation and trust in the system.

## Solution
**Smart Streak Tracking** - Only track streaks when the AI explicitly and confidently signals problem correctness.

## Backend Integration (Optional)

To enable smart streak tracking, add `problemResult` to your chat API response:

```javascript
// In routes/chat.js, when sending response back to client:
res.json({
    text: aiResponseText,
    userXp: user.xpForCurrentLevel,
    userLevel: user.level,
    xpNeeded: user.xpForNextLevel,
    specialXpAwarded: xpMessage,
    voiceId: tutorVoice,
    newlyUnlockedTutors: newlyUnlockedTutors,
    drawingSequence: drawingCommands,

    // NEW: Add problem result for streak tracking
    problemResult: determineProblemResult(aiResponse, userMessage)
});
```

### Problem Result Values

```javascript
function determineProblemResult(aiResponse, userMessage) {
    // Only return a result for clear problem-solving exchanges
    const isProblemSolving = checkIfProblemSolving(userMessage, aiResponse);
    if (!isProblemSolving) {
        return undefined; // No streak tracking for general conversation
    }

    // Check for explicit correctness indicators
    if (aiResponse.includes('Correct!') ||
        aiResponse.includes('That\'s right') ||
        aiResponse.includes('Perfect!') ||
        aiResponse.includes('✓')) {
        return 'correct'; // Increment streak
    }

    // Check for explicit incorrectness
    if (aiResponse.includes('Not quite') ||
        aiResponse.includes('That\'s not correct') ||
        aiResponse.includes('Try again') ||
        aiResponse.includes('✗')) {
        return 'incorrect'; // Break streak (with warning)
    }

    // For ambiguous cases (partially correct, close, etc.)
    return 'partial'; // Don't affect streak either way
}
```

### AI Prompt Instructions

Add to your system prompt:

```
When evaluating student answers:
- For CORRECT answers, include explicit positive feedback: "Correct!", "That's right!", "Perfect!"
- For INCORRECT answers, include clear correction: "Not quite", "That's not correct", "Try again"
- For PARTIAL credit or ambiguous work, avoid definitive language
- Only give definitive feedback when you're 100% confident

This helps the streak counter accurately track student progress.
```

## Frontend Behavior

**Without `problemResult`:**
- Streak counter won't appear (no tracking)
- Students can still earn XP and badges normally

**With `problemResult`:**
- `'correct'` → Increments streak, shows fire animation
- `'incorrect'` → Breaks streak with red flash warning
- `'partial'` or `undefined` → No change to streak

## Safety Features

1. **Opt-in tracking** - Requires explicit backend signal
2. **Visual warning** - Red flash before breaking streak
3. **Restore function** - `window.restoreStreak(n)` available in console for manual correction
4. **Ambiguity handling** - Unclear responses don't affect streak

## Future Enhancements

- [ ] Add "Challenge this" button when streak breaks
- [ ] AI self-correction if it realizes it misjudged
- [ ] Streak insurance (save streak 1x per session)
- [ ] Confidence scoring (only break on high-confidence wrong)

## Testing

```javascript
// Test streak increment
fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '5 + 3 = 8' })
});
// Response should include: problemResult: 'correct'

// Test streak break
fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '5 + 3 = 9' })
});
// Response should include: problemResult: 'incorrect'

// Test ambiguous (no tracking)
fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Can you explain fractions?' })
});
// Response should NOT include problemResult (or undefined)
```

## Manual Override

If a student's streak was unfairly broken:

```javascript
// In browser console or through admin panel:
window.restoreStreak(5); // Restore streak to 5
```

This shows a notification "🔥 Streak Restored!" and reinstates the counter.

# Chat-Board AI Integration Guide

## Philosophy

**THE RULE YOU BUILD AROUND EVERYTHING:**
The board is the conversation. The chat is just the air between sentences.

If a student is reading more than watching, the UX is wrong.

---

## Core Principle

```
If the board disappeared and the lesson still worked,
you built a chatbot, not a tutor.
```

The chat exists to:
- **Nudge**
- **Invite**
- **Reassure**

The board exists to:
- **Teach**
- **Think**
- **Struggle**

---

## AI Behavior Rules

### 1. The Default State: Silent Writing

Most of the time, the AI should **not** be typing full sentences.

It should:
- Write
- Circle
- Pause
- Point
- Stop

**Just like a human teacher at the board.**

Example flow:
```javascript
// AI writes: 3x - 7 = 11
await whiteboard.aiWritePartialStep('3x - 7 = 11', 100, 100);

// Circles -7
await whiteboard.highlightObject(equationId, '#12B3B3', 2000);

// Draws arrow
await whiteboard.aiDrawArrowToBlank(equationId, "Your turn");

// Pauses (silence is teaching)
// NO CHAT MESSAGE NEEDED
```

### 2. Micro-Chat, Not Paragraph Chat

The chat exists, but it's **restrained and minimal**.

Think:
- **One line**
- **One thought**
- **One purpose**

✅ **Good Examples:**
```
"Your move."
"What cancels this?"
"Try it on the right side."
"Pause. Look here."
```

❌ **Bad Examples:**
```
"Great! Now let's work on solving for x. First, we need to isolate the variable by adding 7 to both sides of the equation. This will help us get rid of the -7 on the left side..."
```

**Rule:** If the AI needs more than one sentence, it probably should be writing instead.

---

## 3. Spatial Anchoring (CRITICAL)

**Every chat message must be anchored to the board.**

Visually:
- Chat bubble points to a specific object or region
- Light highlight appears where the message refers

This prevents the classic:
> "What is 'this' referring to?"

### Implementation

When creating a chat message that references board content, use the `[BOARD_REF:objectId]` marker:

```javascript
// Server-side AI response
{
    "message": "Check this step. [BOARD_REF:eq_2]",
    "boardContext": {
        "targetObjectId": "eq_2",
        "type": "error"
    }
}
```

The client-side will:
1. Highlight the referenced object on the board
2. Create a visual pointer from chat to board
3. Make the message clickable to re-highlight

### Anchor Types

| Type | Color | Use Case |
|------|-------|----------|
| `teacher` | `#12B3B3` (teal) | AI teaching/showing |
| `student` | `#3b82f6` (blue) | Student work reference |
| `error` | `#ff6b6b` (red) | Mistake to correct |
| `hint` | `#fbbf24` (amber) | Gentle guidance |

**If the message can't point, it shouldn't exist.**

---

## 4. Turn-Based Interaction

The system enforces turn-taking.

### Teaching Sequence

```javascript
// 1. AI writes on board
whiteboard.setBoardMode('teacher');
await whiteboard.aiWritePartialStep('3x - 7 = 11', 100, 100);

// 2. AI pauses (automatic 1500ms)
// NO CHAT MESSAGE YET

// 3. AI invites student
whiteboard.setBoardMode('student'); // This auto-minimizes chat
chatMessage("Your turn."); // Micro-chat appears

// 4. Student writes
// AI stays silent, board mode is 'student'

// 5. Student commits (or stalls)
// AI responds visually first
```

### Preventing Chaos

This keeps the student from treating the chat like Google search:
- **During teacher mode:** Student drawing is blocked
- **During student mode:** AI stays silent unless student asks
- **Chat minimizes** when board is active

---

## 5. Physical Layout

Layout is managed automatically by `ChatBoardController`:

- **Board teaching (teacher mode):**
  - Board: ~70% vertical space
  - Chat: ~30%, auto-minimized
  - Chat opacity: 0.7 (de-emphasized)

- **Student working (student mode):**
  - Chat expands to normal size
  - Gentle pulse animation to invite input
  - Opacity: 1.0

- **No constant blinking. No dopamine abuse.**

---

## 6. Error Handling: Board First, Chat Second

**Never explain an error in chat first.**

Correct sequence:

```javascript
// 1. Highlight mistake visually
await whiteboard.highlightObject(mistakeId, '#ff6b6b', 2000);

// 2. Pause (1500ms - silence is teaching)
await sleep(1500);

// 3. Micro-chat with spatial anchor
chatMessage("Check this move. [BOARD_REF:${mistakeId}]", {
    targetObjectId: mistakeId,
    type: 'error'
});

// 4. Only explain if student asks or stalls
// Wait for student response first
```

This preserves **student dignity and agency**.

---

## 7. When the Chat Box Expands (Rare, Intentional)

The chat box only "wakes up" for:
- **Concept checks**
- **Reflection**
- **Strategy explanations**
- **Emotional reassurance**

Examples:
```
"Why did that move work?"
"Which step felt weird?"
"Want to see another approach?"
```

These happen **between board phases**, not during writing.

---

## 8. The Big Mistake to Avoid

**Do not let students ask:**
> "What's the next step?"

That's a design failure.

### Prevention

The `ChatBoardController` blocks shortcut-seeking patterns:
- "What's the next step?"
- "Tell me the answer"
- "Just give me..."
- "How do I solve this?"

Instead, redirect:
```javascript
{
    "message": "Try working through it on the board. I'll guide you step by step.",
    "boardAction": "highlight_current_step"
}
```

Instead:
- **AI forces interaction on the board**
- **Chat nudges, never solves**

---

## System Prompt Integration

Add this to the AI's system prompt:

```
# CHAT-BOARD INTERACTION RULES

## Core Principle
The whiteboard IS the conversation. Chat messages are minimal air between sentences.
If the student is reading more than watching, the UX is failing.

## Chat Message Constraints
- Maximum length: 100 characters
- One line, one thought, one purpose
- Examples: "Your turn.", "What cancels this?", "Check that step."
- NO essays. NO step-by-step novels. NO paragraphs.

## When to Use Chat vs Board
1. **Teaching/Showing**: BOARD (write, circle, arrow)
2. **Hints**: BOARD first (visual), then micro-chat if needed
3. **Errors**: BOARD (highlight, circle), then micro-chat: "Check this move."
4. **Invitations**: Micro-chat after board action: "Your turn."
5. **Concept checks**: Chat (between board phases)
6. **Reflection**: Chat (after problem complete)

## Spatial Anchoring Required
Every chat message MUST reference something specific on the board.
Use [BOARD_REF:objectId] to link messages to board objects.
Examples:
- "Check that step. [BOARD_REF:eq_2]"
- "What cancels this? [BOARD_REF:eq_1]"

## Turn-Based Rules
1. AI writes on board → pauses → "Your turn" → waits
2. Student writes → AI stays silent → Student commits
3. AI responds visually first, chat second
4. No interrupting student's board work

## Error Handling Sequence
1. Highlight mistake visually on board
2. Pause (silence is teaching)
3. Micro-chat: "Check this move."
4. Only explain if student asks or stalls

## Forbidden Patterns
- Never answer "What's the next step?" directly
- Never solve in chat what should be shown on board
- Never send multi-paragraph explanations
- Never use chat when board would be clearer

## Default State
Most of the time: Silent writing. No narration. The board speaks.
```

---

## Example Teaching Sequence (Full)

### Algebra Problem: Solve 3x - 7 = 11

```javascript
// 1. AI writes problem on board (teacher mode, chat minimized)
whiteboard.setBoardMode('teacher');
const eqId = await whiteboard.createSemanticEquation('3x - 7 = 11', 100, 100);
await whiteboard.aiWritePartialStep('3x - 7 = 11', 100, 100, true);

// 2. Pause (1500ms automatic)
// NO CHAT MESSAGE

// 3. AI circles the -7
await whiteboard.highlightObject(eqId, '#12B3B3', 1500);

// 4. AI draws arrow to invite student work
await whiteboard.aiDrawArrowToBlank(eqId);
// This automatically:
// - Sets board mode to 'student'
// - Expands chat
// - Adds "Your turn" text on board

// 5. Micro-chat appears
chatMessage("What cancels this? [BOARD_REF:" + eqId + "]", {
    targetObjectId: eqId,
    type: 'hint'
});

// 6. Student writes: +7 on both sides
// Board mode is 'student', AI stays silent

// 7. Student makes mistake (writes wrong answer)
// AI detects error

// 8. AI highlights error (visual first)
whiteboard.setBoardMode('teacher');
await whiteboard.highlightObject(studentWorkId, '#ff6b6b', 2000);

// 9. Pause (silence is teaching)
await sleep(1500);

// 10. Micro-chat (minimal)
chatMessage("Check this move. [BOARD_REF:" + studentWorkId + "]", {
    targetObjectId: studentWorkId,
    type: 'error'
});

// 11. Student asks: "What did I do wrong?"
// Now AI can explain (student invited it)

// 12. AI explains with board demonstration
whiteboard.setBoardMode('teacher');
await whiteboard.aiCircleWithQuestion(studentWorkId, "Look at the sign");
chatMessage("The -7 needs +7, not -7.");

// 13. Student tries again
whiteboard.setBoardMode('student');
```

---

## Client-Side API Reference

### ChatBoardController Methods

```javascript
// Get the global controller
const controller = window.chatBoardController;

// Check if AI should use board or chat
const medium = controller.getPreferredMedium({
    messageType: 'error',
    hasVisualElement: true,
    isError: true,
    needsExplanation: false
});
// Returns: 'board' or 'chat'

// Validate student message (block shortcuts)
const validation = controller.validateStudentMessage("What's the next step?");
// Returns: { valid: false, redirectMessage: "Try working through it on the board..." }

// Create spatial anchor
controller.createSpatialAnchor(messageId, targetObjectId, 'hint');

// Manually minimize/expand chat
controller.minimizeChat(); // Board is teaching
controller.expandChat();   // Student interaction

// Get micro-chat templates
const templates = controller.getMicroChatTemplates();
// Returns: { invite: [...], hint: [...], pause: [...], ... }
```

### Enhanced Message Sending

```javascript
// Server sends message with board context
{
    "message": "Check that step. [BOARD_REF:eq_2]",
    "boardContext": {
        "targetObjectId": "eq_2",
        "type": "error"
    }
}

// Client enhances message automatically
const messageElement = appendMessage(data.message, 'ai');
chatBoardController.enhanceChatMessage(messageElement, 'ai', data.boardContext);
```

---

## Micro-Chat Templates Library

Use these as examples for AI responses:

### Invite Templates
```
"Your turn."
"What comes next?"
"Try it on the board."
"Your move."
"Show me on the board."
```

### Hint Templates
```
"Look at the sign."
"What cancels this?"
"Check that step."
"Notice the pattern?"
"What happens to both sides?"
```

### Pause Templates
```
"Pause."
"See it?"
"Watch this."
"One sec."
"Hold on."
```

### Redirect Templates
```
"Look here."
"Check the board."
"Try again here."
"Different approach?"
"What if we..."
```

### Praise Templates
```
"Nice."
"Good thinking."
"You got it."
"Exactly."
"Perfect."
"Smart move."
```

### Error Templates
```
"Check this move."
"Not quite."
"Look again."
"Close, but..."
"Almost there."
"Hmm..."
```

### Concept Check Templates (longer allowed)
```
"Why did that work?"
"What pattern do you see?"
"Which step felt hardest?"
"Want another approach?"
"Ready for a tougher one?"
```

---

## Implementation Checklist

- [x] ChatBoardController class created
- [x] Auto-minimize chat during board teaching
- [x] Turn-based interaction enforcement
- [x] Spatial anchoring system
- [x] Micro-chat validation (100 char limit)
- [x] Shortcut-seeking message blocking
- [x] Board mode listeners
- [x] Visual pointer creation
- [x] System prompt integration guide
- [ ] AI backend integration (server-side)
- [ ] BOARD_REF parsing in chat messages
- [ ] Voice integration (optional, minimal)
- [ ] Advanced spatial pointer positioning

---

## Testing Scenarios

### Scenario 1: Simple Equation
**Goal:** AI teaches solving 2x + 5 = 13

Expected behavior:
1. AI writes equation (board, chat minimized)
2. AI pauses (no chat)
3. AI circles +5 (board)
4. AI says "Your turn." (micro-chat)
5. Student writes (AI silent)

**Test:** Chat should be <30% screen height during steps 1-3.

### Scenario 2: Student Mistake
**Goal:** Student writes wrong step

Expected behavior:
1. AI highlights error (board, visual)
2. AI pauses 1.5s (silence)
3. AI says "Check this move." (micro-chat with anchor)
4. Student clicks chat message → board highlights again

**Test:** No explanation in chat. Only after student asks.

### Scenario 3: Shortcut Seeking
**Goal:** Student types "What's the next step?"

Expected behavior:
1. Message is blocked
2. Auto-redirect: "Try working through it on the board. I'll guide you step by step."
3. Board stays in student mode

**Test:** Original message never sent to AI.

---

## The Hard Truth

A whiteboard is not a feature. It's a teaching philosophy encoded in UI.

If you implement this system correctly:
- Students will **watch more than read**
- The board will feel like **sitting next to a great teacher**
- Chat will be **essential but minimal**
- The product will feel **premium, not like every other AI with a canvas taped on**

**This is where Mathmatix AI wins.**

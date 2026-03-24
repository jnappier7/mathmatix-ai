# 🧠 Intelligent Whiteboard - AI Integration Guide

## The New Paradigm

The whiteboard is **no longer a tool** - it's a **cognitive workspace** with AI presence and teaching intelligence.

## Core Philosophy

> "A real teacher doesn't say 'you can use the board if you want.' They walk to it and start writing."

The AI should use the whiteboard **strategically**, not optionally.

---

## Three-Mode System

### 1. 🧠 Teacher Mode (AI-Driven)
```javascript
whiteboard.setBoardMode('teacher');
```
- AI controls the board
- Student drawing is disabled
- Use when: AI is explaining, demonstrating, teaching

### 2. ✍️ Student Mode (Student Writes Freely)
```javascript
whiteboard.setBoardMode('student');
```
- Full student control
- AI observes silently
- Use when: Student is working, practicing, solving

### 3. 🤝 Collaborative Mode (Turn-Taking)
```javascript
whiteboard.setBoardMode('collaborative');
```
- Both can interact
- Natural back-and-forth
- Use when: Working together, reviewing

---

## AI Teaching Methods

### Write with Intentional Pauses
```javascript
// AI writes partial step, then STOPS
const step1 = await whiteboard.aiWritePartialStep('2x + 5 = 17', 50, 100);

// Silence is teaching - the pause is intentional
// Student processes what they see

// Then AI invites student input
await whiteboard.aiDrawArrowToBlank(step1Id, "What's our first move?");
```

### Visual Error Correction (Not Verbal Shaming)
```javascript
// NEVER: "You made a mistake in step 3"
// INSTEAD: Gentle visual indication

whiteboard.aiCircleWithQuestion(step3Id, "Let's check this step together");
// or just
whiteboard.highlightObject(step3Id, '#ff6b6b', 2000);
```

### Semantic Objects (Smart Math)
```javascript
// Create equation that KNOWS it's an equation
const eqId = whiteboard.createSemanticEquation('2x + 5 = 17', 50, 100, {
    handwritten: true,  // Uses Indie Flower font
    fontSize: 24,
    color: '#2d3748'
});

// Later: highlight, move, reference it
whiteboard.highlightObject(eqId);
whiteboard.moveToRegion(eqId, 'answer');  // Move to answer box when solved
```

### Spatial Intelligence
```javascript
// Board auto-organizes itself:
// - Left 60%: Working area
// - Right 40% top: Scratch space
// - Top strip: Given information
// - Bottom right: Answer box (locked until earned)

// Place given info at top
const givenEq = whiteboard.createSemanticEquation('Given: 5x + 2y = 10', 20, 20);

// Work in main area
const step1 = whiteboard.createSemanticEquation('Step 1: Isolate x', 50, 100);

// When solved, move to answer box
whiteboard.moveToRegion(step1Id, 'answer');
```

---

## Strategic Triggering

### When to Auto-Open Whiteboard
```javascript
// Good triggers:
if (message.includes('graph') || message.includes('plot')) {
    whiteboard.show();
    whiteboard.setBoardMode('teacher');
}

if (studentStuckCount >= 2 && topic === 'algebra') {
    whiteboard.show();
    await whiteboard.aiWritePartialStep('Let me show you...', 50, 50);
}

// BAD triggers (don't overuse):
// - Simple arithmetic (2+2=4)
// - Conceptual discussion only
// - Student is already engaged verbally
```

### When to Stay Closed
- Simple calculations
- Pure conceptual discussions
- Student is confident and progressing
- First explanation attempt (try text first)

---

## Example Teaching Sequence

```javascript
// Solving: 2x + 5 = 17

// 1. AI takes control
whiteboard.show();
whiteboard.setBoardMode('teacher');

// 2. AI writes the equation
const eq = await whiteboard.aiWritePartialStep('2x + 5 = 17', 50, 100);

// 3. AI circles the +5 (visual focus)
const highlight = new fabric.Circle({...});  // Circle around +5
whiteboard.canvas.add(highlight);

// 4. AI draws arrow to blank space
await whiteboard.aiDrawArrowToBlank(eqId, "What should we do with this?");

// 5. Mode switches to STUDENT - they write
// Student writes: "Subtract 5 from both sides"

// 6. AI observes, then responds visually
whiteboard.setBoardMode('teacher');
await whiteboard.aiWritePartialStep('2x = 12', 50, 150);

// 7. Invite them to finish
await whiteboard.aiDrawArrowToBlank(newEqId, "Your turn - solve for x");

// 8. Student solves, AI moves answer to answer box
whiteboard.moveToRegion(finalAnswerId, 'answer');
```

---

## System Prompt Integration

Add to AI system prompt:

```
You have access to an intelligent whiteboard with these methods:

**Mode Control:**
- whiteboard.setBoardMode('teacher' | 'student' | 'collaborative')

**AI Teaching:**
- whiteboard.aiWritePartialStep(text, x, y, pauseAfter=true)
- whiteboard.aiDrawArrowToBlank(objectId, message)
- whiteboard.aiCircleWithQuestion(objectId, message)

**Semantic Objects:**
- whiteboard.createSemanticEquation(latex, x, y, options)
- whiteboard.highlightObject(objectId, color, duration)

**Spatial Organization:**
- whiteboard.moveToRegion(objectId, 'working' | 'scratch' | 'given' | 'answer')

**Strategic Rules:**
1. Use the board for: multi-step algebra, graphs, geometry, when stuck 2x
2. DON'T use for: simple arithmetic, pure concept discussion
3. Write with pauses - silence is teaching
4. Visual-first error correction (circles, highlights, not harsh words)
5. Invite student interaction with arrows and "Your turn" prompts

**Teaching Flow:**
1. setBoardMode('teacher') - You take control
2. aiWritePartialStep() - Write partial work, STOP
3. Pause - Let them process (1-2 seconds)
4. aiDrawArrowToBlank() - Invite their input
5. setBoardMode('student') - Give them control
6. Observe their work
7. Respond visually first (highlight, circle, arrow)
8. Return to teacher mode only when needed

Remember: The board is a shared thinking space, not a lecture slide.
```

---

## Timeline & Replay (Foundation Built)

```javascript
// All actions are recorded with timestamps
whiteboard.timeline = [
    { timestamp: 1234567890, action: 'add', object: {...}, mode: 'teacher' },
    { timestamp: 1234567895, action: 'modify', object: {...}, mode: 'student' },
    ...
];

// Future: Scrub back in time
// whiteboard.replayFromTime(timestamp);
// whiteboard.showAIThinking();  // vs whiteboard.showFinalVersion();
```

---

## Next Phases

**Phase 2 (Soon):**
- Animated AI cursor (ghost presence)
- Region overlay toggle
- Replay UI controls
- Handwriting animation improvements

**Phase 3 (Later):**
- Multi-path solutions ("Show me another way")
- Step highlighting system
- Drag-to-rearrange terms
- "Replay how we got here"

---

## Key Insights

1. **Pacing > Correctness**: Students trust pacing more than instant answers
2. **Visual > Verbal**: Circle with "?" beats "You made a mistake"
3. **Partial > Complete**: Write half, pause, invite
4. **Silence = Teaching**: Intentional pauses matter
5. **Mode Matters**: Enforce who controls the board at each moment

---

## Anti-Patterns to Avoid

❌ **Don't**: Instantly fill the board with complete solutions
✅ **Do**: Write partial steps, pause, invite interaction

❌ **Don't**: Say "You made a mistake in step 3"
✅ **Do**: Circle step 3 with a question mark

❌ **Don't**: Use the board for everything
✅ **Do**: Use it strategically (graphs, stuck students, multi-step work)

❌ **Don't**: Type math in Arial
✅ **Do**: Use handwritten font (Indie Flower) with intentional pacing

❌ **Don't**: Let students flounder in teacher mode
✅ **Do**: Switch to student mode when inviting their input

---

This is the foundation for a whiteboard that feels like sitting next to a great teacher.

Not MS Paint.  
A cognitive workspace.

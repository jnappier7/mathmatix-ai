# Voice Chat & Intelligent Whiteboard Features

Complete documentation for the GPT-style voice chat and board-first teaching system.

---

## 🎙️ Voice Chat System

### Overview
Real-time conversational voice chat inspired by OpenAI's GPT live voice mode, integrated with the intelligent whiteboard.

### Features

#### **Speech-to-Text**
- OpenAI Whisper for accurate transcription
- Voice Activity Detection (VAD) using Web Audio API
- Automatic silence detection (500ms threshold)
- Noise suppression and echo cancellation

#### **Text-to-Speech**
- ElevenLabs TTS with tutor's assigned voice
- Maintains voice consistency across all audio features
- Natural, conversational speech output
- MP3 audio storage with automatic cleanup

#### **Push-to-Talk**
- **Click-to-talk**: Click orb to start/stop recording
- **Hold spacebar**: Press and hold spacebar for push-to-talk mode
- Hands-free operation with VAD

#### **Board Integration**
Voice commands can control the whiteboard:
- `[WRITE:x,y,text]` - Write equations at coordinates
- `[CIRCLE:objectId]` - Circle specific objects
- `[ARROW:fromId,toX,toY]` - Draw arrows
- `[HIGHLIGHT:objectId,color]` - Highlight objects
- `[CLEAR]` - Clear the board

### UI Components

#### **Voice Orb**
- Floating purple button (bottom-right corner)
- Four animated states:
  - 🟣 **Idle**: Purple gradient, ready to start
  - 🔵 **Listening**: Teal with pulsing animation
  - 🟡 **Thinking**: Yellow rotating animation
  - 🟢 **Speaking**: Green scaling animation

#### **Status Text**
- "Click to start voice chat" (idle)
- "Listening..." (recording)
- "Thinking..." (processing)
- "Speaking..." (AI responding)

### User Preferences

**Settings → Voice Chat Orb**
- Toggle to show/hide the voice orb
- Default: Enabled
- Persists across sessions

### Technical Stack

**Frontend** (`public/js/voice-controller.js`):
- MediaRecorder API for audio capture
- Web Audio API for VAD analysis
- Real-time frequency analysis (-50 dB threshold)
- Automatic hands-free mode disabling

**Backend** (`routes/voice.js`):
- Whisper transcription endpoint
- Claude 3.5 Sonnet for responses
- ElevenLabs TTS integration
- Board action parsing
- Audio file management

---

## ✍️ Intelligent Whiteboard System

### Overview
Board-first teaching philosophy where the whiteboard is the primary medium of instruction, not the chat.

### Core Philosophy

> "The board is the conversation. The chat is just the air between sentences."

**Key Rules:**
- Students should be **watching more than reading**
- Chat messages limited to **100 characters**
- Visual teaching takes priority over text
- AI writes naturally, like a human teacher

### Features

#### **1. Natural Handwriting**
- Character-by-character writing animation
- Position jitter (±1.5px horizontal, ±1.0px vertical)
- Rotation variance (±2 degrees)
- Pressure simulation (±8% size variation)
- Opacity variation (95-100%)

**Timing Variations:**
- Base speed: 50ms per character (±20ms)
- Acceleration for first 15% of text
- Deceleration for last 15% of text
- Hesitation pauses (15% chance, 150ms)
- Word spacing (2x character speed)
- Punctuation pauses (extra delay)

**Personality Presets:**
- **Careful**: Slow, steady, frequent pauses
- **Confident**: Fast, bold, minimal hesitation
- **Excited**: Very fast, energetic
- **Thoughtful**: Slow, deliberate, many pauses

#### **2. Ghost Cursor**
AI's "hand" visible on screen:
- SVG pen cursor with "AI" label
- Smooth cubic-bezier movement
- Trailing dots effect for motion
- Pulsing glow animation
- Follows writing position

#### **3. Visual Pointer Lines**
Curved SVG lines connecting chat → board objects:
- Color-coded by intent:
  - 🔵 Teacher guidance: `#12B3B3`
  - 🔴 Error correction: `#ff6b6b`
  - 🟡 Hints: `#fbbf24`
- Animated arrowheads
- Auto-fade after 3 seconds
- Quadratic bezier curves

#### **4. Spatial Anchoring**
Every chat message references specific board objects:
- `[BOARD_REF:objectId]` syntax
- Highlights referenced objects
- Creates visual connections
- Solves "what is 'this'?" problem

#### **5. Board Regions**
Four organized teaching zones:
- **Problem Area**: Main workspace (top)
- **Work Zone**: Step-by-step solving (middle)
- **Notes**: Side notes and hints (right)
- **Solution**: Final answer (bottom)

**Region Overlay Toggle:**
- Button in toolbar shows/hides regions
- Pulsing borders for visibility
- Labeled sections
- Helps students understand organization

#### **6. Micro-Chat System**
- 100-character limit enforced
- Templates for common responses:
  - "Your turn." (10 chars)
  - "Check that step." (16 chars)
  - "What cancels this?" (19 chars)
- Focus on visual teaching
- Chat auto-minimizes during lessons (30% height)

#### **7. Turn-Based Interaction**
Three teaching modes:
- **Teacher Mode**: AI leads, writes on board
- **Student Mode**: Student works, AI observes
- **Collaborative**: Both interact freely

Event listeners prevent conflicts during turns.

### Board Objects

**Semantic Object System:**
Each whiteboard element is tracked with metadata:
```javascript
{
  id: 'eq_1',
  type: 'equation',
  latex: 'x^2 + 5x + 6',
  region: 'problem',
  fabricObject: [Fabric.js object],
  created: Date,
  modified: Date
}
```

**Object Types:**
- Equations (LaTeX)
- Graphs (function plots)
- Text (notes, labels)
- Shapes (circles, arrows, boxes)
- Hand-drawn annotations

### Technical Implementation

**Files:**
- `public/js/whiteboard.js` - Core whiteboard engine
- `public/js/whiteboard-phase2.js` - Ghost cursor & pointers
- `public/js/whiteboard-handwriting.js` - Natural writing
- `public/js/chat-board-integration.js` - Chat controller (600+ lines)
- `utils/chatBoardParser.js` - Backend parsing (300+ lines)

**Backend Integration:**
- `utils/prompt.js` - AI system prompt with board rules
- `routes/chat.js` - Process board references
- Board context sent with every AI request

---

## 🔄 Integration Points

### Voice ↔ Board
1. User speaks → Whisper transcribes
2. Transcription + board context → Claude
3. Claude responds with text + board actions
4. Board actions executed in real-time
5. Response synthesized with tutor voice
6. Chat message spatially anchored to board

### Chat ↔ Board
1. AI response includes `[BOARD_REF:objectId]`
2. Backend parses and extracts references
3. Frontend creates visual pointers
4. Objects highlighted with color coding
5. Spatial anchors visible for 3 seconds

### Hands-Free Mode Compatibility
- Voice orb disables old hands-free dictation
- Individual message playback still works
- All audio uses same tutor voice
- No microphone conflicts

---

## 🎨 UI/UX Design

### Visual Hierarchy
1. **Whiteboard**: Primary (70% screen)
2. **Chat**: Secondary (30% screen, minimized during teaching)
3. **Voice Orb**: Tertiary (floating button)

### Color Coding
- **Teacher actions**: Teal (`#12B3B3`)
- **Student actions**: Blue (`#3b82f6`)
- **Errors**: Red (`#ff6b6b`)
- **Hints**: Yellow (`#fbbf24`)
- **Voice orb**: Purple gradient

### Animations
- Smooth transitions (cubic-bezier easing)
- Natural motion (no robotic snapping)
- Attention-grabbing without distraction
- Performance-optimized (60fps)

---

## 🔐 Security & Performance

### CSRF Protection
- All forms use `csrfFetch()` wrapper
- Double-submit cookie pattern
- Validated on all POST/PUT/DELETE requests

### Rate Limiting
- Voice API: aiEndpointLimiter (prevents abuse)
- Authentication: 5 attempts per 15 minutes
- General API: 120 requests per 15 minutes

### Audio Management
- Temporary files auto-cleanup
- Keeps last 100 voice recordings
- Automatic file size management
- Secure file naming (crypto random)

### Performance Optimization
- Audio compressed to MP3
- Lazy loading for whiteboard objects
- Request debouncing
- Efficient canvas rendering

---

## 📱 Browser Support

### Required Features
- MediaRecorder API (audio capture)
- Web Audio API (VAD analysis)
- Fetch API with CSRF tokens
- Canvas API (whiteboard)
- SVG animations (pointers)

### Tested Browsers
- ✅ Chrome 90+ (full support)
- ✅ Edge 90+ (full support)
- ✅ Safari 14+ (full support)
- ✅ Firefox 88+ (full support)

### Graceful Degradation
- No MediaRecorder → Voice disabled
- No Web Audio → VAD disabled (manual stop only)
- No Fabric.js → Basic whiteboard only

---

## 🚀 User Flow Examples

### **Example 1: Voice Math Problem**
1. User clicks voice orb
2. "Can you help me factor x² + 5x + 6?"
3. Whisper transcribes → sent to Claude
4. Claude responds:
   - Text: "Let's factor this together."
   - Action: `[WRITE:100,100,x² + 5x + 6]`
5. Handwriting engine writes equation
6. Ghost cursor shows AI's "hand"
7. ElevenLabs speaks: "Let's factor this together"
8. Visual pointer connects chat → equation

### **Example 2: Error Correction**
1. Student writes wrong step on board
2. AI detects error
3. AI draws red circle around mistake
4. Visual pointer appears (red, error type)
5. Micro-chat: "Check that step." (16 chars)
6. Student focuses on circled area
7. No need to read lengthy explanation

### **Example 3: Turn-Based Teaching**
1. AI mode: **Teacher**
2. AI writes: "Try this: 3x + 5 = 14"
3. Chat: "Your turn." (minimized to 30%)
4. Mode switches to: **Student**
5. Student solves on board
6. AI watches, doesn't interrupt
7. When done, mode back to **Collaborative**

---

## 🛠️ Configuration

### Environment Variables
```bash
OPENAI_API_KEY=sk-...          # Whisper transcription
ELEVENLABS_API_KEY=...         # TTS with tutor voices
ANTHROPIC_API_KEY=...          # Claude for responses
```

### User Preferences (Database)
```javascript
preferences: {
  handsFreeModeEnabled: Boolean,    // Old hands-free dictation
  autoplayTtsHandsFree: Boolean,    // Auto-play in hands-free
  voiceChatEnabled: Boolean,        // Show/hide voice orb
  typingDelayMs: Number,            // Ghost timer delay
  typeOnWpm: Number,                // Typing animation speed
  theme: String                     // UI theme
}
```

### Tutor Configuration
```javascript
tutors: {
  "mr-nappier": {
    name: "Mr. Nappier",
    voiceId: "2eFQnnNM32GDnZkCfkSm",  // ElevenLabs voice
    personality: "confident",           // Handwriting style
    teachingStyle: "socratic"
  }
  // ... other tutors
}
```

---

## 📊 Monitoring & Logs

### Console Logs
```
🎙️ Voice Controller initializing...
✅ Voice Controller ready
📝 [Voice] Transcription: Can you help me factor...
🤖 [Voice] Generating AI response...
🎤 [Voice] Using tutor voice: 2eFQnnNM32GDnZkCfkSm
🔊 [Voice] Generating speech with tutor voice...
🎨 Executing board actions: [...]
✅ [Voice] Speech generated: /audio/voice/voice_...mp3
```

### Error Handling
- Microphone permission denied → Alert user
- Network errors → Retry with exponential backoff (4x)
- CSRF token missing → Automatic refresh
- Audio playback failure → Show error state
- VAD not supported → Manual stop button only

---

## 🎯 Success Metrics

### User Engagement
- Time spent on whiteboard vs chat
- Voice feature usage rate
- Average voice session length
- Board interaction frequency

### Teaching Effectiveness
- Error correction response time
- Student self-correction rate
- Concept mastery per session
- Spatial anchor click-through rate

### Technical Performance
- Voice transcription accuracy
- TTS generation latency
- Audio file storage efficiency
- Canvas rendering FPS

---

## 🔮 Future Enhancements

### Potential Features
- [ ] Multi-user collaborative whiteboard
- [ ] Voice command customization
- [ ] Offline voice transcription
- [ ] Board templates (graph paper, coordinate planes)
- [ ] Handwriting recognition for student input
- [ ] Voice emotion detection for engagement
- [ ] Real-time translation for multilingual
- [ ] Board recording/playback for review

### Known Limitations
- Voice only works in US (web search limitation)
- ElevenLabs rate limits (API quota)
- Large audio files increase storage
- No mobile-optimized voice UI yet
- Single-user whiteboard (no real-time collab)

---

## 📚 Related Documentation
- [CHAT_BOARD_AI_INTEGRATION.md](./CHAT_BOARD_AI_INTEGRATION.md) - Detailed AI integration guide
- [utils/prompt.js](./utils/prompt.js) - Complete system prompt
- [public/js/voice-controller.js](./public/js/voice-controller.js) - Voice implementation

---

**Last Updated**: January 9, 2026
**Branch**: `claude/audit-stack-ux-XLOeA`
**Status**: ✅ Production Ready

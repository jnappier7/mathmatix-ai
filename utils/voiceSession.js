// utils/voiceSession.js
// Per-WebSocket orchestrator for the streaming voice tutor.
// Owns one Deepgram session, one Cartesia synthesizer per turn,
// one AbortController per turn. Coordinates STT → LLM → TTS with
// interrupt handling and per-turn metrics.

const User = require('../models/user');
const Conversation = require('../models/conversation');
const TUTOR_CONFIG = require('./tutorConfig');
const { generateSystemPrompt } = require('./prompt');
const { callLLM, callLLMStream } = require('./llmGateway');
const { verify: pipelineVerify } = require('./pipeline');
const { checkReadingLevel } = require('./readability');
const sttStream = require('./sttStream');
const ttsStream = require('./ttsStream');
const ttsProvider = require('./ttsProvider');
const metrics = require('./voiceMetrics');
const orchestrator = require('./orchestrator');
const { Dispatcher } = require('./orchestrator/dispatcher');
const { loadOrCreatePlan, resolveCurrentTarget } = require('./tutorPlanManager');
const logger = require('./logger').child({ module: 'voiceSession' });

const VOICE_MODEL = process.env.VOICE_LLM_MODEL || 'gpt-4o-mini';
const HISTORY_DEPTH = 12;

// Active-session registry for multi-tab collision handling.
// Keyed by `${userId}:${mode}` — same user can have one math-steps session
// (immersive page) AND one board-actions session (chat orb) open at the
// same time without colliding. Two of the same mode → newer one wins.
const activeSessions = new Map();

// Idle-STT thresholds. Keeping a Deepgram session open while a student
// walks away from their tab burns money. We close after STT_IDLE_MS of
// no transcript activity and lazy-reopen on the next mic frame.
const STT_IDLE_MS = 30_000;
const STT_IDLE_CHECK_MS = 5_000;

// Streaming voice prompt — natural English first, then tagged math at the
// end. The orchestrator forwards everything before <math> to TTS in real
// time, then parses the JSON inside the tag for the board.
const STREAMING_VOICE_INSTRUCTIONS = `

**STREAMING VOICE MODE — ACTIVE**

You are in a real-time spoken math tutoring session. Format your reply
in TWO parts, in this exact order:

PART 1 — SPOKEN (always present):
- 1-2 sentences of natural English. No LaTeX delimiters. No markdown.
- Say "x squared plus 3x" not "$x^2 + 3x$". Numbers: "two thirds" not "2/3".
- Warm and conversational, like a tutor sitting next to the student.
- Ask ONE follow-up question per turn.

PART 2 — MATH STATE (always present, even on small talk):
After the spoken text, append a single line:
<math>[{"label":"...","latex":"...","explanation":"..."}, ...]</math>

PEDAGOGY (CRITICAL):
- The math array is the cumulative board — only steps the student has
  derived or confirmed. Never include the next step the student hasn't
  worked through yet.
- Wrong answer: do NOT add the wrong step. Repeat the prior steps unchanged.
- Pure small talk: include the most recent prior board state (or [] if
  no math has happened yet this session).

EXAMPLES:

User: "solve 2x minus 4 equals 0"
Sure, let's work through it together! What's the first step to isolate x? <math>[{"label":"Given","latex":"2x - 4 = 0"}]</math>

User: "add 4 to both sides"
Exactly right! Now we have 2x equals 4. What's next? <math>[{"label":"Given","latex":"2x - 4 = 0"},{"label":"Add 4","latex":"2x = 4"}]</math>

User: "multiply by 2" (WRONG)
Hmm, not quite. We have 2 times x. What's the opposite of multiplying by 2? <math>[{"label":"Given","latex":"2x - 4 = 0"},{"label":"Add 4","latex":"2x = 4"}]</math>

REMEMBER: never speak math notation. The LaTeX goes in the math tag only.
Never put system tags or JSON inside the spoken portion.
`;

// Board-actions voice prompt — used by the chat-page orb. Actions are
// inline, scattered through the response (a [WRITE:x,y,text] can sit
// mid-sentence). The orchestrator strips action tags from the TTS stream
// in real time and forwards them to the client as discrete board events.
const BOARD_ACTIONS_VOICE_INSTRUCTIONS = `

**STREAMING VOICE MODE — ACTIVE**

You are in a real-time spoken math tutoring session with a shared
whiteboard. Speak conversationally (1-3 sentences) and use the
whiteboard for any visual math. Whatever you SAY is heard by the
student; whatever you WRITE inline as a tag updates the board.

CRITICAL RULES FOR SPOKEN TEXT:
- Plain English only. No LaTeX delimiters ($, $$, \\(, \\[).
- "x squared plus 3x" not "$x^2 + 3x$".
- Warm, conversational, like a tutor sitting next to the student.
- ONE follow-up question per turn.

BOARD ACTIONS (inline, anywhere in your response):
- [WRITE:x,y,text]              write text at canvas position (x,y)
- [CIRCLE:objectId,message]     circle an existing board object
- [ARROW:fromId,toX,toY,message] draw arrow from a board object
- [HIGHLIGHT:objectId,color]    highlight an object (color = hex)
- [CLEAR]                       clear the board

The student does NOT hear these tags — they're stripped before TTS.
Use [BOARD_REF:objectId] inline to reference an existing object by id
(this is also stripped from spoken text but kept in the chat transcript).

PEDAGOGY (CRITICAL):
- Don't show steps the student hasn't worked through yet.
- Wrong answer: don't add it to the board. Gently guide.
- Never just give the answer — scaffold with hints and parallel problems.

REMEMBER: speak naturally; let the board do the visual work.
`;

class VoiceSession {
    constructor({ ws, user, sessionId, mode }) {
        this.ws = ws;
        this.user = user;                       // populated user doc (lean)
        this.userId = String(user._id);
        this.sessionId = sessionId || `${this.userId}-${Date.now()}`;
        // Three modes:
        //   'math-steps'   — immersive voice-tutor.html, <math>JSON</math> trailer
        //   'board-actions' — chat orb, inline [WRITE:...] tags
        //   'orchestrated' — segment orchestrator path; trades streaming
        //                    LLM TTFA (~250ms -> ~1.5s) for per-segment
        //                    structure, WAIT semantics, and 3-tier interrupts
        this.mode = mode === 'board-actions' ? 'board-actions'
                  : mode === 'orchestrated'  ? 'orchestrated'
                  : 'math-steps';
        this.tutorProfile = TUTOR_CONFIG[user.selectedTutorId || 'default'] || TUTOR_CONFIG['default'];
        this.voiceId = ttsProvider.getVoiceId(this.tutorProfile);
        this.langCode = ({
            English: 'en', Spanish: 'es', Russian: 'ru', Chinese: 'zh',
            Vietnamese: 'vi', Arabic: 'ar', Somali: 'so', French: 'fr', German: 'de',
        })[user.preferredLanguage] || 'en';

        this.history = [];        // {role, content} from Mongo + this session
        this.lastBoardSteps = []; // most recent <math> array (math-steps mode)
        this.boardContext = null; // current whiteboard state (board-actions mode)
        this.systemPrompt = '';

        this.stt = null;
        this.currentTurn = null;
        this.closed = false;

        this._lastPartialAt = 0;
        this._pendingTurnDebounce = null;

        this._bindClient();
    }

    async init() {
        // Multi-tab collision handling: if this user already has a session
        // running in the SAME mode, shut it down. Different modes (e.g.
        // chat orb + immersive page in two tabs) can coexist.
        const registryKey = `${this.userId}:${this.mode}`;
        const existing = activeSessions.get(registryKey);
        if (existing && existing !== this && !existing.closed) {
            logger.info('voice ws: superseding prior session for same user+mode', {
                userId: this.userId, mode: this.mode,
            });
            try { existing.shutdown('superseded_by_new_session'); } catch (_) {}
        }
        activeSessions.set(registryKey, this);

        this.systemPrompt = await generateSystemPrompt(this.user, this.tutorProfile);

        // Load recent conversation for context
        const conv = await Conversation.findOne({ userId: this.user._id })
            .sort({ updatedAt: -1 })
            .select({ messages: { $slice: -HISTORY_DEPTH } })
            .lean();
        this.history = (conv?.messages || [])
            .filter(m => m.content && m.content.trim().length > 0)
            .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

        // Persistent Cartesia pool — one WS per session, context_id per turn.
        // Saves ~50–100ms handshake on every turn vs opening a fresh WS.
        if (this.voiceId && ttsStream.isConfigured()) {
            this.ttsPool = ttsStream.createPool({
                voiceId: this.voiceId,
                language: this.langCode,
            });
        }

        this._send({ type: 'session_ready', sampleRate: 22050, voiceId: this.voiceId });
        this._openStt();
    }

    // ─── WebSocket binding ───────────────────────────────────────────────

    _bindClient() {
        this.ws.on('message', (raw, isBinary) => {
            if (this.closed) return;
            if (isBinary) {
                // Binary frames are PCM s16 16kHz mono mic audio.
                // Lazy-reopen STT if we closed it for idle.
                if (!this.stt || !this.stt.isOpen()) {
                    this._openStt();
                }
                if (this.stt) this.stt.sendFrame(raw);
                return;
            }
            let msg;
            try { msg = JSON.parse(raw.toString('utf8')); } catch (_) { return; }
            this._handleClientMessage(msg).catch(err => {
                logger.error('client message handler', { error: err.message });
            });
        });
        this.ws.on('close', () => this.shutdown('client_close'));
        this.ws.on('error', (err) => {
            logger.warn('client ws error', { userId: this.userId, error: err.message });
        });
    }

    async _handleClientMessage(msg) {
        switch (msg.type) {
            case 'barge_in':
                this._abortCurrentTurn('user_barge_in');
                break;
            case 'text_input':
                if (typeof msg.text === 'string' && msg.text.trim()) {
                    this._startTurn(msg.text.trim(), { source: 'text' });
                }
                break;
            case 'set_board_context':
                // board-actions mode: the chat orb sends current whiteboard
                // state so the AI can reference existing objects by id.
                if (msg.boardContext && typeof msg.boardContext === 'object') {
                    this.boardContext = msg.boardContext;
                }
                break;
            case 'ping':
                this._send({ type: 'pong', t: Date.now() });
                break;
            case 'reset_listening':
                // Client tells us "stop accumulating, drop pending utterance"
                this._cancelPendingDebounce();
                break;
            default:
                // ignore unknown
        }
    }

    // ─── STT lifecycle ───────────────────────────────────────────────────

    _openStt() {
        if (!sttStream.isConfigured()) {
            this._send({ type: 'fatal', message: 'Speech recognition not configured' });
            return;
        }
        if (this.stt && this.stt.isOpen()) return; // already open
        this._lastSttActivity = Date.now();
        this.stt = sttStream.createSession({
            language: this.langCode,
            sampleRate: 16000,
            endpointing: 300,
            utteranceEndMs: 1000,
            onPartial: (text) => { this._lastSttActivity = Date.now(); this._onPartial(text); },
            onFinal: (text) => { this._lastSttActivity = Date.now(); this._onFinal(text); },
            onUtteranceEnd: () => { this._lastSttActivity = Date.now(); this._onUtteranceEnd(); },
            onError: (err) => {
                const detail = err?.message || err?.reason || String(err);
                logger.warn('stt error → telling client to fall back', { userId: this.userId, error: detail });
                // Surface as fatal so the client switches off the streaming
                // pipeline and re-enables the legacy MediaRecorder path.
                this._send({ type: 'fatal', message: `Streaming STT unavailable: ${detail}` });
                this.shutdown('stt_error');
            },
            onClose: () => {
                logger.debug('stt closed', { userId: this.userId });
            },
        });
        // Start (or restart) the idle watchdog
        if (!this._sttIdleTimer) {
            this._sttIdleTimer = setInterval(() => this._checkSttIdle(), STT_IDLE_CHECK_MS);
            this._sttIdleTimer.unref?.();
        }
    }

    _checkSttIdle() {
        if (this.closed) {
            if (this._sttIdleTimer) { clearInterval(this._sttIdleTimer); this._sttIdleTimer = null; }
            return;
        }
        if (!this.stt || !this.stt.isOpen()) return;
        if (this.currentTurn) return;          // never close mid-turn
        const idle = Date.now() - (this._lastSttActivity || 0);
        if (idle < STT_IDLE_MS) return;
        logger.info('closing idle stt to save billing', { userId: this.userId, idleMs: idle });
        try { this.stt.close(); } catch (_) {}
        // Don't null this.stt — sendFrame will see isOpen()===false and lazy-reopen
    }

    _onPartial(text) {
        this._lastPartialAt = Date.now();
        // If AI is currently speaking, partial transcripts on student channel
        // are how the server confirms a barge-in even if the client missed it.
        // Client also sends explicit 'barge_in' on local VAD; this is belt+suspenders.
        if (this.currentTurn && this.currentTurn.status === 'speaking' && text.length > 2) {
            this._abortCurrentTurn('user_barge_in_server_detected');
        }
        this._send({ type: 'transcript_partial', text });
    }

    _accumulatedFinal = '';
    _onFinal(text) {
        // Concatenate "is_final" segments — Deepgram emits multiple finals
        // per utterance (one per phrase). We commit on UtteranceEnd.
        this._accumulatedFinal = this._accumulatedFinal
            ? `${this._accumulatedFinal} ${text}`
            : text;
        this._send({ type: 'transcript_final_segment', text });
    }

    _onUtteranceEnd() {
        const utterance = this._accumulatedFinal.trim();
        this._accumulatedFinal = '';
        if (!utterance) return;
        // If a turn is already in flight (LLM/TTS), a new user utterance
        // is itself a barge-in.
        if (this.currentTurn) {
            this._abortCurrentTurn('user_barge_in');
        }
        this._send({ type: 'transcript_final', text: utterance });
        this._startTurn(utterance, { source: 'voice' });
    }

    _cancelPendingDebounce() {
        if (this._pendingTurnDebounce) {
            clearTimeout(this._pendingTurnDebounce);
            this._pendingTurnDebounce = null;
        }
        this._accumulatedFinal = '';
    }

    // ─── Turn lifecycle ──────────────────────────────────────────────────

    async _startTurn(userMessage, { source }) {
        if (this.closed) return;
        const ac = new AbortController();
        const turn = {
            ac,
            userMessage,
            source,
            startedAt: Date.now(),
            status: 'thinking',
            spokenAcc: '',           // accumulating spoken portion forwarded to TTS
            mathBuffer: '',          // buffered <math>...</math> contents (math-steps mode)
            inMathTag: false,
            tagBuffer: '',           // straddle buffer for tag boundaries
            boardActions: [],        // accumulated [WRITE:...] etc. (board-actions mode)
            tts: null,
            spokenSent: '',          // already-sent-to-TTS spoken text
            tokensEmitted: 0,
            metric: metrics.newTurn(this.sessionId, this.userId, this.tutorProfile.id || 'default'),
        };
        turn.metric.t_user_speech_end = Date.now();
        this.currentTurn = turn;

        this._send({ type: 'turn_start', turnId: turn.metric.turnId, transcript: userMessage });
        this._setStatus('thinking');

        try {
            await this._driveTurn(turn);
        } catch (err) {
            if (turn.ac.signal.aborted) {
                // already handled by abortCurrentTurn
                return;
            }
            logger.error('turn error', { userId: this.userId, error: err.message, stack: err.stack });
            this._send({ type: 'turn_error', message: 'Something went wrong on this turn.' });
            turn.metric.abortReason = 'error';
        } finally {
            if (this.currentTurn === turn) {
                turn.metric.t_turn_end = Date.now();
                metrics.record(turn.metric);
                this.currentTurn = null;
                this._setStatus('idle');
                this._send({ type: 'turn_end', turnId: turn.metric.turnId, abortReason: turn.metric.abortReason });
            }
        }
    }

    async _driveTurn(turn) {
        // Orchestrated mode replaces token-streaming with a JSON-mode
        // call + segment orchestrator. Trades TTFA for segment-level
        // playback control. See _driveTurnOrchestrated for the flow.
        if (this.mode === 'orchestrated') {
            return this._driveTurnOrchestrated(turn);
        }

        // ── Build messages for LLM ──
        const modeInstructions = this.mode === 'board-actions'
            ? BOARD_ACTIONS_VOICE_INSTRUCTIONS
            : STREAMING_VOICE_INSTRUCTIONS;

        let systemContent = this.systemPrompt + modeInstructions;

        // board-actions mode: enrich prompt with current whiteboard state
        if (this.mode === 'board-actions' && this.boardContext) {
            const ctx = this.boardContext;
            let boardPrompt = '\n\n**WHITEBOARD STATE:**\n';
            if (ctx.semanticObjects && ctx.semanticObjects.length > 0) {
                boardPrompt += `Mode: ${ctx.mode || 'default'}\nCurrent objects:\n`;
                for (const obj of ctx.semanticObjects) {
                    boardPrompt += `- [${obj.id}] ${obj.type}: ${obj.content} (${obj.region || 'main'})\n`;
                }
            } else {
                boardPrompt += 'Board is empty.\n';
            }
            systemContent += boardPrompt;
        }

        const messages = [
            { role: 'system', content: systemContent },
            ...this.history,
            { role: 'user', content: turn.userMessage },
        ];

        // ── Open Cartesia synthesis context (reuses persistent pool) ──
        if (this.ttsPool) {
            turn.tts = this.ttsPool.synthesize({
                signal: turn.ac.signal,
                onChunk: (i16, sampleRate) => {
                    if (!turn.metric.t_first_audio_chunk) {
                        turn.metric.t_first_audio_chunk = Date.now();
                        if (turn.status === 'thinking') {
                            turn.status = 'speaking';
                            this._setStatus('speaking');
                        }
                    }
                    this._sendAudioChunk(i16, sampleRate, turn.metric.turnId);
                },
                onError: (err) => {
                    logger.warn('tts error', { userId: this.userId, error: err.message });
                },
            });
        }

        // ── Stream LLM ──
        let stream;
        try {
            stream = await callLLMStream(VOICE_MODEL, messages, {
                temperature: 0.45,
                max_tokens: 600,
                signal: turn.ac.signal,
            });
        } catch (err) {
            if (turn.ac.signal.aborted) return;
            throw err;
        }

        for await (const chunk of stream) {
            if (turn.ac.signal.aborted) return;
            const delta = chunk?.choices?.[0]?.delta?.content || '';
            if (!delta) continue;
            if (!turn.metric.t_first_llm_token) {
                turn.metric.t_first_llm_token = Date.now();
            }
            turn.tokensEmitted++;
            this._processToken(turn, delta);
        }

        // ── Finalize: flush remaining spoken (might be a partial-but-not-tag) ──
        if (!turn.inMathTag && turn.tagBuffer) {
            // tagBuffer holds chars that didn't form a tag opener — speak them
            this._forwardSpoken(turn, turn.tagBuffer);
            turn.tagBuffer = '';
        }
        if (turn.tts) turn.tts.finalize();

        // ── Pipeline verify on assembled spoken text in parallel with TTS draining ──
        let verifiedText = turn.spokenAcc;
        let mathStepsForBoard = this.mode === 'math-steps'
            ? this._parseMathBuffer(turn.mathBuffer)
            : [];
        let boardActionsForFinal = turn.boardActions || [];

        try {
            const verified = await pipelineVerify(turn.spokenAcc, {
                userId: this.userId,
                userMessage: turn.userMessage,
                iepReadingLevel: this.user.iepPlan?.readingLevel || null,
                firstName: this.user.firstName,
                isStreaming: false,
            });
            const flagged = (verified.flags || []).some(f =>
                f.startsWith('answer_giveaway') || f.startsWith('answer_key') || f.startsWith('upload_')
            );
            if (flagged && verified.text && verified.text !== turn.spokenAcc) {
                logger.warn('voice turn redirected by verify', {
                    userId: this.userId, flags: verified.flags
                });
                // Audio already streamed — abort current TTS, re-synthesize redirected text.
                if (turn.tts) turn.tts.abort();
                this._send({ type: 'tts_flush', turnId: turn.metric.turnId });
                verifiedText = verified.text;
                mathStepsForBoard = []; // drop board content alongside redirect
                boardActionsForFinal = []; // drop board actions alongside redirect
                await this._synthesizeOneShot(turn, verifiedText);
                turn.metric.abortReason = 'verify_redirect';
            } else if (verified.text) {
                verifiedText = verified.text;
            }
        } catch (err) {
            logger.warn('verify failed (using unverified)', { error: err.message });
        }

        // ── IEP reading-level enforcement (only if turn wasn't already redirected) ──
        if (this.user.iepPlan?.readingLevel && turn.metric.abortReason !== 'verify_redirect') {
            try {
                const check = checkReadingLevel(verifiedText, this.user.iepPlan.readingLevel);
                if (!check.passes) {
                    // Don't block streaming — flag for next turn's prompt to keep simpler.
                    logger.info('reading level flag', {
                        userId: this.userId,
                        responseGrade: check.responseGrade,
                        targetGrade: check.targetGrade,
                    });
                }
            } catch (_) { /* non-fatal */ }
        }

        // ── Send final response + math/board ──
        this._send({
            type: 'response_final',
            turnId: turn.metric.turnId,
            text: verifiedText,
            mathSteps: mathStepsForBoard,
            boardActions: boardActionsForFinal,
        });

        // Update local state for next turn's pedagogy (math-steps mode only)
        if (mathStepsForBoard.length > 0) this.lastBoardSteps = mathStepsForBoard;

        // ── Persist to history (do not block turn_end) ──
        // Store the spoken text only. Math steps live on the client board
        // and get serialized at end-session. Storing <math>JSON</math> in
        // the message content pollutes downstream chat tutor context.
        const assistantContent = verifiedText;
        this.history.push({ role: 'user', content: turn.userMessage });
        this.history.push({ role: 'assistant', content: assistantContent });
        if (this.history.length > HISTORY_DEPTH * 2) {
            this.history = this.history.slice(-HISTORY_DEPTH * 2);
        }
        this._persistTurn(turn.userMessage, assistantContent).catch(err => {
            logger.warn('persist failed', { error: err.message });
        });

        // Metrics accounting
        turn.metric.spokenChars = verifiedText.length;
        turn.metric.ttsChars = turn.tts ? turn.tts.charsSent() : 0;
        turn.metric.sttSecondsBilled = this.stt ? this.stt.billedSeconds : 0;
        turn.metric.llmOutputTokens = turn.tokensEmitted;
    }

    /**
     * Orchestrated turn: JSON-mode LLM call -> verify -> orchestrator
     * handleTurn with per-segment Cartesia synthesis. Same persistent
     * pool, same _sendAudioChunk path — orchestrator just adds segment
     * structure on top.
     */
    async _driveTurnOrchestrated(turn) {
        const ORCH_VOICE_INSTRUCTIONS = `

**VOICE TUTOR MODE — ACTIVE**

You are in a real-time spoken math tutoring session. Respond with a JSON
object in this exact shape:

{
  "spoken": "1-2 sentences, plain English, no LaTeX delimiters",
  "mathSteps": [{"label":"...","latex":"...","explanation":"..."}]
}

The "spoken" field is what the student hears. The "mathSteps" field is
the cumulative math board — include ONLY steps the student has worked
through. Don't spoil the next step. On wrong answers, repeat the prior
mathSteps unchanged (don't add the wrong step). For non-math turns,
include the most recent prior mathSteps (or [] if none yet).

Always include an "explanation" field on the most recent mathStep when
possible — the orchestrator uses it to answer mid-explanation
clarifications without a fresh pipeline pass.

Never speak math notation. Never include system tags. Always valid JSON.`;

        const messages = [
            { role: 'system', content: this.systemPrompt + ORCH_VOICE_INSTRUCTIONS },
            ...this.history,
            { role: 'user', content: turn.userMessage },
        ];

        // ── 1. JSON-mode LLM call (non-streaming) ──
        let parsed;
        try {
            const completion = await callLLM(VOICE_MODEL, messages, {
                temperature: 0.45,
                max_tokens: 600,
                response_format: { type: 'json_object' },
                signal: turn.ac.signal,
            });
            if (turn.ac.signal.aborted) return;
            turn.metric.t_first_llm_token = Date.now();
            const raw = completion.choices?.[0]?.message?.content || '{}';
            try { parsed = JSON.parse(raw); } catch (_) { parsed = {}; }
            turn.metric.llmOutputTokens = completion.usage?.completion_tokens || 0;
            turn.metric.llmInputTokens = completion.usage?.prompt_tokens || 0;
        } catch (err) {
            if (turn.ac.signal.aborted) return;
            throw err;
        }

        const spoken = (parsed.spoken || parsed.text || parsed.response || '').trim();
        const mathSteps = Array.isArray(parsed.mathSteps)
            ? parsed.mathSteps.filter(s => s && s.latex)
            : Array.isArray(parsed.math_steps)
              ? parsed.math_steps.filter(s => s && s.latex)
              : [];

        // ── 2. Pipeline verify (defense in depth) ──
        let verifiedSpoken = spoken;
        let verifiedSteps = mathSteps;
        try {
            const verified = await pipelineVerify(spoken, {
                userId: this.userId,
                userMessage: turn.userMessage,
                iepReadingLevel: this.user.iepPlan?.readingLevel || null,
                firstName: this.user.firstName,
                isStreaming: false,
            });
            const flagged = (verified.flags || []).some(f =>
                f.startsWith('answer_giveaway') || f.startsWith('answer_key') || f.startsWith('upload_')
            );
            if (flagged && verified.text && verified.text !== spoken) {
                verifiedSpoken = verified.text;
                verifiedSteps = []; // drop the board alongside the spoken redirect
                turn.metric.abortReason = 'verify_redirect';
            } else if (verified.text) {
                verifiedSpoken = verified.text;
            }
        } catch (err) {
            logger.warn('orch verify failed (using unverified)', { error: err.message });
        }

        // ── 3. Resolve current phase for phaseEnforcer ──
        let expectedPhase = null;
        let activeTarget = null;
        try {
            const plan = await loadOrCreatePlan(this.userId, { user: this.user });
            const resolved = await resolveCurrentTarget(plan, { user: this.user });
            expectedPhase = resolved?.plan?.currentTarget?.instructionPhase || null;
            activeTarget = resolved?.plan?.currentTarget || null;
        } catch (e) {
            logger.warn('orch tutorplan load failed (non-fatal)', { error: e.message });
        }

        // ── 4. Build a WS transport for the dispatcher ──
        // The dispatcher emits orchestrator frames as JSON WS messages.
        // The legacy client events (response_final, math_steps,
        // ai_speaking_started/ended) are still emitted alongside so older
        // clients keep working without changes.
        const wsTransport = {
            send: (frame) => this._send({ type: 'orch', ...frame }),
            end: () => { /* no-op — WS stays open across turns */ },
        };
        const session = orchestrator.sessionStore.getOrCreate(this.sessionId, this.userId);
        const dispatcher = new Dispatcher({ transport: wsTransport, session, user: this.user });

        // ── 5. Per-segment TTS hook — uses the persistent Cartesia pool ──
        const onSegmentTTS = (segment, signal) => new Promise((resolve) => {
            if (!this.ttsPool || !segment.spoken) { resolve(); return; }
            // First-audio-chunk telemetry maps to the LEGACY metric and
            // also feeds the orchestrator's interrupt_ack/substantive
            // split (caller sets t_stt_final upstream when STT finalizes).
            const ts = this.ttsPool.synthesize({
                signal,
                onChunk: (i16, sr) => {
                    if (!turn.metric.t_first_audio_chunk) {
                        turn.metric.t_first_audio_chunk = Date.now();
                        if (turn.status === 'thinking') {
                            turn.status = 'speaking';
                            this._setStatus('speaking');
                            this._send({ type: 'ai_speaking_started', turnId: turn.metric.turnId });
                        }
                    }
                    // Mark first ack/substantive audio for orchestrator metrics
                    if (turn.metric.t_stt_final && !turn.metric.t_first_substantive_audio) {
                        turn.metric.t_first_substantive_audio = Date.now();
                        if (!turn.metric.t_first_ack_audio) {
                            turn.metric.t_first_ack_audio = turn.metric.t_first_substantive_audio;
                        }
                    }
                    this._sendAudioChunk(i16, sr, turn.metric.turnId);
                },
                onDone: () => resolve(),
                onError: (err) => {
                    logger.warn('orch TTS chunk error', { error: err.message });
                    resolve();
                },
            });
            ts.appendText(segment.spoken);
            ts.finalize();
            // If the segment is aborted mid-stream, the synthesizer's
            // signal listener will close the Cartesia context and onDone
            // / onError will fire. Resolve eagerly on abort to unblock
            // the dispatcher loop.
            if (signal) {
                if (signal.aborted) resolve();
                else signal.addEventListener('abort', () => resolve(), { once: true });
            }
        });

        // ── 6. Hand off to orchestrator (drives per-segment Cartesia via onSegmentTTS) ──
        await orchestrator.handleTurn(
            { kind: 'voice', voiceJson: { spoken: verifiedSpoken, mathSteps: verifiedSteps } },
            { sessionId: this.sessionId, userId: this.userId, expectedPhase, activeTarget },
            dispatcher,
            { onSegmentTTS },
        );

        // ── 7. Legacy events for the existing client ──
        // The old voice-stream-client.js consumes these; orchestrator
        // frames coexist as type:'orch'.
        this._send({
            type: 'response_final',
            turnId: turn.metric.turnId,
            text: verifiedSpoken,
            mathSteps: verifiedSteps,
            boardActions: [],
        });
        if (verifiedSteps.length > 0) this.lastBoardSteps = verifiedSteps;

        // ── 8. Persist turn ──
        const assistantContent = verifiedSpoken
            + (verifiedSteps.length ? ` <math>${JSON.stringify(verifiedSteps)}</math>` : '');
        this.history.push({ role: 'user', content: turn.userMessage });
        this.history.push({ role: 'assistant', content: assistantContent });
        if (this.history.length > HISTORY_DEPTH * 2) {
            this.history = this.history.slice(-HISTORY_DEPTH * 2);
        }
        this._persistTurn(turn.userMessage, assistantContent).catch(err => {
            logger.warn('orch persist failed', { error: err.message });
        });

        turn.metric.spokenChars = verifiedSpoken.length;
        this._send({ type: 'ai_speaking_ended', turnId: turn.metric.turnId });
    }

    /**
     * Token processor — dispatches to the active mode's tag scanner.
     * Spoken portion streams to TTS; meta portion (math JSON or action
     * tags) is held back and parsed.
     */
    _processToken(turn, delta) {
        if (this.mode === 'board-actions') {
            this._processTokenBoardActions(turn, delta);
        } else {
            this._processTokenMathSteps(turn, delta);
        }
    }

    /**
     * Math-steps parser: <math>...</math> at the END of the response.
     * Forwards everything before <math> directly to TTS.
     */
    _processTokenMathSteps(turn, delta) {
        let working = turn.tagBuffer + delta;
        turn.tagBuffer = '';

        while (working.length > 0) {
            if (turn.inMathTag) {
                const closeIdx = working.indexOf('</math>');
                if (closeIdx === -1) {
                    turn.mathBuffer += working;
                    return;
                }
                turn.mathBuffer += working.slice(0, closeIdx);
                working = working.slice(closeIdx + '</math>'.length);
                turn.inMathTag = false;
                const steps = this._parseMathBuffer(turn.mathBuffer);
                if (steps.length) {
                    this._send({
                        type: 'math_steps_partial',
                        turnId: turn.metric.turnId,
                        mathSteps: steps,
                    });
                }
            } else {
                const openIdx = working.indexOf('<math>');
                if (openIdx === -1) {
                    // Tail might contain a partial '<math' — defer up to 6 chars.
                    const tail = working.slice(-6);
                    if (tail.includes('<') && '<math>'.startsWith(tail.slice(tail.indexOf('<')))) {
                        const safe = working.slice(0, working.length - (tail.length - tail.indexOf('<')));
                        const defer = working.slice(safe.length);
                        if (safe) this._forwardSpoken(turn, safe);
                        turn.tagBuffer = defer;
                        return;
                    }
                    this._forwardSpoken(turn, working);
                    return;
                }
                const safe = working.slice(0, openIdx);
                if (safe) this._forwardSpoken(turn, safe);
                working = working.slice(openIdx + '<math>'.length);
                turn.inMathTag = true;
            }
        }
    }

    /**
     * Board-actions parser: inline tags like [WRITE:...] [CIRCLE:...] can
     * appear ANYWHERE in the response. We hold back text from TTS until
     * we're sure it doesn't start a tag, then flush.
     */
    _processTokenBoardActions(turn, delta) {
        // Accumulate into a sliding buffer. Forward characters to TTS
        // greedily, but stop at any '[' until we know whether it's a
        // known action tag (closed by ']').
        let buf = turn.tagBuffer + delta;
        turn.tagBuffer = '';

        while (buf.length > 0) {
            const openIdx = buf.indexOf('[');
            if (openIdx === -1) {
                this._forwardSpoken(turn, buf);
                return;
            }
            // Speak everything before the '['
            if (openIdx > 0) {
                this._forwardSpoken(turn, buf.slice(0, openIdx));
                buf = buf.slice(openIdx);
            }
            // buf now starts with '['. Look for ']'.
            const closeIdx = buf.indexOf(']');
            if (closeIdx === -1) {
                // Tag still open — defer the rest. Cap at 500 chars to
                // protect against runaway buffers (an unmatched '[' in
                // free-form text). If too long, treat as plain text.
                if (buf.length > 500) {
                    this._forwardSpoken(turn, buf);
                    return;
                }
                turn.tagBuffer = buf;
                return;
            }
            const candidate = buf.slice(0, closeIdx + 1);
            buf = buf.slice(closeIdx + 1);

            if (this._isKnownActionTag(candidate)) {
                const action = this._parseActionTag(candidate);
                if (action) {
                    turn.boardActions = turn.boardActions || [];
                    turn.boardActions.push(action);
                    this._send({
                        type: 'board_actions_partial',
                        turnId: turn.metric.turnId,
                        boardActions: [action],
                    });
                }
                // Strip the tag from spoken stream (don't speak the bracket text)
            } else {
                // Not an action tag — speak it verbatim
                this._forwardSpoken(turn, candidate);
            }
        }
    }

    _isKnownActionTag(s) {
        return /^\[(?:WRITE|CIRCLE|ARROW|HIGHLIGHT|CLEAR|BOARD_REF)(?::[^\]]*)?\]$/.test(s);
    }

    _parseActionTag(s) {
        // s looks like "[WRITE:100,200,2x+5=10]" — strip brackets, split on first ':'.
        const inner = s.slice(1, -1);
        const colonIdx = inner.indexOf(':');
        const name = colonIdx === -1 ? inner : inner.slice(0, colonIdx);
        const args = colonIdx === -1 ? '' : inner.slice(colonIdx + 1);

        switch (name) {
            case 'WRITE': {
                const m = args.match(/^(\d+),(\d+),(.+)$/s);
                if (!m) return null;
                return { type: 'write', x: parseInt(m[1]), y: parseInt(m[2]), text: m[3].trim(), pause: true };
            }
            case 'CIRCLE': {
                const [objectId, ...msg] = args.split(',');
                if (!objectId) return null;
                return { type: 'circle', objectId: objectId.trim(), message: msg.join(',').trim() || null };
            }
            case 'ARROW': {
                const m = args.match(/^([^,]+),(\d+),(\d+)(?:,(.+))?$/s);
                if (!m) return null;
                return {
                    type: 'arrow', fromId: m[1].trim(),
                    toX: parseInt(m[2]), toY: parseInt(m[3]),
                    message: m[4] ? m[4].trim() : null,
                };
            }
            case 'HIGHLIGHT': {
                const [objectId, color] = args.split(',');
                if (!objectId) return null;
                return {
                    type: 'highlight', objectId: objectId.trim(),
                    color: color ? color.trim() : '#fbbf24',
                    duration: 3000,
                };
            }
            case 'CLEAR':
                return { type: 'clear' };
            case 'BOARD_REF':
                // Inline reference — keep the chat transcript reference but
                // don't trigger a board action. Return null so we strip it.
                return null;
            default:
                return null;
        }
    }

    _forwardSpoken(turn, text) {
        if (!text) return;
        turn.spokenAcc += text;
        // Emit a streamed-text event so client transcript renders incrementally
        this._send({
            type: 'response_delta',
            turnId: turn.metric.turnId,
            text,
        });
        // Push to TTS
        if (turn.tts) turn.tts.appendText(text);
    }

    _parseMathBuffer(buf) {
        if (!buf) return this.lastBoardSteps;
        const trimmed = buf.trim();
        if (!trimmed) return this.lastBoardSteps;
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return parsed.filter(s => s && s.latex);
            }
        } catch (_) {
            // Try common LLM JSON quirks
            try {
                const fixed = trimmed.replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"');
                const parsed = JSON.parse(fixed);
                if (Array.isArray(parsed)) return parsed.filter(s => s && s.latex);
            } catch (_) {
                logger.warn('math buffer parse failed', { snippet: trimmed.slice(0, 80) });
            }
        }
        return this.lastBoardSteps;
    }

    /**
     * One-shot synthesis of a verified text (used after a verify-redirect).
     * Reuses the persistent pool with a fresh context_id.
     */
    async _synthesizeOneShot(turn, text) {
        if (!this.ttsPool || !text) return;
        return new Promise((resolve) => {
            const ts = this.ttsPool.synthesize({
                signal: turn.ac.signal,
                onChunk: (i16, sampleRate) => {
                    this._sendAudioChunk(i16, sampleRate, turn.metric.turnId);
                },
                onDone: () => resolve(),
                onError: () => resolve(),
            });
            ts.appendText(text);
            ts.finalize();
        });
    }

    /**
     * Cancel current turn — fires LLM abort, closes Cartesia, preserves
     * spokenSoFar in history so the next turn isn't a restart.
     */
    _abortCurrentTurn(reason) {
        const turn = this.currentTurn;
        if (!turn) return;
        try { turn.ac.abort(reason); } catch (_) { /* node version variance */ }
        try { turn.tts?.abort(); } catch (_) { /* swallow */ }

        const spokenSoFar = turn.spokenAcc;
        if (spokenSoFar) {
            // Persist as an interrupted assistant turn — next prompt sees it
            this.history.push({ role: 'user', content: turn.userMessage });
            this.history.push({
                role: 'assistant',
                content: `${spokenSoFar} [INTERRUPTED]`,
            });
            this._persistTurn(turn.userMessage, `${spokenSoFar} [INTERRUPTED]`).catch(() => {});
        }

        turn.metric.abortReason = reason;
        turn.metric.t_interrupt_requested = Date.now();
        turn.metric.t_audio_silenced = Date.now();
        turn.metric.t_turn_end = Date.now();
        metrics.record(turn.metric);

        this._send({
            type: 'interrupted',
            turnId: turn.metric.turnId,
            reason,
            spokenSoFar,
        });

        this.currentTurn = null;
        this._setStatus('listening');
    }

    // ─── Outbound helpers ────────────────────────────────────────────────

    _setStatus(status) {
        this._send({ type: 'status', status });
    }

    _send(obj) {
        if (this.ws.readyState !== 1) return; // OPEN
        try { this.ws.send(JSON.stringify(obj)); } catch (_) { /* socket dead */ }
    }

    _sendAudioChunk(i16, sampleRate, turnId) {
        if (this.ws.readyState !== 1) return;
        // Frame protocol: [1 byte type=0x01][8 bytes turnId hash][2 bytes sr][N bytes pcm s16]
        // Simpler: send a small JSON header followed by binary frame is
        // multiple round-trips. Use a tagged binary buffer instead.
        const turnTag = Buffer.alloc(4);
        turnTag.writeUInt32BE(hash32(turnId), 0);
        const srBuf = Buffer.alloc(2);
        srBuf.writeUInt16BE(sampleRate, 0);
        const audioBuf = Buffer.from(i16.buffer, i16.byteOffset, i16.byteLength);
        const out = Buffer.concat([Buffer.from([0x01]), turnTag, srBuf, audioBuf]);
        try { this.ws.send(out, { binary: true }); } catch (_) { /* swallow */ }
    }

    async _persistTurn(userMessage, aiContent) {
        const messagesToPush = [];
        if (userMessage) messagesToPush.push({ role: 'user', content: userMessage.trim(), timestamp: new Date() });
        if (aiContent) messagesToPush.push({ role: 'assistant', content: aiContent.trim(), timestamp: new Date() });
        if (!messagesToPush.length) return;
        await Conversation.findOneAndUpdate(
            { userId: this.user._id },
            { $push: { messages: { $each: messagesToPush } }, $set: { updatedAt: new Date() } },
            { upsert: true }
        );
    }

    shutdown(reason = 'shutdown') {
        if (this.closed) return;
        this.closed = true;
        const registryKey = `${this.userId}:${this.mode}`;
        if (activeSessions.get(registryKey) === this) {
            activeSessions.delete(registryKey);
        }
        if (this._sttIdleTimer) {
            clearInterval(this._sttIdleTimer);
            this._sttIdleTimer = null;
        }
        if (this.currentTurn) this._abortCurrentTurn(reason);
        try { this.stt?.close(); } catch (_) {}
        try { this.ttsPool?.close(); } catch (_) {}
        try { this.ws.close(1000, reason); } catch (_) {}
    }
}

function hash32(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (h * 31 + str.charCodeAt(i)) >>> 0;
    }
    return h;
}

/**
 * Factory used by the upgrade handler. Returns a session that's already
 * begun loading user/history. Caller binds ws lifecycle.
 *
 * @param {Object} opts
 * @param {WebSocket} opts.ws
 * @param {Object} opts.user           - lean user doc
 * @param {string} [opts.sessionId]
 * @param {'math-steps'|'board-actions'} [opts.mode='math-steps']
 *        - 'math-steps' (default): immersive /voice-tutor.html flow.
 *          AI emits <math>JSON</math> at the end; client renders math board.
 *        - 'board-actions': chat-page orb. AI emits inline tags like
 *          [WRITE:x,y,text], [CIRCLE:id], etc. Client executes against whiteboard.
 */
async function createVoiceSession({ ws, user, sessionId, mode }) {
    const session = new VoiceSession({ ws, user, sessionId, mode });
    await session.init();
    return session;
}

module.exports = { createVoiceSession, VoiceSession };

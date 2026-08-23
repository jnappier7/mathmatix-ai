// utils/voiceSession.js
// Per-WebSocket orchestrator for the streaming voice tutor.
// Owns one Deepgram session, one Cartesia synthesizer per turn,
// one AbortController per turn. Coordinates STT → LLM → TTS with
// interrupt handling and per-turn metrics.

const TUTOR_CONFIG = require('./tutorConfig');
const { generateSystemPrompt } = require('./prompt');
const { callLLM, callLLMStream } = require('./llmGateway');
const { verify: pipelineVerify } = require('./pipeline');
const { checkReadingLevel } = require('./readability');
const { replaceDashes } = require('./dashNormalizer');
const { ensureBoardCarriesSpokenMath } = require('./voiceBoardGuard');
// Same visual tools and same streaming reassembly the text path uses
// (pipeline/generate.js) and the legacy voice route uses — one definition set,
// so a student gets the same diagrams whether they type or speak.
const { VISUAL_TOOLS, resolveToolCalls, describeTools } = require('./visualTools');
const { createToolCallAccumulator } = require('./toolCallStream');
// Voice board work joins the Live Workspace loop: the same translator the
// client renders with (UMD, requireable in node), folded into the same
// ledger chat writes, described to the model by the same board ghost.
const { voiceToBoardCommands } = require('../public/js/living-workspace/dom/voiceBoardTranslate');
const { applyTurnToLedger, promoteLeadingResolveToPose, dedupeCumulativeResolves } = require('./pipeline/boardLedger');
const { assistanceLevelForTurn } = require('./pipeline/assistanceLadder');
const { buildBoardStateBlock } = require('./pipeline/boardStateBlock');
const { loadActiveBoardLedger } = require('./activeConversation');
const sttStream = require('./sttStream');
const ttsStream = require('./ttsStream');
const ttsProvider = require('./ttsProvider');
const { speakMathInProse, createMathSpeechStreamFilter } = require('./mathTTS');
const metrics = require('./voiceMetrics');
const { classifyInterruption } = require('./voiceBackchannel');
const orchestrator = require('./orchestrator');
const { Dispatcher } = require('./orchestrator/dispatcher');
const { loadOrCreatePlan, resolveCurrentTarget } = require('./tutorPlanManager');
const { loadActiveHistory, appendToActiveConversation } = require('./activeConversation');
const logger = require('./logger').child({ module: 'voiceSession' });
const { meterAiSeconds, remainingAiSeconds } = require('./aiTimeMeter');
const { hasUnmeteredAiAccess } = require('../middleware/usageGate');

const VOICE_MODEL = process.env.VOICE_LLM_MODEL || 'gpt-4o-mini';

// Same gate as the text path and the legacy voice route, so visuals are on for
// the whole product or off for it — never diagrams by typing and none by speaking.
const VISUAL_TOOLS_ENABLED = process.env.ENABLE_VISUAL_TOOLS === 'true';
const HISTORY_DEPTH = 12;

// How often a live session charges its accrued seconds to the AI-minute pool.
// Metering only at hang-up (which is all this did while voice was premium-only)
// means a metered student can connect with seconds left and talk for an hour —
// nothing debits until they disconnect, and the gate only runs at connect.
// 30s bounds the overrun to well under a minute of free tutoring.
const METER_FLUSH_MS = Number(process.env.VOICE_METER_FLUSH_MS) || 30_000;
// Balance at which a live call gets its wrap-up warning, in seconds.
const METER_WARN_SECONDS = 120;

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

// ─── Barge-in policy ────────────────────────────────────────────────────
// The client ducks the tutor's audio the instant its local VAD hears the
// student, then waits for the server to say whether that was a real
// interruption. This is the "sorry, go ahead" beat a human tutor takes:
// the student always gets an immediate audible response to speaking, but
// the explanation is only *destroyed* once we know they meant to take
// the floor.
//
// If no transcript resolves the duck within this window, it was room
// noise or a cough — tell the client to come back up. Long enough for
// Deepgram to land a partial, short enough that a real pause doesn't
// sound like a dropout.
const BARGE_DUCK_RESOLVE_MS = 900;

// ─── Endpointing ────────────────────────────────────────────────────────
// How long a student may pause before we treat them as finished. Math
// students pause mid-thought far more than chatters do ("so x equals...
// uh... four"), so this trades cut-offs against dead air and is worth
// tuning against real calls rather than guessing — hence the env override.
// 300ms is Deepgram's own default and errs toward responsiveness; the
// backchannel classifier and barge-in duck make an early cut cheap to
// recover from, which is what lets us sit at the fast end.
const STT_ENDPOINTING_MS = Number(process.env.VOICE_ENDPOINTING_MS) || 300;
// UtteranceEnd is now only the fallback for when endpointing never fires,
// so its floor costs nothing on the common path. Deepgram rejects <1000.
const STT_UTTERANCE_END_MS = Math.max(1000, Number(process.env.VOICE_UTTERANCE_END_MS) || 1000);

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
If your spoken sentence names a specific equation or expression, that same
math MUST appear in the math array THIS turn — voice mode has no transcript,
so anything not on the board is lost the moment you finish saying it.
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
If your spoken sentence names a specific equation or expression, WRITE that
same math on the board THIS turn — voice mode has no transcript, so anything
not on the board is lost the moment you finish saying it.
`;

class VoiceSession {
    constructor({ ws, user, sessionId, mode, loginSessionId }) {
        this.ws = ws;
        this.user = user;                       // populated user doc (lean)
        this.userId = String(user._id);
        // The sign-in this socket was opened under, read off the upgrade
        // request's express session. Carried so voice turns land in a
        // conversation stamped with the CURRENT login — a voice session opened
        // straight after a re-login must not append to the previous login's
        // transcript. Null when unavailable, which simply skips the check:
        // voice must never be the path that ends a session (rule 1).
        this.loginSessionId = loginSessionId || null;
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

        // AI-minute metering (see _flushMeter). _meteredSeconds is what has
        // already been charged, so every flush bills only the delta and
        // shutdown's final flush can't double-charge.
        this._meteredSeconds = 0;
        this._meterTimer = null;
        this._unmetered = true;   // assume unmetered until init() resolves it
        this._lowBalanceWarned = false;

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

        // Does the AI-minute pool apply to this student? Resolved once per
        // session (it involves a school-license / linked-parent lookup) and then
        // re-read from the cheap in-memory balance on every flush.
        try {
            this._unmetered = await hasUnmeteredAiAccess(this.user);
        } catch (err) {
            // Never let a metering lookup cost a student their session — the
            // upgrade handler already decided they may be here.
            this._unmetered = true;
            logger.warn('voice metered-status check failed; treating as unmetered', {
                userId: this.userId, error: err.message,
            });
        }
        this._startMeter();

        this.systemPrompt = await generateSystemPrompt(this.user, this.tutorProfile);

        // Load recent conversation for context from the SAME active conversation
        // chat uses (user.activeConversationId), so a student who was just typing
        // continues seamlessly into voice.
        this.history = await loadActiveHistory(this.user, HISTORY_DEPTH);

        // Seed the board ledger from the active conversation so voice continues
        // the SAME board chat built (and vice versa). Never fatal — a voice
        // session must start even if the ledger read hiccups.
        try { this.boardLedger = await loadActiveBoardLedger(this.user); }
        catch (err) { this.boardLedger = null; logger.warn('board ledger seed failed', { error: err.message }); }

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
                // The client's VAD heard *something* over the tutor and has
                // already ducked its own playback. It cannot tell speech from
                // a chair scrape, so this is a question, not an order: hold
                // the turn open and let the transcript decide. _onPartial
                // hard-stops on real speech; the watchdog un-ducks on noise.
                this._openBargeDuck();
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
        // Flush the prior (idle-closed) STT session's billed seconds before we
        // replace it — createSession() starts a fresh billedSeconds=0 closure,
        // so reading it only at shutdown would lose pre-reopen usage.
        if (this.stt) {
            this._sttBilledTotal = (this._sttBilledTotal || 0) + (this.stt.billedSeconds || 0);
        }
        this._lastSttActivity = Date.now();
        this.stt = sttStream.createSession({
            language: this.langCode,
            sampleRate: 16000,
            endpointing: STT_ENDPOINTING_MS,
            utteranceEndMs: STT_UTTERANCE_END_MS,
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

    _onPartial(text, confidence) {
        this._lastPartialAt = Date.now();
        // Partials on the student channel while the tutor speaks are how a
        // barge-in gets *confirmed* — the client's VAD only knows that the
        // room got loud, this is the first look at what was actually said.
        // It also stands alone as the server-side detector when the client
        // missed the local VAD trigger entirely.
        if (this.currentTurn && this.currentTurn.status === 'speaking') {
            const verdict = classifyInterruption(text);
            if (verdict.isBackchannel) {
                // "mm-hm" / "yeah" / "okay" — the student is nodding along.
                // Killing the explanation here is the single biggest source
                // of voice friction, so keep talking and lift the duck the
                // client applied on its local VAD.
                this._resolveBargeDuck('backchannel');
            } else {
                this._abortCurrentTurn('user_barge_in_server_detected');
            }
        }
        // Confidence rides along so the client can decline to display
        // low-confidence guesses (Whisper fallback sends none — omit).
        const msg = { type: 'transcript_partial', text };
        if (typeof confidence === 'number') msg.confidence = confidence;
        this._send(msg);
    }

    _accumulatedFinal = '';
    _onFinal(text, confidence, speechFinal) {
        // Concatenate "is_final" segments — Deepgram emits multiple finals
        // per utterance (one per phrase). The last one carries speech_final.
        this._accumulatedFinal = this._accumulatedFinal
            ? `${this._accumulatedFinal} ${text}`
            : text;
        const msg = { type: 'transcript_final_segment', text };
        if (typeof confidence === 'number') msg.confidence = confidence;
        this._send(msg);

        // Deepgram has decided the student stopped talking. Answer NOW rather
        // than waiting for UtteranceEnd, whose 1000ms floor made every turn
        // sit through a second of silence before the tutor even began
        // thinking. This is the single largest slice of "it takes too long to
        // respond", and it is pure dead air — no work was happening in it.
        if (speechFinal) this._commitUtterance('speech_final');
    }

    // UtteranceEnd is the safety net, not the trigger: it catches the
    // utterance whose endpointing verdict never arrived (trailing room noise
    // keeps speech_final from firing). When speech_final already committed,
    // the accumulator is empty and this is a no-op.
    _onUtteranceEnd() {
        this._commitUtterance('utterance_end');
    }

    /**
     * Turn the accumulated final segments into a student turn.
     *
     * Reached from two places on purpose — speech_final (fast path, the common
     * case) and UtteranceEnd (fallback). Whichever arrives first drains the
     * accumulator, so the other finds nothing and returns.
     */
    _commitUtterance(reason) {
        const utterance = this._accumulatedFinal.trim();
        this._accumulatedFinal = '';
        if (!utterance) return;

        // A backchannel spoken *over* the tutor is not a turn. Answering
        // "mm-hm" restarts the explanation the student was agreeing with,
        // which is how a nod used to cost them the rest of the sentence.
        // Swallow it and keep speaking. (Once the tutor has finished, the
        // same word IS a turn — "okay" then means "I'm ready", so this
        // only applies while a turn is live.)
        if (this.currentTurn && classifyInterruption(utterance).isBackchannel) {
            this._resolveBargeDuck('backchannel_utterance');
            logger.debug('backchannel swallowed', { userId: this.userId, utterance });
            return;
        }

        // If a turn is already in flight (LLM/TTS), a new user utterance
        // is itself a barge-in.
        if (this.currentTurn) {
            this._abortCurrentTurn('user_barge_in');
        }
        // The student stopped talking NOW. Stamping it here rather than at
        // _startTurn is what makes the latency metric honest: it used to be
        // taken after the endpointing wait, so a turn that kept the student
        // sitting in silence for a second still reported a fast ttfa.
        this._speechEndedAt = Date.now();

        this._send({ type: 'transcript_final', text: utterance });
        this._startTurn(utterance, { source: 'voice', endpointReason: reason });
    }

    // ─── Barge-in duck lifecycle ─────────────────────────────────────────
    // A "duck" is the client holding the tutor's audio at low gain while
    // the server works out whether the student meant to interrupt. Exactly
    // one of _resolveBargeDuck (keep talking) or _abortCurrentTurn (stop)
    // ends it; the watchdog guarantees one of them runs, so the tutor can
    // never be left permanently quiet but still streaming.

    _openBargeDuck() {
        if (!this.currentTurn) {
            // Nothing to duck — the turn already ended between the client's
            // VAD firing and this message landing. Tell the client to come
            // back up so the next turn isn't born at 15% volume.
            this._send({ type: 'resume_speaking', reason: 'no_active_turn' });
            return;
        }
        if (this._bargeDuckTimer) return;   // already pending a verdict
        this._bargeDuckTimer = setTimeout(() => {
            this._bargeDuckTimer = null;
            // No transcript resolved this duck in time — nobody actually
            // spoke. Lift it rather than stranding the student in a tutor
            // that has gone mysteriously quiet mid-sentence.
            if (this.currentTurn) this._resolveBargeDuck('no_speech_detected');
        }, BARGE_DUCK_RESOLVE_MS);
        this._bargeDuckTimer.unref?.();
    }

    _clearBargeDuckTimer() {
        if (this._bargeDuckTimer) {
            clearTimeout(this._bargeDuckTimer);
            this._bargeDuckTimer = null;
        }
    }

    /** Verdict: not an interruption — bring the tutor back up to full volume. */
    _resolveBargeDuck(reason) {
        this._clearBargeDuckTimer();
        this._send({ type: 'resume_speaking', reason });
    }

    _cancelPendingDebounce() {
        if (this._pendingTurnDebounce) {
            clearTimeout(this._pendingTurnDebounce);
            this._pendingTurnDebounce = null;
        }
        this._accumulatedFinal = '';
    }

    // ─── Turn lifecycle ──────────────────────────────────────────────────

    async _startTurn(userMessage, { source, endpointReason }) {
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
            // Math-speech normalization for the TTS stream only (the visual
            // transcript keeps the written form): "=" → "equals", "ax" → "a x".
            speechFilter: createMathSpeechStreamFilter(),
            tokensEmitted: 0,
            metric: metrics.newTurn(this.sessionId, this.userId, this.tutorProfile.id || 'default'),
        };
        // Measure from when the student actually stopped speaking, not from
        // when we got around to starting the turn — otherwise endpointing
        // delay is invisible in ttfa and the numbers look good while the
        // student waits. _speechEndedAt is unset for typed input, where
        // "now" genuinely is the start.
        turn.metric.t_user_speech_end = this._speechEndedAt || Date.now();
        turn.metric.endpointReason = endpointReason || source;
        this._speechEndedAt = null;
        turn.audioTag = hash32(turn.metric.turnId);
        this.currentTurn = turn;

        // A duck belonging to the turn we just replaced must not outlive it,
        // or the new turn speaks at 15% volume until its watchdog fires.
        this._clearBargeDuckTimer();

        // audioTag is the same 32-bit value stamped into every binary audio
        // frame for this turn (see _sendAudioChunk). The client accepts PCM
        // only while it matches, which is what stops frames that were
        // already in flight when the last turn died from playing underneath
        // this one — the "two tutors at once" symptom.
        this._send({
            type: 'turn_start',
            turnId: turn.metric.turnId,
            audioTag: turn.audioTag,
            transcript: userMessage,
        });
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
                // LLM contribution to voice cost = latency from first token to
                // first audio chunk (the part NOT overlapped by TTS playback,
                // which is metered separately via _ttsSamples).
                if (turn.metric.t_first_llm_token && turn.metric.t_first_audio_chunk) {
                    this._llmLatencyMs = (this._llmLatencyMs || 0) +
                        Math.max(0, turn.metric.t_first_audio_chunk - turn.metric.t_first_llm_token);
                }
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

        // Visual tools are structured function calls, not tags. Without this the
        // model knows only the [WRITE:]/[CIRCLE:] vocabulary — all text and
        // annotation — and will DESCRIBE a diagram it has no way to draw.
        if (VISUAL_TOOLS_ENABLED) {
            systemContent += `\n\n${describeTools()}\n`
                + '- When a concept is easier seen than said (a solid, a graph, a number line), CALL THE TOOL.\n'
                + '- Never claim to have shown something you did not.\n';
        }

        // Board awareness (same ghost chat uses): what the student's board
        // shows RIGHT NOW, so the voice tutor references lines instead of
        // re-deriving them. Empty board contributes zero tokens.
        try {
            const boardBlock = buildBoardStateBlock(this.boardLedger);
            if (boardBlock) systemContent += '\n\n' + boardBlock;
        } catch (_) { /* non-fatal */ }

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
        const streamOptions = {
            temperature: 0.45,
            max_tokens: 600,
            signal: turn.ac.signal,
        };
        if (VISUAL_TOOLS_ENABLED) {
            streamOptions.tools = VISUAL_TOOLS;
            streamOptions.parallel_tool_calls = true;
        }

        let stream;
        try {
            stream = await callLLMStream(VOICE_MODEL, messages, streamOptions);
        } catch (err) {
            if (turn.ac.signal.aborted) return;
            throw err;
        }

        // Tool calls arrive as fragments interleaved with the spoken text, and
        // carry no content of their own — so they are accumulated here and
        // resolved once the stream closes. Nothing about the TTS feed changes:
        // a tool-call delta simply has no text to forward, exactly like any
        // other contentless delta the loop already skips.
        const toolCallAccumulator = createToolCallAccumulator();

        for await (const chunk of stream) {
            if (turn.ac.signal.aborted) return;
            const deltaObj = chunk?.choices?.[0]?.delta || {};
            toolCallAccumulator.push(deltaObj);
            const delta = deltaObj.content || '';
            if (!delta) continue;
            if (!turn.metric.t_first_llm_token) {
                turn.metric.t_first_llm_token = Date.now();
            }
            turn.tokensEmitted++;
            this._processToken(turn, delta);
        }

        // ── Visual tool calls ──────────────────────────────────────────────
        // Resolved before TTS is finalized, because a turn that called a tool
        // and said nothing would otherwise close the synthesizer on an empty
        // buffer — the student watches a diagram appear in total silence. The
        // narration is pushed through _processToken so it runs the same math-
        // speech and tag filters as streamed text.
        let visualTags = [];
        let visualCommands = null;
        const toolCalls = VISUAL_TOOLS_ENABLED ? toolCallAccumulator.toolCalls() : [];
        if (toolCalls.length) {
            try {
                const resolved = resolveToolCalls(toolCalls);
                visualTags = resolved?.tags || [];
                visualCommands = resolved?.visualCommands || null;
                if (resolved?.unknown?.length) {
                    logger.warn('voice: unknown visual tools requested', {
                        userId: this.userId, unknown: resolved.unknown,
                    });
                }
            } catch (err) {
                // A bad tool payload must never cost the student their turn.
                logger.warn('voice: visual tool resolution failed', {
                    userId: this.userId, error: err.message,
                });
            }

            if (!turn.spokenAcc.trim() && !turn.ac.signal.aborted) {
                try {
                    const narration = await callLLM(VOICE_MODEL, [
                        ...messages,
                        { role: 'assistant', content: null, tool_calls: toolCalls },
                        ...toolCalls.map((call) => ({
                            role: 'tool',
                            tool_call_id: call.id,
                            content: 'displayed',
                        })),
                    ], { temperature: 0.45, max_tokens: 300, signal: turn.ac.signal });
                    const narrationText = (narration.choices?.[0]?.message?.content || '').trim();
                    if (narrationText) this._processToken(turn, narrationText);
                } catch (err) {
                    if (!turn.ac.signal.aborted) {
                        logger.warn('voice: tool narration failed', {
                            userId: this.userId, error: err.message,
                        });
                    }
                }
            }
        }

        // ── Finalize: flush remaining spoken (might be a partial-but-not-tag) ──
        if (!turn.inMathTag && turn.tagBuffer) {
            // tagBuffer holds chars that didn't form a tag opener — speak them
            this._forwardSpoken(turn, turn.tagBuffer);
            turn.tagBuffer = '';
        }
        if (turn.tts) {
            // Drain the math-speech filter's held-back tail before closing.
            const tail = turn.speechFilter ? turn.speechFilter.flush() : '';
            if (tail) turn.tts.appendText(tail);
            turn.tts.finalize();
        }

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
                // Visuals leak an answer exactly as board content does — a graph
                // of the solved equation gives it away as surely as writing it.
                visualTags = [];
                visualCommands = null;
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

        // ── "Voice explains, board shows" guard ──
        // Captions are ephemeral: any math the tutor said aloud must survive
        // on the board. If the model spoke symbolic math but shipped no board
        // output, mirror the spoken math as synthesized steps. Skipped on
        // verify-redirects (those deliberately drop board content).
        if (turn.metric.abortReason !== 'verify_redirect') {
            try {
                const guard = ensureBoardCarriesSpokenMath(
                    verifiedText, mathStepsForBoard, boardActionsForFinal
                );
                if (guard.mirrored.length) {
                    mathStepsForBoard = guard.mathSteps;
                    logger.info('voice board guard mirrored spoken math', {
                        userId: this.userId, mode: this.mode, lines: guard.mirrored,
                    });
                }
            } catch (err) {
                logger.warn('voice board guard failed (non-fatal)', { error: err.message });
            }
        }

        // ── Send final response + math/board ──
        // A barge-in during the verify await above kills this turn without
        // the stream loop ever seeing it — the loop already finished. Without
        // this guard the dead turn still ships its full cumulative board,
        // landing on top of the turn that replaced it. _abortCurrentTurn has
        // already flushed whatever this turn legitimately delivered.
        if (turn.ac.signal.aborted) return;

        this._send({
            type: 'response_final',
            turnId: turn.metric.turnId,
            // Inline renderers read the tags out of the text, so they ride along
            // with it. They are appended AFTER verify (which reasons about prose)
            // and after the spoken text was already synthesized, so nothing here
            // can reach TTS.
            text: visualTags.length
                ? [verifiedText, ...visualTags].filter(Boolean).join('\n\n')
                : verifiedText,
            mathSteps: mathStepsForBoard,
            boardActions: boardActionsForFinal,
            // Images render ONLY through this channel — [SEARCH_IMAGE:] has no
            // inline renderer and stripVisualTags.js exists to delete it.
            visualCommands: visualCommands,
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
        // Fold this turn's board output into the shared ledger (Live Workspace):
        // the same translation the client renders is what gets remembered, so a
        // voice session's board survives reloads exactly like a typed one.
        try {
            let cmds = voiceToBoardCommands({ mathSteps: mathStepsForBoard, boardActions: boardActionsForFinal });
            cmds = promoteLeadingResolveToPose(this.boardLedger, cmds);
            // Voice's protocol is cumulative (full board re-sent each turn) —
            // only genuinely new lines may fold, or steps duplicate every turn.
            cmds = dedupeCumulativeResolves(this.boardLedger, cmds);
            if (cmds.length) {
                this.boardLedger = applyTurnToLedger(this.boardLedger, cmds, new Date(), {
                    assistance: assistanceLevelForTurn({ boardCommands: cmds }),
                });
            }
        } catch (err) {
            logger.warn('voice board ledger fold failed (non-fatal)', { error: err.message });
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

If "spoken" names a specific equation or expression, that same math MUST
appear in "mathSteps" THIS turn — voice mode has no transcript, so anything
not on the board is lost the moment it's said.

Never speak math notation. Never include system tags. Always valid JSON.`;

        const messages = [
            { role: 'system', content: this.systemPrompt + ORCH_VOICE_INSTRUCTIONS + this._boardGhost() },
            ...this.history,
            { role: 'user', content: turn.userMessage },
        ];

        // ── 1. JSON-mode LLM call (non-streaming) ──
        // No visual tools here, and not by oversight: tools and response_format
        // are mutually exclusive, and this mode's entire protocol is the JSON
        // envelope parsed below. Giving it visuals means moving it off JSON mode
        // onto tool calls wholesale — a protocol change, not a flag. The other
        // three paths (text, streaming voice, legacy voice) all share VISUAL_TOOLS.
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
        const isUsableStep = (s) => s && (s.latex || s.visual || s.text);
        const mathSteps = Array.isArray(parsed.mathSteps)
            ? parsed.mathSteps.filter(isUsableStep)
            : Array.isArray(parsed.math_steps)
              ? parsed.math_steps.filter(isUsableStep)
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

        // ── "Voice explains, board shows" guard (same rule as _driveTurn) ──
        // Placed before the orchestrator handoff so the mirrored steps reach
        // both the orchestrator's voiceJson and the legacy response_final.
        if (turn.metric.abortReason !== 'verify_redirect') {
            try {
                const guard = ensureBoardCarriesSpokenMath(verifiedSpoken, verifiedSteps, []);
                if (guard.mirrored.length) {
                    verifiedSteps = guard.mathSteps;
                    logger.info('voice board guard mirrored spoken math', {
                        userId: this.userId, mode: this.mode, lines: guard.mirrored,
                    });
                }
            } catch (err) {
                logger.warn('voice board guard failed (non-fatal)', { error: err.message });
            }
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
            ts.appendText(speakMathInProse(segment.spoken));
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
        // frames coexist as type:'orch'. Same guard as the streaming path:
        // an interrupted turn must not deliver a final on top of its
        // replacement.
        if (turn.ac.signal.aborted) return;

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
        // Strip any [UPPERCASE_TAG:...] directives that leaked from the
        // model into the spoken stream. Voice mode uses `mathSteps` for
        // visuals — these tags belong on the board, not in speech or the
        // transcript bubble. Best-effort per-chunk; the client also
        // re-scrubs the accumulated text, so tags split across deltas
        // are caught when the closing ']' arrives.
        text = this._stripVisualDirectives(text);
        if (!text) return;
        // Em dash reads as a minus in speech ("that's right minus 7"); swap
        // for a comma pause. En dashes / hyphens (real subtraction and
        // negatives) are left alone.
        text = replaceDashes(text);
        turn.spokenAcc += text;
        // Emit a streamed-text event so client transcript renders incrementally
        this._send({
            type: 'response_delta',
            turnId: turn.metric.turnId,
            text,
        });
        // Push to TTS through the math-speech filter — the transcript above
        // keeps "2x + 4 = 20"; the audio says "2x plus 4 equals 20" instead
        // of "equal sign", and "ax + b" stops being pronounced "axe".
        if (turn.tts) {
            const ttsText = turn.speechFilter ? turn.speechFilter.push(text) : text;
            if (ttsText) turn.tts.appendText(ttsText);
        }
    }

    _stripVisualDirectives(text) {
        if (!text) return '';
        let out = '';
        let i = 0;
        while (i < text.length) {
            if (text[i] === '[' && i + 1 < text.length && /[A-Z]/.test(text[i + 1])) {
                let depth = 1;
                let j = i + 1;
                while (j < text.length && depth > 0) {
                    if (text[j] === '[') depth++;
                    else if (text[j] === ']') depth--;
                    j++;
                }
                if (depth === 0) { i = j; continue; }
            }
            out += text[i];
            i++;
        }
        return out;
    }

    _parseMathBuffer(buf) {
        if (!buf) return this.lastBoardSteps;
        const trimmed = buf.trim();
        if (!trimmed) return this.lastBoardSteps;
        const isUsableStep = (s) => s && (s.latex || s.visual || s.text);
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return parsed.filter(isUsableStep);
            }
        } catch (_) {
            // Try common LLM JSON quirks
            try {
                const fixed = trimmed.replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"');
                const parsed = JSON.parse(fixed);
                if (Array.isArray(parsed)) return parsed.filter(isUsableStep);
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
            ts.appendText(speakMathInProse(text));
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
        this._clearBargeDuckTimer();
        try { turn.ac.abort(reason); } catch (_) { /* node version variance */ }
        try { turn.tts?.abort(); } catch (_) { /* swallow */ }

        // Orchestrated mode runs its segment loop off the orchestrator's OWN
        // AbortController, not turn.ac. Without this the dispatcher keeps
        // walking the killed turn's segments — synthesizing and streaming
        // them while the replacement turn starts — which is the server half
        // of "the interrupt starts a new response on top of the old one".
        try {
            const orchSession = orchestrator.sessionStore.get(this.sessionId);
            if (orchSession) orchSession.abortTurn(reason);
        } catch (err) {
            logger.warn('orchestrator abort failed (non-fatal)', { error: err.message });
        }

        // Everything this turn already put on the board was streamed to the
        // client as partials and is sitting there half-owned: Live Workspace
        // defers rendering to response_final, which an aborted turn never
        // reaches. Send one so the work the tutor was talking about survives
        // being interrupted, along with the words they got out. Only content
        // already delivered goes in — no unverified visualCommands, so the
        // answer-leak guard in the verify stage still holds.
        this._sendInterruptedFinal(turn);

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
            audioTag: turn.audioTag,
            reason,
            spokenSoFar,
        });

        this.currentTurn = null;
        this._setStatus('listening');
    }

    /**
     * Flush an interrupted turn's already-delivered board work to the client
     * as a terminal response_final, so the transcript keeps what the tutor
     * actually said and the board keeps what it actually drew.
     *
     * Carries ONLY content that already crossed the wire as a partial this
     * turn — never visualCommands, which are resolved after the verify stage
     * precisely so an answer-leaking diagram can be dropped.
     */
    _sendInterruptedFinal(turn) {
        try {
            const mathSteps = this.mode === 'math-steps'
                ? this._parseMathBuffer(turn.mathBuffer)
                : [];
            const boardActions = turn.boardActions || [];
            const spoken = (turn.spokenAcc || '').trim();
            if (!spoken && !mathSteps.length && !boardActions.length) return;
            this._send({
                type: 'response_final',
                turnId: turn.metric.turnId,
                text: spoken,
                mathSteps,
                boardActions,
                visualCommands: null,
                interrupted: true,
            });
        } catch (err) {
            logger.warn('interrupted final flush failed (non-fatal)', { error: err.message });
        }
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
        // Meter synthesized playback duration (= samples / sampleRate). Accumulate
        // BEFORE the readyState guard: Cartesia already billed for this audio even
        // if the client socket has gone away.
        this._ttsSamples = (this._ttsSamples || 0) + i16.length;
        this._ttsSampleRate = sampleRate;
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
        // Persist to the SAME active conversation chat uses so the turn shows up
        // when the student switches back to text. resolveActiveConversationId
        // (inside the helper) also updates this.user.activeConversationId in
        // place, so a long-lived session keeps targeting the right document.
        // The board ledger rides along so the voice session's board persists.
        await appendToActiveConversation(this.user, [
            { role: 'user', content: userMessage },
            { role: 'assistant', content: aiContent },
        ], {
            ...(this.boardLedger ? { boardLedger: this.boardLedger } : {}),
            loginSessionId: this.loginSessionId,
        });
    }

    // The board ghost for prompt assembly — one guarded call site for the
    // orchestrated path (the streaming path inlines the same block).
    _boardGhost() {
        try {
            const block = buildBoardStateBlock(this.boardLedger);
            return block ? '\n\n' + block : '';
        } catch (_) { return ''; }
    }

    // ─── AI-minute metering ──────────────────────────────────────────────
    //
    // Voice is the only path that stacks three paid vendors, so usage is
    // cost-accurate rather than wall-clock: Deepgram STT input + Cartesia
    // playback + LLM latency, all charged to the same monthly pool text
    // tutoring spends (utils/aiTimeMeter.js).

    /** Total seconds this session has accrued so far, charged or not. */
    _accruedSeconds() {
        const sttSeconds = (this._sttBilledTotal || 0) + (this.stt?.billedSeconds || 0);
        const ttsSeconds = this._ttsSampleRate ? (this._ttsSamples || 0) / this._ttsSampleRate : 0;
        const llmSeconds = (this._llmLatencyMs || 0) / 1000;
        return sttSeconds + ttsSeconds + llmSeconds;
    }

    _startMeter() {
        if (this._meterTimer || this._unmetered) return;
        this._meterTimer = setInterval(() => {
            this._flushMeter().catch(err =>
                logger.warn('voice meter flush failed', { userId: this.userId, error: err.message }));
        }, METER_FLUSH_MS);
        // Don't hold the process open on this timer during shutdown.
        if (typeof this._meterTimer.unref === 'function') this._meterTimer.unref();
    }

    /**
     * Charge everything accrued since the last flush, then act on the balance:
     * warn once as it gets low, hang up when it's gone.
     *
     * @param {Object} [opts]
     * @param {boolean} [opts.final] - final flush from shutdown(); charge but
     *        never try to end an already-ending session.
     */
    async _flushMeter({ final = false } = {}) {
        const accrued = this._accruedSeconds();
        const delta = accrued - this._meteredSeconds;
        if (delta < 1 && !final) return;

        let remaining;
        if (delta >= 1) {
            this._meteredSeconds = accrued;
            const charge = await meterAiSeconds(this.user, delta);
            remaining = charge.remainingSeconds;
            logger.info('voice usage metered', {
                userId: this.userId,
                billedSeconds: charge.billedSeconds,
                sessionSeconds: Math.round(accrued),
                remainingSeconds: Math.round(remaining),
                final,
            });
        } else {
            remaining = remainingAiSeconds(this.user);
        }

        // Unmetered students (school license, unlimited, staff) are still
        // charged above — totalAISeconds is cost analytics for everyone — but
        // nothing enforces against them.
        if (final || this._unmetered) return;

        if (remaining <= 0) {
            // Out of minutes mid-call. Say so before hanging up — a socket that
            // just dies reads as a bug, not a limit.
            this._send({
                type: 'quota_exhausted',
                message: "That's all your AI minutes for this month! Your minutes reset soon — you can keep going with Mathmatix+.",
                upgradeRequired: true,
            });
            logger.info('voice session ended: AI minutes exhausted', {
                userId: this.userId, sessionSeconds: Math.round(accrued),
            });
            // Let the message reach the client before the socket closes.
            setTimeout(() => this.shutdown('quota_exhausted'), 250);
            return;
        }

        if (remaining <= METER_WARN_SECONDS && !this._lowBalanceWarned) {
            this._lowBalanceWarned = true;
            this._send({
                type: 'quota_low',
                secondsRemaining: Math.round(remaining),
                message: `About ${Math.max(1, Math.round(remaining / 60))} minute${remaining >= 90 ? 's' : ''} of AI time left this month.`,
            });
        }
    }

    shutdown(reason = 'shutdown') {
        if (this.closed) return;
        this.closed = true;

        if (this._meterTimer) {
            clearInterval(this._meterTimer);
            this._meterTimer = null;
        }
        // Final charge for whatever accrued since the last flush. Fire-and-forget
        // by design: shutdown is synchronous and runs on socket close.
        this._flushMeter({ final: true }).catch(err =>
            logger.warn('voice metering error', { userId: this.userId, error: err.message }));

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
async function createVoiceSession({ ws, user, sessionId, mode, loginSessionId }) {
    const session = new VoiceSession({ ws, user, sessionId, mode, loginSessionId });
    await session.init();
    return session;
}

module.exports = { createVoiceSession, VoiceSession };
